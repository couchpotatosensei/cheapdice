// =============================================================================
// CHEAP DICE: SETTINGS REGISTRATION
// =============================================================================

import { MODULE_ID, SETTINGS } from "../src/constants.js";
import { generateModuleMacros } from "../modules/macro-generator.js";

export function registerSettings() {
  const registerFeature = (key, name, hint, requiresReload = true) => {
    game.settings.register(MODULE_ID, key, {
      name: `[Feature] ${name}`,
      hint,
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload
    });
  };

  // ---------------------------------------------------------------------------
  // Feature Toggles
  // ---------------------------------------------------------------------------
  registerFeature(SETTINGS.FEATURES.TOKEN_AC, "Token AC Badges & Controls", "Enables token AC canvas badges and master/per-token controls.");
  registerFeature(SETTINGS.FEATURES.TOKEN_HUD, "Token HUD Enhancements", "Enables custom Token HUD buttons, status effect enhancements, and flyout menus.");
  registerFeature(SETTINGS.FEATURES.ELEVATION_CONTROL, "Elevation & Speed Controls", "Enables player elevation restrictions on token movement.");
  registerFeature(SETTINGS.FEATURES.CUSTOM_ROLLS, "Custom Roll Dialogs", "Enables D20, Attack, Spell, and Action dialog launchers.");
  registerFeature(SETTINGS.FEATURES.PRESET_EDITORS, "Preset & Action Editors", "Enables D20 preset editors and Action Builder/Generator tools.");
  registerFeature(SETTINGS.FEATURES.SOCKET_HANDLERS, "SocketLib Remote Handlers", "Enables SocketLib registration for automated combat and timer broadcasts.");
  registerFeature(SETTINGS.FEATURES.ANIMATIONS, "Automated Animations & Sequencer", "Enables Sequencer and Automated Animations integrations.");

  // Master Token AC Visibility Toggle (Internal State)
  game.settings.register(MODULE_ID, SETTINGS.GLOBAL_SHOW_AC, {
    name: "Master AC Display",
    hint: "Globally display AC badges above tokens.",
    scope: "world",
    config: false,
    type: Boolean,
    default: false,
    onChange: () => {
      canvas.tokens?.placeables.forEach((t) => {
        const api = game.modules.get(MODULE_ID)?.api;
        if (api?.renderTokenAcBadge) api.renderTokenAcBadge(t);
      });
    }
  });

  // Macro Generator
  game.settings.register(MODULE_ID, SETTINGS.FEATURES.MACRO_GENERATOR, {
    name: "[Feature] Macro Generator",
    hint: "Automatically creates and updates module utility macros in the world macro directory.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false,
    onChange: async (value) => {
      if (value && game.user.isGM) {
        if (typeof generateModuleMacros === "function") {
          await generateModuleMacros({ forceHotbar: true });
        }
      }
    }
  });

  // Core Settings Enforcer
  game.settings.register(MODULE_ID, SETTINGS.FEATURES.CORE_SETTINGS_ENFORCER, {
    name: "Enforce Core Settings",
    hint: "Automatically sets preferred Foundry VTT core and system configurations upon GM login.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });

  // Custom Keybindings
  game.settings.register(MODULE_ID, SETTINGS.FEATURES.APPLY_CUSTOM_KEYBINDINGS, {
    name: "Enforce Custom Keybinds",
    hint: "Automatically overrides default core keybinds and unbinds unwanted keys on launch.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });
}
