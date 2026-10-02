const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const art = require('../static/camp-world-art.js');
const campfire = require('../static/campfire-art.js');
const questArt = require('../static/quest-art.js');
const slots = {
  camp: ['default','pine','lake','snow','aurora'],
  fire: ['default','copper','lantern','blue','star'],
  tent: ['default','patchwork','ranger','canopy','observatory'],
  campgear: ['default','tea','books','picnic','music'],
  campglow: ['default','fireflies','petals','snow','stardust'],
  chatframe: ['default','linen','wood','parchment','constellation'],
  camptrail: ['default','stone','stars'],
  campmark: ['default','chimes','moon'],
};
const idFor = (slot, variant) => `${slot === 'camptrail' ? 'trail' : slot}-${variant}`;
const stripMetadata = svg => svg.replace(/\sdata-[\w-]+="[^"]*"/g, '');

test('camp is a complete landscape with four accessible, individually selectable NPC stations', () => {
  const svg = art.scene();
  assert.match(svg, /class="camp-world-art" viewBox="0 0 1200 760"/);
  assert.equal((svg.match(/role="button"/g) || []).length, 5);
  assert.equal((svg.match(/tabindex="0"/g) || []).length, 5);
  assert.equal((svg.match(/class="camp-world-avatar"/g) || []).length, 4);
  for (const id of ['guide','hearth','wanderer','stargazer']) {
    assert.match(svg, new RegExp(`data-camp-station="${id}" data-camp-place="${id}" data-selected="false"`));
    assert.match(svg, new RegExp(`data-character="${id}"`));
  }
  for (const name of ['栖灯','阿榆','闻舟','望舒']) assert.ok(svg.includes(name));
  for (const part of ['landscape','trail','tent','marker','fire','furnishing','notice','ambience']) assert.ok(svg.includes(`data-camp-part="${part}"`));
  assert.ok(!svg.includes('660 240'));
  assert.ok(!svg.includes('campfire-scene-art'));
});

test('decorative shop scenes and the small entrance never introduce keyboard or button hotspots', () => {
  for (const svg of [art.scene({}, {interactive:false}), art.entrance()]) {
    assert.doesNotMatch(svg, /role="button"|tabindex=|aria-pressed=/);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|<iframe|href=|url\(/i);
  }
  assert.match(art.entrance(), /viewBox="0 0 160 110"/);
  assert.match(art.scene({}, {interactive:false}), /role="img"/);
});

test('the walking route connects at the end of the camp road and stays accessible with every camp theme',()=>{
  for(const camp of slots.camp){
    const svg=art.scene({camp:idFor('camp',camp)});
    assert.match(svg,/data-camp-trail="open" role="button" tabindex="0" aria-label="沿归途小径散步"/);
    assert.match(svg,/M574 674Q625 708 709 712/);
    assert.match(svg,/七处风景 · 通往星辉城/);
  }
  assert.doesNotMatch(art.roadside(),/data-camp-trail/,'the homepage hearth keeps its original silhouette');
});

test('equipment is allowlisted by slot including the special trail product prefix', () => {
  const fallback = art.normalize();
  assert.equal(fallback.camptrail, 'trail-default');
  assert.equal(fallback.campmark, 'campmark-default');
  assert.deepEqual(art.normalize(null), fallback);
  assert.deepEqual(art.normalize([]), fallback);
  assert.deepEqual(art.normalize(Object.create({camp:'camp-lake'})), fallback);
  assert.deepEqual(art.normalize({camp:'fire-blue',fire:'camp-pine',camptrail:'camptrail-stone'}), fallback);
  const malicious = '"/><script>alert(1)</script><g data-x="';
  assert.deepEqual(art.normalize(Object.fromEntries(Object.keys(slots).map(slot => [slot,malicious]))), fallback);
  assert.equal(art.scene({fire:malicious},{selected:malicious}), art.scene());
  assert.equal(art.entrance({camp:malicious}), art.entrance());
});

for (const [slot, variants] of Object.entries(slots)) {
  test(`${slot}: every owned appearance changes rendered art, not only metadata`, () => {
    const variantsSVG = variants.map(variant => art.scene({[slot]:idFor(slot,variant)}));
    assert.equal(new Set(variantsSVG.map(stripMetadata)).size, variants.length);
    for (const [index, svg] of variantsSVG.entries()) {
      assert.ok(svg.includes(`data-${slot}="${idFor(slot, variants[index])}"`));
      assert.ok(svg.includes(`data-skin-slots="${slot}"`));
    }
  });
}

test('all variants produce well-formed self-contained SVG with no document-wide IDs', () => {
  const renders = [art.scene(), art.entrance()];
  for (const [slot, variants] of Object.entries(slots)) for (const variant of variants) {
    const equipment = {[slot]:idFor(slot,variant)};
    renders.push(art.scene(equipment),art.entrance(equipment));
  }
  for (const svg of renders) {
    assert.doesNotMatch(svg, /(?:^|\s)id=|href=|url\(|undefined|NaN|Infinity/);
  }
  const result = spawnSync('/usr/bin/python3', ['-c', 'import json,sys,xml.etree.ElementTree as ET\nfor svg in json.load(sys.stdin): ET.fromstring(svg)'], {input:JSON.stringify(renders), encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('selection updates the existing SVG and ARIA states without rebuilding the scene', () => {
  function element(attrs) {
    return {attrs, getAttribute(name){return this.attrs[name]??null;},setAttribute(name,value){this.attrs[name]=value;}};
  }
  const nodes = ['guide','hearth','wanderer','stargazer'].map(id => element({'data-camp-station':id,role:'button'}));
  const svg=element({});
  const container={querySelector:()=>svg,querySelectorAll:()=>nodes};
  assert.equal(art.setSelection(container,'hearth'),'hearth');
  assert.equal(svg.attrs['data-selected'],'hearth');
  assert.deepEqual(nodes.map(node=>node.attrs['aria-pressed']),['false','true','false','false']);
  assert.equal(art.setSelection(container,'invalid'),'');
  assert.equal(svg.attrs['data-selected'],'');
  assert.ok(nodes.every(node=>node.attrs['data-selected']==='false'));
  assert.equal(art.setSelection(null,'guide'),'');
  const selected=art.scene({}, {selected:'stargazer'});
  assert.match(selected, /data-camp-station="stargazer" data-camp-place="stargazer" data-selected="true" role="button" tabindex="0" aria-label="望舒 · 观星台，点击交谈" aria-pressed="true"/);
});

test('browser export uses the existing NPC art and matches CommonJS output', () => {
  const context={FocusCampfireArt:campfire,QuestArt:questArt};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../static/camp-world-art.js'),'utf8'),context);
  assert.equal(context.FocusCampWorldArt.scene({camp:'camp-lake'}),art.scene({camp:'camp-lake'}));
  assert.equal(context.FocusCampWorldArt.entrance({fire:'fire-blue'}),art.entrance({fire:'fire-blue'}));
});

test('motion respects application and operating-system preferences and preserves placement', () => {
  const css=fs.readFileSync(path.join(__dirname,'../static/camp-world-art.css'),'utf8');
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.no-motion \.camp-world-art \*/);
  assert.match(css, /\.no-motion \.camp-world-entrance-art \*/);
  assert.match(css, /animation:\s*none !important/);
  assert.match(css, /\.camp-world-person-motion/);
  assert.match(css, /\.camp-world-station-rim/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@keyframes camp-world-water/);
  assert.match(css, /@keyframes camp-world-smoke/);
});


test('the small traveler wears the current player outfit, independently of eight camp slots', () => {
  const current=art.scene({avatar:'avatar-ranger'});
  assert.match(current,/class="camp-world-player-avatar"[^>]*data-outfit="avatar-ranger"/);
  assert.match(current,/width="50" height="56.25"/);
  assert.equal(Object.keys(art.normalize({avatar:'avatar-ranger'})).length,8);
  assert.doesNotMatch(art.scene({avatar:'"/><script>alert(1)</script>'}),/<script|alert/);
  assert.match(art.scene({avatar:'"/><script>alert(1)</script>'}),/data-outfit="avatar-default"/);
  for (const id of ['guide','hearth','wanderer','stargazer']) assert.match(current,new RegExp(`data-character="${id}"`));
  assert.match(art.scene({avatar:'avatar-royal'},{interactive:false}),/data-outfit="avatar-royal"/);
});

test('initial station and subsequent selection move one existing traveler to deterministic positions', () => {
  const positions={home:[550,500],guide:[437,414],hearth:[438,563],wanderer:[729,445],stargazer:[680,359]};
  const traveler={attrs:{},style:{},setAttribute(name,value){this.attrs[name]=value;}};
  let lookups=0;
  const svg={setAttribute(){},querySelector(selector){assert.equal(selector,'[data-camp-player]');lookups++;return traveler;}};
  const container={querySelector:()=>svg,querySelectorAll:()=>[]};
  for (const [station,[x,y]] of Object.entries(positions)) {
    const selected=station==='home'?'':station;
    const markup=art.scene({}, {selected});
    assert.ok(markup.includes(`data-camp-destination="${station}" data-skin-slots="avatar" style="transform:translate(${x}px,${y}px)"`));
    art.setSelection(container,selected);
    assert.equal(traveler.style.transform,`translate(${x}px,${y}px)`);
    assert.equal(traveler.attrs['data-camp-destination'],station);
  }
  assert.equal(lookups,5);
  const css=fs.readFileSync(path.join(__dirname,'../static/camp-world-art.css'),'utf8');
  assert.match(css,/transition:\s*transform 600ms/);
  assert.match(css,/\.no-motion \.camp-world-player/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.camp-world-player \{ transition: none !important/);
});


test('hollow camp markers and tents have a local transparent hit surface behind their artwork', () => {
  for (const variant of slots.campmark) {
    const svg=art.scene({campmark:idFor('campmark',variant)});
    assert.match(svg, /data-skin-slots="campmark" data-camp-part="marker"[^>]*><rect data-camp-hit="campmark" x="-76" y="-110" width="152" height="141" rx="10" fill="transparent"\/>/);
  }
  for (const variant of slots.tent) {
    const svg=art.scene({tent:idFor('tent',variant)});
    assert.match(svg, /data-skin-slots="tent" data-camp-part="tent"[^>]*><rect data-camp-hit="tent"[^>]*fill="transparent"\/>/);
  }
  const preview=art.scene({campmark:'campmark-moon',tent:'tent-canopy'},{interactive:false});
  assert.doesNotMatch(preview, /role="button"|tabindex=|pointer-events="bounding-box"/);
});
