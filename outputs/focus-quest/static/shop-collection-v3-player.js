(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FocusShopCollectionV3Player=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Small everyday companions for the progress rail and the travelling player.
  // Only bounded SVG and CSS motion; no timers or scene state live in this module.
  const definitions=[
    ['bar-toastdash','bar','吐司早班','奶油吐司停在进度前沿，烤色格纹与面包碎沿已完成的轨道铺开',40,0,['#e7be83','#866445','#fff0c2']],
    ['bar-puddleduck','bar','鸭鸭过河','小黄鸭拨开清浅水纹，水草与泡泡陪着真实进度向前',75,0,['#efd28b','#487e8c','#d9efcd']],
    ['bar-mushroomtrail','bar','蘑菇漫步','圆帽蘑菇撑着一片小叶伞，苔径与蘑菇芽随进度生长',130,0,['#d79883','#596c5a','#e9d6b3']],
    ['bar-marbletrack','bar','弹珠滑道','透亮弹珠沿双层木轨滚动，木榫与弯道刻线依照已完成进度亮起',210,0,['#91c6c7','#666283','#edd4ab']],
    ['bar-cocoamelt','bar','可可融雪','热可可杯上浮起小棉花糖，雪白奶沫与可可旋纹铺满已完成的轨道',300,0,['#b88e7d','#624d61','#f6e6cc']],
    ['bar-hummingbird','bar','蜂鸟访花','尖喙蜂鸟守着进度前沿轻轻振翅，花蔓与花蜜色细线一起延伸',650,0,['#85beb1','#41687b','#f2c6ad']],
    ['bar-crystalotter','bar','晶溪海獭','抱贝海獭浮在晶溪上，清透水晶与双层细浪映出已完成的进度',0,5,['#a9dbe0','#5c789e','#ecddc8']],
    ['bar-moonjelly','bar','月灯水母','月色水母拖着分层光须，泡泡与月相在透光水带中缓缓浮动',0,18,['#cbbde9','#66699b','#a9eee0']],
    ['avatar-noodlechef','avatar','夜宵小厨','蓬松厨师帽与暖色围裙，随当天进度添上围巾、面碗、筷子与热气',60,0,['#d8ae87','#806c69','#f1e2be']],
    ['avatar-mushroomwalker','avatar','蘑菇旅者','圆帽与林地短披肩，随当天进度添上叶扣、蘑菇篮、苔叶与小伞',110,0,['#cc9388','#656b57','#eee0bd']],
    ['avatar-sailorcat','avatar','猫港水手','猫耳水手帽与短蓝衫，随当天进度添上领结、救生圈、鱼徽与小海鸥',180,0,['#8bb3c5','#4d6887','#f0dfbd']],
    ['avatar-pocketdetective','avatar','雨巷侦探','格纹猎帽与风衣，随当天进度添上肩扣、放大镜、随身笔记与怀表',280,0,['#bda888','#655e70','#ead9b3']],
    ['avatar-cloudsleep','avatar','云枕梦游者','垂尾睡帽与星点睡袍，随当天进度添上月扣、抱枕、毛绒拖鞋与软云',450,0,['#acb8d7','#656f97','#eee2c6']],
    ['avatar-fireflykeeper','avatar','萤灯巡林人','叶片兜帽与护林披肩，随当天进度添上木扣、萤灯、藤纹与林间萤火',850,0,['#91b896','#426a68','#ebd995']],
    ['avatar-pearlpilot','avatar','珍珠潜航员','圆形潜航头盔与海蓝旅装，随当天进度添上领环、珍珠灯、背鳍与漂浮泡泡',0,6,['#96c8d2','#4f7593','#e4ddc7']],
    ['avatar-solarpainter','avatar','日光绘师','斜檐画帽与颜料围裙，随当天进度添上日纹、调色盘、画笔与流动光彩',0,20,['#e4b77e','#936d87','#f7e7b8']]
  ];
  const entries=Object.freeze(definitions.map(([id,slot,name,description,coins,diamonds,tints])=>Object.freeze({id,slot,name,description,coins,diamonds,tints:Object.freeze(tints),lotteryOnly:false,lotteryMachine:null,exclusive:false})));
  const index=new Map(entries.map(row=>[row.id,row]));let serial=0;
  const has=(id,slot)=>typeof id==='string'&&index.has(id)&&(!slot||index.get(id).slot===slot);
  const item=id=>has(id)?index.get(id):null;
  const colors=id=>has(id)?[...index.get(id).tints]:[];
  const variant=id=>has(id)?id.slice(id.indexOf('-')+1):'';
  const P=(d,fill,attrs='')=>`<path d="${d}" fill="${fill}" ${attrs}/>`;
  const L=(d,color,width=1.5,attrs='')=>P(d,'none',`stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${attrs}`);
  const C=(x,y,r,fill,attrs='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${attrs}/>`;
  const E=(x,y,rx,ry,fill,attrs='')=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${attrs}/>`;
  const R=(x,y,w,h,fill,round=0,attrs='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${round}" fill="${fill}" ${attrs}/>`;
  const G=(body,transform='',cls='')=>`<g${transform?` transform="${transform}"`:''}${cls?` class="${cls}"`:''}>${body}</g>`;
  const S=(x,y,r,fill)=>P(`M${x} ${y-r}l${r*.3} ${r*.7} ${r*.7} ${r*.3}-${r*.7} ${r*.3}-${r*.3} ${r*.7}-${r*.3}-${r*.7}-${r*.7}-${r*.3} ${r*.7}-${r*.3}Z`,fill);
  const leaf=(x,y,s,fill)=>P(`M${x} ${y}q-${s*1.2}-${s*.2}-${s}-${s} ${s*1.1} 0 ${s} ${s}q${s*1.1}-${s*1.4} ${s*1.7}-${s*.6}-${s*.5} ${s*.8}-${s*1.7} ${s*.6}Z`,fill);
  const group=(id,body,cls='')=>`<g class="collection-v3-player-art ${cls}" data-player-collection="${id}" data-skin-slots="${item(id).slot}" fill="none" stroke="none">${body}</g>`;
  const svg=(id,body,w=160,h=112,cls='')=>`<svg xmlns="http://www.w3.org/2000/svg" class="shop-art-svg collection-v3-player-svg ${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false" data-art="${id}" fill="none" stroke="none">${body}</svg>`;
  const uid=value=>`cv3p-${String(value||'ribbon').replace(/[^a-zA-Z0-9_-]/g,'')||'ribbon'}-${++serial}`;
  const eyes=(x,y,gap=9)=>C(x,y,1.5,'#354b56')+C(x+gap,y,1.5,'#354b56');

  function barDesign(id){if(!has(id,'bar'))return null;const [a,b,c]=colors(id);return {name:item(id).name,copy:item(id).description,colors:[b,a],rail:'#172d3c',accent:c};}
  function barFigure(id){
    if(!has(id,'bar'))return '';const v=variant(id),[a,b,c]=colors(id);let art='';
    if(v==='toastdash')art=G(P('M18 39V18q-9-14 8-17 8-3 14 2 8-5 16-1 15 4 6 17v20Z',a)+P('M24 34V16q-6-8 4-9 7-2 12 3 7-5 13-2 9 2 3 9v17Z',c)+R(32,16,15,11,'#e5b463',3)+eyes(29,27,23)+L('M37 30q4 3 8 0',b,1.2)+L('M11 37 5 41m61-6 8 3',a,2),'','cv3p-bob');
    if(v==='puddleduck')art=E(38,32,23,12,a)+C(49,16,13,a)+P('M17 29 8 15l19 10Z',a)+P('M60 16h15l-5 6H59Z',c)+E(35,29,12,7,c)+C(52,13,1.6,b)+G(L('M5 41q16 7 31 0t32 0',c,1.4),'','cv3p-water');
    if(v==='mushroomtrail')art=P('M25 22h29l6 18q-20 7-41 0Z',c)+G(P('M6 22Q11-1 39 0 68 0 74 23q-34 14-68-1Z',a)+E(24,15,7,4,c)+E(49,10,6,4,c)+E(60,21,4,3,c),'','cv3p-cap')+eyes(29,30,20)+L('M35 36q4 2 8 0',b,1.2)+L('M16 40 8 43m52-2 9 2',b,2)+leaf(9,25,8,b);
    if(v==='marbletrack')art=L('M6 41q31 7 68-3',c,4)+G(C(40,24,19,a)+P('M40 5a19 19 0 0 1 15 31Q30 31 40 5Z',b)+P('M24 15q14-14 23-4-19-1-16 20Z',c)+C(30,16,3,'#f0f5e3')+L('M30 38q13 5 23-6',c,1),'','cv3p-marble')+L('M6 33h9m50-20h9',a,1.3);
    if(v==='cocoamelt')art=R(20,15,36,26,a,7)+E(38,15,18,5,b)+L('M57 20q17-4 14 8-3 10-16 4',c,3)+E(38,43,28,4,c)+R(28,6,11,9,c,3)+R(41,10,10,8,'#f7dfd1',3)+L('M28 26q11 6 20-1',c,2)+G(L('M23 7q-6-6 0-11M49 3q-4-5 0-9',c,1.5),'','cv3p-steam');
    if(v==='hummingbird')art=P('M22 31q11-18 30-7 2 13-20 15Z',a)+P('M27 33 6 46l9-15Z',b)+G(P('M32 25Q5 1 17 0q19 2 27 26Z',c)+P('M36 24Q43-1 53 3q5 12-10 26Z',a),'','cv3p-wing')+C(51,20,9,a)+P('M59 19 77 22 60 24Z',b)+C(53,18,1.4,b)+L('M67 40v-7',a,2)+[0,72,144,216,288].map(deg=>E(67,28,3,6,c,`transform="rotate(${deg} 67 33)"`)).join('')+C(67,33,3,b);
    if(v==='crystalotter')art=E(36,32,24,12,b)+C(48,17,12,a)+C(38,9,5,a)+C(57,8,5,a)+E(49,22,9,5,c)+eyes(43,17,12)+C(49,20,1.8,b)+P('M16 37q-22 0-13-11 6 9 18 2Z',b)+G(P('m29 28 9-7 10 7-3 11H32Z',c)+L('M38 23v14m-5-11 5 11 5-11',a,1.2),'','cv3p-bob')+L('M14 45h20m10-2h25',a,1.2);
    if(v==='moonjelly')art=G(P('M15 24Q18 0 39 1q24 1 27 24-23 11-51-1Z',a)+P('M39 1q-11 8-12 28 18 4 27-2Q52 7 39 1Z',c,'opacity=".6"')+L('M18 24q21 10 44 0',c,1.5)+eyes(31,20,16),'','cv3p-bob')+G(L('M22 28q-7 10 3 16m8-15q-6 12 2 17m10-17q8 11-1 17m13-19q10 8 1 16',c,2),'','cv3p-tentacle')+C(7,15,4,'none',`stroke="${a}"`)+C(71,35,3,c);
    return group(id,art,'cv3p-bar-figure');
  }
  function barRibbon(id,prefix){
    if(!has(id,'bar'))return '';const v=variant(id),[a,b,c]=colors(id),local=uid(prefix),grad=local+'-gradient',clip=local+'-clip';let detail='';
    if(v==='toastdash')detail=Array.from({length:16},(_,i)=>R(i*38+5,3,26,18,c,5,'opacity=".75"')+R(i*38+10,6,16,12,a,3)+C(i*38+26,19,1.3,b)).join('');
    if(v==='puddleduck')detail=G(L('M0 7q25-8 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0M0 18q30-8 60 0t60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0 60 0',c,1.5),'','cv3p-water')+[35,135,235,335,435,535].map(x=>leaf(x,17,7,a)).join('');
    if(v==='mushroomtrail')detail=L('M0 20q50-10 100 0t100 0 100 0 100 0 100 0 100 0',b,3)+Array.from({length:11},(_,i)=>R(i*55+17,10,6,11,c,2)+P(`M${i*55+10} 11q10-19 20 0Z`,a)+C(i*55+18,7,1.3,c)).join('');
    if(v==='marbletrack')detail=L('M0 5h600M0 19h600',c,3)+Array.from({length:15},(_,i)=>L(`M${i*42+10} 5v14`,b,2)+C(i*42+25,12,4,a)+C(i*42+24,11,1.2,c)).join('');
    if(v==='cocoamelt')detail=P('M0 0h600v7q-15 12-30 0t-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0-30 0Z',c)+Array.from({length:15},(_,i)=>L(`M${i*41+12} 17q8-9 15 0`,a,1.3)).join('');
    if(v==='hummingbird')detail=L('M0 18q35-17 70-4t70-1 70 1 70-1 70 1 70-1 70 1 110-1',a,2)+Array.from({length:12},(_,i)=>leaf(i*51+15,15,7,c)+C(i*51+33,7,4,c)+C(i*51+33,7,1.5,b)).join('');
    if(v==='crystalotter')detail=G(L('M0 5q50 10 100 0t100 0 100 0 100 0 100 0 100 0M0 19q60-8 120 0t120 0 120 0 120 0 120 0',c,1.3),'','cv3p-water')+Array.from({length:10},(_,i)=>P(`m${i*61+18} 2 7 9-5 10-7-7Z`,a,'opacity=".7"')+L(`m${i*61+18} 2 2 19`,c,.9)).join('');
    if(v==='moonjelly')detail=Array.from({length:10},(_,i)=>C(i*61+16,12,7,a,'opacity=".6"')+P(`M${i*61+18} 6a7 7 0 1 0 4 12q-10 0-4-12Z`,c)+C(i*61+43,6+i%2*10,3,'none',`stroke="${c}" stroke-width="1"`)).join('')+G(L('M0 15q50-8 100 0t100 0 100 0 100 0 100 0 100 0',c,1.1),'','cv3p-water');
    return `<defs><linearGradient id="${grad}"><stop stop-color="${b}"/><stop offset=".55" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><clipPath id="${clip}"><rect width="600" height="24" rx="10"/></clipPath></defs>${group(id,`<g clip-path="url(#${clip})">${R(0,0,600,24,`url(#${grad})`)}${detail}</g>`,'cv3p-bar-ribbon')}`;
  }
  function outfit(id){
    const v=variant(id),[a,b,c]=colors(id);let hat='',coat='',tool='',trim='',crown='';
    if(v==='noodlechef'){hat=P('M16 24V14q-9-14 5-14 8-7 15 0 15-6 17 6 7 7-3 12v7Z',c)+R(17,19,33,8,a,2)+L('M24 7v10m17-11v11',a,1);coat=P('M23 43h18l5 24H17Z',c)+R(24,53,15,9,a,2);tool=P('M41 52h20q-1 14-10 14-10 0-10-14Z',a)+E(51,52,10,3,c)+L('M46 48 55 42m-6 9 10-7',b,1.2);trim=L('M20 43 31 50l11-7',a,2)+L('M25 54v7m5-7v7',b,1);crown=G(L('M46 40q-5-5 0-10m8 12q-4-6 0-11',c,1.4),'','cv3p-steam');}
    if(v==='mushroomwalker'){hat=P('M5 24Q9 0 32 1q25 1 28 24-23 9-55-1Z',a)+E(19,14,6,4,c)+E(38,8,5,3,c)+E(48,22,4,3,c);coat=P('M21 43 8 52l11 16 13-6 15 6 10-16-14-9Z',b)+L('M14 54 24 58m26-4-10 4',c,1.1);tool=P('M43 52h17l-3 15H46Z',c)+L('M44 54q-2-13 8-13 10 0 8 13',a,1.6)+C(49,51,4,a)+C(57,51,4,a);trim=leaf(24,48,6,a)+leaf(39,56,5,a);crown=L('M9 54V35',c,1.7)+P('M1 36q8-19 16 0Z',a)+L('M9 31v5',c,.9);}
    if(v==='sailorcat'){hat=P('M13 25 13 3l14 13h11L51 3v22Z',a)+P('M15 21 20 9h24l6 12Z',c)+R(13,22,39,6,b,2)+P('m18 7 6 10h-5m27-10-6 10h5Z',c);coat=P('M20 43h24l8 25H12Z',a)+P('M21 44 32 53 43 44l-6 12H27Z',c)+L('M32 54v10',b,3);tool=C(51,56,10,c)+C(51,56,5,b)+L('M43 50 47 53m9 7 4 3m-16 0 3-3m9-9 4-3',a,3);trim=P('M22 56q5-5 11 0-5 6-11 0l-5 3v-6Z',c)+C(30,55,.8,b);crown=L('M2 11q6-5 10 0 4-5 9 0',c,1.5)+L('M47 37q5-4 9 0 4-4 8 0',c,1.2);}
    if(v==='pocketdetective'){hat=P('M15 23q-1-20 17-20 20 1 19 20Z',a)+P('M6 26 15 20h36l9 6-28 4Z',b)+L('M20 10h25m-28 7h32M27 4v19m12-17v17',c,.9);coat=P('M20 43h24l10 25H10Z',a)+P('M20 43 31 57l-6 10H15Zm24 0L33 57l6 10h10Z',b)+L('M32 48v20',c,1);tool=C(51,47,8,c)+C(51,47,5,a,'opacity=".7"')+L('M46 54 40 64',b,3);trim=R(12,50,11,13,c,1)+L('M15 53h5m-5 4h5m-5 4h4',b,.8)+C(38,55,1.3,c)+C(38,62,1.3,c);crown=C(53,17,7,c)+C(53,17,5,b)+L('M53 13v4l3 2',c,1)+L('M51 25q8 10 2 16',c,1.1);}
    if(v==='cloudsleep'){hat=P('M13 25q-2-28 25-24 14 0 18 17L44 12 48 25Z',a)+R(12,23,38,6,c,3)+C(55,19,4,c)+S(31,12,4,c);coat=P('M20 43h24l9 25H11Z',a)+L('M30 45v21',c,1.2)+[49,58,65].map(y=>C(35,y,1,c)).join('');tool=R(39,48,21,17,c,6)+L('M43 52 46 54m10 5-3 2',a,1.3)+S(50,56,4,a);trim=R(13,64,17,6,c,3)+R(34,64,17,6,c,3)+S(23,55,3,c);crown=G(P('M1 40q-2-8 6-8 3-9 12-3 11-1 11 8 4 5-3 5H5Z',c,'opacity=".7"'),'','cv3p-bob');}
    if(v==='fireflykeeper'){hat=P('M10 28Q7-1 32 0q25 4 22 28L43 23H20Z',b)+P('M12 22 32 0l19 22-18-8Z',a)+L('M32 2v18',c,1)+leaf(46,18,6,c);coat=P('M20 43 7 54l9 15 16-6 16 6 10-15-14-11Z',b)+P('m20 43 12 10 12-10-5 22H25Z',a);tool=L('M9 47V36',c,1.5)+R(3,48,13,17,b,3)+R(6,51,7,10,c,2)+L('M3 48q6-8 13 0',a,1.2)+S(9,56,2,a);trim=L('M21 54q7 4 2 10m20-10q-7 4-2 10',c,1)+leaf(23,57,4,a)+leaf(42,61,4,a);crown=G(C(4,17,2,c)+C(56,37,2,c)+C(60,11,1.5,c)+L('M2 23 4 22m52 10 2 1',a,1),'','cv3p-glimmer');}
    if(v==='pearlpilot'){hat=E(32,28,24,24,'none',`stroke="${a}" stroke-width="5"`)+P('M10 21Q15-2 38 5q18 5 18 23l-8-14-30-2Z',c)+L('M13 20q-5 10 0 21',c,2)+R(5,25,7,13,b,3)+R(52,25,7,13,b,3);coat=P('M18 44h28l7 24H11Z',b)+L('M21 49 24 66m20-17-4 17',a,3)+R(27,54,12,9,c,2);tool=G(L('M51 44v5',a,2)+R(44,49,15,16,b,4)+C(51,57,5,c)+S(51,57,3,a),'','cv3p-glimmer');trim=P('M8 48 2 35l15 12m40 1 5-13-15 12Z',a)+L('M21 67h22',c,1.5);crown=G(C(4,10,3,'none',`stroke="${c}" stroke-width="1.2"`)+C(59,7,4,'none',`stroke="${a}" stroke-width="1.2"`)+C(58,43,2,c),'','cv3p-bubbles');}
    if(v==='solarpainter'){hat=P('M12 25q-11-15 11-22 21-7 32 8-1 12-14 14Z',a)+L('M17 22 43 25',b,4)+L('M34 4 38 0',b,2);coat=P('M21 43h23l8 25H12Z',b)+P('M24 45h16l6 23H18Z',c)+C(27,58,2,a)+C(37,53,2,'#92bfb2');tool=E(51,55,12,9,a,'transform="rotate(-22 51 55)"')+C(56,51,3,b)+C(44,53,2,'#8fbbce')+C(47,60,2,'#d8a5b7')+C(53,60,2,c);trim=L('M9 43 16 64',b,2)+P('M6 40q-3-6 2-9l5 8Z',a)+L('M7 38 11 37',c,1);crown=G(C(51,12,6,c)+[0,60,120].map(n=>L('M51 2v-2m0 24v-2',a,1.5,`transform="rotate(${n} 51 12)"`)).join('')+L('M5 24q2-6 7-8',c,1.3),'','cv3p-glimmer');}
    return {hat,coat,tool,trim,crown};
  }
  function avatar(id,stage=0){
    if(!has(id,'avatar'))return '';const [a,b,c]=colors(id),s=Number.isFinite(stage)?Math.max(0,Math.min(4,Math.floor(stage))):0,{hat,coat,tool,trim,crown}=outfit(id);
    const face=E(32,33,10.5,12,'#e9cfba')+E(21,34,2,3,'#e9cfba')+E(43,34,2,3,'#e9cfba')+C(28,32,1.2,'#344b56')+C(36,32,1.2,'#344b56')+L('M29 39q3 2 6 0','#ac7d73',1.2)+P('M22 24q9-7 20 0l-3-6H25Z',b);
    const base=E(32,70,25,2,'#152738','opacity=".25"')+P('M21 44h22l10 24H11Z',a)+R(16,67,13,3,b,1)+R(35,67,13,3,b,1)+coat+face+hat;
    const tiers=[L('M26 45 32 50 38 45',c,1.3)+C(32,52,2,c),tool,trim,crown];
    return `<svg class="quest-avatar-art collection-v3-player-avatar" viewBox="0 0 64 72" width="64" height="72" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="none" data-role="player" data-outfit="${id}" data-skin-slots="avatar"><g class="quest-player-growth" data-avatar-stage="${s}">${base}${tiers.map((body,i)=>`<g class="quest-avatar-tier quest-avatar-tier-${i+1}" data-avatar-tier="${i+1}" display="${s>i?'inline':'none'}">${body}</g>`).join('')}</g></svg>`;
  }
  function travelerHat(id,part=0){
    if(!has(id,'avatar'))return '';const v=variant(id),hats={noodlechef:'M149 190v-18q-10-22 13-23 10-8 21 1 23-4 23 14l-8 9v17Z',mushroomwalker:'M136 190q5-39 37-39 30 0 37 39-33 16-74 0Z',sailorcat:'M146 190v-39l22 20h12l21-20v39Z',pocketdetective:'M145 183q0-30 27-30 28 0 29 30l13 9-41 6-41-6Z',cloudsleep:'M145 190q-1-42 35-41 25 0 29 29l-18-11 7 23Z',fireflykeeper:'M142 192q-5-45 31-46 34 7 30 46l-17-8h-29Z',pearlpilot:'M140 190a34 34 0 1 1 66 0l-8-4a27 27 0 1 0-51 0Z',solarpainter:'M142 190q-19-20 11-33 35-18 53 10-2 18-21 23Z'};
    return part===0?hats[v]:part===1?'M172 158v35h29l-9-27Z':'M146 173 158 151l17 22Z';
  }
  function preview(id){
    if(!has(id))return '';
    if(has(id,'avatar'))return svg(id,G(avatar(id,4).replace(/^<svg[^>]*>|<\/svg>$/g,''),'translate(43 12) scale(1.12)'));
    const [a]=colors(id);
    return svg(id,R(12,47,136,16,'#142a3b',8)+G(barRibbon(id,'preview'),'translate(13 48) scale(.17 .583)')+G(barFigure(id),'translate(100 39) scale(.53)')+L('M17 82h24m84 0h18',a,1.2));
  }
  return {entries,has,item,colors,preview,avatar,travelerHat,barDesign,barFigure,barRibbon};
});
