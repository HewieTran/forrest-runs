import { getChatGPTUser } from '../app/chatgpt-auth';
import { TrainingRequestError } from './training-errors';
export function json(value:unknown,status=200) {return Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export async function authenticated() {const user=await getChatGPTUser();return user;}
export async function body(request:Request) {
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new Error('Send workout details as JSON.');
  const text=await request.text();if(text.length>150000)throw new Error('This request is too large.');return JSON.parse(text);
}
export function blockIdFromRequest(request: Request): string | undefined {
  const values = new URL(request.url).searchParams.getAll('blockId');
  if (!values.length) return undefined;
  const value = values[0];
  if (values.length !== 1 || !value || value.length > 200 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TrainingRequestError('Choose a valid training block.', 400);
  }
  return value;
}
export function serverError(error:unknown) {
  if (error instanceof TrainingRequestError) return json({ error: error.message }, error.status);
  console.error('Training request failed:',error);
  return json({error:'Your data could not be loaded or saved. Please try again. Your existing records have not been replaced.'},500);
}
