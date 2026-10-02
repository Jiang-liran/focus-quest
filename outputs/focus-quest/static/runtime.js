(function(root){
  'use strict';
  let callbacks=null,nativeVisible=root.__focusQuestVisible!==false,visible=null;
  let poll=null,clock=null,generation=0;
  const isVisible=()=>nativeVisible&&!root.document.hidden;
  function clear(){
    generation++;
    if(poll!==null)root.clearInterval(poll);
    if(clock!==null)root.clearInterval(clock);
    poll=clock=null;
  }
  function update(){
    const next=isVisible();
    root.document.documentElement.classList.toggle('focus-runtime-hidden',!next);
    if(!callbacks||next===visible)return;
    visible=next;clear();
    if(!next){callbacks.onSuspend?.();return;}
    callbacks.tickClock();callbacks.onWake?.();callbacks.refresh();
    const token=generation;
    clock=root.setInterval(()=>{if(token===generation&&isVisible())callbacks.tickClock();},1000);
    poll=root.setInterval(()=>{if(token===generation&&isVisible())callbacks.refresh();},3000);
  }
  root.document.addEventListener('visibilitychange',update);
  root.document.addEventListener('focusquest:visibility',event=>{
    if(typeof event.detail?.visible!=='boolean')return;
    nativeVisible=event.detail.visible;update();
  });
  root.FocusRuntime={isVisible,start(options){if(callbacks)return;callbacks=options;update();}};
})(typeof globalThis!=='undefined'?globalThis:this);
