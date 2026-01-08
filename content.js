// MSF ISO-8 Counter/Assist Viewer - Content Script

(function() {
  'use strict';

  // Extract character ID from URL
  function getCharacterIdFromUrl() {
    const path = window.location.pathname;
    const match = path.match(/\/characters\/([^\/\?#]+)/);
    return match ? match[1] : null;
  }

  // Classify effect for styling
  function classifyEffect(effect) {
    const lowerEffect = effect.toLowerCase();
    if (lowerEffect.includes('in war')) return 'war-effect';
    if (lowerEffect.includes('in raid')) return 'raid-effect';
    if (lowerEffect.includes('in crucible')) return 'crucible-effect';
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

    // Style "X% of Max Health" (for barrier, etc.)
    text = text.replace(/(\d+)% of Max Health/g,
      '<span class="msf-iso8-health-pct-value">$1%</span> of Max Health');

    // Style "Clear X positive/negative" counts
    text = text.replace(/Clear (\d+) (positive|negative)/g,
      'Clear <span class="msf-iso8-count-value">$1</span> $2');

    // Style "+X Deflect" or "gain +X"
    text = text.replace(/\+(\d+) (Deflect|Counter|Evade|Charged)/g,
      '+<span class="msf-iso8-stack-value">$1</span> $2');

    // Style game mode indicators (WAR, CRUCIBLE, RAID, ARENA, OFFENSE, DEFENSE)
    // Process longer patterns FIRST to avoid partial matches
    // "On CRUCIBLE OFFENSE" -> "On" + colored "CRUCIBLE OFFENSE"
    text = text.replace(/\b(On|In) (CRUCIBLE OFFENSE|CRUCIBLE DEFENSE|WAR OFFENSE|WAR DEFENSE|RAID OFFENSE|RAID DEFENSE)\b/gi,
      '$1 <span class="msf-iso8-game-mode">$2</span>');
    // Then handle simple "In WAR", "In CRUCIBLE" etc (only if not already matched)
    text = text.replace(/\b(In|On) (WAR|RAID|CRUCIBLE|ARENA)\b(?! (OFFENSE|DEFENSE))/gi,
      '$1 <span class="msf-iso8-game-mode">$2</span>');

    // Style status effects (buffs and debuffs)
    const statusEffects = [
      'Bleed', 'Regeneration', 'Blind', 'Charged', 'Defense Up', 'Defense Down',
      'Offense Up', 'Offense Down', 'Speed Up', 'Slow', 'Stun', 'Heal Block',
      'Ability Block', 'Stealth', 'Taunt', 'Evade', 'Deflect', 'Counter',
      'Vulnerable', 'Exposed', 'Disrupted', 'Trauma', 'Immunity', 'Safeguard',
      'Deathproof', 'Revive Once', 'Barrier', 'Empowered', 'Crit Chance Up',
      'Crit Damage Up', 'Assist Now', 'Minor Defense Up', 'Minor Offense Up',
      'Minor Regeneration'
    ];

    // Create regex pattern for status effects (case insensitive, word boundaries)
    const statusPattern = new RegExp(`\\b(${statusEffects.join('|')})\\b`, 'gi');
    text = text.replace(statusPattern, '<span class="msf-iso8-status-effect">$1</span>');

    return text;
  }

  // Format the damage line
  function formatDamageLine(data) {
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
  function createIso8Panel(charId, data) {
    const container = document.createElement('div');
    container.className = 'msf-iso8-container';
    container.id = 'msf-iso8-panel';

    // SVG icon for ISO-8
    const iso8Icon = `<svg class="msf-iso8-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#e94560"/>
      <path d="M2 17L12 22L22 17" stroke="#e94560" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2 12L12 17L22 12" stroke="#e94560" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    let effectsHtml = '';
    if (data.effects && data.effects.length > 0) {
      const effectItems = data.effects.map(effect => {
        const effectClass = classifyEffect(effect);
        const formattedEffect = formatEffectText(effect);
        return `<li class="msf-iso8-effect-item ${effectClass}">${formattedEffect}</li>`;
      }).join('');
      effectsHtml = `<ul class="msf-iso8-effects-list">${effectItems}</ul>`;
    }

    let notesHtml = '';
    if (data.notes && data.notes.length > 0) {
      const noteItems = data.notes.map(note => {
        return `<li class="msf-iso8-note-item">${note}</li>`;
      }).join('');
      notesHtml = `<ul class="msf-iso8-notes-list">${noteItems}</ul>`;
    }

    const damageLine = formatDamageLine(data);
    const damageHtml = damageLine
      ? `<div class="msf-iso8-damage-line">⚔️ Attack primary target for ${damageLine}</div>`
      : '';

    container.innerHTML = `
      <div class="msf-iso8-header">
        ${iso8Icon}
        <h3 class="msf-iso8-title">ISO-8 Counter/Assist</h3>
      </div>
      <div class="msf-iso8-content">
        ${damageHtml}
        ${effectsHtml}
        ${notesHtml}
      </div>
    `;

    return container;
  }

  // Create not found panel
  function createNotFoundPanel(charId) {
    const container = document.createElement('div');
    container.className = 'msf-iso8-container';
    container.id = 'msf-iso8-panel';

    container.innerHTML = `
      <div class="msf-iso8-header">
        <h3 class="msf-iso8-title">ISO-8 Counter/Assist</h3>
      </div>
      <div class="msf-iso8-not-found">
        No ISO-8 Counter/Assist data found for "${charId}"
      </div>
    `;

    return container;
  }

  // Find the best insertion point on the page
  function findInsertionPoint() {
    // Try to find common containers on the MSF character page
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

    // Fallback to body
    return document.body;
  }

  // Main function to inject ISO-8 info
  function injectIso8Info() {
    // Check if already injected
    if (document.getElementById('msf-iso8-panel')) {
      return;
    }

    const charId = getCharacterIdFromUrl();
    if (!charId) {
      console.log('MSF ISO-8: Could not extract character ID from URL');
      return;
    }

    console.log('MSF ISO-8: Looking up data for', charId);

    // Look up character data (ISO8_DATA is loaded from iso8_data.js)
    if (typeof ISO8_DATA === 'undefined') {
      console.error('MSF ISO-8: Data not loaded');
      return;
    }

    const data = ISO8_DATA[charId];
    let panel;

    if (data) {
      console.log('MSF ISO-8: Found data for', charId);
      panel = createIso8Panel(charId, data);
    } else {
      // Try case variations
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
        for (const key in ISO8_DATA) {
          if (key.toLowerCase() === variant.toLowerCase()) {
            foundData = ISO8_DATA[key];
            foundKey = key;
            break;
          }
        }
        if (foundData) break;
      }

      if (foundData) {
        console.log('MSF ISO-8: Found data for', foundKey, '(matched from', charId, ')');
        panel = createIso8Panel(foundKey, foundData);
      } else {
        console.log('MSF ISO-8: No data found for', charId);
        panel = createNotFoundPanel(charId);
      }
    }

    // Find insertion point and add panel
    const insertionPoint = findInsertionPoint();

    // Insert at the top of the content area
    if (insertionPoint.firstChild) {
      insertionPoint.insertBefore(panel, insertionPoint.firstChild);
    } else {
      insertionPoint.appendChild(panel);
    }

    console.log('MSF ISO-8: Panel injected successfully');
  }

  // Run when page is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectIso8Info);
  } else {
    // Small delay to ensure page content is loaded
    setTimeout(injectIso8Info, 500);
  }

  // Also watch for dynamic navigation (SPA behavior)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // Remove existing panel
      const existingPanel = document.getElementById('msf-iso8-panel');
      if (existingPanel) {
        existingPanel.remove();
      }
      // Re-inject for new page
      setTimeout(injectIso8Info, 500);
    }
  }).observe(document, { subtree: true, childList: true });

})();
