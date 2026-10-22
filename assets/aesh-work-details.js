/* Correct image dimensions; archived cloud snapshots must be validated online. */
(function(){
 'use strict';
 const api=window.AESHCore,main=document.getElementById('main-content');if(!main)return;
 const media=document.getElementById('portfolioDetailMedia'),id=document.body.getAttribute('data-aesh-work-id')||'';
 if(!media)return;
 const dims=document.createElement('p');dims.className='aesh-real-dimensions';dims.setAttribute('aria-live','polite');media.after(dims);
 function dimensions(w,h){if(w>0&&h>0)dims.textContent='ابعاد واقعی تصویر: '+w+' × '+h+' پیکسل';else dims.textContent='ابعاد تصویر هنوز مشخص نشده است.';}
 function attach(image,width,height){if(!image){dimensions(0,0);return;}
   const update=()=>dimensions(Number(width)||image.naturalWidth,Number(height)||image.naturalHeight);
   if(image.complete&&image.naturalWidth)update();else image.addEventListener('load',update,{once:true});
   image.addEventListener('error',()=>{dims.textContent='تصویر در دسترس نیست.';},{once:true});
 }
 const existing=media.querySelector('img');
 if(existing)attach(existing,Number(existing.dataset.originalWidth),Number(existing.dataset.originalHeight));
 if(!id.startsWith('cloud:'))return;
 main.hidden=true;
 const notice=document.createElement('p');notice.className='aesh-cloud-detail-notice';notice.textContent='در حال بررسی وضعیت انتشار این اثر…';main.after(notice);
 if(!api||!api.configured()){notice.textContent='وضعیت انتشار این اثر بدون ارتباط با سرور قابل تأیید نیست.';return;}
 api.publicWorks().then(rows=>{
   if(!Array.isArray(rows))throw Error('پاسخ انتشار معتبر نیست.');
   const r=rows.find(w=>'cloud:'+w.id===id&&(w.status===undefined||w.status==='published'));
   if(!r){notice.textContent='این نمونه‌کار در حال حاضر منتشرشده نیست.';return;}
   const url=api.publicWorkMedia(r.bucket_id,r.object_path);
   if(!url){notice.textContent='مسیر تصویر این اثر معتبر نیست.';return;}
   const title=document.getElementById('portfolioDetailTitle'),owner=document.getElementById('portfolioDetailOwner'),desc=document.getElementById('portfolioDetailDesc');
   if(title)title.textContent=String(r.title||'نمونه‌کار');
   if(owner)owner.textContent=String(r.owner_name||'');
   if(desc)desc.textContent=String(r.description||'');
   media.replaceChildren();const img=document.createElement('img');img.src=url;img.alt=String(r.title||'نمونه‌کار');img.decoding='async';media.append(img);
   attach(img,Number(r.full_width||r.width),Number(r.full_height||r.height));
   notice.remove();main.hidden=false;
 }).catch(e=>{notice.textContent='انتشار اثر از سرور قابل تأیید نیست؛ اطلاعات قدیمی به‌صورت عمومی نمایش داده نشد.';});
})();
