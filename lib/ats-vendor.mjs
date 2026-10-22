// lib/ats-vendor.mjs — detect the ATS vendor behind a posting URL.
//
// Host-only match, deliberately looser than liveness-api.mjs's resolveAtsApi()
// (which needs the full posting path to build an API URL) — a tracker report's
// URL may point at a board/careers page, not a canonical posting.
//
// The URL is parsed and only its hostname is compared, by exact name or
// dot-anchored suffix. A substring test on the raw URL string (the shape this
// replaces in auto-apply-browser.mjs) also matches the vendor's name in a path,
// query, or look-alike host, e.g. https://evil.example/?greenhouse.io or
// https://greenhouse.io.evil.example/.
//
// SCOPE (intentional): only ATS with clean, public URL fingerprints — Greenhouse,
// Lever, Ashby, Workday, iCIMS. White-labeled ATS (UKG, Dayforce, and similar) are
// NOT detectable from the URL alone and are deferred until the community adds a
// reliable signal (e.g. confirmation-email domain). Undetected → null.
const VENDOR_HOST_PATTERNS = [
  { id: 'greenhouse', test: (h) => /(^|\.)greenhouse\.io$/.test(h) },
  { id: 'lever',      test: (h) => h === 'jobs.lever.co' || h.endsWith('.lever.co') },
  { id: 'ashby',      test: (h) => h === 'jobs.ashbyhq.com' || h.endsWith('.ashbyhq.com') },
  { id: 'workday',    test: (h) => h.endsWith('.myworkdayjobs.com') || h.endsWith('.myworkdaysite.com') },
  { id: 'icims',      test: (h) => h.endsWith('.icims.com') },
];

/**
 * @param {string} rawUrl - Posting or careers-page URL.
 * @returns {'greenhouse'|'lever'|'ashby'|'workday'|'icims'|null}
 */
export function detectAtsVendor(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let u;
  try { u = new URL(rawUrl.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  for (const v of VENDOR_HOST_PATTERNS) if (v.test(host)) return v.id;
  return null;
}
