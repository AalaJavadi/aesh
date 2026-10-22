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
    await loadDefaultBios();
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
    try {
      const profile = await api.myProfile(true);
      if (profile) { await showDashboard(profile); return; }
    } catch (error) { notice('نشست قبلی معتبر نبود؛ دوباره وارد شوید.', true); }
    showLogin();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
