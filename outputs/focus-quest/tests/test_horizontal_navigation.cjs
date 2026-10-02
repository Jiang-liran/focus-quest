const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function harness(){
  let stamp=1000;
  const map=new Map(),docMap=new Map(),rootMap=new Map(),calls=[];
  const bind=map=>({addEventListener:(name,fn)=>{const f=map.get(name)||new Set();f.add(fn);map.set(name,f);},removeEventListener:(name,fn)=>map.get(name)?.delete(fn)});
  const surface={...bind(map),style:{},clientWidth:1280};
  const quick={hidden:true},camp={id:'campfire-room-open'},city={id:'citadel-enter'};
  const doc={...bind(docMap),hidden:false,body:{dataset:{page:'today'}},documentElement:{classList:{contains:()=>false}},dialog:false,
    getElementById:id=>({'view-today':surface,'quick-skins':quick,'campfire-room-open':camp,'citadel-enter':city}[id]),
    querySelector(){return this.dialog;}};
  const root={...bind(rootMap),document:doc,performance:{now:()=>stamp},module:{exports:{}},
    FocusCampfireRoom:{isOpen:()=>false,open:a=>{calls.push(['camp',a]);return true;}},
    FocusCitadel:{isOpen:()=>false,open:a=>{calls.push(['city',a]);return true;}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../static/horizontal-navigation.js'),'utf8'),root);
  const api=root.module.exports;
  const target={closest:()=>false};
  function emit(name,patch={},where=map){
    const e={target,button:0,pointerId:1,isPrimary:true,clientX:500,clientY:300,deltaMode:0,deltaX:0,deltaY:0,defaultPrevented:false,
      preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...patch};
    for(const fn of where.get(name)||[])fn(e);
    return e;
  }
  api.init({beforeOpen:()=>calls.push(['prepare'])});
  return {api,root,doc,quick,surface,calls,map,docMap,rootMap,emit,advance:n=>stamp+=n};
}

test('only leftward trackpad gestures open camp, once per gesture',()=>{
  const h=harness();
  for(let i=0;i<3;i++)h.emit('wheel',{deltaX:40});
  assert.deepEqual(h.calls.map(x=>x[0]),['prepare','camp']);
  for(let i=0;i<20;i++){h.advance(20);h.emit('wheel',{deltaX:-80});}
  assert.equal(h.calls.length,2);
  h.advance(1200);assert.equal(h.emit('wheel',{deltaX:-120}).defaultPrevented,false);
  assert.deepEqual(h.calls.map(x=>x[0]),['prepare','camp']);
  h.emit('wheel',{deltaX:120});
  assert.deepEqual(h.calls.map(x=>x[0]),['prepare','camp','prepare','camp']);
  assert.equal(h.calls[3][1].id,'campfire-room-open');
});

test('vertical, diagonal, pinch and modified scroll remain native',()=>{
  const h=harness();
  for(const patch of [{deltaY:400},{deltaX:120,deltaY:100},{deltaX:150,ctrlKey:true},{deltaX:150,metaKey:true},{deltaX:150,shiftKey:true}])
    assert.equal(h.emit('wheel',patch).defaultPrevented,false);
  assert.equal(h.calls.length,0);
});

test('short, separated or reversed gestures cannot accidentally accumulate',()=>{
  const h=harness();
  h.emit('wheel',{deltaX:70});h.advance(230);h.emit('wheel',{deltaX:70});
  h.emit('wheel',{deltaX:-70});h.emit('wheel',{deltaY:130});h.emit('wheel',{deltaX:-70});
  h.emit('wheel',{deltaX:60});assert.equal(h.emit('wheel',{deltaX:-60}).defaultPrevented,false);h.emit('wheel',{deltaX:60});
  assert.equal(h.calls.length,0);
});

test('dragging left enters camp and suppresses the synthetic click',()=>{
  const h=harness();h.emit('pointerdown');h.emit('pointermove',{clientX:350});
  h.emit('pointerup',{clientX:350},h.docMap);
  assert.deepEqual(h.calls.map(x=>x[0]),['prepare','camp']);
  const click=h.emit('click');assert.equal(click.defaultPrevented,true);assert.equal(click.stopped,true);
  h.advance(500);assert.equal(h.emit('click').defaultPrevented,false);
});

test('dragging right remains native without opening city or suppressing a click',()=>{
  const h=harness();h.emit('pointerdown');
  assert.equal(h.emit('pointermove',{clientX:650}).defaultPrevented,false);
  assert.equal(h.emit('pointerup',{clientX:650},h.docMap).defaultPrevented,false);
  const click=h.emit('click');assert.equal(click.defaultPrevented,false);assert.equal(click.stopped,undefined);
  h.emit('pointerdown');assert.equal(h.emit('pointerup',{clientX:650},h.docMap).defaultPrevented,false);
  assert.equal(h.calls.length,0);
});

test('vertical drags and slow text selection do not open camp',()=>{
  const h=harness();h.emit('pointerdown');h.emit('pointermove',{clientY:370});h.emit('pointerup',{clientX:650,clientY:400},h.docMap);
  assert.equal(h.calls.length,0);
  h.emit('pointerdown');h.advance(1500);h.emit('pointerup',{clientX:350},h.docMap);assert.equal(h.calls.length,0);
  h.emit('pointerdown');h.emit('pointerup',{clientX:350},h.docMap);assert.equal(h.calls[1][0],'camp');
});

test('buttons, forms, dialogs, overlays and other pages are not hijacked',()=>{
  const h=harness();
  h.emit('pointerdown',{target:{closest:()=>true}});h.emit('pointerup',{clientX:350},h.docMap);
  h.emit('wheel',{deltaX:180,target:{closest:()=>true}});
  for(const [obj,key,val] of [[h.doc,'hidden',true],[h.doc,'dialog',true],[h.quick,'hidden',false],[h.doc.body.dataset,'page','review']]){
    const old=obj[key];obj[key]=val;h.emit('wheel',{deltaX:180});obj[key]=old;
  }
  h.root.FocusCitadel.isOpen=()=>true;h.emit('wheel',{deltaX:180});
  assert.equal(h.calls.length,0);
});

test('cancel and loss of visibility discard an unfinished pointer gesture',()=>{
  const h=harness();
  for(const event of ['pointercancel','visibilitychange']){
    h.emit('pointerdown');h.emit(event,{},h.docMap);h.emit('pointerup',{clientX:350},h.docMap);
  }
  assert.equal(h.calls.length,0);
});

test('inertia observed over a room cannot reopen it after returning home',()=>{
  const h=harness();h.emit('wheel',{deltaX:150});
  h.root.FocusCampfireRoom.isOpen=()=>true;
  h.advance(1600);h.emit('wheel',{deltaX:70},h.docMap);
  h.root.FocusCampfireRoom.isOpen=()=>false;
  h.advance(30);h.emit('wheel',{deltaX:150});assert.equal(h.calls.length,2);
  h.advance(250);h.emit('wheel',{deltaX:150});assert.equal(h.calls.length,4);
});

test('a second touch or released mouse button cancels the original drag',()=>{
  const h=harness();h.emit('pointerdown');h.emit('pointerdown',{isPrimary:false,pointerId:2});h.emit('pointerup',{clientX:350},h.docMap);
  h.emit('pointerdown');h.emit('pointermove',{pointerType:'mouse',buttons:0});h.emit('pointerup',{clientX:350},h.docMap);
  assert.equal(h.calls.length,0);
});

test('initialization is idempotent and repeated destroy releases all listeners',()=>{
  const h=harness();
  for(let i=0;i<100;i++){h.api.init();h.api.init();assert.equal(h.map.get('wheel').size,1);h.api.destroy();}
  for(const map of [h.map,h.docMap,h.rootMap])for(const fns of map.values())assert.equal(fns.size,0);
  assert.equal(h.surface.style.touchAction,'');
});
