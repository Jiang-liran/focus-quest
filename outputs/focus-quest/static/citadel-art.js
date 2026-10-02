(function (root, factory) {
  const api = factory(root, typeof module === 'object' && module.exports ? require('./shop-art.js') : null,
    typeof module === 'object' && module.exports ? require('./quest-art.js') : null,
    typeof module === 'object' && module.exports ? require('./citadel-route.js') : null);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FocusCitadelArt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root, nodeShop, nodeQuest, nodeRoute) {
  'use strict';

  const places = [
    {id:'archive',name:'星页书库',x:600,y:178,threshold:.5,rx:138,ry:144,labelY:83},
    {id:'workshop',name:'流光工坊',x:245,y:326,threshold:.25,rx:124,ry:144,labelY:81},
    {id:'observatory',name:'天穹观测台',x:950,y:330,threshold:.75,rx:113,ry:137,labelY:78},
    {id:'core',name:'圣物广场',x:595,y:425,threshold:0,rx:207,ry:143,labelY:130},
    {id:'dock',name:'启程码头',x:230,y:565,threshold:0,rx:147,ry:108,labelY:81},
    {id:'gate',name:'远征之门',x:925,y:565,threshold:1,rx:118,ry:144,labelY:87},
  ];
  const coreSubjects = [
    {id:'math',name:'数学',glyph:'∑',color:'#8dd9c0',x:-120,y:-21},
    {id:'cs',name:'408',glyph:'⌘',color:'#b5a5ef',x:120,y:-21},
    {id:'politics',name:'政治',glyph:'★',color:'#e7bd83',x:-106,y:43},
    {id:'english',name:'英语',glyph:'Aa',color:'#8dc8df',x:106,y:43},
  ];
  function subjectEnergy(model) {
    const rows=new Map();
    for(const row of Array.isArray(model.subjects)?model.subjects:[])if(row&&typeof row==='object'&&coreSubjects.some(s=>s.id===row.id)&&!rows.has(row.id))rows.set(row.id,row);
    return coreSubjects.map(definition=>{
      const row=rows.get(definition.id)||{};
      let ratio=finite(row.percent)?row.percent/100:finite(row.progress)?row.progress:0;
      if(Object.prototype.hasOwnProperty.call(row,'target')) {
        if(!finite(row.target)||row.target<=0)ratio=0;
        else if(Object.prototype.hasOwnProperty.call(row,'minutes'))ratio=finite(row.minutes)&&row.minutes>=0?row.minutes/row.target:0;
      }
      ratio=Number.isFinite(ratio)?Math.max(0,ratio):0;
      return {...definition,progress:clamp(ratio),complete:ratio>=1};
    });
  }
  const palettes = {
    default:{sky:'#141c31',haze:'#5d618f',top:'#666783',edge:'#a0a0bd',rock:'#303750',wall:'#c2bdd6',shade:'#8988a6',roof:'#8f81b7',roofShade:'#625e87',trim:'#ded0b3',leaf:'#8baaaa',water:'#729bad',light:'#eadac0'},
    forest:{sky:'#152830',haze:'#537d78',top:'#607c74',edge:'#9dbca0',rock:'#2c454b',wall:'#c3d3bc',shade:'#809a8b',roof:'#7caa93',roofShade:'#4f7e75',trim:'#dfd3a9',leaf:'#93bb90',water:'#7eb8ab',light:'#e4dfb6'},
    ocean:{sky:'#15283d',haze:'#538ca5',top:'#648999',edge:'#a0cad1',rock:'#294258',wall:'#c9dee0',shade:'#85aab8',roof:'#7eaccc',roofShade:'#567f9f',trim:'#e2d9b7',leaf:'#7bb4b4',water:'#99d8db',light:'#e3e6c3'},
    sakura:{sky:'#2b203a',haze:'#95728f',top:'#877789',edge:'#d3aebc',rock:'#4b3b54',wall:'#e3cbd4',shade:'#b095ad',roof:'#c091b1',roofShade:'#946b93',trim:'#f0d3b8',leaf:'#e1b5cb',water:'#a8bbca',light:'#f3dcc2'},
    aurora:{sky:'#14243a',haze:'#649b9e',top:'#64748e',edge:'#a5bccd',rock:'#303c5b',wall:'#c4cee3',shade:'#8595b3',roof:'#8eacd2',roofShade:'#5d789f',trim:'#d7d7c1',leaf:'#9bc9bc',water:'#a1d7d3',light:'#e3e6cf'},
  };
  const variants={theme:['default','forest','ocean','sakura','aurora'],fx:['default','fireflies','petals','snow','meteor','nebula'],avatar:['default','ranger','voyager','alchemist','star','royal'],companion:['default','fox','owl','whale','dragon'],relic:['default','lotus','orrery','hourglass'],portal:['default','moon','archive','cosmos']};
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const clamp=value=>Math.max(0,Math.min(1,value));
  const n=value=>String(Math.abs(value)<1e12?Math.round(value*1000)/1000:value);
  const star=(x,y,r,color,extra='')=>`<path ${extra} d="M${x} ${y-r}l${n(r*.27)} ${n(r*.73)} ${n(r*.73)} ${n(r*.27)}-${n(r*.73)} ${n(r*.27)}-${n(r*.27)} ${n(r*.73)}-${n(r*.27)}-${n(r*.73)}-${n(r*.73)}-${n(r*.27)} ${n(r*.73)}-${n(r*.27)}Z" fill="${color}"/>`;
  const strip=svg=>svg.replace(/^<svg\b[^>]*>/,'').replace(/<\/svg>$/,'');

  function normalize(model,equipment,options) {
    model=model&&typeof model==='object'?model:{};
    equipment=equipment&&typeof equipment==='object'?equipment:{};
    options=options&&typeof options==='object'?options:{};
    const percent=finite(model.percent)?Math.max(0,model.percent):finite(model.progress)?clamp(model.progress)*100:0;
    const progress=clamp(percent/100),route=routeFor(percent);
    const equipped={};
    for(const [slot,names] of Object.entries(variants))equipped[slot]=names.some(name=>equipment[slot]===`${slot}-${name}`)?equipment[slot]:`${slot}-default`;
    const ids=places.map(place=>place.id);
    const awakening=options.awakening&&['workshop','archive','observatory','gate'].includes(options.awakening.id)&&finite(options.awakening.token)?{id:options.awakening.id,token:Math.max(0,Math.floor(options.awakening.token))}:null;
    return {progress,percent,route,subjects:subjectEnergy(model),stage:route.stage,moving:model.moving===true,equipped,interactive:options.interactive!==false,selected:ids.includes(options.selected)?options.selected:null,
      pulse:options.pulse===true?'core':ids.includes(options.pulse)?options.pulse:null,awakening,arriving:options.arriving===true,theme:equipped.theme.slice(6)};
  }

  function routeFor(percent) {
    const route=nodeRoute||root.FocusCitadelRoute;
    return route?route.build(percent):{progress:clamp(percent/100),percent,stage:Math.min(4,Math.floor(percent/25)),fromId:'dock',toId:'workshop',segmentProgress:0,position:{x:245,y:588},direction:1};
  }
  const charge=(place,progress)=>place.threshold===0?.25+progress*.75:clamp((progress-place.threshold+.25)/.25);
  function arc(cx,cy,rx,ry,start,end) {
    const point=angle=>({x:cx+rx*Math.cos(angle*Math.PI/180),y:cy+ry*Math.sin(angle*Math.PI/180)}),a=point(start),b=point(end);
    return `M${n(a.x)} ${n(a.y)}A${rx} ${ry} 0 ${end-start>180?1:0} 1 ${n(b.x)} ${n(b.y)}`;
  }

  function tree(x,y,scale,p,theme) {
    let crown;
    if(theme==='sakura')crown=`<path d="M0-12-13-29M0-21l12-16" stroke="#8f788b" stroke-width="3"/><g fill="${p.leaf}"><circle cx="-13" cy="-31" r="13"/><circle cy="-43" r="17"/><circle cx="14" cy="-36" r="13"/></g><g fill="#f1d0d8"><circle cx="-9" cy="-42" r="4"/><circle cx="11" cy="-34" r="3"/><circle cx="-14" cy="-26" r="2"/></g>`;
    else if(theme==='ocean')crown=`<path d="M0-10-9-34M0-18l14-22M-7-30l-13-3m14 0 5-15m12 10 10-2m-12 4 1-14" fill="none" stroke="${p.leaf}" stroke-width="5" stroke-linecap="round"/><circle cx="0" cy="-22" r="6" fill="#bed8c4" opacity=".7"/>`;
    else crown=`<path d="M0-54-16-27H16ZM0-40-23-7H23Z" fill="${p.leaf}"/><path d="M0-53V-8H-21Z" fill="#eef1d1" opacity=".13"/>`;
    return `<g class="citadel-tree" transform="translate(${x} ${y}) scale(${scale})"><ellipse cy="5" rx="20" ry="6" fill="#101d2c" opacity=".24"/><path d="M0 5v-35" stroke="#877a84" stroke-width="4" stroke-linecap="round"/>${crown}</g>`;
  }

  function lamp(x,y,power,p) {
    return `<g class="citadel-lamp" transform="translate(${x} ${y})"><ellipse cy="5" rx="8" ry="3" fill="#28354c"/><path d="M0 4v-27m-6 1h12" fill="none" stroke="${p.trim}" stroke-width="2"/><path d="m-5-35 5-5 5 5v10H-5Z" fill="#67758a" stroke="${p.trim}" stroke-width="1"/><path class="citadel-lamp-light" d="M-3-34h6v7H-3Z" fill="${p.light}" opacity="${n(.14+power*.86)}"/><circle class="citadel-light-halo" cy="-30" r="11" fill="${p.light}" opacity="${n(power*.08)}"/></g>`;
  }

  function foundation(rx,depth,p,power,theme) {
    const top=`M${-rx} 3 ${n(-rx*.56)}-27 ${n(rx*.22)}-37 ${rx} 1 ${n(rx*.68)} 36 ${n(-rx*.05)} 58 ${n(-rx*.69)} 32Z`;
    const vines=theme==='forest'?`<g fill="none" stroke="${p.leaf}" stroke-width="2" opacity=".7"><path d="M${-rx*.65} 31q-5 31 9 46t-7 26M${rx*.57} 39q15 29 1 39M${rx*.18} 56q-7 23 2 41"/></g>`:'';
    const waterfall=theme==='ocean'?`<g class="citadel-waterfall" opacity=".45"><path d="M${rx*.36} 44q-4 31 4 ${depth*.7}" fill="none" stroke="${p.water}" stroke-width="12"/><path d="M${rx*.36-3} 44q-3 31 4 ${depth*.7}" fill="none" stroke="#d8eeea" stroke-width="2"/><ellipse cx="${rx*.36+4}" cy="${44+depth*.7}" rx="16" ry="4" fill="${p.water}" opacity=".3"/></g>`:'';
    return `<ellipse cy="${depth+20}" rx="${n(rx*.72)}" ry="13" fill="#0b1529" opacity=".2"/><path d="M${-rx} 3 ${n(-rx*.65)} ${n(depth*.68)} ${n(-rx*.14)} ${depth} ${n(rx*.21)} ${n(depth*1.13)} ${n(rx*.58)} ${n(depth*.69)} ${rx} 1 ${n(rx*.22)}-28Z" fill="${p.rock}"/><path d="M${-rx} 3 ${n(-rx*.09)} 53 ${n(rx*.21)} ${n(depth*1.13)} ${n(-rx*.14)} ${depth} ${n(-rx*.65)} ${n(depth*.68)}Z" fill="#171e36" opacity=".45"/><path d="M${n(rx*.15)} 52 ${n(rx*.58)} ${n(depth*.69)} ${n(rx*.21)} ${n(depth*1.13)}Z" fill="${p.edge}" opacity=".12"/><path d="${top}" fill="${p.top}"/><path d="M${-rx+5} 6 ${n(-rx*.69)} 32 ${n(-rx*.05)} 58 ${n(rx*.68)} 36 ${rx-5} 5" fill="none" stroke="${p.edge}" stroke-width="3" opacity=".65"/><path d="M${-rx+10} 7 ${n(-rx*.66)} 27 ${n(-rx*.05)} 52 ${n(rx*.65)} 31 ${rx-12} 6" class="citadel-edge-current" pathLength="100" fill="none" stroke="${p.light}" stroke-width="1.5" stroke-dasharray="100 100" stroke-dashoffset="${n(100*(1-power))}" opacity="${n(.12+power*.5)}"/>${vines}${waterfall}`;
  }

  function routeGeometry(state,p) {
    const api=nodeRoute||root.FocusCitadelRoute;
    if(!api)return '';
    return `<g class="citadel-journey-route" aria-hidden="true">${api.segments.map((segment,index)=>{
      const filled=clamp(state.progress*4-index),sample=api.build(index*25+12.5),next=api.build(index*25+13),angle=Math.atan2(next.position.y-sample.position.y,next.position.x-sample.position.x)*180/Math.PI;
      return `<g class="citadel-route-segment" data-route-from="${segment.from}" data-route-to="${segment.to}"><path d="${segment.path}" fill="none" stroke="#0a172a" stroke-width="35" opacity=".3" transform="translate(0 8)"/><path d="${segment.path}" fill="none" stroke="${p.edge}" stroke-width="28" opacity=".62"/><path d="${segment.path}" fill="none" stroke="${p.roofShade}" stroke-width="23"/><path d="${segment.path}" pathLength="100" fill="none" stroke="${p.trim}" stroke-width="21" stroke-dasharray=".4 3" opacity=".36"/><path class="citadel-route-travelled" data-route-index="${index}" d="${segment.path}" pathLength="100" fill="none" stroke="${p.light}" stroke-width="3" stroke-dasharray="100 100" stroke-dashoffset="${n((1-filled)*100)}"/><path class="citadel-route-flow" d="${segment.path}" pathLength="100" fill="none" stroke="${p.water}" stroke-width="2" stroke-dasharray="1 18" opacity=".5"/><g transform="translate(${n(sample.position.x)} ${n(sample.position.y)}) rotate(${n(angle)})"><path d="M-6-6 2 0-6 6m8-12 8 6-8 6" fill="none" stroke="${p.light}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g></g>`;
    }).join('')}</g>`;
  }

  function windows(points,p,power) {
    return points.map(([x,y])=>`<path d="M${x} ${y}v-14q5-9 10-1v15Z" fill="#37455f"/><path d="M${x+2} ${y-2}v-11q3-5 6 0v11Z" fill="${p.light}" opacity="${n(.1+.85*power)}"/>`).join('');
  }

  function roofMark(x,y,p,theme) {
    if(theme==='forest')return `<path d="M${x-6} ${y+6}q-3-17 12-18 4 12-12 18Z" fill="${p.trim}"/><path d="m${x-5} ${y+5} 7-11" stroke="${p.roofShade}" stroke-width="1"/>`;
    if(theme==='ocean')return `<path d="M${x-11} ${y}q1-16 11-15 12 0 12 15l-11 8Z" fill="${p.trim}"/><path d="M${x} ${y+5}v-17m-3 17-5-14m11 14 5-14" stroke="${p.roofShade}" stroke-width="1"/>`;
    if(theme==='sakura')return `<g fill="${p.trim}">${[[0,-7],[7,-2],[4,6],[-5,6],[-7,-2]].map(([dx,dy])=>`<ellipse cx="${x+dx}" cy="${y+dy}" rx="4" ry="6"/>`).join('')}<circle cx="${x}" cy="${y}" r="3" fill="${p.roofShade}"/></g>`;
    if(theme==='aurora')return `${star(x,y,12,p.trim)}<circle cx="${x}" cy="${y}" r="17" fill="none" stroke="${p.trim}" stroke-width="1" opacity=".65"/>`;
    return `${star(x,y,8,p.trim)}<path d="M${x-14} ${y+12}h28" stroke="${p.trim}" stroke-width="1"/>`;
  }

  function workshop(p,power,theme) {
    return `<path d="m-88 5 58-23 96 12-52 35Z" fill="${p.trim}" opacity=".28"/>
      <path d="M-74-61-19-86 37-65v71L-15 29-74 8Z" fill="${p.wall}"/><path d="M-15-38 37-65v71L-15 29Z" fill="${p.shade}"/>
      <path d="m-86-60 65-57 71 49-65 32Z" fill="${p.roof}"/><path d="m-21-117 6 81 65-32Z" fill="${p.roofShade}"/>
      <path d="M-86-60-15-36 50-68v8L-15-28-86-52Z" fill="${p.trim}"/>${roofMark(-30,-68,p,theme)}
      ${windows([[-62,-17],[-37,-8],[0,-9]],p,power)}<path d="M-28 23V-2q10-18 20-1v29Z" fill="#39465b"/>
      <path d="M46-88 69-99 88-92v87L67 7 46-3Z" fill="${p.shade}"/><path d="m41-91 28-14 25 11-25 14Z" fill="${p.trim}"/><path d="M54-88 68-94v10l-14 6Z" fill="${p.roofShade}" opacity=".35"/>
      <g class="citadel-chimney-haze" fill="${p.edge}" opacity="${n(.06+power*.12)}"><circle cx="68" cy="-119" r="8"/><circle cx="75" cy="-139" r="11"/><circle cx="89" cy="-158" r="14"/></g>
      <g transform="translate(70 -36)"><g class="citadel-gear"><path d="m-5-22 10 0 2 8 6 4 8-2 5 9-6 6v6l6 6-5 9-8-2-6 4-2 8H-5l-2-8-6-4-8 2-5-9 6-6V3l-6-6 5-9 8 2 6-4Z" fill="${p.trim}" transform="scale(.65) translate(0 -7)"/><circle r="9" fill="${p.roofShade}"/><circle r="4" fill="${p.water}"/></g></g>
      <path d="M-94 12v-24h21v24m-18-12h16" fill="${p.shade}" stroke="${p.edge}" stroke-width="2"/><path d="M45 20h38v-9H45Z" fill="${p.roofShade}"/><path d="M45 11h38l-12-8H33Z" fill="${p.trim}"/><path d="M52 17v13m25-13v13" stroke="${p.trim}" stroke-width="2"/>
      ${lamp(-91,-1,power,p)}${tree(103,5,.62,p,theme)}`;
  }

  function archive(p,power,theme) {
    return `<path d="m-106 6 91-38 101 28-87 42Z" fill="${p.trim}" opacity=".3"/><path d="m-98 18 96 35 90-40v8L-2 62-98 28Z" fill="${p.edge}"/><path d="m-91 27 89 33 83-38v7L-2 68-91 35Z" fill="${p.shade}"/>
      <path d="M-80-59-5-88 72-60V8L-3 39-80 10Z" fill="${p.wall}"/><path d="M-3-31 72-60V8L-3 39Z" fill="${p.shade}"/>
      <path d="m-94-60 88-62 92 59-88 34Z" fill="${p.roof}"/><path d="m-6-122 4 93 88-34Z" fill="${p.roofShade}"/><path d="M-94-60-2-29 86-63v8L-2-21-94-52Z" fill="${p.trim}"/>
      <g fill="${p.trim}"><path d="M-69-40v52l9 3v-52Zm28 10v52l9 3v-52Zm52 1v53l9-4v-53Zm30-12v53l9-4v-53Z"/></g>
      ${windows([[-55,-8],[24,-10],[53,-22]],p,power)}<path d="M-23 31V0q16-27 30-6v35Z" fill="#344259"/><path d="M-18 28V1q11-18 20-5v30Z" fill="${p.light}" opacity="${n(.07+power*.37)}"/><path d="M-8-2v31" stroke="${p.trim}" stroke-width="1.3"/>
      <path d="M-34-91q15-11 32-5 17-13 36-7v27q-19-7-36 7-17-6-32 5Z" fill="${p.trim}"/><path d="M-2-96v27m-23-20 16-3m-16 11 16-3m15-6 19-7m-19 15 19-7" stroke="${p.roofShade}" stroke-width="2"/>
      <g transform="translate(-104 -10)"><path d="M-7 12V-14H8v26Z" fill="${p.roofShade}"/><path d="M-15-14H16v8H-15Z" fill="${p.trim}"/><path d="M-12-32q10-6 18 0v16q-10-6-18 0Zm18 0q8-6 17 0v16q-10-6-17 0Z" fill="${p.wall}"/><path d="M6-32v17" stroke="${p.shade}"/></g>
      ${lamp(104,4,power,p)}${tree(109,-34,.68,p,theme)}`;
  }

  function observatory(p,power,theme) {
    return `<ellipse cy="5" rx="76" ry="28" fill="${p.trim}" opacity=".28"/><path d="m-64 4 61-30 66 24L4 33Z" fill="${p.edge}"/><path d="m-64 4v11L4 43 63 12V-2L4 33Z" fill="${p.shade}"/>
      <path d="M-46-49-3-72 43-51V1L0 21-46 3Z" fill="${p.wall}"/><path d="M0-29 43-51V1L0 21Z" fill="${p.shade}"/>
      <path d="M-58-48q-1-53 54-66 56 12 60 60L0-28Z" fill="${p.roof}"/><path d="M-4-114q-12 48 4 86l56-26q-4-48-60-60Z" fill="${p.roofShade}"/><path d="M-4-114Q22-91 28-42" fill="none" stroke="${p.edge}" stroke-width="2"/>
      <path d="M-60-47 0-24 58-53v7L0-17-60-40Z" fill="${p.trim}"/>
      <path d="m14-83 33-27 9 11-33 28Z" fill="${p.trim}"/><path d="m45-114 13-7 12 18-12 9Z" fill="${p.edge}"/><ellipse cx="63" cy="-113" rx="6" ry="10" fill="#34495e" transform="rotate(-36 63 -113)"/>
      ${windows([[-36,-12],[11,-12]],p,power)}<path d="M-11 18V-3q10-15 20-1v22Z" fill="#3e4b62"/>
      <g transform="translate(-76 -42)"><path d="M0 14v27m-12 2h24" stroke="${p.trim}" stroke-width="3"/><g class="citadel-orrery"><ellipse rx="23" ry="9" fill="none" stroke="${p.trim}" stroke-width="1.5" transform="rotate(-32)"/><ellipse rx="11" ry="23" fill="none" stroke="${p.water}" stroke-width="1.5" transform="rotate(24)"/><circle cx="-19" cy="10" r="3" fill="${p.light}"/></g><circle r="6" fill="${p.light}" opacity="${n(.3+power*.7)}"/></g>
      ${lamp(79,8,power,p)}${roofMark(0,-141,p,theme)}`;
  }

  function dock(p,power,theme) {
    return `<path d="m-115 11 141-42 93 29-139 47Z" fill="${p.shade}"/><path d="m-115 11 95 34 139-47v9L-20 55-115 20Z" fill="${p.roofShade}"/><g stroke="${p.trim}" stroke-width="1" opacity=".45">${Array.from({length:11},(_,i)=>`<path d="m${-103+i*12} ${14-i*3.6} 92 33"/>`).join('')}</g><path d="m-105 9 85 29 130-42" fill="none" stroke="${p.edge}" stroke-width="3"/>
      <g transform="translate(-7 -13)"><path d="M-29-21 0-32 34-22V7L1 20-29 10Z" fill="${p.wall}"/><path d="M1-8 34-22V7L1 20Z" fill="${p.shade}"/><path d="m-38-23 36-29 45 28L1-7Z" fill="${p.roof}"/><path d="m-2-52 3 45 42-17Z" fill="${p.roofShade}"/><path d="M-14 13V-6q6-11 13-1v23Z" fill="#3b4d64"/>${windows([[10,3]],p,power)}</g>
      <path d="M-91-2v-49m0 4 29 8-29 7Z" fill="${p.trim}" stroke="${p.trim}" stroke-width="2"/><path d="M72 3v-43m0 3h26v18H72Z" fill="${p.roofShade}" stroke="${p.edge}" stroke-width="1.5"/>${star(85,-27,4,p.trim)}
      <g transform="translate(-107 -31)"><g class="citadel-boat"><path d="M-42 6h79L17 28H-20Z" fill="${p.trim}"/><path d="M-39 8h75L22 17H-25Z" fill="${p.roofShade}"/><path d="M-3 6v-69" stroke="${p.edge}" stroke-width="3"/><path d="M-7-60-40 0H-7ZM2-48 29 0H2Z" fill="${p.wall}"/><path d="m-7-60 0 60-33 0Z" fill="${p.water}" opacity=".7"/><path d="M-25 34q25 9 51 0" fill="none" stroke="${p.water}" opacity=".5"/></g></g>
      <path d="m63 23 19-8 18 7-19 9Z" fill="${p.trim}"/><path d="M63 23v13l18 9V31Zm18 8 19-9v14l-19 9Z" fill="${p.shade}"/>
      ${lamp(46,25,power,p)}${lamp(-49,34,power,p)}`;
  }

  function previewArt(itemId,x,y,scale,slot) {
    const shop=nodeShop||root.ShopArt;
    const svg=shop&&typeof shop.preview==='function'?shop.preview(itemId):'';
    if(!svg)return `<g data-skin-slots="${slot}" data-citadel-equipment="${itemId}" transform="translate(${x} ${y})">${star(0,-35,19,'#c9b9e8')}<ellipse rx="25" ry="7" fill="#b5a5ce"/></g>`;
    const geometry=slot==='relic'?`<g class="citadel-relic-size">${strip(svg)}</g>`:strip(svg);
    return `<g data-skin-slots="${slot}" data-citadel-equipment="${itemId}" class="citadel-equipped-art citadel-equipped-${slot}" transform="translate(${n(x-80*scale)} ${n(y-92*scale)}) scale(${scale})">${geometry}</g>`;
  }

  function player(equipment,p,state) {
    const quest=nodeQuest||root.QuestArt;
    const avatar=quest&&typeof quest.avatar==='function'?strip(quest.avatar('player',equipment.avatar,state.stage)):`<path d="M19 62 32 27 45 62Z" fill="${p.roof}"/><circle cx="32" cy="26" r="9" fill="#e0c4ae"/>`;
    const {position,direction}=state.route;
    return `<g data-skin-slots="avatar" data-citadel-equipment="${equipment.avatar}" class="citadel-player citadel-route-traveler" transform="translate(${n(position.x)} ${n(position.y)})"><ellipse cy="1" rx="15" ry="5" fill="#10213b" opacity=".45"/><g class="citadel-route-facing" transform="scale(${direction} 1)"><g class="citadel-route-walk"><path class="citadel-step-foot citadel-step-left" d="M-9 0h7" stroke="${p.trim}" stroke-width="3" stroke-linecap="round"/><path class="citadel-step-foot citadel-step-right" d="M3 0h7" stroke="${p.trim}" stroke-width="3" stroke-linecap="round"/><g transform="translate(-22 -49) scale(.69)">${avatar}</g></g></g></g>`;
  }

  function companionPosition(state) {
    const behind=routeFor(Math.max(0,state.percent-2.5)),lead=state.route.position;
    if(Math.hypot(lead.x-behind.position.x,lead.y-behind.position.y)<25)return {...behind,position:{x:lead.x-state.route.direction*30,y:lead.y+6}};
    return behind;
  }
  function actors(state,p) {
    const follower=companionPosition(state);
    return `<g class="citadel-route-actors" data-moving="${state.moving}">${state.equipped.companion==='companion-default'?'':`<g class="citadel-route-companion" transform="translate(${n(follower.position.x)} ${n(follower.position.y)})"><g class="citadel-route-facing" transform="scale(${follower.direction} 1)"><g class="citadel-companion-walk">${previewArt(state.equipped.companion,0,2,.44,'companion')}</g></g></g>`}${player(state.equipped,p,state)}</g>`;
  }

  function subjectConduits(state,p) {
    return `<g class="citadel-subject-conduits" aria-hidden="true">${state.subjects.map(subject=>{
      const path=`M${subject.x} ${subject.y-10}Q${n(subject.x*.52)} ${subject.y-17} 0 -28`;
      return `<g data-core-conduit="${subject.id}" style="--subject-energy:${n(subject.progress)}"><path d="${path}" fill="none" stroke="${p.rock}" stroke-width="6"/><path class="citadel-subject-flow" d="${path}" pathLength="100" fill="none" stroke="${subject.color}" stroke-width="1.6" stroke-dasharray="2 12" opacity="${n(.09+subject.progress*.7)}"/></g>`;
    }).join('')}</g>`;
  }

  function subjectShrines(state,p,back) {
    return state.subjects.filter((_,i)=>back?i<2:i>=2).map(subject=>`<g class="citadel-core-subject" data-core-subject="${subject.id}" data-subject-progress="${n(subject.progress)}" data-complete="${subject.complete}" transform="translate(${subject.x} ${subject.y})" style="--subject-color:${subject.color};--subject-energy:${n(subject.progress)}">
      <title>${subject.name}星印 · ${subject.complete?'已点亮':'随本科专注充能'}</title>
      <ellipse cy="6" rx="28" ry="10" fill="${p.rock}" opacity=".45"/>
      <path d="M-24-1 0-12 24-1 0 11Z" fill="${p.trim}"/><path d="M-24-1v7L0 17V11m0 0 24-12v7L0 17" fill="${p.shade}"/>
      <path d="M-12-5v-32L0-38l12 6v27L0 1Z" fill="${p.wall}"/><path d="M0-38v39l12-6v-27Z" fill="${p.shade}"/>
      <path class="citadel-subject-stem" d="M-6-8v-15m12 15v-15" stroke="${subject.color}" stroke-width="2" opacity="${n(.13+subject.progress*.75)}"/>
      <g transform="translate(0 -35)"><circle class="citadel-subject-aura" r="27" fill="${subject.color}" opacity="${n(.015+subject.progress*.1)}"/>
      <path d="M0-23 20-12 20 12 0 23-20 12v-24Z" fill="${p.rock}" stroke="${p.edge}" stroke-width="1.5"/>
      <circle r="16" fill="#172236" stroke="${p.shade}" stroke-width="2"/><circle class="citadel-subject-charge" r="16" pathLength="100" fill="none" stroke="${subject.color}" stroke-width="2.8" stroke-dasharray="100 100" stroke-dashoffset="${n(100*(1-subject.progress))}" transform="rotate(-90)"/>
      <text class="citadel-subject-glyph" y="5" text-anchor="middle" fill="${subject.color}" font-size="${subject.id==='english'?11:15}" opacity="${n(.38+subject.progress*.62)}">${subject.glyph}</text>
      <g class="citadel-subject-crown" ${subject.complete?'':'display="none"'}>${star(0,-29,5,subject.color)}<path d="M-11-25-17-20m28-5 6 5" stroke="${subject.color}" stroke-width="1.5"/></g></g>
    </g>`).join('');
  }

  function coreEngine(state,p) {
    return `<g class="citadel-heart-engine" data-core-stage="${state.stage}" style="--heart-energy:${n(state.progress)}" transform="translate(0 78)">
      <path d="M-92-23-60-10-52 12-20 36H20L52 12 60-10 92-23 56-18 27 5H-27L-56-18Z" fill="${p.roofShade}" stroke="${p.edge}" stroke-width="1"/>
      <path d="M-91-19-61-6-51 17m142-36L61-6 51 17M-26 30H26" fill="none" stroke="${p.trim}" stroke-width="2" opacity=".7"/>
      <path d="M-42-22 0-35 42-22 49 4 25 28H-25L-49 4Z" fill="${p.rock}" stroke="${p.trim}" stroke-width="2"/>
      <ellipse cy="-3" rx="37" ry="27" fill="#111e30" stroke="${p.edge}" stroke-width="1.5"/>
      <ellipse class="citadel-heart-aura" cy="-3" rx="31" ry="22" fill="${p.water}" opacity="${n(.025+state.progress*.14)}"/>
      <ellipse class="citadel-heart-charge" cy="-3" rx="31" ry="22" pathLength="100" fill="none" stroke="${p.light}" stroke-width="2.6" stroke-dasharray="100 100" stroke-dashoffset="${n(100*(1-state.progress))}"/>
      <g transform="translate(0 -3)"><g class="citadel-heart-rotor" fill="none" stroke="${p.water}" stroke-width="1.2" opacity=".75"><path d="M-21 0 0-17 21 0 0 17Z"/><path d="M-27 0H27M0-21V21"/><circle r="12"/></g>
      <path class="citadel-heart-gem" d="M0-14 10 0 0 14-10 0Z" fill="${p.light}" opacity="${n(.3+state.progress*.7)}"/><path d="M0-14v28L10 0Z" fill="${p.water}" opacity=".65"/></g>
      <g class="citadel-heart-vents" stroke="${p.water}" stroke-width="2" opacity="${n(.08+state.progress*.65)}"><path d="M-52-16-72-25M52-16 72-25M-21 33-15 44M21 33 15 44"/></g>
    </g>`;
  }

  function metalColor(stone,gold,progress) {
    const amount=Math.pow(progress,1.65);
    const parts=[1,3,5].map(i=>Math.round(parseInt(stone.slice(i,i+2),16)*(1-amount)+parseInt(gold.slice(i,i+2),16)*amount).toString(16).padStart(2,'0'));
    return '#'+parts.join('');
  }

  function plaza(state,p) {
    const metal=metalColor(p.shade,p.trim,state.progress),edge=metalColor(p.roofShade,p.light,state.progress);
    const tier=(level,art)=>`<g class="citadel-plaza-finery" data-plaza-tier="${level}" display="${state.stage>=level?'inline':'none'}">${art}</g>`;
    return `<g class="citadel-plaza-rings" data-plaza-stage="${state.stage}">
      <ellipse cy="-6" rx="85" ry="39" fill="${p.roofShade}"/><path d="M-84-18v11c0 23 168 23 168 0v-11" fill="${p.shade}"/>
      <ellipse cy="-18" rx="85" ry="37" fill="${p.top}"/><ellipse cy="-21" rx="73" ry="31" fill="${p.top}"/><path d="M-67-32v12c0 22 134 22 134 0v-12" fill="${p.roofShade}"/>
      <ellipse class="citadel-plaza-metal" cy="-32" rx="67" ry="28" fill="${metal}"/><ellipse cy="-33" rx="59" ry="23" fill="${p.top}"/>
      <path class="citadel-plaza-metal" d="M-34-8 0 5 34-8v7L0 12-34-1Zm-5 14L0 21 39 6v7L0 28-39 13Zm-5 15L0 38 44 21v7L0 46-44 28Z" fill="${metal}"/>
      <path d="M-34-1 0 12 34-1M-39 13 0 28 39 13M-44 28 0 46 44 28" fill="none" stroke="${p.roofShade}" stroke-width="3"/>
      <ellipse cy="-21" rx="77" ry="32" class="citadel-plaza-charge" fill="none" stroke="${edge}" stroke-width="1.7" opacity="${n(.1+state.progress*.7)}"/>
      ${tier(1,`<ellipse class="citadel-plaza-edge" cy="-32" rx="66" ry="27" fill="none" stroke="${edge}" stroke-width="1"/><path class="citadel-plaza-edge" d="M-32-6 0 7 32-6" fill="none" stroke="${edge}" stroke-width="1"/>`)}
      ${tier(2,`<ellipse cy="-33" rx="55" ry="21" fill="none" stroke="${p.trim}" stroke-width="1" stroke-dasharray="2 6"/><path d="M-37 8 0 23 37 8M-26 13-21 11m47 2-5-2" fill="none" stroke="${p.trim}" stroke-width="1.2"/>`)}
      ${tier(3,`<path d="M-42 23 0 40 42 23M-68-7q68 26 136 0" fill="none" stroke="${p.trim}" stroke-width="1.5"/>${[-1,1].map(side=>`<g transform="translate(${side*67} -12)"><path d="M0-6 5 0 0 6-5 0Z" fill="${p.water}" stroke="${p.trim}" stroke-width="1"/></g>`).join('')}`)}
      ${tier(4,`<ellipse class="citadel-plaza-halo" cy="-21" rx="82" ry="35" fill="none" stroke="${p.light}" stroke-width="1.3"/><path d="M-78-9q78 31 156 0M-40 30-27 30-19 36M40 30H27l-8 6" fill="none" stroke="${p.trim}" stroke-width="1.1"/>${star(0,39,4,p.light)}${[-52,-26,26,52].map(x=>star(x,-18+Math.sqrt(1-x*x/(67*67))*22,2.2,p.light)).join('')}`)}
    </g>`;
  }

  function core(p,power,theme,equipment,state) {
    return `<g class="citadel-sanctum">
      <path class="citadel-canal-bed" d="M-171-2q25 38 74 28t97 28 97-28 74-28" fill="none" stroke="${p.rock}" stroke-width="16"/>
      <path class="citadel-canal" d="M-171-2q25 38 74 28t97 28 97-28 74-28" pathLength="100" fill="none" stroke="${p.water}" stroke-width="9" opacity=".6"/><path class="citadel-water-current" d="M-171-2q25 38 74 28t97 28 97-28 74-28" pathLength="100" fill="none" stroke="${p.light}" stroke-width="1.2" stroke-dasharray="2 13" opacity=".6"/>
      <g class="citadel-garden">${tree(-169,-9,.72,p,theme)}${tree(-148,-34,.48,p,theme)}${tree(166,-7,.7,p,theme)}${tree(145,-35,.52,p,theme)}<path d="M-184 8-148 23m332-15-36 15" stroke="${p.leaf}" stroke-width="7" stroke-linecap="round" opacity=".45"/></g>
      <g class="citadel-sanctum-arch"><path d="M-92-28C-92-100-51-132 0-132S92-100 92-28" fill="none" stroke="${p.rock}" stroke-width="13"/><path d="M-92-28C-92-100-51-132 0-132S92-100 92-28" fill="none" stroke="${p.edge}" stroke-width="7"/>
      <path class="citadel-arch-charge" d="M-92-28C-92-100-51-132 0-132S92-100 92-28" pathLength="100" fill="none" stroke="${p.light}" stroke-width="2" stroke-dasharray="100 100" stroke-dashoffset="${n(100*(1-state.progress))}"/>
      ${[-1,1].map(side=>`<path d="M${side*98}-28h${-side*13}v-31h${side*13}Z" fill="${p.wall}"/><path d="M${side*102}-30h${-side*20}v7h${side*20}Z" fill="${p.trim}"/>`).join('')}
      <path d="M0-143 12-132 0-121-12-132Z" fill="${p.trim}"/><path d="M0-139 7-132 0-125-7-132Z" fill="${p.water}"/></g>
      ${coreEnergy(state,p)}${subjectConduits(state,p)}${subjectShrines(state,p,true)}
      ${plaza(state,p)}
      <g class="citadel-relic-power" style="--citadel-relic-glow:${n(.08+power*.62)};--citadel-relic-scale:${n(.88+power*.12)}"><ellipse cy="-39" rx="51" ry="18" fill="${p.light}" opacity="${n(.025+power*.07)}"/>${previewArt(equipment.relic,0,-33,1.33,'relic')}</g>
      ${subjectShrines(state,p,false)}${lamp(-166,26,power,p)}${lamp(164,26,power,p)}
      ${coreEngine(state,p)}
    </g>`;
  }

  function coreEnergy(state,p) {
    const colors=[p.water,p.edge,p.roof,p.trim];
    const ring=colors.map((color,index)=>{const path=arc(0,-20,146,68,-90+index*90+4,-90+(index+1)*90-4);return `<path d="${path}" fill="none" stroke="#17283e" stroke-width="8"/><path class="citadel-charge-arc" data-energy-index="${index}" d="${path}" pathLength="100" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="100 100" stroke-dashoffset="${n((1-clamp(state.progress*4-index))*100)}"/>`;}).join('');
    return `<g class="citadel-core-energy">${ring}
      <g class="citadel-core-tier" data-core-tier="1" ${state.stage<1?'display="none"':''}><path d="M-81-4v-43m162 43v-43" stroke="${p.trim}" stroke-width="2"/>${[-81,81].map(x=>`<g transform="translate(${x} -48)"><g class="citadel-sanctum-satellite"><path d="M0-12 8 0 0 12-8 0Z" fill="${p.water}" stroke="${p.light}" stroke-width="1"/>${star(0,0,3,p.light)}</g></g>`).join('')}</g>
      <g class="citadel-core-tier citadel-core-orbit" data-core-tier="2" ${state.stage<2?'display="none"':''}><ellipse cy="-80" rx="72" ry="22" fill="none" stroke="${p.trim}" stroke-width="1.7" transform="rotate(-15 0 -80)"/><ellipse class="citadel-sanctum-orbit-trace" cy="-80" rx="72" ry="22" pathLength="100" fill="none" stroke="${p.light}" stroke-width="3" stroke-dasharray="2 48" transform="rotate(-15 0 -80)"/></g>
      <g class="citadel-core-tier" data-core-tier="3" ${state.stage<3?'display="none"':''}><path d="M-20-35-27-125H27L20-35Z" fill="${p.water}" opacity=".09"/><ellipse cy="-69" rx="63" ry="24" fill="none" stroke="${p.water}" stroke-width="1.4" transform="rotate(19 0 -69)"/><path class="citadel-sanctum-stardust" d="M-15-61v-5m30-18v-5M-7-102v-4M8-48v-4" stroke="${p.light}" stroke-width="2.5" stroke-linecap="round"/></g>
      <g class="citadel-core-tier" data-core-tier="4" ${state.stage<4?'display="none"':''}><g transform="translate(0 18)"><path d="M-23-133-28-151-12-143 0-156 12-143 28-151 23-133Z" fill="${p.trim}"/>${star(0,-142,6,p.light)}</g><ellipse class="citadel-sanctum-corona" cy="-20" rx="161" ry="76" pathLength="100" fill="none" stroke="${p.trim}" stroke-width="1.4" stroke-dasharray="1 4" opacity=".7"/></g>
      </g>`;
  }

  function gate(p,power,theme,equipment) {
    const portal=equipment.portal==='portal-default'?`<g data-skin-slots="portal" data-citadel-equipment="portal-default"><path d="M-38 13v-78q38-36 76 0v78Z" fill="#25354c"/><path d="M-30 10v-70q30-27 60 0v70Z" fill="${p.water}" opacity="${n(.055+power*.11)}"/><path d="M-28-35H28M-28-20H28M-28-5H28M-14-55V10M0-60V10M14-55V10" stroke="${p.edge}" stroke-width="1" opacity="${n(.5*(1-power))}"/>${star(0,-30,15,p.light,`class="citadel-gate-star" opacity="${n(power)}"`)}</g>`:previewArt(equipment.portal,0,20,1.12,'portal');
    return `<path d="m-67 21 59-29 69 24-60 29Z" fill="${p.edge}"/><path d="m-67 21v10l68 25 60-29V16L1 45Z" fill="${p.shade}"/>
      <path d="M-53 17V-72q52-58 106 0v89" fill="none" stroke="${p.wall}" stroke-width="14"/><path d="M-55 11V-74q55-56 110 0V9" fill="none" stroke="${p.trim}" stroke-width="3"/>
      <path d="M-66-6h26v12h-26Zm106 0h26v12H40ZM-62-50h18v8h-18Zm106 0h18v8H44Z" fill="${p.roofShade}"/>
      ${portal}${roofMark(0,-103,p,theme)}<path d="M-79 5v-58M79 5v-58" fill="none" stroke="${p.trim}" stroke-width="2"/><path d="m-79-52 22 6-22 9Zm158 0 22 6-22 9Z" fill="${p.roof}"/>
      ${lamp(-82,28,power,p)}${lamp(83,28,power,p)}`;
  }

  function interactionEffect(place,p) {
    let geometry='';
    if(place.id==='dock')geometry=`<path class="citadel-launch-trail" d="M37-17q32-14 59-42" pathLength="100" fill="none" stroke="${p.light}" stroke-width="1.4" stroke-dasharray="2 7"/><g transform="translate(39 -24)"><g class="citadel-paperboat-launch"><path d="m-14 1 13-5 19 7-12 7H-6Z" fill="${p.trim}"/><path d="M-1-4V-23L-14 1Zm3 0 13 4L2-16Z" fill="${p.wall}"/><path d="m-1-23 0 19-13 5Z" fill="${p.water}"/><path d="M-8 15h14" stroke="${p.light}" stroke-width="1" opacity=".55"/></g></g>`;
    if(place.id==='core')geometry=`<g class="citadel-core-waves" fill="none" stroke="${p.light}" stroke-width="1.5"><ellipse class="citadel-core-wave" cy="-24" rx="73" ry="31"/><ellipse class="citadel-core-wave citadel-wave-second" cy="-24" rx="73" ry="31"/></g>${[-41,-13,23,43].map((x,i)=>star(x,-97-i%2*21,3,p.light,`class="citadel-crystal-mote" style="--citadel-pulse-delay:${i*.13}s"`)).join('')}`;
    if(place.id==='workshop')geometry=`<g fill="none" stroke="${p.light}" stroke-width="1.6"><path class="citadel-workshop-circuit" d="M-94 3h-13v-24h14m139 40h19v-11h29v-24M-55 26h18l10-6" pathLength="100"/><circle class="citadel-circuit-node" cx="-107" cy="-21" r="3"/><circle class="citadel-circuit-node" cx="94" cy="-16" r="3"/><circle class="citadel-circuit-node" cx="-27" cy="20" r="3"/></g><g transform="translate(70 -36)"><circle class="citadel-workshop-ring" r="26" fill="none" stroke="${p.water}" stroke-width="1" stroke-dasharray="4 6"/></g>`;
    if(place.id==='archive')geometry=`<g transform="translate(0 -118)"><g class="citadel-open-pages"><path d="M-25 1q12-11 25-4 13-13 26-8v25q-15-3-26 8-13-6-25 3Z" fill="${p.trim}"/><path d="M0-3v25m-17-17 11-4m-11 10 11-3m13-4 12-6m-12 13 12-6" fill="none" stroke="${p.roofShade}" stroke-width="1.4"/></g></g><g class="citadel-page-words" fill="${p.light}" font-family="serif" font-size="12" text-anchor="middle"><text class="citadel-page-word" x="-44" y="-127">知</text><text class="citadel-page-word" x="45" y="-128" style="--citadel-pulse-delay:.16s">✧</text><text class="citadel-page-word" x="20" y="-143" style="--citadel-pulse-delay:.28s">阅</text></g>`;
    if(place.id==='observatory')geometry=`<g transform="translate(-1 -76)"><g class="citadel-unfold-orbits" fill="none" stroke="${p.light}" stroke-width="1.2"><ellipse rx="76" ry="31" transform="rotate(-24)"/><ellipse rx="48" ry="72" transform="rotate(37)"/><path d="m-72 5 27-42 52-17 57 32" stroke-dasharray="2 6"/><g fill="${p.light}" stroke="none"><circle cx="-69" cy="17" r="3"/><circle cx="40" cy="-41" r="3"/><circle cx="62" cy="-27" r="2"/></g></g></g>${star(-70,-116,4,p.light,'class="citadel-orbit-star"')}${star(56,-137,3,p.light,'class="citadel-orbit-star"')}`;
    if(place.id==='gate')geometry=`<g transform="translate(0 -36)"><g class="citadel-gate-waves" fill="none" stroke="${p.light}" stroke-width="1.5"><ellipse class="citadel-gate-ring" rx="35" ry="48"/><ellipse class="citadel-gate-ring citadel-ring-second" rx="35" ry="48"/></g><g class="citadel-gate-motes" fill="${p.light}">${[[-22,31],[-4,20],[18,34],[-13,-8],[18,-24],[1,-41]].map(([x,y],i)=>`<circle class="citadel-gate-mote" cx="${x}" cy="${y}" r="${i%2?2:2.6}" style="--citadel-pulse-delay:${i*.12}s"/>`).join('')}</g></g>`;
    return `<g class="citadel-interaction" data-citadel-effect="${place.id}" opacity="0" pointer-events="none" aria-hidden="true">${geometry}</g>`;
  }

  function construction(place,p) {
    const silhouette=place.id==='workshop'?'M-74 12V-60l53-57 71 49V12M46-3V-91l23-14 25 11V12':place.id==='archive'?'M-80 12V-59l74-63 92 59V12M-2-29V38':place.id==='observatory'?'M-58 12V-48q-1-53 54-66 56 12 60 60V12M-4-114V15':'M-53 17V-72q52-58 106 0v89M-38 13v-78q38-36 76 0v78';
    return `<g class="citadel-construction" aria-hidden="true"><path d="m-79 9 72-29 84 25-70 33Z" fill="${p.shade}"/><path d="m-79 9v13L7 50l70-31V5L7 38Z" fill="${p.rock}"/><g class="citadel-blueprint" fill="none" stroke="${p.edge}" stroke-width="1.3" stroke-dasharray="4 5" opacity=".48"><path d="${silhouette}"/></g><g class="citadel-scaffold" fill="none" stroke="${p.trim}" stroke-width="2.2"><path d="M-81 12V-50M79 13V-51M-80-36H79M-80-10H79m-159 0 44-26m-4 26 44-26m-4 26 44-26m-43 26v-26" opacity=".55"/></g><g class="citadel-foundation-blocks" fill="${p.wall}"><path d="m-70 8 24-10 22 7-24 11Z"/><path d="m-70 8v13l22 8V16l24-11v13l-24 11" fill="${p.shade}"/><path d="m31 10 23-10 20 7-22 11Z"/><path d="M31 10v13l21 8V18L74 7v13L52 31" fill="${p.shade}"/></g><g transform="translate(0 5)"><path d="M-19-1h38v23h-38Z" fill="${p.roofShade}" stroke="${p.edge}"/><path d="m-16 2 32 17m0-17-32 17" stroke="${p.trim}" opacity=".55"/></g><text x="0" y="-58" text-anchor="middle" font-size="12" fill="${p.light}">待建 · ${place.threshold*100}%</text></g>`;
  }

  // Keep actual masonry, walls and roofs separate so a milestone assembles the city.
  function buildingLayers(geometry,id) {
    const parts=[];let depth=0,start=0;
    for(const match of geometry.matchAll(/<\/?[a-zA-Z][^>]*>/g)) {
      const tag=match[0];
      if(tag.startsWith('</'))depth--;
      else {if(depth===0)start=match.index;if(!tag.endsWith('/>'))depth++;}
      if(depth===0)parts.push(geometry.slice(start,match.index+tag.length));
    }
    const spans={workshop:[1,3,6],archive:[3,5,8],observatory:[3,5,9],gate:[2,4,5]}[id];
    if(!spans)return geometry;
    const [base,body,crown]=spans;
    return `<g class="citadel-assembly-base">${parts.slice(0,base).join('')}</g><g class="citadel-assembly-wall">${parts.slice(base,body).join('')}</g><g class="citadel-assembly-crown">${parts.slice(body,crown).join('')}</g><g class="citadel-assembly-detail">${parts.slice(crown).join('')}</g>`;
  }

  function awakeningEffect(place,p) {
    const height=place.id==='archive'?145:189;
    return `<g class="citadel-awakening-effect" pointer-events="none" aria-hidden="true"><g class="citadel-awakening-beam"><path d="M-43 13-22-${height}H22L43 13Z" fill="${p.water}" opacity=".2"/><path d="M-12 13-6-${height}H6L12 13Z" fill="${p.light}" opacity=".45"/></g><ellipse class="citadel-awakening-wave" cy="13" rx="70" ry="25" fill="none" stroke="${p.light}" stroke-width="2"/><ellipse class="citadel-awakening-wave citadel-awakening-wave-second" cy="13" rx="70" ry="25" fill="none" stroke="${p.water}" stroke-width="2"/>${[-78,-40,37,79].map((x,i)=>`<g class="citadel-assembly-spark" style="--citadel-assembly-delay:${.25+i*.16}s">${star(x,-37-(i%2)*33,5,p.light)}</g>`).join('')}</g>`;
  }

  function scenePlace(place,state,p) {
    const power=charge(place,state.progress),unlocked=state.progress>=place.threshold;
    const geometry=place.id==='core'?core(p,power,state.theme,state.equipped,state):place.id==='gate'?gate(p,power,state.theme,state.equipped):({dock,workshop,archive,observatory})[place.id](p,power,state.theme);
    const rx=place.id==='core'?194:place.id==='dock'?133:place.id==='archive'?128:place.id==='workshop'?116:104;
    const depth=place.id==='core'?146:place.id==='dock'?88:98;
    const title=`${place.name} · ${unlocked?'已开放':`每日进度 ${place.threshold*100}% 开放`}`;
    const interactive=state.interactive?' citadel-place-interactive':'';
    const hit=place.id==='core'?[-5,123]:place.id==='gate'?[-7,116]:place.id==='dock'?[-8,108]:[-28,place.ry];
    const awakening=state.awakening&&state.awakening.id===place.id&&unlocked;
    const number=place.threshold?String(place.threshold*4).padStart(2,'0'):null;
    return `<g class="citadel-place${interactive}${state.selected===place.id?' is-selected':''}${state.pulse===place.id?' is-pulsing':''}${awakening?' is-awakening':''}" data-citadel-place="${place.id}" data-threshold="${place.threshold}" data-unlocked="${unlocked}" data-charge="${n(power)}" style="--citadel-charge:${n(power)}"${awakening?` data-awakening-token="${state.awakening.token}"`:''}${state.interactive?` role="button" tabindex="0" aria-label="${title}" aria-pressed="${state.selected===place.id}"`:''} transform="translate(${place.x} ${place.y})"><title>${title}</title>${state.interactive?`<ellipse class="citadel-hit-area" cx="0" cy="${hit[0]}" rx="${place.rx}" ry="${hit[1]}" fill="transparent" stroke="none"/>`:''}
      <g class="citadel-district-float">${foundation(rx,depth,p,power,state.theme)}<ellipse class="citadel-place-focus" cy="3" rx="${rx+5}" ry="54" fill="none" stroke="${p.light}" stroke-width="2" opacity="0"/>
      ${!unlocked?construction(place,p):''}<g class="citadel-buildings"${unlocked?'':' display="none"'}>${buildingLayers(geometry,place.id)}</g>${interactionEffect(place,p)}${awakening?awakeningEffect(place,p):''}<g class="citadel-place-label" transform="translate(0 ${place.labelY})"><path d="M-48 4h-12m108 0h12" stroke="${p.edge}" stroke-width="1" opacity=".65"/><text x="0" y="7" text-anchor="middle" fill="${p.light}" font-size="12">${place.name}</text>${number?`<text class="citadel-milestone-label" x="0" y="27" text-anchor="middle" fill="${p.trim}" font-size="11">${number} · ${place.threshold*100}%</text>`:place.id==='dock'?`<text x="0" y="26" text-anchor="middle" fill="${p.edge}" font-size="11">旅程起点</text>`:star(0,21,2.5,p.light)}</g></g></g>`;
  }

  function atmosphere(state,p) {
    const effect=state.equipped.fx.slice(3),coordinates=[[101,180],[193,101],[681,71],[789,155],[1091,175],[1051,450],[105,447],[139,629],[559,613],[724,642],[1078,643],[351,170],[757,401],[622,254]];
    if(effect==='nebula')return `<g class="citadel-equipped-fx citadel-fx-nebula" data-skin-slots="fx" data-citadel-equipment="${state.equipped.fx}" opacity=".16"><ellipse cx="270" cy="240" rx="195" ry="32" fill="#c2a0de" transform="rotate(-25 270 240)"/><ellipse cx="819" cy="554" rx="244" ry="30" fill="#89c8d1" transform="rotate(-18 819 554)"/><ellipse cx="813" cy="108" rx="148" ry="21" fill="#b9a4dc" transform="rotate(-13 813 108)"/></g>`;
    return `<g class="citadel-equipped-fx" data-skin-slots="fx" data-citadel-equipment="${state.equipped.fx}">${coordinates.map(([x,y],index)=>{
      const extra=`class="citadel-fx-particle" data-effect="${effect}" style="--citadel-delay:-${index*.7}s"`;
      if(effect==='fireflies')return `<g ${extra}><circle cx="${x}" cy="${y}" r="10" fill="#dde8ae" opacity=".07"/><circle cx="${x}" cy="${y}" r="2.5" fill="#dce5b3" opacity=".8"/></g>`;
      if(effect==='petals')return `<path ${extra} d="m${x-4} ${y+2}q-2-12 8-10 8 9-8 10Z" fill="#e4bdcf" opacity=".65"/>`;
      if(effect==='snow')return `<g ${extra} transform="translate(${x} ${y})" fill="none" stroke="#d2e5e8" stroke-width="1" opacity=".55"><path d="M-5 0H5M0-5V5m-4-9 8 8m0-8-8 8"/></g>`;
      if(effect==='meteor')return index%3?'':`<g ${extra}><path d="m${x} ${y} 52-26" stroke="#a7bcd4" stroke-width="2" opacity=".25"/><path d="m${x} ${y} 24-12" stroke="#d9dbe7" stroke-width="1.5" opacity=".65"/>${star(x,y,3,p.light)}</g>`;
      return star(x,y,index%3===0?3:1.5,p.light,`${extra} opacity=".45"`);
    }).join('')}</g>`;
  }

  function sky(state,p) {
    let accents='';
    if(state.theme==='forest')accents=`<g opacity=".18">${tree(102,334,1.2,p,'forest')}${tree(1115,360,1.5,p,'forest')}<path d="M63 486q59-51 62-146M1085 511q55-69 57-143" fill="none" stroke="${p.leaf}" stroke-width="2"/></g>`;
    if(state.theme==='ocean')accents=`<g fill="none" stroke="${p.water}" opacity=".16"><path d="M72 385q58-20 117 0t117 0M726 660q100-22 218 0t192 0" stroke-width="2"/><circle cx="1102" cy="241" r="13"/><circle cx="1122" cy="212" r="6"/><circle cx="100" cy="393" r="9"/></g>`;
    if(state.theme==='sakura')accents=`<g opacity=".23">${tree(100,311,1.4,p,'sakura')}${tree(1095,421,1.7,p,'sakura')}<path d="M212 70q-9-17 7-15 10 11-7 15Zm785 586q-7-17 7-13 10 11-7 13Z" fill="${p.leaf}"/></g>`;
    if(state.theme==='aurora')accents=`<g class="citadel-aurora-curtain" fill="none" opacity=".16"><path d="M70 163Q332-38 564 88T1142 76" stroke="#85ceaf" stroke-width="24"/><path d="M62 185Q325-12 566 107t575-10" stroke="#c2a6dc" stroke-width="10"/><path d="M96 146Q340-23 558 82t519-8" stroke="#b6e2d4" stroke-width="3"/></g>`;
    return `<g class="citadel-environment" data-skin-slots="theme fx" data-citadel-equipment="${state.equipped.theme}"><rect width="1200" height="720" rx="25" fill="${p.sky}" stroke="none"/><ellipse cx="588" cy="373" rx="503" ry="272" fill="${p.haze}" opacity=".06"/><ellipse cx="588" cy="373" rx="528" ry="291" fill="none" stroke="${p.edge}" stroke-width="1" stroke-dasharray="2 15" opacity=".1"/><path d="M66 638Q596 740 1142 597M83 197Q497-39 1093 146" fill="none" stroke="${p.edge}" opacity=".06"/>
      <circle cx="1062" cy="93" r="39" fill="${p.light}" opacity=".035"/><circle cx="1062" cy="93" r="25" fill="${p.light}" opacity=".08"/><path d="M1076 73q-30 7-17 40-31-14-9-39 12-9 26-1Z" fill="${p.light}" opacity=".5"/>
      <g class="citadel-distance-isles" opacity=".25"><path d="m74 542 39-19 47 17-33 14-16 45-22-43Z" fill="${p.rock}"/><path d="m74 542 39-19 47 17-42 16Z" fill="${p.top}"/><path d="m964 171 27-14 39 10-15 21-15 32-13-26Z" fill="${p.rock}"/><path d="m964 171 27-14 39 10-27 14Z" fill="${p.top}"/><path d="m695 197 27-13 40 10-18 16-16 30-13-28Z" fill="${p.top}"/></g>
      <g class="citadel-clouds" fill="${p.edge}" opacity=".065"><path d="M89 243q21-34 43-18 12-36 40-15 30-8 47 35H89ZM737 118q17-29 44-13 11-28 33-17 24-7 39 30H737ZM886 662q19-29 41-15 14-31 39-12 23-4 42 28H886Z"/></g>${accents}
      <g fill="none" stroke="${p.edge}" opacity=".32" stroke-width="1.3"><path d="M148 126q8-12 17 0m-4-1q7-10 15 0M738 292q6-10 13 0m-4-1q6-9 12 0M715 621q9-13 17 0m-4-1q7-10 15 0"/></g></g>`;
  }

  function cityAwakening(state,p) {
    if(!state.awakening||state.progress<places.find(place=>place.id===state.awakening.id).threshold)return '';
    return `<g class="citadel-city-awakening" pointer-events="none" aria-hidden="true">${[[116,266],[385,155],[764,118],[1110,326],[398,628],[744,620],[77,511],[1068,543]].map(([x,y],i)=>`<g class="citadel-city-spark" style="--citadel-assembly-delay:${.15+i*.15}s">${star(x,y,i%2?6:9,p.light)}</g>`).join('')}</g>`;
  }

  function scene(model,equipment,options={}) {
    const state=normalize(model,equipment,options),p=palettes[state.theme];
    return `<svg class="citadel-art" viewBox="0 0 1200 720" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none" style="stroke:none" data-interactive="${state.interactive}" data-citadel-theme="${state.theme}" data-citadel-progress="${n(state.progress)}" data-citadel-percent="${n(state.percent)}" data-citadel-stage="${state.stage}" data-moving="${state.moving}" data-arriving="${state.arriving}"${state.interactive?' role="group" aria-label="星辉城内部地图"':' aria-hidden="true" focusable="false"'}><title>星辉城：从启程码头出发，沿光桥依次建起工坊、书库、观测台与远征之门。</title>${sky(state,p)}${routeGeometry(state,p)}${places.map(place=>scenePlace(place,state,p)).join('')}${actors(state,p)}${atmosphere(state,p)}${cityAwakening(state,p)}</svg>`;
  }

  function updateProgress(svgElement,model) {
    if(!svgElement||typeof svgElement.querySelector!=='function')return null;
    const state=normalize(model,{},{}),route=state.route;
    const attr=(element,name,value)=>{if(element&&element.getAttribute(name)!==String(value))element.setAttribute(name,String(value));};
    const all=selector=>Array.from(svgElement.querySelectorAll(selector));
    attr(svgElement,'data-citadel-progress',n(state.progress));attr(svgElement,'data-citadel-percent',n(state.percent));attr(svgElement,'data-citadel-stage',state.stage);attr(svgElement,'data-moving',state.moving);
    const move=(selector,position,direction)=>{const actor=svgElement.querySelector(selector);if(!actor)return;attr(actor,'transform',`translate(${n(position.x)} ${n(position.y)})`);attr(actor.querySelector('.citadel-route-facing'),'transform',`scale(${direction} 1)`);};
    move('.citadel-route-traveler',route.position,route.direction);
    const follower=companionPosition(state);move('.citadel-route-companion',follower.position,follower.direction);
    attr(svgElement.querySelector('.citadel-route-actors'),'data-moving',state.moving);
    all('.citadel-route-travelled').forEach(el=>attr(el,'stroke-dashoffset',n((1-clamp(state.progress*4-Number(el.getAttribute('data-route-index'))))*100)));
    all('.citadel-charge-arc').forEach(el=>attr(el,'stroke-dashoffset',n((1-clamp(state.progress*4-Number(el.getAttribute('data-energy-index'))))*100)));
    all('.citadel-core-tier').forEach(el=>attr(el,'display',state.stage>=Number(el.getAttribute('data-core-tier'))?'inline':'none'));
    attr(svgElement.querySelector('.citadel-arch-charge'),'stroke-dashoffset',n(100*(1-state.progress)));
    const engine=svgElement.querySelector('.citadel-heart-engine');
    if(engine){attr(engine,'data-core-stage',state.stage);engine.style.setProperty('--heart-energy',n(state.progress));}
    attr(svgElement.querySelector('.citadel-heart-charge'),'stroke-dashoffset',n(100*(1-state.progress)));
    attr(svgElement.querySelector('.citadel-heart-aura'),'opacity',n(.025+state.progress*.14));
    attr(svgElement.querySelector('.citadel-heart-gem'),'opacity',n(.3+state.progress*.7));
    attr(svgElement.querySelector('.citadel-heart-vents'),'opacity',n(.08+state.progress*.65));
    for(const subject of state.subjects){
      const shrine=svgElement.querySelector(`[data-core-subject="${subject.id}"]`);
      if(shrine){
        attr(shrine,'data-subject-progress',n(subject.progress));attr(shrine,'data-complete',subject.complete);shrine.style.setProperty('--subject-energy',n(subject.progress));
        attr(shrine.querySelector('.citadel-subject-charge'),'stroke-dashoffset',n(100*(1-subject.progress)));
        attr(shrine.querySelector('.citadel-subject-stem'),'opacity',n(.13+subject.progress*.75));
        attr(shrine.querySelector('.citadel-subject-aura'),'opacity',n(.015+subject.progress*.1));
        attr(shrine.querySelector('.citadel-subject-glyph'),'opacity',n(.38+subject.progress*.62));
        attr(shrine.querySelector('.citadel-subject-crown'),'display',subject.complete?'inline':'none');
        const title=shrine.querySelector('title'),copy=`${subject.name}星印 · ${subject.complete?'已点亮':'随本科专注充能'}`;
        if(title&&title.textContent!==copy)title.textContent=copy;
      }
      const conduit=svgElement.querySelector(`[data-core-conduit="${subject.id}"]`);
      if(conduit){conduit.style.setProperty('--subject-energy',n(subject.progress));attr(conduit.querySelector('.citadel-subject-flow'),'opacity',n(.09+subject.progress*.7));}
    }
    for(const place of places) {
      const el=svgElement.querySelector(`[data-citadel-place="${place.id}"]`);if(!el)continue;
      const power=charge(place,state.progress);attr(el,'data-charge',n(power));el.style.setProperty('--citadel-charge',n(power));
      const edge=el.querySelector('.citadel-edge-current');attr(edge,'stroke-dashoffset',n(100*(1-power)));attr(edge,'opacity',n(.12+power*.5));
      el.querySelectorAll('.citadel-lamp-light').forEach(lamp=>attr(lamp,'opacity',n(.14+power*.86)));
      el.querySelectorAll('.citadel-light-halo').forEach(halo=>attr(halo,'opacity',n(power*.08)));
    }
    const power=.25+state.progress*.75,relic=svgElement.querySelector('.citadel-relic-power');
    if(relic){relic.style.setProperty('--citadel-relic-glow',n(.08+power*.62));relic.style.setProperty('--citadel-relic-scale',n(.88+power*.12));}
    const theme=svgElement.getAttribute('data-citadel-theme'),p=Object.prototype.hasOwnProperty.call(palettes,theme)?palettes[theme]:palettes.default;
    const metal=metalColor(p.shade,p.trim,state.progress),edge=metalColor(p.roofShade,p.light,state.progress);
    attr(svgElement.querySelector('.citadel-plaza-rings'),'data-plaza-stage',state.stage);
    all('.citadel-plaza-metal').forEach(el=>attr(el,'fill',metal));
    all('.citadel-plaza-edge').forEach(el=>attr(el,'stroke',edge));
    all('.citadel-plaza-finery').forEach(el=>attr(el,'display',state.stage>=Number(el.getAttribute('data-plaza-tier'))?'inline':'none'));
    attr(svgElement.querySelector('.citadel-plaza-charge'),'stroke',edge);attr(svgElement.querySelector('.citadel-plaza-charge'),'opacity',n(.1+state.progress*.7));
    attr(svgElement.querySelector('.quest-player-growth'),'data-avatar-stage',state.stage);
    all('[data-avatar-tier]').forEach(el=>attr(el,'display',state.stage>=Number(el.getAttribute('data-avatar-tier'))?'inline':'none'));
    return route;
  }

  return {scene,updateProgress};
});
