#!/usr/bin/env python3
"""Local, read-only guard for the opt-in Production Pages generator.

This script NEVER deploys, changes storage, or connects to Supabase.
"""
from pathlib import Path
import argparse
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = 'aesh-production-pages.yml'


def check(root, repo=None):
    problems = []
    if not (root / 'CNAME').is_file() or (root / 'CNAME').read_text('utf-8').strip() != 'aesh.ir':
        problems.append('CNAME must be exactly aesh.ir')
    if (root / '.aesh-test').exists():
        problems.append('A TEST bundle must never be used for Production')
    if not (root / 'tools/sync_cloud_share.py').is_file():
        problems.append('Missing work-page generator')
    if not (root / 'tools/sync_directory_profiles.py').is_file():
        problems.append('Missing directory generator')
    if not (root / 'tools/verify_staged_site.py').is_file():
        problems.append('Missing artifact fail-closed gate')
    if repo is not None:
        jobs = []
        for file in (repo / '.github/workflows').glob('*.y*ml'):
            yml = file.read_text('utf-8')
            if 'actions/deploy-pages@' in yml or 'peaceiris/actions-gh-pages@' in yml:
                jobs.append(file.name)
        if jobs != [EXPECTED]:
            problems.append('Expected one Production Pages publisher: '+repr(sorted(jobs)))
    for issue in problems:
        print('FAIL | '+issue, file=sys.stderr)
    if problems:
        return False
    print('PASS | Production pipeline is packaged and locally isolated (NOT deployed)')
    return True

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', type=Path)
    args = ap.parse_args()
    sys.exit(0 if check(ROOT, args.repo) else 1)
