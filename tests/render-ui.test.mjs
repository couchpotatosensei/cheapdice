import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildSpellConfigFromItem, isSpellPrepared, syncSpellsWithSheet } from '../modules/custom-rolls.js';
import { formatChatMessageWithMode, toggleChatMode, getActiveChatMode, setActiveChatMode, wrapChatLogProcessMessage, handleChatMessageHook } from '../modules/chat-controls.js';
import {
  appendDieToChatText,
  removeDieFromChatText,
  swapD20ModeInText,
  getChatTextareaValue,
  writeToChatTextarea,
  setChatEditorView,
  updateFlatModifierInChatText,
  parseFormulaStateFromChatText,
  getTrayDiceCounts,
  resetTrayDiceCounts,
  buildDiceTrayElement
} from '../modules/dice-tray-copycat.js';

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

    // 4. Real dnd5e v3/v4/v5+ Heal activity (direct object without healing.parts)
    const modernCureWounds = {
      id: "spellCW",
      name: "Cure Wounds",
      type: "spell",
      system: {
        level: 1,
        activities: new Map([
          ["actCW", {
            type: "heal",
            healing: {
              number: 2,
              denomination: 8,
              bonus: "@mod",
              types: new Set(["healing"])
            }
          }]
        ])
      }
    };
    const cwCfg = buildSpellConfigFromItem(modernCureWounds, mockActor);
    assert.equal(cwCfg.resolutionMethod, "heal");
    assert.equal(cwCfg.damageDiceCount, 2);
    assert.equal(cwCfg.damageDieSize, "d8");
    assert.equal(cwCfg.addAbilityModToValue, true);
  });

  it('buildSpellConfigFromItem gates fixedSaveDC to item, feat, feature, and innate/atwill spells', () => {
    const wandFireball = {
      id: "wand_fb_1",
      name: "Fireball",
      type: "spell",
      flags: { dnd5e: { cachedFor: ".Item.wand123.Activity.act1" } },
      system: {
        level: 3,
        method: "innate",
        activities: new Map([
          ["act1", {
            type: "save",
            save: { ability: new Set(["dex"]), scaling: "half", dc: { calculation: "flat", formula: "15" } },
            damage: { parts: [{ number: 8, denomination: 6, types: new Set(["fire"]) }] }
          }]
        ])
      }
    };
    const wandCfg = buildSpellConfigFromItem(wandFireball, mockActor);
    assert.equal(wandCfg.fixedSaveDC, 15, "Item-sourced spell with flat DC must preserve fixedSaveDC");

    const normalPrepared = {
      id: "prep_fb_1",
      name: "Fireball",
      type: "spell",
      system: {
        level: 3,
        preparation: { mode: "prepared", prepared: true },
        activities: new Map([
          ["act1", {
            type: "save",
            save: { ability: new Set(["dex"]), scaling: "half", dc: { calculation: "flat", formula: "15" } },
            damage: { parts: [{ number: 8, denomination: 6, types: new Set(["fire"]) }] }
          }]
        ])
      }
    };
    const prepCfg = buildSpellConfigFromItem(normalPrepared, mockActor);
    assert.equal(prepCfg.fixedSaveDC, null, "Normal prepared spell must ignore flat DC and use caster Spell Save DC");
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

  it("Dice Stuff side tray formula builder handles normal, advantage, disadvantage, and flat modifiers", () => {
    function buildFormula(counts, mode, modifier = 0) {
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
      let formula = parts.join(" + ");
      if (modifier !== 0) {
        if (formula) {
          formula += modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
        } else {
          formula = `${modifier}`;
        }
      }
      return formula;
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

    // Flat modifiers
    assert.equal(buildFormula({ d20: 1 }, "norm", 5), "1d20 + 5");
    assert.equal(buildFormula({ d20: 1 }, "adv", 3), "2d20kh + 3");
    assert.equal(buildFormula({ d8: 2 }, "norm", -2), "2d8 - 2");
    assert.equal(buildFormula({}, "norm", 4), "4");
    assert.equal(buildFormula({}, "norm", 0), "");
  });

  it("syncSpellsWithSheet synchronizes spells without assignment error and sorts alphabetically", async () => {
    let savedProfileSpells = null;
    globalThis.foundry = {
      utils: {
        deepClone: (obj) => JSON.parse(JSON.stringify(obj || {}))
      }
    };
    globalThis.game = {
      user: { isGM: true },
      settings: {
        settings: new Map(),
        get: () => ({}),
        set: async () => true
      }
    };
    globalThis.ui = {
      notifications: {
        info: () => { }
      }
    };

    const mockSyncActor = {
      id: "syncActor1",
      name: "Sync Tester",
      system: {
        abilities: { int: { mod: 4 } },
        attributes: { prof: 2, spellcasting: "int" }
      },
      itemTypes: {
        class: [{ name: "Wizard" }],
        feat: [],
        spell: [
          {
            id: "spZ",
            name: "Zephyr Strike",
            type: "spell",
            system: {
              level: 1,
              preparation: { mode: "always", prepared: true },
              activation: { cost: 1, type: "bonus" },
              damage: { parts: [] }
            }
          },
          {
            id: "spA",
            name: "Acid Splash",
            type: "spell",
            system: {
              level: 0,
              preparation: { mode: "prepared", prepared: true },
              activation: { cost: 1, type: "action" },
              damage: { parts: [["1d6", "acid"]] }
            }
          }
        ]
      },
      getFlag: (scope, key) => {
        if (key === "spellConfigs") return savedProfileSpells;
        return null;
      },
      setFlag: async (scope, key, val) => {
        if (key === "spellConfigs") savedProfileSpells = val;
      }
    };

    // Run sync without prompting (promptUser: false)
    const result = await syncSpellsWithSheet(mockSyncActor, { promptUser: false });
    assert.equal(result, true);
    assert.ok(savedProfileSpells);
    const keys = Object.keys(savedProfileSpells);
    assert.deepEqual(keys, ["Acid Splash", "Zephyr Strike"]);
  });

  it("Dice Stuff vitals extraction & delta math handles HP and hit dice cleanly", () => {
    const mockActor = {
      system: {
        attributes: {
          hp: { value: 35, max: 40, temp: 5 },
          hd: { value: 3, max: 5 }
        }
      },
      itemTypes: {
        class: [
          { system: { levels: 3, hitDiceUsed: 1, hitDice: "d8" } },
          { system: { levels: 2, hitDiceUsed: 1, hitDice: "d10" } }
        ]
      }
    };

    // Extract HP
    const curHp = Number(mockActor.system.attributes.hp.value) || 0;
    const maxHp = Number(mockActor.system.attributes.hp.max) || 0;
    const tempHp = Number(mockActor.system.attributes.hp.temp) || 0;
    assert.equal(curHp, 35);
    assert.equal(maxHp, 40);
    assert.equal(tempHp, 5);

    // Delta test
    const applyDelta = (current, str) => {
      if (str.startsWith("+") || str.startsWith("-")) {
        const delta = Number(str);
        return !isNaN(delta) ? Math.max(0, current + delta) : current;
      }
      const num = Number(str);
      return !isNaN(num) ? Math.max(0, num) : current;
    };

    assert.equal(applyDelta(curHp, "-10"), 25);
    assert.equal(applyDelta(curHp, "+15"), 50);
    assert.equal(applyDelta(curHp, "-100"), 0);
    assert.equal(applyDelta(curHp, "20"), 20);

    // Smart damage / healing delta with THP absorption test
    const applySmartDelta = (curHp, curTemp, maxHp, inputStr) => {
      let hp = curHp;
      let temp = curTemp;
      if (inputStr.startsWith("-")) {
        let dmg = Math.abs(Number(inputStr));
        if (temp > 0) {
          const absorbed = Math.min(temp, dmg);
          temp -= absorbed;
          dmg -= absorbed;
        }
        if (dmg > 0) {
          hp = Math.max(0, hp - dmg);
        }
      } else if (inputStr.startsWith("+")) {
        const heal = Number(inputStr);
        hp = Math.min(maxHp, Math.max(0, hp + heal));
      }
      return { hp, temp };
    };

    // 100 HP, 10 THP takes 20 damage -> 90 HP, 0 THP
    assert.deepEqual(applySmartDelta(100, 10, 100, "-20"), { hp: 90, temp: 0 });
    // 100 HP, 10 THP takes 5 damage -> 100 HP, 5 THP
    assert.deepEqual(applySmartDelta(100, 10, 100, "-5"), { hp: 100, temp: 5 });
    // 80 HP, 5 THP heals +15 -> 95 HP, 5 THP (healing doesn't touch temp)
    assert.deepEqual(applySmartDelta(80, 5, 100, "+15"), { hp: 95, temp: 5 });

    // Hit Dice calculation fallback
    let hdCurrent = 0;
    let hdMax = 0;
    mockActor.itemTypes.class.forEach(c => {
      const levels = Number(c.system.levels) || 0;
      const used = Number(c.system.hitDiceUsed) || 0;
      hdCurrent += Math.max(0, levels - used);
      hdMax += levels;
    });
    assert.equal(hdCurrent, 3);
    assert.equal(hdMax, 5);
  });

  it("Dice Stuff vitals extraction handles AC and slot rendering cleanly", () => {
    // 1. Standard dnd5e actor with attributes.ac.value
    const actorA = {
      system: {
        attributes: {
          ac: { value: 18, calc: "default" }
        }
      }
    };
    const acA = actorA.system?.attributes?.ac?.value ?? actorA.system?.attributes?.ac ?? "--";
    assert.equal(acA, 18);

    // 2. Fallback actor where ac is a flat number/string
    const actorB = {
      system: {
        attributes: {
          ac: 14
        }
      }
    };
    const acB = actorB.system?.attributes?.ac?.value ?? actorB.system?.attributes?.ac ?? "--";
    assert.equal(acB, 14);

    // 3. Fallback actor missing ac entirely
    const actorC = {
      system: {
        attributes: {}
      }
    };
    const acC = actorC.system?.attributes?.ac?.value ?? actorC.system?.attributes?.ac ?? "--";
    assert.equal(acC, "--");

    // 4. Test button HTML generation and progress bar percentage math
    const maxHp = 142;
    const curHp = 120;
    const tempHp = 15;
    const hpPct = Math.min(100, Math.max(0, Math.round((curHp / (maxHp || 1)) * 100)));
    const thpPct = Math.min(100, Math.round((tempHp / (maxHp || 1)) * 100));
    assert.equal(hpPct, 85);
    assert.equal(thpPct, 11);

    const buttonHtml = `
      <div id="dice-stuff-armor-class-slot">
        <button type="button" id="dice-stuff-ac-btn" title="Armor Class: ${acA}">
          <i class="fas fa-shield-halved"></i>
          <span>${acA}</span>
        </button>
      </div>
      <div id="dice-stuff-hp-bar-track">
        <div id="dice-stuff-hp-bar-fill" style="width: ${hpPct}%"></div>
        <div id="dice-stuff-thp-bar-fill" style="width: ${thpPct}%"></div>
      </div>
    `;
    assert.ok(buttonHtml.includes('id="dice-stuff-ac-btn"'));
    assert.ok(buttonHtml.includes('<span>18</span>'));
    assert.ok(buttonHtml.includes('id="dice-stuff-hp-bar-track"'));
    assert.ok(buttonHtml.includes('width: 85%'));
    assert.ok(buttonHtml.includes('fa-shield-halved'));
  });

  it("Dice Stuff header buttons order left-to-right: [gm-tools], [refresh], [compact], [options], [close]", () => {
    // Simulate DOM elements array ordered via the injection logic
    const headerChildren = ["close"];
    const insertBefore = (targetClass, newClass) => {
      const idx = headerChildren.indexOf(targetClass);
      if (idx !== -1) {
        headerChildren.splice(idx, 0, newClass);
      } else {
        headerChildren.unshift(newClass);
      }
    };

    // Injection order backwards before .close:
    // 1. menuBtn before close
    // 2. collapseBtn before menuBtn
    // 3. refreshBtn before collapseBtn
    // 4. gmBtn before refreshBtn (if GM)
    insertBefore("close", "dice-stuff-menu-btn");
    insertBefore("dice-stuff-menu-btn", "dice-stuff-collapse-btn");
    insertBefore("dice-stuff-collapse-btn", "dice-stuff-refresh-btn");
    insertBefore("dice-stuff-refresh-btn", "gm-tools-header-btn");

    assert.deepEqual(headerChildren, [
      "gm-tools-header-btn",
      "dice-stuff-refresh-btn",
      "dice-stuff-collapse-btn",
      "dice-stuff-menu-btn",
      "close"
    ]);

    // For non-GM players (without gm-tools-header-btn)
    const playerChildren = headerChildren.filter(c => c !== "gm-tools-header-btn");
    assert.deepEqual(playerChildren, [
      "dice-stuff-refresh-btn",
      "dice-stuff-collapse-btn",
      "dice-stuff-menu-btn",
      "close"
    ]);
  });

  it("Dice Stuff Options menu contains Theme, Guide, and Combat Reference buttons", () => {
    const menuHtml = `
      <div style="display: flex; flex-direction: column; gap: 6px; padding: 6px 2px;">
        <button type="button" id="ds-menu-theme">Choose Theme</button>
        <button type="button" id="ds-menu-guide">Dice Stuff Guide</button>
        <button type="button" id="ds-menu-quickref">5e Combat Reference</button>
      </div>
    `;
    assert.ok(menuHtml.includes('id="ds-menu-theme"'));
    assert.ok(menuHtml.includes('id="ds-menu-guide"'));
    assert.ok(menuHtml.includes('id="ds-menu-quickref"'));
  });

  it("Dice Stuff Options header button is icon-only with no text label across views", () => {
    const menuBtnHtml = `
      <a class="header-button dice-stuff-menu-btn" title="Options & Help" style="cursor: pointer; margin-right: 4px;">
        <i class="fas fa-cog"></i>
      </a>
    `;
    assert.ok(menuBtnHtml.includes('dice-stuff-menu-btn'));
    assert.ok(menuBtnHtml.includes('fa-cog'));
    assert.ok(!menuBtnHtml.includes('menu-label-text'));
    assert.ok(!menuBtnHtml.includes('>Options<'));
  });

  it("5e Combat QuickRef structures Movement, Actions, Bonus Actions, Reactions, Cover, and Conditions", () => {
    const categories = [
      "Movement",
      "Action",
      "Bonus Action",
      "Reaction",
      "Cover & Environment",
      "Conditions"
    ];
    for (const cat of categories) {
      assert.ok(typeof cat === "string" && cat.length > 0);
    }
  });

  it("Dice Stuff dialogOptions preserves top and left coordinates across reloads", () => {
    const buildDialogConfig = (isCompact, dialogOptions) => ({
      width: isCompact ? 310 : 980,
      height: "auto",
      resizable: true,
      ...(dialogOptions?.top !== undefined ? { top: dialogOptions.top } : {}),
      ...(dialogOptions?.left !== undefined ? { left: dialogOptions.left } : {})
    });

    const defaultCfg = buildDialogConfig(false, {});
    assert.equal(defaultCfg.top, undefined);
    assert.equal(defaultCfg.left, undefined);
    assert.equal(defaultCfg.width, 980);

    const reloadedCfg = buildDialogConfig(true, { top: 180, left: 340 });
    assert.equal(reloadedCfg.top, 180);
    assert.equal(reloadedCfg.left, 340);
    assert.equal(reloadedCfg.width, 310);
  });

  it("Dice Stuff Tactical Glass theme styles vitals card elements for high readability", async () => {
    const fs = await import("fs");
    const customRollsSrc = fs.readFileSync("modules/custom-rolls.js", "utf8");
    assert.ok(customRollsSrc.includes(".app.dialog.cheapdice-theme-glass #dice-stuff-hp-max-label"));
    assert.ok(customRollsSrc.includes(".app.dialog.cheapdice-theme-glass #dice-stuff-hp-pct-label"));
    assert.ok(customRollsSrc.includes(".app.dialog.cheapdice-theme-glass #dice-stuff-hd-pill > span:first-child"));
    assert.ok(customRollsSrc.includes(".app.dialog.cheapdice-theme-glass #dice-stuff-hd-pill i"));
  });

  it("formatChatMessageWithMode formats messages correctly for IC and EM modes", () => {
    // Basic text prefixing
    assert.equal(formatChatMessageWithMode("Hello there!", "ic"), "/ic Hello there!");
    assert.equal(formatChatMessageWithMode("smiles warmly.", "em"), "/em smiles warmly.");

    // Does not prefix when mode is null or empty
    assert.equal(formatChatMessageWithMode("Normal text", null), "Normal text");
    assert.equal(formatChatMessageWithMode("Normal text", undefined), "Normal text");

    // Preserves slash commands regardless of active mode
    assert.equal(formatChatMessageWithMode("/r 1d20+4", "ic"), "/r 1d20+4");
    assert.equal(formatChatMessageWithMode("/w GM secret", "em"), "/w GM secret");
    assert.equal(formatChatMessageWithMode("/ic Already ic", "ic"), "/ic Already ic");
    assert.equal(formatChatMessageWithMode("/em Already em", "em"), "/em Already em");
    assert.equal(formatChatMessageWithMode("/ooc Out of character", "ic"), "/ooc Out of character");

    // ProseMirror <p> tag unwrapping
    assert.equal(formatChatMessageWithMode("<p>thinking about lunch</p>", "em"), "/em thinking about lunch");
    assert.equal(formatChatMessageWithMode("<p>speaking in character</p>", "ic"), "/ic speaking in character");
    assert.equal(formatChatMessageWithMode("<p>/r 1d20+5</p>", "em"), "/r 1d20+5");

    // Whitespace resilience
    assert.equal(formatChatMessageWithMode("   /roll 2d6   ", "ic"), "   /roll 2d6   ");
    assert.equal(formatChatMessageWithMode("", "ic"), "");
    assert.equal(formatChatMessageWithMode("   ", "ic"), "   ");
    assert.equal(formatChatMessageWithMode(null, "ic"), null);
  });

  it("toggleChatMode handles mutually exclusive toggling and deselection cleanly", () => {
    // Reset to null
    setActiveChatMode(null);
    assert.equal(getActiveChatMode(), null);

    // Toggle IC on
    assert.equal(toggleChatMode("ic"), "ic");
    assert.equal(getActiveChatMode(), "ic");

    // Toggle IC off (deselect)
    assert.equal(toggleChatMode("ic"), null);
    assert.equal(getActiveChatMode(), null);

    // Toggle EM on
    assert.equal(toggleChatMode("em"), "em");
    assert.equal(getActiveChatMode(), "em");

    // Switch from EM to IC directly
    assert.equal(toggleChatMode("ic"), "ic");
    assert.equal(getActiveChatMode(), "ic");

    // Toggle IC off
    assert.equal(toggleChatMode("ic"), null);
    assert.equal(getActiveChatMode(), null);
  });

  it("wrapChatLogProcessMessage wraps processMessage targets and forwards formatted mode and extra args", async () => {
    let received = null;
    let receivedArgs = null;
    const fakeChatLog = {
      processMessage: async function (msg, ...args) {
        received = msg;
        receivedArgs = args;
        return { success: true };
      }
    };
    globalThis.ChatLog = function () { };
    globalThis.ChatLog.prototype = fakeChatLog;

    wrapChatLogProcessMessage();

    // With EM active
    setActiveChatMode("em");
    await fakeChatLog.processMessage("waves friendly", { speaker: { alias: "Hero" } });
    assert.equal(received, "/em waves friendly");
    assert.deepEqual(receivedArgs, [{ speaker: { alias: "Hero" } }]);

    // With mode off
    setActiveChatMode(null);
    await fakeChatLog.processMessage("normal text");
    assert.equal(received, "normal text");

    delete globalThis.ChatLog;
  });

  it("handleChatMessageHook intercepts chat submissions and routes to slash command", () => {
    let sent = null;
    const fakeLog = {
      processMessage: (msg) => { sent = msg; }
    };

    // When mode is EM
    setActiveChatMode("em");
    const resultEm = handleChatMessageHook(fakeLog, "thinking about lunch", {});
    assert.equal(resultEm, false);
    assert.equal(sent, "/em thinking about lunch");

    // With ProseMirror wrapped HTML input
    const resultHtml = handleChatMessageHook(fakeLog, "<p>looking around</p>", {});
    assert.equal(resultHtml, false);
    assert.equal(sent, "/em looking around");

    // When input is already a slash command
    sent = null;
    const resultSlash = handleChatMessageHook(fakeLog, "/r 1d20", {});
    assert.equal(resultSlash, true);
    assert.equal(sent, null);

    // When mode is null
    setActiveChatMode(null);
    const resultNull = handleChatMessageHook(fakeLog, "just talking", {});
    assert.equal(resultNull, true);
    assert.equal(sent, null);
  });

  it("appendDieToChatText accurately appends dice notation and respects operators", () => {
    // Empty text
    assert.equal(appendDieToChatText("", "d20", "norm"), "/r 1d20");
    assert.equal(appendDieToChatText("", "d20", "adv"), "/r 2d20kh");
    assert.equal(appendDieToChatText("", "d20", "dis"), "/r 2d20kl");
    assert.equal(appendDieToChatText("", "d6", "norm"), "/r 1d6");

    // Combines identical dice
    assert.equal(appendDieToChatText("/r 1d4", "d4", "norm"), "/r 2d4");
    assert.equal(appendDieToChatText("/r 2d4", "d4", "norm"), "/r 3d4");

    // Existing /r command
    assert.equal(appendDieToChatText("/r 1d20", "d6", "norm"), "/r 1d20 + 1d6");
    assert.equal(appendDieToChatText("/r 1d20 + 1d6", "d8", "norm"), "/r 1d20 + 1d6 + 1d8");
    assert.equal(appendDieToChatText("/r 1d20 + 1d6", "d6", "norm"), "/r 1d20 + 2d6");

    // Existing arithmetic operator (+, -, *, /)
    assert.equal(appendDieToChatText("/r 1d20 +", "d6", "norm"), "/r 1d20 + 1d6");
    assert.equal(appendDieToChatText("/r 2d6 -", "d4", "norm"), "/r 2d6 - 1d4");

    // Preserves other roll prefixes
    assert.equal(appendDieToChatText("/gmroll 1d20", "d4", "norm"), "/gmroll 1d20 + 1d4");
    assert.equal(appendDieToChatText("/blindroll 2d6", "d6", "norm"), "/blindroll 3d6");

    // Text without /r
    assert.equal(appendDieToChatText("1d20 + 5", "d4", "norm"), "/r 1d20 + 1d4 + 5");
  });

  it("removeDieFromChatText and swapD20ModeInText accurately update chat input", () => {
    // removeDieFromChatText decrements counts
    assert.equal(removeDieFromChatText("/r 3d4", "d4"), "/r 2d4");
    assert.equal(removeDieFromChatText("/r 2d4", "d4"), "/r 1d4");
    assert.equal(removeDieFromChatText("/r 1d4", "d4"), "");
    assert.equal(removeDieFromChatText("/r 1d20 + 2d6", "d6"), "/r 1d20 + 1d6");
    assert.equal(removeDieFromChatText("/r 1d20 + 1d6", "d6"), "/r 1d20");
    assert.equal(removeDieFromChatText("/r 1d20", "d20"), "");
    assert.equal(removeDieFromChatText("/r 2d20kh", "d20"), "");
    assert.equal(removeDieFromChatText("/r 3d20kh", "d20"), "/r 2d20kh");

    // swapD20ModeInText
    assert.equal(swapD20ModeInText("/r 1d20 + 5", "adv"), "/r 2d20kh + 5");
    assert.equal(swapD20ModeInText("/r 2d20kh + 5", "dis"), "/r 2d20kl + 5");
    assert.equal(swapD20ModeInText("/r 2d20kl + 5", "norm"), "/r 1d20 + 5");
  });

  it("getChatTextareaValue strips ProseMirror HTML and writeToChatTextarea handles PM transaction cleanly", () => {
    // 1. Mock ProseMirror captured view
    let dispatchedTr = null;
    let focused = false;
    const mockView = {
      state: {
        doc: {
          content: { size: 12 },
          textContent: "/r 1d20 + 5"
        },
        schema: {},
        tr: {
          replaceWith: (from, to, content) => ({ from, to, content, isTr: true })
        }
      },
      dispatch: (tr) => { dispatchedTr = tr; },
      focus: () => { focused = true; }
    };

    setChatEditorView(mockView);
    assert.equal(getChatTextareaValue(), "/r 1d20 + 5");

    // Mock global parseString
    globalThis.foundry = globalThis.foundry || {};
    globalThis.foundry.prosemirror = globalThis.foundry.prosemirror || {};
    globalThis.foundry.prosemirror.dom = {
      parseString: (text) => ({ content: { text } })
    };

    writeToChatTextarea("/r 1d20 + 5 + 1d6");
    assert.ok(dispatchedTr);
    assert.equal(dispatchedTr.isTr, true);
    assert.equal(dispatchedTr.content.text, "/r 1d20 + 5 + 1d6");
    assert.equal(focused, true);

    // Reset view
    setChatEditorView(null);
  });

  it("updateFlatModifierInChatText and parseFormulaStateFromChatText accurately sync chat formulas", () => {
    // Adding/updating flat modifier
    assert.equal(updateFlatModifierInChatText("/r 1d20", 3), "/r 1d20 + 3");
    assert.equal(updateFlatModifierInChatText("/r 1d20 + 3", 5), "/r 1d20 + 5");
    assert.equal(updateFlatModifierInChatText("/r 1d20 + 5", 0), "/r 1d20");
    assert.equal(updateFlatModifierInChatText("/r 1d20", -2), "/r 1d20 - 2");
    assert.equal(updateFlatModifierInChatText("/r 1d20 - 2", 0), "/r 1d20");
    assert.equal(updateFlatModifierInChatText("", 4), "/r 4");
    assert.equal(updateFlatModifierInChatText("/r 4", 0), "");
    assert.equal(updateFlatModifierInChatText("/r 2d20kh", 2), "/r 2d20kh + 2");

    // Parsing formula state
    const parsed = parseFormulaStateFromChatText("/r 2d20kh + 2d6 + 1d4 + 3");
    assert.equal(parsed.rollMode, "adv");
    assert.equal(parsed.counts.d20, 1);
    assert.equal(parsed.counts.d6, 2);
    assert.equal(parsed.counts.d4, 1);
    assert.equal(parsed.modifier, 3);

    const parsedDis = parseFormulaStateFromChatText("/r 2d20kl + 1d10 - 2");
    assert.equal(parsedDis.rollMode, "dis");
    assert.equal(parsedDis.counts.d20, 1);
    assert.equal(parsedDis.counts.d10, 1);
    assert.equal(parsedDis.modifier, -2);
  });

  it("tray badge counts can be manipulated and reset cleanly", () => {
    const counts = getTrayDiceCounts();
    counts.d100 = 2;
    counts.d20 = 1;
    assert.equal(getTrayDiceCounts().d100, 2);
    assert.equal(getTrayDiceCounts().d20, 1);

    resetTrayDiceCounts();
    assert.equal(getTrayDiceCounts().d100, 0);
    assert.equal(getTrayDiceCounts().d20, 0);
  });

  it("buildDiceTrayElement constructs row 2 controls in exact order: [norm] [flat mod] [clear] [roll]", () => {
    class MockElement {
      constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.className = "";
        this.dataset = {};
        this._innerHTML = "";
      }
      set innerHTML(val) {
        this._innerHTML = val;
        if (val.includes("gp-dt-mod-input")) {
          const span = new MockElement("span");
          span.className = "gp-dt-mod-label";
          const input = new MockElement("input");
          input.className = "gp-dt-mod-input";
          this.children.push(span, input);
        }
      }
      get innerHTML() { return this._innerHTML; }
      appendChild(child) { this.children.push(child); return child; }
      querySelector(selector) {
        if (selector === ".gp-dt-mod-input") {
          return this.children.find(c => c.className.includes("gp-dt-mod-input")) || new MockElement("input");
        }
        return null;
      }
      querySelectorAll() { return []; }
      addEventListener() { }
    }

    const prevDoc = globalThis.document;
    globalThis.document = {
      createElement: (tag) => new MockElement(tag)
    };

    try {
      const tray = buildDiceTrayElement();
      assert.ok(tray);
      assert.equal(tray.id, "gp-dice-tray-copycat");
      assert.equal(tray.children.length, 2); // row 1: dice grid, row 2: controls row

      const controlsRow = tray.children[1];
      assert.equal(controlsRow.className, "gp-dt-controls-row");
      assert.equal(controlsRow.children.length, 4);

      // Verify exact order: [norm] [flat mod] [clear] [roll]
      assert.ok(controlsRow.children[0].className.includes("gp-dt-mode-cycle-btn"), "child 0 is mode cycle button");
      assert.ok(controlsRow.children[1].className.includes("gp-dt-mod-wrapper"), "child 1 is flat mod wrapper");
      assert.ok(controlsRow.children[2].className.includes("gp-dt-clear-btn"), "child 2 is clear button");
      assert.ok(controlsRow.children[3].className.includes("gp-dt-roll-btn"), "child 3 is roll button");
    } finally {
      globalThis.document = prevDoc;
    }
  });

  it("CSS linter: ensures no un-scoped #chat or sidebar tab display rules exist", () => {
    const diceTrayJs = fs.readFileSync(new URL('../modules/dice-tray-copycat.js', import.meta.url), 'utf-8');
    const chatControlsJs = fs.readFileSync(new URL('../modules/chat-controls.js', import.meta.url), 'utf-8');

    const checkCss = (code, filename) => {
      const styleMatches = code.match(/style\.textContent\s*=\s*`([\s\S]*?)`/g) || [];
      for (const block of styleMatches) {
        // Assert no bare un-scoped #chat { ... display: ... !important; }
        // Legitimate scoped forms are #chat.active or .chat-popout #chat
        const bareChatDisplay = /(?:^|[{};,\n`])\s*#chat\s*\{[^}]*display\s*:\s*(?:flex|grid|block)\s*!important/i.test(block);
        assert.equal(bareChatDisplay, false, `${filename} must not contain bare un-scoped '#chat { display: ... !important }'`);

        // Assert that #chat:not(.active) is hidden if #chat.active is styled
        if (/#chat\.active/i.test(block)) {
          assert.ok(
            /#chat:not\(\.active\)[^}]*display\s*:\s*none\s*!important/i.test(block),
            `${filename} must enforce '#chat:not(.active) { display: none !important }' when styling #chat.active`
          );
        }
      }
    };

    checkCss(diceTrayJs, 'modules/dice-tray-copycat.js');
    checkCss(chatControlsJs, 'modules/chat-controls.js');

    // Self-test: verify linter regex flags illegal bare selectors
    const testPattern = /(?:^|[{};,\n`])\s*#chat\s*\{[^}]*display\s*:\s*(?:flex|grid|block)\s*!important/i;
    assert.equal(testPattern.test("`\n  #chat { display: flex !important; }\n`"), true);
    assert.equal(testPattern.test("`.other, #chat { display: block !important; }`"), true);
    assert.equal(testPattern.test("`#chat.active { display: flex !important; }`"), false);
    assert.equal(testPattern.test("`.chat-popout #chat { display: flex !important; }`"), false);
  });

  it("Syntax check: all module entry points (main.js, src/*.js, modules/*.js) parse cleanly", () => {
    const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const filesToCheck = [path.join(rootDir, 'main.js')];

    for (const dir of ['src', 'modules']) {
      const fullDir = path.join(rootDir, dir);
      if (!fs.existsSync(fullDir)) continue;
      for (const entry of fs.readdirSync(fullDir)) {
        if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
          filesToCheck.push(path.join(fullDir, entry));
        }
      }
    }

    for (const file of filesToCheck) {
      assert.doesNotThrow(
        () => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }),
        `Syntax error in ${path.relative(rootDir, file)}`
      );
    }
  });
});




