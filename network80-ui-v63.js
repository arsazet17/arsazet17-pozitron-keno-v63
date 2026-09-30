'use strict';
(() => {
  const ENGINE=window.POZITRON_V63_NETWORK80;
  const pad=n=>String(Number(n)).padStart(2,'0');
  const rub=n=>`${Number(n||0).toLocaleString('ru-RU')} ₽`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  let draws=[],mode='signal',live=null,state=null,archive=[],serverOnline=false,selectedPlayer=null,historyFilter='all';
  const $=id=>document.getElementById(id);
  async function loadDraws(){
    const r=await fetch(`./keno-history-v63.json?v=6700&t=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`KENO history HTTP ${r.status}`);
    const arr=await r.json();
    if(!Array.isArray(arr))throw new Error('KENO history format');
    return arr;
  }

  async function fetchServer(){
    try{
      const t=Date.now();
      const [sr,ar]=await Promise.all([
        fetch(`./network80-state-v63.json?v=6700&t=${t}`,{cache:'no-store'}),
        fetch(`./network80-archive-v63.json?v=6700&t=${t}`,{cache:'no-store'})
      ]);
      if(!sr.ok||!ar.ok)throw new Error(`HTTP ${sr.status}/${ar.status}`);
      state=await sr.json();archive=await ar.json();serverOnline=!!state?.network80;
      return true;
    }catch(e){console.warn('NETWORK80 SERVER',e);state=null;archive=[];serverOnline=false;return false;}
  }
  function pending(){return archive.find(p=>!p.actual)||null;}
  function clsLevel(level){return level==='СИЛЬНАЯ'?'strong':level==='СРЕДНЯЯ'?'medium':'watch';}
  function candidateHtml(c,settled=false){
    const hs=new Set((c.hits||[]).map(Number));
    return `<div class="n80-candidate ${clsLevel(c.level)}">
      <div class="n80-cand-head"><b>${esc(c.type)} · ${esc(c.id)}</b><span class="n80-level">${esc(c.level||'')}${c.movement?` · ${esc(c.movement)}`:''}</span></div>
      <div class="n80-numbers">${(c.numbers||[]).map(n=>`<span class="n80-num ${settled?(hs.has(Number(n))?'hit':'miss'):''}">${pad(n)}</span>`).join('')}</div>
      <div class="n80-meta"><span>рёбра ${c.strongEdges||0}/${c.totalEdges||0}</span><span>мосты ${c.bridges||0}</span><span>плотность ${Number(c.density||0).toFixed(2)}</span><span>сила ${Number(c.score||0).toFixed(2)}</span>${Number.isFinite(Number(c.triggerZ))?`<span>активация ${Number(c.triggerZ)>=0?'+':''}${Number(c.triggerZ).toFixed(2)}</span>`:''}${c.strengthenedEdges?`<span>усилилось рёбер +${c.strengthenedEdges}</span>`:''}${c.newEdges?`<span>новых рёбер +${c.newEdges}</span>`:''}${c.selectionMode==='BACKGROUND'?'<span>фон сети</span>':''}</div>
      ${settled?`<div style="margin-top:7px"><b>${c.hitCount||0}/${c.size}</b> ${c.win?`<span class="n80-win">🔥 ${rub(c.payout)}</span>`:'<span class="n80-miss">❌ MISS</span>'}</div>`:''}
      ${(c.keyEdges||[]).length?`<div class="n80-edge-list">${c.keyEdges.slice(0,4).map(e=>`<div class="n80-edge"><span>🔗 ${pad(e.a)}—${pad(e.b)} ${e.relations?.length?`<span class="n80-rel">${esc(e.relations.join('/'))}</span>`:''}</span><b>${Number(e.score||0).toFixed(2)}</b></div>`).join('')}</div>`:''}
    </div>`;
  }
  function signalHtml(){
    const p=pending()||live;
    if(!p)return '<div class="n80-empty">Недостаточно данных для расчёта.</div>';
    const versionNote=p?.version!==ENGINE?.VERSION?'<div class="n80-sub">Текущий frozen создан предыдущей версией и не переписывается. Новая логика начнёт действовать со следующего frozen.</div>':'';
    return `<div class="n80-summary"><div class="n80-kpi"><b>№${p.sourceDraw} → №${p.targetDraw}</b><span>frozen до следующего тиража</span></div><div class="n80-kpi"><b>${p.scopeDraws||live?.scopeDraws||0}</b><span>тиражей накоплено в режиме</span></div></div>
      ${versionNote}<div class="n80-sub">${serverOnline?'SERVER frozen':'локальный расчёт'} · полный 7/7 не обязателен: показываются разные активные структуры — крупная сборка, фрагмент и отдельное ребро. Вложенные копии одной и той же группы больше не дублируются. Уровень = сила структуры, не гарантия выигрыша.</div>
      <div class="n80-section">Активные сборки</div>${(p.candidates||[]).map(c=>candidateHtml(c,false)).join('')||'<div class="n80-empty">Сильных сборок сейчас нет.</div>'}`;
  }
  function playerHeat(n){
    const c=live?.cards?.[n-1];if(!c)return'';const s=(c.neighbors||[])[0]?.score||0;if(s>=2.5)return'hot';if(s>=1.5)return'warm';if(s>=.8)return'active';return'';
  }
  function playerCardHtml(n){
    const c=live?.cards?.[n-1];if(!c)return'';const links=c.neighbors||[];
    return `<div class="n80-card"><div class="n80-card-title"><div class="n80-card-ball">${pad(n)}</div><div><b>Карточка числа ${pad(n)}</b><div class="n80-sub">${c.parity} · ряд ${c.row} · столб ${c.col} · зеркало ${pad(c.mirror)} · ${c.mirrorType}</div></div></div>
      <div class="n80-summary"><div class="n80-kpi"><b>${c.appear60}</b><span>выходов / последние 60</span></div><div class="n80-kpi"><b>М${c.bestPosition}</b><span>частая позиция выпадения</span></div></div>
      ${c.bestFrame?`<div class="n80-sub">Частое обрамление сейчас: <b>${pad(c.bestFrame.left)}–${pad(n)}–${pad(c.bestFrame.right)}</b> ×${c.bestFrame.count}</div>`:''}
      <div class="n80-section">Сильные связи</div><div class="n80-links">${links.slice(0,8).map(x=>`<div class="n80-link"><b>${pad(n)}—${pad(x.number)}</b><div>сила ${Number(x.score||0).toFixed(2)}</div><div class="n80-sub">${esc((x.relations||[]).join(' · ')||'динамическая связь')}</div></div>`).join('')}</div></div>`;
  }
  function playersHtml(){
    return `<div class="n80-sub">Нажми число — откроется его постоянно пополняемая карточка.</div><div class="n80-grid">${Array.from({length:80},(_,i)=>i+1).map(n=>`<button class="n80-player ${playerHeat(n)} ${selectedPlayer===n?'selected':''}" data-n80-player="${n}">${pad(n)}</button>`).join('')}</div>${selectedPlayer?playerCardHtml(selectedPlayer):''}`;
  }
  function graphSvg(){
    const c=(pending()||live)?.candidates?.[0];if(!c||!(c.numbers||[]).length)return '<div class="n80-empty">Нет активной группы для схемы.</div>';
    const ns=c.numbers,edges=c.keyEdges||[],W=360,H=250,cx=180,cy=125,R=86;
    const pts=new Map(ns.map((n,i)=>{const a=-Math.PI/2+i*2*Math.PI/ns.length;return[n,{x:cx+R*Math.cos(a),y:cy+R*Math.sin(a)}]}));
    return `<svg class="n80-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Сеть активной группы">${edges.map(e=>{const a=pts.get(e.a),b=pts.get(e.b);if(!a||!b)return'';return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#4cc7ff" stroke-width="${1.2+Math.min(4,Math.max(0,e.score))*.5}" opacity=".75"/>`}).join('')}${ns.map(n=>{const p=pts.get(n);return `<g><circle cx="${p.x}" cy="${p.y}" r="19" fill="#172a43" stroke="#ffb33b" stroke-width="2"/><text x="${p.x}" y="${p.y+5}" fill="#fff" font-size="14" font-weight="900" text-anchor="middle">${pad(n)}</text></g>`}).join('')}</svg>`;
  }
  function linksHtml(){
    const edges=(live?.topEdges||[]).slice(0,30);
    return `${graphSvg()}<div class="n80-section">Сильные рёбра сейчас</div>${edges.slice(0,18).map(e=>`<div class="n80-edge"><span><b>${pad(e.a)}—${pad(e.b)}</b> ${e.relations?.length?`<span class="n80-rel">${esc(e.relations.join('/'))}</span>`:''}</span><span>${Number(e.score||0).toFixed(2)} · вместе ${e.coRecent} · рядом ${e.adjRecent}</span></div>`).join('')}`;
  }
  function historySummary(p){
    const actual=p.actual;if(!actual)return {cls:'wait',lead:'⏳',text:`№${p.targetDraw} · ожидает`};
    const total=Number(p.totalPayout||0),best=(p.candidates||[]).reduce((a,c)=>!a||Number(c.hitCount)>Number(a.hitCount)?c:a,null);
    return {cls:total>0?'win':'miss',lead:total>0?'🔥':'❌',text:`№${actual.draw} · ${esc(actual.time||'')} · ст${actual.column||'—'} · лучший ${best?`${best.hitCount}/${best.size}`:'—'} ${total>0?`· ${rub(total)}`:'· MISS'}`};
  }
  function historyDetail(p){
    if(!p.actual)return `<div class="n80-card"><b>⏳ Ожидается №${p.targetDraw}</b><div class="n80-sub">Frozen уже записан и не изменяется.</div>${(p.candidates||[]).map(c=>candidateHtml(c,false)).join('')}</div>`;
    const a=p.actual;
    return `<div class="n80-card"><div class="n80-cand-head"><b>ФАКТ №${a.draw} · ${esc(a.date)} ${esc(a.time)}</b><span>ст${a.column||'—'}</span></div><div class="n80-actual">${(a.balls||[]).map(n=>`<span>${pad(n)}</span>`).join('')}</div>${(p.candidates||[]).map(c=>candidateHtml(c,true)).join('')}<div class="n80-payout" style="margin-top:9px">${Number(p.totalPayout||0)>0?`🔥 ИТОГ ПО FROZEN: ${rub(p.totalPayout)}`:'❌ Выигрышных frozen-сборок нет'}</div></div>`;
  }
  function historyHtml(){
    let list=archive.slice().reverse();
    if(historyFilter==='win')list=list.filter(p=>Number(p.totalPayout||0)>0);
    if(historyFilter==='miss')list=list.filter(p=>p.actual&&Number(p.totalPayout||0)===0);
    if(historyFilter==='wait')list=list.filter(p=>!p.actual);
    return `<div class="n80-filter"><button data-n80-filter="all" class="${historyFilter==='all'?'on':''}">Все</button><button data-n80-filter="win" class="${historyFilter==='win'?'on':''}">🔥 Выигрыши</button><button data-n80-filter="miss" class="${historyFilter==='miss'?'on':''}">❌ MISS</button><button data-n80-filter="wait" class="${historyFilter==='wait'?'on':''}">⏳ Ожидает</button></div>${list.slice(0,100).map(p=>{const s=historySummary(p);return `<button class="n80-history-item ${s.cls}" data-n80-hist="${p.targetDraw}"><b>${s.lead} ${s.text}</b><div class="n80-sub">frozen после №${p.sourceDraw}</div><span class="n80-chevron">⌄</span></button><div class="n80-history-detail" id="n80h-${p.targetDraw}"></div>`}).join('')||'<div class="n80-empty">Записей по фильтру нет.</div>'}`;
  }
  function renderBody(){
    const box=$('network80Result');if(!box)return;
    box.innerHTML=mode==='signal'?signalHtml():mode==='players'?playersHtml():mode==='links'?linksHtml():historyHtml();
    box.querySelectorAll('[data-n80-player]').forEach(b=>b.addEventListener('click',()=>{selectedPlayer=Number(b.dataset.n80Player);renderBody()}));
    box.querySelectorAll('[data-n80-filter]').forEach(b=>b.addEventListener('click',()=>{historyFilter=b.dataset.n80Filter;renderBody()}));
    box.querySelectorAll('[data-n80-hist]').forEach(b=>b.addEventListener('click',()=>{const id=Number(b.dataset.n80Hist),d=$(`n80h-${id}`);if(d.innerHTML){d.innerHTML='';return}box.querySelectorAll('.n80-history-detail').forEach(x=>x.innerHTML='');const p=archive.find(x=>Number(x.targetDraw)===id);d.innerHTML=p?historyDetail(p):'';}));
  }
  function bindTabs(){
    document.querySelectorAll('[data-n80-mode]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-n80-mode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');mode=b.dataset.n80Mode;renderBody();});
  }
  async function render(input){
    try{
      draws=(input&&input.length?input:await loadDraws()).slice();
      if(!ENGINE||draws.length<120){const b=$('network80Result');if(b)b.innerHTML='<div class="n80-empty">Недостаточно истории.</div>';return;}
      live=ENGINE.forecast(draws);await fetchServer();bindTabs();renderBody();
    }catch(e){const b=$('network80Result');if(b)b.innerHTML=`<div class="n80-empty">СЕТЬ 80: ${esc(e?.message||e)}</div>`;console.error(e)}
  }
  function bootstrap(){
    const tool=document.querySelector('[data-panel="network80Panel"]');
    if(tool)tool.addEventListener('click',()=>setTimeout(()=>render(),0));
    ['syncBtn','syncBtn2'].forEach(id=>$(id)?.addEventListener('click',()=>setTimeout(()=>{if($('network80Panel')?.classList.contains('show'))render()},1200)));
  }
  window.POZITRON_V63_NETWORK80_UI={render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootstrap);else bootstrap();
})();