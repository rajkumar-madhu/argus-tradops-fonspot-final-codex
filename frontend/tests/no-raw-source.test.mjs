import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';

function files(dir,out=[]){
 for(const name of readdirSync(dir)){
  const p=join(dir,name);
  if(statSync(p).isDirectory()){files(p,out);continue}
  if(p.endsWith('.tsx'))out.push(p);
 }
 return out;
}

/** Row-level objects: `a.source` on an alert is its origin, not a data-source wire value. */
const ROW_VARS=new Set(['a','r','o','s','x','row','item','alert','venue','file','q','line','log','ev','event']);
/** Payload `source` values ("demo", "journal snapshot", …) must be rendered by a helper. */
const HELPER=/sourceDisplayName|sourceBadgeText|sourceBadgeTone|freshness|isJournalSource|hasLiveMarketFeed|dashboardMetaLine/;

test('no page renders a payload source value — operator UI must never show "demo"',()=>{
 const offenders=[];
 for(const f of [...files('app'),...files('components')]){
  readFileSync(f,'utf8').split('\n').forEach((line,i)=>{
   if(/^\s*(\/\/|\*|\/\*)/.test(line)||HELPER.test(line))return;
   // Passing it down as a prop is fine — only rendering it is not.
   const body=line.replace(/\bsource=\{[^}]*\}/g,'');
   const m=body.match(/\$\{\s*(\w+)\??\.source\b[^}]*\}|\{\s*(\w+)\??\.source\s*(?:\|\||\?\?|\})/);
   if(m&&!ROW_VARS.has(m[1]??m[2]))offenders.push(`${f}:${i+1} ${line.trim().slice(0,90)}`);
  });
 }
 assert.deepEqual(offenders,[],`route these through sourceDisplayName():\n${offenders.join('\n')}`);
});
