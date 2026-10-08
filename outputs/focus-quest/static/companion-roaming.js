(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusPetRoaming=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  // Convex, inset FOOT positions in scene SVG units, not viewport pixels.
  // origin is the art mount reference, not a birth position.
  // Translation lives outside the articulated body, so camera/resize transforms
  // cannot push a pet outside its floor. Props and entry buttons stay untouched.
  const zones=Object.freeze({
    island:{origin:[388.5,238.11],scale:.53,spawnRadius:46,polygon:[[165,221],[205,207],[404,213],[411,229],[278,249],[189,239]]},
    city:{origin:[689,586.2],scale:.35,spawnRadius:65,polygon:[[625,516],[662,508],[698,521],[695,537],[663,541],[629,538]]},
    home:{origin:[755,678],scale:.6,polygon:[[1002,627],[1094,646],[1094,691],[1002,691]]},
    rooftop:{origin:[806.8,668.72],scale:.66,polygon:[[636,644],[814,644],[814,691],[636,691]]},
    library:{origin:[790,654],scale:.62,polygon:[[307,645],[358,615],[399,618],[420,644],[418,688],[307,688]]},
    tea:{origin:[845,661],scale:.6,polygon:[[812,618],[1110,609],[1110,690],[812,690]]},
    atelier:{origin:[970.6,661.04],scale:.62,polygon:[[307,605],[437,605],[456,650],[437,690],[307,690]]},
    arcade:{origin:[750,680],scale:.55,polygon:[[446,636],[530,629],[609,657],[609,694],[443,694]]},
    station:{origin:[770.6,648.04],scale:.62,polygon:[[568,638],[1066,615],[1120,650],[1120,691],[568,691]]},
  });
  const speeds={walk:30,hop:35,fly:31,swim:25,crawl:15,slither:24};
  function contains(polygon,point){
    let sign=0;
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],cross=(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]);
      if(Math.abs(cross)<1e-7)continue;
      const next=Math.sign(cross);if(sign&&sign!==next)return false;sign=next;
    }
    return true;
  }
  function randomPoint(zone,random=Math.random){
    const points=zone.polygon,a=points[0],triangles=[];let total=0;
    for(let i=1;i<points.length-1;i++){
      const b=points[i],c=points[i+1],area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
      total+=area;triangles.push({b,c,end:total});
    }
    const draw=Math.min(.999999,Math.max(0,random()))*total,t=triangles.find(t=>draw<t.end)||triangles.at(-1);
    const u=Math.sqrt(Math.min(1,Math.max(0,random()))),v=Math.min(1,Math.max(0,random()));
    return a.map((value,i)=>(1-u)*value+u*(1-v)*t.b[i]+u*v*t.c[i]);
  }
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  function closestPoint(zone,point){
    if(contains(zone.polygon,point))return point.slice();
    let best=zone.polygon[0],gap=Infinity;
    for(let i=0;i<zone.polygon.length;i++){
      const a=zone.polygon[i],b=zone.polygon[(i+1)%zone.polygon.length],dx=b[0]-a[0],dy=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)));
      const candidate=[a[0]+dx*t,a[1]+dy*t],d=distance(candidate,point);
      if(d<gap){gap=d;best=candidate;}
    }
    return best;
  }
  function spawnPoint(zone,anchor,random=Math.random){
    const nearest=closestPoint(zone,anchor),radius=Math.max(zone.spawnRadius||145,distance(nearest,anchor)+zone.scale*30);
    // Sampling is bounded, even with a constant test RNG. Do not place a pet
    // inside its owner's body; when furniture blocks that spot use nearby floor.
    for(let i=0;i<96;i++){
      const candidate=randomPoint(zone,random),d=distance(candidate,anchor);
      if(d<=radius&&d>=zone.scale*60)return candidate;
    }
    // A narrow edge near the owner may reject most area samples. Probe a
    // local ring rather than falling back onto the owner's feet.
    const alternatives=[];
    for(let i=0;i<32;i++){
      const angle=i*Math.PI/16,candidate=closestPoint(zone,[anchor[0]+Math.cos(angle)*radius*.9,anchor[1]+Math.sin(angle)*radius*.9]);
      const d=distance(candidate,anchor);
      if(d<=radius&&d>=zone.scale*60)alternatives.push(candidate);
    }
    if(alternatives.length)return alternatives[Math.floor(Math.max(0,Math.min(.999999,random()))*alternatives.length)];
    return nearest;

  }
  function playerAnchor(node,zone){
    const scene=node.closest?.('.floating-island')||node.ownerSVGElement;
    const traveler=scene?.querySelector?.(node.dataset.petZone==='island'?'#scene-traveler':'.rain-city-traveler');
    const svg=node.ownerSVGElement;
    try{
      if(traveler&&svg?.createSVGPoint&&scene.getCTM?.()&&traveler.getCTM?.()){
        const point=svg.createSVGPoint();
        // Island travel progress changes this transform. Reading the live SVG
        // matrices keeps spawning close to the current owner, at every zoom.
        point.x=node.dataset.petZone==='island'?171:32;
        point.y=node.dataset.petZone==='island'?220:70;
        const local=point.matrixTransform(traveler.getCTM()).matrixTransform(scene.getCTM().inverse());
        if(Number.isFinite(local.x)&&Number.isFinite(local.y))return [local.x,local.y];
      }
    }catch(error){/* A hidden/disconnected SVG may have no invertible matrix. */}
    return zone.origin;
  }
  function nextLeg(zone,from,gait='walk',random=Math.random){
    let to=from;
    for(let i=0;i<16;i++){
      to=randomPoint(zone,random);
      if(Math.hypot(to[0]-from[0],to[1]-from[1])>=zone.scale*35)break;
    }
    // Mix longer explorations with small nearby steps, and vary the pace.
    if(random()<.4){const t=.4+random()*.4;to=from.map((v,i)=>v+(to[i]-v)*t);}
    const length=distance(to,from),pace=.8+random()*.4;
    return {from,to,duration:Math.max(1800,length/(zone.scale*(speeds[gait]||speeds.walk)*pace)*1000),facing:to[0]<from[0]?'left':'right'};
  }
  const transform=(zone,point)=>`translate(${((point[0]-zone.origin[0])/zone.scale).toFixed(3)}px, ${((point[1]-zone.origin[1])/zone.scale).toFixed(3)}px)`;
  function createController(env=root){
    const doc=env.document,states=new Map(),random=env.random||Math.random;
    let observer=null,intersection=null,media=null,started=false,destroyed=false,queued=false;
    const selector='.pet-life[data-pet-zone]';
    function globallyVisible(){return !doc.hidden&&env.__focusQuestVisible!==false&&env.FocusRuntime?.isVisible?.()!==false&&!doc.documentElement.classList.contains('focus-runtime-hidden');}
    function shown(state){
      const n=state.node;
      return n.isConnected&&globallyVisible()&&!state.outside&&!n.closest('[hidden],[inert]')&&n.getClientRects().length>0;
    }
    function onStage(state){
      return shown(state)&&!media?.matches&&!state.node.closest('.no-motion,[data-motion="false"],[data-paused="true"]');
    }
    function mark(state,moving){state.node.dataset.petMoving=String(moving);}
    function launch(state,walking){
      if(destroyed||!state.node.isConnected)return;
      state.walking=walking;
      const leg=walking?nextLeg(state.zone,state.position,state.node.dataset.petGait,random):{from:state.position,to:state.position,duration:900+random()*4200};
      state.leg=leg;
      if(walking)state.node.dataset.petFacing=leg.facing;
      const animation=state.node.animate([{transform:transform(state.zone,leg.from)},{transform:transform(state.zone,leg.to)}],{duration:leg.duration,easing:'linear',fill:'both'});
      state.animation=animation;
      animation.onfinish=()=>{
        if(destroyed||states.get(state.node)!==state||state.animation!==animation)return;
        state.position=leg.to;state.node.style.transform=transform(state.zone,leg.to);
        animation.onfinish=null;animation.cancel();state.animation=null;
        if(walking)state.strides++;
        else state.strides=0;
        launch(state,!walking||(state.strides<3&&random()<.5));
      };
      sync(state);
    }
    function sync(state){
      const visible=onStage(state),active=visible&&!state.hover&&!state.focus;
      if(shown(state)&&!state.position){
        state.position=spawnPoint(state.zone,playerAnchor(state.node,state.zone),random);
        state.node.style.transform=transform(state.zone,state.position);launch(state,false);return;
      }
      state.node.dataset.petPaused=String(!visible);mark(state,active&&state.walking);
      if(active){if(state.animation?.playState==='paused')state.animation.play();}
      else state.animation?.pause();
    }
    function remove(state){
      state.animation&&(state.animation.onfinish=null);state.animation?.cancel();
      for(const [event,fn] of state.listeners)state.node.removeEventListener(event,fn);
      intersection?.unobserve(state.node);mark(state,false);states.delete(state.node);
    }
    function attach(node){
      const zone=zones[node.dataset.petZone];if(!zone||typeof node.animate!=='function')return;
      // Unknown/malformed art never acquires a running animation.
      if(!/^companion-[a-z0-9]+$/.test(node.dataset.companionLife||''))return;
      const state={node,zone,position:null,strides:0,walking:false,animation:null,listeners:[],outside:false,hover:false,focus:false};
      const bind=(event,fn)=>{state.listeners.push([event,fn]);node.addEventListener(event,fn);};
      bind('pointerenter',()=>{state.hover=true;sync(state);});
      bind('pointerleave',()=>{state.hover=false;sync(state);});
      bind('focusin',()=>{state.focus=true;sync(state);});
      bind('focusout',event=>{if(node.contains?.(event?.relatedTarget))return;state.focus=false;sync(state);});
      // Greeting a companion must not activate the island's city entry beneath it.
      bind('click',event=>event.stopPropagation());
      states.set(node,state);intersection?.observe(node);sync(state);
    }
    function refresh(){
      if(destroyed||!started)return;
      for(const state of states.values())if(!state.node.isConnected||state.zone!==zones[state.node.dataset.petZone])remove(state);
      for(const node of doc.querySelectorAll(selector))if(!states.has(node))attach(node);
      for(const state of states.values())sync(state);
    }
    function queue(){
      if(queued||destroyed)return;queued=true;
      (env.queueMicrotask||queueMicrotask)(()=>{queued=false;refresh();});
    }
    function init(){
      if(started||destroyed||!doc)return;started=true;
      media=env.matchMedia?.('(prefers-reduced-motion: reduce)');media?.addEventListener?.('change',refresh);
      doc.addEventListener('visibilitychange',refresh);doc.addEventListener('focusquest:visibility',queue);
      if(env.IntersectionObserver)intersection=new env.IntersectionObserver(entries=>{
        for(const entry of entries){const state=states.get(entry.target);if(state){state.outside=!entry.isIntersecting;sync(state);}}
      },{threshold:0});
      if(env.MutationObserver){
        observer=new env.MutationObserver(records=>{
          if(records.some(record=>record.type==='childList'||!record.target.closest?.('.pet-life')))queue();
        });
        observer.observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','inert','class','data-motion','data-paused']});
      }
      refresh();
    }
    function destroy(){
      destroyed=true;observer?.disconnect();intersection?.disconnect();
      media?.removeEventListener?.('change',refresh);doc.removeEventListener('visibilitychange',refresh);doc.removeEventListener('focusquest:visibility',queue);
      for(const state of [...states.values()])remove(state);
    }
    return {init,refresh,destroy,size:()=>states.size};
  }
  let controller;
  return Object.freeze({zones,contains,randomPoint,closestPoint,spawnPoint,playerAnchor,nextLeg,transform,createController,init(){if(!controller){controller=createController();controller.init();}},refresh(){controller?.refresh();}});
});
