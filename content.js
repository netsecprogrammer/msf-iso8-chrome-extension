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
    fr: { 'WAR, OFFENSE': 'En attaque de guerre', 'RAID or WAR': 'En raid ou en guerre', 'RAID': 'En raid', 'WAR': 'En guerre', 'ARENA OFFENSE': "En attaque d'arène", 'Ultimate': 'ultime' },
    de: { 'WAR, OFFENSE': 'Bei KRIEGSOFFENSIVE', 'RAID or WAR': 'In RAUBZÜGEN oder im KRIEG', 'RAID': 'In RAUBZÜGEN', 'WAR': 'Im KRIEG', 'ARENA OFFENSE': 'Bei ARENAOFFENSIVE', 'Ultimate': 'ultimative' },
    es: { 'WAR, OFFENSE': 'Al atacar en guerras', 'RAID or WAR': 'En incursiones o guerras', 'RAID': 'En las incursiones', 'WAR': 'En guerras', 'ARENA OFFENSE': 'En ataque de arena', 'Ultimate': 'definitiva' },
    pt: { 'WAR, OFFENSE': 'Na GUERRA OFENSIVA', 'RAID or WAR': 'Nas INCURSÕES ou GUERRA', 'RAID': 'Nas INCURSÕES', 'WAR': 'Na GUERRA', 'ARENA OFFENSE': 'Na ARENA OFENSIVA', 'Ultimate': 'suprema' },
    it: { 'WAR, OFFENSE': 'In ATTACCO BELLICO', 'RAID or WAR': 'Negli ASSALTI o in GUERRA', 'RAID': 'Negli ASSALTI', 'WAR': 'In GUERRA', 'ARENA OFFENSE': "In ATTACCO nell'ARENA", 'Ultimate': 'suprema' },
    ja: { 'WAR, OFFENSE': '戦争攻撃時', 'RAID or WAR': 'レイドまたは戦争では', 'RAID': 'レイドでは', 'WAR': '戦争では', 'ARENA OFFENSE': 'アリーナ攻撃時', 'Ultimate': '最強' },
    ko: { 'WAR, OFFENSE': '전쟁 공격 시', 'RAID or WAR': '레이드 또는 전쟁에서', 'RAID': '레이드에서', 'WAR': '전쟁에서', 'ARENA OFFENSE': '아레나 공격 시', 'Ultimate': '필살' },
    ru: { 'WAR, OFFENSE': 'Во время АТАКИ НА ВОЙНЕ', 'RAID or WAR': 'В РЕЙДАХ или НА ВОЙНЕ', 'RAID': 'В РЕЙДАХ', 'WAR': 'НА ВОЙНЕ', 'ARENA OFFENSE': 'Во время АТАКИ НА АРЕНЕ', 'Ultimate': 'мощной' },
  };
  function _modeLoc(mode, lang) {
    return (_modeMap[lang] && _modeMap[lang][mode]) || mode;
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
