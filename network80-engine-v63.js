'use strict';
(() => {
  const VERSION='6.3-network80-0100';
  const RECENT=60;
  const MAX_GROUP=7;
  const PAYOUTS=Object.freeze({
    1:{1:280},
    2:{1:100,2:300},
    3:{2:300,3:1500},
    4:{2:100,3:300,4:3300},
    5:{3:400,4:1920,5:20000},
    6:{3:200,4:750,5:4180,6:75000},
    7:{0:150,3:100,4:200,5:1200,6:10000,7:250000},
    8:{0:150,4:200,5:500,6:2500,7:53300,8:1500000},
    9:{0:150,4:150,5:300,6:1000,7:10000,8:210000,9:4000000},
    10:{0:200,4:100,5:250,6:750,7:5000,8:50000,9:1000000,10:10000000}
  });
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const pad=n=>String(Number(n)).padStart(2,'0');
  const key=(a,b)=>a<b?`${a}-${b}`:`${b}-${a}`;
  const dkey=(a,b)=>`${a}>${b}`;
  const pairValues=(m,a,b)=>Number(m.get(key(a,b))||0);
  const directed=(m,a,b)=>Number(m.get(dkey(a,b))||0);
  const inc=(m,k,v=1)=>m.set(k,Number(m.get(k)||0)+v);
  const sameSet=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
  const sortNums=a=>[...a].map(Number).sort((x,y)=>x-y);
  const setKey=a=>sortNums(a).join('-');

  function staticInfo(n){
    n=Number(n);const row=Math.floor((n-1)/10)+1,col=n%10||10,mirror=Number(pad(n).split('').reverse().join(''));
    return {number:n,row,col,parity:n%2?'НЕЧ':'ЧЁТ',mirror,mirrorType:(mirror>=1&&mirror<=80?(mirror===n?'САМО':'ПАРА'):'НЕТ')};
  }
  function staticRelation(a,b){
    const A=staticInfo(a),B=staticInfo(b),r=[];
    if(A.mirrorType!=='НЕТ'&&A.mirror===b)r.push('ЗЕРКАЛО');
    if(A.row===B.row)r.push('РЯД');
    if(A.col===B.col)r.push('СТОЛБ');
    if(A.row===B.row&&Math.abs(A.col-B.col)===1)r.push('ГОРИЗОНТАЛЬ');
    if(A.col===B.col&&Math.abs(A.row-B.row)===1)r.push('ВЕРТИКАЛЬ');
    if(Math.abs(A.row-B.row)===1&&Math.abs(A.col-B.col)===1)r.push('ДИАГОНАЛЬ');
    if(Math.abs(a-b)===1)r.push('ЧИСЛО-СОСЕД');
    return r;
  }
  function regimeStartIndex(draws){
    const byDate=new Map();
    for(let i=0;i<draws.length;i++){
      const d=String(draws[i]?.date||'');
      if(!byDate.has(d))byDate.set(d,[]);
      byDate.get(d).push(i);
    }
    for(const [,idxs] of byDate){if(idxs.length===66)return idxs[0];}
    return 0;
  }
  function normalizeDraws(input){
    return (input||[]).map(d=>({draw:Number(d.draw),date:String(d.date||''),time:String(d.time||''),balls:(d.balls||[]).map(Number).slice(0,20),column:Number(d.column)||null,parity:d.parity||''}))
      .filter(d=>Number.isFinite(d.draw)&&d.balls.length===20&&new Set(d.balls).size===20)
      .sort((a,b)=>a.draw-b.draw);
  }
  function buildStats(input){
    const draws=normalizeDraws(input);if(!draws.length)return null;
    const start=regimeStartIndex(draws),scope=draws.slice(start),recent=scope.slice(-RECENT),W=recent.length,N=scope.length;
    const freq=new Int32Array(81),rfreq=new Int32Array(81),pos=new Int32Array(81*21);
    const co=new Map(),rco=new Map(),adj=new Map(),radj=new Map(),lag1=new Map(),rlag1=new Map(),lag2=new Map(),rlag2=new Map(),frames=new Map(),rframes=new Map();
    const scan=(arr,isRecent=false)=>{
      const F=isRecent?rfreq:freq,C=isRecent?rco:co,A=isRecent?radj:adj,FR=isRecent?rframes:frames;
      for(const d of arr){
        const b=d.balls;
        for(let i=0;i<20;i++){const x=b[i];F[x]++;if(!isRecent)pos[x*21+(i+1)]++;if(i<19)inc(A,key(x,b[i+1]));if(i>0&&i<19)inc(FR,`${b[i-1]}-${x}-${b[i+1]}`);}
        for(let i=0;i<20;i++)for(let j=i+1;j<20;j++)inc(C,key(b[i],b[j]));
      }
    };
    scan(scope,false);scan(recent,true);
    const scanLag=(arr,L1,L2)=>{
      for(let i=0;i<arr.length;i++){
        const src=arr[i].balls;
        if(i+1<arr.length){for(const a of src)for(const b of arr[i+1].balls)inc(L1,dkey(a,b));}
        if(i+2<arr.length){for(const a of src)for(const b of arr[i+2].balls)inc(L2,dkey(a,b));}
      }
    };
    scanLag(scope,lag1,lag2);scanLag(recent,rlag1,rlag2);
    return {draws,scope,recent,start,N,W,freq,rfreq,pos,co,rco,adj,radj,lag1,rlag1,lag2,rlag2,frames,rframes};
  }
  function liftCo(stats,a,b,recent=false){
    const n=recent?stats.W:stats.N;if(n<1)return 0;
    const fa=(recent?stats.rfreq:stats.freq)[a],fb=(recent?stats.rfreq:stats.freq)[b],c=pairValues(recent?stats.rco:stats.co,a,b);
    const expected=(fa*fb)/n;
    return (c+0.6)/(expected+0.6);
  }
  function rateActivation(allCount,recentCount,N,W,prior=.25){
    const br=(allCount+prior)/(N+prior*4),rr=(recentCount+prior)/(W+prior*4);
    return clamp(Math.log2(rr/br),-2.5,3.5);
  }
  function directedActivation(stats,mapAll,mapRecent,a,b){
    return rateActivation(directed(mapAll,a,b),directed(mapRecent,a,b),stats.N,stats.W,.08);
  }
  function edge(stats,a,b){
    const rc=pairValues(stats.rco,a,b),ac=pairValues(stats.co,a,b),rl=liftCo(stats,a,b,true),bl=liftCo(stats,a,b,false);
    const rel=Math.log2((rl+.2)/(bl+.2))*Math.min(1,rc/5);
    const ra=pairValues(stats.radj,a,b),aa=pairValues(stats.adj,a,b),adjAct=rateActivation(aa,ra,stats.N,stats.W,.05)*Math.min(1,ra/2);
    const l1=Math.max(directedActivation(stats,stats.lag1,stats.rlag1,a,b),directedActivation(stats,stats.lag1,stats.rlag1,b,a));
    const l2=Math.max(directedActivation(stats,stats.lag2,stats.rlag2,a,b),directedActivation(stats,stats.lag2,stats.rlag2,b,a));
    const l1Support=Math.max(directed(stats.rlag1,a,b),directed(stats.rlag1,b,a));
    const l2Support=Math.max(directed(stats.rlag2,a,b),directed(stats.rlag2,b,a));
    const geom=staticRelation(a,b),geomBonus=geom.some(x=>['ЗЕРКАЛО','ГОРИЗОНТАЛЬ','ВЕРТИКАЛЬ','ДИАГОНАЛЬ'].includes(x))?.10:0;
    const support=rc+ra+l1Support*.35+l2Support*.20;
    const score=rel*1.35+adjAct*.85+Math.max(0,l1)*.32*Math.min(1,l1Support/3)+Math.max(0,l2)*.18*Math.min(1,l2Support/3)+geomBonus*Math.min(1,support/4);
    return {a,b,score:Number(score.toFixed(4)),support:Number(support.toFixed(2)),coRecent:rc,coAll:ac,liftRecent:Number(rl.toFixed(3)),liftBase:Number(bl.toFixed(3)),adjRecent:ra,lag1Recent:l1Support,lag2Recent:l2Support,relations:geom};
  }
  function allEdges(stats){
    const out=[];for(let a=1;a<=80;a++)for(let b=a+1;b<=80;b++){const e=edge(stats,a,b);if(e.support>=1.5)out.push(e);}return out.sort((x,y)=>y.score-x.score||y.support-x.support);
  }
  function clusterMetrics(nodes,emap){
    const ns=sortNums(nodes),pairs=[];let strong=0,sumPos=0,maxEdge=0;
    for(let i=0;i<ns.length;i++)for(let j=i+1;j<ns.length;j++){
      const e=emap.get(key(ns[i],ns[j]));if(!e)continue;pairs.push(e);if(e.score>0){sumPos+=e.score;maxEdge=Math.max(maxEdge,e.score);}if(e.score>=.55&&e.support>=3)strong++;
    }
    const total=ns.length*(ns.length-1)/2,density=total?strong/total:0,avg=total?sumPos/total:0;
    const degrees=ns.map(n=>pairs.filter(e=>e.score>=.45&&(e.a===n||e.b===n)).length),covered=degrees.filter(x=>x>0).length/ns.length;
    const minDegree=Math.min(...degrees),bridges=degrees.filter(x=>x>=2).length;
    const score=avg*1.8+density*1.15+covered*.65+Math.min(.5,bridges/ns.length*.5)+Math.min(.35,maxEdge*.12);
    return {nodes:ns,score:Number(score.toFixed(4)),density:Number(density.toFixed(3)),avgEdge:Number(avg.toFixed(3)),strongEdges:strong,totalEdges:total,covered:Number(covered.toFixed(3)),minDegree,bridges,pairs:pairs.filter(e=>e.score>=.35).sort((a,b)=>b.score-a.score)};
  }
  function generateAssemblies(stats,edgesInput){
    const edges=edgesInput||allEdges(stats),emap=new Map(edges.map(e=>[key(e.a,e.b),e])),seeds=edges.filter(e=>e.score>=.55&&e.support>=3).slice(0,70),seen=new Map();
    const keep=nodes=>{if(nodes.length<2||nodes.length>MAX_GROUP)return;const m=clusterMetrics(nodes,emap),k=setKey(nodes);const minStrong=nodes.length<=3?1:Math.max(2,nodes.length-2);if(m.strongEdges<minStrong||m.covered<.7)return;const old=seen.get(k);if(!old||m.score>old.score)seen.set(k,m);};
    for(const s of seeds){
      let nodes=[s.a,s.b];keep(nodes);
      while(nodes.length<MAX_GROUP){
        let best=null;
        for(let y=1;y<=80;y++)if(!nodes.includes(y)){
          const es=nodes.map(x=>emap.get(key(x,y))).filter(Boolean).filter(e=>e.score>0),strong=es.filter(e=>e.score>=.45).length;
          if(!es.length||strong<1)continue;
          const avg=es.reduce((z,e)=>z+e.score,0)/nodes.length,bonus=strong/nodes.length*.45,sc=avg+bonus;
          if(!best||sc>best.sc)best={y,sc,strong};
        }
        if(!best||best.sc<.18)break;
        nodes=[...nodes,best.y];keep(nodes);
      }
    }
    const all=[...seen.values()].sort((a,b)=>b.score-a.score||b.nodes.length-a.nodes.length),chosen=[];
    for(const c of all){
      if(c.score<1.05)continue;
      const tooClose=chosen.some(x=>{const inter=c.nodes.filter(n=>x.nodes.includes(n)).length;return inter/Math.min(c.nodes.length,x.nodes.length)>.72;});
      if(tooClose)continue;
      const type=c.nodes.length===7?'K7':`ФРАГМЕНТ-${c.nodes.length}`;
      const level=c.score>=2.0?'СИЛЬНАЯ':c.score>=1.45?'СРЕДНЯЯ':'НАБЛЮДЕНИЕ';
      chosen.push({...c,type,level});if(chosen.length>=8)break;
    }
    return {all,chosen};
  }
  function cardFor(stats,n,edges){
    const e=edges.filter(x=>x.a===n||x.b===n).sort((a,b)=>b.score-a.score),neighbors=e.slice(0,8).map(x=>({number:x.a===n?x.b:x.a,score:x.score,support:x.support,relations:x.relations}));
    let bestFrame=null,bestFrameCount=0;
    for(const [k,c] of stats.rframes){const [l,x,r]=k.split('-').map(Number);if(x===n&&c>bestFrameCount){bestFrame={left:l,right:r,count:c};bestFrameCount=c;}}
    let bestPos=1,bestPosCount=0;for(let p=1;p<=20;p++){const c=stats.pos[n*21+p];if(c>bestPosCount){bestPos=p;bestPosCount=c;}}
    return {...staticInfo(n),appearAll:stats.freq[n],appear60:stats.rfreq[n],neighbors,bestFrame,bestPosition:bestPos};
  }
  function forecast(input){
    const stats=buildStats(input);if(!stats||stats.N<120)return null;
    const edges=allEdges(stats),asm=generateAssemblies(stats,edges),latest=stats.draws.at(-1),cards=Array.from({length:80},(_,i)=>cardFor(stats,i+1,edges));
    const selected=[];
    for(const size of [7,6,5,4,3,2]){
      const c=asm.all.find(x=>x.nodes.length===size&&x.score>=1.05);
      if(!c)continue;
      selected.push({...c,type:size===7?'K7':`ФРАГМЕНТ-${size}`,level:c.score>=2.0?'СИЛЬНАЯ':c.score>=1.45?'СРЕДНЯЯ':'НАБЛЮДЕНИЕ'});
      if(selected.length>=4)break;
    }
    const candidates=selected.map((c,i)=>({id:`N80-${i+1}`,numbers:c.nodes,size:c.nodes.length,type:c.type,level:c.level,score:c.score,density:c.density,strongEdges:c.strongEdges,totalEdges:c.totalEdges,bridges:c.bridges,keyEdges:c.pairs.slice(0,5).map(e=>({a:e.a,b:e.b,score:e.score,support:e.support,relations:e.relations}))}));
    return {version:VERSION,sourceDraw:Number(latest.draw),targetDraw:Number(latest.draw)+1,createdAt:new Date().toISOString(),scopeStartDraw:Number(stats.scope[0]?.draw||latest.draw),scopeDraws:stats.N,recentDraws:stats.W,candidates,cards,topEdges:edges.slice(0,120)};
  }
  function payout(size,hits){return Number(PAYOUTS[size]?.[hits]||0);}
  function settle(pred,actual){
    const aset=new Set((actual?.balls||[]).map(Number)),p=JSON.parse(JSON.stringify(pred));
    p.actual={draw:Number(actual.draw),date:actual.date||'',time:actual.time||'',balls:(actual.balls||[]).map(Number),column:Number(actual.column)||null,parity:actual.parity||''};
    p.candidates=(p.candidates||[]).map(c=>{const hits=(c.numbers||[]).filter(n=>aset.has(Number(n))),amount=payout(Number(c.size),hits.length);return {...c,hits,hitCount:hits.length,payout:amount,win:amount>0};});
    p.totalPayout=p.candidates.reduce((s,c)=>s+Number(c.payout||0),0);p.bestHit=p.candidates.reduce((m,c)=>Math.max(m,Number(c.hitCount||0)),0);p.settledAt=new Date().toISOString();return p;
  }
  const API={VERSION,PAYOUTS,staticInfo,staticRelation,buildStats,allEdges,generateAssemblies,forecast,settle,payout};
  if(typeof window!=='undefined')window.POZITRON_V63_NETWORK80=API;
  if(typeof module!=='undefined'&&module.exports)module.exports=API;
})();
