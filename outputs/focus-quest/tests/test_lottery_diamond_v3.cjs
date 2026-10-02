'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const art=require('../static/lottery-collection-v3-diamond.js');
const source=fs.readFileSync(path.join(__dirname,'../static/lottery-collection-v3-diamond.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../static/lottery-collection-v3-diamond.css'),'utf8');
function refs(markup,seen=new Set()) {
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  for(const id of ids){assert.match(id,/^[\w-]+$/);assert.ok(!seen.has(id),`duplicate SVG def ${id}`);seen.add(id);}
  for(const [,id] of markup.matchAll(/url\(#([^)]*)\)/g))assert.ok(ids.includes(id),`missing SVG def ${id}`);
}
test('six diamond-exclusive collections cover distinct equipped slots in browser and Node',()=>{
  assert.equal(art.entries.length,6);assert.deepEqual(art.entries.map(e=>e.slot).sort(),['avatar','bar','companion','island','relic','theme']);
  assert.equal(new Set(art.entries.map(e=>e.id)).size,6);
  for(const entry of art.entries){assert.equal(entry.lotteryMachine,'diamond');assert.equal(entry.lotteryOnly,true);assert.equal(entry.exclusive,false);assert.equal(entry.coins,0);assert.equal(entry.diamonds,99);assert.ok(Object.isFrozen(entry));}
  const context={};vm.runInNewContext(source,context);assert.equal(context.FocusLotteryDiamondV3.entries.length,6);
  assert.deepEqual(Object.keys(context.FocusLotteryDiamondV3).sort(),Object.keys(art).sort());
});
test('all thumbnails and scene layers are valid, self-contained and bounded SVG',()=>{
  const variants=art.entries.map(e=>art.preview(e.id));
  variants.push(art.avatar('avatar-eclipseempress',4),art.themeBackdrop('theme-stellarwhales'));
  const seen=new Set();
  for(const markup of variants){assert.doesNotMatch(markup,/undefined|NaN|Infinity|<script|<foreignObject|\bon\w+=|href=|filter=/);assert.ok((markup.match(/<(?:path|circle|rect|ellipse)/g)||[]).length<240);refs(markup,seen);}
  for(const entry of art.entries)assert.match(art.preview(entry.id),/viewBox="0 0 160 112"/);
  const xml=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nfor svg in json.load(sys.stdin): ET.fromstring(svg)'],{input:JSON.stringify(variants),encoding:'utf8'});assert.equal(xml.status,0,xml.stderr);
});
test('star dragon fits the existing leader stage and locally clips its flowing river',()=>{
  const figure=art.barFigure('bar-stardragon');assert.match(figure,/lcv3d-dragon-whiskers/);assert.match(figure,/lcv3d-dragon-body/);
  assert.ok(art.preview('bar-stardragon').includes(figure));
  const seen=new Set();for(let n=0;n<3;n++){const ribbon=art.barRibbon('bar-stardragon','same-" onload="unsafe');refs(ribbon,seen);assert.match(ribbon,/<clipPath[^>]*><rect[^>]*width="600"[^>]*height="24"/);assert.match(ribbon,/lcv3d-rgb-river/);assert.doesNotMatch(ribbon,/<svg|keycap|foreignObject/);}
});
test('avatar preserves a normal face and has actual tier-controlled costume layers',()=>{
  for(let n=0;n<5;n++){const body=art.avatar('avatar-eclipseempress',n);assert.match(body,new RegExp(`data-avatar-stage="${n}"`));for(let tier=1;tier<=4;tier++)assert.match(body,new RegExp(`data-avatar-tier="${tier}" display="${n>=tier?'inline':'none'}"`));}
  assert.match(art.avatar('avatar-eclipseempress',Infinity),/data-avatar-stage="0"/);assert.match(art.avatar('avatar-eclipseempress',100),/data-avatar-stage="4"/);
  for(let n=0;n<3;n++)assert.match(art.travelerHat('avatar-eclipseempress',n),/^M/);
});
test('ninefox has nine separate flowing tails and tree has distinct roots, canopy and fruit',()=>{
  const fox=art.companion('companion-ninefox');assert.deepEqual([...fox.matchAll(/data-fox-tail="(\d+)"/g)].map(m=>Number(m[1])),[1,2,3,4,5,6,7,8,9]);
  const tree=art.relic('relic-worldtree');for(const part of ['tree-roots','tree-canopy','tree-fruit','tree-spring'])assert.ok(tree.includes(`lcv3d-${part}`));assert.doesNotMatch(tree,/class="[^"]*(?:orbit|halo-ring)/);
});
test('floating city leaves the camp and routes open; sky whales work in both views',()=>{
  const island=art.islandDecoration('island-aethercitadel');assert.match(island,/data-camp-clearance="338 241 42"/);assert.match(island,/pointer-events="none"/);assert.match(island,/lcv3d-citadel-crown/);assert.match(island,/lcv3d-waterfall-drops/);
  for(const markup of [art.themeScene('theme-stellarwhales'),art.themeCityScene('theme-stellarwhales')]){assert.equal((markup.match(/data-stellar-whale="true"/g)||[]).length,2);assert.match(markup,/lcv3d-whale-fin/);assert.match(markup,/lcv3d-whale-tail/);assert.match(markup,/pointer-events="none"/);}
  assert.match(art.themeCityScene('theme-stellarwhales'),/data-scene-size="1200 720"/);assert.equal(art.themePalette('theme-stellarwhales').length,4);
});
test('wrong slots and untrusted IDs are inert and all animation respects suspension',()=>{
  for(const id of [undefined,null,{},'__proto__','constructor','" onload="oops']){assert.equal(art.has(id),false);assert.equal(art.preview(id),'');assert.equal(art.premium(id),'');assert.equal(art.item(id),null);}
  assert.equal(art.avatar('bar-stardragon'),'');assert.equal(art.islandDecoration('theme-stellarwhales'),'');assert.equal(art.themePalette('bar-stardragon'),null);
  assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage|addEventListener/);
  for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard));assert.doesNotMatch(css,/filter\s*:|--ui-|\.sidebar|\.shop-card/);
});
