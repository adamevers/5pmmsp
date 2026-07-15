// Client enhancements: live clock + countdowns, near-me sort, filters,
// favorites (localStorage), share + report modals, info tooltip, platform-aware
// directions. Privacy: geolocation + distance math stay on this device.
(() => {
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // ---------- Chicago "now" (mirrors src/lib/time.js) ----------
  const chiFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  });
  function chicagoNow() {
    const p = Object.fromEntries(chiFmt.formatToParts(new Date()).map(x => [x.type, x.value]));
    const hour = Number(p.hour) % 24;
    return { dow: DOW.indexOf(p.weekday), minutes: hour * 60 + Number(p.minute) };
  }
  const crosses = h => h.e <= h.s, has = (m, d) => (m & (1 << d)) !== 0, prevDow = d => (d + 6) % 7;
  const isActive = (h, n) => crosses(h)
    ? (has(h.d, n.dow) && n.minutes >= h.s) || (has(h.d, prevDow(n.dow)) && n.minutes < h.e)
    : has(h.d, n.dow) && n.minutes >= h.s && n.minutes < h.e;
  const minutesLeft = (h, n) => !crosses(h) ? h.e - n.minutes
    : (n.minutes >= h.s ? (1440 - n.minutes) + h.e : h.e - n.minutes);
  function nextStart(hh, n) {
    let best = null;
    for (const h of hh) for (let a = 0; a < 7; a++) {
      const d = (n.dow + a) % 7;
      if (!has(h.d, d)) continue;
      const inM = a * 1440 + h.s - n.minutes;
      if (inM <= 0) continue;
      if (!best || inM < best.inMinutes) best = { h, inMinutes: inM };
      break;
    }
    return best;
  }
  const fmtLeft = m => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  const fmtTime = min => {
    const h24 = Math.floor(min / 60) % 24, m = min % 60, h = h24 % 12 || 12, ap = h24 < 12 ? 'AM' : 'PM';
    return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
  };
  const fmtWindow = h => `${fmtTime(h.s)}–${fmtTime(h.e)}`;

  // ---------- live clock + status ----------
  function updateClock(now) {
    const h = Math.floor(now.minutes / 60) % 12 || 12;
    const label = `${DOW[now.dow]} ${h}:${String(now.minutes % 60).padStart(2, '0')} ${now.minutes < 720 ? 'AM' : 'PM'}`;
    document.querySelectorAll('[data-clock]').forEach(el => { el.textContent = label; });
  }
  function updateStatuses(now) {
    document.querySelectorAll('[data-hh]').forEach(card => {
      let hh; try { hh = JSON.parse(card.dataset.hh); } catch { return; }
      const el = card.querySelector('[data-status]');
      if (!el) return;
      const active = hh.find(h => isActive(h, now));
      if (active) {
        card.classList.add('active'); el.className = 'now';
        el.textContent = `ends in ${fmtLeft(minutesLeft(active, now))}`;
      } else {
        card.classList.remove('active'); el.className = 'next';
        const nx = nextStart(hh, now);
        el.textContent = !nx ? ''
          : nx.inMinutes < 1440 ? `next: in ${fmtLeft(nx.inMinutes)}`
          : `next: ${DOW[(now.dow + Math.floor(nx.inMinutes / 1440)) % 7]} ${fmtWindow(nx.h)}`;
      }
    });
  }
  let lastMin = -1;
  const tick = () => {
    const now = chicagoNow();
    updateClock(now);
    if (now.minutes !== lastMin) { updateStatuses(now); lastMin = now.minutes; }
  };
  tick(); setInterval(tick, 1000);

  // ---------- favorites (localStorage) ----------
  const FAV_KEY = '5pm:favs';
  const readFavs = () => { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch { return new Set(); } };
  let favs = readFavs();
  const writeFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch {} };
  function paintFavs() {
    document.querySelectorAll('[data-fav]').forEach(b => {
      const on = favs.has(b.dataset.fav);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('on', on);
    });
  }
  paintFavs();
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();       // don't trigger the card link
    const slug = b.dataset.fav;
    if (favs.has(slug)) favs.delete(slug); else favs.add(slug);
    writeFavs(); paintFavs();
    if (document.querySelector('[data-f="saved"][aria-pressed="true"]')) applyFilters();
  });

  // ---------- near me ----------
  const container = document.querySelector('[data-cards]');
  const cards = () => container ? [...container.querySelectorAll('.card')] : [];
  const btn = document.querySelector('[data-nearme]');
  const fallback = document.querySelector('[data-nearme-fallback]');
  if (container && btn && 'geolocation' in navigator) {
    btn.hidden = false;
    if (fallback) fallback.classList.replace('primary', 'ghost');
    btn.addEventListener('click', () => {
      btn.textContent = '◉ locating…';
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const R = 3958.8, rad = d => d * Math.PI / 180;
        const dist = (la, lo) => {
          const dLa = rad(la - lat), dLo = rad(lo - lng);
          const a = Math.sin(dLa / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(la)) * Math.sin(dLo / 2) ** 2;
          return 2 * R * Math.asin(Math.sqrt(a));
        };
        cards().map(c => ({ c, d: dist(+c.dataset.lat, +c.dataset.lng) }))
          .sort((a, b) => a.d - b.d)
          .forEach(({ c, d }) => {
            const el = c.querySelector('[data-dist]');
            if (el) { el.hidden = false; el.textContent = `${d < 10 ? d.toFixed(1) : Math.round(d)} mi`; }
            container.appendChild(c);
          });
        btn.textContent = '◉ sorted by distance'; btn.disabled = true;
      }, () => {
        btn.textContent = '◉ location unavailable'; btn.disabled = true;
      }, { maximumAge: 300000, timeout: 8000 });
    });
  }

  // ---------- filters ----------
  const filters = document.querySelector('[data-filters]');
  let meta = {}; // slug -> bar
  // Are any windows (from a card's data-hh / data-hours JSON) active right now?
  const windowsActive = json => {
    let w; try { w = JSON.parse(json || '[]'); } catch { return false; }
    const n = chicagoNow();
    return w.some(h => isActive(h, n));
  };
  function applyFilters() {
    if (!filters || !container) return;
    const active = [...filters.querySelectorAll('[aria-pressed="true"]')];
    const groups = {};
    for (const b of active) (groups[b.dataset.f] ||= []).push(b.dataset.v);
    cards().forEach(c => {
      const m = meta[c.dataset.slug];
      let show = true;
      for (const [f, vals] of Object.entries(groups)) {
        if (f === 'saved') { if (!favs.has(c.dataset.slug)) show = false; }
        else if (f === 'happyhournow') { if (!windowsActive(c.dataset.hh)) show = false; }
        else if (f === 'opennow') { if (!windowsActive(c.dataset.hours)) show = false; }
        else if (vals[0] === undefined) { if (!m || !m[f]) show = false; }      // boolean flag
        else if (!m || !vals.includes(String(m[f]))) show = false;              // value match
      }
      c.hidden = !show;
    });
  }
  // "Filters ▾" reveals/hides the panel; the pills themselves toggle + apply.
  const filtersBtn = document.querySelector('[data-filters-toggle]');
  if (filtersBtn && filters) {
    filtersBtn.hidden = false;
    filtersBtn.addEventListener('click', () => {
      const open = filtersBtn.getAttribute('aria-expanded') === 'true';
      filtersBtn.setAttribute('aria-expanded', String(!open));
      filters.hidden = open;
    });
  }
  if (filters && container) {
    filters.addEventListener('click', e => {
      const b = e.target.closest('button[data-f]');
      if (!b) return;
      const turningOn = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(turningOn));
      applyFilters();
      if (turningOn) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    fetch('/api/bars.json').then(r => r.json())
      .then(({ bars }) => { meta = Object.fromEntries(bars.map(b => [b.slug, b])); })
      .catch(() => {});
  }

  // ---------- info tooltip (last-verified ⓘ) — floats above everything ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-info]');
    if (!b) { document.querySelectorAll('.info-pop.show').forEach(p => p.classList.remove('show')); return; }
    e.preventDefault(); e.stopPropagation();
    let pop = b.querySelector('.info-pop');
    if (!pop) {
      pop = document.createElement('span');
      pop.className = 'info-pop';
      pop.textContent = b.dataset.info;
      b.appendChild(pop);
    }
    pop.classList.toggle('show');
  });

  // ---------- bar roulette: spin, land on a winner, confetti, go ----------
  function confetti() {
    const wrap = document.createElement('div');
    wrap.className = 'confetti';
    const colors = ['#FFB84D', '#C8322B', '#2E6B4F', '#F4E9D8'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.3 + 's';
      p.style.animationDuration = 0.9 + Math.random() * 0.8 + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
  }
  const roulette = document.querySelector('[data-roulette]');
  if (roulette) roulette.addEventListener('click', () => {
    // on phones the button starts as just the dice — first tap expands it
    if (roulette.classList.contains('mini')) { roulette.classList.remove('mini'); return; }
    if (roulette.disabled) return;
    const pool = cards().filter(c => !c.hidden && windowsActive(c.dataset.hh));
    const any = cards().filter(c => !c.hidden);
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    const from = pool.length ? pool : any;
    if (!from.length) return;
    const chosen = pick(from);
    const name = chosen.querySelector('h3').textContent.trim();
    roulette.disabled = true;
    let spins = 0;
    const iv = setInterval(() => {
      roulette.textContent = `🎲 ${pick(from).querySelector('h3').textContent.trim()}`;
      if (++spins >= 12) {
        clearInterval(iv);
        roulette.textContent = `🍻 ${name}!`;           // land on the winner…
        roulette.classList.add('winner');
        confetti();                                       // …celebrate…
        setTimeout(() => { window.location.href = `/bar/${chosen.dataset.slug}`; }, 1600);
      }
    }, 90);
  });
  // start collapsed (dice only) on phones
  if (roulette && window.matchMedia('(max-width: 559px)').matches) roulette.classList.add('mini');

  // ---------- modals (share + report) ----------
  function wireModal(openSel, id, closeSel) {
    const dlg = document.getElementById(id);
    if (!dlg) return;
    document.querySelectorAll(openSel).forEach(o => o.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); dlg.showModal(); }));
    dlg.querySelector(closeSel)?.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }
  wireModal('[data-open-report]', 'report-dialog', '[data-close-report]');
  wireModal('[data-open-share]', 'share-dialog', '[data-close-share]');

  const copyBtn = document.querySelector('[data-copy-share]');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const text = document.getElementById('share-text')?.value || '';
    if (navigator.share) { try { await navigator.share({ text }); return; } catch {} }
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.getElementById('share-text'); t.select(); document.execCommand('copy'); }
    copyBtn.textContent = 'Copied ✓';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1800);
  });

  // ---------- collapsible hours toggle (bar detail page) ----------
  document.querySelectorAll('[data-hh-toggle]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      const target = document.getElementById(toggle.getAttribute('aria-controls'));
      if (target) target.hidden = expanded;
    });
  });

  // ---------- platform-aware directions (iOS → Apple Maps) ----------
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) document.querySelectorAll('a.dir[data-lat]').forEach(a => {
    a.href = `https://maps.apple.com/?q=${a.dataset.q}&ll=${a.dataset.lat},${a.dataset.lng}`;
  });

  // ---------- PWA ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
