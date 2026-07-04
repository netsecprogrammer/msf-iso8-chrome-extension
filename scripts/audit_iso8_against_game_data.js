const fs = require('fs');
const path = require('path');

const PROC_DISPLAY = {
  AbilityBlock: 'Ability Block',
  AccuracyDown: 'Accuracy Down',
  Bleed: 'Bleed',
  BuffBlock: 'Disrupted',
  Charged: 'Charged',
  Counter: 'Counter',
  Deathproof: 'Deathproof',
  DebuffBlock: 'Immunity',
  DefenseDown: 'Defense Down',
  DefenseUp: 'Defense Up',
  Deflect: 'Deflect',
  Disrupted: 'Disrupted',
  DoT: 'Bleed',
  Evade: 'Evade',
  Exposed: 'Exposed',
  HealBlock: 'Heal Block',
  HoT: 'Regeneration',
  Immunity: 'Immunity',
  LockedDebuff: 'Trauma',
  NicoBasic: 'Arcane Runic',
  OffenseDown: 'Offense Down',
  OffenseUp: 'Offense Up',
  Regeneration: 'Regeneration',
  ReviveOnce: 'Revive Once',
  Safeguard: 'Safeguard',
  Slow: 'Slow',
  SpeedUp: 'Speed Up',
  Stealth: 'Stealth',
  Stun: 'Stun',
  Taunt: 'Taunt',
  Trauma: 'Trauma',
  Vulnerable: 'Vulnerable'
};

const ACTION_KEYWORDS = {
  ability_energy: ['Ability Energy'],
  attack_ally: ['assist', 'additional enemy'],
  barrier: ['Barrier'],
  barrier_remove: ['Remove Barrier'],
  clear_proc: ['Clear'],
  damage_mul_per_proc: ['for each'],
  drain: ['Drain'],
  drain_heal_results: ['Share Drain healing'],
  empty_result: [],
  health_redistribute: ['redistribute', 'Max Health'],
  heal: ['Heal'],
  proc_duration: ['Gain', 'Apply', 'Prolong', 'Reduce', 'Lose'],
  proc_flip: ['Flip'],
  proc_remove: ['Clear'],
  proc_transfer: ['Steal', 'Copy', 'Transfer'],
  remove_barrier: ['Remove Barrier'],
  revive: ['Revive'],
  speed_bar: ['Speed Bar'],
  steal_proc: ['Steal'],
  turn_meter: ['Speed Bar']
};

function usage() {
  console.error('Usage: node scripts/audit_iso8_against_game_data.js <iso8_data.json> <combat_data/characters.json> [id,id,...]');
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function maxValue(value) {
  if (Array.isArray(value)) {
    const last = value[value.length - 1];
    if (last && typeof last === 'object' && last.t !== undefined) return Number(last.t) || 0;
    return Number(last) || 0;
  }
  if (value && typeof value === 'object' && value.t !== undefined) return Number(value.t) || 0;
  return Number(value) || 0;
}

function actionCanRun(action) {
  if (!action.action_pct) return true;
  return maxValue(action.action_pct) > 0;
}

function procCount(proc, action) {
  const useCount = maxValue(proc.use_count);
  const applyCount = maxValue(action.apply_count);
  return Math.max(useCount, applyCount, 1);
}

function selectedProcs(action) {
  const procs = (action.procs || []).filter(proc => !String(proc.proc || '').startsWith('Basic_Level'));
  const applyCount = maxValue(action.apply_count);
  if (applyCount > 0) return procs.slice(0, applyCount);
  return procs;
}

function collectSafetyFacts(rawRow) {
  const facts = {
    damageCandidates: [],
    piercingCandidates: [],
    procs: [],
    actionTypes: new Set(),
    cantRevive: false
  };

  for (const action of rawRow?.safety?.actions || []) {
    if (action.victim_cant_revive) facts.cantRevive = true;

    for (const mod of action.stat_modifier || []) {
      const value = maxValue(mod.delta);
      if (value <= 0) continue;
      if (mod.stat === 'ability_damage_pct' || mod.stat === 'damage_pct') facts.damageCandidates.push(value);
      if (mod.stat === 'armor_pierce_pct') facts.piercingCandidates.push(value);
    }

    if (action.action) facts.actionTypes.add(action.action);

    if (action.action === 'proc' && actionCanRun(action)) {
      for (const proc of selectedProcs(action)) {
        const count = procCount(proc, action);
        const display = PROC_DISPLAY[proc.proc] || proc.proc;
        facts.procs.push({ proc: proc.proc, display, count });
      }
    }
  }

  facts.maxDamage = facts.damageCandidates.length ? Math.max(...facts.damageCandidates) : 0;
  facts.maxPiercing = facts.piercingCandidates.length ? Math.max(...facts.piercingCandidates) : 0;
  return facts;
}

function rowText(row) {
  return [row.description, ...(row.effects || []), ...(row.notes || [])].join('\n');
}

function auditRow(id, generatedRow, rawRow) {
  const warnings = [];
  if (!rawRow?.safety?.actions) {
    warnings.push('No raw safety.actions found for generated row');
    return warnings;
  }

  const text = rowText(generatedRow);
  const facts = collectSafetyFacts(rawRow);

  if (facts.maxDamage > 0 && generatedRow.damage > 0 && generatedRow.damage !== facts.maxDamage) {
    warnings.push(`Generated damage ${generatedRow.damage} differs from max safety damage ${facts.maxDamage}`);
  }
  if (facts.maxPiercing > 0 && generatedRow.piercing > 0 && generatedRow.piercing !== facts.maxPiercing) {
    warnings.push(`Generated piercing ${generatedRow.piercing} differs from max safety piercing ${facts.maxPiercing}`);
  }

  for (const proc of facts.procs) {
    if (!text.includes(proc.display)) {
      warnings.push(`Raw proc ${proc.proc} (${proc.display}) not visible in generated text`);
    }
  }

  for (const actionType of facts.actionTypes) {
    if (actionType === 'proc' || actionType === 'stat_modifier') continue;
    const keywords = ACTION_KEYWORDS[actionType];
    if (!keywords) {
      warnings.push(`Unhandled raw action type ${actionType}`);
      continue;
    }
    if (keywords.length === 0) continue;
    if (!keywords.some(keyword => text.includes(keyword))) {
      warnings.push(`Raw action type ${actionType} not visible through keywords: ${keywords.join(', ')}`);
    }
  }

  if (facts.cantRevive && !text.includes('cannot be revived')) {
    warnings.push('Raw victim_cant_revive is not visible in generated text');
  }

  return warnings;
}

const [isoPath, rawPath, idsArg] = process.argv.slice(2);
if (!isoPath || !rawPath) usage();

const generated = readJson(isoPath);
const rawFile = readJson(rawPath);
const rawData = rawFile.Data || rawFile;
const ids = idsArg ? idsArg.split(',').filter(Boolean) : Object.keys(generated);

const results = [];
for (const id of ids) {
  if (!generated[id]) {
    results.push({ id, warnings: ['ID not present in generated data'] });
    continue;
  }
  const warnings = auditRow(id, generated[id], rawData[id]);
  if (warnings.length > 0) results.push({ id, warnings });
}

console.log(JSON.stringify({
  audited: ids.length,
  warningRows: results.length,
  warnings: results
}, null, 2));
