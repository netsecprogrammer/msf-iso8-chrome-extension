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

    const allActions = [];
    if (char.safety.actions) char.safety.actions.forEach(a => allActions.push({...a, _src: 'safety'}));
    if (char.basic && char.basic.actions) {
        char.basic.actions.forEach(a => {
            if (a.counter === true || a.assist !== undefined) {
                if (a.action === 'empty_result') return;
                allActions.push({...a, _src: 'basic'});
            }
        });
    }

    for (const a of allActions) {
        const maxPct = a.action_pct ? getMax(a.action_pct) : 100;
        if (maxPct === 0) continue;

        // Check ally targeting with specific types
        if (a.target && a.target.relation === 'ally') {
            const filter = a.target.filter;

            // Check owner_ok=false
            if (filter) {
                let hasOwnerOk = filter.owner_ok === false;
                if (filter.and) filter.and.forEach(sub => { if (sub.owner_ok === false) hasOwnerOk = true; });
                if (hasOwnerOk && !allText.includes('excluding self')) {
                    issues.push(`${id}: owner_ok=false but no "excluding self" in output`);
                }
            }

            // Check health_pct filter
            if (filter && filter.target && filter.target.health_pct) {
                const hp = filter.target.health_pct;
                const threshold = hp.than || 0;
                if (!allText.includes(`${threshold}% Health`)) {
                    issues.push(`${id}: filter.target.health_pct ${threshold}% but not in output`);
                }
            }

            // Check not.target.procs filter
            if (filter && filter.not && filter.not.target && filter.not.target.procs) {
                const procs = filter.not.target.procs;
                for (const p of procs) {
                    if (!allText.toLowerCase().includes('without')) {
                        issues.push(`${id}: filter.not.target.procs [${p}] but no "without" in output`);
                    }
                }
            }

            // Check not.target.states filter
            if (filter && filter.not && filter.not.target && filter.not.target.states) {
                for (const s of filter.not.target.states) {
                    if (s === 'Spawned' && !allText.includes('non-Summoned')) {
                        issues.push(`${id}: filter.not.target.states [Spawned] but no "non-Summoned" in output`);
                    }
                }
            }

            // Check by_most_stat targeting
            if (a.target.type === 'by_most_stat' && a.target.by_stat) {
                const statMap = {damage:'Damage', health:'Health', speed:'Speed', focus:'Focus', armor:'Armor', resist:'Resist'};
                const expected = statMap[a.target.by_stat] || a.target.by_stat;
                if (!allText.includes(expected)) {
                    issues.push(`${id}: by_most_stat ${a.target.by_stat} but "${expected}" not in output`);
                }
            }
        }

        // Check attack_ally with recipient
        if (a.action === 'attack_ally') {
            if (a.recipient) {
                if (a.recipient.relation === 'ally') {
                    if (!allText.includes('assist')) {
                        issues.push(`${id}: attack_ally with ally recipient but no "assist" in output`);
                    }
                } else if (a.recipient.relation === 'enemy') {
                    if (!allText.includes('additional enemy') && !allText.includes('enemies')) {
                        issues.push(`${id}: attack_ally with enemy recipient but no attack effect in output`);
                    }
                }
            } else if (a.target && a.target.relation === 'enemy') {
                if (!allText.includes('additional enemy') && !allText.includes('enemies')) {
                    issues.push(`${id}: attack_ally targeting enemy but no attack effect in output`);
                }
            }
        }

        // Check multi-target enemy actions
        if (a.target && a.target.relation === 'enemy') {
            const limit = getMax(a.target.limit);
            if (limit && limit > 1 && !allText.includes(`${limit} enemies`) && !allText.includes('additional enem')) {
                issues.push(`${id}: ${limit} enemy targets but count not in output`);
            }
        }
    }
}

if (issues.length === 0) {
    console.log('No targeting issues found!');
} else {
    console.log(`Found ${issues.length} targeting issues:\n`);
    issues.forEach(i => console.log(i));
}
