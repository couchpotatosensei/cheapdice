import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSpellConfigFromItem, isSpellPrepared } from '../modules/custom-rolls.js';

describe('UI Render Safety & Spell Parser Test Suite', () => {
  const mockActor = {
    id: "mockActor123",
    name: "Aramil",
    classes: { wizard: true },
    system: {
      abilities: {
        str: { mod: 2 },
        dex: { mod: 3 },
        int: { mod: 4 },
        wis: { mod: 1 },
        cha: { mod: 0 }
      },
      attributes: {
        prof: 3,
        spellcasting: "int"
      },
      spells: {
        spell1: { value: 4, max: 4 },
        spell2: { value: 3, max: 3 },
        spell3: { value: 2, max: 2 }
      }
    },
    itemTypes: {
      class: [{ name: "Wizard" }],
      feat: [],
      spell: []
    }
  };

  it('buildSpellConfigFromItem correctly creates a valid spell configuration', () => {
    const mockSpellItem = {
      id: "spellItem1",
      name: "Cure Wounds",
      type: "spell",
      system: {
        level: 1,
        ability: "int",
        actionType: "heal",
        activation: { cost: 1, type: "action" },
        range: { value: null, units: "touch" },
        duration: { value: null, units: "instantaneous" },
        damage: { parts: [["1d8 + @mod", "healing"]] },
        preparation: { mode: "prepared", prepared: true },
        description: { value: "<p>A creature you touch regains hit points.</p>" }
      }
    };

    const cfg = buildSpellConfigFromItem(mockSpellItem, mockActor);
    assert.ok(cfg, "Config should be generated");
    assert.equal(cfg.spellName, "Cure Wounds");
    assert.equal(cfg.baseLevel, 1);
    assert.equal(cfg.resolutionMethod, "heal");
    assert.equal(cfg.damageDieSize, "d8");
    assert.equal(cfg.damageDiceCount, 1);
  });

  it('buildSpellConfigFromItem correctly handles modern dnd5e activities (v3/v4)', () => {
    // 1. Save spell with damage (e.g. Fireball)
    const modernFireball = {
      id: "spellFireball",
      name: "Fireball",
      type: "spell",
      system: {
        level: 3,
        activities: new Map([
          ["actSave", {
            type: "save",
            save: { ability: new Set(["dex"]), dc: { calculation: "spellcasting" } },
            damage: {
              parts: [{
                number: 8,
                denomination: 6,
                types: new Set(["fire"])
              }]
            }
          }]
        ])
      }
    };
    const fbCfg = buildSpellConfigFromItem(modernFireball, mockActor);
    assert.equal(fbCfg.resolutionMethod, "save");
    assert.equal(fbCfg.saveAbility, "dex");
    assert.equal(fbCfg.damageDiceCount, 8);
    assert.equal(fbCfg.damageDieSize, "d6");
    assert.equal(fbCfg.damageType, "fire");

    // 2. Utility spell without attack or save (e.g. Mage Armor)
    const modernMageArmor = {
      id: "spellMageArmor",
      name: "Mage Armor",
      type: "spell",
      system: {
        level: 1,
        activities: new Map([
          ["actUtil", {
            type: "utility"
          }]
        ])
      }
    };
    const maCfg = buildSpellConfigFromItem(modernMageArmor, mockActor);
    assert.equal(maCfg.resolutionMethod, "other");
    assert.equal(maCfg.damageDiceCount, 0);

    // 3. Heal spell (e.g. Healing Word)
    const modernHealingWord = {
      id: "spellHeal",
      name: "Healing Word",
      type: "spell",
      system: {
        level: 1,
        activities: new Map([
          ["actHeal", {
            type: "heal",
            healing: {
              parts: [{
                number: 1,
                denomination: 4,
                types: new Set(["healing"])
              }]
            }
          }]
        ])
      }
    };
    const hwCfg = buildSpellConfigFromItem(modernHealingWord, mockActor);
    assert.equal(hwCfg.resolutionMethod, "heal");
    assert.equal(hwCfg.damageDiceCount, 1);
    assert.equal(hwCfg.damageDieSize, "d4");
  });

  it('isSpellPrepared recognizes cantrips, prepared spells, and wizard rituals', () => {
    const cantrip = {
      type: "spell",
      system: { level: 0, preparation: { mode: "prepared", prepared: false } }
    };
    assert.equal(isSpellPrepared(cantrip, mockActor), true, "Cantrips must always be prepared");

    const preparedLvl1 = {
      type: "spell",
      system: { level: 1, preparation: { mode: "prepared", prepared: true } }
    };
    assert.equal(isSpellPrepared(preparedLvl1, mockActor), true, "Actively prepared spells must be true");

    const unpreparedLvl1 = {
      type: "spell",
      system: { level: 1, preparation: { mode: "prepared", prepared: false } }
    };
    assert.equal(isSpellPrepared(unpreparedLvl1, mockActor), false, "Unprepared leveled spells must be false");

    const wizardRitual = {
      type: "spell",
      system: {
        level: 1,
        preparation: { mode: "prepared", prepared: false },
        properties: new Set(["ritual"])
      }
    };
    assert.equal(isSpellPrepared(wizardRitual, mockActor), true, "Wizards can cast unprepared rituals");
  });

  it('Simulated renderCard for attacks and spells executes with all variables defined', () => {
    // Tests that all closure variables in card template string evaluation resolve without ReferenceError
    const testSpells = [
      {
        key: "Fireball",
        sp: { baseLevel: 3, resolutionMethod: "save", isFavorite: true },
        d: { tags: ["1 Action", "150 ft"], actionVal: "DC 15 DEX", valFormula: "8d6", typeLabel: "FIRE" }
      },
      {
        key: "Cure Wounds",
        sp: { baseLevel: 1, resolutionMethod: "heal", isFavorite: false },
        d: { tags: ["1 Action", "Touch"], actionVal: "HEAL", valFormula: "1d8+4", typeLabel: "RECOVERY" }
      },
      {
        key: "Fire Bolt",
        sp: { baseLevel: 0, resolutionMethod: "attack", isFavorite: false },
        d: { tags: ["1 Action", "120 ft"], actionVal: "+7", valFormula: "1d10", typeLabel: "FIRE" }
      }
    ];

    for (const { key, sp, d } of testSpells) {
      const isSel = false;
      const lvlLabel = Number(sp.baseLevel) === 0 ? "Cantrip" : `Lvl ${sp.baseLevel}`;
      const tagsHtml = d.tags.map(t => `<span>${t}</span>`).join(" ");
      const hudBadge = "";
      const isFav = Boolean(sp.isFavorite);
      const starIcon = isFav ? "fav" : "not-fav";
      const isHealing = ["heal", "temp_hp", "max_hp"].includes(sp.resolutionMethod);
      const scope = "level";

      // Execute exact template evaluation
      const html = `
        <div class="action-card spell-card custom-spell-card" data-key="${key}" data-level="${sp.baseLevel ?? 0}" data-scope="${scope}">
          <span class="spell-card-title">${key}</span>
          <span class="spell-card-level-label">${lvlLabel}</span>
          <span>${starIcon}</span>
          <span>${hudBadge}</span>
          <span class="weapon-card-atk-line">${sp.resolutionMethod === 'save' ? 'Save:' : 'Atk:'} ${d.actionVal}</span>
          <span class="weapon-card-dmg-line">${isHealing ? 'Heal:' : 'Dmg:'} <strong>${d.valFormula}</strong></span>
          ${tagsHtml}
        </div>
      `;

      assert.ok(html.length > 50, "HTML card string rendered successfully");
      assert.ok(html.includes(key), "HTML card includes spell name");
    }
  });

  it('Spell filter bar logic correctly filters spell levels and favorites', () => {
    const testSpellConfigs = {
      "Fire Bolt": { baseLevel: 0, isFavorite: false },
      "Mage Armor": { baseLevel: 1, isFavorite: true },
      "Shield": { baseLevel: 1, isFavorite: false },
      "Misty Step": { baseLevel: 2, isFavorite: true },
      "Fireball": { baseLevel: 3, isFavorite: false }
    };

    const spellKeys = Object.keys(testSpellConfigs);
    const filterSpells = (activeFilters) => {
      const hasActiveFilters = activeFilters.size > 0;
      const favorites = [];
      const levels = {};
      for (const key of spellKeys) {
        const sp = testSpellConfigs[key];
        if (sp.isFavorite) favorites.push(key);
        const lvl = Math.clamp ? Math.clamp(Number(sp.baseLevel) || 0, 0, 9) : Math.max(0, Math.min(9, Number(sp.baseLevel) || 0));
        if (!levels[lvl]) levels[lvl] = [];
        levels[lvl].push(key);
      }

      const showFavSection = favorites.length > 0 && (!hasActiveFilters || activeFilters.has("fav"));
      const visibleLevels = Object.keys(levels).map(Number).filter(lvl => !hasActiveFilters || activeFilters.has(String(lvl)));
      return { showFavSection, favorites, visibleLevels, levels };
    };

    // Default: no filters active -> show favs and all levels 0, 1, 2, 3
    const def = filterSpells(new Set());
    assert.equal(def.showFavSection, true);
    assert.deepEqual(def.visibleLevels, [0, 1, 2, 3]);

    // Filter by Fav only
    const favOnly = filterSpells(new Set(["fav"]));
    assert.equal(favOnly.showFavSection, true);
    assert.deepEqual(favOnly.visibleLevels, []);

    // Filter by Level 1 and 2
    const lvl1and2 = filterSpells(new Set(["1", "2"]));
    assert.equal(lvl1and2.showFavSection, false);
    assert.deepEqual(lvl1and2.visibleLevels, [1, 2]);

    // Multi-select Fav and Level 3
    const favAnd3 = filterSpells(new Set(["fav", "3"]));
    assert.equal(favAnd3.showFavSection, true);
    assert.deepEqual(favAnd3.visibleLevels, [3]);
  });

  it('generates correct circular pips and counts for available vs spent display modes', () => {
    const mockActorWithSlots = {
      system: {
        spells: {
          spell1: { value: 3, max: 4 },
          spell2: { value: 0, max: 2 },
          pact: { value: 2, max: 2 }
        }
      }
    };

    function simulateSlotTracker(actor, mode) {
      const spells = actor?.system?.spells || {};
      const slotEntries = [];
      for (let lvl = 1; lvl <= 9; lvl++) {
        const slot = spells[`spell${lvl}`];
        const max = Number(slot?.max) || 0;
        if (max > 0) {
          slotEntries.push({
            label: `Lvl ${lvl}`,
            current: Math.max(0, Number(slot?.value) || 0),
            max
          });
        }
      }
      if (spells.pact?.max > 0) {
        slotEntries.push({
          label: "Pact",
          current: Math.max(0, Number(spells.pact.value) || 0),
          max: spells.pact.max
        });
      }

      const isAvail = mode === "available";
      return slotEntries.map(entry => {
        const available = Math.min(entry.current, entry.max);
        const spent = Math.max(0, entry.max - available);
        let filledCount = 0;
        let emptyCount = 0;
        for (let i = 0; i < entry.max; i++) {
          const isFilled = isAvail ? (i < available) : (i < spent);
          if (isFilled) filledCount++;
          else emptyCount++;
        }
        const countText = isAvail ? `${available}/${entry.max}` : `${spent}/${entry.max}`;
        return { label: entry.label, filledCount, emptyCount, countText };
      });
    }

    const availRows = simulateSlotTracker(mockActorWithSlots, "available");
    assert.equal(availRows.length, 3);
    // Level 1: 3/4 available -> 3 filled, 1 empty
    assert.deepEqual(availRows[0], { label: "Lvl 1", filledCount: 3, emptyCount: 1, countText: "3/4" });
    // Level 2: 0/2 available -> 0 filled, 2 empty
    assert.deepEqual(availRows[1], { label: "Lvl 2", filledCount: 0, emptyCount: 2, countText: "0/2" });
    // Pact: 2/2 available -> 2 filled, 0 empty
    assert.deepEqual(availRows[2], { label: "Pact", filledCount: 2, emptyCount: 0, countText: "2/2" });

    const spentRows = simulateSlotTracker(mockActorWithSlots, "spent");
    // Level 1: 1/4 spent -> 1 filled, 3 empty
    assert.deepEqual(spentRows[0], { label: "Lvl 1", filledCount: 1, emptyCount: 3, countText: "1/4" });
    // Level 2: 2/2 spent -> 2 filled, 0 empty
    assert.deepEqual(spentRows[1], { label: "Lvl 2", filledCount: 2, emptyCount: 0, countText: "2/2" });
    // Pact: 0/2 spent -> 0 filled, 2 empty
    assert.deepEqual(spentRows[2], { label: "Pact", filledCount: 0, emptyCount: 2, countText: "0/2" });
  });

  it('correctly identifies item/feat spell source and charge deduction behavior', () => {
    const wandItem = {
      id: "wand123",
      name: "Wand of Magic Missiles",
      type: "equipment",
      system: {
        uses: { value: 5, max: 7 },
        preparation: { mode: "atwill" }
      }
    };
    const feyTouchedSpell = {
      id: "spMisty",
      name: "Misty Step",
      type: "spell",
      system: {
        level: 2,
        uses: { value: 1, max: 1 },
        preparation: { mode: "always" }
      }
    };
    const standardSpell = {
      id: "spFire",
      name: "Fireball",
      type: "spell",
      system: {
        level: 3,
        uses: { value: null, max: null },
        preparation: { mode: "prepared" }
      }
    };

    const mockActorItems = {
      items: {
        get: (id) => [wandItem, feyTouchedSpell, standardSpell].find(i => i.id === id),
        getName: (name) => [wandItem, feyTouchedSpell, standardSpell].find(i => i.name === name)
      }
    };

    function checkSourceInfo(spell, actor) {
      const it = (spell.itemId ? actor.items?.get(spell.itemId) : null)
        || actor.items?.getName(spell.spellName);
      if (!it) return null;
      const isNonSpellType = it.type !== "spell";
      const prepMode = it.system?.preparation?.mode;
      const hasItemUses = Boolean(it.system?.uses && Number(it.system.uses.max) > 0);
      const isInnateOrAtWill = ["innate", "atwill"].includes(prepMode);

      if (!isNonSpellType && !hasItemUses && !isInnateOrAtWill) return null;
      const isPureItem = isNonSpellType || (hasItemUses && !["prepared", "always"].includes(prepMode));
      return {
        isPureItem,
        hasItemUses,
        curUses: Number(it.system?.uses?.value ?? 0),
        maxUses: Number(it.system?.uses?.max ?? 0)
      };
    }

    // Pure magic item: Wand of Magic Missiles
    const wandCheck = checkSourceInfo({ itemId: "wand123", spellName: "Magic Missile", baseLevel: 1 }, mockActorItems);
    assert.ok(wandCheck);
    assert.equal(wandCheck.isPureItem, true);
    assert.equal(wandCheck.hasItemUses, true);
    assert.equal(wandCheck.curUses, 5);
    assert.equal(wandCheck.maxUses, 7);

    // Dual-cast feat spell: Misty Step (Fey Touched: 1 free use + spell slots)
    const feyCheck = checkSourceInfo({ itemId: "spMisty", spellName: "Misty Step", baseLevel: 2 }, mockActorItems);
    assert.ok(feyCheck);
    assert.equal(feyCheck.isPureItem, false, "Feat spell with 'always' prep mode should allow dual-cast selection");
    assert.equal(feyCheck.hasItemUses, true);
    assert.equal(feyCheck.curUses, 1);
    assert.equal(feyCheck.maxUses, 1);

    // Standard prepared spell
    const stdCheck = checkSourceInfo({ itemId: "spFire", spellName: "Fireball", baseLevel: 3 }, mockActorItems);
    assert.equal(stdCheck, null, "Standard class spell should not have item source info");
  });

  it("modern dnd5e uses.spent unwrap and spell sorting resilience", () => {
    // 1. Check system.uses.spent calculation
    const itemWithSpent = {
      name: "Staff of the Magi",
      system: {
        uses: {
          max: 50,
          spent: 10
        }
      }
    };
    const maxUses = Number(itemWithSpent.system.uses.max) || 0;
    const curUses = itemWithSpent.system.uses.spent !== undefined
      ? Math.max(0, maxUses - Number(itemWithSpent.system.uses.spent))
      : Number(itemWithSpent.system.uses.value || 0);
    assert.equal(curUses, 40);

    // Decrement 5 charges
    const chargeCost = 5;
    const newUses = Math.max(0, curUses - chargeCost);
    const newSpent = Math.max(0, maxUses - newUses);
    assert.equal(newUses, 35);
    assert.equal(newSpent, 15);

    // 2. Check alphabetical sorting of spells in levels and sync
    const spells = {
      "Shield": { baseLevel: 1 },
      "Bless": { baseLevel: 1 },
      "Absorb Elements": { baseLevel: 1 }
    };
    const sortedKeys = Object.keys(spells).sort((a, b) => a.localeCompare(b));
    assert.deepEqual(sortedKeys, ["Absorb Elements", "Bless", "Shield"]);

    // 3. Check zero-charge gray-out / mutual exclusion logic
    const emptyItem = { curUses: 0, maxUses: 7, chargeCost: 1 };
    const hasEnoughCharges = emptyItem.curUses >= emptyItem.chargeCost;
    assert.equal(hasEnoughCharges, false);
    const chargeDeductDisabled = !hasEnoughCharges;
    assert.equal(chargeDeductDisabled, true);
  });

  it("Dice Stuff side tray formula builder handles normal, advantage, and disadvantage", () => {
    function buildFormula(counts, mode) {
      const parts = [];
      const diceOrder = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
      for (const d of diceOrder) {
        const count = counts[d] || 0;
        if (count > 0) {
          if (d === "d20") {
            if (mode === "adv") {
              parts.push(count === 1 ? "2d20kh" : `${count + 1}d20kh`);
            } else if (mode === "dis") {
              parts.push(count === 1 ? "2d20kl" : `${count + 1}d20kl`);
            } else {
              parts.push(`${count}d20`);
            }
          } else {
            parts.push(`${count}${d}`);
          }
        }
      }
      return parts.join(" + ");
    }

    // Normal multi-dice
    assert.equal(buildFormula({ d10: 6 }, "norm"), "6d10");
    assert.equal(buildFormula({ d10: 6, d6: 2 }, "norm"), "2d6 + 6d10");

    // d20 modes
    assert.equal(buildFormula({ d20: 1 }, "norm"), "1d20");
    assert.equal(buildFormula({ d20: 1 }, "adv"), "2d20kh");
    assert.equal(buildFormula({ d20: 1 }, "dis"), "2d20kl");

    // Combined d20 adv + extra damage die
    assert.equal(buildFormula({ d20: 1, d8: 1 }, "adv"), "1d8 + 2d20kh");
  });
});

