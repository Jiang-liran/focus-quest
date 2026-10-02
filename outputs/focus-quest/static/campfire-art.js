(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./quest-art.js'));
  else root.FocusCampfireArt = factory(root.QuestArt);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (questArt) {
  'use strict';

  const characters = new Set(['guide', 'hearth', 'wanderer', 'stargazer']);
  const colors = {
    guide: {coat: '#8f9eaf', shade: '#687c95', hat: '#b99bd8', hatShade: '#896bb0', trim: '#e5cff5', hair: '#77657d'},
    hearth: {coat: '#ac8978', shade: '#7e625e', hat: '#bd9a86', hatShade: '#917162', trim: '#ebc494', hair: '#80645e'},
    wanderer: {coat: '#769b96', shade: '#507975', hat: '#b4b48f', hatShade: '#858d74', trim: '#e4d0a4', hair: '#726963'},
    stargazer: {coat: '#8d91be', shade: '#60658e', hat: '#b0add5', hatShade: '#827fab', trim: '#eadbb1', hair: '#68647e'},
  };
  const star = (x, y, r, color, extra = '') => `<path ${extra} d="M${x} ${y-r}l${r*.3} ${r*.7} ${r*.7} ${r*.3}-${r*.7} ${r*.3}-${r*.3} ${r*.7}-${r*.3}-${r*.7}-${r*.7}-${r*.3} ${r*.7}-${r*.3}Z" fill="${color}"/>`;

  function body(p) {
    return `<ellipse cx="32" cy="68" rx="24" ry="3" fill="#101828" opacity=".3"/>
      <path d="M24 43h16c7 5 10 14 12 25H12c2-11 5-20 12-25Z" fill="${p.coat}"/>
      <path d="M32 44h8c7 5 10 14 12 25H32Z" fill="${p.shade}"/>
      <path d="m23 46 9 8 9-8-3-3H26Z" fill="${p.trim}"/>`;
  }

  function face(p, character) {
    return `<path d="M19 34V29c0-10 5-15 13-15s13 5 13 15v5Z" fill="${p.hair}"/>
      ${character === 'hearth' ? `<path d="M20 29q-7 13 1 19l6-3V29m17 0q7 13-1 19l-6-3V29" fill="${p.hair}"/>` : ''}
      <circle cx="20" cy="36" r="2.3" fill="#c6a38f"/><circle cx="44" cy="36" r="2.3" fill="#c6a38f"/>
      <ellipse cx="32" cy="34.5" rx="11.5" ry="13" fill="#e4c7ad"/>
      <circle cx="27.7" cy="36.6" r="1.25" fill="#4b4458"/><circle cx="36.3" cy="36.6" r="1.25" fill="#4b4458"/>
      <ellipse cx="24.4" cy="40" rx="2.1" ry="1.1" fill="#cf9f94" opacity=".55"/>
      <ellipse cx="39.6" cy="40" rx="2.1" ry="1.1" fill="#cf9f94" opacity=".55"/>
      <path d="M29 42q3 2.4 6 0" fill="none" stroke="#aa7e79" stroke-width="1.4" stroke-linecap="round"/>`;
  }

  function headwear(p, character) {
    // Every brim ends above y=32; the eyes stay clear at y=36.6.
    if (character === 'hearth') return `<path d="M19 26c0-10 4-15 13-15s13 5 13 15Z" fill="${p.hat}"/>
      <path d="M32 11c9 0 13 5 13 15H32Z" fill="${p.hatShade}"/>
      <path d="M25 13q-3 5-2 11m9-12v12m7-10q3 4 2 10" fill="none" stroke="${p.trim}" stroke-width="1.2" opacity=".6"/>
      <rect x="18" y="24" width="28" height="6" rx="2.6" fill="${p.trim}"/>
      <path d="M23 26v2m5-2v2m5-2v2m5-2v2m5-2v2" stroke="${p.hatShade}" stroke-width="1.1" stroke-linecap="round"/>
      <circle cx="32" cy="9" r="4" fill="${p.trim}"/>`;
    if (character === 'wanderer') return `<path d="M18 27 23 13q2-3 5-1l4 3 5-3q3-2 5 2l4 13Z" fill="${p.hat}"/>
      <path d="m32 15 5-3q3-2 5 2l4 13H32Z" fill="${p.hatShade}"/>
      <path d="M19 23q13 4 26 0l1 4H18Z" fill="${p.trim}"/>
      <ellipse cx="32" cy="28" rx="23" ry="3.4" fill="${p.hat}" stroke="${p.hatShade}" stroke-width="1.3"/>
      <path d="M41 23q2-9 8-12-1 8-8 12Z" fill="${p.trim}"/>
      <path d="m42 22 5-7" stroke="${p.hatShade}" stroke-width=".8"/>`;
    if (character === 'stargazer') return `<path d="M18 27 26 7q2-4 5-3l10 5-7 2 13 16Z" fill="${p.hat}"/>
      <path d="m31 4 10 5-7 2 13 16H32Z" fill="${p.hatShade}"/>
      <ellipse cx="32" cy="28" rx="22" ry="3.5" fill="${p.hat}" stroke="${p.trim}" stroke-width="1.2"/>
      <path d="M32 13a5 5 0 1 0 3 8 5 5 0 0 1-3-8Z" fill="${p.trim}"/>
      <path d="M46 28v8" stroke="${p.trim}" stroke-width="1"/>
      ${star(46, 37, 2.5, p.trim)}`;
    return `<path d="M16 27 29 5q3-5 6 0l13 22Z" fill="${p.hat}"/>
      <path d="M32 2v25h16L35 5q-1.5-2.5-3-3Z" fill="${p.hatShade}"/>
      <ellipse cx="32" cy="28" rx="22" ry="4" fill="${p.hat}" stroke="${p.trim}" stroke-width="1.3"/>
      ${star(31, 17, 3.3, p.trim)}`;
  }

  function belongings(p, character) {
    if (character === 'hearth') return `<path d="M21 45q11 6 22 0l1 6q-12 6-24 0Z" fill="${p.trim}"/>
      <path d="m37 51 6 0 1 12-6-1Z" fill="${p.trim}"/>
      <path d="m39 59 4 1m-4-4 4 1" stroke="${p.hatShade}" stroke-width="1"/>
      <path d="M38 56h4a4 4 0 0 1 0 8h-4" fill="none" stroke="#e9d4b3" stroke-width="2.8"/>
      <path d="M23 55h16v8q-1 5-8 5t-8-5Z" fill="#e9d4b3"/>
      <ellipse cx="31" cy="55" rx="8" ry="2.1" fill="#b08773"/>
      <path d="M27 50q-2-2 0-4m7 5q-2-2 0-4" fill="none" stroke="#f1dec1" stroke-width="1.2" stroke-linecap="round" opacity=".75"/>
      <circle cx="23" cy="61" r="2.6" fill="#e4c7ad"/><circle cx="40" cy="61" r="2.6" fill="#e4c7ad"/>`;
    if (character === 'wanderer') return `<path d="m22 46 22 20" stroke="${p.trim}" stroke-width="3.4"/>
      <path d="M20 53q6-3 12 0 6-3 12 0v14q-6-3-12 0-6-3-12 0Z" fill="#e8d8b8" stroke="#b49b7c" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M32 53v14" stroke="#b49b7c" stroke-width="1"/>
      <path d="m24 57 4-.3m-4 3 4-.3m8-3.1 4 .3m-4 3.1 4 .3" stroke="#a48e7b" stroke-width="1" stroke-linecap="round"/>
      <path d="m45 54 5-8" stroke="${p.trim}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="20" cy="61" r="2.5" fill="#e4c7ad"/><circle cx="44" cy="61" r="2.5" fill="#e4c7ad"/>`;
    if (character === 'stargazer') return `<path d="M31 61 27 68m7-7 6 7" stroke="${p.trim}" stroke-width="1.7" stroke-linecap="round"/>
      <g transform="rotate(-18 37 57)"><rect x="20" y="53" width="30" height="9" rx="2" fill="#b4a1bb"/>
      <rect x="20" y="54" width="9" height="7" rx="1.4" fill="#807b9e"/>
      <rect x="29" y="52" width="4" height="11" rx="1" fill="${p.trim}"/>
      <rect x="46" y="50" width="7" height="15" rx="2" fill="${p.trim}"/>
      <ellipse cx="52.5" cy="57.5" rx="2.6" ry="6" fill="#839da9"/>
      <path d="M51 54q2-2 2 1" fill="none" stroke="#d7e6d8" stroke-width="1.1" stroke-linecap="round"/></g>
      <circle cx="25" cy="62" r="2.6" fill="#e4c7ad"/><circle cx="39" cy="60" r="2.6" fill="#e4c7ad"/>`;
    return `<path d="M53 47v21" stroke="#c8b18d" stroke-width="2.4" stroke-linecap="round"/>
      <path d="m53 37 4 6-4 6-4-6Z" fill="${p.trim}"/>
      <circle cx="53" cy="59" r="2.6" fill="#e4c7ad"/>`;
  }

  function avatar(characterId, outfit = 'npc-default') {
    const character = characters.has(characterId) ? characterId : 'guide';
    outfit = 'npc-default'; // Old NPC clothing selections no longer change characters.
    if (character === 'guide' && questArt && typeof questArt.avatar === 'function') {
      return questArt.avatar('guide', outfit)
        .replace('class="quest-avatar-art"', 'class="quest-avatar-art campfire-avatar-art"')
        .replace('data-role="guide"', 'data-role="guide" data-character="guide"');
    }
    const palette = colors[character];
    return `<svg class="quest-avatar-art campfire-avatar-art" viewBox="0 0 64 72" width="64" height="72" aria-hidden="true" focusable="false" data-character="${character}" data-outfit="${outfit}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none">${body(palette)}${face(palette, character)}${headwear(palette, character)}${belongings(palette, character)}</svg>`;
  }

  function pine(x, y, scale, color) {
    return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}"><path d="M-2-5h4v14h-4Z"/><path d="m0-53 12 19H7l12 20h-9L25 4h-50l15-18h-9l12-20h-5Z"/></g>`;
  }

  function scene() {
    const stars = [[45,31,1.4],[88,61,2],[130,24,1],[190,49,2.4],[245,30,1.4],[288,70,1],[341,28,2.2],[390,51,1.3],[440,24,1.8],[482,78,1.1],[577,28,1.1],[613,68,2.2],[563,101,1.1]];
    return `<svg class="campfire-scene-art" viewBox="0 0 660 240" data-skin-slots="camp fire tent campgear campglow" width="660" height="240" role="img" aria-label="月光下的营地，帐篷与木桩围着一簇温暖的篝火" focusable="false" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none">
      <title>星岛篝火夜话</title>
      <rect width="660" height="240" rx="22" fill="#191d32"/>
      <path d="M0 110Q150 71 330 101T660 83v135H0Z" fill="#20253c"/>
      <path d="m0 141 54-38 36 17 67-68 44 61 43-25 53 55 73-57 51 31 52-50 57 67 55-24 75 39v54H0Z" fill="#2a3048"/>
      <path d="m128 83 29-31 25 35-25-12Z" fill="#53566b" opacity=".55"/>
      <path d="m443 99 30-32 25 30-23-12Z" fill="#525b70" opacity=".45"/>
      <path d="M0 173q108-47 208-10 115-62 223-13 102-31 229 12v66H0Z" fill="#2c3948"/>
      <circle cx="535" cy="48" r="28" fill="#d6d0b5" opacity=".035"/>
      <circle cx="535" cy="48" r="21" fill="#d6d0b5" opacity=".055"/>
      <path d="M542 31a18 18 0 1 0 8 29 19 19 0 0 1-8-29Z" fill="#d9d2b7"/>
      ${stars.map(([x,y,r], i) => star(x,y,r,'#d8d4bd',`class="campfire-star" opacity="${i%3===0?'.75':'.42'}" style="--star-delay:-${i%5}s"`)).join('')}
      <path d="m340 65 24 9 20-13 13 21" stroke="#bab6d1" stroke-width=".7" opacity=".2"/>
      <g fill="#b8b4cc" opacity=".55"><circle cx="340" cy="65" r="1.2"/><circle cx="364" cy="74" r="1.4"/><circle cx="384" cy="61" r="1.3"/><circle cx="397" cy="82" r="1.1"/></g>
      ${pine(42,172,1.18,'#263846')}${pine(78,169,.77,'#314553')}${pine(573,169,1.24,'#263a46')}${pine(615,180,1.5,'#233642')}${pine(489,158,.59,'#344655')}
      <path d="M0 194q89-27 155-12 134-27 242-7 127-7 263 18v25a22 22 0 0 1-22 22H22a22 22 0 0 1-22-22Z" fill="#35424b"/>
      <path d="M0 218q138-34 285-14 182 16 375-1v15a22 22 0 0 1-22 22H22a22 22 0 0 1-22-22Z" fill="#303b46"/>
      <path d="M276 239q19-25 53-25t61 25" fill="#4d494c" opacity=".5"/>
      <g class="campfire-tent" data-skin-slots="tent"><ellipse cx="166" cy="194" rx="75" ry="8" fill="#1c2735" opacity=".4"/>
      <path d="m114 188 47-79 67 75-40 11Z" fill="#9b99b4"/>
      <path d="m161 109 67 75-40 11Z" fill="#737c9a"/>
      <path d="m114 188 47-79 27 86Z" fill="#bbb0bb"/>
      <path d="m134 190 27-61 16 64Z" fill="#3e415b"/>
      <path d="m152 193 9-64 16 64Z" fill="#d1ab84" opacity=".35"/>
      <path d="m107 190 54-84 71 79" stroke="#d5c6bb" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="m161 111-67 82m113-32 40 33" stroke="#abb1a8" stroke-width="1" opacity=".6"/>
      <path d="m92 188 2 8m151-5 2 7" stroke="#b8a08d" stroke-width="2" stroke-linecap="round"/>
      <path d="M161 104v10" stroke="#b8a08d" stroke-width="2.2" stroke-linecap="round"/></g>
      <g class="campfire-lantern" data-skin-slots="fire"><path d="M220 186v-22q0-5 5-5t5 5v22" stroke="#b9a387" stroke-width="1.5"/>
      <circle cx="225" cy="181" r="14" fill="#e4b477" opacity=".055"/>
      <path d="m218 176 7-5 7 5v15h-14Z" fill="#a9927f"/>
      <rect x="220" y="178" width="10" height="10" rx="1.5" fill="#e8c08b"/>
      <path d="M225 178v10m-7 2h14" stroke="#9a8071" stroke-width="1.1"/></g>
      <ellipse class="campfire-glow" data-skin-slots="fire" cx="331" cy="197" rx="92" ry="28" fill="#e7a171" opacity=".045"/>
      <ellipse class="campfire-glow" data-skin-slots="fire" cx="331" cy="198" rx="67" ry="20" fill="#e7a171" opacity=".065"/>
      <ellipse cx="331" cy="199" rx="45" ry="11" fill="#e7a171" opacity=".09"/>
      <g class="campfire-stumps" data-skin-slots="campgear"><ellipse cx="257" cy="211" rx="23" ry="5" fill="#1f2b36" opacity=".4"/>
      <path d="M239 188h33v20q-15 9-33 0Z" fill="#786c65"/>
      <path d="M258 188h14v20q-7 4-14 4Z" fill="#5d5960"/>
      <ellipse cx="255.5" cy="188" rx="16.5" ry="5.3" fill="#a5927e"/>
      <ellipse cx="255.5" cy="188" rx="9" ry="2.9" stroke="#7e746a" stroke-width="1"/>
      <path d="m247 195-1 9m13-10v12m8-10-1 8" stroke="#a38a75" stroke-width="1.2" opacity=".65"/>
      <ellipse cx="412" cy="212" rx="28" ry="5" fill="#1f2b36" opacity=".4"/>
      <path d="M390 188h42v20q-21 9-42 0Z" fill="#7c6e64"/>
      <path d="M414 188h18v20q-9 4-18 4Z" fill="#60595c"/>
      <ellipse cx="411" cy="188" rx="21" ry="6" fill="#a48e78"/>
      <ellipse cx="411" cy="188" rx="12" ry="3.5" stroke="#7d6e65" stroke-width="1"/>
      <path d="m398 196 1 9m9-10v10m14-8-1 8" stroke="#ac9075" stroke-width="1.2" opacity=".6"/></g>
      <g class="campfire-stones" data-skin-slots="fire" fill="#8c8781"><ellipse cx="307" cy="197" rx="7" ry="4.5"/><ellipse cx="318" cy="202" rx="7" ry="4"/><ellipse cx="332" cy="203" rx="7.5" ry="4.2"/><ellipse cx="347" cy="200" rx="7" ry="4.3"/><ellipse cx="355" cy="194" rx="5.7" ry="4.2"/></g>
      <path data-skin-slots="fire" d="m314 185 32 13m-34 0 33-14" stroke="#635651" stroke-width="7" stroke-linecap="round"/>
      <path data-skin-slots="fire" d="m314 185 30 12m-30 0 29-12" stroke="#9b7860" stroke-width="1.4" stroke-linecap="round"/>
      <g class="campfire-flame" data-skin-slots="fire"><path d="M329 137c3 16 17 19 16 33 7-3 6-9 5-13 13 18 9 39-17 40-25 1-32-14-25-28 1 7 5 9 7 10-3-15 8-23 14-42Z" fill="#c98070"/>
      <path d="M330 151c1 13 12 18 11 28 3-1 5-3 6-6 7 14 0 23-14 24-15 1-23-9-17-19 1 4 4 5 6 5-2-13 5-20 8-32Z" fill="#e6ad79"/>
      <path d="M331 172c0 8 8 10 8 17 2-1 3-3 3-4 4 9-4 13-10 13-8 0-12-5-8-11 0 4 3 4 4 5-3-9 2-13 3-20Z" fill="#f4d5a0"/></g>
      <g class="campfire-embers" data-skin-slots="fire" fill="#e9ba85"><circle class="campfire-ember" cx="319" cy="153" r="1.7" style="--ember-delay:0s"/><circle class="campfire-ember" cx="341" cy="132" r="1.4" style="--ember-delay:-1.1s"/><circle class="campfire-ember" cx="323" cy="119" r="1" style="--ember-delay:-2.3s"/><circle class="campfire-ember" cx="347" cy="159" r="1.2" style="--ember-delay:-.7s"/><circle class="campfire-ember" cx="333" cy="104" r=".9" style="--ember-delay:-1.7s"/></g>
      <g stroke="#65796e" stroke-width="1.5" stroke-linecap="round"><path d="m70 207-3-6m3 6 4-8m-4 8v-9m458 2-2-5m2 5 4-7m-4 7v-9m69 34-2-6m2 6 4-8m-4 8v-9"/></g>
      <g fill="#788c81" opacity=".6"><ellipse cx="197" cy="216" rx="3" ry="1.3"/><ellipse cx="473" cy="214" rx="4" ry="1.2"/><ellipse cx="109" cy="215" rx="2.5" ry="1"/><ellipse cx="556" cy="199" rx="3.4" ry="1.3"/></g>
    </svg>`;
  }

  return {avatar, scene};
});
