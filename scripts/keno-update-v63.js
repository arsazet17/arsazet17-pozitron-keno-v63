'use strict';

const fs=require('fs');
const ENGINE=require('../engine-v63.js');
const {VERSION,processFingerprint}=require('./fingerprint-server-v63.js');

const SOURCE_URL='https://lucky-numbers.ru/lottery/ru/keno2';
const READER_URL=`https://r.jina.ai/${SOURCE_URL}`;
const OFFICIAL_ARCHIVE='https://www.stoloto.ru/keno2/archive';
const OFFICIAL_READER='https://r.jina.ai/https://www.stoloto.ru/keno2/archive';

const HISTORY='keno-history-v63.json';
const STATUS='keno-status-v63.json';
const STATE='fingerprint-state-v63.json';
const ARCHIVE='fingerprint-archive-v63.json';

function cleanText(value){
  return String(value||'')
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;|\u00a0/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();
}

function normalizeDrawNumber(value){
  const digits=String(value||'').replace(/\D/g,'');
  const n=Number(digits);
  return Number.isInteger(n)&&n>=100000&&n<=999999?n:null;
}

function validColumn(value){
  const n=Number(value);
  return Number.isInteger(n)&&n>=1&&n<=10?n:null;
}

function validDraw(item){
  const draw=Number(item?.draw);
  const balls=Array.isArray(item?.balls)?item.balls.map(Number):[];
  if(!Number.isInteger(draw)||draw<100000||draw>999999||balls.length!==20||new Set(balls).size!==20||balls.some(n=>!Number.isInteger(n)||n<1||n>80))return null;
  const out={draw,date:String(item?.date||''),time:String(item?.time||''),balls};
  const column=validColumn(item?.column??item?.officialColumn);
  if(column)out.column=column;
  if(item?.columnSource)out.columnSource=String(item.columnSource);
  return out;
}

function uniqueSorted(items){
  const map=new Map();
  for(const item of items){const d=validDraw(item);if(d)map.set(d.draw,d)}
  return [...map.values()].sort((a,b)=>a.draw-b.draw);
}

function parseHtml(html){
  const rows=[];
  const tableRows=String(html||'').match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
  for(const row of tableRows){
    const balls=[];
    const buttons=row.match(/<button\b[\s\S]*?<\/button>/gi)||[];
    for(const button of buttons){
      const text=cleanText(button);
      if(!/^\d{1,2}$/.test(text))continue;
      const number=Number(text);
      if(number>=1&&number<=80)balls.push(number);
      if(balls.length===20)break;
    }
    if(balls.length!==20||new Set(balls).size!==20)continue;
    const text=cleanText(row);
    const dateMatch=text.match(/(\d{2}\.\d{2}\.\d{2,4})\s*,?\s*(\d{2}:\d{2})/);
    if(!dateMatch)continue;
    const beforeDate=text.slice(0,text.indexOf(dateMatch[0]));
    const drawMatches=beforeDate.match(/\b\d{3}[\s\u00a0]?\d{3}\b|\b\d{6}\b/g)||[];
    const draw=normalizeDrawNumber(drawMatches.at(-1));
    if(!draw)continue;
    rows.push({draw,date:dateMatch[1],time:dateMatch[2],balls});
  }
  return uniqueSorted(rows);
}

function parseReaderText(text){
  const rows=[];
  for(const line of String(text||'').split(/\r?\n/)){
    const buttonMatches=[...line.matchAll(/\[Button:\s*(\d{1,2})\]/gi)];
    const balls=buttonMatches.slice(0,20).map(m=>Number(m[1]));
    if(balls.length!==20||new Set(balls).size!==20||balls.some(n=>n<1||n>80))continue;
    const dateMatch=line.match(/(\d{2}\.\d{2}\.\d{2,4})\s*,?\s*(\d{2}:\d{2})/);
    if(!dateMatch)continue;
    const beforeDate=line.slice(0,line.indexOf(dateMatch[0]));
    const drawMatches=beforeDate.match(/\b\d{3}[\s\u00a0]?\d{3}\b|\b\d{6}\b/g)||[];
    const draw=normalizeDrawNumber(drawMatches.at(-1));
    if(!draw)continue;
    rows.push({draw,date:dateMatch[1],time:dateMatch[2],balls});
  }
  return uniqueSorted(rows);
}

function parseSource(text){const html=parseHtml(text);return html.length?html:parseReaderText(text)}

function decodeOfficialText(text){return String(text||'').replace(/&nbsp;|&#160;/gi,' ').replace(/&thinsp;|&#8201;/gi,' ').replace(/&quot;/gi,'"').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')}
function parseOfficialColumns(text){
  const clean=decodeOfficialText(text),map=new Map();
  const re=/№\s*[\u2009\u00a0 ]*(\d{5,})[\s\S]{0,320}?Столбец\s*(10|[1-9])/gi;
  let m;while((m=re.exec(clean)))map.set(Number(m[1]),Number(m[2]));
  return map;
}

function readJson(path,fallback){try{return JSON.parse(fs.readFileSync(path,'utf8'))}catch{return fallback}}
function writeAtomic(path,text){const tmp=`${path}.tmp`;fs.writeFileSync(tmp,text);fs.renameSync(tmp,path)}

async function fetchText(url,headers={},attempts=3){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 GitHub-Actions Positron-Keno-v6.3/6504',accept:'text/html,text/plain,application/xhtml+xml,*/*;q=0.8','cache-control':'no-cache',...headers},redirect:'follow',signal:AbortSignal.timeout(35000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.text();
    }catch(error){lastError=error;if(attempt<attempts)await new Promise(r=>setTimeout(r,attempt*2500))}
  }
  throw lastError;
}

async function fetchFreshDraws(){
  const sources=[
    {name:'Lucky Numbers',url:`${SOURCE_URL}?positron=${Date.now()}`,headers:{}},
    {name:'Jina Reader',url:`${READER_URL}?positron=${Date.now()}`,headers:{'x-no-cache':'true','x-return-format':'markdown'}}
  ];
  const errors=[];
  for(const source of sources){
    try{const rows=parseSource(await fetchText(source.url,source.headers));if(!rows.length)throw new Error('тиражи не распознаны');return {rows,source:source.name}}
    catch(error){errors.push(`${source.name}: ${error?.message||error}`)}
  }
  throw new Error(errors.join('; '));
}

async function fetchOfficialColumns(){
  const merged=new Map();
  for(const url of [`${OFFICIAL_ARCHIVE}?positron=${Date.now()}`,`${OFFICIAL_READER}?positron=${Date.now()}`]){
    try{const parsed=parseOfficialColumns(await fetchText(url,{'x-no-cache':'true'},2));for(const [draw,column] of parsed)merged.set(draw,column);if(merged.size>=5)break}
    catch(error){console.warn('Official column source:',error?.message||error)}
  }
  return merged;
}

async function buildHistory(){
  const stored=uniqueSorted(readJson(HISTORY,[]));
  const storedMap=new Map(stored.map(d=>[d.draw,d]));
  const {rows:fresh,source}=await fetchFreshDraws();
  const official=await fetchOfficialColumns();
  for(const item of fresh){
    const previous=storedMap.get(item.draw)||{};
    const d={...previous,...item};
    const officialColumn=validColumn(official.get(d.draw));
    if(officialColumn){d.column=officialColumn;d.columnSource='stoloto-official'}
    else if(validColumn(previous.column)){d.column=Number(previous.column);d.columnSource=String(previous.columnSource||'stoloto-official-cache')}
    storedMap.set(d.draw,d);
  }
  const draws=uniqueSorted([...storedMap.values()]);
  if(!draws.length)throw new Error('Итоговая база 6.3 пуста');
  return {draws,source};
}

function selfTest(){
  const readerLine='№ 325184 09.08.26, 21:02 '+Array.from({length:20},(_,i)=>`[Button: ${i+1}]`).join(' ');
  const parsed=parseReaderText(readerLine);
  if(parsed.length!==1||parsed[0].draw!==325184||parsed[0].balls.length!==20)throw new Error('SELFTEST Lucky Numbers parser failed');
  const cols=parseOfficialColumns('№ 325179 Больше чётных · Столбец 6 Тур 1');
  if(cols.get(325179)!==6)throw new Error('SELFTEST official column parser failed');
}

async function main(){
  selfTest();
  const oldState=readJson(STATE,null),oldArchive=readJson(ARCHIVE,[]),oldHistory=readJson(HISTORY,[]),oldStatus=readJson(STATUS,null);
  const {draws,source}=await buildHistory();
  const now=new Date().toISOString();
  const {state,archive,changed}=processFingerprint(draws,oldState,oldArchive,ENGINE,now);
  const latest=draws.at(-1);
  const historyChanged=JSON.stringify(oldHistory)!==JSON.stringify(draws);
  const updatedAt=(historyChanged||changed)?now:(oldStatus?.updatedAt||state.updatedAt||now);
  writeAtomic(HISTORY,JSON.stringify(draws)+'\n');
  writeAtomic(STATE,JSON.stringify(state,null,2)+'\n');
  writeAtomic(ARCHIVE,JSON.stringify(archive,null,2)+'\n');
  writeAtomic(STATUS,JSON.stringify({version:VERSION,source,sourceUrl:SOURCE_URL,serverLearning:true,updatedAt,drawsStored:draws.length,latestDraw:Number(latest.draw),latestDate:String(latest.date||''),latestTime:String(latest.time||''),latestColumn:Number(latest.column||0)||null,latestColumnSource:String(latest.columnSource||'fallback-calculation'),officialColumnsStored:draws.filter(d=>String(d.columnSource||'').startsWith('stoloto-official')).length,fingerprintNext:Number(state.nextTargetDraw),fingerprintArchive:archive.length,fingerprintSettled:Number(state.settledCount||0),weights:state.weights},null,2)+'\n');
  console.log(`KENO 6.3 SERVER OK: источник ${source}, база ${draws.length}, последний №${latest.draw}, закрыто ${state.settledCount||0}, следующий прогноз №${state.nextTargetDraw}`);
}

module.exports={validColumn,validDraw,parseHtml,parseReaderText,parseSource,parseOfficialColumns,selfTest};
if(require.main===module){main().catch(error=>{console.error(error?.stack||error?.message||error);process.exit(1)})}
