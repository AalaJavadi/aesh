#!/usr/bin/env python3
"""Local integration tests for migration cutover. No remote APIs/credentials."""
from pathlib import Path
from tempfile import TemporaryDirectory
from xml.etree import ElementTree as ET
import json,os,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_blog as blog
import sync_cms_cutover as cut
import sync_cms_public as cms

passed=[]
def check(ok,description):
    assert ok,description
    passed.append(description)
ID='a1111111-1111-4111-8111-111111111111'

def setup(folder):
    root=Path(folder)
    (root/'content').mkdir(exist_ok=True)
    old='work/archived-poster/index.html'
    p=root/old;p.parent.mkdir(parents=True,exist_ok=True)
    source=f'<!doctype html><html><body data-aesh-work-id="cloud:{ID}">AESH ORIGINAL OLD PAGE</body></html>'
    p.write_text(source,'utf8')
    root.joinpath('content/legacy_cloud_source_inventory.json').write_text(json.dumps({'version':1,'pages':[{'path':old,'id':ID}]}),'utf8')
    for label,grid in [('teachers','teachersGrid'),('students','studentsGrid'),('portfolio','portfolioGrid')]:
        f=root/label/'index.html';f.parent.mkdir(parents=True,exist_ok=True)
        f.write_text('<!doctype html><html><head></head><body><div id="'+grid+'">OLD CONTENT</div></body></html>','utf8')
    person=root/'teacher'/'old-artist'/'index.html';person.parent.mkdir(parents=True,exist_ok=True)
    person.write_text('ORIGINAL STATIC PROFILE','utf8')
    article=root/'work/normal-static/index.html';article.parent.mkdir(parents=True,exist_ok=True)
    article.write_text('ORIGINAL STATIC ARTWORK','utf8')
    site=ET.Element('{'+blog.NS+'}urlset')
    for url in ('/work/archived-poster/','/work/normal-static/','/teacher/old-artist/'):
        loc=ET.SubElement(ET.SubElement(site,'{'+blog.NS+'}url'),'{'+blog.NS+'}loc');loc.text=blog.ORIGIN+url
    (root/'sitemap.xml').write_bytes(ET.tostring(site,encoding='utf-8',xml_declaration=True))
    return root,old,source

profile={'role':'teacher','slug':'artist-d1','display_name':'هنرمند آزمایشی','bio':'تست','skills':[], 'stats':[],'performance':[],'extra':{},'specialty':'طراحی','image':''}
work={'slug':'archived-poster','legacy_id':ID,'title':'پوستر تأییدشده','description':'نمونه', 'image':'','owner_role':'teacher','owner_slug':'artist-d1','owner_name':'هنرمند آزمایشی'}

with TemporaryDirectory(prefix='aesh-cloud-cutover-') as tmp:
    root,old,source=setup(tmp)
    migration={'version':1,'profiles':[profile], 'works':[work], 'articles':[], 'migrated_legacy_works':[{'legacy_id':ID,'slug':'archived-poster','status':'published'}]}
    os.environ.pop('AESH_CLOUD_CUTOVER_APPROVAL',None)
    try: cut.approved(migration,root);raise AssertionError('missing owner approval accepted')
    except ValueError:passed.append('missing cutover approval fails closed')
    os.environ['AESH_CLOUD_CUTOVER_APPROVAL']=cut.SIGNOFF
    try:cut.approved({**migration,'migrated_legacy_works':[]},root);raise AssertionError('missing old ID accepted')
    except ValueError:passed.append('missing D1 mapping aborts all changes')
    check((root/old).read_text('utf8')==source,'preflight did not mutate original page')
    cut.run(migration,'test.example.org',root)
    check('AESH-CF-CMS-GENERATED-V1' in (root/old).read_text('utf8'),'old Cloud UUID page replaced only after verified mapping')
    check('ORIGINAL STATIC PROFILE' in (root/'teacher/old-artist/index.html').read_text('utf8'),'genuine legacy profile preserved')
    check('ORIGINAL STATIC ARTWORK' in (root/'work/normal-static/index.html').read_text('utf8'),'genuine legacy work preserved')
    check(json.loads((root/'.aesh-generated-share-pages.json').read_text())['generated']==[],'unchanged source verifier can accept migrated Cloud-only state')
    # Fresh disposable tree: one formerly public legacy UUID intentionally archived.
with TemporaryDirectory(prefix='aesh-cloud-archive-') as tmp:
    root,old,_=setup(tmp)
    archived={'version':1,'profiles':[],'works':[],'articles':[], 'migrated_legacy_works':[{'legacy_id':ID,'slug':'archived-poster','status':'archived'}]}
    cut.run(archived,'test.example.org',root)
    check(not (root/old).exists(),'explicitly reconciled archived D1 work not public')
    check('archived-poster' not in (root/'sitemap.xml').read_text('utf8'),'archived legacy sitemap URL removed')
    check((root/'work/normal-static/index.html').exists(),'unrelated static page still public')
print('PASS Cloudflare-only reviewed cutover simulation:',len(passed),'assertions')
for item in passed:print(' PASS',item)
