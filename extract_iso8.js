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
    const last = val[val.length - 1];
    // Handle level-scaled objects like {f: 1, t: 2} — take 't' as max-level value
    if (last && typeof last === 'object' && last.t !== undefined) return last.t;
    return last;
  }
  if (val && typeof val === 'object' && val.t !== undefined) return val.t;
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
  'BrickMaterial': 'Brick Material',
  'AssistNow': 'Assist Now',
  'InvisibleNonPersist': 'Stealth',
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
  'Daredevil': 'Daredevil',
  'DaimonHellstrom': 'Daimon Hellstrom',
  'MrSinister': 'Mr. Sinister',
  'NovaForceTracking': 'Nova Force Tracking',
  'XFactor': 'X-Factor',
  'PhantomRider': 'Phantom Rider',
  'InvisibleStateChecker': 'Absorbed Powers',
  'SpawnedWithHeroAllies': 'Spawned With Hero Allies',
  'NewMutant': 'New Mutant',
  'NewWarrior': 'New Warrior',
  'Champion': 'Champion',
  'Accursed': 'Accursed',
  'PhoenixForce': 'Phoenix Force',
  'DarkHunter': 'Dark Hunter',
  'AForce': 'A-Force'
};

// Known debuff proc names (used to infer target when not specified)
const DEBUFF_PROCS = new Set([
  'DoT', 'Bleed', 'DefenseDown', 'OffenseDown', 'Slow', 'Stun',
  'HealBlock', 'AbilityBlock', 'Blind', 'Vulnerable', 'Exposed',
  'Disrupted', 'Trauma', 'AccuracyDown', 'BombBurst', 'Silence',
  'Marked', 'BuffBlock', 'LockedDebuff'
]);

function formatProcName(proc) {
  return PROC_MAP[proc] || proc;
}

// Recursively extract mode/combat_side text from an only_if object
function extractModeText(oi) {
    if (!oi) return '';
    let result = '';

    if (oi.mode) {
        result = oi.mode === 'AVA' ? 'WAR' : oi.mode === 'PVP' ? 'CRUCIBLE' : oi.mode === 'GRAND_TOURNAMENT' ? 'CRUCIBLE SHOWDOWN' : oi.mode === 'INSANITY' ? 'INCURSION' : oi.mode === 'BATTLEGROUNDS' ? 'ARENA' : oi.mode;
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

      // Self health threshold conditions
      if (oi.owner && oi.owner.health_pct) {
          const hp = oi.owner.health_pct;
          const threshold = hp.than || 0;
          if (hp.if === 'less') {
              conditions.push(`If this character has less than ${threshold}% Health`);
          } else if (hp.if === 'less_or_equal') {
              conditions.push(`If this character has ${threshold}% or less Health`);
          } else if (hp.if === 'greater') {
              conditions.push(`If this character has more than ${threshold}% Health`);
          } else if (hp.if === 'greater_or_equal') {
              conditions.push(`If this character has ${threshold}% or more Health`);
          }
      }

      // Self barrier threshold conditions
      if (oi.owner && oi.owner.barrier_pct) {
          const bp = oi.owner.barrier_pct;
          const threshold = bp.than || 0;
          if (bp.if === 'greater_or_equal') {
              conditions.push(`If this character has ${threshold}% or more Barrier`);
          } else if (bp.if === 'greater') {
              conditions.push(`If this character has more than ${threshold}% Barrier`);
          } else if (bp.if === 'not_equal' && threshold === 0) {
              conditions.push(`If this character has Barrier`);
          } else if (bp.if === 'equal' && threshold === 0) {
              conditions.push(`If this character has no Barrier`);
          }
      }

      // Target barrier threshold conditions
      if (oi.target && oi.target.barrier_pct) {
          const bp = oi.target.barrier_pct;
          const threshold = bp.than || 0;
          if (bp.if === 'not_equal' && threshold === 0) {
              conditions.push(`If the primary target has Barrier`);
          } else if (bp.if === 'equal' && threshold === 0) {
              conditions.push(`If the primary target has no Barrier`);
          } else if (bp.if === 'greater_or_equal') {
              conditions.push(`If the primary target has ${threshold}% or more Barrier`);
          }
      }

      // Owner has any buff/debuff
      if (oi.owner && oi.owner.any_proc_of_type) {
          const type = oi.owner.any_proc_of_type;
          conditions.push(`If self has ${type === 'buff' ? 'any positive effects' : 'any negative effects'}`);
      }

      // Target has any buff/debuff
      if (oi.target && oi.target.any_proc_of_type) {
          const type = oi.target.any_proc_of_type;
          conditions.push(`If the primary target has ${type === 'buff' ? 'any positive effects' : 'any negative effects'}`);
      }

      // Owner proc_duration_check conditions (e.g., "If 5+ Charged")
      if (oi.owner && oi.owner.proc_duration_check) {
          for (const pdc of oi.owner.proc_duration_check) {
              const procName = formatProcName(pdc.proc);
              const dur = pdc.duration;
              if (dur && dur.than !== undefined) {
                  if (dur.if === 'greater_or_equal') {
                      conditions.push(`If self has ${dur.than}+ ${procName}`);
                  } else if (dur.if === 'greater') {
                      conditions.push(`If self has more than ${dur.than} ${procName}`);
                  } else if (dur.if === 'less_or_equal') {
                      conditions.push(`If self has ${dur.than} or less ${procName}`);
                  } else if (dur.if === 'less') {
                      conditions.push(`If self has less than ${dur.than} ${procName}`);
                  }
              }
          }
      }

      // Owner/target procs inside and/or arrays (e.g., Nova: {and: [{owner: {procs}}, {mode}]})
      if (oi.and) {
          for (const sub of oi.and) {
              if (sub.owner && sub.owner.procs) {
                  const procs = sub.owner.procs.map(p => formatProcName(p)).join(' or ');
                  conditions.push(`If self has ${procs}`);
              }
              if (sub.owner && sub.owner.health_pct) {
                  const hp = sub.owner.health_pct;
                  const threshold = hp.than || 0;
                  if (hp.if === 'less') {
                      conditions.push(`If this character has less than ${threshold}% Health`);
                  } else if (hp.if === 'less_or_equal') {
                      conditions.push(`If this character has ${threshold}% or less Health`);
                  } else if (hp.if === 'greater') {
                      conditions.push(`If this character has more than ${threshold}% Health`);
                  } else if (hp.if === 'greater_or_equal') {
                      conditions.push(`If this character has ${threshold}% or more Health`);
                  }
              }
              if (sub.target && sub.target.procs) {
                  const procs = sub.target.procs.map(p => formatProcName(p)).join(' or ');
                  conditions.push(`If the primary target has ${procs}`);
              }
              if (sub.owner && sub.owner.barrier_pct) {
                  const bp = sub.owner.barrier_pct;
                  const threshold = bp.than || 0;
                  if (bp.if === 'greater_or_equal') conditions.push(`If this character has ${threshold}% or more Barrier`);
                  else if (bp.if === 'greater') conditions.push(`If this character has more than ${threshold}% Barrier`);
                  else if (bp.if === 'not_equal' && threshold === 0) conditions.push(`If this character has Barrier`);
              }
              if (sub.target && sub.target.barrier_pct) {
                  const bp = sub.target.barrier_pct;
                  const threshold = bp.than || 0;
                  if (bp.if === 'not_equal' && threshold === 0) conditions.push(`If the primary target has Barrier`);
                  else if (bp.if === 'equal' && threshold === 0) conditions.push(`If the primary target has no Barrier`);
              }
              if (sub.owner && sub.owner.proc_duration_check) {
                  for (const pdc of sub.owner.proc_duration_check) {
                      const procName = formatProcName(pdc.proc);
                      const dur = pdc.duration;
                      if (dur && dur.than !== undefined) {
                          if (dur.if === 'greater_or_equal') conditions.push(`If self has ${dur.than}+ ${procName}`);
                          else if (dur.if === 'greater') conditions.push(`If self has more than ${dur.than} ${procName}`);
                          else if (dur.if === 'less_or_equal') conditions.push(`If self has ${dur.than} or less ${procName}`);
                          else if (dur.if === 'less') conditions.push(`If self has less than ${dur.than} ${procName}`);
                      }
                  }
              }
              if (sub.owner && sub.owner.any_proc_of_type) {
                  const type = sub.owner.any_proc_of_type;
                  conditions.push(`If self has ${type === 'buff' ? 'any positive effects' : 'any negative effects'}`);
              }
              // Handle not.X inside and[] sub-objects
              if (sub.not) {
                  if (sub.not.mode) {
                      const modeName = sub.not.mode === 'AVA' ? 'WAR' : sub.not.mode === 'PVP' ? 'CRUCIBLE' : sub.not.mode === 'GRAND_TOURNAMENT' ? 'CRUCIBLE SHOWDOWN' : sub.not.mode === 'INSANITY' ? 'INCURSION' : sub.not.mode === 'BATTLEGROUNDS' ? 'ARENA' : sub.not.mode;
                      conditions.push(`Not in ${modeName}`);
                  }
                  if (sub.not.owner && sub.not.owner.any_proc_of_type) {
                      const type = sub.not.owner.any_proc_of_type;
                      conditions.push(`If self has no ${type === 'buff' ? 'positive effects' : 'negative effects'}`);
                  }
                  if (sub.not.owner && sub.not.owner.procs) {
                      const procs = sub.not.owner.procs.map(p => formatProcName(p)).join(' or ');
                      conditions.push(`If self does not have ${procs}`);
                  }
                  if (sub.not.target && sub.not.target.procs) {
                      const procs = sub.not.target.procs.map(p => formatProcName(p)).join(' or ');
                      conditions.push(`If the primary target does not have ${procs}`);
                  }
              }
          }
      }
      if (oi.or) {
          const ownerProcs = [];
          const targetProcs = [];
          for (const sub of oi.or) {
              if (sub.owner && sub.owner.procs) ownerProcs.push(...sub.owner.procs);
              if (sub.target && sub.target.procs) targetProcs.push(...sub.target.procs);
          }
          if (ownerProcs.length > 0) {
              conditions.push(`If self has ${ownerProcs.map(p => formatProcName(p)).join(' or ')}`);
          }
          if (targetProcs.length > 0) {
              conditions.push(`If the primary target has ${targetProcs.map(p => formatProcName(p)).join(' or ')}`);
          }
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
              const modeName = neg.mode === 'AVA' ? 'WAR' : neg.mode === 'PVP' ? 'CRUCIBLE' : neg.mode === 'GRAND_TOURNAMENT' ? 'CRUCIBLE SHOWDOWN' : neg.mode === 'INSANITY' ? 'INCURSION' : neg.mode === 'BATTLEGROUNDS' ? 'ARENA' : neg.mode;
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
          if (neg.owner && neg.owner.any_proc_of_type) {
              const type = neg.owner.any_proc_of_type;
              conditions.push(`If self has no ${type === 'buff' ? 'positive effects' : 'negative effects'}`);
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

  // Handle only_if_target (trait-based and proc-based conditions on the target)
  if (action.only_if_target) {
      const extractTargetConditions = (obj) => {
          const parts = [];
          if (obj.traits && obj.traits.has_any) {
              parts.push('is ' + obj.traits.has_any.map(t => formatProcName(t).toUpperCase()).join(' or '));
          }
          if (obj.target && obj.target.procs) {
              parts.push('has ' + obj.target.procs.map(p => formatProcName(p)).join(' or '));
          }
          if (obj.target && obj.target.any_proc_of_type) {
              const type = obj.target.any_proc_of_type;
              parts.push('has ' + (type === 'buff' ? 'positive effects' : 'negative effects'));
          }
          if (obj.target && obj.target.barrier_pct) {
              parts.push('has Barrier');
          }
          if (obj.not) {
              const neg = obj.not;
              if (neg.traits && neg.traits.has_any) {
                  parts.push('is not ' + neg.traits.has_any.map(t => formatProcName(t).toUpperCase()).join(' or '));
              }
              if (neg.target && neg.target.procs) {
                  parts.push('does not have ' + neg.target.procs.map(p => formatProcName(p)).join(' or '));
              }
              if (neg.target && neg.target.any_proc_of_type) {
                  const type = neg.target.any_proc_of_type;
                  parts.push('has no ' + (type === 'buff' ? 'positive effects' : 'negative effects'));
              }
          }
          if (obj.and) {
              const subParts = obj.and.map(sub => {
                  // Skip relationship-only entries (handled separately)
                  if (sub.relationship && !sub.traits && !sub.target && !sub.not) return '';
                  return extractTargetConditions(sub);
              }).filter(x=>x);
              if (subParts.length > 0) parts.push(subParts.join(' and '));
          }
          if (obj.or) {
              const subParts = obj.or.map(extractTargetConditions).filter(x=>x);
              if (subParts.length > 0) parts.push(subParts.join(' or '));
          }
          return parts.join(' and ');
      };

      // Check if this is an ally-relationship condition (assisting a specific ally type)
      const hasAllyRelationship = (obj) => {
          if (obj.relationship === 'ally') return true;
          if (obj.and) return obj.and.some(sub => hasAllyRelationship(sub));
          return false;
      };
      const extractAllyTraits = (obj) => {
          if (obj.relationship === 'ally' && obj.traits && obj.traits.has_any) {
              return obj.traits.has_any.map(t => formatProcName(t).toUpperCase()).join(' or ');
          }
          if (obj.and) {
              for (const sub of obj.and) {
                  const t = extractAllyTraits(sub);
                  if (t) return t;
              }
          }
          return '';
      };

      if (hasAllyRelationship(action.only_if_target)) {
          const traits = extractAllyTraits(action.only_if_target);
          if (traits) {
              conditions.push(`If assisting a ${traits} ally`);
          } else {
              // No traits — condition is simply "on assist" (ally target vs enemy target)
              conditions.push('On Assist');
          }
      } else {
          const targetCond = extractTargetConditions(action.only_if_target);
          if (targetCond) {
              conditions.push(`If the primary target ${targetCond}`);
          }
      }
  }

  if (conditions.length > 0) {
    return conditions.join(', ') + ', ';
  }
  return '';
}

// Buffs that are inherently self-targeting (even when data says target: ally with no limit)
const SELF_ONLY_PROCS = new Set([
    'Stealth', 'InvisibleNonPersist', 'Taunt',
    'OffenseUp', 'SpeedUp', 'DefenseUp', 'Counter', 'Evade', 'DebuffBlock'
]);

function getTargetText(target, procNames) {
    if (!target) return 'the primary target';

    if (target.relation === 'ally') {
        const limit = getMax(target.limit);
        let traits = extractTraitsFromFilter(target.filter);

        // Check if self is excluded from targeting (owner_ok: false)
        let excludeSelf = false;
        if (target.filter) {
            if (target.filter.owner_ok === false) excludeSelf = true;
            if (target.filter.and) {
                for (const sub of target.filter.and) {
                    if (sub.owner_ok === false) excludeSelf = true;
                }
            }
        }

        // Check for health percentage filter on targets
        let healthFilter = '';
        if (target.filter && target.filter.target && target.filter.target.health_pct) {
            const hp = target.filter.target.health_pct;
            const threshold = hp.than || 0;
            if (hp.if === 'less_or_equal') healthFilter = ` below ${threshold}% Health`;
            else if (hp.if === 'less') healthFilter = ` below ${threshold}% Health`;
            else if (hp.if === 'greater_or_equal') healthFilter = ` above ${threshold}% Health`;
            else if (hp.if === 'greater') healthFilter = ` above ${threshold}% Health`;
        }

        const selfSuffix = excludeSelf ? ' (excluding self)' : '';

        // Handle special targeting types
        if (target.type === 'by_least_health') return `the most injured ${traits}ally${selfSuffix}`;
        if (target.type === 'random') return `a random ${traits}ally${healthFilter}${selfSuffix}`;
        if (target.type === 'by_least_turn_meter') return `the ${traits}ally with the lowest Speed Bar${selfSuffix}`;
        if (target.type === 'by_most_stat') {
            const statName = target.by_stat ? formatStatName(target.by_stat) : '';
            return statName ? `the ${traits}ally with the highest ${statName}${selfSuffix}` : `an ${traits}ally${selfSuffix}`;
        }

        if (!limit) {
            // Check if all procs are self-only types
            if (procNames && procNames.length > 0 && procNames.every(p => SELF_ONLY_PROCS.has(p))) {
                return 'self';
            }
            if (traits) return `all ${traits}allies${healthFilter}`;
            return 'allies';
        }
        if (limit === 1) {
            if (traits) return `a random ${traits}ally${healthFilter}${selfSuffix}`;
            return excludeSelf ? `a random ally${selfSuffix}` : 'self';
        }

        if (limit >= 10) {
             if (traits) return `self and all ${traits}allies${healthFilter}`;
             return `allies${healthFilter}`;
        }

        return `${limit} ${traits}allies${healthFilter}${selfSuffix}`;
    }

    // Enemy targeting with explicit limit (multi-target attacks)
    if (target.relation === 'enemy') {
        const limit = getMax(target.limit);
        if (limit && limit > 1) return `${limit} enemies`;
        return 'the primary target';
    }

    // No relation specified but has a limit (enemy multi-target)
    if (!target.relation && target.limit) {
        const limit = getMax(target.limit);
        if (limit && limit > 1) return `${limit} enemies`;
    }

    return 'the primary target';
}

// Extract trait text from a target filter, handling all formats
function extractTraitsFromFilter(filter) {
    if (!filter) return '';
    let parts = [];

    // Simple format: filter.traits.has_any
    if (filter.traits) {
        if (Array.isArray(filter.traits)) {
            // Plain array format: filter.traits = ["NewAvenger"]
            parts.push(filter.traits.map(t => formatProcName(t).toUpperCase()).join(' or '));
        } else if (filter.traits.has_any) {
            parts.push(filter.traits.has_any.map(t => formatProcName(t).toUpperCase()).join(' or '));
        } else if (filter.traits.and) {
            // Compound traits: filter.traits.and = [{has_any: ["Hero"]}, {has_any: ["SpiderVerse"]}]
            const andParts = filter.traits.and
                .filter(sub => sub.has_any)
                .map(sub => sub.has_any.map(t => formatProcName(t).toUpperCase()).join(' or '));
            if (andParts.length > 0) parts.push(andParts.join(' '));
        }
        if (filter.traits.not && filter.traits.not.has_any) {
            parts.push('non-' + filter.traits.not.has_any.map(t => formatProcName(t).toUpperCase()).join('/'));
        }
    }

    // Negative target filter: filter.not.target.procs or filter.not.target.states
    if (filter.not && filter.not.target) {
        if (filter.not.target.procs) {
            const procs = filter.not.target.procs.map(p => formatProcName(p)).join(' or ');
            parts.push(`without ${procs}`);
        }
        if (filter.not.target.states) {
            const states = filter.not.target.states.map(s => s === 'Spawned' ? 'non-Summoned' : s);
            parts.push(states.join(' or '));
        }
    }

    // Nested and-array format: filter.and = [{traits: {has_any: [...]}}, ...]
    if (filter.and) {
        for (const sub of filter.and) {
            if (sub.traits && sub.traits.has_any) {
                parts.push(sub.traits.has_any.map(t => formatProcName(t).toUpperCase()).join(' or '));
            }
            if (sub.or) {
                const orTraits = [];
                for (const osub of sub.or) {
                    if (osub.traits && osub.traits.has_any) {
                        orTraits.push(...osub.traits.has_any.map(t => formatProcName(t).toUpperCase()));
                    }
                    if (osub.character) {
                        orTraits.push(...osub.character.map(c => formatProcName(c)));
                    }
                }
                if (orTraits.length > 0) parts.push(orTraits.join(' or '));
            }
            if (sub.character) {
                parts.push(sub.character.map(c => formatProcName(c)).join(' or '));
            }
        }
    }

    // Or-array format: filter.or = [{traits: {has_any: [...]}}, ...]
    if (filter.or) {
        const orParts = [];
        for (const sub of filter.or) {
            if (sub.traits && sub.traits.has_any) {
                orParts.push(...sub.traits.has_any.map(t => formatProcName(t).toUpperCase()));
            }
        }
        if (orParts.length > 0) parts.push(orParts.join(' or '));
    }

    return parts.length > 0 ? parts.join(' ') + ' ' : '';
}

// Map internal stat names to display names
function formatStatName(stat) {
    const statMap = {
        'damage': 'Damage',
        'ability_damage_pct': 'Damage',
        'armor_pierce_pct': 'Piercing',
        'health': 'Health',
        'speed': 'Speed',
        'focus': 'Focus',
        'resist': 'Resist',
        'armor': 'Armor',
    };
    return statMap[stat] || stat;
}

function processCharacter(charName, charData) {
  const safety = charData.safety;
  if (!safety) return null;

  let damage = 0;
  let piercing = 0;
  let drain = 0;
  let critChance = 0;
  let critDmg = 0;
  let mainStatsCondition = ''; // Track if main stats came from a conditional action
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
      // Skip shared template actions that only apply to a specific character
      // (e.g., "clear Binary on assist" exists on 19+ basics but only Captain Marvel can have Binary)
      if (a.action === 'proc_remove' && a.procs === 'Binary' &&
          a.only_if && a.only_if.owner && a.only_if.owner.procs &&
          a.only_if.owner.procs.includes('Binary') && charName !== 'CaptainMarvel') return;
      // Skip basic's inherent attack damage (both counter+assist, no conditions, stat_modifier only)
      // These are the basic ability's own damage stats, not ISO-8 bonuses
      // But keep actions where stat_modifiers have apply_if (conditional bonuses like Vulture)
      const hasConditionalStats = a.stat_modifier && a.stat_modifier.some(m => m.apply_if);
      if (hasCounter && hasAssist && !a.action &&
          !a.only_if && !a.only_if_target && !a.only_if_any && !a.only_if_outcome &&
          !hasConditionalStats) return;

      let prefix = '';
      if (hasCounter && !hasAssist) prefix = 'On Counter, ';
      else if (hasAssist && !hasCounter) prefix = 'On Assist, ';
      // both counter+assist → no prefix

      allActions.push({ ...a, _source: 'basic', _counterAssistPrefix: prefix });
    });
  }

  // Pre-scan: collect procs that appear in unconditional actions (to detect "+N" additional procs)
  const unconditionalProcs = new Set();
  allActions.forEach(action => {
      const maxPct = action.action_pct
          ? (Array.isArray(action.action_pct) ? action.action_pct[action.action_pct.length - 1] : action.action_pct)
          : 100;
      if (maxPct === 0) return;
      if (action.action === 'proc' && action.procs &&
          !action.only_if && !action.only_if_target && !action.only_if_any && !action.only_if_outcome) {
          action.procs.forEach(p => {
              if (p.proc && !p.proc.startsWith('Basic_Level')) {
                  unconditionalProcs.add(formatProcName(p.proc));
              }
          });
      }
  });

  // Pre-scan: check if victim_cant_revive is on ALL stat_modifier actions (making it unconditional)
  const statModActions = allActions.filter(a => a.stat_modifier);
  const activeStatModActions = statModActions.filter(a => {
      const maxPct = a.action_pct
          ? (Array.isArray(a.action_pct) ? a.action_pct[a.action_pct.length - 1] : a.action_pct)
          : 100;
      return maxPct > 0;
  });
  const allHaveVictimCantRevive = activeStatModActions.length > 0 &&
      activeStatModActions.every(a => a.victim_cant_revive);

  // Pre-scan: detect action-level "ignores Defense Up" pattern
  // (multiple actions with same base piercing, one with DefenseUp condition has doubled piercing)
  let actionLevelIgnoresDefUp = false;
  let ignoresDefUpModePrefix = '';
  if (activeStatModActions.length >= 2) {
      const piercingValues = [];
      let hasDefUpCondAction = false;
      let defUpActionOi = null;
      for (const a of activeStatModActions) {
          const oi = a.only_if;
          const oiStr = oi ? JSON.stringify(oi) : '';
          const pierce = a.stat_modifier.find(m => m.stat === 'armor_pierce_pct');
          if (pierce && pierce.delta) {
              const val = getMax(pierce.delta);
              piercingValues.push(val);
              if (oiStr.includes('"DefenseUp"') && !oiStr.includes('"not"')) {
                  hasDefUpCondAction = true;
                  defUpActionOi = oi;
              }
          }
      }
      if (hasDefUpCondAction && new Set(piercingValues).size > 1) {
          actionLevelIgnoresDefUp = true;
          // Extract mode scope from the DefenseUp variant action
          if (defUpActionOi) {
              const modeParts = [];
              const extractMode = (obj) => {
                  if (!obj) return;
                  if (obj.mode) {
                      const m = obj.mode === 'AVA' ? 'WAR' : obj.mode === 'PVP' ? 'CRUCIBLE' : obj.mode === 'GRAND_TOURNAMENT' ? 'CRUCIBLE SHOWDOWN' : obj.mode === 'INSANITY' ? 'INCURSION' : obj.mode === 'BATTLEGROUNDS' ? 'ARENA' : obj.mode;
                      modeParts.push(m);
                  }
                  if (obj.combat_side) modeParts.push(obj.combat_side.toUpperCase());
              };
              if (defUpActionOi.and) {
                  for (const sub of defUpActionOi.and) extractMode(sub);
              } else {
                  extractMode(defUpActionOi);
              }
              // Remove DefenseUp-related parts, keep mode/side
              if (modeParts.length > 0) {
                  ignoresDefUpModePrefix = `On ${modeParts.join(' ')}, `;
              }
          }
      }
  }

  // Iterate all actions
  let prevActionWasVisible = false; // Track if previous action produced visible output
  let prevActionWasConditional = false; // Track if previous action had a condition
  let prevConditionPrefix = ''; // Store previous action's condition for if_prev_ran
  const actionConditionPrefixes = []; // Store condition prefix per action index (for if_arbitrary_action_ran)
  allActions.forEach((action, actionIdx) => {
      // Check action_pct: if max level chance is 0, skip entirely; if < 100, note probability
      const maxActionPct = action.action_pct
          ? (Array.isArray(action.action_pct) ? action.action_pct[action.action_pct.length - 1] : action.action_pct)
          : 100;
      if (maxActionPct === 0) { prevActionWasVisible = false; prevActionWasConditional = false; actionConditionPrefixes.push(''); return; }

      // Skip empty_result but track its condition for if_prev_ran chains
      if (action.action === 'empty_result') {
          const emptyCondPrefix = parseConditions(action);
          prevActionWasVisible = false;
          prevActionWasConditional = !!(action.only_if || action.only_if_target || action.only_if_any || action.only_if_outcome);
          prevConditionPrefix = emptyCondPrefix;
          actionConditionPrefixes.push(emptyCondPrefix);
          return;
      }

      let conditionPrefix = (action._counterAssistPrefix || '') + parseConditions(action);

      // Handle action_cond: "if_prev_skipped" — fallback when previous conditional action didn't fire
      // Only show "Otherwise" if the previous action was visible AND had a condition the user can see
      if (action.action_cond === 'if_prev_skipped' && prevActionWasVisible && prevActionWasConditional) {
          const ownConditions = parseConditions(action);
          conditionPrefix = (action._counterAssistPrefix || '') + 'Otherwise, ' + (ownConditions || '');
      } else if (action.action_cond === 'if_prev_skipped') {
          // Previous action was invisible or unconditional, drop "Otherwise"
          conditionPrefix = (action._counterAssistPrefix || '') + parseConditions(action);
      }

      // Handle action_cond: "if_prev_ran" — chained effect that inherits previous condition
      if (action.action_cond === 'if_prev_ran') {
          const ownConditions = parseConditions(action);
          if (!ownConditions && prevConditionPrefix) {
              conditionPrefix = (action._counterAssistPrefix || '') + prevConditionPrefix;
          }
      }

      // Handle action_cond: "if_arbitrary_action_ran" — inherits condition from a specific action index
      if (action.action_cond === 'if_arbitrary_action_ran' && action.arbitrary_action_idx !== undefined) {
          const ownConditions = parseConditions(action);
          const refPrefix = actionConditionPrefixes[action.arbitrary_action_idx] || '';
          if (refPrefix) {
              // Put inherited condition first, then own conditions (e.g., "Otherwise, On Crit, ...")
              conditionPrefix = (action._counterAssistPrefix || '') + refPrefix + (ownConditions || '');
          }
      }

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
              } else if (oia.filter.and) {
                  // Complex filter — e.g., [{owner_ok: false}, {traits: {and: [{has_any: ["XFactor"]}, ...]}}]
                  let traitText = '';
                  for (const sub of oia.filter.and) {
                      if (sub.traits) {
                          if (sub.traits.has_any) {
                              traitText = sub.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                          } else if (sub.traits.and) {
                              for (const tsub of sub.traits.and) {
                                  if (tsub.has_any) {
                                      traitText = tsub.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                                      break;
                                  }
                              }
                          }
                          if (traitText) break;
                      }
                  }
                  if (traitText) {
                      conditionPrefix += `If an ${traitText} ally exists, `;
                  }
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
      // Check if only_if_target has relationship="ally" (bonus when assisting a specific ally type)
      const isAllyTargetConditional = action.only_if_target && JSON.stringify(action.only_if_target).includes('"relationship":"ally"');

      // 1. Stats (Damage/Piercing)
      // Skip DefenseUp variant actions when action-level "ignores Defense Up" is detected
      const actionOnlyIfStr = action.only_if ? JSON.stringify(action.only_if) : '';
      const isDefUpVariantAction = actionLevelIgnoresDefUp && actionOnlyIfStr.includes('"DefenseUp"') &&
          !actionOnlyIfStr.includes('"not"');
      if (isDefUpVariantAction && action.stat_modifier) {
          // Don't process this action's stats — the "ignores Defense Up" note handles it
          const defUpNote = ignoresDefUpModePrefix
              ? `${ignoresDefUpModePrefix}this attack ignores Defense Up.`
              : 'This attack ignores Defense Up.';
          if (!notes.includes(defUpNote)) {
              notes.push(defUpNote);
          }
      }
      if (action.stat_modifier && !isDefUpVariantAction) {
        let localDmg = 0;
        let localPierce = 0;
        let localDrain = 0;
        let localCritChance = 0;
        let localCritDmg = 0;
        let ignoresDefenseUp = false;

        action.stat_modifier.forEach(mod => {
          // Skip dynamic modifiers that don't have a fixed delta (e.g., delta_from: "armor_pct")
          if (!mod.delta) return;

          if (mod.stat === 'ability_damage_pct') {
            const val = getMax(mod.delta);
            if (!mod.apply_if) {
                localDmg += val; // Accumulate unconditional values
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
                localPierce += val; // Accumulate unconditional values
            } else if (mod.apply_if.not) {
                // "not X" conditions indicate the base/default state
                // Covers: Blade/SuperSkrull (not DefenseUp variants)
                if (val > localPierce) localPierce = val;
            }
          } else if (mod.stat === 'drain_pct') {
            if (!mod.apply_if) {
                const val = getMax(mod.delta);
                localDrain += val; // Accumulate unconditional values
            }
          } else if (mod.stat === 'crit_chance_pct') {
            if (!mod.apply_if) {
                const val = getMax(mod.delta);
                localCritChance += val; // Accumulate unconditional values
            }
          } else if (mod.stat === 'crit_damage_pct') {
            if (!mod.apply_if) {
                const val = getMax(mod.delta);
                localCritDmg += val; // Accumulate unconditional values
            }
          }
        });

        if (ignoresDefenseUp) {
            if (!notes.some(n => n.includes("This attack ignores Defense Up."))) {
                notes.push("This attack ignores Defense Up.");
            }
        }

        // Only process attack stats if actual attack values were found
        // (skip actions that only have focus_pct or other non-attack stat_modifiers)
        const hasAttackStats = localDmg > 0 || localPierce > 0 || localDrain > 0 || localCritChance > 0 || localCritDmg > 0;

        if (hasAttackStats) {
            const isFromBasic = action._source === 'basic';
            // Check if action has a positive only_if condition (not just a negation base case)
            const isPositivelyConditional = action.only_if &&
                !(action.only_if.not && Object.keys(action.only_if).length === 1);
            const hasBaseStats = damage > 0 || piercing > 0;
            if (isFromBasic || isCrit || isAllyConditional || isAllyTargetConditional) {
                // Check if this is inherent basic counter/assist damage that should be suppressed
                // (counter+assist with no action-level conditions and no special targeting)
                // Only conditional apply_if stats from second pass should be shown for these
                const isInherentBasicDmg = isFromBasic && action.counter === true && action.assist !== undefined
                    && !action.only_if && !action.only_if_target && !action.only_if_any && !action.only_if_outcome
                    && !(action.target && action.target.primary_selection === 'exclude_from_pool');

                if (!isInherentBasicDmg) {
                // Basic counter/assist bonuses, crit bonuses, ally-conditional, and ally-target-conditional stats always go as effect lines
                const parts = [];
                if (localDmg > 0) parts.push(`${localDmg}% damage`);
                if (localPierce > 0) parts.push(`${localPierce}% Piercing`);
                if (localDrain > 0) parts.push(`${localDrain}% Drain`);
                if (localCritChance > 0) parts.push(`${localCritChance}% Crit Chance`);
                if (localCritDmg > 0) parts.push(`${localCritDmg}% Crit Damage`);

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
                }
            } else if ((isConditionalTarget || (isPositivelyConditional && hasBaseStats)) && hasBaseStats) {
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
                if (isPositivelyConditional && conditionPrefix) {
                    mainStatsCondition = conditionPrefix;
                }
                // When if_prev_skipped overwrites main stats, it's the base/default case
                // Clear mainStatsCondition and show old conditional stats as effect if different
                if (action.action_cond === 'if_prev_skipped' && mainStatsCondition) {
                    if (localDmg !== damage || localPierce !== piercing || localDrain !== drain) {
                        const oldParts = [];
                        if (damage > 0) oldParts.push(`${damage}% damage`);
                        if (piercing > 0) oldParts.push(`${piercing}% Piercing`);
                        if (drain > 0) oldParts.push(`${drain}% Drain`);
                        if (oldParts.length > 0) {
                            effects.push(`${mainStatsCondition}attack for ${oldParts.join(' + ')} instead.`);
                        }
                    }
                    mainStatsCondition = '';
                }
                if (localDmg > 0) damage = localDmg;
                if (localPierce > 0) piercing = localPierce;
                if (localDrain > 0) drain = localDrain;
                if (localCritChance > 0) critChance = localCritChance;
                if (localCritDmg > 0) critDmg = localCritDmg;
            }
        }

        // Second pass: generate effect lines for conditional stat bonuses (positive apply_if)
        action.stat_modifier.forEach(mod => {
            if (!mod.delta || !mod.apply_if) return;
            // Skip pure negation conditions (already handled as base values above)
            if (mod.apply_if.not && Object.keys(mod.apply_if).length === 1) return;
            // Skip DefenseUp/DefenseDown piercing conditions (handled by ignoresDefenseUp note)
            // Only skip for piercing stats — damage bonuses vs DefenseUp targets are genuine
            if (mod.stat === 'armor_pierce_pct') {
                const applyIfStr = JSON.stringify(mod.apply_if);
                if (applyIfStr.includes('"DefenseUp"') || applyIfStr.includes('"DefenseDown"')) return;
            }

            const val = getMax(mod.delta);
            if (val === 0) return;

            // Map stat to display name
            let statName = '';
            if (mod.stat === 'ability_damage_pct' || mod.stat === 'damage_pct') statName = 'damage';
            else if (mod.stat === 'armor_pierce_pct') statName = 'Piercing';
            else if (mod.stat === 'drain_pct') statName = 'Drain';
            else if (mod.stat === 'crit_chance_pct') { statName = 'Crit Chance'; }
            else if (mod.stat === 'crit_damage_pct') { statName = 'Crit Damage'; }
            else return; // skip non-displayable stats (focus_pct, accuracy_pct, etc.)

            // Build condition text from apply_if
            const condParts = [];
            const ai = mod.apply_if;

            // Mode conditions
            const modeText = extractModeText(ai);
            if (modeText) condParts.push(`In ${modeText}`);

            // Target proc conditions
            if (ai.target && ai.target.procs) {
                const procs = ai.target.procs.map(p => formatProcName(p)).join(' or ');
                condParts.push(`If target has ${procs}`);
            }
            if (ai.target && ai.target.barrier_pct) {
                const bp = ai.target.barrier_pct;
                if (bp.if === 'equal' && bp.than === 0) condParts.push('If target has no Barrier');
                else if (bp.if === 'greater' && bp.than === 0) condParts.push('If target has Barrier');
            }
            if (ai.target && ai.target.health_pct) {
                const hp = ai.target.health_pct;
                const threshold = hp.than || 0;
                if (hp.if === 'less') condParts.push(`If target has less than ${threshold}% Health`);
                else if (hp.if === 'less_or_equal') condParts.push(`If target has ${threshold}% or less Health`);
                else if (hp.if === 'greater') condParts.push(`If target has more than ${threshold}% Health`);
                else if (hp.if === 'greater_or_equal') condParts.push(`If target has ${threshold}% or more Health`);
            }

            // Owner conditions
            if (ai.owner && ai.owner.procs) {
                const procs = ai.owner.procs.map(p => formatProcName(p)).join(' or ');
                condParts.push(`If self has ${procs}`);
            }
            if (ai.owner && ai.owner.health_pct) {
                const hp = ai.owner.health_pct;
                const threshold = hp.than || 0;
                if (hp.if === 'less') condParts.push(`If this character has less than ${threshold}% Health`);
                else if (hp.if === 'less_or_equal') condParts.push(`If this character has ${threshold}% or less Health`);
                else if (hp.if === 'greater') condParts.push(`If this character has more than ${threshold}% Health`);
                else if (hp.if === 'greater_or_equal') condParts.push(`If this character has ${threshold}% or more Health`);
            }
            if (ai.owner && ai.owner.barrier_pct) {
                const bp = ai.owner.barrier_pct;
                if (bp.if === 'greater' && bp.than === 0) condParts.push('If self has Barrier');
                else if (bp.if === 'equal' && bp.than === 0) condParts.push('If self has no Barrier');
                else if (bp.if === 'greater_or_equal') condParts.push(`If self has ${bp.than}% or more Barrier`);
            }
            if (ai.owner && ai.owner.proc_duration_check) {
                for (const pdc of ai.owner.proc_duration_check) {
                    const procName = formatProcName(pdc.proc);
                    const dur = pdc.duration;
                    if (dur && dur.than !== undefined) {
                        if (dur.if === 'greater_or_equal') condParts.push(`If self has ${dur.than}+ ${procName}`);
                        else if (dur.if === 'greater') condParts.push(`If self has more than ${dur.than} ${procName}`);
                    }
                }
            }

            // Self trait conditions
            if (ai.traits && ai.traits.has_any) {
                const traits = ai.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                condParts.push(`If self is ${traits}`);
            }

            // Count conditions
            if (ai.count && ai.count_filter) {
                const cf = ai.count_filter;
                let traitText = '';
                if (cf.character) {
                    traitText = cf.character.map(c => formatProcName(c)).join(' or ');
                } else if (cf.traits && cf.traits.has_any) {
                    traitText = cf.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                } else if (cf.and) {
                    for (const sub of cf.and) {
                        if (sub.traits && sub.traits.has_any) {
                            traitText = sub.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase();
                            break;
                        }
                    }
                }
                const threshold = ai.count.than || 0;
                const rel = cf.relationship || 'ally';
                if (threshold <= 1 && cf.character) {
                    condParts.push(`If ${traitText} is an ${rel}`);
                } else if (traitText) {
                    condParts.push(`If ${threshold}+ ${traitText} ${rel === 'ally' ? 'allies' : rel + 's'}`);
                }
            }

            // Conditions inside and/or arrays
            if (ai.and) {
                for (const sub of ai.and) {
                    if (sub.target && sub.target.procs) {
                        condParts.push(`If target has ${sub.target.procs.map(p => formatProcName(p)).join(' or ')}`);
                    }
                    if (sub.owner && sub.owner.procs) {
                        condParts.push(`If self has ${sub.owner.procs.map(p => formatProcName(p)).join(' or ')}`);
                    }
                    if (sub.owner && sub.owner.health_pct) {
                        const hp = sub.owner.health_pct;
                        const threshold = hp.than || 0;
                        if (hp.if === 'less') condParts.push(`If this character has less than ${threshold}% Health`);
                        else if (hp.if === 'less_or_equal') condParts.push(`If this character has ${threshold}% or less Health`);
                        else if (hp.if === 'greater') condParts.push(`If this character has more than ${threshold}% Health`);
                        else if (hp.if === 'greater_or_equal') condParts.push(`If this character has ${threshold}% or more Health`);
                    }
                    if (sub.owner && sub.owner.proc_duration_check) {
                        for (const pdc of sub.owner.proc_duration_check) {
                            const procName = formatProcName(pdc.proc);
                            const dur = pdc.duration;
                            if (dur && dur.than !== undefined) {
                                if (dur.if === 'greater_or_equal') condParts.push(`If self has ${dur.than}+ ${procName}`);
                                else if (dur.if === 'greater') condParts.push(`If self has more than ${dur.than} ${procName}`);
                            }
                        }
                    }
                    if (sub.owner && sub.owner.barrier_pct) {
                        const bp = sub.owner.barrier_pct;
                        if (bp.if === 'greater_or_equal') condParts.push(`If self has ${bp.than}% or more Barrier`);
                        else if (bp.if === 'greater' && bp.than === 0) condParts.push('If self has Barrier');
                    }
                    if (sub.target && sub.target.barrier_pct) {
                        const bp = sub.target.barrier_pct;
                        if (bp.if === 'not_equal' && bp.than === 0) condParts.push('If target has Barrier');
                        else if (bp.if === 'equal' && bp.than === 0) condParts.push('If target has no Barrier');
                    }
                }
            }
            if (ai.or) {
                const orParts = [];
                for (const sub of ai.or) {
                    // Skip mode-only entries (already handled by extractModeText above)
                    if (sub.mode && Object.keys(sub).length === 1) continue;
                    if (sub.target && sub.target.procs) {
                        orParts.push(`target has ${sub.target.procs.map(p => formatProcName(p)).join(' or ')}`);
                    }
                    if (sub.owner && sub.owner.procs) {
                        orParts.push(`self has ${sub.owner.procs.map(p => formatProcName(p)).join(' or ')}`);
                    }
                    if (sub.owner && sub.owner.health_pct) {
                        const hp = sub.owner.health_pct;
                        const threshold = hp.than || 0;
                        if (hp.if === 'less') orParts.push(`this character has less than ${threshold}% Health`);
                        else if (hp.if === 'less_or_equal') orParts.push(`this character has ${threshold}% or less Health`);
                        else if (hp.if === 'greater') orParts.push(`this character has more than ${threshold}% Health`);
                        else if (hp.if === 'greater_or_equal') orParts.push(`this character has ${threshold}% or more Health`);
                    }
                    if (sub.traits && sub.traits.has_any) {
                        orParts.push(`self is ${sub.traits.has_any.map(t => formatProcName(t)).join(' or ').toUpperCase()}`);
                    }
                    if (sub.character) {
                        orParts.push(`self is ${sub.character.map(c => formatProcName(c)).join(' or ')}`);
                    }
                }
                if (orParts.length > 0) condParts.push(`If ${orParts.join(' or ')}`);
            }

            if (condParts.length === 0) return; // Can't parse condition, skip

            const condText = condParts.join(', ');
            // Deduplicate: skip if another effect already ends with the same core text
            // (e.g., safety "Otherwise, If X, +Y" and basic "If X, +Y" are duplicates)
            const coreEffect = val > 0
                ? `${condText}, +${val}% ${statName}.`
                : `${condText}, ${val}% ${statName}.`;
            if (effects.some(e => e.endsWith(coreEffect))) return;

            if (val > 0) {
                effects.push(`${conditionPrefix}${condText}, +${val}% ${statName}.`);
            } else {
                effects.push(`${conditionPrefix}${condText}, ${val}% ${statName}.`);
            }
        });
      }

      // victim_cant_revive can appear on any action (not just stat_modifier ones)
      if (action.victim_cant_revive) {
          const cantReviveNote = "Enemies killed by this attack cannot be revived.";
          if (allHaveVictimCantRevive) {
              // All actions have it — unconditional note
              if (!notes.includes(cantReviveNote)) {
                  notes.push(cantReviveNote);
              }
          } else if (conditionPrefix) {
              const condNote = `${conditionPrefix}enemies killed by this attack cannot be revived.`;
              if (!notes.includes(condNote)) {
                  notes.push(condNote);
              }
          } else {
              if (!notes.includes(cantReviveNote)) {
                  notes.push(cantReviveNote);
              }
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
        const procNamesList = action.procs.map(p => p.proc);
        let targetText = getTargetText(action.target, procNamesList);
        // If no target specified, buff procs default to self (debuffs stay on primary target)
        if (!action.target) {
            const allDebuffs = action.procs.every(p => DEBUFF_PROCS.has(p.proc));
            if (!allDebuffs) targetText = 'self';
        }

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

            // Use "+N" format when this conditional proc adds to an existing unconditional one
            const isAdditional = conditionPrefix && unconditionalProcs.has(procName);
            let countText = '';
            if (isAdditional) {
                countText = `+${count} `;
            } else if (count > 1) {
                countText = `${count} `;
            }

            let effectText = '';
            if (targetText === 'self') {
                effectText = `${conditionPrefix}${fullChancePrefix}Gain ${countText}${procName}${durationText}`;
            } else {
                effectText = `${conditionPrefix}${fullChancePrefix}Apply ${countText}${procName}${durationText} to ${targetText}`;
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
        let targetText = getTargetText(action.target);
        // If no target specified, infer from context:
        // - Clearing debuffs with no target = self-cleanse
        // - "If self has X, remove X" with no target = consuming own proc
        if (!action.target) {
            if (action.category === 'debuff') {
                targetText = 'self';
            } else if (action.category === 'none' && action.procs &&
                       action.only_if && action.only_if.owner && action.only_if.owner.procs &&
                       action.only_if.owner.procs.includes(action.procs)) {
                targetText = 'self';
            }
        }
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

      // 5. Health Redistribute (drain HP from target, optionally heal allies)
      if (action.action === 'health_redistribute') {
          const drainPct = getMax(action.drain_pct);
          const maxDrainPct = getMax(action.max_drain_pct);
          const healMulti = getMax(action.heal_multi);

          // Effective drain is capped by max_drain_pct when present
          const effectiveDrain = (maxDrainPct > 0) ? maxDrainPct : drainPct;

          if (effectiveDrain > 0) {
              // Determine drain source (usually enemy, but Sentry drains allies)
              const drainsAllies = action.target && action.target.relation === 'ally';
              const sourceText = drainsAllies ? "allies'" : "target's";

              let text = `${conditionPrefix}${chancePrefix}Drain ${effectiveDrain}% of ${sourceText} Max Health`;

              // Add heal/redistribute info when heal_multi > 0
              if (healMulti > 0 && action.to) {
                  let toText = 'allies';
                  if (action.to.filter) {
                      const traits = action.to.filter.traits;
                      if (traits) {
                          const traitList = Array.isArray(traits)
                              ? traits
                              : (traits.has_any || []);
                          const traitText = traitList.map(t => formatProcName(t).toUpperCase()).join(' or ');
                          if (traitText) toText = `${traitText} allies`;
                      }
                  }
                  text += ` and redistribute to ${toText}`;
              }

              text += '.';
              effects.push(text);
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
              const targetText = getTargetText(action.target);
              if (targetText === 'self' || targetText === 'the primary target') {
                  effects.push(`${conditionPrefix}${chancePrefix}Barrier for ${amount}% of Max Health.`);
              } else {
                  effects.push(`${conditionPrefix}${chancePrefix}Barrier for ${amount}% of Max Health to ${targetText}.`);
              }
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
              const prolongTarget = (targetText && targetText !== 'self' && targetText !== 'the primary target')
                  ? ` on ${targetText}` : '';
              effects.push(`${conditionPrefix}${chancePrefix}Prolong the duration of ${procName}${excludeText} by ${delta}${prolongTarget}.`);
          } else if (delta < 0) {
              const reduceTarget = (targetText && targetText !== 'self' && targetText !== 'the primary target')
                  ? ` on ${targetText}` : '';
              effects.push(`${conditionPrefix}${chancePrefix}Reduce the duration of ${procName}${excludeText} by ${Math.abs(delta)}${reduceTarget}.`);
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

          // Fallback: if no target handler matched, default to self
          if (!targetText) targetText = 'self';

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

      // 17. Attack Ally (call an ally to assist or attack additional enemies)
      if (action.action === 'attack_ally') {
          // Prioritize ally recipient — this means "call ally to assist"
          if (action.recipient && action.recipient.relation === 'ally') {
              const allyText = getTargetText(action.recipient, []);
              effects.push(`${conditionPrefix}Call ${allyText} to assist.`);
          } else if (action.target && action.target.relation === 'enemy') {
              effects.push(`${conditionPrefix}Attack an additional enemy.`);
          } else if (action.recipient && action.recipient.relation === 'enemy') {
              const limit = getMax(action.recipient.limit);
              if (limit && limit > 1) {
                  effects.push(`${conditionPrefix}Attack ${limit} additional enemies.`);
              } else {
                  effects.push(`${conditionPrefix}Attack an additional enemy.`);
              }
          }
      }

      // 18. Set Battlefield Effect (e.g. Odin)
      if (action.action === 'set_battlefield_effect') {
          // Battlefield effects are complex; just note their presence
          effects.push(`${conditionPrefix}Trigger battlefield effect.`);
      }

      // Track that this action produced visible output (for if_prev_skipped/if_prev_ran handling)
      prevActionWasVisible = true;
      prevActionWasConditional = !!(action.only_if || action.only_if_target || action.only_if_any || action.only_if_outcome
          || (maxActionPct > 0 && maxActionPct < 100)
          || ((action.action_cond === 'if_prev_ran' || action.action_cond === 'if_arbitrary_action_ran') && conditionPrefix));
      prevConditionPrefix = conditionPrefix;
      actionConditionPrefixes.push(conditionPrefix);
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

  // Determine main attack target from the first stat_modifier action
  let mainAttackTarget = 'primary target';
  const firstStatAction = activeStatModActions.find(a => {
      const oi = a.only_if ? JSON.stringify(a.only_if) : '';
      return !oi.includes('"DefenseUp"') || oi.includes('"not"');
  });
  if (firstStatAction && firstStatAction.target && firstStatAction.target.relation === 'ally') {
      mainAttackTarget = getTargetText(firstStatAction.target);
  }

  // Generate description
  let description = mainStatsCondition
      ? `${mainStatsCondition}attack ${mainAttackTarget} for `
      : `Attack ${mainAttackTarget} for `;
  if (damage > 0) {
      description += `${damage}% damage`;
      if (piercing > 0) description += ` + ${piercing}% Piercing`;
  } else {
      if (piercing > 0) description += `${piercing}% Piercing`;
      else description = mainStatsCondition
          ? `${mainStatsCondition}attack ${mainAttackTarget}`
          : `Attack ${mainAttackTarget}`; // Fallback if no dmg/piercing
  }

  if (drain > 0) description += ` + ${drain}% Drain`;
  if (critChance > 0) description += ` + ${critChance}% Crit Chance`;
  if (critDmg > 0) description += ` + ${critDmg}% Crit Damage`;

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
    // Skip NPC/tutorial/test characters
    if (/^NUE|^PVE_|^TestMan$/.test(charId)) continue;

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
