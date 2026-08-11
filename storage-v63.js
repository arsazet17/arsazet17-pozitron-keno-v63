'use strict';
(() => {
  const DB_NAME = 'pozitron_keno_v63_clean';
  const DB_VER = 1;
  const STORES = { meta:'meta', predictions:'predictions', draws:'draws' };

  function openDb(){
    return new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if(!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta,{keyPath:'key'});
        if(!db.objectStoreNames.contains(STORES.predictions)) db.createObjectStore(STORES.predictions,{keyPath:'targetDraw'});
        if(!db.objectStoreNames.contains(STORES.draws)) db.createObjectStore(STORES.draws,{keyPath:'draw'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
  }

  async function tx(store, mode, action){
    const db = await openDb();
    return new Promise((resolve,reject)=>{
      const t = db.transaction(store,mode);
      let req;
      try{ req = action(t.objectStore(store)); }
      catch(e){ db.close(); reject(e); return; }
      if(req){
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
      } else {
        t.oncomplete = () => resolve(true);
      }
      t.oncomplete = () => { try{db.close()}catch{}; if(!req) resolve(true); };
      t.onerror = () => { const e=t.error; try{db.close()}catch{}; reject(e||new Error('IndexedDB transaction failed')); };
      t.onabort = () => { const e=t.error; try{db.close()}catch{}; reject(e||new Error('IndexedDB transaction aborted')); };
    });
  }

  async function setMeta(key,value){ await tx(STORES.meta,'readwrite',s=>s.put({key,value})); return value; }
  async function getMeta(key,fallback=null){
    const rec = await tx(STORES.meta,'readonly',s=>s.get(key));
    return rec?.value ?? fallback;
  }

  async function saveDraws(draws){
    const clean=(draws||[]).slice(-800);
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const t=db.transaction(STORES.draws,'readwrite');
      const s=t.objectStore(STORES.draws);
      s.clear();
      clean.forEach(d=>s.put({draw:Number(d.draw),date:d.date||'',time:d.time||'',balls:(d.balls||[]).map(Number),column:Number(d.column)||null,columnSource:d.columnSource||'',parity:d.parity||'',source:d.source||''}));
      t.oncomplete=resolve; t.onerror=()=>reject(t.error); t.onabort=()=>reject(t.error);
    });
    db.close();
  }

  async function loadDraws(){
    const all=await tx(STORES.draws,'readonly',s=>s.getAll());
    return (all||[]).sort((a,b)=>Number(a.draw)-Number(b.draw));
  }

  async function putPrediction(rec){ await tx(STORES.predictions,'readwrite',s=>s.put(rec)); return rec; }
  async function getPrediction(targetDraw){ return await tx(STORES.predictions,'readonly',s=>s.get(Number(targetDraw))); }
  async function listPredictions(){
    const all=await tx(STORES.predictions,'readonly',s=>s.getAll());
    return (all||[]).sort((a,b)=>Number(a.targetDraw)-Number(b.targetDraw));
  }

  async function clearLegacy(){
    // Старые ключи 6.3 больше не используются. Удаляем только наши собственные legacy-ключи.
    try{
      ['pozitron_v63_draws','pozitron_v63_engine_weights','pozitron_v63_fingerprint_predictions','pozitron_v63_fp_archive_v2']
        .forEach(k=>localStorage.removeItem(k));
    }catch{}
  }

  window.POZITRON_V63_STORE={openDb,setMeta,getMeta,saveDraws,loadDraws,putPrediction,getPrediction,listPredictions,clearLegacy};
})();
