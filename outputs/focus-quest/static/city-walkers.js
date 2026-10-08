(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusCityWalkers=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  // Legacy static-art anchors in the 1200 × 720 city illustration. Live
  // residents use the shared pavement mesh below, independently of these IDs.
  const routes=Object.freeze({
    west:{origin:[375,535],points:[[375,535],[377,549],[391,562],[414,582]],speed:13},
    quay:{origin:[758,425],points:[[758,425],[788,425],[817,431],[842,445]],speed:12},
    bridge:{origin:[684,548],points:[[684,548],[702,551],[722,558]],speed:12},
    bookwalk:{origin:[30,489],points:[[30,489],[53,481],[76,475]],speed:11},
    crossing:{origin:[626,389],points:[[626,389],[638,411],[662,435]],speed:12},
    east:{origin:[1103,539],points:[[1103,539],[1128,537],[1161,531]],speed:11},
    stationwalk:{origin:[28,631],points:[[28,631],[63,631],[103,637]],speed:12},
    riverwalk:{origin:[644,466],points:[[644,466],[672,481],[701,495]],speed:10},
  });
  const transform=point=>`translate(${point[0].toFixed(3)}px, ${point[1].toFixed(3)}px)`;
  function nextStep(route,index,direction){
    const last=route.points.length-1;
    if(index<=0)direction=1;
    else if(index>=last)direction=-1;
    const next=index+direction,from=route.points[index],to=route.points[next];
    return {from,to,index:next,direction,facing:to[0]<from[0]?'left':'right',duration:Math.max(1200,Math.hypot(to[0]-from[0],to[1]-from[1])/route.speed*1000)};
  }
  // Convex pavement cells are deliberately inset for the 36-unit silhouettes.
  // Only overlapping cells connect: random targets never shortcut through a
  // facade, tree, canal or bridge parapet. Routes above remain static-art anchors.
  const pavements=Object.freeze({
    booklane:{polygon:[[24,449],[65,449],[65,553],[24,557]]},
    stationbank:{polygon:[[24,620],[112,626],[112,646],[24,642]]},
    westlane:{polygon:[[374,528],[386,535],[386,562],[374,558]]},
    westcorner:{polygon:[[374,554],[386,554],[416,573],[416,590],[387,583],[374,566]]},
    northlane:{polygon:[[620,384],[645,384],[665,440],[620,446]]},
    junction:{polygon:[[648,424],[755,414],[823,424],[848,438],[660,454]]},
    riverlane:{polygon:[[619,439],[663,433],[728,469],[727,498],[684,515],[631,484]]},
    bridgeapproach:{polygon:[[648,491],[682,487],[704,516],[698,535],[661,542],[643,522]]},
    eastlane:{polygon:[[1099,429],[1178,442],[1178,552],[1099,561]]},
  });
  const gates=Object.freeze([
    {a:'westlane',b:'westcorner',edge:[[376,555],[383,558]]},
    {a:'northlane',b:'junction',edge:[[649,426],[656,434]]},
    {a:'northlane',b:'riverlane',edge:[[626,441],[648,440]]},
    {a:'junction',b:'riverlane',edge:[[662,442],[694,451]]},
    {a:'riverlane',b:'bridgeapproach',edge:[[669,503],[678,502]]},
  ]);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const unit=random=>Math.max(0,Math.min(.999999,random()));
  function contains(polygon,point){
    let sign=0;
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length];
      const cross=(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0]);
      if(Math.abs(cross)<1e-7)continue;
      if(sign&&sign!==Math.sign(cross))return false;sign=Math.sign(cross);
    }
    return true;
  }
  function randomPoint(cell,random=Math.random){
    const a=cell.polygon[0],triangles=[];let total=0;
    for(let i=1;i<cell.polygon.length-1;i++){
      const b=cell.polygon[i],c=cell.polygon[i+1];
      total+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));triangles.push({b,c,end:total});
    }
    const draw=unit(random)*total,t=triangles.find(t=>draw<t.end)||triangles.at(-1),u=Math.sqrt(unit(random)),v=unit(random);
    return a.map((n,i)=>(1-u)*n+u*(1-v)*t.b[i]+u*v*t.c[i]);
  }
  function spawn(random=Math.random,occupied=[]){
    const cells=Object.keys(pavements);let best=null,clearance=-1;
    for(let i=0;i<80;i++){
      const cell=cells[Math.floor(unit(random)*cells.length)],position=randomPoint(pavements[cell],random);
      const gap=occupied.length?Math.min(...occupied.map(p=>distance(p,position))):Infinity;
      if(gap>clearance){best={cell,position};clearance=gap;}
      if(gap>=42)return best;
    }
    return best;
  }
  function planWalk(cell,position,random=Math.random){
    const paths=new Map([[cell,[]]]),queue=[cell];
    while(queue.length){
      const at=queue.shift();
      for(const gate of gates){
        const next=gate.a===at?gate.b:gate.b===at?gate.a:null;
        if(next&&!paths.has(next)){paths.set(next,[...paths.get(at),{gate,cell:next}]);queue.push(next);}
      }
    }
    // Nearby and cross-street trips both occur; a resident is never assigned a
    // private rail with a mandatory return trip at its end.
    const choices=[...paths.keys()];let target=cell,to=position;
    for(let i=0;i<20;i++){
      target=choices[Math.floor(unit(random)*choices.length)];to=randomPoint(pavements[target],random);
      if(distance(position,to)>=18)break;
    }
    const points=paths.get(target).map(({gate,cell:next})=>{
      const t=.15+unit(random)*.7;return {cell:next,position:gate.edge[0].map((v,i)=>v+(gate.edge[1][i]-v)*t)};
    });
    points.push({cell:target,position:to});return points;
  }
  function createController(env=root){
    const doc=env.document,states=new Map(),random=env.random||Math.random;
    let scope=null,observer=null,intersection=null,media=null,started=false,destroyed=false,queued=false;
    const selector='.city-walker[data-city-walker][data-city-route]';
    function visible(state){
      const node=state.node;
      return node.isConnected&&!doc.hidden&&env.__focusQuestVisible!==false&&env.FocusRuntime?.isVisible?.()!==false&&
        !doc.documentElement.classList.contains('focus-runtime-hidden')&&!media?.matches&&!state.outside&&
        !node.closest('[hidden],[inert],.no-motion,[data-motion="false"]')&&
        !node.parentElement?.closest('[data-paused="true"]')&&node.getClientRects().length>0;
    }
    function mark(state,key,value){
      for(const node of [state.node,state.character])if(node&&node.dataset[key]!==value)node.dataset[key]=value;
    }
    function sync(state){
      const onstage=visible(state),talking=state.node.dataset.talking==='true'||state.character?.dataset.talking==='true';
      const active=onstage&&!state.hover&&!state.focus&&!talking;
      mark(state,'paused',String(!onstage));mark(state,'motionPaused',String(!active));mark(state,'walking',String(active&&state.phase==='walk'));
      if(active){if(state.animation?.playState==='paused')state.animation.play();}
      else if(state.animation?.playState!=='paused')state.animation?.pause();
    }
    function launch(state,phase){
      if(destroyed||states.get(state.node)!==state||!state.node.isConnected)return;
      state.phase=phase;mark(state,'phase',phase);
      const walking=phase==='walk',next=state.path[0];
      const facing=next&&next.position[0]<state.position[0]?'left':'right';
      const leg=walking?{from:state.position,to:next.position,duration:Math.max(1200,distance(state.position,next.position)/state.speed*1000)}:
        {from:state.position,to:state.position,duration:phase==='look'?280:phase==='turn'?680:1000+unit(random)*3400};
      if(phase==='look')mark(state,'looking',facing);
      if(phase==='turn'||walking){state.facing=facing;mark(state,'facing',facing);mark(state,'looking',facing);}
      const animation=state.node.animate([{transform:transform(leg.from)},{transform:transform(leg.to)}],{duration:leg.duration,easing:'linear',fill:'both'});
      state.animation=animation;
      animation.onfinish=()=>{
        if(destroyed||states.get(state.node)!==state||state.animation!==animation)return;
        state.node.style.transform=transform(leg.to);
        animation.onfinish=null;animation.cancel();state.animation=null;
        if(walking){state.position=leg.to;state.cell=state.path.shift().cell;}
        // The animation is the single phase clock, including a planted-foot
        // glance and turn. Hover, focus and backgrounding freeze every beat.
        if(phase==='look')launch(state,'turn');
        else if(phase==='turn')launch(state,'walk');
        else if(walking&&(!state.path.length||unit(random)<.38))launch(state,'rest');
        else{
          if(!state.path.length)state.path=planWalk(state.cell,state.position,random);
          launch(state,(state.path[0].position[0]<state.position[0]?'left':'right')!==state.facing?'look':'walk');
        }
      };
      sync(state);
    }
    function remove(state){
      if(state.animation)state.animation.onfinish=null;
      state.animation?.cancel();
      for(const [event,fn] of state.listeners)state.node.removeEventListener(event,fn);
      intersection?.unobserve(state.node);mark(state,'walking','false');mark(state,'paused','true');states.delete(state.node);
    }
    function attach(node){
      const route=routes[node.dataset.cityRoute];
      if(!route||!node.dataset.cityWalker||typeof node.animate!=='function')return;
      const initial=spawn(random,[...states.values()].map(s=>s.position));
      const state={node,character:node.querySelector('.city-npc[data-city-npc]'),route,cell:initial.cell,position:initial.position,path:[],speed:10+unit(random)*4,phase:'rest',facing:unit(random)<.5?'left':'right',animation:null,listeners:[],outside:false,hover:false,focus:false};
      node.style.transform=transform(state.position);
      const bind=(event,fn)=>{state.listeners.push([event,fn]);node.addEventListener(event,fn);};
      bind('pointerenter',()=>{state.hover=true;sync(state);});
      bind('pointerleave',()=>{state.hover=false;sync(state);});
      bind('focusin',()=>{state.focus=true;sync(state);});
      bind('focusout',event=>{if(node.contains?.(event.relatedTarget))return;state.focus=false;sync(state);});
      states.set(node,state);mark(state,'facing',state.facing);mark(state,'looking',state.facing);intersection?.observe(node);launch(state,'rest');
    }
    function refresh(){
      if(destroyed||!started)return;
      for(const state of states.values())if(!state.node.isConnected||!scope?.contains?.(state.node)||state.route!==routes[state.node.dataset.cityRoute])remove(state);
      for(const node of (scope||doc).querySelectorAll(selector))if(!states.has(node))attach(node);
      for(const state of states.values())sync(state);
    }
    function queue(){
      if(queued||destroyed)return;queued=true;
      (env.queueMicrotask||queueMicrotask)(()=>{queued=false;refresh();});
    }
    function init(){
      if(started||destroyed||!doc)return;started=true;scope=doc.getElementById('citadel-view')||doc;
      media=env.matchMedia?.('(prefers-reduced-motion: reduce)');media?.addEventListener?.('change',refresh);
      doc.addEventListener('visibilitychange',refresh);doc.addEventListener('focusquest:visibility',queue);
      if(env.IntersectionObserver)intersection=new env.IntersectionObserver(entries=>{
        for(const entry of entries){const state=states.get(entry.target);if(state){state.outside=!entry.isIntersecting;sync(state);}}
      },{threshold:0});
      if(env.MutationObserver){
        observer=new env.MutationObserver(records=>{
          if(records.some(record=>record.type==='childList'||record.attributeName==='data-talking'||!record.target.closest?.('.city-walker')))queue();
        });
        observer.observe(scope,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','inert','class','data-motion','data-paused','data-talking']});
        if(scope!==doc)observer.observe(doc.documentElement,{attributes:true,attributeFilter:['class','hidden','inert']});
      }
      refresh();
    }
    function destroy(){
      destroyed=true;observer?.disconnect();intersection?.disconnect();
      media?.removeEventListener?.('change',refresh);doc?.removeEventListener('visibilitychange',refresh);doc?.removeEventListener('focusquest:visibility',queue);
      for(const state of [...states.values()])remove(state);
    }
    return {init,refresh,destroy,size:()=>states.size};
  }
  let controller;
  return Object.freeze({routes,pavements,gates,contains,randomPoint,spawn,planWalk,nextStep,transform,createController,init(){if(!controller){controller=createController();controller.init();}},refresh(){controller?.refresh();}});
});
