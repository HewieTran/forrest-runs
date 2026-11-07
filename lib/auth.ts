import { getAuthenticatedUser } from '@forrest/platform';
import type { AppUser } from './user';

// Runtime adapters supply identity through the same ownership contract.
export async function getCurrentUser(): Promise<AppUser | null> {
  return getAuthenticatedUser();
}

export { signInPath, signInLabel } from '@forrest/platform';
