(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./campfire-art.js'), require('./quest-art.js'), require('./shop-expansion.js'));
  else root.FocusCampWorldArt = factory(root.FocusCampfireArt, root.QuestArt, root.FocusShopExpansion);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (campfireArt, questArt, expansion) {
  'use strict';

  const catalog = {
    camp: ['camp-default', 'camp-pine', 'camp-lake', 'camp-snow', 'camp-aurora'],
    fire: ['fire-default', 'fire-copper', 'fire-lantern', 'fire-blue', 'fire-star'],
    tent: ['tent-default', 'tent-patchwork', 'tent-ranger', 'tent-canopy', 'tent-observatory'],
    campgear: ['campgear-default', 'campgear-tea', 'campgear-books', 'campgear-picnic', 'campgear-music'],
    campglow: ['campglow-default', 'campglow-fireflies', 'campglow-petals', 'campglow-snow', 'campglow-stardust'],
    chatframe: ['chatframe-default', 'chatframe-linen', 'chatframe-wood', 'chatframe-parchment', 'chatframe-constellation'],
    camptrail: ['trail-default', 'trail-stone', 'trail-stars'],
    campmark: ['campmark-default', 'campmark-chimes', 'campmark-moon'],
  };
  const slots = Object.keys(catalog);
  const characters = ['guide', 'hearth', 'wanderer', 'stargazer'];
  // Top-left positions leave the player beside each station, clear of furniture and labels.
  const playerPositions = {home:[550,500], guide:[437,414], hearth:[438,563], wanderer:[729,445], stargazer:[680,359]};
  const palettes = {
    default: {sky:'#171d31', ridge:'#293746', far:'#364a4d', grass:'#58645a', edge:'#839078', side:'#3d4850', water:'#334b5b', foliage:'#496763'},
    pine: {sky:'#152c30', ridge:'#243f40', far:'#35564d', grass:'#4e6a55', edge:'#8b9d77', side:'#344e46', water:'#345557', foliage:'#3d6652'},
    lake: {sky:'#172b40', ridge:'#344b64', far:'#4a6470', grass:'#5c7165', edge:'#a1aa88', side:'#415660', water:'#447288', foliage:'#4b756f'},
    snow: {sky:'#242c46', ridge:'#465571', far:'#788b9d', grass:'#a3b3b7', edge:'#d7dfd6', side:'#627784', water:'#5b8394', foliage:'#607e80'},
    aurora: {sky:'#20243c', ridge:'#384859', far:'#4b6670', grass:'#687777', edge:'#a6b6a0', side:'#46566c', water:'#48667c', foliage:'#59797e'},
  };
  function normalize(equipment) {
    const source = equipment && typeof equipment === 'object' && !Array.isArray(equipment) ? equipment : {};
    return Object.fromEntries(slots.map(slot => {
      const value = Object.prototype.hasOwnProperty.call(source, slot) ? source[slot] : undefined;
      return [slot, (catalog[slot].includes(value)||expansion?.has(value,slot)) ? value : catalog[slot][0]];
    }));
  }
  const variant = (eq, slot) => eq[slot].slice(eq[slot].indexOf('-') + 1);
  const star = (x,y,r,color,attrs='') => `<path ${attrs} d="M${x} ${y-r}l${r*.28} ${r*.72} ${r*.72} ${r*.28}-${r*.72} ${r*.28}-${r*.28} ${r*.72}-${r*.28}-${r*.72}-${r*.72}-${r*.28} ${r*.72}-${r*.28}Z" fill="${color}"/>`;
  function pine(x,y,s,color,snow=false) {
    return `<g class="camp-world-tree" transform="translate(${x} ${y}) scale(${s})"><ellipse cy="8" rx="25" ry="9" fill="#172c36" opacity=".17"/><path d="M-4-30h8v39h-8Z" fill="#776f67"/><path d="m0-95 20 34H10l26 37H20L42 6 0-2-42 6l22-30h-16l26-37h-10Z" fill="${color}"/><path d="m0-95 20 34H10l26 37H20L42 6 0-2Z" fill="#1f3c45" opacity=".24"/>${snow?'<path d="m0-95 20 34-20-7-20 7Zm0 40 27 35L0-28l-27 8Z" fill="#d1dbd5"/>':''}</g>`;
  }
  function lantern(x,y,s=1) {
    return `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="6" rx="16" ry="5" fill="#182b34" opacity=".3"/><path d="M0 4v-46q0-8 9-8h7" stroke="#9b977f" stroke-width="3" stroke-linecap="round"/><path d="M15-48v6m-6 1h12l3 18H6Z" fill="#d5b67f" stroke="#938574" stroke-width="2"/><path d="M11-37h8v10h-8Z" fill="#ffe1a2"/><circle class="camp-world-lantern-glow" cx="15" cy="-33" r="21" fill="#f2c989" opacity=".09"/></g>`;
  }
  function landscape(eq) {
    const theme = variant(eq,'camp'), p = expansion?.campPalette(eq.camp)||palettes[theme], snow = theme === 'snow';
    const trees = [[165,367,1.16],[216,324,.84],[267,299,.7],[356,264,.7],[1003,400,1.13],[1063,460,1.47],[952,318,.85],[921,291,.64]];
    return `<g class="camp-world-landscape" data-skin-slots="camp" data-camp-part="landscape">
      <rect width="1200" height="760" rx="34" fill="${p.sky}"/>
      <ellipse cx="610" cy="390" rx="530" ry="270" fill="#7d7a7e" opacity=".065"/>
      ${theme==='aurora'?'<g class="camp-world-aurora"><path d="M60 65Q260 180 457 105T1130 55L1090 135Q770 75 522 172T60 65Z" fill="#5a9d95" opacity=".26"/><path d="M200 30Q395 129 590 65T1170 88Q949 150 728 116T200 30Z" fill="#9a8ebe" opacity=".21"/><path d="M101 85Q298 161 470 113T1091 102" stroke="#b0d2b1" stroke-width="4" opacity=".25"/></g>':''}
      <circle cx="918" cy="112" r="60" fill="#d6ceb0" opacity=".025"/><circle cx="918" cy="112" r="39" fill="#d6ceb0" opacity=".05"/>
      <path d="M925 86a28 28 0 1 0 14 43 31 31 0 0 1-14-43Z" fill="#d9d0b3"/>
      ${[[109,109,2],[193,157,1.6],[300,77,2.2],[436,121,1.8],[527,67,2.4],[644,108,2],[742,55,1.6],[836,166,2],[1045,148,2.1],[1103,79,1.5],[597,186,1.8]].map(([x,y,r],i)=>star(x,y,r,'#d8d4c2',`class="camp-world-star" style="--camp-delay:-${i*.7}s" opacity=".65"`)).join('')}
      <path d="M0 301 90 251 145 269 228 180 306 245 376 204 468 273 559 216 642 249 757 187 842 249 950 198 1037 244 1112 193 1200 246V473H0Z" fill="${p.ridge}"/>
      <path d="M0 344Q144 280 257 319L390 253 516 316 656 281 776 339 930 277 1200 349V489H0Z" fill="${p.far}" opacity=".83"/>
      ${snow?'<path d="m190 217 38-37 49 41-35-12-14-12-14 14Zm530 0 37-30 38 29-26-9-12-6-19 12Z" fill="#c0ced1"/>':''}
      <path d="M0 379Q193 333 346 387T763 371Q1011 326 1200 396V760H0Z" fill="${p.water}"/>
      <g class="camp-world-water" stroke="#a5c3c3" stroke-linecap="round" opacity=".22" fill="none"><path d="M36 431h132m-98 19h114m816-50h94m-50 23h105M32 586h113m908-49h113m-927 164h192m449-1h179" stroke-width="2"/><path class="camp-world-ripple" d="M3 487h134m-83 20h123m869-29h155M48 642h105m844-15h122M549 723h157" stroke-width="2" stroke-dasharray="28 9 58 19"/></g>
      ${theme==='lake'?'<g class="camp-world-lake-pier"><path d="m916 531 211 73-58 27-209-78Z" fill="#927f70"/><path d="m878 558 194 72v13l-194-73Z" fill="#665e5d"/><path d="m902 545 57-21m-25 32 57-21m-25 32 57-21m-25 32 57-21m-25 32 57-21" stroke="#c0a68a" stroke-width="2"/><path d="M1021 625v29m66-35v29" stroke="#625c5c" stroke-width="8"/><path d="m1102 572 41 14-33 17-42-14Z" fill="#d1b98e"/><path d="m1068 589 42 22 33-25-33 17Z" fill="#887767"/></g>':''}
      <ellipse cx="607" cy="673" rx="426" ry="55" fill="#112131" opacity=".28"/>
      <path d="m157 401 347-159 403 64 164 155-104 148-350 103-383-137Z" fill="${p.side}"/>
      <path d="m157 401 77 174 383 137-23-80-358-130Z" fill="#1c3040" opacity=".3"/>
      <path d="m594 632 23 80 350-103 104-148-53 50-82 72Z" fill="#243346" opacity=".3"/>
      <path d="m157 401 347-159 403 64 164 155-135 122-342 91-358-130Z" fill="${p.grass}"/>
      <path d="m157 401 347-159 403 64 164 155-135 122-342 91-358-130Z" stroke="${p.edge}" stroke-width="5" opacity=".7"/>
      <path d="m217 420 287-135 385 57 119 118-100 89-321 88-311-116Z" fill="${snow?'#c4d1cf':'#7f8968'}" opacity=".2"/>
      <path d="m237 523 117 52 67 73-129-46Zm612 92 87-32 69-62-31 78Z" fill="${p.edge}" opacity=".18"/>
      ${expansion?.terrainOrnaments(eq.camp)||''}${trees.map(([x,y,s])=>pine(x,y,s,p.foliage,snow)).join('')}
      ${theme==='pine'?[[120,432,1.8],[1090,520,1.6],[376,264,.9],[990,344,1.15]].map(([x,y,s])=>pine(x,y,s,'#35584a')).join(''):''}
      ${snow?'<g class="camp-world-snowbanks" fill="#d5dfd9" opacity=".85"><path d="M238 495q48-21 87 4-20 23-74 18Z"/><path d="M691 631q71-30 133-18-50 29-133 37Z"/><path d="M861 353q46-21 86 5-35 14-86-5Z"/></g>':''}
      ${theme==='aurora'?'<g class="camp-world-ice-crystals"><path d="m180 479 9-45 15 32-6 24Z" fill="#8db9be"/><path d="m188 487 27-38 6 36-23 6Z" fill="#b4b4d2"/><path d="m977 534 8-37 13 21-3 26Z" fill="#93c3c4"/></g>':''}
      <g fill="${p.edge}" opacity=".55"><path d="m275 448 8-4 10 4-7 5Zm677 42 10-4 11 7-11 5Zm-293 154 15-5 13 8-17 5Zm-155-333 10-5 15 5-12 6Z"/></g>
      <g stroke="${p.edge}" stroke-width="2" stroke-linecap="round" opacity=".7"><path d="m451 343 2-11m-2 11-7-7m7 7 7-8M749 580v-13m0 13-8-7m8 7 7-10M934 435l-1-11m1 11-7-6"/></g>
    </g>`;
  }
  function trails(eq) {
    if(expansion?.has(eq.camptrail,'camptrail'))return expansion.trail(eq.camptrail,true);
    const type = variant(eq,'camptrail'), path = 'M331 396Q422 360 530 432T859 326M330 544Q470 550 566 485T852 531M578 656Q537 571 579 487';
    return `<g data-skin-slots="camptrail" data-camp-part="trail" class="camp-world-trail"><path d="${path}" stroke="#283e42" stroke-width="35" opacity=".16" fill="none" stroke-linecap="round"/><path d="${path}" stroke="${type==='stone'?'#a0aaa0':type==='stars'?'#697a90':'#aca18a'}" stroke-width="25" opacity=".65" fill="none" stroke-linecap="round"/>
      ${type==='stone'?`<path d="${path}" stroke="#c6c5b0" stroke-width="21" fill="none" stroke-dasharray="17 7" stroke-linecap="butt"/>`:type==='stars'?`<path d="${path}" stroke="#c6bbce" stroke-width="2" fill="none" stroke-dasharray="3 17"/>${[[380,385],[475,400],[631,445],[726,399],[800,354],[392,545],[496,517],[713,490],[794,515],[566,578],[577,632]].map(([x,y],i)=>star(x,y,4,'#e0d2ba',`class="camp-world-trail-star" style="--camp-delay:-${i*.4}s"`)).join('')}`:`<path d="${path}" stroke="#c8b99a" stroke-width="2" opacity=".35" fill="none" stroke-dasharray="2 16"/>`}
      <path d="m541 659 39-14 30 11-40 15Z" fill="#b0a38b"/><path d="m545 672 29-10 30 10-30 12Z" fill="#8e8878"/><path d="m550 684 23-8 26 9-24 11Z" fill="#7b7a72"/></g>`;
  }
  function tent(eq) {
    if(expansion?.has(eq.tent,'tent'))return expansion.campPart(eq.tent);
    const type=variant(eq,'tent');
    let shape;
    if(type==='observatory') shape='<path d="M-92 32c0-81 45-136 106-122 52 10 76 57 76 106L1 60Z" fill="#818ca8"/><path d="M14-90c52 10 76 57 76 106L1 60V-84Z" fill="#566481"/><path d="M-92 32c0-81 45-136 106-122 52 10 76 57 76 106M14-90Q-31-32-20 49M14-90Q53-35 58 33M-84-12l161-8" stroke="#b6bbc7" stroke-width="3"/><path d="m-18 48 0-49q11-29 30-14l18 12v39Z" fill="#263e56"/><circle cx="-52" cy="-8" r="14" fill="#c9bb96"/><circle cx="-52" cy="-8" r="10" fill="#426076"/>';
    else if(type==='canopy') shape='<path d="M-90-19v78m168-90v71M-16-47v94" stroke="#aaa18a" stroke-width="5"/><path d="m-108-16 101-79 108 58-25 24-85-28-74 47Z" fill="#b4a6ac"/><path d="M-7-95 101-37 76-13-9-41Z" fill="#89879d"/><path d="m-108-16 25 22 74-47 85 28 25-24" stroke="#e4ccaa" stroke-width="3"/><path d="m-83 6 4 16m72-60 1 18m83 7 0 17" stroke="#cfb991" stroke-width="3"/><path d="m-87 45 68-27 89 26-69 29Z" fill="#9a8b8d"/><path d="m-54 39 29-11 24 6-26 13Zm56 15 28-9 22 6-27 11Z" fill="#d0bcad"/>';
    else {
      const ranger=type==='ranger', patch=type==='patchwork';
      shape=`<path d="m-101 38 93-128 111 109-97 46Z" fill="${ranger?'#67897b':patch?'#bc9fa5':'#a69892'}"/><path d="M-8-90 103 19 6 65Z" fill="${ranger?'#456c64':patch?'#8a9da3':'#747c8a'}"/><path d="m-101 38 93-128L6 65Z" fill="${ranger?'#94a990':patch?'#d4b797':'#c2b49b'}"/>${patch?'<path d="m-64-13 56-77 4 76Z" fill="#bfa093"/><path d="m-4-14 55-20 52 53L6 65Z" fill="#8faaa3"/><path d="m-64-13 60-1 10 79" stroke="#eddbbf" stroke-width="2" stroke-dasharray="5 4"/>':''}<path d="m-65 49 56-103 9 115Z" fill="#39484e"/><path d="m-63 48 54-102-21 92Z" fill="${ranger?'#789887':'#ac9e8d'}"/><path d="M-8-95 107 17M-105 39-8-95" stroke="#dbccb0" stroke-width="3"/><path d="m-89 16-39 40m221-37 33 19" stroke="#c6baa1" stroke-width="2"/><path d="m-129 51 1 12m126-158 0-12m130 139 1 12" stroke="#aa9b82" stroke-width="4"/>${ranger?'<path d="m33-57 67 39 6 27-63-32Z" fill="#a3b29a"/><path d="m40-25 6 61m60-27 7 25" stroke="#b9ad90" stroke-width="3"/><rect x="-75" y="22" width="29" height="31" rx="5" fill="#9c8a6a"/>':''}`;
    }
    return `<g data-skin-slots="tent" data-camp-part="tent" transform="translate(420 302) scale(.9)"><rect data-camp-hit="tent" x="-125" y="-102" width="250" height="169" rx="12" fill="transparent"/><ellipse cy="48" rx="129" ry="36" fill="#1d3540" opacity=".24"/>${shape}</g>`;
  }
  function marker(eq) {
    if(expansion?.has(eq.campmark,'campmark'))return expansion.campPart(eq.campmark);
    const type=variant(eq,'campmark');
    const body=type==='moon'?'<path d="M-61 19v-84q64-74 126-3v81" fill="none" stroke="#a6b2b1" stroke-width="9"/><path d="M-61-35q60-47 126 0" fill="none" stroke="#e0d2aa" stroke-width="2"/><path d="M6-83a20 20 0 1 0 12 31A22 22 0 0 1 6-83Z" fill="#e5d7b4"/><path d="M-56-8 0 12 60-13" stroke="#b8bba7" stroke-width="2"/>'+star(-45,-51,5,'#e4d8bb')+star(51,-41,4,'#e4d8bb'):
      type==='chimes'?'<path d="M-65 28v-93M65 12v-86M-75-62 72-82" stroke="#9c967d" stroke-width="7" stroke-linecap="round"/><g class="camp-world-chimes"><path d="m-41-67 0 23m38-29v31m40-37v24" stroke="#d2c2a0" stroke-width="2"/><path d="m-48-45 14-2 1 26-14 2Zm37 4 16-2v36l-16 2Zm40-15 16-2v28l-16 2Z" fill="#9ebab7"/><path d="m-43-14 1 17m38-8 1 18m38-41 1 19" stroke="#c9bb93" stroke-width="2"/><path d="m-48 3 12-2 0 12-12 2Zm38 9 11-2 0 15-11 2Zm38-19 12-2 0 12-12 2Z" fill="#d9c8a5"/></g>':
      '<path d="M-43 22v-77m91 56v-78M-51-50 56-65" stroke="#958a75" stroke-width="6" stroke-linecap="round"/><path d="m-45-42 94-14" stroke="#c5b593" stroke-width="2"/><path d="m-34-44 10 17 8-20m20-3 10 18 9-20m17-3 8 14 7-17" fill="#bbab95"/>';
    return `<g data-skin-slots="campmark" data-camp-part="marker" transform="translate(625 308)"><rect data-camp-hit="campmark" x="-76" y="-110" width="152" height="141" rx="10" fill="transparent"/><ellipse cy="17" rx="80" ry="21" fill="#273b46" opacity=".14"/>${body}</g>`;
  }
  function flame(type) {
    const colors=type==='blue'?['#639ab5','#a3d4d7','#e0efce']:type==='star'?['#a291c8','#d4b7de','#f4e0b5']:['#ce8970','#efb97e','#ffe2a5'];
    return `<g class="camp-world-flame"><path d="M-5-98c4 24 22 31 20 49 10-7 12-18 10-26 30 40 22 69-24 72-43 2-52-26-35-47-1 11 4 15 9 17-5-22 12-38 20-65Z" fill="${colors[0]}"/><path d="M-4-73c3 18 18 28 15 43 7-3 10-7 11-12 14 27-2 37-23 39-23 1-36-13-24-33 1 9 5 13 10 13-2-18 8-35 11-50Z" fill="${colors[1]}"/><path d="M-1-42c1 11 13 17 10 26 4-1 7-4 7-7 7 12-4 20-18 20-15 0-22-10-13-21 0 7 4 8 7 10-3-11 5-22 7-28Z" fill="${colors[2]}"/></g>`;
  }
  function fire(eq, small=false) {
    if(expansion?.has(eq.fire,'fire'))return expansion.campFire(eq.fire,small);
    const type=variant(eq,'fire'), color=type==='blue'?'#a0d6d5':type==='star'?'#c8b5e2':'#e7bb89';
    let basin;
    if(type==='copper') basin='<path d="m-35 6-11 21m77-21 12 21" stroke="#8b7568" stroke-width="6"/><path d="M-49-6h98Q46 25 0 25T-49-6Z" fill="#b38e73"/><path d="M0-6h49Q46 25 0 25Z" fill="#846958"/><ellipse cy="-6" rx="49" ry="13" fill="#654f4c" stroke="#dfb68d" stroke-width="4"/>';
    else if(type==='lantern') basin='<path d="M-15-95v-17q15-15 30 0v17" stroke="#c7b58f" stroke-width="4"/><path d="m-53-81 53-26 53 26-16 11h-73Z" fill="#999486"/><path d="M-43-71h86V8h-86Z" fill="#b9a180"/><path d="M-34-65h68v64h-68Z" fill="#6c6158"/><path d="M-30-61h60v58h-60Z" fill="#d7b17d" opacity=".4"/><path d="M-49 7h98v13h-98Z" fill="#827663"/>';
    else if(type==='blue') basin='<ellipse cy="7" rx="52" ry="18" fill="#547385" stroke="#a8cbd1" stroke-width="3"/><path d="m-52 1 11-31 15 26m53 0 20-24 8 34" fill="#80a4b7" stroke="#c6dbdc" stroke-width="2"/><path d="M-42 14q41 20 84 0" stroke="#aedcdb" stroke-width="3"/>';
    else if(type==='star') basin='<ellipse cy="7" rx="54" ry="18" fill="#706b91" stroke="#bfb0d3" stroke-width="3"/><path d="m-46 7 46-22 46 22L0 26Z" stroke="#d8c6a4" stroke-width="2"/><path d="m-39-15 8 20m62 0 8-20M0-27V5" stroke="#c1afbb" stroke-width="3"/>';
    else basin='<g fill="#8e9690" stroke="#b4b7a0" stroke-width="1.5"><ellipse cx="-38" cy="2" rx="13" ry="9"/><ellipse cx="-23" cy="-11" rx="14" ry="8"/><ellipse cx="18" cy="-12" rx="15" ry="8"/><ellipse cx="43" cy="1" rx="12" ry="9"/><ellipse cx="25" cy="16" rx="16" ry="9"/><ellipse cx="-9" cy="20" rx="15" ry="9"/><ellipse cx="-36" cy="15" rx="13" ry="9"/></g><path d="m-28 5 52 7m-46 1 45-17" stroke="#6a554d" stroke-width="12" stroke-linecap="round"/><path d="m-25 5 49 7" stroke="#a18264" stroke-width="3"/>';
    const fireTransform=type==='lantern'?'translate(0 -2) scale(.62)':type==='copper'?'translate(0 -9) scale(.86)':'';
    return `<g data-skin-slots="fire" data-camp-part="fire" class="camp-world-fire"${small?'':' transform="translate(596 467)"'}><ellipse class="camp-world-firelight" cy="18" rx="123" ry="58" fill="${color}" opacity=".09"/><ellipse class="camp-world-firelight" cy="15" rx="84" ry="35" fill="${color}" opacity=".09"/>${basin}<g${fireTransform?` transform="${fireTransform}"`:''}>${flame(type)}</g>${type==='lantern'?'<path d="M0-69V6m-42-39h84" stroke="#aa967a" stroke-width="4"/>':''}${type==='star'?star(0,-106,10,'#f3ddb7','class="camp-world-star"'):''}<g class="camp-world-embers" fill="${color}">${[[-21,-76,2.2],[23,-106,1.7],[-8,-128,1.5],[34,-52,1.8]].map(([x,y,r],i)=>`<circle class="camp-world-ember" cx="${x}" cy="${y}" r="${r}" style="--camp-delay:-${i*.9}s"/>`).join('')}</g>${type==='lantern'?'':`<g class="camp-world-smoke" fill="none" stroke="#c3bbae" stroke-width="3" opacity=".16"><path class="camp-world-smoke-thread" d="M-3-118q-17-16-3-31t-5-30"/><path class="camp-world-smoke-thread" d="M12-135q16-18 5-31" style="--camp-delay:-3s"/></g>`}</g>`;
  }
  function furnishings(eq) {
    if(expansion?.has(eq.campgear,'campgear'))return expansion.campPart(eq.campgear);
    const type=variant(eq,'campgear');
    let prop;
    if(type==='tea') prop='<path d="M-49-4h98v13h-98Zm12 13v20m74-20v20" fill="#aa9076" stroke="#aa9076" stroke-width="5"/><path d="m-52-7 57-20 50 15L-4 10Z" fill="#cbb492"/><path d="M-11-24q-2-14 12-15t15 13l-1 12q-13 8-27-1Z" fill="#9caf9e"/><path d="m14-27 17-9-4 15-14 4" fill="#a5b5a0"/><path d="M-11-27q-15-9-13 5l12 3" stroke="#bed0b4" stroke-width="4"/><ellipse cx="2" cy="-37" rx="11" ry="4" fill="#d3d4b3"/><circle cx="2" cy="-42" r="3" fill="#ded6b2"/><path d="M-37-13h12v9q-6 4-12 0Zm54 2h12v8q-6 4-12 0Z" fill="#ead3a8"/><path class="camp-world-tea-steam" d="M-31-21q-4-6 0-12m35-14q-4-6 1-11" fill="none" stroke="#e3d4b5" stroke-width="2" opacity=".7"/>';
    else if(type==='books') prop='<path d="m-44 6 58-17 36 10-57 20Z" fill="#9f876c"/><path d="m-44 6 1 17 39 11 1-15Zm39 13 55-20v18L-4 34Z" fill="#74685b"/><path d="m-23-10 42-12 27 8-40 13Z" fill="#a597b4"/><path d="m-23-10 0 9L6 9V-1Zm29 9 40-13v9L6 9Z" fill="#d4c8ab"/><path d="m-34-28 34-7 20 9 31-1-4 19-31 1-23-9-30 5Z" fill="#e2d0a9"/><path d="m20-26-4 19m-33-19 15-3m-14 7 19-2m19 1 16-1m-18 5 17-1" stroke="#ad9674" stroke-width="1.5"/>';
    else if(type==='picnic') prop='<path d="m-68-7 79-27 63 33-80 29Z" fill="#b69b98"/><path d="m-49-13 62 34m-44-40 62 34m-44-40 62 34m-105-7 81-29m-63 39 81-28" stroke="#d8c0b2" stroke-width="5"/><path d="m-38-31 36-3 6 25-39 5Z" fill="#b89973"/><path d="m-29-32-1-9q12-15 20-1l3 9" fill="none" stroke="#e0bf94" stroke-width="3"/><path d="m-34-24 32-3m-30 11 31-3" stroke="#8e785f" stroke-width="2"/><ellipse cx="28" cy="1" rx="19" ry="7" fill="#dccbaa"/><path d="m18 0 11-12 10 12Z" fill="#d1a674"/><circle cx="-6" cy="11" r="6" fill="#b77873"/>';
    else if(type==='music') prop='<path d="m-40 3 63-17 18 8-63 20Z" fill="#b2a18b"/><path d="m-35 9 0 16m65-28v23" stroke="#80735f" stroke-width="6"/><g transform="translate(-3 -14) rotate(16)"><path d="M-25-45q21 10 46-2l-4 45q-22 24-41 0Z" fill="#ae8f70" stroke="#d6bb91" stroke-width="4"/><path d="M-18-36q15 5 30-3L8-1q-11 10-23-1Z" fill="#5f6164"/><path d="M-13-33v34m7-34v38m7-39v36m7-37v32" stroke="#d6c29d" stroke-width="1.5"/></g><path class="camp-world-music-note" d="m40-42 0 17q-9 5-11 0-1-6 11-6m0-11 9-3v8" fill="none" stroke="#d6c9ad" stroke-width="2"/>';
    else prop='<path d="m-56 0 82-23 22 9-81 26Z" fill="#aa977b"/><path d="m-33 12 81-26v13l-81 28Zm-23-12 23 12v13l-23-13Z" fill="#7c7061"/><path d="m-42 10-4 20m73-34 0 23" stroke="#776958" stroke-width="8"/><path d="m-44 1 64-19m-49 24 64-20" stroke="#d0b696" stroke-width="2"/>';
    return `<g data-skin-slots="campgear" data-camp-part="furnishing" transform="translate(697 555)"><ellipse cy="22" rx="75" ry="26" fill="#26373f" opacity=".15"/>${prop}</g>`;
  }
  function notice(eq) {
    if(expansion?.has(eq.chatframe,'chatframe'))return expansion.campPart(eq.chatframe);
    const type=variant(eq,'chatframe');
    const colors={default:['#9c927f','#d4c6a7'],linen:['#a69e8b','#e1d6bc'],wood:['#806b59','#bcab88'],parchment:['#bca17e','#e1caa1'],constellation:['#777992','#b8bad0']}[type];
    return `<g data-skin-slots="chatframe" data-camp-part="notice" transform="translate(452 602)"><path d="M-24 7v24m50-29v20" stroke="#8f8572" stroke-width="5"/><path d="m-40-45 78-9 3 62-80 11Z" fill="${colors[0]}"/><path d="m-32-37 62-8 3 45-64 10Z" fill="${colors[1]}"/>${type==='linen'?'<path d="m-29-34 56-7 2 40-57 9Z" stroke="#a39980" stroke-width="1.5" stroke-dasharray="3 3"/>':type==='wood'?'<path d="m-36-46 3 60m65-69 3 61m-74-48 79-10" stroke="#594f49" stroke-width="3"/>':type==='parchment'?'<path d="m-34-37 61-8 5 7-64 9Zm3 45 64-10-6 8-54 8Z" fill="#f0dab0"/>':type==='constellation'?`<path d="m-23-29 19 8 22-15 5 28" stroke="#6a7396" stroke-width="1.5"/>${star(-23,-29,3,'#f0e0b9')}${star(18,-36,3,'#f0e0b9')}`:''}<path d="m-20-15 33-4m-33 11 41-5m-40 12 25-3" stroke="${type==='constellation'?'#747b9a':'#ad9b7e'}" stroke-width="2" stroke-linecap="round"/></g>`;
  }
  function person(id,x,y) {
    // Existing character art keeps every NPC's identity; only its viewport changes.
    const avatar=campfireArt.avatar(id).replace(/<svg\b[^>]*>/, '<svg class="camp-world-avatar" viewBox="0 0 64 72" width="88" height="99" aria-hidden="true" focusable="false" fill="none" stroke="none" overflow="visible">');
    return `<g class="camp-world-person" data-character="${id}" transform="translate(${x} ${y})"><g class="camp-world-person-motion">${avatar}</g></g>`;
  }
  function station(id,x,y,label,props,npc,interactive,selected) {
    return `<g class="camp-world-station" data-camp-station="${id}" data-camp-place="${id}" data-selected="${selected===id}"${interactive?` role="button" tabindex="0" aria-label="${label}，点击交谈" aria-pressed="${selected===id}"`:''} transform="translate(${x} ${y})"><ellipse class="camp-world-station-hit" cx="10" cy="12" rx="127" ry="88" fill="transparent"/><ellipse class="camp-world-station-halo" cx="10" cy="39" rx="113" ry="39" fill="#e6ca9b" opacity="0"/><ellipse class="camp-world-station-rim" cx="10" cy="44" rx="112" ry="38" fill="none" stroke="#e4cfab" stroke-width="2" opacity="0"/><g class="camp-world-station-lift">${props}${npc}</g><g class="camp-world-station-label" transform="translate(7 83)"><rect x="-100" y="-17" width="200" height="31" rx="15.5" fill="#1e303b" opacity=".82"/><text y="4" text-anchor="middle" fill="#e5d6b9" font-size="16" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="550">${label}</text><circle class="camp-world-talk-dot" cx="88" cy="-2" r="3" fill="#edd5a2" opacity="0"/></g></g>`;
  }
  function stations(interactive,selected) {
    const map='<ellipse cx="22" cy="33" rx="87" ry="23" fill="#273a3e" opacity=".2"/><path d="M-15 13v35m83-61v38m-13-6v43" stroke="#82755f" stroke-width="7"/><path d="m-44-2 70-30 71 22-71 32Z" fill="#b5a384"/><path d="m-44-2 1 9 70 24 70-31v-10L26 22Z" fill="#857961"/><path d="m-31-5 57-23 52 17-57 26Z" fill="#ddd0ac"/><path d="m-17-7 21 6 14-13 20 7 15-4m-50 9 15 9 27-19" fill="none" stroke="#a0a387" stroke-width="3"/><path d="m9-9 11 12 17-8" fill="none" stroke="#b99c80" stroke-width="1.5"/><circle cx="25" cy="-2" r="4" fill="#a8796e"/><path d="m63-15 9 3-7 4-8-3Z" fill="#799789"/><path d="M72-33v21" stroke="#bbab87" stroke-width="2"/><path d="m72-34 12 5-12 5Z" fill="#c5aa87"/>';
    const hearth='<path d="m-85 28 83-31 102 31-86 36Z" fill="#8e826c"/><path d="m-85 28 1 12 98 36 86-35V28L14 64Z" fill="#655f54"/><path d="m-69 31 77 27m-55-37 78 28m-54-38 78 28" stroke="#b8a58a" stroke-width="2"/><path d="m15 21 37-13 36 13-36 15Z" fill="#b8a385"/><path d="m21 26 0 20m61-20v20" stroke="#82745f" stroke-width="5"/><path d="M43 8q0-12 12-12t12 12v8q-12 6-24 0Z" fill="#94a798"/><path d="m64 7 13-6-4 13-10 2" fill="#b0bea7"/><path d="M42 8q-13-7-10 5l11 3" stroke="#b9c7ae" stroke-width="3"/><ellipse cx="55" cy="-2" rx="9" ry="3" fill="#d6d2ae"/><path d="M24 15h11v9q-5 4-11 0Zm43 5h11v8q-5 4-11 0Z" fill="#e2cba2"/><path class="camp-world-tea-steam" d="M53-11q-4-6 0-13m-23 32q-3-5 0-10" fill="none" stroke="#e8d5b4" stroke-width="2" opacity=".7"/>';
    const library='<ellipse cx="14" cy="40" rx="95" ry="28" fill="#2d3d42" opacity=".2"/><path d="m-11-72 80-16 25 17v99L15 56-11 37Z" fill="#9a8e74"/><path d="m-11-72 26 21v107l-26-19Z" fill="#6c6857"/><path d="m15-51 79-20v99L15 56Z" fill="#706b5a"/><path d="m20-45 66-18v81L20 43Z" fill="#494f4b"/><path d="M16-17 91-37M16 15l75-23m-75 55 75-24" stroke="#b5a080" stroke-width="6"/><g stroke-width="8"><path d="m28-44 1 22m12-26 2 22m13-28 2 22m13-27 2 22" stroke="#a0ac97"/><path d="m29-7 1 20m12-23 2 19m13-24 2 21" stroke="#ad91a0"/><path d="m69-19 4 22m7-26 4 22" stroke="#b6a37c"/><path d="m31 24 0 13m12-17 1 13m12-17 1 13m12-17 1 13" stroke="#8a9ca1"/></g><path d="m-15 26 40 14-23 11-38-15Z" fill="#d7c6a4"/><path d="m-14 30 15 6m2-1 14 5" stroke="#9e8d72" stroke-width="1.5"/>';
    const observatory='<ellipse cx="8" cy="40" rx="117" ry="46" fill="#53626b"/><path d="M-109 40q117 68 234 0v13q-117 67-234 0Z" fill="#3b4c57"/><ellipse cx="8" cy="36" rx="117" ry="43" fill="#83908d"/><ellipse cx="8" cy="36" rx="99" ry="34" fill="#5b6c75" stroke="#bfc0ac" stroke-width="2"/><path d="m8 2 0 68m-98-34H105m-170-22 147 45m-143-6L80 14" stroke="#a7b1a5" stroke-width="1.5" opacity=".5"/><path d="m49-16-22 65m22-65 39 57m-39-57 4 73" stroke="#b7aa8a" stroke-width="5" stroke-linecap="round"/><g transform="translate(41 -30) rotate(-30)"><path d="M-27-13h92v28h-92Z" fill="#a29da4"/><path d="M-28 1h91v14h-91Z" fill="#747e90"/><rect x="56" y="-18" width="14" height="38" rx="4" fill="#cabd9e"/><ellipse cx="70" cy="1" rx="7" ry="18" fill="#85adb8"/><ellipse cx="71" cy="1" rx="4" ry="13" fill="#b8d0cb"/><path d="M-40-5h14v13h-14Z" fill="#bfb7a1"/></g><path d="M-78 21v-53m-13 48 27-11" stroke="#aca387" stroke-width="3"/><path d="m-96-41 27-8 11 16-28 9Z" fill="#bfc1b3"/><path d="m-88-36 13-4m-10 10 16-5" stroke="#748294" stroke-width="1.5"/>';
    return station('stargazer',839,313,'望舒 · 观星台',observatory,person('stargazer',-78,-51),interactive,selected)+
      station('guide',320,399,'栖灯 · 地图桌',map,person('guide',-91,-46),interactive,selected)+
      station('hearth',323,544,'阿榆 · 炉边茶歇',hearth,person('hearth',-77,-45),interactive,selected)+
      station('wanderer',849,533,'闻舟 · 旅途手记',library,person('wanderer',-75,-44),interactive,selected);
  }
  function ambience(eq) {
    if(expansion?.has(eq.campglow,'campglow'))return expansion.effectScene(eq.campglow,'camp');
    const type=variant(eq,'campglow');
    const positions=[[188,290],[245,469],[399,417],[475,192],[729,273],[782,462],[939,473],[1043,325],[466,546],[618,249],[702,626],[940,631],[190,565],[1063,594],[527,369],[814,165]];
    return `<g data-skin-slots="campglow" data-camp-part="ambience" pointer-events="none">${type==='default'?[[523,479],[641,412],[669,505]].map(([x,y],i)=>`<circle class="camp-world-ambient" cx="${x}" cy="${y}" r="1.7" fill="#e7c58d" style="--camp-delay:-${i*1.6}s" opacity=".6"/>`).join(''):positions.map(([x,y],i)=>{
      const attrs=`class="camp-world-ambient camp-world-ambient-${type}" style="--camp-delay:-${i*.63}s"`;
      if(type==='fireflies') return `<g ${attrs}><circle cx="${x}" cy="${y}" r="8" fill="#d4dca0" opacity=".1"/><circle cx="${x}" cy="${y}" r="2.3" fill="#e1e3a6"/></g>`;
      if(type==='petals') return `<path ${attrs} d="m${x} ${y}q-12-9-11 0 1 7 11 0Z" fill="${i%2?'#d3afb4':'#e0c0b8'}" opacity=".7"/>`;
      if(type==='snow') return i%3?`<circle ${attrs} cx="${x}" cy="${y}" r="2.5" fill="#dce6e2" opacity=".7"/>`:`<path ${attrs} d="M${x-5} ${y}h10m-5-5v10m-3-8 6 6m0-6-6 6" stroke="#d5e1e0" stroke-width="1.4" opacity=".7"/>`;
      return star(x,y,i%3?3.5:6,'#d9cbe5',attrs);
    }).join('')}</g>`;
  }
  function player(equipment, selected) {
    const outfit=equipment && typeof equipment==='object' && !Array.isArray(equipment) && Object.prototype.hasOwnProperty.call(equipment,'avatar') ? equipment.avatar : undefined;
    // QuestArt owns the outfit allowlist; untrusted equipment never becomes an SVG attribute here.
    const avatar=questArt.avatar('player',outfit)
      .replace('class="quest-avatar-art"','class="camp-world-player-avatar"')
      .replace('width="64" height="72"','width="50" height="56.25"');
    const [x,y]=playerPositions[selected] || playerPositions.home;
    return `<g class="camp-world-player" data-camp-player="true" data-camp-destination="${selected||'home'}" data-skin-slots="avatar" style="transform:translate(${x}px,${y}px)"><ellipse cx="25" cy="55" rx="21" ry="6" fill="#172c34" opacity=".18"/>${avatar}<text x="25" y="70" text-anchor="middle" font-size="13" fill="#f0dfbb" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="650">你</text></g>`;
  }
  function trailExit(interactive) {
    return `<g class="camp-world-trail-exit" data-camp-trail="open"${interactive?' role="button" tabindex="0" aria-label="沿归途小径散步" aria-controls="return-trail-view"':''}>
      <path d="M574 678Q625 712 709 716" stroke="#23383e" stroke-width="31" fill="none"/>
      <path d="M574 674Q625 708 709 712" stroke="#938c78" stroke-width="24" fill="none"/>
      <path d="M574 674Q625 708 709 712" stroke="#c4b79a" stroke-width="22" stroke-dasharray="10 5" fill="none"/>
      <rect x="552" y="633" width="324" height="104" rx="18" fill="transparent"/>
      <g class="camp-trail-sign"><ellipse class="camp-trail-sign-glow" cx="759" cy="703" rx="99" ry="32" fill="#f3c881" opacity=".06"/>
      <path d="M709 702v-51" stroke="#9d9075" stroke-width="6"/>
      <path d="M681 640 838 637 858 668 838 699 681 696Z" fill="#324a4c" stroke="#acb89a" stroke-width="1.8"/>
      <text x="763" y="665" text-anchor="middle" fill="#e9d6ae" font-size="18" font-family="-apple-system,BlinkMacSystemFont,sans-serif">归途小径 →</text>
      <text x="763" y="686" text-anchor="middle" fill="#a7baba" font-size="11" font-family="-apple-system,BlinkMacSystemFont,sans-serif">七处风景 · 通往星辉城</text>
      <path d="M660 701v-41h11v9" stroke="#9e9980" stroke-width="2" fill="none"/>
      <path d="m665 669 12 0 3 17h-18Z" fill="#ceb57d"/><path d="M668 673h7v10h-7Z" fill="#ffe3a3"/>
      <circle class="camp-world-lantern-glow" cx="671" cy="678" r="20" fill="#f4cf8d" opacity=".12"/></g>
    </g>`;
  }
  function scene(equipment, options) {
    const eq=normalize(equipment), opts=options&&typeof options==='object'?options:{}, interactive=opts.interactive!==false;
    const selected=characters.includes(opts.selected)?opts.selected:'';
    const attrs=slots.map(slot=>`data-${slot}="${eq[slot]}"`).join(' ');
    return `<svg class="camp-world-art" viewBox="0 0 1200 760" width="1200" height="760" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none" style="stroke:none" role="${interactive?'group':'img'}" aria-label="月光下的篝火营地，地图桌、茶歇、手记书架与观星台围着温暖的篝火" data-selected="${selected}" data-interactive="${interactive}" data-skin-slots="camp fire tent campgear campglow chatframe camptrail campmark" ${attrs}>
      ${landscape(eq)}${trails(eq)}${marker(eq)}${tent(eq)}
      <g class="camp-world-hearth-floor"><ellipse cx="596" cy="475" rx="112" ry="52" fill="#77776a"/><ellipse cx="596" cy="471" rx="108" ry="49" fill="#a79c80" opacity=".6"/><ellipse cx="596" cy="471" rx="93" ry="41" fill="#6e7367"/><path d="M493 468h17m171 4h18M565 428l4 9m60 68 5 10M526 438l13 9m117 43 18 9" stroke="#c5b89a" stroke-width="2" opacity=".55"/></g>
      ${lantern(476,396,.8)}${lantern(943,566,.8)}${fire(eq)}${furnishings(eq)}${notice(eq)}${stations(interactive,selected)}${player(equipment,selected)}${ambience(eq)}${trailExit(interactive)}
    </svg>`;
  }
  function entrance(equipment) {
    const eq=normalize(equipment), p=expansion?.campPalette(eq.camp)||palettes[variant(eq,'camp')];
    return `<svg class="camp-world-entrance-art" viewBox="0 0 160 110" width="160" height="110" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none" data-fire="${eq.fire}" data-camp="${eq.camp}"><ellipse cx="80" cy="95" rx="63" ry="10" fill="#111b2c" opacity=".24"/><path d="m14 76 43-22 79 18-31 29-73-8Z" fill="${p.side}"/><path d="m14 70 43-22 79 18-31 29-73-8Z" fill="${p.grass}" stroke="${p.edge}" stroke-width="1.5"/><ellipse cx="78" cy="75" rx="32" ry="14" fill="#a8997d" opacity=".5"/><g transform="translate(79 75) scale(.51)">${fire(eq,true)}</g><path d="m19 79 22 7 13-5-23-7Z" fill="#b5a187"/><path d="m19 79 0 6 22 8 13-6v-6l-13 5Z" fill="#7d7565"/><path d="m105 84 20-8 11 4-20 9Z" fill="#b8a58a"/><path d="m105 84 0 6 11 5 20-9v-6l-20 9Z" fill="#7d7565"/></svg>`;
  }
  // A ground-level hearth, shared by the home island and shop previews.
  // This pocket stays clear in every purchased island layout.
  function roadside(equipment) {
    const eq=normalize(equipment);
    return `<g class="island-roadside-camp" data-fire="${eq.fire}" transform="translate(338 241)" fill="none" stroke="none"><ellipse class="island-camp-warmth" cy="2" rx="32" ry="12" fill="#dda56d" opacity=".1"/><ellipse cy="5" rx="22" ry="7" fill="#282737" opacity=".3"/><path d="m-33 3 14 5 8-4-15-5Z" fill="#a3927b"/><path d="m-33 3 0 4 14 5 8-4v-4l-8 4Z" fill="#736b69"/><path d="m21 5 8-4 10 3-8 5Z" fill="#777786" opacity=".7"/><g class="island-camp-fire-scale" transform="scale(.3)">${fire(eq,true)}</g></g>`;
  }
  function setSelection(container, id) {
    if(!container || typeof container.querySelectorAll!=='function') return '';
    const selected=characters.includes(id)?id:'';
    const svg=container.matches&&container.matches('.camp-world-art')?container:container.querySelector('.camp-world-art');
    if(svg) {
      svg.setAttribute('data-selected',selected);
      const traveler=typeof svg.querySelector==='function' ? svg.querySelector('[data-camp-player]') : null;
      if(traveler) {
        const [x,y]=playerPositions[selected] || playerPositions.home;
        traveler.style.transform=`translate(${x}px,${y}px)`;
        traveler.setAttribute('data-camp-destination',selected||'home');
      }
    }
    container.querySelectorAll('[data-camp-station]').forEach(node=>{
      const active=node.getAttribute('data-camp-station')===selected;
      node.setAttribute('data-selected',String(active));
      if(node.getAttribute('role')==='button') node.setAttribute('aria-pressed',String(active));
    });
    return selected;
  }
  return {scene, entrance, roadside, normalize, setSelection};
});
