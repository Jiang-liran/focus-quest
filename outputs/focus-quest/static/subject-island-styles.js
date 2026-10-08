(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusSubjectIslandStyles=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const slots=Object.freeze({math:'campusmath',cs:'campuscs',politics:'campuspolitics',english:'campusenglish'});
  const names={math:'数学',cs:'408',politics:'政治',english:'英语'};
  const designs={
    math:[['garden','几何花园','青绿阶地、圆规穹亭与几何花床，将推演的秩序留在花园里。'],['hall','青石定理院','拱窗石院、三角山墙与推演板，安静的学院围出一片绿意。'],['spiral','螺旋星算塔','层叠螺旋步道围绕观测塔，星象球与几何光轨随专注亮起。']],
    cs:[['workshop','齿轮机巧所','蓝紫工坊、轴轮与传动廊，结构清晰的小机械岛。'],['server','晶格数据庭','双座机柜楼、晶格连廊与节点庭院，灯格记录每一段专注。'],['neon','回路云端城','阶梯芯片楼、悬桥与环形信号台，蓝紫回路沿岛面流动。']],
    politics:[['courtyard','暖杏议事庭','杏色柱廊、书卷与圆桌，留一处安静讨论和思考的庭院。'],['archive','赤陶文史馆','暖红砖墙、档案书架与双层廊庭，历史和思辨在灯下相遇。'],['forum','灯火共议台','层叠议事厅、开放书庭与灯火钟楼，暖金灯光映出沉稳夜色。']],
    english:[['library','蓝湾书屋','青蓝书屋、拱窗与露台读书角，海风吹过摊开的书。'],['harbor','风信译港','信号塔、邮舟与帆顶书馆，在蓝色港湾寄出新的句子。'],['greenhouse','月光语境苑','透光温室书苑、植物与玻璃书廊，青蓝夜色包住一座语言花园。']],
  };
  const inventory=Object.freeze(Object.fromEntries(Object.entries(slots).map(([subject,slot])=>[slot,Object.freeze([
    {id:`${slot}-default`,name:`${names[subject]} · 随整套主题`,subject,variant:'default'},
    {id:`${slot}-original`,name:`${names[subject]} · 初旅原貌`,subject,variant:'original'},
    ...designs[subject].map(([variant,name,description])=>({id:`${slot}-${variant}`,name:`${names[subject]} · ${name}`,description,subject,variant})),
  ].map(Object.freeze))])));
  const entries=Object.values(inventory).flat(),items=new Map(entries.map(item=>[item.id,item]));
  const palettes={
    math:{stone:'#91b5a7',side:'#567c75',shade:'#375c5a',roof:'#418c7c',roofLight:'#8bcdb3',edge:'#b0d5ba',water:'#3a6868',ink:'#283f4b',light:'#e8e5b4',rock:'#344857'},
    cs:{stone:'#a2a7cd',side:'#697296',shade:'#4a537c',roof:'#5969a2',roofLight:'#acb6f1',edge:'#bfc4eb',water:'#424e7a',ink:'#29314d',light:'#cbd5fc',rock:'#363e59'},
    politics:{stone:'#c4a293',side:'#956f69',shade:'#6d5155',roof:'#a26761',roofLight:'#dbb29a',edge:'#ddc5ac',water:'#796369',ink:'#483a47',light:'#f3dba4',rock:'#4d3e51'},
    english:{stone:'#99b8c6',side:'#607f94',shade:'#405b75',roof:'#44899d',roofLight:'#9ad1d7',edge:'#bfdde0',water:'#3f7183',ink:'#294655',light:'#e6e8be',rock:'#34465b'},
  };
  const path=(d,fill,extra='')=>`<path d="${d}" fill="${fill}" ${extra}/>`;
  const line=(d,p,w=1,extra='')=>path(d,'none',`stroke="${p}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}`);
  const group=(content,x=0,y=0,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})">${content}</g>`;
  // A whole physical part is fitted in place, never cropped along a progress line.
  const part=(step,piece,content)=>content?`<g class="campus-build-part" data-build-step="${step}" data-build-piece="${piece}">${content}</g>`:'';
  const finish=content=>part(4,'furnishing',content);
  const has=(id,slot)=>items.has(id)&&(slot===undefined||inventory[slot]?.some(i=>i.id===id)===true);
  const item=id=>items.get(id);
  function resolve(equipped,subject){
    if(!Object.hasOwn(slots,subject))return 'archipelago-default';
    const slot=slots[subject],candidate=equipped?.[slot];
    if(has(candidate,slot)&&item(candidate).variant!=='default')return candidate;
    return ['archipelago-harbor','archipelago-starglass'].includes(equipped?.archipelago)?equipped.archipelago:'archipelago-default';
  }
  function subjectInfo(id,subject){const found=item(id);return found?.subject===subject&&found.description?{name:found.name.split(' · ')[1],description:found.description}:null;}
  function book(p){return path('M-16-5q8-6 16 0 8-6 16 0v12q-8-5-16 0-8-5-16 0Z',p.light)+line('M0-5V7m-10-6 5-1m10 1 5-1',p.side,1);}
  function plant(x,y,p){return group(path('M-6 2V-3L0-9 6-3v5Z',p.roofLight)+path('M-7 2H7L5 10H-5Z',p.side),x,y);}
  function terrain(p,variant){
    return `<g class="island-campus-terrain">${path('M-113 9-74-16 21-26 113 8 95 49 57 68 25 112-19 91-59 85-92 51Z',p.rock)}${path('M-113 9-56 28-17 46-19 91-59 85-92 51Z',p.ink)}${path('M-17 46 52 30 113 8 95 49 57 68 25 112Z',p.shade)}${path('M-113 9-74-16 21-26 113 8 69 36-21 49-77 32Z',p.water)}${path('M-107 5-72-17 20-26 105 7 68 29-21 44-75 27Z',p.stone)}${path('M-90 7-56-10 9-16 83 7 50 24-18 34Z',p.roof,'opacity=".35"')}${line('M-111 9-76 32-21 49 69 36 111 9',p.edge,1.5)}${line('M-87 12-63 0 63 23M-66 24-39 10 26 30',p.edge,1,'opacity=".4"')}${line('M-68 23-22 39 65 26',p.roofLight,1.8,'class="island-campus-water"')}${[-65,-26,16,58].map(x=>path(`M${x} 44l4 2-1 13-3-2Z`,p.roofLight,'opacity=".2"')).join('')}${plant(-88,1,p)}${plant(81,6,p)}</g>`;
  }
  // All walls, roofs and openings share one isometric coordinate frame. Depth
  // moves up/right; height only moves up. Attachments cannot drift off a wall.
  const point=(x,y,u,v,z=0)=>[x+u+v*.65,y+u*.24-v*.38-z];
  const polygon=(points,fill,extra='')=>path('M'+points.map(q=>q.map(v=>Math.round(v*100)/100).join(' ')).join(' ')+'Z',fill,extra);
  function house(x,y,w,d,h,p,{rise=0,rows=1,columns=3,door=true,roof=p.roof,saw=false,buildStep=2,roofStep=Math.min(4,buildStep+1)}={}){
    const q=(u,v,z=0)=>point(x,y,u,v,z),A=q(0,0),B=q(w,0),C=q(w,d),a=q(0,0,h),b=q(w,0,h),c=q(w,d,h),e=q(0,d,h);
    const corners=[q(-3,-2),q(w+3,-2),q(w+3,d+2),q(-3,d+2)],front=corners.slice(0,3);
    const footing=polygon(corners,p.side)+polygon([front[0],front[1],front[2],[front[2][0],front[2][1]+3],[front[1][0],front[1][1]+3],[front[0][0],front[0][1]+3]],p.shade)+line('M'+front.map(q=>q.join(' ')).join(' '),p.edge,.8);
    let walls=polygon([A,B,b,a],p.stone)+polygon([B,C,c,b],p.side),openings='',roofArt='';
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const u=5+(w-12)*col/Math.max(1,columns-1),z=h-9-row*19,ww=Math.min(6,w/6),hh=Math.min(11,h/3);
      if(z-hh<5)continue;
      openings+=polygon([q(u,0,z),q(u+ww,0,z),q(u+ww,0,z-hh),q(u,0,z-hh)],p.ink);
      openings+=polygon([q(u+1,0,z-2),q(u+ww-1,0,z-2),q(u+ww-1,0,z-hh+1),q(u+1,0,z-hh+1)],p.light,'class="island-campus-lit"');
    }
    if(door&&w>25){const u=w*.48,[dx,dy]=q(u,0);walls+=path(`M${dx} ${dy}v-16q5-8 10 2v${16+2.4}Z`,p.ink);}
    if(saw){
      for(let i=0;i<3;i++){const u=i*w/3,a=q(u,0,h),b=q(u+w/3,0,h),c=q(u+w/3,d,h),e=q(u,d,h),r=q(u+w/6,0,h+rise),t=q(u+w/6,d,h+rise);roofArt+=polygon([a,r,b],p.stone)+polygon([a,e,t,r],roof)+polygon([r,t,c,b],p.roofLight)+line('M'+[a,r,b,c,t,r].map(q=>q.join(' ')).join(' '),p.edge,.8);}
    }else if(rise){
      const r=q(w/2,0,h+rise),s=q(w/2,d,h+rise);
      roofArt+=polygon([a,r,b],p.stone)+polygon([a,e,s,r],roof)+polygon([r,s,c,b],p.roofLight);
      roofArt+=line('M'+[a,r,b,c,s,r].map(q=>q.join(' ')).join(' '),p.edge,1);
    }else roofArt+=polygon([a,e,c,b],roof)+line('M'+[a,b,c].map(q=>q.join(' ')).join(' '),p.edge,1);
    return `<g data-campus-solid="house">${part(1,'footing',footing)}${part(buildStep,'walls',walls)}${part(Math.min(4,buildStep+1),'windows',openings)}${part(roofStep,'roof',roofArt)}</g>`;
  }
  function dome(x,y,w,d,h,p,rise=38,glass=false,step=3){
    const q=(u,v,z)=>point(x,y,u,v,z),a=q(0,0,h),b=q(w,0,h),c=q(w,d,h),e=q(0,d,h),t=q(w*.5,d*.5,h+rise),m=q(w*.5,0,h);
    let roof=glass?polygon([a,e,t],p.roofLight)+polygon([e,c,t],p.shade)+polygon([a,t,m],p.roofLight)+polygon([m,t,c,b],p.roof):path(`M${a}Q${a[0]} ${t[1]+7} ${t}Q${c[0]-8} ${t[1]+8} ${c}L${b}Z`,p.roof)+path(`M${a}Q${a[0]} ${t[1]+7} ${t}Q${t[0]-18} ${m[1]-25} ${m}Z`,p.roofLight);
    roof+=line('M'+[a,b,c,e].map(q=>q.join(' ')).join(' ')+'Z',p.edge,1.3)+line(`M${t}Q${t[0]+7} ${m[1]-20} ${m}`,p.edge,1);
    if(glass)roof+=line(`M${a} ${t} ${c}M${e} ${t} ${b}`,p.edge,.8);
    return part(step,'dome',roof);
  }
  function orbit(x,y,p,size=20){return part(4,'instrument',group(`<g class="island-campus-orbit"><ellipse rx="${size}" ry="${size*.35}" fill="none" stroke="${p.light}" stroke-width="1.3" transform="rotate(-25)"/><ellipse rx="${size*.5}" ry="${size}" fill="none" stroke="${p.roofLight}" stroke-width="1" transform="rotate(20)"/></g><circle r="4" fill="${p.light}"/>`,x,y));}
  function wheel(x,y,p){return part(4,'wheel',group(`<g class="island-campus-wheel"><circle r="18" fill="${p.ink}" stroke="${p.side}" stroke-width="4"/><circle r="12" fill="none" stroke="${p.roofLight}" stroke-width="1.5"/>${[0,45,90,135].map(a=>line('M-16 0H16',p.edge,2,`transform="rotate(${a})"`)).join('')}<circle r="3" fill="${p.light}"/></g>`,x,y));}
  function bridge(x1,y1,x2,y2,p){return part(4,'bridge',path(`M${x1} ${y1} ${x2} ${y2} ${x2+10} ${y2+8} ${x1+10} ${y1+8}Z`,p.roofLight)+path(`M${x1+10} ${y1+8} ${x2+10} ${y2+8}v9L${x1+10} ${y1+17}Z`,p.side)+line(`M${x1+10} ${y1+8} ${x2+10} ${y2+8}`,p.edge,1.1));}
  function pavilion(x,y,w,d,h,p,glass=false){
    const q=(u,v,z)=>point(x,y,u,v,z),corners=[[0,d],[w,d],[0,0],[w*.5,0],[w,0]];
    let art=house(x-4,y-.96,w+8,d+3,6,p,{columns:0,door:false,roof:p.side,buildStep:1,roofStep:1});
    art+=part(2,'columns',corners.map(([u,v])=>{const top=q(u,v,h),bottom=q(u,v,6);return line(`M${top} ${bottom}`,p.stone,4)+line(`M${bottom[0]-3} ${bottom[1]}l7 2`,p.edge,1.2);}).join(''));
    if(glass)art+=dome(x-5,y,w+10,d+4,h,p,34,true);
    else {const a=q(-5,0,h),b=q(w+5,0,h),c=q(w+5,d+4,h),e=q(-5,d+4,h),r=q(w/2,0,h+22),s=q(w/2,d+4,h+22);art+=part(3,'roof',polygon([a,r,b],p.stone)+polygon([a,e,s,r],p.roof)+polygon([r,s,c,b],p.roofLight)+line('M'+[a,r,b,c,s,r].map(q=>q.join(' ')).join(' '),p.edge,1.4));}
    return `<g data-campus-solid="pavilion">${art}</g>`;
  }
  function boat(x,y,p){return part(4,'boat',group(`<g class="island-campus-boat">${path('M-16 3H18L10 12H-8Z',p.roof)}${line('M0 3V-24',p.edge,1.5)}${path('M-3-23-14 0H-3ZM3-20 15 0H3Z',p.roofLight)}${line('M-12 17H11',p.roofLight,1)}</g>`,x,y));}
  function buildCampus(progress,p,buildings){
    const n=v=>Math.round(v*1000)/1000,stage=Math.min(4,Math.floor(progress*4));
    const paint=ghost=>buildings.replace(/<g class="campus-build-part" data-build-step="([1-4])" data-build-piece="([a-z-]+)">/g,(_,step,piece)=>{
      const charge=n(Math.max(0,Math.min(1,progress*4-(Number(step)-1)))),opacity=ghost?n(1-charge):charge;
      return `<g class="campus-build-part" data-build-step="${step}" data-build-piece="${piece}" data-build-amount="${charge}" style="opacity:${opacity}${opacity===0?';display:none':''}">`;
    });
    // Future parts keep their own complete outlines. Completed parts stay at
    // their final coordinates; roofs and equipment never get sliced in half.
    const ghost=progress<1?`<g class="campus-blueprint" style="--campus-blueprint-ink:${p.edge}" opacity=".22">${paint(true)}</g>`:'';
    const solid=progress>0?`<g class="campus-construction-solid">${paint(false)}</g>`:'';
    const crystals=[[-64,36],[-23,47],[23,46],[66,34]].map(([x,y],i)=>{const charge=n(Math.max(0,Math.min(1,progress*4-i)));return `<g class="expedition-charge-node campus-progress-crystal" data-node="${i+1}" data-charge="${charge}"><ellipse cx="${x}" cy="${y+5}" rx="8" ry="3" fill="${p.ink}"/>${path(`M${x} ${y-10}l5 8-5 9-5-9Z`,p.shade)}${path(`M${x} ${y-10}l5 8-5 9-5-9Z`,p.roofLight,`opacity="${charge}"`)}${path(`M${x} ${y-10}v17l-5-9Z`,p.light,`opacity="${charge}"`)}</g>`;}).join('');
    return `<g class="island-campus-buildings" data-campus-stage="${stage}" data-campus-built="${n(progress)}">${ghost}${solid}</g><g class="campus-progress-crystals" aria-hidden="true">${crystals}</g>`;
  }
  function mathGarden(p){return `${pavilion(-53,-2,65,32,42,p,true)}${orbit(-10,-48,p,19)}${house(48,7,23,13,6,p,{columns:0,door:false,buildStep:4,roofStep:4})}${finish(group(line('M-9 7 0-14 10 10',p.light,2),63,-18)+plant(-78,8,p))}`;}
  function mathHall(p){return `${house(-59,-3,66,31,48,p,{rise:24,rows:1,columns:4})}${house(46,8,20,17,26,p,{door:false,columns:1,buildStep:3})}${finish(group(path('M-13-14H13V7H-13Z',p.ink)+line('M-8 3 0-9 8 3Z',p.roofLight,1.3),58,-14)+plant(-78,9,p))}`;}
  function mathSpiral(p){
    const rings=[[-65,31],[-43,35],[-21,39]];
    // Back semicircles belong behind the tower; the near halves wrap its front.
    const rear=rings.map(([y,r])=>line(`M${-r} ${y}a${r} 12 0 0 1 ${r*2} 0`,p.side,5)).join('');
    const front=rings.map(([y,r])=>line(`M${-r} ${y}a${r} 12 0 0 0 ${r*2} 0`,p.side,5)+line(`M${-r} ${y+1}a${r} 12 0 0 0 ${r*2} 0`,p.roofLight,1)).join('');
    return `${part(3,'rear-stairs',rear)}${house(-20,0,34,23,78,p,{rise:22,rows:3,columns:2})}${part(3,'front-stairs',front+line('M-31-65q-9 14-4 22m70 0q9 15 4 22',p.edge,1.2))}${orbit(3,-94,p,16)}${house(-78,7,15,15,20,p,{columns:1,door:false,buildStep:3})}${finish(plant(73,8,p))}`;
  }
  function csWorkshop(p){return `${house(-56,-5,65,30,44,p,{rise:16,columns:4,saw:true})}${house(43,-4,17,19,67,p,{columns:1,door:false,rows:3,buildStep:3})}${wheel(-62,3,p)}${finish(line('M-43 0h15v-13H-5',p.edge,2))}${house(37,15,27,12,12,p,{columns:0,door:false,roof:p.ink,buildStep:4,roofStep:4})}${finish(line('M43 10l15 4',p.roofLight,1.4))}`;}
  function csServer(p){return `${house(25,-5,28,24,85,p,{rows:4,columns:2,door:false,roof:p.ink,buildStep:3})}${bridge(-27,-35,25,-46,p)}${house(-62,0,28,23,65,p,{rows:3,columns:2,door:false,roof:p.ink})}${finish(line('M-76 12-45 23H4l26 6 48-10m-57 4v11',p.roofLight,1.7)+[-45,-9,30,78].map((x,i)=>`<circle cx="${x}" cy="${[23,34,29,19][i]}" r="2.5" fill="${p.light}" class="island-campus-lit"/>`).join(''))}`;}
  function csNeon(p){return `${house(34,-4,27,22,93,p,{rows:4,columns:2,door:false,roof:p.ink,buildStep:3})}${bridge(-8,-27,35,-38,p)}${house(-23,-6,32,24,68,p,{rows:3,columns:2,door:false,roof:p.ink})}${house(-66,4,38,24,40,p,{rows:1,columns:3,roof:p.ink})}${orbit(56,-103,p,16)}${finish(line('M-75 20-38 30H10l19 5 51-14',p.roofLight,1.7,'class="island-campus-water"'))}`;}
  function politicsCourtyard(p){return `${pavilion(-54,-1,74,32,44,p)}${finish(`<ellipse cx="0" cy="4" rx="18" ry="7" fill="${p.roofLight}"/>`+line('M0 7V15',p.side,4)+group(book(p),0,1,.65)+group(book(p),-17,-38,.55)+plant(-77,12,p))}`;}
  function politicsArchive(p){return `${house(39,7,25,20,29,p,{door:false,columns:0,buildStep:3})}${finish(group(path('M-12-15H12V9H-12Z',p.ink)+[-8,-2,4,9].map((x,i)=>line(`M${x}-12v17`,i%2?p.roofLight:p.light,3)).join('')+line('M-12-1H12',p.side,1.3),52,-8))}${house(-63,-3,67,30,59,p,{rise:20,rows:2,columns:4})}${finish(group(book(p),-21,-72,.65)+plant(-78,11,p))}`;}
  function politicsForum(p){return `${house(49,1,17,19,82,p,{rise:17,rows:0,columns:0,door:false,buildStep:3})}${finish(`<ellipse cx="58" cy="-58" rx="5" ry="7" fill="${p.light}"/>`+line('M58-63v5l3 3',p.side,1.2))}${house(-56,-2,64,30,39,p,{rise:22,columns:4})}${part(1,'terrace',path('M-60 16-10 32 34 15v6L-10 40-60 23Z',p.side))}${finish(group(book(p),-25,-54,.7)+plant(-80,5,p))}`;}
  function englishLibrary(p){return `${house(-62,-4,60,31,45,p,{rise:24,columns:3})}${house(20,12,35,23,6,p,{door:false,columns:0,roof:p.stone,buildStep:1,roofStep:1})}${finish(line('M24 6.96V-6.04M39 10.56V-2.44M54 14.16V1.16M68.3 5.8V-7.2M24-6.04 54 1.16 68.3-7.2',p.edge,1.5)+group(book(p),41,10,.5)+plant(71,4,p)+plant(-81,8,p))}`;}
  function englishHarbor(p){return `${house(33,2,18,22,75,p,{rise:15,columns:1,rows:3,door:false,buildStep:3})}${house(-65,-3,45,29,36,p,{rise:26,columns:3})}${finish(group(book(p),-43,-48,.45))}${boat(70,21,p)}${part(1,'pier',line('M-70 17-21 34 30 22m-94-7v8m22 0v7m22-1v8',p.edge,1.7))}`;}
  function englishGreenhouse(p){return `${house(43,-1,18,20,53,p,{columns:1,door:false,buildStep:3})}${dome(43,-1,18,20,53,p,23,true,4)}${bridge(9,-11,43,-21,p)}${house(-61,-2,58,34,34,p,{rise:36,door:false,columns:3,roof:p.roofLight})}${part(3,'glass-frame',line('M-59-28-16-42 16-53M-36-27V6M-16-20V10',p.edge,1.1))}${finish(group(book(p),-28,2,.65)+plant(-74,7,p)+plant(70,13,p))}`;}
  const buildings={math:{garden:mathGarden,hall:mathHall,spiral:mathSpiral},cs:{workshop:csWorkshop,server:csServer,neon:csNeon},politics:{courtyard:politicsCourtyard,archive:politicsArchive,forum:politicsForum},english:{library:englishLibrary,harbor:englishHarbor,greenhouse:englishGreenhouse}};
  function subject(id,input){
    const found=item(id),subjectId=typeof input==='string'?input:input?.id;
    if(!found||found.subject!==subjectId||!buildings[subjectId]?.[found.variant])return '';
    const raw=typeof input==='object'?input.progress:0,progress=typeof raw==='number'&&Number.isFinite(raw)?Math.max(0,Math.min(1,raw)):0;
    const p=palettes[subjectId];
    return `<g class="island-campus island-campus-${subjectId}" data-island-architecture="${id}" data-campus-subject="${subjectId}" style="--campus-light:${Math.round((.25+progress*.75)*1000)/1000}">${terrain(p,found.variant)}${buildCampus(progress,p,buildings[subjectId][found.variant](p))}</g>`;
  }
  function detail(id){const found=item(id),content=subject(id,{id:found?.subject,progress:1});if(!content)return '';return `<svg xmlns="http://www.w3.org/2000/svg" class="island-architecture-detail" viewBox="-126 -132 252 250" width="500" height="496" role="img" aria-label="${found.name}" fill="none" stroke="none"><title>${found.name}</title>${content}</svg>`;}
  function preview(id){const content=detail(id);return content?`<svg xmlns="http://www.w3.org/2000/svg" class="shop-art-svg" viewBox="0 0 160 112" aria-hidden="true" focusable="false" data-art="${id}" fill="none" stroke="none">${content.replace('class="island-architecture-detail"','class="island-architecture-preview" x="26" y="2"').replace('width="500" height="496"','width="108" height="108"').replace('role="img"','aria-hidden="true" focusable="false"')}</svg>`:'';}
  return Object.freeze({slots,inventory,entries:Object.freeze(entries),has,item,resolve,subjectInfo,subject,preview,detail,palettes,geometry:Object.freeze({house,dome,orbit,wheel,bridge,pavilion,boat,buildCampus,part,finish})});
});
