import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).resolve().parents[1] / 'scripts/aws/receiver.py')
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)
REVISION = 'a' * 40


class ArchiveTests(unittest.TestCase):
    def archive(self, root, entries):
        archive = root / 'bundle.tgz'
        with tarfile.open(archive, 'w:gz') as bundle:
            for name, kind, value in entries:
                member = tarfile.TarInfo(name)
                if kind == 'link':
                    member.type = tarfile.SYMTYPE
                    member.linkname = value
                    bundle.addfile(member)
                else:
                    content = value.encode()
                    member.size = len(content)
                    bundle.addfile(member, io.BytesIO(content))
        return archive

    def test_traversal_links_and_revision_mismatch_are_rejected(self):
        cases = [[('release/../../escape', 'file', 'bad')],
                 [('release/link', 'link', '/etc/passwd')],
                 [('release/REVISION', 'file', 'wrong')],
                 [('release/a', 'file', 'one'), ('release/a', 'file', 'two')]]
        for entries in cases:
            with self.subTest(entries=entries), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                with self.assertRaises(ValueError):
                    receiver.extract_release(self.archive(root, entries), root / 'out', REVISION)

    def test_complete_package_extracts(self):
        entries = [(name, 'file', REVISION if name.endswith('REVISION') else '{}') for name in
                   ['release/REVISION', 'release/server.js', 'release/start.sh', 'release/runtime/sqlite.mjs', 'release/drizzle/meta/_journal.json']]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            result = receiver.extract_release(self.archive(root, entries), root / 'out', REVISION)
            self.assertEqual((result / 'REVISION').read_text(), REVISION)


class ReceiverTests(unittest.TestCase):
    def invoke(self, directory, command, content=b'archive', current=None):
        state = Path(directory)
        if current:
            (state / 'current.json').write_text(json.dumps(current))
        stdin = Mock(buffer=io.BytesIO(content))
        with patch.object(receiver, 'STATE', state), patch.dict(receiver.os.environ, {'SSH_ORIGINAL_COMMAND': command}), \
                patch.object(receiver.sys, 'stdin', stdin), patch.object(receiver.sys, 'stdout', io.StringIO()), \
                patch.object(receiver, 'activate') as activate:
            receiver.main()
            activate.assert_not_called()

    def test_key_rejects_shell_and_malformed_commands(self):
        for command in ('bash', 'deploy ' + REVISION + ' 1 bad', 'status; id', 'deploy ' + REVISION + ' 1 ' + 'a' * 64 + '\n'):
            with self.subTest(command=command), tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(ValueError):
                    self.invoke(tmp, command)

    def test_checksum_failure_cannot_activate(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'checksum'):
                self.invoke(tmp, 'deploy ' + REVISION + ' 2 ' + '0' * 64)

    def test_older_run_cannot_replace_newer_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, 'older'):
                self.invoke(tmp, 'deploy ' + REVISION + ' 2 ' + '0' * 64, current={'run_id': 3})

    def test_interrupted_transaction_blocks_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'pending.json').write_text('{}')
            with self.assertRaisesRegex(RuntimeError, 'recovery'):
                self.invoke(tmp, 'deploy ' + REVISION + ' 2 ' + '0' * 64)

    def test_same_revision_retry_does_not_reinstall(self):
        content=b'already tested package'
        checksum=receiver.hashlib.sha256(content).hexdigest()
        with tempfile.TemporaryDirectory() as tmp:
            self.invoke(tmp, 'deploy ' + REVISION + ' 3 ' + checksum, content, {'run_id': 2, 'revision': REVISION})


class CutoverTests(unittest.TestCase):
    def exercise(self, failure=None):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            state = home / 'state'
            (state / 'backups').mkdir(parents=True)
            (state / 'releases').mkdir()
            previous = home / 'forrest-runs-beta-b8dbc7b'
            previous.mkdir()
            release = state / 'releases/new/release'
            release.mkdir(parents=True)
            node = home / 'node'
            node.touch()
            env = home / 'beta.env'
            env.touch()
            unit = home / 'beta.service'
            unit.write_text('old service')
            database = home / 'training.sqlite'
            with sqlite3.connect(database) as connection:
                connection.execute('CREATE TABLE workouts (id TEXT)')
                connection.execute("INSERT INTO workouts VALUES ('keep-me')")
            old_status = {'revision': 'b' * 40, 'run_id': 1}
            (state / 'current.json').write_text(json.dumps(old_status))
            actions = []
            serving = {'caddy': True, 'app': True}

            def command(*args, **kwargs):
                actions.append(args)
                if args[0] == str(node):
                    return subprocess.CompletedProcess(args, 0, stdout=str(database))
                if args[:3] == ('sudo', '-n', 'cat'):
                    kwargs['stdout'].write(unit.read_text())
                    kwargs['stdout'].flush()
                if args[:3] == ('sudo', '-n', 'install'):
                    unit.write_text(Path(args[-2]).read_text())
                if 'systemctl' in args:
                    operation = args[3]
                    target = args[4] if len(args) > 4 else ''
                    if operation == 'show':
                        return subprocess.CompletedProcess(args, 0, stdout=str(previous))
                    if operation in ('start', 'stop'):
                        if target == 'caddy':
                            serving['caddy'] = operation == 'start'
                        else:
                            serving['app'] = operation == 'start'
                        if operation == 'start' and target == receiver.SERVICE and unit.read_text() != 'old service':
                            self.assertFalse(serving['caddy'], 'Traffic must be paused before migration.')
                            with sqlite3.connect(database) as connection:
                                connection.execute('ALTER TABLE workouts ADD time_of_day TEXT')
                return subprocess.CompletedProcess(args, 0, stdout='')

            def ready(port, *_):
                if failure == 'preflight' and port == 4181:
                    raise RuntimeError('preflight failed')
                if failure == 'startup' and port == 4180:
                    raise RuntimeError('startup failed')

            process = Mock()
            process.poll.return_value = 0
            with patch.multiple(receiver, HOME=home, STATE=state, NODE=node, ENV=env, UNIT=unit), \
                    patch.object(receiver, 'run', side_effect=command), \
                    patch.object(receiver, 'wait_ready', side_effect=ready), \
                    patch.object(receiver.subprocess, 'Popen', return_value=process):
                if failure:
                    with self.assertRaises(RuntimeError):
                        receiver.activate(release, REVISION, 2)
                else:
                    self.assertEqual(receiver.activate(release, REVISION, 2)['status'], 'deployed')
            self.assertTrue(serving['caddy'])
            self.assertTrue(serving['app'])
            with sqlite3.connect(database) as connection:
                self.assertEqual(connection.execute('SELECT id FROM workouts').fetchall(), [('keep-me',)])
                self.assertEqual(len(connection.execute('PRAGMA table_info(workouts)').fetchall()), 1 if failure else 2)
            status = json.loads((state / 'current.json').read_text())
            self.assertEqual(status['revision'], old_status['revision'] if failure else REVISION)
            self.assertFalse((state / 'pending.json').exists())
            if failure:
                self.assertEqual(unit.read_text(), 'old service')

    def test_success_preserves_records_and_records_revision(self):
        self.exercise()

    def test_startup_failure_restores_database_service_and_revision(self):
        self.exercise('startup')

    def test_preflight_failure_leaves_live_service_and_database_untouched(self):
        self.exercise('preflight')


if __name__ == '__main__':
    unittest.main()
