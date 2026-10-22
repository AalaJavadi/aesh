#!/usr/bin/env python3
"""Generate real OpenGraph HTML pages for published Supabase works on GitHub Pages.

Uses only the publicly available aesh_public_works RPC and public publishable key.
It never handles user passwords or Supabase service_role secrets.
Usage: python tools/sync_cloud_share.py [--fixture path] [--root path]
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import json
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MARKER = '<!-- AESH GENERATED CLOUD SHARE v3.23 - DO NOT EDIT -->'
STATE = '.aesh-generated-share-pages.json'
UUID = r'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
THUMB_RE = re.compile(rf'^{UUID}/{UUID}\.webp$')
WORK_IMAGE_RE = re.compile(rf'^{UUID}/{UUID}\.(?:webp|png|jpg)$')
SLUG_RE = re.compile(r'^[\w\u0600-\u06ff]+(?:-[\w\u0600-\u06ff]+)*$',re.UNICODE)
NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
ET.register_namespace('', NS)

def config(root:Path):
    txt=(root/'assets/aesh-config.js').read_text('utf-8')
    host=re.search(r'\burl\s*:\s*[\'\"](https://[a-z0-9-]+\.supabase\.co)[\'\"]',txt,re.I)
    key=re.search(r'\bpublishableKey\s*:\s*[\'\"]([^\'\"]+)[\'\"]',txt)
    if not host or not key:raise ValueError('Supabase public project config unavailable')
    return host.group(1), key.group(1)

def public_rows(root:Path):
    host, key=config(root)
    headers={'apikey':key,'Content-Type':'application/json','Accept':'application/json'}
    if key.startswith('eyJ'): headers['Authorization']='Bearer '+key
    def fetch_rpc(name):
        request=Request(host+'/rest/v1/rpc/'+name,headers=headers,method='POST',data=b'{}')
        with urlopen(request,timeout=25) as res: return json.loads(res.read(5000000))
    try:
        rows=fetch_rpc('aesh_public_works')
    except (HTTPError,URLError,ValueError) as e:raise RuntimeError(f'Public works RPC failed: {e}') from e
    if not isinstance(rows,list):raise ValueError('Public works RPC did not return a list')
    try:
        profiles=fetch_rpc('aesh_public_profiles')
    except (HTTPError,URLError,ValueError) as e:
        print('Public profile pictures could not be refreshed:',str(e)[:100])
        profiles=[]
    return rows,host,(profiles if isinstance(profiles,list) else [])

def clean_row(row,host):
    if not isinstance(row,dict):return None
    wid=str(row.get('id') or '')
    slug=str(row.get('slug') or '').strip()
    role=row.get('owner_role')
    title=str(row.get('title') or 'نمونه‌کار').strip()[:130]
    if not re.fullmatch(UUID,wid) or not slug or len(slug)>90 or not SLUG_RE.fullmatch(slug):return None
    if role not in ('teacher','student') or row.get('bucket_id') not in ('aesh-owner-works','aesh-member-works'):return None
    thumb=str(row.get('thumb_path') or '')
    original=str(row.get('object_path') or '')
    if not THUMB_RE.fullmatch(thumb) or not WORK_IMAGE_RE.fullmatch(original):return None
    # aesh_public_works exposes PUBLISHED works only. Extra filtering is safe if status is returned.
    if row.get('status') is not None and row['status']!='published':return None
    img=host+'/functions/v1/aesh-approved-media/aesh-work-thumbs/'+quote(thumb,safe='/')
    path='work/'+slug+'/index.html'
    return {'path':path,'id':wid,'raw':row,'title':title,'slug':slug,'image':img,
            'owner':str(row.get('owner_name') or '').strip()[:130],
            'desc':str(row.get('description') or '').strip()[:280]}

def document(row,host):
    """Generate a genuine self-contained artwork page (NEVER document.write/index fetch)."""
    from bs4 import BeautifulSoup
    import build_aesh5 as m
    legacy=row['raw']
    work={'id':'cloud-'+row['id'],'_aesh_cloud':True,'_aesh_key':'cloud:'+row['id'],
      'slug':row['slug'],'title':row['title'],'ownerName':row['owner'],
      'ownerType':legacy.get('owner_role'),'ownerSlug':legacy.get('owner_slug'),
      'desc':legacy.get('description'),'image':host+'/functions/v1/aesh-approved-media/'+legacy['bucket_id']+'/'+quote(legacy['object_path'],safe='/'),
      'thumb':row['image'],'fullWidth':legacy.get('full_width') or legacy.get('width') or 0,
      'fullHeight':legacy.get('full_height') or legacy.get('height') or 0}
    base=BeautifulSoup(m.SOURCE_TEMPLATE.read_text('utf-8'),'html.parser')
    content=m.load_json_from_page(m.ROOT/'tools/aesh5-source.html')
    body=m.work_detail(base,work,content)
    route='/work/'+row['slug']+'/'
    title=row['title']+' | '+row['owner']+' | AESH'
    page=m.base_html(base,body,route,'work',(title,row['desc'],row['image']),content,None,work)
    return page.replace('</body>',MARKER+'</body>')

def sync_public_profile_images(root:Path, profiles, host:str):
    # A fresh avatar is only used for THAT SAME teacher/student's individual SEO page.
    avatar_re=re.compile(rf'^{UUID}/avatar\.webp$')
    applied=0
    for row in profiles:
        if not isinstance(row,dict):continue
        role=row.get('role')
        slug=row.get('owner_slug')
        avatar=str(row.get('avatar_path') or '')
        if role not in ('teacher','student') or not isinstance(slug,str) or len(slug)>90 or not SLUG_RE.fullmatch(slug):continue
        if not avatar_re.fullmatch(avatar):continue
        page=root/role/slug/'index.html'
        if not page.exists():continue
        image=host+'/storage/v1/object/public/aesh-avatars/'+quote(avatar,safe='/')
        if row.get('updated_at'):
            image+='?v='+quote(str(row['updated_at']),safe='')
        content=page.read_text('utf-8')
        from bs4 import BeautifulSoup
        doc=BeautifulSoup(content,'html.parser')
        for prop in ('og:image','twitter:image'):
            attribute='name' if prop.startswith('twitter') else 'property'
            meta=doc.find('meta',attrs={attribute:prop})
            if meta:meta['content']=image
        fresh='<!doctype html>\n'+str(doc.html) if doc.html else content
        if fresh!=content:page.write_text(fresh,'utf-8')
        applied+=1
    print('Updated public profile share images:',applied)

# Old v5 builders wrote Cloud pages straight into the ZIP without this sync
# script's marker or state JSON. Discover them from a strictly validated UUID
# on a WORK detail page, rather than trusting filenames, titles or old state.
CLOUD_BODY = re.compile(
    rf'<body\b[^>]*\bdata-aesh-work-id\s*=\s*[\'\"]cloud:({UUID})[\'\"]',
    re.IGNORECASE | re.DOTALL,
)
STATE_PATH = re.compile(r'^work/[^/]+/index\.html$')


def read_state(root):
    try:
        data = json.loads((root / STATE).read_text('utf-8'))
        if not isinstance(data, dict) or not isinstance(data.get('generated', []), list):
            raise ValueError('Bad generated pages state')
        return {p for p in data['generated'] if isinstance(p, str) and STATE_PATH.fullmatch(p)}
    except FileNotFoundError:
        return set()


def page_cloud_uuid(html):
    match = CLOUD_BODY.search(html)
    return match.group(1).lower() if match else None


def discover_cloud_pages(root):
    """Only genuine Cloud work HTML; static/legacy work pages never qualify."""
    result = {}
    for file in (root / 'work').glob('*/index.html'):
        text = file.read_text('utf-8')
        wid = page_cloud_uuid(text)
        if wid:
            result[file.relative_to(root).as_posix()] = wid
    return result


# Older builders emitted thin SEO shells with a public Supabase work thumbnail,
# a document.write(index.html) loader, and NO trustworthy Cloud work UUID.
# These are not genuine immutable legacy/studio work pages. A past ZIP overlay
# can bring back a revoked shell even when it is absent from sitemap/state.
# Recognize ONLY this exact obsolete shape; do not guess from slugs or titles.
_OBSOLETE_THUMB = re.compile(
    r'https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/aesh-work-thumbs/', re.I
)


def is_obsolete_cloud_shell(html):
    return (not page_cloud_uuid(html)
            and '<div class="seo-load">' in html
            and 'document.write(h)' in html
            and bool(_OBSOLETE_THUMB.search(html)))


def discover_obsolete_cloud_shells(root):
    """Unverified old-format Cloud work shells, NEVER authoritative publication."""
    return {file.relative_to(root).as_posix()
            for file in (root / 'work').glob('*/index.html')
            if is_obsolete_cloud_shell(file.read_text('utf-8'))}


def _normalized_url(url):
    parsed = urlsplit(url)
    return (parsed.netloc.lower(), unquote(parsed.path).rstrip('/') + '/')


def _site_base(root):
    if (root / '.aesh-test').is_file():
        return 'https://aesh-test.github.io'
    cname = root / 'CNAME'
    if cname.is_file() and cname.read_text('utf-8').strip():
        return 'https://' + cname.read_text('utf-8').strip().splitlines()[0]
    return 'https://aesh.ir'


def _site_url(root, path):
    return _site_base(root) + '/' + quote(path.removesuffix('index.html'), safe='/')


def write_sitemap(root, add_urls, previous_urls):
    file = root / 'sitemap.xml'
    if not file.exists():
        return
    tree = ET.parse(file)
    parent = tree.getroot()
    loc_tag = f'{{{NS}}}loc'
    last_tag = f'{{{NS}}}lastmod'
    url_tag = f'{{{NS}}}url'
    removed = {_normalized_url(url) for url in previous_urls}
    added = {_normalized_url(url) for url in add_urls}
    static = []
    current_date = datetime.now(timezone.utc).date().isoformat()
    for node in list(parent):
        loc = node.findtext(loc_tag, '')
        if _normalized_url(loc) not in removed and _normalized_url(loc) not in added:
            static.append(node)
    for node in list(parent):
        parent.remove(node)
    for node in static:
        parent.append(node)
    for url in sorted(add_urls):
        node = ET.SubElement(parent, url_tag)
        ET.SubElement(node, loc_tag).text = url
        ET.SubElement(node, last_tag).text = current_date
    ET.indent(tree, space='  ')
    file.write_bytes(ET.tostring(parent, encoding='utf-8', xml_declaration=True))


def reconcile_archived_cards(root, published_ids):
    """After an authoritative RPC success, drop only UUID-matched Cloud cards.

    Preserves legacy/static cards, teacher layouts, content and all assets.
    During network errors this function is NEVER invoked.
    """
    from bs4 import BeautifulSoup
    files = [root / 'portfolio' / 'index.html']
    files.extend((root / 'teacher').glob('*/index.html'))
    removed = 0
    for file in files:
        if not file.is_file():
            continue
        original = file.read_text('utf-8')
        if 'data-aesh-cloud-id' not in original:
            continue
        soup = BeautifulSoup(original, 'html.parser')
        cut = 0
        for card in soup.select('article.portfolio-card[data-aesh-cloud-id]'):
            wid = str(card.get('data-aesh-cloud-id') or '').strip().lower()
            if re.fullmatch(UUID, wid, re.I) and wid not in published_ids:
                card.decompose()
                cut += 1
        if cut:
            # Re-serialization is restricted to HTML that actually contains a
            # revoked Cloud card; stylesheet, animation and other assets untouched.
            fresh = '<!doctype html>\n' + str(soup.html) if soup.html else str(soup)
            file.write_text(fresh, 'utf-8')
            removed += cut
    return removed


def reconcile_search_index(root, published, existing):
    """Drop revoked Cloud-only search links; preserve every legacy item."""
    file = root / 'assets/aesh-search-index.json'
    if not file.is_file():
        return 0, 0
    entries = json.loads(file.read_text('utf-8'))
    if not isinstance(entries, list):
        raise ValueError('Search index is malformed; do not mutate Cloud site')
    removed = 0
    result = []
    kept_work = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError('Search index contains an invalid item; no safe publication')
        url = str(entry.get('href') or '')
        unquoted = unquote(urlsplit(url).path).lstrip('/')
        relative = unquoted.rstrip('/') + '/index.html'
        if relative in existing and relative not in published:
            removed += 1
            continue
        if relative in published:
            kept_work.add(relative)
        result.append(entry)
    added = 0
    for path, info in published.items():
        if path not in kept_work:
            result.append({'type': 'work', 'title': info['title'],
                           'detail': info['desc'],
                           'href': '/' + quote(path.removesuffix('index.html'), safe='/')})
            added += 1
    if added or removed:
        file.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', 'utf-8')
    return removed, added


def run(root, rows, host):
    """Treat a fully parsed, valid RPC result as the ONLY deletion authority.

    Failure, malformed response or duplicate UUIDs abort BEFORE any writes.
    Files with legacy IDs or no verifiable Cloud UUID are never deleted.
    """
    if not isinstance(rows, list):
        raise ValueError('Public works RPC did not return a list; no files changed')
    docs = {}
    ids = {}
    for index, raw in enumerate(rows):
        entry = clean_row(raw, host)
        if entry is None:
            raise ValueError('Invalid published work at RPC index ' + str(index) + '; no files changed')
        identifier = entry['id'].lower()
        if identifier in ids and ids[identifier] != entry['path']:
            raise ValueError('Published UUID has conflicting slugs; no files changed')
        if entry['path'] in docs and docs[entry['path']]['id'] != identifier:
            raise ValueError('Multiple published works share one URL; no files changed')
        entry['id'] = identifier
        ids[identifier] = entry['path']
        docs[entry['path']] = entry

    # Discover the original 15 Cloud pages not present in STATE as well as
    # regular script-generated Cloud pages. Path+UUID must both be trustworthy.
    before_state = read_state(root)
    existing = discover_cloud_pages(root)
    obsolete_shells = discover_obsolete_cloud_shells(root)
    # Unverified old SEO shells are never treated as immutable legacy works.
    # The public RPC result alone decides whether an obsolete URL is rebuilt;
    # on an RPC/network error run() is never invoked and nothing is touched.
    old_paths = (set(existing) | obsolete_shells
                 | {path for path in before_state if not (root / path).is_file()})
    rendered = {}
    for path, entry in docs.items():
        file = root / path
        if file.exists() and existing.get(path) != entry['id'] and path not in obsolete_shells:
            raise RuntimeError('Refusing to overwrite a different or static work page: ' + path)
        rendered[path] = document(entry, host)
    # All documents are validated/rendered before write or removal.
    for path, html in rendered.items():
        file = root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        if not file.exists() or file.read_text('utf-8') != html:
            file.write_text(html, 'utf-8')

    removed = []
    for stale in sorted(set(existing) - set(docs)):
        file = root / stale
        # Re-read immediately before deletion: never rely on state or filename.
        if file.is_file() and page_cloud_uuid(file.read_text('utf-8')) == existing[stale]:
            file.unlink()
            removed.append(stale)
            try:
                file.parent.rmdir()
            except OSError:
                pass

    card_count = reconcile_archived_cards(root, set(ids))
    removed_index, added_index = reconcile_search_index(root, docs, existing)
    (root / STATE).write_text(
        json.dumps({'generated': sorted(docs)}, ensure_ascii=False, indent=2) + '\n', 'utf-8'
    )
    old_urls = {_site_url(root, path) for path in old_paths}
    new_urls = {_site_url(root, path) for path in docs}
    # A published old-format wrapper may be absent from sitemap even when the
    # before/after URL sets are equal. Reconcile its verified route explicitly.
    if old_urls != new_urls or obsolete_shells:
        write_sitemap(root, new_urls, old_urls)
    print('Cloud work previews synced:', len(docs), 'published works; removed',
          len(removed), 'stale Cloud HTML; removed', card_count, 'stale cards;',
          removed_index, 'stale search items;', added_index, 'new search items')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--fixture',help='Read mock public RPC response from local JSON file, for testing')
    parser.add_argument('--root',type=Path,default=ROOT)
    args=parser.parse_args()
    if args.fixture:
        rows=json.loads(Path(args.fixture).read_text('utf-8'));host='https://example.supabase.co';profiles=[]
    else:rows,host,profiles=public_rows(args.root)
    run(args.root,rows,host)
    sync_public_profile_images(args.root,profiles,host)
