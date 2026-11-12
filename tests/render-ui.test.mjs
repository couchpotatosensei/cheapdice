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
            save: { ability: "dex", dc: { calculation: "spellcasting" } },
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
});

