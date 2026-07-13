// Client enhancements: live clock + countdowns, near-me sort, filters, report modal.
// Privacy contract: geolocation + distance math stay on this device.
(() => {
  const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // --- Chicago "now" (mirrors src/lib/time.js) ---
  const chiFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false,
  });
  function chicagoNow() {
    const p = Object.fromEntries(chiFmt.formatToParts(new Date()).map(x => [x.type, x.value]));
    const hour = Number(p.hour) % 24;
    return { dow: DOW.indexOf(p.weekday), minutes: hour * 60 + Number(p.minute), seconds: Number(p.second) };
  }
  const crosses = h => h.e <= h.s;
  const has = (mask, d) => (mask & (1 << d)) !== 0;
  const prevDow = d => (d + 6) % 7;
  function isActive(h, now) {
    if (crosses(h)) {
      if (has(h.d, now.dow) && now.minutes >= h.s) return true;
      return has(h.d, prevDow(now.dow)) && now.minutes < h.e;
    }
    return has(h.d, now.dow) && now.minutes >= h.s && now.minutes < h.e;
  }
  function minutesLeft(h, now) {
    if (!crosses(h)) return h.e - now.minutes;
    return now.minutes >= h.s ? (1440 - now.minutes) + h.e : h.e - now.minutes;
  }
  function nextStart(hh, now) {
    let best = null;
    for (const h of hh) for (let a = 0; a < 7; a++) {
      const d = (now.dow + a) % 7;
      if (!has(h.d, d)) continue;
      const inM = a * 1440 + h.s - now.minutes;
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

  // --- live clock + card status ---
  function updateClock(now) {
    const h = Math.floor(now.minutes / 60) % 12 || 12;
    const label = `${DOW[now.dow]} ${h}:${String(now.minutes % 60).padStart(2, '0')} ${now.minutes < 720 ? 'AM' : 'PM'}`;
    document.querySelectorAll('[data-clock]').forEach(el => { el.textContent = label; });
  }
  function updateStatuses(now) {
    document.querySelectorAll('.card[data-hh]').forEach(card => {
      let hh; try { hh = JSON.parse(card.dataset.hh); } catch { return; }
      const el = card.querySelector('[data-status]');
      if (!el) return;
      const active = hh.find(h => isActive(h, now));
      if (active) {
        card.classList.add('active');
        el.className = 'now'; el.dataset.status = '';
        el.textContent = `ends in ${fmtLeft(minutesLeft(active, now))}`;
      } else {
        card.classList.remove('active');
        el.className = 'next'; el.dataset.status = '';
        const nx = nextStart(hh, now);
        el.textContent = !nx ? ''
          : nx.inMinutes < 1440 ? `next: in ${fmtLeft(nx.inMinutes)}`
          : `next: ${DOW[(now.dow + Math.floor(nx.inMinutes / 1440)) % 7]} ${fmtWindow(nx.h)}`;
      }
    });
  }
  let lastMin = -1;
  function tick() {
    const now = chicagoNow();
    updateClock(now);
    if (now.minutes !== lastMin) { updateStatuses(now); lastMin = now.minutes; } // recompute on minute change
  }
  tick();
  setInterval(tick, 1000);

  // --- near me ---
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
        btn.textContent = '◉ sorted by distance';
        btn.disabled = true;
      }, () => {
        btn.textContent = '◉ location unavailable';
        btn.disabled = true;
        document.getElementById('hoods')?.scrollIntoView({ behavior: 'smooth' });
      }, { maximumAge: 300000, timeout: 8000 });
    });
  }

  // --- filters ---
  const filters = document.querySelector('[data-filters]');
  if (filters && container) {
    fetch('/api/bars.json').then(r => r.json()).then(({ bars }) => {
      const flag = Object.fromEntries(bars.map(b => [b.slug, b]));
      filters.hidden = false;
      filters.addEventListener('click', e => {
        const b = e.target.closest('button[data-f]');
        if (!b) return;
        b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
        const active = [...filters.querySelectorAll('[aria-pressed="true"]')].map(x => x.dataset.f);
        cards().forEach(c => {
          const meta = flag[c.dataset.slug];
          c.hidden = !!meta && !active.every(f => meta[f]);
        });
      });
    }).catch(() => {});
  }

  // --- report modal ---
  const dlg = document.getElementById('report-dialog');
  if (dlg) {
    document.querySelector('[data-open-report]')?.addEventListener('click', () => dlg.showModal());
    dlg.querySelector('[data-close-report]')?.addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }); // backdrop
  }

  // --- PWA ---
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
