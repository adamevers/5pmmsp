// Map page: pins from bars.json, popups with tonight's window.
(() => {
  const map = L.map('map').setView([44.9635, -93.1935], 12); // between the cities
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const DOWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const fmt = min => {
    const h24 = Math.floor(min / 60) % 24, m = min % 60;
    const h = h24 % 12 || 12, ap = h24 < 12 ? 'AM' : 'PM';
    return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  fetch('/api/bars.json').then(r => r.json()).then(({ bars }) => {
    for (const b of bars) {
      const hh = b.hh[0];
      const win = hh ? `${fmt(hh.s)}–${fmt(hh.e)}` : 'no window on file';
      L.marker([b.lat, b.lng]).addTo(map).bindPopup(
        `<b>${esc(b.name)}</b><br>${hh ? esc(hh.deals) + '<br>' : ''}${win}` +
        `<br><a href="/bar/${esc(b.slug)}">details →</a>`
      );
    }
  });
})();
