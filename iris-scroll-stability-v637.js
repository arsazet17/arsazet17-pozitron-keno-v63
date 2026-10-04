'use strict';
(()=>{
 const host=document.getElementById('irisRoot');if(!host)return;
 // v6.3.11: do not fight the user's scroll. The previous MutationObserver
 // restored an old window.scrollY after every IRIS DOM rebuild and caused
 // visible repeated jumps upward during automatic refreshes.
 let userScrolling=false,timer=0;
 const markUser=()=>{userScrolling=true;clearTimeout(timer);timer=setTimeout(()=>{userScrolling=false},700)};
 window.addEventListener('touchstart',markUser,{passive:true});
 window.addEventListener('touchmove',markUser,{passive:true});
 window.addEventListener('wheel',markUser,{passive:true});
 window.addEventListener('scroll',markUser,{passive:true});
 // Intentionally no MutationObserver and no automatic window.scrollTo().
 // Scroll position is owned by the browser/user; archive overlay keeps its
 // own scrollTop separately in iris-archive-beauty.js.
})();
