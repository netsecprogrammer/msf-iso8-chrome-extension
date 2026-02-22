// Audit: find actions with conditions in raw data that produce empty condition text
const fs = require('fs');
const path = require('path');

// Load the extraction module's logic by re-implementing parseConditions inline
// (we need to check what the parser MISSES)

const PROC_MAP = {
  'DefenseDown': 'Defense Down', 'DefenseUp': 'Defense Up', 'OffenseDown': 'Offense Down',
  'OffenseUp': 'Offense Up', 'SpeedUp': 'Speed Up', 'Slow': 'Slow', 'Stun': 'Stun',
  'Bleed': 'Bleed', 'HealBlock': 'Heal Block', 'AbilityBlock': 'Ability Block',
  'Taunt': 'Taunt', 'Stealth': 'Stealth', 'Regeneration': 'Regeneration',
  'Counter': 'Counter', 'Evade': 'Evade', 'Deflect': 'Deflect', 'Deathproof': 'Deathproof',
  'Vulnerable': 'Vulnerable', 'Disrupted': 'Disrupted', 'Immunity': 'Immunity',
  'Trauma': 'Trauma', 'Safeguard': 'Safeguard', 'Charged': 'Charged',
  'ReviveOnce': 'Revive Once', 'Barrier': 'Barrier', 'Blind': 'Blind',
  'DoT': 'Bleed', 'LockedBuff': 'Safeguard', 'LockedDebuff': 'Trauma',
  'Exposed': 'Exposed', 'BuffBlock': 'Disrupted', 'DebuffBlock': 'Immunity',
  'MinorDeflect': 'Minor Deflect', 'MinorRegeneration': 'Minor Regeneration',
  'MinorDefenseUp': 'Minor Defense Up', 'MinorOffenseUp': 'Minor Offense Up',
  'HoT': 'Regeneration', 'AccuracyDown': 'Accuracy Down', 'BombBurst': 'Bomb Burst',
  'NicoBasic': 'Arcane Runic', 'Marked': 'Vulnerable', 'ClawsOut': 'Claws Out',
  'Silence': 'Silence', 'BrickMaterial': 'Brick Material', 'AssistNow': 'Assist Now',
  'InvisibleNonPersist': 'Stealth', 'NovaForceTracking': 'Nova Force Tracking',
  'XFactor': 'X-Factor'
};
function fmt(p) { return PROC_MAP[p] || p; }

const rawData = fs.readFileSync("C:/Users/steven/Downloads/marvel strike force/com.foxnextgames.m3-2162026/com.foxnextgames.m3/files/Config/combat_data/characters.json", 'utf8');
const json = JSON.parse(rawData);
const charDataMap = json.Data || json;

const issues = [];

for (const [charId, charData] of Object.entries(charDataMap)) {
    if (charId === 'ForceImportVersion' || charId === 'Name') continue;
    if (/^NUE|^PVE_|^TestMan$/.test(charId)) continue;

    const allActions = [];

    // Safety actions
    if (charData.safety && charData.safety.actions) {
        charData.safety.actions.forEach(a => allActions.push({ ...a, _src: 'safety' }));
    }

    // Basic counter/assist actions
    if (charData.basic && charData.basic.actions) {
        charData.basic.actions.forEach(a => {
            if (a.counter === true || a.assist !== undefined) {
                if (a.action === 'empty_result') return;
                if (a.action === 'proc_remove' && a.procs === 'Binary' && charId !== 'CaptainMarvel') return;
                const hasCounter = a.counter === true;
                const hasAssist = a.assist !== undefined;
                if (hasCounter && hasAssist && !a.action &&
                    !a.only_if && !a.only_if_target && !a.only_if_any && !a.only_if_outcome) return;
                allActions.push({ ...a, _src: 'basic' });
            }
        });
    }

    for (const action of allActions) {
        // Check only_if for unhandled keys
        if (action.only_if) {
            const oi = action.only_if;
            const handledKeys = new Set(['mode', 'combat_side', 'or', 'and', 'target', 'owner',
                'count', 'count_filter', 'not', 'traits']);
            const unhandled = Object.keys(oi).filter(k => !handledKeys.has(k));
            if (unhandled.length > 0) {
                issues.push(`${charId} [${action._src}]: only_if has unhandled keys: ${unhandled.join(', ')} = ${JSON.stringify(unhandled.map(k => oi[k]))}`);
            }

            // Check and/or sub-objects for unhandled keys
            if (oi.and) {
                for (const sub of oi.and) {
                    const subKeys = Object.keys(sub).filter(k => !handledKeys.has(k));
                    if (subKeys.length > 0) {
                        issues.push(`${charId} [${action._src}]: only_if.and sub has unhandled keys: ${subKeys.join(', ')} = ${JSON.stringify(subKeys.map(k => sub[k]))}`);
                    }
                }
            }
            if (oi.or) {
                for (const sub of oi.or) {
                    const subKeys = Object.keys(sub).filter(k => !handledKeys.has(k));
                    if (subKeys.length > 0) {
                        issues.push(`${charId} [${action._src}]: only_if.or sub has unhandled keys: ${subKeys.join(', ')} = ${JSON.stringify(subKeys.map(k => sub[k]))}`);
                    }
                }
            }

            // Check not sub-object for unhandled keys
            if (oi.not) {
                const notHandled = new Set(['mode', 'owner', 'target', 'character']);
                const notUnhandled = Object.keys(oi.not).filter(k => !notHandled.has(k));
                if (notUnhandled.length > 0) {
                    issues.push(`${charId} [${action._src}]: only_if.not has unhandled keys: ${notUnhandled.join(', ')} = ${JSON.stringify(notUnhandled.map(k => oi.not[k]))}`);
                }
            }
        }

        // Check only_if_target for unhandled structures
        if (action.only_if_target) {
            const oit = action.only_if_target;
            const checkUnhandled = (obj, path) => {
                const handled = new Set(['traits', 'target', 'and', 'or']);
                const unhandled = Object.keys(obj).filter(k => !handled.has(k));
                if (unhandled.length > 0) {
                    issues.push(`${charId} [${action._src}]: only_if_target${path} has unhandled keys: ${unhandled.join(', ')} = ${JSON.stringify(unhandled.map(k => obj[k]))}`);
                }
                if (obj.and) obj.and.forEach((sub, i) => checkUnhandled(sub, `${path}.and[${i}]`));
                if (obj.or) obj.or.forEach((sub, i) => checkUnhandled(sub, `${path}.or[${i}]`));
            };
            checkUnhandled(oit, '');
        }

        // Check only_if_any for unhandled structures
        if (action.only_if_any) {
            const oia = action.only_if_any;
            if (oia.filter) {
                const f = oia.filter;
                const handledFilterKeys = new Set(['character', 'count', 'count_filter', 'target', 'and', 'traits']);
                const unhandled = Object.keys(f).filter(k => !handledFilterKeys.has(k));
                // owner_ok is internal, skip it
                const meaningful = unhandled.filter(k => k !== 'owner_ok');
                if (meaningful.length > 0) {
                    issues.push(`${charId} [${action._src}]: only_if_any.filter has unhandled keys: ${meaningful.join(', ')} = ${JSON.stringify(meaningful.map(k => f[k]))}`);
                }
            } else {
                issues.push(`${charId} [${action._src}]: only_if_any has no filter: ${JSON.stringify(oia)}`);
            }
        }

        // Check for action_cond values we don't handle
        if (action.action_cond &&
            !['if_prev_skipped', 'if_has_crit_result', 'if_has_crit_result_per_target'].includes(action.action_cond)) {
            issues.push(`${charId} [${action._src}]: unhandled action_cond: ${action.action_cond}`);
        }

        // Check for action types we don't handle
        const handledActions = new Set([
            undefined, 'proc', 'proc_remove', 'proc_flip', 'health_redistribute',
            'heal', 'proc_transfer', 'turn_meter', 'barrier', 'proc_duration',
            'ability_energy', 'barrier_remove', 'damage_mul_per_proc', 'revive',
            'drain', 'attack_ally', 'set_battlefield_effect', 'empty_result'
        ]);
        if (!handledActions.has(action.action)) {
            issues.push(`${charId} [${action._src}]: unhandled action type: ${action.action}`);
        }
    }
}

if (issues.length === 0) {
    console.log('No missing conditions found.');
} else {
    console.log(`Found ${issues.length} potential issues:\n`);
    issues.forEach(i => console.log(i));
}
