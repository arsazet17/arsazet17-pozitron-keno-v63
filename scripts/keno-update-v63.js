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
    !Number.isFinite(draw) ||
    balls.length!==20 ||
    new Set(balls).size!==20
  ){
    return null;
  }

  const column=validColumn(
    o?.column ??
    o?.officialColumn
  );

  const result={
    draw,
    date:String(o?.date||''),
    time:String(o?.time||''),
    balls
  };

  if(column){
    result.column=column;
  }

  if(o?.columnSource){
    result.columnSource=String(o.columnSource);
  }

  return result;
}

function decodeText(text){
  return String(text||'')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&thinsp;|&#8201;/gi,' ')
    .replace(/&quot;/gi,'"')
    .replace(/<[^>]+>/g,' ')
    .replace(/\u2116/g,'№')
    .replace(/\u0441\u0442\u043e\u043b\u0431\u0435\u0446/gi,'Столбец')
    .replace(/\s+/g,' ');
}

function parseOfficialColumns(text){
  const clean=decodeText(text);
  const map=new Map();

  const re=
    /№\s*[\u2009\u00a0 ]*(\d{5,})[\s\S]{0,320}?Столбец\s*(10|[1-9])/gi;

  let m;

  while((m=re.exec(clean))){
    map.set(
      Number(m[1]),
      Number(m[2])
    );
  }

  return map;
}

function officialParserSelfTest(){
  const sample=
    '19:02:30 · № 325179  Больше чётных · Столбец 6  Тур 1';

  const m=parseOfficialColumns(sample);

  if(m.get(325179)!==6){
    throw new Error(
      'SELFTEST official column parser failed'
    );
  }
}

async function fetchText(url){
  const r=await fetch(
    url +
    (url.includes('?')?'&':'?') +
    't=' +
    Date.now(),
    {
      headers:{
        'cache-control':'no-cache',
        'user-agent':
          'Positron-Keno-v63-official-column'
      }
    }
  );

  if(!r.ok){
    throw new Error(
      'HTTP ' +
      r.status +
      ' ' +
      url
    );
  }

  return await r.text();
}

async function fetchOfficialColumns(){
  officialParserSelfTest();

  const merged=new Map();
  const errors=[];

  for(const url of [
    OFFICIAL_ARCHIVE,
    OFFICIAL_READER
  ]){
    try{
      const parsed=
        parseOfficialColumns(
          await fetchText(url)
        );

      for(const [draw,column] of parsed){
        merged.set(draw,column);
      }

      if(merged.size>=5){
        break;
      }

    }catch(e){
      errors.push(
        String(e?.message||e)
      );
    }
  }

  if(!merged.size){
    console.warn(
      'OFFICIAL COLUMN unavailable:',
      errors.join(' | ')
    );
  }else{
    console.log(
      'OFFICIAL COLUMN loaded:',
      merged.size,
      'draws'
    );
  }

  return merged;
}

async function fetchHistory(oldHistory=[]){
  const response=await fetch(
    SOURCE+'?t='+Date.now(),
    {
      headers:{
        'cache-control':'no-cache',
        'user-agent':
          'Positron-Keno-v63-server-learning'
      }
    }
  );

  if(!response.ok){
    throw new Error(
      'HTTP '+response.status
    );
  }

  const data=await response.json();

  const raw=
    Array.isArray(data)
      ? data
      : (
          Array.isArray(data.draws)
            ? data.draws
            : []
        );

  const oldByDraw=
    new Map(
      (oldHistory||[])
        .map(x=>[
          Number(x?.draw),
          x
        ])
    );

  const official=
    await fetchOfficialColumns();

  const map=new Map();

  for(const x of raw){
    const d=validDraw(x);

    if(!d){
      continue;
    }

    const old=
      oldByDraw.get(d.draw);

    const officialColumn=
      validColumn(
        official.get(d.draw)
      );

    if(officialColumn){
      d.column=officialColumn;
      d.columnSource=
        'stoloto-official';
    }
    else if(
      validColumn(old?.column)
    ){
      d.column=
        Number(old.column);

      d.columnSource=
        String(
          old.columnSource ||
          'stoloto-official-cache'
        );
    }

    map.set(
      d.draw,
      d
    );
  }

  const draws=
    [...map.values()]
      .sort(
        (a,b)=>a.draw-b.draw
      );

  if(!draws.length){
    throw new Error(
      'База 6.2 пуста'
    );
  }

  return draws;
}

async function main(){
  const oldState=
    readJson(
      STATE,
      null
    );

  const oldArchive=
    readJson(
      ARCHIVE,
      []
    );

  const oldHistory=
    readJson(
      HISTORY,
      []
    );

  const oldStatus=
    readJson(
      STATUS,
      null
    );

  const draws=
    await fetchHistory(
      oldHistory
    );

  const now=
    new Date()
      .toISOString();

  const {
    state,
    archive,
    changed
  }=
    processFingerprint(
      draws,
      oldState,
      oldArchive,
      ENGINE,
      now
    );

  const latest=
    draws.at(-1);

  const historyChanged=
    JSON.stringify(oldHistory)!==
    JSON.stringify(draws);

  const dataUpdatedAt=
    (historyChanged||changed)
      ? now
      : (
          oldStatus?.updatedAt ||
          state.updatedAt ||
          now
        );

  fs.writeFileSync(
    HISTORY,
    JSON.stringify(draws)+'\n'
  );

  fs.writeFileSync(
    STATE,
    JSON.stringify(
      state,
      null,
      2
    )+'\n'
  );

  fs.writeFileSync(
    ARCHIVE,
    JSON.stringify(
      archive,
      null,
      2
    )+'\n'
  );

  fs.writeFileSync(
    STATUS,
    JSON.stringify(
      {
        version:VERSION,
        source:
          'KENO 6.2 server mirror',
        serverLearning:true,
        updatedAt:dataUpdatedAt,
        drawsStored:draws.length,

        latestDraw:
          Number(latest.draw),

        latestDate:
          String(latest.date||''),

        latestTime:
          String(latest.time||''),

        latestColumn:
          Number(latest.column||0) ||
          null,

        latestColumnSource:
          String(
            latest.columnSource ||
            'fallback-calculation'
          ),

        officialColumnsStored:
          draws.filter(
            d=>
              d.columnSource &&
              String(d.columnSource)
                .startsWith(
                  'stoloto-official'
                )
          ).length,

        fingerprintNext:
          Number(
            state.nextTargetDraw
          ),

        fingerprintArchive:
          archive.length,

        fingerprintSettled:
          Number(
            state.settledCount||0
          ),

        weights:
          state.weights
      },
      null,
      2
    )+'\n'
  );

  console.log(
    `KENO 6.3 SERVER OK: `+
    `${draws.length} тиражей, `+
    `последний №${latest.draw}, `+
    `прогноз №${state.nextTargetDraw}, `+
    `архив ${archive.length}`
  );
}

module.exports={
  validColumn,
  validDraw,
  parseOfficialColumns,
  officialParserSelfTest
};

if(require.main===module){
  main()
    .catch(e=>{
      console.error(
        e.stack||e
      );
      process.exit(1);
    });
}
