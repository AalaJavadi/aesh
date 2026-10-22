/* AESH5 approved artworks reconciled against server; no delete on fetch failure. */
(function(){
 'use strict';
 const api=window.AESHCore,root=document.getElementById('portfolioGrid');
 if(!root||!api||!api.configured())return;
 let pending=false,latest=0;
 function valid(r){return r&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(r.id||''))&&
   ['teacher','student'].includes(r.owner_role)&&['aesh-member-works','aesh-owner-works'].includes(r.bucket_id)&&
   r.slug&&/^[\w\u0600-\u06ff]+(?:-[\w\u0600-\u06ff]+)*$/u.test(r.slug)&&
   (r.status===undefined||r.status==='published')&&api.publicWorkMedia(r.bucket_id,r.object_path)&&api.publicWorkMedia('aesh-work-thumbs',r.thumb_path);}
 function stamp(r){const card=document.createElement('article');card.className='portfolio-card';card.dataset.aeshCloudId=r.id;return card;}
 function fill(card,r){const src=api.publicWorkMedia('aesh-work-thumbs',r.thumb_path);
   const full=api.publicWorkMedia(r.bucket_id,r.object_path);
   const title=String(r.title||'نمونه‌کار').slice(0,130);
   card.dataset.ownerType=r.owner_role;card.dataset.itemId='cloud-'+r.id;card.dataset.slug=r.slug;
   card.dataset.cloudPending='false';card.replaceChildren();
   const anchor=document.createElement('a');anchor.className='portfolio-card-link';anchor.href='/work/'+encodeURIComponent(r.slug)+'/';anchor.setAttribute('aria-label','مشاهده '+title);
   const media=document.createElement('div');media.className='portfolio-card-media portfolio-loading';media.dataset.src=src;media.dataset.fullSrc=full;media.dataset.alt=title;
   media.dataset.fullWidth=Number(r.full_width||r.width)||0;media.dataset.fullHeight=Number(r.full_height||r.height)||0;
   const body=document.createElement('div');body.className='portfolio-card-body';
   const line=document.createElement('div');line.className='portfolio-card-topline';
   const type=document.createElement('span');type.className='portfolio-card-type';type.textContent=r.owner_role==='teacher'?'اثر استاد':'اثر هنرجو';
   const dim=document.createElement('span');dim.className='portfolio-card-dim';dim.textContent=Number(media.dataset.fullWidth)>0&&Number(media.dataset.fullHeight)>0?media.dataset.fullWidth+'×'+media.dataset.fullHeight:'ابعاد ثبت نشده';line.append(type,dim);
   const t=document.createElement('div');t.className='portfolio-card-title';t.textContent=title;
   const o=document.createElement('div');o.className='portfolio-card-owner';o.textContent=r.owner_name||'';
   const more=document.createElement('div');more.className='portfolio-card-more';more.textContent='مشاهده صفحه اثر ←';
   body.append(line,t,o,more);card.append(anchor,media,body);
 }
 async function refresh(force=false){if(pending||(!force&&Date.now()-latest<60000))return;
   pending=true;
   try{const rows=await api.publicWorks();if(!Array.isArray(rows))throw Error('پاسخ سرور معتبر نبود.');
     const live=rows.filter(valid),ids=new Set(live.map(r=>String(r.id).toLowerCase()));
     // Only a successful server snapshot authorizes removing an archived cloud card.
     for(const card of root.querySelectorAll('.portfolio-card[data-aesh-cloud-id]')){
       const id=card.dataset.aeshCloudId.toLowerCase();if(id&&!ids.has(id))card.remove();
     }
     const existing=new Map([...root.querySelectorAll('.portfolio-card[data-aesh-cloud-id]')].map(c=>[c.dataset.aeshCloudId.toLowerCase(),c]));
     live.sort((a,b)=>Date.parse(b.published_at||b.created_at||0)-Date.parse(a.published_at||a.created_at||0));
     const top=document.createDocumentFragment();
     for(const row of live){let card=existing.get(String(row.id).toLowerCase())||stamp(row);fill(card,row);top.append(card);}
     root.prepend(top);
     latest=Date.now();
     if(window.aeshRedrawPortfolio)window.aeshRedrawPortfolio();
     document.dispatchEvent(new CustomEvent('aesh:cloud-published',{detail:{ids:[...ids]}}));
   }catch(err){console.warn('AESH gallery remains unchanged on server error:',err.message);}
   finally{pending=false;}
 }
 refresh(true);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});window.addEventListener('focus',()=>refresh());
})();
