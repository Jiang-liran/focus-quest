(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FocusShopCollectionV3World=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const definitions=[
    ['island-harborbench','island','渡口长椅','船形木椅、缆绳桩与小遮棚，在主岛后侧留一处歇脚渡口',80,0,['#b9caba','#527887','#e7cd9f']],
    ['island-kiteatelier','island','风筝小作坊','斜顶作坊、菱形纸鸢与卷线架，细尾带随风轻轻摆动',170,0,['#d4bfa2','#64778a','#a4d5ca']],
    ['island-birdloft','island','飞羽信舍','高脚鸟舍、错层信巢与落鸟横杆，在后侧添一座小小信站',290,0,['#c7d2bd','#658077','#dcc599']],
    ['island-sundialyard','island','日影石庭','放射刻度日晷、立针与错层青石台，留下清爽的观日庭院',400,0,['#c5d7d2','#638397','#ecd8a7']],
    ['island-candleworkshop','island','微光烛坊','圆窗蜡坊、三盏高低烛灯与蜂蜡架，在主岛后侧亮起暖光',700,0,['#d7c098','#786b85','#e7d7aa']],
    ['island-rainstage','island','雨幕小剧场','扇形舞台、双层幕布与侧灯，在后侧留一座安静的小剧场',0,5,['#c7b8d8','#646489','#a8dfd3']],
    ['island-orreryrail','island','星轨车厅','弧轨、双窗小车与星图站棚，轨道灯依次轻轻呼吸',0,15,['#abcde0','#547a9a','#e5c7dc']],
    ['island-tidalarchives','island','潮页档案馆','阶梯书屋、拱形水窗与层叠书脊，潮光在廊下缓缓流动',0,28,['#b6dfdd','#547e91','#e9d1ad']],
    ['theme-bluefjord','theme','蓝调峡湾','远处陡崖与一线静水延伸至天际，主岛地景换上蓝灰岩色',160,0,['#142a3b','#668896','#b8d1d3']],
    ['theme-marshmoon','theme','月沼浅芦','芦苇剪影与低月倒影映着静水，城市水岸也留有浅浅苇影',340,0,['#20343b','#69847c','#d8d6b1']],
    ['theme-ambercanyon','theme','琥珀峡谷','阶状砂岩、峡谷岩窗与日落薄云，城市天际映出暖色岩层',1050,0,['#312b3c','#ac8478','#e5c39c']],
    ['theme-lakeconstellations','theme','星图镜湖','山影与镜湖倒映一张缓慢明灭的星图，细星路延伸到夜城',0,8,['#1b2949','#647d9e','#ccd1ef']],
    ['theme-mushroomglen','theme','眠菇微谷','层叠菌伞、蕨叶与微光孢子组成谷地，远近大小各不相同',0,14,['#1d3036','#648a80','#c7badb']],
    ['theme-crystalcaves','theme','水晶洞天','分面岩拱、透光晶簇与地下静水形成洞天，晶色延伸到城市岩岸',0,32,['#182b40','#64869c','#c1dce9']],
    ['fx-swallows','fx','归燕掠影','小燕子舒展双翼，分批横越主岛与雨夜城市的天空',40,0,['#c5d8df','#6689a2','#e0d7ec']],
    ['fx-cottonpuffs','fx','棉絮轻行','松软小棉絮随气流浮起、侧移，离开画面后渐渐消散',120,0,['#e3e4d9','#9fb9c2','#d0d4e8']],
    ['fx-raingems','fx','雨珠折光','透亮雨珠斜落时闪出细小折光，落地化成短暂水纹',260,0,['#c4e8ec','#7395b5','#e2c8eb']],
    ['fx-juneblossom','fx','桔梗花雨','五角花瓣与小花苞随风翻转飘落，错开远近与速度',600,0,['#c6bcdf','#788caf','#e7d5eb']],
    ['fx-moonjellies','fx','月游水母','半透明水母舒展伞盖与短触须，缓缓游过主岛和雨城夜空',0,2,['#c1e8e8','#8ca8d1','#d7bce5']],
    ['fx-inkfishes','fx','游墨飞鱼','轻薄鱼群摆尾穿行，墨蓝鱼影与浅青鳍光留下水墨般的轨迹',0,12,['#a9d6db','#6989a0','#dac4df']]
  ];
  const entries=Object.freeze(definitions.map(([id,slot,name,description,coins,diamonds,tints])=>Object.freeze({id,slot,name,description,coins,diamonds,tints:Object.freeze(tints),lotteryOnly:false,lotteryMachine:null,exclusive:false})));
  const index=new Map(entries.map(e=>[e.id,e]));let serial=0;
  const has=(id,slot)=>typeof id==='string'&&index.has(id)&&(!slot||index.get(id).slot===slot);
  const item=id=>has(id)?index.get(id):null;
  const colors=id=>has(id)?[...item(id).tints]:[];
  const uid=()=>`scv3w-${++serial}`;
  const p=(d,fill,attrs='')=>`<path d="${d}" fill="${fill}" ${attrs}/>`;
  const l=(d,color,width=1,attrs='')=>p(d,'none',`stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}`);
  const c=(x,y,r,fill,attrs='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${attrs}/>`;
  const e=(x,y,rx,ry,fill,attrs='')=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${attrs}/>`;
  const r=(x,y,w,h,fill,attrs='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${attrs}/>`;
  const g=(body,attrs='')=>`<g ${attrs}>${body}</g>`;
  const star=(x,y,s,color,attrs='')=>p(`M${x} ${y-s}l${s*.3} ${s*.7} ${s*.7} ${s*.3}-${s*.7} ${s*.3}-${s*.3} ${s*.7}-${s*.3}-${s*.7}-${s*.7}-${s*.3} ${s*.7}-${s*.3}Z`,color,attrs);
  const wrap=(id,body,attrs='')=>g(body,`class="scv3w-art${has(id,'island')?' island-decoration':''}" data-shop-expansion="${id}" data-skin-slots="${item(id).slot}" ${attrs}`);
  const svg=(id,body,w=160,h=112,cls='')=>`<svg xmlns="http://www.w3.org/2000/svg" class="shop-art-svg scv3w-svg ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false" fill="none" stroke="none" data-art="${id}">${body}</svg>`;

  function architecture(id) {
    const [a,b,d]=colors(id);let body='';
    const platform=p('m-49 10 44-18 54 18-44 20Z',a)+p('m-49 10v5l54 22 44-22v-5L5 30Z',b)+l('M-45 17 5 36 44 19',d,1);
    if(id==='island-harborbench')body=p('m-29-9 35-10 24 14-36 11Z',a)+l('M-25 0v15m49-13v14M-28-9v-17m45 12v-16',b,3)+p('m-29-25 44-7v11l-44 9Z',d)+l('M-24-23 34-30m-58 13 43-7',b,.8)+l('M-39 8v-13m76 7v-11',b,4)+l('M-39-1q32 10 76-1',d,1.5)+p('m-46-36 48-17 42 16-44 10Z',b)+l('M-37-34v42m70-45v45',a,2.5);
    if(id==='island-kiteatelier')body=p('m-32-30 32-10 27 10v40L0 22-32 10Z',a)+p('m0-40 27 10v40L0 22Z',b)+p('m-41-29 29-33 50 25-10 11-29-12-32 18Z',d)+r(-20,-13,15,23,b)+r(8,-19,12,12,d)+g(p('m27-43 14-23 14 23-14 11Z','#b7d6cb')+l('M41-66v34m-14-11h28',d,.8)+l('M41-32q-5 11 1 19t-3 14',d,1.2),'class="scv3w-kite"')+c(-38,9,5,b)+l('M-38 4v10m-5-5h10',d,1);
    if(id==='island-birdloft')body=l('M-14-9v32m32-32v27',b,5)+p('m-30-43 34-12 23 13v33L-7 5-30-7Z',a)+p('m4-55 23 13v33L4 0Z',b)+p('m-36-41 17-27 22 10 12-11 21 25-32 14Z',d)+c(-17,-27,5,b)+c(1,-32,5,b)+c(15,-26,4,'#203642')+l('M-29-8 20 4m-46-12v6m31-34h23',d,2)+g(p('m-19-4 5-5 7 3-5 5Z','#e0e4da')+p('m-23-4 6-3-1 5Z',b)+c(-8,-6,.8,b),'class="scv3w-bird"');
    if(id==='island-sundialyard')body=e(0,4,37,12,b)+p('m-33-3 33-14 34 14v8L0 20-33 5Z',a)+e(0,-3,32,13,d)+e(0,-3,27,10,'none',`stroke="${b}" stroke-width=".8"`)+p('m-2-3 3-34 13 39Z',b)+p('m1-37 13 39-8-7Z','#96becb')+[0,1,2,3,4,5,6,7].map(i=>l('M0-11v3',b,.8,`transform="rotate(${i*45} 0 -3)"`)).join('')+l('M-3-3 26 4',b,2,'opacity=".25"')+p('m-38 13-6-12 9-4 4 15m55 1 7-18 10 5-7 18Z',a);
    if(id==='island-candleworkshop')body=p('m-29-30 30-12 26 12v38L0 21-29 8Z',a)+p('m1-42 26 12v38L0 21Z',b)+p('m-38-30 29-25 43 21-6 12-27-11-32 13Z',b)+c(-12,-18,9,d)+l('M-12-27v18m-9-9h18',b,1.2)+r(6,-10,13,25,d)+[[-40,-9,17],[-31,-3,12],[32,-3,24]].map(([x,y,h])=>r(x,y,6,h,d)+g(p(`M${x+3} ${y-9}q-6 8 0 10 6-2 0-10Z`,'#f3d7a2'),'class="scv3w-light"')).join('')+p('m13-43 0-17 9-3 0 22Z',a);
    if(id==='island-rainstage')body=e(0,15,45,15,b)+p('M-43 10V-39Q0-74 43-39v49L0 26Z',b)+p('M-36 9V-37Q0-65 36-37V9L0 20Z',a)+p('M-32-36q13 25 8 44l-13 4V-36Zm64 0q-13 25-8 44l13 4V-36Z','#b19bbd')+p('M-35-37q33 14 70 0l-6 12q-28 8-58-1Z',d)+l('M-30-30v27m61-27v27',b,1.5)+p('m-33 10 33-12 33 12-33 14Z',a)+star(0,-35,6,d)+[[-43,-25],[43,-25]].map(([x,y])=>c(x,y,5,d,'class="scv3w-light"')).join('');
    if(id==='island-orreryrail')body=l('M-43 7Q0-15 43 7m-86 6q43-22 86 0',d,2)+[-37,-20,-3,14,31].map(x=>l(`M${x} 6l5 8`,b,3)).join('')+p('M-27-30 0-40 28-30v26L0 8-27-4Z',a)+p('m0-40 28 10v26L0 8Z',b)+p('M-31-29Q0-62 33-29L0-20Z',d)+r(-21,-22,12,14,b,'rx="3"')+p('m7-20 13-4v13L7-7Z',d)+c(-16,3,5,b)+c(15,4,5,b)+l('M-37 0v-44m73 44v-44M-42-43q40-23 84 0',a,2)+g(star(-31,-46,3,d)+star(0,-54,3,d)+star(31,-46,3,d),'class="scv3w-light"');
    if(id==='island-tidalarchives')body=p('m-36-25 27-15 40 18v26L1 23-36 4Z',b)+p('m-36-25 37 15L31-22-9-40Z',a)+p('m-21-45 22-10 28 13v24L1-5-21-15Z',a)+p('m1-55 28 13v24L1-5Z',b)+p('m-26-46 27-14 34 16L1-30Z',d)+p('M-28 2v-14q9-10 18 0v24m23-1V-8q9-10 18-2v11Z','#b6e4e2')+l('M-25-11v15m8-11v15m-13-35 30 12m-30-5 30 12m6-30 19 8m-19-1 19 8',d,1.2)+g(l('M-40 12q35 15 77-1m-66 8q28 8 57-1','#a5f0e6',1.4),'class="scv3w-water"');
    return platform+body;
  }
  function islandDecoration(id) {
    if(!has(id,'island'))return '';
    const [a,b,d]=colors(id);
    const ornaments=g(p('m-13 0 17-6 15 7-17 7Z',a)+p('m-13 0v5l15 9 17-8V1L2 8Z',b)+c(4,-3,3,d), 'transform="translate(146 244) scale(.8)"');
    return wrap(id,g(architecture(id),'transform="translate(411 163) scale(1.12)"')+ornaments,'data-camp-clearance="338 241 42" pointer-events="none"');
  }

  const themePalettes={
    'theme-bluefjord':['#142a3b','#668896','#344d62','#b8d1d3'],
    'theme-marshmoon':['#20343b','#69847c','#3b5756','#d8d6b1'],
    'theme-ambercanyon':['#312b3c','#ac8478','#715768','#e5c39c'],
    'theme-lakeconstellations':['#1b2949','#647d9e','#344363','#ccd1ef'],
    'theme-mushroomglen':['#1d3036','#648a80','#3f5e64','#c7badb'],
    'theme-crystalcaves':['#182b40','#64869c','#344b69','#c1dce9']
  };
  const themePalette=id=>has(id,'theme')?[...themePalettes[id]]:null;
  function reeds(x,y,scale=1) {return g(l('M0 0q-4-22 3-47M-5 0q-10-25-21-31M7 0q13-15 22-21','#668c81',2)+l('M3-47v-13m-29 29-7-9m55 19 7-7','#c9c99a',3),`transform="translate(${x} ${y}) scale(${scale})"`);}
  function mushroom(x,y,scale=1) {return g(p('M-4 0 0-31 6-28 7 0Z','#b5c6be')+p('M-25-27q3-29 28-28 18 5 23 28Z','#9e9bc4')+p('M-25-27q24-8 51 0-21 13-51 0Z','#d2c8da')+c(-8,-42,3,'#e7e4dc')+c(7,-46,2,'#e7e4dc')+c(13,-36,2.7,'#e7e4dc')+l('M0-26v18','#e5eee1',1),`transform="translate(${x} ${y}) scale(${scale})"`);}
  function crystals(x,y,scale=1) {return g(p('M-20 0-29-31-17-43-5-17 2-57 17-46 14-13 27-33 37-15 25 3Z','#8dbacb')+p('m-29-31 12-12 7 43-10 0Z','#b3e4e0')+p('m2-57 15 11-10 48-7-6Z','#d0cef0')+p('m27-33 10 18-12 18-4-7Z','#a0a9d8')+l('M2-52 7-8M-24-30l8 22','#e5f5ee',.8),`transform="translate(${x} ${y}) scale(${scale})"`);}
  function scenery(id,city=false) {
    let body='';const [a,b,d]=colors(id);
    if(id==='theme-bluefjord')body=p('M0 83 44 49 89 104 106 209 54 273 0 292Z',b)+p('m0 83 44-34 8 130-21 82L0 292Z','#36586b')+p('M590 59 546 24 508 91 490 217 537 265 590 250Z','#507485')+l('M62 116 72 227m457-139-16 107',d,2,'opacity=".35"')+p('M0 294q134-36 280 4t310-14v66H0Z','#39616f')+g(l('M20 313h122m-64 18h135m206-19h121',d,1,'opacity=".3"'),'class="scv3w-water"');
    if(id==='theme-marshmoon')body=c(414,63,28,d,'opacity=".55"')+p('M0 268q135-46 249 4t341-14v92H0Z','#2c5055')+e(409,307,74,5,d,'opacity=".15"')+l('M357 298h87m-68 13h65m-33 11h32',d,1,'opacity=".3"')+reeds(39,336,1.8)+reeds(552,333,1.5)+reeds(73,318,.8)+reeds(509,316,.9);
    if(id==='theme-ambercanyon')body=p('M0 98 36 95 40 144 83 147 86 213 120 230 105 290 0 310Z','#9c786f')+p('M590 74 544 74 544 121 506 121 506 186 463 211 477 275 590 298Z','#ad8979')+p('M0 148h40l4 53 42 4 10 67L0 287Z','#6c5969')+p('M590 163h-55l-5 51-39 20 2 41 97 18Z','#795f6a')+l('M0 132h38m506 22h84M0 235h82m426 76 113-13',d,2,'opacity=".4"')+g(p('M80 63q75-23 155-4t183-11l-11 7q-97 22-179 12T80 70Z',d,'opacity=".13"'),'class="scv3w-cloud"');
    if(id==='theme-lakeconstellations')body=p('M0 218 79 148 132 209 194 164 250 232 364 187 451 230 539 154 590 205v145H0Z','#344765')+p('M0 268q147-30 295-1t295-6v89H0Z','#2b435b')+g(l('M59 82 126 52 184 93 229 48 310 64 367 39 457 76 522 38',d,.8,'opacity=".55"')+[[59,82],[126,52],[184,93],[229,48],[310,64],[367,39],[457,76],[522,38]].map(([x,y])=>star(x,y,2.6,d)).join(''),'class="scv3w-constellation"')+l('M123 286h54m26 17h103m103-13h36m-273 42h64',d,1,'opacity=".23"');
    if(id==='theme-mushroomglen')body=p('M0 279q101-59 224-7t366-14v92H0Z','#34514d')+mushroom(27,285,1.9)+mushroom(564,280,1.6)+mushroom(75,328,1)+mushroom(508,325,.82)+l('M17 331q22-21 51-15m478 15q-19-25-43-17','#80a798',2)+[[40,207],[103,277],[505,246],[556,183],[284,52]].map(([x,y],i)=>c(x,y,2,d,`class="scv3w-spore" style="--scv3w-delay:-${i}s"`)).join('');
    if(id==='theme-crystalcaves')body=p('M0 0h590v83l-54-24-61-26-71 23-94-33-83 34-78-28-87 44L0 128Z','#3b5268')+p('M0 0v350h56L42 264l21-94-23-65 22-62Z','#3c6074')+p('M590 0v350h-58l13-87-12-70 25-85-22-65Z','#436779')+p('m139 30 26 52 13-47m156-9 15 38 19-33Z','#6b8a9c')+crystals(43,319,1.15)+crystals(548,306,1.32)+p('M53 322q196-17 476 0l6 28H48Z','#2a515e')+g(l('M73 333h105m223 4h99',d,1,'opacity=".28"'),'class="scv3w-water"');
    return city?g(body,'transform="translate(0 -34) scale(2.034 2.08)" opacity=".38"'):body;
  }
  function themeScene(id) {
    if(!has(id,'theme'))return '';
    const key=uid(),[sky,,rock]=themePalette(id);
    return `<defs><linearGradient id="${key}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="${rock}"/></linearGradient></defs>`+wrap(id,r(0,0,590,350,`url(#${key})`)+scenery(id),'pointer-events="none"');
  }
  const themeBackdrop=id=>has(id,'theme')?svg(id,themeScene(id),590,350,'shop-scene-backdrop-art'):'';
  const themeCityScene=id=>has(id,'theme')?wrap(id,scenery(id,true),'data-scene-size="1200 720" pointer-events="none"'):'';

  function particle(id,i) {
    const [a,b,d]=colors(id);let shape='';
    if(id==='fx-swallows')shape=g(p('M-12 0Q-5-9 0-1q5-8 12-9L5 1 1 4-3 1-8 4Z',b)+p('m-1 2 3 5-5-3Z',a),'class="scv3w-flap"');
    if(id==='fx-cottonpuffs')shape=e(0,0,6,4,a,'opacity=".65"')+c(-4,-2,3,a,'opacity=".68"')+c(2,-3,3,a,'opacity=".6"')+l('M-4 3q4 7 9 2',d,.6,'opacity=".6"');
    if(id==='fx-raingems')shape=p('M0-9q-7 9 0 12 7-3 0-12Z',a,'opacity=".72"')+l('M-2-1 0-5',d,1)+g(e(1,10,7,2,'none',`stroke="${a}" stroke-width=".6" opacity=".45"`),'class="scv3w-drop-ring"');
    if(id==='fx-juneblossom')shape=p('M0-7 3-2 8-1 4 3 4 8 0 5-5 8-4 2-8-1-3-2Z',a)+p('M0-7 0 5-4 2-8-1-3-2Z',b)+c(0,0,1.1,d);
    if(id==='fx-moonjellies')shape=g(p('M-11 0Q-10-15 0-15 11-13 11 0Z',a,'opacity=".57"')+p('M-11 0q11-5 22 0-11 5-22 0Z',d,'opacity=".8"')+g(l('M-7 2q-4 8 0 14m7-15q4 8-1 17m7-16q-3 9 1 13',a,.9,'opacity=".75"'),'class="scv3w-tentacles"'),'class="scv3w-jelly"');
    if(id==='fx-inkfishes')shape=p('M-9 0Q0-10 12-1q-10 10-21 1Z',b,'opacity=".7"')+g(p('m-8 0-9-7 2 7-2 6Z',a,'opacity=".75"'),'class="scv3w-fishtail"')+p('m0-4 2-7 4 7Z',d,'opacity=".75"')+c(8,-1,.8,a)+l('M-19 2h-11',a,.7,'opacity=".35"');
    return g(shape,`class="scv3w-particle-shape" transform="scale(${.7+(i%3)*.22})"`);
  }
  function effectScene(id,mode='city') {
    if(!has(id,'fx'))return '';
    const key=uid(),clip=`${key}-clip`,city=mode!=='home';
    const kind=id==='fx-swallows'?'flight':id==='fx-cottonpuffs'?'cotton':id==='fx-raingems'?'rain':id==='fx-juneblossom'?'blossom':id==='fx-moonjellies'?'jellies':'fish';
    const positions=kind==='rain'||kind==='blossom'?[[23,15],[167,78],[318,20],[467,111],[535,38],[85,190],[264,178],[414,238]]:[[17,44],[127,105],[257,22],[372,155],[493,55],[74,232],[341,270]];
    const particles=positions.map(([x,y],i)=>g(g(particle(id,i),`class="scv3w-drift scv3w-${kind}" style="--scv3w-delay:-${i*2.3}s;--scv3w-duration:${13+i*2}s"`),`transform="translate(${x} ${y})"`)).join('');
    return `<defs><clipPath id="${clip}">${r(0,0,590,350,'white')}</clipPath></defs>`+wrap(id,g(g(particles,`clip-path="url(#${clip})"`),city?'transform="scale(2.034 2.057)"':''),`pointer-events="none" data-scene-size="${city?'1200 720':'590 350'}"`);
  }
  function showcaseIsland(id) {
    const pals=has(id,'theme')?themePalette(id):['#192d42','#4b6573','#293b52','#a6c9d1'];
    return e(293,321,160,12,'#0a1927','opacity=".2"')+p('M100 207 216 120 346 105 481 184 405 251 267 276 167 239Z',pals[1],`stroke="${pals[3]}" stroke-width="1.1"`)+p('m100 207 67 32 100 37 138-25 76-67-48 69-151 68-85-21Z',pals[2])+l('M164 218C203 202 214 236 258 220s11-39 47-40 66 26 93-4','#bfc7be',6,'opacity=".55"')+g(p('m-21 5 23-13 22 13v11L2 29-21 16Z','#597186')+p('m2-53-14 32 14 33 14-32Z','#adcce0')+p('m2-53 14 33-14 32Z','#8189b7'),'transform="translate(319 160)"')+(has(id,'island')?islandDecoration(id):'')+e(338,244,12,4,'#ccb184','opacity=".6"')+p('m334 240 3-14 5 9 3 4-5 5Z','#f2cc93');
  }
  function preview(id) {
    if(!has(id))return '';
    const body=(has(id,'theme')?themeScene(id):'')+showcaseIsland(id)+(has(id,'fx')?effectScene(id,'home'):'');
    return svg(id,g(body,'transform="translate(6 10) scale(.25)"'));
  }
  return Object.freeze({entries,has,item,colors,preview,islandDecoration,themePalette,themeBackdrop,themeScene,themeCityScene,effectScene});
});
