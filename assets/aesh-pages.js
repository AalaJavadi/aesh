/* AESH independent public pages: navigation, local filters, optional public-only updates. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const menu = $('#siteNav');
  const toggle = $('#menuToggle');
  if (menu && toggle) {
    toggle.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'بستن منو' : 'باز کردن منو');
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') {menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false');} });
    document.addEventListener('click', e => { if (!menu.contains(e.target) && !toggle.contains(e.target)) {menu.classList.remove('open');toggle.setAttribute('aria-expanded','false');} });
  }
  // Classic editor is kept independent so the public pages never download editor data.
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e' && !e.repeat) {
      e.preventDefault(); window.location.assign('/studio/?edit=1');
    }
  });
  const search = $('#listSearch'), filters = $$('.filter-btn'), list = $('#listingGrid');
  if (list) {
    const apply = () => {
      const query = String(search?.value || '').trim().toLocaleLowerCase('fa');
      const active = filters.find(x => x.getAttribute('aria-pressed') === 'true')?.dataset.filter || 'all';
      let visible = 0;
      $$('.listing-item',list).forEach(card => {
        const type = card.dataset.type || '';
        const match = (!query || (card.dataset.search || '').toLocaleLowerCase('fa').includes(query)) && (active === 'all' || type === active);
        card.hidden = !match;
        if (match) visible++;
      });
      const count = $('#visibleCount'); if (count) count.textContent = new Intl.NumberFormat('fa-IR').format(visible) + ' مورد';
      const empty = $('#noMatches'); if (empty) empty.hidden = visible > 0;
    };
    search?.addEventListener('input', apply);
    filters.forEach(button => button.addEventListener('click', () => {
      filters.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
      apply();
    }));
    apply();
  }
  const api = window.AESHCore;
  if (!api || !api.configured()) return;
  const role = document.body.dataset.role, slug = document.body.dataset.slug;
  const grid = $('#listingGrid');
  if (role === 'teacher' || role === 'student' || document.body.dataset.page === 'teachers' || document.body.dataset.page === 'students') {
    api.rpc('aesh_public_profiles').then(rows => {
      if (!Array.isArray(rows)) return;
      const pageRole = role || (document.body.dataset.page === 'teachers' ? 'teacher' : 'student');
      for (const row of rows) {
        if (row?.role !== pageRole || typeof row.owner_slug !== 'string') continue;
        if (slug && slug !== row.owner_slug) continue;
        const targets = slug ? [document.body] : $$('[data-person-slug]',grid).filter(x => x.dataset.personSlug === row.owner_slug);
        targets.forEach(target => {
          if (typeof row.bio === 'string') {
            const el = $('[data-profile-bio]',target);
            if (el) el.textContent = row.bio;
          }
          const newSrc = api.publicAvatar(row.avatar_path, row.updated_at);
          if (newSrc) {
            const el = $('[data-person-image]',target);
            if (el) { el.src = newSrc; el.alt = 'تصویر پروفایل ' + (el.dataset.personName || 'عضو انجمن'); }
          }
        });
      }
    }).catch(() => { /* Static HTML remains readable and valid on network failure. */ });
  }
  if (document.body.dataset.page === 'portfolio' && grid) {
    api.publicWorks().then(rows => {
      if (!Array.isArray(rows)) return;
      const known = new Set($$('.listing-item',grid).map(el => el.dataset.workSlug));
      const entries = rows.filter(row => row && ['teacher','student'].includes(row.owner_role) && row.slug && row.id && !known.has(row.slug));
      entries.forEach(row => {
        if (!/^[\w\u0600-\u06ff]+(?:-[\w\u0600-\u06ff]+)*$/u.test(row.slug)) return;
        const src = api.publicWorkMedia('aesh-work-thumbs',row.thumb_path);
        const img = api.publicWorkMedia(row.bucket_id,row.object_path);
        if (!src || !img) return;
        const card = document.createElement('a'); card.className = 'work-card panel listing-item'; card.href = '/work/' + encodeURIComponent(row.slug) + '/'; card.dataset.type = row.owner_role;
        card.dataset.workSlug = row.slug; card.dataset.search = String(row.title || '') + ' ' + String(row.owner_name || '');
        const photo = document.createElement('div'); photo.className = 'work-photo';
        const image = document.createElement('img'); image.src = src; image.alt = 'نمونه‌کار ' + String(row.title || 'اثر هنری'); image.loading = 'lazy'; image.decoding = 'async'; photo.appendChild(image);
        const content = document.createElement('div'); content.className = 'work-card-body';
        const h = document.createElement('h2'); h.textContent = String(row.title || 'نمونه‌کار');
        const p = document.createElement('p'); p.className = 'work-meta'; p.textContent = String(row.owner_name || 'عضو انجمن');
        const cta = document.createElement('div'); cta.className = 'card-bottom'; cta.appendChild(Object.assign(document.createElement('span'), {textContent:'مشاهده صفحه اثر ←'}));
        content.append(h,p,cta); card.append(photo,content);grid.appendChild(card);known.add(row.slug);
      });
      search?.dispatchEvent(new Event('input'));
    }).catch(() => {
      const el = $('#onlineStatus');if (el) el.textContent = 'آثار آنلاین فعلاً در دسترس نیستند؛ آثار منتشرشده در سایت همچنان قابل مشاهده‌اند.';
    });
  }
})();
