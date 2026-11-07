#!/usr/bin/env python3
"""AESH static blog: fail-closed build of published, reviewed JSON articles.

Only `published` entries are public; drafts never enter the Pages artifact.
Local JSON source is not publicly staged. Optional approved CMS snapshot is fetched
only at build time and its public media is mirrored locally. No destructive remote I/O.
"""
from __future__ import annotations
import argparse
import datetime as dt
import html
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit, unquote
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT/'content/blog'
SITEMAP = ROOT/'sitemap.xml'
ORIGIN = 'https://aesh.ir'
NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
ET.register_namespace('', NS)
SLUG = re.compile(r'^[a-z0-9\u0600-\u06ff](?:[a-z0-9\u0600-\u06ff-]{0,89})$', re.U)
ID = re.compile(r'^[a-zA-Z0-9_-]{2,80}$')
IMG = re.compile(r'^/assets/[a-zA-Z0-9_./\u0600-\u06ff-]+$', re.U)
MARKER = '<!-- AESH-BLOG-GENERATED-V1 -->'

def esc(s):return html.escape(str('' if s is None else s), quote=True)
def plain(s, max_len=5000):
    val = str(s or '').strip()
    if len(val)>max_len:raise ValueError('Field too long')
    return val

def asset(p):
    if not p:return ''
    if not isinstance(p,str) or not IMG.fullmatch(p) or '..' in p or '\\' in p:
        raise ValueError('Blog image must be a local /assets/ path')
    if not (ROOT/p.lstrip('/')).is_file():
        raise ValueError('Missing approved public blog image: '+p)
    return p

def approved_url(v):
    if not v:return ''
    v=plain(v,500)
    x=urlsplit(v)
    if x.scheme!='https' or not x.hostname or x.username or x.password:
        raise ValueError('Only absolute HTTPS links without credentials permitted')
    return v

def block(b):
    if not isinstance(b,dict):raise ValueError('Invalid blog block')
    typ=b.get('type','paragraph')
    if typ == 'paragraph':return '<p>'+esc(plain(b.get('text'))).replace('\n','<br>')+'</p>'
    if typ == 'heading':
        level=int(b.get('level',2))
        if level not in (2,3):raise ValueError('Heading level must be 2 or 3')
        return f'<h{level}>{esc(plain(b.get("text"),200))}</h{level}>'
    if typ == 'quote':return '<blockquote>'+esc(plain(b.get('text')))+'</blockquote>'
    if typ == 'list':
        items=b.get('items',[])
        if not isinstance(items,list) or len(items)>60:raise ValueError('Invalid list')
        tag='ol' if b.get('ordered') is True else 'ul'
        return f'<{tag}>'+''.join('<li>'+esc(plain(x,800))+'</li>' for x in items)+f'</{tag}>'
    if typ == 'link':
        href=approved_url(b.get('url')); label=plain(b.get('text'),200)
        return f'<p><a href="{esc(href)}" target="_blank" rel="noopener noreferrer">{esc(label)}</a></p>'
    if typ == 'image':
        src=asset(b.get('src'));alt=plain(b.get('alt'),230)
        return f'<figure><img src="{esc(src)}" alt="{esc(alt)}" loading="lazy" decoding="async"><figcaption>{esc(plain(b.get("caption"),300))}</figcaption></figure>'
    raise ValueError('Unsupported block type: '+str(typ))

def validate_post(p):
    if not isinstance(p,dict):raise ValueError('Invalid article JSON')
    status=p.get('status')
    if status not in ('published','draft','archived'):raise ValueError('Invalid article status')
    slug=p.get('slug')
    if not isinstance(slug,str) or not SLUG.fullmatch(slug) or '--' in slug or slug.endswith('-'):
        raise ValueError('Unsafe article slug')
    p['title']=plain(p.get('title'),170)
    if len(p['title'])<2:raise ValueError('Missing title')
    p['excerpt']=plain(p.get('excerpt'),300)
    p['category']=plain(p.get('category','آموزش'),80)
    p['author']=plain(p.get('author','انجمن ادیتوران شایسته'),100)
    p['seo_title']=plain(p.get('seo_title') or p['title'],160)
    p['seo_description']=plain(p.get('seo_description') or p['excerpt'],220)
    p['tags']=p.get('tags') or []
    if not isinstance(p['tags'],list) or len(p['tags'])>20:raise ValueError('Invalid tags')
    p['tags']=[plain(x,45) for x in p['tags']]
    p['blocks']=p.get('blocks') or []
    if not isinstance(p['blocks'],list) or len(p['blocks'])>150:raise ValueError('Invalid blocks')
    p['image']=asset(p.get('image'))
    published=p.get('published_at','')
    if status=='published':
        if not published:raise ValueError('Published article lacks publication date')
        try:dt.datetime.fromisoformat(published.replace('Z','+00:00'))
        except ValueError as e:raise ValueError('Bad publication date') from e
    if p.get('canonical'):
        if p['canonical']!=ORIGIN+'/blog/'+slug+'/':raise ValueError('Canonical must be its AESH article route')
    return p

def page_meta(path,title,description,image='',article=False,published_at=''):
    uri=ORIGIN+path
    og=ORIGIN+(image or '/favicon.png')
    meta=f'''<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(title)}</title><meta name="description" content="{esc(description)}">
<link rel="canonical" href="{esc(uri)}"><link rel="icon" href="/favicon.png">
<meta name="robots" content="index,follow,max-image-preview:large"><meta name="referrer" content="no-referrer">
<meta property="og:type" content="{'article' if article else 'website'}"><meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(uri)}"><meta property="og:image" content="{esc(og)}">
<meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="/assets/aesh-pages.css?v=4.0">
<link rel="stylesheet" href="/assets/aesh-blog.css?v=1.0">'''
    if article:
        meta+=f'<meta property="article:published_time" content="{esc(published_at)}">'
    return meta

def shell(path,title,description,body,image='',article=False,published_at=''):
    from build_independent_pages import nav_items, footer
    return f'''<!doctype html><html lang="fa" dir="rtl"><head>{page_meta(path,title,description,image,article,published_at)}</head><body>
{MARKER}{nav_items(path)}<main id="main" tabindex="-1">{body}</main>{footer()}
<script src="/assets/aesh-pages.js?v=4.0" defer></script></body></html>'''

def fetch_remote_posts(url,secret):
    if not url.startswith('https://') or not urlsplit(url).hostname:
        raise ValueError('CMS snapshot URL must be HTTPS')
    req=Request(url,headers={'Accept':'application/json','Authorization':'Bearer '+secret})
    with urlopen(req,timeout=18) as response:
        if response.status!=200 or response.headers.get_content_type()!='application/json':
            raise ValueError('CMS snapshot is not JSON 200')
        payload=response.read(3_000_001)
    if len(payload)>3_000_000:raise ValueError('Snapshot too large')
    result=json.loads(payload)
    if not isinstance(result,dict) or result.get('version')!=1 or not isinstance(result.get('articles'),list):
        raise ValueError('CMS snapshot incompatible')
    return result['articles']

def load_posts(remote_url='',secret='',snapshot_file=''):
    local=[]
    for f in sorted(CONTENT.glob('*.json')):
        if f.name.startswith('.') or f.name=='build_state.json':continue
        local.append(json.loads(f.read_text('utf-8')))
    if snapshot_file:
        snapshot=json.loads(Path(snapshot_file).read_text('utf-8'))
        if snapshot.get('version')!=1 or not isinstance(snapshot.get('articles'),list):raise ValueError('Incorrect CMS snapshot file')
        remote=snapshot['articles']
    else:
        remote=fetch_remote_posts(remote_url,secret) if remote_url else []
    # Remote source owns its own slugs; reject collisions, never silently overwrite.
    seen=set()
    for p in local+remote:
        validate_post(p)
        if p['slug'] in seen:raise ValueError('Duplicate article slug: '+p['slug'])
        seen.add(p['slug'])
    return [p for p in local+remote if p['status']=='published']

def safe_replace_sitemap(published_slugs):
    if not SITEMAP.exists():raise ValueError('Original sitemap missing; refusing to replace')
    root=ET.parse(SITEMAP).getroot()
    if root.tag!=f'{{{NS}}}urlset':raise ValueError('Unexpected sitemap namespace')
    other=[]
    for child in list(root):
        loc=child.findtext(f'{{{NS}}}loc') or ''
        parsed=urlsplit(loc)
        if parsed.scheme=='https' and parsed.netloc=='aesh.ir' and parsed.path.startswith('/blog/'):
            root.remove(child)
        else:other.append(loc)
    for path in ['/blog/']+[f'/blog/{slug}/' for slug in sorted(published_slugs)]:
        loc=ORIGIN+path
        if loc in other:continue
        node=ET.SubElement(root,f'{{{NS}}}url')
        ET.SubElement(node,f'{{{NS}}}loc').text=loc
    ET.indent(root,space='  ')
    payload=ET.tostring(root,encoding='utf-8',xml_declaration=True)
    if SITEMAP.read_bytes()!=payload:SITEMAP.write_bytes(payload)

def build(posts):
    generated=set()
    items=[]
    for p in sorted(posts,key=lambda a:a.get('published_at',''),reverse=True):
        slug=p['slug'];path='/blog/'+slug+'/'
        content='\n'.join(block(x) for x in p['blocks'])
        date=esc(p['published_at'][:10])
        taglist=''.join(f'<span class="aesh-blog-tag">{esc(t)}</span>' for t in p['tags'])
        heroimg=f'<img class="aesh-blog-cover" src="{esc(p["image"])}" alt="{esc(p["title"])}" decoding="async">' if p['image'] else ''
        body=f'''<section class="aesh-blog-page wrap"><nav class="aesh-blog-crumb"><a href="/">خانه</a> / <a href="/blog/">وبلاگ</a> / {esc(p['title'])}</nav>
<article class="aesh-blog-article"><header><span class="aesh-blog-category">{esc(p['category'])}</span><h1>{esc(p['title'])}</h1><p class="aesh-blog-summary">{esc(p['excerpt'])}</p>
<div class="aesh-blog-byline"><span>نویسنده: {esc(p['author'])}</span><time datetime="{date}">{date}</time></div></header>{heroimg}
<div class="aesh-blog-rich">{content}</div><footer class="aesh-blog-tags">{taglist}</footer></article>
<a class="aesh-blog-back" href="/blog/">بازگشت به همه مقالات ←</a></section>'''
        article=shell(path,p['seo_title']+' | AESH',p['seo_description'],body,p['image'],True,p['published_at'])
        dest=ROOT/'blog'/slug/'index.html';dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(article,'utf-8')
        generated.add('blog/'+slug+'/index.html')
        items.append(f'''<a class="aesh-blog-card" href="{esc(path)}">{('<img src="'+esc(p['image'])+'" alt="" loading="lazy">') if p['image'] else '<span class="aesh-blog-card-placeholder">AESH</span>'}
<span class="aesh-blog-category">{esc(p['category'])}</span><h2>{esc(p['title'])}</h2><p>{esc(p['excerpt'])}</p><time datetime="{date}">{date}</time></a>''')
    grid='<div class="aesh-blog-grid">'+''.join(items)+'</div>' if items else '<p class="aesh-blog-empty">هنوز مقاله‌ای منتشر نشده است. مقالات پس از بررسی و تأیید مدیریت در این صفحه قرار می‌گیرند.</p>'
    index=shell('/blog/','وبلاگ انجمن ادیتوران شایسته | AESH','مقالات و آموزش‌های انجمن ادیتوران شایسته',
      '<section class="page-hero"><div class="wrap"><span class="eyebrow">مجله AESH</span><h1>وبلاگ انجمن</h1><p>مقالات آموزشی و اخبار تخصصی ادیت و طراحی گرافیک</p></div></section><section class="aesh-blog-page wrap">'+grid+'</section>')
    (ROOT/'blog/index.html').write_text(index,'utf-8')
    generated.add('blog/index.html')
    # Remove ONLY pages previously generated by this builder, never source-owned pages.
    for f in (ROOT/'blog').glob('*/index.html'):
        if f.relative_to(ROOT).as_posix() not in generated:
            if MARKER in f.read_text('utf-8'):
                f.unlink()
                if not any(f.parent.iterdir()):f.parent.rmdir()
    safe_replace_sitemap({p['slug'] for p in posts})
    return len(posts)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--cms-snapshot-url',default='')
    parser.add_argument('--cms-snapshot-file',default='')
    args=parser.parse_args()
    secret=os.environ.get('AESH_CMS_PUBLISH_TOKEN','')
    if args.cms_snapshot_url and not secret:
        print('FAIL CMS publishing enabled but secret missing',file=sys.stderr);sys.exit(2)
    try:
        published=load_posts(args.cms_snapshot_url,secret,args.cms_snapshot_file)
        print('PASS AESH static blog:',build(published),'published articles; draft/archived excluded')
    except Exception as ex:
        print('FAIL static blog build:',str(ex),file=sys.stderr);sys.exit(2)
