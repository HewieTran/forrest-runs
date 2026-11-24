# AWS beta generator pilot

## Scope and acceptance

This PR connects the existing Responses API planner to the Node/SQLite AWS
runtime. Deploy with simulation still enabled, then explicitly activate a pilot
for Hieu's approved Google email only. Other approved testers keep simulation.
The separate beta sign-in allowlist remains required: adding a pilot email does
not grant beta access. The local proof always simulates. Sites retains its
existing configuration when no pilot binding is defined.

Acceptance: the pilot sees live generation and an OpenAI disclosure on Review;
valid output automatically saves as a draft, survives reload, and starts only
after an explicit Start action. Clarifications and failures preserve intake and
do not save workouts. Simulation stays labeled and cannot activate. Server-side
ownership, concurrency, budget and exact-model restrictions remain enforced.
Review desktop and phone behavior, errors, loading and saved drafts. Existing
workouts and historical generation snapshots must remain unchanged.

No new infrastructure, database migration or dependency is needed. This PR does
not install a key, call the real API, change AWS configuration or enable live
generation. A merge triggers the existing deployment workflow; merging alone
does not select live mode unless the server environment already opts in.

## Cost and model controls

- Existing approved model: `gpt-6-luna`, low reasoning, Responses API,
  `store: false`, no tools, automatic retries or model fallback.
- Standard rates checked 2026-11-24: $0.10 per million input tokens and $0.50
  per million output tokens. The existing ledger conservatively ignores input
  cache discounts. [Model reference](https://developers.openai.com/api/docs/models/gpt-6-luna).
- The SQLite ledger caps this deployment at $4 per UTC month. It reserves $0.025
  before dispatch, settles reported usage, and retains uncertain charges. Ten
  attempts per account per UTC day and a one-minute cooldown also apply.
- Different keys in one OpenAI project share project usage. The existing Sites
  environment has an independent ledger: its $4 cap and AWS's $4 cap are **not**
  a combined $4 cap. Review total Platform usage and avoid simultaneous live
  testing across environments during the initial AWS pilot. This PR does not
  verify or modify the reported $5 Platform hard limit. Don't treat a budget
  alert alone as enforcement. No shared cloud accounting service is added.
- There is no new AWS recurring charge from this code; the API bills separately
  from AWS. One prior synthetic-profile live evaluation cost about $0.003762,
  but that is one observation, not a per-plan guarantee. Current multi-distance
  model quality and the real AWS flow still require evaluation; see
  [the existing evaluation gates](../PLANNER_EVALUATION.md#remaining-release-gates).

## Before merging or installing the key

1. Pass the PR build, extracted-package tests and independent QA. Confirm main
   hasn't introduced conflicting setup/generator changes. Use synthetic provider
   responses for ordinary testing; never rerun paid evaluations implicitly.
2. In Lightsail's SSH terminal, check the service startup/user and protected
   environment file without posting its contents. The release's `start.sh`
   loads the file with Node's `--env-file`:

   ```sh
   sudo systemctl show forrest-runs-aws-beta.service -p ExecStart -p User
   stat -c '%a %U %n' /home/ubuntu/.config/forrest-runs-aws-beta/beta.env
   ```

   In the protected file (currently
   `/home/ubuntu/.config/forrest-runs-aws-beta/beta.env`), leave
   `TRAINING_PLANNER_MODE=simulation` and
   `FORREST_LIVE_GENERATOR_ALLOWED_EMAILS=` for the initial deployment.
   Preserve all existing Cognito, origin, approved-email and SQLite settings.
3. Merge only when authorized; verify the successful Actions run and exact
   deployed revision. Check approved-account Google sign-in and sign-out on
   `https://beta.forrestruns.com` and the original CloudFront URL; confirm an
   unapproved account is denied. Generate/reopen a sample with simulation on.

## Close the hosted timeout gate before enabling live mode

The AWS provider request has a 110-second timeout (Sites keeps 120 seconds), and
the generation POST waits for
it. A previous real response took about 56 seconds. Inspect the **app origin**
in the existing CloudFront distribution, not Cognito's managed distribution:
Origins → select Lightsail origin → Edit → Additional settings.

Record its response/read timeout and response completion timeout. CloudFront's
default read timeout is 30 seconds and POST requests are not retried by
CloudFront after that timeout. A proxy can disconnect while Node continues a
paid request and saves its result. Set the origin read timeout to 120 seconds
after configuration approval, leaving 10 seconds after the provider deadline
for saving/responding. Any explicit completion timeout and Caddy response-header
timeout must allow at least 120 seconds (an unset completion cap is acceptable).
Confirm the supported quota first; request an increase if needed. Don't change billing
plans, add paid infrastructure, shorten the provider deadline or approve a new
asynchronous design implicitly. Keep simulation on if this cannot be met.
See [AWS origin timeout documentation](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesOrigin.html#DownloadDistValuesOriginResponseTimeout).

After configuration is agreed, verify through the public hostname with a slow
synthetic response in an isolated preview if available, then with the single
approved real pilot request. After a browser timeout, reopen the block and
inspect its saved state and usage before requesting anything again.

## Install the existing dedicated key and activate the pilot

Do this only after the deployed revision, timeout gate and pilot account are
confirmed. Keep the key in the existing protected server environment file, never
chat, GitHub, client-side variables or screenshots. Use Lightsail's SSH terminal:

```sh
nano /home/ubuntu/.config/forrest-runs-aws-beta/beta.env
chmod 600 /home/ubuntu/.config/forrest-runs-aws-beta/beta.env
```

Add/update these entries in the editor, using the key already created and the
exact verified Google email approved for the pilot:

```dotenv
TRAINING_PLANNER_MODE=openai
OPENAI_PLAN_MODEL=gpt-6-luna
OPENAI_API_KEY=REPLACE_IN_THE_SERVER_EDITOR_ONLY
FORREST_LIVE_GENERATOR_ALLOWED_EMAILS=REPLACE_WITH_APPROVED_PILOT_EMAIL
```

Do not paste these placeholders as real settings. Missing mode defaults to
simulation. Missing/empty pilot list keeps everyone in simulation. Unknown or
blank mode disables generation. A missing key or unapproved model disables live
generation before any attempt/charge. Email matching ignores case and whitespace.

```sh
sudo systemctl restart forrest-runs-aws-beta.service
sudo systemctl is-active forrest-runs-aws-beta.service
```

The service reads these at runtime; no frontend rebuild is needed to toggle.

## One real acceptance request, then review

1. Sign in as the approved pilot on `beta.forrestruns.com`. Create a fresh draft
   from the runner's confirmed intake; don't change goals to bypass validation.
   Review the OpenAI disclosure, then Generate **once**. Check loading and either
   a validated saved draft or a clear clarification/error with preserved intake.
2. Inspect the plan, reload, reopen it from training blocks, and confirm no new
   generation is dispatched merely by reopening. Explicitly Start training only
   after reviewing the schedule. Log/edit one synthetic result, reload and find
   progress on desktop and phone. Preserve actual workout data.
3. Inspect OpenAI project usage and the protected SQLite `training_ai_usage`
   ledger with a read-only tool. Match the attempt, model, tokens, status and
   estimated charge. Don't export keys or intake into logs. If validation,
   authentication, quota, billing or a timeout fails, investigate that attempt
   before making another paid request; never reset the ledger to retry.
4. With a separate approved nonpilot account confirm it sees simulation and
   cannot start a sample. Confirm another account cannot read the pilot block;
   an unapproved Google account must still be denied at beta sign-in.
5. Record deployed SHA, public URL, desktop/phone results, observed latency,
   ledger status and any remaining quality concerns in the PR. Don't widen the
   pilot or declare general beta readiness from one successful generation.

## Immediate rollback

Set `TRAINING_PLANNER_MODE=simulation` in the same environment file and restart
the service. Optionally empty the pilot list as well. This stops **new** paid
dispatches after restart; it cannot undo API costs from in-flight requests.
Do not delete the ledger or database, restore an older backup over current
workouts, or change Cognito/approved-email settings. Saved real plans and workout
history stay intact. Verify a fresh draft generates a labeled sample and the
original beta link still signs in.

## Repeatable offline checks

```sh
node scripts/node-proof.mjs build
node --experimental-strip-types tests/node-generator-integration.mjs
```

The second command uses signed synthetic AWS sessions, a temporary SQLite
database, and a child-process fetch interceptor that rejects all outbound calls.
It covers pilot/nonpilot routing, secret exclusion, ownership, direct-request
overrides, same-block and global-budget concurrency, accounting after deletion
and invalid output, daily limits, timeout, billing, save/reload/start and rollback.
CI repeats it against the extracted deployable package. It is not verification
of the real key, Google login, CloudFront timeouts or model coaching quality.
