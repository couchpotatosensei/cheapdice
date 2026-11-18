import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SETTINGS, FLAGS, MODULE_ID } from "../src/constants.js";
import {
  parseDdbGameLogEvent,
  matchDdbActor,
  buildDdbCustomChatCardHtml,
  postDdbRollToFoundry,
  getItemDamageFormula,
  resolveItemAbility,
  parseMaxDamageFromFormula,
  resolveSpellSaveInfo,
  buildDdbSpellSaveCardHtml,
  normalizeDdbRollType,
  resolveDdbCastLevel,
  promptDdbAttackCastLevel,
  extractDdbCharacterId,
  getActorDdbCharacterUrl,
  computeDdbSpellSlotUpdates,
  computeDdbHpUpdates,
  DdbGameLogClient
} from "../modules/ddb-listener.js";

describe("D&D Beyond Game Log Listener", () => {
  it("parseDdbGameLogEvent parses advantage attack rolls and marks dropped dice", () => {
    const raw = {
      id: "evt-100",
      eventType: "dice/roll/fulfilled",
      entityId: "998877",
      context: { name: "Aragorn" },
      data: {
        action: "Longsword",
        rolls: [
          {
            rollType: "to hit",
            rollKind: "advantage",
            diceNotation: {
              set: [
                {
                  count: 2,
                  dieType: "d20",
                  dice: [
                    { dieType: "d20", dieValue: 11 },
                    { dieType: "d20", dieValue: 18 }
                  ]
                }
              ],
              constant: 7
            },
            result: {
              constant: 7,
              values: [18],
              total: 25,
              text: "18 + 7"
            }
          }
        ]
      }
    };

    const parsed = parseDdbGameLogEvent(raw);
    assert.equal(parsed.length, 1);
    const r = parsed[0];
    assert.equal(r.characterName, "Aragorn");
    assert.equal(r.ddbCharacterId, "998877");
    assert.equal(r.actionName, "Longsword");
    assert.equal(r.rollType, "attack");
    assert.equal(r.rollMode, "advantage");
    assert.equal(r.keptD20, 18);
    assert.equal(r.total, 25);
    assert.equal(r.isCrit, false);
    assert.equal(r.dice[0].dropped, true);
    assert.equal(r.dice[1].dropped, false);
  });

  it("parseDdbGameLogEvent detects critical hits and fumbles on attack rolls", () => {
    const critRaw = {
      id: "evt-crit",
      eventType: "dice/roll/fulfilled",
      context: { name: "Gimli" },
      data: {
        action: "Greataxe",
        rolls: [
          {
            rollType: "attack",
            rollKind: "normal",
            diceNotation: {
              set: [{ count: 1, dieType: "d20", dice: [{ dieType: "d20", dieValue: 20 }] }],
              constant: 6
            },
            result: { constant: 6, values: [20], total: 26, text: "20 + 6" }
          }
        ]
      }
    };
    const critParsed = parseDdbGameLogEvent(critRaw);
    assert.equal(critParsed[0].isCrit, true);
    assert.equal(critParsed[0].isFumble, false);

    const fumbleRaw = structuredClone(critRaw);
    fumbleRaw.id = "evt-fumble";
    fumbleRaw.data.rolls[0].diceNotation.set[0].dice[0].dieValue = 1;
    fumbleRaw.data.rolls[0].result = { constant: 6, values: [1], total: 7, text: "1 + 6" };
    const fumbleParsed = parseDdbGameLogEvent(fumbleRaw);
    assert.equal(fumbleParsed[0].isCrit, false);
    assert.equal(fumbleParsed[0].isFumble, true);
  });

  it("parseDdbGameLogEvent ignores non-roll events and malformed JSON", () => {
    assert.deepEqual(parseDdbGameLogEvent("not-json"), []);
    assert.deepEqual(parseDdbGameLogEvent({ eventType: "game/ping", data: {} }), []);
  });

  it("matchDdbActor matches by DDB character ID flag first, then case-insensitive name", () => {
    const actors = [
      { id: "a1", name: "Aragorn", flags: { ddbimporter: { dndbeyond: { characterId: "998877" } } } },
      { id: "a2", name: "Legolas", flags: {} }
    ];

    assert.equal(matchDdbActor("Wrong Name", "998877", actors)?.id, "a1");
    assert.equal(matchDdbActor("legolas", "", actors)?.id, "a2");
    assert.equal(matchDdbActor("Unknown", "000", actors), null);
  });

  it("buildDdbCustomChatCardHtml renders custom card, audit block, crit damage button, and escapes HTML", () => {
    const parsed = {
      characterName: "<script>alert(1)</script>",
      actionName: "Firebolt",
      rollType: "attack",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 20, dropped: false }],
      keptD20: 20,
      d20Values: [20],
      isCrit: true,
      isFumble: false,
      modifier: 8,
      total: 28,
      formula: "1d20 + 8",
      resultText: "20 + 8"
    };

    const actor = { id: "actor-1", name: "Gandalf" };
    const matchingItem = { id: "item-1", name: "Firebolt" };
    const html = buildDdbCustomChatCardHtml(parsed, actor, { matchingItem });

    assert.ok(html.includes("Firebolt"));
    assert.ok(html.includes("Gandalf"));
    assert.ok(html.includes("Critical Hit!"));
    assert.ok(html.includes("Attack/Damage Breakdown"));
    assert.ok(html.includes("cheapdice-ddb-roll-damage"));
    assert.ok(html.includes("Roll Crit Damage"));
    assert.equal(html.includes("<script>"), false);
  });

  it("buildDdbCustomChatCardHtml renders dual-column dice boxes for advantage", () => {
    const parsedAdv = {
      characterName: "Legolas",
      actionName: "Longbow",
      rollType: "attack",
      rollMode: "advantage",
      dice: [
        { dieType: "d20", dieValue: 9, dropped: true },
        { dieType: "d20", dieValue: 19, dropped: false }
      ],
      keptD20: 19,
      d20Values: [9, 19],
      isCrit: false,
      isFumble: false,
      modifier: 7,
      total: 26,
      formula: "2d20kh1 + 7",
      resultText: "19 + 7"
    };

    const html = buildDdbCustomChatCardHtml(parsedAdv, { name: "Legolas" });
    assert.ok(html.includes("Attack Roll"));
    assert.ok(html.includes("+/- Adv."));
    assert.ok(html.includes("26"));
  });

  it("buildDdbCustomChatCardHtml renders clean Modifier Breakdown for skill checks without damage", () => {
    const parsedSkill = {
      characterName: "Rogue",
      actionName: "Stealth",
      rollType: "skill",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 15, dropped: false }],
      keptD20: 15,
      d20Values: [15],
      isCrit: false,
      isFumble: false,
      modifier: 9,
      total: 24,
      formula: "1d20 + 9",
      resultText: "15 + 9"
    };

    const html = buildDdbCustomChatCardHtml(parsedSkill, { name: "Rogue" });
    assert.ok(html.includes("Skill Check"));
    assert.ok(html.includes("Modifier Breakdown"));
    assert.ok(html.includes("NORMAL ROLL"));
    assert.ok(html.includes("+/- ADV."));
    assert.equal(html.includes("Attack/Damage Breakdown"), false);
    assert.equal(html.includes("Damage Total"), false);
    assert.equal(html.includes("Attack:"), false);
  });

  it("buildDdbCustomChatCardHtml renders single damage box for damage-only rolls without d20 boxes", () => {
    const parsedDamage = {
      characterName: "Fighter",
      actionName: "Greatsword Damage",
      rollType: "damage",
      rollMode: "normal",
      dice: [
        { dieType: "d6", dieValue: 4, dropped: false },
        { dieType: "d6", dieValue: 5, dropped: false }
      ],
      modifier: 4,
      total: 13,
      formula: "2d6 + 4",
      resultText: "4 + 5 + 4"
    };

    const html = buildDdbCustomChatCardHtml(parsedDamage, { name: "Fighter" });
    assert.ok(html.includes("Greatsword Damage"));
    assert.ok(html.includes("Damage"));
    assert.ok(html.includes("Damage Total:"));
    assert.ok(html.includes("13"));
    assert.ok(html.includes("Damage Breakdown"));
    assert.equal(html.includes("NORMAL ROLL"), false);
    assert.equal(html.includes("+/- ADV."), false);
    assert.equal(html.includes("Attack Roll"), false);
  });

  it("buildDdbCustomChatCardHtml renders single roll card for manual dice tray rolls", () => {
    const parsedTray = {
      characterName: "Player",
      actionName: "Roll",
      rollType: "other",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 17, dropped: false }],
      modifier: 0,
      total: 17,
      formula: "1d20",
      resultText: "17"
    };

    const html = buildDdbCustomChatCardHtml(parsedTray, { name: "Player" });
    assert.ok(html.includes("Roll"));
    assert.ok(html.includes("Dice Roll"));
    assert.ok(html.includes("Total:"));
    assert.ok(html.includes("17"));
    assert.equal(html.includes("NORMAL ROLL"), false);
    assert.equal(html.includes("+/- ADV."), false);
    assert.equal(html.includes("Attack Roll"), false);
  });

  it("DdbGameLogClient deduplicates repeated message IDs and builds valid socket URLs", () => {
    const received = [];
    const client = new DdbGameLogClient({
      onRoll: (roll) => received.push(roll)
    });

    const url = client.buildSocketUrl({
      campaignId: "1234567",
      userId: "555",
      token: "jwt-abc"
    });
    assert.equal(url, "wss://game-log-api-live.dndbeyond.com/v1?gameId=1234567&stt=jwt-abc&userId=555");
    assert.equal(client.buildSocketUrl({ campaignId: "", token: "jwt" }), null);

    const payload = {
      id: "dup-1",
      eventType: "dice/roll/fulfilled",
      context: { name: "Aragorn" },
      data: {
        action: "Stealth",
        rolls: [{
          rollType: "check",
          rollKind: "normal",
          diceNotation: { set: [{ count: 1, dieType: "d20", dice: [{ dieType: "d20", dieValue: 15 }] }], constant: 5 },
          result: { constant: 5, values: [15], total: 20, text: "15 + 5" }
        }]
      }
    };

    client.handleRawMessage(payload);
    client.handleRawMessage(payload);
    assert.equal(received.length, 1);
    assert.equal(received[0].total, 20);
  });

  it("DdbGameLogClient.resolveToken handles JWTs directly and handles non-JWT fallback", async () => {
    const client = new DdbGameLogClient();
    const jwt = "eyJhbGci.eyJzdWIi.signature";
    const resolvedJwt = await client.resolveToken(jwt);
    assert.equal(resolvedJwt, jwt);

    const rawCobalt = "cobalt-cookie-session-value-12345";
    const resolvedCobalt = await client.resolveToken(rawCobalt);
    assert.equal(resolvedCobalt, rawCobalt);
  });

  it("postDdbRollToFoundry sets exact 3D dice faces for advantage and disadvantage d20 rolls", async () => {
    class MockDie {
      constructor(faces, count = 1) {
        this.faces = faces;
        this.results = Array.from({ length: count }, () => ({ result: 1, active: true }));
      }
      get total() {
        return this.results.reduce((acc, r) => acc + (r.active !== false ? r.result : 0), 0);
      }
    }
    class MockRoll {
      constructor(formula) {
        this.formula = formula;
        this.terms = [];
        this._total = 0;
        const parts = formula.split(/\s*[\+\-]\s*/);
        for (const p of parts) {
          const m = p.trim().match(/^(\d+)d(\d+)$/i);
          if (m) {
            this.terms.push(new MockDie(Number(m[2]), Number(m[1])));
          }
        }
      }
      async evaluate() {
        return this;
      }
      async render() {
        return `<div class="dice-roll"><h4 class="dice-total">${this._total}</h4></div>`;
      }
    }

    let createdMessages = [];
    globalThis.Roll = MockRoll;
    globalThis.Die = MockDie;
    globalThis.ChatMessage = {
      create: async (data) => {
        createdMessages.push(data);
        return data;
      },
      getSpeaker: () => ({ alias: "Test" })
    };
    globalThis.game = {
      user: { id: "gm-user" },
      actors: []
    };
    globalThis.CONFIG = { sounds: { dice: "dice.wav" } };

    // 1. Advantage Attack Roll (rolled 11 and 18, kept 18, mod +7)
    const parsedAdv = {
      characterName: "Ranger",
      actionName: "Longbow",
      rollType: "attack",
      rollMode: "advantage",
      dice: [
        { dieType: "d20", dieValue: 11, dropped: true },
        { dieType: "d20", dieValue: 18, dropped: false }
      ],
      d20Values: [11, 18],
      keptD20: 18,
      modifier: 7,
      total: 25,
      formula: "2d20kh1 + 7"
    };

    await postDdbRollToFoundry(parsedAdv);
    assert.equal(createdMessages.length, 1);
    const msg1 = createdMessages[0];
    assert.equal(msg1.rolls.length, 2, "Advantage roll must produce exactly 2 rolls (primary + companion)");
    assert.equal(msg1.rolls[0].terms[0].results[0].result, 18, "Primary 3D die face must match kept DDB roll (18)");
    assert.equal(msg1.rolls[0]._total, 25);
    assert.equal(msg1.rolls[1].terms[0].results[0].result, 11, "Companion 3D die face must match dropped DDB roll (11)");
    assert.equal(msg1.rolls[1]._total, 18);

    // 2. Disadvantage Check (rolled 19 and 6, kept 6, mod +3)
    createdMessages = [];
    const parsedDisadv = {
      characterName: "Ranger",
      actionName: "Stealth",
      rollType: "skill",
      rollMode: "disadvantage",
      dice: [
        { dieType: "d20", dieValue: 19, dropped: true },
        { dieType: "d20", dieValue: 6, dropped: false }
      ],
      d20Values: [19, 6],
      keptD20: 6,
      modifier: 3,
      total: 9,
      formula: "2d20kl1 + 3"
    };

    await postDdbRollToFoundry(parsedDisadv);
    assert.equal(createdMessages.length, 1);
    const msg2 = createdMessages[0];
    assert.equal(msg2.rolls.length, 2);
    assert.equal(msg2.rolls[0].terms[0].results[0].result, 6, "Primary 3D die face must match kept DDB roll (6)");
    assert.equal(msg2.rolls[0]._total, 9);
    assert.equal(msg2.rolls[1].terms[0].results[0].result, 19, "Companion 3D die face must match other DDB roll (19)");
    assert.equal(msg2.rolls[1]._total, 22);

    // 3. Multi-dice Damage Roll (2d6 + 4, faces 3 and 5)
    createdMessages = [];
    const parsedDmg = {
      characterName: "Fighter",
      actionName: "Greatsword Damage",
      rollType: "damage",
      rollMode: "normal",
      dice: [
        { dieType: "d6", dieValue: 3, dropped: false },
        { dieType: "d6", dieValue: 5, dropped: false }
      ],
      d20Values: [],
      keptD20: null,
      modifier: 4,
      total: 12,
      formula: "2d6 + 4"
    };

    await postDdbRollToFoundry(parsedDmg);
    assert.equal(createdMessages.length, 1);
    const msg3 = createdMessages[0];
    assert.equal(msg3.rolls.length, 1, "Damage roll must be a single roll");
    assert.equal(msg3.rolls[0].terms[0].results.length, 2);
    assert.equal(msg3.rolls[0].terms[0].results[0].result, 3, "Die 1 face must match DDB");
    assert.equal(msg3.rolls[0].terms[0].results[1].result, 5, "Die 2 face must match DDB");
    assert.equal(msg3.rolls[0]._total, 12);

    // 4. Manual Tray Roll with 2d20 (faces 7 and 16)
    createdMessages = [];
    const parsedTray2d20 = {
      characterName: "Player",
      actionName: "Manual Roll",
      rollType: "other",
      rollMode: "normal",
      dice: [
        { dieType: "d20", dieValue: 7, dropped: false },
        { dieType: "d20", dieValue: 16, dropped: false }
      ],
      d20Values: [7, 16],
      keptD20: 16,
      modifier: 0,
      total: 23,
      formula: "2d20"
    };

    await postDdbRollToFoundry(parsedTray2d20);
    assert.equal(createdMessages.length, 1);
    const msg4 = createdMessages[0];
    assert.equal(msg4.rolls.length, 1, "Manual tray roll must be a single roll");
    assert.equal(msg4.rolls[0].terms[0].results.length, 2);
    assert.equal(msg4.rolls[0].terms[0].results[0].result, 7, "Die 1 face must match DDB 7");
    assert.equal(msg4.rolls[0].terms[0].results[1].result, 16, "Die 2 face must match DDB 16");

    // Clean up globals
    delete globalThis.Roll;
    delete globalThis.Die;
    delete globalThis.ChatMessage;
    delete globalThis.game;
    delete globalThis.CONFIG;
  });

  it("getItemDamageFormula and resolveItemAbility resolve ability and append @mod to damage", () => {
    const actor = {
      system: {
        abilities: {
          str: { mod: 3 },
          dex: { mod: 4 }
        }
      }
    };

    // 1. Standard melee weapon without @mod in activity parts
    const modernSword = {
      type: "weapon",
      system: {
        actionType: "mwak",
        activities: new Map([
          ["act1", { type: "attack", damage: { parts: [{ formula: "1d8" }], includeBaseAbility: true } }]
        ])
      }
    };
    assert.equal(resolveItemAbility(modernSword, actor), "str");
    assert.equal(getItemDamageFormula(modernSword, actor), "1d8 + @mod");

    // 2. Finesse weapon (picks Dex = 4 over Str = 3)
    const finesseDagger = {
      type: "weapon",
      system: {
        actionType: "mwak",
        properties: new Set(["fin"]),
        damage: { parts: [["1d4", "piercing"]] }
      }
    };
    assert.equal(resolveItemAbility(finesseDagger, actor), "dex");
    assert.equal(getItemDamageFormula(finesseDagger, actor), "1d4 + @mod");

    // 3. +1 weapon with magical bonus
    const plusOneBow = {
      type: "weapon",
      system: {
        actionType: "rwak",
        magicalBonus: 1,
        damage: { parts: [["1d8", "piercing"]] }
      }
    };
    assert.equal(resolveItemAbility(plusOneBow, actor), "dex");
    assert.equal(getItemDamageFormula(plusOneBow, actor), "1d8 + @mod + 1");

    // 4. Cantrip without modifier at Level 1 -> 1d10
    const fireBolt = {
      type: "spell",
      system: {
        actionType: "rsak",
        level: 0,
        school: "evo",
        damage: { parts: [["1d10", "fire"]] }
      }
    };
    const level1Actor = {
      system: {
        details: { level: 1 },
        abilities: { int: { mod: 4 } },
        attributes: { spellcasting: "int" }
      }
    };
    assert.equal(getItemDamageFormula(fireBolt, level1Actor), "1d10");

    // 5. Cantrip scaling at Level 5 -> 2d10
    const level5Actor = {
      system: {
        details: { level: 5 },
        abilities: { int: { mod: 4 } },
        attributes: { spellcasting: "int" }
      }
    };
    assert.equal(getItemDamageFormula(fireBolt, level5Actor), "2d10");
  });

  it("postDdbRollToFoundry auto-evaluates attack damage with ability modifiers added", async () => {
    class MockDie {
      constructor(faces, count = 1) {
        this.faces = faces;
        this.results = Array.from({ length: count }, () => ({ result: 5, active: true }));
      }
      get total() {
        return this.results.reduce((acc, r) => acc + (r.active !== false ? r.result : 0), 0);
      }
    }
    class MockRoll {
      constructor(formula, data = {}) {
        this.formula = formula;
        this.data = data;
        this.terms = [];
        this.dice = [];
        const parts = formula.split(/\s*[\+\-]\s*/);
        let bonus = 0;
        for (const p of parts) {
          const m = p.trim().match(/^(\d+)d(\d+)$/i);
          if (m) {
            const d = new MockDie(Number(m[2]), Number(m[1]));
            this.terms.push(d);
            this.dice.push(d);
          } else if (p.trim() === "@mod") {
            bonus += Number(data.mod ?? 0);
          } else if (/^\d+$/.test(p.trim())) {
            bonus += Number(p.trim());
          }
        }
        const diceTotal = this.dice.reduce((acc, d) => acc + d.total, 0);
        this.total = diceTotal + bonus;
        this._total = this.total;
      }
      async evaluate() {
        return this;
      }
      async render() {
        return `<div class="dice-roll"><h4 class="dice-total">${this.total}</h4></div>`;
      }
    }

    let createdMessages = [];
    globalThis.Roll = MockRoll;
    globalThis.Die = MockDie;
    globalThis.ChatMessage = {
      create: async (data) => {
        createdMessages.push(data);
        return data;
      },
      getSpeaker: () => ({ alias: "Fighter" })
    };
    globalThis.CONFIG = { sounds: { dice: "dice.wav" } };

    const matchingWeapon = {
      id: "sword-1",
      name: "Longsword",
      type: "weapon",
      system: {
        actionType: "mwak",
        damage: { parts: [["1d8", "slashing"]] }
      },
      getRollData: () => ({ mod: 3 })
    };

    const fighterActor = {
      id: "fighter-1",
      name: "Fighter",
      items: [matchingWeapon],
      system: {
        abilities: {
          str: { mod: 3 }
        }
      },
      getActiveTokens: () => []
    };

    globalThis.game = {
      user: { id: "gm-user" },
      actors: [fighterActor]
    };

    const attackRoll = {
      characterName: "Fighter",
      actionName: "Longsword",
      rollType: "attack",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 14, dropped: false }],
      d20Values: [14],
      keptD20: 14,
      modifier: 5,
      total: 19,
      formula: "1d20 + 5"
    };

    await postDdbRollToFoundry(attackRoll);
    assert.equal(createdMessages.length, 1);
    const content = createdMessages[0].content;

    // Rolls passed to ChatMessage must include primary d20, companion d20, and damage roll for Dice So Nice
    assert.equal(createdMessages[0].rolls.length, 3, "Must include primary d20, companion d20, and damage roll");
    assert.equal(createdMessages[0].rolls[2].total, 8, "3D damage roll total must be 8");

    // Damage mod (+3) and Damage Total (5 die + 3 mod = 8) must be present in the chat card
    assert.ok(content.includes("Normal Damage (1d8 + 3)"), "Header must display numeric damage formula (1d8 + 3)");
    assert.ok(content.includes("Damage Formula: 1d8 + @mod"), "Breakdown must preserve @mod in Damage Formula");
    assert.ok(content.includes("Base Damage Dice: <strong>1d8 + 3</strong>"), "Breakdown Base Damage Dice must show resolved numeric value (1d8 + 3)");
    assert.ok(content.includes("Damage Mods = +3"), "Card content must display +3 damage mod");
    assert.ok(content.includes("Damage Total: <span style=\"font-size: 1.2em; font-weight: bold;\">8</span>"), "Card content must display total of 8 (5 + 3)");

    // Test Critical Hit Damage separation
    createdMessages = [];
    const critAttackRoll = {
      characterName: "Fighter",
      actionName: "Longsword",
      rollType: "attack",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 20, dropped: false }],
      d20Values: [20],
      keptD20: 20,
      isCrit: true,
      modifier: 5,
      total: 25,
      formula: "1d20 + 5"
    };

    await postDdbRollToFoundry(critAttackRoll);
    assert.equal(createdMessages.length, 1);
    const critContent = createdMessages[0].content;

    // Normal damage total must be 8 (5 die + 3 mod)
    assert.ok(critContent.includes("Damage Total: <span style=\"font-size: 1.2em; font-weight: bold;\">8</span>"), "Crit card must show normal damage total 8");
    // Critical total must be 16 (8 normal + 8 max weapon die)
    assert.ok(critContent.includes("Critical Total: <span style=\"font-size: 1.2em; font-weight: bold; color: #18520b;\">16</span>"), "Crit card must show critical total 16");
    // Breakdown must list Critical Bonus
    assert.ok(critContent.includes("Critical Bonus: +8"), "Breakdown must display +8 critical bonus");
    assert.ok(critContent.includes("Weapon Dice (1d8 Max): <strong>+8</strong>"), "Breakdown must display maximized weapon die bonus");

    // Test Critical Hit triggered by Slot 2 (d20_2 === 20), even on normal DDB roll
    createdMessages = [];
    const normalAttackWithSlot2Crit = {
      characterName: "Fighter",
      actionName: "Longsword",
      rollType: "attack",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 12, dropped: false }, { dieType: "d20", dieValue: 20, dropped: false }],
      d20Values: [12, 20],
      keptD20: 12,
      isCrit: false,
      modifier: 5,
      total: 17,
      formula: "1d20 + 5"
    };

    await postDdbRollToFoundry(normalAttackWithSlot2Crit);
    assert.equal(createdMessages.length, 1);
    const slot2CritContent = createdMessages[0].content;

    assert.ok(slot2CritContent.includes("Critical Hit!"), "Must display Critical Hit badge when slot 2 rolls 20");
    assert.ok(slot2CritContent.includes("Damage Total: <span style=\"font-size: 1.2em; font-weight: bold;\">8</span>"), "Must show normal damage total 8");
    assert.ok(slot2CritContent.includes("Critical Total: <span style=\"font-size: 1.2em; font-weight: bold; color: #18520b;\">16</span>"), "Must show critical total 16");

    delete globalThis.Roll;
    delete globalThis.Die;
    delete globalThis.ChatMessage;
    delete globalThis.game;
    delete globalThis.CONFIG;
  });

  it("parseMaxDamageFromFormula extracts maximum dice damage for crits", () => {
    assert.equal(parseMaxDamageFromFormula("1d8 + @mod"), 8);
    assert.equal(parseMaxDamageFromFormula("2d6 + 4"), 12);
    assert.equal(parseMaxDamageFromFormula("1d12 + 3"), 12);
    assert.equal(parseMaxDamageFromFormula("flat"), 0);
  });

  it("postDdbRollToFoundry drops rolls for non-imported characters when requireImported is enabled", async () => {
    let createdMessages = [];
    globalThis.ChatMessage = {
      create: async (data) => {
        createdMessages.push(data);
        return data;
      },
      getSpeaker: () => ({ alias: "Jack" })
    };
    globalThis.CONFIG = { sounds: { dice: "dice.wav" } };

    const importedActor = {
      id: "actor-imported",
      name: "Jack",
      flags: {
        ddbimporter: {
          dndbeyond: {
            characterId: "998877"
          }
        }
      },
      getActiveTokens: () => []
    };

    globalThis.game = {
      user: { id: "gm-user" },
      actors: [importedActor],
      settings: {
        get: (module, setting) => {
          if (setting === SETTINGS.DDB_REQUIRE_DDB_IMPORTER) return true;
          return null;
        }
      }
    };

    // 1. Roll from another player in DDB campaign not in this world
    const otherPlayerRoll = {
      characterName: "Stranger",
      ddbCharacterId: "112233",
      actionName: "Dagger",
      rollType: "attack",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 15, dropped: false }],
      d20Values: [15],
      keptD20: 15,
      modifier: 4,
      total: 19,
      formula: "1d20 + 4"
    };

    const resultOther = await postDdbRollToFoundry(otherPlayerRoll);
    assert.equal(resultOther, null, "Must return null and drop roll from unknown DDB player");
    assert.equal(createdMessages.length, 0, "No chat message created for unknown DDB player");

    // 2. Roll from a non-imported local actor (e.g. created manually without DDB Importer)
    const manualActor = {
      id: "actor-manual",
      name: "ManualActor",
      getActiveTokens: () => []
    };
    globalThis.game.actors.push(manualActor);

    const manualRoll = {
      characterName: "ManualActor",
      ddbCharacterId: "445566",
      actionName: "Unarmed Strike",
      rollType: "attack",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 10, dropped: false }],
      d20Values: [10],
      keptD20: 10,
      modifier: 2,
      total: 12,
      formula: "1d20 + 2"
    };

    const resultManual = await postDdbRollToFoundry(manualRoll);
    assert.equal(resultManual, null, "Must return null for non-imported local actor");
    assert.equal(createdMessages.length, 0, "No chat message created for non-imported local actor");

    // 3. Roll from imported actor (matches via DDB character ID flag)
    const importedRoll = {
      characterName: "Jackson", // Different name on DDB, matches by characterId flag 998877
      ddbCharacterId: "998877",
      actionName: "Rapier",
      rollType: "attack",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 18, dropped: false }],
      d20Values: [18],
      keptD20: 18,
      modifier: 5,
      total: 23,
      formula: "1d20 + 5"
    };

    await postDdbRollToFoundry(importedRoll);
    assert.equal(createdMessages.length, 1, "Must create chat message for imported character");

    // 4. Test Spell Attack with auto-damage, cantrip scaling, and Spell Attack tagging
    createdMessages = [];
    const wizardSpell = {
      id: "spell-fb",
      name: "Fire Bolt",
      type: "spell",
      system: {
        actionType: "rsak",
        level: 0,
        school: "evo",
        damage: { parts: [["1d10", "fire"]] }
      },
      getRollData: () => ({ mod: 4 })
    };

    const wizardActor = {
      id: "actor-wizard",
      name: "Wizard",
      items: [wizardSpell],
      system: {
        details: { level: 5 },
        abilities: { int: { mod: 4 } },
        attributes: { spellcasting: "int" }
      },
      flags: {
        ddbimporter: {
          dndbeyond: {
            characterId: "555666"
          }
        }
      },
      getActiveTokens: () => []
    };
    globalThis.game.actors.push(wizardActor);

    const spellAttackRoll = {
      characterName: "Wizard",
      ddbCharacterId: "555666",
      actionName: "Firebolt", // space-insensitive match
      rollType: "attack",
      rollMode: "normal",
      dice: [{ dieType: "d20", dieValue: 20, dropped: false }], // Critical hit!
      d20Values: [20],
      keptD20: 20,
      isCrit: true,
      modifier: 7, // +7 spell attack modifier
      total: 27,
      formula: "1d20 + 7"
    };

    class MockSpellDie {
      constructor(faces, count = 1) {
        this.faces = faces;
        this.results = Array.from({ length: count }, () => ({ result: 6, active: true }));
      }
      get total() {
        return this.results.reduce((acc, r) => acc + (r.active !== false ? r.result : 0), 0);
      }
    }
    class MockSpellRoll {
      constructor(formula, data = {}) {
        this.formula = formula;
        this.data = data;
        this.terms = [];
        this.dice = [];
        const m = formula.trim().match(/^(\d+)d(\d+)$/i);
        if (m) {
          const d = new MockSpellDie(Number(m[2]), Number(m[1]));
          this.terms.push(d);
          this.dice.push(d);
        }
        this.total = this.dice.reduce((acc, d) => acc + d.total, 0);
        this._total = this.total;
      }
      async evaluate() {
        return this;
      }
      async render() {
        return `<div class="dice-roll"><h4 class="dice-total">${this.total}</h4></div>`;
      }
    }
    globalThis.Roll = MockSpellRoll;
    globalThis.Die = MockSpellDie;

    await postDdbRollToFoundry(spellAttackRoll);
    assert.equal(createdMessages.length, 1);
    const spellMsg = createdMessages[0];
    const spellContent = spellMsg.content;

    // Must include Cantrip tag and spell name
    assert.ok(spellContent.includes("Cantrip"), "Card must include Cantrip tag");
    assert.ok(spellContent.includes("Fire Bolt"), "Card must include spell name");

    // Rolls passed to ChatMessage must include damage roll for Dice So Nice (2d10 scaled)
    assert.equal(spellMsg.rolls.length, 3, "Must include primary d20, companion d20, and 3D damage roll");
    assert.equal(spellMsg.rolls[2].total, 12, "2d10 roll with face 6 must total 12");

    // Must match Dice Stuff spell attack table and total blocks
    assert.ok(spellContent.includes("ATK (ADV)"), "Card must render Dice Stuff ATK (ADV) header");
    assert.ok(spellContent.includes("DAMAGE TOTAL"), "Card must render DAMAGE TOTAL block");
    assert.ok(spellContent.includes("CRITICAL TOTAL"), "Card must render CRITICAL TOTAL block");
    assert.ok(spellContent.includes("DAMAGE TYPE"), "Card must render DAMAGE TYPE block");
    assert.ok(spellContent.includes("32"), "Critical total must be 12 + 20 max = 32");
    assert.ok(spellContent.includes("Crunchy Crit Extra:</strong> +20 (Max Dice)"), "Breakdown must display Crunchy Crit Extra: +20 (Max Dice)");

    delete globalThis.ChatMessage;
    delete globalThis.game;
    delete globalThis.CONFIG;
  });

  it("postDdbRollToFoundry hijacks attack rolls into Dice Stuff socket with injected d20", async () => {
    let executedCall = null;
    let promptCalled = false;

    globalThis.attackSocket = {
      executeAsGM: async (handler, config, actorId, userId) => {
        executedCall = { handler, config, actorId, userId };
        return true;
      },
      executeAsUser: async () => {
        promptCalled = true;
        return {};
      }
    };

    const mockActor = {
      id: "actor-hijack-1",
      name: "Rogue",
      items: [],
      testUserPermission: (user, perm) => user.id === "player-1",
      getFlag: (scope, key) => {
        if (key === "attackConfigs") {
          return {
            "Sneak Rapier": {
              chatCardTitle: "Sneak Rapier",
              abilityScore: "dex",
              damageDieSize: "d8",
              damageDiceCount: 1,
              hasSavageAttacker: true,
              additionalDamageComponents: [
                { label: "Sneak Attack", formula: "2d6", isActive: false }
              ]
            }
          };
        }
        return null;
      }
    };

    const playerUser = { id: "player-1", isGM: false, active: true, targets: new Set(["token-target-1"]) };
    const gmUser = { id: "gm-user-1", isGM: true };
    const userList = [playerUser, gmUser];
    userList.get = (id) => userList.find(u => u.id === id);

    globalThis.game = {
      actors: new Map([[mockActor.id, mockActor]]),
      user: gmUser,
      users: userList,
      settings: { get: () => false }
    };
    globalThis.window = {
      CustomRolls: {
        getProfileData: (a, k) => a.getFlag("world", k)
      }
    };

    const ddbAttack = {
      characterName: "Rogue",
      actionName: "Sneak Rapier",
      rollType: "attack",
      rollMode: "advantage",
      keptD20: 19,
      d20Values: [19, 7],
      modifier: 5,
      total: 24
    };

    const result = await postDdbRollToFoundry(ddbAttack);
    assert.ok(result?.hijacked, "Roll should be hijacked by Dice Stuff");
    assert.equal(result.handler, "runAttackRoll");
    assert.equal(promptCalled, false, "No pre-roll dialog prompt should block DDB macro execution");
    assert.ok(executedCall, "executeAsGM should have run");
    assert.equal(executedCall.config.injectedD20_1, 19, "Primary d20 must match DDB kept d20");
    assert.equal(executedCall.config.injectedD20_2, 7, "Companion d20 must match second DDB d20");
    assert.equal(executedCall.config.additionalDamageComponents[0].isActive, false, "DDB hijacked attacks must stay base-only without optional extra damage components");
    assert.ok(!executedCall.config.isSavageAttackerActive, "DDB hijacked attacks must not auto-activate optional perks");

    delete globalThis.attackSocket;
    delete globalThis.game;
    delete globalThis.window;
  });

  it("postDdbRollToFoundry hijacks spell attack rolls into runSpellAttackRoll with injected d20", async () => {
    let executedCall = null;

    globalThis.attackSocket = {
      executeAsGM: async (handler, config, actorId, userId) => {
        executedCall = { handler, config, actorId, userId };
        return true;
      }
    };

    const mockWizard = {
      id: "actor-wizard-hijack",
      name: "Gandalf",
      items: [],
      testUserPermission: () => false,
      getFlag: (scope, key) => {
        if (key === "spellConfigs") {
          return {
            "Fire Bolt": {
              spellName: "Fire Bolt",
              resolutionMethod: "attack",
              baseLevel: 0,
              damageDieSize: "d10",
              damageDiceCount: 1,
              damageType: "fire"
            }
          };
        }
        return null;
      }
    };

    const gmUser = { id: "gm-user-1", isGM: true };
    const userList = [gmUser];
    userList.get = (id) => userList.find(u => u.id === id);

    globalThis.game = {
      actors: new Map([[mockWizard.id, mockWizard]]),
      user: gmUser,
      users: userList,
      settings: { get: () => false }
    };
    globalThis.window = {
      CustomRolls: {
        getProfileData: (a, k) => a.getFlag("world", k)
      }
    };

    const ddbSpellAttack = {
      characterName: "Gandalf",
      actionName: "Fire Bolt",
      rollType: "attack",
      rollMode: "normal",
      keptD20: 16,
      d20Values: [16],
      modifier: 7,
      total: 23
    };

    const result = await postDdbRollToFoundry(ddbSpellAttack);
    assert.ok(result?.hijacked, "Spell attack should be hijacked by Dice Stuff");
    assert.equal(result.handler, "runSpellAttackRoll");
    assert.ok(executedCall, "executeAsGM should have run");
    assert.equal(executedCall.config.injectedD20_1, 16, "Primary d20 must match DDB kept d20");

    // Verify parenthetical fallback: "Fire Bolt (Legacy)" in spellConfigs matches "Fire Bolt" from DDB
    executedCall = null;
    mockWizard.getFlag = (scope, key) => {
      if (key === "spellConfigs") {
        return {
          "Fire Bolt (Legacy)": {
            spellName: "Fire Bolt (Legacy)",
            resolutionMethod: "attack",
            baseLevel: 0,
            damageDieSize: "d10",
            damageDiceCount: 1,
            damageType: "fire"
          }
        };
      }
      return null;
    };
    const legacyResult = await postDdbRollToFoundry(ddbSpellAttack);
    assert.ok(legacyResult?.hijacked, "Parenthetical spell name 'Fire Bolt (Legacy)' must match 'Fire Bolt'");
    assert.equal(legacyResult.handler, "runSpellAttackRoll");
    assert.equal(executedCall.config.spellName, "Fire Bolt (Legacy)");

    delete globalThis.attackSocket;
    delete globalThis.game;
    delete globalThis.window;
  });

  it("resolveSpellSaveInfo unwraps dnd5e Set activities and buildDdbSpellSaveCardHtml renders fallback save card", () => {
    const fireballItem = {
      id: "spell-fb",
      name: "Fireball",
      type: "spell",
      system: {
        level: 3,
        ability: "int",
        range: { value: 150, units: "ft" },
        duration: { units: "inst" },
        target: { type: "sphere", value: 20 },
        description: { value: "<p>A bright streak flashes from your pointing finger.</p>" },
        properties: new Set(["vocal", "somatic", "material"]),
        activities: new Map([
          [
            "act-save",
            {
              type: "save",
              save: { ability: new Set(["dex"]), scaling: "half" },
              damage: { parts: [{ types: new Set(["fire"]) }], onSave: "half" }
            }
          ]
        ])
      }
    };

    const wizardActor = {
      id: "wiz-save-1",
      name: "Evoker",
      system: {
        abilities: { int: { mod: 4 } },
        attributes: { prof: 3, spellcasting: "int", spell: { dc: 15 } }
      }
    };

    const saveInfo = resolveSpellSaveInfo(fireballItem, wizardActor);
    assert.equal(saveInfo.isSaveSpell, true);
    assert.equal(saveInfo.saveAbility, "dex");
    assert.equal(saveInfo.saveSuccess, "half");
    assert.equal(saveInfo.spellDC, 15);

    const parsedDmg = {
      characterName: "Evoker",
      actionName: "Fireball",
      rollType: "damage",
      rollMode: "normal",
      formula: "8d6",
      total: 29,
      dice: [{ dieType: "d6", dieValue: 4 }, { dieType: "d6", dieValue: 3 }]
    };

    const html = buildDdbCustomChatCardHtml(parsedDmg, wizardActor, {
      matchingItem: fireballItem,
      saveInfo
    });
    assert.ok(html.includes("DC 15 DEX Saving Throw"), "Must show DC and Save Ability banner");
    assert.ok(html.includes("Spell Description"), "Must include collapsible Spell Description block");
    assert.ok(html.includes("A bright streak flashes"), "Must include item description HTML");
    assert.ok(html.includes("FAILED SAVE"), "Must show FAILED SAVE box");
    assert.ok(html.includes(">29<"), "Must show full damage 29");
    assert.ok(html.includes("SUCCESSFUL SAVE"), "Must show SUCCESSFUL SAVE box");
    assert.ok(html.includes(">14<"), "Must show half damage 14");
    assert.ok(html.includes("FIRE"), "Must unwrap Set damage type FIRE");
    assert.ok(html.includes(">DDB<"), "Fallback save card must include slate DDB badge");
    assert.ok(html.includes("#495057"), "Fallback DDB badge must use slate grey color");

    // Verify SRD fallback when spell is missing from Foundry sheet
    const srdSave = resolveSpellSaveInfo(null, wizardActor, "Sacred Flame");
    assert.equal(srdSave.isSaveSpell, true);
    assert.equal(srdSave.saveAbility, "dex");
    assert.equal(srdSave.saveSuccess, "none");
    assert.equal(srdSave.spellDC, 15);
  });

  it("postDdbRollToFoundry hijacks configured save spell damage rolls into runSpellAttackRoll", async () => {
    let executedCall = null;
    globalThis.attackSocket = {
      executeAsGM: async (handler, config, actorId, userId) => {
        executedCall = { handler, config, actorId, userId };
      }
    };

    const mockWizard = {
      id: "wiz-2",
      name: "Evoker",
      items: [
        { id: "fb-1", name: "Fireball", type: "spell", system: { level: 3 } }
      ],
      getFlag: (scope, key) => {
        if (key === "spellConfigs") {
          return {
            Fireball: {
              spellName: "Fireball",
              resolutionMethod: "save",
              saveAbility: "dex",
              saveSuccess: "half",
              baseLevel: 3,
              damageDieSize: "d6",
              damageDiceCount: 8,
              damageType: "fire"
            }
          };
        }
        return null;
      },
      testUserPermission: () => true,
      getActiveTokens: () => []
    };

    globalThis.game = {
      user: { id: "gm-user", isGM: true },
      users: { find: () => null, get: () => null },
      actors: [mockWizard],
      macros: []
    };
    globalThis.window = {};

    const ddbSaveDamage = {
      characterName: "Evoker",
      actionName: "Fireball",
      rollType: "damage",
      rollMode: "normal",
      formula: "8d6",
      total: 31,
      dice: [
        { dieType: "d6", dieValue: 5 },
        { dieType: "d6", dieValue: 4 },
        { dieType: "d6", dieValue: 3 },
        { dieType: "d6", dieValue: 6 },
        { dieType: "d6", dieValue: 2 },
        { dieType: "d6", dieValue: 4 },
        { dieType: "d6", dieValue: 5 },
        { dieType: "d6", dieValue: 2 }
      ]
    };

    const result = await postDdbRollToFoundry(ddbSaveDamage);
    assert.ok(result?.hijacked, "Configured save spell damage roll must hijack");
    assert.equal(result.handler, "runSpellAttackRoll");
    assert.equal(executedCall.config.resolutionMethod, "save");
    assert.equal(executedCall.config.isDdbHijacked, true, "Hijacked config must set isDdbHijacked = true");
    assert.equal(executedCall.config.injectedDamageTotal, 31);
    assert.equal(executedCall.config.injectedDamageDice.length, 8);

    delete globalThis.attackSocket;
    delete globalThis.game;
    delete globalThis.window;
  });

  it("postDdbRollToFoundry hijacks configured heal spell rolls into runSpellAttackRoll", async () => {
    let executedCall = null;
    globalThis.attackSocket = {
      executeAsGM: async (handler, config, actorId, userId) => {
        executedCall = { handler, config, actorId, userId };
      }
    };

    const mockCleric = {
      id: "cleric-1",
      name: "Healer",
      items: [
        { id: "hw-1", name: "Healing Word", type: "spell", system: { level: 1 } }
      ],
      getFlag: (scope, key) => {
        if (key === "spellConfigs") {
          return {
            "Healing Word": {
              spellName: "Healing Word",
              resolutionMethod: "heal",
              baseLevel: 1,
              damageDieSize: "d4",
              damageDiceCount: 1,
              addAbilityModToValue: true,
              damageType: "healing"
            }
          };
        }
        return null;
      },
      testUserPermission: () => true,
      getActiveTokens: () => []
    };

    globalThis.game = {
      user: { id: "gm-user", isGM: true },
      users: { find: () => null, get: () => null },
      actors: [mockCleric],
      macros: []
    };
    globalThis.window = {};

    const ddbHeal = {
      characterName: "Healer",
      actionName: "Healing Word",
      rollType: "heal",
      rollMode: "normal",
      formula: "1d4 + 4",
      total: 7,
      dice: [{ dieType: "d4", dieValue: 3 }]
    };

    const result = await postDdbRollToFoundry(ddbHeal);
    assert.ok(result?.hijacked, "Configured heal spell roll must hijack");
    assert.equal(result.handler, "runSpellAttackRoll");
    assert.equal(executedCall.config.resolutionMethod, "heal");
    assert.equal(executedCall.config.isDdbHijacked, true);
    assert.equal(executedCall.config.injectedDamageTotal, 7);
    assert.equal(executedCall.config.injectedDamageDice.length, 1);

    delete globalThis.attackSocket;
    delete globalThis.game;
    delete globalThis.window;
  });

  it("normalizeDdbRollType preserves heal and buildDdbSpellHealCardHtml renders green fallback healing card", () => {
    assert.equal(normalizeDdbRollType("heal"), "heal");
    assert.equal(normalizeDdbRollType("healing"), "heal");
    assert.equal(normalizeDdbRollType("damage"), "damage");

    const cureWoundsItem = {
      id: "cw-item",
      name: "Cure Wounds",
      type: "spell",
      system: {
        level: 1,
        ability: "wis",
        range: { units: "touch" },
        duration: { units: "inst" },
        description: { value: "<p>A creature you touch regains hit points.</p>" },
        properties: new Set(["vocal", "somatic"])
      }
    };

    const clericActor = {
      id: "cleric-fb",
      name: "Cleric",
      system: {
        abilities: { wis: { mod: 4 } },
        attributes: { spellcasting: "wis" }
      }
    };

    const parsedHeal = {
      characterName: "Cleric",
      actionName: "Cure Wounds",
      rollType: "heal",
      rollMode: "normal",
      formula: "2d8 + 4",
      total: 13
    };

    const html = buildDdbCustomChatCardHtml(parsedHeal, clericActor, { matchingItem: cureWoundsItem });
    assert.ok(html.includes("HIT POINTS RESTORED"), "Fallback heal card must show HIT POINTS RESTORED banner");
    assert.ok(html.includes("HEALING TOTAL"), "Fallback heal card must show HEALING TOTAL");
    assert.ok(html.includes("+13"), "Fallback heal card must show +13 total");
    assert.ok(html.includes("Spell Description"), "Fallback heal card must include Spell Description");
    assert.ok(html.includes(">DDB<"), "Fallback heal card must include slate DDB badge");
    assert.ok(html.includes("#495057"), "Fallback DDB badge must use slate grey color");
  });

  it("resolveDdbCastLevel detects base-level and upcasted spells from DDB dice counts", async () => {
    const fireballCfg = { spellName: "Fireball", baseLevel: 3, damageDiceCount: 8, damageDieSize: "d6" };
    const baseRoll = { rollType: "damage", dice: Array(8).fill({ dieType: "d6", dieValue: 4 }) };
    const upcastRoll = { rollType: "damage", dice: Array(9).fill({ dieType: "d6", dieValue: 4 }) };
    assert.equal(resolveDdbCastLevel(baseRoll, fireballCfg), 3, "8d6 Fireball must resolve to Level 3");
    assert.equal(resolveDdbCastLevel(upcastRoll, fireballCfg), 4, "9d6 Fireball must resolve to Level 4 upcast");

    const cantripCfg = { spellName: "Fire Bolt", baseLevel: 0, damageDiceCount: 1 };
    assert.equal(resolveDdbCastLevel({ rollType: "attack", dice: [{ dieType: "d20", dieValue: 15 }] }, cantripCfg), 0);

    // Verify postDdbRollToFoundry sets castLevel & updated damageDiceCount on upcast hijack
    let executedCall = null;
    globalThis.attackSocket = {
      executeAsGM: async (handler, config, actorId, userId) => {
        executedCall = { handler, config, actorId, userId };
      }
    };

    const mockCleric = {
      id: "cleric-up",
      name: "Cleric",
      items: [{ id: "cw-up", name: "Cure Wounds", type: "spell", system: { level: 1 } }],
      getFlag: (scope, key) => key === "spellConfigs" ? {
        "Cure Wounds": {
          spellName: "Cure Wounds",
          resolutionMethod: "heal",
          baseLevel: 1,
          damageDiceCount: 1,
          damageDieSize: "d8",
          addAbilityModToValue: true
        }
      } : null,
      testUserPermission: () => true,
      getActiveTokens: () => []
    };

    globalThis.game = {
      user: { id: "gm-user", isGM: true },
      users: { find: () => null, get: () => null },
      actors: [mockCleric],
      macros: []
    };
    globalThis.window = {};

    const upcastCureWounds = {
      characterName: "Cleric",
      actionName: "Cure Wounds",
      rollType: "heal",
      rollMode: "normal",
      formula: "3d8 + 4",
      total: 18,
      dice: [
        { dieType: "d8", dieValue: 5 },
        { dieType: "d8", dieValue: 4 },
        { dieType: "d8", dieValue: 5 }
      ]
    };

    const res = await postDdbRollToFoundry(upcastCureWounds);
    assert.ok(res?.hijacked);
    assert.equal(executedCall.config.castLevel, 3, "3d8 Cure Wounds must set castLevel = 3 for slot deduction");
    assert.equal(executedCall.config.damageDiceCount, 3, "3d8 Cure Wounds must update damageDiceCount = 3");
    assert.notEqual(executedCall.config.skipSlotDeduction, true, "Slot deduction must remain enabled");

    delete globalThis.attackSocket;
    delete globalThis.game;
    delete globalThis.window;
  });

  it("postDdbRollToFoundry auto-hijacks unconfigured sheet Scorching Ray with 3 rays and slot deduction", async () => {
    let executedCall = null;
    globalThis.attackSocket = {
      executeAsGM: async (handler, config, actorId, userId) => {
        executedCall = { handler, config, actorId, userId };
      }
    };

    const scorchingRayItem = {
      id: "sr-item",
      name: "Scorching Ray",
      type: "spell",
      system: {
        level: 2,
        ability: "int",
        actionType: "rsak",
        damage: { parts: [["2d6", "fire"]] }
      }
    };

    const mockSorcerer = {
      id: "sorc-1",
      name: "Pyro",
      items: [scorchingRayItem],
      system: { attributes: { spellcasting: "int" } },
      getFlag: () => ({}),
      testUserPermission: () => true,
      getActiveTokens: () => []
    };

    globalThis.game = {
      user: { id: "gm-user", isGM: true },
      users: { find: () => null, get: () => null },
      actors: [mockSorcerer],
      macros: []
    };
    globalThis.window = {};

    const ddbScorchingRay = {
      characterName: "Pyro",
      actionName: "Scorching Ray",
      rollType: "attack",
      rollMode: "normal",
      keptD20: 17,
      d20Values: [17],
      modifier: 7,
      total: 24
    };

    const res = await postDdbRollToFoundry(ddbScorchingRay);
    assert.ok(res?.hijacked, "Unconfigured sheet Scorching Ray must auto-hijack");
    assert.equal(res.handler, "runSpellAttackRoll");
    assert.equal(executedCall.config.isMultiAttack, true, "Scorching Ray must auto-enable isMultiAttack");
    assert.equal(executedCall.config.attackCount, 3, "Scorching Ray must auto-set 3 rays");
    assert.equal(executedCall.config.castLevel, 2, "Scorching Ray must set castLevel = 2 for slot deduction");
    assert.equal(executedCall.config.injectedD20_1, 17, "Ray 1 must inject DDB d20");
    assert.equal(executedCall.config.isDdbHijacked, true);

    delete globalThis.attackSocket;
    delete globalThis.game;
    delete globalThis.window;
  });

  it("parseDdbGameLogEvent and resolveDdbCastLevel detect upcast level from DDB attack metadata and actionName", () => {
    const rawWithCastAtLevel = {
      id: "evt-upcast-atk",
      eventType: "dice/roll/fulfilled",
      entityId: "5555",
      context: { name: "Pyro" },
      data: {
        action: "Scorching Ray",
        castAtLevel: 4,
        rolls: [
          {
            rollType: "to hit",
            rollKind: "none",
            diceNotation: {
              set: [{ count: 1, dieType: "d20", dice: [{ dieType: "d20", dieValue: 14 }] }],
              constant: 7
            },
            result: { constant: 7, values: [14], total: 21, text: "14 + 7" }
          }
        ]
      }
    };

    const parsedMeta = parseDdbGameLogEvent(rawWithCastAtLevel);
    assert.equal(parsedMeta.length, 1);
    assert.equal(parsedMeta[0].castLevel, 4, "parseDdbGameLogEvent should extract data.castAtLevel");
    assert.equal(resolveDdbCastLevel(parsedMeta[0], { baseLevel: 2 }), 4);

    const parsedParen = {
      actionName: "Scorching Ray (3rd Level)",
      rollType: "attack",
      dice: [{ dieType: "d20", dieValue: 16, dropped: false }]
    };
    assert.equal(resolveDdbCastLevel(parsedParen, { baseLevel: 2 }), 3, "resolveDdbCastLevel should parse (3rd Level) from actionName");

    const parsedLevelWord = {
      actionName: "Scorching Ray - Level 5",
      rollType: "attack",
      dice: [{ dieType: "d20", dieValue: 16, dropped: false }]
    };
    assert.equal(resolveDdbCastLevel(parsedLevelWord, { baseLevel: 2 }), 5, "resolveDdbCastLevel should parse Level 5 from actionName");
  });

  it("promptDdbAttackCastLevel prompts when higher slots exist and returns selected level", async () => {
    let dialogOpts = null;
    globalThis.Dialog = class MockDialog {
      constructor(opts) {
        dialogOpts = opts;
      }
      render() {
        // Simulate user clicking Level 5
        dialogOpts.buttons.lvl_5.callback();
        return this;
      }
    };

    const actorWithSlots = {
      name: "Renley",
      system: {
        spells: {
          spell2: { value: 2, max: 3 },
          spell3: { value: 1, max: 3 },
          spell4: { value: 0, max: 2 },
          spell5: { value: 1, max: 1 }
        }
      }
    };

    const selected = await promptDdbAttackCastLevel(actorWithSlots, { spellName: "Scorching Ray", isMultiAttack: true, attackCount: 3, upcastAttacks: 1 }, 2);
    assert.equal(selected, 5, "Selected level 5 should be returned");
    assert.ok(dialogOpts.buttons.lvl_2.label.includes("3 rays"), "Lvl 2 button should show 3 rays");
    assert.ok(dialogOpts.buttons.lvl_3.label.includes("4 rays"), "Lvl 3 button should show 4 rays");
    assert.equal(dialogOpts.buttons.lvl_4, undefined, "Empty lvl 4 slot should not appear");
    assert.ok(dialogOpts.buttons.lvl_5.label.includes("6 rays"), "Lvl 5 button should show 6 rays");

    // Actor with no higher slots should resolve immediately without rendering Dialog
    dialogOpts = null;
    const actorNoHigher = {
      name: "Renley",
      system: {
        spells: {
          spell2: { value: 1, max: 3 },
          spell3: { value: 0, max: 3 }
        }
      }
    };
    const immediate = await promptDdbAttackCastLevel(actorNoHigher, { spellName: "Scorching Ray" }, 2);
    assert.equal(immediate, 2);
    assert.equal(dialogOpts, null, "No dialog should open when no higher slots remain");

    delete globalThis.Dialog;
  });

  it("extractDdbCharacterId extracts IDs from URLs and raw IDs", () => {
    assert.equal(extractDdbCharacterId("https://www.dndbeyond.com/characters/12345678"), "12345678");
    assert.equal(extractDdbCharacterId("https://dndbeyond.com/profile/user/characters/987654/builder"), "987654");
    assert.equal(extractDdbCharacterId("55544433"), "55544433");
    assert.equal(extractDdbCharacterId("invalid-link"), "");
  });

  it("getActorDdbCharacterUrl prioritizes custom flag and auto-populates from ddbimporter", () => {
    const customActor = {
      flags: {
        [MODULE_ID]: { [FLAGS.DDB_CHARACTER_URL]: "https://www.dndbeyond.com/characters/111" },
        ddbimporter: { dndbeyond: { characterId: "222" } }
      },
      getFlag(mod, key) { return this.flags?.[mod]?.[key]; }
    };
    assert.equal(getActorDdbCharacterUrl(customActor), "https://www.dndbeyond.com/characters/111");

    const importedActor = {
      flags: { ddbimporter: { dndbeyond: { characterId: "998877" } } },
      getFlag() { return undefined; }
    };
    assert.equal(getActorDdbCharacterUrl(importedActor), "https://www.dndbeyond.com/characters/998877");
  });

  it("computeDdbSpellSlotUpdates maps spellSlots and pactMagic into Foundry actor updates", () => {
    const actor = {
      system: {
        spells: {
          spell1: { value: 4, max: 4 },
          spell2: { value: 3, max: 3 },
          pact: { value: 2, max: 2 }
        }
      }
    };
    const updates = computeDdbSpellSlotUpdates(actor, {
      spellSlots: [
        { level: 1, used: 2, available: 4 },
        { level: 2, used: 1, available: 0 } // tests fallback to existingMax = 3
      ],
      pactMagic: [{ level: 3, used: 1, available: 2 }]
    });
    assert.equal(updates["system.spells.spell1.value"], 2);
    assert.equal(updates["system.spells.spell2.value"], 2);
    assert.equal(updates["system.spells.pact.value"], 1);
  });

  it("computeDdbHpUpdates maps removedHitPoints, temporaryHitPoints, and overrideHitPoints", () => {
    const actor = {
      system: {
        attributes: {
          hp: { value: 45, max: 45, temp: 0 }
        }
      }
    };

    const dmgUpdates = computeDdbHpUpdates(actor, {
      removedHitPoints: 12,
      temporaryHitPoints: 8,
      overrideHitPoints: null
    });
    assert.deepEqual(dmgUpdates, {
      "system.attributes.hp.value": 33,
      "system.attributes.hp.temp": 8
    });

    const overrideUpdates = computeDdbHpUpdates(actor, {
      removedHitPoints: 10,
      temporaryHitPoints: 0,
      overrideHitPoints: 50
    });
    assert.deepEqual(overrideUpdates, {
      "system.attributes.hp.max": 50,
      "system.attributes.hp.value": 40
    });

    const noChangeUpdates = computeDdbHpUpdates(actor, {
      removedHitPoints: 0,
      temporaryHitPoints: 0,
      overrideHitPoints: 0
    });
    assert.deepEqual(noChangeUpdates, {});
  });
});
