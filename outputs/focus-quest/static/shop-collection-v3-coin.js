(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FocusShopCollectionV3Coin=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const definitions=[
    ['companion-dormouse','companion','榛果睡鼠','圆耳小睡鼠抱着榛果，长尾轻轻蜷在脚边。',55,0,['#c5b197','#826f63','#e5d3b0']],
    ['companion-puffin','companion','海崖角嘴雀','黑白角嘴雀踩着橙色脚掌，彩色厚喙辨认得出海边的伙伴。',85,0,['#dddccc','#496376','#dda078']],
    ['companion-ferret','companion','奶油雪貂','细长的奶油雪貂盘着柔软尾巴，鼻尖安静地轻嗅。',120,0,['#e2d6b6','#988575','#c5ac93']],
    ['companion-sealpup','companion','浮冰小海豹','胖乎乎的小海豹伏在一块浮冰上，鳍脚和胡须随呼吸轻动。',165,0,['#d7e0d3','#78949c','#b5d1cf']],
    ['companion-fennec','companion','沙丘耳廓狐','沙色大耳狐裹着蓬松尾巴，耳朵内侧映着柔和珊瑚色。',220,0,['#ddc493','#a38b65','#e6b6a0']],
    ['companion-alpaca','companion','绒云羊驼','卷毛羊驼戴着小围巾，长脖颈与软软的发顶像一朵云。',300,0,['#e2dcca','#9b8c7b','#88aea6']],
    ['companion-jellyfish','companion','星露水母','半透明水母托着一颗小星，四束触手在桥边轻柔摇曳。',0,4,['#b3d9db','#6e8cab','#ead0de']],
    ['companion-axolotl','companion','桃腮六角螈','桃粉色外鳃、细小四肢与扁尾，让六角螈像在浅水里散步。',0,7,['#e5b4ba','#aa8297','#ead9bb']],
    ['companion-pegasus','companion','月羽小天马','月白小马展开分层羽翼，短鬃与蹄尖带一点暮色。',0,12,['#d9d8e9','#8c91b5','#c6dccc']],
    ['companion-kingfisher','companion','宝蓝翠鸟','翠鸟停在细枝上，蓝绿背羽、橙色胸脯与长喙映出清溪。',0,18,['#7db6bb','#42768c','#e4ba85']],
    ['relic-acornlamp','relic','橡果夜灯','橡果壳托着一盏小暖灯，木纹帽沿和细叶组成灯座。',40,0,['#c8b28d','#826f56','#f0d391']],
    ['relic-sailbottle','relic','瓶中远帆','横卧的玻璃瓶中藏着小帆船和一线潮水。',75,0,['#9dc6c7','#547b88','#e6d5ae']],
    ['relic-pressflower','relic','押花标本','木框中夹着一枝压平的花，纸张与枝叶保留细小纹理。',110,0,['#caba95','#7d936e','#dbadbb']],
    ['relic-quartzcluster','relic','山泉晶簇','几枚六棱水晶从山石中生长，浅青切面映着细小水光。',160,0,['#b8d7cb','#6c99a0','#e8dfb7']],
    ['relic-minioven','relic','刚出炉的小屋','小砖炉里放着两只面包，烟囱上有一点温暖的蒸汽。',240,0,['#cfb097','#95776b','#e8cf99']],
    ['relic-windchime','relic','檐下风铃','竹横梁吊着三根瓷管和一张短签，偶尔随风轻摆。',390,0,['#9ab8ae','#617f7b','#e3d3ad']],
    ['relic-inkwell','relic','青瓷墨池','青瓷墨池、一枝羽笔和几滴墨迹组成安静的小桌景。',650,0,['#a5c7bc','#537975','#e5d3ad']],
    ['relic-meteorite','relic','陨星标本','斜卧的陨石嵌着矿脉，深色石座旁有标本标签。',0,6,['#a5adc4','#5a677e','#d8c7a5']],
    ['relic-glassoctopus','relic','琉璃章鱼','玻璃小章鱼卷起透明腕足，瓶青和浅紫切面交叠。',0,14,['#a9d6d0','#6f97ab','#d8c4e4']],
    ['relic-pocketplanet','relic','掌心小行星','掌心大小的绿色星球托着小屋、山脊与一棵树，缓缓起伏。',0,24,['#a9c9ae','#607a91','#e6d1a0']],
    ['banner-gingham','banner','野餐方格','柔和织带与四角布纹，让旅人铭牌像一本随身的小布册。',65,0,['#a5beb0','#526f74','#e7d5ac']],
    ['banner-ticketalbum','banner','车票手账','打孔票边、日期印记与压角纸条，收拢每一段出发。',180,0,['#d2ba93','#797979','#e6d5b1']],
    ['banner-cedarwindow','banner','雪松窗棂','木制窗棂和两枝雪松为铭牌留出清楚、安静的中央。',900,0,['#acb79b','#556e66','#e4cc9f']],
    ['banner-aurorafold','banner','极光折页','两枚半透明折角像极光落在纸上，边缘有轻微明暗变化。',0,2,['#b4d4d0','#637b94','#d6c7e4']]
  ];
  const entries=Object.freeze(definitions.map(([id,slot,name,description,coins,diamonds,tints])=>Object.freeze({id,slot,name,description,coins,diamonds,tints:Object.freeze(tints),exclusive:false,lotteryOnly:false,lotteryMachine:null})));
  const items=new Map(entries.map(e=>[e.id,e]));
  const has=(id,slot)=>typeof id==='string'&&items.has(id)&&(!slot||items.get(id).slot===slot);
  const item=id=>has(id)?items.get(id):null;
  const colors=id=>has(id)?[...item(id).tints]:[];
  const p=(d,fill,attrs='')=>`<path d="${d}" fill="${fill}" ${attrs}/>`;
  const l=(d,stroke,width=1.4,attrs='')=>p(d,'none',`stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}`);
  const c=(x,y,r,fill,attrs='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${attrs}/>`;
  const e=(x,y,rx,ry,fill,attrs='')=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${attrs}/>`;
  const r=(x,y,w,h,fill,attrs='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${attrs}/>`;
  const g=(body,attrs='')=>`<g ${attrs}>${body}</g>`;
  const star=(x,y,s,fill)=>p(`M${x} ${y-s}l${s*.3} ${s*.7} ${s*.7} ${s*.3}-${s*.7} ${s*.3}-${s*.3} ${s*.7}-${s*.3}-${s*.7}-${s*.7}-${s*.3} ${s*.7}-${s*.3}Z`,fill);
  const wrap=(id,body,cls='')=>g(body,`class="scv3c-art ${cls}" data-expansion-art="${id}" data-skin-slots="${item(id).slot}" pointer-events="none"`);
  const shadow=e(50,91,34,5,'#102b3d','opacity=".23"');
  const eyes=(x1,x2,y,color='#465459')=>c(x1,y,1.65,color)+c(x2,y,1.65,color);
  function companion(id){
    if(!has(id,'companion'))return '';
    const [a,b,z]=colors(id);let body='';
    switch(id){
      case 'companion-dormouse':body=g(l('M64 75q31 18 21-8',b,4),'class="scv3c-tail"')+e(50,69,25,22,a)+c(28,33,12,b)+c(71,33,12,b)+c(28,33,7,z)+c(71,33,7,z)+e(50,48,28,24,a)+e(50,57,16,10,z)+eyes(39,61,43)+p('m46 53 4-2 4 2-4 4Z',b)+l('M29 51 15 47m13 9-12 2m56-7 13-4m-12 9 12 2',z,1)+p('M38 76q-3-17 12-17 15 0 12 17l-12 9Z','#ac8865')+p('M36 66q14-10 28 0l-1 5H37Z',b)+l('M48 62v-5',b,2)+e(34,76,7,4,a)+e(66,76,7,4,a)+e(34,89,10,4,z)+e(66,89,10,4,z);break;
      case 'companion-puffin':body=e(49,61,26,30,b)+p('M34 42q15-17 32 0l5 24q-2 19-22 19-22-3-22-21Z',a)+g(p('M29 49Q9 59 21 78l12-8Z',b),'class="scv3c-fin"')+c(50,33,22,b)+p('M31 31q5-14 19-8 13-8 18 8l-5 18-12 7-18-9Z',a)+c(40,32,2,b)+p('m48 36 30-2-14 16-16-6Z',z)+p('m59 35 9-1-7 14-6-2Z','#b97d69')+l('M51 40 71 38',b,.9)+p('M32 85 24 91h20l-1-7m13 1 0 6h20l-12-6Z',z);break;
      case 'companion-ferret':body=g(p('M41 79Q6 83 14 52q1 20 22 16Z',b)+p('M16 66q-4-8-2-14 4 11 12 13Z',a),'class="scv3c-tail"')+p('M35 41q5-12 18-10 22 5 19 26L65 83 32 86q-4-20 3-45Z',a)+e(51,38,22,19,a)+c(33,25,7,z)+c(68,24,7,z)+p('M32 31q10-6 18 5 10-10 20-5l-5 11-13 2-16-2Z',b)+eyes(41,61,35,'#efe0c3')+p('m47 44 5-3 6 3-6 4Z',b)+p('M45 50q9 2 15-3l-2 26-16 5Z',z)+l('M37 65 34 85m27-18-1 18',b,3)+e(32,86,10,4,a)+e(62,86,10,4,a);break;
      case 'companion-sealpup':body=p('M12 84 33 74 78 77 91 87 71 96 30 95Z',z)+p('m12 84 18 11 41 1 20-9v4l-20 8-42-1-17-9Z',b)+e(52,68,33,18,a)+e(40,50,24,22,a)+g(p('M55 62q-7 16 11 22l7-6-10-15Z',b),'class="scv3c-fin"')+p('M78 69q15-13 17-3l-6 12-14-2Z',a)+eyes(29,46,47)+e(37,55,4,2.6,b)+l('M26 57 16 55m10 5-12 2m32-5 10-2m-10 5 12 2',b,.8)+e(31,41,2.8,1.5,z);break;
      case 'companion-fennec':body=g(p('M61 74q32-29 27 3-4 20-35 13Z',a)+p('M81 62q14 13 0 23l-9-4Z',z),'class="scv3c-tail"')+e(46,71,24,20,a)+p('M25 44 15 4q24 8 25 31l14-1Q58 8 80 3L69 47Z',a)+p('m24 13 12 24-9 1Zm48 0-7 27-9-4Z',z)+p('M23 36q24-11 46 0l-5 24-17 12-21-13Z',a)+p('m26 50 20 8 21-10-4 14-16 9-19-12Z','#eee0b8')+eyes(36,58,44)+p('m42 55 5-2 5 2-5 4Z',b)+e(31,88,9,4,a)+e(56,88,9,4,a);break;
      case 'companion-alpaca':body=c(34,62,15,a)+c(50,67,18,a)+c(66,63,15,a)+c(76,70,10,a)+p('M26 69h51l-6 21h-8l-1-17H43l-5 17h-8Z',a)+l('M33 87v5m34-5v5',b,5)+p('M34 66 30 34l22-1 5 34Z',a)+p('M27 28 25 9l8-4 7 23m8-1 1-21 9 5-3 22Z',a)+p('M28 13 33 27m20-15-1 15','none',`stroke="${z}" stroke-width="2"`)+e(41,34,20,16,a)+c(26,29,7,a)+c(35,23,7,a)+c(46,24,8,a)+e(43,43,10,7,'#c9bba3')+eyes(33,49,35)+p('m39 42 4-1 4 1-4 4Z',b)+p('M28 51q13 9 29 0v8q-13 8-28-1Z',z)+p('m49 59 9-2 0 15-8-4Z',z);break;
      case 'companion-jellyfish':body=g(l('M28 56q-11 15 2 30m13-30q12 12-2 36m15-36q-9 20 3 31m14-32q12 10 3 25',a,3)+l('M33 58q-9 17 6 25m24-25q13 12 6 32',z,1.4),'class="scv3c-tentacles"')+p('M17 56Q16 13 50 12q35 1 34 44l-11 6-13-6-10 7-12-7-10 6Z',a,'opacity=".8"')+p('M50 12q35 1 34 44l-11 6-13-6-10 7Z',b,'opacity=".4"')+l('M20 50q30-12 60 0',z,2)+star(50,34,9,z)+c(34,40,2,'#58758a')+c(65,40,2,'#58758a')+c(25,29,3,'#e3ece0','opacity=".6"');break;
      case 'companion-axolotl':body=g(p('M60 71q41-31 30-42 0 26-21 27l-14 9Z',b)+p('M70 56q18-7 20-20-1 22-25 30Z',z),'class="scv3c-tail"')+e(49,68,25,17,a)+p('m30 67-12 12 11 4 10-14m28-2 13 12-10 4-8-14Z',a)+l('M23 78 18 84m8-5-1 6m48-7 6 6m-9-5 1 6',b,1)+g(l('M29 40 15 26m11 19L9 43m18 7L13 60M65 40l15-14m-12 19 17-2m-18 7 15 10',b,3)+l('M16 27v-7m1 10-7-1m1 14-6-5m7 6-7 6m9 8-7 3m7-3-1 8m67-40 1-7m-2 11 8-2m-3 15 7-5m-7 6 7 6m-10 7 8 4m-8-4v8',a,2),'class="scv3c-gills"')+e(48,47,25,20,a)+eyes(38,58,44)+l('M41 53q7 5 14 0',b,1.2)+e(32,51,3,2,z)+e(65,51,3,2,z);break;
      case 'companion-pegasus':body=g(p('M50 54Q63 16 87 10l-5 19-9-1 5 8-10 6 2 8-21 17Z',a)+l('M52 59 78 24m-21 26 16-8m-20 12 14-2',z,1.3),'class="scv3c-wing"')+e(51,66,26,18,a)+p('M31 74 28 92h8l8-20m19 2 4 18h8l-1-22Z',a)+l('M29 90h7m31 0h8',b,3)+p('M30 67 22 40l7-20 16 11 3 31Z',a)+p('M24 33q-15 6-13 19l15 5 13-15Z',a)+p('m29 24-6-14 10 5 4 16Z',z)+p('M35 25q18 10 12 37L37 47Z',b)+c(25,38,1.8,'#596678')+l('M17 49h9',b,1)+g(p('M74 60q22-6 17 18-8-13-18-7Z',b),'class="scv3c-tail"');break;
      case 'companion-kingfisher':body=l('M14 86 81 76',b,4)+l('M51 76v8m11-9v7',z,2)+e(53,61,21,23,a)+p('M47 43q-22 16-7 35l16 7 14-18Z',z)+g(p('M63 43q20 15 10 34L48 67Z',b)+l('M55 53 67 68m-6-17 10 10',a,1.4),'class="scv3c-wing"')+c(49,33,21,a)+p('M32 22q19-15 34 8l-33 5Z',b)+p('m31 33-23 9 27 2Z',b)+p('m33 44 14 6 4-12Z','#e6e0c6')+c(37,32,2.2,'#2c5264')+c(37.5,31.5,.65,'#f1edda')+p('m57 79 19 15-7-21Z',b);break;
    }
    return wrap(id,shadow+g(body,'class="scv3c-breathe"'),'scv3c-companion');
  }
  function relic(id){
    if(!has(id,'relic'))return '';
    const[a,b,z]=colors(id);let body='';
    switch(id){
      case 'relic-acornlamp':body=p('m29 80 20-8 24 8-24 10Z',b)+l('M50 76V53',b,4)+p('M29 35h43l-4 27-18 15-17-15Z',z)+p('m50 35 22 0-4 27-18 15Z',a)+g(r(40,43,20,19,z,'rx="5"')+r(44,46,9,12,'#fff0bd','rx="3"'),'class="scv3c-light"')+p('M25 36q2-23 25-23 24 0 26 23l-26 8Z',b)+l('M29 29 50 37 72 29m-37-6 15 7 17-7M50 15v21',a,1.1)+l('M50 14 53 7',b,3)+p('M46 78q-14-17-24-7 7 14 24 7Z',a)+l('M27 73 44 78',b,.9);break;
      case 'relic-sailbottle':body=p('M17 32h15q7-10 37-8 18 1 18 30 0 30-18 31-30 2-37-8H17Z',a,'opacity=".48"')+l('M17 32h15q7-10 37-8 18 1 18 30 0 30-18 31-30 2-37-8H17',a,2)+r(9,31,15,47,b,'rx="4"')+l('M14 35v38m6-37v36',z,1)+p('M29 66q26-10 51-1l-3 11-42 1Z',b)+p('m38 61 30-1-5 9-17 0Z',z)+l('M51 31v32',z,1.6)+p('m49 34-14 22h14Zm5-2v24l20-1Z',z)+l('M39 73q9-5 18 0t18 0',a,1.2)+l('M34 35q17-7 31-4',z,1.3,'opacity=".7"');break;
      case 'relic-pressflower':body=p('m17 19 65-5v70l-65 6Z',b)+p('m22 24 55-4v58l-55 5Z',a)+p('m27 28 45-3v49l-45 4Z','#e6ddc3')+l('M49 70 47 44m1 18-12-8m12 2 14-9',b,1.5)+p('M45 61q-17-15-19-4 4 10 19 4m4-7q20 0 20-11-13-3-20 11Z',b)+p('M47 46q-16-2-13-11 4-7 12 0-4-15 5-15 11 2 3 17 10-9 16-1 2 11-17 11Z',z)+c(48,39,4,'#ead59e')+l('M33 84h30',z,1);break;
      case 'relic-quartzcluster':body=p('M14 83 23 71 70 67 89 81 69 92 31 94Z',b)+p('M23 74 18 45 28 28 40 42 38 81Z',a)+p('m28 28 12 14-2 39-10-9Z',b)+p('M38 81 39 26 51 8 63 28 58 82Z',a)+p('m51 8 12 20-5 54-9-4Z',z)+p('m63 81 1-31 13-15 9 17-4 30Z',a)+p('m77 35 9 17-4 30-10 2Z',b)+l('M27 36v33M44 31v40m24-18v23',z,1.4)+g(star(37,23,3,z)+star(82,21,2,a),'class="scv3c-light"');break;
      case 'relic-minioven':body=p('M18 85V48q4-24 32-26 30 3 32 26v37Z',a)+r(65,12,12,29,b)+p('M62 12h18v7H62Z',a)+l('M22 44h55M19 58h62m-62 13h62M36 28v16m24-16v16M27 46v12m22-14v14m21-14v14',b,1.1)+p('M30 79V57q20-22 40 0v22Z',b)+p('m34 72 8-15q8-5 15 0l9 15Z',z)+p('M32 79q-2-17 10-14 9 0 11 14m-6 0q0-23 12-20 10 3 9 20Z','#c69763')+l('m38 68 5 4m10-10 6 5m-6-1 8 6',z,1.5)+r(14,82,74,7,b,'rx="2"')+g(l('M70 8q-4-4 0-7',a,1.2),'class="scv3c-steam"');break;
      case 'relic-windchime':body=l('M13 26 86 26M22 26l24-17 28 17',b,3)+g(l('M26 28v15m22-15v11m25-11v16',a,1)+r(20,43,12,29,a,'rx="3"')+r(42,39,13,39,z,'rx="3"')+r(67,44,13,26,a,'rx="3"')+l('M25 47v19m22-24v29m25-24v17',b,1)+l('M50 79v5',b,1)+p('m44 83 13-1-1 14-12 1Z',z)+l('M47 87h6m-6 4h5',b,1),'class="scv3c-chime"');break;
      case 'relic-inkwell':body=p('m12 77 38-10 40 12-39 13Z',a)+p('m12 77v5l39 14 39-13v-4L51 92Z',b)+p('M28 53h34l5 20q-20 13-42 0Z',a)+e(45,53,18,6,b)+e(45,54,12,3,'#294d58')+l('M39 74q7 4 14 0',z,1.2)+g(p('M47 55Q48 20 80 8q5 24-17 37Z',z)+p('M80 8 64 42l-17 13Z',a)+l('M48 55 76 15m-18 23 8-1m-3-7 9-1',b,1.1),'class="scv3c-feather"')+c(75,76,3,b)+e(79,81,5,1.6,b);break;
      case 'relic-meteorite':body=p('m18 80 32-12 32 12-32 14Z',b)+p('m18 80v6l32 11 32-11v-6L50 94Z','#405464')+p('M24 65 18 38 42 17 65 21 80 44 67 72 40 81Z',b)+p('m18 38 24-21 12 25-30 23Z',a)+p('m42 17 23 4 15 23-26-2Z','#8194a8')+p('m54 42 26 2-13 28-27 9Z','#6e8298')+g(l('M25 54 40 44 42 26m-2 18 17 13 13-9m-13 9-6 16',z,1.8),'class="scv3c-light"')+p('m64 78 22-4 4 12-23 5Z',z)+l('m69 81 12-3m-11 6 9-2',b,.9);break;
      case 'relic-glassoctopus':body=g(p('M31 53Q10 67 19 81q7 10 17-2m2-20q-7 34 9 28 9-4 1-13m9-17q-1 29 15 28 14-4 1-16m-2-16q27 6 21 23-5 11-17 4','none','stroke="#a9d6d0" stroke-width="7"'), 'class="scv3c-tentacles"')+p('M25 47Q17 12 48 11q35-1 30 38L65 65 36 63Z',a,'opacity=".82"')+p('M48 11q35-1 30 38L65 65 49 57Z',b,'opacity=".48"')+p('m27 27 21-16-7 28-16 8Z',z,'opacity=".5"')+eyes(38,63,43,b)+l('M43 52q8 5 14-1',b,1.3)+c(32,27,4,'#e0efe0','opacity=".7"')+l('M20 73q4 9 11 3m36 3q8 2 8-3',z,1.3);break;
      case 'relic-pocketplanet':body=g(c(50,60,29,b)+p('M24 49q9-18 30-17l21 11-5 12-18-4-11 12-15-2Z',a)+p('m29 71 18-7 20 7-8 17q-18 5-30-17Z',a)+p('m30 46 11-22 16 20-10 8Z','#c5cbb4')+p('m41 24 16 20-10 8Z','#8197a1')+p('m57 43 1-16 13-5 11 8-3 17Z',z)+p('m55 27 13-13 17 14-14 6Z',b)+r(64,33,6,12,b)+l('M23 42 19 24',b,2.5)+p('M12 28 18 10 27 24 20 33Z',a)+c(35,78,2,z)+c(68,63,2,z)+star(84,17,3,z)+star(13,59,2,a),'class="scv3c-planet"');break;
    }
    return wrap(id,shadow+body,'scv3c-relic');
  }
  function frame(id){
    if(!has(id,'banner'))return '';
    const[a,b,z]=colors(id);let edge='';
    const panel=r(9,22,82,57,b,'rx="7"')+r(14,27,72,47,'none',`rx="3" stroke="${a}" stroke-width="1"`);
    if(id==='banner-gingham')edge=[18,34,50,66,82].map(x=>r(x,22,7,6,a)+r(x,73,7,6,a)).join('')+[28,44,60].map(y=>r(9,y,6,8,z)+r(85,y,6,8,z)).join('')+p('m11 23 13 0-13 13m78 42-13 0 13-13Z',z)+l('M22 30h56M22 71h56',a,.6,'stroke-dasharray="2 3"');
    if(id==='banner-ticketalbum')edge=p('M15 17h32l-2 16H12Z',a)+l('M20 21h20m-22 5h16',b,.8)+p('m64 66 26-7 4 18-26 7Z',z)+l('M68 70 86 65m-16 9 14-4',b,.9)+c(74,31,7,'none',`stroke="${a}" stroke-width="1"`)+l('M69 31h10m-5-5v10',a,.7)+[34,44,54,64].map(y=>c(10,y,1.5,z)+c(89,y,1.5,z)).join('');
    if(id==='banner-cedarwindow')edge=r(6,18,88,64,'none',`rx="3" stroke="${a}" stroke-width="4"`)+l('M12 25h76M12 75h76M20 21v58m60-58v58',z,1)+p('M7 51 15 34 22 50 16 48 23 60 13 57 7 65 12 51Zm73-20 8-15 7 15-5-2 5 11-10-3-4 6 2-12Z',a)+l('M14 38v24m74-41v18',b,1);
    if(id==='banner-aurorafold')edge=g(p('M8 21h28L8 47Z',a,'opacity=".8"')+p('m8 21 28 0-10 11Z',z,'opacity=".9"')+p('m92 79-28 0 28-25Z',z,'opacity=".8"')+p('m92 79-28 0 10-11Z',a,'opacity=".9"')+l('M35 22 87 22v29M13 51v26h51',z,.9),'class="scv3c-light"');
    return wrap(id,panel+l('M31 43h34m-34 11h40m-40 10h24',z,2,'opacity=".45"')+edge,'scv3c-banner');
  }
  const premium=id=>has(id,'companion')?companion(id):relic(id);
  function preview(id){if(!has(id))return '';const slot=item(id).slot,body=slot==='banner'?frame(id):premium(id);return `<svg class="shop-art-svg scv3c-svg" viewBox="0 0 160 112" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="none" data-art="${id}">${g(body,'transform="translate(27 3) scale(1.04)"')}</svg>`;}
  return Object.freeze({entries,has,item,colors,preview,premium,companion,relic,frame});
});
