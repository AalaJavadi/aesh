#!/usr/bin/env python3
"""Verify that a subsequent editor ZIP cannot resurrect outdated CI/SQL tools.

Checks embedded source bytes only, NOT browser execution or the ZIP UI.
"""
from pathlib import Path
import base64
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'assets/aesh-package-files.json'
IMMUTABLE = ROOT / 'assets/aesh-editor-immutable.js'
EDITOR = ROOT / 'editor/index.html'
REGEX = (
    re.compile(r'window\.AESH_IMMUTABLE_FILES=(\{.*?\});', re.S),
    re.compile(r'var AESH_EDITOR_EMBEDDED_FILES=(\{.*?\});', re.S),
)


def check():
    names = json.loads(MANIFEST.read_text('utf-8'))
    needed = [p for p in names if p.startswith(('tools/', 'sql/', 'supabase/', '.github/'))
              or ('/' not in p and p.endswith(('.md', '.txt')))]
    actual = [(IMMUTABLE.read_text('utf-8'), REGEX[0]),
              (EDITOR.read_text('utf-8'), REGEX[1])]
    for index, (raw, rx) in enumerate(actual):
        match = rx.search(raw)
        if not match:
            raise AssertionError('Missing editor fallback mapping ' + str(index))
        embedded = json.loads(match.group(1))
        for path in needed:
            expected = (ROOT / path).read_bytes()
            if path not in embedded or base64.b64decode(embedded[path]) != expected:
                raise AssertionError('Missing or stale embedded source: ' + path)
    for critical in ('tools/stage_site.py', 'tools/sync_cloud_share.py',
                     'tools/verify_staged_site.py', 'tools/test_staged_and_archive_offline.py',
                     'sql/aesh5/004_private_work_media.sql',
                     'supabase/functions/aesh-approved-media/index.ts'):
        assert critical in names, 'Missing essential source from editor ZIP manifest: '+critical
    expected = ('.github/workflows/aesh-cloud-previews.yml' if (ROOT / '.aesh-test').exists()
                else '.github/workflows/aesh-production-pages.yml')
    assert expected in names, 'This variant lacks its own workflow in editor export'
    print('PASS | Both editor ZIP fallbacks contain', len(needed),
          'current internal files; variant workflow:', expected)


if __name__ == '__main__':
    try:
        check()
    except (AssertionError, ValueError) as exc:
        print('FAIL | editor package fallback:', exc, file=sys.stderr)
        sys.exit(1)
