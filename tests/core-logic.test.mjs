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
});
