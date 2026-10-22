/* Revalidate the portfolio count against approved cloud works (read only). */
(function(){
 'use strict';const api=window.AESHCore;if(!api||!api.configured())return;
 const card=[...document.querySelectorAll('#statsGrid .stat-box')].find(x=>/نمونه.?کار|اثر/.test(x.textContent||''));
 if(!card)return;const number=card.querySelector('.stat-num');if(!number)return;
 const n=Number(document.body.dataset.aeshStaticWorkCount)||0;
 api.publicWorks().then(rows=>{if(!Array.isArray(rows))return;
   const unique=new Set(rows.filter(w=>w&&w.id&&['teacher','student'].includes(w.owner_role)&&(w.status===undefined||w.status==='published')).map(w=>w.id));
   const total=n+unique.size;number.dataset.counter=String(total);number.textContent=total.toLocaleString('fa-IR');
 }).catch(()=>{});
})();
