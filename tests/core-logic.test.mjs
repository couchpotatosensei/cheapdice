import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Cheap Dice Core Syntax & Super Advantage Logic', () => {
  it('RollTerm fallback cloning handles objects lacking .clone()', () => {
    const dieTerm = { total: 18, isDice: true, toJSON: () => ({ total: 18 }) };
    const numTerm = { total: 4, toJSON: () => ({ total: 4 }) };
    const terms = [dieTerm, numTerm];

    const cloneTerm = (t) => {
      if (typeof t.clone === "function") return t.clone();
      if (typeof t.constructor?.fromData === "function") return t.constructor.fromData(t.toJSON());
      return JSON.parse(JSON.stringify(t));
    };

    const cloned = terms.map(cloneTerm);
    assert.equal(cloned.length, 2);
    assert.equal(cloned[0].total, 18);
    assert.equal(cloned[1].total, 4);
  });

  it('Super advantage candidate comparison logic picks highest candidate', () => {
    const candidateA = { total: 12 };
    const candidateB = { total: 19 };

    let kept = null;
    let dropped = null;

    if (candidateA.total >= candidateB.total) {
      kept = candidateA;
      dropped = candidateB;
    } else {
      kept = candidateB;
      dropped = candidateA;
    }

    assert.equal(kept.total, 19);
    assert.equal(dropped.total, 12);
  });

  it('Super advantage handles tie candidates cleanly', () => {
    const candidateA = { total: 15 };
    const candidateB = { total: 15 };

    let kept = null;
    let dropped = null;

    if (candidateA.total >= candidateB.total) {
      kept = candidateA;
      dropped = candidateB;
    } else {
      kept = candidateB;
      dropped = candidateA;
    }

    assert.equal(kept.total, 15);
    assert.equal(dropped.total, 15);
  });

  it('Super advantage generates valid second roll formula from kept d20 candidate without re-evaluating terms', () => {
    const keptD20Term = { total: 17 };
    const formulaSuffix = "+ 3 + 1d4";
    const modifierFormula = formulaSuffix.trim();
    const secondFormula = modifierFormula ? `${keptD20Term.total} ${modifierFormula}` : `${keptD20Term.total}`;

    assert.equal(secondFormula, "17 + 3 + 1d4");
  });

  it('Reliable Talent clamps d20 values of 8 up to minimum 10 across super advantage candidates and primary roll', () => {
    const isReliableTalent = true;
    const isProficient = false; // Even if not proficient or if raw ability check
    const rollType = "check";
    const applyReliableTalent = Boolean(isReliableTalent) && (isProficient || rollType === "skill" || rollType === "tool" || rollType === "check");

    assert.equal(applyReliableTalent, true);

    let roll1Die = 8;
    let candidateADie = 8;
    let candidateBDie = 8;

    if (applyReliableTalent) {
      roll1Die = Math.max(10, roll1Die);
      candidateADie = Math.max(10, candidateADie);
      candidateBDie = Math.max(10, candidateBDie);
    }

    assert.equal(roll1Die, 10);
    assert.equal(candidateADie, 10);
    assert.equal(candidateBDie, 10);
  });

  it('Secondary Ability attack modifier dynamically calculates actor ability mod and updates title tag', () => {
    const actor = {
      system: {
        abilities: {
          str: { mod: 3 },
          cha: { mod: 4 }
        }
      }
    };

    const config = {
      chatCardTitle: "Longsword",
      attackCircumstanceModifier: 0,
      hasExtraAttackAbility: true,
      extraAttackAbility: "cha",
      extraAttackAbilityLabel: "Sacred Weapon"
    };

    const isChecked = true;
    if (config.hasExtraAttackAbility && config.extraAttackAbility && isChecked) {
      const abil = config.extraAttackAbility;
      const abilMod = Number(actor.system?.abilities?.[abil]?.mod) || 0;
      config.secondaryAbilityMod = abilMod;
      config.secondaryAbilityKey = abil;
      config.secondaryAbilityLabel = config.extraAttackAbilityLabel;
      const sign = abilMod >= 0 ? `+${abilMod}` : `${abilMod}`;
      const tag = config.extraAttackAbilityLabel || `${sign} ${abil.toUpperCase()}`;
      config.chatCardTitle = `${config.chatCardTitle} [${tag}]`;
    }

    assert.equal(config.secondaryAbilityMod, 4);
    assert.equal(config.secondaryAbilityKey, "cha");
    assert.equal(config.secondaryAbilityLabel, "Sacred Weapon");
    assert.equal(config.chatCardTitle, "Longsword [Sacred Weapon]");

    // Verify breakdown list generation
    const abilityScore = "str";
    const abilityMod = actor.system.abilities[abilityScore]?.mod || 0;
    const prof = 3;
    const weaponModifier = 1;
    const attackCircumstanceModifier = config.attackCircumstanceModifier;
    const secAbilBonus = Number(config.secondaryAbilityMod) || 0;
    const totalAttackModifier = abilityMod + prof + weaponModifier + attackCircumstanceModifier + secAbilBonus;

    assert.equal(totalAttackModifier, 3 + 3 + 1 + 0 + 4); // 11 total

    const secAbilSign = secAbilBonus >= 0 ? '+' : '';
    const secAbilKeyUpper = (config.secondaryAbilityKey || "").toUpperCase();
    const secAbilDisplayLabel = config.secondaryAbilityLabel ? `${config.secondaryAbilityLabel} (${secAbilKeyUpper})` : `Secondary Ability (${secAbilKeyUpper})`;
    const attackModifiersList = `<ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.95em; line-height: 1.4;">
    <li style="list-style-type: disc;">Ability Mod (${abilityScore.toUpperCase()}): <strong>+${abilityMod}</strong></li>
    <li style="list-style-type: disc;">Proficiency Bonus (PB): <strong>+${prof}</strong></li>
    ${weaponModifier !== 0 ? `<li style="list-style-type: disc;">Weapon Modifier: <strong>+${weaponModifier}</strong></li>` : ''}
    ${secAbilBonus !== 0 ? `<li style="list-style-type: disc;">${secAbilDisplayLabel}: <strong>${secAbilSign}${secAbilBonus}</strong></li>` : ''}
    ${attackCircumstanceModifier !== 0 ? `<li style="list-style-type: disc;">Other Mod: <strong>+${attackCircumstanceModifier}</strong></li>` : ''}
  </ul>`;

    assert.ok(attackModifiersList.includes("Sacred Weapon (CHA): <strong>+4</strong>"));
    assert.ok(!attackModifiersList.includes("Other Mod:"));
  });

  it('Secondary Ability attack modifier falls back gracefully when label is blank or ability is unselected', () => {
    const actor = {
      system: {
        abilities: {
          wis: { mod: 3 }
        }
      }
    };

    // Case 1: Blank label uses +3 WIS
    const config1 = {
      chatCardTitle: "Mace",
      attackCircumstanceModifier: 2,
      hasExtraAttackAbility: true,
      extraAttackAbility: "wis",
      extraAttackAbilityLabel: ""
    };

    if (config1.hasExtraAttackAbility && config1.extraAttackAbility) {
      const abil = config1.extraAttackAbility;
      const abilMod = Number(actor.system?.abilities?.[abil]?.mod) || 0;
      config1.attackCircumstanceModifier += abilMod;
      const sign = abilMod >= 0 ? `+${abilMod}` : `${abilMod}`;
      const tag = config1.extraAttackAbilityLabel || `${sign} ${abil.toUpperCase()}`;
      config1.chatCardTitle = `${config1.chatCardTitle} [${tag}]`;
    }

    assert.equal(config1.attackCircumstanceModifier, 5);
    assert.equal(config1.chatCardTitle, "Mace [+3 WIS]");

    // Case 2: Empty ability selection does not alter modifier
    const config2 = {
      chatCardTitle: "Dagger",
      attackCircumstanceModifier: 1,
      hasExtraAttackAbility: true,
      extraAttackAbility: "",
      extraAttackAbilityLabel: "Some Buff"
    };

    if (config2.hasExtraAttackAbility && config2.extraAttackAbility) {
      const abil = config2.extraAttackAbility;
      const abilMod = Number(actor.system?.abilities?.[abil]?.mod) || 0;
      config2.attackCircumstanceModifier += abilMod;
    }

    assert.equal(config2.attackCircumstanceModifier, 1);
  });

  it('Secondary Ability damage modifier dynamically calculates actor ability mod, applies to damage, and lists in breakdown', () => {
    const actor = {
      system: {
        abilities: {
          str: { mod: 3 },
          cha: { mod: 4 }
        }
      }
    };

    const config = {
      chatCardTitle: "Greatsword",
      damageModifier: 0,
      hasExtraDamageAbility: true,
      extraDamageAbility: "cha",
      extraDamageAbilityLabel: "Aura of Hate"
    };

    const isChecked = true;
    if (config.hasExtraDamageAbility && config.extraDamageAbility && isChecked) {
      const abil = config.extraDamageAbility;
      const abilMod = Number(actor.system?.abilities?.[abil]?.mod) || 0;
      config.secondaryDamageAbilityMod = abilMod;
      config.secondaryDamageAbilityKey = abil;
      config.secondaryDamageAbilityLabel = config.extraDamageAbilityLabel;
      const sign = abilMod >= 0 ? `+${abilMod}` : `${abilMod}`;
      const tag = config.extraDamageAbilityLabel || `${sign} ${abil.toUpperCase()} Dmg`;
      config.chatCardTitle = `${config.chatCardTitle} [${tag}]`;
    }

    assert.equal(config.secondaryDamageAbilityMod, 4);
    assert.equal(config.secondaryDamageAbilityKey, "cha");
    assert.equal(config.secondaryDamageAbilityLabel, "Aura of Hate");
    assert.equal(config.chatCardTitle, "Greatsword [Aura of Hate]");

    const abilityScore = "str";
    const abilityMod = actor.system.abilities[abilityScore]?.mod || 0;
    const weaponModifier = 0;
    const secDmgAbilBonus = Number(config.secondaryDamageAbilityMod) || 0;
    const damageBonus = abilityMod + weaponModifier + secDmgAbilBonus;
    const flatBonus = config.damageModifier;
    const finalGWFTotal = 8 + damageBonus + flatBonus; // e.g. 8 rolled on 2d6 + 3 (STR) + 4 (Aura of Hate)

    assert.equal(finalGWFTotal, 8 + 3 + 4); // 15 total damage

    const secDmgAbilSign = secDmgAbilBonus >= 0 ? '+' : '';
    const secDmgAbilKeyUpper = (config.secondaryDamageAbilityKey || "").toUpperCase();
    const secDmgAbilDisplayLabel = config.secondaryDamageAbilityLabel ? `${config.secondaryDamageAbilityLabel} (${secDmgAbilKeyUpper})` : `Secondary Ability (${secDmgAbilKeyUpper})`;
    const damageDiceSummary = `<ul style="margin: 0 0 5px; padding-left: 15px; font-size: 0.95em; line-height: 1.4;">
    <li style="list-style-type: disc;">Ability Mod (${abilityScore.toUpperCase()}): <strong>+${abilityMod}</strong></li>
    <li style="list-style-type: disc;">Weapon Damage: <strong>2d6 (Slashing)</strong></li>
    ${weaponModifier !== 0 ? `<li style="list-style-type: disc;">Weapon Modifier: <strong>+${weaponModifier}</strong></li>` : ''}
    ${secDmgAbilBonus !== 0 ? `<li style="list-style-type: disc;">${secDmgAbilDisplayLabel}: <strong>${secDmgAbilSign}${secDmgAbilBonus}</strong></li>` : ''}
    ${config.damageModifier !== 0 ? `<li style="list-style-type: disc;">Other Damage Mod: <strong>+${config.damageModifier}</strong></li>` : ''}
  </ul>`;

    assert.ok(damageDiceSummary.includes("Aura of Hate (CHA): <strong>+4</strong>"));
  });

  it('Saving Throw Rider computes DC (fixed & ability-based) and renders rider block with damage and effect', () => {
    const actor = {
      system: {
        attributes: { prof: 3 },
        abilities: {
          str: { mod: 4 },
          con: { mod: 2 }
        }
      }
    };

    // Case 1: Fixed DC (e.g. Javelin of Lightning)
    const fixedRiderConfig = {
      hasSaveRider: true,
      isSaveRiderActive: true,
      saveRiderLabel: "Javelin of Lightning",
      saveRiderAbility: "dex",
      saveRiderDcType: "fixed",
      saveRiderDcFixed: 13,
      saveRiderDamageFormula: "4d6",
      saveRiderDamageType: "lightning",
      saveRiderSaveSuccess: "half",
      saveRiderEffect: ""
    };

    let fixedDC = fixedRiderConfig.saveRiderDcType === "ability"
      ? 8 + (actor.system.attributes.prof || 2) + (actor.system.abilities[fixedRiderConfig.saveRiderDcAbility]?.mod || 0)
      : Number(fixedRiderConfig.saveRiderDcFixed) || 13;

    assert.equal(fixedDC, 13);
    assert.equal(fixedRiderConfig.saveRiderAbility.toUpperCase(), "DEX");

    // Case 2: Ability-based DC (e.g. Battle Master Trip Attack: 8 + PB + STR)
    const abilityRiderConfig = {
      hasSaveRider: true,
      isSaveRiderActive: true,
      saveRiderLabel: "Trip Attack",
      saveRiderAbility: "str",
      saveRiderDcType: "ability",
      saveRiderDcAbility: "str",
      saveRiderDamageFormula: "",
      saveRiderDamageType: "",
      saveRiderSaveSuccess: "none",
      saveRiderEffect: "Knocked Prone"
    };

    let abilityDC = abilityRiderConfig.saveRiderDcType === "ability"
      ? 8 + (actor.system.attributes.prof || 2) + (actor.system.abilities[abilityRiderConfig.saveRiderDcAbility]?.mod || 0)
      : Number(abilityRiderConfig.saveRiderDcFixed) || 13;

    assert.equal(abilityDC, 8 + 3 + 4); // 15
    assert.equal(abilityRiderConfig.saveRiderAbility.toUpperCase(), "STR");
    assert.equal(abilityRiderConfig.saveRiderEffect, "Knocked Prone");
  });

  it("Savage Attacker selects higher pass and generates Option B summary banner without icons (handles multi-dice)", () => {
    // Case 1: Multi-dice weapon (e.g. 2d6 Greatsword)
    const pass1 = { total: 7, passResults: [3, 4], passRolls: [] };
    const pass2 = { total: 11, passResults: [6, 5], passRolls: [] };

    let finalCombinedDieResult = 0;
    let savageAttackerSummary = null;

    const config = { isSavageAttackerActive: true };

    if (config.isSavageAttackerActive) {
      const kept = pass2.total > pass1.total ? pass2 : pass1;
      const dropped = pass2.total > pass1.total ? pass1 : pass2;
      finalCombinedDieResult = kept.total;
      savageAttackerSummary = {
        roll1Total: pass1.total,
        roll2Total: pass2.total,
        roll1Dice: pass1.passResults,
        roll2Dice: pass2.passResults,
        keptTotal: kept.total,
        keptDice: kept.passResults,
        droppedTotal: dropped.total
      };
    }

    assert.equal(finalCombinedDieResult, 11);
    assert.deepEqual(savageAttackerSummary.roll1Dice, [3, 4]);
    assert.deepEqual(savageAttackerSummary.roll2Dice, [6, 5]);

    // Test banner formatting with dice breakdown and NO icon
    const r1Display = (savageAttackerSummary.roll1Dice && savageAttackerSummary.roll1Dice.length > 1)
      ? `${savageAttackerSummary.roll1Total} [${savageAttackerSummary.roll1Dice.join('+')}]`
      : savageAttackerSummary.roll1Total;
    const r2Display = (savageAttackerSummary.roll2Dice && savageAttackerSummary.roll2Dice.length > 1)
      ? `${savageAttackerSummary.roll2Total} [${savageAttackerSummary.roll2Dice.join('+')}]`
      : savageAttackerSummary.roll2Total;
    const keptDisplay = (savageAttackerSummary.keptDice && savageAttackerSummary.keptDice.length > 1)
      ? `${savageAttackerSummary.keptTotal} [${savageAttackerSummary.keptDice.join('+')}]`
      : savageAttackerSummary.keptTotal;

    const bannerHTML = `<div style="padding: 4px 6px; margin: 4px 0; border: 1px solid #8c3b2d; border-radius: 4px; background-color: rgba(140, 59, 45, 0.08); font-size: 0.85em; text-align: center;"><span style="font-weight: 700; color: #8c3b2d;">Savage Attacker:</span> <span>Rolled <strong>${r1Display}</strong> vs <strong>${r2Display}</strong> &rarr; <strong style="color: #18520b;">Kept ${keptDisplay}</strong></span></div>`;

    assert.ok(!bannerHTML.includes("<i class="));
    assert.ok(bannerHTML.includes("Rolled <strong>7 [3+4]</strong> vs <strong>11 [6+5]</strong> &rarr; <strong style=\"color: #18520b;\">Kept 11 [6+5]</strong>"));

    // Test breakdown summary line item
    const summaryLine = `<li style="list-style-type: disc;">Savage Attacker: <strong>Kept ${keptDisplay}</strong> (Rolled ${r1Display}, ${r2Display})</li>`;
    assert.equal(summaryLine, `<li style="list-style-type: disc;">Savage Attacker: <strong>Kept 11 [6+5]</strong> (Rolled 7 [3+4], 11 [6+5])</li>`);
  });

  it("Damage Floor (GWF 2024 / Elemental Adept) lifts rolled dice below threshold and formats breakdown", () => {
    // Case 1: GWF 2024 with floor 3 on 2d6 (rolls 1 and 5)
    const rawRolls = [1, 5];
    const floorValue = 3;
    const floorLabel = "Great Weapon Fighting (2024)";

    let floorCount = 0;
    const finalDice = rawRolls.map(die => {
      if (die < floorValue) {
        floorCount++;
        return floorValue;
      }
      return die;
    });

    const total = finalDice.reduce((a, b) => a + b, 0);
    assert.deepEqual(finalDice, [3, 5]);
    assert.equal(total, 8);
    assert.equal(floorCount, 1);

    const floorSummary = floorCount > 0 ? {
      count: floorCount,
      value: floorValue,
      label: floorLabel
    } : null;

    const breakdownLine = `<li style="list-style-type: disc;">${floorSummary.label}: Minimum ${floorSummary.value} applied to ${floorSummary.count} ${floorSummary.count === 1 ? 'die' : 'dice'}</li>`;
    assert.equal(breakdownLine, `<li style="list-style-type: disc;">Great Weapon Fighting (2024): Minimum 3 applied to 1 die</li>`);

    // Case 2: Elemental Adept with floor 2 on 2d6 (rolls 1 and 1)
    const rawAdept = [1, 1];
    let adeptCount = 0;
    const finalAdeptDice = rawAdept.map(die => {
      if (die < 2) {
        adeptCount++;
        return 2;
      }
      return die;
    });
    assert.deepEqual(finalAdeptDice, [2, 2]);
    assert.equal(adeptCount, 2);
    const adeptLine = `<li style="list-style-type: disc;">Elemental Adept: Minimum 2 applied to ${adeptCount} dice</li>`;
    assert.equal(adeptLine, `<li style="list-style-type: disc;">Elemental Adept: Minimum 2 applied to 2 dice</li>`);
  });

  it("Piercer Feat identifies lowest die, rerolls it, and respects damage floor", () => {
    const initialDice = [2, 5];
    let minIndex = 0;
    let minVal = initialDice[0];
    for (let i = 1; i < initialDice.length; i++) {
      if (initialDice[i] < minVal) {
        minVal = initialDice[i];
        minIndex = i;
      }
    }

    assert.equal(minIndex, 0);
    assert.equal(minVal, 2);

    // Simulate Piercer roll: 6
    let piercerRollVal = 6;
    initialDice[minIndex] = piercerRollVal;
    const newTotal = initialDice.reduce((a, b) => a + b, 0);

    assert.deepEqual(initialDice, [6, 5]);
    assert.equal(newTotal, 11);

    const piercerSummary = {
      original: minVal,
      reroll: piercerRollVal,
      label: "Piercer"
    };

    const breakdownLine = `<li style="list-style-type: disc;">${piercerSummary.label}: Rerolled ${piercerSummary.original} &rarr; <strong>${piercerSummary.reroll}</strong></li>`;
    assert.equal(breakdownLine, `<li style="list-style-type: disc;">Piercer: Rerolled 2 &rarr; <strong>6</strong></li>`);

    // Test with Damage Floor interaction: if Piercer rolls 1 with floor 3, it lifts to 3
    let floorPiercerVal = 1;
    const floor = 3;
    if (floorPiercerVal < floor) floorPiercerVal = floor;
    assert.equal(floorPiercerVal, 3);
  });
});
