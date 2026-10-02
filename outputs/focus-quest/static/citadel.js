(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const slots=new Set(['theme','fx','avatar','companion','relic','portal']);
  const places=[
    {id:'dock',name:'启程码头',icon:'⚑',threshold:0,x:230,y:565,action:'让纸舟启航',copy:'小船载着今天的第一束光靠岸。每完成一段专注，都会在这座城里留下航迹。'},
    {id:'core',name:'圣物广场',icon:'◇',threshold:0,x:595,y:425,action:'唤起星庭共鸣',copy:'四科星印各自充能，达标后点亮。岛前的星辉引擎汇集每日进度；圆台与阶梯从灰石逐渐镶上刻纹、宝石与金边，完整圆环始终守护中央圣物。'},
    {id:'workshop',name:'流光工坊',icon:'⚙',threshold:.25,x:245,y:326,action:'连通流光阵',copy:'完成四分之一的旅程，工坊开始运转。四科的努力各自点亮一条回路，汇聚到城中。'},
    {id:'archive',name:'星页书库',icon:'▤',threshold:.5,x:600,y:178,action:'翻开光之书',copy:'走过一半，书库里的灯亮了。这里收藏这一天真正完成过的学习，随时可以回看。'},
    {id:'observatory',name:'天穹观测台',icon:'✧',threshold:.75,x:950,y:330,action:'转动星盘',copy:'完成四分之三，观测台开始寻找远处的星。每一门达到目标的科目，都会成为一枚明亮星标。'},
    {id:'gate',name:'远征之门',icon:'◎',threshold:1,x:924,y:562,action:'唤起门扉共鸣',copy:'当今日目标达成，门扉完全苏醒。此后的学习化作城上余辉；回到营地休息，也是一段完整旅程。'}
  ];
  let bridge={},state=null,equipped={},equipmentStamp=-Infinity,equipmentPreview=null;
  let anchor=null,inertBefore=[],selected='core',zoom=1,panX=0,panY=0,previewPercent=null,pulse=null,pulseTimer=null,pulseGeneration=0,artKey='',detailKey='',drag=null,suppressClickUntil=0,wheelTimer=null,initialized=false;
  const isOpen=()=>!!$('citadel-view')&&!$('citadel-view').hidden;
  let pageAnimations=[],pageGeneration=0,pageFinish=null,closing=false,background=null;
  let motionPercent=null,moving=false,flowTarget=null,flowGates=[],flowKind=null,pendingProgress=null,awakening=null,raf=null,awakeningTimer=null,generation=0,awakeningToken=0;
  const gateIds=['workshop','archive','observatory','gate'];
  const gateTitles=['工坊升起 · 回路连通','书库展开 · 光页归位','星轨升空 · 观测台共鸣','门扉洞开 · 全城加冕'];
  const motionAllowed=()=>state?.settings?.motion!==false&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function cancelPageSlide(){
    // Artwork-only shop previews render the controller without entering a page.
    // Release shell styling only when this controller actually owns a slide.
    if(pageAnimations.length)document.documentElement.classList.remove('citadel-page-moving');
    pageGeneration++;pageAnimations.forEach(animation=>animation.cancel());pageAnimations=[];pageFinish=null;
  }
  function finishPageSlide(){if(!pageAnimations.length&&!pageFinish)return;const done=pageFinish;cancelPageSlide();done?.();}
  function slidePage(enter,done){
    cancelPageSlide();pageFinish=done||null;
    const view=$('citadel-view'),token=pageGeneration;
    if(!motionAllowed()||document.hidden||root.FocusRuntime?.isVisible?.()===false||!view.animate){finishPageSlide();return;}
    document.documentElement.classList.add('citadel-page-moving');
    const options={duration:520,easing:'cubic-bezier(.22,.75,.2,1)'};
    // Camp lives to the right; the city is the neighboring place to the left.
    const page=view.animate([{transform:enter?'translateX(-105%)':'translateX(0)'},{transform:enter?'translateX(0)':'translateX(-105%)'}],options);
    pageAnimations.push(page);
    if(background?.animate){
      const behind=background.animate([{transform:enter?'translateX(0)':'translateX(105vw)',opacity:enter?1:.25},{transform:enter?'translateX(105vw)':'translateX(0)',opacity:enter?.25:1}],options);
      behind.finished.catch(()=>{});pageAnimations.push(behind);
    }
    page.finished.then(()=>{if(token===pageGeneration)finishPageSlide();},()=>{});
  }
  function focusEntry(node){
    if(!node?.isConnected||node.disabled||!node.getClientRects?.().length)return false;
    for(let parent=node;parent;parent=parent.parentElement)if(parent.hidden||parent.inert)return false;
    node.focus?.({preventScroll:true});return document.activeElement===node;
  }
  function currentModel(){
    if(previewPercent!==null)return {...root.FocusExpeditionModel.preview(state,motionPercent??previewPercent),moving};
    const model=root.FocusExpeditionModel.build(state);
    if(motionPercent===null)return {...model,moving:false};
    const minutes=model.target*motionPercent/100;
    return {...model,percent:motionPercent,progress:Math.min(1,motionPercent/100),stage:Math.min(4,Math.floor(motionPercent/25)),minutes,complete:model.goalSet&&motionPercent>=100,moving,
      afterglow:{...model.afterglow,active:motionPercent>100,minutes:Math.max(0,minutes-model.target)}};
  }
  function cancelJourney(){
    generation++;if(raf!==null)root.cancelAnimationFrame?.(raf);if(awakeningTimer!==null)root.clearTimeout(awakeningTimer);
    raf=awakeningTimer=null;motionPercent=null;moving=false;flowTarget=null;flowGates=[];flowKind=null;pendingProgress=null;awakening=null;
  }
  function acceptProgress(previous,next,fresh,events=[]){
    if(!isOpen()||previewPercent!==null||!motionAllowed()||next?.settings?.motion===false||!previous||next.date!==next.today||previous.date!==next.date||previous.totals.target!==next.totals.target||!(next.totals.target>0)||!(next.totals.minutes>previous.totals.minutes)||!(fresh||[]).some(r=>r.day===next.date&&r.minutes>0&&r.source!=='history_xlsx'))return false;
    const daily=events.filter(e=>e.type==='daily'&&e.target===next.totals.target);
    const before=previous.totals.minutes/previous.totals.target*100,after=next.totals.minutes/next.totals.target*100;
    const lastStage=daily.length?Math.max(...daily.map(e=>e.stage)):0;
    const gates=[];for(let stage=Math.max(1,Math.floor(before/25)+1);stage<=lastStage;stage++){
      if(daily.some(event=>!Array.isArray(event.crossedStages)||event.crossedStages.includes(stage)))gates.push(stage*25);
    }
    pendingProgress={date:next.date,target:next.totals.target,percent:after,from:before,gates:[...new Set([...(pendingProgress?.gates||[]),...gates])]};
    return daily.length>0;
  }
  function awaken(threshold,done){
    const stage=threshold/25;
    awakening={id:gateIds[stage-1],token:++awakeningToken,stage};moving=false;paint();
    if(!motionAllowed()){awakening=null;done();return;}
    if(flowKind==='live'&&previewPercent===null&&state?.settings?.sound)bridge.playSound?.(stage===4?'victory':'milestone',{key:`daily:${state.date}:${state.totals.target}:${stage}`});
    const token=generation;
    awakeningTimer=root.setTimeout(()=>{if(token!==generation||!isOpen())return;awakeningTimer=null;awakening=null;paint();done();},4000);
  }
  function travelTo(target,done){
    const start=motionPercent??currentModel().percent;
    if(!motionAllowed()||Math.abs(target-start)<.00001){motionPercent=target;moving=false;paint();done();return;}
    const token=generation,started=root.performance.now(),durationMs=Math.min(3000,Math.max(1100,Math.abs(target-start)/25*2600));moving=start<100;
    function frame(now){
      if(token!==generation||!isOpen())return;
      if(!motionAllowed()){cancelJourney();paint();return;}
      const fraction=Math.min(1,Math.max(0,(now-started)/durationMs));
      motionPercent=start+(target-start)*fraction;paint(true);
      if(fraction<1)raf=root.requestAnimationFrame(frame);
      else{raf=null;moving=false;motionPercent=target;paint();done();}
    }
    paint();raf=root.requestAnimationFrame(frame);
  }
  function advanceFlow(){
    if(!isOpen()||flowTarget===null)return;
    const current=motionPercent??currentModel().percent;
    while(flowGates.length&&flowGates[0]<current-.00001)flowGates.shift();
    const gate=flowGates[0];
    if(gate!==undefined&&gate<=flowTarget){flowGates.shift();travelTo(gate,()=>awaken(gate,advanceFlow));return;}
    const destination=flowTarget;
    travelTo(destination,()=>{
      if(flowTarget!==destination||flowGates.length){advanceFlow();return;}
      const kind=flowKind;flowTarget=null;flowKind=null;motionPercent=null;moving=false;
      if(kind==='demo')previewPercent=destination;paint();
    });
  }
  function startDemo(){
    if(!isOpen())return;
    if(flowKind==='demo'){const at=currentModel().percent;cancelJourney();previewPercent=at;paint();return;}
    cancelJourney();clearPulse();previewPercent=100;
    if(!motionAllowed()){paint();return;}
    motionPercent=0;flowKind='demo';flowTarget=100;flowGates=[25,50,75,100];clearCameraGesture();zoom=1;panX=panY=0;camera();paint();advanceFlow();
  }
  function routeUI(model){
    const route=root.FocusCitadelRoute?.build(model.percent);
    const stage=Math.min(4,Math.floor(model.percent/25)),next=places.find(p=>p.id===gateIds[stage]);
    setText('citadel-route-value',percent(model.percent));
    setText('citadel-route-copy',model.percent>=100?'四站已抵达 · 今日远征圆满完成':`下一站 ${String(stage+1).padStart(2,'0')} · ${next.name} · 再完成 ${duration(Math.max(0,model.target*next.threshold-model.minutes))}`);
    $('citadel-route-fill').style.width=Math.min(100,model.percent)+'%';
    $('citadel-route-total').setAttribute('aria-valuenow',String(Math.min(100,model.percent)));
    $('citadel-route-total').setAttribute('aria-valuetext',percent(model.percent));
    $('citadel-awakening').hidden=!awakening;
    if(awakening){setText('citadel-awakening-title',gateTitles[awakening.stage-1]);setText('citadel-awakening-copy',`${String(awakening.stage).padStart(2,'0')} / 04 · ${awakening.stage*25}% 已抵达`);$('citadel-awakening').dataset.stage=awakening.stage;}
    $('citadel-stage').dataset.walking=String(moving);setText('citadel-demo',flowKind==='demo'?'停止演示':'演示完整旅程 ▷');
    $('citadel-demo').setAttribute('aria-pressed',String(flowKind==='demo'));
    for(const button of $('citadel-locations').querySelectorAll('[data-citadel-select]')){button.dataset.current=String(route?.toId===button.dataset.citadelSelect&&model.percent<100);}
  }
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
  function clearPulse(){pulseGeneration++;if(pulseTimer!==null)root.clearTimeout(pulseTimer);pulseTimer=null;pulse=null;}
  function finishDrag(){
    const previous=drag;drag=null;
    if(previous?.moved)suppressClickUntil=Date.now()+250;
    const stage=$('citadel-stage');stage.classList.remove('dragging');
    if(previous&&stage.hasPointerCapture?.(previous.id))stage.releasePointerCapture?.(previous.id);
  }
  function finishWheel(){
    if(wheelTimer!==null)root.clearTimeout(wheelTimer);wheelTimer=null;
    $('citadel-stage').classList.remove('wheeling');
  }
  function clearCameraGesture(){finishDrag();finishWheel();}
  function wheelCamera(event){
    if(!isOpen()||event.defaultPrevented)return;
    event.preventDefault();
    if(document.querySelector('dialog[open]')||($('quick-skins')&&!$('quick-skins').hidden)||event.target.closest('button,input,select,textarea'))return;
    const stage=$('citadel-stage'),rect=stage.getBoundingClientRect();
    if(!(rect.width>0&&rect.height>0)||!Number.isFinite(event.deltaY)||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1);
    if(!pixels)return;
    // A wheel gesture can interrupt a button's eased transition. Start from
    // the visible camera, rather than jumping to that transition's endpoint.
    if(!stage.classList.contains('wheeling')&&root.DOMMatrixReadOnly&&root.getComputedStyle){
      const matrix=new root.DOMMatrixReadOnly(root.getComputedStyle($('citadel-camera')).transform);
      if(matrix.a>=1&&matrix.a<=2.4&&matrix.b===0&&matrix.c===0&&matrix.a===matrix.d){zoom=matrix.a;panX=matrix.e/rect.width*100;panY=matrix.f/rect.height*100;}
    }
    const next=Math.max(1,Math.min(2.4,zoom*Math.exp(-Math.max(-240,Math.min(240,pixels))*.002)));
    if(next===zoom)return;
    finishDrag();finishWheel();
    // Keep the world point under the cursor stationary as the camera scales.
    const x=(event.clientX-rect.left)/rect.width*100-50,y=(event.clientY-rect.top)/rect.height*100-50,ratio=next/zoom;
    panX=x-(x-panX)*ratio;panY=y-(y-panY)*ratio;zoom=next;
    stage.classList.add('wheeling');camera();
    const timer=root.setTimeout(()=>{if(wheelTimer!==timer)return;wheelTimer=null;stage.classList.remove('wheeling');},160);wheelTimer=timer;
  }
  function clampCamera(){const limit=(zoom-1)*50;panX=Math.max(-limit,Math.min(limit,panX));panY=Math.max(-limit,Math.min(limit,panY));}
  function camera(){
    clampCamera();$('citadel-camera').style.transform=`translate(${panX}%,${panY}%) scale(${zoom})`;
    $('citadel-stage').dataset.zoomed=String(zoom>1);
    setText('citadel-zoom',Math.round(zoom*100)+'%');$('citadel-zoom-out').disabled=zoom<=1;$('citadel-zoom-in').disabled=zoom>=2.4;
  }
  function center(place){panX=(50-place.x/12)*zoom;panY=(50-place.y/7.2)*zoom;camera();}
  function select(id,approach=true){if(!places.some(p=>p.id===id))return;clearCameraGesture();selected=id;clearPulse();setText('citadel-feedback','');if(approach){zoom=2;center(places.find(p=>p.id===id));}paint();}
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
    if(selected==='core')html=`<strong>${duration(model.minutes)} <small>汇入星庭的专注</small></strong><div class="citadel-meter"><i style="width:${model.progress*100}%"></i></div><p>${model.complete?'今日星庭已完全展开，额外的专注仍会化作余辉。':`星辉引擎 ${percent(model.percent)} · 每日目标 ${duration(model.target)}`}</p>`;
    if(selected==='workshop'||selected==='observatory')html=`<div class="citadel-subject-list">${model.subjects.map(s=>`<div><span>${esc(s.name)}</span><i><b style="width:${s.progress*100}%"></b></i><strong>${percent(s.percent)}</strong></div>`).join('')}</div><p>${selected==='observatory'?`${model.subjects.filter(s=>s.complete).length} / 4 枚星标已经点亮。`:'回路各自记录四科的完成比例，超过目标的努力也会完整显示。'}</p>`;
    if(selected==='archive')html=previewPercent!==null?'<p>正在预览城市生长。返回实际进度，即可查看这一天的真实航迹。</p>':rows.length?`<ul class="citadel-records">${rows.slice(0,4).map(r=>`<li><span>${esc(r.name)}</span><b>${duration(r.minutes)}</b></li>`).join('')}</ul><p>最近 ${Math.min(4,rows.length)} 段 · 共 ${recordCount()} 段${recordCount()>rows.length?'；回放含较早记录的起点与最近航迹':'，可回放整天的旅程'}。</p>`:'<p>书页暂时留白。完成第一段专注后，它会自动收藏在这里。</p>';
    if(selected==='gate')html=`<strong>${model.afterglow.active?duration(model.afterglow.minutes):percent(model.percent)} <small>${model.afterglow.active?'目标之外的余辉':'门扉能量'}</small></strong><p>${model.complete?'门已为你打开。此刻可以继续探索，也可以安心休息。':'门上的星纹随进度汇聚，完成目标后会展开完整光环。'}</p>`;
    $('citadel-place-data').innerHTML=html;
  }
  function paint(onlyMotion=false){
    if(!isOpen()||!state)return;
    const model=currentModel(),eq=visibleEquipment();
    const actual=root.FocusExpeditionModel.build(state),summary=previewPercent===null?actual:model;
    const theme=(state.quests?.catalog||[]).find(item=>item.id===eq.theme)?.name||'晨雾星岛';
    setText('citadel-summary',`${state.date===state.today?'今天':state.date} · ${duration(summary.minutes)} / ${duration(summary.target)} · ${percent(summary.percent)}`);
    setText('citadel-theme',theme);$('citadel-view').dataset.preview=String(previewPercent!==null);
    $('citadel-view').dataset.motion=String(state.settings?.motion!==false);
    setText('citadel-mode',flowKind==='demo'?'旅程演示 · 按顺序体验四次觉醒':previewPercent!==null?'生长预览 · 学习记录保持原样':flowKind==='live'?'新专注正在汇入城市 · 旅人沿光路前进':state.date===state.today?'这座城正随今天的专注生长':'历史景象 · 这一天的努力留在这里');
    $('citadel-preview-controls').hidden=previewPercent===null;
    $('citadel-preview-toggle').setAttribute('aria-pressed',String(previewPercent!==null));
    setText('citadel-preview-toggle',previewPercent===null?'预览城市生长':'返回实际进度');
    if(previewPercent!==null){$('citadel-preview-range').value=model.percent;setText('citadel-preview-value',percent(model.percent));}
    const key=JSON.stringify([model.stage,model.goalSet,model.subjects.map(s=>[s.id,s.complete]),eq,selected,pulse,awakening?.token,model.date]);
    const rebuilt=key!==artKey;
    if(key!==artKey){
      artKey=key;const focused=$('citadel-scene').contains(document.activeElement)?document.activeElement?.closest('[data-citadel-place]')?.dataset.citadelPlace:null;
      $('citadel-scene').innerHTML=root.FocusCitadelArt.scene(model,eq,{interactive:true,selected,pulse,awakening});
      if(focused)$('citadel-scene').querySelector(`[data-citadel-place="${focused}"]`)?.focus({preventScroll:true});
    }
    root.FocusCitadelArt.updateProgress?.($('citadel-scene').querySelector('svg'),model);
    routeUI(model);
    for(const button of $('citadel-locations').querySelectorAll('[data-citadel-select]')){const place=places.find(p=>p.id===button.dataset.citadelSelect);button.setAttribute('aria-pressed',String(selected===place.id));button.dataset.awake=String(unlocked(place,model));}
    if(!onlyMotion||rebuilt)detail(model);
  }
  function render(next){
    if(!next)return;
    const previous=state,changedDate=state&&state.date!==next.date;
    const reset=state&&(changedDate||state.totals.target!==next.totals.target||next.totals.minutes<state.totals.minutes);
    if(changedDate){clearCameraGesture();clearPulse();previewPercent=null;selected='core';zoom=1;panX=panY=0;artKey=detailKey='';if(isOpen())camera();}
    if(reset)cancelJourney();state=next;
    if(!motionAllowed()){cancelJourney();finishPageSlide();}
    const pending=pendingProgress;pendingProgress=null;
    if(pending&&isOpen()&&previewPercent===null&&pending.date===next.date&&pending.target===next.totals.target&&pending.percent===next.totals.minutes/next.totals.target*100){
      if(flowKind!=='live')motionPercent=previous?previous.totals.minutes/previous.totals.target*100:pending.from;
      flowKind='live';flowTarget=pending.percent;
      flowGates=[...new Set([...flowGates,...pending.gates])].filter(gate=>gate>(motionPercent??0)+.00001&&gate!==awakening?.stage*25).sort((a,b)=>a-b);
      applyEquipment(next.quests?.equipped||equipped,next.quests?.now);paint();
      if(raf===null&&awakeningTimer===null)advanceFlow();return;
    }
    // Quiet edits/imports are a new baseline, never a new milestone ceremony.
    if(flowKind==='live'&&previous&&previous.totals.minutes!==next.totals.minutes)cancelJourney();
    applyEquipment(next.quests?.equipped||equipped,next.quests?.now);if(isOpen())paint();
  }
  function open(from){
    const latest=bridge.getState?.();if(latest)render(latest);
    if(!state||(isOpen()&&!closing)||document.querySelector('dialog[open]'))return false;
    // Release the camp's inert ownership before saving the underlying page.
    root.FocusCampfireRoom?.close(false);
    bridge.leaveExpedition?.();root.FocusQuickSkins?.close(false);cancelJourney();
    if(!isOpen()){
      anchor=from||document.activeElement;
      inertBefore=Array.from(document.querySelectorAll('body > main')).map(element=>[element,element.inert]);
      background=document.querySelector('body > main')||inertBefore[0]?.[0];
    }
    closing=false;clearCameraGesture();selected='core';zoom=1;panX=panY=0;previewPercent=null;artKey=detailKey='';clearPulse();setText('citadel-feedback','');
    for(const [element] of inertBefore)element.inert=true;
    $('citadel-view').inert=false;$('citadel-view').hidden=false;document.documentElement.classList.add('has-citadel-view');
    camera();paint();slidePage(true);$('citadel-close').focus({preventScroll:true});return true;
  }
  function close(restoreFocus=true){
    if(!isOpen()||(closing&&restoreFocus))return false;
    closing=true;$('citadel-view').inert=true;
    root.FocusQuickSkins?.close(false);cancelJourney();clearPulse();clearCameraGesture();previewPercent=null;equipmentPreview=null;
    document.documentElement.classList.remove('has-citadel-view');
    const finish=()=>{
      $('citadel-view').hidden=true;$('citadel-view').inert=false;
      for(const [element,previous] of inertBefore)element.inert=previous;inertBefore=[];
      const from=anchor;anchor=null;background=null;closing=false;
      if(restoreFocus&&!focusEntry(from))focusEntry($('citadel-enter'));
      bridge.afterClose?.();
    };
    if(restoreFocus)slidePage(false,finish);else{cancelPageSlide();finish();}
    return true;
  }
  function interact(){
    if(!isOpen()||pulse||!unlocked(places.find(p=>p.id===selected),currentModel()))return;
    const pulseToken=++pulseGeneration;pulse=selected;paint();setText('citadel-feedback',`${places.find(p=>p.id===selected).name}回应了你的触碰。`);
    pulseTimer=root.setTimeout(()=>{if(pulseToken!==pulseGeneration)return;pulseTimer=null;pulse=null;if(isOpen())paint();},state.settings?.motion===false||root.matchMedia?.('(prefers-reduced-motion: reduce)').matches?600:2600);
  }
  function preview(itemId,base){
    const latest=bridge.getState?.()||state, item=(latest?.quests?.catalog||[]).find(item=>item.id===itemId&&slots.has(item.slot));
    if(!item||!root.FocusCitadelArt||!root.FocusExpeditionModel)return '';
    const model=root.FocusExpeditionModel.preview(latest,100),eq={...(base||latest.quests.equipped),[item.slot]:item.id};
    return `<div class="citadel-full-preview">${root.FocusCitadelArt.scene(model,eq,{interactive:false})}<div><strong>星辉城 · 完整觉醒预览</strong><span>${esc(item.name)} · 保留其余当前装备</span></div></div><p class="citadel-preview-note">展示当日目标完成后的造型；旅人服装在 25%、50%、75%、100% 四站逐步获得装饰，装备后随真实进度成长。</p>`;
  }
  function init(callbacks={}){
    bridge=callbacks;if(initialized)return;initialized=true;
    $('citadel-enter').addEventListener('click',event=>{if(!event.ctrlKey)open(event.currentTarget);});
    document.querySelector('.quest-scene').addEventListener('click',event=>{if(event.target.closest?.('#campfire-room-open,[data-island-gift]'))return;if(event.button===0&&!event.ctrlKey)open($('citadel-enter'));});
    $('citadel-close').addEventListener('click',()=>close());
    $('citadel-shop').addEventListener('click',()=>{close(false);bridge.openShop?.();});
    $('citadel-replay').addEventListener('click',()=>{if(previewPercent!==null)return;close();bridge.replayDay?.();});
    $('citadel-interact').addEventListener('click',interact);
    $('citadel-locations').innerHTML=['core','dock',...gateIds].map(id=>places.find(p=>p.id===id)).map(p=>`<button type="button" data-citadel-select="${p.id}" aria-pressed="false"><span>${p.threshold?String(gateIds.indexOf(p.id)+1).padStart(2,'0'):p.icon}</span><strong>${p.id==='core'?'主岛总览':p.name}</strong><small>${p.threshold?p.threshold*100+'%':p.id==='core'?'总能量':'出发 0%'}</small></button>`).join('');
    $('citadel-locations').addEventListener('click',event=>{const button=event.target.closest('[data-citadel-select]');if(button)select(button.dataset.citadelSelect);});
    $('citadel-scene').addEventListener('click',event=>{if(event.ctrlKey||event.button!==0||Date.now()<suppressClickUntil)return;const place=event.target.closest('[data-citadel-place]');if(place)select(place.dataset.citadelPlace);});
    $('citadel-scene').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const place=event.target.closest('[data-citadel-place]');if(place){event.preventDefault();select(place.dataset.citadelPlace);}}});
    $('citadel-overview').addEventListener('click',()=>{clearCameraGesture();zoom=1;panX=panY=0;camera();});
    for(const [id,delta] of [['citadel-zoom-in',.4],['citadel-zoom-out',-.4]])$(id).addEventListener('click',()=>{clearCameraGesture();zoom=Math.round(Math.max(1,Math.min(2.4,zoom+delta))*10)/10;if(zoom===1){panX=panY=0;camera();}else center(places.find(p=>p.id===selected));});
    $('citadel-preview-toggle').addEventListener('click',()=>{const at=currentModel().percent,enter=previewPercent===null;cancelJourney();clearPulse();previewPercent=enter?Math.min(100,Math.round(at)):null;paint();});
    $('citadel-demo').addEventListener('click',startDemo);
    $('citadel-preview-range').addEventListener('input',event=>{const before=currentModel().percent;cancelJourney();clearPulse();previewPercent=Math.max(0,Math.min(100,Number(event.target.value)||0));const stage=Math.min(4,Math.floor(previewPercent/25));paint();if(stage>Math.floor(before/25)&&motionAllowed())awaken(stage*25,()=>{});});
    root.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>{if(!motionAllowed()){cancelJourney();finishPageSlide();if(isOpen())paint();}});
    const suspend=()=>{finishPageSlide();cancelJourney();clearPulse();clearCameraGesture();};
    document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
    document.addEventListener('focusquest:visibility',event=>{if(event.detail?.visible===false)suspend();});
    const stage=$('citadel-stage');
    stage.addEventListener('wheel',wheelCamera,{passive:false});
    stage.addEventListener('pointerdown',event=>{if(zoom<=1||event.button!==0||event.ctrlKey||event.target.closest('button'))return;finishWheel();drag={id:event.pointerId,x:event.clientX,y:event.clientY,px:panX,py:panY,moved:false};});
    stage.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<5)return;drag.moved=true;stage.setPointerCapture?.(event.pointerId);stage.classList.add('dragging');const rect=stage.getBoundingClientRect();panX=drag.px+dx/rect.width*100;panY=drag.py+dy/rect.height*100;camera();});
    stage.addEventListener('pointerup',finishDrag);stage.addEventListener('pointercancel',finishDrag);stage.addEventListener('lostpointercapture',finishDrag);
    document.addEventListener('keydown',event=>{
      if(!isOpen()||event.defaultPrevented||document.querySelector('dialog[open]'))return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
      if(event.key!=='Tab')return;
      const quick=$('quick-skins');if(!quick||quick.hidden)return;
      const container=quick;
      const nodes=Array.from(container.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')).filter(el=>!el.closest('[hidden]')&&el.getClientRects().length);
      const first=nodes[0],last=nodes[nodes.length-1];if(!first)return;
      if(!container.contains(document.activeElement)||(event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last)){event.preventDefault();(event.shiftKey?last:first).focus();}
    },true);
  }
  root.FocusCitadel={init,render,open,close,isOpen,applyEquipment,previewEquipment,preview,acceptProgress};
})(typeof globalThis!=='undefined'?globalThis:this);
