(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FocusRecordTime=api;
})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const pad=value=>String(value).padStart(2,'0');
  const parsed=value=>typeof value==='string'&&value.trim()&&Number.isFinite(Date.parse(value))?new Date(value):null;
  const day=date=>date?`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`:null;
  function parts(record){
    const row=record&&typeof record==='object'?record:{},end=parsed(row.end);
    let start=parsed(row.start),inferred=false;
    const minutes=typeof row.minutes==='number'?row.minutes:typeof row.minutes==='string'&&row.minutes.trim()?Number(row.minutes):NaN;
    if((!start||(end&&start>end))&&end&&Number.isFinite(minutes)&&minutes>=0){
      const value=new Date(end.getTime()-minutes*60000);
      start=Number.isFinite(value.getTime())?value:null;inferred=Boolean(start);
    }
    if(start&&end&&start>end)start=null;
    return {start,end,inferred:inferred||row.startInferred===true,startDay:day(start),endDay:day(end)};
  }
  function clock(date,seconds=false){return date?`${pad(date.getHours())}:${pad(date.getMinutes())}${seconds?':'+pad(date.getSeconds()):''}`:'—';}
  function range(record,options={}){
    const p=parts(record),seconds=options.seconds??Boolean(p.start?.getSeconds()||p.end?.getSeconds());
    const reference=/^\d{4}-\d{2}-\d{2}$/.test(options.referenceDay||'')?options.referenceDay:null;
    const different=p.startDay&&p.endDay&&p.startDay!==p.endDay;
    const showDate=options.dates===true||different||Boolean(reference&&((p.startDay&&p.startDay!==reference)||(p.endDay&&p.endDay!==reference)));
    const showYear=Boolean(p.start&&p.end&&p.start.getFullYear()!==p.end.getFullYear())||Boolean(reference&&((p.startDay&&p.startDay.slice(0,4)!==reference.slice(0,4))||(p.endDay&&p.endDay.slice(0,4)!==reference.slice(0,4))));
    const display=date=>date?`${showDate?`${showYear?date.getFullYear()+'/':''}${pad(date.getMonth()+1)}/${pad(date.getDate())} `:''}${clock(date,seconds)}`:'—';
    return `${display(p.start)} → ${display(p.end)}`;
  }
  function describe(record,options={}){const p=parts(record);return `开始 → 结束：${range(record,options)}${p.inferred?'（开始时间按持续时长回算）':''}`;}
  function group(records,options={}){
    const rows=(Array.isArray(records)?records:[]).map(parts),starts=rows.map(r=>r.start).filter(Boolean),ends=rows.map(r=>r.end).filter(Boolean);
    if(!ends.length)return '— → —';
    return range({start:starts.length?new Date(Math.min(...starts.map(Number))).toISOString():null,end:new Date(Math.max(...ends.map(Number))).toISOString()},options);
  }
  return {parts,range,describe,group};
});
