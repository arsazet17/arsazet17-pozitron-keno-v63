'use strict';
const fs=require('node:fs');
const E=require('../iris-engine-v63.js');
function read(file,fallback){if(!fs.existsSync(file))return fallback;return JSON.parse(fs.readFileSync(file,'utf8'));}
function update(){const history=read('keno-history-v63.json',[]);const previous=read('iris-archive-v63.json',{series:[]});if(!Array.isArray(previous.series))throw new Error('IRIS: повреждён архив, перезапись запрещена');const out=E.process(history,previous.series,new Date().toISOString(),{origin:'server'});delete out.created;const old=JSON.stringify(previous.series),next=JSON.stringify(out.series);if(old===next&&previous.sourceCutoff===out.sourceCutoff&&previous.version===out.version)return console.log('IRIS: новых фактов или серий нет');fs.writeFileSync('iris-archive-v63.json.tmp',JSON.stringify(out,null,2)+'\n');fs.renameSync('iris-archive-v63.json.tmp','iris-archive-v63.json');console.log('IRIS: сохранено серий',out.series.length,'последний факт',out.sourceCutoff);}
if(require.main===module)update();module.exports={update};
