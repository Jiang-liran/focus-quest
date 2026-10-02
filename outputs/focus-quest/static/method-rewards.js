(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const subjects={math:{name:'数学',mark:'Σ',color:'#96cbb7'},cs:{name:'408',mark:'{}',color:'#afa4d6'},politics:{name:'政治',mark:'文',color:'#d3ad89'},english:{name:'英语',mark:'Aa',color:'#8db9d1'}};
  const tiers={practice:{name:'落笔试锋',coins:20,diamonds:0},mastery:{name:'学以致用',coins:40,diamonds:1}};
  let bridge={},initialized=false,latest=null,markup='',busy=null,dialogue=0,portrait=null;
  // Receipts outlive any in-flight poll, but the database remains the source of truth.
  const received=new Set();
  const claimKey=(day,subject,tier)=>`${day}:${subject}:${tier}`;
  function remember(key){received.add(key);if(received.size>256)received.delete(received.values().next().value);}
  const number=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  const model=()=>latest?.methodRewards;
  const current=()=>Boolean(model()?.isToday===true&&model().day===model().today&&latest.date===latest.today&&latest.date===model().day);
  const rows=()=>Object.keys(subjects).map(id=>model()?.subjects?.find(item=>item?.id===id)).filter(Boolean);
  const rewardFor=(subject,tier)=>subject.rewards?.find(item=>item?.id===tier);
  const claimed=(subject,tier)=>Boolean(rewardFor(subject,tier)?.claimed||received.has(claimKey(model()?.day,subject.id,tier)));
  const available=(subject,tier)=>Boolean(current()&&!claimed(subject,tier)&&rewardFor(subject,tier)?.eligible===true&&rewardFor(subject,tier)?.available===true);
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
  function card(subject){
    const spec=subjects[subject.id],color=/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(subject.color||'')?subject.color:spec.color;
    return `<article class="method-subject" data-method-subject="${subject.id}" style="--method-color:${color}"><header><span class="method-subject-mark" aria-hidden="true">${spec.mark}</span><h3>${esc(subject.name||spec.name)}</h3><span class="method-subject-count">${['practice','mastery'].filter(t=>claimed(subject,t)).length} / 2 已领取</span></header><p class="method-totals">听课 ${duration(subject.lecture)}<br>做题 ${duration(subject.practice)}</p><ol>${stage(subject,'practice',0)}${stage(subject,'mastery',1)}</ol></article>`;
  }
  function paint(){
    const host=$('method-rewards');if(!host)return;
    if(!model()){host.hidden=true;return;}host.hidden=false;
    if(portrait===null&&root.FocusMethodArt?.avatar)portrait=root.FocusMethodArt.avatar();
    const count=rows().reduce((sum,s)=>sum+['practice','mastery'].filter(t=>available(s,t)).length,0);
    const html=`<section class="method-workshop" aria-labelledby="method-rewards-title"><div class="method-mentor"><div class="method-portrait" aria-hidden="true">${portrait||'<span>砚</span>'}</div><div class="method-intro"><div class="method-eyebrow">LEARN IT · TRY IT <span>${current()?'今日研习':`${esc(model().day)} · 研习回看`}</span></div><div class="method-title-row"><h2 id="method-rewards-title">知行研习所</h2><span class="method-status">${current()?(count?`${count} 份奖励可领取`:'小步落笔，自有收获'):'历史记录 · 只读'}</span></div><p class="method-mentor-name">研习导师 · 砚青</p><p class="method-dialogue">${esc(advice())}</p><div class="method-intro-actions"><button type="button" data-method-action="advice" data-method-focus="advice">再听一句 ↻</button><button type="button" data-method-action="settings" data-method-focus="settings">核对学习方式 ↗</button></div></div></div><div class="method-rules"><span><b>20 分钟做题</b> · 每科 20 金币</span><span><b>听课 20 ＋ 做题 30，或纯做题 60 分钟</b> · 每科再得 40 金币、1 钻石</span><small>四科各两份，每天各领一次；不用接取，也不扣减其他委托进度。纯做题满 60 分钟可领齐两份。每日合计最多 240 金币、4 钻石。</small></div><div class="method-subjects">${rows().map(card).join('')}</div><p class="method-mapping-note">按原有的「学习方式」分类统计，只认可标为做题的真实练习；背诵、阅读与整理请保留真实分类。今天的奖励请在今天领取。</p></section>`;
    if(html===markup)return;
    const focus=host.contains(document.activeElement)?document.activeElement?.closest?.('[data-method-focus]')?.dataset.methodFocus:null;
    host.innerHTML=html;markup=html;
    if(focus&&visible())host.querySelector(`[data-method-focus="${focus}"]`)?.focus({preventScroll:true});
  }
  function render(snapshot){
    latest=snapshot;
    if(model())for(const subject of rows())for(const tier of Object.keys(tiers))if(rewardFor(subject,tier)?.claimed)remember(claimKey(model().day,subject.id,tier));
    paint();
  }
  async function claim(subjectId,tier){
    if(busy||!visible()||!subjects[subjectId]||!tiers[tier])return;
    const subject=rows().find(s=>s.id===subjectId);if(!subject||!available(subject,tier))return;
    const day=model().day;busy={day,subject:subjectId,tier};bridge.unlock?.();paint();
    try{
      const result=await bridge.api('/api/method-rewards/claim',{day,subject:subjectId,tier});
      if(result?.day!==day||result.subject!==subjectId||result.tier!==tier||result.methodRewards?.day!==day||!result.wallet||!result.reward)throw new Error('奖励回执暂未完整返回，请稍后再点一次确认。');
      remember(claimKey(day,subjectId,tier));
      if(latest?.date===day&&model()?.day===day)latest={...latest,methodRewards:result.methodRewards};
      bridge.acceptReceipt?.(result);
      if(!result.alreadyClaimed){
        if(visible())bridge.playSound?.('delivery',{key:`method-reward:${day}:${subjectId}:${tier}`});
        bridge.toast?.(`${subjects[subjectId].name} · ${tiers[tier].name}，奖励已收好`,`+${number(result.reward.coins)} 金币${number(result.reward.diamonds)?` · +${number(result.reward.diamonds)} 钻石`:''}`);
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
      if(button.dataset.methodClaim){event.preventDefault();const [subject,tier]=button.dataset.methodClaim.split(':');void claim(subject,tier);}
    });
    // These are native buttons: Enter and Space supply their normal click behavior.
    paint();
  }
  root.FocusMethodRewards={init,render};
})(typeof globalThis!=='undefined'?globalThis:this);
