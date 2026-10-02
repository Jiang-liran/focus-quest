const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function snapshot(patch = {}) {
  return {date:'2026-09-25', today:'2026-09-25', dayRecordCount:104,
    totals:{minutes:240,target:480,percent:50},
    subjects:[{id:'math',name:'数学',minutes:240,target:180,percent:133.3},
      {id:'english',name:'英语',minutes:0,target:60,percent:0}],
    records:[1,2,3,4,5].map(i => ({name:`任务${i}`,minutes:15,day:'2026-09-25',end:`2026-09-25T1${i}:00:00+08:00`})),
    latestRecords:[{name:'别日记录不得出现在手记',day:'2026-09-24',end:'2026-09-24T16:00:00+08:00'}], ...patch};
}

function harness({quickFirst = true, missingRoom = false, motion = false, reducedMotion = false} = {}) {
  const nodes = new Map(), listeners = new Map(), timers = new Map(), animations = [];
  const calls = {afterClose:0, quickClose:[], citadelClose:[], choices:[], selection:[], pages:[], ambience:[]};
  let now = Date.parse('2026-09-25T10:00:00+08:00'), timerId = 0;
  const document = {activeElement:null};
  const dataKey = value => value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
  class Element {
    constructor(id, tag = 'div') {
      this.id=id; this.tagName=tag.toUpperCase(); this.parentElement=null; this.children=[];
      this.hidden=false; this.inert=false; this.disabled=false; this.attributes={}; this.dataset={}; this.style={};
      this.listeners=new Map(); this.classes=new Set(); this.scrollTop=0;
      this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),contains:name=>this.classes.has(name)};
      this.textContent=''; this._innerHTML=''; this.htmlWrites=0;
    }
    get isConnected() { return this===document.body || Boolean(this.parentElement?.isConnected); }
    set innerHTML(value) {
      assert.ok(['campfire-memory-records','campfire-study-stars'].includes(this.id), `Room must preserve existing conversation and scene nodes: ${this.id}`);
      this._innerHTML=String(value); this.htmlWrites++;
    }
    get innerHTML() { return this._innerHTML; }
    append(...children) { children.forEach(node=>{node.parentElement=this;this.children.push(node);}); }
    remove() { this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null; }
    matches(selector) {
      if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim()));
      if(selector==='dialog[open]')return this.tagName==='DIALOG'&&this.open;
      if(selector==='[hidden]')return this.hidden;
      if(selector==='[inert]')return this.inert;
      const data=selector.match(/^\[data-([\w-]+)\]$/);
      if(data)return Object.hasOwn(this.dataset,dataKey(data[1]));
      if(selector.startsWith('.'))return this.classes.has(selector.slice(1));
      if(selector.startsWith('#'))return this.id===selector.slice(1);
      return this.tagName===selector.toUpperCase();
    }
    closest(selector) { for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null; }
    querySelectorAll(selector) { return this.children.flatMap(node=>[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]); }
    getAttribute(name) { return this.attributes[name]??null; }
    setAttribute(name,value) { this.attributes[name]=String(value); }
    getClientRects() { for(let node=this;node;node=node.parentElement)if(node.hidden||node.displayNone)return [];return this.isConnected?[{}]:[]; }
    focus() { if(this.disabled||!this.getClientRects().length)return;for(let node=this;node;node=node.parentElement)if(node.inert)return;document.activeElement=this; }
    addEventListener(type,callback) { const list=this.listeners.get(type)||[];list.push(callback);this.listeners.set(type,list); }
    animate(keyframes,options) {
      let resolve,reject,finished;
      const animation={node:this,keyframes,options,cancelled:false,
        get finished(){return finished??=(new Promise((yes,no)=>{resolve=yes;reject=no;}));},
        finish(){resolve?.();},cancel(){this.cancelled=true;reject?.(new Error('cancelled'));}};
      animations.push(animation); return animation;
    }
  }
  function add(id,tag='div') { const node=new Element(id,tag);nodes.set(id,node);return node; }
  document.body=add('body','body');document.documentElement=add('html','html');
  if(!motion)document.documentElement.classList.add('no-motion');
  const main=add('main','main'),sidebar=add('sidebar','aside'),entry=add('campfire-room-open','button');
  sidebar.classes.add('sidebar');
  const room=add('campfire-room','section'),panel=add('panel'),close=add('campfire-room-close','button');
  const card=add('advice-card','aside'),line=add('advice-line'),next=add('advice-next','button'),scene=add('campfire-scene');
  line.textContent='今天的这句话保持不变。';
  const menu=add('quick-skins'),menuClose=add('quick-skin-close','button'),item=add('quick-item','button');
  document.body.append(main,sidebar,menu);main.append(entry);menu.append(menuClose,item);
  if(!missingRoom)document.body.append(room);
  room.append(panel);panel.append(close,scene,card);card.append(line,next);
  const ids=['campfire-place-name','campfire-place-detail','campfire-world-greeting','campfire-world-record',
    'campfire-map-total','campfire-map-target','campfire-map-copy','campfire-memory-summary','campfire-memory-records',
    'campfire-study-stars','campfire-rest-time','campfire-rest-status','campfire-rest-fill','campfire-rest-toggle','campfire-guide-advice'];
  ids.forEach(id=>card.append(add(id,id.endsWith('toggle')||id==='campfire-guide-advice'?'button':'div')));
  const stations={};const duties={};
  for(const id of ['guide','hearth','wanderer','stargazer']) {
    const station=add(`station-${id}`,'g');station.dataset.campStation=id;scene.append(station);stations[id]=station;
    const duty=add(`duty-${id}`);duty.dataset.campDuty=id;card.append(duty);duties[id]=duty;
  }
  room.hidden=true;menu.hidden=true;document.activeElement=entry;
  document.getElementById=id=>id==='campfire-room'&&!room.isConnected?null:nodes.get(id)||null;
  document.querySelectorAll=selector=>selector==='body > main'?[main]:document.body.querySelectorAll(selector);
  document.querySelector=selector=>document.querySelectorAll(selector)[0]||null;
  document.addEventListener=(type,fn,capture=false)=>{const list=listeners.get(type)||[];list.push({fn,capture:capture===true});listeners.set(type,list);};
  function emit(target,type,patch={}) {
    const event={target,key:'',shiftKey:false,defaultPrevented:false,stopped:false,
      preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...patch};
    for(const {fn,capture} of listeners.get(type)||[])if(capture&&!event.stopped)fn(event);
    for(let node=target;node&&!event.stopped;node=node.parentElement)for(const fn of node.listeners.get(type)||[])if(!event.stopped)fn(event);
    for(const {fn,capture} of listeners.get(type)||[])if(!capture&&!event.stopped)fn(event);
    return event;
  }
  const quick={close(restore=true){calls.quickClose.push(restore);const visible=!menu.hidden;menu.hidden=true;if(visible&&restore)line.focus();}};
  const bindQuick=()=>document.addEventListener('keydown',event=>{
    if(!menu.hidden&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();quick.close();}
  },true);
  class ClockDate extends Date { static now(){return now;} }
  const context=vm.createContext({document,Date:ClockDate,FocusQuickSkins:quick,
    FocusCitadel:{close(restore){calls.citadelClose.push(restore);}},
    FocusAmbience:{setScene(scene){calls.ambience.push(scene);}},
    FocusRecordTime:require('../static/record-time.js'),
    FocusCampfire:{choose(...args){calls.choices.push(args);}},
    FocusCampWorldArt:{setSelection(node,id){assert.equal(node,scene);calls.selection.push(id);}},
    matchMedia(query){assert.equal(query,'(prefers-reduced-motion: reduce)');return {matches:reducedMotion};},
    fetch(){throw new Error('Camp must not make network requests or write study records');},
    localStorage:{getItem(){throw new Error('Room must not read preferences');},setItem(){throw new Error('Room must not change rewards or preferences');}},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);},
  });
  if(quickFirst)bindQuick();
  vm.runInContext(fs.readFileSync(require.resolve('../static/campfire-room.js'),'utf8'),context);
  const api=context.FocusCampfireRoom;
  api.init({afterClose(){calls.afterClose++;},openPage(page){calls.pages.push(page);}});
  if(!quickFirst)bindQuick();
  function advance(milliseconds) {
    const until=now+milliseconds;
    while(true){const due=[...timers].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();}
    now=until;
  }
  return {api,calls,document,main,sidebar,room,panel,entry,close,card,line,next,scene,stations,duties,
    menu,menuClose,item,emit,add,context,animations,timers,advance,node:id=>nodes.get(id)};
}

test('opening preserves dialogue nodes, makes only main inert and restores its prior state',()=>{
  for(const mainInert of [false,true])for(const sideInert of [false,true]){
    const h=harness();h.main.inert=mainInert;h.sidebar.inert=sideInert;
    const original=[...h.card.children],text=h.line.textContent;
    assert.equal(h.api.open(),true);assert.equal(h.api.isOpen(),true);
    assert.equal(h.document.activeElement,h.close);assert.equal(h.main.inert,true);assert.equal(h.sidebar.inert,sideInert);
    assert.ok(h.document.documentElement.classList.contains('has-campfire-room'));
    assert.equal(h.api.close(),true);assert.equal(h.main.inert,mainInert);assert.equal(h.sidebar.inert,sideInert);
    if(!mainInert)assert.equal(h.document.activeElement,h.entry);
    assert.deepEqual(h.card.children,original);assert.equal(h.line.textContent,text);assert.equal(h.calls.afterClose,1);
    assert.ok(!h.document.documentElement.classList.contains('has-campfire-room'));
  }
});

test('repeated open/init/close is idempotent and preserves the first return anchor',()=>{
  const h=harness();h.api.init();h.api.init();h.api.open(h.entry);assert.equal(h.api.open(h.next),false);
  h.emit(h.close,'click');assert.equal(h.api.close(),false);assert.equal(h.calls.afterClose,1);
  assert.equal(h.document.activeElement,h.entry);assert.deepEqual(h.calls.citadelClose,[false]);assert.deepEqual(h.calls.quickClose,[false,false]);
});

test('sidebar remains available and Tab is not trapped inside the camp',()=>{
  const h=harness(),nav=h.add('navigation','button');h.sidebar.append(nav);h.api.open();nav.focus();
  assert.equal(h.document.activeElement,nav);assert.equal(h.sidebar.inert,false);
  for(const [node,shiftKey] of [[nav,false],[h.close,true],[h.next,false]]){
    node.focus();assert.equal(h.emit(node,'keydown',{key:'Tab',shiftKey}).defaultPrevented,false);assert.equal(h.document.activeElement,node);
  }
});

test('close(false) immediately restores the page for shop navigation and permits returning to camp',()=>{
  const h=harness({motion:true}),shop=h.add('shop','button');h.main.append(shop);h.api.open();
  h.api.close(false);shop.focus();assert.equal(h.document.activeElement,shop);assert.equal(h.main.inert,false);
  assert.equal(h.api.isOpen(),false);assert.equal(h.calls.afterClose,1);assert.ok(h.animations.every(a=>a.cancelled));
  h.api.open(shop);h.api.close(false);assert.equal(h.calls.afterClose,2);
});

test('opening from the city saves inert ownership only after the city restores it',()=>{
  const h=harness();h.main.inert=true;h.sidebar.inert=true;
  h.context.FocusCitadel.close=restore=>{assert.equal(restore,false);h.main.inert=false;h.sidebar.inert=false;};
  h.api.open();h.api.close();assert.equal(h.main.inert,false);assert.equal(h.sidebar.inert,false);
});

test('normal closing waits for the 520ms slide before hiding and restoring focus',async()=>{
  const h=harness({motion:true});h.api.open();const opening=[...h.animations];h.api.close();
  assert.ok(opening.every(a=>a.cancelled));assert.equal(h.api.isOpen(),true);assert.equal(h.main.inert,true);assert.equal(h.calls.afterClose,0);
  const exit=h.animations.filter(a=>a.node===h.room).at(-1);
  assert.equal(exit.options.duration,520);assert.equal(exit.keyframes.at(-1).transform,'translateX(105%)');
  assert.equal(h.api.close(),false);exit.finish();await Promise.resolve();
  assert.equal(h.api.isOpen(),false);assert.equal(h.main.inert,false);assert.equal(h.document.activeElement,h.entry);assert.equal(h.calls.afterClose,1);
});

test('reopening during closing cancels stale completion without hiding the new camp or losing the original anchor',async()=>{
  const h=harness({motion:true});h.api.open(h.entry);h.api.close();
  const exit=h.animations.filter(a=>a.node===h.room).at(-1);exit.finish();
  assert.equal(h.api.open(h.next),true);await Promise.resolve();
  assert.equal(h.api.isOpen(),true);assert.equal(h.main.inert,true);assert.equal(h.calls.afterClose,0);
  assert.equal(h.document.activeElement,h.close);h.api.close();h.animations.filter(a=>a.node===h.room).at(-1).finish();await Promise.resolve();
  assert.equal(h.document.activeElement,h.entry);assert.equal(h.calls.afterClose,1);
});

test('close(false) cancels a pending animated close without running afterClose twice',async()=>{
  const h=harness({motion:true});h.api.open();h.api.close();h.animations.filter(a=>a.node===h.room).at(-1).finish();
  h.api.close(false);await Promise.resolve();assert.equal(h.api.isOpen(),false);assert.equal(h.calls.afterClose,1);assert.equal(h.main.inert,false);
});

test('app no-motion and OS reduced-motion close synchronously without animation',()=>{
  for(const options of [{motion:false},{motion:true,reducedMotion:true}]){
    const h=harness(options);h.api.open();h.api.close();assert.equal(h.animations.length,0);assert.equal(h.api.isOpen(),false);assert.equal(h.calls.afterClose,1);
  }
});

for(const quickFirst of [true,false])test(`Escape dismisses quick appearances first with quick init ${quickFirst?'first':'last'}`,()=>{
  const h=harness({quickFirst});h.api.open();h.menu.hidden=false;h.item.focus();
  assert.ok(h.emit(h.item,'keydown',{key:'Escape'}).defaultPrevented);assert.equal(h.menu.hidden,true);assert.equal(h.api.isOpen(),true);
  assert.equal(h.document.activeElement,h.line);assert.equal(h.calls.afterClose,0);
  h.emit(h.line,'keydown',{key:'Escape'});assert.equal(h.api.isOpen(),false);assert.equal(h.document.activeElement,h.entry);assert.equal(h.calls.afterClose,1);
});

test('native dialogs have priority and empty camp ground never behaves as a dismissing backdrop',()=>{
  const h=harness(),native=h.add('native','dialog');h.document.body.append(native);native.open=true;
  assert.equal(h.api.open(),false);assert.equal(h.main.inert,false);native.open=false;h.api.open();native.open=true;native.focus();
  assert.equal(h.emit(native,'keydown',{key:'Escape'}).defaultPrevented,false);assert.equal(h.api.isOpen(),true);
  native.open=false;for(const node of [h.line,h.panel,h.room,h.scene])h.emit(node,'click');
  assert.equal(h.api.isOpen(),true);assert.equal(h.calls.afterClose,0);
});

test('removed, hidden, ancestor-hidden and unfocusable return anchors fall back to the visible camp entrance',()=>{
  for(const mode of ['removed','hidden','ancestor-hidden','ancestor-inert','css-hidden','disabled']){
    const h=harness(),view=h.add('shop-view'),anchor=h.add('shop-return','button');h.main.append(view);view.append(anchor);h.api.open(anchor);
    if(mode==='removed')anchor.remove();if(mode==='hidden')anchor.hidden=true;if(mode==='ancestor-hidden')view.hidden=true;
    if(mode==='ancestor-inert')view.inert=true;if(mode==='css-hidden')view.displayNone=true;if(mode==='disabled')anchor.disabled=true;
    h.api.close();assert.equal(h.document.activeElement,h.entry,mode);
  }
});

test('world station clicks and Enter/Space select each NPC and its appropriate topic',()=>{
  const h=harness();h.api.open();
  for(const [id,topic] of [['guide','advice'],['hearth','relax'],['wanderer','story'],['stargazer','relax']]){
    const child=h.add(`decoration-${id}`,'path');h.stations[id].append(child);
    h.emit(child,'click');assert.deepEqual(h.calls.choices.at(-1),[id,topic]);
    for(const key of ['Enter',' ']){const count=h.calls.choices.length;assert.ok(h.emit(child,'keydown',{key}).defaultPrevented);assert.equal(h.calls.choices.length,count+1);assert.deepEqual(h.calls.choices.at(-1),[id,topic]);}
  }
  const count=h.calls.choices.length;h.emit(h.stations.guide,'keydown',{key:'Enter',defaultPrevented:true});h.emit(h.stations.guide,'keydown',{key:'ArrowRight'});
  const unknown=h.add('unknown');unknown.dataset.campStation='__proto__';h.scene.append(unknown);h.emit(unknown,'click');assert.equal(h.calls.choices.length,count);
});

test('selection reveals one worktable and resets its scroll only when the character changes',()=>{
  const h=harness();h.api.open();
  for(const id of ['guide','hearth','wanderer','stargazer']){
    h.card.scrollTop=300;h.api.selectCharacter(id);assert.equal(h.room.dataset.station,id);assert.equal(h.calls.selection.at(-1),id);
    assert.equal(h.card.scrollTop,0);for(const [name,node] of Object.entries(h.duties))assert.equal(node.hidden,name!==id);
    h.card.scrollTop=150;h.api.selectCharacter(id);assert.equal(h.card.scrollTop,150,'poll must not reset reading position');
  }
  assert.equal(h.calls.choices.length,0,'draw selection must not recursively choose another line');h.api.selectCharacter('__proto__');assert.equal(h.room.dataset.station,'hearth');
});

test('the road sign opens the walking trail by mouse or keyboard without selecting an NPC',()=>{
  const h=harness(),entries=[],sign=h.add('trail-road','g');
  sign.dataset.campTrail='open';h.scene.append(sign);
  h.api.init({openTrail:anchor=>entries.push(anchor)});h.api.open();
  h.emit(sign,'click',{button:0});
  for(const key of ['Enter',' '])assert.equal(h.emit(sign,'keydown',{key}).defaultPrevented,true);
  assert.deepEqual(entries,[sign,sign,sign]);assert.deepEqual(h.calls.choices,[]);
  h.emit(sign,'click',{button:2});h.emit(sign,'click',{button:0,ctrlKey:true});
  h.emit(sign,'keydown',{key:'Enter',defaultPrevented:true});assert.equal(entries.length,3);
});

test('worktable controls request guide advice or an allowed app page without writing data',()=>{
  const h=harness();h.api.open();h.emit(h.node('campfire-guide-advice'),'click');assert.deepEqual(h.calls.choices,[['guide','advice']]);
  for(const page of ['quests','history','review','settings','__proto__']){
    const button=h.add(`page-${page}`,'button');button.dataset.campPage=page;h.card.append(button);h.emit(button,'click');
  }
  assert.deepEqual(h.calls.pages,['quests','history','review']);assert.equal(h.api.isOpen(),true,'the app bridge owns navigation');
});

test('rest completes after exactly three minutes and can restart, without storing study time or rewards',()=>{
  const h=harness();h.api.open();assert.equal(h.node('campfire-rest-time').textContent,'03:00');assert.equal(h.timers.size,0);
  h.emit(h.node('campfire-rest-toggle'),'click');assert.equal(h.timers.size,1);h.advance(179000);
  assert.equal(h.node('campfire-rest-time').textContent,'00:01');assert.equal(h.timers.size,1);h.advance(1000);
  assert.equal(h.node('campfire-rest-time').textContent,'00:00');assert.equal(h.node('campfire-rest-fill').style.width,'100%');assert.equal(h.timers.size,0);
  assert.match(h.node('campfire-rest-status').textContent,/茶已经温好/);h.emit(h.node('campfire-rest-toggle'),'click');
  assert.equal(h.node('campfire-rest-time').textContent,'03:00');assert.equal(h.node('campfire-rest-fill').style.width,'0%');assert.equal(h.timers.size,1);
});

test('ending a rest cancels its timer and resets the local display rather than granting completion',()=>{
  const h=harness();h.api.open();h.emit(h.node('campfire-rest-toggle'),'click');h.advance(37000);h.emit(h.node('campfire-rest-toggle'),'click');
  assert.equal(h.timers.size,0);assert.equal(h.node('campfire-rest-time').textContent,'03:00');assert.equal(h.node('campfire-rest-fill').style.width,'0%');
  h.advance(300000);assert.equal(h.node('campfire-rest-time').textContent,'03:00');assert.doesNotMatch(h.node('campfire-rest-status').textContent,/已经温好/);
});

test('closing clears all rest timers; reopening derives remaining time from the original deadline',()=>{
  const h=harness();h.api.open();h.emit(h.node('campfire-rest-toggle'),'click');h.advance(30000);h.api.close(false);assert.equal(h.timers.size,0);
  h.advance(45000);assert.equal(h.node('campfire-rest-time').textContent,'02:30');h.api.open();
  assert.equal(h.node('campfire-rest-time').textContent,'01:45');assert.equal(h.timers.size,1);
  h.api.close(false);h.advance(106000);assert.equal(h.timers.size,0);h.api.open();
  assert.equal(h.node('campfire-rest-time').textContent,'00:00');assert.equal(h.timers.size,0);assert.match(h.node('campfire-rest-status').textContent,/茶已经温好/);
});

test('rest timers stop as soon as the close animation starts and resume after a cancelled close',async()=>{
  const h=harness({motion:true});h.api.open();h.emit(h.node('campfire-rest-toggle'),'click');h.advance(10000);h.api.close();
  assert.equal(h.timers.size,0);h.advance(10000);h.api.open();assert.equal(h.timers.size,1);assert.equal(h.node('campfire-rest-time').textContent,'02:40');
  await Promise.resolve();assert.equal(h.api.isOpen(),true);h.api.close(false);assert.equal(h.timers.size,0);
});

test('worktables use the selected-day state, authoritative record count, and latest four entries only',()=>{
  const h=harness();h.api.renderState(snapshot());
  assert.match(h.node('campfire-memory-summary').textContent,/104 段专注，共 4小时/);
  const html=h.node('campfire-memory-records').innerHTML;assert.equal((html.match(/<li>/g)||[]).length,4);
  assert.ok(html.indexOf('任务5')<html.indexOf('任务4'));assert.doesNotMatch(html,/任务1|别日记录/);
  assert.match(h.node('campfire-map-copy').textContent,/英语目前完成 0.0%/);
  assert.match(h.node('campfire-study-stars').innerHTML,/133.3%/);assert.match(h.node('campfire-study-stars').innerHTML,/width:100%/);
  h.api.renderState(snapshot({date:'2026-09-23',records:[],dayRecordCount:0,totals:{minutes:0,target:480,percent:0}}));
  assert.match(h.node('campfire-world-record').textContent,/2026-09-23 · 那一天专注 0分钟/);
  assert.match(h.node('campfire-memory-summary').textContent,/这一天收下了 0 段/);assert.doesNotMatch(h.node('campfire-memory-records').innerHTML,/任务[1-5]/);
});

test('external task and subject names are escaped, while untouched polls preserve rendered worktables and scroll',()=>{
  const h=harness(),attack='<img src=x onerror="evil()"> & <script>evil()</script>';
  const state=snapshot({records:[{name:attack,minutes:30,end:'2026-09-25T12:00:00+08:00'}],subjects:[{name:attack,target:180,minutes:30,percent:16.7}]});
  h.api.renderState(state);for(const id of ['campfire-memory-records','campfire-study-stars']){
    assert.ok(!h.node(id).innerHTML.includes(attack));assert.doesNotMatch(h.node(id).innerHTML,/<img|<script>/);assert.match(h.node(id).innerHTML,/&lt;img/);
  }
  h.card.scrollTop=234;const records=h.node('campfire-memory-records'),stars=h.node('campfire-study-stars');
  h.api.renderState({...state,now:'different revision',quests:{equipped:{camp:'camp-moss'}}});
  assert.equal(records.htmlWrites,1);assert.equal(stars.htmlWrites,1);assert.equal(h.card.scrollTop,234);
  assert.ok(h.node('campfire-map-copy').textContent.includes(attack),'text-only copy can safely preserve the exact name');
});

test('midnight changes the memory heading to historical even if selected date and records stay unchanged',()=>{
  const h=harness(),state=snapshot();h.api.renderState(state);assert.match(h.node('campfire-memory-summary').textContent,/^今天/);
  h.api.renderState({...state,today:'2026-09-26'});assert.match(h.node('campfire-memory-summary').textContent,/^这一天/);
  assert.match(h.node('campfire-world-record').textContent,/那一天/);
});

test('init can retry after missing markup and does not create its own conversation content',()=>{
  const h=harness({missingRoom:true});assert.equal(h.api.open(),false);h.document.body.append(h.room);h.api.init();
  assert.equal(h.api.open(),true);h.emit(h.close,'click');assert.equal(h.calls.afterClose,1);assert.equal(h.api.isOpen(),false);
});

test('HTML wires the camp as a nonmodal region, and body never becomes a delegated navigation control',()=>{
  const html=fs.readFileSync(require.resolve('../static/index.html'),'utf8');
  const body=html.match(/<body\b[^>]*>/i)?.[0];assert.ok(body);assert.doesNotMatch(body,/\bdata-view(?:\s|=|>)/i);
  const room=html.match(/<section\b[^>]*\bid="campfire-room"[^>]*>/i)?.[0];assert.ok(room);assert.match(room,/role="region"/);assert.doesNotMatch(room,/aria-modal/);
  const scene=html.match(/<div\b[^>]*\bid="campfire-scene"[^>]*>/i)?.[0];assert.ok(scene);assert.doesNotMatch(scene,/aria-hidden="true"/);
  const app=fs.readFileSync(require.resolve('../static/app.js'),'utf8');assert.doesNotMatch(app,/document\.body\.dataset\.view\s*=/);
});


test('camp activates its manual sound controls and stops its soundscape at the start of close',()=>{
  const h=harness({motion:true});h.api.open(h.entry);assert.deepEqual(h.calls.ambience,['camp']);h.api.open(h.entry);assert.deepEqual(h.calls.ambience,['camp']);
  h.api.close();assert.deepEqual(h.calls.ambience,['camp',null]);assert.equal(h.room.hidden,false);h.api.close(false);assert.equal(h.room.hidden,true);assert.equal(h.calls.ambience.at(-1),null);
});
test('closing an already hidden camp cannot silence a different space',()=>{
  const h=harness();h.api.close(false);assert.deepEqual(h.calls.ambience,[]);h.api.open();h.api.close(false);h.calls.ambience.length=0;h.api.close(false);assert.deepEqual(h.calls.ambience,[]);
});

test('camp memory displays actual start and end while retaining the focus duration',()=>{
  const h=harness();h.api.renderState(snapshot({records:[{name:'数学',minutes:30,start:'2026-09-25T10:02:00+08:00',end:'2026-09-25T10:35:00+08:00'}]}));
  const text=h.node('campfire-memory-records').innerHTML;assert.match(text,/10:02 → 10:35/);assert.match(text,/留下了 30分钟/);
});
