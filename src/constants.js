// =============================================================================
// CHEAP DICE: CONSTANTS & ENUMS
// =============================================================================

export const MODULE_ID = "cheapdice";

export const FLAGS = Object.freeze({
  SHOW_AC: "showAC",
  HUD_ASSIGNED_SLOTS: "hudAssignedSlots",
  SPELL_CONFIGS: "spellConfigs",
  ATTACK_CONFIGS: "attackConfigs",
  D20_PROFILES: "d20ProfilesV2"
});

export const SETTINGS = Object.freeze({
  GLOBAL_SHOW_AC: "globalShowAC",
  CUSTOM_ROLL_PROFILES: "customRollProfiles",
  FEATURES: Object.freeze({
    TOKEN_AC: "featureTokenAc",
    TOKEN_HUD: "featureTokenHud",
    ELEVATION_CONTROL: "featureElevationControl",
    CUSTOM_ROLLS: "featureCustomRolls",
    PRESET_EDITORS: "featurePresetEditors",
    SOCKET_HANDLERS: "featureSocketHandlers",
    ANIMATIONS: "featureAnimations",
    MACRO_GENERATOR: "enableMacroGenerator",
    CORE_SETTINGS_ENFORCER: "coreSettingsEnforcer",
    APPLY_CUSTOM_KEYBINDINGS: "applyCustomKeybindings"
  })
});
