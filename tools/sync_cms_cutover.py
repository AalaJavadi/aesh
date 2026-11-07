#!/usr/bin/env python3
"""Cloudflare-only Pages build AFTER validated Supabase restoration and owner signoff.

Only canonical, previously UUID-tagged legacy Cloud work pages may be replaced.
No user/database data is deleted. Any missing/mismatched migration record fails
BEFORE workspace mutation and GitHub deploy; older Pages release stays online.
The safe default production workflow continues to use Supabase.
"""
from __future__ import annotations
import argparse, json, os, sys
from pathlib import Path
from urllib.parse import quote
from bs4 import BeautifulSoup
import build_blog as blog
import sync_cms_public as cms
import sync_cloud_share as legacy

ROOT=Path(__file__).resolve().parents[1]
INVENTORY=ROOT/'content/legacy_cloud_source_inventory.json'
SIGNOFF='I_VERIFIED_SUPABASE_BACKUP_RESTORE_AND_ALL_LEGACY_RECORDS'


def approved(data,root):
    """Non-mutating strict preflight. Never infer publication from local archive."""
    if os.environ.get('AESH_CLOUD_CUTOVER_APPROVAL','')!=SIGNOFF:
        raise ValueError('CLOUD-ONLY CUTOVER BLOCKED: restore-tested backup and owner signoff missing')
    expected=json.loads((root/'content/legacy_cloud_source_inventory.json').read_text('utf8'))
    if expected.get('version')!=1 or not isinstance(expected.get('pages'),list):
        raise ValueError('Invalid reviewed legacy Cloud source inventory')
    inventory={r['path']:r['id'].lower() for r in expected['pages'] if isinstance(r,dict) and isinstance(r.get('path'),str) and isinstance(r.get('id'),str)}
    if len(inventory)!=len(expected['pages']) or len(set(inventory.values()))!=len(inventory):
        raise ValueError('Reviewed legacy source inventory contains duplicate UUIDs/paths')
    found=legacy.discover_cloud_pages(root)
    if found!=inventory:
        raise ValueError(f'Legacy source inventory changed: reviewed={len(inventory)} current={len(found)}; refusing blind migration')
    old_by_id={v:k for k,v in inventory.items()}
    mappings=data.get('migrated_legacy_works')
    if not isinstance(mappings,list):raise ValueError('D1 migration mappings absent; old Supabase pages stay safe')
    d1={}
    for row in mappings:
        if not isinstance(row,dict) or not legacy.re.fullmatch(legacy.UUID,str(row.get('legacy_id','')),legacy.re.I):
            raise ValueError('Malformed legacy UUID in D1 migration records')
        wid=row['legacy_id'].lower()
        if wid in d1:raise ValueError('Duplicate legacy mapping in D1')
        status=row.get('status');slug=row.get('slug')
        if status not in ('published','archived','rejected','pending'):
            raise ValueError('Invalid legacy migration status')
        cms.validate_route(slug)
        d1[wid]=row
    if not set(old_by_id).issubset(d1):
        missing=set(old_by_id)-set(d1)
        raise ValueError('Not all published archive UUIDs migrated; missing '+str(len(missing)))
    published={}
    for w in data.get('works',[]):
        if not isinstance(w,dict):raise ValueError('Invalid D1 work row')
        cms.validate_route(w.get('slug'))
        lid=w.get('legacy_id')
        if lid:
            if not legacy.re.fullmatch(legacy.UUID,str(lid),legacy.re.I):raise ValueError('Malformed published legacy UUID')
            lid=lid.lower()
            if lid in published:raise ValueError('Duplicate published legacy ID')
            if lid not in d1:raise ValueError('Published work lacks D1 migration registry')
            published[lid]=w
    for wid,path in old_by_id.items():
        entry=d1[wid];state=entry['status'];path_slug=Path(path).parent.name
        if entry['slug']!=path_slug:raise ValueError('Legacy work URL changed; redirect verification required')
        # Pending content should never silently replace a previously published route.
        if state=='pending':raise ValueError('Previously public work became unreviewed pending work')
        if state=='published':
            w=published.get(wid)
            if not w or w['slug']!=entry['slug']:raise ValueError('Published legacy D1 work missing from approved snapshot')
            if not any(p.get('role')==w.get('owner_role') and p.get('slug')==w.get('owner_slug') for p in data.get('profiles',[])):
                raise ValueError('Published legacy work has no public D1 owner profile')
        elif wid in published:raise ValueError('Nonpublished legacy work leaked into public snapshot')
    for lid,w in published.items():
        if lid in old_by_id and d1[lid]['slug']!=w['slug']:raise ValueError('Legacy work canonical changed')
    # Obsolete unverified shells are retained in source but forbidden in release.
    for path in legacy.discover_obsolete_cloud_shells(root):
        if any(w['slug']==Path(path).parent.name for w in data.get('works',[])):
            raise ValueError('Unverified obsolete shell collides with a D1 work; manual review required')
    return inventory,d1,published


def run(data,host,root=ROOT):
    inventory,records,published=approved(data,root)
    old_shells=legacy.discover_obsolete_cloud_shells(root)
    old_rel=set(inventory)|old_shells
    # No write until every D1 mapping and canonical is proven complete.
    for path,wid in inventory.items():
        f=root/path
        if legacy.page_cloud_uuid(f.read_text('utf8'))!=wid:raise ValueError('Legacy file changed after preflight')
        f.unlink()
    for path in inventory:
        folder=(root/path).parent
        if not any(folder.iterdir()):folder.rmdir()
    # Remove only migrated UUID cards (never genuine/other static works).
    from bs4 import BeautifulSoup
    old_ids=set(inventory.values())
    for file in [root/'portfolio/index.html',*(root/'teacher').glob('*/index.html')]:
        if not file.is_file():continue
        raw=file.read_text('utf8')
        if 'data-aesh-cloud-id' not in raw:continue
        soup=BeautifulSoup(raw,'html.parser');changed=False
        for node in soup.select('article.portfolio-card[data-aesh-cloud-id]'):
            if (node.get('data-aesh-cloud-id') or '').lower() in old_ids:
                node.decompose();changed=True
        if changed:file.write_text('<!doctype html>\n'+str(soup.html) if soup.html else str(soup),'utf8')
    cms.ROOT=root;cms.STATE=root/'content/cf_public_state.json';cms.OUT=root/'.aesh-cms-snapshot.json'
    blog.ROOT=root;blog.CONTENT=root/'content/blog';blog.SITEMAP=root/'sitemap.xml'
    html_count,article_count,images=cms.run(data,host)
    # These old share URLs have been replaced by CMS pages or safely archived.
    # Only after an approved migration may the strict existing stage guard accept
    # an empty legacy-RPC state. The guard is NOT changed or bypassed.
    (root/legacy.STATE).write_text(json.dumps({'generated':[],'source':'verified-cloudflare-cutover'},indent=2)+'\n','utf8')
    published_paths={ 'work/'+w['slug']+'/index.html':
                     {'title':w['title'],'desc':w.get('description') or ''} for w in data['works']
                     if (root/'work'/w['slug']/'index.html').exists()}
    legacy.reconcile_search_index(root,published_paths,{p:True for p in old_rel})
    old_urls={legacy._site_url(root,p) for p in old_rel}
    new_urls={legacy._site_url(root,p) for p in published_paths}
    legacy.write_sitemap(root,new_urls,old_urls)
    print('PASS Cloud-only cutover preview:',len(inventory),'legacy Cloud IDs reconciled;',html_count,'CMS pages;',article_count,'articles;',images,'local images')
    return html_count,article_count,images

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--fixture',help='Offline JSON fixture; never downloads external data')
    args=parser.parse_args()
    try:
        if args.fixture:data=json.loads(Path(args.fixture).read_text('utf8'));host='test.example.org'
        else:
            url=os.environ.get('AESH_CMS_SNAPSHOT_URL','').strip()
            token=os.environ.get('AESH_CMS_PUBLISH_TOKEN','').strip()
            if not url or len(token)<32:raise ValueError('Verified Cloudflare CMS snapshot URL/token required')
            data,host=cms.verified_snapshot(url,token)
        run(data,host,ROOT)
    except Exception as e:
        print('FAIL CLOUD-ONLY CUTOVER:',e,file=sys.stderr);sys.exit(2)
