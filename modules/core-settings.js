import { MODULE_ID, SETTINGS } from "../src/constants.js";

/**
 * Baseline client settings enforced for EVERY connected user (GM and Players).
 * Format: [scope, key, targetValue]
 */
const PLAYER_BASELINE_SETTINGS = [
  ["core", "chatBubbles", true],
  ["core", "panToSpeaker", false],
  ["core", "scrollingStatusText", true],
  ["core", "leftClickRelease", true]
];

/**
 * Additional client settings enforced ONLY on GM browser sessions.
 * Keeps performance and GM interface preferences local to the GM.
 */
const GM_ADDITIONAL_SETTINGS = [
  // Interface & Opacity
  ["core", "uiOpacityInactive", 1.0],
  ["core", "toolclips", false],
  ["core", "animateRollTable", false],
  ["core", "photosensitiveMode", false],

  // Performance & Canvas Rendering
  ["core", "performanceMode", 2], // 2 = Medium
  ["core", "maxFPS", 30],
  ["core", "pixelRatioResolutionScaling", false],
  ["core", "lightAnimation", true],
  ["core", "mipmap", true]
];

export function initCoreSettings() {
  Hooks.once("ready", async () => {
    // Check if the feature toggle is active
    const isEnabled = game.settings.get(MODULE_ID, SETTINGS.FEATURES.CORE_SETTINGS_ENFORCER);
    if (!isEnabled) return;

    // Apply basic baseline to all connected users
    await applySettingList(PLAYER_BASELINE_SETTINGS);

    // Apply GM-exclusive client and world configurations
    if (game.user.isGM) {
      await applySettingList(GM_ADDITIONAL_SETTINGS);
      await applyWorldGridDiagonals();
    }
  });
}

/**
 * Iterates through a given setting list and applies target values.
 */
async function applySettingList(settingsList) {
  for (const [scope, key, targetValue] of settingsList) {
    const settingKey = `${scope}.${key}`;
    if (!game.settings.settings.has(settingKey)) continue;

    const currentValue = game.settings.get(scope, key);
    if (currentValue !== targetValue) {
      try {
        await game.settings.set(scope, key, targetValue);
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to enforce setting ${settingKey}:`, err);
      }
    }
  }
}

/**
 * Enforces world-scoped grid settings (GM only).
 */
async function applyWorldGridDiagonals() {
  // System-level rule (e.g., dnd5e 5/10/5 Alternating)
  if (game.settings.settings.has("dnd5e.diagonalRule")) {
    const currentRule = game.settings.get("dnd5e.diagonalRule");
    if (currentRule !== "5105") {
      try {
        await game.settings.set("dnd5e.diagonalRule", "5105");
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to enforce dnd5e diagonal rule:`, err);
      }
    }
  }

  // Core grid diagonals
  if (game.settings.settings.has("core.gridDiagonals")) {
    const targetDiagonal = CONST.GRID_DIAGONALS ? CONST.GRID_DIAGONALS.ALTERNATING : 2;
    const currentDiagonal = game.settings.get("core", "gridDiagonals");
    if (currentDiagonal !== targetDiagonal) {
      try {
        await game.settings.set("core", "gridDiagonals", targetDiagonal);
      } catch (err) {
        console.error(`${MODULE_ID} | Failed to enforce core grid diagonals:`, err);
      }
    }
  }
}
