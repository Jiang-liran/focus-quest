(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./campfire-art.js'), root);
  else root.FocusCampfireShopArt = factory(root.FocusCampfireArt, root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (campfireArt, root) {
  'use strict';

  const catalog = {
    camp: ['default', 'pine', 'lake', 'snow', 'aurora'],
    fire: ['default', 'copper', 'lantern', 'blue', 'star'],
    tent: ['default', 'patchwork', 'ranger', 'canopy', 'observatory'],
    campgear: ['default', 'tea', 'books', 'picnic', 'music'],
    campglow: ['default', 'fireflies', 'petals', 'snow', 'stardust'],
    chatframe: ['default', 'linen', 'wood', 'parchment', 'constellation'],
    camptrail: ['default', 'stone', 'stars'],
    campmark: ['default', 'chimes', 'moon'],
  };
  const slots = Object.keys(catalog);
  const prefix = slot => slot === 'camptrail' ? 'trail' : slot;
  const products = new Map(slots.flatMap(slot => catalog[slot].map(variant => [`${prefix(slot)}-${variant}`, slot])));
  const star = (x, y, r, fill, attr = '') => `<path ${attr} d="M${x} ${y-r}l${r*.3} ${r*.7} ${r*.7} ${r*.3}-${r*.7} ${r*.3}-${r*.3} ${r*.7}-${r*.3}-${r*.7}-${r*.7}-${r*.3} ${r*.7}-${r*.3}Z" fill="${fill}"/>`;
  const pine = (x, y, s, fill) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}"><path d="M-2-5h4v14h-4Z"/><path d="m0-53 12 19H7l12 20h-9L25 4h-50l15-18h-9l12-20h-5Z"/></g>`;

  function normalize(equipped) {
    const source = equipped && typeof equipped === 'object' && !Array.isArray(equipped) ? equipped : {};
    return Object.fromEntries(slots.map(slot => {
      const id = Object.prototype.hasOwnProperty.call(source, slot) ? source[slot] : null;
      return [slot, products.get(id) === slot ? id : `${prefix(slot)}-default`];
    }));
  }

  function sky(variant) {
    const stars = [[48,35,1.5],[118,28,1],[202,51,1.8],[273,28,1],[345,37,2],[401,68,1],[465,30,1.2],[598,58,1.6]];
    return `<rect width="660" height="240" rx="22" fill="${variant === 'snow' ? '#252b44' : variant === 'lake' ? '#19283d' : variant === 'pine' ? '#1b2936' : '#181f36'}"/>
      ${variant === 'aurora' ? `<g class="campfire-aurora" opacity=".65"><path d="M32 1q115 73 218 32T625 7q-111 79-218 37T32 61Z" fill="#477774" opacity=".55"/><path d="M69 0q78 62 194 24T627 0q-110 58-207 33T69 36Z" fill="#719d8c" opacity=".45"/><path d="M156 0q119 65 213 39T660 16v17q-183 14-259 35T156 0Z" fill="#7374a1" opacity=".48"/><path d="M83 4q102 43 189 16T589 4" stroke="#aad1b2" stroke-width="2" opacity=".28"/></g>` : ''}
      <circle cx="535" cy="49" r="26" fill="#d9d5b9" opacity=".04"/>
      <path d="M542 32a18 18 0 1 0 8 29 19 19 0 0 1-8-29Z" fill="#d9d2b7"/>
      ${stars.map(([x,y,r], i) => star(x,y,r,'#ded8c8',`class="campfire-star" opacity=".5" style="--star-delay:-${i%4}s"`)).join('')}`;
  }

  function landscape(variant) {
    if (variant === 'pine') return `<g class="campfire-landscape" data-skin-slots="camp" data-variant="pine">${sky(variant)}
      <path d="M0 151q109-69 205-34 103-48 206-7 98-41 249 23v107H0Z" fill="#263b42"/>
      ${[[27,159,1.8],[95,158,1.3],[169,158,1.25],[225,145,.9],[465,149,1.4],[536,164,1.8],[619,159,1.4]].map(([x,y,s])=>pine(x,y,s,'#304c4a')).join('')}
      ${pine(16,198,2.25,'#20353d')}${pine(598,185,1.9,'#203b40')}${pine(651,203,2.5,'#20333a')}
      <path d="M0 191q145-30 247-11 115-25 232-1 101-9 181 14v25a22 22 0 0 1-22 22H22a22 22 0 0 1-22-22Z" fill="#3a4e48"/>
      <path d="M126 239q56-34 148-28t180 29Z" fill="#756c58" opacity=".18"/>
      <path d="M53 218q8-19 18-20m-12 13-9-8m14 3 9-2M550 211q-8-19-18-20m12 13 9-8m-14 3-9-2" fill="none" stroke="#668575" stroke-width="2" stroke-linecap="round"/>
      <g fill="#a7ad82"><ellipse cx="91" cy="216" rx="3" ry="1.4"/><ellipse cx="466" cy="209" rx="2.5" ry="1.1"/></g></g>`;
    if (variant === 'lake') return `<g class="campfire-landscape" data-skin-slots="camp" data-variant="lake">${sky(variant)}
      <path d="m0 119 72-49 67 44 65-42 80 64 96-40 58 23 85-39 64 38 73-28v62H0Z" fill="#303f57"/>
      <path d="M0 145q152-21 316-7t344-4v77H0Z" fill="#3b6071"/>
      <path d="M489 146h77m-66 7h51m-48 7h62m-61 6h45m-42 7h44" stroke="#b9bfac" stroke-width="2" stroke-linecap="round" opacity=".45"/>
      <path d="M34 152h78m-57 9h88m212-10h46m155 27h61m-554-2h63m278-13h63" stroke="#759598" stroke-width="1.2" stroke-linecap="round" opacity=".48"/>
      <path d="M0 189q105-24 220-13 58-17 127-4 47 15 90 32 130 2 223 25v11H0Z" fill="#59635c"/>
      <path d="M0 199q96-31 218-14 67-20 124-6 72 18 106 39l212 21v1H0Z" fill="#3c4a4a"/>
      ${pine(28,179,1.05,'#243e46')}${pine(81,169,.6,'#2d4850')}
      <path d="M591 208v-29m-7 30v-24m14 27v-27" stroke="#849685" stroke-width="1.6"/>
      <path d="M591 180q-7-9-10-7m17 12q7-8 10-7" stroke="#a1a991" stroke-width="2" stroke-linecap="round"/>
      <path d="m459 191 17-4 15 5-15 4Z" fill="#7e9190" opacity=".6"/></g>`;
    if (variant === 'snow') return `<g class="campfire-landscape" data-skin-slots="camp" data-variant="snow">${sky(variant)}
      <path d="m0 144 70-55 47 23 75-61 70 72 48-23 58 43 95-73 65 62 68-32 64 47v82H0Z" fill="#526079"/>
      <path d="m148 87 44-36 42 43-29-11-13-10-17 13-10-4Zm279 11 36-28 35 33-24-12-11-6-14 13-12-5Z" fill="#a8b4c3"/>
      ${pine(39,181,1.5,'#4d686e')}${pine(586,184,1.5,'#4d686e')}${pine(626,198,1.8,'#3a555f')}
      <path d="m20 135 19-26 18 26-18-6ZM548 178l38-47 36 47-36-9ZM607 139l19-29 18 29-18-7Z" fill="#b9c8cc"/>
      <path d="M0 185q115-21 209-5 122-23 226 0 118-10 225 14v24a22 22 0 0 1-22 22H22a22 22 0 0 1-22-22Z" fill="#8a9da9"/>
      <path d="M0 218q101-18 220-9 119-16 218 1 102-8 222 14v16H0Z" fill="#a4b3ba" opacity=".75"/>
      <ellipse cx="331" cy="200" rx="92" ry="30" fill="#756f74" opacity=".35"/>
      <g fill="#718591" opacity=".65"><ellipse cx="289" cy="235" rx="4" ry="2" transform="rotate(-25 289 235)"/><ellipse cx="301" cy="228" rx="4" ry="2" transform="rotate(-25 301 228)"/><ellipse cx="309" cy="218" rx="3.5" ry="2" transform="rotate(-25 309 218)"/></g></g>`;
    return `<g class="campfire-landscape" data-skin-slots="camp" data-variant="aurora">${sky('aurora')}
      <path d="m0 149 71-49 64 27 76-45 67 53 69-29 66 29 97-57 69 57 81-31v110H0Z" fill="#303952"/>
      <path d="M0 178q116-38 223-5 111-44 203-5 127-41 234 11v61H0Z" fill="#344d56"/>
      ${pine(49,178,1.3,'#243c49')}${pine(595,184,1.8,'#293d4b')}
      <path d="M0 197q145-29 260-15 105-21 229 3 93-12 171 12v21a22 22 0 0 1-22 22H22a22 22 0 0 1-22-22Z" fill="#3b4851"/>
      <path d="M53 217q147-22 263-6t280 3" stroke="#7ea295" stroke-width="2" opacity=".15"/></g>`;
  }

  function tent(variant) {
    const shadow = '<ellipse cx="166" cy="194" rx="75" ry="8" fill="#1c2735" opacity=".4"/>';
    const ropes = '<path d="m111 163-19 31m126-29 25 29" stroke="#b9b3a1" stroke-width="1.2"/><path d="m91 190 2 7m150-7 2 7" stroke="#bfa58c" stroke-width="2" stroke-linecap="round"/>';
    if (variant === 'patchwork') return `<g class="campfire-tent" data-skin-slots="tent" data-variant="patchwork">${shadow}${ropes}
      <path d="m107 190 55-83 67 82-39 7Z" fill="#ab94a0"/>
      <path d="m107 190 55-83 28 89Z" fill="#d0b19e"/>
      <path d="m162 107 30 37-19 4Z" fill="#b5b99c"/><path d="m173 148 19-4 37 45-39 7Z" fill="#8d9faa"/>
      <path d="m134 149 28-42 13 42Z" fill="#c99592"/><path d="m107 190 27-41 41 0 15 47Z" fill="#cfb593"/>
      <path d="m133 193 29-66 20 67Z" fill="#565063"/>
      <path d="m134 149 41 0m-13-42 28 89m-17-48 19-4m-80 43 50-75 63 75" stroke="#ead6bd" stroke-width="1.3" stroke-dasharray="3 3"/>
      <path d="M163 107v-6" stroke="#bd9e87" stroke-width="2"/>
      <path d="m164 102 15 5-15 5Z" fill="#b9c2a5"/></g>`;
    if (variant === 'ranger') return `<g class="campfire-tent" data-skin-slots="tent" data-variant="ranger">${shadow}${ropes}
      <path d="m100 188 48-62 66 9 17 54Z" fill="#65877b"/>
      <path d="m148 126 66 9 17 54-47 5Z" fill="#456d66"/>
      <path d="m111 190 37-64 36 68Z" fill="#91a893"/>
      <path d="m130 193 19-45 22 44Z" fill="#30494c"/>
      <path d="m97 190 52-68 69 10" fill="none" stroke="#bead89" stroke-width="3" stroke-linecap="round"/>
      <path d="m100 188 11 2 37-64" fill="none" stroke="#c2c6a5" stroke-width="1.5"/>
      <path d="m175 138 16 46m4-43 15 43" stroke="#678679" stroke-width="1.5"/>
      <rect x="112" y="173" width="19" height="21" rx="4" fill="#a28f6d"/>
      <rect x="115" y="183" width="13" height="7" rx="2" fill="#796f5a"/>
      <path d="M117 173v-4q5-4 9 0v4" stroke="#c3b48b" stroke-width="2"/>
      <path d="m207 183 15-10m-9 16 9-16" stroke="#b6b58b" stroke-width="2" stroke-linecap="round"/></g>`;
    if (variant === 'canopy') return `<g class="campfire-tent" data-skin-slots="tent" data-variant="canopy">${shadow}
      <path d="M108 132v62m112-62v62" stroke="#b9a288" stroke-width="3" stroke-linecap="round"/>
      <path d="m95 138 68-34 72 34-13 13q-30-12-57-6-31-7-57 6Z" fill="#bba9a4"/>
      <path d="m163 104 72 34-13 13q-30-12-57-6Z" fill="#8e8da1"/>
      <path d="m95 138 13 13q26-13 57-6 27-6 57 6l13-13" stroke="#e0ccb1" stroke-width="2"/>
      <path d="m115 148 0 14m27-16v10m47-10v10m25-9v15" stroke="#d9c59f" stroke-width="1.3"/>
      <circle cx="115" cy="162" r="2.3" fill="#d9c59f"/><circle cx="214" cy="162" r="2.3" fill="#d9c59f"/>
      <path d="m120 185 81-1 15 12h-107Z" fill="#857b84"/>
      <rect x="121" y="177" width="29" height="12" rx="5" fill="#aeaaa0"/><rect x="167" y="178" width="31" height="12" rx="5" fill="#b69b96"/>
      <path d="m108 139-23 57m135-57 23 57" stroke="#b7b6a1" stroke-width="1"/></g>`;
    return `<g class="campfire-tent" data-skin-slots="tent" data-variant="observatory">${shadow}
      <path d="M106 190c0-43 23-72 59-72s62 29 62 72Z" fill="#7d88a8"/>
      <path d="M166 118c35 0 61 29 61 72h-62Z" fill="#525f82"/>
      <path d="M106 190c0-43 23-72 59-72s62 29 62 72M165 118q-23 27-27 72m27-72q24 25 30 72m-83-28h109" stroke="#afb5c4" stroke-width="1.4"/>
      <path d="M153 190v-24q13-23 27 0v24Z" fill="#303e5b"/>
      <circle cx="135" cy="151" r="9" fill="#435978" stroke="#b3bdca" stroke-width="1.5"/>
      <path d="M135 144v14m-7-7h14" stroke="#aebccb" stroke-width="1"/>
      ${star(197,151,3.8,'#d8caa4')}${star(210,173,2.2,'#d8caa4')}
      <path d="M178 177l-7 17m7-17 10 17" stroke="#c5b697" stroke-width="1.8"/>
      <g transform="rotate(-24 181 172)"><rect x="169" y="168" width="26" height="8" rx="2" fill="#b6a4a3"/><rect x="192" y="166" width="5" height="12" rx="1.4" fill="#d0c4a8"/><ellipse cx="197" cy="172" rx="2" ry="5" fill="#7ca2ae"/></g></g>`;
  }

  function flames(variant, transform = '') {
    const blue = variant === 'blue', stellar = variant === 'star';
    // Keep placement on a parent: CSS owns the flame's animated transform.
    return `${transform ? `<g transform="${transform}">` : ''}<g class="campfire-flame">
      <path d="M329 137c3 16 17 19 16 33 7-3 6-9 5-13 13 18 9 39-17 40-25 1-32-14-25-28 1 7 5 9 7 10-3-15 8-23 14-42Z" fill="${blue ? '#648cae' : stellar ? '#ab92b7' : '#c98070'}"/>
      <path d="M330 151c1 13 12 18 11 28 3-1 5-3 6-6 7 14 0 23-14 24-15 1-23-9-17-19 1 4 4 5 6 5-2-13 5-20 8-32Z" fill="${blue ? '#9dcbd3' : stellar ? '#d9c1c2' : '#e6ad79'}"/>
      <path d="M331 172c0 8 8 10 8 17 2-1 3-3 3-4 4 9-4 13-10 13-8 0-12-5-8-11 0 4 3 4 4 5-3-9 2-13 3-20Z" fill="${blue ? '#d0ece1' : '#f4d5a0'}"/></g>${transform ? '</g>' : ''}`;
  }

  function fire(variant) {
    const light = variant === 'blue' ? '#9acfd6' : variant === 'star' ? '#c0b0e0' : '#e9bb88';
    const glow = `<ellipse cx="331" cy="199" rx="42" ry="10" fill="${light}" opacity=".14"/>`;
    const embers = `<g class="campfire-embers" fill="${light}">${[[316,151,1.3],[341,132,1.1],[331,112,.8]].map(([x,y,r],i)=>`<circle class="campfire-ember" cx="${x}" cy="${y}" r="${r}" style="--ember-delay:-${i*.8}s"/>`).join('')}</g>`;
    if (variant === 'copper') return `<g class="campfire-fireplace" data-skin-slots="fire" data-variant="copper">${glow}
      <path d="m312 198-5 10m43-10 5 10" stroke="#846a63" stroke-width="3" stroke-linecap="round"/>
      <path d="M304 186h54q-3 18-27 18t-27-18Z" fill="#a9826c"/>
      <path d="M331 187h27q-3 18-27 18Z" fill="#80675f"/>
      <ellipse cx="331" cy="186" rx="28" ry="7" fill="#715958" stroke="#d1ad87" stroke-width="2.3"/>
      ${flames('default','translate(49 25) scale(.85)')}
      <path d="M307 187q24 11 48 0" stroke="#d1ad87" stroke-width="2.1"/>
      <path d="m316 194 4 3m11-2v4m11-5-4 3" stroke="#d4b391" stroke-width="1.4" stroke-linecap="round"/>${embers}</g>`;
    if (variant === 'lantern') return `<g class="campfire-fireplace" data-skin-slots="fire" data-variant="lantern">${glow}
      <path d="M321 142v-12q10-12 20 0v12" fill="none" stroke="#b7a48b" stroke-width="2.5"/>
      <path d="m303 151 28-19 28 19-8 7h-40Z" fill="#8d8583"/><path d="m331 132 28 19-8 7h-20Z" fill="#696a73"/>
      <rect x="310" y="155" width="42" height="40" rx="3" fill="#bda58a"/><rect x="315" y="158" width="32" height="33" rx="1.7" fill="#775f5e"/>
      <rect x="318" y="160" width="26" height="28" rx="1.5" fill="#cfac80" opacity=".72"/>
      ${flames('default','translate(164 90) scale(.5)')}
      <path d="M331 156v36m-19-19h39" stroke="#ab947e" stroke-width="2.1"/>
      <path d="M305 194h52v8h-52Z" fill="#8a7b70"/><path d="M309 202v6m44-6v6" stroke="#716666" stroke-width="3"/>
      <path d="M311 149h40" stroke="#d0b79a" stroke-width="1.5"/></g>`;
    if (variant === 'blue') return `<g class="campfire-fireplace" data-skin-slots="fire" data-variant="blue">${glow}
      <ellipse cx="331" cy="199" rx="32" ry="9" fill="#4f6978" stroke="#91b4bc" stroke-width="1.7"/>
      <path d="m302 196 5-14 9 10m32 0 10-10 3 15" fill="#6f8c9e" stroke="#a6c0ca" stroke-width="1.2"/>
      ${flames('blue')}
      <path d="M308 199q23 11 46 0" stroke="#a5d5d7" stroke-width="1.2" opacity=".8"/>
      <path d="M306 205q25 9 50 0" stroke="#74acb7" stroke-width="1.2" opacity=".6"/>${embers}</g>`;
    return `<g class="campfire-fireplace" data-skin-slots="fire" data-variant="star">${glow}
      <ellipse cx="331" cy="198" rx="34" ry="10" fill="#6d6684" stroke="#b3a4c1" stroke-width="1.4"/>
      <ellipse cx="331" cy="198" rx="26" ry="6.6" stroke="#d9c89f" stroke-width="1.2"/>
      <path d="m305 187 5 12m47-12-5 12m-21-24v22" stroke="#b6a5b3" stroke-width="1.6"/>
      ${flames('star','translate(49 27) scale(.85)')}
      ${star(331,143,8,'#edd9b0','class="campfire-star" style="--star-delay:-1s"')}
      ${star(310,165,3.4,'#dbcfba','class="campfire-ember" style="--ember-delay:-1.4s"')}
      ${star(350,159,3,'#c5bdd8','class="campfire-ember" style="--ember-delay:-.4s"')}
      <path d="m307 198 24 7 24-7" stroke="#dbc596" stroke-width="1.1"/>${embers}</g>`;
  }

  function gear(variant) {
    const base = '<ellipse cx="436" cy="213" rx="57" ry="8" fill="#1d2935" opacity=".3"/>';
    if (variant === 'tea') return `<g class="campfire-equipment" data-skin-slots="campgear" data-variant="tea">${base}
      <path d="M395 193h73l-4 5h-65Z" fill="#a39079"/><path d="M402 198v13m59-13v13" stroke="#7e7065" stroke-width="4"/>
      <path d="M397 189h69v6h-69Z" fill="#b7a48a"/>
      <path d="M424 181q0-8 8-8t8 8v5q-8 4-16 0Z" fill="#9baaa0"/><path d="m438 180 9-5-2 9-6 1" fill="#9baaa0"/>
      <path d="M423 179q-10-5-8 5l9 1" stroke="#a9b7a8" stroke-width="2.5"/>
      <ellipse cx="432" cy="174" rx="7" ry="2" fill="#c5c9b3"/><circle cx="432" cy="171" r="2" fill="#d0cfb6"/>
      <path d="M403 183h9v5q-4 4-9 0Zm42 2h9v4q-4 3-9 0Z" fill="#d5c4a4"/>
      <path d="M405 178q-2-3 0-5m26-4q-2-3 0-5" fill="none" stroke="#d3c6b1" stroke-width="1.1" opacity=".7"/>
      <path d="M406 213h-14m73 0h14" stroke="#8b796a" stroke-width="5" stroke-linecap="round"/></g>`;
    if (variant === 'books') return `<g class="campfire-equipment" data-skin-slots="campgear" data-variant="books">${base}
      <path d="M399 200h56v10h-56Z" fill="#a08772"/><path d="M402 196h51v8h-51Z" fill="#b9a18a"/>
      <rect x="402" y="181" width="41" height="8" rx="1.3" fill="#77918c"/><path d="M408 183h32v4h-32Z" fill="#d6c9ad"/>
      <rect x="407" y="189" width="44" height="8" rx="1.3" fill="#aa929e"/><path d="M412 191h36v4h-36Z" fill="#e0d0b4"/>
      <path d="m411 182 2-15q13-4 23 3 12-2 19 5l-4 14q-10-7-20-4-10-5-20-3Z" fill="#e0ceb0"/>
      <path d="m436 170-5 15m-14-13 13 3m-13 2 11 2m11-3 10 3" stroke="#a18e79" stroke-width="1"/>
      <path d="M464 183v22m-6-14h12m-6-8-7 9m7-9 7 9" stroke="#a4a293" stroke-width="1.7"/>
      <path d="m459 174 5-3 6 3v9h-11Z" fill="#b5a991"/><path d="M461 175h7v6h-7Z" fill="#dec194"/></g>`;
    if (variant === 'picnic') return `<g class="campfire-equipment" data-skin-slots="campgear" data-variant="picnic">${base}
      <path d="m397 189 57-6 37 29-68 8-41-23Z" fill="#b69a94"/>
      <path d="m410 188 39 29m-24-31 38 28m-24-30 39 28m-84-16 68-8m-58 16 68-8m-58 16 68-8" stroke="#d3bcb1" stroke-width="3" opacity=".7"/>
      <path d="m409 177 28-2 4 18-30 3Z" fill="#b29772"/><path d="m417 175-1-5q10-12 16 2l1 3" fill="none" stroke="#ceb18a" stroke-width="2.2"/>
      <path d="m411 182 26-2m-25 7 26-3m-19-8 1 18m8-19 2 17" stroke="#8e795f" stroke-width="1.1"/>
      <ellipse cx="456" cy="201" rx="15" ry="5" fill="#d9cbb0"/><ellipse cx="456" cy="200" rx="11" ry="3" fill="#b5b9a1"/>
      <path d="m449 199 7-7 7 7Z" fill="#d4b080"/>
      <circle cx="438" cy="204" r="4" fill="#ad7f7e"/><path d="m438 200 2-3" stroke="#909f7a" stroke-width="1.5"/>
      <path d="M472 198h8v6q-4 3-8 0Z" fill="#c7b9a7"/></g>`;
    return `<g class="campfire-equipment" data-skin-slots="campgear" data-variant="music">${base}
      <path d="M399 205h58v8h-58Z" fill="#9b8877"/><path d="M403 202h50v6h-50Z" fill="#baa289"/>
      <g transform="rotate(20 423 183)"><path d="M419 174q-11-8-15 3-3 7 4 11-12 12 0 20 13 7 19-7 6-12-3-14 4-6-5-13Z" fill="#bfa382" stroke="#806c60" stroke-width="1.3"/>
      <path d="M418 148h6v42h-6Z" fill="#8a7163"/><rect x="416" y="140" width="10" height="13" rx="2" fill="#b5a08a"/>
      <circle cx="419" cy="192" r="5" fill="#736366"/><path d="M418 147v50m3-50v50m3-50v50m-11 3h13" stroke="#d8c6a6" stroke-width=".75"/>
      <path d="M414 143h14m-14 5h14" stroke="#a89883" stroke-width="1.6" stroke-linecap="round"/></g>
      <path d="M461 180v33m-9 0 9-9 9 9" stroke="#98918b" stroke-width="1.7"/>
      <path d="m451 170 25-3-1 16-25 3Z" fill="#cfc5b3"/>
      <path d="m454 175 16-2m-16 5 15-2m-15 5 15-2" stroke="#999188" stroke-width=".8"/>
      <path d="m462 173 0 6q-3 3-4 1 0-2 4-2" stroke="#6d6c7a" stroke-width="1"/></g>`;
  }

  function ambience(effect) {
    if (effect === 'default') return '';
    const positions = [[62,116],[105,87],[242,118],[284,64],[395,96],[470,75],[527,130],[589,107],[73,179],[457,151],[383,128],[568,179]];
    return `<g class="campfire-atmosphere" data-skin-slots="campglow" data-variant="${effect}" pointer-events="none">${positions.map(([x,y],i) => {
      const attr = `class="campfire-ambient" data-effect="${effect}" style="--particle-delay:-${(i*.7).toFixed(1)}s" opacity="${i%3===0?'.65':'.4'}"`;
      if (effect === 'fireflies') return `<g ${attr}><circle cx="${x}" cy="${y}" r="4" fill="#d6dba2" opacity=".1"/><circle cx="${x}" cy="${y}" r="${i%2?1:1.5}" fill="#d8dca8"/></g>`;
      if (effect === 'petals') return `<path ${attr} d="m${x} ${y}q-7-6-7 0 0 4 7 0Z" fill="${i%2?'#c7a7b0':'#deb7b8'}" transform="rotate(${i*27} ${x-3} ${y})"/>`;
      if (effect === 'snow') return i%3 ? `<circle ${attr} cx="${x}" cy="${y}" r="${i%2?1.1:1.7}" fill="#d0dce2"/>` : `<path ${attr} d="M${x-3} ${y}h6m-3-3v6m-2-5 4 4m0-4-4 4" stroke="#d0dce2" stroke-width=".8"/>`;
      return star(x,y,i%3?1.7:3,'#cbbcdf',attr);
    }).join('')}</g>`;
  }

  function replaceSpan(svg, begin, end, replacement) {
    const start = svg.indexOf(begin), finish = svg.indexOf(end, start);
    if (start < 0 || finish < 0) return svg;
    return svg.slice(0,start) + replacement + svg.slice(finish);
  }

  function scene(equipped) {
    const chosen = normalize(equipped);
    let svg = campfireArt.scene();
    const variant = slot => chosen[slot].slice(slot.length+1);
    if (variant('camp') !== 'default') svg = replaceSpan(svg, '<rect width="660"', '<g class="campfire-tent"', landscape(variant('camp')));
    if (variant('tent') !== 'default') svg = svg.replace(/<g class="campfire-tent"[^>]*>[\s\S]*?<\/g>/, tent(variant('tent')));
    if (variant('fire') !== 'default') svg = replaceSpan(svg, '<g class="campfire-stones"', '<g stroke="#65796e"', fire(variant('fire')));
    if (variant('campgear') !== 'default') {
      // Keep the left seat; replace the right stump with the chosen furnishing.
      svg = svg.replace(/<ellipse cx="412" cy="212"[\s\S]*?<\/g>/, '</g>' + gear(variant('campgear')));
    }
    const attributes = slots.map(slot => `data-${slot}="${chosen[slot]}"`).join(' ');
    svg = svg.replace('class="campfire-scene-art"', `class="campfire-scene-art" ${attributes}`);
    return svg.replace('</svg>', ambience(variant('campglow')) + '</svg>');
  }

  function chatSample(variant) {
    const text = '<text x="330" y="216" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#f0e3d0">坐一会儿吧，今晚的星光很温柔。</text>';
    if (variant === 'linen') return `<g class="campfire-chat-preview" data-skin-slots="chatframe" data-frame="linen"><rect x="147" y="191" width="366" height="39" rx="8" fill="#555a60" stroke="#baa88e" stroke-width="1.3"/><rect x="153" y="197" width="354" height="27" rx="5" fill="none" stroke="#b7a68e" stroke-dasharray="3 3" stroke-width=".8"/><path d="M159 192v37m342-37v37" stroke="#d0b994" stroke-width=".8" opacity=".3"/>${text}</g>`;
    if (variant === 'wood') return `<g class="campfire-chat-preview" data-skin-slots="chatframe" data-frame="wood"><rect x="144" y="189" width="372" height="43" rx="6" fill="#806c60" stroke="#b39b7c" stroke-width="1.5"/><rect x="153" y="196" width="354" height="28" rx="3" fill="#514947"/><path d="M164 192h145m35 0h148m-323 36h131m50 0h132" stroke="#c3a583" stroke-width=".8" opacity=".6"/><g fill="#c2aa89"><circle cx="149" cy="196" r="1.2"/><circle cx="511" cy="196" r="1.2"/><circle cx="149" cy="225" r="1.2"/><circle cx="511" cy="225" r="1.2"/></g>${text}</g>`;
    if (variant === 'parchment') return `<g class="campfire-chat-preview" data-skin-slots="chatframe" data-frame="parchment"><path d="M151 191q-10-6-12 6v25q4 12 14 5h354q10 7 14-5v-25q-2-12-12-6Z" fill="#d5c1a2" stroke="#af9679" stroke-width="1.3"/><path d="M153 194v31m354-31v31" stroke="#b49b80" stroke-width="1"/><path d="M171 199h29m261 0h29m-319 23h29m261 0h29" stroke="#b09b81" stroke-width="1"/>${text.replace('#f0e3d0','#655549')}</g>`;
    if (variant === 'constellation') return `<g class="campfire-chat-preview" data-skin-slots="chatframe" data-frame="constellation"><rect x="145" y="190" width="370" height="41" rx="12" fill="#3b3c5b" stroke="#a6a1c7" stroke-width="1.3"/><path d="m158 205 9-9 15 3m296 22 17-3 8-11" fill="none" stroke="#b6a8cf" stroke-width=".8"/>${star(158,205,2.7,'#e5d8af')}${star(182,199,1.8,'#d0c6e4')}${star(503,207,2.8,'#e5d8af')}${star(478,221,1.8,'#d0c6e4')}${text}</g>`;
    return `<g class="campfire-chat-preview" data-skin-slots="chatframe" data-frame="default"><rect x="148" y="191" width="364" height="39" rx="10" fill="#33394b" stroke="#737589" stroke-width="1"/>${text}</g>`;
  }

  function preview(itemId, equipped) {
    const chosen = normalize(equipped);
    const slot = products.get(itemId);
    if (slot) chosen[slot] = itemId;
    // Resolve at call time: the full camp module may load after the shop bridge.
    const world = root?.FocusCampWorldArt?.scene?.(chosen, {interactive: false});
    let svg = typeof world === 'string' && world ? world : scene(chosen);
    if (world) return svg;
    if (slot === 'chatframe') svg = svg.replace('</svg>', chatSample(chosen.chatframe.slice(10)) + '</svg>');
    return svg.replace('class="campfire-scene-art"', 'class="campfire-scene-art campfire-shop-preview"');
  }

  return {normalize, scene, preview};
});
