#!/usr/bin/env python3
"""AESH v5: turn the original, approved DOM/CSS into page-specific static HTML.

Uses the original source kept in tools/aesh5-source.html; current editorial data comes
from editor/index.html (or --source). No network access or production writes.
"""
from __future__ import annotations
import argparse, base64, copy, hashlib, html, json, re, sys, unicodedata
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
SOURCE_TEMPLATE = ROOT/'tools/aesh5-source.html'
ROUTES = ['home','teachers','students','portfolio','courses','events','news','faq','rules','about']

# Exact page-level SEO from the approved AESH v3.23 routePageInfo registry.
# The nine non-home pages were also compared with their original standalone HTML.
# The approved index.html was captured while the old SPA showed /teachers/;
# the original routePageInfo('home') is the authoritative homepage SEO.
APPROVED_PAGE_SEO = {'home': ('انجمن ادیتوران شایسته (AESH) | مرجع ادیت تصویر',
          'انجمن ادیتوران شایسته (AESH)، مرجع معرفی اساتید و هنرجویان، نمونه\u200cکارهای ادیت تصویر، دوره\u200cها، مسابقات و '
          'اخبار تخصصی ادیت.',
          '/assets/social/home.jpg'),
 'teachers': ('اساتید انجمن ادیتوران شایسته | AESH',
              'فهرست اساتید حرفه\u200cای انجمن ادیتوران شایسته، تخصص\u200cها و پروفایل اختصاصی هر استاد.',
              '/assets/social/teachers.jpg'),
 'students': ('هنرجویان انجمن ادیتوران شایسته | AESH',
              'فهرست هنرجویان انجمن ادیتوران شایسته، تخصص\u200cها، پروفایل\u200cها و آثار آن\u200cها.',
              '/assets/social/students.jpg'),
 'portfolio': ('نمونه\u200cکارهای ادیت و طراحی | انجمن ادیتوران شایسته',
               'نمونه\u200cکارهای منتخب اساتید و هنرجویان انجمن ادیتوران شایسته در حوزه ادیت تصویر و طراحی گرافیک.',
               '/assets/social/portfolio.jpg'),
 'courses': ('دوره\u200cهای آموزش ادیت و طراحی | AESH',
             'دوره\u200cها و آموزش\u200cهای تخصصی ادیت تصویر و طراحی در انجمن ادیتوران شایسته.',
             '/assets/social/courses.jpg'),
 'events': ('مسابقات و رویدادهای ادیت | AESH',
            'مسابقات، چالش\u200cها و رویدادهای انجمن ادیتوران شایسته برای ادیتورها و طراحان.',
            '/assets/social/events.jpg'),
 'news': ('اخبار انجمن ادیتوران شایسته | AESH',
          'آخرین اخبار، اطلاعیه\u200cها و فعالیت\u200cهای انجمن ادیتوران شایسته.',
          '/assets/social/news.jpg'),
 'faq': ('سوالات متداول انجمن ادیتوران شایسته',
         'پاسخ به سوالات متداول درباره عضویت، فعالیت\u200cها و خدمات انجمن ادیتوران شایسته.',
         '/assets/social/faq.jpg'),
 'rules': ('قوانین انجمن ادیتوران شایسته',
           'قوانین داخلی، مقررات حقوقی و حدود مسئولیت\u200cها در انجمن ادیتوران شایسته.',
           '/assets/social/rules.jpg'),
 'about': ('درباره انجمن ادیتوران شایسته | AESH',
           'معرفی انجمن ادیتوران شایسته، اهداف، فعالیت\u200cها و جامعه تخصصی ادیت تصویر.',
           '/assets/social/about.jpg')}

NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
ET.register_namespace('',NS)
H=lambda value: html.escape(str(value or ''),quote=True)
DATA_RX=re.compile(r'data:image/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)',re.I)
HEX_RX=re.compile(r'#U([0-9a-fA-F]{4})')

def text(v,lim=0):
    t=BeautifulSoup(str(v or ''),'html.parser').get_text(' ',strip=True)
    return t[:lim-1]+'…' if lim and len(t)>lim else t

def persian_slug(s):
    s=str(s or '').lower().strip().replace('ي','ی').replace('ى','ی').replace('ك','ک').replace('آ','ا').replace('أ','ا').replace('إ','ا').replace('ؤ','و').replace('ة','ه').replace('\u200c',' ')
    s=''.join(str('۰۱۲۳۴۵۶۷۸۹'.index(x)) if x in '۰۱۲۳۴۵۶۷۸۹' else x for x in s)
    return re.sub('-+','-',re.sub('[^a-z0-9\u0600-\u06ff]+','-',s)).strip('-')[:90]

def slug(kind,item):return str(item.get('slug') or (item.get('id') if kind=='featured' else '') or persian_slug(item.get('title') or item.get('name') or ''))
def path_for(kind,item):return '/'+kind+'/'+quote(slug(kind,item),safe='-')+'/'
def plainpath(kind,item):return '/'+kind+'/'+slug(kind,item)+'/'

def load_json_from_page(fn):
    doc=BeautifulSoup(fn.read_text('utf-8'),'html.parser')
    script=doc.find(id='embedded-data')
    if not script or not script.string:raise RuntimeError('embedded-data missing in '+str(fn))
    return json.loads(script.string)

def write(path,content):
    path.parent.mkdir(parents=True,exist_ok=True)
    payload=content if isinstance(content,bytes) else content.encode('utf-8')
    if not path.exists() or path.read_bytes()!=payload:path.write_bytes(payload)

_known_assets={}
def scan_assets():
    for f in (ROOT/'assets').rglob('*'):
        if f.is_file() and f.suffix.lower() in ('.webp','.png','.jpg','.jpeg','.gif'):
            try: _known_assets[hashlib.sha256(f.read_bytes()).hexdigest()]=f
            except OSError:pass

def image_asset(raw):
    if not isinstance(raw,str) or not raw:return ''
    raw=raw.strip()
    if raw.startswith('https://aesh.ir/'):return raw.removeprefix('https://aesh.ir')
    if raw.startswith(('https://','http://','blob:')):return raw
    match=DATA_RX.fullmatch(raw)
    if match:
        try:data=base64.b64decode(match.group(2),validate=True)
        except Exception:return ''
        if not data or len(data)>20_000_000:return ''
        sha=hashlib.sha256(data).hexdigest()
        if sha in _known_assets:return '/'+str(_known_assets[sha].relative_to(ROOT))
        ext={'jpeg':'jpg','jpg':'jpg'}.get(match.group(1).lower(),match.group(1).lower())
        f=ROOT/'assets/content'/f'{sha[:20]}.{ext}'
        write(f,data);_known_assets[sha]=f
        return '/'+str(f.relative_to(ROOT))
    if raw.startswith('#'):return raw
    if raw.startswith('/'):return raw
    return '/'+raw.removeprefix('./')

def rewrite_data_images(markup):
    # Eliminates large inlined bitmaps and reuses the exact original pixels.
    return DATA_RX.sub(lambda m:image_asset(m.group(0)),markup)

def fragment(el,markup):
    el.clear()
    s=BeautifulSoup(markup,'html.parser')
    for child in list(s.contents):el.append(child)

def set_content_value(el,value):
    if value is None:return
    if el.name in ('input','textarea'):
        if el.name=='input':el['value']=str(value)
        else:el.string=str(value)
    elif '<' in str(value) and '>' in str(value):fragment(el,str(value))
    else:el.string=str(value)

def page_data_dom(node,data):
    for x in node.find_all(attrs={'data-key':True}):
        key=x['data-key']
        if key in data.get('content',{}):set_content_value(x,data['content'][key])
    for key,attr in [('aboutHome','aboutHome'),('aboutPage','aboutPage')]:
        x=node.find(id=key)
        if x and isinstance(data.get(attr),str):fragment(x,data[attr])

def person_card(p,kind):
    teacher=kind=='teacher';img=image_asset(p.get('image'));role=p.get('role') or 'بدون دسته‌بندی'
    badge=p.get('badge') or ('استاد' if teacher else 'هنرجو'); name=p.get('name') or 'بدون نام'
    stat=''.join(f'<div class="stat-mini"><div class="stat-mini-v">{H(s.get("value"))}</div><div class="stat-mini-l">{H(s.get("label"))}</div></div>' for s in p.get('stats',[]))
    picture=f'<img src="{H(img)}" alt="تصویر {H(name)}" loading="lazy" decoding="async">' if img else f'<i class="fas {"fa-user-tie" if teacher else "fa-user-graduate"}" aria-hidden="true"></i>'
    return f'''<div class="person-card" data-pid="{H(p.get('id'))}" data-slug="{H(slug(kind,p))}">
      <a class="person-card-link" href="{H(path_for(kind,p))}" aria-label="مشاهده پروفایل {H(name)}" title="مشاهده پروفایل کامل"></a>
      <div class="person-media"><span class="person-badge">{H(badge)}</span>{picture}</div>
      <div class="person-body"><div class="person-name">{H(name)}</div><span class="person-role">{H(role)}</span><p class="person-bio">{H(p.get('bio'))}</p><div class="person-stats">{stat}</div></div></div>'''

def portfolio_card(item,people,loading='lazy'):
    own=(item.get('ownerType') or 'student');owner=people.get((own,item.get('ownerSlug'))) or {}
    name=owner.get('name') or item.get('ownerName') or 'بدون نام'
    title=item.get('title') or 'بدون عنوان';img=image_asset(item.get('thumb') or item.get('image'));full=image_asset(item.get('image'))
    media=(f'<div class="portfolio-card-media portfolio-loading" data-src="{H(img)}" data-alt="{H(title)}" data-full-src="{H(full)}" data-full-width="{H(item.get("fullWidth") or 0)}" data-full-height="{H(item.get("fullHeight") or 0)}"></div>' if img else '<div class="portfolio-card-media"><div class="portfolio-ph"><i class="fas fa-image"></i></div></div>')
    w,h=item.get('fullWidth'),item.get('fullHeight');dim=f'{H(w)}×{H(h)}' if str(w or '0').isdigit() and str(h or '0').isdigit() and int(w or '0')>0 and int(h or '0')>0 else 'ابعاد نامشخص'
    return f'''<article class="portfolio-card" data-item-id="{H(item.get('id'))}" data-aesh-cloud-id="{H(str(item.get('id') or '').removeprefix('cloud-') if item.get('_aesh_cloud') else '')}" data-slug="{H(slug('work',item))}" data-cloud-pending="{'true' if item.get('_aesh_cloud') else 'false'}" data-owner-type="{H(own)}">
    <a class="portfolio-card-link" href="{H(path_for('work',item))}" aria-label="مشاهده {H(title)}"></a>{media}
    <div class="portfolio-card-body"><div class="portfolio-card-topline"><span class="portfolio-card-type">{"اثر استاد" if own=='teacher' else "اثر هنرجو"}</span><span class="portfolio-card-dim">{dim}</span></div><div class="portfolio-card-title">{H(title)}</div><div class="portfolio-card-owner">{H(name)}</div><div class="portfolio-card-more"><span>مشاهده صفحه اثر</span><i class="fas fa-arrow-left"></i></div></div></article>'''

def item_card(item,kind):
    title=H(item.get('title'));ident=H(item.get('id'));href=H(path_for(kind,item))
    if kind=='news':
        media=f'<img loading="lazy" decoding="async" src="{H(image_asset(item.get("image")))}" alt="{title}">' if item.get('image') else '<i class="fas fa-newspaper"></i>'
        return f'''<div class="news-card" data-item-id="{ident}"><a class="route-card-link" href="{href}" aria-label="مشاهده {title}"></a><div class="news-media">{media}</div><div class="news-body"><div class="news-date"><i class="fas fa-calendar"></i> {H(item.get('date'))}</div><h3 class="news-title">{title}</h3><p class="news-exc">{H(item.get('excerpt'))}</p></div></div>'''
    if kind=='course':
        return f'''<div class="course-card" data-item-id="{ident}"><a class="route-card-link" href="{href}" aria-label="مشاهده {title}"></a><div class="course-head"><h3>{title}</h3><span class="course-level">{H(item.get('level'))}</span></div><div class="course-body"><p class="course-desc">{H(item.get('desc'))}</p><div class="course-meta"><span><i class="fas fa-user-tie"></i> {H(item.get('instructor'))}</span><span><i class="fas fa-clock"></i> {H(item.get('duration'))}</span></div></div></div>'''
    status=item.get('status');st={'active':'در حال برگزاری','done':'پایان یافته'}.get(status,'به زودی')
    return f'''<div class="event-card" data-item-id="{ident}"><a class="route-card-link" href="{href}" aria-label="مشاهده {title}"></a><div class="event-date"><span class="event-day">{H(item.get('day'))}</span><span class="event-month">{H(item.get('month'))}</span></div><div class="event-info"><h3>{title}</h3><p>{H(item.get('desc'))}</p><span class="event-prize"><i class="fas fa-gift"></i> {H(item.get('prize'))}</span></div><span class="event-status {H(status or 'soon')}">{st}</span></div>'''

def featured_card(f):
    img=image_asset(f.get('image'));name=f.get('name') or f.get('title') or 'برگزیده'
    media=f'<img loading="lazy" decoding="async" src="{H(img)}" alt="{H(name)}">' if img else '<div class="featured-card-placeholder"><i class="fas fa-star"></i></div>'
    return f'''<article class="featured-card" data-item-id="{H(f.get('id'))}"><a class="featured-card-link" href="{H(path_for('featured',f))}" aria-label="مشاهده کامل {H(name)}" title="مشاهده کامل"></a><div class="featured-card-media">{media}</div><div class="featured-card-content"><span class="featured-label">{H(f.get('label') or 'برگزیده')}</span><div class="featured-title">{H(f.get('title') or 'برگزیده انجمن')}</div><div class="featured-name">{H(f.get('name') or 'هنوز انتخاب نشده')}</div><div class="featured-desc">{H(f.get('desc'))}</div><div class="featured-more"><span>مشاهده کامل</span><i class="fas fa-arrow-left"></i></div></div></article>'''

def get_people(d):return {(kind,p.get('slug')):p for kind,key in [('teacher','teachers'),('student','students')] for p in d[key]}

def listing_content(section,node,d):
    people=get_people(d)
    def replace(id,markup):
        el=node.find(id=id)
        if not el:raise RuntimeError('missing DOM slot '+id)
        fragment(el,markup)
    if section=='home':
        replace('statsGrid',''.join(f'''<div class="stat-box" data-item-id="{H(s.get('id'))}"><i class="{H(s.get('icon') or 'fas fa-star')}"></i><div class="stat-num" data-counter="{H(s.get('value'))}">{H(s.get('value'))}</div><div class="stat-lbl">{H(s.get('label'))}</div></div>''' for s in d.get('stats',[])))
        replace('featuredGrid',''.join(featured_card(x) for x in d['featured'][:3]))
        replace('awardsGrid',''.join(f'''<div class="award-card" data-item-id="{H(a.get('id'))}"><span class="award-icon">{H(a.get('icon'))}</span><div><span class="award-year">{H(a.get('year'))}</span></div><div class="award-title">{H(a.get('title'))}</div><div class="award-desc">{H(a.get('desc'))}</div></div>''' for a in d.get('awards',[])))
        replace('newsPreview',''.join(item_card(x,'news') for x in list(reversed(d['news']))[:3]))
    elif section in ('teachers','students'):
        typ='teacher' if section=='teachers' else 'student'
        replace(section+'Grid',''.join(person_card(x,typ) for x in d[section]))
    elif section=='portfolio':
        cards=[portfolio_card(x,people) for x in d['portfolio']]
        replace('portfolioGrid',''.join(cards))
        for i,c in enumerate(node.select('#portfolioGrid .portfolio-card')):
            if i>=12:c['data-more-hidden']='true'
        count=node.find(id='portfolioCount')
        if count:count.string=str(len(d['portfolio']))+' اثر'
        note=node.select_one('.portfolio-admin-note')
        if note:note.decompose() # only shown to the owner in editor, not part of public site
    elif section=='courses':replace('coursesGrid',''.join(item_card(x,'course') for x in d['courses']))
    elif section=='events':replace('eventsList',''.join(item_card(x,'event') for x in d['events']))
    elif section=='news':replace('newsGrid',''.join(item_card(x,'news') for x in reversed(d['news'])))
    elif section=='faq':replace('faqList',''.join(f'''<div class="faq-item" data-item-id="{H(f.get('id'))}"><div class="faq-q"><span>{H(f.get('question'))}</span><i class="fas fa-chevron-down faq-chev"></i></div><div class="faq-a"><span>{H(f.get('answer'))}</span></div></div>''' for f in d['faqs']))
    page_data_dom(node,d)
    if section=='about':
        reviews="""<section class="aesh-reviews-section container" id="aeshReviews" aria-labelledby="aeshReviewsTitle">
          <div class="section-head"><div class="section-label">صدای اعضا</div><h2 class="section-title" id="aeshReviewsTitle">نظرات درباره انجمن ادیتوران شایسته</h2></div>
          <p>نظر شما پیش از نمایش در سایت توسط مدیریت بررسی می‌شود.</p>
          <form class="aesh-review-form" autocomplete="on">
            <label>نام نمایشی <input name="display_name" required minlength="2" maxlength="70"></label>
            <label>متن نظر <textarea name="body" required minlength="5" maxlength="1200" rows="4"></textarea></label>
            <label class="aesh-reviews-honey" aria-hidden="true">وب‌سایت<input name="website" tabindex="-1" autocomplete="off"></label>
            <button type="submit" class="btn btn-primary">ارسال نظر برای بررسی</button>
          </form>
          <p data-reviews-message role="status" aria-live="polite"></p>
          <h3>نظرات تأییدشده</h3><div class="aesh-reviews-grid" data-reviews-list></div>
        </section>"""
        for tag in BeautifulSoup(reviews,'html.parser').contents:node.append(tag)
    return node

def generic_detail_meta(kind,item):
    if kind in ('teacher','student'):
        n=item.get('name') or 'عضو انجمن';r='استاد' if kind=='teacher' else 'هنرجو'
        return n+' | '+r+' انجمن ادیتوران شایسته',text((item.get('role') or '')+' — '+(item.get('bio') or ''),200),image_asset(item.get('image'))
    if kind=='work':
        t=item.get('title') or 'نمونه‌کار';n=item.get('ownerName') or ''
        return t+' | '+n+' | AESH',text(n+' — '+(item.get('desc') or ''),220),image_asset(item.get('image'))
    if kind=='featured':return str(item.get('title') or 'برگزیده')+' | AESH',text(item.get('desc') or ''),image_asset(item.get('image'))
    if kind=='news':return str(item.get('title') or 'خبر')+' | AESH',text(item.get('excerpt') or ''),image_asset(item.get('image'))
    return str(item.get('title') or 'دوره')+' | AESH',text(item.get('desc') or ''),image_asset(item.get('image'))

def replace_tag_id(root,id,value):
    x=root.find(id=id)
    if x:x.string=str(value or '')

def profile_detail(base,item,kind,d,selections):
    src=base.find(id='profileView').select_one('.profile-dialog')
    node=copy.deepcopy(src);node.attrs.pop('role',None);node.attrs.pop('aria-modal',None)
    t=kind=='teacher';name=item.get('name') or 'بدون نام';role=item.get('role') or 'بدون دسته‌بندی';badge=item.get('badge') or ('استاد' if t else 'هنرجو')
    for attr,value in [('profileName',name),('profileKicker','معرفی استاد انجمن' if t else 'معرفی هنرجوی انجمن'),('profileBio',item.get('bio') or 'برای این عضو هنوز توضیحی ثبت نشده است.')]:replace_tag_id(node,attr,value)
    n=node.find(id='profileName');n.name='h1'
    r=node.find(id='profileRole');fragment(r,f'<i class="fas {"fa-wand-magic-sparkles" if t else "fa-palette"}"></i><span>{H(role)}</span>')
    img=image_asset(item.get('image'))
    cover=node.find(id='profilePhoto')
    cover.attrs.pop('style',None)
    if img:cover['style']='--profile-bg:url("'+img+'")'
    fragment(cover,f'<span class="profile-badge" id="profileBadge">{H(badge)}</span>'+(f'<img class="profile-cover-img" src="{H(img)}" alt="کاور {H(name)}" decoding="async">' if img else f'<i class="fas {"fa-user-tie" if t else "fa-user-graduate"}"></i>')+f'<div class="profile-photo-mark"><strong>{"پروفایل رسمی استاد" if t else "پروفایل رسمی هنرجو"}</strong></div>')
    avatar=node.find(id='profileAvatar');fragment(avatar,f'<img src="{H(img)}" alt="تصویر {H(name)}" decoding="async">' if img else '<i class="fas fa-user"></i>')
    stats=item.get('stats') or []
    fragment(node.find(id='profileStats'),''.join(f'<div class="profile-stat"><div class="profile-stat-v">{H(x.get("value") or "—")}</div><div class="profile-stat-l">{H(x.get("label") or "آمار")}</div></div>' for x in stats) or '<div class="profile-stat"><div class="profile-stat-v">—</div><div class="profile-stat-l">آماری ثبت نشده</div></div>')
    chart=item.get('chart') or {};replace_tag_id(node,'profileChartTitle',chart.get('title') or 'نمودار عملکرد')
    vals=[]
    for x in chart.get('items',[]):
        value=str(x.get('value') or '0').translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹','0123456789'))
        m=re.search(r'-?\d+(?:\.\d+)?',value)
        val=max(0,min(100,float(m.group()) if m else 0))
        vals.append(f'<div class="profile-chart-row"><div class="profile-chart-label">{H(x.get("label") or "آمار")}</div><div class="profile-chart-track"><div class="profile-chart-fill" style="width:{val:g}%" data-width="{val:g}"></div></div><div class="profile-chart-value">{val:g}%</div></div>')
    fragment(node.find(id='profileChart'),''.join(vals) if vals else '<div class="profile-chart-empty">هنوز آماری برای نمودار این عضو ثبت نشده است.</div>')
    ext=item.get('extra') or {}
    if isinstance(ext,str):
        try:ext=json.loads(ext)
        except:ext={}
    fields=[('تاریخ عضویت','joinDate'),('مهارت‌ها','skills'),('رتبه در انجمن','rank'),('وضعیت همکاری','availability')]
    extra=''.join(f'<div class="profile-extra-item"><small>{H(label)}</small><strong>{H(ext.get(key))}</strong></div>' for label,key in fields if str(ext.get(key) or '').strip())
    fragment(node.find(id='profileExtraGrid'),extra or '<div class="profile-extra-empty">اطلاعات تکمیلی هنوز ثبت نشده است.</div>')
    achievements=node.find(id='profileAchievements')
    if ext.get('achievements'):
        achievements.attrs.pop('style',None);fragment(achievements,'<strong style="display:block;color:var(--text);margin-bottom:4px">افتخارات شخصی</strong>'+H(ext['achievements']))
    else:achievements['style']='display:none';fragment(achievements,'')
    actions=[]
    if str(ext.get('rubika') or '').strip():
        ru=str(ext['rubika']).strip();ru=ru if ru.startswith('https://') else 'https://rubika.ir/'+ru.lstrip('@')
        actions.append(f'<a class="profile-action" rel="noopener" target="_blank" href="{H(ru)}"><i class="fas fa-comment-dots"></i> ارتباط در روبیکا</a>')
    if str(ext.get('portfolio') or '').strip():
        po=str(ext['portfolio']).strip()
        if po.startswith(('https://','/')):actions.append(f'<a class="profile-action" href="{H(po)}"><i class="fas fa-images"></i> مشاهده نمونه‌کارها</a>')
    fragment(node.find(id='profileActions'),''.join(actions))
    close=node.find(id='profileClose');close.name='a';close.attrs.pop('onclick',None);close['href']='/teachers/' if t else '/students/';close['aria-label']='بازگشت به فهرست'
    ret=BeautifulSoup('<main class="aesh-detail-page" id="main-content"></main>','html.parser').main
    ret.append(node)
    if t:
        # Approved online works are fetched LIVE; archived cloud snapshots never imply
        # that the owner still publishes them. Static works remain available offline.
        static_works=[w for w in d['portfolio'] if w.get('ownerType')=='teacher'
          and w.get('ownerSlug')==item.get('slug') and not w.get('_aesh_cloud')]
        # Source order is the only honest fallback when original timestamps are absent.
        dated=[w for w in static_works if w.get('published_at') or w.get('created_at')]
        undated=[w for w in static_works if w not in dated]
        dated.sort(key=lambda w:str(w.get('published_at') or w.get('created_at') or ''),reverse=True)
        works=(dated+undated)[:8]
        gallery='<section class="teacher-best-gallery" id="aeshTeacherRecentWorks"><div class="container"><div class="section-head"><div class="section-label">تازه‌ترین نمونه‌کارها</div><h2 class="section-title">۸ نمونه‌کار اخیر این استاد</h2></div>'
        gallery+='<div class="portfolio-grid" id="aeshTeacherRecentGrid">'+''.join(portfolio_card(x,get_people(d)) for x in works)+'</div>'
        gallery+='<p class="teacher-best-empty" id="aeshTeacherWorksEmpty"'+(' hidden' if works else '')+'>هنوز نمونه‌کاری برای این استاد ثبت نشده است.</p>'
        gallery+='</div></section>'
        for tag in BeautifulSoup(gallery,'html.parser').contents:ret.append(tag)
        # Page-local static data only: no downloads of unrelated members/works.
        mini=[{'id':str(w.get('id')),'slug':slug('work',w),'title':str(w.get('title') or ''),
            'image':image_asset(w.get('thumb') or w.get('image')),
            'owner_role':'teacher','owner_slug':str(item.get('slug') or ''),
            'created_at':str(w.get('published_at') or w.get('created_at') or ''),
            'width':w.get('fullWidth') or 0,'height':w.get('fullHeight') or 0} for w in static_works]
        script=BeautifulSoup('<script type="application/json" id="aeshTeacherStaticWorks"></script>','html.parser').script
        script.string=json.dumps(mini,ensure_ascii=False).replace('<','\\u003c').replace('>','\\u003e')
        ret.append(script)
    return ret

def work_detail(base,item,d):
    src=base.find(id='portfolioView').select_one('.portfolio-dialog')
    node=copy.deepcopy(src);node.attrs.pop('role',None);node.attrs.pop('aria-modal',None)
    image=image_asset(item.get('image'));title=item.get('title') or 'بدون عنوان';name=item.get('ownerName') or 'بدون نام'
    owner=get_people(d).get((item.get('ownerType'),item.get('ownerSlug')))
    if owner:name=owner.get('name') or name
    replace_tag_id(node,'portfolioDetailType','اثر استاد' if item.get('ownerType')=='teacher' else 'اثر هنرجو')
    replace_tag_id(node,'portfolioDetailTitle',title);node.find(id='portfolioDetailTitle').name='h1'
    replace_tag_id(node,'portfolioDetailOwner',name)
    replace_tag_id(node,'portfolioDetailDesc',item.get('desc') or 'برای این نمونه‌کار توضیحی ثبت نشده است.')
    fragment(node.find(id='portfolioDetailMedia'),f'<img src="{H(image)}" alt="{H(title)}" decoding="async" fetchpriority="high" data-original-width="{H(item.get("fullWidth") or 0)}" data-original-height="{H(item.get("fullHeight") or 0)}">' if image else '<div class="portfolio-ph"><i class="fas fa-image"></i></div>')
    ol=node.find(id='portfolioOwnerLink');ol.attrs.pop('onclick',None)
    if owner:
        ol.attrs.pop('style',None);ol['href']=path_for(item.get('ownerType'),owner)
    else:
        ol['style']='display:none';ol['href']='/portfolio/'
    close=node.select_one('.portfolio-detail-close');close.name='a';close.attrs.pop('onclick',None);close['href']='/portfolio/';close['aria-label']='بازگشت به گالری'
    ret=BeautifulSoup('<main class="aesh-detail-page" id="main-content"></main>','html.parser').main
    ret.append(node)
    return ret

def featured_detail(base,item):
    node=copy.deepcopy(base.find(id='featuredView').select_one('.featured-dialog'))
    for k,v in [('featuredDetailTitle',item.get('title')),('featuredDetailLabel',item.get('label')),('featuredDetailName',item.get('name')),('featuredDetailDesc',item.get('desc'))]:replace_tag_id(node,k,v)
    node.find(id='featuredDetailTitle').name='h1'
    img=image_asset(item.get('image'))
    fragment(node.find(id='featuredDetailMedia'),f'<img src="{H(img)}" alt="{H(item.get("title"))}" decoding="async">' if img else '<div class="featured-detail-placeholder"><i class="fas fa-star"></i></div>')
    close=node.select_one('.featured-view-close');close.name='a';close.attrs.pop('onclick',None);close['href']='/'
    node.attrs.pop('role',None);node.attrs.pop('aria-modal',None)
    ret=BeautifulSoup('<main class="aesh-detail-page" id="main-content"></main>','html.parser').main;ret.append(node)
    return ret

def simple_detail(kind,item):
    title=item.get('title') or 'جزئیات';card=item_card(item,kind)
    name={'course':'دوره‌ها','news':'اخبار','event':'رویدادها'}[kind]
    container=f'''<main class="aesh-item-page" id="main-content"><div class="container"><h1>{H(title)}</h1><div class="aesh-item-original">{card}</div><a class="btn btn-outline" href="/{name_map(kind)}/">بازگشت به {name}</a></div></main>'''
    return BeautifulSoup(container,'html.parser').main

def name_map(kind):return {'course':'courses','news':'news','event':'events'}[kind]

sitemap_original={}
def all_legacy_files():
    paths={}
    for typ in ('teacher','student','work','course','news','featured'):
        folder=ROOT/typ
        if folder.exists():
            for f in folder.glob('*/index.html'):paths[str(f.relative_to(ROOT))]=f.read_text('utf-8')
    return paths

def seo_identity_graph(canonical,title,description):
    origin='https://aesh.ir/'
    organization={'@type':'Organization','@id':origin+'#organization',
      'name':'انجمن ادیتوران شایسته','alternateName':'AESH','url':origin,
      'logo':{'@type':'ImageObject','url':origin+'favicon.png','width':144,'height':144}}
    website={'@type':'WebSite','@id':origin+'#website','url':origin,
      'name':'انجمن ادیتوران شایسته','alternateName':['AESH','انجمن شایسته'],
      'inLanguage':'fa-IR','publisher':{'@id':organization['@id']}}
    page={'@type':'WebPage','@id':canonical+'#webpage','url':canonical,
      'name':title,'description':description,'inLanguage':'fa-IR',
      'isPartOf':{'@id':website['@id']},'about':{'@id':organization['@id']}}
    return {'@context':'https://schema.org','@graph':[organization,website,page]}

def old_metadata(source):
    dom=BeautifulSoup(source,'html.parser')
    desc=dom.find('meta',attrs={'name':'description'})
    return text(dom.title.string if dom.title and dom.title.string else 'AESH'),text(desc.get('content') if desc else '')

def normalize_anchors(soup,kind):
    for x in soup.find_all('a',href=True):
        v=x['href'];
        if not (ROOT/'CNAME').exists() and v.startswith('https://aesh.ir/'):
            x['href']=v.removeprefix('https://aesh.ir') or '/'
            v=x['href']
        if v=='./':x['href']='/'
        elif re.match(r'^(teachers|students|portfolio|courses|events|news|faq|rules|about)/?$',v):x['href']='/'+v.strip('/')+'/'
        elif v.startswith(('teacher/','student/','work/','course/','featured/')):x['href']='/'+v
        if x.get('onclick') and ('handleSiteLink(' in x['onclick'] or 'navigateRoute(' in x['onclick']):x.attrs.pop('onclick',None)
    for x in soup.select('[data-page]'):
        if x.name=='a' and x.get('data-page'):
            target=x.get('data-page')
            x['class']=[c for c in x.get('class',[]) if c!='active']
            if target==kind or (kind in ('teacher','student','work','course','featured') and target=={'teacher':'teachers','student':'students','work':'portfolio','course':'courses','featured':'home'}[kind]):x['class']=x.get('class',[])+['active']

def page_dom(original,section,d,sel):
    node=copy.deepcopy(original.find(id='page-'+section));node['class']=[c for c in node.get('class',[]) if c!='active']+['active']
    return listing_content(section,node,d)

def base_html(original,body,route,kind,metadata,d,legacy_doc=None,identity=None):
    # Keep the EXACT approved header, footer, colors, fonts, hover states, animation and responsive CSS.
    doc=copy.deepcopy(original)
    head=doc.head
    csp=head.find('meta',attrs={'http-equiv':'Content-Security-Policy'})
    if csp and csp.get('content'):csp['content']=csp['content'].replace("frame-src 'none'","frame-src 'self'")
    for t in list(head.find_all(['script','style'])):t.decompose()
    link=head.select_one('link[href="assets/aesh-performance.css"]')
    css=doc.new_tag('link',rel='stylesheet',href='/assets/aesh-site.css?v=5.0.3')
    if link:link.insert_before(css)
    else:head.append(css)
    head.append(doc.new_tag('link',rel='stylesheet',href='/assets/aesh-pages.css?v=5.0.3'))
    head.append(doc.new_tag('link',rel='stylesheet',href='/assets/aesh5-extras.css?v=5.0'))
    title,desc,img=metadata
    # Existing static SEO metadata gives the most precise titles and actual share images.
    if legacy_doc:
        old=BeautifulSoup(legacy_doc,'html.parser')
        if old.title and old.title.string: title=old.title.string
        md=old.find('meta',attrs={'name':'description'})
        if md and md.get('content'):desc=md['content']
        og=old.find('meta',attrs={'property':'og:image'})
        if og and og.get('content') and not img:img=og['content']
    doc.title.string=title
    def setmeta(selector,attr,val):
        x=head.select_one(selector)
        if x:x[attr]=str(val)
    canonical='https://aesh.ir'+route
    setmeta('#canonicalLink','href',canonical)
    setmeta('#alternateFa','href',canonical);setmeta('#alternateDefault','href',canonical)
    setmeta('#metaDescription','content',desc)
    for tag in ('#ogTitle','#twitterTitle'):setmeta(tag,'content',title)
    for tag in ('#ogDescription','#twitterDescription'):setmeta(tag,'content',desc)
    setmeta('#ogUrl','content',canonical)
    if img:
        url=img if str(img).startswith('https://') else 'https://aesh.ir'+str(img)
        setmeta('#ogImage','content',url);setmeta('#twitterImage','content',url)
    graph=seo_identity_graph(canonical,title,desc)
    if (ROOT/'CNAME').exists():
        script=doc.new_tag('script',type='application/ld+json');script.string=json.dumps(graph,ensure_ascii=False).replace('<','\\u003c');head.append(script)
    else:
        # TEST must stay noindex even after running this source builder again.
        for agent in ('robots','googlebot'):
            tag=head.find('meta',attrs={'name':agent})
            if tag is None:tag=doc.new_tag('meta');tag['name']=agent;head.append(tag)
            tag['content']='noindex,nofollow,noarchive'
    bodytag=doc.body
    for child in list(bodytag.children):
        if getattr(child,'name',None)=='div' and (child.get('id','').startswith('page-') or child.get('id','') in ('profileView','portfolioView','featuredView','loginModal','pwModal','reauthModal','itemModal','personModal','portfolioModal','seoModal','editPanel','rte')):
            child.decompose()
        if getattr(child,'name',None)=='script':child.decompose()
    # The preview-return button is a <button>, not a <div>. It belongs ONLY
    # inside the actual editor/Studio preview, never inside public route HTML.
    # This is applied every time a page (including a new Cloud page) is built.
    for preview_return in bodytag.find_all(id='editorPreviewReturn'):
        preview_return.decompose()
    # Remove old progressive loader that only belongs to monolithic SPA.
    for ident in ('loader',):
        el=bodytag.find(id=ident)
        if el:el.decompose()
    # Insert content immediately before footer so header/mobile overlay stay identical.
    footer=bodytag.find('footer')
    if footer:footer.insert_before(body)
    else:bodytag.append(body)
    for x in bodytag.select('.add-btn,.del-btn,.item-edit,.person-edit,.portfolio-edit,.portfolio-del,.featured-edit,.add-tile,.stat-edit,.stat-del,.award-del,.award-edit,.portfolio-admin-note'):
        x.decompose()
    for x in bodytag.find_all(attrs={'contenteditable':True}):x.attrs.pop('contenteditable',None)
    for x in bodytag.find_all(attrs={'onclick':True}):
        v=x['onclick']
        if any(q in v for q in ('isEditMode','addItem(','delItem(','editItem(','addPerson(','editPerson(','uploadImage(','deletePortfolio(','changeLogo(')):
            x.attrs.pop('onclick',None)
    # Listing pages use kind="page"; their nav must follow the actual route.
    nav_kind = ('home' if route == '/' else route.strip('/').split('/')[0]) if kind == 'page' else kind
    normalize_anchors(doc,nav_kind)
    b=bodytag
    b['data-aesh-kind']=kind
    b['data-aesh-path']=route
    b['data-aesh-version']='5.0'
    if route=='/':b['data-aesh-static-work-count']=str(sum(not w.get('_aesh_cloud') for w in d['portfolio']))
    if kind=='work':
        raw=(identity or {}).get('_aesh_key') or ('legacy:'+str((identity or {}).get('id') or route.strip('/').split('/')[-1]))
        b['data-aesh-work-id']=str(raw)
    rootbase=head.find(id='siteBase')
    if rootbase:rootbase['href']='/'
    for scriptname in ('aesh-static.js',):
        x=doc.new_tag('script',src='/assets/'+scriptname+'?v=5.0.3',defer=True);bodytag.append(x)
    # Public API is loaded only where that page needs dynamic Supabase data.
    if kind in ('page','teacher','student','work','404') and (route in ('/','/teachers/','/students/','/portfolio/','/about/') or kind in ('teacher','student','work')):
        for scriptname in ('aesh-config.js','aesh-core.js'):
            bodytag.append(doc.new_tag('script',src='/assets/'+scriptname+'?v=5.0',defer=True))
    if route in ('/teachers/','/students/') or kind in ('teacher','student'):
        bodytag.append(doc.new_tag('script',src='/assets/aesh-profile-sync.js?v=5.0',defer=True))
    if route in ('/teachers/','/students/'):
        bodytag.append(doc.new_tag('script',src='/assets/aesh-directory.js?v=5.0',defer=True))
    if route=='/':
        bodytag.append(doc.new_tag('script',src='/assets/aesh-home-stats.js?v=5.0',defer=True))
    if route=='/portfolio/':
        bodytag.append(doc.new_tag('script',src='/assets/aesh-cloud-gallery.js?v=5.0',defer=True))
    if kind=='teacher':
        bodytag.append(doc.new_tag('script',src='/assets/aesh-teacher-works.js?v=5.0',defer=True))
    if kind=='work':
        for scriptname in ('aesh-vote-detail.js','aesh-work-details.js'):
            bodytag.append(doc.new_tag('script',src='/assets/'+scriptname+'?v=5.0',defer=True))
    if route=='/about/':
        bodytag.append(doc.new_tag('script',src='/assets/aesh-reviews.js?v=5.0',defer=True))
    if kind in ('work','teacher','student','page'):
        b['class']=list(dict.fromkeys(b.get('class',[])+['aesh-page-enter']))
    # Convert data:image assets to cached WebP/PNG without changing image pixels.
    markup='<!doctype html>\n'+str(doc.html)
    return rewrite_data_images(markup)

def read_selections():
    f=ROOT/'assets/aesh-featured-works.json'
    if not f.is_file():write(f,'{}\n')
    try: raw=json.loads(f.read_text('utf-8'))
    except:raw={}
    return {str(k):list(dict.fromkeys(str(x) for x in v))[:8] for k,v in raw.items() if isinstance(v,list)} if isinstance(raw,dict) else {}

def content_for(original,kind,item,d,sel):
    if kind in ('teacher','student'):return profile_detail(original,item,kind,d,sel)
    if kind=='work':return work_detail(original,item,d)
    if kind=='featured':return featured_detail(original,item)
    return simple_detail(kind,item)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source',default='tools/aesh5-source.html',help='HTML document containing latest #embedded-data, relative to project root')
    args=parser.parse_args()
    if not SOURCE_TEMPLATE.exists():raise RuntimeError('Missing exact approved source template')
    base=BeautifulSoup(SOURCE_TEMPLATE.read_text('utf-8'),'html.parser')
    data=load_json_from_page(ROOT/args.source)
    if len(data.get('portfolio',[]))<45:raise RuntimeError('DATA_LOSS_PREVENTION: fewer than 45 archived works; refusing build')
    if len(data.get('teachers',[]))<18 or len(data.get('students',[]))<11:
        raise RuntimeError('DATA_LOSS_PREVENTION: profile count regressed; refusing build')
    scan_assets()
    selections=read_selections()
    old=all_legacy_files()
    old_sitemap=ET.parse(ROOT/'sitemap.xml')
    old_urls=[el.text for el in old_sitemap.findall('.//{*}loc') if el.text]
    manifest=set(old_urls)
    route_sources={}
    page_names={'home':'خانه','teachers':'اساتید انجمن','students':'هنرجویان انجمن','portfolio':'نمونه‌کارهای انجمن','courses':'دوره‌های آموزشی','events':'مسابقات و رویدادها','news':'اخبار انجمن','faq':'پرسش‌های متداول','rules':'قوانین انجمن','about':'درباره انجمن'}
    for section in ROUTES:
        route='/' if section=='home' else '/'+section+'/'
        node=page_dom(base,section,data,selections)
        meta=APPROVED_PAGE_SEO[section]
        if not (ROOT/meta[2].lstrip('/')).is_file():
            raise RuntimeError('Missing approved SEO image '+meta[2])
        # Source home canonical in the supplied zip mistakenly points to /teachers; correct it.
        old_html=old.get(section+'/index.html') if section!='home' else None
        output=base_html(base,node,route,'page',meta,data,old_html)
        write(ROOT/route.lstrip('/')/'index.html',output)
        manifest.add('https://aesh.ir'+route);route_sources[route]=section
    for kind,key in [('teacher','teachers'),('student','students'),('work','portfolio'),('course','courses'),('news','news'),('featured','featured'),('event','events')]:
        for item in data[key]:
            if not slug(kind,item):continue
            route=plainpath(kind,item)
            node=content_for(base,kind,item,data,selections)
            meta=generic_detail_meta(kind,item)
            old_html=old.get(route.lstrip('/')+'index.html')
            out=base_html(base,node,route,kind,meta,data,old_html,item if kind=='work' else None)
            write(ROOT/route.lstrip('/')/'index.html',out)
            manifest.add('https://aesh.ir'+path_for(kind,item));route_sources[route]=kind
    for rel,raw in old.items():
        path='/'+rel.removesuffix('index.html')
        if path in route_sources:continue
        typ=rel.split('/')[0]
        slug0=rel.split('/')[1]
        translated=HEX_RX.sub(lambda m:chr(int(m.group(1),16)),slug0)
        replacement=ROOT/typ/translated/'index.html'
        if translated!=slug0 and replacement.exists():
            out=replacement.read_text('utf-8')
            # URLs with literal # are legacy filesystem aliases, not normal browser URLs.
            write(ROOT/rel,out)
        else:
            # Preserve every legacy URL even when its entity was removed from the latest dataset.
            title,desc=old_metadata(raw)
            fallback={'title':title,'name':title.split(' | ')[0], 'bio':desc, 'role':'', 'stats':[], 'extra':{},'slug':slug0}
            node=content_for(base,typ if typ in ('teacher','student') else 'work' if typ=='work' else typ,fallback,data,selections) if typ in ('teacher','student','work') else simple_detail(typ,{'title':title,'desc':desc}) if typ in ('news','course') else featured_detail(base,{'title':title,'desc':desc})
            out=base_html(base,node,path,typ,(title,desc,''),data,raw,{'id':slug0} if typ=='work' else None)
            write(ROOT/rel,out)
        route_sources[path]='legacy'
    # Keep EVERY old sitemap URL byte-for-byte and add new URLs; no slug is discarded.
    current={el.text for el in old_sitemap.findall('.//{*}loc') if el.text}
    for url in sorted(manifest-current):
        entry=ET.SubElement(old_sitemap.getroot(),f'{{{NS}}}url')
        ET.SubElement(entry,f'{{{NS}}}loc').text=url
    # The second GitHub account has no CNAME and must never publish production URLs.
    # The production package keeps its full canonical sitemap unchanged.
    if not (ROOT/'CNAME').exists():
        old_sitemap=ET.ElementTree(ET.Element(f'{{{NS}}}urlset'))
    ET.indent(old_sitemap,space='  ')
    write(ROOT/'sitemap.xml',ET.tostring(old_sitemap.getroot(),encoding='utf-8',xml_declaration=True))
    # Global search is optional and lazy: it is never downloaded until a user searches.
    index=[]
    for kind,key in [('teacher','teachers'),('student','students'),('work','portfolio'),('course','courses'),('news','news'),('featured','featured')]:
        for item in data[key]:
            index.append({'type':kind,'title':item.get('name') or item.get('title') or item.get('label') or '', 'detail':text(item.get('role') or item.get('desc') or item.get('bio') or item.get('excerpt'),160),'href':path_for(kind,item)})
    write(ROOT/'assets/aesh-search-index.json',json.dumps(index,ensure_ascii=False,separators=(',',':'))+'\n')
    # Update package manifest used by the browser-side editor exporter.
    filemanifest=ROOT/'assets/aesh-package-files.json'
    oldmanifest=json.loads(filemanifest.read_text('utf-8'))
    required=['tools/build_aesh5.py','tools/aesh5-source.html','assets/aesh-featured-works.json','assets/aesh-editor-curation.js','assets/aesh-cloud-fallback.js']
    oldmanifest=list(dict.fromkeys(oldmanifest+required+[str(f.relative_to(ROOT)) for f in (ROOT/'assets/content').rglob('*') if f.is_file()]))
    write(filemanifest,json.dumps(oldmanifest,ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps({'pages_generated':len(route_sources),'old_sitemap_urls':len(old_urls),'new_sitemap_urls':len(manifest),'teachers':len(data['teachers']),'students':len(data['students']),'static_works':len(data['portfolio']),'archived_cloud_works':sum(bool(x.get('_aesh_cloud')) for x in data['portfolio']),'total_asset_files':len(_known_assets)},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
