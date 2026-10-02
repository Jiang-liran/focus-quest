'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const art=require('../static/shop-collection-v3-coin.js');
const js=fs.readFileSync(path.join(__dirname,'../static/shop-collection-v3-coin.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../static/shop-collection-v3-coin.css'),'utf8');
const geometry=s=>s.replace(/\b(?:data-[\w-]+|class|style|fill|stroke|opacity|stop-color|id)="[^"]*"/g,'');
test('24 ordinary items span distinct companion, relic and banner collections with accessible price tiers',()=>{
  assert.equal(art.entries.length,24);assert.equal(new Set(art.entries.map(e=>e.id)).size,24);
  for(const [slot,count] of [['companion',10],['relic',10],['banner',4]])assert.equal(art.entries.filter(e=>e.slot===slot).length,count);
  assert.equal(art.entries.filter(e=>e.coins>0).length,16);assert.equal(art.entries.filter(e=>e.diamonds>0).length,8);
  for(const entry of art.entries){assert.equal(entry.lotteryOnly,false);assert.equal(entry.lotteryMachine,null);assert.equal(entry.exclusive,false);assert.equal(Boolean(entry.coins)===Boolean(entry.diamonds),false);assert.ok(Object.isFrozen(entry));assert.ok(Object.isFrozen(entry.tints));assert.ok(entry.description.length>10);if(entry.coins)assert.ok(entry.coins>=40&&entry.coins<=900);if(entry.diamonds)assert.ok(entry.diamonds>=2&&entry.diamonds<=24);}
  assert.ok(art.entries.filter(e=>e.coins&&e.coins<=300).length>=10);
});
test('browser and Node exports are identical, without global state, timers or network work',()=>{
  const context={};vm.runInNewContext(js,context);assert.deepEqual(Object.keys(context.FocusShopCollectionV3Coin).sort(),Object.keys(art).sort());
  assert.doesNotMatch(js,/require\(|setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage|addEventListener|Math\.random/);
  const original=JSON.stringify(art.entries);const copy=art.colors(art.entries[0].id);copy[0]='changed';for(const entry of art.entries)art.preview(entry.id);assert.equal(JSON.stringify(art.entries),original);
});
test('all 24 thumbnails have distinct non-recolored geometry, valid SVG, consistent stage and bounded cost',()=>{
  const svgs=art.entries.map(entry=>art.preview(entry.id));
  assert.equal(new Set(svgs.map(geometry)).size,24);
  for(const svg of svgs){assert.match(svg,/viewBox="0 0 160 112"/);assert.match(svg,/class="shop-art-svg /);assert.doesNotMatch(svg,/NaN|Infinity|undefined|<script|<foreignObject|\bon\w+=|href=|filter=/);assert.ok((svg.match(/<(?:path|rect|circle|ellipse)/g)||[]).length<90);}
  const result=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as E\nfor s in json.load(sys.stdin): E.fromstring(s)'],{input:JSON.stringify(svgs),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
test('real equipped layers use the same shapes as thumbnails and preserve per-creature local motion',()=>{
  for(const entry of art.entries){const method=entry.slot==='banner'?'frame':entry.slot;const actual=art[method](entry.id);assert.ok(art.preview(entry.id).includes(actual));assert.match(actual,/pointer-events="none"/);}
  for(const id of ['companion-dormouse','companion-ferret','companion-fennec','companion-axolotl','companion-pegasus'])assert.match(art.companion(id),/scv3c-tail/);
  for(const id of ['companion-puffin','companion-sealpup','companion-jellyfish','companion-axolotl','companion-pegasus','companion-kingfisher'])assert.match(art.companion(id),/scv3c-(?:fin|tentacles|gills|wing)/);
});
test('unsupported identifiers and cross-slot calls never return fallback geometry',()=>{
  for(const id of [null,undefined,{},[],'constructor','__proto__','" onload="x']){assert.equal(art.has(id),false);assert.equal(art.item(id),null);assert.deepEqual(art.colors(id),[]);for(const method of ['preview','companion','relic','frame','premium'])assert.equal(art[method](id),'');}
  assert.equal(art.companion('relic-acornlamp'),'');assert.equal(art.frame('companion-dormouse'),'');assert.equal(art.relic('banner-gingham'),'');
});
test('decorative motions stop in hidden, paused and reduced-motion views without UI sizing overrides',()=>{
  for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard));
  assert.doesNotMatch(css,/filter\s*:|--ui-|\.sidebar|\.shop-card|\.heatmap-panel|setInterval|setTimeout/);
});
