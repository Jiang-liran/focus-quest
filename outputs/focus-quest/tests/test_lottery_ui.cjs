const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/lottery.js'),'utf8');
const css=fs.readFileSync(require.resolve('../static/lottery.css'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function lottery(patch={}){
  const state={day:'2026-09-30',revision:10,tickets:{coin:2,diamond:1},playTickets:{available:10,persistent:true},wallet:{coins:800,diamonds:20},history:[],shopExclusiveItemsExcluded:false,machines:[
    {id:'coin',exchange:{cost:2,canExchange:true},name:'金币抽奖机',ticketName:'金币抽奖券',price:{coins:80,diamonds:0},purchasesToday:0,purchaseLimit:10,purchasesRemaining:10,canBuy:true,canDraw:true,pool:{coinItems:200,diamondItems:80,exclusiveItems:0},currencyExpected:{coins:24.887,diamonds:.14},odds:[{type:'coins',label:'随机金币',percent:78,min:2,max:1000,typical:'85% 的金币结果为 2–45 金币'},{type:'diamonds',label:'随机钻石',percent:12,min:1,max:40},{type:'coinItem',label:'未拥有的金币商品',percent:9.5,fallback:{coins:35,diamonds:0}},{type:'diamondItem',label:'未拥有的钻石商品',percent:.5,fallback:{coins:0,diamonds:2}}]},
    {id:'diamond',exchange:{cost:4,canExchange:true},name:'钻石抽奖机',ticketName:'钻石抽奖券',price:{coins:0,diamonds:4},purchasesToday:0,purchaseLimit:10,purchasesRemaining:10,canBuy:true,canDraw:true,pool:{coinItems:0,diamondItems:80,exclusiveItems:0},currencyExpected:{coins:0,diamonds:1.893},odds:[{type:'diamonds',label:'随机钻石',percent:85,min:1,max:50},{type:'diamondItem',label:'未拥有的钻石商品',percent:15,fallback:{coins:0,diamonds:2}}]}
  ]};
  return {...state,...patch};
}
function outcome(kind='coin',patch={}){return {machine:kind,type:kind==='coin'?'coins':'diamonds',coins:kind==='coin'?25:0,diamonds:kind==='diamond'?2:0,item:null,rarity:'ordinary',fallback:false,...patch};}
function receipt(kind='coin',action='draw',patch={}){
  const data=lottery({revision:11,tickets:{coin:kind==='coin'&&action==='draw'?1:2,diamond:kind==='diamond'&&action==='draw'?0:1}});
  return {lottery:data,quests:{lottery:data,wallet:data.wallet},result:action==='draw'?outcome(kind):{type:'ticket',machine:kind,amount:1,price:data.machines.find(m=>m.id===kind).price},alreadyProcessed:false,now:'2026-09-30T19:00:00+08:00',...patch};
}
function limitedLottery(patch={}){
  const data=lottery(patch);
  for(const item of data.machines){
    item.pity={count:0,limit:item.id==='coin'?30:20,remaining:item.id==='coin'?30:20,allCollected:false};
    item.pool={...item.pool,lotteryOnlyItems:6,lotteryOnlyTotal:6};
    item.collection=Array.from({length:6},(_,i)=>({id:`relic-limited-${item.id}-${i}`,slot:'relic',name:`${item.id==='coin'?'金色':'月光'}限定 ${i+1}`,description:'无法购买的收藏。',lotteryOnly:true,lotteryMachine:item.id,owned:false}));
    item.odds[0].percent=item.id==='coin'?77.6:84.4;item.odds.push({type:'lotteryOnly',label:'抽奖限定藏品',percent:item.id==='coin'?.4:.6,fallback:item.id==='coin'?{coins:120,diamonds:0}:{coins:0,diamonds:8}});
    item.fullPoolCurrencyExpected={coins:item.id==='coin'?30:0,diamonds:item.id==='coin'?.17:2.4};
  }
  return data;
}
test('result categories follow the received reward rather than machine or celebration rarity',async()=>{
  for(const [machine,result,label] of [
    ['coin',{type:'item',item:{id:'island-gold',name:'金币陈设',coins:80,diamonds:0},rarity:'jackpot'},'金币商品'],
    ['coin',{type:'item',item:{id:'bar-diamond',name:'钻石流光',coins:0,diamonds:12},rarity:'rare'},'钻石商品'],
    ['diamond',{type:'item',item:{id:'bar-diamond',name:'钻石流光',coins:0,diamonds:12}},'钻石商品'],
    ['coin',{type:'item',item:{id:'bar-limited',name:'星辰',coins:0,diamonds:0,lotteryOnly:true},limited:true},'抽奖限定商品'],
    ['diamond',{type:'item',item:{id:'bar-limited',name:'星辰',coins:0,diamonds:0,lotteryOnly:true},limited:true,pityTriggered:true},'抽奖限定商品'],
    ['diamond',{type:'coins',coins:800,diamonds:0,rarity:'jackpot'},'随机金币'],
    ['coin',{type:'diamonds',coins:0,diamonds:2},'随机钻石']
  ]){
    const h=harness(limitedLottery(),machine);h.emit('draw');h.mutations()[0].resolve(receipt(machine,'draw',{result:outcome(machine,result)}));await h.flush();
    assert.match(h.host.innerHTML,new RegExp(`class="lottery-result-kind [^"]+">${label}</span>`));
    assert.equal(h.mutations().length,1);assert.equal(h.revealStarts,1);
  }
});
test('exhausted item pools show fixed supplies rather than an item or random currency',async()=>{
  for(const [machine,result,label] of [
    ['coin',{type:'coins',coins:35,diamonds:0,fallback:true},'商品奖池集齐补给 · 金币'],
    ['diamond',{type:'diamonds',coins:0,diamonds:2,fallback:true},'商品奖池集齐补给 · 钻石'],
    ['coin',{type:'coins',coins:120,diamonds:0,fallback:true,limited:true,pityTriggered:true},'限定藏品集齐补给 · 金币'],
    ['diamond',{type:'diamonds',coins:0,diamonds:8,fallback:true,limited:true,pityTriggered:true},'限定藏品集齐补给 · 钻石']
  ]){
    const h=harness(limitedLottery(),machine);h.emit('draw');h.mutations()[0].resolve(receipt(machine,'draw',{result:outcome(machine,result)}));await h.flush();
    assert.match(h.host.innerHTML,new RegExp(`class="lottery-result-kind supply">${label}</span>`));
    assert.doesNotMatch(h.host.innerHTML,/class="lottery-result-kind [^"]+">(?:抽奖限定商品|随机金币|随机钻石)<\/span>/);
  }
});
test('old result history retains categories without rewriting rewards or guessing unknown item prices',()=>{
  const initial=limitedLottery(),limited=initial.machines[0].collection[0];
  initial.history=[
    {machine:'coin',drawnAt:'2026-09-30T18:00:00+08:00',result:{type:'item',item:{id:limited.id,name:'旧限定'}}},
    {machine:'coin',drawnAt:'2026-09-30T18:01:00+08:00',result:{type:'item',item:{id:'older-item',name:'旧商品',coins:45,diamonds:0}}},
    {machine:'coin',drawnAt:'2026-09-30T18:02:00+08:00',result:{type:'item',item:{id:'unknown',name:'未知收藏'}}}
  ];
  const original=clone(initial),h=harness(initial);
  assert.match(h.host.innerHTML,/旧限定<span class="lottery-history-kind">抽奖限定商品<\/span>/);
  assert.match(h.host.innerHTML,/旧商品<span class="lottery-history-kind">金币商品<\/span>/);
  assert.match(h.host.innerHTML,/未知收藏<span class="lottery-history-kind">收藏商品<\/span>/);
  assert.deepEqual(initial,original);assert.equal(h.mutations().length,0);assert.equal(h.revealStarts,0);
});
function harness(initial=lottery(),kind='coin',shopArt=null){
  const document={hidden:false,activeElement:null};let active=true,unlocks=0,uuid=0,shops=0;
  let revealStarts=0;
  const requests=[],receipts=[],sounds=[],toasts=[],refreshes=[];
  class Element{
    constructor(parent=null,tag='div'){this.tagName=tag.toUpperCase();this.appended=[];this.open=false;this.parentElement=parent;this.dataset={};this.attributes={};this.listeners={};this.children=[];this.hidden=false;this.inert=false;this.writes=0;this._html='';
      this.classList={add:(name)=>{const classes=new Set((this.attributes.class||'').split(/\s+/));if(name==='is-revealing'&&!classes.has(name))revealStarts++;classes.add(name);this.attributes.class=[...classes].join(' ');},remove:name=>{this.attributes.class=(this.attributes.class||'').split(/\s+/).filter(value=>value!==name).join(' ');},contains:name=>(this.attributes.class||'').split(/\s+/).includes(name)};
    }
    set innerHTML(value){this._html=value;this.writes++;this.children=[];
      for(const [,tag,attrs] of value.matchAll(/<(button|details|div)\b([^>]+)>/g)){
        if(tag==='div'&&!/class="lottery-stage\b/.test(attrs))continue;
        const child=new Element(this,tag);
        for(const [,name,val] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)){child.attributes[name]=val;if(name.startsWith('data-'))child.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=val;}
        if(/(?:^|\s)data-lottery-close(?:\s|$)/.test(attrs))child.dataset.lotteryClose='';
        this.children.push(child);
      }
    }
    get innerHTML(){return this._html;}
    contains(node){return node===this||this.children.some(child=>child.contains(node))||this.appended.some(child=>child.contains(node));}
    closest(selector){const key=selector.match(/\[data-lottery-(focus|action|close)\]/)?.[1];if(key&&Object.hasOwn(this.dataset,`lottery${key[0].toUpperCase()}${key.slice(1)}`))return this;return this.parentElement?.closest(selector)||null;}
    querySelector(selector){if(selector.startsWith('.'))return this.children.find(n=>selector.slice(1).split('.').every(name=>n.classList.contains(name)))||null;if(selector==='[data-lottery-close]')return this.children.find(n=>Object.hasOwn(n.dataset,'lotteryClose'))||null;const [,type,value]=selector.match(/\[data-lottery-(focus|details)="([^"]+)"\]/)||[];return this.children.find(n=>n.dataset[`lottery${type?.[0].toUpperCase()}${type?.slice(1)}`]===value)||null;}
    querySelectorAll(selector){if(selector==='[data-lottery-details]')return this.children.filter(node=>node.dataset.lotteryDetails);if(selector.startsWith('button'))return this.children.filter(node=>node.tagName==='BUTTON'&&!Object.hasOwn(node.attributes,'disabled'));return [];}
    setAttribute(name,value){this.attributes[name]=value;}
    set className(value){this.attributes.class=value;}
    get className(){return this.attributes.class||'';}
    appendChild(node){node.parentElement=this;this.appended.push(node);return node;}
    remove(){if(this.parentElement)this.parentElement.appended=this.parentElement.appended.filter(node=>node!==this);this.parentElement=null;if(document.modal===this)document.modal=null;}
    showModal(){this.open=true;this.modalCalls=(this.modalCalls||0)+1;document.modal=this;}
    close(){this.open=false;for(const fn of this.listeners.close||[])fn({target:this});}
    getBoundingClientRect(){return {left:20,right:800,top:20,bottom:600};}
    focus(){document.activeElement=this;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    removeEventListener(type,fn){this.listeners[type]=(this.listeners[type]||[]).filter(value=>value!==fn);}
  }
  const parent=new Element(),host=new Element(parent);
  const context=vm.createContext({document,crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`},FocusRuntime:{isVisible:()=>active},ShopArt:shopArt||{preview:id=>`<svg data-preview="${id}"></svg>`}});
  document.documentElement=new Element();document.createElement=tag=>new Element(null,tag);document.querySelector=selector=>selector==='dialog[open]'&&document.modal?.open?document.modal:null;
  vm.runInContext(source,context);const api=context.FocusLottery;
  api.init({api:(path,body)=>new Promise((resolve,reject)=>requests.push({path,body:body===undefined?undefined:clone(body),resolve,reject})),isVisible:()=>active,
    acceptReceipt:value=>receipts.push(value),playSound:(...args)=>sounds.push(clone(args)),toast:(...args)=>toasts.push(args),unlock:()=>unlocks++,showShop:()=>shops++,refresh:async(...args)=>refreshes.push(args)});
  api.mount(kind,host,{quests:{lottery:initial},date:'2020-01-01',today:'2026-09-30'});
  const button=id=>host.querySelector(`[data-lottery-focus="${id}"]`);
  function emit(id,patch={}){const target=button(id);assert.ok(target,id);const event={target,button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...patch};for(const fn of host.listeners.click||[])fn(event);return event;}
  async function flush(){for(let i=0;i<14;i++)await Promise.resolve();}
  function endAnimation(type,animationName='lottery-reveal',target=host.querySelector('.lottery-stage.is-result')){for(const fn of host.listeners[type]||[])fn({target,animationName});}
  function dialogEvent(type,patch={}){const dialog=document.modal;assert.ok(dialog,'an open native dialog');const event={target:dialog,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...patch};for(const fn of [...(dialog.listeners[type]||[])])fn(event);return event;}
  function rulesHTML(kind){const focus=document.activeElement;emit(`rules-${kind}`);const html=document.modal?.innerHTML||'';if(document.modal)dialogEvent('keydown',{key:'Escape'});if(focus&&host.contains(focus))focus.focus();else document.activeElement=focus;return html;}
  function allHTML(){return (host.innerHTML+rulesHTML('odds')+rulesHTML('sources')).replace(/<small>%<\/small>/g,'%');}
  const mutations=()=>requests.filter(row=>row.body!==undefined);
  return {api,context,host,parent,document,dialogEvent,rulesHTML,allHTML,get dialog(){return document.modal;},requests,receipts,sounds,toasts,refreshes,button,emit,flush,endAnimation,mutations,get shops(){return shops;},get unlocks(){return unlocks;},get revealStarts(){return revealStarts;},set active(value){active=value;}};
}

test('coin and diamond machines show distinct ticket-only rules and real odds',()=>{
  const h=harness();assert.match(h.allHTML(),/金币抽奖机/);assert.match(h.allHTML(),/80 金币 换 1 张/);assert.match(h.allHTML(),/78%/);assert.match(h.allHTML(),/9.5%/);assert.match(h.allHTML(),/0.5%/);
  assert.match(h.allHTML(),/2—1000 金币/);assert.match(h.allHTML(),/全部普通付费商品均可抽/);assert.match(h.allHTML(),/抽奖券永久保留/);assert.match(h.allHTML(),/金币抽奖券/);
  h.api.mount('diamond',h.host,{quests:{lottery:lottery()}});assert.match(h.allHTML(),/钻石抽奖机/);assert.match(h.allHTML(),/4 钻石 换 1 张/);assert.match(h.allHTML(),/85%/);assert.match(h.allHTML(),/15%/);assert.doesNotMatch(h.allHTML(),/78%/);
  for(const node of h.host.children.filter(n=>n.dataset.lotteryAction))assert.equal(node.attributes.type,'button');
});

test('all ordinary paid items are drawable and the old purchase-only field cannot restore misleading pool rules',()=>{
  const data=limitedLottery();data.machines[0].pool.exclusiveItems=24;data.shopExclusiveItemsExcluded=true;
  const h=harness(data);assert.match(h.allHTML(),/全部普通付费商品均可抽/);
  assert.match(h.allHTML(),/金币机可抽金币商品与钻石商品，钻石机可抽钻石商品/);
  assert.match(h.allHTML(),/抽奖限定藏品仍在独立限定奖池中/);
  assert.doesNotMatch(h.allHTML(),/商店专藏|仅能购买|不进入抽奖池/);
  assert.match(h.allHTML(),/0 \/ 6 件已收藏 · 仅抽未拥有的限定藏品/);
  h.api.mount('diamond',h.host,{lottery:data});assert.match(h.allHTML(),/全部普通付费商品均可抽/);
  assert.doesNotMatch(h.allHTML(),/商店专藏|仅能购买|不进入抽奖池/);
  assert.match(h.allHTML(),/0.6%/);assert.match(h.allHTML(),/0 \/ 20/);
});

test('both machines render 24 percent ordinary items, 1 percent limited items and exact 97 to 15 currency ratios',()=>{
  const data=limitedLottery(),coin=data.machines[0],diamond=data.machines[1];
  const coinWeights={coins:36375,diamonds:5625,coinItem:12768,diamondItem:672,lotteryOnly:560};
  const diamondWeights={coins:5625,diamonds:36375,diamondItem:13440,lotteryOnly:560};
  diamond.odds.unshift({type:'coins',label:'随机金币',min:50,max:1000,typical:'85% 的金币结果为 50–100 金币；14% 为 101–200 金币；0.9% 为 300–500 金币；0.1% 为 600–1000 金币'});
  for(const [item,weights] of [[coin,coinWeights],[diamond,diamondWeights]]){
    const total=Object.values(weights).reduce((sum,weight)=>sum+weight,0);
    assert.equal(total,56000);
    item.odds.forEach(odd=>odd.percent=weights[odd.type]/total*100);
    assert.equal(weights[item.id==='coin'?'coins':'diamonds']*15,weights[item.id==='coin'?'diamonds':'coins']*97);
  }
  assert.equal(coinWeights.coinItem,coinWeights.diamondItem*19);
  const h=harness(data);assert.match(h.allHTML(),/普通商品基础概率 24%，抽奖限定 1%，合计 25%/);
  for(const value of ['64.955','10.045','22.8','1.2','1'])assert.ok(h.allHTML().includes(value+'%'));
  assert.doesNotMatch(h.allHTML(),/72\.75%|11\.25%|普通商品基础概率 15%/);
  assert.match(h.allHTML(),/限定奖品概率为 100%/);assert.match(h.allHTML(),/奖池集齐后，对应结果转换为货币补给/);
  h.api.mount('diamond',h.host,{lottery:data});assert.match(h.allHTML(),/普通商品基础概率 24%，抽奖限定 1%，合计 25%/);
  for(const value of ['64.955','10.045','24','1'])assert.ok(h.allHTML().includes(value+'%'));
  assert.doesNotMatch(h.allHTML(),/72\.75%|11\.25%|普通商品基础概率 15%/);
  assert.match(h.allHTML(),/50—1000 金币/);
  assert.match(h.allHTML(),/85% 的金币结果为 50–100 金币；14% 为 101–200 金币；0.9% 为 300–500 金币；0.1% 为 600–1000 金币/);
  assert.match(h.allHTML(),/限定奖品概率为 100%/);
});

for(const [amount,rarity,sound] of [[75,'ordinary','delivery'],[800,'jackpot','victory']])test(`diamond machine credits and reveals its ${amount} coin result once`,async()=>{
  const initial=limitedLottery(),h=harness(initial,'diamond');h.emit('draw');
  const next=clone(initial);next.revision=11;next.tickets.diamond=0;next.wallet.coins+=amount;
  const result=outcome('diamond',{type:'coins',coins:amount,diamonds:0,rarity});
  h.mutations()[0].resolve(receipt('diamond','draw',{lottery:next,result}));await h.flush();
  assert.equal(h.receipts.length,1);assert.equal(h.receipts[0].result.coins,amount);
  assert.match(h.allHTML(),new RegExp(`<h3>${amount} 金币</h3>`));
  assert.match(h.allHTML(),/已经收进你的行囊/);assert.equal(h.sounds[0][0],sound);
  assert.equal(h.button('draw').attributes['aria-disabled'],'true');assert.equal(h.revealStarts,1);
  h.endAnimation('animationend');const stage=h.host.querySelector('.lottery-stage.is-result'),writes=h.host.writes;
  for(let i=0;i<20;i++)h.api.render({lottery:clone(next)});
  assert.equal(h.host.writes,writes);assert.equal(h.host.querySelector('.lottery-stage.is-result'),stage);
  assert.equal(h.revealStarts,1);assert.equal(h.receipts.length,1);
});

test('currency alone or the wrong ticket can never enable a draw',()=>{
  const h=harness(lottery({tickets:{coin:0,diamond:99},wallet:{coins:99999,diamonds:99999}}));
  assert.equal(h.button('draw').attributes['aria-disabled'],'true');h.emit('draw');assert.equal(h.mutations().length,0);
  const data=lottery({tickets:{coin:1,diamond:0}});data.machines[0].canDraw=false;h.api.render({lottery:{...data,revision:11}});h.emit('draw');assert.equal(h.mutations().length,0);
});

test('purchase requires both server eligibility and current wallet, and respects daily cap',()=>{
  const data=lottery({wallet:{coins:79,diamonds:20}}),h=harness(data);h.emit('buy');assert.equal(h.mutations().length,0);assert.match(h.allHTML(),/金币暂时不足/);
  const capped=lottery({revision:11});Object.assign(capped.machines[0],{purchasesToday:5,purchasesRemaining:0,canBuy:false});h.api.render({lottery:capped});h.emit('buy');assert.equal(h.mutations().length,0);assert.match(h.allHTML(),/今日已买满/);
});

test('rapid draw and buy clicks serialize and never locally credit currency',async()=>{
  const h=harness();h.emit('draw');h.emit('draw');h.emit('buy');assert.equal(h.mutations().length,1);assert.equal(h.receipts.length,0);assert.equal(h.unlocks,1);
  const request=h.mutations()[0];assert.equal(request.path,'/api/lottery/draw');assert.deepEqual(request.body,{machine:'coin',requestId:'00000000-0000-4000-8000-000000000001'});
  request.resolve(receipt());await h.flush();assert.equal(h.receipts.length,1);assert.match(h.allHTML(),/25 金币/);assert.equal(h.sounds.length,1);assert.equal(h.refreshes.length,1);
});

test('successful purchase receives a ticket but does not implicitly draw',async()=>{
  const h=harness();h.emit('buy');assert.equal(h.mutations()[0].path,'/api/lottery/buy');h.mutations()[0].resolve(receipt('coin','buy'));await h.flush();
  assert.equal(h.mutations().length,1);assert.equal(h.receipts.length,1);assert.equal(h.sounds[0][0],'purchase');assert.match(h.toasts[0][0],/金币抽奖券已收好/);
  assert.match(h.toasts[0][1],/已使用 80 金币/);
});

test('both purchase actions and ticket sources use server prices, with ten purchases per machine',()=>{
  const h=harness();assert.match(h.allHTML(),/80 金币 · 购买 1 张/);assert.match(h.allHTML(),/80 金币购买 1 张，每天最多购买 10 张/);
  assert.match(h.allHTML(),/数学、408 每轮 60 分钟，政治、英语每轮 30 分钟/);assert.match(h.allHTML(),/领取每科当日首轮加赠：1 张/);assert.match(h.allHTML(),/每天最多 4 张；与完整委托赠券分别计算/);assert.match(h.allHTML(),/第 1、2 份星礼/);
  assert.doesNotMatch(h.rulesHTML('sources'),/上午两科首轮加赠领齐、下午两科首轮加赠领齐/);
  h.api.mount('diamond',h.host,{lottery:lottery()});assert.match(h.allHTML(),/4 钻石 · 购买 1 张/);assert.match(h.allHTML(),/4 钻石购买 1 张，每天最多购买 10 张/);assert.match(h.allHTML(),/四科普通委托合计每交付完整 3 轮/);assert.match(h.allHTML(),/融会贯通/);
  assert.match(h.rulesHTML('sources'),/同一学习日的数学、政治首轮加赠都领取：1 张/);
  assert.match(h.rulesHTML('sources'),/同一学习日的 408、英语首轮加赠都领取：1 张/);
  assert.match(h.rulesHTML('sources'),/上午、下午各一次，每天最多 2 张/);
  assert.doesNotMatch(h.rulesHTML('sources'),/四科首轮加赠全部领齐/);
  assert.doesNotMatch(h.allHTML(),/5 钻石购买|100 金币购买/);
  const changed=lottery({revision:12});changed.machines[1].price.diamonds=6;h.api.render({lottery:changed});assert.match(h.allHTML(),/6 钻石 换 1 张/);assert.match(h.allHTML(),/6 钻石 · 购买 1 张/);assert.match(h.allHTML(),/6 钻石购买 1 张/);
});

for(const kind of ['coin','diamond'])test(`${kind} allows five more purchases after five and disables buying after ten`,()=>{
  const data=lottery(),machine=data.machines.find(row=>row.id===kind);Object.assign(machine,{purchasesToday:5,purchasesRemaining:5});
  const h=harness(data,kind);assert.match(h.allHTML(),/今日已买 5 \/ 10 张 · 剩余 5 次/);assert.match(h.allHTML(),/每天最多购买 10 张/);assert.equal(h.button('buy').attributes['aria-disabled'],'false');
  const capped=clone(data);capped.revision=11;Object.assign(capped.machines.find(row=>row.id===kind),{purchasesToday:10,purchasesRemaining:0,canBuy:false});
  h.api.render({lottery:capped});assert.match(h.allHTML(),/今日已买 10 \/ 10 张 · 剩余 0 次/);assert.equal(h.button('buy').attributes['aria-disabled'],'true');h.emit('buy');assert.equal(h.mutations().length,0);
});

for(const kind of ['coin','diamond'])test(`${kind} keeps server purchase limits authoritative and uses ten only when metadata is absent`,()=>{
  const legacy=lottery(),item=legacy.machines.find(row=>row.id===kind);
  Object.assign(item,{purchaseLimit:5,purchasesToday:3,purchasesRemaining:2});
  const h=harness(legacy,kind);assert.match(h.allHTML(),/今日已买 3 \/ 5 张 · 剩余 2 次/);assert.match(h.rulesHTML('sources'),/每天最多购买 5 张/);
  const sparse=clone(legacy);sparse.revision++;const modern=sparse.machines.find(row=>row.id===kind);
  delete modern.purchaseLimit;delete modern.purchasesRemaining;modern.purchasesToday=5;
  h.api.render({lottery:sparse});assert.match(h.allHTML(),/今日已买 5 \/ 10 张 · 剩余 5 次/);assert.equal(h.button('buy').attributes['aria-disabled'],'false');
  const capped=clone(sparse);capped.revision++;capped.machines.find(row=>row.id===kind).purchasesToday=10;
  h.api.render({lottery:capped});h.emit('buy');assert.equal(h.button('buy').attributes['aria-disabled'],'true');assert.equal(h.mutations().length,0);
});

test('the two daily purchase counters stay independent and both machines describe the mixed completion gift',()=>{
  const data=lottery();Object.assign(data.machines[0],{purchasesToday:10,purchasesRemaining:0,canBuy:false});
  Object.assign(data.machines[1],{purchasesToday:5,purchasesRemaining:5});
  const h=harness(data);assert.equal(h.button('buy').attributes['aria-disabled'],'true');
  assert.match(h.rulesHTML('sources'),/融会贯通/);assert.match(h.rulesHTML('sources'),/1 张金币抽奖券 ＋ 1 张钻石抽奖券，一起收好/);
  h.api.mount('diamond',h.host,{lottery:data});assert.equal(h.button('buy').attributes['aria-disabled'],'false');
  assert.match(h.rulesHTML('sources'),/1 张金币抽奖券 ＋ 1 张钻石抽奖券，一起收好/);
  assert.match(h.host.innerHTML,/4 钻石 · 购买 1 张/);
});

test('ordinary round totals and the next diamond stay authoritative across days and stale snapshots',async()=>{
  const rounds={featureStartMs:1,totalRounds:2,diamondTickets:0,roundsTowardNextDiamond:2,roundsToNextDiamond:1,subjects:[]};
  const initial=lottery({roundTickets:rounds}),h=harness(initial);assert.match(h.allHTML(),/普通委托累计交付 2 轮 · 再交付 1 轮，得 1 张钻石抽奖券/);assert.match(h.allHTML(),/跨天、重启都会保留/);assert.match(h.allHTML(),/旧时已交付的完整委托轮次和已领齐的研习轮次不补发/);
  const next=lottery({day:'2026-10-01',revision:11,roundTickets:{...rounds,totalRounds:3,diamondTickets:1,roundsTowardNextDiamond:0,roundsToNextDiamond:3}});h.api.render({lottery:next});assert.match(h.allHTML(),/累计交付 3 轮 · 再交付 3 轮/);
  h.requests[0].resolve(initial);await h.flush();h.api.render({lottery:initial});assert.match(h.allHTML(),/累计交付 3 轮 · 再交付 3 轮/);assert.equal(h.mutations().length,0);
  h.api.mount('diamond',h.host,{lottery:next});assert.match(h.allHTML(),/累计交付 3 轮 · 再交付 3 轮/);assert.equal(h.mutations().length,0);
});

test('malformed round totals do not turn into invented progress or untrusted text',()=>{
  for(const rounds of [{totalRounds:8,roundsToNextDiamond:0},{totalRounds:8,roundsToNextDiamond:4},{totalRounds:-1,roundsToNextDiamond:2},{totalRounds:'<img>',roundsToNextDiamond:2}]){
    const h=harness(lottery({roundTickets:rounds}));assert.doesNotMatch(h.allHTML(),/普通委托累计交付|<img|NaN/);assert.match(h.allHTML(),/完整 1 轮/);
  }
});

test('network uncertainty blocks new actions and retries the exact same operation ID',async()=>{
  const h=harness();h.emit('draw');const first=h.mutations()[0];first.reject(new Error('断开连接'));await h.flush();
  h.emit('draw');h.emit('buy');assert.equal(h.mutations().length,1);assert.ok(h.button('retry'));
  h.emit('retry');assert.equal(h.mutations().length,2);assert.deepEqual(h.mutations()[1].body,first.body);assert.equal(h.mutations()[1].path,first.path);
  h.mutations()[1].resolve(receipt('coin','draw',{alreadyProcessed:true}));await h.flush();assert.equal(h.receipts.length,1);assert.equal(h.sounds.length,0);assert.equal(h.button('retry'),null);
});

test('a mismatched receipt is never credited and remains safely confirmable',async()=>{
  const h=harness();h.emit('draw');h.mutations()[0].resolve(receipt('diamond'));await h.flush();assert.equal(h.receipts.length,0);assert.ok(h.button('retry'));
  h.emit('retry');h.mutations()[1].resolve(receipt());await h.flush();assert.equal(h.receipts.length,1);
});

test('definitive rejection permits a new request while timeouts remain retryable',async()=>{
  const h=harness();h.emit('draw');h.mutations()[0].reject(Object.assign(new Error('券不足'),{status:400}));await h.flush();assert.equal(h.button('retry'),null);
  h.emit('draw');assert.notEqual(h.mutations()[1].body.requestId,h.mutations()[0].body.requestId);h.mutations()[1].reject(Object.assign(new Error('超时'),{status:408}));await h.flush();assert.ok(h.button('retry'));
});

test('older GET and polls cannot restore spent tickets after a valid receipt',async()=>{
  const h=harness();h.emit('draw');const result=receipt();result.lottery.tickets.coin=0;result.lottery.machines[0].canDraw=false;h.mutations()[0].resolve(result);await h.flush();
  h.requests[0].resolve(lottery());await h.flush();h.api.render({lottery:lottery()});h.emit('draw');assert.equal(h.mutations().length,1);assert.equal(h.button('draw').attributes['aria-disabled'],'true');
});

test('equal-revision older snapshots cannot undo wallet changes even within the same millisecond',async()=>{
  const initial=lottery({now:'2026-09-30T19:00:00.123900+08:00'}),h=harness(initial);
  const newer=lottery({now:'2026-09-30T19:00:00.123950+08:00',wallet:{coins:79,diamonds:20}});h.api.render({lottery:newer});assert.equal(h.button('buy').attributes['aria-disabled'],'true');
  h.requests[0].resolve(initial);await h.flush();h.api.render({lottery:initial});assert.equal(h.button('buy').attributes['aria-disabled'],'true');
});

test('a late receipt after unmount is accepted without DOM changes or sound',async()=>{
  const h=harness();h.emit('draw');h.api.unmount();const writes=h.host.writes;h.mutations()[0].resolve(receipt());await h.flush();
  assert.equal(h.receipts.length,1);assert.equal(h.host.writes,writes);assert.equal(h.sounds.length,0);assert.equal(h.host.listeners.click.length,0);
});

test('pending operations stay serialized when changing machines, and return to the cabinet',async()=>{
  const h=harness();h.emit('draw');h.api.mount('diamond',h.host,{lottery:lottery()});h.emit('draw');assert.equal(h.mutations().length,1);
  h.mutations()[0].resolve(receipt());await h.flush();assert.match(h.allHTML(),/钻石抽奖机/);assert.doesNotMatch(h.allHTML(),/25 金币<\/h3>/);assert.equal(h.sounds.length,0);
  h.api.mount('coin',h.host,{lottery:lottery()});assert.doesNotMatch(h.allHTML(),/25 金币<\/h3>/);assert.ok(h.host.querySelector('.lottery-stage.is-idle'));
});

test('a retry can be confirmed after navigating to the other machine, without a second ticket',async()=>{
  const h=harness();h.emit('draw');const body=h.mutations()[0].body;h.mutations()[0].reject(new Error('暂未收到'));await h.flush();h.api.mount('diamond',h.host,{lottery:lottery()});h.emit('retry');
  assert.deepEqual(h.mutations()[1].body,body);h.mutations()[1].resolve(receipt());await h.flush();assert.equal(h.receipts.length,1);
});

test('item results join collection without automatically equipping, all labels are escaped',async()=>{
  const h=harness();h.emit('draw');const item={id:'island-blue',name:'<img onerror=alert(1)>',description:'<script>evil</script>'};h.mutations()[0].resolve(receipt('coin','draw',{result:outcome('coin',{type:'item',coins:0,item,rarity:'rare'})}));await h.flush();
  assert.match(h.allHTML(),/data-preview="island-blue"/);assert.match(h.allHTML(),/&lt;img/);assert.match(h.allHTML(),/&lt;script/);assert.doesNotMatch(h.allHTML(),/<img|<script/);
  assert.ok(h.button('collection'));h.emit('collection');assert.equal(h.shops,1);assert.equal(h.mutations().length,1);
});

test('empty pools show conversion rules and reward history remains bounded',()=>{
  const data=lottery({history:Array.from({length:20},(_,i)=>({machine:'coin',requestId:String(i),drawnAt:'2026-09-30T12:00:00+08:00',result:outcome('coin',{coins:i+1,fallback:true})}))});data.machines[0].pool.coinItems=0;data.machines[0].pool.diamondItems=0;
  const h=harness(data);assert.match(h.allHTML(),/0 款可抽/);assert.match(h.allHTML(),/集齐后换成 35 金币/);assert.match(h.allHTML(),/集齐后换成 2 钻石/);assert.ok(h.host.querySelector('.lottery-stage.is-idle'));assert.equal(h.host.querySelector('.lottery-stage.is-result'),null);
  assert.equal((h.allHTML().match(/<li><span>/g)||[]).length,4);
});

test('hidden and modified clicks never start mutations',()=>{
  const h=harness();for(const patch of [{button:2},{button:1},{metaKey:true},{ctrlKey:true},{altKey:true},{shiftKey:true},{defaultPrevented:true}])h.emit('draw',patch);
  h.document.hidden=true;h.emit('draw');h.document.hidden=false;h.active=false;h.emit('draw');h.active=true;h.parent.hidden=true;h.emit('draw');h.parent.hidden=false;h.parent.inert=true;h.emit('buy');assert.equal(h.mutations().length,0);
});

test('historical study date does not disable lottery which uses the actual server day',()=>{
  const h=harness();h.emit('draw');assert.equal(h.mutations().length,1);assert.deepEqual(Object.keys(h.mutations()[0].body).sort(),['machine','requestId']);
});

test('an open native rule book remains mounted during polling, then updates the machine on close',()=>{
  const h=harness();h.emit('rules-odds');const dialog=h.dialog,writes=h.host.writes;assert.equal(dialog.open,true);assert.equal(dialog.modalCalls,1);
  assert.equal(h.document.activeElement,dialog.querySelector('[data-lottery-close]'));
  h.api.render({lottery:clone(lottery())});h.api.render({lottery:lottery({revision:12,wallet:{coins:900,diamonds:20}})});
  assert.equal(h.host.writes,writes);assert.equal(h.dialog,dialog);assert.equal(dialog.open,true);
  h.dialogEvent('keydown',{key:'Escape'});assert.equal(h.dialog,null);assert.match(h.host.innerHTML,/900 金币/);assert.equal(h.document.activeElement,h.button('rules-odds'));
});

for(const kind of ['coin','diamond']){
  test(`${kind} cabinet and real limited SVG previews remain mounted across repeated polls`,async()=>{
    const data=limitedLottery({history:[{machine:kind,drawnAt:'2026-09-30T12:00:00+08:00',result:outcome(kind)}]});
    const barId=kind==='coin'?'bar-skyexpress':'bar-galaxy';
    data.machines.find(row=>row.id===kind).collection[0]={...data.machines.find(row=>row.id===kind).collection[0],id:barId,slot:'bar'};
    const h=harness(data,kind,require('../static/shop-art.js'));
    h.requests[0].resolve(clone(data));await h.flush();
    const stage=h.host.querySelector('.lottery-stage.is-idle'),writes=h.host.writes;
    h.button('draw').focus();
    for(let i=0;i<30;i++){
      const next=clone(data);next.now=`2026-09-30T12:00:${String(i).padStart(2,'0')}+08:00`;
      h.api.render({lottery:next});h.api.mount(kind,h.host,{lottery:next});
    }
    assert.equal(h.host.writes,writes);assert.equal(h.host.querySelector('.lottery-stage.is-idle'),stage);
    assert.equal(h.document.activeElement,h.button('draw'));assert.equal(h.host.querySelector('.lottery-stage.is-result'),null);
    assert.equal(h.revealStarts,0,'saved results do not announce a new draw');
  });

  test(`${kind} reveals each new draw once, including equal rewards, but never replays for wallet or purchase updates`,async()=>{
    const h=harness(limitedLottery(),kind);
    h.emit('draw');const first=receipt(kind,'draw',{lottery:limitedLottery({revision:11,tickets:{coin:3,diamond:3}})});
    h.mutations()[0].resolve(first);await h.flush();assert.equal(h.revealStarts,1);
    const stage=h.host.querySelector('.lottery-stage.is-result'),writes=h.host.writes;
    for(let i=0;i<20;i++)h.api.render({lottery:clone(first.lottery)});
    assert.equal(h.host.writes,writes);assert.equal(h.host.querySelector('.lottery-stage.is-result'),stage);assert.equal(h.revealStarts,1);
    const changed=clone(first.lottery);changed.revision=12;changed.wallet.coins=950;changed.machines.find(row=>row.id===kind).collection[0].owned=true;
    h.api.render({lottery:changed});assert.match(h.allHTML(),/950 金币/);assert.match(h.allHTML(),/1 \/ 6 已收藏/);assert.equal(h.revealStarts,1);
    assert.equal(h.host.querySelector('.lottery-stage.is-result').classList.contains('is-revealing'),false);
    h.emit('buy');h.mutations()[1].resolve(receipt(kind,'buy',{lottery:limitedLottery({revision:13,tickets:{coin:4,diamond:4}})}));await h.flush();assert.equal(h.revealStarts,1);
    h.emit('draw');h.mutations()[2].resolve(receipt(kind,'draw',{lottery:limitedLottery({revision:14,tickets:{coin:3,diamond:3}})}));await h.flush();assert.equal(h.revealStarts,2,'same amount from a new draw still celebrates');
    h.api.unmount();h.api.mount(kind,h.host,{lottery:limitedLottery({revision:15})});assert.equal(h.revealStarts,2,'returning to a saved result does not celebrate again');
  });
}

test('late draw receipt cannot reveal in another machine or when returning to the saved result',async()=>{
  const h=harness();h.emit('draw');h.api.mount('diamond',h.host,{lottery:lottery()});
  h.mutations()[0].resolve(receipt());await h.flush();assert.equal(h.revealStarts,0);
  h.api.mount('coin',h.host,{lottery:lottery({revision:12})});assert.doesNotMatch(h.allHTML(),/<h3>25 金币<\/h3>/);assert.ok(h.host.querySelector('.lottery-stage.is-idle'));assert.equal(h.revealStarts,0);
});

test('a limited progress bar result and its collection use independent SVG gradient IDs',async()=>{
  const data=limitedLottery(),item={...data.machines[0].collection[0],id:'bar-skyexpress',slot:'bar',owned:true};
  data.machines[0].collection[0]=item;
  const h=harness(data,'coin',require('../static/shop-art.js'));h.emit('draw');
  const next=clone(data);next.revision=11;
  h.mutations()[0].resolve(receipt('coin','draw',{lottery:next,result:outcome('coin',{type:'item',item,limited:true,rarity:'jackpot'})}));await h.flush();
  const ids=[...h.host.innerHTML.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,'same item in both locations must not collide');
  assert.equal(h.revealStarts,1);const writes=h.host.writes;h.api.render({lottery:clone(next)});assert.equal(h.host.writes,writes);
  assert.match(css,/\.lottery-stage\.is-result\.is-revealing\{animation:lottery-reveal/);
  assert.doesNotMatch(css,/\.lottery-stage\.is-result\{animation:/);
});

for(const type of ['animationend','animationcancel'])test(`${type} clears the reveal so visibility changes cannot restart it`,async()=>{
  const h=harness();h.emit('draw');const result=receipt();h.mutations()[0].resolve(result);await h.flush();
  const stage=h.host.querySelector('.lottery-stage.is-result');assert.equal(stage.classList.contains('is-revealing'),true);
  h.endAnimation(type,'unrelated-preview-animation');assert.equal(stage.classList.contains('is-revealing'),true);
  h.endAnimation(type);assert.equal(stage.classList.contains('is-revealing'),false);
  h.active=false;h.api.render({lottery:clone(result.lottery)});h.active=true;h.api.render({lottery:clone(result.lottery)});
  assert.equal(h.host.querySelector('.lottery-stage.is-result'),stage);assert.equal(h.revealStarts,1);assert.equal(stage.classList.contains('is-revealing'),false);
});

test('motion disabled at receipt time never leaves a dormant reveal to play later',async()=>{
  const h=harness();h.document.documentElement.classList.add('no-motion');h.emit('draw');const result=receipt();h.mutations()[0].resolve(result);await h.flush();
  assert.equal(h.revealStarts,0);h.document.documentElement.classList.remove('no-motion');h.api.render({lottery:clone(result.lottery)});assert.equal(h.revealStarts,0);
});

test('mounting is listener bounded and animation never allocates game loops or storage',()=>{
  const h=harness();for(let i=0;i<50;i++)h.api.mount(i%2?'coin':'diamond',h.host,{lottery:lottery()});assert.equal(h.host.listeners.click.length,1);h.api.unmount();assert.equal(h.host.listeners.click.length,0);
  assert.equal(h.host.listeners.animationend.length,0);assert.equal(h.host.listeners.animationcancel.length,0);
  assert.doesNotMatch(source,/setTimeout|setInterval|requestAnimationFrame|localStorage|sessionStorage|Math\.random/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/focus-runtime-hidden/);assert.match(css,/data-paused=true/);assert.match(css,/--ui-ink/);assert.match(css,/grid-template-columns:minmax\(0,1.25fr\)/);
});

test('permanent per-machine pity and exclusive collection describe the precise next guarantee',()=>{
  const data=limitedLottery();Object.assign(data.machines[0].pity,{count:27,remaining:3});Object.assign(data.machines[1].pity,{count:19,remaining:1});data.machines[0].collection[0].owned=true;
  const h=harness(data);assert.match(h.allHTML(),/最多再抽 3 次，必得一件未拥有的限定藏品/);assert.match(h.allHTML(),/27 \/ 30/);assert.match(h.allHTML(),/跨天保留/);assert.match(h.allHTML(),/1 \/ 6 已收藏/);assert.equal((h.allHTML().match(/class="lottery-collection-card/g)||[]).length,6);assert.match(h.allHTML(),/77.6%/);assert.match(h.allHTML(),/0.4%/);assert.match(h.allHTML(),/保底抽次，限定奖品概率为 100%/);
  h.api.mount('diamond',h.host,{lottery:data});assert.match(h.allHTML(),/下一抽必得一件未拥有的限定藏品/);assert.match(h.allHTML(),/19 \/ 20/);assert.match(h.allHTML(),/84.4%/);assert.match(h.allHTML(),/0.6%/);
});

test('only server receipt resets pity and an older poll cannot resurrect its prior counter',async()=>{
  const data=limitedLottery();Object.assign(data.machines[0].pity,{count:29,remaining:1});const h=harness(data);h.emit('draw');assert.match(h.allHTML(),/29 \/ 30/);
  const next=limitedLottery({revision:11});next.machines[0].collection[0].owned=true;const result=receipt('coin','draw',{lottery:next,result:outcome('coin',{type:'item',coins:0,item:next.machines[0].collection[0],limited:true,pityTriggered:true,rarity:'jackpot'})});
  h.mutations()[0].resolve(result);await h.flush();assert.match(h.allHTML(),/0 \/ 30/);assert.match(h.allHTML(),/如约而来的限定惊喜/);assert.match(h.allHTML(),/抽奖限定 · 无法购买/);h.api.render({lottery:data});assert.match(h.allHTML(),/0 \/ 30/);assert.match(h.allHTML(),/1 \/ 6 已收藏/);
});

test('shorter pity preserves old accumulated counts and fills the meter without overflow',()=>{
  const data=limitedLottery();Object.assign(data.machines[0].pity,{count:47,remaining:1});Object.assign(data.machines[1].pity,{count:31,remaining:1});const h=harness(data);
  assert.match(h.allHTML(),/保底积累 <b>47 抽<\/b>/);assert.match(h.allHTML(),/下一抽必得一件未拥有的限定藏品/);assert.match(h.allHTML(),/aria-valuemax="30" aria-valuenow="30"/);assert.match(h.allHTML(),/width:100%/);
  h.api.mount('diamond',h.host,{lottery:data});assert.match(h.allHTML(),/保底积累 <b>31 抽<\/b>/);assert.match(h.allHTML(),/aria-valuemax="20" aria-valuenow="20"/);assert.equal(data.machines[0].pity.count,47);assert.equal(data.machines[1].pity.count,31);assert.equal(h.mutations().length,0);
});

test('crossing a day never locally resets pity, while complete collection clearly guarantees currency',()=>{
  const data=limitedLottery();Object.assign(data.machines[0].pity,{count:29,remaining:1,allCollected:true});data.machines[0].collection.forEach(row=>row.owned=true);data.machines[0].pool.lotteryOnlyItems=0;
  const h=harness(data);assert.match(h.allHTML(),/下一抽必得120 金币限定补给/);assert.doesNotMatch(h.allHTML(),/下一抽必得一件未拥有/);h.api.render({lottery:{...clone(data),day:'2026-10-01',revision:11}});assert.match(h.allHTML(),/29 \/ 30/);
  const diamond=limitedLottery({revision:12});Object.assign(diamond.machines[1].pity,{count:19,remaining:1,allCollected:true});h.api.mount('diamond',h.host,{lottery:diamond});assert.match(h.allHTML(),/下一抽必得8 钻石限定补给/);
});

test('opening a pending star gift grants its ticket without spending a ticket or duplicating currency',async()=>{
  const data=limitedLottery({starGifts:[{day:'2026-09-29',index:1,machine:'coin',claimed:false},{day:'2026-09-29',index:3,machine:'diamond',claimed:false}]});const h=harness(data);
  assert.ok(h.button('star-2026-09-29-1'));assert.equal(h.button('star-2026-09-29-3'),null);h.emit('star-2026-09-29-1');h.emit('draw');h.emit('buy');assert.equal(h.mutations().length,1);
  const request=h.mutations()[0];assert.equal(request.path,'/api/lottery/star-gift');assert.deepEqual(request.body,{day:'2026-09-29',index:1,requestId:'00000000-0000-4000-8000-000000000001'});
  const next=limitedLottery({revision:11,starGifts:[{day:'2026-09-29',index:1,machine:'coin',claimed:true}],tickets:{coin:3,diamond:1}});request.resolve(receipt('coin','draw',{lottery:next,result:{type:'starGift',machine:'coin',day:'2026-09-29',index:1}}));await h.flush();assert.equal(h.receipts.length,1);assert.equal(h.button('star-2026-09-29-1'),null);assert.match(h.toasts[0][1],/星礼的金币与钻石奖励不重复结算/);
});

test('star-gift confirmation preserves the exact UUID, original date and index across navigation',async()=>{
  const data=limitedLottery({starGifts:[{day:'2026-09-29',index:2,machine:'coin',claimed:false}]});const h=harness(data);h.emit('star-2026-09-29-2');const body=h.mutations()[0].body;h.mutations()[0].reject(new Error('未收到'));await h.flush();h.api.mount('diamond',h.host,{lottery:data});h.emit('retry');assert.equal(h.mutations()[1].path,'/api/lottery/star-gift');assert.deepEqual(h.mutations()[1].body,body);
  h.mutations()[1].resolve(receipt('coin','draw',{result:{type:'starGift',machine:'coin',day:'2026-09-29',index:1}}));await h.flush();assert.equal(h.receipts.length,0);assert.ok(h.button('retry'));
});

test('claimed and malformed pending star-gift rows never expose opening controls',()=>{
  const h=harness(lottery({starGifts:[{day:'2026-09-29',index:1,machine:'coin',claimed:true},{day:'<img>',index:1,machine:'coin',claimed:false},{day:'2026-09-29',index:5,machine:'coin',claimed:false}]}));assert.doesNotMatch(h.allHTML(),/data-lottery-action="star-gift"/);assert.doesNotMatch(h.allHTML(),/<img/);
});

test('grant toast text groups only valid ticket kinds and does not render untrusted strings',()=>{
  const h=harness();assert.equal(h.api.ticketText([{machine:'coin',count:1},{machine:'diamond',count:2},{machine:'coin',count:1},{machine:'<script>',count:2},{machine:'coin',count:-10}]),' · +2 金币抽奖券 · +2 钻石抽奖券');assert.equal(h.api.ticketText(null),'');assert.equal(h.api.ticketText([]),'');
});

test('timed ticket receipt display follows the saved machine and count rather than interpreting historical source keys',()=>{
  const h=harness(),before=clone(lottery());
  const old=[{machine:'coin',count:1,source:'timed-morning'},{machine:'coin',count:1,source:'timed-afternoon'},{machine:'diamond',count:1,source:'timed-all'}];
  assert.equal(h.api.ticketText(old),' · +2 金币抽奖券 · +1 钻石抽奖券');
  const current=[{machine:'coin',count:1,source:'timed-subject'},{machine:'coin',count:1,source:'timed-subject'},
    {machine:'diamond',count:1,source:'timed-morning'},{machine:'diamond',count:1,source:'timed-afternoon'}];
  assert.equal(h.api.ticketText(current),' · +2 金币抽奖券 · +2 钻石抽奖券');
  assert.equal(h.api.ticketText([{machine:'diamond',count:1,source:'<img onerror=boom>'}]),' · +1 钻石抽奖券');
  assert.deepEqual(lottery(),before);assert.equal(h.mutations().length,0);assert.equal(h.sounds.length,0);
});


test('a star gift receipt without its claimed ledger proof remains safely retryable',async()=>{
  const data=limitedLottery({starGifts:[{day:'2026-09-29',index:1,machine:'coin',claimed:false}]});
  const h=harness(data);h.emit('star-2026-09-29-1');const request=h.mutations()[0];
  request.resolve(receipt('coin','draw',{lottery:limitedLottery({revision:11,starGifts:data.starGifts}),result:{type:'starGift',machine:'coin',day:'2026-09-29',index:1}}));
  await h.flush();assert.equal(h.receipts.length,0);assert.ok(h.button('retry'));assert.equal(h.sounds.length,0);
  assert.equal(h.toasts.length,0);
});

function mixedStar(index,patch={}){
  const [coinTickets,diamondTickets]=[[1,0],[1,1],[2,1],[2,2],[2,2],[2,2]][index-1];
  return {day:'2026-09-29',index,machine:index<=2?'coin':'diamond',claimed:false,lotteryTickets:{coinTickets,diamondTickets},...patch};
}
function mixedStarReceipt(row,initial,patch={}){
  const next=clone(initial);next.revision=initial.revision+1;
  next.starGifts=next.starGifts.map(g=>g.day===row.day&&g.index===row.index?{...g,claimed:true}:g);
  next.tickets.coin+=row.lotteryTickets.coinTickets;next.tickets.diamond+=row.lotteryTickets.diamondTickets;
  return receipt(row.machine,'draw',{lottery:next,result:{type:'starGift',machine:row.machine,day:row.day,index:row.index,lotteryTickets:row.lotteryTickets},
    ticketGrants:[['coin','coinTickets'],['diamond','diamondTickets']].filter(([,key])=>row.lotteryTickets[key]>0).map(([machine,key])=>({machine,count:row.lotteryTickets[key],source:'mystery-gift'})),...patch});
}

test('six modern star gifts show full mixed quantities and each machine recovers only boxes containing its own ticket',()=>{
  const rows=Array.from({length:6},(_,i)=>mixedStar(i+1)),data=lottery({starGifts:rows}),h=harness(data);
  for(const row of rows)assert.ok(h.button(`star-${row.day}-${row.index}`));
  assert.match(h.host.innerHTML,/内含 2 张金币抽奖券 · 2 张钻石抽奖券/);
  assert.match(h.host.innerHTML,/任一机器打开一次，同盒的两种抽奖券会一起收好/);
  assert.match(h.rulesHTML('sources'),/第 1、2 份星礼各 1 张，第 3—6 份各 2 张/);
  h.api.mount('diamond',h.host,{lottery:data});assert.equal(h.button('star-2026-09-29-1'),null);
  for(const index of [2,3,4,5,6])assert.ok(h.button(`star-2026-09-29-${index}`));
  assert.match(h.rulesHTML('sources'),/第 2、3 份星礼各 1 张，第 4—6 份各 2 张/);
  assert.equal(h.mutations().length,0);
});

for(const [index,kind] of [[1,'coin'],[2,'diamond'],[3,'coin'],[4,'coin'],[5,'diamond'],[6,'coin']])test(`opening star ${index} from ${kind} receives all its coin and diamond tickets once`,async()=>{
  const row=mixedStar(index),data=lottery({starGifts:[row]}),h=harness(data,kind),focus=`star-${row.day}-${index}`;
  h.emit(focus);h.emit(focus);assert.equal(h.mutations().length,1);
  const request=h.mutations()[0];assert.deepEqual(Object.keys(request.body),['day','index','requestId']);
  const response=mixedStarReceipt(row,data);request.resolve(response);await h.flush();
  assert.equal(h.receipts.length,1);assert.deepEqual(h.receipts[0].lottery.wallet,data.wallet);
  assert.equal(h.receipts[0].lottery.tickets.coin,data.tickets.coin+row.lotteryTickets.coinTickets);
  assert.equal(h.receipts[0].lottery.tickets.diamond,data.tickets.diamond+row.lotteryTickets.diamondTickets);
  assert.match(h.toasts[0][1],new RegExp(`\\+${row.lotteryTickets.coinTickets} 金币抽奖券`));
  if(row.lotteryTickets.diamondTickets)assert.match(h.toasts[0][1],new RegExp(`\\+${row.lotteryTickets.diamondTickets} 钻石抽奖券`));
  assert.equal(h.button(focus),null);assert.equal(h.revealStarts,0);assert.equal(h.sounds.length,1);
  h.api.mount(kind==='coin'?'diamond':'coin',h.host,{lottery:response.lottery});assert.equal(h.button(focus),null);
  assert.equal(h.mutations().length,1);
});

test('mixed star proof must contain both granted ticket kinds and one matching claimed box, then retries the same UUID across machines',async()=>{
  const row=mixedStar(6),data=lottery({starGifts:[row]}),h=harness(data);h.emit('star-2026-09-29-6');
  const first=h.mutations()[0],partial=mixedStarReceipt(row,data,{ticketGrants:[{machine:'coin',count:2}]});
  first.resolve(partial);await h.flush();assert.equal(h.receipts.length,0);assert.equal(h.sounds.length,0);assert.ok(h.button('retry'));
  h.api.mount('diamond',h.host,{lottery:data});h.emit('retry');assert.deepEqual(h.mutations()[1].body,first.body);
  h.mutations()[1].resolve(mixedStarReceipt(row,data));await h.flush();assert.equal(h.receipts.length,1);
  assert.equal(h.button('star-2026-09-29-6'),null);assert.match(h.toasts[0][1],/\+2 金币抽奖券 · \+2 钻石抽奖券/);
});

test('modern star receipts reject absent, mismatched and malformed ticket vectors without displaying a success',async()=>{
  for(const patch of [
    {result:{type:'starGift',day:'2026-09-29',index:1,machine:'coin'}},
    {result:{type:'starGift',day:'2026-09-29',index:1,machine:'coin',lotteryTickets:{coinTickets:2,diamondTickets:0}}},
    {result:{type:'starGift',day:'2026-09-29',index:1,machine:'coin',lotteryTickets:{coinTickets:1,diamondTickets:'bad'}}}
  ]){
    const row=mixedStar(1),data=lottery({starGifts:[row]}),h=harness(data);h.emit('star-2026-09-29-1');
    h.mutations()[0].resolve(mixedStarReceipt(row,data,patch));await h.flush();
    assert.equal(h.receipts.length,0);assert.equal(h.toasts.length,0);assert.ok(h.button('retry'));
  }
});

for(const vector of [undefined,{coinTickets:1,diamondTickets:0}])test(`an already opened legacy star replay ${vector?'with actual old ticket counts':'without modern counts'} remains silent and never claims new mixed tickets`,async()=>{
  const row=mixedStar(2),data=lottery({starGifts:[row]}),h=harness(data,'diamond');h.emit('star-2026-09-29-2');
  const old={type:'starGift',day:row.day,index:row.index,machine:'coin',...(vector?{lotteryTickets:vector}:{})};
  const next=lottery({revision:11,starGifts:[mixedStar(2,{claimed:true,lotteryTickets:{coinTickets:1,diamondTickets:0}})]});
  h.mutations()[0].resolve(receipt('coin','draw',{lottery:next,result:old,alreadyProcessed:true,ticketGrants:[]}));await h.flush();
  assert.equal(h.receipts.length,1);assert.equal(h.sounds.length,0);assert.equal(h.button('star-2026-09-29-2'),null);
  assert.match(h.toasts[0][1],/这份星礼已经收好/);assert.doesNotMatch(h.toasts[0][1],/\+1|钻石抽奖券/);
});

test('malformed modern gift rows never fall back to one ticket or expose an out-of-range box',()=>{
  const rows=[mixedStar(1,{lotteryTickets:null}),mixedStar(2,{lotteryTickets:{coinTickets:0,diamondTickets:0}}),
    mixedStar(3,{lotteryTickets:{coinTickets:2,diamondTickets:-1}}),mixedStar(4,{lotteryTickets:{coinTickets:'<img>',diamondTickets:2}}),
    mixedStar(5,{lotteryTickets:{coinTickets:1.5,diamondTickets:2}}),mixedStar(6,{index:7})];
  const h=harness(lottery({starGifts:rows}));assert.doesNotMatch(h.host.innerHTML,/data-lottery-action="star-gift"|<img|NaN/);
  h.api.mount('diamond',h.host,{lottery:lottery({starGifts:rows})});assert.doesNotMatch(h.host.innerHTML,/data-lottery-action="star-gift"|<img|NaN/);
});

for(const kind of ['coin','diamond'])test(`${kind} keeps history but returns to the cabinet after leaving a fresh result`,async()=>{
  const historical={machine:kind,drawnAt:'2026-09-30T12:00:00+08:00',result:outcome(kind,{type:'coins',coins:87})};
  const initial=lottery({history:[historical]}),h=harness(initial,kind);
  assert.ok(h.host.querySelector('.lottery-stage.is-idle'));assert.equal(h.host.querySelector('.lottery-stage.is-result'),null);assert.match(h.host.innerHTML,/最近拆开的礼物/);assert.match(h.host.innerHTML,/<span>87 金币<span class="lottery-history-kind">随机金币<\/span>/);
  h.emit('draw');const result=outcome(kind,{type:'coins',coins:95});const next=lottery({revision:11,history:[{...historical,result},historical]});
  h.mutations()[0].resolve(receipt(kind,'draw',{lottery:next,result}));await h.flush();assert.match(h.host.innerHTML,/<h3>95 金币<\/h3>/);
  h.api.mount(kind,h.host,{lottery:clone(next)});h.api.render({lottery:clone(next)});assert.match(h.host.innerHTML,/<h3>95 金币<\/h3>/);
  h.api.unmount();h.api.mount(kind,h.host,{lottery:clone(next)});assert.ok(h.host.querySelector('.lottery-stage.is-idle'));assert.doesNotMatch(h.host.innerHTML,/<h3>95 金币<\/h3>/);assert.match(h.host.innerHTML,/<span>95 金币<span class="lottery-history-kind">随机金币<\/span>/);assert.equal(h.revealStarts,1);
});

test('a late receipt after leaving and returning to the same machine never replaces its cabinet',async()=>{
  const h=harness();h.emit('draw');h.api.unmount();h.api.mount('coin',h.host,{lottery:lottery()});
  assert.ok(h.host.querySelector('.lottery-stage.is-idle'));const next=lottery({revision:11,history:[{machine:'coin',drawnAt:'2026-09-30T12:00:00+08:00',result:outcome()}]});
  h.mutations()[0].resolve(receipt('coin','draw',{lottery:next}));await h.flush();assert.equal(h.receipts.length,1);assert.ok(h.host.querySelector('.lottery-stage.is-idle'));assert.doesNotMatch(h.host.innerHTML,/<h3>25 金币<\/h3>/);assert.match(h.host.innerHTML,/<span>25 金币<span class="lottery-history-kind">随机金币<\/span>/);assert.equal(h.revealStarts,0);assert.equal(h.sounds.length,0);
});

test('an explicitly confirmed uncertain draw may show its receipt in a new visit without spending again',async()=>{
  const h=harness();h.emit('draw');const operation=h.mutations()[0];operation.reject(new Error('暂未送到'));await h.flush();
  h.api.unmount();h.api.mount('coin',h.host,{lottery:lottery()});assert.ok(h.host.querySelector('.lottery-stage.is-idle'));h.emit('retry');assert.deepEqual(h.mutations()[1].body,operation.body);
  h.mutations()[1].resolve(receipt('coin','draw',{alreadyProcessed:true}));await h.flush();assert.match(h.host.innerHTML,/<h3>25 金币<\/h3>/);assert.equal(h.receipts.length,1);assert.equal(h.sounds.length,0);
});

test('rule and source entrances never expand text inside the machine page',()=>{
  const h=harness();assert.doesNotMatch(h.host.innerHTML,/<details|lottery-dialog-body|普通商品基础概率|抽奖券永久保留/);
  for(const id of ['rules-odds','rules-sources'])assert.equal(h.button(id).attributes['aria-haspopup'],'dialog');
  h.emit('rules-sources');const dialog=h.dialog;assert.equal(dialog.open,true);assert.equal(dialog.modalCalls,1);assert.match(dialog.innerHTML,/lottery-source-cards/);assert.match(dialog.innerHTML,/每天最多购买 10 张/);assert.match(dialog.innerHTML,/跨天、重启都会保留/);assert.doesNotMatch(dialog.innerHTML,/<details/);
  h.dialogEvent('click',{target:dialog.children.filter(node=>Object.hasOwn(node.dataset,'lotteryClose')).at(-1)});assert.equal(h.dialog,null);assert.equal(h.host.appended.length,0);assert.equal(h.document.activeElement,h.button('rules-sources'));
});

test('currency probability tables use complete server bands and clearly separate conditional amount chances',()=>{
  const initial=limitedLottery(),item=initial.machines[0];
  item.odds[0].percent=63.875;item.odds[0].amountBands=[{min:50,max:100,percent:85},{min:101,max:200,percent:14},{min:300,max:500,percent:.9},{min:600,max:1000,percent:.1}];
  item.odds[1].amountBands=[{min:1,max:1,percent:90},{min:2,max:3,percent:9},{min:4,max:8,percent:.9},{min:25,max:40,percent:.1}];
  const h=harness(initial);h.emit('rules-odds');const html=h.dialog.innerHTML;
  assert.match(html,/两层概率，各自合计为 100%/);assert.match(html,/63.875<small>%<\/small>/);assert.match(html,/抽到金币之后，再决定数量/);assert.match(html,/抽到钻石之后，再决定数量/);
  assert.equal((html.match(/<table class="lottery-band-table"/g)||[]).length,2);assert.equal((html.match(/<tr(?: class="is-grand")?><td>/g)||[]).length,8);
  for(const text of ['50–100','101–200','300–500','600–1000','85%','14%','0.9%','0.1%'])assert.ok(html.includes(text));
  assert.match(html,/<td>1 <small>钻石<\/small><\/td>/);assert.doesNotMatch(html,/1–1/);assert.match(html,/<th scope="col">数量概率<\/th>/);
});

test('rule books escape server copy and reject malformed amount bands without hiding valid legacy rules',()=>{
  const data=lottery();Object.assign(data.machines[0].odds[0],{label:'<img onerror=boom>',typical:'<script>bad</script>',amountBands:[{min:'<img>',max:2,percent:50},{min:5,max:1,percent:50},{min:2,max:5,percent:101}]});
  const h=harness(data);h.emit('rules-odds');assert.match(h.dialog.innerHTML,/&lt;img/);assert.match(h.dialog.innerHTML,/&lt;script/);assert.match(h.dialog.innerHTML,/2—1000 金币/);assert.doesNotMatch(h.dialog.innerHTML,/<img|<script|NaN|lottery-band-table/);
});

test('native rule books trap both tab directions and restore the entrance on Escape',()=>{
  const h=harness();h.emit('rules-odds');const dialog=h.dialog,buttons=dialog.querySelectorAll('button:not([disabled])'),first=buttons[0],last=buttons.at(-1);
  assert.equal(h.document.activeElement,first);assert.equal(h.dialogEvent('keydown',{key:'Tab',shiftKey:true}).defaultPrevented,true);assert.equal(h.document.activeElement,last);
  assert.equal(h.dialogEvent('keydown',{key:'Tab'}).defaultPrevented,true);assert.equal(h.document.activeElement,first);
  assert.equal(h.dialogEvent('keydown',{key:'Tab'}).defaultPrevented,false);assert.equal(h.dialogEvent('keydown',{key:'Escape'}).defaultPrevented,true);assert.equal(h.dialog,null);assert.equal(h.document.activeElement,h.button('rules-odds'));assert.ok(h.host.querySelector('.lottery-stage.is-idle'));
});

test('only an outside backdrop click closes the rule book, and native cancellation also cleans up',()=>{
  const h=harness();h.emit('rules-odds');const dialog=h.dialog;
  h.dialogEvent('click',{clientX:100,clientY:100});assert.equal(h.dialog,dialog);
  h.dialogEvent('click',{clientX:10,clientY:100});assert.equal(h.dialog,null);assert.equal(h.host.appended.length,0);
  h.emit('rules-sources');assert.equal(h.dialogEvent('cancel').defaultPrevented,true);assert.equal(h.dialog,null);assert.equal(h.document.activeElement,h.button('rules-sources'));
  h.emit('rules-odds');h.dialog.close();assert.equal(h.dialog,null);assert.equal(h.host.appended.length,0);
});

test('unmount removes the native modal and its handlers, while hidden entrances cannot open it',()=>{
  const h=harness();h.emit('rules-odds');const dialog=h.dialog;h.api.unmount();assert.equal(dialog.open,false);assert.equal(h.dialog,null);assert.equal(h.host.appended.length,0);
  for(const type of ['click','cancel','close','keydown'])assert.equal(dialog.listeners[type].length,0);
  h.api.mount('diamond',h.host,{lottery:lottery()});h.document.hidden=true;h.emit('rules-odds');assert.equal(h.dialog,null);h.document.hidden=false;h.active=false;h.emit('rules-sources');assert.equal(h.dialog,null);
  assert.match(css,/:root\[data-interface-tone="light"\] \.lottery-rules-dialog/);assert.match(css,/max-height:min\(850px,88vh\)/);assert.match(css,/\.lottery-dialog-body\{min-height:0;overflow-y:auto/);
});

test('a receipt arriving while rules are open is shown once after closing without interrupting the modal',async()=>{
  const h=harness();h.emit('draw');h.emit('rules-odds');const dialog=h.dialog,writes=h.host.writes;
  h.mutations()[0].resolve(receipt());await h.flush();assert.equal(h.dialog,dialog);assert.equal(dialog.open,true);assert.equal(h.host.writes,writes);assert.equal(h.revealStarts,0);assert.equal(h.receipts.length,1);
  h.dialogEvent('keydown',{key:'Escape'});assert.match(h.host.innerHTML,/<h3>25 金币<\/h3>/);assert.equal(h.revealStarts,1);h.endAnimation('animationend');h.api.render({lottery:receipt().lottery});assert.equal(h.revealStarts,1);
});


function exchangeReceipt(kind,initial=lottery(),patch={}){
  const data=clone(initial),amount=data.machines.find(row=>row.id===kind).exchange.cost;
  data.revision++;data.playTickets.available-=amount;data.tickets[kind]++;
  const arcade={now:'2026-09-30T19:00:00+08:00',revision:data.revision,available:data.playTickets.available,persistentTickets:true,earned:4,purchased:0,used:0,canPlay:true,playsRemaining:11};
  return {lottery:data,arcade,quests:{lottery:data,wallet:data.wallet},result:{type:'ticket',machine:kind,amount:1,source:'playTicketExchange',playTicketsSpent:amount},alreadyProcessed:false,now:arcade.now,...patch};
}

for(const kind of ['coin','diamond'])test(`${kind} exchanges the server-defined number of persistent play tickets, without drawing or local credits`,async()=>{
  const data=lottery({tickets:{coin:0,diamond:0}}),h=harness(data,kind),amount=kind==='coin'?2:4;
  assert.match(h.host.innerHTML,/累计游玩券 <b>10<\/b> 张/);assert.match(h.host.innerHTML,new RegExp(`用 ${amount} 张游玩券兑换`));assert.equal(h.button('exchange').attributes['aria-disabled'],'false');
  h.emit('exchange');h.emit('exchange');h.emit('buy');h.emit('draw');assert.equal(h.mutations().length,1);assert.equal(h.receipts.length,0);assert.match(h.host.innerHTML,/累计游玩券 <b>10<\/b> 张/);
  assert.equal(h.mutations()[0].path,'/api/lottery/exchange');assert.deepEqual(h.mutations()[0].body,{machine:kind,requestId:'00000000-0000-4000-8000-000000000001'});
  const result=exchangeReceipt(kind,data);h.mutations()[0].resolve(result);await h.flush();
  assert.equal(h.receipts.length,1);assert.equal(h.receipts[0].arcade.available,10-amount);assert.equal(h.receipts[0].result.playTicketsSpent,amount);assert.deepEqual(h.receipts[0].lottery.wallet,data.wallet);assert.equal(h.receipts[0].lottery.machines.find(row=>row.id===kind).purchasesToday,0);
  assert.match(h.host.innerHTML,new RegExp(`累计游玩券 <b>${10-amount}<\/b> 张`));assert.equal(h.button('draw').attributes['aria-disabled'],'false');assert.ok(h.host.querySelector('.lottery-stage.is-idle'));assert.equal(h.revealStarts,0);assert.equal(h.sounds[0][0],'purchase');assert.match(h.toasts[0][0],/已兑换/);assert.match(h.toasts[0][1],new RegExp(`已使用 ${amount} 张游玩券`));
  assert.match(h.rulesHTML('sources'),new RegExp(`${amount} 张游玩券，换 1 张`));assert.match(h.rulesHTML('sources'),/跨日永久保留/);assert.match(h.rulesHTML('sources'),/兑换不限次数，不占用每日购券额度/);
});

test('exchange eligibility requires the authoritative flag and enough play tickets, without using either currency wallet',()=>{
  const data=lottery({playTickets:{available:1,persistent:true},wallet:{coins:99999,diamonds:99999}}),h=harness(data);
  assert.equal(h.button('exchange').attributes['aria-disabled'],'true');assert.match(h.host.innerHTML,/还差 1 张游玩券/);h.emit('exchange');assert.equal(h.mutations().length,0);
  const denied=lottery({revision:11});denied.machines[0].exchange.canExchange=false;h.api.render({lottery:denied});h.emit('exchange');assert.equal(h.mutations().length,0);
  const custom=lottery({revision:12});custom.machines[0].exchange.cost=3;h.api.render({lottery:custom});assert.match(h.host.innerHTML,/用 3 张游玩券兑换/);h.emit('exchange');assert.equal(h.mutations().length,1);
});

test('lost exchange receipts serialize all operations and retry the original UUID even in a new visit',async()=>{
  const h=harness();h.emit('exchange');const first=h.mutations()[0];first.reject(new Error('响应遗失'));await h.flush();
  assert.match(h.host.innerHTML,/确认上次兑换/);h.emit('draw');h.emit('buy');h.emit('exchange');assert.equal(h.mutations().length,1);
  h.api.unmount();h.api.mount('coin',h.host,{lottery:lottery()});h.emit('retry');assert.deepEqual(h.mutations()[1].body,first.body);assert.equal(h.mutations()[1].path,first.path);
  h.mutations()[1].resolve(exchangeReceipt('coin',lottery(),{alreadyProcessed:true}));await h.flush();assert.equal(h.receipts.length,1);assert.equal(h.sounds.length,0);assert.equal(h.revealStarts,0);assert.ok(h.host.querySelector('.lottery-stage.is-idle'));
});

test('mismatched or incomplete exchange proofs remain confirmable and cannot credit ticket balance',async()=>{
  for(const bad of [{result:{type:'ticket',machine:'coin',amount:1,source:'other',playTicketsSpent:2}},{result:{type:'ticket',machine:'coin',amount:1,source:'playTicketExchange',playTicketsSpent:4}},{arcade:null},{arcade:{available:999,persistentTickets:true}},{arcade:{available:8,persistentTickets:false}}]){
    const h=harness();h.emit('exchange');h.mutations()[0].resolve(exchangeReceipt('coin',lottery(),bad));await h.flush();assert.equal(h.receipts.length,0);assert.ok(h.button('retry'));assert.equal(h.revealStarts,0);assert.match(h.host.innerHTML,/累计游玩券 <b>10<\/b> 张/);
  }
});

test('exchange receipts keep a current draw result without replaying it, and later polls cannot restore spent play tickets',async()=>{
  const h=harness();h.emit('draw');const draw=receipt();h.mutations()[0].resolve(draw);await h.flush();assert.equal(h.revealStarts,1);h.endAnimation('animationend');
  h.emit('exchange');const result=exchangeReceipt('coin',draw.lottery);h.mutations()[1].resolve(result);await h.flush();assert.match(h.host.innerHTML,/<h3>25 金币<\/h3>/);assert.equal(h.revealStarts,1);assert.equal(h.sounds.at(-1)[0],'purchase');
  h.api.render({lottery:clone(draw.lottery)});assert.match(h.host.innerHTML,/累计游玩券 <b>8<\/b> 张/);assert.equal(h.revealStarts,1);
  h.api.unmount();h.api.mount('coin',h.host,{lottery:clone(result.lottery)});assert.ok(h.host.querySelector('.lottery-stage.is-idle'));assert.equal(h.revealStarts,1);
});

test('late exchange receipts update both server snapshots without changing an abandoned page or making sound',async()=>{
  const h=harness();h.emit('exchange');h.api.unmount();const writes=h.host.writes;h.mutations()[0].resolve(exchangeReceipt('coin'));await h.flush();
  assert.equal(h.receipts.length,1);assert.equal(h.receipts[0].arcade.available,8);assert.equal(h.host.writes,writes);assert.equal(h.sounds.length,0);assert.equal(h.revealStarts,0);
});

test('legacy lottery snapshots without exchange rules do not invent a conversion or balance',()=>{
  const data=lottery();delete data.playTickets;for(const item of data.machines)delete item.exchange;const h=harness(data);
  assert.equal(h.button('exchange'),null);assert.doesNotMatch(h.host.innerHTML,/lottery-exchange|累计游玩券/);assert.doesNotMatch(h.rulesHTML('sources'),/把游玩券留给幸运/);
});


test('modified, hidden and modal-blocked clicks cannot spend play tickets',()=>{
  const h=harness();for(const patch of [{button:2},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true}])h.emit('exchange',patch);
  h.document.hidden=true;h.emit('exchange');h.document.hidden=false;h.emit('rules-odds');h.emit('exchange');assert.equal(h.mutations().length,0);h.dialogEvent('keydown',{key:'Escape'});h.emit('exchange');assert.equal(h.mutations().length,1);
});


test('expanded collections render all twelve prizes per machine and preserve owned old prizes and pity counts',()=>{
 const data=limitedLottery();
 for(const machine of data.machines){
  machine.pity={count:machine.id==='coin'?19:11,limit:machine.id==='coin'?40:25,remaining:machine.id==='coin'?21:14,allCollected:false};
  const originals=machine.collection.map(row=>({...row,owned:true}));
  machine.collection=[...originals,...Array.from({length:6},(_,index)=>({id:`relic-new-${machine.id}-${index}`,slot:'relic',name:`新增藏品 ${index+1}`,description:'新的独特外观。',lotteryOnly:true,lotteryMachine:machine.id,owned:false}))];
  machine.pool.lotteryOnlyItems=6;machine.pool.lotteryOnlyTotal=12;
 }
 const h=harness(data);
 assert.match(h.host.innerHTML,/19 \/ 40/);assert.match(h.host.innerHTML,/最多再抽 21 次/);assert.match(h.host.innerHTML,/6 \/ 12 已收藏/);
 assert.equal((h.host.innerHTML.match(/class="lottery-collection-card/g)||[]).length,12);
 assert.equal((h.host.innerHTML.match(/✓ 已收藏/g)||[]).length,6);
 h.api.mount('diamond',h.host,{lottery:data});
 assert.match(h.host.innerHTML,/11 \/ 25/);assert.match(h.host.innerHTML,/最多再抽 14 次/);
 assert.equal((h.host.innerHTML.match(/class="lottery-collection-card/g)||[]).length,12);
 assert.match(h.host.innerHTML,/新增藏品 6/);
});

test('ordinary pool rules display collected counts over eligible totals and follow newly acquired items without touching probabilities',()=>{
  const data=limitedLottery();Object.assign(data.machines[0].pool,{coinItems:138,coinItemsTotal:152,coinItemsOwned:14,diamondItems:140,diamondItemsTotal:142,diamondItemsOwned:2,lotteryOnlyItems:10,lotteryOnlyTotal:12});
  Object.assign(data.machines[1].pool,{coinItems:0,coinItemsTotal:0,coinItemsOwned:0,diamondItems:140,diamondItemsTotal:142,diamondItemsOwned:2,lotteryOnlyItems:11,lotteryOnlyTotal:12});
  const h=harness(data),html=h.rulesHTML('odds');
  assert.match(html,/<strong>金币商品<\/strong>/);assert.match(html,/<strong>钻石商品<\/strong>/);
  assert.match(html,/14 \/ 152 件已收藏 · 仅抽未拥有的商品/);assert.match(html,/2 \/ 142 件已收藏/);assert.match(html,/2 \/ 12 件已收藏 · 仅抽未拥有的限定藏品/);assert.doesNotMatch(html,/138 款可抽/);
  assert.match(html,/集齐后换成 35 金币/);
  const next=clone(data);next.revision++;next.machines[0].pool.coinItemsOwned++;next.machines[0].pool.coinItems--;
  h.api.render({lottery:next});assert.match(h.rulesHTML('odds'),/15 \/ 152 件已收藏/);assert.deepEqual(next.machines[0].odds,data.machines[0].odds);
  h.api.mount('diamond',h.host,{lottery:next});const diamond=h.rulesHTML('odds');assert.match(diamond,/2 \/ 142 件已收藏/);assert.match(diamond,/1 \/ 12 件已收藏/);assert.doesNotMatch(diamond,/<strong>金币商品<\/strong>/);
  assert.equal(h.mutations().length,0);
});

test('pool totals reject malformed owned counts and remain compatible with legacy remaining-only snapshots',()=>{
  const data=lottery();Object.assign(data.machines[0].pool,{coinItemsTotal:152,coinItemsOwned:'<img>',diamondItemsTotal:142,diamondItemsOwned:999});
  const h=harness(data),html=h.rulesHTML('odds');assert.doesNotMatch(html,/<img|999 \/ 142|NaN/);assert.match(html,/200 款可抽/);assert.match(html,/80 款可抽/);
});

test('both ticket-source dialogs explain the mixed main-island gift and independent cross-day method rounds',()=>{
  const h=harness();let html=h.rulesHTML('sources');
  assert.match(html,/打开主岛礼盒：1 张金币抽奖券 ＋ 1 张钻石抽奖券/);assert.match(html,/每科当天的两档奖励都领取：1 张/);assert.match(html,/与普通委托分别累计/);
  h.api.mount('diamond',h.host,{lottery:lottery()});html=h.rulesHTML('sources');
  assert.match(html,/每累计完成并领齐 3 轮单科两档奖励：1 张/);assert.match(html,/进度跨日保留，可重复练习同一科/);assert.match(html,/打开主岛礼盒：1 张金币抽奖券 ＋ 1 张钻石抽奖券/);
  assert.match(html,/融会贯通/);assert.equal(h.mutations().length,0);
});

for(const kind of ['coin','diamond'])test(`the ${kind} lottery uses the shared currency art for tickets and the saved result without restarting its reveal`,async()=>{
  const h=harness(lottery(),kind);h.context.FocusCurrencyArt=require('../static/currency-art.js');h.api.render({lottery:lottery()});
  assert.match(h.host.innerHTML,new RegExp(`data-currency-symbol="${kind==='coin'?'coins':'diamonds'}"`));
  h.emit('draw');const draw=receipt(kind);h.mutations()[0].resolve(draw);await h.flush();
  assert.match(h.host.innerHTML,/lottery-prize-currency/);assert.match(h.host.innerHTML,new RegExp(`class="currency-icon currency-icon-${kind==='coin'?'coins':'diamonds'} lottery-prize-currency"`));
  const writes=h.host.writes;h.api.render({lottery:clone(draw.lottery)});assert.equal(h.host.writes,writes);assert.equal(h.revealStarts,1);
});
