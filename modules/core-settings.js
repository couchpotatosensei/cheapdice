import { MODULE_ID, SETTINGS } from "../src/constants.js";

/**
 * Baseline settings enforced for every connected client.
 */
const BASELINE_CLIENT_SETTINGS = [
  // Chat bubbles
  { keys: ["chatBubbles"], value: true },
  // Pan to speaker (Modern: chatPan; Legacy: panToSpeaker)
  { keys: ["chatPan", "panToSpeaker"], value: false },
  // Scrolling status text
  { keys: ["scrollingStatusText"], value: true },
  // Left click release (Modern: leftClickToRelease; Legacy: leftClickRelease)
  { keys: ["leftClickToRelease", "leftClickRelease"], value: true }
];

/**
 * Settings enforced exclusively on GM clients.
 */
const GM_ONLY_CLIENT_SETTINGS = [
  { keys: ["uiOpacityInactive"], value: 1.0 },
  { keys: ["toolclips"], value: false },
  { keys: ["animateRollTable"], value: false },
  { keys: ["photosensitiveMode"], value: false },
  // Performance mode: 2 = Medium
  { keys: ["performanceMode"], value: 2 },
  // Framerate cap (Modern: fpsLimit; Legacy: maxFPS)
  { keys: ["fpsLimit", "maxFPS"], value: 30 },
  { keys: ["pixelRatioResolutionScaling"], value: false },
  { keys: ["lightAnimation"], value: true },
  { keys: ["mipmap"], value: true }
];

export function initCoreSettings() {
  Hooks.once("ready", async () => {
    try {
      const isEnabled = game.settings.get(MODULE_ID, SETTINGS.FEATURES.CORE_SETTINGS_ENFORCER);
      if (!isEnabled) return;
    } catch {
      return;
    }

    // Apply baseline client configurations
    await applyBatch(BASELINE_CLIENT_SETTINGS);

    // Apply GM-only configurations
    if (game.user.isGM) {
      await applyBatch(GM_ONLY_CLIENT_SETTINGS);
      await applyWorldGridDiagonals();
    }
  });
}

/**
 * Iterates through candidate setting keys and applies the target value.
 */
async function applyBatch(list) {
  for (const item of list) {
    for (const key of item.keys) {
      const fullKey = `core.${key}`;
      if (!game.settings.settings.has(fullKey)) continue;

      const current = game.settings.get("core", key);
      if (current !== item.value) {
        try {
          await game.settings.set("core", key, item.value);
          console.log(`${MODULE_ID} | Enforced ${fullKey} = ${item.value}`);
        } catch (err) {
          console.warn(`${MODULE_ID} | Could not set ${fullKey}:`, err);
        }
      }
      break; // Successfully handled this setting category
    }
  }
}

/**
 * Enforces world diagonal measurement rule (GM only).
 */
async function applyWorldGridDiagonals() {
  if (game.settings.settings.has("dnd5e.diagonalRule")) {
    if (game.settings.get("dnd5e.diagonalRule") !== "5105") {
      try {
        await game.settings.set("dnd5e.diagonalRule", "5105");
      } catch (err) {
        console.warn(`${MODULE_ID} | Failed to set dnd5e diagonalRule:`, err);
      }
    }
  }

  if (game.settings.settings.has("core.gridDiagonals")) {
    const target = CONST.GRID_DIAGONALS ? CONST.GRID_DIAGONALS.ALTERNATING : 2;
    if (game.settings.get("core", "gridDiagonals") !== target) {
      try {
        await game.settings.set("core", "gridDiagonals", target);
      } catch (err) {
        console.warn(`${MODULE_ID} | Failed to set core.gridDiagonals:`, err);
      }
    }
  }
}
