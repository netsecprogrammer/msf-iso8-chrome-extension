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

const PROC_MAP = {
  'DoT':'Bleed','HoT':'Regeneration','LockedBuff':'Safeguard','LockedDebuff':'Trauma',
  'BuffBlock':'Disrupted','DebuffBlock':'Immunity','Marked':'Vulnerable',
  'InvisibleNonPersist':'Stealth','NicoBasic':'Arcane Runic','BombBurst':'Bomb Burst',
  'ClawsOut':'Claws Out','AssistNow':'Assist Now','BrickMaterial':'Brick Material',
  'MinorDeflect':'Minor Deflect','MinorRegeneration':'Minor Regeneration',
  'MinorDefenseUp':'Minor Defense Up','MinorOffenseUp':'Minor Offense Up',
  'DefenseDown':'Defense Down','DefenseUp':'Defense Up','OffenseDown':'Offense Down',
  'OffenseUp':'Offense Up','SpeedUp':'Speed Up','HealBlock':'Heal Block',
  'AbilityBlock':'Ability Block','ReviveOnce':'Revive Once','AccuracyDown':'Accuracy Down',
  'Deathproof':'Deathproof','PhantomRider':'Phantom Rider',
  'NovaForceTracking':'Nova Force Tracking',
};

function mapProc(p) { return PROC_MAP[p] || p; }

const issues = [];

for (const [id, char] of Object.entries(chars)) {
    if (!char.safety || !extracted[id]) continue;
    const ext = extracted[id];
    const allText = ext.description + '\n' + ext.effects.join('\n') + '\n' + ext.notes.join('\n');

    const allActions = [];
    if (char.safety.actions) char.safety.actions.forEach(a => allActions.push({...a, _src: 'safety'}));
    if (char.basic && char.basic.actions) {
        char.basic.actions.forEach(a => {
            const hasCounter = a.counter === true;
            const hasAssist = a.assist !== undefined;
            if (!hasCounter && !hasAssist) return;
            if (a.action === 'empty_result') return;
            // Skip Binary proc_remove for non-CaptainMarvel
            if (a.action === 'proc_remove' && a.procs === 'Binary' && id !== 'CaptainMarvel') return;
            // Skip basic inherent damage (counter+assist, no action, no conditions)
            const hasConditionalStats = a.stat_modifier && a.stat_modifier.some(m => m.apply_if);
            if (hasCounter && hasAssist && !a.action && !a.only_if && !a.only_if_target && !a.only_if_any && !a.only_if_outcome && !hasConditionalStats) return;
            allActions.push({...a, _src: 'basic'});
        });
    }

    for (const a of allActions) {
        const maxPct = a.action_pct ? getMax(a.action_pct) : 100;
        if (maxPct === 0) continue;

        // Check proc actions
        if (a.action === 'proc' && a.procs) {
            for (const p of a.procs) {
                if (p.proc && p.proc.startsWith('Basic_Level')) continue;
                const displayName = mapProc(p.proc);
                if (!allText.includes(displayName)) {
                    issues.push(`${id}: missing proc "${displayName}" (raw: ${p.proc})`);
                }
            }
        }

        // Check proc_remove
        if (a.action === 'proc_remove') {
            if (a.procs) {
                const displayName = mapProc(a.procs);
                if (!allText.includes(displayName) && !allText.includes('Clear')) {
                    issues.push(`${id}: missing proc_remove for "${displayName}"`);
                }
            } else if (!allText.includes('Clear') && !allText.includes('effect')) {
                issues.push(`${id}: missing proc_remove action`);
            }
        }

        // Check proc_flip
        if (a.action === 'proc_flip') {
            if (!allText.includes('Flip')) {
                issues.push(`${id}: missing proc_flip action`);
            }
        }

        // Check heal
        if (a.action === 'heal') {
            const healPct = getMax(a.heal_pct);
            if (healPct > 0 && !allText.includes('Heal')) {
                issues.push(`${id}: missing heal ${healPct}%`);
            }
        }

        // Check turn_meter
        if (a.action === 'turn_meter') {
            const amount = getMax(a.change_pct);
            if (amount !== 0 && !allText.includes('Speed Bar')) {
                issues.push(`${id}: missing turn_meter ${amount}%`);
            }
        }

        // Check barrier
        if (a.action === 'barrier') {
            const amount = getMax(a.health_pct);
            if (amount > 0 && !allText.includes('Barrier')) {
                issues.push(`${id}: missing barrier ${amount}%`);
            }
        }

        // Check proc_duration
        if (a.action === 'proc_duration') {
            const delta = getMax(a.delta);
            if (delta !== 0 && !allText.includes('Prolong') && !allText.includes('Reduce') && !allText.includes('Gain') && !allText.includes('Apply')) {
                issues.push(`${id}: missing proc_duration delta=${delta}`);
            }
        }

        // Check ability_energy
        if (a.action === 'ability_energy') {
            if (!allText.includes('Ability Energy')) {
                issues.push(`${id}: missing ability_energy`);
            }
        }

        // Check health_redistribute
        if (a.action === 'health_redistribute') {
            if (!allText.includes('Drain') && !allText.includes('Redistribute') && !allText.includes('redistribute')) {
                issues.push(`${id}: missing health_redistribute`);
            }
        }

        // Check revive
        if (a.action === 'revive') {
            const revivePct = getMax(a.revive_pct);
            if (revivePct > 0 && !allText.includes('Revive')) {
                issues.push(`${id}: missing revive`);
            }
        }

        // Check damage_mul_per_proc
        if (a.action === 'damage_mul_per_proc') {
            const pctPerProc = getMax(a.pct_per_proc);
            if (pctPerProc > 0 && !allText.includes('for each')) {
                issues.push(`${id}: missing damage_mul_per_proc ${pctPerProc}%`);
            }
        }

        // Check foreach_stat
        if (a.foreach_stat) {
            for (const fs2 of a.foreach_stat) {
                const delta = getMax(fs2.delta);
                if (delta > 0 && !allText.includes('for each')) {
                    issues.push(`${id}: missing foreach_stat ${fs2.stat} ${delta}%`);
                }
            }
        }

        // Check set_battlefield_effect
        if (a.action === 'set_battlefield_effect') {
            if (!allText.includes('battlefield')) {
                issues.push(`${id}: missing set_battlefield_effect`);
            }
        }

        // Check victim_cant_revive
        if (a.victim_cant_revive) {
            if (!allText.includes('cannot be revived')) {
                issues.push(`${id}: missing victim_cant_revive note`);
            }
        }
    }
}

if (issues.length === 0) {
    console.log('No missing action issues found!');
} else {
    console.log(`Found ${issues.length} missing action issues:\n`);
    // Deduplicate
    const unique = [...new Set(issues)];
    console.log(`(${unique.length} unique)\n`);
    unique.forEach(i => console.log(i));
}
