import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nowInChicago, isActive, minutesLeft, nextStart, fmtWindow, fmtDows,
} from '../src/lib/time.js';

// dow: 0=Mon … 6=Sun. Masks.
const WEEKDAYS = 0b0011111;       // Mon–Fri
const FRI = 1 << 4;
const SAT = 1 << 5;

// Helper: a UTC Date that is a known Chicago local time.
// 2026-07-15 is a Wednesday; Chicago is CDT (UTC-5) in July.
const chi = (h, m = 0, day = 15) => new Date(Date.UTC(2026, 6, day, h + 5, m));

test('nowInChicago maps UTC to Chicago dow/minutes (CDT)', () => {
  const now = nowInChicago(chi(16, 30)); // Wed 4:30 PM Chicago
  assert.equal(now.dow, 2); // Wednesday
  assert.equal(now.minutes, 16 * 60 + 30);
});

test('nowInChicago handles CST (winter, UTC-6)', () => {
  // 2026-01-14 is a Wednesday; 22:00 UTC = 16:00 CST
  const now = nowInChicago(new Date(Date.UTC(2026, 0, 14, 22, 0)));
  assert.equal(now.dow, 2);
  assert.equal(now.minutes, 16 * 60);
});

test('simple window active/inactive', () => {
  const hh = { dow_mask: WEEKDAYS, start_min: 15 * 60, end_min: 18 * 60 }; // 3–6 PM Mon–Fri
  assert.equal(isActive(hh, nowInChicago(chi(16, 30))), true);   // Wed 4:30 PM
  assert.equal(isActive(hh, nowInChicago(chi(18, 0))), false);   // ends exactly at 6
  assert.equal(isActive(hh, nowInChicago(chi(14, 59))), false);
  assert.equal(isActive(hh, nowInChicago(chi(16, 30, 18))), false); // Saturday
});

test('cross-midnight window: active late night and after midnight vs prior dow', () => {
  const hh = { dow_mask: FRI, start_min: 22 * 60, end_min: 60 }; // Fri 10 PM–1 AM
  // Fri (Jul 17) 11:30 PM Chicago
  assert.equal(isActive(hh, nowInChicago(chi(23, 30, 17))), true);
  // Sat (Jul 18) 00:30 AM Chicago — still Friday's window
  assert.equal(isActive(hh, nowInChicago(chi(0, 30, 18))), true);
  // Sat 00:30 with a SAT-only mask must NOT match (window belongs to Fri)
  assert.equal(isActive({ ...hh, dow_mask: SAT }, nowInChicago(chi(0, 30, 18))), false);
  // Fri 9:59 PM — not yet
  assert.equal(isActive(hh, nowInChicago(chi(21, 59, 17))), false);
});

test('minutesLeft', () => {
  const hh = { dow_mask: WEEKDAYS, start_min: 15 * 60, end_min: 18 * 60 };
  assert.equal(minutesLeft(hh, nowInChicago(chi(16, 30))), 90);
  assert.equal(minutesLeft(hh, nowInChicago(chi(19, 0))), null);
  const late = { dow_mask: FRI, start_min: 22 * 60, end_min: 60 };
  assert.equal(minutesLeft(late, nowInChicago(chi(0, 30, 18))), 30); // Sat 00:30, ends 01:00
});

test('nextStart finds the soonest upcoming window across days', () => {
  const hhs = [
    { dow_mask: WEEKDAYS, start_min: 15 * 60, end_min: 18 * 60 },
    { dow_mask: SAT, start_min: 12 * 60, end_min: 14 * 60 },
  ];
  // Wed 7 PM → next is Thu 3 PM = 20h away
  const n = nextStart(hhs, nowInChicago(chi(19, 0)));
  assert.equal(n.inMinutes, 20 * 60);
  // Wed 2 PM → today 3 PM
  assert.equal(nextStart(hhs, nowInChicago(chi(14, 0))).inMinutes, 60);
  assert.equal(nextStart([], nowInChicago(chi(14, 0))), null);
});

test('formatting', () => {
  assert.equal(fmtWindow({ start_min: 15 * 60, end_min: 18 * 60 }), '3–6 PM');
  assert.equal(fmtWindow({ start_min: 11 * 60 + 30, end_min: 13 * 60 }), '11:30 AM–1 PM');
  assert.equal(fmtWindow({ start_min: 22 * 60, end_min: 60 }), '10 PM–1 AM');
  assert.equal(fmtDows(WEEKDAYS), 'Mon–Fri');
  assert.equal(fmtDows(0b1111111), 'every day');
  assert.equal(fmtDows(FRI | SAT), 'Fri–Sat');
  assert.equal(fmtDows(0b0010101), 'Mon, Wed, Fri');
});
