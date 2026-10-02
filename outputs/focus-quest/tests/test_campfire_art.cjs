const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const art = require('../static/campfire-art.js');
const questArt = require('../static/quest-art.js');
const source = fs.readFileSync(require.resolve('../static/campfire-art.js'), 'utf8');
const characters = ['guide', 'hearth', 'wanderer', 'stargazer'];
const outfits = ['npc-default', 'npc-scholar', 'npc-tea', 'npc-copper', 'npc-astral', 'npc-phoenix'];

test('four campfire companions have distinct safe avatars and share the original guide', () => {
  const avatars = characters.map(character => art.avatar(character));
  assert.equal(new Set(avatars).size, 4);
  for (const [index, svg] of avatars.entries()) {
    assert.match(svg, /^<svg class="quest-avatar-art campfire-avatar-art" viewBox="0 0 64 72"/);
    assert.ok(svg.includes(`data-character="${characters[index]}"`));
    assert.match(svg, /aria-hidden="true" focusable="false"/);
    assert.match(svg, /<ellipse cx="32" cy="34.5" rx="11.5" ry="13" fill="#e4c7ad"/);
    assert.match(svg, /<circle cx="27.7" cy="36.6"/);
    assert.match(svg, /<circle cx="36.3" cy="36.6"/);
    assert.doesNotMatch(svg, /\bid=|href=|url\(|<script|<foreignObject|undefined|NaN/);
    assert.ok(svg.endsWith('</svg>'));
  }
  assert.equal(art.avatar('guide').replace(' campfire-avatar-art', '').replace(' data-character="guide"', ''), questArt.avatar('guide', 'npc-default'));
});

test('legacy NPC wardrobe inputs are ignored while each companion keeps its face and personal belongings', () => {
  for (const character of characters) {
    const variants = outfits.map(outfit => art.avatar(character, outfit));
    assert.equal(new Set(variants).size, 1);
    for (const outfit of outfits) {
      const svg = art.avatar(character, outfit);
      assert.ok(svg.includes(`data-character="${character}"`));
      assert.ok(svg.includes('data-outfit="npc-default"'));
      assert.equal(svg, art.avatar(character));
      assert.match(svg, /<ellipse cx="32" cy="34.5" rx="11.5" ry="13" fill="#e4c7ad"/);
      if (character === 'hearth') assert.match(svg, /<ellipse cx="31" cy="55" rx="8"/);
      if (character === 'wanderer') assert.match(svg, /M20 53q6-3 12 0/);
      if (character === 'stargazer') assert.match(svg, /rotate\(-18 37 57\)/);
    }
  }
});

test('unrecognized roles and outfits are never interpolated into SVG', () => {
  for (const value of [null, undefined, '', 4, {}, [], '__proto__', 'constructor', 'avatar-star', '<script>alert(1)</script>', '" onload="evil()']) {
    assert.equal(art.avatar(value, value), art.avatar('guide'));
    for (const character of characters) assert.equal(art.avatar(character, value), art.avatar(character));
  }
});

test('campfire landscape is reusable and accessible, with separate static animation hooks', () => {
  const scene = art.scene();
  assert.equal(scene, art.scene());
  assert.match(scene, /^<svg class="campfire-scene-art" viewBox="0 0 660 240"/);
  assert.match(scene, /role="img" aria-label="[^\"]+"/);
  assert.match(scene, /<title>星岛篝火夜话<\/title>/);
  assert.equal((scene.match(/class="campfire-flame"/g) || []).length, 1);
  assert.equal((scene.match(/class="campfire-ember"/g) || []).length, 5);
  assert.equal((scene.match(/class="campfire-star"/g) || []).length, 13);
  for (const hook of ['campfire-tent', 'campfire-lantern', 'campfire-stumps', 'campfire-stones']) assert.ok(scene.includes(`class="${hook}"`));
  assert.match(scene, /<svg[^>]*data-skin-slots="camp fire tent campgear campglow"/);
  for (const [hook, slot] of [['campfire-tent','tent'], ['campfire-stumps','campgear'], ['campfire-stones','fire'], ['campfire-flame','fire']]) {
    assert.ok(scene.includes(`class="${hook}" data-skin-slots="${slot}"`));
  }
  assert.doesNotMatch(scene, /\bid=|href=|url\(|<animate|<script|<foreignObject|data-character=|undefined|NaN/);
  assert.ok(scene.endsWith('</svg>'));
});

test('browser UMD works with or without QuestArt and never needs DOM, storage, time or network', () => {
  for (const dependency of [undefined, questArt]) {
    const context = {QuestArt: dependency};
    vm.runInNewContext(source, context);
    assert.equal(typeof context.FocusCampfireArt.avatar, 'function');
    assert.equal(typeof context.FocusCampfireArt.scene, 'function');
    assert.equal(context.FocusCampfireArt.scene(), art.scene());
    for (const character of characters) {
      const svg = context.FocusCampfireArt.avatar(character, 'npc-astral');
      assert.ok(svg.includes(`data-character="${character}"`));
      if (dependency || character !== 'guide') assert.equal(svg, art.avatar(character, 'npc-astral'));
    }
  }
});
