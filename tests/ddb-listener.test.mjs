import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseDdbGameLogEvent,
  matchDdbActor,
  buildDdbCustomChatCardHtml,
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

    assert.ok(html.includes("Gandalf: Firebolt"));
    assert.ok(html.includes("CRITICAL HIT!"));
    assert.ok(html.includes("Formula Breakdown &amp; Audit"));
    assert.ok(html.includes("cheapdice-ddb-roll-damage"));
    assert.ok(html.includes("Roll Crit Damage"));
    assert.equal(html.includes("<script>"), false);
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
});
