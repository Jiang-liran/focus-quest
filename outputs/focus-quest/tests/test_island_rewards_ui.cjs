const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/island-rewards.js'),'utf8');
const day='2026-09-27';
const copy=value=>JSON.parse(JSON.stringify(value));
function snapshot({ids=['math','cs','politics','english','main'],date=day,today=day,claimed=[]}={}){
  const item=id=>({id,name:id,minutes:180,target:180,eligible:ids.includes(id),claimed:claimed.includes(id),available:ids.includes(id)&&!claimed.includes(id),reward:{coins:id==='main'?100:30,diamonds:id==='main'?4:1}});
  return {date,today,islandRewards:{day:date,today,isToday:date===today,subjects:['math','cs','politics','english'].map(item),main:item('main')}};
}
function receipt(id,patch={}){
  return {day,island:id,islandRewards:snapshot({claimed:[id]}).islandRewards,wallet:{coins:1000,diamonds:20},reward:{coins:id==='main'?100:30,diamonds:id==='main'?4:1},alreadyClaimed:false,...patch};
}
function harness(initial=snapshot()){
  const document={hidden:false,activeElement:null},elements=new Map();
  const requests=[],sounds=[],toasts=[],receipts=[],refreshes=[];let home=true,refreshFails=false,unlocks=0;
  class Element{
    constructor(id='',parent=null){this.id=id;this.parent=parent;this.dataset={};this.attributes={};this.children=[];this.listeners={};this.hidden=false;this.writes=0;this._html='';}
    set innerHTML(html){this._html=html;this.writes++;this.children=[];
      for(const match of html.matchAll(/<g\b([^>]*data-island-gift="[^"]+"[^>]*)>/g)){
        const child=new Element('',this);
        for(const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)){child.attributes[attr[1]]=attr[2];if(attr[1]==='data-island-gift')child.dataset.islandGift=attr[2];}
        this.children.push(child);
      }
    }
    get innerHTML(){return this._html;}
    contains(node){return this===node||this.children.includes(node);}
    closest(selector){return selector==='[data-island-gift]'&&this.dataset.islandGift?this:null;}
    querySelector(selector){const id=selector.match(/data-island-gift="([^"]+)"/)?.[1];return this.children.find(node=>!id||node.dataset.islandGift===id)||null;}
    focus(){document.activeElement=this;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  }
  function element(id){if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);}
  document.getElementById=element;
  const context=vm.createContext({document});vm.runInContext(source,context);
  const api=context.FocusIslandRewards;
  api.init({api:(path,body)=>new Promise((resolve,reject)=>requests.push({path,body,resolve,reject})),
    refresh:async(...args)=>{refreshes.push(args);if(refreshFails)throw new Error('刷新失败');},
    toast:(...args)=>toasts.push(args),playSound:(...args)=>sounds.push(args),acceptReceipt:r=>receipts.push(r),unlock:()=>unlocks++,isHome:()=>home});
  api.render(initial);
  const host=element('island-rewards');
  function emit(id,type='click',patch={}){
    const target=host.querySelector(`[data-island-gift="${id}"]`);
    assert.ok(target,`gift ${id} is visible`);
    const event={target,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},...patch};
    for(const handler of host.listeners[type]||[])handler(event);
    return event;
  }
  async function flush(){for(let i=0;i<6;i++)await Promise.resolve();}
  return {api,host,element,document,requests,sounds,toasts,receipts,refreshes,emit,flush,
    set home(value){home=value;},set refreshFails(value){refreshFails=value;},get unlocks(){return unlocks;}};
}

test('the five gifts have island palettes and accessible, exact reward labels',()=>{
  const h=harness();assert.equal(h.host.children.length,5);
  for(const id of ['math','cs','politics','english','main']){
    const button=h.host.querySelector(`[data-island-gift="${id}"]`);
    assert.equal(button.attributes.role,'button');assert.equal(button.attributes.tabindex,'0');assert.equal(button.attributes['data-skin-block'],'true');
    assert.match(button.attributes['aria-label'],id==='main'?/100金币和4钻石/:/30金币和1钻石/);
  }
  const colors=h.host.children.map(node=>node.attributes.style.match(/--gift-color:([^;]+)/)[1]);
  assert.equal(new Set(colors).size,5);
});

test('only today’s eligible and unclaimed islands can show gifts',()=>{
  const h=harness(snapshot({ids:['math','english'],claimed:['math']}));assert.equal(h.host.children.length,1);assert.equal(h.host.children[0].dataset.islandGift,'english');
  h.api.render(snapshot({date:'2026-09-26'}));assert.equal(h.host.hidden,true);
  const invalid=snapshot();invalid.islandRewards.isToday=false;h.api.render(invalid);assert.equal(h.host.hidden,true);
  invalid.islandRewards.isToday=true;invalid.islandRewards.day='2026-09-26';h.api.render(invalid);assert.equal(h.host.hidden,true);
});

test('main gift announces both ticket types and respects authoritative ticket amounts',()=>{
  const state=snapshot();state.islandRewards.main.lotteryTickets={coinTickets:1,diamondTickets:1};
  const h=harness(state);
  assert.match(h.host.querySelector('[data-island-gift="main"]').attributes['aria-label'],/1张金币抽奖券和1张钻石抽奖券/);
  assert.match(h.host.querySelector('[data-island-gift="math"]').attributes['aria-label'],/另有1张金币抽奖券$/);
  state.islandRewards.main.lotteryTickets={coinTickets:0,diamondTickets:1};h.api.render(state);
  const oldLabel=h.host.querySelector('[data-island-gift="main"]').attributes['aria-label'];
  assert.match(oldLabel,/另有1张钻石抽奖券$/);assert.doesNotMatch(oldLabel,/金币抽奖券/);
  state.islandRewards.main.lotteryTickets={coinTickets:0,diamondTickets:0};h.api.render(state);
  assert.doesNotMatch(h.host.querySelector('[data-island-gift="main"]').attributes['aria-label'],/抽奖券/);
});

test('preview and replay cannot turn simulated progress into claimable rewards',()=>{
  const h=harness();
  for(const mode of ['preview','replay']){h.api.render(snapshot(),{mode});assert.equal(h.host.hidden,true);assert.equal(h.host.innerHTML,'');}
  h.api.render(snapshot(),{mode:'live'});assert.equal(h.host.children.length,5);assert.equal(h.requests.length,0);
});

test('polling the same state keeps gift nodes and animation phases intact',()=>{
  const h=harness(),node=h.host.children[0],writes=h.host.writes;node.focus();
  for(let i=0;i<20;i++)h.api.render(copy(snapshot()));
  assert.equal(h.host.writes,writes);assert.equal(h.host.children[0],node);assert.equal(h.document.activeElement,node);
});

test('claim has one in-flight transaction; clicks and keyboard do not enter the island',async()=>{
  const h=harness(),click=h.emit('math');
  assert.equal(click.defaultPrevented,true);assert.equal(click.stopped,true);
  h.emit('math');h.emit('cs','keydown',{key:'Enter'});assert.equal(h.requests.length,1);assert.equal(h.unlocks,1);
  assert.deepEqual(copy(h.requests[0].body),{day,island:'math'});assert.equal(h.requests[0].path,'/api/island-rewards/claim');
  assert.ok(h.host.children.every(node=>node.attributes['aria-disabled']==='true'));
  h.requests[0].resolve(receipt('math'));await h.flush();
  assert.equal(h.host.children.length,4);assert.equal(h.host.querySelector('[data-island-gift="math"]'),null);
  assert.deepEqual(copy(h.sounds),[['delivery',{key:`island-gift:${day}:math`}]]);assert.equal(h.receipts.length,1);assert.equal(h.refreshes.length,1);
  h.api.render(snapshot());assert.equal(h.host.children.length,4,'stale pre-claim poll cannot resurrect a received gift');
});

test('Enter and Space work, repeated keydown does not spend a reward twice',async()=>{
  const h=harness();h.emit('math','keydown',{key:'Enter',repeat:true});assert.equal(h.requests.length,0);
  const enter=h.emit('math','keydown',{key:'Enter'});assert.equal(enter.stopped,true);h.requests[0].resolve(receipt('math'));await h.flush();
  h.emit('main','keydown',{key:' '});assert.equal(h.requests.length,2);h.requests[1].resolve(receipt('main'));await h.flush();
  assert.equal(h.sounds.at(-1)[0],'victory');assert.match(h.toasts.at(-1)[1],/100 金币.*4 钻石/);
});

test('right click, modified clicks and already handled gestures never claim a gift',()=>{
  const h=harness();
  for(const patch of [{button:2},{button:1},{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{defaultPrevented:true}])h.emit('math','click',patch);
  h.emit('math','keydown',{key:'Enter',defaultPrevented:true});h.emit('math','keydown',{key:' ',ctrlKey:true});
  assert.equal(h.requests.length,0);
});

test('a lost response can be retried without replaying a previously settled reward',async()=>{
  const h=harness();h.emit('math');h.requests[0].reject(new Error('网络中断'));await h.flush();
  assert.ok(h.host.querySelector('[data-island-gift="math"]'));assert.equal(h.sounds.length,0);assert.equal(h.toasts[0][2],true);
  h.emit('math');h.requests[1].resolve(receipt('math',{alreadyClaimed:true}));await h.flush();
  assert.equal(h.host.querySelector('[data-island-gift="math"]'),null);assert.equal(h.sounds.length,0);assert.match(h.toasts.at(-1)[0],/已经收好/);
});

test('an acknowledged gift stays gone if wallet refresh fails',async()=>{
  const h=harness();h.refreshFails=true;h.emit('english');h.requests[0].resolve(receipt('english'));await h.flush();
  assert.equal(h.host.querySelector('[data-island-gift="english"]'),null);assert.equal(h.toasts.length,1);assert.equal(h.sounds.length,1);
  h.api.render(snapshot());assert.equal(h.host.querySelector('[data-island-gift="english"]'),null);
});

test('successful keyboard claim keeps focus usable without reopening a dialog',async()=>{
  const h=harness(snapshot({ids:['math']}));h.host.children[0].focus();
  h.emit('math','keydown',{key:'Enter'});assert.equal(h.document.activeElement.dataset.islandGift,'math');
  h.requests[0].resolve(receipt('math',{islandRewards:snapshot({ids:['math'],claimed:['math']}).islandRewards}));await h.flush();
  assert.equal(h.host.hidden,true);assert.equal(h.document.activeElement,h.element('citadel-enter'));
});

test('offscreen interaction is ignored and late receipts preserve the newly selected day',async()=>{
  const h=harness();h.document.hidden=true;h.emit('math');h.document.hidden=false;h.home=false;h.emit('math');assert.equal(h.requests.length,0);
  h.home=true;h.emit('math');h.api.render(snapshot({date:'2026-09-26'}));h.requests[0].resolve(receipt('math'));await h.flush();
  assert.equal(h.host.hidden,true);assert.equal(h.receipts.length,1);
  h.api.render(snapshot({date:'2026-09-28',today:'2026-09-28'}));assert.equal(h.host.children.length,5,'the next day has independent rewards');
});
