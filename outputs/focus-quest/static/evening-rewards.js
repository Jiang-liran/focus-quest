(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>Math.max(0,Number(v)||0);
  let bridge={},host=null,latest=null,selection=null,markup='',portrait='',busy=false,initialized=false,lastStamp=-Infinity;
  const received=new Set();
  const icon=kind=>root.FocusCurrencyArt?.icon?.(kind)||'';
  const key=g=>`${g.day}:${g.index}`;
  const claimed=g=>g.claimed||received.has(key(g));
  function visible(){
    if(!host||document.hidden||bridge.isVisible?.()===false)return false;
    for(let node=host;node;node=node.parentElement)if(node.hidden||node.inert)return false;
    return true;
  }
  function model(){
    const data=latest?.evening;
    if(!data||!Array.isArray(data.gifts))return null;
    return selection===data.day?data:data.pendingDays?.find(row=>row.day===selection)||data;
  }
  function giftModel(g){
    // The ticket contents define the grade, including old unclaimed nights.
    // Currency growth distinguishes the two successive gifts of the same grade.
    const t=g.lotteryTickets||{},coins=n(t.coinTickets),diamonds=n(t.diamondTickets),richer=n(g.reward?.diamonds);
    if(diamonds>=2)return {grade:'aurora',model:'twin-star-vault',name:'双星冠冕宝箱',level:6};
    if(diamonds&&coins>=2)return {grade:'star',model:'star-vault',name:'星辉珍藏宝箱',level:5};
    if(diamonds)return richer>=3?{grade:'crystal',model:'crystal-casket',name:'晶冠双券礼匣',level:4}:{grade:'crystal',model:'crystal-case',name:'月晶双券礼匣',level:3};
    if(coins)return richer>=2?{grade:'coin',model:'coin-coffer',name:'鎏金星纹礼匣',level:2}:{grade:'coin',model:'coin-chest',name:'铜星金币礼匣',level:1};
    return {grade:'warm',model:'warm-parcel',name:'暖灯小礼',level:0};
  }
  const giftPath=(d,fill,extra='')=>`<path d="${d}" fill="${fill}" ${extra}/>`;
  const giftLine=(d,color,width=1.4,extra='')=>giftPath(d,'none',`stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}`);
  const gem=(x,y,size,p)=>`<g transform="translate(${x} ${y})">${giftPath(`M0-${size} ${size*.7} 0 0 ${size}-${size*.7} 0Z`,p.gem)}${giftPath(`M0-${size}V${size}L${-size*.7} 0Z`,p.glass)}${giftLine(`M${-size*.7} 0H${size*.7}`,p.edge,.7)}</g>`;
  const coinSeal=(x,y,p,size=5)=>`<g transform="translate(${x} ${y})"><ellipse rx="${size}" ry="${size*1.15}" fill="${p.gold}"/>${giftPath(`M0-${size*.65} ${size*.22}-${size*.18} ${size*.6}-${size*.08} ${size*.3} ${size*.24} ${size*.38} ${size*.6} 0 ${size*.4}-${size*.38} ${size*.6}-${size*.3} ${size*.24}-${size*.6}-${size*.08}-${size*.22}-${size*.18}Z`,p.side)}</g>`;
  function giftPalette(grade,state){
    const hues={warm:['#91bca7','#537f79','#bed1b8'],coin:['#bd9570','#765549','#e2bc79'],crystal:['#869bb9','#535d8e','#b9c9e4'],star:['#8c98c0','#574d80','#dec28b'],aurora:['#88babf','#536292','#f0d4a3']}[grade];
    const ready=state==='available';
    return {front:hues[0],side:hues[1],lid:hues[2],gold:ready?'#f2ce82':state==='claimed'?'#bcb69e':'#bca88a',edge:ready?'#fbe7b2':'#b8b6ab',gem:ready?'#a990e9':'#858caa',glass:ready?'#c0efe5':'#a0b7bd',lining:ready?'#6a829f':'#536476'};
  }
  function giftArt(g,design=giftModel(g)){
    const done=claimed(g),ready=g.available&&!done,state=done?'claimed':ready?'available':'locked',p=giftPalette(design.grade,state),level=design.level;
    let box='';
    if(level===0){
      box=giftPath('M25 40 50 51 75 40v22L50 74 25 62Z',p.front)+giftPath('M50 51 75 40v22L50 74Z',p.side)+giftPath('M22 34 28 26 50 16 72 26 78 34 50 47Z',p.lid)+giftPath('M22 34 50 47 78 34v7L50 54 22 41Z',p.front)+giftPath('M38 22 65 39 57 43 30 26Zm-2 26 8 3v20l-8-3Zm23-1 7-3v21l-7 3Z',p.gold)+giftLine('M50 24C30 25 28 12 37 12c6 0 13 12 13 12Zm0 0c20 1 22-12 13-12-6 0-13 12-13 12Z',p.gold,2.4)+coinSeal(50,57,p,3.5);
    }else if(level<=2){
      const tall=level===2;
      box=giftPath('M18 43 52 53 82 40v23L52 77 18 65Z',p.front)+giftPath('M52 53 82 40v23L52 77Z',p.side)+giftPath(tall?'M15 41V26Q22 14 39 13l43 13q5 3 4 14L52 54Z':'M15 41V29q11-15 26-12l41 12v13L52 55Z',p.lid)+giftPath(tall?'M52 33q17-7 30-7 5 3 4 14L52 54Z':'M52 37q16-9 30-8v13L52 55Z',p.gold)+giftLine('M16 41 52 54 85 40M21 48v14l28 9m8 0 20-9V48',p.gold,2)+giftPath('M30 21 35 19 67 33v17l-5 2V34Z',p.side)+coinSeal(42,59,p,tall?6:5)+giftLine('M69 54q10-3 10 4v3q-2 5-8 3',p.gold,2);
      if(tall)box+=giftPath('M17 65v5l7 3v-7Zm31 11v5l8-3v-5Zm32-14v6l-6 3v-6Z',p.gold)+giftLine('M23 32 35 27m-10 10 12-5M60 24l5-2 9 3',p.edge,1.1)+coinSeal(39,24,p,4);
    }else if(level<=4){
      const crown=level===4;
      box=giftPath('M18 41 52 53 82 40v24L52 78 18 64Z',p.front)+giftPath('M52 53 82 40v24L52 78Z',p.side)+giftPath(crown?'M15 39 20 26 47 16 83 26 87 39 52 53Z':'M15 39 19 30 47 21 83 32 87 39 52 53Z',p.lid)+giftPath('M15 39 52 53 87 39v7L52 60 15 46Z',p.lining)+giftLine('M16 39 52 53 86 39M21 49v13l28 10m7 0 22-10V49',p.gold,2)+giftPath('M24 50 34 53v11l-10-3Zm39 7 10-4v10l-10 4Z',p.lining)+coinSeal(29,56,p,4)+gem(68,59,5,p)+gem(49,29,crown?10:7,p)+giftLine('M49 38v14',p.gold,2);
      if(crown)box+=giftLine('M22 28V17l8 7M78 28V17l-8 7',p.gold,1.7)+gem(23,16,4,p)+gem(77,16,4,p)+giftPath('M17 64v7l8 3v-7Zm62 0v7l-8 3v-7Z',p.gold)+giftLine('M23 66 49 75 77 64',p.glass,1,'class="eve-inlay"');
    }else{
      const twin=level===6;
      box=giftPath('M12 40 52 53 89 39v26L52 81 12 66Z',p.front)+giftPath('M52 53 89 39v26L52 81Z',p.side)+giftPath(twin?'M9 38 14 23 46 11 86 23 93 38 52 55Z':'M9 38 15 27 46 17 85 28 93 38 52 55Z',p.lid)+giftPath('M9 38 52 55 93 38v7L52 62 9 45Z',p.lining)+giftLine('M10 38 52 55 92 38M16 48v16l32 12m9 0 28-13V48',p.gold,2.4)+giftPath('M13 65v7l9 4v-8Zm35 14v6l9-4v-5Zm39-16v7l-8 4v-7Z',p.gold)+giftLine('M23 27 48 20 77 29M25 31 48 24 73 32',p.edge,1)+coinSeal(26,56,p,5)+coinSeal(40,61,p,5)+gem(71,61,7,p)+giftLine('M21 66 49 76 80 64',p.glass,1.5,'class="eve-inlay"');
      if(twin)box+=gem(36,21,10,p)+gem(63,22,10,p)+giftLine('M26 18 22 10l12 2m39 7 7-9-12 2M40 34l9-7 10 9',p.gold,1.8)+gem(82,53,5,p)+giftLine('M24 39 51 49 82 36',p.glass,1.1,'class="eve-inlay"');
      else box+=gem(49,23,11,p)+giftLine('M24 22V15l9 4m44 6V16l-9 4',p.gold,1.7);
    }
    const halo=ready&&level>=3?`<ellipse class="eve-halo" cx="50" cy="51" rx="43" ry="26" fill="${p.gem}" opacity=".09"/>`:'';
    const sparks=ready?`<g class="eve-sparks" fill="${p.edge}">${giftPath('m7 24 2-4 2 4 4 2-4 2-2 4-2-4-4-2Zm84 30 2-4 2 4 4 2-4 2-2 4-2-4-4-2Z',p.edge)}${level>=3?'<circle cx="86" cy="11" r="1.6"/>':''}${level>=5?giftPath('m11 9 1.5-3 1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5Z',p.glass):''}</g>`:'';
    const seal=done?`<g class="eve-received-seal"><circle cx="78" cy="68" r="8" fill="#567d76"/>${giftLine('m74 68 3 3 5-6','#deeadb',2)}</g>`:'';
    return `<svg class="eve-gift-art" data-gift-grade="${design.grade}" data-gift-model="${design.model}" data-gift-state="${state}" viewBox="0 0 100 88" width="100" height="88" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" fill="none" stroke="none" style="stroke:none"><ellipse cx="50" cy="81" rx="${level>=5?40:32}" ry="4" fill="#101927" opacity=".22"/>${halo}<g class="eve-box-motion">${box}${sparks}${seal}</g></svg>`;
  }
  function card(g,day){
    const done=claimed(g),ready=g.available&&!done,remaining=Math.max(1,Math.ceil(n(g.target)-n(day.minutes))),extra=g.tier==='extra';
    const label=done?'已收好':ready?'打开礼盒':day.day===latest.evening.day&&latest.evening.status==='upcoming'?'18 点后积累':`还差 ${remaining} 分钟`;
    const tickets=g.lotteryTickets||{},design=giftModel(g);
    return `<article class="eve-gift ${done?'claimed':ready?'available':'locked'}" data-gift-grade="${design.grade}"><div class="eve-gift-top"><span>${extra?'加赠 '+(g.index-latest.evening.baseCount):'第 '+g.index+' 份'} · ${g.target} 分钟</span><small>${done?'✓ 已领取':ready?'可以领取':'慢慢点亮'}</small></div><button type="button" class="eve-open" data-evening-claim="${g.index}" data-evening-day="${esc(g.day)}" aria-label="${esc(g.day)}第 ${g.index} 份晚间礼盒，${design.name}，${label}" ${!ready||busy?'disabled':''}>${giftArt(g,design)}<span class="eve-gift-name">${design.name}</span><span>${label}</span></button><div class="eve-reward"><span>${icon('coin')}<b>${n(g.reward?.coins)}</b> 金币</span><span>${icon('diamond')}<b>${n(g.reward?.diamonds)}</b> 钻石</span></div><div class="eve-tickets">${n(tickets.coinTickets)?`<span class="coin">金币券 × ${n(tickets.coinTickets)}</span>`:''}${n(tickets.diamondTickets)?`<span class="diamond">钻石券 × ${n(tickets.diamondTickets)}</span>`:''}${!n(tickets.coinTickets)&&!n(tickets.diamondTickets)?'<span class="eve-small-gift">先收一份小小鼓励</span>':''}</div></article>`;
  }
  function paint(){
    if(!host)return;
    const day=model();if(!day){host.hidden=true;return;}host.hidden=false;
    if(!portrait)portrait=root.QuestArt?.avatar?.('evening')||'';
    const available=day.gifts.filter(g=>g.available&&!claimed(g)).length,completed=day.gifts.filter(g=>claimed(g)).length;
    const base=day.gifts.filter(g=>g.tier!=='extra'),extras=day.gifts.filter(g=>g.tier==='extra');
    const full=base.every(g=>g.eligible||claimed(g)),baseClaimed=base.filter(claimed).length;
    const next=base.find(g=>!g.eligible&&!claimed(g));
    const copy=full?`${day.day===latest.evening.day?'今晚':'那晚'}的五份常规奖励已全部完成，收好以后就安心休息。`:available?`${available} 份晚间礼盒已点亮，回来时就能收好。`:day.day!==latest.evening.day?'这晚点亮的收获仍在，稍后同步的记录也能补入。':latest.evening.status==='upcoming'?'18 点开始累计，白天的委托照常推进。':`再积累 ${Math.max(1,Math.ceil(n(next?.target)-n(day.minutes)))} 分钟，就能点亮下一份礼盒。`;
    const current=day.day===latest.evening.day,percent=Math.min(100,Math.round(n(day.minutes)/n(latest.evening.baseTarget)*1000)/10);
    const pending=latest.evening.pendingDays||[];
    const selector=pending.length?`<label class="eve-day-label">查看晚间<select data-evening-day-select aria-label="选择晚间礼盒日期"><option value="${esc(latest.evening.day)}" ${current?'selected':''}>今晚</option>${pending.map(row=>`<option value="${esc(row.day)}" ${row.day===day.day?'selected':''}>${esc(row.day)} · ${row.availableCount} 份待领取</option>`).join('')}</select></label>`:'<span class="eve-window">18:00–24:00</span>';
    const html=`<header class="eve-header"><div class="eve-portrait">${portrait}<span aria-hidden="true">✧</span></div><div class="eve-heading"><span class="eve-kicker">AFTER DUSK · 晚间陪读</span><h2>晚灯相伴 <small>守灯人 · 晚舟</small></h2><p>「不用赶路。我把灯留着，陪你再走一小段。」</p><p class="eve-plan">2 小时 30 分钟拿满常规 · 可选加赠最高 3 小时 40 分钟</p></div>${selector}</header><div class="eve-summary"><div><strong>${current?'今晚':esc(day.day)} <b>${Math.floor(n(day.minutes))}</b><small> 分钟</small></strong><p>${copy}</p></div><span>${baseClaimed} / 5 常规已收好${available?` · ${available} 份可领取`:completed>5?` · 加赠已领 ${completed-baseClaimed} 份`:""}</span></div><div class="q-first-round-progress eve-progress" data-skin-slots="bar" tabindex="0" title="右键更换进度条外观" role="progressbar" aria-label="晚间学习礼盒进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${Math.floor(n(day.minutes))} / 150 分钟常规目标"><i style="width:${percent}%"></i></div><div class="eve-grid">${base.map(g=>card(g,day)).join('')}</div><section class="eve-extra"><div class="eve-extra-heading"><div><h3>有余力时，多收一点星光</h3><p>两份可选加赠，独立于五份常规奖励；不需要每天追满。</p></div><span>185 / 220 分钟</span></div><div class="eve-extra-grid">${extras.map(g=>card(g,day)).join('')}</div></section><details class="eve-rules"><summary>晚间收获怎么计算</summary><p>每天 18:00–24:00，四科有效学习合计每满 30 分钟点亮一份常规礼盒，150 分钟拿满五份。常规合计 300 金币、9 钻石、4 张金币抽奖券、2 张钻石抽奖券。听课、做题、背单词等均可；不需要另外接取，也不占用普通委托或拾星的进度。</p><p>只计算已完成并同步的记录，跨 18 点或零点只计窗口内部分，暂停按有效时长折算，重叠时间不重复累计。当天进度独立，不把上一晚的零头移到下一晚。超过 150 分钟后改为每再积累 35 分钟解锁加赠，最多两份：185 分钟获得 100 金币、4 钻石、2 张金币券与 1 张钻石券；220 分钟获得 120 金币、5 钻石、2 张金币券与 2 张钻石券。</p><p>已点亮的礼盒可以晚些再领，次日也能补领。记录稍后同步也会补入对应晚间；从本次更新当天开始，不补发更早日期的奖励。后续来源删改不会追回已收好的奖励。</p></details>`;
    if(html===markup)return;
    const focus=host.contains(document.activeElement)?document.activeElement?.dataset?.eveningClaim:null;
    markup=html;host.innerHTML=html;root.FocusProgressBars?.decorate?.(host);
    if(focus){const button=host.querySelector(`[data-evening-claim="${focus}"]`);if(button&&!button.disabled)button.focus();else host.querySelector('.eve-open:not(:disabled)')?.focus();}
  }
  function render(snapshot){
    if(!snapshot?.evening)return;
    const fraction=String(snapshot.now||'').match(/\.(\d+)/)?.[1]||'';
    const time=Date.parse(snapshot.now)+(Number((fraction+'000000').slice(3,6))||0)/1000;if(Number.isFinite(time)&&time<lastStamp)return;if(Number.isFinite(time))lastStamp=time;
    latest=snapshot;
    if(!selection||selection!==snapshot.evening.day&&!snapshot.evening.pendingDays?.some(d=>d.day===selection))selection=snapshot.evening.day;
    paint();root.FocusRewardHub?.update();
  }
  async function claim(day,index){
    if(busy||!visible())return;
    const gift=model()?.gifts?.find(g=>g.day===day&&g.index===index);
    if(!gift?.available||claimed(gift))return;
    const focusNode=host.contains(document.activeElement)?document.activeElement:null;
    busy=true;paint();
    try{
      const result=await bridge.api('/api/quests/evening/claim',{day,index});
      if(result.day!==day||result.index!==index||!result.quests?.evening)throw new Error('领取结果尚未确认，请刷新后查看。');
      received.add(key(gift));if(received.size>128)received.delete(received.values().next().value);
      bridge.acceptReceipt?.(result);render(result.quests);
      if(!result.alreadyClaimed){
        if(visible())bridge.playSound?.('delivery',{key:`evening:${day}:${index}`});
        bridge.toast?.('晚灯相伴 · 礼盒已收好',`+${n(result.reward?.coins)} 金币 · +${n(result.reward?.diamonds)} 钻石${root.FocusLottery?.ticketText?.(result.ticketGrants)||''}`);
      }else bridge.toast?.('这份晚间礼盒已经收好','行囊里的收获已经记下。');
    }catch(error){bridge.toast?.('礼盒还在这里',error?.message||'暂时无法领取，请稍后再试。',true);}
    finally{
      busy=false;paint();root.FocusRewardHub?.update();
      if(focusNode&&visible()&&(document.activeElement===document.body||document.activeElement===focusNode||host.contains(document.activeElement))){
        const current=host.querySelector(`[data-evening-claim="${index}"]`);
        if(current&&!current.disabled)current.focus();else host.querySelector('.eve-open:not(:disabled)')?.focus();
      }
    }
    try{await bridge.refresh?.(true);}catch{/* Durable receipts survive a failed refresh. */}
  }
  function init(callbacks={}){
    bridge={...bridge,...callbacks};host=document.getElementById('evening-rewards');if(initialized||!host)return;initialized=true;
    host.addEventListener('click',event=>{const button=event.target?.closest?.('[data-evening-claim]');if(button&&host.contains(button)&&!button.disabled&&!event.defaultPrevented&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey){event.preventDefault();void claim(button.dataset.eveningDay,Number(button.dataset.eveningClaim));}});
    host.addEventListener('change',event=>{if(event.target?.matches?.('[data-evening-day-select]')&&!busy){selection=event.target.value;paint();}});
    paint();
  }
  function summary(){
    const nights=[latest?.evening,...(latest?.evening?.pendingDays||[])].filter(Boolean),seen=new Set();let count=0,past=0;
    for(const night of nights)for(const g of night.gifts||[]){if(seen.has(key(g))||!g.available||claimed(g))continue;seen.add(key(g));count++;if(night.day!==latest.evening.day)past++;}
    return {count,text:count?`${count} 份礼盒可领取${past?` · 含旧夜 ${past} 份`:''}`:latest?.evening?.status==='upcoming'?'18 点后，陪你再学一小段':'晚间礼盒按累计进度点亮'};
  }
  root.FocusEveningRewards={init,render,summary};
})(typeof globalThis!=='undefined'?globalThis:this);
