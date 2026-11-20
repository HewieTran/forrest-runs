#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
node_bin="${FORREST_NODE_BIN:-$HOME/.local/share/forrest-runs-beta/node-v24.22.1-linux-x64/bin/node}"
env_file="$HOME/.config/forrest-runs-aws-beta/beta.env"
export FORREST_AWS_BETA=1 HOSTNAME=127.0.0.1 NEXT_TELEMETRY_DISABLED=1
export PORT="${FORREST_BETA_PORT:-4180}"
"$node_bin" --env-file="$env_file" --input-type=module -e '
import { migrateSQLite } from "./runtime/sqlite.mjs";
migrateSQLite(process.env.FORREST_SQLITE_PATH, process.cwd());
'
exec "$node_bin" --env-file="$env_file" server.js
