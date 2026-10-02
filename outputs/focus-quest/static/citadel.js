(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slots=new Set(['theme','fx','avatar','companion','relic','portal']);
  const places=[
    {id:'dock',name:'启程码头',icon:'⚑',threshold:0,x:308,y:565,action:'让纸舟启航',copy:'小船载着今天的第一束光靠岸。每完成一段专注，都会在这座城里留下航迹。'},
    {id:'core',name:'圣物广场',icon:'◇',threshold:0,x:597,y:409,action:'触碰晶核',copy:'专注汇入广场中央的圣物。水渠、街灯与浮岛边缘的光，会随每一分钟缓缓生长。'},
    {id:'workshop',name:'流光工坊',icon:'⚙',threshold:.25,x:282,y:326,action:'连通流光阵',copy:'完成四分之一的旅程，工坊开始运转。四科的努力各自点亮一条回路，汇聚到城中。'},
    {id:'archive',name:'星页书库',icon:'▤',threshold:.5,x:882,y:337,action:'翻开光之书',copy:'走过一半，书库里的灯亮了。这里收藏这一天真正完成过的学习，随时可以回看。'},
    {id:'observatory',name:'天穹观测台',icon:'✧',threshold:.75,x:510,y:178,action:'转动星盘',copy:'完成四分之三，观测台开始寻找远处的星。每一门达到目标的科目，都会成为一枚明亮星标。'},
    {id:'gate',name:'远征之门',icon:'◎',threshold:1,x:924,y:562,action:'唤起门扉共鸣',copy:'当今日目标达成，门扉完全苏醒。此后的学习化作城上余辉；回到营地休息，也是一段完整旅程。'}
  ];
  let bridge={},state=null,equipped={},equipmentStamp=-Infinity,equipmentPreview=null;
  let anchor=null,inertBefore=[],selected='core',zoom=1,panX=0,panY=0,previewPercent=null,pulse=null,pulseTimer=null,artKey='',detailKey='',drag=null,suppressClickUntil=0,initialized=false;
  const isOpen=()=>!!$('citadel-view')&&!$('citadel-view').hidden;
  const currentModel=()=>previewPercent===null?root.FocusExpeditionModel.build(state):root.FocusExpeditionModel.preview(state,previewPercent);
  const visibleEquipment=()=>({...equipped,...equipmentPreview});
  const duration=value=>{const seconds=Math.max(Number(value)>0?1:0,Math.floor(Number(value||0)*60+1e-6)),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return h?`${h}小时${m?m+'分':''}`:m?`${m}分钟`:s?`${s}秒`:'0分钟';};
  const percent=value=>(value>0&&value<100?Math.min(99.9,Math.round(value*10)/10):Math.round(value*10)/10)+'%';
  const unlocked=(place,model)=>place.threshold===0||(model.goalSet&&model.progress>=place.threshold);
  function setText(id,text){if($(id).textContent!==text)$(id).textContent=text;}
  function timestamp(now){const fraction=String(now).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);return Date.parse(now)*1000+Number((fraction?.[1]||'').padEnd(6,'0').slice(3,6));}
  function applyEquipment(next,now){
    const stamp=timestamp(now);
    if((Number.isFinite(stamp)&&stamp<equipmentStamp)||(!Number.isFinite(stamp)&&Number.isFinite(equipmentStamp)))return;
    if(Number.isFinite(stamp))equipmentStamp=stamp;
    equipped={...(next||{})};if(isOpen())paint();
  }
  function previewEquipment(override){equipmentPreview=override?{...override}:null;if(isOpen())paint();}
  function clearPulse(){if(pulseTimer!==null)root.clearTimeout(pulseTimer);pulseTimer=null;pulse=null;}
  function clampCamera(){const limit=(zoom-1)*50;panX=Math.max(-limit,Math.min(limit,panX));panY=Math.max(-limit,Math.min(limit,panY));}
  function camera(){
    clampCamera();$('citadel-camera').style.transform=`translate(${panX}%,${panY}%) scale(${zoom})`;
    $('citadel-stage').dataset.zoomed=String(zoom>1);
    setText('citadel-zoom',Math.round(zoom*100)+'%');$('citadel-zoom-out').disabled=zoom<=1;$('citadel-zoom-in').disabled=zoom>=2.4;
  }
  function center(place){panX=(50-place.x/12)*zoom;panY=(50-place.y/7.2)*zoom;camera();}
  function select(id,approach=true){if(!places.some(p=>p.id===id))return;selected=id;clearPulse();setText('citadel-feedback','');if(approach){zoom=2;center(places.find(p=>p.id===id));}paint();}
  function records(){return (Array.isArray(state?.records)?state.records:[]).filter(r=>!r.deleted&&(!(r.day||r.date)||(r.day||r.date)===state.date)).slice().sort((a,b)=>String(b.end||'').localeCompare(String(a.end||'')));}
  function recordCount(){return Math.max(records().length,Number(state?.dayRecordCount)||0);}
  function detail(model){
    const place=places.find(p=>p.id===selected),active=unlocked(place,model),rows=records();
    const key=JSON.stringify([selected,model.minutes,model.target,model.subjects,previewPercent,recordCount(),rows.slice(0,4).map(r=>[r.id,r.name,r.minutes]),pulse]);
    setText('citadel-place-name',place.name);setText('citadel-place-copy',place.copy);
    setText('citadel-place-state',active?'已苏醒':`${place.threshold*100}% · 等待点亮`);
    $('citadel-place-state').dataset.awake=String(active);
    setText('citadel-place-progress',active?(place.threshold?`已达到 ${place.threshold*100}% 的觉醒条件`:'抵达时便为你敞开'):model.goalSet?`再完成 ${duration(Math.max(0,model.target*place.threshold-model.minutes))}，这里就会苏醒。`:'设定每日目标后，这座设施会随学习进度苏醒。');
    setText('citadel-interact',pulse?'正在回应你…':place.action);$('citadel-interact').disabled=!active||!!pulse;
    $('citadel-replay').hidden=selected!=='archive';$('citadel-replay').disabled=previewPercent!==null||!rows.length;
    if(key===detailKey)return;detailKey=key;
    let html='';
    if(selected==='dock')html=`<strong>${previewPercent===null?recordCount():'—'} <small>段已完成的专注</small></strong><p>码头记下每一次靠岸，也欢迎每一次重新出发。</p>`;
    if(selected==='core')html=`<strong>${duration(model.minutes)} <small>汇入这座城</small></strong><div class="citadel-meter"><i style="width:${model.progress*100}%"></i></div><p>${model.complete?'目标已经达成。每一段额外专注，都会让余辉更明亮。':`当前能量 ${percent(model.percent)} · 目标 ${duration(model.target)}`}</p>`;
    if(selected==='workshop'||selected==='observatory')html=`<div class="citadel-subject-list">${model.subjects.map(s=>`<div><span>${esc(s.name)}</span><i><b style="width:${s.progress*100}%"></b></i><strong>${percent(s.percent)}</strong></div>`).join('')}</div><p>${selected==='observatory'?`${model.subjects.filter(s=>s.complete).length} / 4 枚星标已经点亮。`:'回路各自记录四科的完成比例，超过目标的努力也会完整显示。'}</p>`;
    if(selected==='archive')html=previewPercent!==null?'<p>正在预览城市生长。返回实际进度，即可查看这一天的真实航迹。</p>':rows.length?`<ul class="citadel-records">${rows.slice(0,4).map(r=>`<li><span>${esc(r.name)}</span><b>${duration(r.minutes)}</b></li>`).join('')}</ul><p>最近 ${Math.min(4,rows.length)} 段 · 共 ${recordCount()} 段${recordCount()>rows.length?'；回放含较早记录的起点与最近航迹':'，可回放整天的旅程'}。</p>`:'<p>书页暂时留白。完成第一段专注后，它会自动收藏在这里。</p>';
    if(selected==='gate')html=`<strong>${model.afterglow.active?duration(model.afterglow.minutes):percent(model.percent)} <small>${model.afterglow.active?'目标之外的余辉':'门扉能量'}</small></strong><p>${model.complete?'门已为你打开。此刻可以继续探索，也可以安心休息。':'门上的星纹随进度汇聚，完成目标后会展开完整光环。'}</p>`;
    $('citadel-place-data').innerHTML=html;
  }
  function paint(){
    if(!isOpen()||!state)return;
    const model=currentModel(),eq=visibleEquipment();
    const theme=(state.quests?.catalog||[]).find(item=>item.id===eq.theme)?.name||'晨雾星岛';
    setText('citadel-summary',`${state.date===state.today?'今天':state.date} · ${duration(model.minutes)} / ${duration(model.target)} · ${percent(model.percent)}`);
    setText('citadel-theme',theme);$('citadel-view').dataset.preview=String(previewPercent!==null);
    $('citadel-view').dataset.motion=String(state.settings?.motion!==false);
    setText('citadel-mode',previewPercent!==null?'生长预览 · 学习记录保持原样':state.date===state.today?'这座城正随今天的专注生长':'历史景象 · 这一天的努力留在这里');
    $('citadel-preview-controls').hidden=previewPercent===null;
    $('citadel-preview-toggle').setAttribute('aria-pressed',String(previewPercent!==null));
    setText('citadel-preview-toggle',previewPercent===null?'预览城市生长':'返回实际进度');
    if(previewPercent!==null){$('citadel-preview-range').value=previewPercent;setText('citadel-preview-value',percent(previewPercent));}
    const key=JSON.stringify([model.progress,model.subjects.map(s=>[s.id,s.progress]),model.afterglow,eq,selected,pulse]);
    if(key!==artKey){
      artKey=key;const focused=$('citadel-scene').contains(document.activeElement)?document.activeElement?.closest('[data-citadel-place]')?.dataset.citadelPlace:null;
      $('citadel-scene').innerHTML=root.FocusCitadelArt.scene(model,eq,{interactive:true,selected,pulse});
      if(focused)$('citadel-scene').querySelector(`[data-citadel-place="${focused}"]`)?.focus({preventScroll:true});
    }
    for(const button of $('citadel-locations').querySelectorAll('[data-citadel-select]')){const place=places.find(p=>p.id===button.dataset.citadelSelect);button.setAttribute('aria-pressed',String(selected===place.id));button.dataset.awake=String(unlocked(place,model));}
    detail(model);
  }
  function render(next){
    if(!next)return;
    if(state&&state.date!==next.date){clearPulse();previewPercent=null;selected='core';zoom=1;panX=panY=0;artKey=detailKey='';if(isOpen())camera();}
    state=next;
    applyEquipment(next.quests?.equipped||equipped,next.quests?.now);
    if(isOpen())paint();
  }
  function open(from){
    const latest=bridge.getState?.();if(latest)render(latest);
    if(!state||isOpen()||document.querySelector('dialog[open]'))return;
    bridge.leaveExpedition?.();root.FocusQuickSkins?.close(false);
    anchor=from||document.activeElement;selected='core';zoom=1;panX=panY=0;previewPercent=null;artKey=detailKey='';clearPulse();setText('citadel-feedback','');
    inertBefore=Array.from(document.querySelectorAll('body > main, body > .sidebar')).map(element=>[element,element.inert]);
    for(const [element] of inertBefore)element.inert=true;
    $('citadel-view').hidden=false;document.documentElement.classList.add('has-citadel-view');
    camera();paint();$('citadel-close').focus({preventScroll:true});
  }
  function close(restoreFocus=true){
    if(!isOpen())return;
    root.FocusQuickSkins?.close(false);clearPulse();drag=null;previewPercent=null;equipmentPreview=null;
    $('citadel-view').hidden=true;document.documentElement.classList.remove('has-citadel-view');
    for(const [element,previous] of inertBefore)element.inert=previous;inertBefore=[];
    if(restoreFocus&&anchor?.isConnected)anchor.focus?.({preventScroll:true});anchor=null;
    bridge.afterClose?.();
  }
  function interact(){
    if(!isOpen()||pulse||!unlocked(places.find(p=>p.id===selected),currentModel()))return;
    pulse=selected;paint();setText('citadel-feedback',`${places.find(p=>p.id===selected).name}回应了你的触碰。`);
    pulseTimer=root.setTimeout(()=>{pulseTimer=null;pulse=null;if(isOpen())paint();},state.settings?.motion===false||root.matchMedia?.('(prefers-reduced-motion: reduce)').matches?600:2600);
  }
  function preview(itemId,base){
    const latest=bridge.getState?.()||state, item=(latest?.quests?.catalog||[]).find(item=>item.id===itemId&&slots.has(item.slot));
    if(!item||!root.FocusCitadelArt||!root.FocusExpeditionModel)return '';
    const model=root.FocusExpeditionModel.preview(latest,100),eq={...(base||latest.quests.equipped),[item.slot]:item.id};
    return `<div class="citadel-full-preview">${root.FocusCitadelArt.scene(model,eq,{interactive:false})}<div><strong>星辉城 · 完整觉醒预览</strong><span>${esc(item.name)} · 保留其余当前装备</span></div></div><p class="citadel-preview-note">展示完成后的造型，装备后跟随真实学习进度生长。</p>`;
  }
  function init(callbacks={}){
    bridge=callbacks;if(initialized)return;initialized=true;
    $('citadel-enter').addEventListener('click',event=>{if(!event.ctrlKey)open(event.currentTarget);});
    document.querySelector('.quest-scene').addEventListener('click',event=>{if(event.button===0&&!event.ctrlKey)open($('citadel-enter'));});
    $('citadel-close').addEventListener('click',()=>close());
    $('citadel-shop').addEventListener('click',()=>{close(false);bridge.openShop?.();});
    $('citadel-replay').addEventListener('click',()=>{if(previewPercent!==null)return;close();bridge.replayDay?.();});
    $('citadel-interact').addEventListener('click',interact);
    $('citadel-locations').innerHTML=places.map(p=>`<button type="button" data-citadel-select="${p.id}" aria-pressed="false"><span>${p.icon}</span><strong>${p.name}</strong><small>${p.threshold?p.threshold*100+'%':'起点'}</small></button>`).join('');
    $('citadel-locations').addEventListener('click',event=>{const button=event.target.closest('[data-citadel-select]');if(button)select(button.dataset.citadelSelect);});
    $('citadel-scene').addEventListener('click',event=>{if(event.ctrlKey||event.button!==0||Date.now()<suppressClickUntil)return;const place=event.target.closest('[data-citadel-place]');if(place)select(place.dataset.citadelPlace);});
    $('citadel-scene').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const place=event.target.closest('[data-citadel-place]');if(place){event.preventDefault();select(place.dataset.citadelPlace);}}});
    $('citadel-overview').addEventListener('click',()=>{zoom=1;panX=panY=0;camera();});
    for(const [id,delta] of [['citadel-zoom-in',.4],['citadel-zoom-out',-.4]])$(id).addEventListener('click',()=>{zoom=Math.round(Math.max(1,Math.min(2.4,zoom+delta))*10)/10;if(zoom===1){panX=panY=0;camera();}else center(places.find(p=>p.id===selected));});
    $('citadel-preview-toggle').addEventListener('click',()=>{clearPulse();previewPercent=previewPercent===null?Math.min(100,Math.round(currentModel().percent)):null;paint();});
    $('citadel-preview-range').addEventListener('input',event=>{clearPulse();previewPercent=Math.max(0,Math.min(100,Number(event.target.value)||0));paint();});
    const stage=$('citadel-stage');
    stage.addEventListener('pointerdown',event=>{if(zoom<=1||event.button!==0||event.ctrlKey||event.target.closest('button'))return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,px:panX,py:panY,moved:false};});
    stage.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<5)return;drag.moved=true;stage.setPointerCapture?.(event.pointerId);stage.classList.add('dragging');const rect=stage.getBoundingClientRect();panX=drag.px+dx/rect.width*100;panY=drag.py+dy/rect.height*100;camera();});
    const finish=()=>{if(drag?.moved)suppressClickUntil=Date.now()+250;drag=null;stage.classList.remove('dragging');};stage.addEventListener('pointerup',finish);stage.addEventListener('pointercancel',finish);stage.addEventListener('lostpointercapture',finish);
    document.addEventListener('keydown',event=>{
      if(!isOpen()||event.defaultPrevented||document.querySelector('dialog[open]'))return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
      if(event.key!=='Tab')return;
      const quick=$('quick-skins'),container=quick&&!quick.hidden?quick:$('citadel-view');
      const nodes=Array.from(container.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')).filter(el=>!el.closest('[hidden]')&&el.getClientRects().length);
      const first=nodes[0],last=nodes[nodes.length-1];if(!first)return;
      if(!container.contains(document.activeElement)||(event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){event.preventDefault();(event.shiftKey?last:first).focus();}
    },true);
  }
  root.FocusCitadel={init,render,open,close,isOpen,applyEquipment,previewEquipment,preview};
})(typeof globalThis!=='undefined'?globalThis:this);
