import { authenticated,blockIdFromRequest,body,json,serverError } from '../../../lib/api';
import { loadTraining,writablePlan } from '../../../lib/store';
import { validDate } from '../../../lib/domain';
import { plans } from '../../../db/schema';
import { getDb } from '../../../db';
import { and,eq } from 'drizzle-orm';
export const dynamic='force-dynamic';
export async function GET(request:Request){const user=await authenticated();if(!user)return json({error:'Please sign in to load your training.'},401);try{return json(await loadTraining(user,blockIdFromRequest(request)));}catch(e){return serverError(e);}}
export async function PATCH(request:Request){
 const user=await authenticated();if(!user)return json({error:'Please sign in before saving.'},401);
 let v;try{v=await body(request);if(typeof v.raceName!=='string'||!v.raceName.trim()||v.raceName.length>120||!validDate(v.raceDate)||!Number.isInteger(v.version)||v.version<1)throw new Error('Enter a race name and valid race date.');}catch(e){return json({error:e instanceof Error?e.message:'Invalid settings.'},400);}
 try{const plan=await writablePlan(user,blockIdFromRequest(request));const saved=await getDb().update(plans).set({raceName:v.raceName.trim(),raceDate:v.raceDate,version:v.version+1,updatedAt:new Date().toISOString()}).where(and(eq(plans.id,plan.id),eq(plans.ownerId,user.userId),eq(plans.version,v.version))).returning().get();if(!saved)return json({error:'Race settings changed in another tab. Reload before saving.'},409);return json(await loadTraining(user,plan.id));}catch(e){return serverError(e);}
}
