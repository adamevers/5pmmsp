# 5PM MSP — Brand & Style Guide

*"Bottle Cap" — incandescent sign-craft for the Twin Cities happy hour.*

---

## The idea

5PM MSP is the Minneapolis–St Paul answer to a happy-hour finder: free, no ads,
mobile-first, built to answer one question fast — *where's a good deal near me,
right now?* The brand has to feel **local, warm, and a little bit dive-bar** —
not another glassy dark-neon app. So the whole identity is borrowed from the
most beloved illuminated sign in the state.

## Inspiration

- **The Grain Belt Beer sign** (Nicollet Island, 1941) — the north star. A
  100-ft red-neon bottle cap with a green "M," and 1,400 incandescent bulbs that
  light the name **one letter at a time**: G-R-A-I-N B-E-L-T. That bulb-by-bulb
  animation is our wordmark behavior; the bottle cap is our logo; the warm bulb
  amber on river-night blue is our palette.
- **First Avenue's star wall** — the civic instinct that every venue deserves
  its star. (Considered as a full direction; kept as spirit, not surface.)
- **Nordeast dive culture** — Tony Jaros' Greenie, Mayslack's, cash on the bar.
  The voice is plain-spoken and unpretentious because the bars are.
- **Patio season vs. the skyway** — the Twin Cities' split personality (78° on a
  rooftop / -10° in a glass tube downtown) shows up as first-class filters.

## Logo

- **The cap:** a scalloped bottle-cap badge, cap-red fill, cream enamel ring,
  with a 45°-rotated "5PM" panel inside (echoing Grain Belt's diamond).
- **The wordmark:** `5PM MSP` in Big Shoulders Display 800, filament amber, each
  letter wrapped in a `<span>` that lights in sequence (the bulb animation).
  Always honors `prefers-reduced-motion` — when reduced, all letters sit lit.

## Color

| token | hex | role |
|---|---|---|
| `--night` | `#101B2D` | river-night ground (backgrounds) |
| `--night-2` | `#182642` | raised surfaces, ghost buttons |
| `--filament` | `#FFB84D` | incandescent amber — the glow, links, wordmark |
| `--cap-red` | `#C8322B` | bottle-cap red — primary action, active state |
| `--enamel` | `#F4E9D8` | porcelain-sign cream — **card surfaces**, body text on dark |
| `--brew-green` | `#2E6B4F` | the "M"-circle green — **verified only** |
| `--ink` | `#26221C` | text on enamel |
| `--dim` | `#8FA0BC` | muted mono labels, captions |

**Rules of thumb:** dark ground, cream cards. Red is for *action and "on now."*
Green means *one thing only — verified.* Amber is the light: glow, the clock,
links. Don't introduce a fourth accent.

## Type

- **Display — Big Shoulders Display** (600/800). Condensed, industrial, signage.
  Headings, wordmark, buttons, bar names. Uppercase with slight letter-spacing.
- **Body — Archivo** (400/500/600). Grotesque, neutral, legible on a phone.
- **Data — IBM Plex Mono** (400/500). Times, prices, distances, the live clock,
  fine print. Anything that reads like a readout.

## Voice

Plain verbs, sentence case, no hype. You're a well-informed friend who drinks in
Nordeast, not a marketer.

- Say "ends in 40m," "next: in 2h," "3–6 PM." Numbers over adjectives.
- Empty states point somewhere: "Nothing's pouring right this minute. Next up at
  3 PM:" — never a dead end.
- Trust is earned out loud: **Verified** with a date, or **unverified**, plainly.
  Never fake certainty.
- Privacy is a feature, stated: "location stays on your phone — we never see it."

## Signature elements

- **Bulb-by-bulb wordmark** (the Grain Belt letter sequence).
- **Enamel cards** — cream panels with a hard `0 6px 0` drop, red border when a
  happy hour is live.
- **◆ diamond** = verified marker (never used decoratively).
- **The live clock** in the section header, amber mono, ticking.

## Iconography

Inline line-icons, `stroke: currentColor`, amber. Default set: globe (website),
pin (directions), flag (report). Alternate sets are catalogued in the design
review; swap the paths in `ICONS` (`src/lib/html.js`) to restyle site-wide.

## Motion

Restrained. The wordmark bulbs, the live countdown, a 1px press on cards. No
gratuitous scroll animation — the sign flickers; it doesn't dance.

## Assets

- Favicon / app icon: `public/icon.svg` (bottle cap).
- Social share image: 1200×630, dark gradient + cap + wordmark + sample chips +
  `5pmmsp.com`. Source in `docs/og/` (see that folder for the current export).

## What this brand is *not*

- Not glassy dark-neon (that's 5pm.nyc — we're deliberately warmer, sign-painted).
- Not sponsored or ad-driven. No "featured" placement styling exists on purpose.
- Not slick-startup. It should feel like it was painted on a bar window in 1955
  and wired for neon.
