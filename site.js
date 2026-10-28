'use strict';let timer;document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{const code=button.dataset.copy;let message='Code: '+code;try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(code);}else{const el=document.createElement('textarea');el.value=code;el.style.position='fixed';el.style.opacity='0';document.body.append(el);el.select();const success=document.execCommand('copy');el.remove();button.focus();if(!success)throw Error('Copy unavailable');}message='Copied '+code;}catch{}const toast=document.querySelector('#toast');toast.textContent=message;toast.classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove('visible'),2200);}));

(() => {const media=matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');document.querySelectorAll('.offer').forEach(card=>{let frame=0;card.addEventListener('pointermove',event=>{if(!media.matches)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const rect=(card.closest(".floating-slot")||card).getBoundingClientRect();const x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));card.style.setProperty('--rx',((.5-y)*8).toFixed(2)+'deg');card.style.setProperty('--ry',((x-.5)*8).toFixed(2)+'deg');card.style.setProperty('--mx',(x*100)+'%');card.style.setProperty('--my',(y*100)+'%');});});card.addEventListener('pointerleave',()=>{cancelAnimationFrame(frame);card.style.removeProperty('--rx');card.style.removeProperty('--ry');card.style.removeProperty('--mx');card.style.removeProperty('--my');});});})();
// Hide navigation while reading; reveal it on upward scroll or keyboard focus.
(() => {
 const header=document.querySelector('body > header');
 if(!header)return;
 let lastY=Math.max(0,window.scrollY), travel=0, direction=0, queued=false;
 const reveal=()=>header.classList.remove('header-away');
 header.addEventListener('focusin',reveal);
 window.addEventListener('scroll',()=>{
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{
   queued=false;
   const y=Math.max(0,window.scrollY), delta=y-lastY;
   lastY=y;
   if(y<80){travel=0;direction=0;reveal();return;}
   if(Math.abs(delta)<1)return;
   const nextDirection=delta>0?1:-1;
   if(nextDirection!==direction){travel=0;direction=nextDirection;}
   travel+=Math.abs(delta);
   if(direction<0&&travel>12)reveal();
   if(direction>0&&travel>32&&y>header.offsetHeight+50&&!header.contains(document.activeElement))header.classList.add('header-away');
  });
 },{passive:true});
 window.addEventListener('pageshow',()=>{lastY=Math.max(0,window.scrollY);travel=0;reveal();});
})();