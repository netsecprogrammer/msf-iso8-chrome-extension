# MSF ISO-8 Extension Refresh Plan - 2026-07-03

## Current Snapshot

- Source device: BlueStacks ADB at `127.0.0.1:5585`
- Package: `com.foxnextgames.m3`
- Local pull folder: `data-pulls/bluestacks-20260703-174436`
- Full config mirror: `data-pulls/bluestacks-20260703-174436/Config-full`
- Extraction source: `Config-full/combat_data/characters.json`
- Implemented extension version: `2.9.53`

The full cached `Config` tree was pulled from BlueStacks: 741 files, about 81 MB.

## Data Delta

Running the existing `extract_iso8.js` against the latest `combat_data/characters.json` initially produced 436 rows.

After filtering internal `TestCharacter*` rows, the generated publishable data set contains 432 rows.

Current checked-in `iso8_data.json` has 417 rows.

Real new rows detected:

- `Angel`
- `Annihilus`
- `BladeMighty`
- `Executioner`
- `HighEvolutionary`
- `Maestro`
- `Malekith`
- `Morph`
- `RachelColeAlves`
- `Riot`
- `SilverSurferBreaker`
- `SpiderWomanJulia`
- `StormMighty`
- `SymbioteQuicksilver`
- `Toxin`

Rows generated but likely should be excluded before shipping:

- `TestCharacterA`
- `TestCharacterB`
- `TestCharacterC`
- `TestCharacterD`

Existing rows with changed generated output: 17. Notable affected characters include `CullObsidian`, `EbonyMaw`, `Eclipse`, `Hulk`, `JeffTheLandShark`, `Jubilee`, `Knull`, `Minerva`, `Ronan`, `SpiderMan`, `Sylvie`, `Thanos`, `Venom`, and `Wolverine`.

New/team enum names currently appear raw in generated descriptions and are not covered by the existing extension formatter/localization maps:

- `AVENGER`
- `EXALTEDXMEN`
- `SHADOWCONCLAVE`
- `SYMBIOTESIX`

Implemented fix: `extract_iso8.js` now normalizes these new raw team tokens in generated display text and excludes `TestCharacter*`.

Implemented review helper: `scripts/report_iso8_delta.js`.

Implemented validation helper: `scripts/validate_iso8_data.js`.

Implemented text/game-data audit helper: `scripts/audit_iso8_against_game_data.js`.

Text audit fixes from raw `combat_data/characters.json` review:

- Added missing `drain_heal_results` rendering for `Annihilus`: "Share Drain healing with 5 random allies."
- Added missing no-explicit-delta `proc_duration` rendering for `SamWilson`: "Gain +1 Deflect, up to a maximum of 5."
- Expanded team/trait display normalization so generated text uses names such as `Symbiote Six`, `Omen`, and `Retcon` instead of uppercase enum artifacts.

Implemented runtime robustness:

- `content.js` now tracks cache source, staleness, and cache age.
- Character lookup now uses normalized key matching instead of the older ad hoc variation loop.
- The panel now shows the matched key and cache status.
- The panel now includes a refresh button that forces a fresh `iso8_data.json` fetch.
- The no-data panel now shows cache status and closest matching keys.
- Injection now uses bounded retries plus a DOM observer so SPA character-page navigation can mount late without requiring a browser refresh.
- Cached `iso8Data` now has a current-row guard. If the browser cached the pre-refresh 417-row data set, the extension bypasses that cache and fetches current data instead of showing missing data for new characters.
- Content script now injects site-wide on `marvelstrikeforce.com` so SPA navigation from non-character pages into character pages is observed.
- Insertion targets now must be visible and non-trivial in size before the panel is considered rendered.

Latest verified delta after the extractor patch:

- Current rows before refresh: 417
- Generated rows after refresh: 432
- Real additions: 15
- Removed rows: 0
- Changed existing rows: 17
- Test rows in generated data: 0
- Raw new-team enum tokens in generated data: 0

Latest focused audit status:

- New and changed July 2026 rows audited against raw safety actions: 32 rows, 0 warnings.
- Same high-risk set plus `SamWilson`: 33 rows, 0 warnings.
- Full generated data audit: 432 rows, 16 conservative warnings remaining, all reviewed as conditional-stat/max-value warnings rather than confirmed text omissions.

## Implementation Plan

### Phase 1 - Make Data Refresh Repeatable

1. Done: update `extract_iso8.js` skip rules to exclude all obvious test/dev rows, especially `TestCharacter*`.
2. Done: add a small report mode or helper script that compares:
   - checked-in `iso8_data.json`
   - freshly generated `iso8_data.json`
   - latest `heroes/M3HeroSheet.json`
3. Done: have the report show added, removed, changed, and roster-missing characters so each future MSF update is reviewable before publishing.
4. Done: regenerate `iso8_data.json` from the latest pulled `combat_data/characters.json`.

### Phase 2 - Include New Toons Cleanly

1. Done: ship the 15 real new rows listed above.
2. Done: review the 17 changed existing rows with the delta helper before accepting the regenerated file wholesale.
3. Done: add display-name normalization for newly exposed team enums:
   - `AVENGER` -> `Avenger`
   - `EXALTEDXMEN` -> `Exalted X-Men`
   - `SHADOWCONCLAVE` -> `Shadow Conclave`
   - `SYMBIOTESIX` -> `Symbiote Six`
4. Check the website character slugs for variant characters such as `SilverSurferBreaker`, `BladeMighty`, `StormMighty`, and `SymbioteQuicksilver`; add an alias map if the site URL does not exactly match the internal ID.

### Phase 3 - Improve Extension Quality

1. Partially done: add a visible data freshness/status line to the panel:
   - character key matched
   - cache age or fetch status
   - pending: embedded data generation date
2. Replace the 500 ms URL polling loop with SPA navigation hooks plus a small fallback observer.
3. Split `content.js` into smaller modules for:
   - data loading/cache
   - character matching
   - formatting/localization
   - panel rendering
4. Move fetched/game-derived strings away from broad `innerHTML` construction where practical, or constrain HTML generation to trusted formatter output.
5. Done: improve the "No Data Found" panel:
   - show closest matching character IDs
   - show cache age
   - offer a manual refresh action
6. Done: add a manual cache refresh button to avoid waiting up to 24 hours after data updates.
7. Partially done: add lightweight validation tests for:
   - extraction row count and no test rows
   - specific known new characters
   - localization/enum formatting for new team names
   - pending: semantic snapshots for known changed characters

### Phase 4 - Release Flow

1. Commit regenerated `iso8_data.json`, extraction/report tooling, and extension UI improvements separately when possible.
2. Bump the manifest version.
3. Load the unpacked extension locally and verify:
   - one old unchanged character
   - one changed character
   - several new characters
   - one variant/renamed character
4. Push to GitHub so the remote `iso8_data.json` update reaches installed extensions after cache expiry or manual refresh.
