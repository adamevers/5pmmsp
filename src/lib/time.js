// Happy-hour time logic. All calculations in America/Chicago.
// dow: 0=Mon … 6=Sun. Windows: minutes-since-midnight; end_min <= start_min
// means the window spills past midnight (belongs to the START day's mask).

const TZ = 'America/Chicago';
const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
});

export function nowInChicago(date = new Date()) {
  const parts = Object.fromEntries(FMT.formatToParts(date).map(p => [p.type, p.value]));
  const dow = DOW_NAMES.indexOf(parts.weekday);
  const hour = Number(parts.hour) % 24; // hour12:false can yield "24" at midnight
  return { dow, minutes: hour * 60 + Number(parts.minute) };
}

const crossesMidnight = hh => hh.end_min <= hh.start_min;
const prevDow = dow => (dow + 6) % 7;
const hasDow = (mask, dow) => (mask & (1 << dow)) !== 0;

export function isActive(hh, now) {
  if (crossesMidnight(hh)) {
    // Late side (today's start day): from start until midnight.
    if (hasDow(hh.dow_mask, now.dow) && now.minutes >= hh.start_min) return true;
    // Early side (day after a masked day): midnight until end.
    return hasDow(hh.dow_mask, prevDow(now.dow)) && now.minutes < hh.end_min;
  }
  return hasDow(hh.dow_mask, now.dow)
    && now.minutes >= hh.start_min && now.minutes < hh.end_min;
}

export function minutesLeft(hh, now) {
  if (!isActive(hh, now)) return null;
  if (!crossesMidnight(hh)) return hh.end_min - now.minutes;
  return now.minutes >= hh.start_min
    ? (1440 - now.minutes) + hh.end_min   // late side: through midnight to end
    : hh.end_min - now.minutes;           // early side
}

/** Soonest upcoming start across all windows, scanning up to 7 days out. */
export function nextStart(hhs, now) {
  let best = null;
  for (const hh of hhs) {
    for (let ahead = 0; ahead < 7; ahead++) {
      const dow = (now.dow + ahead) % 7;
      if (!hasDow(hh.dow_mask, dow)) continue;
      const inMinutes = ahead * 1440 + hh.start_min - now.minutes;
      if (inMinutes <= 0) continue;
      if (!best || inMinutes < best.inMinutes) best = { hh, inMinutes };
      break; // first qualifying day for this window is its soonest
    }
  }
  return best;
}

function fmtTime(min) {
  const h24 = Math.floor(min / 60) % 24, m = min % 60;
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h = h24 % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${ampm}` : `${h} ${ampm}`;
}

/** "3–6 PM", "11:30 AM–1 PM", "10 PM–1 AM" — drop the first meridiem when equal. */
export function fmtWindow(hh) {
  const a = fmtTime(hh.start_min), b = fmtTime(hh.end_min % 1440 || hh.end_min);
  const [at, am] = [a.slice(0, -3), a.slice(-2)];
  const bm = b.slice(-2);
  return am === bm ? `${at}–${b}` : `${a}–${b}`;
}

/** "Mon–Fri", "every day", "Fri–Sat", "Mon, Wed, Fri". */
export function fmtDows(mask) {
  if ((mask & 0b1111111) === 0b1111111) return 'every day';
  const days = DOW_NAMES.map((n, i) => hasDow(mask, i) ? i : -1).filter(i => i >= 0);
  if (days.length === 0) return '';
  const contiguous = days.length > 1 && days[days.length - 1] - days[0] === days.length - 1;
  if (contiguous) return `${DOW_NAMES[days[0]]}–${DOW_NAMES[days[days.length - 1]]}`;
  return days.map(i => DOW_NAMES[i]).join(', ');
}
