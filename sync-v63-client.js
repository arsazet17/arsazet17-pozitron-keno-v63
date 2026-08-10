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

  function fileOf(url){
    try{return new URL(url,location.href).pathname.split('/').filter(Boolean).pop()||''}catch{return ''}
  }
  function fresh(file){return `${RAW}${file}?v=6505&t=${Date.now()}`}

  // Удаляем сохранённую старую ссылку 6.2 из настроек 6.3.
  try{
    const saved=String(localStorage.getItem('pozitron_v63_source')||'');
    if(saved.includes('/pozitron-keno-v5/')||saved.includes('keno-history-v62.json')){
      localStorage.removeItem('pozitron_v63_source');
    }
  }catch{}

  window.fetch=(input,init={})=>{
    const raw=typeof input==='string'?input:(input?.url||'');
    let url;
    try{url=new URL(raw,location.href)}catch{return nativeFetch(input,init)}
    const file=fileOf(url.href);

    // Старую живую базу 6.2 клиент 6.3 больше никогда не использует.
    if(file==='keno-history-v62.json' && url.hostname==='raw.githubusercontent.com' && url.pathname.includes('/arsazet17/pozitron-keno-v5/')){
      return nativeFetch(fresh('keno-history-v63.json'),{...init,cache:'no-store'});
    }

    // История и FINGERPRINT всегда читаются из одного commit-состояния main 6.3.
    if(SERVER_FILES.has(file)){
      return nativeFetch(fresh(file),{...init,cache:'no-store'});
    }

    return nativeFetch(input,init);
  };
})();
