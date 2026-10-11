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
  async function call(path, options = {}, privateCall = false, retry = false) {
    if (!enabled) throw new Error(needSetup());
    if (privateCall && !authenticated()) throw new Error('برای این بخش باید وارد حساب شوید.');
    if (authenticated() && (!session.expires_at || session.expires_at < Math.floor(Date.now() / 1000) + 90)) await renew();
    const headers = new Headers(options.headers || {});
    headers.set('apikey', publicKey);
    if (authenticated()) headers.set('Authorization', 'Bearer ' + session.access_token);
    if (options.json !== undefined) { headers.set('Content-Type', 'application/json'); options.body = JSON.stringify(options.json); }
    const response = await fetch(url + path, { ...options, mode: 'cors', cache: 'no-store', headers });
    const type = response.headers.get('content-type') || '';
    const result = type.includes('json') ? await response.json().catch(() => ({})) : await response.text();
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
    if (!m || !blob || blob.type !== 'image/webp' || blob.size < 1 || blob.size > 249999) throw new Error('عکس پروفایل باید WebP و کمتر از ۲۵۰ کیلوبایت باشد.');
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
    const limit = isOwner ? 12 * 1024 * 1024 : 400 * 1024;
    if (!file || !validImageTypes[file.type] || !file.size || file.size > limit) {
      throw new Error(isOwner ? 'تصویر باید JPG، PNG یا WebP با حجم حداکثر ۱۲ مگابایت باشد.' : 'تصویر باید JPG، PNG یا WebP با حجم حداکثر ۴۰۰ کیلوبایت باشد.');
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
  async function uploadNewObject(bucket, path, blob) {
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
    if (!uuidShape.test(id) || !blob || blob.type !== 'image/webp' || !blob.size || blob.size > 150 * 1024) {
      throw new Error('تصویر بندانگشتی باید WebP و حداکثر ۱۵۰ کیلوبایت باشد.');
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
    return url + '/storage/v1/object/public/' + bucket + '/' + String(path).split('/').map(encodeURIComponent).join('/');
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
  window.AESHCore = Object.freeze({
    configured, needSetup, authenticated, login, logout, myProfile, saveBioAndAvatar,
    publicAvatar, uploadAvatar, rpc, base: url,
    newWorkId, canUploadImage, uploadWorkImage, uploadWorkThumb, publicWorkMedia,
    publicWorks, myWorks, ownerQueue, submitMyWork, ownerSubmitWork, ownerManageWork
  });
})();
