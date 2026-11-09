# Changelog

All notable changes to this module are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-11-10

### Added
- Damage and healing dialog for the selected tokens (Enter) or your targets (Alt+Enter), GM only.
- Positive numbers deal damage, negative numbers heal.
- Typed damage such as `5[fire]+3[cold]`.
- Shift+Enter with a negative number sets temporary hit points (D&D 5e) or Temporary Stamina (Draw Steel).
- D&D 5e support through `Actor#applyDamage`, so resistances, vulnerabilities and immunities apply.
- Draw Steel support through the system's damage handling: each typed segment is its own damage instance, and minion squads are batched so immunity and weakness count once per squad.
- Draw Steel: healing a minion heals its squad's shared Stamina once (capped at the squad's max) and revives defeated minions the pool covers again, selected ones first. With Draw Steel Death Tracker active, revival uses its revive, so skull markers and death visuals are cleared too. This deliberately goes beyond the rules.
- Interface in English, French, Spanish, German and Japanese.
- A GM warning when the older Token Health module is also active, since both open on Enter.
