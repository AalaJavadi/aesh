#!/usr/bin/env python3
"""Read-only gate on an explicitly approved Production Pages job.

Checks the three private-work-bucket flags via a boolean RPC. This is NOT
proof of pending-image confidentiality and does not replace live RLS testing.
"""
from __future__ import annotations
import json
import os
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from sync_cloud_share import config

ROOT = Path(__file__).resolve().parents[1]


def main():
    if os.environ.get('AESH_PRODUCTION_RELEASE_APPROVED') != 'true':
        raise SystemExit('BLOCKED: Production release not explicitly approved')
    expected = os.environ.get('AESH_PRODUCTION_SUPABASE_REF', '')
    if not re.fullmatch(r'[a-z0-9]{20}', expected):
        raise SystemExit('BLOCKED: expected Supabase project reference missing')
    host, key = config(ROOT)
    if host != 'https://' + expected + '.supabase.co':
        raise SystemExit('BLOCKED: Supabase endpoint does not match approved project')
    headers = {'apikey': key, 'Accept': 'application/json', 'Content-Type': 'application/json'}
    if key.startswith('eyJ'):
        headers['Authorization'] = 'Bearer ' + key
    req = Request(host+'/rest/v1/rpc/aesh_5_work_buckets_private', data=b'{}',
                  method='POST', headers=headers)
    try:
        with urlopen(req, timeout=20) as response:
            if response.status != 200 or json.loads(response.read(100)) is not True:
                raise SystemExit('BLOCKED: work bucket privacy RPC did not return true')
    except (HTTPError, URLError, ValueError) as exc:
        raise SystemExit('BLOCKED: could not verify private work buckets: '+str(exc)) from exc
    print('PASS | Production work bucket privacy boolean true (NOT a pending-object HTTP test)')


if __name__ == '__main__':
    main()
