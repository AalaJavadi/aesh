/* AESH Cloudflare CMS control surface. Cloudflare Access handles sign-in.
   This client never stores service tokens or constructs unsanitized HTML. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const read=(form,name)=>String(form.elements.namedItem(name)?.value||'').trim();
const api={};
let actor=null,cache={profiles:[],works:[],articles:[],actors:[],audit:[],'profile-requests':[],invitations:[]};
let blockSerial=0;
function el(tag,text='',cls=''){const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=String(text);if(cls)e.className=cls;return e;}
function msg(text,bad=false){const n=$('notice');n.hidden=!text;n.textContent=text;n.className='notice'+(bad?' error':'');if(text)n.scrollIntoView({block:'nearest',behavior:'smooth'});}
async function request(path,method='GET',value=null){
 const options={method,credentials:'same-origin',headers:{'Accept':'application/json'}};
 if(value!==null){options.headers['content-type']='application/json';options.body=JSON.stringify(value);}
 const r=await fetch('/v1/'+path,options);const j=await r.json().catch(()=>({error:'پاسخ سرور نامعتبر است'}));
 if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j;
}
const P=(name)=>$('pane-'+name);
function activate(name){
 for(const btn of document.querySelectorAll('[data-tab]'))btn.classList.toggle('active',btn.dataset.tab===name);
 for(const panel of document.querySelectorAll('.tab-pane'))panel.hidden=panel.id!=='pane-'+name;
 history.replaceState(null,'','#'+name);
}
function recordCard(title,subtitle=''){const outer=el('div','','record'),h=el('strong',title),small=el('small',subtitle),actions=el('div','','record-actions');outer.append(h,small,actions);return {outer,actions};}
function action(target,label,fn,style='secondary'){const b=el('button',label,style);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(err){msg('خطا: '+err.message,true);}finally{b.disabled=false;}});target.append(b);return b;}
function safeJSON(text,fallback){try{return JSON.parse(text)||fallback;}catch{return fallback;}}
function fieldsArray(id,n=4,percentage=false){
 const wrap=$(id);wrap.replaceChildren();
 for(let i=0;i<n;i++){
  const row=el('div','','field-row'),label=el('input'),value=el('input');
  label.placeholder='عنوان '+(i+1);label.maxLength=70;label.dataset.index=i;label.className='value-label';
  value.placeholder=percentage?'درصد ۰ تا ۱۰۰':'مقدار';value.className='value-number';
  if(percentage){value.type='number';value.min='0';value.max='100';value.step='1';}else value.maxLength=40;
  row.append(label,value);wrap.append(row);
 }
}
function captureRows(id,percentage=false){
 const list=[];
 for(const row of $(id).querySelectorAll('.field-row')){
  const title=row.querySelector('.value-label').value.trim(),raw=row.querySelector('.value-number').value.trim();
  if(!title&&!raw)continue;
  if(!title||!raw)throw new Error('عنوان و مقدار هر ردیف باید کامل باشد.');
  let value=raw;
  if(percentage){value=Number(raw);if(!Number.isInteger(value)||value<0||value>100)throw new Error('درصد باید عدد صحیح بین صفر و صد باشد.');}
  list.push({label:title,value});
 }
 return list;
}
function fillRows(id,items){
 const rows=[...$(id).querySelectorAll('.field-row')];
 for(let i=0;i<rows.length;i++){const value=items?.[i];rows[i].querySelector('.value-label').value=value?.label||'';rows[i].querySelector('.value-number').value=value?.value??'';}
}
function formUpdate(form,data){for(const [key,value] of Object.entries(data)){const field=form.elements.namedItem(key);if(field&&('value' in field))field.value=value??'';}}
function readProfile(){
 const f=$('profileForm'),fExtra=['joinDate','rank','availability','work_style','achievements','portfolio_url','rubika'];
 const extra={};for(const item of fExtra){extra[item]=read(f,item);}
 return {id:read(f,'id')||undefined,role:read(f,'role'),slug:read(f,'slug'),display_name:read(f,'display_name'),legacy_id:read(f,'legacy_id')||undefined,
 specialty:read(f,'specialty'),skills:read(f,'skills').split(/[,،]/).map(x=>x.trim()).filter(Boolean),bio:read(f,'bio'),extra,
 stats:captureRows('profileStats'),performance:captureRows('profilePerformance',true),media_id:read(f,'media_id')||null,actor_sub:read(f,'actor_sub')||null,status:read(f,'status')};
}
function resetProfile(){const f=$('profileForm');f.reset();f.elements.namedItem('id').value='';f.elements.namedItem('slug').readOnly=false;
 f.elements.namedItem('role').disabled=false;$('profilePreview').hidden=true;fillRows('profileStats',[]);fillRows('profilePerformance',[]);}
function editProfile(p){activate('profiles');resetProfile();formUpdate($('profileForm'),{id:p.id,legacy_id:p.legacy_id,role:p.role,slug:p.slug,display_name:p.display_name,
 specialty:p.specialty,skills:safeJSON(p.skills_json,[]).join('، '),bio:p.bio,media_id:p.media_id,actor_sub:p.actor_sub,status:p.status,...safeJSON(p.extra_json,{})});
 fillRows('profileStats',safeJSON(p.stats_json,[]));fillRows('profilePerformance',safeJSON(p.performance_json,[]));
 $('profileForm').elements.namedItem('slug').readOnly=true;$('profileForm').elements.namedItem('role').disabled=true;window.scrollTo({top:0,behavior:'smooth'});}
function profilePreview(){
 try{
 const data=readProfile(),wrap=$('profilePreview');wrap.replaceChildren();wrap.append(el('h3',data.display_name),el('span',data.role==='teacher'?'استاد انجمن':'هنرجوی انجمن','tag'),el('p',data.specialty),el('p',data.bio));
 for(const x of data.stats)wrap.append(el('p',x.label+': '+x.value));
 for(const p of data.performance){const row=el('div','','chart-line');row.append(el('span',p.label+' ('+p.value+'٪)'));
  const track=el('div','','bar'),filled=el('span');filled.style.width=p.value+'%';track.append(filled);row.append(track);wrap.append(row);}
 if(data.media_id){const image=el('img');image.src='/v1/private/media/'+encodeURIComponent(data.media_id);image.alt=data.display_name;image.loading='lazy';image.className='preview-image';wrap.append(image);}
 wrap.hidden=false;msg('پیش‌نمایش از داده‌های همین فرم ساخته شد؛ هنوز چیزی منتشر نشده است.');
 }catch(err){msg(err.message,true);}
}
function paintProfiles(){const root=$('profileList');root.replaceChildren();
 for(const p of cache.profiles){const {outer,actions}=recordCard(p.display_name,(p.role==='teacher'?'استاد':'هنرجو')+' · '+p.slug+' · '+p.status);
 action(actions,'ویرایش',()=>editProfile(p));root.append(outer);}if(!cache.profiles.length)root.textContent='هنوز پروفایلی در D1 ثبت نشده است.';}
function readWork(){const f=$('workForm');return {id:read(f,'id')||undefined,profile_id:read(f,'profile_id'),slug:read(f,'slug'),title:read(f,'title'),description:read(f,'description'),media_id:read(f,'media_id')};}
function resetWork(){const f=$('workForm');f.reset();f.elements.namedItem('id').value='';f.elements.namedItem('slug').readOnly=false;}
function editWork(w){activate('works');resetWork();formUpdate($('workForm'),w);$('workForm').elements.namedItem('slug').readOnly=true;window.scrollTo({top:0,behavior:'smooth'});}
function paintWorks(){const root=$('workList');root.replaceChildren();
 for(const w of cache.works){const {outer,actions}=recordCard(w.title,w.status+' · '+w.slug+' · '+(w.rejection_reason||''));
 action(actions,'ویرایش',()=>editWork(w));
 for(const [status,label] of [['published','تأیید و انتشار'],['rejected','رد اثر'],['pending','بازگشت به بررسی'],['archived','آرشیو']]){
  if(status===w.status)continue;
  const run=async()=>{
   let reason='';if(status==='rejected'){const field=outer.querySelector('textarea');reason=(field?.value||'').trim();if(!reason)throw new Error('دلیل ردکردن اثر الزامی است.');}
   if(!window.confirm('وضعیت اثر به «'+label+'» تغییر کند؟'))return;
   await request('admin/works/'+encodeURIComponent(w.id)+'/moderate','POST',{status,rejection_reason:reason});msg('وضعیت اثر ذخیره شد. انتشار HTML در ساخت بعدی سایت انجام می‌شود.');await reload('works');};
  action(actions,label,run,status==='rejected'?'secondary':'secondary');
 }
 if(w.status!=='rejected'){const reason=el('textarea');reason.placeholder='در صورت رد اثر، دلیل را اینجا بنویسید';reason.rows=2;reason.maxLength=500;outer.append(reason);}
 root.append(outer);
 }if(!cache.works.length)root.textContent='هنوز اثری در D1 ثبت نشده است.';
}
function makeBlock(value={type:'paragraph',text:''}){
 const box=el('div','','block'),head=el('div','','block-header'),title=el('strong','بلوک '+(++blockSerial)),del=el('button','حذف','secondary');del.type='button';del.addEventListener('click',()=>box.remove());head.append(title,del);
 const type=el('select');type.className='block-type';
 for(const [key,label] of [['paragraph','پاراگراف'],['heading','تیتر'],['quote','نقل‌قول'],['list','فهرست'],['link','لینک'],['image','تصویر']]){const opt=el('option',label);opt.value=key;type.append(opt);}
 type.value=value.type||'paragraph';box.append(head,type);
 const text=el('textarea');text.placeholder='متن بلوک یا اقلام فهرست (هر مورد یک خط)';text.value=value.type==='list'?(value.items||[]).join('\n'):String(value.text||'');text.className='block-text';
 const aux=el('input');aux.className='block-aux';aux.placeholder='آدرس HTTPS یا شناسه عکس R2';aux.value=String(value.url||value.media_id||'');
 const alt=el('input');alt.className='block-alt';alt.placeholder='توضیح تصویر یا عنوان بلوک';alt.value=String(value.alt||'');
 const ordered=el('label');const boxCheck=el('input');boxCheck.type='checkbox';boxCheck.checked=value.ordered===true;boxCheck.className='block-ordered';ordered.append(boxCheck,document.createTextNode(' فهرست شماره‌دار'));
 const level=el('select');level.className='block-level';for(const n of [2,3]){const opt=el('option','تیتر '+n);opt.value=String(n);level.append(opt);}level.value=String(value.level||2);
 box.append(text,aux,alt,ordered,level);
 function toggle(){const t=type.value;text.hidden=t==='image';aux.hidden=!['image','link'].includes(t);alt.hidden=t!=='image';ordered.hidden=t!=='list';level.hidden=t!=='heading';
  text.placeholder=t==='list'?'هر سطر یک آیتم':t==='link'?'عنوان لینک':'متن این بخش';aux.placeholder=t==='image'?'شناسه تصویر در R2':'https://...';}
 type.addEventListener('change',toggle);toggle();$('articleBlocks').append(box);return box;
}
function getBlocks(){const b=[];
 for(const box of $('articleBlocks').querySelectorAll('.block')){
  const type=box.querySelector('.block-type').value,text=box.querySelector('.block-text').value.trim(),aux=box.querySelector('.block-aux').value.trim();
  let row={type};if(['paragraph','quote','heading'].includes(type))row.text=text;
  if(type==='heading')row.level=Number(box.querySelector('.block-level').value);
  if(type==='list'){row.items=text.split('\n').map(x=>x.trim()).filter(Boolean);row.ordered=box.querySelector('.block-ordered').checked;}
  if(type==='link'){row.text=text;row.url=aux;}
  if(type==='image'){row.media_id=aux;row.alt=box.querySelector('.block-alt').value.trim();row.caption='';}
  b.push(row);
 }
 return b;
}
function readArticle(){const f=$('articleForm');return {id:read(f,'id')||undefined,slug:read(f,'slug'),title:read(f,'title'),excerpt:read(f,'excerpt'),category:read(f,'category'),tags:read(f,'tags').split(/[,،]/).map(x=>x.trim()).filter(Boolean),author:read(f,'author'),seo_title:read(f,'seo_title'),seo_description:read(f,'seo_description'),media_id:read(f,'media_id')||null,status:read(f,'status'),blocks:getBlocks()};}
function resetArticle(){const f=$('articleForm');f.reset();f.elements.namedItem('id').value='';f.elements.namedItem('slug').readOnly=false;$('articleBlocks').replaceChildren();$('articlePreview').hidden=true;makeBlock();}
function editArticle(a){activate('articles');resetArticle();formUpdate($('articleForm'),{...a,tags:safeJSON(a.tags_json,[]).join('، ')});$('articleBlocks').replaceChildren();
 for(const block of safeJSON(a.blocks_json,[]))makeBlock(block);$('articleForm').elements.namedItem('slug').readOnly=true;window.scrollTo({top:0,behavior:'smooth'});}
function previewArticle(){try{
 const a=readArticle(),wrap=$('articlePreview');wrap.replaceChildren();wrap.append(el('h3',a.title),el('small',a.category+' · '+a.author),el('p',a.excerpt));
 const content=el('div','','block-preview');for(const b of a.blocks){
  if(['paragraph','quote','heading'].includes(b.type)){const t=b.type==='paragraph'?'p':b.type==='quote'?'blockquote':'h'+b.level;content.append(el(t,b.text));}
  if(b.type==='list'){const list=el(b.ordered?'ol':'ul');for(const item of b.items)list.append(el('li',item));content.append(list);}
  if(b.type==='link')content.append(el('p',b.text+' — '+b.url));
  if(b.type==='image'){const photo=el('img');photo.src='/v1/private/media/'+encodeURIComponent(b.media_id);photo.alt=b.alt||'تصویر مقاله';photo.className='preview-image';photo.loading='lazy';content.append(photo);}
 }wrap.append(content);wrap.hidden=false;msg('پیش‌نمایش مقاله فقط در مرورگر تهیه شد؛ انتشار انجام نشده است.');
 }catch(err){msg(err.message,true);}
}
function paintArticles(){const root=$('articleList');root.replaceChildren();
 for(const a of cache.articles){const {outer,actions}=recordCard(a.title,a.status+' · '+a.slug+' · '+(a.published_at||''));
 action(actions,'ویرایش / انتشار',()=>editArticle(a));root.append(outer);}
 if(!cache.articles.length)root.textContent='هنوز مقاله‌ای در D1 ساخته نشده است.';
}
function paintActors(){const root=$('actorList');root.replaceChildren();for(const a of cache.actors){const {outer,actions}=recordCard(a.email||a.sub,a.role+' · '+a.status+' · '+a.sub);
 action(actions,'ویرایش مجوز',()=>{activate('actors');formUpdate($('actorForm'),a);});root.append(outer);}if(!cache.actors.length)root.textContent='هنوز هویت اضافه‌ای ثبت نشده است.';}
function paintRequests(){
 const root=$('profileRequestList');root.replaceChildren();
 for(const item of cache['profile-requests']){
  const changes=safeJSON(item.submitted_json,{}),summary=[changes.specialty||'',(changes.bio||'').slice(0,160),
   Array.isArray(changes.skills)?changes.skills.join('، '):''].filter(Boolean).join(' | ');
  const {outer,actions}=recordCard(item.display_name+' · '+item.status,item.slug+' · '+(item.created_at||''));
  outer.append(el('p',summary));
  if(item.reason)outer.append(el('small','نتیجه مدیر: '+item.reason));
  if(item.status==='pending'){
   action(actions,'تأیید و اعمال',async()=>{
     if(!confirm('اطلاعات این درخواست بررسی شد و انتشار بعدی را تأیید می‌کنید؟'))return;
     await request('admin/profile-requests/'+item.id+'/review','POST',{status:'approved'});
     await reload('profile-requests');await reload('profiles');msg('تغییرات تأیید شد؛ برای انتشار HTML از ساخت عمومی استفاده کنید.');
   });
   action(actions,'رد با دلیل',async()=>{
     const reason=prompt('دلیل رد برای اطلاع عضو:');if(reason===null)return;
     if(!reason.trim())throw Error('دلیل رد ضروری است.');
     await request('admin/profile-requests/'+item.id+'/review','POST',{status:'rejected',reason:reason.trim()});
     await reload('profile-requests');msg('درخواست رد شد و دلیل به حساب عضو پیوست.');
   });
  }
  root.append(outer);
 }
 if(!cache['profile-requests'].length)root.textContent='هنوز درخواست ویرایش پروفایل ثبت نشده است.';
}
function paintInvitations(){
 const root=$('inviteList');root.replaceChildren();
 for(const item of cache.invitations){
  const {outer,actions}=recordCard(item.email,item.role+' · '+item.status+' · '+(item.profile_id||'بدون پروفایل'));
  if(item.status==='invited')action(actions,'لغو دعوت',async()=>{
    if(!confirm('دعوت برای این ایمیل لغو شود؟'))return;
    await request('admin/invitations/revoke','POST',{email:item.email});await reload('invitations');msg('دعوت لغو شد.');
  });
  root.append(outer);
 }
 if(!cache.invitations.length)root.textContent='دعوت فعالی وجود ندارد.';
}
function paintAudit(){const root=$('auditList');root.replaceChildren();for(const a of cache.audit){const {outer}=recordCard(a.action+' · '+a.entity_type+' · '+a.entity_id,a.at+' · '+a.actor_sub);root.append(outer);}if(!cache.audit.length)root.textContent='تاریخچه‌ای ثبت نشده است.';}
function paintSummary(){const root=$('summary');root.replaceChildren();
 for(const [label,val] of [['پروفایل‌ها',cache.profiles.length],['آثار',cache.works.length],['مقالات',cache.articles.length],['منتشرشده‌ها',cache.articles.filter(x=>x.status==='published').length+cache.profiles.filter(x=>x.status==='published').length]]){
  const box=el('div','','metric');box.append(el('strong',val),el('span',label));root.append(box);}
}
async function reload(kind){const result=await request('admin/'+kind);cache[kind]=result.items||[];
 ({profiles:paintProfiles,works:paintWorks,articles:paintArticles,actors:paintActors,audit:paintAudit,'profile-requests':paintRequests,invitations:paintInvitations})[kind]?.();paintSummary();}
async function reloadAll(){for(const kind of (actor?.role==='admin'?['profiles','works','articles','profile-requests','actors','invitations','audit']:['profiles','works','articles']))await reload(kind);msg('اطلاعات از D1 بازخوانی شد.');}
async function upload(kind){const chooser=$(kind+'Upload');const file=chooser.files?.[0];if(!file)throw new Error('ابتدا یک تصویر انتخاب کنید.');
 if(file.size<=0||file.size>2097152||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('فایل باید JPG/PNG/WebP و حداکثر ۲ مگابایت باشد.');
 const result=await fetch('/v1/admin/media',{method:'PUT',body:file,headers:{'content-type':file.type},credentials:'same-origin'});
 const body=await result.json();if(!result.ok)throw new Error(body.error||'آپلود ناموفق');
 const form=$(kind+'Form');form.elements.namedItem('media_id').value=body.id;chooser.value='';msg('تصویر در فضای خصوصی R2 ذخیره شد. شناسه آن در فرم قرار گرفت؛ تا تأیید محتوا عمومی نیست.');
}
async function init(){
 try{actor=await request('me');$('identity').textContent='واردشده: '+(actor.email||actor.sub)+' · '+actor.role;
 if(actor.role!=='admin'){$('[data-tab="actors"]').hidden=true;$('[data-tab="audit"]').hidden=true;$('[data-tab="requests"]').hidden=true;$('publishNow').hidden=true;}
 }catch(e){$('identity').textContent='ورود ناموفق';msg('Cloudflare Access هنوز فعال یا برای این حساب مجاز نیست: '+e.message,true);return;}
 for(const btn of document.querySelectorAll('[data-tab]'))btn.addEventListener('click',()=>activate(btn.dataset.tab));
 $('refreshAll').addEventListener('click',()=>reloadAll().catch(err=>msg(err.message,true)));
 $('publishNow').addEventListener('click',async()=>{
   if(!confirm('فقط پس از آماده شدن Cloudflare و بکاپ، درخواست ساخت سایت عمومی در GitHub را ثبت می‌کنید؟'))return;
   const button=$('publishNow');button.disabled=true;
   try{
     const r=await request('admin/publish','POST',{confirm:'REQUEST_REVIEWED_PUBLISH'});
     msg(r.dispatched?'درخواست ساخت پذیرفته شد. نتیجه انتشار را در GitHub Actions بررسی کنید.':'انتشار هنوز غیرفعال است: '+(r.reason||'اتصال کامل نیست'),!r.dispatched);
   }catch(err){msg('درخواست انتشار ناموفق: '+err.message,true);}
   finally{button.disabled=false;}
 });
 fieldsArray('profileStats');fieldsArray('profilePerformance',4,true);
 $('newProfile').addEventListener('click',resetProfile);$('newArticle').addEventListener('click',resetArticle);
 $('previewProfile').addEventListener('click',profilePreview);$('previewArticle').addEventListener('click',previewArticle);
 $('addBlock').addEventListener('click',()=>makeBlock({type:$('blockKind').value}));
 $('profileForm').addEventListener('submit',async e=>{e.preventDefault();try{const saved=await request('admin/profiles','POST',readProfile());msg('پروفایل در D1 ذخیره شد: '+saved.id);await reload('profiles');}catch(err){msg('ذخیره پروفایل: '+err.message,true);}});
 $('workForm').addEventListener('submit',async e=>{e.preventDefault();try{const saved=await request('admin/works','POST',readWork());msg('اثر با وضعیت اولیه در D1 ثبت شد: '+saved.id);await reload('works');}catch(err){msg('ذخیره اثر: '+err.message,true);}});
 $('articleForm').addEventListener('submit',async e=>{e.preventDefault();try{const saved=await request('admin/articles','POST',readArticle());msg('مقاله در D1 ذخیره شد: '+saved.id+'؛ انتشار HTML مستقل در ساخت بعدی سایت انجام می‌شود.');await reload('articles');}catch(err){msg('ذخیره مقاله: '+err.message,true);}});
 $('inviteForm').addEventListener('submit',async e=>{e.preventDefault();try{
   const f=$('inviteForm');const payload={email:read(f,'email'),profile_id:read(f,'profile_id')||null,role:read(f,'role')};
   await request('admin/invitations','POST',payload);f.reset();await reload('invitations');
   msg('دعوت ثبت شد. لینک صفحه /member/ در آدرس Worker آزمایشی را فقط برای صاحب این ایمیل ارسال کنید؛ ورود با Cloudflare Access انجام می‌شود.');
  }catch(err){msg('دعوت: '+err.message,true);}});
 $('actorForm').addEventListener('submit',async e=>{e.preventDefault();try{const f=$('actorForm');await request('admin/actors','POST',{sub:read(f,'sub'),email:read(f,'email'),role:read(f,'role'),status:read(f,'status')});msg('مجوز Access در D1 ذخیره شد؛ ثبت کاربر در Cloudflare Access جداگانه است.');await reload('actors');}catch(err){msg('ذخیره مجوز: '+err.message,true);}});
 for(const button of document.querySelectorAll('.upload-btn'))button.addEventListener('click',async()=>{button.disabled=true;try{await upload(button.dataset.upload);}catch(err){msg('آپلود: '+err.message,true);}finally{button.disabled=false;}});
 resetArticle();await reloadAll();const first=location.hash.replace('#','');activate(['overview','profiles','works','articles','requests','actors','audit'].includes(first)?first:'overview');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
