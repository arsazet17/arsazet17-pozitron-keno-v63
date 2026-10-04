'use strict';
const fs=require('node:fs');
const E=require('../iris-engine-v63.js');
function read(file,fallback){if(!fs.existsSync(file))return fallback;return JSON.parse(fs.readFileSync(file,'utf8'));}
function recoverRecent(history,existing){
  const draws=E.normalize(history),series=existing.slice();
  if(series.some(s=>s.version===E.VERSION)||draws.length<5)return series;
  const from=Math.max(4,draws.length-12);
  let created=0;
  for(let i=from;i<draws.length;i++){
    const source=draws[i],prefix=draws.slice(0,i+1),createdAt=new Date(E.timestamp(source)+60000).toISOString(),evaluation=E.evaluate(prefix,createdAt);
    if(evaluation.state!=='allowed'||!evaluation.permissionA)continue;
    for(const candidate of evaluation.candidates){
      const s=E.create(candidate,evaluation,createdAt,'server-recovery');
      if(series.some(x=>x.id===s.id))continue;
      series.push(s);created++;
    }
  }
  if(created)console.log('IRIS recovery: восстановлено серий',created,'строго из cutoff до каждого факта');
  return E.settle(series,draws);
}
function update(){
  const history=read('keno-history-v63.json',[]),previous=read('iris-archive-v63.json',{series:[]});
  if(!Array.isArray(previous.series))throw new Error('IRIS: повреждён архив, перезапись запрещена');
  const recovered=recoverRecent(history,previous.series);
  const out=E.process(history,recovered,new Date().toISOString(),{origin:'server'});delete out.created;
  const old=JSON.stringify(previous.series),next=JSON.stringify(out.series);
  if(old===next&&previous.sourceCutoff===out.sourceCutoff&&previous.version===out.version)return console.log('IRIS: новых фактов или серий нет');
  fs.writeFileSync('iris-archive-v63.json.tmp',JSON.stringify(out,null,2)+'\n');fs.renameSync('iris-archive-v63.json.tmp','iris-archive-v63.json');
  console.log('IRIS: сохранено серий',out.series.length,'последний факт',out.sourceCutoff,'состояние',out.evaluation?.state);
}
if(require.main===module)update();module.exports={update,recoverRecent};
