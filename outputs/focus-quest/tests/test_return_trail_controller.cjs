const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/return-trail.js'),'utf8');
const model=require('../static/expedition-model.js');

function harness({motion=true,storage=false}={}){
  const document={activeElement:null,hidden:false},listeners=new Map(),mediaListeners=[],animations=[];
  const calls={opened:0,closed:0,origins:[],camp:0,city:0,scenes:[],sounds:[],mounts:[],campClose:[],cityClose:[],quick:[]};
  let state={date:'2026-09-28',today:'2026-09-28',totals:{minutes:0,target:480},settings:{motion},quests:{now:'2026-09-28T12:00:00.000100+08:00',equipped:{avatar:'avatar-default',theme:'theme-default'}}};
  const camel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.id='';this.children=[];this.parentElement=null;this.hidden=false;this.inert=false;this.disabled=false;this.attributes={};this.dataset={};this.className='';this.textContent='';this._html='';this.htmlWrites=0;this.listeners=new Map();this.classes=new Set();this.classList={add:(...names)=>names.forEach(name=>this.classes.add(name)),remove:(...names)=>names.forEach(name=>this.classes.delete(name)),contains:name=>this.classes.has(name)};}
    get isConnected(){return this===document.body||this===document.documentElement||Boolean(this.parentElement?.isConnected);}
    append(...nodes){nodes.forEach(node=>{node.parentElement=this;this.children.push(node);});}
    contains(node){return this===node||this.children.some(child=>child.contains(node));}
    setAttribute(name,value){this.attributes[name]=String(value);if(name==='id')this.id=String(value);if(name==='class')this.className=String(value);if(name.startsWith('data-'))this.dataset[camel(name.slice(5))]=String(value);if(name==='disabled')this.disabled=true;}
    getAttribute(name){if(name==='hidden')return this.hidden?'':null;if(name==='inert')return this.inert?'':null;return this.attributes[name]??null;}
    matches(selector){
      if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim()));
      if(selector==='dialog[open]')return this.tagName==='DIALOG'&&this.open;
      if(selector.startsWith('#'))return this.id===selector.slice(1);
      if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));
      const attr=selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);if(attr)return this.getAttribute(attr[1])!==null&&(attr[2]===undefined||this.getAttribute(attr[1])===attr[2]);
      return this.tagName.toLowerCase()===selector;
    }
    closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    getClientRects(){for(let node=this;node;node=node.parentElement)if(node.hidden)return [];return this.isConnected?[{}]:[];}
    focus(){if(this.disabled||!this.getClientRects().length)return;for(let node=this;node;node=node.parentElement)if(node.inert)return;document.activeElement=this;}
    addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
    get innerHTML(){return this._html;}
    set innerHTML(value){
      if(this.children.some(child=>child.contains(document.activeElement)))document.activeElement=null;
      this.children.forEach(child=>child.parentElement=null);this.children=[];this._html=String(value);this.htmlWrites++;
      const stack=[this];for(const token of this._html.matchAll(/<(\/?)([a-z][\w-]*)([^>]*)>/gi)){
        if(token[1]){if(stack.length>1)stack.pop();continue;}
        const node=new Element(token[2]);for(const attr of token[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g))node.setAttribute(attr[1],attr[2]??'');
        stack.at(-1).append(node);if(!/^(input|br|hr|img|meta|link)$/i.test(token[2])&&!/\/$/.test(token[3]))stack.push(node);
      }
    }
    animate(frames,options){let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});const animation={node:this,frames,options,finished,cancelled:false,cancel(){this.cancelled=true;reject(new Error('cancel'));},finish(){resolve();}};animations.push(animation);return animation;}
  }
  const add=(id,tag='div',parent=document.body)=>{const node=new Element(tag);node.id=id;parent?.append(node);return node;};
  document.body=new Element('body');document.documentElement=new Element('html');
  const main=add('main','main'),sidebar=add('sidebar','aside'),entry=add('campfire-room-open','button',main),cityEntry=add('citadel-enter','button',main),nav=add('nav','button',sidebar),menu=add('quick-skins');menu.hidden=true;entry.focus();
  document.createElement=tag=>new Element(tag);document.getElementById=id=>document.body.querySelector('#'+id);
  document.querySelectorAll=selector=>selector==='body > main'?[main]:document.body.querySelectorAll(selector);
  document.querySelector=selector=>document.querySelectorAll(selector)[0]||null;
  document.addEventListener=(type,fn,capture=false)=>{const list=listeners.get(type)||[];list.push({fn,capture:capture===true});listeners.set(type,list);};
  const media={matches:false,addEventListener(type,fn){mediaListeners.push(fn);}};
  function emit(target,type,patch={}){const event={target,button:0,key:'',ctrlKey:false,altKey:false,metaKey:false,repeat:false,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...patch};for(const {fn,capture} of listeners.get(type)||[])if(capture&&!event.stopped)fn(event);for(let node=target;node&&!event.stopped;node=node.parentElement)for(const fn of node.listeners.get(type)||[])if(!event.stopped)fn(event);for(const {fn,capture} of listeners.get(type)||[])if(!capture&&!event.stopped)fn(event);return event;}
  const context=vm.createContext({document,FocusExpeditionModel:model,FocusReturnTrailArt:{scene(index,equipment,options){calls.scenes.push({index,equipment:{...equipment},options:{...options}});return '<svg><g class="trail-traveler"></g><g data-trail-step="-1" tabindex="0" role="button"></g><g data-trail-interact tabindex="0" role="button"></g><g data-trail-step="1" tabindex="0" role="button"></g></svg>';}},FocusCampfireRoom:{close(value){calls.campClose.push(value);}},FocusCitadel:{close(value){calls.cityClose.push(value);}},FocusQuickSkins:{close(value){calls.quick.push(value);menu.hidden=true;}},FocusAmbience:{setScene(scene){calls.sounds.push(scene);},mount(node,scene){calls.mounts.push({node,scene});}},matchMedia:()=>media,addEventListener(){},setTimeout(){throw new Error('The trail cannot create timers');},requestAnimationFrame(){throw new Error('The trail cannot start a permanent frame loop');},fetch(){throw new Error('The trail cannot write records or rewards');},localStorage:{getItem(){if(!storage)throw new Error('No account data access');return null;},setItem(){throw new Error('No writes to account/reward data');}}});
  vm.runInContext(source,context);const api=context.FocusReturnTrail;
  const callbacks={getState:()=>state,onOpen(){calls.opened++;},afterClose(){calls.closed++;},onClose(from){calls.origins.push(from);},onCamp(){calls.camp++;},onCity(){calls.city++;}};
  api.init(callbacks);
  return {api,document,main,sidebar,entry,cityEntry,nav,menu,calls,context,animations,media,mediaListeners,listeners,add,emit,node:id=>document.getElementById(id),setState(next){state=next;},getState:()=>state};
}

test('initializes one nonmodal region and only the main page becomes inert',()=>{
  const h=harness();h.api.init();h.api.init();assert.equal(h.document.querySelectorAll('#return-trail-view').length,1);assert.equal(h.calls.mounts.length,1);
  assert.equal(h.api.open(h.entry,{from:'camp'}),true);assert.equal(h.main.inert,true);assert.equal(h.sidebar.inert,false);assert.equal(h.node('return-trail-view').getAttribute('role'),'region');assert.equal(h.document.activeElement,h.node('return-trail-close'));
  assert.ok(h.document.documentElement.classList.contains('has-return-trail-view'));assert.equal(h.calls.opened,1);assert.deepEqual(h.calls.campClose,[false]);assert.deepEqual(h.calls.cityClose,[false]);
  assert.equal(h.api.open(h.cityEntry,{from:'city'}),false);assert.equal(h.api.close(),true);assert.equal(h.main.inert,false);assert.equal(h.document.activeElement,h.entry);assert.equal(h.api.close(),false);assert.equal(h.calls.closed,1);assert.deepEqual(h.calls.origins,[]);
});
test('all seven original landmarks can be reached in sequence with zero study time, then enter the city',()=>{
  const h=harness();h.api.open(h.entry,{from:'camp'});const expected=model.build({}).discoveries;
  for(let i=0;i<7;i++){
    assert.equal(h.node('return-trail-place').textContent,expected[i].name);assert.equal(h.node('return-trail-view').dataset.station,expected[i].id);assert.equal(h.calls.scenes.at(-1).index,i);
    assert.equal(h.node('return-trail-narrative').textContent,expected[i].narrative);
    if(i<6)h.emit(h.node('return-trail-next'),'click');
  }
  assert.equal(h.calls.city,0);assert.equal(h.node('return-trail-next').textContent,'走进星辉城 →');h.emit(h.node('return-trail-next'),'click');assert.equal(h.api.isOpen(),false);assert.equal(h.calls.city,1);assert.equal(h.main.inert,false);assert.deepEqual(h.calls.origins,[]);
});
test('city entrance starts at the lighthouse and walks in reverse back to the camp',()=>{
  const h=harness();h.api.open(h.cityEntry,{from:'city'});assert.equal(h.calls.scenes.at(-1).index,6);assert.match(h.node('return-trail-close').textContent,/星辉城/);
  for(let i=6;i>0;i--)h.emit(h.node('return-trail-previous'),'click');assert.equal(h.calls.scenes.at(-1).index,0);h.emit(h.node('return-trail-previous'),'click');assert.equal(h.calls.camp,1);assert.equal(h.api.isOpen(),false);
});
test('route allows revisiting only encountered stops, and remembers the walk in memory',()=>{
  const h=harness();h.api.open();const route=h.node('return-trail-route');assert.equal(route.querySelector('[data-trail-visit="6"]').disabled,true);
  h.emit(route.querySelector('[data-trail-visit="6"]'),'click');assert.equal(h.calls.scenes.at(-1).index,0);
  h.emit(h.node('return-trail-next'),'click');h.emit(h.node('return-trail-next'),'click');h.emit(route.querySelector('[data-trail-visit="0"]'),'click');assert.equal(h.calls.scenes.at(-1).index,0);
  h.emit(route.querySelector('[data-trail-visit="2"]'),'click');assert.equal(h.calls.scenes.at(-1).index,2);h.api.close(false);h.api.open();assert.equal(h.calls.scenes.at(-1).index,0);assert.equal(route.querySelector('[data-trail-visit="2"]').disabled,false);
});
test('close(false) cleans up without navigating to origin, while Escape and close button use origin callbacks',()=>{
  const h=harness();h.api.open(h.cityEntry,{from:'city'});h.api.close(false);assert.deepEqual(h.calls.origins,[]);
  h.api.open(h.cityEntry,{from:'city'});h.emit(h.node('return-trail-close'),'keydown',{key:'Escape'});assert.deepEqual(h.calls.origins,['city']);assert.equal(h.api.isOpen(),false);
  h.api.open(h.entry,{from:'camp'});h.emit(h.node('return-trail-close'),'click');assert.deepEqual(h.calls.origins,['city','camp']);assert.equal(h.calls.closed,3);
});
test('seven gentle interactions are reversible, visible, and never change study state or rewards',()=>{
  const h=harness(),before=JSON.stringify(h.getState());h.api.open();
  for(let i=0;i<7;i++){
    const copy=h.node('return-trail-narrative').textContent;h.emit(h.node('return-trail-interact'),'click');assert.equal(h.calls.scenes.at(-1).options.resting,true);assert.notEqual(h.node('return-trail-narrative').textContent,copy);assert.equal(h.node('return-trail-interact').getAttribute('aria-pressed'),'true');
    h.emit(h.node('return-trail-interact'),'click');assert.equal(h.calls.scenes.at(-1).options.resting,false);assert.equal(h.node('return-trail-narrative').textContent,copy);if(i<6)h.emit(h.node('return-trail-next'),'click');
  }
  assert.equal(JSON.stringify(h.getState()),before);
});
test('SVG controls respond to click and Enter/Space and preserve focus after scene replacement',()=>{
  const h=harness();h.api.open();let target=h.node('return-trail-scene').querySelector('[data-trail-interact]');target.focus();assert.equal(h.emit(target,'keydown',{key:' '}).defaultPrevented,true);assert.equal(h.document.activeElement,h.node('return-trail-scene').querySelector('[data-trail-interact]'));
  target=h.node('return-trail-scene').querySelector('[data-trail-step="1"]');target.focus();h.emit(target,'keydown',{key:'Enter'});assert.equal(h.calls.scenes.at(-1).index,1);assert.equal(h.document.activeElement,h.node('return-trail-scene').querySelector('[data-trail-step="1"]'));
  h.emit(h.node('return-trail-scene').querySelector('[data-trail-step="1"]'),'click');assert.equal(h.calls.scenes.at(-1).index,2);
});
test('unchanged polling keeps scene nodes and animations, stale equipment cannot revert appearance',()=>{
  const h=harness();h.api.open();const scene=h.node('return-trail-scene'),writes=scene.htmlWrites,animationCount=h.animations.length;
  for(let i=0;i<20;i++)h.api.render({...h.getState(),totals:{minutes:i,target:480}});assert.equal(scene.htmlWrites,writes);assert.equal(h.animations.length,animationCount);
  h.api.applyEquipment({avatar:'avatar-new'},'2026-09-28T12:00:00.000300+08:00');assert.equal(h.calls.scenes.at(-1).equipment.avatar,'avatar-new');const changedWrites=scene.htmlWrites;
  h.api.render(h.getState());assert.equal(scene.htmlWrites,changedWrites);assert.equal(h.calls.scenes.at(-1).equipment.avatar,'avatar-new');
});
test('arrow navigation ignores text inputs, sidebar, dialogs, quick skins and repeated held keys',()=>{
  const h=harness();h.api.open();const input=h.add('input','input',h.node('return-trail-view'));
  for(const key of ['ArrowRight','Escape'])assert.equal(h.emit(input,'keydown',{key}).defaultPrevented,false);
  h.emit(h.nav,'keydown',{key:'ArrowRight'});assert.equal(h.calls.scenes.at(-1).index,0);
  h.menu.hidden=false;h.emit(h.node('return-trail-close'),'keydown',{key:'ArrowRight'});h.emit(h.node('return-trail-close'),'keydown',{key:'Escape'});assert.equal(h.api.isOpen(),true);h.menu.hidden=true;
  const dialog=h.add('dialog','dialog');dialog.open=true;h.emit(h.node('return-trail-close'),'keydown',{key:'ArrowRight'});assert.equal(h.calls.scenes.at(-1).index,0);dialog.open=false;
  h.emit(h.node('return-trail-close'),'keydown',{key:'ArrowRight',repeat:true});assert.equal(h.calls.scenes.at(-1).index,0);h.emit(h.node('return-trail-close'),'keydown',{key:'ArrowRight'});assert.equal(h.calls.scenes.at(-1).index,1);
  assert.equal(h.emit(h.nav,'keydown',{key:'Tab'}).defaultPrevented,false);h.nav.focus();assert.equal(h.document.activeElement,h.nav);
});
test('background transitions cancel animations immediately, foreground does not restart a loop',()=>{
  const h=harness();h.api.open();assert.ok(h.animations.length>0);h.emit(h.document.body,'focusquest:visibility',{detail:{visible:false}});assert.ok(h.animations.every(a=>a.cancelled));assert.equal(h.node('return-trail-view').dataset.paused,'true');
  const count=h.animations.length;h.emit(h.document.body,'focusquest:visibility',{detail:{visible:true}});assert.equal(h.animations.length,count);assert.equal(h.node('return-trail-view').dataset.paused,'false');
  h.document.hidden=true;h.emit(h.document.body,'visibilitychange');h.emit(h.node('return-trail-next'),'click');assert.equal(h.animations.length,count);assert.equal(h.calls.scenes.at(-1).index,1);h.api.close(false);assert.equal(h.calls.sounds.at(-1),null);
});
test('rapid steps cancel old transitions and close restores inherited inert state without pending callbacks',async()=>{
  const h=harness();h.main.inert=true;h.api.open();for(let i=0;i<6;i++)h.emit(h.node('return-trail-next'),'click');assert.equal(h.calls.scenes.at(-1).index,6);assert.ok(h.animations.slice(0,-2).every(a=>a.cancelled));
  h.api.close(false);assert.ok(h.animations.every(a=>a.cancelled));assert.equal(h.main.inert,true);await Promise.resolve();assert.equal(h.calls.closed,1);assert.equal(h.calls.city,0);
});
test('no-motion preferences disable finite effects and changing reduced motion cancels current effects',()=>{
  const quiet=harness({motion:false});quiet.api.open();quiet.emit(quiet.node('return-trail-next'),'click');assert.equal(quiet.animations.length,0);assert.equal(quiet.calls.scenes.at(-1).index,1);
  const h=harness();h.api.open();h.media.matches=true;h.mediaListeners.forEach(fn=>fn());assert.ok(h.animations.every(a=>a.cancelled));const count=h.animations.length;h.emit(h.node('return-trail-next'),'click');assert.equal(h.animations.length,count);assert.equal(h.node('return-trail-view').dataset.motion,'false');
});
test('open refuses a modal or missing artwork; hidden close never interrupts another soundscape',()=>{
  const h=harness(),dialog=h.add('dialog','dialog');dialog.open=true;assert.equal(h.api.open(),false);assert.equal(h.main.inert,false);dialog.open=false;const art=h.context.FocusReturnTrailArt;h.context.FocusReturnTrailArt=null;assert.equal(h.api.open(),false);h.context.FocusReturnTrailArt=art;
  h.api.close(false);assert.deepEqual(h.calls.sounds,[]);h.api.open();assert.deepEqual(h.calls.sounds,['camp']);h.api.close(false);h.api.close(false);assert.deepEqual(h.calls.sounds,['camp',null]);
});
