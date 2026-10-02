(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const subjects={math:{name:'数学',mark:'Σ',color:'#96cbb7'},cs:{name:'408',mark:'{}',color:'#afa4d6'},politics:{name:'政治',mark:'文',color:'#d3ad89'},english:{name:'英语',mark:'Aa',color:'#8db9d1'}};
  const tiers={practice:{name:'落笔试锋',coins:20,diamonds:0},mastery:{name:'学以致用',coins:40,diamonds:1}};
  let bridge={},initialized=false,latest=null,markup='',busy=null,dialogue=0,portrait=null;
  // Receipts outlive any in-flight poll, but the database remains the source of truth.
  const received=new Set(),receivedBonusTickets=new Map();
  const claimKey=(day,subject,tier)=>`${day}:${subject}:${tier}`;
  function remember(key){received.add(key);if(received.size>256)received.delete(received.values().next().value);}
  const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  const model=()=>latest?.methodRewards;
  const current=()=>Boolean(model()?.isToday===true&&model().day===model().today&&latest.date===latest.today&&latest.date===model().day);
  const rows=()=>Object.keys(subjects).map(id=>model()?.subjects?.find(item=>item?.id===id)).filter(Boolean);
  const rewardFor=(subject,tier)=>subject.rewards?.find(item=>item?.id===tier);
  const claimed=(subject,tier)=>Boolean(rewardFor(subject,tier)?.claimed||received.has(claimKey(model()?.day,subject.id,tier)));
  const available=(subject,tier)=>Boolean(current()&&!claimed(subject,tier)&&rewardFor(subject,tier)?.eligible===true&&rewardFor(subject,tier)?.available===true);
  const bonusClaimed=()=>Boolean(model()?.completionBonus?.claimed||received.has(claimKey(model()?.day,'all','completion')));
  const bonusAvailable=()=>Boolean(current()&&!bonusClaimed()&&model()?.completionBonus?.eligible===true&&model().completionBonus.available===true);
  function lotteryTickets(value){
    if(!value||!['coinTickets','diamondTickets'].every(key=>Number.isSafeInteger(value[key])&&value[key]>=0))return null;
    return {coinTickets:value.coinTickets,diamondTickets:value.diamondTickets};
  }
  function rememberBonusTickets(day,bonus){
    if(bonus?.claimed!==true||receivedBonusTickets.has(day))return;
    receivedBonusTickets.set(day,lotteryTickets(bonus.lotteryTickets));
    if(receivedBonusTickets.size>256)receivedBonusTickets.delete(receivedBonusTickets.keys().next().value);
  }
  function bonusTickets(){return bonusClaimed()&&receivedBonusTickets.has(model()?.day)?receivedBonusTickets.get(model().day):lotteryTickets(model()?.completionBonus?.lotteryTickets);}
  function ticketSummary(tickets){return tickets?[[tickets.coinTickets,'金币抽奖券'],[tickets.diamondTickets,'钻石抽奖券']].filter(([amount])=>amount>0).map(([amount,name])=>`${amount} 张${name}`).join(' ＋ '):'';}
  function bonusTicketHTML(){
    const tickets=bonusTickets();if(!ticketSummary(tickets))return '';
    return `<div class="method-completion-tickets" role="group" aria-label="${bonusClaimed()?'已收好的':'额外赠送的'}抽奖券">${[['coin',tickets.coinTickets,'金币抽奖券'],['diamond',tickets.diamondTickets,'钻石抽奖券']].filter(([,amount])=>amount>0).map(([kind,amount,name])=>`<span class="method-completion-ticket ${kind}"><i aria-hidden="true">${kind==='coin'?'◉':'◇'}</i>${amount} 张${name}</span>`).join('')}</div>`;
  }
  function validBonusTickets(result,expected){
    if(result.alreadyClaimed||!expected||!ticketSummary(expected))return true;
    const actual=lotteryTickets(result.methodRewards?.completionBonus?.lotteryTickets),delta=lotteryTickets(result.lotteryTickets);
    if(!actual||actual.coinTickets!==expected.coinTickets||actual.diamondTickets!==expected.diamondTickets||!delta||delta.coinTickets!==expected.coinTickets||delta.diamondTickets!==expected.diamondTickets)return false;
    const granted={coinTickets:0,diamondTickets:0};
    for(const grant of Array.isArray(result.ticketGrants)?result.ticketGrants:[]){
      if(!['coin','diamond'].includes(grant?.machine)||!Number.isSafeInteger(grant?.count)||grant.count<1)return false;
      granted[grant.machine==='coin'?'coinTickets':'diamondTickets']+=grant.count;
    }
    return granted.coinTickets===expected.coinTickets&&granted.diamondTickets===expected.diamondTickets;
  }

  function visible(){
    const host=$('method-rewards');if(!host||document.hidden||bridge.isVisible?.()===false)return false;
    for(let node=host;node;node=node.parentElement)if(node.hidden||node.inert)return false;
    return true;
  }
  function duration(value){
    const seconds=Math.floor(number(value)*60+1e-5),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);
    if(!seconds)return '0 分钟';
    if(!minutes)return `${seconds} 秒`;
    return `${hours?`${hours} 小时${minutes%60?' ':''}`:''}${minutes%60||!hours?`${minutes%60} 分钟`:''}${seconds%60?` ${seconds%60} 秒`:''}`;
  }
  function remaining(target,value){const gap=Math.max(0,target-number(value));return gap>0&&gap<1?'不到 1 分钟':`${Math.ceil(gap)} 分钟`;}
  function progress(subject,tier){
    const lecture=number(subject.lecture),practice=number(subject.practice);
    return Math.max(0,Math.min(1,tier==='practice'?practice/20:Math.max(Math.min(lecture/20,practice/30),practice/60)));
  }
  function requirement(subject,tier){
    if(claimed(subject,tier))return '这份研习奖励，已经收进行囊。';
    const item=rewardFor(subject,tier);
    if(item?.eligible===true)return current()?'今天的练习已经留下收获。':'那天已经完成了这一步。';
    if(!current())return '那天的积累也有意义，新的练习会从今天继续。';
    if(tier==='practice')return `再做题 ${remaining(20,subject.practice)}，就能收下这份鼓励。`;
    if(number(subject.lecture)>=20)return `再做题 ${remaining(30,subject.practice)}，让听过的方法落在纸上。`;
    return `继续做题 ${remaining(60,subject.practice)} 即可；也可以听课至 20 分钟、做题至 30 分钟。`;
  }
  function advice(){
    const all=rows(),active=all.filter(s=>number(s.lecture)+number(s.practice)+number(s.other)>0);
    if(!current())return ['这是那一天留下的研习纸页。完成的练习、听过的方法，都可以慢慢回看。','过去的一天不用补成满分。把有用的发现带到下一次落笔，就很好。'][dialogue%2];
    const lectureHeavy=all.filter(s=>number(s.lecture)>=20&&number(s.practice)<Math.min(30,number(s.lecture)/2)).sort((a,b)=>number(b.lecture)-number(a.lecture))[0];
    const options=[];
    if(lectureHeavy)options.push(`${lectureHeavy.name||subjects[lectureHeavy.id].name}已经听了 ${duration(lectureHeavy.lecture)}。下一小段可以选一道刚学过的题，试着自己写第一步，不必一下做很多。`);
    const practicing=all.find(s=>number(s.practice)>=60);
    if(practicing)options.push(`${practicing.name||subjects[practicing.id].name}今天已经独立练习了 ${duration(practicing.practice)}。纯做题也能领齐两份奖励，不用为了奖励再去凑一段听课。`);
    if(all.some(s=>available(s,'practice')||available(s,'mastery')))options.push('有几份小小的谢礼在等你。先把这一笔收好，再决定继续，还是让眼睛歇一会儿。');
    if(!active.length)options.push('今天的纸还是新的。听懂一个方法，再亲手试一试；已经会的部分，直接做题也很好。');
    options.push('错题不是白做。把卡住的那一步找出来，下一次落笔就会更有方向。','奖励是给真实练习的一点鼓励。背诵、复习和整理同样重要，不需要把它们改标成做题。','先按自己的计划学。这里不用接任务，两份奖励分别累计；纯做题满 60 分钟，同样能全部领取。');
    return options[dialogue%options.length];
  }
  function stage(subject,tier,index){
    const item=rewardFor(subject,tier),owned=claimed(subject,tier),ready=available(subject,tier),working=busy?.day===model().day&&busy.subject===subject.id&&busy.tier===tier;
    const disabled=Boolean(busy)||!ready,name=item?.name||tiers[tier].name,amount=item?.reward||tiers[tier];
    const percent=owned||item?.eligible===true?100:Math.floor(progress(subject,tier)*100);
    const status=owned?'已领取':!current()?(item?.eligible?'已完成 · 历史只读':'留待下一程'):working?'正在收好…':ready?'领取奖励':'继续积累';
    return `<li class="method-stage${owned?' is-claimed':ready?' is-ready':''}" data-method-tier="${tier}"><div class="method-stage-heading"><span class="method-stage-number" aria-hidden="true">${owned?'✓':String(index+1).padStart(2,'0')}</span><div><h4>${esc(name)}</h4><p>${tier==='practice'?'做题满 20 分钟':'听课 20 ＋ 做题 30，或纯做题 60 分钟'}</p></div></div><div class="method-meter" role="progressbar" aria-label="${esc(subject.name||subjects[subject.id].name)} · ${esc(name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><i style="width:${percent}%"></i></div><p class="method-requirement">${esc(requirement(subject,tier))}</p><div class="method-stage-bottom"><span class="method-reward-amount">${owned?'已收好':`${Math.floor(number(amount.coins))} 金币${number(amount.diamonds)?` · ${Math.floor(number(amount.diamonds))} 钻石`:''}`}</span><button type="button" data-method-claim="${subject.id}:${tier}" data-method-focus="${subject.id}:${tier}" aria-disabled="${disabled}"${working?' aria-busy="true"':''} aria-label="${esc(subject.name||subjects[subject.id].name)} · ${esc(name)} · ${status}">${status}</button></div></li>`;
  }
  function activityFor(id){return latest?.activities?.subjects?.find(item=>item?.id===id);}
  function insightHTML(item){
    if(!item?.advice)return '';
    const tone=['rest','balance','neutral'].includes(item.advice.tone)?item.advice.tone:'neutral';
    return `<div class="method-insight ${tone}" aria-label="${esc(item.name||'科目')}节奏观察"><strong>${esc(item.advice.title)}</strong><p>${esc(item.advice.text)}</p></div>`;
  }
  function summaryHTML(){
    const totals=latest?.activities?.totals||Object.fromEntries(['lecture','practice','other'].map(id=>[id,rows().reduce((sum,subject)=>sum+number(subject[id]),0)]));
    return `<div class="method-summary" role="group" aria-label="所选日期的学习方式总时长">${Object.entries({lecture:'听课',practice:'做题',other:'复习 / 其他'}).map(([id,name])=>`<div class="method-summary-item ${id}"><span><i aria-hidden="true"></i>${name}</span><strong>${duration(totals[id])}</strong></div>`).join('')}</div>`;
  }
  function extraActivityHTML(){
    const extras=(latest?.activities?.subjects||[]).filter(item=>item&&!subjects[item.id]&&number(item.minutes)>0);
    const overview=number(latest?.activities?.totals?.other)>0&&latest?.activities?.advice?.id==='unclassified'&&latest.activities.advice.text;
    return `${extras.map(item=>`<div class="method-unclassified"><div><strong>${esc(item.name||'待分类科目')}</strong><span>累计 ${duration(item.minutes)} · 听课 ${duration(item.lecture)} · 做题 ${duration(item.practice)} · 复习 / 其他 ${duration(item.other)}</span></div>${insightHTML(item)}<button type="button" data-method-action="settings" data-method-focus="unclassified-settings">核对任务归类 ↗</button></div>`).join('')}${overview?`<p class="method-overview">${esc(overview)}</p>`:''}`;
  }
  function card(subject){
    const spec=subjects[subject.id],color=/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(subject.color||'')?subject.color:spec.color;
    const total=number(subject.lecture)+number(subject.practice)+number(subject.other);
    return `<article class="method-subject" data-method-subject="${subject.id}" style="--method-color:${color}"><header><span class="method-subject-mark" aria-hidden="true">${spec.mark}</span><h3>${esc(subject.name||spec.name)}</h3><span class="method-subject-count">${['practice','mastery'].filter(t=>claimed(subject,t)).length} / 2 已领取</span></header><span class="method-subject-total">累计 ${duration(total)}</span><dl class="method-totals">${Object.entries({lecture:'听课',practice:'做题',other:'复习 / 其他'}).map(([id,name])=>`<div class="${id}"><dt>${name}</dt><dd>${duration(subject[id])}</dd></div>`).join('')}</dl>${insightHTML(activityFor(subject.id))}<ol>${stage(subject,'practice',0)}${stage(subject,'mastery',1)}</ol></article>`;
  }
  function completionGiftArt(ready){
    if(!ready)return '<svg viewBox="0 0 64 64" fill="none"><path d="M12 29h40v25H12zM8 20h48v11H8z" stroke="currentColor" stroke-width="2"/><path d="M28 20h8v34h-8z" fill="currentColor" opacity=".25"/><path d="M32 20C17 20 15 8 23 8c6 0 9 12 9 12Zm0 0c15 0 17-12 9-12-6 0-9 12-9 12Z" stroke="currentColor" stroke-width="2"/><path d="m6 6 2 4 4 2-4 2-2 4-2-4-4-2 4-2Zm51 32 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="currentColor" opacity=".6"/></svg>';
    return `<svg class="method-completion-gift" viewBox="0 0 80 80" fill="none"><defs><linearGradient id="methodGiftMint" x1="15" y1="37" x2="40" y2="72" gradientUnits="userSpaceOnUse"><stop stop-color="#72f4cf"/><stop offset="1" stop-color="#28aaa9"/></linearGradient><linearGradient id="methodGiftViolet" x1="40" y1="39" x2="66" y2="69" gradientUnits="userSpaceOnUse"><stop stop-color="#b098ff"/><stop offset="1" stop-color="#7560ed"/></linearGradient><linearGradient id="methodGiftLid" x1="13" y1="28" x2="68" y2="41" gradientUnits="userSpaceOnUse"><stop stop-color="#ff91b6"/><stop offset="1" stop-color="#ffd084"/></linearGradient></defs><ellipse cx="40" cy="73" rx="24" ry="4" fill="#131b35" opacity=".22"/><path d="m16 39 24 10v23L16 62Z" fill="url(#methodGiftMint)"/><path d="m40 49 24-10v23L40 72Z" fill="url(#methodGiftViolet)"/><path d="m13 31 27-12 27 12-27 12Z" fill="url(#methodGiftLid)"/><path d="m13 31 27 12v9L13 40Z" fill="#53cbe5"/><path d="m40 43 27-12v9L40 52Z" fill="#8488fa"/><path d="m28 24 27 12-8 3-27-12Z" fill="#fff1ad"/><path d="m52 24-27 12 8 3 27-12Z" fill="#ffde78"/><path d="m25 46 8 4v19l-8-4Z" fill="#fff1ad"/><path d="m48 49 8-4v20l-8 4Z" fill="#ffdf83"/><path d="M40 25C23 26 18 12 25 10c8-3 14 7 15 15Z" fill="#ffd66f" stroke="#fff0b3" stroke-width="1.4"/><path d="M40 25c17 1 22-13 15-15-8-3-14 7-15 15Z" fill="#ffe8a0" stroke="#fff4c9" stroke-width="1.4"/><path d="M39 25c-6-10-11-11-12-9 0 3 5 6 12 9Zm2 0c6-10 11-11 12-9 0 3-5 6-12 9Z" fill="#e99064" opacity=".55"/><circle cx="40" cy="25" r="4" fill="#fff4c9"/><path d="m10 10 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#8cffe1"/><path d="m69 45 2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#ffd78a"/><path d="m64 8 1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5Z" fill="#e1c1ff"/><path d="m43 54 18-8v2l-18 8Z" fill="#d5caff" opacity=".6"/></svg>`;
  }
  function bonusHTML(){
    const bonus=model()?.completionBonus;if(!bonus)return '';
    const owned=bonusClaimed(),ready=bonusAvailable(),working=busy?.day===model().day&&busy.subject==='all'&&busy.tier==='completion';
    const count=Math.min(8,Math.floor(number(bonus.completedCount))),status=owned?'已领取':ready?'领取额外奖赏':current()?'继续研习':bonus.eligible?'已完成 · 历史只读':'留待下一程';
    const note=owned?'四科的听与练，都已经留下了收获。这份额外奖赏已收进行囊。':ready?'四科两档研习全部完成，砚青为你备好了一份额外奖赏。':current()?'四科各完成两档研习，即可领取；不必先领取单科奖励。':'回看这一天的研习足迹。额外奖赏仅限完成当天领取。';
    return `<section class="method-completion${ready?' is-ready':''}${owned?' is-claimed':''}" aria-labelledby="method-completion-title"><div class="method-completion-art" aria-hidden="true">${completionGiftArt(ready)}</div><div class="method-completion-copy"><span class="method-completion-eyebrow">四科研习 · 每日额外奖赏</span><h3 id="method-completion-title">融会贯通</h3><p>${note}</p><div class="method-completion-subjects" aria-label="四科两档任务完成情况">${rows().map(subject=>{const done=Object.keys(tiers).filter(tier=>rewardFor(subject,tier)?.eligible===true).length;return `<span class="${done===2?'is-complete':''}">${esc(subjects[subject.id].name)} <b>${done===2?'✓':`${done} / 2`}</b></span>`;}).join('')}</div><div class="method-completion-meter" role="progressbar" aria-label="四科研习任务完成进度" aria-valuemin="0" aria-valuemax="8" aria-valuenow="${count}"><i style="width:${count/8*100}%"></i></div></div><div class="method-completion-reward"><strong>${Math.floor(number(bonus.reward?.coins))} 金币 <span>· ${Math.floor(number(bonus.reward?.diamonds))} 钻石</span></strong>${bonusTicketHTML()}<small>每天一次 · ${count} / 8 档已完成</small><button type="button" data-method-bonus="true" data-method-focus="all:completion" aria-disabled="${Boolean(busy)||!ready}"${working?' aria-busy="true"':''} aria-label="融会贯通 · ${status}">${status}</button></div></section>`;
  }
  function paint(){
    const host=$('method-rewards');if(!host)return;
    if(!model()){host.hidden=true;return;}host.hidden=false;
    if(portrait===null&&root.FocusMethodArt?.avatar)portrait=root.FocusMethodArt.avatar();
    const count=rows().reduce((sum,s)=>sum+['practice','mastery'].filter(t=>available(s,t)).length,0)+Number(bonusAvailable());
    const html=`<section class="method-workshop" aria-labelledby="method-rewards-title"><div class="method-mentor"><div class="method-portrait" aria-hidden="true">${portrait||'<span>砚</span>'}</div><div class="method-intro"><div class="method-eyebrow">LEARN IT · TRY IT <span>${current()?'今日研习':`${esc(model().day)} · 研习回看`}</span></div><div class="method-title-row"><h2 id="method-rewards-title">知行研习所</h2><span class="method-status">${current()?(count?`${count} 份奖励可领取`:'小步落笔，自有收获'):'历史记录 · 只读'}</span></div><p class="method-mentor-name">研习导师 · 砚青</p><p class="method-dialogue">${esc(advice())}</p><div class="method-intro-actions"><button type="button" data-method-action="advice" data-method-focus="advice">再听一句 ↻</button><button type="button" data-method-action="settings" data-method-focus="settings">核对学习方式 ↗</button></div></div></div>${summaryHTML()}<div class="method-rules"><span><b>20 分钟做题</b> · 每科 20 金币</span><span><b>听课 20 ＋ 做题 30，或纯做题 60 分钟</b> · 每科再得 40 金币、1 钻石</span><small>四科各两份，每天各领一次；不用接取，也不扣减其他委托进度。纯做题满 60 分钟可领齐两份。单科奖励合计最多 240 金币、4 钻石；四科全部完成后，另有 200 金币、4 钻石${ticketSummary(bonusTickets())?`，以及 ${ticketSummary(bonusTickets())}`:''}。</small></div><div class="method-subjects">${rows().map(card).join('')}</div>${bonusHTML()}${extraActivityHTML()}<p class="method-mapping-note">按原有的「学习方式」分类统计，只认可标为做题的真实练习；背诵、阅读与整理请保留真实分类。今天的奖励请在今天领取。节奏观察按所选日期统计：单科听课满60分钟、做题不足听课一半时给出提醒，仅供安排参考。</p></section>`;
    if(html===markup)return;
    const focus=host.contains(document.activeElement)?document.activeElement?.closest?.('[data-method-focus]')?.dataset.methodFocus:null;
    host.innerHTML=html;markup=html;
    if(focus&&visible())host.querySelector(`[data-method-focus="${focus}"]`)?.focus({preventScroll:true});
  }
  function render(snapshot){
    latest=snapshot;
    if(model())for(const subject of rows())for(const tier of Object.keys(tiers))if(rewardFor(subject,tier)?.claimed)remember(claimKey(model().day,subject.id,tier));
    if(model()?.completionBonus?.claimed){remember(claimKey(model().day,'all','completion'));rememberBonusTickets(model().day,model().completionBonus);}
    paint();
  }
  async function claim(subjectId,tier){
    const isBonus=subjectId==='all'&&tier==='completion';
    if(busy||!visible()||(!isBonus&&(!subjects[subjectId]||!tiers[tier])))return;
    const subject=rows().find(s=>s.id===subjectId);if(isBonus?!bonusAvailable():!subject||!available(subject,tier))return;
    const day=model().day,expectedTickets=isBonus?bonusTickets():null;busy={day,subject:subjectId,tier};bridge.unlock?.();paint();
    try{
      const result=await bridge.api(isBonus?'/api/method-rewards/completion':'/api/method-rewards/claim',isBonus?{day}:{day,subject:subjectId,tier});
      if(result?.day!==day||result.subject!==subjectId||result.tier!==tier||result.methodRewards?.day!==day||!result.wallet||!result.reward||(isBonus&&(result.methodRewards.completionBonus?.claimed!==true||!validBonusTickets(result,expectedTickets))))throw new Error('奖励回执暂未完整返回，请稍后再点一次确认。');
      remember(claimKey(day,subjectId,tier));
      if(isBonus)rememberBonusTickets(day,result.methodRewards.completionBonus);
      if(latest?.date===day&&model()?.day===day)latest={...latest,methodRewards:result.methodRewards};
      bridge.acceptReceipt?.(result);
      if(!result.alreadyClaimed){
        if(visible())bridge.playSound?.('delivery',{key:`method-reward:${day}:${subjectId}:${tier}`});
        bridge.toast?.(`${isBonus?'四科研习 · 融会贯通':`${subjects[subjectId].name} · ${tiers[tier].name}`}，奖励已收好`,`+${number(result.reward.coins)} 金币${number(result.reward.diamonds)?` · +${number(result.reward.diamonds)} 钻石`:''}${root.FocusLottery?.ticketText?.(result.ticketGrants)||''}`);
      }else bridge.toast?.('这份研习奖励已经收好','不重复领取，行囊里的收获已经记下。');
    }catch(error){bridge.toast?.('研习奖励还在这里',error?.message||'暂时未能领取，请稍后再试。',true);}
    finally{busy=null;paint();}
    try{await bridge.refresh?.(true);}catch{/* A later poll cannot undo a valid receipt. */}
  }
  function init(callbacks={}){
    bridge={...bridge,...callbacks};if(initialized)return;
    const host=$('method-rewards');if(!host)return;initialized=true;
    host.addEventListener('click',event=>{
      if(event.defaultPrevented||(event.button!==undefined&&event.button!==0)||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!visible())return;
      const button=event.target?.closest?.('[data-method-focus]');if(!button||!host.contains(button))return;
      const action=button.dataset.methodAction;
      if(action==='settings'){event.preventDefault();bridge.openMethods?.();return;}
      if(action==='advice'){event.preventDefault();dialogue=(dialogue+1)%120;paint();return;}
      if(button.dataset.methodBonus){event.preventDefault();void claim('all','completion');return;}
      if(button.dataset.methodClaim){event.preventDefault();const [subject,tier]=button.dataset.methodClaim.split(':');void claim(subject,tier);}
    });
    // These are native buttons: Enter and Space supply their normal click behavior.
    paint();
  }
  root.FocusMethodRewards={init,render};
})(typeof globalThis!=='undefined'?globalThis:this);
