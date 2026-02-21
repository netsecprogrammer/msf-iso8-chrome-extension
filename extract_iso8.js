const fs = require('fs');
const path = require('path');

// Path to the game data file (Absolute path provided by user)
const CHARACTERS_JSON_PATH = '<path_to_characters.json>';
const OUTPUT_PATH = 'iso8_data.json';

// Helper to get max value from array or number
function getMax(val) {
  if (Array.isArray(val)) {
    return val[val.length - 1];
  }
  return val || 0;
}

// Map internal proc names to display names
const PROC_MAP = {
  'DefenseDown': 'Defense Down',
  'DefenseUp': 'Defense Up',
  'OffenseDown': 'Offense Down',
  'OffenseUp': 'Offense Up',
  'SpeedUp': 'Speed Up',
  'Slow': 'Slow',
  'Stun': 'Stun',
  'Bleed': 'Bleed',
  'HealBlock': 'Heal Block',
  'AbilityBlock': 'Ability Block',
  'Taunt': 'Taunt',
  'Stealth': 'Stealth',
  'Regeneration': 'Regeneration',
  'Counter': 'Counter',
  'Evade': 'Evade',
  'Deflect': 'Deflect',
  'Deathproof': 'Deathproof',
  'Vulnerable': 'Vulnerable',
  'Disrupted': 'Disrupted',
  'Immunity': 'Immunity',
  'Trauma': 'Trauma',
  'Safeguard': 'Safeguard',
  'Charged': 'Charged',
  'ReviveOnce': 'Revive Once',
  'Barrier': 'Barrier',
  'Blind': 'Blind',
  'DoT': 'Bleed',
  'LockedBuff': 'Trauma',
  'LockedDebuff': 'Safeguard',
  'Exposed': 'Exposed',
  'BuffBlock': 'Disrupted'
};

function formatProcName(proc) {
  return PROC_MAP[proc] || proc;
}

function processCharacter(charName, charData) {
  const safety = charData.safety;
  if (!safety) return null;

  let damage = 0;
  let piercing = 0;
  let drain = 0;
  const effects = [];
  const notes = [];

  // Iterate actions
  if (safety.actions) {
    safety.actions.forEach(action => {
      // 1. Stats (Damage/Piercing)
      if (action.stat_modifier) {
        action.stat_modifier.forEach(mod => {
          if (mod.stat === 'ability_damage_pct') {
            damage = getMax(mod.delta);
          } else if (mod.stat === 'armor_pierce_pct') {
            piercing = getMax(mod.delta);
          } else if (mod.stat === 'drain_pct') {
            drain = getMax(mod.delta);
          }
        });
      }

      // 2. Procs (Apply Status)
      if (action.action === 'proc' && action.procs) {
        action.procs.forEach(p => {
          const procName = formatProcName(p.proc);
          const count = getMax(p.use_count) || 1;
          const countStr = count > 1 ? ` ${count}` : '';
          
          let effectText = `Apply${countStr} ${procName}`;
          if (action.target && action.target.relation === 'ally') {
             effectText += ` to ${action.target.limit === 1 ? 'self' : 'allies'}`;
          } else {
             effectText += ` to the primary target`;
          }
          effects.push(effectText + '.');
        });
      }

      // 3. Proc Remove (Clear Status)
      if (action.action === 'proc_remove') {
        const procName = formatProcName(action.procs);
        const count = getMax(action.count) || 1;
        effects.push(`Clear ${procName} from the primary target.`);
      }

      // 4. Proc Flip
      if (action.action === 'proc_flip') {
        effects.push(`Flip positive effects to negative on primary target.`);
      }
      
      // 5. Health Redistribute
      if (action.action === 'health_redistribute') {
          effects.push(`Redistribute health.`);
      }
      
      // 6. Heal
      if (action.action === 'heal') {
          const healPct = getMax(action.heal_pct);
          if (healPct > 0) {
              effects.push(`Heal for ${healPct}% of Max Health.`);
          }
      }

      // 7. Transfer (Steal/Copy)
      if (action.action === 'proc_transfer') {
          const count = getMax(action.count) || 1;
          const transferPct = getMax(action.transferpct) || 0; // 100 = Steal, 0 = Copy? Or removepct determines steal
          const removePct = getMax(action.removepct) || 0;
          
          let verb = 'Copy';
          if (removePct > 0) verb = 'Steal';
          
          let what = 'positive effects';
          if (action.category === 'debuff') what = 'negative effects';
          
          let from = 'primary target';
          if (action.recipient && action.recipient.relation === 'ally') {
              // Steal from enemy to self/ally
          } else if (action.recipient && action.recipient.relation === 'enemy') {
              // Transfer from self/ally to enemy
              from = 'self';
              verb = 'Transfer';
          }

          effects.push(`${verb} ${count} ${what} from ${from}.`);
      }

      // 8. Turn Meter
      if (action.action === 'turn_meter') {
          const amount = getMax(action.change_pct);
          if (amount > 0) {
              effects.push(`Gain ${amount}% Speed Bar.`);
          } else if (amount < 0) {
              effects.push(`Reduce Speed Bar by ${Math.abs(amount)}%.`);
          }
      }

      // 9. Barrier
      if (action.action === 'barrier') {
          const amount = getMax(action.health_pct);
          if (amount > 0) {
              effects.push(`Barrier for ${amount}% of Max Health.`);
          }
      }
    });
  }

  // Generate description
  let description = `Attack primary target for ${damage > 0 ? damage + '%' : ''}`;
  if (damage > 0 && piercing > 0) description += ' damage';
  if (piercing > 0) description += ` + ${piercing}% Piercing`;
  if (drain > 0) description += ` + ${drain}% Drain`;
  
  if (effects.length > 0) {
    description += '.\\n' + effects.join('\\n');
  }

  return {
    description: description,
    damage: damage,
    piercing: piercing,
    drain: drain,
    effects: effects,
    notes: notes
  };
}

// Main execution
try {
  console.log(`Reading from: ${CHARACTERS_JSON_PATH}`);
  const rawData = fs.readFileSync(CHARACTERS_JSON_PATH, 'utf8');
  const json = JSON.parse(rawData);
  const charDataMap = json.Data || json; 

  const outputData = {};
  let count = 0;

  for (const [charId, data] of Object.entries(charDataMap)) {
    if (charId === 'ForceImportVersion' || charId === 'Name') continue;

    const processed = processCharacter(charId, data);
    if (processed) {
      outputData[charId] = processed;
      count++;
    }
  }

  console.log(`Processed ${count} characters.`);
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputData, null, 2));
  console.log(`Wrote data to ${OUTPUT_PATH}`);

} catch (err) {
  console.error('Error:', err);
}
