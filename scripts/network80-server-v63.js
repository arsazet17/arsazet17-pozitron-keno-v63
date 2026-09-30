'use strict';

const VERSION='6.3-network80-server-0100';
const MAX_ARCHIVE=400;
const clone=v=>JSON.parse(JSON.stringify(v));

function normalizeArchive(input){
  if(!Array.isArray(input))return [];
  const map=new Map();
  for(const p of input){const t=Number(p?.targetDraw);if(Number.isFinite(t))map.set(t,p);}
  return [...map.values()].sort((a,b)=>Number(a.targetDraw)-Number(b.targetDraw));
}
function contextThrough(draws,drawNo){
  const i=draws.findIndex(d=>Number(d.draw)===Number(drawNo));
  return i<0?null:draws.slice(0,i+1);
}
function createForecast(draws,sourceDraw,engine,now,mode='live'){
  const context=contextThrough(draws,sourceDraw);if(!context)throw new Error(`NETWORK80: нет контекста №${sourceDraw}`);
  const p=engine.forecast(context);if(!p)throw new Error(`NETWORK80: не создан прогноз после №${sourceDraw}`);
  if(Number(p.sourceDraw)!==Number(sourceDraw)||Number(p.targetDraw)!==Number(sourceDraw)+1)throw new Error('NETWORK80: неверная граница прогноза');
  // Архив не раздуваем карточками 80 чисел и полным списком рёбер.
  return {...p,cards:undefined,topEdges:(p.topEdges||[]).slice(0,30),server:true,serverVersion:VERSION,generatedMode:mode,createdAt:now};
}
function processNetwork80(draws,stateInput,archiveInput,engine,now=new Date().toISOString()){
  if(!Array.isArray(draws)||draws.length<120)throw new Error('NETWORK80: недостаточно истории');
  draws=clone(draws).sort((a,b)=>Number(a.draw)-Number(b.draw));
  const byDraw=new Map(draws.map(d=>[Number(d.draw),d])),latest=Number(draws.at(-1).draw);
  let archive=normalizeArchive(clone(archiveInput||[]));
  let state=stateInput&&stateInput.network80?clone(stateInput):null;
  let changed=false;

  if(!state){
    const p=createForecast(draws,latest,engine,now,'live');
    archive=[p];
    state={version:VERSION,network80:true,initializedAt:now,updatedAt:now,lastSettledDraw:latest,settledCount:0,nextTargetDraw:latest+1,pendingSourceDraw:latest};
    changed=true;
  }else{
    state.version=VERSION;state.settledCount=Number(state.settledCount||0);state.lastSettledDraw=Number(state.lastSettledDraw||0);
    let pending=archive.find(p=>!p.actual);
    if(!pending){
      const source=Math.max(state.lastSettledDraw||0,Number(archive.at(-1)?.targetDraw||1)-1);
      const safe=byDraw.has(source)?source:latest;
      archive.push(createForecast(draws,safe,engine,now,safe===latest?'live':'recovery'));
      archive=normalizeArchive(archive);pending=archive.find(p=>!p.actual);changed=true;
    }
    let guard=0;
    while(pending&&Number(pending.targetDraw)<=latest){
      if(++guard>500)throw new Error('NETWORK80: loop guard');
      const target=Number(pending.targetDraw),actual=byDraw.get(target);if(!actual)break;
      const settled=engine.settle(pending,actual);
      const pos=archive.findIndex(p=>Number(p.targetDraw)===target);archive[pos]={...settled,server:true,serverVersion:VERSION};
      state.lastSettledDraw=target;state.settledCount++;changed=true;
      const nextTarget=target+1;
      if(!archive.some(p=>Number(p.targetDraw)===nextTarget)){
        archive.push(createForecast(draws,target,engine,now,nextTarget<=latest?'recovery':'live'));archive=normalizeArchive(archive);changed=true;
      }
      pending=archive.find(p=>!p.actual);
    }
  }

  archive=normalizeArchive(archive);
  const pending=archive.filter(p=>!p.actual);
  if(pending.length!==1)throw new Error(`NETWORK80: ожидается 1 pending, получено ${pending.length}`);
  if(Number(pending[0].targetDraw)!==latest+1)throw new Error(`NETWORK80: pending №${pending[0].targetDraw}, latest+1=${latest+1}`);
  state.nextTargetDraw=latest+1;state.pendingSourceDraw=Number(pending[0].sourceDraw);state.pendingCreatedAt=pending[0].createdAt;state.archiveCount=archive.length;
  if(changed||!state.updatedAt)state.updatedAt=now;
  if(archive.length>MAX_ARCHIVE)archive=archive.slice(-MAX_ARCHIVE);
  return {state,archive,changed};
}

module.exports={VERSION,processNetwork80,createForecast};
