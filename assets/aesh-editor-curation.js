/* AESH 5: local, password-gated editor curation of up to 8 works per teacher.
   IDs and owner slugs, never name similarity, determine artwork ownership. */
(function(){
'use strict';
if(!window.__AESH_EDITOR_CONTEXT__)return;
const KEY='aesh:teacher-featured-work-ids:v5';
let selected={};let loaded=false;let dialog=null;
const clone=x=>JSON.parse(JSON.stringify(x||{}));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function cleanMap(v){const obj={};if(!v||typeof v!=='object')return obj;
 for(const [id,ids] of Object.entries(v))if(Array.isArray(ids))obj[String(id)]=[...new Set(ids.map(String))].slice(0,8);
 return obj;
}
async function load(){if(loaded)return;
 try {const res=await fetch('/assets/aesh-featured-works.json',{cache:'no-store'});if(res.ok)selected=cleanMap(await res.json());}catch{}
 try {const raw=localStorage.getItem(KEY);if(raw)selected=cleanMap(JSON.parse(raw));}catch{}
 loaded=true;
}
function current(){return clone(selected);}
function data(){return typeof buildData==='function'?buildData():null;}
function authorized(){return window.Auth&&typeof Auth.isAuthorized==='function'&&Auth.isAuthorized();}
function save(){if(!authorized())return false;
 try{localStorage.setItem(KEY,JSON.stringify(selected));return true;}catch{return false;}}
function render(){if(!dialog||!dialog.isConnected||!authorized())return;
 const d=data();if(!d)return;
 const teacherId=dialog.querySelector('#bestTeacherSelect')?.value||String(d.teachers[0]?.id||'');
 const teachers=d.teachers||[];
 const chooser=dialog.querySelector('#bestTeacherSelect');chooser.innerHTML='';
 for(const t of teachers){const o=document.createElement('option');o.value=String(t.id);o.textContent=t.name||'استاد';chooser.append(o);}
 chooser.value=teachers.some(t=>String(t.id)===teacherId)?teacherId:String(teachers[0]?.id||'');
 const teacher=teachers.find(t=>String(t.id)===chooser.value);const box=dialog.querySelector('#bestTeacherWorks');box.replaceChildren();
 if(!teacher){box.textContent='استادی ثبت نشده است.';return;}
 const options=(d.portfolio||[]).filter(x=>x.ownerType==='teacher'&&x.ownerSlug===teacher.slug);
 const pick=(selected[String(teacher.id)]||[]).filter(id=>options.some(w=>String(w.id)===id));
 selected[String(teacher.id)]=pick;
 const counter=dialog.querySelector('#bestTeacherCount');counter.textContent=pick.length+' از ۸ اثر انتخاب‌شده';
 function line(w,idx){
  const el=document.createElement('div');el.className='aesh-best-row';
  const input=document.createElement('input');input.type='checkbox';input.checked=pick.includes(String(w.id));input.disabled=!input.checked&&pick.length>=8;
  input.setAttribute('aria-label','انتخاب '+(w.title||'اثر'));
  input.onchange=()=>{if(input.checked){if(pick.length<8)pick.push(String(w.id));}else{const ix=pick.indexOf(String(w.id));if(ix>=0)pick.splice(ix,1);}selected[String(teacher.id)]=pick;render();};
  const label=document.createElement('span');label.textContent=(idx>=0?'#'+(idx+1)+' · ':'')+(w.title||'بدون عنوان');
  const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='بالاتر';up.disabled=idx<=0;
  up.onclick=()=>{[pick[idx-1],pick[idx]]=[pick[idx],pick[idx-1]];selected[String(teacher.id)]=pick;render();};
  const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='پایین‌تر';down.disabled=idx<0||idx>=pick.length-1;
  down.onclick=()=>{[pick[idx+1],pick[idx]]=[pick[idx],pick[idx+1]];selected[String(teacher.id)]=pick;render();};
  el.append(input,label,up,down);return el;
 }
 for(const [idx,id] of pick.entries()){const w=options.find(x=>String(x.id)===id);if(w)box.append(line(w,idx));}
 for(const w of options.filter(x=>!pick.includes(String(x.id))))box.append(line(w,-1));
 if(!options.length){box.textContent='برای این استاد هنوز نمونه‌کاری با شناسه مالک معتبر ثبت نشده است.';}
}
function openManager(){if(!authorized()){alert('ابتدا از طریق ویرایشگر وارد شوید.');return;}
 alert('هشت نمونه‌کار اخیر هر استاد دیگر به‌صورت خودکار از آثار منتشرشده همان استاد انتخاب می‌شود. انتخاب دستی قدیمی بایگانی شده و در خروجی جدید اثری ندارد.');return;
 if(dialog){dialog.hidden=false;render();return;}
 const layer=document.createElement('div');layer.id='aesh-best-manager';layer.dir='rtl';layer.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="bestTitle"><header><strong id="bestTitle">انتخاب ۸ نمونه‌کار برتر هر استاد</strong><button type="button" id="bestClose" aria-label="بستن">×</button></header><p>فقط آثار با شناسه مالک ثبت‌شده برای همین استاد نمایش داده می‌شوند. ترتیب آثار را با پیکان‌ها تغییر بده.</p><label for="bestTeacherSelect">انتخاب استاد</label><select id="bestTeacherSelect"></select><div id="bestTeacherCount" role="status"></div><div id="bestTeacherWorks"></div><footer><button type="button" id="bestSave">ذخیره انتخاب‌ها</button><button type="button" id="bestCancel">بستن</button></footer></section>';
 const style=document.createElement('style');style.id='aesh-best-manager-css';style.textContent='#aesh-best-manager{position:fixed;inset:0;z-index:999999;background:#0009;display:grid;place-items:center;padding:16px;font-family:inherit}#aesh-best-manager[hidden]{display:none!important}#aesh-best-manager section{width:min(650px,100%);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;background:var(--surface,#fff);color:var(--text,#141414);border:2px solid #dab34a;border-radius:20px;padding:20px;box-shadow:0 25px 90px #0006}#aesh-best-manager header,#aesh-best-manager footer{display:flex;align-items:center;justify-content:space-between;gap:10px}#aesh-best-manager p{font-size:.85rem;margin:12px 0;line-height:2}#bestTeacherSelect{margin:8px 0;padding:9px;border:1px solid #d6c69c;border-radius:8px}#bestTeacherWorks{overflow:auto;flex:1;display:grid;gap:6px;margin:12px 0}#aesh-best-manager .aesh-best-row{display:flex;gap:8px;align-items:center;border:1px solid #c9b78066;border-radius:9px;padding:9px}#aesh-best-manager .aesh-best-row span{flex:1;font-size:.85rem}#aesh-best-manager button{cursor:pointer;border:1px solid #c7b37b;background:#fff7d6;color:#30250d;padding:7px 11px;border-radius:8px}#aesh-best-manager button:disabled{opacity:.35;cursor:default}#aesh-best-manager #bestSave{background:#d1a525}';
 document.head.append(style);document.body.append(layer);dialog=layer;
 layer.querySelector('#bestClose').onclick=layer.querySelector('#bestCancel').onclick=()=>{layer.hidden=true;};
 layer.querySelector('#bestTeacherSelect').onchange=render;
 layer.querySelector('#bestSave').onclick=()=>{if(save()){layer.hidden=true;alert('انتخاب‌ها ذخیره شدند. برای اعمال روی سایت، از ویرایشگر ZIP کامل GitHub را دانلود و نسخه آزمایشی را منتشر کنید.');}else alert('ذخیره انجام نشد.');};
 render();
}
function injectButton(){if(!authorized())return;
 const panel=document.getElementById('editPanel');if(!panel||document.getElementById('aeshBestButton'))return;
 const btn=document.createElement('button');btn.id='aeshBestButton';btn.type='button';btn.className='edit-tool-btn';btn.textContent='۸ نمونه‌کار اخیر (خودکار)';btn.style.cssText='background:#e7c45c;color:#171717;border-radius:9px;padding:7px 10px;font-weight:700;margin:4px';
 btn.addEventListener('click',openManager);panel.append(btn);
}
function decorateTeacher(main,item,d){
 if(!main||!item)return;
 const chosen=selected[String(item.id)]||[];
 const options=(d.portfolio||[]).filter(x=>x.ownerType==='teacher'&&x.ownerSlug===item.slug);
 const staticWorks=options.filter(w=>!w._aesh_cloud);
 const withDates=staticWorks.filter(w=>w.published_at||w.created_at).sort((a,b)=>Date.parse(b.published_at||b.created_at)-Date.parse(a.published_at||a.created_at));
 const selectedWorks=[...withDates,...staticWorks.filter(w=>!w.published_at&&!w.created_at)].slice(0,8);
 const section=document.createElement('section');section.className='teacher-best-gallery';
 const wrap=document.createElement('div');wrap.className='container';wrap.innerHTML='<div class="section-head"><div class="section-label">آثار اخیر استاد</div><h2 class="section-title">۸ نمونه‌کار اخیر این استاد</h2></div>';
 const grid=document.createElement('div');grid.className='portfolio-grid';
 for(const w of selectedWorks){
  const card=document.createElement('article');card.className='portfolio-card';card.dataset.itemId=w.id||'';card.dataset.slug=w.slug||'';card.dataset.ownerType='teacher';
  const a=document.createElement('a');a.className='portfolio-card-link';a.href=typeof portfolioRoutePath==='function'?portfolioRoutePath(w):'/work/'+encodeURIComponent(w.slug||'')+'/';a.setAttribute('aria-label','مشاهده '+(w.title||'اثر'));
  const med=document.createElement('div');med.className='portfolio-card-media portfolio-loading';med.dataset.src=w.thumb||w.image||'';med.dataset.fullSrc=w.image||'';med.dataset.alt=w.title||'نمونه‌کار';
  const body=document.createElement('div');body.className='portfolio-card-body';body.innerHTML='<div class="portfolio-card-topline"><span class="portfolio-card-type">اثر استاد</span><span class="portfolio-card-dim">ابعاد اثر</span></div><div class="portfolio-card-title"></div><div class="portfolio-card-owner"></div><div class="portfolio-card-more"><span>مشاهده صفحه اثر</span><i class="fas fa-arrow-left"></i></div>';
  body.querySelector('.portfolio-card-title').textContent=w.title||'';body.querySelector('.portfolio-card-owner').textContent=item.name||'';
  card.append(a,med,body);grid.append(card);
 }
 if(selectedWorks.length)wrap.append(grid);
 else{const p=document.createElement('p');p.className='teacher-best-empty';p.textContent='هنوز نمونه‌کاری برای این استاد منتشر نشده است.';wrap.append(p);}
 section.append(wrap);main.append(section);
}
window.AESHFeaturedWorksAdmin={load,current,decorateTeacher};
async function init(){await load();injectButton();const panel=document.getElementById('editPanel');if(panel)new MutationObserver(()=>injectButton()).observe(panel,{attributes:true,attributeFilter:['class']});}
document.addEventListener('aesh:site-ready',()=>setTimeout(init,100));
if(window.__AESH_SITE_READY__)setTimeout(init,100);
document.addEventListener('click',e=>{if(e.target.closest?.('#editPanel'))setTimeout(injectButton,50);},true);
})();
