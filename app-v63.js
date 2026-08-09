'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const DBSTORE=window.POZITRON_V63_STORE;
  const ENGINE=window.POZITRON_V63_ENGINE;
  const pad=n=>String(Number(n)).padStart(2,'0');
  const normDate=v=>{
    v=String(v||'').trim();
    let m=v.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{2,4})$/);
    if(m){let y=m[3];if(y.length===2)y='20'+y;return `${y}-${m[2]}-${m[1]}`}
    m=v.match(/^(\d{4})[.\-/](\d{2})[.\-/](\d{2})$/);
    return m?`${m[1]}-${m[2]}-${m[3]}`:v.slice(0,10);
  };
  const showDate=v=>{const p=normDate(v).split('-');return p.length===3?`${p[2]}.${p[1]}.${p[0].slice(-2)}`:String(v||'')};
  const normTime=v=>String(v||'').match(/\d{1,2}:\d{2}(?::\d{2})?/)?.[0]||String(v||'');
  const STORE={
    draws:'pozitron_v63_draws',
    source:'pozitron_v63_source',
    interval:'pozitron_v63_interval',
    fpState:'pozitron_v63_server_state_cache',
    fpArchive:'pozitron_v63_server_archive_cache',
  };
  const DEFAULT_SOURCE='https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';
  const PAYOUTS=Object.freeze({
    k3_2:300,
    k3_3:1500,
    k4_2:100,
    k4_3:300,
    k4_4:3300,
    k5_3:400,
    k5_4:1920,
    k5_5:20000
  });
  let draws=[],mode='fall',timer=null,fpMode='logic',networkReady=false;
  let serverState=null,serverArchive=[],serverFingerprintOnline=false,archiveLookup=new Map();

  function valid(o){
    const draw=Number(o?.draw??o?.number??o?.drawNumber??o?.id);
    const date=normDate(o?.date??o?.drawDate??o?.datetime??'');
    const time=normTime(o?.time??o?.drawTime??o?.datetime??'');
    let balls=o?.balls??o?.numbers??o?.results??o?.result??o?.winningNumbers;
    if(typeof balls==='string')balls=(balls.match(/\d+/g)||[]).map(Number);
    balls=(balls||[]).map(Number).filter(n=>n>=1&&n<=80).slice(0,20);
    return Number.isFinite(draw)&&balls.length===20&&new Set(balls).size===20?{draw,date,time,balls}:null;
  }
  function parse(text){
    const t=String(text||'').trim();if(!t)return[];
    try{
      const j=JSON.parse(t),arr=Array.isArray(j)?j:(j.draws||j.records||j.history||[]);
      return arr.map(valid).filter(Boolean).sort((a,b)=>a.draw-b.draw);
    }catch{}
    const rows=t.split(/\r?\n/).filter(Boolean),out=[];
    for(const row of rows){
      const nums=(row.match(/\d+/g)||[]).map(Number);
      if(nums.length>=21){
        const d=valid({draw:nums[0],balls:nums.slice(-20),date:'',time:''});if(d)out.push(d);
      }
    }
    return out.sort((a,b)=>a.draw-b.draw);
  }
  function saveLocal(){try{localStorage.setItem(STORE.draws,JSON.stringify(draws.slice(-35000)))}catch{}}
  function loadLocal(){try{return JSON.parse(localStorage.getItem(STORE.draws)||'[]').map(valid).filter(Boolean)}catch{return[]}}

  function payoutFor(size,hits){
    return Number(PAYOUTS[`k${size}_${hits}`]||0);
  }
  const rub=n=>`${Number(n||0).toLocaleString('ru-RU')} ₽`;

  function sumBalls(b){return (b||[]).reduce((a,x)=>a+Number(x),0)}
  function parity(b){const odd=(b||[]).filter(n=>n%2).length;return {odd,even:20-odd}}
  function dominantColumn(b){
    const c=Array(11).fill(0);for(const n of b||[])c[n%10===0?10:n%10]++;
    let best=1;for(let i=2;i<=10;i++)if(c[i]>c[best])best=i;return {column:best,count:c[best]};
  }
  function orderFor(draw){if(mode==='asc')return [...draw.balls].sort((a,b)=>a-b);return draw.balls.slice()}
  function samePositions(draw){
    const asc=[...draw.balls].sort((a,b)=>a-b),set=new Set();
    draw.balls.forEach((n,i)=>{if(Number(n)===Number(asc[i]))set.add(Number(n))});return set;
  }
  function singletonText(draw){
    const cols=Array.from({length:10},()=>[]);
    for(const n of draw.balls)cols[n%10===0?9:(n%10)-1].push(n);
    const singles=cols.map((a,i)=>a.length===1?i+1:null).filter(Boolean);
    const empty=cols.map((a,i)=>a.length===0?i+1:null).filter(Boolean);
    const s=singles.length?`☝ одиночные: ${singles.map(x=>'ст'+x).join(', ')}`:'☝ одиночные: —';
    return s+(empty.length?` · <span class="empty">${empty.map(x=>'ст'+x+' □ — пустой!').join(' ')}</span>`:'');
  }
  function drawCard(draw,previous,label){
    const prevSet=new Set(previous?.balls||[]);
    const trans=new Set(draw.balls.filter(n=>prevSet.has(Number(n))));
    const same=samePositions(draw),p=parity(draw.balls),dc=dominantColumn(draw.balls);
    const nums=orderFor(draw);
    return `<section class="card">
      <div class="draw-head"><div>
        <div class="label">${label}</div><div class="draw-no">№${draw.draw}</div>
        <div class="draw-time">${showDate(draw.date)} ${draw.time||''}</div>
        <div class="meta"><span>Σ ${sumBalls(draw.balls)}</span><span>${p.even}/${p.odd}</span><span>${sumBalls(draw.balls)%2?'нечёт':'чёт'}</span></div>
      </div><div class="st">🔴 ст${dc.column}</div></div>
      <div class="numbers">${nums.map(n=>`<div class="ball ${trans.has(Number(n))?'pass':''} ${same.has(Number(n))?'same':''}">${pad(n)}${trans.has(Number(n))?' ◆':''}</div>`).join('')}</div>
      <div class="singletons">${singletonText(draw)}</div>
    </section>`;
  }
  function renderCards(){
    if(!networkReady||draws.length<3)return;
    const last=draws.length-1;
    const idx=[last,last-1,last-2];
    $('cards').innerHTML=idx.map((i,k)=>{
      const lab=k===0?'ПОСЛЕДНИЙ ТИРАЖ':k===1?'ПРЕДЫДУЩИЙ ТИРАЖ':'ПРЕДПРЕДЫДУЩИЙ ТИРАЖ';
      return drawCard(draws[i],draws[i-1],lab);
    }).join('');
  }

  async function fetchFingerprintServer(){
    const bust=`?v=6500&t=${Date.now()}`;
    try{
      const [sr,ar]=await Promise.all([
        fetch('./fingerprint-state-v63.json'+bust,{cache:'no-store'}),
        fetch('./fingerprint-archive-v63.json'+bust,{cache:'no-store'})
      ]);
      if(!sr.ok||!ar.ok)throw new Error(`SERVER FINGERPRINT HTTP ${sr.status}/${ar.status}`);
      const state=await sr.json(),archive=await ar.json();
      if(!state?.serverLearning||!Array.isArray(archive))throw new Error('Неверный формат SERVER FINGERPRINT');
      serverState=state;serverArchive=archive.sort((a,b)=>Number(a.targetDraw)-Number(b.targetDraw));serverFingerprintOnline=true;
      try{localStorage.setItem(STORE.fpState,JSON.stringify(serverState));localStorage.setItem(STORE.fpArchive,JSON.stringify(serverArchive));}catch{}
      return true;
    }catch(error){
      console.warn('SERVER FINGERPRINT:',error);
      try{
        const state=JSON.parse(localStorage.getItem(STORE.fpState)||'null');
        const archive=JSON.parse(localStorage.getItem(STORE.fpArchive)||'[]');
        if(state?.serverLearning&&Array.isArray(archive)){serverState=state;serverArchive=archive;serverFingerprintOnline=false;return false;}
      }catch{}
      serverState=null;serverArchive=[];serverFingerprintOnline=false;return false;
    }
  }

  async function legacyArchive(){
    if(!DBSTORE?.listPredictions)return [];
    try{
      const list=(await DBSTORE.listPredictions()).filter(Boolean),facts=new Map(draws.map(d=>[Number(d.draw),d]));
      return list.map(p=>{
        if(p.actual||!facts.has(Number(p.targetDraw))||!ENGINE?.settlePrediction)return p;
        try{return ENGINE.settlePrediction(p,facts.get(Number(p.targetDraw)),p.weights||ENGINE.DEFAULT_WEIGHTS).prediction}catch{return p}
      });
    }catch{return []}
  }

  async function combinedArchive(){
    const legacy=await legacyArchive(),map=new Map();
    for(const p of legacy)map.set(Number(p.targetDraw),{...p,legacyLocal:true});
    for(const p of serverArchive)map.set(Number(p.targetDraw),{...p,server:true,legacyLocal:false});
    const list=[...map.values()].sort((a,b)=>Number(a.targetDraw)-Number(b.targetDraw));
    archiveLookup=new Map(list.map(p=>[Number(p.targetDraw),p]));
    return list;
  }

  async function fetchFresh(){
    const savedSource=(localStorage.getItem(STORE.source)||'').trim();
    const live='https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';
    const local='./keno-history-v63.json';
    const sources=[local,live,savedSource].filter((x,i,a)=>x&&a.indexOf(x)===i);
    let err=null; const map=new Map();
    for(const url of sources){
      try{
        const sep=url.includes('?')?'&':'?';
        const r=await fetch(`${url}${sep}v=6500&t=${Date.now()}`,{cache:'no-store'});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const arr=parse(await r.text()); for(const d of arr)map.set(Number(d.draw),d);
      }catch(e){err=e}
    }
    if(map.size){
      draws=[...map.values()].sort((a,b)=>a.draw-b.draw);saveLocal();networkReady=true;
      if(DBSTORE)await DBSTORE.saveDraws(draws).catch(()=>{});
      await fetchFingerprintServer();
      $('status').textContent=`v6.3 SERVER · база: ${draws.length.toLocaleString('ru-RU')} · последний №${draws.at(-1).draw}`;
      renderAll();return true;
    }
    const backup=loadLocal();
    if(backup.length>=3){
      draws=backup.sort((a,b)=>a.draw-b.draw);networkReady=true;
      await fetchFingerprintServer();
      $('status').textContent=`⚠ ОФЛАЙН · сохранено до №${draws.at(-1).draw}`;renderAll();return false;
    }
    $('status').textContent='Нет связи и нет локальной резервной базы';
    $('cards').innerHTML='<section class="card"><b>Не удалось получить историю тиражей.</b><div class="small">Проверьте интернет и нажмите ↻.</div></section>';
    throw err||new Error('Нет данных');
  }

  function renderAll(){
    renderCards();
    if($('fingerprintPanel').classList.contains('show'))renderFingerprint().catch(console.error);
    if($('matrixPanel').classList.contains('show'))renderMatrix();
    if($('assemblyPanel').classList.contains('show'))renderAssembly();
  }

  function getServerForecast(){
    if(!serverState||!serverArchive.length)return null;
    const target=Number(serverState.nextTargetDraw||0);
    return serverArchive.find(p=>Number(p.targetDraw)===target&&!p.actual)||serverArchive.find(p=>!p.actual)||null;
  }

  function poolHtml(nums,hits=[]){
    const hs=new Set((hits||[]).map(Number));
    return `<div class="pool">${(nums||[]).map(n=>`<span class="${hs.has(Number(n))?'hit':''}">${pad(n)}</span>`).join('')}</div>`;
  }
  function actualHtml(p){
    if(!p.actual)return '';
    const logic=new Set((p.poolHits||[]).map(Number)),anti=new Set((p.antiHits||[]).map(Number));
    return `<div class="actual-grid">${p.actual.balls.map(n=>{
      const cls=logic.has(Number(n))&&anti.has(Number(n))?'both-hit':logic.has(Number(n))?'logic-hit':anti.has(Number(n))?'anti-hit':'';
      return `<span class="${cls}">${pad(n)}</span>`;
    }).join('')}</div>`;
  }
  function comboPayout(c){return payoutFor(c.size,(c.hits||[]).length)}
  function combosHtml(combos,settled=false){
    return (combos||[]).map(c=>{
      const hits=(c.hits||[]).map(Number),hitSet=new Set(hits);
      const amount=settled?comboPayout(c):0;
      const perfect=settled&&hits.length===Number(c.size);
      const winning=settled&&amount>0;
      const cls=`combo ${perfect?'combo-perfect ':''}${winning?'combo-win':''}`;
      return `<div class="${cls}">
        <div class="combo-head"><b>${perfect?'🔥 ':''}${c.id}</b><span>К${c.size}${settled?` · ${hits.length}/${c.size}`:''}</span></div>
        <div class="combo-balls">${(c.numbers||[]).map(n=>`<span class="${hitSet.has(Number(n))?'hit':''}">${pad(n)}</span>`).join('')}</div>
        ${settled?`<div class="combo-result">${hits.length?`попали: ${hits.map(pad).join(', ')}`:'совпадений нет'}${winning?` · <b>${rub(amount)}</b>`:''}</div>`:''}
      </div>`;
    }).join('');
  }
  function totalsFor(p,side){
    const combos=side==='logic'?p.logicCombos:p.antiCombos;
    return (combos||[]).reduce((s,c)=>s+comboPayout(c),0);
  }
  function weightsHtml(p){
    if(!p.learnedWeights||!p.weights)return '<div class="small">Весовые изменения не записаны.</div>';
    const labels={transition:'переходы',spatial:'пространство',balance:'баланс',assembly:'М1–М20',analog:'история'};
    return `<div class="weight-grid">${Object.keys(labels).map(k=>{
      const a=Number(p.weights[k]||0),b=Number(p.learnedWeights[k]||0),d=b-a;
      return `<div><span>${labels[k]}</span><b>${a.toFixed(3)} → ${b.toFixed(3)}</b><em class="${d>0?'up':d<0?'down':''}">${d>=0?'+':''}${d.toFixed(3)}</em></div>`;
    }).join('')}</div>`;
  }

  function archiveDetail(p){
    if(!p.actual)return `<div class="archive-open"><div class="wait-big">⏳ ОЖИДАЕТ ТИРАЖ №${p.targetDraw}</div>
      <div class="small">Прогноз уже зафиксирован. После появления результата здесь откроются фактические числа, LOGIC, ANTILOGIC, комбинации, выплаты и изменение весов.</div></div>`;
    const logicTotal=totalsFor(p,'logic'),antiTotal=totalsFor(p,'anti');
    return `<div class="archive-open">
      <div class="archive-title">ФАКТ №${p.actual.draw} · ${showDate(p.actual.date)} ${p.actual.time||''}</div>
      <div class="legend-mini"><span class="lg">LOGIC</span><span class="an">ANTILOGIC</span><span class="bo">оба</span></div>
      ${actualHtml(p)}

      <div class="archive-side logic-side">
        <div class="archive-side-head"><b>🔥 LOGIC</b><span>POOL ${(p.poolHits||[]).length}/20</span></div>
        ${poolHtml(p.pool20,p.poolHits)}
        <div class="label archive-sub">К3 · К4 · К5</div>
        ${combosHtml(p.logicCombos,true)}
        <div class="payout-total">ИТОГ LOGIC: <b>${rub(logicTotal)}</b></div>
      </div>

      <div class="archive-side anti-side">
        <div class="archive-side-head"><b>🔥 ANTILOGIC</b><span>ANTI ${(p.antiHits||[]).length}/20</span></div>
        ${poolHtml(p.anti20,p.antiHits)}
        <div class="label archive-sub">К3 · К4 · К5</div>
        ${combosHtml(p.antiCombos,true)}
        <div class="payout-total">ИТОГ ANTILOGIC: <b>${rub(antiTotal)}</b></div>
      </div>

      <div class="grand-total">💰 ОБЩИЙ ИТОГ: <b>${rub(logicTotal+antiTotal)}</b></div>

      <div class="label archive-sub">🧠 ОБУЧЕНИЕ ВЕСОВ</div>${weightsHtml(p)}
      <div class="small archive-foot">Проверен: ${p.settledAt?new Date(p.settledAt).toLocaleString('ru-RU'):'—'}</div>
    </div>`;
  }

  async function renderArchive(){
    const box=$('fingerprintResult');
    const list=(await combinedArchive()).slice().reverse();
    if(!list.length){
      box.innerHTML='<div class="row small">Серверный архив FINGERPRINT пока не создан. После первого успешного GitHub Action появится прогноз.</div>';
      return;
    }
    box.innerHTML=list.slice(0,80).map(p=>`
      <button class="archive-item ${p.actual?'settled':'waiting'}" data-archive-draw="${p.targetDraw}">
        <div><b>№${p.targetDraw}</b> · после №${p.sourceDraw}${p.actual?` · POOL ${(p.poolHits||[]).length}/20 · ANTI ${(p.antiHits||[]).length}/20`:' · ⏳ ожидает'}</div>
        <div class="small">${p.actual?'проверен и обучен':'зафиксирован'} · ${p.server?'SERVER':'старый локальный архив'} · ${new Date(p.createdAt).toLocaleString('ru-RU')}</div>
        <div class="archive-chevron">⌄</div>
      </button>
      <div class="archive-detail" id="archive-${p.targetDraw}"></div>`).join('');
    box.querySelectorAll('[data-archive-draw]').forEach(btn=>btn.addEventListener('click',()=>{
      const target=Number(btn.dataset.archiveDraw),detail=$(`archive-${target}`);
      const already=detail.innerHTML.trim();
      box.querySelectorAll('.archive-detail').forEach(x=>{if(x!==detail)x.innerHTML=''});
      box.querySelectorAll('.archive-item').forEach(x=>{if(x!==btn)x.classList.remove('expanded')});
      if(already){detail.innerHTML='';btn.classList.remove('expanded');return}
      const pred=archiveLookup.get(target);
      detail.innerHTML=archiveDetail(pred);btn.classList.add('expanded');
    }));
  }

  async function renderFingerprint(){
    const box=$('fingerprintResult');
    if(!draws.length){box.innerHTML='';return}
    if(fpMode==='archive'){await renderArchive();return}
    try{
      const p=getServerForecast();
      if(!p){
        box.innerHTML='<div class="row small">⏳ SERVER FINGERPRINT ещё не инициализирован. Нужен один успешный запуск GitHub Action.</div>';
        return;
      }
      const anti=fpMode==='antilogic',pool=anti?p.anti20:p.pool20,combos=anti?p.antiCombos:p.logicCombos;
      const weights=serverState?.weights||p.weights||ENGINE?.DEFAULT_WEIGHTS||{};
      const bootstrapCount=Number(serverState?.bootstrapCount||0),learningCount=Number(serverState?.settledCount||0);
      box.innerHTML=`<div class="row"><strong>🎯 SERVER / ⏳−1 · после №${p.sourceDraw} → №${p.targetDraw}</strong>
        <div class="small">🧠 обучение: архив ${bootstrapCount} + серверных ${learningCount} · ${serverFingerprintOnline?'GitHub SERVER':'кэш SERVER'}</div></div>
        <div class="signal-grid">
          <div class="signal"><b>${p.transition?.count||0}/20</b><span>переходов</span></div>
          <div class="signal"><b>${Number(p.matrix?.meanDistance||0).toFixed(2)}</b><span>средний Manhattan</span></div>
          <div class="signal"><b>${p.neighborsCount||0}</b><span>исторических состояний</span></div>
          <div class="signal"><b>${Number(weights.analog||0).toFixed(3)}</b><span>вес истории после обучения</span></div>
        </div>
        <div class="label" style="margin-top:12px">${anti?'ANTILOGIC-20':'POOL-20'}</div>${poolHtml(pool)}
        <div class="label" style="margin-top:12px">К3 · К4 · К5</div>${combosHtml(combos)}`;
    }catch(error){console.error(error);box.innerHTML=`<div class="row small">Ошибка SERVER FINGERPRINT: ${String(error?.message||error)}</div>`}
  }

  function renderMatrix(){
    const r=ENGINE.matrixReport(draws),f=r.features,cur=draws.at(-1),set=new Set(cur.balls),tr=new Set(r.transition.numbers);
    const phasePct=Math.max(5,Math.min(95,50-r.delta*14));
    $('matrixResult').innerHTML=`<div class="row"><b>Тираж №${r.draw}</b> · ${showDate(r.date)} ${r.time||''}</div>
    <div class="signal-grid">
      <div class="signal"><b>${r.phase}</b><span>фаза поля</span></div>
      <div class="signal"><b>${r.arrow}</b><span>движение центра</span></div>
      <div class="signal"><b>${f.density.toFixed(3)}</b><span>плотность D≤2</span></div>
      <div class="signal"><b>${f.imbalance.toFixed(2)}</b><span>перекос квадрантов</span></div>
    </div>
    <div class="row"><strong>Сжатие ↔ разжатие</strong><div class="meter"><span style="width:${phasePct}%"></span></div><div class="small">Δ среднего Manhattan: ${r.delta>=0?'+':''}${r.delta.toFixed(3)}</div></div>
    <div class="matrix-grid">${Array.from({length:80},(_,i)=>i+1).map(n=>`<div class="cell ${set.has(n)?'on':''} ${tr.has(n)?'transition':''}">${n}</div>`).join('')}</div>`;
  }
  function listAssembly(title,items){
    return `<div class="label" style="margin-top:11px">${title}</div>${items.slice(0,5).map(x=>`<div class="row"><b>${x.kind==='H'?'↔':'↕'} ${x.kind==='H'?`М${x.place}–М${x.place+x.length-1}`:`М${x.place}`}</b><div>${(x.numbers||[]).map(pad).join(' · ')}</div><div class="small">сила ${Number(x.score||0).toFixed(3)}</div></div>`).join('')||'<div class="row small">Сильных сигналов нет.</div>'}`;
  }
  function renderAssembly(){
    const r=ENGINE.assemblyReport(draws);
    $('assemblyResult').innerHTML=`<div class="row"><b>Тираж №${r.draw}</b> · ${showDate(r.date)} ${r.time||''}<div class="small">Места считаются по порядку выпадения М1–М20.</div></div>${listAssembly('ГОРИЗОНТАЛИ',r.horizontal)}${listAssembly('ВЕРТИКАЛИ',r.vertical)}`;
  }

  function updatePanelButtons(){
    document.querySelectorAll('[data-panel],[data-open]').forEach(b=>{
      const id=b.dataset.panel||b.dataset.open,open=$(id)?.classList.contains('show');
      b.classList.toggle('tool-open',!!open);b.setAttribute('aria-expanded',open?'true':'false');
    });
    const fpOpen=$('fingerprintPanel').classList.contains('show');
    const collapse=$('fingerprintCollapse');
    if(collapse){collapse.textContent=fpOpen?'▴ СВЕРНУТЬ':'▾ РАЗВЕРНУТЬ'}
  }
  function closePanel(id){$(id)?.classList.remove('show');updatePanelButtons()}
  function openPanel(id){
    document.querySelectorAll('.panel').forEach(p=>{if(p.id!==id)p.classList.remove('show')});
    const p=$(id);p.classList.toggle('show');updatePanelButtons();
    if(!p.classList.contains('show'))return;
    if(id==='fingerprintPanel')renderFingerprint().catch(console.error);
    if(id==='matrixPanel')renderMatrix();
    if(id==='assemblyPanel')renderAssembly();
    setTimeout(()=>p.scrollIntoView({behavior:'smooth',block:'start'}),30);
  }

  function startAuto(){
    clearInterval(timer);timer=null;
    const ms=Number(localStorage.getItem(STORE.interval)||300000);
    if(ms)timer=setInterval(()=>refresh(false),ms);
  }
  async function refresh(scrollTop=false){
    $('status').textContent='Проверяю новый тираж…';
    await fetchFresh().catch(()=>{});
    if(scrollTop)window.scrollTo({top:0,behavior:'smooth'});
  }

  function openSettings(){
    $('sourceUrl').value=localStorage.getItem(STORE.source)||DEFAULT_SOURCE;
    $('interval').value=localStorage.getItem(STORE.interval)||'300000';
    $('settings').showModal();
  }

  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-mode]').forEach(x=>x.classList.remove('on'));b.classList.add('on');mode=b.dataset.mode;renderCards();
  }));
  document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closePanel(b.dataset.close)));
  $('fingerprintCollapse')?.addEventListener('click',()=>closePanel('fingerprintPanel'));
  document.querySelector('[data-home]').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
  document.querySelectorAll('[data-fp-mode]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-fp-mode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');fpMode=b.dataset.fpMode;renderFingerprint().catch(console.error);
  }));
  $('syncBtn').addEventListener('click',()=>refresh(true));$('syncBtn2').addEventListener('click',()=>refresh(true));
  $('settingsBtn').addEventListener('click',()=>openSettings());
  $('saveSettings').addEventListener('click',()=>{
    localStorage.setItem(STORE.source,$('sourceUrl').value.trim()||DEFAULT_SOURCE);
    localStorage.setItem(STORE.interval,$('interval').value);
    startAuto();setTimeout(()=>refresh(false),0);
  });

  updatePanelButtons();startAuto();fetchFresh().catch(()=>{});
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=6500',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}));
  }
})();
