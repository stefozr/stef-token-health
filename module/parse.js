/*
 * Input grammar for the Token Health dialog.
 *
 *   10                 => 10 damage
 *   -10                => 10 healing
 *   5[cold]+10[fire]   => typed damage
 *
 * Errors are returned as i18n keys so the caller can localize them.
 */

/** @returns {boolean} Whether the string is a bare (optionally signed) integer. */
export const isPlainInt = (s) => /^[+-]?\d+$/.test(s);

/**
 * @typedef {object} DamagePart
 * @property {number} amount      Non-negative integer.
 * @property {string|null} type   Damage type as typed by the user, or null for untyped.
 */

/**
 * @typedef {object} ParseResult
 * @property {boolean} ok
 * @property {"damage"|"heal"} [mode]
 * @property {DamagePart[]} [parts]
 * @property {string} [key]       i18n key, when ok is false.
 * @property {object} [data]      Format data for the key.
 */

/**
 * @param {string} raw
 * @returns {ParseResult}
 */
export function parseTypedAmount(raw) {
  const s = (raw ?? "").trim();
  if (!s) return { ok: false, key: "TOKEN_HEALTH.Error.Empty" };

  // Plain integer => damage or heal based on sign
  if (isPlainInt(s)) {
    const n = Number(s);
    return {
      ok: true,
      mode: n < 0 ? "heal" : "damage",
      parts: [{ amount: Math.abs(n), type: null }]
    };
  }

  // Typed damage segments: 5[cold]+10[fire] (+ optional untyped segment 10)
  // Spaces are ignored.
  const cleaned = s.replace(/\s+/g, "");
  if (cleaned.startsWith("-")) {
    return { ok: false, key: "TOKEN_HEALTH.Error.NegativeTyped" };
  }
  const segments = cleaned.split("+").filter(Boolean);
  if (!segments.length) return { ok: false, key: "TOKEN_HEALTH.Error.InvalidExpression" };

  const parts = [];
  for (const seg of segments) {
    const m = /^(\d+)(?:\[(.+?)\])?$/.exec(seg);
    if (!m) return { ok: false, key: "TOKEN_HEALTH.Error.InvalidSegment", data: { segment: seg } };
    const amount = Number(m[1]);
    const type = (m[2] ?? "").trim().toLowerCase() || null;
    parts.push({ amount, type });
  }

  return { ok: true, mode: "damage", parts };
}
