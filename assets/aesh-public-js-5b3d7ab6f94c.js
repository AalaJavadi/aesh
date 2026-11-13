/* AESH rescue: original scripts in exact order, no logic removed. */

;
/* ========== assets/aesh-static.js ========== */
/* AESH public pages. No SPA, no index.html fetch, no CMS data fetched for ordinary pages. */
(function(){
'use strict';
// Non-critical remote font/icon CSS must never block initial paint.
function aeshActivateLateCss() {
  for (const link of document.querySelectorAll('link[data-aesh-noncritical-css]')) link.media = 'all';
}
if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', aeshActivateLateCss, { once: true });
else aeshActivateLateCss();

const $=id=>document.getElementById(id);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const base=location.hostname.endsWith('.github.io')&&location.hostname!=='aesh-test.github.io'?'/aesh/':'/';
function sitePath(s){return base+String(s||'').replace(/^\//,'');}
window.__AESH_BASE_PATH__=base==='/'?'':base.slice(0,-1);
window.isEditMode=false;
function fa(t){return String(t).replace(/[0-9]/g,x=>'۰۱۲۳۴۵۶۷۸۹'[Number(x)]);}
function navigate(url){if(!storeDraftBeforeNavigation(url))location.assign(url);}
// Return true so normal links navigate between genuinely independent pages.
window.handleSiteLink=function(){return true;};
window.go=function(name){navigate(sitePath(name==='home'?'':name+'/'));};
window.openMobileNav=function(){const n=$('mobileNavOverlay'),b=$('mobileMenuBtn');if(!n)return;n.classList.add('show');n.setAttribute('aria-hidden','false');document.body.classList.add('mobile-nav-open');if(b){b.setAttribute('aria-expanded','true');b.innerHTML='<i class="fas fa-times"></i>';}};
window.closeMobileNav=function(){const n=$('mobileNavOverlay'),b=$('mobileMenuBtn');if(!n)return;n.classList.remove('show');n.setAttribute('aria-hidden','true');document.body.classList.remove('mobile-nav-open');if(b){b.setAttribute('aria-expanded','false');b.innerHTML='<i class="fas fa-bars"></i>';}};
window.toggleMobileNav=function(){const n=$('mobileNavOverlay');if(n&&n.classList.contains('show'))closeMobileNav();else openMobileNav();};
window.toggleTheme=function(){const now=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=now;try{localStorage.setItem('ed_theme',now)}catch(e){};const icon=$('themeBtn')?.querySelector('i');if(icon)icon.className=now==='dark'?'fas fa-sun':'fas fa-moon';};
try{document.documentElement.dataset.theme=localStorage.getItem('ed_theme')==='dark'?'dark':'light';}catch(e){}
/* Lazy, same-page editor: the existing full editor remains in its own same-origin
   iframe. The public URL never changes and public CSS/DOM are never replaced. */
let inlineShell=null,inlineFrame=null,inlineMode='modal',pendingEditorNavigation=null;
function storeDraftBeforeNavigation(url){
 if(!inlineShell||inlineShell.hidden||!inlineFrame||pendingEditorNavigation)return false;
 pendingEditorNavigation=String(url);
 inlineFrame.contentWindow?.postMessage({channel:EDITOR_CHANNEL,type:'persist-before-navigation'},location.origin);
 return true;
}
document.addEventListener('click',function(e){
 if(!inlineShell||inlineShell.hidden||e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
 const a=e.target.closest?.('a[href]');if(!a||a.target==='_blank'||a.hasAttribute('download'))return;
 let url;try{url=new URL(a.href,location.href);}catch(err){return;}
 if(url.origin!==location.origin||url.pathname===location.pathname&&url.search===location.search&&url.hash)return;
 if(storeDraftBeforeNavigation(url.href))e.preventDefault();
},true);
const EDITOR_CHANNEL='aesh-inline-editor-v1';
function inlineEditorMessage(e){
 if(!inlineFrame||e.source!==inlineFrame.contentWindow||e.origin!==location.origin)return;
 const msg=e.data;if(!msg||msg.channel!==EDITOR_CHANNEL)return;
  if(msg.type==='ready'){
    inlineShell.hidden=false;
    inlineFrame.contentWindow?.postMessage({channel:EDITOR_CHANNEL,type:'open'},location.origin);
    return;
  }
 if(msg.type==='draft-saved'){
   const url=pendingEditorNavigation;pendingEditorNavigation=null;
   if(msg.ok&&url)location.assign(url);
   else alert('ذخیره پیش نویس انجام نشد. صفحه تغییر نکرد تا ویرایش های شما از دست نرود.');
   return;
 }
 if(msg.type==='dismiss'||msg.type==='idle'){
   // Idle is sent before the login dialog opens; only dismiss explicitly closes.
   if(msg.type==='dismiss')inlineShell.hidden=true;
   return;
 }
 if(['panel','modal','workspace'].includes(msg.type)){
   inlineMode=msg.type;
   inlineShell.dataset.mode=inlineMode;
   inlineShell.hidden=false;
 }
}
window.addEventListener('message',inlineEditorMessage);
function openInlineEditor(){
 if(inlineShell){
   if(!inlineShell.hidden){inlineShell.hidden=true;return;}
   inlineShell.hidden=false;
   inlineFrame.contentWindow?.postMessage({channel:EDITOR_CHANNEL,type:'open'},location.origin);
   return;
 }
 const css=document.createElement('link');css.id='aesh-inline-host-style';css.rel='stylesheet';css.href=sitePath('assets/aesh-inline-host.css');document.head.appendChild(css);
 inlineShell=document.createElement('div');inlineShell.id='aesh-inline-host';
 inlineShell.dataset.mode=inlineMode;inlineShell.setAttribute('role','region');
 inlineShell.setAttribute('aria-label','ویرایشگر انجمن در همین صفحه');
 inlineFrame=document.createElement('iframe');inlineFrame.title='ویرایشگر انجمن ادیتوران شایسته';
 inlineFrame.setAttribute('allow','clipboard-read; clipboard-write');
 inlineShell.appendChild(inlineFrame);document.body.appendChild(inlineShell);
 let path=document.body.dataset.aeshPath||location.pathname;
 const baseRoot=window.__AESH_BASE_PATH__||'';
 if(baseRoot&&path.startsWith(baseRoot+'/'))path=path.slice(baseRoot.length);
 // A frame load is a fallback; the bridge's ready handshake is authoritative.
 inlineFrame.addEventListener('load',()=>{
   inlineFrame.contentWindow?.postMessage({channel:EDITOR_CHANNEL,type:'open'},location.origin);
 });
 inlineFrame.src=sitePath('editor/')+'?view='+encodeURIComponent(path||'/')+'&inline=1';
}
window.toggleEdit=openInlineEditor;
document.addEventListener('keydown',e=>{
 if(e.ctrlKey&&e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='e'){e.preventDefault();toggleEdit();}
 if(e.key==='Escape'){closeMobileNav();closeGlobalSearch();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openGlobalSearch();}
});
function scrollStatus(){const h=$('header'),y=window.scrollY;if(h)h.classList.toggle('scrolled',y>60);const p=$('progress'),doc=document.documentElement;
 if(p)p.style.width=(100*y/Math.max(1,doc.scrollHeight-innerHeight))+'%';const top=$('backTop');if(top)top.classList.toggle('show',y>400);
}
window.addEventListener('scroll',scrollStatus,{passive:true});
function reveal(){const observer='IntersectionObserver' in window?new IntersectionObserver(es=>{for(const ent of es){if(ent.isIntersecting){ent.target.classList.add('visible');observer.unobserve(ent.target);}}},{threshold:.04}):null;
 for(const node of $$('.reveal')){if(!observer||node.getBoundingClientRect().top<innerHeight*.98)node.classList.add('visible');else observer.observe(node);}}
window.showRulesTab=function(which){const legal=which==='legal';for(const [id,active] of [['rulesPanelInternal',!legal],['rulesPanelLegal',legal]]){const el=$(id);if(el){el.classList.toggle('active',active);el.hidden=!active;}}
 for(const [id,on] of [['rulesTabInternal',!legal],['rulesTabLegal',legal]]){const el=$(id);if(el){el.classList.toggle('active',on);el.setAttribute('aria-selected',String(on));}}};
let portfolioFilter='all';let galleryCount=12;
function redrawPortfolio(){const cards=$$('#portfolioGrid .portfolio-card');let visible=0;for(const card of cards){const allowed=card.dataset.cloudPending!=='true'&&(portfolioFilter==='all'||card.dataset.ownerType===portfolioFilter);
 card.dataset.filterHidden=String(!allowed);if(allowed){card.dataset.moreHidden=String(visible>=galleryCount);visible++;}}
 const count=$('portfolioCount');if(count)count.textContent=fa(visible)+' اثر';const more=$('portfolioMoreBtn');if(more){more.classList.toggle('show',visible>galleryCount);more.hidden=visible<=galleryCount;}
 const empty=$('portfolioEmpty');if(empty)empty.classList.toggle('show',visible===0);
 hydratePortfolio();}
window.aeshRedrawPortfolio=redrawPortfolio;
window.setPortfolioFilter=function(f){portfolioFilter=['all','teacher','student'].includes(f)?f:'all';galleryCount=12;$$('.portfolio-tab').forEach(x=>x.classList.toggle('active',x.dataset.filter===portfolioFilter));redrawPortfolio();};
window.showMorePortfolio=function(){galleryCount+=12;redrawPortfolio();};
let thumbObserver;
function hydratePortfolio(){const nodes=$$('.portfolio-card-media[data-src]');function fill(el){const url=el.getAttribute('data-src');if(!url||el.querySelector('img'))return;const img=document.createElement('img');img.src=url;img.alt=el.getAttribute('data-alt')||'نمونه‌کار';img.decoding='async';if(el.getBoundingClientRect().top<innerHeight*.95){img.loading='eager';img.fetchPriority='high';}else{img.loading='lazy';}// Keep first visible published artwork prioritized.
 img.addEventListener('load',()=>{el.style.setProperty('--portfolio-bg','url('+JSON.stringify(img.currentSrc||img.src)+')');el.classList.remove('portfolio-loading');});
 img.addEventListener('error',()=>{if(el.dataset.fullSrc&&img.src!==el.dataset.fullSrc)img.src=el.dataset.fullSrc},{once:true});el.appendChild(img);}
 if(!('IntersectionObserver' in window)){nodes.forEach(fill);return;}if(!thumbObserver)thumbObserver=new IntersectionObserver(es=>es.forEach(ent=>{if(ent.isIntersecting){fill(ent.target);thumbObserver.unobserve(ent.target)}}),{rootMargin:'320px'});
 nodes.forEach(el=>{if(el.closest('[data-filter-hidden="true"],[data-more-hidden="true"]'))return;thumbObserver.observe(el)});}
window.filterPeople=function(gridId){const input=$(gridId==='teachersGrid'?'tSearch':'sSearch');const term=(input?.value||'').trim().toLowerCase();const grid=$(gridId);if(!grid)return;const parent=gridId==='teachersGrid'?'tChips':'sChips';const role=$(parent)?.querySelector('.chip.active')?.dataset.role||'all';let count=0;
 for(const card of $$('.person-card',grid)){const txt=(card.textContent||'').toLowerCase(),actual=(card.querySelector('.person-role')?.textContent||'').trim();const ok=(!term||txt.includes(term))&&(role==='all'||role===actual);card.classList.toggle('hidden',!ok);if(ok)count++;}
 const empty=$(gridId==='teachersGrid'?'tEmpty':'sEmpty');if(empty)empty.style.display=count?'none':'block';};
let searchData=null;
window.openGlobalSearch=function(){const box=$('globalSearchModal');if(!box)return;closeMobileNav();box.classList.add('show');box.setAttribute('aria-hidden','false');document.body.classList.add('profile-open');const input=$('globalSearchInput');if(input){input.focus();scheduleGlobalSearch();}};
window.closeGlobalSearch=function(){const box=$('globalSearchModal');if(!box)return;box.classList.remove('show');box.setAttribute('aria-hidden','true');document.body.classList.remove('profile-open');};
window.clearGlobalSearch=function(){const el=$('globalSearchInput');if(el){el.value='';el.focus();}scheduleGlobalSearch();};
let searchDebounce=0,results=[];
window.scheduleGlobalSearch=function(){clearTimeout(searchDebounce);searchDebounce=setTimeout(updateSearch,100);};
function escape(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function updateSearch(){const el=$('globalSearchInput'),list=$('globalSearchResults'),status=$('globalSearchStatus');if(!el||!list)return;const term=el.value.trim().toLowerCase();if(!term){list.innerHTML='<div class="search-empty"><i class="fas fa-magnifying-glass"></i><strong>دنبال چی می‌گردی؟</strong><span>نام عضو، خبر، دوره، مسابقه یا بخشی از قوانین را بنویس.</span></div>';if(status)status.textContent='برای جستجو شروع به تایپ کنید';return;}
 if(!searchData){try{const r=await fetch(sitePath('assets/aesh-search-index.json'));if(!r.ok)throw Error('search index');searchData=await r.json();}catch(e){list.textContent='جستجو در این لحظه در دسترس نیست.';return;}}
 if(term!==el.value.trim().toLowerCase())return;results=searchData.filter(x=>[x.title,x.detail,x.type].join(' ').toLowerCase().includes(term)).slice(0,30);
 list.innerHTML=results.length?results.map((x,i)=>'<a class="search-result" role="option" href="'+escape(sitePath(x.href))+'"><span class="search-result-ico"><i class="fas '+(x.type==='teacher'?'fa-chalkboard-teacher':x.type==='student'?'fa-user-graduate':x.type==='work'?'fa-image':'fa-file-lines')+'"></i></span><span><span class="search-result-title">'+escape(x.title)+'</span><span class="search-result-sub">'+escape(x.detail)+'</span></span><span class="search-result-type">'+escape({teacher:'استاد',student:'هنرجو',work:'نمونه‌کار',course:'دوره',news:'خبر',featured:'برگزیده'}[x.type]||x.type)+'</span></a>').join(''):'<div class="search-empty"><strong>موردی پیدا نشد</strong><span>عبارت دیگری جستجو کنید.</span></div>';
 if(status)status.textContent=fa(results.length)+' نتیجه';}
window.handleGlobalSearchKey=function(e){if(e.key==='Escape'){closeGlobalSearch();return;}if(e.key==='Enter'){const result=$('globalSearchResults')?.querySelector('a[href]');if(result){e.preventDefault();location.assign(result.href)}}};
window.copyCurrentPortfolioLink=async function(){try{await navigator.clipboard.writeText(location.href)}catch(e){const input=document.createElement('textarea');input.value=location.href;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();}const button=$('portfolioCopyLink');if(button){const label=button.querySelector('span');if(label)label.textContent='لینک کپی شد';}};
function addMemberLink(){const actions=document.querySelector('.header-in .actions');if(!actions||$('aeshMemberLogin'))return;const a=document.createElement('a');a.className='aesh-member-link';a.id='aeshMemberLogin';a.href=sitePath('members/');a.innerHTML='<i class="fas fa-user-shield" aria-hidden="true"></i><span>پنل اعضا</span>';actions.insertBefore(a,actions.firstChild);}
function initialCounters(){for(const counter of $$('.stat-num[data-counter]'))counter.textContent=fa(counter.getAttribute('data-counter'));}
function applyStandaloneLinks(){const a=$('portfolioOwnerLink');if(a&&a.getAttribute('href')&&a.getAttribute('href')!=='#')a.style.display='inline-flex';}
function init(){initialCounters();applyStandaloneLinks();reveal();scrollStatus();if($('portfolioGrid'))redrawPortfolio();
 for(const [grid,chips] of [['teachersGrid','tChips'],['studentsGrid','sChips']]){const nav=$(chips);if(nav)nav.addEventListener('click',e=>{const b=e.target.closest('.chip');if(!b)return;$$('.chip',nav).forEach(c=>c.classList.toggle('active',c===b));filterPeople(grid);});}
 for(const item of $$('.faq-item')){item.addEventListener('click',e=>{if(e.target.closest('a,button'))return;item.classList.toggle('open')});}
 const theme=$('themeBtn')?.querySelector('i');if(theme)theme.className=document.documentElement.dataset.theme==='dark'?'fas fa-sun':'fas fa-moon';
 // Remove attribute handlers for editor buttons already absent from public pages.
 window.__AESH_SITE_READY__=true;document.dispatchEvent(new Event('aesh:site-ready'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

;

;
/* ========== assets/aesh-config.js ========== */
/* AESH PUBLIC configuration. ONLY the public project URL and publishable key belong here.
 * Never add access passwords, service_role, secret API keys, or database passwords.
 */
window.AESH_SUPABASE_CONFIG = Object.freeze({
  url: 'https://myakibavvzuhqgraqzug.supabase.co',
  publishableKey: 'sb_publishable_2P27Xg01t9BJwYPJBN_tIw_gGLDm9c8'
});

;

;
/* ========== assets/aesh-core.js ========== */
/* AESH v3.25: Supabase Auth + protected RPC adapter.
   Passwords never appear in site files. Refresh sessions persist locally until logout.
   Persisted tokens can be read by JavaScript on this origin; keep the site's CSP tight.
*/
(function () {
  'use strict';
  const config = window.AESH_SUPABASE_CONFIG || {};
  const url = String(config.url || '').trim().replace(/\/+$/, '');
  const publicKey = String(config.publishableKey || '').trim();
  const enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && /^(sb_publishable_|eyJ)[a-z0-9_.-]{12,}$/i.test(publicKey);
  const storageKey = 'aesh:auth-session:v320';
  let session = null;
  let member = null;
  let renewing = null;
  // Try localStorage first, then older sessionStorage values from the previous release.
  let remembered = null;
  try { remembered = localStorage.getItem(storageKey); } catch (_) {}
  if (!remembered) try { remembered = sessionStorage.getItem(storageKey); } catch (_) {}
  try { session = remembered ? JSON.parse(remembered) : null; } catch (_) { session = null; }
  if (session && session.refresh_token) try { localStorage.setItem(storageKey, JSON.stringify(session)); } catch (_) {}
  try { sessionStorage.removeItem(storageKey); } catch (_) {}
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    try { session = event.newValue ? JSON.parse(event.newValue) : null; }
    catch (_) { session = null; }
    member = null;
    window.dispatchEvent(new Event('aesh:session'));
  });
  function alertError(payload, status) {
    const text = String((payload && (payload.error_description || payload.msg || payload.message || payload.error)) || 'خطای ارتباط با سرور').slice(0, 160);
    if (/invalid login credentials/i.test(text)) return 'ایمیل یا رمز عبور اشتباه است.';
    if (/email not confirmed/i.test(text)) return 'ایمیل حساب تأیید نشده است.';
    if (/jwt expired|invalid jwt|session expired/i.test(text)) return 'نشست شما منقضی شده است؛ دوباره وارد شوید.';
    if (/row-level security|permission denied/i.test(text)) return 'مجوز این عملیات را ندارید.';
    return 'خطای سرور (' + status + '): ' + text;
  }
  function save(next) {
    session = next;
    member = null;
    try {
      if (next) localStorage.setItem(storageKey, JSON.stringify(next));
      else localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
    } catch (_) {
      // Non-persistent fallback for browsers that block localStorage.
      try { if (next) sessionStorage.setItem(storageKey, JSON.stringify(next));
            else sessionStorage.removeItem(storageKey); } catch (_) {}
    }
    window.dispatchEvent(new Event('aesh:session'));
  }
  function configured() { return enabled; }
  function needSetup() { return 'اتصال دیتابیس هنوز تنظیم نشده؛ مدیر باید فایل assets/aesh-config.js را تکمیل کند.'; }
  function authenticated() { return !!(session && session.access_token); }
  async function renew() {
    if (renewing) return renewing;
    if (!session || !session.refresh_token) throw new Error('لطفاً دوباره وارد شوید.');
    renewing = (async () => {
      const response = await fetch(url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', mode: 'cors', cache: 'no-store',
        headers: { 'apikey': publicKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token) { save(null); throw new Error(alertError(data, response.status)); }
      save({ ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) });
      return session;
    })().finally(() => { renewing = null; });
    return renewing;
  }
  const publicReadOnlyRpc = new Set(['aesh_public_works','aesh_public_profiles','aesh_public_directory','aesh_public_reviews']);
  async function call(path, options = {}, privateCall = false, retry = false) {
    if (!enabled) throw new Error(needSetup());
    if (privateCall && !authenticated()) throw new Error('برای این بخش باید وارد حساب شوید.');
    // Anonymous public-only RPC reads must not wait for refresh of a saved login.
    // Never apply this timeout or anonymous path to private reads or writes.
    const publicRpcName = /^\/rest\/v1\/rpc\/(aesh_[a-z0-9_]+)$/.exec(path)?.[1];
    const publicRead = !privateCall && options.method === 'POST' && publicReadOnlyRpc.has(publicRpcName);
    if (!publicRead && authenticated() && (!session.expires_at || session.expires_at < Math.floor(Date.now() / 1000) + 90)) await renew();
    const headers = new Headers(options.headers || {});
    headers.set('apikey', publicKey);
    if (!publicRead && authenticated()) headers.set('Authorization', 'Bearer ' + session.access_token);
    if (options.json !== undefined) { headers.set('Content-Type', 'application/json'); options.body = JSON.stringify(options.json); }
    // Only the strictly whitelisted, non-mutating public RPCs have bounded waits.
    const controller = publicRead ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 4200) : null;
    let response, result;
    try {
      response = await fetch(url + path, { ...options, mode: 'cors', cache: 'no-store', headers,
        ...(controller ? { signal: controller.signal } : {}) });
      const type = response.headers.get('content-type') || '';
      result = type.includes('json') ? await response.json().catch(() => ({})) : await response.text();
    } catch (error) {
      if (controller?.signal.aborted) throw new Error('پاسخ اطلاعات عمومی آنلاین به‌موقع نرسید؛ محتوای آماده سایت همچنان در دسترس است.');
      throw error;
    } finally { if (timer !== null) clearTimeout(timer); }
    if (!response.ok) {
      if (response.status === 401 && privateCall && !retry && authenticated()) {
        await renew(); return call(path, options, privateCall, true);
      }
      const error = new Error(alertError(result, response.status));
      error.httpStatus = response.status;
      throw error;
    }
    return result;
  }
  async function rpc(name, params = {}, privateCall = false) {
    return call('/rest/v1/rpc/' + name, { method: 'POST', json: params }, privateCall);
  }
  async function login(email, password) {
    if (!enabled) throw new Error(needSetup());
    const response = await fetch(url + '/auth/v1/token?grant_type=password', {
      method: 'POST', mode: 'cors', cache: 'no-store',
      headers: { 'apikey': publicKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.access_token || !result.refresh_token) throw new Error(alertError(result, response.status));
    save({ ...result, expires_at: Math.floor(Date.now() / 1000) + Number(result.expires_in || 3600) });
    try {
      const person = await myProfile();
      if (!person) { save(null); throw new Error('حساب شما برای ویرایش پروفایل در AESH فعال نشده است.'); }
      return person;
    } catch (error) { save(null); throw error; }
  }
  async function myProfile(force = false) {
    if (!authenticated()) return null;
    if (member && !force) return member;
    const list = await rpc('aesh_my_profile', {}, true);
    member = Array.isArray(list) && list.length ? list[0] : null;
    if (!member) { save(null); return null; }
    return member;
  }
  async function logout() {
    if (authenticated()) {
      // Revokes the refresh token where possible; current page is logged out either way.
      await call('/auth/v1/logout', { method: 'POST' }, true).catch(() => undefined);
    }
    save(null);
  }
  async function saveBioAndAvatar(bio, avatarPath) {
    const result = await rpc('aesh_save_my_profile', { p_bio: String(bio), p_avatar_path: avatarPath || null }, true);
    member = null;
    return Array.isArray(result) ? result[0] : result;
  }
  function publicAvatar(path, timestamp) {
    if (!enabled || !/^([0-9a-f]{8}-[0-9a-f-]{27,})\/avatar\.webp$/i.test(String(path || ''))) return '';
    const src = url + '/storage/v1/object/public/aesh-avatars/' + String(path).split('/').map(encodeURIComponent).join('/');
    return src + (timestamp ? '?v=' + encodeURIComponent(String(timestamp)) : '');
  }
  async function uploadAvatar(blob) {
    const m = await myProfile(true);
    if (!m || !blob || blob.type !== 'image/webp' || blob.size < 1 || blob.size >= 100000) throw new Error('عکس پروفایل باید WebP و کمتر از ۱۰۰ کیلوبایت باشد.');
    const path = m.id + '/avatar.webp';
    await call('/storage/v1/object/aesh-avatars/' + path, {
      method: 'POST', body: blob,
      headers: { 'Content-Type': 'image/webp', 'x-upsert': 'true', 'cache-control': '300' }
    }, true);
    return path;
  }
  // Work uploads are individually authorized at Supabase Storage AND by SQL RPC.
  // No service_role secret, password or hash is shipped to this browser.
  const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const validImageTypes = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });
  function newWorkId() {
    if (typeof crypto === 'undefined' || !crypto.getRandomValues) throw new Error('برای آپلود به یک مرورگر به‌روز با HTTPS نیاز دارید.');
    if (crypto.randomUUID) return crypto.randomUUID();
    const a = crypto.getRandomValues(new Uint8Array(16));
    a[6] = (a[6] & 15) | 64; a[8] = (a[8] & 63) | 128;
    const s = Array.from(a, x => x.toString(16).padStart(2, '0')).join('');
    return s.slice(0,8) + '-' + s.slice(8,12) + '-' + s.slice(12,16) + '-' + s.slice(16,20) + '-' + s.slice(20);
  }
  function canUploadImage(file, isOwner) {
    const limit = 99999;
    if (!file || !validImageTypes[file.type] || !file.size || file.size > limit) {
      throw new Error('تصویر آپلودی نهایی باید JPG، PNG یا WebP و کمتر از ۱۰۰٬۰۰۰ بایت باشد.');
    }
    return validImageTypes[file.type];
  }
  // New object uploads use the smallest necessary request header set. The previous
  // cache-control and x-upsert:false headers were redundant, increased the CORS
  // preflight header set, and could be rejected by some Storage gateways.
  // Repeating a POST after a transport failure is safe here because every work ID
  // is a fresh UUID; if the first POST succeeded but its response was lost,
  // Supabase replies "already exists" and we can continue with that object.
  function isTransportFailure(error) {
    return error instanceof TypeError || /failed to fetch|networkerror|load failed|network request failed/i.test(String(error && error.message || ''));
  }
  let privacyPreflightAt = 0;
  async function requirePrivateWorkBuckets() {
    if (Date.now() - privacyPreflightAt < 30000) return;
    const result = await rpc('aesh_5_work_buckets_private', {}, true);
    if (result !== true) throw new Error('ارسال تصویر تا تکمیل تنظیمات امنیتی Storage آزمایشی متوقف است.');
    privacyPreflightAt = Date.now();
  }
  async function uploadNewObject(bucket, path, blob) {
    if (['aesh-member-works','aesh-owner-works','aesh-work-thumbs'].includes(bucket)) {
      await requirePrivateWorkBuckets();
    }
    let uncertainFirstAttempt = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await call('/storage/v1/object/' + bucket + '/' + path, {
          method: 'POST', body: blob,
          headers: { 'Content-Type': blob.type }
        }, true);
        return;
      } catch (error) {
        const message = String(error && error.message || '');
        if (uncertainFirstAttempt && (error.httpStatus === 400 || error.httpStatus === 409)
            && /already exists|asset already exists|duplicate/i.test(message)) return;
        if (!isTransportFailure(error)) throw error;
        if (attempt === 2) {
          throw new Error('ارتباط با فضای ذخیره‌سازی تصاویر بعد از چند تلاش برقرار نشد. درخواست به سرور نرسیده یا پاسخ آن توسط شبکه یا مرورگر مسدود شده است.');
        }
        uncertainFirstAttempt = true;
        await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 500 : 1100));
      }
    }
  }
  async function uploadWorkImage(file, id, isOwner) {
    const extension = canUploadImage(file, isOwner);
    if (!uuidShape.test(id)) throw new Error('شناسه آپلود معتبر نیست.');
    const person = await myProfile();
    if (!person || (isOwner ? person.role !== 'owner' : !['teacher','student'].includes(person.role))) throw new Error('مجوز آپلود برای این حساب وجود ندارد.');
    const bucket = isOwner ? 'aesh-owner-works' : 'aesh-member-works';
    const path = person.id + '/' + id + '.' + extension;
    await uploadNewObject(bucket, path, file);
    return path;
  }
  async function uploadWorkThumb(blob, id) {
    if (!uuidShape.test(id) || !blob || blob.type !== 'image/webp' || !blob.size || blob.size >= 100000) {
      throw new Error('تصویر بندانگشتی باید WebP و کمتر از ۱۰۰ کیلوبایت باشد.');
    }
    const person = await myProfile();
    if (!person) throw new Error('حساب مجاز پیدا نشد.');
    const path = person.id + '/' + id + '.webp';
    await uploadNewObject('aesh-work-thumbs', path, blob);
    return path;
  }
  const objPath = /^[0-9a-f]{8}-[0-9a-f-]{27,}\/([0-9a-f-]{36})\.(png|jpg|webp)$/i;
  function publicWorkMedia(bucket, path) {
    if (!enabled || !['aesh-member-works','aesh-owner-works','aesh-work-thumbs'].includes(bucket)) return '';
    if (!objPath.test(String(path || ''))) return '';
    if (bucket === 'aesh-work-thumbs' && !String(path).endsWith('.webp')) return '';
    // Authenticated Storage URLs cannot serve <img> tags with a bearer header.
    // The public Edge gateway checks the published-works RPC BEFORE proxying bytes;
    // pending objects have no public URL, even if their UUID is known.
    return url + '/functions/v1/aesh-approved-media/' + bucket + '/' + String(path).split('/').map(encodeURIComponent).join('/');
  }
  async function publicWorks() { return rpc('aesh_public_works'); }
  async function myWorks() { return rpc('aesh_my_works', {}, true); }
  async function ownerQueue() { return rpc('aesh_owner_work_queue', {}, true); }
  async function submitMyWork(title, description, path, thumb) {
    return rpc('aesh_submit_my_work', { p_title:title, p_description:description, p_object_path:path, p_thumb_path:thumb }, true);
  }
  async function ownerSubmitWork(title, description, path, thumb, role, slugOwner, slug) {
    return rpc('aesh_owner_submit_work', {
      p_title:title,p_description:description,p_object_path:path,p_thumb_path:thumb,
      p_owner_role:role,p_owner_slug:slugOwner,p_slug:slug || null
    }, true);
  }
  async function ownerManageWork(id, status, slug) {
    if (!uuidShape.test(id)) throw new Error('شناسه اثر معتبر نیست.');
    return rpc('aesh_owner_manage_work', { p_work_id:id,p_status:status,p_slug:slug || null }, true);
  }
  // Review media must be fetched WITH the authenticated manager token; never
  // expose an unauthenticated signed URL for a pending submission.
  async function reviewImage(item,small=false) {
    const person=await myProfile(true);
    if(!person||person.role!=='owner')throw new Error('فقط مدیر مجاز می‌تواند تصویر را ببیند.');
    const bucket=small?'aesh-work-thumbs':String(item.bucket_id||'');
    const path=String(small?item.thumb_path:item.object_path||'');
    if(!['aesh-member-works','aesh-owner-works','aesh-work-thumbs'].includes(bucket)||!objPath.test(path))
      throw new Error('مسیر تصویر برای پیش‌نمایش نامعتبر است.');
    if(small&&!path.endsWith('.webp'))throw new Error('نوع تصویر بندانگشتی معتبر نیست.');
    if(session.expires_at<Math.floor(Date.now()/1000)+90)await renew();
    const res=await fetch(url+'/storage/v1/object/authenticated/'+bucket+'/'+path.split('/').map(encodeURIComponent).join('/'),
      {headers:{'apikey':publicKey,'Authorization':'Bearer '+session.access_token},cache:'no-store'});
    if(!res.ok)throw new Error('سرور به تصویر مجوز نداد (HTTP '+res.status+'). سیاست Storage باید بررسی شود.');
    const blob=await res.blob();
    if(!['image/webp','image/jpeg','image/png'].includes(blob.type)||!blob.size||blob.size>20*1024*1024)
      throw new Error('محتوای تصویر معتبر نیست.');
    return blob;
  }
  async function publicDirectory(){return rpc('aesh_public_directory');}
  async function ownerDirectory(){return rpc('aesh_owner_directory',{},true);}
  async function ownerSaveDirectory(values){return rpc('aesh_owner_save_directory',values,true);}
  async function uploadDirectoryPhoto(blob,identifier){
    const person=await myProfile(true);
    if(!person||person.role!=='owner')throw new Error('فقط مدیر می‌تواند تصویر عضو جدید را بارگذاری کند.');
    if(!uuidShape.test(String(identifier))||!blob||blob.type!=='image/webp'||blob.size>=100000||!blob.size)
      throw new Error('تصویر نهایی باید WebP و کمتر از ۱۰۰٬۰۰۰ بایت باشد.');
    // No overwrite: a fresh immutable UUID per upload needs only Storage INSERT.
    // The directory record changes its image_path only AFTER this POST succeeds.
    const path=newWorkId()+'.webp';
    await uploadNewObject('aesh-directory',path,blob);
    return path;
  }
  function publicDirectoryPhoto(path){
    return enabled&&uuidShape.test(String(path||'').replace(/\.webp$/,''))&&String(path).endsWith('.webp')?
     url+'/storage/v1/object/public/aesh-directory/'+encodeURIComponent(path):'';
  }
  async function submitReview(name,body,honey=''){return rpc('aesh_submit_review',{p_display_name:name,p_body:body,p_website:honey});}
  async function publicReviews(){return rpc('aesh_public_reviews');}
  async function ownerReviews(){return rpc('aesh_owner_reviews',{},true);}
  async function moderateReview(id,status){return rpc('aesh_owner_moderate_review',{p_review_id:id,p_status:status},true);}
  window.AESHCore = Object.freeze({
    configured, needSetup, authenticated, login, logout, myProfile, saveBioAndAvatar,
    publicAvatar, uploadAvatar, rpc, base: url,
    newWorkId, canUploadImage, uploadWorkImage, uploadWorkThumb, publicWorkMedia,
    publicWorks, myWorks, ownerQueue, submitMyWork, ownerSubmitWork, ownerManageWork,
    reviewImage,publicDirectory,ownerDirectory,ownerSaveDirectory,uploadDirectoryPhoto,publicDirectoryPhoto,submitReview,publicReviews,ownerReviews,moderateReview
  });
})();

;

;
/* ========== assets/aesh-vote-detail.js ========== */
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

;

;
/* ========== assets/aesh-work-details.js ========== */
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

;
