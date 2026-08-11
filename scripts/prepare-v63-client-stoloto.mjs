import fs from 'node:fs/promises';

async function read(file){ return await fs.readFile(file,'utf8'); }
async function write(file,text){ await fs.writeFile(file,text); }

function mustReplace(text, from, to, label) {
  if (text.includes(to)) return text; // уже исправлено
  if (!text.includes(from)) throw new Error(`CLIENT PATCH FAIL: не найден блок ${label}`);
  return text.replace(from, to);
}

function mustRegex(text, rx, to, label, alreadyMarker='') {
  if (alreadyMarker && text.includes(alreadyMarker)) return text;
  if (!rx.test(text)) throw new Error(`CLIENT PATCH FAIL: не найден блок ${label}`);
  return text.replace(rx, to);
}

let app = await read('app-v63.js');

app = mustReplace(
  app,
  "const DEFAULT_SOURCE='https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';",
  "const DEFAULT_SOURCE='./keno-history-v63.json';",
  'DEFAULT_SOURCE'
);

app = mustReplace(
  app,
  "    const result={draw,date,time,balls};\n    const column=Number(o?.column??o?.officialColumn);",
  "    const result={draw,date,time,balls};\n" +
  "    const officialParity=String(o?.parity??o?.parityLabel??o?.oddEvenLabel??'').trim();\n" +
  "    if(['Больше чётных','Больше нечётных','Поровну'].includes(officialParity))result.parity=officialParity;\n" +
  "    if(o?.source)result.source=String(o.source);\n" +
  "    const column=Number(o?.column??o?.officialColumn);",
  'официальная parity'
);

app = mustReplace(
  app,
  "function saveLocal(){try{localStorage.setItem(STORE.draws,JSON.stringify(draws.slice(-35000)))}catch{}}",
  "function saveLocal(){try{localStorage.setItem(STORE.draws,JSON.stringify(draws.slice(-800)))}catch{}}",
  'localStorage -800'
);

// Убираем собственный пересчёт чётности и столбца полностью.
app = mustRegex(
  app,
  /  function parity\(b\)\{[\s\S]*?\n  function orderFor\(draw\)\{/,
  "  function orderFor(draw){",
  'parity/dominantColumn',
  "const officialParity=String(draw?.parity||'').trim();"
);

// Карточка использует только официальные поля Столото.
app = mustRegex(
  app,
  /    const same=samePositions\(draw\),p=parity\(draw\.balls\);[\s\S]*?    const nums=orderFor\(draw\);/,
  "    const same=samePositions(draw);\n" +
  "    const officialParity=String(draw?.parity||'').trim();\n" +
  "    const officialColumn=Number(draw?.column);\n" +
  "    const parityText=['Больше чётных','Больше нечётных','Поровну'].includes(officialParity)?officialParity:'чёт/нечёт: —';\n" +
  "    const columnText=(Number.isInteger(officialColumn)&&officialColumn>=1&&officialColumn<=10)?`🔴 ст${officialColumn}`:'🔴 ст—';\n" +
  "    const nums=orderFor(draw);",
  'drawCard official fields',
  "const columnText=(Number.isInteger(officialColumn)"
);

app = mustReplace(
  app,
  "        <div class=\"meta\"><span>Σ ${sumBalls(draw.balls)}</span><span>${p.even}/${p.odd}</span><span>${sumBalls(draw.balls)%2?'нечёт':'чёт'}</span></div>\n      </div><div class=\"st\">🔴 ст${dc.column}</div></div>",
  "        <div class=\"meta\"><span>Σ ${sumBalls(draw.balls)}</span><span>${parityText}</span></div>\n      </div><div class=\"st\">${columnText}</div></div>",
  'drawCard meta'
);

// История читается только из локального keno-history-v63.json.
app = mustRegex(
  app,
  /  async function fetchFresh\(\)\{[\s\S]*?\n  \}\n\n  function renderAll\(\)\{/,
  `  async function fetchFresh(){
    const url='./keno-history-v63.json';
    let err=null;
    try{
      const sep=url.includes('?')?'&':'?';
      const r=await fetch(\`\${url}\${sep}v=6600&t=\${Date.now()}\`,{cache:'no-store'});
      if(!r.ok)throw new Error(\`HTTP \${r.status}\`);
      const arr=parse(await r.text());
      if(arr.length){
        draws=arr.sort((a,b)=>a.draw-b.draw);
        saveLocal();networkReady=true;
        if(DBSTORE)await DBSTORE.saveDraws(draws).catch(()=>{});
        await fetchFingerprintServer();
        $('status').textContent=\`v6.3 STOLOTO SERVER · база: \${draws.length.toLocaleString('ru-RU')} · последний №\${draws.at(-1).draw}\`;
        renderAll();return true;
      }
      throw new Error('Локальная серверная история пуста');
    }catch(e){err=e}
    const backup=loadLocal();
    if(backup.length>=3){
      draws=backup.sort((a,b)=>a.draw-b.draw);networkReady=true;
      await fetchFingerprintServer();
      $('status').textContent=\`⚠ ОФЛАЙН · сохранено до №\${draws.at(-1).draw}\`;renderAll();return false;
    }
    $('status').textContent='Нет связи и нет локальной резервной базы';
    $('cards').innerHTML='<section class="card"><b>Не удалось получить историю тиражей.</b><div class="small">Проверьте интернет и нажмите ↻.</div></section>';
    throw err||new Error('Нет данных');
  }

  function renderAll(){`,
  'fetchFresh local-only',
  "v6.3 STOLOTO SERVER"
);

app = mustRegex(
  app,
  /  function openSettings\(\)\{[\s\S]*?  \}\n\n  document\.querySelectorAll\('\[data-mode\]'\)/,
  `  function openSettings(){
    localStorage.removeItem(STORE.source);
    $('sourceUrl').value=DEFAULT_SOURCE;
    $('sourceUrl').disabled=true;
    $('interval').value=localStorage.getItem(STORE.interval)||'300000';
    $('settings').showModal();
  }

  document.querySelectorAll('[data-mode]')`,
  'openSettings',
  "$('sourceUrl').disabled=true"
);

app = mustReplace(
  app,
  "  $('saveSettings').addEventListener('click',()=>{\n    localStorage.setItem(STORE.source,$('sourceUrl').value.trim()||DEFAULT_SOURCE);\n    localStorage.setItem(STORE.interval,$('interval').value);",
  "  $('saveSettings').addEventListener('click',()=>{\n    localStorage.removeItem(STORE.source);\n    localStorage.setItem(STORE.interval,$('interval').value);",
  'saveSettings'
);

app = app.replace("./sw.js?v=6500", "./sw.js?v=6600");

for (const forbidden of ['keno-history-v62.json','pozitron-keno-v5','lucky-numbers.ru']) {
  if (app.includes(forbidden)) throw new Error(`CLIENT PATCH FAIL: app-v63.js ещё содержит ${forbidden}`);
}
if (app.includes('dominantColumn(') || app.includes('function parity(')) {
  throw new Error('CLIENT PATCH FAIL: остался собственный пересчёт столбца/чётности');
}
await write('app-v63.js', app);

// IndexedDB: небольшой хвост + официальные поля.
let storage = await read('storage-v63.js');
storage = mustReplace(storage, "const clean=(draws||[]).slice(-500);", "const clean=(draws||[]).slice(-800);", 'IndexedDB -800');
storage = mustReplace(
  storage,
  "      clean.forEach(d=>s.put({draw:Number(d.draw),date:d.date||'',time:d.time||'',balls:(d.balls||[]).map(Number)}));",
  "      clean.forEach(d=>s.put({draw:Number(d.draw),date:d.date||'',time:d.time||'',balls:(d.balls||[]).map(Number),column:Number(d.column)||null,columnSource:d.columnSource||'',parity:d.parity||'',source:d.source||''}));",
  'IndexedDB official fields'
);
await write('storage-v63.js', storage);

// sync-v63-client: только файлы собственного SERVER 6.3.
const sync = `'use strict';
(() => {
  const nativeFetch=window.fetch.bind(window);
  const RAW='https://raw.githubusercontent.com/arsazet17/arsazet17-pozitron-keno-v63/main/';
  const SERVER_FILES=new Set([
    'keno-history-v63.json',
    'fingerprint-state-v63.json',
    'fingerprint-archive-v63.json',
    'keno-status-v63.json'
  ]);
  function fileOf(url){try{return new URL(url,location.href).pathname.split('/').filter(Boolean).pop()||''}catch{return ''}}
  function fresh(file){return \`\${RAW}\${file}?v=6600&t=\${Date.now()}\`}
  try{localStorage.removeItem('pozitron_v63_source')}catch{}
  window.fetch=(input,init={})=>{
    const raw=typeof input==='string'?input:(input?.url||'');
    let url;try{url=new URL(raw,location.href)}catch{return nativeFetch(input,init)}
    const file=fileOf(url.href);
    if(SERVER_FILES.has(file))return nativeFetch(fresh(file),{...init,cache:'no-store'});
    return nativeFetch(input,init);
  };
})();
`;
await write('sync-v63-client.js', sync);

// Service Worker: никакой 6.2/Lucky логики, серверные JSON всегда свежие.
const sw = `'use strict';

const CACHE='pozitron-v63-stoloto-6600';
const REPO_RAW='https://raw.githubusercontent.com/arsazet17/arsazet17-pozitron-keno-v63/main/';

const STATIC_ASSETS=[
  './','./index.html','./styles-v63.css','./archive-v63.css',
  './storage-v63.js','./engine-v63.js','./sync-v63-client.js','./app-v63.js',
  './manifest.webmanifest','./icon.svg'
];

const SERVER_FILES=new Set([
  'keno-history-v63.json','fingerprint-state-v63.json',
  'fingerprint-archive-v63.json','keno-status-v63.json'
]);

function freshRaw(file){return REPO_RAW+file+'?v=6600&t='+Date.now()}
async function fetchFreshRaw(file,fallbackRequest){
  try{
    const response=await fetch(freshRaw(file),{cache:'no-store',headers:{'cache-control':'no-cache'}});
    if(!response.ok)throw new Error('RAW HTTP '+response.status);
    return response;
  }catch{
    return fetch(fallbackRequest,{cache:'no-store'});
  }
}

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC_ASSETS)).catch(()=>{}));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    for(const key of await caches.keys())if(key!==CACHE)await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  const file=url.pathname.split('/').filter(Boolean).pop()||'';
  if(SERVER_FILES.has(file)){
    event.respondWith(fetchFreshRaw(file,event.request));
    return;
  }
  if(file.endsWith('.json')||url.origin!==self.location.origin){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return;
  }
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request,{cache:'no-store'});
      if(response&&response.ok){
        const cache=await caches.open(CACHE);
        cache.put(event.request,response.clone()).catch(()=>{});
      }
      return response;
    }catch{
      const cache=await caches.open(CACHE);
      return (await cache.match(event.request))||(await cache.match('./index.html'));
    }
  })());
});
`;
await write('sw.js', sw);

// index: фиксированный серверный источник + cache bust 6600.
let index = await read('index.html');
index = index.replaceAll('?v=6505','?v=6600');
index = index.replace(
  '<label class="small">Дополнительный источник истории</label><input id="sourceUrl" placeholder="необязательно">',
  '<label class="small">Источник истории</label><input id="sourceUrl" value="./keno-history-v63.json" readonly>'
);
index = index.replace(
  'СБОРКА 6.3 · SERVER LEARNING · ЖИВАЯ ПРОВЕРКА',
  'СБОРКА 6.3 · STOLOTO · SERVER LEARNING · ЖИВАЯ ПРОВЕРКА'
);
await write('index.html', index);

console.log('CLIENT PATCH PASS: app/storage/sync/sw/index переведены на локальный KENO 6.3 + Столото.');
