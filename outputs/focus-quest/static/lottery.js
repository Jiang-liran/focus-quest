(function(root){
  'use strict';
  const kinds=new Set(['coin','diamond']);
  const campSlots=new Set(['camp','fire','tent','campgear','campglow','chatframe','camptrail','campmark']);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  const count=value=>Math.floor(number(value));
  const labels={coin:{name:'金币抽奖机',ticket:'金币抽奖券',currency:'金币'},diamond:{name:'钻石抽奖机',ticket:'钻石抽奖券',currency:'钻石'}};
  let bridge={},host=null,machine=null,data=null,markup='',loading=false,loadError='',busy=null,retry=null,error='',viewId=0,rulesDialog=null,rulesFocus='';
  const results=new Map(),announced=new Set(),previews=new Map(),pendingReveals=new Set();
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
  function purchaseLimit(item=model()){return Number.isSafeInteger(item?.purchaseLimit)&&item.purchaseLimit>=0?item.purchaseLimit:10;}
  function purchasesRemaining(item=model()){return Number.isSafeInteger(item?.purchasesRemaining)&&item.purchasesRemaining>=0?item.purchasesRemaining:Math.max(0,purchaseLimit(item)-count(item?.purchasesToday));}
  function canBuy(){const item=model();return Boolean(item&&!busy&&!retry&&item.canBuy===true&&count(item.purchasesToday)<purchaseLimit(item)&&purchasesRemaining(item)>0&&priceEnough(item));}
  function exchangeCost(item=model()){const value=item?.exchange?.cost;return Number.isInteger(value)&&value>0?value:0;}
  function canExchange(){return Boolean(exchangeCost()&&!busy&&!retry&&model()?.exchange?.canExchange===true&&Number.isInteger(data?.playTickets?.available)&&data.playTickets.available>=exchangeCost());}
  function canDraw(){return Boolean(model()?.canDraw===true&&number(data?.tickets?.[machine])>0&&!busy&&!retry);}
  function ticketArt(kind){
    return `<svg viewBox="0 0 78 52" aria-hidden="true" fill="none"><path d="M8 8h62v11a7 7 0 0 0 0 14v11H8V33a7 7 0 0 0 0-14Z" fill="${kind==='coin'?'#eacb83':'#c6b5f3'}"/><path d="M56 10v32" stroke="${kind==='coin'?'#807042':'#796698'}" stroke-dasharray="3 3"/><path d="M13 13h35v26H13z" stroke="${kind==='coin'?'#9d874f':'#9a80bd'}"/><path d="${kind==='coin'?'M30 18a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM30 21v10M27 23h6m-6 6h6':'m30 17 10 9-10 10-10-10 10-9Zm0 0-4 9 4 10 4-10-4-9Zm-10 9h20'}" stroke="${kind==='coin'?'#fff7cd':'#fcf3ff'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  }
  function cabinetArt(kind){
    const gold=kind==='coin',base=gold?'#46746c':'#685985',edge=gold?'#91d7b7':'#c4adf6',accent=gold?'#f1cd7f':'#c6b9ff';
    return `<svg class="lottery-cabinet" viewBox="0 0 280 210" aria-hidden="true" fill="none"><ellipse cx="140" cy="192" rx="76" ry="10" fill="#070e1c" opacity=".3"/><path d="m85 61 23-19h75l17 19v119l-19 15H85Z" fill="${base}"/><path d="m200 61-19 14v120l19-15Z" fill="#151f34" opacity=".45"/><path d="M85 61h96v134H85Z" stroke="${edge}" stroke-opacity=".55" stroke-width="2"/><path d="M80 60h108l14 10H92Z" fill="${edge}" opacity=".8"/><rect x="99" y="81" width="67" height="64" rx="21" fill="#172737" stroke="${accent}" stroke-width="2"/><path d="M108 89q20-10 42-1" stroke="#f5fff8" stroke-width="4" stroke-linecap="round" opacity=".16"/><g class="lottery-orbs"><circle cx="114" cy="123" r="9" fill="${edge}"/><circle cx="137" cy="131" r="10" fill="${accent}"/><circle cx="152" cy="116" r="8" fill="${gold?'#dfacac':'#82cabd'}"/><circle cx="130" cy="108" r="8" fill="${gold?'#d6a260':'#928ed4'}"/><path d="m132 88 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="${accent}"/></g><path d="M96 154h78v17H96z" fill="#172434"/><circle cx="114" cy="162" r="5" fill="${accent}"/><path d="M127 160h34m-34 5h25" stroke="${edge}" stroke-width="2" stroke-linecap="round"/><path d="M111 179h43v8h-43Z" fill="#101d2e"/><path d="M121 179h23" stroke="${accent}" stroke-width="2"/><path d="m48 65 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm182 73 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="${edge}" opacity=".75"/><path d="m212 44 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="${accent}"/><path d="M108 47h55" stroke="${accent}" stroke-width="3" stroke-linecap="round"/><text x="132" y="73" text-anchor="middle" fill="#f4edda" font-size="8" letter-spacing="2">${gold?'GOLDEN LUCK':'MOONLIGHT'}</text></svg>`;
  }
  function resultArt(result,scope='result'){
    if(result.type==='item'&&/^[a-z0-9-]+$/.test(result.item?.id||'')){
      try{
        // SVG previews allocate unique gradient IDs. Keep each mounted preview
        // stable, with separate IDs for the result and the collection below it.
        const key=JSON.stringify([scope,result.item.id,result.item.slot]);
        let art=previews.get(key);
        if(art){previews.delete(key);previews.set(key,art);}
        else{
          art=campSlots.has(result.item.slot)?root.FocusCampfireShopArt?.preview?.(result.item.id):root.ShopArt?.preview?.(result.item.id);
          if(art){previews.set(key,art);if(previews.size>64)previews.delete(previews.keys().next().value);}
        }
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
    const result=results.get(machine);
    if(busy?.action==='draw'&&busy.machine===machine&&busy.viewId===viewId)return `<div class="lottery-stage is-opening" role="status"><div class="lottery-sealed-orb" aria-hidden="true"><i></i><b>✦</b><i></i></div><h3>正在打开这份惊喜…</h3><p>用掉一张券，收下一份礼物。</p></div>`;
    if(!result)return `<div class="lottery-stage is-idle">${cabinetArt(machine)}<h3>${machine==='coin'?'把小小的努力，换成一份惊喜。':'月光里，藏着另一种幸运。'}</h3><p>投入一张${labels[machine].ticket}，打开一次。</p></div>`;
    const rarity=['ordinary','rare','jackpot'].includes(result.rarity)?result.rarity:'ordinary';
    return `<div class="lottery-stage is-result ${rarity}${result.limited?' is-limited':''}" role="status" aria-live="polite"><span class="lottery-result-eyebrow">${result.pityTriggered?'如约而来的限定惊喜':result.limited?'只有这里，才会遇见':rarity==='jackpot'?'闪耀的惊喜':result.type==='item'?'新的收藏':rarity==='rare'?'幸运的小礼':'你的抽奖结果'}</span><div class="lottery-result-art" aria-hidden="true">${resultArt(result)}</div><h3>${esc(resultTitle(result))}</h3><p>${result.type==='item'?esc(result.item?.description||'已永久加入收藏，喜欢的话可以去换上。'):'已经收进你的行囊。'}${result.fallback?result.limited?' 限定藏品已集齐，本次换成限定补给。':' 藏品池已集齐，本次换成货币补给。':''}</p>${result.limited&&!result.fallback?'<span class="lottery-limited-stamp">抽奖限定 · 无法购买</span>':''}${result.type==='item'?'<button type="button" class="lottery-quiet" data-lottery-action="collection" data-lottery-focus="collection">去看看收藏 ↗</button>':''}</div>`;
  }
  const percent=value=>number(value).toLocaleString('zh-CN',{maximumFractionDigits:3});
  function ruleLink(kind){
    return `<button type="button" class="lottery-info-link" data-lottery-action="rules" data-lottery-rule="${kind}" data-lottery-focus="rules-${kind}" aria-haspopup="dialog"><strong>${kind==='odds'?'每一份惊喜，都有明确的概率':'抽奖券从哪里来'}</strong><span>${kind==='odds'?'开奖规则':'学习与奖励'} ↗</span></button>`;
  }
  function oddsHTML(item){
    const average=value=>`${number(value?.coins).toLocaleString('zh-CN',{maximumFractionDigits:2})} 金币、${number(value?.diamonds).toLocaleString('zh-CN',{maximumFractionDigits:3})} 钻石`;
    const odds=item.odds||[],currencies=odds.filter(odd=>['coins','diamonds'].includes(odd.type)),items=odds.filter(odd=>!['coins','diamonds'].includes(odd.type));
    const ordinaryPercent=items.filter(odd=>['coinItem','diamondItem'].includes(odd.type)).reduce((sum,odd)=>sum+number(odd.percent),0);
    const limitedPercent=items.filter(odd=>odd.type==='lotteryOnly').reduce((sum,odd)=>sum+number(odd.percent),0);
    const currencyCards=currencies.map(odd=>{
      const unit=odd.type==='coins'?'金币':'钻石';
      const bands=(Array.isArray(odd.amountBands)?odd.amountBands:[]).filter(band=>Number.isInteger(band.min)&&Number.isInteger(band.max)&&band.min>0&&band.max>=band.min&&typeof band.percent==='number'&&Number.isFinite(band.percent)&&band.percent>0&&band.percent<=100);
      return `<section class="lottery-rule-currency ${odd.type}"><header><div><span class="lottery-rule-step">先决定奖励种类</span><h3>${esc(odd.label)}</h3></div><strong>${percent(odd.percent)}<small>%</small></strong></header><p class="lottery-band-caption">抽到${unit}之后，再决定数量</p>${bands.length?`<table class="lottery-band-table"><caption>已抽到${unit}时的数量分布</caption><thead><tr><th scope="col">${unit}数量</th><th scope="col">数量概率</th></tr></thead><tbody>${bands.map((band,index)=>`<tr${index===bands.length-1?' class="is-grand"':''}><td>${count(band.min)}${band.min===band.max?'':`–${count(band.max)}`} <small>${unit}</small></td><td>${percent(band.percent)}%</td></tr>`).join('')}</tbody></table>`:`<p class="lottery-rule-legacy">${count(odd.min)}—${count(odd.max)} ${unit}${odd.typical?` · ${esc(odd.typical)}`:''}</p>`}</section>`;
    }).join('');
    const itemRows=items.map(odd=>`<li><div><strong>${esc(odd.label)}</strong><b>${percent(odd.percent)}%</b></div><p>${odd.type==='coinItem'?`未拥有的金币藏品 · ${count(item.pool?.coinItems)} 款可抽`:odd.type==='diamondItem'?`未拥有的钻石藏品 · ${count(item.pool?.diamondItems)} 款可抽`:odd.type==='lotteryOnly'?`无法购买的限定藏品 · ${count(item.pool?.lotteryOnlyItems)} / ${count(item.pool?.lotteryOnlyTotal)} 款待收集`:''}${odd.fallback?` · 集齐后换成 ${money(odd.fallback)}`:''}</p></li>`).join('');
    return `<p class="lottery-dialog-intro">每抽先决定奖励种类；抽到货币后，再按对应分布决定数量。这是两层概率，各自合计为 100%。</p><div class="lottery-currency-grid">${currencyCards}</div><section class="lottery-rule-section"><div class="lottery-rule-section-heading"><h3>外观与收藏</h3><span>普通 ${percent(ordinaryPercent)}% · 限定 ${percent(limitedPercent)}%</span></div><ul class="lottery-odds">${itemRows}</ul><p class="lottery-fineprint">普通商品基础概率 ${percent(ordinaryPercent)}%，抽奖限定 ${percent(limitedPercent)}%，合计 ${percent(ordinaryPercent+limitedPercent)}%。奖池集齐后，对应结果转换为货币补给。</p><p class="lottery-fineprint">全部普通付费商品均可抽。金币机可抽金币商品与钻石商品，钻石机可抽钻石商品；抽奖限定藏品仍在独立限定奖池中。藏品不重复，抽中后永久拥有；装备由你自己决定。</p></section>${item.pity?`<section class="lottery-rule-guarantee"><span>限定保底</span><h3>${count(item.pity.limit)} 抽内，必定遇见限定惊喜</h3><p>两台机器分别累计，跨天与重启保留。提前遇见限定奖品，保底重新累计。</p><p>以上为未触发保底时的基础概率；到保底抽次，限定奖品概率为 100%。限定已集齐时，换成${machine==='coin'?'120 金币':'8 钻石'}限定补给。</p></section>`:''}${item.currencyExpected?`<section class="lottery-rule-expectation"><h3>长期平均货币回报</h3><dl><div><dt>仍有未拥有的藏品</dt><dd>${average(item.currencyExpected)}</dd></div>${item.fullPoolCurrencyExpected?`<div><dt>藏品全部集齐后</dt><dd>${average(item.fullPoolCurrencyExpected)}</dd></div>`:''}</dl><p>包含少见的大礼与保底补给；不计藏品价值，也不是下一抽的承诺。</p></section>`:''}`;
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
    return `<section class="lottery-collection" aria-labelledby="lottery-collection-title"><header><div><span class="lottery-eyebrow">ONLY HERE · 只在这台机器里</span><h3 id="lottery-collection-title">${machine==='coin'?'金色奇遇藏品':'月光限定藏品'}</h3></div><span>${owned} / ${items.length} 已收藏</span></header><p>这些外观无法购买，每次抽中都会是一件未拥有的。拿到后可以一直留着。</p><div class="lottery-collection-grid">${items.map(row=>`<article class="lottery-collection-card${row.owned?' is-owned':''}" title="${esc(row.description||row.name)}"><div class="lottery-collection-art" aria-hidden="true">${resultArt({type:'item',item:row},'collection')}</div><span class="lottery-collection-status">${row.owned?'✓ 已收藏':'✦ 等待相遇'}</span><h4>${esc(row.name)}</h4><p>${esc(row.description||'只在这里，等待下一次相遇。')}</p></article>`).join('')}</div></section>`;
  }
  function roundSummary(){
    const rounds=data?.roundTickets;
    if(!Number.isInteger(rounds?.totalRounds)||rounds.totalRounds<0||!Number.isInteger(rounds?.roundsToNextDiamond)||rounds.roundsToNextDiamond<1||rounds.roundsToNextDiamond>3)return '';
    return `普通委托累计交付 ${rounds.totalRounds} 轮 · 再交付 ${rounds.roundsToNextDiamond} 轮，得 1 张钻石抽奖券。`;
  }
  function sourcesHTML(item){
    const sources=machine==='coin'?[
      ['完整委托','普通委托每交付完整 1 轮：1 张。数学、408 每轮 60 分钟，政治、英语每轮 30 分钟。'],
      ['学科礼盒','每科当日目标完成，打开该科岛屿礼盒：1 张。'],
      ['单科首轮','领取每科当日首轮加赠：1 张。四科各领一次，每天最多 4 张；与完整委托赠券分别计算。'],
      ['融会贯通','领取知行研习所「融会贯通」额外奖赏：1 张金币抽奖券 ＋ 1 张钻石抽奖券，一起收好。'],
      ['拾星星礼','「拾星」第 1、2 份星礼各 1 张，第 3—6 份各 2 张。每天最多 6 份星礼；打开混合礼盒时，两种券会一起收好。']
    ]:[
      ['完整委托','四科普通委托合计每交付完整 3 轮：1 张。可连续学习同一科，也可自由搭配科目。'],
      ['主岛礼盒','总目标与四科目标都完成，打开主岛礼盒：1 张。'],
      ['融会贯通','领取知行研习所「融会贯通」额外奖赏：1 张金币抽奖券 ＋ 1 张钻石抽奖券，一起收好。'],
      ['拾星星礼','「拾星」第 2、3 份星礼各 1 张，第 4—6 份各 2 张。达标后每额外学习 30 分钟备好一份，每日最多 6 份；同盒的金币券会一起收好。'],
      ['上午首轮','同一学习日的数学、政治首轮加赠都领取：1 张。'],
      ['下午首轮','同一学习日的 408、英语首轮加赠都领取：1 张。上午、下午各一次，每天最多 2 张。']
    ];
    return `<p class="lottery-dialog-intro">专注带来的小票，可以留到想拆礼物的时候。以下奖励领取时会一起收好${labels[machine].ticket}。</p><section class="lottery-rule-section"><div class="lottery-rule-section-heading"><h3>随学习获得</h3><span>每次领取，都有迹可循</span></div><ol class="lottery-source-cards">${sources.map(([title,text],index)=>`<li><span class="lottery-source-index">${String(index+1).padStart(2,'0')}</span><div><h4>${esc(title)}</h4><p>${esc(text)}</p></div></li>`).join('')}</ol></section>${exchangeCost(item)?`<section class="lottery-rule-guarantee lottery-rule-exchange"><span>把游玩券留给幸运</span><h3>${exchangeCost(item)} 张游玩券，换 1 张${labels[machine].ticket}</h3><p>累计游玩券 ${count(data?.playTickets?.available)} 张。游玩券与抽奖券都会跨日永久保留。</p><p>兑换不限次数，不占用每日购券额度，也不会自动开奖。剩余游玩券仍可用于游戏；游玩次数与游戏奖励仍按日限制。</p></section>`:''}<section class="lottery-rule-guarantee"><span>也可以给幸运留一张小票</span><h3>${cost(item.price)} 换 1 张</h3><p>${cost(item.price)}购买 1 张，每天最多购买 ${purchaseLimit(item)} 张。</p><p>今日已买 ${count(item.purchasesToday)} / ${purchaseLimit(item)} 张 · 剩余 ${purchasesRemaining(item)} 次。回到机器旁即可购买，购券不会自动开奖。</p></section><section class="lottery-rule-section lottery-ticket-notes"><h3>收好以后，慢慢拆</h3><p>抽奖券永久保留，两种券各用各的。首轮赠券按学习发生日归属；同一天、同一科和同一时段组合都只结算一次，晚些领取也不会重复发券。</p><p>普通委托的轮次与不足一轮的余量，跨天、重启都会保留；旧时已经交付的完整轮次不补发。更新前已经入袋的券会保留，历史首轮与补领以实际交付提示为准。</p></section>`;
  }
  function closeRules(refresh=true){
    const dialog=rulesDialog,focus=rulesFocus;rulesDialog=null;rulesFocus='';
    if(dialog){dialog.removeEventListener('click',ruleClick);dialog.removeEventListener('cancel',ruleCancel);dialog.removeEventListener('close',ruleClosed);dialog.removeEventListener('keydown',ruleKey);if(dialog.open)dialog.close();dialog.remove();}
    if(refresh){paint();if(focus&&visible())host.querySelector(`[data-lottery-focus="${focus}"]`)?.focus({preventScroll:true});}
  }
  function ruleClosed(){closeRules();}
  function ruleCancel(event){event.preventDefault();closeRules();}
  function ruleClick(event){
    const dialog=rulesDialog;if(!dialog)return;
    if(event.target?.closest?.('[data-lottery-close]')){closeRules();return;}
    if(event.target===dialog){const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeRules();}
  }
  function ruleKey(event){
    if(event.key==='Escape'){event.preventDefault();closeRules();return;}
    if(event.key!=='Tab'||!rulesDialog)return;
    const buttons=Array.from(rulesDialog.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
    const first=buttons[0],last=buttons[buttons.length-1];
    if(first&&((event.shiftKey&&document.activeElement===first)||(!event.shiftKey&&document.activeElement===last))){event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});}
  }
  function openRules(kind){
    const item=model();if(!item||rulesDialog||!['odds','sources'].includes(kind)||!visible()||document.querySelector?.('dialog[open]'))return;
    const dialog=document.createElement('dialog');dialog.className=`lottery-rules-dialog ${machine}`;dialog.setAttribute('aria-labelledby','lottery-rules-title');
    dialog.innerHTML=`<header class="lottery-dialog-heading"><div class="lottery-dialog-icon" aria-hidden="true">${ticketArt(machine)}</div><div><span class="lottery-eyebrow">${labels[machine].name} · ${kind==='odds'?'每份惊喜都有来处':'学习带来的小幸运'}</span><h2 id="lottery-rules-title">${kind==='odds'?'开奖规则':'抽奖券从哪里来'}</h2></div><button type="button" class="lottery-dialog-close" data-lottery-close aria-label="关闭${kind==='odds'?'开奖规则':'抽奖券来源'}" autofocus>×</button></header><div class="lottery-dialog-body">${kind==='odds'?oddsHTML(item):sourcesHTML(item)}</div><footer class="lottery-dialog-footer"><span>两种抽奖券分别使用 · 结果自动保存</span><button type="button" data-lottery-close>知道了</button></footer>`;
    rulesDialog=dialog;rulesFocus=`rules-${kind}`;host.appendChild(dialog);
    dialog.addEventListener('click',ruleClick);dialog.addEventListener('cancel',ruleCancel);dialog.addEventListener('close',ruleClosed);dialog.addEventListener('keydown',ruleKey);
    try{dialog.showModal();dialog.querySelector('[data-lottery-close]')?.focus({preventScroll:true});}catch{closeRules();}
  }
  function exchangeHTML(item){
    const amount=exchangeCost(item);if(!amount)return '';
    const available=count(data?.playTickets?.available),waiting=busy?.action==='exchange'&&busy.machine===machine;
    return `<section class="lottery-exchange" aria-labelledby="lottery-exchange-title"><div class="lottery-exchange-heading"><span class="lottery-eyebrow">把留存的小票，换成一份期待</span><span class="lottery-play-balance">累计游玩券 <b>${available}</b> 张</span></div><div class="lottery-exchange-route"><span><b>${amount}</b> 张游玩券</span><i aria-hidden="true">⇢</i><span><b>1</b> 张${labels[machine].ticket}</span></div><h3 id="lottery-exchange-title" class="lottery-exchange-caption">游玩券也可以留给幸运</h3><button type="button" data-lottery-action="exchange" data-lottery-focus="exchange" aria-disabled="${!canExchange()}"${waiting?' aria-busy="true"':''}>${waiting?'正在兑换…':available<amount?`还差 ${amount-available} 张游玩券`:`用 ${amount} 张游玩券兑换`}</button><p>游玩券永久保留 · 兑换不限次数<br>收好抽奖券，再按自己的心情开奖。</p></section>`;
  }
  function giftTicketCounts(row){
    const tickets=row?.lotteryTickets;
    if(tickets!==undefined)return ['coinTickets','diamondTickets'].every(key=>Number.isSafeInteger(tickets?.[key])&&tickets[key]>=0)&&tickets.coinTickets+tickets.diamondTickets>0?{coinTickets:tickets.coinTickets,diamondTickets:tickets.diamondTickets}:null;
    return kinds.has(row?.machine)&&Number.isInteger(row.index)&&row.index>=1&&row.index<=4?{coinTickets:row.machine==='coin'?1:0,diamondTickets:row.machine==='diamond'?1:0}:null;
  }
  function giftTicketSummary(tickets){return [['coinTickets','金币抽奖券'],['diamondTickets','钻石抽奖券']].filter(([key])=>tickets?.[key]>0).map(([key,label])=>`${count(tickets[key])} 张${label}`).join(' · ');}
  function sameGiftTickets(a,b){return a!==null&&b!==null&&a.coinTickets===b.coinTickets&&a.diamondTickets===b.diamondTickets;}
  function pendingGifts(){return (data?.starGifts||[]).filter(row=>row?.claimed===false&&/^\d{4}-\d{2}-\d{2}$/.test(row.day)&&Number.isInteger(row.index)&&row.index>=1&&row.index<=6&&kinds.has(row.machine)&&giftTicketCounts(row)?.[machine==='coin'?'coinTickets':'diamondTickets']>0);}
  function starGiftsHTML(){
    const rows=pendingGifts();if(!rows.length)return '';
    return `<section class="lottery-star-gifts" aria-label="拾星留存的星礼"><h3>拾星为你留下的星礼</h3><p>余辉的货币奖励已结算；任一机器打开一次，同盒的两种抽奖券会一起收好。</p>${rows.slice(0,12).map(row=>`<div><span>${esc(row.day)} · 第 ${row.index} 份星礼<br><small>内含 ${esc(giftTicketSummary(giftTicketCounts(row)))}</small></span><button type="button" data-lottery-action="star-gift" data-lottery-day="${row.day}" data-lottery-index="${row.index}" data-lottery-focus="star-${row.day}-${row.index}" aria-disabled="${Boolean(busy||retry)}">${busy?.action==='star-gift'&&busy.day===row.day&&busy.index===row.index?'正在打开…':'开启星礼'}</button></div>`).join('')}${rows.length>12?`<small>还有 ${rows.length-12} 份，打开这些后即可继续查看。</small>`:''}</section>`;
  }
  function historyHTML(){
    const rows=(data?.history||[]).filter(row=>row.machine===machine).slice(0,4);
    return rows.length?`<div class="lottery-history"><h3>最近拆开的礼物</h3><ul>${rows.map(row=>`<li><span>${esc(resultTitle(row.result||{}))}</span><small>${Number.isFinite(Date.parse(row.drawnAt))?esc(new Date(row.drawnAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})):'已收好'}</small></li>`).join('')}</ul></div>`:'';
  }
  function paint(){
    if(!host||!machine||rulesDialog?.open)return;
    const item=model(),focus=host.contains(document.activeElement)?document.activeElement?.closest?.('[data-lottery-focus]')?.dataset.lotteryFocus:null;
    let html;
    if(!item)html=`<section class="lottery-room ${machine}" aria-label="${labels[machine].name}"><div class="lottery-loading" role="status">${ticketArt(machine)}<h2>${labels[machine].name}</h2><p>${loading?'正在亮起机器…':esc(loadError||'机器暂时没有响应。')}</p>${loading?'':'<button type="button" data-lottery-action="reload" data-lottery-focus="reload">重新连接</button>'}</div></section>`;
    else html=`<section class="lottery-room ${machine}" aria-labelledby="lottery-title">
      <header class="lottery-heading"><div><span class="lottery-eyebrow">${machine==='coin'?'GOLDEN LUCK · 路边的小幸运':'MOONLIGHT · 收藏的另一种可能'}</span><h2 id="lottery-title">${esc(item.name||labels[machine].name)}</h2><p>只用${labels[machine].ticket}开奖 · 结果自动保存</p></div><div class="lottery-ticket-wallet">${ticketArt(machine)}<span>${labels[machine].ticket}<strong>${count(data.tickets[machine])} <small>张</small></strong></span></div></header>
      ${pityHTML(item)}
      <div class="lottery-layout"><div class="lottery-main">${resultHTML()}
        <div class="lottery-draw"><button type="button" class="lottery-draw-button" data-lottery-action="draw" data-lottery-focus="draw" aria-disabled="${!canDraw()}"${busy?.action==='draw'?' aria-busy="true"':''}>${busy?.action==='draw'?'正在打开…':number(data.tickets[machine])>0?'投入 1 张券 · 打开惊喜':'还没有抽奖券'}</button><small>每次消耗 1 张${labels[machine].ticket}；进入这里不会消耗。</small></div>
        <div class="lottery-status" role="status" ${error||loadError||retry?'':'hidden'}>${esc(error||loadError||'上次操作需要确认，请先收好它的结果。')}${retry&&!busy?`<button type="button" data-lottery-action="retry" data-lottery-focus="retry">确认上次${retry.action==='draw'?'抽奖':retry.action==='star-gift'?'开礼盒':retry.action==='exchange'?'兑换':'购券'}</button>`:''}</div>
      </div><aside class="lottery-aside">
        <section class="lottery-purchase" aria-labelledby="lottery-purchase-title"><div><span class="lottery-eyebrow">给幸运留一张小票</span><h3 id="lottery-purchase-title">${cost(item.price)} 换 1 张</h3><p>今日已买 ${count(item.purchasesToday)} / ${purchaseLimit(item)} 张 · 剩余 ${purchasesRemaining(item)} 次</p></div><button type="button" data-lottery-action="buy" data-lottery-focus="buy" aria-disabled="${!canBuy()}"${busy?.action==='buy'?' aria-busy="true"':''}>${busy?.action==='buy'?'正在收好…':!purchasesRemaining(item)?'今日已买满':!priceEnough(item)?`${labels[machine].currency}暂时不足`:`${cost(item.price)} · 购买 1 张`}</button><small>行囊：${count(data.wallet?.coins)} 金币 · ${count(data.wallet?.diamonds)} 钻石<br>购券不是开奖，买好后再按自己的心情拆开。${roundSummary()?`<br>${roundSummary()}`:''}</small></section>
        ${exchangeHTML(item)}${starGiftsHTML()}${ruleLink('odds')}${ruleLink('sources')}${historyHTML()}<p class="lottery-rest-note">惊喜是额外的小礼，学习的收获已经属于你。</p>
      </aside></div>${collectionHTML(item)}
    </section>`;
    if(html===markup)return;
    host.innerHTML=html;markup=html;
    if(pendingReveals.has(machine)&&!busy&&visible()){
      const stage=host.querySelector('.lottery-stage.is-result');
      if(stage){
        if(!document.documentElement?.classList.contains('no-motion')&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches)stage.classList.add('is-revealing');
        pendingReveals.delete(machine);
      }
    }
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
    if(operation.action==='star-gift')return result?.type==='starGift'&&result.day===operation.day&&result.index===operation.index&&result.machine===(operation.giftMachine||operation.machine);
    if(result?.machine!==operation.machine)return false;
    if(operation.action==='exchange')return result.type==='ticket'&&result.amount===1&&result.source==='playTicketExchange'&&result.playTicketsSpent===operation.exchangeCost;
    if(operation.action==='buy')return result.type==='ticket'&&result.amount===1;
    if(result.type==='item')return Boolean(result.item&&/^[a-z0-9-]+$/.test(result.item.id||'')&&typeof result.item.name==='string');
    const amount=result.type==='coins'?result.coins:result.type==='diamonds'?result.diamonds:null;
    return typeof amount==='number'&&Number.isInteger(amount)&&amount>0;
  }
  function validStarReceipt(result,operation){
    const claimed=result.lottery?.starGifts?.find(row=>row.day===operation.day&&row.index===operation.index&&row.machine===(operation.giftMachine||operation.machine)&&row.claimed===true);
    if(!claimed)return false;
    if(!operation.giftModern)return true;
    if(result.alreadyProcessed===true&&result.result.lotteryTickets===undefined)return true;
    if(result.result.lotteryTickets===undefined||claimed.lotteryTickets===undefined)return false;
    const actual=giftTicketCounts(result.result),saved=giftTicketCounts(claimed);
    if(!sameGiftTickets(actual,saved))return false;
    if(result.alreadyProcessed===true)return true;
    if(!sameGiftTickets(actual,operation.giftTickets))return false;
    const granted={coinTickets:0,diamondTickets:0};
    for(const row of Array.isArray(result.ticketGrants)?result.ticketGrants:[]){if(!kinds.has(row?.machine)||!Number.isSafeInteger(row.count)||row.count<1)return false;granted[row.machine==='coin'?'coinTickets':'diamondTickets']+=row.count;}
    return sameGiftTickets(actual,granted);
  }
  async function mutate(action,confirm=false,gift=null){
    if(busy||rulesDialog?.open||!visible()||!['draw','buy','star-gift','exchange'].includes(action))return;
    if(confirm){if(!retry||retry.action!==action)return;}
    else if(retry||(action==='draw'?!canDraw():action==='buy'?!canBuy():action==='exchange'?!canExchange():!pendingGifts().some(row=>row.day===gift?.day&&row.index===gift?.index)))return;
    const giftEntry=action==='star-gift'&&!confirm?pendingGifts().find(row=>row.day===gift?.day&&row.index===gift?.index):null;
    try{busy=confirm?{...retry,viewId}:{machine,action,viewId,requestId:requestId(),...(action==='exchange'?{exchangeCost:exchangeCost()}:{}),...(action==='star-gift'?{day:gift.day,index:gift.index,giftMachine:giftEntry.machine,giftTickets:giftTicketCounts(giftEntry),giftModern:giftEntry.lotteryTickets!==undefined}:{})};}catch(e){error=e.message;paint();return;}
    const operation=busy,operationView=viewId;retry=operation;error='';loadError='';bridge.unlock?.();paint();
    try{
      const payload=action==='star-gift'?{day:operation.day,index:operation.index,requestId:operation.requestId}:{machine:operation.machine,requestId:operation.requestId};
      const result=await bridge.api(`/api/lottery/${action}`,payload);
      const outcome=result?.result;
      if(!valid(result?.lottery)||!result?.quests||!validOutcome(outcome,operation)||(action==='exchange'&&(!Number.isInteger(result.arcade?.available)||result.arcade.available<0||result.arcade.persistentTickets!==true||result.lottery.playTickets?.available!==result.arcade.available))||(action==='star-gift'&&!validStarReceipt(result,operation)))throw new Error('这份礼物的回执还没有完整送到，请确认上次操作。');
      accept(result.lottery);retry=null;
      if(action==='draw'&&host&&machine===operation.machine&&viewId===operationView)results.set(operation.machine,outcome);
      if(bridge.acceptReceipt)bridge.acceptReceipt(result);else bridge.acceptQuests?.(result.quests);
      if(!announced.has(operation.requestId)){
        if(action==='draw'&&visible()&&machine===operation.machine&&viewId===operationView)pendingReveals.add(operation.machine);
        announced.add(operation.requestId);if(announced.size>96)announced.delete(announced.values().next().value);
        if(!result.alreadyProcessed&&visible()&&machine===operation.machine&&viewId===operationView)bridge.playSound?.(action==='buy'||action==='exchange'?'purchase':outcome.limited||outcome.rarity==='jackpot'?'victory':'delivery',{key:`lottery:${operation.requestId}`});
        bridge.toast?.(action==='exchange'?`${labels[operation.machine].ticket}已兑换`:action==='buy'?`${labels[operation.machine].ticket}已收好`:action==='star-gift'?`拾星 · 第 ${operation.index} 份星礼已打开`:`${labels[operation.machine].name} · ${resultTitle(outcome)}`,action==='exchange'?`已使用 ${operation.exchangeCost} 张游玩券，收下 1 张${labels[operation.machine].ticket}。抽奖券永久保留。`:action==='star-gift'?`${result.alreadyProcessed?'这份星礼已经收好':ticketText(result.ticketGrants).replace(/^ · /,'')||giftTicketSummary(giftTicketCounts(outcome)||operation.giftTickets)} · 星礼的金币与钻石奖励不重复结算。`:action==='buy'?`${number(outcome.price?.coins)||number(outcome.price?.diamonds)?`已使用 ${cost(outcome.price)}。`:''}抽奖券会一直保留，想拆开时再来。`:outcome.type==='item'?'新物品已永久加入收藏。':'这份小礼已经记进行囊。');
      }
    }catch(e){
      if(Number(e?.status)>=400&&Number(e.status)<500&&Number(e.status)!==408&&Number(e.status)!==429)retry=null;
      error=e?.message||'结果暂时没有送到，确认上次操作即可，不会再次扣券。';
      if(!host)bridge.toast?.('机器替你保留着上次操作',error,true);
    }finally{busy=null;paint();}
    try{await bridge.refresh?.(true);}catch{/* The receipt remains authoritative if the next refresh is unavailable. */}
  }
  function click(event){
    if(event.defaultPrevented||(event.button!==undefined&&event.button!==0)||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!visible())return;
    const node=event.target?.closest?.('[data-lottery-action]');if(!node||!host.contains(node))return;
    const action=node.dataset.lotteryAction;event.preventDefault();
    if(action==='reload'){void load();return;}
    if(action==='collection'){bridge.showShop?.(results.get(machine)?.item?.slot);return;}
    if(action==='rules'){openRules(node.dataset.lotteryRule);return;}
    if(action==='retry'){if(retry)void mutate(retry.action,true);return;}
    if(action==='star-gift'){void mutate(action,false,{day:node.dataset.lotteryDay,index:Number(node.dataset.lotteryIndex)});return;}
    if(action==='draw'||action==='buy'||action==='exchange')void mutate(action);
  }
  function render(next){
    if(!next)return;accept(next.lottery||next.quests?.lottery);paint();
  }
  function finishReveal(event){
    if(event.animationName==='lottery-reveal'&&host?.contains(event.target))event.target.classList.remove('is-revealing');
  }
  function unmount(){
    closeRules(false);viewId++;results.clear();
    if(host){host.removeEventListener('click',click);host.removeEventListener('animationend',finishReveal);host.removeEventListener('animationcancel',finishReveal);}
    pendingReveals.clear();host=null;machine=null;markup='';error='';loadError='';
  }
  function mount(kind,container,next){
    if(!kinds.has(kind)||!container)return;
    render(next);
    if(host===container&&machine===kind){paint();return;}
    unmount();host=container;machine=kind;host.addEventListener('click',click);host.addEventListener('animationend',finishReveal);host.addEventListener('animationcancel',finishReveal);paint();void load();
  }
  function init(callbacks={}){bridge={...bridge,...callbacks};}
  function ticketText(grants){
    const counts={coin:0,diamond:0};for(const row of Array.isArray(grants)?grants:[])if(kinds.has(row?.machine))counts[row.machine]+=count(row.count);
    return Object.entries(counts).filter(([,amount])=>amount>0).map(([kind,amount])=>` · +${amount} ${labels[kind].ticket}`).join('');
  }
  root.FocusLottery={init,mount,render,unmount,ticketText};
})(typeof globalThis!=='undefined'?globalThis:this);
