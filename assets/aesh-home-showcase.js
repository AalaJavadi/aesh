/* AESH: progressive read-only homepage enhancements.
 * Fallback content is static and local. Cloud works are shown ONLY from public
 * published work data; this module does not write to Supabase or use user tokens.
 */
(function(){
 'use strict';
 const grid=document.getElementById('aeshLatestWorksGrid');
 const rail=document.getElementById('aeshTeachersRail');
 if(!grid||!rail)return;
 const api=window.AESHCore;
 const rxSlug=/^[\w\u0600-\u06ff]+(?:-[\w\u0600-\u06ff]+)*$/u;
 const rxId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const archive=[...grid.children].slice(0,12);
 const teacherUrls=new Set([...rail.querySelectorAll('a[href]')].map(x=>x.getAttribute('href')));
 const approved=new Map();
 const placeholder=()=>{const el=document.createElement('span');el.className='aesh-media-placeholder';el.textContent='تصویر اثر';return el;};
 function guardImages(root){
   root.querySelectorAll('img').forEach(img=>{
     if(img.dataset.aeshFallbackBound)return;
     img.dataset.aeshFallbackBound='1';
     img.addEventListener('error',()=>{img.hidden=true;img.removeAttribute('src');},{once:true});
   });
 }
 guardImages(grid);guardImages(rail);
 function safeCloud(row){
   return row&&rxId.test(String(row.id||''))&&rxSlug.test(String(row.slug||''))&&
    ['teacher','student'].includes(row.owner_role)&&
    ['aesh-member-works','aesh-owner-works'].includes(row.bucket_id)&&
    (row.status===undefined||row.status==='published')&&
    api&&api.publicWorkMedia('aesh-work-thumbs',row.thumb_path)&&
    api.publicWorkMedia(row.bucket_id,row.object_path);
 }
 const timestamp=row=>{
   const value=Date.parse(row.published_at||row.created_at||'');return Number.isFinite(value)?value:0;
 };
 function workCard(row){
   const title=String(row.title||'نمونه‌کار').slice(0,130);
   const owner=String(row.owner_name||'عضو انجمن').slice(0,120);
   const card=document.createElement('article');card.className='aesh-new-work';card.dataset.aeshCloudId=row.id;
   const link=document.createElement('a');link.href='/work/'+encodeURIComponent(row.slug)+'/';link.setAttribute('aria-label','مشاهده نمونه‌کار '+title);
   const media=document.createElement('span');media.className='aesh-new-work-media';media.append(placeholder());
   const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.width=320;img.height=220;
   img.alt=title+'، اثر '+owner;
   const cached=approved.get(String(row.id).toLowerCase());
   const local=cached&&/^\/assets\/approved-works\/[0-9a-f-]{36}-thumb\.webp$/i.test(cached.thumb||'')?cached.thumb:'';
   img.src=local||api.publicWorkMedia('aesh-work-thumbs',row.thumb_path);
   media.append(img);
   const role=document.createElement('span');role.className='aesh-work-meta';role.textContent=row.owner_role==='teacher'?'اثر استاد':'اثر هنرجو';
   const heading=document.createElement('strong');heading.textContent=title;
   const by=document.createElement('small');by.textContent='اثر '+owner;
   link.append(media,role,heading,by);card.append(link);guardImages(card);return card;
 }
 function updateWorks(rows){
   if(!Array.isArray(rows))return;
   const valid=rows.filter(safeCloud).sort((a,b)=>timestamp(b)-timestamp(a));
   const seen=new Set();const result=[];
   for(const row of valid){const id=String(row.id).toLowerCase();if(seen.has(id))continue;seen.add(id);result.push(workCard(row));if(result.length===12)break;}
   for(const old of archive){if(result.length===12)break;result.push(old.cloneNode(true));}
   if(result.length)grid.replaceChildren(...result);
   guardImages(grid);
   document.getElementById('aeshLatestWorksHint').textContent=valid.length?
    'تازه‌ترین آثار تأییدشده به همراه گزیده‌ای از آرشیو انجمن.':'گزیده‌ای از نمونه‌کارهای منتشرشده در آرشیو انجمن.';
 }
 async function loadApproved(){
   try{
     const c=new AbortController(),timer=setTimeout(()=>c.abort(),2500);
     try{
       const response=await fetch('/assets/aesh-published-showcase.json',{cache:'no-cache',signal:c.signal});
       if(!response.ok)return;
       const snapshot=await response.json();
       if(!Array.isArray(snapshot.works))return;
       for(const item of snapshot.works){if(rxId.test(item.id||''))approved.set(String(item.id).toLowerCase(),item);}
       // Never trust a cached snapshot alone as a publication authority.
     }finally{clearTimeout(timer);}
   }catch(_){/* No network means no extra wait for the archive. */}
 }
 function teacherItem(row){
   const slug=String(row.owner_slug||'');if(!rxSlug.test(slug)||row.role!=='teacher')return null;
   const href='/teacher/'+encodeURIComponent(slug)+'/';if(teacherUrls.has(href))return null;
   const name=String(row.display_name||'').trim().slice(0,110);if(!name)return null;
   const a=document.createElement('a');a.className='aesh-teacher-item';a.href=href;a.setAttribute('aria-label','پروفایل '+name);
   const media=document.createElement('span');media.className='aesh-teacher-avatar';media.append(placeholder());
   const photo=api.publicDirectoryPhoto(row.image_path||row.avatar_path);
   if(photo){const img=document.createElement('img');img.src=photo;img.width=112;img.height=112;img.loading='lazy';img.alt='تصویر '+name;media.append(img);}
   const title=document.createElement('strong');title.textContent=name;
   const specialty=document.createElement('small');specialty.textContent=String(row.specialty||'استاد انجمن').slice(0,120);
   a.append(media,title,specialty);guardImages(a);teacherUrls.add(href);return a;
 }
 function buttons(){
   const scroll=dir=>rail.scrollBy({left:dir*195,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
   document.getElementById('aeshRailPrev')?.addEventListener('click',()=>scroll(-1));
   document.getElementById('aeshRailNext')?.addEventListener('click',()=>scroll(1));
   // Auto-advance only when visible, not hovered or focused, and motion allowed.
   if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   let visible=false,active=true;
   const obs=('IntersectionObserver' in window)?new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting||false;},{threshold:.35}):null;
   if(obs)obs.observe(rail);else visible=true;
   rail.addEventListener('mouseenter',()=>active=false);rail.addEventListener('mouseleave',()=>active=true);
   rail.addEventListener('focusin',()=>active=false);rail.addEventListener('focusout',()=>active=true);
   setInterval(()=>{if(!visible||!active||document.hidden||rail.scrollWidth<=rail.clientWidth)return;
     const end=rail.scrollWidth-rail.clientWidth;
     if(Math.abs(rail.scrollLeft)>=end-20)rail.scrollTo({left:0,behavior:'smooth'});
     else rail.scrollBy({left:-182,behavior:'smooth'});
   },7000);
 }
 function init(){
   buttons();if(!api||!api.configured())return;
   let started=false;
   async function start(){
     if(started)return;started=true;
     await loadApproved();
     // Independent reads: a slow member directory never stalls public work cards.
     api.publicWorks().then(updateWorks).catch(()=>{});
     api.publicDirectory().then(rows=>{if(!Array.isArray(rows))return;
       const frag=document.createDocumentFragment();
       for(const row of rows){const item=teacherItem(row);if(item)frag.append(item);}
       rail.append(frag);
     }).catch(()=>{});
   }
   if('IntersectionObserver' in window){
     const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){io.disconnect();start();}},{rootMargin:'600px'});
     io.observe(grid);io.observe(rail);
   }else if('requestIdleCallback' in window)requestIdleCallback(start,{timeout:2000});
   else setTimeout(start,500);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
