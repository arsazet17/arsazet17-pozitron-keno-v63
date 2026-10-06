import fs from 'node:fs/promises';

async function read(file){return fs.readFile(file,'utf8');}
async function write(file,text){await fs.writeFile(file,text);}

const versionFile='version-v63.js';
const source=await read(versionFile);
const m=source.match(/version:'(\d+)\.(\d+)\.(\d+)'.*build:'(\d+)'/);
if(!m) throw new Error('Не удалось прочитать version-v63.js');

const major=Number(m[1]),minor=Number(m[2]),patch=Number(m[3])+1;
const oldVersion=`${m[1]}.${m[2]}.${m[3]}`;
const nextVersion=`${major}.${minor}.${patch}`;
const nextBuild=`${major}${minor}${patch}`;

await write(versionFile,`'use strict';\nwindow.POZITRON_V63_VERSION=Object.freeze({version:'${nextVersion}',build:'${nextBuild}'});\n`);

let index=await read('index.html');
index=index.replaceAll(oldVersion,nextVersion);
index=index.replace(/\?v=\d+/g,`?v=${nextBuild}`);
await write('index.html',index);

let sw=await read('sw.js');
sw=sw.replace(/const CACHE='pozitron-v63-app-\d+';/,`const CACHE='pozitron-v63-app-${nextBuild}';`);
sw=sw.replace(/('\.\/[^']+\?v=)\d+/g,`$1${nextBuild}`);
await write('sw.js',sw);

const manifest=JSON.parse(await read('manifest.webmanifest'));
manifest.name=`ПОЗИТРОН КЕНО v${nextVersion}`;
manifest.short_name=`КЕНО ${nextVersion}`;
await write('manifest.webmanifest',JSON.stringify(manifest));

let readme=await read('README.md');
readme=readme.replace(/^# .*$/m,`# ПОЗИТРОН КЕНО v${nextVersion} · SERVER`);
await write('README.md',readme);

console.log(`VERSION_BUMP ${oldVersion} -> ${nextVersion} (build ${nextBuild})`);
