(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moments=[
    ['点亮帐边的小灯','灯芯暖起来了。来时的营火，还在树后轻轻亮着。','把灯留在这里'],
    ['轻拨一下浅水','一圈水纹慢慢散开，把石头上的微光送向岸边。','听水慢慢流过'],
    ['轻碰檐下的风铃','铃声越过木桥，落进风里。等它响完，再走也好。','再听一声风铃'],
    ['在湖边看一会儿倒影','栏边的灯倒映在水里。这里没有需要赶上的事情。','把视线留给湖面'],
    ['翻开长椅上的书','书页里夹着一片旧叶子。读到哪里都好，风会替你翻下一页。','让书页停在这里'],
    ['抬头看看星空','云隙缓缓打开。远处的几扇窗，和星星一起亮着。','再望一会儿远方'],
    ['点亮归途的灯','灯光越过薄雾，落在城边的屋檐上。往前走，就是星辉城了。','让灯替你照着归途']
  ];
  let initialized=false,bridge={},state=null,equipped={},equipmentStamp=-Infinity;
  let index=0,origin='camp',anchor=null,inertBefore=[],sceneKey='',routeKey='',nativeVisible=true;
  let animations=[],animationEpoch=0;
  const visited=new Set(),resting=new Set();
  const stations=()=>root.FocusExpeditionModel?.build(state||{})?.discoveries?.slice(0,7)||[];
  const isOpen=()=>Boolean($('return-trail-view')&&!$('return-trail-view').hidden);
  const visible=()=>!document.hidden&&nativeVisible&&root.FocusRuntime?.isVisible?.()!==false;
  const motion=()=>visible()&&state?.settings?.motion!==false&&!document.documentElement.classList.contains('no-motion')&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const text=(id,value)=>{const node=$(id);if(node&&node.textContent!==value)node.textContent=value;};
  function focus(node){
    if(!node?.isConnected||node.disabled||!node.getClientRects?.().length)return false;
    for(let parent=node;parent;parent=parent.parentElement)if(parent.hidden||parent.inert)return false;
    node.focus?.({preventScroll:true});return document.activeElement===node;
  }
  function cancelAnimations(){animationEpoch++;for(const animation of animations)animation.cancel();animations=[];}
  function animateArrival(direction=1){
    cancelAnimations();if(!motion())return;
    const scene=$('return-trail-scene');if(!scene?.animate)return;
    const epoch=animationEpoch;
    const add=(node,frames,options)=>{if(!node?.animate)return;const animation=node.animate(frames,options);animations.push(animation);animation.finished.then(()=>{if(epoch===animationEpoch)animations=animations.filter(item=>item!==animation);},()=>{});};
    add(scene,[{opacity:.38,transform:`translateX(${direction*12}px)`},{opacity:1,transform:'translateX(0)'}],{duration:420,easing:'cubic-bezier(.22,.7,.2,1)'});
    add(scene.querySelector('.trail-traveler'),[{transform:`translateX(${-direction*22}px)`,opacity:.55},{transform:'translateX(0)',opacity:1}],{duration:680,easing:'cubic-bezier(.2,.6,.3,1)'});
  }
  function focusedSceneAction(){
    const active=document.activeElement;if(!$('return-trail-scene')?.contains(active))return null;
    if(active?.closest('[data-trail-interact]'))return '[data-trail-interact]';
    const step=active?.closest('[data-trail-step]')?.dataset.trailStep;
    return step==='1'||step==='-1'?`[data-trail-step="${step}"]`:null;
  }
  function paint(){
    if(!isOpen())return;
    const list=stations(),current=list[index];if(!current)return;
    const view=$('return-trail-view'),atRest=resting.has(index),moment=moments[index];
    view.dataset.station=current.id;view.dataset.index=String(index);view.dataset.resting=String(atRest);
    view.dataset.motion=String(motion());view.dataset.paused=String(!visible());
    text('return-trail-counter',`第 ${index+1} 处路标 · 共 ${list.length} 处`);
    text('return-trail-place',current.name);text('return-trail-narrative',atRest?moment[1]:current.narrative);
    text('return-trail-interact',atRest?moment[2]:moment[0]);$('return-trail-interact').setAttribute('aria-pressed',String(atRest));
    text('return-trail-previous',index===0?'← 回到篝火营地':`← ${list[index-1].name}`);
    text('return-trail-next',index===list.length-1?'走进星辉城 →':`${list[index+1].name} →`);
    text('return-trail-close',origin==='city'?'返回星辉城 ↗':'返回营地 ↗');
    const nextSceneKey=JSON.stringify([index,atRest,equipped]);
    if(nextSceneKey!==sceneKey&&root.FocusReturnTrailArt){
      cancelAnimations();
      const selector=focusedSceneAction();sceneKey=nextSceneKey;
      $('return-trail-scene').innerHTML=root.FocusReturnTrailArt.scene(index,equipped,{interactive:true,resting:atRest});
      if(selector&&!focus($('return-trail-scene').querySelector(selector)))focus($('return-trail-interact'));
    }
    const nextRouteKey=JSON.stringify([index,[...visited].sort(),list.map(stop=>stop.name)]);
    if(nextRouteKey!==routeKey){
      const active=$('return-trail-route').contains(document.activeElement)?document.activeElement?.dataset.trailVisit:null;
      routeKey=nextRouteKey;
      $('return-trail-route').innerHTML=list.map((stop,i)=>`<button type="button" data-trail-visit="${i}"${visited.has(i)?'':' disabled'} aria-current="${i===index?'step':'false'}" title="${esc(visited.has(i)?`回看${stop.name}`:'沿着小径走到这里后，可以随时回看')}"><span class="return-trail-route-dot" aria-hidden="true">${i===index?'✦':visited.has(i)?'·':String(i+1).padStart(2,'0')}</span><span>${esc(stop.name)}</span></button>`).join('');
      if(active!==undefined&&active!==null)focus($('return-trail-route').querySelector(`[data-trail-visit="${active}"]`));
    }
    if(!motion())cancelAnimations();
  }
  function timestamp(now){const fraction=String(now).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);return Date.parse(now)*1000+Number((fraction?.[1]||'').padEnd(6,'0').slice(3,6));}
  function applyEquipment(next,now){
    const stamp=timestamp(now);
    if((Number.isFinite(stamp)&&stamp<equipmentStamp)||(!Number.isFinite(stamp)&&Number.isFinite(equipmentStamp)))return;
    if(Number.isFinite(stamp))equipmentStamp=stamp;
    equipped={...(next||{})};paint();
  }
  function render(next){if(!next)return;state=next;if(next.quests?.equipped)applyEquipment(next.quests.equipped,next.quests.now);paint();}
  function open(from,options={}){
    init();if(!initialized||isOpen()||document.querySelector('dialog[open]')||!root.FocusReturnTrailArt)return false;
    const latest=bridge.getState?.();if(latest)render(latest);
    const list=stations();if(list.length!==7)return false;
    const savedAnchor=from||document.activeElement;
    root.FocusCampfireRoom?.close(false);root.FocusCitadel?.close(false);root.FocusQuickSkins?.close(false);
    bridge.onOpen?.();
    anchor=savedAnchor;origin=options.from==='city'?'city':'camp';
    index=Number.isInteger(options.index)?Math.max(0,Math.min(list.length-1,options.index)):origin==='city'?list.length-1:0;
    visited.add(index);inertBefore=Array.from(document.querySelectorAll('body > main')).map(node=>[node,node.inert]);
    for(const [node] of inertBefore)node.inert=true;
    const view=$('return-trail-view');view.inert=false;view.hidden=false;sceneKey=routeKey='';
    document.documentElement.classList.add('has-return-trail-view');
    root.FocusAmbience?.setScene('camp');paint();focus($('return-trail-close'));animateArrival(origin==='city'?-1:1);return true;
  }
  function close(restoreFocus=true){
    if(!isOpen())return false;
    cancelAnimations();root.FocusQuickSkins?.close(false);root.FocusAmbience?.setScene(null);
    const view=$('return-trail-view');view.inert=true;view.hidden=true;
    document.documentElement.classList.remove('has-return-trail-view');
    for(const [node,previous] of inertBefore)node.inert=previous;
    inertBefore=[];view.inert=false;const previousAnchor=anchor;anchor=null;
    if(restoreFocus&&!focus(previousAnchor))focus($('campfire-room-open'))||focus($('citadel-enter'));
    bridge.afterClose?.();return true;
  }
  function depart(destination){
    if(!isOpen())return false;const previousOrigin=origin;
    close(false);
    if(destination==='camp')bridge.onCamp?.();else if(destination==='city')bridge.onCity?.();else bridge.onClose?.(previousOrigin);
    return true;
  }
  function go(next,direction=1){
    if(!isOpen()||!Number.isInteger(next)||next<0||next>=stations().length||next===index)return false;
    cancelAnimations();index=next;visited.add(index);paint();animateArrival(direction);return true;
  }
  function step(amount){
    if(amount!==-1&&amount!==1)return false;
    if(index+amount<0)return depart('camp');if(index+amount>=stations().length)return depart('city');
    return go(index+amount,amount);
  }
  function interact(){
    if(!isOpen())return;cancelAnimations();if(resting.has(index))resting.delete(index);else resting.add(index);paint();
    if(motion()){
      const scene=$('return-trail-scene');if(scene?.animate){const epoch=animationEpoch,animation=scene.animate([{opacity:.72},{opacity:1}],{duration:350,easing:'ease-out'});animations.push(animation);animation.finished.then(()=>{if(epoch===animationEpoch)animations=animations.filter(item=>item!==animation);},()=>{});}
    }
  }
  function blocked(){return Boolean(document.querySelector('dialog[open]')||($('quick-skins')&&!$('quick-skins').hidden));}
  function activate(target){
    const stepNode=target?.closest?.('[data-trail-step]');if(stepNode){step(Number(stepNode.dataset.trailStep));return true;}
    if(target?.closest?.('[data-trail-interact]')){interact();return true;}
    const visit=target?.closest?.('[data-trail-visit]');if(visit){const next=Number(visit.dataset.trailVisit);if(visited.has(next))go(next,next>index?1:-1);return true;}
    return false;
  }
  function onKeydown(event){
    if(!isOpen()||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey||blocked())return;
    if(event.target?.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();depart('origin');return;}
    if(!$('return-trail-view').contains(event.target))return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();if(!event.repeat)step(event.key==='ArrowLeft'?-1:1);return;}
    if(!event.repeat&&(event.key==='Enter'||event.key===' ')&&event.target?.closest?.('#return-trail-scene')&&activate(event.target))event.preventDefault();
  }
  function updateVisibility(event){
    if(typeof event?.detail?.visible==='boolean')nativeVisible=event.detail.visible;
    if(!visible())cancelAnimations();if(isOpen()){$('return-trail-view').dataset.paused=String(!visible());$('return-trail-view').dataset.motion=String(motion());}
  }
  function init(options){
    if(options)bridge={...bridge,...options};if(initialized||!document.body)return;
    const view=document.createElement('section');view.id='return-trail-view';view.className='return-trail-view';view.hidden=true;
    view.setAttribute('role','region');view.setAttribute('aria-labelledby','return-trail-title');
    view.innerHTML='<header class="return-trail-header"><button type="button" id="return-trail-camp">← 篝火营地</button><div class="return-trail-heading"><span>沿着灯，慢慢走</span><h2 id="return-trail-title">归途小径</h2></div><div class="return-trail-header-actions"><div id="return-trail-ambience"></div><button type="button" id="return-trail-close">返回营地 ↗</button></div></header><div class="return-trail-main"><div id="return-trail-scene" class="return-trail-scene"></div><div class="return-trail-caption"><div class="return-trail-story" aria-live="polite" aria-atomic="true"><span id="return-trail-counter"></span><h3 id="return-trail-place"></h3><p id="return-trail-narrative"></p></div><button type="button" id="return-trail-interact" data-trail-interact aria-pressed="false"></button></div></div><footer class="return-trail-footer"><div class="return-trail-navigation"><button type="button" id="return-trail-previous" data-trail-step="-1"></button><span>← → 沿路漫步 · 随时可以停下来</span><button type="button" id="return-trail-next" data-trail-step="1"></button></div><nav id="return-trail-route" class="return-trail-route" aria-label="七处路标"></nav></footer>';
    document.body.append(view);initialized=true;
    root.FocusAmbience?.mount($('return-trail-ambience'),'camp');
    $('return-trail-camp').addEventListener('click',()=>depart('camp'));
    $('return-trail-close').addEventListener('click',()=>depart('origin'));
    view.addEventListener('click',event=>{if(event.button===0&&!event.ctrlKey&&!blocked())activate(event.target);});
    document.addEventListener('keydown',onKeydown,true);
    document.addEventListener('visibilitychange',updateVisibility);
    document.addEventListener('focusquest:visibility',updateVisibility);
    root.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>{if(!motion())cancelAnimations();paint();});
    root.addEventListener?.('pagehide',cancelAnimations);
  }
  root.FocusReturnTrail={init,open,close,isOpen,render,applyEquipment};
})(globalThis);
