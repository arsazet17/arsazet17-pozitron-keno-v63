'use strict';
const assert=require('node:assert/strict');
const E=require('../iris-engine-v63.js');
const strong=[1,2,11,12,21,22,31,32,41,42,51,52,61,62,71,72];
const rest=Array.from({length:80},(_,i)=>i+1).filter(n=>!strong.includes(n));
const source=[
  [...strong,...rest.slice(0,4)],
  rest.slice(4,24),
  [...strong,...rest.slice(24,28)],
  rest.slice(28,48),
  [...rest.slice(48,64),...rest.slice(0,4)]
];
let draws=[];
for(let i=0;i<12;i++){
  const next=i?E.nextDraw(draws.at(-1)):{draw:100,date:'2026-10-04',time:'10:02'};
  let balls=i<5?source[i]:Array.from({length:20},(_,j)=>((i*13+j*3)%80)+1);
  const unique=[];for(const n of balls)if(!unique.includes(n))unique.push(n);for(let n=1;unique.length<20;n++)if(!unique.includes(n))unique.push(n);
  draws.push({...next,balls:unique.slice(0,20)});
}
const before=new Date(E.timestamp(draws[4])+60000).toISOString();
const plan=E.evaluate(draws.slice(0,5),before);
assert.equal(plan.permissionA,true);
assert.equal(plan.gate.maxPerRow<=2,true);
assert.equal(plan.gate.repeat3Count<=8,true);
assert.ok(plan.candidates.filter(x=>x.mode==='IRIS').length>=2);
assert.equal(plan.candidates.find(x=>x.mode==='MINI3').numbers.length,3);
assert.equal(plan.candidates.find(x=>x.mode==='MINI4').numbers.length,4);
const first=E.process(draws.slice(0,5),[],before);assert.ok(first.created>=4);
const again=E.process(draws.slice(0,5),first.series,before);assert.equal(again.created,0);assert.equal(again.series.length,first.series.length);
const frozen=first.series.map(s=>JSON.stringify([s.numbers,s.createdAt,s.reason]));
const checked=E.process(draws,first.series,new Date(E.timestamp(draws.at(-1))+60000).toISOString(),{generate:false});
checked.series.forEach((s,i)=>{assert.equal(s.results.length,5);assert.equal(s.status,'closed');assert.deepEqual(s.results.map(r=>r.draw),[105,106,107,108,109]);assert.equal(JSON.stringify([s.numbers,s.createdAt,s.reason]),frozen[i]);});
assert.deepEqual(E.settle(checked.series,draws),checked.series);
const gap=E.settle(first.series,draws.filter(d=>d.draw!==106));assert.equal(gap[0].results.length,4);assert.equal(gap[0].status,'active');assert.equal(E.settle(gap,draws)[0].status,'closed');
const changed=JSON.parse(JSON.stringify(draws));changed[5].balls=Array.from({length:20},(_,i)=>i+50);const conflict=E.settle(checked.series,changed);assert.ok(conflict[0].conflicts.includes(105));assert.deepEqual(conflict[0].results,checked.series[0].results);
assert.equal(E.evaluate(draws.slice(0,5),new Date(E.timestamp(draws[5])+1).toISOString()).permissionA,false);
assert.equal(E.evaluate(draws.slice(0,5),new Date(E.timestamp(draws[4])-1).toISOString()).permissionA,false);
assert.equal(E.evaluate(draws.slice(0,5).filter(d=>d.draw!==102),before).permissionA,false);
assert.equal(E.payout(7,7),null);assert.equal(E.payout(3,3),1500);assert.equal(E.payout(3,0),0);
const s=E.stats(checked.series,'MINI3');assert.equal(s.series,1);assert.equal(s.checks,5);
const future=E.evaluate(draws,before);assert.equal(future.permissionA,false);
const full=JSON.parse(JSON.stringify(first.series[0]));full.numbers=[1,2,3,4,5,6,7];const fullChecked=E.settle([full],draws)[0];assert.ok(fullChecked.bestHits>=0&&fullChecked.bestHits<=7);
const late=JSON.parse(JSON.stringify(first.series[0]));late.createdAt=new Date(E.timestamp(draws[5])+1).toISOString();const lateResult=E.settle([late],draws)[0];assert.ok(lateResult.conflicts.includes(105));assert.equal(lateResult.results.length,4);
assert.deepEqual(E.nextDraw({draw:1,date:'31.12.26',time:'23:32'}),{draw:2,date:'2027-01-01',time:'00:02'});
console.log('IRIS PASS: project A/B gate, independent combinations, separate MINI, immutable five-draw series, deduplication, gaps, conflicts and no future use.');
