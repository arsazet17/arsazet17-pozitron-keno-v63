'use strict';
const fs=require('fs');
const ENGINE=require('../engine-v63.js');
const {processFingerprint}=require('./fingerprint-server-v63.js');
function assert(ok,msg){if(!ok)throw new Error(msg);}
const draws=JSON.parse(fs.readFileSync('keno-history-v63.json','utf8'));
assert(Array.isArray(draws)&&draws.length>60,'Нужна история >60 тиражей');

function assertPortfolio(pred,field){
  const combos=pred[field]||[];
  assert(combos.length===6,`${field}: ожидалось 6 комбинаций`);
  for(const size of [3,4,5])assert(combos.filter(c=>Number(c.size)===size).length===2,`${field}: нет двух K${size}`);
  const usage=new Map();
  for(const c of combos){
    assert(c.components&&Number.isFinite(Number(c.comboScore)),`${field}: нет профиля комбинации ${c.id}`);
    for(const n of c.numbers||[])usage.set(Number(n),(usage.get(Number(n))||0)+1);
  }
  const maxUsage=Math.max(...usage.values());
  assert(maxUsage<=2,`${field}: одно число стало общим корнем ${maxUsage} комбинаций`);
}

// 1. Инициализация: ровно один прогноз на следующий тираж.
const base=draws.slice(0,-6);
let x=processFingerprint(base,null,[],ENGINE,'2026-01-01T00:00:00.000Z');
let pending=x.archive.filter(p=>!p.actual);
assert(pending.length===1,'После bootstrap должен быть один pending');
assert(Number(pending[0].targetDraw)===Number(base.at(-1).draw)+1,'Bootstrap target неверен');
assert(Array.isArray(pending[0].signalAll)&&pending[0].signalAll.length===80,'Новый прогноз обязан хранить сигналы всех 80 чисел до факта');
assertPortfolio(pending[0],'logicCombos');
assertPortfolio(pending[0],'antiCombos');
const initialWeights={...x.state.weights};
assert('outcome' in initialWeights,'Нет веса обучения по выходу чисел');
assert('comboHistory' in initialWeights&&'comboOutcome' in initialWeights,'Нет обучаемых весов сборки комбинаций');

// 2. Один новый тираж: обучение проводится по 20 фактическим против остальных 60.
const one=draws.slice(0,-5);
x=processFingerprint(one,x.state,x.archive,ENGINE,'2026-01-01T00:05:00.000Z');
pending=x.archive.filter(p=>!p.actual);
assert(pending.length===1,'После одного тиража должен быть один pending');
assert(Number(pending[0].targetDraw)===Number(one.at(-1).draw)+1,'Следующий target неверен');
const settled=x.archive.filter(p=>p.actual);
assert(settled.length===1,'Первый прогноз должен быть settled');
assert(settled[0].learningStats?.scope==='ALL_80','Обучение должно идти по всем 80 числам');
assert(Number(settled[0].learningStats?.numbersEvaluated)===80,'Должны быть оценены все 80 чисел');
assert(Number(settled[0].learningStats?.actualCount)===20,'Должны быть учтены все 20 выпавших чисел');
assert(Number(settled[0].learningStats?.nonActualCount)===60,'Должны быть учтены 60 невыпавших чисел');
assert(!settled[0].signalAll,'После обучения ALL-80 временный массив должен удаляться из архива');
assert(Object.keys(initialWeights).some(k=>Math.abs(Number(initialWeights[k])-Number(x.state.weights[k]))>1e-12),'Веса не изменились после факта');
assert(Array.isArray(pending[0].signalAll)&&pending[0].signalAll.length===80,'Следующий прогноз должен снова иметь ALL-80 сигналы');
assertPortfolio(pending[0],'logicCombos');
assertPortfolio(pending[0],'antiCombos');

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
console.log(`SELF-TEST OK ALL-80: latest=${draws.at(-1).draw}, archive=${x.archive.length}, pending=${pending[0].targetDraw}`);
