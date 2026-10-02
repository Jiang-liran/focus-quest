(function(root){
  'use strict';
  const kinds=new Set(['coin','diamond']);
  const campSlots=new Set(['camp','fire','tent','campgear','campglow','chatframe','camptrail','campmark']);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  const count=value=>Math.floor(number(value));
  const labels={coin:{name:'金币抽奖机',ticket:'金币抽奖券',currency:'金币'},diamond:{name:'钻石抽奖机',ticket:'钻石抽奖券',currency:'钻石'}};
  let bridge={},host=null,machine=null,data=null,markup='',loading=false,loadError='',busy=null,retry=null,error='';
  const results=new Map(),announced=new Set();
  function visible(){
    if(!host||document.hidden||bridge.isVisible?.()===false||root.FocusRuntime?.isVisible?.()===false)return false;
    for(let node=host;node;node=node.parentElement)if(node.hidden||node.inert)return false;
    return true;
  }
  function model(){return data?.machines?.find(item=>item.id===machine);}
  function valid(next){return Boolean(next&&typeof next.revision==='number'&&Number.isFinite(next.revision)&&next.revision>=0&&next.tickets&&Array.isArray(next.machines)&&['coin','diamond'].every(kind=>next.machines.filter(item=>item?.id===kind).length===1));}
  function stamp(next){
    const time=Date.parse(next?.now);if(!Number.isFinite(time))return -Infinity;
    const fraction=String(next.now).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);
    return time*1000+Number((fraction?.[1]||'').padEnd(6,'0').slice(3,6));
  }
  function accept(next){
    if(!valid(next))return false;
    if(!data||next.revision>data.revision||(next.revision===data.revision&&stamp(next)>=stamp(data))){data=next;return true;}
    return false;
  }
  function money(value){return [number(value?.coins)?`${count(value.coins)} 金币`:'',number(value?.diamonds)?`${count(value.diamonds)} 钻石`:''].filter(Boolean).join(' · ')||'0 金币';}
  function cost(value){return number(value?.diamonds)?`${count(value.diamonds)} 钻石`:`${count(value?.coins)} 金币`;}
  function priceEnough(item){return count(data?.wallet?.coins)>=count(item?.price?.coins)&&count(data?.wallet?.diamonds)>=count(item?.price?.diamonds);}
  function canBuy(){const item=model();return Boolean(item&&!busy&&!retry&&item.canBuy===true&&number(item.purchasesRemaining)>0&&priceEnough(item));}
  function canDraw(){return Boolean(model()?.canDraw===true&&number(data?.tickets?.[machine])>0&&!busy&&!retry);}
  function ticketArt(kind){
    return `<svg viewBox="0 0 78 52" aria-hidden="true" fill="none"><path d="M8 8h62v11a7 7 0 0 0 0 14v11H8V33a7 7 0 0 0 0-14Z" fill="${kind==='coin'?'#eacb83':'#c6b5f3'}"/><path d="M56 10v32" stroke="${kind==='coin'?'#807042':'#796698'}" stroke-dasharray="3 3"/><path d="M13 13h35v26H13z" stroke="${kind==='coin'?'#9d874f':'#9a80bd'}"/><path d="${kind==='coin'?'M30 18a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM30 21v10M27 23h6m-6 6h6':'m30 17 10 9-10 10-10-10 10-9Zm0 0-4 9 4 10 4-10-4-9Zm-10 9h20'}" stroke="${kind==='coin'?'#fff7cd':'#fcf3ff'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function cabinetArt(kind){
    const gold=kind==='coin',base=gold?'#46746c':'#685985',edge=gold?'#91d7b7':'#c4adf6',accent=gold?'#f1cd7f':'#c6b9ff';
    return `<svg class="lottery-cabinet" viewBox="0 0 280 210" aria-hidden="true" fill="none"><ellipse cx="140" cy="192" rx="76" ry="10" fill="#070e1c" opacity=".3"/><path d="m85 61 23-19h75l17 19v119l-19 15H85Z" fill="${base}"/><path d="m200 61-19 14v120l19-15Z" fill="#151f34" opacity=".45"/><path d="M85 61h96v134H85Z" stroke="${edge}" stroke-opacity=".55" stroke-width="2"/><path d="M80 60h108l14 10H92Z" fill="${edge}" opacity=".8"/><rect x="99" y="81" width="67" height="64" rx="21" fill="#172737" stroke="${accent}" stroke-width="2"/><path d="M108 89q20-10 42-1" stroke="#f5fff8" stroke-width="4" stroke-linecap="round" opacity=".16"/><g class="lottery-orbs"><circle cx="114" cy="123" r="9" fill="${edge}"/><circle cx="137" cy="131" r="10" fill="${accent}"/><circle cx="152" cy="116" r="8" fill="${gold?'#dfacac':'#82cabd'}"/><circle cx="130" cy="108" r="8" fill="${gold?'#d6a260':'#928ed4'}"/><path d="m132 88 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="${accent}"/></g><path d="M96 154h78v17H96z" fill="#172434"/><circle cx="114" cy="162" r="5" fill="${accent}"/><path d="M127 160h34m-34 5h25" stroke="${edge}" stroke-width="2" stroke-linecap="round"/><path d="M111 179h43v8h-43Z" fill="#101d2e"/><path d="M121 179h23" stroke="${accent}" stroke-width="2"/><path d="m48 65 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm182 73 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="${edge}" opacity=".75"/><path d="m212 44 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="${accent}"/><path d="M108 47h55" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><text x="132" y="73" text-anchor="middle" fill="#f4edda" font-size="8" letter-spacing="2">${gold?'GOLDEN LUCK':'MOONLIGHT'}</text></svg>`;
  }
  function resultArt(result){
    if(result.type==='item'&&/^[a-z0-9-]+$/.test(result.item?.id||'')){
      try{
        const art=campSlots.has(result.item.slot)?root.FocusCampfireShopArt?.preview?.(result.item.id):root.ShopArt?.preview?.(result.item.id);
        if(art)return `<div class="lottery-item-preview">${art}</div>`;
      }catch{/* A missing thumbnail never hides the saved reward. */}
      return '<svg viewBox="0 0 100 80" aria-hidden="true" fill="none"><path d="m20 36 30 12v25L20 59Z" fill="#7dceba"/><path d="m50 48 30-12v23L50 73Z" fill="#9582cb"/><path d="m15 30 35-15 35 15-35 15Z" fill="#deb28a"/><path d="m15 30 35 15v8L15 39Z" fill="#8ac9d1"/><path d="m50 45 35-15v9L50 53Z" fill="#aea1e0"/><path d="m33 23 35 15-9 4-35-15Z" fill="#f1d795"/><path d="m67 23-35 15 9 4 35-15Z" fill="#ffe2a6"/><path d="m34 42 10 4v24l-10-4Zm22 4 10-4v24l-10 4Z" fill="#f7dfb0"/><path d="M50 24C28 24 23 7 33 7c9 0 17 17 17 17Zm0 0c22 0 27-17 17-17-9 0-17 17-17 17Z" fill="#f4d497" stroke="#fff1ca" stroke-width="1.4"/></svg>';
    }
    if(result.type==='diamonds')return '<svg viewBox="0 0 100 80" aria-hidden="true" fill="none"><path d="m50 10 30 25-30 36-30-36Z" fill="#baacf7"/><path d="m50 10-12 25 12 36 12-36Z" fill="#e3d6ff"/><path d="m20 35 30 36-12-36Z" fill="#8d86cb"/><path d="m80 35-30 36 12-36Z" fill="#a59ddd"/><path d="M20 35h60" stroke="#f5e6ff"/><path d="m10 19 2 4 4 2-4 2-2 4-2-4-4-2 4-2Zm77 36 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#e7cdf9"/></svg>';
    if(result.type==='coins')return '<svg viewBox="0 0 100 80" aria-hidden="true" fill="none"><ellipse cx="44" cy="62" rx="26" ry="8" fill="#ac8b4c"/><path d="M18 55v7c0 10 52 10 52 0v-7" fill="#caa557"/><ellipse cx="44" cy="55" rx="26" ry="8" fill="#f2d08a"/><circle cx="54" cy="31" r="25" fill="#d3af5e"/><circle cx="54" cy="28" r="24" fill="#f6d790"/><circle cx="54" cy="28" r="18" stroke="#c4a056" stroke-width="2"/><path d="M54 17v22m-6-18h12m-12 14h12" stroke="#fff1c8" stroke-width="3" stroke-linecap="round"/><path d="m13 12 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#ffd99c"/></svg>';
    return ticketArt(machine);
  }
  function resultTitle(result){return result.type==='item'?result.item?.name||'一件新收藏':result.type==='coins'?`${count(result.coins)} 金币`:result.type==='diamonds'?`${count(result.diamonds)} 钻石`:'一份小小惊喜';}
  function resultHTML(){
    const result=results.get(machine)||data?.history?.find(row=>row.machine===machine)?.result;
    if(busy?.action==='draw'&&busy.machine===machine)return `<div class="lottery-stage is-opening" role="status"><div class="lottery-sealed-orb" aria-hidden="true"><i></i><b>✦</b><i></i></div><h3>正在打开这份惊喜…</h3><p>用掉一张券，收下一份礼物。</p></div>`;
    if(!result)return `<div class="lottery-stage is-idle">${cabinetArt(machine)}<h3>${machine==='coin'?'把小小的努力，换成一份惊喜。':'月光里，藏着另一种幸运。'}</h3><p>投入一张${labels[machine].ticket}，打开一次。</p></div>`;
    const rarity=['ordinary','rare','jackpot'].includes(result.rarity)?result.rarity:'ordinary';
    return `<div class="lottery-stage is-result ${rarity}${result.limited?' is-limited':''}" role="status" aria-live="polite"><span class="lottery-result-eyebrow">${result.pityTriggered?'如约而来的限定惊喜':result.limited?'只有这里，才会遇见':rarity==='jackpot'?'闪耀的惊喜':result.type==='item'?'新的收藏':rarity==='rare'?'幸运的小礼':'你的抽奖结果'}</span><div class="lottery-result-art" aria-hidden="true">${resultArt(result)}</div><h3>${esc(resultTitle(result))}</h3><p>${result.type==='item'?esc(result.item?.description||'已永久加入收藏，喜欢的话可以去换上。'):'已经收进你的行囊。'}${result.fallback?result.limited?' 限定藏品已集齐，本次换成限定补给。':' 藏品池已集齐，本次换成货币补给。':''}</p>${result.limited&&!result.fallback?'<span class="lottery-limited-stamp">抽奖限定 · 无法购买</span>':''}${result.type==='item'?'<button type="button" class="lottery-quiet" data-lottery-action="collection" data-lottery-focus="collection">去看看收藏 ↗</button>':''}</div>`;
  }
  function oddsHTML(item){
    const average=value=>`${number(value?.coins).toLocaleString('zh-CN',{maximumFractionDigits:2})} 金币、${number(value?.diamonds).toLocaleString('zh-CN',{maximumFractionDigits:3})} 钻石`;
    return `<details class="lottery-details" data-lottery-details="odds"><summary>每一份惊喜，都有明确的概率 <span>开奖规则 ↗</span></summary>${item.pity?'<p class="lottery-fineprint">以下为未触发保底时的基础概率；到保底抽次，限定奖品概率为 100%。提前遇见限定奖品，保底重新累计。</p>':''}<ul class="lottery-odds">${(item.odds||[]).map(odd=>`<li><div><strong>${esc(odd.label)}</strong><b>${number(odd.percent).toLocaleString('zh-CN',{maximumFractionDigits:3})}%</b></div><small>${odd.min!==undefined?`${count(odd.min)}—${count(odd.max)} ${odd.type==='coins'?'金币':'钻石'}${odd.typical?` · ${esc(odd.typical)}`:''}`:odd.type==='coinItem'?`未拥有的金币藏品 · ${count(item.pool?.coinItems)} 款可抽`:odd.type==='diamondItem'?`未拥有的钻石藏品 · ${count(item.pool?.diamondItems)} 款可抽`:odd.type==='lotteryOnly'?`无法购买的限定藏品 · ${count(item.pool?.lotteryOnlyItems)} / ${count(item.pool?.lotteryOnlyTotal)} 款待收集`:''}${odd.fallback?` · 集齐后换成 ${money(odd.fallback)}`:''}</small></li>`).join('')}</ul><p class="lottery-fineprint">全部普通付费商品均可抽。金币机可抽金币商品与钻石商品，钻石机可抽钻石商品；抽奖限定藏品仍在独立限定奖池中。藏品不重复，抽中后永久拥有；装备由你自己决定。</p>${item.currencyExpected?`<p class="lottery-fineprint">各奖池都有未拥有藏品时，长期平均每抽货币回报约 ${average(item.currencyExpected)}；${item.fullPoolCurrencyExpected?`藏品全部集齐后约 ${average(item.fullPoolCurrencyExpected)}。`:'少见的大礼也包含在平均数中。'}平均值不含藏品价值，也不是下一抽的承诺。</p>`:''}</details>`;
  }
  function pityHTML(item){
    const pity=item.pity;if(!pity||!Number.isInteger(pity.count)||!Number.isInteger(pity.limit)||pity.limit<1||!Number.isInteger(pity.remaining)||pity.remaining<1)return '';
    const accumulated=Math.max(0,pity.count),seen=Math.min(pity.limit,accumulated),remaining=pity.remaining,complete=pity.allCollected===true;
    const guarantee=complete?(machine==='coin'?'120 金币限定补给':'8 钻石限定补给'):'一件未拥有的限定藏品';
    return `<section class="lottery-pity${remaining===1?' is-next':''}" aria-label="限定藏品保底"><div class="lottery-pity-copy"><span class="lottery-eyebrow">${complete?'限定已集齐 · 惊喜继续':'抽奖限定 · 每一抽都记得'}</span><strong>${remaining===1?`下一抽必得${guarantee}`:`最多再抽 ${remaining} 次，必得${guarantee}`}</strong><p>两台机器分别累计，跨天保留；提前抽中限定奖品后重新累计。</p></div><div class="lottery-pity-track"><span>保底积累 <b>${accumulated>=pity.limit?`${accumulated} 抽`:`${accumulated} / ${pity.limit}`}</b></span><div class="lottery-pity-meter" role="progressbar" aria-label="限定藏品保底进度" aria-valuemin="0" aria-valuemax="${pity.limit}" aria-valuenow="${seen}"><i style="width:${seen/pity.limit*100}%"></i></div></div></section>`;
  }
  function collectionHTML(item){
    const items=(item.collection||[]).filter(row=>row?.lotteryOnly===true&&row.lotteryMachine===machine).slice(0,12);if(!items.length)return '';
    const owned=items.filter(row=>row.owned===true).length;
    return `<section class="lottery-collection" aria-labelledby="lottery-collection-title"><header><div><span class="lottery-eyebrow">ONLY HERE · 只在这台机器里</span><h3 id="lottery-collection-title">${machine==='coin'?'金色奇遇藏品':'月光限定藏品'}</h3></div><span>${owned} / ${items.length} 已收藏</span></header><p>这些外观无法购买，每次抽中都会是一件未拥有的。拿到后可以一直留着。</p><div class="lottery-collection-grid">${items.map(row=>`<article class="lottery-collection-card${row.owned?' is-owned':''}" title="${esc(row.description||row.name)}"><div class="lottery-collection-art" aria-hidden="true">${resultArt({type:'item',item:row})}</div><span class="lottery-collection-status">${row.owned?'✓ 已收藏':'✦ 等待相遇'}</span><h4>${esc(row.name)}</h4><p>${esc(row.description||'只在这里，等待下一次相遇。')}</p></article>`).join('')}</div></section>`;
  }
  function roundSummary(){
    const rounds=data?.roundTickets;
    if(!Number.isInteger(rounds?.totalRounds)||rounds.totalRounds<0||!Number.isInteger(rounds?.roundsToNextDiamond)||rounds.roundsToNextDiamond<1||rounds.roundsToNextDiamond>3)return '';
    return `普通委托累计交付 ${rounds.totalRounds} 轮 · 再交付 ${rounds.roundsToNextDiamond} 轮，得 1 张钻石抽奖券。`;
  }
  function sourcesHTML(item){
    const sources=machine==='coin'?[
      '普通委托每交付完整 1 轮：1 张。数学、408 每轮 60 分钟，政治、英语每轮 30 分钟。',
      '每科当日目标完成，打开该科岛屿礼盒：1 张。',
      '上午两科首轮加赠领齐、下午两科首轮加赠领齐：各 1 张。',
      '「拾星」第 1、2 份星礼：各 1 张。',
      `${cost(item.price)}购买 1 张，每天最多购买 ${count(item.purchaseLimit)} 张。`
    ]:[
      '四科普通委托合计每交付完整 3 轮：1 张。可连续学习同一科，也可自由搭配科目。',
      '总目标与四科目标都完成，打开主岛礼盒：1 张。',
      '知行研习所「融会贯通」额外奖赏：1 张。',
      '「拾星」第 3、4 份星礼：各 1 张。',
      '四科首轮加赠全部领齐：1 张。',
      `${cost(item.price)}购买 1 张，每天最多购买 ${count(item.purchaseLimit)} 张。`
    ];
    return `<details class="lottery-details" data-lottery-details="sources"><summary>抽奖券从哪里来 <span>学习与奖励 ↗</span></summary><ul class="lottery-sources">${sources.map(text=>`<li>${esc(text)}</li>`).join('')}</ul><p class="lottery-fineprint">普通委托的轮次与不足一轮的余量，跨天、重启都会保留；旧时已经交付的完整轮次不补发。原有礼盒和时段加赠的抽奖券照常获得。</p><p class="lottery-fineprint">抽奖券永久保留，两种券各用各的。新领取的对应奖励会带上抽奖券，已经收好的旧奖励不补发。</p></details>`;
  }
  function pendingGifts(){return (data?.starGifts||[]).filter(row=>row?.machine===machine&&row.claimed===false&&/^\d{4}-\d{2}-\d{2}$/.test(row.day)&&Number.isInteger(row.index)&&row.index>=1&&row.index<=4);}
  function starGiftsHTML(){
    const rows=pendingGifts();if(!rows.length)return '';
    return `<section class="lottery-star-gifts" aria-label="拾星留存的星礼"><h3>拾星为你留下的星礼</h3><p>余辉的货币奖励已结算，这里再打开礼盒，收下其中的抽奖券。</p>${rows.slice(0,12).map(row=>`<div><span>${esc(row.day)} · 第 ${row.index} 份星礼</span><button type="button" data-lottery-action="star-gift" data-lottery-day="${row.day}" data-lottery-index="${row.index}" data-lottery-focus="star-${row.day}-${row.index}" aria-disabled="${Boolean(busy||retry)}">${busy?.action==='star-gift'&&busy.day===row.day&&busy.index===row.index?'正在打开…':'开启星礼'}</button></div>`).join('')}${rows.length>12?`<small>还有 ${rows.length-12} 份，打开这些后即可继续查看。</small>`:''}</section>`;
  }
  function historyHTML(){
    const rows=(data?.history||[]).filter(row=>row.machine===machine).slice(0,4);
    return rows.length?`<div class="lottery-history"><h3>最近拆开的礼物</h3><ul>${rows.map(row=>`<li><span>${esc(resultTitle(row.result||{}))}</span><small>${Number.isFinite(Date.parse(row.drawnAt))?esc(new Date(row.drawnAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})):'已收好'}</small></li>`).join('')}</ul></div>`:'';
  }
  function paint(){
    if(!host||!machine)return;
    const item=model(),focus=host.contains(document.activeElement)?document.activeElement?.closest?.('[data-lottery-focus]')?.dataset.lotteryFocus:null;
    const openDetails=Array.from(host.querySelectorAll?.('[data-lottery-details]')||[]).filter(node=>node.open).map(node=>node.dataset.lotteryDetails);
    let html;
    if(!item)html=`<section class="lottery-room ${machine}" aria-label="${labels[machine].name}"><div class="lottery-loading" role="status">${ticketArt(machine)}<h2>${labels[machine].name}</h2><p>${loading?'正在亮起机器…':esc(loadError||'机器暂时没有响应。')}</p>${loading?'':'<button type="button" data-lottery-action="reload" data-lottery-focus="reload">重新连接</button>'}</div></section>`;
    else html=`<section class="lottery-room ${machine}" aria-labelledby="lottery-title">
      <header class="lottery-heading"><div><span class="lottery-eyebrow">${machine==='coin'?'GOLDEN LUCK · 路边的小幸运':'MOONLIGHT · 收藏的另一种可能'}</span><h2 id="lottery-title">${esc(item.name||labels[machine].name)}</h2><p>只用${labels[machine].ticket}开奖 · 结果自动保存</p></div><div class="lottery-ticket-wallet">${ticketArt(machine)}<span>${labels[machine].ticket}<strong>${count(data.tickets[machine])} <small>张</small></strong></span></div></header>
      ${pityHTML(item)}
      <div class="lottery-layout"><div class="lottery-main">${resultHTML()}
        <div class="lottery-draw"><button type="button" class="lottery-draw-button" data-lottery-action="draw" data-lottery-focus="draw" aria-disabled="${!canDraw()}"${busy?.action==='draw'?' aria-busy="true"':''}>${busy?.action==='draw'?'正在打开…':number(data.tickets[machine])>0?'投入 1 张券 · 打开惊喜':'还没有抽奖券'}</button><small>每次消耗 1 张${labels[machine].ticket}；进入这里不会消耗。</small></div>
        <div class="lottery-status" role="status" ${error||loadError||retry?'':'hidden'}>${esc(error||loadError||'上次操作需要确认，请先收好它的结果。')}${retry&&!busy?`<button type="button" data-lottery-action="retry" data-lottery-focus="retry">确认上次${retry.action==='draw'?'抽奖':retry.action==='star-gift'?'开礼盒':'购券'}</button>`:''}</div>
      </div><aside class="lottery-aside">
        <section class="lottery-purchase" aria-labelledby="lottery-purchase-title"><div><span class="lottery-eyebrow">给幸运留一张小票</span><h3 id="lottery-purchase-title">${cost(item.price)} 换 1 张</h3><p>今日已买 ${count(item.purchasesToday)} / ${count(item.purchaseLimit)} 张 · 剩余 ${count(item.purchasesRemaining)} 次</p></div><button type="button" data-lottery-action="buy" data-lottery-focus="buy" aria-disabled="${!canBuy()}"${busy?.action==='buy'?' aria-busy="true"':''}>${busy?.action==='buy'?'正在收好…':!number(item.purchasesRemaining)?'今日已买满':!priceEnough(item)?`${labels[machine].currency}暂时不足`:`${cost(item.price)} · 购买 1 张`}</button><small>行囊：${count(data.wallet?.coins)} 金币 · ${count(data.wallet?.diamonds)} 钻石<br>购券不是开奖，买好后再按自己的心情拆开。${roundSummary()?`<br>${roundSummary()}`:''}</small></section>
        ${starGiftsHTML()}${oddsHTML(item)}${sourcesHTML(item)}${historyHTML()}<p class="lottery-rest-note">惊喜是额外的小礼，学习的收获已经属于你。</p>
      </aside></div>${collectionHTML(item)}
    </section>`;
    if(html===markup)return;
    host.innerHTML=html;markup=html;
    for(const id of openDetails){const node=host.querySelector(`[data-lottery-details="${id}"]`);if(node)node.open=true;}
    if(focus&&visible())host.querySelector(`[data-lottery-focus="${focus}"]`)?.focus({preventScroll:true});
  }
  async function load(){
    if(loading)return;loading=true;loadError='';paint();
    try{const result=await bridge.api('/api/lottery');if(!valid(result))throw new Error('机器暂时没有完整亮起，请再连接一次。');accept(result);}
    catch(e){loadError=e?.message||'暂时连接不到机器，请稍后再试。';}
    finally{loading=false;paint();}
  }
  function requestId(){
    if(typeof root.crypto?.randomUUID==='function')return root.crypto.randomUUID();
    if(typeof root.crypto?.getRandomValues!=='function')throw new Error('暂时无法确认本次操作，请重新打开软件再试。');
    const bytes=root.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function validOutcome(result,operation){
    if(result?.machine!==operation.machine)return false;
    if(operation.action==='buy')return result.type==='ticket'&&result.amount===1;
    if(operation.action==='star-gift')return result.type==='starGift'&&result.day===operation.day&&result.index===operation.index;
    if(result.type==='item')return Boolean(result.item&&/^[a-z0-9-]+$/.test(result.item.id||'')&&typeof result.item.name==='string');
    const amount=result.type==='coins'?result.coins:result.type==='diamonds'?result.diamonds:null;
    return typeof amount==='number'&&Number.isInteger(amount)&&amount>0;
  }
  async function mutate(action,confirm=false,gift=null){
    if(busy||!visible()||!['draw','buy','star-gift'].includes(action))return;
    if(confirm){if(!retry||retry.action!==action)return;}
    else if(retry||(action==='draw'?!canDraw():action==='buy'?!canBuy():!pendingGifts().some(row=>row.day===gift?.day&&row.index===gift?.index)))return;
    try{busy=confirm?retry:{machine,action,requestId:requestId(),...(action==='star-gift'?{day:gift.day,index:gift.index}:{})};}catch(e){error=e.message;paint();return;}
    const operation=busy;retry=operation;error='';loadError='';bridge.unlock?.();paint();
    try{
      const payload=action==='star-gift'?{day:operation.day,index:operation.index,requestId:operation.requestId}:{machine:operation.machine,requestId:operation.requestId};
      const result=await bridge.api(`/api/lottery/${action}`,payload);
      const outcome=result?.result;
      if(!valid(result?.lottery)||!result?.quests||!validOutcome(outcome,operation)||(action==='star-gift'&&!result.lottery.starGifts?.some(row=>row.day===operation.day&&row.index===operation.index&&row.machine===operation.machine&&row.claimed===true)))throw new Error('这份礼物的回执还没有完整送到，请确认上次操作。');
      accept(result.lottery);retry=null;
      if(action==='draw')results.set(operation.machine,outcome);
      if(bridge.acceptReceipt)bridge.acceptReceipt(result);else bridge.acceptQuests?.(result.quests);
      if(!announced.has(operation.requestId)){
        announced.add(operation.requestId);if(announced.size>96)announced.delete(announced.values().next().value);
        if(!result.alreadyProcessed&&visible()&&machine===operation.machine)bridge.playSound?.(action==='buy'?'purchase':outcome.limited||outcome.rarity==='jackpot'?'victory':'delivery',{key:`lottery:${operation.requestId}`});
        bridge.toast?.(action==='buy'?`${labels[operation.machine].ticket}已收好`:action==='star-gift'?`拾星 · 第 ${operation.index} 份星礼已打开`:`${labels[operation.machine].name} · ${resultTitle(outcome)}`,action==='star-gift'?`+1 ${labels[operation.machine].ticket} · 星礼的金币与钻石奖励不重复结算。`:action==='buy'?`${number(outcome.price?.coins)||number(outcome.price?.diamonds)?`已使用 ${cost(outcome.price)}。`:''}抽奖券会一直保留，想拆开时再来。`:outcome.type==='item'?'新物品已永久加入收藏。':'这份小礼已经记进行囊。');
      }
    }catch(e){
      if(Number(e?.status)>=400&&Number(e.status)<500&&Number(e.status)!==408&&Number(e.status)!==429)retry=null;
      error=e?.message||'结果暂时没有送到，确认上次操作即可，不会再用一张券。';
      if(!host)bridge.toast?.('机器替你保留着上次操作',error,true);
    }finally{busy=null;paint();}
    try{await bridge.refresh?.(true);}catch{/* The receipt remains authoritative if the next refresh is unavailable. */}
  }
  function click(event){
    if(event.defaultPrevented||(event.button!==undefined&&event.button!==0)||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!visible())return;
    const node=event.target?.closest?.('[data-lottery-action]');if(!node||!host.contains(node))return;
    const action=node.dataset.lotteryAction;event.preventDefault();
    if(action==='reload'){void load();return;}
    if(action==='collection'){bridge.showShop?.((results.get(machine)||data?.history?.find(row=>row.machine===machine)?.result)?.item?.slot);return;}
    if(action==='retry'){if(retry)void mutate(retry.action,true);return;}
    if(action==='star-gift'){void mutate(action,false,{day:node.dataset.lotteryDay,index:Number(node.dataset.lotteryIndex)});return;}
    if(action==='draw'||action==='buy')void mutate(action);
  }
  function render(next){
    if(!next)return;accept(next.lottery||next.quests?.lottery);paint();
  }
  function unmount(){if(host)host.removeEventListener('click',click);host=null;machine=null;markup='';error='';loadError='';}
  function mount(kind,container,next){
    if(!kinds.has(kind)||!container)return;
    render(next);
    if(host===container&&machine===kind){paint();return;}
    unmount();host=container;machine=kind;host.addEventListener('click',click);paint();void load();
  }
  function init(callbacks={}){bridge={...bridge,...callbacks};}
  function ticketText(grants){
    const counts={coin:0,diamond:0};for(const row of Array.isArray(grants)?grants:[])if(kinds.has(row?.machine))counts[row.machine]+=count(row.count);
    return Object.entries(counts).filter(([,amount])=>amount>0).map(([kind,amount])=>` · +${amount} ${labels[kind].ticket}`).join('');
  }
  root.FocusLottery={init,mount,render,unmount,ticketText};
})(typeof globalThis!=='undefined'?globalThis:this);
