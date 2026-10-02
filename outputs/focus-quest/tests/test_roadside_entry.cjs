const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(require.resolve(`../static/${name}`), 'utf8');

function segment(source, start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing production entry segment: ${start}`);
  return source.slice(from, to);
}
const app = read('app.js');
const entrySource = segment(app, 'function enterRoadsideCamp(', "$('campfire-shop-open').addEventListener");
const stopSource = segment(app, 'function stopScenePreview()', '\nfunction renderAdvice()');

function snapshot(minutes = 120) {
  return {date:'2026-09-25',today:'2026-09-25',settings:{motion:true},totals:{minutes,target:480},dayRecordCount:1,
    subjects:[['math',180,minutes],['cs',180,0],['politics',60,0],['english',60,0]].map(([id,target,minutes])=>({id,target,minutes})),
    records:[{id:'focus-1',name:'数学听课',subject:'math',minutes,day:'2026-09-25',end:'2026-09-25T10:00:00+08:00'}]};
}

function harness() {
  const nodes = new Map(), listeners = new Map(), timers = new Map(), callbacks = new Map();
  const calls = {order:[], openings:[], renders:[], closed:0, ancestorClicks:0};
  let serial = 0;
  const document = {activeElement:null};
  class Element {
    constructor(id, tag = 'div') {
      this.id=id;this.tagName=tag.toUpperCase();this.children=[];this.parentElement=null;
      this.dataset={};this.attributes={};this.listeners=new Map();this.hidden=false;this.inert=false;this.disabled=false;
      this.classes=new Set();this.style={setProperty(name,value){this[name]=value;}};this._html='';this.textContent='';
      this.classList={add:(...names)=>names.forEach(x=>this.classes.add(x)),remove:(...names)=>names.forEach(x=>this.classes.delete(x)),
        contains:name=>this.classes.has(name),toggle:(name,on)=>{if(on??!this.classes.has(name))this.classes.add(name);else this.classes.delete(name);}};
    }
    get isConnected(){return this===document.body||Boolean(this.parentElement?.isConnected);}
    append(...children){children.forEach(child=>{child.parentElement=this;this.children.push(child);});}
    contains(node){return this===node||this.children.some(child=>child.contains(node));}
    set innerHTML(value){this._html=String(value);this.children.forEach(child=>child.parentElement=null);this.children=[];}
    get innerHTML(){return this._html;}
    matches(selector){
      if(selector==='dialog[open]')return this.tagName==='DIALOG'&&this.open;
      if(selector.startsWith('#'))return this.id===selector.slice(1);
      if(selector.startsWith('.'))return this.classes.has(selector.slice(1));
      const attr=selector.match(/^\[([^=\]]+)\]$/);return attr?this.hasAttribute(attr[1]):this.tagName.toLowerCase()===selector;
    }
    closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    setAttribute(name,value){this.attributes[name]=String(value);}
    getAttribute(name){return this.attributes[name]??null;}
    hasAttribute(name){return Object.hasOwn(this.attributes,name);}
    addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
    getClientRects(){for(let node=this;node;node=node.parentElement)if(node.hidden)return [];return this.isConnected?[{}]:[];}
    focus(){if(!this.getClientRects().length||this.disabled)return;for(let node=this;node;node=node.parentElement)if(node.inert)return;document.activeElement=this;}
    scrollIntoView(){}
  }
  const create=(id,tag='div')=>{const node=new Element(id,tag);nodes.set(id,node);return node;};
  document.body=create('body','body');document.documentElement=create('html','html');document.documentElement.classList.add('no-motion');
  const main=create('main','main'),sidebar=create('sidebar','aside');document.body.append(main,sidebar);
  const scene=create('quest-scene');scene.classes.add('quest-scene');const svg=create('island-art','svg');
  const entry=create('campfire-room-open','g'),art=create('campfire-entrance-art','g'),flame=create('flame','path');
  main.append(scene);scene.append(svg);svg.append(entry);entry.append(art);art.append(flame);
  entry.setAttribute('tabindex','0');entry.setAttribute('role','button');
  const room=create('campfire-room','section'),close=create('campfire-room-close','button');document.body.append(room);room.append(close);room.hidden=true;
  const menu=create('quick-skins');menu.hidden=true;document.body.append(menu);
  const other=create('previously-focused','button');main.append(other);other.focus();
  const element=id=>{if(!nodes.has(id)){const node=create(id);main.append(node);}return nodes.get(id);};
  document.getElementById=element;
  document.querySelectorAll=selector=>selector==='body > main'?[main]:document.body.querySelectorAll(selector);
  document.querySelector=selector=>document.querySelectorAll(selector)[0]||null;
  document.addEventListener=(type,fn,capture=false)=>{const list=listeners.get(type)||[];list.push({fn,capture});listeners.set(type,list);};
  const emit=(target,type,patch={})=>{
    const event={target,currentTarget:null,button:type==='click'?0:undefined,key:'',ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,
      repeat:false,defaultPrevented:false,stopped:false,immediate:false,
      preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;this.immediate=true;},...patch};
    for(const {fn,capture} of listeners.get(type)||[])if(capture&&!event.immediate)fn(event);
    if(!event.stopped)for(let node=target;node;node=node.parentElement){
      event.currentTarget=node;for(const fn of node.listeners.get(type)||[])if(!event.immediate)fn(event);
      if(event.stopped)break;
    }
    if(!event.stopped)for(const {fn,capture} of listeners.get(type)||[])if(!capture&&!event.immediate)fn(event);
    return event;
  };
  const context=vm.createContext({document,$:element,state:snapshot(),scenePreviewPercent:null,testCalls:calls,
    matchMedia:()=>({matches:false,addEventListener(){}}),
    setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,delay});callbacks.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    FocusExpeditionArt:{world:()=>'<svg aria-hidden="true"></svg>'},
    FocusQuickSkins:{close(){menu.hidden=true;}},FocusCitadel:{close(){}},
    renderScene(percent){calls.renders.push(percent);},
    fetch(){throw new Error('Entering camp must not make a request');},
    localStorage:{getItem(){throw new Error('Entering camp must not read reward storage');},setItem(){throw new Error('Entering camp must not write preferences or rewards');}},
  });
  for(const file of ['expedition-model.js','expedition.js','campfire-room.js'])vm.runInContext(read(file),context);
  vm.runInContext(stopSource+entrySource,context);
  const expedition=context.FocusExpedition,camp=context.FocusCampfireRoom;
  expedition.init({renderHero(){calls.renders.push(expedition.visualModel()?.percent??context.state.totals.minutes/context.state.totals.target*100);},
    stopPreview:()=>context.stopScenePreview(),isHome:()=>true});
  camp.init({afterClose(){calls.closed++;}});
  const originalLeave=expedition.leave,originalOpen=camp.open,originalStop=context.stopScenePreview;
  expedition.leave=()=>{calls.order.push('leave');originalLeave();};
  camp.open=anchor=>{calls.order.push('open');calls.openings.push(anchor);return originalOpen(anchor);};
  context.stopScenePreview=()=>{calls.order.push('stop-preview');originalStop();};
  scene.addEventListener('click',()=>calls.ancestorClicks++);
  expedition.render(context.state);
  return {context,calls,document,main,sidebar,scene,entry,art,flame,room,close,other,element,emit,expedition,camp,timers,
    render(next){context.state=next;expedition.render(next);},stale(id){assert.ok(callbacks.has(id));callbacks.get(id)();}};
}

test('the real app entry click stops bubbling, leaves preview/replay first and returns focus to the stable SVG control',()=>{
  const h=harness();assert.equal(h.document.activeElement,h.other);
  const event=h.emit(h.flame,'click');
  assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);assert.equal(h.calls.ancestorClicks,0);
  assert.deepEqual(h.calls.order,['stop-preview','leave','open']);assert.deepEqual(h.calls.openings,[h.entry]);
  assert.equal(h.camp.isOpen(),true);assert.equal(h.main.inert,true);assert.equal(h.sidebar.inert,false);
  h.camp.close();assert.equal(h.document.activeElement,h.entry);assert.equal(h.main.inert,false);
});

test('Enter and Space each activate once, suppress scrolling, and ignore key repeat and keyup',()=>{
  for(const key of ['Enter',' ']){
    const h=harness();h.entry.focus();const event=h.emit(h.entry,'keydown',{key});
    assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);assert.equal(h.calls.openings.length,1);
    const repeat=h.emit(h.entry,'keydown',{key,repeat:true});assert.equal(repeat.defaultPrevented,true,'holding Space cannot scroll the page');
    h.emit(h.entry,'keyup',{key});assert.equal(h.calls.openings.length,1);
    h.camp.close();assert.equal(h.document.activeElement,h.entry);
  }
});

test('right/middle/modified clicks and context-menu keyboard commands never activate the roadside camp',()=>{
  const h=harness();
  for(const patch of [{button:2},{button:1},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true}])h.emit(h.flame,'click',patch);
  h.emit(h.flame,'contextmenu',{button:2});
  for(const patch of [{key:'ContextMenu'},{key:'F10',shiftKey:true},{key:'Enter',ctrlKey:true},{key:' ',altKey:true},{key:'ArrowDown'}])h.emit(h.entry,'keydown',patch);
  assert.equal(h.camp.isOpen(),false);assert.equal(h.calls.openings.length,0);assert.deepEqual(h.calls.order,[]);assert.equal(h.main.inert,false);
});

test('an event already handled by another control cannot activate the roadside entry',()=>{
  const h=harness();
  for(const [type,patch] of [['click',{}],['keydown',{key:'Enter'}],['keydown',{key:' '}]])h.emit(h.entry,type,{...patch,defaultPrevented:true});
  assert.equal(h.camp.isOpen(),false);assert.equal(h.calls.openings.length,0);assert.deepEqual(h.calls.order,[]);
});

test('entering from a running replay cancels its timer and immersive mode, and stale callbacks cannot replace latest live progress',()=>{
  const h=harness();h.emit(h.element('expedition-immerse'),'click');h.expedition.startReplay();
  assert.ok(h.timers.size>0);const timer=[...h.timers.keys()][0];
  assert.equal(h.element('quest-hero').dataset.expeditionMode,'replay');
  h.render(snapshot(180));assert.equal(h.expedition.visualModel().minutes,0,'poll preserves the active replay until entry');
  h.calls.order=[];h.emit(h.entry,'click');
  assert.deepEqual(h.calls.order,['stop-preview','leave','open']);assert.equal(h.timers.size,0);
  assert.equal(h.element('quest-hero').dataset.expeditionMode,'live');assert.equal(h.expedition.visualModel(),null);
  assert.equal(h.document.documentElement.classList.contains('has-expedition-immersive'),false);assert.equal(h.calls.renders.at(-1),37.5);
  h.stale(timer);assert.equal(h.calls.renders.at(-1),37.5);assert.equal(h.timers.size,0);
  h.camp.close();assert.equal(h.calls.renders.at(-1),37.5);assert.equal(h.document.activeElement,h.entry);
});

test('entering from growth preview removes the preview controls and restores actual progress before opening camp',()=>{
  const h=harness();h.context.scenePreviewPercent=75;h.element('effects-preview').hidden=false;h.expedition.preview(75);
  assert.equal(h.expedition.visualModel().percent,75);h.emit(h.entry,'keydown',{key:'Enter'});
  assert.equal(h.context.scenePreviewPercent,null);assert.equal(h.element('effects-preview').hidden,true);
  assert.equal(h.element('preview-effects').getAttribute('aria-expanded'),'false');assert.equal(h.expedition.visualModel(),null);
  assert.equal(h.calls.renders.at(-1),25);assert.equal(h.camp.isOpen(),true);assert.equal(h.timers.size,0);
});

test('real camp rendering and temporary fire previews replace only inner art, preserving entry focus and listeners',()=>{
  const h=harness();
  h.context.FocusCampfireArt={avatar:()=>'<svg aria-hidden="true"></svg>'};
  h.context.FocusCampfireDialogue={characters:[{id:'hearth',name:'阿榆',title:'炉边伙伴',description:'热茶还温着',accent:'#cdb98a'}],
    buildLines:()=>[{id:'hearth-line',title:'歇一会儿',text:'火还温着。'}],pickLine:lines=>lines[0]};
  h.context.FocusCampfireShopArt={normalize:equipped=>({...equipped})};
  h.context.FocusCampWorldArt={scene:()=>'<svg aria-hidden="true"></svg>',setSelection(){},
    roadside:equipped=>`<g data-fire="${equipped.fire}"></g>`,entrance(){throw new Error('The homepage uses roadside art');}};
  vm.runInContext(read('campfire.js'),h.context);const campfire=h.context.FocusCampfire;
  const state={...snapshot(),quests:{equipped:{fire:'fire-default'},now:'2026-09-25T10:00:00.000100+08:00'}};
  h.entry.focus();campfire.render(state);assert.match(h.art.innerHTML,/fire-default/);
  campfire.previewEquipment({fire:'fire-one'});assert.match(h.art.innerHTML,/fire-one/);
  campfire.render({...state,quests:{...state.quests,now:'2026-09-25T10:00:01.000100+08:00'}});
  assert.match(h.art.innerHTML,/fire-one/,'poll cannot cancel the temporary fire preview');
  campfire.previewEquipment(null);assert.match(h.art.innerHTML,/fire-default/);
  assert.equal(h.document.getElementById('campfire-room-open'),h.entry);assert.equal(h.document.activeElement,h.entry);
  assert.equal(h.entry.listeners.get('click').length,1);assert.equal(h.entry.listeners.get('keydown').length,1);
  h.emit(h.entry,'click');assert.equal(h.camp.isOpen(),true);assert.equal(h.calls.openings.length,1);
  assert.equal(h.calls.ancestorClicks,0,'the preserved listener still isolates the city click');
});

test('HTML has one accessible SVG camp entry outside mutable equipment mounts, and exactly two bottom shortcuts',()=>{
  const html=read('index.html'),stack=[],entries=[],voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  let shortcuts=null;
  // A structural token walk keeps ancestor assertions meaningful without a CSS
  // snapshot; actual hit testing and viewport geometry remain browser QA.
  for(const match of html.matchAll(/<\/?([a-zA-Z][\w:-]*)\b([^>]*)>/g)){
    const tag=match[1].toLowerCase();if(match[0].startsWith('</')){const at=stack.map(x=>x.tag).lastIndexOf(tag);if(at>=0)stack.length=at;continue;}
    const attrs=Object.fromEntries([...match[2].matchAll(/([\w:-]+)(?:="([^"]*)"|'([^']*)'|=([^\s>]+))?/g)].map(x=>[x[1],x[2]??x[3]??x[4]??'']));
    const node={tag,attrs,ancestors:[...stack],children:[]};stack.at(-1)?.children.push(node);
    if(attrs.id==='campfire-room-open')entries.push(node);
    if(tag==='nav'&&String(attrs.class).split(/\s+/).includes('home-shortcuts'))shortcuts=node;
    if(!voids.has(tag)&&!match[0].endsWith('/>'))stack.push(node);
  }
  assert.equal(entries.length,1);const entry=entries[0];assert.equal(entry.tag,'g');assert.equal(entry.attrs.role,'button');
  assert.equal(entry.attrs.tabindex,'0');assert.equal(entry.attrs['aria-controls'],'campfire-room');assert.match(entry.attrs['aria-label'],/篝火营地/);
  assert.equal(entry.attrs['data-skin-slots'],'fire');assert.ok(entry.ancestors.some(node=>node.tag==='svg'));
  assert.ok(entry.ancestors.some(node=>String(node.attrs.class).split(/\s+/).includes('quest-scene')));
  assert.ok(entry.ancestors.every(node=>node.attrs['aria-hidden']!=='true'),'a child cannot override an aria-hidden ancestor');
  assert.ok(entry.ancestors.every(node=>!String(node.attrs.id).startsWith('equipped-')),'equipment repaint must not remove the entry');
  assert.ok(entry.children.some(node=>node.attrs.id==='campfire-entrance-art'),'only the inner artwork is replaceable');
  assert.ok(shortcuts);assert.deepEqual(shortcuts.children.filter(node=>node.tag==='button').map(node=>node.attrs['data-view']),['review','quests']);
});
