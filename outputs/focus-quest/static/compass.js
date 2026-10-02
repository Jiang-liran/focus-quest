(function(root){
  'use strict';
  const $=id=>document.getElementById(id),names={math:'数学',cs:'408',politics:'政治',english:'英语'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=v=>JSON.parse(JSON.stringify(v));
  const rendered=new Map();
  function put(id,html){if(rendered.get(id)===html)return false;$(id).innerHTML=html;rendered.set(id,html);return true;}
  const timestamp=value=>{const part=String(value).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/);return Date.parse(value)*1000+Number((part?.[1]||'').padEnd(6,'0').slice(3,6));};
  let bridge={},data=null,selected=null,draft=null,dirty=false,busy=false,conflict=false,lastStamp=-Infinity,deferred=null,startIntent=null;
  const subject=s=>names[s]||'学习';
  const current=()=>draft||data?.recommendations?.find(r=>r.id===selected)||data?.recommendations?.[0];
  function rose(s,done=0){
    const angles={math:0,cs:90,politics:270,english:180};
    return `<svg class="compass-rose" viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="69" fill="#a79ccb0a" stroke="#9e95bf35"/><circle cx="80" cy="80" r="54" fill="none" stroke="#a59ac032" stroke-dasharray="2 8"/><path d="M80 4v20m0 112v20M4 80h20m112 0h20" stroke="#b4a2ca88"/><g transform="rotate(${angles[s]||0} 80 80)"><path d="M80 31 95 92 80 82 65 92Z" fill="#c6afe7"/><path d="m80 129 15-61-15 10-15-10Z" fill="#786b95"/></g><circle cx="80" cy="80" r="7" fill="#eee1c1"/>${[0,1,2].map((n)=>`<circle cx="${55+25*n}" cy="147" r="4" fill="${done>n?'#a4d6bd':'#55516a'}"/>`).join('')}</svg>`;
  }
  function repaint(){
    if(!data||!$('compass-editor'))return;
    const c=current(),active=!!draft,done=(draft?.checked||[]).filter(Boolean).length;
    put('compass-pill-icon',rose(c?.subject,done));
    $('compass-pill-subject').textContent=active?`${subject(c.subject)} · 正在实践`:'行动罗盘 · '+subject(c?.subject);
    $('compass-pill-title').textContent=c?.title||'选择一个具体的小行动';
    $('compass-pill-title').title=c?.title||'';
    $('compass-pill-status').textContent=active?`${done} / 3 步${dirty?' · 待保存':''}`:'让下一段学习更具体';
    $('compass-open').textContent=active?'继续行动 ↗':'展开罗盘 ↗';
    $('compass-next').disabled=busy||active;
    put('compass-recommendations',(data.recommendations||[]).map((r,i)=>`<button type="button" class="compass-choice ${selected===r.id?'selected':''}" data-compass-choose="${esc(r.id)}" aria-pressed="${selected===r.id}" ${busy||active?'disabled':''}><span>${subject(r.subject)}${i===0?' · 此刻推荐':''}</span><strong>${esc(r.title)}</strong><small>${esc(r.why)}</small></button>`).join(''));
    $('compass-context').textContent=`依据今天（${data.today}）的学习记录 · 回看历史日期不会改变此处建议`;
    if(!c){$('compass-editor').innerHTML='<p>正在准备下一步行动…</p>';return;}
    put('compass-editor',`<div class="compass-action-top"><div><span class="eyebrow">${active?'ONE THING AT A TIME':'A SMALL, CONCRETE STEP'}</span><h2>${esc(c.title)}</h2><p>${esc(c.why)}</p></div>${rose(c.subject,done)}</div><div class="compass-action-meta"><span>${subject(c.subject)}</span><span>参考 ${Number(c.estimatedMinutes)||15} 分钟 · 按理解程度完成</span>${active?`<span>${done} / 3 步已实践</span>`:''}</div><ol class="compass-steps">${(c.steps||[]).map((step,i)=>`<li class="${draft?.checked[i]?'done':''}">${active?`<label><input type="checkbox" data-compass-step="${i}" ${draft.checked[i]?'checked':''} ${busy||conflict?'disabled':''}><span><b>0${i+1}</b>${esc(step)}</span></label>`:`<div><b>0${i+1}</b><span>${esc(step)}</span></div>`}</li>`).join('')}</ol>${active?`<label class="compass-note-label" for="compass-note">给下次的自己留一句 <small>可选</small></label><p class="compass-prompt">${esc(c.prompt)}</p><textarea id="compass-note" maxlength="1000" rows="3" placeholder="一个弄懂的关键，或下次准备接着解决的问题。" ${busy||conflict?'disabled':''}>${esc(draft.note)}</textarea><div class="compass-save-line"><span id="compass-save-state">${conflict?'这项行动已在另一窗口变化，请载入最新状态。':dirty?'有未保存修改 · 保存、完成或暂放时会存入本机。':'已保存到本机 · 勾选表示你实际做过这一步。'}</span><button type="button" class="text-button" data-compass-action="reload" ${busy?'disabled':''}>载入已保存版本</button></div><div class="compass-actions"><button type="button" class="secondary-button" data-compass-action="park" ${busy||conflict?'disabled':''}>留待下次</button><button type="button" class="secondary-button" data-compass-action="save" ${busy||conflict||!dirty?'disabled':''}>保存进展</button><button type="button" class="primary-button" data-compass-action="complete" ${busy||conflict||done!==3?'disabled':''}>${busy?'正在保存…':'收好这次实践 ✓'}</button></div>`:`<p class="compass-action-note">题目和材料由你选择。完成后可以留下收获与卡点；需要计时，仍使用番茄 ToDo。</p><button type="button" class="primary-button" data-compass-action="start" ${busy?'disabled':''}>${busy?'正在开始…':'就从这一步开始 →'}</button>`}`);
    renderHistory();
  }
  function renderHistory(){
    const host=$('compass-history'),expanded=[...host.querySelectorAll('details[open]')].map(el=>el.dataset.actionEntry);
    const html=(data.history||[]).length?data.history.map(h=>`<details class="compass-entry" data-action-entry="${esc(h.id)}"><summary><span class="compass-entry-mark ${h.status==='completed'?'complete':''}">${h.status==='completed'?'✓':'↗'}</span><span><strong>${esc(h.title)}</strong><small>${subject(h.subject)} · ${esc(String(h.completedAt||h.updatedAt||h.startedAt).slice(0,10))}</small></span><em>${h.status==='completed'?'已实践':'留待下次'}</em></summary><div><p class="compass-entry-note">${h.note?esc(h.note):'这次没有留下文字，走过的步骤已经收好。'}</p><ul>${h.steps.map((step,i)=>`<li>${h.checked[i]?'✓':'○'} ${esc(step)}</li>`).join('')}</ul><button type="button" class="text-button" data-compass-repeat="${esc(h.cardId)}" ${busy||draft?'disabled':''}>${h.status==='completed'?'照这个方法再练一次':'重新开始这项行动'} ↗</button></div></details>`).join(''):'<div class="compass-empty"><span>✧</span><strong>先留下一件真正弄懂的小事。</strong><p>你的实践与卡点会收在这里，下次回来就能接着往前走。</p></div>';
    if(put('compass-history',html)){for(const entry of host.querySelectorAll('details'))if(expanded.includes(entry.dataset.actionEntry))entry.open=true;}
  }
  function render(next,force=false){
    if(!next)return;
    if(busy&&!force){deferred=next;return;}
    const stamp=timestamp(next.now);if(!force&&Number.isFinite(stamp)&&stamp<lastStamp)return;
    if(Number.isFinite(stamp))lastStamp=stamp;
    data=next;if(data.active)startIntent=null;
    if(!data.recommendations?.some(r=>r.id===selected))selected=data.recommendations?.[0]?.id;
    if(dirty&&!force){
      conflict=!data.active||data.active.id!==draft?.id||data.active.version!==draft?.version;
      // Polling never replaces a note being typed, its selection, or a checked step.
      if(conflict){$('compass-save-state').textContent='这项行动已在另一窗口变化，请先载入已保存版本。';document.querySelectorAll('#compass-note,[data-compass-step],[data-compass-action="save"],[data-compass-action="complete"],[data-compass-action="park"]').forEach(el=>el.disabled=true);}
      renderHistory();return;
    }
    const unchanged=draft&&data.active?.id===draft.id&&data.active.version===draft.version;
    if(unchanged&&!force)return;
    draft=data.active?clone(data.active):null;dirty=false;conflict=false;repaint();
  }
  function changed(){
    dirty=true;
    $('compass-save-state').textContent='有未保存修改 · 保存、完成或暂放时会存入本机。';
    document.querySelector('[data-compass-action="save"]').disabled=busy||conflict;
    document.querySelector('[data-compass-action="complete"]').disabled=busy||conflict||!draft.checked.every(Boolean);
    $('compass-pill-status').textContent=`${draft.checked.filter(Boolean).length} / 3 步 · 待保存`;
  }
  async function act(action,cardId){
    if(busy)return;
    if(action==='reload'){
      busy=true;try{const result=await bridge.api('/api/actions');busy=false;render(result,true);}catch(error){bridge.toast?.('暂未载入',error.message,true);}finally{busy=false;if(deferred){const pending=deferred;deferred=null;render(pending);}}return;
    }
    if(action==='start'&&(draft||data?.active))return;
    if(action!=='start'&&(!draft||conflict))return;
    if(action==='complete'&&!draft.checked.every(Boolean))return;
    busy=true;repaint();let response=null;
    try{
      if(action==='start'){
        const chosen=cardId||current()?.id;if(!chosen)throw new Error('请选择一个行动方向。');
        if(!root.crypto?.randomUUID)throw new Error('请重新打开应用后再试。');
        if(!startIntent||startIntent.cardId!==chosen)startIntent={cardId:chosen,requestId:root.crypto.randomUUID()};
        response=await bridge.api('/api/actions/start',startIntent);startIntent=null;
      }else{
        let saved=draft;
        if(dirty){response=await bridge.api('/api/actions/update',{id:draft.id,version:draft.version,checked:draft.checked,note:draft.note});saved=response.active;draft=clone(saved);dirty=false;}
        if(action!=='save')response=await bridge.api('/api/actions/'+action,{id:saved.id,version:saved.version});
        else if(!response)response=await bridge.api('/api/actions');
      }
      busy=false;render(response,true);
      bridge.toast?.(action==='complete'?'这次实践已收好':action==='park'?'下次从这里继续':action==='start'?'方向已选好':'进展已保存',action==='complete'?'留下的方法和卡点，比一个数字更值得带走。':'行动和备注保存在这台电脑上。');
      if(action==='complete')bridge.playSound?.('delivery',{key:'action:'+String(response.history?.[0]?.id)});
    }catch(error){bridge.toast?.('暂未保存',error.message,true);}
    finally{busy=false;repaint();if(deferred){const pending=deferred;deferred=null;render(pending);}}
    try{await bridge.refresh?.(true);}catch(_){}
  }
  function open(){bridge.openPage?.('achievements');$('compass-panel')?.scrollIntoView({behavior:'auto',block:'start'});$('compass-heading')?.focus({preventScroll:true});}
  function init(callbacks){
    bridge=callbacks;
    $('compass-open')?.addEventListener('click',open);
    $('compass-next')?.addEventListener('click',()=>{if(draft||busy||!data?.recommendations?.length)return;const i=data.recommendations.findIndex(r=>r.id===selected);selected=data.recommendations[(i+1)%data.recommendations.length].id;startIntent=null;repaint();});
    $('compass-panel')?.addEventListener('click',event=>{const pick=event.target.closest('[data-compass-choose]'),button=event.target.closest('[data-compass-action]');if(pick&&!draft&&!busy){selected=pick.dataset.compassChoose;startIntent=null;repaint();}if(button)act(button.dataset.compassAction);});
    $('compass-history')?.addEventListener('click',event=>{const b=event.target.closest('[data-compass-repeat]');if(b)act('start',b.dataset.compassRepeat);});
    $('compass-editor')?.addEventListener('change',event=>{const step=event.target.closest('[data-compass-step]');if(!step||!draft||busy||conflict)return;const index=Number(step.dataset.compassStep);if(!Number.isInteger(index)||index<0||index>2)return;draft.checked[index]=!!step.checked;dirty=true;repaint();document.querySelector('[data-compass-step="'+index+'"]')?.focus();});
    $('compass-editor')?.addEventListener('input',event=>{if(event.target.id!=='compass-note'||!draft||busy||conflict)return;draft.note=event.target.value.slice(0,1000);changed();});
  }
  root.FocusCompass={init,render};
})(typeof globalThis!=='undefined'?globalThis:this);
