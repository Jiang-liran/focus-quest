const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const heatmap = require('../static/review-heatmap.js');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(period='month',anchor='2026-09-27', options={}) {
  const {start,end}=heatmap.bounds(period,anchor),today=options.today||'2026-09-27';
  const days=heatmap.rangeDays(start,end).map((date,index)=>({date,minutes:((index%5)+1)*120,
    target:480,targets:{math:180,cs:180,politics:60,english:60},future:date>today,
    achieved:date>today?null:index%5>=3,targetEstimated:false,targetSource:'recorded',
    subjects:[{id:'math',name:'数学',minutes:120,target:180,achieved:false},{id:'cs',name:'408',minutes:180,target:180,achieved:true}]}));
  const weeks=heatmap.rangeDays(heatmap.monday(start),heatmap.monday(end)).filter((_,i)=>i%7===0).map(weekStart=>({weekStart,weekEnd:heatmap.addDays(weekStart,6),minutes:3200,target:3000,confirmed:true,locked:true,achieved:weekStart<=today,targetEstimated:false,targetSource:'confirmed'}));
  return {period,anchor,today,start,end,days,weeks,summary:{minutes:days.filter(d=>!d.future).reduce((sum,d)=>sum+d.minutes,0),activeDays:days.filter(d=>!d.future).length,achievedDays:days.filter(d=>d.achieved).length,knownGoalDays:days.filter(d=>!d.future).length,estimatedGoalDays:0},...options};
}
function state(patch={}) {return {date:'2026-09-27',today:'2026-09-27',heatmapRevision:1,allTime:{records:50,minutes:20000},totals:{minutes:400,target:480},subjects:[],goals:{today:{target:480}},weekly:{minutes:3000,target:3000},...patch};}
function harness(initial=state(), page='review') {
  const requests=[],chosen=[];let current=initial;
  const element=(dataset={})=>({dataset,attributes:{},hidden:false,disabled:false,textContent:'',_html:'',writes:0,
    get innerHTML(){return this._html;},set innerHTML(value){this._html=value;this.writes++;},setAttribute(key,value){this.attributes[key]=value;}});
  const children=new Map([['.hm-status',element()],['.hm-body',element()],...['current','previous','next'].map(action=>[`[data-hm-action="${action}"]`,element({hmAction:action})])]);
  const tabs=['week','month','year'].map(period=>element({hmPeriod:period}));
  const mount=element();mount.classList={add(){}};mount.listeners={};mount.addEventListener=(type,fn)=>{mount.listeners[type]=fn;};mount.querySelector=selector=>children.get(selector);mount.querySelectorAll=()=>tabs;mount.contains=()=>true;
  const root={document:{body:{dataset:{page}},hidden:false,getElementById:()=>mount}};
  const controller=heatmap.createController(root);
  controller.init({api:path=>new Promise((resolve,reject)=>requests.push({path,resolve,reject})),chooseDate:value=>chosen.push(value),getState:()=>current});
  const render=patch=>{if(patch)current=patch;controller.render(current);};
  const click=dataset=>{const button={dataset,disabled:false};mount.listeners.click({target:{closest:()=>button}});};
  const respond=(position=0,payload)=>{const request=requests.splice(position,1)[0];assert.ok(request,'pending request exists');const url=new URL(request.path,'http://test');request.resolve(payload||fixture(url.searchParams.get('period'),url.searchParams.get('anchor')));return request;};
  return {requests,chosen,mount,body:children.get('.hm-body'),status:children.get('.hm-status'),root,controller,render,click,respond,tabs,children};
}

test('calendar arithmetic rejects impossible dates and respects leap years',()=>{
  assert.equal(heatmap.date('2026-02-29'),null);assert.equal(heatmap.date('2024-02-29').getUTCDate(),29);
  assert.equal(heatmap.date('2026-2-01'),null);
  assert.deepEqual(heatmap.bounds('month','2024-02-17'),{start:'2024-02-01',end:'2024-02-29'});
  assert.equal(heatmap.rangeDays('2024-01-01','2024-12-31').length,366);
});
test('Monday weeks cross year boundaries and shifting January 31 never skips February',()=>{
  assert.deepEqual(heatmap.bounds('week','2027-01-01'),{start:'2026-12-28',end:'2027-01-03'});
  assert.equal(heatmap.shift('month','2026-01-31',1),'2026-02-01');
  assert.equal(heatmap.shift('month','2026-01-31',-1),'2025-12-01');
  assert.equal(heatmap.shift('year','2024-02-29',1),'2025-01-01');
  assert.equal(heatmap.shift('week','2026-12-28',1),'2027-01-04');
});
test('certification always uses dated goals, with unknown history never marked achieved',()=>{
  const known={date:'2026-09-01',minutes:240,target:240,achieved:true,targetEstimated:false};
  assert.equal(heatmap.dayStatus(known),'achieved');
  assert.equal(heatmap.dayStatus({...known,minutes:300}),'surpassed');
  assert.equal(heatmap.dayStatus({...known,targetEstimated:true}),'unverified');
  assert.equal(heatmap.dayStatus({...known,achieved:null}),'unverified');
  assert.equal(heatmap.dayStatus({...known,future:true}),'future');
  const legacy=heatmap.dayButton({...known,targetEstimated:true},null,'2026-09-27');
  assert.doesNotMatch(legacy,/class="hm-day-seal"/);assert.match(legacy,/目标未存档/);
});
test('future cells are disabled, today has a marker, and date labels expose real durations',()=>{
  const day=fixture().days.find(d=>d.date==='2026-09-27');
  assert.match(heatmap.dayButton(day,day.date,day.date),/class="hm-day is-today"/);
  assert.match(heatmap.dayButton(day,day.date,day.date),/aria-pressed="true"/);
  const future=fixture().days.find(d=>d.date==='2026-09-30');
  assert.match(heatmap.dayButton(future,null,'2026-09-27'),/ disabled/);
  assert.match(heatmap.dayLabel({...day,minutes:481}),/8小时1分/);
});
test('confirmed weekly completion receives a crown and estimated week does not',()=>{
  const week=fixture().weeks[0];
  assert.match(heatmap.weekStamp(week),/is-achieved/);
  assert.doesNotMatch(heatmap.weekStamp({...week,targetEstimated:true}),/is-achieved/);
  assert.match(heatmap.weekStamp({...week,confirmed:false}),/未定档/);
});
test('month and year render each date once with calendar holes and weekly seals',()=>{
  const month=heatmap.calendar(fixture('month','2026-08-05'),null,'2026-09-27');
  assert.equal((month.match(/data-hm-day=/g)||[]).length,31);
  assert.equal((month.match(/class="hm-calendar-week"/g)||[]).length,6);
  const year=heatmap.calendar(fixture('year','2024-07-01'),null,'2026-09-27');
  assert.equal((year.match(/data-hm-day=/g)||[]).length,366);
  assert.equal((year.match(/data-hm-month=/g)||[]).length,12);
  assert.equal((year.match(/class="hm-year-column"/g)||[]).length,53);
  assert.match(year,/周目标/);
});
test('year with 54 overlapping weeks is retained without dropping December 31',()=>{
  const output=heatmap.calendar(fixture('year','2012-07-01'),null,'2026-09-27');
  assert.equal((output.match(/class="hm-year-column"/g)||[]).length,54);
  assert.match(output,/data-hm-day="2012-12-31"/);
});
test('details show historical actual targets, unknown provenance and escaped names',()=>{
  const known=fixture();known.days[0].target=240;known.days[0].subjects[0].name='<img src=x onerror=alert(1)>';
  const details=heatmap.details(known,'2026-09-01');
  assert.match(details,/当日目标 4 小时/);assert.match(details,/后续调整不会改写/);
  assert.match(details,/&lt;img/);assert.doesNotMatch(details,/<img/);
  known.days[0].targetEstimated=true;known.days[0].achieved=null;
  const unknown=heatmap.details(known,'2026-09-01');
  assert.match(unknown,/当日目标未存档/);assert.match(unknown,/目标未知/);assert.doesNotMatch(unknown,/当日目标 4 小时/);
});
test('past encouragement varies with distance to the dated target and remains retrospective',()=>{
  const day={date:'2026-09-01',target:480,achieved:false,targetEstimated:false};
  const tiers=[[0,'歇脚蓄力'],[1,'微光已留'],[119.99,'微光已留'],[120,'稳稳积累'],[239.99,'稳稳积累'],[240,'半程有光'],[359.99,'半程有光'],[360,'步履扎实'],[419.99,'步履扎实'],[420,'离约很近'],[455.99,'离约很近'],[456,'几近圆满'],[479.99,'几近圆满']];
  for(const [minutes,caption] of tiers){
    const evaluation=heatmap.dayEvaluation({...day,minutes},'2026-09-30');
    assert.equal(evaluation.caption,caption,`${minutes} minutes`);
    assert.equal(evaluation.gap,480-minutes);
    const cell=heatmap.dayButton({...day,minutes},null,'2026-09-30');
    assert.match(cell,new RegExp(caption));
    assert.match(heatmap.dayLabel({...day,minutes},'2026-09-30'),/与当日目标相差/);
    assert.doesNotMatch(cell,/在路上|未达标|点滴皆算|待点亮/);
  }
});
test('encouragement scales to adjusted targets, never rounds a near finish into a certificate',()=>{
  const day={date:'2026-09-01',target:30,minutes:5,achieved:false,targetEstimated:false};
  assert.equal(heatmap.dayEvaluation(day,'2026-09-30').caption,'微光已留');
  assert.equal(heatmap.dayEvaluation({...day,target:240,minutes:180},'2026-09-30').caption,'步履扎实');
  const almost={...day,minutes:29.99};
  assert.match(heatmap.dayLabel(almost,'2026-09-30'),/不到1分钟/);
  assert.doesNotMatch(heatmap.dayButton(almost,null,'2026-09-30'),/class="hm-day-seal"/);
});
test('today keeps current encouragement and complete, future or unknown days stay distinct',()=>{
  const day={date:'2026-09-30',target:480,minutes:120,achieved:false,targetEstimated:false};
  for(const [minutes,caption] of [[0,'待点亮'],[1,'在路上'],[120,'渐入佳境'],[240,'已过半程'],[360,'稳步接近'],[420,'最后一程'],[456,'即将达成']]){
    const evaluation=heatmap.dayEvaluation({...day,minutes},day.date);
    assert.equal(evaluation.caption,caption);assert.match(evaluation.message,/距今日目标还差/);
  }
  const completed=heatmap.dayButton({...day,minutes:480,achieved:true},null,day.date);
  assert.match(completed,/hm-completion/);assert.doesNotMatch(completed,/<strong>|<small>h<\/small>/);
  assert.equal(heatmap.dayEvaluation({...day,achieved:true},day.date).gap,0);
  assert.equal(heatmap.dayEvaluation({...day,future:true},day.date).caption,'');
  assert.equal(heatmap.dayEvaluation({...day,targetEstimated:true},day.date).caption,'目标未存档');
});
test('day details and annual labels share evaluations, with historical preset stated explicitly',()=>{
  const data=fixture(),day=data.days[0];
  Object.assign(day,{minutes:420,achieved:false,targetSource:'historical-default'});
  const detail=heatmap.details(data,day.date);
  assert.match(detail,/离约很近/);assert.match(detail,/与当日目标相差1小时/);
  assert.match(detail,/总目标8小时/);assert.match(detail,/3／3／1／1小时/);
  assert.doesNotMatch(detail,/使用当天保存的目标|点滴皆算/);
  assert.match(heatmap.dayButton(day,null,data.today,true),/离约很近/);
  assert.match(heatmap.bodyHTML(data,day.date,data.today),/未留档的历史日目标按8小时/);
  Object.assign(day,{minutes:480,achieved:true});
  assert.doesNotMatch(heatmap.details(data,day.date),/hm-detail-evaluation|相差/);
});
test('navigation and initial load remain dormant outside review',async()=>{
  const h=harness(state(),'today');h.render();await flush();assert.equal(h.requests.length,0);
  h.root.document.body.dataset.page='review';h.controller.onEnter();await flush();assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].path,'/api/heatmap?period=month&anchor=2026-09-01');
  h.respond();await flush();assert.match(h.body.innerHTML,/2026 年 9 月/);
});
test('enter and render readiness resolve after the first calendar occupies its final layout',async()=>{
  const h=harness();let settled=false;
  const ready=h.controller.onEnter();assert.equal(typeof ready?.then,'function');ready.then(()=>{settled=true;});
  await flush();assert.equal(settled,false);assert.equal(h.body.innerHTML,'');assert.equal(h.mount.attributes['aria-busy'],'true');
  // A concurrent unchanged poll shares the fetch and must not let the entrance scroll early.
  const poll=h.controller.render(state());assert.equal(typeof poll?.then,'function');
  h.respond();await ready;await poll;
  assert.equal(settled,true);assert.match(h.body.innerHTML,/2026 年 9 月/);assert.equal(h.mount.attributes['aria-busy'],'false');
  const writes=h.body.writes;await h.controller.onEnter();assert.equal(h.requests.length,0);assert.equal(h.body.writes,writes);
});
test('failed initial calendar still settles readiness after the stable error layout is displayed',async()=>{
  const h=harness(),ready=h.controller.onEnter();await flush();h.requests.shift().reject(new Error('暂时离线'));await ready;
  assert.equal(h.mount.attributes['aria-busy'],'false');assert.match(h.status.innerHTML,/暂时离线/);assert.match(h.status.innerHTML,/重新读取/);
});
test('stable polling reuses data without repeated fetches or rebuilding the calendar DOM',async()=>{
  const h=harness();h.render();await flush();h.respond();await flush();const writes=h.body.writes;
  for(let i=0;i<20;i++)h.render({...state(),now:`arbitrary${i}`});
  await flush();assert.equal(h.requests.length,0);assert.equal(h.body.writes,writes);
});
test('concurrent identical requests deduplicate and only the latest response may paint',async()=>{
  const h=harness();h.render();h.render();h.render();await flush();assert.equal(h.requests.length,1);
  h.respond();await flush();assert.match(h.body.innerHTML,/2026 年 9 月/);
  assert.equal(h.mount.attributes['aria-busy'],'false');
});
test('a slower previous period cannot replace a newer navigation result',async()=>{
  const h=harness();h.render();await flush();h.click({hmPeriod:'year'});await flush();
  assert.equal(h.requests.length,2);h.respond(1);await flush();assert.match(h.body.innerHTML,/data-period="year"/);
  h.respond(0);await flush();assert.match(h.body.innerHTML,/data-period="year"/);
});
test('date changes and revision changes invalidate old pending responses',async()=>{
  const h=harness();h.render();await flush();
  h.render(state({date:'2026-08-02',heatmapRevision:2}));await flush();
  h.respond(1);await flush();assert.match(h.body.innerHTML,/2026 年 8 月/);
  h.respond(0);await flush();assert.match(h.body.innerHTML,/2026 年 8 月/);
  h.render(state({date:'2026-08-02',heatmapRevision:3}));await flush();assert.equal(h.requests.length,1);
});
test('day selection stays local until explicit open; previous, next and current navigate coherently',async()=>{
  const h=harness();h.render();await flush();h.respond();await flush();
  h.click({hmDay:'2026-09-12'});assert.equal(h.chosen.length,0);assert.match(h.body.innerHTML,/9月12日/);
  h.click({hmAction:'open-day'});assert.deepEqual(h.chosen,['2026-09-12']);
  h.click({hmAction:'previous'});await flush();assert.match(h.requests[0].path,/2026-08-01/);h.respond();await flush();
  h.click({hmAction:'next'});await flush();assert.equal(h.requests.length,0,'September is cached');assert.match(h.body.innerHTML,/2026 年 9 月/);
  h.click({hmAction:'previous'});await flush();h.click({hmAction:'current'});await flush();assert.match(h.body.innerHTML,/9月27日/);
});
test('annual month tile opens its exact month, keeping all daily records from that month',async()=>{
  const h=harness();h.render();await flush();h.respond();await flush();
  h.click({hmPeriod:'year'});await flush();h.respond();await flush();
  h.click({hmMonth:'2026-02-01'});await flush();assert.match(h.requests[0].path,/period=month&anchor=2026-02-01/);
  h.respond();await flush();assert.equal((h.body.innerHTML.match(/data-hm-day=/g)||[]).length,28);
});
test('navigation labels use natural Chinese for each calendar period',async()=>{
  const h=harness();h.render();await flush();h.respond();await flush();
  const label=action=>h.children.get(`[data-hm-action="${action}"]`).attributes['aria-label'];
  assert.equal(label('previous'),'上一个月');assert.equal(label('next'),'下一个月');
  h.click({hmPeriod:'week'});await flush();assert.equal(label('previous'),'上一周');assert.equal(label('next'),'下一周');h.respond();await flush();
  h.click({hmPeriod:'year'});await flush();assert.equal(label('previous'),'上一年');assert.equal(label('next'),'下一年');h.respond();await flush();
});
test('hiding review stops response paint and a later visit reuses its completed cache',async()=>{
  const h=harness();h.render();await flush();const writes=h.body.writes;
  h.root.document.body.dataset.page='today';h.controller.onLeave();h.respond();await flush();assert.equal(h.body.writes,writes);
  h.root.document.body.dataset.page='review';h.controller.onEnter();await flush();assert.equal(h.requests.length,0);assert.match(h.body.innerHTML,/专注/);
});
test('failed request offers explicit retry and does not destroy previously rendered records',async()=>{
  const h=harness();h.render();await flush();h.respond();await flush();const old=h.body.innerHTML;
  h.render(state({heatmapRevision:2}));await flush();h.requests.shift().reject(new Error('连接暂时中断'));await flush();
  assert.match(h.status.innerHTML,/连接暂时中断/);assert.equal(h.body.innerHTML,old);
  h.click({hmAction:'retry'});await flush();assert.equal(h.requests.length,1);h.respond();await flush();assert.equal(h.status.hidden,true);
});
test('cache expires by existing render calls without an independent interval',async()=>{
  const realNow=Date.now;let time=realNow();Date.now=()=>time;
  try {const h=harness();h.render();await flush();h.respond();await flush();time+=61000;h.render();await flush();assert.equal(h.requests.length,1);h.respond();await flush();}
  finally{Date.now=realNow;}
});
test('theme CSS is scoped, variable driven and never touches game or purchased scene art',()=>{
  const css=fs.readFileSync(require.resolve('../static/review-heatmap.css'),'utf8');
  assert.match(css,/var\(--ui-surface/);assert.match(css,/var\(--ui-ink/);
  assert.doesNotMatch(css,/@keyframes|animation:|\.mines-cell|\.expedition|\.campfire|data-bar|hue-rotate/);
  const code=fs.readFileSync(require.resolve('../static/review-heatmap.js'),'utf8');assert.doesNotMatch(code,/setInterval|setTimeout|requestAnimationFrame/);
});
