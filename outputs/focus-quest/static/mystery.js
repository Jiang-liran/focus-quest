(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=value=>Math.max(0,Number(value)||0).toLocaleString('zh-CN',{maximumFractionDigits:1});
  const reward=value=>`${num(value?.coins)} 金币 · ${num(value?.diamonds)} 钻石`;
  const portrait=()=>root.FocusMysteryArt?.portrait()||'';
  const gift=(index,opened)=>root.FocusMysteryArt?.gift(index,opened)||'';
  const duration=value=>`${num(value)} 分钟`;
  let bridge={},data=null,busy=false,intent=null,receipt=null,stamp=-Infinity,markup='',opened=new Set();
  const timestamp=value=>{const fraction=String(value).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);return Date.parse(value)*1000+Number((fraction?.[1]||'').padEnd(6,'0').slice(3,6));};
  function condition(label,actual,target,met,strict=false){
    const percent=target>0?Math.min(100,Math.max(0,actual/target*100)):0;
    return `<li class="${met?'met':''}"><span><i aria-hidden="true">${met?'✦':'◇'}</i>${esc(label)}</span><strong>${duration(actual)} <small>/ ${strict?'超过 ':''}${duration(target)}</small></strong><div class="mystery-condition-bar" aria-hidden="true"><i style="width:${percent}%"></i></div></li>`;
  }
  function card(m){
    const ready=Number(m.reward?.coins)>0||Number(m.reward?.diamonds)>0,active=!!m.unlocked;
    const status=ready?'有余辉待交付':!m.enabled?'目标未开启':active?'拾星已到访':'等待星灯亮起';
    const quote=active?'「你已走完今日的路。这之后的每一步，我都为你珍藏。」':'「当四座星岛都有了光，我会在旅途尽头，为你点一盏灯。」';
    const ng=m.nextGift||{},pg={minutes:ng.progressMinutes,nextReward:{coins:ng.coins,diamonds:ng.diamonds}},next=Math.max(1,Number(ng.index)||1),gifts=m.pendingGifts||[];
    const totalToday=Number(m.todayMinutes)||0;
    const progress=Math.min(100,Math.max(0,Number(pg.minutes)||0)/30*100);
    return `<div class="mystery-identity"><div class="mystery-portrait ${active?'awake':''}">${portrait()}</div><div><span class="mystery-eyebrow">BEYOND THE DAY’S QUEST</span><h2 id="mystery-name">拾星 <small>余辉守望者</small></h2><p>${quote}</p><span class="mystery-status ${ready?'ready':''}">${status}</span></div></div>
      <div class="mystery-body"><div class="mystery-heading"><h3>${active?'额外的专注，点滴珍藏。':'达成今日远征，遇见旅途尽头的来客。'}</h3><span class="mystery-multiplier">×2 <small>金币收益</small></span></div>
      ${!m.enabled?'<p class="mystery-disabled">每日总目标不少于 <strong>8 小时</strong>，才会开启神秘委托。可在远征设置中调整。</p>':''}
      ${!active?`<ul class="mystery-conditions">${condition('今日总进度',m.minutes,m.target,Number(m.minutes)>=Number(m.target))}${(m.subjects||[]).map(c=>condition(c.name,c.minutes,c.target/2,c.eligible,true)).join('')}</ul>`:`<div class="mystery-today"><span>今日余辉 <strong>${duration(totalToday)}</strong></span><span>今日已交付 <strong>${duration(m.todaySettledMinutes)}</strong></span><p>四科之后的专注自动转交拾星，每科累计 15 分钟得 1 钻石。普通委托中未交付的先前进度仍保留。</p></div>`}
      <div class="mystery-gift-track"><div class="mystery-next-art">${gift(next,false)}</div><div><span class="mystery-eyebrow">今日第 ${num(next)} 份星礼</span><h4>额外 ${reward(pg.nextReward||{coins:20*next,diamonds:next})}</h4><div class="mystery-gift-progress" role="progressbar" aria-label="下一份余辉礼盒" aria-valuemin="0" aria-valuemax="30" aria-valuenow="${Math.min(30,Math.max(0,Number(pg.minutes)||0))}"><i style="width:${progress}%"></i></div><p>${duration(pg.minutes)} / 30 分钟 · 四科合计 · 礼盒阶数每日重置</p></div></div>
      ${Number(m.pendingMinutes)>0||ready?`<div class="mystery-pending"><div><span>待交付余辉 · 含过往未领取</span><strong>${Number(m.pendingMinutes)>0?duration(m.pendingMinutes):'钻石进度待领取'}</strong></div><div><span>本次基础收益</span><strong>${reward(m.baseReward)}</strong></div><div><span>${gifts.length} 份礼盒额外加赠</span><strong>${reward(m.giftReward)}</strong></div></div><div class="mystery-subjects">${(m.subjects||[]).map(s=>`<span>${esc(s.name)} <b>${duration(s.pendingMinutes)}</b></span>`).join('')}</div>`:''}
      <div class="mystery-actions"><p>${ready?'收获会为你保留，不必赶着交付。':active?'星灯已经为你点亮，有余力时，再添一小段专注。':'所有条件同时达成之后的新增专注，才计入神秘委托。'}</p><button type="button" class="primary-button" id="mystery-submit" ${busy||!ready?'disabled':''}>${busy?'正在交付…':ready?'交付余辉 · '+reward(m.reward):'等待新的余辉'}</button></div>
      <details class="mystery-rules"><summary>查看余辉收益与星礼规则</summary><p>无需另外接取。每日总目标须至少 8 小时，总进度达标且四科各自严格超过目标的一半后，新增四科专注自动交给拾星，不再推进普通委托。</p><p>金币仍为双倍，每分钟 4 金币；数学、408、政治、英语统一为每科累计 15 分钟得 1 钻石。神秘委托各科未满的钻石进度跨天保留，与普通委托分开累计；每日时段首轮不再重复计算这些片段。</p><p>四科余辉按学习发生日合计，每满 30 分钟额外获得礼盒。当天第 n 盒奖励 20 × n 金币和 n 钻石，独立于基础收益。礼盒序号每天重置，未领取收获可跨天交付。打开第 1、2 份星礼各得 1 张金币抽奖券，第 3、4 份各得 1 张钻石抽奖券；没有打开的券奖励也可在抽奖机找回。</p><p>新机制启用前的学习不补发奖励。修改目标或任务归类只影响修改之后的神秘委托归属；已结算的收获不会重领。学习统计仍按真实专注时长计算。</p></details>
      ${m.history?.length?`<details class="mystery-history"><summary>拾星的交付手记 <span>最近 ${m.history.length} 次</span></summary>${m.history.map(r=>`<div><span>${esc(String(r.submittedAt||'').replace('T',' ').slice(0,16))}<small>${duration(r.minutes)} · ${(r.gifts||[]).length} 份星礼</small></span><strong>${reward(r)}</strong></div>`).join('')}</details>`:''}</div>`;
  }
  function render(snapshot){
    const host=$('mystery-quest');if(!host)return;
    const nextStamp=timestamp(snapshot?.now);if(Number.isFinite(nextStamp)&&nextStamp<stamp)return;
    if(Number.isFinite(nextStamp))stamp=nextStamp;
    rememberLottery(snapshot?.lottery);
    data=snapshot?.mystery||null;host.hidden=!data;if(!data)return;
    const html=card(data);if(html!==markup){host.innerHTML=html;markup=html;}
    host.dataset.status=data.status||'locked';
    if(data.status==='ready'&&$('quest-invitation-text'))$('quest-invitation-text').textContent=Number(data.pendingMinutes)>0?`拾星已备好 ${duration(data.pendingMinutes)} 的余辉收获，去委托广场交付余辉。`:'拾星已将先前积累的进度换算为钻石，去委托广场领取。';
  }
  function showDialog(){
    if(busy||giftBusy!==null||!data||!(Number(data.reward?.coins)>0||Number(data.reward?.diamonds)>0))return;
    if(!root.crypto?.randomUUID){bridge.toast?.('暂时无法交付','请重新打开应用后再试。',true);return;}
    intent={requestId:root.crypto.randomUUID()};receipt=null;opened.clear();
    $('mystery-dialog-title').textContent='把余辉交给拾星';
    $('mystery-dialog-art').innerHTML=portrait();
    $('mystery-dialog-body').innerHTML=`<p>${Number(data.pendingMinutes)>0?`交付 <strong>${duration(data.pendingMinutes)}</strong> 额外专注，含过往未领取收获。`:'领取此前积累的钻石进度，按每科 15 分钟 1 钻石兑换。'}</p><div class="mystery-dialog-reward">${reward(data.reward)}</div><p>基础收益：${reward(data.baseReward)}<br>礼盒加赠：${reward(data.giftReward)} · ${(data.pendingGifts||[]).length} 份</p><p class="mystery-fineprint">以确认时已同步记录为准。金币、钻石在交付时结算，不会重复领取。第 1、2 份星礼打开再收下金币抽奖券，第 3、4 份收下钻石抽奖券。</p>`;
    $('mystery-confirm').textContent='确认交付';$('mystery-confirm').disabled=false;$('mystery-dialog-error').hidden=true;
    $('mystery-dialog').showModal();
  }
  let lottery=null,giftBusy=null;
  const giftRetries=new Map();
  function rememberLottery(next){
    if(!next)return;
    if(lottery&&(next.revision<lottery.revision||(next.revision===lottery.revision&&timestamp(next.now)<timestamp(lottery.now))))return;
    lottery=next;
  }
  function receiptMarkup(){
    return `<p>「${(receipt.gifts||[]).length?'这些星礼，记着你走过的每一段余途。':'多走出的每一步，都已收好。'}」</p><div class="mystery-dialog-reward">+${reward(receipt)}</div><p>${Number(receipt.minutes)>0?duration(receipt.minutes)+' 已交付':'此前积累的钻石已兑换'} · 奖励已入袋</p>${receipt.gifts?.length?`<div class="mystery-open-gifts">${receipt.gifts.map((g,i)=>{const ticket=(lottery?.starGifts||[]).find(row=>row.day===g.day&&row.index===g.index);return `<button type="button" data-mystery-gift="${i}" aria-expanded="${opened.has(i)}" ${giftBusy!==null?'disabled':''}>${gift(g.index,opened.has(i))}<span>${esc(g.day)} · 第 ${num(g.index)} 盒</span><strong>${giftBusy===i?'正在开启…':opened.has(i)?reward(g):'轻触打开星礼'}</strong>${ticket?`<small>${ticket.claimed?'已收好':'内含'} 1 张${ticket.machine==='diamond'?'钻石':'金币'}抽奖券</small>`:''}</button>`;}).join('')}</div>`:''}`;
  }
  async function openGift(index){
    if(busy||giftBusy!==null||!Number.isInteger(index)||!receipt?.gifts?.[index]||opened.has(index))return;
    const origin=receipt,g=origin.gifts[index],entry=(lottery?.starGifts||[]).find(row=>row.day===g.day&&row.index===g.index&&!row.claimed);
    if(!entry){opened.add(index);$('mystery-dialog-body').innerHTML=receiptMarkup();return;}
    const key=`${g.day}:${g.index}`;let requestId=giftRetries.get(key);
    if(!requestId){requestId=root.crypto.randomUUID();giftRetries.set(key,requestId);if(giftRetries.size>32)giftRetries.delete(giftRetries.keys().next().value);}
    giftBusy=index;$('mystery-dialog-body').innerHTML=receiptMarkup();$('mystery-dialog-error').hidden=true;
    try{
      const result=await bridge.api('/api/lottery/star-gift',{day:g.day,index:g.index,requestId});
      if(result.result?.type!=='starGift'||result.result?.day!==g.day||result.result?.index!==g.index||result.result?.machine!==entry.machine||!result.lottery?.starGifts?.some(row=>row.day===g.day&&row.index===g.index&&row.machine===entry.machine&&row.claimed===true))throw new Error('星礼回执暂未完整返回，请再点一次确认。');
      rememberLottery(result.lottery);giftRetries.delete(key);bridge.acceptReceipt?.(result);
      if(receipt===origin){opened.add(index);$('mystery-dialog-error').hidden=true;}
      if(!result.alreadyProcessed){bridge.playSound?.('delivery',{key:`star-ticket:${key}`});bridge.toast?.('拾星的抽奖券已收好',root.FocusLottery?.ticketText?.(result.ticketGrants)||'抽奖券已经放进行囊。');}
    }catch(error){if(receipt===origin&&$('mystery-dialog').open){$('mystery-dialog-error').textContent=error.message;$('mystery-dialog-error').hidden=false;}}
    finally{giftBusy=null;if(receipt===origin&&$('mystery-dialog').open)$('mystery-dialog-body').innerHTML=receiptMarkup();}
    try{await bridge.refresh?.(true);}catch(_){}
  }
  async function submit(){
    if(receipt){$('mystery-dialog').close();return;}
    if(busy||!intent)return;
    busy=true;$('mystery-confirm').disabled=true;$('mystery-confirm').textContent='正在交付…';$('mystery-dialog-error').hidden=true;
    const job=intent;
    try{
      const result=await bridge.api('/api/quests/mystery/submit',job);
      if(!result.receipt)throw new Error('交付回执暂未返回，请重试确认。');
      receipt=result.receipt;rememberLottery(result.lottery);bridge.renderQuests?.(result);render(result);
      if(!receipt.alreadyClaimed)bridge.playSound?.(receipt.gifts?.length?'victory':'delivery',{key:`mystery:${receipt.requestId}`});
      $('mystery-dialog-title').textContent=receipt.alreadyClaimed?'这份余辉已收好':'每一束余辉，都有回响。';
      $('mystery-dialog-art').innerHTML='';$('mystery-dialog-body').innerHTML=receiptMarkup();
      $('mystery-confirm').textContent='收下这份回响';bridge.toast?.('拾星收下了这份努力',`+${reward(receipt)}`);
    }catch(error){$('mystery-dialog-error').textContent=error.message;$('mystery-dialog-error').hidden=false;$('mystery-confirm').textContent='重试确认交付';}
    finally{busy=false;$('mystery-confirm').disabled=false;}
    // A refresh failure cannot revoke an acknowledged delivery or repeat its audio.
    try{await bridge.refresh?.(true);}catch(_){}
  }
  function init(callbacks){
    bridge=callbacks;
    $('mystery-quest')?.addEventListener('click',e=>{if(e.target.closest('#mystery-submit'))showDialog();});
    $('mystery-confirm')?.addEventListener('click',submit);
    $('mystery-dialog')?.addEventListener('close',()=>{if(!busy){intent=null;receipt=null;opened.clear();}});
    $('mystery-dialog-body')?.addEventListener('click',e=>{const b=e.target.closest('[data-mystery-gift]');if(b&&receipt)void openGift(Number(b.dataset.mysteryGift));});
  }
  root.FocusMystery={init,render};
})(typeof globalThis!=='undefined'?globalThis:this);
