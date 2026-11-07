/* AESH CMS preview API. D1+R2, fail-closed Cloudflare Access JWT verification.
   Does not replace or contact the production Supabase auth system.
   No credentials are bundled into GitHub Pages or this source file. */
const MAX_IMAGE = 2_097_152;
const SLUG = /^[a-z0-9\u0600-\u06ff]+(?:-[a-z0-9\u0600-\u06ff]+)*$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ROLES = new Set(['admin','editor','member']);
const JSON_HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY','cross-origin-resource-policy':'same-origin'};
const asJSON = (obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:JSON_HEADERS});
const error = (code,status=400)=>asJSON({ok:false,error:code},status);
const now = ()=>new Date().toISOString();
const obj = v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const asStr=(v,max=500)=>typeof v==='string'&&v.length<=max?v.trim():'';
const limited=(v,max=200)=>{if(typeof v!=='string'||v.length>max)throw new Error('invalid field');return v.trim();};
function id(){return crypto.randomUUID();}
function slug(value){let v=limited(value,90);if(v.length<2||!SLUG.test(v)||v.includes('--'))throw new Error('invalid slug');return v;}
function pickString(v,max=500){const s=limited(v||'',max);return s;}
function parseJSON(v,defaultValue){try{return JSON.parse(v);}catch{return defaultValue;}}
function listCheck(v,maxItems=24,maxLen=120){if(!Array.isArray(v)||v.length>maxItems)throw new Error('invalid list');return v.map(x=>limited(x,maxLen));}
function accessConfigured(env){return !!(env.ACCESS_TEAM&&env.ACCESS_AUD&&!env.ACCESS_TEAM.startsWith('REPLACE_')&&!env.ACCESS_AUD.startsWith('REPLACE_'));}
function base64url(txt){const clean=txt.replace(/-/g,'+').replace(/_/g,'/');const pad='='.repeat((4-clean.length%4)%4);return Uint8Array.from(atob(clean+pad),c=>c.charCodeAt(0));}
function decoder(txt){return JSON.parse(new TextDecoder().decode(base64url(txt)));}
let certCache={team:'',expires:0,keys:[]};
async function validateAccess(request,env){
  if(!accessConfigured(env))throw new Error('access not configured');
  let jwt=request.headers.get('Cf-Access-Jwt-Assertion')||'';
  if(!jwt){const cookie=request.headers.get('cookie')||'';const match=/(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);jwt=match?decodeURIComponent(match[1]):'';}
  const parts=jwt.split('.');if(parts.length!==3||jwt.length>10000)throw new Error('access token required');
  let hdr,claims;try{hdr=decoder(parts[0]);claims=decoder(parts[1]);}catch{throw new Error('bad access token');}
  if(!obj(hdr)||hdr.alg!=='RS256'||!asStr(hdr.kid,256)||!obj(claims))throw new Error('untrusted access token');
  const ts=Math.floor(Date.now()/1000),aud=claims.aud;
  if(claims.iss!=='https://'+env.ACCESS_TEAM||!Array.isArray(aud)||!aud.includes(env.ACCESS_AUD)||
     typeof claims.exp!=='number'||claims.exp<=ts||typeof claims.nbf==='number'&&claims.nbf>ts||
     typeof claims.iat==='number'&&claims.iat>ts+60||!asStr(claims.sub,512))throw new Error('access claims rejected');
  if(certCache.team!==env.ACCESS_TEAM||certCache.expires<Date.now()){
    const response=await fetch('https://'+env.ACCESS_TEAM+'/cdn-cgi/access/certs',{redirect:'error',signal:AbortSignal.timeout(4000)});
    if(!response.ok)throw new Error('access certificates unavailable');
    const data=await response.json();if(!Array.isArray(data.keys)||data.keys.length>100)throw new Error('untrusted certificates');
    certCache={team:env.ACCESS_TEAM,expires:Date.now()+300000,keys:data.keys};
  }
  const jwk=certCache.keys.find(k=>k.kid===hdr.kid&&k.kty==='RSA'&&k.alg!=='HS256');
  if(!jwk)throw new Error('unknown access certificate');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,base64url(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  if(!verified)throw new Error('access signature rejected');
  return {sub:claims.sub,email:asStr(claims.email,250).toLowerCase()};
}
async function actorFor(request,env){
  const identity=await validateAccess(request,env);
  const row=await env.DB.prepare('SELECT sub,email,role,status FROM actors WHERE sub=?').bind(identity.sub).first();
  if(row?.status==='disabled')throw new Error('account disabled');
  // Bootstrap is scoped to one previously verified Access subject, never to a public email.
  const trustedSub=typeof env.BOOTSTRAP_ADMIN_SUB==='string'&&env.BOOTSTRAP_ADMIN_SUB.length>=16&&identity.sub===env.BOOTSTRAP_ADMIN_SUB;
  // Optional first-time bootstrap by the SIGNED Access identity's verified email.
  // The email is a Worker SECRET and never accepted directly from client input.
  const emailSecret=typeof env.BOOTSTRAP_ADMIN_EMAIL==='string'?env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase():'';
  const trustedEmail=emailSecret.includes('@')&&identity.email===emailSecret;
  if(trustedSub||trustedEmail)return {...identity,role:'admin'};
  if(!row&&identity.email){
    // Explicit admin-issued invitation bound to the signed Access email.
    // Atomic D1 batch rejects concurrent, duplicate or already-linked claims.
    const invite=await env.DB.prepare("SELECT * FROM access_invitations WHERE email=? AND status='invited'").bind(identity.email).first();
    if(invite){
      if(invite.profile_id){
        const linked=await env.DB.prepare('SELECT actor_sub FROM profiles WHERE id=?').bind(invite.profile_id).first();
        if(!linked||linked.actor_sub)throw new Error('profile already linked or unavailable');
      }
      const calls=[env.DB.prepare("INSERT INTO actors(sub,email,role,status) VALUES(?,?,?,'active')").bind(identity.sub,identity.email,invite.role),
        env.DB.prepare("UPDATE access_invitations SET status='accepted',accepted_sub=?,updated_at=? WHERE email=? AND status='invited'").bind(identity.sub,now(),identity.email),
        env.DB.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(identity,'accept-invite','actor',identity.sub))];
      if(invite.profile_id)calls.push(env.DB.prepare('UPDATE profiles SET actor_sub=?,updated_at=? WHERE id=? AND actor_sub IS NULL').bind(identity.sub,now(),invite.profile_id));
      await env.DB.batch(calls);
      return {...identity,role:invite.role};
    }
  }
  if(!row||!ROLES.has(row.role)||row.status!=='active')throw new Error('account not permitted');
  return {...identity,role:row.role};
}
function requireRole(actor,...roles){if(!roles.includes(actor.role))throw new Error('insufficient role');}
function originGuard(request){
  if(['GET','HEAD'].includes(request.method))return;
  const supplied=request.headers.get('Origin');
  if(supplied!==new URL(request.url).origin)throw new Error('origin verification failed');
}
async function bodyJSON(request){
  const ct=request.headers.get('content-type')||'';if(!ct.toLowerCase().startsWith('application/json'))throw new Error('json required');
  const body=await request.text();if(body.length>70000)throw new Error('request too large');
  const parsed=JSON.parse(body);if(!obj(parsed))throw new Error('object required');return parsed;
}
const audited=(actor,action,type,entity)=>[id(),actor.sub,action,type,entity];
async function oneRow(db,table,key){return db.prepare('SELECT * FROM '+table+' WHERE id=?').bind(key).first();}
function validStats(value){
  if(!Array.isArray(value)||value.length>8)throw new Error('invalid stats');
  return value.map(row=>({label:limited(row?.label,70),value:limited(row?.value,40)}));
}
function validPerformance(value){
  if(!Array.isArray(value)||value.length>8)throw new Error('invalid chart');
  return value.map(row=>{const label=limited(row?.label,70),v=row?.value;
    if(!label||typeof v!=='number'||!Number.isInteger(v)||v<0||v>100)throw new Error('chart values must be 0-100');
    return {label,value:v};});
}
function validExternalLink(v){
 if(!v)return '';
 const u=new URL(limited(v,600));if(u.protocol!=='https:'||!u.hostname||u.username||u.password)throw new Error('HTTPS links only');return u.href;
}
function validExtra(value){
  if(!obj(value))throw new Error('invalid extras');
  const fields=['joinDate','rank','availability','work_style','achievements','portfolio_url','rubika'];
  const out={};for(const field of fields){if(value[field]!==undefined){out[field]=limited(value[field],field==='achievements'?1500:300);if(field.endsWith('url')||field==='rubika')out[field]=validExternalLink(out[field]);}}
  return out;
}
function mediaRef(v){if(v===null||v===undefined||v==='')return null;if(typeof v!=='string'||!UUID.test(v))throw new Error('invalid media reference');return v;}
async function assertMedia(db,mediaIds){
  for(const mediaId of new Set(mediaIds.filter(Boolean))){if(!await db.prepare('SELECT id FROM media WHERE id=?').bind(mediaId).first())throw new Error('media not uploaded');}
}
function validateArticleBlocks(blocks){
  if(!Array.isArray(blocks)||blocks.length>120)throw new Error('invalid article blocks');
  return blocks.map(b=>{
    if(!obj(b))throw new Error('invalid article block');
    const t=limited(b.type||'paragraph',18);
    if(['paragraph','quote'].includes(t))return {type:t,text:limited(b.text,5000)};
    if(t==='heading'){const level=b.level===3?3:2;return {type:t,level,text:limited(b.text,200)};}
    if(t==='list')return {type:t,ordered:b.ordered===true,items:listCheck(b.items||[],60,800)};
    if(t==='link')return {type:t,text:limited(b.text,200),url:validExternalLink(b.url)};
    if(t==='image')return {type:t,media_id:mediaRef(b.media_id),alt:limited(b.alt||'',230),caption:limited(b.caption||'',300)};
    throw new Error('unsupported article block');
  });
}
async function adminList(db,kind){
  if(kind==='profiles')return (await db.prepare('SELECT * FROM profiles ORDER BY updated_at DESC LIMIT 500').all()).results;
  if(kind==='works')return (await db.prepare('SELECT * FROM works ORDER BY updated_at DESC LIMIT 500').all()).results;
  if(kind==='articles')return (await db.prepare('SELECT * FROM articles ORDER BY updated_at DESC LIMIT 500').all()).results;
  if(kind==='actors')return (await db.prepare('SELECT * FROM actors ORDER BY updated_at DESC LIMIT 500').all()).results;
  if(kind==='media')return (await db.prepare('SELECT id,content_type,bytes,created_at FROM media ORDER BY created_at DESC LIMIT 200').all()).results;
  if(kind==='profile-requests')return (await db.prepare("SELECT r.*,p.display_name,p.slug FROM profile_requests r JOIN profiles p ON p.id=r.profile_id ORDER BY r.created_at DESC LIMIT 200").all()).results;
  if(kind==='invitations')return (await db.prepare('SELECT * FROM access_invitations ORDER BY created_at DESC LIMIT 300').all()).results;
  if(kind==='audit')return (await db.prepare('SELECT * FROM audit_log ORDER BY at DESC LIMIT 200').all()).results;
  throw new Error('unknown collection');
}
async function saveProfile(db,actor,input){
  requireRole(actor,'admin','editor');
  const existing=input.id?await oneRow(db,'profiles',input.id):null;
  if(input.id&&!existing)throw new Error('profile not found');
  const uuid=existing?.id||id();
  const role=limited(input.role,20),s=slug(input.slug),name=limited(input.display_name,120);
  if(!['teacher','student'].includes(role)||name.length<2)throw new Error('invalid profile identity');
  if(existing&&(existing.role!==role||existing.slug!==s))throw new Error('existing slug and role are immutable');
  const legacyId=input.legacy_id?limited(input.legacy_id,100):existing?.legacy_id||null;
  if(existing&&existing.legacy_id&&legacyId!==existing.legacy_id)throw new Error('legacy link immutable');
  if(legacyId&&legacyId!==existing?.legacy_id)requireRole(actor,'admin');
  const desired=limited(input.status||'draft',20);
  if(!['draft','published','archived'].includes(desired))throw new Error('invalid profile status');
  if(desired==='published'||existing?.status==='published')requireRole(actor,'admin');
  const stats=validStats(input.stats||[]),chart=validPerformance(input.performance||[]);
  const extra=validExtra(input.extra||{}),skills=listCheck(input.skills||[],40,100);
  const mediaId=mediaRef(input.media_id);
  await assertMedia(db,[mediaId]);
  const proposedSub=limited(input.actor_sub||'',512)||null;
  if(existing&&proposedSub!==existing.actor_sub)requireRole(actor,'admin');
  if(proposedSub){
    const linkedActor=await db.prepare("SELECT sub FROM actors WHERE sub=? AND status='active'").bind(proposedSub).first();
    if(!linkedActor)throw new Error('actor identity must exist and be active');
    const other=await db.prepare('SELECT id FROM profiles WHERE actor_sub=? AND id<>?').bind(proposedSub,uuid).first();
    if(other)throw new Error('actor already linked to a different profile');
  }
  const fields=[role,s,name,limited(input.specialty||'',160),limited(input.bio||'',3000),JSON.stringify(skills),JSON.stringify(extra),JSON.stringify(stats),JSON.stringify(chart),mediaId,proposedSub,desired,now()];
  if(existing){
    await db.batch([
      db.prepare('UPDATE profiles SET legacy_id=?,role=?,slug=?,display_name=?,specialty=?,bio=?,skills_json=?,extra_json=?,stats_json=?,performance_json=?,media_id=?,actor_sub=?,status=?,updated_at=? WHERE id=?').bind(legacyId,...fields,uuid),
      db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'update','profile',uuid))
    ]);
  }else{
    await db.batch([
      db.prepare('INSERT INTO profiles(id,legacy_id,role,slug,display_name,specialty,bio,skills_json,extra_json,stats_json,performance_json,media_id,actor_sub,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(uuid,legacyId,...fields),
      db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'create','profile',uuid))
    ]);
  }
  return {id:uuid};
}
async function saveArticle(db,actor,input){
  requireRole(actor,'admin','editor');
  const existing=input.id?await oneRow(db,'articles',input.id):null;
  if(input.id&&!existing)throw new Error('article not found');
  const uuid=existing?.id||id(),s=slug(input.slug),title=limited(input.title,170);
  if(title.length<2)throw new Error('article title required');
  if(existing&&s!==existing.slug)throw new Error('article slug immutable');
  const status=limited(input.status||'draft',20);
  if(!['draft','published','archived'].includes(status))throw new Error('invalid article status');
  if(status==='published'||existing?.status==='published')requireRole(actor,'admin');
  const tags=listCheck(input.tags||[],20,45),blocks=validateArticleBlocks(input.blocks||[]);
  const cover=mediaRef(input.media_id);
  if(status==='published'&&blocks.length===0)throw new Error('cannot publish empty article');
  await assertMedia(db,[cover,...blocks.filter(b=>b.type==='image').map(b=>b.media_id)]);
  const publishedAt=status==='published'?(existing?.published_at||now()):existing?.published_at||null;
  const fields=[s,title,limited(input.excerpt||'',300),limited(input.category||'آموزش',80),JSON.stringify(tags),JSON.stringify(blocks),limited(input.author||'انجمن ادیتوران شایسته',100),limited(input.seo_title||title,160),limited(input.seo_description||input.excerpt||'',220),cover,status,publishedAt,now()];
  if(existing){
    await db.batch([
      db.prepare('UPDATE articles SET slug=?,title=?,excerpt=?,category=?,tags_json=?,blocks_json=?,author=?,seo_title=?,seo_description=?,media_id=?,status=?,published_at=?,updated_at=? WHERE id=?').bind(...fields,uuid),
      db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'update','article',uuid))
    ]);
  }else{
    await db.batch([
      db.prepare('INSERT INTO articles(id,slug,title,excerpt,category,tags_json,blocks_json,author,seo_title,seo_description,media_id,status,published_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(uuid,...fields),
      db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'create','article',uuid))
    ]);
  }
  return {id:uuid};
}
// Member edits to published profiles are queued for explicit server-side approval.
async function memberProfile(db,actor){
  const profile=await db.prepare('SELECT * FROM profiles WHERE actor_sub=? ORDER BY updated_at DESC LIMIT 1').bind(actor.sub).first();
  if(!profile)return {profile:null,pending:null,stats:{total:0,pending:0,published:0,rejected:0}};
  const pending=await db.prepare('SELECT id,status,reason,submitted_json,created_at,updated_at FROM profile_requests WHERE profile_id=? ORDER BY created_at DESC LIMIT 1').bind(profile.id).first();
  const counts=await db.prepare('SELECT status,COUNT(*) AS n FROM works WHERE profile_id=? AND actor_sub=? GROUP BY status').bind(profile.id,actor.sub).all();
  const stats={total:0,pending:0,published:0,rejected:0};
  for(const c of counts.results){stats[c.status]=c.n;stats.total+=c.n;}
  return {profile,pending,stats};
}
async function submitProfileRequest(db,actor,input){
  requireRole(actor,'member','editor','admin');
  const profile=await db.prepare('SELECT id,actor_sub FROM profiles WHERE actor_sub=?').bind(actor.sub).first();
  if(!profile)throw new Error('linked profile required');
  const requested={specialty:limited(input.specialty||'',160),bio:limited(input.bio||'',3000),skills:listCheck(input.skills||[],40,100),media_id:mediaRef(input.media_id)};
  if(requested.media_id){
    const owned=await db.prepare('SELECT id FROM media WHERE id=? AND owner_sub=?').bind(requested.media_id,actor.sub).first();
    if(!owned)throw new Error('media ownership required');
  }
  const existing=await db.prepare("SELECT id FROM profile_requests WHERE profile_id=? AND status='pending'").bind(profile.id).first();
  if(existing)throw new Error('profile request already pending');
  const uuid=id();
  await db.batch([
    db.prepare("INSERT INTO profile_requests(id,profile_id,actor_sub,submitted_json,status) VALUES(?,?,?,?,'pending')").bind(uuid,profile.id,actor.sub,JSON.stringify(requested)),
    db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'request-edit','profile',profile.id))
  ]);
  return {id:uuid,status:'pending'};
}
async function reviewProfileRequest(db,actor,requestId,input){
  requireRole(actor,'admin');
  if(!UUID.test(requestId))throw new Error('invalid profile request id');
  const record=await db.prepare('SELECT * FROM profile_requests WHERE id=?').bind(requestId).first();
  if(!record)throw new Error('profile request not found');
  if(record.status!=='pending')throw new Error('request already reviewed');
  const decision=limited(input.status,20),reason=limited(input.reason||'',500);
  if(!['approved','rejected'].includes(decision))throw new Error('invalid review');
  if(decision==='rejected'&&!reason)throw new Error('rejection reason required');
  const profile=await oneRow(db,'profiles',record.profile_id);
  if(!profile||profile.actor_sub!==record.actor_sub)throw new Error('ownership changed');
  const submitted=parseJSON(record.submitted_json,null);
  if(!obj(submitted))throw new Error('invalid reviewed content');
  const specialty=limited(submitted.specialty||'',160),bio=limited(submitted.bio||'',3000),skills=listCheck(submitted.skills||[],40,100),mediaId=mediaRef(submitted.media_id);
  if(mediaId){const owned=await db.prepare('SELECT id FROM media WHERE id=? AND owner_sub=?').bind(mediaId,record.actor_sub).first();if(!owned)throw new Error('media ownership required');}
  const actions=[db.prepare("UPDATE profile_requests SET status=?,reason=?,reviewed_by=?,updated_at=? WHERE id=? AND status='pending'").bind(decision,reason,actor.sub,now(),requestId),
    db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'review:'+decision,'profile_request',requestId))];
  if(decision==='approved')actions.unshift(db.prepare('UPDATE profiles SET specialty=?,bio=?,skills_json=?,media_id=?,updated_at=? WHERE id=? AND actor_sub=?').bind(specialty,bio,JSON.stringify(skills),mediaId,now(),profile.id,record.actor_sub));
  await db.batch(actions);
  return {id:requestId,status:decision};
}
async function saveWork(db,actor,input){
  requireRole(actor,'admin','editor','member');
  const existing=input.id?await oneRow(db,'works',input.id):null;
  if(input.id&&!existing)throw new Error('work not found');
  const uuid=existing?.id||id(),profileId=limited(input.profile_id,70);
  const profile=await oneRow(db,'profiles',profileId);
  if(!profile)throw new Error('author profile not found');
  if(actor.role==='member'&&profile.actor_sub!==actor.sub)throw new Error('author ownership required');
  if(existing&&existing.profile_id!==profileId)throw new Error('work author immutable');
  if(existing?.status==='published')requireRole(actor,'admin');
  if(existing&&actor.role==='member'&&(!['pending','rejected'].includes(existing.status)||existing.actor_sub!==actor.sub))throw new Error('work not editable');
  const legacyId=input.legacy_id?limited(input.legacy_id,36).toLowerCase():existing?.legacy_id||null;
  if(legacyId){
    if(!UUID.test(legacyId))throw new Error('invalid legacy work id');
    if(actor.role!=='admin')throw new Error('legacy linking requires admin');
  }
  if(existing?.legacy_id&&legacyId!==existing.legacy_id)throw new Error('legacy work link immutable');
  const s=slug(input.slug),title=limited(input.title,130);
  if(title.length<2)throw new Error('work title required');
  if(existing&&s!==existing.slug)throw new Error('work URL immutable');
  const mediaId=mediaRef(input.media_id);if(!mediaId)throw new Error('work media required');
  await assertMedia(db,[mediaId]);
  if(actor.role==='member'){
    const owned=await db.prepare('SELECT id FROM media WHERE id=? AND owner_sub=?').bind(mediaId,actor.sub).first();
    if(!owned)throw new Error('media ownership required');
  }
  const status=(actor.role==='member'&&existing?.status==='rejected')?'pending':(existing?.status||'pending');
  const fields=[profileId,existing?.actor_sub||actor.sub,s,title,limited(input.description||'',1400),mediaId,status,now()];
  if(existing){await db.batch([
    db.prepare("UPDATE works SET profile_id=?,actor_sub=?,slug=?,title=?,description=?,media_id=?,status=?,updated_at=?,rejection_reason=CASE WHEN ?='pending' THEN '' ELSE rejection_reason END,legacy_id=? WHERE id=?").bind(...fields,status,legacyId,uuid),
    db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'update','work',uuid))
  ]);}else{await db.batch([
    db.prepare('INSERT INTO works(id,profile_id,actor_sub,slug,title,description,media_id,status,updated_at,legacy_id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(uuid,...fields,legacyId),
    db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'create','work',uuid))
  ]);}
  return {id:uuid};
}
async function moderateWork(db,actor,idValue,input){
  requireRole(actor,'admin');if(!UUID.test(idValue))throw new Error('invalid work id');
  const original=await oneRow(db,'works',idValue);if(!original)throw new Error('work not found');
  const status=limited(input.status,30),reason=limited(input.rejection_reason||'',500);
  if(!['pending','rejected','published','archived'].includes(status))throw new Error('invalid work status');
  if(status==='rejected'&&!reason)throw new Error('rejection reason required');
  if(status==='published')await assertMedia(db,[original.media_id]);
  await db.batch([
    db.prepare('UPDATE works SET status=?,rejection_reason=?,published_at=?,updated_at=? WHERE id=?').bind(status,reason,status==='published'?original.published_at||now():original.published_at,now(),idValue),
    db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'moderate:'+status,'work',idValue))
  ]);
  return {id:idValue,status};
}
async function inviteAccess(db,actor,input){
  requireRole(actor,'admin');
  const email=limited(input.email||'',250).toLowerCase();
  if(!/^[^@\s]{1,64}@[^@\s]{3,180}$/.test(email))throw new Error('invalid invitation email');
  const role=limited(input.role||'member',20);
  if(!['member','editor'].includes(role))throw new Error('invalid invitation role');
  const profileId=input.profile_id?limited(input.profile_id,70):null;
  if(role==='member'&&!profileId)throw new Error('linked profile required for member invitation');
  if(profileId){
    const profile=await oneRow(db,'profiles',profileId);
    if(!profile||profile.actor_sub)throw new Error('profile already linked or unavailable');
    const current=await db.prepare("SELECT email FROM access_invitations WHERE profile_id=? AND status='invited'").bind(profileId).first();
    if(current&&current.email!==email)throw new Error('profile invitation already pending');
  }
  const prior=await db.prepare('SELECT status FROM access_invitations WHERE email=?').bind(email).first();
  if(prior?.status==='accepted')throw new Error('account already accepted invitation');
  await db.batch([
    db.prepare("INSERT INTO access_invitations(email,role,profile_id,status,invited_by) VALUES(?,?,?,'invited',?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,profile_id=excluded.profile_id,status='invited',accepted_sub=NULL,invited_by=excluded.invited_by,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(email,role,profileId,actor.sub),
    db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'invite:'+role,'actor',email))
  ]);
  return {email,status:'invited',delivery:'manual; Access manages email OTP'};
}
async function revokeInvite(db,actor,input){
  requireRole(actor,'admin');
  const email=limited(input.email||'',250).toLowerCase();
  const prior=await db.prepare('SELECT status FROM access_invitations WHERE email=?').bind(email).first();
  if(!prior||prior.status!=='invited')throw new Error('invitation not found or already accepted');
  await db.batch([
    db.prepare("UPDATE access_invitations SET status='revoked',updated_at=? WHERE email=? AND status='invited'").bind(now(),email),
    db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'revoke-invite','actor',email))
  ]);
  return {email,status:'revoked'};
}
async function saveActor(db,actor,input){
  requireRole(actor,'admin');
  const sub=limited(input.sub,512),email=limited(input.email||'',250).toLowerCase(),role=limited(input.role,16),status=limited(input.status||'active',16);
  if(sub.length<16||!ROLES.has(role)||!['active','disabled'].includes(status))throw new Error('invalid access identity');
  if(sub===actor.sub&&status==='disabled')throw new Error('cannot disable self');
  await db.batch([
    db.prepare("INSERT INTO actors(sub,email,role,status) VALUES(?,?,?,?) ON CONFLICT(sub) DO UPDATE SET email=excluded.email,role=excluded.role,status=excluded.status,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(sub,email,role,status),
    db.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)').bind(...audited(actor,'role:'+role+':'+status,'actor',sub))
  ]);
  return {sub};
}
async function imageUpload(request,env,actor){
  requireRole(actor,'admin','editor','member');
  const length=Number(request.headers.get('content-length')||'0');
  if(length>MAX_IMAGE)throw new Error('image too large');
  const type=(request.headers.get('content-type')||'').toLowerCase().trim();
  if(!['image/jpeg','image/png','image/webp'].includes(type))throw new Error('image type not allowed');
  const bytes=new Uint8Array(await request.arrayBuffer());
  if(!bytes.length||bytes.length>MAX_IMAGE)throw new Error('image too large');
  let okay=false,ext='';
  if(type==='image/jpeg'){okay=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;ext='jpg';}
  else if(type==='image/png'){okay=bytes.length>8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);ext='png';}
  else{okay=bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';ext='webp';}
  if(!okay)throw new Error('image signature mismatch');
  const mediaId=id(),key='private/'+mediaId+'.'+ext;
  await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:type},customMetadata:{uploadedBy:actor.sub}});
  try{await env.DB.prepare('INSERT INTO media(id,object_key,content_type,bytes,owner_sub) VALUES(?,?,?,?,?)').bind(mediaId,key,type,bytes.byteLength,actor.sub).run();}
  catch(e){await env.MEDIA.delete(key);throw e;}
  return {id:mediaId,bytes:bytes.byteLength,content_type:type};
}
async function publicMedia(request,env,mediaId){
  if(!UUID.test(mediaId))return error('unknown media',404);
  const r=await env.DB.prepare(`SELECT m.object_key,m.content_type FROM media m WHERE m.id=? AND (
     EXISTS(SELECT 1 FROM articles a WHERE a.status='published' AND a.media_id=m.id)
     OR EXISTS(SELECT 1 FROM profiles p WHERE p.status='published' AND p.media_id=m.id)
     OR EXISTS(SELECT 1 FROM works w JOIN profiles p ON p.id=w.profile_id WHERE w.status='published' AND p.status='published' AND w.media_id=m.id)
     OR EXISTS(SELECT 1 FROM articles a, json_each(a.blocks_json) j WHERE a.status='published' AND json_extract(j.value,'$.type')='image' AND json_extract(j.value,'$.media_id')=m.id)
   )`).bind(mediaId).first();
  if(!r)return error('unpublished media',404);
  const data=await env.MEDIA.get(r.object_key);if(!data)return error('media missing',404);
  const headers=new Headers({'content-type':r.content_type,'content-security-policy':"default-src 'none'",'cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':'*'});
  return new Response(data.body,{headers});
}
async function privateMedia(env,actor,mediaId){
  if(!UUID.test(mediaId))return error('unknown media',404);
  const row=await env.DB.prepare('SELECT object_key,content_type,owner_sub FROM media WHERE id=?').bind(mediaId).first();
  if(!row)return error('unknown media',404);
  if(actor.role==='member'&&row.owner_sub!==actor.sub)return error('access denied',403);
  const object=await env.MEDIA.get(row.object_key);
  if(!object)return error('media missing',404);
  return new Response(object.body,{headers:{'content-type':row.content_type,'cache-control':'no-store, private',
    'x-content-type-options':'nosniff','cross-origin-resource-policy':'same-origin',
    'content-security-policy':"default-src 'none'"}});
}
function bearerEqual(request,value){
  const got=request.headers.get('Authorization')||'';
  const want='Bearer '+value;
  if(typeof value!=='string'||value.length<32||got.length!==want.length)return false;
  let diff=0;for(let i=0;i<got.length;i++)diff|=got.charCodeAt(i)^want.charCodeAt(i);
  return diff===0;
}
async function snapshot(request,env){
  if(!bearerEqual(request,env.PUBLISH_TOKEN))return error('publish token required',401);
  const [profiles,works,articles,legacy]=await Promise.all([
    env.DB.prepare("SELECT id,legacy_id,role,slug,display_name,specialty,bio,skills_json,extra_json,stats_json,performance_json,media_id,updated_at FROM profiles WHERE status='published' LIMIT 1000").all(),
    env.DB.prepare("SELECT w.id,w.legacy_id,w.profile_id,p.role AS owner_role,p.slug AS owner_slug,p.display_name AS owner_name,w.slug,w.title,w.description,w.media_id,w.published_at FROM works w JOIN profiles p ON w.profile_id=p.id WHERE w.status='published' AND p.status='published' LIMIT 2000").all(),
    env.DB.prepare("SELECT id,slug,title,excerpt,category,tags_json,blocks_json,author,seo_title,seo_description,media_id,published_at FROM articles WHERE status='published' LIMIT 500").all(),
    env.DB.prepare("SELECT legacy_id,slug,status FROM works WHERE legacy_id IS NOT NULL LIMIT 2500").all()
  ]);
  const mediaUrl=(mediaId)=>mediaId?new URL('/v1/public/media/'+encodeURIComponent(mediaId),request.url).href:'';
  return asJSON({version:1,generated_at:now(),
    profiles:profiles.results.map(p=>({id:p.id,legacy_id:p.legacy_id,role:p.role,slug:p.slug,display_name:p.display_name,specialty:p.specialty,bio:p.bio,skills:parseJSON(p.skills_json,[]),extra:parseJSON(p.extra_json,{}),stats:parseJSON(p.stats_json,[]),performance:parseJSON(p.performance_json,[]),image:mediaUrl(p.media_id),updated_at:p.updated_at})),
    works:works.results.map(w=>({...w,image:mediaUrl(w.media_id),media_id:undefined})),
    migrated_legacy_works:legacy.results.map(w=>({legacy_id:w.legacy_id,slug:w.slug,status:w.status})),
    articles:articles.results.map(a=>({id:a.id,slug:a.slug,title:a.title,excerpt:a.excerpt,category:a.category,tags:parseJSON(a.tags_json,[]),blocks:parseJSON(a.blocks_json,[]).map(b=>b.type==='image'?{...b,src:mediaUrl(b.media_id),media_id:undefined}:b),author:a.author,seo_title:a.seo_title,seo_description:a.seo_description,image:mediaUrl(a.media_id),published_at:a.published_at,status:'published'}))
  });
}
async function publishDispatch(env,actor,input){
  requireRole(actor,'admin');
  if(input.confirm!=='REQUEST_REVIEWED_PUBLISH')throw new Error('publish confirmation required');
  if(env.ENABLE_PUBLISH_DISPATCH!=='true'||typeof env.GITHUB_WORKFLOW_TOKEN!=='string'||env.GITHUB_WORKFLOW_TOKEN.length<32)
    return {dispatched:false,reason:'Publication is disabled until explicit staging verification and owner approval'};
  // Fixed repository, workflow and ref prevent redirecting the privileged token.
  const endpoint='https://api.github.com/repos/AalaJavadi/aesh/actions/workflows/aesh-production-pages.yml/dispatches';
  const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'Authorization':'Bearer '+env.GITHUB_WORKFLOW_TOKEN,
    'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'AESH-CMS-Reviewed-Publisher'},
    body:JSON.stringify({ref:'main'})});
  if(response.status!==204)throw new Error('GitHub workflow dispatch refused ('+response.status+')');
  await env.DB.prepare('INSERT INTO audit_log(id,actor_sub,action,entity_type,entity_id) VALUES(?,?,?,?,?)')
    .bind(...audited(actor,'request-publish','release','aesh-production-pages')).run();
  return {dispatched:true,verified:false,message:'GitHub accepted build request; deployment result must be checked separately'};
}
function problem(err){
  const msg=String(err?.message||'request failed').slice(0,200);
  if(/not configured|access certificates/.test(msg))return error('authentication unavailable',503);
  if(/access|role|permitted|disabled|identity|origin|ownership|author ownership/.test(msg))return error('access denied',403);
  if(/already pending|already reviewed|already linked|already accepted|already exists/.test(msg))return error(msg,409);
  if(/not found|unknown|unpublished|linked profile/.test(msg))return error(msg,404);
  if(/UNIQUE constraint|SQLITE_CONSTRAINT/.test(msg))return error('duplicate identity or slug',409);
  if(/FOREIGN KEY constraint/.test(msg))return error('invalid linked record',409);
  if(/JSON|SyntaxError/.test(msg))return error('invalid JSON',400);
  if(/invalid|too large|not allowed|required|immutable|empty|must be|type|field/.test(msg))return error(msg,400);
  console.error('AESH API internal error:',msg);
  return error('temporary service error',500);
}
export default {
  async fetch(request,env){
    const {pathname}=new URL(request.url);
    try{
      if(pathname==='/v1/health'&&request.method==='GET')return asJSON({service:'aesh-cms-preview',operational:!!(env.DB&&env.MEDIA),authConfigured:accessConfigured(env)});
      if(!env.DB||!env.MEDIA)return error('database/media not configured',503);
      if(pathname==='/v1/public/snapshot'&&request.method==='GET')return snapshot(request,env);
      const m=/^\/v1\/public\/media\/([0-9a-f-]{36})$/.exec(pathname);
      if(m&&request.method==='GET')return publicMedia(request,env,m[1]);
      // Other routes require a verified Cloudflare Access identity, including the CMS interface.
      const actor=await actorFor(request,env);
      originGuard(request);
      if(pathname==='/v1/me'&&request.method==='GET')return asJSON({sub:actor.sub,email:actor.email,role:actor.role});
      if(pathname==='/v1/members/profile'&&request.method==='GET')return asJSON(await memberProfile(env.DB,actor));
      if(pathname==='/v1/members/profile-requests'&&request.method==='POST')return asJSON(await submitProfileRequest(env.DB,actor,await bodyJSON(request)));
      if(pathname==='/v1/admin/publish'&&request.method==='POST')return asJSON(await publishDispatch(env,actor,await bodyJSON(request)),202);
      const privateMatch=/^\/v1\/private\/media\/([0-9a-f-]{36})$/.exec(pathname);
      if(privateMatch&&request.method==='GET')return privateMedia(env,actor,privateMatch[1]);
      // Authenticated members need an upload route; /v1/admin/* is role restricted.
      if(pathname==='/v1/members/media'&&request.method==='PUT')return asJSON(await imageUpload(request,env,actor));
      if(['/member/','/member/index.html','/member/member.css','/member/member.js'].includes(pathname)){
        if(request.method!=='GET')return error('method not allowed',405);
        const url=new URL(pathname==='/member/'?'/member/index.html':pathname,request.url);
        const response=await env.ASSETS.fetch(new Request(url,{method:'GET'}));
        const headers=new Headers(response.headers);
        headers.set('cache-control','no-store');
        headers.set('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'");
        headers.set('x-frame-options','DENY');headers.set('x-content-type-options','nosniff');
        return new Response(response.body,{status:response.status,headers});
      }
      if(pathname==='/control/'||pathname==='/control/index.html'||pathname==='/control/control.js'||pathname==='/control/control.css'||pathname==='/control/favicon.png'){
        if(request.method!=='GET')return error('method not allowed',405);
        requireRole(actor,'admin','editor');
        const assetPath=pathname==='/control/'?'/control/index.html':pathname;
        const url=new URL(assetPath,request.url);
        const response=await env.ASSETS.fetch(new Request(url,{method:'GET'}));
        const headers=new Headers(response.headers);
        headers.set('cache-control','no-store');
        headers.set('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'");
        headers.set('x-frame-options','DENY');headers.set('x-content-type-options','nosniff');
        return new Response(response.body,{status:response.status,headers});
      }
      if(pathname.startsWith('/v1/admin/')){
        requireRole(actor,'admin','editor');
        if(request.method==='GET'){
          const kind=pathname.slice('/v1/admin/'.length);
          if(['actors','audit','profile-requests','invitations'].includes(kind))requireRole(actor,'admin');
          return asJSON({items:await adminList(env.DB,kind)});
        }
        if(request.method==='POST'){
          const b=await bodyJSON(request),kind=pathname.slice('/v1/admin/'.length);
          if(kind==='profiles')return asJSON(await saveProfile(env.DB,actor,b));
          if(kind==='articles')return asJSON(await saveArticle(env.DB,actor,b));
          if(kind==='works')return asJSON(await saveWork(env.DB,actor,b));
          if(kind==='actors')return asJSON(await saveActor(env.DB,actor,b));
          if(kind==='invitations')return asJSON(await inviteAccess(env.DB,actor,b));
          if(kind==='invitations/revoke')return asJSON(await revokeInvite(env.DB,actor,b));
          const moderate=/^works\/([0-9a-f-]{36})\/moderate$/.exec(kind);
          if(moderate)return asJSON(await moderateWork(env.DB,actor,moderate[1],b));
          const review=/^profile-requests\/([0-9a-f-]{36})\/review$/.exec(kind);
          if(review)return asJSON(await reviewProfileRequest(env.DB,actor,review[1],b));
        }
        if(pathname==='/v1/admin/media'&&request.method==='PUT')return asJSON(await imageUpload(request,env,actor));
        return error('unknown admin route',404);
      }
      if(pathname==='/v1/members/works'&&request.method==='GET'){
        const data=await env.DB.prepare('SELECT * FROM works WHERE actor_sub=? ORDER BY created_at DESC LIMIT 100').bind(actor.sub).all();
        return asJSON({items:data.results});
      }
      if(pathname==='/v1/members/works'&&request.method==='POST')return asJSON(await saveWork(env.DB,actor,await bodyJSON(request)));
      return error('route not found',404);
    }catch(e){return problem(e);}
  }
};
