// JSON-LD builders. Kept out of pages.js so the shapes stay unit-testable.
// Only markup that matches something visible on the page belongs here.
import { CITIES, hoodName, priceLabel } from './data.js';

const SCHEMA_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** dow_mask (bit0=Mon) → ['Monday', …] in week order. */
export function maskDays(mask) {
  return SCHEMA_DAYS.filter((_, i) => (mask & (1 << i)) !== 0);
}

/**
 * Minutes-since-midnight → "15:00". Our data uses 1440 for "closes at
 * midnight"; schema.org has no 24:00, so clamp to 23:59.
 */
export function hhmm(min) {
  const m = min >= 1440 ? 1439 : Math.max(0, min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Windows → OpeningHoursSpecification[]. A window whose `closes` is earlier
 * than its `opens` is the schema.org way of saying "runs past midnight",
 * which is exactly what our end_min <= start_min convention means.
 */
export function openingHours(windows) {
  return (windows || [])
    .filter(w => maskDays(w.dow_mask).length)
    .map(w => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: maskDays(w.dow_mask),
      opens: hhmm(w.start_min),
      closes: hhmm(w.end_min),
    }));
}

/** Full BarOrPub node for a bar detail page. */
export function barJsonLd(bar, { description } = {}) {
  const city = CITIES[bar.city] || bar.city;

  const address = {
    '@type': 'PostalAddress',
    addressLocality: city,
    addressRegion: bar.state || 'MN',
    addressCountry: 'US',
  };
  if (bar.address) address.streetAddress = bar.address;
  if (bar.zip) address.postalCode = bar.zip;

  const sameAs = [
    bar.website,
    bar.instagram ? `https://www.instagram.com/${bar.instagram}` : null,
  ].filter(Boolean);

  const cuisines = String(bar.food || '').split(',').map(s => s.trim()).filter(Boolean);

  const amenities = [
    bar.patio && 'Outdoor patio',
    bar.rooftop && 'Rooftop',
    bar.skyway && 'Skyway access',
  ].filter(Boolean).map(name => ({
    '@type': 'LocationFeatureSpecification', name, value: true,
  }));

  const hours = openingHours(bar.hours);
  const price = priceLabel(bar.price);

  return {
    '@context': 'https://schema.org',
    '@type': 'BarOrPub',
    name: bar.name,
    url: `https://5pmmsp.com/bar/${bar.slug}`,
    address,
    geo: { '@type': 'GeoCoordinates', latitude: bar.lat, longitude: bar.lng },
    ...(description ? { description } : {}),
    ...(bar.phone ? { telephone: bar.phone } : {}),
    ...(price ? { priceRange: price } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(cuisines.length ? { servesCuisine: cuisines } : {}),
    ...(amenities.length ? { amenityFeature: amenities } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [bar.name, bar.address, city, bar.state || 'MN'].filter(Boolean).join(', '))}`,
  };
}

/**
 * CollectionPage + ItemList for a list page (neighborhood, city, day).
 * Position order matches the order the cards render in.
 */
export function listJsonLd({ name, description, path, bars }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    description,
    url: `https://5pmmsp.com${path}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: bars.length,
      itemListElement: bars.map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `https://5pmmsp.com/bar/${b.slug}`,
        name: b.name,
      })),
    },
  };
}

/** Breadcrumb trail. `crumbs` = [{name, path}] ending with the current page. */
export function breadcrumbJsonLd(crumbs) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: `https://5pmmsp.com${c.path}`,
    })),
  };
}

/** Convenience: the hood/city label pair used in list-page copy. */
export const placeLabel = bar => `${hoodName(bar.neighborhood)}, ${CITIES[bar.city] || bar.city}`;
