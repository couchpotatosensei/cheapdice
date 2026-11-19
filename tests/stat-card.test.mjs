import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractStatCardData,
  renderStatCardHtml,
  formatTrait,
  unwrapValue
} from "../modules/stat-card.js";

describe("Stat Card Module", () => {
  it("unwrapValue and formatTrait handle dnd5e Set, Array, and custom fields", () => {
    assert.equal(unwrapValue(new Set(["fire", "cold"])), "fire");
    assert.equal(unwrapValue(["slashing"]), "slashing");
    assert.equal(unwrapValue(undefined, "piercing"), "piercing");

    assert.equal(
      formatTrait({ value: new Set(["fire", "poison"]), custom: "silvered" }),
      "fire, poison, silvered"
    );
    assert.equal(formatTrait({ value: ["common", "draconic"] }), "common, draconic");
  });

  it("extractStatCardData handles modern dnd5e activities with Set types, multi-part damage, and >5 attacks", async () => {
    const biteActivity = {
      type: "attack",
      ability: "str",
      attack: { bonus: "2" },
      damage: {
        parts: [
          { number: 1, denomination: 10, types: new Set(["piercing"]), bonus: "@mod" },
          { number: 2, denomination: 6, types: new Set(["poison"]), bonus: "0" }
        ]
      }
    };

    const makeWeapon = (id, name) => ({
      id,
      name,
      type: "weapon",
      system: {
        actionType: "mwak",
        properties: new Set(["fin"]),
        activities: new Map([["act1", biteActivity]])
      }
    });

    const items = [
      makeWeapon("w1", "Venom Bite <Alpha>"),
      makeWeapon("w2", "Claw"),
      makeWeapon("w3", "Tail"),
      makeWeapon("w4", "Wing"),
      makeWeapon("w5", "Horn"),
      makeWeapon("w6", "Stinger")
    ];

    const actor = {
      uuid: "Actor.abc123",
      name: "Hydra <Boss>",
      items,
      prototypeToken: { disposition: -1 },
      system: {
        attributes: {
          prof: 3,
          ac: { value: 16 },
          hp: { value: 85, max: 100, temp: 5, tempmax: 0 },
          init: { total: 4 },
          movement: { walk: 30, swim: 30 },
          spellcasting: "cha",
          senses: { darkvision: 60 }
        },
        details: { cr: 5, type: { value: "monstrosity" } },
        abilities: {
          str: { value: 18, mod: 4, proficient: 1 },
          dex: { value: 14, mod: 2 },
          con: { value: 16, mod: 3, proficient: 1 },
          int: { value: 6, mod: -2 },
          wis: { value: 12, mod: 1 },
          cha: { value: 14, mod: 2 }
        },
        traits: {
          size: "lg",
          dr: { value: new Set(["cold"]) },
          languages: { value: new Set(["draconic"]) }
        }
      }
    };

    const token = {
      id: "tok1",
      name: "Hydra <Boss>",
      document: { uuid: "Scene.s1.Token.tok1", disposition: -1 },
      actor
    };

    const data = await extractStatCardData(actor, token);

    assert.equal(data.initMod, 4);
    assert.equal(data.spellcasting.ability, "CHA");
    assert.equal(data.spellcasting.attackBonus, 5);
    assert.equal(data.spellcasting.dc, 13);
    assert.equal(data.attacks.length, 6);
    assert.equal(data.attacks[0].atkMod, 9); // 4 (str) + 3 (pb) + 2 (bonus)
    assert.equal(data.attacks[0].damageParts.length, 2);
    assert.equal(data.attacks[0].damageParts[0].type, "piercing");
    assert.equal(data.attacks[0].damageParts[1].type, "poison");
    assert.equal(data.attacks[0].dmgSummary, "1d10+4 + 2d6");

    const html = renderStatCardHtml(data);
    assert.match(html, /\[\[\/r 1d20 \+ 4\[Initiative\]\]\]\{\+4\}/);
    assert.match(html, /\[\[\/r 1d20 \+ 5\[Spell Attack\]\]\]\{\+5\}/);
    assert.match(html, /More Attacks \(\+1\)/);
    assert.match(html, /data-token-uuid="Scene\.s1\.Token\.tok1"/);
    assert.match(html, /data-actor-uuid="Actor\.abc123"/);
    assert.match(html, /Hydra &lt;Boss&gt;/);
    assert.match(html, /Venom Bite &lt;Alpha&gt;/);
  });

  it("extractStatCardData and renderStatCardHtml handle save-based abilities (Set) and collapsible traits/features", async () => {
    const breathItem = {
      id: "s1",
      name: "Fire Breath",
      type: "feat",
      system: {
        activities: new Map([
          ["saveAct", {
            type: "save",
            save: { ability: new Set(["dex"]), dc: { value: 15 } },
            damage: {
              parts: [
                { number: 8, denomination: 6, types: new Set(["fire"]), bonus: "0" }
              ]
            }
          }]
        ])
      }
    };

    const traitItem = {
      id: "f1",
      name: "Magic Resistance",
      type: "feat",
      system: {
        description: { value: "<p>Advantage on saves against spells.</p>" }
      }
    };

    const actor = {
      uuid: "Actor.dragon1",
      name: "Young Red Dragon",
      items: [breathItem, traitItem],
      prototypeToken: { disposition: -1 },
      system: {
        attributes: { prof: 4, ac: { value: 18 }, hp: { value: 178, max: 178 } },
        details: { cr: 10, type: { value: "dragon" } },
        abilities: {
          str: { value: 23, mod: 6 },
          dex: { value: 10, mod: 0 },
          con: { value: 21, mod: 5 },
          int: { value: 14, mod: 2 },
          wis: { value: 11, mod: 0 },
          cha: { value: 19, mod: 4 }
        }
      }
    };

    const token = {
      id: "tok2",
      name: "Young Red Dragon",
      document: { uuid: "Scene.s1.Token.tok2", disposition: -1 },
      actor
    };

    const data = await extractStatCardData(actor, token);
    assert.equal(data.saveAbilities.length, 1);
    assert.equal(data.saveAbilities[0].saveAbility, "DEX");
    assert.equal(data.saveAbilities[0].dc, 15);
    assert.equal(data.saveAbilities[0].dmgSummary, "8d6");
    assert.equal(data.features.length, 1);
    assert.equal(data.features[0].name, "Magic Resistance");

    const html = renderStatCardHtml(data);
    assert.match(html, /Save Abilities:/);
    assert.match(html, /DC 15 DEX &bull; 8d6/);
    assert.match(html, /class="gwa-save-btn cd-sc-attack-btn"/);
    assert.match(html, /Traits &amp; Features \(1\)/);
    assert.match(html, /Magic Resistance/);
  });
});
