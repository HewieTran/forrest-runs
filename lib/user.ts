// App ownership contract. Preserve these IDs when changing sign-in providers.
// A future provider must map identities to existing owners, never derive IDs from email.
export type AppUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};
