/* AESH v3.20 public enhancements: live bio/avatar display and server-stored votes.
   Never alters existing stats, scores, roles, names, experience, or portfolio images. */
(function () {
  'use strict';
  const api = window.AESHCore;
  const edits = new Map();
  const keyFor = (role, slug) => String(role) + '\u0000' + String(slug);
  const base = (window.__AESH_BASE_PATH__ || '') + '/';
  const membersUrl = base + 'members/';
  const fa = n => Math.max(0, Number(n) || 0).toLocaleString('fa-IR');
  let activeKey = '';
  let seq = 0;
  let changed = false;
  let updatedAt = 0;
  function profileEdit(item, role) {
    if (!item) return null;
    return edits.get(keyFor(role, item.slug)) || null;
  }
  function applyCardEdits() {
    for (const [role, grid] of [['teacher', 'teachersGrid'], ['student', 'studentsGrid']]) {
      const root = document.getElementById(grid);
      if (!root) continue;
      for (const card of root.querySelectorAll('.person-card')) {
        const update = edits.get(keyFor(role, card.dataset.slug));
        if (!update) continue;
        if (update.bio !== null && update.bio !== undefined) {
          const bio = card.querySelector('.person-bio');
          if (bio) bio.textContent = update.bio;
        }
        if (update.image) {
          const slot = card.querySelector('.person-media');
          if (slot) {
            let img = slot.querySelector('img');
            if (!img) {
              img = document.createElement('img');
              img.loading = 'lazy'; img.decoding = 'async';
              img.alt = 'عکس پروفایل عضو';
              const placeholder = slot.querySelector('i.fa-user-tie,i.fa-user-graduate');
              if (placeholder) placeholder.remove();
              slot.appendChild(img);
            }
            if (img.getAttribute('src') !== update.image) img.src = update.image;
          }
        }
      }
    }
  }
  async function loadEdits(force = false) {
    if (!api || !api.configured() || (!force && Date.now() - updatedAt < 60000)) return;
    updatedAt = Date.now();
    try {
      const rows = await api.rpc('aesh_public_profiles');
      if (!Array.isArray(rows)) return;
      edits.clear();
      for (const x of rows) {
        if (!['teacher', 'student'].includes(x.role) || typeof x.owner_slug !== 'string') continue;
        edits.set(keyFor(x.role, x.owner_slug), {
          bio: x.bio,
          image: api.publicAvatar(x.avatar_path, x.updated_at)
        });
      }
      changed = true;
      applyCardEdits();
    } catch (error) { console.warn('AESH profiles: cached page is shown', error.message); }
  }
  function memberLink() {
    const actions = document.querySelector('.header-in .actions');
    if (!actions || document.getElementById('aeshMemberLogin')) return;
    const a = document.createElement('a');
    a.id = 'aeshMemberLogin'; a.className = 'aesh-member-link';
    a.href = membersUrl;
    a.setAttribute('data-noedit', '');
    a.innerHTML = '<i class="fas fa-user-shield" aria-hidden="true"></i><span>پنل اعضا</span>';
    a.addEventListener('click', e => { e.stopPropagation(); }); // do not SPA-intercept a real standalone page
    actions.insertBefore(a, actions.firstChild);
  }
  function renderVoteArea(key) {
    let host = document.getElementById('portfolioDetailActions');
    if (!host) return null;
    let area = host.querySelector('#aeshVoteBlock');
    if (!area) {
      area = document.createElement('section');
      area.id = 'aeshVoteBlock'; area.className = 'aesh-vote-block';
      area.setAttribute('aria-label', 'لایک و دیسلایک نمونه‌کار');
      host.appendChild(area);
    }
    area.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = 'نظرت درباره این نمونه‌کار چیه؟';
    area.appendChild(heading);
    if (!api || !api.configured()) {
      const hint = document.createElement('p'); hint.className = 'aesh-vote-message';
      hint.textContent = 'لایک و دیسلایک پس از اتصال دیتابیس فعال می‌شوند؛ هیچ شمارش ساختگی نمایش داده نمی‌شود.';
      area.appendChild(hint);
      return area;
    }
    const status = document.createElement('p'); status.className = 'aesh-vote-message';
    status.textContent = 'در حال دریافت تعداد رأی‌ها…'; area.appendChild(status);
    return area;
  }
  // Guest identity survives browser restarts. It is pseudonymous, not a verified user account.
  const guestStorageKey = 'aesh:guest-voter:v323';
  let fallbackGuestId = '';
  function guestId() {
    try {
      const saved = localStorage.getItem(guestStorageKey);
      if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    } catch (_) { /* privacy modes can disable storage */ }
    if (!fallbackGuestId) {
      if (!window.crypto || !crypto.getRandomValues) return '';
      if (crypto.randomUUID) fallbackGuestId = crypto.randomUUID();
      else {
        const a = crypto.getRandomValues(new Uint8Array(16));
        a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;
        const n=Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');
        fallbackGuestId=n.slice(0,8)+'-'+n.slice(8,12)+'-'+n.slice(12,16)+'-'+n.slice(16,20)+'-'+n.slice(20);
      }
    }
    try { localStorage.setItem(guestStorageKey, fallbackGuestId); } catch (_) {}
    return fallbackGuestId;
  }
  async function combinedVotes(key) {
    const rows = await api.rpc('aesh_vote_summary', { p_work_key: key });
    const baseResult = Array.isArray(rows) ? rows[0] : rows;
    if (!baseResult) throw new Error('اطلاعات رأی این اثر در دسترس نیست.');
    let guest = { likes:0, dislikes:0, my_vote:0 }, guestEnabled = false;
    const visitorId = guestId();
    if (visitorId) {
      try {
        const guestRows = await api.rpc('aesh_guest_vote_summary', { p_work_key:key, p_visitor_id:visitorId });
        const found = Array.isArray(guestRows) ? guestRows[0] : guestRows;
        if (found) { guest=found; guestEnabled=true; }
      } catch (error) { console.warn('Guest voting needs setup:', error.message); }
    }
    return {
      likes: Math.max(0,Number(baseResult.likes)||0) + Math.max(0,Number(guest.likes)||0),
      dislikes: Math.max(0,Number(baseResult.dislikes)||0) + Math.max(0,Number(guest.dislikes)||0),
      my_vote: api.authenticated() ? Number(baseResult.my_vote)||0 : Number(guest.my_vote)||0,
      guestEnabled
    };
  }
  function paintCounts(area, counts, key, work) {
    const likes = Number(counts.likes) || 0, dislikes = Number(counts.dislikes) || 0;
    const mine = Number(counts.my_vote) || 0;
    const allowed = api.authenticated() || counts.guestEnabled;
    area.querySelectorAll('.aesh-vote-buttons,.aesh-vote-message').forEach(x => x.remove());
    const buttons = document.createElement('div'); buttons.className = 'aesh-vote-buttons';
    for (const [vote, label, icon, count] of [[1, 'لایک', 'fa-thumbs-up', likes], [-1, 'دیسلایک', 'fa-thumbs-down', dislikes]]) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'aesh-vote-button';
      button.dataset.v = String(vote);
      button.setAttribute('aria-pressed', String(mine === vote));
      button.disabled = !allowed;
      button.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i><span>' + fa(count) + ' ' + label + '</span>';
      buttons.appendChild(button);
      button.addEventListener('click', async () => {
        if (!allowed) return;
        for (const x of buttons.querySelectorAll('button')) x.disabled = true;
        try {
          const nextVote = mine === vote ? 0 : vote;
          if (api.authenticated()) {
            await api.rpc('aesh_set_vote', { p_work_key:key, p_vote:nextVote }, true);
          } else {
            await api.rpc('aesh_guest_set_vote', {
              p_work_key:key, p_visitor_id:guestId(), p_vote:nextVote
            });
          }
          if (activeKey !== key) return;
          await loadVotes(work);
        } catch (error) {
          if (activeKey !== key) return;
          for (const x of buttons.querySelectorAll('button')) x.disabled = false;
          const message = area.querySelector('.aesh-vote-error') || document.createElement('p');
          message.className = 'aesh-vote-message aesh-vote-error';
          message.textContent = 'رأی ثبت نشد: ' + error.message;
          area.appendChild(message);
        }
      });
    }
    area.appendChild(buttons);
    // Keep the vote area clean for normal use; show setup guidance only when voting is unavailable.
    if (!allowed) {
      const hint = document.createElement('p'); hint.className = 'aesh-vote-message';
      hint.textContent = 'رأی مهمان هنوز در پایگاه داده فعال نشده است؛ مدیر باید فایل SQL نسخه جدید را در Supabase اجرا کند.';
      area.appendChild(hint);
    }
  }
  async function loadVotes(work) {
    const key = work && work._aesh_key ? String(work._aesh_key) : 'legacy:' + String(work && work.id || '');
    activeKey = key;
    const ownSeq = ++seq;
    const area = renderVoteArea(key);
    if (!area || !api || !api.configured()) return;
    try {
      const result = await combinedVotes(key);
      if (key !== activeKey || ownSeq !== seq) return;
      paintCounts(area, result, key, work);
    } catch (error) {
      if (key !== activeKey || ownSeq !== seq) return;
      area.replaceChildren();
      const message = document.createElement('p');
      message.textContent = 'آمار رأی در دسترس نیست: ' + error.message;
      message.className = 'aesh-vote-message aesh-vote-error';
      area.appendChild(message);
    }
  }
  function init() {
    memberLink();
    if (typeof window.openProfile === 'function') {
      const prev = window.openProfile;
      window.openProfile = function (person, role) {
        const o = profileEdit(person, role);
        // Strictly allow only image and bio overrides, never stats/chart/experience/role.
        return prev.call(this, o ? { ...person, ...(o.bio === null ? {} : { bio: o.bio }), ...(o.image ? { image: o.image } : {}) } : person, role);
      };
    }
    if (typeof window.renderPeople === 'function') {
      const prev = window.renderPeople;
      window.renderPeople = function (...args) {
        const result = prev.apply(this, args);
        if (changed) applyCardEdits();
        return result;
      };
    }
    if (typeof window.openPortfolioDetail === 'function') {
      const prev = window.openPortfolioDetail;
      window.openPortfolioDetail = function (item) {
        const result = prev.call(this, item);
        loadVotes(item);
        return result;
      };
    }
    if (typeof window.closePortfolioDetail === 'function') {
      const prev = window.closePortfolioDetail;
      window.closePortfolioDetail = function (...args) {
        activeKey = ''; seq++;
        return prev.apply(this, args);
      };
    }
    loadEdits(true);
    window.addEventListener('focus', () => loadEdits(false));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
