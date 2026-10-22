/* AESH public pages. No SPA, no index.html fetch, no CMS data fetched for ordinary pages. */
(function(){
'use strict';
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
function hydratePortfolio(){const nodes=$$('.portfolio-card-media[data-src]');function fill(el){const url=el.getAttribute('data-src');if(!url||el.querySelector('img'))return;const img=document.createElement('img');img.src=url;img.alt=el.getAttribute('data-alt')||'نمونه‌کار';img.loading='lazy';img.decoding='async';// Restore the healthy-site blurred backdrop from the same lazily loaded artwork.
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
