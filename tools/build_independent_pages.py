#!/usr/bin/env python3
"""Build independent, crawlable AESH pages from the classic Studio's embedded content.

- Every public path gets a complete HTML document; never fetches /index.html.
- Assets are local and scoped to the requested page.
- Original public Persian slugs stay unchanged.
- Safe to run repeatedly, and independent of a private Supabase database.

Run: python tools/build_independent_pages.py
Requirement: beautifulsoup4 (HTML parsing of the original laws and content).
"""
from __future__ import annotations
import base64
import datetime as dt
import html
import json
import mimetypes
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import quote, unquote, urlsplit
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'https://aesh.ir'
SOURCE = ROOT/'studio/index.html'
CSS = '/assets/aesh-pages.css?v=4.0'
JS = '/assets/aesh-pages.js?v=4.0'
FACE = 'انجمن ادیتوران شایسته'
DATE = dt.datetime.now(dt.timezone.utc).date().isoformat()
ALL_URLS = set()
NEW_HTML = set()
NAV = [('خانه','/'),('اساتید','/teachers/'),('هنرجویان','/students/'),('نمونه‌کارها','/portfolio/'),('دوره‌ها','/courses/'),('مسابقات','/events/'),('اخبار','/news/'),('سؤالات','/faq/'),('قوانین','/rules/'),('درباره ما','/about/')]
TITLES = {'home':'خانه','teachers':'اساتید','students':'هنرجویان','portfolio':'نمونه‌کارها','courses':'دوره‌ها','events':'رویدادها','news':'اخبار','faq':'سؤالات متداول','rules':'قوانین','about':'درباره ما'}
NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
ET.register_namespace('',NS)

def h(x):return html.escape(str('' if x is None else x),quote=True)
def strip(x):
    return BeautifulSoup(str(x or ''),'html.parser').get_text(' ',strip=True)
def text(x,limit=None):
    s=re.sub(r'\s+',' ',strip(x)).strip()
    return s if limit is None or len(s)<=limit else s[:limit-1].rstrip()+'…'
def path_slug(s):
    s=str(s or '').lower().strip().replace('ي','ی').replace('ى','ی').replace('ك','ک').replace('آ','ا').replace('أ','ا').replace('إ','ا').replace('ؤ','و').replace('ة','ه').replace('\u200c',' ')
    s=''.join(str('۰۱۲۳۴۵۶۷۸۹'.index(x)) if x in '۰۱۲۳۴۵۶۷۸۹' else x for x in s)
    s=re.sub('[^a-z0-9\u0600-\u06ff]+','-',s)
    return s.strip('-')[:90]
def url_for(kind,obj):
    if kind=='featured':slug=str(obj['id'])
    else:slug=str(obj.get('slug') or path_slug(obj.get('title') or obj.get('name') or obj.get('id') or ''))
    return '/'+kind+'/'+slug+'/'
def absurl(url):
    if str(url).startswith('https://'):return url
    return ORIGIN+'/'+str(url).lstrip('/')
def img_local(url):
    if not url:return ''
    u=str(url).strip()
    if u.startswith('data:'):return ''
    if u.startswith('https://'):return u
    if u.startswith('/'):return u
    return '/'+u

def write_rel(path,content):
    dest=ROOT/path.lstrip('/')
    dest.parent.mkdir(parents=True,exist_ok=True)
    if isinstance(content,bytes):
        if not dest.exists() or dest.read_bytes()!=content:dest.write_bytes(content)
    else:
        if not dest.exists() or dest.read_text('utf-8')!=content:dest.write_text(content,'utf-8')
    return dest

def decode_escapes(value):
    """Original Windows ZIP used literal #U0645 paths; keep aliases but provide real UTF-8 names."""
    return re.sub(r'#U([0-9a-fA-F]{4})',lambda m:chr(int(m.group(1),16)),value)

def normalize_asset_names():
    count=0
    for base in ['assets/portfolio','assets/social','teacher','student','work','course','news']:
        folder=ROOT/base
        if not folder.exists():continue
        items=sorted([p for p in folder.rglob('*') if p.is_file() and '#U' in str(p.relative_to(ROOT))],key=lambda x:len(x.parts))
        for old in items:
            decoded=Path(*[decode_escapes(part) for part in old.relative_to(ROOT).parts]);new=ROOT/decoded
            if old==new or new.exists():continue
            new.parent.mkdir(parents=True,exist_ok=True)
            # The older alias is intentionally not removed. It may be externally linked.
            new.write_bytes(old.read_bytes());count+=1
    return count

def decode_picture(raw,path):
    raw=str(raw or '')
    match=re.match(r'^data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$',raw,re.I)
    if not match:return img_local(raw)
    ext={'jpeg':'jpg'}.get(match.group(1).lower(),match.group(1).lower())
    try:binary=base64.b64decode(match.group(2),validate=True)
    except Exception:return ''
    if len(binary)>5_000_000:return ''
    dest=path+'.'+ext
    write_rel(dest,binary)
    return '/'+dest.lstrip('/')

def schema_graph(page,entity=None,trail=None):
    # Build standard linked data, with page-specific images and no unrelated picture references.
    url=absurl(page)
    out=[{'@type':'Organization','@id':ORIGIN+'/#organization','name':FACE,'url':ORIGIN+'/','logo':{'@type':'ImageObject','url':ORIGIN+'/favicon.png'}}]
    out.append({'@type':'WebPage','@id':url+'#webpage','url':url,'inLanguage':'fa-IR'})
    if entity:out.append(entity)
    if trail:
        out.append({'@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':i+1,'name':name,'item':absurl(path)} for i,(name,path) in enumerate(trail)]})
    return {'@context':'https://schema.org','@graph':out}

def head(path,title,description,og_image='',kind='website',entity=None,trail=None,robots='index,follow,max-image-preview:large'):
    url=absurl(path);description=text(description,260);title=text(title,170)
    og=absurl(og_image or '/favicon.png')
    schema=schema_graph(path,entity,trail)
    j=json.dumps(schema,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c').replace('>','\\u003e')
    return f'''<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{h(title)}</title><meta name="description" content="{h(description)}"><meta name="robots" content="{h(robots)}">
<link rel="canonical" href="{h(url)}"><link rel="icon" type="image/png" href="/favicon.png" sizes="144x144">
<meta property="og:locale" content="fa_IR"><meta property="og:site_name" content="{FACE}"><meta property="og:type" content="{h(kind)}">
<meta property="og:url" content="{h(url)}"><meta property="og:title" content="{h(title)}"><meta property="og:description" content="{h(description)}"><meta property="og:image" content="{h(og)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{h(title)}"><meta name="twitter:image" content="{h(og)}">
<link rel="stylesheet" href="{CSS}"><script type="application/ld+json">{j}</script>'''

def nav_items(path):
    links=''.join(f'<a href="{h(u)}"'+(' aria-current="page"' if path==u else '')+f'>{h(label)}</a>' for label,u in NAV)
    return f'''<a class="skip" href="#main">رفتن به محتوای اصلی</a><header class="site-header"><div class="wrap header-in">
<a class="brand" href="/" aria-label="خانه انجمن ادیتوران شایسته"><img class="brand-logo" src="/favicon.png" width="50" height="50" alt="لوگوی AESH"><span class="brand-copy"><strong><em>انجمن</em> ادیتوران شایسته</strong><small>مرجع ادیت تصویر و طراحی گرافیک</small></span></a>
<nav class="primary-nav" id="siteNav" aria-label="منوی اصلی">{links}</nav><div class="header-actions"><a class="login-link" href="/members/">پنل اعضا</a><button type="button" class="menu-toggle" id="menuToggle" aria-label="باز کردن منو" aria-controls="siteNav" aria-expanded="false">☰</button></div>
</div></header>'''

def footer():
    links=''.join(f'<a href="{h(url)}">{h(label)}</a>' for label,url in NAV)
    return f'''<footer class="footer"><div class="wrap"><div class="footer-top"><div><h2>انجمن ادیتوران شایسته</h2><p>فضایی برای نمایش آثار، یادگیری و رشد در کنار هنرمندان و ادیتورهای تصویر.</p></div><nav aria-label="منوی پایین صفحه">{links}</nav></div>
<div class="footer-bottom">© {FACE} · تمامی حقوق آثار متعلق به صاحبان آن‌هاست. · <a href="https://rubika.ir/Editoran_Shayeste" rel="noopener noreferrer" target="_blank">روبیکای رسمی انجمن ↗</a></div></div></footer>'''

def breadcrumbs(trail):
    if not trail:return ''
    s=[]
    for i,(name,url) in enumerate(trail):
        s.append(f'<a href="{h(url)}">{h(name)}</a>' if i<len(trail)-1 else f'<span aria-current="page">{h(name)}</span>')
    return '<nav class="breadcrumb" aria-label="مسیر صفحه">'+'<span class="sep" aria-hidden="true">‹</span>'.join(s)+'</nav>'

def document(path,title,description,body,og_image='',kind='website',entity=None,trail=None,extra_scripts='',page_type='',role='',slug='',robots=None):
    html_doc=f'''<!doctype html><html lang="fa" dir="rtl"><head>{head(path,title,description,og_image,kind,entity,trail,robots or 'index,follow,max-image-preview:large')}</head>
<body data-page="{h(page_type)}" data-role="{h(role)}" data-slug="{h(slug)}">{nav_items(path)}<main id="main" tabindex="-1">{body}</main>{footer()}
<script src="{JS}" defer></script>{extra_scripts}</body></html>'''
    write_rel(path.lstrip('/')+'index.html',html_doc)
    if robots!='noindex,follow':ALL_URLS.add(path)
    NEW_HTML.add(path.lstrip('/')+'index.html')
    return html_doc

def section_hero(label,title,desc):
    return f'''<section class="page-hero"><div class="wrap"><span class="eyebrow">{h(label)}</span><h1>{h(title)}</h1><p>{h(desc)}</p></div></section>'''

def list_search(placeholder,filters=None):
    more=''
    if filters:more='<div class="filter-group" role="group" aria-label="فیلتر نتایج">'+''.join(f'<button type="button" class="filter-btn" data-filter="{h(k)}" aria-pressed="{str(i==0).lower()}">{h(name)}</button>' for i,(k,name) in enumerate(filters))+'</div>'
    return f'''<div class="list-tools"><input id="listSearch" class="search-input" type="search" placeholder="{h(placeholder)}" aria-label="{h(placeholder)}">{more}</div><p class="result-count" id="visibleCount" aria-live="polite"></p>'''

def list_footer():return '<p id="noMatches" class="empty-state" hidden>موردی با این جستجو پیدا نشد.</p>'

def person_card(p,role):
    slug=p['slug']; image=p.get('_image','');name=p.get('name','');position=p.get('role','')
    href=url_for(role,p)
    photo=f'<img src="{h(image)}" data-person-image data-person-name="{h(name)}" alt="تصویر {h(name)}" width="400" height="380" loading="lazy" decoding="async">' if image else '<span aria-hidden="true" class="fallback">◉</span>'
    return f'''<a class="person-card panel listing-item" href="{h(href)}" data-type="{h(role)}" data-search="{h(name+' '+position)}" data-person-slug="{h(slug)}"><div class="person-photo">{photo}</div><div class="person-card-body"><span class="tag">{'استاد' if role=='teacher' else 'هنرجو'}</span><h2>{h(name)}</h2><p>{h(position)}</p><div class="card-bottom"><span>مشاهده پروفایل ←</span><span aria-hidden="true">↗</span></div></div></a>'''

def work_card(p,loading='lazy'):
    url=url_for('work',p);title=p.get('title','اثر هنری');type_=p.get('ownerType') or 'student';image=p.get('_thumb') or p.get('_image') or ''
    poster=f'<img src="{h(image)}" alt="تصویر نمونه‌کار {h(title)}" loading="{loading}" decoding="async" width="420" height="315">' if image else '✦'
    owner=p.get('ownerName') or 'عضو انجمن'
    return f'''<a href="{h(url)}" class="work-card panel listing-item" data-type="{h(type_)}" data-search="{h(title+' '+owner)}" data-work-slug="{h(p.get('slug',''))}"><div class="work-photo">{poster}</div><div class="work-card-body"><h2>{h(title)}</h2><p class="work-meta">{h(owner)} · {'استاد' if type_=='teacher' else 'هنرجو'}</p><div class="card-bottom"><span>مشاهده صفحه اثر ←</span><span aria-hidden="true">↗</span></div></div></a>'''

def course_card(p):
    url=url_for('course',p)
    return f'''<a class="course-card panel listing-item" href="{h(url)}" data-search="{h(p.get('title','')+' '+p.get('instructor',''))}"><span class="course-icon" aria-hidden="true">✎</span><span class="tag">دوره آموزشی</span><h2>{h(p.get('title'))}</h2><p>{h(text(p.get('desc'),170))}</p><div class="course-details"><span>{h(p.get('level',''))}</span><span>{h(p.get('duration',''))}</span><span>{h(p.get('instructor',''))}</span></div><div class="card-bottom"><span>مشاهده اطلاعات دوره ←</span></div></a>'''

def news_card(p):
    return f'''<a class="news-card panel listing-item" href="{h(url_for('news',p))}" data-search="{h(p.get('title',''))}"><time>{h(p.get('date',''))}</time><h2>{h(p.get('title',''))}</h2><p>{h(p.get('excerpt',''))}</p><div class="card-bottom"><span>مطالعه خبر ←</span></div></a>'''

def person_detail(p,role):
    title=p.get('name') or 'عضو انجمن';category='اساتید' if role=='teacher' else 'هنرجویان';group='/teachers/' if role=='teacher' else '/students/'
    url=url_for(role,p); image=p.get('_image','');bio=text(p.get('bio'))
    skills=p.get('extra') or {}
    trail=[('خانه','/'),(category,group),(title,url)]
    schema={'@type':'Person','@id':absurl(url)+'#person','name':title,'description':text(p.get('role','')+' — '+bio,300),'url':absurl(url)}
    if image:schema['image']=absurl(image)
    main=f'''<article class="detail-main detail-card panel"><span class="eyebrow">{'پروفایل استاد انجمن' if role=='teacher' else 'پروفایل هنرجوی انجمن'}</span><h1>{h(title)}</h1>
    <p class="detail-tagline">{h(p.get('role',''))}</p><section class="rich-text"><h2>درباره {h(title)}</h2><p data-profile-bio>{h(bio or 'اطلاعات معرفی هنوز تکمیل نشده است.')}</p></section>'''
    stats=p.get('stats') or []
    if stats: main+='<div class="profile-stats">'+''.join(f'<div><strong>{h(x.get("value","—"))}</strong><span>{h(x.get("label",""))}</span></div>' for x in stats[:3])+'</div>'
    if skills.get('skills'):main+=f'<h2>مهارت‌ها</h2><p>{h(skills["skills"])}</p>'
    if skills.get('achievements'):main+=f'<h2>سوابق و دستاوردها</h2><p>{h(skills["achievements"])}</p>'
    main+='</article>'
    left=''
    if image:left+=f'<div class="panel side-card"><img class="detail-profile-photo" data-person-image data-person-name="{h(title)}" src="{h(image)}" width="400" height="400" alt="تصویر پروفایل {h(title)}"></div>'
    info=''
    for key,label in [('joinDate','تاریخ عضویت'),('rank','سطح'),('availability','وضعیت همکاری')]:
        if skills.get(key):info+=f'<div><dt>{h(label)}</dt><dd>{h(skills[key])}</dd></div>'
    if info:left+=f'<section class="panel side-card"><h2>اطلاعات عضو</h2><dl>{info}</dl></section>'
    works=p.get('_works',[])
    if works:
        left+='<section class="panel side-card"><h2>آثار این عضو</h2><ul class="related-links">'+''.join(f'<li><a href="{h(url_for("work",item))}">{h(item.get("title"))} ←</a></li>' for item in works)+'</ul></section>'
    # Do not load an unrelated gallery or images from another person's page.
    body=f'<div class="wrap">{breadcrumbs(trail)}<div class="detail-grid">{main}<aside class="detail-side sidebar-stack">{left}</aside></div></div>'
    desc=text(f'{title}، {p.get("role","")}. {bio or skills.get("skills","")}',250)
    return document(url,title+' | '+('استاد' if role=='teacher' else 'هنرجو')+' انجمن شایسته',desc,body,p.get('_og') or image,'profile',schema,trail,
                    extra_scripts='<script src="/assets/aesh-config.js" defer></script><script src="/assets/aesh-core.js?v=3.25" defer></script>',role=role,slug=p['slug'])


def work_detail(p,is_cloud=False):
    title=p.get('title') or 'نمونه‌کار';url=url_for('work',p)
    image=p.get('_image') or img_local(p.get('image'))
    owner=p.get('ownerName') or 'عضو انجمن';role=p.get('ownerType')
    owner_url='/'+str(role)+'/'+str(p.get('ownerSlug'))+'/' if role in ('teacher','student') and p.get('ownerSlug') else None
    # An artwork can be published before the author's public profile is created.
    # Avoid producing a broken profile link in that case.
    if owner_url and not (ROOT/owner_url.lstrip('/')/'index.html').is_file():owner_url=None
    trail=[('خانه','/'),('نمونه‌کارها','/portfolio/'),(title,url)]
    schema={'@type':'VisualArtwork','@id':absurl(url)+'#artwork','name':title,'description':text(p.get('desc'),650),'url':absurl(url),'inLanguage':'fa-IR',
            'creator':{'@type':'Person','name':owner}}
    if image:schema['image']=absurl(image)
    if owner_url:schema['creator']['url']=absurl(owner_url)
    fullw=p.get('fullWidth') or 0;fullh=p.get('fullHeight') or 0
    picture=f'<img src="{h(image)}" width="{int(fullw) if str(fullw).isdigit() and int(fullw)>0 else 1000}" height="{int(fullh) if str(fullh).isdigit() and int(fullh)>0 else 1000}" alt="تصویر کامل {h(title)}" decoding="async" fetchpriority="high">' if image else '<p>تصویر این اثر در دسترس نیست.</p>'
    desc=text(p.get('desc')) or f'نمونه‌کار طراحی {title} از {owner} در انجمن ادیتوران شایسته.'
    main=f'''<article class="panel detail-card detail-main"><span class="eyebrow">نمونه‌کار انجمن</span><h1>{h(title)}</h1>
    <div class="meta-line"><span>طراح: {h(owner)}</span></div><figure class="detail-visual" style="margin:20px 0">{picture}</figure>
    <div class="rich-text"><h2>درباره این اثر</h2><p>{h(desc)}</p></div></article>'''
    more=f'<a href="{h(owner_url)}" class="btn btn-ghost">مشاهده پروفایل طراح ←</a>' if owner_url else ''
    dimensions=f'<div><dt>ابعاد فایل</dt><dd>{h(str(fullw))} × {h(str(fullh))} پیکسل</dd></div>' if fullw and fullh else ''
    side=f'''<div class="panel side-card"><h2>مشخصات اثر</h2><dl><div><dt>طراح</dt><dd>{h(owner)}</dd></div><div><dt>نوع عضویت</dt><dd>{'استاد' if role=='teacher' else 'هنرجو'}</dd></div>{dimensions}</dl>{more}<a class="btn btn-gold" href="/portfolio/">همه نمونه‌کارها ←</a></div>'''
    key=('cloud:' if is_cloud else 'legacy:')+str(p.get('id',''))
    side+=f'''<section class="panel vote-box" data-vote-key="{h(key)}"><h2>نظرت درباره این اثر چیه؟</h2><div class="vote-buttons"><button type="button" class="vote-btn" data-vote="1" aria-pressed="false" aria-label="لایک"><span aria-hidden="true">👍</span> <span class="vote-count">۰</span> لایک</button><button type="button" class="vote-btn" data-vote="-1" aria-pressed="false" aria-label="دیسلایک"><span aria-hidden="true">👎</span> <span class="vote-count">۰</span> دیسلایک</button></div><p class="vote-status" role="status" aria-live="polite">در حال دریافت آمار رأی…</p></section>'''
    body=f'<div class="wrap">{breadcrumbs(trail)}<div class="detail-grid">{main}<aside class="detail-side sidebar-stack">{side}</aside></div></div>'
    scripts='''<script src="/assets/aesh-config.js" defer></script><script src="/assets/aesh-core.js?v=3.25" defer></script><script src="/assets/aesh-page-votes.js?v=4.0" defer></script>'''
    return document(url,f'{title} | {owner} | AESH',f'{title}، اثر {owner}. {desc}',body,p.get('_og') or image,'article',schema,trail,extra_scripts=scripts,page_type='work')


def course_detail(p):
    title=p.get('title') or 'دوره آموزشی';url=url_for('course',p);desc=text(p.get('desc'))
    trail=[('خانه','/'),('دوره‌ها','/courses/'),(title,url)]
    # A course shares neither its cover nor its structured image with the course listing or any other page.
    cover='/assets/social/course/'+str(p.get('slug') or path_slug(title))+'.jpg'
    if not (ROOT/cover.lstrip('/')).is_file():
        cover=decode_picture(p.get('image'),'assets/courses/'+str(p.get('slug') or path_slug(title)))
    entity={'@type':'Course','@id':absurl(url)+'#course','name':title,'description':desc,'url':absurl(url),'inLanguage':'fa-IR',
            'provider':{'@type':'Organization','name':FACE,'url':ORIGIN+'/'}}
    if cover:entity['image']=absurl(cover)
    illustration=f'<figure class="detail-visual"><img src="{h(cover)}" width="1200" height="630" alt="تصویر اختصاصی دوره {h(title)}" decoding="async"></figure>' if cover else ''
    main=f'<article class="panel detail-card detail-main"><span class="eyebrow">آموزش تخصصی طراحی</span><h1>{h(title)}</h1><p class="detail-tagline">دوره آموزشی انجمن ادیتوران شایسته</p>{illustration}<div class="rich-text"><h2>معرفی دوره</h2><p>{h(desc)}</p></div></article>'
    detail=''.join(f'<div><dt>{label}</dt><dd>{h(p.get(k,""))}</dd></div>' for k,label in [('instructor','مدرس'),('duration','مدت دوره'),('level','سطح')] if p.get(k))
    side=f'<aside class="sidebar-stack"><section class="panel side-card"><h2>مشخصات دوره</h2><dl>{detail}</dl><a href="/courses/" class="btn btn-gold">بازگشت به دوره‌ها ←</a></section></aside>'
    body=f'<div class="wrap">{breadcrumbs(trail)}<div class="detail-grid">{main}{side}</div></div>'
    return document(url,title+' | دوره‌های AESH',desc,body,cover,'article',entity,trail,page_type='course')


def news_detail(p):
    title=p.get('title') or 'اطلاعیه انجمن';url=url_for('news',p);trail=[('خانه','/'),('اخبار','/news/'),(title,url)]
    image=p.get('_image')
    image_html=f'<figure class="detail-visual"><img src="{h(image)}" alt="تصویر خبر {h(title)}" width="900" height="620"></figure>' if image else ''
    main=f'<article class="panel detail-card detail-main"><span class="eyebrow">خبر و اطلاعیه</span><h1>{h(title)}</h1><p class="detail-tagline">{h(p.get("date",""))}</p>{image_html}<div class="rich-text"><p>{h(p.get("excerpt",""))}</p></div></article>'
    side='<aside class="sidebar-stack"><section class="panel side-card"><h2>اخبار انجمن</h2><a class="btn btn-ghost" href="/news/">بازگشت به اخبار ←</a></section></aside>'
    schema={'@type':'Article','@id':absurl(url)+'#article','headline':title,'description':text(p.get('excerpt')),'url':absurl(url),'publisher':{'@type':'Organization','name':FACE}}
    if image:schema['image']=absurl(image)
    return document(url,title+' | اخبار AESH',p.get('excerpt'),f'<div class="wrap">{breadcrumbs(trail)}<div class="detail-grid">{main}{side}</div></div>',p.get('_og') or image or '/assets/social/news.jpg','article',schema,trail,page_type='news-detail')


def featured_detail(p,people,works):
    title=p.get('title') or p.get('label') or 'برگزیده انجمن';url=url_for('featured',p);name=p.get('name') or ''
    pic=p.get('_image');desc=p.get('desc') or ''
    trail=[('خانه','/'),('برگزیده‌های انجمن','/'),(title,url)]
    picture=f'<div class="detail-visual"><img src="{h(pic)}" width="520" height="420" alt="تصویر برگزیده {h(title)}" decoding="async"></div>' if pic else ''
    main=f'<article class="panel detail-card detail-main"><span class="eyebrow">{h(p.get("label","برگزیده ماه"))}</span><h1>{h(title)}</h1><h2>{h(name)}</h2>{picture}<div class="rich-text"><p>{h(desc)}</p></div></article>'
    links=[]
    for role,persons in [('teacher',people['teachers']),('student',people['students'])]:
        for item in persons:
            if item.get('name','').replace(' ','')==name.replace(' ',''):links.append((item['name'],url_for(role,item)))
    side='<aside class="sidebar-stack"><div class="panel side-card"><h2>اطلاعات برگزیده</h2><p>'+h(p.get('label',''))+'</p>'
    for name_,u in links[:1]:side+=f'<a class="btn btn-ghost" href="{h(u)}">پروفایل {h(name_)} ←</a>'
    side+='<a class="btn btn-gold" href="/">بازگشت به خانه ←</a></div></aside>'
    return document(url,title+' | '+FACE,desc,f'<div class="wrap">{breadcrumbs(trail)}<div class="detail-grid">{main}{side}</div></div>',p.get('_og') or pic,'article',{'@type':'CreativeWork','name':title,'description':text(desc),'url':absurl(url),'image':absurl(pic) if pic else ORIGIN+'/favicon.png'},trail,page_type='featured')


def source_meta(original_path):
    soup=BeautifulSoup((ROOT/original_path).read_text('utf-8'),'html.parser')
    title=soup.title.get_text(' ',strip=True) if soup.title else ''
    m=soup.find('meta',attrs={'name':'description'})
    return title,str(m.get('content','')) if m else ''

def old_profile_fallback(role,slug,source):
    url='/'+role+'/'+slug+'/'
    title,desc=source_meta(source)
    typ='استاد' if role=='teacher' else 'هنرجو'
    name=title.split(' | ')[0] or slug.replace('-',' ')
    trail=[('خانه','/'),('اساتید' if role=='teacher' else 'هنرجویان','/teachers/' if role=='teacher' else '/students/'),(name,url)]
    # Precompute the destination to keep f-string syntax compatible with Python 3.11 on GitHub Actions.
    members_page = '/teachers/' if role == 'teacher' else '/students/'
    body=f'<div class="wrap">{breadcrumbs(trail)}<section class="panel detail-card"><span class="eyebrow">پروفایل {typ}</span><h1>{h(name)}</h1><p>{h(desc)}</p><p>اطلاعات این پروفایل در فهرست فعلی انجمن به‌روزرسانی نشده است.</p><a class="btn btn-ghost" href="{h(members_page)}">مشاهده فهرست اعضا ←</a></section></div>'
    return document(url,title or name,desc,body,'/favicon.png','profile',trail=trail,role=role,slug=slug,robots='noindex,follow')


def standard_section_data(data,section):
    k=section+'.title';desc=section+'.desc'
    return strip(data.get('content',{}).get(k)) or TITLES[section],strip(data.get('content',{}).get(desc))


def work_list(data):
    heading='نمونه‌کارهای انجمن';intro='آثار منتخب اساتید و هنرجویان؛ هر اثر با صفحه و لینک اختصاصی.'
    hero=section_hero('گالری آثار',heading,intro)
    toolbar=list_search('جستجو بر اساس نام اثر یا هنرمند…',[('all','همه آثار'),('teacher','آثار اساتید'),('student','آثار هنرجویان')])
    cards=''.join(work_card(p,'eager' if i<3 else 'lazy') for i,p in enumerate(data['portfolio']))
    body=hero+'<section class="section-pad"><div class="wrap">'+toolbar+'<div class="works-grid" id="listingGrid">'+cards+'</div>'+list_footer()+'<p class="muted" id="onlineStatus" role="status"></p></div></section>'
    scripts='<script src="/assets/aesh-config.js" defer></script><script src="/assets/aesh-core.js?v=3.25" defer></script>'
    return document('/portfolio/',heading+' | '+FACE,intro,body,'/assets/social/portfolio.jpg',trail=[('خانه','/'),(heading,'/portfolio/')],extra_scripts=scripts,page_type='portfolio')


def people_list(data,role):
    people=data['teachers' if role=='teacher' else 'students'];path='/teachers/' if role=='teacher' else '/students/'
    title,desc=standard_section_data(data,'teachers' if role=='teacher' else 'students')
    title=title or ('اساتید انجمن' if role=='teacher' else 'هنرجویان انجمن')
    body=section_hero('اعضای انجمن',title,desc)+'<section class="section-pad"><div class="wrap">'+list_search('جستجو در '+('اساتید' if role=='teacher' else 'هنرجویان')+'…')+f'<div class="people-grid" id="listingGrid">'+''.join(person_card(p,role) for p in people)+'</div>'+list_footer()+'</div></section>'
    scripts='<script src="/assets/aesh-config.js" defer></script><script src="/assets/aesh-core.js?v=3.25" defer></script>'
    return document(path,title+' | '+FACE,desc,body,'/assets/social/teachers.jpg' if role=='teacher' else '/assets/social/students.jpg',trail=[('خانه','/'),(title,path)],extra_scripts=scripts,page_type='teachers' if role=='teacher' else 'students')


def category_list(data,kind):
    path='/'+kind+'/';label,desc=standard_section_data(data,kind)
    type_='دوره‌های آموزشی' if kind=='courses' else 'اخبار انجمن' if kind=='news' else 'مسابقات و رویدادها'
    cards='';klass='courses-grid' if kind=='courses' else 'news-grid' if kind=='news' else 'courses-grid'
    if kind=='courses':cards=''.join(course_card(p) for p in data.get('courses',[]))
    elif kind=='news':cards=''.join(news_card(p) for p in data.get('news',[]))
    else:
        cards=''.join(f'<article class="course-card panel"><span class="tag">رویداد</span><h2>{h(p.get("title",""))}</h2><p>{h(p.get("desc",""))}</p></article>' for p in data.get('events',[]))
    if not cards:cards='<div class="panel notice-card"><h2>فعلاً رویدادی اعلام نشده است</h2><p>اطلاعیه رویدادهای بعدی انجمن در همین صفحه قرار می‌گیرد.</p></div>'
    toolbar=list_search('جستجو در '+type_+'…') if kind!='events' else ''
    grid_id=' id="listingGrid"' if kind!='events' else ''
    body=section_hero('انجمن ادیتوران شایسته',label,desc)+f'<section class="section-pad"><div class="wrap">{toolbar}<div class="{klass}"{grid_id}>{cards}</div>{list_footer() if kind!="events" else ""}</div></section>'
    return document(path,label+' | '+FACE,desc,body,'/assets/social/'+kind+'.jpg',trail=[('خانه','/'),(label,path)],page_type=kind)


def faq_page(data):
    path='/faq/';label,desc=standard_section_data(data,'faq')
    cards=''.join(f'<details class="panel"><summary>{h(row.get("question",""))}</summary><p>{h(row.get("answer",""))}</p></details>' for row in data.get('faqs',[]))
    body=section_hero('راهنمای انجمن',label,desc)+f'<section class="section-pad"><div class="wrap"><div class="faq-list">{cards}</div></div></section>'
    return document(path,label+' | '+FACE,desc,body,'/assets/social/faq.jpg',trail=[('خانه','/'),(label,path)],page_type='faq')


def rules_page(source,data):
    path='/rules/';label,desc=standard_section_data(data,'rules');source=soup_from(source)
    chunks=[]
    for card in source.select('#rulesPanelInternal article.rules-card'):
        title=card.find('h2');title_txt=title.get_text(' ',strip=True) if title else 'بخش قوانین'
        remainder=[]
        for el in card.find_all(['p','li'],recursive=True):
            s=el.get_text(' ',strip=True)
            if s:remainder.append('<p>'+h(s)+'</p>')
        chunks.append(f'<article class="panel rule-article"><h2>{h(title_txt)}</h2>'+''.join(remainder)+'</article>')
    legal=source.select_one('#rulesPanelLegal')
    if legal:
        chunks.append('<article class="panel rule-article"><h2>قوانین حقوقی و مسئولیت‌ها</h2>')
        for article in legal.select('article.legal-card'):
            chunks.append('<section>')
            t=article.find(['h2','h3']);chunks.append('<h2>'+h(t.get_text(' ',strip=True) if t else 'قانون حقوقی')+'</h2>')
            for para in article.find_all(['p','li']):chunks.append('<p>'+h(para.get_text(' ',strip=True))+'</p>')
            chunks.append('</section>')
        chunks.append('</article>')
    body=section_hero('مقررات انجمن',label,desc)+'<section class="section-pad"><div class="wrap"><div class="rules-articles">'+''.join(chunks)+'</div></div></section>'
    return document(path,label+' | '+FACE,desc,body,'/assets/social/rules.jpg',trail=[('خانه','/'),(label,path)],page_type='rules')


def about_page(data):
    path='/about/';label,desc=standard_section_data(data,'about')
    c=data.get('content',{});contents=[]
    title=text(c.get('about.hist.title'));contents.append('<h2>'+h(title or 'تاریخچه انجمن')+'</h2>')
    for k in ['about.hist.p1','about.hist.p2','about.hist.p3']:
        v=strip(c.get(k));
        if v:contents.append('<p>'+h(v)+'</p>')
    vision=text(c.get('about.vision.title'));contents.append('<h2>'+h(vision or 'چشم‌انداز و مأموریت')+'</h2>')
    for i in range(1,4):
        title=strip(c.get(f'about.v{i}.title'));body=strip(c.get(f'about.v{i}.text'))
        if title:contents.append('<h3>'+h(title)+'</h3>')
        if body:contents.append('<p>'+h(body)+'</p>')
    picture=data.get('_about_photo');img=f'<figure class="about-photo"><img src="{h(picture)}" alt="تصویر معرفی انجمن ادیتوران شایسته" loading="lazy" decoding="async" width="500" height="400"></figure>' if picture else ''
    body=section_hero('درباره ما',label,desc)+'<section class="section-pad"><div class="wrap"><article class="panel about-text rich-text">'+img+''.join(contents)+'</article></div></section>'
    return document(path,label+' | '+FACE,desc,body,'/assets/social/about.jpg',trail=[('خانه','/'),(label,path)],page_type='about')


def home_page(data):
    c=data.get('content',{});title=strip(c.get('home.title1',''))+strip(c.get('home.title2',''))+strip(c.get('home.title3',''))
    heading=h(title or 'جایی که خلاقیت به تصویر تبدیل می‌شود')
    stats=[('استاد',len(data['teachers']),'/teachers/'),('هنرجو',len(data['students']),'/students/'),('نمونه‌کار',len(data['portfolio']),'/portfolio/')]
    counters=''.join(f'<a class="stat" href="{path}"><strong>{count:n}</strong><span>{h(name)} در انجمن</span></a>' for name,count,path in stats)
    summaries=[('اساتید انجمن','آشنایی با اساتید و تخصص‌های آن‌ها','/teachers/'),('هنرجویان','آشنایی با هنرجویان و مسیر رشدشان','/students/'),('گالری آثار','مشاهده آثار هنری و طراحی با صفحه مخصوص هر اثر','/portfolio/'),('دوره‌های آموزشی','دوره‌های تخصصی و اطلاعات کامل هر دوره','/courses/'),('اطلاعیه‌ها','آخرین اخبار و اتفاق‌های انجمن','/news/'),('قوانین انجمن','آشنایی با قوانین و شرایط عضویت','/rules/')]
    tiles=''.join(f'<a class="feature-tile panel" href="{path}"><h3>{h(name)}</h3><p>{h(desc)}</p><strong>مشاهده بخش ←</strong></a>' for name,desc,path in summaries)
    f=data.get('featured') or []
    featured=''.join(f'<a class="feature-tile panel" href="{h(url_for("featured",item))}"><span class="tag">{h(item.get("label","برگزیده"))}</span>'+ (f'<img class="featured-thumb" src="{h(item.get("_image"))}" alt="تصویر برگزیده {h(item.get("title",""))}" width="440" height="220" loading="lazy">' if item.get('_image') else '')+f'<h3>{h(item.get("title",""))}</h3><p>{h(item.get("name",""))}</p><strong>مشاهده صفحه برگزیده ←</strong></a>' for item in f)
    intro=text(c.get('home.desc') or 'انجمن ادیتوران شایسته، جامعه‌ای تخصصی برای یادگیری ادیت و نمایش آثار هنری.')
    badge=text(c.get('home.badge') or 'مرجع ادیت تصویر در ایران')
    hero=f'''<section class="home-hero"><div class="wrap"><span class="eyebrow">{h(badge)}</span><h1>{heading}</h1><p>{h(intro)}</p><div class="hero-actions"><a class="btn btn-gold" href="https://rubika.ir/Editoran_Shayeste" target="_blank" rel="noopener noreferrer">عضویت در انجمن ↗</a><a class="btn btn-ink" href="/portfolio/">دیدن نمونه‌کارها ←</a><a class="btn btn-ghost" href="/teachers/">آشنایی با اساتید</a></div></div></section>'''
    body=hero+f'<div class="wrap stats-strip">{counters}</div><section class="section-pad"><div class="wrap"><div class="section-head"><div><span class="eyebrow">بخش‌های انجمن</span><h2>مسیر خودت رو پیدا کن</h2><p>هر بخش یک صفحه مستقل با محتوای مخصوص خودش داره.</p></div></div><div class="feature-links">{tiles}</div></div></section>'
    if f:body+='<section class="section-pad"><div class="wrap"><div class="section-head"><div><span class="eyebrow">'+h(strip(c.get('home.featured.label')) or 'منتخب انجمن')+'</span><h2>'+h(strip(c.get('home.featured.title')) or 'برگزیده‌های این ماه')+'</h2><p>'+h(strip(c.get('home.featured.desc')) or 'برای مشاهده جزئیات، وارد صفحه اختصاصی هر انتخاب شوید.')+'</p></div></div><div class="section-links">'+featured+'</div></div></section>'
    why=''.join('<article class="panel notice-card"><h3>'+h(strip(c.get(f'home.f{i}.title')))+'</h3><p>'+h(strip(c.get(f'home.f{i}.text')))+'</p></article>' for i in range(1,4) if strip(c.get(f'home.f{i}.title')))
    if why:body+='<section class="section-pad"><div class="wrap"><div class="section-head"><div><span class="eyebrow">'+h(strip(c.get('home.feat.label')) or 'ویژگی‌ها')+'</span><h2>'+h(strip(c.get('home.feat.title')) or 'چرا انجمن ما؟')+'</h2><p>'+h(strip(c.get('home.feat.desc')))+'</p></div></div><div class="feature-links">'+why+'</div></div></section>'
    about_intro=''.join('<p>'+h(strip(c.get(k)))+'</p>' for k in ['home.about.p1','home.about.p2'] if strip(c.get(k)))
    body+='<section class="section-pad"><div class="wrap"><div class="panel notice-card"><h2>'+h(strip(c.get('home.about.title')) or 'درباره انجمن ادیتوران شایسته')+'</h2>'+about_intro+'<a class="btn btn-ghost" href="/about/">بیشتر درباره انجمن ←</a></div></div></section>'
    awards=''.join('<article class="panel notice-card"><span class="tag">'+h(item.get('year',''))+'</span><h3>'+h(item.get('title',''))+'</h3><p>'+h(item.get('desc',''))+'</p></article>' for item in data.get('awards',[]) if item.get('title'))
    if awards:body+='<section class="section-pad"><div class="wrap"><div class="section-head"><div><span class="eyebrow">'+h(strip(c.get('home.awards.label')) or 'افتخارات')+'</span><h2>'+h(strip(c.get('home.awards.title')) or 'دستاوردهای انجمن')+'</h2><p>'+h(strip(c.get('home.awards.desc')))+'</p></div></div><div class="feature-links">'+awards+'</div></div></section>'
    if data.get('news'):
        body+='<section class="section-pad"><div class="wrap"><div class="section-head"><div><span class="eyebrow">'+h(strip(c.get('home.news.label')) or 'اخبار')+'</span><h2>'+h(strip(c.get('home.news.title')) or 'آخرین اخبار انجمن')+'</h2><p>'+h(strip(c.get('home.news.desc')))+'</p></div><a class="btn btn-ghost" href="/news/">همه اخبار ←</a></div><div class="news-grid">'+''.join(news_card(item) for item in data['news'][:3])+'</div></div></section>'
    contact_email=text(c.get('home.c3.val') or 'editoranShayeste@gmail.com')
    body+='<section class="section-pad"><div class="wrap"><div class="panel notice-card"><h2>'+h(strip(c.get('home.contact.title')) or 'راه‌های ارتباطی')+'</h2><p>برای پیگیری اخبار و ارتباط با انجمن:</p><a class="social-pill" href="https://rubika.ir/Editoran_Shayeste" rel="noopener noreferrer" target="_blank">روبیکای انجمن ↗</a> <a class="social-pill" href="mailto:'+h(contact_email)+'">'+h(contact_email)+'</a></div></div></section>'
    return document('/',FACE+' (AESH) | مرجع ادیت تصویر',intro,body,'/assets/social/home.jpg',trail=[('خانه','/')],page_type='home')


def soup_from(source):return BeautifulSoup(source,'html.parser')


def prepare_data():
    source=SOURCE.read_text('utf-8');soup=soup_from(source)
    embed=soup.find('script',id='embedded-data')
    if embed is None:raise ValueError('Studio has no embedded-data JSON. Stopping to avoid loss of content.')
    data=json.loads(embed.string or embed.text)
    assert isinstance(data.get('portfolio'),list) and isinstance(data.get('teachers'),list)
    # Only page-specific assets are decoded. Large global embedded JSON is never served on public pages.
    for group,role in [('teachers','teacher'),('students','student')]:
        for person in data[group]:
            person['slug']=str(person.get('slug') or path_slug(person.get('name')))
            person['_image']=decode_picture(person.get('image'),'assets/profiles/'+role+'/'+person['slug'])
            person['_og']='/assets/social/'+role+'/'+person['slug']+'.jpg'
            if not (ROOT/person['_og'].lstrip('/')).exists():person['_og']=person['_image']
            person['_works']=[]
    personindex={(role,p['slug']):p for role,k in [('teacher','teachers'),('student','students')] for p in data[k]}
    for i,work in enumerate(data['portfolio']):
        work['slug']=str(work.get('slug') or path_slug(work.get('title')))
        work['_image']=img_local(work.get('image'))
        work['_thumb']=img_local(work.get('thumb')) or work['_image']
        work['_og']='/assets/social/work/'+work['slug']+'.jpg'
        if not (ROOT/work['_og'].lstrip('/')).exists():work['_og']=work['_image']
        person=personindex.get((work.get('ownerType'),work.get('ownerSlug')))
        if person:person['_works'].append(work)
    for group,ext in [('news','news'),('featured','featured')]:
        for item in data[group]:
            item['_image']=decode_picture(item.get('image'),'assets/'+ext+'/'+str(item.get('id','item')))
            item['_og']='/assets/social/'+ext+'/'+str(item.get('id','item'))+'.jpg'
            if not (ROOT/item['_og'].lstrip('/')).exists():item['_og']=item['_image']
    for item in data.get('courses',[]):
        if 'پنج پوستر' in str(item.get('desc','')) and '8 پوستر' in str(item.get('title','')):
            item['desc'] = item['desc'].replace('پنج پوستر', 'پوسترهای')
    for item in data.get('portfolio',[]):
        if item.get('slug','').endswith('هدفون-jbl') and 'مرطوب' in str(item.get('desc','')):
            item['desc'] = 'نمونه‌کار پوستر تبلیغاتی هدفون JBL، طراحی گرافیکی از اعضای انجمن ادیتوران شایسته.'
    for group in ['news','courses']:
        for item in data.get(group,[]):
            item['slug']=str(item.get('slug') or path_slug(item.get('title')))
    data['_about_photo']=decode_picture(data.get('aboutPage'),'assets/pages/about') if str(data.get('aboutPage','')).startswith('data:') else ''
    if not data['_about_photo']:
        about_img=BeautifulSoup(data.get('aboutPage',''),'html.parser').find('img')
        if about_img:data['_about_photo']=decode_picture(about_img.get('src',''),'assets/pages/about')
    return source,data


def generate_missing_legacy_paths(data):
    # Preserve all existing URLs with published files, including retired accounts.
    canonical={(role,p['slug']) for role,k in [('teacher','teachers'),('student','students')] for p in data[k]}
    for typ in ['teacher','student']:
        for f in list((ROOT/typ).glob('*/index.html')):
            slug=decode_escapes(f.parent.name)
            if (typ,slug) not in canonical:
                dest=ROOT/typ/slug/'index.html'
                if not dest.exists() or 'aesh_reload' in dest.read_text('utf-8'):
                    old_profile_fallback(typ,slug,f.relative_to(ROOT))


def write_404():
    title='صفحه پیدا نشد | '+FACE
    body=section_hero('خطای ۴۰۴','این صفحه پیدا نشد','ممکن است آدرس اشتباه باشد یا صفحه از سایت حذف شده باشد.')
    body+='<section class="section-pad"><div class="wrap"><article class="panel notice-card"><h2>به مسیر درست برگردید</h2><p>از منو برای رفتن به بخش موردنظر استفاده کنید.</p><a class="btn btn-gold" href="/">بازگشت به صفحه اصلی ←</a></article></div></section>'
    # GitHub Pages will serve this file with real HTTP 404; never redirect unknown URLs to /.
    doc=f'<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{h(title)}</title><meta name="robots" content="noindex,follow"><link rel="icon" href="/favicon.png"><link rel="stylesheet" href="{CSS}"></head><body>{nav_items("/404/")}<main id="main">{body}</main>{footer()}<script src="{JS}" defer></script></body></html>'
    write_rel('404.html',doc)


def write_sitemap():
    # Stable lastmod per path, update only when the generated HTML file changes on a run.
    dest=ROOT/'sitemap.xml'
    old={}
    if dest.exists():
        try:
            x=ET.parse(dest)
            for node in x.getroot():
                loc=node.findtext(f'{{{NS}}}loc');lm=node.findtext(f'{{{NS}}}lastmod')
                if loc:old[loc]=lm
        except ET.ParseError:pass
    root=ET.Element(f'{{{NS}}}urlset')
    for path in sorted(ALL_URLS,key=lambda x:(x.count('/'),x)):
        loc=absurl(path);node=ET.SubElement(root,f'{{{NS}}}url')
        ET.SubElement(node,f'{{{NS}}}loc').text=loc
        # Source content has changed on first rebuild; later GitHub runs reuse savedAt or previous value.
        ET.SubElement(node,f'{{{NS}}}lastmod').text=(old.get(loc) if old.get(loc) and old.get(loc) != '2026-10-10' else DATE)
    ET.indent(root,space='  ')
    write_rel('sitemap.xml',ET.tostring(root,encoding='utf-8',xml_declaration=True))
    write_rel('robots.txt','User-agent: *\nAllow: /\nDisallow: /studio/\nDisallow: /members/\nSitemap: https://aesh.ir/sitemap.xml\n')


def write_alias_pages():
    """Windows-generated #UXXXX directories are not Persian routes. Preserve as nonindexed aliases."""
    changed=0
    for typ in ['teacher','student','work','course','news']:
        for file in (ROOT/typ).glob('*/index.html'):
            if '#U' not in file.parent.name:continue
            slug=decode_escapes(file.parent.name);destination='/'+typ+'/'+slug+'/'
            alias=f'''<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>انتقال به آدرس صحیح | AESH</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="{h(absurl(destination))}"><meta http-equiv="refresh" content="0;url={h(destination)}"></head><body dir="rtl"><p><a href="{h(destination)}">مشاهده صفحه اصلی این آدرس</a></p></body></html>'''
            write_rel(str(file.relative_to(ROOT)),alias);changed+=1
    return changed


def main():
    if not SOURCE.exists():raise SystemExit('Missing studio/index.html source, stopping safely')
    copied=normalize_asset_names()
    raw,data=prepare_data()
    home_page(data)
    for role in ['teacher','student']:
        people_list(data,role)
        for item in data['teachers' if role=='teacher' else 'students']:person_detail(item,role)
    work_list(data)
    for item in data['portfolio']:work_detail(item)
    for group in ['courses','events','news']:category_list(data,group)
    for item in data['courses']:course_detail(item)
    for item in data['news']:news_detail(item)
    for item in data.get('featured',[]):featured_detail(item,data,data['portfolio'])
    faq_page(data);rules_page(raw,data);about_page(data)
    generate_missing_legacy_paths(data)
    aliases=write_alias_pages()
    write_404();write_sitemap()
    print(f'AESH independent pages built: {len(NEW_HTML)} HTML; sitemap {len(ALL_URLS)} URLs; {copied} unicode asset aliases; {aliases} old route aliases.')
    return 0

if __name__=='__main__':sys.exit(main())
