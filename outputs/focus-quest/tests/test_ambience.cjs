const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync(require.resolve('../static/ambience.js'),'utf8');
function harness({stored=null,hidden=false,nativeVisible=true,deferred=false,unavailable=false,storageFails=false}={}){
  const listeners=new Map(),windowListeners=new Map(),timers=new Map(),sources=[],contexts=[],writes=[],saved=new Map();
  const resumes=[];let serial=0;
  if(stored!==null)saved.set('focus-quest-ambience-v1',stored);
  const document={hidden,addEventListener(type,fn){const l=listeners.get(type)||[];l.push(fn);listeners.set(type,l);},querySelectorAll(){return [];}};
  const param=()=>({value:0,events:[],setValueAtTime(value,time){this.value=value;this.events.push(['value',value,time]);},linearRampToValueAtTime(value,time){this.value=value;this.events.push(['ramp',value,time]);},cancelScheduledValues(time){this.events.push(['cancel',time]);},setTargetAtTime(value,time,constant){this.value=value;this.events.push(['target',value,time,constant]);}});
  class AudioContext {
    constructor(){this.state='suspended';this.currentTime=20;this.destination={};this.buffers=[];this.suspends=0;this.resumes=0;contexts.push(this);}
    resume(){this.resumes++;if(deferred)return new Promise(resolve=>resumes.push(()=>{this.state='running';resolve();}));this.state='running';return Promise.resolve();}
    suspend(){this.suspends++;this.state='suspended';return Promise.resolve();}
    createGain(){return {gain:param(),connect(){},disconnect(){this.disconnected=true;}};}
    createBufferSource(){const source={started:0,stops:[],loop:false,connect(target){this.target=target;},start(){this.started++;},stop(at){this.stops.push(at);},disconnect(){this.disconnected=true;}};sources.push(source);return source;}
    createBuffer(count,length,rate){const channels=Array.from({length:count},()=>new Float32Array(length));const buffer={length,sampleRate:rate,getChannelData(index){return channels[index];}};this.buffers.push(buffer);return buffer;}
  }
  const scope={document,Math,__focusQuestVisible:nativeVisible,Float32Array,AudioContext:unavailable?undefined:AudioContext,
    addEventListener(type,fn){windowListeners.set(type,fn);},setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);},
    localStorage:{getItem(key){if(storageFails)throw Error('private');return saved.get(key)||null;},setItem(key,value){if(storageFails)throw Error('private');saved.set(key,value);writes.push([key,value]);}},
    fetch(){throw Error('Ambient music must work locally without network access');},setInterval(){throw Error('Ambient playback must not require a recurring timer');},
  };
  const context=vm.createContext(scope);vm.runInContext(code,context);const api=context.FocusAmbience;
  return {api,composer:context.FocusAmbienceComposer,contexts,sources,listeners,timers,resumes,writes,document,
    emit(type,event={}){for(const fn of listeners.get(type)||[])fn(event);},window(type){windowListeners.get(type)?.();},finish(){for(const [id,timer]of [...timers]){timers.delete(id);timer.fn();}},
  };
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('initialization stays silent, then entering a scene plays its saved mode and volume',async()=>{
  const h=harness({stored:JSON.stringify({home:{mode:'rain',volume:.54,playing:false},camp:{volume:.28}})});
  h.api.init();h.api.init();assert.equal(h.contexts.length,0);assert.equal(h.api.getState().playing,false);
  assert.equal(h.listeners.get('click').length,1);assert.equal(h.listeners.get('visibilitychange').length,1);assert.equal(h.timers.size,0);
  assert.match(h.api.controls('home'),/value="rain" selected/);assert.match(h.api.controls('home'),/进入时自动播放/);
  assert.equal(await h.api.setScene('home'),true);assert.equal(h.contexts.length,1);assert.equal(h.api.getState().playing,true);assert.equal(h.api.getState().mode,'rain');assert.equal(h.api.getState().volume,.54);
});
test('only a visible, selected scene can automatically start playback',async()=>{
  const h=harness();assert.equal(await h.api.start(),false);h.document.hidden=true;assert.equal(await h.api.setScene('camp'),false);assert.equal(await h.api.start(),false);assert.equal(h.contexts.length,0);
  h.document.hidden=false;h.emit('visibilitychange');assert.equal(h.contexts.length,0);assert.equal(h.api.getState().playing,false);
  h.api.setScene(null);assert.equal(await h.api.setScene('camp'),true);assert.equal(h.contexts.length,1);assert.equal(h.sources.length,1);assert.equal(h.sources[0].loop,true);assert.equal(h.sources[0].started,1);
  assert.equal(h.api.getState().playing,true);assert.equal(await h.api.start(),false);assert.equal(h.sources.length,1);assert.equal(h.timers.size,0);
  const gain=h.sources[0].target.gain;assert.deepEqual(gain.events[0],['value',0,20]);assert.equal(gain.events[1][0],'ramp');assert.equal(gain.events[1][2],20.8);
});
test('leaving fades, disconnects and suspends; entering again automatically plays from the cached score',async()=>{
  const h=harness();await h.api.setScene('camp');h.api.setScene(null);
  assert.equal(h.api.getState().playing,false);assert.equal(h.sources[0].stops[0],20.26);assert.equal(h.timers.size,1);
  h.finish();assert.equal(h.sources[0].disconnected,true);assert.equal(h.sources[0].target.disconnected,true);assert.equal(h.contexts[0].state,'suspended');
  await h.api.setScene('camp');assert.equal(h.api.getState().playing,true);assert.equal(h.contexts.length,1);assert.equal(h.contexts[0].buffers.length,1);assert.equal(h.sources.length,2);
});
test('walking between home living room, window and roof does not restart automatic music',async()=>{
  const h=harness();await h.api.setScene('home');h.api.setScene('home');h.api.setScene('home');assert.equal(h.sources.length,1);assert.equal(h.api.getState().playing,true);assert.equal(h.timers.size,0);assert.equal(h.contexts[0].resumes,1);
});
test('manually switching music off survives same-room polls and only a fresh entry reopens it',async()=>{
  const h=harness();await h.api.setScene('home');h.api.stop();h.finish();for(let i=0;i<100;i++)h.api.setScene('home');
  assert.equal(h.api.getState().playing,false);assert.equal(h.sources.length,1);assert.equal(h.contexts[0].resumes,1);assert.equal(h.timers.size,0);
  h.api.setScene(null);await h.api.setScene('home');assert.equal(h.api.getState().playing,true);assert.equal(h.sources.length,2);assert.equal(h.contexts[0].resumes,2);assert.equal(h.contexts[0].buffers.length,1);
});
test('entering home from camp crossfades to its own music without duplicate contexts',async()=>{
  const h=harness();await h.api.setScene('camp');await h.api.setScene('home');assert.equal(h.api.getState().playing,true);assert.equal(h.api.getState().mode,'home');assert.equal(h.contexts.length,1);assert.equal(h.sources[0].stops[0],20.26);assert.equal(h.sources.length,2);assert.equal(h.timers.size,1);h.finish();assert.equal(h.sources[0].disconnected,true);assert.equal(h.contexts[0].state,'running');
  h.api.stop();h.finish();assert.equal(h.contexts[0].state,'suspended');
});
test('home mode changes replace music with rain, remember preference, and stay silent if stopped',async()=>{
  const h=harness();await h.api.setScene('home');assert.equal(h.api.setMode('rain'),true);await flush();assert.equal(h.api.getState().playing,true);assert.equal(h.api.getState().mode,'rain');h.finish();assert.equal(h.sources[0].disconnected,true);assert.equal(h.contexts[0].state,'running');assert.equal(h.sources.length,2);assert.equal(h.contexts[0].buffers.length,2);
  h.api.stop();h.finish();h.api.setMode('home');h.api.setScene('home');assert.equal(h.api.getState().playing,false);assert.equal(h.sources.length,2);assert.equal(h.api.setMode('camp'),false);
  const stored=JSON.parse(h.writes.at(-1)[1]);assert.equal(stored.home.mode,'home');assert.equal(Object.hasOwn(stored.home,'playing'),false);
});
test('volume is bounded, ramps smoothly and has independent per-room preferences',async()=>{
  const h=harness();await h.api.setScene('camp');h.api.setVolume(.7);assert.equal(h.api.getState().volume,.7);assert.equal(h.sources[0].target.gain.events.at(-1)[0],'target');h.api.setVolume(4);assert.equal(h.api.getState().volume,1);h.api.setVolume(NaN);assert.equal(h.api.getState().volume,1);
  await h.api.setScene('home');assert.equal(h.api.getState().volume,.35);h.api.setVolume(-2);assert.equal(h.api.getState().volume,0);await h.api.setScene('camp');assert.equal(h.api.getState().volume,1);
});
test('both native and browser hiding immediately stop, release nodes and never auto-resume',async()=>{
  const h=harness();await h.api.setScene('camp');h.emit('focusquest:visibility',{detail:{visible:false}});
  assert.equal(h.api.getState().playing,false);assert.equal(h.contexts[0].state,'suspended');assert.equal(h.sources[0].disconnected,true);assert.equal(h.timers.size,0);assert.match(h.api.getState().message,/暂停/);
  h.emit('focusquest:visibility',{detail:{visible:true}});h.api.setScene('camp');assert.equal(h.sources.length,1);assert.equal(h.api.getState().playing,false);await h.api.start();
  h.document.hidden=true;h.emit('visibilitychange');assert.equal(h.sources[1].disconnected,true);h.document.hidden=false;h.emit('visibilitychange');h.api.setScene('camp');assert.equal(h.sources.length,2);assert.equal(h.contexts[0].state,'suspended');
});
test('a natively hidden window never automatically acquires audio resources',async()=>{
  const h=harness({nativeVisible:false});assert.equal(await h.api.setScene('home'),false);assert.equal(h.contexts.length,0);h.emit('focusquest:visibility',{detail:{visible:true}});h.api.setScene('home');assert.equal(h.contexts.length,0);
  h.api.setScene(null);await h.api.setScene('home');assert.equal(h.sources.length,1);
});
test('page hide frees automatically started nodes immediately',async()=>{const h=harness();await h.api.setScene('home');h.window('pagehide');assert.equal(h.sources[0].disconnected,true);assert.equal(h.contexts[0].state,'suspended');});
test('leaving during pending automatic audio permission never starts the obsolete scene',async()=>{
  const h=harness({deferred:true});const pending=h.api.setScene('camp');h.api.setScene(null);h.resumes.shift()();assert.equal(await pending,false);assert.equal(h.sources.length,0);assert.equal(h.contexts[0].state,'suspended');assert.equal(h.api.getState().playing,false);
});
test('an obsolete pending resume cannot suspend a newer automatic scene entry',async()=>{
  const h=harness({deferred:true});const first=h.api.setScene('camp'),second=h.api.setScene('home');h.resumes.shift()();assert.equal(await first,false);assert.equal(h.contexts[0].suspends,0);h.resumes.shift()();assert.equal(await second,true);assert.equal(h.sources.length,1);assert.equal(h.contexts[0].state,'running');assert.equal(h.api.getState().playing,true);assert.equal(h.api.getState().scene,'home');
});
test('rapid cross-scene entries with out-of-order permissions only play the newest scene',async()=>{
  const h=harness({deferred:true});const first=h.api.setScene('camp'),second=h.api.setScene('home'),third=h.api.setScene('camp');
  const [resolveFirst,resolveSecond,resolveThird]=h.resumes.splice(0);resolveThird();assert.equal(await third,true);resolveSecond();assert.equal(await second,false);resolveFirst();assert.equal(await first,false);
  assert.equal(h.contexts.length,1);assert.equal(h.sources.length,1);assert.equal(h.contexts[0].buffers.length,1);assert.equal(h.api.getState().scene,'camp');assert.equal(h.api.getState().mode,'camp');assert.equal(h.api.getState().playing,true);assert.equal(h.contexts[0].state,'running');
});
test('manual stop while automatic playback is waiting cannot be undone by permission completion',async()=>{
  const h=harness({deferred:true});const pending=h.api.setScene('home');h.api.stop();h.api.setScene('home');h.resumes.shift()();assert.equal(await pending,false);assert.equal(h.sources.length,0);assert.equal(h.api.getState().playing,false);assert.equal(h.contexts[0].state,'suspended');
});
test('rapid on/off calls leave a bounded graph and a single cleanup timer',async()=>{
  const h=harness();await h.api.setScene('home');for(let i=0;i<12;i++){h.api.stop();assert.equal(h.timers.size,1);if(i<11)await h.api.start();}h.finish();assert.equal(h.contexts.length,1);assert.equal(h.contexts[0].buffers.length,1);assert.ok(h.sources.every(source=>source.disconnected));assert.equal(h.contexts[0].state,'suspended');
});
test('unavailable audio or private storage fail gracefully without acquiring resources repeatedly',async()=>{
  const h=harness({unavailable:true,storageFails:true});assert.equal(await h.api.setScene('camp'),false);assert.equal(await h.api.start(),false);assert.match(h.api.getState().message,/无法播放/);assert.equal(h.api.getState().loading,false);assert.equal(h.api.getState().playing,false);h.api.setVolume(.5);assert.equal(h.api.getState().volume,.5);
});
test('malformed stored preferences cannot inject markup or an invalid sound mode',async()=>{
  const h=harness({hidden:true,stored:JSON.stringify({home:{mode:'<script>',volume:99},camp:{volume:-5}})});await h.api.setScene('home');assert.equal(h.api.getState().volume,1);assert.equal(h.api.getState().mode,'home');assert.doesNotMatch(h.api.controls('home'),/<script>/);await h.api.setScene('camp');assert.equal(h.api.getState().volume,0);assert.equal(h.api.controls('invalid'),'');
});
test('the original scores are complete, distinct, stereo and have no clipping or silent gaps',()=>{
  const h=harness(),stats=[];
  for(const id of ['camp','home','city','rain']){
    const data=h.composer.compose(id,8000);assert.equal(data.channels.length,2);assert.ok(data.duration>=32);const [left,right]=data.channels;let power=0,difference=0,peak=0,mean=0,minSecond=1;
    for(let i=0;i<left.length;i++){assert.ok(Number.isFinite(left[i]));power+=left[i]*left[i];difference+=Math.abs(left[i]-right[i]);peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));mean+=left[i];}
    for(let start=0;start+8000<=left.length;start+=8000){let sum=0;for(let i=start;i<start+8000;i++)sum+=left[i]*left[i];minSecond=Math.min(minSecond,Math.sqrt(sum/8000));}
    const rms=Math.sqrt(power/left.length);assert.ok(rms>.007&&rms<.25,`${id}: rms ${rms}`);assert.ok(minSecond>.003,`${id}: silent section ${minSecond}`);assert.ok(peak<=.600001);assert.ok(Math.abs(mean/left.length)<.008);assert.ok(difference/left.length>.001);stats.push(rms);
    assert.ok(Math.abs(left.at(-1)-left[0])<.04,`${id}: loop seam`);
  }
  assert.equal(new Set(stats).size,4);assert.equal(h.composer.tracks.camp.bars,16);assert.equal(h.composer.tracks.home.bars,16);assert.equal(h.composer.tracks.city.bars,16);assert.equal(h.composer.tracks.city.timbre,'rhodes');
});
test('invalid track IDs never allocate an audio buffer',()=>{const h=harness();assert.throws(()=>h.composer.compose('bad'),/Unknown/);assert.equal(h.contexts.length,0);});

test('mounting repeated polling snapshots preserves the current controls and their focus',()=>{
  const h=harness();let writes=0,scene=null;const container={querySelector(){return scene?{dataset:{ambienceScene:scene}}:null;},set innerHTML(html){writes++;scene=html.match(/data-ambience-scene="([^"]+)"/)[1];}};
  h.api.init();h.api.mount(container,'home');for(let i=0;i<100;i++)h.api.mount(container,'home');assert.equal(writes,1);h.api.mount(container,'camp');assert.equal(writes,2);
});

test('city has its own automatic score, labelled manual controls and an independent saved volume',async()=>{
  const h=harness({stored:JSON.stringify({city:{volume:.24,mode:'rain'},home:{mode:'rain',volume:.52},camp:{volume:.18}})});
  await h.api.setScene('city');assert.equal(h.api.getState().scene,'city');assert.equal(h.api.getState().mode,'city');assert.equal(h.api.getState().volume,.24);assert.equal(h.api.getState().playing,true);
  const html=h.api.controls('city');assert.match(html,/data-ambience-scene="city"/);assert.match(html,/雨巷灯影/);assert.match(html,/aria-label="雨巷灯影音量"/);assert.doesNotMatch(html,/<select/);
  h.api.setVolume(.41);assert.equal(h.sources[0].target.gain.events.at(-1)[0],'target');assert.equal(h.api.setMode('rain'),false);
  await h.api.setScene('home');assert.equal(h.api.getState().mode,'rain');assert.equal(h.api.getState().volume,.52);await h.api.setScene('city');assert.equal(h.api.getState().volume,.41);
  const saved=JSON.parse(h.writes.at(-1)[1]);assert.equal(saved.city.volume,.41);assert.equal(saved.city.mode,'city');assert.equal(saved.home.mode,'rain');assert.equal(h.contexts.length,1);assert.equal(h.contexts[0].buffers.length,2);
});
test('city manual stop survives rendering and pauses immediately on either kind of hidden window',async()=>{
  const h=harness();await h.api.setScene('city');h.api.stop();h.finish();for(let i=0;i<30;i++)h.api.setScene('city');assert.equal(h.api.getState().playing,false);assert.equal(h.sources.length,1);
  await h.api.start();h.emit('focusquest:visibility',{detail:{visible:false}});assert.equal(h.sources.at(-1).disconnected,true);assert.equal(h.contexts[0].state,'suspended');assert.equal(h.timers.size,0);
  h.emit('focusquest:visibility',{detail:{visible:true}});h.api.setScene('city');assert.equal(h.api.getState().playing,false);await h.api.start();h.document.hidden=true;h.emit('visibilitychange');assert.equal(h.sources.at(-1).disconnected,true);assert.equal(h.timers.size,0);
});
test('camp, city and home transitions reuse at most four buffers and keep the graph bounded',async()=>{
  const h=harness();await h.api.setScene('camp');await h.api.setScene('city');await h.api.setScene('home');h.api.setMode('rain');await flush();h.finish();
  assert.equal(h.contexts[0].buffers.length,4);assert.equal(h.contexts.length,1);
  for(let i=0;i<6;i++)for(const scene of ['city','camp','home']){await h.api.setScene(scene);h.finish();assert.equal(h.contexts[0].buffers.length,4);assert.equal(h.sources.filter(source=>!source.disconnected).length,1);assert.equal(h.timers.size,0);}
  h.api.setScene(null);h.finish();assert.ok(h.sources.every(source=>source.disconnected));assert.equal(h.contexts[0].state,'suspended');
});
test('a pending city resume cannot overwrite a newer home entry',async()=>{
  const h=harness({deferred:true});const city=h.api.setScene('city'),home=h.api.setScene('home');const [first,second]=h.resumes.splice(0);second();assert.equal(await home,true);first();assert.equal(await city,false);assert.equal(h.api.getState().scene,'home');assert.equal(h.sources.length,1);assert.equal(h.contexts[0].buffers.length,1);
});
