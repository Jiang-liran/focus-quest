(function(root){
  'use strict';
  const $=id=>document.getElementById(id),modelApi=()=>root.FocusExpeditionModel;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=value=>Number(value||0).toLocaleString('zh-CN',{maximumFractionDigits:1});
  const percent=value=>num(value<100?Math.min(99.9,value):value);
  const duration=value=>{
    const total=Math.max(value>0?1:0,Math.floor(Number(value||0)*60+1e-6)),hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),seconds=total%60;
    return `${hours?hours+'小时':''}${minutes?minutes+(seconds?'分':'分钟'):''}${seconds?seconds+'秒':''}`||'0分钟';
  };
  const clock=value=>value?new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'启程';
  const glyph={math:'∑',cs:'⌘',politics:'✦',english:'Aa'};
  let bridge=null,latest=null,mode='live',previewPercent=null,replay=null,index=0,playing=false,timer=null,generation=0;
  let selected=null,discovery=null,immersive=false,arrivalTimer=null,arrivalGeneration=0;
  const cache=new Map();
  function replace(id,html){
    if(cache.get(id)===html)return;
    const container=$(id),active=document.activeElement;
    const attribute=['data-expedition-subject','data-expedition-discovery','data-expedition-frame'].find(name=>container.contains(active)&&active?.hasAttribute(name));
    const value=attribute?active.getAttribute(attribute):null;
    container.innerHTML=html;cache.set(id,html);
    if(attribute)Array.from(container.querySelectorAll(`[${attribute}]`)).find(node=>node.getAttribute(attribute)===value)?.focus({preventScroll:true});
  }
  function reduced(){return latest?.settings?.motion===false||Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);}
  function cancelTimer(){generation++;if(timer!==null)root.clearTimeout(timer);timer=null;}
  function visualModel(){
    if(!latest)return null;
    return mode==='replay'?replay?.frames[index]?.model:mode==='preview'?modelApi().preview(latest,previewPercent):null;
  }
  function model(){return visualModel()||modelApi().build(latest);}
  function stop(shouldPaint=true){cancelTimer();mode='live';playing=false;replay=null;index=0;previewPercent=null;if(shouldPaint&&latest)paint();}
  function render(next){
    if(!bridge||!next)return;
    if(latest&&next.date!==latest.date){stop(false);selected=null;discovery=null;clearArrival();}
    latest=next;
    if(reduced()&&playing){playing=false;cancelTimer();}
    paint();
  }
  function preview(percent){
    if(!latest)return;
    stop(false);
    if(percent!==null){mode='preview';previewPercent=Math.max(0,Number(percent)||0);}
    paint();
  }
  function sceneDescription(m){
    const done=m.subjects.filter(s=>s.complete).length;
    const picked=m.subjects.find(s=>s.id===selected),note=$('expedition-map-note');
    note.hidden=!picked;
    note.textContent=picked?`${picked.name} · ${picked.landmark}\n${duration(picked.minutes)} / ${duration(picked.target)} · ${percent(picked.percent)}%`:'';
    $('expedition-world-count').textContent=`四科共鸣 ${done} / 4`;
    $('expedition-map-title').textContent=m.complete?'归途的灯塔，已为你点亮。':m.minutes?`此刻抵达 · ${m.currentDiscovery.name}`:'雾中的群岛，正等待第一束光。';
    $('expedition-map-caption').textContent=m.afterglow.active?`余晖星痕 · 超额 ${duration(m.afterglow.minutes)}，也已留下光。`:'点击岛屿探访 · 学习让建筑生长，星桥逐渐亮起';
    const state=$('expedition-scene-state');state.hidden=mode==='live';
    state.textContent=mode==='preview'?`成长演示 · ${percent(m.percent)}% · 不改变记录`:`远征回放 · ${percent(m.percent)}% · ${playing?'播放中':'已暂停'} · 不改变记录`;
  }
  function detail(m){
    const subject=m.subjects.find(s=>s.id===selected);
    const entry=m.discoveries.find(d=>d.id===discovery&&d.unlocked)||m.currentDiscovery;
    $('expedition-overview').hidden=!subject&&!discovery;
    $('expedition-detail-kicker').textContent=subject?`${subject.name} · ${subject.complete?'设施已建成':'建设中的岛屿'}`:`第 ${entry.index+1} 处路标 · 群岛游乐记`;
    $('expedition-detail-title').textContent=subject?subject.landmark:entry.name;
    $('expedition-detail-copy').textContent=subject?`${subject.description} ${subject.complete?'今日的灯已点亮，额外积累也会留在星光里。':subject.minutes?'每一段完成的专注，都在为这里添上新的细节。':'第一段专注结束后，这里的建设就会开始。'}`:entry.narrative;
    $('expedition-next').textContent=subject?(subject.goalSet?`${duration(subject.minutes)} / ${duration(subject.target)} · ${percent(subject.percent)}%${subject.complete?' · 可以安心欣赏，也可以继续自由探索':` · 建成还需 ${duration(subject.remainingMinutes)}`}`:'请在设置中为这科安排目标。'):m.nextDiscovery?`下一处 · ${m.nextDiscovery.name}，再积累 ${duration(m.nextDiscovery.remainingMinutes)} 就能看见。`:m.complete?'这一天的见闻已完整。归光之后，休息也属于旅程。':'先设定目标，让远方有一个方向。';
    $('expedition-discovery-count').textContent='3 类玩法 · 7 处风景';
    replace('expedition-discoveries',m.discoveries.map(d=>`<button type="button" class="expedition-discovery ${d.unlocked?'unlocked':'locked'}" data-expedition-discovery="${esc(d.id)}" ${d.unlocked?'':'disabled'} aria-pressed="${entry.id===d.id&&!subject}"><span class="discovery-stamp" aria-hidden="true"><svg viewBox="0 0 64 48"><path d="M8 39 23 15l12 17 9-24 13 31Z"/><circle cx="46" cy="12" r="5"/><path d="M8 43h49M21 39l5-9 8 9"/></svg><i>${String(d.index+1).padStart(2,'0')}</i></span><strong>${esc(d.name)}</strong><small>${d.unlocked?'去这里玩一局':`主线 ${d.threshold}% 后显现`}</small></button>`).join(''));
  }
  function frameCopy(frame){
    if(frame.type==='start')return frame.baseline?`较早记录已计入起点 · ${duration(frame.minutes)}，从可读取的记录继续回顾。`:'从第一束微光开始，看看这一天如何展开。';
    const names=[...new Set(frame.records.map(r=>r.name))];
    return `${clock(frame.at)} · ${names.slice(0,2).join('、')}${names.length>2?'等':''} · +${duration(frame.deltaMinutes)}${frame.completedCount>1?`（合并回顾 ${frame.completedCount} 段）`:''}`;
  }
  function replayUI(){
    const liveFrames=mode==='replay'?replay:modelApi().replayFrames(latest,{maxFrames:24}),summary=liveFrames.summary;
    $('expedition-replay').disabled=!summary.replayable;
    $('expedition-replay').textContent=mode==='replay'?'从头回顾 ↺':latest.date===latest.today?'回放今日 ▷':'回放这一天 ▷';
    $('expedition-log-summary').textContent=!summary.consistent?'这一天的记录正在核对，暂时保留完整的统计画面。':summary.totalRecords?`${summary.totalRecords} 段专注 · ${duration(summary.minutes)}${summary.partial?' · 较早记录已计入回放起点':''}${summary.grouped?' · 相邻记录合并成幕':''}`:'还没有完成记录。第一次专注结束，这里就会留下一束回声。';
    $('expedition-replay-controls').hidden=mode!=='replay';
    if(mode==='replay'){
      const atEnd=index===replay.frames.length-1;
      $('expedition-play').textContent=playing?'暂停':atEnd?'重新播放':'播放';
      $('expedition-play').disabled=reduced();
      $('expedition-step').disabled=atEnd;
      $('expedition-frame-number').textContent=`${index+1} / ${replay.frames.length} 幕`;
      $('expedition-scrub').max=replay.frames.length-1;$('expedition-scrub').value=index;
      $('expedition-frame-copy').textContent=frameCopy(replay.frames[index])+(reduced()?' · 动态已关闭，可逐幕查看。':atEnd?' · 回顾结束，随时返回实时进度。':'');
    }
    const frames=liveFrames.frames.filter(f=>f.type==='completion').slice(-4);
    replace('expedition-trail',frames.map(f=>`<button type="button" data-expedition-frame="${f.index}" aria-label="查看${esc(clock(f.at))}完成的${f.completedCount}段专注" title="${esc(frameCopy(f))}"><span aria-hidden="true">✧</span><strong>${clock(f.at)}</strong><small>+${duration(f.deltaMinutes)}</small></button>`).join(''));
  }
  function paint(){
    if(!latest)return;
    const m=model();
    $('quest-hero').dataset.expeditionMode=mode;
    $('expedition-canvas').dataset.focus=selected||'';
    $('expedition-canvas').dataset.afterglow=String(m.afterglow.active);
    const key=JSON.stringify([m.progress,m.stage,m.subjects.map(s=>[s.id,s.progress,s.percent])]);
    if(cache.get('world')!==key){
      replace('expedition-world',root.FocusExpeditionArt.world(m));cache.set('world',key);
    }
    replace('expedition-subjects',m.subjects.map(s=>`<button type="button" data-expedition-subject="${s.id}" aria-pressed="${selected===s.id}" class="${s.complete?'complete':''}" style="--isle-color:${{math:'#99d8c1',cs:'#b5aceb',politics:'#e3c295',english:'#a0cfe5'}[s.id]}"><i aria-hidden="true">${glyph[s.id]}</i><span><strong>${s.name} <small>${s.landmark}</small></strong><em>${s.complete?'星桥已共鸣':s.minutes?'设施建设中':'等待第一束光'}</em></span><b>${percent(s.percent)}%</b></button>`).join(''));
    sceneDescription(m);detail(m);replayUI();
    bridge.renderHero();
  }
  function schedule(){
    cancelTimer();if(!playing||mode!=='replay'||reduced())return;
    const token=generation;
    timer=root.setTimeout(()=>{
      if(token!==generation||!playing||mode!=='replay')return;
      index=Math.min(index+1,replay.frames.length-1);if(index===replay.frames.length-1)playing=false;
      paint();schedule();
    },1300);
  }
  function startReplay(at=0,autoplay=true){
    if(!latest)return;
    const frames=modelApi().replayFrames(latest,{maxFrames:24});if(!frames.summary.replayable)return;
    root.FocusQuickSkins?.close(false);
    bridge.stopPreview();stop(false);clearArrival();
    replay=frames;mode='replay';index=Math.max(0,Math.min(frames.frames.length-1,Number(at)||0));
    selected=null;discovery=null;playing=autoplay&&!reduced()&&index<frames.frames.length-1;
    paint();schedule();
    $('expedition-canvas').scrollIntoView?.({block:'start',behavior:reduced()?'auto':'smooth'});
  }
  function pause(){playing=false;cancelTimer();if(latest)paint();}
  function step(){if(mode!=='replay'){startReplay(1,false);return;}pause();index=Math.min(index+1,replay.frames.length-1);paint();}
  function immerse(value){
    immersive=Boolean(value);$('quest-hero').classList.toggle('expedition-immersive',immersive);
    document.documentElement.classList.toggle('has-expedition-immersive',immersive);
    $('expedition-immerse').textContent=immersive?'收起主舞台 ×':'展开主舞台 ↗';
    $('expedition-immerse').setAttribute('aria-pressed',String(immersive));
  }
  function clearArrival(){arrivalGeneration++;if(arrivalTimer!==null)root.clearTimeout(arrivalTimer);arrivalTimer=null;$('expedition-arrival').hidden=true;$('expedition-canvas').classList.remove('receiving-focus');}
  function noteArrival(records,next){
    if(!bridge||mode!=='live'||!records?.length||next.date!==next.today||bridge.isHome?.()===false)return;
    const valid=records.filter(r=>r.day===next.date&&r.minutes>0);if(!valid.length)return;
    clearArrival();const token=arrivalGeneration,minutes=valid.reduce((sum,r)=>sum+r.minutes,0);
    $('expedition-arrival').textContent=`✦ ${valid.length} 段专注化作流光 · +${duration(minutes)}`;
    $('expedition-arrival').hidden=false;
    if(next.settings?.motion!==false&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches)$('expedition-canvas').classList.add('receiving-focus');
    arrivalTimer=root.setTimeout(()=>{if(token===arrivalGeneration)clearArrival();},5500);
  }
  function leave(){stop();immerse(false);clearArrival();}
  function init(callbacks){
    if(bridge)return;bridge=callbacks;
    $('expedition-replay').addEventListener('click',()=>startReplay());
    $('expedition-live').addEventListener('click',()=>stop());
    $('expedition-play').addEventListener('click',()=>{if(mode!=='replay'||reduced())return;if(playing)pause();else{if(index===replay.frames.length-1)index=0;playing=true;paint();schedule();}});
    $('expedition-step').addEventListener('click',step);
    $('expedition-scrub').addEventListener('input',event=>{if(mode!=='replay')return;const value=Number(event.target.value)||0;playing=false;cancelTimer();index=Math.max(0,Math.min(replay.frames.length-1,Math.round(value)));paint();});
    $('expedition-immerse').addEventListener('click',()=>immerse(!immersive));
    $('expedition-overview').addEventListener('click',()=>{selected=null;discovery=null;paint();});
    $('expedition-discover-toggle').addEventListener('click',()=>{if(root.FocusArcade){const m=model();root.FocusArcade.open(discovery||m.currentDiscovery.id);return;}const panel=$('expedition-discoveries');panel.hidden=!panel.hidden;$('expedition-discover-toggle').setAttribute('aria-expanded',String(!panel.hidden));});
    $('quest-hero').addEventListener('click',event=>{
      const subject=event.target.closest('[data-expedition-subject]'),entry=event.target.closest('[data-expedition-discovery]'),frame=event.target.closest('[data-expedition-frame]');
      if(subject&&model().subjects.some(s=>s.id===subject.dataset.expeditionSubject)){selected=subject.dataset.expeditionSubject;discovery=null;paint();}
      else if(entry&&model().discoveries.some(d=>d.id===entry.dataset.expeditionDiscovery&&d.unlocked)){if(root.FocusArcade){root.FocusArcade.open(entry.dataset.expeditionDiscovery);return;}discovery=entry.dataset.expeditionDiscovery;selected=null;paint();}
      else if(frame){
        const target=Number(frame.dataset.expeditionFrame)||0;
        if(mode==='replay'){playing=false;cancelTimer();index=Math.max(0,Math.min(replay.frames.length-1,target));paint();}
        else startReplay(target,false);
      }
    });
    $('expedition-world').addEventListener('keydown',event=>{
      const target=event.target.closest('[data-expedition-subject]');if(target&&['Enter',' '].includes(event.key)){event.preventDefault();selected=target.dataset.expeditionSubject;discovery=null;paint();}
    });
    document.addEventListener('keydown',event=>{if(event.defaultPrevented||event.key!=='Escape'||document.querySelector('dialog[open]'))return;if(immersive){immerse(false);event.preventDefault();}else if(mode==='replay'){stop();event.preventDefault();}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)pause();});
    root.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>{if(reduced())pause();else if(latest)paint();});
  }
  root.FocusExpedition={init,render,preview,visualModel,startReplay,stop,pause,leave,noteArrival};
})(typeof globalThis!=='undefined'?globalThis:this);
