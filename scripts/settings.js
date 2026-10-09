import { MODULE_ID, SETTINGS } from "../src/constants.js";

export function registerSettings() {
  const registerFeature = (key, name, hint) => {
    game.settings.register(MODULE_ID, key, {
      name: `[Feature] ${name}`,
      hint: hint,
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      requiresReload: true
    });
  };

  registerFeature(SETTINGS.FEATURES.TOKEN_AC, "Token AC Badges & Controls", "Enables token AC canvas badges and master/per-token controls.");
  registerFeature(SETTINGS.FEATURES.TOKEN_HUD, "Token HUD Enhancements", "Enables custom Token HUD buttons, status effect enhancements, and flyout menus.");
  registerFeature(SETTINGS.FEATURES.ELEVATION_CONTROL, "Elevation & Speed Controls", "Enables player elevation restrictions on token movement.");
  registerFeature(SETTINGS.FEATURES.CUSTOM_ROLLS, "Custom Roll Dialogs", "Enables D20, Attack, Spell, and Action dialog launchers.");
  registerFeature(SETTINGS.FEATURES.PRESET_EDITORS, "Preset & Action Editors", "Enables D20 preset editors and Action Builder/Generator tools.");
  registerFeature(SETTINGS.FEATURES.SOCKET_HANDLERS, "SocketLib Remote Handlers", "Enables SocketLib registration for automated combat and timer broadcasts.");
  registerFeature(SETTINGS.FEATURES.ANIMATIONS, "Automated Animations & Sequencer", "Enables Sequencer and Automated Animations integrations.");

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
        const { generateModuleMacros } = await import("../modules/macro-generator.js");
        generateModuleMacros({ forceHotbar: true });
      }
    }
  });
}

