import { env } from 'cloudflare:workers';
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { plans, workouts } from '../db/schema';
import { addDays, centralToday, type AppData, type Plan, type Workout, type WorkoutInput, validateWorkout } from './domain';
import type { ChatGPTUser } from '../app/chatgpt-auth';

type Seed = Pick<Plan,'raceName'|'raceDate'|'paceGuide'|'sourceName'> & {workouts:Omit<Workout,'id'|'planId'|'updatedAt'|'version'>[]};
async function seedFor(user:ChatGPTUser):Promise<Seed|null> {
  const vars=env as unknown as Record<string,string|undefined>;
  if(!vars.TRAINING_SEED_OWNER||user.email.toLowerCase()!==vars.TRAINING_SEED_OWNER.toLowerCase())return null;
  const encoded=Array.from({length:10},(_,i)=>vars[`TRAINING_SEED_${i+1}`]??'').join('');
  if(!encoded)return null;
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const seed=JSON.parse(await new Response(stream).text()) as Seed;
  if(!Array.isArray(seed.workouts)||seed.workouts.length>3000)throw new Error('The initial training import is invalid.');
  for(const w of seed.workouts)validateWorkout({...w,version:1});
  return seed;
}
export async function userPlan(user:ChatGPTUser) {
  const db=getDb();let plan=await db.select().from(plans).where(eq(plans.ownerId,user.userId)).get();
  if(plan)return plan;
  const seed=await seedFor(user),stamp=new Date().toISOString(),id=`plan:${user.userId}`;
  const initial={id,ownerId:user.userId,raceName:seed?.raceName??'My marathon',raceDate:seed?.raceDate??addDays(centralToday(),180),paceGuide:seed?.paceGuide??[],sourceName:seed?.sourceName??null,createdAt:stamp,updatedAt:stamp};
  if(!env.DB)throw new Error('The training database is unavailable.');
  const statements=[env.DB.prepare('INSERT INTO training_plans (id,owner_id,race_name,race_date,pace_guide,source_name,version,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)').bind(id,user.userId,initial.raceName,initial.raceDate,JSON.stringify(initial.paceGuide),initial.sourceName,stamp,stamp)];
  for(const w of seed?.workouts??[])statements.push(env.DB.prepare('INSERT INTO workouts (id,plan_id,date,phase,type,planned_workout,target_pace,done,actual_distance,actual_pace,effort,pain,notes,source_row,original_source,version,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)').bind(`${id}:row:${w.sourceRow}`,id,w.date,w.phase,w.type,w.plannedWorkout,w.targetPace,w.done?1:0,w.actualDistance,w.actualPace,w.effort,w.pain,w.notes,w.sourceRow,JSON.stringify(w.originalSource),stamp));
  try {await env.DB.batch(statements);}catch(error){
    // Another first-load request may have atomically created the same plan.
    plan=await db.select().from(plans).where(eq(plans.ownerId,user.userId)).get();
    if(!plan)throw error;
  }
  return (await db.select().from(plans).where(eq(plans.ownerId,user.userId)).get())!;
}
export async function loadTraining(user:ChatGPTUser):Promise<AppData> {
  const owned=await userPlan(user);const {ownerId: _ownerId,...plan}=owned;
  const rows=await getDb().select().from(workouts).where(eq(workouts.planId,plan.id)).orderBy(asc(workouts.date),asc(workouts.sourceRow));
  return {plan,workouts:rows,displayName:user.fullName?.split(' ')[0]??'Runner',today:centralToday()};
}
export async function saveWorkout(user:ChatGPTUser,id:string,input:WorkoutInput) {
  const plan=await userPlan(user);
  const {version,...values}=input;
  return getDb().update(workouts).set({...values,version:version+1,updatedAt:new Date().toISOString()}).where(and(eq(workouts.id,id),eq(workouts.planId,plan.id),eq(workouts.version,version))).returning().get();
}
export async function addWorkout(user:ChatGPTUser,input:WorkoutInput) {
  const plan=await userPlan(user);
  return getDb().insert(workouts).values({...input,id:crypto.randomUUID(),planId:plan.id,version:1,updatedAt:new Date().toISOString()}).returning().get();
}
