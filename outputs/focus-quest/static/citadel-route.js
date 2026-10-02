(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusCitadelRoute=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const point=(x,y)=>Object.freeze({x,y});
  const places=Object.freeze([
    Object.freeze({id:'dock',x:230,y:565,threshold:0,position:point(245,588)}),
    Object.freeze({id:'workshop',x:245,y:326,threshold:.25,position:point(246,352)}),
    Object.freeze({id:'archive',x:600,y:178,threshold:.5,position:point(600,210)}),
    Object.freeze({id:'observatory',x:950,y:330,threshold:.75,position:point(950,363)}),
    Object.freeze({id:'gate',x:925,y:565,threshold:1,position:point(925,595)}),
    Object.freeze({id:'core',x:595,y:425,threshold:0,position:point(595,425)}),
  ]);
  const controls=[[[159,511],[171,424]],[[365,367],[397,213]],[[784,207],[793,365]],[[1022,433],[1021,518]]];
  const segments=Object.freeze(controls.map((pair,index)=>{
    const start=places[index].position,end=places[index+1].position,control1=point(...pair[0]),control2=point(...pair[1]);
    return Object.freeze({from:places[index].id,to:places[index+1].id,thresholdStart:index/4,thresholdEnd:(index+1)/4,
      points:Object.freeze({start,control1,control2,end}),path:`M${start.x} ${start.y}C${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`});
  }));
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  function sample(segment,t){
    const {start:a,control1:b,control2:c,end:d}=segment.points,u=1-t;
    return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};
  }
  function build(value){
    const percent=finite(value)?Math.max(0,value):0,progress=Math.min(1,percent/100);
    const stage=Math.min(4,Math.floor(progress*4)),index=Math.min(3,stage),segmentProgress=progress>=1?1:progress*4-index;
    const segment=segments[index],{start:a,control1:b,control2:c,end:d}=segment.points,t=segmentProgress,u=1-t;
    const dx=3*u*u*(b.x-a.x)+6*u*t*(c.x-b.x)+3*t*t*(d.x-c.x);
    return {progress,percent,stage,fromId:segment.from,toId:segment.to,segmentProgress,position:sample(segment,t),direction:dx<0?-1:1};
  }
  return {places,segments,build};
});
