/* Member-only profile editor. Only editable fields: avatar and biography. */
(function () {
  'use strict';
  const api = window.AESHCore;
  const $ = id => document.getElementById(id);
  let me = null;
  let defaults = {};
  let selected = null;
  let previewUrl = null;
  let originalAvatar = null;
  let loading = false;
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
  async function showDashboard(profile) {
    me = profile;
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
    previewUrl = null; selected = null; counter();
  }
  function showLogin() {
    window.dispatchEvent(new Event('aesh:member-logout'));
    me = null; show('dashboard', false); show('login', true);
    $('password').value = ''; $('avatar').value = '';
    $('avatarFileName').textContent = 'هنوز تصویری انتخاب نشده است';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null; selected = null;
  }
  function resizeAvatar(file) {
    return new Promise(async (resolve, reject) => {
      const types = ['image/jpeg', 'image/png', 'image/webp'];
      if (!file || !types.includes(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024) {
        reject(new Error('عکس باید JPG، PNG یا WebP و کمتر از ۸ مگابایت باشد.')); return;
      }
      const temp = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          URL.revokeObjectURL(temp);
          if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 25000000) throw new Error('ابعاد تصویر قابل قبول نیست.');
          const canvas = document.createElement('canvas');
          const ratio = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
          canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
          canvas.getContext('2d', { alpha: false }).drawImage(img, 0, 0, canvas.width, canvas.height);
          const quality = [0.82, 0.67, 0.52, 0.38, 0.25];
          const encode = index => {
            canvas.toBlob(blob => {
              if (!blob || blob.type !== 'image/webp') { reject(new Error('مرورگر شما تبدیل تصویر به WebP را پشتیبانی نمی‌کند.')); return; }
              if (blob.size <= 249999 && blob.size > 0) { resolve(blob); return; }
              if (index + 1 >= quality.length) { reject(new Error('تصویر هنوز خیلی سنگین است؛ عکس کوچک‌تری انتخاب کنید.')); return; }
              encode(index + 1);
            }, 'image/webp', quality[index]);
          };
          encode(0);
        } catch (error) { reject(error); }
      };
      img.onerror = () => { URL.revokeObjectURL(temp); reject(new Error('این فایل تصویر معتبر و قابل‌نمایش نیست.')); };
      img.src = temp;
    });
  }
  async function init() {
    if (!api) { notice('فایل‌های پنل کامل بارگذاری نشده‌اند.', true); return; }
    await loadDefaultBios();
    $('bio').addEventListener('input', counter);
    $('avatar').addEventListener('change', () => {
      selected = $('avatar').files[0] || null;
      $('avatarFileName').textContent = selected ? selected.name.slice(0, 65) : 'هنوز تصویری انتخاب نشده است';
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = selected ? URL.createObjectURL(selected) : null;
      if (previewUrl) setPreview(previewUrl);
      else if (me) {
        const base = defaults[me.role + ':' + me.owner_slug] || {};
        setPreview(originalAvatar ? api.publicAvatar(originalAvatar, me.updated_at) : base.image || null);
      }
    });
    $('loginForm').addEventListener('submit', async event => {
      event.preventDefault(); if (loading) return; busy(true); notice('');
      try {
        const person = await api.login($('email').value, $('password').value);
        $('password').value = '';
        await showDashboard(person); notice('به پنل اختصاصی خودت وارد شدی.');
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
          const upload = await resizeAvatar(selected);
          path = await api.uploadAvatar(upload);
        }
        await api.saveBioAndAvatar(bio, path);
        const profile = await api.myProfile(true);
        if (!profile) throw new Error('حساب فعال پیدا نشد.');
        await showDashboard(profile);
        notice('تصویر و توضیحات روی سرور ذخیره شدند و در پروفایل عمومی نمایش داده می‌شوند.');
      } catch (error) { notice('ذخیره انجام نشد: ' + error.message, true); }
      finally { busy(false); }
    });
    $('logoutButton').addEventListener('click', async () => {
      if (loading) return; busy(true);
      await api.logout(); showLogin(); busy(false); notice('از حساب خارج شدید.');
    });
    if (!api.configured()) {
      show('setup', true); $('loginButton').disabled = true; return;
    }
    try {
      const profile = await api.myProfile(true);
      if (profile) { await showDashboard(profile); return; }
    } catch (error) { notice('نشست قبلی معتبر نبود؛ دوباره وارد شوید.', true); }
    showLogin();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
