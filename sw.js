'use strict';
const CACHE='pozitron-v63-clean-6413';
const ASSETS=['./','./index.html','./styles-v63.css','./archive-v63.css','./storage-v63.js','./engine-v63.js','./app-v63.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).catch(()=>{}));});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim();})());});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 e.respondWith((async()=>{try{const r=await fetch(e.request,{cache:'no-store'});if(r&&r.ok){const c=await caches.open(CACHE);c.put(e.request,r.clone()).catch(()=>{});}return r;}catch{const c=await caches.open(CACHE);return (await c.match(e.request))||(await c.match('./index.html'));}})());
});
