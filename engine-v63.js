'use strict';
/* ПОЗИТРОН КЕНО 6.3.2 — ALL-80 outcome learning + diversified combo portfolio.
   Статистический исследовательский алгоритм, не гарантия выигрыша. */
(() => {
  const DEFAULT_WEIGHTS = Object.freeze({
    transition:1.05,spatial:0.95,balance:0.80,assembly:1.00,analog:1.20,outcome:1.00,
    comboIndividual:1.00,comboHistory:1.00,comboSpatial:0.85,comboAssembly:0.90,comboSpread:0.80,comboOutcome:1.00
  });
  const GRID_W=10, GRID_H=8;
  const NUMBER_KEYS=['transition','spatial','balance','assembly','analog','outcome'];
  const COMBO_KEYS={
    comboIndividual:'individual',comboHistory:'history',comboSpatial:'spatial',
    comboAssembly:'assembly',comboSpread:'spread',comboOutcome:'outcome'
  };
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const mean=a=>a?.length?a.reduce((s,x)=>s+Number(x||0),0)/a.length:0;
  const std=a=>{if(!a||a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))};
  const coord=n=>({x:(Number(n)-1)%GRID_W,y:Math.floor((Number(n)-1)/GRID_W)});
  const manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
  const setOf=a=>new Set((a||[]).map(Number));
  const overlap=(a,b)=>{const B=setOf(b);return (a||[]).filter(x=>B.has(Number(x))).map(Number)};
  const round4=n=>+Number(n||0).toFixed(4);

  function normalizeWeights(w){return {...DEFAULT_WEIGHTS,...(w||{})};}

  function matrixFeatures(draw){
    const pts=(draw?.balls||[]).map(coord); if(!pts.length)return null;
    const cx=mean(pts.map(p=>p.x)), cy=mean(pts.map(p=>p.y));
    const dists=[];let close2=0;
    for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){const d=manhattan(pts[i],pts[j]);dists.push(d);if(d<=2)close2++;}
    const quadrants=[0,0,0,0],rows=Array(GRID_H).fill(0),cols=Array(GRID_W).fill(0);
    for(const p of pts){quadrants[(p.y>=4?2:0)+(p.x>=5?1:0)]++;rows[p.y]++;cols[p.x]++;}
    const ideal=pts.length/4;
    const imbalance=Math.sqrt(mean(quadrants.map(v=>(v-ideal)**2)))/(ideal||1);
    return {cx,cy,meanDistance:mean(dists),distanceStd:std(dists),density:close2/(dists.length||1),quadrants,rows,cols,imbalance};
  }

  function transitionFeatures(current,previous){
    const nums=overlap(current?.balls,previous?.balls);
    const pi=new Map((previous?.balls||[]).map((n,i)=>[Number(n),i+1]));
    const ci=new Map((current?.balls||[]).map((n,i)=>[Number(n),i+1]));
    const moves=nums.map(n=>({number:n,from:pi.get(n),to:ci.get(n),shift:(ci.get(n)||0)-(pi.get(n)||0)}));
    return {numbers:nums,count:nums.length,rate:nums.length/20,meanShift:mean(moves.map(x=>Math.abs(x.shift))),moves};
  }

  function assemblyFeatures(draws,index){
    const cur=draws[index],p1=draws[index-1],p2=draws[index-2];
    if(!cur)return {horizontal:[],vertical:[],placePressure:Array(20).fill(0)};
    const pressure=Array(20).fill(0),current=cur.balls||[],b1=p1?.balls||[],b2=p2?.balls||[];
    for(let m=0;m<20;m++){
      if(b1[m]===current[m])pressure[m]+=1.2;
      if(b2[m]===b1[m]&&b1[m]===current[m])pressure[m]+=1.8;
      if(b1.includes(current[m]))pressure[m]+=.55;
      if(b2.includes(current[m]))pressure[m]+=.30;
    }
    const horizontal=[];
    for(let start=0;start<20;start++)for(const len of [3,4,5]){
      if(start+len>20)continue;
      const numbers=current.slice(start,start+len),repeats=numbers.filter(n=>b1.includes(n)).length;
      horizontal.push({kind:'H',place:start+1,length:len,numbers,score:repeats/len*.7+mean(pressure.slice(start,start+len))*.3});
    }
    const vertical=[];
    for(let m=0;m<20;m++){
      const seq=draws.slice(Math.max(0,index-4),index+1).map(d=>Number(d?.balls?.[m])).filter(Number.isFinite);
      if(seq.length>=3){const repetition=1-((new Set(seq).size-1)/(seq.length-1||1));vertical.push({kind:'V',place:m+1,length:seq.length,numbers:seq,score:repetition+pressure[m]*.25});}
    }
    horizontal.sort((a,b)=>b.score-a.score);vertical.sort((a,b)=>b.score-a.score);
    return {horizontal:horizontal.slice(0,8),vertical:vertical.slice(0,8),placePressure:pressure};
  }

  function stateVector(draws,index){
    const cur=draws[index],prev=draws[index-1],mf=matrixFeatures(cur),tf=transitionFeatures(cur,prev),af=assemblyFeatures(draws,index),balls=setOf(cur?.balls);
    const v=[];for(let n=1;n<=80;n++)v.push(balls.has(n)?1:0);
    v.push((mf?.cx||0)/9,(mf?.cy||0)/7,(mf?.meanDistance||0)/16,mf?.density||0,mf?.imbalance||0,tf.rate||0,(tf.meanShift||0)/20,...af.placePressure.map(x=>x/3));
    return v;
  }
  function vectorDistance(a,b){if(!a||!b||a.length!==b.length)return Infinity;let s=0;for(let i=0;i<a.length;i++)s+=Math.abs(a[i]-b[i]);return s/a.length;}
  function historicalNeighbors(draws,index,limit=48){
    const current=stateVector(draws,index),arr=[];
    for(let i=4;i<=index-2;i++){if(!draws[i+2]?.balls?.length)continue;arr.push({index:i,distance:vectorDistance(current,stateVector(draws,i))});}
    arr.sort((a,b)=>a.distance-b.distance);return arr.slice(0,limit);
  }

  /* Выход числа: эмпирическая вероятность следующего появления при текущем
     состоянии present/absent + короткая/средняя частота + направление частоты. */
  function outcomeFeature(draws,index,n){
    const from=Math.max(0,index-159),curPresent=setOf(draws[index]?.balls).has(Number(n));
    let cases=0,hits=0;
    for(let i=from;i<index;i++){
      const present=setOf(draws[i]?.balls).has(Number(n));
      if(present!==curPresent)continue;
      cases++;
      if(setOf(draws[i+1]?.balls).has(Number(n)))hits++;
    }
    const conditional=cases?hits/cases:.25;
    const recent12=draws.slice(Math.max(0,index-11),index+1);
    const recent36=draws.slice(Math.max(0,index-35),index+1);
    const f12=mean(recent12.map(d=>setOf(d.balls).has(Number(n))?1:0));
    const f36=mean(recent36.map(d=>setOf(d.balls).has(Number(n))?1:0));
    const conditionalScore=clamp(conditional/.50,0,1);
    const frequencyScore=clamp((f12*.60+f36*.40)/.50,0,1);
    const trendScore=clamp(.50+(f12-f36)*2.2,0,1);
    return conditionalScore*.50+frequencyScore*.35+trendScore*.15;
  }

  function numberScores(draws,index,weightsInput){
    const weights=normalizeWeights(weightsInput),cur=draws[index],prev=draws[index-1],mf=matrixFeatures(cur),tf=transitionFeatures(cur,prev),af=assemblyFeatures(draws,index);
    const parts=Array.from({length:81},()=>({transition:0,spatial:0,balance:0,assembly:0,analog:0,outcome:0})),scores=Array(81).fill(0);
    const prevSet=setOf(prev?.balls),curSet=setOf(cur?.balls),currentPts=(cur?.balls||[]).map(coord);
    for(let n=1;n<=80;n++){
      parts[n].transition=curSet.has(n)&&prevSet.has(n)?.70:(curSet.has(n)?.18:0);
      const p=coord(n),centerD=Math.abs(p.x-mf.cx)+Math.abs(p.y-mf.cy),near=currentPts.length?Math.min(...currentPts.map(q=>manhattan(p,q))):9;
      parts[n].spatial=mf.density>.18?clamp(near/6,0,1):clamp(1-centerD/10,0,1);
      const qi=(p.y>=4?2:0)+(p.x>=5?1:0),deficit=clamp((5-mf.quadrants[qi])/5,-1,1),colDef=clamp((2-mf.cols[p.x])/2,-1,1);
      parts[n].balance=clamp(.5+deficit*.28+colDef*.22,0,1);
      parts[n].outcome=outcomeFeature(draws,index,n);
    }
    for(const x of [...af.horizontal.slice(0,4),...af.vertical.slice(0,4)])for(const n of x.numbers||[])if(n>=1&&n<=80)parts[n].assembly=Math.max(parts[n].assembly,clamp(x.score,0,1.5)/1.5);
    const neighbors=historicalNeighbors(draws,index,48);let wsum=0;
    for(const nei of neighbors){const w=1/(nei.distance+.025);wsum+=w;const n1=setOf(draws[nei.index+1].balls),n2=setOf(draws[nei.index+2].balls);for(let n=1;n<=80;n++)parts[n].analog+=w*((n1.has(n)?.65:0)+(n2.has(n)?.35:0));}
    if(wsum)for(let n=1;n<=80;n++)parts[n].analog/=wsum;
    for(let n=1;n<=80;n++)scores[n]=NUMBER_KEYS.reduce((s,k)=>s+parts[n][k]*Number(weights[k]||0),0);
    return {scores,parts,neighbors,matrix:mf,transition:tf,assembly:af,weights};
  }

  /* Совместимость пары строится по реальным выходам чисел: похожие состояния
     + последние фактические тиражи. */
  function buildPairCompatibility(draws,index,d,candidates){
    const candidateSet=setOf(candidates),pair=new Map(),recentPair=new Map(),assemblyPair=new Map();
    const key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;

    let histWeight=0;
    for(const nei of d.neighbors||[]){
      const w=1/(Number(nei.distance||0)+.025);
      histWeight+=w;
      const n1=setOf(draws[nei.index+1]?.balls),n2=setOf(draws[nei.index+2]?.balls);
      for(let i=0;i<candidates.length;i++)for(let j=i+1;j<candidates.length;j++){
        const a=candidates[i],b=candidates[j];
        let v=0;
        if(n1.has(a)&&n1.has(b))v+=.65;
        if(n2.has(a)&&n2.has(b))v+=.35;
        if(v)pair.set(key(a,b),(pair.get(key(a,b))||0)+w*v);
      }
    }
    if(histWeight)for(const [k,v] of pair)pair.set(k,clamp(v/histWeight,0,1));

    const recent=draws.slice(Math.max(0,index-79),index+1);
    for(const dr of recent){
      const b=setOf(dr?.balls);
      const present=candidates.filter(n=>b.has(Number(n)));
      for(let i=0;i<present.length;i++)for(let j=i+1;j<present.length;j++){
        const k=key(present[i],present[j]);recentPair.set(k,(recentPair.get(k)||0)+1);
      }
    }
    if(recent.length)for(const [k,v] of recentPair)recentPair.set(k,clamp((v/recent.length)*8,0,1));

    for(const x of [...(d.assembly?.horizontal||[]).slice(0,4),...(d.assembly?.vertical||[]).slice(0,4)]){
      const nums=(x.numbers||[]).map(Number).filter(n=>candidateSet.has(n));
      const strength=clamp(Number(x.score||0)/1.5,0,1);
      for(let i=0;i<nums.length;i++)for(let j=i+1;j<nums.length;j++){
        const k=key(nums[i],nums[j]);
        assemblyPair.set(k,Math.max(assemblyPair.get(k)||0,strength));
      }
    }

    return {
      history:(a,b)=>(pair.get(key(a,b))||0)*.68+(recentPair.get(key(a,b))||0)*.32,
      assembly:(a,b)=>assemblyPair.get(key(a,b))||0,
      spatial:(a,b)=>{
        const dist=manhattan(coord(a),coord(b));
        return clamp(1-Math.abs(dist-4)/6,0,1);
      }
    };
  }

  function allCombinations(values,size){
    const out=[],buf=[];
    function walk(start){
      if(buf.length===size){out.push(buf.slice());return;}
      const need=size-buf.length;
      for(let i=start;i<=values.length-need;i++){buf.push(values[i]);walk(i+1);buf.pop();}
    }
    walk(0);
    return out;
  }

  function comboRankings(draws,index,d,candidates,size,baseScore,weightsInput){
    const weights=normalizeWeights(weightsInput),compat=buildPairCompatibility(draws,index,d,candidates);
    const vals=candidates.map(n=>Number(baseScore(n)||0));
    const lo=Math.min(...vals),hi=Math.max(...vals),span=hi-lo||1;
    const norm=n=>(Number(baseScore(n)||0)-lo)/span;
    const weightMap={
      individual:weights.comboIndividual,history:weights.comboHistory,spatial:weights.comboSpatial,
      assembly:weights.comboAssembly,spread:weights.comboSpread,outcome:weights.comboOutcome
    };
    const weightSum=Object.values(weightMap).reduce((s,x)=>s+Number(x||0),0)||1;

    return allCombinations(candidates,size).map(numbers=>{
      const individual=mean(numbers.map(norm));
      const pairHist=[],pairSpatial=[],pairAssembly=[];
      for(let i=0;i<numbers.length;i++)for(let j=i+1;j<numbers.length;j++){
        pairHist.push(compat.history(numbers[i],numbers[j]));
        pairSpatial.push(compat.spatial(numbers[i],numbers[j]));
        pairAssembly.push(compat.assembly(numbers[i],numbers[j]));
      }
      const history=mean(pairHist),spatial=mean(pairSpatial),assembly=mean(pairAssembly);
      const quadrants=new Set(numbers.map(n=>{const p=coord(n);return (p.y>=4?2:0)+(p.x>=5?1:0)})).size;
      const spread=clamp((quadrants-1)/Math.min(3,size-1||1),0,1);
      const outcome=mean(numbers.map(n=>Number(d.parts?.[n]?.outcome||0)));
      const components={individual,history,spatial,assembly,spread,outcome};
      const comboScore=Object.entries(components).reduce((s,[k,v])=>s+v*Number(weightMap[k]||0),0)/weightSum;
      return {numbers,comboScore,components};
    }).sort((a,b)=>b.comboScore-a.comboScore||a.numbers.join(',').localeCompare(b.numbers.join(',')));
  }

  /* Общий портфель K3/K4/K5: одна таблица использования чисел на все размеры.
     Один номер не может стать корнем всех комбинаций. */
  function selectComboPortfolio(rankingsBySize,countPerSize=2){
    const chosen=[],usage=new Map(),quota=new Map([[3,0],[4,0],[5,0]]);
    const overlapRatio=(a,b)=>a.filter(n=>b.includes(n)).length/Math.max(1,Math.min(a.length,b.length));
    const candidateScore=c=>{
      const repeat=mean(c.numbers.map(n=>usage.get(n)||0));
      const maxOverlap=chosen.length?Math.max(...chosen.map(x=>overlapRatio(c.numbers,x.numbers))):0;
      return c.comboScore-repeat*.08-maxOverlap*.12;
    };
    const tryPick=(size,strict=true)=>{
      const list=rankingsBySize[size]||[];
      let best=null,bestScore=-Infinity;
      for(const c of list){
        if(chosen.some(x=>x.numbers.join(',')===c.numbers.join(',')))continue;
        if(strict&&c.numbers.some(n=>(usage.get(n)||0)>=2))continue;
        if(strict&&chosen.some(x=>c.numbers.filter(n=>x.numbers.includes(n)).length>Math.max(1,Math.floor(Math.min(size,x.numbers.length)/2))))continue;
        const s=candidateScore(c);if(s>bestScore){best=c;bestScore=s;}
      }
      if(!best)return false;
      chosen.push({...best,size,portfolioScore:bestScore});
      quota.set(size,(quota.get(size)||0)+1);
      for(const n of best.numbers)usage.set(n,(usage.get(n)||0)+1);
      return true;
    };
    for(let round=0;round<countPerSize;round++)for(const size of [5,4,3])if((quota.get(size)||0)<countPerSize)tryPick(size,true);
    for(const size of [5,4,3])while((quota.get(size)||0)<countPerSize){if(!tryPick(size,false))break;}
    return chosen.sort((a,b)=>a.size-b.size||b.portfolioScore-a.portfolioScore);
  }

  function buildCombos(draws,index,d,candidates,baseScore,weights){
    const rankings={};
    for(const size of [3,4,5])rankings[size]=comboRankings(draws,index,d,candidates,size,baseScore,weights);
    return selectComboPortfolio(rankings,2).map((c,i)=>({
      size:c.size,numbers:c.numbers,comboScore:round4(c.comboScore),components:Object.fromEntries(Object.entries(c.components).map(([k,v])=>[k,round4(v)]))
    }));
  }

  function packSignal(n,d){
    const A=d.parts[n];
    return [n,round4(A.transition),round4(A.spatial),round4(A.balance),round4(A.assembly),round4(A.analog),round4(A.outcome)];
  }
  function unpackSignal(row){
    if(!Array.isArray(row))return row;
    return {number:Number(row[0]),parts:{transition:Number(row[1]||0),spatial:Number(row[2]||0),balance:Number(row[3]||0),assembly:Number(row[4]||0),analog:Number(row[5]||0),outcome:Number(row[6]||0)}};
  }

  function forecast(draws,weightsInput){
    const index=draws.length-1;if(index<8)return null;
    const d=numberScores(draws,index,weightsInput),ranked=Array.from({length:80},(_,i)=>i+1).sort((a,b)=>d.scores[b]-d.scores[a]||a-b),pool20=ranked.slice(0,20),logicSet=setOf(pool20);
    const antiBase=n=>{const A=d.parts[n];return A.analog*1.2+A.balance*.7+A.spatial*.5+A.outcome*.45-A.transition*.25-A.assembly*.15;};
    const anti20=Array.from({length:80},(_,i)=>i+1).filter(n=>!logicSet.has(n)).sort((a,b)=>antiBase(b)-antiBase(a)||a-b).slice(0,20);

    /* id назначаем после группировки, чтобы K3/K4/K5 сохраняли привычные имена. */
    const antiRaw=buildCombos(draws,index,d,anti20,antiBase,d.weights);
    const renumber=(arr,prefix='')=>{
      const counters={3:0,4:0,5:0};
      return arr.map(c=>{counters[c.size]++;return {...c,id:`${prefix}K${c.size}-${counters[c.size]}`};});
    };
    const logic=renumber(buildCombos(draws,index,d,pool20,n=>d.scores[n],d.weights));
    const anti=renumber(antiRaw,'A-');

    const latest=draws[index];
    return {
      version:'6.3.2-all80',sourceDraw:Number(latest.draw),targetDraw:Number(latest.draw)+1,createdAt:new Date().toISOString(),
      pool20,anti20,logicCombos:logic,antiCombos:anti,
      signalTop:ranked.slice(0,20).map(n=>({number:n,score:round4(d.scores[n]),parts:Object.fromEntries(NUMBER_KEYS.map(k=>[k,round4(d.parts[n][k])]))})),
      signalAll:Array.from({length:80},(_,i)=>packSignal(i+1,d)),
      matrix:d.matrix,transition:d.transition,assembly:d.assembly,neighborsCount:d.neighbors.length,weights:d.weights
    };
  }

  function settlePrediction(pred,actual,weightsInput){
    const weights=normalizeWeights(weightsInput),aset=setOf(actual?.balls),p=(typeof structuredClone==='function')?structuredClone(pred):JSON.parse(JSON.stringify(pred));
    p.actual={draw:Number(actual.draw),date:actual.date||'',time:actual.time||'',balls:(actual.balls||[]).map(Number)};
    p.poolHits=(p.pool20||[]).filter(n=>aset.has(Number(n)));p.antiHits=(p.anti20||[]).filter(n=>aset.has(Number(n)));
    p.logicCombos=(p.logicCombos||[]).map(c=>({...c,hits:(c.numbers||[]).filter(n=>aset.has(Number(n)))}));
    p.antiCombos=(p.antiCombos||[]).map(c=>({...c,hits:(c.numbers||[]).filter(n=>aset.has(Number(n)))}));

    const rows=((p.signalAll||[]).length? p.signalAll.map(unpackSignal):(p.signalTop||[]));
    const poolSet=setOf(p.pool20||[]);
    const actualRows=rows.filter(x=>aset.has(Number(x.number))),nonActualRows=rows.filter(x=>!aset.has(Number(x.number)));
    const missedActual=rows.filter(x=>aset.has(Number(x.number))&&!poolSet.has(Number(x.number)));
    const falsePool=rows.filter(x=>!aset.has(Number(x.number))&&poolSet.has(Number(x.number)));
    const learningBySignal={};
    for(const k of NUMBER_KEYS){
      const positive=mean(actualRows.map(x=>Number(x.parts?.[k]||0))),negative=mean(nonActualRows.map(x=>Number(x.parts?.[k]||0)));
      const missed=mean(missedActual.map(x=>Number(x.parts?.[k]||0))),falseSelected=mean(falsePool.map(x=>Number(x.parts?.[k]||0)));
      const globalGap=positive-negative,errorGap=(missedActual.length&&falsePool.length)?missed-falseSelected:0;
      const delta=clamp(globalGap*.060+errorGap*.040,-.050,.050);
      weights[k]=clamp((weights[k]??DEFAULT_WEIGHTS[k])+delta,.45,1.75);
      learningBySignal[k]={positive:round4(positive),negative:round4(negative),missed:round4(missed),falseSelected:round4(falseSelected),delta:round4(delta)};
    }

    const comboRows=[...(p.logicCombos||[]),...(p.antiCombos||[])].filter(c=>c.components&&Number(c.size)>0);
    const performances=comboRows.map(c=>(c.hits||[]).length/Number(c.size));
    const perfMean=mean(performances),comboDeltas={};
    for(const [weightKey,componentKey] of Object.entries(COMBO_KEYS)){
      const vals=comboRows.map(c=>Number(c.components?.[componentKey]||0));
      const vm=mean(vals);
      const cov=mean(vals.map((v,i)=>(v-vm)*(Number(performances[i]||0)-perfMean)));
      const delta=clamp(cov*.18,-.025,.025);
      weights[weightKey]=clamp((weights[weightKey]??DEFAULT_WEIGHTS[weightKey])+delta,.45,1.75);
      comboDeltas[weightKey]=round4(delta);
    }

    p.learningStats={
      scope:rows.length>=80?'ALL_80':'LEGACY_TOP',numbersEvaluated:rows.length,actualCount:actualRows.length,nonActualCount:nonActualRows.length,
      missedActualCount:missedActual.length,falsePoolCount:falsePool.length,signals:learningBySignal,comboDeltas
    };
    delete p.signalAll; // все 80 нужны только до закрытия прогноза; архив не раздуваем
    p.learnedWeights={...weights};p.settledAt=new Date().toISOString();return {prediction:p,weights};
  }

  function matrixReport(draws){
    const i=draws.length-1,cur=draws[i],prev=draws[i-1],f=matrixFeatures(cur),p=matrixFeatures(prev),t=transitionFeatures(cur,prev),delta=f.meanDistance-(p?.meanDistance||f.meanDistance),phase=delta<-.20?'СЖАТИЕ':delta>.20?'РАЗЖАТИЕ':'СТАБИЛЬНО',dx=f.cx-(p?.cx||f.cx),dy=f.cy-(p?.cy||f.cy),arrow=(Math.abs(dx)<.15&&Math.abs(dy)<.15)?'•':`${dy<-.15?'↑':dy>.15?'↓':''}${dx<-.15?'←':dx>.15?'→':''}`||'•';
    return {draw:cur.draw,date:cur.date,time:cur.time,features:f,previous:p,transition:t,phase,delta,arrow,dx,dy};
  }
  function assemblyReport(draws){const i=draws.length-1;return {draw:draws[i]?.draw,date:draws[i]?.date,time:draws[i]?.time,...assemblyFeatures(draws,i)};}

  const API={DEFAULT_WEIGHTS,normalizeWeights,forecast,settlePrediction,matrixReport,assemblyReport,matrixFeatures,transitionFeatures};
  if(typeof window!=='undefined') window.POZITRON_V63_ENGINE=API;
  if(typeof module!=='undefined'&&module.exports) module.exports=API;
})();
