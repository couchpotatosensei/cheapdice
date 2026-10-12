// =============================================================================
// TAM'S WORLD SCRIPT
// Entry point / Orchestrator
// =============================================================================

import { MODULE_ID, SETTINGS } from "./src/constants.js";
import { registerSettings } from "./scripts/settings.js";
import { initTokenAc, renderTokenAcBadge, getGlobalShowAC } from "./modules/token-ac.js";
import { initStatCard, postStatCard } from "./modules/stat-card.js";
import { initTokenHud } from "./modules/token-hud.js";
import { initElevation } from "./modules/elevation.js";
import { initSockets } from "./modules/socket-handlers.js";
import { initCustomRolls } from "./modules/custom-rolls.js";
import { initActionEditors } from "./modules/action-editors.js";
import { initMacroGenerator } from "./modules/macro-generator.js";
import { initCoreSettings } from "./modules/core-settings.js";

// Global namespace initializations (legacy compatibility)
window.CustomRolls = window.CustomRolls || {};

// Persistent Profile Storage Registration
function registerCustomRollProfilesSetting() {
  if (!game.settings.settings.has("world.customRollProfiles")) {
    game.settings.register("world", "customRollProfiles", {
      name: "Custom Roll Profiles",
      hint: "Stores weapon, spell, and D20 configurations decoupled from actor documents.",
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });
  }
}

// -----------------------------------------------------------------------------
// Hook: init
// -----------------------------------------------------------------------------
Hooks.once("init", () => {
  registerSettings();

  // Expose module public API
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      renderTokenAcBadge,
      getGlobalShowAC,
      postStatCard
    };
  }
});

// -----------------------------------------------------------------------------
// Hook: setup
// -----------------------------------------------------------------------------
Hooks.once("setup", () => {
  registerCustomRollProfilesSetting();
  initStatCard();
  initializeFeatures();
});

// -----------------------------------------------------------------------------
// Hook: ready - Custom Keybindings
// -----------------------------------------------------------------------------
Hooks.once("ready", async () => {
  // Only execute for GM if the setting is enabled
  if (!game.user.isGM || !game.settings.get(MODULE_ID, SETTINGS.FEATURES.APPLY_CUSTOM_KEYBINDINGS)) return;

  const actionsToClear = [
    // Elevation (defaults: Q and E)
    "ascend",
    "descend",

    // Orthogonal Panning
    "panUp",
    "panLeft",
    "panDown",
    "panRight",

    // Diagonal Panning (Numpad 1, 3, 7, 9)
    "panUpLeft",
    "panUpRight",
    "panDownLeft",
    "panDownRight"
  ];

  const macroPageAssignments = [
    { action: "swapMacroPage1", key: "Numpad1" },
    { action: "swapMacroPage2", key: "Numpad2" },
    { action: "swapMacroPage3", key: "Numpad3" },
    { action: "swapMacroPage4", key: "Numpad4" },
    { action: "swapMacroPage5", key: "Numpad5" }
  ];

  try {
    // 1. Clear Q, E, and pan actions (skip if already empty)
    for (const action of actionsToClear) {
      const current = game.keybindings.get("core", action) || [];
      if (current.length > 0) {
        await game.keybindings.set("core", action, []);
      }
    }

    // 2. Reassign Numpad 1-5 to Hotbar macro pages (skip if already matching)
    for (const { action, key } of macroPageAssignments) {
      const current = game.keybindings.get("core", action) || [];
      const isAlreadySet = current.length === 1 && current[0].key === key && (!current[0].modifiers || current[0].modifiers.length === 0);
      if (!isAlreadySet) {
        await game.keybindings.set("core", action, [{ key, modifiers: [] }]);
      }
    }

    console.log(`${MODULE_ID} | Navigation cleared and Numpad 1-5 macro pages applied (GM only).`);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to apply keybind modifications:`, err);
  }
});

// -----------------------------------------------------------------------------
// Orchestration & Feature Initializations
// -----------------------------------------------------------------------------
function initializeFeatures() {
  if (game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_AC)) {
    initTokenAc();
  }

  if (game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_HUD)) {
    initTokenHud();
  }

  if (game.settings.get(MODULE_ID, SETTINGS.FEATURES.ELEVATION_CONTROL)) {
    initElevation();
  }

  if (game.settings.get(MODULE_ID, SETTINGS.FEATURES.SOCKET_HANDLERS)) {
    initSockets();
  }

  if (game.settings.get(MODULE_ID, SETTINGS.FEATURES.CUSTOM_ROLLS)) {
    initCustomRolls();
  }

  if (game.settings.get(MODULE_ID, SETTINGS.FEATURES.PRESET_EDITORS)) {
    initActionEditors();
  }

  if (game.settings.get(MODULE_ID, SETTINGS.FEATURES.MACRO_GENERATOR)) {
    initMacroGenerator();
  }

  if (game.settings.get(MODULE_ID, SETTINGS.FEATURES.CORE_SETTINGS_ENFORCER)) {
    initCoreSettings();
  }
}

