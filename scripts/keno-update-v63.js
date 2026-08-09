
'use strict';
const fs=require('fs');
const ENGINE=require('../engine-v63.js');
const {VERSION,processFingerprint}=require('./fingerprint-server-v63.js');

const SOURCE='https://raw.githubusercontent.com/arsazet17/pozitron-keno-v5/main/keno-history-v62.json';
const OFFICIAL_ARCHIVE='https://www.stoloto.ru/keno2/archive';
const OFFICIAL_READER='https://r.jina.ai/https://www.stoloto.ru/keno2/archive';
const HISTORY='keno-history-v63.json';
const STATUS='keno-status-v63.json';
const STATE='fingerprint-state-v63.json';
const ARCHIVE='fingerprint-archive-v63.json';

function readJson(path,fallback){
  try{
    return JSON.parse(fs.readFileSync(path,'utf8'));
  }catch{
    return fallback;
  }
}

function validColumn(value){
  const n=Number(value);
  return Number.isInteger(n)&&n>=1&&n<=10?n:null;
}

function validDraw(o){
  const draw=Number(o?.draw);
  const balls=(o?.balls||[])
    .map(Number)
    .filter(n=>n>=1&&n<=80)
    .slice(0,20);

  if(
