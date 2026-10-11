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
from urllib.parse import quote
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
    img=host+'/storage/v1/object/public/aesh-work-thumbs/'+quote(thumb,safe='/')
    path='work/'+slug+'/index.html'
    return {'path':path,'title':title,'slug':slug,'image':img,
            'owner':str(row.get('owner_name') or '').strip()[:130],
            'desc':str(row.get('description') or '').strip()[:280]}

def document(row):
    url='https://aesh.ir/work/'+quote(row['slug'],safe='')+'/'
    title=(row['title']+' | '+row['owner']+' | AESH') if row['owner'] else row['title']+' | AESH'
    desc=(row['owner']+' — '+row['desc']).strip(' —') or 'نمونه‌کار منتشرشده انجمن ادیتوران شایسته'
    e=lambda txt:escape(str(txt),quote=True)
    return f'''<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="{e(url)}"><meta property="og:locale" content="fa_IR"><meta property="og:site_name" content="انجمن ادیتوران شایسته">
<meta property="og:type" content="article"><meta property="og:url" content="{e(url)}"><meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}"><meta property="og:image" content="{e(row['image'])}">
<meta property="og:image:alt" content="{e('تصویر نمونه‌کار '+row['title'])}"><meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}"><meta name="twitter:description" content="{e(desc)}"><meta name="twitter:image" content="{e(row['image'])}">
<style>body{{background:#fbfaf6;color:#0f172a;font-family:Tahoma,system-ui,sans-serif;direction:rtl}}article{{max-width:850px;margin:45px auto;padding:20px;background:#fff;border:1px solid #e8e5db;border-radius:18px;text-align:center}}img{{max-width:100%;max-height:65vh;object-fit:contain;border-radius:12px}}a{{color:#a17600}}</style>
</head><body><article><h1>{e(row['title'])}</h1><p>{e(row['owner'])}</p><img src="{e(row['image'])}" alt="{e(row['title'])}"><p><a href="https://aesh.ir/portfolio/">مشاهده نمونه‌کارها در انجمن</a></p></article>
<script>(async function(){{try{{var gh=/\\.github\\.io$/i.test(location.hostname),base=gh?'/aesh/':'/',r=await fetch(base+'index.html?__aesh_reload='+Date.now(),{{cache:'no-store'}});if(!r.ok)throw Error('main site');var h=await r.text();document.open();document.write(h);document.close();}}catch(e){{console.warn(e);}}}})();</script>
{MARKER}</body></html>
'''

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
        for prop in ('og:image','twitter:image'):
            pattern=r'(<meta '+('name' if prop.startswith('twitter') else 'property')+'="'+prop+r'" content=")[^"]*(">)'
            content=re.sub(pattern,lambda m:m.group(1)+escape(image,quote=True)+m.group(2),content,count=1)
        page.write_text(content,'utf-8')
        applied+=1
    print('Updated public profile share images:',applied)

def read_state(root):
    try:
        data=json.loads((root/STATE).read_text('utf-8'))
        return {s for s in data.get('generated',[]) if isinstance(s,str)}
    except (FileNotFoundError,ValueError):return set()

def write_sitemap(root, add_urls, previous_urls):
    file=root/'sitemap.xml'
    if not file.exists():return
    tree=ET.parse(file)
    parent=tree.getroot()
    loc_tag=f'{{{NS}}}loc';last_tag=f'{{{NS}}}lastmod';url_tag=f'{{{NS}}}url'
    static=[]
    current_date=datetime.now(timezone.utc).date().isoformat()
    for node in list(parent):
        loc=node.findtext(loc_tag,'')
        if loc not in previous_urls:static.append(node)
    for node in list(parent):parent.remove(node)
    for node in static:parent.append(node)
    for url in sorted(add_urls):
        node=ET.SubElement(parent,url_tag)
        ET.SubElement(node,loc_tag).text=url
        ET.SubElement(node,last_tag).text=current_date
    ET.indent(tree,space='  ')
    file.write_bytes(ET.tostring(parent,encoding='utf-8',xml_declaration=True))

def run(root,rows,host):
    before=read_state(root)
    docs={}
    for row in rows:
        clean=clean_row(row,host)
        if clean is not None:docs[clean['path']]=clean
    actual=set()
    for path,row in docs.items():
        file=root/path
        if file.exists() and MARKER not in file.read_text('utf-8'):
            print('Skipping manually maintained page:',path)
            continue
        file.parent.mkdir(parents=True,exist_ok=True)
        html=document(row)
        if not file.exists() or file.read_text('utf-8')!=html:file.write_text(html,'utf-8')
        actual.add(path)
    for stale in sorted(before-actual):
        file=root/stale
        if file.exists() and MARKER in file.read_text('utf-8'):
            file.unlink()
            try:file.parent.rmdir()
            except OSError:pass
    (root/STATE).write_text(json.dumps({'generated':sorted(actual)},ensure_ascii=False,indent=2)+'\n','utf-8')
    last_urls={'https://aesh.ir/'+p.removesuffix('index.html') for p in before}
    new_urls={'https://aesh.ir/'+p.removesuffix('index.html') for p in actual}
    # Only rewrite sitemap when the routes have changed, not on every scheduled run.
    if new_urls!=last_urls:write_sitemap(root,new_urls,last_urls)
    print('Cloud work previews synced:',len(actual),'published works')

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
