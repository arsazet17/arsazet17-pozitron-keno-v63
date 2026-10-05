'use strict';
const assert=require('node:assert/strict'),E=require('../iris-engine-v63.js'),N=require('../network80-engine-v63.js'),fs=require('node:fs');
const h=E.normalize(JSON.parse(fs.readFileSync('keno-history-v63.json','utf8'))),archive=JSON.parse(fs.readFileSync('iris-archive-v63.json','utf8'));
let fixtureIndex=-1,deniedHeat=0,observed=0;
for(let i=Math.max(4,h.length-100);i<h.length-5;i++){const e=E.evaluate(h.slice(0,i+1),new Date(E.timestamp(h[i])+1000).toISOString());if(e.gate?.repeat3Count>8){assert.equal(e.permissionA,false);assert.equal(e.candidates.length,0);deniedHeat++;}for(const c of e.candidates){assert.ok(c.metrics.maxPerRow<=2);assert.ok(c.reason.every(p=>p.temporalAllowed));assert.ok(E.connected(c.numbers));assert.equal(c.permissionB,c.mode==='IRIS'&&c.metrics.rowsUsed>=7&&c.metrics.vertical>=3);observed++;}if(e.permissionA&&fixtureIndex<0)fixtureIndex=i;}
assert.ok(deniedHeat>0);assert.ok(observed>0);assert.ok(fixtureIndex>=0);
const idx=fixtureIndex,now=new Date(E.timestamp(h[idx])+1000).toISOString(),prefix=h.slice(0,idx+1),first=E.process(prefix,[],now),snapshot=JSON.stringify(first.series.map(s=>[s.numbers,s.createdAt,s.reason,s.gate,s.targets]));
assert.ok(first.series.some(s=>s.mode==='MINI3'));assert.ok(first.series.some(s=>s.mode==='MINI4'));
const again=E.process(prefix,first.series,now,{gateLog:first.gateLog});assert.equal(again.created,0);assert.equal(again.gateLog.length,1);
const one=E.settle(first.series,h.slice(0,idx+2));assert.ok(one.every(s=>s.status==='active'&&s.results.length===1));
const full=E.settle(one,h.slice(0,idx+6));assert.ok(full.every(s=>s.status==='closed'&&s.results.length===5));assert.equal(JSON.stringify(full.map(s=>[s.numbers,s.createdAt,s.reason,s.gate,s.targets])),snapshot);assert.deepEqual(E.settle(full,h),full);
const gap=E.settle(first.series,h.filter(d=>d.draw!==h[idx+2].draw));assert.ok(gap.every(s=>s.status==='active'&&s.results.length===4));assert.ok(E.settle(gap,h).every(s=>s.status==='closed'));
const changed=structuredClone(h);for(let i=idx+1;i<changed.length;i++)changed[i].balls=Array.from({length:20},(_,n)=>n+1);assert.deepEqual(E.evaluate(changed,now,{cutoff:h[idx].draw}),E.evaluate(h,now,{cutoff:h[idx].draw}));
const conflict=E.settle(full,changed);assert.deepEqual(conflict[0].results,full[0].results);assert.ok(conflict[0].conflicts.length);
const altered=structuredClone(full[0]);altered.numbers=[1,2,3,4,5];const merged=E.mergeSeries([full[0]],[altered]);assert.deepEqual(merged[0].numbers,full[0].numbers);assert.equal(merged[0].mergeConflict,true);
assert.equal(E.evaluate(prefix,new Date(E.timestamp(h[idx+1])+1).toISOString()).state,'waiting_fact');
const sizes=new Set();for(let length=5;length<=10;length++){const nums=length<=8?Array.from({length},(_,i)=>1+i*10):[1,11,21,31,41,51,61,71,...(length===9?[12]:[12,23])];const pool=nums.map(n=>({n,strong:true,temporalAllowed:true,code:'01010',code4:'1010',count:2,count4:2,gap:1}));const candidates=E.independentCandidates(pool);assert.ok(candidates.some(c=>c.numbers.length===length),'natural size '+length);candidates.forEach(c=>sizes.add(c.numbers.length));}
assert.deepEqual([...sizes].sort((a,b)=>a-b),[5,6,7,8,9,10]);
const mini3=E.miniSearch(E.rank(prefix),3),mini4=E.miniSearch(E.rank(prefix),4);assert.deepEqual(first.evaluation.candidates.find(c=>c.mode==='MINI3').numbers,mini3.numbers);assert.deepEqual(first.evaluation.candidates.find(c=>c.mode==='MINI4').numbers,mini4.numbers);
for(let size=3;size<=10;size++)for(let hits=0;hits<=size;hits++)assert.equal(E.payout(size,hits),N.payout(size,hits));assert.equal(E.payout(7,0),150);assert.equal(E.payout(7,5),1200);
const oldFrozen=JSON.stringify(archive.series.map(s=>[s.numbers,s.createdAt,s.results])),settledOld=E.settle(archive.series,[]);assert.equal(JSON.stringify(settledOld.map(s=>[s.numbers,s.createdAt,s.results])),oldFrozen);
const demo={numbers:[1,2,3,4,5,6],targetStart:100,status:'closed',results:[0,3,4,4,1].map((hitCount,i)=>({draw:100+i,hitCount,payout:E.payout(6,hitCount)}))},sum=E.summary(demo);assert.equal(sum.firstWinStep,2);assert.deepEqual(sum.bestSteps,[3,4]);assert.equal(sum.totalPayout,1700);assert.equal(sum.winCount,3);
const research=E.backtest(h.slice(0,idx+6),{limit:10});assert.equal(research.research,true);assert.ok(research.series.every(s=>s.origin==='backtest'&&s.research));assert.equal(require('./iris-update-v63.js').recoverRecent,undefined);
console.log('PASS: A row/heat gates, natural sizes 5–10, independent MINI, B, five frozen draws, dedup, gaps, immutable history, payouts, series statistics, future-mutation anti-leakage, research separation.');
