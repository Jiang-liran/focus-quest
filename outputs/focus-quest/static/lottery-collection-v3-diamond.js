(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusLotteryDiamondV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Local geometry only. The host decides progress, placement and equipped slots.
  const definitions = [
    ['bar-stardragon', 'bar', '星龙溯光', ['#e4fbff', '#7475d5', '#88f3db']],
    ['avatar-eclipseempress', 'avatar', '月蚀巡天者', ['#e8d9ff', '#544b88', '#a6f5eb']],
    ['island-aethercitadel', 'island', '极昼浮空城', ['#d7f3f1', '#688bb4', '#edc6f2']],
    ['theme-stellarwhales', 'theme', '鲸落星海', ['#b9ebf5', '#344b78', '#dec6f3']],
    ['companion-ninefox', 'companion', '九曜天狐', ['#eef1f8', '#a9abd7', '#a2ebde']],
    ['relic-worldtree', 'relic', '万象世界树', ['#bbf2db', '#5f81b2', '#f4c7f3']]
  ];
  const descriptions = {
    'bar-stardragon':'星龙沿虹色光河溯游，龙首、飘须与碎星鳞光守在真实进度前沿。抽奖限定。',
    'avatar-eclipseempress':'月蚀冠轮与层叠夜空斗篷组成巡天旅装，随当天进度展开星杖、光翼与星纹。抽奖限定。',
    'island-aethercitadel':'错层浮空庭院、光桥、悬瀑与亮窗塔楼组成主岛后侧天际，保留路边篝火。抽奖限定。',
    'theme-stellarwhales':'透明星鲸与幼鲸缓缓游过深蓝星潮，鳍尾与碎星尾迹延伸到主岛和雨夜城市的天空。抽奖限定。',
    'companion-ninefox':'九条分叉长尾轻轻流动，银白灵狐带着星纹守在主岛与雨城旅人身旁。抽奖限定。',
    'relic-worldtree':'悬浮晶根托起分层世界树，立体枝冠、星果与泉光装点主岛晶台和雨城橱窗。抽奖限定。'
  };
  const entries = Object.freeze(definitions.map(([id, slot, name, tints]) => Object.freeze({id, slot, name, description:descriptions[id], lotteryMachine:'diamond', lotteryOnly:true, exclusive:false, coins:0, diamonds:99, tints:Object.freeze(tints)})));
  const index = new Map(entries.map(entry => [entry.id, entry]));
  let serial = 0;
  const has = (id, slot) => typeof id === 'string' && index.has(id) && (!slot || index.get(id).slot === slot);
  const item = id => has(id) ? index.get(id) : null;
  const colors = id => has(id) ? [...item(id).tints] : [];
  const uid = prefix => `lcv3d-${String(prefix || 'art').replace(/[^a-zA-Z0-9_-]/g, '') || 'art'}-${++serial}`;
  const p = (d, fill, attrs='') => `<path d="${d}" fill="${fill}" ${attrs}/>`;
  const l = (d, color, width=1, attrs='') => p(d, 'none', `stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}`);
  const c = (x,y,r,fill,attrs='') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${attrs}/>`;
  const e = (x,y,rx,ry,fill,attrs='') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${attrs}/>`;
  const r = (x,y,w,h,fill,attrs='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${attrs}/>`;
  const g = (body,attrs='') => `<g ${attrs}>${body}</g>`;
  const star = (x,y,s,color,attrs='') => p(`M${x} ${y-s}l${s*.26} ${s*.74} ${s*.74} ${s*.26}-${s*.74} ${s*.26}-${s*.26} ${s*.74}-${s*.26}-${s*.74}-${s*.74}-${s*.26} ${s*.74}-${s*.26}Z`,color,attrs);
  const art = (id,body,cls='',attrs='') => g(body,`class="lcv3d-art ${cls}" data-lottery-collection="${id}" data-skin-slots="${item(id).slot}" ${attrs}`);
  const svg = (id,body,w=160,h=112,cls='') => `<svg xmlns="http://www.w3.org/2000/svg" class="shop-art-svg lcv3d-svg ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false" fill="none" stroke="none" data-art="${id}">${body}</svg>`;
  const sparks = (points,color='#effaff') => points.map(([x,y,s],i)=>star(x,y,s,color,`class="lcv3d-glimmer" style="--lcv3d-delay:-${i*1.3}s"`)).join('');

  function barDesign(id) {
    return has(id,'bar') ? {name:item(id).name,copy:'星龙沿真正抵达的地方溯游，虹色光河与碎星鳞光留在身后。',colors:['#7777d4','#92f2e3'],rail:'#151d3a',accent:'#f2cef8'} : null;
  }
  function barFigure(id) {
    if(!has(id,'bar')) return '';
    const tail = g(l('M3 34C8 12 25 40 33 22S48 28 52 21','#7979c5',10)+l('M3 34C8 12 25 40 33 22S48 28 52 21','#bdeff0',5)+l('M7 28q4 1 7 4m9-2 5-6m6-6 5 3','#effaff',1.5),'class="lcv3d-dragon-body"');
    const mane = p('m39 18-9-9 14 3 2-9 7 9 7-11 4 12 8-5-1 13Z','#b49be4')+p('m41 17-9 4 11 3-8 8 15-3Z','#8de8dd');
    const head = p('M47 16 53 10 66 13 70 20 77 23 75 32 62 35 51 30 43 24Z','#c4eff1')+p('m48 20 7 2 8-9 7 7 7 3-7 2-6 9-13-4Z','#9abadd')+p('m61 28 15-3-1 7-13 3-10-5Z','#e4f5f3')+p('m57 18 9-1-2 4-6 1Z','#344c74')+c(63,18.9,.85,'#d4fff0')+c(73,26,.8,'#6177a2');
    const horns = l('M50 14 45 6 40 4m6 3 2-6m15 13 3-7 6-3m-6 3 1-5','#edd7f8',2);
    const whiskers = g(l('M70 31Q78 42 68 44m4-17q7 2 7-6M59 35q-1 8-9 8','#f1dbfa',1.1),'class="lcv3d-dragon-whiskers"');
    return art(id,tail+mane+head+horns+whiskers+sparks([[22,9,2.1],[7,18,1.6]],'#c4faed'),'lcv3d-bar-figure');
  }
  function barRibbon(id,prefix) {
    if(!has(id,'bar')) return '';
    const key=uid(prefix),rainbow=`${key}-river`,shade=`${key}-shade`,clip=`${key}-clip`;
    const defs=`<defs><linearGradient id="${rainbow}" gradientUnits="userSpaceOnUse" x1="0" x2="600" y1="0" y2="0" spreadMethod="repeat"><stop stop-color="#968cf0"/><stop offset=".18" stop-color="#eb9fdb"/><stop offset=".36" stop-color="#ffdda3"/><stop offset=".53" stop-color="#9deec5"/><stop offset=".7" stop-color="#7bddf4"/><stop offset=".86" stop-color="#909ef4"/><stop offset="1" stop-color="#968cf0"/></linearGradient><linearGradient id="${shade}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#132043" stop-opacity=".12"/><stop offset=".5" stop-color="#12203b" stop-opacity=".02"/><stop offset="1" stop-color="#111831" stop-opacity=".72"/></linearGradient><clipPath id="${clip}">${r(0,0,600,24,'white','rx="7"')}</clipPath></defs>`;
    const river=g(r(-600,0,1800,24,`url(#${rainbow})`),'class="lcv3d-rgb-river"')+r(0,0,600,24,`url(#${shade})`)+g(l('M-120 11q30-9 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0','#f0fcff',2,'opacity=".7"')+l('M-120 17q30 6 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0','#dcceff',1,'opacity=".8"'),'class="lcv3d-river-ribbons"');
    const scales=[40,120,200,280,360,440,520].map((x,i)=>g(p(`M${x} 7l9 6-9 6-9-6Z`,i%2?'#edfff8':'#ece4ff','opacity=".45"')+l(`M${x-5} 13l5 3 5-3`,'#fff',.7,'opacity=".7"'),`class="lcv3d-scale" style="--lcv3d-delay:-${i*.7}s"`)).join('');
    return defs+art(id,g(river+scales+l('M0 2H600','#d3fbfc',.8,'opacity=".75"')+sparks([[80,6,2],[270,18,1.5],[470,5,1.6]]),`clip-path="url(#${clip})"`),'lcv3d-bar-ribbon');
  }

  function avatar(id,stage=0) {
    if(!has(id,'avatar')) return '';
    const s=Number.isFinite(Number(stage))?Math.max(0,Math.min(4,Math.floor(Number(stage)))):0;
    const tier=(n,body)=>g(body,`class="quest-avatar-tier quest-avatar-tier-${n}" data-avatar-tier="${n}" display="${s>=n?'inline':'none'}"`);
    const wings=tier(2,g(p('M25 36C14 34 11 24 4 16l2 25 12 13-5-13 12 8Z','#a4e9e1','opacity=".7"')+p('M39 36c11-2 14-12 21-20l-2 25-12 13 5-13-12 8Z','#cebeef','opacity=".76"')+l('M6 23 17 42l7 3m34-22L47 42l-7 3','#f4fcff',.8),'class="lcv3d-light-wings"'));
    const cloak=p('M23 40 31 36l11 4 10 28-20 3-21-3Z','#7776b0')+p('m31 36 11 4 10 28-20 3Z','#464b79')+p('M22 45 31 53l-7 16-12-2Z','#aca3d4')+p('m41 45-9 8 7 16 12-2Z','#686395')+l('M19 57 24 60m16 1 6-4M29 54l-4 14m10-14 4 14','#bcd7e8',.8)+star(32,51,2.5,'#f5d0e9');
    const face=p('M22 25v9q1 8 10 10 9-2 10-10v-9Z','#e8c9ac')+p('M20 29q-2-14 12-15 14 2 12 16l-8-8-4 5-4-5-8 7Z','#666186')+c(27,32,1.15,'#465061')+c(37,32,1.15,'#465061')+e(24,36,2,1,'#dca6a0','opacity=".5"')+e(40,36,2,1,'#dca6a0','opacity=".5"')+l('M29 38q3 2.5 6 0','#ac7d78',1);
    const crown=p('m19 25 2-12 6 5 5-11 6 11 6-5 2 12-14-4Z','#c9c5ea')+p('m32 7 6 11 6-5 2 12-14-4Z','#8c9ccc')+star(32,19,3,'#c1fff0');
    const staff=tier(1,l('M51 37 53 67','#c7dfe8',1.5)+g(p('m47 36 5-12 6 12-5 8Z','#a8eff0')+p('m52 24 6 12-5 8Z','#878ac9')+star(52,34,2,'#fff5ff'),'class="lcv3d-glimmer"')+c(48,49,2.7,'#e8c9ac'));
    const eclipse=tier(3,g(c(32,15,12,'#1d2849','stroke="#b7cef2" stroke-width=".7"')+p('M29 3A12 12 0 1 1 26 25a13 13 0 0 0 3-22Z','#d5bced')+c(32,15,14,'none','stroke="#a5e7e3" stroke-width=".8" stroke-dasharray="1 6"')+sparks([[13,13,1.4],[51,15,1.4]]),'class="lcv3d-eclipse-crown"'));
    const stars=tier(4,g(p('m20 46-6 20 10-9 8 13 8-13 10 9-6-20-12 8Z','#6f66a5','opacity=".5"')+l('M19 53 23 60 32 62 41 59 45 53','#bcf0ef',.7)+[23,32,41].map((x,i)=>star(x,60+i%2*2,1.8,'#f4e6fc')).join('')+sparks([[7,53,2],[57,58,1.8],[13,33,1.5],[51,30,1.5]],'#b5f4e7'),'class="lcv3d-royal-stars"'));
    const body=e(32,70,24,1.5,'#13263c','opacity=".23"')+eclipse+wings+cloak+stars+face+crown+staff;
    return `<svg xmlns="http://www.w3.org/2000/svg" class="quest-avatar-art lcv3d-svg lcv3d-avatar" viewBox="0 0 64 72" width="64" height="72" aria-hidden="true" focusable="false" fill="none" stroke="none" data-role="player" data-outfit="${id}" data-skin-slots="avatar">${art(id,g(body,`class="quest-player-growth" data-avatar-stage="${s}"`))}</svg>`;
  }
  function travelerHat(id,part=0) {
    if(!has(id,'avatar')) return '';
    const shapes=['M146 189l5-26 12 9 9-29 10 29 12-9 5 26-27-7Z','M172 143l10 29 12-9 5 26-27-7Z','M151 176l1-17 12 9 8-26 9 26 13-9 1 17-23-8Z'];
    return shapes[Number.isInteger(part)&&part>=0&&part<=2?part:0];
  }

  function floatingTower(x,y,scale=1,levels=2) {
    let body=p('m-34 0 34-15 35 15-35 16Z','#b5d7d9')+p('m-34 0 34 16 35-16-9 19-26 18-26-18Z','#50688f')+p('m0 16 35-16-9 19-26 18Z','#668bb0')+l('M-32 4 0 18 33 4','#d6faff',1.1);
    for(let n=0;n<levels;n++) {
      const y=-n*22;
      body+=g(p('m-18-23 18-9 18 9v21L0 7-18-2Z','#91abc7')+p('m0-32 18 9v21L0 7Z','#597da7')+p('m-23-23 23-12 23 12L0-13Z','#d4ebeb')+p('m0-35 23 12L0-13Z','#96c1d2')+l('M-17-20v15m17-7V5m17-25v15','#d3eef0',1.1)+p('m-12-16 6 3v8l-6-3Zm18 3 6-3v8l-6 3Z','#f4dcaf','class="lcv3d-window"'),`transform="translate(0 ${y})"`);
    }
    body+=p(`m-8 ${-levels*22-14} 8-20 8 20-8 8Z`,'#b8e7ee')+p(`m0 ${-levels*22-34} 8 20-8 8Z`,'#8b92cb')+star(0,-levels*22-14,3,'#faf2ff');
    return g(body,`transform="translate(${x} ${y}) scale(${scale})"`);
  }
  function waterfall(x,y,length,width=11) {
    return g(p(`M${-width/2} 0h${width}l-2 ${length}q-5 9-8 0Z`,'#89d9e3','opacity=".52"')+g(l(`M-1 0v${length-4}m5 ${-length+6}v${length-15}`,'#d5ffff',1.2,'stroke-dasharray="8 10"')+c(0,length+3,1.5,'#d5ffff')+c(4,length+9,1,'#d5ffff'),'class="lcv3d-waterfall-drops"'),`transform="translate(${x} ${y})"`);
  }
  function islandDecoration(id) {
    if(!has(id,'island')) return '';
    // Left and rear architecture deliberately leaves the camp at (338,241),
    // the central crystal, the foreground walking route and the city entry free.
    const bridges=g(p('M144 174Q182 169 219 142l2 8q-39 31-74 33Z','#a1c4d8')+l('M144 174Q182 169 219 142','#e9f5ec',1.5)+p('M377 123q25 7 47 31l-3 8q-19-22-46-29Z','#8eb4cf')+l('M377 123q25 7 47 31','#e7e6fd',1.5),'class="lcv3d-citadel-bridges"');
    const gardens=g(p('m126 176 24-9 25 10-25 10Z','#a1cbba')+p('m126 176v5l24 11 25-10v-5l-25 10Z','#617d91')+p('m431 186 22-8 23 8-23 10Z','#acd5c1')+p('m431 186v5l22 11 23-11v-5l-23 10Z','#68809c')+l('M136 172v-9m8 6v-12m308 24v-10m7 11v-8','#aee9d0',2),'class="lcv3d-floating-gardens"');
    const body=bridges+waterfall(137,183,32,10)+waterfall(414,173,36,12)+g(floatingTower(151,177,.8,2),'class="lcv3d-citadel-left"')+g(floatingTower(231,143,.64,1),'class="lcv3d-citadel-small"')+g(floatingTower(390,137,1.05,3),'class="lcv3d-citadel-crown"')+g(floatingTower(448,181,.74,2),'class="lcv3d-citadel-right"')+gardens+sparks([[127,105,3],[220,90,2],[407,34,3.5],[467,116,3]],'#f4e6fc');
    return art(id,body,'island-decoration lcv3d-island','data-island-decoration="island-aethercitadel" data-camp-clearance="338 241 42" pointer-events="none"');
  }

  function foxTail(index,angle,color) {
    const center=index===4;
    const curve=center?'M47 69C28 46 37 15 49 6c9 23 21 38 4 64Z':'M47 69C18 65 9 31 22 8c-1 23 18 21 23 35 5 10 5 17 8 26Z';
    const line=center?'M49 11q-7 26 1 52':'M22 15q-5 21 18 38l9 13';
    return g(g(p(curve,color)+l(line,'#f4fcff',1,'opacity=".75"')+p(center?'m49 6-5 13 6 8 5-10Z':'m22 8-5 14 7 9 5-6Z',index%2?'#b9f5e9':'#ddc4ef'),`class="lcv3d-fox-tail" data-fox-tail="${index+1}" style="--lcv3d-delay:-${index*.43}s"`),`transform="rotate(${angle} 50 69)"`);
  }
  function companion(id) {
    if(!has(id,'companion')) return '';
    // Nine separate, articulated silhouettes; the tail count is never faked by rays.
    const tails=[-58,-43,-28,-13,0,13,28,43,58].map((angle,i)=>foxTail(i,angle,['#9b9acb','#bdc1df','#e3e9f4'][i%3])).join('');
    const body=e(50,92,37,4,'#1b2a4b','opacity=".26"')+g(tails+p('M41 62q-10 12-5 26h29q4-18-9-26Z','#ccd8eb')+p('m44 65 8 3 7 17-12 3-10-3Z','#f0f3f6')+p('m36 47-2-22 15 13 15-14 2 26-13 17Z','#dfe7f2')+p('m38 32 2 13 7-5m10-1 6-9-1 15Z','#a7a4d3')+p('M36 48q15-8 30 1l-5 14-10 5-11-7Z','#eef2f7')+p('m37 52 14 8 13-7-5 10-8 5-10-7Z','#fff9f1')+c(44,50,1.5,'#546282')+c(58,50,1.5,'#546282')+p('m49 58 4 0-2 3Z','#647191')+l('M43 75v10m14-10v10','#a1aed0',1.7)+star(51,43,3.2,'#a6dfda')+star(51,72,2.5,'#a9a3db')+sparks([[17,57,2],[82,54,2],[28,21,1.6],[74,22,1.6]],'#f3d6ff'),'class="lcv3d-fox-breathe"');
    return art(id,body,'lcv3d-companion','pointer-events="none"');
  }

  function relic(id) {
    if(!has(id,'relic')) return '';
    const key=uid('worldtree'),aura=`${key}-aura`;
    const defs=`<defs><radialGradient id="${aura}"><stop stop-color="#c8f7df" stop-opacity=".22"/><stop offset="1" stop-color="#d8d3f6" stop-opacity="0"/></radialGradient></defs>`;
    const roots=g(p('m24 74 25-10 28 10-28 14Z','#94beca')+p('m24 74 25 14 28-14-15 17-13 8-13-8Z','#566f9c')+p('m49 88 28-14-15 17-13 8Z','#8293c3')+l('M49 65 43 85l-7 9m13-29 10 19 7 4m-17-14 1 18','#c4ecec',2)+p('m35 87-3 6 5 3 3-7Zm27-6-3 9 6 5 4-10Z','#d4d6fa'),'class="lcv3d-tree-roots"');
    const trunk=p('M45 77 46 48 38 34l8 8 4-20 4 20 10-12-9 21 1 26-6 6Z','#a2c8c0')+p('m50 22 4 20 10-12-9 21 1 26-6 6Z','#628f9f')+l('M49 71 51 48m-1 14-11-11m13 9 13-12','#d2f5e4',1.1);
    const branch=g(l('M49 53 24 36 16 25m17 17-2-17m22 25 20-19 9-15m-14 22 11 3M51 34 43 17m8 17 10-18','#84bab0',3)+p('M11 31 14 19 31 15 40 27 30 38Z','#b2e6d0')+p('m14 19 17-4 9 12-17 2Z','#d1f4df')+p('m60 24 8-13 15 3 6 15-16 9Z','#b2c2eb')+p('m68 11 15 3 6 15-17-7Z','#dfd9f6')+p('m34 15 15-12 17 11-5 17-23-3Z','#a2d9d1')+p('m49 3 17 11-17 8-15-7Z','#cff5e8')+p('m14 40 14-6 16 9-5 13-21-4Z','#8fbcd0')+p('m58 41 18-7 11 10-8 13-20-4Z','#a4dcd3')+l('M24 25 31 22m15-8 7 2m23 4 6 5','#f3fcf3',.9),'class="lcv3d-tree-canopy"');
    const fruits=[[28,46,3.5],[44,29,2.5],[64,34,3],[75,49,3.5]].map(([x,y,s],i)=>g(l(`M${x} ${y-7}v5`,'#d6e9de',.8)+star(x,y,s,i%2?'#f2cff0':'#f3dda9'),`class="lcv3d-tree-fruit" style="--lcv3d-delay:-${i}s"`)).join('');
    const spring=g(l('M43 80q-3 11-6 14m18-14 8 15','#9becdf',1.4)+e(49,83,19,3,'none','stroke="#cffaf0" stroke-width=".8"')+c(38,95,1.2,'#c8f7ef')+c(62,96,1,'#ebd5fa'),'class="lcv3d-tree-spring"');
    return defs+art(id,e(50,46,46,46,`url(#${aura})`)+e(50,99,29,1.5,'#152941','opacity=".2"')+roots+trunk+branch+fruits+spring+sparks([[13,58,2],[87,65,2.2],[26,10,1.4]]),'lcv3d-relic','pointer-events="none"');
  }
  const premium = id => has(id,'companion') ? companion(id) : relic(id);

  function stellarWhale(x,y,scale=1,reverse=false,small=false) {
    const tail=g(p('M35 44C10 43 4 25 8 7c14 4 20 15 21 24 4-12 13-19 24-18-2 14-8 25-18 31Z','#8fbacf','opacity=".5"')+l('M10 11q6 13 19 24m18-18L30 35','#c9eefa',.8),'class="lcv3d-whale-tail"');
    const belly=p('M39 53q41 24 80-2-9 31-49 24-21-5-31-22Z','#c6dce9','opacity=".54"');
    const fin=g(p('M69 53q-3 17 8 35 16-8 22-25L80 65Z','#9bb1dc','opacity=".7"')+l('M72 58 78 78 91 66','#d3eaf8',1),'class="lcv3d-whale-fin"');
    const main=tail+p('M29 45Q42 17 79 23c25 1 48 15 44 32-4 15-34 26-60 17-23-4-31-17-34-27Z','#8bb5d0','opacity=".62"')+belly+p('m41 37 22-11 8 25-30-14Z','#b4e5e6','opacity=".43"')+p('m63 26 30 1-22 24Z','#d1c9ec','opacity=".36"')+p('m71 51 22-24 25 16-47 8Z','#a9bcf0','opacity=".36"')+l('M40 39 70 52 93 28m-23 24 42 0m-62 8q27 15 54-1','#d0f4f6',.7,'opacity=".62"')+fin+c(112,44,1.7,'#dcfaff')+l('M112 54q6 2 10-2','#d7f5f5',1)+[ [47,40],[63,35],[79,43],[92,40],[63,62] ].map(([a,b],i)=>star(a,b,i%2?1.3:2,'#eff7ff')).join('');
    const wake=g(l('M-33 41Q-13 54 25 43m-49 16q23 3 53-10','#c2b9ed',.7,'opacity=".6"')+sparks([[-24,38,2],[-9,58,1.3],[5,46,1.8]],'#d9f7f5'),'class="lcv3d-whale-wake"');
    return g(g(wake+main,`class="lcv3d-whale ${small?'lcv3d-whale-small':''}"`),`transform="translate(${x} ${y}) scale(${reverse?-scale:scale} ${scale})" data-stellar-whale="true"`);
  }
  function themePalette(id) {
    return has(id,'theme') ? ['#101f39','#4b688c','#293c5d','#c0d5ed'] : null;
  }
  const palette=themePalette;
  function themeScene(id) {
    if(!has(id,'theme')) return '';
    const key=uid('stellarwhales'),sky=`${key}-sky`;
    const defs=`<defs><radialGradient id="${sky}" cx="53%" cy="29%" r="75%"><stop stop-color="#3a5279"/><stop offset=".58" stop-color="#1d3553"/><stop offset="1" stop-color="#111f36"/></radialGradient></defs>`;
    const body=r(0,0,590,350,`url(#${sky})`)+g(p('M-30 109Q94 9 300 50T630 9l-10 22Q475 90 289 70T-30 130Z','#a7b3ed','opacity=".075"')+l('M-30 115Q97 19 298 61T620 20','#c3d1f3',.8,'opacity=".22"'),'class="lcv3d-sky-current"')+p('M0 309 56 289 103 297 160 281 219 305 290 286 379 304 458 282 523 298 590 277v73H0Z','#213951')+p('M0 329 73 310 161 332 242 309 329 334 433 304 498 323 590 309v41H0Z','#294759')+stellarWhale(51,10,1.25)+stellarWhale(525,94,.66,true,true)+sparks([[294,29,2],[332,70,1.6],[420,41,2.5],[41,200,1.7],[543,227,2],[104,258,1.7],[299,324,2]],'#cde8f4')+l('M13 337q115-19 191 0m189-3q90-10 174-2','#82c9d3',1,'opacity=".22"');
    return defs+art(id,body,'lcv3d-theme-scene','pointer-events="none"');
  }
  function themeBackdrop(id) {return has(id,'theme')?svg(id,themeScene(id),590,350,'shop-scene-backdrop-art lcv3d-theme-backdrop'):'';}
  function themeCityScene(id) {
    if(!has(id,'theme')) return '';
    // Sky-only wildlife is scaled to the city viewBox; buildings remain legible.
    const body=g(stellarWhale(83,0,1.6)+stellarWhale(1075,41,.77,true,true),'opacity=".66"')+g(l('M0 90Q201 24 450 38t390-11 360-2','#acbcec',1,'opacity=".22"')+sparks([[39,43,2],[518,35,2],[742,21,1.5],[1150,129,2.5]],'#c0dce8'),'class="lcv3d-city-sky"');
    return art(id,body,'lcv3d-city-theme','data-scene-size="1200 720" pointer-events="none"');
  }
  const themeCityDecor=themeCityScene;

  function showcaseIsland(id) {
    const pals=has(id,'theme')?themePalette(id):['#182d41','#405c72','#27374f','#b8d2df'];
    return e(293,321,160,12,'#0a1927','opacity=".2"')+p('M100 207 216 120 346 105 481 184 405 251 267 276 167 239Z',pals[1],`stroke="${pals[3]}" stroke-width="1.1"`)+p('m100 207 67 32 100 37 138-25 76-67-48 69-151 68-85-21Z',pals[2])+p('m167 239 100 37 15 45-67-20Z','#1c2c41','opacity=".6"')+l('M164 218C203 202 214 236 258 220s11-39 47-40 66 26 93-4','#c6cbc9',6,'opacity=".55"')+g(p('m-21 5 23-13 22 13v11L2 29-21 16Z','#597186')+p('m2-53-14 32 14 33 14-32Z','#adcce0')+p('m2-53 14 33-14 32Z','#8189b7'),'transform="translate(319 160)"')+(has(id,'island')?islandDecoration(id):'')+e(338,244,12,4,'#ccb184','opacity=".6"')+p('m334 240 3-14 5 9 3 4-5 5Z','#f2cc93');
  }
  function preview(id) {
    if(!has(id)) return '';
    const entry=item(id);
    if(entry.slot==='bar')return svg(id,r(9,47,142,13,barDesign(id).rail,'rx="6"')+g(barRibbon(id,'preview'),'transform="translate(9 47) scale(.2367 .5417)"')+g(barFigure(id),'transform="translate(73 25) scale(.9)"'),160,112,'lcv3d-bar-preview');
    if(entry.slot==='avatar')return svg(id,g(avatar(id,4),'transform="translate(43 11) scale(1.13)"'),160,112,'lcv3d-avatar-preview');
    if(entry.slot==='companion'||entry.slot==='relic')return svg(id,g(premium(id),'transform="translate(26 2) scale(1.06)"'));
    if(entry.slot==='island')return svg(id,g(showcaseIsland(id),'transform="translate(6 10) scale(.25)"'),160,112,'lcv3d-island-preview');
    return svg(id,g(themeScene(id)+showcaseIsland(id),'transform="translate(6 10) scale(.25)"'),160,112,'lcv3d-theme-preview');
  }
  return Object.freeze({entries,has,item,colors,palette,themePalette,preview,premium,companion,relic,islandDecoration,avatar,travelerHat,barDesign,barFigure,barRibbon,themeBackdrop,themeScene,themeCityScene,themeCityDecor});
});
