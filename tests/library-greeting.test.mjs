import test from 'node:test';
import assert from 'node:assert/strict';
import { greetingPeriod, greetingText, firstName, librarySearch, LIBRARY_SEARCH_ENABLED } from '../lib/library-greeting.ts';
test('all local hours cover morning 5–11, afternoon 12–16, evening 17–4',()=>{
 assert.deepEqual(Array.from({length:24},(_,h)=>greetingPeriod(h)),[...Array(5).fill('evening'),...Array(7).fill('morning'),...Array(5).fill('afternoon'),...Array(7).fill('evening')]);
});
test('first-name extraction trims whitespace and preserves international names',()=>{
 for(const value of [undefined,null,'','  ','\n\t'])assert.equal(firstName(value),'Runner');
 assert.equal(firstName('  Hieu   Tran '),'Hieu');assert.equal(firstName('Natsuki'),'Natsuki');assert.equal(firstName('  山田 太郎'),'山田');
});
test('neutral SSR never chooses a server timezone period',()=>{
 assert.equal(greetingText('Hieu Tran','neutral'),'Welcome back, Hieu');assert.equal(greetingText(null,'neutral'),'Welcome back, Runner');
 assert.equal(greetingText('Hieu','morning'),'Good morning, Hieu');assert.equal(greetingText('','afternoon'),'Good afternoon, Runner');assert.equal(greetingText('Natsuki','evening'),'Good evening, Natsuki');
});
test('hidden search ignores stale q while preserving opt-in code path',()=>{
 assert.equal(LIBRARY_SEARCH_ENABLED,false);assert.equal(librarySearch('no-match'), '');assert.equal(librarySearch(['q']), '');assert.equal(librarySearch('Winter',true),'Winter');assert.equal(librarySearch(undefined,true),'');
});
