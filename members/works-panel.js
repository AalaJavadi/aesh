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
