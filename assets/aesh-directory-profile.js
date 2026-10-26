/* Deep-link fallback until the independent GH Pages HTML has actually been built. */
(function(){
 'use strict';const api=window.AESHCore,area=document.getElementById('directoryProfile'),params=new URLSearchParams(location.search);
 const role=params.get('role'),slug=params.get('slug');
 if(!['teacher','student'].includes(role)||!slug||slug.length>90||!/^[\w\u0600-\u06ff]+(?:-[\w\u0600-\u06ff]+)*$/u.test(slug)){
   area.textContent='نشانی پروفایل معتبر نیست.';return;
 }
 api.publicDirectory().then(rows=>{
   const row=Array.isArray(rows)?rows.find(x=>x.role===role&&x.owner_slug===slug):null;
   if(!row){area.textContent='پروفایل منتشرشده‌ای با این نشانی پیدا نشد.';return;}
   area.replaceChildren();const h=document.createElement('h1');h.textContent=row.display_name;
   const specialty=document.createElement('p');specialty.textContent=row.specialty||'';
   const bio=document.createElement('p');bio.textContent=row.bio||'';bio.style.whiteSpace='pre-wrap';
   const photo=api.publicDirectoryPhoto(row.image_path||row.avatar_path);
   if(photo){const img=document.createElement('img');img.src=photo;img.alt=row.display_name;img.style.maxWidth='300px';img.style.borderRadius='16px';area.append(img);}
   area.append(h,specialty,bio);
   if(row.skills){const skills=document.createElement('p');skills.textContent='مهارت‌ها: '+row.skills;area.append(skills);}
   const extra=row.extra&&typeof row.extra==='object'&&!Array.isArray(row.extra)?row.extra:{};
   for(const [label,value] of [['سابقه فعالیت',extra.experience_years===undefined?'':String(extra.experience_years)+' سال'],
        ['سبک کاری',extra.work_style],['دستاوردها',extra.achievements]]){
     if(!value)continue;const p=document.createElement('p');p.textContent=label+': '+String(value);area.append(p);
   }
   if(typeof extra.portfolio_url==='string'&&/^https:\/\/[^\s]+$/i.test(extra.portfolio_url)){
     try{const url=new URL(extra.portfolio_url);if(!url.username&&!url.password){
       const a=document.createElement('a');a.href=url.href;a.textContent='مشاهده نمونه‌کارهای عمومی';
       a.target='_blank';a.rel='noopener noreferrer';area.append(a);
     }}catch(e){}
   }
   document.title=row.display_name+' | AESH';
 }).catch(err=>{area.textContent='دریافت اطلاعات پروفایل انجام نشد: '+err.message;});
})();
