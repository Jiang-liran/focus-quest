const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {avatar} = require('../static/quest-art.js');

test('five original roles have different centered, decorative SVGs without duplicate document IDs', () => {
  const arts = ['morning', 'afternoon', 'shop', 'player', 'guide'].map(role => avatar(role));
  assert.equal(new Set(arts).size, 5);
  for (const art of arts) {
    assert.match(art, /^<svg class="quest-avatar-art" viewBox="0 0 64 72"/);
    assert.match(art, /aria-hidden="true" focusable="false"/);
    assert.match(art, /<ellipse cx="32" cy="34.5"/);
    assert.match(art, /<circle cx="27.7" cy="36.6"/);
    assert.match(art, /<circle cx="36.3" cy="36.6"/);
    assert.doesNotMatch(art, /\bid=|<script|<foreignObject|href=|url\(|undefined|NaN/);
    assert.ok(art.endsWith('</svg>'));
  }
});

test('NPCs retain their individual default designs despite every legacy outfit parameter', () => {
  for (const role of ['morning', 'afternoon', 'shop', 'guide']) {
    const plain = avatar(role);
    for (const outfit of ['npc-default', 'npc-scholar', 'npc-tea', 'npc-copper', 'npc-astral', 'npc-phoenix', 'avatar-star']) {
      const art = avatar(role, outfit);
      assert.equal(art, plain);
      assert.match(art, new RegExp(`data-role="${role}"`));
      assert.match(art, /<ellipse cx="32" cy="34.5" rx="11.5" ry="13" fill="#e4c7ad"/);
      assert.doesNotMatch(art, /data-skin-slots=/);
    }
  }
});

test('player outfits include distinct ranger hood and star fabric without accepting NPC equipment', () => {
  const standard = avatar('player');
  const ranger = avatar('player', 'avatar-ranger');
  const star = avatar('player', 'avatar-star');
  assert.equal(new Set([standard, ranger, star]).size, 3);
  assert.match(ranger, /fill="#6e9c8b"/);
  assert.match(ranger, /M16 31C17 18/);
  assert.match(star, /fill="#879fce"/);
  assert.match(star, /data-skin-slots="avatar"/);
  assert.equal(avatar('player', 'npc-scholar'), standard);
  assert.equal(avatar('morning', 'avatar-star'), avatar('morning'));
});

test('retired NPC CSS no longer overrides character identity while player clothing rules remain', () => {
  const css = fs.readFileSync(require.resolve('../static/cosmetics.css'), 'utf8');
  assert.doesNotMatch(css, /data-npc|--npc-|data-item[\^]?="npc-/);
  assert.match(css, /data-avatar="avatar-royal"/);
  assert.match(css, /data-avatar="avatar-star"/);
});

test('untrusted role/outfit inputs cannot appear in generated markup', () => {
  for (const invalid of [null, undefined, '', {}, [], 12, 'constructor', '__proto__', '<script>alert(1)</script>', '" onload="alert(1)']) {
    assert.equal(avatar(invalid, invalid), avatar('guide'));
    assert.equal(avatar('player', invalid), avatar('player'));
  }
});

test('UMD browser API works without storage, DOM, network, time or Node', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../static/quest-art.js'), 'utf8'), context);
  assert.equal(typeof context.QuestArt.avatar, 'function');
  assert.equal(context.QuestArt.avatar('shop', 'npc-astral'), avatar('shop', 'npc-astral'));
});
