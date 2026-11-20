# Forrest Runs architecture

Last reviewed: **2026-11-19 (America/Chicago)**.
Owner: the agent implementing an architecture-affecting change; Hieu reviews the change.

This is the project's current architecture reference. It describes service
relationships and hosting boundaries, rather than every application screen or
library. Keep the current deployment separate from proposed changes.

## Evidence and deployment status

- Source inspected: GitHub main `b8dbc7bc1e2690a21bf4ac6b32b1d381aac66394`.
- Hieu reported updating AWS beta with the latest merged UI on 2026-11-19.
  This documentation task did not inspect the running server's release SHA or
  AWS resource configuration. Treat service placement below as the documented
  operational baseline, not a fresh AWS inventory audit.
- CloudFront, Lightsail/Caddy, and Cognito/Google were configured and live
  Google sign-in was previously reported working. Instance snapshots were
  reported enabled; their current schedule, retention and restore readiness
  have not been checked for this document.
- The repository's Node/Cognito adapters establish the app, storage and sign-in
  behavior. Older planning sections in ENVIRONMENTS.md and NODE_RUNTIME_PROOF.md
  predate the live beta; they are historical context, not current deployment status.
- GitHub-to-AWS automation has been requested in the AWS chat. No workflow
  exists in the inspected main tree; a running automatic pipeline is not
  established by this review.

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
**D1–D4** for deployment. Match it to the connection guide below its diagram.
References identify connections, not a universal execution order. A request can
reuse a connection, and sign-in, ordinary app traffic and backups follow different
paths. Substeps such as **R7.1–R7.3** explain several activities on one connection.
Preserve existing references when adding connections; assign new IDs rather than
renumbering unaffected links. Double-headed arrows include requests and responses.

## AWS beta: service relationships

```mermaid
flowchart LR
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
            caddy <-->|"R3 · Local proxy"| app
            app <-->|"R4 · Training records"| db
        end
        edge <-->|"R2 · Origin HTTPS"| caddy
        cognito <-->|"R7 · Tokens and signing keys"| app
        snapshots -.-|"R8 · Backup — reported"| host
    end

    browser <-->|"R1 · App traffic"| edge
    browser <-->|"R5 · Login redirects"| cognito
    google <-->|"R6 · Google federation"| cognito

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
```

Solid connections describe the documented running relationships. The dotted
backup connection and dashed snapshot border record a reported operational
setting that needs current verification. The backup line is an association with
the whole Lightsail instance, not an app-triggered backup operation. Arrows show
interaction, not a packet-level authentication sequence.

### Runtime connection guide

| Reference | Connection | Activities and result |
| --- | --- | --- |
| **R1** | Browser ↔ CloudFront | **R1.1** The browser requests pages or sends API actions, such as saving a workout, with its app-session cookie when signed in. **R1.2** Pages, data, status/error responses and any session-cookie updates return through CloudFront. |
| **R2** | CloudFront ↔ Caddy | **R2.1** CloudFront forwards app requests to the Lightsail HTTPS origin, including the authentication cookies, callback query parameters and write methods required by the app. **R2.2** Origin responses return through CloudFront. The documented app behavior has caching disabled; live settings were not re-audited. |
| **R3** | Caddy ↔ Next.js / Node.js | **R3.1** Caddy terminates origin HTTPS and proxies the request to the local Node app. **R3.2** The app serves the page or handles the route, including session, input and ownership checks where required. **R3.3** Its response returns through Caddy and R2/R1. |
| **R4** | App ↔ SQLite | **R4.1** The app's storage layer reads the signed-in account's training records or performs an authorized write. **R4.2** Existing validation and version checks protect changes; records or save/conflict results return to the app. The browser does not connect to SQLite directly. |
| **R5** | Browser ↔ Cognito | **R5.1** After the app initiates sign-in, the browser follows a redirect to Cognito with Google selected. **R5.2** Cognito redirects the browser back to the app's callback with a login code; this callback request reaches the app through R1, R2 and R3. |
| **R6** | Cognito ↔ Google | **R6.1** The runner completes Google sign-in in the browser. **R6.2** Cognito processes the federated Google identity and continues its authorization flow. This is a high-level federation relationship, including browser redirects; it is not a direct app-to-Google connection or a complete network sequence. |
| **R7** | App ↔ Cognito | **R7.1** The server exchanges the callback's code for Cognito tokens. **R7.2** It retrieves Cognito public signing keys when needed and verifies the returned identity and approved beta email. **R7.3** After verification, the app creates its own session cookie, returned through R3, R2 and R1. Later app requests verify that signed session locally rather than repeating the code exchange. |
| **R8** | Lightsail instance ··· snapshots | Records the reported instance-backup relationship, outside the runner's request path. It does not represent an app-triggered operation or a verified backup run. Current schedule, retention and restore readiness remain unverified. |

| Component | Responsibility |
| --- | --- |
| Runner's browser | Displays the React/TypeScript UI, sends app requests and follows sign-in redirects. |
| Amazon CloudFront | Public HTTPS entry point forwarding the app's requests to the Lightsail origin. The documented app behavior uses CachingDisabled and forwards the cookies, headers, query strings and methods needed by authentication and writes. |
| Amazon Lightsail | Linux host for the reverse proxy, app process and persistent SQLite file. The documented origin is IPv6-only. |
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
| Future production | Not established by this review | Record its actual services and separate data/secrets when implemented. |

### Current release path and requested automation

```mermaid
flowchart LR
    source["GitHub main"]
    bundle["Versioned Node release package"]
    beta["Lightsail AWS beta"]
    automation["Deployment automation — requested, unverified"]

    source -->|"D1 · Manual build"| bundle
    bundle -->|"D2 · Manual deployment"| beta
    source -.->|"D3 · Proposed trigger"| automation
    automation -.->|"D4 · Proposed deployment"| beta

    classDef delivery fill:#F1F5F9,stroke:#64748B,color:#243447
    classDef compute fill:#F1EBFF,stroke:#7C3AED,color:#3B1A66
    classDef proposed fill:#F8FAFC,stroke:#64748B,color:#475569,stroke-dasharray:5 4
    class source,bundle delivery
    class beta compute
    class automation proposed
```

The solid route is the documented manual release method. The dotted route is
requested future work, not an implemented pipeline or a choice of CI provider.
A merge, release build, deployment and post-deployment verification are distinct
events. Record their status separately.

### Deployment connection guide

| Reference | Connection | Activities and result |
| --- | --- | --- |
| **D1** | GitHub main → release package | **D1.1** Select an exact source revision. **D1.2** Build the Node release package manually. The source revision identifies what the package contains; a successful build alone does not mean it is deployed. |
| **D2** | Release package → Lightsail | **D2.1** Install the release files manually. **D2.2** Restart the app using the server's separate configuration and persistent SQLite storage. Recording the running revision and checking the affected flow are separate verification gates; this documentation update performed no deployment or new hosted verification. |
| **D3** | GitHub main → requested automation | **Proposed:** a change to main would trigger an automated release process. A working trigger is not established by this reference. |
| **D4** | Requested automation → Lightsail | **Proposed:** automate release delivery and app restart, then record and check the deployed revision. The implementing AWS PR must document the actual transport, credentials and verification; this connection is not evidence of a running pipeline. |

The ChatGPT Site uses different runtime/auth/storage adapters. It is not an
intermediate server that copies its database or whole deployed source tree into
AWS. Both environments should integrate the approved feature source while
preserving their platform adapters and separate data.

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
