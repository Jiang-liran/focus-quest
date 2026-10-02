const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
process.env.TZ='Asia/Shanghai';
const api=require('../static/record-time.js');
const row=(patch={})=>({id:'test',name:'数学',day:'2026-09-27',start:'2026-09-27T09:00:00+08:00',end:'2026-09-27T10:00:00+08:00',minutes:60,...patch});
test('uses actual timestamps even when rounded stored duration differs',()=>{
 const r=row({start:'2026-09-27T09:02:00+08:00',minutes:60});assert.equal(api.range(r),'09:02 → 10:00');assert.equal(api.parts(r).inferred,false);assert.doesNotMatch(api.describe(r),/回算/);
});
test('legacy start is inferred from end and fractional minutes with second precision',()=>{
 const r=Object.freeze(row({start:null,minutes:30.5}));assert.equal(api.range(r),'09:29:30 → 10:00:00');assert.equal(api.parts(r).inferred,true);assert.match(api.describe(r),/按持续时长回算/);assert.equal(r.start,null);
});
test('cross-midnight and cross-year ranges show both dates',()=>{
 assert.equal(api.range(row({start:'2026-09-26T23:45:00+08:00',end:'2026-09-27T00:15:00+08:00'})),'09/26 23:45 → 09/27 00:15');
 assert.equal(api.range(row({start:'2025-12-31T23:45:00+08:00',end:'2026-01-01T00:15:00+08:00'})),'2025/12/31 23:45 → 2026/01/01 00:15');
});
test('local display is consistent for UTC imports and historic reference days',()=>{
 assert.equal(api.range(row({start:'2026-09-26T23:00:00Z',end:'2026-09-26T23:30:00Z'}),{referenceDay:'2026-09-27'}),'07:00 → 07:30');
 assert.equal(api.range(row(),{referenceDay:'2026-09-26'}),'09/27 09:00 → 09/27 10:00');
});
test('invalid, missing or reversed timestamps fail safely without inventing a zero-minute session',()=>{
 assert.equal(api.range(null),'— → —');assert.equal(api.range({end:'invalid',start:'<script>'}),'— → —');
 assert.equal(api.range(row({start:null,minutes:null})),'— → 10:00');assert.equal(api.range(row({start:null,minutes:-10})),'— → 10:00');
 assert.equal(api.range(row({start:'2026-09-27T11:00:00+08:00'})),'09:00 → 10:00');
 assert.equal(api.parts(row({start:null,minutes:Number.MAX_VALUE})).start,null);
});
test('seconds are shown only when meaningful, and grouped replay spans retain the earliest start',()=>{
 assert.equal(api.range(row({end:'2026-09-27T10:00:17+08:00'})),'09:00:00 → 10:00:17');
 const records=[row({start:'2026-09-27T08:10:00+08:00',end:'2026-09-27T08:40:00+08:00'}),row({start:null,minutes:20})];
 assert.equal(api.group(records),'08:10 → 10:00');assert.equal(api.group([]),'— → —');
});
function appHarness(){
 const nodes=new Map(),element=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false});return nodes.get(id);};
 const context=vm.createContext({document:{getElementById:element},FocusRecordTime:api});
 const app=fs.readFileSync(require.resolve('../static/app.js'),'utf8').split("\ndocument.querySelectorAll('[data-view]')")[0];vm.runInContext(app,context);
 const run=code=>vm.runInContext(code,context);
 run(`state={date:'2026-09-27',today:'2026-09-27',records:[${JSON.stringify(row({subject:'math',activity:'lecture'}))}],totals:{minutes:60,percent:12.5},dayRecordCount:1,trash:{count:1,records:[${JSON.stringify(row({subject:'math',activity:'lecture',start:'2026-09-26T23:30:00+08:00',end:'2026-09-27T00:30:00+08:00',deletionReason:'manual'}))}]},calendarSync:{enabled:true,pendingRecords:[${JSON.stringify(row({start:null}))}]},unmapped:[]};`);
 return {run,element};
}
test('today records, archive, pending calendar and recycle bin all show start, end and duration',()=>{
 const h=appHarness();h.run('renderRecords();renderTrash();renderCalendarPending();');
 for(const id of ['recent-records','history-records','calendar-pending'])assert.match(h.element(id).innerHTML,/09:00 → 10:00/,id);
 assert.match(h.element('recent-records').innerHTML,/60 分钟/);assert.match(h.element('history-records').innerHTML,/1小时/);assert.match(h.element('calendar-pending').innerHTML,/60 分钟/);
 const trash=h.element('trash-records').innerHTML;assert.match(trash,/09\/26 23:30 → 09\/27 00:30/);assert.match(trash,/1小时/);
});
test('changing only a start timestamp refreshes archive nodes',()=>{
 const h=appHarness();h.run('renderRecords();');h.run("state.records[0].start='2026-09-27T09:05:00+08:00';renderRecords();");assert.match(h.element('history-records').innerHTML,/09:05 → 10:00/);
});
