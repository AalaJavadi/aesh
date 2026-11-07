/* Opt-in Cloudflare PREVIEW ONLY. Reads env in private CI runner; never changes DNS or Supabase.
   Idempotent resource detection prevents accidentally creating duplicate preview D1/R2. */
import fs from 'node:fs';import path from 'node:path';
const required=['AESH_CLOUDFLARE_ACCOUNT_ID','AESH_CLOUDFLARE_API_TOKEN','AESH_ACCESS_TEAM','AESH_ACCESS_AUD'];
const workerName='aesh-cms-preview',dbName='aesh-cms-preview',bucketName='aesh-cms-preview-private';
const env=process.env;
function preflight(){
 const missing=required.filter(k=>!env[k]);if(missing.length)throw Error('Missing GitHub Actions secrets/vars: '+missing.join(', '));
 if(!/^[a-f0-9]{32}$/i.test(env.AESH_CLOUDFLARE_ACCOUNT_ID))throw Error('Cloudflare account id must be 32 hex characters');
 if(!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.AESH_ACCESS_TEAM))throw Error('Invalid Cloudflare Access team domain');
 if(!/^[a-f0-9]{64}$/i.test(env.AESH_ACCESS_AUD))throw Error('Cloudflare Access Application Audience ID is invalid');
}
const account=env.AESH_CLOUDFLARE_ACCOUNT_ID,base=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function cf(endpoint,method='GET',data){
 const response=await fetch(base+endpoint,{method,headers:{Authorization:`Bearer ${env.AESH_CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,redirect:'error'});
 let parsed;try{parsed=await response.json();}catch{throw Error(`Cloudflare returned non-JSON HTTP ${response.status}`);}
 if(!response.ok||parsed.success!==true){const codes=(parsed.errors||[]).map(e=>e.code).join(',');throw Error(`Cloudflare ${endpoint} HTTP ${response.status} codes=${codes}`);}
 return parsed;
}
async function findD1(){let page=1;do{const x=await cf(`/d1/database?per_page=50&page=${page}`),rows=Array.isArray(x.result)?x.result:[];const matched=rows.find(r=>r.name===dbName);if(matched)return matched.uuid;const total=x.result_info?.total_pages||1;if(page>=total)break;page++;}while(page<101);return null;}
async function findR2(){const x=await cf('/r2/buckets');const rows=Array.isArray(x.result?.buckets)?x.result.buckets:Array.isArray(x.result)?x.result:[];return rows.some(r=>r.name===bucketName);}
function quoteToml(v){return JSON.stringify(String(v));}
function config(databaseId){return `# AUTO-GENERATED in a private CI runner. Do not commit this file.\nname = ${quoteToml(workerName)}\nmain = "src/worker.js"\ncompatibility_date = "2026-10-01"\nworkers_dev = true\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = ${quoteToml(dbName)}\ndatabase_id = ${quoteToml(databaseId)}\nmigrations_dir = "migrations"\n\n[[r2_buckets]]\nbinding = "MEDIA"\nbucket_name = ${quoteToml(bucketName)}\n\n[assets]\ndirectory = "./public"\nbinding = "ASSETS"\nrun_worker_first = true\n\n[vars]\nACCESS_TEAM = ${quoteToml(env.AESH_ACCESS_TEAM)}\nACCESS_AUD = ${quoteToml(env.AESH_ACCESS_AUD)}\nENABLE_PUBLISH_DISPATCH = "false"\n\n[observability]\nenabled = true\n`;}
if(process.argv.includes('--self-test')){
 env.AESH_CLOUDFLARE_ACCOUNT_ID='0'.repeat(32);env.AESH_CLOUDFLARE_API_TOKEN='dummy';env.AESH_ACCESS_TEAM='test.cloudflareaccess.com';env.AESH_ACCESS_AUD='1'.repeat(64);
 preflight();const conf=config('2'.repeat(32));if(!conf.includes('run_worker_first = true')||conf.includes('routes =')||conf.includes('aesh.ir'))throw Error('Unsafe preview config');
 console.log('PASS staging provisioning safety config self-test');process.exit(0);
}
preflight();
let dbId=await findD1();if(!dbId){const x=await cf('/d1/database','POST',{name:dbName});dbId=x.result?.uuid;if(!dbId)throw Error('Cloudflare did not return new D1 uuid');}
if(!/^[a-f0-9-]{32,36}$/i.test(dbId))throw Error('Invalid D1 id');
if(!await findR2())await cf('/r2/buckets','POST',{name:bucketName});
const destination=path.resolve('wrangler.generated.toml');fs.writeFileSync(destination,config(dbId),{mode:0o600});
console.log('PASS Preview resources exist; generated safe non-production Wrangler config');
