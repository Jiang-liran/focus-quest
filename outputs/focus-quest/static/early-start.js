(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.FocusEarlyStart=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const tiers=Object.freeze([{beforeHour:8,label:'08:00 前',coins:90,diamonds:2,coinTickets:1,diamondTickets:1},{beforeHour:9,label:'08:00–08:59',coins:60,diamonds:1,coinTickets:0,diamondTickets:1},{beforeHour:10,label:'09:00–09:59',coins:30,diamonds:1,coinTickets:1,diamondTickets:0}]);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=kind=>root.FocusCurrencyArt?.icon(kind)||'';
  function firstClock(state){const v=state?.firstStart;if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)$/.test(v))return '';const date=new Date(v);return Number.isFinite(date.getTime())?date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'';}
  function status(state){
    const time=firstClock(state);
    if(state?.status==='awarded'){
      const tickets=state.lotteryTickets||{},received=[];
      if(tickets.coinTickets>0)received.push(`金币券 ${Math.floor(tickets.coinTickets)} 张`);
      if(tickets.diamondTickets>0)received.push(`钻石券 ${Math.floor(tickets.diamondTickets)} 张`);
      return `今日首段专注 ${time} 开始 · 晨光礼已自动收进钱包。${received.length?received.join('、')+'已放入券夹。':''}`;
    }
    if(state?.status==='prior')return '今天的第一段专注已留在记录中；晨光礼从更新后的新学习开始生效。';
    if(state?.status==='late')return `今日首段专注 ${time} 开始 · 专注照常积累，晨光礼明天再见。`;
    if(state?.status==='recorded')return `今日首段专注 ${time} 开始 · 奖励将在学习记录同步后自动收好。`;
    return '完成今天的第一段专注后自动发放，每天一份；到账后会弹窗提示；打开软件本身不会领取。';
  }
  function markup(state,compact=false){return `<div class="early-start-header"><span>☀ 晨光启程礼</span><small>看开始时间，不看结束时间</small></div><div class="early-start-tiers">${tiers.map(t=>`<div class="early-start-tier${state?.status==='awarded'&&state?.tier===t.beforeHour?' is-awarded':''}"><b>${t.label}</b><span>${icon('coin')}${t.coins} 金币</span><span>${icon('diamond')}${t.diamonds} 钻石</span><small class="early-start-tickets">${t.coinTickets?'<span class="coin">金币券 × 1</span>':''}${t.diamondTickets?'<span class="diamond">钻石券 × 1</span>':''}</small></div>`).join('')}</div><p class="early-start-rule">按当天第一段已完成学习的实际开始时间判定，听课、做题、背单词等均可；开始于 10:00 及以后不发晨光礼。早于 07:00 按最高档。首段完成并同步后，金币、钻石与抽奖券自动收好，并弹窗提示，每天一份；晚结束不影响档位。</p><p class="early-start-status" role="status">${esc(status(state))}</p>`;}
  function render(data){const node=root.document?.getElementById('quest-early-start');if(!node)return;const html=markup(data?.earlyStart,true);if(node._earlyMarkup!==html){node.innerHTML=html;node._earlyMarkup=html;}}
  const noticeKey='focusquest:early-start-notices:v1',fields=['coins','diamonds','coinTickets','diamondTickets'];
  let observed=null,seen=Object.create(null);
  const amount=value=>Number.isSafeInteger(value)&&value>0?value:0;
  function observe(data){
    const state=data?.quests?.earlyStart;
    observed=state?.status==='awarded'&&/^\d{4}-\d\d-\d\d$/.test(state.day||'')&&state.day===data.today&&firstClock(state)
      ?{day:state.day,firstStart:state.firstStart,tier:state.tier,...Object.fromEntries(fields.map(field=>[field,amount((field.endsWith('Tickets')?state.lotteryTickets:state.reward)?.[field])]))}:null;
  }
  function readSeen(){
    try{
      const saved=JSON.parse(root.localStorage?.getItem(noticeKey)||'{}');
      for(const [day,value] of Object.entries(saved||{})){
        if(!/^\d{4}-\d\d-\d\d$/.test(day)||!value||typeof value!=='object')continue;
        seen[day]=Object.fromEntries(fields.map(field=>[field,Math.max(amount(seen[day]?.[field]),amount(value[field]))]));
      }
    }catch(_){} // A storage restriction must never prevent the arrival notice.
    return seen;
  }
  function pendingNotice(){
    if(!observed)return null;
    const previous=readSeen()[observed.day]||{};
    const received=Object.fromEntries(fields.map(field=>[field,Math.max(0,observed[field]-amount(previous[field]))]));
    return fields.some(field=>received[field])?{...observed,received,supplement:fields.some(field=>amount(previous[field]))}:null;
  }
  function ticketIcon(kind){
    return `<svg class="early-start-ticket-icon" viewBox="0 0 78 52" aria-hidden="true"><path d="M8 8h62v11a7 7 0 0 0 0 14v11H8V33a7 7 0 0 0 0-14Z" fill="currentColor" opacity=".18"/><path d="M8 8h62v11a7 7 0 0 0 0 14v11H8V33a7 7 0 0 0 0-14Z M56 10v32" fill="none" stroke="currentColor" stroke-width="1.5"/><g transform="translate(20 14)">${root.FocusCurrencyArt?.symbol(kind)||''}</g></svg>`;
  }
  function noticeMarkup(notice){
    const rewards=[['coins','金币','coin','钱包'],['diamonds','钻石','diamond','钱包'],['coinTickets','金币抽奖券','coin','券夹'],['diamondTickets','钻石抽奖券','diamond','券夹']];
    const tier=tiers.find(t=>t.beforeHour===notice.tier);
    return `<div class="early-start-arrival-art" aria-hidden="true"><svg viewBox="0 0 180 98"><circle cx="90" cy="39" r="30" fill="currentColor" opacity=".08"/><path d="M28 68h124M90 8v7m-36 12 6 4m64-4-6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M68 63a22 22 0 0 1 44 0" fill="currentColor" opacity=".2"/><path d="m62 62 28-9 28 9v22l-28 9-28-9Z" fill="var(--ui-accent,#b5a0df)"/><path d="m90 71 28-9v22l-28 9Z" fill="currentColor" opacity=".24"/><path d="m62 62 28 9 28-9-28-9Z" fill="var(--ui-surface-raised,#d3c4ec)"/><path d="m80 56 28 10m-36 0 28-10M90 71v22" stroke="currentColor" stroke-width="4"/><path d="M90 54c-17-3-16-15-7-12 5 1 7 12 7 12Zm0 0c17-3 16-15 7-12-5 1-7 12-7 12Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="m39 43 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm101 3 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="currentColor" opacity=".6"/></svg></div><span class="eyebrow">MORNING LIGHT · ${notice.supplement?'补充到账':'今天的第一份晨光'}</span><h2 id="early-start-notice-title">${notice.supplement?'晨光礼补充奖励，已到账':'晨光启程礼，已到账'}</h2><p class="early-start-arrival-copy">今天的第一段专注，从 <strong>${esc(firstClock(notice))}</strong> 开始。</p>${tier?`<span class="early-start-arrival-tier">${esc(tier.label)} · ${notice.supplement?'本次只提示新补入的奖励':'按开始时间获得奖励'}</span>`:''}<div class="early-start-arrival-rewards">${rewards.filter(([field])=>notice.received[field]>0).map(([field,label,kind,destination])=>`<div class="early-start-arrival-reward ${kind}">${field.endsWith('Tickets')?ticketIcon(kind):icon(kind)}<div><span>${label}</span><strong>+${notice.received[field]}${field.endsWith('Tickets')?'<small> 张</small>':''}</strong><small>已存入${destination}</small></div></div>`).join('')}</div><p class="early-start-arrival-note" id="early-start-notice-note">奖励已自动保存，无需再次领取。${notice.supplement?'更早开始的记录刚刚同步，已补上对应差额。':'早一点启程，这份努力已经记下。'}</p>`;
  }
  function showNotice(){
    const doc=root.document,dialog=doc?.getElementById('early-start-notice-dialog'),body=doc?.getElementById('early-start-notice-content');
    if(!dialog||!body||doc.hidden||doc.querySelector('dialog[open]'))return false;
    const notice=pendingNotice();if(!notice)return false;
    body.innerHTML=noticeMarkup(notice);
    try{dialog.showModal();}catch(_){return false;}
    dialog.querySelector?.('button.primary-button')?.focus({preventScroll:true});
    // This acknowledges only the visible notification. Payment belongs to the
    // service; polling, dismissing or reopening this dialog never pays again.
    seen[notice.day]=Object.fromEntries(fields.map(field=>[field,Math.max(amount(seen[notice.day]?.[field]),notice[field])]));
    seen=Object.fromEntries(Object.keys(seen).sort().slice(-31).map(day=>[day,seen[day]]));
    try{root.localStorage?.setItem(noticeKey,JSON.stringify(seen));}catch(_){}
    return true;
  }
  return Object.freeze({tiers,markup,status,render,observe,pendingNotice,noticeMarkup,showNotice});
});
