/* Persistent Supabase votes for public standalone /work/ pages. No login required if guest RPC configured. */
(() => {
  'use strict';
  const root = document.querySelector('[data-vote-key]');
  const api = window.AESHCore;
  if (!root || !api || !api.configured()) return;
  const key = root.getAttribute('data-vote-key');
  const status = root.querySelector('.vote-status');
  const buttons = Array.from(root.querySelectorAll('.vote-btn'));
  const idKey = 'aesh:guest-voter:v323';
  let pending = false;
  function visitorId() {
    try {const saved = localStorage.getItem(idKey);if(saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;}catch(_){}
    let v = '';
    if (crypto.randomUUID) v=crypto.randomUUID();
    else if (crypto.getRandomValues) {
      const a=crypto.getRandomValues(new Uint8Array(16));a[6]=a[6]&15|64;a[8]=a[8]&63|128;
      const n=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');v=n.slice(0,8)+'-'+n.slice(8,12)+'-'+n.slice(12,16)+'-'+n.slice(16,20)+'-'+n.slice(20);
    }
    if (v) try{localStorage.setItem(idKey,v)}catch(_){}
    return v;
  }
  function first(value) {return Array.isArray(value) ? value[0] : value;}
  async function totals() {
    const base = first(await api.rpc('aesh_vote_summary', {p_work_key:key}));
    if (!base) throw Error('آمار رأی دریافت نشد.');
    let guest={likes:0,dislikes:0,my_vote:0}, guestEnabled=false;
    const id=visitorId();
    if(id) try{
      const found=first(await api.rpc('aesh_guest_vote_summary',{p_work_key:key,p_visitor_id:id}));
      if (found) {guest=found;guestEnabled=true;}
    }catch(_){}
    return {likes:Math.max(0,Number(base.likes)||0)+Math.max(0,Number(guest.likes)||0),dislikes:Math.max(0,Number(base.dislikes)||0)+Math.max(0,Number(guest.dislikes)||0),mine:api.authenticated() ? Number(base.my_vote)||0 : Number(guest.my_vote)||0,enabled:api.authenticated()||guestEnabled};
  }
  async function refresh() {
    const t=await totals();
    buttons.forEach(button => {
      const vote=Number(button.dataset.vote);
      button.setAttribute('aria-pressed', String(vote===t.mine));
      const num=button.querySelector('.vote-count');if(num)num.textContent=new Intl.NumberFormat('fa-IR').format(vote===1?t.likes:t.dislikes);
      button.disabled=!t.enabled;
    });
    status.textContent=t.enabled?'':'رأی‌دادن در حال حاضر در دسترس نیست.';
    root.dataset.mine=String(t.mine);
  }
  buttons.forEach(button => button.addEventListener('click',async () => {
    if(pending)return;
    pending=true;buttons.forEach(x=>x.disabled=true);status.textContent='در حال ثبت رأی…';
    const vote=Number(button.dataset.vote), next=Number(root.dataset.mine)===vote ? 0 : vote;
    try{
      if(api.authenticated())await api.rpc('aesh_set_vote',{p_work_key:key,p_vote:next},true);
      else await api.rpc('aesh_guest_set_vote',{p_work_key:key,p_visitor_id:visitorId(),p_vote:next});
      await refresh();
    }catch(error){status.textContent='رأی ثبت نشد. لطفاً دوباره تلاش کنید.';buttons.forEach(x=>x.disabled=false);}
    finally{pending=false;}
  }));
  refresh().catch(() => {status.textContent='آمار رأی در حال حاضر در دسترس نیست.';buttons.forEach(x=>x.disabled=true);});
})();
