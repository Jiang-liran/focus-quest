#!/usr/bin/env python3
"""Keep a verified ZIP backup instead of an indexable spare application bundle."""
import hashlib
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

LSREGISTER = Path('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister')
IDENTIFIERS = {'com.local.focusquest.app', 'com.local.focusquest.calendarprobe'}


def archive_app(application):
    requested = Path(application)
    if requested.is_symlink():
        raise ValueError('Cannot archive an application symlink')
    app = requested.resolve(strict=True)
    canonical = Path.home() / 'Applications'
    if app in {canonical / '专注远征.app', canonical / '专注日历诊断.app'}:
        raise ValueError('Cannot archive the installed application')
    if app.suffix != '.app' or app.is_symlink():
        raise ValueError('Expected a spare .app bundle')
    info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
    if info.get('CFBundleIdentifier') not in IDENTIFIERS:
        raise ValueError('Not a Focus Quest application')
    running = subprocess.check_output(['/bin/ps', '-axo', 'comm='], text=True)
    if any(str(app) + '/Contents/MacOS/' in row for row in running.splitlines()):
        raise ValueError('Cannot archive a running application')
    destination = app.with_name(app.name + '.zip')
    original = {}
    for item in app.rglob('*'):
        if item.is_symlink():
            original[str(item.relative_to(app.parent))] = ('link', os.readlink(item).encode())
        elif item.is_file():
            original[str(item.relative_to(app.parent))] = ('file', hashlib.sha256(item.read_bytes()).digest())
    with tempfile.TemporaryDirectory(prefix='focusquest-archive-') as folder:
        existing = destination.exists()
        temporary = destination if existing else Path(folder) / destination.name
        if not existing:
            subprocess.run(['/usr/bin/ditto', '-c', '-k', '--keepParent', '--norsrc', '--noextattr', str(app), str(temporary)], check=True)
        with zipfile.ZipFile(temporary) as bundle:
            if bundle.testzip() is not None:
                raise ValueError('Invalid ZIP backup')
            archived = {}
            for item in bundle.infolist():
                if item.is_dir():
                    continue
                name = item.filename
                if not item.flag_bits & 0x800:
                    try:
                        name = name.encode('cp437').decode('utf-8')
                    except UnicodeError:
                        pass
                if name in archived:
                    raise ValueError('Duplicate ZIP entry')
                archived[name] = item
            if set(archived) != set(original):
                raise ValueError('ZIP contents differ from the application')
            for name, (kind, expected) in original.items():
                value = bundle.read(archived[name])
                if (value if kind == 'link' else hashlib.sha256(value).digest()) != expected:
                    raise ValueError('ZIP file differs: ' + name)
        if not existing:
            shutil.copyfile(temporary, destination)
        os.chmod(destination, 0o600)
    result = subprocess.run([str(LSREGISTER), '-u', str(app)], capture_output=True)
    if result.returncode:
        # Newly created backups might never have been registered. An absent entry is safe.
        dump = subprocess.check_output([str(LSREGISTER), '-dump'], text=True)
        paths = re.findall(r'^path:\s+(.*?) \(0x[0-9a-f]+\)\s*$', dump, re.M)
        if str(app) in paths:
            raise RuntimeError('Could not unregister the spare application')
    shutil.rmtree(app)
    return {'original': str(app), 'archive': str(destination), 'version': info.get('CFBundleShortVersionString'), 'files_verified': len(original), 'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}


if __name__ == '__main__':
    import json
    for filename in sys.argv[1:]:
        print(json.dumps(archive_app(filename), ensure_ascii=False))
