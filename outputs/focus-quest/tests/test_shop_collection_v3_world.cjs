'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const art=require('../static/shop-collection-v3-world.js');
const source=fs.readFileSync(path.join(__dirname,'../static/shop-collection-v3-world.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../static/shop-collection-v3-world.css'),'utf8');
const fragment=body=>`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const geometry=body=>body.replace(/\b(?:data-[\w-]+|class|style|fill|stroke|opacity|stop-color|id)="[^"]*"/g,'').replace(/url\(#[^)]+\)/g,'local');
test('twenty ordinary items use accessible prices and include all three world slots',()=>{
  assert.equal(art.entries.length,20);assert.equal(art.entries.filter(e=>e.slot==='island').length,8);assert.equal(art.entries.filter(e=>e.slot==='theme').length,6);assert.equal(art.entries.filter(e=>e.slot==='fx').length,6);
  assert.equal(art.entries.filter(e=>e.coins>0).length,12);assert.equal(art.entries.filter(e=>e.diamonds>0).length,8);
  for(const entry of art.entries){assert.equal(entry.lotteryOnly,false);assert.equal(entry.lotteryMachine,null);assert.equal(entry.exclusive,false);assert.ok(entry.description);assert.ok(Object.isFrozen(entry));assert.ok((entry.coins>=40&&entry.coins<=1200)||(entry.diamonds>=2&&entry.diamonds<=32));}
  const context={};vm.runInNewContext(source,context);assert.equal(context.FocusShopCollectionV3World.entries.length,20);
});
test('all thumbnails and home/city variants are valid safe SVG with globally unique defs',()=>{
  const svgs=[];for(const entry of art.entries){svgs.push(art.preview(entry.id));assert.match(art.preview(entry.id),/viewBox="0 0 160 112"/);if(entry.slot==='theme')svgs.push(art.themeBackdrop(entry.id),fragment(art.themeCityScene(entry.id)));if(entry.slot==='fx')for(const mode of ['home','city'])svgs.push(fragment(art.effectScene(entry.id,mode)));}
  const seen=new Set();for(const markup of svgs){assert.doesNotMatch(markup,/undefined|NaN|Infinity|<script|<foreignObject|\bon\w+=|href=|filter=/);assert.ok((markup.match(/<(?:path|circle|rect|ellipse)/g)||[]).length<200);const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);for(const id of ids){assert.ok(!seen.has(id));seen.add(id);}for(const [,id] of markup.matchAll(/url\(#([^)]*)\)/g))assert.ok(ids.includes(id));}
  const xml=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nfor svg in json.load(sys.stdin): ET.fromstring(svg)'],{input:JSON.stringify(svgs),encoding:'utf8'});assert.equal(xml.status,0,xml.stderr);
});
test('buildings, themed scenery and FX have genuinely different geometry within each slot',()=>{
  for(const slot of ['island','theme','fx']){const markup=art.entries.filter(e=>e.slot===slot).map(e=>geometry(art.preview(e.id)));assert.equal(new Set(markup).size,markup.length);}
  for(const entry of art.entries.filter(e=>e.slot==='island')){const scene=art.islandDecoration(entry.id);assert.match(scene,/data-camp-clearance="338 241 42"/);assert.match(scene,/pointer-events="none"/);assert.doesNotMatch(scene,/role="button"|tabindex/);}
});
test('moving FX use local clipping in both views and respect the same 590 to 1200 coordinate mapping',()=>{
  for(const entry of art.entries.filter(e=>e.slot==='fx')){const home=art.effectScene(entry.id,'home'),city=art.effectScene(entry.id,'city');assert.match(home,/data-scene-size="590 350"/);assert.match(city,/data-scene-size="1200 720"/);assert.match(city,/scale\(2.034 2.057\)/);assert.match(home,/clip-path="url\(#/);assert.ok((home.match(/scv3w-drift/g)||[]).length>=7);}
  for(const entry of art.entries.filter(e=>e.slot==='theme')){assert.equal(art.themePalette(entry.id).length,4);assert.match(art.themeCityScene(entry.id),/data-scene-size="1200 720"/);}
});
test('invalid IDs stay inert; particles pause when hidden, in reduced motion or no-motion mode',()=>{
  for(const id of [null,{},'constructor','__proto__','" onload="unsafe']){assert.equal(art.has(id),false);assert.equal(art.preview(id),'');assert.equal(art.item(id),null);assert.equal(art.effectScene(id),'');}
  assert.equal(art.islandDecoration('fx-swallows'),'');assert.equal(art.themePalette('fx-raingems'),null);assert.equal(art.effectScene('island-birdloft'),'');
  assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage|addEventListener/);
  for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard));assert.doesNotMatch(css,/filter\s*:|--ui-|\.sidebar|\.shop-card/);
});
