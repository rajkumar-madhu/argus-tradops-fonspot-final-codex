import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');

test('the narrow-screen single column comes after every desktop shell grid',()=>{
 // At <=900px the sidebar is hidden. If a later unconditional `.app-shell` grid rule
 // still reserves its column, the page content drops into that 224px track.
 const desktop=[...css.matchAll(/(^|\n)\.app-shell\s*\{[^}]*grid-template-columns:\s*\d+px/g)].map(m=>m.index);
 assert.ok(desktop.length,'expected a desktop shell grid rule');
 const collapse=[...css.matchAll(/@media\s*\(max-width:\s*900px\)\s*\{\s*\.app-shell\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/g)].map(m=>m.index);
 assert.ok(collapse.length,'expected a <=900px single-column shell rule');
 assert.ok(Math.max(...collapse)>Math.max(...desktop),'the <=900px collapse must follow the last desktop grid rule, or it never applies');
});
