'use strict';
/* ПОЗИТРОН КЕНО 6.3 — многосигнальный движок.
   Это статистический исследовательский алгоритм, не гарантия результата. */
(() => {
  const DEFAULT_WEIGHTS = Object.freeze({
    transition: 1.05,
    spatial: 0.95,
    balance: 0.80,
    assembly: 1.00,
    analog: 1.20,
    anti: 0.90
  });
  const STORAGE = {
    weights: 'pozitron_v63_engine_weights',
    predictions: 'pozitron_v63_fingerprint_predictions'
  };
  const GRID_W = 10, GRID_H = 8;

  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
  const std=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))};
  const coord=n=>({x:(Number(n)-1)%GRID_W,y:Math.floor((Number(n)-1)/GRID_W)});
  const manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const setOf=a=>new Set((a||[]).map(Number));
  const overlap=(a,b)=>{const B=setOf(b);return (a||[]).filter(x=>B.has(Number(x)))};
  const normalize=v=>Number.isFinite(v)?v:0;

  function loadWeights(){
    try{
      const p=JSON.parse(localStorage.getItem(STORAGE.weights)||'null');
      return {...DEFAULT_WEIGHTS,...(p||{})};
    }catch{return {...DEFAULT_WEIGHTS}}
  }
  function saveWeights(w){try{localStorage.setItem(STORAGE.weights,JSON.stringify(w))}catch{}}
  function loadPredictions(){
    try{const p=JSON.parse(localStorage.getItem(STORAGE.predictions)||'[]');return Array.isArray(p)?p:[]}catch{return[]}
  }
  function savePredictions(p){try{localStorage.setItem(STORAGE.predictions,JSON.stringify(p.slice(-80)))}catch{}}

  function matrixFeatures(draw){
    const pts=(draw?.balls||[]).map(coord);
    if(!pts.length)return null;
    const cx=mean(pts.map(p=>p.x)), cy=mean(pts.map(p=>p.y));
    const dists=[];
    let close1=0,close2=0,close3=0;
    for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
      const d=manhattan(pts[i],pts[j]);dists.push(d);
      if(d<=1)close1++; if(d<=2)close2++; if(d<=3)close3++;
    }
    const quad=[0,0,0,0];
    for(const p of pts){
      const q=(p.y>=GRID_H/2?2:0)+(p.x>=GRID_W/2?1:0);
      quad[q]++;
    }
    const rows=Array(GRID_H).fill(0),cols=Array(GRID_W).fill(0);
    for(const p of pts){rows[p.y]++;cols[p.x]++}
    const ideal=pts.length/4;
    const imbalance=Math.sqrt(mean(quad.map(v=>(v-ideal)**2)))/(ideal||1);
    return {
      cx,cy,
      meanDistance:mean(dists),
      distanceStd:std(dists),
      close1,close2,close3,
      density:(close2/(dists.length||1)),
      quadrants:quad,rows,cols,
      imbalance
    };
  }

  function transitionFeatures(current, previous){
    const hits=overlap(current?.balls,previous?.balls);
    const prevIndex=new Map((previous?.balls||[]).map((n,i)=>[Number(n),i+1]));
    const currIndex=new Map((current?.balls||[]).map((n,i)=>[Number(n),i+1]));
    const moves=hits.map(n=>({number:Number(n),from:prevIndex.get(Number(n)),to:currIndex.get(Number(n)),shift:currIndex.get(Number(n))-prevIndex.get(Number(n))}));
    return {
      numbers:hits.map(Number),
      count:hits.length,
      rate:hits.length/20,
      meanShift:mean(moves.map(x=>Math.abs(x.shift))),
      moves
    };
  }

  function placeStats(draws, endIndex, depth=8){
    const out=Array.from({length:20},()=>({seen:new Map(),continuity:0,entropy:0}));
    const start=Math.max(0,endIndex-depth+1);
    for(let i=start;i<=endIndex;i++){
      const balls=draws[i]?.balls||[];
      balls.forEach((n,p)=>{
        const m=out[p].seen;m.set(Number(n),(m.get(Number(n))||0)+1);
      });
    }
    for(const item of out){
      const total=[...item.seen.values()].reduce((a,b)=>a+b,0)||1;
      item.entropy=-[...item.seen.values()].reduce((s,c)=>{const p=c/total;return s+(p? p*Math.log(p):0)},0);
    }
    return out;
  }

  function assemblyFeatures(draws, index){
    const cur=draws[index], prev=draws[index-1], prev2=draws[index-2];
    if(!cur)return {horizontal:[],vertical:[],placePressure:Array(20).fill(0)};
    const current=cur.balls||[];
    const p1=prev?.balls||[], p2=prev2?.balls||[];
    const pressure=Array(20).fill(0);
    for(let m=0;m<20;m++){
      if(p1[m]===current[m]) pressure[m]+=1.2;
      if(p2[m]===p1[m] && p1[m]===current[m]) pressure[m]+=1.8;
      const n=Number(current[m]);
      if(p1.includes(n)) pressure[m]+=0.55;
      if(p2.includes(n)) pressure[m]+=0.30;
    }
    const horizontal=[];
    for(let start=0;start<20;start++){
      for(const len of [3,4,5]){
        if(start+len>20)continue;
        const nums=current.slice(start,start+len);
        const repeats=nums.filter(n=>p1.includes(n)).length;
        const local=mean(pressure.slice(start,start+len));
        const score=repeats/len*0.7+local*0.3;
        horizontal.push({kind:'H',place:start+1,length:len,numbers:nums,score});
      }
    }
    const vertical=[];
    for(let m=0;m<20;m++){
      const seq=[draws[index-4],draws[index-3],draws[index-2],draws[index-1],draws[index]]
        .filter(Boolean).map(d=>Number(d.balls?.[m])).filter(Number.isFinite);
      if(seq.length>=3){
        const unique=new Set(seq).size;
        const repetition=1-((unique-1)/(seq.length-1||1));
        vertical.push({kind:'V',place:m+1,length:Math.min(5,seq.length),numbers:seq.slice(-5),score:repetition+pressure[m]*0.25});
      }
    }
    horizontal.sort((a,b)=>b.score-a.score);
    vertical.sort((a,b)=>b.score-a.score);
    return {horizontal:horizontal.slice(0,8),vertical:vertical.slice(0,8),placePressure:pressure};
  }

  function stateVector(draws,index){
    const cur=draws[index],prev=draws[index-1];
    const mf=matrixFeatures(cur),tf=transitionFeatures(cur,prev),af=assemblyFeatures(draws,index);
    const balls=setOf(cur?.balls||[]);
    const vec=[];
    for(let n=1;n<=80;n++)vec.push(balls.has(n)?1:0);
    vec.push(
      normalize(mf?.cx)/9, normalize(mf?.cy)/7,
      normalize(mf?.meanDistance)/16,
      normalize(mf?.density),
      normalize(mf?.imbalance),
      normalize(tf?.rate),
      normalize(tf?.meanShift)/20,
      ...af.placePressure.map(x=>normalize(x)/3)
    );
    return vec;
  }

  function vectorDistance(a,b){
    if(!a||!b||a.length!==b.length)return Infinity;
    let s=0;
    for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);
    return s/a.length;
  }

  function historicalNeighbors(draws,index,limit=48){
    const current=stateVector(draws,index);
    const maxSource=index-2; // нужен известный +1 и +2
    const arr=[];
    for(let i=4;i<=maxSource;i++){
      if(!draws[i+2]?.balls?.length)continue;
      const d=vectorDistance(current,stateVector(draws,i));
      arr.push({index:i,distance:d});
    }
    arr.sort((a,b)=>a.distance-b.distance);
    return arr.slice(0,limit);
  }

  function numberScores(draws,index){
    const weights=loadWeights();
    const cur=draws[index],prev=draws[index-1];
    const mf=matrixFeatures(cur),tf=transitionFeatures(cur,prev),af=assemblyFeatures(draws,index);
    const scores=Array(81).fill(0);
    const parts=Array.from({length:81},()=>({transition:0,spatial:0,balance:0,assembly:0,analog:0,anti:0}));

    // 1) переходы: повтор не догма, а один из сигналов
    const prevSet=setOf(prev?.balls||[]);
    const curSet=setOf(cur?.balls||[]);
    for(let n=1;n<=80;n++){
      const repeated=curSet.has(n)&&prevSet.has(n);
      const recent=curSet.has(n);
      parts[n].transition = repeated?0.70:(recent?0.18:0);
    }

    // 2) пространственный сигнал: поддержка текущего центра + возможность разжатия
    const currentPts=(cur?.balls||[]).map(coord);
    for(let n=1;n<=80;n++){
      const p=coord(n);
      const centerD=Math.abs(p.x-mf.cx)+Math.abs(p.y-mf.cy);
      const near=currentPts.length?Math.min(...currentPts.map(q=>manhattan(p,q))):9;
      const compact=clamp(1-centerD/10,0,1);
      const expansion=clamp(near/6,0,1);
      // если поле плотное — даём вес расширению, если разреженное — возвращению к центру
      parts[n].spatial = mf.density>0.18 ? expansion : compact;
    }

    // 3) баланс: недозаполненные квадранты/столбцы получают небольшой плюс
    const q=mf.quadrants, ideal=5;
    for(let n=1;n<=80;n++){
      const p=coord(n), qi=(p.y>=4?2:0)+(p.x>=5?1:0);
      const deficit=clamp((ideal-q[qi])/ideal,-1,1);
      const colDef=clamp((2-mf.cols[p.x])/2,-1,1);
      parts[n].balance=clamp(0.5+deficit*0.28+colDef*0.22,0,1);
    }

    // 4) М1–М20: числа из сильных текущих горизонталей/вертикалей
    for(const x of [...af.horizontal.slice(0,4),...af.vertical.slice(0,4)]){
      for(const n of x.numbers||[]) if(n>=1&&n<=80) parts[n].assembly=Math.max(parts[n].assembly,clamp(x.score,0,1.5)/1.5);
    }

    // 5) исторические состояния по всему доступному архиву.
    // Горизонт 🎯 / ⏳−1 объединён: +1 вес 0.65, +2 вес 0.35.
    const neighbors=historicalNeighbors(draws,index,48);
    let wsum=0;
    for(const nei of neighbors){
      const w=1/(nei.distance+0.025);wsum+=w;
      const next1=setOf(draws[nei.index+1].balls),next2=setOf(draws[nei.index+2].balls);
      for(let n=1;n<=80;n++){
        parts[n].analog += w*((next1.has(n)?0.65:0)+(next2.has(n)?0.35:0));
      }
    }
    if(wsum)for(let n=1;n<=80;n++)parts[n].analog/=wsum;

    // итог
    for(let n=1;n<=80;n++){
      scores[n]=
        parts[n].transition*weights.transition+
        parts[n].spatial*weights.spatial+
        parts[n].balance*weights.balance+
        parts[n].assembly*weights.assembly+
        parts[n].analog*weights.analog;
    }
    return {scores,parts,neighbors,matrix:mf,transition:tf,assembly:af,weights};
  }

  function diversify(sorted,size,count=2){
    const out=[];
    const walk=(start,buf)=>{
      if(buf.length===size){
        const overlapBad=out.some(x=>buf.filter(n=>x.includes(n)).length>Math.floor(size/2));
        if(!overlapBad)out.push(buf.slice());
        return;
      }
      for(let i=start;i<Math.min(sorted.length,16)&&out.length<count;i++){
        buf.push(sorted[i]);walk(i+1,buf);buf.pop();
      }
    };
    walk(0,[]);
    while(out.length<count && sorted.length>=size){
      const offset=out.length;
      out.push(sorted.slice(offset,offset+size));
    }
    return out.slice(0,count);
  }

  function forecast(draws){
    const index=draws.length-1;
    if(index<8)return null;
    settleAndLearn(draws);
    const data=numberScores(draws,index);
    const ranked=Array.from({length:80},(_,i)=>i+1).sort((a,b)=>data.scores[b]-data.scores[a]||a-b);
    const pool20=ranked.slice(0,20);
    // ANTILOGIC = кандидаты вне LOGIC, где исторический + баланс поддерживают число,
    // но основной суммарный рейтинг его недооценил.
    const logicSet=setOf(pool20);
    const antiRank=Array.from({length:80},(_,i)=>i+1).filter(n=>!logicSet.has(n))
      .sort((a,b)=>{
        const A=data.parts[a],B=data.parts[b];
        const sa=A.analog*1.2+A.balance*.7+A.spatial*.5-A.transition*.25-A.assembly*.15;
        const sb=B.analog*1.2+B.balance*.7+B.spatial*.5-B.transition*.25-B.assembly*.15;
        return sb-sa||a-b;
      });
    const anti20=antiRank.slice(0,20);
    const logicCombos=[3,4,5].flatMap(size=>diversify(pool20,size,2).map((numbers,i)=>({id:`K${size}-${i+1}`,size,numbers})));
    const antiCombos=[3,4,5].flatMap(size=>diversify(anti20,size,2).map((numbers,i)=>({id:`A-K${size}-${i+1}`,size,numbers})));
    const latest=draws[index];
    const pred={
      version:'6.3',
      sourceDraw:Number(latest.draw),
      targetDraw:Number(latest.draw)+1,
      createdAt:new Date().toISOString(),
      pool20,anti20,logicCombos,antiCombos,
      signalTop:ranked.slice(0,10).map(n=>({number:n,score:Number(data.scores[n].toFixed(4)),parts:data.parts[n]})),
      matrix:data.matrix,transition:data.transition,
      weights:data.weights
    };
    storePrediction(pred);
    return {...pred,neighbors:data.neighbors,assembly:data.assembly};
  }

  function storePrediction(pred){
    const list=loadPredictions();
    const key=`${pred.sourceDraw}:${pred.targetDraw}`;
    if(!list.some(x=>`${x.sourceDraw}:${x.targetDraw}`===key)){list.push(pred);savePredictions(list)}
  }

  function settleAndLearn(draws){
    const byDraw=new Map(draws.map(d=>[Number(d.draw),d]));
    const list=loadPredictions();
    let weights=loadWeights(),changed=false;
    for(const p of list){
      if(p.actual||!byDraw.has(Number(p.targetDraw)))continue;
      const actual=byDraw.get(Number(p.targetDraw)),aset=setOf(actual.balls);
      p.actual={draw:actual.draw,date:actual.date,time:actual.time,balls:actual.balls.slice()};
      p.poolHits=p.pool20.filter(n=>aset.has(n));
      p.antiHits=p.anti20.filter(n=>aset.has(n));
      // Обучаем только по зафиксированным прогнозам: сильные компоненты попавших чисел повышаем,
      // сильные компоненты промахов слегка снижаем. Диапазон весов ограничен.
      const top=p.signalTop||[];
      const keys=['transition','spatial','balance','assembly','analog'];
      for(const k of keys){
        const hitVals=top.filter(x=>aset.has(x.number)).map(x=>Number(x.parts?.[k]||0));
        const missVals=top.filter(x=>!aset.has(x.number)).map(x=>Number(x.parts?.[k]||0));
        if(!hitVals.length&&!missVals.length)continue;
        const delta=(mean(hitVals)-mean(missVals))*0.035;
        weights[k]=clamp((weights[k]??DEFAULT_WEIGHTS[k])+delta,0.45,1.75);
      }
      p.learnedWeights={...weights};changed=true;
    }
    if(changed){savePredictions(list);saveWeights(weights)}
  }

  function matrixReport(draws){
    const i=draws.length-1,cur=draws[i],prev=draws[i-1];
    const f=matrixFeatures(cur),p=matrixFeatures(prev),t=transitionFeatures(cur,prev);
    const delta=f.meanDistance-(p?.meanDistance||f.meanDistance);
    const phase=delta<-0.20?'СЖАТИЕ':delta>0.20?'РАЗЖАТИЕ':'СТАБИЛЬНО';
    const dx=f.cx-(p?.cx||f.cx),dy=f.cy-(p?.cy||f.cy);
    const arrow=(Math.abs(dx)<.15&&Math.abs(dy)<.15)?'•':`${dy<-.15?'↑':dy>.15?'↓':''}${dx<-.15?'←':dx>.15?'→':''}`||'•';
    return {draw:cur.draw,features:f,previous:p,transition:t,phase,delta,arrow,dx,dy};
  }

  function assemblyReport(draws){
    const i=draws.length-1;
    const a=assemblyFeatures(draws,i);
    return {draw:draws[i].draw,...a};
  }

  window.POZITRON_V63_ENGINE={
    forecast,matrixReport,assemblyReport,matrixFeatures,transitionFeatures,
    loadPredictions,loadWeights,settleAndLearn
  };
})();
