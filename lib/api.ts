import { getChatGPTUser } from '../app/chatgpt-auth';
export function json(value:unknown,status=200) {return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export async function authenticated() {const user=await getChatGPTUser();return user;}
export async function body(request:Request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('Send workout details as JSON.');
  const text=await request.text();if(text.length>150000)throw new Error('This request is too large.');return JSON.parse(text);
}
export function serverError(error:unknown) {console.error('Training request failed:',error);return json({error:'Your data could not be loaded or saved. Please try again. Your existing records have not been replaced.'},500);}
