# PR B — Local greeting and hidden library search

Approved Stage 1 mockup: viewer-local morning 05:00–11:59, afternoon
12:00–16:59, evening 17:00–04:59. Show first sign-in name word, with Runner
fallback. Server and hydration snapshots remain neutral: Welcome back, name.
useSyncExternalStore selects local period after hydration; focus, visibility and
a minute timer refresh it. No heading animation or server timezone inference.
The training-day clock remains Central time and is unchanged.

Search stays in source behind LIBRARY_SEARCH_ENABLED=false. Ignore q in SSR,
initial client state and popstate restoration. Existing status URL/tab counts,
search-enabled path, other card states, Create and empty guidance remain.

Tests cover all 24 hour values, boundaries, whitespace/international names,
neutral SSR, and the disabled/re-enabled query path. Verify browser hydration,
status back/forward and 1280/390 layouts before final QA sign-off. Do not claim
browser coverage when tools are unavailable. No new dependency or data mutation.

Architecture impact: no infrastructure/auth/storage/schema change. No new
backend call or paid service. Profile overrides are deferred to PR C.
PR B is based directly on main to keep review independent of PR A. Staging may
port A and B together onto its existing separate source/runtime history.
