const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto').webcrypto;
const source=fs.readFileSync(require.resolve('../static/arcade.js'),'utf8');
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const time=n=>`2026-09-25T20:00:00.${String(n).padStart(6,'0')}+08:00`;
const venues=[{id:'mist-camp',type:'trail',name:'晨雾营地',subtitle:'穿过树林，带着青晶回家。',description:'探灯有限，归航不远。',plays:0,wins:0,bestScore:0,bestMedal:0},{id:'mirror-gallery',type:'mirrors',name:'镜湖回廊',subtitle:'让光拐个弯。',description:'转动镜面，点亮星点。',plays:0,wins:0,bestScore:0,bestMedal:0},{id:'glow-shore',type:'garden',name:'萤石浅湾',subtitle:'放下一座花园。',description:'让邻居带来分数。',plays:0,wins:0,bestScore:0,bestMedal:0}];
function game(type='trail',patch={}){
 const states={trail:{width:4,height:3,cells:[['floor','gem','wall',null],['floor','floor','camp','exit'],['floor','hazard',null,null]],player:{x:0,y:1},exit:{x:3,y:1},health:4,gems:0,requiredGems:1,totalGems:1,scans:2,message:'沿着小径前进。'},mirrors:{width:3,height:3,mirrors:[{id:0,x:1,y:1,orientation:'/'},{id:1,x:1,y:0,orientation:'\\'}],walls:[],emitter:{x:-1,y:1,direction:'right'},receiver:{x:1,y:-1,lit:false},targets:[{x:0,y:1,lit:true},{x:1,y:0,lit:false}],beam:[{x:-1,y:1},{x:0,y:1},{x:1,y:1},{x:1,y:0}],message:'转动镜子，观察光路。'},garden:{width:3,height:3,cells:[['stone','flower',null],[null,'water',null],[null,null,null]],hand:['flower','water','stone'],score:0,targetScore:50,placements:0,maxPlacements:7,lastGain:0,message:'选择一个邻居。'}};
 return {id:'12345678-1234-4123-8123-123456789012',venue:venues.find(v=>v.type===type).id,type,seed:'seed',version:1,startedAt:time(0),expiresAt:'2026-09-25T20:04:00+08:00',status:'active',state:copy(states[type]),steps:0,maxSteps:30,result:null,...patch};
}
function snapshot(patch={}){return {now:time(100),today:'2026-09-25',rules:{ticketMinutes:30,maxTickets:8,roundSeconds:240,dailyCoins:60,dailyDiamonds:3,winCoins:12,winDiamonds:1,lossCoins:4},studyMinutes:120,earned:4,used:0,available:4,nextTicketMinutes:30,rewardToday:{coins:0,diamonds:0},active:null,lastResult:null,venues:copy(venues),history:[],...patch};}
const decode = value => String(value).replace(/&(amp|lt|gt|quot|#39);/g, (_, entity) => ({amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'"}[entity]));
const dataKey = key => key.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// A small DOM boundary that models replacement, focus, input values and open
// details. Real controller code runs unchanged; no layout engine is involved.
function harness(extras = {}) {
  const calls = {requests: [], toasts: [], sounds: [], refresh: [], pages: []};
  const timers=new Map(),documentListeners=new Map();let timerId=0,localTime=Date.parse('2026-09-25T20:00:00+08:00'),nativeVisible=true;
  class FakeDate extends Date {static now(){return localTime;}}
  const roots = new Map(), ids = new Map();
  let document;
  class Element {
    constructor(tag = 'div', attrs = {}) {
      this.tagName = tag.toUpperCase(); this.attributes = {...attrs}; this.children = []; this.parentElement = null;
      this.dataset = {}; this.listeners = new Map(); this.writes = 0; this._html = ''; this.textContent = '';
      this.style={}; this.className=attrs.class||''; this.value = ''; this.hidden = false; this.disabled = 'disabled' in attrs; this.checked = 'checked' in attrs;
      this.open = 'open' in attrs; this.id = attrs.id || ''; this.selectionStart = 0; this.selectionEnd = 0;
      this.classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
      this.classList = {contains: name => this.classes.has(name), add: name => this.classes.add(name), remove: name => this.classes.delete(name),
        toggle: (name, force) => { const enabled = force ?? !this.classes.has(name); if (enabled) this.classes.add(name); else this.classes.delete(name); return enabled; }};
      for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) this.dataset[dataKey(key)] = value;
      if (this.id) ids.set(this.id, this);
    }
    get innerHTML() {
      // Browsers normalize SVG self-closing tags and boolean attributes, and
      // serialize an interactively opened <details> with an open attribute.
      // Comparing this serialization to the original template is not a cache.
      let html = this._html.replace(/<(path|circle|use|ellipse)(\b[^>]*?)\/>/g, '<$1$2></$1>')
        .replace(/\s(disabled|checked)(?=[\s>])/g, ' $1=""');
      const details = this.querySelectorAll('details');
      html = html.replace(/<details\b[^>]*>/g, tag => {
        const id = tag.match(/data-action-entry="([^"]+)"/)?.[1];
        const node = details.find(entry => entry.dataset.actionEntry === decode(id || ''));
        return node?.open ? tag.slice(0, -1) + ' open="">' : tag;
      });
      return html;
    }
    set innerHTML(value) {
      if (this.contains(document?.activeElement)) document.activeElement = null;
      for (const child of this.querySelectorAll('[id]')) if (ids.get(child.id) === child) ids.delete(child.id);
      this._html = String(value); this.writes++; this.children = [];
      const stack = [this], tokens = [...this._html.matchAll(/<\/?[a-zA-Z][^>]*>/g)];
      for (const token of tokens) {
        const text = token[0], tag = text.match(/^<\/?([\w-]+)/)[1].toLowerCase();
        if (text.startsWith('</')) {
          const index = stack.map(node => node.tagName.toLowerCase()).lastIndexOf(tag);
          if (index > 0) stack.length = index;
          continue;
        }
        const attrs = {};
        for (const match of text.slice(tag.length + 1, -1).matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)'|\s*=\s*([^\s>]+))?/g)) {
          attrs[match[1]] = decode(match[2] ?? match[3] ?? match[4] ?? '');
        }
        const child = new Element(tag, attrs), parent = stack.at(-1);
        child.parentElement = parent; parent.children.push(child);
        if (tag === 'textarea') child.value = decode(this._html.slice(token.index + text.length).split('</textarea>')[0]);
        if (!text.endsWith('/>') && !['input', 'br', 'hr', 'img', 'use', 'path', 'circle'].includes(tag)) stack.push(child);
      }
    }
    matches(selector) {
      if(/,(?![^\[]*\])/.test(selector))return selector.split(/,(?![^\[]*\])/).some(part=>this.matches(part.trim()));
      const pieces=selector.trim().split(/\s+(?![^\[]*\])/);if(pieces.length>1){const last=pieces.pop();if(!this.matches(last))return false;let p=this.parentElement;while(p){if(p.matches(pieces.join(' ')))return true;p=p.parentElement;}return false;}
      if(selector.includes(':not(:disabled)')&&this.disabled)return false;selector=selector.replace(':not(:disabled)','');
      const tag = selector.match(/^[\w-]+/); if (tag && this.tagName.toLowerCase() !== tag[0]) return false;
      const id = selector.match(/#([\w-]+)/); if (id && this.id !== id[1]) return false;
      for(const cls of selector.matchAll(/\.([\w-]+)/g))if(!this.classes.has(cls[1]))return false;
      for (const match of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
        const value = match[1] === 'open' ? (this.open ? '' : undefined) : this.attributes[match[1]];
        if (value === undefined || (match[2] !== undefined && value !== match[2])) return false;
      }
      return true;
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    contains(other) { return other === this || this.children.some(child => child.contains(other)); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value); }
    hasAttribute(name) { return name in this.attributes; }
    removeAttribute(name) { delete this.attributes[name]; }
    removeEventListener(type,callback){this.listeners.set(type,(this.listeners.get(type)||[]).filter(fn=>fn!==callback));}
    addEventListener(type, callback) { const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list); }
    focus() { if(!this.disabled)document.activeElement = this; }
    scrollIntoView() {}
  }
  for(const id of ['arcade-root','arcade-pill-icon','arcade-pill-title','arcade-pill-status','arcade-pill-meta','arcade-open']){const node=new Element('div',{id});roots.set(id,node);}
  const element=id=>ids.get(id)||null;
  document={activeElement:null,hidden:false,getElementById:element,addEventListener:(name,fn)=>{const listeners=documentListeners.get(name)||[];listeners.push(fn);documentListeners.set(name,listeners);},removeEventListener:(name,fn)=>documentListeners.set(name,(documentListeners.get(name)||[]).filter(f=>f!==fn)),
    querySelectorAll: selector => [...roots.values()].flatMap(root=>[...(root.matches(selector)?[root]:[]),...root.querySelectorAll(selector)]),
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}};
  const bridge = {
    api(path, body) { return new Promise((resolve, reject) => calls.requests.push({path, body: copy(body), resolve, reject})); },
    toast(...args) { calls.toasts.push(args); }, playSound(cue, options) { calls.sounds.push({cue, ...copy(options)}); },
    async refresh(force) { calls.refresh.push(force); }, openPage(page) { calls.pages.push(page); }, isVisible(){return true;},
  };
  const context=vm.createContext({document,crypto,Date:FakeDate,FocusRuntime:{isVisible:()=>nativeVisible&&!document.hidden},setInterval:fn=>{timers.set(++timerId,fn);return timerId;},clearInterval:id=>timers.delete(id),...extras});
  if(extras.__mines)vm.runInContext(fs.readFileSync(require.resolve('../static/minesweeper.js'),'utf8'),context);
  vm.runInContext(source,context);const api=context.FocusArcade;api.init(bridge);
  const fire=(type,target,props={})=>{for(const callback of element('arcade-root').listeners.get(type)||[])callback({target,preventDefault(){},...props});};
  const click=(action)=>{const target=document.querySelector(`[data-arcade-action="${action}"]`);assert.ok(target,`missing ${action}`);target.focus();fire('click',target);};
  const select=(selector)=>{const target=document.querySelector(selector);assert.ok(target,`missing ${selector}`);target.focus();fire('click',target);return target;};
  const advance=ms=>{localTime+=ms;for(const fn of [...timers.values()])fn();};
  return {api,calls,bridge,element,document,fire,click,select,advance,timers,context,documentListeners,localNow:()=>localTime,nativeVisibility(value){nativeVisible=value;for(const fn of documentListeners.get('focusquest:visibility')||[])fn({detail:{visible:value}});},documentVisibility(value){document.hidden=!value;for(const fn of documentListeners.get('visibilitychange')||[])fn();}};
}


module.exports={harness,snapshot,game,venues,copy,flush,time};
