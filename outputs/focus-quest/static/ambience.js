(function(root){
  'use strict';
  // Original, locally synthesized pieces. One rendered buffer loops without a note scheduler.
  const TRACKS={
    camp:{name:'炉边小调',bpm:72,bars:16,key:'C major',timbre:'guitar'},
    home:{name:'窗边夜曲',bpm:64,bars:16,key:'D major',timbre:'felt'},
    rain:{name:'小雨白噪音',seconds:32},
  };
  const SAMPLE_RATE=22050,TAU=Math.PI*2;
  function compose(trackId,rate=SAMPLE_RATE){
    const track=TRACKS[trackId];if(!track)throw new Error('Unknown ambience track');
    rate=Math.max(8000,Math.min(48000,Math.round(rate)||SAMPLE_RATE));
    const duration=track.seconds||track.bars*4*60/track.bpm,length=Math.round(duration*rate);
    const left=new Float32Array(length),right=new Float32Array(length);
    let randomSeed=trackId==='camp'?71329:trackId==='home'?93179:42367;
    const random=()=>{randomSeed=(Math.imul(randomSeed,1664525)+1013904223)>>>0;return randomSeed/4294967296;};
    function note(midi,start,seconds,amplitude,kind='guitar',pan=0){
      const frequency=440*Math.pow(2,(midi-69)/12),offset=Math.round(start*rate),count=Math.ceil(seconds*rate);
      const step=TAU*frequency/rate,rotationCos=Math.cos(step),rotationSin=Math.sin(step);
      const attack=kind==='pad'?.65:kind==='felt'?.026:.014;
      let sin=0,cos=1;
      const l=Math.sqrt((1-pan)/2),r=Math.sqrt((1+pan)/2);
      for(let i=0;i<count;i++){
        const t=i/rate,remaining=(count-i)/rate;
        let envelope=Math.min(1,t/attack)*Math.min(1,remaining/(kind==='pad'?.9:.18));
        if(kind!=='pad')envelope*=Math.exp(-t/(kind==='felt'?1.1:1.5));
        const second=2*sin*cos,third=sin*(3-4*sin*sin);
        const wave=sin+(kind==='pad'?.055:kind==='felt'?.13:.27)*second+(kind==='pad'?.025:kind==='felt'?.06:.095)*third;
        const value=wave*envelope*amplitude,index=(offset+i)%length;
        left[index]+=value*l;right[index]+=value*r;
        const nextSin=sin*rotationCos+cos*rotationSin;cos=cos*rotationCos-sin*rotationSin;sin=nextSin;
      }
    }
    if(trackId==='rain'){
      // Independent soft, filtered rainfall in each channel, with no thunder or sharp transients.
      let a=0,b=0,slow=0;
      for(let i=0;i<length;i++){
        a=.88*a+.12*(random()*2-1);b=.91*b+.09*(random()*2-1);slow=.9995*slow+.0005*(random()*2-1);
        const breeze=.91+.06*Math.sin(TAU*i/length*3)+slow;
        left[i]=(a*.82+b*.18)*breeze*.7;right[i]=(b*.82+a*.18)*breeze*.7;
      }
      // A periodic raised-cosine seam blends the first and last 0.4 s into matching samples.
      const seam=Math.round(rate*.4);
      for(let i=0;i<seam;i++){
        const t=i/(seam-1),mix=.5-.5*Math.cos(Math.PI*t);
        for(const channel of [left,right]){
          const first=channel[i],last=channel[length-seam+i];
          channel[i]=first*mix+last*(1-mix);
        }
      }
      for(const channel of [left,right]){
        const end=channel[length-1],begin=channel[0],difference=begin-end;
        for(let i=0;i<Math.round(rate*.02);i++)channel[length-1-i]+=difference*(1-i/(rate*.02));
      }
    }else{
      const beat=60/track.bpm,bar=beat*4,isCamp=trackId==='camp';
      const chords=isCamp?[
        [48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,60],
        [48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,55,59],
        [50,57,60,65],[43,50,55,59],[48,55,59,64],[45,52,55,60],
        [41,48,52,57],[43,50,55,60],[48,55,59,64],[48,55,60,64],
      ]:[
        [50,57,61,66],[47,54,57,62],[43,50,54,59],[45,52,57,62],
        [50,57,61,66],[47,54,57,62],[43,50,54,59],[45,52,57,61],
        [43,50,54,59],[50,57,61,66],[47,54,57,62],[45,52,57,61],
        [43,50,54,59],[45,52,57,62],[50,57,61,66],[50,57,62,66],
      ];
      const melody=isCamp?[
        [[0,67,1.5],[2,64,1],[3,62,1]],[[0,60,2],[2.5,64,1.5]],
        [[0,65,1],[1.5,64,1],[3,60,1]],[[0,62,2],[2.5,67,1.5]],
        [[0,64,1.5],[2,67,1],[3,69,1]],[[0,72,2],[2.5,69,1.5]],
        [[0,67,1],[1.5,65,1],[3,64,1]],[[0,62,3]],
        [[0,65,1.5],[2,69,1],[3,67,1]],[[0,67,1],[1.5,62,2]],
        [[0,64,2],[2.5,67,1.5]],[[0,69,1.5],[2,64,1.5]],
        [[0,65,2],[2.5,64,1]],[[0,62,1.5],[2,59,1.5]],
        [[0,60,3]],[[1,64,1],[2.5,62,1]],
      ]:[
        [[.5,69,2],[3,66,1]],[[.5,62,2.5]],
        [[0,66,1.5],[2,67,1.5]],[[1,64,2.5]],
        [[.5,66,1.5],[2.5,69,1.5]],[[0,73,3]],
        [[.5,71,1.5],[2.5,67,1]],[[0,69,2.5]],
        [[0,67,2],[2.5,66,1.5]],[[.5,62,2.5]],
        [[0,66,1.5],[2,69,1.5]],[[.5,64,3]],
        [[0,66,1.5],[2,67,1]],[[0,64,2],[2.5,61,1.5]],
        [[.5,62,3]],[[1,66,2]],
      ];
      chords.forEach((chord,b)=>{
        const start=b*bar;
        note(chord[0]-12,start,bar*1.1,.048,'felt',-.08);
        chord.slice(1).forEach((pitch,j)=>note(pitch,start+.08,bar*1.25,.011,'pad',(j-1)*.36));
        const pattern=isCamp?[0,2,1,3,2,1]:[1,3,2,3];
        const positions=isCamp?[0,.75,1.5,2,2.75,3.5]:[0,1.5,2,3.5];
        pattern.forEach((idx,j)=>note(chord[idx]+(isCamp?12:0),start+positions[j]*beat,beat*2.6,isCamp?.032:.044,track.timbre,(j%2?1:-1)*.35));
        melody[b].forEach(([at,pitch,hold])=>note(pitch,start+at*beat,Math.max(beat*hold,beat*1.8),isCamp?.068:.073,track.timbre,.1));
      });
      // Two fixed echoes supply a small room, never accumulating feedback across loops.
      const dryL=left.slice(),dryR=right.slice(),early=Math.round(rate*.147),late=Math.round(rate*.293);
      for(let i=0;i<length;i++){
        left[i]+=dryR[(i-early+length)%length]*.16+dryL[(i-late+length)%length]*.09;
        right[i]+=dryL[(i-early+length)%length]*.16+dryR[(i-late+length)%length]*.09;
      }
    }
    // Fixed mastering keeps rain and both instruments at a similar perceived volume.
    const level=trackId==='camp'?2.25:trackId==='home'?2.65:.92;
    for(let i=0;i<length;i++){left[i]*=level;right[i]*=level;}
    // Fixed ceiling only; never amplify silence or quiet passages to full scale.
    let peak=0;for(let i=0;i<length;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
    if(peak>.6){const scale=.6/peak;for(let i=0;i<length;i++){left[i]*=scale;right[i]*=scale;}}
    return {channels:[left,right],sampleRate:rate,duration:length/rate,name:track.name};
  }
  root.FocusAmbienceComposer={compose,tracks:TRACKS,sampleRate:SAMPLE_RATE};

  const STORAGE='focus-quest-ambience-v1',SCENES=['camp','home'];
  let initialized=false,scene=null,context=null,active=null,retiring=null,stopTimer=null;
  let generation=0,playing=false,loading=false,message='',nativeVisible=root.__focusQuestVisible!==false;
  const prefs={camp:{mode:'camp',volume:.35},home:{mode:'home',volume:.35}},buffers=new Map();
  const clamp=(n,low,high)=>Math.min(high,Math.max(low,n));
  const visible=()=>!root.document?.hidden&&nativeVisible&&root.FocusRuntime?.isVisible?.()!==false;
  function readPreferences(){
    try{const saved=JSON.parse(root.localStorage?.getItem(STORAGE)||'null');if(!saved||typeof saved!=='object')return;
      for(const id of SCENES){if(Number.isFinite(saved[id]?.volume))prefs[id].volume=clamp(saved[id].volume,0,1);}
      if(['home','rain'].includes(saved.home?.mode))prefs.home.mode=saved.home.mode;
    }catch{/* Missing/private storage never prevents listening. */}
  }
  function savePreferences(){try{root.localStorage?.setItem(STORAGE,JSON.stringify(prefs));}catch{}}
  function dispose(pair){
    if(!pair)return;pair.source.onended=null;
    try{pair.source.stop();}catch{}
    try{pair.source.disconnect();pair.gain.disconnect();}catch{}
  }
  function stop(reason='',immediate=false){
    generation++;playing=false;loading=false;message=reason;
    if(stopTimer!==null){root.clearTimeout(stopTimer);stopTimer=null;}
    dispose(retiring);retiring=null;
    const pair=active;active=null;
    if(pair&&context&&context.state==='running'&&!immediate){
      const now=context.currentTime;pair.gain.gain.cancelScheduledValues(now);pair.gain.gain.setValueAtTime(pair.gain.gain.value,now);pair.gain.gain.linearRampToValueAtTime(0,now+.24);
      try{pair.source.stop(now+.26);}catch{}
      retiring=pair;
    }else dispose(pair);
    const token=generation;
    const finish=()=>{
      if(retiring===pair){dispose(retiring);retiring=null;}stopTimer=null;
      if(token===generation&&!active&&!loading&&context&&context.state==='running')Promise.resolve(context.suspend()).catch(()=>{});
    };
    if(retiring)stopTimer=root.setTimeout(finish,290);else finish();
    paint();return true;
  }
  async function start(){
    init();if(!scene||!visible()||loading||playing)return false;
    const requestedScene=scene,mode=prefs[scene].mode,token=++generation;
    loading=true;message='正在准备声景…';paint();
    try{
      const AudioContext=root.AudioContext||root.webkitAudioContext;if(!AudioContext)throw new Error('unavailable');
      if(!context)context=new AudioContext({latencyHint:'playback'});
      await context.resume();
      if(token!==generation||scene!==requestedScene||!visible()){
        if(!active&&!loading&&context.state==='running')await context.suspend();return false;
      }
      if(!buffers.has(mode)){
        const samples=compose(mode),buffer=context.createBuffer(2,samples.channels[0].length,samples.sampleRate);
        samples.channels.forEach((channel,index)=>buffer.getChannelData(index).set(channel));buffers.set(mode,buffer);
      }
      if(token!==generation||scene!==requestedScene||!visible())return false;
      const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffers.get(mode);source.loop=true;
      gain.gain.setValueAtTime(0,context.currentTime);gain.gain.linearRampToValueAtTime(prefs[scene].volume*.7,context.currentTime+.8);
      source.connect(gain);gain.connect(context.destination);source.start();active={source,gain};
      playing=true;loading=false;message='';paint();return true;
    }catch{
      if(token!==generation)return false;stop('此设备暂时无法播放声景，请再试一次。',true);return false;
    }
  }
  function setScene(value){
    init();const next=SCENES.includes(value)?value:null;if(scene===next)return;
    stop();scene=next;message='';paint();
  }
  function setMode(value){
    if(scene!=='home'||!['home','rain'].includes(value)||prefs.home.mode===value)return false;
    const resume=playing||loading;stop();prefs.home.mode=value;savePreferences();paint();if(resume)void start();return true;
  }
  function setVolume(value){
    if(!scene||!Number.isFinite(Number(value)))return;
    prefs[scene].volume=clamp(Number(value),0,1);savePreferences();
    if(active&&context){const now=context.currentTime;active.gain.gain.cancelScheduledValues(now);active.gain.gain.setTargetAtTime(prefs[scene].volume*.7,now,.08);}
    paint();
  }
  function getState(){return {scene,playing,loading,message,mode:scene?prefs[scene].mode:null,volume:scene?prefs[scene].volume:null};}
  function controls(id){
    if(!SCENES.includes(id))return '';
    const home=id==='home',name=home?'雨夜声景':'炉边小调',mode=prefs[id].mode;
    return `<div class="ambience-controls" data-ambience-scene="${id}" role="group" aria-label="${name}"><span class="ambience-mark" aria-hidden="true">♫</span>${home?`<label class="ambience-mode"><span class="ambience-sr-only">选择雨夜声景</span><select data-ambience-action="mode" aria-label="选择雨夜声景"><option value="home"${mode==='home'?' selected':''}>窗边夜曲 · BGM</option><option value="rain"${mode==='rain'?' selected':''}>小雨 · 白噪音</option></select></label>`:`<span class="ambience-title">${name}</span>`}<button type="button" data-ambience-action="toggle" aria-pressed="false">播放</button><label class="ambience-volume"><span class="ambience-sr-only">${name}音量</span><input type="range" min="0" max="100" step="1" value="${Math.round(prefs[id].volume*100)}" data-ambience-action="volume" aria-label="${name}音量" aria-valuetext="${Math.round(prefs[id].volume*100)}%"><span data-ambience-volume-label>${Math.round(prefs[id].volume*100)}%</span></label><span class="ambience-status" data-ambience-status role="status">手动播放 · 离开时停止</span></div>`;
  }
  function paint(){
    for(const host of root.document?.querySelectorAll?.('[data-ambience-scene]')||[]){
      const id=host.dataset.ambienceScene;if(!SCENES.includes(id))continue;const on=id===scene&&playing,busy=id===scene&&loading;
      host.classList.toggle('is-playing',on);host.classList.toggle('has-message',id===scene&&Boolean(message));
      const toggle=host.querySelector('[data-ambience-action="toggle"]');if(toggle){toggle.textContent=busy?'准备中…':on?'关闭':'播放';toggle.disabled=busy;toggle.setAttribute('aria-pressed',String(on));}
      const mode=host.querySelector('[data-ambience-action="mode"]');if(mode)mode.value=prefs[id].mode;
      const volume=host.querySelector('[data-ambience-action="volume"]');if(volume){volume.value=Math.round(prefs[id].volume*100);volume.setAttribute('aria-valuetext',`${volume.value}%`);}
      const label=host.querySelector('[data-ambience-volume-label]');if(label)label.textContent=`${Math.round(prefs[id].volume*100)}%`;
      const status=host.querySelector('[data-ambience-status]');if(status)status.textContent=id===scene&&message?message:on?`${TRACKS[prefs[id].mode].name} · 轻声陪伴`:'手动播放 · 离开时停止';
    }
  }
  function mount(container,id){init();if(!container||!SCENES.includes(id))return;if(container.querySelector?.('[data-ambience-scene]')?.dataset.ambienceScene!==id)container.innerHTML=controls(id);paint();}
  function validControl(event){
    const control=event.target?.closest?.('[data-ambience-action]'),host=control?.closest?.('[data-ambience-scene]');
    return host&&host.dataset.ambienceScene===scene&&visible()?control:null;
  }
  function init(){
    if(initialized)return;initialized=true;readPreferences();
    root.document?.addEventListener('click',event=>{const control=validControl(event);if(control?.dataset.ambienceAction==='toggle'){if(playing||loading)stop();else void start();}});
    root.document?.addEventListener('change',event=>{const control=validControl(event);if(control?.dataset.ambienceAction==='mode')setMode(control.value);});
    root.document?.addEventListener('input',event=>{const control=validControl(event);if(control?.dataset.ambienceAction==='volume')setVolume(Number(control.value)/100);});
    root.document?.addEventListener('visibilitychange',()=>{if(!visible())stop(playing||loading?'离开窗口后已暂停，点播放继续。':'',true);});
    root.document?.addEventListener('focusquest:visibility',event=>{if(typeof event.detail?.visible!=='boolean')return;nativeVisible=event.detail.visible;if(!visible())stop(playing||loading?'离开窗口后已暂停，点播放继续。':'',true);});
    root.addEventListener?.('pagehide',()=>stop('',true));
  }
  root.FocusAmbience={init,setScene,controls,mount,start,stop,setMode,setVolume,getState};
})(globalThis);
