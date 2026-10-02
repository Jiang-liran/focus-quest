(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const places = {
    guide:['地图桌','栖灯替你理清脚下的路，出发的节奏仍由你决定。'],
    hearth:['炉边茶歇','阿榆给你留了一杯热茶。先把肩膀放松下来。'],
    wanderer:['旅途手记','闻舟翻开手记，每一段专注都有自己的位置。'],
    stargazer:['林间观星台','望舒把四科的努力连成星图，陪你看看此刻的光。'],
  };
  let initialized=false, bridge={}, returnFocus=null, background=null, previousInert=false;
  let closing=false, generation=0, animations=[], selected='hearth', detailKey=null;
  let restDeadline=0, restTimer=null, restFinished=false;
  const text=(id,value)=>{const node=$(id);if(node&&node.textContent!==value)node.textContent=value;};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const minutes=value=>{const n=Math.max(0,Math.round(Number(value)||0));return n>=60?`${Math.floor(n/60)}小时${n%60?`${n%60}分钟`:''}`:`${n}分钟`;};
  const isOpen=()=>Boolean($('campfire-room')&&!$('campfire-room').hidden);
  function focus(node){
    if(!node?.isConnected||node.disabled)return false;
    for(let parent=node;parent;parent=parent.parentElement)if(parent.hidden||parent.inert)return false;
    if(!node.getClientRects?.().length)return false;
    node.focus?.({preventScroll:true});return document.activeElement===node;
  }
  function motion(){return !document.documentElement.classList.contains('no-motion')&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
  function cancelAnimations(){generation++;animations.forEach(a=>a.cancel());animations=[];}
  function slide(enter,done){
    cancelAnimations();const token=generation,room=$('campfire-room');
    if(!motion()||!room.animate){done?.();return;}
    const options={duration:520,easing:'cubic-bezier(.22,.75,.2,1)'};
    const roomAnimation=room.animate([{transform:enter?'translateX(105%)':'translateX(0)'},{transform:enter?'translateX(0)':'translateX(105%)'}],options);
    animations.push(roomAnimation);
    if(background?.animate)animations.push(background.animate([{transform:enter?'translateX(0)':'translateX(-105vw)',opacity:enter?1:.25},{transform:enter?'translateX(-105vw)':'translateX(0)',opacity:enter?.25:1}],options));
    roomAnimation.finished.then(()=>{if(token===generation){animations=[];done?.();}},()=>{});
  }
  function open(anchor){
    init();if(!initialized||document.querySelector('dialog[open]'))return false;
    if(isOpen()&&!closing)return false;
    root.FocusCitadel?.close(false);root.FocusQuickSkins?.close(false);
    if(!isOpen()){
      returnFocus=anchor||document.activeElement;
      background=document.querySelector('body > main');previousInert=Boolean(background?.inert);
    }
    closing=false;if(background)background.inert=true;
    $('campfire-room').hidden=false;document.documentElement.classList.add('has-campfire-room');
    root.FocusAmbience?.setScene('camp');
    slide(true);focus($('campfire-room-close'));tickRest();return true;
  }
  function close(restoreFocus=true){
    if(!isOpen())return false;
    if(closing&&restoreFocus)return false;
    closing=true;root.FocusQuickSkins?.close(false);stopRestTick();
    root.FocusAmbience?.setScene(null);
    document.documentElement.classList.remove('has-campfire-room');
    const finish=()=>{
      $('campfire-room').hidden=true;if(background)background.inert=previousInert;
      const anchor=returnFocus;returnFocus=null;background=null;closing=false;
      if(restoreFocus&&!focus(anchor))focus($('campfire-room-open'));
      bridge.afterClose?.();
    };
    if(restoreFocus)slide(false,finish);else{cancelAnimations();finish();}
    return true;
  }
  function selectCharacter(id){
    const next=Object.hasOwn(places,id)?id:'hearth',changed=selected!==next;
    selected=next;
    root.FocusCampWorldArt?.setSelection($('campfire-scene'),selected);
    text('campfire-place-name',places[selected][0]);text('campfire-place-detail',places[selected][1]);
    document.querySelectorAll('[data-camp-duty]').forEach(node=>node.hidden=node.dataset.campDuty!==selected);
    const room=$('campfire-room');if(room)room.dataset.station=selected;
    if(changed&&$('advice-card'))$('advice-card').scrollTop=0;
  }
  function chooseStation(id){
    if(!Object.hasOwn(places,id))return;
    root.FocusCampfire?.choose(id,id==='guide'?'advice':id==='wanderer'?'story':'relax');
  }
  function renderState(next){
    if(!next)return;
    const history=next.date!==next.today;
    text('campfire-world-greeting',history?'翻开那一天的手记，营地里的火仍然温着。':'风经过树梢，火光落在杯沿。这里可以慢一点。');
    text('campfire-world-record',`${next.date} · ${history?'那一天':'今日'}专注 ${minutes(next.totals?.minutes)}`);
    text('campfire-map-total',minutes(next.totals?.minutes));
    text('campfire-map-target',`目标 ${minutes(next.totals?.target)} · ${Number(next.totals?.percent||0).toFixed(1)}%`);
    const subjects=(next.subjects||[]).filter(s=>Number(s.target)>0);
    const least=subjects.slice().sort((a,b)=>Number(a.percent)-Number(b.percent))[0];
    text('campfire-map-copy',least&&Number(least.percent)<100?`${least.name}目前完成 ${Number(least.percent||0).toFixed(1)}%。想换个科目时，可以从这里开始；也可以继续原来的安排。`:'各科的星光已经聚齐。接下来按体力安排，继续或歇一会儿都可以。');
    const records=(next.records||[]).slice().sort((a,b)=>String(b.end).localeCompare(String(a.end))).slice(0,4);
    const key=JSON.stringify([next.date,next.today,next.dayRecordCount,next.totals?.minutes,records,next.subjects]);
    if(key!==detailKey){
      detailKey=key;
      text('campfire-memory-summary',`${history?'这一天':'今天'}收下了 ${Number(next.dayRecordCount??next.records?.length??0)} 段专注，共 ${minutes(next.totals?.minutes)}。`);
      if($('campfire-memory-records'))$('campfire-memory-records').innerHTML=records.length?records.map(r=>`<li><span class="record-time-range" title="${esc(root.FocusRecordTime?.describe(r,{referenceDay:next.date})||'开始 → 结束')}">${esc(root.FocusRecordTime?.range(r,{referenceDay:next.date})||`${String(r.start||'').slice(11,16)||'—'} → ${String(r.end||'').slice(11,16)||'—'}`)}</span><div><strong>${esc(r.name)}</strong><small>留下了 ${minutes(r.minutes)}</small></div></li>`).join(''):'<li class="campfire-memory-empty">纸页还空着，等下一段专注落在这里。</li>';
      if($('campfire-study-stars'))$('campfire-study-stars').innerHTML=(next.subjects||[]).map(s=>{const p=Math.max(0,Number(s.percent)||0);return `<div><span>${esc(s.name)}</span><strong>${p.toFixed(1)}%</strong><i><b style="width:${Math.min(100,p)}%"></b></i><small>${minutes(s.minutes)} / ${minutes(s.target)}</small></div>`;}).join('');
    }
  }
  function stopRestTick(){if(restTimer!==null){root.clearTimeout(restTimer);restTimer=null;}}
  function tickRest(){
    stopRestTick();
    const left=restDeadline?Math.max(0,Math.ceil((restDeadline-Date.now())/1000)):180;
    if(restDeadline&&left===0){restDeadline=0;restFinished=true;}
    const shown=restFinished?0:left;
    text('campfire-rest-time',`${String(Math.floor(shown/60)).padStart(2,'0')}:${String(shown%60).padStart(2,'0')}`);
    text('campfire-rest-status',restFinished?'茶已经温好。按自己的节奏，再出发。':restDeadline?'不必盯着钟，看看远处也好。':'三分钟，只留给自己。');
    text('campfire-rest-toggle',restDeadline?'结束这次茶歇':restFinished?'再泡一盏茶 · 3分钟':'泡一盏茶 · 休息3分钟');
    if($('campfire-rest-fill'))$('campfire-rest-fill').style.width=`${restFinished?100:restDeadline?(180-left)/180*100:0}%`;
    if(restDeadline&&isOpen()&&!closing)restTimer=root.setTimeout(tickRest,1000);
  }
  function toggleRest(){restFinished=false;restDeadline=restDeadline?0:Date.now()+180000;tickRest();}
  function onKeydown(event){
    if(!isOpen()||event.defaultPrevented||document.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();
      if($('quick-skins')&&!$('quick-skins').hidden)root.FocusQuickSkins?.close();else close();
    }
  }
  function init(options){
    if(options)bridge={...bridge,...options};
    const room=$('campfire-room');if(initialized||!room)return;initialized=true;
    const actions=document.querySelector('#campfire-room .campfire-header-actions');
    if(actions&&root.FocusAmbience){const sound=document.createElement('div');sound.id='campfire-ambience';actions.prepend(sound);root.FocusAmbience.mount(sound,'camp');}
    $('campfire-room-close')?.addEventListener('click',()=>close());
    $('campfire-rest-toggle')?.addEventListener('click',toggleRest);
    $('campfire-guide-advice')?.addEventListener('click',()=>root.FocusCampfire?.choose('guide','advice'));
    room.addEventListener('click',event=>{
      const station=event.target.closest?.('[data-camp-station]');
      if(station){chooseStation(station.dataset.campStation);return;}
      const page=event.target.closest?.('[data-camp-page]');
      if(page&&['quests','history','review'].includes(page.dataset.campPage))bridge.openPage?.(page.dataset.campPage);
    });
    room.addEventListener('keydown',event=>{
      if(event.defaultPrevented||!['Enter',' '].includes(event.key))return;
      const station=event.target.closest?.('[data-camp-station]');
      if(station){event.preventDefault();chooseStation(station.dataset.campStation);}
    });
    document.addEventListener('keydown',onKeydown,true);
  }
  root.FocusCampfireRoom={init,open,close,isOpen,selectCharacter,renderState};
})(globalThis);
