(function (root, factory) {
  const api = factory(root, typeof module === 'object' && module.exports ? require('./quest-art.js') : null, typeof module === 'object' && module.exports ? require('./camp-world-art.js') : null, typeof module === 'object' && module.exports ? require('./interface-themes.js') : null, typeof module === 'object' && module.exports ? require('./progress-bars.js') : null);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShopArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, nodeArt, nodeCampArt, nodeInterfaceThemes, nodeProgressBars) {
  'use strict';

  const inventory = {
    archipelago: ['default','harbor','starglass'],
    homeland: ['default','harbor','starglass'],
    bar: ['default', 'mint', 'aurora', 'comet', 'tide', 'prism', 'koi', 'fox', 'whale', 'dragon'],
    fx: ['default', 'fireflies', 'petals', 'snow', 'meteor', 'nebula'],
    avatar: ['default', 'ranger', 'voyager', 'alchemist', 'star', 'royal'],
    banner: ['default', 'leaf', 'parchment', 'obsidian', 'celestial', 'sovereign'],
    theme: ['default', 'forest', 'ocean', 'sakura', 'aurora'],
    companion: ['default', 'fox', 'owl', 'whale', 'dragon'],
    relic: ['default', 'lotus', 'orrery', 'hourglass'],
    portal: ['default', 'moon', 'archive', 'cosmos'],
    island: ['default', 'lanterns', 'garden', 'pavilion', 'supplies', 'banners', 'fountain', 'library', 'observatory', 'arcade', 'palace'],
  };
  const expansion=typeof module==='object'&&module.exports?require('./shop-expansion.js'):root.FocusShopExpansion;
  const architecture=typeof module==='object'&&module.exports?require('./island-architecture.js'):root.FocusIslandArchitecture;
  for(const [slot,entries] of Object.entries(architecture?.inventory||{}))if(slot.startsWith('campus'))inventory[slot]=entries.map(item=>item.id.slice(slot.length+1));
  const companionLife=typeof module==='object'&&module.exports?require('./companion-life.js'):root.FocusCompanionLife;
  const islandEffects=typeof module==='object'&&module.exports?require('./island-effects.js'):root.FocusIslandEffects;
  for(const entry of expansion?.entries||[])if(inventory[entry.slot])inventory[entry.slot].push(entry.id.slice(entry.id.indexOf('-')+1));
  const items = new Map(Object.entries(inventory).flatMap(([slot, variants]) => variants.map(variant => [`${slot}-${variant}`, {slot, variant}])));
  const cache = new WeakMap();
  const originalHats = new WeakMap();
  const sparkle = (x, y, r = 3, color = '#e5d6f3') => `<path d="M${x} ${y-r}l${r*.28} ${r*.72} ${r*.72} ${r*.28}-${r*.72} ${r*.28}-${r*.28} ${r*.72}-${r*.28}-${r*.72}-${r*.72}-${r*.28} ${r*.72}-${r*.28}Z" fill="${color}"/>`;
  const shadow = '<ellipse cx="50" cy="87" rx="31" ry="5" fill="#11192a" opacity=".28"/>';
  const empty = `<circle cx="50" cy="49" r="26" fill="#24293b" stroke="#807395" stroke-width="1.2" stroke-dasharray="2 5"/>${sparkle(50,49,9,'#9a8bb7')}<path d="M34 85h32" stroke="#807395" stroke-width="1.2" stroke-linecap="round"/>`;

  const companions = {
    default: empty,
    fox: `${shadow}<g class="shop-pet-breathe"><path d="M48 78C14 91 5 67 17 50c-3 19 14 14 27 11Z" fill="#c38e74"/><path d="M18 50c-3 12 3 16 10 18-10 2-17-2-13-12Z" fill="#eee0be"/><path d="M34 56q16-11 30 1l9 24H27Z" fill="#bd896f"/><path d="M42 56h16l4 25H36Z" fill="#ead8b8"/><path d="m30 34 1-23 16 15m8 0 16-15 1 23" fill="#c99a7a"/><path d="m34 27 1-10 8 11m16 0 8-11 1 10" fill="#e4bea6"/><path d="M29 34q21-20 43 0l-5 21-17 9-16-9Z" fill="#cd9c79"/><path d="M32 40q9 6 18 6 9 0 19-6l-2 14-17 10-16-10Z" fill="#f0dfc2"/><path d="m46 48 4-3 4 3-4 4Z" fill="#594956"/><path d="M39 39q3-3 6 0m10 0q3-3 6 0" fill="none" stroke="#614e59" stroke-width="2" stroke-linecap="round"/><path d="M42 70v11m15-11v11" stroke="#b7927d" stroke-width="1.8" stroke-linecap="round"/></g>`,
    owl: `${shadow}<g class="shop-pet-breathe"><path d="m26 35 2-20 17 11h10l17-11 2 20" fill="#8f86b3"/><ellipse cx="50" cy="56" rx="27" ry="30" fill="#8f86b3"/><path d="M26 44q-11 23 11 34l3-23m34-11q11 23-11 34l-3-23" fill="#6c668d"/><ellipse cx="50" cy="62" rx="16" ry="22" fill="#c9bcd7"/><circle cx="39" cy="43" r="11" fill="#e5d9dc"/><circle cx="61" cy="43" r="11" fill="#e5d9dc"/><circle cx="40" cy="43" r="3.5" fill="#514b66"/><circle cx="60" cy="43" r="3.5" fill="#514b66"/><circle cx="41" cy="42" r="1" fill="#faf0dc"/><circle cx="61" cy="42" r="1" fill="#faf0dc"/><path d="m46 50 4-2 4 2-4 6Z" fill="#d1b58a"/><path d="m42 63 3 3 3-3m4 0 3 3 3-3m-13 9 3 3 3-3" fill="none" stroke="#9f91b6" stroke-width="1.5" stroke-linecap="round"/><path d="M38 85h8m8 0h8" stroke="#d6bc94" stroke-width="3" stroke-linecap="round"/>${sparkle(50,25,4,'#edd6a5')}</g>`,
    whale: `${shadow}<g class="shop-pet-breathe" data-creature="bay-manatee"><path d="M69 64q30-12 25 10-7 20-29 8Z" fill="#879e9d"/><path d="M81 68q15-5 13 6-7 10-18 9Z" fill="#a9b8aa"/><ellipse cx="51" cy="64" rx="31" ry="22" fill="#a7b8ad"/><ellipse cx="32" cy="48" rx="25" ry="24" fill="#b8c7b8"/><path d="M38 57q-14 9-7 27 13 0 16-21Z" fill="#839f9f"/><path d="M62 65q4 15 13 17 4-11-5-19Z" fill="#91aca6"/><ellipse cx="24" cy="58" rx="18" ry="12" fill="#d4dac5"/><ellipse cx="14" cy="56" rx="6" ry="7" fill="#c0ccb9"/><ellipse cx="33" cy="56" rx="6" ry="7" fill="#c0ccb9"/><circle cx="24" cy="39" r="1.9" fill="#415e60"/><circle cx="24.5" cy="38.5" r=".5" fill="#eef0d8"/><circle cx="15" cy="53" r="1.05" fill="#7b9390"/><circle cx="29" cy="53" r="1.05" fill="#7b9390"/><path d="M15 62q8 3 15-1M11 59 4 57m8 6-6 2m26-6 6-2m-7 6 6 1" fill="none" stroke="#91a394" stroke-width="1" stroke-linecap="round"/><path d="M45 72q12 5 19 0" fill="none" stroke="#93aaa1" stroke-width="1.1" stroke-linecap="round"/></g>`,
    dragon: `${shadow}<g class="shop-pet-breathe" data-creature="moss-lizard"><path d="M63 65q30-1 29-26 13 33-26 42Z" fill="#789787"/><path d="M69 68q20-4 23-20" fill="none" stroke="#adbe96" stroke-width="2" stroke-linecap="round"/><path d="m38 61-16 15-9 1 3 7 15-1 16-13m15-7 15 16-1 6-13-5-13-13Z" fill="#86a28c"/><path d="m35 75-8 12 5 4 11-14m16-5 10 14 9-2-11-13Z" fill="#6a8c80"/><ellipse cx="51" cy="62" rx="25" ry="17" fill="#9cb798"/><path d="m31 55 11-12 7 12 8-15 9 16 8-9 4 13-17-3-13 2Z" fill="#bdd0a3"/><g class="pet-life-head"><path d="M10 51q1-22 23-21 19 4 14 21-7 20-28 14Z" fill="#9fb99a"/><path d="M10 51q10 9 29 1-2 12-14 13-12-1-15-14Z" fill="#cfdbb3"/><circle cx="25" cy="42" r="2.1" fill="#3d6258"/><circle cx="25.5" cy="41.4" r=".6" fill="#edf0d2"/><circle cx="12" cy="52" r="1" fill="#718f7a"/><path d="M14 58q8 3 16-1" fill="none" stroke="#799580" stroke-width="1.1" stroke-linecap="round"/></g><path d="m16 81-5 4m8-3-3 5m58-7 5 2m-6 0 4 5m-43 2-1 4m37-6 3 4" stroke="#b1c6a4" fill="none" stroke-width="1.4" stroke-linecap="round"/></g>`,
  };
  const relics = {
    default: `${shadow}<ellipse cx="50" cy="83" rx="25" ry="7" fill="#7d709e"/><path d="m50 13 23 32-23 34-23-34Z" fill="#b5a0e4"/><path d="m50 13 3 33-26-1Z" fill="#ddd1ef"/><path d="m53 46-3 33 23-34Z" fill="#917fbd"/><path d="M50 13 73 45l-20 1Z" fill="#9680c6"/>`,
    lotus: `${shadow}<ellipse cx="50" cy="83" rx="25" ry="7" fill="#8d7d9b"/><ellipse cx="50" cy="80" rx="25" ry="6" fill="#c8b0c2"/><path d="M50 48v30" stroke="#ab9db5" stroke-width="4"/><path d="M50 71Q25 78 23 66q14-5 27 5m0 0q25 7 27-5-14-5-27 5" fill="#8db3a5"/><g class="shop-gentle-float"><path d="M50 60Q16 57 12 33q28 0 38 27m0 0q34-3 38-27-28 0-38 27" fill="#b394bd"/><path d="M50 60Q25 48 30 21q23 13 20 39m0 0q25-12 20-39-23 13-20 39" fill="#d1b0cc"/><path d="M50 59Q30 35 50 9q20 26 0 50Z" fill="#eed6dc"/><path d="M50 56Q39 41 50 25q11 16 0 31Z" fill="#f3dfbe"/>${sparkle(50,47,4,'#fff1d5')}</g>`,
    orrery: `${shadow}<g data-object="brass-sundial"><path d="m17 67 34-15 32 15v14L50 93 17 81Z" fill="#797566"/><path d="m17 67 33 13 33-13-32-15Z" fill="#b4a381"/><ellipse cx="50" cy="58" rx="35" ry="21" fill="#cbbb93"/><path d="M15 58v7q35 40 70 0v-7q-35 36-70 0Z" fill="#958368"/><ellipse cx="50" cy="58" rx="30" ry="17" fill="#a68f6d" stroke="#e3d2a7" stroke-width="1.3"/><path d="M24 54 28 56m-5 7 5-1m5 11 3-3m14 7v-4m16 0-3-3m14-7-5-1m5-8-5 2m-6-13-3 4m-14-7v5m-15-3 3 4" fill="none" stroke="#ead9ad" stroke-width="1.6" stroke-linecap="round"/><path d="m49 58 18 6-3 5-17-8Z" fill="#665f56" opacity=".62"/><path d="M48 60 48 24l16 35Z" fill="#d9c49b"/><path d="M48 24 53 60 64 59Z" fill="#948268"/><path d="M29 61q19 13 43-1" fill="none" stroke="#d3bd90" stroke-width=".8"/><circle cx="49" cy="60" r="2" fill="#f0dbad"/></g>`,
    hourglass: `${shadow}<path d="M27 19v62m46-62v62" stroke="#a58c75" stroke-width="4"/><rect x="23" y="13" width="54" height="8" rx="3" fill="#d8b99a"/><rect x="23" y="79" width="54" height="8" rx="3" fill="#d8b99a"/><path d="M34 22h32q1 17-13 27 14 10 13 29H34q-1-19 13-29-14-10-13-27Z" fill="#889da9" opacity=".6" stroke="#d5d9cf" stroke-width="1.5"/><path d="M37 29h26q-2 11-13 17-11-6-13-17Zm13 28 13 18H37Z" fill="#ead5ab"/><path class="shop-sand-fall" d="M50 47v15" stroke="#f3e0b6" stroke-width="1.3" stroke-dasharray="1.5 3"/><path d="M37 26q1 9 5 12m-4 32 4-7" fill="none" stroke="#e3e7dd" stroke-width="1.5" stroke-linecap="round"/>`,
  };
  const portals = {
    default: empty,
    moon: `${shadow}<path d="M23 84h54l7 6H16Z" fill="#75819c"/><path d="M30 78h40l6 6H24Z" fill="#a6b5c6"/><circle cx="50" cy="45" r="32" fill="#28354d" stroke="#aebbd3" stroke-width="4"/><circle cx="50" cy="45" r="26" fill="#334360" stroke="#7387ad" stroke-width="1"/><path d="M62 20c-26 0-37 31-17 48-29-5-30-44-4-54q11-3 21 6Z" fill="#d7d6cd"/><g class="shop-portal-glimmer">${sparkle(60,37,5,'#dde3e9')}${sparkle(50,55,3,'#bbcce2')}<circle cx="68" cy="55" r="1.5" fill="#dce4ee"/></g>`,
    archive: `${shadow}<path d="M17 82h66l5 7H12Z" fill="#8a7474"/><path d="M28 76h44l7 6H21Z" fill="#c4ad93"/><path d="M24 80V34q26-29 52 0v46Z" fill="#3e354b" stroke="#c7ad91" stroke-width="4"/><rect x="18" y="31" width="12" height="50" rx="2" fill="#ad8f7c"/><rect x="70" y="31" width="12" height="50" rx="2" fill="#ad8f7c"/><path d="M17 44h14m-14 19h14m38-19h14M69 63h14" stroke="#dfc8a8" stroke-width="2"/><path d="M23 14q15-5 27 3 12-8 27-3v17q-15-5-27 3-12-8-27-3Z" fill="#e2ceb2"/><path d="M50 17v17m-19-14 12 2m-12 4 12 2m14-6 12-2m-12 8 12-2" stroke="#ad947f" stroke-width="1.2"/><g class="shop-portal-glimmer">${sparkle(50,49,8,'#d3bbdb')}<path d="M40 63h20" stroke="#a89abf" stroke-width="1.3"/></g>`,
    cosmos: `${shadow}<path d="M24 83h52l8 6H16Z" fill="#867896"/><path d="M50 8 78 20l12 28-12 28-28 12-28-12-12-28 12-28Z" fill="#4d456f" stroke="#b8a1d1" stroke-width="2.5"/><path d="m50 17 22 9 9 22-9 22-22 9-22-9-9-22 9-22Z" fill="#282c49" stroke="#a89cc8" stroke-width="1.2"/><g class="shop-orbit-slow"><ellipse cx="50" cy="48" rx="26" ry="15" fill="none" stroke="#a5b9cd" stroke-width="1.2" transform="rotate(-32 50 48)"/><circle cx="28" cy="61" r="3" fill="#d8c3ac"/><circle cx="72" cy="34" r="2" fill="#b7cfcc"/></g><g class="shop-portal-glimmer">${sparkle(50,47,10,'#d5c2e8')}${sparkle(62,63,3,'#dfcfaf')}${sparkle(39,31,2,'#bdcbdc')}</g><circle cx="50" cy="8" r="3" fill="#dfcda9"/><circle cx="90" cy="48" r="3" fill="#c2b7d6"/><circle cx="10" cy="48" r="3" fill="#c2b7d6"/>`,
  };
  const bannerColors = {
    default: ['#8a7caa','#27263a','#b5a0d0'], leaf: ['#96b49c','#293b38','#d0d8ae'],
    parchment: ['#c8b28c','#403733','#ecdbb8'], obsidian: ['#8e96a9','#222633','#c4cbda'],
    celestial: ['#9caed4','#2b304c','#d8d7f0'], sovereign: ['#d1b47f','#433446','#f2d89e'],
  };
  const themes = {
    default: ['#363454','#48527e','#262642','#b8a3d8'], forest: ['#293f42','#568577','#263d42','#b9caa0'],
    ocean: ['#263f58','#51899f','#22374c','#bbdadd'], sakura: ['#4d3d52','#a58196','#46374d','#e5c3ca'],
    aurora: ['#303857','#628991','#2c3350','#b8d6cc'],
  };

  function fxPreview(variant) {
    if (variant === 'default') return `${sparkle(80,54,15,'#aea0c9')}<circle cx="80" cy="54" r="33" fill="none" stroke="#766d962b"/>`;
    if (variant === 'fireflies') return `<ellipse cx="80" cy="59" rx="47" ry="28" fill="#8bab7810"/><g class="shop-portal-glimmer">${[[38,66,3],[58,35,2],[87,52,3],[115,30,2],[124,72,2],[74,83,2]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r+5}" fill="#c5dfa011"/><circle cx="${x}" cy="${y}" r="${r}" fill="${r===3?'#e3dda7':'#a9d3b4'}"/>`).join('')}</g>`;
    if (variant === 'petals') return `<g class="shop-gentle-float">${[[38,45,-15],[62,73,35],[84,30,65],[119,52,10],[101,83,45]].map(([x,y,a],i)=>`<path d="M${x-5} ${y+1}q0-13 11-8 6 11-11 8Z" fill="${i%2?'#d8aabe':'#edc7d1'}" transform="rotate(${a} ${x} ${y})"/>`).join('')}</g><path d="M26 78q41 25 109-10" fill="none" stroke="#aa789827" stroke-width="1.5"/>`;
    if (variant === 'snow') return `<g class="shop-portal-glimmer">${[[43,34,8],[86,68,10],[119,33,5]].map(([x,y,r])=>`<g transform="translate(${x} ${y})" fill="none" stroke="#d6e3ee" stroke-width="1.4"><path d="M-${r} 0h${r*2}M0-${r}v${r*2}m-${r*.7}-${r*.3} ${r*1.4}-${r*1.4}m-${r*1.4} 0 ${r*1.4} ${r*1.4}"/></g>`).join('')}<circle cx="31" cy="76" r="2" fill="#e3e8f0"/><circle cx="126" cy="79" r="2" fill="#c8d7e6"/><circle cx="74" cy="26" r="1.7" fill="#e3e8f0"/></g>`;
    if (variant === 'meteor') return `<g class="shop-meteor-preview"><path d="m37 75 47-33" stroke="#909aca" stroke-width="3" opacity=".3"/><path d="m37 75 28-20" stroke="#c1c8e8" stroke-width="2"/><path d="m37 75 8-6" stroke="#e7e1f4" stroke-width="2.5"/>${sparkle(37,75,3,'#f3eafa')}<path d="m95 45 32-23" stroke="#b4afd3" stroke-width="1.5"/>${sparkle(95,45,2,'#ddd5ec')}</g><circle cx="114" cy="82" r="1" fill="#b7aec9"/>`;
    return `<g class="shop-nebula-haze"><ellipse cx="70" cy="56" rx="39" ry="17" fill="#a184b7" opacity=".27" transform="rotate(-25 70 56)"/><ellipse cx="94" cy="53" rx="37" ry="15" fill="#769bae" opacity=".27" transform="rotate(-25 94 53)"/></g><ellipse cx="80" cy="56" rx="54" ry="14" fill="none" stroke="#b8a9d544" transform="rotate(-25 80 56)"/>${sparkle(80,56,8,'#d7c9e7')}${sparkle(45,36,3,'#ced5e8')}${sparkle(124,74,2,'#e6cdbb')}<circle cx="105" cy="33" r="1.7" fill="#c0d6d4"/>`;
  }

  function bannerPreview(variant) {
    const [edge,bg,accent] = bannerColors[variant];
    let ornament = '';
    if(variant==='leaf')ornament=`<path d="M17 69q7-22 21-29m-18 19q-13-3-9-13 13 1 9 13m8-9q-1-13 11-15 2 10-11 15M144 64q-5 18-18 20" fill="none" stroke="${edge}" stroke-width="2"/>`;
    if(variant==='parchment')ornament=`<path d="M18 30q-8-7-9 1v48q0 7 9 2m124-51q8-7 9 1v48q0 7-9 2" fill="${edge}"/><path d="M24 33h112M24 79h112" stroke="${accent}" stroke-width="1" opacity=".6"/>`;
    if(variant==='obsidian')ornament=`<path d="m14 30 11-8h110l11 8v50l-11 8H25l-11-8Z" fill="none" stroke="${edge}" stroke-width="2"/>${sparkle(80,25,4,accent)}`;
    if(variant==='celestial')ornament=`<path d="m18 35 17-11 27 3m68 59 15-14-7-24" fill="none" stroke="${edge}" stroke-width="1.2"/><circle cx="35" cy="24" r="2" fill="${accent}"/>${sparkle(18,35,3,accent)}${sparkle(138,48,4,accent)}`;
    if(variant==='sovereign')ornament=`<rect x="10" y="23" width="140" height="65" rx="10" fill="none" stroke="${edge}" stroke-width="1.4"/><path d="m69 25-2-12 8 5 5-10 5 10 8-5-2 12Z" fill="${accent}"/><path d="m15 36 6 8-6 8m130-16-6 8 6 8" fill="none" stroke="${accent}" stroke-width="1.7"/>`;
    return `<rect x="15" y="28" width="130" height="55" rx="8" fill="${bg}" stroke="${edge}" stroke-width="1.4"/><circle cx="41" cy="50" r="10" fill="${edge}"/><path d="M27 73q2-16 14-16t14 16Z" fill="${accent}" opacity=".8"/><path d="M66 47h53M66 58h35M66 69h47" stroke="${accent}" stroke-width="3" stroke-linecap="round" opacity=".5"/>${ornament}`;
  }

  // Every terrain and layout uses the same camera, scale, island and roadside
  // context. Collection modules provide the actual ornaments, never a separate
  // thumbnail composed of detached buildings or a flat terrain swatch.
  function worldPreview(itemId) {
    const slot=items.get(itemId)?.slot;
    if(!['theme','island','homeland'].includes(slot))return '';
    const scene=slot==='theme'?islandScene('island-default',{theme:itemId}):slot==='homeland'?islandScene('island-default',{homeland:itemId}):islandScene(itemId);
    return `<svg class="shop-art-svg shop-world-preview" viewBox="0 0 160 112" aria-hidden="true" focusable="false" data-art="${itemId}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none"><g data-preview-camera="590 350" transform="translate(6.25 12.25) scale(.25)">${scene}</g></svg>`;
  }

  // Coordinates here are foot contacts on the actual homepage top polygon,
  // not the visible roof silhouette. A roof may overhang; a chair leg may not.
  // Both live mounts and every preview go through this same placement pass.
  function groundIslandDecoration(itemId,markup) {
    if(!markup)return '';
    const move=(from,to,feet,part)=>{
      const before=`transform="${from}"`,after=`data-ground-part="${part}" data-ground-contacts="${feet.map(point=>point.join(',')).join(' ')}" transform="${to}"`;
      markup=markup.replace(before,after);
    };
    const rectFeet=[[0,75],[100,75],[100,101],[0,101]];
    if(markup.includes('translate(363 67) scale(.76)')){
      move('translate(363 67) scale(.76)','translate(363 105) scale(.7)',rectFeet,'rear-building');
      move('translate(177 224) scale(.65)','translate(177 191) scale(.65)',[[12,73],[24,80],[46,92],[75,89],[87,80]],'coastal-furnishing');
    }
    if(markup.includes('translate(411 163) scale(1.12)')){
      move('translate(411 163) scale(1.12)','translate(410 171) scale(1.12)',[[-49,15],[5,37],[49,15]],'rear-building');
      move('translate(146 244) scale(.8)','translate(194 232) scale(.8)',[[-13,5],[2,14],[19,6]],'coastal-furnishing');
    }
    const deck=[[-44,10],[0,29],[44,10]],observatoryFeet=[[-42,12],[4,31],[41,12]],pavilionFeet=[[-48,6],[6,29],[48,7]],towerFeet=[[-34,0],[-26,19],[0,37],[26,19],[35,0]],flowerFeet=[[-21,4],[1,13],[23,5]];
    const plans={
      'island-starhaven':[
        ['translate(144 162) scale(0.78)','translate(188 181) scale(.62)',deck,'left-lighthouse'],
        ['translate(425 133) scale(0.95)','translate(417 176) scale(.82)',deck,'rear-lighthouse'],
        ['translate(225 293) scale(0.95)','translate(245 239) scale(.66)',deck,'coastal-pavilion']],
      'island-celestialpalace':[
        ['translate(138 166) scale(0.95)','translate(185 181) scale(.62)',deck,'left-lighthouse'],
        ['translate(411 155) scale(1.24)','translate(417 173) scale(.84)',deck,'rear-palace'],
        ['translate(223 307) scale(1.02)','translate(245 239) scale(.66)',deck,'coastal-pavilion'],
        ['translate(252 139) scale(0.8)','translate(268 141) scale(.65)',deck,'upper-palace'],
        ['translate(454 198) scale(0.6)','translate(432 201) scale(.43)',deck,'right-lighthouse']],
      'island-lanternwharf':[
        ['translate(183 174) scale(0.85)','translate(195 181) scale(.66)',pavilionFeet,'left-pavilion'],
        ['translate(417 164) scale(1.05)','translate(417 178) scale(.84)',pavilionFeet,'rear-pavilion']],
      'island-lunarobservatory':[
        ['translate(150 185) scale(0.67)','translate(188 181) scale(.64)',observatoryFeet,'left-observatory'],
        ['translate(408 170) scale(1.08)','translate(416 177) scale(.84)',observatoryFeet,'rear-observatory'],
        ['translate(239 292) scale(0.58)','translate(245 239) scale(.55)',observatoryFeet,'coastal-observatory']],
      'island-clockworkgarden':[
        ['translate(167 184) scale(0.81)','translate(174 186) scale(.76)',[[-25,15],[0,28],[27,15]],'left-windmill'],
        ['translate(420 176) scale(1.03)','translate(420 176) scale(1.03)',[[-25,15],[0,28],[27,15]],'rear-windmill'],
        ['translate(225 124) scale(0.47)','translate(238 141) scale(.43)',[[-25,15],[0,28],[27,15]],'upper-windmill'],
        ['translate(145 213) scale(0.8)','translate(145 210) scale(.8)',flowerFeet,'left-flowerbed'],
        ['translate(206 249) scale(1)','translate(215 240) scale(.85)',flowerFeet,'coastal-flowerbed'],
        ['translate(447 209) scale(0.9)','translate(430 207) scale(.7)',flowerFeet,'right-flowerbed']],
      'island-aethercitadel':[
        ['translate(151 177) scale(0.8)','translate(180 185) scale(.64)',towerFeet,'left-tower'],
        ['translate(231 143) scale(0.64)','translate(242 145) scale(.58)',towerFeet,'upper-tower'],
        ['translate(390 137) scale(1.05)','translate(415 170) scale(.8)',towerFeet,'rear-tower'],
        ['translate(448 181) scale(0.74)','translate(432 195) scale(.5)',towerFeet,'right-tower']],
    };
    for(const [from,to,feet,part] of plans[itemId]||[])move(from,to,feet,part);
    if(itemId==='island-starhaven'||itemId==='island-celestialpalace'){
      // Rebuild the bridge rails and their posts together; moving only a curve
      // would leave the old rail posts hanging at the previous coordinates.
      const [a,b,c]=expansion.colors(itemId);
      const bridge=(x1,y1,x2,y2)=>{const mx=(x1+x2)/2,my=Math.min(y1,y2)-13,d=`M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}`;return `<g data-ground-part="connecting-walk" data-ground-contacts="${x1},${y1} ${x2},${y2}"><path d="${d}" fill="none" stroke="${b}" stroke-width="6"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.5"/>${[.2,.4,.6,.8].map(t=>{const x=(1-t)*(1-t)*x1+2*(1-t)*t*mx+t*t*x2,y=(1-t)*(1-t)*y1+2*(1-t)*t*my+t*t*y2;return `<path d="M${x.toFixed(2)} ${y.toFixed(2)}v-5" fill="none" stroke="${a}" stroke-width="1.3"/>`;}).join('')}</g>`;};
      const walks=itemId==='island-starhaven'?bridge(188,181,245,161)+bridge(364,176,417,176):bridge(185,181,268,141)+bridge(352,173,417,173)+bridge(417,184,432,201);
      const firstDistrict=markup.indexOf('<g data-ground-part="left-lighthouse"'),opening=markup.indexOf('>')+1;
      if(firstDistrict>opening)markup=markup.slice(0,opening)+walks+markup.slice(firstDistrict);
    }
    if(itemId==='island-lanternwharf'){
      markup=markup.replace('class="lca-water-lights"','class="lca-water-lights" transform="translate(25 -16)" data-ground-part="coastal-lanterns" data-ground-contacts="113,222 134,232 146,224 204,262 224,271 246,263"');
      markup=markup.replace(/M186 164/g,'M198 174').replace(/190 176/g,'202 186');
    }
    if(itemId==='island-lunarobservatory'){
      markup=markup.replace(/(<g\b[^>]*class="lca-telescope">[\s\S]*?<\/g>)/,'<g transform="translate(-30 12)" data-ground-part="right-telescope" data-ground-contacts="454,185 482,174 492,183 465,194">$1</g>');
      markup=markup.replace(/M169 179Q203 195 233 162/g,'M188 181Q216 191 242 156');
    }
    if(itemId==='island-aethercitadel'){
      markup=markup.replace(/M144 174Q182 169 219 142/g,'M180 185Q210 179 242 145').replace(/l2 8q-39 31-74 33/g,'l2 8q-31 37-61 48');
      markup=markup.replace(/M377 123q25 7 47 31/g,'M415 170q7 7 17 25').replace(/l-3 8q-19-22-46-29/g,'l-3 8q-9-20-17-23');
      markup=markup.replace('translate(137 183)','translate(169 195)').replace('translate(414 173)','translate(416 191)');
      markup=markup.replace('m126 176 24-9 25 10-25 10Z','m162 188 24-9 25 10-25 10Z').replace('m126 176v5l24 11 25-10v-5l-25 10Z','m162 188v5l24 11 25-10v-5l-25 10Z').replace('m431 186 22-8 23 8-23 10Z','m415 194 22-8 23 8-23 10Z').replace('m431 186v5l22 11 23-11v-5l-23 10Z','m415 194v5l22 11 23-11v-5l-23 10Z').replace('M136 172v-9m8 6v-12m308 24v-10m7 11v-8','M172 184v-9m8 6v-12m256 20v-10m7 11v-8');
    }
    // First-generation small furnishings were authored directly in island
    // coordinates. Their front feet need the same inset as later collections.
    if(!expansion?.has(itemId,'island')){
      markup=markup.replace(/transform="translate\((\d+) (\d+)\)([^\"]*)"/g,(full,x,y,rest)=>{
        const a=Number(x),b=Number(y);
        if(a>=170&&a<=300&&b>=230)return `data-ground-part="coastal-original" data-ground-contacts="-12,8 12,4" transform="translate(${a} ${b-14})${rest}"`;
        if(a>=390&&a<=405&&b>=148&&b<=151)return `data-ground-part="rear-original" data-ground-contacts="-35,4 0,18 35,4" transform="translate(${a-10} ${b+14})${rest}"`;
        return full;
      });
    }
    return markup.replace(/^<g\b/,'<g data-island-grounding="shore-v2"');
  }

  // Complete, mutually exclusive layouts on the 590 × 350 homepage island.
  // Low coastal accents use x174–291 / y220–269; buildings use x363–444 / y56–166.
  // The roadside camp at x303–373 / y205–265, original route, and other mounts stay clear.
  function islandDecoration(itemId) {
    if(expansion?.has(itemId,'island'))return groundIslandDecoration(itemId,expansion.islandDecoration(itemId));
    const item=items.get(itemId);if(item?.slot!=='island'||item.variant==='default')return '';
    const stones=points=>points.map(([x,y],index)=>`<path d="m${x-6} ${y} 7-2 7 2-7 3Z" fill="${index%2?'#91939f':'#afb0b5'}" opacity=".7"/>`).join('');
    const lamp=(x,y,short=false)=>`<g transform="translate(${x} ${y})"><ellipse rx="10" ry="3" fill="#dac794" opacity=".13"/><path d="M-4 0H4M0 0v-${short?9:17}" stroke="#9a8a79" stroke-width="2" stroke-linecap="round"/><g transform="translate(0 ${short?8:0})"><path d="M-5-20 0-24l5 4-1 8H-4Z" fill="#b7a786" stroke="#716779" stroke-width="1"/><path d="M-2-19H2v5H-2Z" fill="#f2d9a2"/><g class="shop-portal-glimmer"><ellipse cy="-16" rx="7" ry="7" fill="#eed3a0" opacity=".12"/></g></g></g>`;
    const flowers=(x,y,color,scale=1)=>`<g transform="translate(${x} ${y}) scale(${scale})"><ellipse rx="19" ry="5" fill="#517b75" opacity=".65"/><path d="M-11 1q-8-12-12-7 3 9 12 7m18 1q9-12 15-7-3 8-15 7M-3 1v-10m13 11v-10" fill="#7caa93" stroke="#749986" stroke-width="1.2"/><g fill="${color}"><circle cx="-3" cy="-10" r="3"/><circle cx="-6" cy="-8" r="2.5"/><circle cx="0" cy="-8" r="2.5"/><circle cx="10" cy="-9" r="3"/></g><circle cx="-3" cy="-8" r="1.2" fill="#e6d4a8"/></g>`;
    const terrace=(x,y,width=30)=>`<g transform="translate(${x} ${y})"><ellipse cy="6" rx="${width+2}" ry="6" fill="#20273d" opacity=".22"/><path d="m-${width} 0 ${width}-11 ${width} 11-${width} 9Z" fill="#b5aca0"/><path d="m-${width} 0 0 4 ${width} 9 ${width}-9V0L0 9Z" fill="#7f7c8a"/><path d="m-${width-4} 0 ${width-4}-8 ${width-4} 8-${width-4} 9Z" stroke="#d6cab0" stroke-width="1"/></g>`;
    const coast=(rich=false)=>stones([[218,251],[240,258],[263,263]])+lamp(186,245)+flowers(276,264,rich?'#ddbfcd':'#c7cfaf',.65);
    const bench=(x,y)=>`<g transform="translate(${x} ${y})"><path d="m-18-4 25-6 12 5-25 8Z" fill="#baad96"/><path d="m-18-4 0 4 12 7 25-8v-4L-6 3Z" fill="#85808a"/><path d="M-12 4v4M12 0v4" stroke="#8f8790" stroke-width="2.4"/><path d="m-12-4 17-4" stroke="#e0c8a2" stroke-width="1"/></g>`;
    let content='';
    if(item.variant==='lanterns')content=stones([[209,249],[230,255],[248,260],[275,265]])+lamp(184,244)+lamp(263,260)+lamp(394,149);
    if(item.variant==='garden')content=stones([[228,255],[253,261]])+`<g transform="translate(232 254)"><path d="m-17-2 5-7 20 1 11 7-16 5Z" fill="#929ba4"/><path d="m-13-2 4-4 17 1 7 4-13 3Z" fill="#799f94"/><path d="m-7-1 13 1" stroke="#bfcec0" stroke-width="1"/></g>`+flowers(197,245,'#d6b7c5',.92)+flowers(273,263,'#d9d0a7',.8)+flowers(391,148,'#bdc7dd');
    if(item.variant==='pavilion')content=`<g transform="translate(395 148)">${terrace(0,4,25)}<path d="M-17 6v-28m33 28v-28M-3 1v-31" stroke="#b5a189" stroke-width="3"/><path d="M-29-21-3-42 29-21 1-10Z" fill="#889bab"/><path d="M-3-42 1-10l28-11Z" fill="#637d8d"/><path d="M-29-21 1-10l28-11" fill="none" stroke="#c1bca6" stroke-width="2"/><path d="M-12 4 1 9 14 4M-9-1 3 3 15-2" fill="none" stroke="#b9a68c" stroke-width="3" stroke-linecap="round"/><path d="M20 5v-10m-5 1 13-6" stroke="#cfbda0" stroke-width="2"/><path d="m23-13 7-3 3 5-7 4Z" fill="#b6c4cd"/></g>`+stones([[379,164],[217,251],[241,258]])+lamp(187,246)+flowers(273,263,'#c8cfae',.65);
    if(item.variant==='supplies')content=`<g transform="translate(194 244)"><ellipse cy="4" rx="20" ry="5" fill="#28334a" opacity=".25"/><path d="m-16-8 21-5 12 6v12l-21 6-12-7Z" fill="#967b69"/><path d="m-16-8 12 6 21-5-12-6Z" fill="#c2a887"/><path d="M-4-2v13l21-6V-7Z" fill="#826c63"/><path d="M-11-10v15m17-17V7" stroke="#d0b594" stroke-width="2"/><path d="M-16-2-4 4l21-6" stroke="#b89c7f" stroke-width="1"/><rect x="-2" y="1" width="4" height="4" rx="1" fill="#d9c394"/><path d="m-10-15 14-4 10 4-15 4Z" fill="#98ada5"/><path d="m-10-15 0 4 9 4 15-4v-4l-15 4Z" fill="#d6c8ab"/></g><g transform="translate(242 257)"><path d="m-13-5 17-4 11 5-18 5Z" fill="#af97b3"/><path d="m-13-5 0 4 10 5 18-4v-4L-3 1Z" fill="#d9cbb0"/><path d="m-10-11 13-3 9 3-14 4Z" fill="#97aaa9"/><path d="m-10-11 0 4 8 4 14-4v-4L-2-7Z" fill="#e3d2b2"/></g><g transform="translate(394 148)"><path d="M-12 0v-21m25 18v-19" stroke="#918477" stroke-width="2"/><path d="m-17-27 28-7 9 13-28 9Z" fill="#b4aaa0"/><path d="m-10-26 17-4 5 7-17 4Z" fill="#dcd0ad"/><path d="m-5-25 7 4 3-7" stroke="#99ac9b" stroke-width="1.2" fill="none"/></g>`+stones([[222,252],[265,263]]);
    if(item.variant==='banners')content=`<g transform="translate(395 151)">${terrace(0,0,23)}<path d="M-17 5v-51m34 49v-60" stroke="#bfb29a" stroke-width="2.6"/><path d="m-19-48 5-8 5 7-5 4Z" fill="#d9c39b"/><path d="m15-62 5-8 5 7-5 4Z" fill="#d9c39b"/><path d="m-16-43 17 5v24l-9-5-8 1Z" fill="#9ca6bb"/><path d="m18-55 18 5v28l-10-6-8 2Z" fill="#b4a1bb"/><path d="m-13-38 10 3m-5-2v12m29-22 11 3m-5-2v13" stroke="#e0ceac" stroke-width="1.4"/><path d="m-15-6 7-2m23 6 9-2" stroke="#dbcaab" stroke-width="2"/>${sparkle(28,-40,3,'#e8d5b0')}</g>`+coast()+bench(233,257);
    if(item.variant==='fountain')content=`<g transform="translate(396 149)">${terrace(0,3,28)}<ellipse cy="1" rx="25" ry="10" fill="#bbb6bc"/><path d="M-25 1q25 17 50 0v7q-25 17-50 0Z" fill="#8c8d9f"/><ellipse cy="0" rx="21" ry="7" fill="#7eacb4"/><ellipse cy="0" rx="15" ry="4" fill="none" stroke="#c7dce0" stroke-width="1"/><path d="M-3-27H3L6 1H-6Z" fill="#c9c4c3"/><ellipse cy="-27" rx="16" ry="5" fill="#d4cacc"/><path d="M-16-27q16 15 32 0v3q-16 14-32 0Z" fill="#a6a9bc"/><g class="shop-portal-glimmer" stroke="#b6dbe0" stroke-width="1.5" fill="none"><path d="M0-28v-24m0 8q-13-13-16 0m16 5q12-17 18-2M-14-25q-7 13-5 24m33-25q7 15 6 23"/><circle cx="-16" cy="-45" r="1.7"/><circle cx="18" cy="-42" r="1.4"/></g><path d="M3-62a10 10 0 1 0 7 15A12 12 0 0 1 3-62Z" fill="#e3d8b8"/></g>`+coast(true)+bench(232,257)+flowers(271,262,'#c0cfe0',.68);
    if(item.variant==='library')content=`<g transform="translate(403 150)">${terrace(0,2,32)}<path d="m-28-35 32-12 27 13v36L-3 15-28 4Z" fill="#b3a796"/><path d="m-3-23 34-11v36L-3 15Z" fill="#8c8390"/><path d="m-28-35 25 12v38L-28 4Z" fill="#afa190"/><path d="M-34-34-5-64 36-35 2-21Z" fill="#8b91aa"/><path d="M-5-64 2-21l34-14Z" fill="#687b91"/><path d="m-34-34 36 13 34-14" stroke="#d9c9ac" stroke-width="2"/><path d="m-22-25 14 7V3l-14-7Z" fill="#635e6c"/><path d="m4 8 0-25 22-7V0Z" fill="#4a526b"/><path d="m9-15 0 17m6-19v16m6-18v16" stroke="#d0bb92" stroke-width="3"/><path d="m-20-17 9 4m-9 6 9 4" stroke="#d2c19e" stroke-width="2"/><path d="m-19-22 0 7m4-5v7m4-5v7" stroke="#9caeab" stroke-width="2"/><path d="m-3-21 0 35M30-29V5" stroke="#d6c4a8" stroke-width="2"/><path d="m-8-42 9-3 10 4-10 4Z" fill="#e9d6b4"/><path d="M1-45v8" stroke="#a2928d" stroke-width="1"/>${lamp(-28,6,true)}</g>`+coast(true)+bench(235,258)+stones([[204,247],[256,262]]);
    if(item.variant==='observatory')content=`<g transform="translate(404 149)">${terrace(0,4,32)}<path d="m-25 0 0-23 25-11 26 13V1L1 13Z" fill="#99a5b4"/><path d="M1-11 26-21V1L1 13Z" fill="#707f9e"/><path d="M-25-23q-1-31 24-40 28 8 27 42L1-10Z" fill="#8c93b3"/><path d="M-1-63q20 20 16 43l-14 10Z" fill="#646e96"/><path d="M-25-23q-1-31 24-40 28 8 27 42m-27-42q-10 23-9 45" stroke="#c1bdce" stroke-width="1.4"/><path d="m-5-6 12-5V6L-5 12Z" fill="#444c71"/><g class="shop-orbit-slow"><ellipse cy="-58" rx="29" ry="9" fill="none" stroke="#d3c098" stroke-width="1.6" transform="rotate(-28 0 -58)"/><circle cx="25" cy="-70" r="3" fill="#cfb7d5"/></g><path d="M-1-64v-19" stroke="#c9b79a" stroke-width="2"/>${sparkle(-1,-86,5,'#e9d7b1')}<path d="m-26-1-9 5m9-5 0 9" stroke="#bcb29c" stroke-width="1.5"/><g transform="translate(-29 -6) rotate(-27)"><rect x="-8" y="-3" width="20" height="7" rx="1" fill="#a8b8c3"/><path d="M10-5h4v11h-4Z" fill="#d5c5a5"/></g></g>`+coast()+bench(233,256)+`<g transform="translate(270 259)"><ellipse rx="10" ry="4" fill="#9595ae"/><ellipse rx="7" ry="2.4" fill="none" stroke="#d3c7ab" stroke-width="1"/>${sparkle(0,-7,4,'#ded2b4')}</g>`;
    if(item.variant==='arcade')content=`<g transform="translate(404 148)">${terrace(0,3,34)}<path d="m-33-22 22-14 37 19-20 13Z" fill="#a5a5b5"/><path d="m-33-22 0 22 9 5v-12q4-10 9-3V9l9 4V-7Z" fill="#b7b5c2"/><path d="m-6-7 32-10v22L-6 16V-7Z" fill="#858aa5"/><path d="m1 11 0-14q5-12 9-4V8m5-3V-9q5-11 8-3V2" fill="#4d5e7b"/><path d="m-36-23 24-18 43 22-25 14Z" fill="#8fa8b5"/><path d="m-12-41 43 22-25 14-2-12Z" fill="#728aab"/><path d="m-36-23 42 18 25-14" stroke="#ddd0b2" stroke-width="2"/><path d="M-25-30v-28M17-25v-27" stroke="#b5b5bd" stroke-width="3"/><path d="m-33-56 13-15 12 17-13 6Z" fill="#a4b7c0"/><path d="m9-51 13-18 14 16-14 7Z" fill="#a29cbd"/><path d="M-25-57 17-52" stroke="#d9c7a6" stroke-width="1"/><g class="shop-portal-glimmer">${sparkle(-15,-56,2,'#eddaad')}${sparkle(-1,-55,2,'#eddaad')}${sparkle(12,-53,2,'#eddaad')}<path d="m-17-10 0 6m22-9v6m14-10v6" stroke="#e8d5ae" stroke-width="2"/></g></g>`+coast(true)+bench(235,256)+flowers(210,250,'#c4cbd9',.52)+stones([[265,264],[379,164]]);
    if(item.variant==='palace')content=`<g transform="translate(404 148)">${terrace(0,3,35)}<path d="m-33-9 32-13 34 13-32 15Z" fill="#d1c5be"/><path d="m-33-9 0 13 34 12L33 4V-9L1 6Z" fill="#8b88a0"/><path d="m-21-19 0-26 22-11 22 10v28L1-7Z" fill="#c9bfd0"/><path d="M1-33 23-46v28L1-7Z" fill="#958aa9"/><path d="m-25-45 26-28 27 27-26 14Z" fill="#a79fc4"/><path d="M1-73 2-32l26-14Z" fill="#7b82ab"/><path d="m-25-45 27 13 26-14" stroke="#ebd6b1" stroke-width="2"/><path d="M1-72v-15" stroke="#d8c09b" stroke-width="2"/>${sparkle(1,-88,4,'#f0dbaa')}<path d="m-33-5 0-27 12-7 12 7v28l-12 6Z" fill="#b5b2c5"/><path d="m-39-31 18-22 16 21-16 9Z" fill="#9ca9bc"/><path d="m15-5 0-30 13-7 12 7v29L28 1Z" fill="#a9a4bb"/><path d="m10-34 18-24 17 22-17 10Z" fill="#9d94b8"/><path d="m-39-31 18 8 16-9m15-2 18 8 17-10" stroke="#dbcbb0" stroke-width="1.5"/><path d="m-25-18 7-3v14l-7 3Zm50-2 7-3v14l-7 3Z" fill="#e5cfa7"/><path d="M-5-12v-14q7-11 13-4v15Z" fill="#4e5578"/><path d="M-2-26v9m6-12v9" stroke="#ceb995" stroke-width="1.5"/><path d="M-13-34v-8m7 11v-9m15-1v-9m7 5v-9" stroke="#e1c8a3" stroke-width="2"/><g class="shop-portal-glimmer">${sparkle(-21,-53,3,'#e9d8b7')}${sparkle(28,-58,3,'#e9d8b7')}<ellipse cy="-82" rx="15" ry="3" fill="none" stroke="#c8bcd7" stroke-width="1" opacity=".75"/></g><path d="m-17 13 17-7 19 7-17 4Z" fill="#c3b4ba"/></g>`+coast(true)+bench(233,256)+flowers(212,250,'#d5b9d0',.48)+lamp(269,261,true)+stones([[281,266]]);
    return groundIslandDecoration(itemId,`<g class="island-decoration" data-island-decoration="${itemId}" fill="none" stroke="none">${content}</g>`);
  }

  function islandScene(itemId,equipped={}) {
    if(items.get(itemId)?.slot!=='island')return '';
    const choice=slot=>items.get(equipped?.[slot])?.slot===slot?equipped[slot]:`${slot}-default`;
    const theme=choice('theme'),[sky,ground,rock,accent]=expansion?.themePalette(theme)||themes[items.get(theme).variant];
    const backdrop=themeBackdrop(items.get(theme).variant).replace(/^<svg[^>]*>|<\/svg>$/g,'').replace(/opacity="\.(?:18|24|25)"/g,'opacity=".58"');
    const relic=choice('relic'),portal=choice('portal'),companion=choice('companion');
    const player=(nodeArt||root.QuestArt)?.avatar('player',choice('avatar'))?.replace(/^<svg[^>]*>|<\/svg>$/g,'')||'';
    const roadside=(nodeCampArt||root.FocusCampWorldArt)?.roadside?.(equipped)||'';
    const decoration=islandDecoration(itemId);
    const homeland=choice('homeland'),rebuilt=architecture?.main(homeland,{...equipped,island:itemId})||'';
    const foundation=rebuilt||`<g data-preview-layer="island-body"><path d="m100 207 67 32 100 37 138-25 76-67-76 87-104 55-110-37Z" fill="${rock}"/><path d="m100 207 67 32 24 50Z" fill="${ground}" opacity=".22"/><path d="m267 276 34 50 104-55 0-20Z" fill="${ground}" opacity=".15"/><path d="m405 251 76-67-37 83-39 4Z" fill="${sky}" opacity=".35"/></g><path d="m100 207 116-87 130-15 135 79-76 67-138 25-100-37Z" fill="${ground}" stroke="${accent}" stroke-opacity=".45" stroke-width="2"/>`;
    const trees=rebuilt?'':`<g data-preview-layer="foreground-trees" fill="#5c8288"><path d="m156 137-21 33 21 12 20-12Z"/><path d="m216 110-17 32 17 10 17-10Z"/><path d="m435 171-20 34 20 12 20-12Z"/></g>`;
    const crystal=relic==='relic-default'?'<ellipse cx="322" cy="159" rx="39" ry="15" fill="#9d8ac4" opacity=".18"/><path d="m285 152 37-21 38 21-38 23Z" fill="#b9a4de"/><path d="m285 152 37 23v13l-37-24Zm37 23 38-23v13l-38 23Z" fill="#8879a9"/><path d="m321 60-23 39 23 42 24-42Z" fill="#b9a4e6"/><path d="m321 60 3 42-26-3Zm3 42-3 39 24-42Z" fill="#e0d6ed"/>':`<g transform="translate(278 62) scale(.88)">${(expansion?.premium(relic)||expansion?.relic(relic)||relics[items.get(relic).variant])}</g>`;
    return `<g data-preview-layer="sky"><rect x="0" y="0" width="590" height="350" rx="26" fill="${sky}"/>${backdrop}</g><ellipse cx="300" cy="319" rx="166" ry="12" fill="#11162a" opacity=".25"/>${foundation}<path data-preview-layer="main-route" d="M166 218C203 202 214 236 258 220s11-39 47-40 66 26 93-4" fill="none" stroke="${accent}" stroke-width="4" opacity=".6"/>${decoration}${trees}<g data-preview-layer="crystal-shrine">${crystal}</g>${portal==='portal-default'?'':`<g transform="translate(220 123) scale(.57)">${(expansion?.portal(portal)||portals[items.get(portal).variant])}</g>`}${companion==='companion-default'?'':`<g transform="translate(362 192) scale(.53)">${companionArt(companion)}</g>`}<g transform="translate(151 172) scale(.65)">${player}</g><g data-preview-layer="roadside-camp">${roadside}</g>`;
  }

  function companionArt(id,options={}){
    if(items.get(id)?.slot!=='companion'||id==='companion-default')return '';
    const body=expansion?.premium(id)||expansion?.companion(id)||companions[items.get(id).variant]||'';
    return companionLife?.wrap(id,body,options)||body;
  }
  function islandPreview(itemId,equipped) {
    const content=islandScene(itemId,equipped);if(!content)return '';
    return `<svg class="shop-island-art" viewBox="0 0 590 350" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="none">${content}</svg>`;
  }

  function archipelagoPreview(itemId,large=false) {
    if(items.get(itemId)?.slot!=='archipelago')return '';
    if(itemId!=='archipelago-default')return large?architecture?.detail(itemId)||'':architecture?.preview(itemId)||'';
    const art=typeof module==='object'&&module.exports?require('./expedition-art.js'):root.FocusExpeditionArt;
    const scene=(art?.world({progress:.75,subjects:['math','cs','politics','english'].map(id=>({id,progress:.75,percent:75}))})||'').replace(/^<svg[^>]*>|<\/svg>$/g,'').replace(/ role="button"| tabindex="0"| data-expedition-subject="[^"]+"| data-skin-slots="[^"]+"/g,'');
    return large?`<svg class="shop-island-art" viewBox="0 0 1000 540" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="none">${scene}</svg>`:`<svg class="shop-art-svg" viewBox="0 0 160 112" data-art="${itemId}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="none"><g transform="translate(0 13) scale(.16)">${scene}</g></svg>`;
  }

  function preview(itemId,equipped={}) {
    if(items.get(itemId)?.slot.startsWith('campus'))return subjectIslandPreview(itemId,false,equipped);
    if(items.get(itemId)?.slot==='homeland')return worldPreview(itemId);
    if(items.get(itemId)?.slot==='archipelago')return archipelagoPreview(itemId);
    if(['theme','island'].includes(items.get(itemId)?.slot))return worldPreview(itemId);
    if(items.get(itemId)?.slot==='companion'&&itemId!=='companion-default')return `<svg class="shop-art-svg" viewBox="0 0 160 112" aria-hidden="true" focusable="false" data-art="${itemId}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none"><g transform="translate(30 5)">${companionArt(itemId)}</g></svg>`;
    if(expansion?.has(itemId))return expansion.has(itemId,'bar')?(nodeProgressBars||root.FocusProgressBars)?.preview(itemId)||'':expansion.preview(itemId);
    const interfaceThemes=nodeInterfaceThemes||root.FocusInterfaceThemes;
    if(interfaceThemes?.has(itemId))return interfaceThemes.preview(itemId);
    const item=items.get(itemId);if(!item)return '';
    const {slot,variant}=item;
    const progressBars=nodeProgressBars||root.FocusProgressBars;
    if(slot==='bar')return progressBars?.has(itemId)?progressBars.preview(itemId):'';
    let content;
    if(slot==='avatar'){
      const art=nodeArt||root.QuestArt;
      if(!art)return '';
      const character=art.avatar('player',itemId).replace(/^<svg[^>]*>|<\/svg>$/g,'');
      content=`<ellipse cx="80" cy="92" rx="34" ry="7" fill="#82709910"/><g transform="translate(48 16)">${character}</g>`;
    }else if(slot==='fx')content=fxPreview(variant);
    else if(slot==='banner')content=bannerPreview(variant);
    else content=`<g transform="translate(30 5)">${({companion:companions,relic:relics,portal:portals})[slot][variant]}</g>`;
    return `<svg class="shop-art-svg" viewBox="0 0 160 112" aria-hidden="true" focusable="false" data-art="${itemId}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none">${content}</svg>`;
  }

  function themeBackdrop(variant) {
    if(expansion?.has(`theme-${variant}`,'theme'))return expansion.themeBackdrop(`theme-${variant}`);
    if(variant==='default')return '';
    const accent=themes[variant][3];
    let scene='';
    if(variant==='forest')scene=`<path d="M445 65q24 47 11 102M444 88q-35-14-24-37 28 4 24 37m9 21q32-26 40-9-7 29-40 9M92 177q-16 29 2 56" fill="none" stroke="#8db899" stroke-width="2" opacity=".24"/><circle cx="166" cy="65" r="36" fill="#d1cf9e" opacity=".045"/>`;
    if(variant==='ocean')scene=`<g fill="none" stroke="#93c8d3" opacity=".18"><ellipse cx="300" cy="253" rx="223" ry="34"/><ellipse cx="300" cy="253" rx="189" ry="25"/><circle cx="443" cy="83" r="11"/><circle cx="462" cy="56" r="5"/><circle cx="94" cy="145" r="6"/></g>`;
    if(variant==='sakura')scene=`<path d="M471 119q-13-59-53-79m27 30 32-17m-22 43-30-2" fill="none" stroke="#c6a0b6" stroke-width="2" opacity=".18"/><g fill="#e2b4cb" opacity=".3"><circle cx="418" cy="40" r="10"/><circle cx="432" cy="48" r="7"/><circle cx="477" cy="53" r="8"/><circle cx="425" cy="94" r="6"/><path d="m107 88 7 8-11 4q-5-7 4-12Zm67-36 5 7-9 3q-3-6 4-10Z"/></g>`;
    if(variant==='aurora')scene=`<g class="shop-aurora-veil" fill="none" stroke-linecap="round"><path d="M78 111Q167 13 287 67t212-25" stroke="#8fbba6" stroke-width="23" opacity=".10"/><path d="M104 101Q194 24 310 76t170-16" stroke="#b7a0ce" stroke-width="14" opacity=".10"/></g>`;
    return `<svg class="shop-scene-backdrop-art" viewBox="0 0 590 350" aria-hidden="true" focusable="false" fill="none" stroke="none">${scene}<g fill="${accent}" opacity=".28"><circle cx="117" cy="97" r="1.3"/><circle cx="407" cy="52" r="1.3"/><circle cx="473" cy="196" r="1"/></g></svg>`;
  }

  function mount(doc,id,parentSelector,svg=false){
    let element=doc.getElementById(id);if(element)return element;
    const parent=doc.querySelector(parentSelector);if(!parent)return null;
    element=svg?doc.createElementNS('http://www.w3.org/2000/svg','g'):doc.createElement('div');
    element.id=id;element.setAttribute('aria-hidden','true');
    if(!svg)element.className='scene-theme-backdrop';
    if(svg&&id==='equipped-homeland')parent.insertBefore(element,parent.firstChild||null);
    else if(svg&&id==='equipped-island')parent.insertBefore(element,parent.querySelector?.('.crystal-shrine')||null);
    else if(svg)parent.appendChild(element);else parent.insertBefore(element,parent.firstChild||null);
    return element;
  }
  function put(element,id,markup,transform,renderKey=id){
    if(!element)return;
    const slot=items.get(id)?.slot;
    if(slot&&element.getAttribute('data-skin-slots')!==slot)element.setAttribute('data-skin-slots',slot);
    if(cache.get(element)===renderKey)return;
    if(transform)element.setAttribute('transform',transform);
    element.setAttribute('data-item',id);
    element.innerHTML=markup;
    cache.set(element,renderKey);
  }
  function dressTravelers(doc,outfit){
    const shapes={
      'avatar-royal':[
        'M160 188 158 175l8 5 5-11 5 11 8-5-2 13Z',
        'M171 169v19h11l2-13-8 5Z',
        'M155 166l-2-12 7 4 4-9 4 9 7-4-2 12Z',
      ],
      'avatar-voyager':[
        'M156 181l9 1 6-7 6 7 9-1-5 9h-20Z',
        'M171 175v15h10l5-9-9 1Z',
        'M152 161l7 1 5-5 5 5 7-1-4 7h-16Z',
      ],
      'avatar-ranger':[
        'M157 190q1-16 14-23 13 7 14 23l-7-5-7-7-7 7Z',
        'M171 167q13 7 14 23l-7-5-7-7Z',
        'M154 168q1-12 10-17 9 5 10 17l-5-4-5-5-5 5Z',
      ],
    };
    ['#scene-traveler .traveler-hat','#scene-traveler .traveler-hat-shade','.opening-traveler .opening-hat'].forEach((selector,index)=>{
      const element=doc.querySelector(selector);if(!element)return;
      if(!originalHats.has(element))originalHats.set(element,element.getAttribute('d'));
      const shape=shapes[outfit]?.[index]||expansion?.travelerHat(outfit,index)||originalHats.get(element);
      if(shape&&element.getAttribute('d')!==shape)element.setAttribute('d',shape);
    });
  }
  function syncTerrainFloat(doc,fx){
    const terrain=fx?.querySelector?.('.fx-terrain');
    if(!terrain?.getAnimations)return;
    const island=doc.querySelector('.quest-scene .island-art:not(.island-camp-overlay) .floating-island')||doc.querySelector('.floating-island');
    if(!island?.getAnimations)return;
    try{
      const source=island.getAnimations().find(animation=>animation.animationName==='float');
      const target=terrain.getAnimations().find(animation=>animation.animationName==='float');
      if(!source||!target||source===target)return;
      // The independent bright overlay borrows the island's clock. Repeated
      // polls only correct a real offset, including after motion is re-enabled.
      const sourceStart=source.startTime,targetStart=target.startTime,sourceTime=source.currentTime,targetTime=target.currentTime;
      if(source.playState==='running'&&target.playState==='running'&&source.timeline===target.timeline&&source.playbackRate===target.playbackRate&&Number.isFinite(sourceStart)&&Number.isFinite(targetStart)){
        if(Math.abs(sourceStart-targetStart)>.5)target.startTime=sourceStart;
      }else if(Number.isFinite(sourceTime)&&(!Number.isFinite(targetTime)||Math.abs(sourceTime-targetTime)>.5))target.currentTime=sourceTime;
    }catch(error){
      // Older WebViews may expose animations without writable timing fields.
    }
  }
  function apply(equipped){
    const valid={};
    for(const slot of Object.keys(inventory)){
      const candidate=equipped&&equipped[slot];
      valid[slot]=items.get(candidate)?.slot===slot?candidate:`${slot}-default`;
    }
    const doc=root.document;
    if(!doc||!doc.documentElement)return valid;
    if('npc' in doc.documentElement.dataset)delete doc.documentElement.dataset.npc;
    for(const [slot,id] of Object.entries(valid))if(doc.documentElement.dataset[slot]!==id)doc.documentElement.dataset[slot]=id;
    dressTravelers(doc,valid.avatar);
    if(architecture){
      const homeland=mount(doc,'equipped-homeland','.floating-island',true);
      put(homeland,valid.homeland,architecture.main(valid.homeland,valid),null,`${valid.homeland}:${valid.island}`);
    }
    let regalia=doc.getElementById('equipped-player-regalia');
    const fullOutfit=expansion?.item(valid.avatar)?.lotteryOnly===true||expansion?.fullOutfit?.(valid.avatar)===true;
    if(fullOutfit)regalia=mount(doc,'equipped-player-regalia','#scene-traveler',true);
    if(regalia)put(regalia,valid.avatar,fullOutfit?expansion.avatar(valid.avatar,4).replace(/^<svg[^>]*>|<\/svg>$/g,''):'','translate(142 158) scale(.9)');
    // The keyed mounts survive ordinary state polls and preserve their animation phase.
    const companion=mount(doc,'equipped-companion','.floating-island',true);
    if(companion)companion.setAttribute('aria-hidden',valid.companion==='companion-default'?'true':'false');
    const island=mount(doc,'equipped-island','.floating-island',true);
    const relic=mount(doc,'equipped-relic','.floating-island',true);
    const portal=mount(doc,'equipped-portal','.floating-island',true);
    let backdrop=doc.querySelector('.scene-theme-backdrop');
    if(!backdrop)backdrop=mount(doc,'scene-theme-backdrop','.quest-scene');
    put(companion,valid.companion,companionArt(valid.companion,{interactive:true,zone:'island'}),'translate(362 192) scale(.53)');
    put(island,valid.island,islandDecoration(valid.island));
    put(relic,valid.relic,valid.relic==='relic-default'?'':`<g class="shop-relic-core">${(expansion?.premium(valid.relic)||expansion?.relic(valid.relic)||relics[items.get(valid.relic).variant])}</g>`,'translate(278 62) scale(.88)');
    put(portal,valid.portal,valid.portal==='portal-default'?'':(expansion?.portal(valid.portal)||portals[items.get(valid.portal).variant]),'translate(220 123) scale(.57)');
    put(backdrop,valid.theme,themeBackdrop(items.get(valid.theme).variant));
    let fx=doc.getElementById('equipped-extra-fx');
    const sharedFx=islandEffects?.has(valid.fx)===true;
    if(sharedFx||expansion?.has(valid.fx,'fx'))fx=mount(doc,'equipped-extra-fx',doc.getElementById('equipped-fx-weather-layer')?'#equipped-fx-weather-layer':'.floating-island',true);
    if(fx){
      const renderer=sharedFx?'island':'legacy';
      if(fx.getAttribute('data-fx-renderer')!==renderer)fx.setAttribute('data-fx-renderer',renderer);
      put(fx,valid.fx,sharedFx?islandEffects.scene(valid.fx,'home'):expansion?.has(valid.fx,'fx')?expansion.effectScene(valid.fx,'home'):'');
      syncTerrainFloat(doc,fx);
    }
    (nodeProgressBars||root.FocusProgressBars)?.decorate(doc);
    return valid;
  }

  function subjectIslandPreview(itemId,large=false,equipped={}){
    const item=items.get(itemId);if(!item?.slot.startsWith('campus'))return '';
    const custom=large?architecture?.detail(itemId):architecture?.preview(itemId);if(custom)return custom;
    const subject={campusmath:'math',campuscs:'cs',campuspolitics:'politics',campusenglish:'english'}[item.slot];
    const art=typeof module==='object'&&module.exports?require('./expedition-art.js'):root.FocusExpeditionArt;
    return art?.subjectPreview(subject,large,{...equipped,[item.slot]:itemId})||'';
  }
  return {preview,apply,islandDecoration,islandPreview,archipelagoPreview,subjectIslandPreview,companionArt};
});
