const fs = require('fs');
const d = JSON.parse(fs.readFileSync('../com.foxnextgames.m3-2112026/com.foxnextgames.m3/files/Config/combat_data/characters.json', 'utf8'));
const chars = d.Data;

const PROC_MAP_KEYS = new Set([
  'DefenseDown','DefenseUp','OffenseDown','OffenseUp','SpeedUp','Slow','Stun','Bleed',
  'HealBlock','AbilityBlock','Taunt','Stealth','Regeneration','Counter','Evade','Deflect',
  'Deathproof','Vulnerable','Disrupted','Immunity','Trauma','Safeguard','Charged','ReviveOnce',
  'Barrier','Blind','DoT','LockedBuff','LockedDebuff','Exposed','BuffBlock','DebuffBlock',
  'MinorDeflect','MinorRegeneration','MinorDefenseUp','MinorOffenseUp','HoT','AccuracyDown',
  'BombBurst','NicoBasic','Marked','ClawsOut','Silence','BrickMaterial','AssistNow',
  'InvisibleNonPersist','AbsoluteAForce','NewAvenger','AlphaFlight','SpiderSociety','SpiderVerse',
  'OutOfTime','UncannyAvenger','SuperiorSix','WinterGuard','BionicAvenger','HiveMind','SinisterSix',
  'Brimstone','Pegasus','Underworld','MightyAvenger','Deathseed','Shadowland','Xmen','Darkhold',
  'Nightstalker','Gamma','Villain','Hercules','KittyPryde','Colossus','SpiderMan','SamWilson',
  'MistyKnight','ColleenWing','Groot','Gwenpool','MultipleManMinion','Horseman','Sylvie','Ikaris',
  'Daredevil','DaimonHellstrom','MrSinister','NovaForceTracking','XFactor','PhantomRider',
  'InvisibleStateChecker','SpawnedWithHeroAllies','NewMutant','NewWarrior','Champion','Accursed'
]);

const commonTraits = new Set(['Hero','Villain','Mystic','Bio','Mutant','Skill','Tech',
  'Controller','Brawler','Blaster','Protector','Support','Global','Cosmic','City','Minion','Spawned']);

const missingTraits = new Set();

function checkTraits(traits) {
    if (!traits) return;
    if (Array.isArray(traits)) {
        for (const t of traits) {
            if (!PROC_MAP_KEYS.has(t) && !commonTraits.has(t)) missingTraits.add(t);
        }
        return;
    }
    if (traits.has_any) {
        for (const t of traits.has_any) {
            if (!PROC_MAP_KEYS.has(t) && !commonTraits.has(t)) missingTraits.add(t);
        }
    }
    if (traits.and) {
        for (const sub of traits.and) {
            checkTraits(sub);
        }
    }
}

for (const [id, char] of Object.entries(chars)) {
    if (!char.safety) continue;
    const actions = char.safety.actions || [];
    for (const a of actions) {
        // Check target filter traits
        if (a.target && a.target.filter) {
            const f = a.target.filter;
            checkTraits(f.traits);
            if (f.and) f.and.forEach(sub => checkTraits(sub.traits));
            if (f.or) f.or.forEach(sub => checkTraits(sub.traits));
        }
        // Check recipient filter traits
        if (a.recipient && a.recipient.filter) {
            const f = a.recipient.filter;
            checkTraits(f.traits);
            if (f.and) f.and.forEach(sub => checkTraits(sub.traits));
        }
    }
    // Also check basic
    if (char.basic && char.basic.actions) {
        for (const a of char.basic.actions) {
            if (a.target && a.target.filter) {
                const f = a.target.filter;
                checkTraits(f.traits);
                if (f.and) f.and.forEach(sub => checkTraits(sub.traits));
            }
            if (a.recipient && a.recipient.filter) {
                const f = a.recipient.filter;
                checkTraits(f.traits);
                if (f.and) f.and.forEach(sub => checkTraits(sub.traits));
            }
        }
    }
}

console.log('Missing traits:', [...missingTraits].sort().join(', '));
