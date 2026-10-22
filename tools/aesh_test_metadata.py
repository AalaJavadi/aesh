#!/usr/bin/env python3
"""Enforce noindex and test-host SEO on the GitHub Pages TEST bundle only.
Idempotent; contains no credentials and never touches production projects.
"""
from pathlib import Path
import re,sys
ROOT=Path(__file__).resolve().parents[1]
if not (ROOT/'.aesh-test').exists():
 print('Production/non-test tree detected; test metadata patch skipped.');sys.exit(0)
COUNT=0
for f in ROOT.rglob('*.html'):
 if '.git' in f.parts:continue
 source=f.read_text('utf-8')
 head,sep,body=source.partition('</head>')
 if not sep:continue
 head=re.sub(r'https://aesh\.ir(?=[/"\\])','https://aesh-test.github.io',head)
 for name in ('robots','googlebot'):
  tag_rx=re.compile(r'<meta\b[^>]*>',re.I)
  def mark(meta_match):
   tag=meta_match.group(0)
   if not re.search(r'\bname\s*=\s*["]'+name+r'["]',tag,re.I):return tag
   if re.search(r'\bcontent\s*=',tag,re.I):
    return re.sub(r'(\bcontent\s*=\s*["])[^"]*',r'\g<1>noindex,nofollow,noarchive',tag,count=1,flags=re.I)
   return tag.replace('>',' content="noindex,nofollow,noarchive">')
  if re.search(r'\bname\s*=\s*["]'+name+r'["]',head,re.I):head=tag_rx.sub(mark,head)
  else:head+='<meta name="'+name+'" content="noindex,nofollow,noarchive">\n'
 data=(head+sep+body).replace('myakibavvzuhqgraqzug.supabase.co','aesh-test.invalid')
 if f.name=='index.html' and f.parent.name in ('editor','studio'):
  data=data.replace("var base=isGh?'/aesh/':'/';", "var base=isGh&&location.hostname!=='aesh-test.github.io'?'/aesh/':'/';")
 if data!=source:f.write_text(data,'utf-8');COUNT+=1
# Test variant is always excluded by robots.txt. Do not advertise a production sitemap.
(ROOT/'robots.txt').write_text('User-agent: *\nDisallow: /\n','utf-8')
site=ROOT/'sitemap.xml'
if site.exists():site.write_text(site.read_text('utf-8').replace('https://aesh.ir','https://aesh-test.github.io'),'utf-8')
if (ROOT/'CNAME').exists():(ROOT/'CNAME').unlink()
print('TEST noindex/metadata enforced on',COUNT,'HTML files')
