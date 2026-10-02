(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusExpeditionArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const islands = [
    {id:'math', name:'数学', place:'几何观测台', x:235, y:181, accent:'#9bd6be', light:'#e2eed3', top:'#536c70', edge:'#8aaa99', rock:'#373d58', path:'M344 191Q373 188 412 233'},
    {id:'cs', name:'408', place:'逻辑工坊', x:770, y:179, accent:'#a9bbf1', light:'#e3ddfa', top:'#5b6384', edge:'#919fc7', rock:'#363951', path:'M661 189Q641 192 624 228'},
    {id:'politics', name:'政治', place:'议事书庭', x:230, y:406, accent:'#e6b8ae', light:'#f4e1c3', top:'#79646d', edge:'#bf9b98', rock:'#443a53', path:'M341 402Q379 389 421 348'},
    {id:'english', name:'英语', place:'译风港', x:775, y:407, accent:'#a6d6e0', light:'#e2eee3', top:'#536f7e', edge:'#89afb9', rock:'#323e56', path:'M664 403Q640 387 622 348'},
  ];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clamp = value => Math.max(0, Math.min(1, value));
  const n = value => String(Math.round(value * 1000) / 1000);
  const star = (x,y,r,color,extra='') => `<path ${extra} d="M${x} ${y-r}l${n(r*.27)} ${n(r*.73)} ${n(r*.73)} ${n(r*.27)}-${n(r*.73)} ${n(r*.27)}-${n(r*.27)} ${n(r*.73)}-${n(r*.27)}-${n(r*.73)}-${n(r*.73)}-${n(r*.27)} ${n(r*.73)}-${n(r*.27)}Z" fill="${color}"/>`;

  function normalize(model) {
    const input = model && typeof model === 'object' ? model : {};
    const subjects = Array.isArray(input.subjects) ? input.subjects : [];
    const progress = clamp(finite(input.progress) ? input.progress : 0);
    return {
      progress,
      stage: Math.max(0, Math.min(4, finite(input.stage) ? Math.floor(input.stage) : Math.floor(progress * 4))),
      subjects: islands.map(definition => {
        const source = subjects.find(item => item && item.id === definition.id) || {};
        const raw = finite(source.percent) ? Math.max(0, Math.min(99999, source.percent)) : null;
        const progress = clamp(finite(source.progress) ? source.progress : raw === null ? 0 : raw / 100);
        return {...definition, progress, percent: raw === null ? progress * 100 : raw};
      }),
    };
  }

  function tree(x,y,size,color) {
    return `<g transform="translate(${x} ${y}) scale(${size})"><path d="M0-3V16" stroke="#887984" stroke-width="3" stroke-linecap="round"/><path d="M0-38-15-10H15ZM0-26-20 2H20Z" fill="${color}"/><path d="M0-37V1L-17 1Z" fill="#d9e9d4" opacity=".13"/></g>`;
  }

  function tier(subject, step, start, span, content) {
    const amount = clamp((subject.progress-start)/span);
    return `<g class="expedition-build-tier" data-build-step="${step}" data-build-amount="${n(amount)}" style="opacity:${n(amount)};transform:translateY(${n((1-amount)*9)}px)">${content}</g>`;
  }

  function ground(subject) {
    const p=subject.progress;
    const node = (x,y,index) => {
      const amount=clamp(p*4-index);
      return `<g class="expedition-charge-node" data-node="${index+1}" data-charge="${n(amount)}"><ellipse cx="${x}" cy="${y+4}" rx="11" ry="4" fill="#202838"/><circle cx="${x}" cy="${y-1}" r="10" fill="${subject.accent}" opacity="${n(amount*.16)}"/><path d="m${x} ${y-9} 5 7-5 8-5-8Z" fill="#5c6278"/><path d="m${x} ${y-9} 5 7-5 8-5-8Z" fill="${subject.accent}" opacity="${n(amount)}"/><path d="m${x} ${y-9} 1 7-6 0Z" fill="${subject.light}" opacity="${n(amount)}"/></g>`;
    };
    return `<ellipse class="expedition-island-aura" cx="0" cy="32" rx="128" ry="28" fill="${subject.accent}" opacity="${n(.015+p*.075)}"/>
      <path d="m-114 10 37-23 97-9 92 31-14 42-41 20-30 45-45-26-43-5-29-29Z" fill="${subject.rock}"/>
      <path d="m-114 10 60 10 37 28-1 43-43-5-29-29Z" fill="#242d45" opacity=".67"/>
      <path d="m-17 48 47-16 82-23-14 42-41 20-30 45Z" fill="#8983ab" opacity=".14"/>
      <path d="m-5 51 23 12-2 27-12-10Zm46-16 17 6-7 21-11-10ZM-69 28l17 11-4 22-13-8Z" fill="${subject.accent}" opacity="${n(.07+p*.2)}"/>
      <path d="m-114 10 38-26 94-10L112 9 70 36-22 49-75 35Z" fill="${subject.top}"/>
      <path d="m-107 9 35-20 92-9 80 28-35 22-88 13-49-14Z" fill="#a5b1bd" opacity="${n(.045+p*.11)}"/>
      <path d="m-109 13 34 22 53 14 92-13 38-24" fill="none" stroke="${subject.edge}" stroke-width="2" opacity=".5"/>
      <path class="expedition-ground-current" d="m-102 11 32 19 50 13 87-12 35-18" pathLength="100" fill="none" stroke="${subject.accent}" stroke-width="2" stroke-dasharray="100 100" stroke-dashoffset="${n(100*(1-p))}" opacity="${n(.12+p*.7)}"/>
      <ellipse cx="-5" cy="7" rx="69" ry="24" fill="#d4cedb" opacity=".055"/>
      <path d="M-50 14-18-1 39 0 74 15" fill="none" stroke="#d8c8b3" stroke-width="5" stroke-linecap="round" opacity=".3"/>
      <path d="M-72 18h15m100 7h11M-92 7h11" stroke="${subject.light}" stroke-width="2" opacity=".28"/>
      ${[-60,-20,20,60].map((x,i)=>node(x,35+(i===1||i===2?9:0),i)).join('')}`;
  }

  function math(subject) {
    return `<g class="expedition-blueprint" opacity="${n(.35*(1-subject.progress))}" fill="none" stroke="${subject.accent}" stroke-width="1" stroke-dasharray="4 5"><path d="M-50 5v-64l44-25 45 25V5M-50-59l44 22 45-22M-6-84v83"/><ellipse cx="-6" cy="-81" rx="31" ry="12"/></g>
      <path d="m-57 3 48-24 57 22-46 27Z" fill="#929797"/><path d="m-57 3v10l59 24 46-27V1L2 25Z" fill="#666f7e"/><path d="m-48 4 40-18 45 17L1 20Z" fill="#c6c4b2" opacity=".5"/>
      ${tier(subject,1,0,.34,`<path d="M-40-47-5-64 31-48V0L-4 17-40 1Z" fill="#adc2b6"/><path d="M-4-30 31-48V0L-4 17Z" fill="#73988e"/><path d="m-40-47 36 17 35-18-37-17Z" fill="#d3d9be"/><path d="M-31-31v16l12 6v-16Zm35 2v16l13-7v-16Z" fill="#364f60"/><path d="M-31-31v10l12 6v-10Zm35 2v10l13-7v-10Z" fill="${subject.accent}" opacity=".7"/><path d="M-13 12V-4Q-5-18 3-5V14Z" fill="#3a5260"/>`)}
      ${tier(subject,2,.18,.37,`<path d="M-46-49q-1-40 39-47 39 6 43 45L-5-30Z" fill="#82aea5"/><path d="M-7-96q-7 31 2 66L-46-49q-1-40 39-47Z" fill="#b9d0b8"/><path d="M-7-96Q13-80 15-42" fill="none" stroke="#5b888a" stroke-width="2"/><path d="M-47-49-5-30 37-51v6L-5-25-47-44Z" fill="#d2c5a4"/><path d="m4-79 32-21 7 9-31 24Z" fill="#d4c8aa"/><path d="m34-101 9-5 8 12-9 6Z" fill="#9cbfba"/><ellipse cx="46" cy="-101" rx="4" ry="7" fill="#364f61" transform="rotate(-33 46 -101)"/>`)}
      ${tier(subject,3,.48,.32,`<g class="expedition-instrument" transform="translate(-65 -63)"><g class="expedition-orbit"><ellipse rx="21" ry="8" fill="none" stroke="#e1caaa" stroke-width="1.6" transform="rotate(-30)"/><ellipse rx="11" ry="22" fill="none" stroke="#99d4bd" stroke-width="1.4" transform="rotate(24)"/><circle cx="-17" cy="9" r="3" fill="#e8d2ad"/></g><circle r="6" fill="${subject.light}"/><path d="M0 17V44m-12 3h24" stroke="#a6b5a1" stroke-width="3" stroke-linecap="round"/></g>${star(12,-115,4,subject.light,'class="expedition-spark"')}`)}
      ${tree(75,3,.78,'#82a994')}${tree(-88,-1,.5,'#668c85')}<path d="m58 6 11-4 6 9-12 3Z" fill="#b6b89c"/>`;
  }

  function cs(subject) {
    return `<g class="expedition-blueprint" opacity="${n(.34*(1-subject.progress))}" fill="none" stroke="${subject.accent}" stroke-width="1" stroke-dasharray="4 5"><path d="M-67 0v-57l37-20 42 15V8m12-1v-88l27-14 29 13V0M-47-88h44m-22-20v40"/></g>
      <path d="m-68 0 59-25L67-2 11 26Z" fill="#a3a8bb"/><path d="m-68 0v11l79 26L67 9V-2L11 26Z" fill="#69708f"/>
      ${tier(subject,1,0,.34,`<path d="M-58-48-21-64 17-50V2L-19 19-58 5Z" fill="#9ca9d0"/><path d="M-19-35 17-50V2L-19 19Z" fill="#717fa9"/><path d="m-58-48 39 13 36-15-39-15Z" fill="#d0cde2"/><path d="M-49-30v17l12 4v-17Zm39 3v16L4-17v-16Z" fill="#323c61"/><path d="M-49-30v9l12 4v-9Zm39 3v9L4-24v-9Z" fill="${subject.accent}"/><path d="M-30 13V-3q8-12 16-2v21Z" fill="#394769"/>`)}
      ${tier(subject,2,.18,.37,`<path d="M25-72 48-84 73-73v66L48 6 25-4Z" fill="#7f91b4"/><path d="M48-62 73-73v66L48 6Z" fill="#626f98"/><path d="m18-73 29-21 33 21-31 14Z" fill="#b9b5d4"/><path d="m22-75 25-32 30 33-28 12Z" fill="#8897c0"/><path d="m47-107 2 45 28-12Z" fill="#707ba7"/><path d="M35-48v9m22-14v9M35-27v9m22-14v9" stroke="${subject.light}" stroke-width="4" stroke-linecap="round"/><path d="M-6-50v-28h13v32" fill="#6d7799"/><path d="M-8-80h17v6H-8Z" fill="#aaa6c3"/>`)}
      ${tier(subject,3,.48,.32,`<g transform="translate(-34 -88)"><g class="expedition-gear"><path d="m-6-23 12 0 2 8 7 4 8-2 6 10-6 6v8l6 6-6 10-8-2-7 4-2 8H-6l-2-8-7-4-8 2-6-10 6-6V3l-6-6 6-10 8 2 7-4Z" fill="#c7b89e" transform="scale(.65) translate(0 -7)"/><circle r="9" fill="#4b5679"/><circle r="4" fill="${subject.accent}"/></g></g><path d="M-80-20h15v16h-15Z" fill="#8d96ad"/><path class="expedition-circuit" d="M-82-12h-10v-14m7 41 16 0 9 6M17-33h8" fill="none" stroke="${subject.accent}" stroke-width="2" stroke-linecap="round"/>${star(76,-95,4,subject.light,'class="expedition-spark"')}`)}
      <path d="M78 7h13v-17H78Z" fill="#c3b5a4"/><path d="M78-10 84-15 98-11 91-6Z" fill="#e0d0b2"/><path d="M91-6v17l7-4v-18Z" fill="#8c91a4"/>${tree(-93,7,.48,'#7586a7')}`;
  }

  function politics(subject) {
    return `<g class="expedition-blueprint" opacity="${n(.32*(1-subject.progress))}" fill="none" stroke="${subject.accent}" stroke-width="1" stroke-dasharray="4 5"><path d="M-62 6v-57L0-77l60 22V7M-62-51 0-30l60-25M-35-40V10M34-42V9"/></g>
      <path d="m-70 1 69-24L68 0 0 27Z" fill="#c5b5a2"/><path d="m-70 1v9l70 25 68-26V0L0 27Z" fill="#938195"/><path d="m-63 10 64 23 60-23v8L1 42l-64-23Z" fill="#b8a89e"/>
      ${tier(subject,1,0,.34,`<path d="M-46-39-4-54 42-38V4L-4 21-46 7Z" fill="#d2b9ae"/><path d="M-4-24 42-38V4L-4 21Z" fill="#ac909d"/><path d="M-41-36v36l10 4v-36Zm27 9v36l10 4v-36Zm20-1v37l10-4v-37Zm26-9V0l8-3v-36Z" fill="#ecdbc3"/><path d="M-25-20v21l8 3v-21Zm45-1V0l8-3v-21Z" fill="#56465d"/>`)}
      ${tier(subject,2,.18,.37,`<path d="m-62-43 58-33 64 31-64 23Z" fill="#9f8096"/><path d="m-62-43 58-22 64 20-64 23Z" fill="#c2a3af"/><path d="M-64-42-4-21 62-44v7L-4-14-64-35Z" fill="#e3cab4"/><path d="m-4-76 2 50 62-19Z" fill="#806f8e"/><path d="M-23-70q10-8 21-3 11-9 23-3v17q-12-5-23 3-11-5-21 3Z" fill="#efdec4"/><path d="M-2-73v17m-15-11 9-2m-9 7 9-2m12-1 11-5m-11 10 11-5" stroke="#ac8e8f" stroke-width="1.4"/>`)}
      ${tier(subject,3,.48,.32,`<g class="expedition-book-leaves"><path d="M-80-21q10-7 19 0v13q-10-7-19 0Zm19 0q9-7 19 0v13q-10-7-19 0Z" fill="#d9c6ac"/><path d="M-61-21V-8m-12-8h7m11 0h7" stroke="#957d83" stroke-width="1.2"/></g><path d="M-62-9V8m-10 3 10-3 10 3" fill="none" stroke="#b5a294" stroke-width="2"/>${star(-5,-98,6,subject.light,'class="expedition-spark"')}<circle cx="-5" cy="-98" r="16" fill="none" stroke="${subject.accent}" opacity=".4"/>`)}
      <path d="M79 6V-35m0 13-14-13m14 2 12-12" fill="none" stroke="#9d7e86" stroke-width="3" stroke-linecap="round"/><g fill="#b496aa"><circle cx="65" cy="-35" r="12"/><circle cx="79" cy="-41" r="16"/><circle cx="92" cy="-44" r="10"/></g><g fill="#e3c2bc" opacity=".65"><circle cx="73" cy="-44" r="3"/><circle cx="88" cy="-48" r="2"/><circle cx="65" cy="-34" r="2"/></g>`;
  }

  function english(subject) {
    return `<g class="expedition-blueprint" opacity="${n(.34*(1-subject.progress))}" fill="none" stroke="${subject.accent}" stroke-width="1" stroke-dasharray="4 5"><path d="M-54 7v-54l25-37 29 34v57m27-1v-95m-18 34h38"/><path d="M-79 20 36-16 77-3"/></g>
      <path d="m-69 9 63-20 66 18-63 24Z" fill="#afc5bf"/><path d="m-69 9v9l66 22 63-25V7L-3 31Z" fill="#768f9f"/><path d="m9 26 41-16 43 11-43 18Z" fill="#aaad9e"/><path d="M32 19 74 30m-24-19v18m13-14v17m13-13v17" stroke="#647e88" stroke-width="2" opacity=".65"/>
      ${tier(subject,1,0,.34,`<path d="M-52-38-28-49-2-39V9L-28 21-52 11Z" fill="#c1d6d0"/><path d="M-28-26-2-39V9L-28 21Z" fill="#8aacb2"/><path d="m-60-36 31-40L5-38-28-21Z" fill="#76a4b7"/><path d="m-29-76 1 55L5-38Z" fill="#5f879f"/><path d="M-43-19v15l9 4v-15Zm25-3v15l9-4v-15Z" fill="#36596c"/><path d="M-43-19v7l9 4v-7Zm25-3v7l9-4v-7Z" fill="${subject.light}"/>`)}
      ${tier(subject,2,.18,.37,`<path d="M24-68h20L50 8 32 17 17 9Z" fill="#d1d8c1"/><path d="M34-68h10L50 8 32 17Z" fill="#91afa9"/><path d="M20-72q13-14 28 0v12H20Z" fill="#789aa9"/><path d="m18-72 16-25 17 25Z" fill="#aac5cc"/><path d="M26-62v9m14-9v9" stroke="${subject.light}" stroke-width="3"/><path d="M17-60h33m-32 4h30" stroke="#547a8e" stroke-width="2"/><g transform="translate(33 -35)"><g class="expedition-windmill"><path d="M-3-3-7-26 0-34 5-4m0 0 24-5 7 7-29 6m-6 0 7 23-6 9-6-29m0-6-25 8-7-6 29-7" fill="#dacfb7" stroke="#a7b6b0" stroke-width="1"/><circle r="4" fill="#597c91"/></g></g>`)}
      ${tier(subject,3,.48,.32,`<g class="expedition-port-boat" transform="translate(79 -22)"><g class="expedition-boat-bob"><path d="M-23 7h44L12 18H-11Z" fill="#c3ab9c"/><path d="M-22 7h43" stroke="#e1d5bb" stroke-width="2"/><path d="M0 6v-35" stroke="#c6d3c4" stroke-width="2"/><path d="M-3-27-21 1h18ZM3-22 19 1H3Z" fill="#d6e5d6"/><path d="m-3-27 0 28-18 0Z" fill="#b0d1ce"/><path d="M-13 23q12 5 29 0" fill="none" stroke="${subject.accent}" stroke-width="1.3" opacity=".5"/></g></g>${star(54,-95,4,subject.light,'class="expedition-spark"')}`)}
      ${tree(-89,9,.6,'#78a5a3')}<path d="M66 9v-23m0 2 17 5-17 6Z" fill="#a4bbc2" stroke="#a4bbc2" stroke-width="1.5"/>`;
  }

  function completion(subject) {
    const completed=subject.progress>=1;
    const over=clamp((subject.percent-100)/50);
    const starX=subject.y>300?-50:0, starY=subject.y>300?-100:-130;
    return `<g class="expedition-completion" data-complete="${completed}" opacity="${completed?1:0}"><path d="M88-35v-42" stroke="#d8c9aa" stroke-width="2"/><g class="expedition-flag"><path d="M89-76q10-5 24 0v17q-14-5-24 0Z" fill="${subject.accent}"/>${star(101,-68,3,subject.light)}</g>${star(starX,starY,6,subject.light,'class="expedition-complete-star"')}<circle class="expedition-complete-ring" cx="${starX}" cy="${starY}" r="12" fill="none" stroke="${subject.accent}" stroke-width="1" opacity=".6"/></g>
      <g class="expedition-overcharge" data-overcharge="${n(over)}" opacity="${n(over)}"><path d="m-115 10 39-26 94-10 94 35-42 27-92 13-53-14Z" fill="none" stroke="#ecd295" stroke-width="2"/>${star(-91,-93,4,'#f0d99f','class="expedition-spark"')}${star(92,-62,5,'#f0d99f','class="expedition-spark"')}<ellipse cx="0" cy="8" rx="107" ry="34" fill="none" stroke="#eac987" opacity=".25"/></g>`;
  }

  function island(subject) {
    const structures={math,cs,politics,english};
    const label=`${subject.name} · ${subject.place}，完成 ${n(Math.floor(subject.percent*100)/100)}%`;
    return `<g class="expedition-subject-island" data-expedition-subject="${subject.id}" data-progress="${n(subject.progress)}" data-percent="${n(subject.percent)}" role="button" tabindex="0" aria-label="${label}" style="--expedition-accent:${subject.accent};--expedition-progress:${n(subject.progress)}" transform="translate(${subject.x} ${subject.y})"><title>${label}</title><ellipse class="expedition-hit-area" cx="0" cy="-22" rx="128" ry="130" fill="transparent"/>
      <g class="expedition-island-rest"><g class="expedition-island-float">${ground(subject)}<g class="expedition-architecture" style="filter:saturate(${n(.45+subject.progress*.55)}) brightness(${n(.7+subject.progress*.3)})">${structures[subject.id](subject)}</g>${completion(subject)}<ellipse class="expedition-focus-ring" cx="0" cy="9" rx="120" ry="43" fill="none" stroke="${subject.accent}" stroke-width="2" opacity="0"/>
      <g class="expedition-island-caption" transform="translate(0 88)"><rect x="-77" y="-11" width="154" height="25" rx="12.5" fill="#141f35" opacity=".82"/><circle cx="-61" cy="1" r="2.5" fill="${subject.accent}"/><text x="0" y="5" text-anchor="middle" fill="${subject.light}" font-size="11" letter-spacing="1.2">${subject.place}</text><path d="m59-2 4 3-4 3" fill="none" stroke="${subject.accent}" stroke-width="1.4" stroke-linecap="round"/></g></g></g></g>`;
  }

  function bridge(subject) {
    const p=subject.progress;
    return `<g class="expedition-star-bridge" data-bridge="${subject.id}" style="--expedition-accent:${subject.accent};--expedition-bridge-light:${n(.12+p*.66)}"><path d="${subject.path}" fill="none" stroke="#b3a9c7" stroke-width="16" opacity=".035"/><path d="${subject.path}" pathLength="100" fill="none" stroke="#53657f" stroke-width="3" stroke-dasharray="2 7" opacity=".46"/><path class="expedition-bridge-progress" d="${subject.path}" pathLength="100" fill="none" stroke="${subject.accent}" stroke-width="3" stroke-dasharray="100 100" stroke-dashoffset="${n(100*(1-p))}" opacity="${n(.14+p*.7)}"/><path class="expedition-bridge-flow" d="${subject.path}" pathLength="100" fill="none" stroke="${subject.light}" stroke-width="2" stroke-dasharray="1 27" opacity="${n(p*.68)}"/></g>`;
  }

  function horizon(progress) {
    const stars=[[56,54,2],[153,43,2.4],[351,65,2],[441,47,3],[563,70,1.5],[651,35,2],[854,54,2.5],[951,96,2],[66,264,2],[437,450,2.5],[555,475,2],[913,295,2.5],[935,501,2],[362,518,1.5],[129,505,2],[498,116,1.5],[601,131,2]];
    return `<g class="expedition-far-sky"><ellipse cx="508" cy="280" rx="440" ry="217" fill="#4d597d" opacity=".045"/><ellipse cx="508" cy="279" rx="417" ry="199" fill="none" stroke="#a2a9ce" stroke-width="1" stroke-dasharray="2 13" opacity="${n(.065+progress*.1)}"/><path d="M71 117Q440-26 927 120M59 452q426 113 884-9" fill="none" stroke="#859fbd" stroke-width="1" opacity=".065"/>
      <g opacity=".3"><path d="m416 108 14-11 32 3 8 10-16 7-15 28-8-26Z" fill="#485a72"/><path d="m417 108 14-11 31 3 8 10-23 5Z" fill="#768b99"/><path d="m518 467 21-13 41 9 6 11-23 9-17 24-14-28Z" fill="#384960"/><path d="m520 467 19-13 41 9 6 11-26 4Z" fill="#72869b"/><path d="m917 240 16-8 25 7-9 17-11 18-7-18Z" fill="#65798d"/><path d="m69 336 21-12 25 7-11 19-10 19-11-23Z" fill="#536a80"/></g>
      <path d="M493 91q9-13 18 0m-5-1q7-10 14 0M99 204q7-10 14 0m-4 0q7-10 14 0M870 481q6-8 12 0m-4 0q6-8 12 0" fill="none" stroke="#bbc9d4" stroke-width="1.3" opacity=".32"/>
      ${stars.map(([x,y,r],i)=>star(x,y,r,'#d1d4e8',`class="expedition-background-star" style="--expedition-delay:-${i%7}s" opacity="${n(.16+progress*.32)}"`)).join('')}
      <g class="expedition-cloud expedition-cloud-one" fill="#9caec9" opacity="${n(.1-progress*.035)}"><path d="M38 251q11-20 29-9 5-29 30-17 20-9 32 15 26-5 38 16H38Z"/><path d="M849 122q15-23 35-14 12-21 29-3 25-4 39 21H849Z"/></g>
      <g class="expedition-cloud expedition-cloud-two" fill="#c2bfda" opacity="${n(.07-progress*.02)}"><path d="M334 425q11-18 30-10 7-23 25-16 18-6 29 18 19-5 33 14H334Z"/><path d="M835 328q13-18 26-11 10-17 28-4 22-5 32 18H835Z"/></g>
      <g class="expedition-sky-skiff" transform="translate(518 47)"><g class="expedition-skiff-drift"><path d="M-26 4h49L13 14H-14Z" fill="#a39aaa" opacity=".7"/><path d="M-3 4v-27m0 1-18 22h18Zm5 4L18 1H2Z" fill="#b6c4cd" stroke="#b6c4cd" stroke-width="1" opacity=".67"/>${star(3,16,2,'#d8c9a9')}</g></g></g>`;
  }

  function world(model) {
    const normalized=normalize(model);
    return `<svg class="expedition-world-art" viewBox="0 0 1000 540" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="四科远征群岛" data-world-stage="${normalized.stage}" data-world-progress="${n(normalized.progress)}" fill="none" stroke="none"><title>四科远征群岛：每一段专注，都会点亮一处新的风景</title>${horizon(normalized.progress)}${normalized.subjects.map(bridge).join('')}${normalized.subjects.map(island).join('')}</svg>`;
  }

  // A celebration made of light, layered over the existing islands and their owned decorations.
  // Keep this SVG independent of minutes so normal syncs do not restart its ambient animation.
  function resonance(model) {
    if (!model || model.resonance?.active !== true) return '';
    const colors = ['#9bd6be', '#b7bdf7', '#efc4ae', '#a6dfe8'];
    const currents = [
      {id:'math', x:235, y:181, bx:337, by:184, path:'M337 184C389 132 447 151 520 230'},
      {id:'cs', x:770, y:179, bx:668, by:182, path:'M668 182C622 132 571 153 520 230'},
      {id:'politics', x:230, y:406, bx:332, by:399, path:'M332 399C394 402 449 326 520 230'},
      {id:'english', x:775, y:407, bx:673, by:400, path:'M673 400C615 402 573 323 520 230'},
    ];
    const skyStars = [[147,145,3],[359,68,4],[648,71,3],[856,156,4],[871,359,3],[634,473,4],[376,472,3],[138,355,4],[403,129,2],[630,136,2],[426,386,2],[610,387,2]];
    const streams = currents.map((c,i) => `<g class="fq-resonance-channel" data-resonance-subject="${c.id}" style="--resonance-color:${colors[i]};--resonance-order:${i}">
      <g class="fq-resonance-beacon"><ellipse cx="${c.x}" cy="${c.y+8}" rx="114" ry="39" fill="none" stroke="${colors[i]}" stroke-width="1.5" opacity=".48"/><ellipse cx="${c.x}" cy="${c.y+8}" rx="120" ry="43" fill="none" stroke="${colors[i]}" stroke-width=".6" stroke-dasharray="2 15" opacity=".38"/>
        <g transform="translate(${c.bx} ${c.by})"><circle class="fq-resonance-beacon-pulse" r="14" fill="${colors[i]}" opacity=".1"/><circle r="7" fill="#232c46" stroke="${colors[i]}" stroke-width="1.2"/>${star(0,0,4,colors[i])}</g></g>
      <g class="fq-resonance-stream"><path d="${c.path}" pathLength="100" fill="none" stroke="${colors[i]}" stroke-width="10" opacity=".045"/><path d="${c.path}" pathLength="100" class="fq-resonance-current-line" fill="none" stroke="${colors[i]}" stroke-width="1.3" opacity=".56"/><path d="${c.path}" pathLength="100" class="fq-resonance-current-light" fill="none" stroke="${colors[i]}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1.2 31" opacity=".9"/></g>
    </g>`).join('');
    return `<svg class="expedition-resonance-art" viewBox="0 0 1000 540" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="none">
      <defs>
        <linearGradient id="fq-resonance-spectrum" x1="0%" y1="0%" x2="100%" y2="65%"><stop stop-color="#9bd6be"/><stop offset=".34" stop-color="#b7bdf7"/><stop offset=".67" stop-color="#efc4ae"/><stop offset="1" stop-color="#a6dfe8"/></linearGradient>
        <linearGradient id="fq-resonance-aurora" x1="0%" y1="0%" x2="100%" y2="0%"><stop stop-color="#9bd6be" stop-opacity="0"/><stop offset=".24" stop-color="#9bd6be"/><stop offset=".5" stop-color="#b7bdf7"/><stop offset=".75" stop-color="#efc4ae"/><stop offset="1" stop-color="#a6dfe8" stop-opacity="0"/></linearGradient>
        <radialGradient id="fq-resonance-heart"><stop stop-color="#f5e6be" stop-opacity=".19"/><stop offset=".38" stop-color="#cfc4f4" stop-opacity=".085"/><stop offset="1" stop-color="#b7bdf7" stop-opacity="0"/></radialGradient>
      </defs>
      <g class="fq-resonance-sky">
        <path class="fq-resonance-aurora fq-resonance-aurora-one" d="M163 146C328 25 411 164 530 92S733 64 859 153" fill="none" stroke="url(#fq-resonance-aurora)" stroke-width="26" opacity=".07"/>
        <path class="fq-resonance-aurora fq-resonance-aurora-two" d="M168 147C328 26 413 163 530 92S733 67 854 152" fill="none" stroke="url(#fq-resonance-aurora)" stroke-width="3" opacity=".36"/>
        <ellipse cx="503" cy="280" rx="374" ry="196" fill="none" stroke="url(#fq-resonance-spectrum)" stroke-width="1.1" opacity=".4"/>
        <ellipse class="fq-resonance-orbit" cx="503" cy="280" rx="382" ry="202" pathLength="360" fill="none" stroke="url(#fq-resonance-spectrum)" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="1 25 1 63" opacity=".7"/>
        ${skyStars.map(([x,y,r],i)=>star(x,y,r,colors[i%4],`class="fq-resonance-sky-star" style="--resonance-twinkle:-${i*.7}s"`)).join('')}
      </g>
      ${streams}
      <g class="fq-resonance-heart" transform="translate(520 230)">
        <ellipse class="fq-resonance-heart-light" rx="100" ry="115" fill="url(#fq-resonance-heart)"/>
        <g class="fq-resonance-heart-orbits"><ellipse cy="-2" rx="50" ry="20" transform="rotate(-23)" fill="none" stroke="url(#fq-resonance-spectrum)" stroke-width="1.4" stroke-dasharray="30 7 2 7" opacity=".7"/><ellipse cy="-2" rx="56" ry="23" transform="rotate(23)" fill="none" stroke="url(#fq-resonance-spectrum)" stroke-width=".7" opacity=".4"/></g>
        <g class="fq-resonance-crown"><path d="M-31-58-19-71-8-62 0-79 8-62 19-71 31-58" fill="none" stroke="#eddfb8" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>${star(0,-87,5,'#f5e7c3')}<path d="M-14-53h28" stroke="#eddfb8" stroke-width=".8" opacity=".4"/></g>
        ${[-1,1].map(side=>`<g class="fq-resonance-heart-spark" style="--resonance-twinkle:${side<0?'-1s':'-3s'}">${star(side*55,-20,4,side<0?colors[0]:colors[3])}${star(side*41,34,2.5,side<0?colors[2]:colors[1])}</g>`).join('')}
        <g class="fq-resonance-burst"><ellipse class="fq-resonance-ripple fq-resonance-ripple-one" rx="52" ry="29" fill="none" stroke="#f1dfb8" stroke-width="1.5"/><ellipse class="fq-resonance-ripple fq-resonance-ripple-two" rx="52" ry="29" fill="none" stroke="url(#fq-resonance-spectrum)" stroke-width="1"/>${Array.from({length:12},(_,i)=>`<g transform="rotate(${i*30})"><path class="fq-resonance-ray" d="M0-46V-68" stroke="${colors[i%4]}" stroke-width="2" stroke-linecap="round"/></g>`).join('')}</g>
      </g>
    </svg>`;
  }

  return {world, resonance};
});
