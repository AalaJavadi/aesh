/* AESH rescue: original scripts in exact order, no logic removed. */

;
/* ========== assets/aesh-config.js ========== */
/* AESH PUBLIC configuration. ONLY the public project URL and publishable key belong here.
 * Never add access passwords, service_role, secret API keys, or database passwords.
 */
window.AESH_SUPABASE_CONFIG = Object.freeze({
  url: 'https://myakibavvzuhqgraqzug.supabase.co',
  publishableKey: 'sb_publishable_2P27Xg01t9BJwYPJBN_tIw_gGLDm9c8'
});

;

;
/* ========== assets/aesh-core.js ========== */
/* AESH v3.25: Supabase Auth + protected RPC adapter.
   Passwords never appear in site files. Refresh sessions persist locally until logout.
   Persisted tokens can be read by JavaScript on this origin; keep the site's CSP tight.
*/
(function () {
  'use strict';
  const config = window.AESH_SUPABASE_CONFIG || {};
  const url = String(config.url || '').trim().replace(/\/+$/, '');
  const publicKey = String(config.publishableKey || '').trim();
  const enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && /^(sb_publishable_|eyJ)[a-z0-9_.-]{12,}$/i.test(publicKey);
  const storageKey = 'aesh:auth-session:v320';
  let session = null;
  let member = null;
  let renewing = null;
  // Try localStorage first, then older sessionStorage values from the previous release.
  let remembered = null;
  try { remembered = localStorage.getItem(storageKey); } catch (_) {}
  if (!remembered) try { remembered = sessionStorage.getItem(storageKey); } catch (_) {}
  try { session = remembered ? JSON.parse(remembered) : null; } catch (_) { session = null; }
  if (session && session.refresh_token) try { localStorage.setItem(storageKey, JSON.stringify(session)); } catch (_) {}
  try { sessionStorage.removeItem(storageKey); } catch (_) {}
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    try { session = event.newValue ? JSON.parse(event.newValue) : null; }
    catch (_) { session = null; }
    member = null;
    window.dispatchEvent(new Event('aesh:session'));
  });
  function alertError(payload, status) {
    const text = String((payload && (payload.error_description || payload.msg || payload.message || payload.error)) || 'خطای ارتباط با سرور').slice(0, 160);
    if (/invalid login credentials/i.test(text)) return 'ایمیل یا رمز عبور اشتباه است.';
    if (/email not confirmed/i.test(text)) return 'ایمیل حساب تأیید نشده است.';
    if (/jwt expired|invalid jwt|session expired/i.test(text)) return 'نشست شما منقضی شده است؛ دوباره وارد شوید.';
    if (/row-level security|permission denied/i.test(text)) return 'مجوز این عملیات را ندارید.';
    return 'خطای سرور (' + status + '): ' + text;
  }
  function save(next) {
    session = next;
    member = null;
    try {
      if (next) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
    } catch (_) {
      // Non-persistent fallback for browsers that block localStorage.
      try { if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
            else sessionStorage.removeItem(storageKey); } catch (_) {}
    }
    window.dispatchEvent(new Event('aesh:session'));
  }
  function configured() { return enabled; }
  function needSetup() { return 'اتصال دیتابیس هنوز تنظیم نشده؛ مدیر باید فایل assets/aesh-config.js را تکمیل کند.'; }
  function authenticated() { return !!(session && session.access_token); }
  async function renew() {
    if (renewing) return renewing;
    if (!session || !session.refresh_token) throw new Error('لطفاً دوباره وارد شوید.');
    renewing = (async () => {
      const response = await fetch(url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', mode: 'cors', cache: 'no-store',
        headers: { 'apikey': publicKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token) { save(null); throw new Error(alertError(data, response.status)); }
      save({ ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) });
      return session;
    })().finally(() => { renewing = null; });
    return renewing;
  }
  const publicReadOnlyRpc = new Set(['aesh_public_works','aesh_public_profiles','aesh_public_directory','aesh_public_reviews']);
  async function call(path, options = {}, privateCall = false, retry = false) {
    if (!enabled) throw new Error(needSetup());
    if (privateCall && !authenticated()) throw new Error('برای این بخش باید وارد حساب شوید.');
    // Anonymous public-only RPC reads must not wait for refresh of a saved login.
    // Never apply this timeout or anonymous path to private reads or writes.
    const publicRpcName = /^\/rest\/v1\/rpc\/(aesh_[a-z0-9_]+)$/.exec(path)?.[1];
    const publicRead = !privateCall && options.method === 'POST' && publicReadOnlyRpc.has(publicRpcName);
    if (!publicRead && authenticated() && (!session.expires_at || session.expires_at < Math.floor(Date.now() / 1000) + 90)) await renew();
    const headers = new Headers(options.headers || {});
    headers.set('apikey', publicKey);
    if (!publicRead && authenticated()) headers.set('Authorization', 'Bearer ' + session.access_token);
    if (options.json !== undefined) { headers.set('Content-Type', 'application/json'); options.body = JSON.stringify(options.json); }
    // Only the strictly whitelisted, non-mutating public RPCs have bounded waits.
    const controller = publicRead ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4200) : null;
    let response, result;
    try {
      response = await fetch(url + path, { ...options, mode: 'cors', cache: 'no-store', headers,
        ...(controller ? { signal: controller.signal } : {}) });
      const type = response.headers.get('content-type') || '';
      result = type.includes('json') ? await response.json().catch(() => ({})) : await response.text();
    } catch (error) {
      if (controller?.signal.aborted) throw new Error('پاسخ اطلاعات عمومی آنلاین به‌موقع نرسید؛ محتوای آماده سایت همچنان در دسترس است.');
      throw error;
    } finally { if (timer !== null) clearTimeout(timer); }
    if (!response.ok) {
      if (response.status === 401 && privateCall && !retry && authenticated()) {
        await renew(); return call(path, options, privateCall, true);
      }
      const error = new Error(alertError(result, response.status));
      error.httpStatus = response.status;
      throw error;
    }
    return result;
  }
  async function rpc(name, params = {}, privateCall = false) {
    return call('/rest/v1/rpc/' + name, { method: 'POST', json: params }, privateCall);
  }
  async function login(email, password) {
    if (!enabled) throw new Error(needSetup());
    const response = await fetch(url + '/auth/v1/token?grant_type=password', {
      method: 'POST', mode: 'cors', cache: 'no-store',
      headers: { 'apikey': publicKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.access_token || !result.refresh_token) throw new Error(alertError(result, response.status));
    save({ ...result, expires_at: Math.floor(Date.now() / 1000) + Number(result.expires_in || 3600) });
    try {
      const person = await myProfile();
      if (!person) { save(null); throw new Error('حساب شما برای ویرایش پروفایل در AESH فعال نشده است.'); }
      return person;
    } catch (error) { save(null); throw error; }
  }
  async function myProfile(force = false) {
    if (!authenticated()) return null;
    if (member && !force) return member;
    const list = await rpc('aesh_my_profile', {}, true);
    member = Array.isArray(list) && list.length ? list[0] : null;
    if (!member) { save(null); return null; }
    return member;
  }
  async function logout() {
    if (authenticated()) {
      // Revokes the refresh token where possible; current page is logged out either way.
      await call('/auth/v1/logout', { method: 'POST' }, true).catch(() => undefined);
    }
    save(null);
  }
  async function saveBioAndAvatar(bio, avatarPath) {
    const result = await rpc('aesh_save_my_profile', { p_bio: String(bio), p_avatar_path: avatarPath || null }, true);
    member = null;
    return Array.isArray(result) ? result[0] : result;
  }
  function publicAvatar(path, timestamp) {
    if (!enabled || !/^([0-9a-f]{8}-[0-9a-f-]{27,})\/avatar\.webp$/i.test(String(path || ''))) return '';
    const src = url + '/storage/v1/object/public/aesh-avatars/' + String(path).split('/').map(encodeURIComponent).join('/');
    return src + (timestamp ? '?v=' + encodeURIComponent(String(timestamp)) : '');
  }
  async function uploadAvatar(blob) {
    const m = await myProfile(true);
    if (!m || !blob || blob.type !== 'image/webp' || blob.size < 1 || blob.size >= 100000) throw new Error('عکس پروفایل باید WebP و کمتر از ۱۰۰ کیلوبایت باشد.');
    const path = m.id + '/avatar.webp';
    await call('/storage/v1/object/aesh-avatars/' + path, {
      method: 'POST', body: blob,
      headers: { 'Content-Type': 'image/webp', 'x-upsert': 'true', 'cache-control': '300' }
    }, true);
    return path;
  }
  // Work uploads are individually authorized at Supabase Storage AND by SQL RPC.
  // No service_role secret, password or hash is shipped to this browser.
  const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const validImageTypes = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });
  function newWorkId() {
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) throw new Error('برای آپلود به یک مرورگر به‌روز با HTTPS نیاز دارید.');
    if (crypto.randomUUID) return crypto.randomUUID();
    const a = crypto.getRandomValues(new Uint8Array(16));
    a[6] = (a[6] & 15) | 64; a[8] = (a[8] & 63) | 128;
    const s = Array.from(a, x => x.toString(16).padStart(2, '0')).join('');
    return s.slice(0,8) + '-' + s.slice(8,12) + '-' + s.slice(12,16) + '-' + s.slice(16,20) + '-' + s.slice(20);
  }
  function canUploadImage(file, isOwner) {
    const limit = 99999;
    if (!file || !validImageTypes[file.type] || !file.size || file.size > limit) {
      throw new Error('تصویر آپلودی نهایی باید JPG، PNG یا WebP و کمتر از ۱۰۰٬۰۰۰ بایت باشد.');
    }
    return validImageTypes[file.type];
  }
  // New object uploads use the smallest necessary request header set. The previous
  // cache-control and x-upsert:false headers were redundant, increased the CORS
  // preflight header set, and could be rejected by some Storage gateways.
  // Repeating a POST after a transport failure is safe here because every work ID
  // is a fresh UUID; if the first POST succeeded but its response was lost,
  // Supabase replies "already exists" and we can continue with that object.
  function isTransportFailure(error) {
    return error instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(String(error && error.message || ''));
  }
  let privacyPreflightAt = 0;
  async function requirePrivateWorkBuckets() {
    if (Date.now() - privacyPreflightAt < 30000) return;
    const result = await rpc('aesh_5_work_buckets_private', {}, true);
    if (result !== true) throw new Error('ارسال تصویر تا تکمیل تنظیمات امنیتی Storage آزمایشی متوقف است.');
    privacyPreflightAt = Date.now();
  }
  async function uploadNewObject(bucket, path, blob) {
    if (['aesh-member-works','aesh-owner-works','aesh-work-thumbs'].includes(bucket)) {
      await requirePrivateWorkBuckets();
    }
    let uncertainFirstAttempt = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await call('/storage/v1/object/' + bucket + '/' + path, {
          method: 'POST', body: blob,
          headers: { 'Content-Type': blob.type }
        }, true);
        return;
      } catch (error) {
        const message = String(error && error.message || '');
        if (uncertainFirstAttempt && (error.httpStatus === 400 || error.httpStatus === 409)
            && /already exists|asset already exists|duplicate/i.test(message)) return;
        if (!isTransportFailure(error)) throw error;
        if (attempt === 2) {
          throw new Error('ارتباط با فضای ذخیره‌سازی تصاویر بعد از چند تلاش برقرار نشد. درخواست به سرور نرسیده یا پاسخ آن توسط شبکه یا مرورگر مسدود شده است.');
        }
        uncertainFirstAttempt = true;
        await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 500 : 1100));
      }
    }
  }
  async function uploadWorkImage(file, id, isOwner) {
    const extension = canUploadImage(file, isOwner);
    if (!uuidShape.test(id)) throw new Error('شناسه آپلود معتبر نیست.');
    const person = await myProfile();
    if (!person || (isOwner ? person.role !== 'owner' : !['teacher','student'].includes(person.role))) throw new Error('مجوز آپلود برای این حساب وجود ندارد.');
    const bucket = isOwner ? 'aesh-owner-works' : 'aesh-member-works';
    const path = person.id + '/' + id + '.' + extension;
    await uploadNewObject(bucket, path, file);
    return path;
  }
  async function uploadWorkThumb(blob, id) {
    if (!uuidShape.test(id) || !blob || blob.type !== 'image/webp' || !blob.size || blob.size >= 100000) {
      throw new Error('تصویر بندانگشتی باید WebP و کمتر از ۱۰۰ کیلوبایت باشد.');
    }
    const person = await myProfile();
    if (!person) throw new Error('حساب مجاز پیدا نشد.');
    const path = person.id + '/' + id + '.webp';
    await uploadNewObject('aesh-work-thumbs', path, blob);
    return path;
  }
  const objPath = /^[0-9a-f]{8}-[0-9a-f-]{27,}\/([0-9a-f-]{36})\.(png|jpg|webp)$/i;
  function publicWorkMedia(bucket, path) {
    if (!enabled || !['aesh-member-works','aesh-owner-works','aesh-work-thumbs'].includes(bucket)) return '';
    if (!objPath.test(String(path || ''))) return '';
    if (bucket === 'aesh-work-thumbs' && !String(path).endsWith('.webp')) return '';
    // Authenticated Storage URLs cannot serve <img> tags with a bearer header.
    // The public Edge gateway checks the published-works RPC BEFORE proxying bytes;
    // pending objects have no public URL, even if their UUID is known.
    return url + '/functions/v1/aesh-approved-media/' + bucket + '/' + String(path).split('/').map(encodeURIComponent).join('/');
  }
  async function publicWorks() { return rpc('aesh_public_works'); }
  async function myWorks() { return rpc('aesh_my_works', {}, true); }
  async function ownerQueue() { return rpc('aesh_owner_work_queue', {}, true); }
  async function submitMyWork(title, description, path, thumb) {
    return rpc('aesh_submit_my_work', { p_title:title, p_description:description, p_object_path:path, p_thumb_path:thumb }, true);
  }
  async function ownerSubmitWork(title, description, path, thumb, role, slugOwner, slug) {
    return rpc('aesh_owner_submit_work', {
      p_title:title,p_description:description,p_object_path:path,p_thumb_path:thumb,
      p_owner_role:role,p_owner_slug:slugOwner,p_slug:slug || null
    }, true);
  }
  async function ownerManageWork(id, status, slug) {
    if (!uuidShape.test(id)) throw new Error('شناسه اثر معتبر نیست.');
    return rpc('aesh_owner_manage_work', { p_work_id:id,p_status:status,p_slug:slug || null }, true);
  }
  // Review media must be fetched WITH the authenticated manager token; never
  // expose an unauthenticated signed URL for a pending submission.
  async function reviewImage(item,small=false) {
    const person=await myProfile(true);
    if(!person||person.role!=='owner')throw new Error('فقط مدیر مجاز می‌تواند تصویر را ببیند.');
    const bucket=small?'aesh-work-thumbs':String(item.bucket_id||'');
    const path=String(small?item.thumb_path:item.object_path||'');
    if(!['aesh-member-works','aesh-owner-works','aesh-work-thumbs'].includes(bucket)||!objPath.test(path))
      throw new Error('مسیر تصویر برای پیش‌نمایش نامعتبر است.');
    if(small&&!path.endsWith('.webp'))throw new Error('نوع تصویر بندانگشتی معتبر نیست.');
    if(session.expires_at<Math.floor(Date.now()/1000)+90)await renew();
    const res=await fetch(url+'/storage/v1/object/authenticated/'+bucket+'/'+path.split('/').map(encodeURIComponent).join('/'),
      {headers:{'apikey':publicKey,'Authorization':'Bearer '+session.access_token},cache:'no-store'});
    if(!res.ok)throw new Error('سرور به تصویر مجوز نداد (HTTP '+res.status+'). سیاست Storage باید بررسی شود.');
    const blob=await res.blob();
    if(!['image/webp','image/jpeg','image/png'].includes(blob.type)||!blob.size||blob.size>20*1024*1024)
      throw new Error('محتوای تصویر معتبر نیست.');
    return blob;
  }
  async function publicDirectory(){return rpc('aesh_public_directory');}
  async function ownerDirectory(){return rpc('aesh_owner_directory',{},true);}
  async function ownerSaveDirectory(values){return rpc('aesh_owner_save_directory',values,true);}
  async function uploadDirectoryPhoto(blob,identifier){
    const person=await myProfile(true);
    if(!person||person.role!=='owner')throw new Error('فقط مدیر می‌تواند تصویر عضو جدید را بارگذاری کند.');
    if(!uuidShape.test(String(identifier))||!blob||blob.type!=='image/webp'||blob.size>=100000||!blob.size)
      throw new Error('تصویر نهایی باید WebP و کمتر از ۱۰۰٬۰۰۰ بایت باشد.');
    // No overwrite: a fresh immutable UUID per upload needs only Storage INSERT.
    // The directory record changes its image_path only AFTER this POST succeeds.
    const path=newWorkId()+'.webp';
    await uploadNewObject('aesh-directory',path,blob);
    return path;
  }
  function publicDirectoryPhoto(path){
    return enabled&&uuidShape.test(String(path||'').replace(/\.webp$/,''))&&String(path).endsWith('.webp')?
     url+'/storage/v1/object/public/aesh-directory/'+encodeURIComponent(path):'';
  }
  async function submitReview(name,body,honey=''){return rpc('aesh_submit_review',{p_display_name:name,p_body:body,p_website:honey});}
  async function publicReviews(){return rpc('aesh_public_reviews');}
  async function ownerReviews(){return rpc('aesh_owner_reviews',{},true);}
  async function moderateReview(id,status){return rpc('aesh_owner_moderate_review',{p_review_id:id,p_status:status},true);}
  window.AESHCore = Object.freeze({
    configured, needSetup, authenticated, login, logout, myProfile, saveBioAndAvatar,
    publicAvatar, uploadAvatar, rpc, base: url,
    newWorkId, canUploadImage, uploadWorkImage, uploadWorkThumb, publicWorkMedia,
    publicWorks, myWorks, ownerQueue, submitMyWork, ownerSubmitWork, ownerManageWork,
    reviewImage,publicDirectory,ownerDirectory,ownerSaveDirectory,uploadDirectoryPhoto,publicDirectoryPhoto,submitReview,publicReviews,ownerReviews,moderateReview
  });
})();

;

;
/* ========== assets/aesh-image.js ========== */
/* AESH 5: common browser-side upload optimizer, never alters archived assets.
 * Note: real enforcement must also happen in Supabase Storage (migration 002).
 */
(function(){
 'use strict';
 const LIMIT=100000;
 const TYPES=['image/jpeg','image/png','image/webp'];
 const MAX_INPUT=20*1024*1024;
 function decode(file){return new Promise((resolve,reject)=>{
   const url=URL.createObjectURL(file), img=new Image();
   img.onload=()=>{URL.revokeObjectURL(url);if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>48000000)
       reject(new Error('ابعاد تصویر معتبر نیست یا بیش از حد بزرگ است.'));else resolve(img);};
   img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('تصویر خراب است یا مرورگر از آن پشتیبانی نمی‌کند.'));};
   img.src=url;
 });}
 function blobFor(canvas,quality){return new Promise((resolve,reject)=>{
   canvas.toBlob(blob=>blob&&blob.type==='image/webp'?resolve(blob):reject(new Error('خروجی WebP در این مرورگر پشتیبانی نمی‌شود.')),'image/webp',quality);
 });}
 async function optimize(file,options={}){
   const maxBytes=Math.min(LIMIT-1,Math.max(1,Number(options.maxBytes)||LIMIT-1));
   if(!(file instanceof Blob)||!TYPES.includes(file.type)||!file.size||file.size>MAX_INPUT)
     throw new Error('فقط JPG، PNG یا WebP تا ۲۰ مگابایت پذیرفته می‌شود.');
   const image=await decode(file),originalWidth=image.naturalWidth,originalHeight=image.naturalHeight;
   const canvas=document.createElement('canvas');
   const context=canvas.getContext('2d',{alpha:true});
   if(!context)throw new Error('مرورگر امکان پردازش تصویر ندارد.');
   context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
   const maxDimension=Math.max(300,Math.min(2800,Number(options.maxDimension)||2800));
   const choices=[...new Set([2800,2200,1800,1500,1250,1050,900,750,620,500,390,300].map(n=>Math.min(n,maxDimension)))];
   for(const longest of choices){
     const scale=Math.min(1,longest/Math.max(originalWidth,originalHeight));
     const w=Math.max(1,Math.round(originalWidth*scale)),h=Math.max(1,Math.round(originalHeight*scale));
     if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;context.drawImage(image,0,0,w,h);}
     for(const quality of [0.94,0.86,0.77,0.67,0.56,0.44,0.32,0.23]){
       const blob=await blobFor(canvas,quality);
       if(blob.size>0&&blob.size<=maxBytes){
         return {blob,width:w,height:h,originalWidth,originalHeight,originalBytes:file.size,
           bytes:blob.size,quality,qualityWarning:quality<0.5||scale<0.5};
       }
     }
   }
   throw new Error('حجم تصویر بدون افت کیفیت شدید به کمتر از ۱۰۰ کیلوبایت نرسید. فایل ساده‌تر یا کوچک‌تری انتخاب کنید.');
 }
 function describe(result){if(!result)return '';
   return 'WebP نهایی: '+(result.bytes/1024).toFixed(1)+' کیلوبایت ('+result.bytes+' بایت) — '+result.width+'×'+result.height+' پیکسل'+(result.qualityWarning?' — قبل از ارسال کیفیت را با دقت بررسی کنید.':'');
 }
 window.AESHImage=Object.freeze({optimize,describe,MAX_BYTES:LIMIT});
})();

;

;
/* ========== members/members.js ========== */
/* Member-only profile editor. Only editable fields: avatar and biography. */
(function () {
  'use strict';
// Non-critical remote font/icon CSS must never block initial paint.
function aeshActivateLateCss() {
  for (const link of document.querySelectorAll('link[data-aesh-noncritical-css]')) link.media = 'all';
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', aeshActivateLateCss, { once: true });
else aeshActivateLateCss();

  const api = window.AESHCore;
  const $ = id => document.getElementById(id);
  let me = null;
  let defaults = {};
  let defaultsPromise = null;
  let selected = null;
  let previewUrl = null;
  let originalAvatar = null;
  let loading = false;
  let avatarRequest = 0;
  let avatarConfirmed = false;
  const roleLabel = role => role === 'teacher' ? 'استاد انجمن' : role === 'student' ? 'هنرجوی انجمن' : 'عضو انجمن';
  const fa = value => Number(value).toLocaleString('fa-IR');
  const show = (id, enabled) => { $(id).hidden = !enabled; };
  function notice(text, error = false) {
    $('notice').textContent = text;
    $('notice').className = 'notice' + (error ? ' error' : '');
    show('notice', !!text);
  }
  function busy(state) {
    loading = state;
    for (const id of ['loginButton', 'saveButton', 'logoutButton']) $(id).disabled = state;
  }
  function counter() { $('bioCounter').textContent = fa($('bio').value.length) + ' / ' + fa(700); }
  function setPreview(source) {
    const img = $('avatarPreview');
    img.hidden = !source; $('avatarBox').querySelector('span').hidden = !!source;
    if (source) img.src = source; else img.removeAttribute('src');
  }
  async function loadDefaultBios() {
    try {
      const response = await fetch('../assets/aesh-profile-defaults.json', { cache: 'no-cache' });
      if (!response.ok) return;
      defaults = await response.json();
    } catch (_) { defaults = {}; }
  }
  function loadDefaultsFor(profile) {
    if (profile.bio != null && profile.avatar_path) return;
    if (!defaultsPromise) defaultsPromise = loadDefaultBios();
    defaultsPromise.then(() => {
      if (me !== profile) return;
      const base = defaults[profile.role + ':' + profile.owner_slug] || {};
      if (profile.bio == null && !$('bio').value && document.activeElement !== $('bio')) {
        $('bio').value = String(base.bio || '');
        counter();
      }
      if (!profile.avatar_path && !selected && !previewUrl && base.image) {
        setPreview(base.image);
      }
    }).catch(() => {});
  }
  async function showDashboard(profile) {
    me = profile;
    document.body.classList.add('aesh-signed-in');
    window.dispatchEvent(new CustomEvent('aesh:member-dashboard', { detail: { profile } }));
    show('login', false);
    show('dashboard', true);
    $('displayName').textContent = profile.display_name;
    $('roleName').textContent = roleLabel(profile.role);
    const base = defaults[profile.role + ':' + profile.owner_slug] || {};
    $('bio').value = profile.bio === null || profile.bio === undefined ? String(base.bio || '') : profile.bio;
    originalAvatar = profile.avatar_path || null;
    setPreview(originalAvatar ? api.publicAvatar(originalAvatar, profile.updated_at) : (base.image || null));
    $('avatar').value = '';
    $('avatarFileName').textContent = 'هنوز تصویری انتخاب نشده است';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null; selected = null; avatarRequest++;avatarConfirmed=false;avatarQualityBox().hidden=true;counter();
    loadDefaultsFor(profile);
  }
  function showLogin() {
    window.dispatchEvent(new Event('aesh:member-logout'));
    me = null; document.body.classList.remove('aesh-signed-in'); show('dashboard', false); show('login', true);
    $('password').value = ''; $('avatar').value = '';
    $('avatarFileName').textContent = 'هنوز تصویری انتخاب نشده است';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null; selected = null; avatarRequest++;avatarConfirmed=false;avatarQualityBox().hidden=true;
  }
  function avatarQualityBox() {
    let box = $('avatarQualityBox');
    if (box) return box;
    box = document.createElement('label');box.id='avatarQualityBox';box.className='quality-confirm';box.hidden=true;
    const check=document.createElement('input');check.type='checkbox';check.id='avatarQualityConfirm';
    check.addEventListener('change',()=>{avatarConfirmed=check.checked;});
    box.append(check,document.createTextNode(' کیفیت پیش‌نمایش فشرده‌شده را بررسی و تأیید می‌کنم.'));
    $('avatar').closest('.avatar-row').after(box);
    return box;
  }
  async function chooseAvatar(file) {
    const request=++avatarRequest;
    selected=null;avatarConfirmed=false;avatarQualityBox().hidden=true;
    if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;
    if (!file) { $('avatarFileName').textContent='هنوز تصویری انتخاب نشده است';return; }
    $('avatarFileName').textContent='در حال فشرده‌سازی خودکار…';
    try {
      const image=await window.AESHImage.optimize(file);
      if(request!==avatarRequest)return;
      selected=image;
      previewUrl=URL.createObjectURL(image.blob);
      setPreview(previewUrl);
      $('avatarFileName').textContent=window.AESHImage.describe(image);
      avatarQualityBox().hidden=!image.qualityWarning;
      if(image.qualityWarning)$('avatarQualityConfirm').checked=false;
    }catch(error){if(request!==avatarRequest)return;selected=null;
      $('avatarFileName').textContent='فشرده‌سازی ناموفق: '+error.message;
      $('avatar').value='';
    }
  }
  async function init() {
    if (!api) { notice('فایل‌های پنل کامل بارگذاری نشده‌اند.', true); return; }
    $('bio').addEventListener('input', counter);
    avatarQualityBox();
    $('avatar').addEventListener('change', () => chooseAvatar($('avatar').files[0] || null));
    $('loginForm').addEventListener('submit', async event => {
      event.preventDefault(); if (loading) return; busy(true); notice('');
      try {
        const person = await api.login($('email').value, $('password').value);
        $('password').value = '';
        await showDashboard(person); notice('ورود به پنل با موفقیت انجام شد.');
      } catch (error) { $('password').value = ''; notice(error.message, true); }
      finally { busy(false); }
    });
    $('profileForm').addEventListener('submit', async event => {
      event.preventDefault(); if (loading || !me) return;
      busy(true); notice('');
      try {
        const bio = $('bio').value.trim();
        if (bio.length > 700) throw new Error('توضیحات نباید بیشتر از ۷۰۰ نویسه باشند.');
        let path = originalAvatar;
        if (selected) {
          if(selected.qualityWarning&&!avatarConfirmed)throw new Error('لطفاً ابتدا کیفیت تصویر فشرده‌شده را تأیید کنید.');
          path = await api.uploadAvatar(selected.blob);
        }
        await api.saveBioAndAvatar(bio, path);
        const profile = await api.myProfile(true);
        if (!profile) throw new Error('حساب فعال پیدا نشد.');
        await showDashboard(profile);
        notice('تصویر و توضیحات روی سرور ذخیره شدند و در پروفایل عمومی نمایش داده می‌شوند.');
      } catch (error) { notice('ذخیره انجام نشد: ' + error.message, true); }
      finally { busy(false); }
    });
    // Other open tabs should immediately reflect a logout.
    window.addEventListener('aesh:session', () => {
      if (me && !api.authenticated()) { showLogin(); notice('نشست شما پایان یافت.'); }
    });
    $('logoutButton').addEventListener('click', async () => {
      if (loading) return; busy(true);
      await api.logout(); showLogin(); busy(false); notice('با موفقیت از حساب خارج شدید.');
    });
    if (!api.configured()) {
      show('setup', true); $('loginButton').disabled = true; return;
    }
    let restoreTimer;
    try {
      const restore = api.myProfile(true).then(
        profile => ({ profile }), error => ({ error })
      );
      const outcome = await Promise.race([
        restore,
        new Promise(resolve => {
          restoreTimer = setTimeout(() => resolve({ timedOut: true }), 6000);
        })
      ]);
      if (me) return; // The user may have signed in while session recovery ran.
      if (outcome.profile) { await showDashboard(outcome.profile); return; }
      if (outcome.timedOut) notice('ارتباط با سرور ورود کند است؛ می‌توانید فرم ورود را امتحان کنید.', true);
      else if (outcome.error) notice('نشست قبلی بررسی نشد؛ دوباره وارد شوید.', true);
    } finally { clearTimeout(restoreTimer); }
    if (!me) showLogin();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

;

;
/* ========== members/works-panel.js ========== */
/* AESH v3.21 work submission + owner moderation.
   The UI never trusts role-based hiding: all restrictions are verified by Supabase RLS/RPC.
   No member slug entry point is exposed; all member works start PENDING. */
(function () {
  'use strict';
  const api = window.AESHCore;
  const $ = id => document.getElementById(id);
  const fa = v => String(v).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  const statusText = { pending:'در انتظار تأیید', published:'منتشرشده', rejected:'ردشده' };
  const types = ['image/jpeg','image/png','image/webp'];
  let compressed = null, choiceSerial = 0, qualityConfirmed = false;
  let reviewUrls = [];
  function revokeReviewUrls(){reviewUrls.forEach(x=>URL.revokeObjectURL(x));reviewUrls=[];}
  let member = null;
  let saving = false;
  let preview = '';
  let serial = 0;
  const isOwner = () => !!(member && member.role === 'owner');
  function setNotice(message, error) {
    const e = $('notice');
    e.textContent = message;
    e.className = error ? 'notice error' : 'notice';
    e.hidden = !message;
    if (message && error) e.scrollIntoView({ behavior:'auto', block:'nearest' });
  }
  function cleanupPreview() {
    if (preview) URL.revokeObjectURL(preview);
    preview = ''; compressed = null; qualityConfirmed = false;
    $('workImagePreviewBox').hidden = true;
    $('workImagePreview').removeAttribute('src');
  }
  function ownerPermission() {
    if (!member) throw new Error('لطفاً ابتدا وارد حساب خود شوید.');
    if (!['owner','teacher','student'].includes(member.role)) throw new Error('این حساب مجوز ارسال نمونه‌کار ندارد.');
  }
  function checkSelection(file) {
    ownerPermission();
    if (!file) throw new Error('ابتدا تصویر نمونه‌کار را انتخاب کنید.');
    if (!types.includes(file.type)) throw new Error('فقط تصاویر JPG، PNG و WebP مجازند.');
    const sizeLimit = 20*1024*1024;
    if (!file.size || file.size > sizeLimit) {
      throw new Error('حجم ورودی نباید بیش از ۲۰ مگابایت باشد.');
    }
    return file;
  }
  function workQualityBox(){
    let box=$('workQualityBox');if(box)return box;
    box=document.createElement('label');box.id='workQualityBox';box.className='quality-confirm';box.hidden=true;
    const check=document.createElement('input');check.type='checkbox';check.addEventListener('change',()=>qualityConfirmed=check.checked);
    box.append(check,document.createTextNode(' کیفیت تصویر نهایی فشرده‌شده را بررسی و تأیید می‌کنم.'));
    $('workImagePreviewBox').after(box);return box;
  }
  async function showFile() {
    const request=++choiceSerial;cleanupPreview();workQualityBox().hidden=true;
    const file=$('workImage').files[0];
    if(!file){$('workFileInfo').textContent='تصویر هنوز انتخاب نشده است.';return;}
    try{
      checkSelection(file);
      $('workFileInfo').textContent='در حال فشرده‌سازی خودکار تصویر…';
      const result=await window.AESHImage.optimize(file);
      if(request!==choiceSerial)return;
      compressed=result;
      $('workFileInfo').textContent=window.AESHImage.describe(result);
      preview=URL.createObjectURL(result.blob);
      $('workImagePreview').src=preview;
      $('workImagePreviewBox').hidden=false;
      workQualityBox().hidden=!result.qualityWarning;
      if(result.qualityWarning)workQualityBox().querySelector('input').checked=false;
    }catch(error){if(request!==choiceSerial)return;
      $('workFileInfo').textContent='فشرده‌سازی ناموفق: '+error.message;
      $('workImage').value='';
    }
  }
  function encodeWebp(canvas, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob && blob.type === 'image/webp' ? resolve(blob) : reject(new Error('مرورگر شما از خروجی WebP پشتیبانی نمی‌کند.')), 'image/webp', quality);
    });
  }
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const obj = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(obj);
        if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 36_000_000) {
          reject(new Error('ابعاد تصویر بیش از حد بزرگ است؛ ابعاد کوچک‌تری انتخاب کنید.'));
        } else resolve(img);
      };
      img.onerror = () => { URL.revokeObjectURL(obj); reject(new Error('فایل انتخاب‌شده تصویر معتبر نیست.')); };
      img.src = obj;
    });
  }
  async function buildThumb(file) {
    const img = await readImage(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha:true });
    if (!ctx) throw new Error('مرورگر از آماده‌سازی تصویر پشتیبانی نمی‌کند.');
    for (const side of [640,480,360,280]) {
      const factor = Math.min(1, side/Math.max(img.naturalWidth,img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth*factor));
      canvas.height = Math.max(1, Math.round(img.naturalHeight*factor));
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      for (const q of [0.82,0.68,0.5,0.34,0.2]) {
        const blob = await encodeWebp(canvas,q);
        if (blob.size>0 && blob.size<=150*1024) return blob;
      }
    }
    throw new Error('ساخت تصویر بندانگشتی کم‌حجم ممکن نشد. از تصویر ساده‌تری استفاده کنید.');
  }
  function normalizeOwnerSlug(raw) {
    const s = String(raw||'').trim().toLowerCase().replace(/[يىئ]/g,'ی').replace(/ك/g,'ک').replace(/[أإٱآ]/g,'ا')
      .replace(/[ةۀ]/g,'ه').replace(/ؤ/g,'و').replace(/[\u064B-\u065F\u0670]/g,'')
      .replace(/[\u200c\u200f\u200e]/g,'-').replace(/[^a-z0-9\u0600-\u06FF]+/gi,'-').replace(/^-+|-+$/g,'').replace(/-+/g,'-');
    if (s && (s.length < 2 || s.length > 90 || !/^[a-z0-9ء-ی]+(?:-[a-z0-9ء-ی]+)*$/.test(s))) throw new Error('اسلاگ باید ۲ تا ۹۰ حرف/عدد با خط تیره باشد.');
    return s;
  }
  // Stable slugs are assigned by the owner RPC on publication, not by users editing DB keys.
  function slugFor(title, id) {
    const cleaned = normalizeOwnerSlug(String(title || '').slice(0, 75));
    const fallback = cleaned || 'اثر';
    const suffix = String(id || '').replace(/[^a-f0-9]/gi, '').slice(0, 8).toLowerCase();
    if (!suffix) throw new Error('شناسه یکتای اثر مشخص نیست.');
    return fallback.slice(0, 90 - suffix.length - 1).replace(/-+$/, '') + '-' + suffix;
  }
  function publicWorkLink(slug) {
    if (!slug) return '';
    return new URL('../work/' + encodeURIComponent(slug) + '/', location.href).href;
  }
  function statusBadge(status) {
    const span = document.createElement('span');
    span.className = 'work-chip ' + (statusText[status] ? status : '');
    span.textContent = statusText[status] || 'نامشخص';
    return span;
  }
  async function loadMyWorks() {
    if (!member) return;
    const stamp = serial;
    const root = $('myWorksList');
    root.replaceChildren();
    const loading = document.createElement('p'); loading.className='secondary'; loading.textContent='در حال دریافت آثار…';root.append(loading);
    try {
      const rows = await api.myWorks();
      if (!member || stamp!==serial) return;
      root.replaceChildren();
      if (!Array.isArray(rows) || !rows.length) { const p=document.createElement('p');p.className='secondary';p.textContent='هنوز اثری ارسال نکرده‌اید.';root.append(p);return; }
      for (const item of rows) {
        const el=document.createElement('div');el.className='work-list-item';
        const info=document.createElement('div');
        const title=document.createElement('strong');title.textContent=String(item.title||'نمونه‌کار');
        const date=document.createElement('time');date.textContent=' — '+new Date(item.created_at).toLocaleDateString('fa-IR');
        info.append(title,date);
        if (item.status === 'published' && item.slug) {
          const link = document.createElement('a');
          link.href = publicWorkLink(item.slug); link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.textContent = 'مشاهده لینک اختصاصی اثر';
          info.append(document.createElement('br'), link);
        }
        el.append(info,statusBadge(item.status));root.append(el);
      }
    } catch(error) { root.textContent='دریافت آثار ممکن نبود: '+error.message; }
  }
  async function loadOwnerOptions() {
    const select=$('workOwner');select.replaceChildren();
    const base=document.createElement('option');base.value='';base.textContent='یک استاد یا هنرجو انتخاب کنید…';select.append(base);
    const response=await fetch('../assets/aesh-work-owners.json', { cache:'no-cache' });
    if (!response.ok) throw new Error('فهرست رسمی اساتید و هنرجویان پیدا نشد.');
    const list=await response.json();
    if (!Array.isArray(list)) throw new Error('فهرست رسمی اعضا نامعتبر است.');
    const more=await api.publicDirectory().catch(()=>[]);
    if(Array.isArray(more))for(const row of more){
      if(['teacher','student'].includes(row.role)&&row.owner_slug&&!list.some(p=>p.role===row.role&&p.slug===row.owner_slug))
        list.push({role:row.role,slug:row.owner_slug,name:row.display_name});
    }
    for (const item of list) {
      if (!['teacher','student'].includes(item.role) || !item.slug) continue;
      const opt=document.createElement('option');
      opt.value=item.role+':'+item.slug;
      opt.textContent=(item.role==='teacher'?'استاد':'هنرجو')+' — '+item.name;
      select.append(opt);
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    try {
      ownerPermission();
      checkSelection($('workImage').files[0]);
      if(!compressed)throw new Error('ابتدا فشرده‌سازی خودکار تصویر کامل شود.');
      if(compressed.qualityWarning&&!qualityConfirmed)throw new Error('لطفاً کیفیت پیش‌نمایش فشرده‌شده را تأیید کنید.');
      const file=compressed.blob;
      if(file.size>=100000)throw new Error('تصویر نهایی بیش از محدودیت حجم است.');
      const title=$('workTitle').value.trim();
      const description=$('workDescription').value.trim();
      if (title.length<2 || title.length>130 || description.length>1400) throw new Error('عنوان یا توضیحات معتبر نیست.');
      let info=null;
      if (isOwner()) {
        if (!$('workOwner').value.includes(':')) throw new Error('صاحب اثر را از فهرست انتخاب کنید.');
        const [role,...slugParts]=$('workOwner').value.split(':');
        const slugOwner=slugParts.join(':');
        info={role,slugOwner};
      }
      saving=true;$('workSubmit').disabled=true;
      $('workSubmit').textContent='در حال بهینه‌سازی و آپلود…';
      setNotice('در حال آماده‌سازی پیش‌نمایش و ارسال امن تصویر…',false);
      const id=api.newWorkId();
      if (info) info.slug = slugFor(title, id);
      const thumb=(await window.AESHImage.optimize(file,{maxBytes:60000})).blob;
      const thumbPath=await api.uploadWorkThumb(thumb,id);
      const imagePath=await api.uploadWorkImage(file,id,isOwner());
      // Only the owner-side RPC accepts owner/slug; the member RPC has NO slug argument.
      if (info) await api.ownerSubmitWork(title,description,imagePath,thumbPath,info.role,info.slugOwner,info.slug);
      else await api.submitMyWork(title,description,imagePath,thumbPath);
      $('workForm').reset();cleanupPreview();showFile();
      setNotice(info ? 'نمونه‌کار منتشر شد. لینک اختصاصی اثر: '+publicWorkLink(info.slug) : 'نمونه‌کار در سرور ذخیره شد و در انتظار تأیید مدیریت است.',false);
      await loadMyWorks();
      if (info) await loadQueue();
    } catch(error) {
      setNotice('ارسال تکمیل نشد: '+error.message,true);
    } finally {
      saving=false;$('workSubmit').disabled=false;
      $('workSubmit').textContent=isOwner()?'ثبت و انتشار نمونه‌کار':'ارسال برای تأیید مدیر';
    }
  }
  async function loadQueue() {
    if (!isOwner()) return;
    const stamp=serial;
    const root=$('reviewList');revokeReviewUrls();root.replaceChildren();
    const loading=document.createElement('p');loading.className='secondary';loading.textContent='در حال بارگذاری آثار برای بررسی…';root.append(loading);
    try {
      const rows=await api.ownerQueue();
      if (!isOwner() || serial!==stamp) return;
      root.replaceChildren();
      if (!Array.isArray(rows)||!rows.length) { const p=document.createElement('p');p.className='secondary';p.textContent='هنوز اثری برای مدیریت ثبت نشده است.';root.append(p);return; }
      for (const item of rows) {
        const card=document.createElement('article');card.className='review-row';
        const h=document.createElement('div');h.className='review-row-header';
        const title=document.createElement('h3');title.textContent=String(item.title||'نمونه‌کار');
        h.append(title,statusBadge(item.status));card.append(h);
        const who=document.createElement('p');who.textContent=(item.owner_name||item.owner_slug||'')+' • '+new Date(item.created_at).toLocaleDateString('fa-IR');card.append(who);
        if (item.description) {const description=document.createElement('p');description.textContent=String(item.description).slice(0,300);card.append(description);}
        // Thumbnail/full preview use the manager session and Storage SELECT permissions.
        const area=document.createElement('div');area.className='aesh-review-picture';
        const mini=document.createElement('img');mini.alt='پیش‌نمایش اثر برای تأیید مدیریت';mini.loading='lazy';
        const pictureMessage=document.createElement('p');pictureMessage.className='secondary small';pictureMessage.textContent='در حال بارگذاری امن تصویر…';
        const expand=document.createElement('button');expand.type='button';expand.className='outline';expand.textContent='بزرگ‌نمایی تصویر';expand.disabled=true;
        area.append(mini,pictureMessage,expand);card.append(area);
        const fullModal=()=>{const dialog=document.createElement('dialog');dialog.className='aesh-image-dialog';
          const close=document.createElement('button');close.type='button';close.textContent='بستن ×';close.className='outline';
          const image=document.createElement('img');image.alt='تصویر کامل اثر: '+String(item.title||'نمونه‌کار');
          const hint=document.createElement('p');hint.textContent='در حال دریافت فایل اصلی با مجوز مدیر…';
          close.addEventListener('click',()=>dialog.close());
          dialog.addEventListener('close',()=>dialog.remove(),{once:true});
          dialog.append(close,image,hint);document.body.append(dialog);dialog.showModal();
          api.reviewImage(item).then(blob=>{if(!dialog.isConnected)return;
            const source=URL.createObjectURL(blob);image.src=source;
            dialog.addEventListener('close',()=>URL.revokeObjectURL(source),{once:true});hint.textContent='تصویر واقعی ذخیره‌شده ('+blob.size+' بایت)';
          }).catch(err=>{if(dialog.isConnected)hint.textContent='دریافت تصویر ممکن نشد: '+err.message;});
        };
        expand.addEventListener('click',fullModal);
        api.reviewImage(item,true).then(blob=>{if(!card.isConnected)return;
          const source=URL.createObjectURL(blob);reviewUrls.push(source);mini.src=source;expand.disabled=false;
          pictureMessage.textContent='پیش‌نمایش نهایی در Storage ('+blob.size+' بایت)';
        }).catch(err=>{if(card.isConnected)pictureMessage.textContent='تصویر در دسترس نیست: '+err.message;});
        const detail=document.createElement('p');detail.className='secondary small';
        detail.textContent='شناسه صاحب اثر: '+String(item.owner_slug||item.owner_id||'نامشخص')+' — شناسه اثر: '+String(item.id||'')+
           ' — ابعاد: '+(Number(item.full_width||item.width)>0&&Number(item.full_height||item.height)>0?
           (Number(item.full_width||item.width)+'×'+Number(item.full_height||item.height)):'ثبت نشده');
        card.append(detail);
        const controls=document.createElement('div');controls.className='review-controls';
        const statusBox=document.createElement('label');statusBox.textContent='وضعیت اثر';
        const select=document.createElement('select');
        for (const v of ['pending','published','rejected']) {const opt=document.createElement('option');opt.value=v;opt.textContent=statusText[v];select.append(opt);}
        select.value=item.status||'pending';statusBox.append(select);
        const previewLink = item.slug || slugFor(item.title, item.id);
        const infoLink = document.createElement('p');
        infoLink.className = 'secondary small';
        infoLink.textContent = item.status === 'published' ? 'لینک اختصاصی ثبت شده است.' : 'لینک اختصاصی هنگام تأیید ساخته می‌شود.';
        if (item.status === 'published' && item.slug) {
          const anchor=document.createElement('a');anchor.className='review-work-link';
          anchor.href=publicWorkLink(item.slug);anchor.target='_blank';anchor.rel='noopener noreferrer';
          anchor.textContent='مشاهده صفحه نمونه‌کار';card.append(anchor);
        }
        card.append(infoLink);
        const button=document.createElement('button');button.type='button';button.textContent='ذخیره تصمیم';
        button.addEventListener('click',async()=>{
          if (!isOwner()||button.disabled) return;
          button.disabled=true;
          try {
            // Keep an existing published link stable; otherwise make a unique one from title.
            const slug = item.slug || (select.value === 'published' ? previewLink : '');
            await api.ownerManageWork(item.id,select.value,slug);
            setNotice(select.value === 'published' ? 'نمونه‌کار منتشر شد و لینک اختصاصی آن ذخیره شد.' : 'وضعیت اثر ذخیره شد.',false);
            await loadQueue();await loadMyWorks();
          } catch(error) {setNotice('ذخیره تصمیم انجام نشد: '+error.message,true);button.disabled=false;}
        });
        controls.append(statusBox,button);card.append(controls);root.append(card);
      }
    } catch(error) {root.textContent='دریافت فهرست مدیریت ممکن نبود: '+error.message;}
  }
  async function onDashboard(profile) {
    serial++;
    member=profile;
    const owner=isOwner();
    $('profileColumns').hidden=owner;
    $('ownerFields').hidden=!owner;
    $('ownerModeration').hidden=!owner;
    $('myWorksList').hidden=false;
    $('sizeTag').textContent='خروجی کمتر از ۱۰۰ کیلوبایت';
    $('workHeading').textContent=owner?'انتشار نمونه‌کار توسط مدیر':'ارسال نمونه‌کار جدید';
    $('workHelp').textContent=owner
      ? 'تصویر انتخابی خودکار به WebP زیر ۱۰۰ کیلوبایت تبدیل می‌شود؛ صاحب اثر را انتخاب کنید.'
      : 'تصویر ورودی به‌طور خودکار به WebP زیر ۱۰۰ کیلوبایت تبدیل می‌شود؛ اثر پس از تأیید منتشر خواهد شد.';
    $('workSubmit').textContent=owner?'ثبت و انتشار نمونه‌کار':'ارسال برای تأیید مدیر';
    $('myWorksList').previousElementSibling.querySelector('h3').textContent=owner?'نمونه‌کارهای آپلودشده مدیر':'نمونه‌کارهای ارسال‌شده من';
    $('workForm').reset();cleanupPreview();showFile();
    if (owner) {
      try {await loadOwnerOptions();} catch(err) {setNotice(err.message,true);}
      if (isOwner()) await loadQueue();
    }
    await loadMyWorks();
  }
  function reset() {
    member=null;serial++;choiceSerial++;revokeReviewUrls();
    if ($('workForm')) $('workForm').reset();
    cleanupPreview();
    $('ownerModeration').hidden=true;
    $('ownerFields').hidden=true;
  }
  function init() {
    if (!api) return;
    workQualityBox();$('workImage').addEventListener('change',showFile);
    $('workForm').addEventListener('submit',submit);
    $('refreshMyWorks').addEventListener('click',loadMyWorks);
    $('refreshQueue').addEventListener('click',loadQueue);
    window.addEventListener('aesh:member-dashboard',e=>onDashboard(e.detail.profile).catch(err=>setNotice(err.message,true)));
    window.addEventListener('aesh:member-logout',reset);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();

;

;
/* ========== members/admin-extra.js ========== */
/* AESH 5: extend existing owner dashboard; all mutations require protected RPC. */
(function(){
 'use strict';
 const api=window.AESHCore,$=id=>document.getElementById(id);
 let owner=false,records=[],selectedId=null,photo=null,photoUrl='',fileSerial=0,busy=false;
 const fa=x=>Number(x||0).toLocaleString('fa-IR');
 const slugify=text=>String(text||'').trim().toLowerCase().replace(/[يىئ]/g,'ی').replace(/ك/g,'ک').replace(/[آأإٱ]/g,'ا')
  .replace(/[\u200c\u200f\u200e]/g,'-').replace(/[^a-z0-9\u0600-\u06ff]+/g,'-').replace(/-+/g,'-').replace(/^-|-+$/g,'').slice(0,90);
 function note(id,message,error=false){$(id).textContent=message;$(id).className='notice'+(error?' error':'');$(id).hidden=!message;}
 function clearPhoto(){fileSerial++;photo=null;if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl='';$('directoryPhoto').value='';$('directoryPhotoText').textContent='هنوز تصویری انتخاب نشده است';$('directoryPhotoPreview').hidden=true;$('directoryPhotoOk').hidden=true;$('directoryPhotoOk').querySelector('input').checked=false;}
 async function pickPhoto(){const file=$('directoryPhoto').files[0],serial=++fileSerial;photo=null;
   if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl='';$('directoryPhotoPreview').hidden=true;$('directoryPhotoOk').hidden=true;
   if(!file){$('directoryPhotoText').textContent='هنوز تصویری انتخاب نشده است';return;}
   $('directoryPhotoText').textContent='در حال فشرده‌سازی خودکار…';
   try{const prepared=await window.AESHImage.optimize(file);if(serial!==fileSerial)return;
     photo=prepared;photoUrl=URL.createObjectURL(prepared.blob);
     $('directoryPhotoPreview').src=photoUrl;$('directoryPhotoPreview').hidden=false;
     $('directoryPhotoText').textContent=window.AESHImage.describe(prepared);
     $('directoryPhotoOk').hidden=!prepared.qualityWarning;
   }catch(err){if(serial===fileSerial){$('directoryPhotoText').textContent='خطا: '+err.message;$('directoryPhoto').value='';}}
 }
 function values(){
   const name=$('directoryName').value.trim(),role=$('directoryRole').value,slug=$('directorySlug').value.trim();
   if(name.length<2||!['teacher','student'].includes(role)||!slug)throw new Error('نام، نوع عضویت و نامک معتبر لازم‌اند.');
   const old=records.find(x=>x.id===selectedId);
   if(old&&(old.role!==role||old.owner_slug!==slug))throw new Error('نامک و نوع عضویت پس از ایجاد قابل تغییر نیستند.');
   const previous=old?.extra&&typeof old.extra==='object'&&!Array.isArray(old.extra)?old.extra:{};
   const extra={...previous};
   const years=$('directoryExperience').value.trim();
   if(years && (!/^(?:[0-9]|[1-5][0-9]|60)$/.test(years)))
     throw new Error('سابقه فعالیت باید عدد صحیح بین صفر تا ۶۰ باشد.');
   const link=$('directoryPortfolioUrl').value.trim();
   if(link){let parsed;try{parsed=new URL(link);}catch(e){throw new Error('لینک نمونه‌کار معتبر نیست.');}
     if(parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)
       throw new Error('لینک نمونه‌کار باید با https:// و بدون رمز باشد.');}
   for(const [key,value] of [
     ['experience_years',years?Number(years):null],
     ['work_style',$('directoryWorkStyle').value.trim().slice(0,120)||null],
     ['portfolio_url',link||null],
     ['achievements',$('directoryAchievements').value.trim().slice(0,300)||null]]){
     if(value===null)delete extra[key];else extra[key]=value;
   }
   for(const [key,id] of [['joinDate','directoryJoinDate'],['rank','directoryRank'],['availability','directoryAvailability'],['rubika','directoryRubika']]){
     const value=$(id).value.trim();
     if(key==='rubika'&&value){const url=new URL(value);if(url.protocol!=='https:'||url.hostname!=='rubika.ir'||url.username||url.password)throw new Error('آدرس روبیکا باید https://rubika.ir/... باشد.');}
     if(value)extra[key]=value;else delete extra[key];
   }
   const stats=[];
   for(let i=1;i<=4;i++){
     const label=$('directoryStat'+i+'Label').value.trim(),value=$('directoryStat'+i+'Value').value.trim();
     if(label||value){if(!label||!value)throw new Error('عنوان و مقدار هر کارت آمار باید هر دو کامل باشند.');stats.push({label,value});}
   }
   if(stats.length)extra.stats=stats;else delete extra.stats;
   const metrics=[];
   for(let i=1;i<=4;i++){
     const label=$('directoryMetric'+i+'Label').value.trim(),v=$('directoryMetric'+i+'Value').value.trim();
     if(label||v){if(!label||!v||!/^(100|[1-9]?[0-9])$/.test(v))throw new Error('هر شاخص باید عنوان و درصد صحیح از صفر تا صد داشته باشد.');metrics.push({label,value:Number(v)});}
   }
   if(metrics.length){extra.chart_items=metrics;extra.chart_title=$('directoryChartTitle').value.trim()||'نمودار عملکرد';}
   else{delete extra.chart_items;delete extra.chart_title;}
   return {p_id:selectedId,p_role:role,p_owner_slug:slug,p_display_name:name,
     p_specialty:$('directorySpecialty').value.trim(),p_skills:$('directorySkills').value.trim(),p_bio:$('directoryBio').value.trim(),
     p_image_path:old?.image_path||null,p_published:$('directoryPublished').checked,
     p_extra:extra};
 }
 function resetForm(){selectedId=null;$('directoryForm').reset();$('directoryPreview').hidden=true;clearPhoto();$('directoryRole').disabled=false;$('directorySlug').readOnly=false;
   $('directorySubmit').textContent='ذخیره اطلاعات عضو';note('directoryNotice','');}
 function fillForm(row){selectedId=row.id;clearPhoto();
   const extra=row.extra&&typeof row.extra==='object'&&!Array.isArray(row.extra)?row.extra:{};
   for(const [id,value] of [['directoryName',row.display_name],['directorySlug',row.owner_slug],['directorySpecialty',row.specialty],['directorySkills',row.skills],['directoryBio',row.bio],
       ['directoryExperience',extra.experience_years],['directoryWorkStyle',extra.work_style],['directoryPortfolioUrl',extra.portfolio_url],['directoryAchievements',extra.achievements],
       ['directoryJoinDate',extra.joinDate],['directoryRank',extra.rank],['directoryAvailability',extra.availability],['directoryRubika',extra.rubika],['directoryChartTitle',extra.chart_title]])
     $(id).value=value??'';
   for(let i=1;i<=4;i++){
     const stat=Array.isArray(extra.stats)?extra.stats[i-1]:null;
     $('directoryStat'+i+'Label').value=stat?.label||'';$('directoryStat'+i+'Value').value=stat?.value||'';
     const metric=Array.isArray(extra.chart_items)?extra.chart_items[i-1]:null;
     $('directoryMetric'+i+'Label').value=metric?.label||'';$('directoryMetric'+i+'Value').value=metric?.value??'';
   }
   $('directoryRole').value=row.role;$('directoryRole').disabled=true;$('directorySlug').readOnly=true;
   $('directoryPublished').checked=!!row.published;$('directorySubmit').textContent='ثبت تغییرات این عضو';
   if(row.image_path){const src=api.publicDirectoryPhoto(row.image_path);if(src){$('directoryPhotoPreview').src=src;$('directoryPhotoPreview').hidden=false;}}
   $('directoryName').focus();note('directoryNotice','در حال ویرایش پروفایل موجود؛ شناسه و URL ثابت می‌مانند.');
 }
 function previewDirectory(){
   try{
     const data=values(),extra=data.p_extra;
     const wrap=$('directoryPreviewContent');wrap.replaceChildren();
     const h=document.createElement('h4');h.textContent=data.p_display_name+' — '+(data.p_role==='teacher'?'استاد':'هنرجو');wrap.append(h);
     const bio=document.createElement('p');bio.textContent=data.p_bio||'بدون بیوگرافی';wrap.append(bio);
     const info=document.createElement('p');info.textContent=[data.p_specialty,extra.rank,extra.availability].filter(Boolean).join(' · ');wrap.append(info);
     if(extra.stats?.length){const cards=document.createElement('div');cards.className='aesh-preview-stats';
       for(const v of extra.stats){const item=document.createElement('div');const strong=document.createElement('strong');strong.textContent=v.value;const label=document.createElement('span');label.textContent=v.label;item.append(strong,label);cards.append(item);}wrap.append(cards);}
     if(extra.chart_items?.length){const title=document.createElement('h5');title.textContent=extra.chart_title;wrap.append(title);
       for(const metric of extra.chart_items){const row=document.createElement('div');row.className='aesh-preview-metric';
         const label=document.createElement('span');label.textContent=metric.label+' ('+metric.value+'٪)';
         const track=document.createElement('div');const bar=document.createElement('div');bar.style.width=metric.value+'%';track.append(bar);row.append(label,track);wrap.append(row);}}
     $('directoryPreview').hidden=false;note('directoryNotice','این پیش‌نمایش محلی است؛ فقط بعد از ذخیره و ساخت HTML عمومی منتشر می‌شود.');
   }catch(err){note('directoryNotice','پیش‌نمایش ممکن نیست: '+err.message,true);}
 }
 function item(text,cls=''){const x=document.createElement('span');x.textContent=text;x.className=cls;return x;}
 async function reloadDirectory(){
   const wrap=$('directoryList');wrap.textContent='در حال دریافت رکوردهای واقعی…';
   try{const list=await api.ownerDirectory();if(!owner)return;records=Array.isArray(list)?list:[];wrap.replaceChildren();
     if(!records.length){wrap.textContent='هنوز پروفایل جدیدی ثبت نشده است.';return;}
     for(const row of records){const card=document.createElement('div');card.className='aesh-admin-list-row';
       const label=item((row.role==='teacher'?'استاد':'هنرجو')+' — '+row.display_name+' ('+row.owner_slug+')');
       const flag=item(row.published?'قابل مشاهده در فهرست':'پیش‌نویس منتشرنشده','secondary');
       const edit=document.createElement('button');edit.type='button';edit.className='outline';edit.textContent='ویرایش';edit.addEventListener('click',()=>fillForm(row));
       card.append(label,flag,edit);wrap.append(card);
     }
   }catch(err){wrap.textContent='دریافت رکوردها ممکن نیست: '+err.message;}
 }
 async function submitDirectory(event){event.preventDefault();if(!owner||busy)return;
   busy=true;$('directorySubmit').disabled=true;
   try{const info=values();if(photo?.qualityWarning&&!$('directoryPhotoOk').querySelector('input').checked)
       throw new Error('لطفاً کیفیت پیش‌نمایش تصویر را تأیید کنید.');
     // Keep new/updated row in draft until the actual image upload succeeds.
     const desired=info.p_published;if(photo)info.p_published=false;
     note('directoryNotice','در حال ذخیره داده در Supabase…');
     const id=await api.ownerSaveDirectory(info);
     if(!id)throw new Error('سرور شناسه پروفایل ایجادشده را برنگرداند.');
     if(photo){info.p_id=id;info.p_image_path=await api.uploadDirectoryPhoto(photo.blob,id);
       info.p_published=desired;await api.ownerSaveDirectory(info);}
     resetForm();await reloadDirectory();
     note('directoryNotice','اطلاعات در Supabase ذخیره شد. برای HTML اختصاصی و SEO باید GitHub Actions اجرا و نتیجه استقرار بررسی شود. حساب ورود جداگانه ساخته نشده است.');
   }catch(err){note('directoryNotice','ذخیره تکمیل نشد: '+err.message,true);}
   finally{busy=false;$('directorySubmit').disabled=false;}
 }
 async function reloadReviews(){const list=$('adminReviewsList');list.textContent='در حال دریافت نظرات از پایگاه داده…';
   try{const rows=await api.ownerReviews();if(!owner)return;list.replaceChildren();
     if(!rows.length){list.textContent='هنوز نظری ثبت نشده است.';return;}
     for(const row of rows){const article=document.createElement('article');article.className='aesh-admin-list-row';
       const title=document.createElement('strong');title.textContent=row.display_name+' — '+new Date(row.created_at).toLocaleDateString('fa-IR');
       const body=document.createElement('p');body.textContent=row.body;
       const status=item({pending:'در انتظار',approved:'تأییدشده',rejected:'ردشده'}[row.status]||row.status,'secondary');
       const actions=document.createElement('div');actions.className='aesh-admin-actions';
       for(const [state,txt] of [['approved','تأیید و انتشار'],['rejected','رد / لغو انتشار'],['pending','برگشت به صف']]){
         const btn=document.createElement('button');btn.type='button';btn.className='outline';btn.textContent=txt;btn.disabled=state===row.status;
         btn.addEventListener('click',async()=>{if(btn.disabled)return;for(const el of actions.querySelectorAll('button'))el.disabled=true;
           try{await api.moderateReview(row.id,state);note('adminReviewsNotice','تصمیم در پایگاه داده ثبت شد.');await reloadReviews();}
           catch(err){note('adminReviewsNotice','تغییر وضعیت ذخیره نشد: '+err.message,true);for(const el of actions.querySelectorAll('button'))el.disabled=false;}
         });actions.append(btn);
       }
       article.append(title,status,body,actions);list.append(article);
     }
   }catch(err){list.textContent='دریافت نظرات ممکن نیست: '+err.message;}
 }
 async function dashboard(profile){owner=profile?.role==='owner';$('ownerDirectory').hidden=!owner;$('ownerReviews').hidden=!owner;
   if(!owner){clearPhoto();return;}await Promise.all([reloadDirectory(),reloadReviews()]);}
 function init(){
   $('directoryName').addEventListener('input',()=>{if(!selectedId)$('directorySlug').value=slugify($('directoryName').value);});
   $('directoryPhoto').addEventListener('change',pickPhoto);
   $('directoryForm').addEventListener('submit',submitDirectory);
   $('directoryPreviewButton').addEventListener('click',previewDirectory);
   $('directoryReset').addEventListener('click',resetForm);
   $('directoryRefresh').addEventListener('click',reloadDirectory);
   $('adminReviewsRefresh').addEventListener('click',reloadReviews);
   window.addEventListener('aesh:member-dashboard',event=>dashboard(event.detail.profile));
   window.addEventListener('aesh:member-logout',()=>{owner=false;$('ownerDirectory').hidden=true;$('ownerReviews').hidden=true;records=[];resetForm();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

;
