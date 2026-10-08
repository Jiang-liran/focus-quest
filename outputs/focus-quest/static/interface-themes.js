(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusInterfaceThemes=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const source={
    'interface-default':{name:'原初星夜',tone:'dark',bg:'#0d1019',surface:'#191d2b',raised:'#25283d',ink:'#e8e3f2',muted:'#a29ab6',accent:'#b99ada',line:'#514563',radius:16,detail:'星夜光晕',features:['熟悉的紫色星夜','柔和圆角与星光边线','原初界面，随时免费换回']},
    'interface-forest':{name:'松风书斋',tone:'dark',bg:'#101b18',surface:'#203329',raised:'#2b4134',ink:'#e5ebdf',muted:'#b0c2b3',accent:'#c4d4a5',line:'#61785b',radius:22,detail:'书脊与叶角',features:["深绿书脊导航，叶形书签标记当前页", "细木纹、压边书封与舒展的宋体标题", "像在安静书斋里翻开一册册学习手记"],sidebar:'#15261d',control:'#17291e',cssRadius:'18px 5px 18px 5px',heading:"\"Songti SC\",\"STSong\",serif"},
    'interface-tide':{name:'潮汐航图',tone:'dark',bg:'#101c26',surface:'#1a3041',raised:'#254353',ink:'#e0edf0',muted:'#a7c0cd',accent:'#a4d7df',line:'#547889',radius:10,detail:'航图与刻度',features:["蓝图网格、罗盘侧栏与虚线航标", "斜角标签与坐标刻度，面板像摊开的航图", "信息归于清楚的航程档案，景观仍保留原色"],sidebar:'#122834',control:'#152a38',cssRadius:'4px 14px 4px 14px',heading:"inherit"},
    'interface-amber':{name:'琥珀工坊',tone:'dark',bg:'#221c17',surface:'#372e25',raised:'#45382b',ink:'#f0e1cb',muted:'#c8b398',accent:'#e4c48c',line:'#896d4e',radius:5,detail:'黄铜与铆钉',features:["四角黄铜铆钉，内嵌双框面板", "硬边铭牌、雕刻分隔线与压制按钮", "温暖的深棕工坊，适合安静整理每一步"],sidebar:'#2b231c',control:'#2d251e',cssRadius:'5px',heading:"inherit"},
    'interface-paper':{name:'月白手札',tone:'light',bg:'#c9c7bb',surface:'#ded9ca',raised:'#cbc7b9',ink:'#303630',muted:'#4c5249',accent:'#3d5649',line:'#9a9d89',radius:8,detail:'纸纹与墨线',features:["低亮度米灰纸面，深墨文字", "装订页边、叠页阴影与书签式导航", "柔和的手札纸纹，画中星岛保留原有夜色"],sidebar:'#bfbcad',control:'#e2dfd2',cssRadius:'4px 10px 4px 4px',heading:"\"Songti SC\",\"STSong\",serif"},
    'interface-rain':{name:'夜雨窗灯',tone:'dark',bg:'#0e1b29',surface:'#203543',raised:'#294250',ink:'#e8f0ed',muted:'#b4c6ce',accent:'#dfc997',line:'#657e8b',radius:18,detail:'玻璃窗框与雨痕',features:["双层玻璃窗框与静止雨痕", "暖灯照亮导航标签，面板带细致窗沿", "玻璃窗框把夜色留在画里，内容清楚可读"],sidebar:'#162a38',control:'#172d3a',cssRadius:'14px 14px 5px 5px',heading:"inherit"},
    'interface-ember':{name:'炉边织毯',tone:'dark',bg:'#28211e',surface:'#3b302c',raised:'#493a34',ink:'#f0e3d5',muted:'#cdb9ac',accent:'#e5c59e',line:'#8d7566',radius:24,detail:'布艺缝线与织边',features:["细密织纹，圆润的软垫面板", "缝线包边与布艺标签，像铺开的织毯", "柔和暖棕贯穿整套界面，没有闪动光效"],sidebar:'#322723',control:'#322723',cssRadius:'24px',heading:"inherit"},
    'interface-ink':{name:'墨山行记',tone:'light',bg:'#c5c8bd',surface:'#d7dbcd',raised:'#c4cbbb',ink:'#2e3931',muted:'#495345',accent:'#365944',line:'#909f89',radius:3,detail:'水墨页边与章印',features:["竹灰宣纸、墨线压边与朱色章印", "宋体标题、叠页投影和山纹装订侧栏", "克制的书卷层次，让文字与收藏景观各安其位"],sidebar:'#b8beb0',control:'#dee0d4',cssRadius:'2px 6px 2px 2px',heading:"\"Songti SC\",\"STSong\",serif"},
    'interface-garden':{name:'玻璃花房',tone:'light',bg:'#bac8be',surface:'#d1dbcf',raised:'#bacfbd',ink:'#293e32',muted:'#3e5145',accent:'#31533d',line:'#849d86',radius:20,detail:'温室窗格与叶角',features:["柔和灰绿底色，温室拱框与细窗格", "藤叶包角、花签按钮和透光玻璃边沿", "不再铺满亮白，像阴雨天窗边的花房"],sidebar:'#aabeb0',control:'#dce2d5',cssRadius:'28px 28px 7px 7px',heading:"inherit"},
    'interface-observatory':{name:'星图档案',tone:'dark',bg:'#161d2c',surface:'#273145',raised:'#323c53',ink:'#e6eaf3',muted:'#bbc5d9',accent:'#c6d1e7',line:'#72819b',radius:5,detail:'精密轨道与档案标签',features:["深蓝档案夹、轨道角标与定位刻线", "索引式导航、刻度分隔和折角标签", "把每天的积累放入一份沉静的观测档案"],sidebar:'#1d2739',control:'#1d283c',cssRadius:'3px 13px 3px 3px',heading:"inherit"},
    'interface-neon':{name:'雨巷电台',tone:'dark',bg:'#0d1820',surface:'#1b2d38',raised:'#273d4a',ink:'#e6edf4',muted:'#acc6d0',accent:'#8ddddb',line:'#547887',radius:2,detail:'切角霓虹与频谱',features:["青粉双色窄灯带，静止电台频谱", "切角按钮、调谐刻度与分层设备面板", "只用细灯轨点亮夜色，装备特效继续独立闪耀"],sidebar:'#132633',control:'#142a37',cssRadius:'2px 11px 2px 11px',heading:"inherit"},
  };
  const themes=Object.freeze(Object.fromEntries(Object.entries(source).map(([id,t])=>[id,Object.freeze({...t,features:Object.freeze(t.features)})])));
  const metadata=Object.freeze(Object.entries(themes).map(([id,t])=>Object.freeze({id,name:t.name,label:t.name,tone:t.tone,features:t.features})));
  const has=id=>typeof id==='string'&&Object.hasOwn(themes,id);
  const normalize=id=>has(id)?id:'interface-default';
  function apply(id,doc=root.document){
    const value=normalize(id),data=doc?.documentElement?.dataset;
    if(data){
      if(data.interface!==value)data.interface=value;
      if(data.interfaceTone!==themes[value].tone)data.interfaceTone=themes[value].tone;
    }
    return value;
  }
  const path=(d,color,extra='')=>`<path d="${d}" stroke="${color}" fill="none" ${extra}/>`;
  function motif(id,t,x,y,w,h){
    const corner=path(`M${x+18} ${y+7}h-11v11m${w-25} ${h-18}v11h-11`,t.accent,'opacity=".6"');
    if(id==='interface-forest')return `<g data-ui-motif="wooden-book" opacity=".72">${[6,13].map(n=>path(`M${x+n} ${y+6}v${h-12}`,t.line)).join('')}${path(`M${x+w-7} ${y+12}q-21 14-17 33m3-12q-20-4-19-19 14-2 19 19m0 1q5-20 19-17 1 12-19 17`,t.accent)}${path(`M${x+22} ${y+h-6}q${w/4} -4 ${w/2} 0t${w/2-33} 0`,t.line)}</g>`;
    if(id==='interface-tide')return `<g data-ui-motif="navigation-chart" opacity=".44">${Array.from({length:Math.floor(w/36)},(_,i)=>path(`M${x+i*36+12} ${y+7}v${h-14}`,t.line)).join('')}${Array.from({length:Math.floor(h/36)},(_,i)=>path(`M${x+7} ${y+i*36+12}h${w-14}`,t.line)).join('')}${path(`M${x+12} ${y+8}h${w-24}m-${w-24} ${h-16}h${w-24}`,t.accent,'stroke-dasharray="3 9"')}</g>`;
    if(id==='interface-amber')return `<g data-ui-motif="brass-rivets"><rect x="${x+5}" y="${y+5}" width="${w-10}" height="${h-10}" rx="2" stroke="${t.line}"/>${[[x+11,y+11],[x+w-11,y+11],[x+11,y+h-11],[x+w-11,y+h-11]].map(([cx,cy])=>`<circle cx="${cx}" cy="${cy}" r="2.1" fill="${t.accent}"/>`).join('')}${path(`M${x+w/2-17} ${y+4}h34m-34 ${h-8}h34`,t.accent,'opacity=".4"')}</g>`;
    if(id==='interface-paper')return `<g data-ui-motif="bound-notebook"><rect x="${x+3}" y="${y+4}" width="${w-6}" height="${h-8}" rx="3" stroke="${t.line}" opacity=".44"/>${path(`M${x+13} ${y+5}v${h-10}`, '#cbb29c','opacity=".8"')}${Array.from({length:Math.floor(h/28)},(_,i)=>path(`M${x+21} ${y+25+i*28}h${w-29}`,t.line,'opacity=".24"')).join('')}<path d="m${x+w-33} ${y}h14v25l-7-5-7 5Z" fill="${t.accent}" opacity=".6"/></g>`;
    if(id==='interface-rain')return `<g data-ui-motif="rain-window"><rect x="${x+5}" y="${y+5}" width="${w-10}" height="${h-10}" rx="${Math.min(14,h/5)}" stroke="${t.line}" stroke-width="1.4"/>${corner}${path(`M${x+w-22} ${y+18}v${h-36}m-8-${h-52}v14m-4 18v22m4 16v18`,t.muted,'opacity=".25"')}<path d="M${x+15} ${y+10}h${w/3}" stroke="${t.ink}" opacity=".16"/></g>`;
    if(id==='interface-ember')return `<g data-ui-motif="woven-seam"><rect x="${x+6}" y="${y+6}" width="${w-12}" height="${h-12}" rx="18" stroke="${t.accent}" stroke-dasharray="2 4" opacity=".64"/>${path(`M${x+18} ${y+h-11}h${w-36}`,t.line,'stroke-width="3" opacity=".4"')}${Array.from({length:Math.floor(w/17)},(_,i)=>path(`M${x+15+i*17} ${y+h-8}v4`,t.accent,'opacity=".3"')).join('')}</g>`;
    if(id==='interface-ink')return `<g data-ui-motif="ink-scroll"><rect x="${x+3}" y="${y+4}" width="${w-7}" height="${h-8}" stroke="${t.line}" opacity=".3"/><path d="M${x+w-55} ${y+h-8}l17-21 11 14 12-19 14 26Z" fill="${t.accent}" opacity=".11"/>${path(`M${x+9} ${y+7}v${h-14}`,t.ink,'opacity=".2"')}<rect x="${x+w-20}" y="${y+10}" width="10" height="13" rx="1" fill="#a76755" opacity=".67"/>${path(`M${x+w-17} ${y+13}h4v7h-4v-4h4`,t.surface,'stroke-width=".8"')}</g>`;
    if(id==='interface-garden')return `<g data-ui-motif="glasshouse"><path d="M${x+5} ${y+h-6}V${y+24}Q${x+5} ${y+5} ${x+24} ${y+5}H${x+w-24}Q${x+w-5} ${y+5} ${x+w-5} ${y+24}V${y+h-6}" stroke="${t.line}"/><path d="M${x+10} ${y+15}h${w-20}m-${w-35} -6v15m${w-45} -15v15" stroke="${t.line}" opacity=".42"/><path d="M${x+w-10} ${y+h-11}q-28-3-27-30m7 17q-17 5-17-9 12-4 17 9m-2-5q-1-16 12-18 5 13-12 18Z" stroke="${t.accent}" fill="${t.raised}" opacity=".53"/></g>`;
    if(id==='interface-observatory')return `<g data-ui-motif="orbital-archive">${corner}${path(`M${x+18} ${y+4}h${w-36}m-${w-36} ${h-8}h${w-36}`,t.line,'stroke-dasharray="1 8"')}${path(`M${x+w-66} ${y+h-6}a57 57 0 0 1 58-58m-37 58a37 37 0 0 1 37-37`,t.accent,'opacity=".2"')}<rect x="${x+12}" y="${y-2}" width="21" height="5" rx="1" fill="${t.line}"/></g>`;
    if(id==='interface-neon')return `<g data-ui-motif="radio-neon">${path(`M${x+15} ${y+4}h${w-30}l11 11v${Math.max(0,h-30)}`,t.accent,'opacity=".66"')}${path(`M${x+4} ${y+15}v${h-30}l11 11h${w-30}`, '#da82b2','opacity=".6"')}${Array.from({length:9},(_,i)=>path(`M${x+w-63+i*5} ${y+h-8}v-${[3,5,9,14,8,18,7,11,4][i]}`,i%2?t.accent:'#da82b2','stroke-width="2" opacity=".45"')).join('')}</g>`;
    return `<g data-ui-motif="star-corners" fill="${t.accent}" opacity=".25"><path d="m${x+w-18} ${y+12} 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z"/></g>`;
  }
  function panel(id,t,x,y,w,h,{raised=false,detail=true}={}){
    const fill=raised?t.raised:t.surface;
    const values=(t.cssRadius||String(t.radius)).split(/\s+/).map(Number.parseFloat),corners=values.length===1?Array(4).fill(values[0]):values;
    const [a,b,c,d]=corners.map(r=>Math.min(r,w/2,h/2));
    const outline=`M${x+a} ${y}H${x+w-b}Q${x+w} ${y} ${x+w} ${y+b}V${y+h-c}Q${x+w} ${y+h} ${x+w-c} ${y+h}H${x+d}Q${x} ${y+h} ${x} ${y+h-d}V${y+a}Q${x} ${y} ${x+a} ${y}Z`;
    const base=id==='interface-neon'?`<path d="M${x+8} ${y}h${w-16}l8 8v${h-16}l-8 8H${x+8}l-8-8V${y+8}Z" fill="${fill}" stroke="${t.line}"/>`:id==='interface-default'?`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(t.radius,h/3)}" fill="${fill}" stroke="${t.line}"/>`:`<path d="${outline}" fill="${fill}" stroke="${t.line}"${id==='interface-tide'?' stroke-dasharray="5 4"':''}/>`;
    const pages=detail&&['interface-paper','interface-ink'].includes(id)?`<path d="M${x+3} ${y+h+3}H${x+w-2}V${y+8}" stroke="${t.line}" stroke-width="2" opacity=".5"/>`:'';
    return pages+base+(detail?motif(id,t,x,y,w,h):'');
  }
  function shellOrnament(id,t){
    if(id==='interface-rain')return `<g opacity=".3" stroke="${t.line}">${[29,53,74,96,117].map((x,i)=>path(`M${x} ${294+i*9}l-4 23m2 11-2 9`,t.muted)).join('')}<path d="M7 8v414m125-414v414"/></g>`;
    if(id==='interface-forest')return `<g stroke="${t.line}" opacity=".55">${[5,9,130,134].map(x=>path(`M${x} 13v405`,t.line)).join('')}<path d="M17 310q40-24 94 0m-94 8q40-24 94 0m-94 8q40-24 94 0"/></g>`;
    if(id==='interface-tide')return `<g opacity=".36" stroke="${t.line}"><circle cx="68" cy="334" r="30"/><circle cx="68" cy="334" r="20"/><path d="M30 334h76m-38-38v76m700-342h25m-25 7h14m-14 7h25"/></g>`;
    if(id==='interface-amber')return `<g stroke="${t.line}"><path d="M6 8h127v413H6Z"/>${[15,125].flatMap(x=>[16,413].map(y=>`<circle cx="${x}" cy="${y}" r="2.1" fill="${t.accent}"/>`)).join('')}</g>`;
    if(id==='interface-paper')return `<g opacity=".65">${Array.from({length:8},(_,i)=>`<path d="M5 ${37+i*48}q12-8 21 0" stroke="${t.line}" stroke-width="3"/>`).join('')}${path('M132 10v410','#cbb29c')}</g>`;
    if(id==='interface-ember')return `<g opacity=".38"><rect x="6" y="8" width="126" height="414" rx="22" stroke="${t.accent}" stroke-dasharray="3 4"/>${Array.from({length:8},(_,i)=>path(`M22 ${308+i*7}h94`,t.line)).join('')}${Array.from({length:12},(_,i)=>path(`M${28+i*7} 303v60`,t.line)).join('')}</g>`;
    if(id==='interface-ink')return `<g><path d="M6 371 27 324 39 342 67 302 94 348 114 327 135 368Z" fill="${t.accent}" opacity=".12"/>${path('M8 371 31 349 61 356 99 329 130 365',t.ink,'opacity=".22"')}<rect x="22" y="377" width="18" height="20" rx="1" fill="#a76755" opacity=".55"/></g>`;
    if(id==='interface-garden')return `<g opacity=".43" stroke="${t.line}"><path d="M7 420V38Q7 7 40 7h57q35 0 35 31v382M7 47h125M42 8v39m55-39v39M7 379h125"/>${path('M29 370q4-35 23-51m-10 25q-24-1-26-17 18-4 26 17m0-5q-1-21 17-25 5 16-17 25',t.accent,'fill="'+t.raised+'"')}</g>`;
    if(id==='interface-observatory')return `<g opacity=".44" stroke="${t.line}"><circle cx="68" cy="343" r="38"/><ellipse cx="68" cy="343" rx="20" ry="39" transform="rotate(25 68 343)"/><path d="M20 343h96m-48-48v96M130 18v395" stroke-dasharray="1 7"/><circle cx="81" cy="309" r="3" fill="${t.accent}"/></g>`;
    if(id==='interface-neon')return `<g><path d="M7 65V17L17 7h96" stroke="${t.accent}" opacity=".6"/><path d="M131 365v48l-10 10H20" stroke="#da82b2" opacity=".6"/>${[4,8,15,24,13,33,22,9,18,27].map((v,i)=>path(`M${26+i*9} 363v-${v}`,i%2?'#da82b2':t.accent,'opacity=".46" stroke-width="3"')).join('')}</g>`;
    return `<g fill="${t.accent}" opacity=".3"><circle cx="26" cy="348" r="1.5"/><circle cx="76" cy="383" r="1"/><path d="m43 330 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"/></g>`;
  }
  const innerSvg=svg=>typeof svg==='string'?svg.replace(/^<svg[^>]*>|<\/svg>$/g,''):'';
  function drawing(id,{full=false,equipped={},art}={}){
    if(!has(id))return '';
    const t=themes[id],text=(x,y,label,size=13,fill=t.ink,weight=400)=>`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}"${size>=20&&t.heading&&t.heading!=='inherit'?` font-family="${t.heading.replaceAll('"','')}"`:''}>${label}</text>`;
    const island=full&&art?.islandPreview?.(equipped.island||'island-default',equipped);
    const barId=typeof equipped.bar==='string'&&/^bar-[a-z0-9-]+$/.test(equipped.bar)?equipped.bar:'bar-default';
    const bar=full&&art?.preview?.(barId);
    const scene=island?`<svg x="475" y="114" width="332" height="188" viewBox="0 0 590 350">${innerSvg(island)}</svg>`:`<g transform="translate(516 125)"><ellipse cx="114" cy="147" rx="107" ry="8" fill="#101420" opacity=".7"/><path d="m8 100 72-45 107 18 38 44-92 34-89-17Z" fill="#434362" stroke="#6c6587" stroke-width="2"/><path d="m8 100 36 34 89 17 92-34-17 25-74 24-75-20Z" fill="#2d3048"/><path d="M46 111q28-16 51 2t40-16 37-2" fill="none" stroke="#b2a5c8" stroke-width="4"/><path d="m120 35 19-30 19 30-19 34Z" fill="#b19be3"/><path d="m139 5 1 32-20-2 19 34 19-34-18 2Z" fill="#d1bdf4"/><path d="m119 76 20-11 22 13-22 12Z" fill="#aba0c5"/><path d="m119 76 0 7 20 13 22-11v-7l-22 12Z" fill="#7d709e"/><path d="m57 49-17 29 17 9 18-9Zm134 40-14 24 14 8 15-8Z" fill="#60818b"/><path d="m89 82-10 19 10 17 11-13Z" fill="#9a89c5"/></g>`;
    const progress=bar?`<svg x="164" y="249" width="286" height="40" viewBox="0 35 160 48" preserveAspectRatio="none" data-pb-design="${barId}">${innerSvg(bar)}</svg>`:`<rect x="176" y="266" width="263" height="5" rx="2.5" fill="${t.raised}"/><rect x="176" y="266" width="153" height="5" rx="2.5" fill="${t.accent}"/>`;
    return `<svg class="${full?'interface-app-preview':'shop-art-svg interface-app-mini'}" viewBox="0 0 840 430" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" data-interface-preview="${id}" fill="none" stroke="none" font-family="-apple-system, BlinkMacSystemFont, sans-serif"><rect x="1" y="1" width="838" height="428" rx="${t.radius}" fill="${t.bg}" stroke="${t.line}"/><rect x="1" y="1" width="138" height="428" fill="${t.sidebar||t.bg}"/><path d="M139 1v428" stroke="${t.line}"/>${shellOrnament(id,t)}${panel(id,t,16,23,30,30,{raised:true,detail:false})}<path d="m31 29 3 8 8 2-8 3-3 7-3-7-8-3 8-2Z" fill="${t.accent}"/>${text(53,43,'专注远征',15,t.ink,600)}${panel(id,t,14,86,110,37,{raised:true,detail:false})}${text(28,110,'今日远征',14,t.accent,600)}${['委托广场','学习复盘','星织商店','专注记录'].map((label,i)=>text(28,151+i*35,label,13,t.muted)).join('')}${text(28,407,'慢慢走，也会抵达。',9,t.muted)}${text(164,34,'今天，也在向前。',23,t.ink,650)}${text(164,64,t.name+' · '+t.detail,13,t.muted)}${panel(id,t,153,99,674,208)}<rect x="470" y="111" width="347" height="184" rx="${Math.max(4,t.radius-4)}" fill="#191e30"/>${scene}${text(178,132,'每日主线 · 穿越迷雾之境',12,t.muted)}${text(178,177,'路程过半，稳步向前。',21,t.ink,650)}${text(178,205,'你的投入，正在变成看得见的积累。',12,t.muted)}${text(178,246,'4小时 40分钟',25,t.ink,600)}${text(373,246,'58.3%',20,t.accent,650)}${progress}${['数学','408','政治','英语'].map((label,i)=>`${panel(id,t,153+i*173,324,155,87)}${text(173+i*173,349,label,14,t.ink,600)}<path d="M${173+i*173} 368h114" stroke="${t.raised}" stroke-width="4" stroke-linecap="round"/><path d="M${173+i*173} 368h${[78,58,95,42][i]}" stroke="${['#89bea4','#a99aca','#d9bb82','#8cbbd0'][i]}" stroke-width="4" stroke-linecap="round"/>${text(173+i*173,390,['沿着思路向前','让概念连成网络','梳理知识脉络','打开语言的门'][i],10,t.muted)}`).join('')}</svg>`;
  }
  const preview=id=>drawing(id);
  function fullPreview(id,equipped={},art=root.ShopArt){
    if(!has(id))return '';
    const t=themes[id];
    const style=`--ui-bg:${t.bg};--ui-surface:${t.surface};--ui-surface-raised:${t.raised};--ui-ink:${t.ink};--ui-muted:${t.muted};--ui-accent:${t.accent};--ui-line:${t.line};--ui-soft:${t.raised};--ui-radius:${t.cssRadius||t.radius+'px'};color:${t.ink};color-scheme:${t.tone};`;
    return `<div class="interface-full-preview" data-preview-interface="${id}" data-preview-tone="${t.tone}" style="${style}">${drawing(id,{full:true,equipped,art})}<div class="interface-preview-details">${t.features.map((feature,i)=>`<div class="interface-preview-detail"><span>0${i+1}</span><strong>${feature}</strong></div>`).join('')}</div><p class="interface-compat-note">主题同时改变导航、面板、按钮与细节纹理；星岛环境、进度条、装饰与特效仍可独立搭配。画中的星岛和进度条沿用你当前的装备。</p></div>`;
  }
  return Object.freeze({metadata,has,normalize,apply,preview,fullPreview});
});
