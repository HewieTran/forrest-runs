import {notFound} from 'next/navigation';
import Tracker from '../../components/Tracker';
import {centralToday,weekStart,addDays,type AppData,type Workout} from '../../lib/domain';
export const dynamic='force-dynamic';
export default function Preview(){
 if(process.env.NODE_ENV!=='development')notFound();
 const today=centralToday(),start=weekStart(today),stamp=new Date().toISOString();
 const details=[['Easy Run','5 mi easy','12:45–13:45 /mi'],['Mobility','15–25 min mobility or easy walk','Recovery effort'],['Quality Run','5 mi steady','Steady 11:30–11:45 /mi; controlled'],['Easy Run','3 mi recovery','13:30–14:30 /mi; very easy'],['Strength','Upper-body climbing / strength','Controlled effort'],['Long Run','13 mi cutback','11:50–12:30 /mi; finish controlled']];
 const rows:Workout[]=details.map(([type,plannedWorkout,targetPace],i)=>({id:`example-${i}`,planId:'example',date:addDays(start,i+1),phase:'Peak',type,plannedWorkout,targetPace,done:i<2,actualDistance:i===0?5:null,actualPace:i===0?'13:05 /mi':'',effort:i<2?5:null,pain:i<2?'None':'',notes:'',sourceRow:i+2,originalSource:null,version:1,updatedAt:stamp}));
 const initial:AppData={today,displayName:'Runner',plan:{id:'example',raceName:'Dallas Marathon',raceDate:'2026-12-11',paceGuide:[{type:'Easy',target:'12:30–13:45 /mi',rule:'Full sentences; no ego pace'},{type:'Long',target:'11:45–12:45 /mi',rule:'Finish controlled, not wrecked'}],sourceName:null,version:1,createdAt:stamp,updatedAt:stamp},workouts:rows};
 return <Tracker initial={initial} preview/>;
}
