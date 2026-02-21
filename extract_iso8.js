const fs = require('fs');
const path = require('path');

// Path to the game data file (Absolute path provided by user)
const CHARACTERS_JSON_PATH = 'C:\\Users\\steven\\Downloads\\marvel strike force\\com.foxnextgames.m3-222026-2\\com.foxnextgames.m3\\files\\Config\\combat_data\\characters.json';
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
  'LockedBuff': 'Safeguard',
  'LockedDebuff': 'Trauma',
  'Exposed': 'Exposed',
  'BuffBlock': 'Immunity', // Usually prevents buffs
  'DebuffBlock': 'Immunity',
  'MinorDeflect': 'Minor Deflect',
  'MinorRegeneration': 'Minor Regeneration',
  'MinorDefenseUp': 'Minor Defense Up',
  'MinorOffenseUp': 'Minor Offense Up'
};

function formatProcName(proc) {
  return PROC_MAP[proc] || proc;
}

function parseConditions(action) {
  if (!action.only_if) return '';
  
  const conditions = [];
  const oi = action.only_if;

  if (oi.mode) {
    if (oi.mode === 'AVA') conditions.push('In WAR');
    else if (oi.mode === 'PVP') conditions.push('In CRUCIBLE'); // Sometimes PVP is Crucible, sometimes specific
    else conditions.push(`In ${oi.mode}`);
  }
  
  if (oi.combat_side) {
    if (oi.combat_side === 'offense') conditions.push('OFFENSE');
    else if (oi.combat_side === 'defense') conditions.push('DEFENSE');
  }

  // Handle "traits" logic if simple (e.g. "If ally has X") - skipping for brevity unless needed for key mechanics
  
  if (conditions.length > 0) {
    return conditions.join(' ') + ', ';
  }
  return '';
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
      const conditionPrefix = parseConditions(action);

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
        // Deduplicate procs: If multiple 'DoT' exist, we count them together or take the primary count
        // Archangel case: apply_count: 2, procs: [DoT, DoT].
        // Strategy: Group by proc type.
        
        const procGroups = {};
        
        action.procs.forEach(p => {
           const name = formatProcName(p.proc);
           if (!procGroups[name]) procGroups[name] = 0;
           // If apply_count is set on the action, it usually overrides individual use_count
           // But sometimes individual use_counts matter.
           // For Archangel, apply_count is 2.
        });

        const globalApplyCount = getMax(action.apply_count);
        
        // If we have a global apply count, apply it to the unique procs found
        Object.keys(procGroups).forEach(procName => {
            let count = globalApplyCount;
            if (!count) {
                // Fallback to checking individual use_count if global is missing
                // (Simplified logic: taking 1 for now if global missing)
                count = 1;
            }
            
            let effectText = `${conditionPrefix}Apply ${count} ${procName}`;
            
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
        effects.push(`${conditionPrefix}Clear ${procName} from the primary target.`);
      }

      // 4. Proc Flip
      if (action.action === 'proc_flip') {
        effects.push(`${conditionPrefix}Flip positive effects to negative on primary target.`);
      }
      
      // 5. Health Redistribute
      if (action.action === 'health_redistribute') {
          effects.push(`${conditionPrefix}Redistribute health.`);
      }
      
      // 6. Heal
      if (action.action === 'heal') {
          const healPct = getMax(action.heal_pct);
          if (healPct > 0) {
              effects.push(`${conditionPrefix}Heal for ${healPct}% of Max Health.`);
          }
      }

      // 7. Transfer (Steal/Copy)
      if (action.action === 'proc_transfer') {
          const count = getMax(action.count) || 1;
          const removePct = getMax(action.removepct) || 0;
          
          let verb = 'Copy';
          if (removePct > 0) verb = 'Steal';
          
          let what = 'positive effects';
          if (action.category === 'debuff') what = 'negative effects';
          
          let from = 'primary target';
          if (action.recipient && action.recipient.relation === 'enemy') {
              from = 'self';
              verb = 'Transfer';
          }

          effects.push(`${conditionPrefix}${verb} ${count} ${what} from ${from}.`);
      }

      // 8. Turn Meter
      if (action.action === 'turn_meter') {
          const amount = getMax(action.change_pct);
          if (amount > 0) {
              effects.push(`${conditionPrefix}Gain ${amount}% Speed Bar.`);
          } else if (amount < 0) {
              effects.push(`${conditionPrefix}Reduce Speed Bar by ${Math.abs(amount)}%.`);
          }
      }

      // 9. Barrier
      if (action.action === 'barrier') {
          const amount = getMax(action.health_pct);
          if (amount > 0) {
              effects.push(`${conditionPrefix}Barrier for ${amount}% of Max Health.`);
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
