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

const MODE_MAP = {AVA:'WAR', PVP:'CRUCIBLE', GRAND_TOURNAMENT:'CRUCIBLE SHOWDOWN', INSANITY:'INCURSION', BATTLEGROUNDS:'ARENA'};
const PROC_MAP = {
  'DefenseDown':'Defense Down','DefenseUp':'Defense Up','OffenseDown':'Offense Down',
  'OffenseUp':'Offense Up','SpeedUp':'Speed Up','HealBlock':'Heal Block',
  'AbilityBlock':'Ability Block','ReviveOnce':'Revive Once','DoT':'Bleed',
  'HoT':'Regeneration','LockedBuff':'Safeguard','LockedDebuff':'Trauma',
  'BuffBlock':'Disrupted','DebuffBlock':'Immunity','Marked':'Vulnerable',
  'InvisibleNonPersist':'Stealth','AccuracyDown':'Accuracy Down',
  'MinorDeflect':'Minor Deflect','MinorRegeneration':'Minor Regeneration',
};
function mapProc(p) { return PROC_MAP[p] || p; }
function mapMode(m) { return MODE_MAP[m] || m; }

const issues = [];

for (const [id, char] of Object.entries(chars)) {
    if (!char.safety || !extracted[id]) continue;
    const ext = extracted[id];
    const allText = ext.description + '\n' + ext.effects.join('\n') + '\n' + ext.notes.join('\n');

    // Detect DefenseUp variant pattern
    const statModActions = (char.safety.actions || []).filter(a => {
        if (!a.stat_modifier) return false;
        const maxPct = a.action_pct ? getMax(a.action_pct) : 100;
        return maxPct > 0;
    });
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

    for (let i = 0; i < allActions.length; i++) {
        const a = allActions[i];
        const maxPct = a.action_pct ? getMax(a.action_pct) : 100;
        if (maxPct === 0) continue;
        if (a.action === 'empty_result') continue;

        // Skip DefenseUp variant stat_modifier actions
        if (a.stat_modifier && isDefUpPattern) {
            const oiStr = a.only_if ? JSON.stringify(a.only_if) : '';
            if (oiStr.includes('"DefenseUp"') && !oiStr.includes('"not"')) continue;
        }

        const oi = a.only_if;
        if (!oi) continue;

        // Check mode
        if (oi.mode) {
            const expected = mapMode(oi.mode);
            if (!allText.includes(expected)) {
                issues.push(`${id} [${i}]: only_if.mode=${oi.mode} → "${expected}" not found`);
            }
        }

        // Check owner.procs
        if (oi.owner && oi.owner.procs) {
            for (const p of oi.owner.procs) {
                const name = mapProc(p);
                if (!allText.includes(name)) {
                    issues.push(`${id} [${i}]: only_if.owner.procs includes ${p} → "${name}" not found`);
                }
            }
        }

        // Check target.procs
        if (oi.target && oi.target.procs) {
            for (const p of oi.target.procs) {
                const name = mapProc(p);
                if (!allText.includes(name)) {
                    issues.push(`${id} [${i}]: only_if.target.procs includes ${p} → "${name}" not found`);
                }
            }
        }

        // Check owner.health_pct
        if (oi.owner && oi.owner.health_pct) {
            const hp = oi.owner.health_pct;
            if (!allText.includes(`${hp.than}% Health`)) {
                issues.push(`${id} [${i}]: only_if.owner.health_pct ${hp.if} ${hp.than}% not found`);
            }
        }

        // Check owner.barrier_pct
        if (oi.owner && oi.owner.barrier_pct) {
            if (!allText.toLowerCase().includes('barrier')) {
                issues.push(`${id} [${i}]: only_if.owner.barrier_pct not found in output`);
            }
        }

        // Check owner.any_proc_of_type
        if (oi.owner && oi.owner.any_proc_of_type) {
            const type = oi.owner.any_proc_of_type;
            const expected = type === 'buff' ? 'positive effects' : 'negative effects';
            if (!allText.includes(expected)) {
                issues.push(`${id} [${i}]: only_if.owner.any_proc_of_type=${type} → "${expected}" not found`);
            }
        }

        // Check owner.proc_duration_check
        if (oi.owner && oi.owner.proc_duration_check) {
            for (const pdc of oi.owner.proc_duration_check) {
                const name = mapProc(pdc.proc);
                if (pdc.duration && pdc.duration.than !== undefined) {
                    if (!allText.includes(`${pdc.duration.than}+ ${name}`) && !allText.includes(`${pdc.duration.than} ${name}`)) {
                        issues.push(`${id} [${i}]: proc_duration_check ${pdc.duration.than}+ ${name} not found`);
                    }
                }
            }
        }

        // Check only_if_outcome
        if (a.only_if_outcome && a.only_if_outcome.includes('critical_hit')) {
            if (!allText.includes('Crit')) {
                issues.push(`${id} [${i}]: only_if_outcome critical_hit but "Crit" not found`);
            }
        }

        // Check count/count_filter
        if (oi.count && oi.count_filter) {
            const cf = oi.count_filter;
            let traitFound = false;
            if (cf.character) {
                for (const c of cf.character) {
                    const name = mapProc(c);
                    if (allText.includes(name)) traitFound = true;
                }
            }
            if (cf.traits && cf.traits.has_any) {
                for (const t of cf.traits.has_any) {
                    const name = mapProc(t).toUpperCase();
                    if (allText.toUpperCase().includes(name)) traitFound = true;
                }
            }
            if (!traitFound && cf.character) {
                issues.push(`${id} [${i}]: count_filter character ${cf.character.join(',')} not found`);
            }
        }

        // Check and[] sub-conditions
        if (oi.and) {
            for (const sub of oi.and) {
                if (sub.mode) {
                    const expected = mapMode(sub.mode);
                    if (!allText.includes(expected)) {
                        issues.push(`${id} [${i}]: and[].mode=${sub.mode} → "${expected}" not found`);
                    }
                }
                if (sub.owner && sub.owner.procs) {
                    for (const p of sub.owner.procs) {
                        const name = mapProc(p);
                        if (!allText.includes(name)) {
                            issues.push(`${id} [${i}]: and[].owner.procs ${p} → "${name}" not found`);
                        }
                    }
                }
            }
        }
    }
}

if (issues.length === 0) {
    console.log('No condition issues found!');
} else {
    console.log(`Found ${issues.length} condition issues:\n`);
    const unique = [...new Set(issues)];
    console.log(`(${unique.length} unique)\n`);
    unique.forEach(i => console.log(i));
}
