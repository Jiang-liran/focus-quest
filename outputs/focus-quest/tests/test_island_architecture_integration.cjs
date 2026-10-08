const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const architecture=require('../static/island-architecture.js');
const shop=require('../static/shop-art.js');

// Exercise the real equipment, quick-swap and expedition controllers together.
// DOM/HTTP are the boundary: an equip response may precede the next full poll.
function harness(){
  const nodes=new Map(),requests=[];
  let response;
  const document={activeElement:null,hidden:false,addEventListener(){}};
  class Element{
    constructor(id='',tag='div'){
      this.id=id;this.tag=tag;this.dataset={};this.attributes={};this.children=[];
      this.listeners={};this.style={};this.hidden=false;this.writes=0;this.raw='';
      const classes=new Set();
      this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){on?classes.add(x):classes.delete(x);}};
    }
    get innerHTML(){return this.raw.replace(/\/>/g,'></normalized-svg>');}
    set innerHTML(value){
      this.raw=String(value);this.writes++;this.children=[];
      for(const match of this.raw.matchAll(/<(button|g)\b([^>]*)>/g)){
        if(!/data-(?:quick|expedition)-/.test(match[2]))continue;
        const child=new Element('',match[1]);child.parent=this;
        for(const a of match[2].matchAll(/([\w-]+)="([^"]*)"/g))child.setAttribute(a[1],a[2]);
        this.children.push(child);
      }
    }
    setAttribute(key,value){this.attributes[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
    getAttribute(key){return this.attributes[key]??null;}
    hasAttribute(key){return this.getAttribute(key)!==null;}
    addEventListener(type,fn){this.listeners[type]=fn;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    matches(selector){const match=selector.match(/^\[([\w-]+)(?:="([^"]+)")?\]$/);return Boolean(match&&this.hasAttribute(match[1])&&(match[2]===undefined||this.getAttribute(match[1])===match[2]));}
    querySelectorAll(selector){return this.children.filter(child=>child.matches(selector));}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
    focus(){document.activeElement=this;}
    getBoundingClientRect(){return {left:0,top:0,right:100,bottom:40,width:360,height:300};}
    appendChild(node){this.children.push(node);nodes.set(node.id,node);return node;}
    insertBefore(node,before){this.children.splice(before?this.children.indexOf(before):0,0,node);nodes.set(node.id,node);return node;}
    get firstChild(){return this.children[0]||null;}
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
  document.getElementById=get;document.documentElement=get('html');
  document.querySelector=selector=>selector==='.floating-island'?get('island'):selector==='.quest-scene'?get('scene'):selector==='.scene-theme-backdrop'?get('backdrop'):null;
  document.createElement=tag=>new Element('',tag);document.createElementNS=(_,tag)=>new Element('',tag);
  get('quick-skins').hidden=true;
  const context=vm.createContext({document,innerWidth:1600,innerHeight:1000,addEventListener(){},
    matchMedia:()=>({matches:false,addEventListener(){}}),setTimeout(){throw new Error('idle equipment integration must not schedule timers');},clearTimeout(){},
    FocusShopExpansion:require('../static/shop-expansion.js'),FocusProgressBars:{decorate(){}},
    FocusExpeditionArt:require('../static/expedition-art.js')});
  for(const name of ['quest-art','subject-island-styles','island-architecture','shop-art','record-time','expedition-model','expedition','quick-skins']){
    vm.runInContext(fs.readFileSync(require.resolve(`../static/${name}.js`),'utf8'),context);
  }
  context.FocusExpedition.init({renderHero(){},stopPreview(){},isHome:()=>true});
  context.FocusQuickSkins.init({async api(url,body){requests.push({url,body});return response;},async refresh(){},toast(){}});
  return {context,get,nodes,requests,setResponse(value){response=value;}};
}

test('island equipment swaps immediately before a full poll, preserves other collections, restores defaults and never rebuilds stable scenes',async()=>{
  const h=harness(),q=h.context.FocusQuickSkins,e=h.context.FocusExpedition;
  const equipped={archipelago:'archipelago-default',homeland:'homeland-default',island:'island-pavilion',companion:'companion-owl',relic:'relic-lotus',portal:'portal-moon',theme:'theme-ocean'};
  const catalog=['archipelago','homeland'].flatMap(slot=>['default','harbor','starglass'].map((kind,index)=>({id:`${slot}-${kind}`,slot,name:`${slot} ${kind}`,owned:true,coins:index?100:0,diamonds:0})));
  const quests={now:'2026-10-03T10:00:00.000001+08:00',equipped,catalog};
  const snapshot={date:'2026-10-03',today:'2026-10-03',settings:{motion:true},records:[],dayRecordCount:0,totals:{minutes:0,target:480},subjects:['math','cs','politics','english'].map((id,index)=>({id,target:index<2?180:60,minutes:0})),quests};
  e.render(snapshot);q.render(quests);
  const originalWorld=h.get('expedition-world').raw;
  assert.equal(h.get('equipped-homeland').raw,'');
  const fixedIds=['equipped-island','equipped-companion','equipped-relic','equipped-portal','backdrop'];
  const original=Object.fromEntries(fixedIds.map(id=>[id,{raw:h.get(id).raw,writes:h.get(id).writes}]));
  let current=quests,revision=1;
  async function equip(slot,id){
    q.open(slot);const button=h.get('quick-skin-items').querySelector(`[data-quick-item="${id}"]`);
    assert.ok(button,`${id} is available through quick-swap, including free defaults`);
    current={...current,now:`2026-10-03T10:00:00.${String(++revision).padStart(6,'0')}+08:00`,equipped:{...current.equipped,[slot]:id}};
    h.setResponse(current);await button.listeners.click();
    assert.equal(h.requests.at(-1).url,'/api/shop/equip');
    assert.equal(h.requests.at(-1).body.itemId,id);
    assert.equal(h.get('quick-skins').hidden,true);
  }
  for(const kind of ['harbor','starglass']){
    await equip('archipelago',`archipelago-${kind}`);
    assert.equal((h.get('expedition-world').raw.match(/data-campus-subject=/g)||[]).length,4);
    assert.match(h.get('expedition-world').raw,new RegExp(`data-island-architecture="archipelago-${kind}"`));
    await equip('homeland',`homeland-${kind}`);
    const mount=h.get('equipped-homeland'),main=architecture.main(`homeland-${kind}`,current.equipped);
    assert.equal(mount.raw,main);
    assert.ok(shop.islandPreview(equipped.island,current.equipped).includes(main),'full preview must contain the exact live building geometry');
    const writes=new Map([...h.nodes].map(([id,node])=>[id,node.writes]));
    for(let poll=0;poll<20;poll++){e.render({...snapshot,quests:current});q.render({...current});}
    for(const [id,n] of writes)assert.equal(h.get(id).writes,n,`${id} must keep its animation and DOM across stable polling`);
    for(const id of fixedIds){assert.equal(h.get(id).raw,original[id].raw,`${id} stays equipped`);assert.equal(h.get(id).writes,original[id].writes);}
  }
  // Large collectors' buildings get a clear courtyard in both representations.
  current={...current,equipped:{...current.equipped,island:'island-starhaven'}};
  q.render(current);
  assert.match(h.get('equipped-homeland').raw,/data-campus-layout="collection-courtyard"/);
  assert.ok(shop.islandPreview(current.equipped.island,current.equipped).includes(h.get('equipped-homeland').raw));
  await equip('archipelago','archipelago-default');
  assert.equal(h.get('expedition-world').raw,originalWorld,'default restores the untouched original four-island scene immediately');
  await equip('homeland','homeland-default');
  assert.equal(h.get('equipped-homeland').raw,'');
  assert.equal(h.get('html').dataset.homeland,'homeland-default');
  assert.equal(h.get('equipped-island').raw,shop.islandDecoration('island-starhaven'));
  assert.equal(h.requests.length,6,'only explicit equip clicks perform requests; polls and previews never purchase');
  assert.equal(equipped.archipelago,'archipelago-default','the input snapshot was not mutated');
});

test('independent quick-swap response and hover previews preserve other islands before the full snapshot catches up',async()=>{
  const h=harness(),q=h.context.FocusQuickSkins,e=h.context.FocusExpedition;
  const equipped={archipelago:'archipelago-harbor',homeland:'homeland-default',campusmath:'campusmath-default',campuscs:'campuscs-default',campuspolitics:'campuspolitics-default',campusenglish:'campusenglish-default'};
  const catalog=Object.entries(architecture.inventory).flatMap(([slot,items])=>items.map(item=>({...item,slot,owned:true,coins:item.id.endsWith('-default')||item.id.endsWith('-original')?0:100,diamonds:0})));
  let current={now:'2026-10-03T10:00:00.000001+08:00',equipped,catalog},revision=1;
  const snapshot={date:'2026-10-03',today:'2026-10-03',settings:{motion:true},records:[],dayRecordCount:0,totals:{minutes:0,target:480},subjects:['math','cs','politics','english'].map((id,i)=>({id,target:i<2?180:60,minutes:0})),quests:current};
  e.render(snapshot);q.render(current);
  async function equip(slot,id){
    q.open(slot);const button=h.get('quick-skin-items').querySelector(`[data-quick-item="${id}"]`);assert.ok(button);
    current={...current,now:`2026-10-03T10:00:00.${String(++revision).padStart(6,'0')}+08:00`,equipped:{...current.equipped,[slot]:id}};
    h.setResponse(current);await button.listeners.click();
  }
  await equip('campusmath','campusmath-spiral');await equip('campuscs','campuscs-neon');
  await equip('campuspolitics','campuspolitics-original');await equip('campusenglish','campusenglish-greenhouse');
  let world=h.get('expedition-world').raw;
  for(const id of ['campusmath-spiral','campuscs-neon','campusenglish-greenhouse'])assert.ok(world.includes(`data-island-architecture="${id}"`));
  assert.equal((world.match(/data-campus-subject=/g)||[]).length,3,'politics alone uses original architecture');
  assert.ok(world.includes('议事书庭'));
  q.open('campusmath');const hover=h.get('quick-skin-items').querySelector('[data-quick-item="campusmath-garden"]');
  hover.listeners.mouseenter();assert.ok(h.get('expedition-world').raw.includes('campusmath-garden'));
  assert.ok(h.get('expedition-world').raw.includes('campuscs-neon'));hover.listeners.mouseleave();
  assert.equal(h.get('expedition-world').raw,world);q.close();
  const writes=h.get('expedition-world').writes;
  for(let poll=0;poll<20;poll++){e.render({...snapshot,quests:current});q.render({...current});}
  assert.equal(h.get('expedition-world').writes,writes);
  await equip('campusmath','campusmath-default');world=h.get('expedition-world').raw;
  assert.ok(world.includes('航图观测院'));assert.ok(world.includes('campuscs-neon'));assert.equal((world.match(/data-island-architecture="archipelago-harbor"/g)||[]).length,1);
  assert.equal(h.requests.length,5,'hover, reset and stable polling never purchase or equip');
  assert.equal(equipped.campusmath,'campusmath-default','original snapshot stays untouched');
});
