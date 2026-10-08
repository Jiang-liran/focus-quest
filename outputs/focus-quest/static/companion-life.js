(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FocusCompanionLife=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Pure SVG composition. Navigation owns the outer transform; these groups
  // articulate the original drawing, without clocks, DOM work or cloned bodies.
  const profiles=Object.freeze({
    bird:/owl|bird|phoenix|parrot|puffin|crane|penguin|sparrow|kingfisher/,
    swim:/whale|manta|fish|jelly|axolotl|seahorse|ray|serpent/,
    hop:/rabbit|frog|squirrel|mouse|hamster|ferret/,
    gentle:/capybara|turtle|sloth|hedgehog|snail|panda/,
  });
  function profile(id){for(const [name,pattern] of Object.entries(profiles))if(pattern.test(id))return name;return 'curious';}
  function gait(id){
    if(/serpent/.test(id))return 'slither';
    if(/owl|lumibird|phoenix|moonmoth|origamidove|kingfisher|pegasus/.test(id))return 'fly';
    if(/whale|manta|fish|jelly|axolotl|seahorse|ray|sealpup/.test(id))return 'swim';
    if(/rabbit|frog|squirrel|mouse|hamster/.test(id))return 'hop';
    if(/tortoise|turtle|snail|sloth/.test(id))return 'crawl';
    return 'walk';
  }
  const zones=new Set(['island','city','home','rooftop','library','tea','atelier','arcade','station']);
  const group=(body,name,x=50,y=70)=>`<g class="pet-life-${name}" style="transform-origin:${x}px ${y}px">${body}</g>`;
  const attr=(tag,key)=>tag.match(new RegExp('\\b'+key+'="([^"]*)"'))?.[1]||'';
  // A joint wrapper leaves any original SVG transforms on the shape untouched.
  function part(markup,start,name,x,y){
    return markup.replace(/<path\b[^>]*\/>/g,tag=>attr(tag,'d').startsWith(start)?group(tag,name,x,y):tag);
  }
  function split(markup,start,pieces){
    return markup.replace(/<path\b[^>]*\/>/g,tag=>attr(tag,'d').startsWith(start)?pieces.map(([d,name,x,y])=>group(tag.replace(/\bd="[^"]*"/,`d="${d}"`),name,x,y)).join(''):tag);
  }
  function replaceClass(markup,oldName,newName,pivot){return markup.replace(new RegExp('class="'+oldName+'"','g'),`class="${oldName} pet-life-${newName}"${pivot?` style="transform-box:view-box;transform-origin:${pivot[0]}px ${pivot[1]}px"`:''}`);}
  function feet(markup){
    // Existing separate paws/hooves are preferable to extra geometry. Restrict
    // this to low, small ellipses/rectangles, never shadows, bellies or ornaments.
    return markup.replace(/<(?:ellipse|rect)\b[^>]*\/>/g,tag=>{
      const ellipse=tag.startsWith('<ellipse'),x=Number(attr(tag,ellipse?'cx':'x')),y=Number(attr(tag,ellipse?'cy':'y'));
      const w=Number(attr(tag,ellipse?'rx':'width')),h=Number(attr(tag,ellipse?'ry':'height'));
      if(y<(ellipse?78:73)||y>90||x<15||x>82||w>16||h>(ellipse?7:14)||/opacity=/.test(tag)||attr(tag,'fill')==='none')return tag;
      return group(tag,x<50?'leg-left':'leg-right',ellipse?x:x+w/2,ellipse?y-6:y);
    });
  }
  function paws(markup,positions,color){
    // Sitting silhouettes with fused lower bodies get two matching short paws.
    return markup+positions.map(([x,y,side],i)=>group(`<path d="M${x-5} ${y-10}q5-3 10 0l1 9q-6 5-12 0Z" fill="${color}"/>`,side==='right'||i?'leg-right':'leg-left',x,y-11)).join('');
  }
  function articulate(id,markup){
    const kind=id.slice(10),travel=gait(id);
    if(['walk','hop','crawl'].includes(travel))markup=feet(markup);
    if(kind==='fox'){
      markup=markup.replace(/(<path d="M48 78[^>]+\/>)(<path d="M18 50[^>]+\/>)/,(_,a,b)=>group(a+b,'tail',43,72));
      markup=markup.replace(/(<path d="m30 34[^>]+\/>)(<path d="m34 27[^>]+\/>)/,(_,a,b)=>group(a+b,'ears',50,32));
      markup=markup.replace(/<path d="M42 70[^>]*\/>/,'');
      markup=paws(markup,[[41,84],[59,84]],'#c99a7a');
    }
    if(kind==='cat'){markup=part(markup,'M29 72','tail',29,70);markup=paws(markup,[[37,88],[63,88]],'#e5ddbd');}
    if(kind==='hedgehog')markup=paws(markup,[[29,88],[65,88]],'#956f61');
    if(kind==='redpanda')markup=paws(markup,[[32,91],[59,91]],'#465e83');
    if(kind==='clockfox'){
      markup=markup.replace(/<path d="M38 61[^>]*\/>/,'');
      markup=paws(markup,[[35,87],[53,87]],'#a9c8d8');
    }
    if(kind==='ninefox'){
      markup=markup.replace(/<path d="M43 75[^>]*\/>/,'');
      markup=paws(markup,[[43,91],[58,91]],'#dfe7f2');
    }
    if(kind==='emberlion')markup=split(markup,'M31 84',[["M31 84v4m6-4v4",'leg-left',34,80],["M61 84v4m6-4v4",'leg-right',64,80]]);
    if(kind==='squirrel')markup=paws(markup,[[49,89,'right']],'#f4e5c9');
    if(kind==='capybara')markup=split(markup,'M31 67',[['M31 67v17','leg-left',31,67],['M69 67v17','leg-right',69,67]]);
    if(kind==='deer')markup=split(markup,'M36 75',[['M36 75v13','leg-left',36,75],['M64 75v13','leg-right',64,75]]);
    if(kind==='duckling')markup=split(markup,'M39 85',[['M39 85h-12','leg-left',36,79],['M53 85h16','leg-right',58,79]]);
    if(kind==='puffin')markup=split(markup,'M32 85',[['M32 85 24 91h20l-1-7Z','leg-left',36,82],['M56 85v6h20l-12-6Z','leg-right',62,82]]);
    if(kind==='ferret')markup=split(markup,'M37 65',[['M37 65 34 85','leg-left',37,65],['M64 67 63 85','leg-right',64,67]]);
    if(kind==='alpaca'){
      markup=split(markup,'M26 69',[
        ['M26 69h17l-5 21h-8Z','leg-left',36,69],['M62 69h15l-6 21h-8Z','leg-right',67,69],
        ['M26 69h51v5H26Z','hips',50,70],
      ]);
      markup=split(markup,'M33 87',[['M33 87v5','leg-left',36,69],['M67 87v5','leg-right',67,69]]);
    }
    if(kind==='dragon'){
      markup=markup.replace(/(<path d="M63 65[^>]*\/>)(<path d="M69 68[^>]*\/>)/,(_,a,b)=>group(a+b,'tail',66,70));
      markup=split(markup,'m38 61',[
        ['M38 61 22 76l-9 1 3 7 15-1 16-13Z','leg-left',38,61],
        ['M62 63 77 79l-1 6-13-5-13-13Z','leg-right',62,63],
      ]);
      markup=split(markup,'m35 75',[
        ['M35 75 27 87l5 4 11-14Z','leg-right',35,75],
        ['M59 72 69 86l9-2-11-13Z','leg-left',59,72],
      ]);
      // Toes travel with the four split limbs rather than remaining on the floor.
      markup=split(markup,'m16 81',[
        ['M16 81 11 85m8-3-3 5','leg-left',38,61],['M77 80l5 2m-6 0 4 5','leg-right',62,63],
        ['M33 89l-1 4','leg-right',35,75],['M69 87l3 4','leg-left',59,72],
      ]);
    }
    if(kind==='owl')markup=split(markup,'M26 44',[
      ['M26 44q-11 23 11 34l3-23Z','wing-left',29,46],['M74 44q11 23-11 34l-3-23Z','wing-right',71,46],
    ]);
    if(kind==='penguin')markup=split(markup,'M28 49',[
      ['M28 49q-17 21-6 29l13-17Z','wing-left',29,49],['M74 49q17 21 6 29L67 61Z','wing-right',71,49],
    ]);
    if(kind==='phoenix'){
      markup=split(markup,'M40 48',[
        ['M40 48Q17 9 7 20L20 68l24-6Z','wing-left',40,53],['M60 48Q83 9 93 20L80 68 56 62Z','wing-right',60,53],
      ]);
      markup=split(markup,'M26 35',[
        ['M26 35 39 58M30 48l10 14','wing-left',40,53],['M74 35 61 58M70 48 60 62','wing-right',60,53],
      ]);
      markup=part(markup,'M38 67','tail',50,68);
    }
    if(kind==='manta'){
      markup=split(markup,'M50 35Q23',[
        ['M50 35Q23 7 5 22L20 54Q32 78 50 62Z','wing-left',50,48],['M50 35Q77 7 95 22L80 54Q68 78 50 62Z','wing-right',50,48],
      ]);
      // The belly is a second path sharing the same prefix but a different shape.
      markup=markup.replace(/<path d="M50 35Q26 21[^>]*\/>/g,tag=>
        group(tag.replace(/d="[^"]*"/,'d="M50 35Q26 21 20 54 36 49 50 62Z"'),'wing-left',50,48)+
        group(tag.replace(/d="[^"]*"/,'d="M50 35Q74 20 80 54 65 49 50 62Z"'),'wing-right',50,48));
      markup=part(markup,'M50 61','tail',50,61);
    }
    if(kind==='whale'){
      markup=markup.replace(/(<path d="M69 64[^>]*\/>)(<path d="M81 68[^>]*\/>)/,(_,a,b)=>group(a+b,'tail',70,70));
      markup=part(markup,'M38 57','fin',40,59);markup=part(markup,'M62 65','fin-back',64,65);
    }
    if(kind==='seahorse')markup=part(markup,'M50 47','fin',50,48);
    if(kind==='sealpup'){markup=part(markup,'M78 69','tail',78,71);markup=part(markup,'M12 84','perch');markup=part(markup,'m12 84','perch');}
    if(kind==='moonmoth'){
      // Split existing wings and their markings, leaving the narrow thorax still.
      markup=split(markup,'M45 45',[
        ['M45 45Q3 4 4 39q-2 24 38 19Q8 69 22 90q23 10 26-30Z','wing-left',47,51],
        ['M55 45q42-41 41-6 2 24-38 19 34 11 20 32-23 10-26-30Z','wing-right',53,51],
      ]);
      markup=split(markup,'M42 43',[['M42 43 14 27l13 25 15 1Z','wing-left',47,51],['M58 43 86 27 73 52 58 53Z','wing-right',53,51]]);
      markup=split(markup,'M12 36',[['M12 36 40 51 26 79','wing-left',47,51],['M88 36 60 51 74 79','wing-right',53,51]]);
      markup=markup.replace(/<circle cx="(19|81)"[^>]*\/>/g,(tag,x)=>group(tag,x==='19'?'wing-left':'wing-right',x==='19'?47:53,51));
    }
    if(kind==='origamidove'){
      markup=split(markup,'M43 43 10',[
        ['M43 43 10 6 1 53l35 10Z','wing-left',41,48],['M58 45 74 29 95 53 65 65Z','wing-right',59,48],
        ['M43 43 36 63l14 21 15-19-7-20Z','torso',50,58],
      ]);
      markup=split(markup,'M10 6 43',[['M10 6 43 43 36 63 1 53Z','wing-left',41,48],['M49 49 74 29 95 53 65 65Z','wing-right',59,48]]);
      markup=split(markup,'M10 6 19',[['M10 6 19 47 36 63m-17-16 24-4','wing-left',41,48],['M58 46 84 55','wing-right',59,48],['M65 65 50 84','torso',50,58]]);
    }
    if(kind==='celestialserpent'){
      const start=markup.indexOf('<path d="M71 70'),end=markup.indexOf('<path d="M58 36');
      if(start>=0&&end>start)markup=markup.slice(0,start)+group(markup.slice(start,end),'spine',50,58)+markup.slice(end);
      markup=part(markup,'m28 83','tail',27,80);markup=part(markup,'m9 82','tail',27,80);
    }
    // Use the existing joint groups in newer collections; their artwork stays
    // in place and their idle gestures resume as soon as the walk stops.
    const tailPivots={dormouse:[64,75],ferret:[41,79],fennec:[61,74],axolotl:[60,71],pegasus:[74,60],redpanda:[70,83],squirrel:[54,84]};
    for(const [existing,name,pivot] of [
      ['scv3c-wing','wing-right',kind==='pegasus'?[50,54]:[63,43]],['scv3c-fin','fin',kind==='puffin'?[29,49]:[55,62]],['scv3c-tail','tail',tailPivots[kind]],['scv3c-tentacles','tentacles',[50,56]],
      ['scv3c-gills','gills',[48,46]],['lca-fin','fin',[54,59]],['lca-tail','tail',[19,55]],['lca-fox-tail','tail',[39,76]],
      ['collection-v2-tail','tail',tailPivots[kind]],['expansion-luminous-wings','wings',[50,50]],['expansion-luminous-tail','tail',[50,64]],
      ['lcv3c-lion-tail','tail',[68,69]],
    ])markup=replaceClass(markup,existing,name,pivot);
    if(kind==='prismwhale')markup=markup.replace(/(class="lca-fin pet-life-fin" style="[^"]*)54px 59px(?="><path d="m44 28)/,(_,opening)=>opening+'50px 28px');
    if(kind==='kingfisher'){markup=part(markup,'m57 79','tail',58,76);markup=part(markup,'M14 86','perch');}
    // Existing round pupils blink without closing the surrounding face.
    return markup.replace(/<circle\b[^>]*>/g,tag=>{
      const r=Number(attr(tag,'r')),y=Number(attr(tag,'cy'));
      if(r>=1.4&&r<=3.5&&y>=28&&y<=56&&!/\bclass=/.test(tag)&&/fill="#[3456][0-9a-f]{5}"/i.test(tag))return tag.replace('<circle','<circle class="pet-life-eye"');
      return tag;
    });
  }
  function wrap(id,markup,options={}){
    if(typeof id!=='string'||!/^companion-[a-z0-9]+$/.test(id)||id==='companion-default'||typeof markup!=='string'||!markup)return '';
    const behavior=profile(id),phase=-(Array.from(id).reduce((sum,c)=>sum+c.charCodeAt(0),0)%97)/10;
    const focus=options.interactive?' tabindex="0" role="img" aria-label="旅途伙伴，会回应你的靠近"':'';
    const zone=options.interactive&&zones.has(options.zone)?` data-pet-zone="${options.zone}"`:'';
    // These side-facing drawings originally look left. Normalize their heading
    // so data-pet-facing always refers to the actual direction of travel.
    const nativeLeft=/^companion-(whale|dragon|squirrel|pegasus|kingfisher|sealpup)$/.test(id);
    return `<g class="pet-life pet-life--${behavior}" data-companion-life="${id}" data-pet-gait="${gait(id)}"${zone} style="--pet-phase:${phase}s;--pet-native-facing:${nativeLeft?-1:1}"${focus}><title>旅途伙伴 · 靠近，和它打个招呼</title><ellipse class="pet-life-hit" cx="50" cy="49" rx="42" ry="43" fill="transparent"/><g class="pet-life-heading"><g class="pet-life-motion"><g class="pet-life-response">${articulate(id,markup)}</g></g></g><g class="pet-life-hello" pointer-events="none"><path d="M73 16q-8-9-13-2-3 5 13 14 16-9 13-14-5-7-13 2Z" fill="#f3b7b3"/><path d="M15 24v-7m-6 8-5-4m92 14 5-5" fill="none" stroke="#ecd69f" stroke-width="2" stroke-linecap="round"/></g><ellipse class="pet-life-focus" cx="50" cy="87" rx="34" ry="7" fill="none" stroke="#bce0db" stroke-width="1.6"/></g>`;
  }
  return Object.freeze({wrap,profile,gait});
});
