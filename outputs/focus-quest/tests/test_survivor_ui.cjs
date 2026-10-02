const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/survivor.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 let time=1000,rafId=0,left=240,draws=0;const listeners=new Map(),frames=new Map(),requests=[],sounds=[];
 const ctx=new Proxy({clearRect(){draws++;},createRadialGradient(){return {addColorStop(){}};}},{get:(o,p)=>p in o?o[p]:(()=>{}),set:(o,p,v)=>(o[p]=v,true)});
 class E{
  constructor(){this.nodes=new Map();this.listeners=new Map();this.style={setProperty(){}};this.classList={toggle(){}};this.dataset={};this.isConnected=true;this.disabled=false;this.writes=0;this.textWrites=0;this._text='';this._html='';}
  set textContent(x){this._text=x;this.textWrites++;}get textContent(){return this._text;}
  set innerHTML(x){this._html=x;this.writes++;}get innerHTML(){return this._html;}
  querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new E());return this.nodes.get(selector);}
  contains(){return true;}addEventListener(k,f){this.listeners.set(k,f);}removeEventListener(k){this.listeners.delete(k);}
  getContext(){return ctx;}getBoundingClientRect(){return {width:1050,height:600,left:0,top:0};}focus(){}closest(){return null;}
 }
 const host=new E(),document={hidden:false,addEventListener:(k,f)=>listeners.set('doc:'+k,f),removeEventListener:k=>listeners.delete('doc:'+k)};
 const w={document,performance:{now:()=>time},Math,Promise,console,ResizeObserver:class{observe(){}disconnect(){}},addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k),requestAnimationFrame:f=>{frames.set(++rafId,f);return rafId;},cancelAnimationFrame:id=>frames.delete(id)};
 w.window=w;const context=vm.createContext(w);vm.runInContext(source,context);
 const options={send:move=>{requests.push(JSON.parse(JSON.stringify(move)));return Promise.resolve();},secondsLeft:()=>left,playSound:name=>sounds.push(name)};
 const session=(phase='playing',version=1)=>({id:'a',version,state:{phase,time:0,duration:180,speed:1,level:1,xp:0,xpNext:10,kills:0,hero:'ranger',arena:'glade',heroes:[{id:'ranger',name:'逐星游侠',description:'自动射击'},{id:'warden',name:'守望者'},{id:'oracle',name:'术士'}],arenas:[{id:'glade',name:'萤光林地'},{id:'ruins',name:'回声遗迹'},{id:'rift',name:'裂隙'}],player:{x:800,y:500,hp:100,maxHp:100,r:14,dashCd:0},world:{width:1600,height:1000},weapons:[{id:'bolt',name:'星箭',level:1}],passives:[],enemies:[],shots:[],gems:[],pickups:[],effects:[],obstacles:[],choices:[{id:'weapon:orbit',key:'orbit',kind:'weapon',name:'星环',description:'旋转环刃',pair:'广域透镜',level:1},{id:'passive:haste',key:'haste',kind:'passive',name:'疾风',level:1},{id:'weapon:frost',key:'frost',kind:'weapon',name:'寒霜',level:1}]}});
 return {api:w.FocusSurvivor,w,host,options,requests,sounds,frames,listeners,session,draws:()=>draws,setLeft:n=>left=n,
 mount:(s=session(),o={})=>w.FocusSurvivor.mount(host,s,{...options,...o}),
 key:(key,repeat=false)=>listeners.get('keydown')?.({key,repeat,target:new E(),preventDefault(){},stopPropagation(){}}),
 release:key=>listeners.get('keyup')?.({key}),
 click:(action,id)=>host.listeners.get('click')?.({target:{closest:()=>({dataset:{svAction:action,id},disabled:false})}}),
 async step(ms=100){time+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(time));await flush();},
 blur:()=>listeners.get('blur')?.(),hide:()=>{document.hidden=true;listeners.get('doc:visibilitychange')?.();},show:()=>{document.hidden=false;listeners.get('doc:visibilitychange')?.();},nativeVisible:visible=>{w.FocusRuntime={isVisible:()=>visible};listeners.get('doc:focusquest:visibility')?.();}
 };
}
test('scene, rules and result are self contained and safely escape game labels',()=>{
 const h=harness();assert.match(h.api.scene(false),/<svg/);assert.match(h.api.rules(),/二倍速/);assert.match(h.api.rules(),/失败不发奖励/);
 const s=h.session();s.state.weapons=[{id:'bolt',name:'<img onerror=x>',level:2}];const html=h.api.postcard(s);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
});
test('mount is idempotent and does not recreate the canvas each snapshot',()=>{
 const h=harness();h.mount();const canvas=h.host.querySelector('.sv-canvas'),writes=h.host.writes;h.mount(h.session('playing',2));
 assert.equal(h.host.querySelector('.sv-canvas'),canvas);assert.equal(h.host.writes,writes);assert.equal(h.frames.size,1);assert.equal(h.listeners.size,5);
 h.api.destroy();assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);
});
test('runtime sends normalized diagonal movement without client elapsed',async()=>{
 const h=harness();h.mount();h.key('w');h.key('d');await h.step();const move=h.requests.at(-1);assert.equal(move.kind,'tick');assert.ok(Math.abs(Math.hypot(move.dx,move.dy)-1)<1e-10);assert.ok(move.dx>0&&move.dy<0);assert.equal('elapsed' in move,false);h.api.destroy();
});
test('network tick pump is single flight while a request is unresolved',async()=>{
 const h=harness();let resolve;h.mount(undefined,{send:move=>{h.requests.push(move);return new Promise(r=>resolve=r);}});await h.step();await h.step(200);assert.equal(h.requests.length,1);resolve();await flush();await h.step();assert.equal(h.requests.length,2);h.api.destroy();
});
test('blur clears held keys, avoiding stuck movement after switching windows',async()=>{
 const h=harness();h.mount();h.key('d');await h.step();h.blur();await h.step();assert.equal(h.requests.at(-1).dx,0);h.api.destroy();
});
test('hidden page sends no ticks and forgets held input',async()=>{
 const h=harness();h.mount();h.key('w');h.hide();await h.step();assert.equal(h.requests.length,0);h.show();await h.step();assert.equal(h.requests.at(-1).dy,0);h.api.destroy();
});
test('speed button preserves desired 2x against an older snapshot',async()=>{
 const h=harness();h.mount();h.click('speed');await flush();h.api.update(h.session('playing',2));await h.step();assert.equal(h.requests.at(-1).speed,2);
 const ack=h.session('playing',3);ack.state.speed=2;h.api.update(ack);h.click('speed');await h.step();assert.equal(h.requests.at(-1).speed,1);h.api.destroy();
});
test('space sends one dash; key repeat is ignored',async()=>{
 const h=harness();h.mount();h.key(' ');h.key(' ',true);await flush();assert.equal(h.requests.filter(m=>m.kind==='dash').length,1);h.api.destroy();
});
test('upgrade choices use server ids and keyboard selection, no score submission',async()=>{
 const h=harness();h.mount(h.session('upgrade'));assert.match(h.host.querySelector('.sv-overlay').innerHTML,/共鸣搭配/);h.key('2');await flush();assert.deepEqual(h.requests[0],{kind:'upgrade',id:'passive:haste'});h.api.destroy();
});
test('prepare selects hero and arena locally then deploys once',async()=>{
 const h=harness();h.mount(h.session('prepare'));h.click('hero','oracle');h.click('arena','rift');assert.equal(h.requests.length,0);h.click('deploy');await flush();assert.deepEqual(h.requests[0],{kind:'deploy',hero:'oracle',arena:'rift'});h.api.destroy();
});
test('pause command is authoritative and does not alter the wall clock',async()=>{
 const h=harness();h.mount();h.key('Escape');await flush();assert.deepEqual(h.requests[0],{kind:'pause',paused:true});h.api.update(h.session('paused',2));await h.step();assert.equal(h.requests.length,1);assert.match(h.host.querySelector('.sv-overlay').innerHTML,/倒计时仍在进行/);h.key('Escape');await flush();assert.deepEqual(h.requests.at(-1),{kind:'pause',paused:false});h.api.destroy();
});
test('suspend stops frames and resume restores one loop without rebuilding',async()=>{
 const h=harness();h.mount();h.key('d');const writes=h.host.writes;h.api.suspend();assert.equal(h.frames.size,0);await h.step();assert.equal(h.requests.length,0);h.mount(h.session('playing',2));assert.equal(h.host.writes,writes);assert.equal(h.frames.size,1);await h.step();assert.equal(h.requests.at(-1).dx,0);h.api.destroy();
});
test('expired wall clock stops simulation ticks',async()=>{
 const h=harness();h.mount();h.setLeft(0);await h.step();assert.equal(h.requests.length,0);h.api.destroy();
});
test('stale snapshots cannot overwrite an active upgrade screen',()=>{
 const h=harness();h.mount(h.session('upgrade',5));h.api.update(h.session('playing',4));assert.match(h.host.querySelector('.sv-overlay').innerHTML,/下一束力量/);h.api.destroy();
});
test('audio triggers for damage, pickup, upgrade and boss arrival',()=>{
 const h=harness();h.mount();const next=h.session('playing',2);next.state.player.hp=80;next.state.xp=3;next.state.boss={name:'首领',hp:100,maxHp:100};next.state.effects=[{id:'dash1',kind:'dash',x:800,y:500}];h.api.update(next);h.api.update(h.session('upgrade',3));for(const cue of ['survivorHit','survivorPickup','survivorBoss','survivorDash','survivorUpgrade'])assert.ok(h.sounds.includes(cue),cue);h.api.destroy();
});
test('network failure stops the pump and exposes a reconnect control',async()=>{
 const h=harness();h.mount(undefined,{send:()=>Promise.reject(new Error('offline'))});await h.step();assert.match(h.host.querySelector('.sv-connection').innerHTML,/重新连接/);assert.match(h.host.querySelector('.sv-connection').innerHTML,/连接暂时中断/);h.api.destroy();
});
test('busy bridge retries an upgrade next frame, without a microtask spin',async()=>{
 const h=harness();let count=0;h.mount(h.session('upgrade'),{send:move=>{h.requests.push(move);return Promise.resolve(++count===1?{retry:true}:{});}});
 h.key('1');await flush();assert.equal(h.requests.length,1);await flush();assert.equal(h.requests.length,1);await h.step();assert.equal(h.requests.length,2);assert.equal(h.requests[1].id,'weapon:orbit');h.api.destroy();
});
test('busy tick is deferred to the next cadence, never queued as a user command',async()=>{
 const h=harness();h.mount(undefined,{send:move=>{h.requests.push(move);return Promise.resolve({retry:true});}});await h.step();await h.step(16);assert.equal(h.requests.length,1);await h.step(100);assert.equal(h.requests.length,2);h.api.destroy();
});
test('recovered bridge response drops uncertain queued actions',async()=>{
 const h=harness();let resolve;h.mount(h.session('upgrade'),{send:move=>{h.requests.push(move);return new Promise(r=>resolve=r);}});h.key('1');h.key('2');await flush();resolve({recovered:true});await flush();await h.step();assert.equal(h.requests.length,1);h.api.destroy();
});
for(const phase of ['prepare','upgrade','paused']){
 test('reconnect can recover '+phase+' without resubmitting the uncertain move or resuming combat',async()=>{
  const h=harness();let synced=0;h.mount(h.session(phase),{send:()=>Promise.reject(new Error('offline')),resync:async()=>{synced++;return true;}});
  if(phase==='prepare')h.click('deploy');else if(phase==='upgrade')h.key('1');else h.key('Escape');await flush();
  assert.match(h.host.querySelector('.sv-connection').innerHTML,/重新连接/);h.click('retry');await flush();assert.equal(synced,1);assert.equal(h.host.querySelector('.sv-connection').innerHTML,'');await h.step();assert.equal(h.requests.length,0);h.api.destroy();
 });
}
test('explicit recovered from top-level sync clears runtime errors',async()=>{
 const h=harness();h.mount(undefined,{send:()=>Promise.reject(new Error('offline'))});await h.step();assert.match(h.host.querySelector('.sv-connection').innerHTML,/重新连接/);h.api.recovered();assert.equal(h.host.querySelector('.sv-connection').innerHTML,'');h.api.destroy();
});

test('hidden and native-occluded windows cancel the game frame loop until visible again',async()=>{
 const h=harness();h.mount();await h.step();const before=h.draws();h.hide();assert.equal(h.frames.size,0);await h.step(30000);assert.equal(h.draws(),before);h.show();h.show();assert.equal(h.frames.size,1);
 h.nativeVisible(false);assert.equal(h.frames.size,0);await h.step(30000);assert.equal(h.draws(),before);h.nativeVisible(true);h.nativeVisible(true);assert.equal(h.frames.size,1);await h.step();assert.ok(h.draws()>before);h.api.destroy();assert.equal(h.listeners.size,0);
});
test('polling a hidden game and visibility changes cannot resume a suspended view',async()=>{
 const h=harness();h.mount();h.hide();h.mount(h.session('playing',2));assert.equal(h.frames.size,0);h.api.suspend();h.show();assert.equal(h.frames.size,0);h.mount(h.session('playing',3));assert.equal(h.frames.size,1);h.api.destroy();
});
test('idle game scenes draw gently while combat retains its full frame rate',async()=>{
 for(const phase of ['prepare','upgrade','paused','playing']){const h=harness();h.mount(h.session(phase));for(let i=0;i<60;i++)await h.step(1000/60);if(phase==='playing')assert.equal(h.draws(),60);else assert.ok(h.draws()>=10&&h.draws()<=16,phase+': '+h.draws());h.api.destroy();}
});
test('wallclock writes only when its displayed second changes and expired games stop drawing',async()=>{
 const h=harness();h.mount();const label=h.host.querySelector('.sv-wallclock');for(let i=0;i<60;i++)await h.step(1000/60);assert.equal(label.textWrites,1);h.setLeft(239);await h.step();assert.equal(label.textWrites,2);h.setLeft(0);await h.step();assert.equal(h.frames.size,0);const before=h.draws();await h.step(60000);assert.equal(h.draws(),before);h.api.destroy();
});
