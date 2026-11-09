# Stef's Token Health

A quick damage and healing dialog for Foundry VTT. Select tokens (or target them), press a key, type a number, press Enter. Works with D&D 5e and Draw Steel.

Stef's Token Health is not affiliated with MCDM Productions, LLC. Draw Steel is a trademark of MCDM Productions, LLC.

## Install

In Foundry VTT, open Add-on Modules, choose Install Module, and paste this manifest URL:

```
https://github.com/stefozr/stef-token-health/releases/latest/download/module.json
```

## Keys

The dialog is for the GM only. The key can be rebound in Configure Controls.

| Key | What it does |
| --- | --- |
| Enter | Open the dialog for the selected tokens |
| Alt+Enter | Open the dialog for your targeted tokens |
| Shift+Enter (in the dialog, with a negative number) | Set temporary hit points (D&D 5e) or Temporary Stamina (Draw Steel) instead of healing |

## Input

| Input | Meaning |
| --- | --- |
| `10` | 10 damage |
| `-10` | Heal 10 |
| `5[fire]+3[cold]` | Typed damage, 5 fire plus 3 cold |
| `-10` with Shift+Enter | Temporary hit points or Temporary Stamina of 10 |

Typed expressions cannot be negative. Use a plain negative number for healing.

## D&D 5e

Damage, healing and temporary hit points go through the system's `Actor#applyDamage`, so resistances, vulnerabilities, immunities and temporary hit points are handled the way the system handles them.

## Draw Steel

Damage goes through the system's `takeDamage` and healing through its Stamina handling, so immunity, weakness and the negative-Stamina floor work as in the system. Each typed segment is a separate damage instance, so `5[fire]+3[cold]` checks fire and cold on their own. Temporary Stamina keeps the highest value.

Minion squads share one Stamina pool. Selected minions are grouped by squad and damaged in one batch: the pool takes the damage once per selected minion, and immunity and weakness are counted once for the whole batch, as in the system's own Apply Damage. Healing a minion squad: see "Healing minion squads" below.

Minions cannot gain Temporary Stamina.

### Healing minion squads (Draw Steel)

Healing a minion heals its squad's shared Stamina pool once, however many of the squad's minions are selected. The pool never goes above the squad's max. Defeated minions that the new pool covers again are revived, and the selected minions come first.

When Draw Steel Death Tracker is active, the revive goes through Death Tracker, so its skull markers and death visuals are removed as well. Death Tracker's "clear effects on revive" setting then applies too, so a revived minion can lose its effects (such as With Captain), just as when you revive it from Death Tracker itself.

This deliberately goes beyond the rules: in Draw Steel, minions normally cannot regain Stamina. The module lets the Director do it anyway.

## Credits

Started as a fork of Token Health by Matheus Clemente, MIT.

## License

MIT. See [LICENSE](LICENSE).
