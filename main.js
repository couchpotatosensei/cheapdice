// =============================================================================
// TAM'S WORLD SCRIPT
// Entry point / Orchestrator
// =============================================================================

import { MODULE_ID, SETTINGS } from "./src/constants.js";
import { registerSettings } from "./scripts/settings.js";
import { initTokenAc, renderTokenAcBadge, getGlobalShowAC } from "./modules/token-ac.js";
import { initTokenHud } from "./modules/token-hud.js";
import { initElevation } from "./modules/elevation.js";
import { initSockets } from "./modules/socket-handlers.js";
import { initCustomRolls } from "./modules/custom-rolls.js";
import { initActionEditors } from "./modules/action-editors.js";

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
      getGlobalShowAC
    };
  }
});

// -----------------------------------------------------------------------------
// Hook: setup
// -----------------------------------------------------------------------------
Hooks.once("setup", () => {
  registerCustomRollProfilesSetting();
  initializeFeatures();
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
}

