/* Read-only Cloudflare STAGING smoke check. Does not access aesh.ir or modify D1/R2.
 * Fails rather than claiming success if the newly deployed preview is inaccessible
 * or if an unauthorized caller can access private data.
 */
const account=process.env.AESH_CLOUDFLARE_ACCOUNT_ID||'';
const token=process.env.AESH_CLOUDFLARE_API_TOKEN||'';
const worker='aesh-cms-preview';
function originFor(subdomain){
  if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain))
    throw Error('Invalid account Workers subdomain');
  return `https://${worker}.${subdomain}.workers.dev`;
}
if(process.argv.includes('--self-test')){
  if(originFor('safe-preview')!=='https://aesh-cms-preview.safe-preview.workers.dev')throw Error('preview URL mismatch');
  for(const malicious of ['aesh.ir','a/x','evil.workers.dev','..','BAD','a'.repeat(70)]){
    let rejected=false;try{originFor(malicious);}catch{rejected=true;}
    if(!rejected)throw Error('URL validation failed for '+malicious);
  }
  console.log('PASS staging Worker URL allowlist self-test');process.exit(0);
}
if(!/^[a-f0-9]{32}$/i.test(account)||token.length<12)throw Error('Preview Cloudflare API credentials missing');
const apiResponse=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`,{
  headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(12000)
});
if(!apiResponse.ok)throw Error('Unable to resolve account workers.dev subdomain (HTTP '+apiResponse.status+')');
const body=await apiResponse.json();
if(body.success!==true)throw Error('Cloudflare subdomain API rejected request');
const origin=originFor(body.result?.subdomain||'');
const checks=[
  {route:'/v1/health',status:200,validate:async r=>{const j=await r.json();return j.service==='aesh-cms-preview'&&j.operational===true&&j.authConfigured===true;}},
  {route:'/v1/me',status:403},
  {route:'/v1/public/snapshot',status:401},
  {route:'/v1/public/media/00000000-0000-4000-8000-000000000000',status:404},
  {route:'/control/',status:403,allowAccessRedirect:true},
  {route:'/member/',status:403,allowAccessRedirect:true}
];
let passed=0;
for(const check of checks){
  const response=await fetch(origin+check.route,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
  let okay=response.status===check.status;
  if(check.allowAccessRedirect&&[302,303,307].includes(response.status)){
    const location=response.headers.get('location')||'';
    okay=location.startsWith('https://') && location.includes('cloudflareaccess.com');
  }
  if(okay&&check.validate)okay=await check.validate(response);
  console.log((okay?'PASS':'FAIL')+' preview '+check.route+' HTTP '+response.status);
  if(!okay)throw Error('Unexpected staging response: '+check.route+' (HTTP '+response.status+')');
  passed++;
}
console.log(`PASS ${passed} LIVE read-only preview health and access-denial checks on workers.dev (not a production/real-user test)`);
