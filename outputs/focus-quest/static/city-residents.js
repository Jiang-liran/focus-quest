(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusCityResidents=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Scene geometry owns position and navigation. This module only describes the
  // people and articulates their bodies; it has no clock or persistent state.
  const residents=Object.freeze([
    {id:'yanqing',name:'砚青',role:'书屋的守页人',place:'library',actionLabel:'到桌边写一页',lines:[
      '我把窗边的位置留出来了。想写点什么，或者只是翻翻旧页，都可以。',
      '雨打在玻璃上，听着像有人轻轻翻书。今天的念头，也可以夹在这里。',
      '不必把每一句都写完整。几个词，也足够让以后的自己想起这一刻。',
      '我在整理这些旧书。那些暂时没有答案的问题，也有自己的书签。']},
    {id:'ayu',name:'阿榆',role:'听雨茶馆的主人',place:'tea',actionLabel:'挑一壶热茶',lines:[
      '从营地带来的茶叶刚好泡开。衣角的雨慢慢晾，你先坐。',
      '檐下的滴水声总比街上慢一点。杯子暖着，今晚不赶路。',
      '这壶有一点桂花香。喝完也不用急着起身，窗边还有空位。',
      '篝火旁是木头的香气，城里是雨水和热茶。两边都为你留着座。']},
    {id:'wangshu',name:'望舒',role:'来串门的观星邻居',place:'observatory',actionLabel:'一起看看窗外',lines:[
      '我带了两只杯子来。今天云有点厚，不过楼下的灯也很好看。',
      '你家的窗正好朝着河弯。等雨小些，桥上的倒影会连成一条线。',
      '想去天台的话，我知道哪一段屋檐不会淋到雨。也可以就在这里坐着。',
      '星星没出来也没关系。今晚这座城的灯，已经足够温柔了。']},
    {id:'lingxiang',name:'铃缃',role:'星织小铺的裁缝',place:'atelier',actionLabel:'看看衣架和收藏',lines:[
      '这边是你已经带回来的衣服和小物。喜欢的东西，值得多看几眼。',
      '我正在缝最后一颗扣子。你慢慢挑，换好了就去街上走走。',
      '今天想轻快一点，还是暖和一点？穿着舒服，比搭配规矩重要。',
      '这些饰物放在灯下，各有各的光。小铺里没有必须追上的潮流。']},
    {id:'ache',name:'阿澈',role:'游乐场的看店人',place:'arcade',actionLabel:'去游戏角坐坐',lines:[
      '机器已经擦亮了。两台各收自己的券，你想先看看哪一台？',
      '这里也留着那些熟悉的小游戏。想开一局扫雷，我帮你把位置空出来。',
      '不用每次进门都投券。听一会儿机器的轻响，再去别处逛逛也很好。',
      '我在检修这颗按钮。要等你亲手按下去，惊喜才会揭开。']},
    {id:'wenzhou',name:'闻舟',role:'归途车站的值夜人',place:'station',actionLabel:'看看下一程',lines:[
      '往营地的那条小路还亮着灯。要回去的话，我们就沿原路一站一站走。',
      '行李里放不下的念头，可以先写在站台的小笺上。明天再带走。',
      '刚才巡过桥边，石板有点湿。慢一点走，沿途的窗都很漂亮。',
      '车站也可以只是一个歇脚的地方。今晚不必急着抵达下一站。']},
    {id:'qideng',name:'栖灯',role:'雨巷里的引路人',place:'station',actionLabel:'请你带一段路',lines:[
      '你也来城里散步了。书屋还亮着灯，阿榆正在茶馆里烧水。',
      '从桥上往回看，每扇窗的颜色都有一点不同。我每次都会停一下。',
      '这盏小灯从营地带来的。街上的路熟了，也还是喜欢提着它。',
      '顺着暖光走就好。想安静一点，去书屋；想暖和一点，就去茶馆。']},
    {id:'yuhe',name:'雨禾',role:'收摊后散步的花店姑娘',place:'atelier',actionLabel:'去小铺看看颜色',lines:[
      '剩下这几枝小花，我准备带回家。雨水一沾，叶子就像刚擦过一样。',
      '铃缃说可以用碎布做花瓶套。明天我想挑一块浅浅的绿。',
      '你看桥边那棵树，雨停后总是它先滴完最后一滴水。',
      '花店已经打烊啦。不过今晚的街景，还可以再多看一会儿。']},
    {id:'aji',name:'阿霁',role:'送完面包的烘焙师',place:'tea',actionLabel:'去茶馆坐一会儿',lines:[
      '刚给茶馆送了最后一篮面包。现在围裙上还有一点黄油香。',
      '烤箱关上以后，我喜欢绕街走一圈。热闹了一天，听听雨正好。',
      '阿榆总说面包要配热茶。我觉得，也可以配窗外慢慢亮起来的灯。',
      '明天想试试栗子馅。今晚先不琢磨配方，散步的时候就好好散步。']},
    {id:'nanzhi',name:'南栀',role:'沿河送信的邮差',place:'station',actionLabel:'到车站歇歇脚',lines:[
      '邮包今天轻了不少。最后一封信送到，我就可以慢慢走回去了。',
      '这条路上有一扇蓝窗，每天收到信都会先开一条缝，很可爱吧。',
      '有的信写得很长，有的只有几句话。被认真写下来的，都有分量。',
      '闻舟给我留了一盏站台灯。雨夜有人等着，回去的路就不算远。']},
    {id:'wanqiao',name:'晚乔',role:'收好琴的街角乐手',place:'arcade',actionLabel:'去游乐场听听声响',lines:[
      '今晚演完最后一曲啦，琴先睡一会儿。我想听听这座城自己的声音。',
      '雨落在招牌上是一个音，落在伞上又是一个音。路过的人刚好踩着拍子。',
      '阿澈那两台机器亮起来的时候，倒像两个认真等掌声的小舞台。',
      '有一段旋律还没想完。也不着急，说不定走过这座桥，它就自己来了。']},
    {id:'shuoyun',name:'朔云',role:'带着画筒的夜景写生者',place:'library',actionLabel:'到书屋翻一页纸',lines:[
      '今天画到一半，雨就来了。不过湿石板上的倒影，比原来的景色还好看。',
      '我总把远处的窗画得太整齐。真的抬头看，它们其实各有各的亮法。',
      '砚青让我把没画完的纸夹在书屋里。等下次有兴致，再接着画。',
      '这卷里有几张很普通的街角。过些日子再看，也许就会想起今晚的雨声。']},
  ].map(person=>Object.freeze({...person,lines:Object.freeze(person.lines)})));
  const byId=new Map(residents.map(person=>[person.id,person]));
  const rooms=Object.freeze({library:'yanqing',tea:'ayu',observatory:'wangshu',atelier:'lingxiang',arcade:'ache',station:'wenzhou'});
  function find(id){return typeof id==='string'?byId.get(id)||null:null;}
  function roomResident(place,mode){return place==='observatory'&&mode==='panorama'?null:typeof place==='string'&&Object.prototype.hasOwnProperty.call(rooms,place)?rooms[place]:null;}
  const palettes=Object.freeze({
    yanqing:{coat:'#bfc5ac',side:'#969f8d',vest:'#6b978b',dark:'#446a68',hair:'#586c62',skin:'#e1bea0',shade:'#c79f86',trim:'#ded3af',pants:'#415967'},
    ayu:{coat:'#b58d79',side:'#967465',vest:'#8caa99',dark:'#617f75',hair:'#715b50',skin:'#e6c0a0',shade:'#cfa18a',trim:'#ead3aa',pants:'#555e64'},
    wangshu:{coat:'#9296b9',side:'#717792',vest:'#727e9b',dark:'#4b5c78',hair:'#656477',skin:'#e7c6b4',shade:'#cba899',trim:'#e6d6b0',pants:'#4c566f'},
    lingxiang:{coat:'#9f8291',side:'#796476',vest:'#d1ad8b',dark:'#8d7367',hair:'#81615c',skin:'#e4b69b',shade:'#c9937d',trim:'#d7cdb4',pants:'#53596c'},
    ache:{coat:'#7295a4',side:'#557588',vest:'#d8b886',dark:'#8f7f66',hair:'#4b5a64',skin:'#d2aa8e',shade:'#b58a74',trim:'#c5dbd5',pants:'#405567'},
    wenzhou:{coat:'#7d9f99',side:'#587c77',vest:'#96aaa0',dark:'#46696a',hair:'#70635c',skin:'#dfb798',shade:'#bf927a',trim:'#dec69a',pants:'#4e6269'},
    qideng:{coat:'#9b97b3',side:'#777b99',vest:'#728b9b',dark:'#536e87',hair:'#706276',skin:'#e7c3a9',shade:'#cda08b',trim:'#e9d9ae',pants:'#465b70'},
    yuhe:{coat:'#a4b29a',side:'#7b9281',vest:'#c3c3a0',dark:'#5b7d70',hair:'#75635c',skin:'#e3bda0',shade:'#c79a81',trim:'#e1d3b2',pants:'#596b69'},
    aji:{coat:'#c5ae88',side:'#9f896d',vest:'#859995',dark:'#526f72',hair:'#705b4c',skin:'#e3b08e',shade:'#c28a71',trim:'#e6d7b6',pants:'#53656a'},
    nanzhi:{coat:'#799c9d',side:'#587d84',vest:'#a8b7a3',dark:'#43666f',hair:'#565e61',skin:'#d7ad93',shade:'#bb8976',trim:'#dfbf8b',pants:'#465c69'},
    wanqiao:{coat:'#9a879f',side:'#766a84',vest:'#829b9a',dark:'#546f78',hair:'#5d5463',skin:'#e3bbab',shade:'#c39588',trim:'#d7c7a4',pants:'#4c566c'},
    shuoyun:{coat:'#97a1b3',side:'#738397',vest:'#c5b396',dark:'#6d727b',hair:'#625951',skin:'#d9b797',shade:'#b98e76',trim:'#ddceb1',pants:'#485e6b'},
  });
  function hair(id,p){
    if(id==='yanqing')return `<path d="M-16-92q-5-23 11-25l-2-5 10 5q16 1 15 24l-7-3-3-11-11 7-3-5-6 11Z" fill="${p.hair}"/><path d="m-9-109 9-4 10 6-11-3Z" fill="#879487" opacity=".6"/>`;
    if(id==='ayu')return `<path d="M-17-87q-8-21 4-28 17-12 30 5 5 7 0 21l-8-9-5-13-16 13Z" fill="${p.hair}"/><path d="M-17-95q-9 23 1 29l6-5-3-23m30-1q8 24-2 29l-5-7 2-20" fill="${p.hair}"/><path d="M-15-106q14-11 29-1" fill="none" stroke="${p.trim}" stroke-width="3"/>`;
    if(id==='wangshu')return `<path d="M-16-90q-8-25 6-28 18-10 27 10l1 20-10-5-5-14-15 8Z" fill="${p.hair}"/><path d="M-15-101q-8 18-4 33l10-3-2-31m26-2q7 18 3 36l-9-5 2-27" fill="${p.hair}"/><path d="M10-107q8-6 10 0-5 8-10 0Z" fill="${p.trim}"/>`;
    if(id==='lingxiang')return `<circle cx="13" cy="-115" r="8" fill="${p.hair}"/><path d="M-17-91q-5-22 10-26 16-6 23 13l1 15-8-4-5-13-12 10-7 2Z" fill="${p.hair}"/><path d="m8-119 14 3" stroke="${p.trim}" stroke-width="2.4" stroke-linecap="round"/>`;
    if(id==='ache')return `<path d="M-17-92q-5-21 12-26l-1-4 7 5 7-3 0 4q10 4 11 21l-10-4-3-10-8 7-8-2-1 11Z" fill="${p.hair}"/><path d="m-6-111 12-4 8 9-10-5Z" fill="#6d8186"/>`;
    if(id==='wenzhou')return `<path d="M-17-92q-5-22 12-26 18-1 23 20l-6 9-4-15-10 4-8-5-2 12Z" fill="${p.hair}"/><path d="M-20-107q22-13 40 1l-3 7q-20-9-35 1Z" fill="#a7af93"/><path d="M-15-107q4-15 18-14 11 1 14 15Z" fill="#919d86"/>`;
    if(id==='yuhe')return `<path d="M-17-92q-4-24 14-26 20 1 20 25l-5 18-9-5-13 7-9-11Z" fill="${p.hair}"/><path d="M-14-105q15-14 29-1" stroke="${p.trim}" stroke-width="3" fill="none"/><g class="city-npc-flower-pin"><path d="m11-111 4-7 4 6-4 5Z" fill="#b8cbb2"/><circle cx="15" cy="-111" r="3.5" fill="#d7a9ab"/><circle cx="15" cy="-111" r="1.4" fill="#ead5a0"/></g>`;
    if(id==='aji')return `<path d="M-17-91q-5-24 13-25 22-3 21 23l-7-5-5-11-14 9Z" fill="${p.hair}"/><g class="city-npc-baker-cap"><path d="M-16-109q-8-8 0-13 4-3 10 0 6-9 14-4 2 1 3 4 11-3 13 5 0 7-9 9Z" fill="#d9d1b6"/><path d="M-15-111q14-5 29 0v6q-15-5-29 0Z" fill="#bdb99f"/></g>`;
    if(id==='nanzhi')return `<path d="M-17-90q-6-27 13-28 22 0 22 27l-8-7-5-10-13 10Z" fill="${p.hair}"/><g class="city-npc-post-cap"><path d="M-17-108q0-14 17-14 18 1 17 14Z" fill="#769897"/><path d="M-20-108q19-6 39 0l7 5-15 1-28-1Z" fill="#537c81"/><path d="m-4-115 8 0v5h-8Z" fill="#d9c299"/><path d="m-4-115 4 3 4-3" fill="none" stroke="#a78d6e" stroke-width=".8"/></g>`;
    if(id==='wanqiao')return `<path d="M-17-88q-6-27 11-31 20-4 25 20 4 16-4 23l-8-7-16 6-10-8Z" fill="${p.hair}"/><path d="M-19-111q1-11 20-12 21 1 21 11l-5 7q-16-7-33 0Z" fill="#8b7b94"/><path d="M-16-107q17-5 34 0" stroke="#c1b69e" stroke-width="2" fill="none"/>`;
    if(id==='shuoyun')return `<path d="M-18-91q-6-25 14-27 21-2 23 25l-9-6-4-10-14 10Z" fill="${p.hair}"/><g class="city-npc-beret"><path d="M-22-112q-3-11 19-11 22-8 27 4 3 9-13 12l-27 1Z" fill="#9b9687"/><path d="M-14-109q15-4 29 0" stroke="#757d79" stroke-width="4"/><path d="m2-123 2-5" stroke="#757d79" stroke-width="2.5"/></g>`;
    return `<path d="M-23-88q-1-34 21-34 23 1 25 34l-11 13H-13Z" fill="${p.side}"/><path d="M-17-91q-1-22 17-24 19 4 17 24l-5-3-5-14-18 8-3 10Z" fill="${p.hair}"/><path d="M-22-89q4-29 21-31" fill="none" stroke="${p.trim}" stroke-width="2" opacity=".6"/>`;
  }
  function head(id,p){
    return `<g class="city-npc-head"><path d="M-5-82h12v15H-5Z" fill="${p.shade}"/>${hair(id,p)}<circle cx="-15" cy="-91" r="3.3" fill="${p.shade}"/><circle cx="15" cy="-91" r="3.3" fill="${p.shade}"/><path d="M-13-103q12-9 26 1v14q-1 14-13 15-12-2-13-16Z" fill="${p.skin}"/><path d="M8-105q7 11 3 23l-11 9q15-1 15-16v-12Z" fill="${p.shade}" opacity=".55"/><path d="M-14-103q4-15 20-9l8 11-10-6-8 7-4-4Z" fill="${p.hair}"/><g class="city-npc-face"><g class="city-npc-eyes"><ellipse cx="-5.6" cy="-92" rx="1.4" ry="1.65" fill="#3f4c52"/><ellipse cx="6.8" cy="-92" rx="1.4" ry="1.65" fill="#3f4c52"/></g><path d="m1-90-1 4h2" fill="none" stroke="${p.shade}" stroke-width="1.2" stroke-linecap="round"/><path d="M-3-80q4 2 7-1" fill="none" stroke="#a6796d" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="-9" cy="-85" rx="2.5" ry="1.4" fill="#d49789" opacity=".35"/></g>${id==='yanqing'?'<path d="M-10-98q4-2 7-1m7 0q4-1 7 1" stroke="#667c70" stroke-width="1.1" fill="none"/>':''}</g>`;
  }
  function legs(p){return `<g class="city-npc-leg-left"><path d="M-15-38h13L-3-7h-12Z" fill="${p.pants}"/><path d="M-15-9h12l2 8h-20q-2-5 6-8Z" fill="#344b58"/><path d="M-20-1H-1" stroke="#a4aaa1" stroke-width="1.2"/></g><g class="city-npc-leg-right"><path d="M3-38h13L15-7H4Z" fill="${p.pants}"/><path d="M4-9h12q10 3 10 8H4Z" fill="#3d5360"/><path d="M5-1h20" stroke="#a4aaa1" stroke-width="1.2"/></g>`;}
  function garment(id,p){
    const visitorDetails={
      yuhe:`<g class="city-npc-flower-bag"><path d="m-13-70 29 36" stroke="${p.trim}" stroke-width="3"/><path d="M8-47h19l-3 24H9Z" fill="#b7a88c"/><path d="m10-43 15 0-2 15H11Z" fill="#cabb9a"/><path d="m15-44-7-17m11 18 3-22m-6 22 0-23" stroke="#607f67" stroke-width="2"/><path d="m13-53-9-3 3-6 6 4m7 8 7-6-6-4-3 6" fill="#8aa78d"/><circle cx="8" cy="-62" r="4" fill="#d9b0af"/><circle cx="17" cy="-67" r="4" fill="#d6c49b"/><circle cx="24" cy="-64" r="3.5" fill="#b4aec6"/></g>`,
      aji:`<g class="city-npc-baker-apron"><path d="M-9-70h18l6 37-29 1Z" fill="${p.vest}"/><path d="M-8-45H8v9H-8Z" fill="${p.dark}"/><path d="m-9-66-3-7m21 7 3-7" stroke="${p.trim}" stroke-width="2.5"/><path d="M10-56h9l-1 19h-8Z" fill="#ded0b3"/><path d="M12-54v13m3-13v14" stroke="#bba990" stroke-width="1.1"/></g>`,
      nanzhi:`<g class="city-npc-post-bag"><path d="m-14-70 28 35" stroke="${p.trim}" stroke-width="4"/><path d="M8-44h22v21H8Z" fill="#9c846c"/><path d="M8-45h22l-2 9H10Z" fill="#bea181"/><path d="M18-38h4v6h-4Z" fill="#dac398"/><path d="m-10-56 10 0v7h-10Z" fill="#ddcba6"/><path d="m-10-56 5 4 5-4" stroke="#9e987e" stroke-width="1" fill="none"/></g>`,
      wanqiao:`<g class="city-npc-guitar-case"><path d="M16-72h8v16q10 6 6 16-2 7-12 7-11-2-8-12l7-11Z" fill="#4e626e"/><path d="M20-68v18m-4 12 7 0" stroke="#83949a" stroke-width="1.5"/><path d="m-14-72 34 37" stroke="#b7ae93" stroke-width="3"/></g><g class="city-npc-music-scarf"><path d="M-15-73q14 9 30 0l-3 8q-12 6-25 0Z" fill="${p.vest}"/><path d="m-9-65 8 2-6 24-7-3Z" fill="#a7b7a8"/></g>`,
      shuoyun:`<g class="city-npc-paint-tube"><path d="m-15-72 29 36" stroke="${p.trim}" stroke-width="3"/><path d="m14-62 9-2 10 38-9 3Z" fill="#8c7c69"/><path d="m13-62 10-3 2 7-10 3m7 23 10-3 2 6-10 3" fill="#b8a58b"/><path d="M-12-57H0v16h-12Z" fill="${p.vest}"/><path d="m-8-60 2 16m3-18 2 17" stroke="#728688" stroke-width="2"/><path d="m-3-62 0-5 3 4" fill="#d6c7a2"/></g>`,
    }[id];
    const details=visitorDetails??(id==='ayu'?`<path d="m-10-62 19-1 6 28-28 1Z" fill="${p.vest}"/><path d="M-8-48h14v9H-8Z" fill="${p.dark}"/><path d="M-11-66v-8m22 8v-8" stroke="${p.vest}" stroke-width="3"/>`:id==='lingxiang'?`<path d="M-10-68 2-60 13-68l2 30H-13Z" fill="${p.vest}"/><path d="M-12-57q20 7 30 0" stroke="#e6daba" stroke-width="3" fill="none"/><path d="M-9-58v5m7-3v5m7-4v5m7-6v5" stroke="#867e78" stroke-width="1.2"/>`:id==='wangshu'?`<path d="M-19-67 0-73l19 6-4 20-18-8-17 10Z" fill="${p.side}"/><path d="m0-73 15 18-4 4-14-7Z" fill="${p.coat}"/><path d="M8-65q-7 4 0 9-10 0-8-7Z" fill="${p.trim}"/>`:id==='wenzhou'?`<path d="M-14-74q16 9 28 0v7q-16 9-29 0Z" fill="${p.trim}"/><path d="m7-67 7 2-2 28-10-2Z" fill="#cbb98e"/><path d="m-16-64 34 33" stroke="#425e61" stroke-width="4"/><path d="M11-41h17v17H11Z" fill="#927e65"/><path d="M12-41h15v6H12Z" fill="#b49b76"/>`:id==='ache'?`<path d="M-9-71 1-65 11-71l3 32H-12Z" fill="${p.vest}"/><path d="M-13-60h8v9h-8Z" fill="${p.dark}"/><path d="m-10-57 3 3 3-4" stroke="${p.trim}" stroke-width="1.4" fill="none"/>`:id==='qideng'?`<path d="M-18-74 0-81l18 7-9 14H-9Z" fill="${p.side}"/><path d="M-13-72 0-64l13-8" stroke="${p.trim}" stroke-width="2" fill="none"/><path d="m-13-59 23 29" stroke="${p.trim}" stroke-width="3"/><path d="M-14-48h9v10h-9Z" fill="${p.vest}"/>`:`<path d="m-11-70 11 8 12-8 4 32-17 7-15-7Z" fill="${p.vest}"/><path d="M1-61v29" stroke="${p.trim}" stroke-width="1.4"/><path d="m-10-72 10 10-7 7-8-13m26-4-11 10 8 7 7-13" fill="${p.trim}"/><path d="M7-52h8v9H7Z" fill="${p.dark}"/>`);
    return `<g class="city-npc-torso"><path d="M-17-72q18-10 35 0l5 37-23 7-23-7Z" fill="${p.coat}"/><path d="m6-75 12 3 5 37-23 7 6-16Z" fill="${p.side}"/>${details}</g>`;
  }
  function arm(p,side,holding){
    const left=side==='left',s=left?-1:1;
    // Held hands belong to the moving prop group. Do not leave a second pair
    // dangling beside a book/cup when the wrists move with their object.
    return `<g class="city-npc-arm-${side}"><path d="M${s*16}-70 ${s*23}-66 ${s*29}-47 ${s*20}-43 ${s*13}-61Z" fill="${left?p.coat:p.side}"/>${holding?'':`<path d="m${s*21}-47 ${s*8}-2 ${s*2} 8 ${-s*9} 3Z" fill="${p.trim}"/><path data-city-free-hand="${side}" d="M${s*22}-41q${s*10}-5 ${s*10} 3l${-s} 6q${-s*8} 4 ${-s*10}-3Z" fill="${p.skin}"/>`}</g>`;
  }
  const toolContacts=Object.freeze({yanqing:[[-25,-38],[21,-37]],ayu:[[-20,-40],[12,-42]],wangshu:[[-14,-38],[13,-37]],lingxiang:[[-23,-38],[18,-45]],ache:[[-25,-36],[18,-45]],wenzhou:[[-29,-38],[25,-37]],qideng:[[28,-41]]});
  function rawTool(id,p,street){
    if(!toolContacts[id])return '';
    if(street&&id!=='qideng')return id==='wenzhou'?'<g class="city-npc-prop"><path d="m-28-42 13-4 3 16-13 4Z" fill="#d7caae"/><path d="m-25-38 7-2m-7 6 8-2" stroke="#8e9f96" stroke-width="1.2"/></g>':'';
    if(id==='yanqing')return '<g class="city-npc-prop city-npc-book"><path d="m-28-48 26-4 26 5-4 17-22-4-23 4Z" fill="#547c7a"/><path d="m-27-51 25-4 26 5-4 17-22-4-23 4Z" fill="#e1d6b7"/><path d="M-2-55v18m-18-11 11-2m-10 6 10-2m14-4 12 2m-13 3 12 2" stroke="#91a193" stroke-width="1.1"/><path class="city-npc-page" d="m-1-54 12-7 5 13-17 11Z" fill="#efe3c4"/><path d="M-26-43q-6 6 1 9l6-2-1-5m43-1q6 6-1 9l-5-2 1-5" fill="'+p.skin+'"/></g>';
    if(id==='ayu')return `<g class="city-npc-prop city-npc-teapot"><path d="M-15-45q0-13 12-12 12 0 13 12v11q-12 6-25-1Z" fill="#9fb7a1"/><path d="m9-47 14-5-3 10-10 4" fill="#c4d1b5"/><path d="M-15-47q-13-4-10 8l10 2" fill="none" stroke="#a8c1aa" stroke-width="3"/><path d="M-12-56H7" stroke="#d2dcba" stroke-width="3"/><circle cx="-3" cy="-60" r="2.7" fill="#d2dcba"/><path class="city-npc-steam" d="M-6-68q-4-5 0-10m8 11q4-5 0-10" fill="none" stroke="#e4ddc2" stroke-width="1.4" opacity=".6"/><path d="M-16-44q-9-3-8 5l7 2m25-10q8-1 8 4l-8 4" fill="${p.skin}"/></g>`;
    if(id==='wangshu')return `<g class="city-npc-prop city-npc-cup"><path d="M-10-47h18v14q-10 5-18 0Z" fill="#ccbc9f"/><path d="M8-45q13-2 9 8l-8 2" fill="none" stroke="#ccbc9f" stroke-width="3"/><ellipse cx="-1" cy="-47" rx="9" ry="2" fill="#927c6b"/><path class="city-npc-steam" d="M-4-54q-4-5 0-10m7 10q4-6 0-12" fill="none" stroke="#e6dcc3" stroke-width="1.3" opacity=".5"/><path d="M-12-42q-10 0-5 9l7 1m21-8q8 2 5 7l-7 1" fill="${p.skin}"/></g>`;
    if(id==='lingxiang')return `<g class="city-npc-prop city-npc-sewing"><path d="m-21-48 22-4 20 10-9 15-25-4Z" fill="#7f9e9e"/><path d="m-11-44 12 9 11-6" stroke="#cbcac0" stroke-width="1.2" stroke-dasharray="2 2" fill="none"/><path class="city-npc-thread" d="M12-43q13-17 17-5T15-34" fill="none" stroke="#e1c899" stroke-width="1.1"/><path d="m19-52-6 14" stroke="#d8e5dd" stroke-width="1.5"/><path d="M-20-42q-9 0-6 7l8 2m33-16q8-4 9 2l-7 7-5-3" fill="${p.skin}"/></g>`;
    if(id==='ache')return `<g class="city-npc-prop city-npc-service"><path d="m-23-48 21-3 5 20-20 4Z" fill="#60858d"/><path d="m-21-45 17-3 3 14-17 4Z" fill="#cbd7bd"/><path d="m-19-40 10-2m-9 6 10-2" stroke="#849b91" stroke-width="1.2"/><path d="m20-48-7 13" stroke="#aabdc2" stroke-width="2.4"/><path d="m19-48 3-5" stroke="#d4bd93" stroke-width="4"/><path d="M-23-39q-8 0-5 7l7 1m37-18q7-2 7 4l-7 6-5-3" fill="${p.skin}"/></g>`;
    if(id==='wenzhou')return `<g class="city-npc-prop city-npc-map"><path d="m-29-49 19-5 17 5 18-3-2 20-19 2-18-4-14 3Z" fill="#daceb0"/><path d="m-10-54-4 20m21-15-3 19m-21-13 8-2 9 9 12-7 5 2" stroke="#a4b39c" stroke-width="1.2" fill="none"/><circle cx="10" cy="-42" r="2" fill="#a67f71"/><path d="M-27-42q-8 0-7 6l8 2m50-6q7 1 5 6l-6 1" fill="${p.skin}"/></g>`;
    return `<g class="city-npc-prop city-npc-lantern"><path d="M25-35v-7q8-7 15 0v7" fill="none" stroke="#d4bc89" stroke-width="2"/><path d="m20-35 12-6 13 6-3 23H23Z" fill="#9e8d73"/><path d="M26-32h13l-1 16H27Z" fill="#e5ca92"/><path d="m21-35 24 0M23-12h20" stroke="#c9b790" stroke-width="2"/><path d="M29-32h6v16h-6Z" fill="#f4dfae"/><path d="M26-44q8-1 6 5l-5 3-6-4Z" fill="${p.skin}"/><ellipse cx="32" cy="-23" rx="16" ry="21" fill="#f5d99a" opacity=".06"/></g>`;
  }
  function tool(id,p,street){
    const artwork=rawTool(id,p,street);if(!artwork||(street&&id!=='qideng'))return artwork;
    const contacts=toolContacts[id];
    const sleeves=contacts.map(([x,y])=>{const s=x<0?-1:1;return `<g class="city-npc-held-forearm"><path d="M${s*20} -57 ${s*29} -52 ${x+s*4} ${y+3} ${x-s*4} ${y-2}Z" fill="${s<0?p.coat:p.side}"/><path d="M${x-s*4} ${y-3} ${x+s*4} ${y+1}" stroke="${p.trim}" stroke-width="3.5"/></g>`;}).join('');
    return artwork.replace(/^(<g\b[^>]*)(>)/,`$1 data-city-held-hands="${contacts.length}"$2${sleeves}`);
  }
  function character(id,options={}){
    const person=find(id);if(!person)return '';
    const p=palettes[id],interactive=options.interactive!==false,street=options.street===true;
    const holding=(!street||id==='qideng')?(toolContacts[id]||[]):[],leftHeld=holding.some(([x])=>x<0),rightHeld=holding.some(([x])=>x>=0);
    return `<g class="city-npc city-npc-${id}" data-city-npc="${id}" data-city-npc-place="${person.place}" data-street="${street}" data-walking="false" data-facing="right" fill="none" stroke="none"${interactive?` role="button" tabindex="0" aria-label="与${person.name}交谈 · ${person.role}"`:''}><title>${person.name} · ${person.role}</title><ellipse class="city-npc-shadow" cy="1" rx="27" ry="6" fill="#0d2531" opacity=".3"/>${interactive?'<rect class="city-npc-hit" x="-38" y="-125" width="80" height="135" rx="19" fill="transparent" pointer-events="all"/>':''}<g class="city-npc-heading"><g class="city-npc-motion">${legs(p)}<g class="city-npc-body">${arm(p,'left',leftHeld)}${garment(id,p)}${head(id,p)}${arm(p,'right',rightHeld)}${tool(id,p,street)}</g></g></g>${interactive?'<ellipse class="city-npc-focus" cy="3" rx="32" ry="9" fill="none" stroke="#ead5ad" stroke-width="1.8"/><g class="city-npc-hello" pointer-events="none"><path d="M21-115q0-8 8-8h6q9 0 9 8v3q0 8-8 8h-7l-5 5 1-7q-4-2-4-6Z" fill="#e5dbc0"/><circle cx="28" cy="-114" r="1.4" fill="#577482"/><circle cx="33" cy="-114" r="1.4" fill="#577482"/><circle cx="38" cy="-114" r="1.4" fill="#577482"/></g>':''}</g>`;
  }
  function portrait(id){const person=find(id);return person?`<svg class="city-npc-portrait" viewBox="-48 -128 96 140" width="96" height="140" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none" aria-hidden="true" focusable="false">${character(id,{interactive:false})}</svg>`:'';}
  return Object.freeze({residents,find,roomResident,character,portrait});
});
