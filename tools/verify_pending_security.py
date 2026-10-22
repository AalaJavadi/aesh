#!/usr/bin/env python3
"""Read-only real HTTP privacy audit for a separate AESH TEST Supabase project.
Without an actual pending image path no anonymous leak test is called PASS.
Usage example (isolated TEST only):
 python tools/verify_pending_security.py --test-project-ref TESTREF --publishable-key TEST_ANON \
   --bucket aesh-member-works --path OWNER_UUID/WORK_UUID.webp --output AESH_TEST_PRIVACY_HTTP.json
No service key is read or logged. Production refs are rejected by an explicit allowlist.
"""
import argparse,json,sys,re,os
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from urllib.parse import quote
B={'aesh-member-works','aesh-owner-works','aesh-work-thumbs'}
UUID=r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
OBJECT=re.compile(rf'^{UUID}/{UUID}\.(?:webp|jpg|png)$',re.I)
def status(url,headers):
    req=Request(url,headers=headers,method='GET')
    try:
        with urlopen(req,timeout=15) as r:
            return r.status
    except HTTPError as e:return e.code
    except URLError as e:raise RuntimeError('Transport/CORS/HTTPS error; no security PASS: '+str(e.reason)) from e

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--test-project-ref',required=True)
    ap.add_argument('--publishable-key',default=os.getenv('AESH_TEST_PUBLISHABLE_KEY',''))
    ap.add_argument('--bucket',choices=sorted(B))
    ap.add_argument('--path')
    ap.add_argument('--check-buckets-only',action='store_true')
    ap.add_argument('--output',type=Path)
    args=ap.parse_args()
    ref=args.test_project_ref
    if not re.fullmatch(r'[a-z0-9]{20}',ref) or ref=='myakibavvzuhqgraqzug':
        ap.error('Need verified isolated TEST project reference, not production')
    key=args.publishable_key
    if not re.fullmatch(r'(sb_publishable_[A-Za-z0-9_.-]{12,}|eyJ[A-Za-z0-9_.-]{12,})',key):
        ap.error('Only a public/publishable test API key is allowed')
    if not args.check_buckets_only and (args.bucket is None or args.path is None or not OBJECT.fullmatch(args.path)):
        ap.error('Provide a known real PENDING bucket+path; bucket-only tests cannot establish pending privacy')
    base='https://'+ref+'.supabase.co'
    api_headers={'apikey':key,'Content-Type':'application/json','Accept':'application/json'}
    if key.startswith('eyJ'):api_headers['Authorization']='Bearer '+key
    evidence={'project_ref':ref,'mode':'bucket-only' if args.check_buckets_only else 'pending-object-anonymous','checks':[],'live_test':True}
    post=Request(base+'/rest/v1/rpc/aesh_5_work_buckets_private',headers=api_headers,data=b'{}',method='POST')
    try:
        with urlopen(post,timeout=15) as resp:
            body=json.loads(resp.read(100))
            evidence['checks'].append({'type':'private-buckets-sql','http':resp.status,'result':body,'pass':body is True})
    except HTTPError as e:
        evidence['checks'].append({'type':'private-buckets-sql','http':e.code,'pass':False})
    except (URLError,ValueError) as e:
        evidence['checks'].append({'type':'private-buckets-sql','error':str(e)[:90],'pass':False})
    if not args.check_buckets_only:
        b=args.bucket;p=args.path;safe='/'.join(map(quote,p.split('/')))
        routes=[('public-object-url','/storage/v1/object/public/'+b+'/'+safe),
                ('authenticated-anon-object-url','/storage/v1/object/authenticated/'+b+'/'+safe),
                ('published-only-edge-proxy','/functions/v1/aesh-approved-media/'+b+'/'+safe)]
        for label,route in routes:
            headers=api_headers if label!='public-object-url' else {}
            try:
                result=status(base+route,headers)
                # Every pending-image URL must be rejected; 401/403/404 all safe.
                check={'type':label,'http':result,'pass':result in (401,403,404)}
            except RuntimeError as e:check={'type':label,'error':str(e)[:120],'pass':False}
            evidence['checks'].append(check)
    overall=all(c['pass'] for c in evidence['checks'])
    evidence['status']='PASS_BUCKETS_ONLY' if overall and args.check_buckets_only else ('PASS_LIVE_HTTP' if overall else 'FAIL_OR_UNKNOWN')
    evidence['pending_object_tested']=not args.check_buckets_only
    if args.output:args.output.write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n','utf-8')
    print(json.dumps(evidence,ensure_ascii=False,indent=2))
    if args.check_buckets_only:print('IMPORTANT: Anonymous pending-object denial is NOT TESTED in bucket-only mode.',file=sys.stderr)
    return 0 if overall else 2
if __name__=='__main__':sys.exit(main())
