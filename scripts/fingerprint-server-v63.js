'use strict';

const VERSION='6.3-server-6500';
const MAX_ARCHIVE=300;

function clone(v){return JSON.parse(JSON.stringify(v));}
function byDraw(draws){return new Map(draws.map((d,i)=>[Number(d.draw),{draw:d,index:i}]));}
function contextThrough(draws,drawNo){
  const idx=draws.findIndex(d=>Number(d.draw)===Number(drawNo));
  if(idx<0)return null;
  return draws.slice(Math.max(0,idx-899),idx+1);
}
function normalizeArchive(a){
  if(!Array.isArray(a))return [];
  const m=new Map();
  for(const p of a){const t=Number(p?.targetDraw);if(Number.isFinite(t))m.set(t,p);}
  return [...m.values()].sort((x,y)=>Number(x.targetDraw)-Number(y.targetDraw));
}
function bootstrap(draws,engine,steps=36){
  let weights=engine.normalizeWeights(engine.DEFAULT_WEIGHTS),trained=0;
  if(draws.length<10)return {weights,trained};
  const end=draws.length-1;
  const start=Math.max(8,end-steps);
  for(let i=start;i<end;i++){
    const context=draws.slice(Math.max(0,i-899),i+1);
    const pred=engine.forecast(context,weights);
    if(!pred)continue;
    const settled=engine.settlePrediction(pred,draws[i+1],weights);
    weights=settled.weights;trained++;
  }
  return {weights,trained};
}
function stampPrediction(pred,now,mode='live'){
  return {...pred,version:VERSION,server:true,generatedMode:mode,createdAt:now};
}
function createForecast(draws,sourceDraw,weights,engine,now,mode='live'){
  const context=contextThrough(draws,sourceDraw);
  if(!context)throw new Error(`Нет контекста для sourceDraw ${sourceDraw}`);
  const pred=engine.forecast(context,weights);
  if(!pred)throw new Error(`Не удалось создать прогноз после №${sourceDraw}`);
  if(Number(pred.sourceDraw)!==Number(sourceDraw)||Number(pred.targetDraw)!==Number(sourceDraw)+1){
    throw new Error(`Неверная граница прогноза: source=${pred.sourceDraw}, target=${pred.targetDraw}`);
  }
  return stampPrediction(pred,now,mode);
}
function processFingerprint(draws,stateInput,archiveInput,engine,now=new Date().toISOString()){
  if(!Array.isArray(draws)||draws.length<10)throw new Error('Недостаточно истории для SERVER LEARNING');
  draws=clone(draws).sort((a,b)=>Number(a.draw)-Number(b.draw));
  const index=byDraw(draws),latest=Number(draws.at(-1).draw);
  let archive=normalizeArchive(clone(archiveInput||[]));
  let state=stateInput&&stateInput.serverLearning?clone(stateInput):null;
  let changed=false;

  if(!state){
    const b=bootstrap(draws,engine,36);
    state={version:VERSION,serverLearning:true,initializedAt:now,updatedAt:now,bootstrapCount:b.trained,settledCount:0,weights:b.weights,lastSettledDraw:latest,nextTargetDraw:latest+1};
    archive=[createForecast(draws,latest,state.weights,engine,now,'live')];
    changed=true;
  }else{
    state.version=VERSION;
    state.weights=engine.normalizeWeights(state.weights);
    state.bootstrapCount=Number(state.bootstrapCount||0);
    state.lastSettledDraw=Number(state.lastSettledDraw||0);

    let pending=archive.find(p=>!p.actual);
    if(!pending){
      const source=Math.max(state.lastSettledDraw||0, Number(archive.at(-1)?.targetDraw||1)-1);
      const safeSource=index.has(source)?source:latest;
      archive.push(createForecast(draws,safeSource,state.weights,engine,now,safeSource===latest?'live':'recovery'));
      changed=true;
      archive=normalizeArchive(archive);
      pending=archive.find(p=>!p.actual);
    }

    let guard=0;
    while(pending && Number(pending.targetDraw)<=latest){
      if(++guard>500)throw new Error('Защита от бесконечного цикла SERVER LEARNING');
      const target=Number(pending.targetDraw),rec=index.get(target);
      if(!rec)break; // не перескакиваем отсутствующий фактический тираж
      const result=engine.settlePrediction(pending,rec.draw,state.weights);
      const settled={...result.prediction,server:true,version:VERSION};
      const pos=archive.findIndex(p=>Number(p.targetDraw)===target);
      archive[pos]=settled;
      state.weights=result.weights;
      state.lastSettledDraw=target;
      state.settledCount=Number(state.settledCount||0)+1;
      changed=true;

      const nextTarget=target+1;
      let next=archive.find(p=>Number(p.targetDraw)===nextTarget);
      if(!next){
        const mode=nextTarget<=latest?'recovery':'live';
        next=createForecast(draws,target,state.weights,engine,now,mode);
        archive.push(next);
        archive=normalizeArchive(archive);
        changed=true;
      }
      pending=archive.find(p=>!p.actual);
    }
  }

  archive=normalizeArchive(archive);
  const pending=archive.filter(p=>!p.actual);
  if(pending.length!==1)throw new Error(`Ожидался 1 активный прогноз, получено ${pending.length}`);
  if(Number(pending[0].targetDraw)!==latest+1){
    throw new Error(`Активный прогноз №${pending[0].targetDraw}, а должен быть №${latest+1}`);
  }
  state.nextTargetDraw=latest+1;
  if(changed||!state.updatedAt)state.updatedAt=now;
  state.archiveCount=archive.length;
  state.pendingCreatedAt=pending[0].createdAt;
  state.pendingSourceDraw=Number(pending[0].sourceDraw);
  if(archive.length>MAX_ARCHIVE)archive=archive.slice(-MAX_ARCHIVE);
  return {state,archive,changed};
}

module.exports={VERSION,processFingerprint,bootstrap,createForecast};
