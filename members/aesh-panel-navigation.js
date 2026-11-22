/* Protected by the existing AESHCore session and server-side RPC permissions.
 * This file ONLY switches visible panels. It never grants roles or mutates data.
 */
(function(){
 'use strict';
 const root=document.getElementById('aeshPanelLayout');
 const sidebar=document.getElementById('aeshPanelSidebar');
 if(!root||!sidebar)return;
 const $=id=>document.getElementById(id);
 let isOwner=false;
 let initialized=false;
 const views={overview:['aeshPanelOverview'],profile:['aeshMemberProfileIntro','profileColumns'],works:['workPanel'],moderation:['ownerModeration'],directory:['ownerDirectory'],reviews:['ownerReviews']};
 function select(view){
   if(!Object.hasOwn(views,view))return;
   if(!isOwner&&['moderation','directory','reviews'].includes(view))return;
   for(const [key,ids] of Object.entries(views)){
     for(const id of ids){const el=$(id);if(el)el.hidden=key!==view;}
   }
   for(const btn of sidebar.querySelectorAll('button[data-aesh-view]')){
     if(btn.dataset.aeshView===view)btn.setAttribute('aria-current','page');
     else btn.removeAttribute('aria-current');
   }
   if(window.innerWidth<870)root.scrollIntoView({behavior:'auto',block:'start'});
 }
 function onAuth(e){
   const profile=e.detail&&e.detail.profile;
   if(!profile)return;
   isOwner=profile.role==='owner';
   for(const el of root.querySelectorAll('[data-aesh-owner-only]'))el.hidden=!isOwner;
   $('aeshSidebarTitle').textContent=isOwner?'مدیریت انجمن':'پنل عضو انجمن';
   $('aeshOverviewTitle').textContent=isOwner?'به مدیریت انجمن خوش آمدید':'به پنل اعضا خوش آمدید';
   $('aeshOverviewDescription').textContent=isOwner?
     'برای ثبت یا تأیید آثار، افزودن و ویرایش پروفایل اعضا و مدیریت نظرات، از منوی کنار یک بخش را انتخاب کنید.':
     'برای ویرایش معرفی خود یا ارسال نمونه‌کار از منوی کنار انتخاب کنید.';
   sidebar.hidden=false;
   // Existing authorized dashboard handlers may update owner-only visibility
   // during the same event. Pick the view after they have finished synchronously.
   requestAnimationFrame(()=>select('overview'));
 }
 function onLogout(){isOwner=false;sidebar.hidden=true;for(const el of root.querySelectorAll('[data-aesh-owner-only]'))el.hidden=true;}
 function init(){
   if(initialized)return;initialized=true;
   sidebar.querySelectorAll('button[data-aesh-view]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.aeshView)));
   root.querySelectorAll('button[data-aesh-shortcut]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.aeshShortcut)));
   window.addEventListener('aesh:member-dashboard',onAuth);
   window.addEventListener('aesh:member-logout',onLogout);
   // Other modules dispatch dashboard at DOMContentLoaded or after login.
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
