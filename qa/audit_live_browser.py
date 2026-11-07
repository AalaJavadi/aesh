#!/usr/bin/env python3
"""Read-only Chrome timings for six PUBLIC AESH routes, on demand in GitHub Actions.

This never logs in, submits forms, uploads data, changes DNS or deploys files.
A failed test is recorded as FAILED, not as a fabricated measurement.
"""
import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

ROUTES = ('/', '/teachers/', '/students/', '/portfolio/', '/members/', '/blog/')
VIEWPORTS = {'desktop': {'width': 1366, 'height': 768},
             'mobile': {'width': 390, 'height': 844}}
OBSERVER = """(() => {
  window.__aeshLCP = null;
  if ('PerformanceObserver' in window) {
    try {
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          window.__aeshLCP = Math.round(entry.startTime);
        }
      }).observe({type:'largest-contentful-paint',buffered:true});
    } catch (_) {}
  }
})();"""
METRICS_JS = """() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const paints = performance.getEntriesByType('paint');
  const fcp = paints.find(entry => entry.name === 'first-contentful-paint');
  const unfinished = [...document.images].filter(img => img.loading !== 'lazy' && img.complete && img.naturalWidth === 0);
  return {
    title: document.title,
    h1_count: document.querySelectorAll('h1').length,
    ttfb_ms: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
    dom_content_loaded_ms: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : null,
    load_ms: nav && nav.loadEventEnd ? Math.round(nav.loadEventEnd - nav.startTime) : null,
    fcp_ms: fcp ? Math.round(fcp.startTime) : null,
    lcp_observed_ms: window.__aeshLCP,
    images_broken_eager: unfinished.length,
    js_resources: performance.getEntriesByType('resource').filter(r => r.name.includes('.js')).length,
    css_resources: performance.getEntriesByType('resource').filter(r => r.name.includes('.css')).length,
  };
}"""


def measure(base, output, wait_ms, timeout_ms):
    from playwright.sync_api import sync_playwright
    results = {'generated_at': datetime.now(timezone.utc).isoformat(),
               'base': base, 'platform': 'GitHub Actions / Chromium (not Iran)',
               'warning': 'LCP is observed, not Lighthouse or an actual user CWV. INP requires real user interaction.',
               'pages': []}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        try:
            for device, viewport in VIEWPORTS.items():
                for route in ROUTES:
                    context = browser.new_context(viewport=viewport, device_scale_factor=2 if device == 'mobile' else 1,
                                                  is_mobile=device == 'mobile', reduced_motion='reduce')
                    page = context.new_page()
                    failures = []
                    page.on('requestfailed', lambda req: failures.append({'url': urlsplit(req.url).hostname or '',
                                                                            'kind': req.resource_type,
                                                                            'failure': str(req.failure or '')[:100]}))
                    page.add_init_script(OBSERVER)
                    url = urljoin(base, route.lstrip('/'))
                    item = {'device': device, 'path': route, 'url': url, 'status': 'FAIL'}
                    t0 = time.monotonic()
                    try:
                        response = page.goto(url, wait_until='domcontentloaded', timeout=timeout_ms)
                        if not response or response.status >= 400:
                            raise RuntimeError('document response was HTTP '+str(response.status if response else 'none'))
                        page.wait_for_timeout(wait_ms)
                        item.update({'status': 'PASS', 'http_status': response.status,
                                     'wall_elapsed_ms': round((time.monotonic()-t0)*1000),
                                     'metrics': page.evaluate(METRICS_JS),
                                     'network_failures': failures[:30],
                                     'network_failure_count': len(failures)})
                    except Exception as exc:
                        item.update({'error': str(exc)[:600], 'elapsed_ms': round((time.monotonic()-t0)*1000)})
                    finally:
                        context.close()
                    results['pages'].append(item)
                    print(f"{item['status']} {device} {route} {json.dumps(item.get('metrics',item.get('error','')),ensure_ascii=False)[:220]}",flush=True)
        finally:
            browser.close()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n', encoding='utf-8')
    success = sum(r['status']=='PASS' for r in results['pages'])
    print(f'Recorded {success}/{len(results["pages"])} browser navigations in {output}')
    return success==len(results['pages'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='https://aesh.ir/')
    parser.add_argument('--output', default='browser_audit_results/results.json')
    parser.add_argument('--wait-ms', type=int, default=5000)
    parser.add_argument('--timeout-ms', type=int, default=25000)
    args = parser.parse_args()
    parsed = urlsplit(args.base)
    if parsed.scheme!='https' or parsed.netloc!='aesh.ir' or parsed.path not in ('','/') or parsed.query or parsed.fragment:
        parser.error('Only the public https://aesh.ir/ origin is allowed. No private, preview, or localhost testing.')
    if args.wait_ms<1000 or args.wait_ms>15000 or args.timeout_ms<3000 or args.timeout_ms>60000:
        parser.error('Unsafe wait or timeout value')
    raise SystemExit(0 if measure(args.base,Path(args.output),args.wait_ms,args.timeout_ms) else 2)

if __name__=='__main__':main()
