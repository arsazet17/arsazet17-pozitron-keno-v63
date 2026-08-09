'use strict';
const fs=require('fs');
const ENGINE=require('../engine-v63.js');
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function fail(m){throw new Error(m);}
const draws=read('keno-history-v63.json');
const state=read('fingerprint-state-v63.json');
const archive=read('fingerprint-archive-v63.json');
if(!Array.isArray(draws)||draws.length<10)fail('history invalid');
for(let i=1;i<draws.length;i++)if(Number(draws[i].draw)<=Number(draws[i-1].draw))fail('history not strictly sorted');
if(!state.serverLearning)fail('serverLearning flag missing');
const latest=Number(draws.at(-1).draw);
const pending=archive.filter(p=>!p.actual);
if(pending.length!==1)fail('must have exactly one pending prediction');
if(Number(pending[0].targetDraw)!==latest+1)fail(`pending ${pending[0].targetDraw} != ${latest+1}`);
if(Number(pending[0].sourceDraw)!==latest)fail('pending source must equal latest draw');
const targets=archive.map(p=>Number(p.targetDraw));
if(new Set(targets).size!==targets.length)fail('duplicate archive target');
for(let i=1;i<targets.length;i++)if(targets[i]!==targets[i-1]+1)fail(`archive gap ${targets[i-1]} -> ${targets[i]}`);
for(const p of archive.filter(x=>x.actual)){
  if(Number(p.actual.draw)!==Number(p.targetDraw))fail('actual/target mismatch');
  if(!Array.isArray(p.poolHits)||!Array.isArray(p.antiHits))fail('hits missing');
  if(!p.learnedWeights)fail('learnedWeights missing');
}
const w=ENGINE.normalizeWeights(state.weights);
for(const [k,v] of Object.entries(w))if(!Number.isFinite(Number(v))||v<.45||v>1.75)fail(`bad weight ${k}=${v}`);
console.log(`VALIDATION OK: latest=${latest}, pending=${pending[0].targetDraw}, archive=${archive.length}, settled=${archive.length-1}`);
