#!/usr/bin/env python3
"""Only configures *copied* TEST worktree, using GitHub repository variables.
Never takes a service_role secret, never writes production deployment config.
"""
import os,re,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
url=os.getenv('AESH_TEST_URL','').rstrip('/')
key=os.getenv('AESH_TEST_PUBLISHABLE_KEY','')
ref=os.getenv('AESH_TEST_PROJECT_REF','')
if not (root/'.aesh-test').exists() or (root/'CNAME').exists():
    sys.exit('FAIL CLOSED: this is not an isolated no-CNAME TEST worktree')
if not (re.fullmatch(r'[a-z0-9]{20}',ref) and url==f'https://{ref}.supabase.co'):
    sys.exit('Set AESH_TEST_URL and matching AESH_TEST_PROJECT_REF for the ISOLATED test project.')
if not re.fullmatch(r'(?:sb_publishable_[A-Za-z0-9_.-]{12,}|eyJ[A-Za-z0-9_.-]{12,})',key):
    sys.exit('Set AESH_TEST_PUBLISHABLE_KEY (PUBLIC key only; no service_role).')
if key.startswith('sb_secret_'):sys.exit('Private Supabase keys are forbidden')
file=root/'assets/aesh-config.js'
s=file.read_text('utf-8')
s=s.replace('AESH_TEST_SUPABASE_URL',url).replace('AESH_TEST_PUBLISHABLE_KEY',key)
if url not in s:sys.exit('TEST config placeholders missing; refuse to alter unknown project')
file.write_text(s,'utf-8')
print('Isolated Supabase project configured:',ref)  # no keys printed
