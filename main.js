// =============================================================================
// TAM'S WORLD SCRIPT
// Entry point / Orchestrator
// =============================================================================

import { registerSettings } from "./scripts/settings.js";
import { initTokenAc } from "./modules/token-ac.js";
import { initTokenHud } from "./modules/token-hud.js";
import { initElevation } from "./modules/elevation.js";
import { initSockets } from "./modules/socket-handlers.js";
import { initCustomRolls } from "./modules/custom-rolls.js";
import { initActionEditors } from "./modules/action-editors.js";

// Global namespace initializations
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
});

// -----------------------------------------------------------------------------
// Hook: setup
// -----------------------------------------------------------------------------
if (game.settings) {
  registerCustomRollProfilesSetting();
} else {
  Hooks.once("setup", registerCustomRollProfilesSetting);
}

// -----------------------------------------------------------------------------
// Orchestration & Feature Initializations
// -----------------------------------------------------------------------------
function initializeFeatures() {
  if (game.settings.get("cheapdice", "featureTokenAc")) {
    initTokenAc();
  }

  if (game.settings.get("cheapdice", "featureTokenHud")) {
    initTokenHud();
  }

  if (game.settings.get("cheapdice", "featureElevationControl")) {
    initElevation();
  }

  if (game.settings.get("cheapdice", "featureSocketHandlers")) {
    initSockets();
  }

  if (game.settings.get("cheapdice", "featureCustomRolls")) {
    initCustomRolls();
  }

  if (game.settings.get("cheapdice", "featurePresetEditors")) {
    initActionEditors();
  }
}

Hooks.once("setup", () => {
  initializeFeatures();
});
