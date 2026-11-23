import { overviewPreview } from '../../lib/block-overview-preview';
import GenerationProgress from '../../components/GenerationProgress';
import { planValidationMessage, LEGACY_VALIDATION_MESSAGE } from '../../lib/plan-validation';
import { simpleSetup } from '../../lib/setup';
import { preparePlanner, PLANNER_VERSION, workoutForSession } from '../../lib/planner';
import {notFound} from 'next/navigation';
import Tracker from '../../components/Tracker';
import BlockSettings from '../../components/BlockSettings';
import BlockLibrary from '../../components/BlockLibrary';
import SetupWizard from '../../components/SetupWizard';
import ProgressOverview from '../../components/ProgressOverview';
import {progressPreview} from '../../lib/progress-preview';
import {libraryFilter,landingFilter} from '../../lib/onboarding';
import {type BlockSummary} from '../../lib/blocks';
import {BLOCK_STATUSES,validDate,type BlockStatus} from '../../lib/domain';
import {centralToday,weekStart,addDays,EMPTY_WORKOUT_MEASUREMENTS,type AppData,type Workout} from '../../lib/domain';
export const dynamic='force-dynamic';
export default async function Preview({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const query=await searchParams;
 if(query.view==='generation-loading')return <main className="main-content"><GenerationProgress sample={query.scenario==='sample'} resumed={query.scenario==='resumed'}/></main>;
 if(query.view==='blocks-mobile'||query.view==='ready-mobile'){
  const target=new URLSearchParams({view:query.view==='blocks-mobile'?'blocks':'overview',scenario:query.scenario??(query.view==='ready-mobile'?'ready':'empty')});
  const status=libraryFilter(query.status);if(status)target.set('status',status);
  if(query.q)target.set('q',query.q);
  return <iframe title="Mobile onboarding preview" src={'/preview?'+target} style={{display:'block',width:query.width==='320'?320:390,maxWidth:'100%',height:950,border:0,margin:'20px auto'}}/>;
 }

 if(query.view==='overview-mobile') return <iframe title="Mobile training block overview" src={`/preview?view=overview&scenario=${['rest','unscheduled','empty'].includes(query.scenario??'')?query.scenario:''}`} style={{display:'block',width:390,maxWidth:'100%',height:850,border:0,margin:'20px auto'}}/>;
 if(query.view==='schedule-mobile') return <iframe title="Mobile workout schedule" src="/preview?view=schedule" style={{display:'block',width:390,maxWidth:'100%',height:850,border:0,margin:'20px auto'}}/>;
 if(query.view==='schedule') return <Tracker initial={overviewPreview(centralToday(), query.scenario)} view="schedule" initialDate={query.date} preview/>;
 if(query.view==='overview' && ['ready','ready-today','ready-past','ready-missing','ready-blocked','simulation-ready'].includes(query.scenario??'')){
  const data=overviewPreview(centralToday());
  data.plan={...data.plan,status:'draft',setup:null,generation:null};
  const shift=query.scenario==='ready-today'?0:query.scenario==='ready-past'?-2:3;
  data.workouts=query.scenario==='ready-missing'||query.start===''?[]:data.workouts.slice(0,1).map(row=>({...row,date:validDate(query.start)?query.start:addDays(data.today,shift),done:false}));
  // A legacy manual block can be ready even without a generated snapshot. The
  // missing-date case uses the existing readiness metadata only in this preview.
  if(query.scenario==='ready-missing'||query.start==='') data.plan={...data.plan,generation:{status:'accepted'} as NonNullable<AppData['plan']['generation']>};
  if(query.scenario==='simulation-ready') data.plan={...data.plan,generation:{status:'accepted',provider:'simulation'} as NonNullable<AppData['plan']['generation']>};
  return <Tracker initial={data} activeBlock={query.scenario==='ready-blocked'?{id:'other-current',raceName:'Current example plan'}:null} preview/>;
 }
 if(query.view==='overview') return <Tracker initial={overviewPreview(centralToday(), query.scenario)} preview/>;
 if(query.view==='setup-mobile'){const scenario=['goal-adjustment','cross-distance','schedule-earlier','schedule-later','benchmark-refresh','validation-error','legacy-validation-error'].includes(query.scenario??'')?query.scenario:'';return <iframe title="Mobile race setup preview" src={`/preview?view=setup&scenario=${scenario}`} style={{display:'block',width:390,maxWidth:'100%',height:850,border:0,margin:'20px auto'}}/>;}
 if(query.view==='workout-mobile')return <iframe title="Mobile workout preview" src={`/preview?view=workout&scenario=${['steps','race-steps','legacy'].includes(query.scenario??'')?query.scenario:''}`} style={{display:'block',width:390,maxWidth:'100%',height:850,border:0,margin:'20px auto'}}/>;
 if(query.view==='progress-mobile')return <iframe title="Mobile progress preview" src="/preview?view=progress" style={{display:'block',width:390,maxWidth:'100%',height:850,border:0,margin:'20px auto'}}/>;
 if(query.view==='progress')return <ProgressOverview data={progressPreview(query.scenario)} preview/>;
 if(query.view==='setup'){
  const today=centralToday();
  if(['goal-adjustment','cross-distance','schedule-earlier','schedule-later','benchmark-refresh','validation-error','legacy-validation-error'].includes(query.scenario??'')){
   const crossDistance = query.scenario === 'cross-distance';
   const scheduleExample = query.scenario === 'schedule-earlier' || query.scenario === 'schedule-later';
   const start = query.scenario === 'schedule-earlier' ? addDays(today, 28) : today;
   const setup=simpleSetup(undefined,'Example 5K',addDays(start,84),start),stamp=new Date(Date.now() - 120_000).toISOString();
   setup.step=3;setup.goal.targetDurationSeconds=scheduleExample ? 1800 : 900;setup.runner={...setup.runner,age:35,height:70,weight:175,experience:'novice'};setup.availability.days=[1,3,6];
   setup.benchmark={distance:'5k',durationSeconds:2100,date:addDays(today,-7),effortConfirmed:true};
   if (crossDistance) {
    setup.goal = { ...setup.goal, name: 'Example half marathon', distanceKm: 21.0975, targetDurationSeconds: 7200 };
    setup.benchmark.durationSeconds = 1680;
   }
   const refresh=query.scenario==='benchmark-refresh';
   const plan:AppData['plan']={id:'assessment-example',raceName:setup.goal.name,raceDate:setup.goal.targetDate,status:'draft',paceGuide:[],sourceName:null,version:1,createdAt:stamp,updatedAt:stamp,setup,
    generation:{schemaVersion:1,id:'example-clarification',provider:'simulation',status:'clarification',startedAt:stamp,finishedAt:stamp,acceptedAt:null,alteredAt:null,model:'simulation',promptVersion:'preview-only',validatorVersion:PLANNER_VERSION,input:preparePlanner(setup,today),setupSnapshot:setup,responseId:null,usage:null,error:null,
     output:{outcome:'needs_clarification',summary:'Example clarification for UI testing only.',goalAssessment:'Synthetic assessment, not a training recommendation.',assumptions:[],sessions:[],
      questions:[refresh?'Do you have a current race or best-effort time-trial result?':'Would you review the target finish time or race date?'],
      assessment:{decision:refresh?'refresh_benchmark':'adjust_goal',reason:refresh?'Example only: an unrepresentative result needs updating before estimating paces.':crossDistance ? 'Example only: the 5K time helps estimate pace, and the longer distance adds uncertainty.' : scheduleExample ? 'Example only: a 30-minute goal needs an adjustment with the current training window.' : 'Example only: a 15-minute goal is unsupported by this novice runner’s 35-minute benchmark and 12-week window. A later date alone does not guarantee it.',actions:refresh?['benchmark']:['target_time','race_date'],
       suggestions: refresh ? null : {
        finishTime: { durationSeconds: crossDistance ? 7800 : 2040, reason: 'This example target is closer to the confirmed benchmark.' },
        schedule: scheduleExample ? { additionalDays: 21, trainingDays: null, reason: 'The example adds three weeks for a more gradual build.' } : null,
       }}}}};
   if(query.scenario==='validation-error'||query.scenario==='legacy-validation-error'){plan.generation={...plan.generation!,status:'failed',output:null,error:query.scenario==='legacy-validation-error'?LEGACY_VALIDATION_MESSAGE:planValidationMessage('workout_arithmetic'),...(query.scenario==='validation-error'?{validationFailure:'workout_arithmetic' as const}:{})};}
   return <SetupWizard initial={plan} displayName="Runner" today={today} preview/>;
  }
  return <SetupWizard displayName="Runner" today={today} preview/>;
 }
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
 if(query.view==='blocks'){
  const draft={...summaries[1],hasSetup:true};
  const ready={...summaries[0],id:'ready',raceName:'Winter 5K',status:'draft' as const,sourceName:null,firstWorkoutDate:addDays(today,3),completedCount:0,recordedMiles:0};
  let examples=summaries;
  if(query.scenario==='empty')examples=[];
  if(query.scenario==='draft')examples=[draft];
  if(query.scenario==='ready')examples=[ready];
  if(query.scenario==='mixed')examples=[draft,ready];
  if(query.scenario==='history')examples=summaries.filter(b=>['completed','archived'].includes(b.status));
  if(query.scenario==='archived')examples=summaries.filter(b=>b.status==='archived');
  if(query.scenario==='simulation')examples=[{...ready,isSimulation:true,hasGeneratedPlan:true}];
  if(query.scenario==='dates')examples=[3,1,0,-2,null].map((offset,i)=>({...ready,id:'date-'+i,raceName:['Future','Tomorrow','Today','Past','Unknown'][i],firstWorkoutDate:offset===null?null:addDays(today,offset)}));
  return <BlockLibrary initial={examples} initialFilter={libraryFilter(query.status)??landingFilter(examples)} initialSearch={query.q??''} displayName="Runner" today={today} preview/>;
 }
 if(query.blockId){
  const chosen=summaries.find(block=>block.id===query.blockId);
  if(chosen){initial.plan=chosen;initial.workouts=chosen.workoutCount?rows.map(row=>({...row,planId:chosen.id})):[];}
  else{initial.plan={...initial.plan,id:query.blockId,raceName:query.name?.slice(0,120)||'New training block',paceGuide:[],sourceName:null,raceDate:validDate(query.date)?query.date:initial.plan.raceDate,status:BLOCK_STATUSES.includes(query.status as BlockStatus)?query.status as BlockStatus:'draft'};initial.workouts=[];}
 }
 if(query.view==='settings')return <BlockSettings initial={initial} activeBlock={{id:'example',raceName:initial.plan.raceName}} preview/>;
 if(query.view==='workout'){initial.workouts=[{...rows[0],date:today,done:false,plannedDistance:5,plannedDurationSeconds:3600,plannedPaceSecondsPerMile:720,targetMetric:'distance',actualDurationSeconds:3400,actualPaceSecondsPerMile:680}];if(query.scenario==='empty')initial.workouts=initial.workouts.map(row=>({...row,actualDistance:null,actualPace:'',actualDurationSeconds:null,actualPaceSecondsPerMile:null}));if(query.scenario==='legacy')initial.workouts=initial.workouts.map(row=>({...row,...EMPTY_WORKOUT_MEASUREMENTS}));}
 if(query.view==='workout'&&['steps','race-steps'].includes(query.scenario??'')){
  const race=query.scenario==='race-steps';
  const step=(kind:'warmup'|'run'|'recovery'|'cooldown'|'race',label:string,durationSeconds:number,paceSecondsPerMile:number,effort:'easy'|'steady'|'race')=>({kind,label,durationSeconds,paceSecondsPerMile,distanceMiles:durationSeconds/paceSecondsPerMile,effort});
  const steps=race?[step('warmup','Easy warm-up',600,735,'easy'),{...step('race','5K race',1620,1620/(5000/1609.344),'race'),distanceMiles:5000/1609.344},step('cooldown','Easy cool-down',600,735,'easy')]:[step('warmup','Easy warm-up',600,735,'easy'),step('run','Brief steady pickup',120,585,'steady'),step('recovery','Easy recovery',120,750,'easy'),step('run','Brief steady pickup',120,585,'steady'),step('cooldown','Easy cool-down',600,735,'easy')];
  const session={date:today,type:race?'Race' as const:'Quality Run' as const,phase:'Taper' as const,title:race?'5K race day':'Light steady pickups',notes:'Stay relaxed and finish feeling fresh; skip pickups if tired.',steps};
  const {planStructure:_structure,...generated}=workoutForSession(session);
  initial.workouts=[{...rows[0],...generated,originalSource:{session},sourceRow:null}];
 }
 return <Tracker initial={initial} activeBlock={{id:'example',raceName:'Dallas Marathon'}} preview/>;
}
