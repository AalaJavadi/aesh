/* AESH: only on 404. Allows newly published work URLs to display before next
   Github Actions build (HTTP 404 remains until static HTML is generated). */
(async function(){
'use strict';
const path=decodeURIComponent(location.pathname);
const m=/^\/work\/([\w\u0600-\u06ff-]{1,110})\/?$/u.exec(path);
if(!m)return;
const valid=(s)=>/^[\w\u0600-\u06ff]+(?:-[\w\u0600-\u06ff]+)*$/u.test(s);
if(!valid(m[1]))return;
const el=document.getElementById('aeshCloudFallback');
if(!el)return;
el.hidden=false;
el.querySelector('[data-status]').textContent='در حال بررسی اثر منتشرشده…';
try{
 const api=window.AESHCore;
 if(!api||!api.configured())throw new Error('config');
 const rows=await api.publicWorks();
 const row=Array.isArray(rows)?rows.find(w=>w&&w.slug===m[1]&&w.status!=='rejected'):null;
 if(!row)throw new Error('not found');
 const media=api.publicWorkMedia(row.bucket_id,row.object_path);
 if(!media)throw new Error('media');
 const section=el.querySelector('[data-work]');
 const pic=document.createElement('img');pic.src=media;pic.alt='اثر '+String(row.title||'بدون عنوان');pic.decoding='async';pic.style.cssText='max-width:100%;width:auto;max-height:none;object-fit:contain;border-radius:18px';
 section.replaceChildren(pic);
 el.querySelector('[data-title]').textContent=String(row.title||'نمونه‌کار');
 el.querySelector('[data-owner]').textContent=String(row.owner_name||'عضو انجمن');
 el.querySelector('[data-desc]').textContent=String(row.description||'');
 el.querySelector('[data-status]').textContent='این اثر منتشر شده است؛ نسخه HTML قابل ایندکس با اجرای بعدی ساخت سایت اضافه می‌شود.';
 document.title=String(row.title||'نمونه‌کار')+' | AESH';
}catch(error){el.querySelector('[data-status]').textContent='اثری با این نشانی یافت نشد. می‌توانید گالری را بررسی کنید.';}
})();
