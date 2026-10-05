'use strict';
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
  function fresh(file){return `${RAW}${file}?v=6600&t=${Date.now()}`}
  try{localStorage.removeItem('pozitron_v63_source')}catch{}
  window.fetch=(input,init={})=>{
    const raw=typeof input==='string'?input:(input?.url||'');
    let url;try{url=new URL(raw,location.href)}catch{return nativeFetch(input,init)}
    const file=fileOf(url.href);
    if(SERVER_FILES.has(file))return nativeFetch(fresh(file),{...init,cache:'no-store'});
    return nativeFetch(input,init);
  };
})();
