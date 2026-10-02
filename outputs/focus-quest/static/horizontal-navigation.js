(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.FocusHorizontalNavigation=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  let bridge={},surface=null,pointer=null,wheel=null,lockedUntil=0,suppressClickUntil=0;
  const time=()=>root.performance?.now?.()??Date.now();
  const control='button,a,input,textarea,select,[contenteditable=""],[contenteditable="true"],[role="button"],[role="slider"],[data-island-gift],[data-expedition-subject]';
  const document=()=>root.document;
  function blocked(){
    const doc=document();
    return !surface||doc.hidden||doc.documentElement.classList.contains('focus-runtime-hidden')||
      doc.body.dataset.page!=='today'||doc.querySelector('dialog[open]')||
      (doc.getElementById('quick-skins')&&!doc.getElementById('quick-skins').hidden)||
      root.FocusCampfireRoom?.isOpen()||root.FocusCitadel?.isOpen()||root.FocusReturnTrail?.isOpen()||bridge.canNavigate?.()===false;
  }
  function reset(){pointer=null;wheel=null;}
  function observeWheel(event){
    if(Math.abs(event.deltaX)<=Math.abs(event.deltaY)*1.7||!event.deltaX)return;
    if(root.FocusCampfireRoom?.isOpen()||root.FocusCitadel?.isOpen()||root.FocusReturnTrail?.isOpen()){
      lockedUntil=Math.max(lockedUntil,time()+220);wheel=null;
    }
  }
  function open(direction){
    if(direction!=='left'||blocked()||time()<lockedUntil)return false;
    const target=root.FocusCampfireRoom;
    if(!target?.open)return false;
    bridge.beforeOpen?.();
    const anchor=document().getElementById('campfire-room-open');
    if(target.open(anchor)===false)return false;
    lockedUntil=time()+1000;
    reset();
    return true;
  }
  function onWheel(event){
    if(blocked()||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.defaultPrevented){wheel=null;return;}
    const stamp=time();
    // Inertial tails can outlive a quick return to the homepage. Require a new gesture.
    if(stamp<lockedUntil){lockedUntil=stamp+220;return;}
    const scale=event.deltaMode===1?16:event.deltaMode===2?surface.clientWidth:1;
    const x=Number(event.deltaX)*scale,y=Number(event.deltaY)*scale;
    if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)<=Math.abs(y)*1.7||Math.abs(x)<1){wheel=null;return;}
    if(x<0){wheel=null;return;}
    if(event.target.closest?.('input,textarea,select,[contenteditable="true"],[role="slider"],[data-horizontal-scroll],[data-island-gift]')){wheel=null;return;}
    event.preventDefault();
    const direction='left';
    if(!wheel||stamp-wheel.at>200||direction!==wheel.direction)wheel={direction,amount:0,at:stamp};
    wheel.amount+=Math.abs(x);wheel.at=stamp;
    if(wheel.amount>=105)open(direction);
  }
  function onDown(event){
    if(event.isPrimary===false){reset();return;}
    if(blocked()||time()<lockedUntil||event.isPrimary===false||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.target.closest?.(control))return;
    if(pointer){reset();return;}
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,at:time(),dragging:false};
  }
  function onMove(event){
    if(!pointer||pointer.id!==event.pointerId)return;
    if(event.pointerType==='mouse'&&event.buttons===0){reset();return;}
    if(blocked()){reset();return;}
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    if(!pointer.dragging&&Math.abs(dy)>16&&Math.abs(dy)>Math.abs(dx)*.75){reset();return;}
    if(!pointer.dragging&&dx>20){reset();return;}
    if(dx < -20&&Math.abs(dx)>Math.abs(dy)*1.7)pointer.dragging=true;
    if(pointer.dragging){event.preventDefault();suppressClickUntil=time()+450;}
  }
  function onUp(event){
    if(!pointer||pointer.id!==event.pointerId)return;
    const gesture=pointer;pointer=null;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
    if(time()-gesture.at>1400||dx > -95||Math.abs(dx)<=Math.abs(dy)*1.7)return;
    if(open('left')){event.preventDefault();suppressClickUntil=time()+450;}
  }
  function onClick(event){
    if(time()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}
  }
  function init(options={}){
    bridge={...bridge,...options};
    const next=document()?.getElementById('view-today');
    if(!next||surface)return;
    surface=next;
    // Vertical page scrolling and native pinch zoom remain available on touch screens.
    surface.style.touchAction='pan-y pinch-zoom';
    surface.addEventListener('wheel',onWheel,{passive:false});
    surface.addEventListener('pointerdown',onDown);
    surface.addEventListener('pointermove',onMove,{passive:false});
    surface.addEventListener('click',onClick,true);
    document().addEventListener('pointerup',onUp);
    document().addEventListener('wheel',observeWheel,{passive:true,capture:true});
    document().addEventListener('pointercancel',reset);
    document().addEventListener('visibilitychange',reset);
    root.addEventListener?.('blur',reset);
  }
  function destroy(){
    if(!surface)return;
    surface.removeEventListener('wheel',onWheel);
    surface.removeEventListener('pointerdown',onDown);
    surface.removeEventListener('pointermove',onMove);
    surface.removeEventListener('click',onClick,true);
    document().removeEventListener('pointerup',onUp);
    document().removeEventListener('wheel',observeWheel,true);
    document().removeEventListener('pointercancel',reset);
    document().removeEventListener('visibilitychange',reset);
    root.removeEventListener?.('blur',reset);
    surface.style.touchAction='';surface=null;reset();lockedUntil=0;suppressClickUntil=0;
  }
  return {init,destroy};
});
