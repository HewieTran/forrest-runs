import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { getChatGPTUser, chatGPTSignInPath } from '../app/chatgpt-auth';
import type { TrainingDatabase } from './database';

export function getDatabase(): TrainingDatabase {
  if (!env.DB) throw new Error('The training database is unavailable.');
  return drizzle(env.DB, { schema });
}

export function getRuntimeVariables(): Record<string, string | undefined> {
  return env as unknown as Record<string, string | undefined>;
}

export const getAuthenticatedUser = getChatGPTUser;
export const signInPath = chatGPTSignInPath;
export const signInLabel = 'Sign in with ChatGPT';

export async function handleLocalSignIn(_request: Request): Promise<Response> {
  return new Response('Not found.', { status: 404 });
}
