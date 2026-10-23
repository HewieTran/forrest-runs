import { authenticated,blockIdFromRequest,body,json,serverError } from '../../../../lib/api';
import { saveWorkout } from '../../../../lib/store';
import { validateWorkout } from '../../../../lib/domain';
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
 const user=await authenticated();if(!user)return json({error:'Please sign in before saving.'},401);
 let input;try{input=validateWorkout(await body(request));}catch(e){return json({error:e instanceof Error?e.message:'Invalid workout.'},400);}
 try{const {id}=await params;const saved=await saveWorkout(user,id,input,blockIdFromRequest(request));if(!saved)return json({error:'This workout changed in another tab or is unavailable. Your edits are still here. Reload to see the latest version.'},409);return json({workout:saved});}catch(e){return serverError(e);}
}
