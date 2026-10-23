import { authenticated,json,serverError } from '../../../lib/api';
import { loadTraining } from '../../../lib/store';
export const dynamic='force-dynamic';
export async function GET(){const user=await authenticated();if(!user)return json({error:'Please sign in to export your training.'},401);try{const {plan,workouts}=await loadTraining(user);return new Response(JSON.stringify({schemaVersion:1,exportedAt:new Date().toISOString(),plan,workouts},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="marathon-training-${new Date().toISOString().slice(0,10)}.json"`,'Cache-Control':'private, no-store'}});}catch(e){return serverError(e);}}
