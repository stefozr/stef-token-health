import { registerAdapter } from "./registry.js";

/*
 * D&D5e.
 *
 * Everything real is delegated to Actor5e#applyDamage: resistances, immunities, vulnerabilities,
 * temp HP absorption, HP clamping and death saves. This adapter only shapes the arguments.
 */

registerAdapter({
  id: "dnd5e",

  damageTypes: () => Object.fromEntries(
    Object.entries(CONFIG?.DND5E?.damageTypes ?? {})
      .map(([k, v]) => [k.toLowerCase(), typeof v === "string" ? v : (v?.label ?? "")])
  ),

  hasResource: (actor) => !!actor?.system?.attributes?.hp,

  placeholder: () => game.i18n.localize("TOKEN_HEALTH.Placeholder.dnd5e"),
  help: () => game.i18n.localize("TOKEN_HEALTH.HelpBody.dnd5e"),

  async applyDamage(actors, parts) {
    const damages = parts.map((p) => ({ value: p.amount, type: p.type || undefined }));
    for (const actor of actors) await actor.applyDamage(damages);
  },

  async applyHealing(actors, amount) {
    for (const actor of actors) await actor.applyDamage([{ value: amount, type: "healing" }]);
  },

  async applyTemp(actors, amount) {
    // Deliberately stacks rather than taking the higher value, as this module has always done.
    for (const actor of actors) {
      const current = actor.system?.attributes?.hp?.temp ?? 0;
      await actor.update({ "system.attributes.hp.temp": current + amount });
    }
  }
});
