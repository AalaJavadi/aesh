#!/usr/bin/env python3
"""Fail-closed GitHub Pages artifact checks after stage_site.py.

Only local file checks; do not claim a deployed GitHub Pages or browser test.
Verify that every source HTML route expected to be public actually exists in _site.
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
import sys
from urllib.parse import urlsplit, unquote
import xml.etree.ElementTree as ET
from sync_cloud_share import is_obsolete_cloud_shell

REQUIRED_HTML = (
    'index.html', '404.html',
    'editor/index.html', 'directory-profile/index.html',
    'members/index.html', 'studio/index.html',
    'teachers/index.html', 'students/index.html',
    'portfolio/index.html', 'about/index.html',
    'courses/index.html', 'events/index.html',
    'news/index.html', 'faq/index.html', 'rules/index.html',
)
REQUIRED_ASSETS = (
    'assets/aesh-config.js', 'assets/aesh-core.js',
    'assets/aesh-directory-profile.js', 'assets/aesh-editor-bridge.js',
    'assets/aesh-editor-export.js', 'assets/aesh-editor-immutable.js',
    'assets/aesh-static.js', 'assets/aesh-image.js',
    'assets/aesh-site.css', 'assets/aesh-cloud-gallery.js',
)
ROUTED_DIRS = ('teacher', 'student', 'work', 'course', 'featured')
REQUIRED_TOP = ('sitemap.xml', 'robots.txt', 'sw.js', '.nojekyll', 'favicon.png')
EXCLUDED = ('sql', 'supabase', 'tools', '.github')
# Public HTML must never include the editor-only preview-return control.
PUBLIC_PREVIEW_RETURN = re.compile(r'<[a-z][^>]*\bid\s*=\s*[\"\']editorPreviewReturn[\"\']', re.I | re.S)


def verify(source: Path, stage: Path, verbose: bool = True) -> bool:
    missing = []
    source = source.resolve()
    stage = stage.resolve()
    if not source.is_dir() or not stage.is_dir():
        print('FAIL | source or staged artifact directory missing', file=sys.stderr)
        return False
    for path in (*REQUIRED_HTML, *REQUIRED_ASSETS, *REQUIRED_TOP):
        if not (source / path).is_file():
            missing.append('source missing required file: ' + path)
        if not (stage / path).is_file():
            missing.append('artifact missing required file: ' + path)
    if (source / 'CNAME').exists() != (stage / 'CNAME').exists():
        missing.append('CNAME presence differs between source and artifact')
    if (source / '.aesh-test').is_file() and (stage / 'CNAME').exists():
        missing.append('TEST artifact illegally contains CNAME')
    for name in ROUTED_DIRS:
        source_tree = source / name
        source_pages = sorted(p.relative_to(source) for p in source_tree.rglob('*.html')) if source_tree.is_dir() else []
        if not source_pages:
            missing.append('source missing essential routed page family: ' + name)
        for path in source_pages:
            if name == 'work' and is_obsolete_cloud_shell((source / path).read_text('utf-8')):
                # This old-style Supabase wrapper cannot prove publication or UUID.
                # It is retained in source but MUST NOT appear in public output.
                if (stage / path).exists():
                    missing.append('unverified obsolete Cloud shell leaked into artifact: ' + path.as_posix())
                continue
            if not (stage / path).is_file():
                missing.append('artifact missing source HTML route: ' + path.as_posix())
    # Compare sitemap URLs with both source and staged HTML, including
    # percent-encoded Persian routes and encoded legacy #U aliases.
    sitemap = source / 'sitemap.xml'
    if sitemap.is_file():
        try:
            for node in ET.parse(sitemap).iter():
                if node.tag.endswith('loc') and node.text:
                    url_path = unquote(urlsplit(node.text).path).lstrip('/')
                    relative = (Path(url_path) if url_path.endswith('.html')
                                else (Path(url_path) / 'index.html' if url_path else Path('index.html')))
                    if not (source / relative).is_file():
                        missing.append('sitemap points at missing source route: ' + relative.as_posix())
                    if not (stage / relative).is_file():
                        missing.append('sitemap points at missing artifact route: ' + relative.as_posix())
        except ET.ParseError as exc:
            missing.append('invalid sitemap.xml: ' + str(exc))
    # A raw ZIP contains legacy Cloud HTML that must be reconciled against
    # an authoritative successful RPC before ANY public Pages artifact is built.
    # Never ship untracked snapshot pages, even if a caller skips the sync step.
    state_file = source / '.aesh-generated-share-pages.json'
    work_cloud = set()
    cloud_id_re = re.compile(r'data-aesh-work-id=[\"\']cloud:[0-9a-fA-F]{8}-[0-9a-fA-F-]{27,}[\"\']')
    for source_page in (source / 'work').glob('*/index.html'):
        markup = source_page.read_text('utf-8')
        if cloud_id_re.search(markup):
            work_cloud.add(source_page.relative_to(source).as_posix())
            if 'aesh-test.invalid' in markup:
                missing.append('archived Cloud work still uses invalid TEST image host: '
                               + source_page.relative_to(source).as_posix())
    if not state_file.is_file():
        missing.append('successful Cloud RPC synchronization state missing; never stage raw archive')
    else:
        try:
            state = json.loads(state_file.read_text('utf-8'))
            generated = state.get('generated') if isinstance(state, dict) else None
            if not isinstance(generated, list) or not all(isinstance(x, str) for x in generated):
                raise ValueError('Invalid Cloud sync state')
            if set(generated) != work_cloud:
                missing.append('Cloud work pages differ from authoritative successful RPC state')
        except (ValueError, TypeError) as exc:
            missing.append('Invalid Cloud state JSON: ' + str(exc))
    for name in EXCLUDED:
        if (stage / name).exists():
            missing.append('artifact contains a non-public source directory: ' + name)
    # Source editor and members can contain multiple files; preserve all of them.
    for name in ('editor', 'directory-profile', 'members', 'studio'):
        for file in (source / name).rglob('*'):
            if file.is_file() and not (stage / file.relative_to(source)).is_file():
                missing.append('artifact missing auxiliary page file: ' + file.relative_to(source).as_posix())
    # Protect next builds as well as archived and newly synced page sources.
    # editor/ and studio/ are intentionally excluded: both are editing environments.
    for label, tree in (('source', source), ('artifact', stage)):
        for page in tree.rglob('*.html'):
            relative = page.relative_to(tree)
            if relative.parts[0] in ('editor', 'studio', 'tools', '_site'):
                continue
            if PUBLIC_PREVIEW_RETURN.search(page.read_text('utf-8')):
                missing.append(f'{label} public HTML contains editor-only preview control: {relative.as_posix()}')
    if missing:
        for problem in missing:
            print('FAIL | ' + problem, file=sys.stderr)
        print('FAIL | Staged artifact refused: ' + str(len(missing)) + ' missing/invalid paths', file=sys.stderr)
        return False
    if verbose:
        html_count = sum(1 for _ in stage.rglob('*.html'))
        print('PASS | Mandatory GitHub Pages artifact paths checked; HTML:', html_count)
        print('PASS | Editor, directory fallback, member panel, assets and generated routes staged')
    return True


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[1])
    ap.add_argument('--staged', type=Path)
    args = ap.parse_args()
    source = args.source.resolve()
    staged = args.staged.resolve() if args.staged else source / '_site'
    sys.exit(0 if verify(source, staged) else 1)
