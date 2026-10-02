const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const art = require('../static/campfire-shop-art.js');
const baseArt = require('../static/campfire-art.js');
const catalog = {
  camp: ['default', 'pine', 'lake', 'snow', 'aurora'],
  fire: ['default', 'copper', 'lantern', 'blue', 'star'],
  tent: ['default', 'patchwork', 'ranger', 'canopy', 'observatory'],
  campgear: ['default', 'tea', 'books', 'picnic', 'music'],
  campglow: ['default', 'fireflies', 'petals', 'snow', 'stardust'],
  chatframe: ['default', 'linen', 'wood', 'parchment', 'constellation'],
};
const defaults = {...Object.fromEntries(Object.keys(catalog).map(slot => [slot, `${slot}-default`])), camptrail:'trail-default', campmark:'campmark-default'};
const combination = {camp: 'camp-lake', fire: 'fire-copper', tent: 'tent-canopy',
  campgear: 'campgear-books', campglow: 'campglow-stardust', chatframe: 'chatframe-linen'};
const safeSvg = svg => {
  assert.match(svg, /^<svg class="campfire-scene-art(?: campfire-shop-preview)?"/);
  assert.match(svg, /viewBox="0 0 660 240"/);
  assert.match(svg, /role="img" aria-label="[^"]+"/);
  assert.ok(svg.trim().endsWith('</svg>'));
  assert.doesNotMatch(svg, /\bid=|href=|url\(|<script|<foreignObject|<animate|undefined|NaN/);
};

test('normalization strictly validates each slot without changing input or inheriting equipped properties', () => {
  assert.deepEqual(art.normalize(), defaults);
  const input = Object.freeze({...combination, bar: 'bar-comet', extra: '<script>bad()</script>'});
  assert.deepEqual(art.normalize(input), {...defaults, ...combination});
  assert.equal(input.extra, '<script>bad()</script>');
  for (const value of [null, undefined, {}, [], 1, 'constructor', '__proto__', '<script>bad()</script>', '" onload="bad()']) {
    assert.deepEqual(art.normalize({camp: value}), defaults);
    assert.equal(art.preview(value), art.preview('unknown-item'));
  }
  assert.deepEqual(art.normalize(Object.create(combination)), defaults);
  assert.deepEqual(art.normalize({fire: 'camp-lake', campglow: 'fire-blue'}), defaults);
});

test('default equipment preserves the original scene, and deterministic rendering never restarts polling cards', () => {
  const original = baseArt.scene();
  const neutral = art.scene(defaults).replace(/ data-(camp|fire|tent|campgear|campglow|chatframe|camptrail|campmark)="[^"]+"/g, '');
  assert.equal(neutral, original);
  for (const equipped of [defaults, combination]) {
    const svg = art.scene(equipped);
    assert.equal(svg, art.scene({...equipped}));
    safeSvg(svg);
  }
});

test('all thirty items preview with independent, visibly different variants and no external SVG references', () => {
  for (const [slot, variants] of Object.entries(catalog)) {
    const previews = variants.map(variant => {
      const id = `${slot}-${variant}`, svg = art.preview(id, combination);
      safeSvg(svg);
      assert.ok(svg.includes(`data-${slot}="${id}"`));
      for (const [other, equipped] of Object.entries(combination)) {
        if (other !== slot) assert.ok(svg.includes(`data-${other}="${equipped}"`), `${id} must retain ${other}`);
      }
      if (slot === 'chatframe') {
        assert.match(svg, /<text[^>]*>坐一会儿吧，今晚的星光很温柔。<\/text>/);
        assert.ok(svg.includes(`data-frame="${variant}"`));
      }
      // Strip metadata, so merely changing the selected product ID cannot pass.
      return svg.replace(/ data-[\w-]+="[^"]+"/g, '');
    });
    assert.equal(new Set(previews).size, 5, `${slot} must have five distinct visual previews`);
  }
  assert.deepEqual(combination, {camp: 'camp-lake', fire: 'fire-copper', tent: 'tent-canopy',
    campgear: 'campgear-books', campglow: 'campglow-stardust', chatframe: 'chatframe-linen'});
});

test('combined scenery keeps one tent, fire and furnishing layer with independently styled ambient particles', () => {
  for (const camp of catalog.camp) for (const fire of catalog.fire) for (const tent of catalog.tent) {
    const svg = art.scene({...combination, camp: `camp-${camp}`, fire: `fire-${fire}`, tent: `tent-${tent}`});
    safeSvg(svg);
    assert.equal((svg.match(/class="campfire-tent"/g) || []).length, 1);
    assert.equal((svg.match(/class="campfire-flame"/g) || []).length, 1);
    assert.equal((svg.match(/class="campfire-equipment"/g) || []).length, 1);
    assert.match(svg, /<svg[^>]*data-skin-slots="camp fire tent campgear campglow"/);
    assert.match(svg, /class="campfire-tent" data-skin-slots="tent"/);
    assert.match(svg, /class="campfire-equipment" data-skin-slots="campgear"/);
    assert.match(svg, fire === 'default' ? /class="campfire-flame" data-skin-slots="fire"/ : /class="campfire-fireplace" data-skin-slots="fire"/);
    assert.doesNotMatch(svg, /class="campfire-flame"[^>]*transform=/, 'fixed flame placement must live outside the animated group');
    assert.doesNotMatch(svg, /<ellipse cx="412" cy="212"/, 'equipped furnishing replaces the right stump');
  }
  for (const effect of catalog.campglow.slice(1)) {
    const svg = art.scene({campglow: `campglow-${effect}`});
    assert.equal((svg.match(new RegExp(`class="campfire-ambient" data-effect="${effect}"`, 'g')) || []).length, 12);
    assert.equal((svg.match(/--particle-delay:/g) || []).length, 12);
    assert.match(svg, /class="campfire-atmosphere" data-skin-slots="campglow"/);
  }
  assert.doesNotMatch(art.scene(), /class="campfire-ambient"/);
});

test('right-click targets stay specific for every furnishing, landscape and chat-frame variant', () => {
  for (const variant of catalog.campgear.slice(1)) {
    assert.match(art.scene({campgear: `campgear-${variant}`}), /class="campfire-equipment" data-skin-slots="campgear"/);
  }
  for (const variant of catalog.camp.slice(1)) {
    assert.match(art.scene({camp: `camp-${variant}`}), /class="campfire-landscape" data-skin-slots="camp"/);
  }
  for (const variant of catalog.chatframe) {
    assert.match(art.preview(`chatframe-${variant}`), /class="campfire-chat-preview" data-skin-slots="chatframe"/);
  }
});

test('browser UMD uses existing campfire art without a DOM, storage, network or clock', () => {
  const context = {FocusCampfireArt: baseArt};
  vm.runInNewContext(fs.readFileSync(require.resolve('../static/campfire-shop-art.js'), 'utf8'), context);
  const browser = context.FocusCampfireShopArt;
  assert.deepEqual(JSON.parse(JSON.stringify(browser.normalize(combination))), art.normalize(combination));
  assert.equal(browser.scene(combination), art.scene(combination));
  assert.equal(browser.preview('chatframe-parchment', combination), art.preview('chatframe-parchment', combination));
});


test('new camp slots validate their exact SKU prefixes, rejecting cross-slot and inherited IDs', () => {
  assert.deepEqual(art.normalize({camptrail:'trail-stone',campmark:'campmark-moon'}), {...defaults,camptrail:'trail-stone',campmark:'campmark-moon'});
  assert.deepEqual(art.normalize({camptrail:'camptrail-stone',campmark:'trail-stars'}), defaults);
  assert.deepEqual(art.normalize(Object.create({camptrail:'trail-stars'})), defaults);
});

test('previews resolve the independent world art at call time and retain every other camp setting', () => {
  const context = {FocusCampfireArt: baseArt};
  vm.runInNewContext(fs.readFileSync(require.resolve('../static/campfire-shop-art.js'),'utf8'),context);
  assert.match(context.FocusCampfireShopArt.preview('trail-stone'), /campfire-scene-art/);
  const calls=[];
  context.FocusCampWorldArt={scene(equipment,options){calls.push({equipment:JSON.parse(JSON.stringify(equipment)),options:JSON.parse(JSON.stringify(options))});return '<svg class="camp-world-art" data-live-preview="yes"></svg>';}};
  const equipped=Object.freeze({...combination,camptrail:'trail-stars',campmark:'campmark-moon'});
  const ids = Object.entries(catalog).flatMap(([slot,variants])=>variants.map(variant=>[slot,`${slot}-${variant}`])).concat([
    ['camptrail','trail-default'],['camptrail','trail-stone'],['camptrail','trail-stars'],
    ['campmark','campmark-default'],['campmark','campmark-chimes'],['campmark','campmark-moon']]);
  for(const [slot,id] of ids){
    assert.match(context.FocusCampfireShopArt.preview(id,equipped),/camp-world-art/);
    assert.deepEqual(calls.at(-1).equipment,{...equipped,[slot]:id});
    assert.deepEqual(calls.at(-1).options,{interactive:false});
  }
  assert.equal(calls.length,36);
  assert.equal(equipped.camptrail,'trail-stars');
});

test('all 36 camp SKUs use the actual world artwork, preserve seven other positions and disable scene controls', () => {
  const world = require('../static/camp-world-art.js');
  const context = {FocusCampfireArt: baseArt, FocusCampWorldArt: world};
  vm.runInNewContext(fs.readFileSync(require.resolve('../static/campfire-shop-art.js'), 'utf8'), context);
  const input = Object.freeze({...combination, camptrail:'trail-stars', campmark:'campmark-moon'});
  const variants = {...catalog, camptrail:['default','stone','stars'], campmark:['default','chimes','moon']};
  let count=0;
  for(const [slot, values] of Object.entries(variants)){
    const drawings=values.map(value=>{
      const id=`${slot==='camptrail'?'trail':slot}-${value}`, chosen={...input,[slot]:id};
      const svg=context.FocusCampfireShopArt.preview(id,input);
      assert.equal(svg,world.scene(chosen,{interactive:false}));
      assert.match(svg,/class="camp-world-art"/);
      assert.match(svg,/viewBox="0 0 1200 760"/);
      assert.doesNotMatch(svg,/role="button"|tabindex=|<script|<foreignObject|NaN|undefined/);
      for(const [part,selected] of Object.entries(chosen))assert.ok(svg.includes(`data-${part}="${selected}"`),`${id} retains ${part}`);
      count++;
      return svg.replace(/ data-[\w-]+="[^"]*"/g,'');
    });
    assert.equal(new Set(drawings).size,values.length,`${slot} must change actual artwork`);
  }
  assert.equal(count,36);
  assert.equal(input.camptrail,'trail-stars');
});
