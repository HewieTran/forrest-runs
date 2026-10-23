import { getChatGPTUser } from '../app/chatgpt-auth';
import type { AppUser } from './user';

// Sites currently supplies identity. Keep that provider behind this app boundary.
// The existing provider ID passes through unchanged to preserve record ownership.
export async function getCurrentUser(): Promise<AppUser | null> {
  return getChatGPTUser();
}

export { chatGPTSignInPath as signInPath } from '../app/chatgpt-auth';
