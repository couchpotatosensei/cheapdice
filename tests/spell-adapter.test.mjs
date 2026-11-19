import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  unwrapFirst,
  unwrapArray,
  unwrapCollection,
  hasProp,
  isSpellPrepared,
  normalizeDamagePart,
  normalizeActivity,
  normalizeSpell,
  clearSpellIndexCache,
  getOrderedSpellPacks,
  getSpellCompendiumIndex,
  resolveSpell,
  resolveNormalizedSpell,
  getAvailableSpellSlots,
  computeUpcastFormula,
  computeSlotConsumptionUpdate,
  castSpellHybrid,
  setSpellQuirks,
  getSpellQuirk,
  buildQuirkJsonSnippet
} from "../modules/spell-adapter.js";

describe("Spell Adapter (Phase 1 Normalization Boundary)", () => {
  it("unwrapFirst and unwrapArray handle Set, Array, Collection-like, and primitives", () => {
    assert.equal(unwrapFirst(new Set(["dex", "con"])), "dex");
    assert.equal(unwrapFirst(["wis"]), "wis");
    assert.equal(unwrapFirst({ first: () => "cha" }), "cha");
    assert.equal(unwrapFirst(null, "int"), "int");

    assert.deepEqual(unwrapArray(new Set(["fire", "radiant"])), ["fire", "radiant"]);
    assert.deepEqual(unwrapArray("cold"), ["cold"]);
    assert.deepEqual(unwrapArray(undefined), []);

    assert.deepEqual(unwrapCollection(new Map([["a", 1], ["b", 2]])), [1, 2]);
    assert.deepEqual(unwrapCollection({ a: 10, b: 20 }), [10, 20]);
    assert.equal(hasProp(new Set(["concentration", "vocal"]), "concentration"), true);
    assert.equal(hasProp({ vocal: true }, "vocal"), true);
    assert.equal(hasProp({ vocal: false }, "vocal"), false);
  });

  it("normalizeSpell unwraps modern dnd5e Set-based Save Activity", () => {
    const fireball = {
      id: "sp1",
      name: "Fireball",
      type: "spell",
      system: {
        level: 3,
        school: new Set(["evo"]),
        properties: new Set(["vocal", "somatic", "material"]),
        activation: { cost: 1, type: "action" },
        range: { value: 150, units: "ft" },
        target: { type: "sphere", value: 20, units: "ft" },
        description: { value: "<p>A bright streak flashes from your pointing finger.</p>" },
        prepared: true,
        activities: new Map([
          ["act1", {
            id: "act1",
            name: "Cast",
            type: "save",
            save: {
              ability: new Set(["dex"]),
              scaling: "half",
              dc: { calculation: "spellcasting" }
            },
            damage: {
              parts: [
                {
                  number: 8,
                  denomination: 6,
                  types: new Set(["fire"]),
                  scaling: { mode: new Set(["whole"]), number: 1 }
                }
              ]
            }
          }]
        ])
      }
    };

    const norm = normalizeSpell(fireball, { system: { attributes: { spellcasting: "int" } } });
    assert.equal(norm.name, "Fireball");
    assert.equal(norm.level, 3);
    assert.equal(norm.school, "evo");
    assert.equal(norm.components.vocal, true);
    assert.equal(norm.components.concentration, false);
    assert.equal(norm.target.type, "area");
    assert.equal(norm.target.shape, "sphere");
    assert.equal(norm.primaryAction.kind, "save");
    assert.equal(norm.primaryAction.saveAbility, "dex");
    assert.equal(norm.primaryAction.saveSuccess, "half");
    assert.equal(norm.primaryAction.parts[0].count, 8);
    assert.equal(norm.primaryAction.parts[0].die, "d6");
    assert.deepEqual(norm.primaryAction.parts[0].types, ["fire"]);
    assert.equal(norm.primaryAction.parts[0].scalingMode, "whole");
  });

  it("normalizeSpell handles multi-activity spells and Heal/TempHP activities", () => {
    const iceKnife = {
      id: "sp2",
      name: "Ice Knife",
      type: "spell",
      system: {
        level: 1,
        activities: new Map([
          ["atk", {
            id: "atk",
            name: "Throw",
            type: "attack",
            attack: { type: { value: "ranged" }, ability: "" },
            damage: { parts: [{ number: 1, denomination: 10, types: new Set(["piercing"]) }] }
          }],
          ["sav", {
            id: "sav",
            name: "Explode",
            type: "save",
            save: { ability: new Set(["dex"]), scaling: "none" },
            damage: { parts: [{ number: 2, denomination: 6, types: new Set(["cold"]) }] }
          }]
        ])
      }
    };

    const norm = normalizeSpell(iceKnife);
    assert.equal(norm.actions.length, 2);
    assert.equal(norm.actions[0].kind, "attack");
    assert.deepEqual(norm.actions[0].parts[0].types, ["piercing"]);
    assert.equal(norm.actions[1].kind, "save");
    assert.equal(norm.actions[1].saveSuccess, "none");
    assert.deepEqual(norm.actions[1].parts[0].types, ["cold"]);

    const falseLife = {
      id: "sp3",
      name: "False Life",
      type: "spell",
      system: {
        level: 1,
        activities: new Map([
          ["heal1", {
            id: "heal1",
            type: "heal",
            healing: { number: 1, denomination: 4, bonus: "4", types: new Set(["temphp"]) }
          }]
        ])
      }
    };
    const normHeal = normalizeSpell(falseLife);
    assert.equal(normHeal.primaryAction.kind, "roll");
    assert.equal(normHeal.primaryAction.subtype, "temphp");
    assert.equal(normHeal.primaryAction.parts[0].flatBonus, 4);
  });

  it("normalizeSpell handles legacy dnd5e 3.x spells and gates flat DC", () => {
    const legacyFireBolt = {
      id: "sp4",
      name: "Fire Bolt",
      type: "spell",
      system: {
        level: 0,
        actionType: "rsak",
        components: { vocal: true, somatic: true },
        damage: { parts: [["1d10", "fire"]] }
      }
    };
    const norm = normalizeSpell(legacyFireBolt);
    assert.equal(norm.preparation.isPrepared, true);
    assert.equal(norm.primaryAction.kind, "attack");
    assert.equal(norm.primaryAction.parts[0].count, 1);
    assert.equal(norm.primaryAction.parts[0].die, "d10");

    const innateSave = {
      id: "sp5",
      name: "Innate Charm",
      type: "spell",
      system: {
        level: 1,
        preparation: { mode: "innate" },
        activities: [{
          id: "s1",
          type: "save",
          save: { ability: new Set(["wis"]), dc: { calculation: "flat", formula: "15" } }
        }]
      }
    };
    const normInnate = normalizeSpell(innateSave);
    assert.equal(normInnate.allowFlatDC, true);
    assert.equal(normInnate.primaryAction.dc, 15);
  });

  it("isSpellPrepared handles wizard rituals and non-spell items", () => {
    const ritualSpell = {
      type: "spell",
      system: { level: 1, prepared: false, properties: new Set(["ritual"]) }
    };
    assert.equal(isSpellPrepared(ritualSpell, { classes: { wizard: {} } }), true);
    assert.equal(isSpellPrepared(ritualSpell, { classes: {} }), false);
    assert.equal(isSpellPrepared({ type: "weapon" }, {}), false);
  });
});

describe("Spell Adapter (Phase 2 Dynamic Lookup)", () => {
  it("getOrderedSpellPacks filters to Item packs and prioritizes world & spell packs", () => {
    const packs = [
      { collection: "dnd5e.monsters", documentName: "Actor", metadata: { type: "Actor", packageType: "system" } },
      { collection: "dnd5e.items", documentName: "Item", metadata: { type: "Item", packageType: "system", label: "Items" } },
      { collection: "dnd5e.spells24", documentName: "Item", metadata: { type: "Item", packageType: "system", label: "Spells (2024)" } },
      { collection: "world.homebrew", documentName: "Item", metadata: { type: "Item", packageType: "world", label: "Homebrew" } }
    ];
    const ordered = getOrderedSpellPacks(packs);
    assert.deepEqual(ordered.map(p => p.collection), ["world.homebrew", "dnd5e.spells24", "dnd5e.items"]);
  });

  it("resolveSpell checks Actor -> World -> Compendium and caches pack index", async () => {
    clearSpellIndexCache();
    let getIndexCalls = 0;

    const actorSpell = { id: "a1", name: "Magic Missile", type: "spell", system: { level: 1 } };
    const worldSpell = { id: "w1", name: "Shield", type: "spell", system: { level: 1 } };
    const compSpell = {
      id: "c1",
      name: "Misty Step",
      type: "spell",
      system: { level: 2, properties: new Set(["vocal"]) }
    };

    const packs = [
      {
        collection: "custom.spells",
        documentName: "Item",
        metadata: { type: "Item", packageType: "module", label: "Custom Spells" },
        async getIndex() {
          getIndexCalls += 1;
          return [
            { _id: "c1", name: "Misty Step", type: "spell", system: { level: 2 } },
            { _id: "c2", name: "Longsword", type: "weapon" }
          ];
        },
        async getDocument(id) {
          return id === "c1" ? compSpell : null;
        }
      }
    ];

    const actor = { items: [actorSpell] };
    const worldItems = [worldSpell];

    // 1. Actor match
    const res1 = await resolveSpell("magic missile", { actor, worldItems, packs });
    assert.equal(res1.source, "actor");
    assert.equal(res1.item.id, "a1");
    assert.equal(getIndexCalls, 0);

    // 2. World match
    const res2 = await resolveSpell("Shield", { actor, worldItems, packs });
    assert.equal(res2.source, "world");
    assert.equal(res2.item.id, "w1");
    assert.equal(getIndexCalls, 0);

    // 3. Compendium match + index caching
    const res3 = await resolveNormalizedSpell("Misty Step", { actor, worldItems, packs });
    assert.equal(res3._source, "compendium");
    assert.equal(res3._packId, "custom.spells");
    assert.equal(res3.components.vocal, true);
    assert.equal(getIndexCalls, 1);

    // 4. Second compendium lookup hits cache (no extra getIndex call)
    await getSpellCompendiumIndex({ packs });
    assert.equal(getIndexCalls, 1);
  });
});

describe("Spell Adapter (Phase 3 Hybrid Execution & Upcasting)", () => {
  it("getAvailableSpellSlots and computeSlotConsumptionUpdate handle standard and pact slots", () => {
    const actor = {
      system: {
        spells: {
          spell1: { value: 2, max: 4 },
          spell2: { value: 0, max: 3 },
          spell3: { value: 1, max: 2 },
          pact: { value: 2, max: 2, level: 3 }
        }
      }
    };

    const slots = getAvailableSpellSlots(actor, 2);
    assert.equal(slots.length, 2);
    assert.equal(slots[0].level, 3);

    assert.deepEqual(computeSlotConsumptionUpdate(actor, 3), { "system.spells.spell3.value": 0 });
    assert.deepEqual(computeSlotConsumptionUpdate(actor, 3, { preferPact: true }), { "system.spells.pact.value": 1 });
    assert.equal(computeSlotConsumptionUpdate(actor, 0), null);
  });

  it("computeUpcastFormula scales cantrips by actor level and leveled spells by slot level", () => {
    const cantripPart = { count: 1, die: "d10", formula: "1d10", scalingMode: "whole", scalingNumber: 1, addMod: false, flatBonus: 0 };
    assert.equal(computeUpcastFormula(cantripPart, 0, 0, 4).formula, "1d10");
    assert.equal(computeUpcastFormula(cantripPart, 0, 0, 5).formula, "2d10");
    assert.equal(computeUpcastFormula(cantripPart, 0, 0, 17).formula, "4d10");

    const fireballPart = { count: 8, die: "d6", formula: "8d6", scalingMode: "whole", scalingNumber: 1, addMod: false, flatBonus: 0 };
    assert.equal(computeUpcastFormula(fireballPart, 3, 5, 9).formula, "10d6");
    assert.equal(computeUpcastFormula(fireballPart, 3, 3, 9).formula, "8d6");
  });

  it("castSpellHybrid supports both custom upcast/slot deduction and native delegate mode", async () => {
    let updatedPayload = null;
    let delegatedArgs = null;

    const actor = {
      system: {
        details: { level: 9 },
        spells: { spell3: { value: 2, max: 2 }, spell4: { value: 1, max: 1 } }
      },
      async update(payload) {
        updatedPayload = payload;
      }
    };

    const fireball = {
      id: "fb1",
      name: "Fireball",
      type: "spell",
      system: {
        level: 3,
        activities: new Map([
          ["act1", {
            id: "act1",
            type: "save",
            save: { ability: new Set(["dex"]), scaling: "half" },
            damage: { parts: [{ number: 8, denomination: 6, types: new Set(["fire"]), scaling: { mode: "whole", number: 1 } }] },
            async use(cfg) {
              delegatedArgs = cfg;
              return { ok: true };
            }
          }]
        ])
      }
    };

    const customRes = await castSpellHybrid(fireball, { actor, castLevel: 4, mode: "custom", consumeSlot: true });
    assert.equal(customRes.delegated, false);
    assert.equal(customRes.scaledParts[0].formula, "9d6");
    assert.deepEqual(updatedPayload, { "system.spells.spell4.value": 0 });

    const delRes = await castSpellHybrid(fireball, { actor, castLevel: 4, mode: "delegate" });
    assert.equal(delRes.delegated, true);
    assert.deepEqual(delegatedArgs, { spell: { slot: 4 } });
  });
});

describe("Spell Adapter (Quirks JSON & Export)", () => {
  it("loads data/spell-quirks.json, matches aliases, and exports clean JSON snippets", () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const quirksPath = path.resolve(__dirname, "../data/spell-quirks.json");
    const quirksData = JSON.parse(fs.readFileSync(quirksPath, "utf8"));
    setSpellQuirks(quirksData);

    const sr = getSpellQuirk("Scorching Ray");
    assert.equal(sr.isMultiAttack, true);
    assert.equal(sr.attackCount, 3);
    assert.equal(sr.upcastMode, "extra_projectiles");
    assert.equal(sr.projectileLabel, "Ray");
    assert.equal(sr.ddbDicePerUnit, 2);

    const srAlias = getSpellQuirk("Scorching Ray (2024)");
    assert.equal(srAlias.projectileLabel, "Ray");

    const snippet = JSON.parse(buildQuirkJsonSnippet("Scorching Ray", {
      itemId: "actor-specific-id",
      isMultiAttack: true,
      attackCount: 3,
      upcastMode: "extra_projectiles",
      projectileLabel: "Ray"
    }));
    assert.equal(snippet["scorching ray"].itemId, undefined);
    assert.equal(snippet["scorching ray"].projectileLabel, "Ray");
  });
});



