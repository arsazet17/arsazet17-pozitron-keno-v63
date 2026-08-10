'use strict';

const CACHE='pozitron-v63-clean-6505';
const REPO_RAW='https://raw.githubusercontent.com/arsazet17/arsazet17-pozitron-keno-v63/main/';

const STATIC_ASSETS=[
  './',
  './index.html',
  './styles-v63.css',
  './archive-v63.css',
  './storage-v63.js',
  './engine-v63.js',
  './sync-v63-client.js',
  './app-v63.js',
  './manifest.webmanifest',
  './icon.svg'
];

const SERVER_FILES=new Set([
  'keno-history-v63.json',
  'fingerprint-state-v63.json',
  'fingerprint-archive-v63.json',
  'keno-status-v63.json'
]);

function freshRaw(file){return REPO_RAW+file+'?t='+Date.now()}
function isOldV62History(url,file){
  return file==='keno-history-v62.json' &&
    url.hostname==='raw.githubusercontent.com' &&
    url.pathname.includes('/arsazet17/pozitron-keno-v5/');
}
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

  if(isOldV62History(url,file)){
    event.respondWith(fetchFreshRaw('keno-history-v63.json',event.request));
    return;
  }
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
