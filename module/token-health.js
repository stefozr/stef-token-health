/*
 * Stef's Token Health
 *
 * Started as a fork of Token Health by Matheus Clemente (MIT).
 *
 * - ApplicationV2 dialog
 * - One input + one Apply action
 * - Positive = damage, negative = healing
 * - Typed damage: 5[cold]+10[fire]
 * - Shift + negative plain number => temp HP / temporary Stamina
 *
 * Per-system behavior lives in module/adapters/. See adapters/registry.js.
 */

import { parseTypedAmount, isPlainInt } from "./parse.js";
import { getAdapter } from "./adapters/registry.js";
import "./adapters/_index.js";

const MODULE_ID = "stef-token-health";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Notify with an already-localized message, keeping the prefix in the lang files. */
function warnMessage(message) {
  ui.notifications.warn(game.i18n.format("TOKEN_HEALTH.Warn.Prefix", { message }));
}

/** Single funnel for notifications raised from an i18n key. */
function warn(key, data = {}) {
  warnMessage(game.i18n.format(key, data));
}

class TokenHealthDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "stef-token-health",
    classes: ["form-token-health"],
    tag: "form",
    actions: {
      apply: TokenHealthDialog.apply
    },
    form: {
      // Keep the app open only long enough to apply once.
      closeOnSubmit: true
    },
    window: {
      contentClasses: ["standard-form"]
    },
    position: {
      width: 420
    }
  };

  static PARTS = {
    form: {
      classes: ["token-health"],
      template: `modules/${MODULE_ID}/templates/token-health.hbs`
    },
    footer: {
      template: "templates/generic/form-footer.hbs"
    }
  };

  // ✅ FIX: cache Shift state from Shift+Enter, because click() loses shiftKey
  _thShiftFromEnter = false;

  get title() {
    const count = (this.options.tokens ?? []).length;
    const scope = game.i18n.localize(this.options.isTarget
      ? "TOKEN_HEALTH.ScopeTargets"
      : "TOKEN_HEALTH.ScopeSelected");
    return game.i18n.format("TOKEN_HEALTH.Title", { count, scope });
  }

  _prepareContext() {
    const thumbnails = (this.options.tokens ?? []).map((t) => ({
      image: t.document.texture.src,
      name: t.name
    }));

    const buttons = [
      {
        type: "submit",
        cssClass: ["apply"],
        icon: "fas fa-check-circle",
        label: game.i18n.localize("TOKEN_HEALTH.Apply"),
        action: "apply"
      }
    ];

    // Resolved per render, never at load time, so the system's i18n is already in place.
    const adapter = getAdapter();

    return {
      thumbnails,
      buttons,
      placeholder: adapter?.placeholder() ?? game.i18n.localize("TOKEN_HEALTH.Placeholder.generic"),
      help: adapter?.help() ?? game.i18n.localize("TOKEN_HEALTH.Help")
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const input = this.element.querySelector('input[name="amount"]');
    input?.focus();

    // Enter submits. Shift+Enter is used for temp HP mode.
    input?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      ev.preventDefault();

      // ✅ FIX: preserve whether Shift was held on Enter
      this._thShiftFromEnter = !!ev.shiftKey;

      // Clicking the action button works, so we emulate that behavior here.
      const btn = this.element.querySelector('button[data-action="apply"]');
      if (btn) return btn.click();

      // Fallback: call the action handler directly (still passes the real key event)
      TokenHealthDialog.apply.call(this, ev);
      this.close();
    });

    // Help tooltip toggle (click ? icon)
    const helpBtn = this.element.querySelector(".th-help-btn");
    const tooltip = this.element.querySelector(".th-tooltip");

    const closeTooltip = () => {
      if (!helpBtn || !tooltip) return;
      tooltip.hidden = true;
      helpBtn.setAttribute("aria-expanded", "false");
    };

    if (helpBtn && tooltip) {
      helpBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const isOpen = !tooltip.hidden;
        tooltip.hidden = isOpen; // toggle
        helpBtn.setAttribute("aria-expanded", String(!isOpen));
      });

      // Close on outside click
      this.element.addEventListener("click", (ev) => {
        if (ev.target === helpBtn || tooltip.contains(ev.target)) return;
        closeTooltip();
      });

      // Close on Escape
      this.element.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") closeTooltip();
      });
    }
  }

  static async apply(event, form, formData) {
    const adapter = getAdapter();
    if (!adapter) return warn("TOKEN_HEALTH.Warn.UnsupportedSystem", { system: game.system.id });

    const raw = (this.element.querySelector('input[name="amount"]')?.value ?? "").trim();
    if (!raw) return;

    // ✅ FIX: use cached Shift state from Shift+Enter OR actual event.shiftKey (Shift-click)
    const isTempMode = !!(event?.shiftKey || this._thShiftFromEnter);
    // Clear it so it doesn't leak into the next submit
    this._thShiftFromEnter = false;

    const tokens = this.options.isTarget ? Array.from(game.user.targets) : canvas.tokens.controlled;
    if (!tokens.length) return;

    // Ownership stays a token-level check, which is the correct one for unlinked tokens.
    // Actors are deliberately not deduped: two tokens sharing one linked actor are hit twice.
    const actors = tokens
      .filter((t) => t.isOwner)
      .map((t) => t.actor)
      .filter((a) => a && adapter.hasResource(a));
    if (!actors.length) return warn("TOKEN_HEALTH.Warn.NoValidTargets");

    if (isTempMode) {
      if (!adapter.supportsTemp) return warn("TOKEN_HEALTH.Warn.TempUnsupported");
      if (!isPlainInt(raw) || Number(raw) >= 0) return warn("TOKEN_HEALTH.Warn.TempNeedsNegative");
      return adapter.applyTemp(actors, Math.abs(Number(raw)));
    }

    const parsed = parseTypedAmount(raw);
    if (!parsed.ok) return warn(parsed.key, parsed.data);

    // Canonicalizes each part's type in place.
    const typeErr = adapter.validate(parsed.parts);
    if (typeErr) return warnMessage(typeErr);

    if (parsed.mode === "heal") return adapter.applyHealing(actors, parsed.parts[0].amount);
    return adapter.applyDamage(actors, parsed.parts);
  }
}

// Warn at most once per session on a system we have no adapter for.
let warnedUnsupported = false;

// Both modules bind Enter, so tell the GM once when the old one is still running.
Hooks.once("ready", () => {
  if (game.user.isGM && game.modules.get("token-health")?.active) {
    ui.notifications.warn(game.i18n.localize("TOKEN_HEALTH.Warn.OldModuleActive"), { permanent: true });
  }
});

Hooks.once("i18nInit", async () => {
  // Keybind: Enter opens the dialog for selected tokens.
  // Alt+Enter applies to targets (mirrors original behavior).
  game.keybindings.register(MODULE_ID, "tokenHealth", {
    name: "TOKEN_HEALTH.toggleKeyName",
    hint: "TOKEN_HEALTH.toggleKeyHint",
    editable: [{ key: "Enter" }],
    reservedModifiers: ["Alt"],
    restricted: true,
    onDown: ({ event, isAlt: isTarget }) => {
      if (!game.user.isGM) return;
      if (canvas.tokens.hud.rendered) return;

      const allTokens = isTarget ? Array.from(game.user.targets) : canvas.tokens.controlled;
      if (!allTokens.length) return;

      // Only tokens the user can update
      const tokens = allTokens.filter((t) => t.isOwner);
      if (!tokens.length) return;

      // Stay inert on an unsupported system: no preventDefault, so Enter keeps its normal
      // behavior, and the explanation is shown only once rather than on every keypress.
      if (!getAdapter()) {
        if (!warnedUnsupported) {
          warnedUnsupported = true;
          warn("TOKEN_HEALTH.Warn.UnsupportedSystem", { system: game.system.id });
        }
        return;
      }

      event.preventDefault();
      new TokenHealthDialog({ isTarget, tokens }).render(true);
    }
  });
});
