'use strict';
const fs=require('fs');
const ENGINE=require('../engine-v63.js');
const {VERSION,processFingerprint}=require('./fingerprint-server-v63.js');

const SOURCE='https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';
const HISTORY='keno-history-v63.json';
const STATUS='keno-status-v63.json';
const STATE='fingerprint-state-v63.json';
const ARCHIVE='fingerprint-archive-v63.json';

function readJson(path,fallback){try{return JSON.parse(fs.readFileSync(path,'utf8'));}catch{return fallback;}}
function validDraw(o){
  const draw=Number(o?.draw),balls=(o?.balls||[]).map(Number).filter(n=>n>=1&&n<=80).slice(0,20);
  return Number.isFinite(draw)&&balls.length===20&&new Set(balls).size===20?{draw,date:String(o?.date||''),time:String(o?.time||''),balls}:null;
}
async function fetchHistory(){
  const response=await fetch(SOURCE+'?t='+Date.now(),{headers:{'cache-control':'no-cache','user-agent':'Positron-Keno-v63-server-learning'}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const data=await response.json();
  const raw=Array.isArray(data)?data:(Array.isArray(data.draws)?data.draws:[]);
  const map=new Map();
  for(const x of raw){const d=validDraw(x);if(d)map.set(d.draw,d);}
  const draws=[...map.values()].sort((a,b)=>a.draw-b.draw);
  if(!draws.length)throw new Error('База 6.2 пуста');
  return draws;
}
async function main(){
  const draws=await fetchHistory();
  const oldState=readJson(STATE,null),oldArchive=readJson(ARCHIVE,[]),oldHistory=readJson(HISTORY,[]),oldStatus=readJson(STATUS,null);
  const now=new Date().toISOString();
  const {state,archive,changed}=processFingerprint(draws,oldState,oldArchive,ENGINE,now);
  const latest=draws.at(-1);
  const historyChanged=JSON.stringify(oldHistory)!==JSON.stringify(draws);
  const dataUpdatedAt=(historyChanged||changed)?now:(oldStatus?.updatedAt||state.updatedAt||now);
  fs.writeFileSync(HISTORY,JSON.stringify(draws)+'\n');
  fs.writeFileSync(STATE,JSON.stringify(state,null,2)+'\n');
  fs.writeFileSync(ARCHIVE,JSON.stringify(archive,null,2)+'\n');
  fs.writeFileSync(STATUS,JSON.stringify({
    version:VERSION,source:'KENO 6.2 server mirror',serverLearning:true,updatedAt:dataUpdatedAt,drawsStored:draws.length,
    latestDraw:Number(latest.draw),latestDate:String(latest.date||''),latestTime:String(latest.time||''),
    fingerprintNext:Number(state.nextTargetDraw),fingerprintArchive:archive.length,fingerprintSettled:Number(state.settledCount||0),weights:state.weights
  },null,2)+'\n');
  console.log(`KENO 6.3 SERVER OK: ${draws.length} тиражей, последний №${latest.draw}, прогноз №${state.nextTargetDraw}, архив ${archive.length}`);
}
main().catch(e=>{console.error(e.stack||e);process.exit(1);});
