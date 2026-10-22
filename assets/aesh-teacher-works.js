/* AESH 5 latest 8 actual published works of the SAME teacher, never hand-picked. */
(function(){
 'use strict';
 const api=window.AESHCore,root=document.getElementById('aeshTeacherRecentGrid'),data=document.getElementById('aeshTeacherStaticWorks');
 if(!root||!data)return;
 const slug=decodeURIComponent((document.body.dataset.aeshPath||'').split('/')[2]||'');
 let staticWorks=[];try{staticWorks=JSON.parse(data.textContent||'[]');}catch(e){}
 let current=staticWorks,loading=false,last=0;
 function render(rows){root.replaceChildren();
   for(const r of rows.slice(0,8)){
     const title=String(r.title||'نمونه‌کار');const card=document.createElement('article');card.className='portfolio-card';
     const a=document.createElement('a');a.className='portfolio-card-link';a.href='/work/'+encodeURIComponent(r.slug)+'/';a.setAttribute('aria-label','مشاهده '+title);
     const media=document.createElement('div');media.className='portfolio-card-media';
     if(r.image){const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.src=r.image;img.alt=title;
       // Keep the recent-work cards identical to the healthy portfolio backdrop.
       img.addEventListener('load',()=>media.style.setProperty('--portfolio-bg','url('+JSON.stringify(img.currentSrc||img.src)+')'),{once:true});media.append(img);}
     const body=document.createElement('div');body.className='portfolio-card-body';const name=document.createElement('div');name.className='portfolio-card-title';name.textContent=title;
     const sizes=document.createElement('span');sizes.className='portfolio-card-dim';sizes.textContent=(Number(r.width)>0&&Number(r.height)>0)?r.width+'×'+r.height:'';
     body.append(name,sizes);card.append(a,media,body);root.append(card);
   }
   const empty=document.getElementById('aeshTeacherWorksEmpty');if(empty)empty.hidden=!!rows.length;
 }
 async function refresh(){if(!api||!api.configured()||loading||Date.now()-last<50000)return;loading=true;
   try{const rows=await api.publicWorks();if(!Array.isArray(rows))throw Error('response');
     const cloud=rows.filter(r=>r.owner_role==='teacher'&&r.owner_slug===slug&&r.slug&&r.id&&
       (r.status===undefined||r.status==='published')).map(r=>({id:'cloud:'+r.id,title:r.title,slug:r.slug,
       image:api.publicWorkMedia('aesh-work-thumbs',r.thumb_path),width:r.full_width||r.width,height:r.full_height||r.height,
       created_at:r.published_at||r.created_at||''})).filter(x=>x.image);
     cloud.sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0));
     // Dated archived works are preferred over undated; preserve source order otherwise.
     current=[...cloud,...staticWorks.filter(x=>!cloud.some(y=>y.id===x.id))].slice(0,8);
     render(current);last=Date.now();
   }catch(err){console.warn('Teacher work sync unavailable; keeping static works:',err.message);}
   finally{loading=false;}
 }
 render(current);refresh();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
