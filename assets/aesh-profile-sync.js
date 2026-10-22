/* Restore live member bios/photos to independent pages without downloading root SPA. */
(function(){
 'use strict';const api=window.AESHCore;if(!api||!api.configured())return;
 const path=document.body.dataset.aeshPath||'';
 const inList=path==='/teachers/'||path==='/students/';
 const parts=path.split('/').filter(Boolean);const detail=parts[0]==='teacher'||parts[0]==='student';
 if(!inList&&!detail)return;
 api.rpc('aesh_public_profiles').then(rows=>{if(!Array.isArray(rows))return;
   const role=inList?(path==='/teachers/'?'teacher':'student'):parts[0];
   for(const row of rows){if(row?.role!==role||!row.owner_slug)continue;
     const bio=typeof row.bio==='string'?row.bio:null,photo=api.publicAvatar(row.avatar_path,row.updated_at);
     if(detail){if(decodeURIComponent(parts[1]||'')!==row.owner_slug)continue;
       const el=document.getElementById('profileBio');if(el&&bio!==null)el.textContent=bio;
       if(photo){const cover=document.getElementById('profilePhoto');if(cover){cover.style.setProperty('--profile-bg','url("'+photo.replace(/"/g,'%22')+'")');
         const pic=cover.querySelector('img');if(pic)pic.src=photo;}
         const img=document.querySelector('#profileAvatar img');if(img)img.src=photo;}
     }else{const grid=document.getElementById(role==='teacher'?'teachersGrid':'studentsGrid');if(!grid)continue;
       const card=[...grid.querySelectorAll('.person-card')].find(x=>x.dataset.slug===row.owner_slug);
       if(!card)continue;if(bio!==null){const node=card.querySelector('.person-bio');if(node)node.textContent=bio;}
       if(photo){const img=card.querySelector('.person-media img');if(img)img.src=photo;}
     }
   }
 }).catch(err=>console.warn('AESH profile sync unavailable:',err.message));
})();
