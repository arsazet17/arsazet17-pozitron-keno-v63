'use strict';
const fs=require('fs');
const ENGINE=require('../engine-v63.js');
const {processFingerprint}=require('./fingerprint-server-v63.js');
function assert(ok,msg){if(!ok)throw new Error(msg);}
const draws=JSON.parse(fs.readFileSync('keno-history-v63.json','utf8'));
assert(Array.isArray(draws)&&draws.length>60,'Нужна история >60 тиражей');

// 1. Инициализация: ровно один прогноз на следующий тираж.
const base=draws.slice(0,-6);
let x=processFingerprint(base,null,[],ENGINE,'2026-01-01T00:00:00.000Z');
let pending=x.archive.filter(p=>!p.actual);
assert(pending.length===1,'После bootstrap должен быть один pending');
assert(Number(pending[0].targetDraw)===Number(base.at(-1).draw)+1,'Bootstrap target неверен');
const initialWeights={...x.state.weights};

// 2. Один новый тираж: старый прогноз проверен, создан новый.
let one=draws.slice(0,-5);
x=processFingerprint(one,x.state,x.archive,ENGINE,'2026-01-01T00:05:00.000Z');
pending=x.archive.filter(p=>!p.actual);
assert(pending.length===1,'После одного тиража должен быть один pending');
assert(Number(pending[0].targetDraw)===Number(one.at(-1).draw)+1,'Следующий target неверен');
assert(x.archive.filter(p=>p.actual).length===1,'Первый прогноз должен быть settled');
assert(Object.keys(initialWeights).some(k=>Math.abs(Number(initialWeights[k])-Number(x.state.weights[k]))>1e-12),'Веса не изменились после факта');

// 3. Пропуск нескольких запусков: восстановить цепочку без дырок и без future leakage.
const beforeJumpCount=x.archive.length;
x=processFingerprint(draws,x.state,x.archive,ENGINE,'2026-01-01T01:00:00.000Z');
const targets=x.archive.map(p=>Number(p.targetDraw));
for(let i=1;i<targets.length;i++)assert(targets[i]===targets[i-1]+1,`Дырка ${targets[i-1]} -> ${targets[i]}`);
pending=x.archive.filter(p=>!p.actual);
assert(pending.length===1,'После recovery должен быть один pending');
assert(Number(pending[0].targetDraw)===Number(draws.at(-1).draw)+1,'Recovery не дошёл до latest+1');
for(const p of x.archive){
  assert(Number(p.targetDraw)===Number(p.sourceDraw)+1,'Прогноз построен не на следующий тираж');
  if(p.actual)assert(Number(p.actual.draw)===Number(p.targetDraw),'Факт не совпадает с target');
}
assert(x.archive.length>beforeJumpCount,'Recovery не создал пропущенные звенья');
console.log(`SELF-TEST OK: latest=${draws.at(-1).draw}, archive=${x.archive.length}, pending=${pending[0].targetDraw}`);
