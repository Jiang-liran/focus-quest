(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusLotteryCollectionArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Self-contained geometry. No dependency on shop/scene modules: those compose this art.
  const definitions = [
    ['bar-tidewhale','bar','潮汐鲸航','coin',['#b4f8ed','#217f9d','#f6d797']],
    ['avatar-forestcrown','avatar','森冠巡游者','coin',['#b8dca6','#486c61','#f0d599']],
    ['island-lanternwharf','island','千灯水榭','coin',['#edcf8b','#496a74','#a2e0d2']],
    ['theme-fireflygrove','theme','萤森幻境','coin',['#d5e9a5','#355e50','#e8d89d']],
    ['companion-clockfox','companion','时光灵狐','coin',['#d1eef0','#60789b','#f0d398']],
    ['relic-cloudorrery','relic','云海天球仪','coin',['#d4ecfa','#657da6','#f2d28d']],
    ['bar-eventhorizon','bar','星门跃迁','diamond',['#e9f8ff','#6562cc','#76f8e3']],
    ['avatar-auroraweaver','avatar','极光织梦者','diamond',['#dbceff','#6659a6','#91f8e5']],
    ['island-lunarobservatory','island','悬月天文宫','diamond',['#d5e8ff','#596391','#f3b7df']],
    ['theme-astralrift','theme','星界裂隙','diamond',['#b6eaff','#394b81','#ebb9fa']],
    ['companion-prismwhale','companion','幻晶星鲸','diamond',['#baedff','#706acc','#f5bce5']],
    ['relic-infinitygarden','relic','无尽星庭','diamond',['#c5ffe9','#6265ac','#f5c5ea']]
  ];
  const entries = Object.freeze(definitions.map(([id,slot,name,lotteryMachine,tints]) => Object.freeze({id,slot,name,lotteryMachine,lotteryOnly:true,exclusive:false,coins:lotteryMachine==='coin'?9999:0,diamonds:lotteryMachine==='diamond'?99:0,tints:Object.freeze(tints)})));
  const index = new Map(entries.map(entry => [entry.id,entry]));
  let serial = 0;
  const has = (id,slot) => typeof id==='string' && index.has(id) && (!slot || index.get(id).slot===slot);
  const item = id => has(id) ? index.get(id) : null;
  const colors = id => has(id) ? [...index.get(id).tints] : [];
  const p = (d,fill,attrs='') => `<path d="${d}" fill="${fill}" ${attrs}/>`;
  const l = (d,color,width=1.5,attrs='') => p(d,'none',`stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}`);
  const c = (x,y,r,fill,attrs='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${attrs}/>`;
  const e = (x,y,rx,ry,fill,attrs='') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${attrs}/>`;
  const r = (x,y,w,h,fill,attrs='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${attrs}/>`;
  const star = (x,y,size,color,attrs='') => p(`M${x} ${y-size}l${size*.28} ${size*.72} ${size*.72} ${size*.28}-${size*.72} ${size*.28}-${size*.28} ${size*.72}-${size*.28}-${size*.72}-${size*.72}-${size*.28} ${size*.72}-${size*.28}Z`,color,attrs);
  const g = (body,attrs='') => `<g ${attrs}>${body}</g>`;
  const art = (id,body,cls='',attrs='') => g(body,`class="lca-art ${cls}" data-lottery-collection="${id}" data-skin-slots="${index.get(id).slot}" ${attrs}`);
  const svg = (id,body,w=160,h=112,cls='') => `<svg xmlns="http://www.w3.org/2000/svg" class="shop-art-svg lca-svg ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false" fill="none" stroke="none" data-art="${id}">${body}</svg>`;
  const uid = value => `lca-${String(value || 'art').replace(/[^a-zA-Z0-9_-]/g,'') || 'art'}-${++serial}`;
  function sparks(points,color,cls='lca-glimmer') {
    return points.map(([x,y,s],i) => star(x,y,s,color,`class="${cls}" style="--lca-delay:-${i*1.3}s"`)).join('');
  }
  function clockFace(x,y,size,light='#f1ddb2') {
    return g(c(0,0,size,'#253b51',`stroke="${light}" stroke-width="1.7"`)+c(0,0,size*.77,'none',`stroke="${light}" stroke-width=".55"`)+[0,1,2,3,4,5,6,7,8,9,10,11].map(n=>l(`M0 ${-size*.81}v${size*.15}`,light,.7,`transform="rotate(${n*30})"`)).join('')+g(l(`M0 0v${-size*.53}m0 ${size*.53} ${size*.34} ${size*.21}`,light,1.3),'class="lca-clock-hands"')+c(0,0,1.3,light),`transform="translate(${x} ${y})"`);
  }
  function whaleBody(crystal=false) {
    const body=p('M20 52C26 31 53 21 73 34c11 7 13 22 1 34-10 10-34 10-47-3L14 67 5 48l13 3Z',crystal?'#8ac9ed':'#71c1d0');
    const tail=g(p('M19 55C7 55 1 44 5 31c11 3 16 10 17 17 3-11 11-17 20-17-1 15-10 24-23 24Z',crystal?'#b8b6f1':'#68a9c1'),'class="lca-tail"');
    const belly=p('M29 60q22 14 47-7-1 20-25 23-15 0-22-16Z',crystal?'#ddf2ff':'#c2f2e9');
    const fin=g(p('m47 59 12 20 14-18-14 5Z',crystal?'#b1a0e2':'#41849f'),'class="lca-fin"');
    const facets=crystal?p('m25 47 18-20 8 26-26-6Z','#baf9f2')+p('m43 27 28 6-20 20Z','#ded8ff')+p('m71 33 12 17-32 3Z','#95bde9')+l('M25 47 51 53 47 64m4-11L43 27m8 26 29-4','#e5fbff',.9):l('M32 65q16 9 36-2m-32-7q14 5 30-3','#5bb0b7',1);
    return tail+body+belly+facets+fin+c(73,48,2.1,'#263856')+c(73.6,47.3,.55,'#fff')+l('M67 56q5 2 8-1',crystal?'#536b9c':'#437b91',1.2);
  }
  function companion(id) {
    if(!has(id,'companion'))return '';
    let body='';
    if(id==='companion-clockfox') {
      const tail=g(p('M39 76C4 78 1 52 14 27c-1 21 19 18 22 29 4 10-2 14 3 20Z','#637eaa')+p('M14 27c-1 20 12 19 18 24L21 60C9 48 8 35 14 27Z','#e4f3ee')+l('M15 44q-9 20 17 27','#f0d398',1.2),'class="lca-fox-tail"');
      body=e(49,88,31,6,'#172c46','opacity=".23"')+g(tail+p('M34 54q-10 12-6 30h31q9-19-2-31Z','#a9c8d8')+p('M35 59q9 4 18-1l-7 27H31Z','#e2f0e9')+p('m25 42 1-23 15 15 15-17 3 24Z','#91abc7')+p('m29 33 1-10 9 10m10-2 5-8 1 11Z','#e7c9ad')+p('M27 38q18-11 33 2l-6 18-17 1-11-10Z','#cde4e9')+p('m29 46 15 8 13-9-5 12-14 1Z','#edf4ec')+c(37,43,1.6,'#283c53')+c(52,43,1.6,'#283c53')+p('m42 49 4-1 2 2-3 3Z','#526276')+l('M38 61v21m17-22-1 24','#637e99',2)+clockFace(64,65,13)+sparks([[17,16,3],[72,34,3],[83,64,2]],'#f2d795'),'class="lca-bob"')+e(54,91,24,3,'#a9dddb','opacity=".24"');
    } else {
      body=e(50,89,35,7,'#18234f','opacity=".28"')+e(49,51,41,24,'none','stroke="#9278d6" stroke-width="1" opacity=".6" transform="rotate(-19 49 51)" class="lca-orbit-a"')+g(whaleBody(true)+g(p('m44 28 6-16 12 19Z','#d9c9ff')+l('M50 12 51 28','#eff7ff',.8),'class="lca-fin"')+sparks([[39,20,3],[61,11,2],[87,65,3]],'#f5c8ea'),'class="lca-whale-swim"')+e(50,61,44,15,'none','stroke="#8eece7" stroke-width="1.4" transform="rotate(19 50 61)" class="lca-orbit-b"')+e(50,52,21,39,'none','stroke="#dfbbf0" stroke-width=".6" transform="rotate(43 50 52)" class="lca-orbit-c"')+sparks([[12,67,3],[83,25,3],[67,89,2],[28,85,2]],'#cffbf3');
    }
    return art(id,body,'lca-companion', 'pointer-events="none"');
  }
  function cloud(x,y,s=1,shade='#a7c7dd') {
    return g(p('M-28 7q-11-5-5-15 6-8 15-3-1-14 13-15 15 0 19 14 13-6 20 3 8 11-3 16Z',shade)+p('M-28 7q23 10 59 0l-7 8-35 3Z','#6384a6','opacity=".6"'),`transform="translate(${x} ${y}) scale(${s})"`);
  }
  function relic(id) {
    if(!has(id,'relic'))return '';
    let body='';
    if(id==='relic-cloudorrery') {
      body=e(50,92,35,6,'#213855','opacity=".2"')+g(cloud(47,76,1)+cloud(66,78,.65,'#d6e8ef')+cloud(25,74,.58,'#bfdaea'),'class="lca-cloud-lift"')+g(l('M49 26v45m-14-2 15-10 15 10','#91b9c9',2)+c(50,44,20,'#253c57')+e(50,44,29,8,'none','stroke="#eaca94" stroke-width="1.8" transform="rotate(-28 50 44)" class="lca-orbit-a"')+e(50,44,9,26,'none','stroke="#add8ed" stroke-width="1.1" transform="rotate(-30 50 44)" class="lca-orbit-b"')+e(50,44,23,21,'none','stroke="#6e9cbd" stroke-width=".8" transform="rotate(32 50 44)"')+star(50,44,10,'#f5ddb0','class="lca-core"')+c(71,28,4,'#e7bba8','class="lca-glimmer"')+c(24,57,3,'#b7ecdf')+sparks([[18,27,3],[82,48,3],[38,13,2]],'#d9eaf1'),'class="lca-bob"');
    } else {
      const terrace=p('m15 76 35-13 36 13-36 15Z','#8194c2')+p('m15 76v7l35 15 36-15v-7L50 91Z','#4c598b')+p('m24 67 26-9 27 9-27 11Z','#becbe8')+p('m24 67v8l26 11 27-11v-8L50 78Z','#6579a7');
      const flower=(x,y,s)=>g(p('M0 0v12','#89cbb9')+p('M0 6q-10-10-9-16 8 0 9 7 2-9 10-10 1 9-10 14Z','#b6f0d8')+p('m0-11 7-7 3 8-10 8-8-8 3-9Z','#f3c4ef')+star(0,-6,3,'#f4fbf0'),`transform="translate(${x} ${y}) scale(${s})"`);
      body=e(50,96,38,3,'#182345','opacity=".25"')+g(l('M18 39C29-1 84 22 83 51S34 74 20 49C7 26 48 8 65 25s-1 39-16 29S43 26 70 26','#8bf3df',7,'opacity=".26"')+l('M18 39C29-1 84 22 83 51S34 74 20 49C7 26 48 8 65 25s-1 39-16 29S43 26 70 26','#bdbdff',1.6)+l('M22 36C33 7 80 27 78 50S34 68 25 47C12 27 47 14 62 28s0 30-12 22S46 32 68 30','#91efeb',1.1),'class="lca-infinity-loop"')+terrace+g(flower(34,57,.8)+flower(63,51,1)+flower(49,65,.58),'class="lca-garden-breathe"')+g(p('M47 61V40l3-10 4 10v21Z','#afeedf')+p('m50 30 4 10-4 21Z','#7bbfdb')+e(50,66,12,3,'none','stroke="#d5fdf4" stroke-width="1.2"')+e(50,66,18,5,'none','stroke="#afc7e7" stroke-width=".7"'),'class="lca-fountain"')+sparks([[10,24,3],[75,13,3],[88,66,2],[29,15,2]],'#ffe3f7');
    }
    return art(id,body,'lca-relic', 'pointer-events="none"');
  }
  const premium = id => has(id,'companion') ? companion(id) : relic(id);
  function avatar(id,stage=0) {
    if(!has(id,'avatar'))return '';
    const s=Number.isFinite(Number(stage))?Math.max(0,Math.min(4,Math.floor(Number(stage)))):0;
    const forest=id==='avatar-forestcrown';
    const tier=(n,body)=>g(body,`class="quest-avatar-tier quest-avatar-tier-${n}" data-avatar-tier="${n}" display="${s>=n?'inline':'none'}"`);
    const backdrop=forest?tier(2,g(p('M26 40Q9 46 5 67l22-9 5 11 8-11 21 8q-7-23-26-26Z','#477967')+l('M29 43 12 62m23-19 19 19','#9cbf88',1),'class="lca-leaf-cloak"')):tier(2,g(p('M25 40Q6 33 3 12q11 12 24 12l5 28-11 8-11 8q7-19 15-28Z','#9bdad9','opacity=".7"')+p('M39 40q21-7 22-27-11 14-25 13l-4 25 12 10 10 7q-7-20-15-28Z','#d5b5ef','opacity=".75"')+l('M6 21q7 20 22 25m30-24q-7 20-21 24','#e4f9ff',1),'class="lca-aurora-wings"'));
    const face=p('M21 26q-1 17 11 19 13-3 12-19Z','#e5c7a2')+c(26.6,32,1.15,'#425557')+c(37.4,32,1.15,'#425557')+l('M29 38q3 2 6-1','#a67971',1)+p('M20 27q1-12 11-11 11-1 14 12l-9-6-4 5-4-5-8 6Z',forest?'#587663':'#70658b');
    const body=p('M23 43 32 39l10 4 8 24-18 4-19-4Z',forest?'#84aa83':'#b5b3e6')+p('m32 42 10 1 8 24-18 4Z',forest?'#406659':'#6969a4')+p('m24 43 8 10 9-10-5 16h-8Z',forest?'#d4d9a7':'#d8f7f0')+l('M32 53v14',forest?'#b4ca9c':'#ceebf3',1)+c(32,54,1.7,forest?'#ebd48f':'#eeccfa');
    const head=forest?p('M19 26q-1-17 13-20 14 4 14 20Z','#577c66')+p('M19 24 32 9l14 15-14-3Z','#9cb784')+l('M18 25q15-6 29 0','#e0d5a3',1.4):p('M18 26 21 13 32 5l12 8 3 13-15-5Z','#8d84c0')+p('m21 13 11-8v16Z','#cecefa')+p('m32 5 12 8-12 8Z','#a5bcdf')+l('M18 26q14-5 29 0','#e1f9f6',1.3);
    const accessories=forest?
      tier(1,p('m19 46 6-5-2 10Z','#ceddaf')+p('m41 41 7 5-6 5Z','#a7c48c')+g(l('M13 53v13','#d5b679',1.8)+p('m8 48 5-4 5 4-1 7H9Z','#f2da9b')+c(13,50,2,'#fff0bb'),'class="lca-glimmer"'))+
      tier(3,g(l('M22 18 18 10V4m2 9-6-3m9 6 2-12m18 14 3-9V3m-2 10 6-4m-11 7-2-12','#d7c995',1.6)+p('M18 5q-7-4-8 1 3 5 8 2m28-3q7-4 8 1-3 5-8 2Z','#b2d9a2'),'class="lca-crown-breathe"'))+
      tier(4,g(e(32,47,29,14,'none','stroke="#bbd99c" stroke-width=".7" transform="rotate(-19 32 47)"')+sparks([[5,45,2.2],[54,27,2.3],[51,59,2.2]],'#f3e7a2')+p('m30 7 2-6 3 6-3 5Z','#f2de98'),'class="lca-forest-spirits"')):
      tier(1,g(p('M12 49 18 42l1 9-7 6Z','#b9f9eb')+p('m46 42 6 7-3 8-5-6Z','#e1bdf2')+l('M12 51 5 60m47-11 6 10','#ece7ff',1),'class="lca-weaver-shuttles"'))+
      tier(3,g(e(32,16,27,6,'none','stroke="#9df5e7" stroke-width=".8" transform="rotate(-10 32 16)"')+p('m32 7-3-4 3-3 3 3Z','#f6d6fa')+sparks([[8,19,2],[56,13,2],[32,2,1.8]],'#f5e1ff'),'class="lca-weaver-orbit"'))+
      tier(4,g(p('M21 14 18 6l9 5 5-9 6 9 9-5-3 11Z','#e2c5f7','opacity=".88"')+l('M19 8 27 14 32 5 37 14 46 8','#e5fff8',1)+e(32,37,30,29,'none','stroke="#a1bdec" stroke-width=".5" stroke-dasharray="2 7"')+sparks([[3,30,2],[59,40,2],[6,61,2],[54,63,2]],'#bafde8'),'class="lca-weaver-crown"'));
    return `<svg class="quest-avatar-art lca-svg lca-avatar" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72" width="64" height="72" aria-hidden="true" focusable="false" fill="none" stroke="none" data-role="player" data-outfit="${id}" data-skin-slots="avatar">${art(id,g(e(32,69,22,2.5,'#172b3b','opacity=".2"')+backdrop+body+face+head+accessories,`class="quest-player-growth" data-avatar-stage="${s}"`),'lca-character')}</svg>`;
  }
  function travelerHat(id,part=0) {
    if(!has(id,'avatar'))return '';
    const forest=['M147 189l9-27 15-15 15 15 9 27-23-6Z','M171 147l15 15 9 27-23-6Z','M152 170l-4-17 11 7 12-16 13 16 11-7-4 19-19-7Z'];
    const aurora=['M149 189l5-28 17-16 18 16 7 28-25-8Z','M171 145l18 16 7 28-25-8Z','M150 169l-2-15 15 8 8-20 9 20 14-8-1 17-22-8Z'];
    return (id==='avatar-forestcrown'?forest:aurora)[Number.isInteger(part)&&part>=0&&part<=2?part:0];
  }
  function barDesign(id) {
    if(!has(id,'bar'))return null;
    const entry=item(id),[light,shade,accent]=colors(id);
    return {name:entry.name,copy:id==='bar-tidewhale'?'流动的潮汐与鲸尾，把每一段积累送向远处。':'透镜星门牵引光束，让真正的积累穿越星界。',colors:[shade,light],rail:id==='bar-tidewhale'?'#173348':'#111730',accent};
  }
  function barFigure(id) {
    if(!has(id,'bar'))return '';
    if(id==='bar-tidewhale')return art(id,g(l('M1 38q13-6 26 0m-22 4q11-4 20 0','#9be9dc',1.4,'opacity=".8"')+g(whaleBody(), 'transform="translate(16 -10) scale(.72)"')+g(l('M55 12q-4-10-9-9m9 9q1-9 7-9','#c1ffed',1.5)+c(44,2,1,'#cdf4e5')+c(64,2,1,'#cdf4e5'),'class="lca-whale-spout"'),'class="lca-bar-whale"'),'lca-bar-figure');
    return art(id,e(46,24,27,17,'#404277','opacity=".4"')+g(e(46,24,22,17,'none','stroke="#9fece5" stroke-width="1.6" transform="rotate(-24 46 24)"')+e(46,24,16,22,'none','stroke="#d3b4f0" stroke-width="1.2" transform="rotate(29 46 24)"'),'class="lca-gate-orbits"')+g(p('m17 24 34-11 16 11-16 11Z','#dcecff')+p('m17 24 34-11-8 11Z','#9da3ed')+p('m43 24 8 11 16-11Z','#89e0df')+l('M3 24h30m-17-6 21 3m-20 9 21-3','#a9f8ed',1.5),'class="lca-jump-craft"')+star(69,10,3,'#f5d2ff')+star(72,37,2,'#a7fff0'),'lca-bar-figure');
  }
  function barRibbon(id,prefix) {
    if(!has(id,'bar'))return '';
    const key=uid(prefix),grad=`${key}-fill`,clip=`${key}-clip`;
    const defs=`<defs><linearGradient id="${grad}" x1="0" y1="0" x2="0" y2="1">${id==='bar-tidewhale'?'<stop stop-color="#18344e"/><stop offset=".35" stop-color="#397ea1"/><stop offset=".62" stop-color="#67cbbb"/><stop offset="1" stop-color="#224c74"/>':'<stop stop-color="#182653"/><stop offset=".42" stop-color="#5c6ccd"/><stop offset=".54" stop-color="#adfaf1"/><stop offset=".68" stop-color="#bc85d8"/><stop offset="1" stop-color="#292447"/>'}</linearGradient><clipPath id="${clip}">${r(0,0,600,24,'white','rx="7"')}</clipPath></defs>`;
    let content=r(0,0,600,24,`url(#${grad})`);
    if(id==='bar-tidewhale') {
      const waves=l('M-120 8q30-6 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0','#b7f9de',2,'opacity=".8"')+l('M-120 17q30-5 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0','#123c65',3,'opacity=".4"');
      content+=g(waves,'class="lca-tidal-current"')+[45,125,228,334,447,552].map((x,i)=>g(p('M-10 0q10-7 19 0L12 2 8 7 5 2Z',i%2?'#d0f9dc':'#9adddb')+c(-6,-1,1,'#3a7992'),`transform="translate(${x} ${12+i%2*3})" opacity=".55"`)).join('')+g(l('M-80 12H680','#e8ffed',.9,'stroke-dasharray="2 21 7 48" opacity=".75"'),'class="lca-current-spark"')+l('M0 2.5H600','#b9e5ea',.8,'opacity=".55"');
    } else {
      content+=g(l('M-600 12h1800','#f1feff',2,'opacity=".78"')+l('M-600 5h1800m-1800 14h1800','#bb91ff',1.3,'stroke-dasharray="18 55 5 32"')+l('M-600 8h1800m-1800 8h1800','#6effe1',.8,'stroke-dasharray="7 70 23 32"'),'class="lca-jump-stream"')+[50,152,254,356,458,560].map((x,i)=>g(e(x,12,12,19,'none',`stroke="${i%2?'#e9bff7':'#b4fff1'}" stroke-width="1.3" opacity=".7"`)+e(x,12,5,14,'none','stroke="#e8f8ff" stroke-width=".7" opacity=".7"'),'class="lca-gate-pulse" style="--lca-delay:-'+i*.7+'s"')).join('')+sparks([[95,6,2],[201,19,2],[402,5,2],[510,18,1.5]],'#eaf9ff');
    }
    return defs+art(id,g(content,`clip-path="url(#${clip})"`),'lca-bar-ribbon');
  }
  function lantern(x,y,scale=1) {
    return g(l('M0-11v6','#738985',1)+e(0,2,12,16,'#ecc775','opacity=".09" class="lca-lantern-glow"')+p('m-4-5 8 0 2 10-6 3-6-3Z','#f2cf89')+p('m0-5 4 0 2 10-6 3Z','#dca663')+l('M-4-3h8M-5 4H5','#ffe9b3',.65)+l('M0 8v4','#edd48f',.8),`transform="translate(${x} ${y}) scale(${scale})"`);
  }
  function wharfPavilion(x,y,scale=1,levels=2) {
    let body=e(0,5,56,17,'#152f44','opacity=".23"')+p('m-48 0 42-19 54 20-42 22Z','#6f9297')+p('m-48 0v6l54 23 42-22v-6L6 23Z','#345766')+l('M-43 8 6 29 43 12','#bddbc7',1.2);
    for(let n=0;n<levels;n++) {
      const y=-n*28;
      body+=g(p('m-29-9 29-13 29 13v18L0 21-29 9Z','#557880')+p('m0-22 29 13v18L0 21Z','#3e5e6d')+l('M-27-8v16m21-25V17m31-25v16M4-18v33','#d7c49a',2.3)+p('m-29-8 29 10 29-10-29-12Z','#9ab6a0')+p('m-39-8 18-12 22-11 21 11 17 12-38 13Z','#678b88')+p('m1-31 21 11 17 12L1 5Z','#3e646e')+l('M-39-8 1 5 39-8m-60-12 22 7 21-7','#e7d79f',1.4)+p('m-35-7-10-5 6 8m75-3 10-5-6 8Z','#93b4a5')+lantern(-22,5,.65)+lantern(22,5,.65)+p('m-17 3 9 3v9l-9-4Zm26 3 9-3v8l-9 4Z','#ebd297','class="lca-window-glow"'),`transform="translate(0 ${y})"`);
    }
    return g(body,`transform="translate(${x} ${y}) scale(${scale})"`);
  }
  function observatory(x,y,scale=1,grand=false) {
    const body=e(0,10,48,13,'#111c40','opacity=".25"')+p('m-42 5 37-18 46 15-37 22Z','#7e91b9')+p('m-42 5v7L4 31 41 12V2L4 24Z','#425680')+l('M-39 14 4 31 37 17','#c7ddf6',1.3)+p('m-25-24 26-13 24 13v25L0 15-25 1Z','#7489b4')+p('m0-37 25 13v25L0 15Z','#495985')+p('m-24-18 8-4v18l-8 4Zm12-6 8-4v18l-8 4Zm19-1 8 4v18l-8-4Zm12 6 5 3v18l-5-3Z','#d3e4ff','class="lca-window-glow" opacity=".86"')+p('M-28-24Q-29-61 0-63q30 3 28 39L0-11Z','#a3b7d9')+p('M0-63q30 3 28 39L0-11Z','#677bb1')+l('M0-63v52m-18-45q-5 11-5 29m40-26q6 12 6 25M-28-24 0-11 28-24','#d5f0ff',1.1)+g(e(0,-36,40,9,'none','stroke="#99e4eb" stroke-width="1.2" transform="rotate(-22 0 -36)"')+c(36,-49,3,'#f1c3f0'),'class="lca-observatory-orbit"')+(grand?g(p('m-5-73 5-13 6 13-6 13Z','#d6ebff')+p('m0-86 6 13-6 13Z','#98d9e7')+l('M-3-61 3-61','#f1ccf2',1),'class="lca-core"'):'');
    return g(body,`transform="translate(${x} ${y}) scale(${scale})"`);
  }
  function islandDecoration(id) {
    if(!has(id,'island'))return '';
    let body='';
    // Keep the foreground road and the camp at (338,241) entirely clear.
    if(id==='island-lanternwharf') {
      body=p('M111 211 167 238 256 269l17 8-7 9-104-33-64-27Z','#315d72')+p('M111 211 167 238 256 269l17 8-3 4-108-34-63-28Z','#69a3aa')+l('M109 215 169 242 259 274','#b8d9c5',.9,'class="lca-wharf-current" stroke-dasharray="9 19"')+wharfPavilion(183,174,.85,2)+wharfPavilion(417,164,1.05,3)+g(p('M186 164Q244 105 316 122L316 130Q244 116 190 176Z','#648f8b')+l('M186 164Q244 105 316 122','#d4c998',1.8)+[0,1,2,3,4,5,6].map(i=>lantern(198+i*17,147-Math.sin(i/6*Math.PI)*18,.6)).join(''),'class="lca-canopy-lights"')+g(p('m113 217 12-6 21 8-12 8Z','#729c92')+p('m113 217v5l21 10 12-8v-5l-12 8Z','#49666e')+lantern(128,206,.85)+p('m204 262 20-7 22 8-22 8Z','#608c91')+lantern(224,250,.8),'class="lca-water-lights"')+sparks([[160,108,3],[394,49,2.5],[449,87,3]],'#f3dd9b');
    } else {
      body=g(e(393,124,63,72,'none','stroke="#b4ccf0" stroke-width="2.1" transform="rotate(25 393 124)"')+e(393,124,55,70,'none','stroke="#93a6d8" stroke-width=".7" transform="rotate(25 393 124)"')+p('M366 55q-43 69 30 130-63-18-64-73 1-34 34-57Z','#a6c6dd','opacity=".38"')+sparks([[357,51,4],[440,117,3],[380,193,2]],'#f1d6ff'),'class="lca-moon-suspension"')+g(p('M169 179Q203 195 233 162m132-14q30 28 65 9','none','stroke="#8abacc" stroke-width="7"')+l('M169 179Q203 195 233 162m132-14q30 28 65 9','#e7f3ff',1.2,'stroke-dasharray="3 12" class="lca-wharf-current"'),'class="lca-light-bridges"')+observatory(150,185,.67)+g(observatory(408,170,1.08,true),'class="lca-palace-lift"')+observatory(239,292,.58)+g(p('m454 185 28-11 10 9-27 11Z','#728aa8')+l('M466 181v-22m-9 34 9-12 8 9','#aacada',2.2)+p('m448 153 32-15 8 11-32 15Z','#bcdbe9')+p('m480 138 8 11 4-2-8-11Z','#7f96c2')+l('M448 153l8 12','#e5f8ff',1), 'transform="rotate(-8 464 174)" class="lca-telescope"')+l('M98 213 160 241 262 278 273 275','#99e3df',1.5,'stroke-dasharray="2 9" class="lca-wharf-current"')+sparks([[113,103,4],[221,242,3],[487,145,3],[253,311,2]],'#b4ffec');
    }
    return art(id,body,'island-decoration lca-island',`data-island-decoration="${id}" data-camp-clearance="338 241 42" pointer-events="none"`);
  }
  function themePalette(id) {
    if(!has(id,'theme'))return null;
    return id==='theme-fireflygrove'?['#102b2c','#3a6b57','#233f46','#a6bc80']:['#101d3c','#466387','#25385d','#b1b2e9'];
  }
  const palette = themePalette;
  function forestBranch(x,y,scale=1,flip=false) {
    return g(l('M0 90Q22 30 5-15m10 75Q-8 25-42 18m54 19Q41 8 67 4','#405e53',6)+p('M-22 36q-23-30-39-23 5 26 39 23m-15-7q-15-21-33-16 6 19 33 16m-10-15q-8-20-24-20 3 19 24 20M17 32q10-27 29-27 1 21-29 27m15-16q12-25 31-21-5 21-31 21m15-14q8-21 23-18 1 17-23 18M11 7Q-8-16-22-11 0 12 11 7Z','#507563')+p('M-22 36q-12-18-23-18m62 14q14-16 23-20M11 7Q0-6-13-9','none','stroke="#8aa87d" stroke-width="1.2"'),`transform="translate(${x} ${y}) scale(${flip?-scale:scale} ${scale})"`);
  }
  function themeScene(id) {
    if(!has(id,'theme'))return '';
    const key=uid(),grad=`${key}-sky`;
    let body=`<defs><radialGradient id="${grad}" cx="50%" cy="35%" r="80%"><stop stop-color="${id==='theme-fireflygrove'?'#36574c':'#354077'}"/><stop offset="1" stop-color="${themePalette(id)[0]}"/></radialGradient></defs>${r(0,0,590,350,`url(#${grad})`)}`;
    if(id==='theme-fireflygrove') {
      body+=e(294,162,192,113,'#768f5e','opacity=".07"')+p('M0 282 62 223 133 257 191 211 275 246 350 206 436 253 512 213 590 261v89H0Z','#27473f')+g(forestBranch(32,229,1.65)+forestBranch(558,229,1.65,true),'class="lca-forest-canopy"')+forestBranch(55,17,1.08)+forestBranch(537,27,1,true)+c(438,58,20,'#dbe3ba','opacity=".7"')+c(445,51,20,'#1b3834')+g([[73,91],[143,57],[487,105],[524,186],[40,205],[102,269],[488,283],[252,57],[367,41],[206,306],[409,310]].map(([x,y],i)=>c(x,y,6,'#cedf7c','opacity=".07"')+c(x,y,i%2?1.5:2,'#deeba0',`class="lca-firefly" style="--lca-delay:-${i*.8}s"`)).join(''),'class="lca-forest-fireflies"')+l('M0 328q147-30 293-9t297-4','#83a783',1.2,'opacity=".28"');
    } else {
      body+=g(p('M-20 306C66 277 46 110 189 73S477 80 610 23L584 77C452 123 277 53 177 119S95 329 11 342Z','#827dd2','opacity=".12"')+p('M-20 306C66 277 46 110 189 73S477 80 610 23','none','stroke="#91c6f3" stroke-width="2" opacity=".48"')+p('M-11 317C70 288 63 120 191 87S479 92 610 38','none','stroke="#c9a1e3" stroke-width="1" opacity=".35"'),'class="lca-rift-drift"')+g(p('M-13 18C83 99 240-1 338 80S462 253 604 302L599 336C460 294 443 180 331 109S80 127-13 48Z','#64b4bd','opacity=".08"')+p('M-13 18C83 99 240-1 338 80S462 253 604 302','none','stroke="#91f0e2" stroke-width="1.8" opacity=".4"'),'class="lca-rift-counter"')+g([[66,67,14],[505,62,17],[546,232,10],[62,258,10],[373,307,7]].map(([x,y,size],i)=>p(`M${x} ${y-size}l${size*.5} ${size} -${size*.5} ${size} -${size*.5}-${size}Z`,i%2?'#aaa6e1':'#8adfd6','opacity=".4"')+l(`M${x} ${y-size}v${size*2}`,'#d3f4ff',.7,'opacity=".55"')).join(''),'class="lca-rift-crystals"')+sparks([[93,162,3],[453,163,3],[537,101,2],[293,39,2],[170,309,2]],'#d4eaff')+g(l('M23 36 51 14 85 25 107 8m383 279 29 36 42-14 22 21','#adb5df',.6,'opacity=".4"')+c(23,36,2,'#d0d8f3')+c(85,25,1.5,'#d0d8f3')+c(519,323,2,'#d0d8f3'),'class="lca-star-chart"');
    }
    return art(id,body,'lca-theme-scene', 'pointer-events="none"');
  }
  function themeBackdrop(id) {
    return has(id,'theme')?svg(id,themeScene(id),590,350,'shop-scene-backdrop-art lca-theme-backdrop'):'';
  }
  function themeCityScene(id) {
    if(!has(id,'theme'))return '';
    // Edge-only scenery: central buildings and all interactive target labels stay unobstructed.
    let body='';
    if(id==='theme-fireflygrove')body=g(forestBranch(18,376,1.55)+forestBranch(1183,376,1.55,true),'opacity=".36"')+[[67,140],[89,246],[38,527],[1126,203],[1164,340],[1115,572],[219,45],[986,36]].map(([x,y],i)=>c(x,y,3,'#d2dca1',`opacity=".5" class="lca-firefly" style="--lca-delay:-${i}s"`)).join('')+l('M0 704q71-26 136-7m931 0q66-21 133 1','#83ad98',1,'opacity=".2"');
    else body=g(l('M-30 264C24 42 192 24 308-17M903-11c207 68 257 48 327 255','#a6b5e5',1.2,'opacity=".25"')+l('M-30 285C32 60 196 48 311-7M916-7c201 61 252 51 314 272','#a1ebdf',.7,'opacity=".23"'),'class="lca-city-rift"')+sparks([[44,278,3],[158,51,2],[1156,261,3],[1039,72,2]],'#becbf1')+p('m24 496 7-20 8 20-8 23Z','#99cadf','opacity=".24"')+p('m1172 480 8-25 10 25-10 27Z','#b6a0d5','opacity=".22"');
    return art(id,body,'lca-city-theme', 'data-scene-size="1200 720" pointer-events="none"');
  }
  function showcaseIsland(id) {
    const theme=has(id,'theme')?id:'',pals=theme?themePalette(id):['#182d41','#385963','#27384f','#9bc7ce'];
    const floor=p('M100 207 216 120 346 105 481 184 405 251 267 276 167 239Z',pals[1],`stroke="${pals[3]}" stroke-width="1.1"`)+p('m100 207 67 32 100 37 138-25 76-67-48 69-151 68-85-21Z',pals[2])+p('m167 239 100 37 15 45-67-20Z','#1c2c41','opacity=".6"')+l('M164 218C203 202 214 236 258 220s11-39 47-40 66 26 93-4','#c5c1ac',6,'opacity=".6"')+e(293,321,161,13,'#0a1927','opacity=".2"');
    const neutralCrystal=g(p('m-21 5 23-13 22 13v11L2 29-21 16Z','#597186')+p('m2-53-14 32 14 33 14-32Z','#95cbcc')+p('m2-53 14 33-14 32Z','#6092b3'), 'transform="translate(319 160)"');
    const previewCamp=lantern(338,236,.9)+e(338,246,13,4,'#eaca94','opacity=".3"');
    return floor+neutralCrystal+(has(id,'island')?islandDecoration(id):'')+previewCamp;
  }
  function preview(id) {
    if(!has(id))return '';
    const entry=item(id),key=uid();
    if(entry.slot==='bar')return svg(id,r(8,45,144,14,barDesign(id).rail,'rx="7"')+g(barRibbon(id,`${key}-preview`),'transform="translate(8 45) scale(.24 .58)"')+g(barFigure(id),'transform="translate(75 25) scale(.88)"'),160,112,'lca-bar-preview');
    if(entry.slot==='avatar')return svg(id,g(avatar(id,4),'transform="translate(44 12) scale(1.1)"'),160,112,'lca-avatar-preview');
    if(entry.slot==='companion'||entry.slot==='relic')return svg(id,g(premium(id),'transform="translate(26 0) scale(1.08)"'),160,112);
    if(entry.slot==='island')return svg(id,g(showcaseIsland(id),'transform="translate(6 10) scale(.25)"'),160,112,'lca-island-preview');
    return svg(id,g(themeScene(id)+showcaseIsland(id),'transform="translate(6 10) scale(.25)"'),160,112,'lca-theme-preview');
  }
  return Object.freeze({entries,has,item,colors,palette,themePalette,preview,premium,companion,relic,islandDecoration,avatar,travelerHat,barDesign,barFigure,barRibbon,themeBackdrop,themeScene,themeCityScene});
});
