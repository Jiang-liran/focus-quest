(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusInterfaceThemes=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const themes=Object.freeze({
    'interface-default':{name:'原初星夜',bg:'#0d1019',surface:'#191d2b',raised:'#25283d',ink:'#e8e3f2',muted:'#a29ab6',accent:'#b99ada',line:'#514563',radius:16,detail:'星夜光晕',features:['熟悉的紫色星夜','柔和圆角与星光边线','原初界面，随时免费换回']},
    'interface-forest':{name:'松风书斋',bg:'#101b18',surface:'#1b3027',raised:'#243b30',ink:'#e5ebdf',muted:'#9db3a5',accent:'#b4cda0',line:'#49634f',radius:22,detail:'叶脉与木纹',features:['松绿底色与暖白文字','舒展圆角、叶脉与木纹','像走进安静的林间书斋']},
    'interface-tide':{name:'潮汐航图',bg:'#0d1923',surface:'#172e40',raised:'#223e50',ink:'#e0edf0',muted:'#97b5c2',accent:'#9cd7df',line:'#3f697c',radius:10,detail:'航图与刻度',features:['深海蓝与清亮青色','航图网格、刻度与虚线','把每日行程铺成一张航图']},
    'interface-amber':{name:'琥珀工坊',bg:'#211913',surface:'#33271d',raised:'#403326',ink:'#f3e5d0',muted:'#c0aa8e',accent:'#e6bc7d',line:'#765b3b',radius:5,detail:'黄铜与铆钉',features:['温暖琥珀与黄铜色','方正面板、铆钉与细边框','让界面多一点精工气息']},
    'interface-paper':{name:'月白手札',bg:'#ede8db',surface:'#faf7ee',raised:'#e7e5d8',ink:'#353a39',muted:'#697067',accent:'#536c60',line:'#b8bfad',radius:8,detail:'纸纹与墨线',features:['月白纸面与深色墨字','纸张肌理、细线与手札标记','画中星岛保留原有夜色']},
  });
  const has=id=>typeof id==='string'&&Object.hasOwn(themes,id);
  const normalize=id=>has(id)?id:'interface-default';
  function apply(id,doc=root.document){
    const value=normalize(id);
    if(doc?.documentElement&&doc.documentElement.dataset.interface!==value)doc.documentElement.dataset.interface=value;
    return value;
  }
  function ornament(id,t,width=840,height=430){
    if(id==='interface-forest')return `<g fill="none" stroke="${t.line}" opacity=".5"><path d="M20 382Q61 345 26 300M25 348q-17-28-10-40 18 13 10 40m7 12q33-18 35-31-26 0-35 31M813 138q-14-28 4-63m-7 38q-21-19-18-31 18 5 18 31"/><path d="M5 403q48-23 105 0M5 410q48-23 105 0M5 417q48-23 105 0" opacity=".5"/></g>`;
    if(id==='interface-tide')return `<g stroke="${t.line}" fill="none" opacity=".26">${Array.from({length:Math.floor(width/30)},(_,i)=>`<path d="M${i*30} 0V${height}"/>`).join('')}${Array.from({length:Math.floor(height/30)},(_,i)=>`<path d="M0 ${i*30}H${width}"/>`).join('')}<circle cx="785" cy="55" r="27"/><circle cx="785" cy="55" r="18"/><path d="M750 55h70m-35-35v70"/><path d="M172 92h626" stroke-dasharray="6 6"/></g>`;
    if(id==='interface-amber')return `<g fill="${t.accent}" opacity=".6">${[[14,14],[826,14],[14,416],[826,416],[163,113],[817,113],[163,299],[817,299]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="2.1"/>`).join('')}</g><g stroke="${t.line}" fill="none"><path d="M20 36V20h16m768 0h16v16M20 394v16h16m768 0h16v-16"/><path d="M140 24v382"/></g>`;
    if(id==='interface-paper')return `<g fill="none" stroke="${t.line}" opacity=".24">${Array.from({length:16},(_,i)=>`<path d="M143 ${20+i*26}H830"/>`).join('')}<path d="M163 12v406" stroke="#bfa791"/></g><path d="m760 17 14-2 2 39-8-5-6 6Z" fill="${t.accent}" opacity=".6"/>`;
    return `<g fill="${t.accent}" opacity=".36"><path d="m32 355 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm760-321 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/><circle cx="73" cy="389" r="1.4"/><circle cx="772" cy="91" r="1.4"/></g>`;
  }
  function drawing(id,{full=false,equipped={},art}={}){
    if(!has(id))return '';
    const t=themes[id],rx=t.radius;
    const text=(x,y,label,size=13,fill=t.ink,weight=400)=>`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${label}</text>`;
    const outline=id==='interface-tide'?' stroke-dasharray="5 4"':'';
    const island=full&&art?.islandPreview?.(equipped.island||'island-default',equipped);
    const scene=island?`<svg x="470" y="118" width="337" height="191" viewBox="0 0 590 350">${island.replace(/^<svg[^>]*>|<\/svg>$/g,'')}</svg>`:`<g transform="translate(516 125)"><ellipse cx="114" cy="147" rx="107" ry="8" fill="#101420" opacity=".7"/><path d="m8 100 72-45 107 18 38 44-92 34-89-17Z" fill="#434362" stroke="#6c6587" stroke-width="2"/><path d="m8 100 36 34 89 17 92-34-17 25-74 24-75-20Z" fill="#2d3048"/><path d="M46 111q28-16 51 2t40-16 37-2" fill="none" stroke="#b2a5c8" stroke-width="4"/><path d="m120 35 19-30 19 30-19 34Z" fill="#b19be3"/><path d="m139 5 1 32-20-2 19 34 19-34-18 2Z" fill="#d1bdf4"/><path d="m119 76 20-11 22 13-22 12Z" fill="#aba0c5"/><path d="m119 76 0 7 20 13 22-11v-7l-22 12Z" fill="#7d709e"/><path d="m57 49-17 29 17 9 18-9Zm134 40-14 24 14 8 15-8Z" fill="#60818b"/><path d="m89 82-10 19 10 17 11-13Z" fill="#9a89c5"/></g>`;
    return `<svg class="${full?'interface-app-preview':'shop-art-svg interface-app-mini'}" viewBox="0 0 840 430" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" data-interface-preview="${id}" fill="none" stroke="none" font-family="-apple-system, BlinkMacSystemFont, sans-serif"><rect x="1" y="1" width="838" height="428" rx="${rx}" fill="${t.bg}" stroke="${t.line}"/><path d="M139 1v428" stroke="${t.line}"/><rect x="16" y="23" width="30" height="30" rx="${Math.max(4,rx/2)}" fill="${t.raised}"/><path d="m31 29 3 8 8 2-8 3-3 7-3-7-8-3 8-2Z" fill="${t.accent}"/>${text(53,43,'专注远征',15,t.ink,600)}<rect x="14" y="86" width="110" height="37" rx="${rx/2}" fill="${t.raised}"/>${text(28,110,'今日远征',14,t.accent,600)}${['委托广场','学习复盘','星织商店','专注记录'].map((label,i)=>text(28,151+i*35,label,13,t.muted)).join('')}${text(28,400,'慢慢走，也会抵达。',9,t.muted)}${ornament(id,t)}${text(164,34,'今天，也在向前。',23,t.ink,650)}${text(164,64,t.name+' · '+t.detail,13,t.muted)}<rect x="153" y="99" width="674" height="208" rx="${rx}" fill="${t.surface}" stroke="${t.line}"${outline}/><rect x="470" y="111" width="347" height="184" rx="${Math.max(4,rx-4)}" fill="#191e30"/>${scene}${text(176,131,'每日主线 · 穿越迷雾之境',12,t.muted)}${text(176,177,'路程过半，稳步向前。',21,t.ink,650)}${text(176,205,'你的投入，正在变成看得见的积累。',12,t.muted)}${text(176,248,'4小时 40分钟',25,t.ink,600)}${text(373,249,'58.3%',20,t.accent,650)}<rect x="176" y="266" width="263" height="5" rx="2.5" fill="${t.raised}"/><rect x="176" y="266" width="153" height="5" rx="2.5" fill="${t.accent}"/>${['数学','408','政治','英语'].map((label,i)=>`<rect x="${153+i*173}" y="324" width="155" height="87" rx="${rx}" fill="${t.surface}" stroke="${t.line}"${outline}/>${text(167+i*173,348,label,14,t.ink,600)}<path d="M${167+i*173} 368h124" stroke="${t.raised}" stroke-width="4" stroke-linecap="round"/><path d="M${167+i*173} 368h${[78,58,95,42][i]}" stroke="${['#89bea4','#a99aca','#d9bb82','#8cbbd0'][i]}" stroke-width="4" stroke-linecap="round"/>${text(167+i*173,392,['沿着思路向前','让概念连成网络','梳理知识脉络','打开语言的门'][i],10,t.muted)}`).join('')}</svg>`;
  }
  const preview=id=>drawing(id);
  function fullPreview(id,equipped={},art=root.ShopArt){
    if(!has(id))return '';
    const t=themes[id];
    return `<div class="interface-full-preview" data-preview-interface="${id}">${drawing(id,{full:true,equipped,art})}<div class="interface-preview-details">${t.features.map((feature,i)=>`<div class="interface-preview-detail"><span>0${i+1}</span><strong>${feature}</strong></div>`).join('')}</div><p class="interface-compat-note">界面主题改变导航、面板和按钮；你的星岛环境、进度条、装饰与特效仍可独立搭配。示意中的星岛沿用你当前的装备。</p></div>`;
  }
  return Object.freeze({has,normalize,apply,preview,fullPreview});
});
