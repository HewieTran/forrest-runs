#!/usr/bin/env bash
set -euo pipefail
: "${AWS_BETA_SSH_KEY:?Set the GitHub Actions deployment secret.}"
: "${AWS_BETA_KNOWN_HOSTS:?Set the public host key verified through the Lightsail terminal.}"
: "${GITHUB_SHA:?Missing deployment revision.}"
: "${GITHUB_RUN_ID:?Missing workflow run ID.}"
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ ]] || exit 1
archive="${1:-.aws-release/release.tar.gz}"
ssh_dir="$(mktemp -d)"
trap 'rm -rf -- "$ssh_dir"' EXIT
chmod 700 "$ssh_dir"
printf '%s\n' "$AWS_BETA_SSH_KEY" > "$ssh_dir/key"
printf '%s\n' "$AWS_BETA_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key" "$ssh_dir/known_hosts"
ssh_options=(-4 -T -i "$ssh_dir/key" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=8)
checksum="$(sha256sum "$archive" | cut -d ' ' -f 1)"
ssh "${ssh_options[@]}" ubuntu@3.132.106.53 "deploy $GITHUB_SHA $GITHUB_RUN_ID $checksum" < "$archive"
ssh "${ssh_options[@]}" ubuntu@3.132.106.53 status > "$ssh_dir/status.json"
python3 - "$ssh_dir/status.json" "$GITHUB_SHA" <<'PY'
import json,sys
state=json.load(open(sys.argv[1]))
if state.get('revision') != sys.argv[2]:
    raise SystemExit('Running revision does not match this workflow.')
print('Verified running AWS revision ' + state['revision'])
PY
