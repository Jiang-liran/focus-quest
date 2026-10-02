(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusLotteryCoinV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Small, autonomous SVG layers. Scene owners control real progress and visibility.
  const definitions = [
    ['bar-koidance', 'bar', '锦鲤逐浪', ['#f7e4ba', '#357c87', '#e99466']],
    ['avatar-stormranger', 'avatar', '逐风游侠', ['#b8dec6', '#42746d', '#e8d29d']],
    ['island-clockworkgarden', 'island', '风车花园城', ['#dfd0a3', '#547a76', '#a5d6be']],
    ['theme-cloudregatta', 'theme', '云帆巡游', ['#d9e9dd', '#577995', '#e4bc90']],
    ['companion-emberlion', 'companion', '灯焰小狮', ['#f1d595', '#ad704f', '#f7b476']],
    ['relic-dragonpearl', 'relic', '游龙戏珠', ['#a8dfc5', '#447b80', '#f1d89e']]
  ];
  const descriptions = {
    "bar-koidance": "红白锦鲤沿碧色水流追逐，鱼尾、鳍片与细密鳞光伴随真实进度向前。抽奖限定。",
    "avatar-stormranger": "风羽披风与轻装游侠，随当天进度添上提灯、叶翼、羽冠与流转风痕。抽奖限定。",
    "island-clockworkgarden": "三座旋转风车与层叠花圃错落在主岛，水渠、暖窗与庭院微光相伴，保留路边篝火。抽奖限定。",
    "theme-cloudregatta": "两艘暖窗飞艇穿过层层云海，桨叶与轻云连起主岛天空，雨城远处也能看见缓缓驶过的云帆。抽奖限定。",
    "companion-emberlion": "带灯焰鬃毛的小狮守在旅人身旁，尾端暖焰与金色胸纹轻轻呼吸。抽奖限定。",
    "relic-dragonpearl": "青金游龙盘绕明珠，龙须、角枝与鳞片错层展开，替换主岛晶台与雨城橱窗展品。抽奖限定。"
};
  const entries = Object.freeze(definitions.map(([id, slot, name, tints]) => Object.freeze({
    id, slot, name, description: descriptions[id], lotteryMachine: 'coin', lotteryOnly: true, exclusive: false,
    coins: 9999, diamonds: 0, tints: Object.freeze(tints)
  })));
  const index = new Map(entries.map(entry => [entry.id, entry]));
  const has = (id, slot) => typeof id === 'string' && index.has(id) && (!slot || index.get(id).slot === slot);
  const item = id => has(id) ? index.get(id) : null;
  const colors = id => has(id) ? [...item(id).tints] : [];
  let serial = 0;
  const uid = prefix => `lcv3c-${String(prefix || 'art').replace(/[^a-zA-Z0-9_-]/g, '') || 'art'}-${++serial}`;
  const p = (d, fill, attrs = '') => `<path d="${d}" fill="${fill}" ${attrs}/>`;
  const l = (d, color, width = 1.4, attrs = '') => p(d, 'none', `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}`);
  const c = (x, y, radius, fill, attrs = '') => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" ${attrs}/>`;
  const e = (x, y, rx, ry, fill, attrs = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${attrs}/>`;
  const r = (x, y, w, h, fill, attrs = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${attrs}/>`;
  const g = (body, attrs = '') => `<g ${attrs}>${body}</g>`;
  const star = (x, y, size, color, attrs = '') => p(`M${x} ${y-size}l${size*.3} ${size*.7} ${size*.7} ${size*.3}-${size*.7} ${size*.3}-${size*.3} ${size*.7}-${size*.3}-${size*.7}-${size*.7}-${size*.3} ${size*.7}-${size*.3}Z`, color, attrs);
  const art = (id, body, cls = '', attrs = '') => g(body, `class="lcv3c-art ${cls}" data-lottery-collection="${id}" data-skin-slots="${item(id).slot}" ${attrs}`);
  const svg = (id, body, w = 160, h = 112, cls = '') => `<svg xmlns="http://www.w3.org/2000/svg" class="shop-art-svg lcv3c-svg ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false" fill="none" stroke="none" data-art="${id}">${body}</svg>`;
  const sparks = points => points.map(([x, y, size], n) => star(x, y, size, '#f4e0b3', `class="lcv3c-light" style="--lcv3c-delay:-${n*.8}s"`)).join('');

  function koi() {
    return g(
      g(p('M24 25C12 27 10 11 3 11l4 15-6 13c13-1 15-12 23-10Z', '#edab79') + l('M7 15 18 26 6 36', '#f4d4a0', 1), 'class="lcv3c-koi-tail"') +
      p('M20 25C31 12 52 10 68 22l8 6-8 7c-17 12-38 6-48-6Z', '#f2e6c9') +
      p('M21 24q12-14 23-10l-5 8 6 7-11 4-12-5Z', '#e9986b') +
      p('M54 18q9 0 17 7l-1 7-12 3-4-9Z', '#e7986b') +
      p('m35 17 13-9 7 10-14 1Z', '#d9ccac') +
      g(p('m43 32 11 15 8-14-10 6Z', '#e4b482') + l('M52 38 55 43', '#f6e9c8', .8), 'class="lcv3c-koi-fin"') +
      l('M24 28q19 8 37 2', '#d5bb96', .9) +
      l('M44 23q3 3 6 0m-8 6q3 3 6 0m1-8q3 3 6 0m-3 7q3 3 6 0', '#b3c4b6', .7) +
      c(66, 25, 1.45, '#38565d') + c(66.5, 24.6, .42, '#fff4d5') +
      l('M73 29q4 3 6 0m-6 1q2 6 6 6', '#d1bb95', .8), 'data-creature="orange-white-koi"');
  }
  function barDesign(id) {
    if (!has(id, 'bar')) return null;
    return { name: item(id).name, copy: '橙白锦鲤游在积累的尽头，水流与鳞光沿真实进度铺开。', colors: ['#326c80', '#a1dac3'], rail: '#193342', accent: '#edaa74' };
  }
  function barFigure(id) {
    if (!has(id, 'bar')) return '';
    return art(id, l('M2 32q9-5 20 0m-16 6q9-3 17 0', '#bbe9d1', 1.2, 'opacity=".78"') + g(koi(), 'class="lcv3c-koi-swim"') + c(73, 8, 1.4, '#cbeadb', 'class="lcv3c-light"') + c(81, 15, .9, '#cbeadb'), 'lcv3c-bar-figure');
  }
  function barRibbon(id, prefix) {
    if (!has(id, 'bar')) return '';
    const key = uid(prefix), gradient = `${key}-water`, clip = `${key}-clip`;
    const defs = `<defs><linearGradient id="${gradient}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#234960"/><stop offset=".42" stop-color="#42888c"/><stop offset=".64" stop-color="#a5d9be"/><stop offset="1" stop-color="#315e76"/></linearGradient><clipPath id="${clip}">${r(0, 0, 600, 24, 'white', 'rx="7"')}</clipPath></defs>`;
    const waves = l('M-120 7q30-5 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0', '#d2f0d7', 1.4, 'opacity=".63"') + l('M-120 17q30-6 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0', '#214f6b', 2.2, 'opacity=".6"');
    const scales = [25, 109, 205, 301, 397, 493, 589].map((x, n) => g(p('m0 0 8-4 8 4-8 4Z', n%2 ? '#e9c78f' : '#e5eed2', 'opacity=".42"') + l('M3 0q5 5 10 0', '#f9e8c5', .7), `transform="translate(${x} ${n%2 ? 17 : 10})"`)).join('');
    return defs + art(id, g(r(0, 0, 600, 24, `url(#${gradient})`) + g(waves, 'class="lcv3c-water-stream"') + g(scales, 'class="lcv3c-scale-light"') + l('M0 2H600', '#d6ecd5', .7, 'opacity=".45"'), `clip-path="url(#${clip})"`), 'lcv3c-bar-ribbon');
  }

  function avatar(id, stage = 0) {
    if (!has(id, 'avatar')) return '';
    const s = Number.isFinite(Number(stage)) ? Math.max(0, Math.min(4, Math.floor(Number(stage)))) : 0;
    const tier = (n, body) => g(body, `class="quest-avatar-tier quest-avatar-tier-${n}" data-avatar-tier="${n}" display="${s>=n?'inline':'none'}"`);
    const wings = tier(2, g(p('M24 38 7 24 4 46l13-6-2 12 12-7m13-7 17-14 3 22-13-6 2 12-12-7Z', '#83baa8') + p('m6 28 14 12-12 3m50-15-14 12 12 3Z', '#bad9bb') + l('M8 30 24 43m32-13L40 43', '#e9dfb4', .85), 'class="lcv3c-ranger-wings"'));
    const cloak = g(p('M25 40 17 47 12 66l20 4 20-4-7-20-9-6Z', '#619487') + p('m33 40 12 6 7 20-19 4Z', '#356663') + p('m26 42 7 6 7-6-6 26-8-2Z', '#a7cbb0') + l('M19 52 23 54 21 58 25 60m19-8-4 2 2 4-5 2', '#c1d4ae', .9), 'class="lcv3c-ranger-cloak"');
    const face = p('M22 25q-1 14 10 17 11-3 11-17Z', '#eacdac') + p('M22 28q-3-12 9-13 12-1 13 13l-9-7-4 4-4-3Z', '#5d7366') + c(27, 30.5, 1.12, '#425957') + c(37, 30.5, 1.12, '#425957') + l('M29 36q3 2 6-.4', '#a77869', 1) + e(24.5, 34, 1.8, .8, '#dba88d', 'opacity=".6"') + e(39.5, 34, 1.8, .8, '#dba88d', 'opacity=".6"');
    const hat = p('M17 25 24 10l10-4 11 15 6 4-18-3Z', '#679c8d') + p('m34 6 11 15-12 1Z', '#3f746d') + l('M18 25q15-5 31 0', '#decba0', 1.5) + p('m26 11 3 9 4-11Z', '#a8cbb0');
    const lantern = tier(1, g(l('M14 49v5', '#e3c99a', 1.2) + p('m10 54 4-3 5 3-1 10h-7Z', '#e8c079') + r(12, 55, 4, 6, '#fff0bd', 'rx="1"') + l('M10 54h8', '#f8e4b2', .8), 'class="lcv3c-ranger-lantern"') + p('m19 45 7-5-2 10Z', '#d2d6af'));
    const feathers = tier(3, g(p('M37 13q5-13 13-10l-2 9-10 6Z', '#a5d3ba') + p('M42 12q5-7 10-6l-2 7-10 5Z', '#e6d49f') + l('M38 17 48 5', '#497b71', .7), 'class="lcv3c-ranger-feather"') + l('M20 57 24 59 22 63m21-6-4 2 2 4', '#e8d39f', 1.1));
    const winds = tier(4, g(l('M3 48q-3-13 7-12m44 16q11-3 7-14M9 61q7 5 12 1', '#bbdfc5', .9, 'opacity=".8"') + p('m31 15 2-6 3 6-3 4Z', '#f1d594') + sparks([[6, 23, 2], [56, 20, 2.5], [57, 62, 1.8]]), 'class="lcv3c-ranger-wind"'));
    const body = e(32, 69, 21, 2.3, '#182f37', 'opacity=".2"') + wings + cloak + face + hat + lantern + feathers + winds + c(32, 49, 2.2, '#e8cf97');
    return `<svg xmlns="http://www.w3.org/2000/svg" class="quest-avatar-art lcv3c-svg lcv3c-avatar" viewBox="0 0 64 72" width="64" height="72" aria-hidden="true" focusable="false" fill="none" stroke="none" data-role="player" data-outfit="${id}" data-skin-slots="avatar">${art(id, g(body, `class="quest-player-growth" data-avatar-stage="${s}"`), 'lcv3c-character')}</svg>`;
  }
  function travelerHat(id, part = 0) {
    if (!has(id, 'avatar')) return '';
    const shapes = ['M145 189l16-30 14-7 19 31 6 6-28-8Z', 'M175 152l19 31 6 6-28-8Z', 'M171 163q9-22 20-17l-4 19-16 6Z'];
    return shapes[Number.isInteger(part) && part >= 0 && part < 3 ? part : 0];
  }

  function windmill(x, y, scale = 1, roof = '#648d83') {
    const building = e(0, 8, 35, 10, '#183a43', 'opacity=".2"') + p('m-25-7 24-11 28 11v22L0 28-25 15Z', '#a8b99e') + p('m0-18 27 11v22L0 28Z', '#658781') + p('M-29-8-2-29 30-8 0 5Z', roof) + p('m-2-29 32 21L0 5Z', '#456a6c') + l('M-29-8 0 5 30-8', '#dece9e', 1.2) + p('m-16 2 8-3v10l-8 3Zm23-4 9 4v10l-9-4Z', '#ecd49d', 'class="lcv3c-light"') + p('M-5 27V14l10 1v12Z', '#345561') + p('m-15-12 4-49h16l8 49L0-7Z', '#b9c3a7') + p('m-11-61 9-15 10 15Z', '#557f79') + p('m-2-76 10 15h-10Z', '#395f64') + p('m-2-61 7 0 8 49L0-7Z', '#79988b');
    const blades = g(g([0, 90, 180, 270].map(angle => g(p('m-2-2 1-28 8 1-3 25Z', '#e4d4ac') + l('M1-4 4-27m-5 7h7m-7 6h6', '#77998a', .7), `transform="rotate(${angle})"`)).join(''), 'class="lcv3c-windmill-rotor"') + c(0, 0, 4, '#c7b37e') + c(0, 0, 1.5, '#f7e4bb'), 'transform="translate(-1 -40)"');
    return g(building + blades, `transform="translate(${x} ${y}) scale(${scale})"`);
  }
  function flowerBed(x, y, scale = 1) {
    return g(p('m-21 0 22-8 22 9-22 8Z', '#467d73') + p('m-21 0v4l22 9 22-8v-4L1 9Z', '#315c61') + [-12, -3, 7, 15].map((v, n) => l(`M${v} 1v-7`, '#b1cb9f', .8) + c(v, -7, 2.6, n%2 ? '#e7c684' : '#dbab9f') + c(v, -7, .8, '#f7e4aa')).join(''), `transform="translate(${x} ${y}) scale(${scale})"`);
  }
  function islandDecoration(id) {
    if (!has(id, 'island')) return '';
    // The camp circle (338,241,r42), the shrine and the foreground path are left clear.
    const water = p('M110 209 153 226 202 237 230 256l-6 7-27-17-47-11-46-18Z', '#406f7b') + l('M111 213 153 231 199 242 225 259', '#a4d5c4', 2.5) + g(l('M113 213 155 232 197 243 222 258', '#e4e2ba', .9, 'stroke-dasharray="2 8"'), 'class="lcv3c-canal-glint"');
    const body = water + windmill(167, 184, .81) + windmill(420, 176, 1.03, '#7a9d91') + windmill(225, 124, .47, '#83a89a') + flowerBed(145, 213, .8) + flowerBed(206, 249, 1) + flowerBed(447, 209, .9) +
      g(l('M361 171q10-14 21-7m46 46q17 10 29 0', '#c1d7a7', 1.2) + p('m357 174 6-6 5 5-6 5Z', '#dfcd9c') + p('m455 209 5-5 4 5-5 4Z', '#c9dea9'), 'class="lcv3c-garden-breeze"') + sparks([[146, 116, 2.2], [437, 85, 2.5], [456, 152, 2]]);
    return art(id, body, 'island-decoration lcv3c-island', `data-island-decoration="${id}" data-camp-clearance="338 241 42" pointer-events="none"`);
  }

  function cloud(x, y, scale = 1, light = '#a6c6c7') {
    return g(p('M-36 8q-12-7-5-15 7-7 17-3 2-19 20-19 15 0 21 15 18-3 23 10 16-2 17 8-1 8-18 8Z', light) + p('M-36 8q45 15 82 0-8 16-39 15-27 0-43-15Z', '#668c9e', 'opacity=".46"'), `transform="translate(${x} ${y}) scale(${scale})"`);
  }
  function airship(scale = 1, tint = '#d9c59e') {
    return g(
      p('M-52-3C-38-29 25-32 50-10L62 0 47 7C14 28-36 18-52-3Z', tint) +
      p('M-52-3q63 14 114 3L47 7C14 28-36 18-52-3Z', '#8eaba7') +
      p('M-52-3C-37-20 29-21 57-1-50-7-80-7-109-2Z', '#f1e0b8', 'opacity=".7"') +
      l('M-31-16q-9 11-2 25M-7-22q-9 21 1 39m25-37q7 15 0 33', '#7d9b98', 1) +
      p('M-49-4-63-19l-1 17 12 7-8 12 15-3Z', '#729a99') +
      l('M-14 16-7 28m27-12-5 12', '#c5c9a8', 1.4) + p('m-13 26 31-1-5 12-22 1Z', '#b18f6e') +
      r(-6, 29, 5, 5, '#eed9a4', 'rx="1"') + r(3, 28, 5, 5, '#eed9a4', 'rx="1"') +
      g(p('m-16 30-10-5v10Z', '#b8d4c7') + l('M-20 30h9', '#e5d3a5', 1), 'class="lcv3c-airship-propeller"') +
      p('M-41-9-35-14-29-9-35-4Z', '#78a99e'), `transform="scale(${scale})" data-vehicle="cloud-airship"`);
  }
  function themePalette(id) {
    return has(id, 'theme') ? ['#173145', '#527b80', '#30465e', '#bbd7c5'] : null;
  }
  const palette = themePalette;
  function themeScene(id) {
    if (!has(id, 'theme')) return '';
    const key = uid('sky');
    const sky = `<defs><linearGradient id="${key}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#243e58"/><stop offset=".58" stop-color="#385d71"/><stop offset="1" stop-color="#183245"/></linearGradient></defs>` + r(0, 0, 590, 350, `url(#${key})`);
    const fleet = g(g(airship(.77), 'transform="translate(145 78)"'), 'class="lcv3c-airship-cruise"') + g(g(airship(.43, '#acc9bf'), 'transform="translate(450 105)"'), 'class="lcv3c-airship-distant"');
    const clouds = g(cloud(49, 71, 1.6, '#6c91a0') + cloud(474, 35, 1.45, '#66879b'), 'class="lcv3c-high-clouds" opacity=".48"') + g(cloud(266, 48, .76, '#c3d4c9') + cloud(350, 133, 1.36, '#6d9aa0') + cloud(552, 165, 1.3, '#81a7ab'), 'class="lcv3c-low-clouds" opacity=".45"');
    return art(id, sky + clouds + fleet + p('M0 273 71 239 142 262 214 224 287 256 361 225 435 263 520 240 590 265v85H0Z', '#2c505c', 'opacity=".57"') + l('M61 178h39m354 2h58M250 95h28', '#b9cec9', 1, 'opacity=".3"'), 'lcv3c-theme-scene', 'pointer-events="none"');
  }
  function themeBackdrop(id) {
    return has(id, 'theme') ? svg(id, themeScene(id), 590, 350, 'shop-scene-backdrop-art lcv3c-theme-backdrop') : '';
  }
  function themeCityScene(id) {
    if (!has(id, 'theme')) return '';
    // A few passing ships in the sky; no foreground border or interactive obstruction.
    const body = g(cloud(123, 73, 1.9, '#81a7aa') + cloud(861, 42, 2.5, '#6b8d9f'), 'class="lcv3c-high-clouds" opacity=".23"') +
      g(g(airship(1.05), 'transform="translate(283 76)"'), 'class="lcv3c-city-ship" opacity=".74"') +
      g(g(airship(.53, '#a4c2bc'), 'transform="translate(958 108)"'), 'class="lcv3c-airship-distant" opacity=".6"') +
      g(cloud(459, 119, 1.6, '#92b7b2') + cloud(1077, 41, 1.35, '#97b9b5'), 'class="lcv3c-low-clouds" opacity=".23"');
    return art(id, body, 'lcv3c-city-theme', 'data-scene-size="1200 720" pointer-events="none"');
  }
  const themeCityDecor = themeCityScene;

  function companion(id) {
    if (!has(id, 'companion')) return '';
    const tail = g(l('M68 69q25 12 20-10', '#be8c5e', 5) + g(p('M87 61q-12-8-6-18 1 7 5 7 6-4 4-12 16 17-3 23Z', '#e8a06b') + p('M87 56q-6-4 0-13 7 11 0 13Z', '#f8df9e'), 'class="lcv3c-lion-tail-flame"'), 'class="lcv3c-lion-tail"');
    const mane = g(p('M24 30 19 16 32 18 34 8 46 14 58 6 65 18 78 17 77 29 88 35 82 45 86 57 73 62 66 75 54 68 43 77 34 66 21 65 21 52 12 44 20 36Z', '#cc8a59') + p('m23 28 4-10 9 10-1-15 13 11 10-13 4 18 13-8-5 19 10 8-12 7 5 14-15-5-10 12-8-14-14 3 1-15-10-8Z', '#efb775') + p('m28 32 10-10 11 6 10-6 11 13-7 9-25 5Z', '#f4d393'), 'class="lcv3c-lion-mane"');
    const body = e(50, 91, 33, 6, '#183346', 'opacity=".24"') + tail + p('M36 61q-13 12-9 26h42q6-14-10-27Z', '#c99d66') + p('M40 64q8 4 15 0l6 23H33Z', '#edc98d') + mane +
      c(31, 35, 8, '#ddad76') + c(66, 35, 8, '#ddad76') + c(31, 35, 4, '#b38264') + c(66, 35, 4, '#b38264') +
      p('M30 36q19-15 38 0l-1 19q-18 19-35 0Z', '#e8c28a') + p('M37 50q11-7 22 0l3 9-13 8-14-8Z', '#f4dfac') +
      c(39, 44, 1.85, '#614f43') + c(59, 44, 1.85, '#614f43') + c(39.5, 43.5, .48, '#fff3d7') + c(59.5, 43.5, .48, '#fff3d7') +
      p('m44 51 5-2 5 2-5 5Z', '#996e52') + l('M49 56v3m0 0q-4 4-7 0m7 0q4 4 7 0', '#996e52', 1) +
      e(34, 86, 9, 5, '#f1d296') + e(64, 86, 9, 5, '#f1d296') + l('M31 84v4m6-4v4m24-4v4m6-4v4', '#c39261', .8) +
      g(p('m49 67-5 7 5 6 5-6Z', '#bf8558') + c(49, 74, 2.6, '#f9e3a0'), 'class="lcv3c-light"') + sparks([[17, 16, 2], [79, 12, 2.3], [10, 66, 1.8]]);
    return art(id, g(body, 'class="lcv3c-lion-breathe" data-creature="lion-cub"'), 'lcv3c-companion', 'pointer-events="none"');
  }
  function relic(id) {
    if (!has(id, 'relic')) return '';
    const pedestal = e(50, 92, 35, 6, '#153043', 'opacity=".23"') + p('m18 80 32-11 33 11-33 14Z', '#759b9a') + p('m18 80v7l32 12 33-12v-7L50 94Z', '#365d6c') + l('M23 88 50 98 77 88', '#b8d7c2', 1);
    const dragonBody = l('M75 44C98 64 70 87 43 76S12 44 25 37q10-5 16 7', '#427c80', 15) + l('M75 44C96 65 68 82 44 73S18 47 27 41q6-5 13 4', '#81bba7', 10) + l('M77 49C88 67 66 80 45 70S22 48 29 44', '#d4dba6', 3.3) +
      p('m82 50 9 2-4 6 5 4-6 7-1 7-9 0-5 7-9-3-8 3-8-5-9-2 1-9-7-8 3-8-1-8 8-5Z', 'none', 'stroke="#b7cf9e" stroke-width="1" opacity=".6"') +
      g(p('M44 44q-3-18 5-23-1 15 9 19l-10 11Z', '#9ac6a4') + l('M48 42q-6-10 0-18', '#e1dbad', 1), 'class="lcv3c-dragon-tail"') +
      p('m36 65-9 8-8-1 5 5 8-1 10-5m31-9 9 4 5-3-2 7-9 1-8-4Z', '#91bea5') + l('m21 74-2 4m5-3-1 5m57-14 3 3m0-5 4 3', '#e2d5a2', .9);
    const head = g(p('M62 21q11-9 18 2l1 14-13 10-14-5 0-11Z', '#92c5ae') + p('m55 33-9 3 3 10 17 1 4-9Z', '#c4d8ad') + p('m69 23 6 3 0 14-6 5-7-2 4-9Z', '#6caa9d') +
      l('M64 24 59 16 63 7m-3 10-6-4m18 9 8-11 5 1m-5-1 2-6', '#e5d7a8', 2) + p('m55 27-12-4 6 12Zm24-1 10-2-6 12Z', '#80b69e') +
      c(61, 32, 1.9, '#315c63') + c(61.5, 31.5, .55, '#eff3d6') + c(48, 39, 1, '#658b73') + l('M49 43q7 3 12-1M51 41q-13-4-15 2m16-1q-11 6-16 0', '#e6d8a9', .95) +
      p('m55 46 2 9 5-9Z', '#c6d7af'), 'class="lcv3c-dragon-head"');
    const pearl = g(c(54, 61, 10, '#f1e5b5') + p('M47 56q8-5 15 5-3 11-13 6 7-1 6-7Z', '#aecbc5') + c(51, 57, 2.5, '#fff3cb') + sparks([[42, 53, 1.5], [66, 59, 1.6]]), 'class="lcv3c-dragon-pearl"');
    return art(id, pedestal + g(dragonBody + pearl + head, 'class="lcv3c-dragon-breathe" data-creature="eastern-dragon"') + sparks([[15, 21, 2], [90, 45, 2]]), 'lcv3c-relic', 'pointer-events="none"');
  }
  const premium = id => has(id, 'companion') ? companion(id) : relic(id);

  function showcaseIsland(id) {
    const palette = has(id, 'theme') ? themePalette(id) : ['#173145', '#527b80', '#30465e', '#b3cfc1'];
    const ground = e(291, 321, 171, 11, '#102231', 'opacity=".22"') + p('M100 207 216 120 346 105 481 184 405 251 267 276 167 239Z', palette[1], `stroke="${palette[3]}" stroke-width="1.1"`) + p('m100 207 67 32 100 37 138-25 76-67-48 69-151 68-85-21Z', palette[2]) + l('M164 218C203 202 214 236 258 220s11-39 47-40 66 26 93-4', '#c5c1ac', 6, 'opacity=".62"');
    const shrine = g(p('m-21 5 23-13 22 13v11L2 29-21 16Z', '#5f8190') + p('m2-53-14 32 14 33 14-32Z', '#aed7cb') + p('m2-53 14 33-14 32Z', '#6b9cab'), 'transform="translate(319 160)"');
    const camp = e(338, 247, 13, 4, '#1f3947') + p('M338 227q-11 12-4 16 10 7 13-1-7 0-5-7Z', '#e3b784') + p('m338 236 0 8 5-3Z', '#f4d598');
    return ground + shrine + (has(id, 'island') ? islandDecoration(id) : '') + camp;
  }
  function preview(id) {
    if (!has(id)) return '';
    const entry = item(id);
    if (entry.slot === 'bar') return svg(id, r(8, 48, 144, 14, barDesign(id).rail, 'rx="7"') + g(barRibbon(id, 'preview'), 'transform="translate(8 48) scale(.24 .58)"') + g(barFigure(id), 'transform="translate(73 28) scale(.9)"'), 160, 112, 'lcv3c-bar-preview');
    if (entry.slot === 'avatar') return svg(id, g(avatar(id, 4), 'transform="translate(44 12) scale(1.1)"'), 160, 112, 'lcv3c-avatar-preview');
    if (entry.slot === 'companion' || entry.slot === 'relic') return svg(id, g(premium(id), 'transform="translate(27 3) scale(1.04)"'));
    if (entry.slot === 'island') return svg(id, g(showcaseIsland(id), 'transform="translate(6 10) scale(.25)"'), 160, 112, 'lcv3c-island-preview');
    return svg(id, g(themeScene(id) + showcaseIsland(id), 'transform="translate(6 10) scale(.25)"'), 160, 112, 'lcv3c-theme-preview');
  }
  return Object.freeze({ entries, has, item, colors, palette, themePalette, preview, premium, companion, relic, islandDecoration, avatar, travelerHat, barDesign, barFigure, barRibbon, themeBackdrop, themeScene, themeCityScene, themeCityDecor });
});
