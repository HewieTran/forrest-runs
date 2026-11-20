#!/usr/bin/env python3
"""Extract the actual release with the same checks used by Lightsail."""
from pathlib import Path
import subprocess
import sys

from receiver import extract_release


if __name__ == '__main__':
    archive = Path(sys.argv[1] if len(sys.argv) > 1 else '.aws-release/release.tar.gz')
    destination = Path(sys.argv[2] if len(sys.argv) > 2 else '.aws-release/verified')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    # A fresh directory prevents a stale extraction from satisfying the tests.
    destination.mkdir(parents=True, exist_ok=False)
    release = extract_release(archive, destination, revision)
    print('Verified portable release archive at ' + str(release.resolve()))
