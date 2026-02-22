const fs = require('fs');
const path = require('path');

// Path to the game data file — pass as CLI argument or set via environment variable
// Usage: node extract_iso8.js <path_to_characters.json>
const CHARACTERS_JSON_PATH = process.argv[2] || process.env.MSF_CHARACTERS_JSON;
if (!CHARACTERS_JSON_PATH) {
  console.error('Usage: node extract_iso8.js <path_to_characters.json>');
  console.error('  Or set MSF_CHARACTERS_JSON environment variable');
  process.exit(1);
}
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
  'MinorOffenseUp': 'Minor Offense Up',
  'HoT': 'Regeneration',
  'AccuracyDown': 'Accuracy Down',
  'BombBurst': 'Bomb Burst',
  'NicoBasic': 'Arcane Runic',
  'Marked': 'Vulnerable',
  'ClawsOut': 'Claws Out',
  'Silence': 'Silence',
  // Trait names used in conditions and targeting
  'AbsoluteAForce': 'Absolute A-Force',
  'NewAvenger': 'New Avenger',
  'AlphaFlight': 'Alpha Flight',
  'SpiderSociety': 'Spider Society',
  'SpiderVerse': 'Spider-Verse',
  'OutOfTime': 'Out of Time',
  'UncannyAvenger': 'Uncanny Avenger',
  'SuperiorSix': 'Superior Six',
  'WinterGuard': 'Winter Guard',
  'BionicAvenger': 'Bionic Avenger',
  'HiveMind': 'Hive-Mind',
  'SinisterSix': 'Sinister Six',
  'Brimstone': 'Brimstone',
  'Pegasus': 'Pegasus',
  'Underworld': 'Underworld',
  'MightyAvenger': 'Mighty Avenger',
  'Deathseed': 'Deathseed',
  'Shadowland': 'Shadowland',
  'Xmen': 'X-Men',
  'Darkhold': 'Darkhold',
  'Nightstalker': 'Nightstalker',
  'Gamma': 'Gamma',
  'Villain': 'Villain',
  // Character names used in conditions
  'Hercules': 'Hercules',
  'KittyPryde': 'Kitty Pryde',
  'Colossus': 'Colossus',
  'SpiderMan': 'Spider-Man',
  'SamWilson': 'Sam Wilson',
  'MistyKnight': 'Misty Knight',
  'ColleenWing': 'Colleen Wing',
  'Groot': 'Groot',
  'Gwenpool': 'Gwenpool',
  'MultipleManMinion': 'Multiple Man',
  'Horseman': 'Horseman',
  'Sylvie': 'Sylvie',
  'Ikaris': 'Ikaris',
  'Daredevil': 'Daredevil'
};

function formatProcName(proc) {
  return PROC_MAP[proc] || proc;
}

// Recursively extract mode/combat_side text from an only_if object
function extractModeText(oi) {
    if (!oi) return '';
    let result = '';

    if (oi.mode) {
        result = oi.mode === 'AVA' ? 'WAR' : oi.mode === 'PVP' ? 'CRUCIBLE' : oi.mode === 'GRAND_TOURNAMENT' ? 'CRUCIBLE SHOWDOWN' : oi.mode === 'INSANITY' ? 'INCURSION' : oi.mode;
    }
    if (oi.combat_side) {
        const side = oi.combat_side === 'offense' ? 'OFFENSE' : 'DEFENSE';
        result = result ? `${result}, ${side}` : side;
    }

    if (oi.or) {
        const orParts = oi.or.map(sub => extractModeText(sub)).filter(x => x);
        if (orParts.length > 0) {
            const orText = orParts.join(' or ');
            result = result ? `${result}, ${orText}` : orText;
        }
    }
    if (oi.and) {
        const andParts = oi.and.map(sub => extractModeText(sub)).filter(x => x);
        if (andParts.length > 0) {
            const andText = andParts.join(', ');
            result = result ? `${result}, ${andText}` : andText;
        }
    }

    return result;
}

function parseConditions(action) {
  const conditions = [];

  if (action.only_if) {
      const oi = action.only_if;

      // Mode/combat_side conditions (handles or/and recursion)
      const modeText = extractModeText(oi);
      if (modeText) conditions.push(`In ${modeText}`);

      // Target has specific proc(s)
      if (oi.target && oi.target.procs) {
          const procs = oi.target.procs.map(p => formatProcName(p)).join(' or ');
          conditions.push(`If the primary target has ${procs}`);
      }

      // Self has specific proc(s)
      if (oi.owner && oi.owner.procs) {
          const procs = oi.owner.procs.map(p => formatProcName(p)).join(' or ');
          conditions.push(`If self has ${procs}`);
      }

      // Ally count conditions: "If X+ [Trait] allies"
      if (oi.count && oi.count_filter) {
          const cf = oi.count_filter;
          let traitText = '';
          if (cf.character) {
              traitText = cf.character.map(c => formatProcName(c)).join(' or ');
          } else if (cf.traits) {
              if (cf.traits.has_any) {
                  traitText = cf.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
              } else if (cf.traits.and) {
                  // Compound traits: e.g., Hero + SpiderVerse
                  const parts = cf.traits.and
                      .filter(sub => sub.has_any)
                      .map(sub => sub.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase());
                  traitText = parts.join(' ');
              }
          } else if (cf.and) {
              for (const sub of cf.and) {
                  if (sub.traits && sub.traits.has_any) {
                      traitText = sub.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                      break;
                  }
              }
          }
          // Handle negated count_filter (e.g., "not.target.procs: SpeedUp" with count <= 0 = "all allies have SpeedUp")
          if (!traitText && cf.not && cf.not.target && cf.not.target.procs) {
              const negProcs = cf.not.target.procs.map(p => formatProcName(p)).join(' or ');
              if (oi.count.if === 'less_or_equal' && (oi.count.than || 0) === 0) {
                  conditions.push(`If all allies have ${negProcs}`);
              } else {
                  const threshold = oi.count.than || 0;
                  const rel = cf.relationship || 'ally';
                  conditions.push(`If ${threshold}+ ${rel === 'ally' ? 'allies' : rel + 's'} lack ${negProcs}`);
              }
          } else {
              const threshold = oi.count.than || 0;
              const rel = cf.relationship || 'ally';
              if (threshold <= 1 && cf.character) {
                  conditions.push(`If ${traitText} is an ${rel}`);
              } else {
                  conditions.push(`If ${threshold}+ ${traitText} ${rel === 'ally' ? 'allies' : rel + 's'}`);
              }
          }
      }

      // Negated conditions: only_if.not
      if (oi.not) {
          const neg = oi.not;
          if (neg.mode) {
              const modeName = neg.mode === 'AVA' ? 'WAR' : neg.mode === 'PVP' ? 'CRUCIBLE' : neg.mode === 'GRAND_TOURNAMENT' ? 'CRUCIBLE SHOWDOWN' : neg.mode === 'INSANITY' ? 'INCURSION' : neg.mode;
              conditions.push(`Not in ${modeName}`);
          }
          if (neg.owner && neg.owner.procs) {
              const procs = neg.owner.procs.map(p => formatProcName(p)).join(' or ');
              conditions.push(`If self does not have ${procs}`);
          }
          if (neg.target && neg.target.procs) {
              const procs = neg.target.procs.map(p => formatProcName(p)).join(' or ');
              conditions.push(`If the primary target does not have ${procs}`);
          }
          if (neg.character) {
              const charNames = neg.character.map(c => formatProcName(c)).join(' or ');
              conditions.push(`If not facing ${charNames}`);
          }
      }

      // Self-trait conditions: only_if.traits
      if (oi.traits) {
          if (oi.traits.has_any) {
              const traits = oi.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
              conditions.push(`If self is ${traits}`);
          }
          if (oi.traits.not && oi.traits.not.has_any) {
              const traits = oi.traits.not.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
              conditions.push(`If self is not ${traits}`);
          }
      }
  }

  if (action.only_if_outcome && action.only_if_outcome.includes('critical_hit')) {
      conditions.push('On Crit');
  }

  // Handle only_if_target (trait-based conditions on the target)
  if (action.only_if_target) {
      const extractTraits = (obj) => {
          if (obj.traits && obj.traits.has_any) return obj.traits.has_any.map(t => formatProcName(t).toUpperCase()).join(' or ');
          if (obj.and) return obj.and.map(extractTraits).filter(x=>x).join(' and ');
          if (obj.or) return obj.or.map(extractTraits).filter(x=>x).join(' or ');
          return '';
      };

      const traits = extractTraits(action.only_if_target);
      if (traits) {
          conditions.push(`If the primary target is ${traits}`);
      }
  }

  if (conditions.length > 0) {
    return conditions.join(', ') + ', ';
  }
  return '';
}

function getTargetText(target) {
    if (!target) return 'the primary target';
    
    if (target.relation === 'ally') {
        const limit = getMax(target.limit);
        let traits = '';
        if (target.filter && target.filter.traits && target.filter.traits.has_any) {
            traits = target.filter.traits.has_any.map(t => formatProcName(t).toUpperCase()).join(' or ') + ' ';
        }
        
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

  // Collect all actions: safety actions + basic actions tagged with counter/assist
  const allActions = [];
  if (safety.actions) {
    safety.actions.forEach(a => allActions.push({ ...a, _source: 'safety' }));
  }
  if (charData.basic && charData.basic.actions) {
    charData.basic.actions.forEach(a => {
      const hasCounter = a.counter === true;
      const hasAssist = a.assist !== undefined;
      if (!hasCounter && !hasAssist) return;
      // Skip empty_result actions (placeholders)
      if (a.action === 'empty_result') return;

      let prefix = '';
      if (hasCounter && !hasAssist) prefix = 'On Counter, ';
      else if (hasAssist && !hasCounter) prefix = 'On Assist, ';
      // both counter+assist → no prefix

      allActions.push({ ...a, _source: 'basic', _counterAssistPrefix: prefix });
    });
  }

  // Iterate all actions
  allActions.forEach(action => {
      // Check action_pct: if max level chance is 0, skip entirely; if < 100, note probability
      const maxActionPct = action.action_pct
          ? (Array.isArray(action.action_pct) ? action.action_pct[action.action_pct.length - 1] : action.action_pct)
          : 100;
      if (maxActionPct === 0) return; // Action never fires at max level

      let conditionPrefix = (action._counterAssistPrefix || '') + parseConditions(action);

      // Handle action_cond: "if_has_crit_result" as a crit condition
      // (alternate representation of only_if_outcome: ["critical_hit"])
      const isCrit = (action.only_if_outcome && action.only_if_outcome.includes('critical_hit'))
          || action.action_cond === 'if_has_crit_result'
          || action.action_cond === 'if_has_crit_result_per_target';
      if (isCrit && !conditionPrefix.includes('On Crit')) {
          conditionPrefix = conditionPrefix ? conditionPrefix.replace(/, $/, ', On Crit, ') : 'On Crit, ';
      }

      // Handle only_if_any: ally-specific or enemy-specific conditions
      if (action.only_if_any) {
          const oia = action.only_if_any;
          if (oia.filter) {
              if (oia.filter.character) {
                  const charNames = oia.filter.character.map(c => formatProcName(c) || c).join(' or ');
                  conditionPrefix += `If ${charNames} is an ally, `;
              } else if (oia.filter.count && oia.filter.count_filter) {
                  const cf = oia.filter.count_filter;
                  let traitText = '';
                  if (cf.traits && cf.traits.has_any) {
                      traitText = cf.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                  } else if (cf.and) {
                      // Complex filter — extract traits from nested "and"
                      for (const sub of cf.and) {
                          if (sub.traits && sub.traits.has_any) {
                              traitText = sub.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                              break;
                          }
                      }
                  }
                  const threshold = oia.filter.count.than || 0;
                  conditionPrefix += `If ${threshold}+ ${traitText} allies, `;
              } else if (oia.filter.target && oia.filter.target.any_proc_of_type) {
                  const procType = oia.filter.target.any_proc_of_type;
                  const typeText = procType === 'buff' ? 'positive effects' : 'negative effects';
                  conditionPrefix += `If any enemy has ${typeText}, `;
              }
          }
      }

      // Add probability prefix for effects with < 100% chance at max level
      let chancePrefix = '';
      if (maxActionPct > 0 && maxActionPct < 100) {
          chancePrefix = `${maxActionPct}% chance to `;
      }

      // Determine if this is a "Conditional Attack" (has conditions) or "Main Attack"
      // only_if_target may fall back to base when no unconditional stats exist (e.g. ShangChi)
      // only_if_any should ALWAYS produce an effect line (the fallback action_cond: "if_prev_skipped" provides the base)
      const isConditionalTarget = !!action.only_if_target;
      const isAllyConditional = !!action.only_if_any;

      // 1. Stats (Damage/Piercing)
      if (action.stat_modifier) {
        let localDmg = 0;
        let localPierce = 0;
        let localDrain = 0;
        let ignoresDefenseUp = false;

        action.stat_modifier.forEach(mod => {
          // Skip dynamic modifiers that don't have a fixed delta (e.g., delta_from: "armor_pct")
          if (!mod.delta) return;

          if (mod.stat === 'ability_damage_pct') {
            const val = getMax(mod.delta);
            if (!mod.apply_if) {
                localDmg = val;
            } else if (mod.apply_if.not) {
                // "not X" conditions indicate the base/default state
                // Covers: Blade (not DefenseUp), EmmaFrost (not Charged), etc.
                if (localDmg === 0) localDmg = val;
            }
          } else if (mod.stat === 'armor_pierce_pct') {
            const val = getMax(mod.delta);

            // Check if DefenseUp appears anywhere in conditions (for ignore note)
            if (mod.apply_if && JSON.stringify(mod.apply_if).includes('"DefenseUp"')) {
                ignoresDefenseUp = true;
            }

            if (!mod.apply_if) {
                localPierce = val;
            } else if (mod.apply_if.not) {
                // "not X" conditions indicate the base/default state
                // Covers: Blade/SuperSkrull (not DefenseUp variants)
                if (val > localPierce) localPierce = val;
            }
          } else if (mod.stat === 'drain_pct') {
            localDrain = getMax(mod.delta);
          }
        });

        if (ignoresDefenseUp) {
            if (!notes.includes("This attack ignores Defense Up.")) {
                notes.push("This attack ignores Defense Up.");
            }
        }

        // Only process attack stats if actual attack values were found
        // (skip actions that only have focus_pct or other non-attack stat_modifiers)
        const hasAttackStats = localDmg > 0 || localPierce > 0 || localDrain > 0;

        if (hasAttackStats) {
            const isFromBasic = action._source === 'basic';
            if (isFromBasic || isCrit || isAllyConditional) {
                // Basic counter/assist bonuses, crit bonuses, and ally-conditional stats always go as effect lines
                const parts = [];
                if (localDmg > 0) parts.push(`${localDmg}% damage`);
                if (localPierce > 0) parts.push(`${localPierce}% Piercing`);
                if (localDrain > 0) parts.push(`${localDrain}% Drain`);

                // Check if this targets adjacent/chain enemies (not primary target)
                let targetSuffix = '';
                if (action.target && action.target.primary_selection === 'exclude_from_pool') {
                    if (action.target.places_from_primary) {
                        targetSuffix = ' to adjacent enemies';
                    } else {
                        targetSuffix = ' to additional enemies';
                    }
                }
                effects.push(`${conditionPrefix}+${parts.join(' + ')}${targetSuffix}.`);
            } else if (isConditionalTarget && (damage > 0 || piercing > 0)) {
                // Already have base stats — only add effect line if values differ
                if (localDmg !== damage || localPierce !== piercing || localDrain !== drain) {
                    let text = `${conditionPrefix}attack for `;
                    if (localDmg > 0) text += `${localDmg}% damage`;
                    if (localPierce > 0) text += `${localDmg > 0 ? ' + ' : ''}${localPierce}% Piercing`;
                    if (localDrain > 0) text += ` + ${localDrain}% Drain`;
                    text += ' instead.';
                    effects.push(text);
                }
            } else {
                // Main stats (unconditional, or first conditional when no base exists yet)
                if (localDmg > 0) damage = localDmg;
                if (localPierce > 0) piercing = localPierce;
                if (localDrain > 0) drain = localDrain;
            }
        }
      }

      // victim_cant_revive can appear on any action (not just stat_modifier ones)
      if (action.victim_cant_revive) {
          if (!notes.includes("Characters killed by this attack cannot be revived.")) {
              notes.push("Characters killed by this attack cannot be revived.");
          }
      }

      // 2. Procs (Apply Status)
      if (action.action === 'proc' && action.procs) {
        const procGroups = {};

        action.procs.forEach(p => {
           // Skip internal level-scaling procs (e.g., Odin's Basic_Level_1..7)
           if (p.proc && p.proc.startsWith('Basic_Level')) return;
           const name = formatProcName(p.proc);
           if (!procGroups[name]) procGroups[name] = { count: 0, duration: 0, spawnPct: 100 };
           procGroups[name].count++;
           const dur = getMax(p.use_count) || 1;
           if (dur > procGroups[name].duration) procGroups[name].duration = dur;
           // Track spawn_pct (per-proc chance)
           if (p.spawn_pct) {
               const pct = getMax(p.spawn_pct);
               procGroups[name].spawnPct = Math.min(procGroups[name].spawnPct, pct);
           }
        });

        const globalApplyCount = getMax(action.apply_count);
        const targetText = getTargetText(action.target);

        Object.keys(procGroups).forEach(procName => {
            let count = globalApplyCount || procGroups[procName].count;
            const duration = procGroups[procName].duration;
            const spawnPct = procGroups[procName].spawnPct;
            let durationText = '';
            if (duration > 1) durationText = ` for ${duration} turns`;

            // Combine action-level chance with proc-level spawn chance
            let fullChancePrefix = chancePrefix;
            if (!fullChancePrefix && spawnPct > 0 && spawnPct < 100) {
                fullChancePrefix = `${spawnPct}% chance to `;
            }

            let effectText = '';
            if (targetText === 'self') {
                effectText = `${conditionPrefix}${fullChancePrefix}Gain ${count > 1 ? count + ' ' : ''}${procName}${durationText}`;
            } else {
                effectText = `${conditionPrefix}${fullChancePrefix}Apply ${count > 1 ? count + ' ' : ''}${procName}${durationText} to ${targetText}`;
            }
            effects.push(effectText + '.');
        });
      }

      // 3. Proc Remove (Clear Status)
      if (action.action === 'proc_remove') {
        let count = getMax(action.count) || 1;
        const countText = count >= 10 ? 'all' : `${count}`;
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
             effects.push(`${conditionPrefix}${chancePrefix}Clear ${countText} ${what} from self.`);
        } else {
             effects.push(`${conditionPrefix}${chancePrefix}Clear ${countText} ${what} from ${targetText}.`);
        }
      }

      // 4. Proc Flip
      if (action.action === 'proc_flip') {
        let count = getMax(action.count) || 1;
        const countText = count >= 10 ? 'all' : `${count}`;
        const targetText = getTargetText(action.target);
        if (action.category === 'debuff') {
             effects.push(`${conditionPrefix}${chancePrefix}Flip ${countText} negative effect(s) to positive on ${targetText}.`);
        } else {
             effects.push(`${conditionPrefix}${chancePrefix}Flip ${countText} positive effect(s) to negative on ${targetText}.`);
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

          let what = '';
          if (action.onlyprocs && action.onlyprocs.length > 0) {
              what = action.onlyprocs.map(p => formatProcName(p)).join(' and ');
          } else {
              const countText = count >= 100 ? 'all' : `${count}`;
              if (action.category === 'debuff') what = `${countText} negative effect(s)`;
              else what = `${countText} positive effect(s)`;
          }

          let from = 'the primary target';
          if (action.recipient && action.recipient.relation === 'enemy') {
              from = 'self';
              verb = 'Transfer';
          }
          // Handle transferopposite: effects are converted to opposite type
          if (action.transferopposite) {
              verb = 'Transfer';
              if (action.category === 'buff') {
                  what = what.replace('positive', 'positive').replace(/positive effect/, 'positive effect');
              }
          }

          let toText = '';
          if (action.recipient && action.recipient.relation === 'ally') {
              toText = ' and give to allies';
          } else if (action.recipient && action.recipient.relation === 'enemy') {
              // from is already 'self', to goes to enemy
          }

          let excludeText = '';
          if (action.exceptprocs && action.exceptprocs.length > 0) {
              const excludes = action.exceptprocs.map(p => formatProcName(p));
              if (excludes.length > 1) {
                  const last = excludes.pop();
                  excludeText = `, excluding ${excludes.join(', ')} and ${last}`;
              } else {
                  excludeText = `, excluding ${excludes[0]}`;
              }
          }

          let oppositeText = action.transferopposite ? ' as negative effects' : '';
          effects.push(`${conditionPrefix}${chancePrefix}${verb} ${what} from ${from}${toText}${excludeText}${oppositeText}.`);
      }

      // 8. Turn Meter
      if (action.action === 'turn_meter') {
          if (action.specific_characters && action.specific_characters_mul) {
              const perAlly = Math.abs(getMax(action.specific_characters_mul));
              if (perAlly > 0) {
                  let traitText = '';
                  const sc = action.specific_characters;
                  if (sc.traits && sc.traits.has_any) {
                      traitText = sc.traits.has_any.map(t => formatProcName(t) || t).join(' or ').toUpperCase();
                  }
                  const rel = sc.relationship || 'ally';
                  const mulVal = getMax(action.specific_characters_mul);
                  if (mulVal < 0) {
                      effects.push(`${conditionPrefix}Reduce Speed Bar by ${perAlly}% for each ${traitText} ${rel}.`);
                  } else {
                      effects.push(`${conditionPrefix}Gain ${perAlly}% Speed Bar for each ${traitText} ${rel}.`);
                  }
              }
          } else {
              const amount = getMax(action.change_pct);
              if (amount > 0) {
                  effects.push(`${conditionPrefix}Gain ${amount}% Speed Bar.`);
              } else if (amount < 0) {
                  effects.push(`${conditionPrefix}Reduce Speed Bar by ${Math.abs(amount)}%.`);
              }
          }
      }

      // 9. Barrier
      if (action.action === 'barrier') {
          const amount = getMax(action.health_pct);
          if (amount > 0) {
              effects.push(`${conditionPrefix}${chancePrefix}Barrier for ${amount}% of Max Health.`);
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
              if (targetText === 'self') {
                  effects.push(`${conditionPrefix}${chancePrefix}Gain +${delta} ${procName}${maxText}.`);
              } else {
                  effects.push(`${conditionPrefix}${chancePrefix}Apply +${delta} ${procName}${maxText} to ${targetText}.`);
              }
          } else if (delta > 0) {
              effects.push(`${conditionPrefix}${chancePrefix}Prolong the duration of ${procName}${excludeText} by ${delta}.`);
          } else if (delta < 0) {
              effects.push(`${conditionPrefix}${chancePrefix}Reduce the duration of ${procName}${excludeText} by ${Math.abs(delta)}.`);
          }
      }

      // 11. Ability Energy
      if (action.action === 'ability_energy') {
          const count = getMax(action.count) || 1;
          let targetText = '';
          let condExtra = '';

          // Handle only_ultimate / only_special conditions
          if (action.only_ultimate) condExtra += 'On Ultimate assist, ';
          if (action.only_special) condExtra += 'On Special assist, ';

          if (action.target) {
              const t = action.target;
              if (t.filter && t.filter.character) {
                  targetText = t.filter.character.map(c => formatProcName(c)).join(' or ');
              } else if (t.filter && t.filter.traits && t.filter.traits.has_any) {
                  const traits = t.filter.traits.has_any.map(tr => formatProcName(tr)).join(' or ').toUpperCase();
                  targetText = `${traits} allies`;
              } else if (t.filter && t.filter.and) {
                  // Complex filter — extract trait from nested "and"
                  for (const sub of t.filter.and) {
                      if (sub.traits && sub.traits.has_any) {
                          const traits = sub.traits.has_any.map(tr => formatProcName(tr)).join(' or ').toUpperCase();
                          targetText = `a random ${traits} ally`;
                          break;
                      }
                  }
              } else if (t.relation === 'ally') {
                  targetText = 'all allies';
              }
          } else if (action.recipient) {
              targetText = 'a random ally';
          } else {
              targetText = 'self';
          }

          effects.push(`${conditionPrefix}${condExtra}Generate +${count} Ability Energy for ${targetText}.`);
      }

      // 12. Barrier Remove
      if (action.action === 'barrier_remove') {
          effects.push(`${conditionPrefix}Remove Barrier from the primary target.`);
      }

      // 13. Damage Multiplier Per Proc
      if (action.action === 'damage_mul_per_proc') {
          const pctPerProc = getMax(action.pct_per_proc);
          if (pctPerProc > 0) {
              const procType = action.category === 'buff' ? 'positive effect' : 'negative effect';
              effects.push(`${conditionPrefix}+${pctPerProc}% damage for each ${procType} on the primary target.`);
          }
      }

      // 14. Foreach Stat (per-ally stat bonuses)
      if (action.foreach_stat) {
          for (const fs2 of action.foreach_stat) {
              const stat = fs2.stat;
              const delta = getMax(fs2.delta);
              if (delta === 0) continue;

              const forEach = fs2.for_each;
              let traitText = '';
              if (forEach.character) {
                  traitText = forEach.character.map(c => formatProcName(c)).join(' or ');
              } else if (forEach.traits && forEach.traits.has_any) {
                  traitText = forEach.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
              } else if (forEach.and) {
                  // Extract traits from nested "and" arrays (e.g., Kingpin: Underworld + not Spawned)
                  for (const sub of forEach.and) {
                      if (sub.traits && sub.traits.has_any) {
                          traitText = sub.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                          break;
                      }
                  }
              } else if (forEach.or) {
                  // Extract from "or" arrays (e.g., Rogue: Horseman or Apocalypse)
                  const parts = [];
                  for (const sub of forEach.or) {
                      if (sub.traits && sub.traits.has_any) {
                          parts.push(...sub.traits.has_any.map(t => formatProcName(t).toUpperCase()));
                      }
                      if (sub.character) {
                          parts.push(...sub.character.map(c => formatProcName(c)));
                      }
                  }
                  traitText = parts.join(' or ');
              } else if (forEach.target && forEach.target.states) {
                  traitText = forEach.target.states.join(' or ').toUpperCase();
              }
              const rel = forEach.relationship || 'ally';
              const relText = rel === 'any' ? 'character' : rel;

              // Build condition from apply_if if present
              let foreachCond = '';
              if (fs2.apply_if) {
                  const modeText = extractModeText(fs2.apply_if);
                  if (modeText) foreachCond = `In ${modeText}, `;
                  // Handle count-based conditions
                  if (fs2.apply_if.count && fs2.apply_if.count_filter) {
                      const cf = fs2.apply_if.count_filter;
                      let cfTrait = '';
                      if (cf.traits && cf.traits.has_any) {
                          cfTrait = cf.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                      } else if (cf.and) {
                          for (const sub of cf.and) {
                              if (sub.traits && sub.traits.has_any) {
                                  cfTrait = sub.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                                  break;
                              }
                          }
                      }
                      const threshold = fs2.apply_if.count.than || 0;
                      foreachCond += `If ${threshold}+ ${cfTrait} allies, `;
                  }
              }

              let statName = '';
              if (stat === 'armor_pierce_pct') statName = 'Piercing';
              else if (stat === 'ability_damage_pct' || stat === 'damage_pct') statName = 'Damage';
              else if (stat === 'crit_chance_pct') statName = 'Crit Chance';
              else if (stat === 'focus_pct') statName = 'Focus';
              else statName = stat;

              effects.push(`${conditionPrefix}${foreachCond}+${delta}% ${statName} for each ${traitText} ${relText}.`);
          }
      }

      // 15. Revive (from basic counter/assist, e.g. StarLord_Annihilation reviving Korg)
      if (action.action === 'revive') {
          const revivePct = getMax(action.revive_pct);
          if (revivePct > 0) {
              let targetName = '';
              if (action.filter && action.filter.character) {
                  targetName = action.filter.character.map(c => formatProcName(c)).join(' or ');
              }
              const healthPct = action.revive_health && action.revive_health[0]
                  ? getMax(action.revive_health[0].pct) : 0;
              if (targetName) {
                  effects.push(`${conditionPrefix}Revive ${targetName}${healthPct > 0 ? ` at ${healthPct}% Health` : ''}.`);
              } else {
                  effects.push(`${conditionPrefix}Revive an ally${healthPct > 0 ? ` at ${healthPct}% Health` : ''}.`);
              }
          }
      }

      // 16. Drain (flat HP drain, from basic counter/assist)
      if (action.action === 'drain') {
          const drainAmt = getMax(action.drain_pct) || getMax(action.health_pct);
          if (drainAmt > 0) {
              effects.push(`${conditionPrefix}Drain ${drainAmt}% of damage dealt as Health.`);
          }
      }

      // 17. Attack Ally (redirect attack to enemy, e.g. Knull)
      if (action.action === 'attack_ally') {
          if (action.target && action.target.relation === 'enemy') {
              effects.push(`${conditionPrefix}Attack an additional enemy.`);
          }
      }

      // 18. Set Battlefield Effect (e.g. Odin)
      if (action.action === 'set_battlefield_effect') {
          // Battlefield effects are complex; just note their presence
          effects.push(`${conditionPrefix}Trigger battlefield effect.`);
      }
    });

  // Process stat_lock for notes
  if (safety.stat_lock) {
      safety.stat_lock.forEach(lock => {
          // Determine the meaning of this stat lock
          let meaning = '';
          if (lock.stat === 'block_chance_pct' && lock.value === 0) meaning = 'This attack cannot be blocked.';
          else if (lock.stat === 'dodge_chance_pct' && lock.value === 0) meaning = 'This attack cannot be dodged.';
          else if (lock.stat === 'accuracy_pct' && lock.value === 100) meaning = 'This attack cannot miss.';
          else if (lock.stat === 'counter_pct' && lock.value === 0) meaning = 'This attack cannot be countered.';
          else if (lock.stat === 'crit_chance_pct' && lock.value <= 0) meaning = 'This attack cannot critically hit.';
          else return; // Unknown stat lock, skip

          if (lock.if) {
              // Conditional stat lock — build condition text
              let condText = '';
              const cond = lock.if;
              const modeText = extractModeText(cond);
              if (modeText) condText = `In ${modeText}`;

              // Character-specific conditions
              if (cond.count && cond.count_filter) {
                  const cf = cond.count_filter;
                  let charName = '';
                  if (cf.character) charName = cf.character.map(c => formatProcName(c)).join(' or ');
                  else if (cf.traits && cf.traits.has_any) charName = cf.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                  if (charName) {
                      const rel = cf.relationship || 'ally';
                      condText += (condText ? ', ' : '') + `If ${charName} is an ${rel}`;
                  }
              }

              // Target proc conditions
              if (cond.target && cond.target.procs) {
                  const procs = cond.target.procs.map(p => formatProcName(p)).join(' or ');
                  condText += (condText ? ', ' : '') + `If target has ${procs}`;
              }
              if (cond.or) {
                  const procParts = cond.or
                      .filter(sub => sub.target && sub.target.procs)
                      .map(sub => sub.target.procs.map(p => formatProcName(p)).join(' or '));
                  if (procParts.length > 0) {
                      condText += (condText ? ', ' : '') + `If target has ${procParts.join(' or ')}`;
                  }
              }

              if (condText) {
                  const condNote = `${condText}, ${meaning.charAt(0).toLowerCase()}${meaning.slice(1)}`;
                  if (!notes.includes(condNote)) notes.push(condNote);
              }
          } else {
              // Unconditional stat lock (only count primary/self targets, not secondary)
              if (!lock.on || lock.on === 'primary' || lock.on === 'self') {
                  if (!notes.includes(meaning)) notes.push(meaning);
              }
          }
      });
  }

  // Process skip_focus_check for notes
  if (safety.actions) {
      const hasSkipFocus = safety.actions.some(a => a.skip_focus_check);
      if (hasSkipFocus) {
          const note = "Debuffs from this attack cannot be resisted.";
          if (!notes.includes(note)) notes.push(note);
      }
  }

  // Deduplicate effects and notes
  const uniqueEffects = [...new Set(effects)];
  effects.length = 0;
  effects.push(...uniqueEffects);

  const uniqueNotes = [...new Set(notes)];
  notes.length = 0;
  notes.push(...uniqueNotes);

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
