'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const DBSTORE=window.POZITRON_V63_STORE;
  const ENGINE=window.POZITRON_V63_ENGINE;
  const NETWORK80UI=window.POZITRON_V63_NETWORK80_UI;
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
  const STORE={
    draws:'pozitron_v63_draws',
    source:'pozitron_v63_source',
    interval:'pozitron_v63_interval',
    fpState:'pozitron_v63_server_state_cache',
    fpArchive:'pozitron_v63_server_archive_cache',
  };
  const DEFAULT_SOURCE='./keno-history-v63.json';
  const PAYOUTS=Object.freeze({
    k3_2:300,
    k3_3:1500,
    k4_2:100,
    k4_3:300,
    k4_4:3300,
    k5_3:400,
    k5_4:1920,
    k5_5:20000
  });
  let draws=[],mode='fall',timer=null,fpMode='logic',networkReady=false;
  let serverState=null,serverArchive=[],serverFingerprintOnline=false,archiveLookup=new Map();

  function valid(o){
    const draw=Number(o?.draw??o?.number??o?.drawNumber??o?.id);
    const date=normDate(o?.date??o?.drawDate??o?.datetime??'');
    const time=normTime(o?.time??o?.drawTime??o?.datetime??'');
    let balls=o?.balls??o?.numbers??o?.results??o?.result??o?.winningNumbers;
    if(typeof balls==='string')balls=(balls.match(/\d+/g)||[]).map(Number);
    balls=(balls||[]).map(Number).filter(n=>n>=1&&n<=80).slice(0,20);
    if(!Number.isFinite(draw)||balls.length!==20||new Set(balls).size!==20)return null;
    const result={draw,date,time,balls};
    const officialParity=String(o?.parity??o?.parityLabel??o?.oddEvenLabel??'').trim();
    if(['Ð‘Ð¾Ð»ÑŒÑˆÐµ Ñ‡Ñ‘Ñ‚Ð½Ñ‹Ñ…','Ð‘Ð¾Ð»ÑŒÑˆÐµ Ð½ÐµÑ‡Ñ‘Ñ‚Ð½Ñ‹Ñ…','ÐŸÐ¾Ñ€Ð¾Ð²Ð½Ñƒ'].includes(officialParity))result.parity=officialParity;
    if(o?.source)result.source=String(o.source);
    const column=Number(o?.column??o?.officialColumn);
    if(Number.isInteger(column)&&column>=1&&column<=10)result.column=column;
    if(o?.columnSource)result.columnSource=String(o.columnSource);
    return result;
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
  function saveLocal(){try{localStorage.setItem(STORE.draws,JSON.stringify(draws.slice(-800)))}catch{}}
  function loadLocal(){try{return JSON.parse(localStorage.getItem(STORE.draws)||'[]').map(valid).filter(Boolean)}catch{return[]}}

  function payoutFor(size,hits){
    return Number(PAYOUTS[`k${size}_${hits}`]||0);
  }
  const rub=n=>`${Number(n||0).toLocaleString('ru-RU')} â‚½`;

  function sumBalls(b){return (b||[]).reduce((a,x)=>a+Number(x),0)}
  function orderFor(draw){if(mode==='asc')return [...draw.balls].sort((a,b)=>a-b);return draw.balls.slice()}
  function samePositions(draw){
    const asc=[...draw.balls].sort((a,b)=>a-b),set=new Set();
    draw.balls.forEach((n,i)=>{if(Number(n)===Number(asc[i]))set.add(Number(n))});return set;
  }
  function singletonText(draw){
    const cols=Array.from({length:10},()=>[]);
    for(const n of draw.balls)cols[n%10===0?9:(n%10)-1].push(n);
    const singles=cols.map((a,i)=>a.length===1?i+1:null).filter(Boolean);
    const empty=cols.map((a,i)=>a.length===0?i+1:null).filter(Boolean);
    const s=singles.length?`â˜ Ð¾Ð´Ð¸Ð½Ð¾Ñ‡Ð½Ñ‹Ðµ: ${singles.map(x=>'ÑÑ‚'+x).join(', ')}`:'â˜ Ð¾Ð´Ð¸Ð½Ð¾Ñ‡Ð½Ñ‹Ðµ: â€”';
    return s+(empty.length?` Â· <span class="empty">${empty.map(x=>'ÑÑ‚'+x+' â–¡ â€” Ð¿ÑƒÑÑ‚Ð¾Ð¹!').join(' ')}</span>`:'');
  }
  function drawCard(draw,previous,label){
    const prevSet=new Set(previous?.balls||[]);
    const trans=new Set(draw.balls.filter(n=>prevSet.has(Number(n))));
    const same=samePositions(draw);
    const officialParity=String(draw?.parity||'').trim();
    const officialColumn=Number(draw?.column);
    const parityText=['Ð‘Ð¾Ð»ÑŒÑˆÐµ Ñ‡Ñ‘Ñ‚Ð½Ñ‹Ñ…','Ð‘Ð¾Ð»ÑŒÑˆÐµ Ð½ÐµÑ‡Ñ‘Ñ‚Ð½Ñ‹Ñ…','ÐŸÐ¾Ñ€Ð¾Ð²Ð½Ñƒ'].includes(officialParity)?officialParity:'Ñ‡Ñ‘Ñ‚/Ð½ÐµÑ‡Ñ‘Ñ‚: â€”';
    const columnText=(Number.isInteger(officialColumn)&&officialColumn>=1&&officialColumn<=10)?`ðŸ”´ ÑÑ‚${officialColumn}`:'ðŸ”´ ÑÑ‚â€”';
    const nums=orderFor(draw);
    return `<section class="card">
      <div class="draw-head"><div>
        <div class="label">${label}</div><div class="draw-no">â„–${draw.draw}</div>
        <div class="draw-time">${showDate(draw.date)} ${draw.time||''}</div>
        <div class="meta"><span>Î£ ${sumBalls(draw.balls)}</span><span>${parityText}</span></div>
      </div><div class="st">${columnText}</div></div>
      <div class="numbers">${nums.map(n=>`<div class="ball ${trans.has(Number(n))?'pass':''} ${same.has(Number(n))?'same':''}">${pad(n)}${trans.has(Number(n))?' â—†':''}</div>`).join('')}</div>
      <div class="singletons">${singletonText(draw)}</div>
    </section>`;
  }
  function renderCards(){
    if(!networkReady||draws.length<3)return;
    const last=draws.length-1;
    const idx=[last,last-1,last-2];
    $('cards').innerHTML=idx.map((i,k)=>{
      const lab=k===0?'ÐŸÐžÐ¡Ð›Ð•Ð”ÐÐ˜Ð™ Ð¢Ð˜Ð ÐÐ–':k===1?'ÐŸÐ Ð•Ð”Ð«Ð”Ð£Ð©Ð˜Ð™ Ð¢Ð˜Ð ÐÐ–':'ÐŸÐ Ð•Ð”ÐŸÐ Ð•Ð”Ð«Ð”Ð£Ð©Ð˜Ð™ Ð¢Ð˜Ð ÐÐ–';
      return drawCard(draws[i],draws[i-1],lab);
    }).join('');
  }

  async function fetchFingerprintServer(){
    const bust=`?v=6502&t=${Date.now()}`;
    try{
      const [sr,ar]=await Promise.all([
        fetch('./fingerprint-state-v63.json'+bust,{cache:'no-store'}),
        fetch('./fingerprint-archive-v63.json'+bust,{cache:'no-store'})
      ]);
      if(!sr.ok||!ar.ok)throw new Error(`SERVER FINGERPRINT HTTP ${sr.status}/${ar.status}`);
      const state=await sr.json(),archive=await ar.json();
      if(!state?.serverLearning||!Array.isArray(archive))throw new Error('ÐÐµÐ²ÐµÑ€Ð½Ñ‹Ð¹ Ñ„Ð¾Ñ€Ð¼Ð°Ñ‚ SERVER FINGERPRINT');
      serverState=state;serverArchive=archive.sort((a,b)=>Number(a.targetDraw)-Number(b.targetDraw));serverFingerprintOnline=true;
      try{localStorage.setItem(STORE.fpState,JSON.stringify(serverState));localStorage.setItem(STORE.fpArchive,JSON.stringify(serverArchive));}catch{}
      return true;
    }catch(error){
      console.warn('SERVER FINGERPRINT:',error);
      try{
        const state=JSON.parse(localStorage.getItem(STORE.fpState)||'null');
        const archive=JSON.parse(localStorage.getItem(STORE.fpArchive)||'[]');
        if(state?.serverLearning&&Array.isArray(archive)){serverState=state;serverArchive=archive;serverFingerprintOnline=false;return false;}
      }catch{}
      serverState=null;serverArchive=[];serverFingerprintOnline=false;return false;
    }
  }

  async function legacyArchive(){
    if(!DBSTORE?.listPredictions)return [];
    try{
      const list=(await DBSTORE.listPredictions()).filter(Boolean),all=[];
      for(const p of list){
      const t=Number(p?.targetDraw||p?.forD|Ž|0||0);if(!t)continue;
      all.push({targetDraw:t,prediction:p});
      }
      return all;
    }catch{return []}
  }
  function getServerForecast(){
    const latest=draws.at(-1);if(!latest)return null;
    return serverArchive.find(x=>!ýà¹…ÑÕ…°˜™9Õµ‰•È¡à¹Í½ÕÉ•É…Ü¤ôôõ9Õµ‰•È¡±…Ñ•ÍÐ¹‘É…Ü¤¥ññ¹Õ±°ì(€ô(€™Õ¹Ñ¥½¸Á½½±!Ñµ°¡Á½½°¥ì(€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰™¥¹•ÉÁÉ¥¹ÐµÁ½½°ˆø‘íÁ½½°¹Í±¥” À°ÈÀ¤¹µ…À ¡¸±¤¤ôù€ñÍÁ…¸±…ÍÌô‰™Àµ‰…±°ˆøñ¤ø‘í¤¬Åôð½¤ø‘íÁ…¡¸¥ôð½ÍÁ…¸ù€¤¹©½¥¸ œœ¥ôð½‘¥Øù€ì(€ô(€™Õ¹Ñ¥½¸½µ‰½Í!Ñµ°¡½µ‰½Ì¥ì(€€€É•ÑÕÉ¸ð‘í½µ‰½Ì¹µ…À¡Œôù€ñ‘¥Ø±…ÍÌô‰™Àµ½µ‰¼ˆø‘íŒ¹ÑåÁ•ôè€‘íŒ¹¹Õµ‰•ÉÌ¹µ…À¡Á…¤¹©½¥¸ œ€œ¥ôð½‘¥Øù€¤¹©½¥¸ œœ¥õ€ì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸É•¹‘•ÉÉ¡¥Ù” ¥ì(€€€½¹ÍÐ‰½àô ™¥¹•ÉÁÉ¥¹ÑI•ÍÕ±Ðœ¤ì(€€€¥˜ …‰½à¥É•ÑÕÉ¸ì(€€€±•Ð¥Ñ•µÌõÍ•ÉÙ•ÉÉ¡¥Ù”¹Í±¥” ¤¹É•Ù•ÉÍ” ¤¹Í±¥” À°ÄÀÀ¤ì(€€€¥˜ …¥Ñ•µÌ¹±•¹Ñ ¥¥Ñ•µÌõ…Ý…¥Ð±•…åÉ¡¥Ù” ¤ì(€€€‰½à¹¥¹¹•É!Q50õ€ñ‘¥Ø±…ÍÌô‰É½ÜÍµ…±°ˆûB‡B×FBËB×FB÷F/BäƒBÃFFBãBÈƒBÿFB×BÓBãBëFBûBÈƒBÿBûBëBÃBßF/BËBÃB×FƒFBø°ƒFFBøƒBÇF/BïBøƒBßBÃBóBûFBûBÛB×B÷BøƒBÓBøƒFFBÃBëFBÀ¸ð½‘¥Øø‘í¥Ñ•µÌ¹µ…À¡àôù€ñ‘•Ñ…¥±Ì±…ÍÌô‰…É µÉ½ÜˆøñÍÕµµ…ÉäøñÍÁ…¸ø‘íà¹…ÑÕ…°üq¸œèŸŠ>ÌôƒŠX‘íà¹Ñ…É•ÑÉ…Ýññà¹ÁÉ•‘¥Ñ¥½¸ü¹Ñ…É•ÑÉ…ÝñðŸŠPôð½ÍÁ…¸øñÍÁ…¸±…ÍÌô‰Íµ…±°ˆø‘íà¹…ÑÕ…°ý€‘íà¹…ÑÕ…°¹‘…Ñ•ñðœô€‘íà¹…ÑÕ…°¹Ñ¥µ•ñðœõ€èŸBûBÛBãBÓBÃB×FƒBãFBûBÌƒÂ~R”ôð½ÍÁ…¸øð½ÍÕµµ…Éäøñ‘¥Ø±…ÍÌô‰…É µ‰½‘äˆøñÁÉ”ø‘í•ÍŒ ¡)M=8¹ÍÑÉ¥¹¥™äýà¹ÁÉ•‘¥Ñ¥½¹ññàé¹Õ±°±¹Õ±°°È¤¤¥ôð½ÁÉ”øð½‘¥Øøð½‘•Ñ…¥±Ìù€¤¹©½¥¸ œœ¥õ€ì(€ô((€…Íå¹Œ™Õ¹Ñ¥½¸É•¹‘•É¥¹•ÉÁÉ¥¹Ð ¥ì(€€€½¹ÍÐ‰½àô ™¥¹•ÉÁÉ¥¹ÑI•ÍÕ±Ðœ¤ì(€€€¥˜ …‘É…ÝÌ¹±•¹Ñ ¥í‰½à¹¥¹¹•É!Q50ôœœíÉ•ÑÕÉ¹ô(€€€¥˜¡™Á5½‘”ôôô…É¡¥Ù”œ¥í…Ý…¥ÐÉ•¹‘•ÉÉ¡¥Ù” ¤íÉ•ÑÕÉ¹ô(€€€ÑÉåì(€€€€€½¹ÍÐÀõ•ÑM•ÉÙ•É½É•…ÍÐ ¤ì(€€€€€¥˜ …À¥ì(€€€€€€€‰½à¹¥¹¹•É!Q50ôœñ‘¥Ø±…ÍÌô‰É½ÜÍµ…±°ˆûŠ>ÌMIYH%9IAI%9PƒB×F'FDƒB÷BÔƒBãB÷BãFBãBÃBïBãBßBãFBûBËBÃBô¸ƒBwFBÛB×BôƒBûBÓBãBôƒFFBÿB×F#B÷F/BäƒBßBÃBÿFFBè¥Ñ!ÕˆÑ¥½¸¸ð½‘¥Øøœì(€€€€€€€É•ÑÕÉ¸ì(€€€€€ô(€€€€€½¹ÍÐ…¹Ñ¤õ™Á5½‘”ôôô…¹Ñ¥±½¥Œœ±Á½½°õ…¹Ñ¤ýÀ¹…¹Ñ¤ÈÀéÀ¹Á½½°ÈÀ±½µ‰½Ìõ…¹Ñ¤ýÀ¹…¹Ñ¥½µ‰½ÌéÀ¹±½¥½µ‰½Ìì(€€€€€½¹ÍÐÝ•¥¡ÑÌõÍ•ÉÙ•ÉMÑ…Ñ”ü¹Ý•¥¡ÑÍññÀ¹Ý•¥¡ÑÍññ9%9ü¹U1Q}]%!QMññíôì(€€€€€½¹ÍÐ‰½½ÑÍÑÉ…Á½Õ¹Ðõ9Õµ‰•È¡Í•ÉÙ•ÉMÑ…Ñ”ü¹‰½½ÑÍÑÉ…Á½Õ¹ÑñðÀ¤±±•…É¹¥¹½Õ¹Ðõ9Õµ‰•È¡Í•ÉÙ•ÉMÑ…Ñ”ü¹Í•ÑÑ±•‘½Õ¹ÑñðÀ¤ì(€€€€€‰½à¹¥¹¹•É!Q50õ€(€€€€€€€€ñ‘¥Ø±…ÍÌô‰É½ÜˆøñÍÑÉ½¹œûÂ~:´MIYH€¼ƒŠ>ÏŠ"HÄƒ
ÜƒBÿBûFBïBÔƒŠX‘íÀ¹Í½ÕÉ•É…ÝôƒŠHƒŠX‘íÀ¹Ñ…É•ÑÉ…Ýôð½ÍÑÉ½¹œø(€€€€€€€€ñ‘¥Ø±…ÍÌô‰Íµ…±°ˆûÂ~ž€ƒBûBÇFFB×B÷BãBÔèƒBÃFFBãBÈ€‘í‰½½ÑÍÑÉ…Á½Õ¹Ñô€¬ƒFB×FBËB×FB÷F/FƒBÁÉ¡¥Ù”€‘í±•…É¹¥¹½Õ¹Ñôƒ
Ü€‘íÍ•ÉÙ•É¥¹•ÉÁÉ¥¹Ñ=¹±¥¹”ü¥Ñ!ÕˆMIYHœèŸBëF7F MIYHôð½‘¥Øøð½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°µÉ¥ˆø(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°ˆøñˆø‘íÀ¹ÑÉ…¹Í¥Ñ¥½¸ü¹½Õ¹ÑñðÁô¼ÈÀð½ˆøñÍÁ…¸ûBÿB×FB×FBûBÓBûBÈð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°ˆøñˆø‘í9Õµ‰•È¡À¹µ…ÑÉ¥àü¹µ•…¹¥ÍÑ…¹•ñðÀ¤¹Ñ½¥á• È¥ôð½ˆøñÍÁ…¸ûFFB×BÓB÷BãBä5…¹¡…ÑÑ…¸ð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°ˆøñˆø‘íÀ¹¹•¥¡‰½ÉÍ½Õ¹ÑñðÁôð½ˆøñÍÁ…¸ûBãFFBûFBãFB×FBëBãFƒFBûFFBûF?B÷BãBäð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°ˆøñˆø‘í9Õµ‰•È¡Ý•¥¡ÑÌ¹…¹…±½ñðÀ¤¹Ñ½¥á• Ì¥ôð½ˆøñÍÁ…¸ûBËB×FƒBãFFBûFBãBàƒBÿBûFBïBÔƒBûBÇFFB×B÷BãF<ð½ÍÁ…¸øð½‘¥Øø(€€€€€€€€ð½‘¥Øø(€€€€€€€€ñ‘¥Ø±…ÍÌô‰±…‰•°ˆÍÑå±”ô‰µ…É¥¸µÑ½ÀèÄÉÁàˆø‘í…¹Ñ¤ü9Q%1=%´ÈÀœèA==0´ÈÀôð½‘¥Øø‘íÁ½½±!Ñµ°¡Á½½°¥ô(€€€€€€€€ñ‘¥Ø±…ÍÌô‰±…‰•°ˆÍÑå±”ô‰µ…É¥¸µÑ½ÀèÄÉÁàˆûBhÌƒ
ÜƒBhÐƒ
ÜƒBhÔð½‘¥Øø‘í½µ‰½Í!Ñµ°¡½µ‰½Ì¥õ€ì(€€€õ…Ñ ¡•ÉÉ½È¥í½¹Í½±”¹•ÉÉ½È¡•ÉÉ½È¤í‰½à¹¥¹¹•É!Q50õ€ñ‘¥Ø±…ÍÌô‰É½ÜÍµ…±°ˆûB{F#BãBÇBëBÀMIYH%9IAI%9Pè€‘íMÑÉ¥¹œ¡•ÉÉ½Èü¹µ•ÍÍ…•ññ•ÉÉ½È¥ôð½‘¥Øùô(€ô((€™Õ¹Ñ¥½¸É•¹‘•É5…ÑÉ¥à ¥ì(€€€½¹ÍÐÈõ9%9¹µ…ÑÉ¥áI•Á½ÉÐ¡‘É…ÝÌ¤±˜õÈ¹™•…ÑÕÉ•Ì±ÕÈõ‘É…ÝÌ¹…Ð ´Ä¤±Í•Ðõ¹•ÜM•Ð¡ÕÈ¹‰…±±Ì¤±ÑÈõ¹•ÜM•Ð¡È¹ÑÉ…¹Í¥Ñ¥½¸¹¹Õµ‰•ÉÌ¤ì(€€€½¹ÍÐÁ¡…Í•AÐõ5…Ñ ¹µ…à Ô±5…Ñ ¹µ¥¸ äÔ°ÔÀµÔ¹‘•±Ñ„¨ÄÐ¤¤ì(€€€€ µ…ÑÉ¥áI•ÍÕ±Ðœ¤¹¥¹¹•É!Q50õ€ñ‘¥Ø±…ÍÌô‰É½ÜˆøñˆûB‹BãFBÃBØƒŠX‘íÈ¹‘É…Ýôð½ˆøƒ
Ü€‘íÍ¡½Ý…Ñ”¡È¹‘…Ñ”¥ô€‘íÈ¹Ñ¥µ•ñðœôð½‘¥Øø(€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°µÉ¥ˆø(€€€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°ˆøñˆø‘íÈ¹Á¡…Í•ôð½ˆøñÍÁ…¸ûFBÃBßBÀƒBÿBûBïF<ð½ÍÁ…¸øð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°ˆøñˆø‘íÈ¹…ÉÉ½Ýôð½ˆøñÍÁ…¸ûBÓBËBãBÛB×B÷BãBÔƒFB×B÷FFBÀð½ÍÁ…¸øð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°ˆøñˆø‘í˜¹‘•¹Í¥Ñä¹Ñ½¥á• Ì¥ôð½ˆøñÍÁ…¸ûBÿBïBûFB÷BûFFF0Š&Èð½ÍÁ…¸øð½‘¥Øø(€€€€€€ñ‘¥Ø±…ÍÌô‰Í¥¹…°ˆøñˆø‘í˜¹¥µ‰…±…¹”¹Ñ½¥á• È¥ôð½ˆøñÍÁ…¸ûBÿB×FB×BëBûFƒBëBËBÃBÓFBÃB÷FBûBÈð½ÍÁ…¸øð½‘¥Øø(€€€€ð½‘¥Øø(€€€€ñ‘¥Ø±…ÍÌô‰É½ÜˆøñÍÑÉ½¹œûB‡BÛBÃFBãBÔƒŠPƒFBÃBßBÛBÃFBãBÔð½ÍÑÉ½¹œøñ‘¥Ø±…ÍÌô‰µ•Ñ•ÈˆøñÍÁ…¸ÍÑå±”ô‰Ý¥‘Ñ è‘íÁ¡…Í•AÑô”ˆøð½ÍÁ…¸øð½‘¥Øøñ‘¥Ø±…ÍÌô‰Íµ…±°ˆû:PƒFFB×BÓB÷B×BÏBø5…¹¡…ÑÑ…¸è€‘íÈ¹‘•±Ñ„øôÀüœ¬œèœô‘íÈ¹‘•±Ñ„¹Ñ½¥á• Ì¥ôð½‘¥Øøð½‘¥Øø(€€€€ñ‘¥Ø±…ÍÌô‰µ…ÑÉ¥àµÉ¥ˆø‘íÉÉ…ä¹™É½´¡í±•¹Ñ èàÁô°¡|±¤¤ôù¤¬Ä¤¹µ…À¡¸ôù€ñ‘¥Ø±…ÍÌô‰•±°€‘íÍ•Ð¹¡…Ì¡¸¤ü½¸œèœô€‘íÑÈ¹¡…Ì¡¸¤üÑÉ…¹Í¥Ñ¥½¸œèœôˆø‘í¹ôð½‘¥Øù€¤¹©½¥¸ œœ¥ôð½‘¥Øù€ì(€ô(€™Õ¹Ñ¥½¸±¥ÍÑÍÍ•µ‰±ä¡Ñ¥Ñ±”±¥Ñ•µÌ¥ì(€€€É•ÑÕÉ¸€ñ‘¥Ø±…ÍÌô‰±…‰•°ˆÍÑå±”ô‰µ…É¥¸µÑ½ÀèÄÅÁàˆø‘íÑ¥Ñ±•ôð½‘¥Øø‘í¥Ñ•µÌ¹Í±¥” À°Ô¤¹µ…À¡àôù€ñ‘¥Ø±…ÍÌô‰É½Üˆøñˆø‘íà¹­¥¹ôôô œüŸŠHœèŸŠTô€‘íà¹­¥¹ôôô œýƒBp‘íà¹Á±…•÷ŠOBp‘íà¹Á±…”­à¹±•¹Ñ ´Åõ€éƒBp‘íà¹Á±…•õ€ð½ˆøñ‘¥Øø‘íà¹à¹¹Õµ‰•ÉÍññmuô¹µ…À¡Á…¤¹©½¥¸ œƒ
Ü€œ¥ôð½‘¥Øøñ‘¥Ø±…ÍÌô‰Íµ…±°ˆûFBãBïBÀ€‘í9Õµ‰•È¡à¹Í½É•ñðÀ¤¹Ñ½¥á• Ì¥ôð½‘¥Øøð½‘¥Øù€¤¹©½¥¸ œœ¥ñðœñ‘¥Ø±…ÍÌô‰É½ÜÍµ…±°ˆûB‡BãBïF3B÷F/FƒFBãBÏB÷BÃBïBûBÈƒB÷B×F¸ð½‘¥Øøõ€ì(€ô(€™Õ¹Ñ¥½¸É•¹‘•ÉÍÍ•µ‰±ä ¥ì(€€€½¹ÍÐÈõ9%9¹…ÍÍ•µ‰±åI•Á½ÉÐ¡‘É…ÝÌ¤ì(€€€€ …ÍÍ•µ‰±åI•ÍÕ±Ðœ¤¹¥¹¹•É!Q50õ€ñ‘¥Ø±…ÍÌô‰É½ÜˆøñˆûB‹BãFBÃBØƒŠX‘íÈ¹‘É…Ýôð½ˆøƒ
Ü€‘íÍ¡½Ý…Ñ”¡È¹‘…Ñ”¥ô€‘íÈ¹Ñ¥µ•ñðœôñ‘¥Ø±…ÍÌô‰Íµ…±°ˆûBsB×FFBÀƒFFBãFBÃF;FFF<ƒBÿBøƒBÿBûFF?BÓBëFƒBËF/BÿBÃBÓB×B÷BãF<ƒBpÇŠOBpÈÀ¸ð½‘¥Øøð½‘¥Øø‘í±¥ÍÑÍÍ•µ‰±ä ŸBOB{BƒBcB_B{BwB‹BCBoB`œ±È¹¡½É¥é½¹Ñ…°¥ô‘í±¥ÍÑÍÍ•µ‰±ä ŸBKBWBƒB‹BcBkBCBoB`œ±È¹Ù•ÉÑ¥…°¥õ€ì(€ô((€™Õ¹Ñ¥½¸ÕÁ‘…Ñ•A…¹•±	ÕÑÑ½¹Ì ¥ì(€€€‘½Õµ•¹Ð¹ÅÕ•ÉåM•±•Ñ½É±° m‘…Ñ„µÁ…¹•±t±m‘…Ñ„µ½Á•¹tœ¤¹™½É… ¡ˆôùì(€€€€€½¹ÍÐ¥õˆ¹‘…Ñ…Í•Ð¹Á…¹•±ññˆ¹‘…Ñ…Í•Ð¹½Á•¸±½Á•¸ô¡¥¤ü¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì Í¡½Üœ¤ì(€€€€€ˆ¹±…ÍÍ1¥ÍÐ¹Ñ½±” Ñ½½°µ½Á•¸œ°„…½Á•¸¤íˆ¹Í•ÑÑÑÉ¥‰ÕÑ” …É¥„µ•áÁ…¹‘•œ±½Á•¸üÑÉÕ”œè™…±Í”œ¤ì(€€€ô¤ì(€€€½¹ÍÐ™Á=Á•¸ô ™¥¹•ÉÁÉ¥¹ÑA…¹•°œ¤¹±…ÍÍ1¥ÍÐ¹½¹Ñ…¥¹Ì Í¡½Üœ¤ì(€€€½¹ÍÐ½±±…ÁÍ”ô ™¥¹•ÉÁÉ¥¹Ñ½±±…ÁÍ”œ¤ì(€€€¥˜¡½±±…ÁÍ”¥í½±±…ÁÍ”¹Ñ•áÑ½¹Ñ•¹Ðõ™Á=Á•¸üŸŠZÐƒB‡BKBWBƒBwBB‹B°œèŸŠZøƒBƒBCB_BKBWBƒBwBB‹B°ô);
  }
  function closePanel(id){$(id)?.classList.remove('show');updatePanelButtons()}
  function openPanel(id){
    document.querySelectorAll('.panel').forEach(p=>{if(p.id!==id)p.classList.remove('show')});
    const p=$(id);p.classList.toggle('show');updatePanelButtons();
    if(!p.classList.contains('show'))return;
    if(id==='fingerprintPanel')renderFingerprint().catch(console.error);
    if(id==='matrixPanel')renderMatrix();
    if(id==='assemblyPanel')renderAssembly();
    if(id==='network80Panel')NETWORK80UI?.render(draws).catch(console.error);
    setTimeout(()=>p.scrollIntoView({behavior:'smooth',block:'start'}),30);
  }

  function startAuto(){
    clearInterval(timer);timer=null;
    const ms=Number(localStorage.getItem(STORE.interval)||300000);
    if(ms)timer=setInterval(()=>refresh(false),ms);
  }
  async function refresh(scrollTop=false){
    $('status').textContent='ÐŸÑ€Ð¾Ð²ÐµÑ€ÑÑŽ Ð½Ð¾Ð²Ñ‹Ð¹ Ñ‚Ð¸Ñ€Ð°Ð¶â€¦';
    await fetchFresh().catch(()=>{});
    if(scrollTop)window.scrollTo({top:0,behavior:'smooth'});
  }

  function openSettings(){
    localStorage.removeItem(STORE.source);
    $('sourceUrl').value=DEFAULT_SOURCE;
    $('sourceUrl').disabled=true;
    $('interval').value=localStorage.getItem(STORE.interval)||'300000';
    $('settings').showModal();
  }

  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-mode]').forEach(x=>x.classList.remove('on'));b.classList.add('on');mode=b.dataset.mode;renderCards();
  }));
  document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
  document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closePanel(b.dataset.close)));
  $('fingerprintCollapse')?.addEventListener('click',()=>closePanel('fingerprintPanel'));
  document.querySelector('[data-home]').addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));
  document.querySelectorAll('[data-fp-mode]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-fp-mode]').forEach(x=>x.classList.remove('active'));b.classList.add('active');fpMode=b.dataset.fpMode;renderFingerprint().catch(console.error);
  }));
  $('syncBtn').addEventListener('click',()=>refresh(true));$('syncBtn2').addEventListener('click',()=>refresh(true));
  $('settingsBtn').addEventListener('click',()=>openSettings());
  $('saveSettings').addEventListener('click',()=>{
    localStorage.removeItem(STORE.source);
    localStorage.setItem(STORE.interval,$('interval').value);
    startAuto();setTimeout(()=>refresh(false),0);
  });

  updatePanelButtons();startAuto();fetchFresh().catch(()=>{});
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=6700',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{}));
  }
})();
