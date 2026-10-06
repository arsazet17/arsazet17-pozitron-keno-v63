'use strict';
const fs=require('node:fs');
const E=require('../iris-engine-v63.js');

const history=E.normalize(JSON.parse(fs.readFileSync('keno-history-v63.json','utf8')));

function components(nums){
  const rest=new Set(nums),out=[];
  while(rest.size){
    const first=rest.values().next().value,part=[],todo=[first];rest.delete(first);
    while(todo.length){
      const a=todo.pop();part.push(a);
      for(const b of [...rest])if(E.geometry(a,b)){rest.delete(b);todo.push(b);}
    }
    out.push(part);
  }
  return out;
}
function oldPointScore(p,selected=[]){
  const links=selected.filter(n=>E.geometry(n,p.n)).length;
  const vertical=selected.filter(n=>E.linkType(n,p.n).startsWith('вертикаль')).length;
  const horizontal=selected.filter(n=>E.linkType(n,p.n).startsWith('горизонталь')).length;
  return (p.strong?12:0)+(p.near?3:0)+p.count*1.4+links*4+vertical*1.2+horizontal*.9-(p.gap??4)*.15;
}
function legacyBuildCandidate(features,size,seedIndex=0){
  const pool=features.filter(p=>p.seen),anchors=features.filter(p=>p.strong).sort((a,b)=>b.count-a.count||(a.gap??9)-(b.gap??9)||a.n-b.n);
  if(!anchors.length||pool.length<size)return null;
  const selected=[],rotated=anchors.slice(seedIndex).concat(anchors.slice(0,seedIndex)),seed=rotated[0];selected.push(seed.n);
  while(selected.length<size){
    const remaining=pool.filter(p=>!selected.includes(p.n));if(!remaining.length)break;
    remaining.sort((a,b)=>{
      const al=a.strong&&!selected.some(n=>E.geometry(n,a.n))?1:0,bl=b.strong&&!selected.some(n=>E.geometry(n,b.n))?1:0;
      const as=oldPointScore(a,selected)+(al&&components(selected).length<3?2.5:0),bs=oldPointScore(b,selected)+(bl&&components(selected).length<3?2.5:0);
      return bs-as||a.n-b.n;
    });
    let pick=remaining.find(p=>selected.some(n=>E.geometry(n,p.n)));
    if(!pick||selected.length>=Math.ceil(size*.55)){
      const freeAnchor=remaining.find(p=>p.strong&&!selected.some(n=>E.geometry(n,p.n)));
      if(freeAnchor&&components(selected).length<3)pick=freeAnchor;
    }
    pick=pick||remaining[0];selected.push(pick.n);
  }
  if(selected.length!==size)return null;
  const items=selected.map(n=>features.find(x=>x.n===n)).filter(Boolean),m=E.comboMetrics(items);
  if(!m.strong)return null;
  return {mode:'IRIS',numbers:selected.slice().sort((a,b)=>a-b),metrics:m,score:m.strong*9+m.vertical*2.2+m.horizontal*1.8+m.links/size+m.near*.7-m.components*.8};
}
function legacyCandidates(features){
  const anchors=features.filter(p=>p.strong);if(!anchors.length)return [];
  const raw=[],sizes=[7,6,8,5,9,10],seedCount=Math.min(anchors.length,4);
  for(let si=0;si<seedCount;si++)for(const size of sizes){const c=legacyBuildCandidate(features,size,si);if(c)raw.push(c);}
  raw.sort((a,b)=>b.score-a.score||Math.abs(a.numbers.length-7)-Math.abs(b.numbers.length-7)||a.numbers.join(',').localeCompare(b.numbers.join(',')));
  const out=[];
  for(const c of raw){
    if(out.some(o=>c.numbers.filter(n=>o.numbers.includes(n)).length/Math.min(c.numbers.length,o.numbers.length)>=.8))continue;
    out.push(c);if(out.length>=4)break;
  }
  return out;
}
function nextMatches(a,b){
  const n=E.nextDraw(a);return !!n&&Number(b.draw)===Number(n.draw)&&String(b.date)===String(n.date)&&String(b.time)===String(n.time);
}
function usableSource(i){
  if(i<4||i+5>=history.length)return false;
  for(let k=i-3;k<=i;k++)if(!nextMatches(history[k-1],history[k]))return false;
  for(let k=i+1;k<=i+5;k++)if(!nextMatches(history[k-1],history[k]))return false;
  return true;
}
function blankBySize(){return Object.fromEntries([5,6,7,8,9,10].map(n=>[n,0]));}
function simulate(label,candidateFn){
  const sizeSeries=blankBySize(),sizePayout=blankBySize(),sizePositiveChecks=blankBySize(),sizePerfect=blankBySize();
  const hitDistribution={},active=new Map();
  let validWindows=0,signalWindows=0,createdSeries=0,checks=0,totalHits=0,totalPayout=0,positivePayoutChecks=0,zeroHitPayoutChecks=0,seriesWithPayout=0,perfectChecks=0;
  const bestBySize={},perfectExamples=[];
  let best={hits:-1,size:0,draw:null,source:null,numbers:[]};
  const startIndex=Math.max(4,history.length-100);
  for(let i=startIndex;i<history.length-5;i++){
    if(!usableSource(i))continue;
    validWindows++;
    const features=E.rank(history.slice(i-4,i+1)),candidates=candidateFn(features)||[];
    if(!candidates.length)continue;
    signalWindows++;
    const source=history[i].draw;
    for(const c of candidates){
      const size=c.numbers.length;if(size<5||size>10)continue;
      const key=c.numbers.join(',');
      const activeEnd=active.get(key)||0;
      if(activeEnd>=source+1)continue;
      active.set(key,source+5);
      createdSeries++;sizeSeries[size]++;
      let seriesPay=0;
      for(let j=1;j<=5;j++){
        const fact=history[i+j],hits=c.numbers.filter(n=>fact.balls.includes(n)).length,pay=Number(E.payout(size,hits)||0);
        checks++;totalHits+=hits;totalPayout+=pay;sizePayout[size]+=pay;seriesPay+=pay;
        hitDistribution[`${size}:${hits}`]=(hitDistribution[`${size}:${hits}`]||0)+1;
        if(pay>0){positivePayoutChecks++;sizePositiveChecks[size]++;if(hits===0)zeroHitPayoutChecks++;}
        if(hits===size){perfectChecks++;sizePerfect[size]++;if(perfectExamples.length<20)perfectExamples.push({size,draw:fact.draw,source,numbers:c.numbers.slice(),payout:pay});}
        const bs=bestBySize[size];if(!bs||hits>bs.hits)bestBySize[size]={hits,draw:fact.draw,source,numbers:c.numbers.slice(),payout:pay};
        if(hits>best.hits||hits===best.hits&&size<best.size)best={hits,size,draw:fact.draw,source,numbers:c.numbers.slice(),payout:pay};
      }
      if(seriesPay>0)seriesWithPayout++;
    }
    if(active.size>2500)for(const [k,end] of active)if(end<source-10)active.delete(k);
  }
  return {
    label,
    validWindows,signalWindows,createdSeries,sizeSeries,
    checks,averageHitsPerCheck:Number((totalHits/Math.max(1,checks)).toFixed(4)),
    positivePayoutChecks,positivePayoutRate:Number((positivePayoutChecks/Math.max(1,checks)).toFixed(6)),zeroHitPayoutChecks,seriesWithPayout,perfectChecks,best,bestBySize,perfectExamples,
    grossPayoutRub:totalPayout,payoutPerCheckRub:Number((totalPayout/Math.max(1,checks)).toFixed(4)),payoutPerSeriesRub:Number((totalPayout/Math.max(1,createdSeries)).toFixed(4)),sizePayout,sizePositiveChecks,sizePerfect,
    hitDistribution
  };
}
function newCandidates(features){return E.independentCandidates(features);}
function simulateMini(size){
  const active=new Map(),hitDistribution={};
  let validWindows=0,signalWindows=0,createdSeries=0,checks=0,totalPayout=0,positivePayoutChecks=0,bestHits=0,verticalOnly=0,mixedShape=0;
  const startIndex=Math.max(4,history.length-100);
  for(let i=startIndex;i<history.length-5;i++){
    if(!usableSource(i))continue;
    validWindows++;
    const features=E.rank(history.slice(i-4,i+1)),c=E.miniSearch(features,size);
    if(!c)continue;
    signalWindows++;
    const source=history[i].draw,key=c.numbers.join(','),activeEnd=active.get(key)||0;
    if(activeEnd>=source+1)continue;
    active.set(key,source+5);createdSeries++;const cols=new Set(c.numbers.map(n=>(n-1)%10));if(cols.size===1)verticalOnly++;else mixedShape++;
    for(let j=1;j<=5;j++){
      const fact=history[i+j],hits=c.numbers.filter(n=>fact.balls.includes(n)).length,pay=Number(E.payout(size,hits)||0);
      checks++;totalPayout+=pay;if(pay>0)positivePayoutChecks++;bestHits=Math.max(bestHits,hits);
      hitDistribution[hits]=(hitDistribution[hits]||0)+1;
    }
  }
  return {size,validWindows,signalWindows,createdSeries,verticalOnly,mixedShape,checks,positivePayoutChecks,bestHits,grossPayoutRub:totalPayout,hitDistribution};
}

const legacy=simulate('legacy_forced_sizes_1.1',legacyCandidates);
const natural=simulate('natural_sizes_1.2',newCandidates);
const mini3=simulateMini(3),mini4=simulateMini(4);
const delta={
  series:natural.createdSeries-legacy.createdSeries,
  grossPayoutRub:natural.grossPayoutRub-legacy.grossPayoutRub,
  positivePayoutChecks:natural.positivePayoutChecks-legacy.positivePayoutChecks
};
const report={
  generatedAt:new Date().toISOString(),
  engineVersion:E.VERSION,
  archive:{draws:history.length,first:history.at(-100),last:history.at(-1)},
  method:'Walk-forward только по последним 100 тиражам. Для каждого полностью последовательного 5-тиражного окна IRIS фиксируется до фактов и проверяется на следующих 5 тиражах. Одинаковая активная комбинация повторно не запускается.',
  payoutNote:'grossPayoutRub — сумма выплат по встроенной таблице приложения, без вычета стоимости ставок.',
  legacy,natural,mini3,mini4,delta
};
fs.writeFileSync('iris-natural-backtest-last100-v63.json',JSON.stringify(report,null,2)+'\n');

const rows=[5,6,7,8,9,10].map(n=>`| ${n} | ${legacy.sizeSeries[n]} | ${natural.sizeSeries[n]} | ${legacy.sizePayout[n].toLocaleString('ru-RU')} ₽ | ${natural.sizePayout[n].toLocaleString('ru-RU')} ₽ |`).join('\n');
const md=`# IRIS 1.3 · walk-forward последних 100 тиражей

Проверка: последние **100 тиражей**, №${history.at(-100).draw}–№${history.at(-1).draw}.

Сравнение старой принудительной схемы размеров с IRIS 1.3, где размер основной комбинации определяется естественным окончанием подтверждённой структуры.

| Размер | Старых серий | IRIS 1.3 серий | Старая выплата | IRIS 1.3 выплата |
|---:|---:|---:|---:|---:|
${rows}

**Старая схема:** ${legacy.createdSeries} серий, ${legacy.positivePayoutChecks} проверок с выплатой, всего **${legacy.grossPayoutRub.toLocaleString('ru-RU')} ₽**; средняя выплата на проверку **${legacy.payoutPerCheckRub.toLocaleString('ru-RU')} ₽**.

**IRIS 1.3:** ${natural.createdSeries} серий, ${natural.positivePayoutChecks} проверок с выплатой, всего **${natural.grossPayoutRub.toLocaleString('ru-RU')} ₽**; средняя выплата на проверку **${natural.payoutPerCheckRub.toLocaleString('ru-RU')} ₽**.

Разница по выплатам: **${delta.grossPayoutRub>=0?'+':''}${delta.grossPayoutRub.toLocaleString('ru-RU')} ₽**.\n\n**MINI-3 по восстановленному историческому правилу:** ${mini3.createdSeries} серий; чистый один столб ${mini3.verticalOnly}, смешанная геометрия ${mini3.mixedShape}; ${mini3.positivePayoutChecks} проверок с выплатой, всего **${mini3.grossPayoutRub.toLocaleString('ru-RU')} ₽**, максимум ${mini3.bestHits}/3.\n\n**MINI-4 по восстановленному историческому правилу:** ${mini4.createdSeries} серий; чистый один столб ${mini4.verticalOnly}, смешанная геометрия ${mini4.mixedShape}; ${mini4.positivePayoutChecks} проверок с выплатой, всего **${mini4.grossPayoutRub.toLocaleString('ru-RU')} ₽**, максимум ${mini4.bestHits}/4.

> Это исторический walk-forward, а не обещание будущего результата. Выплата указана по внутренней таблице приложения без вычета стоимости ставок.
`;
fs.writeFileSync('IRIS_NATURAL_BACKTEST_LAST100.md',md);
console.log(JSON.stringify({archive:report.archive,legacy:{createdSeries:legacy.createdSeries,sizeSeries:legacy.sizeSeries,grossPayoutRub:legacy.grossPayoutRub,positivePayoutChecks:legacy.positivePayoutChecks},natural:{createdSeries:natural.createdSeries,sizeSeries:natural.sizeSeries,grossPayoutRub:natural.grossPayoutRub,positivePayoutChecks:natural.positivePayoutChecks},mini3,mini4,delta},null,2));
