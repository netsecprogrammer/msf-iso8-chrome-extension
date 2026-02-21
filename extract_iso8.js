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
  'BuffBlock': 'Disrupted', // Prevents buffs
  'DebuffBlock': 'Immunity', // Prevents debuffs
  'MinorDeflect': 'Minor Deflect',
  'MinorRegeneration': 'Minor Regeneration',
  'MinorDefenseUp': 'Minor Defense Up',
  'MinorOffenseUp': 'Minor Offense Up'
};

function formatProcName(proc) {
  return PROC_MAP[proc] || proc;
}

function parseConditions(action) {
  const conditions = [];
  
  if (action.only_if) {
      const oi = action.only_if;
      if (oi.mode) {
        if (oi.mode === 'AVA') conditions.push('In WAR');
        else if (oi.mode === 'PVP') conditions.push('In CRUCIBLE');
        else conditions.push(`In ${oi.mode}`);
      }
      
      if (oi.combat_side) {
        if (oi.combat_side === 'offense') conditions.push('OFFENSE');
        else if (oi.combat_side === 'defense') conditions.push('DEFENSE');
      }
  }
  
  // Handle only_if_target (e.g. "If the primary target is MYSTIC")
  if (action.only_if_target && action.only_if_target.traits && action.only_if_target.traits.has_any) {
      conditions.push(`If the primary target is ${action.only_if_target.traits.has_any.join(' or ').toUpperCase()}`);
  }

  if (conditions.length > 0) {
    return conditions.join(' ') + ', ';
  }
  return '';
}

function getTargetText(target) {
    if (!target) return 'the primary target';
    
    if (target.relation === 'ally') {
        const limit = getMax(target.limit);
        let traits = '';
        if (target.filter && target.filter.traits && target.filter.traits.has_any) {
            traits = target.filter.traits.has_any.join(' or ').toUpperCase() + ' ';
        }
        
        // If limit is undefined (0) or 1, assume self if no traits, otherwise "a random X ally"
        if (!limit || limit === 1) {
            if (traits) return `a random ${traits}ally`;
            return 'self';
        }
        
        if (limit >= 10) {
             if (traits) return `self and all ${traits}allies`;
             return 'allies';
        }
        
        return `${limit} ${traits}allies`;
    }
    
    return 'the primary target';
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
        const procGroups = {};
        
        action.procs.forEach(p => {
           const name = formatProcName(p.proc);
           if (!procGroups[name]) procGroups[name] = { count: 0, duration: 0 };
           procGroups[name].count++;
           const dur = getMax(p.use_count) || 1;
           if (dur > procGroups[name].duration) procGroups[name].duration = dur;
        });

        const globalApplyCount = getMax(action.apply_count);
        const targetText = getTargetText(action.target);
        
        Object.keys(procGroups).forEach(procName => {
            let count = globalApplyCount || procGroups[procName].count;
            const duration = procGroups[procName].duration;
            let durationText = '';
            if (duration > 1) durationText = ` for ${duration} turns`;
            
            let effectText = '';
            if (targetText === 'self') {
                effectText = `${conditionPrefix}Gain ${count > 1 ? count + ' ' : ''}${procName}${durationText}`;
            } else {
                effectText = `${conditionPrefix}Apply ${count > 1 ? count + ' ' : ''}${procName}${durationText} to ${targetText}`;
            }
            effects.push(effectText + '.');
        });
      }

      // 3. Proc Remove (Clear Status)
      if (action.action === 'proc_remove') {
        let count = getMax(action.count) || 1;
        let what = '';
        if (action.procs) {
            const procName = formatProcName(action.procs);
            what = procName;
        } else {
            if (action.category === 'buff') what = 'positive effect(s)';
            else if (action.category === 'debuff') what = 'negative effect(s)';
            else what = 'effects';
        }
        const targetText = getTargetText(action.target);
        if (targetText === 'self') {
             effects.push(`${conditionPrefix}Clear ${count} ${what} from self.`);
        } else {
             effects.push(`${conditionPrefix}Clear ${count} ${what} from ${targetText}.`);
        }
      }

      // 4. Proc Flip
      if (action.action === 'proc_flip') {
        let count = getMax(action.count) || 1;
        const targetText = getTargetText(action.target);
        if (targetText === 'self') {
             effects.push(`${conditionPrefix}Flip ${count} negative effect(s) to positive on self.`);
        } else {
             effects.push(`${conditionPrefix}Flip ${count} positive effect(s) to negative on ${targetText}.`);
        }
      }
      
      // 5. Health Redistribute
      if (action.action === 'health_redistribute') {
          const drainPct = getMax(action.drain_pct);
          if (drainPct > 0) {
              effects.push(`${conditionPrefix}Deal ${drainPct}% of target's Max Health.`);
          } else {
              effects.push(`${conditionPrefix}Redistribute health.`);
          }
      }
      
      // 6. Heal
      if (action.action === 'heal') {
          const healPct = getMax(action.heal_pct);
          if (healPct > 0) {
              const targetText = getTargetText(action.target);
              if (targetText === 'self') {
                  effects.push(`${conditionPrefix}Heal self for ${healPct}% of Max Health.`);
              } else {
                  effects.push(`${conditionPrefix}Heal ${targetText} for ${healPct}% of Max Health.`);
              }
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
          let from = 'the primary target';
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
      
      // 10. Proc Duration (Gain/Prolong)
      if (action.action === 'proc_duration') {
          const delta = getMax(action.delta);
          let procName = 'effects';
          if (action.only_procs && action.only_procs.length > 0) {
              procName = formatProcName(action.only_procs[0]);
          } else {
              if (action.category === 'buff') procName = 'positive effects';
              else if (action.category === 'debuff') procName = 'negative effects';
          }
          
          let excludeText = '';
          if (action.exclude && action.exclude.length > 0) {
              if (action.category === 'debuff') procName = 'all negative effects';
              if (action.category === 'buff') procName = 'all positive effects';
              const excludes = action.exclude.map(e => formatProcName(e));
              if (excludes.length > 1) {
                  const last = excludes.pop();
                  excludeText = `, excluding ${excludes.join(', ')} and ${last}`;
              } else {
                  excludeText = `, excluding ${excludes[0]}`;
              }
          }
          
          const targetText = getTargetText(action.target);
          const maxDur = getMax(action.max_duration);
          let maxText = '';
          if (maxDur) maxText = `, up to a maximum of ${maxDur}`;

          if (action.add_if_not && delta > 0) {
              // Treat as "Gain" or "Apply" depending on target
              if (targetText === 'self') {
                  effects.push(`${conditionPrefix}Gain +${delta} ${procName}${maxText}.`);
              } else {
                  effects.push(`${conditionPrefix}Apply +${delta} ${procName}${maxText} to ${targetText}.`);
              }
          } else if (delta > 0) {
              effects.push(`${conditionPrefix}Prolong the duration of ${procName}${excludeText} by ${delta}.`);
          } else if (delta < 0) {
              effects.push(`${conditionPrefix}Reduce the duration of ${procName}${excludeText} by ${Math.abs(delta)}.`);
          }
      }
    });
  }

  // Generate description
  let description = 'Attack primary target for ';
  if (damage > 0) {
      description += `${damage}% damage`;
      if (piercing > 0) description += ` + ${piercing}% Piercing`;
  } else {
      if (piercing > 0) description += `${piercing}% Piercing`;
      else description = 'Attack primary target'; // Fallback if no dmg/piercing
  }
  
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
