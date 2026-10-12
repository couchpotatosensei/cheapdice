// =============================================================================
// CHEAP DICE / TAM'S WORLD SCRIPT
// Entry point / Orchestrator
// =============================================================================

import { MODULE_ID, SETTINGS } from "./src/constants.js";
import { registerSettings } from "./scripts/settings.js";
import { initTokenAc, renderTokenAcBadge, getGlobalShowAC } from "./modules/token-ac.js";
import { initStatCard, postStatCard } from "./modules/stat-card.js";
import { initTokenHud } from "./modules/token-hud.js";
import { initElevation, setRegionElevation } from "./modules/elevation.js";
import { initSockets } from "./modules/socket-handlers.js";
import { initCustomRolls } from "./modules/custom-rolls.js";
import { initActionEditors } from "./modules/action-editors.js";
import { initMacroGenerator } from "./modules/macro-generator.js";
import { initCoreSettings } from "./modules/core-settings.js";

// Global namespace with backwards compatibility for existing hotbar macros
window.CustomRolls = window.CustomRolls || {};

// -----------------------------------------------------------------------------
// Hook: init
// -----------------------------------------------------------------------------
Hooks.once("init", () => {
  registerSettings();
  registerCustomRollProfilesSetting();

  // Expose module public API cleanly under the module instance
  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      renderTokenAcBadge,
      getGlobalShowAC,
      postStatCard,
      setRegionElevation,
      customRolls: window.CustomRolls
    };
  }
});

// -----------------------------------------------------------------------------
// Hook: setup
// -----------------------------------------------------------------------------
Hooks.once("setup", () => {
  initStatCard();
  initializeFeatures();
});

// -----------------------------------------------------------------------------
// Hook: ready
// -----------------------------------------------------------------------------
Hooks.once("ready", async () => {
  if (game.user.isGM && game.settings.get(MODULE_ID, SETTINGS.FEATURES.APPLY_CUSTOM_KEYBINDINGS)) {
    await applyCustomKeybindings();
  }
});

// -----------------------------------------------------------------------------
// Settings Registration
// -----------------------------------------------------------------------------
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
// Orchestration & Feature Initializations
// -----------------------------------------------------------------------------
function initializeFeatures() {
  const getSetting = (settingKey) => game.settings.get(MODULE_ID, settingKey);

  if (getSetting(SETTINGS.FEATURES.SOCKET_HANDLERS)) initSockets();
  if (getSetting(SETTINGS.FEATURES.CORE_SETTINGS_ENFORCER)) initCoreSettings();
  if (getSetting(SETTINGS.FEATURES.CUSTOM_ROLLS)) initCustomRolls();
  if (getSetting(SETTINGS.FEATURES.PRESET_EDITORS)) initActionEditors();
  if (getSetting(SETTINGS.FEATURES.MACRO_GENERATOR)) initMacroGenerator();
  if (getSetting(SETTINGS.FEATURES.TOKEN_AC)) initTokenAc();
  if (getSetting(SETTINGS.FEATURES.TOKEN_HUD)) initTokenHud();
  if (getSetting(SETTINGS.FEATURES.ELEVATION_CONTROL)) initElevation();
}

// -----------------------------------------------------------------------------
// Keybinding Helpers
// -----------------------------------------------------------------------------
async function applyCustomKeybindings() {
  const actionsToClear = [
    "ascend", "descend",
    "panUp", "panLeft", "panDown", "panRight",
    "panUpLeft", "panUpRight", "panDownLeft", "panDownRight"
  ];

  const macroPageAssignments = [
    { action: "swapMacroPage1", key: "Numpad1" },
    { action: "swapMacroPage2", key: "Numpad2" },
    { action: "swapMacroPage3", key: "Numpad3" },
    { action: "swapMacroPage4", key: "Numpad4" },
    { action: "swapMacroPage5", key: "Numpad5" }
  ];

  try {
    for (const action of actionsToClear) {
      const current = game.keybindings.get("core", action) ?? [];
      if (current.length > 0) {
        await game.keybindings.set("core", action, []);
      }
    }

    for (const { action, key } of macroPageAssignments) {
      const current = game.keybindings.get("core", action) ?? [];
      const isAlreadySet = current.length === 1 && current[0].key === key && (!current[0].modifiers || current[0].modifiers.length === 0);
      if (!isAlreadySet) {
        await game.keybindings.set("core", action, [{ key, modifiers: [] }]);
      }
    }

    console.log(`${MODULE_ID} | Navigation cleared and Numpad 1-5 macro pages applied (GM only).`);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to apply keybind modifications:`, err);
  }
}
