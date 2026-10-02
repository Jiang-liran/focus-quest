(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusQuests=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const names={bar:'进度条',fx:'星岛特效',npc:'NPC 时装',avatar:'我的时装',banner:'旅人铭牌',theme:'星岛环境',companion:'随行伙伴',relic:'星岛圣物',portal:'远征之门',camp:'营地风景',fire:'篝火样式',tent:'营地帐篷',campgear:'火边陈设',campglow:'营地氛围',chatframe:'对话外观'};
  const campSlots=new Set(['camp','fire','tent','campgear','campglow','chatframe']);
  const subjectNames={math:'数学',politics:'政治',cs:'408',english:'英语'};
  const statuses={locked:'尚未发布',available:'可以接取',active:'进行中',ready:'可以交付',expired:'今日已结束',claimed:'已交付'};
  const mentors={morning:{name:'司晨',title:'晨间导师',quote:'「先以数学磨砺思路，再用政治梳理脉络。把上午交给扎实的理解。」',hours:'00:00 — 12:00',grace:'12:30',subjects:'数学 · 政治'},afternoon:{name:'逐光',title:'午后领航员',quote:'「让知识连成网络，让语言打开远方。午后的航程，由你来选择。」',hours:'12:00 — 18:00',grace:'18:30',subjects:'408 · 英语'}};
  let data=null,bridge=null,filter='all',market='coins',area='all',busy=false,intent=null,lastStamp=-Infinity;
  const markupCache=new Map();
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=value=>Number(value||0).toLocaleString('zh-CN',{maximumFractionDigits:1});
  const clock=value=>new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
  const shortDay=value=>new Date(value+'T12:00:00').toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'});
  const money=(coins,diamonds)=>`<span class="q-money"><span class="coin-mark">●</span> ${n(coins)} <small>金币</small><span class="diamond-mark">◆</span> ${n(diamonds)} <small>钻石</small></span>`;
  const currency=item=>item.currency||(item.diamonds?'diamonds':item.coins?'coins':'free');
  const price=item=>currency(item)==='free'?'<span class="shop-free">初始收藏 · 免费</span>':`<span class="shop-single-price ${currency(item)}"><i class="${currency(item)==='coins'?'coin':'diamond'}-mark">${currency(item)==='coins'?'●':'◆'}</i> ${n(item[currency(item)])} <small>${currency(item)==='coins'?'金币':'钻石'}</small></span>`;
  const avatar=(role,outfit)=>window.QuestArt?.avatar(role,outfit)||'';
  const mentorPeriod=q=>q.recommended?.period||q.period;
  function replace(id,html){
    const el=$(id);
    // Browsers normalize SVG and boolean attributes in innerHTML. Compare the
    // original markup, so polling preserves focus and ongoing shop animations.
    if(el&&markupCache.get(id)!==html){el.innerHTML=html;markupCache.set(id,html);}
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
    const note=q.status==='available'?'接取后开始累计，四科可同时接取。听课、做题均计入。':q.status==='ready'?'交付后继续累计；未满的金币与钻石进度会保留。':first?'先完成首次目标，再交付收获。跨天保留进度，按自己的节奏完成。':'首次目标已完成，新增专注继续产生奖励，有新收获就能再次交付。';
    return `<article class="q-task continuous ${esc(q.status)}" data-subject="${esc(q.subject)}"><div class="q-task-heading"><h3>${esc(q.name)}</h3><span class="q-status">${esc(statuses[q.status]||'待同步')}</span></div><p class="q-progress-caption">${first?'首次目标与钻石进度':'下一份钻石进度'} · 每满 ${n(q.target)} 分钟得 2 钻石</p><div class="q-numbers"><strong>${n(progress)}<small>分钟</small></strong><span>/ ${n(q.target)} 分钟</span><b>${n(shownPercent)}%</b></div><div class="q-progress" role="progressbar" aria-label="${esc(q.name)}钻石进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,shownPercent)}" aria-valuetext="${n(shownPercent)}%"><i style="width:${Math.min(100,shownPercent)}%"></i></div><div class="q-study-account"><span>待交付专注 <b>${n(q.minutes)} 分钟</b></span><span>已交付专注 <b>${n(q.settledMinutes)} 分钟</b></span></div><div class="q-reward"><small>${rewardLabel}</small>${money(advertised?.coins||0,advertised?.diamonds||0)}</div><p class="q-task-note">${note}</p><button class="${action.action==='submit'?'primary-button':'secondary-button'} q-task-button" ${action.action?`data-quest-action="${action.action}" data-subject="${esc(q.subject)}"`:''} ${!action.action||disabled?'disabled':''}>${esc(action.label)}</button></article>`;
  }
  function taskMarkup(q,disabled=false){
    if(q.continuous)return continuousTaskMarkup(q,disabled);
    const action=actionFor(q),complete=q.status==='claimed',shownPercent=Math.floor(Math.max(0,Number(q.minutes)/Number(q.target)||0)*1000)/10;
    const reward=q.reward||{coins:0,diamonds:0},base=q.baseReward||{coins:q.target*2,diamonds:2};
    const gain=q.minutes>=q.target?`已积累 ${n(Math.floor(q.minutes/q.target*10)/10)} 倍目标时长`:'达标基础奖励';
    let note=complete?`已于 ${clock(q.submittedAt)} 交付 · 本次奖励已结算`:q.status==='available'?'接取后开始累计，听课与做题均可。':q.status==='locked'?'午间发布，现在先走好上午的路。':q.status==='expired'?'明天会有新的委托，已有学习与经验照常保留。':`学习截止 ${clock(q.deadline)} · 最晚 ${clock(q.submitDeadline)} 交付`;
    if(q.status==='ready')note+=new Date(data?.now||0)>=new Date(q.deadline)?'。已停止累计，请及时交付。':'。可以继续积累，交付后不再追加。';
    const advertised=q.minutes>=q.target||complete?reward:base;
    return `<article class="q-task ${esc(q.status)}" data-subject="${esc(q.subject)}"><div class="q-task-heading"><h3>${esc(q.name)}</h3><span class="q-status">${esc(statuses[q.status]||'待同步')}</span></div><div class="q-numbers"><strong>${n(q.minutes)}<small>分钟</small></strong><span>/ ${n(q.target)} 分钟</span><b>${n(shownPercent)}%</b></div><div class="q-progress" role="progressbar" aria-label="${esc(q.name)}委托进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,shownPercent)}" aria-valuetext="${n(shownPercent)}%"><i style="width:${Math.min(100,shownPercent)}%"></i></div><div class="q-reward"><small>${esc(complete?'本次收获':q.status==='expired'?'未领取 · 本次已过期':gain)}</small>${money(advertised.coins,advertised.diamonds)}</div><p class="q-task-note">${esc(note)}</p><button class="${action.action==='submit'?'primary-button':'secondary-button'} q-task-button" ${action.action?`data-quest-action="${action.action}" data-subject="${esc(q.subject)}"`:''} ${!action.action||disabled?'disabled':''}>${esc(action.label)}</button></article>`;
  }
  function swatch(item){
    if(campSlots.has(item.slot))return `<div class="cosmetic-swatch campfire-swatch" data-item="${esc(item.id)}">${window.FocusCampfireShopArt?.preview(item.id,data?.equipped)||''}</div>`;
    if(item.slot==='npc'||item.slot==='avatar')return `<div class="cosmetic-swatch outfit-swatch" data-item="${esc(item.id)}">${avatar(item.slot==='npc'?'guide':'player',item.id)}</div>`;
    const art=window.ShopArt?.preview(item.id)||'';
    return `<div class="cosmetic-swatch ${art?'shop-art-swatch':''}" data-item="${esc(item.id)}">${art}</div>`;
  }
  function itemMarkup(item,wallet,disabled=false){
    const affordable=wallet.coins>=item.coins&&wallet.diamonds>=item.diamonds;
    const label=item.equipped?'使用中':item.owned?'装备':affordable?'购买':'余额不足';
    return `<article class="shop-item ${item.equipped?'equipped':''}" data-currency="${esc(currency(item))}"><div class="shop-item-visual">${swatch(item)}<span class="shop-item-type">${esc(names[item.slot])}</span>${item.owned?`<span class="shop-owned">${item.equipped?'✦ 使用中':'已收藏'}</span>`:''}</div><div class="shop-item-info"><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><div class="shop-price">${price(item)}</div><div class="shop-item-actions"><button class="text-button" data-shop-action="preview" data-item="${esc(item.id)}">${item.slot==='npc'||item.slot==='avatar'?'试穿':'预览'}</button><button class="secondary-button" data-shop-action="${item.owned?'equip':'buy'}" data-item="${esc(item.id)}" ${disabled||item.equipped||!item.owned&&!affordable?'disabled':''}>${label}</button></div></div></article>`;
  }
  function render(next){
    if(!next||!bridge)return;
    // Preserve the service's microseconds when a poll races a purchase response.
    const fraction=String(next.now).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);
    const stamp=Date.parse(next.now)*1000+Number((fraction?.[1]||'').padEnd(6,'0').slice(3,6));
    if(Number.isFinite(stamp)&&stamp<lastStamp)return;
    if(Number.isFinite(stamp))lastStamp=stamp;
    data=next;
    for(const [slot,id] of Object.entries(data.equipped||{}))document.documentElement.dataset[slot]=id;
    window.ShopArt?.apply(data.equipped||{});
    window.FocusCampfire?.applyEquipment(data.equipped||{},data.now);
    for(const prefix of ['wallet-side','quest','shop']){
      $(prefix+'-coins').textContent=n(data.wallet.coins);$(prefix+'-diamonds').textContent=n(data.wallet.diamonds);
    }
    const continuous=data.quests.some(q=>q.continuous);
    $('quest-today-label').textContent=shortDay(data.day)+(continuous?' · 全天自由委托':' · 今日委托');
    const ready=data.quests.filter(q=>q.status==='ready').length,active=data.quests.filter(q=>q.status==='active').length,available=data.quests.filter(q=>q.status==='available').length;
    $('quest-invitation-text').textContent=ready?`${ready} 项委托已达标，记得在期限内交付领奖。`:active?`${active} 项委托进行中，额外投入也会计入奖励。`:available?`${available} 项委托可以接取，去和营地伙伴聊聊。`:'今日委托已收起，明天再来开启新的旅程。';
    if(continuous)$('quest-invitation-text').textContent=ready?`${ready} 项委托有收获可交付，交付后继续累计。`:active?`${active} 项委托持续进行中，跨天保留进度，全天同等奖励。`:'四科委托随时可接，选好科目，再按自己的计划出发。';
    replace('quest-board',Object.entries(mentors).map(([period,m])=>{
      const tasks=data.quests.filter(q=>mentorPeriod(q)===period),recommended=tasks.some(q=>q.recommended?.active);
      const quote=continuous?(period==='morning'?'「思路有它自己的节奏。想推演或思辨时，我一直在这里。」':'「带着问题出发，循着理解前行。每个时刻，都能写下新的进展。」'):m.quote;
      const schedule=continuous?`<span><i></i>全天可接 · 跨天有效</span><span class="${recommended?'q-recommended':''}">${recommended?'此刻推荐':'常练时段：'+(period==='morning'?'上午':'下午')} · 奖励全天相同</span>`:`<span><i></i>${m.hours} 学习窗口</span><span>${m.grace} 交付截止</span>`;
      return `<section class="q-mentor ${period}"><header class="q-mentor-header"><div class="q-portrait">${avatar(period,data.equipped.npc)}</div><div><span class="q-mentor-role">${esc(m.title)} · ${m.subjects}</span><h2>${m.name}<small>${continuous?'按你的节奏，随时启程':period==='morning'?'守住晨光里的秩序':'沿着午后的光前行'}</small></h2><p>${quote}</p></div></header><div class="q-schedule">${schedule}</div><div class="q-task-grid">${tasks.map(q=>taskMarkup(q,busy)).join('')}</div></section>`;
    }).join(''));
    replace('shop-keeper',avatar('shop',data.equipped.npc));
    replace('player-outfit',avatar('player',data.equipped.avatar));
    const paid=data.catalog.filter(i=>currency(i)!=='free'),owned=paid.filter(i=>i.owned);
    $('equipped-summary').textContent=`已收藏 ${owned.length} / ${paid.length} 件 · ${data.catalog.find(i=>i.id===data.equipped.avatar)?.name||'初始装扮'}`;
    replace('equipped-slots',Object.entries(names).map(([slot,label])=>`<button data-loadout-slot="${slot}"><span>${label}</span><strong>${esc(data.catalog.find(i=>i.id===data.equipped[slot])?.name||'初始装扮')}</strong><i>↗</i></button>`).join(''));
    renderShop();
    renderExchange();
    replace('quest-history',data.history.length?data.history.map(row=>`<div class="q-history-row"><span><strong>${esc(row.name)}</strong><small>${esc(row.day)} · ${clock(row.submittedAt)} 交付</small></span><span>${n(row.minutes)} 分钟</span>${money(row.coins,row.diamonds)}</div>`).join(''):'<div class="q-empty"><span>✧</span><p>第一份委托，等你亲手交付。</p><small>完成后，金币、钻石和这次努力会一起记在这里。</small></div>');
  }
  function renderShop(){
    const inArea=i=>area==='all'||(area==='camp')===campSlots.has(i.slot);
    const marketItems=data.catalog.filter(i=>inArea(i)&&(market==='owned'?i.owned:currency(i)===market));
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
    for(const m of ['coins','diamonds','owned'])$('market-'+m+'-count').textContent=n(data.catalog.filter(i=>inArea(i)&&(m==='owned'?i.owned:currency(i)===m)).length);
    $('shop-market-description').textContent={coins:'从一抹新绿到一身新装，把今天的努力变成小小的庆祝。',diamonds:'收集更辽阔的风景，遇见新的旅伴。这里的每件收藏，只需钻石。',owned:'这里存放你已拥有的全部外观，也可以随时换回最初的模样。'}[market];
    if(area==='camp')$('shop-market-description').textContent=market==='owned'?'已拥有的营地布置，六个位置可以独立搭配，初始款随时可换回。':market==='coins'?'先添一张茶桌，再挑一顶帐篷。小小的金币收藏，让篝火旁更像自己的营地。':'湖畔、雪岭与极光，还有特别的星火。每件收藏只需钻石，购买后永久拥有。';
    const items=marketItems.filter(i=>filter==='all'||i.slot===filter);
    $('shop-result-count').textContent=`${items.length} 件${market==='owned'?'收藏':'商品'}`;
    replace('shop-catalog',items.length?items.map(item=>itemMarkup(item,data.wallet,busy)).join(''):'<div class="shop-empty">星织正在整理货架，请换个分类看看。</div>');
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
    replace('exchange-history',(data.exchange?.history||[]).length?data.exchange.history.map(row=>`<div><time>${esc(new Date(row.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}))}</time><span>−${n(row.coins)} 金币</span><strong>+${n(row.diamonds)} 钻石</strong></div>`).join(''):'<p>还没有兑换记录。每一次兑换都会记在这里。</p>');
  }
  function openExchange(){
    if(busy||!data)return;
    const amount=exchangeAmount(),rate=data.exchange?.coinsPerDiamond||75;
    if(!amount||amount*rate>data.wallet.coins)return;
    intent={action:'exchange',diamonds:amount,requestId:window.crypto.randomUUID()};
    dialog('把积累，凝成星光','THE STAR EXCHANGE','<div class="exchange-art"><span>●</span><i>→</i><b>◆</b></div>',`<p>将 <strong>${n(amount*rate)} 金币</strong>兑换为 <strong>${n(amount)} 颗钻石</strong>。</p><div class="q-action-reward">${price({currency:'diamonds',diamonds:amount})}<small>兑换所得，立即入袋</small></div><p>兑换比例：${n(rate)} 金币 = 1 钻石。</p><p class="q-fineprint">兑换后余额：${n(data.wallet.coins-amount*rate)} 金币 · ${n(data.wallet.diamonds+amount)} 钻石</p>`,'确认兑换','再攒一攒');
  }
  function dialog(title,eyebrow,art,body,label,cancel='再想一想'){
    $('quest-action-dialog').classList.toggle('campfire-item-dialog',art.includes('campfire-full-preview'));
    $('quest-action-title').textContent=title;$('quest-action-eyebrow').textContent=eyebrow;
    $('quest-action-art').innerHTML=art;$('quest-action-body').innerHTML=body;
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
      const body=action==='accept'?`<p>接下 ${esc(m.name)} 的持续委托，首次完成 <strong>${n(q.target)} 分钟${esc(subjectNames[q.subject])}</strong>，就能交付收获。</p><div class="q-action-reward">${money(q.baseReward.coins,q.baseReward.diamonds)}<small>首次达标基础奖励 · 之后继续累计</small></div><p>从接取这一刻开始计入，全天同等奖励，跨天保留进度。听课、做题均可，四科可同时接取。</p><p class="q-fineprint">首次达标后，有新增金币即可再次交付。每有效分钟 2 金币，每满 ${n(q.target)} 分钟 2 钻石，零头跨次保留。</p>`:`<p>本次待交付 <strong>${n(q.minutes)} 分钟${esc(subjectNames[q.subject])}</strong>。</p><div class="q-action-reward">${money(q.reward.coins,q.reward.diamonds)}<small>本次预计收获</small></div><p>交付后，这项委托继续有效，后续学习会持续计入；未满的金币与钻石进度保留。</p><p class="q-fineprint">按提交时已同步的有效记录结算。手机稍后同步的记录仍可在下次交付，不会因这次提交而漏掉。</p>`;
      dialog(action==='accept'?`接取${q.name}委托`:'把这份收获带回营地',action==='accept'?'YOUR OWN PACE':'READY TO TURN IN',avatar(period,data.equipped.npc),body,action==='accept'?'接下委托':'交付并继续',action==='accept'?'先看看':'稍后交付');
      return;
    }
    intent={action,subject};
    const m=mentors[q.period],body=action==='accept'?`<p>接下 ${esc(m.name)} 的委托，完成 <strong>${n(q.target)} 分钟${esc(subjectNames[q.subject])}</strong>。</p><div class="q-action-reward">${money(q.baseReward.coins,q.baseReward.diamonds)}<small>达标基础奖励 · 超额学习继续累积奖励</small></div><p>从接取这一刻开始累计。学习截止 <b>${clock(q.deadline)}</b>，请在 <b>${clock(q.submitDeadline)}</b> 前回来交付。</p>`:`<p>本次已计入 <strong>${n(q.minutes)} 分钟${esc(subjectNames[q.subject])}</strong>，达到目标的 <strong>${n(Math.floor(q.minutes/q.target*10)/10)} 倍</strong>。</p><div class="q-action-reward">${money(q.reward.coins,q.reward.diamonds)}<small>本次预计收获</small></div><p>确认后本项委托结算，后续学习不再追加本次奖励。${new Date(data.now)<new Date(q.deadline)?`若还有余力，可继续学习后再提交。`:''}</p><p class="q-fineprint">最晚 ${clock(q.submitDeadline)} 交付，以提交时已同步的有效记录结算。</p>`;
    dialog(action==='accept'?`接取${q.name}委托`:'把这份收获带回营地',action==='accept'?'A NEW CHAPTER':'READY TO TURN IN',avatar(q.period,data.equipped.npc),body,action==='accept'?'接下委托':'确认交付',action==='accept'?'先看看':'暂不交付');
  }
  function campPreview(item){
    const equipped=window.FocusCampfireShopArt?.normalize({...data.equipped,[item.slot]:item.id})||{};
    return `<div class="campfire-full-preview" data-chatframe="${esc(equipped.chatframe||'chatframe-default')}"><div class="campfire-preview-scene">${window.FocusCampfireShopArt?.scene(equipped)||''}</div><div class="campfire-preview-line"><span>阿榆 · 守火人</span><p>水快热了，坐一会儿吧。今晚的故事，可以慢慢说。</p></div></div>`;
  }
  function browseCamp(){
    if(!data)return;
    area='camp';market='coins';filter='all';renderShop();
  }
  function openItem(action,id){
    if(busy)return;
    const item=data?.catalog.find(item=>item.id===id);if(!item)return;
    if(action==='equip'){perform({action,id});return;}
    if(action==='buy'&&(item.owned||data.wallet.coins<item.coins||data.wallet.diamonds<item.diamonds))return;
    intent=action==='buy'?{action,id}:null;
    dialog(item.name,action==='buy'?'ADD TO YOUR COLLECTION':campSlots.has(item.slot)?'BY YOUR CAMPFIRE':'WARDROBE PREVIEW',campSlots.has(item.slot)?campPreview(item):swatch(item),`<p>${esc(item.description)}</p><div class="q-action-reward">${price(item)}</div><p>${action==='buy'?`购买后永久拥有。购买后可从商店装备，${esc(names[item.slot])}一次使用一款。`:'外观预览，不花费货币，不改变当前装备。'}</p>${action==='buy'?`<p class="q-fineprint">购买后余额：${n(data.wallet.coins-item.coins)} 金币 · ${n(data.wallet.diamonds-item.diamonds)} 钻石</p>`:''}`,action==='buy'?'确认购买':null,'返回商店');
  }
  async function perform(job){
    if(busy||!job)return;
    busy=true;$('quest-action-confirm').disabled=true;render(data);
    try{
      const paths={accept:'/api/quests/accept',submit:'/api/quests/submit',buy:'/api/shop/buy',equip:'/api/shop/equip',exchange:'/api/shop/exchange'};
      const body=job.action==='exchange'?{diamonds:job.diamonds,requestId:job.requestId}:job.subject?{subject:job.subject,...(job.requestId?{requestId:job.requestId}:{})}:{itemId:job.id};
      const result=await bridge.api(paths[job.action],body);
      render(result);
      if(intent===job){intent=null;$('quest-action-dialog').close();}
      if(job.action==='submit'){
        const reward=result.receipt||result.quests.find(q=>q.subject===job.subject).reward;
        bridge.toast(reward.alreadyClaimed?'这次交付已确认':'委托交付 · 收获已入袋',`+${n(reward.coins)} 金币 · +${n(reward.diamonds)} 钻石`);
      }else if(job.action==='exchange')bridge.toast(result.receipt?.alreadyExchanged?'兑换已确认':'星光已入袋',`+${n(job.diamonds)} 钻石 · ${n(result.receipt?.coins||job.diamonds*(result.exchange?.coinsPerDiamond||75))} 金币已兑换`);
      else bridge.toast({accept:'委托已接取',buy:'新收藏已入库',equip:'装扮已更新'}[job.action],{accept:'从现在开始，完成对应科目的专注即可推进。',buy:'在商店点击「装备」，把收藏放进你的远征。',equip:'已应用到你的星岛与营地。'}[job.action]);
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
    $('equipped-slots').addEventListener('click',event=>{const b=event.target.closest('[data-loadout-slot]');if(b){market='owned';filter=b.dataset.loadoutSlot;area=campSlots.has(filter)?'camp':'journey';render(data);$('shop-catalog').scrollIntoView({behavior:'auto',block:'start'});}});
    $('exchange-amount').addEventListener('input',()=>{if(data)renderExchange();});
    $('exchange-open').addEventListener('click',openExchange);
    $('quest-action-confirm').addEventListener('click',()=>perform(intent));
    $('quest-action-dialog').addEventListener('close',()=>{intent=null;});
  }
  return {init,render,actionFor,taskMarkup,itemMarkup,browseCamp};
});
