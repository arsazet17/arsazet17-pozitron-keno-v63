'use strict';
const CACHE='pozitron-v63-shell-1';
const SHELL=['./','./index.html','./styles-v63.css','./engine-v63.js','./app-v63.js','./manifest.webmanifest','./icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  const isHistory=/keno-history/i.test(url.pathname);
  if(isHistory){
    // История всегда сеть-сначала. Кэш оболочки не имеет права подменять свежие тиражи.
    event.respondWith(fetch(req,{cache:'no-store'}));
    return;
  }
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).catch(()=>caches.match('./index.html')));
    return;
  }
  if(url.origin===self.location.origin){
    event.respondWith(fetch(req).then(r=>{
      const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy));return r;
    }).catch(()=>caches.match(req)));
  }
});
