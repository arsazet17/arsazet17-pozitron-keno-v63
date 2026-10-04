'use strict';
(()=>{
 const host=document.getElementById('irisRoot');if(!host)return;
 let y=window.scrollY,lastUserScroll=0,restoring=false;
 const remember=()=>{if(restoring)return;y=window.scrollY;lastUserScroll=performance.now();};
 window.addEventListener('scroll',remember,{passive:true});
 const observer=new MutationObserver(muts=>{
   const rebuilt=muts.some(m=>m.type==='childList'&&m.target===host);
   if(!rebuilt)return;
   const target=y;
   requestAnimationFrame(()=>requestAnimationFrame(()=>{
     if(performance.now()-lastUserScroll<120)return;
     if(Math.abs(window.scrollY-target)>2){restoring=true;window.scrollTo({top:target,left:0,behavior:'instant'});requestAnimationFrame(()=>{restoring=false;y=window.scrollY;});}
   }));
 });
 observer.observe(host,{childList:true});
})();
