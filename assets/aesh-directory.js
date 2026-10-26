/* AESH5 dynamically adds approved new profiles to the existing independent lists. */
(function(){
 'use strict';
 const api=window.AESHCore,root=document.getElementById('teachersGrid')||document.getElementById('studentsGrid');
 if(!root||!api||!api.configured())return;
 const role=root.id==='teachersGrid'?'teacher':'student';
 const append=(to,node)=>{to.appendChild(node);return node;};
 function render(row){const slug=String(row.owner_slug||'');if(!slug||!/^[\w\u0600-\u06ff]+(?:-[\w\u0600-\u06ff]+)*$/u.test(slug))return;
   if([...root.querySelectorAll('.person-card')].some(x=>x.dataset.slug===slug))return;
   const card=document.createElement('div');card.className='person-card';card.dataset.pid=row.id;card.dataset.slug=slug;
   const link=document.createElement('a');link.className='person-card-link';link.href='/'+role+'/'+encodeURIComponent(slug)+'/';link.setAttribute('aria-label','مشاهده پروفایل '+row.display_name);
   const media=document.createElement('div');media.className='person-media';
   const badge=document.createElement('span');badge.className='person-badge';badge.textContent=role==='teacher'?'استاد':'هنرجو';media.append(badge);
   const imageUrl=api.publicDirectoryPhoto(row.image_path||row.avatar_path);
   if(imageUrl){const img=document.createElement('img');img.src=imageUrl;img.alt='تصویر '+row.display_name;img.loading='lazy';media.append(img);}
   else{const icon=document.createElement('i');icon.className='fas fa-user';media.append(icon);}
   const body=document.createElement('div');body.className='person-body';
   for(const [cl,text,tag] of [['person-name',row.display_name,'div'],['person-role',row.specialty||'عضو انجمن','span'],['person-bio',row.bio||'','p']]){
     const x=document.createElement(tag);x.className=cl;x.textContent=text;body.append(x);
   }
   const extra=row.extra&&typeof row.extra==='object'&&!Array.isArray(row.extra)?row.extra:{};
   if(Number.isInteger(extra.experience_years)&&extra.experience_years>=0&&extra.experience_years<=60){
     const years=document.createElement('span');years.className='person-experience';
     years.textContent=extra.experience_years+' سال سابقه';body.append(years);
   }
   card.append(link,media,body);root.append(card);
 }
 api.publicDirectory().then(rows=>{if(!Array.isArray(rows))return;rows.filter(x=>x.role===role).forEach(render);
   if(typeof window.filterPeople==='function')window.filterPeople(root.id);
 }).catch(err=>{console.warn('AESH public member directory unavailable:',err.message);});
})();
