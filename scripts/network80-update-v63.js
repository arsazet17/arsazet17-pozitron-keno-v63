'use strict';
const fs=require('fs');
const E=require('../network80-engine-v63.js');
const S=require('./network80-server-v63.js');

const HISTORY='keno-history-v63.json';
const STATE='network80-state-v63.json';
const ARCHIVE='network80-archive-v63.json';

const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};
const write=(file,value)=>{
  const tmp=file+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n');
  fs.renameSync(tmp,file);
};

const draws=read(HISTORY,[]);
if(!Array.isArray(draws)||draws.length<120)throw new Error('NETWORK80: недостаточно истории KENO');
const state=read(STATE,null);
const archive=read(ARCHIVE,[]);
const out=S.processNetwork80(draws,state,archive,E,new Date().toISOString());
write(STATE,out.state);
write(ARCHIVE,out.archive);
const pending=out.archive.find(p=>!p.actual);
console.log(`NETWORK80 UPDATE PASS · latest №${draws.at(-1).draw} · settled ${out.state.settledCount||0} · pending №${pending?.targetDraw||'—'} · archive ${out.archive.length}`);
