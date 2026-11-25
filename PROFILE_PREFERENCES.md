# PR C — account profile preferences

Scope: Edit profile in the account menu; first/last name overrides; one-letter avatar with an automatic deterministic color and eight manual choices; hide Export backup in the header. Photos are deferred. Stack this focused PR on `ui/library-greeting-search` (#44), then retarget main after B merges. A (#43) is independent; C does not include its hero changes.

## Acceptance

- Both names: greet with first name and show its first letter. First only: first name and its letter. Last only: last name and its letter. Neither: sign-in first word, then Runner. Clearing both fields restores that fallback without changing authentication identity.
- Profile editor shows a live preview, labels all eight colors, indicates selection beyond color alone, and offers Automatic. White initials meet 4.5:1 for every palette entry. Automatic selection depends on stable owner ID, not random render state.
- Desktop uses a 560px dialog; phone uses the existing full-screen dialog shell. Dialog retains keyboard focus, returns focus to Account menu, and protects unsaved changes on Cancel, Escape, outside click, browser Back and page unload. Save errors retain edits; optimistic conflicts require reloading the latest saved version. Saving blocks dismissal.
- Saving updates the shared greeting and avatar immediately, refreshes server data, and persists on reload and server restart. Preview mode stays synthetic. Existing tabs, counts, block states, Create flow and schedule navigation are unchanged.
- Export backup is hidden in every app header. The authenticated recovery endpoint remains available. Full-account backup v8 includes profile preferences; block-scoped backup v7 remains unchanged. Existing v1–v7 normalization remains supported.

## Storage and recovery

Migration `0011_account_profiles.sql` creates an initially empty `training_profiles` table keyed by the authenticated owner ID, with nullable names/color and an optimistic version. It does not update or delete existing training rows. Runtime-native migration runners append it transactionally. Deploy using the existing pre-deployment SQLite backup/rollback process; do not copy a development database into staging or beta.

The API accepts only firstName, lastName, avatarColor and version. Owners come from the server session. No provider profile is mutated; there are no external photo services or new dependencies. Names are trimmed/NFC-normalized, limited to 80 characters, and reject control characters. Profile preferences are independent of block deletion and status.

Future photos would require owner-scoped object storage, a profile schema field for a stable object key, authenticated upload/delete with MIME and size validation, and an export manifest plus a portable image file. That work is not implemented here.

## Verification and release

Pure tests cover name fallbacks, deterministic colors/contrast, validation, backup compatibility, and migration preservation. Shared API acceptance checks run against disposable Worker/D1 and native Node/SQLite production builds. Native integration also checks full restart persistence and existing block, schedule, logging, progress and simulated generation flows.

Desktop/390px browser interaction and before/after screenshots require an available browser surface. HTTP/SSR checks are not a substitute. Record their status explicitly in the PR; do not merge with blocked required QA gates. No C staging or AWS deployment is included in this request.
