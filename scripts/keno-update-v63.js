'use strict';

const fs=require('fs');
const ENGINE=require('../engine-v63.js');
const {VERSION,processFingerprint}=require('./fingerprint-server-v63.js');

const STOLOTO_URL='https://www.stoloto.ru/keno2/archive';
const STOLOTO_READER='https://r.jina.ai/https://www.stoloto.ru/keno2/archive';
const LUCKY_URL='https://lucky-numbers.ru/lottery/ru/keno2';
const LUCKY_READER='https://r.jina.ai/https://lucky-numbers.ru/lottery/ru/keno2';

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
    .replace(/&thinsp;|&#8201;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
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

function parseJson(text){
  try{
    const j=JSON.parse(String(text||''));
    const arr=Array.isArray(j)?j:(j.draws||j.records||j.history||j.results||[]);
    if(!Array.isArray(arr))return [];
    return uniqueSorted(arr.map(x=>({
      draw:Number(x?.draw??x?.number??x?.drawNumber??x?.id),
      date:String(x?.date??x?.drawDate??''),
      time:String(x?.time??x?.drawTime??''),
      balls:Array.isArray(x?.balls)?x.balls:(Array.isArray(x?.numbers)?x.numbers:[]),
      column:x?.column??x?.officialColumn,
      columnSource:x?.columnSource
    })));
  }catch{return []}
}

function drawBeforeDate(text,dateText){
  const at=text.indexOf(dateText);
  const before=at>=0?text.slice(0,at):text;
  const matches=before.match(/(?:№\s*)?\b\d{3}[\s\u00a0]?\d{3}\b|(?:№\s*)?\b\d{6}\b/g)||[];
  return normalizeDrawNumber(matches.at(-1));
}

function parseHtml(text){
  const rows=[];
  const tableRows=String(text||'').match(/<tr\b[\s\S]*?<\/tr>/gi)||[];
  for(const row of tableRows){
    const buttons=row.match(/<button\b[\s\S]*?<\/button>/gi)||[];
    const balls=[];
    for(const button of buttons){
      const t=cleanText(button);
      if(!/^\d{1,2}$/.test(t))continue;
      const n=Number(t);
      if(n>=1&&n<=80)balls.push(n);
      if(balls.length===20)break;
    }
    if(balls.length!==20||new Set(balls).size!==20)continue;
    const flat=cleanText(row);
    const dm=flat.match(/(\d{2}\.\d{2}\.\d{2,4})\s*,?\s*(\d{2}:\d{2})/);
    if(!dm)continue;
    const draw=drawBeforeDate(flat,dm[0]);
    if(!draw)continue;
    rows.push({draw,date:dm[1],time:dm[2],balls});
  }
  return uniqueSorted(rows);
}

function parseReaderText(text){
  const lines=String(text||'').split(/\r?\n/);
  const rows=[];
  for(let i=0;i<lines.length;i++){
    const chunk=lines.slice(i,i+8).join(' ');
    const dm=chunk.match(/(\d{2}\.\d{2}\.\d{2,4})\s*,?\s*(\d{2}:\d{2})/);
    if(!dm)continue;
    const draw=drawBeforeDate(chunk,dm[0]);
    if(!draw)continue;
    const buttons=[...chunk.matchAll(/\[Button:\s*(\d{1,2})\]/gi)].map(m=>Number(m[1])).filter(n=>n>=1&&n<=80);
    const balls=buttons.slice(0,20);
    if(balls.length!==20||new Set(balls).size!==20)continue;
    rows.push({draw,date:dm[1],time:dm[2],balls});
  }
  return uniqueSorted(rows);
}

function parsePlainText(text){
  const flat=cleanText(text);
  const rows=[];
  const re=/(?:№\s*)?(\d{6})\s+(\d{2}\.\d{2}\.\d{2,4})\s*,?\s*(\d{2}:\d{2})([\s\S]{0,900}?)(?=(?:№\s*)?\d{6}\s+\d{2}\.\d{2}\.|$)/g;
  let m;
  while((m=re.exec(flat))){
    const nums=(m[4].match(/\b(?:[1-9]|[1-7]\d|80)\b/g)||[]).map(Number);
    const balls=[];
    for(const n of nums){if(!balls.includes(n))balls.push(n);if(balls.length===20)break}
    if(balls.length===20)rows.push({draw:Number(m[1]),date:m[2],time:m[3],balls});
  }
  return uniqueSorted(rows);
}

function parseSource(text){
  for(const parser of [parseJson,parseHtml,parseReaderText,parsePlainText]){
    const rows=parser(text);
    if(rows.length)return rows;
  }
  return [];
}

function parseOfficialColumns(text){
  const clean=cleanText(text),map=new Map();
  const re=/№\s*(\d{5,})[\s\S]{0,360}?Столбец\s*(10|[1-9])/gi;
  let m;while((m=re.exec(clean)))map.set(Number(m[1]),Number(m[2]));
  return map;
}

function readJson(path,fallback){try{return JSON.parse(fs.readFileSync(path,'utf8'))}catch{return fallback}}
function writeAtomic(path,text){const tmp=`${path}.tmp`;fs.writeFileSync(tmp,text);fs.renameSync(tmp,path)}

async function fetchText(url,headers={},attempts=3){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetch(url,{
        headers:{
          'user-agent':'Mozilla/5.0 GitHub-Actions Positron-Keno-v6.3/6505',
          accept:'text/html,text/plain,application/json,application/xhtml+xml,*/*;q=0.8',
          'cache-control':'no-cache',
          ...headers
        },
        redirect:'follow',
        signal:AbortSignal.timeout(35000)
      });
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.text();
    }catch(error){
      lastError=error;
      if(attempt<attempts)await new Promise(r=>setTimeout(r,attempt*2000));
    }
  }
  throw lastError;
}

async function fetchAllSources(){
  const stamp=Date.now();
  const sources=[
    {name:'Столото',url:`${STOLOTO_URL}?positron=${stamp}`,baseUrl:STOLOTO_URL,priority:4,official:true,headers:{}},
    {name:'Столото Reader',url:`${STOLOTO_READER}?positron=${stamp}`,baseUrl:STOLOTO_URL,priority:3,official:true,headers:{'x-no-cache':'true','x-return-format':'markdown'}},
    {name:'Lucky Numbers',url:`${LUCKY_URL}?positron=${stamp}`,baseUrl:LUCKY_URL,priority:2,official:false,headers:{}},
    {name:'Lucky Numbers Reader',url:`${LUCKY_READER}?positron=${stamp}`,baseUrl:LUCKY_URL,priority:1,official:false,headers:{'x-no-cache':'true','x-return-format':'markdown'}}
  ];

  const ok=[],errors=[];
  const results=await Promise.all(sources.map(async source=>{
    try{
      const text=await fetchText(source.url,source.headers,2);
      const rows=parseSource(text);
      if(!rows.length)throw new Error('тиражи не распознаны');
      const latest=Number(rows.at(-1).draw);
      return {ok:true,value:{...source,text,rows,latest}};
    }catch(error){
      return {ok:false,source,error};
    }
  }));
  for(const result of results){
    if(result.ok){
      ok.push(result.value);
      console.log(`${result.value.name}: ${result.value.rows.length} тиражей, последний №${result.value.latest}`);
    }else{
      const message=`${result.source.name}: ${result.error?.message||result.error}`;
      errors.push(message);
      console.warn(message);
    }
  }
  if(!ok.length)throw new Error(errors.join('; '));

  const winner=[...ok].sort((a,b)=>b.latest-a.latest||b.priority-a.priority)[0];
  const merged=new Map();
  for(const source of [...ok].sort((a,b)=>a.priority-b.priority)){
    for(const row of source.rows)merged.set(Number(row.draw),row);
  }

  const officialColumns=new Map();
  for(const source of [...ok].filter(x=>x.official).sort((a,b)=>a.priority-b.priority)){
    for(const [draw,column] of parseOfficialColumns(source.text))officialColumns.set(draw,column);
  }

  return {
    rows:uniqueSorted([...merged.values()]),
    winner,
    officialColumns,
    successful:ok.map(x=>({name:x.name,latest:x.latest,priority:x.priority}))
  };
}

async function buildHistory(){
  const stored=uniqueSorted(readJson(HISTORY,[]));
  const storedMap=new Map(stored.map(d=>[d.draw,d]));
  const fresh=await fetchAllSources();

  for(const item of fresh.rows){
    const previous=storedMap.get(item.draw)||{};
    const d={...previous,...item};
    const officialColumn=validColumn(fresh.officialColumns.get(d.draw));
    if(officialColumn){d.column=officialColumn;d.columnSource='stoloto-official'}
    else if(validColumn(previous.column)){
      d.column=Number(previous.column);
      d.columnSource=String(previous.columnSource||'stoloto-official-cache');
    }
    storedMap.set(d.draw,d);
  }

  const draws=uniqueSorted([...storedMap.values()]);
  if(!draws.length)throw new Error('Итоговая база 6.3 пуста');
  return {draws,fresh};
}

function selfTest(){
  const reader='№ 325210 10.08.26, 06:17 '+Array.from({length:20},(_,i)=>`[Button: ${i+1}]`).join(' ');
  const rows=parseReaderText(reader);
  if(rows.length!==1||rows[0].draw!==325210||rows[0].balls.length!==20)throw new Error('SELFTEST reader parser failed');
  const cols=parseOfficialColumns('№ 325210 Больше чётных · Столбец 7 Тур 1');
  if(cols.get(325210)!==7)throw new Error('SELFTEST official column parser failed');
}

async function main(){
  selfTest();
  const oldState=readJson(STATE,null);
  const oldArchive=readJson(ARCHIVE,[]);
  const oldHistory=readJson(HISTORY,[]);
  const oldStatus=readJson(STATUS,null);

  const {draws,fresh}=await buildHistory();
  const now=new Date().toISOString();
  const {state,archive,changed}=processFingerprint(draws,oldState,oldArchive,ENGINE,now);
  const latest=draws.at(-1);
  const historyChanged=JSON.stringify(oldHistory)!==JSON.stringify(draws);
  const updatedAt=(historyChanged||changed)?now:(oldStatus?.updatedAt||state.updatedAt||now);

  writeAtomic(HISTORY,JSON.stringify(draws)+'\n');
  writeAtomic(STATE,JSON.stringify(state,null,2)+'\n');
  writeAtomic(ARCHIVE,JSON.stringify(archive,null,2)+'\n');
  writeAtomic(STATUS,JSON.stringify({
    version:VERSION,
    source:fresh.winner.name,
    sourceUrl:fresh.winner.baseUrl,
    primarySource:'Столото',
    primarySourceUrl:STOLOTO_URL,
    serverLearning:true,
    updatedAt,
    drawsStored:draws.length,
    latestDraw:Number(latest.draw),
    latestDate:String(latest.date||''),
    latestTime:String(latest.time||''),
    latestColumn:Number(latest.column||0)||null,
    latestColumnSource:String(latest.columnSource||'fallback-calculation'),
    officialColumnsStored:draws.filter(d=>String(d.columnSource||'').startsWith('stoloto-official')).length,
    fingerprintNext:Number(state.nextTargetDraw),
    fingerprintArchive:archive.length,
    fingerprintSettled:Number(state.settledCount||0),
    sourcesChecked:fresh.successful,
    weights:state.weights
  },null,2)+'\n');

  console.log(`KENO 6.3 SERVER OK: источник ${fresh.winner.name}, база ${draws.length}, последний №${latest.draw}, закрыто ${state.settledCount||0}, следующий прогноз №${state.nextTargetDraw}`);
}

module.exports={validColumn,validDraw,parseHtml,parseReaderText,parsePlainText,parseSource,parseOfficialColumns,selfTest,fetchAllSources};
if(require.main===module){main().catch(error=>{console.error(error?.stack||error?.message||error);process.exit(1)})}
