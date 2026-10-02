(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusIslandEffects=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // An effect is a behaviour in the landscape, not a frame of collectible icons.
  // Geometry and phases are deterministic so a regular refresh cannot restart it.
  const designs=Object.freeze({
    'fx-fireflies':{kind:'firefly',palette:['#fff1ad','#b9f0cb','#fff6d3']},
    'fx-petals':{kind:'petal',palette:['#f4b6cf','#ffe0e9','#e996bc']},
    'fx-snow':{kind:'snow',palette:['#eff8ff','#c4e3f3','#ffffff']},
    'fx-meteor':{kind:'meteor',palette:['#fff3dc','#b8d8fa','#f5e4ff'],premium:true},
    'fx-nebula':{kind:'nebula',palette:['#ada2e8','#86c4d9','#dda4cf'],premium:true},
    'fx-dandelion':{kind:'dandelion',palette:['#fff4d8','#c9dfc1','#f5eac9']},
    'fx-butterflies':{kind:'butterfly',palette:['#bfe3dd','#e4b3cf','#f3dec4']},
    'fx-bubbles':{kind:'bubble',palette:['#c2ebf5','#d3c8ef','#fff7de']},
    'fx-ribbons':{kind:'ribbon',palette:['#d5b9ed','#a9ded6','#f0d4be'],premium:true},
    'fx-lanterns':{kind:'lantern',palette:['#f5cb83','#c88e6e','#ffe7b0'],premium:true},
    'fx-constellation':{kind:'constellation',palette:['#dce8ff','#abbfe5','#fff1c6'],premium:true},
    'fx-dewdrops':{kind:'dew',palette:['#d4f4e2','#abd5cc','#fff7cb']},
    'fx-maplekeys':{kind:'maple',palette:['#dcb58b','#acbf97','#f3d5aa']},
    'fx-papercycles':{kind:'paper',palette:['#f3e9dd','#bdd6dd','#d7cde7']},
    'fx-rainrings':{kind:'rainring',palette:['#b2d9e7','#86b9c6','#e2eff0']},
    'fx-ginkgobreeze':{kind:'ginkgo',palette:['#f1d384','#cabb89','#f7e9b4']},
    'fx-silverwaves':{kind:'wave',palette:['#c7e8f4','#9cbdd8','#e8def5'],premium:true},
    'fx-moonpetals':{kind:'moonpetal',palette:['#e5d4f7','#f6e5bf','#c3e6ea'],premium:true},
    'fx-prismtides':{kind:'prism',palette:['#67d9ef','#c587ed','#65dfb4','#f299bc'],premium:true}
  });
  const ids=Object.freeze(['fx-default',...Object.keys(designs)]);
  const own=(id)=>typeof id==='string'&&Object.prototype.hasOwnProperty.call(designs,id);
  function has(id){return id==='fx-default'||own(id);}
  const n=value=>Math.round(value*100)/100;
  function unit(i,salt=0){let value=Math.imul(i+97+salt*37,2654435761);value^=value>>>16;value=Math.imul(value,2246822519);return (value>>>0)/4294967296;}
  function line(d,color,width=1,opacity=.7){return `<path d="${d}" stroke="${color}" stroke-width="${width}" fill="none" opacity="${opacity}"/>`;}
  function star(r,color,opacity=1){return `<path d="M0 ${-r} ${r*.2} ${-r*.2} ${r} 0 ${r*.2} ${r*.2} 0 ${r} ${-r*.2} ${r*.2} ${-r} 0 ${-r*.2} ${-r*.2}Z" fill="${color}" opacity="${opacity}"/>`;}
  function glow(r,color){return `<circle r="${r}" fill="${color}" opacity=".055"/><circle r="${n(r*.48)}" fill="${color}" opacity=".16"/>`;}
  function glyph(kind,p,i){
    const [a,b,c]=p;
    switch(kind){
      case 'petal':return `<path d="M-6-3Q-2-10 3-6 9-3 3 5-2 10-6-3Z" fill="${i%3===0?b:a}"/><path d="M-4-3Q0-6 3-4L0 2Z" fill="${c}" opacity=".35"/>`;
      case 'moonpetal':return `<path d="M-8 1Q-2-10 7-8 9 0-4 6-8 1Z" fill="${a}"/><path d="M-5 2 5-6" stroke="${b}" stroke-width=".9" opacity=".7"/>`;
      case 'maple':return `<path d="M0 4Q-13 0-15-9-5-11 1 0 8-12 15-10 13 1 2 5Z" fill="${i%3===0?b:a}" opacity=".9"/>${line('M-11-7 1 4 12-8M1 4 4 10',c,.8,.6)}`;
      case 'ginkgo':return `<path d="M0 5Q-4 3-10-3-10-11-4-8 0-14 3-8 10-11 11-3 5 4 0 5Z" fill="${a}"/>${line('M0 5-7-6M0 5 0-8M0 5 8-6M0 5 2 12',c,.7,.6)}`;
      case 'snow':return i%8===0?`${line('M0-5V5M-4-2.5 4 2.5M-4 2.5 4-2.5',a,1,.9)}<circle r="1" fill="${c}"/>`:`<circle r="${1.4+i%3*.6}" fill="${i%3===0?b:a}"/>`;
      case 'firefly':return `${glow(7,a)}<circle r="${1.7+i%3*.5}" fill="${i%3===0?b:c}"/>`;
      case 'dandelion':return `${line('M0 0 2 10M0 0-5-4M0 0 5-4M0 0-3-7M0 0 3-7M0 0 0-8',a,.8,.9)}<g fill="${c}"><circle cx="-5" cy="-4" r="1"/><circle cx="5" cy="-4" r="1"/><circle cx="-3" cy="-7" r=".8"/><circle cx="3" cy="-7" r=".8"/></g>`;
      case 'butterfly':return `<g class="fx-wing"><path d="M0 0C-8-10-12-5-7 1-11 7-4 9 0 2Z" fill="${a}"/><path d="M0 0C8-10 12-5 7 1 11 7 4 9 0 2Z" fill="${b}"/></g><path d="M0-3V5" stroke="${c}" stroke-width="1.2"/>`;
      case 'bubble':return `<circle r="${5+i%3*2}" fill="${b}" opacity=".035"/><circle r="${5+i%3*2}" stroke="${a}" stroke-width=".9" opacity=".72"/>${line(`M${-3-i%3} -3Q-2 ${-5-i%3} 1 ${-4-i%3}`,c,1.1,.9)}`;
      case 'lantern':return `${glow(13,a)}<path d="M-5-8Q-9-1-5 6H5Q9-1 5-8Z" fill="${a}" opacity=".8"/><path d="M-2-7H2V6H-2Z" fill="${c}" opacity=".5"/>${line('M-5-8H5M-5 7H5M0 7V11',b,.8,.8)}`;
      case 'paper':return `<path d="M-12 2 14-6 3 7-1 3Z" fill="${a}"/><path d="M-1 3 14-6 2 1 3 7Z" fill="${b}"/><path d="M-12 2-1 3 14-6-3 0Z" fill="${c}" opacity=".7"/>`;
      case 'ribbon':return `<path d="M-30 3Q-13-9 0 1T31-1L31 2Q14 12 0 4T-30 6Z" fill="${a}" opacity=".5"/>${line('M-30 3Q-13-9 0 1T31-1',b,.85,.7)}`;
      case 'meteor':return `${line('M0 0 39-28',b,3,.1)}${line('M0 0 26-19',a,1.6,.42)}${line('M0 0 11-8',c,1.1,.95)}${glow(6,a)}<circle r="1.8" fill="${c}"/>`;
      default:return '';
    }
  }
  // Every motion gets a real journey through the scene and an individual phase.
  // The CSS-off position is a sampled point along that journey, not its origin.
  function travel(art,x,y,dx,dy,scale,i,motion,duration,opacity=.85){
    const phase=unit(i,17),bend=(unit(i,31)-.5)*Math.min(Math.abs(dx)+30,60);
    const style=`--fx-time:${n(duration)}s;--fx-delay:${n(-duration*phase)}s;--fx-x1:${n(dx*.23+bend)}px;--fx-y1:${n(dy*.24)}px;--fx-x2:${n(dx*.48-bend*.7)}px;--fx-y2:${n(dy*.51)}px;--fx-x3:${n(dx*.76+bend*.5)}px;--fx-y3:${n(dy*.77)}px;--fx-dx:${n(dx)}px;--fx-dy:${n(dy)}px;--fx-static-x:${n(dx*phase)}px;--fx-static-y:${n(dy*phase)}px;--fx-ink:${opacity};--fx-turn:${n(45+unit(i,41)*170)}deg;--fx-lean:${n(-20+unit(i,44)*40)}deg`;
    return `<g class="fx-particle" transform="translate(${n(x)} ${n(y)})"><g class="fx-travel fx-${motion}" style="${style}"><g transform="scale(${n(scale)})"><g class="fx-shape">${art}</g></g></g></g>`;
  }
  function falling(design,box,city,indoor){
    const {kind,palette:p}=design,[x,y,w,h]=box,count=indoor?12:kind==='snow'?(city?34:24):kind==='petal'?(city?30:22):(city?18:14);
    return Array.from({length:count},(_,i)=>{
      const scale=(kind==='snow'?.65:kind==='maple'?.45:.7)+unit(i,6)*(kind==='snow'?1:.65);
      const dx=(kind==='snow'?.035:.15)*w+(unit(i,4)-.5)*w*.09;
      return travel(glyph(kind,p,i),x+w*(.02+unit(i,3)*.86)-dx*.32,y-12,dx,h+24,scale,i,kind==='snow'?'snowfall':'falling',kind==='snow'?13+unit(i,5)*12:10+unit(i,5)*9,kind==='moonpetal'?.72:.88);
    }).join('');
  }
  function flying(design,box,city,indoor){
    const {kind,palette:p}=design,[x,y,w,h]=box;
    const count=indoor?(kind==='butterfly'||kind==='paper'?2:7):kind==='butterfly'?(city?5:4):kind==='paper'?3:kind==='ribbon'?3:kind==='lantern'?(city?7:5):kind==='bubble'?(city?13:10):kind==='dandelion'?(city?18:13):city?22:16;
    return Array.from({length:count},(_,i)=>{
      const u=unit(i,9),v=unit(i,12),size=.65+unit(i,7)*.7;
      if(kind==='bubble'||kind==='lantern')return travel(glyph(kind,p,i),x+w*(.06+u*.85),y+h+14,(v-.5)*w*.14,-h-32,kind==='lantern'?size*(city?1.2:1):size,i,kind==='lantern'?'ascending':'rising',kind==='lantern'?22+v*17:11+v*9,kind==='lantern'?.7:.8);
      if(kind==='dandelion'||kind==='paper'||kind==='ribbon')return travel(glyph(kind,p,i),x-20,y+h*(.2+v*.62),w+40,(u-.55)*h*.28,size,i,kind==='paper'?'paperflight':kind==='ribbon'?'ribbonflight':'windborne',16+v*17,kind==='ribbon'?.62:.8);
      // Lights stay near the greenery; butterflies meander between trees.
      const px=x+w*(.17+u*.63),py=y+h*(kind==='firefly'?.55+v*.29:.35+v*.35);
      return travel(glyph(kind,p,i),px,py,(unit(i,16)-.5)*w*(kind==='firefly'?.13:.33),(unit(i,18)-.5)*h*(kind==='firefly'?.2:.38),size,i,kind==='firefly'?'firefly':'butterfly',kind==='firefly'?6+v*7:11+v*8,kind==='firefly'?.95:.85);
    }).join('');
  }
  function meteors(design,box,city,indoor){
    const [x,y,w,h]=box,count=indoor?2:city?4:3;
    return Array.from({length:count},(_,i)=>travel(glyph('meteor',design.palette,i),x+w*(.36+unit(i,3)*.56),y+h*(.04+unit(i,5)*.22),-w*.33,h*.34,city?1.25:1,i,'shooting',11+unit(i,6)*9,.95)).join('');
  }
  function sparkle(art,x,y,i,scale=1){return `<g class="fx-sparkle" transform="translate(${n(x)} ${n(y)})"><g class="fx-twinkle" style="--fx-time:${n(4+unit(i,7)*6)}s;--fx-delay:${n(-9*unit(i,14))}s"><g transform="scale(${n(scale)})">${art}</g></g></g>`;}
  function dew(design,box,city,indoor,environment){
    const [x,y,w,h]=box,p=design.palette;
    const home=[[157,153],[144,171],[220,131],[208,146],[434,182],[442,204],[235,209],[278,238],[327,204],[381,232],[188,218]];
    const street=[[178,501],[195,543],[431,588],[405,608],[743,338],[765,367],[1075,553],[1028,544],[919,603],[977,683],[523,653]];
    const roof=[[70,521],[61,543],[1100,516],[1086,538],[1049,591],[914,599]];
    const panorama=[[644,577],[675,538],[960,542],[917,590],[28,453],[1172,544]];
    const positions=indoor?Array.from({length:7},(_,i)=>[x+w*(.1+unit(i,3)*.8),y+h*(.2+unit(i,4)*.67)]):environment==='rooftop'?roof:environment==='panorama'?panorama:city?street:home;
    return positions.map(([px,py],i)=>sparkle(`${glow(8,p[0])}<circle r="${1.4+i%3*.35}" fill="${p[i%3]}"/>${i%3===0?star(4,p[2],.82):line('M-2-2 0-3',p[2],1,.9)}`,px,py,i,city?1.3:1)).join('');
  }
  function ripples(design,box,city,indoor,environment){
    const p=design.palette,[x,y,w,h]=box;
    const home=[[188,225],[310,231],[364,249],[258,268],[398,216]];
    const street=[[240,638],[442,675],[714,649],[929,675],[1090,625],[863,705]];
    const points=indoor?[[x+w*.33,y+h*.73],[x+w*.69,y+h*.86]]:environment==='rooftop'?[[428,611],[792,647],[1147,690]]:environment==='panorama'?[[824,369],[866,466],[785,578],[736,664]]:city?street:home;
    return points.map(([px,py],i)=>`<g class="fx-ripple-place" transform="translate(${px} ${py})"><g class="fx-ripple" style="--fx-time:${n(4+unit(i,3)*3)}s;--fx-delay:${n(-7*unit(i,4))}s"><ellipse rx="${city?23:13}" ry="${city?6:3.8}" stroke="${p[0]}" stroke-width="1.1"/><ellipse rx="${city?15:8}" ry="${city?3.8:2.3}" stroke="${p[1]}" stroke-width=".7" opacity=".65"/><circle r="1.1" fill="${p[2]}" opacity=".5"/></g></g>`).join('');
  }
  function sky(design,box,city,indoor){
    const p=design.palette,[x,y,w,h]=box;
    if(design.kind==='constellation'){
      const groups=indoor?1:2;
      return Array.from({length:groups},(_,i)=>{
        const bx=x+w*(i? .61:.22),by=y+h*(i?.15:.08),scale=city?1.3:1;
        const pts=i?[[0,22],[24,8],[42,21],[64,0],[83,18]]:[[0,23],[27,5],[49,30],[70,23],[90,53]];
        const lines=pts.map(([px,py],j)=>`${j?'L':'M'}${px} ${py}`).join(' ');
        return `<g class="fx-constellation" transform="translate(${n(bx)} ${n(by)}) scale(${scale})">${line(lines,p[1],.75,.38)}<g class="fx-starline">${line(lines,p[0],1,.6)}</g>${pts.map(([px,py],j)=>sparkle(`${glow(6,p[0])}${star(j%2?2.5:3.5,p[j%3])}`,px,py,j+i*5)).join('')}</g>`;
      }).join('');
    }
    const bands=Array.from({length:3},(_,i)=>{
      const bx=x+w*(.08+i*.11),by=y+h*(.16+i*.048),span=w*(.59-i*.07);
      const path=`M0 0Q${n(span*.2)} ${n(-h*.12)} ${n(span*.45)} ${n(-h*.025)}T${n(span)} ${n(-h*.07)}`;
      return `<g class="fx-nebula-cloud" transform="translate(${n(bx)} ${n(by)})"><g class="fx-haze" style="--fx-time:${28+i*9}s;--fx-delay:${-i*8}s;--fx-dx:${n(w*.045)}px">${line(path,p[i],city?33:15,.055)}${line(path,p[i],city?19:8,.09)}${line(path,p[i],city?7:3,.085)}</g></g>`;
    }).join('');
    const stars=Array.from({length:indoor?7:city?20:14},(_,i)=>sparkle(`<circle r="${i%4===0?1.5:1}" fill="${p[i%3]}"/>`,x+w*(.06+unit(i,21)*.88),y+h*(.035+unit(i,24)*.42),i)).join('');
    return bands+stars;
  }
  function water(design,box,city,indoor,environment){
    const p=design.palette,[x,y,w,h]=box,count=indoor?3:environment==='rooftop'?4:city?7:5;
    const river=[[797,303],[837,358],[855,440],[805,506],[766,580],[722,644],[690,690]];
    const roof=[[423,582],[774,620],[869,680],[1091,662]];
    const home=[[174,222],[231,242],[309,237],[256,260],[342,249]];
    return Array.from({length:count},(_,i)=>{
      const bx=indoor?x+w*(.12+unit(i,3)*.55):environment==='panorama'?river[i][0]:environment==='rooftop'?roof[i][0]:city?100+unit(i,3)*830:home[i][0];
      const by=indoor?y+h*(.65+unit(i,5)*.24):environment==='panorama'?river[i][1]:environment==='rooftop'?roof[i][1]:city?577+unit(i,5)*110:home[i][1];
      const width=(environment==='panorama'||environment==='rooftop'?30:city?85:30)+unit(i,6)*(environment==='panorama'||environment==='rooftop'?40:city?90:17),curve=(i%2?1:-1)*(city?8:4);
      const path=`M0 0Q${n(width*.28)} ${curve} ${n(width*.5)} 0T${n(width)} 0`;
      const prism=design.kind==='prism';
      const art=prism?`${line(path,p[i%4],city?3:2,.5)}${line(`M6 3Q${n(width*.27)} ${curve+3} ${n(width*.52)} 3T${n(width-6)} 3`,p[(i+1)%4],1.1,.56)}${star(2,p[2],.55)}`:`${line(path,p[0],city?1.5:1,.68)}${line(`M8 4Q${n(width*.3)} ${curve+4} ${n(width*.54)} 4T${n(width-10)} 4`,p[1],.65,.38)}`;
      return travel(art,bx,by,city?33:17,city?-5:-2,1,i,'waterflow',8+unit(i,7)*7,.75);
    }).join('');
  }
  function scene(id,mode='home',options={}){
    if(!own(id)||!['home','city'].includes(mode))return '';
    const design=designs[id],city=mode==='city';
    const environment=city&&['interior','rooftop','panorama'].includes(options?.environment)?options.environment:city?'street':'island';
    const indoor=environment==='interior';
    const region=options?.region;
    const box=city&&indoor&&Array.isArray(region)&&region.length===4&&region.every(v=>Number.isFinite(v))&&region[2]>0&&region[3]>0?region:city?[0,0,1200,720]:[28,12,534,307];
    let content='';
    if(['petal','snow','maple','ginkgo','moonpetal'].includes(design.kind))content=falling(design,box,city,indoor);
    else if(['firefly','dandelion','butterfly','bubble','lantern','paper','ribbon'].includes(design.kind))content=flying(design,box,city,indoor);
    else if(design.kind==='meteor')content=meteors(design,box,city,indoor);
    else if(design.kind==='dew')content=dew(design,box,city,indoor,environment);
    else if(design.kind==='rainring')content=ripples(design,box,city,indoor,environment);
    else if(['nebula','constellation'].includes(design.kind))content=sky(design,box,city,indoor);
    else content=water(design,box,city,indoor,environment);
    if(!city&&['dew','rainring','wave','prism'].includes(design.kind))content=`<g class="fx-terrain">${content}</g>`;
    return `<g class="fx-scene fx-scene-${mode} fx-style-${design.kind}${design.premium?' fx-premium':''}" data-fx-scene="${id}" data-fx-mode="${mode}" data-fx-environment="${environment}" aria-hidden="true" pointer-events="none" fill="none" stroke="none">${content}</g>`;
  }
  return Object.freeze({ids,has,scene});
});
