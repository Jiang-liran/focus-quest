'use strict';

const $ = (id) => document.getElementById(id);
const subjectsMeta = {
  math: {name:'数学', color:'#83c7b0', icon:'book', subtitle:'逻辑的每一步，都在积累'},
  cs: {name:'408', color:'#a59cde', icon:'code', subtitle:'让知识之间，建立连接'},
  politics: {name:'政治', color:'#d9b087', icon:'flag', subtitle:'一点一滴，构筑理解'},
  english: {name:'英语', color:'#80b4d3', icon:'book', subtitle:'每天一点，语感会生长'},
  other: {name:'待分类', color:'#9994aa', icon:'grid', subtitle:''}
};
const stageNames = ['整装出发','突破外围','深入核心','决战在即','今日通关'];
const stageTitles = ['每一分钟，都算数。','第一道迷雾，已散去。','路程过半，稳步向前。','光就在前方，继续前行。','今日远征，圆满通关。'];
const stageMessages = ['今天的远征，从一小段专注开始。','第一座路标已点亮，脚步正在变成力量。','你的投入，正在慢慢变成看得见的积累。','已经走过四分之三，按自己的节奏完成。','今天已经做得足够好了，安心收下这份成就。'];
const viewNames = {today:'今日远征',quests:'委托广场',shop:'星织商店',history:'专注档案',achievements:'成长图鉴'};
const activityNames = {lecture:'听课',practice:'做题',other:'复习 / 其他'};
const levelRanks = [
  {min:1,max:9,name:'启程学徒',range:'Lv. 1–9'},
  {min:10,max:49,name:'知识游侠',range:'Lv. 10–49'},
  {min:50,max:149,name:'远征守护者',range:'Lv. 50–149'},
  {min:150,max:Infinity,name:'长期主义者',range:'Lv. 150 及以上'}
];
function levelRank(level) { return levelRanks.find(rank=>level>=rank.min && level<=rank.max)||levelRanks[0]; }
let state = null, currentView = 'today', selectedDate = null, inFlight = false, requestSequence = 0;
let baselineReady = false, seenRecords = new Set(), audioContext = null;
let activeDialogue = null, dialogueDate = null;
let weekChartState = null, weekChartRequest = 0, weekChartLoading = false;
let recordMutationBusy = false;
let scenePreviewPercent = null, subjectRenderKey = null, sceneSubjectKey = null;
let claimedEffects = null, celebrationQueue = [];
let openingPending = true, openingBusy = false, openingReady = null, openingCheckedDay = null, openingRetryAt = 0;
const subjectRewards = {math:['几何星图，已点亮。','思路一步步连起来，数学的今日目标已经完成。'],cs:['核心电路，已连通。','知识节点连接成网，408 的今日目标已经完成。'],politics:['信念旗帜，已升起。','一点一滴的理解，汇成了政治的今日成果。'],english:['语言之书，已展开。','每一次积累都在生长，英语的今日目标已经完成。']};

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function icon(name) { return `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`; }
function number(value, places=1) { return Number(value || 0).toLocaleString('zh-CN',{maximumFractionDigits:places}); }
function pct(value) { return number(value,1)+'%'; }
function hours(value) { return number(value/60,2); }
function duration(value) { const m=Math.round(value); return m>=60 ? `${Math.floor(m/60)}小时${m%60 ? `${m%60}分钟` : ''}` : `${m}分钟`; }
function durationHTML(value) { const m=Math.round(value); return m>=60 ? `${Math.floor(m/60)}<small>小时</small>${m%60 ? `${m%60}<small>分钟</small>` : ''}` : `${m}<small>分钟</small>`; }
function timeOf(value) { if(!value)return '—'; const d=new Date(value); return Number.isNaN(+d)?'—':d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}); }
function dateText(value) { const d=new Date(value+'T12:00:00'); return d.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'}); }
function stageOf(percent) { return Math.max(0,Math.min(4,Math.floor(percent/25))); }
function meta(id) { return subjectsMeta[id]||subjectsMeta.other; }
function localDay() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

async function api(path, body) {
  const options={cache:'no-store'};
  if(body!==undefined){ options.method='POST';options.headers={'Content-Type':'application/json'};options.body=JSON.stringify(body); }
  const response=await fetch(path,options);
  const data=await response.json();
  if(!response.ok) throw new Error(data.error||'本地服务暂时没有响应');
  return data;
}

async function refresh(force=false, quietRewards=false) {
  if(inFlight && !force) return;
  inFlight=true;
  const seq=++requestSequence;
  try {
    const data=await api('/api/state'+(selectedDate?'?date='+encodeURIComponent(selectedDate):''));
    if(seq!==requestSequence)return;
    checkNewRecords(data, quietRewards);
    state=data;
    if(weekChartState?.start===data.weekly.start)weekChartState=null;
    render();
    $('error-banner').hidden=true;
    if(weekChartState && !weekChartLoading){
      const chartRequest=weekChartRequest, chartStart=weekChartState.start;
      try{
        const chartData=await api('/api/state?date='+encodeURIComponent(chartStart));
        if(seq===requestSequence && chartRequest===weekChartRequest && weekChartState?.start===chartStart){
          weekChartState=chartData.weekly;renderWeek();
        }
      }catch(_){/* Keep the last visible week and retry with the next poll. */}
    }
    if(seq!==requestSequence)return;
    return data;
  } catch(error) {
    if(seq!==requestSequence)return;
    $('error-banner').textContent='暂时连接不到本地记录服务。已保存的记录仍在电脑里；程序会自动重试。';
    $('error-banner').hidden=false;
    $('source-label').textContent='本地服务连接中断';
    $('source-dot').classList.remove('connected');
  } finally { if(seq===requestSequence) inFlight=false; }
}

function checkNewRecords(next, quietRewards=false) {
  const recent=next.latestRecords || next.records;
  if(!baselineReady){recent.forEach(r=>seenRecords.add(r.id));baselineReady=true;seedEffectClaims(next);return;}
  if(state && state.date!==next.date)seedEffectClaims(next);
  const incoming=recent.filter(r=>!seenRecords.has(r.id));
  recent.forEach(r=>seenRecords.add(r.id));
  if(!incoming.length)return;
  // Historical imports contribute XP without pretending to be a freshly completed task.
  const fresh=incoming.filter(r=>Date.now()-new Date(r.end).getTime()<10*60*1000 && new Date(r.end).getTime()<=Date.now()+60000);
  if(!fresh.length)return;
  const gained=fresh.reduce((sum,r)=>sum+r.minutes,0);
  const unlocked=quietRewards?[]:FocusEffects.unlocks(state,next,fresh,effectClaims());
  unlocked.forEach(event=>rememberEffect(event));
  if(unlocked.length && next.settings.motion){
    celebrationQueue.push(...unlocked.map(event=>celebrationFor(event)));
    setTimeout(playNextCelebration,0);
  } else if(!quietRewards) {
    toast(`✦ ${fresh.length===1?fresh[0].name:`${fresh.length} 个专注任务`} · 自动交任务`, `+${duration(gained)} · +${number(gained)} XP${state && next.totals.level>state.totals.level?` · 升至 Lv. ${next.totals.level}`:''}`);
  }
  if(!quietRewards && next.settings.sound)playChime();
}

function render() {
  if(!state)return;
  const s=state,t=s.totals;
  document.documentElement.classList.toggle('no-motion',!s.settings.motion);
  $('date-button').textContent=dateText(s.date)+(s.date===s.today?' · 今天':'');
  $('date-picker').value=s.date;
  $('header-today').disabled=s.date===s.today;
  $('level').textContent=`Lv. ${t.level}`;
  $('level-name').textContent=levelRank(t.level).name;
  $('level-xp').textContent=`${t.levelXp} / ${t.levelTarget} XP · 下一级`;
  $('level-bar').style.width=(t.levelXp/t.levelTarget*100)+'%';
  const phone=s.calendarSync;
  $('source-label').textContent=phone?.enabled ? (s.sync.connected&&phone.connected?'电脑 + 手机 · 已连接':phone.connected?'手机已连接 · 电脑待连接':s.sync.connected?'电脑已连接 · 手机待连接':'记录同步 · 等待连接') : (s.sync.connected?'番茄 ToDo · 已连接':'番茄 ToDo · 等待连接');
  $('source-dot').classList.toggle('connected',s.sync.connected&&(!phone?.enabled||phone.connected));
  $('footer-sync').textContent=`本地存档 ${number(s.allTime.records,0)} 条 · ${phone?.enabled?(phone.connected?'手机日历自动同步中':'手机同步待恢复'):s.sync.connected?'每 '+s.sync.pollSeconds+' 秒自动捕获':'同步待恢复'}`;
  renderCalendarPending();
  renderHero();renderSubjects();renderAdvice();renderWeek();renderActivities();renderRecords();renderAchievements();updateViewTitle();
  if($('source-dialog').open)renderSource();
  if($('trash-dialog').open)renderTrash();
  globalThis.FocusQuests?.render(s.quests);
  maybeDailyOpening();
}

function noteOpeningArrival() {
  if(openingCheckedDay!==localDay())openingPending=true;
  maybeDailyOpening();
}
async function maybeDailyOpening() {
  if(!state || document.hidden || openingBusy || document.querySelector('dialog[open]'))return;
  if(openingReady){
    const ready=openingReady;openingReady=null;
    if(ready.day===localDay()){showOpening(ready);return;}
    openingPending=true;
  }
  if(!openingPending || Date.now()<openingRetryAt)return;
  if(openingCheckedDay===localDay()){openingPending=false;return;}
  openingBusy=true;
  try{
    // The service owns the daily claim, so reopening a window, reloading, or
    // opening another client cannot consume a second opening for the same day.
    const result=await api('/api/opening/claim',{});
    openingCheckedDay=result.day;openingPending=false;openingRetryAt=0;
    if(result.show)openingReady=result;
  }catch(_){
    // Opening copy is optional; a transient error must not interrupt learning.
    openingRetryAt=Date.now()+30000;
  }finally{
    openingBusy=false;
    if(openingReady)maybeDailyOpening();
    else playNextCelebration();
  }
}
function showOpening(context,preview=false) {
  const copy=FocusOpening.compose(context),dialog=$('opening-dialog');
  dialog.dataset.theme=copy.theme;dialog.dataset.period=copy.period;dialog.dataset.preview=String(preview);
  $('opening-eyebrow').textContent=copy.eyebrow;
  $('opening-time').textContent=`${dateText(context.day)} · ${timeOf(context.now)}`;
  $('opening-title').textContent=copy.title;$('opening-body').textContent=copy.body;
  $('opening-closing').textContent=copy.closing;
  $('opening-note').textContent=preview?'此刻开场预览 · 不占用每日首次，不增加记录或经验。':context.minutes>0?`今日已专注 ${duration(context.minutes)} · 每一段投入，都已记下。`:'每日开场 · 从此刻开始。';
  $('opening-done').textContent=preview?'返回设置':copy.button;
  if(!dialog.open)dialog.showModal();
}
async function previewOpening() {
  const button=$('opening-preview');button.disabled=true;
  try{
    const context=await api('/api/opening');
    // Keep the settings form underneath, including any unsaved edits.
    if($('settings-dialog').open)showOpening(context,true);
  }catch(error){toast('暂时无法预览开场',error.message,true);}
  finally{button.disabled=false;}
}

function pendingEnd(value) {
  const end=new Date(value);
  if(Number.isNaN(+end))return '日历结束时间';
  const day=`${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
  return (day===state.today?'今天 ':end.toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})+' ')+timeOf(value);
}
function renderCalendarPending() {
  const phone=state.calendarSync,box=$('calendar-pending');
  const pending=phone?.enabled?(phone.pendingRecords||[]):[];
  box.hidden=!pending.length;
  if(!pending.length){box.innerHTML='';return;}
  const lines=pending.slice(0,3).map(r=>`<p><b>${esc(r.name)}</b> · ${number(r.minutes)} 分钟 · 日历结束时间 ${esc(pendingEnd(r.end))}</p>`).join('');
  const content=`<strong>手机记录已收到 · 等待入账</strong>${lines}<small>结束时间到达后自动计入进度，无需重新添加。${phone.pendingCount>3?`另有 ${phone.pendingCount-3} 条等待记录。`:''}</small>`;
  if(box.innerHTML!==content)box.innerHTML=content;
}

function updateViewTitle() {
  $('page-crumb').textContent=viewNames[currentView];
  const campView=currentView==='quests'||currentView==='shop';
  $('date-button').hidden=campView;$('header-today').hidden=campView;
  if(campView)$('date-picker').classList.remove('visible');
  if(currentView==='today'){
    const history=state && state.date!==state.today;
    $('page-title').textContent=history?'回看走过的每一步。':'今天，也向前一点。';
    $('page-subtitle').textContent=history?`${dateText(state.date)}的专注，都有迹可循。`:'把每一段专注，变成看得见的成长。';
    $('greeting-eyebrow').textContent=history?'EVERY STEP COUNTS':'YOUR NEXT CHAPTER';
  }else if(currentView==='history'){
    $('page-title').textContent='每一份努力，都有记录。';
    $('page-subtitle').textContent='那些安静专注的时刻，已经成为了你的积累。';
    $('greeting-eyebrow').textContent='YOUR FOCUS ARCHIVE';
  }else if(currentView==='quests'){
    $('page-title').textContent='接一份委托，踏实地出发。';
    $('page-subtitle').textContent='四科全天可接，按自己的计划学习，让每段专注都有回响。';
    $('greeting-eyebrow').textContent='MEET YOUR COMPANIONS';
  }else if(currentView==='shop'){
    $('page-title').textContent='让努力，拥有自己的模样。';
    $('page-subtitle').textContent='每一件收藏，都来自你认真走过的时间。';
    $('greeting-eyebrow').textContent='EARNED THROUGH FOCUS';
  }else{
    $('page-title').textContent='成长，是日积月累的事。';
    $('page-subtitle').textContent='不和别人比较，只看见自己走过的路。';
    $('greeting-eyebrow').textContent='PROGRESS YOU CAN FEEL';
  }
}

function renderHero() {
  const t=state.totals, stage=stageOf(t.minutes/t.target*100);
  $('stage-tag').textContent=t.percent>100?'自由探索 · 已通关':stageNames[stage];
  $('hero-heading').textContent=stageTitles[stage];
  $('hero-message').textContent=t.percent>100?'额外的积累也已记下，现在可以安心休息。':stageMessages[stage];
  $('total-time').innerHTML=durationHTML(t.minutes);
  $('total-target').textContent=hours(t.target);
  $('remaining').textContent=t.minutes>=t.target ? (t.minutes>t.target?`已超额 ${duration(t.minutes-t.target)} · 休息也是远征的一部分`:'主线已完成 · 今天的努力值得庆祝'):`距离通关还需 ${duration(t.target-t.minutes)}`;
  $('total-percent').textContent=pct(t.percent);
  $('total-bar').style.width=Math.min(100,t.percent)+'%';
  const progress=document.querySelector('.total-progress');
  progress.setAttribute('aria-valuenow',Math.min(100,t.percent));progress.setAttribute('aria-valuetext',pct(t.percent));
  renderScene(scenePreviewPercent??(t.minutes/t.target*100));
}

function renderScene(percent) {
  const hero=$('quest-hero'),visual=FocusEffects.scene(percent),p=visual.progress;
  hero.dataset.stage=visual.stage;hero.dataset.preview=scenePreviewPercent!==null?'true':'false';
  const vars={'--energy':visual.glow,'--mist':visual.mistOpacity,'--path-offset':visual.pathOffset,
    '--crystal-scale':.72+p*.28,'--crystal-glow':(2+p*17)+'px','--crystal-tempo':(5-p*2)+'s',
    '--orbit-opacity':.1+p*.85,'--star-opacity':.12+p*.88,'--scene-brightness':.68+p*.45,'--halo-scale':.75+p*.4};
  for(const [key,value] of Object.entries(vars))hero.style.setProperty(key,value);
  // Color warms smoothly from moonlight to gold as the island wakes up.
  const rgb=[156+Math.round(p*79),171+Math.round(p*28),235-Math.round(p*80)];
  hero.style.setProperty('--scene-color',`rgb(${rgb.join(',')})`);
  $('scene-energy').textContent=pct(percent);$('scene-mode').textContent=scenePreviewPercent!==null?'动画预览':'星岛能量';
  const path=$('journey-path'),length=path.getTotalLength(),point=path.getPointAtLength(length*p);
  $('scene-traveler').style.transform=`translate(${point.x-171}px,${point.y-220}px)`;
  document.querySelectorAll('[data-checkpoint]').forEach(beacon=>{
    const checkpoint=Number(beacon.dataset.checkpoint),at=path.getPointAtLength(length*checkpoint/100);
    beacon.setAttribute('transform',`translate(${at.x} ${at.y})`);beacon.classList.toggle('lit',percent>=checkpoint);
  });
  const captions=['迷雾正在散去，每一步都会留下光。','引路之光已亮起，继续向星岛深处。','晶核苏醒了，你已经走过一半。','星环正在共鸣，终点就在前方。','星岛已被点亮，今天的努力值得庆祝。'];
  $('scene-caption').textContent='✦ '+captions[visual.stage];
  const subjects=state.subjects.filter(s=>subjectsMeta[s.id]),key=JSON.stringify(subjects.map(s=>[s.id,s.minutes,s.target]));
  if(sceneSubjectKey!==key){
    sceneSubjectKey=key;
    const glyph={math:'∑',cs:'{}',politics:'★',english:'Aa'};
    $('scene-subjects').innerHTML=subjects.map(s=>{const p=Math.min(1,s.minutes/s.target);return `<span class="scene-sigil ${p>=1?'complete':''}" style="--subject-color:${meta(s.id).color}"><svg viewBox="0 0 32 32"><circle class="sigil-track" cx="16" cy="16" r="13"/><circle class="sigil-charge" cx="16" cy="16" r="13" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100*(1-p)}"/><text x="16" y="20">${glyph[s.id]||'✦'}</text></svg>${esc(s.name)}</span>`;}).join('');
  }
}

function previewScene(percent) {
  if(!state)return;
  scenePreviewPercent=Math.round(Math.min(100,Math.max(0,Number(percent)||0)));
  $('effects-preview').hidden=false;$('preview-effects').setAttribute('aria-expanded','true');
  $('preview-progress').value=scenePreviewPercent;$('preview-percent').textContent=pct(scenePreviewPercent);
  document.querySelectorAll('[data-preview-progress]').forEach(b=>b.classList.toggle('active',Number(b.dataset.previewProgress)===scenePreviewPercent));
  renderScene(scenePreviewPercent);
}
function stopScenePreview() {
  if(scenePreviewPercent===null)return;
  scenePreviewPercent=null;$('effects-preview').hidden=true;$('preview-effects').setAttribute('aria-expanded','false');
  if(state)renderScene(state.totals.minutes/state.totals.target*100);
}

function renderSubjects() {
  const key=JSON.stringify(state.subjects);if(subjectRenderKey===key)return;subjectRenderKey=key;
  $('subjects').innerHTML=state.subjects.map(s=>{const m=meta(s.id),over=s.minutes>=s.target;return `<article class="subject-card ${over?'over':''}" style="--subject-color:${m.color};--subject-energy:${Math.min(1,s.minutes/s.target)}"><div class="subject-head"><span class="subject-icon">${icon(m.icon)}</span><h3>${esc(s.name)}</h3><span class="subject-badge">${over?'✦ 已达成':s.minutes>0?'推进中':'等待启程'}</span></div><div class="subject-sigil">${FocusSubjectArt.markup(s.id)}</div><div class="subject-numbers"><strong>${durationHTML(s.minutes)}</strong><span>/ ${hours(s.target)} 小时</span></div><div class="subject-progress" role="progressbar" aria-label="${esc(s.name)}进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,s.percent)}" aria-valuetext="${pct(s.percent)}"><i style="width:${Math.min(100,s.percent)}%"></i></div><div class="subject-bottom"><span>${s.minutes>s.target?'超额 '+duration(s.minutes-s.target):s.minutes===s.target?'目标达成，收获满满':s.minutes>0?'还差 '+duration(s.target-s.minutes):m.subtitle}</span><strong>${pct(s.percent)}</strong></div></article>`;}).join('');
}

function renderAdvice() {
  const lines=FocusAdvice.buildLines(state);
  if(dialogueDate!==state.date){activeDialogue=null;dialogueDate=state.date;}
  // Polling refreshes facts in the chosen line, but never randomly replaces it.
  activeDialogue=lines.find(line=>line.id===activeDialogue?.id)||lines[0];
  if(!activeDialogue)return;
  $('advice-card').hidden=false;
  for(const [id,value] of [['advice-topic',activeDialogue.topic],['advice-title',activeDialogue.title],['advice-text',activeDialogue.text]]){
    if($(id).textContent!==value)$(id).textContent=value;
  }
  $('advice-card').dataset.tone=activeDialogue.tone;
}

async function requestAdvice(reveal=false) {
  if($('advice-next').disabled)return;
  $('advice-request').disabled=true;$('advice-next').disabled=true;
  try {
    const fresh=await refresh(true,true);
    if(!fresh)throw new Error('暂时无法取得最新记录，请稍后再试。');
    const lines=FocusAdvice.buildLines(fresh);
    activeDialogue=FocusAdvice.pickLine(lines,activeDialogue?.id);
    dialogueDate=fresh.date;
    renderAdvice();
    if(currentView!=='today')switchView('today');
    if(reveal)$('advice-card').scrollIntoView({block:'center',behavior:fresh.settings.motion?'smooth':'auto'});
    if(fresh.settings.motion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      $('advice-line').animate([{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:220,easing:'ease-out'});
    }
  }catch(error){toast('向导暂时没有读到新记录',error.message,true);}
  finally{$('advice-request').disabled=false;$('advice-next').disabled=false;}
}

function renderWeek() {
  const w=state.weekly;
  const current=w.start<=state.today && state.today<=w.end;
  $('weekly-goal-title').textContent=current?'本周远征':'该周远征';
  $('weekly-range').textContent=`${w.start.replaceAll('-','.')} — ${w.end.replaceAll('-','.')} · 周一至周日`;
  $('weekly-minutes').innerHTML=durationHTML(w.minutes);
  $('weekly-target').textContent=hours(w.target);
  $('weekly-percent').textContent=pct(w.percent);
  $('weekly-bar').style.width=Math.min(100,w.percent)+'%';
  $('weekly-progress').setAttribute('aria-valuenow',Math.min(100,w.percent));
  $('weekly-progress').setAttribute('aria-valuetext',pct(w.percent));
  $('weekly-remaining').textContent=w.minutes>=w.target ? `周目标已达成${w.minutes>w.target?' · 超额 '+duration(w.minutes-w.target):''}，收下这周的积累。` : `已出征 ${w.activeDays} 天 · 距离周目标还差 ${duration(w.target-w.minutes)}`;
  const chart=weekChartState||w;
  const chartIsCurrent=chart.start<=state.today && state.today<=chart.end;
  $('weekly-total').textContent='累计 '+duration(chart.minutes);
  $('week-chart-title').textContent=chartIsCurrent?'本周足迹':'每周足迹';
  $('week-chart-range').textContent=`${chart.start.replaceAll('-','.')} — ${chart.end.slice(5).replaceAll('-','.')}`;
  $('week-reset').hidden=chartIsCurrent;
  $('prev-week').disabled=weekChartLoading;$('next-week').disabled=weekChartLoading;$('week-reset').disabled=weekChartLoading;
  const max=Math.max(state.totals.target,...chart.days.map(d=>d.minutes),1);
  $('week-chart').innerHTML=chart.days.map(d=>`<button class="chart-column ${d.date===state.date?'today':''} ${d.date>state.today?'future':''}" data-date="${d.date}" title="${d.date}：${duration(d.minutes)}" aria-label="查看${d.date}，学习${duration(d.minutes)}"><span class="chart-value">${d.minutes?hours(d.minutes)+'h':'—'}</span><span class="chart-bar-track"><i class="chart-bar" style="height:${Math.max(2,d.minutes/max*100)}%"></i></span><span class="chart-day">${d.date===state.today?'今天':new Date(d.date+'T12:00:00').toLocaleDateString('zh-CN',{weekday:'short'})}</span></button>`).join('');
}

function renderActivities() {
  const a=state.activities;
  $('activity-summary').innerHTML=Object.entries(activityNames).map(([id,label])=>`<div class="activity-total ${id}"><span><i></i>${label}</span><strong>${durationHTML(a.totals[id])}</strong></div>`).join('');
  $('activity-rows').innerHTML=a.subjects.map(s=>`<article class="activity-row" aria-label="${esc(s.name)}学习方式统计"><div class="activity-subject"><span class="subject-icon" style="--subject-color:${meta(s.id).color}">${icon(meta(s.id).icon)}</span><div><strong>${esc(s.name)}</strong><small>${s.other?`另有 ${duration(s.other)}复习 / 其他`:`累计 ${duration(s.minutes)}`}</small></div></div><div class="activity-time lecture" role="group" aria-label="听课时长"><span>听课</span><strong>${duration(s.lecture)}</strong></div><div class="activity-time practice" role="group" aria-label="做题时长"><span>做题</span><strong>${duration(s.practice)}</strong></div><div class="activity-insight ${s.advice.tone}"><strong>${esc(s.advice.title)}</strong><p>${esc(s.advice.text)}</p></div></article>`).join('');
  $('activity-overview').textContent=a.advice.text;
  $('activity-overview').hidden=a.totals.other===0;
}

function renderRecords() {
  const records=state.records;
  $('recent-records').innerHTML=records.length?records.slice(0,3).map(r=>`<div class="record-row" style="--subject-color:${meta(r.subject).color}"><span class="record-dot"></span><div><strong>${esc(r.name)}</strong><small>${timeOf(r.end)} 完成 · ${esc(meta(r.subject).name)} · ${activityNames[r.activity]||activityNames.other}${r.source==='calendar'?' · 手机日历':r.source==='history_xlsx'?' · 历史导入':''}</small></div><span class="record-duration">${number(r.minutes)} 分钟</span><span class="record-xp">+${number(r.minutes)} XP</span></div>`).join(''):'<div class="empty"><span>✧</span>下一份收获，正在路上。<br>完成番茄 ToDo 计时后会自动出现在这里。</div>';
  $('history-stats').innerHTML=statCard('本日专注',durationHTML(state.totals.minutes))+statCard('完成任务',`${state.dayRecordCount??records.length}<small>个</small>`)+statCard('每日主线进度',`${pct(state.totals.percent)}`);
  $('archive-note').textContent=`${dateText(state.date)} · ${state.date} · ${(state.dayRecordCount??records.length)>100?'展示最近 100 条，全部记录可导出':'全部完成记录'}`;
  $('history-records').innerHTML=records.length?records.map(r=>`<tr><td>${esc(r.name)}${r.source==='calendar'?'<span class="record-source">手机日历</span>':r.source==='history_xlsx'?'<span class="record-source">历史导入</span>':''}</td><td><span class="table-subject" style="--subject-color:${meta(r.subject).color}">${esc(meta(r.subject).name)}</span></td><td><span class="activity-label ${esc(r.activity)}">${activityNames[r.activity]||activityNames.other}</span></td><td>${timeOf(r.end)}</td><td>${duration(r.minutes)}</td><td>+${number(r.minutes)} XP</td><td><button class="record-remove" data-trash-record="${esc(r.id)}" aria-label="将${esc(r.name)}${number(r.minutes)}分钟移入回收站" ${recordMutationBusy?'disabled':''}>移除</button></td></tr>`).join(''):'<tr><td colspan="7"><div class="empty">这一天还没有已完成的专注记录。</div></td></tr>';
  $('trash-open').textContent=`回收站${state.trash?.count?' · '+number(state.trash.count,0):''}`;
}

function renderTrash() {
  const trash=state.trash||{count:0,records:[]};
  $('trash-summary').textContent=`${number(trash.count,0)} 条记录 · 不计入时长、进度、经验及导出${trash.count>trash.records.length?' · 显示最近 '+trash.records.length+' 条':''}`;
  $('trash-records').innerHTML=trash.records.length?trash.records.map(r=>`<article class="trash-row"><div><strong>${esc(r.name)} <span>${duration(r.minutes)}</span></strong><p>${esc(r.day)} · ${timeOf(r.end)} 完成 · ${r.deletionReason==='manual'?'在本机移除':'来源已删除'}</p></div><button class="secondary-button" data-restore-record="${esc(r.id)}" aria-label="恢复${esc(r.name)}${number(r.minutes)}分钟" ${recordMutationBusy?'disabled':''}>恢复</button></article>`).join(''):'<div class="empty">回收站是空的。</div>';
}

async function changeRecord(id, action) {
  if(recordMutationBusy)return;
  recordMutationBusy=true;renderRecords();if($('trash-dialog').open)renderTrash();
  try {
    const result=await api('/api/records/'+action,{id});
    // Restoring a saved record is not a newly completed study session.
    (result.latestRecords||[]).forEach(r=>seenRecords.add(r.id));
    await refresh(true,true);
    toast(action==='trash'?'记录已移到回收站':'记录已恢复',action==='trash'?'已从进度和经验中移除，可以在回收站恢复。':'已恢复到本机统计，不会重新写入番茄或日历。');
  }catch(error){toast('记录更新未完成',error.message,true);}
  finally{recordMutationBusy=false;renderRecords();if($('trash-dialog').open)renderTrash();}
}

function statCard(label,value) { return `<div class="stat-card"><span>${esc(label)}</span><strong>${value}</strong></div>`; }
function renderAchievements() {
  const a=state.allTime;
  $('achievement-stats').innerHTML=statCard('累计专注',`${hours(a.minutes)}<small>小时</small>`)+statCard('完成的专注',`${number(a.records,0)}<small>个</small>`)+statCard('留下足迹的日子',`${a.activeDays}<small>天</small>`);
  const t=state.totals;
  $('level-guide-current').textContent=`累计 ${number(t.xp,0)} XP · 当前 Lv. ${t.level}，本级 ${t.levelXp} / ${t.levelTarget} XP。再积累 ${t.levelTarget-t.levelXp} XP，升至 Lv. ${t.level+1}。`;
  const rankKey=String(levelRanks.indexOf(levelRank(t.level)));
  if($('level-ranks').dataset.current!==rankKey){
    $('level-ranks').dataset.current=rankKey;
    $('level-ranks').innerHTML=levelRanks.map(rank=>`<li class="${rank===levelRank(t.level)?'current':''}"><small>${rank.range}</small><strong>${rank.name}</strong>${rank===levelRank(t.level)?'<span>当前称号</span>':''}</li>`).join('');
  }
  const symbols=['⚑','✧','✦','♜','❖','♕'];
  $('badges').innerHTML=state.badges.map((b,i)=>`<article class="badge-card ${b.earned?'':'locked'}"><div class="badge-icon">${symbols[i%symbols.length]}</div><h3>${esc(b.name)}</h3><p>${esc(b.description)}</p><span class="badge-status">${b.earned?'✦ 已点亮':'待解锁'}</span></article>`).join('');
}

function switchView(view) {
  if(!viewNames[view])return;
  if(view!=='today')stopScenePreview();
  currentView=view;
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+view);
  document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});
  updateViewTitle();window.scrollTo({top:0,behavior:'auto'});
}

function showSettings() {
  if(!state)return;
  $('target-inputs').innerHTML=state.subjects.map(s=>`<label>${esc(s.name)}<input id="target-${s.id}" data-target="${s.id}" type="number" min="0.016666666666666666" max="24" step="any" required value="${s.target/60}" aria-label="${esc(s.name)}每日目标小时"></label>`).join('');
  const taskNames=state.taskNames||[...new Set([...state.records.map(r=>r.name),...Object.keys(state.settings.mapping),...state.unmapped])];
  $('mapping-fields').innerHTML=taskNames.map((name,i)=>{const current=Object.prototype.hasOwnProperty.call(state.settings.mapping,name)?state.settings.mapping[name]:classifyLocally(name);const activity=Object.prototype.hasOwnProperty.call(state.taskActivities,name)?state.taskActivities[name]:'other';return `<div class="mapping-row"><label for="mapping-${i}" title="${esc(name)}">${esc(name)}</label><select id="mapping-${i}" data-task-name="${esc(name)}" aria-label="${esc(name)}归属科目">${Object.entries(subjectsMeta).map(([id,m])=>`<option value="${id}" ${id===current?'selected':''}>${m.name}</option>`).join('')}</select><select data-activity-task="${esc(name)}" aria-label="${esc(name)}学习方式">${Object.entries(activityNames).map(([id,label])=>`<option value="${id}" ${id===activity?'selected':''}>${label}</option>`).join('')}</select></div>`;}).join('')||'<p class="muted">捕获第一条完成记录后，可以在这里指定它的科目与学习方式。</p>';
  $('weekly-target-input').value=state.settings.weeklyTarget/60;
  $('motion-input').checked=state.settings.motion;$('sound-input').checked=state.settings.sound;
  $('settings-error').hidden=true;updateTargetSum();$('settings-dialog').showModal();
}
function classifyLocally(name) {
  if(name.includes('数学'))return 'math';
  if(['408','数据结构','操作系统','计组','计算机组成','计算机网络'].some(k=>name.includes(k)))return 'cs';
  if(name.includes('政治'))return 'politics';
  if(['英语','单词'].some(k=>name.includes(k)))return 'english';
  return 'other';
}
function updateTargetSum() { const sum=[...document.querySelectorAll('[data-target]')].reduce((a,el)=>a+Number(el.value||0),0);$('target-sum').textContent=number(sum,2)+' 小时'; }

async function saveSettings(event) {
  event.preventDefault();
  const targets={},mapping=Object.create(null),activityMapping=Object.create(null);
  document.querySelectorAll('[data-target]').forEach(el=>targets[el.dataset.target]=Math.round(Number(el.value)*60));
  document.querySelectorAll('[data-task-name]').forEach(el=>mapping[el.dataset.taskName]=el.value);
  document.querySelectorAll('[data-activity-task]').forEach(el=>activityMapping[el.dataset.activityTask]=el.value);
  $('save-settings').disabled=true;$('settings-error').hidden=true;
  try {
    await api('/api/settings',{targets,mapping,activityMapping,weeklyTarget:Math.round(Number($('weekly-target-input').value)*60),motion:$('motion-input').checked,sound:$('sound-input').checked});
    if(!$('motion-input').checked)celebrationQueue=[];
    if($('sound-input').checked) { ensureAudio(); }
    $('settings-dialog').close();await refresh(true);toast('远征设置已保存','接下来的进度会按新目标计算。');
  } catch(error){$('settings-error').textContent=error.message;$('settings-error').hidden=false;}
  finally{$('save-settings').disabled=false;}
}

function renderSource() {
  const s=state.sync,p=state.calendarSync;
  const row=([k,v])=>`<div class="source-detail-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  const rows=[['电脑番茄 ToDo',s.connected?'已连接 · 自动捕获中':'暂不可用 · 正在重试'],['最近检查',timeOf(s.lastCheck)],['只读来源',s.sourcePath]];
  if(s.error)rows.push(['电脑同步提示',s.error]);
  const phoneRows=[['iPhone 日历',p?.enabled?(p.connected?'已连接 · 自动捕获中':'等待同步恢复'):'尚未启用']];
  if(p?.enabled){
    phoneRows.push(['同步日历',p.calendarName||'等待日历信息'],['最近读取',timeOf(p.snapshotAt)],['已同步的手机记录',number(p.importedCount,0)+' 条']);
    if(p.pendingCount)phoneRows.push(['等待入账',`${p.pendingCount} 条 · 日历结束时间尚未到达`]);
    for(const r of (p.pendingRecords||[]).slice(0,3))phoneRows.push([r.name,`${number(r.minutes)} 分钟 · ${pendingEnd(r.end)} 后计入`]);
    if(p.error)phoneRows.push(['手机同步提示',p.error]);
  }
  $('source-details').innerHTML='<div class="source-group">'+rows.map(row).join('')+'</div><div class="source-group">'+phoneRows.map(row).join('')+'</div>'+row(['全部学习存档',number(state.allTime.records,0)+' 条']);
}
async function syncNow() {
  $('sync-now').disabled=true;$('refresh').disabled=true;
  try{
    const result=await api('/api/sync',{});await refresh(true);
    const phone=state.calendarSync,ready=state.sync.connected&&(!phone?.enabled||phone.connected);
    if(result.refreshRequest?.calendarRequested){
      toast('已请求读取手机日历','读取结果会自动更新；结束时间未到的记录会显示等待入账。');
    }else{
      toast(ready?'记录已核对':'部分来源等待连接',ready?'新的完成任务会自动入账，已有记录不会重复计算。':(phone?.enabled&&!phone.connected?phone.error:state.sync.error)||'后台会继续重试。',!ready);
    }
  }
  catch(error){toast('同步未完成',error.message,true);}
  finally{$('sync-now').disabled=false;$('refresh').disabled=false;}
}

function toast(title,detail='',isError=false) {
  const el=document.createElement('div');el.className='toast'+(isError?' error':'');
  el.innerHTML=esc(title)+(detail?`<small>${esc(detail)}</small>`:'');
  $('toasts').append(el);while($('toasts').children.length>3)$('toasts').firstChild.remove();
  setTimeout(()=>{el.classList.add('fade');setTimeout(()=>el.remove(),450);},5500);
}
function effectClaims() {
  if(claimedEffects===null){
    try{const saved=JSON.parse(localStorage.getItem('focus-quest-effects-v1')||'[]');claimedEffects=new Set(Array.isArray(saved)?saved.filter(k=>typeof k==='string').slice(-200):[]);}catch(_){claimedEffects=new Set();}
  }
  return claimedEffects;
}
function rememberEffect(event) {
  const claims=effectClaims();claims.add(event.key);
  if(event.type==='daily')for(let stage=1;stage<event.stage;stage++)claims.add(event.key.replace(/:\d+$/,':'+stage));
  try{localStorage.setItem('focus-quest-effects-v1',JSON.stringify([...claims].slice(-200)));}catch(_){}
}
function seedEffectClaims(next) {
  if(next.date!==next.today)return;
  for(const s of next.subjects||[])if(s.target>0 && s.minutes>=s.target)rememberEffect({key:`subject:${next.date}:${s.id}:${s.target}`,type:'subject'});
  const stage=stageOf(next.totals.minutes/next.totals.target*100);
  if(stage)rememberEffect({key:`daily:${next.date}:${next.totals.target}:${stage}`,type:'daily',stage});
}
function celebrationFor(event,preview=false) {
  if(event.type==='subject'){
    const [title,body]=subjectRewards[event.id];
    return {title,body,reward:`${event.name||meta(event.id).name} · ${hours(event.target)} 小时目标达成`,subject:event.id,preview};
  }
  return {title:stageTitles[event.stage],body:['','引路石被点亮了。每一段专注，都在把迷雾推远。','水晶正在苏醒，星岛已经记下你走过的一半路程。','星环与水晶开始共鸣。你已完成今日目标的四分之三。','四周的光汇聚到星岛。今天已经做得足够好了。'][event.stage],reward:`每日主线 ${event.stage*25}% · ${stageNames[event.stage]}`,stage:event.stage,preview};
}
function playNextCelebration() {
  if(openingBusy || openingReady)return;
  if(state?.settings.motion===false){celebrationQueue=[];return;}
  if(!celebrationQueue.length || document.querySelector('dialog[open]'))return;
  showCelebration(celebrationQueue.shift());
}
function showCelebration({title,body,reward,preview=false,stage=4,subject=null}) {
  const dialog=$('celebration-dialog');
  dialog.dataset.kind=subject||'daily';dialog.dataset.preview=String(preview);
  const color=subject?meta(subject).color:['#bda4f6','#83c7b0','#b9a0ee','#cfb3ee','#eac58b'][stage];
  dialog.style.setProperty('--reward-color',color);dialog.style.setProperty('--subject-color',color);
  $('celebration-art').innerHTML=subject?`<div class="subject-sigil">${FocusSubjectArt.markup(subject)}</div>`:`<div class="celebration-gem">${['✧','✧','❖','✦','✦'][stage]}</div>`;
  $('celebration-kicker').textContent=preview?'EFFECT PREVIEW · 特效预览':subject?`${meta(subject).name} · SUBJECT QUEST COMPLETE`:stage===4?'DAILY QUEST COMPLETE':'NEW MILESTONE UNLOCKED';
  $('celebration-title').textContent=title;$('celebration-body').textContent=body;
  $('celebration-reward').textContent=reward;
  $('celebration-note').textContent=preview?'这是特效预览，不会增加学习时长、经验或记录。':'这段努力，已经计入你的成长。';
  $('celebration-done').textContent=preview?'返回预览':celebrationQueue.length?'收下成就，查看下一份':'收下这份成就';
  $('confetti').innerHTML=Array.from({length:30},(_,i)=>`<i style="left:${(i*37)%100}%;animation-delay:${-(i%13)*.29}s;animation-duration:${2.6+(i%7)*.2}s"></i>`).join('');
  if(!$('celebration-dialog').open)$('celebration-dialog').showModal();
}
function ensureAudio() {try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();}catch(_){} }
function playChime() {
  try{ensureAudio();if(!audioContext)return;[523.25,659.25,783.99].forEach((hz,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain(),at=audioContext.currentTime+i*.10;osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.035,at+.02);gain.gain.exponentialRampToValueAtTime(.0001,at+.55);osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.6);});}catch(_){}
}

function chooseDate(value) { stopScenePreview();weekChartRequest++;weekChartState=null;weekChartLoading=false;selectedDate=value===localDay()?null:value;refresh(true); }
async function browseWeek(date) {
  const request=++weekChartRequest;
  weekChartLoading=true;renderWeek();
  try {
    const result=await api('/api/state?date='+encodeURIComponent(date));
    if(request!==weekChartRequest)return;
    weekChartState=result.weekly;
  }catch(error){if(request===weekChartRequest)toast('暂时未能读取这一周',error.message,true);}
  finally{if(request===weekChartRequest){weekChartLoading=false;renderWeek();}}
}
function stepWeek(amount) {
  if(!state || weekChartLoading)return;
  const d=new Date((weekChartState||state.weekly).start+'T12:00:00');d.setDate(d.getDate()+amount*7);
  browseWeek(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
}
function stepDate(amount) { if(!state)return;const d=new Date(state.date+'T12:00:00');d.setDate(d.getDate()+amount);chooseDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); }
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>switchView(el.dataset.view)));
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();chooseDate(localDay());switchView('today');});
$('all-records').addEventListener('click',()=>switchView('history'));
$('level-help').addEventListener('click',()=>{
  switchView('achievements');
  $('level-guide').scrollIntoView({behavior:'auto',block:'start'});
  $('level-guide-title').focus({preventScroll:true});
});
$('trash-open').addEventListener('click',()=>{if(state){renderTrash();$('trash-dialog').showModal();}});
$('history-records').addEventListener('click',event=>{const button=event.target.closest('[data-trash-record]');if(button)changeRecord(button.dataset.trashRecord,'trash');});
$('trash-records').addEventListener('click',event=>{const button=event.target.closest('[data-restore-record]');if(button)changeRecord(button.dataset.restoreRecord,'restore');});
$('advice-request').addEventListener('click',()=>requestAdvice(true));
$('advice-next').addEventListener('click',()=>requestAdvice(false));
$('settings-open').addEventListener('click',showSettings);$('targets-edit').addEventListener('click',showSettings);
$('opening-preview').addEventListener('click',previewOpening);
$('opening-close').addEventListener('click',()=>$('opening-dialog').close());
$('opening-done').addEventListener('click',()=>$('opening-dialog').close());
$('weekly-target-edit').addEventListener('click',()=>{showSettings();$('weekly-target-input').focus();});
$('activity-settings').addEventListener('click',()=>{showSettings();$('mapping-fields').scrollIntoView({block:'center'});});
$('settings-form').addEventListener('submit',saveSettings);$('target-inputs').addEventListener('input',updateTargetSum);
document.querySelectorAll('.close-dialog').forEach(el=>el.addEventListener('click',()=>el.closest('dialog').close()));
$('source-open').addEventListener('click',()=>{if(state){renderSource();$('source-dialog').showModal();}});
$('refresh').addEventListener('click',syncNow);$('sync-now').addEventListener('click',syncNow);
$('date-button').addEventListener('click',()=>{$('date-picker').classList.toggle('visible');if($('date-picker').classList.contains('visible')){$('date-picker').focus();try{$('date-picker').showPicker();}catch(_){}}});
$('date-picker').addEventListener('change',e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))chooseDate(e.target.value);});
$('week-chart').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(b)chooseDate(b.dataset.date);});
$('prev-week').addEventListener('click',()=>stepWeek(-1));$('next-week').addEventListener('click',()=>stepWeek(1));$('week-reset').addEventListener('click',()=>{if(state)browseWeek(state.today);});
$('prev-day').addEventListener('click',()=>stepDate(-1));$('next-day').addEventListener('click',()=>stepDate(1));$('go-today').addEventListener('click',()=>chooseDate(localDay()));
$('header-today').addEventListener('click',()=>{$('date-picker').classList.remove('visible');chooseDate(state?.today||localDay());});
$('preview-effects').addEventListener('click',()=>{if(scenePreviewPercent!==null)stopScenePreview();else if(state)previewScene(state.totals.minutes/state.totals.target*100);});
$('preview-progress').addEventListener('input',event=>previewScene(event.target.value));
$('preview-stop').addEventListener('click',stopScenePreview);
document.querySelectorAll('[data-preview-progress]').forEach(button=>button.addEventListener('click',()=>previewScene(button.dataset.previewProgress)));
document.querySelectorAll('[data-preview-subject]').forEach(button=>button.addEventListener('click',()=>{
  const id=button.dataset.previewSubject,subject=state?.subjects.find(s=>s.id===id);if(!subject)return;
  showCelebration(celebrationFor({type:'subject',...subject},true));if(state.settings.sound)playChime();
}));
document.querySelector('.celebration-close').addEventListener('click',()=>{celebrationQueue=[];$('celebration-dialog').close();});
$('celebration-done').addEventListener('click',()=>$('celebration-dialog').close());
$('celebration-dialog').addEventListener('cancel',()=>{celebrationQueue=[];});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>setTimeout(()=>{maybeDailyOpening();playNextCelebration();},0)));
document.addEventListener('click',()=>{if(state?.settings.sound)ensureAudio();},{once:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){noteOpeningArrival();refresh();}});
window.addEventListener('focus',noteOpeningArrival);
window.addEventListener('focusquest:activate',noteOpeningArrival);
function tickClock(){ $('clock').textContent=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}); }
globalThis.FocusQuests?.init({api,toast,switchView,refresh});
tickClock();setInterval(tickClock,1000);refresh();setInterval(refresh,3000);
