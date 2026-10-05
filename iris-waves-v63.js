'use strict';
(() => {
  const host=document.getElementById('irisRoot'),E=window.IRIS_V63;
  if(!host||!E)return;
  const STYLE_ID='iris-wave-style-v63';
  const HISTORY_URL='./keno-history-v63.json';
  let historyMap=new Map(),historyLoaded=false,working=false;

  function injectStyle(){
    if(document.getElementById(STYLE_ID))return;
    const s=document.createElement('style');s.id=STYLE_ID;s.textContent=`
      #irisRoot .iris-wave{margin:14px 0 8px;border:1px solid #1d5d88;border-radius:10px;background:linear-gradient(135deg,#071b2d,#0b1730);overflow:hidden;box-shadow:inset 0 0 22px #1fc7ff12}
      #irisRoot .iris-wave.latest{border-color:#22c7ff;box-shadow:0 0 14px #20c9ff22,inset 0 0 22px #1fc7ff18}
      #irisRoot .iris-wave-head{padding:10px 12px;border-bottom:1px solid #16466b;background:linear-gradient(90deg,#092844,#101738)}
      #irisRoot .iris-wave.latest .iris-wave-head{background:linear-gradient(90deg,#0b3857,#182051)}
      #irisRoot .iris-wave-kicker{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:9px;font-weight:900;letter-spacing:.45px;color:#8fb5d6}
      #irisRoot .iris-wave-kicker b{color:#62ddff;font-size:11px}
      #irisRoot .iris-wave-badge{display:inline-flex;align-items:center;padding:2px 7px;border-radius:11px;border:1px solid #2b6d94;background:#0b2943;color:#8bdcff;font-size:8px}
      #irisRoot .iris-wave.latest .iris-wave-badge{border-color:#2dd8ff;background:#0c3a52;color:#c2f5ff}
      #irisRoot .iris-wave-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-top:8px}
      #irisRoot .iris-wave-cell{min-width:0;border:1px solid #173f60;border-radius:7px;background:#061728;padding:7px 8px}
      #irisRoot .iris-wave-cell small{display:block;color:#6285a5;font-size:8px;font-weight:800;letter-spacing:.3px}
      #irisRoot .iris-wave-cell b{display:block;color:#e1f4ff;font-size:11px;margin-top:2px}
      #irisRoot .iris-wave-cell strong{display:block;color:#55dda9;font-size:10px;margin-top:2px}
      #irisRoot .iris-wave .iris-series{margin-left:8px;margin-right:8px}
      @media(max-width:560px){#irisRoot .iris-wave-grid{grid-template-columns:1fr 1fr}#irisRoot .iris-wave-cell b{font-size:10px}}
    `;document.head.appendChild(s);
  }
  function idInfo(card){
    const d=card.querySelector('details[data-iris-detail]');
    const id=d?.dataset?.irisDetail||'';
    const parts=id.split(':');
    const source=Number(parts[1]);
    const small=[...card.querySelectorAll('.iris-series-head small')].map(x=>x.textContent||'').join(' ');
    const m=small.match(/серия\s*№\s*(\d+)\s*[–-]\s*(\d+)/i);
    return {source:Number.isFinite(source)?source:null,start:m?Number(m[1]):null,stop:m?Number(m[2]):null};
  }
  async function loadHistory(){
    if(historyLoaded)return;
    historyLoaded=true;
    try{
      const r=await fetch(HISTORY_URL+'?waves='+Date.now(),{cache:'no-store'});if(!r.ok)return;
      const arr=await r.json();
      for(const d of E.normalize(arr))historyMap.set(d.draw,d);
    }catch{}
  }
  function meta(draw,source){
    if(historyMap.has(draw))return historyMap.get(draw);
    let cur=historyMap.get(source);
    if(!cur)return {draw,date:'—',time:'—'};
    let guard=0;
    while(cur.draw<draw&&guard++<20){cur=E.nextDraw(cur);if(!cur)break;}
    return cur&&cur.draw===draw?cur:{draw,date:'—',time:'—'};
  }
  function fmt(m){return m&&m.time?`${m.date||'—'} · ${m.time}`:'—';}
  function progress(cards){
    const vals=cards.map(c=>Number((c.querySelector('.iris-progress>b')?.textContent||'0').split('/')[0])||0);
    return vals.length?`${Math.min(...vals)}/5 → 5/5`:'0/5 → 5/5';
  }
  async function apply(){
    if(working)return;working=true;
    try{
      injectStyle();await loadHistory();
      const main=host.querySelector('.iris-main');if(!main)return;
      const title=main.querySelector('.iris-section-head');if(!title)return;
      const cards=[...main.children].filter(el=>el.classList?.contains('iris-series'));
      if(!cards.length)return;
      for(const old of [...main.querySelectorAll(':scope > .iris-wave')]){
        const moved=[...old.querySelectorAll(':scope > .iris-series')];
        for(const c of moved)main.insertBefore(c,old);
        old.remove();
      }
      const current=[...main.children].filter(el=>el.classList?.contains('iris-series'));
      const groups=new Map();
      for(const card of current){const info=idInfo(card);if(!info.source)continue;const key=String(info.source);if(!groups.has(key))groups.set(key,{source:info.source,start:info.start,stop:info.stop,cards:[]});groups.get(key).cards.push(card);}
      const ordered=[...groups.values()].sort((a,b)=>b.source-a.source);
      if(!ordered.length)return;
      let anchor=title;
      ordered.forEach((g,i)=>{
        const start=meta(g.start,g.source),stop=meta(g.stop,g.source),src=meta(g.source,g.source);
        const wrap=document.createElement('section');wrap.className='iris-wave'+(i===0?' latest':'');
        wrap.innerHTML=`<div class="iris-wave-head"><div class="iris-wave-kicker"><span class="iris-wave-badge">${i===0?'НОВЫЙ ЗАПУСК A':'РАНЕЕ ЗАПУЩЕНО'}</span><b>ЗАПУСК: тираж №${g.source}</b><span>время ${src.time||'—'} · ${src.date||'—'}</span></div><div class="iris-wave-grid"><div class="iris-wave-cell"><small>СТАРТ</small><b>тираж №${g.start??'—'}</b><strong>время ${start.time||'—'} · ${start.date||'—'}</strong></div><div class="iris-wave-cell"><small>СТОП</small><b>тираж №${g.stop??'—'}</b><strong>время ${stop.time||'—'} · ${stop.date||'—'}</strong></div><div class="iris-wave-cell"><small>ОТ — ДО</small><b>№${g.start??'—'} → №${g.stop??'—'}</b><strong>${start.time||'—'} → ${stop.time||'—'}</strong></div><div class="iris-wave-cell"><small>ОТСЧЁТ</small><b>${progress(g.cards)}</b><strong>ровно 5 тиражей</strong></div></div></div>`;
        anchor.after(wrap);anchor=wrap;
        g.cards.forEach(c=>wrap.appendChild(c));
      });
    }finally{working=false;}
  }
  let timer=0;
  // Watch only replacement of the IRIS root. Watching the whole subtree made
  // apply() observe its own card moves and rebuild itself again every ~80 ms.
  const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(apply,80);});
  observer.observe(host,{childList:true});
  window.addEventListener('online',()=>{historyLoaded=false;historyMap.clear();setTimeout(apply,100)});
  setTimeout(apply,200);
})();
