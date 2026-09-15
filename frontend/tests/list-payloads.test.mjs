import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';

// A bulk order fetch with per-row journal evidence is ~15 MB per 10 000 rows and was
// the slowest thing on the UAT dashboard. Pages that only aggregate rows must ask for
// `evidence=false`; only a file that actually renders `journal_fields` may keep it.
const roots=['app','components'].map(d=>new URL(`../${d}`,import.meta.url).pathname);
const files=[];
const walk=d=>{for(const n of readdirSync(d)){const p=join(d,n);statSync(p).isDirectory()?walk(p):/\.tsx?$/.test(n)&&files.push(p);}};
roots.forEach(walk);

const BULK=/\/api\/(?:journal\/)?orders\?[^`'"]*\bsize=(\$\{[^}]+\}|\d+)/g;

test('bulk order fetches skip journal evidence unless the file renders it',()=>{
 const offenders=[];
 for(const f of files){
  const src=readFileSync(f,'utf8');
  for(const m of src.matchAll(BULK)){
   const size=/^\d+$/.test(m[1])?Number(m[1]):Number((src.match(new RegExp(`${m[1].slice(2,-1)}\\s*=\\s*(\\d+)`))||[])[1]||0);
   if(size<1000) continue;
   const line=src.slice(0,m.index).split('\n').length;
   const fetchText=src.slice(m.index,src.indexOf('`',m.index+1)>0?src.indexOf('`',m.index+1):m.index+m[0].length+80);
   if(!/evidence=false/.test(fetchText)&&!/journal_fields/.test(src)) offenders.push(`${f.split('/frontend/')[1]}:${line} size=${size}`);
  }
 }
 assert.deepEqual(offenders,[],'add &evidence=false to these bulk fetches (or render journal_fields)');
});

test('the scan sees the known bulk fetches',()=>{
 const hits=files.flatMap(f=>[...readFileSync(f,'utf8').matchAll(BULK)].map(()=>f));
 assert.ok(hits.some(f=>f.endsWith('app/rejections/page.tsx')),'rejections page fetch not matched');
 assert.ok(hits.some(f=>f.endsWith('components/MissionControlTable.tsx')),'mission control fetch not matched');
});
