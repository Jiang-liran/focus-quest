const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../static/app.js'),'utf8').split("\ndocument.querySelectorAll('[data-view]')")[0];
const renderAll='renderWeek();renderRecords();renderAchievements();';
function initial(){
 const days=Array.from({length:7},(_,i)=>({date:'2026-09-'+(21+i),minutes:i===5?120:0,target:480}));
 return {date:'2026-09-26',today:'2026-09-26',weekly:{start:'2026-09-21',end:'2026-09-27',minutes:120,target:3000,percent:4,activeDays:1,days},totals:{minutes:120,target:480,percent:25},dayRecordCount:1,records:[{id:'focus-a',subject:'math',activity:'lecture',name:'复习数学',minutes:120,end:'2026-09-26T10:00:00+08:00',source:'tomato'}],trash:{count:0,records:[]},activities:{totals:{lecture:120,practice:0,other:0},subjects:[{id:'math',name:'数学',minutes:120,lecture:120,practice:0,other:0,advice:{tone:'gentle',title:'动手试试看',text:'接下来做几道题。'}}],advice:{text:'学习方式已统计。'}},allTime:{minutes:9000,records:150,activeDays:30},badges:[{name:'第一束光',description:'完成一段专注。',earned:true},{name:'远行',description:'留下更多足迹。',earned:false}]};
}
function harness(){
 const elements=new Map();
 function element(id){if(!elements.has(id)){
  const el={writes:0,_html:'',_text:'',hidden:false,disabled:false,dataset:{},style:{},attributes:{},setAttribute(name,value){this.attributes[name]=value;this.writes++;}};
  Object.defineProperties(el,{innerHTML:{get(){return this._html;},set(value){this._html=value;this.writes++;}},textContent:{get(){return this._text;},set(value){this._text=value;this.writes++;}}});elements.set(id,el);
 }return elements.get(id);}
 const context=vm.createContext({document:{getElementById:element},initial:initial()});vm.runInContext(source,context);vm.runInContext('state=initial;',context);
 return {run:code=>vm.runInContext(code,context),element,writes:()=>Object.fromEntries([...elements].map(([id,el])=>[id,el.writes]))};
}
test('100 identical server polls preserve every rendered chart, record and achievement node',()=>{
 const h=harness();h.run(renderAll);const before=h.writes();
 h.run(`for(let i=0;i<100;i++){state=JSON.parse(JSON.stringify(state));state.now='poll-'+i;${renderAll}}`);
 assert.deepEqual(h.writes(),before);for(const id of ['week-chart','history-records','achievement-stats','badges'])assert.equal(h.element(id).writes,1,id);
});
test('weekly chart scales by archived day targets, independently of another selected day',()=>{
 const h=harness();h.run('renderWeek();');assert.match(h.element('week-chart').innerHTML,/height:25%/);
 h.run('state.totals.target=960;renderWeek();');assert.match(h.element('week-chart').innerHTML,/height:25%/);assert.equal(h.element('week-chart').writes,1);
 h.run('state.weekly.days[5].target=960;renderWeek();');assert.match(h.element('week-chart').innerHTML,/height:12.5%/);assert.equal(h.element('week-chart').writes,2);
});
test('week date selection, midnight, loading and independent chart data invalidate the right view',()=>{
 const h=harness();h.run('renderWeek();');h.run("state.date='2026-09-25';renderWeek();");assert.match(h.element('week-chart').innerHTML,/class="chart-column today[^\"]*" data-date="2026-09-25"/);
 h.run("state.today='2026-09-27';renderWeek();");assert.match(h.element('week-chart').innerHTML,/data-date="2026-09-27"[^]*?<span class="chart-day">今天<\/span>/);
 h.run('weekChartLoading=true;renderWeek();');assert.equal(h.element('prev-week').disabled,true);assert.equal(h.element('next-week').disabled,true);
 h.run('weekChartLoading=false;renderWeek();');assert.equal(h.element('prev-week').disabled,false);
 h.run("weekChartState={...state.weekly,start:'2026-09-14',end:'2026-09-20',minutes:240};renderWeek();");assert.equal(h.element('weekly-total').textContent,'累计 4小时');assert.equal(h.element('week-chart-title').textContent,'每周足迹');assert.equal(h.element('week-reset').hidden,false);
});
test('activity-only changes leave unrelated views intact after the redundant renderer is removed',()=>{
 const h=harness();h.run(renderAll);const records=h.element('history-records').writes,weekly=h.element('week-chart').writes;
 h.run("state.activities.totals.practice=30;state.activities.subjects[0].practice=30;state.activities.subjects[0].advice.text='这轮已经动手了。';"+renderAll);
 assert.equal(h.element('history-records').writes,records);assert.equal(h.element('week-chart').writes,weekly);
 assert.doesNotMatch(source,/renderActivities|activity-summary|activity-rows/);
});
test('record edits, date changes, target changes and mutation busy state remain visible',()=>{
 const h=harness();h.run('renderRecords();');h.run("state.records[0].name='数学练习';renderRecords();");assert.match(h.element('history-records').innerHTML,/数学练习/);
 h.run("state.date='2026-09-25';renderRecords();");assert.match(h.element('archive-note').textContent,/2026-09-25/);
 h.run('state.totals.target=960;state.totals.percent=12.5;renderRecords();');assert.match(h.element('history-stats').innerHTML,/12.5%/);
 h.run('recordMutationBusy=true;renderRecords();');assert.match(h.element('history-records').innerHTML,/ disabled>/);
 h.run('recordMutationBusy=false;renderRecords();');assert.doesNotMatch(h.element('history-records').innerHTML,/ disabled>/);
 h.run('state.dayRecordCount=101;renderRecords();');assert.match(h.element('archive-note').textContent,/最近 100 条/);
});
test('trash count changes refresh even when the selected day records are unchanged',()=>{
 const h=harness();h.run('renderRecords();');assert.equal(h.element('trash-open').textContent,'回收站');h.run('state.trash.count=3;renderRecords();');assert.equal(h.element('trash-open').textContent,'回收站 · 3');
 h.run('state.trash.count=0;renderRecords();');assert.equal(h.element('trash-open').textContent,'回收站');
});
test('new lifetime totals and newly earned badges remain visible',()=>{
 const h=harness();h.run('renderAchievements();');h.run('state.allTime.activeDays=31;renderAchievements();');assert.match(h.element('achievement-stats').innerHTML,/31<small>天/);
 h.run('state.badges[1].earned=true;renderAchievements();');assert.doesNotMatch(h.element('badges').innerHTML,/badge-card locked/);assert.equal(h.element('badges').writes,3);
});
