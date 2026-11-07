#!/usr/bin/env python3
"""Offline fixture verification for published HTML, archive, legacy preservation,
blog XSS escaping and sitemap safety; never calls external websites."""
import json, sys, tempfile
from pathlib import Path
from xml.etree import ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_blog as blog
import sync_cms_public as cms

PASSED=[]
def check(condition,name):
    assert condition,name
    PASSED.append(name)

def setup(root):
    for rel,grid in [('teachers/index.html','teachersGrid'),('students/index.html','studentsGrid'),('portfolio/index.html','portfolioGrid')]:
        target=root/rel;target.parent.mkdir(parents=True)
        target.write_text(f'<!doctype html><html lang="fa"><head><title>before</title></head><body><div id="{grid}"><div class="old">قدیمی</div></div></body></html>','utf8')
    (root/'content/blog').mkdir(parents=True)
    site=ET.Element('{%s}urlset'%blog.NS)
    loc=ET.SubElement(site,'{%s}url'%blog.NS);ET.SubElement(loc,'{%s}loc'%blog.NS).text=blog.ORIGIN+'/teachers/'
    (root/'sitemap.xml').write_bytes(ET.tostring(site,encoding='utf-8',xml_declaration=True))

with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);setup(root)
    blog.ROOT=root;blog.CONTENT=root/'content/blog';blog.SITEMAP=root/'sitemap.xml'
    cms.ROOT=root;cms.STATE=root/'content/cf_public_state.json';cms.OUT=root/'.aesh-cms-snapshot.json'
    sample={'version':1,'profiles':[{
      'role':'teacher','slug':'fixture-teacher','display_name':'آزمایش <script>alert(1)</script>',
      'bio':'متن معرفی '+('آ'*1000),'skills':['تجربه'],
      'stats':[{'label':'مقاله','value':'۴'}],'performance':[{'label':'تخصص','value':60}],
      'extra':{'rank':'اول'},'image':'','specialty':'طراحی' }],
      'works':[{'slug':'fixture-work','title':'نمونه <img src=x>','description':'توضیح','image':'',
                 'owner_role':'teacher','owner_slug':'fixture-teacher','owner_name':'آزمایشی'}],
      'articles':[{'slug':'fixture-article','title':'مقاله تستی','status':'published',
                    'excerpt':'خلاصه','category':'آموزش','author':'نگارنده','seo_title':'مقاله',
                    'seo_description':'متن','image':'','tags':['تست'],
                    'published_at':'2026-11-06T00:00:00Z','blocks':[{'type':'paragraph','text':'<script>alert(1)</script>'}]}]}
    p,w,m=cms.run(sample,'test.example.org')
    check((p,w,m)==(2,1,0),'published CMS records built')
    teacher=(root/'teacher/fixture-teacher/index.html').read_text('utf8')
    work=(root/'work/fixture-work/index.html').read_text('utf8')
    check('&lt;script&gt;' in teacher and '<script>alert' not in teacher,'profile HTML escaped')
    check('&lt;img' in work and '<img src=x>' not in work,'work title escaped')
    check('60%' in teacher and 'رتبه' in teacher,'stats/performance static')
    check('قدیمی' in (root/'teachers/index.html').read_text('utf8'),'old list entries preserved')
    check('fixture-teacher' in (root/'teachers/index.html').read_text('utf8'),'new public list entry')
    check('fixture-work' in (root/'sitemap.xml').read_text('utf8'),'sitemap new approved routes')
    check(blog.build(blog.load_posts(snapshot_file=str(cms.OUT)))==1,'CMS blog published')
    article=(root/'blog/fixture-article/index.html').read_text('utf8')
    check('&lt;script&gt;alert(1)&lt;/script&gt;' in article and '<script>alert(1)</script>' not in article,'article HTML escaped')
    check('https://aesh.ir/blog/fixture-article/' in article,'article canonical')
    # Draft must not create HTML or become sitemap record.
    (root/'content/blog/draft.json').write_text(json.dumps({'slug':'hidden-draft','title':'آزمایشی','status':'draft','blocks':[]}),encoding='utf8')
    blog.build(blog.load_posts(snapshot_file=str(cms.OUT)))
    check(not (root/'blog/hidden-draft').exists(),'blog draft excluded')
    # Simulate a previously published item removed/archived. Only generated CMS
    # routes are deleted; existing content, other sitemap URLs remain intact.
    cms.run({'version':1,'profiles':[],'works':[],'articles':[]},'test.example.org')
    check(not (root/'teacher/fixture-teacher/index.html').exists(),'archived profile removed')
    check(not (root/'work/fixture-work/index.html').exists(),'archived work removed')
    check('fixture-work' not in (root/'sitemap.xml').read_text('utf8'),'archived CMS sitemap removed')
    check('https://aesh.ir/teachers/' in (root/'sitemap.xml').read_text('utf8'),'unrelated sitemap retained')
    blog.build(blog.load_posts(snapshot_file=str(cms.OUT)))
    check(not (root/'blog/fixture-article/index.html').exists(),'archived article removed')
    # Pre-existing profile URL cannot be overwritten by an imported CMS entry.
    old_path=root/'teacher/old-profile/index.html';old_path.parent.mkdir(parents=True);old_path.write_text('LEGACY KEEP','utf8')
    old_sample={'version':1,'profiles':[{**sample['profiles'][0],'slug':'old-profile'}],'works':[],'articles':[]}
    cms.run(old_sample,'test.example.org')
    check(old_path.read_text('utf8')=='LEGACY KEEP','legacy profile protected from overwrite')
    check('old-profile' not in (root/'teachers/index.html').read_text('utf8'),'legacy profile not duplicated in cards')
    try:
        cms.run({'version':1,'profiles':[{**sample['profiles'][0],'slug':'../bad'}],'works':[],'articles':[]},'test.example.org')
        raise AssertionError('unsafe slug accepted')
    except ValueError:
        PASSED.append('path traversal slug rejected')
    check((root/'teachers/index.html').exists(),'invalid input leaves old list intact')
print('PASS CMS static HTML offline:',len(PASSED),'assertions')
for name in PASSED:print('  PASS |',name)
