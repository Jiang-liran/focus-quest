const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/app.js'),'utf8').split("\ndocument.querySelectorAll('[data-view]')")[0];
function harness(){
  const requests=[],scrolls=[],focuses=[],order=[],views=new Map();let overlay=false,required=false,nativeVisible=true,layout='loading',city=false,camp=false,trail=false;
  const target={hidden:false,scrollIntoView(options){scrolls.push({...options,layout});},focus(options){focuses.push({...options});}};
  for(const id of ['today','review','quests','shop','history','achievements'])views.set(id,{id:'view-'+id,hidden:id!=='quests'});
  const document={hidden:false,body:{dataset:{page:'quests'}},getElementById:id=>id==='method-rewards'?target:null,
    querySelectorAll:selector=>selector==='.view'?[...views.values()]:[],querySelector:selector=>selector==='dialog[open]'?(overlay?{}:null):null};
  const context=vm.createContext({document,window:{scrollTo(){order.push('reset-scroll');}},setTimeout(){},
    FocusGoals:{required:()=>required},FocusRuntime:{isVisible:()=>nativeVisible},
    FocusReviewHeatmap:{onEnter:()=>new Promise(resolve=>requests.push(()=>{layout='calendar-ready';order.push('calendar-ready');resolve();})),onLeave(){order.push('leave-review');}},
    FocusCitadel:{close(){city=false;},isOpen:()=>city,open(){city=true;}},
    FocusCampfireRoom:{close(){camp=false;},isOpen:()=>camp},FocusReturnTrail:{close(){trail=false;},isOpen:()=>trail},
    FocusArcade:{enter(){order.push('arcade-enter');},leave(){order.push('arcade-leave');}}});
  vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  run("state={settings:{motion:true}};currentView='quests';stopScenePreview=()=>{};setNavSelection=()=>{};updateViewTitle=()=>{};");
  return {document,target,requests,scrolls,focuses,order,run,open:()=>run('openMethodRewards()'),
    set overlay(v){overlay=v;},set required(v){required=v;},set nativeVisible(v){nativeVisible=v;},set city(v){city=v;},set camp(v){camp=v;},set trail(v){trail=v;}};
}

test('method entrance waits for review layout before scrolling and focusing the workshop',async()=>{
  const h=harness(),pending=h.open();
  assert.equal(h.run('currentView'),'review');assert.equal(h.requests.length,1);assert.equal(h.scrolls.length,0);assert.equal(h.focuses.length,0);
  assert.ok(h.order.includes('arcade-leave'),'ordinary switchView side effects remain synchronous');
  h.requests.shift()();assert.equal(await pending,true);
  assert.deepEqual(h.scrolls,[{block:'start',behavior:'smooth',layout:'calendar-ready'}]);assert.deepEqual(h.focuses,[{preventScroll:true}]);
});
test('switchView exposes review readiness and a user leaving then returning cancels the old jump',async()=>{
  const h=harness(),pending=h.open();h.run("switchView('shop');switchView('review');");
  assert.ok(h.order.includes('leave-review'));h.requests[0]();assert.equal(await pending,false);assert.equal(h.scrolls.length,0);assert.equal(h.focuses.length,0);
  h.requests[1]();
});
test('only the newest entrance may reposition the page while its first request is still loading',async()=>{
  const h=harness(),first=h.open(),second=h.open();h.requests[0]();assert.equal(await first,false);assert.equal(h.scrolls.length,0);
  h.requests[1]();assert.equal(await second,true);assert.equal(h.scrolls.length,1);assert.equal(h.focuses.length,1);
});
test('late heatmap completion cannot steal focus from other scenes, dialogs or a hidden app',async()=>{
  for(const name of ['city','camp','trail','overlay','nativeVisible','documentHidden']){
    const h=harness(),pending=h.open();
    if(name==='documentHidden')h.document.hidden=true;else h[name]=name==='nativeVisible'?false:true;
    h.requests.shift()();assert.equal(await pending,false,name);assert.equal(h.scrolls.length,0,name);assert.equal(h.focuses.length,0,name);
  }
});
test('weekly-goal gates and missing/hidden workshop prevent jumps; reduced motion stays immediate',async()=>{
  const blocked=harness();blocked.required=true;assert.equal(await blocked.open(),false);assert.equal(blocked.requests.length,0);
  const hidden=harness(),pending=hidden.open();hidden.target.hidden=true;hidden.requests.shift()();assert.equal(await pending,false);
  const h=harness();h.run('state.settings.motion=false;');const ready=h.open();h.requests.shift()();await ready;assert.equal(h.scrolls[0].behavior,'auto');
});
