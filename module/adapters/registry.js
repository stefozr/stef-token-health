/*
 * Per-system adapter registry.
 *
 * Adding support for a new game system means creating one file in this folder that calls
 * registerAdapter(), then adding a single import line to ./_index.js. Nothing else changes.
 */

/**
 * @typedef {import("../parse.js").DamagePart} DamagePart
 */

/**
 * @typedef {object} TokenHealthAdapter
 * @property {string}  id                                     game.system.id this adapter serves.
 * @property {boolean} supportsTemp                           Whether the Shift path is offered.
 * @property {() => Record<string, string>} damageTypes       Lowercase key -> localized label. Lazy.
 * @property {(actor: Actor) => boolean} hasResource          false => the actor is skipped.
 * @property {() => string} placeholder                       Amount input placeholder.
 * @property {() => string} help                              Tooltip body.
 * @property {(raw: string) => string|null} normalizeType     Defaulted below.
 * @property {(parts: DamagePart[]) => string|null} validate  Defaulted below; canonicalizes in place.
 * @property {(actors: Actor[], parts: DamagePart[]) => Promise<void>} applyDamage
 * @property {(actors: Actor[], amount: number) => Promise<void>} applyHealing
 * @property {(actors: Actor[], amount: number) => Promise<void>} applyTemp
 *
 * The apply* methods take an ARRAY of actors on purpose: Draw Steel's squad damage must be
 * batched, because immunity and weakness are scored once per batch rather than per minion.
 */

/** @type {Record<string, TokenHealthAdapter>} */
const ADAPTERS = {};

const DEFAULTS = {
  supportsTemp: true,
  damageTypes: () => ({}),
  hasResource: () => true,
  placeholder: () => game.i18n.localize("TOKEN_HEALTH.Placeholder.generic"),
  help: () => game.i18n.localize("TOKEN_HEALTH.Help"),

  /**
   * Resolve a user-typed damage type to its canonical key. Accepts the canonical key or the
   * localized label, so a German GM can type 5[kälte] as the help text has always advertised.
   * @param {string} raw
   * @returns {string|null}
   */
  normalizeType(raw) {
    const types = this.damageTypes();
    const key = raw.toLowerCase();
    if (key in types) return key;
    for (const [k, label] of Object.entries(types)) {
      if (String(label ?? "").toLowerCase() === key) return k;
    }
    return null;
  },

  /**
   * Canonicalize every part's type in place.
   * @param {DamagePart[]} parts
   * @returns {string|null} A localized error message, or null when every type resolved.
   */
  validate(parts) {
    for (const p of parts) {
      if (!p.type) continue;
      const key = this.normalizeType(p.type);
      if (!key) return game.i18n.format("TOKEN_HEALTH.Error.UnknownType", { type: p.type });
      p.type = key;
    }
    return null;
  }
};

/** @param {Partial<TokenHealthAdapter> & {id: string}} adapter */
export function registerAdapter(adapter) {
  ADAPTERS[adapter.id] = { ...DEFAULTS, ...adapter };
}

/**
 * @param {string} [id] Defaults to the active system.
 * @returns {TokenHealthAdapter|null}
 */
export function getAdapter(id = game.system.id) {
  return ADAPTERS[id] ?? null;
}
