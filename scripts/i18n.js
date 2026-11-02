/*
 * Text shown to people. Every string lives in lang/<language>.json under "PYRE.<key>"; {name} placeholders are filled
 * from `data`. A missing key falls back to the English text passed in, so a partial translation never shows raw keys.
 */
export function t(key, data = null, fallback = null) {
  const k = `PYRE.${key}`;
  const i18n = globalThis.game?.i18n;
  let s = i18n?.has?.(k, false) ? i18n.localize(k) : (fallback ?? k);
  if (data) s = s.replace(/\{(\w+)\}/g, (m, n) => (n in data ? String(data[n]) : m));
  return s;
}

/** Picks "<key>.One" or "<key>.Many" by count and fills {n}. */
export function tn(key, n, data = {}, fallbacks = null) {
  const sub = n === 1 ? "One" : "Many";
  return t(`${key}.${sub}`, { n, ...data }, fallbacks?.[n === 1 ? 0 : 1] ?? null);
}
