import { authenticated,body,json,serverError } from '../../../lib/api';
import { addWorkout } from '../../../lib/store';
import { validateWorkout } from '../../../lib/domain';
export async function POST(request:Request) {
 const user=await authenticated();if(!user)return json({error:'Please sign in before saving.'},401);
 let input;try{input=validateWorkout(await body(request));}catch(e){return json({error:e instanceof Error?e.message:'Invalid workout.'},400);}
 try{return json({workout:await addWorkout(user,input)},201);}catch(e){return serverError(e);}
}
