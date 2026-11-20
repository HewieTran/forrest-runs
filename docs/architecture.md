# Forrest Runs architecture

Last reviewed: **2026-11-19 (America/Chicago)**.
Owner: the agent implementing an architecture-affecting change; Hieu reviews the change.

This is the project's current architecture reference. It describes service
relationships and hosting boundaries, rather than every application screen or
library. Keep the current deployment separate from proposed changes.

## Evidence and deployment status

- Source inspected and AWS deployed revision: `24f7ee72b49e2cf9b32f6668db8bb2c77996959e` (merged pipeline PRs #30 and #31).
- The first complete automatic main deployment succeeded on 2026-11-19.
  The Lightsail receiver's status matched the workflow revision, readiness and
  sign-in redirect passed locally, and the public CloudFront HTTPS sign-in page
  passed. This verifies the deployment path, not a full AWS resource inventory.
  Real Google sign-in and desktop/phone save/reload were not repeated in this run.
- CloudFront, Lightsail/Caddy, and Cognito/Google were configured and live
  Google sign-in was previously reported working. Instance snapshots were
  reported enabled; their current schedule, retention and restore readiness
  have not been checked for this document.
- The repository's Node/Cognito adapters establish the app, storage and sign-in
  behavior. Older planning sections in ENVIRONMENTS.md and NODE_RUNTIME_PROOF.md
  predate the live beta; they are historical context, not current deployment status.
- Hieu reported enabling dual-stack networking and supplied static IPv4
  `3.132.106.53` for the existing Lightsail instance. This workspace could not
  reach the instance directly. GitHub Actions attempt 2 successfully verified the
  trusted server host key and authenticated the restricted deployment key over IPv4;
  this is not a full firewall or AWS inventory audit.
- Automatic GitHub Actions delivery is live. PR #31 fixed archive portability;
  CI extracts the actual archive outside the checkout with the same strict receiver
  checks before running persistence, account-isolation and simulated Cognito tests.
- The successful run verified restricted IPv4 SSH, checksum and package revision,
  database-copy preflight, final live SQLite backup, service cutover, readiness,
  running revision and the public HTTPS entry point. Deployment backups remain on
  the same instance; off-instance snapshot restore readiness remains unverified.
  Evidence: [first complete main deployment](https://github.com/HewieTran/forrest-runs/actions/runs/44676880380).

## Diagram conventions

Read diagrams from left to right. Keep runtime and deployment in separate views;
split a growing view into focused diagrams instead of adding an unreadably long row.

| Color | Component purpose |
| --- | --- |
| Blue | Networking and HTTPS entry |
| Purple | Hosting, app processes and request handling |
| Amber | Identity and sign-in, including the external Google provider |
| Green | Persistent data and backups |
| Slate | Browser, source control and release artifacts |

Color identifies purpose, not deployment status. Boundaries show where services
live; labels and dashed connections/borders identify reported, proposed or
unverified items. These status cues remain readable without distinguishing colors.

Each connection has a stable numbered reference: **R1–R8** for runtime and
**D1–D4** for deployment. Connections carry short ID labels; their numbered explanations appear in a
panel beside the architecture inside the same diagram. Expand or zoom to read
both together. Invisible layout links position the panels and are not system connections.
References identify connections, not a universal execution order. A request can
reuse a connection, and sign-in, ordinary app traffic and backups follow different
paths. Substeps such as **R7.1–R7.3** explain several activities on one connection.
Preserve existing references when adding connections; assign new IDs rather than
renumbering unaffected links. Double-headed arrows include requests and responses.

## AWS beta: service relationships

```mermaid
flowchart LR
    subgraph runtimeView["Runtime architecture"]
        direction LR
    browser["Runner's browser"]
    google["Google sign-in"]

    subgraph aws["AWS beta — documented baseline"]
        edge["CloudFront — public HTTPS entry"]
        cognito["Cognito user pool — identity"]
        snapshots["Lightsail snapshots — reported enabled"]
        subgraph host["Lightsail instance — hosting"]
            caddy["Caddy — HTTPS proxy"]
            app["Next.js / Node.js — app and authorization"]
            db[("SQLite — persistent training data")]
            caddy <-->|"R3"| app
            app <-->|"R4"| db
        end
        edge <-->|"R2"| caddy
        cognito <-->|"R7"| app
        snapshots -.-|"R8"| host
    end

    browser <-->|"R1"| edge
    browser <-->|"R5"| cognito
    google <-->|"R6"| cognito

    end

    subgraph runtimeGuide["Connection explanations"]
        direction TB
        noteR1["`**R1 · App traffic**
R1.1 Browser requests pages or submits API actions,
sending its app-session cookie when signed in.
R1.2 Pages, data, errors and cookie updates
return through CloudFront.`"]
        noteR2["`**R2 · Origin HTTPS**
R2.1 CloudFront forwards requests to Caddy over HTTPS,
including cookies, callback parameters and write methods.
R2.2 Origin responses return through CloudFront.
App caching is documented as disabled; live settings unverified.`"]
        noteR3["`**R3 · Local proxy**
R3.1 Caddy terminates HTTPS and forwards to local Node.
R3.2 App handles the route, checking the session,
input and ownership where required.
R3.3 Response returns through Caddy, R2 and R1.`"]
        noteR4["`**R4 · Training records**
R4.1 Storage layer reads owned records
or performs an authorized write.
R4.2 Validation and version checks protect changes;
records or save/conflict results return to the app.
Browser has no direct database connection.`"]
        noteR5["`**R5 · Login redirects**
R5.1 Browser follows the app redirect to Cognito,
with Google selected.
R5.2 Cognito redirects back with a login code.
The callback reaches the app through R1, R2 and R3.`"]
        noteR6["`**R6 · Google federation**
R6.1 Runner completes Google sign-in in the browser.
R6.2 Cognito processes the Google identity
and continues authorization.
This relationship includes browser redirects;
it is not a direct app-to-Google connection.`"]
        noteR7["`**R7 · Tokens and signing keys**
R7.1 Server exchanges login code for Cognito tokens.
R7.2 Fetches public signing keys when needed;
verifies the identity and approved beta email.
R7.3 App creates its own session cookie,
returned through R3, R2 and R1.
Later requests verify the app session locally;
they do not repeat the code exchange.`"]
        noteR8["`**R8 · Backup — reported**
Reported instance snapshots, outside the request path.
An instance-backup association, not an app call.
Schedule, retention and restore readiness unverified.`"]
        noteR1 ~~~ noteR2
        noteR2 ~~~ noteR3
        noteR3 ~~~ noteR4
        noteR4 ~~~ noteR5
        noteR5 ~~~ noteR6
        noteR6 ~~~ noteR7
        noteR7 ~~~ noteR8
    end

    runtimeView ~~~ runtimeGuide

    classDef client fill:#F1F5F9,stroke:#64748B,color:#243447
    classDef network fill:#E8F2FF,stroke:#2563EB,color:#12315A
    classDef compute fill:#F1EBFF,stroke:#7C3AED,color:#3B1A66
    classDef identity fill:#FFF3D6,stroke:#B7791F,color:#68450F
    classDef storage fill:#E9F6EE,stroke:#238636,color:#17452B
    classDef reported fill:#E9F6EE,stroke:#238636,color:#17452B,stroke-dasharray:5 4
    class browser client
    class edge network
    class caddy,app compute
    class cognito,google identity
    class db storage
    class snapshots reported
    style aws fill:#F8FAFC,stroke:#94A3B8,color:#334155
    style host fill:#FAF7FF,stroke:#7C3AED,color:#3B1A66
    classDef explanation fill:#FFFFFF,stroke:#CBD5E1,color:#243447
    class noteR1,noteR2,noteR3,noteR4,noteR5,noteR6,noteR7,noteR8 explanation
    style runtimeView fill:transparent,stroke:transparent
    style runtimeGuide fill:#F8FAFC,stroke:#94A3B8,color:#334155
```

Solid connections describe the documented running relationships. The dotted
backup connection and dashed snapshot border record a reported operational
setting that needs current verification. The backup line is an association with
the whole Lightsail instance, not an app-triggered backup operation. Arrows show
interaction, not a packet-level authentication sequence.

| Component | Responsibility |
| --- | --- |
| Runner's browser | Displays the React/TypeScript UI, sends app requests and follows sign-in redirects. |
| Amazon CloudFront | Public HTTPS entry point forwarding the app's requests to the Lightsail origin. The documented app behavior uses CachingDisabled and forwards the cookies, headers, query strings and methods needed by authentication and writes. |
| Amazon Lightsail | Linux host for the reverse proxy, app process and persistent SQLite file. Dual-stack and attached static IPv4 were reported on 2026-11-19; the existing CloudFront origin uses its IPv6 hostname. |
| Caddy | Terminates origin HTTPS and proxies requests to the local Node app. |
| Next.js / Node.js | Serves the UI and backend routes; validates input, verifies sessions, enforces approved-beta access, account ownership and optimistic concurrency. |
| SQLite / Drizzle | Stores users' training blocks, prescriptions, results and saved generation data on the host's disk through the existing store boundary and versioned migrations. |
| Amazon Cognito user pool | Federates Google sign-in and issues the identity token verified by the app. |
| Google | External identity provider. It is outside the AWS boundary. |
| Lightsail snapshots | Reported instance backup mechanism. Keep backup policy and restore verification distinct from simply having snapshots enabled. |

The proxy, app and SQLite database occupy the **same Lightsail instance**.
Cognito and CloudFront are separate managed services. The app has a single-host
compute/storage failure boundary; this diagram does not claim high availability.

### Sign-in and data access

1. After the initial app request through **R1–R3**, the app redirects the browser
   to Cognito's authorization endpoint with Google selected (**R5**).
2. Google authentication returns through Cognito (**R6**). Cognito redirects the
   browser to the app's `/auth/callback` (**R5**), reached through **R1–R3**.
3. The server exchanges the authorization code with Cognito, verifies the
   returned ID token using Cognito's public signing keys, and checks the verified
   Google identity against the approved-email list (**R7**).
4. The app issues its own secure, HttpOnly session cookie, returned through
   **R3 → R2 → R1**. Later requests use that signed session; the server checks
   access before reading or writing each user's records through **R4**.

The Cognito user pool subject anchors ownership. Google credentials are
configured in Cognito; the Cognito app-client secret and app-session secret are
server-side deployment configuration. Do not put credential values in this file.

In the inspected AWS/Node adapter, generation is **simulation-only**.
There is no live OpenAI API dependency in the current beta runtime.

## Environments and delivery

| Environment | Hosting / identity / storage | Relationship |
| --- | --- | --- |
| Local QA | Disposable Node/SQLite or Worker/Miniflare builds; synthetic users | Tests a specified source revision; isolated from live records. |
| ChatGPT Site staging | Sites runtime with Cloudflare Workers/D1 and managed ChatGPT sign-in | Separate hosting, identity and database from AWS. It has also held Hieu's real records, so the staging label alone does not make destructive testing safe. |
| AWS beta / UAT | CloudFront, Lightsail/Caddy/Next.js/SQLite, Cognito with Google | Separate beta accounts and data. Deploy an identified release and verify it there. |
| Shared live use | Hieu chose to keep the current AWS beta instance for himself and a few friends | Treat its records as live data. A separate production instance is deferred; every successful automatic main release updates this shared app. |

### Current automatic release path and manual fallback

```mermaid
flowchart LR
    subgraph deploymentView["Deployment architecture"]
        direction LR
    source["GitHub main"]
    bundle["Versioned Node release package"]
    beta["Lightsail AWS beta"]
    automation["GitHub Actions — automatic delivery verified"]

    source -->|"D1"| bundle
    bundle -->|"D2"| beta
    source -->|"D3"| automation
    automation -->|"D4"| beta

    end

    subgraph deploymentGuide["Connection explanations"]
        direction TB
        noteD1["`**D1 · Manual build**
D1.1 Select an exact GitHub source revision.
D1.2 Build its versioned Node release package.
A successful build does not establish deployment.`"]
        noteD2["`**D2 · Manual deployment**
D2.1 Install the release files on Lightsail.
D2.2 Restart using server-held configuration
and the existing persistent SQLite database.
Record the running SHA and verify the affected flow
as separate release gates; no new check performed here.`"]
        noteD3["`**D3 · Main trigger — build verified**
D3.1 A main push starts the Node build and synthetic checks.
D3.2 Retain the exact commit package for five days.
PR #30 is merged; main-triggered build/tests passed.`"]
        noteD4["`**D4 · SSH deployment — verified**
D4.1 Send package over IPv4 using a dedicated restricted key.
D4.2 Verify checksum, preflight a database copy,
pause Caddy, back up live SQLite and switch the service.
D4.3 Verify package identity and the running revision;
restore the prior service/database on startup failure.
D4.4 Check public HTTPS after activation.
First complete main deployment passed at 24f7ee7.
Live Google/phone smoke checks remain separate.`"]
        noteD1 ~~~ noteD2
        noteD2 ~~~ noteD3
        noteD3 ~~~ noteD4
    end

    deploymentView ~~~ deploymentGuide

    classDef delivery fill:#F1F5F9,stroke:#64748B,color:#243447
    classDef compute fill:#F1EBFF,stroke:#7C3AED,color:#3B1A66
    classDef proposed fill:#F8FAFC,stroke:#64748B,color:#475569,stroke-dasharray:5 4
    class source,bundle delivery
    class beta compute
    class automation delivery
    classDef explanation fill:#FFFFFF,stroke:#CBD5E1,color:#243447
    class noteD1,noteD2,noteD3,noteD4 explanation
    style deploymentView fill:transparent,stroke:transparent
    style deploymentGuide fill:#F8FAFC,stroke:#94A3B8,color:#334155
```

The automatic route is **D3–D4**, verified by the successful main deployment
at `24f7ee72b49e2cf9b32f6668db8bb2c77996959e`. **D1–D2** retain the manual
release method as a fallback. Pull requests run build/package tests without deploying;
only the newest main revision can proceed through the automatic deployment gate.
A merge, release build, deployment and post-deployment verification are distinct
events. Record their status separately.

The ChatGPT Site uses different runtime/auth/storage adapters. It is not an
intermediate server that copies its database or whole deployed source tree into
AWS. Both environments should integrate the approved feature source while
preserving their platform adapters and separate data.

Pipeline setup and recovery details are maintained in
[PR #30 deployment documentation](https://github.com/HewieTran/forrest-runs/blob/main/docs/aws-deployment.md).
GitHub holds the dedicated deployment private key. Lightsail holds its public
key, root-owned receiver, application secrets, release files and local database
backups. This adds no S3 bucket or second instance. Hieu approved the dual-stack
instance price increase; Actions compute and artifact usage follow account allowances.

## Keeping this reference current

For every PR, record **Architecture impact: changed / no change**, with one
sentence explaining the result.

Update this document in the same PR when a change affects services, hosting,
network routes, identity/access boundaries, data location, backups, secrets
placement, deployment automation or external integrations.

- The implementing agent owns the diagram and component-inventory update.
- Keep the current deployed diagram accurate. Put an approved but undeployed
  design in a clearly labeled proposed section; do not silently promote it to
  current because code merged.
- At deployment, record the environment, exact release SHA, verification date,
  and safe smoke-check evidence in the release/PR record. Update this document's
  deployment evidence when it changes the recorded architecture/status.
- Explain why a service or connection changed and its cost/data/security impact.
  New paid resources still require Hieu's existing cost approval.
- UI-only layout, color and branding changes normally need no diagram redraw.
- Review diagrams and links as documentation. Do not provision resources, run
  paid API calls, or repeat application-wide browser QA solely to edit this file.
- Read this file from the current repository in each feature/AWS chat. Chat
  names and conversation memory do not synchronize architecture records.

## Source references

- [Cognito adapter](../runtime/cognito.ts): redirects, code exchange, token
  verification, beta approval and app sessions.
- [Node runtime adapter](../runtime/node.ts): SQLite, identity and simulation mode.
- [SQLite adapter](../runtime/sqlite.mjs): local persistence and migrations.
- [Node runtime and beta configuration](../NODE_RUNTIME_PROOF.md): adapter setup
  and CloudFront behavior; its earlier provisioning checklist is historical.
- [AWS Cognito federation endpoints](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints.html):
  browser authorization, app token exchange and public signing keys.

## Change log

| Date | Change | Status |
| --- | --- | --- |
| 2026-11-19 | Establish AWS beta topology, environment boundaries and architecture-maintenance rule. | Documentation prepared from repository source and deployment reports; live AWS configuration not re-audited. |
| 2026-11-19 | Reorient runtime and deployment views horizontally and add a shared color key for component roles, retaining explicit status labels. | Documentation presentation only; no service, deployment or infrastructure change. |
| 2026-11-19 | Number every runtime and deployment connection, explain multi-activity connections with substeps, and cross-reference the sign-in walkthrough. | Documentation explanation only; deployment and verification status unchanged. |
| 2026-11-19 | Embed numbered activity descriptions directly on every runtime and deployment connection using multiline labels; remove duplicate connection tables. | Documentation presentation only; horizontal layout, colors and deployment evidence preserved. |
| 2026-11-19 | Record reported dual-stack/static IPv4, the decision to share one AWS instance, and draft PR #30 Actions/SSH delivery with D3/D4 activities. | Approved design and code in draft PR; server setup and live automatic deployment pending. |
| 2026-11-19 | Restore short connection IDs on arrows and move their full descriptions to a side panel inside each expandable diagram. | Documentation layout only; service relationships and deployment status unchanged. |
| 2026-11-19 | Record merged pipeline PR #30, successful main build and restricted SSH verification, and pre-activation archive rejection; track packaging fix PR #31. | Automatic deployment not yet successful; manually installed app preserved. |
| 2026-11-19 | Record merged PR #31 and first successful main-to-Lightsail deployment; mark D3/D4 as active and retain manual delivery as fallback. | AWS revision 24f7ee72b49e2cf9b32f6668db8bb2c77996959e, receiver status/readiness and public HTTPS verified; real Google/phone smoke check not repeated. |
