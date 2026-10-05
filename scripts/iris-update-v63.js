'use strict';
const fs=require('node:fs'),E=require('../iris-engine-v63.js');
function read(file,fallback){return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):fallback;}
function update(){const history=read('keno-history-v63.json',[]),previous=read('iris-archive-v63.json',{series:[],gateLog:[]});if(!Array.isArray(previous.series))throw new Error('Повреждён архив Iris: перезапись запрещена');
 // Never reconstruct live predictions or backdate creation; research is kept separately.
 const out=E.process(history,previous.series,new Date().toISOString(),{origin:'server',gateLog:previous.gateLog||[]});delete out.created;
 if(JSON.stringify(previous.series)===JSON.stringify(out.series)&&JSON.stringify(previous.gateLog||[])===JSON.stringify(out.gateLog)&&previous.sourceCutoff===out.sourceCutoff&&previous.version===out.version)return;
 fs.writeFileSync('iris-archive-v63.json.tmp',JSON.stringify(out,null,2)+'\n');fs.renameSync('iris-archive-v63.json.tmp','iris-archive-v63.json');console.log('Iris:',out.series.length,'серий;',out.evaluation.message);}
if(require.main===module)update();module.exports={update};
