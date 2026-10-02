(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusQuests=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const names={bar:'进度条',fx:'星岛特效',npc:'NPC 时装',avatar:'我的时装'};
  const subjectNames={math:'数学',politics:'政治',cs:'408',english:'英语'};
  const statuses={locked:'尚未发布',available:'可以接取',active:'进行中',ready:'可以交付',expired:'今日已结束',claimed:'已交付'};
  const mentors={morning:{name:'司晨',title:'晨间导师',quote:'「先以数学磨砺思路，再用政治梳理脉络。把上午交给扎实的理解。」',hours:'00:00 — 12:00',grace:'12:30',subjects:'数学 · 政治'},afternoon:{name:'逐光',title:'午后领航员',quote:'「让知识连成网络，让语言打开远方。午后的航程，由你来选择。」',hours:'12:00 — 18:00',grace:'18:30',subjects:'408 · 英语'}};
  let data=null,bridge=null,filter='all',busy=false,intent=null,lastStamp=-Infinity;
  const markupCache=new Map();
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=value=>Number(value||0).toLocaleString('zh-CN',{maximumFractionDigits:1});
  const clock=value=>new Date(value).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
  const shortDay=value=>new Date(value+'T12:00:00').toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'short'});
  const money=(coins,diamonds)=>`<span class="q-money"><span class="coin-mark">●</span> ${n(coins)} <small>金币</small><span class="diamond-mark">◆</span> ${n(diamonds)} <small>钻石</small></span>`;
  const avatar=(role,outfit)=>window.QuestArt?.avatar(role,outfit)||'';
  function replace(id,html){
    const el=$(id);
    // Browsers normalize SVG and boolean attributes in innerHTML. Compare the
    // original markup, so polling preserves focus and ongoing shop animations.
    if(el&&markupCache.get(id)!==html){el.innerHTML=html;markupCache.set(id,html);}
  }
  function actionFor(q){
    if(q.status==='available')return {action:'accept',label:'接取委托'};
    if(q.status==='ready')return {action:'submit',label:'交付委托'};
    return {action:null,label:{locked:clock(q.opensAt)+' 发布',active:new Date(data?.now||0)>=new Date(q.deadline)?'等待同步 · 未达标':'专注中 · 等待达标',expired:'已过今日期限',claimed:'奖励已收下'}[q.status]||'暂不可用'};
  }
  function taskMarkup(q,disabled=false){
    const action=actionFor(q),complete=q.status==='claimed',shownPercent=Math.floor(Math.max(0,Number(q.minutes)/Number(q.target)||0)*1000)/10;
    const reward=q.reward||{coins:0,diamonds:0},base=q.baseReward||{coins:q.target*2,diamonds:2};
    const gain=q.minutes>=q.target?`已积累 ${n(Math.floor(q.minutes/q.target*10)/10)} 倍目标时长`:'达标基础奖励';
    let note=complete?`已于 ${clock(q.submittedAt)} 交付 · 本次奖励已结算`:q.status==='available'?'接取后开始累计，听课与做题均可。':q.status==='locked'?'午间发布，现在先走好上午的路。':q.status==='expired'?'明天会有新的委托，已有学习与经验照常保留。':`学习截止 ${clock(q.deadline)} · 最晚 ${clock(q.submitDeadline)} 交付`;
    if(q.status==='ready')note+=new Date(data?.now||0)>=new Date(q.deadline)?'。已停止累计，请及时交付。':'。可以继续积累，交付后不再追加。';
    const advertised=q.minutes>=q.target||complete?reward:base;
    return `<article class="q-task ${esc(q.status)}" data-subject="${esc(q.subject)}"><div class="q-task-heading"><h3>${esc(q.name)}</h3><span class="q-status">${esc(statuses[q.status]||'待同步')}</span></div><div class="q-numbers"><strong>${n(q.minutes)}<small>分钟</small></strong><span>/ ${n(q.target)} 分钟</span><b>${n(shownPercent)}%</b></div><div class="q-progress" role="progressbar" aria-label="${esc(q.name)}委托进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100,shownPercent)}" aria-valuetext="${n(shownPercent)}%"><i style="width:${Math.min(100,shownPercent)}%"></i></div><div class="q-reward"><small>${esc(complete?'本次收获':q.status==='expired'?'未领取 · 本次已过期':gain)}</small>${money(advertised.coins,advertised.diamonds)}</div><p class="q-task-note">${esc(note)}</p><button class="${action.action==='submit'?'primary-button':'secondary-button'} q-task-button" ${action.action?`data-quest-action="${action.action}" data-subject="${esc(q.subject)}"`:''} ${!action.action||disabled?'disabled':''}>${esc(action.label)}</button></article>`;
  }
  function swatch(item){
    if(item.slot==='npc'||item.slot==='avatar')return `<div class="cosmetic-swatch outfit-swatch" data-item="${esc(item.id)}">${avatar(item.slot==='npc'?'guide':'player',item.id)}</div>`;
    return `<div class="cosmetic-swatch" data-item="${esc(item.id)}"></div>`;
  }
  function itemMarkup(item,wallet,disabled=false){
    const affordable=wallet.coins>=item.coins&&wallet.diamonds>=item.diamonds;
    const label=item.equipped?'使用中':item.owned?'装备':affordable?'购买':'余额不足';
    return `<article class="shop-item ${item.equipped?'equipped':''}"><div class="shop-item-visual">${swatch(item)}<span class="shop-item-type">${esc(names[item.slot])}</span>${item.owned?`<span class="shop-owned">${item.equipped?'✦ 使用中':'已收藏'}</span>`:''}</div><div class="shop-item-info"><h3>${esc(item.name)}</h3><p>${esc(item.description)}</p><div class="shop-price">${item.coins||item.diamonds?money(item.coins,item.diamonds):'<span class="shop-free">初始收藏 · 免费</span>'}</div><div class="shop-item-actions"><button class="text-button" data-shop-action="preview" data-item="${esc(item.id)}">${item.slot==='npc'||item.slot==='avatar'?'试穿':'预览'}</button><button class="secondary-button" data-shop-action="${item.owned?'equip':'buy'}" data-item="${esc(item.id)}" ${disabled||item.equipped||!item.owned&&!affordable?'disabled':''}>${label}</button></div></div></article>`;
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
    for(const prefix of ['wallet-side','quest','shop']){
      $(prefix+'-coins').textContent=n(data.wallet.coins);$(prefix+'-diamonds').textContent=n(data.wallet.diamonds);
    }
    $('quest-today-label').textContent=shortDay(data.day)+' · 今日委托';
    const ready=data.quests.filter(q=>q.status==='ready').length,active=data.quests.filter(q=>q.status==='active').length,available=data.quests.filter(q=>q.status==='available').length;
    $('quest-invitation-text').textContent=ready?`${ready} 项委托已达标，记得在期限内交付领奖。`:active?`${active} 项委托进行中，额外投入也会计入奖励。`:available?`${available} 项委托可以接取，去和营地伙伴聊聊。`:'今日委托已收起，明天再来开启新的旅程。';
    replace('quest-board',Object.entries(mentors).map(([period,m])=>`<section class="q-mentor ${period}"><header class="q-mentor-header"><div class="q-portrait">${avatar(period,data.equipped.npc)}</div><div><span class="q-mentor-role">${esc(m.title)} · ${m.subjects}</span><h2>${m.name}<small>${period==='morning'?'守住晨光里的秩序':'沿着午后的光前行'}</small></h2><p>${m.quote}</p></div></header><div class="q-schedule"><span><i></i>${m.hours} 学习窗口</span><span>${m.grace} 交付截止</span></div><div class="q-task-grid">${data.quests.filter(q=>q.period===period).map(q=>taskMarkup(q,busy)).join('')}</div></section>`).join(''));
    replace('shop-keeper',avatar('shop',data.equipped.npc));
    replace('player-outfit',avatar('player',data.equipped.avatar));
    $('equipped-summary').textContent=Object.values(data.equipped).map(id=>data.catalog.find(item=>item.id===id)?.name||'初始装扮').join(' · ');
    replace('shop-catalog',data.catalog.filter(item=>filter==='all'||item.slot===filter).map(item=>itemMarkup(item,data.wallet,busy)).join(''));
    replace('quest-history',data.history.length?data.history.map(row=>`<div class="q-history-row"><span><strong>${esc(row.name)}</strong><small>${esc(row.day)} · ${clock(row.submittedAt)} 交付</small></span><span>${n(row.minutes)} 分钟</span>${money(row.coins,row.diamonds)}</div>`).join(''):'<div class="q-empty"><span>✧</span><p>第一份委托，等你亲手交付。</p><small>完成后，金币、钻石和这次努力会一起记在这里。</small></div>');
  }
  function dialog(title,eyebrow,art,body,label,cancel='再想一想'){
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
    intent={action,subject};
    const m=mentors[q.period],body=action==='accept'?`<p>接下 ${esc(m.name)} 的委托，完成 <strong>${n(q.target)} 分钟${esc(subjectNames[q.subject])}</strong>。</p><div class="q-action-reward">${money(q.baseReward.coins,q.baseReward.diamonds)}<small>达标基础奖励 · 超额学习继续累积奖励</small></div><p>从接取这一刻开始累计。学习截止 <b>${clock(q.deadline)}</b>，请在 <b>${clock(q.submitDeadline)}</b> 前回来交付。</p>`:`<p>本次已计入 <strong>${n(q.minutes)} 分钟${esc(subjectNames[q.subject])}</strong>，达到目标的 <strong>${n(Math.floor(q.minutes/q.target*10)/10)} 倍</strong>。</p><div class="q-action-reward">${money(q.reward.coins,q.reward.diamonds)}<small>本次预计收获</small></div><p>确认后本项委托结算，后续学习不再追加本次奖励。${new Date(data.now)<new Date(q.deadline)?`若还有余力，可继续学习后再提交。`:''}</p><p class="q-fineprint">最晚 ${clock(q.submitDeadline)} 交付，以提交时已同步的有效记录结算。</p>`;
    dialog(action==='accept'?`接取${q.name}委托`:'把这份收获带回营地',action==='accept'?'A NEW CHAPTER':'READY TO TURN IN',avatar(q.period,data.equipped.npc),body,action==='accept'?'接下委托':'确认交付',action==='accept'?'先看看':'暂不交付');
  }
  function openItem(action,id){
    if(busy)return;
    const item=data?.catalog.find(item=>item.id===id);if(!item)return;
    if(action==='equip'){perform({action,id});return;}
    if(action==='buy'&&(item.owned||data.wallet.coins<item.coins||data.wallet.diamonds<item.diamonds))return;
    intent=action==='buy'?{action,id}:null;
    dialog(item.name,action==='buy'?'ADD TO YOUR COLLECTION':'WARDROBE PREVIEW',swatch(item),`<p>${esc(item.description)}</p><div class="q-action-reward">${item.coins||item.diamonds?money(item.coins,item.diamonds):'初始收藏 · 免费'}</div><p>${action==='buy'?`购买后永久拥有。购买后可从商店装备，${esc(names[item.slot])}一次使用一款。`:'外观预览，不花费货币，不改变当前装备。'}</p>${action==='buy'?`<p class="q-fineprint">购买后余额：${n(data.wallet.coins-item.coins)} 金币 · ${n(data.wallet.diamonds-item.diamonds)} 钻石</p>`:''}`,action==='buy'?'确认购买':null,'返回商店');
  }
  async function perform(job){
    if(busy||!job)return;
    busy=true;$('quest-action-confirm').disabled=true;render(data);
    try{
      const paths={accept:'/api/quests/accept',submit:'/api/quests/submit',buy:'/api/shop/buy',equip:'/api/shop/equip'};
      const result=await bridge.api(paths[job.action],job.subject?{subject:job.subject}:{itemId:job.id});
      render(result);
      if(intent===job){intent=null;$('quest-action-dialog').close();}
      if(job.action==='submit'){
        const q=result.quests.find(q=>q.subject===job.subject);
        bridge.toast('委托交付 · 收获已入袋',`+${n(q.reward.coins)} 金币 · +${n(q.reward.diamonds)} 钻石`);
      }else bridge.toast({accept:'委托已接取',buy:'新收藏已入库',equip:'装扮已更新'}[job.action],{accept:'从现在开始，完成对应科目的专注即可推进。',buy:'在商店点击「装备」，让星岛换上新模样。',equip:'已应用到你的星岛与营地。'}[job.action]);
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
    document.querySelectorAll('[data-shop-filter]').forEach(button=>button.addEventListener('click',()=>{
      filter=button.dataset.shopFilter;
      document.querySelectorAll('[data-shop-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});
      render(data);
    }));
    $('quest-action-confirm').addEventListener('click',()=>perform(intent));
    $('quest-action-dialog').addEventListener('close',()=>{intent=null;});
  }
  return {init,render,actionFor,taskMarkup,itemMarkup};
});
