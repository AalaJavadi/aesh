#!/usr/bin/env python3
"""Stage public pages and enforce a complete GitHub Pages artifact."""
from pathlib import Path
import shutil
from verify_staged_site import verify
from sync_cloud_share import is_obsolete_cloud_shell

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / '_site'
if TARGET.exists():
    shutil.rmtree(TARGET)
TARGET.mkdir()
SECTIONS = (
    'assets', 'members', 'studio', 'about', 'courses', 'events', 'faq', 'news',
    'portfolio', 'rules', 'students', 'teachers', 'teacher', 'student', 'work',
    'course', 'featured', 'editor', 'directory-profile',
)
TOP = ('index.html', '404.html', 'CNAME', '.nojekyll', 'sitemap.xml',
       'robots.txt', 'favicon.png', 'favicon.ico', 'sw.js')
for name in SECTIONS:
    src = ROOT / name
    if src.is_dir():
        shutil.copytree(src, TARGET / name,
                        ignore=shutil.ignore_patterns('__pycache__', '.DS_Store'))
for name in TOP:
    src = ROOT / name
    if src.is_file():
        shutil.copy2(src, TARGET / name)
# Keep unknown old Cloud SEO shells in the SOURCE as a recovery copy, but
# NEVER ship them to Pages without a successful, published-only RPC snapshot.
# A verified published work is rebuilt as a modern UUID-bound page by sync.
withheld = []
for file in (TARGET / 'work').glob('*/index.html'):
    if is_obsolete_cloud_shell(file.read_text('utf-8')):
        withheld.append(file.relative_to(TARGET).as_posix())
        file.unlink()
        try:
            file.parent.rmdir()
        except OSError:
            pass
if withheld:
    print('AESH SAFETY: withheld', len(withheld),
          'unverified obsolete Cloud SEO shells from Pages artifact (source preserved).')
if not verify(ROOT, TARGET):
    raise SystemExit('AESH BUILD FAILED: required public pages are missing from _site')
print('AESH public pages staged and verified (source tools/SQL excluded).')
