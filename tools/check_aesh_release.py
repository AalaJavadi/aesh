#!/usr/bin/env python3
"""Offline fail-closed checks for AESH TEST/PROD archive release candidates.
Never calls production endpoints or writes any database.
"""
from pathlib import Path
import json,re,sys, argparse
ROOT=Path(__file__).resolve().parents[1]
def check(root:Path, repo:Path|None=None):
    checks=[]
    def test(label,condition):
        checks.append((label,bool(condition)))
        print(('PASS' if condition else 'FAIL')+' | '+label)
    expected=set()
    encoded=re.compile(r'#U([a-fA-F0-9]{4,6})')
    for role in ('teacher','student'):
        for file in (root/role).glob('*/index.html'):
            name=encoded.sub(lambda m:chr(int(m.group(1),16)),file.parent.name)
            if re.fullmatch(r'[A-Za-z0-9ء-ی]+(?:-[A-Za-z0-9ء-ی]+)*',name):expected.add((role,name))
    owner_path=root/'assets/aesh-work-owners.json'
    if owner_path.exists():expected.update((r['role'],r['slug']) for r in json.loads(owner_path.read_text('utf-8')))
    reserved=(root/'sql/aesh5/001b_reserved_slugs.sql').read_text('utf-8')
    actual=set(re.findall(r"\('((?:teacher|student))','([^']+)'\)",reserved))
    test('All legacy profile slugs reserved ('+str(len(expected))+')',expected<=actual)
    js=(root/'assets/aesh-core.js').read_text('utf-8')
    test('New directory photos have immutable filenames','const path=newWorkId()+\'.webp\'' in js)
    photo_code=js[js.index('async function uploadDirectoryPhoto('):js.index('function publicDirectoryPhoto(')]
    test('No directory x-upsert or overwrite','x-upsert' not in photo_code and 'uploadNewObject(' in photo_code)
    test('Work uploads require private bucket RPC','aesh_5_work_buckets_private' in js)
    test('Approved images pass through controlled Edge gateway','aesh-approved-media/' in js)
    test('Private bucket policy supplied',(root/'sql/aesh5/004_private_work_media.sql').is_file())
    test('Approved work Edge function supplied',(root/'supabase/functions/aesh-approved-media/index.ts').is_file())
    direct=[]
    for file in root.rglob('*.html'):
        if '/_site/' in str(file):continue
        if re.search(r'/storage/v1/object/public/aesh-(?:member-works|owner-works|work-thumbs)/',file.read_text('utf-8')):
            direct.append(str(file.relative_to(root)))
    test('No existing work HTML exposes a public bucket URL',not direct)
    if direct:print('BLOCKED:',direct[:5])
    if (root/'.aesh-test').exists():
        test('TEST must not set a custom CNAME',not (root/'CNAME').exists())
        conf=(root/'assets/aesh-config.js').read_text('utf-8')
        test('TEST must not use known production Supabase project','myakibavvzuhqgraqzug.supabase.co' not in conf)
        test('TEST robots blocks indexing','Disallow: /' in (root/'robots.txt').read_text('utf-8'))
    if repo:
        suspects=[]
        for file in (repo/'.github/workflows').glob('*.y*ml'):
            body=file.read_text('utf-8')
            if any(x in body for x in ('actions/deploy-pages@','peaceiris/actions-gh-pages@','JamesIves/github-pages-deploy-action@','crazy-max/ghaction-github-pages@')):
                suspects.append(file.name)
        test('One and only one Pages deploy workflow in repository',len(suspects)==1 and suspects[0]=='aesh-cloud-previews.yml')
        if len(suspects)!=1:print('Deploy workflows found:',suspects)
    print('TOTAL',sum(ok for _,ok in checks),'/',len(checks),'offline assertions')
    return all(ok for _,ok in checks)
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--repo',type=Path);args=a.parse_args()
    sys.exit(0 if check(ROOT,args.repo) else 1)
