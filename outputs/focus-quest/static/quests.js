(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusQuests=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const names={bar:'进度条',fx:'星岛特效',avatar:'我的时装',banner:'旅人铭牌',theme:'星岛环境',interface:'界面主题',companion:'随行伙伴',relic:'星岛圣物',portal:'远征之门',island:'主岛布置',camp:'营地地貌',fire:'篝火样式',tent:'歇脚帐篷',campgear:'营地陈设',campglow:'营地氛围',chatframe:'对话外观',camptrail:'营地小径',campmark:'营地地标'};
  const campSlots=new Set(['camp','fire','tent','campgear','campglow','chatframe','camptrail','campmark']);
  const citadelSlots=new Set(['theme','fx','avatar','companion','relic','portal']);
  const subjectNames={math:'数学',politics:'政治',cs:'408',english:'英语'};
  const statuses={locked:'尚未发布',available:'可以接取',active:'进行中',ready:'可以交付',expired:'今日已结束',claimed:'已交付'};
  const mentors={morning:{name:'司晨',title:'晨间导师',quote:'「先以数学磨砺思路，再用政治梳理脉络。把上午交给扎实的理解。」',hours:'00:00 — 12:00',grace:'12:30',subjects:'数学 · 政治'},afternoon:{name:'逐光',title:'午后领航员',quote:'「让知识连成网络，让语言打开远方。午后的航程，由你来选择。」',hours:'12:00 — 18:00',grace:'18:30',subjects:'408 · 英语'}};
  let data=null,bridge=null,filter='all',market='coins',area='all',busy=false,intent=null,lastStamp=-Infinity,shopCatalogKey=null;
  const markupCache=new Map();
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=value=>Number(value||0).toLocaleString('zh-CN',{maximumFractionDigits:1});
  const clock=value=>new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
  const shortDay=value=>new Date(value+'T12:00:00').toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'});
  const money=(coins,diamonds)=>`<span class="q-money"><span class="coin-mark">●</span> ${n(coins)} <small>金币</small><span class="diamond-mark">◆</span> ${n(diamonds)} <small>钻石</small></span>`;
  const currency=item=>item.currency||(item.diamonds?'diamonds':item.coins?'coins':'free');
  const possession=item=>item.equipped?'已装备':currency(item)==='free'?'初始收藏':item.lotteryOnly?'已收藏':'已购买';
  const price=item=>item.owned&&(item.equipped||currency(item)!=='free')?`<span class="shop-possession ${item.equipped?'equipped':'purchased'}"><i aria-hidden="true">${item.equipped?'✦':'✓'}</i><b>${possession(item)}</b><small>${currency(item)==='free'?'初始收藏':'永久拥有'}</small></span>`:item.lotteryOnly?`<span class="shop-limited-price">✧ ${item.lotteryMachine==='diamond'?'钻石':'金币'}机限定 <small>只能通过抽奖获得</small></span>`:currency(item)==='free'?'<span class="shop-free">初始收藏 · 免费</span>':`<span class="shop-single-price ${currency(item)}"><i class="${currency(item)==='coins'?'coin':'diamond'}-mark">${currency(item)==='coins'?'●':'◆'}</i> ${n(item[currency(item)])} <small>${currency(item)==='coins'?'金币':'钻石'}</small></span>`;
  const avatar=(role,outfit)=>window.QuestArt?.avatar(role,outfit)||'';
  const mentorPeriod=q=>q.recommended?.period||q.period;
  const roundName=period=>period==='afternoon'?'午后首轮':'晨光首轮';
  const rewardText=reward=>`${n(reward?.coins)} 金币 · ${n(reward?.diamonds)} 钻石`;
  function ticketReward(tickets){
    if(!tickets||!['coinTickets','diamondTickets'].every(key=>Number.isInteger(tickets[key])&&tickets[key]>=0))return null;
    return [['coinTickets','金币抽奖券'],['diamondTickets','钻石抽奖券']].filter(([key])=>tickets[key]>0).map(([key,label])=>`${n(tickets[key])} 张${label}`).join(' · ');
  }
  function roundTicketReward(round){
    if(!round||!['rounds','coinTickets','diamondTickets'].every(key=>Number.isInteger(round[key])&&round[key]>=0))return '';
    return ticketReward(round)||'';
  }
  function roundTicketSummary(){
    const rounds=data?.lottery?.roundTickets;
    if(!Number.isInteger(rounds?.totalRounds)||rounds.totalRounds<0||!Number.isInteger(rounds.roundsToNextDiamond)||rounds.roundsToNextDiamond<1||rounds.roundsToNextDiamond>3)return '';
    return `普通委托累计交付 ${n(rounds.totalRounds)} 轮，再交付 ${n(rounds.roundsToNextDiamond)} 轮可得 1 张钻石抽奖券。`;
  }
  function roundTicketHint(q){
    if(!q.roundTickets)return '';
    const reward=roundTicketReward(q.roundTickets);
    return reward?` 本次交付完成 ${n(q.roundTickets.rounds)} 轮，另得 ${reward}。`:` 普通委托每交付完整 ${n(q.target)} 分钟，得 1 张金币抽奖券；不足一轮继续保留。`;
  }
  function rewardBreakdown(base,bonus){
    return `<div class="q-reward-breakdown"><span>基础奖励 <b>${esc(rewardText(base))}</b></span><span>首轮加赠 <b>${esc(rewardText(bonus))}</b></span></div>`;
  }
  function firstRoundMarkup(q){
    const b=q.bonus;if(!b?.enabled)return '';
    const target=Math.max(0,Number(b.target)||0),minutes=Math.max(0,Number(b.minutes)||0);
    const percent=target?Math.min(100,Math.floor(minutes/target*1000)/10):0;
    const labels={unaccepted:'接取后开始',upcoming:'尚未开始',active:'慢慢积累',ready:'已达成 · 待领取',claimed:'今日已领取',ended:'时段已结束'};
    const notes={unaccepted:'接取后，这个时段内的专注就会开始累计。',upcoming:'还没到这个时段，现在学习的基础奖励照常。',active:'这一段有份小小加赠，按自己的节奏来。',ready:'这份收获会为你保留，方便时再来交付。',claimed:'今天的这份加赠已收下，基础奖励继续累计。',ended:'基础奖励照常，稍后同步的时段内记录仍可补入。'};
    const pending=Array.isArray(b.pending)?b.pending:[],past=pending.filter(row=>row.day!==b.day);
    const tickets=ticketReward(b.lotteryTickets),ticketCopy=tickets?`本次首轮另得 ${tickets}，交付时一起收好。`:tickets!==null&&['unaccepted','upcoming','active'].includes(b.status)?'当日新首轮领取另赠 1 张金币抽奖券。':'';
    return `<section class="q-first-round ${esc(b.status)}" aria-label="${esc(q.name)}${roundName(b.period)}"><div class="q-first-round-heading"><strong>${roundName(b.period)}</strong><span>${esc(labels[b.status]||'等待同步')}</span></div><div class="q-first-round-window"><span>${esc(b.windowLabel)}</span><span>每天一次</span></div><div class="q-first-round-progress" data-skin-slots="bar" tabindex="0" title="右键更换进度条外观" role="progressbar" aria-label="${roundName(b.period)}进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${n(minutes)} / ${n(target)} 分钟"><i style="width:${percent}%"></i></div><div class="q-first-round-amount"><span>${n(minutes)} / ${n(target)} 分钟</span><span>额外 <b>${n(b.reward?.coins)}</b> 金币 · <b>${n(b.reward?.diamonds)}</b> 钻石</span></div><p>${esc(notes[b.status]||'已同步的有效专注会记在这里。')}</p>${ticketCopy?`<p class="q-first-round-ticket">${esc(ticketCopy)}</p>`:''}${past.length?`<p class="q-first-round-pending">另有过往 ${n(past.length)} 天的首轮待领取，交付时一起收下。</p>`:''}</section>`;
  }
  function bonusDays(rows){
    return Array.isArray(rows)&&rows.length?rows.map(row=>esc(row.day)).join('、'):'';
  }
  function historyMarkup(row){
    const bonus=row.bonusReward||{coins:0,diamonds:0},base=row.baseReward||{coins:row.coins,diamonds:row.diamonds};
    const hasBonus=Number(bonus.coins)>0||Number(bonus.diamonds)>0;
    return `<div class="q-history-row"><span><strong>${esc(row.name)}</strong><small>${esc(row.day)} · ${clock(row.submittedAt)} 交付</small></span><span>${row.minutes>0?`${n(row.minutes)} 分钟`:hasBonus?'补领首轮':'0 分钟'}</span><div class="q-history-reward">${money(row.coins,row.diamonds)}${hasBonus?`${rewardBreakdown(base,bonus)}<small class="q-history-bonus-days">首轮归属 ${bonusDays(row.bonuses)||'已达成的学习日'}</small>`:''}</div></div>`;
  }
  function replace(id,html){
    const el=$(id);
    // Browsers normalize SVG and boolean attributes in innerHTML. Compare the
    // original markup, so polling preserves focus and ongoing shop animations.
    if(el&&markupCache.get(id)!==html){el.innerHTML=html;markupCache.set(id,html);window.FocusProgressBars?.decorate(el);}
  }
  function actionFor(q){
    if(q.status==='available')return {action:'accept',label:'接取委托'};
    if(q.status==='ready')return {action:'submit',label:'交付委托'};
    if(q.continuous)return {action:null,label:q.status==='active'?(q.firstCompleted?'继续专注 · 等待新收获':'专注中 · 等待首次达标'):'暂不可用'};
    return {action:null,label:{locked:clock(q.opensAt)+' 发布',active:new Date(data?.now||0)>=new Date(q.deadline)?'等待同步 · 未达标':'专注中 · 等待达标',expired:'已过今日期限',claimed:'奖励已收下'}[q.status]||'暂不可用'};
  }
  function continuousTaskMarkup(q,disabled){
    const action=actionFor(q),progress=Math.max(0,Number(q.progressMinutes)||0),shownPercent=Math.floor(progress/q.target*1000)/10;
    const first=!q.firstCompleted,reward=q.reward||{coins:0,diamonds:0};
    const advertised=q.status==='available'||first&&q.status!=='ready'?q.baseReward:reward;
    const rewardLabel=q.status==='available'||first&&q.status!=='ready'?'首次达标基础奖励':'本次可交付收获';
    const note=(q.status==='available'?'接取后开始累计，四科可同时接取。听课、做题均计入。':q.status==='ready'?'交付后继续累计；未满的金币与钻石进度会保留。':first?'先完成首次目标，再交付收获。跨天保留进度，按自己的节奏完成。':'首次目标已完成，新增专注继续产生奖励，有新收获就能再次交付。')+roundTicketHint(q);
    return `<article class="q-task continuous ${esc(q.status)}" data-subject="${esc(q.subject)}"><div class="q-task-heading"><h3>${esc(q.name)}</h3><span class="q-status">${esc(statuses[q.status]||'待同步')}</span></div><p class="q-progress-caption">${first?'首次目标与钻石进度':'下一份钻石进度'} · 每满 ${n(q.target)} 分钟得 2 钻石</p><div class="q-numbers"><strong>${n(progress)}<small>分钟</small></strong><span>/ ${n(q.target)} 分钟</span><b>${n(shownPercent)}%</b></div><div class="q-progress" data-skin-slots="bar" tabindex="0" title="右键更换进度条外观" role="progressbar" aria-label="${esc(q.name)}钻石进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,shownPercent)}" aria-valuetext="${n(shownPercent)}%"><i style="width:${Math.min(100,shownPercent)}%"></i></div><div class="q-study-account"><span>待交付专注 <b>${n(q.minutes)} 分钟</b></span><span>今日已交付 <b>${n(q.todaySettledMinutes)} 分钟</b></span></div><div class="q-reward"><small>${rewardLabel}</small>${money(advertised?.coins||0,advertised?.diamonds||0)}</div>${firstRoundMarkup(q)}<p class="q-task-note">${note}</p><button class="${action.action==='submit'?'primary-button':'secondary-button'} q-task-button" ${action.action?`data-quest-action="${action.action}" data-subject="${esc(q.subject)}"`:''} ${!action.action||disabled?'disabled':''}>${esc(action.label)}</button></article>`;
  }
  function taskMarkup(q,disabled=false){
    if(q.continuous)return continuousTaskMarkup(q,disabled);
    const action=actionFor(q),complete=q.status==='claimed',shownPercent=Math.floor(Math.max(0,Number(q.minutes)/Number(q.target)||0)*1000)/10;
    const reward=q.reward||{coins:0,diamonds:0},base=q.baseReward||{coins:q.target*2,diamonds:2};
    const gain=q.minutes>=q.target?`已积累 ${n(Math.floor(q.minutes/q.target*10)/10)} 倍目标时长`:'达标基础奖励';
    let note=complete?`已于 ${clock(q.submittedAt)} 交付 · 本次奖励已结算`:q.status==='available'?'接取后开始累计，听课与做题均可。':q.status==='locked'?'午间发布，现在先走好上午的路。':q.status==='expired'?'明天会有新的委托，已有学习记录照常保留。':`学习截止 ${clock(q.deadline)} · 最晚 ${clock(q.submitDeadline)} 交付`;
    if(q.status==='ready')note+=new Date(data?.now||0)>=new Date(q.deadline)?'。已停止累计，请及时交付。':'。可以继续积累，交付后不再追加。';
    const advertised=q.minutes>=q.target||complete?reward:base;
    return `<article class="q-task ${esc(q.status)}" data-subject="${esc(q.subject)}"><div class="q-task-heading"><h3>${esc(q.name)}</h3><span class="q-status">${esc(statuses[q.status]||'待同步')}</span></div><div class="q-numbers"><strong>${n(q.minutes)}<small>分钟</small></strong><span>/ ${n(q.target)} 分钟</span><b>${n(shownPercent)}%</b></div><div class="q-progress" data-skin-slots="bar" tabindex="0" title="右键更换进度条外观" role="progressbar" aria-label="${esc(q.name)}委托进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,shownPercent)}" aria-valuetext="${n(shownPercent)}%"><i style="width:${Math.min(100,shownPercent)}%"></i></div><div class="q-reward"><small>${esc(complete?'本次收获':q.status==='expired'?'未领取 · 本次已过期':gain)}</small>${money(advertised.coins,advertised.diamonds)}</div><p class="q-task-note">${esc(note)}</p><button class="${action.action==='submit'?'primary-button':'secondary-button'} q-task-button" ${action.action?`data-quest-action="${action.action}" data-subject="${esc(q.subject)}"`:''} ${!action.action||disabled?'disabled':''}>${esc(action.label)}</button></article>`;
  }
  function swatch(item){
    if(campSlots.has(item.slot))return `<div class="cosmetic-swatch campfire-swatch" data-item="${esc(item.id)}">${window.FocusCampfireShopArt?.preview(item.id,data?.equipped)||''}</div>`;
    if(item.slot==='avatar')return `<div class="cosmetic-swatch outfit-swatch" data-item="${esc(item.id)}">${avatar('player',item.id)}</div>`;
    const art=window.ShopArt?.preview(item.id)||'';
    return `<div class="cosmetic-swatch ${art?'shop-art-swatch':''}" data-item="${esc(item.id)}">${art}</div>`;
  }
  function itemMarkup(item,wallet,disabled=false){
    const affordable=wallet.coins>=item.coins&&wallet.diamonds>=item.diamonds;
    const label=item.equipped?'已装备':item.owned?'装备':item.lotteryOnly?'抽奖限定':affordable?'购买':'余额不足';
    return `<article class="shop-item ${item.owned?'owned ':''}${item.equipped?'equipped':''}" data-currency="${esc(currency(item))}"><div class="shop-item-visual">${swatch(item)}<span class="shop-item-type">${esc(names[item.slot])}</span>${item.owned?`<span class="shop-owned">${item.equipped?'✦ ':''}${possession(item)}</span>`:''}</div><div class="shop-item-info"><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><div class="shop-price">${price(item)}</div><div class="shop-item-actions"><button class="text-button" data-shop-action="preview" data-item="${esc(item.id)}">${item.slot==='avatar'?'试穿':'预览'}</button><button class="secondary-button" data-shop-action="${item.owned?'equip':'buy'}" data-item="${esc(item.id)}" ${disabled||item.equipped||!item.owned&&(!affordable||item.lotteryOnly)?'disabled':''}>${label}</button></div></div></article>`;
  }
  function render(next){
    if(!next||!bridge)return;
    // Preserve the service's microseconds when a poll races a purchase response.
    const fraction=String(next.now).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);
    const stamp=Date.parse(next.now)*1000+Number((fraction?.[1]||'').padEnd(6,'0').slice(3,6));
    if(Number.isFinite(stamp)&&stamp<lastStamp)return;
    if(Number.isFinite(stamp))lastStamp=stamp;
    data=next;
    const previewBar=window.FocusQuickSkins?.previewBar?.();
    const appearance=previewBar&&data.catalog.some(item=>item.id===previewBar&&item.slot==='bar'&&item.owned)?{...data.equipped,bar:previewBar}:data.equipped||{};
    delete document.documentElement.dataset.npc;
    for(const [slot,id] of Object.entries(appearance))document.documentElement.dataset[slot]=id;
    window.FocusInterfaceThemes?.apply(data.equipped?.interface);
    window.ShopArt?.apply(appearance);
    window.FocusCitadel?.applyEquipment?.(data.equipped||{},data.now);
    window.FocusCampfire?.applyEquipment(data.equipped||{},data.now);
    for(const prefix of ['wallet-side','quest','shop']){
      $(prefix+'-coins').textContent=n(data.wallet.coins);$(prefix+'-diamonds').textContent=n(data.wallet.diamonds);
    }
    const continuous=data.quests.some(q=>q.continuous);
    $('quest-today-label').textContent=shortDay(data.day)+(continuous?' · 全天自由委托':' · 今日委托');
    const ready=data.quests.filter(q=>q.status==='ready').length,active=data.quests.filter(q=>q.status==='active').length,available=data.quests.filter(q=>q.status==='available').length;
    $('quest-invitation-text').textContent=ready?`${ready} 项委托已达标，记得在期限内交付领奖。`:active?`${active} 项委托进行中，额外投入也会计入奖励。`:available?`${available} 项委托可以接取，去和营地伙伴聊聊。`:'今日委托已收起，明天再来开启新的旅程。';
    if(continuous)$('quest-invitation-text').textContent=ready?`${ready} 项委托有收获可交付，已达成的首轮也会为你保留。`:active?`${active} 项委托持续进行中，基础奖励照常，推荐时段另有首轮加赠。`:'四科委托随时可接，选好科目，再按自己的计划出发。';
    replace('quest-board',Object.entries(mentors).map(([period,m])=>{
      const tasks=data.quests.filter(q=>mentorPeriod(q)===period),recommended=tasks.some(q=>q.recommended?.active);
      const quote=continuous?(period==='morning'?'「思路有它自己的节奏。想推演或思辨时，我一直在这里。」':'「带着问题出发，循着理解前行。每个时刻，都能写下新的进展。」'):m.quote;
      const pairTickets=continuous&&tasks.some(q=>q.bonus?.enabled&&ticketReward(q.bonus.lotteryTickets)!==null)?`<span>同日${period==='morning'?'数学、政治':'408、英语'}首轮领齐 · 1 张钻石抽奖券</span>`:'';
      const schedule=continuous?`<span><i></i>全天可接 · 基础奖励始终相同</span><span class="${recommended?'q-recommended':''}">${recommended?'此刻推荐':'常练时段：'+(period==='morning'?'上午':'下午')} · 首轮额外加赠</span>${pairTickets}`:`<span><i></i>${m.hours} 学习窗口</span><span>${m.grace} 交付截止</span>`;
      return `<section class="q-mentor ${period}"><header class="q-mentor-header"><div class="q-portrait">${avatar(period)}</div><div><span class="q-mentor-role">${esc(m.title)} · ${m.subjects}</span><h2>${m.name}<small>${continuous?'按你的节奏，随时启程':period==='morning'?'守住晨光里的秩序':'沿着午后的光前行'}</small></h2><p>${quote}</p></div></header><div class="q-schedule">${schedule}</div><div class="q-task-grid">${tasks.map(q=>taskMarkup(q,busy)).join('')}</div></section>`;
    }).join(''));
    replace('shop-keeper',avatar('shop'));
    replace('player-outfit',avatar('player',data.equipped.avatar));
    const paid=data.catalog.filter(i=>currency(i)!=='free'),owned=paid.filter(i=>i.owned);
    $('equipped-summary').textContent=`已收藏 ${owned.length} / ${paid.length} 件 · ${data.catalog.find(i=>i.id===data.equipped.avatar)?.name||'初始装扮'}`;
    if($('loadout-slot-count'))$('loadout-slot-count').textContent=String(Object.keys(names).length);
    if($('shop-slot-count'))$('shop-slot-count').textContent=String(Object.keys(names).length);
    replace('equipped-slots',Object.entries(names).map(([slot,label])=>`<button data-loadout-slot="${slot}"><span>${label}</span><strong>${esc(data.catalog.find(i=>i.id===data.equipped[slot])?.name||'初始装扮')}</strong><i>↗</i></button>`).join(''));
    renderShop();
    renderExchange();
    replace('quest-history',data.history.length?data.history.map(historyMarkup).join(''):'<div class="q-empty"><span>✧</span><p>第一份委托，等你亲手交付。</p><small>完成后，金币、钻石和这次努力会一起记在这里。</small></div>');
    window.FocusQuickSkins?.render(data);
    window.FocusMystery?.render(data);
    window.FocusProgressBars?.decorate(document);
  }
  function renderShop(){
    const inArea=i=>area==='all'||(area==='interface'?i.slot==='interface':area==='camp'?campSlots.has(i.slot):i.slot!=='interface'&&!campSlots.has(i.slot));
    const inMarket=(i,m)=>m==='owned'?i.owned:m==='limited'?i.lotteryOnly:currency(i)===m&&!i.lotteryOnly;
    const marketItems=data.catalog.filter(i=>inArea(i)&&inMarket(i,market));
    document.querySelectorAll('[data-shop-area]').forEach(b=>{b.classList.toggle('active',b.dataset.shopArea===area);b.setAttribute('aria-pressed',String(b.dataset.shopArea===area));});
    if(filter!=='all'&&!marketItems.some(i=>i.slot===filter))filter='all';
    document.querySelectorAll('[data-shop-filter]').forEach(b=>{
      const selected=b.dataset.shopFilter===filter;
      b.hidden=b.dataset.shopFilter!=='all'&&!marketItems.some(i=>i.slot===b.dataset.shopFilter);
      b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
    });
    document.querySelectorAll('[data-shop-market]').forEach(b=>{
      const selected=b.dataset.shopMarket===market;
      b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
    });
    for(const m of ['coins','diamonds','owned','limited'])if($('market-'+m+'-count'))$('market-'+m+'-count').textContent=n(data.catalog.filter(i=>inArea(i)&&inMarket(i,m)).length);
    $('shop-market-description').textContent={coins:'从一抹新绿到一身新装，把今天的努力变成小小的庆祝。',diamonds:'收集更辽阔的风景，遇见新的旅伴。这里的每件收藏，只需钻石。',owned:'这里存放你已拥有的全部外观，也可以随时换回最初的模样。',limited:'只能通过星海抽奖机获得的特别收藏。金币机30抽、钻石机20抽保底；提前遇见限定藏品会重置对应计数，优先获得尚未拥有的款式。'}[market];
    if(market!=='limited'&&area==='camp')$('shop-market-description').textContent=market==='owned'?'已拥有的营地布置，八个位置可以独立搭配，初始款随时可换回。':market==='coins'?'先添一张茶桌，再挑一顶帐篷。小小的金币收藏，让篝火旁更像自己的营地。':'湖畔、雪岭与极光，还有特别的星火。每件收藏只需钻石，购买后永久拥有。';
    if(market!=='limited'&&(area==='interface'||filter==='interface'))$('shop-market-description').textContent='从配色到边框、纹理与按钮，给整间书房换一种气质。界面主题独立装备，你已有的星岛环境、装饰和特效照常搭配。';
    if(market!=='limited'&&filter==='island')$('shop-market-description').textContent='主岛布置是一整套主题：从左前书箱、花箱与矮灯，到后侧精巧建筑。购买后收进收藏，装备一套会替换当前整套；多次购买不会自动叠加，也可随时换回素岛原貌。';
    const items=marketItems.filter(i=>filter==='all'||i.slot===filter);
    $('shop-result-count').textContent=`${items.length} 件${market==='owned'?'收藏':'商品'}`;
    const catalogKey=JSON.stringify([area,market,filter,items,data.wallet,data.equipped,busy]);
    if(catalogKey!==shopCatalogKey){
      replace('shop-catalog',items.length?items.map(item=>itemMarkup(item,data.wallet,busy)).join(''):'<div class="shop-empty">星织正在整理货架，请换个分类看看。</div>');
      shopCatalogKey=catalogKey;
    }
  }
  function exchangeAmount(){
    const amount=Number($('exchange-amount').value);
    return Number.isInteger(amount)&&amount>=1&&amount<=Math.min(1000,data?.exchange?.maxPerExchange||1000)?amount:null;
  }
  function renderExchange(){
    const rate=data.exchange?.coinsPerDiamond||75,amount=exchangeAmount(),max=Math.floor(data.wallet.coins/rate);
    $('exchange-rate').textContent=n(rate);
    $('exchange-cost').textContent=amount?`花费 ${n(amount*rate)} 金币`:'请输入 1–1000 的整数';
    $('exchange-open').disabled=busy||!amount||amount>max;
    $('exchange-hint').textContent=max?`当前可兑换 ${n(max)} 颗钻石。兑换不设每日限额，按需要慢慢攒。`:`再攒 ${n(rate-data.wallet.coins)} 金币，就能兑换一颗钻石。`;
    const reverse=data.exchange?.reverse,remaining=Math.max(0,Number(reverse?.remaining)||0),limit=Number(reverse?.limit)||5;
    $('exchange-reverse-open').textContent=`1 钻石换 ${n(rate)} 金币`;
    $('exchange-reverse-open').disabled=busy||!reverse||remaining<=0||data.wallet.diamonds<1;
    $('exchange-reverse-status').textContent=reverse?`今日剩余 ${n(remaining)} / ${n(limit)} 次${data.wallet.diamonds<1?' · 钻石不足':''}`:'正在同步今日兑换次数';
    $('exchange-reverse-rate').textContent=`1 钻石 = ${n(rate)} 金币 · 每次 1 钻石，每天最多 ${n(limit)} 次`;
    replace('exchange-history',(data.exchange?.history||[]).length?data.exchange.history.map(row=>{
      const reverse=row.direction==='diamonds-to-coins';
      return `<div><time>${esc(new Date(row.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}))}</time><span>−${n(reverse?row.diamonds:row.coins)} ${reverse?'钻石':'金币'}</span><strong>+${n(reverse?row.coins:row.diamonds)} ${reverse?'金币':'钻石'}</strong></div>`;
    }).join(''):'<p>还没有兑换记录。双向兑换都会记在这里。</p>');
  }
  function openExchange(){
    if(busy||!data)return;
    const amount=exchangeAmount(),rate=data.exchange?.coinsPerDiamond||75;
    if(!amount||amount*rate>data.wallet.coins)return;
    intent={action:'exchange',diamonds:amount,requestId:window.crypto.randomUUID()};
    dialog('把积累，凝成星光','THE STAR EXCHANGE','<div class="exchange-art"><span>●</span><i>→</i><b>◆</b></div>',`<p>将 <strong>${n(amount*rate)} 金币</strong>兑换为 <strong>${n(amount)} 颗钻石</strong>。</p><div class="q-action-reward">${price({currency:'diamonds',diamonds:amount})}<small>兑换所得，立即入袋</small></div><p>兑换比例：${n(rate)} 金币 = 1 钻石。</p><p class="q-fineprint">兑换后余额：${n(data.wallet.coins-amount*rate)} 金币 · ${n(data.wallet.diamonds+amount)} 钻石</p>`,'确认兑换','再攒一攒');
  }
  function openReverseExchange(){
    if(busy||!data||!data.exchange?.reverse||data.exchange.reverse.remaining<=0||data.wallet.diamonds<1)return;
    const rate=data.exchange.coinsPerDiamond||75,remaining=data.exchange.reverse.remaining;
    intent={action:'reverseExchange',requestId:window.crypto.randomUUID()};
    dialog('让星光，化作旅途盘缠','THE STAR EXCHANGE','<div class="exchange-art"><b>◆</b><i>→</i><span>●</span></div>',`<p>将 <strong>1 颗钻石</strong>兑换为 <strong>${n(rate)} 金币</strong>。</p><div class="q-action-reward">${price({currency:'coins',coins:rate})}<small>兑换所得，立即入袋</small></div><p>每天最多兑换 5 次，每次 1 钻石。确认后今天还可兑换 ${n(remaining-1)} 次。</p><p class="q-fineprint">兑换后余额：${n(data.wallet.coins+rate)} 金币 · ${n(data.wallet.diamonds-1)} 钻石</p>`,'确认兑换','先保留星光');
  }
  function dialog(title,eyebrow,art,body,label,cancel='再想一想'){
    $('quest-action-dialog').classList.toggle('campfire-item-dialog',art.includes('campfire-full-preview'));
    $('quest-action-dialog').classList.toggle('citadel-item-dialog',art.includes('citadel-full-preview'));
    $('quest-action-dialog').classList.toggle('island-item-dialog',art.includes('island-full-preview'));
    $('quest-action-dialog').classList.toggle('interface-item-dialog',art.includes('interface-full-preview'));
    $('quest-action-dialog').classList.toggle('progress-bar-item-dialog',art.includes('progress-bar-full-preview'));
    $('quest-action-title').textContent=title;$('quest-action-eyebrow').textContent=eyebrow;
    $('quest-action-art').innerHTML=art;$('quest-action-body').innerHTML=body;
    window.FocusProgressBars?.decorate($('quest-action-dialog'));
    $('quest-action-error').hidden=true;$('quest-action-confirm').textContent=label;
    $('quest-action-confirm').hidden=!label;$('quest-action-confirm').disabled=busy;
    $('quest-action-cancel').textContent=cancel;
    if(!$('quest-action-dialog').open)$('quest-action-dialog').showModal();
  }
  function openQuest(action,subject){
    if(busy)return;
    const q=data?.quests.find(q=>q.subject===subject);
    if(!q||actionFor(q).action!==action)return;
    if(q.continuous){
      intent={action,subject,...(action==='submit'?{requestId:window.crypto.randomUUID()}:{})};
      const period=mentorPeriod(q),m=mentors[period];
      const round=q.bonus,bonusTickets=ticketReward(round?.lotteryTickets);
      const roundHint=round?.enabled?`<p class="q-accept-bonus">${roundName(round.period)}：${esc(round.windowLabel)} 内，接取后累计 ${n(round.target)} 分钟，额外获得 ${esc(rewardText(round.reward))}。每天每科一次，达成后可以晚些再领取。</p>${bonusTickets!==null?`<p class="q-fineprint">当日每科首轮领取另赠 1 张金币抽奖券；同一学习日的${period==='morning'?'数学、政治':'408、英语'}首轮都领取，再赠 1 张钻石抽奖券。首轮赠券与普通委托轮次赠券分别计算。</p>`:''}`:'';
      const bonusTicketHint=round?.enabled&&bonusTickets?`<p class="q-claim-bonus">本次首轮另得 <strong>${esc(bonusTickets)}</strong>，交付时一起收好。历史首轮按本次实际可领数量结算。</p>`:'';
      const pendingDays=bonusDays(round?.pending);
      const roundTicketText=roundTicketReward(q.roundTickets),ticketSummary=roundTicketSummary();
      const ticketHint=q.roundTickets?`<p class="q-fineprint">${action==='submit'&&roundTicketText?`本次普通委托另得 <strong>${esc(roundTicketText)}</strong>。`:`每交付完整 ${n(q.target)} 分钟，得 1 张金币抽奖券。`}四科合计每交付 3 轮，再得 1 张钻石抽奖券；轮次与零头跨天、重启保留，旧完整轮次不补发。${ticketSummary?`<br>${esc(ticketSummary)}`:''}</p>`:'';
      const body=action==='accept'?`<p>接下 ${esc(m.name)} 的持续委托，首次完成 <strong>${n(q.target)} 分钟${esc(subjectNames[q.subject])}</strong>，就能交付收获。</p><div class="q-action-reward">${money(q.baseReward.coins,q.baseReward.diamonds)}<small>首次达标基础奖励 · 之后继续累计</small></div><p>从接取这一刻开始计入，基础奖励始终相同，跨天保留进度。听课、做题均可，四科可同时接取。</p>${roundHint}<p class="q-fineprint">首次达标后，有新增基础奖励或已达成的首轮加赠即可交付。每有效分钟 2 金币，每满 ${n(q.target)} 分钟 2 钻石，零头跨次保留。</p>${ticketHint}`:`<p>${q.minutes>0?`本次待交付 <strong>${n(q.minutes)} 分钟${esc(subjectNames[q.subject])}</strong>。`:'这次带回已达成的首轮加赠，之前的基础奖励已经结算。'}</p><div class="q-action-reward">${money(q.reward.coins,q.reward.diamonds)}<small>本次预计总收获</small>${q.rewardBreakdown?rewardBreakdown(q.rewardBreakdown.base,q.rewardBreakdown.bonus):''}</div>${bonusTicketHint}${ticketHint}${pendingDays?`<p class="q-claim-bonus">首轮归属 ${pendingDays}，本次一起领取。奖励按学习发生的时段判断，与这次交付时间无关。</p>`:''}<p>交付后，这项委托继续有效，后续学习会持续计入；未满的金币与钻石进度保留。</p><p class="q-fineprint">按已同步的有效记录结算。手机稍后同步的记录仍可补入，已达成的首轮也能在下一次交付领取。</p>`;
      dialog(action==='accept'?`接取${q.name}委托`:'把这份收获带回营地',action==='accept'?'YOUR OWN PACE':'READY TO TURN IN',avatar(period),body,action==='accept'?'接下委托':'交付并继续',action==='accept'?'先看看':'稍后交付');
      return;
    }
    intent={action,subject};
    const m=mentors[q.period],body=action==='accept'?`<p>接下 ${esc(m.name)} 的委托，完成 <strong>${n(q.target)} 分钟${esc(subjectNames[q.subject])}</strong>。</p><div class="q-action-reward">${money(q.baseReward.coins,q.baseReward.diamonds)}<small>达标基础奖励 · 超额学习继续累积奖励</small></div><p>从接取这一刻开始累计。学习截止 <b>${clock(q.deadline)}</b>，请在 <b>${clock(q.submitDeadline)}</b> 前回来交付。</p>`:`<p>本次已计入 <strong>${n(q.minutes)} 分钟${esc(subjectNames[q.subject])}</strong>，达到目标的 <strong>${n(Math.floor(q.minutes/q.target*10)/10)} 倍</strong>。</p><div class="q-action-reward">${money(q.reward.coins,q.reward.diamonds)}<small>本次预计收获</small></div><p>确认后本项委托结算，后续学习不再追加本次奖励。${new Date(data.now)<new Date(q.deadline)?`若还有余力，可继续学习后再提交。`:''}</p><p class="q-fineprint">最晚 ${clock(q.submitDeadline)} 交付，以提交时已同步的有效记录结算。</p>`;
    dialog(action==='accept'?`接取${q.name}委托`:'把这份收获带回营地',action==='accept'?'A NEW CHAPTER':'READY TO TURN IN',avatar(q.period),body,action==='accept'?'接下委托':'确认交付',action==='accept'?'先看看':'暂不交付');
  }
  function campPreview(item){
    const equipped=window.FocusCampfireShopArt?.normalize({...data.equipped,[item.slot]:item.id})||{};
    return `<div class="campfire-full-preview" data-chatframe="${esc(equipped.chatframe||'chatframe-default')}"><div class="campfire-preview-scene">${window.FocusCampWorldArt?.scene(equipped,{interactive:false})||window.FocusCampfireShopArt?.scene(equipped)||''}</div><div class="campfire-preview-line"><span>阿榆 · 守火人</span><p>水快热了，坐一会儿吧。今晚的故事，可以慢慢说。</p></div></div>`;
  }
  function itemPreview(item){
    if(item.slot==='bar'&&window.FocusProgressBars?.has(item.id))return window.FocusProgressBars.fullPreview(item.id);
    if(item.slot==='interface'&&window.FocusInterfaceThemes)return window.FocusInterfaceThemes.fullPreview(item.id,data.equipped,window.ShopArt);
    if(campSlots.has(item.slot))return campPreview(item);
    if(item.slot==='island'&&window.ShopArt?.islandPreview)return `<div class="island-full-preview">${window.ShopArt.islandPreview(item.id,data.equipped)}<p>首页主岛整套布置 · 替换当前布置，保留其余装备与篝火入口</p></div>`;
    if(citadelSlots.has(item.slot)){
      const scene=window.FocusCitadel?.preview?.(item.id,{...data.equipped});
      if(typeof scene==='string'&&scene)return scene;
    }
    return swatch(item);
  }
  function browseCamp(){
    if(!data)return;
    area='camp';market='coins';filter='all';renderShop();
  }
  function browseCollection(slot){
    if(!data)return;
    market='owned';area='all';filter=Object.hasOwn(names,slot)?slot:'all';renderShop();
    $('shop-catalog').scrollIntoView({behavior:'auto',block:'start'});
  }
  function openItem(action,id){
    if(busy)return;
    const item=data?.catalog.find(item=>item.id===id);if(!item)return;
    if(item.slot==='interface'&&!window.FocusInterfaceThemes?.has(item.id))return;
    if(action==='equip'){perform({action,id});return;}
    if(action==='buy'&&(item.lotteryOnly||item.owned||data.wallet.coins<item.coins||data.wallet.diamonds<item.diamonds))return;
    intent=action==='buy'?{action,id}:null;
    const placement=item.slot==='island'?'<p>一套布置包含配套的前景与建筑；装备时整套替换，多套收藏不会自动叠加。素岛原貌随时可免费恢复。</p>':'';
    dialog(item.name,action==='buy'?'ADD TO YOUR COLLECTION':item.slot==='interface'?'A DIFFERENT ATMOSPHERE':campSlots.has(item.slot)?'BY YOUR CAMPFIRE':citadelSlots.has(item.slot)?'IN YOUR STARLIGHT CITADEL':'WARDROBE PREVIEW',itemPreview(item),`<p>${esc(item.description)}</p>${placement}<div class="q-action-reward">${price(item)}</div><p>${action==='buy'?`购买后永久拥有。购买后可从商店装备，${esc(names[item.slot])}一次使用一款。`:'外观预览，不花费货币，不改变当前装备。'}</p>${action==='buy'?`<p class="q-fineprint">购买后余额：${n(data.wallet.coins-item.coins)} 金币 · ${n(data.wallet.diamonds-item.diamonds)} 钻石</p>`:''}`,action==='buy'?'确认购买':null,'返回商店');
  }
  async function perform(job){
    if(busy||!job)return;
    const item=data.catalog.find(item=>item.id===job.id),previousItem=item&&data.equipped[item.slot];
    busy=true;$('quest-action-confirm').disabled=true;render(data);
    try{
      const paths={accept:'/api/quests/accept',submit:'/api/quests/submit',buy:'/api/shop/buy',equip:'/api/shop/equip',exchange:'/api/shop/exchange',reverseExchange:'/api/shop/exchange-coins'};
      const body=job.action==='exchange'?{diamonds:job.diamonds,requestId:job.requestId}:job.action==='reverseExchange'?{requestId:job.requestId}:job.subject?{subject:job.subject,...(job.requestId?{requestId:job.requestId}:{})}:{itemId:job.id};
      const result=await bridge.api(paths[job.action],body);
      render(result);
      if(job.action==='submit'&&result.receipt&&!result.receipt.alreadyClaimed)bridge.playSound?.('delivery',{key:`delivery:${result.receipt.requestId}`});
      if(job.action==='buy'&&result.receipt&&!result.receipt.alreadyOwned)bridge.playSound?.('purchase',{key:`purchase:${result.receipt.itemId}`});
      if(['exchange','reverseExchange'].includes(job.action)&&result.receipt&&!result.receipt.alreadyExchanged)bridge.playSound?.('purchase',{key:`exchange:${result.receipt.requestId}`});
      if(job.action==='equip'&&item&&previousItem!==item.id&&result.equipped?.[item.slot]===item.id)bridge.playSound?.('equip');
      if(intent===job){intent=null;$('quest-action-dialog').close();}
      if(job.action==='submit'){
        const reward=result.receipt||result.quests.find(q=>q.subject===job.subject).reward;
        const extra=reward.bonusReward,split=Number(extra?.coins)>0||Number(extra?.diamonds)>0?`；基础 ${rewardText(reward.baseReward)}，首轮加赠 ${rewardText(extra)}`:'';
        const roundReward=roundTicketReward(reward.roundTickets),roundSummary=roundTicketSummary();
        const roundReceipt=roundReward?reward.alreadyClaimed?`；该次已收好 ${roundReward}`:`；本次完整交付 ${n(reward.roundTickets.rounds)} 轮`:'';
        bridge.toast(reward.alreadyClaimed?'这次交付已确认':'委托交付 · 收获已入袋',`+${n(reward.coins)} 金币 · +${n(reward.diamonds)} 钻石${split}${window.FocusLottery?.ticketText?.(result.ticketGrants)||''}${roundReceipt}${roundSummary?`；${roundSummary}`:''}`);
      }else if(job.action==='exchange')bridge.toast(result.receipt?.alreadyExchanged?'兑换已确认':'星光已入袋',`+${n(job.diamonds)} 钻石 · ${n(result.receipt?.coins||job.diamonds*(result.exchange?.coinsPerDiamond||75))} 金币已兑换`);
      else if(job.action==='reverseExchange')bridge.toast(result.receipt?.alreadyExchanged?'兑换已确认':'旅途盘缠已入袋',`+${n(result.receipt?.coins||result.exchange?.coinsPerDiamond||75)} 金币 · 使用 1 钻石，今日还可兑换 ${n(result.exchange?.reverse?.remaining)} 次`);
      else bridge.toast({accept:'委托已接取',buy:'新收藏已入库',equip:'装扮已更新'}[job.action],{accept:'从现在开始，完成对应科目的专注即可推进。',buy:'在商店点击「装备」，把收藏放进你的远征。',equip:item?.slot==='interface'?'整间书房已换上新气质，原有装饰与特效继续保留。':'已应用到你的星岛与营地。'}[job.action]);
      await bridge.refresh(true);
    }catch(error){
      if($('quest-action-dialog').open){$('quest-action-error').textContent=error.message;$('quest-action-error').hidden=false;}
      else bridge.toast('暂未完成操作',error.message,true);
      await bridge.refresh(true);
    }finally{busy=false;$('quest-action-confirm').disabled=false;render(data);}
  }
  function init(callbacks){
    if(bridge)return;bridge=callbacks;
    $('quest-board').addEventListener('click',event=>{const b=event.target.closest('[data-quest-action]');if(b)openQuest(b.dataset.questAction,b.dataset.subject);});
    $('shop-catalog').addEventListener('click',event=>{const b=event.target.closest('[data-shop-action]');if(b)openItem(b.dataset.shopAction,b.dataset.item);});
    document.querySelectorAll('[data-shop-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.shopFilter;render(data);}));
    document.querySelectorAll('[data-shop-area]').forEach(button=>button.addEventListener('click',()=>{area=button.dataset.shopArea;filter='all';render(data);}));
    document.querySelectorAll('[data-shop-market]').forEach(button=>button.addEventListener('click',()=>{market=button.dataset.shopMarket;filter='all';render(data);}));
    $('equipped-slots').addEventListener('click',event=>{const b=event.target.closest('[data-loadout-slot]');if(b){market='owned';filter=b.dataset.loadoutSlot;area=filter==='interface'?'interface':campSlots.has(filter)?'camp':'journey';render(data);$('shop-catalog').scrollIntoView({behavior:'auto',block:'start'});}});
    $('exchange-amount').addEventListener('input',()=>{if(data)renderExchange();});
    $('exchange-open').addEventListener('click',openExchange);
    $('exchange-reverse-open').addEventListener('click',openReverseExchange);
    $('quest-action-confirm').addEventListener('click',()=>perform(intent));
    $('quest-action-dialog').addEventListener('close',()=>{intent=null;});
  }
  return {init,render,actionFor,taskMarkup,itemMarkup,browseCamp,browseCollection};
});
