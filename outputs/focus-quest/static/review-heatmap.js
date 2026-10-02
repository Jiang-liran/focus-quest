/* The calendar is a read-only view of study and its dated goal snapshots. */
(function(root, factory) {
  'use strict';
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  if (root?.document) root.FocusReviewHeatmap = model.createController(root);
})(typeof globalThis === 'object' ? globalThis : this, function() {
  'use strict';
  const SUBJECTS = {math:'数学',cs:'408',politics:'政治',english:'英语'};
  const WEEKDAYS = ['一','二','三','四','五','六','日'];
  const PERIODS = {week:'周',month:'月',year:'年'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const finite = value => Math.max(0, Number(value) || 0);
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(+parsed) && parsed.toISOString().slice(0,10) === value ? parsed : null;
  }
  const stamp = value => value.toISOString().slice(0,10);
  function addDays(value, amount) { const result = date(value); if (!result) return null; result.setUTCDate(result.getUTCDate() + amount); return stamp(result); }
  function monday(value) { const parsed = date(value); return parsed ? addDays(value,-((parsed.getUTCDay()+6)%7)) : null; }
  function bounds(period, anchor) {
    const parsed = date(anchor); if (!parsed) return null;
    if (period === 'week') { const start = monday(anchor); return {start,end:addDays(start,6)}; }
    const year = parsed.getUTCFullYear(), month = parsed.getUTCMonth();
    if (period === 'year') return {start:`${year}-01-01`,end:`${year}-12-31`};
    return {start:stamp(new Date(Date.UTC(year,month,1,12))),end:stamp(new Date(Date.UTC(year,month+1,0,12)))};
  }
  function shift(period, anchor, amount) {
    const parsed = date(anchor); if (!parsed) return null;
    if (period === 'week') return addDays(anchor,7*amount);
    if (period === 'year') return stamp(new Date(Date.UTC(parsed.getUTCFullYear()+amount,0,1,12)));
    return stamp(new Date(Date.UTC(parsed.getUTCFullYear(),parsed.getUTCMonth()+amount,1,12)));
  }
  function rangeDays(start,end) { const result=[]; for(let next=start;next && next<=end && result.length<400;next=addDays(next,1)) result.push(next); return result; }
  function duration(value) { const minutes = Math.floor(finite(value)+0.00001); return minutes>=60 ? `${Math.floor(minutes/60)}小时${minutes%60 ? `${minutes%60}分` : ''}` : `${minutes}分钟`; }
  function hours(value) { return (finite(value)/60).toLocaleString('zh-CN',{maximumFractionDigits:1}); }
  function dayTitle(value) { const parsed=date(value);return parsed?`${parsed.getUTCMonth()+1}月${parsed.getUTCDate()}日 · 周${WEEKDAYS[(parsed.getUTCDay()+6)%7]}`:value; }
  const gem = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 8 6v8l-8 6-8-6V8Z"/><path d="m12 2 4 10-4 10-4-10Z"/><path d="M4 8 8 12 4 16m16-8-4 4 4 4"/></svg>';
  const crown = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 5 4 3-7 3 7 5-4-2 11H6Z"/><path d="M7 22h10M3 4v2m18-2v2M12 0v2"/></svg>';
  function dayStatus(day) {
    if (day.future) return 'future';
    if (day.targetEstimated || day.achieved == null) return day.minutes > 0 ? 'unverified' : 'empty';
    if (day.achieved) return finite(day.minutes) >= finite(day.target)*1.25 ? 'surpassed' : 'achieved';
    return day.minutes > 0 ? 'active' : 'empty';
  }
  function dayLabel(day) {
    const status = dayStatus(day);
    const suffix = status==='future' ? '尚未到来' : day.targetEstimated ? '当日目标未存档，不判断达标' : day.achieved ? '当日目标已达成' : '当日目标未达成';
    return `${day.date}，专注${duration(day.minutes)}，${suffix}`;
  }
  function dayButton(day, selected, today, annual=false) {
    const status=dayStatus(day), achieved=status==='achieved'||status==='surpassed';
    const level=day.future?0:Math.min(4,Math.ceil(finite(day.minutes)/120));
    const certificate=achieved?`<span class="hm-day-seal" title="当日目标已达成">${gem}</span>`:day.targetEstimated && !day.future?'<span class="hm-estimate" aria-hidden="true">~</span>':'';
    return `<button type="button" class="hm-day${annual?' hm-year-day':''}${day.date===today?' is-today':''}" data-hm-day="${esc(day.date)}" data-status="${status}" data-level="${level}" aria-pressed="${day.date===selected}" aria-label="${esc(dayLabel(day))}" title="${esc(dayLabel(day))}"${day.future?' disabled':''}>${annual?certificate:`<span class="hm-day-number">${Number(day.date.slice(-2))}${day.date===today?'<i>今</i>':''}</span><strong>${day.future?'—':`${hours(day.minutes)}<small>h</small>`}</strong>${certificate}<span class="hm-day-state">${achieved?'已达标':day.future?'':day.targetEstimated?'目标未存档':day.minutes?'在路上':'待点亮'}</span>`}</button>`;
  }
  function weekLabel(week) {
    if (week.achieved===true && !week.targetEstimated) return '周目标达成';
    if (week.targetEstimated || !week.confirmed) return '周目标未定档';
    return '周目标进行中';
  }
  function weekStamp(week, compact=false) {
    if(!week) return '<span class="hm-week-seal is-unknown" aria-label="周目标未存档">—</span>';
    const known=week.confirmed && !week.targetEstimated, achieved=known && week.achieved===true;
    const label=`${week.weekStart} — ${week.weekEnd}，${duration(week.minutes)}，${weekLabel(week)}`;
    return `<span class="hm-week-seal${achieved?' is-achieved':known?'':' is-unknown'}${compact?' is-compact':''}" title="${esc(label)}" aria-label="${esc(label)}">${achieved?crown:'<i aria-hidden="true">◇</i>'}${compact?'':`<b>${hours(week.minutes)}<small>h</small></b>`}<span>${achieved?'已达标':known?`/ ${hours(week.target)}h`:'未定档'}</span></span>`;
  }
  function normalise(raw, period, anchor) {
    const range = bounds(period,anchor), source=raw||{};
    const days=(Array.isArray(source.days)?source.days:[]).filter(day=>date(day.date)).map(day=>({...day,minutes:finite(day.minutes),target:finite(day.target),subjects:Array.isArray(day.subjects)?day.subjects:[]}));
    const weeks=Array.isArray(source.weeks)?source.weeks:[];
    return {...source,period,anchor,start:source.start||range.start,end:source.end||range.end,days,weeks,summary:source.summary||{}};
  }
  function calendar(data,selected,today) {
    const days=new Map(data.days.map(day=>[day.date,day]));
    const weeks=new Map(data.weeks.map(week=>[week.weekStart,week]));
    if(data.period==='year') {
      const first=monday(data.start),last=monday(data.end),columns=rangeDays(first,last).filter((_,i)=>i%7===0);
      let month=0;
      const labels=columns.map(start=>{const candidate=rangeDays(start,addDays(start,6)).find(value=>value>=data.start&&value<=data.end&&Number(value.slice(5,7))!==month);if(!candidate)return '<span></span>';month=Number(candidate.slice(5,7));return `<span>${month}月</span>`;}).join('');
      const strips=columns.map(start=>`<div class="hm-year-column">${rangeDays(start,addDays(start,6)).map(value=>days.has(value)?dayButton(days.get(value),selected,today,true):'<span class="hm-day-void" aria-hidden="true"></span>').join('')}${weekStamp(weeks.get(start),true)}</div>`).join('');
      const monthCards=Array.from({length:12},(_,index)=>{const key=`${data.start.slice(0,4)}-${String(index+1).padStart(2,'0')}`,included=data.days.filter(day=>day.date.startsWith(key)),minutes=included.reduce((sum,day)=>sum+day.minutes,0),known=included.filter(day=>!day.future&&!day.targetEstimated&&day.achieved!=null),met=known.filter(day=>day.achieved).length;return `<button type="button" data-hm-month="${key}-01" class="hm-month-summary"><span>${index+1}月</span><strong>${hours(minutes)}<small>h</small></strong><small>${known.length?`${met} 个达标日`:minutes?'目标未存档':'—'}</small></button>`;}).join('');
      return `<div class="hm-year-scroll"><div class="hm-year-matrix" style="--hm-weeks:${columns.length}"><div class="hm-year-months">${labels}</div><div class="hm-year-weekdays">${WEEKDAYS.map(day=>`<span>${day}</span>`).join('')}<span title="周目标">周</span></div><div class="hm-year-columns">${strips}</div></div></div><div class="hm-month-summaries">${monthCards}</div>`;
    }
    const first=monday(data.start),last=addDays(monday(data.end),6);
    const rows=rangeDays(first,last).filter((_,index)=>index%7===0).map(start=>`<div class="hm-calendar-week">${rangeDays(start,addDays(start,6)).map(value=>days.has(value)?dayButton(days.get(value),selected,today):'<span class="hm-day-void" aria-hidden="true"></span>').join('')}${data.period==='month'?weekStamp(weeks.get(start)):''}</div>`).join('');
    const week=data.weeks[0];
    return `${data.period==='week'&&week?`<div class="hm-week-summary">${weekStamp(week)}<div><strong>${esc(weekLabel(week))}</strong><span>${week.targetEstimated||!week.confirmed?'只有已确认的周目标，才会留下达标徽记。':`${duration(week.minutes)} / ${duration(week.target)} · ${week.achieved?'这一周的约定，已经完成。':'一步一步，靠近本周的约定。'}`}</span></div></div>`:''}<div class="hm-calendar-head">${WEEKDAYS.map(day=>`<span>周${day}</span>`).join('')}${data.period==='month'?'<span>周徽记</span>':''}</div>${rows}`;
  }
  function details(data, selected) {
    const day=data.days.find(item=>item.date===selected);
    if(!day) return '<div class="hm-detail-empty">点亮的日子，值得再看一眼。<span>点击一个日期，查看当天专注和当时的目标。</span></div>';
    const known=!day.targetEstimated && day.achieved!=null,met=known&&day.achieved;
    const note=day.future?'这一天还没到来。':!known?'当时的目标尚未留档。这里保留真实时长，不补算达标。':day.date===data.today?'今日最终目标会留作存档；以当天结束时的目标判定。':day.targetSource==='legacy-recorded'?'根据已有的目标变更记录还原。':'使用当天保存的目标，后续调整不会改写这一天。';
    const subjects=day.subjects.length?day.subjects:Object.entries(SUBJECTS).map(([id,name])=>({id,name,minutes:0,target:day.targets?.[id]}));
    return `<div class="hm-detail-heading"><span>这一日的足迹</span><h3>${esc(dayTitle(day.date))}</h3><small>${esc(day.date)}</small></div><div class="hm-detail-emblem" data-achieved="${met}">${met?gem:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3M2 12h3m14 0h3M12 2v3m0 14v3"/></svg>'}<span>${met?'今日之约 · 已达成':known?'每一段都留下了足迹':'真实专注 · 如实留存'}</span></div><div class="hm-detail-total"><strong>${hours(day.minutes)}<small>小时</small></strong><span>${known?`当日目标 ${hours(day.target)} 小时`:'当日目标未存档'}</span></div><div class="hm-detail-subjects">${subjects.filter(subject=>SUBJECTS[subject.id]).map(subject=>`<div data-subject="${esc(subject.id)}"><span>${esc(subject.name||SUBJECTS[subject.id])}</span><strong>${duration(subject.minutes)}</strong><small>${known?`/ ${duration(subject.target)}`:'目标未知'}</small>${known&&subject.achieved?'<i title="本科目标已达成">✓</i>':''}</div>`).join('')}</div><p class="hm-detail-note">${note}</p><button type="button" class="hm-open-day" data-hm-action="open-day">查看当天复盘 <span aria-hidden="true">↗</span></button>`;
  }
  function heading(data) {
    if(data.period==='year') return `${data.start.slice(0,4)} 年`;
    if(data.period==='month') return `${data.start.slice(0,4)} 年 ${Number(data.start.slice(5,7))} 月`;
    return `${data.start.replace(/-/g,'.')} — ${data.end.slice(5).replace('-','.')}`;
  }
  function bodyHTML(data,selected,today) {
    const summary=data.summary,actual=summary.minutes??data.days.reduce((sum,day)=>sum+day.minutes,0);
    const achieved=summary.achievedDays??data.days.filter(day=>day.achieved===true&&!day.targetEstimated).length;
    const active=summary.activeDays??data.days.filter(day=>day.minutes>0).length;
    const unknown=summary.estimatedGoalDays??data.days.filter(day=>!day.future&&day.targetEstimated).length;
    const known=summary.knownGoalDays??data.days.filter(day=>!day.future&&!day.targetEstimated&&day.achieved!=null).length;
    return `<div class="hm-stats"><span><strong>${hours(actual)}<small>小时</small></strong>本${PERIODS[data.period]}专注</span><span><strong>${active}<small>天</small></strong>有过投入</span><span><strong>${achieved}<small>天</small></strong>目标已达成${unknown?`<i title="${unknown} 天的历史目标未留档，不参与达标统计">${known} 天可核对</i>`:''}</span></div><div class="hm-content" data-period="${data.period}"><div class="hm-map"><div class="hm-period-heading"><h3>${heading(data)}</h3><span>${data.period==='year'?'四季的积累，落在这一张星图上。':data.period==='month'?'把安静的努力，收成一页星光。':'这一周，留下自己的节奏。'}</span></div>${calendar(data,selected,today)}<div class="hm-legend"><div><span>少</span>${[0,1,2,3,4].map(level=>`<i data-level="${level}" title="${level===0?'无记录':level===4?'超过6小时':`${(level-1)*2}–${level*2}小时`}"></i>`).join('')}<span>多</span></div><span>${gem} 日目标达成</span><span>${crown} 周目标达成</span></div><p class="hm-footnote">色深表示专注时长；晶印与王冠只认证当时已存档的目标。${unknown?' “~” 表示历史目标未留档。':''}</p></div><aside class="hm-detail" aria-label="所选日期的学习详情">${details(data,selected)}</aside></div>`;
  }
  function fingerprint(state) {
    return JSON.stringify([state?.today,state?.heatmapRevision,state?.allTime,state?.totals,state?.subjects,state?.goals,state?.weekly]);
  }
  function createController(root) {
    let bridge={}, mount=null, currentState=null, period='month',anchor=null,selected=null,lastDate=null;
    let version=0,requestSerial=0,lastFingerprint=null,currentData=null,renderKey='',loading=false,error='';
    const cache=new Map(),pending=new Map();
    const now=()=>Date.now();
    const visible=()=>Boolean(mount)&&!root.document.hidden&&root.document.body?.dataset.page==='review';
    function header() {
      if(!mount || mount.dataset.heatmapReady==='true')return;
      mount.dataset.heatmapReady='true';mount.classList.add('review-heatmap');
      mount.innerHTML=`<header class="hm-header"><div><span class="hm-eyebrow">YOUR DAYS, IN CONSTELLATIONS</span><h2>专注星历 <small>每一天，都有自己的光</small></h2></div><div class="hm-controls"><div class="hm-periods" role="group" aria-label="热力图周期">${Object.entries(PERIODS).map(([key,label])=>`<button type="button" data-hm-period="${key}" aria-pressed="${key===period}">${label}热力图</button>`).join('')}</div><div class="hm-navigation"><button type="button" data-hm-action="previous" aria-label="上一个月">‹</button><button type="button" data-hm-action="current">回到本月</button><button type="button" data-hm-action="next" aria-label="下一个月">›</button></div></div></header><div class="hm-status" role="status" aria-live="polite"></div><div class="hm-body"></div>`;
    }
    function display() {
      if(!mount)return;header();
      mount.setAttribute('aria-busy',String(loading));
      mount.querySelectorAll('[data-hm-period]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.hmPeriod===period)));
      mount.querySelector('[data-hm-action="current"]').textContent=`回到本${PERIODS[period]}`;
      mount.querySelector('[data-hm-action="previous"]').setAttribute('aria-label',`上一${period==='month'?'个':''}${PERIODS[period]}`);
      mount.querySelector('[data-hm-action="next"]').setAttribute('aria-label',`下一${period==='month'?'个':''}${PERIODS[period]}`);
      const status=mount.querySelector('.hm-status');
      status.innerHTML=error?`<span>${esc(error)}</span><button type="button" data-hm-action="retry">重新读取</button>`:loading&&!currentData?'正在整理这些日子的专注…':'';
      status.hidden=!status.innerHTML;
      if(!currentData)return;
      const key=JSON.stringify([currentData,selected,currentState?.today]);
      if(key!==renderKey) {renderKey=key;mount.querySelector('.hm-body').innerHTML=bodyHTML(currentData,selected,currentState?.today||currentData.today);}
    }
    function selectFor(data) {
      if(data.days.some(day=>day.date===selected&&!day.future))return;
      const preferred=currentState?.date;
      selected=data.days.find(day=>day.date===preferred&&!day.future)?.date || [...data.days].reverse().find(day=>!day.future&&day.minutes>0)?.date || data.days.find(day=>!day.future)?.date || null;
    }
    async function load(force=false) {
      if(!visible()||!anchor||!bridge.api)return;
      const range=bounds(period,anchor);if(!range)return;
      const key=`${period}:${range.start}`,stampVersion=version,serial=++requestSerial;
      const cached=cache.get(key);
      if(!force&&cached&&cached.version===version&&now()-cached.at<60000){currentData=cached.data;loading=false;error='';selectFor(currentData);display();return;}
      const requestedPeriod=period,requestedAnchor=anchor;
      loading=true;error='';if(currentData && (currentData.period!==period || currentData.start!==range.start)){currentData=null;renderKey='';mount.querySelector('.hm-body').innerHTML='';}display();
      const pendingKey=`${key}:${stampVersion}`;
      let promise=pending.get(pendingKey);
      if(!promise){promise=Promise.resolve().then(()=>bridge.api(`/api/heatmap?period=${requestedPeriod}&anchor=${encodeURIComponent(range.start)}`));pending.set(pendingKey,promise);promise.finally(()=>{if(pending.get(pendingKey)===promise)pending.delete(pendingKey);}).catch(()=>{});}
      try {
        const response=await promise,data=normalise(response,requestedPeriod,requestedAnchor);
        if(stampVersion===version){cache.delete(key);cache.set(key,{version:stampVersion,at:now(),data});while(cache.size>8)cache.delete(cache.keys().next().value);}
        if(serial!==requestSerial||stampVersion!==version||!visible())return;
        currentData=data;selectFor(data);loading=false;display();
      }catch(cause){if(serial!==requestSerial||!visible())return;loading=false;error=cause?.message||'暂时无法读取星历，已保存的记录不会受影响。';display();}
    }
    function navigate(nextPeriod,nextAnchor) {period=nextPeriod;anchor=nextAnchor;requestSerial++;load();}
    function click(event) {
      const button=event.target.closest('button');if(!button||!mount.contains(button)||button.disabled)return;
      if(button.dataset.hmDay){selected=button.dataset.hmDay;display();return;}
      if(button.dataset.hmPeriod){navigate(button.dataset.hmPeriod,anchor);return;}
      if(button.dataset.hmMonth){navigate('month',button.dataset.hmMonth);return;}
      const action=button.dataset.hmAction;
      if(action==='previous'||action==='next')navigate(period,shift(period,anchor,action==='previous'?-1:1));
      else if(action==='current'){selected=currentState?.today; navigate(period,currentState?.today||anchor);}
      else if(action==='open-day'&&selected)bridge.chooseDate?.(selected);
      else if(action==='retry')load(true);
    }
    function render(state) {
      currentState=state||currentState;if(!currentState)return;
      const next=fingerprint(currentState);if(lastFingerprint!==null&&next!==lastFingerprint){version++;}lastFingerprint=next;
      if(lastDate!==currentState.date){lastDate=currentState.date;anchor=currentState.date;selected=currentState.date;requestSerial++;}
      if(!anchor)anchor=currentState.today;
      if(visible())load();
    }
    return {
      init(options={}){bridge=options;mount=root.document.getElementById('review-heatmap');if(!mount)return;if(mount.dataset.heatmapBound!=='true'){mount.addEventListener('click',click);mount.dataset.heatmapBound='true';}header();},
      render,
      onEnter(){render(bridge.getState?.()||currentState);},
      onLeave(){requestSerial++;},
    };
  }
  return {date,addDays,monday,bounds,shift,rangeDays,duration,dayStatus,dayLabel,dayButton,weekLabel,weekStamp,normalise,calendar,details,bodyHTML,fingerprint,createController};
});
