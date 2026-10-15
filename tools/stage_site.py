#!/usr/bin/env python3
"""Stage only publicly needed files for GitHub Pages; exclude .git, SQL and tools."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'_site'
if TARGET.exists():shutil.rmtree(TARGET)
TARGET.mkdir()
SECTIONS=('assets','members','studio','about','courses','events','faq','news','portfolio','rules',
          'students','teachers','teacher','student','work','course','featured')
TOP=('index.html','404.html','CNAME','.nojekyll','sitemap.xml','robots.txt','favicon.png','favicon.ico','sw.js')
for name in SECTIONS:
    src=ROOT/name
    if src.is_dir():shutil.copytree(src,TARGET/name,ignore=shutil.ignore_patterns('__pycache__','.DS_Store'))
for name in TOP:
    src=ROOT/name
    if src.is_file():shutil.copy2(src,TARGET/name)
print('AESH public pages staged (no .git, SQL, tools or GitHub workflow source).')
