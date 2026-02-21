// MSF ISO-8 Counter/Assist Viewer - Content Script

(function() {
  'use strict';

  const DATA_URL = 'https://raw.githubusercontent.com/netsecprogrammer/msf-iso8-chrome-extension/master/iso8_data.json';

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

    // Style game mode indicators (WAR, CRUCIBLE, RAID, ARENA, OFFENSE, DEFENSE)
    text = text.replace(/\b(On|In) (CRUCIBLE OFFENSE|CRUCIBLE DEFENSE|WAR OFFENSE|WAR DEFENSE|RAID OFFENSE|RAID DEFENSE)\b/gi,
      '$1 <span class="msf-iso8-game-mode">$2</span>');
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
    
    // Safer innerHTML usage: construct header then append text node
    const headerDiv = document.createElement('div');
    headerDiv.className = 'msf-iso8-header';
    headerDiv.innerHTML = '<h3 class="msf-iso8-title">ISO-8 Counter/Assist</h3>';
    
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msf-iso8-not-found';
    msgDiv.textContent = `No ISO-8 Counter/Assist data found for "${charId}"`;
    
    container.appendChild(headerDiv);
    container.appendChild(msgDiv);

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

    console.log('MSF ISO-8: Looking up data for', charId);

    const iso8Data = await loadIso8Data();
    if (!iso8Data) {
      console.error('MSF ISO-8: Data unavailable');
      return;
    }

    const data = iso8Data[charId];
    let panel;

    if (data) {
      console.log('MSF ISO-8: Found data for', charId);
      panel = createIso8Panel(charId, data);
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
        panel = createIso8Panel(foundKey, foundData);
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
