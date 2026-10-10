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
  function paintCounts(area, counts, key) {
    const likes = Number(counts.likes) || 0, dislikes = Number(counts.dislikes) || 0;
    const mine = Number(counts.my_vote) || 0;
    area.querySelectorAll('.aesh-vote-buttons,.aesh-vote-message').forEach(x => x.remove());
    const buttons = document.createElement('div'); buttons.className = 'aesh-vote-buttons';
    for (const [vote, label, icon, count] of [[1, 'لایک', 'fa-thumbs-up', likes], [-1, 'دیسلایک', 'fa-thumbs-down', dislikes]]) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'aesh-vote-button';
      button.dataset.v = String(vote);
      button.setAttribute('aria-pressed', String(mine === vote));
      button.innerHTML = '<i class="fas ' + icon + '" aria-hidden="true"></i><span>' + fa(count) + ' ' + label + '</span>';
      buttons.appendChild(button);
      button.addEventListener('click', async () => {
        if (!api.authenticated()) {
          window.location.assign(membersUrl);
          return;
        }
        for (const x of buttons.querySelectorAll('button')) x.disabled = true;
        try {
          const next = await api.rpc('aesh_set_vote', { p_work_key: key, p_vote: mine === vote ? 0 : vote }, true);
          if (activeKey !== key) return;
          const result = Array.isArray(next) ? next[0] : next;
          if (!result) throw new Error('پاسخ دیتابیس معتبر نیست.');
          paintCounts(area, result, key);
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
    const hint = document.createElement('p'); hint.className = 'aesh-vote-message';
    if (api.authenticated()) hint.textContent = 'رأی شما در دیتابیس ذخیره می‌شود. برای تغییر یا حذف، دوباره روی همان گزینه بزنید.';
    else {
      hint.textContent = 'برای ثبت رأی، ';
      const link = document.createElement('a');
      link.href = membersUrl; link.textContent = 'با حساب تأییدشده انجمن وارد شوید';
      link.addEventListener('click', event => event.stopPropagation());
      hint.appendChild(link);
      hint.appendChild(document.createTextNode('. مشاهده تعداد رأی‌ها برای همه آزاد است.'));
    }
    area.appendChild(hint);
  }
  async function loadVotes(work) {
    const key = work && work._aesh_key ? String(work._aesh_key) : 'legacy:' + String(work && work.id || '');
    activeKey = key;
    const ownSeq = ++seq;
    const area = renderVoteArea(key);
    if (!area || !api || !api.configured()) return;
    try {
      const rows = await api.rpc('aesh_vote_summary', { p_work_key: key });
      if (key !== activeKey || ownSeq !== seq) return;
      const result = Array.isArray(rows) ? rows[0] : rows;
      if (!result) throw new Error('این اثر هنوز در فهرست رأی‌گیری ثبت نشده است.');
      paintCounts(area, result, key);
    } catch (error) {
      if (key !== activeKey || ownSeq !== seq) return;
      const node = area.querySelector('.aesh-vote-message') || document.createElement('p');
      node.textContent = 'آمار رأی در دسترس نیست: ' + error.message;
      node.className = 'aesh-vote-message aesh-vote-error';
      area.appendChild(node);
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
