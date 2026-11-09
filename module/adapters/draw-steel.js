import { registerAdapter } from "./registry.js";

/*
 * Draw Steel.
 *
 * The resource is Stamina. Every write goes through the system's own APIs so that immunity,
 * weakness, minion squads, the negative-stamina floor and the winded/dying effects are all
 * handled by the system rather than reimplemented here.
 */

/**
 * Split actors into individuals and minion squads, mirroring the system's own bucketing in
 * PowerRoll#applyDamage. A minion with no squad, or with more than one, is treated as an
 * individual — the system warns and then damages it directly.
 * @param {Actor[]} actors
 * @returns {{singles: Actor[], squads: Map<object, Actor[]>}}
 */
function bucket(actors) {
  const singles = [];
  const squads = new Map();
  for (const actor of actors) {
    const group = (actor.isMinion && actor.system.combatGroup && !(actor.system.combatGroups?.size > 1))
      ? actor.system.combatGroup
      : null;
    if (!group) {
      singles.push(actor);
      continue;
    }
    if (!squads.has(group)) squads.set(group, []);
    squads.get(group).push(actor);
  }
  return { singles, squads };
}

/**
 * Merge segments sharing a damage type, so 5[fire]+10[fire] is one 15-fire instance rather than
 * two. Each remaining part is applied as its own damage instance, which is how Draw Steel scores
 * immunity and weakness. Order of first appearance is preserved.
 * @param {import("../parse.js").DamagePart[]} parts
 * @returns {import("../parse.js").DamagePart[]}
 */
function coalesce(parts) {
  const out = [];
  for (const p of parts) {
    const hit = out.find((o) => o.type === p.type);
    if (hit) hit.amount += p.amount;
    else out.push({ ...p });
  }
  return out;
}

const DEATH_TRACKER = "draw-steel-death-tracker";

/**
 * Revive minions through Draw Steel Death Tracker when it is active, so its skull tiles, death
 * visuals and token flags are undone too. It has no public revive-by-token API, so this imports
 * its module file (the same URL its entry point loads, so the same module instance) and calls
 * `reviveTokens`. Any failure is logged and the caller's plain revive takes over.
 * @param {object[]} combatants Minion combatants to revive.
 */
async function deathTrackerRevive(combatants) {
  if (!game.modules.get(DEATH_TRACKER)?.active) return;
  const tokenIds = combatants.map((c) => c.tokenId).filter((id) => id && canvas.tokens?.get(id));
  if (!tokenIds.length) return;
  try {
    const mod = await import(foundry.utils.getRoute(`modules/${DEATH_TRACKER}/src/death-tracker.mjs`));
    if (typeof mod.reviveTokens !== "function") return;
    // The squad pool is raised by the caller, so Death Tracker must not restore it as well.
    await mod.reviveTokens(tokenIds, { skipGroupHpRestore: true });
  } catch (err) {
    console.warn("stef-token-health | Death Tracker revive failed, falling back", err);
  }
}

/**
 * Heal a minion squad's shared Stamina pool (capped at its max) and revive defeated minions the
 * new pool covers again, reversing what SquadModel#checkDefeatedMinions does.
 * @param {object} group CombatantGroup of type "squad"
 * @param {Actor[]} selected Selected minion actors, revived first
 * @param {number} amount
 */
async function healSquad(group, selected, amount) {
  const max = group.system.staminaMax;
  const current = group.system.staminaValue;
  const pool = Math.min(max, current + amount);
  // Revive BEFORE raising the pool: modules such as Death Tracker clamp a squad's pool to
  // living minions x per-minion Stamina, and Target Damage re-defeats minions the pool no longer
  // covers after every pool update. Standing the covered minions up first satisfies both.
  await reviveCovered(group, selected, Math.max(pool, current));
  // No options: SquadModel#_preUpdate computes staminaDiff, which drives the floating numbers.
  if (pool > current) await group.update({ "system.staminaValue": pool });
}

/**
 * Revive as many defeated minions as `pool` covers, selected ones first.
 * @param {object} group CombatantGroup of type "squad"
 * @param {Actor[]} selected
 * @param {number} pool The squad pool the minions should match.
 */
async function reviveCovered(group, selected, pool) {
  const minions = group.system.minions;
  if (!minions?.size) return;
  const perMinion = minions.first()?.actor?.system?.stamina?.max;
  if (!perMinion) return;
  // isDefeated also counts a Defeated status set from the token HUD without the tracker flag.
  const defeated = [...minions].filter((c) => c.isDefeated ?? c.defeated);
  const stillDefeated = Math.clamp(minions.size - Math.ceil(pool / perMinion), 0, minions.size);
  const toRevive = Math.max(0, defeated.length - stillDefeated);
  if (!toRevive) return;

  // Selected minions first. Unlinked tokens share a base actor, so also compare token ids.
  const tokenIds = new Set(selected.map((a) => a.token?.id).filter(Boolean));
  const isSelected = (c) => selected.includes(c.actor) || (!!c.token?.id && tokenIds.has(c.token.id));
  defeated.sort((a, b) => Number(isSelected(b)) - Number(isSelected(a)));
  const picked = defeated.slice(0, toRevive);

  // Death Tracker's own revive also removes its skull tile, death visuals and token flags.
  await deathTrackerRevive(picked);

  // Plain revive for anything still down: no Death Tracker, or it skipped the token.
  const DEFEATED = CONFIG.specialStatusEffects.DEFEATED;
  for (const c of picked) {
    if (c.actor?.statuses?.has(DEFEATED)) await c.actor.toggleStatusEffect(DEFEATED, { overlay: true, active: false });
  }
  const flagged = picked.filter((c) => c.defeated);
  if (flagged.length) {
    await group.parent.updateEmbeddedDocuments("Combatant", flagged.map((c) => ({ _id: c.id, defeated: false })));
  }
}

registerAdapter({
  id: "draw-steel",

  damageTypes: () => Object.fromEntries(
    Object.entries(globalThis.ds?.CONFIG?.damageTypes ?? CONFIG?.DRAW_STEEL?.damageTypes ?? {})
      .map(([k, v]) => [k.toLowerCase(), game.i18n.localize(v?.label ?? "")])
  ),

  // `party` actors have no stamina. The takeDamage guard covers any future subtype too.
  hasResource: (actor) => !!actor?.system?.stamina && typeof actor.system.takeDamage === "function",

  placeholder: () => game.i18n.localize("TOKEN_HEALTH.Placeholder.drawSteel"),

  help() {
    const formatter = game.i18n.getListFormatter({ type: "disjunction" });
    return game.i18n.format("TOKEN_HEALTH.HelpBody.drawSteel", {
      types: formatter.format(Object.values(this.damageTypes()))
    });
  },

  async applyDamage(actors, parts) {
    const { singles, squads } = bucket(actors);
    for (const p of coalesce(parts)) {
      // There is no "untyped" key in Draw Steel — omit `type` entirely for untyped damage.
      const opts = p.type ? { type: p.type } : {};
      // Sequential awaits are required: SquadModel#takeDamage reads staminaValue fresh each call.
      for (const actor of singles) await actor.system.takeDamage(p.amount, opts);
      // Batched per squad: immunity and weakness are scored once for the whole batch.
      // The `aoe` flag (which caps damage per minion at stamina.max) is left unset, since the
      // dialog has no way to express that the damage came from an area effect.
      for (const [group, members] of squads) await group.system.takeDamage(members, p.amount, opts);
    }
  },

  async applyHealing(actors, amount) {
    const { singles, squads } = bucket(actors);
    // The system rule is that minions cannot regain Stamina (Monsters p. 7), but this module
    // deliberately lets the Director heal a squad's shared pool. Once per squad, however many of
    // its minions are selected.
    for (const [group, members] of squads) await healSquad(group, members, amount);
    // isDelta with a positive value heals: #modifyStamina negates it, raising stamina.value only,
    // clamped to [min, max] where min is negative (-winded).
    for (const actor of singles) await actor.modifyTokenAttribute("stamina", amount, true, true);
  },

  async applyTemp(actors, amount) {
    const { singles, squads } = bucket(actors);
    if (squads.size) {
      ui.notifications.warn("DRAW_STEEL.ChatMessage.base.Buttons.ApplyHeal.MinionTemp", { localize: true });
    }
    for (const actor of singles) {
      // Temporary Stamina does not stack — the highest value wins.
      if (amount < (actor.system.stamina.temporary ?? 0)) {
        ui.notifications.warn("DRAW_STEEL.ChatMessage.base.Buttons.ApplyHeal.TempCapped", {
          format: { name: actor.name }
        });
        continue;
      }
      // Absolute set, matching the system's own Apply Temp chat button.
      await actor.modifyTokenAttribute("stamina.temporary", amount, false, false);
    }
  }
});
