const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/runtime.js'),'utf8');

function harness({native=true,hidden=false}={}){
 const listeners=new Map(),timers=new Map(),allTimers=[],classes=new Set(),events=[];
 let nextId=0,maxTimers=0;
 const document={hidden,documentElement:{classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}},addEventListener(name,callback){listeners.set(name,callback);}};
 const context=vm.createContext({document,__focusQuestVisible:native,setInterval(callback,delay){const id=++nextId;const timer={id,callback,delay};timers.set(id,timer);allTimers.push(timer);maxTimers=Math.max(maxTimers,timers.size);return id;},clearInterval(id){timers.delete(id);}});
 vm.runInContext(source,context);
 const api=context.FocusRuntime,options={refresh:()=>events.push('refresh'),tickClock:()=>events.push('clock'),onWake:()=>events.push('wake'),onSuspend:()=>events.push('suspend')};
 return {api,timers,allTimers,classes,events,maxTimers:()=>maxTimers,start:()=>api.start(options),native:visible=>listeners.get('focusquest:visibility')({detail:{visible}}),invalid:detail=>listeners.get('focusquest:visibility')({detail}),hidden(value){document.hidden=value;listeners.get('visibilitychange')();}};
}

test('visible startup refreshes immediately and owns exactly one clock and one poll',()=>{
 const h=harness();h.start();assert.equal(h.api.isVisible(),true);assert.deepEqual(h.events,['clock','wake','refresh']);assert.deepEqual([...h.timers.values()].map(t=>t.delay).sort((a,b)=>a-b),[1000,3000]);assert.equal(h.classes.has('focus-runtime-hidden'),false);
 for(const timer of h.timers.values())timer.callback();assert.deepEqual(h.events.slice(-2),['clock','refresh']);
});
test('native occlusion and document visibility jointly control timer suspension',()=>{
 const h=harness();h.start();h.native(false);assert.equal(h.api.isVisible(),false);assert.equal(h.timers.size,0);assert.equal(h.classes.has('focus-runtime-hidden'),true);
 h.hidden(true);h.native(true);assert.equal(h.api.isVisible(),false);assert.equal(h.timers.size,0);assert.equal(h.events.filter(e=>e==='suspend').length,1);
 h.hidden(false);assert.equal(h.api.isVisible(),true);assert.equal(h.timers.size,2);assert.deepEqual(h.events.slice(-3),['clock','wake','refresh']);
 h.hidden(true);assert.equal(h.timers.size,0);h.native(false);h.hidden(false);assert.equal(h.timers.size,0);h.native(true);assert.equal(h.timers.size,2);
});
test('a hundred hide/show cycles never retain more than two timers',()=>{
 const h=harness();h.start();for(let i=0;i<100;i++){h.native(false);assert.equal(h.timers.size,0);h.native(true);assert.equal(h.timers.size,2);}
 assert.equal(h.maxTimers(),2);assert.equal(h.events.filter(e=>e==='refresh').length,101);assert.equal(h.events.filter(e=>e==='suspend').length,100);
});
test('cancelled callbacks cannot refresh or tick after hiding or a later wake',()=>{
 const h=harness();h.start();const old=[...h.timers.values()];h.hidden(true);const hiddenCount=h.events.length;for(const t of old)t.callback();assert.equal(h.events.length,hiddenCount);
 h.hidden(false);const wakeCount=h.events.length;for(const t of old)t.callback();assert.equal(h.events.length,wakeCount);
 for(const t of h.timers.values())t.callback();assert.deepEqual(h.events.slice(-2),['clock','refresh']);
});
test('duplicate visibility signals and duplicate start do not refetch or create loops',()=>{
 const h=harness();h.start();const timers=[...h.timers.keys()];h.start();h.native(true);h.hidden(false);assert.deepEqual([...h.timers.keys()],timers);assert.deepEqual(h.events,['clock','wake','refresh']);
 h.native(false);h.native(false);h.hidden(true);assert.deepEqual(h.events,['clock','wake','refresh','suspend']);assert.equal(h.timers.size,0);
});
test('malformed native visibility signals are ignored',()=>{
 const h=harness();h.start();for(const detail of [undefined,null,{},false,{visible:'false'},{visible:0},{visible:null}])h.invalid(detail);
 assert.equal(h.api.isVisible(),true);assert.equal(h.timers.size,2);assert.deepEqual(h.events,['clock','wake','refresh']);
});
test('initial native invisibility is honored before starting and wakes immediately later',()=>{
 const h=harness({native:false});assert.equal(h.api.isVisible(),false);h.start();assert.deepEqual(h.events,['suspend']);assert.equal(h.timers.size,0);h.native(true);assert.deepEqual(h.events,['suspend','clock','wake','refresh']);assert.equal(h.timers.size,2);
});
test('visibility received before startup and a hidden document do not start background polling',()=>{
 const h=harness();h.native(false);h.start();assert.equal(h.timers.size,0);assert.deepEqual(h.events,['suspend']);
 const hidden=harness({hidden:true});hidden.start();assert.equal(hidden.api.isVisible(),false);assert.equal(hidden.timers.size,0);hidden.hidden(false);assert.deepEqual(hidden.events,['suspend','clock','wake','refresh']);
});
