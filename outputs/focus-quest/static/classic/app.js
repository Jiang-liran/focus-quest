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
const viewNames = {today:'今日远征',history:'专注档案',achievements:'成长图鉴'};
let state = null, currentView = 'today', selectedDate = null, inFlight = false, requestSequence = 0;
let baselineReady = false, seenRecords = new Set(), audioContext = null;
let dismissedAdvice = new Set();
const renderKeys=new Map();
function changed(key,value){const next=JSON.stringify(value);if(renderKeys.get(key)===next)return false;renderKeys.set(key,next);return true;}
try { dismissedAdvice = new Set(JSON.parse(localStorage.getItem('focusquest.dismissedAdvice') || '[]')); } catch (_) {}

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

async function refresh(force=false) {
  if(inFlight && !force) return;
  inFlight=true;
  const seq=++requestSequence;
  try {
    const data=await api('/api/state'+(selectedDate?'?date='+encodeURIComponent(selectedDate):''));
    if(seq!==requestSequence)return;
    if(globalThis.FocusRuntime?.isVisible()===false)return;
    checkNewRecords(data);
    state=data;
    render();
    $('error-banner').hidden=true;
  } catch(error) {
    if(seq!==requestSequence)return;
    $('error-banner').textContent='暂时连接不到本地记录服务。已保存的记录仍在电脑里；程序会自动重试。';
    $('error-banner').hidden=false;
    $('source-label').textContent='本地服务连接中断';
    $('source-dot').classList.remove('connected');
  } finally { if(seq===requestSequence) inFlight=false; }
}

function checkNewRecords(next) {
  const recent=next.latestRecords || next.records;
  if(!baselineReady){recent.forEach(r=>seenRecords.add(r.id));baselineReady=true;return;}
  const incoming=recent.filter(r=>!seenRecords.has(r.id));
  recent.forEach(r=>seenRecords.add(r.id));
  if(seenRecords.size>500)seenRecords=new Set(recent.map(r=>r.id));
  if(!incoming.length)return;
  // Historical imports contribute XP without pretending to be a freshly completed task.
  const fresh=incoming.filter(r=>r.source!=='history_xlsx' && Date.now()-new Date(r.end).getTime()<10*60*1000 && new Date(r.end).getTime()<=Date.now()+60000);
  if(!fresh.length)return;
  const gained=fresh.reduce((sum,r)=>sum+r.minutes,0);
  const oldStage=state && state.date===next.date ? stageOf(state.totals.percent) : 0;
  const newStage=stageOf(next.totals.percent);
  if(state && next.date===next.today && state.date===next.date && newStage>oldStage){
    showCelebration({title:stageTitles[newStage],body:`${fresh.length===1?fresh[0].name:`${fresh.length} 段专注`}已入账，今日推进至 ${pct(next.totals.percent)}。`,reward:`+${number(gained)} XP · ${stageNames[newStage]}`,preview:false,stage:newStage});
  } else {
    toast(`✦ ${fresh.length===1?fresh[0].name:`${fresh.length} 个专注任务`} · 自动交任务`, `+${duration(gained)} · +${number(gained)} XP${state && next.totals.level>state.totals.level?` · 升至 Lv. ${next.totals.level}`:''}`);
  }
  if(next.settings.sound)playChime();
}

function render() {
  if(!state)return;
  const s=state,t=s.totals;
  globalThis.FocusGoals?.render(s);
  document.documentElement.classList.toggle('no-motion',!s.settings.motion);
  $('date-button').textContent=dateText(s.date)+(s.date===s.today?' · 今天':'');
  $('date-picker').value=s.date;
  $('targets-edit').disabled=s.date!==s.today||s.goals.daily.changesRemaining<=0;
  $('level').textContent=`Lv. ${t.level}`;
  $('level-name').textContent=t.level<10?'启程学徒':t.level<50?'知识游侠':t.level<150?'远征守护者':'长期主义者';
  $('level-xp').textContent=`${t.levelXp} / ${t.levelTarget} XP · 下一级`;
  $('level-bar').style.width=(t.levelXp/t.levelTarget*100)+'%';
  const phone=s.calendarSync;
  $('source-label').textContent=phone?.enabled?(s.sync.connected&&phone.connected?'电脑 + 手机 · 已连接':phone.connected?'手机已连接':s.sync.connected?'电脑已连接':'记录同步 · 等待连接'):(s.sync.connected?'番茄 ToDo · 已连接':'番茄 ToDo · 等待连接');
  $('source-dot').classList.toggle('connected',s.sync.connected||Boolean(phone?.connected));
  $('footer-sync').textContent=s.sync.connected?`本地存档 ${number(s.sync.importedCount,0)} 条 · 每 ${s.sync.pollSeconds} 秒自动捕获`:'同步暂不可用 · 已保存的记录仍可查看';
  renderHero();
  if(changed('subjects',s.subjects))renderSubjects();
  if(changed('advice',[s.date,s.advice]))renderAdvice();
  if(changed('week',[s.date,s.week,s.totals.target]))renderWeek();
  if(changed('records',[s.date,s.records,s.dayRecordCount,s.totals]))renderRecords();
  if(changed('achievements',[s.allTime,s.badges]))renderAchievements();
  updateViewTitle();
  if($('source-dialog').open)renderSource();
}

function updateViewTitle() {
  $('page-crumb').textContent=viewNames[currentView];
  if(currentView==='today'){
    const history=state && state.date!==state.today;
    $('page-title').textContent=history?'回看走过的每一步。':'今天，也向前一点。';
    $('page-subtitle').textContent=history?`${dateText(state.date)}的专注，都有迹可循。`:'把每一段专注，变成看得见的成长。';
    $('greeting-eyebrow').textContent=history?'EVERY STEP COUNTS':'YOUR NEXT CHAPTER';
  }else if(currentView==='history'){
    $('page-title').textContent='每一份努力，都有记录。';
    $('page-subtitle').textContent='那些安静专注的时刻，已经成为了你的积累。';
    $('greeting-eyebrow').textContent='YOUR FOCUS ARCHIVE';
  }else{
    $('page-title').textContent='成长，是日积月累的事。';
    $('page-subtitle').textContent='不和别人比较，只看见自己走过的路。';
    $('greeting-eyebrow').textContent='PROGRESS YOU CAN FEEL';
  }
}

function renderHero() {
  const t=state.totals, stage=stageOf(t.percent);
  $('quest-hero').dataset.stage=stage;
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
  $('milestones').innerHTML=[25,50,75,100].map((point,i)=>`<div class="milestone ${t.percent>=point?'reached':''}"><div class="milestone-icon">${t.percent>=point?'✦':i===3?'♜':'◇'}</div><div><strong>${stageNames[i+1]}</strong><small>${point}% · ${duration(t.target*point/100)}</small></div></div>`).join('');
}

function renderSubjects() {
  $('subjects').innerHTML=state.subjects.map(s=>{const m=meta(s.id),over=s.minutes>=s.target;return `<article class="subject-card ${over?'over':''}" style="--subject-color:${m.color}"><div class="subject-head"><span class="subject-icon">${icon(m.icon)}</span><h3>${esc(s.name)}</h3><span class="subject-badge">${over?'✦ 已达成':s.minutes>0?'推进中':'等待启程'}</span></div><div class="subject-numbers"><strong>${durationHTML(s.minutes)}</strong><span>/ ${hours(s.target)} 小时</span></div><div class="subject-progress" role="progressbar" aria-label="${esc(s.name)}进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,s.percent)}" aria-valuetext="${pct(s.percent)}"><i style="width:${Math.min(100,s.percent)}%"></i></div><div class="subject-bottom"><span>${s.minutes>s.target?'超额 '+duration(s.minutes-s.target):s.minutes===s.target?'目标达成，收获满满':s.minutes>0?'还差 '+duration(s.target-s.minutes):m.subtitle}</span><strong>${pct(s.percent)}</strong></div></article>`;}).join('');
}

function renderAdvice() {
  const a=state.advice;
  $('advice-title').textContent=a.title;$('advice-text').textContent=a.text;
  $('advice-card').hidden=dismissedAdvice.has(state.date+':'+a.id);
}

function renderWeek() {
  const max=Math.max(state.totals.target,...state.week.map(d=>d.minutes),1);
  const total=state.week.reduce((sum,d)=>sum+d.minutes,0);
  $('weekly-total').textContent='累计 '+duration(total);
  $('week-chart').innerHTML=state.week.map(d=>`<button class="chart-column ${d.date===state.date?'today':''}" data-date="${d.date}" title="${d.date}：${duration(d.minutes)}" aria-label="查看${d.date}，学习${duration(d.minutes)}"><span class="chart-value">${d.minutes?hours(d.minutes)+'h':'—'}</span><span class="chart-bar-track"><i class="chart-bar" style="height:${Math.max(2,d.minutes/max*100)}%"></i></span><span class="chart-day">${d.date===state.today?'今天':new Date(d.date+'T12:00:00').toLocaleDateString('zh-CN',{weekday:'short'})}</span></button>`).join('');
}

function renderRecords() {
  const records=state.records;
  $('recent-records').innerHTML=records.length?records.slice(0,3).map(r=>`<div class="record-row" style="--subject-color:${meta(r.subject).color}"><span class="record-dot"></span><div><strong>${esc(r.name)}</strong><small>${timeOf(r.start)} → ${timeOf(r.end)} · ${esc(meta(r.subject).name)}</small></div><span class="record-duration">${number(r.minutes)} 分钟</span><span class="record-xp">+${number(r.minutes)} XP</span></div>`).join(''):'<div class="empty"><span>✧</span>下一份收获，正在路上。<br>完成番茄 ToDo 计时后会自动出现在这里。</div>';
  $('history-stats').innerHTML=statCard('本日专注',durationHTML(state.totals.minutes))+statCard('完成任务',`${state.dayRecordCount??records.length}<small>个</small>`)+statCard('每日主线进度',`${pct(state.totals.percent)}`);
  $('archive-note').textContent=`${dateText(state.date)} · ${state.date} · ${(state.dayRecordCount??records.length)>100?'展示最近 100 条，全部记录可导出':'全部完成记录'}`;
  $('history-records').innerHTML=records.length?records.map(r=>`<tr><td>${esc(r.name)}</td><td><span class="table-subject" style="--subject-color:${meta(r.subject).color}">${esc(meta(r.subject).name)}</span></td><td>${timeOf(r.start)} → ${timeOf(r.end)}</td><td>${duration(r.minutes)}</td><td>+${number(r.minutes)} XP</td></tr>`).join(''):'<tr><td colspan="5"><div class="empty">这一天还没有已完成的专注记录。</div></td></tr>';
}

function statCard(label,value) { return `<div class="stat-card"><span>${esc(label)}</span><strong>${value}</strong></div>`; }
function renderAchievements() {
  const a=state.allTime;
  $('achievement-stats').innerHTML=statCard('累计专注',`${hours(a.minutes)}<small>小时</small>`)+statCard('完成的专注',`${number(a.records,0)}<small>个</small>`)+statCard('留下足迹的日子',`${a.activeDays}<small>天</small>`);
  const symbols=['⚑','✧','✦','♜','❖','♕'];
  $('badges').innerHTML=state.badges.map((b,i)=>`<article class="badge-card ${b.earned?'':'locked'}"><div class="badge-icon">${symbols[i%symbols.length]}</div><h3>${esc(b.name)}</h3><p>${esc(b.description)}</p><span class="badge-status">${b.earned?'✦ 已点亮':'待解锁'}</span></article>`).join('');
}

function switchView(view) {
  if(!viewNames[view])return;
  currentView=view;
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!=='view-'+view);
  document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});
  updateViewTitle();window.scrollTo({top:0,behavior:'auto'});
}

function showSettings() {
  if(!state)return;
  $('target-inputs').innerHTML=state.subjects.map(s=>`<label>${esc(s.name)}<input id="target-${s.id}" data-target="${s.id}" type="number" disabled min="0.016666666666666666" max="24" step="any" required value="${s.target/60}" aria-label="${esc(s.name)}每日目标小时"></label>`).join('');
  const taskNames=state.taskNames||[...new Set([...state.records.map(r=>r.name),...Object.keys(state.settings.mapping),...state.unmapped])];
  $('mapping-fields').innerHTML=taskNames.map((name,i)=>{const current=Object.prototype.hasOwnProperty.call(state.settings.mapping,name)?state.settings.mapping[name]:classifyLocally(name);return `<div class="mapping-row"><label for="mapping-${i}" title="${esc(name)}">${esc(name)}</label><select id="mapping-${i}" data-task-name="${esc(name)}" aria-label="${esc(name)}归属科目">${Object.entries(subjectsMeta).map(([id,m])=>`<option value="${id}" ${id===current?'selected':''}>${m.name}</option>`).join('')}</select></div>`;}).join('')||'<p class="muted">捕获第一条完成记录后，可以在这里指定它的科目。</p>';
  $('classic-goals-open').disabled=state.date!==state.today;
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
  const mapping=Object.create(null);
  document.querySelectorAll('[data-task-name]').forEach(el=>mapping[el.dataset.taskName]=el.value);
  $('save-settings').disabled=true;$('settings-error').hidden=true;
  try {
    await api('/api/settings',{mapping,motion:$('motion-input').checked,sound:$('sound-input').checked});
    if($('sound-input').checked) { ensureAudio(); }
    $('settings-dialog').close();await refresh(true);toast('远征设置已保存','任务归类和反馈偏好已更新，目标航图继续保留。');
  } catch(error){$('settings-error').textContent=error.message;$('settings-error').hidden=false;}
  finally{$('save-settings').disabled=false;}
}

function renderSource() {
  const s=state.sync;
  const rows=[['连接状态',s.connected?'正常 · 自动捕获中':'暂不可用 · 正在重试'],['保存的有效记录',number(s.importedCount,0)+' 条'],['最近检查',timeOf(s.lastCheck)],['最近记录更新',s.lastImport?new Date(s.lastImport).toLocaleString('zh-CN',{hour12:false}):'尚未导入'],['只读来源',s.sourcePath]];
  if(s.error)rows.push(['同步提示',s.error]);
  $('source-details').innerHTML=rows.map(([k,v])=>`<div class="source-detail-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
}
async function syncNow() {
  $('sync-now').disabled=true;$('refresh').disabled=true;
  try{await api('/api/sync',{});await refresh(true);toast(state.sync.connected?'记录已核对':'暂时未能同步',state.sync.connected?'新的完成任务会自动入账，已有记录不会重复计算。':state.sync.error,!state.sync.connected);}
  catch(error){toast('同步未完成',error.message,true);}
  finally{$('sync-now').disabled=false;$('refresh').disabled=false;}
}

function toast(title,detail='',isError=false) {
  const el=document.createElement('div');el.className='toast'+(isError?' error':'');
  el.innerHTML=esc(title)+(detail?`<small>${esc(detail)}</small>`:'');
  $('toasts').append(el);while($('toasts').children.length>3)$('toasts').firstChild.remove();
  setTimeout(()=>{el.classList.add('fade');setTimeout(()=>el.remove(),450);},5500);
}
function showCelebration({title,body,reward,preview=false,stage=4}) {
  $('celebration-kicker').textContent=preview?'EFFECT PREVIEW · 特效预览':stage===4?'DAILY QUEST COMPLETE':'NEW MILESTONE UNLOCKED';
  $('celebration-title').textContent=title;$('celebration-body').textContent=body;
  $('celebration-reward').textContent=reward;
  $('celebration-note').textContent=preview?'这是特效预览，不会增加学习时长、经验或记录。':'这段努力，已经计入你的成长。';
  $('celebration-done').textContent=preview?'期待真正通关的那一刻':'收下这份成就';
  $('confetti').innerHTML=Array.from({length:30},(_,i)=>`<i style="left:${(i*37)%100}%;animation-delay:${-(i%13)*.29}s;animation-duration:${2.6+(i%7)*.2}s"></i>`).join('');
  if(!$('celebration-dialog').open)$('celebration-dialog').showModal();
}
function ensureAudio() {try{audioContext ||= new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume();}catch(_){} }
function playChime() {
  try{ensureAudio();if(!audioContext)return;[523.25,659.25,783.99].forEach((hz,i)=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain(),at=audioContext.currentTime+i*.10;osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.035,at+.02);gain.gain.exponentialRampToValueAtTime(.0001,at+.55);osc.connect(gain);gain.connect(audioContext.destination);osc.start(at);osc.stop(at+.6);});}catch(_){}
}

function chooseDate(value) { selectedDate=value===localDay()?null:value;refresh(true); }
function stepDate(amount) { if(!state)return;const d=new Date(state.date+'T12:00:00');d.setDate(d.getDate()+amount);chooseDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); }
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>switchView(el.dataset.view)));
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();chooseDate(localDay());switchView('today');});
$('all-records').addEventListener('click',()=>switchView('history'));
$('settings-open').addEventListener('click',showSettings);$('targets-edit').addEventListener('click',()=>globalThis.FocusGoals?.openDaily());
$('classic-goals-open').addEventListener('click',()=>{$('settings-dialog').close();globalThis.FocusGoals?.openDaily();});
$('settings-form').addEventListener('submit',saveSettings);$('target-inputs').addEventListener('input',updateTargetSum);
document.querySelectorAll('.close-dialog').forEach(el=>el.addEventListener('click',()=>el.closest('dialog').close()));
$('source-open').addEventListener('click',()=>{if(state){renderSource();$('source-dialog').showModal();}});
$('refresh').addEventListener('click',syncNow);$('sync-now').addEventListener('click',syncNow);
$('date-button').addEventListener('click',()=>{$('date-picker').classList.toggle('visible');if($('date-picker').classList.contains('visible')){$('date-picker').focus();try{$('date-picker').showPicker();}catch(_){}}});
$('date-picker').addEventListener('change',e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))chooseDate(e.target.value);});
$('week-chart').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(b)chooseDate(b.dataset.date);});
$('prev-day').addEventListener('click',()=>stepDate(-1));$('next-day').addEventListener('click',()=>stepDate(1));$('go-today').addEventListener('click',()=>chooseDate(localDay()));
$('advice-dismiss').addEventListener('click',()=>{if(!state)return;dismissedAdvice.add(state.date+':'+state.advice.id);try{localStorage.setItem('focusquest.dismissedAdvice',JSON.stringify([...dismissedAdvice].slice(-100)));}catch(_){}renderAdvice();});
$('preview-effects').addEventListener('click',()=>{showCelebration({title:'今日远征，圆满通关。',body:'目标达成时，浮空岛将被点亮，属于你的庆祝也会出现。',reward:'✦ 今日主线 100% · 成就达成',preview:true});if(state?.settings.sound)playChime();});
document.querySelector('.celebration-close').addEventListener('click',()=>$('celebration-dialog').close());$('celebration-done').addEventListener('click',()=>$('celebration-dialog').close());
document.addEventListener('click',()=>{if(state?.settings.sound)ensureAudio();},{once:true});
document.addEventListener('visibilitychange',()=>{if(!globalThis.FocusRuntime&&!document.hidden)refresh();});
function tickClock(){ $('clock').textContent=new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}); }
globalThis.FocusGoals?.init({api,toast,refresh,beforeWeekly:()=>{for(const id of ['settings-dialog','celebration-dialog','source-dialog'])if($(id)?.open)$(id).close();},afterChange:()=>{baselineReady=false;}});
globalThis.FocusRuntime?.start({tickClock,refresh,onSuspend:()=>{try{audioContext?.suspend();}catch(_){}}});
