const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('../com.foxnextgames.m3-2112026/com.foxnextgames.m3/files/Config/combat_data/characters.json', 'utf8'));
const extracted = JSON.parse(fs.readFileSync('iso8_data.json', 'utf8'));
const chars = raw.Data;

function getMax(val) {
  if (Array.isArray(val)) {
    const last = val[val.length - 1];
    if (last && typeof last === 'object' && last.t !== undefined) return last.t;
    return last;
  }
  if (val && typeof val === 'object' && val.t !== undefined) return val.t;
  return val || 0;
}

const issues = [];

for (const [id, char] of Object.entries(chars)) {
    if (!char.safety || !extracted[id]) continue;
    const ext = extracted[id];
    const allText = ext.description + '\n' + ext.effects.join('\n') + '\n' + ext.notes.join('\n');
    const actions = char.safety.actions || [];

    // Find active stat_modifier actions
    const statModActions = actions.filter(a => {
        if (!a.stat_modifier) return false;
        const maxPct = a.action_pct ? getMax(a.action_pct) : 100;
        return maxPct > 0;
    });

    if (statModActions.length === 0) continue;

    // Detect DefenseUp variant actions
    let isDefUpPattern = false;
    if (statModActions.length >= 2) {
        const piercingValues = [];
        let hasDefUpCond = false;
        for (const a of statModActions) {
            const oiStr = a.only_if ? JSON.stringify(a.only_if) : '';
            const pierce = a.stat_modifier.find(m => m.stat === 'armor_pierce_pct');
            if (pierce && pierce.delta) {
                piercingValues.push(getMax(pierce.delta));
                if (oiStr.includes('"DefenseUp"') && !oiStr.includes('"not"')) hasDefUpCond = true;
            }
        }
        if (hasDefUpCond && new Set(piercingValues).size > 1) isDefUpPattern = true;
    }

    // Calculate expected stats from first non-DefenseUp-variant action
    for (const a of statModActions) {
        const oiStr = a.only_if ? JSON.stringify(a.only_if) : '';
        const isDefUpVariant = isDefUpPattern && oiStr.includes('"DefenseUp"') && !oiStr.includes('"not"');
        if (isDefUpVariant) continue;

        // Only check the primary (unconditional or first) stat_modifier action
        // Skip actions with only_if_target, only_if_any, only_if_outcome (conditional)
        // unless they also contribute to base stats
        if (a.only_if_target || a.only_if_any) continue;
        if (a.only_if_outcome && a.only_if_outcome.includes('critical_hit')) continue;
        if (a._source === 'basic') continue;

        let expectedDmg = 0, expectedPierce = 0, expectedDrain = 0;
        let expectedCritChance = 0, expectedCritDmg = 0;

        a.stat_modifier.forEach(mod => {
            if (!mod.delta) return;
            const val = getMax(mod.delta);
            if (mod.stat === 'ability_damage_pct' && !mod.apply_if) expectedDmg += val;
            else if (mod.stat === 'ability_damage_pct' && mod.apply_if && mod.apply_if.not && Object.keys(mod.apply_if).length === 1) {
                if (expectedDmg === 0) expectedDmg = val;
            }
            if (mod.stat === 'armor_pierce_pct' && !mod.apply_if) expectedPierce += val;
            else if (mod.stat === 'armor_pierce_pct' && mod.apply_if && mod.apply_if.not && Object.keys(mod.apply_if).length === 1) {
                if (val > expectedPierce) expectedPierce = val;
            }
            if (mod.stat === 'drain_pct' && !mod.apply_if) expectedDrain += val;
            if (mod.stat === 'crit_chance_pct' && !mod.apply_if) expectedCritChance += val;
            if (mod.stat === 'crit_damage_pct' && !mod.apply_if) expectedCritDmg += val;
        });

        // Compare with extracted values
        if (expectedDmg > 0 && ext.damage !== expectedDmg) {
            issues.push(`${id}: damage expected ${expectedDmg}, got ${ext.damage}`);
        }
        if (expectedPierce > 0 && ext.piercing !== expectedPierce) {
            issues.push(`${id}: piercing expected ${expectedPierce}, got ${ext.piercing}`);
        }
        if (expectedDrain > 0 && ext.drain !== expectedDrain) {
            issues.push(`${id}: drain expected ${expectedDrain}, got ${ext.drain}`);
        }
        if (expectedCritChance > 0 && !allText.includes(`${expectedCritChance}% Crit Chance`)) {
            issues.push(`${id}: crit_chance_pct ${expectedCritChance} not in output`);
        }
        if (expectedCritDmg > 0 && !allText.includes(`${expectedCritDmg}% Crit Damage`)) {
            issues.push(`${id}: crit_damage_pct ${expectedCritDmg} not in output`);
        }

        // Check conditional stat bonuses (apply_if)
        a.stat_modifier.forEach(mod => {
            if (!mod.delta || !mod.apply_if) return;
            if (mod.apply_if.not && Object.keys(mod.apply_if).length === 1) return;
            const val = getMax(mod.delta);
            if (val === 0) return;

            // Skip DefenseUp/DefenseDown piercing (handled by ignores note)
            if (mod.stat === 'armor_pierce_pct') {
                const applyIfStr = JSON.stringify(mod.apply_if);
                if (applyIfStr.includes('"DefenseUp"') || applyIfStr.includes('"DefenseDown"')) return;
            }

            let statName = '';
            if (mod.stat === 'ability_damage_pct' || mod.stat === 'damage_pct') statName = 'damage';
            else if (mod.stat === 'armor_pierce_pct') statName = 'Piercing';
            else if (mod.stat === 'drain_pct') statName = 'Drain';
            else if (mod.stat === 'crit_chance_pct') statName = 'Crit Chance';
            else if (mod.stat === 'crit_damage_pct') statName = 'Crit Damage';
            else return;

            if (!allText.includes(`${val}% ${statName}`)) {
                issues.push(`${id}: conditional ${mod.stat} ${val}% not in output (apply_if: ${JSON.stringify(mod.apply_if).substring(0, 100)})`);
            }
        });

        break; // Only check first valid action for base stats
    }
}

if (issues.length === 0) {
    console.log('No stat issues found!');
} else {
    console.log(`Found ${issues.length} stat issues:\n`);
    issues.forEach(i => console.log(i));
}
