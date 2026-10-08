(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.FocusProgressBars=api;})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const designs={
    'bar-default':{name:'初旅刻度',copy:'细细的路程刻度，陪伴每一小步。',colors:['#756d9e','#c5b8ec'],rail:'#292a40'},
    'bar-mint':{name:'薄荷新芽',copy:'嫩叶沿藤蔓生长，新芽停在你已经抵达的地方。',colors:['#28705e','#9bdc8b'],rail:'#183930'},
    'bar-aurora':{name:'极光流转',copy:'青绿与紫色的帷幕轻轻舒展，照亮这段旅程。',colors:['#315fb8','#61e5c2'],rail:'#202742'},
    'bar-comet':{name:'彗星轨迹',copy:'彗星领路，已经走过的距离留下细碎星尘。',colors:['#794287','#ec9d66'],rail:'#382b3c'},
    'bar-tide':{name:'潮汐回响',copy:'几层流动的水纹，汇成你这一程的清澈潮汐。',colors:['#1b6a96','#67d5d2'],rail:'#173545'},
    'bar-prism':{name:'棱镜虹光',copy:'虹光在玻璃中交汇，明亮光芯、流动辉光与细腻反射，照亮每一段真实进度。',colors:['#ff285d','#50ff9a'],rail:'#090f22'},
    'bar-koi':{name:'荷塘涟漪',copy:'圆荷叶托着水滴与花苞，层层涟漪沿着真实进度轻轻铺开。',colors:['#237886','#67c5b2'],rail:'#193c40'},
    'bar-fox':{name:'狐伴花径',copy:'小狐狸沿着花径散步，每一段专注都让它走远一点。',colors:['#587956','#a6c581'],rail:'#293a32'},
    'bar-whale':{name:'潮间水母',copy:'半透明水母伞与柔软触手浮在潮间，气泡和水光伴着真实进度前行。',colors:['#326f94','#9bd9dc'],rail:'#1c344a'},
    'bar-dragon':{name:'纸鸢长风',copy:'燕形纸鸢展开折纸双翼，两条飘带与风线沿着真实进度舒展。',colors:['#688496','#e3c99a'],rail:'#263e49'}
  };
  const cache=new WeakMap();let serial=0;
  const expansion=typeof module==='object'&&module.exports?require('./shop-expansion.js'):root.FocusShopExpansion;
  for(const entry of expansion?.entries||[])if(entry.slot==='bar')designs[entry.id]=expansion.barDesign(entry.id);
  const motionLevels=Object.freeze(Object.fromEntries(Object.keys(designs).map(id=>{
    const entry=expansion?.item?.(id),legacy={
      'bar-default':'still','bar-mint':'soft','bar-aurora':'soft','bar-comet':'lively','bar-tide':'lively',
      'bar-prism':'vivid','bar-koi':'vivid','bar-fox':'vivid','bar-whale':'vivid','bar-dragon':'vivid'
    };
    return [id,entry?(entry.lotteryOnly?'limited':entry.diamonds>=12?'vivid':entry.diamonds>0||entry.coins>=300?'lively':'soft'):legacy[id]||'soft'];
  })));
  const classes=['total-progress','subject-progress','weekly-progress','q-progress','q-first-round-progress'];
  const selector=classes.map(name=>`.${name}[data-skin-slots~="bar"]`).join(',');
  const has=id=>typeof id==='string'&&Object.prototype.hasOwnProperty.call(designs,id);
  const skin=id=>has(id)?id:'bar-default';
  const prefix=()=>`fq-progress-${++serial}`;
  const svgOpen=(cls,viewBox,extra='')=>`<svg class="${cls}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="none" style="stroke:none;fill:none" ${extra}>`;
  function star(x,y,r,color,extra=''){return `<path d="M${x} ${y-r}l${r*.24} ${r*.76} ${r*.76} ${r*.24}-${r*.76} ${r*.24}-${r*.24} ${r*.76}-${r*.24}-${r*.76}-${r*.76}-${r*.24} ${r*.76}-${r*.24}Z" fill="${color}" ${extra}/>`;}
  function rawFigure(id){
    if(expansion?.has(id,'bar'))return expansion.barFigure(id);
    switch(id){
      case 'bar-mint':return '<path d="M45 43Q37 25 42 9" fill="none" stroke="#b5e89c" stroke-width="3" stroke-linecap="round"/><path d="M41 25Q18 29 15 11q24-3 26 14Z" fill="#69b98a"/><path d="M41 21Q45 1 65 4q-1 22-24 17Z" fill="#c0ed9c"/><path d="m20 15 20 11m6-9 13-8" stroke="#e1f6b8" stroke-width="1.4" opacity=".75"/>';
      case 'bar-aurora':return '<path d="M8 31Q23 0 39 20T74 12Q64 43 43 32T8 31Z" fill="#70e5c2" opacity=".8"/><path d="M8 36Q27 7 45 27T74 20" fill="none" stroke="#c9a8fa" stroke-width="5"/>'+star(58,16,6,'#e3ffee');
      case 'bar-comet':return '<path d="M5 30Q35 11 62 18L64 28Q30 25 5 30Z" fill="#fdbd81" opacity=".7"/><path d="M16 39Q42 21 61 22" fill="none" stroke="#efb1bd" stroke-width="3" opacity=".7"/>'+star(61,22,12,'#fff0b4')+star(61,22,5,'#fffef1');
      case 'bar-tide':return '<path d="M10 32Q25 34 33 17q8-18 23-7 9 8-1 15 0-13-11-8 4 18 23 18H10Z" fill="#9ceae0"/><path d="M10 36q24 6 42-5m-7 8h20" fill="none" stroke="#e0fff5" stroke-width="2"/>';
      case 'bar-prism':return '';
      case 'bar-koi':return '<g data-motif="lotus-pond"><g class="pb-star-flow"><ellipse cx="38" cy="36" rx="34" ry="8" fill="none" stroke="#b9eee2" stroke-width="1.4"/><ellipse cx="38" cy="36" rx="25" ry="5" fill="none" stroke="#78bdba" stroke-width="1.2"/></g><path d="M7 28q8-15 29-11 25-3 32 12-22 16-46 6l16-8-22 6Z" fill="#80b997"/><path d="m17 25 21 2 19-5m-19 5 11 8m-11-8-10-6" fill="none" stroke="#c2dfb4" stroke-width="1.2"/><path d="M48 26V12" stroke="#5f9b7e" stroke-width="2.2"/><path d="M48 14q-13-3-8-13 8 2 8 13m0 0Q47 2 56 0q5 11-8 14Z" fill="#eac3c9"/><path d="M28 11q-7 10 0 12 8-2 0-12Z" fill="#d2f5eb"/><circle cx="30" cy="18" r="1.5" fill="#f2fff5"/></g>';
      case 'bar-fox':return '<g class="pb-animal-tail"><path d="M30 31Q0 34 9 12q5 18 22 10Z" fill="#ec965c"/><path d="M9 12q2 9 8 12-10 4-10-5Z" fill="#fff0d2"/></g><path d="M23 26q11-13 30-5l9 11-7 10H27Z" fill="#df8750"/><path d="M28 35v9h7l3-9m10 0v9h7l4-11" fill="#8b6151"/><path d="m48 23 1-19 12 11 10-10 4 22-14 13Z" fill="#efad70"/><path d="m49 24 13 6 12-7-5 11-8 6Z" fill="#fff1d5"/><path d="m53 12 1 8 5-3m7 0 4-6 1 10" fill="#7d544b"/><circle cx="56" cy="24" r="1.7" fill="#333e49"/><circle cx="68" cy="24" r="1.7" fill="#333e49"/><path d="m60 31 4 0-2 3Z" fill="#333e49"/>';
      case 'bar-whale':return '<g data-motif="tidal-jellyfish"><g class="pb-animal-tail"><path d="M23 27q-10 13 1 19m9-18q-6 7 1 16m11-16q9 9 0 18m12-20q14 8 4 16" fill="none" stroke="#b8e6dc" stroke-width="2.2" stroke-linecap="round"/><path d="M29 28q-2 8 4 15m16-15q-3 5 1 12" fill="none" stroke="#96b6db" stroke-width="3" stroke-linecap="round"/></g><path d="M12 25Q14 0 38 1q25 0 31 24-25 14-57 0Z" fill="#92c4d6" opacity=".85"/><path d="M38 1Q26 9 25 29q15 4 31-1Q51 9 38 1Z" fill="#d9efdf" opacity=".48"/><path d="M15 25q25 12 51 0" fill="none" stroke="#e0f4e8" stroke-width="2"/><path d="M21 18q1-10 12-12" fill="none" stroke="#d8f5ed" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="12" r="3.5" fill="none" stroke="#b3dee2" stroke-width="1.2"/><circle cx="73" cy="33" r="3" fill="none" stroke="#b3dee2" stroke-width="1"/></g>';
      case 'bar-dragon':return '<g data-motif="paper-swallow-kite"><g class="pb-animal-tail"><path d="M33 29Q18 45 5 36m39-8Q33 49 17 44" fill="none" stroke="#e8bba8" stroke-width="2.2" stroke-linecap="round"/><path d="m18 37 5-4 3 7-5-1-4 5-1-7Zm12 5 4-4 4 6-5 0-2 5-2-5Z" fill="#f0dcc0"/></g><path d="M8 4 38 15 47 2l8 14 21-9-19 25-11-5-13 8Z" fill="#9bbac7"/><path d="M8 4 38 15l-5 20Z" fill="#edcf9f"/><path d="M38 15 47 2l-1 25-13 8Z" fill="#6f879f"/><path d="m47 2 8 14 21-9-19 25-11-5Z" fill="#c3d7ca"/><path d="M8 4 46 27 76 7M47 2l-1 25" fill="none" stroke="#e9e0c5" stroke-width="1.4"/><path d="M38 30Q53 44 72 39" fill="none" stroke="#c2dce0" stroke-width="1.1"/></g>';
      default:return '<path d="M60 10 68 24 60 38 52 24Z" fill="#e6dbfa"/><path d="M60 17v14" stroke="#8176ad" stroke-width="2"/>';
    }
  }
  function figure(id){
    let art=rawFigure(id),extra='';
    // These older figures predate articulated artwork. Add joints to their
    // existing geometry; the actual leader remains anchored to real progress.
    const part=(start,name)=>{art=art.replace(start,start.replace(/^(<\w+)/,`$1 class="${name}"`));};
    if(id==='bar-railway'){
      extra=[27,60].map(x=>`<g transform="translate(${x} 37)"><g class="pb-train-wheel"><path d="M-4 0h8M0-4v8" stroke="#dce4cf" stroke-width="1.2" opacity=".75"/></g></g>`).join('');
    }
    if(id==='bar-cat')part('<path d="M28 33','pb-cat-tail');
    if(id==='bar-honey'){part('<ellipse cx="36"','pb-bee-wing pb-bee-wing-back');part('<ellipse cx="57"','pb-bee-wing');}
    if(id==='bar-lantern')part('<rect x="37"','pb-lantern-core');
    if(id==='bar-jellyfish'){
      part('<path d="M18 24','pb-jelly-bell');
      for(const x of [27,40,53,66])part(`<path d="M${x} 27`,'pb-jelly-thread');
    }
    if(id==='bar-phoenix')part('<path d="M42 26','pb-phoenix-wings');
    if(id==='bar-music'){
      part('<path d="M43 13','pb-music-dancer');
      extra='<g class="pb-music-note"><path d="M13 16V7l7 2v8" stroke="#f7e5b3" stroke-width="1.4"/><ellipse cx="11" cy="17" rx="3" ry="2" fill="#f7e5b3"/></g><g class="pb-music-note pb-music-note-late"><path d="M70 16V5l5 2" stroke="#bddcdb" stroke-width="1.3"/><ellipse cx="68" cy="17" rx="3" ry="2" fill="#bddcdb"/></g>';
    }
    if(id==='bar-airship')extra='<path d="M64 34h8" stroke="#d7e7d9" stroke-width="1.4"/><g transform="translate(73 34)"><g class="pb-airship-propeller"><path d="M0-8Q5-7 1 0q4 7-1 8-5-1-1-8-4-7 1-8Z" fill="#ddebdc"/></g></g>';
    if(id==='bar-teacups')extra='<g class="pb-cup-steam"><path d="M29 13q-5-6 0-11m13 11q5-6 0-11" stroke="#edf0dc" stroke-width="1.6" stroke-linecap="round"/></g>';
    if(id==='bar-needlework')part('<path d="M51 36','pb-sewing-needle');
    if(id==='bar-crystalvine')extra=[[27,7],[50,15],[66,23]].map(([x,y],i)=>`<g class="pb-crystal-glint" style="--pb-delay:${-i*1.3}s">${star(x,y,4.1,'#f0ffea')}</g>`).join('');
    if(id==='bar-prismcurrent')extra='<g class="pb-crystal-reflection"><path d="m23 13 14 11 11-13m-34 19 24-6 19 14" stroke="#f4fdff" stroke-width="1.7" opacity=".85"/><path d="m52 15 14 9-10 8" stroke="#d8adff" stroke-width="1.3"/></g>';
    return `<g class="pb-figure-motion" data-pb-figure="${id}" data-pb-motion="${motionLevels[id]}">${art}${extra}</g>`;
  }
  function prismRibbon(uid){
    // A small, alpha-faded halo gives the light a coloured reflection without blur filters.
    const rgb=`${uid}-rgb`,fade=`${uid}-aura-fade`,mask=`${uid}-aura-mask`,glass=`${uid}-glass`,clip=`${uid}-glass-clip`;
    const beams=[['rose','#ff6cdd',155,102,'a'],['ice','#66ebff',435,133,'b']];
    return `<defs><linearGradient id="${rgb}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="0" spreadMethod="repeat"><stop stop-color="#ff2057"/><stop offset=".16" stop-color="#ff961d"/><stop offset=".32" stop-color="#f1ff22"/><stop offset=".49" stop-color="#23f389"/><stop offset=".66" stop-color="#19c9ff"/><stop offset=".82" stop-color="#8242ff"/><stop offset="1" stop-color="#ff2057"/></linearGradient><linearGradient id="${fade}" gradientUnits="userSpaceOnUse" x1="0" y1="-12" x2="0" y2="36"><stop stop-color="white" stop-opacity="0"/><stop offset=".28" stop-color="white" stop-opacity=".24"/><stop offset=".5" stop-color="white" stop-opacity=".62"/><stop offset=".72" stop-color="white" stop-opacity=".24"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><mask id="${mask}" maskUnits="userSpaceOnUse" x="0" y="-12" width="600" height="48"><rect y="-12" width="600" height="48" fill="url(#${fade})"/></mask><linearGradient id="${glass}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#050619" stop-opacity=".52"/><stop offset=".24" stop-color="#061126" stop-opacity=".04"/><stop offset=".46" stop-color="#020717" stop-opacity=".02"/><stop offset="1" stop-color="#020512" stop-opacity=".73"/></linearGradient>${beams.map(([name,color])=>`<radialGradient id="${uid}-${name}"><stop stop-color="#ffffff" stop-opacity=".97"/><stop offset=".14" stop-color="#ffffff" stop-opacity=".84"/><stop offset=".36" stop-color="${color}" stop-opacity=".66"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`).join('')}<clipPath id="${clip}"><rect width="600" height="24" rx="10"/></clipPath></defs><g class="pb-prism-aura" mask="url(#${mask})"><g class="pb-rgb-flow"><rect x="-600" y="-12" width="1800" height="48" fill="url(#${rgb})"/></g></g><g clip-path="url(#${clip})"><rect width="600" height="24" fill="#090f22"/><g class="pb-rgb-flow"><rect x="-600" width="1800" height="24" fill="url(#${rgb})" opacity=".94"/></g><rect width="600" height="24" fill="url(#${glass})"/>${beams.map(([name,color,x,r,kind])=>`<g class="pb-prism-beam pb-prism-beam-${kind}">${[-600,0,600].map(offset=>`<ellipse cx="${x+offset}" cy="12" rx="${r}" ry="15" fill="url(#${uid}-${name})"/><ellipse cx="${x+offset}" cy="12" rx="${r*.78}" ry="1.2" fill="url(#${uid}-${name})"/>`).join('')}</g>`).join('')}<g class="pb-prism-filament"><path d="M-600 14Q-450 3-300 12T0 14Q150 3 300 12T600 14Q750 3 900 12T1200 14" fill="none" stroke="#ebffff" stroke-width="1.25" opacity=".62"/><path d="M-600 17Q-450 20-300 14T0 17Q150 20 300 14T600 17Q750 20 900 14T1200 17" fill="none" stroke="#fff2ff" stroke-width=".8" opacity=".34"/></g><path d="M0 3.5H600" stroke="#ecf7ff" stroke-width="1" opacity=".53"/><path d="M0 22.5H600" stroke="#88b9ff" stroke-width=".8" opacity=".35"/><ellipse cx="598" cy="12" rx="5" ry="10" fill="#eaffff" opacity=".64"/></g>`;
  }
  function rawRibbon(id,uid){
    if(expansion?.has(id,'bar'))return expansion.barRibbon(id,uid);
    if(id==='bar-prism')return prismRibbon(uid);
    const d=designs[id],gradient=`${uid}-fill`;let detail='';
    const defs=`<defs><linearGradient id="${gradient}" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${d.colors[0]}"/><stop offset="1" stop-color="${d.colors[1]}"/></linearGradient></defs>`;
    if(id==='bar-default')detail='<path d="M30 17v5m60-5v5m60-5v5m60-5v5m60-5v5m60-5v5m60-5v5m60-5v5m60-5v5m60-5v5M150 13v9m150-9v9m150-9v9" stroke="#e9e0fc" stroke-width="1.4" opacity=".7"/>';
    if(id==='bar-mint')detail='<path d="M0 17q30-14 60-3t60-2 60 2 60-2 60 2 60-2 60 2 60-2 60 2 60-2" stroke="#d4efad" stroke-width="2" fill="none"/>'+[35,116,201,288,376,462,548].map((x,i)=>`<path d="m${x} 13q-16-15-24-6 4 12 24 6m3 1q17-13 25-5-9 12-25 5Z" fill="${i%2?'#bee58d':'#64bc83'}"/>`).join('');
    if(id==='bar-aurora')detail='<g class="pb-aurora-flow"><path d="M-30 18Q30-7 85 14T195 12 305 9 415 15 525 9 635 13" fill="none" stroke="#81ffb5" stroke-width="11" opacity=".53"/><path d="M-20 5Q38 28 95 6T210 13 325 9 440 15 555 7 640 15" fill="none" stroke="#c19afd" stroke-width="7" opacity=".77"/><path d="M-30 15Q40 30 115 13T250 17 385 11 520 17 650 10" fill="none" stroke="#9debed" stroke-width="2" opacity=".9"/></g>';
    if(id==='bar-comet')detail='<path class="pb-comet-dust" d="M0 7H580M15 18H593M58 12H578" fill="none" stroke="#ffe3bc" stroke-width="1.5" stroke-dasharray="3 31 1 19 6 55" opacity=".75"/>'+[75,225,415,530].map((x,i)=>star(x,8+i%2*9,3.5,'#fff0bf')).join('');
    if(id==='bar-tide'||id==='bar-koi')detail='<g class="pb-water-flow"><path d="M-90 7Q-60 0-30 7T30 7 90 7 150 7 210 7 270 7 330 7 390 7 450 7 510 7 570 7 630 7 690 7" fill="none" stroke="#b9f4e9" stroke-width="3" opacity=".65"/><path d="M-90 17Q-60 10-30 17T30 17 90 17 150 17 210 17 270 17 330 17 390 17 450 17 510 17 570 17 630 17 690 17" fill="none" stroke="#4b9bb9" stroke-width="4" opacity=".7"/></g>'+(id==='bar-koi'?'<path d="M112 12q-20-12-29 2 11 13 27 0l-10-2Zm203-3q-20-12-29 2 11 13 27 0l-10-2Zm170 7q-20-12-29 2 11 13 27 0l-10-2Z" fill="#85bf81"/>':'');
    if(id==='bar-fox')detail='<path d="M0 16q80-8 150-3T300 13 450 13 600 15" stroke="#c9d7a2" stroke-width="2" opacity=".68"/>'+[40,118,208,296,400,503,566].map((x,i)=>`<path d="M${x} 21v-12m0 8 7-5" stroke="#43724f" stroke-width="2"/>${star(x,7+i%2*3,4,i%2?'#f5d68d':'#eeb4c5')}`).join('');
    if(id==='bar-whale')detail='<g class="pb-water-flow"><path d="M-90 6q45 13 90 0t90 0 90 0 90 0 90 0 90 0 90 0 90 0M-90 19q45-12 90 0t90 0 90 0 90 0 90 0 90 0 90 0 90 0" stroke="#c7eee6" stroke-width="1.5" fill="none" opacity=".65"/></g>'+[27,91,174,248,332,423,488,575].map((x,i)=>`<circle class="pb-star-flow" cx="${x}" cy="${6+i%3*5}" r="${i%3?2.5:4}" stroke="#d5f1ef" stroke-width="1" fill="none"/>`).join('');
    if(id==='bar-dragon')detail='<g class="pb-cloud-flow"><path d="M-90 8q35-13 70 0t70 0 70 0 70 0 70 0 70 0 70 0 70 0 70 0 70 0M-90 18q40-10 80 0t80 0 80 0 80 0 80 0 80 0 80 0 80 0 80 0" stroke="#e8e1c8" stroke-width="1.3" fill="none" opacity=".8"/></g>'+[34,133,232,331,430,529].map((x,i)=>`<path d="m${x} ${i%2?9:14} 7-5 7 5-7 4Z" fill="#ebc3a8"/><path d="m${x+7} ${i%2?9:14} 13 4" stroke="#cce1db" stroke-width=".8" fill="none"/>`).join('');
    return `${defs}<rect width="600" height="24" fill="url(#${gradient})"/>${detail}`;
  }
  function ribbon(id,uid){
    const color=designs[id].colors[1];let extra='',art=rawRibbon(id,uid);
    if(id==='bar-prismcurrent'){
      const gradient=`${uid}-collection`;
      art=art.replace(`<linearGradient id="${gradient}">`,`<linearGradient id="${gradient}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="0" spreadMethod="repeat">`)
        .replace(/<rect x="0" y="0" width="600" height="24"[^>]*\/>/,`<g class="pb-prism-current-spectrum"><rect x="-600" width="1800" height="24" fill="url(#${gradient})"/></g>`);
    }
    if(['bar-honey','bar-hummingbird'].includes(id))extra=`<g class="pb-pollen-drift"><path d="M0 6h600M0 19h600" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-dasharray="1 41 2 29" opacity=".8"/></g>`;
    if(['bar-teacups','bar-cocoamelt'].includes(id))extra=`<path class="pb-tea-surface" d="M0 8q25 8 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0" stroke="${color}" stroke-width="1.5" fill="none" opacity=".7"/>`;
    if(id==='bar-crystalvine')extra=`<path class="pb-vine-dew" d="M0 16q35-13 70-3t70-1 70 1 70-1 70 1 70-1 70 1 110-1" stroke="#e5ffe7" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="2 39 1 28" fill="none"/>`;
    if(['bar-solarfleet','bar-prismcurrent'].includes(id))extra=`<path class="pb-solar-courier" d="M0 5h600M0 19h600" stroke="${id==='bar-prismcurrent'?'#e6f9ff':'#fff0b5'}" stroke-width="1.9" stroke-linecap="round" stroke-dasharray="18 172 5 65" opacity=".86"/>`;
    return `<g class="pb-theme-ribbon" data-pb-ribbon="${id}" data-pb-motion="${motionLevels[id]}">${art}${extra}</g>`;
  }
  function layerMarkup(id){const uid=prefix();return `<span class="pb-ribbon" aria-hidden="true">${svgOpen('pb-ribbon-svg','0 0 600 24','preserveAspectRatio="none"')}${ribbon(id,uid)}</svg></span><span class="pb-leader" aria-hidden="true">${svgOpen('pb-leader-svg','0 0 80 48')}${figure(id)}</svg></span>`;}
  function decorate(scope){
    scope=scope||root.document;if(!scope)return 0;
    const doc=scope.nodeType===9?scope:scope.ownerDocument||root.document,rootNode=doc?.documentElement,equipped=skin(rootNode?.dataset?.bar);
    const targets=[...(scope.matches?.(selector)?[scope]:[]),...Array.from(scope.querySelectorAll?.(selector)||[])];let changed=0;
    for(const bar of targets){
      const id=has(bar.dataset.progressSkin)?bar.dataset.progressSkin:equipped;
      const fill=Array.from(bar.children||[]).find(node=>String(node.tagName).toLowerCase()==='i');if(!fill)continue;
      const width=String(fill.style?.width||'').trim(),value=/^(?:\d+(?:\.\d*)?|\.\d+)%$/.test(width)?Math.max(0,Math.min(100,Number.parseFloat(width))):0;
      let entry=cache.get(bar);const compact=!bar.classList.contains('total-progress');
      if(!entry||entry.fill!==fill||entry.skin!==id||entry.compact!==compact||entry.layer.parentNode!==fill){
        if(entry?.layer?.parentNode)entry.layer.remove();
        const layer=doc.createElement('span');layer.className='pb-art';layer.setAttribute('aria-hidden','true');layer.innerHTML=layerMarkup(id);fill.appendChild(layer);
        bar.classList.add('pb-enhanced');bar.dataset.pbSkin=id;bar.dataset.pbCompact=String(compact);bar.dataset.pbMotion=motionLevels[id];
        entry={fill,skin:id,compact,layer,empty:null,progress:null};cache.set(bar,entry);changed++;
      }
      const empty=value<=0;if(entry.empty!==empty){bar.dataset.pbEmpty=String(empty);entry.empty=empty;}
      if(entry.progress!==value){bar.style.setProperty('--pb-progress',String(value));entry.progress=value;}
    }
    return changed;
  }
  function sample(id,progress,width=160,height=112,thumbnail=false){
    const d=designs[id],uid=prefix(),margin=thumbnail?12:20,railWidth=width-margin*2,railHeight=thumbnail?12:17,y=thumbnail?56:16,p=Math.max(0,Math.min(100,progress)),filled=railWidth*p/100;
    const actorW=Math.min(id==='bar-prism'?0:id==='bar-default'?12:thumbnail?34:40,filled),actorH=actorW*.6;
    return `${svgOpen(thumbnail?'shop-art-svg progress-bar-thumbnail':'progress-bar-sample',`0 0 ${width} ${height}`,`data-art="${id}" data-pb-design="${id}" data-pb-sample="${p}"`)}<rect x="${margin-3}" y="${y-3}" width="${railWidth+6}" height="${railHeight+6}" rx="${railHeight*.5+3}" fill="#0b1421" stroke="${d.colors[0]}" stroke-opacity=".32"/><rect x="${margin}" y="${y}" width="${railWidth}" height="${railHeight}" rx="${railHeight/2}" fill="${d.rail}"/><path d="M${margin+railWidth*.25} ${y+railHeight+5}v3m${railWidth*.25}-3v3m${railWidth*.25}-3v3" stroke="${d.colors[1]}" opacity=".3"/>${p>0?`<svg x="${margin}" y="${y}" width="${filled}" height="${railHeight}" viewBox="0 0 600 24" preserveAspectRatio="none" overflow="${id==='bar-prism'?'visible':'hidden'}" style="stroke:none;fill:none">${ribbon(id,uid)}</svg>${actorW>0?`<svg class="pb-preview-leader" x="${margin+filled-actorW}" y="${y+(railHeight-actorH)/2}" width="${actorW}" height="${actorH}" viewBox="0 0 80 48" overflow="hidden" style="stroke:none;fill:none">${figure(id)}</svg>`:''}`:''}${thumbnail?`<path d="M14 87h17m99 0h17" stroke="${d.colors[1]}" opacity=".35" stroke-width="1.5"/><circle cx="80" cy="87" r="2" fill="${d.colors[1]}" opacity=".7"/>`:''}</svg>`;
  }
  function preview(itemId){return has(itemId)?sample(itemId,74,160,112,true):'';}
  function fullPreview(itemId){if(!has(itemId))return '';const design=designs[itemId];return `<section class="progress-bar-full-preview" data-pb-design="${itemId}"><header><small>每一段真实专注，都有自己的样子</small><h3>${design.name}</h3><p>${design.copy}</p></header><div class="progress-bar-stages">${[0,25,50,75,100].map(n=>`<div class="progress-bar-stage"><span>${n}%</span>${sample(itemId,n,520,48)}</div>`).join('')}</div><p class="progress-bar-preview-note">外观只跟随已完成进度。零进度保持空白，完成后停在终点。</p></section>`;}
  return {has,decorate,preview,fullPreview};
});
