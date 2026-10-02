const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../static/interface-switch.js'),'utf8');
function harness(fetch){
 const buttons=['classic','modern','modern'].map(mode=>({dataset:{interfaceMode:mode},disabled:false,addEventListener(type,cb){this.click=cb;}}));
 const statuses=[{},{}].map(()=>({textContent:'',hidden:true,attributes:{},setAttribute(k,v){this.attributes[k]=v;}}));
 const requests=[],navigation=[];
 const context=vm.createContext({document:{querySelectorAll(selector){return selector==='button[data-interface-mode]'?buttons:statuses;}},
  fetch:async(...args)=>{requests.push(args);return fetch(...args);},location:{replace:url=>navigation.push(url)}});
 vm.runInContext(source,context);
 return {api:context.FocusInterface,buttons,statuses,requests,navigation};
}
const response=(mode,{ok=true,url='/'}={})=>({ok,json:async()=>({mode,url,error:'测试错误'})});
test('either version switches with one schema-limited request then full navigation',async()=>{
 for(const mode of ['classic','modern']){
  const h=harness(()=>response(mode));
  assert.equal(await h.api.switchTo(mode),true);
  assert.equal(h.requests.length,1);assert.equal(h.requests[0][0],'/api/interface');
  assert.deepEqual(JSON.parse(h.requests[0][1].body),{mode});
  assert.equal(h.requests[0][1].method,'POST');assert.equal(h.requests[0][1].cache,'no-store');
  assert.deepEqual(h.navigation,['/']);assert(h.buttons.every(b=>b.disabled));
 }
});
test('rapid repeat clicks and both return entries share one in-flight request',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>{resolve=r;}));
 const first=h.api.switchTo('modern');
 h.buttons[1].click();h.buttons[2].click();
 assert.equal(await h.api.switchTo('classic'),false);assert.equal(h.requests.length,1);
 resolve(response('modern'));assert.equal(await first,true);assert.deepEqual(h.navigation,['/']);
});
test('server errors keep the current page and make both buttons usable again',async()=>{
 const h=harness(()=>response('classic',{ok:false}));
 assert.equal(await h.api.switchTo('classic'),false);assert.deepEqual(h.navigation,[]);
 assert(h.buttons.every(b=>!b.disabled));assert.equal(h.api.isBusy(),false);
 assert(h.statuses.every(s=>!s.hidden&&s.attributes.role==='alert'&&s.textContent==='测试错误'));
});
test('network failure can be retried without losing the return controls',async()=>{
 let attempt=0;const h=harness(()=>{if(!attempt++)throw new Error('连接中断');return response('modern');});
 assert.equal(await h.api.switchTo('modern'),false);assert.equal(h.statuses[0].textContent,'连接中断');
 assert.equal(await h.api.switchTo('modern'),true);assert.equal(h.requests.length,2);assert.deepEqual(h.navigation,['/']);
});
test('unexpected modes and destination URLs never navigate',async()=>{
 for(const value of [null,{},'v1.0','http://example.com']){
  const h=harness(()=>response('classic'));assert.equal(await h.api.switchTo(value),false);assert.equal(h.requests.length,0);
 }
 for(const result of [response('modern'),response('classic',{url:'https://example.com'}),response('classic',{url:'/index.html'})]){
  const h=harness(()=>result);assert.equal(await h.api.switchTo('classic'),false);assert.deepEqual(h.navigation,[]);
  assert(h.buttons.every(b=>!b.disabled));
 }
});
test('classic entry has an always-available return and a settings return',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../static/classic/index.html'),'utf8');
 assert.equal((html.match(/data-interface-mode="modern"/g)||[]).length,2);
 assert.match(html,/class="classic-return"[^>]*data-interface-mode="modern"/);
 assert.match(html,/data-interface-mode="classic"/);
 assert.match(html,/href="\/classic\/style.css"/);
 assert.match(html,/src="\/classic\/app.js"/);
 for(const resource of ['runtime.js','goals.js','interface-switch.js'])assert(html.includes('src="/'+resource+'"'));
});
test('only switch buttons listen for clicks, never the body mode marker',()=>{
 assert.match(source,/querySelectorAll\('button\[data-interface-mode\]'\)/);
 assert.doesNotMatch(source,/querySelectorAll\('\[data-interface-mode\]'\)/);
});
test('classic polling uses the existing bounded visible runtime and current goal controls',()=>{
 const script=fs.readFileSync(path.join(__dirname,'../static/classic/app.js'),'utf8');
 assert.match(script,/FocusRuntime\?\.start/);assert.doesNotMatch(script,/setInterval\(/);
 assert.match(script,/FocusRuntime\?\.isVisible\(\)===false/);
 assert.match(script,/seenRecords\.size>500/);assert.match(script,/FocusGoals\?\.render/);
 assert.match(script,/type="number" disabled/);
 assert.doesNotMatch(script,/api\('\/api\/settings',\{targets/);
 assert.match(script,/audioContext\?\.suspend/);
});
