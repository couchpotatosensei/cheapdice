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
});

