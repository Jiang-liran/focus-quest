const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/goals.js'),'utf8');
const app=fs.readFileSync(require.resolve('../static/app.js'),'utf8');
const html=fs.readFileSync(require.resolve('../static/index.html'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
function snapshot({required=false,changes=0,date='2026-09-27',today='2026-09-27',week='2026-09-21',targets={math:180,cs:180,politics:60,english:60}}={}){
  const goals={today,daily:{day:today,targets,total:Object.values(targets).reduce((a,b)=>a+b,0),changesUsed:changes,changesRemaining:2-changes,changeLimit:2,defaultTargets:{math:180,cs:180,politics:60,english:60},targetEstimated:false,targetSource:'recorded'},weekly:{weekStart:week,weekEnd:week==='2026-09-21'?'2026-09-27':'2026-10-04',target:2400,confirmed:!required,locked:!required,targetEstimated:required},weeklyRequired:required};
  return {date,today,goals,subjects:Object.entries(targets).map(([id,target])=>({id,target}))};
}
function harness(initial=snapshot(),nativeUUID=true){
  const elements=new Map(),requests=[],refreshes=[],toasts=[],docListeners={};let serial=0,current=initial,resumed=0,before=0;
  function element(id){
    if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',value:'',hidden:false,disabled:false,open:false,shown:0,dataset:{},listeners:{},
      addEventListener(type,callback){(this.listeners[type]??=[]).push(callback);},
      async emit(type,detail={}){const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...detail};for(const listener of this.listeners[type]||[])await listener(event);return event;},
      showModal(){this.open=true;this.shown++;},close(){this.open=false;for(const listener of this.listeners.close||[])listener();}});
    return elements.get(id);
  }
  const document={hidden:false,getElementById:element,createElement:()=>element('host'),body:{appendChild(){}},addEventListener(type,fn){docListeners[type]=fn;}};
  const context=vm.createContext({document,crypto:nativeUUID?{randomUUID:()=>`request-${++serial}`}:{getRandomValues:bytes=>{for(let i=0;i<bytes.length;i++)bytes[i]=i+1;return bytes;}},Date,Math,Number});
  vm.runInContext(source,context);
  const api=context.FocusGoals;
  api.init({api:(path,body)=>new Promise((resolve,reject)=>requests.push({path,body,resolve,reject})),refresh:async(...args)=>{refreshes.push(args);api.render(current);},toast:(...args)=>toasts.push(args),resume:()=>resumed++,beforeWeekly:()=>before++});
  api.render(initial);
  return {api,element,requests,refreshes,toasts,document,docListeners,
    render(next){current=next;api.render(next);},respond(next){current=next;requests.at(-1).resolve(next.goals);},
    get resumed(){return resumed;},get before(){return before;}};
}

test('daily target parsing preserves minute precision and rejects invalid or impossible plans',()=>{
  const {api}=harness();
  assert.deepEqual(clone(api.parseTargets({math:3.5,cs:3,politics:.5,english:1})),{math:210,cs:180,politics:30,english:60});
  assert.equal(api.parseTargets({math:1/60,cs:3,politics:1,english:1}).math,1);
  for(const values of [{math:0,cs:3,politics:1,english:1},{math:'NaN',cs:3,politics:1,english:1},{math:24,cs:3,politics:1,english:1},{math:3,cs:3,politics:1,english:Infinity}])assert.throws(()=>api.parseTargets(values));
  for(const value of [0,-1,'',Infinity,169])assert.throws(()=>api.parseWeekly(value));
  assert.equal(api.parseWeekly(50.5),3030);
});

test('mandatory weekly plan resists Escape, repeated polls and programmatic close',async()=>{
  const h=harness(snapshot({required:true})),dialog=h.element('goal-weekly-dialog');
  assert.equal(dialog.open,true);assert.equal(dialog.shown,1);assert.equal(h.api.required(),true);
  h.element('goal-week-hours').value='46.5';
  h.render(snapshot({required:true}));assert.equal(h.element('goal-week-hours').value,'46.5');assert.equal(dialog.shown,1);
  assert.equal((await dialog.emit('cancel')).defaultPrevented,true);
  dialog.close();assert.equal(dialog.open,true);assert.equal(dialog.shown,2);
  assert.equal(h.requests.length,0,'opening does not confirm the week automatically');
});

test('required weekly entry waits while app hidden and takes priority over daily entry',()=>{
  const h=harness();h.document.hidden=true;h.render(snapshot({required:true}));
  assert.equal(h.element('goal-weekly-dialog').open,false);h.api.openDaily();assert.equal(h.element('goal-daily-dialog').open,false);
  h.document.hidden=false;h.docListeners.visibilitychange();assert.equal(h.element('goal-weekly-dialog').open,true);
});

test('weekly save retries an uncertain network failure with same receipt and preserves typed hours',async()=>{
  const h=harness(snapshot({required:true}));h.element('goal-week-hours').value='46.5';
  const first=h.element('goal-weekly-form').emit('submit');assert.equal(h.requests.length,1);
  assert.deepEqual(clone(h.requests[0].body),{weekStart:'2026-09-21',target:2790,requestId:'request-1'});
  await h.element('goal-weekly-form').emit('submit');assert.equal(h.requests.length,1,'double click sends only once');
  h.requests[0].reject(new Error('网络中断'));await first;
  assert.equal(h.element('goal-weekly-error').textContent,'网络中断');assert.equal(h.element('goal-week-hours').value,'46.5');
  h.render(snapshot({required:true}));assert.equal(h.element('goal-week-hours').value,'46.5');
  const retry=h.element('goal-weekly-form').emit('submit');assert.equal(h.requests[1].body.requestId,'request-1');
  const confirmed=snapshot();confirmed.goals.weekly.target=2790;h.respond(confirmed);await retry;
  assert.equal(h.api.required(),false);assert.equal(h.element('goal-weekly-dialog').open,false);
  assert.deepEqual(h.refreshes,[[true,true]],'goal changes refresh without reward celebrations');
  assert.ok(h.resumed>0);
});

test('another window confirming the weekly target releases this gate',()=>{
  const h=harness(snapshot({required:true}));h.render(snapshot());
  assert.equal(h.element('goal-weekly-dialog').open,false);assert.equal(h.api.required(),false);
});

test('week boundary starts a fresh required form, not the previous week draft',()=>{
  const h=harness(snapshot({required:true}));h.element('goal-week-hours').value='70';
  h.render(snapshot({required:true,today:'2026-09-28',date:'2026-09-28',week:'2026-09-28'}));
  assert.equal(h.element('goal-week-hours').value,'40');assert.match(h.element('goal-weekly-range').textContent,/2026.09.28/);
});

test('daily form keeps edits on polls, advertises mystery threshold and consumes no unchanged attempt',async()=>{
  const h=harness();h.api.openDaily();
  assert.equal(h.element('goal-daily-dialog').open,true);
  await h.element('goal-daily-form').emit('submit');assert.equal(h.requests.length,0);assert.match(h.element('goal-daily-error').textContent,/没有变化/);
  h.element('goal-hours-math').value='2.5';await h.element('goal-daily-form').emit('input');
  assert.match(h.element('goal-mystery-status').textContent,/未开启/);assert.equal(h.element('goal-daily-total').textContent,'7小时30分钟');
  h.render(snapshot());assert.equal(h.element('goal-hours-math').value,'2.5');
  const pending=h.element('goal-daily-form').emit('submit');assert.equal(h.requests[0].path,'/api/goals/daily');
  assert.deepEqual(clone(h.requests[0].body),{day:'2026-09-27',targets:{math:150,cs:180,politics:60,english:60},requestId:'request-1'});
  const saved=snapshot({changes:1,targets:{math:150,cs:180,politics:60,english:60}});h.respond(saved);await pending;
  assert.equal(h.element('goal-daily-dialog').open,false);assert.deepEqual(h.refreshes,[[true,true]]);assert.match(h.element('goal-keeper-quota').textContent,/1 \/ 2/);
});

test('daily uncertain retry reuses request identity even after server state already changed',async()=>{
  const h=harness();h.api.openDaily();h.element('goal-hours-math').value='4';
  const first=h.element('goal-daily-form').emit('submit');h.requests[0].reject(new Error('丢失响应'));await first;
  const saved=snapshot({changes:1,targets:{math:240,cs:180,politics:60,english:60}});h.render(saved);
  const retry=h.element('goal-daily-form').emit('submit');assert.equal(h.requests[1].body.requestId,h.requests[0].body.requestId);
  h.respond(saved);await retry;assert.equal(h.requests.length,2);
});

test('history and exhausted quota cannot open daily adjustment; stale day cannot be submitted',async()=>{
  const history=harness(snapshot({date:'2026-09-26'}));history.api.openDaily();assert.equal(history.element('goal-daily-open').disabled,true);assert.equal(history.element('goal-daily-dialog').open,false);
  const exhausted=harness(snapshot({changes:2}));exhausted.api.openDaily();assert.equal(exhausted.element('goal-daily-open').disabled,true);assert.equal(exhausted.element('goal-daily-dialog').open,false);
  const h=harness();h.api.openDaily();h.element('goal-hours-math').value='4';h.render(snapshot({today:'2026-09-28',date:'2026-09-28'}));
  assert.equal(h.element('goal-daily-save').disabled,true);await h.element('goal-daily-form').emit('submit');assert.equal(h.requests.length,0);assert.match(h.element('goal-daily-error').textContent,/日期已经切换/);
});

test('review removes duplicate subjects, settings do not carry targets, both new modules are wired',()=>{
  assert.doesNotMatch(html,/id="subjects"|id="target-inputs"|id="weekly-target-input"|id="targets-edit"/);
  assert.doesNotMatch(app,/function renderSubjects\(|\$\('target-inputs'\)/);
  assert.match(html,/id="expedition-subjects"/);assert.match(html,/id="goal-keeper"/);assert.match(html,/id="review-heatmap"/);
  assert.match(html,/src="\/goals.js"/);assert.match(html,/src="\/review-heatmap.js"/);
  const settings=app.slice(app.indexOf('async function saveSettings('),app.indexOf('function renderSource('));
  assert.doesNotMatch(settings,/weeklyTarget|\btargets\b/);assert.match(settings,/mapping,activityMapping,motion:/);
  assert.match(app,/FocusGoals\?\.render\(s\)/);assert.match(app,/FocusReviewHeatmap\?\.onEnter\(\)/);
});

test('weekly mandatory gate is checked before claiming openings and displaying queued celebrations',()=>{
  const prefix=app.split("\ndocument.querySelectorAll('[data-view]')")[0];
  const context=vm.createContext({FocusGoals:{required:()=>true},document:{hidden:false},setTimeout(){throw Error('should not schedule');}});
  vm.runInContext(prefix,context);
  vm.runInContext("state={settings:{motion:true}};openingPending=true;celebrationQueue=[{title:'queued'}];",context);
  assert.doesNotThrow(()=>vm.runInContext('maybeDailyOpening();playNextCelebration();showSettings();switchView("review")',context));
  assert.equal(vm.runInContext('celebrationQueue.length',context),1,'celebrations are retained for after confirmation');
  assert.equal(vm.runInContext('currentView',context),'today');
});


test('older WebViews without crypto.randomUUID still send canonical UUIDv4 receipts',async()=>{
  const h=harness(snapshot({required:true}),false);
  const save=h.element('goal-weekly-form').emit('submit');
  assert.match(h.requests[0].body.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  h.respond(snapshot());await save;
});

test('required weekly gate suspends and resumes the same running arcade session without abandoning or buying a ticket',()=>{
  const arcadeHarness=require('./arcade_harness.cjs');
  const calls={mounts:[],updates:[],suspends:0};let required=true;
  const h=arcadeHarness.harness({setTimeout(){},FocusGoals:{required:()=>required},FocusExpedition:{pause(){},resumeResonance(){}},FocusSurvivor:{scene(){return '';},rules(){return '';},mount(host,session){calls.mounts.push(session.id);},update(session){calls.updates.push(session.id);},suspend(){calls.suspends++;},destroy(){},postcard(){return '';}}});
  const active=arcadeHarness.game('trail',{type:'survivor',venue:'star-survivor',state:{phase:'playing',wave:3,kills:40}});
  const data=arcadeHarness.snapshot({active,used:1,available:3,venues:[{id:'star-survivor',type:'survivor',name:'星海幸存者',plays:1}]});
  h.api.render(data);assert.equal(calls.mounts.length,1);
  vm.runInContext(app.split("\ndocument.querySelectorAll('[data-view]')")[0],h.context);
  vm.runInContext("currentView='achievements';pauseForWeeklyGoals();",h.context);
  assert.ok(calls.suspends>0);const mounted=calls.mounts.length;
  h.api.render({...data,now:arcadeHarness.time(200)});assert.equal(calls.mounts.length,mounted,'polling cannot restart the battle behind the gate');
  vm.runInContext('resumeAfterGoals()',h.context);assert.equal(calls.mounts.length,mounted,'still required: cannot resume');
  required=false;vm.runInContext('resumeAfterGoals();resumeAfterGoals()',h.context);
  assert.equal(calls.mounts.length,mounted+1);assert.equal(calls.mounts.at(-1),active.id);
  assert.equal(h.calls.requests.length,0,'no game action, abandon, purchase or new ticket request');
  assert.equal(data.used,1);assert.equal(data.available,3);
});

test('camp and citadel remain behind the mandatory gate; their existing state is not closed or reset',()=>{
  const calls=[];const context=vm.createContext({FocusGoals:{required:()=>true},FocusQuickSkins:{close:()=>calls.push('skins')},FocusExpedition:{pause:()=>calls.push('expedition')},FocusArcade:{leave:()=>calls.push('game')},FocusCampfireRoom:{close(){throw Error('must preserve camp');}},FocusCitadel:{close(){throw Error('must preserve city');}}});
  vm.runInContext(app.split("\ndocument.querySelectorAll('[data-view]')")[0],context);
  vm.runInContext('pauseForWeeklyGoals();resumeAfterGoals()',context);
  assert.deepEqual(calls,['skins','expedition']);
});
