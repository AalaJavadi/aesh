#!/usr/bin/env python3
"""Refresh two offline ZIP export maps from reviewed repository sources.

This keeps editor exports from silently dropping the Cloudflare, backup, and
public static generators added after the original AESH 5.0 release.
"""
from pathlib import Path
import base64
import json
import re

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'assets/aesh-package-files.json'
PREFIXES = ('tools/', 'sql/', 'supabase/', '.github/', 'infra/', 'backup/', 'content/', 'qa/')
EXACT = ('.gitignore', '.nojekyll', 'CNAME', 'sw.js', 'blog/index.html')
MAPS = (
    ('assets/aesh-editor-immutable.js', r'window\.AESH_IMMUTABLE_FILES=(\{.*?\});'),
    ('editor/index.html', r'var AESH_EDITOR_EMBEDDED_FILES=(\{.*?\});'),
)


def package_source(name):
    return name.startswith(PREFIXES) or name in EXACT or ('/' not in name and name.endswith(('.md', '.txt')))


def sync():
    files = json.loads(MANIFEST.read_text('utf-8'))
    assert isinstance(files, list) and len(files)>200
    needed = [name for name in files if package_source(name)]
    assert len(needed)==len(set(needed))
    content = {}
    for name in needed:
        assert not name.startswith('/') and '..' not in Path(name).parts, name
        source = ROOT / name
        if not source.is_file():
            raise RuntimeError('Missing manifest source file: '+name)
        content[name] = base64.b64encode(source.read_bytes()).decode('ascii')
    for relative,pattern in MAPS:
        target = ROOT / relative
        original = target.read_text('utf-8')
        match = re.search(pattern,original,re.S)
        if not match:
            raise RuntimeError('Editor source map not found in '+relative)
        previous = json.loads(match.group(1))
        changed = sorted(n for n in content if content[n] != previous.get(n))
        # Stale historical fallbacks are removed: no retired test or SQL files.
        new = json.dumps(content,ensure_ascii=False,separators=(',',':'))
        target.write_text(original[:match.start(1)]+new+original[match.end(1):],'utf-8')
        print('PASS',relative,'updated',len(changed),'embedded',len(needed),'sources')


if __name__=='__main__':sync()
