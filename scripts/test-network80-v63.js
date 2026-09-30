'use strict';
const fs=require('fs');
const E=require('../network80-engine-v63.js');
const S=require('./network80-server-v63.js');
const all=JSON.parse(fs.readFileSync('keno-history-v63.json','utf8')).sort((a,b)=>Number(a.draw)-Number(b.draw));
if(all.length<300)throw new Error('NETWORK80 TEST: history too short');
const cut=all.length-8;
let prefix=all.slice(0,cut),state=null,archive=[];
let out=S.processNetwork80(prefix,state,archive,E,'2026-01-01T00:00:00.000Z');state=out.state;archive=out.archive;
for(let i=cut;i<all.length;i++){
  const expected=Number(all[i].draw);
  const pending=archive.find(p=>!p.actual);
  if(!pending||Number(pending.targetDraw)!==expected)throw new Error(`NETWORK80 TEST: pending ${pending?.targetDraw}, expected ${expected}`);
  if(Number(pending.sourceDraw)!==Number(prefix.at(-1).draw))throw new Error('NETWORK80 TEST: source boundary leak');
  prefix=[...prefix,all[i]];
  out=S.processNetwork80(prefix,state,archive,E,`2026-01-01T00:${String(i-cut+1).padStart(2,'0')}:00.000Z`);state=out.state;archive=out.archive;
  const settled=archive.find(p=>Number(p.targetDraw)===expected);
  if(!settled?.actual||Number(settled.actual.draw)!==expected)throw new Error('NETWORK80 TEST: settle failed');
  if((settled.candidates||[]).some(c=>!Array.isArray(c.hits)||Number(c.payout)<0))throw new Error('NETWORK80 TEST: invalid candidate settle');
}
const pending=archive.filter(p=>!p.actual);
if(pending.length!==1||Number(pending[0].targetDraw)!==Number(all.at(-1).draw)+1)throw new Error('NETWORK80 TEST: final pending invalid');
console.log(`NETWORK80 SELFTEST PASS · settled ${state.settledCount} · next №${state.nextTargetDraw} · archive ${archive.length}`);
