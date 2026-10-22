/* AESH 5: publicly readable approved association reviews; anonymous pending form. */
(function(){
 'use strict';
 const section=document.getElementById('aeshReviews'),api=window.AESHCore;
 if(!section||!api)return;
 const form=section.querySelector('form'),list=section.querySelector('[data-reviews-list]');
 const feedback=section.querySelector('[data-reviews-message]'),button=section.querySelector('button[type=submit]');
 function msg(s,err=false){feedback.textContent=s;feedback.classList.toggle('aesh-form-error',err);}
 async function load(){
   if(!api.configured()){list.textContent='بخش نظرات پس از تنظیم اتصال پایگاه داده فعال می‌شود.';return;}
   list.textContent='در حال دریافت نظرات تأییدشده…';
   try{const rows=await api.publicReviews();list.replaceChildren();
     if(!Array.isArray(rows)||!rows.length){list.textContent='هنوز نظر تأییدشده‌ای وجود ندارد.';return;}
     for(const r of rows){const article=document.createElement('article');article.className='aesh-review-card';
       const h=document.createElement('strong');h.textContent=String(r.display_name||'کاربر');
       const p=document.createElement('p');p.textContent=String(r.body||'');
       const date=document.createElement('time');date.textContent=new Date(r.created_at).toLocaleDateString('fa-IR');
       article.append(h,p,date);list.append(article);}
   }catch(err){list.textContent='دریافت نظرات در حال حاضر در دسترس نیست: '+err.message;}
 }
 form.addEventListener('submit',async event=>{event.preventDefault();if(button.disabled)return;
   button.disabled=true;msg('در حال ثبت نظر برای بررسی مدیریت…');
   try{await api.submitReview(form.elements.display_name.value.trim(),form.elements.body.value.trim(),form.elements.website.value);
     form.reset();msg('نظر شما ثبت شد و پس از بررسی و تأیید مدیریت نمایش داده خواهد شد.');
   }catch(err){msg('ثبت نظر انجام نشد: '+err.message,true);}
   finally{button.disabled=false;}
 });
 load();document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
})();
