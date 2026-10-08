'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const walkers=require('../static/city-walkers.js');
const rng=(seed=8137)=>()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);

test('all routes follow consecutive pavement points, reverse at ends and retain silhouette margins',()=>{
  const streets={west:[374,533,416,584],quay:[756,423,844,447],bridge:[682,546,724,560],bookwalk:[28,473,78,491],crossing:[624,387,664,437],east:[1101,529,1163,541],stationwalk:[26,629,105,639],riverwalk:[642,464,703,497]};
  assert.equal(Object.keys(walkers.routes).length,8);
  for(const [name,route] of Object.entries(walkers.routes)){
    assert.deepEqual(route.origin,route.points[0]);
    let index=0,direction=1;const visited=new Set();
    for(let i=0;i<2500;i++){
      const leg=walkers.nextStep(route,index,direction);visited.add(leg.index);
      assert.equal(Math.abs(index-leg.index),1,'never shortcut over intermediate corners');
      assert.ok(Number.isFinite(leg.duration)&&leg.duration>=1200);
      for(let tick=0;tick<=10;tick++){
        const [x,y]=leg.from.map((v,k)=>v+(leg.to[k]-v)*tick/10),[l,t,r,b]=streets[name];
        assert.ok(x>=l&&x<=r&&y>=t&&y<=b,name+' stays in designated pavement');
        assert.ok(x-24>0&&x+24<1200&&y-70>0&&y+7<720,'whole figure has viewport margin');
        if(name==='west')assert.ok(x>356+18&&y<600,'clear of station roof and canal');
        if(name==='quay')assert.ok(x<899-24&&y<458,'clear of arcade sign and tea roof');
        if(name==='bridge'){
          // Existing top rail: M552 600 Q643 519 739 568. The feet
          // remain just behind its edge, never down the front bridge wall.
          const q=(-182+Math.sqrt(182*182+20*(x-552)))/10;
          const rail=600-162*q+130*q*q;
          assert.ok(y<=rail+1&&y>=rail-7,'inside the narrow bridge deck');
        }
      }
      index=leg.index;direction=leg.direction;
    }
    assert.equal(visited.size,route.points.length);
  }
});

test('eight street residents and indoor hosts are rendered at the player’s scene scale',()=>{
  const roomArt=require('../static/city-room-art.js'),cityArt=require('../static/rain-city-art.js');
  const playerScale=svg=>Number(svg.match(/class="rain-city-traveler"[^>]*transform="translate\([^)]*\) scale\(([\d.]+)\)"/)?.[1]);
  const street=roomArt.street(true),people=[...street.matchAll(/class="city-walker" data-city-walker="([^"]+)" data-city-route="([^"]+)"[^>]*><g transform="scale\(([\d.]+)\)"/g)];
  assert.equal(people.length,8);assert.equal(new Set(people.map(match=>match[1])).size,8);
  assert.deepEqual(new Set(people.map(match=>match[2])),new Set(Object.keys(walkers.routes)));
  // Their articulated drawing is about 120 units tall; the player's original
  // avatar is about 64. Compare visible height, not the unrelated SVG scales.
  const comparable=(npc,player,label)=>assert.ok(Math.abs(120*npc/(64*player)-1)<.08,label+' stays within 8% of the player silhouette');
  const streetPlayer=playerScale(cityArt.scene());assert.equal(streetPlayer,.57);
  for(const [,id,,scale] of people){assert.equal(Number(scale),.3);comparable(Number(scale),streetPlayer,id);}
  for(const place of ['library','tea','atelier','arcade','station']){
    const svg=roomArt.interior(place,'rain',true),scale=roomArt.rooms[place].at[2];
    assert.ok(svg.includes(`scale(${scale})"><g class="city-npc`));
    comparable(scale,1.35,place);
  }
  for(const [room,mode] of [['home','home'],['rooftop','rain']]){
    const svg=roomArt.interior('observatory',mode,true),scale=roomArt.rooms[room].at[2];
    assert.ok(svg.includes(`scale(${scale})"><g class="city-npc`));
    comparable(scale,playerScale(cityArt.interior('observatory',{},{},{mode})),room);
  }
});

function harness(){
  const nodes=[],listeners=new Map(),mediaListeners=new Map(),animations=[],observers=[],intersections=[],microtasks=[];
  const classes=new Set();let nativeVisible=true;
  const media={matches:false,addEventListener:(k,f)=>mediaListeners.set(k,f),removeEventListener:k=>mediaListeners.delete(k)};
  const scope={querySelectorAll:()=>nodes.filter(n=>n.isConnected&&n.inScope),contains:n=>n.inScope};
  const doc={hidden:false,documentElement:{classList:{contains:k=>classes.has(k)}},getElementById:id=>id==='citadel-view'?scope:null,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
  const env={document:doc,random:rng(),queueMicrotask:f=>microtasks.push(f),FocusRuntime:{isVisible:()=>nativeVisible},matchMedia:()=>media,
    MutationObserver:class{constructor(cb){this.callback=cb;this.targets=[];observers.push(this);}observe(target,config){this.targets.push({target,config});this.active=true;}disconnect(){this.active=false;}},
    IntersectionObserver:class{constructor(cb){this.callback=cb;this.nodes=new Set();intersections.push(this);}observe(n){this.nodes.add(n);}unobserve(n){this.nodes.delete(n);}disconnect(){this.nodes.clear();}}};
  const add=(route='west',id='reader')=>{
    const events=new Map(),character={dataset:{cityNpc:id}};
    const node={dataset:{cityWalker:id,cityRoute:route},style:{},isConnected:true,inScope:true,hidden:false,parentPaused:false,character,events,
      parentElement:{closest:()=>node.parentPaused?{}:null},querySelector:()=>character,
      closest:selector=>selector==='.city-walker'?node:node.hidden?{}:null,
      contains:target=>target===character,getClientRects:()=>[{}],addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),
      animate(frames,options){const a={frames,options,playState:'running',currentTime:0,onfinish:null,pauseCount:0,
        pause(){this.playState='paused';this.pauseCount++;},play(){this.playState='running';},cancel(){this.playState='idle';},finish(){this.currentTime=options.duration;this.onfinish?.();}};animations.push(a);return a;}};
    nodes.push(node);return node;
  };
  return {nodes,listeners,mediaListeners,media,animations,observers,intersections,classes,microtasks,scope,doc,env,add,visible:value=>{nativeVisible=value;},flush(){while(microtasks.length)microtasks.shift()();},controller:walkers.createController(env)};
}

test('stable refreshes preserve time and one animation per walker; corners connect without teleporting',()=>{
  const h=harness(),n=h.add();h.controller.init();h.controller.init();
  assert.equal(h.controller.size(),1);assert.equal(h.observers.length,1);assert.equal(h.observers[0].targets.length,2);
  assert.notEqual(h.animations[0].frames[0].transform,walkers.transform(walkers.routes.west.origin));
  let count=0;while(n.dataset.phase!=='walk'&&count++<20)h.animations.at(-1).finish();
  assert.ok(count<20);const initialCount=h.animations.length,walk=h.animations.at(-1);walk.currentTime=760;
  for(let i=0;i<200;i++)h.controller.refresh();
  assert.equal(h.animations.length,initialCount);assert.equal(walk.currentTime,760);assert.equal(n.character.dataset.walking,'true');
  walk.finish();assert.equal(h.animations.at(-1).frames[0].transform,walk.frames[1].transform);
  assert.equal(walk.playState,'idle');assert.equal(h.animations.filter(a=>a.playState!=='idle').length,1);
  h.controller.destroy();
});

test('hover, focus and conversation pause at the current position and resume only after all release',()=>{
  const h=harness(),n=h.add();h.controller.init();h.animations[0].finish();const a=h.animations.at(-1);a.currentTime=920;
  n.events.get('pointerenter')();assert.equal(a.playState,'paused');assert.equal(n.character.dataset.walking,'false');assert.equal(n.dataset.paused,'false');
  n.events.get('focusin')();n.events.get('pointerleave')();assert.equal(a.playState,'paused');
  n.events.get('focusout')({relatedTarget:n.character});assert.equal(a.playState,'paused');
  n.dataset.talking='true';n.events.get('focusout')({relatedTarget:null});assert.equal(a.playState,'paused');
  n.dataset.talking='false';h.controller.refresh();assert.equal(a.playState,'running');assert.equal(a.currentTime,920);
  n.character.dataset.talking='true';h.controller.refresh();assert.equal(a.playState,'paused');h.controller.destroy();
});

test('random heading changes plant both feet, glance and finish turning before the next trip',()=>{
  const h=harness(),n=h.add();h.controller.init();
  let count=0;while(n.dataset.phase!=='look'&&count++<80)h.animations.at(-1).finish();
  assert.ok(count<80);const glance=h.animations.at(-1),at=glance.frames[0].transform,oldFacing=n.character.dataset.facing;
  assert.notEqual(n.character.dataset.looking,oldFacing,'head leads shoulders');
  assert.equal(glance.frames[1].transform,at);assert.equal(n.character.dataset.walking,'false');
  glance.finish();const turn=h.animations.at(-1);
  assert.equal(n.dataset.phase,'turn');assert.notEqual(n.character.dataset.facing,oldFacing);
  assert.equal(turn.frames[0].transform,at);assert.equal(turn.frames[1].transform,at);
  assert.equal(n.character.dataset.walking,'false');turn.finish();const walk=h.animations.at(-1);
  assert.equal(n.dataset.phase,'walk');assert.equal(n.character.dataset.walking,'true');
  assert.equal(walk.frames[0].transform,at);assert.notEqual(walk.frames[1].transform,at);
  assert.equal(h.animations.filter(a=>a.playState!=='idle').length,1);h.controller.destroy();
});

test('hovering, talking and backgrounding freeze both phases of a turn and keep their current time',()=>{
  const h=harness(),n=h.add('west');h.controller.init();
  let count=0;while(n.dataset.phase!=='look'&&count++<30)h.animations.at(-1).finish();
  assert.ok(count<30);
  for(const phase of ['look','turn']){
    const a=h.animations.at(-1);assert.equal(n.dataset.phase,phase);a.currentTime=110;
    n.events.get('pointerenter')();
    assert.equal(a.playState,'paused');assert.equal(n.character.dataset.motionPaused,'true');
    n.dataset.talking='true';n.events.get('pointerleave')();
    assert.equal(a.playState,'paused');assert.equal(a.currentTime,110);
    n.dataset.talking='false';h.controller.refresh();
    assert.equal(a.playState,'running');assert.equal(n.character.dataset.motionPaused,'false');
    h.doc.hidden=true;h.controller.refresh();assert.equal(a.playState,'paused');
    h.doc.hidden=false;h.controller.refresh();assert.equal(a.playState,'running');assert.equal(a.currentTime,110);
    a.finish();
  }
  assert.equal(n.dataset.phase,'walk');h.controller.destroy();
});

test('document, native, scene, reduced-motion and offscreen guards pause both route and body animation',()=>{
  const h=harness(),n=h.add('bridge');h.controller.init();h.animations[0].finish();const a=h.animations.at(-1);
  for(const [off,on] of [
    [()=>{h.doc.hidden=true;},()=>{h.doc.hidden=false;}],
    [()=>h.visible(false),()=>h.visible(true)],
    [()=>{h.env.__focusQuestVisible=false;},()=>{h.env.__focusQuestVisible=true;}],
    [()=>h.classes.add('focus-runtime-hidden'),()=>h.classes.delete('focus-runtime-hidden')],
    [()=>{h.media.matches=true;},()=>{h.media.matches=false;}],
    [()=>{n.hidden=true;},()=>{n.hidden=false;}],
    [()=>{n.parentPaused=true;},()=>{n.parentPaused=false;}],
  ]){
    off();h.controller.refresh();assert.equal(a.playState,'paused');assert.equal(n.character.dataset.paused,'true');
    on();h.controller.refresh();assert.equal(a.playState,'running');assert.equal(n.character.dataset.paused,'false');
  }
  h.intersections[0].callback([{target:n,isIntersecting:false}]);assert.equal(a.playState,'paused');
  h.intersections[0].callback([{target:n,isIntersecting:true}]);assert.equal(a.playState,'running');h.controller.destroy();
});

test('conversation mutations reconcile once, while animation state markers do not create a feedback loop',()=>{
  const h=harness(),n=h.add();h.controller.init();h.animations[0].finish();const a=h.animations.at(-1),callback=h.observers[0].callback;
  for(let i=0;i<100;i++)callback([{type:'attributes',attributeName:'data-paused',target:n}]);
  assert.equal(h.microtasks.length,0);
  n.dataset.talking='true';for(let i=0;i<100;i++)callback([{type:'attributes',attributeName:'data-talking',target:n}]);
  assert.equal(h.microtasks.length,1);h.flush();assert.equal(a.playState,'paused');
  n.dataset.talking='false';callback([{type:'attributes',attributeName:'data-talking',target:n}]);h.flush();assert.equal(a.playState,'running');
  h.controller.destroy();
});

test('detached/replaced walkers release animations, observers and events; late finish cannot restart them',()=>{
  const h=harness(),n=h.add();h.controller.init();const old=h.animations[0],finish=old.onfinish;
  n.isConnected=false;const replacement=h.add('quay','tea-host');h.controller.refresh();
  assert.equal(n.events.size,0);assert.equal(old.playState,'idle');assert.equal(h.controller.size(),1);assert.equal(h.intersections[0].nodes.size,1);
  const count=h.animations.length;finish();assert.equal(h.animations.length,count);
  replacement.inScope=false;h.controller.refresh();assert.equal(h.controller.size(),0);
  h.controller.destroy();assert.equal(h.listeners.size,0);assert.equal(h.mediaListeners.size,0);assert.equal(h.observers[0].active,false);
  assert.equal(replacement.events.size,0);h.controller.refresh();assert.equal(h.animations.length,count);
});

test('all walkers keep independent phases without timers, requests, or frame polling',()=>{
  const h=harness(),routes=Object.keys(walkers.routes);routes.forEach((route,index)=>h.add(route,String.fromCharCode(97+index)));h.controller.init();
  assert.equal(routes.length,8);
  assert.equal(h.controller.size(),routes.length);assert.equal(new Set(h.animations.map(a=>a.options.duration)).size,routes.length);
  for(let i=0;i<400;i++){
    const live=h.animations.filter(a=>a.playState!=='idle');assert.equal(live.length,routes.length);
    for(const a of live)a.finish();
  }
  h.doc.hidden=true;h.controller.refresh();
  assert.equal(h.animations.filter(a=>a.playState==='paused').length,8);
  for(const node of h.nodes)assert.equal(node.character.dataset.paused,'true');
  h.doc.hidden=false;h.controller.refresh();assert.equal(h.animations.filter(a=>a.playState==='running').length,8);
  h.controller.destroy();assert.equal(h.animations.filter(a=>a.playState!=='idle').length,0);
  assert.equal(h.controller.size(),0);assert.equal(h.intersections[0].nodes.size,0);assert.equal(h.listeners.size,0);assert.equal(h.mediaListeners.size,0);
  for(const node of h.nodes)assert.equal(node.events.size,0);
  const source=fs.readFileSync(require.resolve('../static/city-walkers.js'),'utf8');
  assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage/);
  const css=fs.readFileSync(require.resolve('../static/city-residents.css'),'utf8');
  assert.doesNotMatch(css,/scaleX\(-1\)/,'no full character squash-and-flip while turning');
  assert.match(css,/data-phase=turn\]\[data-motion-paused=true\]/,'articulated pivot pauses with its phase clock');
});

test('invalid routes and unsupported animations stay inert',()=>{
  const h=harness();h.add('missing');const unsupported=h.add('west');delete unsupported.animate;
  h.controller.init();assert.equal(h.animations.length,0);h.controller.destroy();
});

test('random birth positions spread residents out and vary across visits, independent of identity and route',()=>{
  const samples=[],occupied=[],random=rng(7001);
  for(let i=0;i<8;i++){
    const birth=walkers.spawn(random,occupied);samples.push(birth);occupied.push(birth.position);
    assert.ok(walkers.contains(walkers.pavements[birth.cell].polygon,birth.position));
    for(const previous of occupied.slice(0,-1))assert.ok(Math.hypot(...birth.position.map((v,j)=>v-previous[j]))>=42);
  }
  assert.ok(new Set(samples.map(s=>s.cell)).size>=4);
  assert.notDeepEqual(walkers.spawn(rng(1)),walkers.spawn(rng(2)));
  const h=harness();Object.keys(walkers.routes).forEach((r,i)=>h.add(r,'same-'+i));h.controller.init();
  const positions=h.animations.map(a=>a.frames[0].transform);for(let i=0;i<200;i++)h.controller.refresh();
  assert.deepEqual(h.animations.map(a=>a.frames[0].transform),positions,'ordinary polls do not respawn residents');h.controller.destroy();
});

test('long random trips cross shared pavement gates and stay out of buildings and the canal',()=>{
  const random=rng(59391),visited=new Set(),destinations=new Set();
  for(const [start,cell] of Object.entries(walkers.pavements)){
    // All cells must be convex for the straight legs within a cell to be safe.
    const signs=cell.polygon.map((a,i)=>{const b=cell.polygon[(i+1)%cell.polygon.length],c=cell.polygon[(i+2)%cell.polygon.length];return Math.sign((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]));});
    assert.equal(new Set(signs.filter(Boolean)).size,1,start+' is convex');
    let from=walkers.randomPoint(cell,random),at=start;
    for(let i=0;i<500;i++){
      const trip=walkers.planWalk(at,from,random);destinations.add(trip.at(-1).cell);
      for(const next of trip){
        if(next.cell!==at){assert.ok(walkers.contains(walkers.pavements[at].polygon,next.position));visited.add([at,next.cell].sort().join(':'));}
        for(let t=0;t<=15;t++){
          const p=from.map((v,j)=>v+(next.position[j]-v)*t/15);
          assert.ok(walkers.contains(walkers.pavements[at].polygon,p),at+' complete leg legal');
          assert.ok(p[0]>=24&&p[0]<=1178&&p[1]>=384&&p[1]<=646);
          for(const [x,y,w,h] of [[128,242,239,268],[419,322,189,209],[654,98,180,278],[866,278,217,186],[766,448,244,207],[137,522,219,133]])
            assert.ok(!(p[0]>=x&&p[0]<=x+w&&p[1]>=y&&p[1]<=y+h),'no building footprint '+at+' '+JSON.stringify(p)+' in '+JSON.stringify([x,y,w,h]));
          if(p[0]>=600&&p[0]<=750){const q=(-182+Math.sqrt(182*182+20*(p[0]-552)))/10,rail=600-162*q+130*q*q;assert.ok(p[1]<rail,'no canal or bridge front wall');}
        }
        from=next.position;at=next.cell;
      }
    }
  }
  assert.equal(visited.size,walkers.gates.length);assert.equal(destinations.size,Object.keys(walkers.pavements).length);
});
