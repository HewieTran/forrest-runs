import {notFound} from 'next/navigation';
import Tracker from '../../components/Tracker';
import BlockLibrary from '../../components/BlockLibrary';
import SetupWizard from '../../components/SetupWizard';
import ProgressOverview from '../../components/ProgressOverview';
import {progressPreview} from '../../lib/progress-preview';
import {type BlockSummary} from '../../lib/blocks';
import {BLOCK_STATUSES,validDate,type BlockStatus} from '../../lib/domain';
import {centralToday,weekStart,addDays,EMPTY_WORKOUT_MEASUREMENTS,type AppData,type Workout} from '../../lib/domain';
export const dynamic='force-dynamic';
export default async function Preview({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const query=await searchParams;
 if(query.view==='progress-mobile')return <iframe title="Mobile progress preview" src="/preview?view=progress" style={{display:'block',width:390,maxWidth:'100%',height:850,border:0,margin:'20px auto'}}/>;
 if(query.view==='progress')return <ProgressOverview data={progressPreview(query.scenario)} preview/>;
 if(query.view==='setup')return <SetupWizard displayName="Runner" today={centralToday()} preview/>;
 const today=centralToday(),start=weekStart(today),stamp=new Date().toISOString();
 const details=[['Easy Run','5 mi easy','12:45–13:45 /mi'],['Mobility','15–25 min mobility or easy walk','Recovery effort'],['Quality Run','5 mi steady','Steady 11:30–11:45 /mi; controlled'],['Easy Run','3 mi recovery','13:30–14:30 /mi; very easy'],['Strength','Upper-body climbing / strength','Controlled effort'],['Long Run','13 mi cutback','11:50–12:30 /mi; finish controlled']];
 const rows:Workout[]=details.map(([type,plannedWorkout,targetPace],i)=>({...EMPTY_WORKOUT_MEASUREMENTS,id:`example-${i}`,planId:'example',date:addDays(start,i+1),phase:'Peak',type,plannedWorkout,targetPace,done:i<2,actualDistance:i===0?5:null,actualPace:i===0?'13:05 /mi':'',effort:i<2?5:null,pain:i<2?'None':'',notes:'',sourceRow:i+2,originalSource:null,version:1,updatedAt:stamp}));
 const initial:AppData={today,displayName:'Runner',plan:{id:'example',status:'active',raceName:'Dallas Marathon',raceDate:'2026-12-11',paceGuide:[{type:'Easy',target:'12:30–13:45 /mi',rule:'Full sentences; no ego pace'},{type:'Long',target:'11:45–12:45 /mi',rule:'Finish controlled, not wrecked'}],sourceName:null,version:1,createdAt:stamp,updatedAt:stamp},workouts:rows,restDays:[]};
 const summaries:BlockSummary[]=[
  {...initial.plan,workoutCount:6,completedCount:2,recordedMiles:5,firstWorkoutDate:rows[0].date,lastWorkoutDate:rows[5].date},
  {...initial.plan,id:'spring-10k',raceName:'Spring 10K',raceDate:'2027-03-14',status:'draft',paceGuide:[],sourceName:null,workoutCount:0,completedCount:0,recordedMiles:0,firstWorkoutDate:null,lastWorkoutDate:null},
  {...initial.plan,id:'autumn-half',raceName:'Autumn Half Marathon',raceDate:'2026-09-20',status:'completed',sourceName:null,workoutCount:6,completedCount:2,recordedMiles:5,firstWorkoutDate:rows[0].date,lastWorkoutDate:rows[5].date},
  {...initial.plan,id:'summer-base',raceName:'Summer base miles',raceDate:'2026-07-12',status:'archived',sourceName:null,workoutCount:6,completedCount:2,recordedMiles:5,firstWorkoutDate:rows[0].date,lastWorkoutDate:rows[5].date},
 ];
 if(query.view==='blocks')return <BlockLibrary initial={summaries} displayName="Runner" preview/>;
 if(query.blockId){
  const chosen=summaries.find(block=>block.id===query.blockId);
  if(chosen){initial.plan=chosen;initial.workouts=chosen.workoutCount?rows.map(row=>({...row,planId:chosen.id})):[];}
  else{initial.plan={...initial.plan,id:query.blockId,raceName:query.name?.slice(0,120)||'New training block',paceGuide:[],sourceName:null,raceDate:validDate(query.date)?query.date:initial.plan.raceDate,status:BLOCK_STATUSES.includes(query.status as BlockStatus)?query.status as BlockStatus:'draft'};initial.workouts=[];}
 }
 return <Tracker initial={initial} activeBlock={{id:'example',raceName:'Dallas Marathon'}} preview/>;
}
