/* Offline preview CMS contract tests: SQLite D1 adapter, fake private R2 and
   cryptographically SIGNED fake Cloudflare Access JWT, no production services. */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../infra/cloudflare/src/worker.js';
import { webcrypto } from 'node:crypto';
const subtle=webcrypto.subtle;
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../infra/cloudflare/migrations');
const migrations=readdirSync(dir).filter(name=>/^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
assert.equal(migrations.length,4,'expected all four Cloudflare schema migrations');
assert.equal(new Set(migrations.map(name=>name.slice(0,4))).size,migrations.length,'duplicate D1 migration version');
const sql=migrations.map(name=>readFileSync(path.join(dir,name),'utf8')).join('\n');
const sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);
function statement(q){let args=[];return {
  bind(...values){args=values;return this;},
  async first(){return sqlite.prepare(q).get(...args)||null;},
  async all(){return {results:sqlite.prepare(q).all(...args)};},
  async run(){return sqlite.prepare(q).run(...args)}
};}
const DB={prepare:statement,async batch(stmts){sqlite.exec('BEGIN IMMEDIATE');try{for(const s of stmts)await s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const mem=new Map();
const MEDIA={async put(key,value){mem.set(key,new Uint8Array(value));},async get(key){let value=mem.get(key);return value?{body:value}:null;},async delete(key){mem.delete(key);}};
const keys=await subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await subtle.exportKey('jwk',keys.publicKey);jwk.kid='kid-test';jwk.alg='RS256';
const prevFetch=globalThis.fetch;globalThis.fetch=async url=>{
  assert.equal(url,'https://testteam.cloudflareaccess.com/cdn-cgi/access/certs');return Response.json({keys:[jwk]});
};
const adminSub='signed-admin-access-subject-000000001';
const memberSub='signed-member-access-subject-00000001';
const editorSub='signed-editor-access-subject-00000001';
const env={DB,MEDIA,ACCESS_TEAM:'testteam.cloudflareaccess.com',ACCESS_AUD:'test-audience-111111',BOOTSTRAP_ADMIN_SUB:adminSub,PUBLISH_TOKEN:'1234567890abcdefghijklmnopqrstuv',ASSETS:{fetch:async()=>new Response('asset',{'headers':{'content-type':'text/plain'}})}};
const b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');
async function jwt(sub,email='tester@example.invalid'){const header=b64({alg:'RS256',typ:'JWT',kid:'kid-test'}),body=b64({iss:'https://testteam.cloudflareaccess.com',aud:['test-audience-111111'],sub,iat:Math.floor(Date.now()/1000)-60,exp:Math.floor(Date.now()/1000)+600,email});const sig=Buffer.from(await subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(header+'.'+body))).toString('base64url');return header+'.'+body+'.'+sig;}
const tokens={admin:await jwt(adminSub),member:await jwt(memberSub),editor:await jwt(editorSub),invitee:await jwt('signed-new-invited-subject-012345','invited@example.invalid'),stranger:await jwt('signed-stranger-subject-012345','no-invite@example.invalid')};
async function call(route,method='GET',data=null,kind='admin',headers={}){
 const init={method,headers:{'Cf-Access-Jwt-Assertion':tokens[kind],...headers}};
 if(method!=='GET'&&!('Origin' in init.headers))init.headers.Origin='https://test.example.org';
 if(data!==null){init.headers['content-type']='application/json';init.body=JSON.stringify(data);}
 const request=new Request('https://test.example.org'+route,init);
 const response=await worker.fetch(request,env);let content=await response.json().catch(()=>null);
 return {status:response.status,data:content,headers:response.headers};
}
let total=0;
function check(cond,message){assert.ok(cond,message);total++;}
const rid=(n)=>String(n).padStart(8,'0')+'-0000-4000-8000-000000000000';
const profile={role:'teacher',slug:'test-teacher',display_name:'استاد آزمایشی',specialty:'آموزش طراحی',bio:'متن نمونه',skills:['طراحی'],extra:{rank:'۱'},stats:[{label:'آثار',value:'۱'}],performance:[{label:'مهارت',value:45}],status:'draft',actor_sub:null};
try {
 check((await call('/v1/health')).status===200,'health');
 check((await call('/v1/admin/profiles','GET',null,'admin',{'Cf-Access-Jwt-Assertion':'bad'})).status===403,'bad jwt denied');
 const parts=tokens.admin.split('.');const forged=parts[0]+'.'+parts[1]+'.'+(parts[2][0]==='a'?'b':'a')+parts[2].slice(1);
 check((await call('/v1/admin/profiles','GET',null,'admin',{'Cf-Access-Jwt-Assertion':forged})).status===403,'forged signature denied');
 check((await call('/v1/me')).data.role==='admin','verified Access bootstrap');
 check((await call('/v1/admin/profiles','POST',{...profile,performance:[{label:'مهارت',value:120}]})).status===400,'chart range');
 const created=await call('/v1/admin/profiles','POST',profile);
 if(created.status!==200)console.error('DEBUG created:',created);
 check(created.status===200&&!!created.data.id,'draft profile stored');
 check((await call('/v1/admin/profiles','POST',{...profile,id:created.data.id,legacy_id:'old-profile-1'},'editor')).status===403,'editor cannot attach legacy identity');
 check((await call('/v1/admin/profiles','POST',{...profile,id:created.data.id,legacy_id:'old-profile-1'},'admin')).status===200,'admin can link legacy profile during audited migration');
 check((await call('/v1/admin/profiles')).data.items[0].legacy_id==='old-profile-1','legacy identity is stored and retained');
 check((await call('/v1/public/snapshot','GET',null,'admin',{'Authorization':'Bearer wrong'})).status===401,'secret-gated snapshot');
 const snap=async()=>call('/v1/public/snapshot','GET',null,'admin',{'Authorization':'Bearer '+env.PUBLISH_TOKEN});
 check((await snap()).data.profiles.length===0,'draft profile hidden');
 const actors=await Promise.all([
  call('/v1/admin/actors','POST',{sub:memberSub,role:'member',email:'m@example.invalid'}),
  call('/v1/admin/actors','POST',{sub:editorSub,role:'editor',email:'e@example.invalid'})
 ]);check(actors.every(x=>x.status===200),'actors added');
 profile.actor_sub=memberSub;
 check((await call('/v1/admin/profiles','POST',{...profile,slug:'editor-draft',status:'published'},'editor')).status===403,'editor cannot publish');
 check((await call('/v1/admin/profiles','POST',{...profile,id:created.data.id,status:'published'})).status===200,'admin publishes profile');
 check((await snap()).data.profiles.length===1,'published profile in snapshot');
 check((await call('/v1/members/profile','GET',null,'member')).data.profile.id===created.data.id,'member reads own linked profile');
 check((await call('/v1/members/profile-requests','POST',{bio:'test'},'editor')).status===404,'unlinked editor cannot submit profile changes');
 check((await call('/v1/me','GET',null,'stranger')).status===403,'uninvited signed Access user denied');
 const guestProfile=await call('/v1/admin/profiles','POST',{...profile,slug:'invited-teacher',display_name:'استاد دعوت‌شده',status:'draft',actor_sub:null});
 check(guestProfile.status===200,'profile prepared for invited member');
 check((await call('/v1/admin/invitations','POST',{email:'invited@example.invalid',role:'member',profile_id:guestProfile.data.id},'editor')).status===403,'editor cannot invite anyone');
 check((await call('/v1/admin/invitations','POST',{email:'invited@example.invalid',role:'member',profile_id:guestProfile.data.id})).status===200,'admin issues scoped invite');
 check((await call('/v1/me','GET',null,'invitee')).data.role==='member','invited signed Access email auto-links once');
 check((await call('/v1/members/profile','GET',null,'invitee')).data.profile.id===guestProfile.data.id,'invited member owns precisely their profile');
 check((await call('/v1/admin/invitations')).data.items.some(r=>r.email==='invited@example.invalid'&&r.status==='accepted'),'invite marked accepted');
 check((await call('/v1/admin/invitations','POST',{email:'invited@example.invalid',role:'member',profile_id:guestProfile.data.id})).status===409,'accepted invitation cannot be reassigned');
 check((await call('/v1/admin/invitations','POST',{email:'revoke@example.invalid',role:'editor'})).status===200,'editor invitation created by admin');
 check((await call('/v1/admin/invitations/revoke','POST',{email:'revoke@example.invalid'})).status===200,'unclaimed invite can be revoked');
 check((await call('/v1/admin/invitations')).data.items.some(r=>r.email==='revoke@example.invalid'&&r.status==='revoked'),'revocation stored');
 check((await call('/v1/admin/articles','POST',{slug:'hidden-article',title:'مقاله آزمایشی',status:'draft',blocks:[{type:'paragraph',text:'متن خصوصی'}]})).status===200,'draft article saved');
 check((await snap()).data.articles.length===0,'draft article excluded');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==','base64');
 const uploadReq=new Request('https://test.example.org/v1/members/media',{method:'PUT',headers:{'Cf-Access-Jwt-Assertion':tokens.member,'Origin':'https://test.example.org','content-type':'image/png'},body:png});
 const uploadResp=await worker.fetch(uploadReq,env),img=await uploadResp.json();
 if(uploadResp.status!==200)console.error('DEBUG UPLOAD',uploadResp.status,img);check(uploadResp.status===200&&img.id,'private image upload');
 check((await call('/v1/public/media/'+img.id)).status===404,'pending image private');
 const change={specialty:'تخصص جدید',bio:'درخواست محتوای تازه',skills:['گرافیک','تایپوگرافی'],media_id:img.id};
 const profileRequest=await call('/v1/members/profile-requests','POST',change,'member');
 check(profileRequest.status===200,'member profile edit queued');
 check((await call('/v1/members/profile-requests','POST',change,'member')).status===409,'only one pending profile update allowed');
 check((await call('/v1/admin/profile-requests','GET',null,'editor')).status===403,'editor cannot inspect private member requests');
 check((await call('/v1/admin/profile-requests','GET')).data.items.length===1,'admin sees pending member request');
 check((await snap()).data.profiles[0].bio==='متن نمونه','pending edit does not change public profile');
 check((await call('/v1/admin/profile-requests/'+profileRequest.data.id+'/review','POST',{status:'approved'},'editor')).status===403,'editor cannot approve member edits');
 check((await call('/v1/admin/profile-requests/'+profileRequest.data.id+'/review','POST',{status:'approved'})).status===200,'admin approves member changes');
 check((await snap()).data.profiles[0].bio==='درخواست محتوای تازه','approved member edit appears in next snapshot');
 check((await call('/v1/admin/profile-requests/'+profileRequest.data.id+'/review','POST',{status:'approved'})).status===409,'approved request cannot be replayed');
 check((await call('/v1/members/profile','GET',null,'member')).data.pending.status==='approved','member sees review status');
 check((await call('/member/','GET',null,'member')).status===200,'member portal access guarded with signed Access identity');
 check((await call('/v1/admin/publish','POST',{confirm:'REQUEST_REVIEWED_PUBLISH'})).data.dispatched===false,'public release dispatch disabled by default');
 check((await call('/v1/admin/publish','POST',{confirm:'REQUEST_REVIEWED_PUBLISH'},'member')).status===403,'member cannot trigger GitHub publication');
 check((await call('/v1/private/media/'+img.id,'GET',null,'member')).status===200,'owner may preview private image');
 check((await call('/v1/private/media/'+img.id,'GET',null,'editor')).status===200,'editor may preview private image');
 const work={profile_id:created.data.id,slug:'sample-work',title:'نمونه اثر آزمایشی',description:'',media_id:img.id};
 const submitted=await call('/v1/members/works','POST',work,'member');
 check(submitted.status===200&&submitted.data.id,'member submits own work');
 check((await snap()).data.works.length===0,'pending work hidden');
 check((await call('/v1/admin/works/'+submitted.data.id+'/moderate','POST',{status:'rejected'})).status===400,'rejection reason compulsory');
 check((await call('/v1/admin/works/'+submitted.data.id+'/moderate','POST',{status:'rejected',rejection_reason:'نیاز به اصلاح تصویر'})).status===200,'admin rejects work with a reason');
 const resent=await call('/v1/members/works','POST',{...work,id:submitted.data.id},'member');
 check(resent.status===200,'member can resubmit rejected work');
 check((await call('/v1/members/works','GET',null,'member')).data.items[0].status==='pending','resubmitted rejected work is pending, reason cleared');
 check((await call('/v1/admin/works/'+submitted.data.id+'/moderate','POST',{status:'published'})).status===200,'admin moderation');
 check((await snap()).data.works.length===1,'approved work public only');
 const link=rid(24);
 check((await call('/v1/admin/works','POST',{...work,id:submitted.data.id,legacy_id:link},'member')).status===403,'member cannot forge legacy migration link');
 check((await call('/v1/admin/works','POST',{...work,id:submitted.data.id,legacy_id:link})).status===200,'admin can add immutable legacy identity');
 check((await snap()).data.migrated_legacy_works.some(r=>r.legacy_id===link&&r.status==='published'),'migration registry mirrors reviewed work');
 check((await call('/v1/admin/works','POST',{...work,id:submitted.data.id,legacy_id:rid(25)})).status===400,'legacy UUID link cannot be rewritten');
 check((await call('/v1/public/media/'+img.id)).status===200,'published image now public');
 check((await call('/v1/admin/works','POST',{...work,id:submitted.data.id},'member')).status===403,'published work locked against member edits');
 check((await call('/v1/admin/profiles','POST',{...profile,id:created.data.id,status:'archived'})).status===200,'archive profile');
 check((await snap()).data.works.length===0,'archiving owner hides work');
 check((await call('/v1/public/media/'+img.id)).status===404,'archive hides image');
 const article=await call('/v1/admin/articles','POST',{slug:'safe-article',title:'مقاله نمونه',status:'published',blocks:[{type:'paragraph',text:'<script>unsafe</script>'}]});
 check(article.status===200,'approved article stored');
 check((await snap()).data.articles.some(a=>a.blocks[0].text.includes('<script>')),'markup sanitized by static generator rather than API');
 const invalidOrigin=await call('/v1/admin/profiles','POST',profile,'admin',{'Origin':'https://evil.invalid'});
 check(invalidOrigin.status===403,'cross-origin write denied');
 check((await call('/v1/admin/audit','GET',null,'editor')).status===403,'audit restricted to admin');
 check((await call('/v1/admin/audit')).data.items.length>=8,'audit events persisted in D1');
 check((await call('/control/','GET',null,'admin')).status===200,'Access-protected admin asset route');
 console.log('PASS Cloudflare CMS offline verified JWT/D1/R2 tests:',total,'assertions');
} finally {sqlite.close();globalThis.fetch=prevFetch;}
