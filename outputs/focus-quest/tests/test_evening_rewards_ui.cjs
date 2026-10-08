const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/evening-rewards.js'),'utf8');
const currency=require('../static/currency-art.js'),day='2026-10-03',copy=v=>JSON.parse(JSON.stringify(v));
const rewards=[[40,1,0,0],[50,1,1,0],[60,2,1,0],[70,2,1,1],[80,3,1,1],[100,4,2,1],[120,5,2,2]],targets=[30,60,90,120,150,185,220];
function night(date=day,minutes=150,claimed=[]){const gifts=rewards.map(([coins,diamonds,coinTickets,diamondTickets],i)=>({day:date,index:i+1,target:targets[i],tier:i<5?'base':'extra',eligible:minutes>=targets[i],claimed:claimed.includes(i+1),available:minutes>=targets[i]&&!claimed.includes(i+1),reward:{coins,diamonds},lotteryTickets:{coinTickets,diamondTickets}}));return {day:date,minutes,gifts,availableCount:gifts.filter(g=>g.available).length,claimedCount:claimed.length};}
function snapshot(options={}){return {now:options.now||day+'T21:30:00.000100+08:00',evening:{...night(day,options.minutes??150,options.claimed||[]),status:options.status||'active',baseCount:5,baseTarget:150,pendingDays:options.pending||[]}};}
function receipt(index=1,options={}){return {day,index,alreadyClaimed:false,reward:{coins:rewards[index-1][0],diamonds:rewards[index-1][1]},ticketGrants:[],quests:snapshot({claimed:[index],now:day+'T21:30:00.000200+08:00'}),...options};}
function harness(initial=snapshot()){
  const document={hidden:false,activeElement:null},requests=[],receipts=[],sounds=[],toasts=[],refreshes=[];let active=true,refreshFails=false,decorations=0;
  class Element{
    constructor(parent=null){this.parentElement=parent;this.dataset={};this.children=[];this.listeners={};this.hidden=false;this.inert=false;this._html='';this.writes=0;this.disabled=false;}
    set innerHTML(value){this._html=value;this.writes++;this.children=[];for(const [,attrs] of value.matchAll(/<button\b([^>]+)>/g)){const b=new Element(this);b.disabled=/\bdisabled\b/.test(attrs);for(const [,name,v] of attrs.matchAll(/([\w-]+)="([^"]*)"/g))if(name.startsWith('data-'))b.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;this.children.push(b);}}
    get innerHTML(){return this._html;}
    contains(node){return node===this||this.children.includes(node);}
    closest(selector){return selector==='[data-evening-claim]'&&this.dataset.eveningClaim?this:null;}
    querySelector(selector){const id=selector.match(/data-evening-claim="([^"]+)"/)?.[1];return this.children.find(b=>id?b.dataset.eveningClaim===id:selector==='.eve-open:not(:disabled)'&&!b.disabled)||null;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    focus(){document.activeElement=this;}
  }
  const parent=new Element(),host=new Element(parent);document.getElementById=id=>id==='evening-rewards'?host:null;
  const context=vm.createContext({document,FocusCurrencyArt:currency,QuestArt:{avatar:()=>'<svg class="mentor"></svg>'},FocusProgressBars:{decorate:()=>decorations++}});vm.runInContext(source,context);
  const api=context.FocusEveningRewards,bridge={api:(path,body)=>new Promise((resolve,reject)=>requests.push({path,body:copy(body),resolve,reject})),isVisible:()=>active,acceptReceipt:r=>receipts.push(copy(r)),playSound:(...args)=>sounds.push(copy(args)),toast:(...args)=>toasts.push(args),refresh:async()=>{refreshes.push(true);if(refreshFails)throw Error('offline');}};
  api.init(bridge);api.render(initial);
  const button=i=>host.querySelector(`[data-evening-claim="${i}"]`);
  const emit=(i,patch={})=>{const target=button(i);assert.ok(target);const event={target,preventDefault(){},...patch};for(const fn of host.listeners.click||[])fn(event);};
  const select=value=>{for(const fn of host.listeners.change||[])fn({target:{value,matches:s=>s==='[data-evening-day-select]'}});};
  const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
  return {api,host,parent,document,requests,receipts,sounds,toasts,refreshes,button,emit,select,flush,bridge,get decorations(){return decorations;},set active(v){active=v;},set refreshFails(v){refreshFails=v;}};
}
test('five regular gifts complete in 150 minutes, two optional extras have separate wording and progress',()=>{
  const h=harness();assert.equal(h.host.children.length,7);assert.ok(h.host.children.slice(0,5).every(b=>!b.disabled));assert.ok(h.host.children.slice(5).every(b=>b.disabled));
  assert.match(h.host.innerHTML,/守灯人 · 晚舟/);assert.match(h.host.innerHTML,/五份常规奖励已全部完成/);assert.match(h.host.innerHTML,/不需要每天追满/);assert.match(h.host.innerHTML,/aria-valuenow="100"/);assert.match(h.host.innerHTML,/300 金币、9 钻石、4 张金币抽奖券、2 张钻石抽奖券/);assert.match(h.host.innerHTML,/currency-icon-coins/);assert.match(h.host.innerHTML,/currency-icon-diamonds/);
});
test('stable polls retain nodes and animation phase without permanent timers',()=>{
  const h=harness(),b=h.button(1),writes=h.host.writes;b.focus();for(let i=0;i<30;i++)h.api.render(copy(snapshot()));assert.equal(h.host.writes,writes);assert.equal(h.button(1),b);assert.equal(h.document.activeElement,b);assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame/);
});
test('seven reward contents have distinct geometry while locked, available and received keep the same model identity',()=>{
  const collect=h=>[...h.host.innerHTML.matchAll(/<svg class="eve-gift-art"[^>]*>[\s\S]*?<\/svg>/g)].map(m=>m[0]);
  const locked=collect(harness(snapshot({minutes:0,status:'upcoming'}))),ready=collect(harness(snapshot({minutes:220}))),done=collect(harness(snapshot({minutes:220,claimed:[1,2,3,4,5,6,7]})));
  assert.equal(locked.length,7);
  const identities=svg=>svg.match(/data-gift-model="([^"]+)"/)[1];
  assert.equal(new Set(locked.map(identities)).size,7);
  assert.deepEqual(locked.map(identities),ready.map(identities));assert.deepEqual(ready.map(identities),done.map(identities));
  const shape=svg=>[...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(m=>m[1]).join('|');
  assert.equal(new Set(locked.map(shape)).size,7,'different color or label alone is not a different gift model');
  assert.ok(locked.every(s=>!s.includes('class="eve-sparks"')&&!s.includes('class="eve-halo"')));
  assert.ok(ready.every(s=>s.includes('class="eve-sparks"')));
  assert.ok(done.every(s=>s.includes('eve-received-seal')&&!s.includes('class="eve-sparks"')));
  const {spawnSync}=require('node:child_process');
  const result=spawnSync('python3',['-c','import sys,json,xml.etree.ElementTree as E\nfor s in json.load(sys.stdin):\n r=E.fromstring(s)\n assert not any(e.tag.endswith("script") for e in r.iter())\n assert not any("id" in e.attrib for e in r.iter())'],{input:JSON.stringify([...locked,...ready,...done]),encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
});
test('model grade follows actual ticket contents on a saved night rather than its ordinal position',()=>{
  const older=night('2026-10-02',220),state=snapshot({pending:[older]});
  [older.gifts[0].lotteryTickets,older.gifts[6].lotteryTickets]=[older.gifts[6].lotteryTickets,older.gifts[0].lotteryTickets];
  const h=harness(state);h.select(older.day);
  const models=[...h.host.innerHTML.matchAll(/<svg class="eve-gift-art"[^>]*data-gift-grade="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(models[0],'aurora');assert.equal(models[6],'warm');
  assert.deepEqual([older.gifts[0].lotteryTickets,older.gifts[6].lotteryTickets],[{coinTickets:2,diamondTickets:2},{coinTickets:0,diamondTickets:0}]);
  assert.equal(h.requests.length,0,'rendering a model must never redeem a gift');
});
test('clicks serialize, authoritative receipt updates once and stale microsecond poll is rejected',async()=>{
  const h=harness();h.button(1).focus();h.emit(1);h.emit(2);h.emit(1);assert.equal(h.requests.length,1);assert.deepEqual(h.requests[0].body,{day,index:1});assert.equal(h.requests[0].path,'/api/quests/evening/claim');assert.ok(h.host.children.every(b=>b.disabled));
  h.requests[0].resolve(receipt());await h.flush();assert.equal(h.receipts.length,1);assert.equal(h.sounds.length,1);assert.equal(h.refreshes.length,1);assert.ok(h.button(1).disabled);assert.equal(h.document.activeElement,h.button(2));const writes=h.host.writes;h.api.render(snapshot());assert.equal(h.host.writes,writes);h.emit(1);assert.equal(h.requests.length,1);
});
test('duplicate server receipt plays no reward sound and failed refresh cannot undo received gift',async()=>{
  const h=harness();h.refreshFails=true;h.emit(2);h.requests[0].resolve(receipt(2,{alreadyClaimed:true}));await h.flush();assert.equal(h.sounds.length,0);assert.equal(h.receipts.length,1);assert.ok(h.button(2).disabled);assert.match(h.toasts[0][0],/已经收好/);
});
test('failure or mismatched receipt leaves gift retryable and does not apply awards',async()=>{
  const h=harness();h.emit(1);h.requests[0].reject(Error('offline'));await h.flush();assert.equal(h.receipts.length,0);assert.equal(h.sounds.length,0);assert.equal(h.button(1).disabled,false);h.emit(1);h.requests[1].resolve(receipt(2));await h.flush();assert.equal(h.receipts.length,0);assert.equal(h.button(1).disabled,false);
});
test('upcoming, under threshold, inactive and hidden scenes do not claim',()=>{
  const h=harness(snapshot({minutes:29,status:'upcoming'}));h.emit(1);assert.equal(h.requests.length,0);assert.match(h.host.innerHTML,/18 点后积累/);h.api.render(snapshot({minutes:30}));h.active=false;h.emit(1);h.active=true;h.parent.hidden=true;h.emit(1);h.parent.hidden=false;h.document.hidden=true;h.emit(1);assert.equal(h.requests.length,0);
});
test('previous night can be selected and claimed with its own date, never todays index',async()=>{
  const old='2026-10-02',h=harness(snapshot({minutes:0,pending:[night(old,60)]}));h.select(old);assert.equal(h.button(1).dataset.eveningDay,old);h.emit(1);assert.deepEqual(h.requests[0].body,{day:old,index:1});h.requests[0].resolve(receipt(1,{day:old,quests:snapshot({minutes:0,pending:[night(old,60,[1])]})}));await h.flush();assert.ok(h.button(1).disabled);assert.equal(h.button(2).disabled,false);
});
test('initializing twice retains one delegated handler and text is escaped',()=>{
  const h=harness();h.api.init(h.bridge);assert.equal(h.host.listeners.click.length,1);const date='<img src=x>',state=snapshot({pending:[night(date,30)]});h.api.render(state);assert.doesNotMatch(h.host.innerHTML,/<img src=x>/);assert.match(h.host.innerHTML,/&lt;img src=x&gt;/);
});
test('section follows both daytime mentors, shares receipt bridge and advertises both ticket sources',()=>{
  const html=fs.readFileSync(require.resolve('../static/index.html'),'utf8'),app=fs.readFileSync(require.resolve('../static/app.js'),'utf8'),quests=fs.readFileSync(require.resolve('../static/quests.js'),'utf8'),lottery=fs.readFileSync(require.resolve('../static/lottery.js'),'utf8'),css=fs.readFileSync(require.resolve('../static/evening-rewards.css'),'utf8');
  assert.ok(html.indexOf('id="quest-board"')<html.indexOf('id="evening-rewards"'));assert.ok(html.indexOf('id="evening-rewards"')<html.indexOf('id="mystery-quest"'));assert.match(app,/FocusEveningRewards\?\.init\(\{api,toast,refresh,playSound,acceptReceipt:acceptLotteryReceipt/);assert.match(quests,/FocusEveningRewards\?\.render\(data\)/);assert.equal((lottery.match(/\['晚灯相伴'/g)||[]).length,2);assert.match(css,/prefers-reduced-motion/);assert.match(css,/var\(--ui-surface/);assert.match(css,/focus-runtime-hidden/);
});
