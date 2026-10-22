#!/usr/bin/env python3
"""Reproduce both independent-review failures entirely offline.

DOES NOT connect to Supabase, Storage, GitHub Actions, or a browser.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from urllib.error import URLError
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
OWNER_ID = 'd1111111-1111-4111-8111-111111111111'
NEW_ID = 'd2222222-2222-4222-8222-222222222222'


def call(root, *params, want_success=True):
    result = subprocess.run([sys.executable, *params], cwd=root, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    if want_success and result.returncode != 0:
        raise AssertionError('Expected successful command ' + str(params) + ':\n' + result.stdout[-2000:])
    if not want_success and result.returncode == 0:
        raise AssertionError('Command should fail closed: ' + str(params))
    return result.stdout.strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sitemap_routes(root):
    from urllib.parse import unquote, urlsplit
    return {unquote(urlsplit(node.text).path).rstrip('/')
            for node in ET.parse(root / 'sitemap.xml').iter()
            if node.tag.endswith('loc') and node.text}


def verify_missing(root, file):
    backup = file.read_bytes()
    file.unlink()
    call(root, 'tools/verify_staged_site.py', want_success=False)
    file.write_bytes(backup)


def main():
    with tempfile.TemporaryDirectory(prefix='aesh-reviewed-offline-') as folder:
        site = Path(folder) / 'site'
        shutil.copytree(ROOT, site, ignore=shutil.ignore_patterns('_site', '__pycache__', '.DS_Store'))
        sys.path.insert(0, str(site / 'tools'))
        import sync_cloud_share as cloud
        archived = cloud.discover_cloud_pages(site)
        obsolete = cloud.discover_obsolete_cloud_shells(site)
        assert len(archived) >= 15, 'Fixture must include a substantial published Cloud snapshot'
        assert not (site / cloud.STATE).exists(), 'Reproduction requires absent state file'
        static = {f.relative_to(site).as_posix(): digest(f)
                  for f in (site / 'work').glob('*/index.html')
                  if f.relative_to(site).as_posix() not in set(archived) | obsolete}
        # Legacy/static works are immutable; more can be added in later releases.
        assert len(static) >= 60, 'Missing baseline legacy work pages'
        baseline_urls = sitemap_routes(site)
        # A cached ZIP/checkout may have valid Cloud pages that are not yet in
        # sitemap, or extra non-Cloud routes added since the original 74 URLs.
        # Requiring an exact total (74 + archived) falsely blocks those builds.
        # Preserve every existing non-Cloud route and reconcile only the Cloud
        # pages discovered by a trustworthy UUID in their HTML.
        cloud_urls = {'/' + path.removesuffix('/index.html') for path in archived}
        indexed_cloud_urls = baseline_urls & cloud_urls
        obsolete_urls = {'/' + p.removesuffix('/index.html') for p in obsolete}
        indexed_obsolete_urls = baseline_urls & obsolete_urls
        stable_urls = baseline_urls - indexed_cloud_urls - indexed_obsolete_urls
        legacy_urls = {'/' + re.sub(r'#U([a-fA-F0-9]{4,6})',
                                    lambda m: chr(int(m.group(1), 16)),
                                    path.removesuffix('/index.html')) for path in static}
        assert '' in stable_urls, 'Homepage missing from sitemap'
        assert legacy_urls <= stable_urls, 'Some legacy/static works are missing from sitemap'
        assert len(stable_urls) >= len(static), 'Non-Cloud sitemap baseline is incomplete'
        print(f'PASS | sitemap baseline: {len(stable_urls)} non-Cloud URLs, '
              f'{len(indexed_cloud_urls)} indexed Cloud pages, '
              f'{len(archived)} verified Cloud HTML pages')
        baseline_cloud_bytes = {p: digest(site / p) for p in archived}
        gallery_before = digest(site / 'portfolio/index.html')
        raw_stage_error = call(site, 'tools/stage_site.py', want_success=False)
        assert 'successful Cloud RPC synchronization state missing' in raw_stage_error
        print('PASS | raw archive cannot bypass successful Cloud RPC before Pages staging')

        # Server/RPC failure and corrupt RPC payload never authorize deletion.
        with patch.object(cloud, 'config', return_value=('https://example.supabase.co', 'test-key')):
            with patch.object(cloud, 'urlopen', side_effect=URLError('offline')):
                try:
                    cloud.public_rows(site)
                except RuntimeError:
                    pass
                else:
                    raise AssertionError('RPC network failure was not propagated')
        broken = Path(folder) / 'broken.json'
        broken.write_text('[{"id":"not-a-uuid"}]', 'utf-8')
        call(site, 'tools/sync_cloud_share.py', '--fixture', str(broken), want_success=False)
        assert {p: digest(site / p) for p in archived} == baseline_cloud_bytes
        assert all((site / p).is_file() for p in obsolete), 'Unknown shell deleted before authoritative RPC success'
        assert digest(site / 'portfolio/index.html') == gallery_before
        assert sitemap_routes(site) == baseline_urls
        print('PASS | network failure or malformed RPC cannot delete archived pages')

        # A successful result retaining one archived UUID must keep that page.
        retained_path, retained_id = next(iter(sorted(archived.items())))
        retained_slug = Path(retained_path).parts[1]
        published = [{
            'id': retained_id, 'slug': retained_slug, 'owner_role': 'teacher',
            'owner_slug': 'test-owner', 'owner_name': 'Verified fixture owner',
            'title': 'Published fixture work', 'description': 'Local fixture only',
            'bucket_id': 'aesh-member-works',
            'object_path': OWNER_ID + '/' + retained_id + '.webp',
            'thumb_path': OWNER_ID + '/' + retained_id + '.webp',
            'status': 'published',
        }]
        fixture = Path(folder) / 'published.json'
        fixture.write_text(json.dumps(published, ensure_ascii=False), 'utf-8')
        print(call(site, 'tools/sync_cloud_share.py', '--fixture', str(fixture)))
        assert cloud.discover_cloud_pages(site) == {retained_path: retained_id}
        assert cloud.MARKER in (site / retained_path).read_text('utf-8')
        assert sitemap_routes(site) == stable_urls | {'/' + retained_path.removesuffix('/index.html')}, 'Published Cloud route or non-Cloud sitemap entry lost'
        assert all(digest(site / p) == h for p, h in static.items())
        assert all((site / p).is_file() for p in obsolete), 'Unknown old shell lost from source'
        print(f'PASS | {len(archived)-1} stale Cloud pages removed; published UUID retained')
        print(f'PASS | {len(static)} legacy work pages byte-for-byte preserved')

        # Malicious published slug collision cannot overwrite a legacy work.
        legacy_path = next(iter(sorted(static)))
        legacy_slug = Path(legacy_path).parts[1]
        collision = dict(published[0], id=NEW_ID, slug=legacy_slug,
                         object_path=OWNER_ID + '/' + NEW_ID + '.webp',
                         thumb_path=OWNER_ID + '/' + NEW_ID + '.webp')
        fixture.write_text(json.dumps([collision], ensure_ascii=False), 'utf-8')
        before_collision = digest(site / legacy_path)
        call(site, 'tools/sync_cloud_share.py', '--fixture', str(fixture), want_success=False)
        assert digest(site / legacy_path) == before_collision
        assert (site / retained_path).is_file()
        print('PASS | a new Cloud UUID cannot overwrite a legacy/static slug')

        # Live-fetched new work page is staged as real HTML, not only rendered in JS.
        slug = 'fresh-reviewed-fixture-work'
        new_work = dict(published[0], id=NEW_ID, slug=slug,
                        object_path=OWNER_ID + '/' + NEW_ID + '.webp',
                        thumb_path=OWNER_ID + '/' + NEW_ID + '.webp')
        fixture.write_text(json.dumps([published[0], new_work], ensure_ascii=False), 'utf-8')
        print(call(site, 'tools/sync_cloud_share.py', '--fixture', str(fixture)))
        new_page = 'work/' + slug + '/index.html'
        assert (site / new_page).is_file()
        expected_published = stable_urls | {'/' + retained_path.removesuffix('/index.html'),
                                            '/' + new_page.removesuffix('/index.html')}
        assert sitemap_routes(site) == expected_published, 'New published URL or a stable URL missing from sitemap'
        print(call(site, 'tools/stage_site.py'))
        for stale in obsolete:
            assert not (site / '_site' / stale).exists(), 'Unverified old Supabase shell shipped to Pages'
            assert (site / stale).is_file(), 'Unverified old Supabase shell deleted from source'
        print(f'PASS | {len(obsolete)} obsolete Cloud shells withheld from Pages, preserved in source')
        for needed in ('editor/index.html', 'directory-profile/index.html',
                       'members/index.html', 'studio/index.html', new_page):
            assert (site / '_site' / needed).is_file(), 'Missing staged route ' + needed
        print('PASS | staged editor, fallback profile, members and freshly generated work')

        # Deleting a required staged output MUST make validation fail, not warn.
        for relative in ('editor/index.html', 'directory-profile/index.html',
                         'members/index.html', 'assets/aesh-editor-export.js', new_page):
            verify_missing(site, site / '_site' / relative)
        print('PASS | required-stage gate rejects missing routes/assets with nonzero exit')
        source_editor = site / 'editor/index.html'
        original_editor = source_editor.read_bytes()
        source_editor.unlink()
        call(site, 'tools/stage_site.py', want_success=False)
        source_editor.write_bytes(original_editor)
        print(call(site, 'tools/stage_site.py'))
        print('PASS | build itself fails when source editor route is missing')

        # Successful EMPTY published snapshot removes all remaining Cloud pages
        # and their percent-encoded sitemap entries, but never static works.
        fixture.write_text('[]', 'utf-8')
        print(call(site, 'tools/sync_cloud_share.py', '--fixture', str(fixture)))
        assert not cloud.discover_cloud_pages(site)
        assert not (site / retained_path).exists()
        assert not (site / new_page).exists()
        assert sitemap_routes(site) == stable_urls, 'Cloud revocations must preserve EXACTLY all non-Cloud URLs'
        assert all(digest(site / p) == h for p, h in static.items())
        gallery = (site / 'portfolio/index.html').read_text('utf-8')
        assert not re.search(r'data-aesh-cloud-id="[0-9a-f]{8}-', gallery), 'Stale Cloud portfolio cards remain'
        assert (site / cloud.STATE).is_file()
        assert json.loads((site / cloud.STATE).read_text('utf-8'))['generated'] == []
        print(f'PASS | empty successful snapshot removes all {len(archived)} Cloud pages')
        print(f'PASS | {len(indexed_cloud_urls)} indexed Cloud URLs removed; all {len(stable_urls)} non-Cloud URLs preserved')
        print('PASS | archived Cloud cards removed after authoritative success')
        after_empty = sitemap_routes(site)
        assert call(site, 'tools/sync_cloud_share.py', '--fixture', str(fixture))
        assert sitemap_routes(site) == after_empty
        print('PASS | empty published result is idempotent')
        print(call(site, 'tools/stage_site.py'))
        assert sum(1 for _ in (site / 'work').glob('*/index.html')) == len(static) + len(obsolete)
        assert sum(1 for _ in (site / '_site/work').glob('*/index.html')) == len(static)
        print(f'PASS | only {len(static)} verified legacy work pages go to GitHub Pages after zero published Cloud rows')
        if obsolete:
            # If a previously unknown old-style slug IS approved by the latest
            # public RPC, it must be replaced by a proper UUID-bound Cloud page.
            orphan = sorted(obsolete)[0]
            reviewed = dict(published[0], id=NEW_ID, slug=Path(orphan).parts[1],
                            object_path=OWNER_ID + '/' + NEW_ID + '.webp',
                            thumb_path=OWNER_ID + '/' + NEW_ID + '.webp')
            fixture.write_text(json.dumps([reviewed], ensure_ascii=False), 'utf-8')
            print(call(site, 'tools/sync_cloud_share.py', '--fixture', str(fixture)))
            assert cloud.discover_cloud_pages(site).get(orphan) == NEW_ID
            assert not cloud.is_obsolete_cloud_shell((site / orphan).read_text('utf-8'))
            assert '/' + orphan.removesuffix('/index.html') in sitemap_routes(site),                 'A newly approved old-format Cloud URL was not inserted in sitemap'
            print(call(site, 'tools/stage_site.py'))
            assert (site / '_site' / orphan).is_file(), 'Newly approved old-style slug not restored'
            assert all(digest(site / p) == h for p, h in static.items())
            print('PASS | publicly approved old SEO shell upgraded safely to a verified Cloud page')
    print('PASS | ALL supplemental offline regressions (NOT a real Supabase/GitHub test)')


if __name__ == '__main__':
    main()
