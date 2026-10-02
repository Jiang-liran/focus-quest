const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const clone=value=>JSON.parse(JSON.stringify(value));
const decode=value=>String(value||'').replace(/&(amp|lt|gt|quot|#39);/g,(_,key)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[key]));
const dataKey=key=>key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
const empty=()=>({revision:1,notes:[],outfits:[],limits:{outfits:8}});
const snapshot=()=>({date:'2026-09-27',today:'2026-09-27',quests:{equipped:{theme:'theme-default',avatar:'avatar-default'},catalog:[{id:'theme-default',name:'初始夜色'},{id:'avatar-default',name:'旅人'},{id:'theme-forest',name:'森林夜色'}]}});
const note=(patch={})=>({id:'note-1',type:'note',text:'一张原来的便笺',day:'2026-09-28',createdAt:'2026-09-27T21:00:00+08:00',archived:false,done:false,...patch});
function harness(){
  const calls={requests:[],toasts:[],refresh:0,accept:[],sounds:[]},timers=new Map(),listeners=new Map();
  let clock=Date.parse('2026-09-27T21:00:00+08:00'),serial=0,uuid=0,nativeVisible=true;
  const document={hidden:false,activeElement:null,addEventListener(name,fn){const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);}};
  class Element{
    constructor(tag='div',attrs={}){this.tagName=tag.toLowerCase();this.attrs={...attrs};this.dataset={};this.children=[];this.parentElement=null;this.events=new Map();this.writes=0;this._html='';this.textContent='';this.value=attrs.value||'';this.hidden='hidden'in attrs;this.disabled='disabled'in attrs;for(const [key,value]of Object.entries(attrs))if(key.startsWith('data-'))this.dataset[dataKey(key)]=value;}
    get innerHTML(){return this._html;}
    set innerHTML(html){if(this.contains(document.activeElement))document.activeElement=null;this.children.forEach(c=>c.parentElement=null);this.children=[];this._html=String(html);this.writes++;const stack=[this];
      for(const token of this._html.matchAll(/<\/?[a-zA-Z][^>]*>/g)){const text=token[0],tag=text.match(/^<\/?([\w-]+)/)[1].toLowerCase();if(text.startsWith('</')){const i=stack.map(n=>n.tagName).lastIndexOf(tag);if(i>0)stack.length=i;continue;}const attrs={};for(const attr of text.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)'|\s*=\s*([^\s>]+))?/g))attrs[attr[1]]=decode(attr[2]??attr[3]??attr[4]??'');const node=new Element(tag,attrs);node.parentElement=stack.at(-1);node.parentElement.children.push(node);if(tag==='textarea')node.value=decode(this._html.slice(token.index+text.length).split('</textarea>')[0]);if(!text.endsWith('/>')&&!['input','br','hr','img'].includes(tag))stack.push(node);}
      for(const select of this.querySelectorAll('select')){const option=select.children.find(c=>'selected'in c.attrs)||select.children[0];select.value=option?.attrs.value||'';}
    }
    matches(selector){if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim()));const tag=selector.match(/^[\w-]+/);if(tag&&tag[0]!==this.tagName)return false;for(const cls of selector.matchAll(/\.([\w-]+)/g))if(!(this.attrs.class||'').split(/\s+/).includes(cls[1]))return false;for(const attr of selector.matchAll(/\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]/g)){const value=this.attrs[attr[1]];if(value===undefined||(attr[2]!==undefined&&value!==attr[2]))return false;}return true;}
    querySelectorAll(selector){return this.children.flatMap(node=>[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    focus(){if(!this.disabled)document.activeElement=this;}
    addEventListener(name,fn){const list=this.events.get(name)||[];list.push(fn);this.events.set(name,list);}
    removeEventListener(name,fn){this.events.set(name,(this.events.get(name)||[]).filter(item=>item!==fn));}
    setAttribute(name,value){this.attrs[name]=String(value);if(name.startsWith('data-'))this.dataset[dataKey(name)]=String(value);}
    getAttribute(name){return this.attrs[name]??null;}
  }
  class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
  const context=vm.createContext({document,Date:Clock,crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`},FocusRuntime:{isVisible:()=>nativeVisible},setTimeout(fn,delay){const id=++serial;timers.set(id,{fn,due:clock+delay});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync(require.resolve('../static/city-life.js'),'utf8'),context);
  const api=context.FocusCityLife;api.init({api(path,body){return new Promise((resolve,reject)=>calls.requests.push({path,body:body&&clone(body),resolve,reject}));},toast:message=>calls.toasts.push(message),refresh:()=>{calls.refresh++;},acceptQuests:quests=>calls.accept.push(clone(quests)),playSound:cue=>calls.sounds.push(cue)});
  const container=new Element(),other=new Element();let state=snapshot();
  const emit=(node,type)=>{assert.ok(node,`missing target for ${type}`);if(node.disabled)return false;const event={target:node,preventDefault(){this.defaultPrevented=true;}};for(let current=node;current;current=current.parentElement)for(const fn of current.events.get(type)||[])fn(event);return true;};
  const field=name=>container.querySelector(`[data-life-field="${name}"]`);
  return {api,calls,timers,document,container,other,field,
    mount(room,host=container,next=state){state=next;api.mount(room,host,next);},
    click(action,id){const selector=`[data-life-action="${action}"]${id?`[data-life-id="${id}"]`:''}`;return emit(container.querySelector(selector),'click');},
    submit(kind='note'){return emit(container.querySelector(`[data-life-form="${kind}"]`),'submit');},
    filter(name){return emit(container.querySelector(`[data-life-filter="${name}"]`),'click');},
    emit,
    async resolve(data,index=calls.requests.length-1){calls.requests[index].resolve(clone(data));await flush();},
    async reject(message,index=calls.requests.length-1){calls.requests[index].reject(new Error(message));await flush();},
    advance(ms){const end=clock+ms;let guard=0;while(true){const due=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!due)break;assert.ok(++guard<10000);clock=due[1].due;timers.delete(due[0]);due[1].fn();}clock=end;},
    visibility(visible,native=false){if(native)nativeVisible=visible;else document.hidden=!visible;for(const fn of listeners.get(native?'focusquest:visibility':'visibilitychange')||[])fn(native?{detail:{visible}}:{});}
  };
}
async function ready(room='library',data=empty()){const h=harness();h.mount(room);if(room!=='tea')await h.resolve(data);return h;}

test('routine state polls and initial load preserve unfinished writing, selection and form identity',async()=>{
  const h=harness();h.mount('library');const textarea=h.field('text');textarea.value='这段文字还没写完';textarea.focus();
  await h.resolve(empty());const writes=h.container.writes;
  for(let i=0;i<20;i++){h.advance(3000);h.mount('library');}
  assert.equal(h.field('text'),textarea);assert.equal(textarea.value,'这段文字还没写完');assert.equal(h.document.activeElement,textarea);assert.equal(h.container.writes,writes);assert.equal(h.calls.requests.length,1);
  h.field('type').value='question';h.filter('archive');assert.equal(h.field('text').value,'这段文字还没写完');assert.equal(h.field('type').value,'question');
  h.api.unmount();h.mount('station');await h.resolve(empty());h.field('text').value='明天只做一件事';h.field('day').value='2026-10-02';h.api.unmount();h.mount('library');await h.resolve(empty());
  assert.equal(h.field('text').value,'这段文字还没写完');assert.equal(h.field('type').value,'question');
  h.api.unmount();h.mount('station');await h.resolve(empty());assert.equal(h.field('text').value,'明天只做一件事');assert.equal(h.field('day').value,'2026-10-02');
});

test('failed create keeps draft and request identity; double submit is ignored and retry is idempotent',async()=>{
  const h=await ready();h.field('text').value='网络出错也要留住';h.submit();const first=h.calls.requests.at(-1);h.submit();assert.equal(h.calls.requests.length,2);
  await h.reject('暂时连接失败');assert.equal(h.field('text').value,'网络出错也要留住');assert.match(h.container.querySelector('[data-life-status]').textContent,/连接失败/);
  h.submit();const second=h.calls.requests.at(-1);assert.equal(second.body.requestId,first.body.requestId);assert.equal(second.body.text,first.body.text);
  await h.resolve({cityLife:{...empty(),revision:2,notes:[note({text:first.body.text})]}});assert.equal(h.field('text').value,'');assert.match(h.container.querySelector('[data-life-list]').innerHTML,/网络出错也要留住/);
  h.field('text').value='下一张便笺';h.submit();assert.notEqual(h.calls.requests.at(-1).body.requestId,first.body.requestId);
});

test('a completed save cannot erase words entered after pressing save',async()=>{
  const h=await ready();h.field('text').value='提交的第一句';h.submit();const textarea=h.field('text');
  // Locking while pending and retaining a newer draft are both valid product behaviors.
  const locked=textarea.disabled;if(!locked)textarea.value='保存过程中写下的新一句';
  await h.resolve({cityLife:{...empty(),revision:2,notes:[note({text:'提交的第一句'})]}});
  assert.equal(h.field('text').value,locked?'':'保存过程中写下的新一句');assert.equal(h.field('text').disabled,false);
});

test('late response from another room never overwrites the new room draft or resets its UI',async()=>{
  const h=await ready();h.field('text').value='书屋里待保存的想法';h.submit();const pending=h.calls.requests.length-1;
  h.mount('station');h.field('text').value='车站的新行囊';const text=h.field('text'),writes=h.container.writes;
  await h.resolve({cityLife:{...empty(),revision:2,notes:[note({text:'书屋里待保存的想法'})]}},pending);
  assert.equal(h.field('text'),text);assert.equal(text.value,'车站的新行囊');assert.equal(h.container.writes,writes);assert.ok(h.calls.toasts.length);
});

test('archive and restore keep the same note and preserve an unrelated form draft',async()=>{
  const data={...empty(),notes:[note({type:'question',text:'先搁置的问题'})]};const h=await ready('library',data);h.field('text').value='旁边还没保存的一句';
  h.click('archive-note','note-1');assert.deepEqual({...h.calls.requests.at(-1).body,requestId:undefined},{noteId:'note-1',archived:true,requestId:undefined});
  await h.resolve({cityLife:{...data,revision:2,notes:[note({...data.notes[0],archived:true})]}});assert.equal(h.field('text').value,'旁边还没保存的一句');assert.doesNotMatch(h.container.querySelector('[data-life-list]').innerHTML,/先搁置的问题/);
  h.filter('archive');assert.match(h.container.querySelector('[data-life-list]').innerHTML,/先搁置的问题/);h.click('archive-note','note-1');assert.equal(h.calls.requests.at(-1).body.archived,false);
  await h.resolve({cityLife:{...data,revision:3}});h.filter('active');assert.match(h.container.querySelector('[data-life-list]').innerHTML,/先搁置的问题/);assert.equal(h.field('text').value,'旁边还没保存的一句');
});

test('question completion and editing use updates rather than duplicate creation and render safe text',async()=>{
  const data={...empty(),notes:[note({type:'question',text:'<img src=x onerror=alert(1)>'})]};const h=await ready('library',data);
  assert.match(h.container.querySelector('[data-life-list]').innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);h.click('toggle-done','note-1');assert.equal(h.calls.requests.at(-1).body.done,true);
  await h.resolve({cityLife:{...data,revision:2,notes:[note({...data.notes[0],done:true})]}});h.click('edit-note','note-1');assert.equal(h.field('text').value,data.notes[0].text);h.field('text').value='已经查到了答案';h.submit();
  assert.equal(h.calls.requests.at(-1).path,'/api/city-life/note-update');assert.equal(h.calls.requests.at(-1).body.noteId,'note-1');assert.equal(h.calls.requests.at(-1).body.type,'question');
});

test('outfit poll updates wearing state without remounting or changing the unsaved outfit name',async()=>{
  const outfit={id:'set-1',name:'森林归人',equipped:{theme:'theme-forest',avatar:'avatar-default'},archived:false},data={...empty(),outfits:[outfit]};const h=await ready('atelier',data);
  const input=h.field('name');input.value='还在起名字';input.focus();const next=snapshot();next.quests.equipped.theme='theme-forest';h.mount('atelier',h.container,next);
  assert.equal(h.field('name'),input);assert.equal(input.value,'还在起名字');assert.equal(h.document.activeElement,input);const button=h.container.querySelector('[data-life-action="apply-outfit"]');assert.equal(button.disabled,true);
  assert.equal(h.click('apply-outfit','set-1'),false);assert.equal(h.calls.requests.length,1);
});

test('equipping a saved outfit accepts the authoritative equipment once and never routes through the store',async()=>{
  const outfit={id:'set-1',name:'森林归人',equipped:{theme:'theme-forest',avatar:'avatar-default'},archived:false};const h=await ready('atelier',{...empty(),outfits:[outfit]});h.click('apply-outfit','set-1');const request=h.calls.requests.at(-1);assert.equal(request.path,'/api/city-life/outfit-apply');assert.equal(request.body.outfitId,'set-1');
  const quests=snapshot().quests;quests.equipped=outfit.equipped;await h.resolve({cityLife:{...empty(),revision:2,outfits:[outfit]},quests});assert.deepEqual(h.calls.accept,[quests]);assert.deepEqual(h.calls.sounds,['equip']);assert.equal(h.calls.refresh,1);assert.equal(h.container.querySelector('[data-life-action="apply-outfit"]').disabled,true);
});

test('outfit collection saves the exact current set and failed requests leave its name for retry',async()=>{
  const h=await ready('atelier');h.field('name').value='一盏灯的晚上';h.submit('outfit');const first=h.calls.requests.at(-1);assert.equal(first.path,'/api/city-life/outfit');assert.deepEqual(first.body.equipped,snapshot().quests.equipped);
  await h.reject('稍后再试');assert.equal(h.field('name').value,'一盏灯的晚上');h.submit('outfit');assert.equal(h.calls.requests.at(-1).body.requestId,first.body.requestId);
});

test('tea runs a single optional local timer, pauses when hidden, and releases it on leaving',async()=>{
  const h=await ready('tea');assert.equal(h.calls.requests.length,0);assert.equal(h.timers.size,0);h.field('rest').value='1';h.click('start-tea');assert.equal(h.timers.size,1);assert.equal(h.container.querySelector('[data-tea-clock]').textContent,'1:00');
  h.advance(9000);assert.equal(h.container.querySelector('[data-tea-clock]').textContent,'0:51');h.mount('tea');assert.equal(h.timers.size,1);
  h.visibility(false,true);assert.equal(h.timers.size,0);h.advance(6000);h.visibility(true,true);assert.equal(h.container.querySelector('[data-tea-clock]').textContent,'0:45');assert.equal(h.timers.size,1);
  h.visibility(false);assert.equal(h.timers.size,0);h.advance(45000);h.visibility(true);assert.equal(h.timers.size,0);assert.equal(h.container.querySelector('[data-tea-clock]').textContent,'茶已经慢慢喝完了。');
  h.click('start-tea');assert.equal(h.timers.size,1);h.api.unmount();assert.equal(h.timers.size,0);h.advance(120000);h.mount('tea');assert.equal(h.timers.size,0);assert.equal(h.container.querySelector('[data-tea-clock]').textContent,'一杯茶的空闲');assert.equal(h.calls.requests.length,0);assert.deepEqual(h.calls.sounds,[]);
});

test('late stale load cannot roll back a newer successful mutation',async()=>{
  const h=await ready();h.mount('station');const loading=h.calls.requests.length-1;h.field('text').value='带走这一条';h.submit();const pending=h.calls.requests.length-1;
  await h.resolve({cityLife:{...empty(),revision:4,notes:[note({type:'plan',text:'带走这一条'})]}},pending);await h.resolve({...empty(),revision:2},loading);
  assert.match(h.container.querySelector('[data-life-list]').innerHTML,/带走这一条/);
});

test('load failure is visible and can be retried without discarding the draft',async()=>{
  const h=harness();h.mount('library');h.field('text').value='暂时离线的一句话';await h.reject('暂时无法读取');assert.match(h.container.querySelector('[data-life-status]').textContent,/无法读取/);h.click('reload');await h.resolve(empty());assert.equal(h.field('text').value,'暂时离线的一句话');assert.equal(h.container.querySelector('[data-life-status]').hidden,true);
});

test('station saves a dated plan separately from library notes without creating a learning task',async()=>{
  const h=await ready('station');h.field('text').value='先把桌面理好';h.field('day').value='2026-10-02';h.submit();const request=h.calls.requests.at(-1);
  assert.equal(request.path,'/api/city-life/note');assert.equal(request.body.type,'plan');assert.equal(request.body.day,'2026-10-02');assert.equal(request.body.text,'先把桌面理好');
  const plan=note({type:'plan',day:'2026-10-02',text:'先把桌面理好'});await h.resolve({cityLife:{...empty(),revision:2,notes:[plan,note({id:'note-2',text:'留在书屋里的话'})]}});
  assert.match(h.container.querySelector('[data-life-list]').innerHTML,/先把桌面理好/);assert.doesNotMatch(h.container.querySelector('[data-life-list]').innerHTML,/留在书屋里的话/);
  assert.deepEqual(h.calls.accept,[]);assert.deepEqual(h.calls.sounds,[]);assert.equal(h.calls.refresh,0);
});

test('an outfit can be put into the old box and restored without changing current equipment',async()=>{
  const outfit={id:'set-1',name:'春天再穿',equipped:{theme:'theme-forest',avatar:'avatar-default'},archived:false},data={...empty(),outfits:[outfit]};const h=await ready('atelier',data);h.field('name').value='新搭配的名字';
  h.click('archive-outfit','set-1');assert.equal(h.calls.requests.at(-1).path,'/api/city-life/outfit-archive');assert.equal(h.calls.requests.at(-1).body.archived,true);
  await h.resolve({cityLife:{...data,revision:2,outfits:[{...outfit,archived:true}]}});assert.equal(h.field('name').value,'新搭配的名字');h.filter('archive');assert.equal(h.container.querySelector('[data-life-action="apply-outfit"]'),null);h.click('archive-outfit','set-1');assert.equal(h.calls.requests.at(-1).body.archived,false);
  await h.resolve({cityLife:{...data,revision:3}});h.filter('active');assert.match(h.container.querySelector('[data-life-list]').innerHTML,/春天再穿/);assert.deepEqual(h.calls.accept,[]);assert.deepEqual(h.calls.sounds,[]);
});
