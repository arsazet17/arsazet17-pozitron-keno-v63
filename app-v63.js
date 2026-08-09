'use strict';
(() => {
  const $=id=>document.getElementById(id);
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
  const STORE={draws:'pozitron_v63_draws',source:'pozitron_v63_source',interval:'pozitron_v63_interval'};
  const DEFAULT_SOURCE='https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';
  let draws=[],mode='fall',timer=null,fpMode='logic',networkReady=false;

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
  function merge(list){
    const map=new Map(draws.map(d=>[d.draw,d]));
    for(const d of list)map.set(d.draw,d);
    draws=[...map.values()].sort((a,b)=>a.draw-b.draw);
  }

  function sumBalls(b){return (b||[]).reduce((a,x)=>a+Number(x),0)}
  function parity(b){const odd=(b||[]).filter(n=>n%2).length;return {odd,even:20-odd}}
  function dominantColumn(b){
    const c=Array(11).fill(0);for(const n of b||[])c[n%10===0?10:n%10]++;
    let best=1;for(let i=2;i<=10;i++)if(c[i]>c[best])best=i;return {column:best,count:c[best]};
  }
  function orderFor(draw){
    if(mode==='asc')return [...draw.balls].sort((a,b)=>a-b);
    return draw.balls.slice();
  }
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
      <div class="draw-head">
        <div>
          <div class="label">${label}</div>
          <div class="draw-no">№${draw.draw}</div>
          <div class="draw-time">${showDate(draw.date)} ${draw.time||''}</div>
          <div class="meta"><span>Σ ${sumBalls(draw.balls)}</span><span>${p.even}/${p.odd}</span><span>${sumBalls(draw.balls)%2?'нечёт':'чёт'}</span></div>
        </div>
        <div class="st">🔴 ст${dc.column}</div>
      </div>
      <div class="numbers">${nums.map(n=>`<div class="ball ${trans.has(Number(n))?'pass':''} ${same.has(Number(n))?'same':''}">${pad(n)}${trans.has(Number(n))?' ◆':''}</div>`).join('')}</div>
      <div class="singletons">${singletonText(draw)}</div>
    </section>`;
  }

  function renderCards(){
    if(!networkReady||draws.length<3)return;
    const last=draws.length-1;
    const labels=['ПРЕДПРЕДЫДУЩИЙ ТИРАЖ','ПРЕДЫДУЩИЙ ТИРАЖ','ПОСЛЕДНИЙ ТИРАЖ'];
    const idx=[last-2,last-1,last];
    $('cards').innerHTML=idx.reverse().map((i,k)=>{
      const lab=k===0?'ПОСЛЕДНИЙ ТИРАЖ':k===1?'ПРЕДЫДУЩИЙ ТИРАЖ':'ПРЕДПРЕДЫДУЩИЙ ТИРАЖ';
      return drawCard(draws[i],draws[i-1],lab);
    }).join('');
  }

  async function fetchFresh(){
    const source=(localStorage.getItem(STORE.source)||DEFAULT_SOURCE).trim();
    const local='./keno-history-v63.json';
    const sources=[local,source].filter((x,i,a)=>x&&a.indexOf(x)===i);
    let best=[],err=null;
    for(const url of sources){
      try{
        const sep=url.includes('?')?'&':'?';
        const r=await fetch(`${url}${sep}v=63&t=${Date.now()}`,{cache:'no-store'});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const arr=parse(await r.text());
        if(arr.length>best.length)best=arr;
      }catch(e){err=e}
    }
    if(best.length){
      draws=[];merge(best);saveLocal();networkReady=true;
      $('status').textContent=`v6.3 · база: ${draws.length.toLocaleString('ru-RU')} · последний №${draws.at(-1).draw}`;
      renderAll();
      return true;
    }
    const backup=loadLocal();
    if(backup.length>=3){
      draws=backup.sort((a,b)=>a.draw-b.draw);networkReady=true;
      $('status').textContent=`⚠ ОФЛАЙН · сохранено до №${draws.at(-1).draw}`;
      renderAll();
      return false;
    }
    $('status').textContent='Нет связи и нет локальной резервной базы';
    $('cards').innerHTML='<section class="card"><b>Не удалось получить историю тиражей.</b><div class="small">Проверьте интернет и нажмите ↻.</div></section>';
    throw err||new Error('Нет данных');
  }

  function renderAll(){
    renderCards();
    if($('fingerprintPanel').classList.contains('show'))renderFingerprint();
    if($('matrixPanel').classList.contains('show'))renderMatrix();
    if($('assemblyPanel').classList.contains('show'))renderAssembly();
  }

  function poolHtml(nums){return `<div class="pool">${(nums||[]).map(n=>`<span>${pad(n)}</span>`).join('')}</div>`}
  function combosHtml(combos){return (combos||[]).map(c=>`<div class="combo"><div class="combo-head"><b>${c.id}</b><span>К${c.size}</span></div><div class="combo-numbers">${c.numbers.map(pad).join(' · ')}</div></div>`).join('')}
  function renderFingerprint(){
    const box=$('fingerprintResult');if(!draws.length){box.innerHTML='';return}
    window.POZITRON_V63_ENGINE.settleAndLearn(draws);
    if(fpMode==='archive'){
      const list=window.POZITRON_V63_ENGINE.loadPredictions().slice().reverse();
      box.innerHTML=list.length?list.slice(0,30).map(p=>{
        const hit=p.poolHits?.length;
        return `<div class="archive-item"><b>№${p.targetDraw}</b> · после №${p.sourceDraw}${p.actual?` · POOL ${hit}/20`:' · ⏳ ожидает'}<div class="small">${p.actual?'проверен':'зафиксирован'} · ${new Date(p.createdAt).toLocaleString('ru-RU')}</div></div>`;
      }).join(''):'<div class="row small">Архив FINGERPRINT пока пуст.</div>';
      return;
    }
    const f=window.POZITRON_V63_ENGINE.forecast(draws);
    if(!f){box.innerHTML='<div class="row small">Недостаточно истории для расчёта.</div>';return}
    const anti=fpMode==='antilogic';
    const nums=anti?f.anti20:f.pool20,combos=anti?f.antiCombos:f.logicCombos;
    box.innerHTML=`<div class="row"><b>🎯 / ⏳−1 · после №${f.sourceDraw}</b><div class="small">Прогноз фиксируется до следующего тиража. ${anti?'ANTILOGIC — альтернативные кандидаты вне основного POOL.':'LOGIC — итог согласования независимых сигналов.'}</div></div>
      <div class="signal-grid">
        <div class="signal"><b>${f.transition.count}/20</b><span>переходов</span></div>
        <div class="signal"><b>${f.matrix.meanDistance.toFixed(2)}</b><span>средний Manhattan</span></div>
        <div class="signal"><b>${f.neighbors.length}</b><span>исторических состояний</span></div>
        <div class="signal"><b>${f.weights.analog.toFixed(2)}</b><span>вес истории после обучения</span></div>
      </div>
      <div class="label" style="margin-top:12px">${anti?'ANTILOGIC-20':'POOL-20'}</div>${poolHtml(nums)}
      <div class="label" style="margin-top:12px">К3 · К4 · К5</div>${combosHtml(combos)}`;
  }

  function renderMatrix(){
    const r=window.POZITRON_V63_ENGINE.matrixReport(draws),f=r.features,cur=draws.at(-1),set=new Set(cur.balls),tr=new Set(r.transition.numbers);
    const phasePct=Math.max(5,Math.min(95,50-r.delta*14));
    $('matrixResult').innerHTML=`<div class="signal-grid">
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
    const r=window.POZITRON_V63_ENGINE.assemblyReport(draws);
    $('assemblyResult').innerHTML=`<div class="row"><b>Тираж №${r.draw}</b><div class="small">Места считаются по порядку выпадения М1–М20.</div></div>${listAssembly('ГОРИЗОНТАЛИ',r.horizontal)}${listAssembly('ВЕРТИКАЛИ',r.vertical)}`;
  }

  function openPanel(id){
    document.querySelectorAll('.panel').forEach(p=>{if(p.id!==id)p.classList.remove('show')});
    const p=$(id);p.classList.toggle('show');
    if(!p.classList.contains('show'))return;
    if(id==='fingerprintPanel')renderFingerprint();
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

  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-mode]').forEach(x=>x.classList.remove('on'));b.classList.add('on');mode=b.dataset.mode;renderCards();
  }));
  document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).classList.remove('show')));
  document.querySelector('[data-home]').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
  document.querySelectorAll('[data-fp-mode]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-fp-mode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');fpMode=b.dataset.fpMode;renderFingerprint();
  }));
  $('syncBtn').addEventListener('click',()=>refresh(true));$('syncBtn2').addEventListener('click',()=>refresh(true));
  $('settingsBtn').addEventListener('click',()=>{
    $('sourceUrl').value=localStorage.getItem(STORE.source)||DEFAULT_SOURCE;
    $('interval').value=localStorage.getItem(STORE.interval)||'300000';
    $('settings').showModal();
  });
  $('saveSettings').addEventListener('click',()=>{
    localStorage.setItem(STORE.source,$('sourceUrl').value.trim()||DEFAULT_SOURCE);
    localStorage.setItem(STORE.interval,$('interval').value);
    startAuto();setTimeout(()=>refresh(false),0);
  });

  // ВАЖНО: при старте НЕ вызываем render() из localStorage.
  // Сначала сеть; localStorage используется только внутри fetchFresh() при ошибке сети.
  startAuto();
  fetchFresh().catch(()=>{});

  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{}));
  }
})();
