#!/usr/bin/env python3
"""Stage only public AESH files, refresh SEO metadata and verify the artifact."""
from pathlib import Path
import shutil
from verify_staged_site import verify
from sync_cloud_share import is_obsolete_cloud_shell
import re
from urllib.parse import quote

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
# Never publish obsolete non-UUID Cloud shells even if source ZIP overlays them.
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
# Only staged public HTML <head> is touched; authoring source files remain intact.
# Keep a real share image for each public teacher/student, even where no
# profile avatar exists. No body, canonical, sitemap, or Cloud media is changed.
for kind, default in (('teacher', 'teachers'), ('student', 'students')):
    for page in (TARGET / kind).glob('*/index.html'):
        original = page.read_text('utf-8')
        stop = original.lower().find('</head>')
        if stop < 0:
            continue
        head = original[:stop+7]
        fallback = 'https://aesh.ir/favicon.png'
        if fallback not in head:
            continue
        social = 'assets/social/' + kind + '/' + page.parent.name + '.jpg'
        if not (TARGET / social).is_file():
            social = 'assets/social/' + default + '.jpg'
        if not (TARGET / social).is_file():
            continue
        url = 'https://aesh.ir/' + quote(social, safe='/')
        for pattern in (
            r'<meta\b[^>]*\bproperty=["\']og:image["\'][^>]*>',
            r'<meta\b[^>]*\bname=["\']twitter:image["\'][^>]*>',
        ):
            def replace(match):
                tag = match.group(0)
                if fallback not in tag:
                    return tag
                return tag.replace(fallback, url)
            head = re.sub(pattern, replace, head, count=1, flags=re.I)
        if head != original[:stop+7]:
            page.write_text(head + original[stop+7:], 'utf-8')
if not verify(ROOT, TARGET):
    raise SystemExit('AESH BUILD FAILED: required public pages are missing from _site')
print('AESH public pages staged and verified (source tools/SQL excluded).')
