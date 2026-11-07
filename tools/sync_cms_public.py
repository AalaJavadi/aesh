#!/usr/bin/env python3
"""Build independent AESH profile/work HTML from an approved Cloudflare CMS snapshot.

No direct production writes. When CMS credentials are absent this is a no-op;
existing Supabase/legacy pages remain unchanged. Build fails closed if CMS or
media is inaccessible: the preceding GitHub Pages deployment remains online.
"""
from __future__ import annotations
import argparse, json, os, re, shutil, sys
from html import escape
from pathlib import Path
from urllib.parse import urlsplit, quote
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from bs4 import BeautifulSoup
from build_blog import shell, SLUG, ORIGIN, NS, MARKER as BLOG_MARKER

ROOT=Path(__file__).resolve().parents[1]
STATE=ROOT/'content/cf_public_state.json'
OUT=ROOT/'.aesh-cms-snapshot.json'
MARKER='<!-- AESH-CF-CMS-GENERATED-V1 -->'
UUID=re.compile(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$',re.I)
IMG_TYPES={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}

def h(x):return escape(str(x or ''),quote=True)
def short(v,n=1000):
    if not isinstance(v,str) or len(v)>n:raise ValueError('Invalid CMS public string')
    return v.strip()

def validate_route(v):
    if not isinstance(v,str) or not SLUG.fullmatch(v) or len(v)>90 or '--' in v or v.endswith('-'):
        raise ValueError('Unsafe CMS URL slug')
    return v

def mirror(url,source_host,files):
    if not url:return ''
    if isinstance(url,str) and url.startswith('/assets/') and '..' not in url:
        if not (ROOT/url.lstrip('/')).is_file():raise ValueError('Missing local image in snapshot')
        return url
    parsed=urlsplit(short(url,1000))
    match=re.fullmatch(r'/v1/public/media/([0-9a-f-]{36})',parsed.path,re.I)
    if parsed.scheme!='https' or parsed.netloc!=source_host or not match or not UUID.fullmatch(match.group(1)) or parsed.query or parsed.fragment:
        raise ValueError('CMS media URL is not an approved public media endpoint')
    media_id=match.group(1).lower()
    if media_id in files:return files[media_id]
    req=Request(url,headers={'Accept':'image/png, image/webp, image/jpeg','User-Agent':'AESH-Pages-Builder/1.0'})
    with urlopen(req,timeout=12) as response:
        if response.status!=200:raise ValueError('Missing approved CMS public media')
        mime=response.headers.get_content_type()
        if mime not in IMG_TYPES:raise ValueError('CMS media type forbidden')
        data=response.read(2_097_153)
    if not data or len(data)>2_097_152:raise ValueError('CMS media payload too large')
    if mime=='image/png' and not data.startswith(b'\x89PNG\r\n\x1a\n'):raise ValueError('Invalid PNG magic')
    if mime=='image/jpeg' and not data.startswith(b'\xff\xd8\xff'):raise ValueError('Invalid JPEG magic')
    if mime=='image/webp' and not (data[:4]==b'RIFF' and data[8:12]==b'WEBP'):raise ValueError('Invalid WebP magic')
    relative=f'assets/cms-media/{media_id}.{IMG_TYPES[mime]}'
    dest=ROOT/relative;dest.parent.mkdir(parents=True,exist_ok=True)
    if not dest.exists() or dest.read_bytes()!=data:dest.write_bytes(data)
    files[media_id]='/'+relative
    return files[media_id]

def verified_snapshot(url,token):
    parsed=urlsplit(url)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.path!='/v1/public/snapshot':
        raise ValueError('Invalid snapshot URL; use HTTPS /v1/public/snapshot')
    if len(token)<32:raise ValueError('Missing CMS snapshot secret')
    req=Request(url,headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
    with urlopen(req,timeout=18) as response:
        if response.status!=200 or response.headers.get_content_type()!='application/json':raise ValueError('Invalid CMS response')
        body=response.read(5_000_001)
    if len(body)>5_000_000:raise ValueError('CMS snapshot too large')
    data=json.loads(body)
    if not isinstance(data,dict) or data.get('version')!=1 or any(not isinstance(data.get(k),list) for k in ('profiles','works','articles')):
        raise ValueError('CMS snapshot schema invalid')
    return data,parsed.netloc

def public_photo(url,title):
    if not url:return '<div class="aesh-cms-no-image">AESH</div>'
    return f'<img src="{h(url)}" alt="{h(title)}" loading="lazy" decoding="async">'

def profile_html(p):
    role=p['role'];name=p['display_name'];path=f'/{role}/{p["slug"]}/';image=p.get('image') or ''
    stats=''.join(f'<div><strong>{h(x["value"])}</strong><span>{h(x["label"])}</span></div>' for x in p.get('stats',[]))
    chart=''.join(f'<div class="aesh-cms-chart"><span>{h(x["label"])} · {x["value"]}%</span><div><b style="width:{x["value"]}%"></b></div></div>' for x in p.get('performance',[]))
    ex=p.get('extra') or {};details=''.join(f'<dt>{h(label)}</dt><dd>{h(ex[key])}</dd>' for key,label in [('joinDate','تاریخ عضویت'),('rank','رتبه'),('availability','وضعیت همکاری'),('work_style','سبک فعالیت'),('achievements','دستاوردها')] if isinstance(ex.get(key),str) and ex[key].strip())
    link=ex.get('portfolio_url','');link_tag=''
    if isinstance(link,str):
        u=urlsplit(link)
        if u.scheme=='https' and u.hostname and not u.username and not u.password:link_tag=f'<a href="{h(link)}" rel="noopener noreferrer" target="_blank">نمونه‌کارهای عمومی</a>'
    txt=f'''<section class="aesh-cms-detail wrap"><nav class="aesh-cms-crumb"><a href="/">خانه</a> / <a href="/{'teachers' if role=='teacher' else 'students'}/">{'اساتید' if role=='teacher' else 'هنرجویان'}</a> / {h(name)}</nav>
<article class="aesh-cms-profile"><div class="aesh-cms-hero">{public_photo(image,name)}<div><span class="aesh-cms-tag">{'استاد' if role=='teacher' else 'هنرجو'}</span><h1>{h(name)}</h1><h2>{h(p.get('specialty'))}</h2><p>{h(p.get('bio'))}</p></div></div>
<div class="aesh-cms-stats">{stats}</div><div class="aesh-cms-bottom"><section><h2>مهارت‌ها</h2><p>{h('، '.join(p.get('skills') or []))}</p><dl>{details}</dl>{link_tag}</section><section><h2>نمودار عملکرد</h2>{chart or '<p>هنوز شاخصی ثبت نشده است.</p>'}</section></div></article></section>'''
    return shell(path,name+' | انجمن ادیتوران شایسته',(p.get('bio') or p.get('specialty') or name)[:500],txt,image).replace(BLOG_MARKER,MARKER).replace('</head>','<link rel="stylesheet" href="/assets/aesh-cms-pages.css"></head>')

def work_html(w):
    slug=w['slug'];path=f'/work/{slug}/';title=w['title'];image=w.get('image') or ''
    owner_url=f'/{w["owner_role"]}/{w["owner_slug"]}/'
    description=short(w.get('description') or '',1400)
    body=f'''<section class="aesh-cms-detail wrap"><nav class="aesh-cms-crumb"><a href="/">خانه</a> / <a href="/portfolio/">نمونه‌کارها</a> / {h(title)}</nav>
<article class="aesh-cms-profile"><span class="aesh-cms-tag">اثر {'استاد' if w['owner_role']=='teacher' else 'هنرجو'}</span><h1>{h(title)}</h1><p>طراح: <a href="{h(owner_url)}">{h(w['owner_name'])}</a></p>
<figure class="aesh-cms-work">{public_photo(image,title)}</figure><h2>درباره اثر</h2><p>{h(description)}</p></article></section>'''
    return shell(path,title+' | AESH',description or title,body,image).replace(BLOG_MARKER,MARKER).replace('</head>','<link rel="stylesheet" href="/assets/aesh-cms-pages.css"></head>')

def summary_cards(data):
    root=ROOT
    for role,root_path,gridId in [('teacher','teachers/index.html','teachersGrid'),('student','students/index.html','studentsGrid'),('work','portfolio/index.html','portfolioGrid')]:
        page=root/root_path
        if not page.exists():raise ValueError('Missing existing public directory '+root_path)
        soup=BeautifulSoup(page.read_text('utf-8'),'html.parser');grid=soup.find(id=gridId)
        if grid is None:raise ValueError('Existing list markup changed '+root_path)
        for prev in grid.select('[data-aesh-cf-generated="1"]'):prev.decompose()
        rows=data['works'] if role=='work' else [x for x in data['profiles'] if x['role']==role]
        for item in rows:
            if role=='work':
                ident=item['slug']
                if grid.select_one('[data-slug="'+ident+'"]'):continue
                markup=f'<article class="portfolio-card" data-aesh-cf-generated="1" data-owner-type="{h(item["owner_role"])}"><a class="portfolio-card-link" aria-label="مشاهده {h(item["title"])}" href="/work/{quote(ident)}/"></a><div class="portfolio-card-media" data-src="{h(item.get("image"))}" data-alt="{h(item["title"])}"></div><div class="portfolio-card-body"><div class="portfolio-card-title">{h(item["title"])}</div><div class="portfolio-card-owner">{h(item.get("owner_name"))}</div></div></article>'
            else:
                ident=item['slug']
                if grid.select_one('[data-slug="'+ident+'"]'):continue
                markup=f'<div class="person-card" data-aesh-cf-generated="1" data-slug="{h(ident)}"><a class="person-card-link" href="/{role}/{quote(ident)}/" aria-label="پروفایل {h(item["display_name"])}"></a><div class="person-media"><span class="person-badge">{"استاد" if role=="teacher" else "هنرجو"}</span>{public_photo(item.get("image"),item["display_name"])}</div><div class="person-body"><div class="person-name">{h(item["display_name"])}</div><span class="person-role">{h(item.get("specialty"))}</span><p class="person-bio">{h(item.get("bio"))}</p></div></div>'
            node=BeautifulSoup(markup,'html.parser')
            grid.append(node)
        page.write_text(str(soup),'utf-8')

def change_sitemap(paths,old):
    file=ROOT/'sitemap.xml';doc=ET.parse(file);root=doc.getroot()
    if root.tag!=f'{{{NS}}}urlset':raise ValueError('Unrecognized sitemap XML')
    previous=set(ORIGIN+'/'+p.removesuffix('index.html') for p in old if p.startswith(('teacher/','student/','work/')))
    for node in list(root):
        loc=node.findtext(f'{{{NS}}}loc') or ''
        if loc in previous and loc not in {ORIGIN+'/'+p.removesuffix('index.html') for p in paths}:
            # If legacy content now owns the route we never remove its sitemap URL.
            path=ROOT/loc.removeprefix(ORIGIN+'/')/'index.html'
            if path.exists() and MARKER not in path.read_text('utf-8'):continue
            root.remove(node)
    existing={n.findtext(f'{{{NS}}}loc') for n in root}
    for p in sorted(paths):
        loc=ORIGIN+'/'+p.removesuffix('index.html')
        if loc not in existing:
            n=ET.SubElement(root,f'{{{NS}}}url');ET.SubElement(n,f'{{{NS}}}loc').text=loc
    ET.indent(root,space='  ');file.write_bytes(ET.tostring(root,encoding='utf-8',xml_declaration=True))

def run(data,source_host):
    if data.get('version')!=1 or any(not isinstance(data.get(k),list) for k in ('profiles','works','articles')):raise ValueError('CMS snapshot wrong shape')
    if len(data['profiles'])>1000 or len(data['works'])>2000 or len(data['articles'])>500:raise ValueError('CMS excessive records')
    known=set();media={};new_files=set();new_posts=[]
    profiles=[];works=[]
    for p in data['profiles']:
        if not isinstance(p,dict) or p.get('role') not in ('teacher','student'):raise ValueError('Bad public CMS profile')
        validate_route(p.get('slug'));name=short(p.get('display_name'),120)
        if len(name)<2:raise ValueError('Profile without name')
        ident=(p['role'],p['slug'])
        if ident in known:raise ValueError('Duplicate profile slug')
        known.add(ident)
        p['image']=mirror(p.get('image'),source_host,media)
        p['bio']=short(p.get('bio') or '',3000);p['specialty']=short(p.get('specialty') or '',160)
        p['skills']=[short(x,100) for x in (p.get('skills') or [])[:40]]
        p['stats']=[{'label':short(x['label'],70),'value':short(x['value'],40)} for x in (p.get('stats') or [])[:8]]
        p['performance']=[{'label':short(x['label'],70),'value':int(x['value'])} for x in (p.get('performance') or [])[:8] if type(x.get('value')) is int and 0<=x['value']<=100]
        p['extra']=p.get('extra') if isinstance(p.get('extra'),dict) else {}
        profiles.append(p)
    for w in data['works']:
        if not isinstance(w,dict) or w.get('owner_role') not in ('teacher','student'):raise ValueError('Bad public CMS work')
        validate_route(w.get('slug'));validate_route(w.get('owner_slug'))
        if ('work',w['slug']) in known:raise ValueError('Duplicate work slug')
        known.add(('work',w['slug']))
        w['image']=mirror(w.get('image'),source_host,media)
        w['title']=short(w.get('title'),130);w['owner_name']=short(w.get('owner_name'),120)
        works.append(w)
    for p in data['articles']:
        if not isinstance(p,dict) or p.get('status')!='published':raise ValueError('Draft leaked into CMS public snapshot')
        validate_route(p.get('slug'))
        p['image']=mirror(p.get('image'),source_host,media)
        if not isinstance(p.get('blocks'),list):raise ValueError('Missing CMS blocks')
        for b in p['blocks']:
            if isinstance(b,dict) and b.get('type')=='image':b['src']=mirror(b.get('src'),source_host,media)
        new_posts.append(p)
    all_current=set()
    for p in profiles:
        relative=p['role']+'/'+p['slug']+'/index.html';path=ROOT/relative
        if path.exists() and MARKER not in path.read_text('utf-8'):
            print('SKIP protected legacy profile',relative);continue
        path.parent.mkdir(parents=True,exist_ok=True);path.write_text(profile_html(p),'utf-8');all_current.add(relative)
    for w in works:
        relative='work/'+w['slug']+'/index.html';path=ROOT/relative
        if path.exists() and MARKER not in path.read_text('utf-8'):
            print('SKIP protected legacy work',relative);continue
        path.parent.mkdir(parents=True,exist_ok=True);path.write_text(work_html(w),'utf-8');all_current.add(relative)
    old=set();old_media=set()
    if STATE.exists():
        info=json.loads(STATE.read_text('utf-8'))
        if not isinstance(info,dict):raise ValueError('CMS build state corrupt')
        old=set(info.get('generated',[]));old_media=set(info.get('media',[]))
    for rel in old-all_current:
        f=ROOT/rel
        if not f.resolve().is_relative_to(ROOT.resolve()):raise ValueError('Unsafe stale path')
        if f.exists() and MARKER in f.read_text('utf-8'):
            f.unlink()
            if not any(f.parent.iterdir()):f.parent.rmdir()
    # Public list cards are always generated from this approved snapshot.
    summary_cards({'profiles':[p for p in profiles if p['role']+'/'+p['slug']+'/index.html' in all_current],
                   'works':[w for w in works if 'work/'+w['slug']+'/index.html' in all_current]})
    change_sitemap(all_current,old)
    # Remove stale CMS-only image files; archived media must not survive a successful deploy.
    current_media=set(x.removeprefix('/') for x in media.values())
    for rel in old_media-current_media:
        if rel.startswith('assets/cms-media/') and (ROOT/rel).is_file(): (ROOT/rel).unlink()
    STATE.write_text(json.dumps({'generated':sorted(all_current),'media':sorted(current_media)},ensure_ascii=False,indent=2)+'\n','utf-8')
    OUT.write_text(json.dumps({'version':1,'articles':new_posts},ensure_ascii=False,indent=2)+'\n','utf-8')
    return len(all_current),len(new_posts),len(media)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--fixture')
    args=parser.parse_args()
    url=os.environ.get('AESH_CMS_SNAPSHOT_URL','').strip();token=os.environ.get('AESH_CMS_PUBLISH_TOKEN','').strip()
    if not args.fixture and not url:
        print('SKIP Cloudflare CMS source not configured; old pages remain intact')
        sys.exit(0)
    try:
        if args.fixture:
            data=json.loads(Path(args.fixture).read_text('utf-8'))
            host='test.example.org'
        else:data,host=verified_snapshot(url,token)
        counts=run(data,host)
        print('PASS CMS:',counts,'profile/work pages, articles and local media; private content excluded')
    except Exception as e:
        print('FAIL CMS public build:',str(e),file=sys.stderr);sys.exit(2)
