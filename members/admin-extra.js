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
   return {p_id:selectedId,p_role:role,p_owner_slug:slug,p_display_name:name,
     p_specialty:$('directorySpecialty').value.trim(),p_skills:$('directorySkills').value.trim(),p_bio:$('directoryBio').value.trim(),
     p_image_path:old?.image_path||null,p_published:$('directoryPublished').checked,
     p_extra:extra};
 }
 function resetForm(){selectedId=null;$('directoryForm').reset();clearPhoto();$('directoryRole').disabled=false;$('directorySlug').readOnly=false;
   $('directorySubmit').textContent='ذخیره اطلاعات عضو';note('directoryNotice','');}
 function fillForm(row){selectedId=row.id;clearPhoto();
   const extra=row.extra&&typeof row.extra==='object'&&!Array.isArray(row.extra)?row.extra:{};
   for(const [id,value] of [['directoryName',row.display_name],['directorySlug',row.owner_slug],['directorySpecialty',row.specialty],['directorySkills',row.skills],['directoryBio',row.bio],
       ['directoryExperience',extra.experience_years],['directoryWorkStyle',extra.work_style],['directoryPortfolioUrl',extra.portfolio_url],['directoryAchievements',extra.achievements]])
     $(id).value=value??'';
   $('directoryRole').value=row.role;$('directoryRole').disabled=true;$('directorySlug').readOnly=true;
   $('directoryPublished').checked=!!row.published;$('directorySubmit').textContent='ثبت تغییرات این عضو';
   if(row.image_path){const src=api.publicDirectoryPhoto(row.image_path);if(src){$('directoryPhotoPreview').src=src;$('directoryPhotoPreview').hidden=false;}}
   $('directoryName').focus();note('directoryNotice','در حال ویرایش پروفایل موجود؛ شناسه و URL ثابت می‌مانند.');
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
   $('directoryReset').addEventListener('click',resetForm);
   $('directoryRefresh').addEventListener('click',reloadDirectory);
   $('adminReviewsRefresh').addEventListener('click',reloadReviews);
   window.addEventListener('aesh:member-dashboard',event=>dashboard(event.detail.profile));
   window.addEventListener('aesh:member-logout',()=>{owner=false;$('ownerDirectory').hidden=true;$('ownerReviews').hidden=true;records=[];resetForm();});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
