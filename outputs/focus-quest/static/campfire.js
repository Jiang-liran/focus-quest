(function(root){
  'use strict';
  const topics={relax:'歇一会儿',story:'听段见闻',advice:'聊聊学习'};
  const storageKey='focus-quest-campfire-v1';
  let data=null,ready=false,character='hearth',topic='relax',line=null,recent=[],outfit=null;
  let equipment={},equipmentStamp=-Infinity,sceneKey=null,equipmentPreview=null;
  const $=id=>document.getElementById(id);
  const dialogue=()=>root.FocusCampfireDialogue;
  const art=()=>root.FocusCampfireArt;
  const setText=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  function save(){try{localStorage.setItem(storageKey,JSON.stringify({character,topic,recent}));}catch(_){} }
  function remember(){if(line){recent=recent.filter(id=>id!==line.id).concat(line.id).slice(-96);save();}}
  function animate(){
    if(data?.settings?.motion&&!root.matchMedia('(prefers-reduced-motion: reduce)').matches){
      $('advice-line').getAnimations?.().forEach(a=>a.cancel());
      $('advice-line').animate?.([{opacity:.2,transform:'translateY(3px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'ease-out'});
    }
  }
  function init(){
    if(ready)return;
    ready=true;
    try{
      const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
      if(dialogue().characters.some(c=>c.id===saved?.character))character=saved.character;
      if(Object.hasOwn(topics,saved?.topic))topic=saved.topic;
      if(Array.isArray(saved?.recent))recent=saved.recent.filter(id=>typeof id==='string').slice(-96);
    }catch(_){}
    for(const c of dialogue().characters){
      const button=document.createElement('button');
      button.type='button';button.className='campfire-character';button.dataset.character=c.id;
      button.setAttribute('aria-pressed','false');button.setAttribute('aria-label',`和${c.name}聊聊 · ${c.title}`);
      const portrait=document.createElement('span');portrait.className='campfire-mini';portrait.setAttribute('aria-hidden','true');
      const label=document.createElement('span'),name=document.createElement('strong'),title=document.createElement('small');
      name.textContent=c.name;title.textContent=c.title;label.append(name,title);button.append(portrait,label);
      button.addEventListener('click',()=>choose(c.id,topic));$('campfire-characters').append(button);
    }
    document.querySelectorAll('[data-campfire-topic]').forEach(button=>button.addEventListener('click',()=>choose(character,button.dataset.campfireTopic)));
    $('advice-next').addEventListener('click',()=>next());
  }
  function draw(){
    const c=dialogue().characters.find(c=>c.id===character);
    const nextOutfit='npc-default';
    if(outfit!==nextOutfit){
      outfit=nextOutfit;
      document.querySelectorAll('.campfire-character').forEach(button=>button.querySelector('.campfire-mini').innerHTML=art().avatar(button.dataset.character,outfit));
    }
    const portraitKey=character+':'+outfit;
    if($('campfire-portrait').dataset.key!==portraitKey){
      $('campfire-portrait').innerHTML=art().avatar(character,outfit);$('campfire-portrait').dataset.key=portraitKey;
    }
    $('advice-card').style.setProperty('--campfire-accent',c.accent);
    $('advice-card').dataset.character=character;
    $('advice-card').dataset.tone=line?.tone||'neutral';
    setText('campfire-name',c.name);setText('campfire-role',c.title);setText('campfire-description',c.description);
    setText('advice-topic',topics[topic]);
    setText('campfire-context',topic==='advice'&&character==='guide'?`学习建议参考 ${data?.date||'所选日期'} 的记录`:'火还温着，慢慢聊就好。');
    if(line){setText('advice-title',line.title);setText('advice-text',line.text);}
    document.querySelectorAll('.campfire-character').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.character===character)));
    document.querySelectorAll('[data-campfire-topic]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.campfireTopic===topic)));
  }
  function applyEquipment(nextEquipment={},now){
    const fraction=String(now).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);
    const stamp=Date.parse(now)*1000+Number((fraction?.[1]||'').padEnd(6,'0').slice(3,6));
    if(Number.isFinite(stamp)&&stamp<equipmentStamp)return;
    if(!Number.isFinite(stamp)&&Number.isFinite(equipmentStamp))return;
    if(Number.isFinite(stamp))equipmentStamp=stamp;
    equipment={...nextEquipment};
    paintEquipment();
  }
  function paintEquipment(){
    if(!ready)return;
    const decor=root.FocusCampfireShopArt;
    const normalized=decor?.normalize({...equipment,...equipmentPreview})||{};
    const nextKey=JSON.stringify(normalized);
    if(sceneKey!==nextKey){
      $('campfire-scene').innerHTML=decor?decor.scene(normalized):art().scene();
      sceneKey=nextKey;
    }
    $('advice-card').dataset.chatframe=normalized.chatframe||'chatframe-default';
    draw();
  }
  function previewEquipment(overrides){
    equipmentPreview=overrides?{...overrides}:null;paintEquipment();
  }
  function render(nextState){
    data=nextState;init();
    applyEquipment(data?.quests?.equipped,data?.quests?.now);
    const lines=dialogue().buildLines(data,character,topic);
    // Keep a static conversation still while polling; refresh any selected facts
    // from the new state so browsing another date cannot retain stale advice.
    const previousId=line?.id;
    line=lines.find(candidate=>candidate.id===previousId)||dialogue().pickLine(lines,recent);
    if(line?.id!==previousId)remember();
    draw();
  }
  function choose(nextCharacter,nextTopic){
    if(!data)return;
    character=dialogue().characters.some(c=>c.id===nextCharacter)?nextCharacter:'hearth';
    topic=Object.hasOwn(topics,nextTopic)?nextTopic:'relax';
    next();
  }
  function next(){
    if(!data)return;
    line=dialogue().pickLine(dialogue().buildLines(data,character,topic),recent);
    remember();draw();animate();
  }
  function suggest(nextState){
    data=nextState;init();character='guide';topic='advice';
    // The shortcut offers a record-based suggestion; further clicks include
    // the guide's wider conversation pool.
    const lines=dialogue().buildLines(data,character,topic);
    const contextual=lines.filter(candidate=>candidate.id.startsWith('campfire:guide:state:'));
    line=dialogue().pickLine(contextual.length?contextual:lines,recent);
    remember();draw();animate();
  }
  root.FocusCampfire={render,next,suggest,applyEquipment,previewEquipment};
})(typeof globalThis!=='undefined'?globalThis:this);
