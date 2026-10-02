'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const art=require('../static/shop-collection-v3-player.js');
const geometry=svg=>svg.replace(/\b(?:data-[\w-]+|class|style|fill|stroke|opacity|stop-color|id)="[^"]*"/g,'').replace(/url\(#[^)]+\)/g,'local-reference');
function refs(svg,seen){const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);for(const id of ids){assert.match(id,/^[a-zA-Z0-9_-]+$/);if(seen){assert.ok(!seen.has(id),id);seen.add(id);}}for(const m of svg.matchAll(/url\(#([^)]*)\)/g))assert.ok(ids.includes(m[1]),`missing ${m[1]}`);}
test('sixteen ordinary products offer eight rails and eight outfits with affordable prices',()=>{
  assert.equal(art.entries.length,16);assert.equal(new Set(art.entries.map(e=>e.id)).size,16);
  assert.equal(art.entries.filter(e=>e.slot==='bar').length,8);assert.equal(art.entries.filter(e=>e.slot==='avatar').length,8);
  assert.equal(art.entries.filter(e=>e.coins>0).length,12);assert.equal(art.entries.filter(e=>e.diamonds>0).length,4);
  for(const e of art.entries){assert.equal(e.lotteryOnly,false);assert.equal(e.lotteryMachine,null);assert.equal(e.exclusive,false);assert.ok(e.description.length>12);assert.ok(Object.isFrozen(e));assert.equal(art.item(e.id),e);}
  assert.equal(art.item('bar-koi'),null,'old ordinary koi remains in the original catalog');
});
test('all artwork is XML-valid on a shared thumbnail stage and structurally distinct',()=>{
  const all=[];
  for(const e of art.entries){const svg=art.preview(e.id);all.push(svg);assert.match(svg,/viewBox="0 0 160 112"/);assert.doesNotMatch(svg,/undefined|NaN|Infinity|<script|foreignObject|\bon\w+=|href=/);assert.ok((svg.match(/<(?:path|rect|circle|ellipse)/g)||[]).length<210);refs(svg);}
  for(const slot of ['bar','avatar']){const previews=art.entries.filter(e=>e.slot===slot).map(e=>geometry(art.preview(e.id)));assert.equal(new Set(previews).size,8);}
  const xml=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nfor svg in json.load(sys.stdin): ET.fromstring(svg)'],{input:JSON.stringify(all),encoding:'utf8'});assert.equal(xml.status,0,xml.stderr);
});
test('each rail uses its actual animated figure and clips its pattern without changing layout dimensions',()=>{
  const seen=new Set();
  for(const e of art.entries.filter(e=>e.slot==='bar')){const fig=art.barFigure(e.id);assert.ok(art.preview(e.id).includes(fig));assert.equal(art.barDesign(e.id).name,e.name);assert.equal(art.barDesign(e.id).colors.length,2);
    for(let n=0;n<3;n++){const ribbon=art.barRibbon(e.id,'same-prefix');refs(ribbon,seen);assert.match(ribbon,/<clipPath[^>]*><rect width="600" height="24"/);assert.doesNotMatch(ribbon,/<svg|filter=|foreignObject/);}
    refs(art.barRibbon(e.id,'\" onload=\"alert(1)'));}
});
test('all outfits visibly grow through five stages and retain bounded avatar dimensions',()=>{
  for(const e of art.entries.filter(e=>e.slot==='avatar')){const stages=[0,1,2,3,4].map(s=>art.avatar(e.id,s));assert.equal(new Set(stages.map(geometry)).size,5);
    for(let n=0;n<5;n++){assert.match(stages[n],/viewBox="0 0 64 72" width="64" height="72"/);for(let tier=1;tier<=4;tier++)assert.match(stages[n],new RegExp(`data-avatar-tier="${tier}" display="${n>=tier?'inline':'none'}"`));}
    for(const [value,stage] of [[-1,0],[Infinity,0],[99,4],[2.8,2]])assert.match(art.avatar(e.id,value),new RegExp(`data-avatar-stage="${stage}"`));for(let n=0;n<3;n++)assert.match(art.travelerHat(e.id,n),/^M/);}
});
test('browser export is self contained and all motion stops when hidden or motion is disabled',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../static/shop-collection-v3-player.js'),'utf8'),context={};vm.runInNewContext(source,context);assert.equal(context.FocusShopCollectionV3Player.entries.length,16);assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage|addEventListener/);
  const css=fs.readFileSync(path.join(__dirname,'../static/shop-collection-v3-player.css'),'utf8');for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','dialog:not([open])','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard));assert.doesNotMatch(css,/filter\s*:|animation[^;]*(?:width|height)/);
});
test('malformed and cross-slot input cannot inject SVG or render another product',()=>{
  for(const id of [null,undefined,{},[],'__proto__','constructor','bar-<script>','\" onload=\"alert(1)']){assert.equal(art.has(id),false);assert.equal(art.item(id),null);assert.equal(art.preview(id),'');assert.equal(art.avatar(id),'');assert.equal(art.barRibbon(id),'');}
  assert.equal(art.avatar('bar-toastdash'),'');assert.equal(art.barFigure('avatar-noodlechef'),'');assert.equal(art.barDesign('avatar-solarpainter'),null);assert.equal(art.travelerHat('bar-puddleduck'),'');
});
