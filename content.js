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
