'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const art=require('../static/lottery-collection-v3-coin.js');
const js=fs.readFileSync(path.join(__dirname,'../static/lottery-collection-v3-coin.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../static/lottery-collection-v3-coin.css'),'utf8');
function refs(svg,seen=new Set()){
  const ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  for(const id of ids){assert.match(id,/^[a-zA-Z0-9_-]+$/);assert.ok(!seen.has(id));seen.add(id);}
  for(const match of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(match[1]),match[1]);
}
test('six independent coin-only collections preserve immutable inventory metadata',()=>{
  assert.deepEqual(art.entries.map(entry=>entry.slot).sort(),['avatar','bar','companion','island','relic','theme']);
  assert.equal(new Set(art.entries.map(entry=>entry.id)).size,6);
  for(const entry of art.entries){assert.equal(entry.lotteryMachine,'coin');assert.equal(entry.lotteryOnly,true);assert.equal(entry.exclusive,false);assert.equal(entry.diamonds,0);assert.ok(Object.isFrozen(entry));assert.ok(Object.isFrozen(entry.tints));}
  const before=JSON.stringify(art.entries);const tint=art.colors('bar-koidance');tint[0]='changed';assert.equal(JSON.stringify(art.entries),before);
});
test('UMD is autonomous and does not schedule work, read state or access the network',()=>{
  const context={};vm.runInNewContext(js,context);assert.equal(context.FocusLotteryCoinV3.entries.length,6);
  assert.deepEqual(Object.keys(context.FocusLotteryCoinV3).sort(),Object.keys(art).sort());
  assert.doesNotMatch(js,/require\(|setInterval|setTimeout|requestAnimationFrame|fetch\(|localStorage|addEventListener|Math\.random/);
});
test('thumbnails and actual scene artwork are valid, bounded SVG with local unique definitions',()=>{
  const all=art.entries.map(entry=>art.preview(entry.id));
  for(const svg of all){assert.match(svg,/viewBox="0 0 160 112"/);assert.doesNotMatch(svg,/undefined|NaN|Infinity|<script|<foreignObject|\bon\w+=|href=/);assert.ok((svg.match(/<(?:path|rect|circle|ellipse)/g)||[]).length<220);refs(svg);}
  all.push(art.avatar('avatar-stormranger',4),art.themeBackdrop('theme-cloudregatta'));
  all.push(`<svg xmlns="http://www.w3.org/2000/svg">${art.islandDecoration('island-clockworkgarden')+art.themeCityScene('theme-cloudregatta')+art.relic('relic-dragonpearl')}</svg>`);
  const result=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as E\nfor s in json.load(sys.stdin): E.fromstring(s)'],{input:JSON.stringify(all),encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.match(art.barFigure('bar-koidance'),/orange-white-koi/);assert.match(art.companion('companion-emberlion'),/lion-cub/);assert.match(art.relic('relic-dragonpearl'),/eastern-dragon/);assert.match(art.themeCityScene('theme-cloudregatta'),/cloud-airship/);
});
test('ribbon effects use the existing 600×24 clip and do not fake percentage progress',()=>{
  const seen=new Set();for(let n=0;n<20;n++){const ribbon=art.barRibbon('bar-koidance','same');refs(ribbon,seen);assert.match(ribbon,/<clipPath[^>]*><rect[^>]*width="600"[^>]*height="24"/);assert.doesNotMatch(ribbon,/<svg|filter=|data-progress|aria-valuenow/);}
  refs(art.barRibbon('bar-koidance','" onload="alert(1)'));
  assert.ok(art.preview('bar-koidance').includes(art.barFigure('bar-koidance')));
});
test('ranger growth supports all five stages and clamps malformed input',()=>{
  for(let s=0;s<5;s++){const avatar=art.avatar('avatar-stormranger',s);assert.match(avatar,new RegExp(`data-avatar-stage="${s}"`));for(let tier=1;tier<=4;tier++)assert.match(avatar,new RegExp(`data-avatar-tier="${tier}" display="${s>=tier?'inline':'none'}"`));}
  for(const bad of [NaN,Infinity,'not-a-stage',-20])assert.match(art.avatar('avatar-stormranger',bad),/data-avatar-stage="0"/);
  assert.match(art.avatar('avatar-stormranger',99),/data-avatar-stage="4"/);
  for(let part=0;part<3;part++)assert.match(art.travelerHat('avatar-stormranger',part),/^M/);
});
test('garden protects camp and theme decorations occupy city sky without UI overlays',()=>{
  const island=art.islandDecoration('island-clockworkgarden');assert.match(island,/data-camp-clearance="338 241 42"/);assert.match(island,/pointer-events="none"/);assert.match(island,/lcv3c-windmill-rotor/);assert.doesNotMatch(island,/tabindex|role="button"/);
  const city=art.themeCityScene('theme-cloudregatta');assert.match(city,/data-scene-size="1200 720"/);assert.match(city,/pointer-events="none"/);assert.equal(art.themePalette('theme-cloudregatta').length,4);assert.deepEqual(art.palette('theme-cloudregatta'),art.themePalette('theme-cloudregatta'));
  assert.doesNotMatch(css,/--ui-|\.sidebar|\.shop-card|\.heatmap-panel|filter\s*:/);
});
test('unsupported ids are inert and animation guards cover paused/hidden/reduced-motion scenes',()=>{
  for(const id of [null,undefined,{},[],'constructor','__proto__','bar-koi','" onload="1']){assert.equal(art.has(id),false);assert.equal(art.item(id),null);for(const method of ['preview','premium','avatar','themeBackdrop','islandDecoration','companion','relic'])assert.equal(art[method](id),'');}
  assert.equal(art.barDesign('companion-emberlion'),null);assert.equal(art.themePalette('relic-dragonpearl'),null);
  for(const guard of ['.no-motion','html.focus-runtime-hidden','[hidden]','prefers-reduced-motion:reduce'])assert.ok(css.includes(guard));
  for(const block of css.matchAll(/@keyframes[^}]+(?:\}[^@]*?)(?=\n@|\n\.no-motion)/g))assert.doesNotMatch(block[0],/filter:|width:|height:|left:|top:/);
});
