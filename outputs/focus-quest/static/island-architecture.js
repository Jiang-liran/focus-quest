(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./subject-island-styles.js'):root.FocusSubjectIslandStyles);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusIslandArchitecture=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(individual){
  'use strict';
  // Optional campuses keep their ownership while each new day rebuilds their
  // physical structure and charges four milestones from that subject’s progress.
  const inventory=Object.freeze({
    ...(individual?.inventory||{}),
    archipelago:Object.freeze([
      {id:'archipelago-default',name:'初旅四岛'},
      {id:'archipelago-harbor',name:'雨港学院 · 四岛'},
      {id:'archipelago-starglass',name:'星穹学宫 · 四岛'},
    ].map(Object.freeze)),
    homeland:Object.freeze([
      {id:'homeland-default',name:'初旅主岛'},
      {id:'homeland-harbor',name:'雨港学院 · 主岛'},
      {id:'homeland-starglass',name:'星穹学宫 · 主岛'},
    ].map(Object.freeze)),
  });
  const subjects=['math','cs','politics','english'];
  const info={
    harbor:{
      math:{name:'航图观测院',description:'铜绿穹顶、航海仪与石阶院落。数学的专注会依次点亮观测窗。'},
      cs:{name:'潮汐机巧坊',description:'水轮带着机轴缓缓转动，锯齿屋顶下是温暖的机巧工坊。'},
      politics:{name:'海风议事厅',description:'石柱围出安静的议事庭，书卷纹章与廊灯陪着思考。'},
      english:{name:'灯语航港',description:'小舟、航海书库与信号灯塔相连，新的语言在港湾亮起。'},
    },
    starglass:{
      math:{name:'星象穹顶馆',description:'透明棱面穹顶包住星象仪，细窄的光沿观测环缓缓流转。'},
      cs:{name:'晶格演算院',description:'双塔由玻璃连廊连接，演算回路随专注点亮。'},
      politics:{name:'群星议会庭',description:'环形柱廊托起玻璃天幕，一册展开的书是庭院的中心。'},
      english:{name:'译光帆书港',description:'帆形书馆与晶光灯塔临水而立，玻璃栈桥通向小舟。'},
    },
  };
  const palettes={
    harbor:{stone:'#c8c5ad',side:'#8b9e9e',shade:'#617881',roof:'#5b9297',roofLight:'#87b4ad',edge:'#c8d7bf',water:'#426c7b',ink:'#314e62',light:'#f2d79e',rock:'#3e5264'},
    starglass:{stone:'#b9c7d9',side:'#778eac',shade:'#4f668e',roof:'#8099c6',roofLight:'#b8d5e3',edge:'#d0dcf1',water:'#4b6586',ink:'#354666',light:'#e5dbaf',rock:'#38455f'},
  };
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=value=>Math.round(value*1000)/1000;
  function has(id,slot){return slot===undefined?Object.values(inventory).some(items=>items.some(item=>item.id===id)):Boolean(inventory[slot]?.some(item=>item.id===id));}
  function suite(id,slot){return has(id,slot)&&!id.endsWith('-default')?id.slice(slot.length+1):null;}
  function subjectInfo(id,subjectId){if(individual?.has(id))return individual.subjectInfo(id,subjectId);const kind=suite(id,'archipelago');return kind&&subjects.includes(subjectId)?{...info[kind][subjectId]}:null;}
  const path=(d,fill,extra='')=>`<path d="${d}" fill="${fill}" ${extra}/>`;
  const line=(d,color,width=1,extra='')=>path(d,'none',`stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}`);
  const group=(content,x=0,y=0,scale=1,extra='')=>`<g transform="translate(${x} ${y}) scale(${scale})" ${extra}>${content}</g>`;
  function windowAt(x,y,p,width=7,height=12){return `<g class="island-campus-window"><path d="M${x} ${y}v${height}l${width} 3v-${height}Z" fill="${p.ink}"/>${path(`M${x+1} ${y+2}v${height-3}l${width-2} 2v-${height-3}Z`,p.light,'class="island-campus-lit"')}${line(`M${x+width/2} ${y+2}v${height-2}`,p.shade,.8)}</g>`;}
  function windows(xs,y,p){return xs.map(x=>windowAt(x,y,p)).join('');}
  function block(x,y,width,height,p,roof=p.roof){
    const d=width*.35;
    return group(path(`M0 0V-${height}l${width} 12V12Z`,p.stone)+path(`M${width} 12V${12-height}l${d}-${d}V${12-d}Z`,p.side)+path(`M0-${height}l${d}-${d} ${width} 12-${d} ${d}Z`,roof)+line(`M0-${height}l${width} 12 ${d}-${d}`,p.edge,1.3),x,y);
  }
  function shrub(x,y,p){return group(path('M-5 4V-2L0-8 7-1 8 5 1 8Z',p.roof)+path('M0-8 7-1 1 3-5-2Z',p.roofLight),x,y);}
  function pier(p){return part(1,'pier',path('M-88 19-14-6 90 24 22 51Z',p.stone)+path('M-88 19v6L22 58 90 31v-7L22 51Z',p.side)+line('M-65 28 5 6M-46 34 25 12M-24 40 46 18M-3 46 65 24',p.shade,.8,'opacity=".45"'));}
  function terrain(kind,p){
    const harbor=kind==='harbor';
    return `<g class="island-campus-terrain">${path('M-113 9-74-16 21-26 113 8 95 49 57 68 25 112-19 91-59 85-92 51Z',p.rock)}${path('M-113 9-56 28-17 46-19 91-59 85-92 51Z',p.ink)}${path('M-17 46 52 30 113 8 95 49 57 68 25 112Z',p.shade)}${path('M-113 9-74-16 21-26 113 8 69 36-21 49-77 32Z',p.water)}${path('M-107 5-72-17 20-26 105 7 68 29-21 44-75 27Z',p.stone)}${path('M-89 9-66-6 9-14 82 7 57 21-18 34Z',harbor?'#a9b5a3':'#819bb7')}${line('M-111 9-76 32-21 49 69 36 111 9',p.edge,2)}${line('M-107 17-78 36-21 54 66 42',p.side,2)}${harbor?path('M-78 11-53 2 65 22 48 29Z',p.water)+line('M-70 13-51 6 56 25','#8bb7bd',1.1,'class="island-campus-water"'):line('M-95 11-70-3 11-13 88 8 60 25-18 40-70 25Z',p.roofLight,1.2)+line('M-31 44-15 69 25 99 53 62',p.roofLight,1,'opacity=".4"')}${[-61,-25,14,53].map((x,i)=>path(`M${x} ${38+(i===0?0:8)}l5 2-2 15-4-3Z`,p.roofLight,'opacity=".28"')).join('')}</g>`;
  }
  const {house,dome,orbit,wheel,bridge,pavilion,boat,buildCampus,part,finish}=individual.geometry;
  function harborMath(p){return `${pier(p)}${house(-48,-4,58,32,46,p,{columns:3})}${dome(-48,-4,58,32,46,p,37)}${orbit(-77,-42,p,18)}${finish(line('M-77-26V1m-7 1h14',p.side,2)+group(path('M-9 5 20-14l5 8L-3 12Z',p.stone)+line('M7 4V32m-5 0h10',p.edge,2),39,-24)+shrub(77,8,p))}`;}
  function harborCs(p){return `${pier(p)}${house(50,-3,16,19,78,p,{rows:3,columns:1,door:false,rise:9,buildStep:3})}${house(-57,-6,67,32,48,p,{columns:4,rise:17,saw:true})}${wheel(-64,0,p)}${finish(line('M-47-1h15v-15h14',p.side,2.4))}${house(61,13,16,12,12,p,{columns:0,door:false,buildStep:4,roofStep:4})}${finish(shrub(85,3,p))}`;}
  function harborPolitics(p){return `${pier(p)}${pavilion(-52,-2,74,33,47,p)}${finish(group(path('M-15-5Q-7-11 0-5q7-6 15 0V9Q7 3 0 9q-8-6-15 0Z',p.light)+line('M0-5V9',p.side,1),-15,-41,.55)+shrub(-87,0,p)+shrub(82,8,p))}`;}
  function harborEnglish(p){return `${pier(p)}${house(37,3,18,22,76,p,{rows:3,columns:1,door:false,rise:14,buildStep:3})}${house(-64,-3,45,28,37,p,{columns:3,rise:21})}${boat(83,14,p)}${part(1,'pier-rails',line('M-68 15-23 30m-41-18v11m14-7v12m14-8v12',p.edge,1.6))}${finish(shrub(-87,3,p))}`;}
  function glassDome(p,cx,cy,scale=1){
    return group(path('M-48 0-35-34 0-57 35-34 48 0 0 18Z',p.roof)+path('M-48 0-35-34 0-57-16 10Z',p.roofLight,'opacity=".8"')+path('M0-57 35-34 48 0 16 10Z',p.shade)+path('M-16 10 0-57 16 10 0 18Z',p.roofLight,'opacity=".6"')+line('M-48 0-35-34 0-57 35-34 48 0 0 18-48 0M-35-34 35-34M-48 0H48M0-57V18M-35-34-16 10M35-34 16 10',p.edge,1.2),cx,cy,scale);
  }
  function glassMath(p){return `${pier(p)}${house(-52,-3,61,32,32,p,{columns:4})}${dome(-52,-3,61,32,32,p,50,true)}${orbit(-10,-66,p,18)}${house(65,4,15,16,26,p,{columns:1,door:false,rise:27,buildStep:3})}${finish(line('M-72 17-20 34 58 25',p.roofLight,1.5,'class="island-campus-water"')+shrub(-87,1,p))}`;}
  function glassCs(p){return `${pier(p)}${house(27,0,27,23,84,p,{rows:3,columns:2,door:false,rise:21,buildStep:3})}${bridge(-25,-31,27,-45,p)}${house(-59,-2,29,23,66,p,{rows:3,columns:2,door:false,rise:20})}${finish(line('M-75 14-37 25H13l18 7 46-16',p.roofLight,1.7)+[-74,13,31,77].map((x,i)=>`<circle cx="${x}" cy="${[14,25,32,16][i]}" r="2.5" fill="${p.light}" class="island-campus-lit"/>`).join('')+shrub(85,3,p))}`;}
  function glassPolitics(p){return `${pier(p)}${pavilion(-54,-1,76,34,44,p,true)}${house(-14,5,22,18,7,p,{columns:0,door:false,buildStep:4,roofStep:4})}${finish(group(path('M-17-5q9-6 17 0 8-6 17 0v12q-9-6-17 0-8-6-17 0Z',p.light)+line('M0-5V7',p.side,1),3,-6,.8)+shrub(-86,0,p)+shrub(83,8,p))}`;}
  function glassEnglish(p){return `${pier(p)}${house(41,5,18,19,77,p,{columns:1,rows:3,door:false,rise:16,buildStep:3})}${finish(line('M54-89V-104m-4 7h8',p.edge,1.2))}${house(-63,-1,45,27,28,p,{columns:3,door:false,rise:68,roof:p.roofLight})}${part(3,'roof-seams',line('M-44-74-2-76M-55-49 5-52',p.edge,1.2))}${boat(85,19,p)}${part(1,'pier-rails',line('M-7 25 32 35 77 19m-40 12v-10m19 7v-10m17 2v-10',p.edge,1.6))}`;}
  const buildings={harbor:{math:harborMath,cs:harborCs,politics:harborPolitics,english:harborEnglish},starglass:{math:glassMath,cs:glassCs,politics:glassPolitics,english:glassEnglish}};
  function subject(id,input){
    if(individual?.has(id))return individual.subject(id,input);
    const kind=suite(id,'archipelago'),subjectId=typeof input==='string'?input:input?.id;
    if(!kind||!subjects.includes(subjectId))return '';
    const raw=typeof input==='object'?input.progress:0;
    const progress=typeof raw==='number'&&Number.isFinite(raw)?Math.max(0,Math.min(1,raw)):0;
    const p={...palettes[kind],...(individual?.palettes[subjectId]||{})};
    return `<g class="island-campus island-campus-${kind}" data-island-architecture="${id}" data-campus-subject="${subjectId}" style="--campus-light:${n(.25+progress*.75)}"><g>${terrain(kind,p)}</g>${buildCampus(progress,p,buildings[kind][subjectId](p))}</g>`;
  }
  function mainTerrain(kind,p){
    return `<g class="homeland-campus-terrain">${path('m100 212 91 77 110 37 104-55 76-81-87 32-94 22-108-16Z',p.rock)}${path('m100 212 91 77 55 17-31-65Z',p.ink)}${path('m267 276 34 50 104-55 76-81-86 46Z',p.shade)}${path('m100 207 116-87 130-15 135 79-76 67-138 25-100-37Z',p.stone)}${path('m112 205 108-78 125-14 124 71-67 60-133 24-94-32Z',kind==='harbor'?'#96a9a0':'#839db5')}${line('m100 207 67 32 100 37 138-25 76-67',p.edge,2.2)}${line('m102 214 64 31 100 38 140-25 72-66',p.side,2)}${path('M123 210 194 171 215 179 148 217 261 258 283 253 397 230 403 239 269 267Z',p.water)}${line('M131 210 193 178m-43 42 108 39 26-4m62-11 49-10',p.roofLight,1.2,'class="island-campus-water"')}${line('M287 282l11 29m14-33 17 11m46-28-7 15m-142-17 8 26',p.roofLight,1,'opacity=".3"')}${path('M255 189 281 178 298 184 272 195Z',p.stone)}${path('M258 191v5l14 5 26-12v-5l-26 11Z',p.side)}</g>`;
  }
  function mainHarbor(p){
    return `${block(143,174,47,53,p)}${path('M138 120 169 92 209 130 190 135Z',p.roof)}${path('M169 92 190 135 209 130Z',p.roofLight)}${line('M138 120 190 135 209 130',p.edge,1.6)}${windows([150,164,178],134,p)}${windows([150,164,178],156,p)}${path('M162 179v-15q6-10 12 2v17Z',p.ink)}${block(239,142,25,52,p)}${path('M236 88 251 65 276 98 264 103Z',p.roof)}${path('M251 65 264 103 276 98Z',p.roofLight)}${windowAt(245,104,p,8,15)}${windowAt(255,124,p,6,11)}${path('M194 167 237 144 245 150 202 174Z',p.roof)}${path('M194 167v9l8 6 43-25v-7l-43 24Z',p.side)}${line('M202 175v7m13-14v7m13-14v7',p.edge,1.5)}${path('M434 184 453 172 473 183 453 197Z',p.stone)}${path('M434 184v13l19 12 20-16v-10l-20 14Z',p.side)}${line('M437 177v11m10-17v10m12-6v11m10-2v10M437 179 451 171 470 183',p.edge,2)}${shrub(131,196,p)}${shrub(214,193,p)}${shrub(416,218,p)}${line('M169 91v-12m0 1 15 4-15 4',p.stone,1.5)}${path('M169 80 184 84 169 88Z',p.roofLight)}`;
  }
  function mainGlass(p){
    return `${block(141,174,50,35,p)}${glassDome(p,174,136,.82)}${windows([148,162,177],146,p)}${path('M155 178v-12q6-9 12 2v14Z',p.ink)}${block(244,141,23,44,p)}${glassDome(p,257,92,.43)}${line('M257 65V49m-5 9h10',p.edge,1.5)}${windowAt(250,110,p,8,15)}${path('M196 158 239 136 249 145 208 170Z',p.roofLight)}${path('M196 158v11l12 10 41-25v-9l-41 25Z',p.roof)}${line('M196 158 208 170 249 145M208 170v9m12-16v9m14-17v8',p.edge,1.3)}${path('M436 181 452 169 471 181 453 197Z',p.side)}${path('M438 180 452 153 469 180 453 187Z',p.roofLight)}${line('M438 180 452 153 469 180 453 187 438 180M452 153 453 187',p.edge,1)}${line('M438 181v15m15-9v19m16-26v14',p.edge,1.7)}${shrub(132,194,p)}${shrub(214,192,p)}${shrub(418,220,p)}${line('M122 201 139 196M274 122 284 121M426 214 438 210',p.roofLight,1.6)}`;
  }
  const grandIslands=new Set(['island-starhaven','island-celestialpalace','island-lanternwharf','island-lunarobservatory','island-clockworkgarden','island-aethercitadel']);
  function guestCourtyard(kind,p){
    // Large owned island collections already carry several buildings. Their
    // footprint receives an open matching courtyard, not a second stacked town.
    return `<g class="homeland-campus-courtyard">${path('M136 199 209 157 236 165 164 208Z',p.stone)}${path('M218 155 265 132 282 143 237 167Z',p.stone)}${line('M144 199 209 163m24-8 30-14',p.edge,1.6)}${path('M136 206 165 216 193 211v5l-28 6-29-10Z',p.side)}${line('M115 211 148 227M117 205v10m15-2v11m15-4v10',p.edge,1.8)}${line('M281 122 291 126m-15 1 10 4',p.edge,1.2)}${kind==='starglass'?line('M201 187 220 176 240 183 223 195 201 187m19-11 3 19',p.roofLight,1.2):line('M194 189 218 176 245 185m-44 8 21-12 18 7',p.roofLight,1.5)}${shrub(124,205,p)}${shrub(290,127,p)}</g>`;
  }
  function main(id,equipped={}){
    const kind=suite(id,'homeland');if(!kind)return '';
    const p=palettes[kind],courtyard=grandIslands.has(equipped?.island);
    return `<g class="island-campus homeland-campus island-campus-${kind}" data-island-architecture="${id}" data-campus-layout="${courtyard?'collection-courtyard':'academy'}" style="--campus-light:.85">${mainTerrain(kind,p)}<g class="homeland-campus-buildings">${courtyard?guestCourtyard(kind,p):kind==='harbor'?mainHarbor(p):mainGlass(p)}</g></g>`;
  }
  // The main-island preview includes its everyday landmarks, so a thumbnail shows
  // a usable home rather than implying the purchased surface replaces equipment.
  function landmarks(){
    return `<g class="homeland-preview-landmarks">${line('M166 218C203 202 214 236 258 220s11-39 47-40 66 26 93-4','#c3b89e',4)}${path('m287 169 35-20 36 20-36 21Z','#aea7c3')}${path('m287 169v12l35 21 36-21v-12l-36 21Z','#817795')}${path('M322 91 303 125 322 157 343 126Z','#b5a6e2')}${path('M322 91v66l21-31Z','#8374b5')}${path('M322 91 303 125h40Z','#d2c6ed')}<ellipse cx="338" cy="236" rx="19" ry="7" fill="#5f6b73"/>${line('m327 240 21-10m-21 1 22 9','#8e7967',3)}${path('M328 235q-4-12 9-24 0 10 8 11 10 13-7 18Z','#e9a76c')}${path('M334 236q-2-7 6-13-1 7 5 10-1 6-11 3Z','#f1d49c')}${group(path('M-9 10-5-9H5L10 10Z','#869aaf')+path('M-12-9 0-31 13-9Z','#a2b8c8')+'<circle cy="-7" r="6" fill="#deceb6"/>'+line('M11-4 15 13','#ddc895',2),224,212)}${group(path('M-8 4-7-6-4-11 0-7 5-10 8-5 8 5Z','#9facc5')+'<circle cx="-3" cy="-2" r="1" fill="#344b60"/><circle cx="4" cy="-2" r="1" fill="#344b60"/>',362,190)}</g>`;
  }
  function svg(id,width,height,detailMode){
    const slot=has(id,'archipelago')?'archipelago':has(id,'homeland')?'homeland':null;
    if(!slot||id.endsWith('-default'))return '';
    const name=inventory[slot].find(item=>item.id===id).name;
    const content=slot==='homeland'?main(id)+landmarks():subjects.map((subjectId,i)=>group(subject(id,{id:subjectId,progress:1}),i%2?453:157,i<2?129:347,.87)).join('');
    const box=slot==='homeland'?'80 45 422 295':'35 10 540 440';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${width}" height="${height}" class="island-architecture-${detailMode?'detail':'preview'}" role="img" aria-label="${esc(name)}" fill="none" stroke="none"><title>${esc(name)}</title>${content}</svg>`;
  }
  function preview(id){
    if(individual?.has(id))return individual.preview(id);
    const art=svg(id,160,112,false);if(!art)return '';
    const content=art.replace('class="island-architecture-preview" role="img"', 'class="island-architecture-preview" x="4" y="3" width="152" height="106" aria-hidden="true" focusable="false"').replace('width="160" height="112" ','');
    return `<svg class="shop-art-svg" viewBox="0 0 160 112" aria-hidden="true" focusable="false" data-art="${id}" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="none">${content}</svg>`;
  }
  function detail(id){return individual?.has(id)?individual.detail(id):svg(id,640,440,true);}
  const resolve=(equipped,subjectId)=>individual?.resolve(equipped,subjectId)||(['archipelago-harbor','archipelago-starglass'].includes(equipped?.archipelago)?equipped.archipelago:'archipelago-default');
  const slot=subjectId=>individual?.slots[subjectId];
  return Object.freeze({inventory,has,subjectInfo,subject,main,preview,detail,resolve,slot});
});
