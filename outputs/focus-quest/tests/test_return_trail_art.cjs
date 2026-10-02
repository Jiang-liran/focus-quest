const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const art = require('../static/return-trail-art.js');
const questArt = require('../static/quest-art.js');

const ids = ['mist-camp','glow-shore','chime-bridge','mirror-gallery','cloud-library','orbit-terrace','home-beacon'];

test('the seven places form a complete ordered path with accessible landscape interactions', () => {
  for (const [index, id] of ids.entries()) {
    const svg=art.scene(index);
    assert.match(svg,/viewBox="0 0 1200 700"/);
    assert.ok(svg.includes(`data-trail-station="${id}"`));
    assert.ok(svg.includes(`data-trail-interact="${id}"`));
    assert.equal((svg.match(/role="button"/g)||[]).length,3);
    assert.equal((svg.match(/tabindex="0"/g)||[]).length,3);
    assert.equal((svg.match(/data-trail-step="-1"/g)||[]).length,1);
    assert.equal((svg.match(/data-trail-step="1"/g)||[]).length,1);
    assert.match(svg,/class="trail-traveler return-trail-player"/);
    assert.doesNotMatch(svg,/data-skin-slots=/);
    assert.ok((svg.match(/<(?:g|path|circle|ellipse|rect|text)\b/g)||[]).length<350,'bounded scene complexity');
  }
  assert.match(art.scene(0),/aria-label="沿来路返回篝火营地"/);
  assert.match(art.scene(6),/aria-label="沿小路前往星辉城"/);
});

test('resting changes each actual landscape while preview mode has no keyboard hotspots', () => {
  const strip=svg=>svg.replace(/\s(?:data-[\w-]+|aria-[\w-]+)="[^"]*"/g,'');
  const landscapes=[];
  for(let index=0;index<7;index++) {
    const normal=art.scene(index), resting=art.scene(index,{}, {resting:true});
    assert.notEqual(strip(normal),strip(resting));
    assert.match(resting,/aria-pressed="true"/);
    const preview=art.scene(index,{}, {interactive:false});
    assert.doesNotMatch(preview,/role="button"|tabindex=|aria-pressed=/);
    assert.match(preview,/role="img"/);
    landscapes.push(strip(normal));
  }
  assert.equal(new Set(landscapes).size,7);
});

test('all seven scenes are self-contained valid SVG with every player outfit and unsafe inputs fall back', () => {
  const outfits=['avatar-default','avatar-ranger','avatar-voyager','avatar-alchemist','avatar-star','avatar-royal'];
  const renders=[];
  for(let index=0;index<7;index++) for(const avatar of outfits) for(const resting of [false,true]) {
    const svg=art.scene(index,{avatar},{resting});
    assert.ok(svg.includes(`data-outfit="${avatar}"`));
    assert.doesNotMatch(svg,/<script|<foreignObject|<iframe|<image|\sid=|url\(|href=|undefined|NaN|Infinity/);
    renders.push(svg);
  }
  const malicious='"/><script>alert(1)</script><g data-x="';
  assert.equal(art.scene(malicious,{avatar:malicious},{resting:malicious}),art.scene());
  assert.equal(art.scene(NaN),art.scene());
  assert.equal(art.scene(0,Object.create({avatar:'avatar-royal'})),art.scene());
  const result=spawnSync('/usr/bin/python3',['-c','import json,sys,xml.etree.ElementTree as ET\nfor svg in json.load(sys.stdin): ET.fromstring(svg)'],{input:JSON.stringify(renders),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('environment motion pauses when hidden, inactive or reduced and no JS loop runs', () => {
  const source=fs.readFileSync(path.join(__dirname,'../static/return-trail-art.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../static/return-trail-art.css'),'utf8');
  assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|addEventListener/);
  for(const selector of ['.focus-runtime-hidden','[hidden]','#return-trail-view[data-paused="true"]','html.no-motion','prefers-reduced-motion']) assert.ok(css.includes(selector));
  assert.match(css,/animation-play-state: paused/);
  assert.doesNotMatch(css,/filter:|backdrop-filter:/);
});

test('the nested traveler is isolated from icon strokes while every purchased outfit keeps its original art', () => {
  const css=fs.readFileSync(path.join(__dirname,'../static/return-trail-art.css'),'utf8');
  const travelerStyle=css.match(/\.return-trail-art\s+\.trail-player-avatar\s*\{([^}]+)\}/)?.[1];
  // An SVG presentation attribute loses to the app's svg{stroke:currentColor};
  // the reset must match the nested SVG itself, not just the outer landscape.
  assert.ok(travelerStyle,'nested SVG has a scoped style rule');
  assert.match(travelerStyle,/(?:^|;)\s*stroke:\s*none\s*;/);
  for(const avatar of ['avatar-default','avatar-ranger','avatar-voyager','avatar-alchemist','avatar-star','avatar-royal']) {
    const nested=art.scene(0,{avatar}).match(/<svg class="trail-player-avatar"[^>]*>([\s\S]*?)<\/svg>/)?.[1];
    const original=questArt.avatar('player',avatar).replace(/^<svg\b[^>]*>/,'').replace(/<\/svg>$/,'');
    assert.equal(nested,original,`${avatar} keeps its shapes, face, original colors and intentional trim`);
  }
});
