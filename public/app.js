// Client enhancements: near-me sort, filters, live countdowns.
// Privacy contract: geolocation + distance math stay on this device.
(() => {
  const cards = () => [...document.querySelectorAll('[data-cards] .card')];
  const container = document.querySelector('[data-cards]');
  if (!container) return;

  // --- near me ---
  const btn = document.querySelector('[data-nearme]');
  const fallback = document.querySelector('[data-nearme-fallback]');
  if (btn && 'geolocation' in navigator) {
    btn.hidden = false;
    if (fallback) fallback.classList.replace('primary', 'ghost');
    btn.addEventListener('click', () => {
      btn.textContent = '◉ locating…';
      navigator.geolocation.getCurrentPosition(pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const R = 3958.8; // miles
        const rad = d => d * Math.PI / 180;
        const dist = (la, lo) => {
          const dLa = rad(la - lat), dLo = rad(lo - lng);
          const a = Math.sin(dLa / 2) ** 2 +
            Math.cos(rad(lat)) * Math.cos(rad(la)) * Math.sin(dLo / 2) ** 2;
          return 2 * R * Math.asin(Math.sqrt(a));
        };
        cards()
          .map(c => ({ c, d: dist(+c.dataset.lat, +c.dataset.lng) }))
          .sort((a, b) => a.d - b.d)
          .forEach(({ c, d }) => {
            const el = c.querySelector('[data-dist]');
            if (el) { el.hidden = false; el.textContent = `${d < 10 ? d.toFixed(1) : Math.round(d)} mi`; }
            container.appendChild(c); // re-order
          });
        btn.textContent = '◉ sorted by distance';
        btn.disabled = true;
      }, () => {
        // Denied or unavailable: no nagging — point at the hood browser.
        btn.textContent = '◉ location unavailable';
        btn.disabled = true;
        document.getElementById('hoods')?.scrollIntoView({ behavior: 'smooth' });
      }, { maximumAge: 300000, timeout: 8000 });
    });
  }

  // --- filters (patio / rooftop / verified via bars.json flags) ---
  const filters = document.querySelector('[data-filters]');
  if (filters) {
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
    }).catch(() => {}); // filters just stay hidden if the API hiccups
  }

  // --- live countdowns: refresh "ends in Xm" every 30s by re-parsing minutes ---
  const tick = () => {
    document.querySelectorAll('[data-end]').forEach(el => {
      const m = el.textContent.match(/(?:(\d+)h )?(\d+)m/);
      if (!m) return;
      let mins = (Number(m[1] || 0)) * 60 + Number(m[2]) - 0.5;
      if (mins <= 0) { el.textContent = 'just ended'; el.classList.remove('now'); return; }
      mins = Math.round(mins);
      el.textContent = `ends in ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`}`;
    });
  };
  setInterval(tick, 30000);

  // --- PWA ---
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
