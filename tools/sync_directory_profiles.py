#!/usr/bin/env python3
"""GitHub Pages rebuilds new public directory members as real crawlable HTML.
No service-role credentials. Skips safely (without deleting state) if RPC is absent.
Test: python tools/sync_directory_profiles.py --fixture tests/directory-fixture.json
"""
from __future__ import annotations
import argparse,json,re,sys
from html import escape
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
import build_aesh5 as m
import sync_cloud_share as cloud
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
MARKER='<!-- AESH GENERATED DIRECTORY PROFILE v5 -->'
STATE='.aesh-generated-directory-profiles.json'
UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f]{12}$',re.I)
SLUG=re.compile(r'^[\w\u0600-\u06ff]+(?:-[\w\u0600-\u06ff]+)*$',re.UNICODE)

def fetch_rows():
    host,key=cloud.config(ROOT)
    headers={'apikey':key,'Content-Type':'application/json','Accept':'application/json'}
    if key.startswith('eyJ'):headers['Authorization']='Bearer '+key
    req=Request(host+'/rest/v1/rpc/aesh_public_directory',data=b'{}',method='POST',headers=headers)
    with urlopen(req,timeout=25) as response:records=json.loads(response.read(2_000_000))
    if not isinstance(records,list):raise ValueError('Directory RPC returned invalid data')
    return records,host

def render(record,host,base,data):
    slug=str(record['owner_slug']);role=record['role'];name=record['display_name'];identifier=str(record['id'])
    path=str(record.get('image_path') or record.get('avatar_path') or '')
    # The media path is independently randomized on each upload (never upsert).
    photo=(host+'/storage/v1/object/public/aesh-directory/'+path) if re.fullmatch(r'[0-9a-f]{8}-[0-9a-f-]{27}\.webp',path,re.I) else ''
    item={'id':identifier,'slug':slug,'name':name,'badge':'استاد' if role=='teacher' else 'هنرجو',
        'role':record.get('specialty') or 'عضو انجمن','bio':record.get('bio') or '',
        'image':photo,'stats':[],'chart':{'items':[]},'extra':{'skills':record.get('skills') or ''}}
    node=m.profile_detail(base,item,role,data,{})
    # Render only approved, voluntarily public professional fields. Never HTML-inject
    # arbitrary JSONB; each value is a text node and links are HTTPS-only.
    extra=record.get('extra') if isinstance(record.get('extra'),dict) else {}
    details=[]
    years=extra.get('experience_years')
    if type(years) is int and 0 <= years <= 60:
        details.append(('سابقه فعالیت',str(years)+' سال'))
    for label,key in (('سبک کاری','work_style'),('دستاوردها','achievements')):
        val=extra.get(key)
        if isinstance(val,str) and val.strip():details.append((label,val.strip()[:300]))
    if details:
        section=base.new_tag('section');section['class']='aesh-directory-additional'
        section.append(base.new_tag('h2'))
        section.h2.string='اطلاعات حرفه‌ای'
        for label,value in details:
            part=base.new_tag('p');part.string=label+': '+value;section.append(part)
        node.append(section)
    link=extra.get('portfolio_url')
    if isinstance(link,str) and len(link) <= 400:
        from urllib.parse import urlsplit
        url=urlsplit(link)
        if url.scheme=='https' and url.hostname and not url.username and not url.password:
            anchor=base.new_tag('a',href=link)
            anchor['target']='_blank';anchor['rel']='noopener noreferrer'
            anchor.string='مشاهده نمونه‌کارهای عمومی';node.append(anchor)
    route='/'+role+'/'+slug+'/'
    fallback='https://aesh.ir/assets/social/'+('teachers' if role=='teacher' else 'students')+'.jpg'
    html=m.base_html(base,node,route,role,(name+' | AESH',item['bio'] or name,photo or fallback),data,None,item)
    return html.replace('</body>',MARKER+'</body>')

def run(records,host):
    base=BeautifulSoup(m.SOURCE_TEMPLATE.read_text('utf-8'),'html.parser')
    data=m.load_json_from_page(ROOT/'tools/aesh5-source.html')
    old=set()
    try:old=set(json.loads((ROOT/STATE).read_text('utf-8')).get('generated',[]))
    except (FileNotFoundError,ValueError):pass
    current=set();reserved=set()
    try:reserved={(r['role'],r['slug']) for r in json.loads((ROOT/'assets/aesh-work-owners.json').read_text('utf-8'))}
    except Exception:pass
    for r in records:
        if not isinstance(r,dict) or r.get('role') not in ('teacher','student') or r.get('published') is False:continue
        if not UUID.fullmatch(str(r.get('id') or '')):continue
        slug=str(r.get('owner_slug') or '')
        if len(slug)>90 or not SLUG.fullmatch(slug) or (r['role'],slug) in reserved:continue
        path=r['role']+'/'+slug+'/index.html'
        file=ROOT/path
        if file.exists() and MARKER not in file.read_text('utf-8'):
            print('Refusing to overwrite existing profile:',path);continue
        html=render(r,host,base,data)
        if not file.exists() or file.read_text('utf-8')!=html:
            file.parent.mkdir(parents=True,exist_ok=True);file.write_text(html,'utf-8')
        current.add(path)
    for stale in sorted(old-current):
        file=ROOT/stale
        if file.exists() and MARKER in file.read_text('utf-8'):
            file.unlink()
            try:file.parent.rmdir()
            except OSError:pass
    (ROOT/STATE).write_text(json.dumps({'generated':sorted(current)},ensure_ascii=False,indent=2)+'\n','utf-8')
    if (ROOT/'CNAME').exists():
        cloud.write_sitemap(ROOT,{'https://aesh.ir/'+s.removesuffix('index.html') for s in current},
          {'https://aesh.ir/'+s.removesuffix('index.html') for s in old})
    print('Public directory HTML pages:',len(current),'(old:',len(old),')')

if __name__=='__main__':
    arg=argparse.ArgumentParser();arg.add_argument('--fixture');args=arg.parse_args()
    if args.fixture:
        records=json.loads(Path(args.fixture).read_text('utf-8'));host='https://example.supabase.co'
    else:
        try:records,host=fetch_rows()
        except (HTTPError,URLError,ValueError) as e:
            print('Directory RPC failed: deployment cancelled; no pages deleted:',e,file=sys.stderr)
            sys.exit(2)
    run(records,host)
