'use strict';

const CACHE='pozitron-v63-app-6319';
const REPO_RAW='https://raw.githubusercontent.com/arsazet17/arsazet17-pozitron-keno-v63/main/';

const STATIC_ASSETS=[
  './','./index.html','./styles-v63.css?v=6319','./archive-v63.css?v=6319',
  './version-v63.js?v=6319','./storage-v63.js?v=6319','./engine-v63.js?v=6319','./sync-v63-client.js?v=6319','./app-v63.js?v=6319',
  './iris-engine-v63.js?v=6319','./iris-ui-v63.js?v=6319','./iris-v63.css?v=6319',
  './network80-engine-v63.js?v=6319','./network80-ui-v63.js?v=6319','./network80-v63.css?v=6319',
  './iris-archive-beauty.js?v=6319','./iris-archive-beauty.css?v=6319','./iris-waves-v63.js?v=6319',
  './iris-scroll-stability-v637.js?v=6319','./iris-mobile-fix-v637.css?v=6319',
  './manifest.webmanifest?v=6319','./icon.svg?v=6319'
];

const SERVER_FILES=new Set([
  'iris-archive-v63.json','keno-history-v63.json','fingerprint-state-v63.json',
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
