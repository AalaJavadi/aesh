/* Preserve original AESH server votes in independent artwork pages. */
(function(){
'use strict';
const api=window.AESHCore,host=document.getElementById('portfolioDetailActions');
if(!host)return;
const source=String(document.body.getAttribute('data-aesh-work-id')||'').trim();
const key=source.startsWith('cloud:')||source.startsWith('legacy:')?source:'legacy:'+source;
let guest='';
const el=document.createElement('section');el.className='aesh-vote-block';el.id='aeshVoteBlock';el.setAttribute('aria-label','لایک و دیسلایک نمونه‌کار');host.appendChild(el);
function message(t){el.replaceChildren();const h=document.createElement('h3');h.textContent='نظرت درباره این نمونه‌کار چیه؟';el.appendChild(h);const p=document.createElement('p');p.className='aesh-vote-message';p.textContent=t;el.appendChild(p);}
function guestId(){try{const v=localStorage.getItem('aesh:guest-voter:v323');if(v&&/^[0-9a-f-]{36}$/i.test(v))return v;}catch(e){}if(!guest){if(crypto.randomUUID)guest=crypto.randomUUID();else return '';}
 try{localStorage.setItem('aesh:guest-voter:v323',guest)}catch(e){}return guest;}
const rowFirst=r=>Array.isArray(r)?r[0]:r;
async function counts(){const real=rowFirst(await api.rpc('aesh_vote_summary',{p_work_key:key}));if(!real)throw Error('آمار رأی در دسترس نیست');let second={likes:0,dislikes:0,my_vote:0},guestEnabled=false;const id=guestId();if(id)try{const r=rowFirst(await api.rpc('aesh_guest_vote_summary',{p_work_key:key,p_visitor_id:id}));if(r){second=r;guestEnabled=true;}}catch(e){console.warn('AESH guest votes unavailable',e.message)}
 return {likes:Math.max(0,Number(real.likes)||0)+Math.max(0,Number(second.likes)||0),dislikes:Math.max(0,Number(real.dislikes)||0)+Math.max(0,Number(second.dislikes)||0),my_vote:api.authenticated()?Number(real.my_vote)||0:Number(second.my_vote)||0,guestEnabled};}
async function render(){if(!source){message('شناسه پایدار این اثر در صفحه ثبت نشده است؛ رأی‌گیری فعال نیست.');return;}
 if(!api||!api.configured()){message('لایک و دیسلایک پس از اتصال دیتابیس فعال می‌شوند؛ هیچ شمارش ساختگی نمایش داده نمی‌شود.');return;}
 message('در حال دریافت تعداد رأی‌ها…');try{const c=await counts();el.replaceChildren();const h=document.createElement('h3');h.textContent='نظرت درباره این نمونه‌کار چیه؟';el.appendChild(h);
 const buttons=document.createElement('div');buttons.className='aesh-vote-buttons';const allowed=api.authenticated()||c.guestEnabled;
 for(const [vote,label,icon,num] of [[1,'لایک','fa-thumbs-up',c.likes],[-1,'دیسلایک','fa-thumbs-down',c.dislikes]]){
  const b=document.createElement('button');b.type='button';b.className='aesh-vote-button';b.setAttribute('aria-pressed',String(vote===c.my_vote));b.disabled=!allowed;b.innerHTML='<i class="fas '+icon+'" aria-hidden="true"></i><span>'+Number(num).toLocaleString('fa-IR')+' '+label+'</span>';
  b.addEventListener('click',async()=>{for(const x of buttons.querySelectorAll('button'))x.disabled=true;try{const next=c.my_vote===vote?0:vote;
   if(api.authenticated())await api.rpc('aesh_set_vote',{p_work_key:key,p_vote:next},true);else await api.rpc('aesh_guest_set_vote',{p_work_key:key,p_visitor_id:guestId(),p_vote:next});await render();
  }catch(e){message('رأی ثبت نشد: '+e.message)}});buttons.appendChild(b);
 }
 el.appendChild(buttons);if(!allowed){const p=document.createElement('p');p.className='aesh-vote-message';p.textContent='رأی مهمان هنوز در پایگاه داده فعال نشده است؛ مدیر باید فایل SQL نسخه جدید را در Supabase اجرا کند.';el.appendChild(p);}
 }catch(e){message('آمار رأی در دسترس نیست: '+e.message);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
