'use strict';
(() => {
  const $=id=>document.getElementById(id), STORE=window.POZITRON_V63_STORE, ENGINE=window.POZITRON_V63_ENGINE;
  const BUILD='6400';
  const SOURCES=[
    'https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json',
    'https://arsazet17.github.io/pozitron-keno-v5/keno-history-v62.json',
    'https://cdn.jsdelivr.net/gh/arsazet17/pozitron-keno-v5@main/keno-history-v62.json'
  ];
  let draws=[],mode='fall',fpMode='logic',timer=null,weights={...ENGINE.DEFAULT_WEIGHTS},learningCount=0,bootstrapCount=0,networkReady=false;
  const pad=n=>String(Number(n)).padStart(2,'0');
  const normDate=v=>{v=String(v||'').trim();let m=v.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{2,4})$/);if(m){let y=m[3];if(y.length===2)y='20'+y;return `${y}-${m[2]}-${m[1]}`;}m=v.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/);return m?`${m[1]}-${m[2]}-${m[3]}`:v.slice(0,10);};
  const showDate=v=>{const p=normDate(v).split('-');return p.length===3?`${p[2]}.${p[1]}.${p[0].slice(-2)}`:String(v||'')};
  const normTime=v=>String(v||'').match(/\d{1,2}:\d{2}(?::\d{2})?/)?.[0]||String(v||'');

  function valid(o){
    const draw=Number(o?.draw??o?.number??o?.drawNumber??o?.id),date=normDate(o?.date??o?.drawDate??o?.datetime??''),time=normTime(o?.time??o?.drawTime??o?.datetime??'');
    let balls=o?.balls??o?.numbers??o?.results??o?.result??o?.winningNumbers;if(typeof balls==='string')balls=(balls.match(/\d+/g)||[]).map(Number);
    balls=(balls||[]).map(Number).filter(n=>n>=1&&n<=80).slice(0,20);
    return Number.isFinite(draw)&&balls.length===20&&new Set(balls).size===20?{draw,date,time,balls}:null;
  }
  function parse(text){try{const j=JSON.parse(String(text||'')),arr=Array.isArray(j)?j:(j.draws||j.records||j.history||[]);return arr.map(valid).filter(Boolean).sort((a,b)=>a.draw-b.draw);}catch{return[]}}
  function mergeLists(...lists){const m=new Map();for(const list of lists)for(const d of list||[])if(d)m.set(Number(d.draw),d);return [...m.values()].sort((a,b)=>a.draw-b.draw);}

  async function fetchOne(url){const sep=url.includes('?')?'&':'?';const r=await fetch(`${url}${sep}v=${BUILD}&t=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);return parse(await r.text());}
  async function fetchFresh(){
    $('status').textContent='Проверяю новый тираж…';
    const saved=await STORE.getMeta('source','');const sources=[...SOURCES,...(saved?[saved]:[])].filter((x,i,a)=>x&&a.indexOf(x)===i);
    const results=await Promise.allSettled(sources.map(fetchOne));
    const good=results.filter(x=>x.status==='fulfilled'&&x.value.length).map(x=>x.value);
    if(good.length){
      const next=mergeLists(draws,...good),oldMax=draws.at(-1)?.draw||0,newMax=next.at(-1)?.draw||0;
      if(newMax>=oldMax)draws=next;
      await STORE.saveDraws(draws);networkReady=true;await ensureBootstrapLearning();await settlePending();renderAll();
      $('status').textContent=`v6.3 CLEAN · база: ${draws.length.toLocaleString('ru-RU')} · последний №${draws.at(-1).draw}`;return true;
    }
    const backup=await STORE.loadDraws();
    if(backup.length>=3){draws=mergeLists(draws,backup);networkReady=true;await ensureBootstrapLearning();await settlePending();renderAll();$('status').textContent=`⚠ ОФЛАЙН · резерв до №${draws.at(-1).draw}`;return false;}
    $('cards').innerHTML='<section class="card"><b>Не удалось получить историю тиражей.</b><div class="small">Проверь интернет и нажми ↻.</div></section>';
    $('status').textContent='Нет связи и резервной базы';return false;
  }


  async function ensureBootstrapLearning(){
    const done=await STORE.getMeta('bootstrapVersion','');
    if(done==='6400'){bootstrapCount=Number(await STORE.getMeta('bootstrapCount',0))||0;return;}
    if(draws.length<80)return;
    const steps=Math.min(36,draws.length-20);let w={...weights},trained=0;
    $('status').textContent=`🧠 Первичное обучение FINGERPRINT по архиву: 0/${steps}`;
    const start=draws.length-1-steps;
    for(let i=start;i<draws.length-1;i++){
      const context=draws.slice(Math.max(0,i-899),i+1);
      const pred=ENGINE.forecast(context,w);
      if(pred){const r=ENGINE.settlePrediction(pred,draws[i+1],w);w=r.weights;trained++;}
      if(trained%6===0){$('status').textContent=`🧠 Первичное обучение FINGERPRINT по архиву: ${trained}/${steps}`;await new Promise(r=>setTimeout(r,0));}
    }
    weights=w;bootstrapCount=trained;
    await STORE.setMeta('weights',weights);await STORE.setMeta('bootstrapVersion','6400');await STORE.setMeta('bootstrapCount',trained);
  }

  async function settlePending(){
    const by=new Map(draws.map(d=>[Number(d.draw),d])),list=await STORE.listPredictions();let changed=false;
    for(const p of list){if(p.actual||!by.has(Number(p.targetDraw)))continue;const result=ENGINE.settlePrediction(p,by.get(Number(p.targetDraw)),weights);weights=result.weights;await STORE.putPrediction(result.prediction);changed=true;}
    if(changed)await STORE.setMeta('weights',weights);
    const updated=await STORE.listPredictions();learningCount=updated.filter(p=>p.actual).length;
  }

  async function getOrCreateForecast(){
    await settlePending();const latest=draws.at(-1);if(!latest)return null;
    let p=await STORE.getPrediction(Number(latest.draw)+1);
    if(!p){p=ENGINE.forecast(draws,weights);if(p)await STORE.putPrediction(p);}return p;
  }

  function sumBalls(b){return (b||[]).reduce((a,x)=>a+Number(x),0)}
  function parity(b){const odd=(b||[]).filter(n=>n%2).length;return {odd,even:20-odd}}
  function dominantColumn(b){const totals=Array(11).fill(0);for(const n of b)totals[n%10===0?10:n%10]++;const max=Math.max(...totals.slice(1)),progress=Array(11).fill(0);for(let i=0;i<b.length;i++){const c=b[i]%10===0?10:b[i]%10;progress[c]++;if(totals[c]===max&&progress[c]===max)return {column:c,count:max,completedAt:i+1};}return {column:1,count:totals[1],completedAt:null};}
  function samePositions(d){const asc=[...d.balls].sort((a,b)=>a-b),s=new Set();d.balls.forEach((n,i)=>{if(n===asc[i])s.add(n)});return s;}
  function singletonText(d){const cols=Array.from({length:10},()=>[]);for(const n of d.balls)cols[n%10===0?9:n%10-1].push(n);const singles=cols.map((a,i)=>a.length===1?i+1:null).filter(Boolean),empty=cols.map((a,i)=>a.length===0?i+1:null).filter(Boolean);return `☝ одиночные: ${singles.length?singles.map(x=>'ст'+x).join(', '):'—'}${empty.length?` · <span class="empty">${empty.map(x=>'ст'+x+' □ — пустой!').join(' ')}</span>`:''}`;}
  function drawCard(d,prev,label){const prevSet=new Set(prev?.balls||[]),trans=new Set(d.balls.filter(n=>prevSet.has(n))),same=samePositions(d),p=parity(d.balls),dc=dominantColumn(d.balls),nums=mode==='asc'?[...d.balls].sort((a,b)=>a-b):d.balls;return `<section class="card"><div class="draw-head"><div><div class="label">${label}</div><div class="draw-no">№${d.draw}</div><div class="draw-time">${showDate(d.date)} ${d.time||''}</div><div class="meta"><span>Σ ${sumBalls(d.balls)}</span><span>${p.even}/${p.odd}</span><span>${sumBalls(d.balls)%2?'нечёт':'чёт'}</span></div></div><div class="st">🔴 ст${dc.column}</div></div>${grids}<div class="singletons">${singletonText(d)}</div></section>`;}
  function renderCards(){if(!networkReady||draws.length<3)return;const i=draws.length-1;$('cards').innerHTML=drawCard(draws[i],draws[i-1],'ПОСЛЕДНИЙ ТИРАЖ')+drawCard(draws[i-1],draws[i-2],'ПРЕДЫДУЩИЙ ТИРАЖ')+drawCard(draws[i-2],draws[i-3],'ПРЕДПРЕДЫДУЩИЙ ТИРАЖ');}

  const poolHtml=(nums,hits=[])=>{const hs=new Set((hits||[]).map(Number));return `<div class="pool">${(nums||[]).map(n=>`<span class="${hs.has(Number(n))?'hit':''}">${pad(n)}</span>`).join('')}</div>`};
  const combosHtml=(combos,settled=false)=> (combos||[]).map(c=>`<div class="combo"><div class="combo-head"><b>${c.id}</b><span>К${c.size}${settled?` · ${(c.hits||[]).length}/${c.size}`:''}</span></div><div class="combo-numbers">${(c.numbers||[]).map(pad).join(' · ')}</div>${settled&&c.hits?.length?`<div class="small">попали: ${c.hits.map(pad).join(', ')}</div>`:''}</div>`).join('');

  async function renderFingerprint(){
    const box=$('fingerprintResult');if(!draws.length){box.innerHTML='';return;}
    if(fpMode==='archive'){await renderArchive();return;}
    const p=await getOrCreateForecast();if(!p){box.innerHTML='<div class="row small">Недостаточно истории.</div>';return;}
    const anti=fpMode==='antilogic',pool=anti?p.anti20:p.pool20,combos=anti?p.antiCombos:p.logicCombos;
    box.innerHTML=`<div class="row"><strong>🎯 / ⏳−1 · после №${p.sourceDraw} → №${p.targetDraw}</strong><div class="small">🧠 обучение: архив ${bootstrapCount} + живых ${learningCount} · память IndexedDB</div></div><div class="signal-grid"><div class="signal"><b>${p.transition?.count||0}/20</b><span>переходов</span></div><div class="signal"><b>${Number(p.matrix?.meanDistance||0).toFixed(2)}</b><span>средний Manhattan</span></div><div class="signal"><b>${p.neighborsCount||0}</b><span>исторических состояний</span></div><div class="signal"><b>${Number(weights.analog||0).toFixed(3)}</b><span>вес аналогов после обучения</span></div></div><div class="label" style="margin-top:10px">${anti?'ANTILOGIC-20':'POOL-20'}</div>${poolHtml(pool)}<div class="label" style="margin-top:10px">К3 · К4 · К5</div>${combosHtml(combos)}`;
  }

  async function renderArchive(){
    await settlePending();const list=(await STORE.listPredictions()).slice().reverse();const box=$('fingerprintResult');
    if(!list.length){box.innerHTML='<div class="row small">Архив FINGERPRINT пока пуст.</div>';return;}
    box.innerHTML=list.slice(0,40).map(p=>`<button class="archive-item" data-archive-draw="${p.targetDraw}"><div><b>№${p.targetDraw}</b> · после №${p.sourceDraw}${p.actual?` · POOL ${(p.poolHits||[]).length}/20 · ANTI ${(p.antiHits||[]).length}/20`:' · ⏳ ожидает'}</div><div class="small">${p.actual?'проверен и обучен':'зафиксирован'} · ${new Date(p.createdAt).toLocaleString('ru-RU')}</div></button><div class="archive-detail" id="ad-${p.targetDraw}"></div>`).join('');
  }
  async function toggleArchiveDetail(target){
    const box=$(`ad-${target}`);if(!box)return;if(box.innerHTML){box.innerHTML='';return;}
    const p=await STORE.getPrediction(Number(target));if(!p)return;
    box.innerHTML=`<div class="archive-open"><div class="label">ПРОГНОЗ LOGIC</div>${poolHtml(p.pool20,p.poolHits)}<div class="label" style="margin-top:8px">LOGIC К3/К4/К5</div>${combosHtml(p.logicCombos,!!p.actual)}<div class="label" style="margin-top:10px">ANTILOGIC</div>${poolHtml(p.anti20,p.antiHits)}<div class="label" style="margin-top:8px">ANTILOGIC К3/К4/К5</div>${combosHtml(p.antiCombos,!!p.actual)}${p.actual?`<div class="label" style="margin-top:10px">ФАКТ №${p.actual.draw} · ${showDate(p.actual.date)} ${p.actual.time}</div>${poolHtml(p.actual.balls)}<div class="small">веса после обучения: ${Object.entries(p.learnedWeights||{}).map(([k,v])=>`${k} ${Number(v).toFixed(3)}`).join(' · ')}</div>`:'<div class="row small">⏳ Фактический тираж ещё не получен.</div>'}</div>`;
  }

  function renderMatrix(){const r=ENGINE.matrixReport(draws),d=draws.at(-1),dc=dominantColumn(d.balls),f=r.features;$('matrixResult').innerHTML=`<div class="row"><strong>№${r.draw} · ${showDate(r.date)} ${r.time||''} · ст${dc.column}</strong><div class="small">сжатие / разжатие · плотность · центр массы · баланс поля</div></div><div class="signal-grid"><div class="signal"><b>${r.phase}</b><span>фаза поля</span></div><div class="signal"><b>${r.arrow}</b><span>движение центра</span></div><div class="signal"><b>${Number(f.density).toFixed(3)}</b><span>плотность D≤2</span></div><div class="signal"><b>${Number(f.imbalance).toFixed(2)}</b><span>перекос квадрантов</span></div></div><div class="row"><b>Сжатие ↔ разжатие</b><div class="meter"><span style="width:${Math.max(5,Math.min(95,50+r.delta*18))}%"></span></div><div class="small">Δ среднего Manhattan: ${r.delta.toFixed(3)}</div></div><div class="matrix-grid">${Array.from({length:80},(_,i)=>i+1).map(n=>`<div class="cell ${d.balls.includes(n)?'on':''}">${n}</div>`).join('')}</div>`;}
  function renderAssembly(){const r=ENGINE.assemblyReport(draws);$('assemblyResult').innerHTML=`<div class="row"><strong>№${r.draw} · ${showDate(r.date)} ${r.time||''}</strong><div class="small">М1–М20 · горизонтали и вертикали</div></div><div class="label" style="margin-top:9px">Сильные горизонтали</div>${r.horizontal.slice(0,5).map(x=>`<div class="combo"><b>М${x.place}–М${x.place+x.length-1}</b><div class="combo-numbers">${x.numbers.map(pad).join(' · ')}</div><div class="small">сила ${x.score.toFixed(2)}</div></div>`).join('')}<div class="label" style="margin-top:9px">Сильные вертикали</div>${r.vertical.slice(0,5).map(x=>`<div class="combo"><b>М${x.place}</b><div class="combo-numbers">${x.numbers.map(pad).join(' → ')}</div><div class="small">сила ${x.score.toFixed(2)}</div></div>`).join('')}`;}

  function renderAll(){renderCards();if($('fingerprintPanel').classList.contains('show'))renderFingerprint();if($('matrixPanel').classList.contains('show'))renderMatrix();if($('assemblyPanel').classList.contains('show'))renderAssembly();}
  function openPanel(id){document.querySelectorAll('.panel').forEach(p=>p.classList.remove('show'));$(id)?.classList.add('show');if(id==='fingerprintPanel')renderFingerprint();if(id==='matrixPanel')renderMatrix();if(id==='assemblyPanel')renderAssembly();setTimeout(()=>$(id)?.scrollIntoView({behavior:'smooth',block:'start'}),40);}

  document.addEventListener('click',async e=>{
    const modeBtn=e.target.closest('[data-mode]');if(modeBtn){mode=modeBtn.dataset.mode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('on',b===modeBtn));renderCards();return;}
    const tool=e.target.closest('[data-panel],[data-open]');if(tool){openPanel(tool.dataset.panel||tool.dataset.open);return;}
    const close=e.target.closest('[data-close]');if(close){$(close.dataset.close)?.classList.remove('show');return;}
    const tab=e.target.closest('[data-fp-mode]');if(tab){fpMode=tab.dataset.fpMode;document.querySelectorAll('[data-fp-mode]').forEach(b=>b.classList.toggle('active',b===tab));await renderFingerprint();return;}
    const ar=e.target.closest('[data-archive-draw]');if(ar){await toggleArchiveDetail(ar.dataset.archiveDraw);return;}
  });
  $('syncBtn')?.addEventListener('click',fetchFresh);$('syncBtn2')?.addEventListener('click',fetchFresh);$('settingsBtn')?.addEventListener('click',()=>$('settings').showModal());
  $('saveSettings')?.addEventListener('click',async()=>{await STORE.setMeta('source',$('sourceUrl').value.trim());await STORE.setMeta('interval',Number($('interval').value)||0);setupTimer();});
  async function setupTimer(){if(timer)clearInterval(timer);const ms=Number(await STORE.getMeta('interval',300000));$('interval').value=String(ms);if(ms>0)timer=setInterval(fetchFresh,ms);}

  (async()=>{await STORE.clearLegacy();weights=ENGINE.normalizeWeights(await STORE.getMeta('weights',ENGINE.DEFAULT_WEIGHTS));draws=await STORE.loadDraws();$('sourceUrl').value=await STORE.getMeta('source','');await setupTimer();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js?v=6400').catch(()=>{});await fetchFresh();})();
})();
