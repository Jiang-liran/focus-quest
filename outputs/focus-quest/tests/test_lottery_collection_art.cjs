'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const art=require('../static/lottery-collection-art.js');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/limited_catalog.json'),'utf8'));
const wrap=body=>`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const geometry=svg=>svg.replace(/\b(?:data-[\w-]+|class|style|fill|stroke|opacity|stop-color|id)="[^"]*"/g,'').replace(/url\(#[^)]+\)/g,'local-reference');
function refs(svg,seen) {
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const id of ids){assert.match(id,/^[a-zA-Z0-9_-]+$/);if(seen){assert.ok(!seen.has(id),id);seen.add(id);}}
  for(const m of svg.matchAll(/url\(#([^)]*)\)/g))assert.ok(ids.includes(m[1]),`missing ${m[1]}`);
}
test('twelve fixed limited collections expose six distinct slots per pool',()=>{
  assert.equal(art.entries.length,12);assert.equal(manifest.length,12);
  assert.equal(new Set(art.entries.map(e=>e.id)).size,12);
  for(const entry of manifest){const actual=art.item(entry.id);assert.ok(actual,entry.id);for(const key of ['slot','name','lotteryMachine','lotteryOnly','exclusive','coins','diamonds'])assert.equal(actual[key],entry[key]);assert.ok(Object.isFrozen(actual));}
  for(const machine of ['coin','diamond'])assert.deepEqual(art.entries.filter(e=>e.lotteryMachine===machine).map(e=>e.slot).sort(),['avatar','bar','companion','island','relic','theme']);
});
test('browser and CommonJS expose the same independent API without central dependencies',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../static/lottery-collection-art.js'),'utf8'),context={};vm.runInNewContext(source,context);
  assert.equal(context.FocusLotteryCollectionArt.entries.length,12);
  assert.deepEqual(Object.keys(context.FocusLotteryCollectionArt).sort(),Object.keys(art).sort());
  assert.doesNotMatch(source,/require\(|FocusShop|setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage|addEventListener/);
});
test('all thumbnails use one 160×112 stage, valid SVG, bounded geometry and no external assets',()=>{
  const svgs=art.entries.map(e=>art.preview(e.id));
  for(const svg of svgs){assert.match(svg,/^<svg/);assert.match(svg,/class="shop-art-svg /);assert.match(svg,/viewBox="0 0 160 112"/);assert.doesNotMatch(svg,/undefined|NaN|Infinity|<script|<foreignObject|\bon\w+=|href=/);assert.ok((svg.match(/<(?:path|rect|circle|ellipse)/g)||[]).length<250);refs(svg);}
  const xml=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nfor svg in json.load(sys.stdin): ET.fromstring(svg)'],{input:JSON.stringify(svgs),encoding:'utf8'});assert.equal(xml.status,0,xml.stderr);
  for(const slot of ['avatar','bar','companion','island','relic','theme']){const pair=art.entries.filter(e=>e.slot===slot).map(e=>geometry(art.preview(e.id)));assert.notEqual(pair[0],pair[1],`geometry duplicated in ${slot}`);}
});
test('avatar growth has separate structural tiers for stages 0–4 and safely clamps invalid stages',()=>{
  for(const entry of art.entries.filter(e=>e.slot==='avatar')){
    const stages=[0,1,2,3,4].map(n=>art.avatar(entry.id,n));assert.equal(new Set(stages.map(geometry)).size,5);
    for(let n=0;n<5;n++){assert.match(stages[n],/viewBox="0 0 64 72"/);assert.match(stages[n],new RegExp(`data-avatar-stage="${n}"`));for(let tier=1;tier<=4;tier++)assert.match(stages[n],new RegExp(`class="quest-avatar-tier quest-avatar-tier-${tier}" data-avatar-tier="${tier}" display="${n>=tier?'inline':'none'}"`));}
    assert.match(art.avatar(entry.id,-5),/data-avatar-stage="0"/);assert.match(art.avatar(entry.id,99),/data-avatar-stage="4"/);assert.match(art.avatar(entry.id,Infinity),/data-avatar-stage="0"/);
    for(let n=0;n<3;n++)assert.match(art.travelerHat(entry.id,n),/^M/);
  }
});
test('actual bars share the same ribbon and figure geometry as thumbnails and never add layout dimensions',()=>{
  const seen=new Set();
  for(const entry of art.entries.filter(e=>e.slot==='bar')){
    assert.equal(art.barDesign(entry.id).name,entry.name);assert.equal(art.barDesign(entry.id).colors.length,2);
    const figure=art.barFigure(entry.id),thumbnail=art.preview(entry.id);assert.ok(thumbnail.includes(figure));
    for(let i=0;i<3;i++){const ribbon=art.barRibbon(entry.id,'same-local-prefix');refs(ribbon,seen);assert.match(ribbon,/<clipPath[^>]*><rect[^>]*width="600"[^>]*height="24"/);assert.doesNotMatch(ribbon,/<svg|filter=|foreignObject/);assert.match(ribbon,/clip-path="url\(#/);}
    refs(art.barRibbon(entry.id,'\" onload=\"alert(1)'));
  }
});
test('island decorations preserve the roadside camp and expose no interactive surfaces',()=>{
  for(const entry of art.entries.filter(e=>e.slot==='island')){const island=art.islandDecoration(entry.id);assert.match(island,/data-camp-clearance="338 241 42"/);assert.match(island,/pointer-events="none"/);assert.doesNotMatch(island,/role="button"|tabindex|<rect[^>]*width="590"/);assert.notEqual(geometry(island),geometry(art.islandDecoration(art.entries.find(e=>e.slot==='island'&&e.id!==entry.id).id)));}
});
test('world themes have full scenery and separate quiet city edge groups without UI overrides',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../static/lottery-collection-art.css'),'utf8');
  for(const entry of art.entries.filter(e=>e.slot==='theme')){assert.equal(art.themePalette(entry.id).length,4);assert.deepEqual(art.palette(entry.id),art.themePalette(entry.id));const back=art.themeBackdrop(entry.id),city=art.themeCityScene(entry.id);assert.match(back,/viewBox="0 0 590 350"/);assert.match(back,/shop-scene-backdrop-art/);assert.match(city,/data-scene-size="1200 720"/);assert.match(city,/pointer-events="none"/);refs(back);}
  assert.doesNotMatch(css,/--ui-|\.sidebar|\.shop-card|\.heatmap-panel/);
});
test('cross-slot and malformed identifiers render nothing, and motion suspends in all supported states',()=>{
  for(const id of [null,undefined,{},[],"__proto__",'constructor','bar-<script>','\" onload=\"alert(1)']){assert.equal(art.has(id),false);assert.equal(art.preview(id),'');assert.equal(art.premium(id),'');assert.equal(art.themeBackdrop(id),'');assert.equal(art.item(id),null);}
  assert.equal(art.companion('relic-cloudorrery'),'');assert.equal(art.avatar('bar-tidewhale'),'');assert.equal(art.islandDecoration('theme-astralrift'),'');assert.equal(art.themePalette('bar-eventhorizon'),null);
  const css=fs.readFileSync(path.join(__dirname,'../static/lottery-collection-art.css'),'utf8');for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard));assert.doesNotMatch(css,/filter\s*:|width\s*:.*animation|height\s*:.*animation/);
});
