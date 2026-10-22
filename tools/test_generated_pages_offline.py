#!/usr/bin/env python3
"""Offline fixture E2E tests for workflow generators. NOT a live Supabase test."""
from pathlib import Path
import json, tempfile, shutil, subprocess,sys,hashlib
ROOT=Path(__file__).resolve().parents[1]
TEACHER_ID='b1111111-1111-4111-8111-111111111111'
STUDENT_ID='b2222222-2222-4222-8222-222222222222'
WORK_ID='b3333333-3333-4333-8333-333333333333'
OWNER_ID='b4444444-4444-4444-8444-444444444444'
def run(*args,cwd):
    p=subprocess.run([sys.executable,*args],cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=120)
    if p.returncode:raise AssertionError(' '.join(args)+': '+p.stdout[-1000:])
    return p.stdout.strip()
def check():
    with tempfile.TemporaryDirectory(prefix='aesh-offline-') as td:
        site=Path(td)/'site'
        shutil.copytree(ROOT,site,ignore=shutil.ignore_patterns('_site','__pycache__','.DS_Store'))
        legacy=site/'teacher'/'کسری-ثابت'/'index.html'
        before=hashlib.sha256(legacy.read_bytes()).digest()
        teacher_slug='استاد-آزمایشی-جدید'
        student_slug='هنرجوی-آزمایشی-جدید'
        directory=[
          {'id':TEACHER_ID,'role':'teacher','owner_slug':teacher_slug,'display_name':'استاد تست ویژه','bio':'پروفایل تست فقط Fixture','specialty':'طراحی','skills':'WebP','published':True,'avatar_path':OWNER_ID+'.webp'},
          {'id':STUDENT_ID,'role':'student','owner_slug':student_slug,'display_name':'هنرجوی تست ویژه','bio':'پروفایل تست فقط Fixture','specialty':'گرافیک','published':True},
          {'id':OWNER_ID,'role':'teacher','owner_slug':'پروفایل-منتشرنشده-تست','display_name':'نباید در سایت باشد','published':False}]
        d=Path(td)/'directory.json';d.write_text(json.dumps(directory,ensure_ascii=False),'utf-8')
        print(run('tools/sync_directory_profiles.py','--fixture',str(d),cwd=site))
        for role,slug,text in [('teacher',teacher_slug,'استاد تست ویژه'),('student',student_slug,'هنرجوی تست ویژه')]:
            p=site/role/slug/'index.html'
            assert p.is_file() and text in p.read_text('utf-8') and '<html' in p.read_text('utf-8')
            print('PASS generated:',role,slug)
        assert not (site/'teacher'/'پروفایل-منتشرنشده-تست'/'index.html').exists()
        print('PASS unpublished directory fixture excluded')
        slug='اثر-ساخته-شده-از-سرور-تست'
        work=[{'id':WORK_ID,'slug':slug,'owner_role':'teacher','owner_slug':teacher_slug,'owner_name':'استاد تست ویژه',
          'title':'نمونه اثر واقعاً ساخته شده از fixture','description':'Offline generator test',
          'bucket_id':'aesh-member-works','object_path':OWNER_ID+'/'+WORK_ID+'.webp',
          'thumb_path':OWNER_ID+'/'+WORK_ID+'.webp','status':'published','created_at':'2026-10-20T00:00:00Z'}]
        w=Path(td)/'work.json';w.write_text(json.dumps(work,ensure_ascii=False),'utf-8')
        print(run('tools/sync_cloud_share.py','--fixture',str(w),cwd=site))
        work_page=site/'work'/slug/'index.html'
        assert work_page.is_file() and WORK_ID in work_page.read_text('utf-8')
        assert 'aesh-approved-media' in work_page.read_text('utf-8')
        print('PASS new work page routes through published-only Edge gateway')
        w.write_text('[]','utf-8')
        print(run('tools/sync_cloud_share.py','--fixture',str(w),cwd=site))
        assert not work_page.exists(),'Unpublished work still has HTML file'
        print('PASS unpublished work removed from public HTML')
        d.write_text('[]','utf-8')
        print(run('tools/sync_directory_profiles.py','--fixture',str(d),cwd=site))
        assert not (site/'teacher'/teacher_slug/'index.html').exists()
        assert not (site/'student'/student_slug/'index.html').exists()
        print('PASS generated profiles removed; legacy pages unaffected')
        assert hashlib.sha256(legacy.read_bytes()).digest()==before
        print('PASS original profile content unchanged')
        assert run('tools/aesh_test_metadata.py',cwd=site)
        print('PASS TEST metadata reapplied after generation')
    print('ALL OFFLINE GENERATION SCENARIOS PASSED (NOT live Supabase/GitHub)')
if __name__=='__main__':
    check()
