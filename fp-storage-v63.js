'use strict';
(() => {
  const DB_NAME='pozitron_v63_db';
  const DB_VER=1;
  const STORE='fingerprintArchive';
  const LIVE='https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VER);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'targetDraw'});};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'));
    });
  }
  async function idbPut(value){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');
      tx.objectStore(STORE).put(value);
      tx.oncomplete=()=>{db.close();resolve(true)};
      tx.onerror=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write failed'))};
      tx.onabort=()=>{const e=tx.error;db.close();reject(e||new Error('IndexedDB write aborted'))};
    });
  }
  async function idbAll(){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly');
      const req=tx.objectStore(STORE).getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error||new Error('IndexedDB read failed'));
      tx.oncomplete=()=>db.close();
    });
  }
  async function fetchDraws(){
    const r=await fetch(`${LIVE}?fp=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const j=await r.json();
    const arr=Array.isArray(j)?j:(j.draws||j.records||j.history||[]);
    return arr.map(o=>({draw:Number(o.draw??o.number??o.drawNumber??o.id),date:o.date??o.drawDate??'',time:o.time??o.drawTime??'',balls:(o.balls??o.numbers??o.results??o.result??o.winningNumbers??[]).map(Number)}))
      .filter(d=>Number.isFinite(d.draw)&&d.balls.length===20).sort((a,b)=>a.draw-b.draw);
  }
  function compactForecast(f){
    return {version:'6.3-idb',sourceDraw:Number(f.sourceDraw),targetDraw:Number(f.targetDraw),createdAt:f.createdAt||new Date().toISOString(),pool20:(f.pool20||[]).slice(),anti20:(f.anti20||[]).slice(),logicCombos:(f.logicCombos||[]).map(c=>({id:c.id,size:c.size,numbers:(c.numbers||[]).slice()})),antiCombos:(f.antiCombos||[]).map(c=>({id:c.id,size:c.size,numbers:(c.numbers||[]).slice()}))};
  }
  function status(text,ok=true){
    const box=document.getElementById('fingerprintResult');
    const small=box?.querySelector('.row .small');
    if(small)small.innerHTML=`${ok?'✅':'❌'} ${text}`;
  }
  async function saveForecast(f){
    try{
      if(!f)throw new Error('прогноз не передан');
      const rec=compactForecast(f);
      const existing=(await idbAll()).find(x=>Number(x.targetDraw)===rec.targetDraw);
      await idbPut({...existing,...rec,actual:existing?.actual});
      status(`Прогноз №${rec.targetDraw} записан в архив IndexedDB.`);
    }catch(e){status(`АРХИВ IndexedDB: ${e?.name||'Error'} · ${e?.message||String(e)}`,false);}
  }
  async function settle(records,draws){
    const by=new Map(draws.map(d=>[Number(d.draw),d]));
    for(const r of records){
      if(r.actual||!by.has(Number(r.targetDraw)))continue;
      const d=by.get(Number(r.targetDraw)),set=new Set(d.balls.map(Number));
      r.actual={draw:d.draw,date:d.date,time:d.time,balls:d.balls.slice()};
      r.poolHits=(r.pool20||[]).filter(n=>set.has(Number(n)));
      r.antiHits=(r.anti20||[]).filter(n=>set.has(Number(n)));
      r.logicCombos=(r.logicCombos||[]).map(c=>({...c,hits:(c.numbers||[]).filter(n=>set.has(Number(n)))}));
      r.antiCombos=(r.antiCombos||[]).map(c=>({...c,hits:(c.numbers||[]).filter(n=>set.has(Number(n)))}));
      await idbPut(r);
    }
  }
  async function renderArchive(liveDraws){
    const box=document.getElementById('fingerprintResult');if(!box)return;
    try{
      const appDraws=Array.isArray(liveDraws)?liveDraws.filter(d=>d&&Number.isFinite(Number(d.draw))&&Array.isArray(d.balls)&&d.balls.length===20):[];
      const draws=appDraws.length?appDraws:await fetchDraws();
      const records0=await idbAll();
      await settle(records0,draws);
      const records=(await idbAll()).sort((a,b)=>Number(b.targetDraw)-Number(a.targetDraw));
      box.innerHTML=records.length?records.slice(0,40).map(r=>{
        const ph=(r.poolHits||[]).length,ah=(r.antiHits||[]).length;
        const bestL=(r.logicCombos||[]).reduce((m,c)=>Math.max(m,(c.hits||[]).length),0),bestA=(r.antiCombos||[]).reduce((m,c)=>Math.max(m,(c.hits||[]).length),0);
        return `<div class="archive-item"><b>№${r.targetDraw}</b> · после №${r.sourceDraw}${r.actual?` · POOL ${ph}/20 · ANTI ${ah}/20`:' · ⏳ ожидает'}<div class="small">${r.actual?`проверен · лучший LOGIC ${bestL} · ANTILOGIC ${bestA}`:'зафиксирован в IndexedDB'} · ${new Date(r.createdAt).toLocaleString('ru-RU')}</div></div>`;
      }).join(''):'<div class="row small">Архив FINGERPRINT пока пуст.</div>';
    }catch(e){box.innerHTML=`<div class="row small">❌ IndexedDB: ${e?.name||'Error'} · ${e?.message||String(e)}</div>`;}
  }

  window.addEventListener('pozitron:fingerprint-forecast',e=>saveForecast(e.detail));
  window.addEventListener('pozitron:fingerprint-archive',e=>renderArchive(e.detail?.draws));
  openDb().then(db=>db.close()).catch(()=>{});
})();
