(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusIslandEffects=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Effects share one drawing language, but each purchased style has its own
  // silhouette, larger focal details and near/far composition. Output is fully
  // deterministic: no allocated SVG IDs, timers or randomness on repaint.
  const designs=Object.freeze({
    'fx-fireflies':{kind:'firefly',palette:['#fff0b9','#a4dcb6','#d6e6a0']},
    'fx-petals':{kind:'petal',palette:['#f0bdcd','#fff0d7','#c89ccb']},
    'fx-snow':{kind:'snow',palette:['#dceff4','#a8d5e7','#f3f1df']},
    'fx-meteor':{kind:'meteor',palette:['#ffd9a9','#9bdbdf','#e0bddf'],premium:true},
    'fx-nebula':{kind:'nebula',palette:['#b6bbf0','#96d5cd','#e5bbde'],premium:true},
    'fx-dandelion':{kind:'dandelion',palette:['#f0e8c4','#acd1b7','#d9dfbc']},
    'fx-butterflies':{kind:'butterfly',palette:['#b5d9d6','#e3b7d4','#eed9b2']},
    'fx-bubbles':{kind:'bubble',palette:['#b1e1e8','#d9c7ee','#faf1d3']},
    'fx-ribbons':{kind:'ribbon',palette:['#d5b6e8','#a8dfd9','#f3d2b5'],premium:true},
    'fx-lanterns':{kind:'lantern',palette:['#f5d393','#e8ad86','#ffeac0'],premium:true},
    'fx-constellation':{kind:'constellation',palette:['#d3d9fa','#b0d6e5','#f4ddab'],premium:true},
    'fx-dewdrops':{kind:'dew',palette:['#b5e1cf','#8fc6cb','#f0efd3']},
    'fx-maplekeys':{kind:'maple',palette:['#d9bd98','#abc6a3','#f0dbb1']},
    'fx-papercycles':{kind:'paper',palette:['#dbe2eb','#a5cbd2','#ecd5b8']},
    'fx-rainrings':{kind:'rainring',palette:['#b1d7e8','#91bfc6','#e4e4ee']},
    'fx-ginkgobreeze':{kind:'ginkgo',palette:['#f0d798','#d4c293','#b8d0ac']},
    'fx-silverwaves':{kind:'wave',palette:['#c4e3ef','#9dbfdc','#e7d9f5'],premium:true},
    'fx-moonpetals':{kind:'moonpetal',palette:['#e3d0f0','#f3deb7','#b3d7dc'],premium:true},
    'fx-prismtides':{kind:'prism',palette:['#aacfe9','#d4b9ec','#9fd9c6','#f1c6b1'],premium:true}
  });
  const ids=Object.freeze(['fx-default',...Object.keys(designs)]);
  const homeFar=[[73,76,.67],[154,46,.56],[227,35,.52],[385,41,.58],[471,68,.76],[527,123,.67],[53,163,.52],[502,211,.62]];
  const homeNear=[[83,236,.88],[161,267,.72],[230,295,.65],[426,279,.83],[524,258,.96],[498,164,.87],[107,129,.9],[380,83,.69]];
  const cityFar=[[83,110,1.15],[251,59,.85],[415,52,.84],[610,36,.75],[867,69,.96],[1079,108,1.25],[1151,246,1.05],[59,280,1.1]];
  const cityNear=[[91,572,1.48],[219,635,1.12],[353,683,1.09],[908,676,1.28],[1127,590,1.5],[1079,485,1.35],[100,427,1.27],[768,680,1.04]];
  function has(id){return typeof id==='string'&&ids.includes(id);}
  function star(radius,color,opacity=1){return `<path d="M0 ${-radius} ${radius*.3} ${-radius*.3} ${radius} 0 ${radius*.3} ${radius*.3} 0 ${radius} ${-radius*.3} ${radius*.3} ${-radius} 0 ${-radius*.3} ${-radius*.3}Z" fill="${color}" opacity="${opacity}"/>`;}
  function halo(radius,color){return `<circle r="${radius}" fill="${color}" opacity=".035"/><circle r="${radius*.7}" fill="${color}" opacity=".065"/><circle r="${radius*.38}" fill="${color}" opacity=".12"/>`;}
  function line(path,color,width=1.6,opacity=.8){return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;}
  function ring(rx,ry,color,width=1.5,opacity=.65){return `<ellipse rx="${rx}" ry="${ry}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;}
  function glyph(kind,p,index=0){
    const [a,b,c]=p;
    switch(kind){
      case 'firefly':return `${halo(19,a)}<ellipse cy="-2" rx="5.5" ry="8" fill="${a}"/><path d="M-3-6q-14-10-14 0 1 9 13 7m7-7q14-10 14 0-1 9-13 7" fill="${b}" opacity=".65"/>${line('M-2-9-5-14M2-9 5-14',c,1.3)}<circle cy="4" r="4" fill="${c}"/>`;
      case 'petal':return `<path d="M-17-2Q-7-24 11-17 26-9 8 8-8 18-17-2Z" fill="${a}" opacity=".88"/>${line('M-11 7 14-12',c,1.1,.65)}<path d="M2-16q-13 7-15 17 17-6 15-17" fill="${b}" opacity=".45"/>`;
      case 'snow':return `${halo(22,b)}${line('M0-17V17M-15-8 15 8M-15 8 15-8M0-11-5-15M0-11 5-15M0 11-5 15M0 11 5 15M-10-5-13 0M-10-5-10-11M10 5 10 11M10 5 13 0M-10 5-10 11M-10 5-13 0M10-5 10-11M10-5 13 0',a,1.8,.88)}<circle r="3" fill="${c}"/>`;
      case 'meteor':return `${line('M-41-27-6-4',b,7,.12)}${line('M-43-28-4-3',a,3.2,.55)}${line('M-34-23-2-1',c,1.2,.85)}${halo(15,a)}${star(9,a)}<circle r="2" fill="${c}"/>`;
      case 'nebula':return `${halo(25,b)}<path d="M-24 0Q-8-16 9-7T26-5Q12 14-7 7T-24 0Z" fill="${a}" opacity=".32"/><path d="M-26 3Q-4-7 18 3" fill="none" stroke="${b}" stroke-width="3" opacity=".62"/>${star(index%2?6:4,c,.86)}<circle cx="17" cy="-11" r="2" fill="${b}"/>`;
      case 'dandelion':return `${line('M0-3 7 19M0-4-13-12M0-4 13-12M0-4-9-19M0-4 9-19M0-4 0-22',a,1.6,.9)}<g fill="${c}"><circle cx="-13" cy="-12" r="2.6"/><circle cx="13" cy="-12" r="2.6"/><circle cx="-9" cy="-19" r="2.2"/><circle cx="9" cy="-19" r="2.2"/><circle cy="-22" r="2.4"/></g><path d="M3 7q12-5 13 3-5 3-10 2Z" fill="${b}" opacity=".75"/>`;
      case 'butterfly':return `<g class="fx-wing"><path d="M0-2C-20-28-31-12-20 1-31 21-9 26 0 5Z" fill="${a}" opacity=".88"/><path d="M0-2C20-28 31-12 20 1 31 21 9 26 0 5Z" fill="${b}" opacity=".86"/>${line('M-3 1-21-12M3 1 21-12M-3 4-16 15M3 4 16 15',c,1.3,.72)}</g><path d="M0-8V9M0-7-4-13M0-7 4-13" stroke="${c}" stroke-width="2" fill="none"/>`;
      case 'bubble':return `<circle r="${index%3===0?19:14}" fill="${b}" opacity=".055"/><circle r="${index%3===0?19:14}" fill="none" stroke="${a}" stroke-width="1.7" opacity=".84"/>${line('M-9-7Q-4-13 3-11',c,2.5,.93)}<circle cx="7" cy="8" r="2" fill="${b}" opacity=".68"/>`;
      case 'ribbon':return `<path d="M-3 0Q-28-25-23-4-14 8-3 0M3 0Q28-25 23-4 14 8 3 0" fill="${a}" opacity=".83"/><path d="M-3 0Q-15 8-21 19l8-2 4 5L2 1M3 0q14 8 21 15l-9 1-1 6L-2 1" fill="${b}" opacity=".84"/>${line('M-18-6-3 0 18-6',c,1.1,.68)}<circle r="3.5" fill="${c}"/>`;
      case 'lantern':return `${halo(24,a)}<path d="M-10-13Q-18 0-10 12H10Q18 0 10-13Z" fill="${a}" opacity=".84"/><path d="M-7-13h14V12H-7Z" fill="${c}" opacity=".5"/>${line('M-10-10H10M-13-2H13M-12 7H12M0-13V12',b,1.1,.65)}<path d="M-9-15H9M-9 14H9M0 14V24M-4 23H4" stroke="${b}" stroke-width="2" fill="none"/>`;
      case 'constellation':return `${halo(20,b)}${star(index%2?10:8,a,.95)}${line('M-15-2-7-14 11-11 17 6',b,1.1,.6)}<g fill="${c}"><circle cx="-15" cy="-2" r="2"/><circle cx="-7" cy="-14" r="2"/><circle cx="11" cy="-11" r="2"/><circle cx="17" cy="6" r="1.9"/></g>`;
      case 'dew':return `${halo(21,a)}<path d="M0-20C-5-9-15 2-12 10-8 24 13 22 13 8 13 0 4-10 0-20Z" fill="${b}" opacity=".55"/>${line('M0-20C-5-9-15 2-12 10-8 24 13 22 13 8 13 0 4-10 0-20Z',a,1.6,.87)}${line('M-7 5q-3 8 3 11',c,2,.93)}<circle cx="6" cy="10" r="2" fill="${a}"/>`;
      case 'maple':return `<path d="M0 2Q-15-25-29-19-26-4-5 5ZM0 2Q15-25 29-19 26-4 5 5Z" fill="${a}" opacity=".86"/><path d="M0 2Q-10-15-20-17-18-6-3 5ZM0 2Q10-15 20-17 18-6 3 5Z" fill="${b}" opacity=".62"/>${line('M-24-16 0 5 24-16M0 5V19',c,1.4,.86)}<circle cy="5" r="3" fill="${c}"/>`;
      case 'paper':return `<path d="M-24 2 24-16 5 17-2 5Z" fill="${a}" opacity=".94"/><path d="M-2 5 24-16 4 4 5 17Z" fill="${b}"/><path d="M-24 2-2 5 24-16-7 0Z" fill="${c}" opacity=".66"/>${line('M-34 8-23 6M-43 14-28 11',b,1.5,.63)}`;
      case 'rainring':return `${ring(23,8,a,1.5,.83)}<g class="fx-waterline">${ring(15,5,b,1.3,.79)}${ring(30,11,c,1,.37)}</g><path d="M2-19q-8 11 0 12 8-1 0-12Z" fill="${a}" opacity=".83"/>${line('M-16 0 16 0',b,1,.4)}`;
      case 'ginkgo':return `<path d="M0 9Q-10 5-23-7-24-20-11-16-4-24 0-13 4-24 11-16 24-20 23-7 10 5 0 9Z" fill="${a}" opacity=".91"/>${line('M0 9-17-11M0 9-8-14M0 9 0-12M0 9 8-14M0 9 17-11M0 9 5 23',c,1.25,.68)}<path d="M-23-7Q-10 5 0 9 10 5 23-7 16 7 0 11-16 7-23-7Z" fill="${b}" opacity=".58"/>`;
      case 'wave':return `${line('M-31 0Q-18-12-6 0T19 0T34-3',a,3,.77)}${line('M-25 7Q-12-5 0 7T26 7',b,1.6,.85)}<circle cx="-17" cy="-8" r="3" fill="${c}" opacity=".85"/><circle cx="18" cy="12" r="2" fill="${a}"/>`;
      case 'moonpetal':return `${halo(22,b)}<path d="M-17-13Q7-24 18-4-6-10-6 12 7 18 18 4 10 24-10 19-25 7-17-13Z" fill="${a}" opacity=".85"/>${line('M-18-6q-4 15 10 21',b,1.5,.82)}<g transform="translate(14 -15)">${star(4,c)}</g>`;
      case 'prism':return `<path d="M0-25 23 0 0 25-20 0Z" fill="${a}" opacity=".35"/><path d="M0-25 3 0-20 0Z" fill="${b}" opacity=".8"/><path d="M0-25 23 0 3 0Z" fill="${c}" opacity=".75"/><path d="M-20 0 3 0 0 25Z" fill="${p[3]}" opacity=".8"/><path d="M3 0 23 0 0 25Z" fill="${a}" opacity=".79"/>${line('M0-25 23 0 0 25-20 0Z',c,1.2,.9)}${line('M-20 0H23M0-25 3 0 0 25',b,1,.83)}`;
      default:return '';
    }
  }
  function mote(content,position,index,kind,near=false){
    const [x,y,scale]=position;
    const motion=['snow','petal','ginkgo','maple','moonpetal','dandelion'].includes(kind)?'fx-fall':['meteor','paper','ribbon','wave'].includes(kind)?'fx-stream':'fx-float';
    return `<g class="fx-mote${near?' fx-mote-near':' fx-mote-far'}" transform="translate(${x} ${y}) scale(${scale})"><g class="fx-mote-motion ${motion}" style="--fx-period:${8+index%5*1.35}s;--fx-delay:${-(index*1.17).toFixed(2)}s;--fx-shift:${near?9:6}px;--fx-lean:${index%2?5:-5}deg">${content}</g></g>`;
  }
  function anchor(content,x,y,scale=1,extra=''){return `<g class="fx-core ${extra}" transform="translate(${x} ${y}) scale(${scale})"><g class="fx-core-motion">${content}</g></g>`;}
  function seedHead(p){return `${halo(46,p[0])}${line('M0-11V49M0 24q-25-7-21 8 12 3 21-8',p[1],2,.78)}<g fill="${p[0]}">${Array.from({length:10},(_,i)=>{const angle=i*Math.PI/5,x=Math.round(Math.cos(angle)*27),y=Math.round(Math.sin(angle)*27)-12;return `${line(`M0-12 ${x} ${y}`,p[2],1.1,.75)}<circle cx="${x}" cy="${y}" r="3.2"/>`;}).join('')}</g><circle cy="-12" r="4" fill="${p[2]}"/>`;}
  function core(design,city){
    const {kind,palette:p}=design,[a,b,c]=p;
    const left=city?[156,161,1.8]:[107,107,.94],right=city?[1056,154,1.7]:[483,122,.91];
    const at=(content,which=left,extra='')=>anchor(content,...which,extra);
    switch(kind){
      case 'firefly':return at(`${halo(45,a)}${ring(32,15,b,1.4,.48)}${glyph(kind,p)}${anchor(glyph(kind,p),-30,20,.52)}${anchor(glyph(kind,p),23,-22,.48)}`)+at(`${halo(38,a)}${glyph(kind,p)}${anchor(glyph(kind,p),28,20,.62)}`,right);
      case 'petal':return at(`<g class="fx-rosette">${Array.from({length:5},(_,i)=>`<g transform="rotate(${i*72}) translate(0 -22) scale(.7)">${glyph(kind,p)}</g>`).join('')}<circle r="7" fill="${b}"/></g>`)+at(`${halo(39,a)}<g transform="rotate(-22) scale(1.25)">${glyph(kind,p)}</g>`,right);
      case 'snow':return at(`<g transform="scale(1.8)"><g class="fx-rosette">${glyph(kind,p)}</g></g>`)+at(`<g transform="rotate(30) scale(1.5)">${glyph(kind,p)}</g>`,right);
      case 'meteor':return at(`<g transform="rotate(-8) scale(1.65)">${glyph(kind,p)}</g>`)+at(`<g transform="rotate(20) scale(1.3)">${glyph(kind,[b,a,c])}</g>`,right);
      case 'nebula':return at(`${halo(50,b)}<g class="fx-rosette">${ring(46,15,a,2,.74)}<g transform="rotate(52)">${ring(42,16,c,1.5,.62)}</g><g transform="rotate(-34)">${ring(39,12,b,2.5,.61)}</g></g>${star(13,a,.84)}<circle cx="-32" cy="-15" r="4" fill="${c}"/>`)+at(`<g transform="scale(1.4)">${glyph(kind,p)}</g>`,right);
      case 'dandelion':return at(seedHead(p))+at(`<g transform="scale(.9)">${seedHead(p)}</g>`,right);
      case 'butterfly':return at(`${halo(40,a)}<g transform="rotate(-17) scale(1.2)">${glyph(kind,p)}</g>`)+at(`<g transform="rotate(15) scale(1.25)">${glyph(kind,[b,a,c])}</g>`,right);
      case 'bubble':return at(`<g transform="scale(2)">${glyph(kind,p,0)}</g>${anchor(glyph(kind,p),29,35,.65)}`)+at(`<g transform="scale(1.65)">${glyph(kind,p,0)}</g>${anchor(glyph(kind,p),-25,31,.6)}`,right);
      case 'ribbon':return at(`${halo(42,a)}<g transform="rotate(-18) scale(1.45)">${glyph(kind,p)}</g>`)+at(`<g transform="rotate(15) scale(1.55)">${glyph(kind,[b,a,c])}</g>`,right);
      case 'lantern':return at(`<g transform="scale(1.7)">${glyph(kind,p)}</g>${anchor(glyph(kind,p),-30,27,.72)}${anchor(glyph(kind,p),30,14,.87)}`)+at(`<g transform="scale(1.35)">${glyph(kind,p)}</g>${anchor(glyph(kind,p),-27,26,.65)}`,right);
      case 'constellation':return at(`${halo(47,a)}${line('M-34 12-22-28 15-38 33-7 16 27-7 30-34 12',b,1.6,.73)}<g transform="scale(1.3)">${star(12,a)}</g>${anchor(star(6,c),-22,-28)}${anchor(star(5,c),15,-38)}${anchor(star(7,a),33,-7)}${anchor(star(5,c),16,27)}${anchor(star(4,a),-7,30)}`)+at(`${ring(40,24,a,1.3,.5)}${line('M-30 4-9-24 24-17 32 15',b,1.6,.75)}${anchor(star(9,c),-9,-24)}${anchor(star(7,a),24,-17)}${anchor(star(5,a),32,15)}`,right);
      case 'dew':return anchor(`${halo(44,a)}<g transform="translate(0 -22) scale(1.22)">${glyph(kind,p)}</g>${ring(43,12,a,1.8,.86)}<g class="fx-waterline">${ring(31,8,c,1.5,.84)}${ring(52,16,b,1.1,.62)}</g>${anchor(glyph(kind,p),34,-9,.56)}`,city?154:168,city?624:258,city?1.45:.85)+anchor(`${halo(39,b)}<g transform="translate(0 -17) scale(1.28)">${glyph(kind,p)}</g>${ring(36,10,a,1.7,.85)}<g class="fx-waterline">${ring(48,14,b,1.3,.62)}</g>`,city?1055:452,city?631:262,city?1.65:.87);
      case 'maple':return at(`<g transform="rotate(-17) scale(1.5)">${glyph(kind,p)}</g>`)+at(`<g transform="rotate(18) scale(1.3)">${glyph(kind,[b,a,c])}</g>`,right);
      case 'paper':return at(`<g transform="rotate(-7) scale(1.6)">${glyph(kind,p)}</g>`)+at(`<g transform="rotate(10) scale(1.5)">${glyph(kind,[a,c,b])}</g>`,right);
      case 'rainring':return anchor(`${halo(53,a)}${ring(59,18,a,2,.83)}<g class="fx-waterline">${ring(40,12,b,1.5,.78)}${ring(73,23,c,1.2,.47)}</g>${anchor(glyph(kind,p),42,-27,.6)}`,city?164:116,city?624:251,city?1.25:.88)+anchor(`${ring(49,16,a,1.8,.8)}<g class="fx-waterline">${ring(64,21,b,1.4,.55)}</g>${anchor(glyph(kind,p),-18,-22,.7)}`,city?1043:467,city?641:254,city?1.6:.8);
      case 'ginkgo':return at(`<g transform="rotate(-22) scale(1.48)">${glyph(kind,p)}</g>`)+at(`<g transform="rotate(20) scale(1.3)">${glyph(kind,[a,b,c])}</g>`,right);
      case 'wave':return at(`${halo(43,a)}<g transform="rotate(-12) scale(1.5)">${glyph(kind,p)}</g>${anchor(glyph(kind,[c,b,a]),12,26,.84)}`)+at(`<g transform="rotate(15) scale(1.8)">${glyph(kind,p)}</g>`,right);
      case 'moonpetal':return at(`${halo(45,b)}<g transform="rotate(-22) scale(1.4)">${glyph(kind,p)}</g><g class="fx-rosette">${ring(37,22,c,1.5,.6)}</g>`)+at(`<g transform="rotate(23) scale(1.5)">${glyph(kind,p)}</g>`,right);
      case 'prism':return at(`${halo(49,b)}<path d="M0-51V35M-34 30 36 30" fill="none" stroke="${a}" stroke-width="2" opacity=".75"/><path d="M0-47-35 20-2 14Z" fill="${c}" opacity=".62"/><path d="M4-34 36 12 4 20Z" fill="${b}" opacity=".58"/><path d="M-29 32 33 32 16 42-12 42Z" fill="${a}" opacity=".76"/>${line('M-26 12-6-27M9-18 24 5',p[3],1.5,.92)}${anchor(star(8,c),0,-48)}`)+at(`<g transform="scale(1.7)">${glyph(kind,p)}</g>${anchor(glyph(kind,[c,a,b,p[3]]),-27,35,.7)}`,right);
      default:return '';
    }
  }
  function structure(design,city){
    const {kind,palette:[a,b,c]}=design;
    const top=city?'M65 159Q300 20 540 91T1157 82':'M55 122Q152 18 305 65T543 64';
    const low=city?'M46 641Q284 547 421 650T1161 589':'M62 249Q167 197 265 266T538 235';
    const band=(path,color,width,opacity)=>line(path,color,width,opacity);
    switch(kind){
      case 'firefly':return band(city?'M38 188Q171 74 299 158M950 197Q1075 98 1164 233':'M56 166Q95 62 192 108M407 117Q485 76 535 171',b,2,.44)+band(low,a,1.2,.34);
      case 'petal':return band(top,a,city?4:2.2,.32)+band(low,c,city?3:1.7,.38);
      case 'snow':return band(top,b,city?3:1.6,.41)+band(city?'M15 327Q140 272 246 310M1000 328Q1110 256 1190 291':'M45 180Q114 159 176 176M436 182Q517 158 548 182',a,1.7,.36);
      case 'meteor':return band(top,a,city?10:5,.09)+band(top,b,city?2.3:1.4,.65)+band(city?'M330 40 472 93M874 17 1045 113M1051 210 1146 266':'M152 23 221 65M399 16 465 61M470 189 531 224',c,city?3:1.8,.58);
      case 'nebula':return `<g class="fx-veil">${band(top,a,city?44:23,.095)}${band(top,b,city?20:11,.16)}${band(city?'M21 199Q290 67 585 118T1188 127':'M36 162Q192 73 309 92T552 106',c,city?16:8,.14)}${band(top,a,city?2.2:1.1,.57)}</g>`;
      case 'dandelion':return band(top,c,1.3,.45)+band(low,b,city?2.7:1.6,.48);
      case 'butterfly':return band(top,b,1.8,.4)+band(city?'M53 480Q232 436 316 515M923 510Q1096 399 1167 480':'M54 219Q109 182 194 217M408 234Q489 170 540 213',c,city?2.7:1.4,.44);
      case 'bubble':return `<g class="fx-veil">${band(top,b,city?4:2,.35)}${band(low,a,city?2.5:1.5,.45)}</g>`;
      case 'ribbon':return `<g class="fx-veil">${band(top,a,city?14:7,.36)}${band(city?'M44 174Q296 41 523 102T1151 106':'M47 139Q161 35 291 76T536 88',b,city?10:5,.36)}${band(low,c,city?11:5,.25)}${band(top,c,city?2.2:1.2,.78)}</g>`;
      case 'lantern':return band(top,c,city?2.7:1.5,.58)+band(city?'M61 198Q173 174 287 197M950 231Q1060 182 1159 222':'M69 164Q126 147 178 157M421 176Q479 140 528 168',b,city?1.9:1.1,.48);
      case 'constellation':return band(city?'M61 131 254 70 431 45M614 37 864 84 1083 113 1152 246':'M73 76 154 46 227 35M385 41 471 68 527 123 502 211',b,city?1.7:1.2,.66)+band(city?'M90 572 219 635 353 683M908 676 1152 590 1079 485':'M83 236 161 267 230 295M426 279 524 258 498 164',a,city?1.5:1,.53);
      case 'dew':return band(low,a,city?3.3:1.8,.58)+band(city?'M52 554Q164 413 305 528M923 517Q1073 398 1166 526':'M62 232Q115 155 189 208M429 223Q494 147 538 208',b,city?2.2:1.4,.4);
      case 'maple':return band(top,a,city?3:1.6,.43)+band(low,b,city?3:1.6,.46);
      case 'paper':return `<g stroke-dasharray="${city?'9 11':'5 6'}">${band(top,b,city?2.5:1.5,.58)}${band(low,c,city?2.5:1.5,.57)}</g>`;
      case 'rainring':return band(city?'M14 669Q110 602 286 651M959 679Q1074 608 1191 652':'M44 282Q113 234 200 270M412 284Q485 235 549 270',a,city?2.5:1.5,.66)+band(city?'M24 682Q121 621 279 662M968 691Q1072 630 1177 668':'M61 292Q124 250 190 281M428 293Q489 252 531 280',b,city?2:1.1,.51);
      case 'ginkgo':return band(top,a,city?3.4:1.8,.41)+band(low,c,city?2.8:1.5,.47);
      case 'wave':return `<g class="fx-veil">${band(low,a,city?9:4.4,.23)}${band(low,c,city?2.8:1.6,.8)}${band(city?'M15 659Q302 553 444 666T1187 612':'M41 267Q157 209 276 280T552 251',b,city?4:2,.64)}${band(city?'M38 680Q270 587 432 683T1171 639':'M53 288Q164 226 284 295T536 274',a,city?2.7:1.5,.7)}</g>`;
      case 'moonpetal':return `<g class="fx-veil">${band(top,b,city?3.3:1.8,.68)}${band(city?'M31 177Q264 50 534 108T1190 97':'M40 141Q157 37 303 80T556 78',a,city?12:6,.17)}${band(low,c,city?2.6:1.4,.54)}</g>`;
      case 'prism':return `<g class="fx-veil">${band(top,a,city?12:6,.16)}${band(city?'M58 178Q309 47 536 111T1159 110':'M47 142Q172 41 304 84T545 89',b,city?9:4.5,.19)}${band(top,c,city?2.7:1.5,.67)}${band(low,a,city?3.6:2,.57)}</g>`;
      default:return '';
    }
  }
  function scene(id,mode='home'){
    if(typeof id!=='string'||!Object.prototype.hasOwnProperty.call(designs,id)||!['home','city'].includes(mode))return '';
    const design=designs[id];
    const city=mode==='city',far=city?cityFar:homeFar,near=city?cityNear:homeNear;
    const count=design.premium?8:6;
    const farArt=far.slice(0,count).map((position,index)=>mote(glyph(design.kind,design.palette,index),position,index,design.kind)).join('');
    const nearArt=near.map((position,index)=>mote(glyph(design.kind,design.palette,index+count),position,index+count,design.kind,true)).join('');
    return `<g class="fx-scene fx-scene-${mode} fx-style-${design.kind}${design.premium?' fx-premium':''}" data-fx-scene="${id}" data-fx-mode="${mode}" aria-hidden="true" pointer-events="none" fill="none" stroke="none"><g class="fx-distance-layer">${structure(design,city)}${farArt}</g><g class="fx-core-layer">${core(design,city)}</g><g class="fx-near-layer">${nearArt}</g></g>`;
  }
  return Object.freeze({ids,has,scene});
});
