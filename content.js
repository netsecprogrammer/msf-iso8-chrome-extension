// MSF ISO-8 Counter/Assist Viewer - Content Script

(function() {
  'use strict';

  const DATA_URL = 'https://raw.githubusercontent.com/netsecprogrammer/msf-iso8-chrome-extension/master/iso8_data.json';

  // Active locale dictionary for status effect highlighting (set before formatting)
  let activeLocaleDict = null;

  const ISO8_ICON_SVG = `<svg class="msf-iso8-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#e94560"/>
    <path d="M2 17L12 22L22 17" stroke="#e94560" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M2 12L12 17L22 12" stroke="#e94560" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // Extract language code from URL (e.g., /fr/characters/sersi -> "fr")
  function getLanguageFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/^\/([a-z]{2})\/characters\//);
    return match ? match[1] : 'en';
  }

  // Load locale translations dictionary
  let localeData = null;
  async function loadLocaleData() {
    if (localeData !== null) return localeData;
    try {
      const url = chrome.runtime.getURL('locales.json');
      const resp = await fetch(url);
      localeData = await resp.json();
      return localeData;
    } catch (err) {
      console.warn('MSF ISO-8: Could not load locales.json', err);
      localeData = {};
      return localeData;
    }
  }

  // Translate a text string by replacing English terms with localized equivalents
  function localizeText(text, dict) {
    if (!dict || Object.keys(dict).length === 0) return text;
    // Sort keys by length descending so longer matches take priority
    // (e.g., "Defense Up" before "Defense", "Offense Down" before "Offense")
    const terms = Object.keys(dict).sort((a, b) => b.length - a.length);
    for (const en of terms) {
      if (text.includes(en)) {
        text = text.split(en).join(dict[en]);
      }
    }
    return text;
  }

  // Extract character ID from URL
  function getCharacterIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/\/characters\/([^\/\?#]+)/);
    return match ? match[1] : null;
  }

  // Load ISO-8 Data (Cache + Fetch)
  async function loadIso8Data() {
    // 1. Try local storage
    const localData = await chrome.storage.local.get(['iso8Data', 'lastUpdated']);
    const now = Date.now();

    // Use cache if < 24 hours old
    if (localData.iso8Data && localData.lastUpdated && (now - localData.lastUpdated < 86400000)) {
      return localData.iso8Data;
    }

    // 2. Fetch fresh data
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      await chrome.storage.local.set({
        iso8Data: data,
        lastUpdated: now
      });
      return data;
    } catch (error) {
      console.error('MSF ISO-8: Failed to fetch data', error);
      // Fallback to cache even if stale
      return localData.iso8Data || null;
    }
  }

  // Classify effect for styling
  function classifyEffect(effect) {
    const lowerEffect = effect.toLowerCase();
    if (lowerEffect.includes('in war')) return 'war-effect';
    if (lowerEffect.includes('in raid')) return 'raid-effect';
    if (lowerEffect.includes('in incursion')) return 'incursion-effect';
    if (lowerEffect.includes('in crucible')) return 'crucible-effect'; // matches both "crucible" and "crucible showdown"
    return '';
  }

  // Format effect text with styled percentages, status effects, and game modes
  function formatEffectText(text) {
    // Style "Steal X% Health" - health steal percentage
    text = text.replace(/Steal (\d+)% Health/g,
      'Steal <span class="msf-iso8-health-steal-value">$1%</span> Health');

    // Style "maximum of X%" - max redistribution percentage
    text = text.replace(/maximum of (\d+)%/g,
      'maximum of <span class="msf-iso8-health-redist-value">$1%</span>');

    // Style "Heal self for X%" or "Heal for X%"
    text = text.replace(/Heal (self )?for (\d+)%/g,
      'Heal $1for <span class="msf-iso8-heal-value">$2%</span>');

    // Style "X% of Max Health" or "X% of this character's Max Health" (for barrier, health damage, etc.)
    text = text.replace(/(\d+)% of (this character's )?Max Health/g,
      '<span class="msf-iso8-health-pct-value">$1%</span> of $2Max Health');

    // Style "Clear X positive/negative" counts
    text = text.replace(/Clear (\d+) (positive|negative)/g,
      'Clear <span class="msf-iso8-count-value">$1</span> $2');

    // Style "+X Deflect" or "gain +X"
    text = text.replace(/\+(\d+) (Deflect|Counter|Evade|Charged)/g,
      '+<span class="msf-iso8-stack-value">$1</span> $2');

    // Style "+X% Stat for each" patterns (like "+30% Piercing for each WINTER GUARD ally")
    text = text.replace(/\+(\d+)% (Piercing|Damage|Drain|Crit Chance|Focus)/g,
      '+<span class="msf-iso8-bonus-pct-value">$1%</span> $2');

    // Style game mode indicators (WAR, CRUCIBLE, CRUCIBLE SHOWDOWN, INCURSION, RAID, ARENA, with optional OFFENSE/DEFENSE)
    text = text.replace(/\b(On|In) ((?:CRUCIBLE SHOWDOWN|CRUCIBLE|WAR|RAID|INCURSION|ARENA)(?:,\s*(?:OFFENSE|DEFENSE))?)\b/gi,
      '$1 <span class="msf-iso8-game-mode">$2</span>');

    // Style status effects (buffs and debuffs)
    const statusEffects = [
      'Bleed', 'Regeneration', 'Blind', 'Charged', 'Defense Up', 'Defense Down',
      'Offense Up', 'Offense Down', 'Speed Up', 'Slow', 'Stun', 'Heal Block',
      'Ability Block', 'Stealth', 'Taunt', 'Evade', 'Deflect', 'Counter',
      'Vulnerable', 'Exposed', 'Disrupted', 'Trauma', 'Immunity', 'Safeguard',
      'Deathproof', 'Revive Once', 'Barrier', 'Empowered', 'Crit Chance Up',
      'Crit Damage Up', 'Assist Now', 'Minor Defense Up', 'Minor Offense Up',
      'Minor Regeneration', 'Minor Deflect', 'Accuracy Down', 'Bomb Burst',
      'Silence', 'Brick Material'
    ];

    // Add localized status effect names so they get highlighted too
    if (activeLocaleDict) {
      const localized = [];
      for (const en of statusEffects) {
        if (activeLocaleDict[en]) localized.push(activeLocaleDict[en]);
      }
      statusEffects.push(...localized);
    }

    // Sort by length descending so longer matches take priority
    statusEffects.sort((a, b) => b.length - a.length);

    const statusPattern = new RegExp(`(${statusEffects.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    text = text.replace(statusPattern, '<span class="msf-iso8-status-effect">$1</span>');

    // Style "On Counter," / "On Assist," / "Otherwise," prefixes
    text = text.replace(/\b(On Counter,|On Assist,|Otherwise,)/g,
      '<span class="msf-iso8-action-prefix">$1</span>');

    return text;
  }

  // Sentence-level templates per language (sourced from Scopely's official translations)
  // Each language's phrasing is taken directly from Scopely's localized ability descriptions.
  // Helper: translate trait name via dict and lowercase it
  function _traitLoc(trait, dict) { const t = localizeText(trait, dict); return t.toLowerCase(); }

  // Helper: translate game mode prefix (e.g., "WAR, OFFENSE" -> localized)
  const _modeMap = {
    fr: { 'WAR, OFFENSE': 'En attaque de guerre', 'RAID or WAR': 'En raid ou en guerre', 'RAID': 'En raid', 'WAR': 'En guerre', 'ARENA OFFENSE': "En attaque d'arène", 'ARENA': "En arène", 'CRUCIBLE SHOWDOWN, OFFENSE': "En attaque de confrontation du Creuset", 'Ultimate': 'ultime' },
    de: { 'WAR, OFFENSE': 'Bei KRIEGSOFFENSIVE', 'RAID or WAR': 'In RAUBZÜGEN oder im KRIEG', 'RAID': 'In RAUBZÜGEN', 'WAR': 'Im KRIEG', 'ARENA OFFENSE': 'Bei ARENAOFFENSIVE', 'ARENA': 'In der ARENA', 'CRUCIBLE SHOWDOWN, OFFENSE': 'Bei SCHMELZTIEGEL-SHOWDOWN-OFFENSIVE', 'Ultimate': 'ultimative' },
    es: { 'WAR, OFFENSE': 'Al atacar en guerras', 'RAID or WAR': 'En incursiones o guerras', 'RAID': 'En las incursiones', 'WAR': 'En guerras', 'ARENA OFFENSE': 'En ataque de arena', 'ARENA': 'En arena', 'CRUCIBLE SHOWDOWN, OFFENSE': 'En ataque de enfrentamiento del Crisol', 'Ultimate': 'definitiva' },
    pt: { 'WAR, OFFENSE': 'Na GUERRA OFENSIVA', 'RAID or WAR': 'Nas INCURSÕES ou GUERRA', 'RAID': 'Nas INCURSÕES', 'WAR': 'Na GUERRA', 'ARENA OFFENSE': 'Na ARENA OFENSIVA', 'ARENA': 'Na ARENA', 'CRUCIBLE SHOWDOWN, OFFENSE': 'No ataque do CONFRONTO DO CADINHO', 'Ultimate': 'suprema' },
    it: { 'WAR, OFFENSE': 'In ATTACCO BELLICO', 'RAID or WAR': 'Negli ASSALTI o in GUERRA', 'RAID': 'Negli ASSALTI', 'WAR': 'In GUERRA', 'ARENA OFFENSE': "In ATTACCO nell'ARENA", 'ARENA': "Nell'ARENA", 'CRUCIBLE SHOWDOWN, OFFENSE': "In ATTACCO nello SCONTRO DEL CROGIOLO", 'Ultimate': 'suprema' },
    ja: { 'WAR, OFFENSE': '戦争攻撃時', 'RAID or WAR': 'レイドまたは戦争では', 'RAID': 'レイドでは', 'WAR': '戦争では', 'ARENA OFFENSE': 'アリーナ攻撃時', 'ARENA': 'アリーナでは', 'CRUCIBLE SHOWDOWN, OFFENSE': 'クルーシブル対決攻撃時', 'Ultimate': '最強' },
    ko: { 'WAR, OFFENSE': '전쟁 공격 시', 'RAID or WAR': '레이드 또는 전쟁에서', 'RAID': '레이드에서', 'WAR': '전쟁에서', 'ARENA OFFENSE': '아레나 공격 시', 'ARENA': '아레나에서', 'CRUCIBLE SHOWDOWN, OFFENSE': '크루시블 대결 공격 시', 'Ultimate': '필살' },
    ru: { 'WAR, OFFENSE': 'Во время АТАКИ НА ВОЙНЕ', 'RAID or WAR': 'В РЕЙДАХ или НА ВОЙНЕ', 'RAID': 'В РЕЙДАХ', 'WAR': 'НА ВОЙНЕ', 'ARENA OFFENSE': 'Во время АТАКИ НА АРЕНЕ', 'ARENA': 'НА АРЕНЕ', 'CRUCIBLE SHOWDOWN, OFFENSE': 'Во время АТАКИ В ГОРНИЛЕ', 'Ultimate': 'мощной' },
  };
  function _modeLoc(mode, lang) {
    return (_modeMap[lang] && _modeMap[lang][mode]) || mode;
  }

  // Helper: negated game mode prefix (e.g., "Not in WAR" -> localized)
  const _notModeMap = {
    fr: { 'WAR': 'Hors guerre', 'RAID': 'Hors raid' },
    de: { 'WAR': 'Nicht im KRIEG', 'RAID': 'Nicht in RAUBZÜGEN' },
    es: { 'WAR': 'Fuera de guerras', 'RAID': 'Fuera de las incursiones' },
    pt: { 'WAR': 'Fora da GUERRA', 'RAID': 'Fora das INCURSÕES' },
    it: { 'WAR': 'Non in GUERRA', 'RAID': 'Non negli ASSALTI' },
    ja: { 'WAR': '戦争以外では', 'RAID': 'レイド以外では' },
    ko: { 'WAR': '전쟁 외', 'RAID': '레이드 외' },
    ru: { 'WAR': 'Вне ВОЙНЫ', 'RAID': 'Вне РЕЙДОВ' },
  };
  function _notModeLoc(mode, lang) {
    return (_notModeMap[lang] && _notModeMap[lang][mode]) || `Not in ${mode}`;
  }

  // Shared regex patterns (reused across all languages)
  const _P = {
    // --- Original patterns (Sersi) ---
    forcedDmgPierce: /^When forced to attack an ally, this character deals (.+?)% damage \+ (.+?)% Piercing to (.+?) characters\.$/,
    forcedDmg:       /^When forced to attack an ally, this character deals (.+?)% damage to (.+?) characters\.$/,
    flipEffects:     /^If (.+?) is an ally, Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    flipRandom:      /^If (.+?) is an ally, Flip (\d+) random positive effects to negative effects on the primary target\.$/,
    applyProc:       /^Apply (.+?) to the primary target\.$/,
    applyCount:      /^Apply (\d+) (.+?) to the primary target\.$/,
    applyPlusDur:    /^Apply \+(\d+) (.+?) for (\d+) turns to the primary target\.$/,
    applyPlus:       /^Apply \+(\d+) (.+?) to the primary target\.$/,
    applyAllies:     /^Apply \+(\d+) (.+?) to allies\.$/,
    gainPlus:        /^Gain \+(\d+) (.+?)\.$/,
    gainSpeedBar:    /^Gain (\d+)% Speed Bar\.$/,
    reduceSpeedBar:  /^Reduce Speed Bar by (\d+)%\.$/,
    gain:            /^Gain (.+?)\.$/,
    healthGain:      /^If this character has (\d+)% or less Health, Gain (.+?)\.$/,
    healthGeneric:   /^If this character has (\d+)% or less Health, (.+)$/,
    // --- New patterns (MoonGirl, Apocalypse, Ikaris, OldManLogan, BlackCat) ---
    forcedPierceOnly:      /^When forced to attack an ally, this character deals (.+?)% Piercing to (.+?) characters\.$/,
    ifAllyApplyRandom:     /^If (.+?) is an ally, Apply (.+?) to a random ally\.$/,
    selfHasApply:          /^If self has (.+?), Apply (.+?) to the primary target\.$/,
    selfHasClear:          /^If self has (.+?), Clear (\d+) (.+?) from allies\.$/,
    selfHasAttackInstead:  /^If self has (.+?), attack for (.+?)% Piercing \+ (.+?)% Drain instead\.$/,
    selfNotHasApply:       /^If self does not have (.+?), Apply (.+?) to the primary target\.$/,
    selfHasApplyCountDur:  /^If self has (.+?), Apply (\d+) (.+?) for (\d+) turns to the primary target\.$/,
    modeGainCount:         /^In (.+?), Gain (\d+) (.+?)\.$/,
    modeSelfHasApply:      /^In (.+?), If self has (.+?), Apply (.+?) to the primary target\.$/,
    onAssistEnergy:        /^On (.+?) assist, Generate \+(\d+) Ability Energy for self\.$/,
    modeReduceSpeedPerAlly:/^In (.+?), Reduce Speed Bar by (\d+)% for each (.+?) ally\.$/,
    healthHealAllies:      /^If this character has less than (\d+)% Health, Heal allies for (\d+)% of Max Health\.$/,
    modeIgnoresDefUp:      /^On (.+?), this attack ignores Defense Up\.$/,
    // --- Batch 3 patterns (LokiTeen, Kahhori, Odin, BetaRayBill, PeniParker) ---
    // LokiTeen
    modeIfSelfHasCountDmg: /^In (.+?), If self has (\d+)\+ (.+?), \+(\d+)% damage\.$/,
    clearPosTarget:        /^Clear (\d+) positive effect\(s\) from the primary target\.$/,
    applyAlliesNamed:      /^Apply (.+?) to allies\.$/,
    clearNegAllies:        /^Clear (\d+) negative effect\(s\) from allies\.$/,
    applyMostInjured:      /^Apply (.+?) to the most injured ally\.$/,
    clearNegMostInjured:   /^Clear (\d+) negative effect\(s\) from the most injured ally\.$/,
    modeApplyRandomTraitAlly: /^In (.+?), Apply \+(\d+) (.+?) to a random (.+?) ally\.$/,
    // Kahhori
    targetNotTraitDrain:   /^If the primary target is not (.+?), Drain (\d+)% of target's Max Health\.$/,
    targetTraitDrain:      /^If the primary target is (.+?), Drain (\d+)% of target's Max Health\.$/,
    notModeFlip:           /^Not in (.+?), Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    modeFlipAll:           /^In (.+?), Flip all positive effect\(s\) to negative on the primary target\.$/,
    targetHasApply:        /^If the primary target has (.+?), Apply (.+?) to the primary target\.$/,
    targetNoPosApply:      /^If the primary target has no positive effects, Apply (.+?) to the primary target\.$/,
    applyUpToMaxRandomAlly:/^Apply \+(\d+) (.+?), up to a maximum of (\d+) to a random ally\.$/,
    prolongPosExcluding:   /^Prolong the duration of all positive effects, excluding (.+?) by (\d+) on allies\.$/,
    onAssistProlongPos:    /^On Assist, Prolong the duration of all positive effects, excluding (.+?) by (\d+) on allies\.$/,
    // Odin
    forcedDmgInstead:      /^When forced to attack an ally, attack for (\d+)% damage instead\.$/,
    otherwiseDrain:        /^Otherwise, Drain (\d+)% of target's Max Health\.$/,
    anyEnemyHasClearPos:   /^If any enemy has positive effects, Clear (\d+) positive effect\(s\) from the primary target\.$/,
    clearNegRandomAlly:    /^Clear (\d+) negative effect\(s\) from a random ally\.$/,
    triggerBattlefield:    /^Trigger battlefield effect\.$/,
    noteIgnoresDefUp:      /^This attack ignores Defense Up\.$/,
    // BetaRayBill
    targetHasOrDmg:        /^If target has (.+?) or target has (.+?), \+(\d+)% damage\.$/,
    flipAllPos:            /^Flip all positive effect\(s\) to negative on the primary target\.$/,
    genEnergyAllAllies:    /^Generate \+(\d+) Ability Energy for all allies\.$/,
    noteTargetHasOrCantBlock: /^If target has (.+?) or (.+?), this attack cannot be blocked\.$/,
    // PeniParker
    selfHasDmgBoost:       /^If self has (.+?), \+(\d+)% damage\.$/,
    clearAllPosTarget:     /^Clear all positive effect\(s\) from the primary target\.$/,
    ifTraitAlliesApplyMax: /^If (\d+)\+ (.+?) allies, Apply \+(\d+) (.+?), up to a maximum of (\d+) to allies\.$/,
    applyMaxRandomTraitAlly: /^Apply \+(\d+) (.+?), up to a maximum of (\d+) to a random (.+?) ally\.$/,
    genEnergyTraitAllies:  /^Generate \+(\d+) Ability Energy for (.+?) allies\.$/,
    // --- Batch 4 patterns ---
    // Group 1: Standalone flips
    flipCountPos:          /^Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    modeFlipCount:         /^In (.+?), Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    // Group 2: On-trigger effects
    onCritReduceSpeed:     /^On Crit, Reduce Speed Bar by (\d+)%\.$/,
    onCritApply:           /^On Crit, Apply \+(\d+) (.+?) to the primary target\.$/,
    onAssistPiercing:      /^On Assist, \+(\d+)% Piercing\.$/,
    onCounterChanceGain:   /^On Counter, (\d+)% chance to Gain \+(\d+) (.+?)\.$/,
    // Group 3: Steal, Barrier, Energy
    stealPosExcluding:     /^Steal (\d+) positive effect\(s\) from the primary target and give to allies, excluding (.+?)\.$/,
    barrierAllies:         /^Barrier for (\d+)% of Max Health to allies\.$/,
    barrierMostInjuredNonSummon: /^Barrier for (\d+)% of Max Health to the most injured non-Summoned ally\.$/,
    genEnergyRandomAlly:   /^Generate \+(\d+) Ability Energy for a random ally\.$/,
    // Group 4: Self-condition + Duration + Misc
    selfHasReduceDur:      /^If self has (.+?), Reduce the duration of (.+?) by (\d+) on allies\.$/,
    prolongNegExcluding:   /^Prolong the duration of all negative effects, excluding (.+?) by (\d+)\.$/,
    drainDmgDealt:         /^Drain (\d+)% of damage dealt as Health\.$/,
    drainFlat:             /^Drain (\d+)% of target's Max Health\.$/,
    chanceApply:           /^(\d+)% chance to Apply (.+?) to the primary target\.$/,
    modeReduceSpeed:       /^In (.+?), Reduce Speed Bar by (\d+)%\.$/,
    modeGain:              /^In (.+?), Gain (.+?)\.$/,
    clearAllProcTarget:    /^Clear all (.+?) from the primary target\.$/,
    applyRandomAlly:       /^Apply (.+?) to a random ally\.$/,
    attackAdditional:      /^Attack an additional enemy\.$/,
    copyNegExcluding:      /^Copy (\d+) negative effect\(s\) from the primary target, excluding (.+?)\.$/,
    noteDebuffsNotResisted:/^Debuffs from this attack cannot be resisted\.$/,
    targetTraitReduceSpeed:/^If the primary target is (.+?), Reduce Speed Bar by (\d+)%\.$/,
    modeStatPerAlly:       /^In (.+?), \+(\d+)% (.+?) for each (.+?) ally\.$/,
    modeReviveAt:          /^In (.+?), Revive (.+?) at (\d+)% Health\.$/,
    // --- Batch 5 patterns ---
    // Group 1: Hercules steal
    modeTraitAllyStealAllExcl: /^In (.+?), If (\d+)\+ (.+?) allies, If (.+?) is an ally, Steal all positive effect\(s\) from the primary target and give to allies, excluding (.+?)\.$/,
    modeTraitAllyStealProc:    /^In (.+?), If (\d+)\+ (.+?) allies, If (.+?) is an ally, Steal (.+?) from the primary target and give to allies\.$/,
    // Group 2: Mode + apply/clear combos
    modeApplyPlus:             /^In (.+?), Apply \+(\d+) (.+?) to the primary target\.$/,
    modeApplyProc:             /^In (.+?), Apply (.+?) to the primary target\.$/,
    modeApplyAllies:           /^In (.+?), Apply \+(\d+) (.+?) to allies\.$/,
    modeClearCountTarget:      /^In (.+?), Clear (\d+) (.+?) from the primary target\.$/,
    // Group 3: Otherwise patterns
    otherwiseApplyPlus:        /^Otherwise, Apply \+(\d+) (.+?) to the primary target\.$/,
    otherwiseApplyProc:        /^Otherwise, Apply (.+?) to the primary target\.$/,
    otherwiseModeClearAllPos:  /^Otherwise, In (.+?), Clear all positive effect\(s\) from the primary target\.$/,
    // Group 4: Self/Target condition variants
    clearFromSelf:             /^Clear all (.+?) from self\.$/,
    clearCountProcTarget:      /^Clear (\d+) (.+?) from the primary target\.$/,
    selfNotHasClearNeg:        /^If self does not have (.+?), Clear all negative effect\(s\) from allies\.$/,
    selfNotHasApplyMaxAllies:  /^If self does not have (.+?), Apply \+(\d+) (.+?), up to a maximum of (\d+) to allies\.$/,
    targetHasReduceSpeed:      /^If the primary target has (.+?), Reduce Speed Bar by (\d+)%\.$/,
    targetHasApplyAllies:      /^If the primary target has (.+?), Apply \+(\d+) (.+?), up to a maximum of (\d+) to allies\.$/,
    targetTraitGainMax:        /^If the primary target is (.+?), Gain \+(\d+) (.+?), up to a maximum of (\d+)\.$/,
    // Group 5: Mode + trigger combos
    modeOnCritApply:           /^In (.+?), On Crit, Apply \+(\d+) (.+?) to the primary target\.$/,
    notModeOnCritReduceSpeed:  /^Not in (.+?), On Crit, Reduce Speed Bar by (\d+)%\.$/,
    modeCallAssist:            /^In (.+?), Call a random (.+?) ally to assist\.$/,
    modeNoteCantDodge:         /^In (.+?), this attack cannot be dodged\.$/,
    modeTargetHasReduceDur:    /^In (.+?), If the primary target has (.+?), Reduce the duration of (.+?) by (\d+)\.$/,
    modeProlongNeg:            /^In (.+?), Prolong the duration of negative effects by (\d+)\.$/,
    notModeProlongNegExcl:     /^Not in (.+?), Prolong the duration of all negative effects, excluding (.+?) by (\d+)\.$/,
    // Group 6: Misc
    stealAllExcluding:         /^Steal all positive effect\(s\) from the primary target, excluding (.+?)\.$/,
    stealAllGiveExcluding:     /^Steal all positive effect\(s\) from the primary target and give to allies, excluding (.+?)\.$/,
    transferAllPos:            /^Transfer all positive effect\(s\) from self as negative effects\.$/,
    applyMostInjuredTrait:     /^Apply (\d+) (.+?) to the most injured (.+?) ally\.$/,
    onAssistApplyMaxAllies:    /^On Assist, Apply \+(\d+) (.+?), up to a maximum of (\d+) to allies\.$/,
    selfHasMoreModeProlongNeg: /^If self has more than (\d+) (.+?), In (.+?), Prolong the duration of negative effects by (\d+)\.$/,
    selfHasMoreNotModeProlongNegExcl: /^If self has more than (\d+) (.+?), Not in (.+?), Prolong the duration of all negative effects, excluding (.+?) by (\d+)\.$/,
    barrierMostInjured:        /^Barrier for (\d+)% of Max Health to the most injured ally\.$/,
    onAssistDmg:               /^On Assist, \+(\d+)% damage\.$/,
    // --- Batch 6 patterns ---
    onTriggerGainPlus:         /^On (Counter|Crit), Gain \+(\d+) (.+?)\.$/,
    flipNegToPosAllies:        /^Flip (\d+) negative effect\(s\) to positive on allies\.$/,
    stealProcGiveAllies:       /^Steal (.+?) from the primary target and give to allies\.$/,
    selfHasCritBoost:          /^If self has (.+?), \+(\d+)% Crit Chance\.$/,
    traitAllyExistsDmg:        /^If an? (.+?) ally exists, \+(\d+)% damage\.$/,
    applyProcMostInjuredTrait: /^Apply (.+?) to the most injured (.+?) ally\.$/,
    // --- Batch 7 patterns ---
    applyProcRandomTraitAlly:  /^Apply (.+?) to a random (.+?) ally\.$/,
    modeStatBoost:             /^In (.+?), \+(\d+)% (.+?)\.$/,
    ifAllyNoteAttackCant:      /^If (.+?) is an ally, this attack cannot be (.+?)\.$/,
    statPerTraitAlly:          /^\+(\d+)% (.+?) for each (.+?) ally\.$/,
    genEnergyForNamed:         /^Generate \+(\d+) Ability Energy for (.+?)\.$/,
    healRandomTraitAlly:       /^Heal a random (.+?) ally for (\d+)% of Max Health\.$/,
    targetHasStatBoost:        /^If (?:the primary )?target has (.+?), \+(\d+)% (.+?)\.$/,
    flipNegToPosRandomTraitAlly: /^Flip (\d+) negative effect\(s\) to positive on a random (.+?) ally\.$/,
    drainRedistribute:         /^Drain (\d+)% of target's Max Health and redistribute to (.+?)\.$/,
    selfNotHasApplyAllies:     /^If self does not have (.+?), Apply (.+?) to allies\.$/,
    selfIsTraitDmg:            /^If self is (.+?), \+(\d+)% damage\.$/,
    healAllies:                /^Heal allies for (\d+)% of Max Health\.$/,
    stealCountExcluding:       /^Steal (\d+) positive effect\(s\) from the primary target, excluding (.+?)\.$/,
    onCritApplyMaxAllies:      /^On Crit, Apply \+(\d+) (.+?), up to a maximum of (\d+) to allies\.$/,
    modeGenEnergyTraitAllies:  /^In (.+?), Generate \+(\d+) Ability Energy for (.+?) allies\.$/,
    // --- Batch 8 patterns ---
    ifTraitAlliesApplyProc:    /^If (\d+)\+ (.+?) allies, Apply (.+?) to the primary target\.$/,
    ifTraitAlliesGain:         /^If (\d+)\+ (.+?) allies, Gain (.+?)\.$/,
    ifTraitAlliesDmg:          /^If (\d+)\+ (.+?) allies, \+(\d+)% damage\.$/,
    ifTraitAlliesFlip:         /^If (\d+)\+ (.+?) allies, Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    dmgPerEffectOnTarget:      /^\+(\d+)% damage for each (positive|negative) effect on the primary target\.$/,
    reduceSpeedPerTraitAlly:   /^Reduce Speed Bar by (\d+)% for each (.+?) ally\.$/,
    targetHasGainSpeedBar:     /^If the primary target has (.+?), Gain (\d+)% Speed Bar\.$/,
    targetHasGenEnergy:        /^If the primary target has (.+?), Generate \+(\d+) Ability Energy for all allies\.$/,
    targetHasFlipPos:          /^If the primary target has (.+?), Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    targetNotHasApply:         /^If the primary target does not have (.+?), Apply (.+?) to the primary target\.$/,
    otherwiseFlipPos:          /^Otherwise, Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    modeNoteAttackCant:        /^In (.+?), this attack cannot be (.+?)\.$/,
    // --- Batch 9 patterns ---
    barrierSelf:               /^Barrier for (\d+)% of Max Health\.$/,
    prolongProcBy:             /^Prolong the duration of (.+?) by (\d+)\.$/,
    notModeChanceApply:        /^Not in (.+?), (\d+)% chance to Apply (.+?) to the primary target\.$/,
    modeChanceGain:            /^In (.+?), (\d+)% chance to Gain (.+?)\.$/,
    clearCountProcAllies:      /^Clear (\d+) (.+?) from allies\.$/,
    applyProcToEnemies:        /^Apply (.+?) to (\d+) enemies\.$/,
    applyCountToEnemies:       /^Apply (\d+) (.+?) to (\d+) enemies\.$/,
    applyProcDurToEnemies:     /^Apply (.+?) for (\d+) turns to (\d+) enemies\.$/,
    clearNegRandomTraitAlly:   /^Clear (\d+) negative effect\(s\) from a random (.+?) ally\.$/,
    clearNegMostInjuredTraitAlly: /^Clear (\d+) negative effect\(s\) from the most injured (.+?) ally\.$/,
    onCritStealAllExcl:        /^On Crit, Steal all positive effect\(s\) from the primary target, excluding (.+?)\.$/,
    onAssistApplyMaxTarget:    /^On Assist, Apply \+(\d+) (.+?), up to a maximum of (\d+) to the primary target\.$/,
    copyPosGiveExcl:           /^Copy (\d+) positive effect\(s\) from the primary target and give to allies, excluding (.+?)\.$/,
    targetTraitGainProc:       /^If the primary target is (.+?), Gain (.+?)\.$/,
    flipPosNEnemies:           /^Flip (\d+) positive effect\(s\) to negative on (\d+) enemies\.$/,
    barrierRandomTraitAlly:    /^Barrier for (\d+)% of Max Health to a random (.+?) ally\.$/,
    // --- Batch 10 patterns ---
    piercingAdditional:        /^\+(\d+)% Piercing to additional enemies\.$/,
    dmgPierceAdditional:       /^\+(\d+)% damage \+ (\d+)% Piercing to additional enemies\.$/,
    modeApplyPlusRandomAlly:   /^In (.+?), Apply \+(\d+) (.+?) to a random ally\.$/,
    drainAlliesHealth:         /^Drain (\d+)% of allies' Max Health\.$/,
    ifAllyNoteCantMiss:        /^If (.+?) is an ally, this attack cannot miss\.$/,
    targetHasAttackPierceInstead: /^If the primary target has (.+?), attack for (\d+)% Piercing instead\.$/,
    targetHasDrainRedistribute:/^If the primary target has (.+?), Drain (\d+)% of target's Max Health and redistribute to (.+?)\.$/,
    modeOnCritClearNeg:        /^In (.+?), On Crit, Clear (\d+) negative effect\(s\) from allies\.$/,
    ifAllyStealAllGiveExcl:    /^If (.+?) is an ally, Steal all positive effect\(s\) from the primary target and give to allies, excluding (.+?)\.$/,
    applyProcToAllyHighest:    /^Apply (.+?) to the (.+?) ally with the highest (.+?)\.$/,
    applyProcRandomAllyBelowHealth: /^Apply (.+?) to a random ally below (\d+)% Health\.$/,
    allAlliesHaveGainSpeedBar: /^If all allies have (.+?), Gain (\d+)% Speed Bar\.$/,
    targetHasStealCountExcl:   /^If the primary target has (.+?), Steal (\d+) positive effect\(s\) from the primary target, excluding (.+?)\.$/,
    selfHasLessThanApplyMaxAllies: /^If self has less than (\d+) (.+?), Apply \+(\d+) (.+?), up to a maximum of (\d+) to allies\.$/,
    targetTraitApplyProcAllyHighest: /^If the primary target is (.+?), Apply (.+?) to the ally with the highest (.+?)\.$/,
    modeIfTraitAlliesStealProc:/^In (.+?), If (\d+)\+ (.+?) allies, Steal (.+?) from the primary target and give to allies\.$/,
    // --- Batch 11 patterns ---
    targetHasPosClearPos:      /^If the primary target has positive effects, Clear (\d+) positive effect\(s\) from the primary target\.$/,
    modeSubTargetHasDrain:     /^In (.+?), (.+?), If the primary target has (.+?), Drain (\d+)% of target's Max Health\.$/,
    modeSubReduceDur:          /^In (.+?), (.+?), Reduce the duration of (.+?) by (\d+)\.$/,
    modeApplyPlusRandomAllyExclSelf: /^In (.+?), Apply \+(\d+) (.+?) to a random ally \(excluding self\)\.$/,
    modeOrSubClearNegRandomTraitAlly: /^In (.+?) or (.+?), (.+?), Clear (\d+) negative effect\(s\) from a random (.+?) ally\.$/,
    selfHasClearPos:           /^If self has (.+?), Clear (\d+) positive effect\(s\) from the primary target\.$/,
    selfNotHasFlipPos:         /^If self does not have (.+?), Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    selfHasClearNegSelf:       /^If self has (.+?), Clear all negative effect\(s\) from self\.$/,
    selfHasClearCountFromSelf: /^If self has (.+?), Clear (\d+) (.+?) from self\.$/,
    targetHasClearAllProc:     /^If the primary target has (.+?), Clear all (.+?) from the primary target\.$/,
    onAssistTargetHasClearAllProc: /^On Assist, If the primary target has (.+?), Clear all (.+?) from the primary target\.$/,
    targetTraitApplyCountDur:  /^If the primary target is (.+?), Apply (\d+) (.+?) for (\d+) turns to the primary target\.$/,
    targetTraitApplyCount:     /^If the primary target is (.+?), Apply (\d+) (.+?) to the primary target\.$/,
    onCritBarrierAllies:       /^On Crit, Barrier for (\d+)% of Max Health to allies\.$/,
    ifTraitAlliesCritChance:   /^If (\d+)\+ (.+?) allies, \+(\d+)% Crit Chance\.$/,
    ifTraitAlliesCritPerAlly:  /^If (\d+)\+ (.+?) allies, \+(\d+)% Crit Chance for each (.+?) ally\.$/,
    // --- Batch 12 patterns ---
    onCritGenEnergyRandomAlly: /^On Crit, Generate \+(\d+) Ability Energy for a random ally\.$/,
    onCounterOnCritGenEnergy:  /^On Counter, On Crit, Generate \+(\d+) Ability Energy for a random ally\.$/,
    removeBarrierTarget:       /^Remove Barrier from the primary target\.$/,
    modeSubFlipNegToPosAllies: /^In (.+?), (.+?), Flip all negative effect\(s\) to positive on allies\.$/,
    modeSubTargetNotTraitDrain:/^In (.+?), (.+?), If the primary target is not (.+?), Drain (\d+)% of target's Max Health\.$/,
    targetNotHasClearPos:      /^If the primary target does not have (.+?), Clear (\d+) positive effect\(s\) from the primary target\.$/,
    selfHasGainSpeedBar:       /^If self has (.+?), Gain (\d+)% Speed Bar\.$/,
    selfHasGainCount:          /^If self has (.+?), Gain (\d+) (.+?)\.$/,
    healTarget:                /^Heal the primary target for (\d+)% of Max Health\.$/,
    ifAllyApplyCount:          /^If (.+?) is an ally, Apply (\d+) (.+?) to the primary target\.$/,
    notModeChanceGain:         /^Not in (.+?), (\d+)% chance to Gain (.+?)\.$/,
    ifAllyDmgPierce:           /^If (.+?) is an ally, \+(\d+)% damage \+ (\d+)% Piercing\.$/,
    ifAllyApplyDur:            /^If (.+?) is an ally, Apply (.+?) for (\d+) turns to the primary target\.$/,
    selfIsTraitApplyProc:      /^If self is (.+?), Apply (.+?) to the primary target\.$/,
    selfNotTraitApplyProc:     /^If self is not (.+?), Apply (.+?) to the primary target\.$/,
    targetTraitApplyProc:      /^If the primary target is (.+?), Apply (.+?) to the primary target\.$/,
    // --- Batch 13 patterns ---
    targetTraitOrApplyCountDurInjured: /^If the primary target is (.+?) or (.+?), Apply (\d+) (.+?) for (\d+) turns to the most injured ally\.$/,
    onAssistModeOnCritApply:   /^On Assist, In (.+?), On Crit, Apply (.+?) to the primary target\.$/,
    otherwiseSelfOrTargetHasCrit: /^Otherwise, If self is (.+?) or target has (.+?), \+(\d+)% Crit Chance\.$/,
    healthOrChargedDmg:        /^If this character has (\d+)% or less Health or self has (.+?), \+(\d+)% damage\.$/,
    applyDurTraitAllyLowest:   /^Apply (.+?) for (\d+) turns to the (.+?) ally with the lowest (.+?)\.$/,
    otherwiseTargetHasApplyAllies: /^Otherwise, If the primary target has (.+?), Apply \+(\d+) (.+?) to allies\.$/,
    modeIfTraitAlliesCallHighest: /^In (.+?), If (\d+)\+ (.+?) allies, Call the (.+?) ally with the highest (.+?) to assist\.$/,
    modeOnAssistTypeGenTraitAlly: /^In (.+?), On (.+?) assist, Generate \+(\d+) Ability Energy for a random (.+?) ally\.$/,
    selfHasProcCritPerTraitOrAlly: /^If self has (.+?), \+(\d+)% Crit Chance for each (.+?) or (.+?) ally\.$/,
    modeHealthReduceDurRandomTraitAlly: /^In (.+?), If this character has more than (\d+)% Health, Reduce the duration of negative effects by (\d+) on a random (.+?) ally\.$/,
    targetHasAndHasRemoveBarrier: /^If the primary target has (.+?) and has (.+?), Remove Barrier from the primary target\.$/,
    selfHasCountAnyEnemyFlip:  /^If self has (\d+)\+ (.+?), If any enemy has positive effects, Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    selfLessCountAnyEnemyFlip: /^If self has less than (\d+) (.+?), If any enemy has positive effects, Flip (\d+) positive effect\(s\) to negative on the primary target\.$/,
    modeOnCritProlongNegExcl:  /^In (.+?), On Crit, Prolong the duration of all negative effects, excluding (.+?) by (\d+)\.$/,
    modeOnCritProlongProc:     /^In (.+?), On Crit, Prolong the duration of (.+?) by (\d+)\.$/,
    modeBarrierRandomAlly:     /^In (.+?), Barrier for (\d+)% of Max Health to a random ally\.$/,
    // --- Batch 14 patterns ---
    modeEnergyFullOnCritGenRandomAlly: /^In (.+?), If Ability Energy is full, On Crit, Generate \+(\d+) Ability Energy for a random ally\.$/,
    modeEnergyFullOnCritGenSelf: /^In (.+?), If Ability Energy is full, On Crit, Generate \+(\d+) Ability Energy for self\.$/,
    healthLessThanDrain:       /^If this character has less than (\d+)% Health, \+(\d+)% Drain\.$/,
    healthOrMoreApplyDurTarget:/^If this character has (\d+)% or more Health, Apply (.+?) for (\d+) turns to the primary target\.$/,
    barrierOrMoreApplyDurAllies:/^If this character has (\d+)% or more Barrier, Apply (.+?) for (\d+) turns to allies\.$/,
    barrierOrMoreGainDur:      /^If this character has (\d+)% or more Barrier, Gain (.+?) for (\d+) turns\.$/,
    onTypeAssistGenAllAllies:  /^On (.+?) assist, Generate \+(\d+) Ability Energy for all allies\.$/,
    onTypeAssistGenChar:       /^On (.+?) assist, Generate \+(\d+) Ability Energy for (.+?)\.$/,
    ifNotFacingApplyTarget:    /^If not facing (.+?), Apply (.+?) to the primary target\.$/,
    targetTraitApplyInjuredAlly:/^If the primary target is (.+?), Apply (.+?) to the most injured ally\.$/,
    copyAllGiveAlliesExclTwo:  /^Copy all positive effect\(s\) from the primary target and give to allies, excluding (.+?) and (.+?)\.$/,
    noteCantCritHit:           /^This attack cannot critically hit\.$/,
    modeApplyAllies:           /^In (.+?), Apply (.+?) to allies\.$/,
    targetTraitApplyCountMaxInjured: /^If the primary target is (.+?), Apply \+(\d+) (.+?), up to a maximum of (\d+) to the most injured ally\.$/,
    modeGenEnergyChar:         /^In (.+?), Generate \+(\d+) Ability Energy for (.+?)\.$/,
    targetTraitApplyInjuredWithout: /^If the primary target is (.+?), Apply (.+?) to the most injured without (.+?) ally\.$/,
    modeHealRandomTraitAlly:   /^In (.+?), Heal a random (.+?) ally for (\d+)% of Max Health\.$/,
    selfHasOrLessApplyMaxAllies:/^If self has (\d+) or less (.+?), Apply \+(\d+) (.+?), up to a maximum of (\d+) to allies\.$/,
    selfHasProcChanceApplyTarget:/^If self has (.+?), (\d+)% chance to Apply (.+?) to the primary target\.$/,
    otherwiseSelfHasChanceGain:/^Otherwise, If self has (.+?), (\d+)% chance to Gain (.+?)\.$/,
    otherwiseSelfHasHealInjured:/^Otherwise, If self has (.+?), Heal the most injured ally for (\d+)% of Max Health\.$/,
  };

  const SENTENCE_TEMPLATES = {
    // ==================== FRENCH ====================
    fr: {
      damageLine: (dmg, pierce, drain) => {
        const p = [];
        if (dmg > 0) p.push(`<span class="msf-iso8-damage-value">${dmg} %</span> de dégâts`);
        if (pierce > 0) p.push(`<span class="msf-iso8-piercing-value">${pierce} %</span> de dégâts perforants`);
        if (drain > 0) p.push(`<span class="msf-iso8-drain-value">${drain} %</span> de drain de vie`);
        return p.length > 0 ? `⚔️ Attaque la cible principale et inflige ${p.join(' + ')}` : null;
      },
      title: 'ISO-8 Contre/Appui',
      patterns: [
        { match: _P.forcedDmgPierce, replace: (m, d, p, tr) => `Lors d'une attaque forcée contre un allié, inflige ${d} % de dégâts + ${p} % de dégâts perforants aux personnages ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.forcedDmg, replace: (m, d, tr) => `Lors d'une attaque forcée contre un allié, inflige ${d} % de dégâts aux personnages ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.flipEffects, replace: (m, n, c) => `Si ${n} est parmi les alliés, convertit ${c} effets bénéfiques aléatoires en effets nuisibles sur la cible principale.` },
        { match: _P.flipRandom, replace: (m, n, c) => `Si ${n} est parmi les alliés, convertit ${c} effets bénéfiques aléatoires en effets nuisibles sur la cible principale.` },
        { match: _P.applyProc, replace: (m, pr) => `Applique ${pr} à la cible principale.` },
        { match: _P.applyCount, replace: (m, c, pr) => `Applique ${c} fois ${pr} à la cible principale.` },
        { match: _P.applyPlusDur, replace: (m, c, pr, t) => `Applique +${c} ${pr} pendant ${t} tours à la cible principale.` },
        { match: _P.applyPlus, replace: (m, c, pr) => `Applique +${c} ${pr} à la cible principale.` },
        { match: _P.applyAllies, replace: (m, c, pr) => `Applique +${c} ${pr} aux alliés.` },
        { match: _P.gainPlus, replace: (m, c, pr) => `Obtient +${c} ${pr}.` },
        { match: _P.gainSpeedBar, replace: (m, p) => `Obtient ${p} % de jauge de vitesse.` },
        { match: _P.reduceSpeedBar, replace: (m, p) => `Réduit la jauge de vitesse de ${p} %.` },
        { match: _P.gain, replace: (m, pr) => `Obtient ${pr}.` },
        { match: _P.healthGain, replace: (m, p, pr) => `Si ce personnage a ${p} % de vie ou moins, obtient ${pr}.` },
        { match: _P.healthGeneric, replace: (m, p, r) => `Si ce personnage a ${p} % de vie ou moins, ${r}` },
        // --- New patterns ---
        { match: _P.forcedPierceOnly, replace: (m, p, tr) => `Lors d'une attaque forcée contre un allié, inflige ${p} % de dégâts perforants aux personnages ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.ifAllyApplyRandom, replace: (m, n, pr) => `Si ${n} est parmi les alliés, applique ${pr} à un allié aléatoire.` },
        { match: _P.selfHasApplyCountDur, replace: (m, proc, c, pr, t) => `Si ce personnage a ${proc}, applique ${c} fois ${pr} pendant ${t} tours à la cible principale.` },
        { match: _P.selfHasApply, replace: (m, proc, pr) => `Si ce personnage a ${proc}, applique ${pr} à la cible principale.` },
        { match: _P.selfHasClear, replace: (m, proc, c, pr) => `Si ce personnage a ${proc}, retire ${c} ${pr} des alliés.` },
        { match: _P.selfHasAttackInstead, replace: (m, proc, p, d) => `Si ce personnage a ${proc}, attaque à la place pour ${p} % de dégâts perforants + ${d} % de drain de vie.` },
        { match: _P.selfNotHasApply, replace: (m, proc, pr) => `Si ce personnage n'a pas ${proc}, applique ${pr} à la cible principale.` },
        { match: _P.modeGainCount, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'fr')}, obtient ${c} fois ${pr}.` },
        { match: _P.modeSelfHasApply, replace: (m, mode, proc, pr) => `${_modeLoc(mode, 'fr')}, si ce personnage a ${proc}, applique ${pr} à la cible principale.` },
        { match: _P.onAssistEnergy, replace: (m, type, c) => `Sur appui ${_modeLoc(type, 'fr')}, génère +${c} énergie de capacité pour soi.` },
        { match: _P.modeReduceSpeedPerAlly, replace: (m, mode, p, tr) => `${_modeLoc(mode, 'fr')}, réduit la jauge de vitesse de ${p} % par allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.healthHealAllies, replace: (m, p, h) => `Si ce personnage a moins de ${p} % de vie, soigne les alliés de ${h} % de la vie max.` },
        { match: _P.modeIgnoresDefUp, replace: (m, mode) => `${_modeLoc(mode, 'fr')}, cette attaque ignore Défense augmentée.` },
        // --- Batch 3 patterns ---
        { match: _P.modeIfSelfHasCountDmg, replace: (m, mode, c, proc, d) => `${_modeLoc(mode, 'fr')}, si ce personnage a ${c}+ ${proc}, +${d} % de dégâts.` },
        { match: _P.clearPosTarget, replace: (m, c) => `Retire ${c} effet(s) bénéfique(s) de la cible principale.` },
        { match: _P.applyAlliesNamed, replace: (m, pr) => `Applique ${pr} aux alliés.` },
        { match: _P.clearNegAllies, replace: (m, c) => `Retire ${c} effet(s) nuisible(s) des alliés.` },
        { match: _P.applyMostInjured, replace: (m, pr) => `Applique ${pr} à l'allié le plus blessé.` },
        { match: _P.clearNegMostInjured, replace: (m, c) => `Retire ${c} effet(s) nuisible(s) de l'allié le plus blessé.` },
        { match: _P.modeApplyRandomTraitAlly, replace: (m, mode, c, pr, tr) => `${_modeLoc(mode, 'fr')}, applique +${c} ${pr} à un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire.` },
        { match: _P.targetNotTraitDrain, replace: (m, tr, p) => `Si la cible principale n'est pas ${tr}, draine ${p} % de la vie maximale de la cible.` },
        { match: _P.targetTraitDrain, replace: (m, tr, p) => `Si la cible principale est ${tr}, draine ${p} % de la vie maximale de la cible.` },
        { match: _P.notModeFlip, replace: (m, mode, c) => `${_notModeLoc(mode, 'fr')}, convertit ${c} effet(s) bénéfique(s) en nuisible(s) sur la cible principale.` },
        { match: _P.modeFlipAll, replace: (m, mode) => `${_modeLoc(mode, 'fr')}, convertit tous les effets bénéfiques en nuisibles sur la cible principale.` },
        { match: _P.targetNoPosApply, replace: (m, pr) => `Si la cible principale n'a aucun effet bénéfique, applique ${pr} à la cible principale.` },
        { match: _P.targetHasApply, replace: (m, proc, pr) => `Si la cible principale a ${proc}, applique ${pr} à la cible principale.` },
        { match: _P.applyUpToMaxRandomAlly, replace: (m, c, pr, max) => `Applique +${c} ${pr}, jusqu'à un maximum de ${max} à un allié aléatoire.` },
        { match: _P.onAssistProlongPos, replace: (m, proc, c) => `En assistance, prolonge la durée de tous les effets bénéfiques, sauf ${proc}, de ${c} sur les alliés.` },
        { match: _P.prolongPosExcluding, replace: (m, proc, c) => `Prolonge la durée de tous les effets bénéfiques, sauf ${proc}, de ${c} sur les alliés.` },
        { match: _P.forcedDmgInstead, replace: (m, p) => `Lors d'une attaque forcée contre un allié, attaque pour ${p} % de dégâts à la place.` },
        { match: _P.otherwiseDrain, replace: (m, p) => `Sinon, draine ${p} % de la vie maximale de la cible.` },
        { match: _P.anyEnemyHasClearPos, replace: (m, c) => `Si un ennemi a des effets bénéfiques, retire ${c} effet(s) bénéfique(s) de la cible principale.` },
        { match: _P.clearNegRandomAlly, replace: (m, c) => `Retire ${c} effet(s) nuisible(s) d'un allié aléatoire.` },
        { match: _P.triggerBattlefield, replace: () => `Déclenche l'effet du champ de bataille.` },
        { match: _P.noteIgnoresDefUp, replace: () => `Cette attaque ignore Défense augmentée.` },
        { match: _P.targetHasOrDmg, replace: (m, pr1, pr2, d) => `Si la cible a ${pr1} ou ${pr2}, +${d} % de dégâts.` },
        { match: _P.flipAllPos, replace: () => `Convertit tous les effets bénéfiques en nuisibles sur la cible principale.` },
        { match: _P.genEnergyAllAllies, replace: (m, c) => `Génère +${c} énergie de capacité pour tous les alliés.` },
        { match: _P.noteTargetHasOrCantBlock, replace: (m, pr1, pr2) => `Si la cible a ${pr1} ou ${pr2}, cette attaque ne peut pas être bloquée.` },
        { match: _P.selfHasDmgBoost, replace: (m, proc, d) => `Si ce personnage a ${proc}, +${d} % de dégâts.` },
        { match: _P.clearAllPosTarget, replace: () => `Retire tous les effets bénéfiques de la cible principale.` },
        { match: _P.ifTraitAlliesApplyMax, replace: (m, c, tr, n, pr, max) => `Si ${c}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, applique +${n} ${pr}, jusqu'à un maximum de ${max} aux alliés.` },
        { match: _P.applyMaxRandomTraitAlly, replace: (m, c, pr, max, tr) => `Applique +${c} ${pr}, jusqu'à un maximum de ${max} à un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire.` },
        { match: _P.genEnergyTraitAllies, replace: (m, c, tr) => `Génère +${c} énergie de capacité pour les alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 4 patterns ---
        { match: _P.flipCountPos, replace: (m, c) => `Convertit ${c} effet(s) bénéfique(s) en nuisible(s) sur la cible principale.` },
        { match: _P.modeFlipCount, replace: (m, mode, c) => `${_modeLoc(mode, 'fr')}, convertit ${c} effet(s) bénéfique(s) en nuisible(s) sur la cible principale.` },
        { match: _P.onCritReduceSpeed, replace: (m, p) => `Sur coup critique, réduit la jauge de vitesse de ${p} %.` },
        { match: _P.onCritApply, replace: (m, c, pr) => `Sur coup critique, applique +${c} ${pr} à la cible principale.` },
        { match: _P.onAssistPiercing, replace: (m, p) => `En assistance, +${p} % de dégâts perforants.` },
        { match: _P.onCounterChanceGain, replace: (m, pct, c, pr) => `En contre, ${pct} % de chance d'obtenir +${c} ${pr}.` },
        { match: _P.stealPosExcluding, replace: (m, c, excl) => `Vole ${c} effet(s) bénéfique(s) de la cible principale et les donne aux alliés, sauf ${excl}.` },
        { match: _P.barrierAllies, replace: (m, p) => `Barrière de ${p} % de la vie max. aux alliés.` },
        { match: _P.barrierMostInjuredNonSummon, replace: (m, p) => `Barrière de ${p} % de la vie max. à l'allié non invoqué le plus blessé.` },
        { match: _P.genEnergyRandomAlly, replace: (m, c) => `Génère +${c} énergie de capacité pour un allié aléatoire.` },
        { match: _P.selfHasReduceDur, replace: (m, proc, proc2, c) => `Si ce personnage a ${proc}, réduit la durée de ${proc2} de ${c} sur les alliés.` },
        { match: _P.prolongNegExcluding, replace: (m, excl, c) => `Prolonge la durée de tous les effets nuisibles, sauf ${excl}, de ${c}.` },
        { match: _P.drainDmgDealt, replace: (m, p) => `Draine ${p} % des dégâts infligés en vie.` },
        { match: _P.drainFlat, replace: (m, p) => `Draine ${p} % de la vie maximale de la cible.` },
        { match: _P.chanceApply, replace: (m, pct, pr) => `${pct} % de chance d'appliquer ${pr} à la cible principale.` },
        { match: _P.modeReduceSpeed, replace: (m, mode, p) => `${_modeLoc(mode, 'fr')}, réduit la jauge de vitesse de ${p} %.` },
        { match: _P.modeGain, replace: (m, mode, pr) => `${_modeLoc(mode, 'fr')}, obtient ${pr}.` },
        { match: _P.clearAllProcTarget, replace: (m, pr) => `Retire tout ${pr} de la cible principale.` },
        { match: _P.applyRandomAlly, replace: (m, pr) => `Applique ${pr} à un allié aléatoire.` },
        { match: _P.attackAdditional, replace: () => `Attaque un ennemi supplémentaire.` },
        { match: _P.copyNegExcluding, replace: (m, c, excl) => `Copie ${c} effet(s) nuisible(s) de la cible principale, sauf ${excl}.` },
        { match: _P.noteDebuffsNotResisted, replace: () => `Les malus de cette attaque ne peuvent pas être résistés.` },
        { match: _P.targetTraitReduceSpeed, replace: (m, tr, p) => `Si la cible principale est ${tr}, réduit la jauge de vitesse de ${p} %.` },
        { match: _P.modeStatPerAlly, replace: (m, mode, p, stat, tr) => `${_modeLoc(mode, 'fr')}, +${p} % ${stat} par allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.modeReviveAt, replace: (m, mode, name, p) => `${_modeLoc(mode, 'fr')}, ressuscite ${name} à ${p} % de vie.` },
        // --- Batch 5 patterns ---
        { match: _P.modeTraitAllyStealAllExcl, replace: (m, mode, c, tr, ally, excl) => `${_modeLoc(mode, 'fr')}, si ${c}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, si ${ally} est allié, vole tous les effets bénéfiques de la cible principale et les donne aux alliés, sauf ${excl}.` },
        { match: _P.modeTraitAllyStealProc, replace: (m, mode, c, tr, ally, proc) => `${_modeLoc(mode, 'fr')}, si ${c}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, si ${ally} est allié, vole ${proc} de la cible principale et le donne aux alliés.` },
        { match: _P.modeApplyPlus, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'fr')}, applique +${c} ${pr} à la cible principale.` },
        { match: _P.modeApplyProc, replace: (m, mode, pr) => `${_modeLoc(mode, 'fr')}, applique ${pr} à la cible principale.` },
        { match: _P.modeApplyAllies, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'fr')}, applique +${c} ${pr} aux alliés.` },
        { match: _P.modeClearCountTarget, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'fr')}, retire ${c} ${pr} de la cible principale.` },
        { match: _P.otherwiseApplyPlus, replace: (m, c, pr) => `Sinon, applique +${c} ${pr} à la cible principale.` },
        { match: _P.otherwiseApplyProc, replace: (m, pr) => `Sinon, applique ${pr} à la cible principale.` },
        { match: _P.otherwiseModeClearAllPos, replace: (m, mode) => `Sinon, ${_modeLoc(mode, 'fr')}, retire tous les effets bénéfiques de la cible principale.` },
        { match: _P.clearFromSelf, replace: (m, pr) => `Retire tout ${pr} de soi.` },
        { match: _P.clearCountProcTarget, replace: (m, c, pr) => `Retire ${c} ${pr} de la cible principale.` },
        { match: _P.selfNotHasClearNeg, replace: (m, proc) => `Si ce personnage n'a pas ${proc}, retire tous les effets nuisibles des alliés.` },
        { match: _P.selfNotHasApplyMaxAllies, replace: (m, proc, c, pr, max) => `Si ce personnage n'a pas ${proc}, applique +${c} ${pr}, jusqu'à un maximum de ${max} aux alliés.` },
        { match: _P.targetHasReduceSpeed, replace: (m, proc, p) => `Si la cible principale a ${proc}, réduit la jauge de vitesse de ${p} %.` },
        { match: _P.targetHasApplyAllies, replace: (m, proc, c, pr, max) => `Si la cible principale a ${proc}, applique +${c} ${pr}, jusqu'à un maximum de ${max} aux alliés.` },
        { match: _P.targetTraitGainMax, replace: (m, tr, c, pr, max) => `Si la cible principale est ${tr}, obtient +${c} ${pr}, jusqu'à un maximum de ${max}.` },
        { match: _P.modeOnCritApply, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'fr')}, sur coup critique, applique +${c} ${pr} à la cible principale.` },
        { match: _P.notModeOnCritReduceSpeed, replace: (m, mode, p) => `${_notModeLoc(mode, 'fr')}, sur coup critique, réduit la jauge de vitesse de ${p} %.` },
        { match: _P.modeCallAssist, replace: (m, mode, tr) => `${_modeLoc(mode, 'fr')}, appelle un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire en assistance.` },
        { match: _P.modeNoteCantDodge, replace: (m, mode) => `${_modeLoc(mode, 'fr')}, cette attaque ne peut pas être esquivée.` },
        { match: _P.modeTargetHasReduceDur, replace: (m, mode, proc, proc2, c) => `${_modeLoc(mode, 'fr')}, si la cible principale a ${proc}, réduit la durée de ${proc2} de ${c}.` },
        { match: _P.modeProlongNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'fr')}, prolonge la durée des effets nuisibles de ${c}.` },
        { match: _P.notModeProlongNegExcl, replace: (m, mode, excl, c) => `${_notModeLoc(mode, 'fr')}, prolonge la durée de tous les effets nuisibles, sauf ${excl}, de ${c}.` },
        { match: _P.stealAllExcluding, replace: (m, excl) => `Vole tous les effets bénéfiques de la cible principale, sauf ${excl}.` },
        { match: _P.stealAllGiveExcluding, replace: (m, excl) => `Vole tous les effets bénéfiques de la cible principale et les donne aux alliés, sauf ${excl}.` },
        { match: _P.transferAllPos, replace: () => `Transfère tous les effets bénéfiques de soi en effets nuisibles.` },
        { match: _P.applyMostInjuredTrait, replace: (m, c, pr, tr) => `Applique ${c} ${pr} à l'allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} le plus blessé.` },
        { match: _P.onAssistApplyMaxAllies, replace: (m, c, pr, max) => `En assistance, applique +${c} ${pr}, jusqu'à un maximum de ${max} aux alliés.` },
        { match: _P.selfHasMoreModeProlongNeg, replace: (m, n, proc, mode, c) => `Si ce personnage a plus de ${n} ${proc}, ${_modeLoc(mode, 'fr')}, prolonge la durée des effets nuisibles de ${c}.` },
        { match: _P.selfHasMoreNotModeProlongNegExcl, replace: (m, n, proc, mode, excl, c) => `Si ce personnage a plus de ${n} ${proc}, ${_notModeLoc(mode, 'fr')}, prolonge la durée de tous les effets nuisibles, sauf ${excl}, de ${c}.` },
        { match: _P.barrierMostInjured, replace: (m, p) => `Barrière de ${p} % de la vie max. à l'allié le plus blessé.` },
        { match: _P.onAssistDmg, replace: (m, p) => `En assistance, +${p} % de dégâts.` },
        // --- Batch 6 patterns ---
        { match: _P.onTriggerGainPlus, replace: (m, trig, c, pr) => `${trig === 'Counter' ? 'En contre' : 'Sur coup critique'}, obtient +${c} ${pr}.` },
        { match: _P.flipNegToPosAllies, replace: (m, c) => `Convertit ${c} effet(s) nuisible(s) en bénéfique(s) sur les alliés.` },
        { match: _P.stealProcGiveAllies, replace: (m, pr) => `Vole ${pr} de la cible principale et le donne aux alliés.` },
        { match: _P.selfHasCritBoost, replace: (m, pr, p) => `Si ce personnage a ${pr}, +${p} % de chance de coup critique.` },
        { match: _P.traitAllyExistsDmg, replace: (m, tr, p) => `Si un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} existe, +${p} % de dégâts.` },
        { match: _P.applyProcMostInjuredTrait, replace: (m, pr, tr) => `Applique ${pr} à l'allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} le plus blessé.` },
        // --- Batch 7 patterns ---
        { match: _P.applyProcRandomTraitAlly, replace: (m, pr, tr) => `Applique ${pr} à un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire.` },
        { match: _P.modeStatBoost, replace: (m, mode, p, stat) => `${_modeLoc(mode, 'fr')}, +${p} % ${stat}.` },
        { match: _P.ifAllyNoteAttackCant, replace: (m, name, what) => `Si ${name} est parmi les alliés, cette attaque ne peut pas être ${what === 'dodged' ? 'esquivée' : what === 'blocked' ? 'bloquée' : what === 'missed' ? 'manquée' : what}.` },
        { match: _P.statPerTraitAlly, replace: (m, p, stat, tr) => `+${p} % ${stat} par allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.genEnergyForNamed, replace: (m, c, name) => `Génère +${c} énergie de capacité pour ${name}.` },
        { match: _P.healRandomTraitAlly, replace: (m, tr, p) => `Soigne un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire de ${p} % de la vie max.` },
        { match: _P.targetHasStatBoost, replace: (m, proc, p, stat) => `Si la cible a ${proc}, +${p} % ${stat}.` },
        { match: _P.flipNegToPosRandomTraitAlly, replace: (m, c, tr) => `Convertit ${c} effet(s) nuisible(s) en bénéfique(s) sur un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire.` },
        { match: _P.drainRedistribute, replace: (m, p, target) => `Draine ${p} % de la vie max. de la cible et redistribue aux alliés ${_traitLoc(target, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.selfNotHasApplyAllies, replace: (m, proc, pr) => `Si ce personnage n'a pas ${proc}, applique ${pr} aux alliés.` },
        { match: _P.selfIsTraitDmg, replace: (m, tr, p) => `Si ce personnage est ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % de dégâts.` },
        { match: _P.healAllies, replace: (m, p) => `Soigne les alliés de ${p} % de la vie max.` },
        { match: _P.stealCountExcluding, replace: (m, c, excl) => `Vole ${c} effet(s) bénéfique(s) de la cible principale, sauf ${excl}.` },
        { match: _P.onCritApplyMaxAllies, replace: (m, c, pr, max) => `Sur coup critique, applique +${c} ${pr}, jusqu'à un maximum de ${max} aux alliés.` },
        { match: _P.modeGenEnergyTraitAllies, replace: (m, mode, c, tr) => `${_modeLoc(mode, 'fr')}, génère +${c} énergie de capacité pour les alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 8 ---
        { match: _P.ifTraitAlliesApplyProc, replace: (m, n, tr, pr) => `Si ${n}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, applique ${pr} à la cible principale.` },
        { match: _P.ifTraitAlliesGain, replace: (m, n, tr, pr) => `Si ${n}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, obtient ${pr}.` },
        { match: _P.ifTraitAlliesDmg, replace: (m, n, tr, p) => `Si ${n}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % de dégâts.` },
        { match: _P.ifTraitAlliesFlip, replace: (m, n, tr, c) => `Si ${n}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, convertit ${c} effet(s) bénéfique(s) en effet(s) nuisible(s) sur la cible principale.` },
        { match: _P.dmgPerEffectOnTarget, replace: (m, p, type) => `+${p} % de dégâts pour chaque effet ${type === 'positive' ? 'bénéfique' : 'nuisible'} sur la cible principale.` },
        { match: _P.reduceSpeedPerTraitAlly, replace: (m, p, tr) => `Réduit la jauge de vitesse de ${p} % pour chaque allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.targetHasGainSpeedBar, replace: (m, pr, p) => `Si la cible principale a ${pr}, obtient ${p} % de jauge de vitesse.` },
        { match: _P.targetHasGenEnergy, replace: (m, pr, c) => `Si la cible principale a ${pr}, génère +${c} énergie de capacité pour tous les alliés.` },
        { match: _P.targetHasFlipPos, replace: (m, pr, c) => `Si la cible principale a ${pr}, convertit ${c} effet(s) bénéfique(s) en effet(s) nuisible(s) sur la cible principale.` },
        { match: _P.targetNotHasApply, replace: (m, pr1, pr2) => `Si la cible principale n'a pas ${pr1}, applique ${pr2} à la cible principale.` },
        { match: _P.otherwiseFlipPos, replace: (m, c) => `Sinon, convertit ${c} effet(s) bénéfique(s) en effet(s) nuisible(s) sur la cible principale.` },
        { match: _P.modeNoteAttackCant, replace: (m, mode, what) => `${_modeLoc(mode, 'fr')}, cette attaque ne peut pas être ${what === 'countered' ? 'contrée' : what === 'blocked' ? 'bloquée' : what === 'dodged' ? 'esquivée' : what}.` },
        // --- Batch 9 patterns ---
        { match: _P.barrierSelf, replace: (m, p) => `Barrière de ${p} % de la vie max.` },
        { match: _P.prolongProcBy, replace: (m, pr, c) => `Prolonge la durée de ${pr} de ${c}.` },
        { match: _P.notModeChanceApply, replace: (m, mode, ch, pr) => `${_notModeLoc(mode, 'fr')}, ${ch} % de chances d'appliquer ${pr} à la cible principale.` },
        { match: _P.modeChanceGain, replace: (m, mode, ch, pr) => `${_modeLoc(mode, 'fr')}, ${ch} % de chances d'obtenir ${pr}.` },
        { match: _P.clearCountProcAllies, replace: (m, c, pr) => `Retire ${c} ${pr} des alliés.` },
        { match: _P.applyProcToEnemies, replace: (m, pr, c) => `Applique ${pr} à ${c} ennemis.` },
        { match: _P.applyCountToEnemies, replace: (m, n, pr, c) => `Applique ${n} ${pr} à ${c} ennemis.` },
        { match: _P.applyProcDurToEnemies, replace: (m, pr, t, c) => `Applique ${pr} pendant ${t} tours à ${c} ennemis.` },
        { match: _P.clearNegRandomTraitAlly, replace: (m, c, tr) => `Retire ${c} effet(s) nuisible(s) d'un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire.` },
        { match: _P.clearNegMostInjuredTraitAlly, replace: (m, c, tr) => `Retire ${c} effet(s) nuisible(s) de l'allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} le plus blessé.` },
        { match: _P.onCritStealAllExcl, replace: (m, pr) => `Sur critique, vole tous les effets bénéfiques de la cible principale, sauf ${pr}.` },
        { match: _P.onAssistApplyMaxTarget, replace: (m, c, pr, max) => `En assistance, applique +${c} ${pr}, jusqu'à un maximum de ${max} à la cible principale.` },
        { match: _P.copyPosGiveExcl, replace: (m, c, pr) => `Copie ${c} effet(s) bénéfique(s) de la cible principale et les donne aux alliés, sauf ${pr}.` },
        { match: _P.targetTraitGainProc, replace: (m, tr, pr) => `Si la cible principale est ${tr}, obtient ${pr}.` },
        { match: _P.flipPosNEnemies, replace: (m, c, n) => `Convertit ${c} effet(s) bénéfique(s) en nuisible(s) sur ${n} ennemis.` },
        { match: _P.barrierRandomTraitAlly, replace: (m, p, tr) => `Barrière de ${p} % de la vie max à un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire.` },
        // --- Batch 10 ---
        { match: _P.piercingAdditional, replace: (m, p) => `+${p} % de dégâts perforants aux ennemis supplémentaires.` },
        { match: _P.dmgPierceAdditional, replace: (m, d, p) => `+${d} % de dégâts + ${p} % de dégâts perforants aux ennemis supplémentaires.` },
        { match: _P.modeApplyPlusRandomAlly, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'fr')}, applique +${c} ${pr} à un allié aléatoire.` },
        { match: _P.drainAlliesHealth, replace: (m, p) => `Draine ${p} % de la vie max des alliés.` },
        { match: _P.ifAllyNoteCantMiss, replace: (m, ally) => `Si ${ally} est un allié, cette attaque ne peut pas rater.` },
        { match: _P.targetHasAttackPierceInstead, replace: (m, proc, p) => `Si la cible principale a ${proc}, attaque pour ${p} % de dégâts perforants à la place.` },
        { match: _P.targetHasDrainRedistribute, replace: (m, proc, p, target) => `Si la cible principale a ${proc}, draine ${p} % de la vie max de la cible et redistribue aux ${target}.` },
        { match: _P.modeOnCritClearNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'fr')}, sur critique, retire ${c} effet(s) nuisible(s) des alliés.` },
        { match: _P.ifAllyStealAllGiveExcl, replace: (m, ally, pr) => `Si ${ally} est un allié, vole tous les effets bénéfiques de la cible principale et les donne aux alliés, sauf ${pr}.` },
        { match: _P.applyProcToAllyHighest, replace: (m, pr, tr, stat) => `Applique ${pr} à l'allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} avec le plus de ${stat}.` },
        { match: _P.applyProcRandomAllyBelowHealth, replace: (m, pr, p) => `Applique ${pr} à un allié aléatoire en dessous de ${p} % de vie.` },
        { match: _P.allAlliesHaveGainSpeedBar, replace: (m, proc, p) => `Si tous les alliés ont ${proc}, obtient ${p} % de jauge de vitesse.` },
        { match: _P.targetHasStealCountExcl, replace: (m, proc, c, pr) => `Si la cible principale a ${proc}, vole ${c} effet(s) bénéfique(s) de la cible principale, sauf ${pr}.` },
        { match: _P.selfHasLessThanApplyMaxAllies, replace: (m, n, proc, c, pr, max) => `Si ce personnage a moins de ${n} ${proc}, applique +${c} ${pr}, jusqu'à un maximum de ${max} aux alliés.` },
        { match: _P.targetTraitApplyProcAllyHighest, replace: (m, tr, pr, stat) => `Si la cible principale est ${tr}, applique ${pr} à l'allié avec le plus de ${stat}.` },
        { match: _P.modeIfTraitAlliesStealProc, replace: (m, mode, c, tr, proc) => `${_modeLoc(mode, 'fr')}, si ${c}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, vole ${proc} de la cible principale et le donne aux alliés.` },
        // --- Batch 11 ---
        { match: _P.targetHasPosClearPos, replace: (m, c) => `Si la cible principale a des effets bénéfiques, retire ${c} effet(s) bénéfique(s) de la cible principale.` },
        { match: _P.modeSubTargetHasDrain, replace: (m, mode, sub, proc, p) => `${_modeLoc(mode, 'fr')}, ${sub}, si la cible principale a ${proc}, draine ${p} % de la vie max de la cible.` },
        { match: _P.modeSubReduceDur, replace: (m, mode, sub, proc, c) => `${_modeLoc(mode, 'fr')}, ${sub}, réduit la durée de ${proc} de ${c}.` },
        { match: _P.modeApplyPlusRandomAllyExclSelf, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'fr')}, applique +${c} ${pr} à un allié aléatoire (sauf soi-même).` },
        { match: _P.modeOrSubClearNegRandomTraitAlly, replace: (m, m1, m2, sub, c, tr) => `${_modeLoc(m1, 'fr')} ou ${_modeLoc(m2, 'fr')}, ${sub}, retire ${c} effet(s) nuisible(s) d'un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire.` },
        { match: _P.selfHasClearPos, replace: (m, proc, c) => `Si ce personnage a ${proc}, retire ${c} effet(s) bénéfique(s) de la cible principale.` },
        { match: _P.selfNotHasFlipPos, replace: (m, proc, c) => `Si ce personnage n'a pas ${proc}, convertit ${c} effet(s) bénéfique(s) en nuisible(s) sur la cible principale.` },
        { match: _P.selfHasClearNegSelf, replace: (m, proc) => `Si ce personnage a ${proc}, retire tous les effets nuisibles de soi-même.` },
        { match: _P.selfHasClearCountFromSelf, replace: (m, proc, c, pr) => `Si ce personnage a ${proc}, retire ${c} ${pr} de soi-même.` },
        { match: _P.targetHasClearAllProc, replace: (m, proc, pr) => `Si la cible principale a ${proc}, retire tout ${pr} de la cible principale.` },
        { match: _P.onAssistTargetHasClearAllProc, replace: (m, proc, pr) => `En assistance, si la cible principale a ${proc}, retire tout ${pr} de la cible principale.` },
        { match: _P.targetTraitApplyCountDur, replace: (m, tr, c, pr, t) => `Si la cible principale est ${tr}, applique ${c} ${pr} pendant ${t} tours à la cible principale.` },
        { match: _P.targetTraitApplyCount, replace: (m, tr, c, pr) => `Si la cible principale est ${tr}, applique ${c} ${pr} à la cible principale.` },
        { match: _P.onCritBarrierAllies, replace: (m, p) => `Sur critique, barrière de ${p} % de la vie max aux alliés.` },
        { match: _P.ifTraitAlliesCritChance, replace: (m, c, tr, p) => `Si ${c}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % de chance de critique.` },
        { match: _P.ifTraitAlliesCritPerAlly, replace: (m, c, tr, p, tr2) => `Si ${c}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % de chance de critique par allié ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 12 ---
        { match: _P.onCritGenEnergyRandomAlly, replace: (m, c) => `Sur critique, génère +${c} énergie de capacité pour un allié aléatoire.` },
        { match: _P.onCounterOnCritGenEnergy, replace: (m, c) => `Sur contre-attaque, sur critique, génère +${c} énergie de capacité pour un allié aléatoire.` },
        { match: _P.removeBarrierTarget, replace: () => `Retire la barrière de la cible principale.` },
        { match: _P.modeSubFlipNegToPosAllies, replace: (m, mode, sub) => `${_modeLoc(mode, 'fr')}, ${sub}, convertit tous les effets nuisibles en bénéfiques sur les alliés.` },
        { match: _P.modeSubTargetNotTraitDrain, replace: (m, mode, sub, tr, p) => `${_modeLoc(mode, 'fr')}, ${sub}, si la cible principale n'est pas ${tr}, draine ${p} % de la vie max de la cible.` },
        { match: _P.targetNotHasClearPos, replace: (m, proc, c) => `Si la cible principale n'a pas ${proc}, retire ${c} effet(s) bénéfique(s) de la cible principale.` },
        { match: _P.selfHasGainSpeedBar, replace: (m, proc, p) => `Si ce personnage a ${proc}, obtient ${p} % de jauge de vitesse.` },
        { match: _P.selfHasGainCount, replace: (m, proc, c, pr) => `Si ce personnage a ${proc}, obtient ${c} ${pr}.` },
        { match: _P.healTarget, replace: (m, p) => `Soigne la cible principale de ${p} % de la vie max.` },
        { match: _P.ifAllyApplyCount, replace: (m, ally, c, pr) => `Si ${ally} est un allié, applique ${c} ${pr} à la cible principale.` },
        { match: _P.notModeChanceGain, replace: (m, mode, p, pr) => `${_notModeLoc(mode, 'fr')}, ${p} % de chance d'obtenir ${pr}.` },
        { match: _P.ifAllyDmgPierce, replace: (m, ally, d, p) => `Si ${ally} est un allié, +${d} % de dégâts + ${p} % de dégâts perforants.` },
        { match: _P.ifAllyApplyDur, replace: (m, ally, pr, t) => `Si ${ally} est un allié, applique ${pr} pendant ${t} tours à la cible principale.` },
        { match: _P.selfIsTraitApplyProc, replace: (m, tr, pr) => `Si ce personnage est ${tr}, applique ${pr} à la cible principale.` },
        { match: _P.selfNotTraitApplyProc, replace: (m, tr, pr) => `Si ce personnage n'est pas ${tr}, applique ${pr} à la cible principale.` },
        { match: _P.targetTraitApplyProc, replace: (m, tr, pr) => `Si la cible principale est ${tr}, applique ${pr} à la cible principale.` },
        // --- Batch 13 ---
        { match: _P.targetTraitOrApplyCountDurInjured, replace: (m, tr1, tr2, c, pr, t) => `Si la cible principale est ${tr1} ou ${tr2}, applique ${c} ${pr} pendant ${t} tours à l'allié le plus blessé.` },
        { match: _P.onAssistModeOnCritApply, replace: (m, mode, pr) => `En assistance, ${_modeLoc(mode, 'fr')}, sur critique, applique ${pr} à la cible principale.` },
        { match: _P.otherwiseSelfOrTargetHasCrit, replace: (m, tr, proc, p) => `Sinon, si ce personnage est ${tr} ou la cible a ${proc}, +${p} % de chance de critique.` },
        { match: _P.healthOrChargedDmg, replace: (m, hp, proc, d) => `Si ce personnage a ${hp} % de vie ou moins ou a ${proc}, +${d} % de dégâts.` },
        { match: _P.applyDurTraitAllyLowest, replace: (m, pr, t, tr, stat) => `Applique ${pr} pendant ${t} tours à l'allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} avec le moins de ${stat}.` },
        { match: _P.otherwiseTargetHasApplyAllies, replace: (m, proc, c, pr) => `Sinon, si la cible principale a ${proc}, applique +${c} ${pr} aux alliés.` },
        { match: _P.modeIfTraitAlliesCallHighest, replace: (m, mode, c, tr, tr2, stat) => `${_modeLoc(mode, 'fr')}, si ${c}+ alliés ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, appelle l'allié ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)} avec le plus de ${stat} en assistance.` },
        { match: _P.modeOnAssistTypeGenTraitAlly, replace: (m, mode, type, c, tr) => `${_modeLoc(mode, 'fr')}, en assistance ${type}, génère +${c} énergie de capacité pour un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire.` },
        { match: _P.selfHasProcCritPerTraitOrAlly, replace: (m, proc, p, tr1, tr2) => `Si ce personnage a ${proc}, +${p} % de chance de critique par allié ${tr1} ou ${tr2}.` },
        { match: _P.modeHealthReduceDurRandomTraitAlly, replace: (m, mode, hp, c, tr) => `${_modeLoc(mode, 'fr')}, si ce personnage a plus de ${hp} % de vie, réduit la durée des effets nuisibles de ${c} sur un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire.` },
        { match: _P.targetHasAndHasRemoveBarrier, replace: (m, p1, p2) => `Si la cible principale a ${p1} et a ${p2}, retire la barrière de la cible principale.` },
        { match: _P.selfHasCountAnyEnemyFlip, replace: (m, c, proc, n) => `Si ce personnage a ${c}+ ${proc}, si un ennemi a des effets bénéfiques, convertit ${n} effet(s) bénéfique(s) en nuisible(s) sur la cible principale.` },
        { match: _P.selfLessCountAnyEnemyFlip, replace: (m, c, proc, n) => `Si ce personnage a moins de ${c} ${proc}, si un ennemi a des effets bénéfiques, convertit ${n} effet(s) bénéfique(s) en nuisible(s) sur la cible principale.` },
        { match: _P.modeOnCritProlongNegExcl, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'fr')}, sur critique, prolonge la durée de tous les effets nuisibles, sauf ${pr}, de ${c}.` },
        { match: _P.modeOnCritProlongProc, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'fr')}, sur critique, prolonge la durée de ${pr} de ${c}.` },
        { match: _P.modeBarrierRandomAlly, replace: (m, mode, p) => `${_modeLoc(mode, 'fr')}, barrière de ${p} % de la vie max à un allié aléatoire.` },
        // --- Batch 14 ---
        { match: _P.modeEnergyFullOnCritGenRandomAlly, replace: (m, mode, c) => `${_modeLoc(mode, 'fr')}, si l'énergie de capacité est pleine, sur critique, génère +${c} énergie de capacité pour un allié aléatoire.` },
        { match: _P.modeEnergyFullOnCritGenSelf, replace: (m, mode, c) => `${_modeLoc(mode, 'fr')}, si l'énergie de capacité est pleine, sur critique, génère +${c} énergie de capacité pour soi-même.` },
        { match: _P.healthLessThanDrain, replace: (m, hp, d) => `Si ce personnage a moins de ${hp} % de vie, +${d} % de drain.` },
        { match: _P.healthOrMoreApplyDurTarget, replace: (m, hp, pr, t) => `Si ce personnage a ${hp} % ou plus de vie, applique ${pr} pendant ${t} tours à la cible principale.` },
        { match: _P.barrierOrMoreApplyDurAllies, replace: (m, bp, pr, t) => `Si ce personnage a ${bp} % ou plus de barrière, applique ${pr} pendant ${t} tours aux alliés.` },
        { match: _P.barrierOrMoreGainDur, replace: (m, bp, pr, t) => `Si ce personnage a ${bp} % ou plus de barrière, obtient ${pr} pendant ${t} tours.` },
        { match: _P.onTypeAssistGenAllAllies, replace: (m, type, c) => `En assistance ${type}, génère +${c} énergie de capacité pour tous les alliés.` },
        { match: _P.onTypeAssistGenChar, replace: (m, type, c, ch) => `En assistance ${type}, génère +${c} énergie de capacité pour ${ch}.` },
        { match: _P.ifNotFacingApplyTarget, replace: (m, ch, pr) => `Si on n'affronte pas ${ch}, applique ${pr} à la cible principale.` },
        { match: _P.targetTraitApplyInjuredAlly, replace: (m, tr, pr) => `Si la cible principale est ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, applique ${pr} à l'allié le plus blessé.` },
        { match: _P.copyAllGiveAlliesExclTwo, replace: (m, pr1, pr2) => `Copie tous les effet(s) bénéfique(s) de la cible principale et donne aux alliés, sauf ${pr1} et ${pr2}.` },
        { match: _P.noteCantCritHit, replace: () => `Cette attaque ne peut pas porter de coup critique.` },
        { match: _P.modeApplyAllies, replace: (m, mode, pr) => `${_modeLoc(mode, 'fr')}, applique ${pr} aux alliés.` },
        { match: _P.targetTraitApplyCountMaxInjured, replace: (m, tr, c, pr, mx) => `Si la cible principale est ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, applique +${c} ${pr}, jusqu'à un maximum de ${mx} à l'allié le plus blessé.` },
        { match: _P.modeGenEnergyChar, replace: (m, mode, c, ch) => `${_modeLoc(mode, 'fr')}, génère +${c} énergie de capacité pour ${ch}.` },
        { match: _P.targetTraitApplyInjuredWithout, replace: (m, tr, pr, pr2) => `Si la cible principale est ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, applique ${pr} à l'allié le plus blessé sans ${pr2}.` },
        { match: _P.modeHealRandomTraitAlly, replace: (m, mode, tr, hp) => `${_modeLoc(mode, 'fr')}, soigne un allié ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aléatoire de ${hp} % de la vie max.` },
        { match: _P.selfHasOrLessApplyMaxAllies, replace: (m, c, pr, c2, pr2, mx) => `Si ce personnage a ${c} ou moins ${pr}, applique +${c2} ${pr2}, jusqu'à un maximum de ${mx} aux alliés.` },
        { match: _P.selfHasProcChanceApplyTarget, replace: (m, pr, pct, pr2) => `Si ce personnage a ${pr}, ${pct} % de chance d'appliquer ${pr2} à la cible principale.` },
        { match: _P.otherwiseSelfHasChanceGain, replace: (m, pr, pct, pr2) => `Sinon, si ce personnage a ${pr}, ${pct} % de chance d'obtenir ${pr2}.` },
        { match: _P.otherwiseSelfHasHealInjured, replace: (m, pr, hp) => `Sinon, si ce personnage a ${pr}, soigne l'allié le plus blessé de ${hp} % de la vie max.` },
      ],
    },
    // ==================== GERMAN ====================
    de: {
      damageLine: (dmg, pierce, drain) => {
        const p = [];
        if (dmg > 0) p.push(`<span class="msf-iso8-damage-value">${dmg} %</span> Schaden`);
        if (pierce > 0) p.push(`<span class="msf-iso8-piercing-value">${pierce} %</span> Durchdringungsschaden`);
        if (drain > 0) p.push(`<span class="msf-iso8-drain-value">${drain} %</span> Lebensentzug`);
        return p.length > 0 ? `⚔️ Greift das Primärziel an und fügt ihm ${p.join(' + ')} zu` : null;
      },
      title: 'ISO-8 Konter/Assist',
      patterns: [
        { match: _P.forcedDmgPierce, replace: (m, d, p, tr) => `Wenn dieser Charakter dazu gezwungen wird, einen Verbündeten anzugreifen, fügt er ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Charakteren ${d} % Schaden + ${p} % Durchdringungsschaden zu.` },
        { match: _P.forcedDmg, replace: (m, d, tr) => `Wenn dieser Charakter dazu gezwungen wird, einen Verbündeten anzugreifen, fügt er ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Charakteren ${d} % Schaden zu.` },
        { match: _P.flipEffects, replace: (m, n, c) => `Wandelt ${c} zufällige positive Effekte vom Primärziel in negative Effekte um, wenn ${n} ein Verbündeter ist.` },
        { match: _P.flipRandom, replace: (m, n, c) => `Wandelt ${c} zufällige positive Effekte vom Primärziel in negative Effekte um, wenn ${n} ein Verbündeter ist.` },
        { match: _P.applyProc, replace: (m, pr) => `Wendet ${pr} auf das Primärziel an.` },
        { match: _P.applyCount, replace: (m, c, pr) => `Wendet ${c}-mal ${pr} auf das Primärziel an.` },
        { match: _P.applyPlusDur, replace: (m, c, pr, t) => `Wendet +${c} ${pr} für ${t} Runden auf das Primärziel an.` },
        { match: _P.applyPlus, replace: (m, c, pr) => `Wendet +${c} ${pr} auf das Primärziel an.` },
        { match: _P.applyAllies, replace: (m, c, pr) => `Wendet +${c} ${pr} auf Verbündete an.` },
        { match: _P.gainPlus, replace: (m, c, pr) => `Erhält +${c} ${pr}.` },
        { match: _P.gainSpeedBar, replace: (m, p) => `Erhält ${p} % Geschwindigkeitsleiste.` },
        { match: _P.reduceSpeedBar, replace: (m, p) => `Verringert die Geschwindigkeitsleiste um ${p} %.` },
        { match: _P.gain, replace: (m, pr) => `Erhält ${pr}.` },
        { match: _P.healthGain, replace: (m, p, pr) => `Wenn dieser Charakter ${p} % oder weniger LP hat, erhält ${pr}.` },
        { match: _P.healthGeneric, replace: (m, p, r) => `Wenn dieser Charakter ${p} % oder weniger LP hat, ${r}` },
        // --- New patterns ---
        { match: _P.forcedPierceOnly, replace: (m, p, tr) => `Wenn dieser Charakter dazu gezwungen wird, einen Verbündeten anzugreifen, fügt er ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Charakteren ${p} % Durchdringungsschaden zu.` },
        { match: _P.ifAllyApplyRandom, replace: (m, n, pr) => `Wendet ${pr} auf einen zufälligen Verbündeten an, wenn ${n} ein Verbündeter ist.` },
        { match: _P.selfHasApplyCountDur, replace: (m, proc, c, pr, t) => `Wenn dieser Charakter ${proc} hat, wendet ${c}-mal ${pr} für ${t} Runden auf das Primärziel an.` },
        { match: _P.selfHasApply, replace: (m, proc, pr) => `Wendet ${pr} auf das Primärziel an, wenn dieser Charakter ${proc} hat.` },
        { match: _P.selfHasClear, replace: (m, proc, c, pr) => `Wenn dieser Charakter ${proc} hat, entfernt ${c} ${pr} von Verbündeten.` },
        { match: _P.selfHasAttackInstead, replace: (m, proc, p, d) => `Wenn dieser Charakter ${proc} hat, greift stattdessen für ${p} % Durchdringungsschaden + ${d} % Lebensentzug an.` },
        { match: _P.selfNotHasApply, replace: (m, proc, pr) => `Wenn dieser Charakter kein ${proc} hat, wendet ${pr} auf das Primärziel an.` },
        { match: _P.modeGainCount, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'de')}: Erhält ${c}-mal ${pr}.` },
        { match: _P.modeSelfHasApply, replace: (m, mode, proc, pr) => `${_modeLoc(mode, 'de')}: Wendet ${pr} auf das Primärziel an, wenn dieser Charakter ${proc} hat.` },
        { match: _P.onAssistEnergy, replace: (m, type, c) => `Gewährt sich selbst bei ${_modeLoc(type, 'de')}m Assist +${c} Fähigkeitenenergie.` },
        { match: _P.modeReduceSpeedPerAlly, replace: (m, mode, p, tr) => `${_modeLoc(mode, 'de')}: Verringert die Geschwindigkeitsleiste um ${p} % für jeden ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten.` },
        { match: _P.healthHealAllies, replace: (m, p, h) => `Wenn dieser Charakter weniger als ${p} % LP hat, heilt Verbündete um ${h} % der max. LP.` },
        { match: _P.modeIgnoresDefUp, replace: (m, mode) => `${_modeLoc(mode, 'de')}: Dieser Angriff ignoriert +Defensive.` },
        // --- Batch 3 patterns ---
        { match: _P.modeIfSelfHasCountDmg, replace: (m, mode, c, proc, d) => `${_modeLoc(mode, 'de')}: Wenn dieser Charakter ${c}+ ${proc} hat, +${d} % Schaden.` },
        { match: _P.clearPosTarget, replace: (m, c) => `Entfernt ${c} positive(n) Effekt(e) vom Primärziel.` },
        { match: _P.applyAlliesNamed, replace: (m, pr) => `Wendet ${pr} auf Verbündete an.` },
        { match: _P.clearNegAllies, replace: (m, c) => `Entfernt ${c} negative(n) Effekt(e) von Verbündeten.` },
        { match: _P.applyMostInjured, replace: (m, pr) => `Wendet ${pr} auf den am stärksten verwundeten Verbündeten an.` },
        { match: _P.clearNegMostInjured, replace: (m, c) => `Entfernt ${c} negative(n) Effekt(e) vom am stärksten verwundeten Verbündeten.` },
        { match: _P.modeApplyRandomTraitAlly, replace: (m, mode, c, pr, tr) => `${_modeLoc(mode, 'de')}: Wendet +${c} ${pr} auf einen zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten an.` },
        { match: _P.targetNotTraitDrain, replace: (m, tr, p) => `Wenn das Primärziel kein ${tr} ist, entzieht es ${p} % der max. LP des Ziels.` },
        { match: _P.targetTraitDrain, replace: (m, tr, p) => `Wenn das Primärziel ${tr} ist, entzieht es ${p} % der max. LP des Ziels.` },
        { match: _P.notModeFlip, replace: (m, mode, c) => `${_notModeLoc(mode, 'de')}: Wandelt ${c} positive(n) Effekt(e) am Primärziel in negative um.` },
        { match: _P.modeFlipAll, replace: (m, mode) => `${_modeLoc(mode, 'de')}: Wandelt alle positiven Effekte am Primärziel in negative um.` },
        { match: _P.targetNoPosApply, replace: (m, pr) => `Wenn das Primärziel keine positiven Effekte hat, wendet ${pr} auf das Primärziel an.` },
        { match: _P.targetHasApply, replace: (m, proc, pr) => `Wenn das Primärziel ${proc} hat, wendet ${pr} auf das Primärziel an.` },
        { match: _P.applyUpToMaxRandomAlly, replace: (m, c, pr, max) => `Wendet +${c} ${pr} auf einen zufälligen Verbündeten an, bis maximal ${max}.` },
        { match: _P.onAssistProlongPos, replace: (m, proc, c) => `Bei Assist: Verlängert die Dauer aller positiven Effekte, außer ${proc}, um ${c} auf Verbündete.` },
        { match: _P.prolongPosExcluding, replace: (m, proc, c) => `Verlängert die Dauer aller positiven Effekte, außer ${proc}, um ${c} auf Verbündete.` },
        { match: _P.forcedDmgInstead, replace: (m, p) => `Wenn dieser Charakter dazu gezwungen wird, einen Verbündeten anzugreifen, greift stattdessen für ${p} % Schaden an.` },
        { match: _P.otherwiseDrain, replace: (m, p) => `Andernfalls entzieht es ${p} % der max. LP des Ziels.` },
        { match: _P.anyEnemyHasClearPos, replace: (m, c) => `Wenn ein Gegner positive Effekte hat, entfernt ${c} positive(n) Effekt(e) vom Primärziel.` },
        { match: _P.clearNegRandomAlly, replace: (m, c) => `Entfernt ${c} negative(n) Effekt(e) von einem zufälligen Verbündeten.` },
        { match: _P.triggerBattlefield, replace: () => `Löst den Schlachtfeldeffekt aus.` },
        { match: _P.noteIgnoresDefUp, replace: () => `Dieser Angriff ignoriert +Defensive.` },
        { match: _P.targetHasOrDmg, replace: (m, pr1, pr2, d) => `Wenn das Ziel ${pr1} oder ${pr2} hat, +${d} % Schaden.` },
        { match: _P.flipAllPos, replace: () => `Wandelt alle positiven Effekte am Primärziel in negative um.` },
        { match: _P.genEnergyAllAllies, replace: (m, c) => `Gewährt allen Verbündeten +${c} Fähigkeitenenergie.` },
        { match: _P.noteTargetHasOrCantBlock, replace: (m, pr1, pr2) => `Wenn das Ziel ${pr1} oder ${pr2} hat, kann dieser Angriff nicht geblockt werden.` },
        { match: _P.selfHasDmgBoost, replace: (m, proc, d) => `Wenn dieser Charakter ${proc} hat, +${d} % Schaden.` },
        { match: _P.clearAllPosTarget, replace: () => `Entfernt alle positiven Effekte vom Primärziel.` },
        { match: _P.ifTraitAlliesApplyMax, replace: (m, c, tr, n, pr, max) => `Wenn ${c}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündete, wendet +${n} ${pr} auf Verbündete an, bis maximal ${max}.` },
        { match: _P.applyMaxRandomTraitAlly, replace: (m, c, pr, max, tr) => `Wendet +${c} ${pr} auf einen zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten an, bis maximal ${max}.` },
        { match: _P.genEnergyTraitAllies, replace: (m, c, tr) => `Gewährt ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten +${c} Fähigkeitenenergie.` },
        // --- Batch 4 patterns ---
        { match: _P.flipCountPos, replace: (m, c) => `Wandelt ${c} positive(n) Effekt(e) vom Primärziel in negative um.` },
        { match: _P.modeFlipCount, replace: (m, mode, c) => `${_modeLoc(mode, 'de')}: Wandelt ${c} positive(n) Effekt(e) vom Primärziel in negative um.` },
        { match: _P.onCritReduceSpeed, replace: (m, p) => `Bei kritischem Treffer: Verringert die Geschwindigkeitsleiste um ${p} %.` },
        { match: _P.onCritApply, replace: (m, c, pr) => `Bei kritischem Treffer: Wendet +${c} ${pr} auf das Primärziel an.` },
        { match: _P.onAssistPiercing, replace: (m, p) => `Bei Assist: +${p} % Durchdringungsschaden.` },
        { match: _P.onCounterChanceGain, replace: (m, pct, c, pr) => `Bei Konter: ${pct} % Chance, +${c} ${pr} zu erhalten.` },
        { match: _P.stealPosExcluding, replace: (m, c, excl) => `Stiehlt ${c} positive(n) Effekt(e) vom Primärziel und gibt sie Verbündeten, außer ${excl}.` },
        { match: _P.barrierAllies, replace: (m, p) => `Barriere für ${p} % der max. LP für Verbündete.` },
        { match: _P.barrierMostInjuredNonSummon, replace: (m, p) => `Barriere für ${p} % der max. LP für den am schwersten verletzten nicht beschworenen Verbündeten.` },
        { match: _P.genEnergyRandomAlly, replace: (m, c) => `Gewährt einem zufälligen Verbündeten +${c} Fähigkeitenenergie.` },
        { match: _P.selfHasReduceDur, replace: (m, proc, proc2, c) => `Wenn dieser Charakter ${proc} hat, verringert die Dauer von ${proc2} um ${c} bei Verbündeten.` },
        { match: _P.prolongNegExcluding, replace: (m, excl, c) => `Verlängert die Dauer aller negativen Effekte, außer ${excl}, um ${c}.` },
        { match: _P.drainDmgDealt, replace: (m, p) => `Entzieht ${p} % des verursachten Schadens als LP.` },
        { match: _P.drainFlat, replace: (m, p) => `Entzieht ${p} % der max. LP des Ziels.` },
        { match: _P.chanceApply, replace: (m, pct, pr) => `${pct} % Chance, ${pr} auf das Primärziel anzuwenden.` },
        { match: _P.modeReduceSpeed, replace: (m, mode, p) => `${_modeLoc(mode, 'de')}: Verringert die Geschwindigkeitsleiste um ${p} %.` },
        { match: _P.modeGain, replace: (m, mode, pr) => `${_modeLoc(mode, 'de')}: Erhält ${pr}.` },
        { match: _P.clearAllProcTarget, replace: (m, pr) => `Entfernt alle(s) ${pr} vom Primärziel.` },
        { match: _P.applyRandomAlly, replace: (m, pr) => `Wendet ${pr} auf einen zufälligen Verbündeten an.` },
        { match: _P.attackAdditional, replace: () => `Greift einen weiteren Feind an.` },
        { match: _P.copyNegExcluding, replace: (m, c, excl) => `Kopiert ${c} negative(n) Effekt(e) vom Primärziel, außer ${excl}.` },
        { match: _P.noteDebuffsNotResisted, replace: () => `Schwächungen durch diesen Angriff können nicht widerstanden werden.` },
        { match: _P.targetTraitReduceSpeed, replace: (m, tr, p) => `Wenn das Primärziel ${tr} ist, verringert die Geschwindigkeitsleiste um ${p} %.` },
        { match: _P.modeStatPerAlly, replace: (m, mode, p, stat, tr) => `${_modeLoc(mode, 'de')}: +${p} % ${stat} pro ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündetem.` },
        { match: _P.modeReviveAt, replace: (m, mode, name, p) => `${_modeLoc(mode, 'de')}: Belebt ${name} mit ${p} % LP wieder.` },
        // --- Batch 5 patterns ---
        { match: _P.modeTraitAllyStealAllExcl, replace: (m, mode, c, tr, ally, excl) => `${_modeLoc(mode, 'de')}: Wenn ${c}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündete und ${ally} ein Verbündeter ist, stiehlt alle positiven Effekte vom Primärziel und gibt sie Verbündeten, außer ${excl}.` },
        { match: _P.modeTraitAllyStealProc, replace: (m, mode, c, tr, ally, proc) => `${_modeLoc(mode, 'de')}: Wenn ${c}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündete und ${ally} ein Verbündeter ist, stiehlt ${proc} vom Primärziel und gibt es Verbündeten.` },
        { match: _P.modeApplyPlus, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'de')}: Wendet +${c} ${pr} auf das Primärziel an.` },
        { match: _P.modeApplyProc, replace: (m, mode, pr) => `${_modeLoc(mode, 'de')}: Wendet ${pr} auf das Primärziel an.` },
        { match: _P.modeApplyAllies, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'de')}: Wendet +${c} ${pr} auf Verbündete an.` },
        { match: _P.modeClearCountTarget, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'de')}: Entfernt ${c} ${pr} vom Primärziel.` },
        { match: _P.otherwiseApplyPlus, replace: (m, c, pr) => `Andernfalls wendet +${c} ${pr} auf das Primärziel an.` },
        { match: _P.otherwiseApplyProc, replace: (m, pr) => `Andernfalls wendet ${pr} auf das Primärziel an.` },
        { match: _P.otherwiseModeClearAllPos, replace: (m, mode) => `Andernfalls, ${_modeLoc(mode, 'de')}: Entfernt alle positiven Effekte vom Primärziel.` },
        { match: _P.clearFromSelf, replace: (m, pr) => `Entfernt alle(s) ${pr} von sich selbst.` },
        { match: _P.clearCountProcTarget, replace: (m, c, pr) => `Entfernt ${c} ${pr} vom Primärziel.` },
        { match: _P.selfNotHasClearNeg, replace: (m, proc) => `Wenn dieser Charakter kein ${proc} hat, entfernt alle negativen Effekte von Verbündeten.` },
        { match: _P.selfNotHasApplyMaxAllies, replace: (m, proc, c, pr, max) => `Wenn dieser Charakter kein ${proc} hat, wendet +${c} ${pr} auf Verbündete an, bis maximal ${max}.` },
        { match: _P.targetHasReduceSpeed, replace: (m, proc, p) => `Wenn das Primärziel ${proc} hat, verringert die Geschwindigkeitsleiste um ${p} %.` },
        { match: _P.targetHasApplyAllies, replace: (m, proc, c, pr, max) => `Wenn das Primärziel ${proc} hat, wendet +${c} ${pr} auf Verbündete an, bis maximal ${max}.` },
        { match: _P.targetTraitGainMax, replace: (m, tr, c, pr, max) => `Wenn das Primärziel ${tr} ist, erhält +${c} ${pr}, bis maximal ${max}.` },
        { match: _P.modeOnCritApply, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'de')}: Bei kritischem Treffer wendet +${c} ${pr} auf das Primärziel an.` },
        { match: _P.notModeOnCritReduceSpeed, replace: (m, mode, p) => `${_notModeLoc(mode, 'de')}: Bei kritischem Treffer verringert die Geschwindigkeitsleiste um ${p} %.` },
        { match: _P.modeCallAssist, replace: (m, mode, tr) => `${_modeLoc(mode, 'de')}: Ruft einen zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten zur Unterstützung.` },
        { match: _P.modeNoteCantDodge, replace: (m, mode) => `${_modeLoc(mode, 'de')}: Dieser Angriff ist unausweichlich.` },
        { match: _P.modeTargetHasReduceDur, replace: (m, mode, proc, proc2, c) => `${_modeLoc(mode, 'de')}: Wenn das Primärziel ${proc} hat, verringert die Dauer von ${proc2} um ${c}.` },
        { match: _P.modeProlongNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'de')}: Verlängert die Dauer negativer Effekte um ${c}.` },
        { match: _P.notModeProlongNegExcl, replace: (m, mode, excl, c) => `${_notModeLoc(mode, 'de')}: Verlängert die Dauer aller negativen Effekte, außer ${excl}, um ${c}.` },
        { match: _P.stealAllExcluding, replace: (m, excl) => `Stiehlt alle positiven Effekte vom Primärziel, außer ${excl}.` },
        { match: _P.stealAllGiveExcluding, replace: (m, excl) => `Stiehlt alle positiven Effekte vom Primärziel und gibt sie Verbündeten, außer ${excl}.` },
        { match: _P.transferAllPos, replace: () => `Überträgt alle positiven Effekte von sich selbst als negative Effekte.` },
        { match: _P.applyMostInjuredTrait, replace: (m, c, pr, tr) => `Wendet ${c} ${pr} auf den am schwersten verletzten ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten an.` },
        { match: _P.onAssistApplyMaxAllies, replace: (m, c, pr, max) => `Bei Assist: Wendet +${c} ${pr} auf Verbündete an, bis maximal ${max}.` },
        { match: _P.selfHasMoreModeProlongNeg, replace: (m, n, proc, mode, c) => `Wenn dieser Charakter mehr als ${n} ${proc} hat, ${_modeLoc(mode, 'de')}: verlängert die Dauer negativer Effekte um ${c}.` },
        { match: _P.selfHasMoreNotModeProlongNegExcl, replace: (m, n, proc, mode, excl, c) => `Wenn dieser Charakter mehr als ${n} ${proc} hat, ${_notModeLoc(mode, 'de')}: verlängert die Dauer aller negativen Effekte, außer ${excl}, um ${c}.` },
        { match: _P.barrierMostInjured, replace: (m, p) => `Barriere für ${p} % der max. LP für den am schwersten verletzten Verbündeten.` },
        { match: _P.onAssistDmg, replace: (m, p) => `Bei Assist: +${p} % Schaden.` },
        // --- Batch 6 patterns ---
        { match: _P.onTriggerGainPlus, replace: (m, trig, c, pr) => `Bei ${trig === 'Counter' ? 'Konter' : 'kritischem Treffer'}: Erhält +${c} ${pr}.` },
        { match: _P.flipNegToPosAllies, replace: (m, c) => `Wandelt ${c} negative(n) Effekt(e) bei Verbündeten in positive um.` },
        { match: _P.stealProcGiveAllies, replace: (m, pr) => `Stiehlt ${pr} vom Primärziel und gibt es Verbündeten.` },
        { match: _P.selfHasCritBoost, replace: (m, pr, p) => `Wenn dieser Charakter ${pr} hat, +${p} % kritische Trefferchance.` },
        { match: _P.traitAllyExistsDmg, replace: (m, tr, p) => `Wenn ein ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeter existiert, +${p} % Schaden.` },
        { match: _P.applyProcMostInjuredTrait, replace: (m, pr, tr) => `Wendet ${pr} auf den am schwersten verletzten ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten an.` },
        // --- Batch 7 patterns ---
        { match: _P.applyProcRandomTraitAlly, replace: (m, pr, tr) => `Wendet ${pr} auf einen zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten an.` },
        { match: _P.modeStatBoost, replace: (m, mode, p, stat) => `${_modeLoc(mode, 'de')}: +${p} % ${stat}.` },
        { match: _P.ifAllyNoteAttackCant, replace: (m, name, what) => `Wenn ${name} ein Verbündeter ist, kann dieser Angriff nicht ${what === 'dodged' ? 'ausgewichen' : what === 'blocked' ? 'geblockt' : what === 'missed' ? 'verfehlt' : what} werden.` },
        { match: _P.statPerTraitAlly, replace: (m, p, stat, tr) => `+${p} % ${stat} pro ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündetem.` },
        { match: _P.genEnergyForNamed, replace: (m, c, name) => `Erzeugt +${c} Fähigkeitsenergie für ${name}.` },
        { match: _P.healRandomTraitAlly, replace: (m, tr, p) => `Heilt einen zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten um ${p} % der max. LP.` },
        { match: _P.targetHasStatBoost, replace: (m, proc, p, stat) => `Wenn das Ziel ${proc} hat, +${p} % ${stat}.` },
        { match: _P.flipNegToPosRandomTraitAlly, replace: (m, c, tr) => `Wandelt ${c} negative(n) Effekt(e) bei einem zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten in positive um.` },
        { match: _P.drainRedistribute, replace: (m, p, target) => `Entzieht ${p} % der max. LP des Ziels und verteilt sie an ${_traitLoc(target, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündete.` },
        { match: _P.selfNotHasApplyAllies, replace: (m, proc, pr) => `Wenn dieser Charakter kein ${proc} hat, wendet ${pr} auf Verbündete an.` },
        { match: _P.selfIsTraitDmg, replace: (m, tr, p) => `Wenn dieser Charakter ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} ist, +${p} % Schaden.` },
        { match: _P.healAllies, replace: (m, p) => `Heilt Verbündete um ${p} % der max. LP.` },
        { match: _P.stealCountExcluding, replace: (m, c, excl) => `Stiehlt ${c} positive(n) Effekt(e) vom Primärziel, außer ${excl}.` },
        { match: _P.onCritApplyMaxAllies, replace: (m, c, pr, max) => `Bei kritischem Treffer: Wendet +${c} ${pr} auf Verbündete an, bis maximal ${max}.` },
        { match: _P.modeGenEnergyTraitAllies, replace: (m, mode, c, tr) => `${_modeLoc(mode, 'de')}: Erzeugt +${c} Fähigkeitsenergie für ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündete.` },
        // --- Batch 8 ---
        { match: _P.ifTraitAlliesApplyProc, replace: (m, n, tr, pr) => `Bei ${n}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten: Wendet ${pr} auf das Primärziel an.` },
        { match: _P.ifTraitAlliesGain, replace: (m, n, tr, pr) => `Bei ${n}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten: Erhält ${pr}.` },
        { match: _P.ifTraitAlliesDmg, replace: (m, n, tr, p) => `Bei ${n}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten: +${p} % Schaden.` },
        { match: _P.ifTraitAlliesFlip, replace: (m, n, tr, c) => `Bei ${n}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten: Wandelt ${c} positive(n) Effekt(e) in negative auf dem Primärziel um.` },
        { match: _P.dmgPerEffectOnTarget, replace: (m, p, type) => `+${p} % Schaden für jeden ${type === 'positive' ? 'positiven' : 'negativen'} Effekt auf dem Primärziel.` },
        { match: _P.reduceSpeedPerTraitAlly, replace: (m, p, tr) => `Reduziert Geschwindigkeitsbalken um ${p} % für jeden ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten.` },
        { match: _P.targetHasGainSpeedBar, replace: (m, pr, p) => `Wenn das Primärziel ${pr} hat: Erhält ${p} % Geschwindigkeitsbalken.` },
        { match: _P.targetHasGenEnergy, replace: (m, pr, c) => `Wenn das Primärziel ${pr} hat: Erzeugt +${c} Fähigkeitsenergie für alle Verbündeten.` },
        { match: _P.targetHasFlipPos, replace: (m, pr, c) => `Wenn das Primärziel ${pr} hat: Wandelt ${c} positive(n) Effekt(e) in negative auf dem Primärziel um.` },
        { match: _P.targetNotHasApply, replace: (m, pr1, pr2) => `Wenn das Primärziel kein ${pr1} hat: Wendet ${pr2} auf das Primärziel an.` },
        { match: _P.otherwiseFlipPos, replace: (m, c) => `Andernfalls: Wandelt ${c} positive(n) Effekt(e) in negative auf dem Primärziel um.` },
        { match: _P.modeNoteAttackCant, replace: (m, mode, what) => `${_modeLoc(mode, 'de')}: Dieser Angriff kann nicht ${what === 'countered' ? 'gekontert' : what === 'blocked' ? 'geblockt' : what === 'dodged' ? 'ausgewichen' : what} werden.` },
        // --- Batch 9 patterns ---
        { match: _P.barrierSelf, replace: (m, p) => `Barriere für ${p} % der max. Gesundheit.` },
        { match: _P.prolongProcBy, replace: (m, pr, c) => `Verlängert die Dauer von ${pr} um ${c}.` },
        { match: _P.notModeChanceApply, replace: (m, mode, ch, pr) => `${_notModeLoc(mode, 'de')}: ${ch} % Chance, ${pr} auf das Primärziel anzuwenden.` },
        { match: _P.modeChanceGain, replace: (m, mode, ch, pr) => `${_modeLoc(mode, 'de')}: ${ch} % Chance, ${pr} zu erhalten.` },
        { match: _P.clearCountProcAllies, replace: (m, c, pr) => `Entfernt ${c} ${pr} von Verbündeten.` },
        { match: _P.applyProcToEnemies, replace: (m, pr, c) => `Wendet ${pr} auf ${c} Feinde an.` },
        { match: _P.applyCountToEnemies, replace: (m, n, pr, c) => `Wendet ${n} ${pr} auf ${c} Feinde an.` },
        { match: _P.applyProcDurToEnemies, replace: (m, pr, t, c) => `Wendet ${pr} für ${t} Runden auf ${c} Feinde an.` },
        { match: _P.clearNegRandomTraitAlly, replace: (m, c, tr) => `Entfernt ${c} negative(n) Effekt(e) von einem zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten.` },
        { match: _P.clearNegMostInjuredTraitAlly, replace: (m, c, tr) => `Entfernt ${c} negative(n) Effekt(e) vom am stärksten verletzten ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten.` },
        { match: _P.onCritStealAllExcl, replace: (m, pr) => `Bei Krit.: Stiehlt alle positiven Effekte vom Primärziel, außer ${pr}.` },
        { match: _P.onAssistApplyMaxTarget, replace: (m, c, pr, max) => `Bei Assist: Wendet +${c} ${pr}, bis zu einem Maximum von ${max} auf das Primärziel an.` },
        { match: _P.copyPosGiveExcl, replace: (m, c, pr) => `Kopiert ${c} positive(n) Effekt(e) vom Primärziel und gibt sie an Verbündete, außer ${pr}.` },
        { match: _P.targetTraitGainProc, replace: (m, tr, pr) => `Wenn das Primärziel ${tr} ist: Erhält ${pr}.` },
        { match: _P.flipPosNEnemies, replace: (m, c, n) => `Wandelt ${c} positive(n) Effekt(e) in negative auf ${n} Feinden um.` },
        { match: _P.barrierRandomTraitAlly, replace: (m, p, tr) => `Barriere für ${p} % der max. Gesundheit für einen zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten.` },
        // --- Batch 10 ---
        { match: _P.piercingAdditional, replace: (m, p) => `+${p} % Durchdringung bei zusätzlichen Feinden.` },
        { match: _P.dmgPierceAdditional, replace: (m, d, p) => `+${d} % Schaden + ${p} % Durchdringung bei zusätzlichen Feinden.` },
        { match: _P.modeApplyPlusRandomAlly, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'de')}: Wendet +${c} ${pr} auf einen zufälligen Verbündeten an.` },
        { match: _P.drainAlliesHealth, replace: (m, p) => `Entzieht ${p} % der max. Gesundheit von Verbündeten.` },
        { match: _P.ifAllyNoteCantMiss, replace: (m, ally) => `Wenn ${ally} ein Verbündeter ist, kann dieser Angriff nicht verfehlen.` },
        { match: _P.targetHasAttackPierceInstead, replace: (m, proc, p) => `Wenn das Primärziel ${proc} hat, greift stattdessen für ${p} % Durchdringung an.` },
        { match: _P.targetHasDrainRedistribute, replace: (m, proc, p, target) => `Wenn das Primärziel ${proc} hat, entzieht ${p} % der max. Gesundheit des Ziels und verteilt an ${target}.` },
        { match: _P.modeOnCritClearNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'de')}: Bei Krit., entfernt ${c} negative(n) Effekt(e) von Verbündeten.` },
        { match: _P.ifAllyStealAllGiveExcl, replace: (m, ally, pr) => `Wenn ${ally} ein Verbündeter ist, stiehlt alle positiven Effekte vom Primärziel und gibt sie Verbündeten, außer ${pr}.` },
        { match: _P.applyProcToAllyHighest, replace: (m, pr, tr, stat) => `Wendet ${pr} auf den ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten mit dem höchsten ${stat} an.` },
        { match: _P.applyProcRandomAllyBelowHealth, replace: (m, pr, p) => `Wendet ${pr} auf einen zufälligen Verbündeten unter ${p} % Gesundheit an.` },
        { match: _P.allAlliesHaveGainSpeedBar, replace: (m, proc, p) => `Wenn alle Verbündeten ${proc} haben: Erhält ${p} % Geschwindigkeitsleiste.` },
        { match: _P.targetHasStealCountExcl, replace: (m, proc, c, pr) => `Wenn das Primärziel ${proc} hat, stiehlt ${c} positive(n) Effekt(e) vom Primärziel, außer ${pr}.` },
        { match: _P.selfHasLessThanApplyMaxAllies, replace: (m, n, proc, c, pr, max) => `Wenn man weniger als ${n} ${proc} hat, wendet +${c} ${pr}, bis zu einem Maximum von ${max} auf Verbündete an.` },
        { match: _P.targetTraitApplyProcAllyHighest, replace: (m, tr, pr, stat) => `Wenn das Primärziel ${tr} ist, wendet ${pr} auf den Verbündeten mit dem höchsten ${stat} an.` },
        { match: _P.modeIfTraitAlliesStealProc, replace: (m, mode, c, tr, proc) => `${_modeLoc(mode, 'de')}: Wenn ${c}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündete, stiehlt ${proc} vom Primärziel und gibt es Verbündeten.` },
        // --- Batch 11 ---
        { match: _P.targetHasPosClearPos, replace: (m, c) => `Wenn das Primärziel positive Effekte hat, entfernt ${c} positive(n) Effekt(e) vom Primärziel.` },
        { match: _P.modeSubTargetHasDrain, replace: (m, mode, sub, proc, p) => `${_modeLoc(mode, 'de')}, ${sub}: Wenn das Primärziel ${proc} hat, entzieht ${p} % der max. Gesundheit des Ziels.` },
        { match: _P.modeSubReduceDur, replace: (m, mode, sub, proc, c) => `${_modeLoc(mode, 'de')}, ${sub}: Reduziert die Dauer von ${proc} um ${c}.` },
        { match: _P.modeApplyPlusRandomAllyExclSelf, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'de')}: Wendet +${c} ${pr} auf einen zufälligen Verbündeten an (außer sich selbst).` },
        { match: _P.modeOrSubClearNegRandomTraitAlly, replace: (m, m1, m2, sub, c, tr) => `${_modeLoc(m1, 'de')} oder ${_modeLoc(m2, 'de')}, ${sub}: Entfernt ${c} negative(n) Effekt(e) von einem zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten.` },
        { match: _P.selfHasClearPos, replace: (m, proc, c) => `Wenn man ${proc} hat, entfernt ${c} positive(n) Effekt(e) vom Primärziel.` },
        { match: _P.selfNotHasFlipPos, replace: (m, proc, c) => `Wenn man kein ${proc} hat, wandelt ${c} positive(n) Effekt(e) in negative auf dem Primärziel um.` },
        { match: _P.selfHasClearNegSelf, replace: (m, proc) => `Wenn man ${proc} hat, entfernt alle negativen Effekte von sich selbst.` },
        { match: _P.selfHasClearCountFromSelf, replace: (m, proc, c, pr) => `Wenn man ${proc} hat, entfernt ${c} ${pr} von sich selbst.` },
        { match: _P.targetHasClearAllProc, replace: (m, proc, pr) => `Wenn das Primärziel ${proc} hat, entfernt alle(s) ${pr} vom Primärziel.` },
        { match: _P.onAssistTargetHasClearAllProc, replace: (m, proc, pr) => `Bei Assist: Wenn das Primärziel ${proc} hat, entfernt alle(s) ${pr} vom Primärziel.` },
        { match: _P.targetTraitApplyCountDur, replace: (m, tr, c, pr, t) => `Wenn das Primärziel ${tr} ist: Wendet ${c} ${pr} für ${t} Runden auf das Primärziel an.` },
        { match: _P.targetTraitApplyCount, replace: (m, tr, c, pr) => `Wenn das Primärziel ${tr} ist: Wendet ${c} ${pr} auf das Primärziel an.` },
        { match: _P.onCritBarrierAllies, replace: (m, p) => `Bei Krit.: Barriere für ${p} % der max. Gesundheit für Verbündete.` },
        { match: _P.ifTraitAlliesCritChance, replace: (m, c, tr, p) => `Wenn ${c}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündete: +${p} % Krit. Chance.` },
        { match: _P.ifTraitAlliesCritPerAlly, replace: (m, c, tr, p, tr2) => `Wenn ${c}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündete: +${p} % Krit. Chance pro ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten.` },
        // --- Batch 12 ---
        { match: _P.onCritGenEnergyRandomAlly, replace: (m, c) => `Bei Krit.: Erzeugt +${c} Fähigkeitsenergie für einen zufälligen Verbündeten.` },
        { match: _P.onCounterOnCritGenEnergy, replace: (m, c) => `Bei Konter, bei Krit.: Erzeugt +${c} Fähigkeitsenergie für einen zufälligen Verbündeten.` },
        { match: _P.removeBarrierTarget, replace: () => `Entfernt die Barriere vom Primärziel.` },
        { match: _P.modeSubFlipNegToPosAllies, replace: (m, mode, sub) => `${_modeLoc(mode, 'de')}, ${sub}: Wandelt alle negativen Effekte in positive auf Verbündeten um.` },
        { match: _P.modeSubTargetNotTraitDrain, replace: (m, mode, sub, tr, p) => `${_modeLoc(mode, 'de')}, ${sub}: Wenn das Primärziel nicht ${tr} ist, entzieht ${p} % der max. Gesundheit des Ziels.` },
        { match: _P.targetNotHasClearPos, replace: (m, proc, c) => `Wenn das Primärziel kein ${proc} hat, entfernt ${c} positive(n) Effekt(e) vom Primärziel.` },
        { match: _P.selfHasGainSpeedBar, replace: (m, proc, p) => `Wenn man ${proc} hat: Erhält ${p} % Geschwindigkeitsleiste.` },
        { match: _P.selfHasGainCount, replace: (m, proc, c, pr) => `Wenn man ${proc} hat: Erhält ${c} ${pr}.` },
        { match: _P.healTarget, replace: (m, p) => `Heilt das Primärziel um ${p} % der max. Gesundheit.` },
        { match: _P.ifAllyApplyCount, replace: (m, ally, c, pr) => `Wenn ${ally} ein Verbündeter ist: Wendet ${c} ${pr} auf das Primärziel an.` },
        { match: _P.notModeChanceGain, replace: (m, mode, p, pr) => `${_notModeLoc(mode, 'de')}: ${p} % Chance, ${pr} zu erhalten.` },
        { match: _P.ifAllyDmgPierce, replace: (m, ally, d, p) => `Wenn ${ally} ein Verbündeter ist: +${d} % Schaden + ${p} % Durchdringung.` },
        { match: _P.ifAllyApplyDur, replace: (m, ally, pr, t) => `Wenn ${ally} ein Verbündeter ist: Wendet ${pr} für ${t} Runden auf das Primärziel an.` },
        { match: _P.selfIsTraitApplyProc, replace: (m, tr, pr) => `Wenn man ${tr} ist: Wendet ${pr} auf das Primärziel an.` },
        { match: _P.selfNotTraitApplyProc, replace: (m, tr, pr) => `Wenn man nicht ${tr} ist: Wendet ${pr} auf das Primärziel an.` },
        { match: _P.targetTraitApplyProc, replace: (m, tr, pr) => `Wenn das Primärziel ${tr} ist: Wendet ${pr} auf das Primärziel an.` },
        // --- Batch 13 ---
        { match: _P.targetTraitOrApplyCountDurInjured, replace: (m, tr1, tr2, c, pr, t) => `Wenn das Primärziel ${tr1} oder ${tr2} ist: Wendet ${c} ${pr} für ${t} Runden auf den am stärksten verletzten Verbündeten an.` },
        { match: _P.onAssistModeOnCritApply, replace: (m, mode, pr) => `Bei Assist, ${_modeLoc(mode, 'de')}: Bei Krit., wendet ${pr} auf das Primärziel an.` },
        { match: _P.otherwiseSelfOrTargetHasCrit, replace: (m, tr, proc, p) => `Andernfalls, wenn man ${tr} ist oder das Ziel ${proc} hat: +${p} % Krit. Chance.` },
        { match: _P.healthOrChargedDmg, replace: (m, hp, proc, d) => `Wenn dieser Charakter ${hp} % oder weniger Gesundheit hat oder ${proc} hat: +${d} % Schaden.` },
        { match: _P.applyDurTraitAllyLowest, replace: (m, pr, t, tr, stat) => `Wendet ${pr} für ${t} Runden auf den ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten mit dem niedrigsten ${stat} an.` },
        { match: _P.otherwiseTargetHasApplyAllies, replace: (m, proc, c, pr) => `Andernfalls, wenn das Primärziel ${proc} hat: Wendet +${c} ${pr} auf Verbündete an.` },
        { match: _P.modeIfTraitAlliesCallHighest, replace: (m, mode, c, tr, tr2, stat) => `${_modeLoc(mode, 'de')}: Wenn ${c}+ ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündete, ruft den ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten mit dem höchsten ${stat} zur Hilfe.` },
        { match: _P.modeOnAssistTypeGenTraitAlly, replace: (m, mode, type, c, tr) => `${_modeLoc(mode, 'de')}: Bei ${type}-Assist, erzeugt +${c} Fähigkeitsenergie für einen zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten.` },
        { match: _P.selfHasProcCritPerTraitOrAlly, replace: (m, proc, p, tr1, tr2) => `Wenn man ${proc} hat: +${p} % Krit. Chance pro ${tr1}- oder ${tr2}-Verbündeten.` },
        { match: _P.modeHealthReduceDurRandomTraitAlly, replace: (m, mode, hp, c, tr) => `${_modeLoc(mode, 'de')}: Wenn dieser Charakter mehr als ${hp} % Gesundheit hat, reduziert die Dauer negativer Effekte um ${c} auf einem zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}-Verbündeten.` },
        { match: _P.targetHasAndHasRemoveBarrier, replace: (m, p1, p2) => `Wenn das Primärziel ${p1} und ${p2} hat: Entfernt die Barriere vom Primärziel.` },
        { match: _P.selfHasCountAnyEnemyFlip, replace: (m, c, proc, n) => `Wenn man ${c}+ ${proc} hat und ein Feind positive Effekte hat: Wandelt ${n} positive(n) Effekt(e) in negative auf dem Primärziel um.` },
        { match: _P.selfLessCountAnyEnemyFlip, replace: (m, c, proc, n) => `Wenn man weniger als ${c} ${proc} hat und ein Feind positive Effekte hat: Wandelt ${n} positive(n) Effekt(e) in negative auf dem Primärziel um.` },
        { match: _P.modeOnCritProlongNegExcl, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'de')}: Bei Krit., verlängert die Dauer aller negativen Effekte, außer ${pr}, um ${c}.` },
        { match: _P.modeOnCritProlongProc, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'de')}: Bei Krit., verlängert die Dauer von ${pr} um ${c}.` },
        { match: _P.modeBarrierRandomAlly, replace: (m, mode, p) => `${_modeLoc(mode, 'de')}: Barriere für ${p} % der max. Gesundheit für einen zufälligen Verbündeten.` },
        // --- Batch 14 ---
        { match: _P.modeEnergyFullOnCritGenRandomAlly, replace: (m, mode, c) => `${_modeLoc(mode, 'de')}: Wenn Fähigkeitsenergie voll ist, bei Krit., erzeuge +${c} Fähigkeitsenergie für einen zufälligen Verbündeten.` },
        { match: _P.modeEnergyFullOnCritGenSelf, replace: (m, mode, c) => `${_modeLoc(mode, 'de')}: Wenn Fähigkeitsenergie voll ist, bei Krit., erzeuge +${c} Fähigkeitsenergie für sich selbst.` },
        { match: _P.healthLessThanDrain, replace: (m, hp, d) => `Wenn dieser Charakter weniger als ${hp} % Gesundheit hat, +${d} % Lebensentzug.` },
        { match: _P.healthOrMoreApplyDurTarget, replace: (m, hp, pr, t) => `Wenn dieser Charakter ${hp} % oder mehr Gesundheit hat, wende ${pr} für ${t} Runden auf das Hauptziel an.` },
        { match: _P.barrierOrMoreApplyDurAllies, replace: (m, bp, pr, t) => `Wenn dieser Charakter ${bp} % oder mehr Barriere hat, wende ${pr} für ${t} Runden auf Verbündete an.` },
        { match: _P.barrierOrMoreGainDur, replace: (m, bp, pr, t) => `Wenn dieser Charakter ${bp} % oder mehr Barriere hat, erhalte ${pr} für ${t} Runden.` },
        { match: _P.onTypeAssistGenAllAllies, replace: (m, type, c) => `Bei ${type}-Unterstützung, erzeuge +${c} Fähigkeitsenergie für alle Verbündeten.` },
        { match: _P.onTypeAssistGenChar, replace: (m, type, c, ch) => `Bei ${type}-Unterstützung, erzeuge +${c} Fähigkeitsenergie für ${ch}.` },
        { match: _P.ifNotFacingApplyTarget, replace: (m, ch, pr) => `Wenn nicht gegen ${ch} gekämpft wird, wende ${pr} auf das Hauptziel an.` },
        { match: _P.targetTraitApplyInjuredAlly, replace: (m, tr, pr) => `Wenn das Hauptziel ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} ist, wende ${pr} auf den am meisten verletzten Verbündeten an.` },
        { match: _P.copyAllGiveAlliesExclTwo, replace: (m, pr1, pr2) => `Kopiere alle positive(n) Effekt(e) vom Hauptziel und gib sie den Verbündeten, außer ${pr1} und ${pr2}.` },
        { match: _P.noteCantCritHit, replace: () => `Dieser Angriff kann nicht kritisch treffen.` },
        { match: _P.modeApplyAllies, replace: (m, mode, pr) => `${_modeLoc(mode, 'de')}: Wende ${pr} auf Verbündete an.` },
        { match: _P.targetTraitApplyCountMaxInjured, replace: (m, tr, c, pr, mx) => `Wenn das Hauptziel ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} ist, wende +${c} ${pr} an, bis zu einem Maximum von ${mx} auf den am meisten verletzten Verbündeten.` },
        { match: _P.modeGenEnergyChar, replace: (m, mode, c, ch) => `${_modeLoc(mode, 'de')}: Erzeuge +${c} Fähigkeitsenergie für ${ch}.` },
        { match: _P.targetTraitApplyInjuredWithout, replace: (m, tr, pr, pr2) => `Wenn das Hauptziel ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} ist, wende ${pr} auf den am meisten verletzten Verbündeten ohne ${pr2} an.` },
        { match: _P.modeHealRandomTraitAlly, replace: (m, mode, tr, hp) => `${_modeLoc(mode, 'de')}: Heile einen zufälligen ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} Verbündeten um ${hp} % der max. Gesundheit.` },
        { match: _P.selfHasOrLessApplyMaxAllies, replace: (m, c, pr, c2, pr2, mx) => `Wenn selbst ${c} oder weniger ${pr} hat, wende +${c2} ${pr2} an, bis zu einem Maximum von ${mx} auf Verbündete.` },
        { match: _P.selfHasProcChanceApplyTarget, replace: (m, pr, pct, pr2) => `Wenn selbst ${pr} hat, ${pct} % Chance, ${pr2} auf das Hauptziel anzuwenden.` },
        { match: _P.otherwiseSelfHasChanceGain, replace: (m, pr, pct, pr2) => `Andernfalls, wenn selbst ${pr} hat, ${pct} % Chance, ${pr2} zu erhalten.` },
        { match: _P.otherwiseSelfHasHealInjured, replace: (m, pr, hp) => `Andernfalls, wenn selbst ${pr} hat, heile den am meisten verletzten Verbündeten um ${hp} % der max. Gesundheit.` },
      ],
    },
    // ==================== SPANISH ====================
    es: {
      damageLine: (dmg, pierce, drain) => {
        const p = [];
        if (dmg > 0) p.push(`<span class="msf-iso8-damage-value">${dmg} %</span> de daño`);
        if (pierce > 0) p.push(`<span class="msf-iso8-piercing-value">${pierce} %</span> de daño penetrante`);
        if (drain > 0) p.push(`<span class="msf-iso8-drain-value">${drain} %</span> de absorción`);
        return p.length > 0 ? `⚔️ Ataca al objetivo principal e inflige un ${p.join(' + ')}` : null;
      },
      title: 'ISO-8 Contra/Asistencia',
      patterns: [
        { match: _P.forcedDmgPierce, replace: (m, d, p, tr) => `Cuando se le obliga a atacar a un aliado, este personaje inflige un ${d} % de daño + ${p} % de daño penetrante a los personajes ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.forcedDmg, replace: (m, d, tr) => `Cuando se le obliga a atacar a un aliado, este personaje inflige un ${d} % de daño a los personajes ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.flipEffects, replace: (m, n, c) => `Si ${n} es un aliado, convierte ${c} efectos positivos aleatorios del objetivo principal en negativos.` },
        { match: _P.flipRandom, replace: (m, n, c) => `Si ${n} es un aliado, convierte ${c} efectos positivos aleatorios del objetivo principal en negativos.` },
        { match: _P.applyProc, replace: (m, pr) => `Aplica ${pr} al objetivo principal.` },
        { match: _P.applyCount, replace: (m, c, pr) => `Aplica ${c} cargas de ${pr} al objetivo principal.` },
        { match: _P.applyPlusDur, replace: (m, c, pr, t) => `Aplica +${c} ${pr} durante ${t} turnos al objetivo principal.` },
        { match: _P.applyPlus, replace: (m, c, pr) => `Aplica +${c} ${pr} al objetivo principal.` },
        { match: _P.applyAllies, replace: (m, c, pr) => `Aplica +${c} ${pr} a los aliados.` },
        { match: _P.gainPlus, replace: (m, c, pr) => `Obtiene +${c} ${pr}.` },
        { match: _P.gainSpeedBar, replace: (m, p) => `Obtiene ${p} % de barra de velocidad.` },
        { match: _P.reduceSpeedBar, replace: (m, p) => `Reduce la barra de velocidad en un ${p} %.` },
        { match: _P.gain, replace: (m, pr) => `Obtiene ${pr}.` },
        { match: _P.healthGain, replace: (m, p, pr) => `Si este personaje tiene ${p} % de salud o menos, obtiene ${pr}.` },
        { match: _P.healthGeneric, replace: (m, p, r) => `Si este personaje tiene ${p} % de salud o menos, ${r}` },
        // --- New patterns ---
        { match: _P.forcedPierceOnly, replace: (m, p, tr) => `Cuando se le obliga a atacar a un aliado, este personaje inflige un ${p} % de daño penetrante a los personajes ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.ifAllyApplyRandom, replace: (m, n, pr) => `Si ${n} es un aliado, otorga ${pr} a un aliado aleatorio.` },
        { match: _P.selfHasApplyCountDur, replace: (m, proc, c, pr, t) => `Si este personaje tiene ${proc}, aplica ${c} de ${pr} durante ${t} turnos al objetivo principal.` },
        { match: _P.selfHasApply, replace: (m, proc, pr) => `Si este personaje tiene ${proc}, aplica ${pr} al objetivo principal.` },
        { match: _P.selfHasClear, replace: (m, proc, c, pr) => `Si este personaje tiene ${proc}, elimina ${c} ${pr} de los aliados.` },
        { match: _P.selfHasAttackInstead, replace: (m, proc, p, d) => `Si este personaje tiene ${proc}, en su lugar, ataca con un ${p} % de daño penetrante + ${d} % de drenaje.` },
        { match: _P.selfNotHasApply, replace: (m, proc, pr) => `Si este personaje no tiene ${proc}, aplica ${pr} al objetivo principal.` },
        { match: _P.modeGainCount, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'es')}, obtiene ${c} de ${pr}.` },
        { match: _P.modeSelfHasApply, replace: (m, mode, proc, pr) => `${_modeLoc(mode, 'es')}, si este personaje tiene ${proc}, aplica ${pr} al objetivo principal.` },
        { match: _P.onAssistEnergy, replace: (m, type, c) => `En asistencia ${_modeLoc(type, 'es')}, genera +${c} de energía de habilidad para sí mismo.` },
        { match: _P.modeReduceSpeedPerAlly, replace: (m, mode, p, tr) => `${_modeLoc(mode, 'es')}, reduce la barra de velocidad en un ${p} % por cada aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.healthHealAllies, replace: (m, p, h) => `Si este personaje tiene menos del ${p} % de salud, cura a los aliados un ${h} % de la salud máxima.` },
        { match: _P.modeIgnoresDefUp, replace: (m, mode) => `${_modeLoc(mode, 'es')}, este ataque ignora la subida de defensa.` },
        // --- Batch 3 patterns ---
        { match: _P.modeIfSelfHasCountDmg, replace: (m, mode, c, proc, d) => `${_modeLoc(mode, 'es')}, si este personaje tiene ${c}+ ${proc}, +${d} % de daño.` },
        { match: _P.clearPosTarget, replace: (m, c) => `Elimina ${c} efecto(s) positivo(s) del objetivo principal.` },
        { match: _P.applyAlliesNamed, replace: (m, pr) => `Aplica ${pr} a los aliados.` },
        { match: _P.clearNegAllies, replace: (m, c) => `Elimina ${c} efecto(s) negativo(s) de los aliados.` },
        { match: _P.applyMostInjured, replace: (m, pr) => `Aplica ${pr} al aliado más herido.` },
        { match: _P.clearNegMostInjured, replace: (m, c) => `Elimina ${c} efecto(s) negativo(s) del aliado más herido.` },
        { match: _P.modeApplyRandomTraitAlly, replace: (m, mode, c, pr, tr) => `${_modeLoc(mode, 'es')}, aplica +${c} ${pr} a un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio.` },
        { match: _P.targetNotTraitDrain, replace: (m, tr, p) => `Si el objetivo principal no es ${tr}, drena ${p} % de la salud máxima del objetivo.` },
        { match: _P.targetTraitDrain, replace: (m, tr, p) => `Si el objetivo principal es ${tr}, drena ${p} % de la salud máxima del objetivo.` },
        { match: _P.notModeFlip, replace: (m, mode, c) => `${_notModeLoc(mode, 'es')}, convierte ${c} efecto(s) positivo(s) en negativo(s) en el objetivo principal.` },
        { match: _P.modeFlipAll, replace: (m, mode) => `${_modeLoc(mode, 'es')}, convierte todos los efectos positivos en negativos en el objetivo principal.` },
        { match: _P.targetNoPosApply, replace: (m, pr) => `Si el objetivo principal no tiene efectos positivos, aplica ${pr} al objetivo principal.` },
        { match: _P.targetHasApply, replace: (m, proc, pr) => `Si el objetivo principal tiene ${proc}, aplica ${pr} al objetivo principal.` },
        { match: _P.applyUpToMaxRandomAlly, replace: (m, c, pr, max) => `Aplica +${c} ${pr}, hasta un máximo de ${max} a un aliado aleatorio.` },
        { match: _P.onAssistProlongPos, replace: (m, proc, c) => `En asistencia, prolonga la duración de todos los efectos positivos, excepto ${proc}, en ${c} en los aliados.` },
        { match: _P.prolongPosExcluding, replace: (m, proc, c) => `Prolonga la duración de todos los efectos positivos, excepto ${proc}, en ${c} en los aliados.` },
        { match: _P.forcedDmgInstead, replace: (m, p) => `Cuando se le obliga a atacar a un aliado, ataca con un ${p} % de daño en su lugar.` },
        { match: _P.otherwiseDrain, replace: (m, p) => `De lo contrario, drena ${p} % de la salud máxima del objetivo.` },
        { match: _P.anyEnemyHasClearPos, replace: (m, c) => `Si algún enemigo tiene efectos positivos, elimina ${c} efecto(s) positivo(s) del objetivo principal.` },
        { match: _P.clearNegRandomAlly, replace: (m, c) => `Elimina ${c} efecto(s) negativo(s) de un aliado aleatorio.` },
        { match: _P.triggerBattlefield, replace: () => `Activa el efecto del campo de batalla.` },
        { match: _P.noteIgnoresDefUp, replace: () => `Este ataque ignora la subida de defensa.` },
        { match: _P.targetHasOrDmg, replace: (m, pr1, pr2, d) => `Si el objetivo tiene ${pr1} o ${pr2}, +${d} % de daño.` },
        { match: _P.flipAllPos, replace: () => `Convierte todos los efectos positivos en negativos en el objetivo principal.` },
        { match: _P.genEnergyAllAllies, replace: (m, c) => `Genera +${c} de energía de habilidad para todos los aliados.` },
        { match: _P.noteTargetHasOrCantBlock, replace: (m, pr1, pr2) => `Si el objetivo tiene ${pr1} o ${pr2}, este ataque no se puede bloquear.` },
        { match: _P.selfHasDmgBoost, replace: (m, proc, d) => `Si este personaje tiene ${proc}, +${d} % de daño.` },
        { match: _P.clearAllPosTarget, replace: () => `Elimina todos los efectos positivos del objetivo principal.` },
        { match: _P.ifTraitAlliesApplyMax, replace: (m, c, tr, n, pr, max) => `Si ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, aplica +${n} ${pr}, hasta un máximo de ${max} a los aliados.` },
        { match: _P.applyMaxRandomTraitAlly, replace: (m, c, pr, max, tr) => `Aplica +${c} ${pr}, hasta un máximo de ${max} a un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio.` },
        { match: _P.genEnergyTraitAllies, replace: (m, c, tr) => `Genera +${c} de energía de habilidad para los aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 4 patterns ---
        { match: _P.flipCountPos, replace: (m, c) => `Convierte ${c} efecto(s) positivo(s) en negativo(s) en el objetivo principal.` },
        { match: _P.modeFlipCount, replace: (m, mode, c) => `${_modeLoc(mode, 'es')}, convierte ${c} efecto(s) positivo(s) en negativo(s) en el objetivo principal.` },
        { match: _P.onCritReduceSpeed, replace: (m, p) => `Con golpe crítico, reduce la barra de velocidad en ${p} %.` },
        { match: _P.onCritApply, replace: (m, c, pr) => `Con golpe crítico, aplica +${c} ${pr} al objetivo principal.` },
        { match: _P.onAssistPiercing, replace: (m, p) => `En asistencia, +${p} % de daño perforante.` },
        { match: _P.onCounterChanceGain, replace: (m, pct, c, pr) => `En contrataque, ${pct} % de probabilidad de obtener +${c} ${pr}.` },
        { match: _P.stealPosExcluding, replace: (m, c, excl) => `Roba ${c} efecto(s) positivo(s) del objetivo principal y los da a los aliados, excepto ${excl}.` },
        { match: _P.barrierAllies, replace: (m, p) => `Barrera del ${p} % de la salud máxima a los aliados.` },
        { match: _P.barrierMostInjuredNonSummon, replace: (m, p) => `Barrera del ${p} % de la salud máxima al aliado no invocado más herido.` },
        { match: _P.genEnergyRandomAlly, replace: (m, c) => `Genera +${c} de energía de habilidad para un aliado aleatorio.` },
        { match: _P.selfHasReduceDur, replace: (m, proc, proc2, c) => `Si este personaje tiene ${proc}, reduce la duración de ${proc2} en ${c} en los aliados.` },
        { match: _P.prolongNegExcluding, replace: (m, excl, c) => `Prolonga la duración de todos los efectos negativos, excepto ${excl}, en ${c}.` },
        { match: _P.drainDmgDealt, replace: (m, p) => `Drena ${p} % del daño infligido como salud.` },
        { match: _P.drainFlat, replace: (m, p) => `Drena ${p} % de la salud máxima del objetivo.` },
        { match: _P.chanceApply, replace: (m, pct, pr) => `${pct} % de probabilidad de aplicar ${pr} al objetivo principal.` },
        { match: _P.modeReduceSpeed, replace: (m, mode, p) => `${_modeLoc(mode, 'es')}, reduce la barra de velocidad en ${p} %.` },
        { match: _P.modeGain, replace: (m, mode, pr) => `${_modeLoc(mode, 'es')}, obtiene ${pr}.` },
        { match: _P.clearAllProcTarget, replace: (m, pr) => `Elimina todo ${pr} del objetivo principal.` },
        { match: _P.applyRandomAlly, replace: (m, pr) => `Aplica ${pr} a un aliado aleatorio.` },
        { match: _P.attackAdditional, replace: () => `Ataca a un enemigo adicional.` },
        { match: _P.copyNegExcluding, replace: (m, c, excl) => `Copia ${c} efecto(s) negativo(s) del objetivo principal, excepto ${excl}.` },
        { match: _P.noteDebuffsNotResisted, replace: () => `Los debuffs de este ataque no se pueden resistir.` },
        { match: _P.targetTraitReduceSpeed, replace: (m, tr, p) => `Si el objetivo principal es ${tr}, reduce la barra de velocidad en ${p} %.` },
        { match: _P.modeStatPerAlly, replace: (m, mode, p, stat, tr) => `${_modeLoc(mode, 'es')}, +${p} % ${stat} por cada aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.modeReviveAt, replace: (m, mode, name, p) => `${_modeLoc(mode, 'es')}, resucita a ${name} con ${p} % de salud.` },
        // --- Batch 5 patterns ---
        { match: _P.modeTraitAllyStealAllExcl, replace: (m, mode, c, tr, ally, excl) => `${_modeLoc(mode, 'es')}, si ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, si ${ally} es aliado, roba todos los efectos positivos del objetivo principal y los da a los aliados, excepto ${excl}.` },
        { match: _P.modeTraitAllyStealProc, replace: (m, mode, c, tr, ally, proc) => `${_modeLoc(mode, 'es')}, si ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, si ${ally} es aliado, roba ${proc} del objetivo principal y lo da a los aliados.` },
        { match: _P.modeApplyPlus, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'es')}, aplica +${c} ${pr} al objetivo principal.` },
        { match: _P.modeApplyProc, replace: (m, mode, pr) => `${_modeLoc(mode, 'es')}, aplica ${pr} al objetivo principal.` },
        { match: _P.modeApplyAllies, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'es')}, aplica +${c} ${pr} a los aliados.` },
        { match: _P.modeClearCountTarget, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'es')}, elimina ${c} ${pr} del objetivo principal.` },
        { match: _P.otherwiseApplyPlus, replace: (m, c, pr) => `De lo contrario, aplica +${c} ${pr} al objetivo principal.` },
        { match: _P.otherwiseApplyProc, replace: (m, pr) => `De lo contrario, aplica ${pr} al objetivo principal.` },
        { match: _P.otherwiseModeClearAllPos, replace: (m, mode) => `De lo contrario, ${_modeLoc(mode, 'es')}, elimina todos los efectos positivos del objetivo principal.` },
        { match: _P.clearFromSelf, replace: (m, pr) => `Elimina todo ${pr} de sí mismo.` },
        { match: _P.clearCountProcTarget, replace: (m, c, pr) => `Elimina ${c} ${pr} del objetivo principal.` },
        { match: _P.selfNotHasClearNeg, replace: (m, proc) => `Si este personaje no tiene ${proc}, elimina todos los efectos negativos de los aliados.` },
        { match: _P.selfNotHasApplyMaxAllies, replace: (m, proc, c, pr, max) => `Si este personaje no tiene ${proc}, aplica +${c} ${pr}, hasta un máximo de ${max} a los aliados.` },
        { match: _P.targetHasReduceSpeed, replace: (m, proc, p) => `Si el objetivo principal tiene ${proc}, reduce la barra de velocidad en ${p} %.` },
        { match: _P.targetHasApplyAllies, replace: (m, proc, c, pr, max) => `Si el objetivo principal tiene ${proc}, aplica +${c} ${pr}, hasta un máximo de ${max} a los aliados.` },
        { match: _P.targetTraitGainMax, replace: (m, tr, c, pr, max) => `Si el objetivo principal es ${tr}, obtiene +${c} ${pr}, hasta un máximo de ${max}.` },
        { match: _P.modeOnCritApply, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'es')}, con golpe crítico, aplica +${c} ${pr} al objetivo principal.` },
        { match: _P.notModeOnCritReduceSpeed, replace: (m, mode, p) => `${_notModeLoc(mode, 'es')}, con golpe crítico, reduce la barra de velocidad en ${p} %.` },
        { match: _P.modeCallAssist, replace: (m, mode, tr) => `${_modeLoc(mode, 'es')}, llama a un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio a asistir.` },
        { match: _P.modeNoteCantDodge, replace: (m, mode) => `${_modeLoc(mode, 'es')}, este ataque no se puede eludir.` },
        { match: _P.modeTargetHasReduceDur, replace: (m, mode, proc, proc2, c) => `${_modeLoc(mode, 'es')}, si el objetivo principal tiene ${proc}, reduce la duración de ${proc2} en ${c}.` },
        { match: _P.modeProlongNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'es')}, prolonga la duración de los efectos negativos en ${c}.` },
        { match: _P.notModeProlongNegExcl, replace: (m, mode, excl, c) => `${_notModeLoc(mode, 'es')}, prolonga la duración de todos los efectos negativos, excepto ${excl}, en ${c}.` },
        { match: _P.stealAllExcluding, replace: (m, excl) => `Roba todos los efectos positivos del objetivo principal, excepto ${excl}.` },
        { match: _P.stealAllGiveExcluding, replace: (m, excl) => `Roba todos los efectos positivos del objetivo principal y los da a los aliados, excepto ${excl}.` },
        { match: _P.transferAllPos, replace: () => `Transfiere todos los efectos positivos de sí mismo como efectos negativos.` },
        { match: _P.applyMostInjuredTrait, replace: (m, c, pr, tr) => `Aplica ${c} ${pr} al aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} más herido.` },
        { match: _P.onAssistApplyMaxAllies, replace: (m, c, pr, max) => `En asistencia, aplica +${c} ${pr}, hasta un máximo de ${max} a los aliados.` },
        { match: _P.selfHasMoreModeProlongNeg, replace: (m, n, proc, mode, c) => `Si este personaje tiene más de ${n} ${proc}, ${_modeLoc(mode, 'es')}, prolonga la duración de los efectos negativos en ${c}.` },
        { match: _P.selfHasMoreNotModeProlongNegExcl, replace: (m, n, proc, mode, excl, c) => `Si este personaje tiene más de ${n} ${proc}, ${_notModeLoc(mode, 'es')}, prolonga la duración de todos los efectos negativos, excepto ${excl}, en ${c}.` },
        { match: _P.barrierMostInjured, replace: (m, p) => `Barrera del ${p} % de la salud máxima al aliado más herido.` },
        { match: _P.onAssistDmg, replace: (m, p) => `En asistencia, +${p} % de daño.` },
        // --- Batch 6 patterns ---
        { match: _P.onTriggerGainPlus, replace: (m, trig, c, pr) => `En ${trig === 'Counter' ? 'contraataque' : 'golpe crítico'}, obtiene +${c} ${pr}.` },
        { match: _P.flipNegToPosAllies, replace: (m, c) => `Convierte ${c} efecto(s) negativo(s) en positivo(s) en los aliados.` },
        { match: _P.stealProcGiveAllies, replace: (m, pr) => `Roba ${pr} del objetivo principal y lo da a los aliados.` },
        { match: _P.selfHasCritBoost, replace: (m, pr, p) => `Si este personaje tiene ${pr}, +${p} % de probabilidad de golpe crítico.` },
        { match: _P.traitAllyExistsDmg, replace: (m, tr, p) => `Si existe un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % de daño.` },
        { match: _P.applyProcMostInjuredTrait, replace: (m, pr, tr) => `Aplica ${pr} al aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} más herido.` },
        // --- Batch 7 patterns ---
        { match: _P.applyProcRandomTraitAlly, replace: (m, pr, tr) => `Aplica ${pr} a un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio.` },
        { match: _P.modeStatBoost, replace: (m, mode, p, stat) => `${_modeLoc(mode, 'es')}, +${p} % ${stat}.` },
        { match: _P.ifAllyNoteAttackCant, replace: (m, name, what) => `Si ${name} es un aliado, este ataque no puede ser ${what === 'dodged' ? 'esquivado' : what === 'blocked' ? 'bloqueado' : what === 'missed' ? 'fallado' : what}.` },
        { match: _P.statPerTraitAlly, replace: (m, p, stat, tr) => `+${p} % ${stat} por cada aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.genEnergyForNamed, replace: (m, c, name) => `Genera +${c} energía de habilidad para ${name}.` },
        { match: _P.healRandomTraitAlly, replace: (m, tr, p) => `Cura a un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio en un ${p} % de la salud máxima.` },
        { match: _P.targetHasStatBoost, replace: (m, proc, p, stat) => `Si el objetivo tiene ${proc}, +${p} % ${stat}.` },
        { match: _P.flipNegToPosRandomTraitAlly, replace: (m, c, tr) => `Convierte ${c} efecto(s) negativo(s) en positivo(s) en un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio.` },
        { match: _P.drainRedistribute, replace: (m, p, target) => `Drena ${p} % de la salud máxima del objetivo y redistribuye a los aliados ${_traitLoc(target, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.selfNotHasApplyAllies, replace: (m, proc, pr) => `Si este personaje no tiene ${proc}, aplica ${pr} a los aliados.` },
        { match: _P.selfIsTraitDmg, replace: (m, tr, p) => `Si este personaje es ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % de daño.` },
        { match: _P.healAllies, replace: (m, p) => `Cura a los aliados en un ${p} % de la salud máxima.` },
        { match: _P.stealCountExcluding, replace: (m, c, excl) => `Roba ${c} efecto(s) positivo(s) del objetivo principal, excepto ${excl}.` },
        { match: _P.onCritApplyMaxAllies, replace: (m, c, pr, max) => `En golpe crítico, aplica +${c} ${pr}, hasta un máximo de ${max} a los aliados.` },
        { match: _P.modeGenEnergyTraitAllies, replace: (m, mode, c, tr) => `${_modeLoc(mode, 'es')}, genera +${c} energía de habilidad para los aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 8 ---
        { match: _P.ifTraitAlliesApplyProc, replace: (m, n, tr, pr) => `Si ${n}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, aplica ${pr} al objetivo principal.` },
        { match: _P.ifTraitAlliesGain, replace: (m, n, tr, pr) => `Si ${n}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, obtiene ${pr}.` },
        { match: _P.ifTraitAlliesDmg, replace: (m, n, tr, p) => `Si ${n}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % de daño.` },
        { match: _P.ifTraitAlliesFlip, replace: (m, n, tr, c) => `Si ${n}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, convierte ${c} efecto(s) positivo(s) a negativo(s) en el objetivo principal.` },
        { match: _P.dmgPerEffectOnTarget, replace: (m, p, type) => `+${p} % de daño por cada efecto ${type === 'positive' ? 'positivo' : 'negativo'} en el objetivo principal.` },
        { match: _P.reduceSpeedPerTraitAlly, replace: (m, p, tr) => `Reduce la barra de velocidad en un ${p} % por cada aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.targetHasGainSpeedBar, replace: (m, pr, p) => `Si el objetivo principal tiene ${pr}, obtiene ${p} % de barra de velocidad.` },
        { match: _P.targetHasGenEnergy, replace: (m, pr, c) => `Si el objetivo principal tiene ${pr}, genera +${c} energía de habilidad para todos los aliados.` },
        { match: _P.targetHasFlipPos, replace: (m, pr, c) => `Si el objetivo principal tiene ${pr}, convierte ${c} efecto(s) positivo(s) a negativo(s) en el objetivo principal.` },
        { match: _P.targetNotHasApply, replace: (m, pr1, pr2) => `Si el objetivo principal no tiene ${pr1}, aplica ${pr2} al objetivo principal.` },
        { match: _P.otherwiseFlipPos, replace: (m, c) => `De lo contrario, convierte ${c} efecto(s) positivo(s) a negativo(s) en el objetivo principal.` },
        { match: _P.modeNoteAttackCant, replace: (m, mode, what) => `${_modeLoc(mode, 'es')}, este ataque no puede ser ${what === 'countered' ? 'contrarrestado' : what === 'blocked' ? 'bloqueado' : what === 'dodged' ? 'eludido' : what}.` },
        // --- Batch 9 patterns ---
        { match: _P.barrierSelf, replace: (m, p) => `Barrera del ${p} % de la salud máxima.` },
        { match: _P.prolongProcBy, replace: (m, pr, c) => `Prolonga la duración de ${pr} en ${c}.` },
        { match: _P.notModeChanceApply, replace: (m, mode, ch, pr) => `${_notModeLoc(mode, 'es')}, ${ch} % de probabilidad de aplicar ${pr} al objetivo principal.` },
        { match: _P.modeChanceGain, replace: (m, mode, ch, pr) => `${_modeLoc(mode, 'es')}, ${ch} % de probabilidad de obtener ${pr}.` },
        { match: _P.clearCountProcAllies, replace: (m, c, pr) => `Elimina ${c} ${pr} de los aliados.` },
        { match: _P.applyProcToEnemies, replace: (m, pr, c) => `Aplica ${pr} a ${c} enemigos.` },
        { match: _P.applyCountToEnemies, replace: (m, n, pr, c) => `Aplica ${n} ${pr} a ${c} enemigos.` },
        { match: _P.applyProcDurToEnemies, replace: (m, pr, t, c) => `Aplica ${pr} durante ${t} turnos a ${c} enemigos.` },
        { match: _P.clearNegRandomTraitAlly, replace: (m, c, tr) => `Elimina ${c} efecto(s) negativo(s) de un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio.` },
        { match: _P.clearNegMostInjuredTraitAlly, replace: (m, c, tr) => `Elimina ${c} efecto(s) negativo(s) del aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} más herido.` },
        { match: _P.onCritStealAllExcl, replace: (m, pr) => `En golpe crítico, roba todos los efectos positivos del objetivo principal, excluyendo ${pr}.` },
        { match: _P.onAssistApplyMaxTarget, replace: (m, c, pr, max) => `En asistencia, aplica +${c} ${pr}, hasta un máximo de ${max} al objetivo principal.` },
        { match: _P.copyPosGiveExcl, replace: (m, c, pr) => `Copia ${c} efecto(s) positivo(s) del objetivo principal y los da a los aliados, excluyendo ${pr}.` },
        { match: _P.targetTraitGainProc, replace: (m, tr, pr) => `Si el objetivo principal es ${tr}, obtiene ${pr}.` },
        { match: _P.flipPosNEnemies, replace: (m, c, n) => `Convierte ${c} efecto(s) positivo(s) a negativo(s) en ${n} enemigos.` },
        { match: _P.barrierRandomTraitAlly, replace: (m, p, tr) => `Barrera del ${p} % de la salud máxima a un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio.` },
        // --- Batch 10 ---
        { match: _P.piercingAdditional, replace: (m, p) => `+${p} % de penetración a enemigos adicionales.` },
        { match: _P.dmgPierceAdditional, replace: (m, d, p) => `+${d} % de daño + ${p} % de penetración a enemigos adicionales.` },
        { match: _P.modeApplyPlusRandomAlly, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'es')}, aplica +${c} ${pr} a un aliado aleatorio.` },
        { match: _P.drainAlliesHealth, replace: (m, p) => `Drena ${p} % de la salud máxima de los aliados.` },
        { match: _P.ifAllyNoteCantMiss, replace: (m, ally) => `Si ${ally} es un aliado, este ataque no puede fallar.` },
        { match: _P.targetHasAttackPierceInstead, replace: (m, proc, p) => `Si el objetivo principal tiene ${proc}, ataca por ${p} % de penetración en su lugar.` },
        { match: _P.targetHasDrainRedistribute, replace: (m, proc, p, target) => `Si el objetivo principal tiene ${proc}, drena ${p} % de la salud máxima del objetivo y redistribuye a los ${target}.` },
        { match: _P.modeOnCritClearNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'es')}, en golpe crítico, elimina ${c} efecto(s) negativo(s) de los aliados.` },
        { match: _P.ifAllyStealAllGiveExcl, replace: (m, ally, pr) => `Si ${ally} es un aliado, roba todos los efectos positivos del objetivo principal y los da a los aliados, excluyendo ${pr}.` },
        { match: _P.applyProcToAllyHighest, replace: (m, pr, tr, stat) => `Aplica ${pr} al aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} con el mayor ${stat}.` },
        { match: _P.applyProcRandomAllyBelowHealth, replace: (m, pr, p) => `Aplica ${pr} a un aliado aleatorio por debajo del ${p} % de salud.` },
        { match: _P.allAlliesHaveGainSpeedBar, replace: (m, proc, p) => `Si todos los aliados tienen ${proc}, obtiene ${p} % de barra de velocidad.` },
        { match: _P.targetHasStealCountExcl, replace: (m, proc, c, pr) => `Si el objetivo principal tiene ${proc}, roba ${c} efecto(s) positivo(s) del objetivo principal, excluyendo ${pr}.` },
        { match: _P.selfHasLessThanApplyMaxAllies, replace: (m, n, proc, c, pr, max) => `Si tiene menos de ${n} ${proc}, aplica +${c} ${pr}, hasta un máximo de ${max} a los aliados.` },
        { match: _P.targetTraitApplyProcAllyHighest, replace: (m, tr, pr, stat) => `Si el objetivo principal es ${tr}, aplica ${pr} al aliado con el mayor ${stat}.` },
        { match: _P.modeIfTraitAlliesStealProc, replace: (m, mode, c, tr, proc) => `${_modeLoc(mode, 'es')}, si ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, roba ${proc} del objetivo principal y lo da a los aliados.` },
        // --- Batch 11 ---
        { match: _P.targetHasPosClearPos, replace: (m, c) => `Si el objetivo principal tiene efectos positivos, elimina ${c} efecto(s) positivo(s) del objetivo principal.` },
        { match: _P.modeSubTargetHasDrain, replace: (m, mode, sub, proc, p) => `${_modeLoc(mode, 'es')}, ${sub}, si el objetivo principal tiene ${proc}, drena ${p} % de la salud máxima del objetivo.` },
        { match: _P.modeSubReduceDur, replace: (m, mode, sub, proc, c) => `${_modeLoc(mode, 'es')}, ${sub}, reduce la duración de ${proc} en ${c}.` },
        { match: _P.modeApplyPlusRandomAllyExclSelf, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'es')}, aplica +${c} ${pr} a un aliado aleatorio (excluyéndose).` },
        { match: _P.modeOrSubClearNegRandomTraitAlly, replace: (m, m1, m2, sub, c, tr) => `${_modeLoc(m1, 'es')} o ${_modeLoc(m2, 'es')}, ${sub}, elimina ${c} efecto(s) negativo(s) de un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio.` },
        { match: _P.selfHasClearPos, replace: (m, proc, c) => `Si tiene ${proc}, elimina ${c} efecto(s) positivo(s) del objetivo principal.` },
        { match: _P.selfNotHasFlipPos, replace: (m, proc, c) => `Si no tiene ${proc}, convierte ${c} efecto(s) positivo(s) a negativo(s) en el objetivo principal.` },
        { match: _P.selfHasClearNegSelf, replace: (m, proc) => `Si tiene ${proc}, elimina todos los efectos negativos de sí mismo.` },
        { match: _P.selfHasClearCountFromSelf, replace: (m, proc, c, pr) => `Si tiene ${proc}, elimina ${c} ${pr} de sí mismo.` },
        { match: _P.targetHasClearAllProc, replace: (m, proc, pr) => `Si el objetivo principal tiene ${proc}, elimina todo ${pr} del objetivo principal.` },
        { match: _P.onAssistTargetHasClearAllProc, replace: (m, proc, pr) => `En asistencia, si el objetivo principal tiene ${proc}, elimina todo ${pr} del objetivo principal.` },
        { match: _P.targetTraitApplyCountDur, replace: (m, tr, c, pr, t) => `Si el objetivo principal es ${tr}, aplica ${c} ${pr} durante ${t} turnos al objetivo principal.` },
        { match: _P.targetTraitApplyCount, replace: (m, tr, c, pr) => `Si el objetivo principal es ${tr}, aplica ${c} ${pr} al objetivo principal.` },
        { match: _P.onCritBarrierAllies, replace: (m, p) => `En golpe crítico, barrera del ${p} % de la salud máxima a los aliados.` },
        { match: _P.ifTraitAlliesCritChance, replace: (m, c, tr, p) => `Si ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % de probabilidad de crítico.` },
        { match: _P.ifTraitAlliesCritPerAlly, replace: (m, c, tr, p, tr2) => `Si ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % de probabilidad de crítico por aliado ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 12 ---
        { match: _P.onCritGenEnergyRandomAlly, replace: (m, c) => `En golpe crítico, genera +${c} energía de habilidad para un aliado aleatorio.` },
        { match: _P.onCounterOnCritGenEnergy, replace: (m, c) => `En contraataque, en golpe crítico, genera +${c} energía de habilidad para un aliado aleatorio.` },
        { match: _P.removeBarrierTarget, replace: () => `Elimina la barrera del objetivo principal.` },
        { match: _P.modeSubFlipNegToPosAllies, replace: (m, mode, sub) => `${_modeLoc(mode, 'es')}, ${sub}, convierte todos los efectos negativos a positivos en los aliados.` },
        { match: _P.modeSubTargetNotTraitDrain, replace: (m, mode, sub, tr, p) => `${_modeLoc(mode, 'es')}, ${sub}, si el objetivo principal no es ${tr}, drena ${p} % de la salud máxima del objetivo.` },
        { match: _P.targetNotHasClearPos, replace: (m, proc, c) => `Si el objetivo principal no tiene ${proc}, elimina ${c} efecto(s) positivo(s) del objetivo principal.` },
        { match: _P.selfHasGainSpeedBar, replace: (m, proc, p) => `Si tiene ${proc}, obtiene ${p} % de barra de velocidad.` },
        { match: _P.selfHasGainCount, replace: (m, proc, c, pr) => `Si tiene ${proc}, obtiene ${c} ${pr}.` },
        { match: _P.healTarget, replace: (m, p) => `Cura al objetivo principal en ${p} % de la salud máxima.` },
        { match: _P.ifAllyApplyCount, replace: (m, ally, c, pr) => `Si ${ally} es un aliado, aplica ${c} ${pr} al objetivo principal.` },
        { match: _P.notModeChanceGain, replace: (m, mode, p, pr) => `${_notModeLoc(mode, 'es')}, ${p} % de probabilidad de obtener ${pr}.` },
        { match: _P.ifAllyDmgPierce, replace: (m, ally, d, p) => `Si ${ally} es un aliado, +${d} % de daño + ${p} % de penetración.` },
        { match: _P.ifAllyApplyDur, replace: (m, ally, pr, t) => `Si ${ally} es un aliado, aplica ${pr} durante ${t} turnos al objetivo principal.` },
        { match: _P.selfIsTraitApplyProc, replace: (m, tr, pr) => `Si es ${tr}, aplica ${pr} al objetivo principal.` },
        { match: _P.selfNotTraitApplyProc, replace: (m, tr, pr) => `Si no es ${tr}, aplica ${pr} al objetivo principal.` },
        { match: _P.targetTraitApplyProc, replace: (m, tr, pr) => `Si el objetivo principal es ${tr}, aplica ${pr} al objetivo principal.` },
        // --- Batch 13 ---
        { match: _P.targetTraitOrApplyCountDurInjured, replace: (m, tr1, tr2, c, pr, t) => `Si el objetivo principal es ${tr1} o ${tr2}, aplica ${c} ${pr} durante ${t} turnos al aliado más herido.` },
        { match: _P.onAssistModeOnCritApply, replace: (m, mode, pr) => `En asistencia, ${_modeLoc(mode, 'es')}, en golpe crítico, aplica ${pr} al objetivo principal.` },
        { match: _P.otherwiseSelfOrTargetHasCrit, replace: (m, tr, proc, p) => `De lo contrario, si es ${tr} o el objetivo tiene ${proc}, +${p} % de probabilidad de crítico.` },
        { match: _P.healthOrChargedDmg, replace: (m, hp, proc, d) => `Si este personaje tiene ${hp} % de salud o menos o tiene ${proc}, +${d} % de daño.` },
        { match: _P.applyDurTraitAllyLowest, replace: (m, pr, t, tr, stat) => `Aplica ${pr} durante ${t} turnos al aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} con el menor ${stat}.` },
        { match: _P.otherwiseTargetHasApplyAllies, replace: (m, proc, c, pr) => `De lo contrario, si el objetivo principal tiene ${proc}, aplica +${c} ${pr} a los aliados.` },
        { match: _P.modeIfTraitAlliesCallHighest, replace: (m, mode, c, tr, tr2, stat) => `${_modeLoc(mode, 'es')}, si ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, llama al aliado ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)} con el mayor ${stat} a asistir.` },
        { match: _P.modeOnAssistTypeGenTraitAlly, replace: (m, mode, type, c, tr) => `${_modeLoc(mode, 'es')}, en asistencia ${type}, genera +${c} energía de habilidad para un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio.` },
        { match: _P.selfHasProcCritPerTraitOrAlly, replace: (m, proc, p, tr1, tr2) => `Si tiene ${proc}, +${p} % de probabilidad de crítico por aliado ${tr1} o ${tr2}.` },
        { match: _P.modeHealthReduceDurRandomTraitAlly, replace: (m, mode, hp, c, tr) => `${_modeLoc(mode, 'es')}, si este personaje tiene más de ${hp} % de salud, reduce la duración de los efectos negativos en ${c} en un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio.` },
        { match: _P.targetHasAndHasRemoveBarrier, replace: (m, p1, p2) => `Si el objetivo principal tiene ${p1} y tiene ${p2}, elimina la barrera del objetivo principal.` },
        { match: _P.selfHasCountAnyEnemyFlip, replace: (m, c, proc, n) => `Si tiene ${c}+ ${proc} y un enemigo tiene efectos positivos, convierte ${n} efecto(s) positivo(s) a negativo(s) en el objetivo principal.` },
        { match: _P.selfLessCountAnyEnemyFlip, replace: (m, c, proc, n) => `Si tiene menos de ${c} ${proc} y un enemigo tiene efectos positivos, convierte ${n} efecto(s) positivo(s) a negativo(s) en el objetivo principal.` },
        { match: _P.modeOnCritProlongNegExcl, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'es')}, en golpe crítico, prolonga la duración de todos los efectos negativos, excluyendo ${pr}, en ${c}.` },
        { match: _P.modeOnCritProlongProc, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'es')}, en golpe crítico, prolonga la duración de ${pr} en ${c}.` },
        { match: _P.modeBarrierRandomAlly, replace: (m, mode, p) => `${_modeLoc(mode, 'es')}, barrera del ${p} % de la salud máxima a un aliado aleatorio.` },
        // --- Batch 14 ---
        { match: _P.modeEnergyFullOnCritGenRandomAlly, replace: (m, mode, c) => `${_modeLoc(mode, 'es')}, si la energía de habilidad está llena, con crítico, genera +${c} energía de habilidad para un aliado aleatorio.` },
        { match: _P.modeEnergyFullOnCritGenSelf, replace: (m, mode, c) => `${_modeLoc(mode, 'es')}, si la energía de habilidad está llena, con crítico, genera +${c} energía de habilidad para sí mismo.` },
        { match: _P.healthLessThanDrain, replace: (m, hp, d) => `Si este personaje tiene menos del ${hp} % de salud, +${d} % de drenaje.` },
        { match: _P.healthOrMoreApplyDurTarget, replace: (m, hp, pr, t) => `Si este personaje tiene ${hp} % o más de salud, aplica ${pr} durante ${t} turnos al objetivo principal.` },
        { match: _P.barrierOrMoreApplyDurAllies, replace: (m, bp, pr, t) => `Si este personaje tiene ${bp} % o más de barrera, aplica ${pr} durante ${t} turnos a los aliados.` },
        { match: _P.barrierOrMoreGainDur, replace: (m, bp, pr, t) => `Si este personaje tiene ${bp} % o más de barrera, obtiene ${pr} durante ${t} turnos.` },
        { match: _P.onTypeAssistGenAllAllies, replace: (m, type, c) => `En asistencia ${type}, genera +${c} energía de habilidad para todos los aliados.` },
        { match: _P.onTypeAssistGenChar, replace: (m, type, c, ch) => `En asistencia ${type}, genera +${c} energía de habilidad para ${ch}.` },
        { match: _P.ifNotFacingApplyTarget, replace: (m, ch, pr) => `Si no se enfrenta a ${ch}, aplica ${pr} al objetivo principal.` },
        { match: _P.targetTraitApplyInjuredAlly, replace: (m, tr, pr) => `Si el objetivo principal es ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, aplica ${pr} al aliado más herido.` },
        { match: _P.copyAllGiveAlliesExclTwo, replace: (m, pr1, pr2) => `Copia todos los efecto(s) positivo(s) del objetivo principal y los da a los aliados, excepto ${pr1} y ${pr2}.` },
        { match: _P.noteCantCritHit, replace: () => `Este ataque no puede ser un golpe crítico.` },
        { match: _P.modeApplyAllies, replace: (m, mode, pr) => `${_modeLoc(mode, 'es')}, aplica ${pr} a los aliados.` },
        { match: _P.targetTraitApplyCountMaxInjured, replace: (m, tr, c, pr, mx) => `Si el objetivo principal es ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, aplica +${c} ${pr}, hasta un máximo de ${mx} al aliado más herido.` },
        { match: _P.modeGenEnergyChar, replace: (m, mode, c, ch) => `${_modeLoc(mode, 'es')}, genera +${c} energía de habilidad para ${ch}.` },
        { match: _P.targetTraitApplyInjuredWithout, replace: (m, tr, pr, pr2) => `Si el objetivo principal es ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, aplica ${pr} al aliado más herido sin ${pr2}.` },
        { match: _P.modeHealRandomTraitAlly, replace: (m, mode, tr, hp) => `${_modeLoc(mode, 'es')}, cura a un aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatorio en ${hp} % de salud máxima.` },
        { match: _P.selfHasOrLessApplyMaxAllies, replace: (m, c, pr, c2, pr2, mx) => `Si este personaje tiene ${c} o menos ${pr}, aplica +${c2} ${pr2}, hasta un máximo de ${mx} a los aliados.` },
        { match: _P.selfHasProcChanceApplyTarget, replace: (m, pr, pct, pr2) => `Si este personaje tiene ${pr}, ${pct} % de probabilidad de aplicar ${pr2} al objetivo principal.` },
        { match: _P.otherwiseSelfHasChanceGain, replace: (m, pr, pct, pr2) => `De lo contrario, si este personaje tiene ${pr}, ${pct} % de probabilidad de obtener ${pr2}.` },
        { match: _P.otherwiseSelfHasHealInjured, replace: (m, pr, hp) => `De lo contrario, si este personaje tiene ${pr}, cura al aliado más herido en ${hp} % de salud máxima.` },
      ],
    },
    // ==================== PORTUGUESE ====================
    pt: {
      damageLine: (dmg, pierce, drain) => {
        const p = [];
        if (dmg > 0) p.push(`<span class="msf-iso8-damage-value">${dmg}%</span> de dano`);
        if (pierce > 0) p.push(`<span class="msf-iso8-piercing-value">${pierce}%</span> de perfuração`);
        if (drain > 0) p.push(`<span class="msf-iso8-drain-value">${drain}%</span> de dreno de vida`);
        return p.length > 0 ? `⚔️ Ataque o alvo primário com ${p.join(' + ')}` : null;
      },
      title: 'ISO-8 Contra/Assistência',
      patterns: [
        { match: _P.forcedDmgPierce, replace: (m, d, p, tr) => `Quando forçado a atacar um aliado, este personagem causa ${d}% de dano + ${p}% de perfuração a personagens ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.forcedDmg, replace: (m, d, tr) => `Quando forçado a atacar um aliado, este personagem causa ${d}% de dano a personagens ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.flipEffects, replace: (m, n, c) => `Se ${n} for um aliado, inverta ${c} efeitos positivos aleatórios para efeitos negativos no alvo primário.` },
        { match: _P.flipRandom, replace: (m, n, c) => `Se ${n} for um aliado, inverta ${c} efeitos positivos aleatórios para efeitos negativos no alvo primário.` },
        { match: _P.applyProc, replace: (m, pr) => `Aplique ${pr} ao alvo primário.` },
        { match: _P.applyCount, replace: (m, c, pr) => `Aplique ${c} de ${pr} ao alvo primário.` },
        { match: _P.applyPlusDur, replace: (m, c, pr, t) => `Aplique +${c} ${pr} por ${t} turnos ao alvo primário.` },
        { match: _P.applyPlus, replace: (m, c, pr) => `Aplique +${c} ${pr} ao alvo primário.` },
        { match: _P.applyAllies, replace: (m, c, pr) => `Aplique +${c} ${pr} aos aliados.` },
        { match: _P.gainPlus, replace: (m, c, pr) => `Receba +${c} ${pr}.` },
        { match: _P.gainSpeedBar, replace: (m, p) => `Receba ${p}% de barra de velocidade.` },
        { match: _P.reduceSpeedBar, replace: (m, p) => `Reduza a barra de velocidade em ${p}%.` },
        { match: _P.gain, replace: (m, pr) => `Receba ${pr}.` },
        { match: _P.healthGain, replace: (m, p, pr) => `Se este personagem tiver ${p}% de vida ou menos, receba ${pr}.` },
        { match: _P.healthGeneric, replace: (m, p, r) => `Se este personagem tiver ${p}% de vida ou menos, ${r}` },
        // --- New patterns ---
        { match: _P.forcedPierceOnly, replace: (m, p, tr) => `Quando forçado a atacar um aliado, este personagem causa ${p}% de perfuração a personagens ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.ifAllyApplyRandom, replace: (m, n, pr) => `Se ${n} for um aliado, aplique ${pr} a um aliado aleatório.` },
        { match: _P.selfHasApplyCountDur, replace: (m, proc, c, pr, t) => `Se este personagem estiver com ${proc}, aplique ${c} de ${pr} por ${t} turnos ao alvo primário.` },
        { match: _P.selfHasApply, replace: (m, proc, pr) => `Se este personagem estiver com ${proc}, aplique ${pr} ao alvo primário.` },
        { match: _P.selfHasClear, replace: (m, proc, c, pr) => `Se este personagem estiver com ${proc}, remova ${c} ${pr} dos aliados.` },
        { match: _P.selfHasAttackInstead, replace: (m, proc, p, d) => `Se este personagem estiver com ${proc}, em vez disso, ataque com ${p}% de perfuração + ${d}% de dreno.` },
        { match: _P.selfNotHasApply, replace: (m, proc, pr) => `Se este personagem não estiver com ${proc}, aplique ${pr} ao alvo primário.` },
        { match: _P.modeGainCount, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'pt')}, ganhe ${c} de ${pr}.` },
        { match: _P.modeSelfHasApply, replace: (m, mode, proc, pr) => `${_modeLoc(mode, 'pt')}, se este personagem estiver com ${proc}, aplique ${pr} ao alvo primário.` },
        { match: _P.onAssistEnergy, replace: (m, type, c) => `Na assistência ${_modeLoc(type, 'pt')}, gere +${c} de energia de habilidade para si mesmo.` },
        { match: _P.modeReduceSpeedPerAlly, replace: (m, mode, p, tr) => `${_modeLoc(mode, 'pt')}, reduza a barra de velocidade em ${p}% para cada aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.healthHealAllies, replace: (m, p, h) => `Se este personagem tiver menos de ${p}% de vida, cure os aliados em ${h}% da vida máxima.` },
        { match: _P.modeIgnoresDefUp, replace: (m, mode) => `${_modeLoc(mode, 'pt')}, este ataque ignora Defesa Aumentada.` },
        // --- Batch 3 patterns ---
        { match: _P.modeIfSelfHasCountDmg, replace: (m, mode, c, proc, d) => `${_modeLoc(mode, 'pt')}, se este personagem tiver ${c}+ ${proc}, +${d}% de dano.` },
        { match: _P.clearPosTarget, replace: (m, c) => `Remova ${c} efeito(s) positivo(s) do alvo primário.` },
        { match: _P.applyAlliesNamed, replace: (m, pr) => `Aplique ${pr} aos aliados.` },
        { match: _P.clearNegAllies, replace: (m, c) => `Remova ${c} efeito(s) negativo(s) dos aliados.` },
        { match: _P.applyMostInjured, replace: (m, pr) => `Aplique ${pr} ao aliado mais ferido.` },
        { match: _P.clearNegMostInjured, replace: (m, c) => `Remova ${c} efeito(s) negativo(s) do aliado mais ferido.` },
        { match: _P.modeApplyRandomTraitAlly, replace: (m, mode, c, pr, tr) => `${_modeLoc(mode, 'pt')}, aplique +${c} ${pr} a um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório.` },
        { match: _P.targetNotTraitDrain, replace: (m, tr, p) => `Se o alvo primário não for ${tr}, drena ${p}% da vida máxima do alvo.` },
        { match: _P.targetTraitDrain, replace: (m, tr, p) => `Se o alvo primário for ${tr}, drena ${p}% da vida máxima do alvo.` },
        { match: _P.notModeFlip, replace: (m, mode, c) => `${_notModeLoc(mode, 'pt')}, inverta ${c} efeito(s) positivo(s) para negativo(s) no alvo primário.` },
        { match: _P.modeFlipAll, replace: (m, mode) => `${_modeLoc(mode, 'pt')}, inverta todos os efeitos positivos para negativos no alvo primário.` },
        { match: _P.targetNoPosApply, replace: (m, pr) => `Se o alvo primário não tiver efeitos positivos, aplique ${pr} ao alvo primário.` },
        { match: _P.targetHasApply, replace: (m, proc, pr) => `Se o alvo primário tiver ${proc}, aplique ${pr} ao alvo primário.` },
        { match: _P.applyUpToMaxRandomAlly, replace: (m, c, pr, max) => `Aplique +${c} ${pr}, até um máximo de ${max} a um aliado aleatório.` },
        { match: _P.onAssistProlongPos, replace: (m, proc, c) => `Na assistência, prolongue a duração de todos os efeitos positivos, exceto ${proc}, em ${c} nos aliados.` },
        { match: _P.prolongPosExcluding, replace: (m, proc, c) => `Prolongue a duração de todos os efeitos positivos, exceto ${proc}, em ${c} nos aliados.` },
        { match: _P.forcedDmgInstead, replace: (m, p) => `Quando forçado a atacar um aliado, ataca com ${p}% de dano em vez disso.` },
        { match: _P.otherwiseDrain, replace: (m, p) => `Caso contrário, drena ${p}% da vida máxima do alvo.` },
        { match: _P.anyEnemyHasClearPos, replace: (m, c) => `Se algum inimigo tiver efeitos positivos, remova ${c} efeito(s) positivo(s) do alvo primário.` },
        { match: _P.clearNegRandomAlly, replace: (m, c) => `Remova ${c} efeito(s) negativo(s) de um aliado aleatório.` },
        { match: _P.triggerBattlefield, replace: () => `Ativa o efeito do campo de batalha.` },
        { match: _P.noteIgnoresDefUp, replace: () => `Este ataque ignora Defesa Aumentada.` },
        { match: _P.targetHasOrDmg, replace: (m, pr1, pr2, d) => `Se o alvo tiver ${pr1} ou ${pr2}, +${d}% de dano.` },
        { match: _P.flipAllPos, replace: () => `Inverta todos os efeitos positivos para negativos no alvo primário.` },
        { match: _P.genEnergyAllAllies, replace: (m, c) => `Gere +${c} de energia de habilidade para todos os aliados.` },
        { match: _P.noteTargetHasOrCantBlock, replace: (m, pr1, pr2) => `Se o alvo tiver ${pr1} ou ${pr2}, este ataque não pode ser bloqueado.` },
        { match: _P.selfHasDmgBoost, replace: (m, proc, d) => `Se este personagem estiver com ${proc}, +${d}% de dano.` },
        { match: _P.clearAllPosTarget, replace: () => `Remova todos os efeitos positivos do alvo primário.` },
        { match: _P.ifTraitAlliesApplyMax, replace: (m, c, tr, n, pr, max) => `Se ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, aplique +${n} ${pr}, até um máximo de ${max} aos aliados.` },
        { match: _P.applyMaxRandomTraitAlly, replace: (m, c, pr, max, tr) => `Aplique +${c} ${pr}, até um máximo de ${max} a um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório.` },
        { match: _P.genEnergyTraitAllies, replace: (m, c, tr) => `Gere +${c} de energia de habilidade para aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        // --- Batch 4 patterns ---
        { match: _P.flipCountPos, replace: (m, c) => `Inverta ${c} efeito(s) positivo(s) para negativo(s) no alvo primário.` },
        { match: _P.modeFlipCount, replace: (m, mode, c) => `${_modeLoc(mode, 'pt')}, inverta ${c} efeito(s) positivo(s) para negativo(s) no alvo primário.` },
        { match: _P.onCritReduceSpeed, replace: (m, p) => `Em acerto crítico, reduz a barra de velocidade em ${p}%.` },
        { match: _P.onCritApply, replace: (m, c, pr) => `Em acerto crítico, aplique +${c} ${pr} ao alvo primário.` },
        { match: _P.onAssistPiercing, replace: (m, p) => `Em assistência, +${p}% de dano perfurante.` },
        { match: _P.onCounterChanceGain, replace: (m, pct, c, pr) => `Em contra-ataque, ${pct}% de chance de obter +${c} ${pr}.` },
        { match: _P.stealPosExcluding, replace: (m, c, excl) => `Rouba ${c} efeito(s) positivo(s) do alvo primário e dá aos aliados, exceto ${excl}.` },
        { match: _P.barrierAllies, replace: (m, p) => `Barreira de ${p}% da vida máxima aos aliados.` },
        { match: _P.barrierMostInjuredNonSummon, replace: (m, p) => `Barreira de ${p}% da vida máxima ao aliado não invocado mais ferido.` },
        { match: _P.genEnergyRandomAlly, replace: (m, c) => `Gere +${c} de energia de habilidade para um aliado aleatório.` },
        { match: _P.selfHasReduceDur, replace: (m, proc, proc2, c) => `Se tiver ${proc}, reduz a duração de ${proc2} em ${c} nos aliados.` },
        { match: _P.prolongNegExcluding, replace: (m, excl, c) => `Prolonga a duração de todos os efeitos negativos, exceto ${excl}, em ${c}.` },
        { match: _P.drainDmgDealt, replace: (m, p) => `Drena ${p}% do dano causado como vida.` },
        { match: _P.drainFlat, replace: (m, p) => `Drena ${p}% da vida máxima do alvo.` },
        { match: _P.chanceApply, replace: (m, pct, pr) => `${pct}% de chance de aplicar ${pr} ao alvo primário.` },
        { match: _P.modeReduceSpeed, replace: (m, mode, p) => `${_modeLoc(mode, 'pt')}, reduz a barra de velocidade em ${p}%.` },
        { match: _P.modeGain, replace: (m, mode, pr) => `${_modeLoc(mode, 'pt')}, obtém ${pr}.` },
        { match: _P.clearAllProcTarget, replace: (m, pr) => `Remove todo ${pr} do alvo primário.` },
        { match: _P.applyRandomAlly, replace: (m, pr) => `Aplique ${pr} a um aliado aleatório.` },
        { match: _P.attackAdditional, replace: () => `Ataca um inimigo adicional.` },
        { match: _P.copyNegExcluding, replace: (m, c, excl) => `Copia ${c} efeito(s) negativo(s) do alvo primário, exceto ${excl}.` },
        { match: _P.noteDebuffsNotResisted, replace: () => `Os debuffs deste ataque não podem ser resistidos.` },
        { match: _P.targetTraitReduceSpeed, replace: (m, tr, p) => `Se o alvo primário for ${tr}, reduz a barra de velocidade em ${p}%.` },
        { match: _P.modeStatPerAlly, replace: (m, mode, p, stat, tr) => `${_modeLoc(mode, 'pt')}, +${p}% ${stat} por aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.modeReviveAt, replace: (m, mode, name, p) => `${_modeLoc(mode, 'pt')}, ressuscita ${name} com ${p}% de vida.` },
        // --- Batch 5 patterns ---
        { match: _P.modeTraitAllyStealAllExcl, replace: (m, mode, c, tr, ally, excl) => `${_modeLoc(mode, 'pt')}, se ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, se ${ally} for aliado, rouba todos os efeitos positivos do alvo primário e dá aos aliados, exceto ${excl}.` },
        { match: _P.modeTraitAllyStealProc, replace: (m, mode, c, tr, ally, proc) => `${_modeLoc(mode, 'pt')}, se ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, se ${ally} for aliado, rouba ${proc} do alvo primário e dá aos aliados.` },
        { match: _P.modeApplyPlus, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'pt')}, aplique +${c} ${pr} ao alvo primário.` },
        { match: _P.modeApplyProc, replace: (m, mode, pr) => `${_modeLoc(mode, 'pt')}, aplique ${pr} ao alvo primário.` },
        { match: _P.modeApplyAllies, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'pt')}, aplique +${c} ${pr} aos aliados.` },
        { match: _P.modeClearCountTarget, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'pt')}, remova ${c} ${pr} do alvo primário.` },
        { match: _P.otherwiseApplyPlus, replace: (m, c, pr) => `Caso contrário, aplique +${c} ${pr} ao alvo primário.` },
        { match: _P.otherwiseApplyProc, replace: (m, pr) => `Caso contrário, aplique ${pr} ao alvo primário.` },
        { match: _P.otherwiseModeClearAllPos, replace: (m, mode) => `Caso contrário, ${_modeLoc(mode, 'pt')}, remove todos os efeitos positivos do alvo primário.` },
        { match: _P.clearFromSelf, replace: (m, pr) => `Remove todo ${pr} de si mesmo.` },
        { match: _P.clearCountProcTarget, replace: (m, c, pr) => `Remove ${c} ${pr} do alvo primário.` },
        { match: _P.selfNotHasClearNeg, replace: (m, proc) => `Se não tiver ${proc}, remove todos os efeitos negativos dos aliados.` },
        { match: _P.selfNotHasApplyMaxAllies, replace: (m, proc, c, pr, max) => `Se não tiver ${proc}, aplique +${c} ${pr}, até um máximo de ${max} aos aliados.` },
        { match: _P.targetHasReduceSpeed, replace: (m, proc, p) => `Se o alvo primário tiver ${proc}, reduz a barra de velocidade em ${p}%.` },
        { match: _P.targetHasApplyAllies, replace: (m, proc, c, pr, max) => `Se o alvo primário tiver ${proc}, aplique +${c} ${pr}, até um máximo de ${max} aos aliados.` },
        { match: _P.targetTraitGainMax, replace: (m, tr, c, pr, max) => `Se o alvo primário for ${tr}, obtém +${c} ${pr}, até um máximo de ${max}.` },
        { match: _P.modeOnCritApply, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'pt')}, em acerto crítico, aplique +${c} ${pr} ao alvo primário.` },
        { match: _P.notModeOnCritReduceSpeed, replace: (m, mode, p) => `${_notModeLoc(mode, 'pt')}, em acerto crítico, reduz a barra de velocidade em ${p}%.` },
        { match: _P.modeCallAssist, replace: (m, mode, tr) => `${_modeLoc(mode, 'pt')}, chama um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório para assistência.` },
        { match: _P.modeNoteCantDodge, replace: (m, mode) => `${_modeLoc(mode, 'pt')}, este ataque não pode ser esquivado.` },
        { match: _P.modeTargetHasReduceDur, replace: (m, mode, proc, proc2, c) => `${_modeLoc(mode, 'pt')}, se o alvo primário tiver ${proc}, reduz a duração de ${proc2} em ${c}.` },
        { match: _P.modeProlongNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'pt')}, prolonga a duração dos efeitos negativos em ${c}.` },
        { match: _P.notModeProlongNegExcl, replace: (m, mode, excl, c) => `${_notModeLoc(mode, 'pt')}, prolonga a duração de todos os efeitos negativos, exceto ${excl}, em ${c}.` },
        { match: _P.stealAllExcluding, replace: (m, excl) => `Rouba todos os efeitos positivos do alvo primário, exceto ${excl}.` },
        { match: _P.stealAllGiveExcluding, replace: (m, excl) => `Rouba todos os efeitos positivos do alvo primário e dá aos aliados, exceto ${excl}.` },
        { match: _P.transferAllPos, replace: () => `Transfere todos os efeitos positivos de si mesmo como efeitos negativos.` },
        { match: _P.applyMostInjuredTrait, replace: (m, c, pr, tr) => `Aplique ${c} ${pr} ao aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} mais ferido.` },
        { match: _P.onAssistApplyMaxAllies, replace: (m, c, pr, max) => `Em assistência, aplique +${c} ${pr}, até um máximo de ${max} aos aliados.` },
        { match: _P.selfHasMoreModeProlongNeg, replace: (m, n, proc, mode, c) => `Se tiver mais de ${n} ${proc}, ${_modeLoc(mode, 'pt')}, prolonga a duração dos efeitos negativos em ${c}.` },
        { match: _P.selfHasMoreNotModeProlongNegExcl, replace: (m, n, proc, mode, excl, c) => `Se tiver mais de ${n} ${proc}, ${_notModeLoc(mode, 'pt')}, prolonga a duração de todos os efeitos negativos, exceto ${excl}, em ${c}.` },
        { match: _P.barrierMostInjured, replace: (m, p) => `Barreira de ${p}% da vida máxima ao aliado mais ferido.` },
        { match: _P.onAssistDmg, replace: (m, p) => `Em assistência, +${p}% de dano.` },
        // --- Batch 6 patterns ---
        { match: _P.onTriggerGainPlus, replace: (m, trig, c, pr) => `Em ${trig === 'Counter' ? 'contra-ataque' : 'crítico'}, obtém +${c} ${pr}.` },
        { match: _P.flipNegToPosAllies, replace: (m, c) => `Converte ${c} efeito(s) negativo(s) em positivo(s) nos aliados.` },
        { match: _P.stealProcGiveAllies, replace: (m, pr) => `Rouba ${pr} do alvo primário e dá aos aliados.` },
        { match: _P.selfHasCritBoost, replace: (m, pr, p) => `Se tiver ${pr}, +${p}% de chance de crítico.` },
        { match: _P.traitAllyExistsDmg, replace: (m, tr, p) => `Se um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} existir, +${p}% de dano.` },
        { match: _P.applyProcMostInjuredTrait, replace: (m, pr, tr) => `Aplique ${pr} ao aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} mais ferido.` },
        // --- Batch 7 patterns ---
        { match: _P.applyProcRandomTraitAlly, replace: (m, pr, tr) => `Aplica ${pr} a um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório.` },
        { match: _P.modeStatBoost, replace: (m, mode, p, stat) => `${_modeLoc(mode, 'pt')}, +${p}% ${stat}.` },
        { match: _P.ifAllyNoteAttackCant, replace: (m, name, what) => `Se ${name} for um aliado, este ataque não pode ser ${what === 'dodged' ? 'esquivado' : what === 'blocked' ? 'bloqueado' : what === 'missed' ? 'errado' : what}.` },
        { match: _P.statPerTraitAlly, replace: (m, p, stat, tr) => `+${p}% ${stat} por aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.genEnergyForNamed, replace: (m, c, name) => `Gera +${c} energia de habilidade para ${name}.` },
        { match: _P.healRandomTraitAlly, replace: (m, tr, p) => `Cura um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório em ${p}% da vida máxima.` },
        { match: _P.targetHasStatBoost, replace: (m, proc, p, stat) => `Se o alvo tiver ${proc}, +${p}% ${stat}.` },
        { match: _P.flipNegToPosRandomTraitAlly, replace: (m, c, tr) => `Converte ${c} efeito(s) negativo(s) em positivo(s) em um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório.` },
        { match: _P.drainRedistribute, replace: (m, p, target) => `Drena ${p}% da vida máxima do alvo e redistribui aos aliados ${_traitLoc(target, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.selfNotHasApplyAllies, replace: (m, proc, pr) => `Se não tiver ${proc}, aplica ${pr} aos aliados.` },
        { match: _P.selfIsTraitDmg, replace: (m, tr, p) => `Se este personagem for ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, +${p}% de dano.` },
        { match: _P.healAllies, replace: (m, p) => `Cura os aliados em ${p}% da vida máxima.` },
        { match: _P.stealCountExcluding, replace: (m, c, excl) => `Rouba ${c} efeito(s) positivo(s) do alvo primário, exceto ${excl}.` },
        { match: _P.onCritApplyMaxAllies, replace: (m, c, pr, max) => `Em crítico, aplica +${c} ${pr}, até um máximo de ${max} aos aliados.` },
        { match: _P.modeGenEnergyTraitAllies, replace: (m, mode, c, tr) => `${_modeLoc(mode, 'pt')}, gera +${c} energia de habilidade para aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        // --- Batch 8 ---
        { match: _P.ifTraitAlliesApplyProc, replace: (m, n, tr, pr) => `Se ${n}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, aplica ${pr} ao alvo primário.` },
        { match: _P.ifTraitAlliesGain, replace: (m, n, tr, pr) => `Se ${n}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, obtém ${pr}.` },
        { match: _P.ifTraitAlliesDmg, replace: (m, n, tr, p) => `Se ${n}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, +${p}% de dano.` },
        { match: _P.ifTraitAlliesFlip, replace: (m, n, tr, c) => `Se ${n}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, converte ${c} efeito(s) positivo(s) em negativo(s) no alvo primário.` },
        { match: _P.dmgPerEffectOnTarget, replace: (m, p, type) => `+${p}% de dano para cada efeito ${type === 'positive' ? 'positivo' : 'negativo'} no alvo primário.` },
        { match: _P.reduceSpeedPerTraitAlly, replace: (m, p, tr) => `Reduz a barra de velocidade em ${p}% para cada aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.targetHasGainSpeedBar, replace: (m, pr, p) => `Se o alvo primário tiver ${pr}, obtém ${p}% de barra de velocidade.` },
        { match: _P.targetHasGenEnergy, replace: (m, pr, c) => `Se o alvo primário tiver ${pr}, gera +${c} energia de habilidade para todos os aliados.` },
        { match: _P.targetHasFlipPos, replace: (m, pr, c) => `Se o alvo primário tiver ${pr}, converte ${c} efeito(s) positivo(s) em negativo(s) no alvo primário.` },
        { match: _P.targetNotHasApply, replace: (m, pr1, pr2) => `Se o alvo primário não tiver ${pr1}, aplica ${pr2} ao alvo primário.` },
        { match: _P.otherwiseFlipPos, replace: (m, c) => `Caso contrário, converte ${c} efeito(s) positivo(s) em negativo(s) no alvo primário.` },
        { match: _P.modeNoteAttackCant, replace: (m, mode, what) => `${_modeLoc(mode, 'pt')}, este ataque não pode ser ${what === 'countered' ? 'contra-atacado' : what === 'blocked' ? 'bloqueado' : what === 'dodged' ? 'esquivado' : what}.` },
        // --- Batch 9 patterns ---
        { match: _P.barrierSelf, replace: (m, p) => `Barreira de ${p}% da saúde máxima.` },
        { match: _P.prolongProcBy, replace: (m, pr, c) => `Prolonga a duração de ${pr} em ${c}.` },
        { match: _P.notModeChanceApply, replace: (m, mode, ch, pr) => `${_notModeLoc(mode, 'pt')}, ${ch}% de chance de aplicar ${pr} ao alvo primário.` },
        { match: _P.modeChanceGain, replace: (m, mode, ch, pr) => `${_modeLoc(mode, 'pt')}, ${ch}% de chance de obter ${pr}.` },
        { match: _P.clearCountProcAllies, replace: (m, c, pr) => `Remove ${c} ${pr} dos aliados.` },
        { match: _P.applyProcToEnemies, replace: (m, pr, c) => `Aplica ${pr} a ${c} inimigos.` },
        { match: _P.applyCountToEnemies, replace: (m, n, pr, c) => `Aplica ${n} ${pr} a ${c} inimigos.` },
        { match: _P.applyProcDurToEnemies, replace: (m, pr, t, c) => `Aplica ${pr} por ${t} turnos a ${c} inimigos.` },
        { match: _P.clearNegRandomTraitAlly, replace: (m, c, tr) => `Remove ${c} efeito(s) negativo(s) de um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório.` },
        { match: _P.clearNegMostInjuredTraitAlly, replace: (m, c, tr) => `Remove ${c} efeito(s) negativo(s) do aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} mais ferido.` },
        { match: _P.onCritStealAllExcl, replace: (m, pr) => `Em acerto crítico, rouba todos os efeitos positivos do alvo primário, exceto ${pr}.` },
        { match: _P.onAssistApplyMaxTarget, replace: (m, c, pr, max) => `Em assistência, aplica +${c} ${pr}, até um máximo de ${max} ao alvo primário.` },
        { match: _P.copyPosGiveExcl, replace: (m, c, pr) => `Copia ${c} efeito(s) positivo(s) do alvo primário e dá aos aliados, exceto ${pr}.` },
        { match: _P.targetTraitGainProc, replace: (m, tr, pr) => `Se o alvo primário for ${tr}, obtém ${pr}.` },
        { match: _P.flipPosNEnemies, replace: (m, c, n) => `Converte ${c} efeito(s) positivo(s) em negativo(s) em ${n} inimigos.` },
        { match: _P.barrierRandomTraitAlly, replace: (m, p, tr) => `Barreira de ${p}% da saúde máxima a um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório.` },
        // --- Batch 10 ---
        { match: _P.piercingAdditional, replace: (m, p) => `+${p}% de perfuração a inimigos adicionais.` },
        { match: _P.dmgPierceAdditional, replace: (m, d, p) => `+${d}% de dano + ${p}% de perfuração a inimigos adicionais.` },
        { match: _P.modeApplyPlusRandomAlly, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'pt')}, aplica +${c} ${pr} a um aliado aleatório.` },
        { match: _P.drainAlliesHealth, replace: (m, p) => `Drena ${p}% da saúde máxima dos aliados.` },
        { match: _P.ifAllyNoteCantMiss, replace: (m, ally) => `Se ${ally} for aliado, este ataque não pode errar.` },
        { match: _P.targetHasAttackPierceInstead, replace: (m, proc, p) => `Se o alvo primário tiver ${proc}, ataca por ${p}% de perfuração em vez disso.` },
        { match: _P.targetHasDrainRedistribute, replace: (m, proc, p, target) => `Se o alvo primário tiver ${proc}, drena ${p}% da saúde máxima do alvo e redistribui aos ${target}.` },
        { match: _P.modeOnCritClearNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'pt')}, em acerto crítico, remove ${c} efeito(s) negativo(s) dos aliados.` },
        { match: _P.ifAllyStealAllGiveExcl, replace: (m, ally, pr) => `Se ${ally} for aliado, rouba todos os efeitos positivos do alvo primário e dá aos aliados, exceto ${pr}.` },
        { match: _P.applyProcToAllyHighest, replace: (m, pr, tr, stat) => `Aplica ${pr} ao aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} com o maior ${stat}.` },
        { match: _P.applyProcRandomAllyBelowHealth, replace: (m, pr, p) => `Aplica ${pr} a um aliado aleatório abaixo de ${p}% de saúde.` },
        { match: _P.allAlliesHaveGainSpeedBar, replace: (m, proc, p) => `Se todos os aliados tiverem ${proc}, obtém ${p}% de barra de velocidade.` },
        { match: _P.targetHasStealCountExcl, replace: (m, proc, c, pr) => `Se o alvo primário tiver ${proc}, rouba ${c} efeito(s) positivo(s) do alvo primário, exceto ${pr}.` },
        { match: _P.selfHasLessThanApplyMaxAllies, replace: (m, n, proc, c, pr, max) => `Se tiver menos de ${n} ${proc}, aplica +${c} ${pr}, até um máximo de ${max} aos aliados.` },
        { match: _P.targetTraitApplyProcAllyHighest, replace: (m, tr, pr, stat) => `Se o alvo primário for ${tr}, aplica ${pr} ao aliado com o maior ${stat}.` },
        { match: _P.modeIfTraitAlliesStealProc, replace: (m, mode, c, tr, proc) => `${_modeLoc(mode, 'pt')}, se ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, rouba ${proc} do alvo primário e dá aos aliados.` },
        // --- Batch 11 ---
        { match: _P.targetHasPosClearPos, replace: (m, c) => `Se o alvo primário tiver efeitos positivos, remove ${c} efeito(s) positivo(s) do alvo primário.` },
        { match: _P.modeSubTargetHasDrain, replace: (m, mode, sub, proc, p) => `${_modeLoc(mode, 'pt')}, ${sub}, se o alvo primário tiver ${proc}, drena ${p}% da saúde máxima do alvo.` },
        { match: _P.modeSubReduceDur, replace: (m, mode, sub, proc, c) => `${_modeLoc(mode, 'pt')}, ${sub}, reduz a duração de ${proc} em ${c}.` },
        { match: _P.modeApplyPlusRandomAllyExclSelf, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'pt')}, aplica +${c} ${pr} a um aliado aleatório (exceto si próprio).` },
        { match: _P.modeOrSubClearNegRandomTraitAlly, replace: (m, m1, m2, sub, c, tr) => `${_modeLoc(m1, 'pt')} ou ${_modeLoc(m2, 'pt')}, ${sub}, remove ${c} efeito(s) negativo(s) de um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório.` },
        { match: _P.selfHasClearPos, replace: (m, proc, c) => `Se tiver ${proc}, remove ${c} efeito(s) positivo(s) do alvo primário.` },
        { match: _P.selfNotHasFlipPos, replace: (m, proc, c) => `Se não tiver ${proc}, converte ${c} efeito(s) positivo(s) em negativo(s) no alvo primário.` },
        { match: _P.selfHasClearNegSelf, replace: (m, proc) => `Se tiver ${proc}, remove todos os efeitos negativos de si mesmo.` },
        { match: _P.selfHasClearCountFromSelf, replace: (m, proc, c, pr) => `Se tiver ${proc}, remove ${c} ${pr} de si mesmo.` },
        { match: _P.targetHasClearAllProc, replace: (m, proc, pr) => `Se o alvo primário tiver ${proc}, remove todo ${pr} do alvo primário.` },
        { match: _P.onAssistTargetHasClearAllProc, replace: (m, proc, pr) => `Em assistência, se o alvo primário tiver ${proc}, remove todo ${pr} do alvo primário.` },
        { match: _P.targetTraitApplyCountDur, replace: (m, tr, c, pr, t) => `Se o alvo primário for ${tr}, aplica ${c} ${pr} por ${t} turnos ao alvo primário.` },
        { match: _P.targetTraitApplyCount, replace: (m, tr, c, pr) => `Se o alvo primário for ${tr}, aplica ${c} ${pr} ao alvo primário.` },
        { match: _P.onCritBarrierAllies, replace: (m, p) => `Em acerto crítico, barreira de ${p}% da saúde máxima aos aliados.` },
        { match: _P.ifTraitAlliesCritChance, replace: (m, c, tr, p) => `Se ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, +${p}% de chance de crítico.` },
        { match: _P.ifTraitAlliesCritPerAlly, replace: (m, c, tr, p, tr2) => `Se ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, +${p}% de chance de crítico por aliado ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        // --- Batch 12 ---
        { match: _P.onCritGenEnergyRandomAlly, replace: (m, c) => `Em acerto crítico, gera +${c} energia de habilidade para um aliado aleatório.` },
        { match: _P.onCounterOnCritGenEnergy, replace: (m, c) => `Em contra-ataque, em acerto crítico, gera +${c} energia de habilidade para um aliado aleatório.` },
        { match: _P.removeBarrierTarget, replace: () => `Remove a barreira do alvo primário.` },
        { match: _P.modeSubFlipNegToPosAllies, replace: (m, mode, sub) => `${_modeLoc(mode, 'pt')}, ${sub}, converte todos os efeitos negativos em positivos nos aliados.` },
        { match: _P.modeSubTargetNotTraitDrain, replace: (m, mode, sub, tr, p) => `${_modeLoc(mode, 'pt')}, ${sub}, se o alvo primário não for ${tr}, drena ${p}% da saúde máxima do alvo.` },
        { match: _P.targetNotHasClearPos, replace: (m, proc, c) => `Se o alvo primário não tiver ${proc}, remove ${c} efeito(s) positivo(s) do alvo primário.` },
        { match: _P.selfHasGainSpeedBar, replace: (m, proc, p) => `Se tiver ${proc}, obtém ${p}% de barra de velocidade.` },
        { match: _P.selfHasGainCount, replace: (m, proc, c, pr) => `Se tiver ${proc}, obtém ${c} ${pr}.` },
        { match: _P.healTarget, replace: (m, p) => `Cura o alvo primário em ${p}% da saúde máxima.` },
        { match: _P.ifAllyApplyCount, replace: (m, ally, c, pr) => `Se ${ally} for aliado, aplica ${c} ${pr} ao alvo primário.` },
        { match: _P.notModeChanceGain, replace: (m, mode, p, pr) => `${_notModeLoc(mode, 'pt')}, ${p}% de chance de obter ${pr}.` },
        { match: _P.ifAllyDmgPierce, replace: (m, ally, d, p) => `Se ${ally} for aliado, +${d}% de dano + ${p}% de perfuração.` },
        { match: _P.ifAllyApplyDur, replace: (m, ally, pr, t) => `Se ${ally} for aliado, aplica ${pr} por ${t} turnos ao alvo primário.` },
        { match: _P.selfIsTraitApplyProc, replace: (m, tr, pr) => `Se for ${tr}, aplica ${pr} ao alvo primário.` },
        { match: _P.selfNotTraitApplyProc, replace: (m, tr, pr) => `Se não for ${tr}, aplica ${pr} ao alvo primário.` },
        { match: _P.targetTraitApplyProc, replace: (m, tr, pr) => `Se o alvo primário for ${tr}, aplica ${pr} ao alvo primário.` },
        // --- Batch 13 ---
        { match: _P.targetTraitOrApplyCountDurInjured, replace: (m, tr1, tr2, c, pr, t) => `Se o alvo primário for ${tr1} ou ${tr2}, aplica ${c} ${pr} por ${t} turnos ao aliado mais ferido.` },
        { match: _P.onAssistModeOnCritApply, replace: (m, mode, pr) => `Em assistência, ${_modeLoc(mode, 'pt')}, em acerto crítico, aplica ${pr} ao alvo primário.` },
        { match: _P.otherwiseSelfOrTargetHasCrit, replace: (m, tr, proc, p) => `Caso contrário, se for ${tr} ou o alvo tiver ${proc}, +${p}% de chance de crítico.` },
        { match: _P.healthOrChargedDmg, replace: (m, hp, proc, d) => `Se este personagem tiver ${hp}% de saúde ou menos ou tiver ${proc}, +${d}% de dano.` },
        { match: _P.applyDurTraitAllyLowest, replace: (m, pr, t, tr, stat) => `Aplica ${pr} por ${t} turnos ao aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} com o menor ${stat}.` },
        { match: _P.otherwiseTargetHasApplyAllies, replace: (m, proc, c, pr) => `Caso contrário, se o alvo primário tiver ${proc}, aplica +${c} ${pr} aos aliados.` },
        { match: _P.modeIfTraitAlliesCallHighest, replace: (m, mode, c, tr, tr2, stat) => `${_modeLoc(mode, 'pt')}, se ${c}+ aliados ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, chama o aliado ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict).toUpperCase()} com o maior ${stat} para assistir.` },
        { match: _P.modeOnAssistTypeGenTraitAlly, replace: (m, mode, type, c, tr) => `${_modeLoc(mode, 'pt')}, em assistência ${type}, gera +${c} energia de habilidade para um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório.` },
        { match: _P.selfHasProcCritPerTraitOrAlly, replace: (m, proc, p, tr1, tr2) => `Se tiver ${proc}, +${p}% de chance de crítico por aliado ${tr1} ou ${tr2}.` },
        { match: _P.modeHealthReduceDurRandomTraitAlly, replace: (m, mode, hp, c, tr) => `${_modeLoc(mode, 'pt')}, se este personagem tiver mais de ${hp}% de saúde, reduz a duração dos efeitos negativos em ${c} em um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} aleatório.` },
        { match: _P.targetHasAndHasRemoveBarrier, replace: (m, p1, p2) => `Se o alvo primário tiver ${p1} e tiver ${p2}, remove a barreira do alvo primário.` },
        { match: _P.selfHasCountAnyEnemyFlip, replace: (m, c, proc, n) => `Se tiver ${c}+ ${proc} e um inimigo tiver efeitos positivos, converte ${n} efeito(s) positivo(s) em negativo(s) no alvo primário.` },
        { match: _P.selfLessCountAnyEnemyFlip, replace: (m, c, proc, n) => `Se tiver menos de ${c} ${proc} e um inimigo tiver efeitos positivos, converte ${n} efeito(s) positivo(s) em negativo(s) no alvo primário.` },
        { match: _P.modeOnCritProlongNegExcl, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'pt')}, em acerto crítico, prolonga a duração de todos os efeitos negativos, exceto ${pr}, em ${c}.` },
        { match: _P.modeOnCritProlongProc, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'pt')}, em acerto crítico, prolonga a duração de ${pr} em ${c}.` },
        { match: _P.modeBarrierRandomAlly, replace: (m, mode, p) => `${_modeLoc(mode, 'pt')}, barreira de ${p}% da saúde máxima a um aliado aleatório.` },
        // --- Batch 14 ---
        { match: _P.modeEnergyFullOnCritGenRandomAlly, replace: (m, mode, c) => `${_modeLoc(mode, 'pt')}, se a energia de habilidade estiver cheia, em crítico, gera +${c} energia de habilidade para um aliado aleatório.` },
        { match: _P.modeEnergyFullOnCritGenSelf, replace: (m, mode, c) => `${_modeLoc(mode, 'pt')}, se a energia de habilidade estiver cheia, em crítico, gera +${c} energia de habilidade para si mesmo.` },
        { match: _P.healthLessThanDrain, replace: (m, hp, d) => `Se este personagem tiver menos de ${hp}% de vida, +${d}% de dreno.` },
        { match: _P.healthOrMoreApplyDurTarget, replace: (m, hp, pr, t) => `Se este personagem tiver ${hp}% ou mais de vida, aplica ${pr} por ${t} turnos ao alvo principal.` },
        { match: _P.barrierOrMoreApplyDurAllies, replace: (m, bp, pr, t) => `Se este personagem tiver ${bp}% ou mais de barreira, aplica ${pr} por ${t} turnos aos aliados.` },
        { match: _P.barrierOrMoreGainDur, replace: (m, bp, pr, t) => `Se este personagem tiver ${bp}% ou mais de barreira, ganha ${pr} por ${t} turnos.` },
        { match: _P.onTypeAssistGenAllAllies, replace: (m, type, c) => `Em assistência ${type}, gera +${c} energia de habilidade para todos os aliados.` },
        { match: _P.onTypeAssistGenChar, replace: (m, type, c, ch) => `Em assistência ${type}, gera +${c} energia de habilidade para ${ch}.` },
        { match: _P.ifNotFacingApplyTarget, replace: (m, ch, pr) => `Se não estiver enfrentando ${ch}, aplica ${pr} ao alvo principal.` },
        { match: _P.targetTraitApplyInjuredAlly, replace: (m, tr, pr) => `Se o alvo principal for ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, aplica ${pr} ao aliado mais ferido.` },
        { match: _P.copyAllGiveAlliesExclTwo, replace: (m, pr1, pr2) => `Copia todos os efeito(s) positivo(s) do alvo principal e dá aos aliados, exceto ${pr1} e ${pr2}.` },
        { match: _P.noteCantCritHit, replace: () => `Este ataque não pode ser um acerto crítico.` },
        { match: _P.modeApplyAllies, replace: (m, mode, pr) => `${_modeLoc(mode, 'pt')}, aplica ${pr} aos aliados.` },
        { match: _P.targetTraitApplyCountMaxInjured, replace: (m, tr, c, pr, mx) => `Se o alvo principal for ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, aplica +${c} ${pr}, até um máximo de ${mx} ao aliado mais ferido.` },
        { match: _P.modeGenEnergyChar, replace: (m, mode, c, ch) => `${_modeLoc(mode, 'pt')}, gera +${c} energia de habilidade para ${ch}.` },
        { match: _P.targetTraitApplyInjuredWithout, replace: (m, tr, pr, pr2) => `Se o alvo principal for ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, aplica ${pr} ao aliado mais ferido sem ${pr2}.` },
        { match: _P.modeHealRandomTraitAlly, replace: (m, mode, tr, hp) => `${_modeLoc(mode, 'pt')}, cura um aliado ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} aleatório em ${hp}% da vida máxima.` },
        { match: _P.selfHasOrLessApplyMaxAllies, replace: (m, c, pr, c2, pr2, mx) => `Se este personagem tiver ${c} ou menos ${pr}, aplica +${c2} ${pr2}, até um máximo de ${mx} aos aliados.` },
        { match: _P.selfHasProcChanceApplyTarget, replace: (m, pr, pct, pr2) => `Se este personagem tiver ${pr}, ${pct}% de chance de aplicar ${pr2} ao alvo principal.` },
        { match: _P.otherwiseSelfHasChanceGain, replace: (m, pr, pct, pr2) => `Caso contrário, se este personagem tiver ${pr}, ${pct}% de chance de ganhar ${pr2}.` },
        { match: _P.otherwiseSelfHasHealInjured, replace: (m, pr, hp) => `Caso contrário, se este personagem tiver ${pr}, cura o aliado mais ferido em ${hp}% da vida máxima.` },
      ],
    },
    // ==================== ITALIAN ====================
    it: {
      damageLine: (dmg, pierce, drain) => {
        const p = [];
        if (dmg > 0) p.push(`<span class="msf-iso8-damage-value">${dmg}%</span> di danno`);
        if (pierce > 0) p.push(`<span class="msf-iso8-piercing-value">${pierce}%</span> di Perforazione`);
        if (drain > 0) p.push(`<span class="msf-iso8-drain-value">${drain}%</span> di drenaggio`);
        return p.length > 0 ? `⚔️ Attacca il bersaglio primario per il ${p.join(' + ')}` : null;
      },
      title: 'ISO-8 Contro/Assistenza',
      patterns: [
        { match: _P.forcedDmgPierce, replace: (m, d, p, tr) => `Quando costretta ad attaccare un alleato, questo personaggio infligge ${d}% di danno + ${p}% di Perforazione ai personaggi ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.forcedDmg, replace: (m, d, tr) => `Quando costretta ad attaccare un alleato, questo personaggio infligge ${d}% di danno ai personaggi ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.flipEffects, replace: (m, n, c) => `Se ${n} è un alleato, trasforma ${c} effetti positivi casuali in effetti negativi sul bersaglio primario.` },
        { match: _P.flipRandom, replace: (m, n, c) => `Se ${n} è un alleato, trasforma ${c} effetti positivi casuali in effetti negativi sul bersaglio primario.` },
        { match: _P.applyProc, replace: (m, pr) => `Applica ${pr} al bersaglio primario.` },
        { match: _P.applyCount, replace: (m, c, pr) => `Applica ${c} di ${pr} al bersaglio primario.` },
        { match: _P.applyPlusDur, replace: (m, c, pr, t) => `Applica +${c} ${pr} per ${t} turni al bersaglio primario.` },
        { match: _P.applyPlus, replace: (m, c, pr) => `Applica +${c} ${pr} al bersaglio primario.` },
        { match: _P.applyAllies, replace: (m, c, pr) => `Applica +${c} ${pr} agli alleati.` },
        { match: _P.gainPlus, replace: (m, c, pr) => `Ottiene +${c} ${pr}.` },
        { match: _P.gainSpeedBar, replace: (m, p) => `Ottiene ${p}% di barra velocità.` },
        { match: _P.reduceSpeedBar, replace: (m, p) => `Riduce la barra velocità del ${p}%.` },
        { match: _P.gain, replace: (m, pr) => `Ottiene ${pr}.` },
        { match: _P.healthGain, replace: (m, p, pr) => `Se questo personaggio ha il ${p}% o meno di Salute, ottiene ${pr}.` },
        { match: _P.healthGeneric, replace: (m, p, r) => `Se questo personaggio ha il ${p}% o meno di Salute, ${r}` },
        // --- New patterns ---
        { match: _P.forcedPierceOnly, replace: (m, p, tr) => `Quando costretto ad attaccare un alleato, questo personaggio infligge ${p}% di Perforazione ai personaggi ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.ifAllyApplyRandom, replace: (m, n, pr) => `Se ${n} è un alleato, applica ${pr} a un alleato casuale.` },
        { match: _P.selfHasApplyCountDur, replace: (m, proc, c, pr, t) => `Se questo personaggio ha ${proc}, applica ${c} di ${pr} per ${t} turni al bersaglio primario.` },
        { match: _P.selfHasApply, replace: (m, proc, pr) => `Se questo personaggio ha ${proc}, applica ${pr} al bersaglio primario.` },
        { match: _P.selfHasClear, replace: (m, proc, c, pr) => `Se questo personaggio ha ${proc}, rimuove ${c} ${pr} dagli alleati.` },
        { match: _P.selfHasAttackInstead, replace: (m, proc, p, d) => `Se questo personaggio ha ${proc}, attacca invece per il ${p}% di Perforazione + ${d}% di Prosciugamento.` },
        { match: _P.selfNotHasApply, replace: (m, proc, pr) => `Se questo personaggio non ha ${proc}, applica ${pr} al bersaglio primario.` },
        { match: _P.modeGainCount, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'it')}, ottiene ${c} di ${pr}.` },
        { match: _P.modeSelfHasApply, replace: (m, mode, proc, pr) => `${_modeLoc(mode, 'it')}, se questo personaggio ha ${proc}, applica ${pr} al bersaglio primario.` },
        { match: _P.onAssistEnergy, replace: (m, type, c) => `In assistenza ${_modeLoc(type, 'it')}, genera +${c} Energia abilità per se stesso.` },
        { match: _P.modeReduceSpeedPerAlly, replace: (m, mode, p, tr) => `${_modeLoc(mode, 'it')}, riduce la barra velocità del ${p}% per ciascun alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.healthHealAllies, replace: (m, p, h) => `Se questo personaggio ha meno del ${p}% di Salute, cura gli alleati per il ${h}% della Salute massima.` },
        { match: _P.modeIgnoresDefUp, replace: (m, mode) => `${_modeLoc(mode, 'it')}, questo attacco ignora Aumento difesa.` },
        // --- Batch 3 patterns ---
        { match: _P.modeIfSelfHasCountDmg, replace: (m, mode, c, proc, d) => `${_modeLoc(mode, 'it')}, se questo personaggio ha ${c}+ ${proc}, +${d}% di danno.` },
        { match: _P.clearPosTarget, replace: (m, c) => `Rimuove ${c} effetto/i positivo/i dal bersaglio primario.` },
        { match: _P.applyAlliesNamed, replace: (m, pr) => `Applica ${pr} agli alleati.` },
        { match: _P.clearNegAllies, replace: (m, c) => `Rimuove ${c} effetto/i negativo/i dagli alleati.` },
        { match: _P.applyMostInjured, replace: (m, pr) => `Applica ${pr} all'alleato più ferito.` },
        { match: _P.clearNegMostInjured, replace: (m, c) => `Rimuove ${c} effetto/i negativo/i dall'alleato più ferito.` },
        { match: _P.modeApplyRandomTraitAlly, replace: (m, mode, c, pr, tr) => `${_modeLoc(mode, 'it')}, applica +${c} ${pr} a un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale.` },
        { match: _P.targetNotTraitDrain, replace: (m, tr, p) => `Se il bersaglio primario non è ${tr}, prosciuga ${p}% della Salute massima del bersaglio.` },
        { match: _P.targetTraitDrain, replace: (m, tr, p) => `Se il bersaglio primario è ${tr}, prosciuga ${p}% della Salute massima del bersaglio.` },
        { match: _P.notModeFlip, replace: (m, mode, c) => `${_notModeLoc(mode, 'it')}, trasforma ${c} effetto/i positivo/i in negativo/i sul bersaglio primario.` },
        { match: _P.modeFlipAll, replace: (m, mode) => `${_modeLoc(mode, 'it')}, trasforma tutti gli effetti positivi in negativi sul bersaglio primario.` },
        { match: _P.targetNoPosApply, replace: (m, pr) => `Se il bersaglio primario non ha effetti positivi, applica ${pr} al bersaglio primario.` },
        { match: _P.targetHasApply, replace: (m, proc, pr) => `Se il bersaglio primario ha ${proc}, applica ${pr} al bersaglio primario.` },
        { match: _P.applyUpToMaxRandomAlly, replace: (m, c, pr, max) => `Applica +${c} ${pr}, fino a un massimo di ${max} a un alleato casuale.` },
        { match: _P.onAssistProlongPos, replace: (m, proc, c) => `In assistenza, prolunga la durata di tutti gli effetti positivi, escluso ${proc}, di ${c} sugli alleati.` },
        { match: _P.prolongPosExcluding, replace: (m, proc, c) => `Prolunga la durata di tutti gli effetti positivi, escluso ${proc}, di ${c} sugli alleati.` },
        { match: _P.forcedDmgInstead, replace: (m, p) => `Quando costretto ad attaccare un alleato, attacca per il ${p}% di danno al suo posto.` },
        { match: _P.otherwiseDrain, replace: (m, p) => `Altrimenti, prosciuga ${p}% della Salute massima del bersaglio.` },
        { match: _P.anyEnemyHasClearPos, replace: (m, c) => `Se un nemico ha effetti positivi, rimuove ${c} effetto/i positivo/i dal bersaglio primario.` },
        { match: _P.clearNegRandomAlly, replace: (m, c) => `Rimuove ${c} effetto/i negativo/i da un alleato casuale.` },
        { match: _P.triggerBattlefield, replace: () => `Attiva l'effetto del campo di battaglia.` },
        { match: _P.noteIgnoresDefUp, replace: () => `Questo attacco ignora Aumento difesa.` },
        { match: _P.targetHasOrDmg, replace: (m, pr1, pr2, d) => `Se il bersaglio ha ${pr1} o ${pr2}, +${d}% di danno.` },
        { match: _P.flipAllPos, replace: () => `Trasforma tutti gli effetti positivi in negativi sul bersaglio primario.` },
        { match: _P.genEnergyAllAllies, replace: (m, c) => `Genera +${c} Energia abilità per tutti gli alleati.` },
        { match: _P.noteTargetHasOrCantBlock, replace: (m, pr1, pr2) => `Se il bersaglio ha ${pr1} o ${pr2}, questo attacco non può essere bloccato.` },
        { match: _P.selfHasDmgBoost, replace: (m, proc, d) => `Se questo personaggio ha ${proc}, +${d}% di danno.` },
        { match: _P.clearAllPosTarget, replace: () => `Rimuove tutti gli effetti positivi dal bersaglio primario.` },
        { match: _P.ifTraitAlliesApplyMax, replace: (m, c, tr, n, pr, max) => `Se ${c}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, applica +${n} ${pr}, fino a un massimo di ${max} agli alleati.` },
        { match: _P.applyMaxRandomTraitAlly, replace: (m, c, pr, max, tr) => `Applica +${c} ${pr}, fino a un massimo di ${max} a un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale.` },
        { match: _P.genEnergyTraitAllies, replace: (m, c, tr) => `Genera +${c} Energia abilità per gli alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        // --- Batch 4 patterns ---
        { match: _P.flipCountPos, replace: (m, c) => `Trasforma ${c} effetto/i positivo/i in negativo/i sul bersaglio primario.` },
        { match: _P.modeFlipCount, replace: (m, mode, c) => `${_modeLoc(mode, 'it')}, trasforma ${c} effetto/i positivo/i in negativo/i sul bersaglio primario.` },
        { match: _P.onCritReduceSpeed, replace: (m, p) => `Su colpo critico, riduce la barra velocità del ${p}%.` },
        { match: _P.onCritApply, replace: (m, c, pr) => `Su colpo critico, applica +${c} ${pr} al bersaglio primario.` },
        { match: _P.onAssistPiercing, replace: (m, p) => `In assistenza, +${p}% di danno perforante.` },
        { match: _P.onCounterChanceGain, replace: (m, pct, c, pr) => `In contrattacco, ${pct}% di probabilità di ottenere +${c} ${pr}.` },
        { match: _P.stealPosExcluding, replace: (m, c, excl) => `Ruba ${c} effetto/i positivo/i dal bersaglio primario e li dà agli alleati, escluso ${excl}.` },
        { match: _P.barrierAllies, replace: (m, p) => `Barriera del ${p}% della salute massima agli alleati.` },
        { match: _P.barrierMostInjuredNonSummon, replace: (m, p) => `Barriera del ${p}% della salute massima all'alleato non evocato più ferito.` },
        { match: _P.genEnergyRandomAlly, replace: (m, c) => `Genera +${c} Energia abilità per un alleato casuale.` },
        { match: _P.selfHasReduceDur, replace: (m, proc, proc2, c) => `Se questo personaggio ha ${proc}, riduce la durata di ${proc2} di ${c} sugli alleati.` },
        { match: _P.prolongNegExcluding, replace: (m, excl, c) => `Prolunga la durata di tutti gli effetti negativi, escluso ${excl}, di ${c}.` },
        { match: _P.drainDmgDealt, replace: (m, p) => `Drena ${p}% del danno inflitto come salute.` },
        { match: _P.drainFlat, replace: (m, p) => `Drena ${p}% della salute massima del bersaglio.` },
        { match: _P.chanceApply, replace: (m, pct, pr) => `${pct}% di probabilità di applicare ${pr} al bersaglio primario.` },
        { match: _P.modeReduceSpeed, replace: (m, mode, p) => `${_modeLoc(mode, 'it')}, riduce la barra velocità del ${p}%.` },
        { match: _P.modeGain, replace: (m, mode, pr) => `${_modeLoc(mode, 'it')}, ottiene ${pr}.` },
        { match: _P.clearAllProcTarget, replace: (m, pr) => `Rimuove tutto ${pr} dal bersaglio primario.` },
        { match: _P.applyRandomAlly, replace: (m, pr) => `Applica ${pr} a un alleato casuale.` },
        { match: _P.attackAdditional, replace: () => `Attacca un nemico aggiuntivo.` },
        { match: _P.copyNegExcluding, replace: (m, c, excl) => `Copia ${c} effetto/i negativo/i dal bersaglio primario, escluso ${excl}.` },
        { match: _P.noteDebuffsNotResisted, replace: () => `I debuff di questo attacco non possono essere resistiti.` },
        { match: _P.targetTraitReduceSpeed, replace: (m, tr, p) => `Se il bersaglio primario è ${tr}, riduce la barra velocità del ${p}%.` },
        { match: _P.modeStatPerAlly, replace: (m, mode, p, stat, tr) => `${_modeLoc(mode, 'it')}, +${p}% ${stat} per ogni alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.modeReviveAt, replace: (m, mode, name, p) => `${_modeLoc(mode, 'it')}, rianima ${name} al ${p}% di salute.` },
        // --- Batch 5 patterns ---
        { match: _P.modeTraitAllyStealAllExcl, replace: (m, mode, c, tr, ally, excl) => `${_modeLoc(mode, 'it')}, se ${c}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, se ${ally} è un alleato, ruba tutti gli effetti positivi dal bersaglio primario e li dà agli alleati, escluso ${excl}.` },
        { match: _P.modeTraitAllyStealProc, replace: (m, mode, c, tr, ally, proc) => `${_modeLoc(mode, 'it')}, se ${c}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, se ${ally} è un alleato, ruba ${proc} dal bersaglio primario e lo dà agli alleati.` },
        { match: _P.modeApplyPlus, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'it')}, applica +${c} ${pr} al bersaglio primario.` },
        { match: _P.modeApplyProc, replace: (m, mode, pr) => `${_modeLoc(mode, 'it')}, applica ${pr} al bersaglio primario.` },
        { match: _P.modeApplyAllies, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'it')}, applica +${c} ${pr} agli alleati.` },
        { match: _P.modeClearCountTarget, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'it')}, rimuove ${c} ${pr} dal bersaglio primario.` },
        { match: _P.otherwiseApplyPlus, replace: (m, c, pr) => `Altrimenti, applica +${c} ${pr} al bersaglio primario.` },
        { match: _P.otherwiseApplyProc, replace: (m, pr) => `Altrimenti, applica ${pr} al bersaglio primario.` },
        { match: _P.otherwiseModeClearAllPos, replace: (m, mode) => `Altrimenti, ${_modeLoc(mode, 'it')}, rimuove tutti gli effetti positivi dal bersaglio primario.` },
        { match: _P.clearFromSelf, replace: (m, pr) => `Rimuove tutto ${pr} da sé.` },
        { match: _P.clearCountProcTarget, replace: (m, c, pr) => `Rimuove ${c} ${pr} dal bersaglio primario.` },
        { match: _P.selfNotHasClearNeg, replace: (m, proc) => `Se questo personaggio non ha ${proc}, rimuove tutti gli effetti negativi dagli alleati.` },
        { match: _P.selfNotHasApplyMaxAllies, replace: (m, proc, c, pr, max) => `Se questo personaggio non ha ${proc}, applica +${c} ${pr}, fino a un massimo di ${max} agli alleati.` },
        { match: _P.targetHasReduceSpeed, replace: (m, proc, p) => `Se il bersaglio primario ha ${proc}, riduce la barra velocità del ${p}%.` },
        { match: _P.targetHasApplyAllies, replace: (m, proc, c, pr, max) => `Se il bersaglio primario ha ${proc}, applica +${c} ${pr}, fino a un massimo di ${max} agli alleati.` },
        { match: _P.targetTraitGainMax, replace: (m, tr, c, pr, max) => `Se il bersaglio primario è ${tr}, ottiene +${c} ${pr}, fino a un massimo di ${max}.` },
        { match: _P.modeOnCritApply, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'it')}, su colpo critico, applica +${c} ${pr} al bersaglio primario.` },
        { match: _P.notModeOnCritReduceSpeed, replace: (m, mode, p) => `${_notModeLoc(mode, 'it')}, su colpo critico, riduce la barra velocità del ${p}%.` },
        { match: _P.modeCallAssist, replace: (m, mode, tr) => `${_modeLoc(mode, 'it')}, chiama un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale ad assistere.` },
        { match: _P.modeNoteCantDodge, replace: (m, mode) => `${_modeLoc(mode, 'it')}, questo attacco non può essere schivato.` },
        { match: _P.modeTargetHasReduceDur, replace: (m, mode, proc, proc2, c) => `${_modeLoc(mode, 'it')}, se il bersaglio primario ha ${proc}, riduce la durata di ${proc2} di ${c}.` },
        { match: _P.modeProlongNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'it')}, prolunga la durata degli effetti negativi di ${c}.` },
        { match: _P.notModeProlongNegExcl, replace: (m, mode, excl, c) => `${_notModeLoc(mode, 'it')}, prolunga la durata di tutti gli effetti negativi, escluso ${excl}, di ${c}.` },
        { match: _P.stealAllExcluding, replace: (m, excl) => `Ruba tutti gli effetti positivi dal bersaglio primario, escluso ${excl}.` },
        { match: _P.stealAllGiveExcluding, replace: (m, excl) => `Ruba tutti gli effetti positivi dal bersaglio primario e li dà agli alleati, escluso ${excl}.` },
        { match: _P.transferAllPos, replace: () => `Trasferisce tutti gli effetti positivi da sé come effetti negativi.` },
        { match: _P.applyMostInjuredTrait, replace: (m, c, pr, tr) => `Applica ${c} ${pr} all'alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} più ferito.` },
        { match: _P.onAssistApplyMaxAllies, replace: (m, c, pr, max) => `In assistenza, applica +${c} ${pr}, fino a un massimo di ${max} agli alleati.` },
        { match: _P.selfHasMoreModeProlongNeg, replace: (m, n, proc, mode, c) => `Se questo personaggio ha più di ${n} ${proc}, ${_modeLoc(mode, 'it')}, prolunga la durata degli effetti negativi di ${c}.` },
        { match: _P.selfHasMoreNotModeProlongNegExcl, replace: (m, n, proc, mode, excl, c) => `Se questo personaggio ha più di ${n} ${proc}, ${_notModeLoc(mode, 'it')}, prolunga la durata di tutti gli effetti negativi, escluso ${excl}, di ${c}.` },
        { match: _P.barrierMostInjured, replace: (m, p) => `Barriera del ${p}% della salute massima all'alleato più ferito.` },
        { match: _P.onAssistDmg, replace: (m, p) => `In assistenza, +${p}% di danno.` },
        // --- Batch 6 patterns ---
        { match: _P.onTriggerGainPlus, replace: (m, trig, c, pr) => `In ${trig === 'Counter' ? 'contrattacco' : 'colpo critico'}, ottiene +${c} ${pr}.` },
        { match: _P.flipNegToPosAllies, replace: (m, c) => `Converte ${c} effetto/i negativo/i in positivo/i sugli alleati.` },
        { match: _P.stealProcGiveAllies, replace: (m, pr) => `Ruba ${pr} dal bersaglio primario e lo dà agli alleati.` },
        { match: _P.selfHasCritBoost, replace: (m, pr, p) => `Se questo personaggio ha ${pr}, +${p}% probabilità di colpo critico.` },
        { match: _P.traitAllyExistsDmg, replace: (m, tr, p) => `Se esiste un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, +${p}% di danno.` },
        { match: _P.applyProcMostInjuredTrait, replace: (m, pr, tr) => `Applica ${pr} all'alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} più ferito.` },
        // --- Batch 7 patterns ---
        { match: _P.applyProcRandomTraitAlly, replace: (m, pr, tr) => `Applica ${pr} a un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale.` },
        { match: _P.modeStatBoost, replace: (m, mode, p, stat) => `${_modeLoc(mode, 'it')}, +${p}% ${stat}.` },
        { match: _P.ifAllyNoteAttackCant, replace: (m, name, what) => `Se ${name} è un alleato, questo attacco non può essere ${what === 'dodged' ? 'schivato' : what === 'blocked' ? 'bloccato' : what === 'missed' ? 'mancato' : what}.` },
        { match: _P.statPerTraitAlly, replace: (m, p, stat, tr) => `+${p}% ${stat} per ogni alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.genEnergyForNamed, replace: (m, c, name) => `Genera +${c} energia abilità per ${name}.` },
        { match: _P.healRandomTraitAlly, replace: (m, tr, p) => `Cura un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale del ${p}% della salute massima.` },
        { match: _P.targetHasStatBoost, replace: (m, proc, p, stat) => `Se il bersaglio ha ${proc}, +${p}% ${stat}.` },
        { match: _P.flipNegToPosRandomTraitAlly, replace: (m, c, tr) => `Converte ${c} effetto/i negativo/i in positivo/i su un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale.` },
        { match: _P.drainRedistribute, replace: (m, p, target) => `Drena il ${p}% della salute massima del bersaglio e ridistribuisce agli alleati ${_traitLoc(target, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.selfNotHasApplyAllies, replace: (m, proc, pr) => `Se questo personaggio non ha ${proc}, applica ${pr} agli alleati.` },
        { match: _P.selfIsTraitDmg, replace: (m, tr, p) => `Se questo personaggio è ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, +${p}% di danno.` },
        { match: _P.healAllies, replace: (m, p) => `Cura gli alleati del ${p}% della salute massima.` },
        { match: _P.stealCountExcluding, replace: (m, c, excl) => `Ruba ${c} effetto/i positivo/i dal bersaglio primario, escluso ${excl}.` },
        { match: _P.onCritApplyMaxAllies, replace: (m, c, pr, max) => `In colpo critico, applica +${c} ${pr}, fino a un massimo di ${max} agli alleati.` },
        { match: _P.modeGenEnergyTraitAllies, replace: (m, mode, c, tr) => `${_modeLoc(mode, 'it')}, genera +${c} energia abilità per gli alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        // --- Batch 8 ---
        { match: _P.ifTraitAlliesApplyProc, replace: (m, n, tr, pr) => `Se ${n}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, applica ${pr} al bersaglio primario.` },
        { match: _P.ifTraitAlliesGain, replace: (m, n, tr, pr) => `Se ${n}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, ottiene ${pr}.` },
        { match: _P.ifTraitAlliesDmg, replace: (m, n, tr, p) => `Se ${n}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, +${p}% di danno.` },
        { match: _P.ifTraitAlliesFlip, replace: (m, n, tr, c) => `Se ${n}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, converte ${c} effetto/i positivo/i in negativo/i sul bersaglio primario.` },
        { match: _P.dmgPerEffectOnTarget, replace: (m, p, type) => `+${p}% di danno per ogni effetto ${type === 'positive' ? 'positivo' : 'negativo'} sul bersaglio primario.` },
        { match: _P.reduceSpeedPerTraitAlly, replace: (m, p, tr) => `Riduce la barra della velocità del ${p}% per ogni alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        { match: _P.targetHasGainSpeedBar, replace: (m, pr, p) => `Se il bersaglio primario ha ${pr}, ottiene ${p}% di barra della velocità.` },
        { match: _P.targetHasGenEnergy, replace: (m, pr, c) => `Se il bersaglio primario ha ${pr}, genera +${c} energia abilità per tutti gli alleati.` },
        { match: _P.targetHasFlipPos, replace: (m, pr, c) => `Se il bersaglio primario ha ${pr}, converte ${c} effetto/i positivo/i in negativo/i sul bersaglio primario.` },
        { match: _P.targetNotHasApply, replace: (m, pr1, pr2) => `Se il bersaglio primario non ha ${pr1}, applica ${pr2} al bersaglio primario.` },
        { match: _P.otherwiseFlipPos, replace: (m, c) => `Altrimenti, converte ${c} effetto/i positivo/i in negativo/i sul bersaglio primario.` },
        { match: _P.modeNoteAttackCant, replace: (m, mode, what) => `${_modeLoc(mode, 'it')}, questo attacco non può essere ${what === 'countered' ? 'contrattaccato' : what === 'blocked' ? 'bloccato' : what === 'dodged' ? 'schivato' : what}.` },
        // --- Batch 9 patterns ---
        { match: _P.barrierSelf, replace: (m, p) => `Barriera del ${p}% della salute massima.` },
        { match: _P.prolongProcBy, replace: (m, pr, c) => `Prolunga la durata di ${pr} di ${c}.` },
        { match: _P.notModeChanceApply, replace: (m, mode, ch, pr) => `${_notModeLoc(mode, 'it')}, ${ch}% di probabilità di applicare ${pr} al bersaglio primario.` },
        { match: _P.modeChanceGain, replace: (m, mode, ch, pr) => `${_modeLoc(mode, 'it')}, ${ch}% di probabilità di ottenere ${pr}.` },
        { match: _P.clearCountProcAllies, replace: (m, c, pr) => `Rimuove ${c} ${pr} dagli alleati.` },
        { match: _P.applyProcToEnemies, replace: (m, pr, c) => `Applica ${pr} a ${c} nemici.` },
        { match: _P.applyCountToEnemies, replace: (m, n, pr, c) => `Applica ${n} ${pr} a ${c} nemici.` },
        { match: _P.applyProcDurToEnemies, replace: (m, pr, t, c) => `Applica ${pr} per ${t} turni a ${c} nemici.` },
        { match: _P.clearNegRandomTraitAlly, replace: (m, c, tr) => `Rimuove ${c} effetto/i negativo/i da un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale.` },
        { match: _P.clearNegMostInjuredTraitAlly, replace: (m, c, tr) => `Rimuove ${c} effetto/i negativo/i dall'alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} più ferito.` },
        { match: _P.onCritStealAllExcl, replace: (m, pr) => `Su colpo critico, ruba tutti gli effetti positivi dal bersaglio primario, escluso ${pr}.` },
        { match: _P.onAssistApplyMaxTarget, replace: (m, c, pr, max) => `In assistenza, applica +${c} ${pr}, fino a un massimo di ${max} al bersaglio primario.` },
        { match: _P.copyPosGiveExcl, replace: (m, c, pr) => `Copia ${c} effetto/i positivo/i dal bersaglio primario e li dà agli alleati, escluso ${pr}.` },
        { match: _P.targetTraitGainProc, replace: (m, tr, pr) => `Se il bersaglio primario è ${tr}, ottiene ${pr}.` },
        { match: _P.flipPosNEnemies, replace: (m, c, n) => `Converte ${c} effetto/i positivo/i in negativo/i su ${n} nemici.` },
        { match: _P.barrierRandomTraitAlly, replace: (m, p, tr) => `Barriera del ${p}% della salute massima a un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale.` },
        // --- Batch 10 ---
        { match: _P.piercingAdditional, replace: (m, p) => `+${p}% di Perforazione ai nemici aggiuntivi.` },
        { match: _P.dmgPierceAdditional, replace: (m, d, p) => `+${d}% di danno + ${p}% di Perforazione ai nemici aggiuntivi.` },
        { match: _P.modeApplyPlusRandomAlly, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'it')}, applica +${c} ${pr} a un alleato casuale.` },
        { match: _P.drainAlliesHealth, replace: (m, p) => `Drena il ${p}% della salute massima degli alleati.` },
        { match: _P.ifAllyNoteCantMiss, replace: (m, ally) => `Se ${ally} è un alleato, questo attacco non può mancare.` },
        { match: _P.targetHasAttackPierceInstead, replace: (m, proc, p) => `Se il bersaglio primario ha ${proc}, attacca per ${p}% di Perforazione invece.` },
        { match: _P.targetHasDrainRedistribute, replace: (m, proc, p, target) => `Se il bersaglio primario ha ${proc}, drena il ${p}% della salute massima del bersaglio e redistribuisce ai ${target}.` },
        { match: _P.modeOnCritClearNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'it')}, su colpo critico, rimuove ${c} effetto/i negativo/i dagli alleati.` },
        { match: _P.ifAllyStealAllGiveExcl, replace: (m, ally, pr) => `Se ${ally} è un alleato, ruba tutti gli effetti positivi dal bersaglio primario e li dà agli alleati, escluso ${pr}.` },
        { match: _P.applyProcToAllyHighest, replace: (m, pr, tr, stat) => `Applica ${pr} all'alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} con il più alto ${stat}.` },
        { match: _P.applyProcRandomAllyBelowHealth, replace: (m, pr, p) => `Applica ${pr} a un alleato casuale sotto il ${p}% di salute.` },
        { match: _P.allAlliesHaveGainSpeedBar, replace: (m, proc, p) => `Se tutti gli alleati hanno ${proc}, ottiene ${p}% di barra velocità.` },
        { match: _P.targetHasStealCountExcl, replace: (m, proc, c, pr) => `Se il bersaglio primario ha ${proc}, ruba ${c} effetto/i positivo/i dal bersaglio primario, escluso ${pr}.` },
        { match: _P.selfHasLessThanApplyMaxAllies, replace: (m, n, proc, c, pr, max) => `Se ha meno di ${n} ${proc}, applica +${c} ${pr}, fino a un massimo di ${max} agli alleati.` },
        { match: _P.targetTraitApplyProcAllyHighest, replace: (m, tr, pr, stat) => `Se il bersaglio primario è ${tr}, applica ${pr} all'alleato con il più alto ${stat}.` },
        { match: _P.modeIfTraitAlliesStealProc, replace: (m, mode, c, tr, proc) => `${_modeLoc(mode, 'it')}, se ${c}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, ruba ${proc} dal bersaglio primario e lo dà agli alleati.` },
        // --- Batch 11 ---
        { match: _P.targetHasPosClearPos, replace: (m, c) => `Se il bersaglio primario ha effetti positivi, rimuove ${c} effetto/i positivo/i dal bersaglio primario.` },
        { match: _P.modeSubTargetHasDrain, replace: (m, mode, sub, proc, p) => `${_modeLoc(mode, 'it')}, ${sub}, se il bersaglio primario ha ${proc}, drena il ${p}% della salute massima del bersaglio.` },
        { match: _P.modeSubReduceDur, replace: (m, mode, sub, proc, c) => `${_modeLoc(mode, 'it')}, ${sub}, riduce la durata di ${proc} di ${c}.` },
        { match: _P.modeApplyPlusRandomAllyExclSelf, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'it')}, applica +${c} ${pr} a un alleato casuale (escluso se stesso).` },
        { match: _P.modeOrSubClearNegRandomTraitAlly, replace: (m, m1, m2, sub, c, tr) => `${_modeLoc(m1, 'it')} o ${_modeLoc(m2, 'it')}, ${sub}, rimuove ${c} effetto/i negativo/i da un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale.` },
        { match: _P.selfHasClearPos, replace: (m, proc, c) => `Se ha ${proc}, rimuove ${c} effetto/i positivo/i dal bersaglio primario.` },
        { match: _P.selfNotHasFlipPos, replace: (m, proc, c) => `Se non ha ${proc}, converte ${c} effetto/i positivo/i in negativo/i sul bersaglio primario.` },
        { match: _P.selfHasClearNegSelf, replace: (m, proc) => `Se ha ${proc}, rimuove tutti gli effetti negativi da se stesso.` },
        { match: _P.selfHasClearCountFromSelf, replace: (m, proc, c, pr) => `Se ha ${proc}, rimuove ${c} ${pr} da se stesso.` },
        { match: _P.targetHasClearAllProc, replace: (m, proc, pr) => `Se il bersaglio primario ha ${proc}, rimuove tutto ${pr} dal bersaglio primario.` },
        { match: _P.onAssistTargetHasClearAllProc, replace: (m, proc, pr) => `In assistenza, se il bersaglio primario ha ${proc}, rimuove tutto ${pr} dal bersaglio primario.` },
        { match: _P.targetTraitApplyCountDur, replace: (m, tr, c, pr, t) => `Se il bersaglio primario è ${tr}, applica ${c} ${pr} per ${t} turni al bersaglio primario.` },
        { match: _P.targetTraitApplyCount, replace: (m, tr, c, pr) => `Se il bersaglio primario è ${tr}, applica ${c} ${pr} al bersaglio primario.` },
        { match: _P.onCritBarrierAllies, replace: (m, p) => `Su colpo critico, barriera del ${p}% della salute massima agli alleati.` },
        { match: _P.ifTraitAlliesCritChance, replace: (m, c, tr, p) => `Se ${c}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, +${p}% di probabilità di critico.` },
        { match: _P.ifTraitAlliesCritPerAlly, replace: (m, c, tr, p, tr2) => `Se ${c}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, +${p}% di probabilità di critico per alleato ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict).toUpperCase()}.` },
        // --- Batch 12 ---
        { match: _P.onCritGenEnergyRandomAlly, replace: (m, c) => `Su colpo critico, genera +${c} energia abilità per un alleato casuale.` },
        { match: _P.onCounterOnCritGenEnergy, replace: (m, c) => `Su contrattacco, su colpo critico, genera +${c} energia abilità per un alleato casuale.` },
        { match: _P.removeBarrierTarget, replace: () => `Rimuove la barriera dal bersaglio primario.` },
        { match: _P.modeSubFlipNegToPosAllies, replace: (m, mode, sub) => `${_modeLoc(mode, 'it')}, ${sub}, converte tutti gli effetti negativi in positivi sugli alleati.` },
        { match: _P.modeSubTargetNotTraitDrain, replace: (m, mode, sub, tr, p) => `${_modeLoc(mode, 'it')}, ${sub}, se il bersaglio primario non è ${tr}, drena il ${p}% della salute massima del bersaglio.` },
        { match: _P.targetNotHasClearPos, replace: (m, proc, c) => `Se il bersaglio primario non ha ${proc}, rimuove ${c} effetto/i positivo/i dal bersaglio primario.` },
        { match: _P.selfHasGainSpeedBar, replace: (m, proc, p) => `Se ha ${proc}, ottiene ${p}% di barra velocità.` },
        { match: _P.selfHasGainCount, replace: (m, proc, c, pr) => `Se ha ${proc}, ottiene ${c} ${pr}.` },
        { match: _P.healTarget, replace: (m, p) => `Cura il bersaglio primario del ${p}% della salute massima.` },
        { match: _P.ifAllyApplyCount, replace: (m, ally, c, pr) => `Se ${ally} è un alleato, applica ${c} ${pr} al bersaglio primario.` },
        { match: _P.notModeChanceGain, replace: (m, mode, p, pr) => `${_notModeLoc(mode, 'it')}, ${p}% di probabilità di ottenere ${pr}.` },
        { match: _P.ifAllyDmgPierce, replace: (m, ally, d, p) => `Se ${ally} è un alleato, +${d}% di danno + ${p}% di Perforazione.` },
        { match: _P.ifAllyApplyDur, replace: (m, ally, pr, t) => `Se ${ally} è un alleato, applica ${pr} per ${t} turni al bersaglio primario.` },
        { match: _P.selfIsTraitApplyProc, replace: (m, tr, pr) => `Se è ${tr}, applica ${pr} al bersaglio primario.` },
        { match: _P.selfNotTraitApplyProc, replace: (m, tr, pr) => `Se non è ${tr}, applica ${pr} al bersaglio primario.` },
        { match: _P.targetTraitApplyProc, replace: (m, tr, pr) => `Se il bersaglio primario è ${tr}, applica ${pr} al bersaglio primario.` },
        // --- Batch 13 ---
        { match: _P.targetTraitOrApplyCountDurInjured, replace: (m, tr1, tr2, c, pr, t) => `Se il bersaglio primario è ${tr1} o ${tr2}, applica ${c} ${pr} per ${t} turni all'alleato più ferito.` },
        { match: _P.onAssistModeOnCritApply, replace: (m, mode, pr) => `In assistenza, ${_modeLoc(mode, 'it')}, su colpo critico, applica ${pr} al bersaglio primario.` },
        { match: _P.otherwiseSelfOrTargetHasCrit, replace: (m, tr, proc, p) => `Altrimenti, se è ${tr} o il bersaglio ha ${proc}, +${p}% di probabilità di critico.` },
        { match: _P.healthOrChargedDmg, replace: (m, hp, proc, d) => `Se questo personaggio ha ${hp}% o meno di salute o ha ${proc}, +${d}% di danno.` },
        { match: _P.applyDurTraitAllyLowest, replace: (m, pr, t, tr, stat) => `Applica ${pr} per ${t} turni all'alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} con il più basso ${stat}.` },
        { match: _P.otherwiseTargetHasApplyAllies, replace: (m, proc, c, pr) => `Altrimenti, se il bersaglio primario ha ${proc}, applica +${c} ${pr} agli alleati.` },
        { match: _P.modeIfTraitAlliesCallHighest, replace: (m, mode, c, tr, tr2, stat) => `${_modeLoc(mode, 'it')}, se ${c}+ alleati ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()}, chiama l'alleato ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict).toUpperCase()} con il più alto ${stat} ad assistere.` },
        { match: _P.modeOnAssistTypeGenTraitAlly, replace: (m, mode, type, c, tr) => `${_modeLoc(mode, 'it')}, in assistenza ${type}, genera +${c} energia abilità per un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale.` },
        { match: _P.selfHasProcCritPerTraitOrAlly, replace: (m, proc, p, tr1, tr2) => `Se ha ${proc}, +${p}% di probabilità di critico per alleato ${tr1} o ${tr2}.` },
        { match: _P.modeHealthReduceDurRandomTraitAlly, replace: (m, mode, hp, c, tr) => `${_modeLoc(mode, 'it')}, se questo personaggio ha più di ${hp}% di salute, riduce la durata degli effetti negativi di ${c} su un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict).toUpperCase()} casuale.` },
        { match: _P.targetHasAndHasRemoveBarrier, replace: (m, p1, p2) => `Se il bersaglio primario ha ${p1} e ha ${p2}, rimuove la barriera dal bersaglio primario.` },
        { match: _P.selfHasCountAnyEnemyFlip, replace: (m, c, proc, n) => `Se ha ${c}+ ${proc} e un nemico ha effetti positivi, converte ${n} effetto/i positivo/i in negativo/i sul bersaglio primario.` },
        { match: _P.selfLessCountAnyEnemyFlip, replace: (m, c, proc, n) => `Se ha meno di ${c} ${proc} e un nemico ha effetti positivi, converte ${n} effetto/i positivo/i in negativo/i sul bersaglio primario.` },
        { match: _P.modeOnCritProlongNegExcl, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'it')}, su colpo critico, prolunga la durata di tutti gli effetti negativi, escluso ${pr}, di ${c}.` },
        { match: _P.modeOnCritProlongProc, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'it')}, su colpo critico, prolunga la durata di ${pr} di ${c}.` },
        { match: _P.modeBarrierRandomAlly, replace: (m, mode, p) => `${_modeLoc(mode, 'it')}, barriera del ${p}% della salute massima a un alleato casuale.` },
        // --- Batch 14 ---
        { match: _P.modeEnergyFullOnCritGenRandomAlly, replace: (m, mode, c) => `${_modeLoc(mode, 'it')}, se l'energia abilità è piena, su critico, genera +${c} energia abilità per un alleato casuale.` },
        { match: _P.modeEnergyFullOnCritGenSelf, replace: (m, mode, c) => `${_modeLoc(mode, 'it')}, se l'energia abilità è piena, su critico, genera +${c} energia abilità per sé stesso.` },
        { match: _P.healthLessThanDrain, replace: (m, hp, d) => `Se questo personaggio ha meno del ${hp}% di salute, +${d}% di drenaggio.` },
        { match: _P.healthOrMoreApplyDurTarget, replace: (m, hp, pr, t) => `Se questo personaggio ha ${hp}% o più di salute, applica ${pr} per ${t} turni al bersaglio principale.` },
        { match: _P.barrierOrMoreApplyDurAllies, replace: (m, bp, pr, t) => `Se questo personaggio ha ${bp}% o più di barriera, applica ${pr} per ${t} turni agli alleati.` },
        { match: _P.barrierOrMoreGainDur, replace: (m, bp, pr, t) => `Se questo personaggio ha ${bp}% o più di barriera, ottiene ${pr} per ${t} turni.` },
        { match: _P.onTypeAssistGenAllAllies, replace: (m, type, c) => `In assistenza ${type}, genera +${c} energia abilità per tutti gli alleati.` },
        { match: _P.onTypeAssistGenChar, replace: (m, type, c, ch) => `In assistenza ${type}, genera +${c} energia abilità per ${ch}.` },
        { match: _P.ifNotFacingApplyTarget, replace: (m, ch, pr) => `Se non si affronta ${ch}, applica ${pr} al bersaglio principale.` },
        { match: _P.targetTraitApplyInjuredAlly, replace: (m, tr, pr) => `Se il bersaglio principale è ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, applica ${pr} all'alleato più ferito.` },
        { match: _P.copyAllGiveAlliesExclTwo, replace: (m, pr1, pr2) => `Copia tutti gli effetto/i positivo/i dal bersaglio principale e li dà agli alleati, esclusi ${pr1} e ${pr2}.` },
        { match: _P.noteCantCritHit, replace: () => `Questo attacco non può colpire criticamente.` },
        { match: _P.modeApplyAllies, replace: (m, mode, pr) => `${_modeLoc(mode, 'it')}, applica ${pr} agli alleati.` },
        { match: _P.targetTraitApplyCountMaxInjured, replace: (m, tr, c, pr, mx) => `Se il bersaglio principale è ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, applica +${c} ${pr}, fino a un massimo di ${mx} all'alleato più ferito.` },
        { match: _P.modeGenEnergyChar, replace: (m, mode, c, ch) => `${_modeLoc(mode, 'it')}, genera +${c} energia abilità per ${ch}.` },
        { match: _P.targetTraitApplyInjuredWithout, replace: (m, tr, pr, pr2) => `Se il bersaglio principale è ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, applica ${pr} all'alleato più ferito senza ${pr2}.` },
        { match: _P.modeHealRandomTraitAlly, replace: (m, mode, tr, hp) => `${_modeLoc(mode, 'it')}, cura un alleato ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} casuale del ${hp}% della salute massima.` },
        { match: _P.selfHasOrLessApplyMaxAllies, replace: (m, c, pr, c2, pr2, mx) => `Se questo personaggio ha ${c} o meno ${pr}, applica +${c2} ${pr2}, fino a un massimo di ${mx} agli alleati.` },
        { match: _P.selfHasProcChanceApplyTarget, replace: (m, pr, pct, pr2) => `Se questo personaggio ha ${pr}, ${pct}% di probabilità di applicare ${pr2} al bersaglio principale.` },
        { match: _P.otherwiseSelfHasChanceGain, replace: (m, pr, pct, pr2) => `Altrimenti, se questo personaggio ha ${pr}, ${pct}% di probabilità di ottenere ${pr2}.` },
        { match: _P.otherwiseSelfHasHealInjured, replace: (m, pr, hp) => `Altrimenti, se questo personaggio ha ${pr}, cura l'alleato più ferito del ${hp}% della salute massima.` },
      ],
    },
    // ==================== JAPANESE ====================
    ja: {
      damageLine: (dmg, pierce, drain) => {
        const p = [];
        if (dmg > 0) p.push(`<span class="msf-iso8-damage-value">${dmg}%</span>のダメージ`);
        if (pierce > 0) p.push(`<span class="msf-iso8-piercing-value">${pierce}%</span>の貫通効果`);
        if (drain > 0) p.push(`<span class="msf-iso8-drain-value">${drain}%</span>の吸収`);
        return p.length > 0 ? `⚔️ メインターゲットを${p.join(' + ')}で攻撃` : null;
      },
      title: 'ISO-8 カウンター/アシスト',
      patterns: [
        { match: _P.forcedDmgPierce, replace: (m, d, p, tr) => `味方を攻撃させられた場合、このキャラクターが${localizeText(tr, SENTENCE_TEMPLATES._activeDict)}キャラクターに${d}%のダメージ + ${p}%の貫通効果を与える。` },
        { match: _P.forcedDmg, replace: (m, d, tr) => `味方を攻撃させられた場合、このキャラクターが${localizeText(tr, SENTENCE_TEMPLATES._activeDict)}キャラクターに${d}%のダメージを与える。` },
        { match: _P.flipEffects, replace: (m, n, c) => `味方に${n}がいる場合、メインターゲットに付与されているランダムなポジティブ効果${c}個をネガティブ効果に反転。` },
        { match: _P.flipRandom, replace: (m, n, c) => `味方に${n}がいる場合、メインターゲットに付与されているランダムなポジティブ効果${c}個をネガティブ効果に反転。` },
        { match: _P.applyProc, replace: (m, pr) => `メインターゲットに${pr}を適用。` },
        { match: _P.applyCount, replace: (m, c, pr) => `メインターゲットに${pr}を${c}個適用。` },
        { match: _P.applyPlusDur, replace: (m, c, pr, t) => `メインターゲットに+${c}${pr}を${t}ターン適用。` },
        { match: _P.applyPlus, replace: (m, c, pr) => `メインターゲットに+${c}${pr}を適用。` },
        { match: _P.applyAllies, replace: (m, c, pr) => `味方に+${c}${pr}を適用。` },
        { match: _P.gainPlus, replace: (m, c, pr) => `+${c}${pr}を獲得。` },
        { match: _P.gainSpeedBar, replace: (m, p) => `スピードバーを${p}%獲得。` },
        { match: _P.reduceSpeedBar, replace: (m, p) => `スピードバーを${p}%減少。` },
        { match: _P.gain, replace: (m, pr) => `${pr}を獲得。` },
        { match: _P.healthGain, replace: (m, p, pr) => `このキャラクターの体力が${p}%以下の場合、${pr}を獲得。` },
        { match: _P.healthGeneric, replace: (m, p, r) => `このキャラクターの体力が${p}%以下の場合、${r}` },
        // --- New patterns ---
        { match: _P.forcedPierceOnly, replace: (m, p, tr) => `味方を攻撃させられた場合、${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}キャラクターに${p}%の貫通効果を与える。` },
        { match: _P.ifAllyApplyRandom, replace: (m, n, pr) => `味方に${n}がいる場合、味方1体にランダムで${pr}を適用。` },
        { match: _P.selfHasApplyCountDur, replace: (m, proc, c, pr, t) => `このキャラクターに${proc}がある場合、メインターゲットに${pr}を${c}回、${t}ターン適用。` },
        { match: _P.selfHasApply, replace: (m, proc, pr) => `このキャラクターに${proc}がある場合、メインターゲットに${pr}を適用。` },
        { match: _P.selfHasClear, replace: (m, proc, c, pr) => `このキャラクターに${proc}がある場合、味方から${pr}を${c}個解除。` },
        { match: _P.selfHasAttackInstead, replace: (m, proc, p, d) => `このキャラクターに${proc}がある場合、代わりに${p}%の貫通効果 + ${d}%の吸収で攻撃。` },
        { match: _P.selfNotHasApply, replace: (m, proc, pr) => `このキャラクターに${proc}がない場合、メインターゲットに${pr}を適用。` },
        { match: _P.modeGainCount, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ja')}、${pr}を${c}個獲得。` },
        { match: _P.modeSelfHasApply, replace: (m, mode, proc, pr) => `${_modeLoc(mode, 'ja')}、このキャラクターに${proc}がある場合、メインターゲットに${pr}を適用。` },
        { match: _P.onAssistEnergy, replace: (m, type, c) => `${_modeLoc(type, 'ja')}アシスト時、自身にアビリティエネルギー+${c}を生成。` },
        { match: _P.modeReduceSpeedPerAlly, replace: (m, mode, p, tr) => `${_modeLoc(mode, 'ja')}、${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方1体につきスピードバーを${p}%減少。` },
        { match: _P.healthHealAllies, replace: (m, p, h) => `このキャラクターの体力が${p}%未満の場合、味方を最大体力の${h}%分回復。` },
        { match: _P.modeIgnoresDefUp, replace: (m, mode) => `${_modeLoc(mode, 'ja')}、この攻撃はディフェンスアップを無視する。` },
        // --- Batch 3 patterns ---
        { match: _P.modeIfSelfHasCountDmg, replace: (m, mode, c, proc, d) => `${_modeLoc(mode, 'ja')}、このキャラクターに${c}+の${proc}がある場合、+${d}%のダメージ。` },
        { match: _P.clearPosTarget, replace: (m, c) => `メインターゲットからポジティブ効果を${c}個解除。` },
        { match: _P.applyAlliesNamed, replace: (m, pr) => `味方に${pr}を適用。` },
        { match: _P.clearNegAllies, replace: (m, c) => `味方からネガティブ効果を${c}個解除。` },
        { match: _P.applyMostInjured, replace: (m, pr) => `最も負傷した味方に${pr}を適用。` },
        { match: _P.clearNegMostInjured, replace: (m, c) => `最も負傷した味方からネガティブ効果を${c}個解除。` },
        { match: _P.modeApplyRandomTraitAlly, replace: (m, mode, c, pr, tr) => `${_modeLoc(mode, 'ja')}、ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に+${c}${pr}を適用。` },
        { match: _P.targetNotTraitDrain, replace: (m, tr, p) => `メインターゲットが${tr}でない場合、ターゲットの最大体力の${p}%を吸収。` },
        { match: _P.targetTraitDrain, replace: (m, tr, p) => `メインターゲットが${tr}の場合、ターゲットの最大体力の${p}%を吸収。` },
        { match: _P.notModeFlip, replace: (m, mode, c) => `${_notModeLoc(mode, 'ja')}、メインターゲットのポジティブ効果${c}個をネガティブ効果に反転。` },
        { match: _P.modeFlipAll, replace: (m, mode) => `${_modeLoc(mode, 'ja')}、メインターゲットのすべてのポジティブ効果をネガティブ効果に反転。` },
        { match: _P.targetNoPosApply, replace: (m, pr) => `メインターゲットにポジティブ効果がない場合、メインターゲットに${pr}を適用。` },
        { match: _P.targetHasApply, replace: (m, proc, pr) => `メインターゲットに${proc}がある場合、メインターゲットに${pr}を適用。` },
        { match: _P.applyUpToMaxRandomAlly, replace: (m, c, pr, max) => `ランダムな味方に+${c}${pr}を適用（最大${max}）。` },
        { match: _P.onAssistProlongPos, replace: (m, proc, c) => `アシスト時、味方のすべてのポジティブ効果（${proc}を除く）の期間を${c}延長。` },
        { match: _P.prolongPosExcluding, replace: (m, proc, c) => `味方のすべてのポジティブ効果（${proc}を除く）の期間を${c}延長。` },
        { match: _P.forcedDmgInstead, replace: (m, p) => `味方を攻撃させられた場合、代わりに${p}%のダメージで攻撃。` },
        { match: _P.otherwiseDrain, replace: (m, p) => `それ以外の場合、ターゲットの最大体力の${p}%を吸収。` },
        { match: _P.anyEnemyHasClearPos, replace: (m, c) => `敵にポジティブ効果がある場合、メインターゲットからポジティブ効果を${c}個解除。` },
        { match: _P.clearNegRandomAlly, replace: (m, c) => `ランダムな味方からネガティブ効果を${c}個解除。` },
        { match: _P.triggerBattlefield, replace: () => `戦場効果を発動。` },
        { match: _P.noteIgnoresDefUp, replace: () => `この攻撃はディフェンスアップを無視する。` },
        { match: _P.targetHasOrDmg, replace: (m, pr1, pr2, d) => `ターゲットに${pr1}または${pr2}がある場合、+${d}%のダメージ。` },
        { match: _P.flipAllPos, replace: () => `メインターゲットのすべてのポジティブ効果をネガティブ効果に反転。` },
        { match: _P.genEnergyAllAllies, replace: (m, c) => `すべての味方にアビリティエネルギー+${c}を生成。` },
        { match: _P.noteTargetHasOrCantBlock, replace: (m, pr1, pr2) => `ターゲットに${pr1}または${pr2}がある場合、この攻撃はブロック不可。` },
        { match: _P.selfHasDmgBoost, replace: (m, proc, d) => `このキャラクターに${proc}がある場合、+${d}%のダメージ。` },
        { match: _P.clearAllPosTarget, replace: () => `メインターゲットからすべてのポジティブ効果を解除。` },
        { match: _P.ifTraitAlliesApplyMax, replace: (m, c, tr, n, pr, max) => `${c}+の${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方がいる場合、味方に+${n}${pr}を適用（最大${max}）。` },
        { match: _P.applyMaxRandomTraitAlly, replace: (m, c, pr, max, tr) => `ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に+${c}${pr}を適用（最大${max}）。` },
        { match: _P.genEnergyTraitAllies, replace: (m, c, tr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方にアビリティエネルギー+${c}を生成。` },
        // --- Batch 4 patterns ---
        { match: _P.flipCountPos, replace: (m, c) => `メインターゲットのポジティブ効果${c}個をネガティブに反転。` },
        { match: _P.modeFlipCount, replace: (m, mode, c) => `${_modeLoc(mode, 'ja')}、メインターゲットのポジティブ効果${c}個をネガティブに反転。` },
        { match: _P.onCritReduceSpeed, replace: (m, p) => `クリティカル時、スピードバーを${p}%減少。` },
        { match: _P.onCritApply, replace: (m, c, pr) => `クリティカル時、メインターゲットに+${c}${pr}を適用。` },
        { match: _P.onAssistPiercing, replace: (m, p) => `アシスト時、+${p}%貫通ダメージ。` },
        { match: _P.onCounterChanceGain, replace: (m, pct, c, pr) => `カウンター時、${pct}%の確率で+${c}${pr}を獲得。` },
        { match: _P.stealPosExcluding, replace: (m, c, excl) => `メインターゲットからポジティブ効果を${c}個奪い味方に付与（${excl}を除く）。` },
        { match: _P.barrierAllies, replace: (m, p) => `味方に最大体力の${p}%のバリアを付与。` },
        { match: _P.barrierMostInjuredNonSummon, replace: (m, p) => `最も負傷した非召喚味方に最大体力の${p}%のバリアを付与。` },
        { match: _P.genEnergyRandomAlly, replace: (m, c) => `ランダムな味方にアビリティエネルギー+${c}を生成。` },
        { match: _P.selfHasReduceDur, replace: (m, proc, proc2, c) => `このキャラクターが${proc}を持っている場合、味方の${proc2}の持続時間を${c}減少。` },
        { match: _P.prolongNegExcluding, replace: (m, excl, c) => `${excl}を除く全てのネガティブ効果の持続時間を${c}延長。` },
        { match: _P.drainDmgDealt, replace: (m, p) => `与えたダメージの${p}%を体力として吸収。` },
        { match: _P.drainFlat, replace: (m, p) => `ターゲットの最大体力の${p}%を吸収。` },
        { match: _P.chanceApply, replace: (m, pct, pr) => `${pct}%の確率でメインターゲットに${pr}を適用。` },
        { match: _P.modeReduceSpeed, replace: (m, mode, p) => `${_modeLoc(mode, 'ja')}、スピードバーを${p}%減少。` },
        { match: _P.modeGain, replace: (m, mode, pr) => `${_modeLoc(mode, 'ja')}、${pr}を獲得。` },
        { match: _P.clearAllProcTarget, replace: (m, pr) => `メインターゲットの${pr}を全て除去。` },
        { match: _P.applyRandomAlly, replace: (m, pr) => `ランダムな味方に${pr}を適用。` },
        { match: _P.attackAdditional, replace: () => `追加の敵を攻撃。` },
        { match: _P.copyNegExcluding, replace: (m, c, excl) => `メインターゲットのネガティブ効果${c}個をコピー（${excl}を除く）。` },
        { match: _P.noteDebuffsNotResisted, replace: () => `この攻撃のデバフは抵抗不可。` },
        { match: _P.targetTraitReduceSpeed, replace: (m, tr, p) => `メインターゲットが${tr}の場合、スピードバーを${p}%減少。` },
        { match: _P.modeStatPerAlly, replace: (m, mode, p, stat, tr) => `${_modeLoc(mode, 'ja')}、${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方1人につき+${p}%${stat}。` },
        { match: _P.modeReviveAt, replace: (m, mode, name, p) => `${_modeLoc(mode, 'ja')}、${name}を体力${p}%で復活。` },
        // --- Batch 5 patterns ---
        { match: _P.modeTraitAllyStealAllExcl, replace: (m, mode, c, tr, ally, excl) => `${_modeLoc(mode, 'ja')}、${c}+の${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方がいて${ally}が味方なら、メインターゲットの全ポジティブ効果を奪い味方に付与（${excl}を除く）。` },
        { match: _P.modeTraitAllyStealProc, replace: (m, mode, c, tr, ally, proc) => `${_modeLoc(mode, 'ja')}、${c}+の${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方がいて${ally}が味方なら、メインターゲットの${proc}を奪い味方に付与。` },
        { match: _P.modeApplyPlus, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ja')}、メインターゲットに+${c}${pr}を適用。` },
        { match: _P.modeApplyProc, replace: (m, mode, pr) => `${_modeLoc(mode, 'ja')}、メインターゲットに${pr}を適用。` },
        { match: _P.modeApplyAllies, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ja')}、味方に+${c}${pr}を適用。` },
        { match: _P.modeClearCountTarget, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ja')}、メインターゲットの${pr}を${c}個除去。` },
        { match: _P.otherwiseApplyPlus, replace: (m, c, pr) => `それ以外は、メインターゲットに+${c}${pr}を適用。` },
        { match: _P.otherwiseApplyProc, replace: (m, pr) => `それ以外は、メインターゲットに${pr}を適用。` },
        { match: _P.otherwiseModeClearAllPos, replace: (m, mode) => `それ以外は、${_modeLoc(mode, 'ja')}、メインターゲットの全ポジティブ効果を除去。` },
        { match: _P.clearFromSelf, replace: (m, pr) => `自身の${pr}を全て除去。` },
        { match: _P.clearCountProcTarget, replace: (m, c, pr) => `メインターゲットの${pr}を${c}個除去。` },
        { match: _P.selfNotHasClearNeg, replace: (m, proc) => `このキャラクターが${proc}を持っていなければ、味方の全ネガティブ効果を除去。` },
        { match: _P.selfNotHasApplyMaxAllies, replace: (m, proc, c, pr, max) => `このキャラクターが${proc}を持っていなければ、味方に+${c}${pr}を適用（最大${max}）。` },
        { match: _P.targetHasReduceSpeed, replace: (m, proc, p) => `メインターゲットが${proc}を持っていれば、スピードバーを${p}%減少。` },
        { match: _P.targetHasApplyAllies, replace: (m, proc, c, pr, max) => `メインターゲットが${proc}を持っていれば、味方に+${c}${pr}を適用（最大${max}）。` },
        { match: _P.targetTraitGainMax, replace: (m, tr, c, pr, max) => `メインターゲットが${tr}の場合、+${c}${pr}を獲得（最大${max}）。` },
        { match: _P.modeOnCritApply, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ja')}、クリティカル時、メインターゲットに+${c}${pr}を適用。` },
        { match: _P.notModeOnCritReduceSpeed, replace: (m, mode, p) => `${_notModeLoc(mode, 'ja')}、クリティカル時、スピードバーを${p}%減少。` },
        { match: _P.modeCallAssist, replace: (m, mode, tr) => `${_modeLoc(mode, 'ja')}、ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方をアシストに呼ぶ。` },
        { match: _P.modeNoteCantDodge, replace: (m, mode) => `${_modeLoc(mode, 'ja')}、この攻撃は身かわし不可。` },
        { match: _P.modeTargetHasReduceDur, replace: (m, mode, proc, proc2, c) => `${_modeLoc(mode, 'ja')}、メインターゲットが${proc}を持っていれば、${proc2}の持続時間を${c}減少。` },
        { match: _P.modeProlongNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'ja')}、ネガティブ効果の持続時間を${c}延長。` },
        { match: _P.notModeProlongNegExcl, replace: (m, mode, excl, c) => `${_notModeLoc(mode, 'ja')}、${excl}を除く全てのネガティブ効果の持続時間を${c}延長。` },
        { match: _P.stealAllExcluding, replace: (m, excl) => `メインターゲットの全ポジティブ効果を奪う（${excl}を除く）。` },
        { match: _P.stealAllGiveExcluding, replace: (m, excl) => `メインターゲットの全ポジティブ効果を奪い味方に付与（${excl}を除く）。` },
        { match: _P.transferAllPos, replace: () => `自身の全ポジティブ効果をネガティブ効果として転送。` },
        { match: _P.applyMostInjuredTrait, replace: (m, c, pr, tr) => `最も負傷した${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に${c}${pr}を適用。` },
        { match: _P.onAssistApplyMaxAllies, replace: (m, c, pr, max) => `アシスト時、味方に+${c}${pr}を適用（最大${max}）。` },
        { match: _P.selfHasMoreModeProlongNeg, replace: (m, n, proc, mode, c) => `このキャラクターが${n}を超える${proc}を持っている場合、${_modeLoc(mode, 'ja')}、ネガティブ効果の持続時間を${c}延長。` },
        { match: _P.selfHasMoreNotModeProlongNegExcl, replace: (m, n, proc, mode, excl, c) => `このキャラクターが${n}を超える${proc}を持っている場合、${_notModeLoc(mode, 'ja')}、${excl}を除く全てのネガティブ効果の持続時間を${c}延長。` },
        { match: _P.barrierMostInjured, replace: (m, p) => `最も負傷した味方に最大体力の${p}%のバリアを付与。` },
        { match: _P.onAssistDmg, replace: (m, p) => `アシスト時、+${p}%ダメージ。` },
        // --- Batch 6 patterns ---
        { match: _P.onTriggerGainPlus, replace: (m, trig, c, pr) => `${trig === 'Counter' ? 'カウンター' : 'クリティカル'}時、+${c}${pr}を獲得。` },
        { match: _P.flipNegToPosAllies, replace: (m, c) => `味方のネガティブ効果を${c}個ポジティブに変換。` },
        { match: _P.stealProcGiveAllies, replace: (m, pr) => `メインターゲットから${pr}を奪い味方に付与。` },
        { match: _P.selfHasCritBoost, replace: (m, pr, p) => `このキャラクターが${pr}を持っている場合、+${p}%クリティカル率。` },
        { match: _P.traitAllyExistsDmg, replace: (m, tr, p) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方が存在する場合、+${p}%ダメージ。` },
        { match: _P.applyProcMostInjuredTrait, replace: (m, pr, tr) => `最も負傷した${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に${pr}を適用。` },
        // --- Batch 7 patterns ---
        { match: _P.applyProcRandomTraitAlly, replace: (m, pr, tr) => `ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に${pr}を適用。` },
        { match: _P.modeStatBoost, replace: (m, mode, p, stat) => `${_modeLoc(mode, 'ja')}、+${p}%${stat}。` },
        { match: _P.ifAllyNoteAttackCant, replace: (m, name, what) => `${name}が味方にいる場合、この攻撃は${what === 'dodged' ? '回避' : what === 'blocked' ? 'ブロック' : what === 'missed' ? '外れ' : what}されない。` },
        { match: _P.statPerTraitAlly, replace: (m, p, stat, tr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方ごとに+${p}%${stat}。` },
        { match: _P.genEnergyForNamed, replace: (m, c, name) => `${name}に+${c}アビリティエネルギーを生成。` },
        { match: _P.healRandomTraitAlly, replace: (m, tr, p) => `ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方を最大体力の${p}%回復。` },
        { match: _P.targetHasStatBoost, replace: (m, proc, p, stat) => `ターゲットが${proc}を持っていれば、+${p}%${stat}。` },
        { match: _P.flipNegToPosRandomTraitAlly, replace: (m, c, tr) => `ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方のネガティブ効果を${c}個ポジティブに変換。` },
        { match: _P.drainRedistribute, replace: (m, p, target) => `ターゲットの最大体力の${p}%を吸収し、${_traitLoc(target, SENTENCE_TEMPLATES._activeDict)}の味方に再分配。` },
        { match: _P.selfNotHasApplyAllies, replace: (m, proc, pr) => `このキャラクターが${proc}を持っていなければ、味方に${pr}を適用。` },
        { match: _P.selfIsTraitDmg, replace: (m, tr, p) => `このキャラクターが${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}であれば、+${p}%ダメージ。` },
        { match: _P.healAllies, replace: (m, p) => `味方を最大体力の${p}%回復。` },
        { match: _P.stealCountExcluding, replace: (m, c, excl) => `メインターゲットから${c}個のポジティブ効果を奪う（${excl}を除く）。` },
        { match: _P.onCritApplyMaxAllies, replace: (m, c, pr, max) => `クリティカル時、味方に+${c}${pr}を適用（最大${max}）。` },
        { match: _P.modeGenEnergyTraitAllies, replace: (m, mode, c, tr) => `${_modeLoc(mode, 'ja')}、${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に+${c}アビリティエネルギーを生成。` },
        // --- Batch 8 ---
        { match: _P.ifTraitAlliesApplyProc, replace: (m, n, tr, pr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方が${n}人以上いれば、メインターゲットに${pr}を適用。` },
        { match: _P.ifTraitAlliesGain, replace: (m, n, tr, pr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方が${n}人以上いれば、${pr}を獲得。` },
        { match: _P.ifTraitAlliesDmg, replace: (m, n, tr, p) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方が${n}人以上いれば、+${p}%ダメージ。` },
        { match: _P.ifTraitAlliesFlip, replace: (m, n, tr, c) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方が${n}人以上いれば、メインターゲットの${c}個のポジティブ効果をネガティブに変換。` },
        { match: _P.dmgPerEffectOnTarget, replace: (m, p, type) => `メインターゲットの${type === 'positive' ? 'ポジティブ' : 'ネガティブ'}効果1つにつき+${p}%ダメージ。` },
        { match: _P.reduceSpeedPerTraitAlly, replace: (m, p, tr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方1人につきスピードバーを${p}%減少。` },
        { match: _P.targetHasGainSpeedBar, replace: (m, pr, p) => `メインターゲットが${pr}を持っていれば、${p}%のスピードバーを獲得。` },
        { match: _P.targetHasGenEnergy, replace: (m, pr, c) => `メインターゲットが${pr}を持っていれば、全味方に+${c}アビリティエネルギーを生成。` },
        { match: _P.targetHasFlipPos, replace: (m, pr, c) => `メインターゲットが${pr}を持っていれば、メインターゲットの${c}個のポジティブ効果をネガティブに変換。` },
        { match: _P.targetNotHasApply, replace: (m, pr1, pr2) => `メインターゲットが${pr1}を持っていなければ、メインターゲットに${pr2}を適用。` },
        { match: _P.otherwiseFlipPos, replace: (m, c) => `それ以外の場合、メインターゲットの${c}個のポジティブ効果をネガティブに変換。` },
        { match: _P.modeNoteAttackCant, replace: (m, mode, what) => `${_modeLoc(mode, 'ja')}、この攻撃は${what === 'countered' ? 'カウンター' : what === 'blocked' ? 'ブロック' : what === 'dodged' ? '回避' : what}不可。` },
        // --- Batch 9 patterns ---
        { match: _P.barrierSelf, replace: (m, p) => `最大体力の${p}%のバリアを獲得。` },
        { match: _P.prolongProcBy, replace: (m, pr, c) => `${pr}の持続時間を${c}延長。` },
        { match: _P.notModeChanceApply, replace: (m, mode, ch, pr) => `${_notModeLoc(mode, 'ja')}、${ch}%の確率でメインターゲットに${pr}を適用。` },
        { match: _P.modeChanceGain, replace: (m, mode, ch, pr) => `${_modeLoc(mode, 'ja')}、${ch}%の確率で${pr}を獲得。` },
        { match: _P.clearCountProcAllies, replace: (m, c, pr) => `味方から${c}個の${pr}を除去。` },
        { match: _P.applyProcToEnemies, replace: (m, pr, c) => `${c}体の敵に${pr}を適用。` },
        { match: _P.applyCountToEnemies, replace: (m, n, pr, c) => `${c}体の敵に${n}個の${pr}を適用。` },
        { match: _P.applyProcDurToEnemies, replace: (m, pr, t, c) => `${c}体の敵に${pr}を${t}ターン適用。` },
        { match: _P.clearNegRandomTraitAlly, replace: (m, c, tr) => `ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方からネガティブ効果を${c}個除去。` },
        { match: _P.clearNegMostInjuredTraitAlly, replace: (m, c, tr) => `最も負傷した${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方からネガティブ効果を${c}個除去。` },
        { match: _P.onCritStealAllExcl, replace: (m, pr) => `クリティカル時、メインターゲットから${pr}を除く全ポジティブ効果を奪取。` },
        { match: _P.onAssistApplyMaxTarget, replace: (m, c, pr, max) => `アシスト時、メインターゲットに+${c} ${pr}を適用（最大${max}）。` },
        { match: _P.copyPosGiveExcl, replace: (m, c, pr) => `メインターゲットからポジティブ効果を${c}個コピーし、${pr}を除き味方に付与。` },
        { match: _P.targetTraitGainProc, replace: (m, tr, pr) => `メインターゲットが${tr}の場合、${pr}を獲得。` },
        { match: _P.flipPosNEnemies, replace: (m, c, n) => `${n}体の敵のポジティブ効果${c}個をネガティブに変換。` },
        { match: _P.barrierRandomTraitAlly, replace: (m, p, tr) => `ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に最大体力の${p}%のバリアを付与。` },
        // --- Batch 10 ---
        { match: _P.piercingAdditional, replace: (m, p) => `追加の敵に+${p}%の貫通効果。` },
        { match: _P.dmgPierceAdditional, replace: (m, d, p) => `追加の敵に+${d}%のダメージ + ${p}%の貫通効果。` },
        { match: _P.modeApplyPlusRandomAlly, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ja')}、ランダムな味方に+${c} ${pr}を適用。` },
        { match: _P.drainAlliesHealth, replace: (m, p) => `味方の最大体力の${p}%を吸収。` },
        { match: _P.ifAllyNoteCantMiss, replace: (m, ally) => `${ally}が味方の場合、この攻撃は外れない。` },
        { match: _P.targetHasAttackPierceInstead, replace: (m, proc, p) => `メインターゲットが${proc}を持っている場合、代わりに${p}%の貫通で攻撃。` },
        { match: _P.targetHasDrainRedistribute, replace: (m, proc, p, target) => `メインターゲットが${proc}を持っている場合、ターゲットの最大体力の${p}%を吸収し${target}に再分配。` },
        { match: _P.modeOnCritClearNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'ja')}、クリティカル時、味方からネガティブ効果を${c}個除去。` },
        { match: _P.ifAllyStealAllGiveExcl, replace: (m, ally, pr) => `${ally}が味方の場合、メインターゲットから${pr}を除く全ポジティブ効果を奪い味方に付与。` },
        { match: _P.applyProcToAllyHighest, replace: (m, pr, tr, stat) => `最も${stat}が高い${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に${pr}を適用。` },
        { match: _P.applyProcRandomAllyBelowHealth, replace: (m, pr, p) => `体力${p}%以下のランダムな味方に${pr}を適用。` },
        { match: _P.allAlliesHaveGainSpeedBar, replace: (m, proc, p) => `全味方が${proc}を持っている場合、${p}%のスピードバーを獲得。` },
        { match: _P.targetHasStealCountExcl, replace: (m, proc, c, pr) => `メインターゲットが${proc}を持っている場合、${pr}を除くポジティブ効果を${c}個奪取。` },
        { match: _P.selfHasLessThanApplyMaxAllies, replace: (m, n, proc, c, pr, max) => `${proc}が${n}未満の場合、味方に+${c} ${pr}を適用（最大${max}）。` },
        { match: _P.targetTraitApplyProcAllyHighest, replace: (m, tr, pr, stat) => `メインターゲットが${tr}の場合、最も${stat}が高い味方に${pr}を適用。` },
        { match: _P.modeIfTraitAlliesStealProc, replace: (m, mode, c, tr, proc) => `${_modeLoc(mode, 'ja')}、${c}+の${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方がいれば、メインターゲットの${proc}を奪い味方に付与。` },
        // --- Batch 11 ---
        { match: _P.targetHasPosClearPos, replace: (m, c) => `メインターゲットがポジティブ効果を持っている場合、ポジティブ効果を${c}個除去。` },
        { match: _P.modeSubTargetHasDrain, replace: (m, mode, sub, proc, p) => `${_modeLoc(mode, 'ja')}、${sub}、メインターゲットが${proc}を持っている場合、ターゲットの最大体力の${p}%を吸収。` },
        { match: _P.modeSubReduceDur, replace: (m, mode, sub, proc, c) => `${_modeLoc(mode, 'ja')}、${sub}、${proc}の持続時間を${c}短縮。` },
        { match: _P.modeApplyPlusRandomAllyExclSelf, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ja')}、ランダムな味方（自身を除く）に+${c} ${pr}を適用。` },
        { match: _P.modeOrSubClearNegRandomTraitAlly, replace: (m, m1, m2, sub, c, tr) => `${_modeLoc(m1, 'ja')}または${_modeLoc(m2, 'ja')}、${sub}、ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方からネガティブ効果を${c}個除去。` },
        { match: _P.selfHasClearPos, replace: (m, proc, c) => `${proc}を持っている場合、メインターゲットのポジティブ効果を${c}個除去。` },
        { match: _P.selfNotHasFlipPos, replace: (m, proc, c) => `${proc}を持っていない場合、メインターゲットのポジティブ効果${c}個をネガティブに変換。` },
        { match: _P.selfHasClearNegSelf, replace: (m, proc) => `${proc}を持っている場合、自身の全ネガティブ効果を除去。` },
        { match: _P.selfHasClearCountFromSelf, replace: (m, proc, c, pr) => `${proc}を持っている場合、自身から${pr}を${c}個除去。` },
        { match: _P.targetHasClearAllProc, replace: (m, proc, pr) => `メインターゲットが${proc}を持っている場合、全${pr}を除去。` },
        { match: _P.onAssistTargetHasClearAllProc, replace: (m, proc, pr) => `アシスト時、メインターゲットが${proc}を持っている場合、全${pr}を除去。` },
        { match: _P.targetTraitApplyCountDur, replace: (m, tr, c, pr, t) => `メインターゲットが${tr}の場合、メインターゲットに${c}個の${pr}を${t}ターン適用。` },
        { match: _P.targetTraitApplyCount, replace: (m, tr, c, pr) => `メインターゲットが${tr}の場合、メインターゲットに${c}個の${pr}を適用。` },
        { match: _P.onCritBarrierAllies, replace: (m, p) => `クリティカル時、味方に最大体力の${p}%のバリアを付与。` },
        { match: _P.ifTraitAlliesCritChance, replace: (m, c, tr, p) => `${c}+の${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方がいる場合、+${p}%のクリティカル率。` },
        { match: _P.ifTraitAlliesCritPerAlly, replace: (m, c, tr, p, tr2) => `${c}+の${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方がいる場合、${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)}の味方1人ごとに+${p}%のクリティカル率。` },
        // --- Batch 12 ---
        { match: _P.onCritGenEnergyRandomAlly, replace: (m, c) => `クリティカル時、ランダムな味方に+${c}アビリティエネルギーを生成。` },
        { match: _P.onCounterOnCritGenEnergy, replace: (m, c) => `カウンター時、クリティカル時、ランダムな味方に+${c}アビリティエネルギーを生成。` },
        { match: _P.removeBarrierTarget, replace: () => `メインターゲットのバリアを除去。` },
        { match: _P.modeSubFlipNegToPosAllies, replace: (m, mode, sub) => `${_modeLoc(mode, 'ja')}、${sub}、味方の全ネガティブ効果をポジティブに変換。` },
        { match: _P.modeSubTargetNotTraitDrain, replace: (m, mode, sub, tr, p) => `${_modeLoc(mode, 'ja')}、${sub}、メインターゲットが${tr}でない場合、ターゲットの最大体力の${p}%を吸収。` },
        { match: _P.targetNotHasClearPos, replace: (m, proc, c) => `メインターゲットが${proc}を持っていない場合、ポジティブ効果を${c}個除去。` },
        { match: _P.selfHasGainSpeedBar, replace: (m, proc, p) => `${proc}を持っている場合、${p}%のスピードバーを獲得。` },
        { match: _P.selfHasGainCount, replace: (m, proc, c, pr) => `${proc}を持っている場合、${c}個の${pr}を獲得。` },
        { match: _P.healTarget, replace: (m, p) => `メインターゲットの最大体力の${p}%を回復。` },
        { match: _P.ifAllyApplyCount, replace: (m, ally, c, pr) => `${ally}が味方の場合、メインターゲットに${c}個の${pr}を適用。` },
        { match: _P.notModeChanceGain, replace: (m, mode, p, pr) => `${_notModeLoc(mode, 'ja')}、${p}%の確率で${pr}を獲得。` },
        { match: _P.ifAllyDmgPierce, replace: (m, ally, d, p) => `${ally}が味方の場合、+${d}%のダメージ + ${p}%の貫通効果。` },
        { match: _P.ifAllyApplyDur, replace: (m, ally, pr, t) => `${ally}が味方の場合、メインターゲットに${pr}を${t}ターン適用。` },
        { match: _P.selfIsTraitApplyProc, replace: (m, tr, pr) => `自身が${tr}の場合、メインターゲットに${pr}を適用。` },
        { match: _P.selfNotTraitApplyProc, replace: (m, tr, pr) => `自身が${tr}でない場合、メインターゲットに${pr}を適用。` },
        { match: _P.targetTraitApplyProc, replace: (m, tr, pr) => `メインターゲットが${tr}の場合、メインターゲットに${pr}を適用。` },
        // --- Batch 13 ---
        { match: _P.targetTraitOrApplyCountDurInjured, replace: (m, tr1, tr2, c, pr, t) => `メインターゲットが${tr1}または${tr2}の場合、最も負傷した味方に${c}個の${pr}を${t}ターン適用。` },
        { match: _P.onAssistModeOnCritApply, replace: (m, mode, pr) => `アシスト時、${_modeLoc(mode, 'ja')}、クリティカル時、メインターゲットに${pr}を適用。` },
        { match: _P.otherwiseSelfOrTargetHasCrit, replace: (m, tr, proc, p) => `それ以外で、自身が${tr}またはターゲットが${proc}を持っている場合、+${p}%のクリティカル率。` },
        { match: _P.healthOrChargedDmg, replace: (m, hp, proc, d) => `体力が${hp}%以下または${proc}を持っている場合、+${d}%のダメージ。` },
        { match: _P.applyDurTraitAllyLowest, replace: (m, pr, t, tr, stat) => `最も${stat}が低い${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に${pr}を${t}ターン適用。` },
        { match: _P.otherwiseTargetHasApplyAllies, replace: (m, proc, c, pr) => `それ以外で、メインターゲットが${proc}を持っている場合、味方に+${c} ${pr}を適用。` },
        { match: _P.modeIfTraitAlliesCallHighest, replace: (m, mode, c, tr, tr2, stat) => `${_modeLoc(mode, 'ja')}、${c}+の${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方がいれば、最も${stat}が高い${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)}の味方をアシストに呼ぶ。` },
        { match: _P.modeOnAssistTypeGenTraitAlly, replace: (m, mode, type, c, tr) => `${_modeLoc(mode, 'ja')}、${type}アシスト時、ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方に+${c}アビリティエネルギーを生成。` },
        { match: _P.selfHasProcCritPerTraitOrAlly, replace: (m, proc, p, tr1, tr2) => `${proc}を持っている場合、${tr1}または${tr2}の味方1人ごとに+${p}%のクリティカル率。` },
        { match: _P.modeHealthReduceDurRandomTraitAlly, replace: (m, mode, hp, c, tr) => `${_modeLoc(mode, 'ja')}、体力が${hp}%を超えている場合、ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の味方のネガティブ効果の持続時間を${c}短縮。` },
        { match: _P.targetHasAndHasRemoveBarrier, replace: (m, p1, p2) => `メインターゲットが${p1}と${p2}を持っている場合、バリアを除去。` },
        { match: _P.selfHasCountAnyEnemyFlip, replace: (m, c, proc, n) => `${proc}を${c}+持っていて敵がポジティブ効果を持っている場合、メインターゲットのポジティブ効果${n}個をネガティブに変換。` },
        { match: _P.selfLessCountAnyEnemyFlip, replace: (m, c, proc, n) => `${proc}が${c}未満で敵がポジティブ効果を持っている場合、メインターゲットのポジティブ効果${n}個をネガティブに変換。` },
        { match: _P.modeOnCritProlongNegExcl, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'ja')}、クリティカル時、${pr}を除く全ネガティブ効果の持続時間を${c}延長。` },
        { match: _P.modeOnCritProlongProc, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'ja')}、クリティカル時、${pr}の持続時間を${c}延長。` },
        { match: _P.modeBarrierRandomAlly, replace: (m, mode, p) => `${_modeLoc(mode, 'ja')}、ランダムな味方に最大体力の${p}%のバリアを付与。` },
        // --- Batch 14 ---
        { match: _P.modeEnergyFullOnCritGenRandomAlly, replace: (m, mode, c) => `${_modeLoc(mode, 'ja')}、アビリティエネルギーが満タンの場合、クリティカル時、ランダムな味方に+${c}アビリティエネルギーを生成。` },
        { match: _P.modeEnergyFullOnCritGenSelf, replace: (m, mode, c) => `${_modeLoc(mode, 'ja')}、アビリティエネルギーが満タンの場合、クリティカル時、自分に+${c}アビリティエネルギーを生成。` },
        { match: _P.healthLessThanDrain, replace: (m, hp, d) => `このキャラクターの体力が${hp}%未満の場合、+${d}%ドレイン。` },
        { match: _P.healthOrMoreApplyDurTarget, replace: (m, hp, pr, t) => `このキャラクターの体力が${hp}%以上の場合、メインターゲットに${pr}を${t}ターン付与。` },
        { match: _P.barrierOrMoreApplyDurAllies, replace: (m, bp, pr, t) => `このキャラクターのバリアが${bp}%以上の場合、味方に${pr}を${t}ターン付与。` },
        { match: _P.barrierOrMoreGainDur, replace: (m, bp, pr, t) => `このキャラクターのバリアが${bp}%以上の場合、${pr}を${t}ターン獲得。` },
        { match: _P.onTypeAssistGenAllAllies, replace: (m, type, c) => `${type}アシスト時、全味方に+${c}アビリティエネルギーを生成。` },
        { match: _P.onTypeAssistGenChar, replace: (m, type, c, ch) => `${type}アシスト時、${ch}に+${c}アビリティエネルギーを生成。` },
        { match: _P.ifNotFacingApplyTarget, replace: (m, ch, pr) => `${ch}と対戦していない場合、メインターゲットに${pr}を付与。` },
        { match: _P.targetTraitApplyInjuredAlly, replace: (m, tr, pr) => `メインターゲットが${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の場合、最もダメージを受けた味方に${pr}を付与。` },
        { match: _P.copyAllGiveAlliesExclTwo, replace: (m, pr1, pr2) => `メインターゲットから全てのバフをコピーし味方に付与、${pr1}と${pr2}を除く。` },
        { match: _P.noteCantCritHit, replace: () => `この攻撃はクリティカルヒットできない。` },
        { match: _P.modeApplyAllies, replace: (m, mode, pr) => `${_modeLoc(mode, 'ja')}、味方に${pr}を付与。` },
        { match: _P.targetTraitApplyCountMaxInjured, replace: (m, tr, c, pr, mx) => `メインターゲットが${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の場合、最もダメージを受けた味方に+${c} ${pr}を付与（最大${mx}）。` },
        { match: _P.modeGenEnergyChar, replace: (m, mode, c, ch) => `${_modeLoc(mode, 'ja')}、${ch}に+${c}アビリティエネルギーを生成。` },
        { match: _P.targetTraitApplyInjuredWithout, replace: (m, tr, pr, pr2) => `メインターゲットが${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}の場合、${pr2}を持たない最もダメージを受けた味方に${pr}を付与。` },
        { match: _P.modeHealRandomTraitAlly, replace: (m, mode, tr, hp) => `${_modeLoc(mode, 'ja')}、ランダムな${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}味方の体力を最大体力の${hp}%回復。` },
        { match: _P.selfHasOrLessApplyMaxAllies, replace: (m, c, pr, c2, pr2, mx) => `自分の${pr}が${c}以下の場合、味方に+${c2} ${pr2}を付与（最大${mx}）。` },
        { match: _P.selfHasProcChanceApplyTarget, replace: (m, pr, pct, pr2) => `自分が${pr}を持つ場合、${pct}%の確率でメインターゲットに${pr2}を付与。` },
        { match: _P.otherwiseSelfHasChanceGain, replace: (m, pr, pct, pr2) => `それ以外の場合、自分が${pr}を持つなら、${pct}%の確率で${pr2}を獲得。` },
        { match: _P.otherwiseSelfHasHealInjured, replace: (m, pr, hp) => `それ以外の場合、自分が${pr}を持つなら、最もダメージを受けた味方の体力を最大体力の${hp}%回復。` },
      ],
    },
    // ==================== KOREAN ====================
    ko: {
      damageLine: (dmg, pierce, drain) => {
        const p = [];
        if (dmg > 0) p.push(`<span class="msf-iso8-damage-value">${dmg}%</span> 대미지`);
        if (pierce > 0) p.push(`<span class="msf-iso8-piercing-value">${pierce}%</span> 관통 대미지`);
        if (drain > 0) p.push(`<span class="msf-iso8-drain-value">${drain}%</span> 흡수`);
        return p.length > 0 ? `⚔️ 주 공격 대상에게 ${p.join(' + ')}를 줍니다` : null;
      },
      title: 'ISO-8 반격/지원',
      patterns: [
        { match: _P.forcedDmgPierce, replace: (m, d, p, tr) => `아군을 공격하도록 조종당한 경우, 이 캐릭터는 ${localizeText(tr, SENTENCE_TEMPLATES._activeDict)} 특성 캐릭터에게 ${d}% 대미지 + ${p}% 관통 대미지를 줍니다.` },
        { match: _P.forcedDmg, replace: (m, d, tr) => `아군을 공격하도록 조종당한 경우, 이 캐릭터는 ${localizeText(tr, SENTENCE_TEMPLATES._activeDict)} 특성 캐릭터에게 ${d}% 대미지를 줍니다.` },
        { match: _P.flipEffects, replace: (m, n, c) => `${n}(이)가 아군이면 주 공격 대상에게 적용된 무작위 버프 ${c}개를 디버프로 바꿉니다.` },
        { match: _P.flipRandom, replace: (m, n, c) => `${n}(이)가 아군이면 주 공격 대상에게 적용된 무작위 버프 ${c}개를 디버프로 바꿉니다.` },
        { match: _P.applyProc, replace: (m, pr) => `주 공격 대상에게 ${pr}을 적용합니다.` },
        { match: _P.applyCount, replace: (m, c, pr) => `주 공격 대상에게 ${pr}을 ${c}회 적용합니다.` },
        { match: _P.applyPlusDur, replace: (m, c, pr, t) => `주 공격 대상에게 +${c} ${pr}을 ${t}턴간 적용합니다.` },
        { match: _P.applyPlus, replace: (m, c, pr) => `주 공격 대상에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.applyAllies, replace: (m, c, pr) => `아군에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.gainPlus, replace: (m, c, pr) => `+${c} ${pr}을 획득합니다.` },
        { match: _P.gainSpeedBar, replace: (m, p) => `속도 게이지를 ${p}% 획득합니다.` },
        { match: _P.reduceSpeedBar, replace: (m, p) => `속도 게이지를 ${p}% 감소시킵니다.` },
        { match: _P.gain, replace: (m, pr) => `${pr}을 획득합니다.` },
        { match: _P.healthGain, replace: (m, p, pr) => `이 캐릭터의 체력이 ${p}% 이하이면 ${pr}을 획득합니다.` },
        { match: _P.healthGeneric, replace: (m, p, r) => `이 캐릭터의 체력이 ${p}% 이하이면 ${r}` },
        // --- New patterns ---
        { match: _P.forcedPierceOnly, replace: (m, p, tr) => `아군을 공격하도록 조종당한 경우, ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 특성 캐릭터에게 ${p}% 관통 대미지를 줍니다.` },
        { match: _P.ifAllyApplyRandom, replace: (m, n, pr) => `${n}(이)가 아군이면 무작위 아군 1명에게 ${pr}을 적용합니다.` },
        { match: _P.selfHasApplyCountDur, replace: (m, proc, c, pr, t) => `이 캐릭터에게 ${proc}(이)가 있으면 주 공격 대상에게 ${pr}을 ${c}회 ${t}턴간 적용합니다.` },
        { match: _P.selfHasApply, replace: (m, proc, pr) => `이 캐릭터에게 ${proc}(이)가 있으면 주 공격 대상에게 ${pr}을 적용합니다.` },
        { match: _P.selfHasClear, replace: (m, proc, c, pr) => `이 캐릭터에게 ${proc}(이)가 있으면 아군에게서 ${pr}을 ${c}개 제거합니다.` },
        { match: _P.selfHasAttackInstead, replace: (m, proc, p, d) => `이 캐릭터에게 ${proc}(이)가 있으면 대신 ${p}% 관통 + ${d}% 흡수로 공격합니다.` },
        { match: _P.selfNotHasApply, replace: (m, proc, pr) => `이 캐릭터에게 ${proc}(이)가 없으면 주 공격 대상에게 ${pr}을 적용합니다.` },
        { match: _P.modeGainCount, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ko')}, ${pr}을 ${c}회 획득합니다.` },
        { match: _P.modeSelfHasApply, replace: (m, mode, proc, pr) => `${_modeLoc(mode, 'ko')}, 이 캐릭터에게 ${proc}(이)가 있으면 주 공격 대상에게 ${pr}을 적용합니다.` },
        { match: _P.onAssistEnergy, replace: (m, type, c) => `${_modeLoc(type, 'ko')} 지원 시, 자신에게 능력 에너지 +${c}를 생성합니다.` },
        { match: _P.modeReduceSpeedPerAlly, replace: (m, mode, p, tr) => `${_modeLoc(mode, 'ko')}, ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군 1명당 속도 게이지를 ${p}% 감소시킵니다.` },
        { match: _P.healthHealAllies, replace: (m, p, h) => `이 캐릭터의 체력이 ${p}% 미만이면 아군을 최대 체력의 ${h}%만큼 회복합니다.` },
        { match: _P.modeIgnoresDefUp, replace: (m, mode) => `${_modeLoc(mode, 'ko')}, 이 공격은 방어력 증가를 무시합니다.` },
        // --- Batch 3 patterns ---
        { match: _P.modeIfSelfHasCountDmg, replace: (m, mode, c, proc, d) => `${_modeLoc(mode, 'ko')}, 이 캐릭터에게 ${proc}(이)가 ${c}+개 있으면 +${d}% 대미지.` },
        { match: _P.clearPosTarget, replace: (m, c) => `주 공격 대상에게서 버프 ${c}개를 제거합니다.` },
        { match: _P.applyAlliesNamed, replace: (m, pr) => `아군에게 ${pr}을 적용합니다.` },
        { match: _P.clearNegAllies, replace: (m, c) => `아군에게서 디버프 ${c}개를 제거합니다.` },
        { match: _P.applyMostInjured, replace: (m, pr) => `가장 부상이 심한 아군에게 ${pr}을 적용합니다.` },
        { match: _P.clearNegMostInjured, replace: (m, c) => `가장 부상이 심한 아군에게서 디버프 ${c}개를 제거합니다.` },
        { match: _P.modeApplyRandomTraitAlly, replace: (m, mode, c, pr, tr) => `${_modeLoc(mode, 'ko')}, 무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.targetNotTraitDrain, replace: (m, tr, p) => `주 공격 대상이 ${tr}(이)가 아니면 대상 최대 체력의 ${p}%를 흡수합니다.` },
        { match: _P.targetTraitDrain, replace: (m, tr, p) => `주 공격 대상이 ${tr}이면 대상 최대 체력의 ${p}%를 흡수합니다.` },
        { match: _P.notModeFlip, replace: (m, mode, c) => `${_notModeLoc(mode, 'ko')}, 주 공격 대상의 버프 ${c}개를 디버프로 바꿉니다.` },
        { match: _P.modeFlipAll, replace: (m, mode) => `${_modeLoc(mode, 'ko')}, 주 공격 대상의 모든 버프를 디버프로 바꿉니다.` },
        { match: _P.targetNoPosApply, replace: (m, pr) => `주 공격 대상에게 버프가 없으면 주 공격 대상에게 ${pr}을 적용합니다.` },
        { match: _P.targetHasApply, replace: (m, proc, pr) => `주 공격 대상에게 ${proc}(이)가 있으면 주 공격 대상에게 ${pr}을 적용합니다.` },
        { match: _P.applyUpToMaxRandomAlly, replace: (m, c, pr, max) => `무작위 아군에게 +${c} ${pr}을 적용합니다 (최대 ${max}).` },
        { match: _P.onAssistProlongPos, replace: (m, proc, c) => `지원 시, 아군의 모든 버프(${proc} 제외)의 지속 시간을 ${c}만큼 연장합니다.` },
        { match: _P.prolongPosExcluding, replace: (m, proc, c) => `아군의 모든 버프(${proc} 제외)의 지속 시간을 ${c}만큼 연장합니다.` },
        { match: _P.forcedDmgInstead, replace: (m, p) => `아군을 공격하도록 조종당한 경우, 대신 ${p}% 대미지로 공격합니다.` },
        { match: _P.otherwiseDrain, replace: (m, p) => `그렇지 않으면 대상 최대 체력의 ${p}%를 흡수합니다.` },
        { match: _P.anyEnemyHasClearPos, replace: (m, c) => `적에게 버프가 있으면 주 공격 대상에게서 버프 ${c}개를 제거합니다.` },
        { match: _P.clearNegRandomAlly, replace: (m, c) => `무작위 아군에게서 디버프 ${c}개를 제거합니다.` },
        { match: _P.triggerBattlefield, replace: () => `전장 효과를 발동합니다.` },
        { match: _P.noteIgnoresDefUp, replace: () => `이 공격은 방어력 증가를 무시합니다.` },
        { match: _P.targetHasOrDmg, replace: (m, pr1, pr2, d) => `대상에게 ${pr1} 또는 ${pr2}(이)가 있으면 +${d}% 대미지.` },
        { match: _P.flipAllPos, replace: () => `주 공격 대상의 모든 버프를 디버프로 바꿉니다.` },
        { match: _P.genEnergyAllAllies, replace: (m, c) => `모든 아군에게 능력 에너지 +${c}를 생성합니다.` },
        { match: _P.noteTargetHasOrCantBlock, replace: (m, pr1, pr2) => `대상에게 ${pr1} 또는 ${pr2}(이)가 있으면 이 공격은 블록할 수 없습니다.` },
        { match: _P.selfHasDmgBoost, replace: (m, proc, d) => `이 캐릭터에게 ${proc}(이)가 있으면 +${d}% 대미지.` },
        { match: _P.clearAllPosTarget, replace: () => `주 공격 대상에게서 모든 버프를 제거합니다.` },
        { match: _P.ifTraitAlliesApplyMax, replace: (m, c, tr, n, pr, max) => `${c}+명의 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 있으면 아군에게 +${n} ${pr}을 적용합니다 (최대 ${max}).` },
        { match: _P.applyMaxRandomTraitAlly, replace: (m, c, pr, max, tr) => `무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 +${c} ${pr}을 적용합니다 (최대 ${max}).` },
        { match: _P.genEnergyTraitAllies, replace: (m, c, tr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 능력 에너지 +${c}를 생성합니다.` },
        // --- Batch 4 patterns ---
        { match: _P.flipCountPos, replace: (m, c) => `주요 대상의 긍정적 효과 ${c}개를 부정적 효과로 전환합니다.` },
        { match: _P.modeFlipCount, replace: (m, mode, c) => `${_modeLoc(mode, 'ko')}, 주요 대상의 긍정적 효과 ${c}개를 부정적 효과로 전환합니다.` },
        { match: _P.onCritReduceSpeed, replace: (m, p) => `치명타 시, 속도 바를 ${p}% 감소시킵니다.` },
        { match: _P.onCritApply, replace: (m, c, pr) => `치명타 시, 주요 대상에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.onAssistPiercing, replace: (m, p) => `지원 시, +${p}% 관통 대미지.` },
        { match: _P.onCounterChanceGain, replace: (m, pct, c, pr) => `반격 시, ${pct}% 확률로 +${c} ${pr}을 획득합니다.` },
        { match: _P.stealPosExcluding, replace: (m, c, excl) => `주요 대상에게서 긍정적 효과 ${c}개를 훔쳐 아군에게 부여합니다 (${excl} 제외).` },
        { match: _P.barrierAllies, replace: (m, p) => `아군에게 최대 체력의 ${p}% 보호막을 부여합니다.` },
        { match: _P.barrierMostInjuredNonSummon, replace: (m, p) => `가장 부상당한 비소환 아군에게 최대 체력의 ${p}% 보호막을 부여합니다.` },
        { match: _P.genEnergyRandomAlly, replace: (m, c) => `무작위 아군에게 능력 에너지 +${c}를 생성합니다.` },
        { match: _P.selfHasReduceDur, replace: (m, proc, proc2, c) => `이 캐릭터가 ${proc}을 가지고 있으면 아군의 ${proc2} 지속 시간을 ${c} 감소시킵니다.` },
        { match: _P.prolongNegExcluding, replace: (m, excl, c) => `${excl}을 제외한 모든 부정적 효과의 지속 시간을 ${c} 연장합니다.` },
        { match: _P.drainDmgDealt, replace: (m, p) => `가한 대미지의 ${p}%를 체력으로 흡수합니다.` },
        { match: _P.drainFlat, replace: (m, p) => `대상 최대 체력의 ${p}%를 흡수합니다.` },
        { match: _P.chanceApply, replace: (m, pct, pr) => `${pct}% 확률로 주요 대상에게 ${pr}을 적용합니다.` },
        { match: _P.modeReduceSpeed, replace: (m, mode, p) => `${_modeLoc(mode, 'ko')}, 속도 바를 ${p}% 감소시킵니다.` },
        { match: _P.modeGain, replace: (m, mode, pr) => `${_modeLoc(mode, 'ko')}, ${pr}을 획득합니다.` },
        { match: _P.clearAllProcTarget, replace: (m, pr) => `주요 대상의 모든 ${pr}을 제거합니다.` },
        { match: _P.applyRandomAlly, replace: (m, pr) => `무작위 아군에게 ${pr}을 적용합니다.` },
        { match: _P.attackAdditional, replace: () => `추가 적을 공격합니다.` },
        { match: _P.copyNegExcluding, replace: (m, c, excl) => `주요 대상의 부정적 효과 ${c}개를 복사합니다 (${excl} 제외).` },
        { match: _P.noteDebuffsNotResisted, replace: () => `이 공격의 디버프는 저항할 수 없습니다.` },
        { match: _P.targetTraitReduceSpeed, replace: (m, tr, p) => `주요 대상이 ${tr}인 경우, 속도 바를 ${p}% 감소시킵니다.` },
        { match: _P.modeStatPerAlly, replace: (m, mode, p, stat, tr) => `${_modeLoc(mode, 'ko')}, ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군 1명당 +${p}% ${stat}.` },
        { match: _P.modeReviveAt, replace: (m, mode, name, p) => `${_modeLoc(mode, 'ko')}, ${name}을 체력 ${p}%로 부활시킵니다.` },
        // --- Batch 5 patterns ---
        { match: _P.modeTraitAllyStealAllExcl, replace: (m, mode, c, tr, ally, excl) => `${_modeLoc(mode, 'ko')}, ${c}+명의 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 있고 ${ally}이 아군이면, 주요 대상의 모든 긍정적 효과를 훔쳐 아군에게 부여합니다 (${excl} 제외).` },
        { match: _P.modeTraitAllyStealProc, replace: (m, mode, c, tr, ally, proc) => `${_modeLoc(mode, 'ko')}, ${c}+명의 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 있고 ${ally}이 아군이면, 주요 대상의 ${proc}을 훔쳐 아군에게 부여합니다.` },
        { match: _P.modeApplyPlus, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ko')}, 주요 대상에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.modeApplyProc, replace: (m, mode, pr) => `${_modeLoc(mode, 'ko')}, 주요 대상에게 ${pr}을 적용합니다.` },
        { match: _P.modeApplyAllies, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ko')}, 아군에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.modeClearCountTarget, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ko')}, 주요 대상의 ${pr}을 ${c}개 제거합니다.` },
        { match: _P.otherwiseApplyPlus, replace: (m, c, pr) => `그렇지 않으면, 주요 대상에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.otherwiseApplyProc, replace: (m, pr) => `그렇지 않으면, 주요 대상에게 ${pr}을 적용합니다.` },
        { match: _P.otherwiseModeClearAllPos, replace: (m, mode) => `그렇지 않으면, ${_modeLoc(mode, 'ko')}, 주요 대상의 모든 긍정적 효과를 제거합니다.` },
        { match: _P.clearFromSelf, replace: (m, pr) => `자신의 모든 ${pr}을 제거합니다.` },
        { match: _P.clearCountProcTarget, replace: (m, c, pr) => `주요 대상의 ${pr}을 ${c}개 제거합니다.` },
        { match: _P.selfNotHasClearNeg, replace: (m, proc) => `이 캐릭터가 ${proc}을 가지고 있지 않으면 아군의 모든 부정적 효과를 제거합니다.` },
        { match: _P.selfNotHasApplyMaxAllies, replace: (m, proc, c, pr, max) => `이 캐릭터가 ${proc}을 가지고 있지 않으면 아군에게 +${c} ${pr}을 적용합니다 (최대 ${max}).` },
        { match: _P.targetHasReduceSpeed, replace: (m, proc, p) => `주요 대상이 ${proc}을 가지고 있으면 속도 바를 ${p}% 감소시킵니다.` },
        { match: _P.targetHasApplyAllies, replace: (m, proc, c, pr, max) => `주요 대상이 ${proc}을 가지고 있으면 아군에게 +${c} ${pr}을 적용합니다 (최대 ${max}).` },
        { match: _P.targetTraitGainMax, replace: (m, tr, c, pr, max) => `주요 대상이 ${tr}인 경우 +${c} ${pr}을 획득합니다 (최대 ${max}).` },
        { match: _P.modeOnCritApply, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ko')}, 치명타 시, 주요 대상에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.notModeOnCritReduceSpeed, replace: (m, mode, p) => `${_notModeLoc(mode, 'ko')}, 치명타 시, 속도 바를 ${p}% 감소시킵니다.` },
        { match: _P.modeCallAssist, replace: (m, mode, tr) => `${_modeLoc(mode, 'ko')}, 무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군을 지원에 부릅니다.` },
        { match: _P.modeNoteCantDodge, replace: (m, mode) => `${_modeLoc(mode, 'ko')}, 이 공격은 회피할 수 없습니다.` },
        { match: _P.modeTargetHasReduceDur, replace: (m, mode, proc, proc2, c) => `${_modeLoc(mode, 'ko')}, 주요 대상이 ${proc}을 가지고 있으면 ${proc2}의 지속 시간을 ${c} 감소시킵니다.` },
        { match: _P.modeProlongNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'ko')}, 부정적 효과의 지속 시간을 ${c} 연장합니다.` },
        { match: _P.notModeProlongNegExcl, replace: (m, mode, excl, c) => `${_notModeLoc(mode, 'ko')}, ${excl}을 제외한 모든 부정적 효과의 지속 시간을 ${c} 연장합니다.` },
        { match: _P.stealAllExcluding, replace: (m, excl) => `주요 대상의 모든 긍정적 효과를 훔칩니다 (${excl} 제외).` },
        { match: _P.stealAllGiveExcluding, replace: (m, excl) => `주요 대상의 모든 긍정적 효과를 훔쳐 아군에게 부여합니다 (${excl} 제외).` },
        { match: _P.transferAllPos, replace: () => `자신의 모든 긍정적 효과를 부정적 효과로 전환합니다.` },
        { match: _P.applyMostInjuredTrait, replace: (m, c, pr, tr) => `가장 부상당한 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 ${c} ${pr}을 적용합니다.` },
        { match: _P.onAssistApplyMaxAllies, replace: (m, c, pr, max) => `지원 시, 아군에게 +${c} ${pr}을 적용합니다 (최대 ${max}).` },
        { match: _P.selfHasMoreModeProlongNeg, replace: (m, n, proc, mode, c) => `이 캐릭터가 ${n}을 초과하는 ${proc}을 가지고 있으면 ${_modeLoc(mode, 'ko')}, 부정적 효과의 지속 시간을 ${c} 연장합니다.` },
        { match: _P.selfHasMoreNotModeProlongNegExcl, replace: (m, n, proc, mode, excl, c) => `이 캐릭터가 ${n}을 초과하는 ${proc}을 가지고 있으면 ${_notModeLoc(mode, 'ko')}, ${excl}을 제외한 모든 부정적 효과의 지속 시간을 ${c} 연장합니다.` },
        { match: _P.barrierMostInjured, replace: (m, p) => `가장 부상당한 아군에게 최대 체력의 ${p}% 보호막을 부여합니다.` },
        { match: _P.onAssistDmg, replace: (m, p) => `지원 시, +${p}% 대미지.` },
        // --- Batch 6 patterns ---
        { match: _P.onTriggerGainPlus, replace: (m, trig, c, pr) => `${trig === 'Counter' ? '반격' : '치명타'} 시, +${c} ${pr}을 획득합니다.` },
        { match: _P.flipNegToPosAllies, replace: (m, c) => `아군의 부정적 효과 ${c}개를 긍정적으로 변환합니다.` },
        { match: _P.stealProcGiveAllies, replace: (m, pr) => `주요 대상에게서 ${pr}을 훔쳐 아군에게 부여합니다.` },
        { match: _P.selfHasCritBoost, replace: (m, pr, p) => `이 캐릭터가 ${pr}을 가지고 있으면 +${p}% 치명타 확률.` },
        { match: _P.traitAllyExistsDmg, replace: (m, tr, p) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 존재하면 +${p}% 대미지.` },
        { match: _P.applyProcMostInjuredTrait, replace: (m, pr, tr) => `가장 부상당한 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 ${pr}을 적용합니다.` },
        // --- Batch 7 patterns ---
        { match: _P.applyProcRandomTraitAlly, replace: (m, pr, tr) => `무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 ${pr}을 적용합니다.` },
        { match: _P.modeStatBoost, replace: (m, mode, p, stat) => `${_modeLoc(mode, 'ko')}, +${p}% ${stat}.` },
        { match: _P.ifAllyNoteAttackCant, replace: (m, name, what) => `${name}이 아군인 경우, 이 공격은 ${what === 'dodged' ? '회피' : what === 'blocked' ? '차단' : what === 'missed' ? '빗나감' : what}될 수 없습니다.` },
        { match: _P.statPerTraitAlly, replace: (m, p, stat, tr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군당 +${p}% ${stat}.` },
        { match: _P.genEnergyForNamed, replace: (m, c, name) => `${name}에게 +${c} 능력 에너지를 생성합니다.` },
        { match: _P.healRandomTraitAlly, replace: (m, tr, p) => `무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군을 최대 체력의 ${p}% 회복합니다.` },
        { match: _P.targetHasStatBoost, replace: (m, proc, p, stat) => `대상이 ${proc}을 가지고 있으면 +${p}% ${stat}.` },
        { match: _P.flipNegToPosRandomTraitAlly, replace: (m, c, tr) => `무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군의 부정적 효과 ${c}개를 긍정적으로 변환합니다.` },
        { match: _P.drainRedistribute, replace: (m, p, target) => `대상의 최대 체력의 ${p}%를 흡수하여 ${_traitLoc(target, SENTENCE_TEMPLATES._activeDict)} 아군에게 재분배합니다.` },
        { match: _P.selfNotHasApplyAllies, replace: (m, proc, pr) => `이 캐릭터가 ${proc}을 가지고 있지 않으면 아군에게 ${pr}을 적용합니다.` },
        { match: _P.selfIsTraitDmg, replace: (m, tr, p) => `이 캐릭터가 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}이면 +${p}% 대미지.` },
        { match: _P.healAllies, replace: (m, p) => `아군을 최대 체력의 ${p}% 회복합니다.` },
        { match: _P.stealCountExcluding, replace: (m, c, excl) => `주요 대상에서 ${c}개의 긍정적 효과를 훔칩니다 (${excl} 제외).` },
        { match: _P.onCritApplyMaxAllies, replace: (m, c, pr, max) => `치명타 시, 아군에게 +${c} ${pr}을 적용합니다 (최대 ${max}).` },
        { match: _P.modeGenEnergyTraitAllies, replace: (m, mode, c, tr) => `${_modeLoc(mode, 'ko')}, ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 +${c} 능력 에너지를 생성합니다.` },
        // --- Batch 8 ---
        { match: _P.ifTraitAlliesApplyProc, replace: (m, n, tr, pr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 ${n}명 이상이면, 주요 대상에게 ${pr}을 적용합니다.` },
        { match: _P.ifTraitAlliesGain, replace: (m, n, tr, pr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 ${n}명 이상이면, ${pr}을 획득합니다.` },
        { match: _P.ifTraitAlliesDmg, replace: (m, n, tr, p) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 ${n}명 이상이면, +${p}% 대미지.` },
        { match: _P.ifTraitAlliesFlip, replace: (m, n, tr, c) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 ${n}명 이상이면, 주요 대상의 긍정적 효과 ${c}개를 부정적 효과로 전환합니다.` },
        { match: _P.dmgPerEffectOnTarget, replace: (m, p, type) => `주요 대상의 ${type === 'positive' ? '긍정적' : '부정적'} 효과 하나당 +${p}% 대미지.` },
        { match: _P.reduceSpeedPerTraitAlly, replace: (m, p, tr) => `${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군 한 명당 속도 바를 ${p}% 감소합니다.` },
        { match: _P.targetHasGainSpeedBar, replace: (m, pr, p) => `주요 대상이 ${pr}을 가지고 있으면, ${p}% 속도 바를 획득합니다.` },
        { match: _P.targetHasGenEnergy, replace: (m, pr, c) => `주요 대상이 ${pr}을 가지고 있으면, 모든 아군에게 +${c} 능력 에너지를 생성합니다.` },
        { match: _P.targetHasFlipPos, replace: (m, pr, c) => `주요 대상이 ${pr}을 가지고 있으면, 주요 대상의 긍정적 효과 ${c}개를 부정적 효과로 전환합니다.` },
        { match: _P.targetNotHasApply, replace: (m, pr1, pr2) => `주요 대상이 ${pr1}을 가지고 있지 않으면, 주요 대상에게 ${pr2}을 적용합니다.` },
        { match: _P.otherwiseFlipPos, replace: (m, c) => `그렇지 않으면, 주요 대상의 긍정적 효과 ${c}개를 부정적 효과로 전환합니다.` },
        { match: _P.modeNoteAttackCant, replace: (m, mode, what) => `${_modeLoc(mode, 'ko')}, 이 공격은 ${what === 'countered' ? '반격' : what === 'blocked' ? '차단' : what === 'dodged' ? '회피' : what}할 수 없습니다.` },
        // --- Batch 9 patterns ---
        { match: _P.barrierSelf, replace: (m, p) => `최대 체력의 ${p}% 보호막을 획득합니다.` },
        { match: _P.prolongProcBy, replace: (m, pr, c) => `${pr}의 지속 시간을 ${c}만큼 연장합니다.` },
        { match: _P.notModeChanceApply, replace: (m, mode, ch, pr) => `${_notModeLoc(mode, 'ko')}, ${ch}% 확률로 주요 대상에게 ${pr}을 적용합니다.` },
        { match: _P.modeChanceGain, replace: (m, mode, ch, pr) => `${_modeLoc(mode, 'ko')}, ${ch}% 확률로 ${pr}을 획득합니다.` },
        { match: _P.clearCountProcAllies, replace: (m, c, pr) => `아군으로부터 ${pr}을 ${c}개 제거합니다.` },
        { match: _P.applyProcToEnemies, replace: (m, pr, c) => `${c}명의 적에게 ${pr}을 적용합니다.` },
        { match: _P.applyCountToEnemies, replace: (m, n, pr, c) => `${c}명의 적에게 ${pr}을 ${n}개 적용합니다.` },
        { match: _P.applyProcDurToEnemies, replace: (m, pr, t, c) => `${c}명의 적에게 ${pr}을 ${t}턴 동안 적용합니다.` },
        { match: _P.clearNegRandomTraitAlly, replace: (m, c, tr) => `무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군의 부정적 효과를 ${c}개 제거합니다.` },
        { match: _P.clearNegMostInjuredTraitAlly, replace: (m, c, tr) => `가장 부상이 심한 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군의 부정적 효과를 ${c}개 제거합니다.` },
        { match: _P.onCritStealAllExcl, replace: (m, pr) => `치명타 시, ${pr}을 제외한 주요 대상의 모든 긍정적 효과를 훔칩니다.` },
        { match: _P.onAssistApplyMaxTarget, replace: (m, c, pr, max) => `지원 시, 주요 대상에게 +${c} ${pr}을 적용합니다 (최대 ${max}).` },
        { match: _P.copyPosGiveExcl, replace: (m, c, pr) => `주요 대상의 긍정적 효과 ${c}개를 복사하여 ${pr}을 제외한 아군에게 부여합니다.` },
        { match: _P.targetTraitGainProc, replace: (m, tr, pr) => `주요 대상이 ${tr}이면, ${pr}을 획득합니다.` },
        { match: _P.flipPosNEnemies, replace: (m, c, n) => `${n}명의 적의 긍정적 효과 ${c}개를 부정적 효과로 전환합니다.` },
        { match: _P.barrierRandomTraitAlly, replace: (m, p, tr) => `무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 최대 체력의 ${p}% 보호막을 부여합니다.` },
        // --- Batch 10 ---
        { match: _P.piercingAdditional, replace: (m, p) => `추가 적에게 +${p}% 관통 대미지.` },
        { match: _P.dmgPierceAdditional, replace: (m, d, p) => `추가 적에게 +${d}% 대미지 + ${p}% 관통 대미지.` },
        { match: _P.modeApplyPlusRandomAlly, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ko')}, 무작위 아군에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.drainAlliesHealth, replace: (m, p) => `아군 최대 체력의 ${p}%를 흡수합니다.` },
        { match: _P.ifAllyNoteCantMiss, replace: (m, ally) => `${ally}이 아군이면, 이 공격은 빗나갈 수 없습니다.` },
        { match: _P.targetHasAttackPierceInstead, replace: (m, proc, p) => `주요 대상이 ${proc}을 보유하면, 대신 ${p}% 관통으로 공격합니다.` },
        { match: _P.targetHasDrainRedistribute, replace: (m, proc, p, target) => `주요 대상이 ${proc}을 보유하면, 대상 최대 체력의 ${p}%를 흡수하여 ${target}에게 재분배합니다.` },
        { match: _P.modeOnCritClearNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'ko')}, 치명타 시, 아군의 부정적 효과 ${c}개를 제거합니다.` },
        { match: _P.ifAllyStealAllGiveExcl, replace: (m, ally, pr) => `${ally}이 아군이면, 주요 대상의 ${pr}을 제외한 모든 긍정적 효과를 훔쳐 아군에게 부여합니다.` },
        { match: _P.applyProcToAllyHighest, replace: (m, pr, tr, stat) => `가장 높은 ${stat}을 가진 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 ${pr}을 적용합니다.` },
        { match: _P.applyProcRandomAllyBelowHealth, replace: (m, pr, p) => `체력 ${p}% 이하인 무작위 아군에게 ${pr}을 적용합니다.` },
        { match: _P.allAlliesHaveGainSpeedBar, replace: (m, proc, p) => `모든 아군이 ${proc}을 보유하면, ${p}% 속도 바를 획득합니다.` },
        { match: _P.targetHasStealCountExcl, replace: (m, proc, c, pr) => `주요 대상이 ${proc}을 보유하면, ${pr}을 제외한 긍정적 효과 ${c}개를 훔칩니다.` },
        { match: _P.selfHasLessThanApplyMaxAllies, replace: (m, n, proc, c, pr, max) => `${proc}이 ${n}개 미만이면, 아군에게 +${c} ${pr}을 적용합니다 (최대 ${max}).` },
        { match: _P.targetTraitApplyProcAllyHighest, replace: (m, tr, pr, stat) => `주요 대상이 ${tr}이면, 가장 높은 ${stat}을 가진 아군에게 ${pr}을 적용합니다.` },
        { match: _P.modeIfTraitAlliesStealProc, replace: (m, mode, c, tr, proc) => `${_modeLoc(mode, 'ko')}, ${c}+명의 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 있으면, 주요 대상의 ${proc}을 훔쳐 아군에게 부여합니다.` },
        // --- Batch 11 ---
        { match: _P.targetHasPosClearPos, replace: (m, c) => `주요 대상이 긍정적 효과를 보유하면, 주요 대상의 긍정적 효과 ${c}개를 제거합니다.` },
        { match: _P.modeSubTargetHasDrain, replace: (m, mode, sub, proc, p) => `${_modeLoc(mode, 'ko')}, ${sub}, 주요 대상이 ${proc}을 보유하면, 대상 최대 체력의 ${p}%를 흡수합니다.` },
        { match: _P.modeSubReduceDur, replace: (m, mode, sub, proc, c) => `${_modeLoc(mode, 'ko')}, ${sub}, ${proc}의 지속 시간을 ${c} 감소시킵니다.` },
        { match: _P.modeApplyPlusRandomAllyExclSelf, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ko')}, 무작위 아군(자신 제외)에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.modeOrSubClearNegRandomTraitAlly, replace: (m, m1, m2, sub, c, tr) => `${_modeLoc(m1, 'ko')} 또는 ${_modeLoc(m2, 'ko')}, ${sub}, 무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군의 부정적 효과 ${c}개를 제거합니다.` },
        { match: _P.selfHasClearPos, replace: (m, proc, c) => `${proc}을 보유하면, 주요 대상의 긍정적 효과 ${c}개를 제거합니다.` },
        { match: _P.selfNotHasFlipPos, replace: (m, proc, c) => `${proc}을 보유하지 않으면, 주요 대상의 긍정적 효과 ${c}개를 부정적 효과로 전환합니다.` },
        { match: _P.selfHasClearNegSelf, replace: (m, proc) => `${proc}을 보유하면, 자신의 모든 부정적 효과를 제거합니다.` },
        { match: _P.selfHasClearCountFromSelf, replace: (m, proc, c, pr) => `${proc}을 보유하면, 자신에게서 ${pr} ${c}개를 제거합니다.` },
        { match: _P.targetHasClearAllProc, replace: (m, proc, pr) => `주요 대상이 ${proc}을 보유하면, 주요 대상의 모든 ${pr}을 제거합니다.` },
        { match: _P.onAssistTargetHasClearAllProc, replace: (m, proc, pr) => `지원 시, 주요 대상이 ${proc}을 보유하면, 주요 대상의 모든 ${pr}을 제거합니다.` },
        { match: _P.targetTraitApplyCountDur, replace: (m, tr, c, pr, t) => `주요 대상이 ${tr}이면, 주요 대상에게 ${c}개의 ${pr}을 ${t}턴 적용합니다.` },
        { match: _P.targetTraitApplyCount, replace: (m, tr, c, pr) => `주요 대상이 ${tr}이면, 주요 대상에게 ${c}개의 ${pr}을 적용합니다.` },
        { match: _P.onCritBarrierAllies, replace: (m, p) => `치명타 시, 아군에게 최대 체력의 ${p}% 보호막을 부여합니다.` },
        { match: _P.ifTraitAlliesCritChance, replace: (m, c, tr, p) => `${c}+명의 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 있으면, +${p}% 치명타 확률.` },
        { match: _P.ifTraitAlliesCritPerAlly, replace: (m, c, tr, p, tr2) => `${c}+명의 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 있으면, ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)} 아군 1명당 +${p}% 치명타 확률.` },
        // --- Batch 12 ---
        { match: _P.onCritGenEnergyRandomAlly, replace: (m, c) => `치명타 시, 무작위 아군에게 +${c} 능력 에너지를 생성합니다.` },
        { match: _P.onCounterOnCritGenEnergy, replace: (m, c) => `반격 시, 치명타 시, 무작위 아군에게 +${c} 능력 에너지를 생성합니다.` },
        { match: _P.removeBarrierTarget, replace: () => `주요 대상의 보호막을 제거합니다.` },
        { match: _P.modeSubFlipNegToPosAllies, replace: (m, mode, sub) => `${_modeLoc(mode, 'ko')}, ${sub}, 아군의 모든 부정적 효과를 긍정적 효과로 전환합니다.` },
        { match: _P.modeSubTargetNotTraitDrain, replace: (m, mode, sub, tr, p) => `${_modeLoc(mode, 'ko')}, ${sub}, 주요 대상이 ${tr}이 아니면, 대상 최대 체력의 ${p}%를 흡수합니다.` },
        { match: _P.targetNotHasClearPos, replace: (m, proc, c) => `주요 대상이 ${proc}을 보유하지 않으면, 주요 대상의 긍정적 효과 ${c}개를 제거합니다.` },
        { match: _P.selfHasGainSpeedBar, replace: (m, proc, p) => `${proc}을 보유하면, ${p}% 속도 바를 획득합니다.` },
        { match: _P.selfHasGainCount, replace: (m, proc, c, pr) => `${proc}을 보유하면, ${c}개의 ${pr}을 획득합니다.` },
        { match: _P.healTarget, replace: (m, p) => `주요 대상의 최대 체력의 ${p}%를 회복합니다.` },
        { match: _P.ifAllyApplyCount, replace: (m, ally, c, pr) => `${ally}이 아군이면, 주요 대상에게 ${c}개의 ${pr}을 적용합니다.` },
        { match: _P.notModeChanceGain, replace: (m, mode, p, pr) => `${_notModeLoc(mode, 'ko')}, ${p}% 확률로 ${pr}을 획득합니다.` },
        { match: _P.ifAllyDmgPierce, replace: (m, ally, d, p) => `${ally}이 아군이면, +${d}% 대미지 + ${p}% 관통 대미지.` },
        { match: _P.ifAllyApplyDur, replace: (m, ally, pr, t) => `${ally}이 아군이면, 주요 대상에게 ${pr}을 ${t}턴 적용합니다.` },
        { match: _P.selfIsTraitApplyProc, replace: (m, tr, pr) => `자신이 ${tr}이면, 주요 대상에게 ${pr}을 적용합니다.` },
        { match: _P.selfNotTraitApplyProc, replace: (m, tr, pr) => `자신이 ${tr}이 아니면, 주요 대상에게 ${pr}을 적용합니다.` },
        { match: _P.targetTraitApplyProc, replace: (m, tr, pr) => `주요 대상이 ${tr}이면, 주요 대상에게 ${pr}을 적용합니다.` },
        // --- Batch 13 ---
        { match: _P.targetTraitOrApplyCountDurInjured, replace: (m, tr1, tr2, c, pr, t) => `주요 대상이 ${tr1} 또는 ${tr2}이면, 가장 부상당한 아군에게 ${c}개의 ${pr}을 ${t}턴 적용합니다.` },
        { match: _P.onAssistModeOnCritApply, replace: (m, mode, pr) => `지원 시, ${_modeLoc(mode, 'ko')}, 치명타 시, 주요 대상에게 ${pr}을 적용합니다.` },
        { match: _P.otherwiseSelfOrTargetHasCrit, replace: (m, tr, proc, p) => `그렇지 않으면, 자신이 ${tr}이거나 대상이 ${proc}을 보유하면, +${p}% 치명타 확률.` },
        { match: _P.healthOrChargedDmg, replace: (m, hp, proc, d) => `이 캐릭터의 체력이 ${hp}% 이하이거나 ${proc}을 보유하면, +${d}% 대미지.` },
        { match: _P.applyDurTraitAllyLowest, replace: (m, pr, t, tr, stat) => `가장 낮은 ${stat}을 가진 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 ${pr}을 ${t}턴 적용합니다.` },
        { match: _P.otherwiseTargetHasApplyAllies, replace: (m, proc, c, pr) => `그렇지 않으면, 주요 대상이 ${proc}을 보유하면, 아군에게 +${c} ${pr}을 적용합니다.` },
        { match: _P.modeIfTraitAlliesCallHighest, replace: (m, mode, c, tr, tr2, stat) => `${_modeLoc(mode, 'ko')}, ${c}+명의 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군이 있으면, 가장 높은 ${stat}을 가진 ${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)} 아군을 지원에 호출합니다.` },
        { match: _P.modeOnAssistTypeGenTraitAlly, replace: (m, mode, type, c, tr) => `${_modeLoc(mode, 'ko')}, ${type} 지원 시, 무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군에게 +${c} 능력 에너지를 생성합니다.` },
        { match: _P.selfHasProcCritPerTraitOrAlly, replace: (m, proc, p, tr1, tr2) => `${proc}을 보유하면, ${tr1} 또는 ${tr2} 아군 1명당 +${p}% 치명타 확률.` },
        { match: _P.modeHealthReduceDurRandomTraitAlly, replace: (m, mode, hp, c, tr) => `${_modeLoc(mode, 'ko')}, 이 캐릭터의 체력이 ${hp}%를 초과하면, 무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군의 부정적 효과 지속 시간을 ${c} 감소시킵니다.` },
        { match: _P.targetHasAndHasRemoveBarrier, replace: (m, p1, p2) => `주요 대상이 ${p1}과 ${p2}를 보유하면, 주요 대상의 보호막을 제거합니다.` },
        { match: _P.selfHasCountAnyEnemyFlip, replace: (m, c, proc, n) => `${proc}을 ${c}+개 보유하고 적이 긍정적 효과를 보유하면, 주요 대상의 긍정적 효과 ${n}개를 부정적 효과로 전환합니다.` },
        { match: _P.selfLessCountAnyEnemyFlip, replace: (m, c, proc, n) => `${proc}이 ${c}개 미만이고 적이 긍정적 효과를 보유하면, 주요 대상의 긍정적 효과 ${n}개를 부정적 효과로 전환합니다.` },
        { match: _P.modeOnCritProlongNegExcl, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'ko')}, 치명타 시, ${pr}을 제외한 모든 부정적 효과의 지속 시간을 ${c} 연장합니다.` },
        { match: _P.modeOnCritProlongProc, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'ko')}, 치명타 시, ${pr}의 지속 시간을 ${c} 연장합니다.` },
        { match: _P.modeBarrierRandomAlly, replace: (m, mode, p) => `${_modeLoc(mode, 'ko')}, 무작위 아군에게 최대 체력의 ${p}% 보호막을 부여합니다.` },
        // --- Batch 14 ---
        { match: _P.modeEnergyFullOnCritGenRandomAlly, replace: (m, mode, c) => `${_modeLoc(mode, 'ko')}, 능력 에너지가 가득 찬 경우, 크리티컬 시, 무작위 아군에게 +${c} 능력 에너지 생성.` },
        { match: _P.modeEnergyFullOnCritGenSelf, replace: (m, mode, c) => `${_modeLoc(mode, 'ko')}, 능력 에너지가 가득 찬 경우, 크리티컬 시, 자신에게 +${c} 능력 에너지 생성.` },
        { match: _P.healthLessThanDrain, replace: (m, hp, d) => `이 캐릭터의 체력이 ${hp}% 미만인 경우, +${d}% 드레인.` },
        { match: _P.healthOrMoreApplyDurTarget, replace: (m, hp, pr, t) => `이 캐릭터의 체력이 ${hp}% 이상인 경우, 주요 대상에게 ${t}턴 동안 ${pr} 적용.` },
        { match: _P.barrierOrMoreApplyDurAllies, replace: (m, bp, pr, t) => `이 캐릭터의 방벽이 ${bp}% 이상인 경우, 아군에게 ${t}턴 동안 ${pr} 적용.` },
        { match: _P.barrierOrMoreGainDur, replace: (m, bp, pr, t) => `이 캐릭터의 방벽이 ${bp}% 이상인 경우, ${t}턴 동안 ${pr} 획득.` },
        { match: _P.onTypeAssistGenAllAllies, replace: (m, type, c) => `${type} 지원 시, 모든 아군에게 +${c} 능력 에너지 생성.` },
        { match: _P.onTypeAssistGenChar, replace: (m, type, c, ch) => `${type} 지원 시, ${ch}에게 +${c} 능력 에너지 생성.` },
        { match: _P.ifNotFacingApplyTarget, replace: (m, ch, pr) => `${ch}과(와) 대전하지 않는 경우, 주요 대상에게 ${pr} 적용.` },
        { match: _P.targetTraitApplyInjuredAlly, replace: (m, tr, pr) => `주요 대상이 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}인 경우, 가장 부상당한 아군에게 ${pr} 적용.` },
        { match: _P.copyAllGiveAlliesExclTwo, replace: (m, pr1, pr2) => `주요 대상의 모든 긍정적 효과를 복사하여 아군에게 부여, ${pr1} 및 ${pr2} 제외.` },
        { match: _P.noteCantCritHit, replace: () => `이 공격은 치명타를 입힐 수 없습니다.` },
        { match: _P.modeApplyAllies, replace: (m, mode, pr) => `${_modeLoc(mode, 'ko')}, 아군에게 ${pr} 적용.` },
        { match: _P.targetTraitApplyCountMaxInjured, replace: (m, tr, c, pr, mx) => `주요 대상이 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}인 경우, 가장 부상당한 아군에게 +${c} ${pr} 적용 (최대 ${mx}).` },
        { match: _P.modeGenEnergyChar, replace: (m, mode, c, ch) => `${_modeLoc(mode, 'ko')}, ${ch}에게 +${c} 능력 에너지 생성.` },
        { match: _P.targetTraitApplyInjuredWithout, replace: (m, tr, pr, pr2) => `주요 대상이 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}인 경우, ${pr2} 없는 가장 부상당한 아군에게 ${pr} 적용.` },
        { match: _P.modeHealRandomTraitAlly, replace: (m, mode, tr, hp) => `${_modeLoc(mode, 'ko')}, 무작위 ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} 아군의 체력을 최대 체력의 ${hp}% 회복.` },
        { match: _P.selfHasOrLessApplyMaxAllies, replace: (m, c, pr, c2, pr2, mx) => `자신의 ${pr}이(가) ${c} 이하인 경우, 아군에게 +${c2} ${pr2} 적용 (최대 ${mx}).` },
        { match: _P.selfHasProcChanceApplyTarget, replace: (m, pr, pct, pr2) => `자신이 ${pr}을(를) 보유한 경우, ${pct}% 확률로 주요 대상에게 ${pr2} 적용.` },
        { match: _P.otherwiseSelfHasChanceGain, replace: (m, pr, pct, pr2) => `그렇지 않으면, 자신이 ${pr}을(를) 보유한 경우, ${pct}% 확률로 ${pr2} 획득.` },
        { match: _P.otherwiseSelfHasHealInjured, replace: (m, pr, hp) => `그렇지 않으면, 자신이 ${pr}을(를) 보유한 경우, 가장 부상당한 아군의 체력을 최대 체력의 ${hp}% 회복.` },
      ],
    },
    // ==================== RUSSIAN ====================
    ru: {
      damageLine: (dmg, pierce, drain) => {
        const p = [];
        if (dmg > 0) p.push(`<span class="msf-iso8-damage-value">${dmg} %</span> урона`);
        if (pierce > 0) p.push(`<span class="msf-iso8-piercing-value">${pierce} %</span> проникающего урона`);
        if (drain > 0) p.push(`<span class="msf-iso8-drain-value">${drain} %</span> высасывания`);
        return p.length > 0 ? `⚔️ Наносит основной цели ${p.join(' + ')}` : null;
      },
      title: 'ISO-8 Контратака/Помощь',
      patterns: [
        { match: _P.forcedDmgPierce, replace: (m, d, p, tr) => `Если персонаж вынужден атаковать союзника, он наносит персонажам-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} ${d} % урона + ${p} % проникающего урона.` },
        { match: _P.forcedDmg, replace: (m, d, tr) => `Если персонаж вынужден атаковать союзника, он наносит персонажам-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} ${d} % урона.` },
        { match: _P.flipEffects, replace: (m, n, c) => `Если среди союзников есть ${n}, превращает ${c} случ. положит. эфф. на основной цели в отрицательные.` },
        { match: _P.flipRandom, replace: (m, n, c) => `Если среди союзников есть ${n}, превращает ${c} случ. положит. эфф. на основной цели в отрицательные.` },
        { match: _P.applyProc, replace: (m, pr) => `Применяет ${pr} к основной цели.` },
        { match: _P.applyCount, replace: (m, c, pr) => `Применяет ${c} зар. ${pr} к основной цели.` },
        { match: _P.applyPlusDur, replace: (m, c, pr, t) => `Применяет +${c} ${pr} на ${t} ходов к основной цели.` },
        { match: _P.applyPlus, replace: (m, c, pr) => `Применяет +${c} ${pr} к основной цели.` },
        { match: _P.applyAllies, replace: (m, c, pr) => `Применяет +${c} ${pr} к союзникам.` },
        { match: _P.gainPlus, replace: (m, c, pr) => `Получает +${c} ${pr}.` },
        { match: _P.gainSpeedBar, replace: (m, p) => `Получает ${p} % шкалы скорости.` },
        { match: _P.reduceSpeedBar, replace: (m, p) => `Уменьшает шкалу скорости на ${p} %.` },
        { match: _P.gain, replace: (m, pr) => `Получает ${pr}.` },
        { match: _P.healthGain, replace: (m, p, pr) => `Если у персонажа ${p} % здоровья или менее, получает ${pr}.` },
        { match: _P.healthGeneric, replace: (m, p, r) => `Если у персонажа ${p} % здоровья или менее, ${r}` },
        // --- New patterns ---
        { match: _P.forcedPierceOnly, replace: (m, p, tr) => `Если персонаж вынужден атаковать союзника, он наносит персонажам-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} ${p} % проникающего урона.` },
        { match: _P.ifAllyApplyRandom, replace: (m, n, pr) => `Если среди союзников есть ${n}, применяет ${pr} к случайному союзнику.` },
        { match: _P.selfHasApplyCountDur, replace: (m, proc, c, pr, t) => `Если у персонажа есть ${proc}, применяет ${c} зар. ${pr} на ${t} ходов к основной цели.` },
        { match: _P.selfHasApply, replace: (m, proc, pr) => `Если у персонажа есть ${proc}, применяет ${pr} к основной цели.` },
        { match: _P.selfHasClear, replace: (m, proc, c, pr) => `Если у персонажа есть ${proc}, снимает ${c} ${pr} с союзников.` },
        { match: _P.selfHasAttackInstead, replace: (m, proc, p, d) => `Если у персонажа есть ${proc}, вместо этого атакует с ${p} % проникающего урона + ${d} % высасывания.` },
        { match: _P.selfNotHasApply, replace: (m, proc, pr) => `Если у персонажа нет ${proc}, применяет ${pr} к основной цели.` },
        { match: _P.modeGainCount, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ru')}, получает ${c} зар. ${pr}.` },
        { match: _P.modeSelfHasApply, replace: (m, mode, proc, pr) => `${_modeLoc(mode, 'ru')}, если у персонажа есть ${proc}, применяет ${pr} к основной цели.` },
        { match: _P.onAssistEnergy, replace: (m, type, c) => `При помощи ${_modeLoc(type, 'ru')}, генерирует +${c} энергии способностей для себя.` },
        { match: _P.modeReduceSpeedPerAlly, replace: (m, mode, p, tr) => `${_modeLoc(mode, 'ru')}, уменьшает шкалу скорости на ${p} % за каждого союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.healthHealAllies, replace: (m, p, h) => `Если у персонажа менее ${p} % здоровья, лечит союзников на ${h} % от макс. здоровья.` },
        { match: _P.modeIgnoresDefUp, replace: (m, mode) => `${_modeLoc(mode, 'ru')}, эта атака игнорирует Повышение защиты.` },
        // --- Batch 3 patterns ---
        { match: _P.modeIfSelfHasCountDmg, replace: (m, mode, c, proc, d) => `${_modeLoc(mode, 'ru')}, если у персонажа ${c}+ ${proc}, +${d} % урона.` },
        { match: _P.clearPosTarget, replace: (m, c) => `Снимает ${c} положит. эфф. с основной цели.` },
        { match: _P.applyAlliesNamed, replace: (m, pr) => `Применяет ${pr} к союзникам.` },
        { match: _P.clearNegAllies, replace: (m, c) => `Снимает ${c} отрицат. эфф. с союзников.` },
        { match: _P.applyMostInjured, replace: (m, pr) => `Применяет ${pr} к наиболее раненому союзнику.` },
        { match: _P.clearNegMostInjured, replace: (m, c) => `Снимает ${c} отрицат. эфф. с наиболее раненого союзника.` },
        { match: _P.modeApplyRandomTraitAlly, replace: (m, mode, c, pr, tr) => `${_modeLoc(mode, 'ru')}, применяет +${c} ${pr} к случайному союзнику-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.targetNotTraitDrain, replace: (m, tr, p) => `Если основная цель не является ${tr}, высасывает ${p} % от макс. здоровья цели.` },
        { match: _P.targetTraitDrain, replace: (m, tr, p) => `Если основная цель является ${tr}, высасывает ${p} % от макс. здоровья цели.` },
        { match: _P.notModeFlip, replace: (m, mode, c) => `${_notModeLoc(mode, 'ru')}, превращает ${c} положит. эфф. на основной цели в отрицательные.` },
        { match: _P.modeFlipAll, replace: (m, mode) => `${_modeLoc(mode, 'ru')}, превращает все положит. эфф. на основной цели в отрицательные.` },
        { match: _P.targetNoPosApply, replace: (m, pr) => `Если у основной цели нет положительных эффектов, применяет ${pr} к основной цели.` },
        { match: _P.targetHasApply, replace: (m, proc, pr) => `Если у основной цели есть ${proc}, применяет ${pr} к основной цели.` },
        { match: _P.applyUpToMaxRandomAlly, replace: (m, c, pr, max) => `Применяет +${c} ${pr} к случайному союзнику, до максимума ${max}.` },
        { match: _P.onAssistProlongPos, replace: (m, proc, c) => `При помощи: Продлевает действие всех положит. эфф., кроме ${proc}, на ${c} на союзниках.` },
        { match: _P.prolongPosExcluding, replace: (m, proc, c) => `Продлевает действие всех положит. эфф., кроме ${proc}, на ${c} на союзниках.` },
        { match: _P.forcedDmgInstead, replace: (m, p) => `Если персонаж вынужден атаковать союзника, вместо этого атакует на ${p} % урона.` },
        { match: _P.otherwiseDrain, replace: (m, p) => `В противном случае высасывает ${p} % от макс. здоровья цели.` },
        { match: _P.anyEnemyHasClearPos, replace: (m, c) => `Если у врага есть положительные эффекты, снимает ${c} положит. эфф. с основной цели.` },
        { match: _P.clearNegRandomAlly, replace: (m, c) => `Снимает ${c} отрицат. эфф. со случайного союзника.` },
        { match: _P.triggerBattlefield, replace: () => `Активирует эффект поля боя.` },
        { match: _P.noteIgnoresDefUp, replace: () => `Эта атака игнорирует Повышение защиты.` },
        { match: _P.targetHasOrDmg, replace: (m, pr1, pr2, d) => `Если у цели есть ${pr1} или ${pr2}, +${d} % урона.` },
        { match: _P.flipAllPos, replace: () => `Превращает все положит. эфф. на основной цели в отрицательные.` },
        { match: _P.genEnergyAllAllies, replace: (m, c) => `Генерирует +${c} энергии способностей для всех союзников.` },
        { match: _P.noteTargetHasOrCantBlock, replace: (m, pr1, pr2) => `Если у цели есть ${pr1} или ${pr2}, эту атаку нельзя заблокировать.` },
        { match: _P.selfHasDmgBoost, replace: (m, proc, d) => `Если у персонажа есть ${proc}, +${d} % урона.` },
        { match: _P.clearAllPosTarget, replace: () => `Снимает все положительные эффекты с основной цели.` },
        { match: _P.ifTraitAlliesApplyMax, replace: (m, c, tr, n, pr, max) => `Если ${c}+ союзников-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, применяет +${n} ${pr} к союзникам, до максимума ${max}.` },
        { match: _P.applyMaxRandomTraitAlly, replace: (m, c, pr, max, tr) => `Применяет +${c} ${pr} к случайному союзнику-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, до максимума ${max}.` },
        { match: _P.genEnergyTraitAllies, replace: (m, c, tr) => `Генерирует +${c} энергии способностей для союзников-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 4 patterns ---
        { match: _P.flipCountPos, replace: (m, c) => `Обращает ${c} положительный/ых эффект/ов в отрицательный/ые на основной цели.` },
        { match: _P.modeFlipCount, replace: (m, mode, c) => `${_modeLoc(mode, 'ru')}: обращает ${c} положительный/ых эффект/ов в отрицательный/ые на основной цели.` },
        { match: _P.onCritReduceSpeed, replace: (m, p) => `При критическом ударе: уменьшает шкалу скорости на ${p}%.` },
        { match: _P.onCritApply, replace: (m, c, pr) => `При критическом ударе: применяет +${c} ${pr} к основной цели.` },
        { match: _P.onAssistPiercing, replace: (m, p) => `При поддержке: +${p}% пробивающего урона.` },
        { match: _P.onCounterChanceGain, replace: (m, pct, c, pr) => `При контратаке: ${pct}% шанс получить +${c} ${pr}.` },
        { match: _P.stealPosExcluding, replace: (m, c, excl) => `Крадёт ${c} положительный/ых эффект/ов у основной цели и передаёт союзникам, кроме ${excl}.` },
        { match: _P.barrierAllies, replace: (m, p) => `Барьер в ${p}% от макс. здоровья для союзников.` },
        { match: _P.barrierMostInjuredNonSummon, replace: (m, p) => `Барьер в ${p}% от макс. здоровья для самого раненого не призванного союзника.` },
        { match: _P.genEnergyRandomAlly, replace: (m, c) => `Генерирует +${c} энергии способностей для случайного союзника.` },
        { match: _P.selfHasReduceDur, replace: (m, proc, proc2, c) => `Если у этого персонажа есть ${proc}, уменьшает длительность ${proc2} на ${c} у союзников.` },
        { match: _P.prolongNegExcluding, replace: (m, excl, c) => `Продлевает длительность всех отрицательных эффектов, кроме ${excl}, на ${c}.` },
        { match: _P.drainDmgDealt, replace: (m, p) => `Поглощает ${p}% нанесённого урона в виде здоровья.` },
        { match: _P.drainFlat, replace: (m, p) => `Поглощает ${p}% от макс. здоровья цели.` },
        { match: _P.chanceApply, replace: (m, pct, pr) => `${pct}% шанс применить ${pr} к основной цели.` },
        { match: _P.modeReduceSpeed, replace: (m, mode, p) => `${_modeLoc(mode, 'ru')}: уменьшает шкалу скорости на ${p}%.` },
        { match: _P.modeGain, replace: (m, mode, pr) => `${_modeLoc(mode, 'ru')}: получает ${pr}.` },
        { match: _P.clearAllProcTarget, replace: (m, pr) => `Удаляет все ${pr} с основной цели.` },
        { match: _P.applyRandomAlly, replace: (m, pr) => `Применяет ${pr} к случайному союзнику.` },
        { match: _P.attackAdditional, replace: () => `Атакует дополнительного врага.` },
        { match: _P.copyNegExcluding, replace: (m, c, excl) => `Копирует ${c} отрицательный/ых эффект/ов с основной цели, кроме ${excl}.` },
        { match: _P.noteDebuffsNotResisted, replace: () => `Ослабления от этой атаки нельзя сопротивлять.` },
        { match: _P.targetTraitReduceSpeed, replace: (m, tr, p) => `Если основная цель — ${tr}, уменьшает шкалу скорости на ${p}%.` },
        { match: _P.modeStatPerAlly, replace: (m, mode, p, stat, tr) => `${_modeLoc(mode, 'ru')}: +${p}% ${stat} за каждого союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.modeReviveAt, replace: (m, mode, name, p) => `${_modeLoc(mode, 'ru')}: воскрешает ${name} с ${p}% здоровья.` },
        // --- Batch 5 patterns ---
        { match: _P.modeTraitAllyStealAllExcl, replace: (m, mode, c, tr, ally, excl) => `${_modeLoc(mode, 'ru')}: если ${c}+ союзников-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} и ${ally} союзник, крадёт все положительные эффекты у основной цели и передаёт союзникам, кроме ${excl}.` },
        { match: _P.modeTraitAllyStealProc, replace: (m, mode, c, tr, ally, proc) => `${_modeLoc(mode, 'ru')}: если ${c}+ союзников-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} и ${ally} союзник, крадёт ${proc} у основной цели и передаёт союзникам.` },
        { match: _P.modeApplyPlus, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ru')}: применяет +${c} ${pr} к основной цели.` },
        { match: _P.modeApplyProc, replace: (m, mode, pr) => `${_modeLoc(mode, 'ru')}: применяет ${pr} к основной цели.` },
        { match: _P.modeApplyAllies, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ru')}: применяет +${c} ${pr} к союзникам.` },
        { match: _P.modeClearCountTarget, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ru')}: удаляет ${c} ${pr} с основной цели.` },
        { match: _P.otherwiseApplyPlus, replace: (m, c, pr) => `В противном случае применяет +${c} ${pr} к основной цели.` },
        { match: _P.otherwiseApplyProc, replace: (m, pr) => `В противном случае применяет ${pr} к основной цели.` },
        { match: _P.otherwiseModeClearAllPos, replace: (m, mode) => `В противном случае, ${_modeLoc(mode, 'ru')}: удаляет все положительные эффекты с основной цели.` },
        { match: _P.clearFromSelf, replace: (m, pr) => `Удаляет все ${pr} с себя.` },
        { match: _P.clearCountProcTarget, replace: (m, c, pr) => `Удаляет ${c} ${pr} с основной цели.` },
        { match: _P.selfNotHasClearNeg, replace: (m, proc) => `Если у этого персонажа нет ${proc}, удаляет все отрицательные эффекты у союзников.` },
        { match: _P.selfNotHasApplyMaxAllies, replace: (m, proc, c, pr, max) => `Если у этого персонажа нет ${proc}, применяет +${c} ${pr} к союзникам, до максимума ${max}.` },
        { match: _P.targetHasReduceSpeed, replace: (m, proc, p) => `Если у основной цели есть ${proc}, уменьшает шкалу скорости на ${p}%.` },
        { match: _P.targetHasApplyAllies, replace: (m, proc, c, pr, max) => `Если у основной цели есть ${proc}, применяет +${c} ${pr} к союзникам, до максимума ${max}.` },
        { match: _P.targetTraitGainMax, replace: (m, tr, c, pr, max) => `Если основная цель — ${tr}, получает +${c} ${pr}, до максимума ${max}.` },
        { match: _P.modeOnCritApply, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ru')}: при критическом ударе применяет +${c} ${pr} к основной цели.` },
        { match: _P.notModeOnCritReduceSpeed, replace: (m, mode, p) => `${_notModeLoc(mode, 'ru')}: при критическом ударе уменьшает шкалу скорости на ${p}%.` },
        { match: _P.modeCallAssist, replace: (m, mode, tr) => `${_modeLoc(mode, 'ru')}: вызывает случайного союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} на помощь.` },
        { match: _P.modeNoteCantDodge, replace: (m, mode) => `${_modeLoc(mode, 'ru')}: от этой атаки нельзя уклониться.` },
        { match: _P.modeTargetHasReduceDur, replace: (m, mode, proc, proc2, c) => `${_modeLoc(mode, 'ru')}: если у основной цели есть ${proc}, уменьшает длительность ${proc2} на ${c}.` },
        { match: _P.modeProlongNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'ru')}: продлевает длительность отрицательных эффектов на ${c}.` },
        { match: _P.notModeProlongNegExcl, replace: (m, mode, excl, c) => `${_notModeLoc(mode, 'ru')}: продлевает длительность всех отрицательных эффектов, кроме ${excl}, на ${c}.` },
        { match: _P.stealAllExcluding, replace: (m, excl) => `Крадёт все положительные эффекты у основной цели, кроме ${excl}.` },
        { match: _P.stealAllGiveExcluding, replace: (m, excl) => `Крадёт все положительные эффекты у основной цели и передаёт союзникам, кроме ${excl}.` },
        { match: _P.transferAllPos, replace: () => `Переносит все положительные эффекты с себя как отрицательные.` },
        { match: _P.applyMostInjuredTrait, replace: (m, c, pr, tr) => `Применяет ${c} ${pr} к самому раненому союзнику-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.onAssistApplyMaxAllies, replace: (m, c, pr, max) => `При поддержке: применяет +${c} ${pr} к союзникам, до максимума ${max}.` },
        { match: _P.selfHasMoreModeProlongNeg, replace: (m, n, proc, mode, c) => `Если у этого персонажа более ${n} ${proc}, ${_modeLoc(mode, 'ru')}: продлевает длительность отрицательных эффектов на ${c}.` },
        { match: _P.selfHasMoreNotModeProlongNegExcl, replace: (m, n, proc, mode, excl, c) => `Если у этого персонажа более ${n} ${proc}, ${_notModeLoc(mode, 'ru')}: продлевает длительность всех отрицательных эффектов, кроме ${excl}, на ${c}.` },
        { match: _P.barrierMostInjured, replace: (m, p) => `Барьер в ${p}% от макс. здоровья для самого раненого союзника.` },
        { match: _P.onAssistDmg, replace: (m, p) => `При поддержке: +${p}% урона.` },
        // --- Batch 6 patterns ---
        { match: _P.onTriggerGainPlus, replace: (m, trig, c, pr) => `При ${trig === 'Counter' ? 'контратаке' : 'крит. ударе'}: получает +${c} ${pr}.` },
        { match: _P.flipNegToPosAllies, replace: (m, c) => `Переворачивает ${c} негативных эффектов в позитивные у союзников.` },
        { match: _P.stealProcGiveAllies, replace: (m, pr) => `Крадёт ${pr} у основной цели и передаёт союзникам.` },
        { match: _P.selfHasCritBoost, replace: (m, pr, p) => `Если у персонажа есть ${pr}, +${p}% шанс крит. удара.` },
        { match: _P.traitAllyExistsDmg, replace: (m, tr, p) => `Если есть союзник-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p}% урона.` },
        { match: _P.applyProcMostInjuredTrait, replace: (m, pr, tr) => `Применяет ${pr} к самому раненому союзнику-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 7 patterns ---
        { match: _P.applyProcRandomTraitAlly, replace: (m, pr, tr) => `Применяет ${pr} к случайному союзнику-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.modeStatBoost, replace: (m, mode, p, stat) => `${_modeLoc(mode, 'ru')}: +${p} % ${stat}.` },
        { match: _P.ifAllyNoteAttackCant, replace: (m, name, what) => `Если ${name} — союзник, эту атаку невозможно ${what === 'dodged' ? 'уклонить' : what === 'blocked' ? 'заблокировать' : what === 'missed' ? 'промахнуть' : what}.` },
        { match: _P.statPerTraitAlly, replace: (m, p, stat, tr) => `+${p} % ${stat} за каждого союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.genEnergyForNamed, replace: (m, c, name) => `Генерирует +${c} энергии способности для ${name}.` },
        { match: _P.healRandomTraitAlly, replace: (m, tr, p) => `Исцеляет случайного союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} на ${p} % от макс. здоровья.` },
        { match: _P.targetHasStatBoost, replace: (m, proc, p, stat) => `Если у цели есть ${proc}, +${p} % ${stat}.` },
        { match: _P.flipNegToPosRandomTraitAlly, replace: (m, c, tr) => `Переворачивает ${c} негативных эффектов в позитивные у случайного союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.drainRedistribute, replace: (m, p, target) => `Высасывает ${p} % от макс. здоровья цели и перераспределяет союзникам-${_traitLoc(target, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.selfNotHasApplyAllies, replace: (m, proc, pr) => `Если у персонажа нет ${proc}, применяет ${pr} к союзникам.` },
        { match: _P.selfIsTraitDmg, replace: (m, tr, p) => `Если этот персонаж ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, +${p} % урона.` },
        { match: _P.healAllies, replace: (m, p) => `Исцеляет союзников на ${p} % от макс. здоровья.` },
        { match: _P.stealCountExcluding, replace: (m, c, excl) => `Крадёт ${c} положительных эффектов у основной цели, кроме ${excl}.` },
        { match: _P.onCritApplyMaxAllies, replace: (m, c, pr, max) => `При крит. ударе: применяет +${c} ${pr} к союзникам, до максимума ${max}.` },
        { match: _P.modeGenEnergyTraitAllies, replace: (m, mode, c, tr) => `${_modeLoc(mode, 'ru')}: генерирует +${c} энергии способности для союзников-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 8 ---
        { match: _P.ifTraitAlliesApplyProc, replace: (m, n, tr, pr) => `При ${n}+ союзниках-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}: применяет ${pr} к основной цели.` },
        { match: _P.ifTraitAlliesGain, replace: (m, n, tr, pr) => `При ${n}+ союзниках-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}: получает ${pr}.` },
        { match: _P.ifTraitAlliesDmg, replace: (m, n, tr, p) => `При ${n}+ союзниках-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}: +${p} % урона.` },
        { match: _P.ifTraitAlliesFlip, replace: (m, n, tr, c) => `При ${n}+ союзниках-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}: обращает ${c} положительных эффектов в отрицательные на основной цели.` },
        { match: _P.dmgPerEffectOnTarget, replace: (m, p, type) => `+${p} % урона за каждый ${type === 'positive' ? 'положительный' : 'отрицательный'} эффект на основной цели.` },
        { match: _P.reduceSpeedPerTraitAlly, replace: (m, p, tr) => `Снижает полоску скорости на ${p} % за каждого союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.targetHasGainSpeedBar, replace: (m, pr, p) => `Если у основной цели есть ${pr}: получает ${p} % полоски скорости.` },
        { match: _P.targetHasGenEnergy, replace: (m, pr, c) => `Если у основной цели есть ${pr}: генерирует +${c} энергии способности для всех союзников.` },
        { match: _P.targetHasFlipPos, replace: (m, pr, c) => `Если у основной цели есть ${pr}: обращает ${c} положительных эффектов в отрицательные на основной цели.` },
        { match: _P.targetNotHasApply, replace: (m, pr1, pr2) => `Если у основной цели нет ${pr1}: применяет ${pr2} к основной цели.` },
        { match: _P.otherwiseFlipPos, replace: (m, c) => `В противном случае: обращает ${c} положительных эффектов в отрицательные на основной цели.` },
        { match: _P.modeNoteAttackCant, replace: (m, mode, what) => `${_modeLoc(mode, 'ru')}: ${what === 'countered' ? 'от этой атаки нельзя контратаковать' : what === 'blocked' ? 'эту атаку нельзя заблокировать' : what === 'dodged' ? 'от этой атаки нельзя уклониться' : what}.` },
        // --- Batch 9 patterns ---
        { match: _P.barrierSelf, replace: (m, p) => `Барьер в ${p} % от макс. здоровья.` },
        { match: _P.prolongProcBy, replace: (m, pr, c) => `Продлевает длительность ${pr} на ${c}.` },
        { match: _P.notModeChanceApply, replace: (m, mode, ch, pr) => `${_notModeLoc(mode, 'ru')}: ${ch} % шанс применить ${pr} к основной цели.` },
        { match: _P.modeChanceGain, replace: (m, mode, ch, pr) => `${_modeLoc(mode, 'ru')}: ${ch} % шанс получить ${pr}.` },
        { match: _P.clearCountProcAllies, replace: (m, c, pr) => `Снимает ${c} ${pr} с союзников.` },
        { match: _P.applyProcToEnemies, replace: (m, pr, c) => `Применяет ${pr} к ${c} врагам.` },
        { match: _P.applyCountToEnemies, replace: (m, n, pr, c) => `Применяет ${n} ${pr} к ${c} врагам.` },
        { match: _P.applyProcDurToEnemies, replace: (m, pr, t, c) => `Применяет ${pr} на ${t} ходов к ${c} врагам.` },
        { match: _P.clearNegRandomTraitAlly, replace: (m, c, tr) => `Снимает ${c} отрицательных эффектов со случайного союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.clearNegMostInjuredTraitAlly, replace: (m, c, tr) => `Снимает ${c} отрицательных эффектов с наиболее раненого союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.onCritStealAllExcl, replace: (m, pr) => `При крит. ударе: крадёт все положительные эффекты у основной цели, кроме ${pr}.` },
        { match: _P.onAssistApplyMaxTarget, replace: (m, c, pr, max) => `При помощи: применяет +${c} ${pr}, до максимума ${max} к основной цели.` },
        { match: _P.copyPosGiveExcl, replace: (m, c, pr) => `Копирует ${c} положительных эффектов с основной цели и передаёт союзникам, кроме ${pr}.` },
        { match: _P.targetTraitGainProc, replace: (m, tr, pr) => `Если основная цель — ${tr}: получает ${pr}.` },
        { match: _P.flipPosNEnemies, replace: (m, c, n) => `Обращает ${c} положительных эффектов в отрицательные на ${n} врагах.` },
        { match: _P.barrierRandomTraitAlly, replace: (m, p, tr) => `Барьер в ${p} % от макс. здоровья случайному союзнику-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 10 ---
        { match: _P.piercingAdditional, replace: (m, p) => `+${p} % проникающего урона по дополнительным врагам.` },
        { match: _P.dmgPierceAdditional, replace: (m, d, p) => `+${d} % урона + ${p} % проникающего урона по дополнительным врагам.` },
        { match: _P.modeApplyPlusRandomAlly, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ru')}: применяет +${c} ${pr} на случайного союзника.` },
        { match: _P.drainAlliesHealth, replace: (m, p) => `Высасывает ${p} % от макс. здоровья союзников.` },
        { match: _P.ifAllyNoteCantMiss, replace: (m, ally) => `Если ${ally} союзник, эта атака не может промахнуться.` },
        { match: _P.targetHasAttackPierceInstead, replace: (m, proc, p) => `Если у основной цели есть ${proc}, атакует за ${p} % проникающего урона вместо этого.` },
        { match: _P.targetHasDrainRedistribute, replace: (m, proc, p, target) => `Если у основной цели есть ${proc}, высасывает ${p} % макс. здоровья цели и перераспределяет ${target}.` },
        { match: _P.modeOnCritClearNeg, replace: (m, mode, c) => `${_modeLoc(mode, 'ru')}: при крит. ударе снимает ${c} отрицательных эффектов с союзников.` },
        { match: _P.ifAllyStealAllGiveExcl, replace: (m, ally, pr) => `Если ${ally} союзник, крадёт все положительные эффекты у основной цели и передаёт союзникам, кроме ${pr}.` },
        { match: _P.applyProcToAllyHighest, replace: (m, pr, tr, stat) => `Применяет ${pr} на союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} с наибольшим ${stat}.` },
        { match: _P.applyProcRandomAllyBelowHealth, replace: (m, pr, p) => `Применяет ${pr} на случайного союзника ниже ${p} % здоровья.` },
        { match: _P.allAlliesHaveGainSpeedBar, replace: (m, proc, p) => `Если у всех союзников есть ${proc}: получает ${p} % шкалы скорости.` },
        { match: _P.targetHasStealCountExcl, replace: (m, proc, c, pr) => `Если у основной цели есть ${proc}, крадёт ${c} положительных эффектов у основной цели, кроме ${pr}.` },
        { match: _P.selfHasLessThanApplyMaxAllies, replace: (m, n, proc, c, pr, max) => `Если менее ${n} ${proc}, применяет +${c} ${pr}, до максимума ${max} на союзников.` },
        { match: _P.targetTraitApplyProcAllyHighest, replace: (m, tr, pr, stat) => `Если основная цель — ${tr}, применяет ${pr} на союзника с наибольшим ${stat}.` },
        { match: _P.modeIfTraitAlliesStealProc, replace: (m, mode, c, tr, proc) => `${_modeLoc(mode, 'ru')}: если ${c}+ союзников-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, крадёт ${proc} у основной цели и передаёт союзникам.` },
        // --- Batch 11 ---
        { match: _P.targetHasPosClearPos, replace: (m, c) => `Если у основной цели есть положительные эффекты, снимает ${c} положительных эффектов с основной цели.` },
        { match: _P.modeSubTargetHasDrain, replace: (m, mode, sub, proc, p) => `${_modeLoc(mode, 'ru')}, ${sub}: если у основной цели есть ${proc}, высасывает ${p} % макс. здоровья цели.` },
        { match: _P.modeSubReduceDur, replace: (m, mode, sub, proc, c) => `${_modeLoc(mode, 'ru')}, ${sub}: снижает длительность ${proc} на ${c}.` },
        { match: _P.modeApplyPlusRandomAllyExclSelf, replace: (m, mode, c, pr) => `${_modeLoc(mode, 'ru')}: применяет +${c} ${pr} на случайного союзника (кроме себя).` },
        { match: _P.modeOrSubClearNegRandomTraitAlly, replace: (m, m1, m2, sub, c, tr) => `${_modeLoc(m1, 'ru')} или ${_modeLoc(m2, 'ru')}, ${sub}: снимает ${c} отрицательных эффектов со случайного союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.selfHasClearPos, replace: (m, proc, c) => `Если есть ${proc}, снимает ${c} положительных эффектов с основной цели.` },
        { match: _P.selfNotHasFlipPos, replace: (m, proc, c) => `Если нет ${proc}, обращает ${c} положительных эффектов в отрицательные на основной цели.` },
        { match: _P.selfHasClearNegSelf, replace: (m, proc) => `Если есть ${proc}, снимает все отрицательные эффекты с себя.` },
        { match: _P.selfHasClearCountFromSelf, replace: (m, proc, c, pr) => `Если есть ${proc}, снимает ${c} ${pr} с себя.` },
        { match: _P.targetHasClearAllProc, replace: (m, proc, pr) => `Если у основной цели есть ${proc}, снимает все ${pr} с основной цели.` },
        { match: _P.onAssistTargetHasClearAllProc, replace: (m, proc, pr) => `При помощи: если у основной цели есть ${proc}, снимает все ${pr} с основной цели.` },
        { match: _P.targetTraitApplyCountDur, replace: (m, tr, c, pr, t) => `Если основная цель — ${tr}: применяет ${c} ${pr} на ${t} ходов к основной цели.` },
        { match: _P.targetTraitApplyCount, replace: (m, tr, c, pr) => `Если основная цель — ${tr}: применяет ${c} ${pr} к основной цели.` },
        { match: _P.onCritBarrierAllies, replace: (m, p) => `При крит. ударе: барьер в ${p} % от макс. здоровья для союзников.` },
        { match: _P.ifTraitAlliesCritChance, replace: (m, c, tr, p) => `Если ${c}+ союзников-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}: +${p} % шанса крит. удара.` },
        { match: _P.ifTraitAlliesCritPerAlly, replace: (m, c, tr, p, tr2) => `Если ${c}+ союзников-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}: +${p} % шанса крит. удара за каждого союзника-${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)}.` },
        // --- Batch 12 ---
        { match: _P.onCritGenEnergyRandomAlly, replace: (m, c) => `При крит. ударе: генерирует +${c} энергию способности для случайного союзника.` },
        { match: _P.onCounterOnCritGenEnergy, replace: (m, c) => `При контратаке, при крит. ударе: генерирует +${c} энергию способности для случайного союзника.` },
        { match: _P.removeBarrierTarget, replace: () => `Снимает барьер с основной цели.` },
        { match: _P.modeSubFlipNegToPosAllies, replace: (m, mode, sub) => `${_modeLoc(mode, 'ru')}, ${sub}: обращает все отрицательные эффекты в положительные на союзниках.` },
        { match: _P.modeSubTargetNotTraitDrain, replace: (m, mode, sub, tr, p) => `${_modeLoc(mode, 'ru')}, ${sub}: если основная цель не ${tr}, высасывает ${p} % макс. здоровья цели.` },
        { match: _P.targetNotHasClearPos, replace: (m, proc, c) => `Если у основной цели нет ${proc}, снимает ${c} положительных эффектов с основной цели.` },
        { match: _P.selfHasGainSpeedBar, replace: (m, proc, p) => `Если есть ${proc}: получает ${p} % шкалы скорости.` },
        { match: _P.selfHasGainCount, replace: (m, proc, c, pr) => `Если есть ${proc}: получает ${c} ${pr}.` },
        { match: _P.healTarget, replace: (m, p) => `Исцеляет основную цель на ${p} % от макс. здоровья.` },
        { match: _P.ifAllyApplyCount, replace: (m, ally, c, pr) => `Если ${ally} союзник: применяет ${c} ${pr} к основной цели.` },
        { match: _P.notModeChanceGain, replace: (m, mode, p, pr) => `${_notModeLoc(mode, 'ru')}: ${p} % шанс получить ${pr}.` },
        { match: _P.ifAllyDmgPierce, replace: (m, ally, d, p) => `Если ${ally} союзник: +${d} % урона + ${p} % проникающего урона.` },
        { match: _P.ifAllyApplyDur, replace: (m, ally, pr, t) => `Если ${ally} союзник: применяет ${pr} на ${t} ходов к основной цели.` },
        { match: _P.selfIsTraitApplyProc, replace: (m, tr, pr) => `Если является ${tr}: применяет ${pr} к основной цели.` },
        { match: _P.selfNotTraitApplyProc, replace: (m, tr, pr) => `Если не является ${tr}: применяет ${pr} к основной цели.` },
        { match: _P.targetTraitApplyProc, replace: (m, tr, pr) => `Если основная цель — ${tr}: применяет ${pr} к основной цели.` },
        // --- Batch 13 ---
        { match: _P.targetTraitOrApplyCountDurInjured, replace: (m, tr1, tr2, c, pr, t) => `Если основная цель — ${tr1} или ${tr2}: применяет ${c} ${pr} на ${t} ходов к самому раненому союзнику.` },
        { match: _P.onAssistModeOnCritApply, replace: (m, mode, pr) => `При помощи, ${_modeLoc(mode, 'ru')}: при крит. ударе применяет ${pr} к основной цели.` },
        { match: _P.otherwiseSelfOrTargetHasCrit, replace: (m, tr, proc, p) => `Иначе, если является ${tr} или у цели есть ${proc}: +${p} % шанса крит. удара.` },
        { match: _P.healthOrChargedDmg, replace: (m, hp, proc, d) => `Если здоровье ${hp} % или менее или есть ${proc}: +${d} % урона.` },
        { match: _P.applyDurTraitAllyLowest, replace: (m, pr, t, tr, stat) => `Применяет ${pr} на ${t} ходов к союзнику-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} с наименьшим ${stat}.` },
        { match: _P.otherwiseTargetHasApplyAllies, replace: (m, proc, c, pr) => `Иначе, если у основной цели есть ${proc}: применяет +${c} ${pr} на союзников.` },
        { match: _P.modeIfTraitAlliesCallHighest, replace: (m, mode, c, tr, tr2, stat) => `${_modeLoc(mode, 'ru')}: если ${c}+ союзников-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, призывает союзника-${_traitLoc(tr2, SENTENCE_TEMPLATES._activeDict)} с наибольшим ${stat} на помощь.` },
        { match: _P.modeOnAssistTypeGenTraitAlly, replace: (m, mode, type, c, tr) => `${_modeLoc(mode, 'ru')}: при ${type}-помощи генерирует +${c} энергию способности для случайного союзника-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.selfHasProcCritPerTraitOrAlly, replace: (m, proc, p, tr1, tr2) => `Если есть ${proc}: +${p} % шанса крит. удара за каждого союзника ${tr1} или ${tr2}.` },
        { match: _P.modeHealthReduceDurRandomTraitAlly, replace: (m, mode, hp, c, tr) => `${_modeLoc(mode, 'ru')}: если здоровье больше ${hp} %, снижает длительность отрицательных эффектов на ${c} на случайном союзнике-${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}.` },
        { match: _P.targetHasAndHasRemoveBarrier, replace: (m, p1, p2) => `Если у основной цели есть ${p1} и ${p2}: снимает барьер с основной цели.` },
        { match: _P.selfHasCountAnyEnemyFlip, replace: (m, c, proc, n) => `Если ${c}+ ${proc} и у врага есть положительные эффекты: обращает ${n} положительных эффектов в отрицательные на основной цели.` },
        { match: _P.selfLessCountAnyEnemyFlip, replace: (m, c, proc, n) => `Если менее ${c} ${proc} и у врага есть положительные эффекты: обращает ${n} положительных эффектов в отрицательные на основной цели.` },
        { match: _P.modeOnCritProlongNegExcl, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'ru')}: при крит. ударе продлевает длительность всех отрицательных эффектов, кроме ${pr}, на ${c}.` },
        { match: _P.modeOnCritProlongProc, replace: (m, mode, pr, c) => `${_modeLoc(mode, 'ru')}: при крит. ударе продлевает длительность ${pr} на ${c}.` },
        { match: _P.modeBarrierRandomAlly, replace: (m, mode, p) => `${_modeLoc(mode, 'ru')}: барьер в ${p} % от макс. здоровья случайному союзнику.` },
        // --- Batch 14 ---
        { match: _P.modeEnergyFullOnCritGenRandomAlly, replace: (m, mode, c) => `${_modeLoc(mode, 'ru')}: если энергия способности полная, при крит. ударе, создаёт +${c} энергию способности для случайного союзника.` },
        { match: _P.modeEnergyFullOnCritGenSelf, replace: (m, mode, c) => `${_modeLoc(mode, 'ru')}: если энергия способности полная, при крит. ударе, создаёт +${c} энергию способности для себя.` },
        { match: _P.healthLessThanDrain, replace: (m, hp, d) => `Если у этого персонажа менее ${hp}% здоровья, +${d}% вампиризма.` },
        { match: _P.healthOrMoreApplyDurTarget, replace: (m, hp, pr, t) => `Если у этого персонажа ${hp}% или более здоровья, применяет ${pr} на ${t} ходов к основной цели.` },
        { match: _P.barrierOrMoreApplyDurAllies, replace: (m, bp, pr, t) => `Если у этого персонажа ${bp}% или более барьера, применяет ${pr} на ${t} ходов к союзникам.` },
        { match: _P.barrierOrMoreGainDur, replace: (m, bp, pr, t) => `Если у этого персонажа ${bp}% или более барьера, получает ${pr} на ${t} ходов.` },
        { match: _P.onTypeAssistGenAllAllies, replace: (m, type, c) => `При ${type} поддержке, создаёт +${c} энергию способности для всех союзников.` },
        { match: _P.onTypeAssistGenChar, replace: (m, type, c, ch) => `При ${type} поддержке, создаёт +${c} энергию способности для ${ch}.` },
        { match: _P.ifNotFacingApplyTarget, replace: (m, ch, pr) => `Если не сражается с ${ch}, применяет ${pr} к основной цели.` },
        { match: _P.targetTraitApplyInjuredAlly, replace: (m, tr, pr) => `Если основная цель — ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, применяет ${pr} к наиболее раненому союзнику.` },
        { match: _P.copyAllGiveAlliesExclTwo, replace: (m, pr1, pr2) => `Копирует все положительный(е) эффект(ы) основной цели и передаёт союзникам, кроме ${pr1} и ${pr2}.` },
        { match: _P.noteCantCritHit, replace: () => `Эта атака не может нанести критический удар.` },
        { match: _P.modeApplyAllies, replace: (m, mode, pr) => `${_modeLoc(mode, 'ru')}: применяет ${pr} к союзникам.` },
        { match: _P.targetTraitApplyCountMaxInjured, replace: (m, tr, c, pr, mx) => `Если основная цель — ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, применяет +${c} ${pr}, до максимума ${mx} к наиболее раненому союзнику.` },
        { match: _P.modeGenEnergyChar, replace: (m, mode, c, ch) => `${_modeLoc(mode, 'ru')}: создаёт +${c} энергию способности для ${ch}.` },
        { match: _P.targetTraitApplyInjuredWithout, replace: (m, tr, pr, pr2) => `Если основная цель — ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)}, применяет ${pr} к наиболее раненому союзнику без ${pr2}.` },
        { match: _P.modeHealRandomTraitAlly, replace: (m, mode, tr, hp) => `${_modeLoc(mode, 'ru')}: исцеляет случайного союзника ${_traitLoc(tr, SENTENCE_TEMPLATES._activeDict)} на ${hp}% от макс. здоровья.` },
        { match: _P.selfHasOrLessApplyMaxAllies, replace: (m, c, pr, c2, pr2, mx) => `Если у персонажа ${c} или менее ${pr}, применяет +${c2} ${pr2}, до максимума ${mx} к союзникам.` },
        { match: _P.selfHasProcChanceApplyTarget, replace: (m, pr, pct, pr2) => `Если у персонажа ${pr}, ${pct}% шанс применить ${pr2} к основной цели.` },
        { match: _P.otherwiseSelfHasChanceGain, replace: (m, pr, pct, pr2) => `В противном случае, если у персонажа ${pr}, ${pct}% шанс получить ${pr2}.` },
        { match: _P.otherwiseSelfHasHealInjured, replace: (m, pr, hp) => `В противном случае, если у персонажа ${pr}, исцеляет наиболее раненого союзника на ${hp}% от макс. здоровья.` },
      ],
    },
  };

  // Apply sentence-level templates if available, falling back to find-and-replace
  function localizeEffect(text, lang, dict) {
    const templates = SENTENCE_TEMPLATES[lang];
    if (templates && templates.patterns) {
      // Make dict available to template replace functions for inline lookups
      SENTENCE_TEMPLATES._activeDict = dict;
      for (const p of templates.patterns) {
        const match = text.match(p.match);
        if (match) {
          let result = p.replace(...match);
          // Also apply dictionary for any remaining terms (trait names, proc names)
          return localizeText(result, dict);
        }
      }
    }
    // Fallback: simple find-and-replace
    return localizeText(text, dict);
  }

  // Format the damage line
  function formatDamageLine(data, lang) {
    const templates = SENTENCE_TEMPLATES[lang];
    if (templates && templates.damageLine) {
      return templates.damageLine(data.damage, data.piercing, data.drain);
    }
    const parts = [];
    if (data.damage > 0) {
      parts.push(`<span class="msf-iso8-damage-value">${data.damage}%</span> Damage`);
    }
    if (data.piercing > 0) {
      parts.push(`<span class="msf-iso8-piercing-value">${data.piercing}%</span> Piercing`);
    }
    if (data.drain > 0) {
      parts.push(`<span class="msf-iso8-drain-value">${data.drain}%</span> Drain`);
    }
    return parts.length > 0 ? parts.join(' + ') : null;
  }

  // Create the ISO-8 info panel
  function createIso8Panel(charId, data, dict, lang) {
    const container = document.createElement('div');
    container.className = 'msf-iso8-container';
    container.id = 'msf-iso8-panel';

    const t = (text) => localizeEffect(text, lang, dict);
    activeLocaleDict = dict;

    const templates = SENTENCE_TEMPLATES[lang];
    const title = (templates && templates.title) || 'ISO-8 Counter/Assist';

    let effectsHtml = '';
    if (data.effects && data.effects.length > 0) {
      const effectItems = data.effects.map(effect => {
        const effectClass = classifyEffect(effect);
        const formattedEffect = formatEffectText(t(effect));
        return `<li class="msf-iso8-effect-item ${effectClass}">${formattedEffect}</li>`;
      }).join('');
      effectsHtml = `<ul class="msf-iso8-effects-list">${effectItems}</ul>`;
    }

    let notesHtml = '';
    if (data.notes && data.notes.length > 0) {
      const noteItems = data.notes.map(note => {
        return `<li class="msf-iso8-note-item">${t(note)}</li>`;
      }).join('');
      notesHtml = `<ul class="msf-iso8-notes-list">${noteItems}</ul>`;
    }

    const damageLine = formatDamageLine(data, lang);
    const damageHtml = damageLine
      ? (templates && templates.damageLine
        ? `<div class="msf-iso8-damage-line">${damageLine}</div>`
        : `<div class="msf-iso8-damage-line">⚔️ Attack primary target for ${damageLine}</div>`)
      : '';

    container.innerHTML = `
      <div class="msf-iso8-header">
        ${ISO8_ICON_SVG}
        <h3 class="msf-iso8-title">${title}</h3>
        <button class="msf-iso8-close-btn" aria-label="Close ISO-8 Panel">×</button>
      </div>
      <div class="msf-iso8-content">
        ${damageHtml}
        ${effectsHtml}
        ${notesHtml}
      </div>
    `;

    // Add close button functionality
    const closeBtn = container.querySelector('.msf-iso8-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        container.remove();
      });
    }

    return container;
  }

  // Create not found panel
  function createNotFoundPanel(charId) {
    const container = document.createElement('div');
    container.className = 'msf-iso8-container';
    container.id = 'msf-iso8-panel';
    
    // Header
    const headerDiv = document.createElement('div');
    headerDiv.className = 'msf-iso8-header';
    headerDiv.innerHTML = `${ISO8_ICON_SVG}<h3 class="msf-iso8-title">ISO-8 Counter/Assist</h3><button class="msf-iso8-close-btn" aria-label="Close ISO-8 Panel">×</button>`;
    
    // Message (Safe Text)
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msf-iso8-not-found';
    msgDiv.textContent = `No ISO-8 Counter/Assist data found for "${charId}"`;
    
    container.appendChild(headerDiv);
    container.appendChild(msgDiv);

    // Add close button functionality
    const closeBtn = headerDiv.querySelector('.msf-iso8-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        container.remove();
      });
    }

    return container;
  }

  // Find the best insertion point on the page
  function findInsertionPoint() {
    const selectors = [
      '.character-detail',
      '.character-stats',
      '.character-info',
      '.character-container',
      'main',
      '.main-content',
      '[class*="character"]',
      'article',
      '.content'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return document.body;
  }

  // Main function to inject ISO-8 info
  async function injectIso8Info() {
    if (document.getElementById('msf-iso8-panel')) return;

    const charId = getCharacterIdFromUrl();
    if (!charId) return;

    const lang = getLanguageFromUrl();
    console.log('MSF ISO-8: Looking up data for', charId, '(lang:', lang + ')');

    const iso8Data = await loadIso8Data();
    if (!iso8Data) {
      console.error('MSF ISO-8: Data unavailable');
      return;
    }

    // Load locale dictionary for non-English pages
    let dict = null;
    if (lang !== 'en') {
      const allLocales = await loadLocaleData();
      dict = allLocales[lang] || null;
      if (dict) {
        console.log('MSF ISO-8: Loaded', Object.keys(dict).length, 'translations for', lang);
      } else {
        console.log('MSF ISO-8: No translations available for', lang);
      }
    }

    const data = iso8Data[charId];
    let panel;

    if (data) {
      console.log('MSF ISO-8: Found data for', charId);
      panel = createIso8Panel(charId, data, dict, lang);
    } else {
      // Fuzzy matching
      const variations = [
        charId,
        charId.toLowerCase(),
        charId.toUpperCase(),
        charId.replace(/([A-Z])/g, ' $1').trim().replace(/ /g, ''),
        charId.replace(/-/g, ''),
        charId.replace(/_/g, '')
      ];

      let foundData = null;
      let foundKey = null;

      for (const variant of variations) {
        // Iterate through keys in fetched data
        const key = Object.keys(iso8Data).find(k => k.toLowerCase() === variant.toLowerCase());
        if (key) {
           foundData = iso8Data[key];
           foundKey = key;
           break;
        }
      }

      if (foundData) {
        console.log('MSF ISO-8: Found data for', foundKey, '(matched from', charId, ')');
        panel = createIso8Panel(foundKey, foundData, dict, lang);
      } else {
        console.log('MSF ISO-8: No data found for', charId);
        panel = createNotFoundPanel(charId);
      }
    }

    const insertionPoint = findInsertionPoint();
    if (insertionPoint.firstChild) {
      insertionPoint.insertBefore(panel, insertionPoint.firstChild);
    } else {
      insertionPoint.appendChild(panel);
    }
  }

  // Run when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectIso8Info);
  } else {
    setTimeout(injectIso8Info, 500);
  }

  // Dynamic navigation observer (Polling is lighter than MutationObserver for URL changes)
  let lastUrl = location.href;
  setInterval(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      const existingPanel = document.getElementById('msf-iso8-panel');
      if (existingPanel) existingPanel.remove();
      setTimeout(injectIso8Info, 500);
    }
  }, 500);

})();
