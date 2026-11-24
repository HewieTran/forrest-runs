#!/usr/bin/env python3
# Receive one trusted-main release through an SSH key with a forced command.
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request

HOME = Path('/home/ubuntu')
STATE = HOME / '.local/share/forrest-runs-deploy'
UNIT = Path('/etc/systemd/system/forrest-runs-aws-beta.service')
SERVICE = 'forrest-runs-aws-beta.service'
NODE = HOME / '.local/share/forrest-runs-beta/node-v24.22.1-linux-x64/bin/node'
ENV = HOME / '.config/forrest-runs-aws-beta/beta.env'
MAX_ARCHIVE = 160 * 1024 * 1024
MAX_EXTRACTED = 700 * 1024 * 1024


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value) + '\n')
    temporary.replace(path)


def backup_database(source, destination):
    with sqlite3.connect(source) as connection, sqlite3.connect(destination) as backup:
        connection.backup(backup)
        if backup.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise RuntimeError('Database backup failed integrity check.')
    os.chmod(destination, 0o600)


def extract_release(archive, destination, revision):
    with tarfile.open(archive, 'r:gz') as bundle:
        members = bundle.getmembers()
        if len(members) > 40000 or sum(member.size for member in members) > MAX_EXTRACTED:
            raise ValueError('Release exceeds extraction limit.')
        names = set()
        for member in members:
            parts = PurePosixPath(member.name).parts
            if (not parts or parts[0] != 'release' or '..' in parts
                    or member.name.startswith('/') or not (member.isfile() or member.isdir())
                    or member.name in names):
                raise ValueError('Unexpected archive member.')
            names.add(member.name)
        bundle.extractall(destination, members=members, filter='data')
    release = destination / 'release'
    if (release / 'REVISION').read_text().strip() != revision:
        raise ValueError('Package revision does not match requested deployment.')
    for name in ('server.js', 'start.sh', 'runtime/sqlite.mjs', 'drizzle/meta/_journal.json'):
        if not (release / name).is_file():
            raise ValueError('Incomplete package.')
    return release


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def healthy(port, release):
    base = 'http://127.0.0.1:' + str(port)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(base + '/', timeout=3) as response:
            if b'Sign in with Google' not in response.read():
                return False
        # The exact generated BUILD_ID verifies that this process serves the
        # requested package, instead of accepting a leftover process's response.
        build_id = (release / '.next-node-proof/BUILD_ID').read_text().strip()
        with opener.open(base + '/_next/static/' + build_id + '/_buildManifest.js', timeout=3) as response:
            if response.status != 200:
                return False
        try:
            opener.open(base + '/auth/sign-in', timeout=3)
        except urllib.error.HTTPError as redirect:
            location = redirect.headers.get('Location', '')
            # Both are approved Cognito entry points; the custom domain is now
            # configured on beta. Keep exact origins and authorization paths.
            approved = ('https://auth.beta.forrestruns.com/oauth2/authorize?',
                        'https://us-east-2stmkwiiad.auth.us-east-2.amazoncognito.com/oauth2/authorize?')
            if redirect.code != 303 or not location.startswith(approved):
                return False
        else:
            return False
        return True
    except (OSError, urllib.error.URLError):
        return False


def wait_ready(port, release, process=None):
    for _ in range(30):
        if process is not None and process.poll() is not None:
            break
        if healthy(port, release):
            return
        time.sleep(1)
    raise RuntimeError('Release did not pass startup checks on port ' + str(port))


def install_unit(source):
    run('sudo', '-n', 'install', '-m', '0644', str(source), str(UNIT))
    run('sudo', '-n', 'systemctl', 'daemon-reload')


def activate(release, revision, run_id):
    if not ENV.is_file() or not NODE.is_file():
        raise RuntimeError('Existing beta runtime or configuration missing.')
    previous = run('sudo', '-n', 'systemctl', 'show', SERVICE, '--property=WorkingDirectory', '--value', capture_output=True).stdout.strip()
    if not (previous.startswith(str(STATE / 'releases') + '/') or previous == str(HOME / 'forrest-runs-beta-b8dbc7b')):
        raise RuntimeError('Unexpected current release. Review server configuration first.')
    run('sudo', '-n', 'systemctl', 'is-active', '--quiet', 'caddy')
    database = Path(run(str(NODE), '--env-file=' + str(ENV), '-e',
                        'process.stdout.write(process.env.FORREST_SQLITE_PATH || "")', capture_output=True).stdout)
    if not database.is_absolute() or not database.is_file():
        raise RuntimeError('Configured beta database missing.')
    backup = Path(tempfile.mkdtemp(prefix=revision[:7] + '-', dir=STATE / 'backups'))
    with (backup / 'previous.service').open('w') as saved_unit:
        run('sudo', '-n', 'cat', str(UNIT), stdout=saved_unit)
    # Validate schema and startup using a copy while the existing app still runs.
    preview_db = backup / 'preflight.sqlite'
    backup_database(database, preview_db)
    log = (backup / 'preflight.log').open('w')
    process = subprocess.Popen(['bash', str(release / 'start.sh')], stdout=log, stderr=subprocess.STDOUT,
                               env={**os.environ, 'FORREST_SQLITE_PATH': str(preview_db), 'FORREST_BETA_PORT': '4181'}, start_new_session=True)
    try:
        wait_ready(4181, release, process)
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        log.close()
    new_unit = backup / 'new.service'
    new_unit.write_text(f'''[Unit]
Description=Forrest Runs AWS beta ({revision})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory={release}
ExecStart=/bin/bash {release}/start.sh
Restart=on-failure
RestartSec=4
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
''')
    current_file = STATE / 'current.json'
    previous_status = current_file.read_text() if current_file.exists() else None
    pending = {'revision': revision, 'previous': previous, 'backup': str(backup), 'database': str(database)}
    write_json(STATE / 'pending.json', pending)
    paused = False
    stopped = False
    backed_up = False
    try:
        # Stop external traffic before the final backup. This prevents a failed
        # migration/startup from rolling back workouts saved during cutover.
        run('sudo', '-n', 'systemctl', 'stop', 'caddy')
        paused = True
        run('sudo', '-n', 'systemctl', 'stop', SERVICE)
        stopped = True
        backup_database(database, backup / 'training.sqlite')
        backed_up = True
        install_unit(new_unit)
        run('sudo', '-n', 'systemctl', 'start', SERVICE)
        wait_ready(4180, release)
        # Record readiness before reopening traffic. A hard crash leaves the
        # journal for deliberate recovery instead of blindly reverting live data.
        write_json(STATE / 'current.json', {'revision': revision, 'run_id': run_id, 'release': str(release), 'backup': str(backup)})
        run('sudo', '-n', 'systemctl', 'start', 'caddy')
    except BaseException:
        # The cutover is still isolated from users when startup checks fail.
        if stopped:
            run('sudo', '-n', 'systemctl', 'stop', SERVICE)
            if backed_up:
                backup_database(database, backup / 'failed.sqlite')
                backup_database(backup / 'training.sqlite', database)
            install_unit(backup / 'previous.service')
            run('sudo', '-n', 'systemctl', 'start', SERVICE)
        if previous_status is None:
            current_file.unlink(missing_ok=True)
        else:
            current_file.write_text(previous_status)
        if paused:
            run('sudo', '-n', 'systemctl', 'start', 'caddy')
        (STATE / 'pending.json').unlink()
        raise
    (STATE / 'pending.json').unlink()
    return {'revision': revision, 'run_id': run_id, 'status': 'deployed', 'backup': str(backup)}


def prune_history(current_release):
    # Keep the newest three packages and seven backups. Legacy manual release
    # directories are outside STATE and are never removed here.
    for parent, count in ((STATE / 'releases', 3), (STATE / 'backups', 7)):
        directories = sorted((item for item in parent.iterdir() if item.is_dir() and not item.is_symlink()),
                             key=lambda item: item.stat().st_mtime, reverse=True)
        for item in directories[count:]:
            if item != current_release.parent:
                shutil.rmtree(item)


def main():
    os.umask(0o077)
    command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
    if command == 'status':
        if (STATE / 'pending.json').exists():
            raise RuntimeError('Unfinished deployment requires recovery. See pending.json.')
        print((STATE / 'current.json').read_text())
        return
    match = re.fullmatch(r'deploy ([0-9a-f]{40}) ([0-9]{1,20}) ([0-9a-f]{64})', command)
    if not match:
        raise ValueError('This key permits deployment and status commands only.')
    revision, run_id_text, checksum = match.groups()
    run_id = int(run_id_text)
    STATE.mkdir(parents=True, exist_ok=True)
    for directory in ('releases', 'backups'):
        (STATE / directory).mkdir(exist_ok=True)
    with (STATE / 'deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if (STATE / 'pending.json').exists():
            raise RuntimeError('Unfinished deployment requires recovery. See pending.json.')
        current = json.loads((STATE / 'current.json').read_text()) if (STATE / 'current.json').exists() else {}
        if run_id < current.get('run_id', 0):
            raise ValueError('Refusing to replace a newer deployment with an older workflow run.')
        with tempfile.TemporaryDirectory(prefix='incoming-', dir=STATE) as incoming:
            archive = Path(incoming) / 'release.tar.gz'
            digest = hashlib.sha256()
            size = 0
            with archive.open('wb') as output:
                while chunk := sys.stdin.buffer.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_ARCHIVE:
                        raise ValueError('Release archive too large.')
                    digest.update(chunk)
                    output.write(chunk)
            if digest.hexdigest() != checksum:
                raise ValueError('Release checksum mismatch.')
            if current.get('revision') == revision:
                print(json.dumps({'revision': revision, 'status': 'already-deployed'}))
                return
            extracted = extract_release(archive, Path(incoming), revision)
            destination = Path(tempfile.mkdtemp(prefix=revision + '-', dir=STATE / 'releases'))
            release = destination / 'release'
            shutil.move(str(extracted), release)
            # Finish or recover even when the SSH client disconnects after upload.
            signal.signal(signal.SIGHUP, signal.SIG_IGN)
            try:
                result = activate(release, revision, run_id)
            except BaseException:
                if not (STATE / 'pending.json').exists():
                    shutil.rmtree(destination)
                raise
            print(json.dumps(result), flush=True)
            # Cleanup failures must not turn a successful deployment into failure.
            try:
                prune_history(release)
            except OSError as error:
                print('Release cleanup deferred: ' + str(error), file=sys.stderr)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Deployment failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
