const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../static/audio.js'),'utf8');

function deferred() {
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function harness(config={}) {
  let now=0,nextTimer=0;
  const contexts=[],timers=new Map();
  class Param {
    constructor(){this.events=[];}
    setValueAtTime(value,time){this.events.push(['set',value,time]);}
    linearRampToValueAtTime(value,time){this.events.push(['linear',value,time]);}
    exponentialRampToValueAtTime(value,time){this.events.push(['exponential',value,time]);}
  }
  class Node {
    constructor(type){this.kind=type;this.gain=new Param();this.frequency=new Param();this.disconnections=0;this.starts=[];this.stops=[];this.onended=null;}
    connect(target){this.connected=target;if(config.connectThrows)throw Error('connection failed');}
    disconnect(){this.disconnections++;this.connected=null;}
    start(time){this.starts.push(time);if(config.startThrows)throw Error('start failed');}
    stop(time){this.stops.push(time);}
    end(){const callback=this.onended;if(callback)callback();}
  }
  class Context {
    constructor(){
      if(config.constructorThrows)throw Error('unsupported');
      this.state=config.initialState||'suspended';this.currentTime=10;this.nodes=[];
      this.destination={kind:'destination'};this.listeners=new Set();this.resumes=0;this.closes=0;
      contexts.push(this);
    }
    addEventListener(name,fn){assert.equal(name,'statechange');this.listeners.add(fn);}
    removeEventListener(name,fn){assert.equal(name,'statechange');this.listeners.delete(fn);}
    change(state){this.state=state;for(const listener of [...this.listeners])listener();}
    resume(){
      this.resumes++;
      if(config.resumeThrows)throw Error('cannot resume');
      if(config.resumeRejects)return Promise.reject(Error('autoplay denied'));
      if(config.resumeDeferred)return config.resumeDeferred.promise;
      if(!config.staysSuspended)this.change('running');
      return Promise.resolve();
    }
    close(){this.closes++;this.change('closed');if(config.closeRejects)return Promise.reject(Error('close failed'));return Promise.resolve();}
    createGain(){const node=new Node('gain');this.nodes.push(node);return node;}
    createOscillator(){const node=new Node('oscillator');this.nodes.push(node);return node;}
  }
  const environment={performance:{now:()=>now},setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)};
  if(!config.unsupported)environment[config.webkit?'webkitAudioContext':'AudioContext']=Context;
  vm.runInNewContext(source,environment);
  return {api:environment.FocusAudio,contexts,timers,advance:ms=>{now+=ms;},flush:()=>{for(const [id,timer] of [...timers]){timers.delete(id);timer.fn();}},finish:()=>{for(const context of contexts)for(const node of context.nodes)if(node.kind==='oscillator')node.end();}};
}

test('module starts quiet; toggles, play and unsupported unlock do not allocate a context',async()=>{
  const h=harness();
  assert.equal(h.api.play('completion'),false);
  assert.equal(await h.api.unlock(),false);
  assert.equal(h.api.setEnabled(true),true);
  assert.equal(h.contexts.length,0);
  assert.equal(h.api.play('completion'),false);
  assert.equal(h.contexts.length,0);
  h.api.setEnabled(false);
  assert.equal(h.contexts.length,0);
  const noAudio=harness({unsupported:true});noAudio.api.setEnabled(true);
  assert.equal(await noAudio.api.unlock(),false);
  assert.equal(noAudio.api.play('victory'),false);
});

test('all study and arcade cues schedule quiet local phrases shorter than one second and release their resources',async()=>{
  for(const cue of ['completion','delivery','milestone','victory','subject','purchase','equip','arcadeStep','arcadeMirror','arcadePlant','arcadeWin']) {
    const h=harness();h.api.setEnabled(true);
    assert.equal(await h.api.unlock(),true);
    assert.equal(h.api.play(cue),true);
    const context=h.contexts[0],oscillators=context.nodes.filter(node=>node.kind==='oscillator');
    assert.ok(oscillators.length>=2&&oscillators.length<=6,cue);
    assert.ok(oscillators.every(node=>['arcadeStep','arcadePlant'].includes(cue)?node.type==='triangle':node.type==='sine'));
    assert.ok(oscillators.every(node=>node.starts[0]>=10&&node.stops[0]<11));
    const gains=context.nodes.filter(node=>node.kind==='gain');
    assert.equal(gains[0].gain.events[0][1],.14);
    for(const gain of gains.slice(1)) {
      assert.equal(gain.gain.events[0][1],0);
      assert.ok(gain.gain.events.find(event=>event[0]==='linear')[1]<=.09);
      assert.equal(gain.gain.events.at(-1)[1],0);
    }
    h.finish();
    assert.ok(context.nodes.every(node=>node.disconnections>=1));
    assert.ok(oscillators.every(node=>node.onended===null));
    assert.equal(h.timers.size,0);
  }
});

test('pending gesture resumes coalesce and never queue or replay an earlier sound',async()=>{
  const pending=deferred(),h=harness({resumeDeferred:pending});h.api.setEnabled(true);
  const first=h.api.unlock(),second=h.api.unlock();
  assert.equal(first,second);
  assert.equal(h.contexts[0].resumes,1);
  assert.equal(h.api.play('completion',{key:'old-session'}),false);
  assert.equal(h.contexts[0].nodes.length,0);
  h.contexts[0].change('running');pending.resolve();
  assert.equal(await first,true);
  assert.equal(h.contexts[0].nodes.length,0);
  assert.equal(h.api.play('completion',{key:'old-session'}),false);
  assert.equal(h.api.play('completion',{key:'new-session'}),true);
  h.finish();
});

test('turning sound off immediately stops active voices, disconnects nodes and closes the context',async()=>{
  const h=harness();h.api.setEnabled(true);await h.api.unlock();
  h.api.play('victory',{key:'daily-1'});const context=h.contexts[0];
  assert.equal(h.api.setEnabled(false),false);
  assert.equal(context.closes,1);
  assert.equal(context.listeners.size,0);
  assert.equal(h.timers.size,0);
  assert.ok(context.nodes.every(node=>node.disconnections>=1));
  assert.ok(context.nodes.filter(node=>node.kind==='oscillator').every(node=>node.stops.includes(undefined)));
  assert.equal(h.api.play('completion'),false);
  assert.equal(await h.api.unlock(),false);
  assert.equal(h.contexts.length,1);
});

test('disabling an unresolved resume invalidates it even when immediately re-enabled',async()=>{
  const pending=deferred(),h=harness({resumeDeferred:pending});h.api.setEnabled(true);
  const oldAttempt=h.api.unlock();const old=h.contexts[0];
  h.api.play('delivery',{key:'old-receipt'});
  h.api.setEnabled(false);h.api.setEnabled(true);
  const newAttempt=h.api.unlock();const current=h.contexts[1];
  old.state='running';current.change('running');pending.resolve();
  assert.equal(await oldAttempt,false);
  assert.equal(await newAttempt,true);
  assert.ok(old.closes>=1);
  assert.equal(current.closes,0);
  assert.equal(old.nodes.length,0);
  assert.equal(h.api.play('delivery',{key:'old-receipt'}),false);
  assert.equal(h.api.play('delivery',{key:'fresh-receipt'}),true);
  assert.ok(current.nodes.length>0);
  h.finish();
});

test('keys deduplicate across cues and toggles; cooldown and phrase limits prevent overlapping bursts',async()=>{
  const h=harness();h.api.setEnabled(true);await h.api.unlock();
  assert.equal(h.api.play('completion',{key:'one'}),true);
  assert.equal(h.api.play('delivery',{key:'one'}),false);
  assert.equal(h.api.play('completion',{key:'two'}),false);
  assert.equal(h.api.play('purchase',{key:'three'}),true);
  assert.equal(h.api.play('equip',{key:'four'}),false);
  h.finish();h.advance(200);
  assert.equal(h.api.play('completion',{key:'two'}),false);
  assert.equal(h.api.play('completion',{key:'five'}),true);
  h.api.setEnabled(false);h.api.setEnabled(true);await h.api.unlock();h.advance(200);
  assert.equal(h.api.play('completion',{key:'five'}),false);
  assert.equal(h.api.play('delivery',{key:'six'}),true);
  h.finish();
});

test('interrupted audio is cleaned immediately and requires a new gesture to resume',async()=>{
  const h=harness();h.api.setEnabled(true);await h.api.unlock();
  h.api.play('milestone');const context=h.contexts[0];
  context.change('interrupted');
  assert.equal(h.timers.size,0);
  assert.ok(context.nodes.every(node=>node.disconnections>=1));
  assert.equal(h.api.play('subject',{key:'while-interrupted'}),false);
  assert.equal(context.resumes,1);
  assert.equal(await h.api.unlock(),true);
  assert.equal(context.resumes,2);
  assert.equal(h.api.play('subject',{key:'while-interrupted'}),false);
  assert.equal(h.api.play('subject',{key:'after-resume'}),true);
  h.finish();
});

test('constructor, resume, autoplay and close failures stay silent without rejected promises escaping',async()=>{
  for(const config of [{constructorThrows:true},{resumeThrows:true},{resumeRejects:true},{staysSuspended:true}]) {
    const h=harness(config);h.api.setEnabled(true);
    assert.equal(await h.api.unlock(),false);
    assert.equal(h.api.play('victory'),false);
    h.api.setEnabled(false);
  }
  const close=harness({closeRejects:true});close.api.setEnabled(true);await close.api.unlock();
  close.api.play('completion');assert.doesNotThrow(()=>close.api.setEnabled(false));
  await Promise.resolve();await Promise.resolve();
});

test('partial graph failures and fallback timers release all allocated resources',async()=>{
  for(const config of [{connectThrows:true},{startThrows:true}]) {
    const h=harness(config);h.api.setEnabled(true);await h.api.unlock();
    assert.equal(h.api.play('completion'),false);
    assert.ok(h.contexts[0].nodes.every(node=>node.disconnections>=1));
    assert.equal(h.timers.size,0);
  }
  const h=harness();h.api.setEnabled(true);await h.api.unlock();
  assert.equal(h.api.play('equip'),true);assert.equal(h.timers.size,1);
  h.flush();assert.equal(h.timers.size,0);
  assert.ok(h.contexts[0].nodes.every(node=>node.disconnections>=1));
  h.advance(200);assert.equal(h.api.play('equip'),true);h.finish();
});

test('externally closed contexts are replaced only by the next gesture and prefixed Safari API works',async()=>{
  const h=harness({webkit:true});h.api.setEnabled(true);await h.api.unlock();
  h.api.play('purchase');h.contexts[0].change('closed');
  assert.equal(h.api.play('equip'),false);
  assert.equal(h.contexts.length,1);
  assert.equal(await h.api.unlock(),true);
  assert.equal(h.contexts.length,2);
  assert.equal(h.api.play('equip'),true);h.finish();
});

test('unknown cues never allocate nodes or consume an event key; CommonJS requires no audio API',async()=>{
  const api=require('../static/audio.js');
  assert.equal(typeof api.setEnabled,'function');assert.equal(typeof api.unlock,'function');assert.equal(typeof api.play,'function');
  const h=harness({initialState:'running'});h.api.setEnabled(true);await h.api.unlock();
  for(const cue of ['unknown','constructor','__proto__',null,undefined])assert.equal(h.api.play(cue,{key:'unchanged'}),false);
  assert.equal(h.contexts[0].nodes.length,0);
  assert.equal(h.api.play('completion',{key:'unchanged'}),true);h.finish();
  assert.equal(h.contexts[0].resumes,0);
});
