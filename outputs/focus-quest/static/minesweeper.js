(function(root){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const int=v=>Math.max(0,Math.floor(Number(v)||0));
  const mine='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="7" fill="currentColor"/><path d="M8 8h3v3H8z" fill="#fff"/></svg>';
  const flag='<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 3v14m-5 1h10m-13 3h16" stroke="#111" stroke-width="2"/><path d="M12 3 3 8l9 3Z" fill="#e21d25"/></svg>';
  let host=null,session=null,options={},boardKey='',gesture=null,focusCell='0,0',bindings=[];
  const active=()=>session?.status==='active'&&!options.blocked?.()&&options.visible?.()!==false&&(root.FocusRuntime?.isVisible?.()??!root.document?.hidden);
  function digits(n){const value=Math.max(-99,Math.min(999,Math.floor(Number(n)||0)));return value<0?'-'+String(-value).padStart(2,'0'):String(value).padStart(3,'0');}
  function elapsed(a=session,serverNow=options.now?.()??Date.now()){
    if(!a?.state)return 0;const s=a.state,start=Date.parse(s.clockStartedAt);
    return s.phase==='playing'&&Number.isFinite(start)?Math.max(0,Number(s.elapsedSeconds)||0,(serverNow-start)/1000):Math.max(0,Number(s.elapsedSeconds)||0);
  }
  function timeLabel(value){const sec=int(value);return sec<60?`${sec} 秒`:`${Math.floor(sec/60)} 分 ${String(sec%60).padStart(2,'0')} 秒`;}
  function face(mode){const eyes=mode==='won'?'<path d="M5 8h14M6 8v4h5V8m2 0v4h5V8" stroke="#121212" stroke-width="1.6" fill="#121212"/>':mode==='lost'?'<path d="m6 7 4 4m0-4-4 4m8-4 4 4m0-4-4 4" stroke="#121212" stroke-width="1.6"/>':'<circle cx="8" cy="9" r="1.5"/><circle cx="16" cy="9" r="1.5"/>';
    const mouth=mode==='pressed'?'<ellipse cx="12" cy="16" rx="2" ry="3" fill="none" stroke="#121212" stroke-width="1.5"/>':mode==='lost'?'<path d="M7 18q5-6 10 0" fill="none" stroke="#121212" stroke-width="1.5"/>':'<path d="M6 14q6 9 12 0" fill="none" stroke="#121212" stroke-width="1.5"/>';
    return `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" fill="#ffe63e" stroke="#151515"/>${eyes}${mouth}</svg>`;
  }
  function updateFace(pressed=false){const el=host?.querySelector('[data-mines-reset]');if(!el)return;const mode=['won','lost'].includes(session?.state?.phase)?session.state.phase:pressed?'pressed':'ready';if(el.dataset.face!==mode){el.dataset.face=mode;el.innerHTML=face(mode);}}
  function cellArt(c){return c.wrongFlag?`<span class="mines-wrong">${mine}<i>×</i></span>`:c.state==='flag'?flag:c.mine?mine:c.state==='question'?'?':c.state==='open'&&c.number?String(c.number):'';}
  function cellLabel(c){return c.wrongFlag?'标错的旗帜':c.exploded?'引爆的地雷':c.state==='flag'?'旗帜':c.mine?'地雷':c.state==='question'?'问号':c.state==='open'?(c.number?`周围 ${int(c.number)} 颗雷`:'空白，周围没有雷'):'未翻开';}
  function board(s,readOnly=false){return s.cells.map((row,y)=>row.map((c,x)=>{
    const position=`${x},${y}`,cl=`mines-cell ${c.state==='open'||c.mine&&c.state!=='flag'||c.wrongFlag?'open':'covered'} ${c.exploded?'exploded':''} ${c.state==='flag'?'flag':''} n${int(c.number)}`;
    return `<${readOnly?'span':'button type="button"'} class="${cl}" ${readOnly?'':`data-mines-cell="${position}" tabindex="${position===focusCell?'0':'-1'}" aria-label="第 ${y+1} 行第 ${x+1} 列，${cellLabel(c)}"`}>${cellArt(c)}</${readOnly?'span':'button'}>`;
  }).join('')).join('');}
  function tick(){if(!host||!session)return;const node=host.querySelector('[data-mines-timer]'),value=digits(elapsed());if(node&&node.textContent!==value){node.textContent=value;node.setAttribute('aria-label',`已用 ${int(elapsed())} 秒`);}}
  function update(a,config){if(config)options=config;if(!host||!a)return;session=a;const s=a.state;
    const nextKey=JSON.stringify([a.id,s.cells]);
    if(nextKey!==boardKey){const focused=root.document.activeElement?.dataset?.minesCell,grid=host.querySelector('[data-mines-board]');grid.innerHTML=board(s);boardKey=nextKey;if(focused)grid.querySelector(`[data-mines-cell="${focused}"]`)?.focus({preventScroll:true});}
    host.querySelector('[data-mines-counter]').textContent=digits(s.remainingMines);
    host.querySelector('[data-mines-counter]').setAttribute('aria-label',`剩余雷数估计 ${s.remainingMines}，雷数减去旗帜数`);
    const question=host.querySelector('[data-mines-questions]');question.setAttribute('aria-pressed',String(s.questions!==false));question.textContent=`问号标记 ${s.questions!==false?'开':'关'}`;
    const best=host.querySelector('[data-mines-best]');if(best)best.textContent=options.bestSeconds==null?'等待首次胜利':timeLabel(options.bestSeconds);
    const status=host.querySelector('[data-mines-status]');const message=a.status==='abandoned'?'本局已结束。':s.phase==='won'?'胜利！所有安全格都已翻开。':s.phase==='lost'?'踩到地雷了。再看一眼棋盘，下次再战。':s.phase==='ready'?'从任意一格开始。首次翻开一定安全。':'数字代表周围八格的地雷数量。';if(status.textContent!==message)status.textContent=message;
    host.querySelector('[data-mines-progress]').textContent=`${int(s.opened)} / ${int(s.safeCells)} 个安全格`;
    host.classList.toggle('mines-busy',!!options.blocked?.());updateFace(!!gesture);tick();
  }
  function targetCell(e){const cell=e.target.closest?.('[data-mines-cell]');return cell&&host?.contains(cell)?cell:null;}
  function coords(cell){return cell.dataset.minesCell.split(',').map(Number);}
  function stateAt(cell){const [x,y]=coords(cell);return session?.state?.cells?.[y]?.[x];}
  function send(action,cell){if(!active()||!cell)return;const [x,y]=coords(cell);focusCell=`${x},${y}`;options.send?.({action,x,y});}
  function clearPressed(){for(const el of host?.querySelectorAll('.mines-pressed')||[])el.classList.remove('mines-pressed');updateFace(false);}
  function press(cell,chord=false){clearPressed();if(!cell)return;const [x,y]=coords(cell);if(chord){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const c=session.state.cells[y+dy]?.[x+dx];if((dx||dy)&&c&&['covered','question'].includes(c.state))host.querySelector(`[data-mines-cell="${x+dx},${y+dy}"]`)?.classList.add('mines-pressed');}}else if(['covered','question'].includes(stateAt(cell)?.state))cell.classList.add('mines-pressed');updateFace(true);}
  function down(e){const cell=targetCell(e);if(!cell||!active()||e.button>2)return;e.preventDefault();cell.focus({preventScroll:true});focusCell=cell.dataset.minesCell;
    const buttons=e.buttons||(e.button===0?1:e.button===2?2:4);
    if(!gesture||gesture.cell!==cell.dataset.minesCell)gesture={cell:cell.dataset.minesCell,chord:false,handled:false};
    gesture.chord=gesture.chord||(buttons&3)===3||e.button===1;press(cell,gesture.chord);
  }
  function up(e){const cell=targetCell(e);if(!gesture)return;const g=gesture;clearPressed();if(cell&&g.cell===cell.dataset.minesCell&&!g.handled&&active()){
      g.handled=true;if(g.chord){if(stateAt(cell)?.state==='open')send('chord',cell);}else if(e.button===2)send('mark',cell);else if(e.button===0&&['covered','question'].includes(stateAt(cell)?.state))send('reveal',cell);
    }if(!e.buttons)gesture=null;
  }
  function move(e){if(!gesture||gesture.chord||gesture.handled||e.buttons!==1)return;const cell=targetCell(e);if(cell){gesture.cell=cell.dataset.minesCell;press(cell);}else clearPressed();}
  function key(e){if(e.key==='F2'&&!e.repeat&&!options.blocked?.()){e.preventDefault();options.restart?.();return;}const cell=targetCell(e);if(!cell||!active()||e.altKey||e.ctrlKey||e.metaKey)return;const [x,y]=coords(cell),dirs={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]};
    if(dirs[e.key]){e.preventDefault();const [dx,dy]=dirs[e.key],nx=Math.max(0,Math.min(session.state.width-1,x+dx)),ny=Math.max(0,Math.min(session.state.height-1,y+dy));focusCell=`${nx},${ny}`;cell.tabIndex=-1;const next=host.querySelector(`[data-mines-cell="${focusCell}"]`);if(next){next.tabIndex=0;next.focus({preventScroll:true});}return;}
    if(e.repeat)return;const action=({' ':'reveal',Enter:'reveal',f:'mark',F:'mark',c:'chord',C:'chord'})[e.key];if(action){e.preventDefault();send(action,cell);}
  }
  function click(e){const reset=e.target.closest?.('[data-mines-reset]');if(reset&&host.contains(reset)){options.restart?.();return;}const questions=e.target.closest?.('[data-mines-questions]');if(questions&&active()){options.send?.({action:'questions',enabled:session.state.questions===false});return;}const cell=targetCell(e);if(cell&&e.detail===0)send('reveal',cell);}
  function bind(node,event,fn){node.addEventListener(event,fn);bindings.push([node,event,fn]);}
  function suspend(){gesture=null;clearPressed();}
  function destroy(){for(const [node,event,fn] of bindings)node.removeEventListener?.(event,fn);bindings=[];suspend();host=null;session=null;boardKey='';focusCell='0,0';}
  function mount(next,a,config={}){if(!next)return;if(host!==next||session?.id!==a.id){destroy();host=next;session=a;options=config;const s=a.state;
      host.innerHTML=`<div class="mines-layout ${s.width>=30?'expert':''}"><div class="mines-table-wrap"><div class="mines-classic" style="--mine-cols:${int(s.width)};--mine-rows:${int(s.height)}"><div class="mines-titlebar"><span>▦ 扫雷</span><span>${esc(config.name||'经典模式')}</span></div><div class="mines-toolbar"><span>${s.width} × ${s.height} · ${s.mines} 雷</span><button type="button" data-mines-questions aria-pressed="true">问号标记 开</button></div><div class="mines-inset mines-meter"><output class="mines-led" data-mines-counter>000</output><button type="button" class="mines-smiley" data-mines-reset title="重新开始，需要 1 张游玩券" aria-label="重新开始，需要 1 张游玩券"></button><output class="mines-led" data-mines-timer>000</output></div><div class="mines-inset mines-grid" data-mines-board role="group" aria-label="扫雷棋盘，方向键移动，空格或回车翻开，F 标记，C 双键展开"></div></div><p class="mines-status" data-mines-status role="status" aria-live="polite"></p></div><aside class="mines-guide"><span class="arcade-eyebrow">CLASSIC MINESWEEPER</span><h4>每一步，都有线索。</h4><p class="mines-best">个人最佳 <strong data-mines-best>${config.bestSeconds==null?'等待首次胜利':timeLabel(config.bestSeconds)}</strong></p><dl><div><dt>左键</dt><dd>翻开格子</dd></div><div><dt>右键</dt><dd>旗帜 → 问号 → 取消</dd></div><div><dt>左右键同时按下</dt><dd>在数字格上展开周围格子</dd></div><div><dt>双击 / 中键</dt><dd>同样可以展开数字周围</dd></div></dl><p>周围旗帜数等于数字时才能展开。旗帜插错，也会触雷。</p><p>方向键移动 · 空格 / 回车翻开<br>F 标记 · C 展开 · F2 新局</p><div class="mines-safety"><strong data-mines-progress></strong><span>没有单局时间上限。首次翻开开始计时，离开界面仍计时；重新开始另用 1 张券。</span></div></aside></div>`;
      bind(host,'mousedown',down);bind(host,'mouseup',up);bind(host,'mousemove',move);bind(host,'mouseleave',clearPressed);bind(host,'click',click);bind(host,'keydown',key);bind(host,'contextmenu',e=>{if(targetCell(e))e.preventDefault();});bind(host,'dblclick',e=>{const cell=targetCell(e);if(cell){e.preventDefault();if(stateAt(cell)?.state==='open')send('chord',cell);}});bind(host,'auxclick',e=>{if(targetCell(e))e.preventDefault();});
      bind(root.document,'mouseup',e=>{if(!host?.contains(e.target))suspend();});bind(root.document,'visibilitychange',suspend);bind(root.document,'focusquest:visibility',suspend);
    }update(a,config);
  }
  function scene(compact=false){const cells=Array.from({length:48},(_,i)=>{const x=i%8,y=Math.floor(i/8),opened=x<4&&y>0;return `<rect x="${x*27+3}" y="${y*27+3}" width="26" height="26" fill="${opened?'#bdbdbd':'#cacaca'}" stroke="${opened?'#8d8d8d':'#f8f8f8'}"/><path d="M${x*27+4} ${y*27+28}h24v-24" stroke="${opened?'#bdbdbd':'#777'}" fill="none"/>${opened&&x===3?`<text x="${x*27+16}" y="${y*27+23}" text-anchor="middle" font-family="monospace" font-size="20" font-weight="bold" fill="${y%2?'#008000':'#0000ff'}">${y%2?2:1}</text>`:''}`;}).join('');return `<svg class="arcade-scene mines-scene ${compact?'compact':''}" viewBox="0 0 420 275" aria-hidden="true"><ellipse cx="210" cy="245" rx="150" ry="16" fill="#080d2033"/><g transform="translate(94 27) rotate(-5 112 100)"><path d="M-8-8h234v222H-8Z" fill="#c0c0c0" stroke="#f1f1f1" stroke-width="3"/><rect width="216" height="32" fill="#001b84"/><text x="10" y="22" fill="white" font-family="sans-serif" font-size="15">扫雷</text><g transform="translate(0 39)">${cells}</g><g transform="translate(132 122) scale(1.08)">${flag}</g></g></svg>`;}
  function rules(){return `<div class="arcade-how-grid"><p><b>01 · 经典三档</b>初级 9 × 9、10 雷；中级 16 × 16、40 雷；高级 30 × 16、99 雷。首次翻开安全，空白区域自动展开。随机雷局也可能需要判断风险。</p><p><b>02 · 标记与展开</b>右键依次切换旗帜、问号、取消，问号可关闭。数字周围旗数相等时，双键、双击或中键展开其余格子；错旗会触雷。</p><p><b>03 · 翻开所有安全格</b>不需要把每颗雷都标出来。计时从首次翻开开始，胜负后停止，显示最大 999 秒；真实用时保存为个人最佳。不设 4 分钟强制结束。</p></div>`;}
  function postcard(a){const s=a.state;if(!s?.cells)return '';const parts=s.cells.map((r,y)=>r.map((c,x)=>`<rect x="${x*10}" y="${y*10}" width="9" height="9" fill="${c.exploded?'#ed5350':c.wrongFlag?'#ff7c6b':c.state==='flag'?'#cf655e':c.mine?'#333':c.state==='open'?'#c0c0c0':'#818793'}"/>${c.state==='open'&&c.number?`<text x="${x*10+4.5}" y="${y*10+7}" text-anchor="middle" font-size="7" font-family="monospace" fill="${['','#0000ff','#008000','#ff0000','#000080','#800000','#008080','#000','#808080'][c.number]}">${c.number}</text>`:''}`).join('')).join('');return `<figure class="arcade-postcard mines-postcard"><svg viewBox="0 0 ${s.width*10} ${s.height*10}" role="img" aria-label="扫雷终局棋盘">${parts}</svg><figcaption><b>这一局的雷区</b><span>${timeLabel(s.elapsedSeconds)} · ${a.status==='won'?'全部安全格已翻开':'终局留影'}</span></figcaption></figure>`;}
  root.FocusMinesweeper={mount,update,tick,suspend,destroy,scene,rules,postcard,elapsed,timeLabel,digits};
})(typeof globalThis!=='undefined'?globalThis:this);
