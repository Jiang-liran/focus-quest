'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const roam=require('../static/companion-roaming.js'),shop=require('../static/shop-art.js'),city=require('../static/rain-city-art.js');
const randomGenerator=()=>{let n=8137;return()=>((n=(n*1664525+1013904223)>>>0)/4294967296);};
test('every waypoint and the complete connecting segment remain in the inset floor for long sessions',()=>{
 const random=randomGenerator();
 for(const [name,zone] of Object.entries(roam.zones)){
  let point=roam.spawnPoint(zone,zone.origin,random);
  assert.ok(roam.contains(zone.polygon,point),name+' legal random birth');
  for(let i=0;i<1200;i++){
   const leg=roam.nextLeg(zone,point,['walk','hop','fly','swim','crawl','slither'][i%6],random);
   assert.ok(Number.isFinite(leg.duration)&&leg.duration>=1800);
   for(let t=0;t<=10;t++)assert.ok(roam.contains(zone.polygon,leg.from.map((a,j)=>a+(leg.to[j]-a)*t/10)),name+' entire path');
   assert.ok(leg.to[0]>50&&leg.to[1]>100&&leg.to[0]<(name==='island'?540:1150)&&leg.to[1]<(name==='island'?300:700),name+' canvas margin');
   point=leg.to;
  }
 }
});
test('safe foot-to-local conversion matches all actual companion mounts and leaves previews inert',()=>{
 const eq={companion:'companion-fox'};
 const cases=[['home','observatory','home',707,622.8,.6],['rooftop','observatory','rain',754,608,.66],['library','library','rain',740.4,596.96,.62],['tea','tea','rain',797,605.8,.6],['atelier','atelier','rain',921,604,.62],['arcade','arcade','rain',706,629.4,.55],['station','station','rain',721,591,.62]];
 for(const [zone,place,mode,x,y,scale] of cases){
  const svg=city.interior(place,{},eq,{mode,interactive:true});
  assert.ok(svg.includes(`translate(${x} ${y}) scale(${scale})`),zone);
  assert.ok(svg.includes(`data-pet-zone="${zone}"`),zone);
  assert.ok(Math.abs(roam.zones[zone].origin[0]-(x+80*scale))<1e-6);
  assert.ok(Math.abs(roam.zones[zone].origin[1]-(y+92*scale))<1e-6);
  assert.doesNotMatch(city.interior(place,{},eq,{mode,interactive:false}),/data-pet-zone=/);
 }
 assert.match(city.scene({},eq,{interactive:true}),/data-pet-zone="city"/);
 assert.doesNotMatch(shop.preview(eq.companion),/data-pet-zone=/);
 assert.doesNotMatch(city.interior('observatory',{},eq,{mode:'panorama',interactive:true}),/data-pet-zone=/);
 for(const zone of Object.values(roam.zones))assert.equal(roam.transform(zone,zone.origin),'translate(0.000px, 0.000px)');
});
function harness(){
 const nodes=[],listeners=new Map(),mediaListeners=new Map(),animations=[],observers=[],intersections=[];
 const classes=new Set();let visible=true;
 const media={matches:false,addEventListener:(k,f)=>mediaListeners.set(k,f),removeEventListener:k=>mediaListeners.delete(k)};
 const doc={hidden:false,documentElement:{classList:{contains:k=>classes.has(k)}},querySelectorAll:()=>nodes.filter(n=>n.isConnected),addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
 const env={document:doc,random:randomGenerator(),queueMicrotask:f=>f(),FocusRuntime:{isVisible:()=>visible},matchMedia:()=>media,
  MutationObserver:class{constructor(cb){this.callback=cb;observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}},
  IntersectionObserver:class{constructor(cb){this.callback=cb;this.nodes=new Set();intersections.push(this);}observe(n){this.nodes.add(n);}unobserve(n){this.nodes.delete(n);}disconnect(){this.nodes.clear();}}};
 const add=(zone='home')=>{const events=new Map();const node={dataset:{petZone:zone,companionLife:'companion-fox',petGait:'walk'},style:{},isConnected:true,hidden:false,
  closest:()=>node.hidden?{}:null,getClientRects:()=>[{}],addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),events,
  animate(frames,options){const a={frames,options,playState:'running',currentTime:0,onfinish:null,pause(){this.playState='paused';},play(){this.playState='running';},cancel(){this.playState='idle';},finish(){this.currentTime=options.duration;this.onfinish?.();}};animations.push(a);return a;}};nodes.push(node);return node;};
 return {nodes,listeners,mediaListeners,media,animations,observers,intersections,classes,doc,env,add,visible:value=>{visible=value;},controller:roam.createController(env)};
}
test('poll refreshes preserve one motion, walk/rest transitions and re-entry resumes without teleporting',()=>{
 const h=harness(),n=h.add();h.controller.init();h.controller.init();
 assert.equal(h.observers.length,1);assert.equal(h.animations.length,1);
 h.animations[0].finish();const walk=h.animations.at(-1);assert.equal(n.dataset.petMoving,'true');
 walk.currentTime=950;
 for(let i=0;i<100;i++)h.controller.refresh();
 assert.equal(h.animations.length,2);assert.equal(walk.currentTime,950);
 n.hidden=true;h.controller.refresh();assert.equal(walk.playState,'paused');assert.equal(n.dataset.petPaused,'true');
 n.hidden=false;h.controller.refresh();assert.equal(walk.playState,'running');assert.equal(walk.currentTime,950);
 walk.finish();assert.equal(h.animations.length,3);
 assert.equal(h.animations.at(-1).frames[0].transform,walk.frames[1].transform);
 let steps=1;while(n.dataset.petMoving==='true'&&steps++<4)h.animations.at(-1).finish();
 assert.equal(n.dataset.petMoving,'false','pets stop after one to three random legs');
 h.controller.destroy();
});
test('hover/focus stop feet at their current position and greetings cannot open underlying buildings',()=>{
 const h=harness(),n=h.add();h.controller.init();h.animations[0].finish();const walk=h.animations.at(-1);walk.currentTime=400;
 n.events.get('pointerenter')();assert.equal(walk.playState,'paused');assert.equal(n.dataset.petMoving,'false');assert.equal(n.dataset.petPaused,'false');
 n.events.get('focusin')();n.events.get('pointerleave')();assert.equal(walk.playState,'paused');
 n.events.get('focusout')();assert.equal(walk.playState,'running');assert.equal(walk.currentTime,400);
 let stopped=false;n.events.get('click')({stopPropagation(){stopped=true;}});assert.ok(stopped);h.controller.destroy();
});
test('native occlusion, reduced motion and offscreen scenes suspend both travel and joints',()=>{
 const h=harness(),n=h.add();h.controller.init();h.animations[0].finish();const walk=h.animations.at(-1);
 for(const [off,on] of [
  [()=>{h.doc.hidden=true;},()=>{h.doc.hidden=false;}],
  [()=>h.visible(false),()=>h.visible(true)],
  [()=>h.classes.add('focus-runtime-hidden'),()=>h.classes.delete('focus-runtime-hidden')],
  [()=>{h.media.matches=true;},()=>{h.media.matches=false;}],
 ]){off();h.controller.refresh();assert.equal(walk.playState,'paused');assert.equal(n.dataset.petPaused,'true');on();h.controller.refresh();assert.equal(walk.playState,'running');}
 h.intersections[0].callback([{target:n,isIntersecting:false}]);assert.equal(walk.playState,'paused');
 h.intersections[0].callback([{target:n,isIntersecting:true}]);assert.equal(walk.playState,'running');h.controller.destroy();
});
test('equipping or replacing a scene cancels departed animation and cannot resurrect from late completion',()=>{
 const h=harness(),n=h.add();h.controller.init();const old=h.animations[0],late=old.onfinish;
 n.isConnected=false;const replacement=h.add('city');h.controller.refresh();
 assert.equal(old.playState,'idle');assert.equal(n.events.size,0);assert.equal(h.controller.size(),1);assert.equal(h.intersections[0].nodes.size,1);
 const count=h.animations.length;late();assert.equal(h.animations.length,count);
 h.controller.destroy();assert.equal(replacement.events.size,0);assert.equal(h.listeners.size,0);assert.equal(h.mediaListeners.size,0);assert.equal(h.controller.size(),0);assert.equal(h.observers[0].active,false);
 h.controller.refresh();assert.equal(h.animations.length,count);
});
test('unsupported animation and invalid zones stay inert; no interval or frame loop is introduced',()=>{
 const h=harness();h.add('not-a-place');const n=h.add();delete n.animate;h.controller.init();assert.equal(h.animations.length,0);h.controller.destroy();
 const source=fs.readFileSync(require.resolve('../static/companion-roaming.js'),'utf8');assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage/);
});

test('city equipment static policy leaves articulated companions active in real scenes',()=>{
 const css=fs.readFileSync(require.resolve('../static/rain-city-art.css'),'utf8');
 assert.match(css,/rain-city-equipment:not\(\.rain-city-equipment-companion\)/);
 assert.doesNotMatch(css,/\.rain-city-equipment \*[,\{]/);
});

test('births are randomized beside the current owner, clipped to legal floor and separated from their body',()=>{
 const anchors={island:[[166,218],[258,220],[398,176]],city:[[636.24,568.9]],home:[[912.76,568.1]],rooftop:[[712.48,634.8]],library:[[363.2,641.5]],tea:[[884.2,645.5]],atelier:[[393.2,630.5]],arcade:[[497.2,666.5]],station:[[663.2,638.5]]};
 const random=randomGenerator();
 for(const [name,list] of Object.entries(anchors))for(const anchor of list){
  const zone=roam.zones[name],nearest=roam.closestPoint(zone,anchor),radius=Math.max(zone.spawnRadius||145,Math.hypot(...nearest.map((v,j)=>v-anchor[j]))+zone.scale*30),positions=[];
  for(let i=0;i<300;i++){
   const point=roam.spawnPoint(zone,anchor,random);positions.push(point.map(v=>v.toFixed(2)).join(','));
   assert.ok(roam.contains(zone.polygon,point),name+' safe birth');
   const gap=Math.hypot(...point.map((v,j)=>v-anchor[j]));
   assert.ok(gap<=radius+1e-7,name+' close to current owner');assert.ok(gap>=zone.scale*60-1e-7,name+' clear of owner body');
  }
  assert.ok(new Set(positions).size>280,name+' no fixed birth point');
 }
 for(const zone of Object.values(roam.zones))assert.ok(roam.contains(zone.polygon,roam.spawnPoint(zone,zone.origin,()=>.5)),'constant RNG has bounded legal fallback');
});

test('SVG birth anchor follows owner travel progress and scene scale; failures use a safe fallback',()=>{
 const zone=roam.zones.island;let received;
 const traveler={getCTM:()=>({traveler:true})},scene={querySelector:()=>traveler,getCTM:()=>({inverse:()=>({scene:true})})};
 const node={dataset:{petZone:'island'},closest:()=>scene,ownerSVGElement:{createSVGPoint:()=>({x:0,y:0,matrixTransform(matrix){received=[this.x,this.y,matrix];return {matrixTransform:()=>({x:258,y:220})};}})}};
 assert.deepEqual(roam.playerAnchor(node,zone),[258,220]);assert.deepEqual(received.slice(0,2),[171,220]);
 traveler.getCTM=()=>{throw Error('hidden SVG')};assert.deepEqual(roam.playerAnchor(node,zone),zone.origin);
 const h=harness(),n=h.add('island');h.controller.init();assert.notEqual(n.style.transform,roam.transform(zone,zone.origin));
 const birth=n.style.transform;for(let i=0;i<200;i++)h.controller.refresh();assert.equal(n.style.transform,birth);
 n.dataset.petZone='city';h.controller.refresh();assert.equal(h.controller.size(),1);assert.equal(h.animations[0].playState,'idle');h.controller.destroy();
});

test('hidden scenes wait to sample the current owner until first shown, and then keep their birth position',()=>{
 const h=harness(),n=h.add('island');n.hidden=true;h.controller.init();
 assert.equal(h.animations.length,0);assert.equal(h.controller.size(),1);
 n.hidden=false;h.controller.refresh();assert.equal(h.animations.length,1);const birth=n.style.transform;
 n.hidden=true;h.controller.refresh();n.hidden=false;h.controller.refresh();
 assert.equal(h.animations.length,1);assert.equal(n.style.transform,birth);h.controller.destroy();
});

test('reduced motion still places a visible pet near its owner but leaves travel paused',()=>{
 const h=harness(),n=h.add('island');h.media.matches=true;h.controller.init();
 assert.notEqual(n.style.transform,roam.transform(roam.zones.island,roam.zones.island.origin));
 assert.equal(h.animations.length,1);assert.equal(h.animations[0].playState,'paused');assert.equal(n.dataset.petMoving,'false');
 h.media.matches=false;h.controller.refresh();assert.equal(h.animations[0].playState,'running');h.controller.destroy();
});

test('narrow island spawn neighborhoods have a separated fallback even when area samples miss',()=>{
 const zone=roam.zones.island,anchor=[166,218],p=roam.spawnPoint(zone,anchor,()=>.5);
 assert.ok(roam.contains(zone.polygon,p));const gap=Math.hypot(...p.map((v,i)=>v-anchor[i]));
 assert.ok(gap>=zone.scale*60&&gap<=zone.spawnRadius);
});
