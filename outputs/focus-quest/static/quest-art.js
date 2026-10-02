(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QuestArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const roles = new Set(['morning', 'afternoon', 'shop', 'player', 'guide']);
  const playerOutfits = new Set(['avatar-default', 'avatar-ranger', 'avatar-voyager', 'avatar-alchemist', 'avatar-star', 'avatar-royal']);
  const palettes = {
    morning: {coat: '#67978b', shade: '#426f69', hat: '#8fb7a1', hatShade: '#5f8979', trim: '#edd3a1', hair: '#746458'},
    afternoon: {coat: '#788fc4', shade: '#526596', hat: '#9fa9d6', hatShade: '#6e7cab', trim: '#d6d7f2', hair: '#57546e'},
    shop: {coat: '#c08c92', shade: '#9b6977', hat: '#d5a1a9', hatShade: '#ad7b8c', trim: '#f0c69d', hair: '#785960'},
    guide: {coat: '#8f9eaf', shade: '#687c95', hat: '#b99bd8', hatShade: '#896bb0', trim: '#e5cff5', hair: '#77657d'},
    player: {coat: '#b69cdd', shade: '#8067b2', hat: '#cdb6eb', hatShade: '#977ec3', trim: '#e8d8f5', hair: '#77718b'},
    'avatar-ranger': {coat: '#6e9c8b', shade: '#416e67', hat: '#adbf91', hatShade: '#668773', trim: '#e4c58e'},
    'avatar-voyager': {coat: '#709caf', shade: '#486d86', hat: '#a7c7d2', hatShade: '#6d94ad', trim: '#f0d9a6'},
    'avatar-alchemist': {coat: '#a08db2', shade: '#68647f', hat: '#c5acd1', hatShade: '#8d789f', trim: '#c0debd'},
    'avatar-star': {coat: '#879fce', shade: '#526992', hat: '#b5c8ec', hatShade: '#7d92bd', trim: '#f2d7a3'},
    'avatar-royal': {coat: '#9b83bb', shade: '#614e80', hat: '#dabf84', hatShade: '#a28960', trim: '#f4dfa5'},
  };
  const star = (x, y, size, color) => `<path d="M${x} ${y - size}l${size * .28} ${size * .72} ${size * .72} ${size * .28}-${size * .72} ${size * .28}-${size * .28} ${size * .72}-${size * .28}-${size * .72}-${size * .72}-${size * .28} ${size * .72}-${size * .28}Z" fill="${color}"/>`;

  function face(palette) {
    return `<path d="M19 34V29c0-10 5-15 13-15s13 5 13 15v5Z" fill="${palette.hair}"/>
      <circle cx="20" cy="36" r="2.3" fill="#c6a38f"/><circle cx="44" cy="36" r="2.3" fill="#c6a38f"/>
      <ellipse cx="32" cy="34.5" rx="11.5" ry="13" fill="#e4c7ad"/>
      <circle cx="27.7" cy="36.6" r="1.25" fill="#4b4458"/><circle cx="36.3" cy="36.6" r="1.25" fill="#4b4458"/>
      <path d="M29 42q3 2.4 6 0" fill="none" stroke="#aa7e79" stroke-width="1.4" stroke-linecap="round"/>`;
  }

  function robe(palette, outfit) {
    const astral = outfit === 'avatar-star';
    return `<ellipse cx="32" cy="68" rx="24" ry="3" fill="#101828" opacity=".3"/>
      <path d="M24 43h16c7 5 10 14 12 25H12c2-11 5-20 12-25Z" fill="${palette.coat}"/>
      <path d="M32 44h8c7 5 10 14 12 25H32Z" fill="${palette.shade}"/>
      <path d="m23 46 9 8 9-8-3-3H26Z" fill="${palette.trim}"/>
      <circle cx="32" cy="54" r="2" fill="${palette.trim}"/>
      ${astral ? star(24, 60, 2, palette.trim) + star(40, 64, 1.8, palette.trim) : ''}
      ${outfit === 'avatar-royal' ? `<path d="m17 53 3 13m27-13-3 13M20 66h24" fill="none" stroke="${palette.trim}" stroke-width="1.6"/>` : ''}`;
  }

  function hat(role, palette, outfit) {
    if (role === 'morning') return `<path d="M21 20h22v9H21Z" fill="${palette.hatShade}"/>
      <path d="m32 9 22 11-22 8-22-8Z" fill="${palette.hat}"/>
      <path d="m32 9 22 11-22 8Z" fill="${palette.hatShade}"/>
      <path d="M50 21v12" fill="none" stroke="${palette.trim}" stroke-width="2" stroke-linecap="round"/>
      <path d="m48 31 2-2 2 2v5h-4Z" fill="${palette.trim}"/>
      <path d="M21 28q11-3 22 0" fill="none" stroke="${palette.trim}" stroke-width="2"/>
      ${star(30, 19, 3, palette.trim)}`;
    if (role === 'afternoon' || outfit === 'avatar-voyager') return `<path d="M19 25c1-11 6-16 13-16s12 5 13 16Z" fill="${palette.hat}"/>
      <path d="M32 9c7 0 12 5 13 16H32Z" fill="${palette.hatShade}"/>
      <path d="M10 25q10 1 14-4l8 4 8-4q4 5 14 4l-7 7H17Z" fill="${palette.hat}" stroke="${palette.trim}" stroke-width="1.3" stroke-linejoin="round"/>
      <circle cx="32" cy="26" r="4.7" fill="${palette.hatShade}"/>
      ${star(32, 26, 3, palette.trim)}`;
    if (role === 'shop') return `<path d="M18 27c0-11 5-18 14-18s14 7 14 18Z" fill="${palette.hat}"/>
      <path d="M32 9c9 0 14 7 14 18H32Z" fill="${palette.hatShade}"/>
      <path d="M18 25q14-5 28 0v5q-14-4-28 0Z" fill="${palette.trim}"/>
      <path d="m43 25 8-3-1 8-5-2Z" fill="${palette.hat}"/>
      <circle cx="23" cy="26" r="2.5" fill="${palette.hatShade}"/>`;
    if (outfit === 'avatar-ranger') return `<path d="M16 31C17 18 23 8 32 5c9 3 15 13 16 26l-7-5-9-7-9 7Z" fill="${palette.hat}"/>
      <path d="M32 5c9 3 15 13 16 26l-7-5-9-7Z" fill="${palette.hatShade}"/>
      <path d="m22 27 10-8 10 8" fill="none" stroke="${palette.trim}" stroke-width="1.6" stroke-linecap="round"/>`;
    if (outfit === 'avatar-royal') return `<path d="M18 27 15 13l10 6 7-13 7 13 10-6-3 14Z" fill="${palette.hat}" stroke="${palette.trim}" stroke-width="1.2"/>
      <path d="M32 6v21h14l3-14-10 6Z" fill="${palette.hatShade}"/>
      <rect x="18" y="25" width="28" height="4" rx="1.5" fill="${palette.trim}"/>
      <path d="m32 16 3 4-3 4-3-4Z" fill="#b19bd8"/>
      <circle cx="15" cy="12" r="1.7" fill="${palette.trim}"/><circle cx="49" cy="12" r="1.7" fill="${palette.trim}"/>`;
    if (outfit === 'avatar-alchemist') return `<path d="M17 27 28 7q4-5 8 0l11 20Z" fill="${palette.hat}"/>
      <path d="M32 4v23h15L36 7q-2-3-4-3Z" fill="${palette.hatShade}"/>
      <ellipse cx="32" cy="28" rx="21" ry="3.8" fill="${palette.hat}" stroke="${palette.trim}" stroke-width="1.3"/>
      <path d="M21 24h22" stroke="${palette.hatShade}" stroke-width="3"/>
      <circle cx="27" cy="24" r="4" fill="#aec6be" stroke="${palette.trim}" stroke-width="1.5"/><circle cx="37" cy="24" r="4" fill="#aec6be" stroke="${palette.trim}" stroke-width="1.5"/>`;
    return `<path d="M16 27 29 5q3-5 6 0l13 22Z" fill="${palette.hat}"/>
      <path d="M32 2v25h16L35 5q-1.5-2.5-3-3Z" fill="${palette.hatShade}"/>
      <ellipse cx="32" cy="28" rx="22" ry="4" fill="${palette.hat}" stroke="${palette.trim}" stroke-width="1.3"/>
      ${star(31, 17, 3.3, palette.trim)}`;
  }

  function prop(role, palette, outfit) {
    if (role === 'morning') return `<rect x="17" y="51" width="30" height="12" rx="2" fill="#ead8b1"/>
      <ellipse cx="17" cy="57" rx="2.7" ry="7" fill="#f6e6c5"/>
      <ellipse cx="47" cy="57" rx="2.7" ry="7" fill="#d3b78b"/>
      <path d="M24 55h14m-14 4h10" stroke="#a69271" stroke-width="1.4" stroke-linecap="round"/>
      <circle cx="15" cy="58" r="2.8" fill="#e4c7ad"/><circle cx="49" cy="58" r="2.8" fill="#e4c7ad"/>`;
    if (role === 'afternoon') return `<path d="m16 51 11-3 11 3 10-3v17l-10 3-11-3-11 3Z" fill="#c9d6e9"/>
      <path d="m27 48 11 3v17l-11-3Z" fill="#a5bbd8"/>
      <path d="m22 59 10-4 11 7" fill="none" stroke="#6a80ad" stroke-width="1.2" stroke-dasharray="2 2"/>
      ${star(32, 55, 3, '#f6e2b6')}
      <circle cx="16" cy="58" r="2.6" fill="#e4c7ad"/><circle cx="48" cy="59" r="2.6" fill="#e4c7ad"/>`;
    if (role === 'shop') return `<path d="M23 49h18l4 19H19Z" fill="#bd8e74"/>
      <path d="M25 56h14v7H25Z" fill="#966b60" stroke="#debba1" stroke-width="1.1"/>
      ${star(32, 59.5, 2.6, '#f5d4aa')}
      <path d="M50 47v17" stroke="#d9b48b" stroke-width="3.5" stroke-linecap="round"/>
      <rect x="43" y="43" width="14" height="7" rx="2" fill="#d9b7ab"/>
      <path d="M43 43h5v7h-5Z" fill="#a7797d"/><circle cx="50" cy="59" r="3" fill="#e4c7ad"/>`;
    if (outfit === 'avatar-ranger') return `<path d="m22 48 17 20" stroke="#bd9e6c" stroke-width="4"/>
      <rect x="34" y="59" width="13" height="9" rx="2.5" fill="#947a5d" stroke="#d9bd8c" stroke-width="1.2"/>
      <path d="M53 43v25" stroke="#b1a078" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M53 45q-9-2-6-9 8 0 6 9Z" fill="#91b88f"/>`;
    if (outfit === 'avatar-voyager') return `<path d="m22 48 18 20" stroke="${palette.trim}" stroke-width="3"/>
      <circle cx="49" cy="58" r="8" fill="#6b87a4" stroke="${palette.trim}" stroke-width="1.6"/>
      <path d="m49 52 3 6-3 6-3-6Z" fill="#e6d3ad"/><circle cx="49" cy="58" r="1.4" fill="#9f86ba"/>`;
    if (outfit === 'avatar-alchemist') return `<path d="M45 48h8v6l4 6q2 7-8 7t-8-7l4-6Z" fill="#baccc1" stroke="#dbe4cd" stroke-width="1.2"/>
      <path d="M42 59q7 3 14 0 4 8-7 8t-7-8Z" fill="#97bca3"/>
      <rect x="44" y="46" width="10" height="4" rx="1" fill="#b39683"/>
      <circle cx="47" cy="60" r="1.4" fill="#e2eed6"/><circle cx="51" cy="63" r="1" fill="#e2eed6"/>`;
    if (outfit === 'avatar-royal') return `<path d="M53 45v23" stroke="${palette.trim}" stroke-width="2.5"/>
      <path d="m53 35 5 7-5 7-5-7Z" fill="#bc9edb" stroke="${palette.trim}" stroke-width="1.2"/>
      <circle cx="53" cy="42" r="1.8" fill="#f0dfae"/>
      <path d="M16 50q-5 8-4 17h7Z" fill="#d0c3dc"/>`;
    return `<path d="M54 46v22" stroke="#c8b18d" stroke-width="2.5" stroke-linecap="round"/>
      <path d="m54 36 4 6-4 6-4-6Z" fill="${palette.trim}"/>
      <path d="m54 36 4 6-4 1Z" fill="#f1e9ff"/>
      <circle cx="54" cy="59" r="2.6" fill="#e4c7ad"/>`;
  }

  function playerGrowth(p, outfit, stage) {
    const ink=p.trim, light=p.hat, shadow=p.shade;
    const motifs={
      'avatar-default': `<path d="M24 49 28 54 24 59 20 54Z" fill="${ink}"/><path d="m24 51 2 3-2 3-2-3Z" fill="${shadow}"/>`,
      'avatar-ranger': `<path d="M20 56q-2-8 9-8 1 9-9 8Z" fill="${ink}"/><path d="m20 57 7-7m-4 3v-3m1 2h3" fill="none" stroke="${shadow}" stroke-width=".9"/>`,
      'avatar-voyager': `<circle cx="24" cy="54" r="5" fill="${shadow}" stroke="${ink}" stroke-width="1.2"/><path d="m24 49 2 5-2 5-2-5Z" fill="${ink}"/><path d="M19 54h10" stroke="${ink}" stroke-width=".7"/>`,
      'avatar-alchemist': `<path d="M22 49h4v4l3 4q-5 4-10 0l3-4Z" fill="${ink}"/><path d="M21 56h6" stroke="${shadow}" stroke-width="1.4"/><circle cx="24" cy="52" r=".8" fill="${shadow}"/>`,
      'avatar-star': star(24,54,5,ink)+`<circle cx="24" cy="54" r="1.5" fill="${shadow}"/><circle cx="19" cy="49" r="1" fill="${ink}"/>`,
      'avatar-royal': `<path d="M19 50q5-3 10 0v6l-5 5-5-5Z" fill="${ink}"/><path d="m21 52 1 3 2-4 2 4 1-3v5h-6Z" fill="${shadow}"/>`,
    };
    // Side panels sit outside the original coat; collars stay below the face.
    const cloaks={
      'avatar-default': `<path d="M18 46 11 50 5 67 16 70 23 57Zm28 0 7 4 6 17-11 3-7-13Z" fill="${shadow}" stroke="${ink}" stroke-width="1.1"/><path d="m11 51 5 16 5-13m32-3-5 16-5-13" fill="none" stroke="${light}" stroke-width="1.5"/><path d="m17 46 7 2-5 5-7-2Zm30 0-7 2 5 5 7-2Z" fill="${ink}"/>`,
      'avatar-ranger': `<path d="M17 46 10 49 5 59 10 59 5 65 14 64 11 70 23 58Zm30 0 7 3 5 10-5 0 5 6-9-1 3 6-12-12Z" fill="${shadow}" stroke="${ink}" stroke-width="1"/><path d="M14 50 11 62m39-12 3 12M18 47l-3 7-4-2m35-5 3 7 4-2" fill="none" stroke="${light}" stroke-width="1.5"/><path d="m17 47 6 2-5 5-4-2Zm30 0-6 2 5 5 4-2Z" fill="${ink}"/>`,
      'avatar-voyager': `<path d="M17 47 10 52 7 69 15 65 20 70 24 57Zm30 0 7 5 3 17-8-4-5 5-4-13Z" fill="${shadow}" stroke="${ink}" stroke-width="1.2"/><path d="m12 54 4 8m36-8-4 8" stroke="${light}" stroke-width="2"/><path d="m16 46 8 3-3 5-9-3Zm32 0-8 3 3 5 9-3Z" fill="${ink}"/><path d="m14 50-1 5m4-4-1 5m34-6 1 5m-4-4 1 5" stroke="${ink}" stroke-width="1.3"/>`,
      'avatar-alchemist': `<path d="M17 47 10 51 6 64 12 70 22 58Zm30 0 7 4 4 13-6 6-10-12Z" fill="${shadow}" stroke="${ink}" stroke-width="1.1"/><path d="m11 54 7 2-7 6 5 3m37-11-7 2 7 6-5 3" fill="none" stroke="${ink}" stroke-width="1"/><path d="m18 46 6 4-6 3-6-2Zm28 0-6 4 6 3 6-2Z" fill="${light}" stroke="${ink}" stroke-width="1"/><circle cx="11" cy="65" r="1.4" fill="${ink}"/><circle cx="53" cy="65" r="1.4" fill="${ink}"/>`,
      'avatar-star': `<path d="M18 46 8 49 4 65 12 61 14 70 24 55Zm28 0 10 3 4 16-8-4-2 9-10-15Z" fill="${shadow}" stroke="${ink}" stroke-width="1.1"/><path d="m10 53 3 6 5-3m36-3-3 6-5-3" fill="none" stroke="${light}" stroke-width="1.4"/>${star(13,56,2.2,ink)}${star(51,56,2.2,ink)}<path d="m18 46 6 3-5 4-7-3Zm28 0-6 3 5 4 7-3Z" fill="${ink}"/>`,
      'avatar-royal': `<path d="M16 47 10 52 5 68q9 3 17-9Zm32 0 6 5 5 16q-9 3-17-9Z" fill="${shadow}" stroke="${ink}" stroke-width="1.6"/><path d="M11 56 9 65l7-3m37-6 2 9-7-3" fill="none" stroke="${ink}" stroke-width="1.1"/><path d="m15 46 10 3-4 6-10-4Zm34 0-10 3 4 6 10-4Z" fill="#eee4d5" stroke="${ink}" stroke-width="1"/><path d="m16 49 1 2m4-1 1 2m26-3-1 2m-4-1-1 2" stroke="${shadow}" stroke-width="1.2"/>`,
    };
    const tools={
      'avatar-default': `<path d="M9 44v25" stroke="${ink}" stroke-width="2.2"/><path d="M9 30 15 38 9 46 3 38Z" fill="${light}" stroke="${ink}" stroke-width="1.2"/><path d="m9 32 0 11 4-5Z" fill="${shadow}"/><path d="M5 48h8m-8 3h8" stroke="${light}" stroke-width="1.3"/><circle cx="9" cy="59" r="2.5" fill="#e4c7ad"/>`,
      'avatar-ranger': `<path d="M9 33q-12 17 0 35" fill="none" stroke="${ink}" stroke-width="2.5"/><path d="M9 33v35M7 52h11" fill="none" stroke="${light}" stroke-width="1"/><path d="m19 52-4-3v6Z" fill="${ink}"/><path d="M8 34q-5-7-3-10 7 2 3 10Z" fill="${light}"/><circle cx="9" cy="57" r="2.5" fill="#e4c7ad"/>`,
      'avatar-voyager': `<path d="m5 43 6-3 10 21-6 3Z" fill="${shadow}" stroke="${ink}" stroke-width="1.3"/><path d="m4 42 8-4 3 6-8 4Zm9 17 9-4 2 5-9 4Z" fill="${ink}"/><path d="m9 46 5 10" stroke="${light}" stroke-width="1.2"/><path d="M6 66q6-4 13 0" fill="none" stroke="${ink}" stroke-width="1"/><circle cx="16" cy="56" r="2.6" fill="#e4c7ad"/>`,
      'avatar-alchemist': `<path d="M4 46q7-4 14 0v17q-7-4-14 0Z" fill="${ink}" stroke="${shadow}" stroke-width="1"/><path d="M6 47q5-2 10 0v12q-5-2-10 0Z" fill="#ede8ce"/><path d="M11 47v12m-3-8h2m2 3h2" stroke="${shadow}" stroke-width=".8"/><path d="m11 35 4 5-4 5-4-5Z" fill="${light}" stroke="${ink}" stroke-width="1"/><circle cx="11" cy="40" r="1.2" fill="${ink}"/><circle cx="15" cy="61" r="2.2" fill="#e4c7ad"/>`,
      'avatar-star': `<path d="M10 49v20" stroke="${ink}" stroke-width="2"/><circle cx="10" cy="41" r="7" fill="${shadow}" stroke="${ink}" stroke-width="1.3"/><ellipse cx="10" cy="41" rx="9" ry="3" fill="none" stroke="${light}" stroke-width="1.1" transform="rotate(-25 10 41)"/>${star(10,41,4.8,ink)}<circle cx="10" cy="59" r="2.4" fill="#e4c7ad"/>`,
      'avatar-royal': `<path d="M9 32 13 39 10 57H8L5 39Z" fill="#e4e1e5" stroke="${ink}" stroke-width="1"/><path d="M9 34v22" stroke="${light}" stroke-width="1.2"/><path d="M3 57h12M9 57v11" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/><circle cx="9" cy="68" r="2.3" fill="${light}"/><circle cx="9" cy="62" r="2.2" fill="#e4c7ad"/>`,
    };
    const crowns={
      'avatar-default': `<path d="m14 22-4-9 10 6-2 6Zm36 0 4-9-10 6 2 6Z" fill="${ink}"/><path d="m13 17 5 5m33-5-5 5" stroke="${light}" stroke-width="1"/>${star(32,12,4,ink)}${star(6,20,2.2,light)}${star(58,20,2.2,light)}`,
      'avatar-ranger': `<path d="M18 20 13 13m3 4-1-8m32 11 5-7m-3 4 1-8" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/><path d="M17 17q-10 0-7-7 8 0 7 7Zm2-5q-6-5-1-9 6 3 1 9Zm28 5q10 0 7-7-8 0-7 7Zm-2-5q6-5 1-9-6 3-1 9Z" fill="${light}" stroke="${ink}" stroke-width=".7"/><path d="m27 15 5-3 5 3-5 3Z" fill="${ink}"/>`,
      'avatar-voyager': `<path d="M16 24q-10-8-4-17 10 5 4 17Zm32 0q10-8 4-17-10 5-4 17Z" fill="${ink}"/><path d="m13 11 3 11m35-11-3 11" stroke="${shadow}" stroke-width="1"/><path d="m25 20 7-3 7 3-7 3Z" fill="${ink}"/><path d="M27 13h10m-5-4v8" stroke="${ink}" stroke-width="1.2"/>${star(7,28,2,light)}${star(57,28,2,light)}`,
      'avatar-alchemist': `<path d="M15 20 10 13 15 9 20 13Zm34 0 5-7-5-4-5 4Z" fill="${light}" stroke="${ink}" stroke-width="1"/><path d="M15 12v5m34-5v5" stroke="${ink}" stroke-width="1.5"/><circle cx="32" cy="14" r="5" fill="${shadow}" stroke="${ink}" stroke-width="1.1"/><path d="m32 10 3 4-3 4-3-4Z" fill="${ink}"/><circle cx="7" cy="26" r="2" fill="${ink}"/><circle cx="57" cy="26" r="2" fill="${ink}"/>`,
      'avatar-star': `<path d="M13 21 11 14 20 16m31 5 2-7-9 2M23 10l9-4 9 4" fill="none" stroke="${ink}" stroke-width="1.3" stroke-linejoin="round"/>${star(12,15,3,ink)}${star(52,15,3,ink)}${star(32,7,3.5,ink)}<circle cx="24" cy="11" r="1.6" fill="${light}"/><circle cx="40" cy="11" r="1.6" fill="${light}"/>${star(5,28,2,light)}${star(59,28,2,light)}`,
      'avatar-royal': `<path d="M17 23 9 17l2-6 7 7m29 5 8-6-2-6-7 7" fill="${ink}" stroke="${light}" stroke-width="1"/><path d="m20 22 5-4m14 0 5 4" stroke="${ink}" stroke-width="2"/><path d="m32 8 3 5-3 4-3-4Z" fill="#f5e7bd"/><circle cx="21" cy="24" r="1.8" fill="#e3b1b7"/><circle cx="43" cy="24" r="1.8" fill="#b7cfe3"/>${star(6,28,2,ink)}${star(58,28,2,ink)}`,
    };
    return [motifs[outfit],cloaks[outfit],tools[outfit],crowns[outfit]].map((geometry,index)=>
      `<g class="quest-avatar-tier quest-avatar-tier-${index+1}" data-avatar-tier="${index+1}" display="${stage>index?'inline':'none'}">${geometry}</g>`).join('');
  }

  function avatar(role, outfit = 'default', stage = 0) {
    role = roles.has(role) ? role : 'guide';
    // NPCs keep their individual character designs, including for old saves.
    outfit = role === 'player' ? (playerOutfits.has(outfit) ? outfit : 'avatar-default') : 'npc-default';
    const palette = {...palettes[role], ...(palettes[outfit] || {})};
    const base=`${robe(palette, outfit)}${face(palette)}${hat(role, palette, outfit)}${prop(role, palette, outfit)}`;
    stage=typeof stage==='number'&&Number.isFinite(stage)?Math.max(0,Math.min(4,Math.floor(stage))):0;
    const artwork=role==='player'?`<g class="quest-player-growth" data-avatar-stage="${stage}">${base}${playerGrowth(palette,outfit,stage)}</g>`:base;
    return `<svg class="quest-avatar-art" viewBox="0 0 64 72" width="64" height="72" aria-hidden="true" focusable="false" data-role="${role}" data-outfit="${outfit}"${role === 'player' ? ' data-skin-slots="avatar"' : ''} xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none">${artwork}</svg>`;
  }

  return {avatar};
});
