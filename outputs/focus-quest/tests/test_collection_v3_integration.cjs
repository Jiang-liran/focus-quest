'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const expansion=require('../static/shop-expansion.js');
const router=require('../static/shop-collection-router.js');
const shop=require('../static/shop-art.js');
const city=require('../static/rain-city-art.js');
const bars=require('../static/progress-bars.js');
const quest=require('../static/quest-art.js');
const modules=['lottery-collection-v3-coin','lottery-collection-v3-diamond','shop-collection-v3-player','shop-collection-v3-coin','shop-collection-v3-world'];
const entries=modules.flatMap(name=>require(`../static/${name}.js`).entries);
const html=fs.readFileSync(path.join(__dirname,'../static/index.html'),'utf8');
const staticSource=name=>fs.readFileSync(path.join(__dirname,'../static',name+'.js'),'utf8');
function harness(){
  const nodes=new Map();
  class Node{
    constructor(tag,id=''){this.tagName=tag;this.id=id;this.className='';this.attributes={};this.children=[];this.writes=0;this.raw='';}
    set innerHTML(value){this.raw=value;this.writes++;}get innerHTML(){return this.raw;}
    getAttribute(name){return this.attributes[name]??null;}setAttribute(name,value){this.attributes[name]=String(value);}
    appendChild(node){this.children.push(node);nodes.set(node.id,node);return node;}
    insertBefore(node,before){this.children.splice(before?this.children.indexOf(before):0,0,node);nodes.set(node.id,node);return node;}
    get firstChild(){return this.children[0]||null;}
    querySelector(){return null;}
  }
  const scene=new Node('div','scene'),island=new Node('g','island'),traveler=new Node('g','scene-traveler'),weather=new Node('g','equipped-fx-weather-layer');
  nodes.set(traveler.id,traveler);nodes.set(weather.id,weather);
  const doc={nodeType:9,documentElement:{dataset:{}},getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],createElement:tag=>new Node(tag),createElementNS:(_,tag)=>new Node(tag)};
  doc.querySelector=selector=>selector==='.quest-scene'?scene:selector==='.floating-island'?island:selector==='.scene-theme-backdrop'?[...nodes.values()].find(n=>n.className==='scene-theme-backdrop')||null:selector.startsWith('#')?nodes.get(selector.slice(1))||null:null;
  const context=vm.createContext({document:doc});
  const required=new Set(['currency-art','shop-collection-v2','lottery-collection-art',...modules,'shop-collection-router','shop-expansion','island-effects','quest-art','interface-themes','progress-bars','companion-life','shop-art','rain-city-art']);
  for(const [,filename] of html.matchAll(/<script src="\/([^"/]+)\.js"><\/script>/g))if(required.has(filename))vm.runInContext(staticSource(filename),context,{filename:filename+'.js'});
  return {nodes,context,api:context.ShopArt,doc};
}
test('all seventy-two additions register exactly once in shipped script order and match catalog fixtures',()=>{
  assert.equal(entries.length,72);assert.equal(new Set(entries.map(e=>e.id)).size,72);assert.equal(expansion.entries.length,304);
  assert.equal(expansion.entries.filter(e=>e.lotteryOnly).length,36);
  const ordinary=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/ordinary_catalog.json'),'utf8'));
  const limited=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/limited_catalog.json'),'utf8'));
  for(const entry of entries){const actual=expansion.item(entry.id),expected=[...ordinary,...limited].find(e=>e.id===entry.id);assert.ok(expected,entry.id);assert.ok(actual,entry.id);assert.equal(router.has(entry.id,entry.slot),true);for(const key of ['id','slot','name','coins','diamonds'])assert.equal(actual[key],expected[key],entry.id+':'+key);assert.equal(shop.apply({[entry.slot]:entry.id})[entry.slot],entry.id);}
  for(const name of modules){assert.ok(html.indexOf(`src="/${name}.js"`)<html.indexOf('src="/shop-collection-router.js"'));assert.ok(html.includes(`href="/${name}.css"`));}
  assert.ok(html.indexOf('src="/shop-collection-router.js"')<html.indexOf('src="/shop-expansion.js"'));
  const h=harness();assert.equal(h.context.FocusShopExpansion.entries.length,304);
  for(const entry of entries)assert.equal(h.context.FocusShopCollectionRouter.has(entry.id,entry.slot),true);
});
test('new decorations mount in the actual homepage with their own scene geometry and independent slots',()=>{
  const h=harness();
  const mounted={island:'equipped-island',theme:'scene-theme-backdrop',fx:'equipped-extra-fx',avatar:'equipped-player-regalia',companion:'equipped-companion',relic:'equipped-relic'};
  for(const entry of entries.filter(e=>Object.hasOwn(mounted,e.slot))){
    h.api.apply({[entry.slot]:entry.id});
    assert.equal(h.doc.documentElement.dataset[entry.slot],entry.id);
    const layer=h.nodes.get(mounted[entry.slot]);assert.ok(layer,entry.id);assert.equal(layer.getAttribute('data-item'),entry.id);if(entry.slot==='avatar')assert.match(layer.raw,/data-avatar-stage="4"/);else assert.ok(layer.raw.includes(entry.id),entry.id);assert.ok(layer.raw.length>150,entry.id);assert.doesNotMatch(layer.raw,/NaN|undefined|<foreignObject|<script/);
    const writes=layer.writes,geometry=layer.raw;
    for(let poll=0;poll<8;poll++)h.api.apply({[entry.slot]:entry.id});
    assert.equal(layer.writes,writes,`${entry.id}: routine polls restart SVG`);assert.equal(layer.raw,geometry);
  }
});
test('new home themes and FX compose with purchased islands, companions and relics without resetting each other',()=>{
  const h=harness();
  const equipment={theme:'theme-stellarwhales',fx:'fx-moonjellies',island:'island-aethercitadel',avatar:'avatar-eclipseempress',companion:'companion-ninefox',relic:'relic-worldtree'};
  h.api.apply(equipment);
  const ids=['scene-theme-backdrop','equipped-extra-fx','equipped-island','equipped-player-regalia','equipped-companion','equipped-relic'];
  const layers=ids.map(id=>h.nodes.get(id)),writes=layers.map(n=>n.writes);
  h.api.apply({...equipment,bar:'bar-stardragon'});assert.deepEqual(layers.map(n=>n.writes),writes);
  h.api.apply({...equipment,theme:'theme-crystalcaves'});assert.equal(layers[0].writes,writes[0]+1);assert.deepEqual(layers.slice(1).map(n=>n.writes),writes.slice(1));
  h.api.apply({...equipment,theme:'theme-crystalcaves',fx:'fx-default'});assert.equal(layers[1].raw,'');assert.ok(layers[2].raw.includes('island-aethercitadel'));
});
test('every new city-compatible appearance reaches the real rain-city renderer without losing building targets',()=>{
  for(const entry of entries.filter(e=>['theme','fx','avatar','companion','relic'].includes(e.slot))){
    const eq={[entry.slot]:entry.id},scene=city.scene({},eq);
    assert.equal(city.normalize(eq).eq[entry.slot],entry.id);
    assert.ok(scene.includes(entry.id),entry.id);
    assert.equal((scene.match(/data-city-place=/g)||[]).length,6,entry.id);
    assert.equal((scene.match(/data-city-trail="open"/g)||[]).length,1,entry.id);
    assert.doesNotMatch(scene,/NaN|undefined|<foreignObject|<script/);
    if(entry.slot==='theme'){const layer=expansion.themeCityScene(entry.id);assert.ok(layer.length>100);assert.ok(scene.includes(layer));assert.ok(scene.indexOf(layer)<scene.indexOf('class="rain-city-place'));}
    if(entry.slot==='fx'){assert.equal((scene.match(/class="rain-city-equipped-fx"/g)||[]).length,1);assert.match(scene,/data-scene-size="1200 720"/);}
  }
});
test('new progress bars and outfits reach shared runtime renderers with true zero progress and tier gating',()=>{
  for(const entry of entries.filter(e=>e.slot==='bar')){assert.equal(bars.has(entry.id),true);const full=bars.fullPreview(entry.id);assert.match(full,/data-pb-sample="0"/);assert.match(full,/data-pb-sample="100"/);assert.doesNotMatch(full,/NaN|undefined/);assert.ok(full.includes(entry.id));}
  for(const entry of entries.filter(e=>e.slot==='avatar'))for(let stage=0;stage<5;stage++){const sprite=quest.avatar('player',entry.id,stage);assert.ok(sprite.includes(entry.id));assert.match(sprite,new RegExp(`data-avatar-stage="${stage}"`));}
});
test('every new full outfit hides the original island traveler beneath its mounted regalia',()=>{
  const rules=modules.flatMap(name=>{
    const css=fs.readFileSync(path.join(__dirname,'../static',name+'.css'),'utf8');
    return [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  });
  for(const entry of entries.filter(e=>e.slot==='avatar')){
    assert.equal(expansion.fullOutfit(entry.id),true,entry.id);
    const replacement=rules.find(([,selector,body])=>selector.includes(`[data-avatar="${entry.id}"]`)&&selector.includes('#scene-traveler>:not(#equipped-player-regalia)')&&/visibility\s*:\s*hidden/.test(body));
    assert.ok(replacement,`${entry.id}: the base traveler remains visible beneath the complete outfit`);
  }
});
test('all shipped new animation sheets suspend with hidden runtime, hidden scenes and reduced motion',()=>{
  for(const name of modules){const css=fs.readFileSync(path.join(__dirname,'../static',name+'.css'),'utf8');for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard),`${name}: missing ${guard}`);assert.doesNotMatch(css,/filter\s*:/);}
});
