/* AESH standalone GitHub Pages exporter. This runs ONLY in /editor/ after local authorization. */
(function(){
'use strict';
const $$=(sel,root=document)=>Array.from(root.querySelectorAll(sel));
const URL_ROOT=()=>new URL(document.baseURI);
const TEST_MODE=location.hostname==='aesh-test.github.io';
const loadURL=path=>new URL(String(path).replace(/^\//,''),URL_ROOT());
const enc=new TextEncoder();
const legacy=['student/امیر-رییسی/index.html','student/امیر-مهدی/index.html','student/امیر-مهدی-هنرجو/index.html','teacher/سید-علی-محمد-کاشی/index.html'];
const kinds=['home','teachers','students','portfolio','courses','events','news','faq','rules','about'];
let homeTemplate=null,reviewSectionHtml="";
function stripBadInline(root){
  $$('.add-btn,.del-btn,.item-edit,.person-edit,.portfolio-edit,.portfolio-del,.featured-edit,.add-tile,.portfolio-admin-note,#editBtn,#editorPreviewReturn',root).forEach(e=>e.remove());
  $$('[contenteditable]',root).forEach(x=>x.removeAttribute('contenteditable'));
  $$('[onclick]',root).forEach(x=>{if(/(?:handleSiteLink|isEditMode|editItem|addItem|delItem|editPerson|addPerson|addPortfolio|uploadImage|deletePortfolio|changeLogo)/.test(x.getAttribute('onclick')||''))x.removeAttribute('onclick');});
  $$('a[href]',root).forEach(a=>{let h=a.getAttribute('href');if(/^\/(?!\/)/.test(h))a.setAttribute('href',h.substring(1)||'./');});
  $$('img',root).forEach(img=>{if(!img.getAttribute('alt'))img.alt=img.closest('.person-card')?.querySelector('.person-name')?.textContent||'تصویر انجمن ادیتوران شایسته';img.decoding='async';if(!img.closest('.hero'))img.loading='lazy';});
  return root;
}
function setNode(dest,source){if(dest&&source)dest.replaceWith(source.cloneNode(true));}
function headFor(doc,route){
  const clean=(route.path||'/'),origin=TEST_MODE?'https://aesh-test.github.io':'https://aesh.ir',canonical=origin+clean;
  doc.title=route.title||'انجمن ادیتوران شایسته | AESH';
  if(TEST_MODE){for(const selector of ['meta[name=robots]','meta[name=googlebot]']){const bot=doc.head.querySelector(selector);if(bot)bot.setAttribute('content','noindex,nofollow,noarchive');}}
  const meta=(selector,key,value)=>{const el=doc.head.querySelector(selector);if(el)el.setAttribute(key,value);};
  meta('#metaDescription','content',route.description||'انجمن ادیتوران شایسته');
  for(const key of ['ogTitle','twitterTitle'])meta('#'+key,'content',route.title||doc.title);
  for(const key of ['ogDescription','twitterDescription'])meta('#'+key,'content',route.description||'');
  meta('#canonicalLink','href',canonical);meta('#ogUrl','content',canonical);
  meta('#alternateFa','href',canonical);meta('#alternateDefault','href',canonical);
  const image=route.image&&/^https:\/\//.test(route.image)?route.image:origin+'/favicon.png';
  meta('#ogImage','content',image);meta('#twitterImage','content',image);
  const schema=doc.getElementById('structuredData');
  if(schema){
    const graph=[{'@type':'Organization','@id':origin+'/#organization','name':'انجمن ادیتوران شایسته','url':origin+'/'},{'@type':'WebPage','url':canonical,'name':route.title||doc.title,'description':route.description||'','inLanguage':'fa-IR'}];
    if(route.kind==='teacher'||route.kind==='student')graph.push({'@type':'Person','name':route.item?.name||'','url':canonical});
    if(route.kind==='work')graph.push({'@type':'CreativeWork','name':route.item?.title||'','url':canonical});
    schema.textContent=JSON.stringify({'@context':'https://schema.org','@graph':graph}).replace(/</g,'\\u003c');
  }
}
function setNav(doc,section){
  $$('[data-page]',doc).forEach(el=>el.classList.toggle('active',el.dataset.page===section));
  doc.body.setAttribute('data-aesh-path',doc.querySelector('#canonicalLink')?.getAttribute('href')?.replace('https://aesh.ir','')||'/');
}
function wrapElement(node,cls){let main=document.createElement('main');main.className=cls;main.id='main-content';main.appendChild(node);return main;}
function detailContent(kind,raw){
  const item=raw||{};let node,section;
  if(kind==='teacher'||kind==='student'){
    openProfile(item,kind);node=document.querySelector('#profileView .profile-dialog')?.cloneNode(true);closeProfile(true);
    if(node){const b=node.querySelector('.profile-close');if(b){let a=document.createElement('a');a.className=b.className;a.id=b.id;a.href=kind==='teacher'?'teachers/':'students/';a.title='بازگشت به فهرست';a.setAttribute('aria-label','بازگشت به فهرست');a.innerHTML=b.innerHTML;b.replaceWith(a);}}
    if(node){const h=node.querySelector('#profileName');if(h){const one=document.createElement('h1');one.id=h.id;one.className=h.className;one.innerHTML=h.innerHTML;h.replaceWith(one);}}
    section=kind==='teacher'?'teachers':'students';
  }else if(kind==='work'){
    openPortfolioDetail(item);node=document.querySelector('#portfolioView .portfolio-dialog')?.cloneNode(true);closePortfolioDetail(true);
    if(node){const b=node.querySelector('.portfolio-detail-close');if(b){let a=document.createElement('a');a.className=b.className;a.href='portfolio/';a.title='بازگشت به نمونه‌کارها';a.setAttribute('aria-label','بازگشت به نمونه‌کارها');a.innerHTML=b.innerHTML;b.replaceWith(a);}}
    if(node){const h=node.querySelector('#portfolioDetailTitle');if(h){const one=document.createElement('h1');one.id=h.id;one.className=h.className;one.innerHTML=h.innerHTML;h.replaceWith(one);}}
    section='portfolio';
  }else if(kind==='featured'){
    openFeaturedDetail(item);node=document.querySelector('#featuredView .featured-dialog')?.cloneNode(true);closeFeaturedDetail(false,true);
    if(node){const b=node.querySelector('.featured-view-close');if(b){let a=document.createElement('a');a.className=b.className;a.href='./';a.title='بازگشت به خانه';a.setAttribute('aria-label','بازگشت به خانه');a.innerHTML=b.innerHTML;b.replaceWith(a);}}
    if(node){const h=node.querySelector('#featuredDetailTitle');if(h){const one=document.createElement('h1');one.id=h.id;one.className=h.className;one.innerHTML=h.innerHTML;h.replaceWith(one);}}
    section='home';
  }else{
    section=kind==='course'?'courses':kind==='news'?'news':'events';
    const group=document.getElementById(kind==='course'?'coursesGrid':kind==='news'?'newsGrid':'eventsGrid');
    const target=Array.from(group?.querySelectorAll('.'+(kind==='course'?'course-card':kind==='news'?'news-card':'event-card'))||[]).find(x=>x.dataset.itemId===item.id);
    node=document.createElement('div');node.className='container';
    const heading=document.createElement('h1');heading.textContent=item.title||'جزئیات';heading.style.marginBottom='28px';node.append(heading);
    const original=document.createElement('div');original.className='aesh-item-original';if(target)original.appendChild(target.cloneNode(true));
    node.appendChild(original);
    const a=document.createElement('a');a.className='btn btn-outline';a.href=section+'/';a.textContent='بازگشت به '+(kind==='news'?'اخبار':kind==='course'?'دوره‌ها':'رویدادها');node.appendChild(a);
    let main=wrapElement(node,'aesh-item-page');return {main,section};
  }
  if(!node)throw new Error('DETAIL_RENDER_MISSING '+kind+' '+(item.id||item.slug));
  node.removeAttribute('aria-modal');node.removeAttribute('role');
  return {main:wrapElement(node,'aesh-detail-page'),section};
}
function activeContent(route){
 const kind=route.kind;if(kind==='page'){
  const section=route.path==='/'?'home':route.path.replace(/^\//,'').split('/')[0];
  const src=document.querySelector('#page-'+section);
  if(!src)throw new Error('PAGE_SOURCE_MISSING '+section);
  const view=src.cloneNode(true);view.classList.add('active');
  if(section==='portfolio'){
    const cards=$$('#portfolioGrid .portfolio-card',view);
    cards.forEach((card,i)=>{if(i>=12)card.setAttribute('data-more-hidden','true');
      const it=window.__AESH_EXPORT_DATA__?.portfolio?.find(x=>String(x.id)===String(card.dataset.itemId));
      if(it){card.dataset.ownerType=it.ownerType||'student';
        card.dataset.aeshCloudId=it._aesh_cloud?String(it.id||'').replace(/^cloud-/,''):'';
        card.dataset.cloudPending=String(!!it._aesh_cloud);}});
  }
  return {main:view,section};
 }
 return detailContent(kind,route.item);
}
function serializedDocument(route){
 const parser=new DOMParser(),doc=parser.parseFromString(homeTemplate,'text/html');
 const content=activeContent(route),current=doc.querySelector('.page.active,main.aesh-detail-page,main.aesh-item-page');
 if(!current)throw new Error('TEMPLATE_PAGE_MISSING');
 current.replaceWith(stripBadInline(content.main));
 // Header/footer are sourced from live editor, so edits to public text and logo export too.
 for(const sel of ['header','#mobileNavOverlay','footer','#backTop','#globalSearchModal'])setNode(doc.querySelector(sel),document.querySelector(sel));
 stripBadInline(doc.body);
 setNav(doc,content.section);headFor(doc,route);
 doc.body.dataset.aeshKind=route.kind;doc.body.dataset.aeshPath=route.path; 
 // Recreate page-local enhancement modules; a homepage-only script is not enough.
 const scripts=Array.from(doc.querySelectorAll('script[src]'));
 for(const tag of scripts){if(tag.src.includes('aesh-home-stats'))tag.remove();}
 function addScript(filename){const x=doc.createElement('script');x.src='/assets/'+filename+'?v=5.0';x.defer=true;doc.body.appendChild(x);}
 function needsApi(){return route.kind==='teacher'||route.kind==='student'||route.kind==='work'||['/','/teachers/','/students/','/portfolio/','/about/'].includes(route.path);}
 if(needsApi()&&!doc.querySelector('script[src*="aesh-core.js"]')){addScript('aesh-config.js');addScript('aesh-core.js');}
 if(route.path==='/'){doc.body.dataset.aeshStaticWorkCount=String((window.__AESH_EXPORT_DATA__?.portfolio||[]).filter(x=>!x._aesh_cloud).length);addScript('aesh-home-stats.js');}
 if(route.path==='/portfolio/')addScript('aesh-cloud-gallery.js');
 if(route.kind==='teacher'||route.kind==='student')addScript('aesh-profile-sync.js');
 if(route.path==='/teachers/'||route.path==='/students/')addScript('aesh-directory.js');
 if(route.path==='/about/'){
   if(reviewSectionHtml){const fragment=doc.createElement('div');fragment.innerHTML=reviewSectionHtml;
     const slot=doc.querySelector('#page-about');if(slot)while(fragment.firstChild)slot.append(fragment.firstChild);}
   addScript('aesh-reviews.js');
 }
 if(route.kind==='teacher'){
   if(window.AESHFeaturedWorksAdmin?.decorateTeacher){
      const main=doc.querySelector('.aesh-detail-page');
      if(main)window.AESHFeaturedWorksAdmin.decorateTeacher(main,route.item,window.__AESH_EXPORT_DATA__);
   }
   const src=(window.__AESH_EXPORT_DATA__?.portfolio||[]).filter(w=>w.ownerType==='teacher'&&w.ownerSlug===route.item?.slug&&!w._aesh_cloud)
     .map(w=>({id:String(w.id),slug:w.slug,title:w.title,image:w.thumb||w.image,owner_role:'teacher',owner_slug:route.item.slug,created_at:w.published_at||w.created_at||'',width:w.fullWidth||0,height:w.fullHeight||0}));
   const section=doc.querySelector('.teacher-best-gallery');if(section){section.id='aeshTeacherRecentWorks';
     const grid=section.querySelector('.portfolio-grid');if(grid)grid.id='aeshTeacherRecentGrid';
     const empty=section.querySelector('.teacher-best-empty');if(empty)empty.id='aeshTeacherWorksEmpty';
   }
   const json=doc.createElement('script');json.id='aeshTeacherStaticWorks';json.type='application/json';json.textContent=JSON.stringify(src).replace(/</g,'\\u003c');doc.body.appendChild(json);
   addScript('aesh-teacher-works.js');
 }
 if(route.kind==='work')addScript('aesh-work-details.js');
 if(route.kind==='work'){
    doc.body.dataset.aeshWorkId=String(route.item?._aesh_key||('legacy:'+String(route.item?.id||'')));
    if(!doc.querySelector('script[src*="aesh-vote-detail.js"]'))addScript('aesh-vote-detail.js');
 }
 // Redundant editor scripts must never be present in public pages.
 $$('script',doc).forEach(s=>{if(s.id==='embedded-data'||s.src?.includes('aesh-editor'))s.remove();});
 return '<!doctype html>\n'+doc.documentElement.outerHTML;
}
function normalizedRoute(r){const path=r.path||'/';return {...r,path,kind:r.kind==='person'?(r.type||'teacher'):r.kind};}
async function embeddedAssets(markup,put){
 const rx=/data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)/ig;
 const found=new Map();for(let m;(m=rx.exec(markup));){const full=m[0];if(!found.has(full))found.set(full,{extension:m[1].toLowerCase().replace('jpeg','jpg'),encoded:m[2]});}
 for(const [raw,p] of found){
  const b=bytesFromBase64(p.encoded);
  if(!crypto?.subtle)throw new Error('HTTPS_REQUIRED_FOR_HASHING');
  const digest=await crypto.subtle.digest('SHA-256',b);const k=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,22);
  const file='assets/content/'+k+'.'+p.extension;put(file,b);markup=markup.split(raw).join(file);
 }
 return markup;
}
function makeSearchIndex(d){let idx=[];
 for(const [kind,items] of [['teacher',d.teachers],['student',d.students],['work',d.portfolio],['news',d.news],['course',d.courses],['featured',d.featured]]){
  for(const x of items||[]){const path=kind==='featured'?'/featured/'+encodeURIComponent(x.id)+'/':kind==='teacher'||kind==='student'?personRoutePath(x,kind):kind==='work'?portfolioRoutePath(x):itemRoutePath(kind,x);
   idx.push({type:kind,title:x.name||x.title||x.label||'',detail:String(x.role||x.desc||x.bio||x.excerpt||'').slice(0,160),href:path});
  }
 }return JSON.stringify(idx);
}
async function getFile(path){const url=loadURL(path);const res=await fetch(url,{credentials:'same-origin',cache:'no-store'});if(!res.ok)throw new Error('FILE_FETCH_'+res.status+' '+path);return new Uint8Array(await res.arrayBuffer());}
async function getText(path){return new TextDecoder().decode(await getFile(path));}
function safePushFactory(){const files=[],byName=new Map();return {files,byName,put(name,data){
 let n=String(name).replace(/^\/+/, '');if(!n||n.includes('..')||/^\//.test(n))throw new Error('ILLEGAL_PACKAGE_FILENAME: '+n);
 const bytes=data instanceof Uint8Array?data:enc.encode(String(data));if(byName.has(n)){byName.get(n).data=bytes;return;}
 const x={name:n,data:bytes};byName.set(n,x);files.push(x);
 }};}
function featuredRoute(x){return {path:'/featured/'+encodeURIComponent(x.id)+'/',title:(x.title||'برگزیده')+' | انجمن ادیتوران شایسته',description:x.desc||x.name||'',image:x.image||'',kind:'featured',item:x};}
function missingStatus(missing){const e=new Error('FILES_MISSING '+missing.slice(0,8).join(', '));e.missingFiles=missing;throw e;}
async function exportAll(){
 if(!Auth.isAuthorized())throw new Error('NOT_AUTHORIZED');
 const d=buildData();window.__AESH_EXPORT_DATA__=d;
 const previousGalleryCount=portfolioVisibleCount,previousGalleryFilter=portfolioFilter;
 portfolioVisibleCount=Math.max(12,(d.portfolio||[]).length+1);portfolioFilter='all';renderPortfolio();
 const store=safePushFactory(),put=store.put;const routes=allSeoRoutes(d).map(normalizedRoute);const featured=(d.featured||[]).map(featuredRoute);
 const extra=featured.filter(x=>!routes.some(r=>r.path===x.path));const all=routes.concat(extra);
 homeTemplate=await getText('index.html');
 const aboutPage=await getText('about/index.html');
 reviewSectionHtml=new DOMParser().parseFromString(aboutPage,'text/html').getElementById('aeshReviews')?.outerHTML||'';
 if(!homeTemplate.includes('aesh-static.js'))throw new Error('TEMPLATE_IS_NOT_INDEPENDENT');
 // Current editor HTML and the newer password verifier are included ONLY at /editor/.
 let editorDoc=buildHtml({...d});const config=Auth.exportConfig();
 if(!config)throw new Error('MISSING_PASSWORD_HASH');
 const marker=/var DEFAULT_AUTH=\{"version":3,"algo":"PBKDF2-SHA256","iterations":\d+,"salt":"[^"]+","hash":"[^"]+"\};/;
 if(!marker.test(editorDoc))throw new Error('AUTH_MARKER_MISSING');
 editorDoc=editorDoc.replace(marker,'var DEFAULT_AUTH='+JSON.stringify(config)+';');
 editorDoc=await embeddedAssets(editorDoc,put); // assets kept alongside other updated documents
 put('editor/index.html',editorDoc);
 for(const r of all){const name=routeFileName(r.path);let markup=serializedDocument(r);
   markup=await embeddedAssets(markup,put);put(name,markup);
 }
 // Legacy paths cannot disappear. They are fetched from the current static deployment.
 for(const path of legacy){if(!store.byName.has(path)){let html=await getText(path);if(/(?:__aesh_reload|fetch\s*\(.*index\.html)/.test(html))throw new Error('OLD_LEGACY_SHELL '+path);put(path,html);}}
 let notFound=await getText('404.html');if(/__aesh_reload|location\.replace/.test(notFound))throw new Error('OLD_404_REDIRECT');put('404.html',notFound);
 const existingSitemap=await getText('sitemap.xml');
 // The immutable 65 old URL slugs must never be lost when editing/rearranging content.
 const oldLinks=Array.from(existingSitemap.matchAll(/<loc>(https:\/\/aesh\.ir\/[^<]*)<\/loc>/g)).map(m=>m[1]);
 for(const old of oldLinks){const pathname=new URL(old).pathname;const name=routeFileName(pathname);if(!store.byName.has(name)){const preserved=await getText(name);if(!preserved.includes('aesh-static.js'))throw new Error('PREVIOUS_ROUTE_NOT_STANDALONE '+pathname);put(name,preserved);}}
 let sm=buildSitemapXml(d);
 let needed=new Set(oldLinks);let actual=new Set(Array.from(sm.matchAll(/<loc>([^<]+)<\/loc>/g)).map(x=>x[1].replace(/&amp;/g,'&')));
 for(const uri of needed)if(!actual.has(uri)){sm=sm.replace('</urlset>',`  <url><loc>${uri.replace(/&/g,'&amp;')}</loc></url>\n</urlset>`);actual.add(uri);}
 for(const r of extra){const uri='https://aesh.ir'+r.path;if(!actual.has(uri))sm=sm.replace('</urlset>',`  <url><loc>${uri}</loc></url>\n</urlset>`);}
 if(TEST_MODE)sm=sm.replaceAll('https://aesh.ir','https://aesh-test.github.io');
 put('sitemap.xml',sm);
 if(TEST_MODE)put('.aesh-test','AESH isolated test environment. No production CNAME.\n');
 put('assets/aesh-search-index.json',makeSearchIndex(d));
 const manifest=JSON.parse(await getText('assets/aesh-package-files.json'));
 if(!Array.isArray(manifest)||manifest.length<40)throw new Error('MANIFEST_INVALID');
 let next=0,missing=[];
 async function worker(){while(next<manifest.length){const path=manifest[next++];if(store.byName.has(path)||(TEST_MODE&&path==='CNAME'))continue;
    // Always prefer the actual deployed file. Embedded data is ONLY a fallback
    // for files GitHub Pages won't serve (e.g. dotfiles). Never restore stale JS.
    try{put(path,await getFile(path));continue;}catch(e){}
    if(Object.prototype.hasOwnProperty.call(AESH_EDITOR_EMBEDDED_FILES,path)){
      put(path,bytesFromBase64(AESH_EDITOR_EMBEDDED_FILES[path]));continue;
    }
    if(window.AESH_IMMUTABLE_FILES&&Object.prototype.hasOwnProperty.call(window.AESH_IMMUTABLE_FILES,path)){
      put(path,bytesFromBase64(window.AESH_IMMUTABLE_FILES[path]));continue;
    }
    missing.push(path);
 }}
 await Promise.all(Array.from({length:Math.min(8,manifest.length)},()=>worker()));
 if(missing.length)missingStatus(missing);
 for(const path of ['assets/aesh-site.css','assets/aesh-static.js','assets/aesh-pages.css','assets/aesh-editor-export.js','assets/aesh-editor-runtime.css','assets/aesh-editor-immutable.js','robots.txt','sw.js','.nojekyll'].concat(TEST_MODE?[]:['CNAME'])){
   if(!store.byName.has(path))missingStatus([path]);
 }
 const nextManifest=Array.from(new Set(manifest.concat(Array.from(store.byName.keys()).filter(x=>x.startsWith('assets/'))))).filter(x=>!TEST_MODE||x!=='CNAME').sort();
 put('assets/aesh-package-files.json',JSON.stringify(nextManifest));
 for(const r of routes){if(!store.byName.has(routeFileName(r.path)))missingStatus([r.path]);}
 const zip=makeStoreZip(store.files);if(zip.size<8000000)throw new Error('ZIP_TOO_SMALL_CHECK_IMAGES');
 portfolioVisibleCount=previousGalleryCount;portfolioFilter=previousGalleryFilter;renderPortfolio();
 return {zip,routeCount:all.length,assetCount:store.files.filter(x=>x.name.startsWith('assets/')).length,fileCount:store.files.length};
}
window.buildFastPackage=exportAll;
window.saveFastPackage=async function(){if(!Auth.isAuthorized())return;
 if(!(await requestReauth('برای دریافت بسته کامل GitHub، رمز مدیریت را دوباره وارد کنید')))return;
 const buttons=Array.from(document.querySelectorAll('[onclick="saveFastPackage()"]'));
 try{buttons.forEach(b=>b.disabled=true);toast('⏳ در حال ساخت صفحات مستقل و جمع‌آوری تمام فایل‌های سایت…','info');
   const result=await exportAll();downloadBlob(result.zip,'AESH_GitHub_Independent_Pages.zip');
   toast('✅ ZIP کامل با '+result.routeCount+' صفحه مستقل و '+result.fileCount+' فایل ساخته شد','success');
 }catch(e){console.error('AESH independent export failed',e);toast('❌ بسته ناقص دریافت نشد. جزئیات در پیام خطا.','error');alert('خروجی GitHub ساخته نشد تا فایل ناقص دریافت نشود.\n'+String(e.message||e));}
 finally{buttons.forEach(b=>b.disabled=false);}
};
// An admin visiting /editor/ is prompted automatically; never silently grant access.
function promptLogin(){if(!Auth.isAuthorized()&&!document.querySelector('#loginModal.show'))toggleEdit();}
document.addEventListener('aesh:site-ready',()=>setTimeout(promptLogin,80));
if(window.__AESH_SITE_READY__)setTimeout(promptLogin,80);
})();
