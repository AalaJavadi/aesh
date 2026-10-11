/* AESH v3.21 public portfolio connector.
  All published online works and the original 30 works share ONE data.portfolio collection.
  Homepage + portfolio counters use that exact collection, not separate hardcoded values. */
(function () {
  'use strict';
  const api = window.AESHCore;
  let staticWorks = null;
  let updatedAt = 0;
  let loading = false;
  const fa = n => String(n).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
  function total() { return Array.isArray(window.data && window.data.portfolio) ? window.data.portfolio.length : 0; }
  function syncCount() {
    if (!window.data || !Array.isArray(data.portfolio)) return;
    const count = total();
    const stat = (data.stats || []).find(x => /اثر|نمونه.?کار/.test(x.label||'') && /ادیت|اثر/.test(x.label||'')) ||
                 (data.stats || []).find(x => /fa-images/.test(x.icon||''));
    if (stat) {
      stat.value = String(count);
      const box = Array.from(document.querySelectorAll('#statsGrid .stat-box')).find(x => x.dataset.itemId === String(stat.id));
      const label = box && box.querySelector('.stat-num');
      if (label) {
        if (label._counter) clearInterval(label._counter);
        label.setAttribute('data-counter', String(count));
        label.textContent = fa(count);
      }
    }
    // Filter-specific gallery count is maintained by renderPortfolio itself.
    const gridCount = document.getElementById('portfolioCount');
    if (gridCount && window.portfolioFilter === 'all') gridCount.textContent = fa(count) + ' اثر';
  }
  function stampCloudCards() {
    // The inline renderer handles slugless entries without exposing a generated URL.
    const cards = document.querySelectorAll('#portfolioGrid .portfolio-card[data-item-id]');
    for (const card of cards) {
      const work = (data.portfolio||[]).find(x => String(x.id) === card.dataset.itemId);
      if (work && work._aesh_cloud && !work.slug) card.classList.add('aesh-no-work-slug');
    }
  }
  function convert(row) {
    if (!row || !row.id || !['teacher','student'].includes(row.owner_role)) return null;
    if (!['aesh-member-works','aesh-owner-works'].includes(row.bucket_id)) return null;
    const image = api.publicWorkMedia(row.bucket_id, row.object_path);
    const thumb = api.publicWorkMedia('aesh-work-thumbs',row.thumb_path);
    if (!image || !thumb) return null;
    return {
      id:'cloud-' + row.id, _aesh_cloud:true, _aesh_key:'cloud:' + row.id,
      slug:row.slug || '', title:String(row.title||'نمونه‌کار').slice(0,130),
      desc:String(row.description||'').slice(0,1400),
      ownerType:row.owner_role, ownerSlug:String(row.owner_slug||''),
      ownerName:String(row.owner_name||''),image,thumb,
      fullWidth:Number(row.full_width||row.width)||0, fullHeight:Number(row.full_height||row.height)||0
    };
  }
  function showError(message) {
    const count = document.getElementById('portfolioCount');
    if (!count) return;
    let p=document.getElementById('aeshOnlineStatus');
    if (!p) {p=document.createElement('p');p.id='aeshOnlineStatus';p.className='aesh-online-status';count.parentElement.append(p);}
    p.textContent=message;
  }
  async function refresh(force=false) {
    if (!api || !api.configured() || loading || (!force && Date.now()-updatedAt<45000)) return;
    loading=true;
    if (!staticWorks && window.data && Array.isArray(data.portfolio)) {
      staticWorks = data.portfolio.filter(x=>!x._aesh_cloud);
    }
    try {
      const rows=await api.publicWorks();
      if (!Array.isArray(rows)) throw new Error('پاسخ فهرست آثار معتبر نیست.');
      const dynamic=rows.map(convert).filter(Boolean);
      if (window.data && staticWorks) {
        data.portfolio = dynamic.concat(staticWorks);
        window.renderPortfolio();
        syncCount();
        // Direct URLs for owner-assigned slugs are resolved after async DB fetch.
        if (typeof window.parseCurrentRoute === 'function' && parseCurrentRoute().kind === 'work'
            && typeof window.handleRouteNavigation === 'function') window.handleRouteNavigation();
      }
      const status=document.getElementById('aeshOnlineStatus');if(status)status.remove();
      updatedAt=Date.now();
    } catch (err) {
      console.warn('AESH public works unavailable:',err.message);
      showError('آثار آنلاین فعلاً در دسترس نیستند؛ آثار موجود سایت نمایش داده می‌شوند.');
    } finally {loading=false;}
  }
  function init() {
    if (!window.data || !Array.isArray(data.portfolio)) return;
    staticWorks = data.portfolio.filter(x=>!x._aesh_cloud);
    // Update on every gallery render/filter and when the browser refreshes content.
    if (typeof window.renderPortfolio === 'function') {
      const previous=window.renderPortfolio;
      window.renderPortfolio=function (...args) {
        const result=previous.apply(this,args);
        syncCount();stampCloudCards();return result;
      };
    }
    if (typeof window.openPortfolioDetail === 'function') {
      const previous=window.openPortfolioDetail;
      window.openPortfolioDetail=function(work) {
        const result=previous.apply(this,arguments);
        const link=document.getElementById('portfolioCopyLink');
        if (link) { const noSlug=!!(work && work._aesh_cloud && !work.slug); link.hidden=noSlug; link.style.display=noSlug?'none':''; link.setAttribute('aria-hidden',String(noSlug)); }
        return result;
      };
    }
    syncCount();
    refresh(true);
    window.addEventListener('focus',()=>refresh(false));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(false);});
  }
  if (window.__AESH_SITE_READY__) init();
  else document.addEventListener('aesh:site-ready',init,{once:true});
})();
