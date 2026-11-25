import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryHero, roadPoint, journeyTicks } from '../lib/library-hero.ts';
import { EMPTY_WORKOUT_MEASUREMENTS } from '../lib/domain.ts';
const plan = { id:'owned',status:'active',raceName:'Year crossing',raceDate:'2027-01-17',paceGuide:[],sourceName:null,version:1,createdAt:'2026-11-01',updatedAt:'2026-11-01',setup:{goal:{startDate:'2026-12-07'}} };
const row=(id,date,extra={})=>({...EMPTY_WORKOUT_MEASUREMENTS,id,date,planId:'owned',phase:'Base Build',type:'Easy Run',done:false,actualDistance:null,sourceRow:null,...extra});
const data=workouts=>({plan,workouts,restDays:[],today:'2026-12-31',displayName:'Runner'});
test('hero uses saved start and race across years; weekly running sums preserve null and zero',()=>{
 const hero=libraryHero(data([row('a','2026-12-28',{phase:'Peak',plannedDistance:5,done:true,actualDistance:0}),row('b','2027-01-02',{phase:'Peak',plannedDistance:6}),row('s','2026-12-31',{phase:'Peak',type:'Strength',done:true,actualDistance:88})]));
 assert.equal(hero.route.week,4);assert.equal(hero.route.totalWeeks,6);assert.equal(hero.daysToRace,17);assert.equal(hero.weekly.recorded,0);assert.equal(hero.weekly.planned,11);assert.equal(hero.phase,'Peak');assert.equal(hero.next.date,'2027-01-02');
 assert.equal(libraryHero(data([])).weekly.recorded,null);
});
test('only saved phase timings become markers; missing/overlapping phases stay unspecified',()=>{
 const hero=libraryHero(data([row('a','2026-12-07'),row('b','2026-12-20'),row('c','2026-12-21',{phase:'Peak'}),row('d','2027-01-03',{phase:'Peak'}),row('e','2027-01-04',{phase:'Taper'}),row('f','2027-01-16',{phase:'Taper'})]));
 assert.deepEqual(hero.phases.map(p=>[p.name,p.startWeek,p.endWeek]),[['Base Build',1,2],['Peak',3,4],['Taper',5,6]]);assert.equal(hero.phase,'Peak');assert.equal(hero.phases[1].percent,14/41*100);
 assert.equal(libraryHero(data([row('a','2026-12-31',{phase:''})])).phases.length,0);
 const mixed=libraryHero(data([row('a','2026-12-07'),row('b','2027-01-04'),row('c','2026-12-21',{phase:'Peak'}),row('d','2027-01-03',{phase:'Peak'})]));assert.equal(mixed.phase,'Peak');assert.deepEqual(mixed.phases.map(p=>p.name),['Base Build','Peak','Base Build']);
 const conflict=libraryHero(data([row('a','2026-12-31'),row('b','2026-12-31',{phase:'Peak'})]));assert.equal(conflict.phase,null);assert.equal(conflict.phases.length,0);
});
test('missing/reversed routes do not fabricate markers; same-day and out-of-block dates clamp',()=>{
 const d={...data([]),plan:{...plan,setup:null}};assert.equal(libraryHero(d).route,null);assert.deepEqual(libraryHero(d).phases,[]);
 assert.equal(libraryHero({...d,plan:{...plan,raceDate:'2026-01-01'}}).route,null);
 assert.equal(libraryHero({...data([]),today:'2020-01-01'}).route.percent,0);assert.equal(libraryHero({...data([]),today:'2030-01-01'}).route.percent,100);
 assert.equal(libraryHero({...data([]),plan:{...plan,raceDate:'2026-12-07'}}).route.totalWeeks,1);
});
test('SVG geometry clamps marker positions and tick density reduces on phone',()=>{
 assert.deepEqual(roadPoint(-1),roadPoint(0));assert.deepEqual(roadPoint(101),roadPoint(100));
 assert.equal(roadPoint(0,true).x,18);assert.equal(roadPoint(100,true).x,322);
 assert.deepEqual(journeyTicks(1),[1]);assert.deepEqual(journeyTicks(0),[]);assert.ok(journeyTicks(100,true).length<=5);assert.ok(journeyTicks(100).length<=8);
});
