(function (root) {
  'use strict';
  const SUBJECTS = [{id:'math',name:'数学',mark:'Σ'},{id:'cs',name:'408',mark:'{}'},{id:'politics',name:'政治',mark:'⚑'},{id:'english',name:'英语',mark:'Aa'}];
  const defaults = {math:180,cs:180,politics:60,english:60};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hours = minutes => Number((Number(minutes)/60).toFixed(4)).toLocaleString('zh-CN',{maximumFractionDigits:4});
  const duration = minutes => {const m=Math.round(Number(minutes)||0);return m>=60?`${Math.floor(m/60)}小时${m%60?m%60+'分钟':''}`:`${m}分钟`;};
  function parseTargets(values) {
    const targets={};
    for(const {id,name} of SUBJECTS){
      const value=Number(values[id]);
      if(!Number.isFinite(value)||value<=0||value>24)throw new Error(`${name}目标请填写大于 0、最多 24 小时的数字。`);
      targets[id]=Math.round(value*60);
      if(targets[id]<1)throw new Error(`${name}目标至少为 1 分钟。`);
    }
    if(Object.values(targets).reduce((a,b)=>a+b,0)>1440)throw new Error('四科目标合计不能超过 24 小时。');
    return targets;
  }
  function parseWeekly(value){const n=Number(value);if(!Number.isFinite(n)||n<=0||n>168||Math.round(n*60)<1)throw new Error('周目标请填写 1 分钟至 168 小时之间的时长。');return Math.round(n*60);}
  function portrait(){return `<svg class="goal-keeper-svg" viewBox="0 0 210 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="108" cy="157" rx="77" ry="14" fill="#142b36" opacity=".22"/>
    <path d="m28 137 76-29 74 27-69 30Z" fill="#405459"/>
    <path d="m28 137 81 28 69-30v9l-69 29-81-28Z" fill="#293e44"/>
    <path d="m37 128 62-23 69 24-61 23Z" fill="#aab9a3"/>
    <path d="m37 128 70 24v7l-70-25Z" fill="#718f89"/>
    <ellipse cx="111" cy="139" rx="31" ry="8" fill="#304e52" opacity=".25"/>
    <g data-keeper-part="scales" fill="none" stroke="#c4b085" stroke-linecap="round" stroke-linejoin="round">
      <path d="M55 76v52m-11 3h22M33 85h44" stroke-width="2.8"/>
      <path d="m38 86-8 16h16Zm33 0-8 16h16Z" stroke-width="1.3"/>
      <path d="M29 102q9 9 18 0m15 0q9 9 18 0" fill="#819e92" stroke-width="1.6"/>
      <circle cx="55" cy="77" r="3.7" fill="#e7d5ab" stroke="none"/>
    </g>
    <g data-keeper-part="robe">
      <path d="M93 95q-13 6-17 42l34 15 35-16q-4-34-22-41Z" fill="#6e9992"/>
      <path d="M111 99 110 152l35-16q-4-34-22-41Z" fill="#487973"/>
      <path d="m100 92 11 7 10-7 6 7-16 12-17-12Z" fill="#ddcda4"/>
      <path d="m110 108-13 35 13 9 12-6-9-38Z" fill="#a5bba2"/>
      <path d="M91 103q-10 11-12 25l16 6 9-21Zm39 0q10 8 14 22l-12 9-12-23Z" fill="#7ea59b"/>
      <circle cx="111" cy="107" r="3" fill="#e8d5a5"/>
    </g>
    <g data-keeper-part="face">
      <path d="M91 76V65q0-23 20-23t20 23v13Z" fill="#405451"/>
      <circle cx="93" cy="76" r="3.5" fill="#caa98b"/>
      <circle cx="129" cy="76" r="3.5" fill="#caa98b"/>
      <ellipse cx="111" cy="75" rx="17.5" ry="19.5" fill="#e4c7a5"/>
      <path d="M94 66q8-2 11-8 8 8 23 8v-9H94Z" fill="#405451"/>
      <circle cx="104" cy="76.5" r="1.75" fill="#3d4846"/>
      <circle cx="118" cy="76.5" r="1.75" fill="#3d4846"/>
      <ellipse cx="99" cy="83" rx="3.3" ry="1.6" fill="#ceaa8d" opacity=".6"/>
      <ellipse cx="123" cy="83" rx="3.3" ry="1.6" fill="#ceaa8d" opacity=".6"/>
      <path d="M107 86q4 3 8 0" fill="none" stroke="#a77f68" stroke-width="1.4" stroke-linecap="round"/>
    </g>
    <g data-keeper-part="hat">
      <path d="m88 57 22-30 24 33-24 4Z" fill="#a8bba0"/>
      <path d="m110 27 1 37 23-4Z" fill="#72988c"/>
      <path d="M84 61q26-10 54 1-26 9-54-1Z" fill="#b8c9a9"/>
      <path d="M87 63q23 8 48 0v4q-25 7-48-1Z" fill="#63877f"/>
      <path d="M94 64q18 4 34 0" fill="none" stroke="#dfcba1" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g data-keeper-part="book">
      <path d="m101 111 22 7 22-7v26l-22 8-22-8Z" fill="#aa906b"/>
      <path d="M102 108q11-1 21 7 11-8 21-7v25q-11 1-21 8-10-7-21-8Z" fill="#eddfbb"/>
      <path d="M123 115q11-8 21-7v25q-11 1-21 8Z" fill="#d7c69e"/>
      <path d="M123 116v23" fill="none" stroke="#b5a47e" stroke-width="1.1"/>
      <path d="m107 117 10 4m-10 2 10 4m12-6 10-4m-10 10 7-3" fill="none" stroke="#7e9381" stroke-width="1.3" stroke-linecap="round"/>
      <ellipse cx="101" cy="126" rx="4.7" ry="5.7" fill="#e4c7a5" transform="rotate(-18 101 126)"/>
      <ellipse cx="144" cy="126" rx="4.5" ry="5.7" fill="#d6b596" transform="rotate(15 144 126)"/>
    </g>
    <path d="m160 131 9-18 10 18-9 5Z" fill="#617f78"/>
    <path d="m169 113 1 23 9-5Z" fill="#93a999"/>
    <circle cx="53" cy="50" r="1.8" fill="#d3c69f"/>
    <path d="m155 64 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#cbd9bb" opacity=".8"/>
  </svg>`;}

  let hooks={},state=null,goals=null,initialized=false,dailyBusy=false,weeklyBusy=false;
  let dailyRequest=null,weeklyRequest=null,renderKey='',dailyDay=null,weeklyWeek=null;
  const $=id=>document.getElementById(id);
  function id(){
    if(root.crypto?.randomUUID)return root.crypto.randomUUID();
    const bytes=new Uint8Array(16);
    if(root.crypto?.getRandomValues)root.crypto.getRandomValues(bytes);
    else for(let i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
    bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const value=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
  }
  function requestFor(kind,payload){const key=JSON.stringify(payload);let saved=kind==='daily'?dailyRequest:weeklyRequest;if(!saved||saved.key!==key)saved={key,payload:{...payload,requestId:id()}};if(kind==='daily')dailyRequest=saved;else weeklyRequest=saved;return saved.payload;}
  function required(){return Boolean(goals?.weeklyRequired);}
  function fail(kind,message){const node=$(`goal-${kind}-error`);node.textContent=message;node.hidden=false;}
  function disableDailyInputs(disabled){for(const s of SUBJECTS)$(`goal-hours-${s.id}`).disabled=disabled;for(const key of ['goal-daily-close','goal-daily-cancel'])$(key).disabled=disabled;}
  function dailyTotal(){
    const values=Object.fromEntries(SUBJECTS.map(s=>[s.id,$(`goal-hours-${s.id}`).value]));
    try{const targets=parseTargets(values),sum=Object.values(targets).reduce((a,b)=>a+b,0);$('goal-daily-total').textContent=duration(sum);$('goal-mystery-status').textContent=sum>=480?'神秘委托可开启 · 总目标不少于 8 小时':'神秘委托未开启 · 总目标需不少于 8 小时';$('goal-mystery-status').dataset.enabled=String(sum>=480);}
    catch(_){$('goal-daily-total').textContent='请检查时长';$('goal-mystery-status').textContent='四科目标确认后，重新判断神秘委托条件';}
  }
  function init(options){
    if(initialized)return;initialized=true;hooks=options||{};
    const mount=$('goal-keeper');if(!mount)return;
    mount.innerHTML=`<div class="goal-keeper-art">${portrait()}<span>司衡 · 目标领航员</span></div><div class="goal-keeper-copy"><span class="goal-eyebrow">A PLAN FOR THIS DAY</span><div class="goal-keeper-heading"><h2>把今天，安排得刚刚好。</h2><span id="goal-keeper-quota"></span></div><p>「地图可以调整，脚步由你决定。今天的约定，我会替你记好。」</p><div id="goal-keeper-targets" class="goal-keeper-targets"></div><p id="goal-keeper-note" class="goal-keeper-note"></p></div><div class="goal-keeper-action"><button type="button" id="goal-daily-open">与司衡调整目标 <span aria-hidden="true">↗</span></button><small id="goal-keeper-next"></small></div>`;
    const host=document.createElement('div');host.id='goal-dialogs';
    host.innerHTML=`<dialog id="goal-daily-dialog" class="goal-dialog" aria-labelledby="goal-daily-title"><form id="goal-daily-form"><header class="goal-dialog-heading"><div><span class="goal-eyebrow">司衡的今日航图</span><h2 id="goal-daily-title">重新分配今天的四科目标</h2></div><button type="button" id="goal-daily-close" class="goal-close" aria-label="关闭目标调整">×</button></header><p id="goal-daily-intro" class="goal-dialog-intro"></p><div class="goal-hour-inputs">${SUBJECTS.map(s=>`<label class="goal-subject-${s.id}" for="goal-hours-${s.id}"><span><b>${s.mark}</b>${s.name}</span><span class="goal-hour-control"><input id="goal-hours-${s.id}" type="number" min="0.016666666666666666" max="24" step="any" required inputmode="decimal" aria-label="${s.name}今日目标小时"><small>小时</small></span></label>`).join('')}</div><div class="goal-total-row"><span>今天的总目标</span><strong id="goal-daily-total">8小时</strong></div><div class="goal-mystery-note"><strong id="goal-mystery-status"></strong><p>总目标不少于 8 小时、完成总目标且四科各自严格超过一半后，新增学习可交给拾星。双倍金币、每 15 分钟 1 钻石和每 30 分钟递增礼盒照常保留；修改目标不会追溯加奖。</p></div><p class="goal-reset-note">只调整今天。明天恢复数学 3h、408 3h、政治 1h、英语 1h；今天的最终目标会留在记录中，供热力图判断达成情况。</p><p id="goal-daily-error" class="goal-form-error" role="alert" hidden></p><footer class="goal-dialog-footer"><button type="button" id="goal-daily-cancel">暂不调整</button><button type="submit" id="goal-daily-save" class="goal-primary">确认今日目标</button></footer></form></dialog><dialog id="goal-weekly-dialog" class="goal-dialog goal-weekly-dialog" aria-labelledby="goal-weekly-title" aria-describedby="goal-weekly-description"><form id="goal-weekly-form"><div class="goal-weekly-art">${portrait()}</div><div class="goal-weekly-content"><span class="goal-eyebrow">NEW WEEK · A PROMISE TO YOURSELF</span><h2 id="goal-weekly-title">新的一周，先定下航向。</h2><p id="goal-weekly-range"></p><p id="goal-weekly-description">这是本周第一次相遇。请填写这周计划投入的学习时长，确认后本周锁定；每天如何分配，仍由你安排。</p><label class="goal-weekly-input" for="goal-week-hours"><span>本周学习目标</span><span><input id="goal-week-hours" type="number" min="0.016666666666666666" max="168" step="any" required inputmode="decimal" aria-label="本周学习目标小时"><b>小时</b></span></label><p class="goal-weekly-lock"><span aria-hidden="true">◇</span> 确认后本周不可更改，下周首次打开时再制定。</p><p id="goal-weekly-error" class="goal-form-error" role="alert" hidden></p><button type="submit" id="goal-weekly-save" class="goal-primary">确认，开启这一周</button></div></form></dialog>`;
    document.body.appendChild(host);
    $('goal-daily-open').addEventListener('click',openDaily);
    $('goal-daily-form').addEventListener('submit',saveDaily);
    $('goal-daily-form').addEventListener('input',dailyTotal);
    for(const key of ['goal-daily-close','goal-daily-cancel'])$(key).addEventListener('click',()=>{if(!dailyBusy)$('goal-daily-dialog').close();});
    $('goal-daily-dialog').addEventListener('cancel',event=>{if(dailyBusy)event.preventDefault();});
    $('goal-daily-dialog').addEventListener('close',()=>hooks.resume?.());
    $('goal-weekly-form').addEventListener('submit',saveWeekly);
    $('goal-weekly-dialog').addEventListener('cancel',event=>event.preventDefault());
    $('goal-weekly-dialog').addEventListener('close',()=>{if(required())ensureWeekly();else hooks.resume?.();});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)ensureWeekly();});
  }
  function render(next){
    state=next;goals=next?.goals||null;if(!initialized||!goals)return;
    const historical=next.date!==goals.today,daily=goals.daily;
    const shown=historical?Object.fromEntries((next.subjects||[]).map(s=>[s.id,s.target])):daily.targets;
    const key=JSON.stringify([next.date,goals,shown]);
    if(key!==renderKey){
      renderKey=key;
      $('goal-keeper-targets').innerHTML=SUBJECTS.map(s=>`<span class="goal-subject-${s.id}"><b>${s.mark}</b>${s.name}<strong>${duration(shown[s.id]??defaults[s.id])}</strong></span>`).join('');
      $('goal-keeper-quota').textContent=historical?'历史航图 · 只读':`今日可调整 ${daily.changesRemaining} / ${daily.changeLimit} 次`;
      $('goal-keeper-note').textContent=historical?'这里显示所选日期的目标，历史目标不能修改。旧记录缺少确切目标时，会在热力图标注为参考值。':daily.changesUsed?'今天的目标已记下，午夜后恢复 3 / 3 / 1 / 1 小时。':'每日默认 3 / 3 / 1 / 1 小时，只有与司衡确认才会调整今天的目标。';
      $('goal-daily-open').disabled=historical||daily.changesRemaining<=0;
      $('goal-daily-open').innerHTML=historical?'历史目标已归档':daily.changesRemaining<=0?'今日调整次数已用完':'与司衡调整目标 <span aria-hidden="true">↗</span>';
      $('goal-keeper-next').textContent=historical?'回到今天后可与司衡交谈':'每日最多两次 · 仅影响今天';
    }
    if($('goal-daily-dialog').open){
      const stale=dailyDay!==goals.today;
      $('goal-daily-save').disabled=dailyBusy||stale||daily.changesRemaining<=0;
      if(stale)fail('daily','日期已经切换。请关闭这张航图，再查看今天的目标。');
      else if(daily.changesRemaining<=0&&!dailyBusy)fail('daily','今天的两次调整已经用完，请关闭后查看已记录的目标。');
    }
    if(!required()&&$('goal-weekly-dialog').open&&!weeklyBusy)$('goal-weekly-dialog').close();
    ensureWeekly();
  }
  function ensureWeekly(){
    if(!initialized||!required()||document.hidden)return false;
    const dialog=$('goal-weekly-dialog'),w=goals.weekly;
    if(weeklyWeek!==w.weekStart){
      weeklyWeek=w.weekStart;weeklyRequest=null;
      $('goal-week-hours').value=hours(w.target).replaceAll(',','');
      $('goal-weekly-range').textContent=`${w.weekStart.replaceAll('-','.')} — ${w.weekEnd.replaceAll('-','.')} · 周一至周日`;
      $('goal-weekly-error').hidden=true;
    }
    if(!dialog.open){hooks.beforeWeekly?.();dialog.showModal();}
    return true;
  }
  function openDaily(){
    if(!state||!goals||state.date!==goals.today||goals.daily.changesRemaining<=0||required())return;
    dailyDay=goals.today;dailyRequest=null;
    for(const s of SUBJECTS)$(`goal-hours-${s.id}`).value=hours(goals.daily.targets[s.id]).replaceAll(',','');
    $('goal-daily-intro').textContent=`${dailyDay.replaceAll('-','.')} · 今天还可调整 ${goals.daily.changesRemaining} 次。确认实际变更后才消耗一次。`;
    $('goal-daily-error').hidden=true;$('goal-daily-save').disabled=false;dailyTotal();$('goal-daily-dialog').showModal();
  }
  async function saveDaily(event){
    event.preventDefault();if(dailyBusy||!goals)return;
    $('goal-daily-error').hidden=true;
    let payload;
    try{
      if(dailyDay!==goals.today)throw new Error('日期已经切换。请关闭后重新打开今天的航图。');
      const targets=parseTargets(Object.fromEntries(SUBJECTS.map(s=>[s.id,$(`goal-hours-${s.id}`).value])));
      if(SUBJECTS.every(s=>targets[s.id]===goals.daily.targets[s.id])&&!dailyRequest)throw new Error('目标没有变化，不会消耗调整次数。');
      payload=requestFor('daily',{day:dailyDay,targets});
    }catch(error){fail('daily',error.message);return;}
    dailyBusy=true;disableDailyInputs(true);$('goal-daily-save').disabled=true;$('goal-daily-save').textContent='正在记下…';
    try{
      goals=await hooks.api('/api/goals/daily',payload);
      $('goal-daily-dialog').close();dailyRequest=null;
      await hooks.refresh?.(true,true);
      hooks.afterChange?.();hooks.toast?.('今日航图已更新',`今天还可调整 ${goals.daily.changesRemaining} 次，明天恢复默认目标。`);
    }catch(error){fail('daily',error.message);}
    finally{dailyBusy=false;disableDailyInputs(false);$('goal-daily-save').textContent='确认今日目标';$('goal-daily-save').disabled=dailyDay!==goals?.today||goals?.daily.changesRemaining<=0;}
  }
  async function saveWeekly(event){
    event.preventDefault();if(weeklyBusy||!required())return;
    $('goal-weekly-error').hidden=true;
    let payload;
    try{payload=requestFor('weekly',{weekStart:weeklyWeek,target:parseWeekly($('goal-week-hours').value)});}
    catch(error){fail('weekly',error.message);return;}
    weeklyBusy=true;$('goal-week-hours').disabled=true;$('goal-weekly-save').disabled=true;$('goal-weekly-save').textContent='正在封存本周航图…';
    try{
      goals=await hooks.api('/api/goals/weekly',payload);
      if(!required())$('goal-weekly-dialog').close();weeklyRequest=null;
      await hooks.refresh?.(true,true);hooks.afterChange?.();
      hooks.toast?.('本周目标已确定','这份目标将保存为本周的达成依据，下周再制定新的计划。');
    }catch(error){fail('weekly',error.message);}
    finally{weeklyBusy=false;$('goal-week-hours').disabled=false;$('goal-weekly-save').disabled=false;$('goal-weekly-save').textContent='确认，开启这一周';ensureWeekly();if(!required())hooks.resume?.();}
  }
  const api={init,render,required,ensureWeekly,openDaily,parseTargets,parseWeekly,portrait};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FocusGoals=api;
})(typeof window!=='undefined'?window:globalThis);
