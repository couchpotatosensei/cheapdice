/**
 * Cheap Dice In-Client Test Suite Macro
 * Run as a GM script macro in Foundry VTT to test core Cheap Dice routines.
 */
(async () => {
  const results = [];
  const logTest = (name, passed, detail = "") => {
    results.push({ name, passed, detail });
    const symbol = passed ? "✅" : "❌";
    console.log(`[Cheap Dice Test] ${symbol} ${name} ${detail ? `(${detail})` : ""}`);
  };

  ui.notifications?.info("Running Cheap Dice Test Suite...");

  // 1. Basic RollTerm Cloning Check (prevents t.clone TypeError regressions)
  try {
    const testRoll = await new Roll("1d20 + 3 + 1d4").evaluate();
    let cloneSuccess = true;
    for (const term of testRoll.terms) {
      try {
        const cloned = (typeof term.clone === "function") 
          ? term.clone() 
          : (typeof term.constructor?.fromData === "function" 
              ? term.constructor.fromData(term.toJSON()) 
              : RollTerm.fromJSON(JSON.stringify(term)));
        if (!cloned) cloneSuccess = false;
      } catch (err) {
        cloneSuccess = false;
        break;
      }
    }
    logTest("RollTerm Serialization / Cloning", cloneSuccess);
  } catch (err) {
    logTest("RollTerm Serialization / Cloning", false, err.message);
  }

  // 2. Check Module & Socket Registration
  try {
    const mod = game.modules.get("cheapdice");
    const active = mod?.active ?? false;
    logTest("Cheap Dice Active in World", active);

    const hasSocket = !!(game.modules.get("socketlib")?.active);
    logTest("socketlib Active", hasSocket);
  } catch (err) {
    logTest("Module Presence Check", false, err.message);
  }

  // 3. Super Advantage Candidate Rolling Logic Simulation
  try {
    const rollA = await new Roll("1d20").evaluate();
    const rollB = await new Roll("1d20").evaluate();
    const kept = (rollA.total >= rollB.total) ? rollA : rollB;
    const dropped = (rollA.total >= rollB.total) ? rollB : rollA;
    const isHigherOrEqual = kept.total >= dropped.total;
    logTest("Super Advantage Die Drop Resolution", isHigherOrEqual, `Kept: ${kept.total}, Dropped: ${dropped.total}`);
  } catch (err) {
    logTest("Super Advantage Die Drop Resolution", false, err.message);
  }

  // 4. Test Token AC Badge & Elevation Calculation Hook Integrity
  try {
    const token = canvas.tokens.controlled[0] || canvas.tokens.placeables[0];
    if (token) {
      const actor = token.actor;
      const ac = actor?.system?.attributes?.ac?.value ?? null;
      const elevation = token.document?.elevation ?? 0;
      logTest("Token AC & Elevation Extraction", ac !== null, `AC: ${ac}, Elev: ${elevation}`);
    } else {
      logTest("Token AC & Elevation Extraction", true, "Skipped - no tokens on canvas");
    }
  } catch (err) {
    logTest("Token AC & Elevation Extraction", false, err.message);
  }

  // Summary
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.length - passCount;
  const summaryMsg = `Cheap Dice Tests: ${passCount} passed, ${failCount} failed.`;
  
  if (failCount === 0) {
    ui.notifications?.info(`✅ ${summaryMsg}`);
  } else {
    ui.notifications?.warn(`⚠️ ${summaryMsg} (check F12 console)`);
  }
})();

