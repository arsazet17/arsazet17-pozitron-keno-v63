'use strict';
(()=>{
const root=document.getElementById('irisRoot');if(!root)return;
const LABEL={IRIS:'IRIS',MINI3:'MINI‑3',MINI4:'MINI‑4'},DELKEY='iris-v63-deleted-series';
let state=null,mode='IRIS',opened=null,extra={},overlay=null;
const pad=n=>String(Number(n)).padStart(2,'0'),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>{const s=String(d||'');if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(2,4);return s};
const payout=(size,hits)=>window.IRIS_V63.payout(Number(size),Number(hits));
function deletedIds(){try{return new Set(JSON.parse(localStorage.getItem(DELKEY)||'[]'))}catch{return new Set()}}
function rememberDeleted(id){const x=deletedIds();x.add(String(id));try{localStorage.setItem(DELKEY,JSON.stringify([...x]))}catch{}}
async function load(){return new Promise((resolve,reject)=>{const q=indexedDB.open('pozitron_iris_v63',1);q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result,t=db.transaction('cache'),r=t.objectStore('cache').get('iris-v63');r.onsuccess=()=>{const v=r.result||{series:[],draws:[]},del=deletedIds();v.series=(v.series||[]).filter(s=>!del.has(String(s.id)));resolve(v)};r.onerror=()=>reject(r.error)}})}
async function deleteSeries(id){rememberDeleted(id);if(state)state.series=(state.series||[]).filter(s=>String(s.id)!==String(id));opened=null;delete extra[id];render()}
function comboBalls(nums){return (nums||[]).map(n=>`<span class="ia-combo-ball">${pad(n)}</span>`).join('')}
function factNumbers(nums,hits=[]){const h=new Set((hits||[]).map(Number));return `<div class="ia-fact-lines">${(nums||[]).map(n=>`<span class="${h.has(Number(n))?'hit':''}">${pad(n)}</span>`).join('')}</div>`}
function allDraws(){return (state?.draws||[]).slice().sort((a,b)=>Number(a.draw)-Number(b.draw))}
function columnOf(nums){
  const balls=(nums||[]).map(Number).filter(n=>Number.isFinite(n)&&n>=1&&n<=80);
  if(!balls.length)return null;
  const counts=Array(11).fill(0),col=n=>((n-1)%10)+1;
  for(const n of balls)counts[col(n)]++;
  const max=Math.max(...counts.slice(1));
  if(!max)return null;
  const leaders=[];for(let c=1;c<=10;c++)if(counts[c]===max)leaders.push(c);
  if(leaders.length===1)return leaders[0];
  // RETIE: при равенстве побеждает столб, который раньше по порядку
  // выпадения достиг своего полного максимального количества.
  let winner=leaders[0],bestPos=Infinity;
  for(const c of leaders){let seen=0,pos=Infinity;for(let i=0;i<balls.length;i++){if(col(balls[i])===c&&++seen===max){pos=i;break}}if(pos<bestPos){bestPos=pos;winner=c}}
  return winner;
}
function resultFor(s,d){const hits=(d.balls||[]).filter(n=>(s.numbers||[]).map(Number).includes(Number(n))),pay=payout((s.numbers||[]).length,hits.length);return{draw:d.draw,date:d.date,time:d.time,column:d.column||columnOf(d.balls),fact:d.balls,hits,hitCount:hits.length,payout:pay}}
function row(s,r,extended=false){const pay=r.payout==null?payout((s.numbers||[]).length,r.hitCount):Number(r.payout),fire=Number(pay)>0,d=allDraws().find(x=>Number(x.draw)===Number(r.draw)),col=Number(r.column||d?.column)||columnOf(r.fact||d?.balls||[]);return `<div class="ia-row"><div class="ia-draw"><b>${r.draw}</b><em>Столб ${col||'—'}</em><small>${date(r.date||d?.date)} ${esc(r.time||d?.time||'')}</small>${extended?'<small>дальше</small>':''}</div><div class="ia-hitcount ${fire?'fire':''}"><span>${fire?'🔥 ':''}${r.hitCount??0}${fire?`<small class="ia-payout">Сумма<br>${Number(pay).toLocaleString('ru-RU')} ₽</small>`:''}</span></div><div class="ia-fact">${factNumbers(r.fact||d?.balls||[],r.hits||[])}</div></div>`}
function card(s){const rs=s.results||[],best=rs.length?Math.max(...rs.map(x=>Number(x.hitCount)||0)):0,total=rs.reduce((a,x)=>a+(Number(x.hitCount)||0),0),wins=rs.filter(x=>Number(x.payout==null?payout((s.numbers||[]).length,x.hitCount):x.payout)>0).length,isOpen=opened===s.id;return `<article class="ia-card ${isOpen?'open':''}"><div class="ia-card-head"><button class="ia-card-main" data-ia-open="${esc(s.id)}"><div class="ia-title"><strong>⏰ ${LABEL[s.mode]} · ${s.numbers.length} чисел</strong><span class="ia-badge">${rs.length}/5</span></div><div class="ia-combo">${comboBalls(s.numbers)}</div><div class="ia-summary"><div class="ia-stat"><b>${total}</b><span>Σ попаданий</span></div><div class="ia-stat"><b>${best}</b><span>Макс.</span></div><div class="ia-stat"><b>${wins}</b><span>🔥 тиражей</span></div></div></button><button class="ia-delete" data-ia-delete="${esc(s.id)}" aria-label="Удалить комбинацию">УДЛ</button></div><div class="ia-open"><div class="ia-section-title">КАК ШЛА КОМБИНАЦИЯ</div><div class="ia-table-head"><span>Тираж / Столб / Дата</span><span>Попад.</span><span>Числа тиража · 🎲 2×10</span></div><div class="ia-table">${rs.map(r=>row(s,r)).join('')||'<div class="ia-empty">Факты этой серии ещё не пришли.</div>'}</div><button class="ia-more" data-ia-more="${esc(s.id)}">🎲 ПРОВЕРИТЬ ДАЛЬШЕ</button><div class="ia-extra">${extra[s.id]||''}</div></div></article>`}
function ensureOverlay(){if(overlay&&document.body.contains(overlay))return overlay;overlay=document.createElement('div');overlay.className='ia-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','Архив IRIS');document.body.appendChild(overlay);return overlay}
function render(){const box=ensureOverlay(),oldTop=box.scrollTop,list=(state?.series||[]).filter(s=>s.mode===mode).sort((a,b)=>Number(b.sourceCutoff)-Number(a.sourceCutoff));box.innerHTML=`<div class="ia-wrap"><div class="ia-top"><button class="ia-back" data-ia-back>←</button><div><h2>АРХИВ IRIS · v6.3.13</h2><p>Комбинация и её 5 тиражей</p></div></div><div class="ia-tabs">${['IRIS','MINI3','MINI4'].map(m=>`<button class="ia-tab ${m===mode?'on':''}" data-ia-mode="${m}">${LABEL[m]} · ${(state?.series||[]).filter(s=>s.mode===m).length}</button>`).join('')}</div>${list.map(card).join('')||'<div class="ia-empty">В этом архиве пока нет комбинаций.</div>'}</div>`;box.scrollTop=oldTop}
async function showArchive(initial){try{state=await load();mode=initial&&LABEL[initial]?initial:'IRIS';opened=null;extra={};ensureOverlay();document.documentElement.classList.add('ia-locked');render()}catch(e){ensureOverlay().innerHTML=`<div class="ia-wrap"><div class="ia-empty">Не удалось открыть архив: ${esc(e.message)}</div></div>`}}
function closeArchive(){document.documentElement.classList.remove('ia-locked');overlay?.remove();overlay=null}
function checkFurther(id){const s=(state.series||[]).find(x=>String(x.id)===String(id));if(!s)return;const from=Number(s.targetEnd||s.targetStart+4),future=allDraws().filter(d=>Number(d.draw)>from);extra[id]=future.length?`<div class="ia-section-title">ПРОВЕРКА ДАЛЬШЕ · ${future.length} ТИРАЖЕЙ</div><div class="ia-table-head"><span>Тираж / Столб / Дата</span><span>Попад.</span><span>Числа тиража · 🎲 2×10</span></div><div class="ia-table">${future.map(d=>row(s,resultFor(s,d),true)).join('')}</div>`:'<div class="ia-empty">После пятого тиража новых фактов пока нет.</div>';render()}
document.addEventListener('click',e=>{const a=e.target.closest('[data-iris-view="archive"],[data-iris-archive]');if(a){e.preventDefault();e.stopImmediatePropagation();showArchive(a.dataset.irisArchive||'IRIS');return}},true);
document.addEventListener('click',async e=>{if(!overlay||!overlay.contains(e.target))return;const back=e.target.closest('[data-ia-back]');if(back){closeArchive();return}const del=e.target.closest('[data-ia-delete]');if(del){e.preventDefault();e.stopPropagation();const id=del.dataset.iaDelete,s=(state?.series||[]).find(x=>String(x.id)===String(id));if(confirm(`Удалить эту комбинацию ${LABEL[s?.mode]||'IRIS'} из архива?`))await deleteSeries(id);return}const tab=e.target.closest('[data-ia-mode]');if(tab){mode=tab.dataset.iaMode;opened=null;extra={};overlay.scrollTop=0;render();return}const op=e.target.closest('[data-ia-open]');if(op){opened=opened===op.dataset.iaOpen?null:op.dataset.iaOpen;render();return}const more=e.target.closest('[data-ia-more]');if(more){checkFurther(more.dataset.iaMore)}},true);
})();
