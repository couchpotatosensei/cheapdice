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
  registerFeature(SETTINGS.FEATURES.CHAT_CONTROLS, "Chat Mode Controls (IC / EM)", "Adds In-Character (/ic) and Emote (/em) toggles above the chat box.");
  registerFeature(SETTINGS.FEATURES.DICE_TRAY, "Dice Tray Copycat", "Adds a dedicated dice tray below the chat input with advantage/disadvantage, modifiers, and recent rolls.");
  registerFeature(SETTINGS.FEATURES.DDB_LISTENER, "D&D Beyond Game Log Listener", "Connects to your D&D Beyond campaign Game Log and renders rolls using Cheap Dice custom chat cards.");

  // ---------------------------------------------------------------------------
  // D&D Beyond Game Log Configuration (GM Only)
  // ---------------------------------------------------------------------------
  game.settings.register(MODULE_ID, SETTINGS.DDB_CAMPAIGN_ID, {
    name: "DDB Campaign ID(s)",
    hint: "Numeric Campaign ID (or comma-separated list of IDs/URLs, e.g. 1234567, 7654321) from your D&D Beyond campaign URL(s).",
    scope: "world",
    config: true,
    type: String,
    default: "",
    requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.DDB_USER_ID, {
    name: "DDB User ID",
    hint: "Your numeric D&D Beyond User ID (optional unless required by direct WebSocket auth).",
    scope: "world",
    config: true,
    type: String,
    default: "",
    requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.DDB_COBALT_TOKEN, {
    name: "DDB Cobalt Token / STT",
    hint: "Your D&D Beyond CobaltSession cookie or Short-Term Token (used by the GM client to authenticate).",
    scope: "client",
    config: true,
    type: String,
    default: "",
    requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.DDB_COBALT_COOKIE, {
    name: "DDB CobaltSession Cookie (Slot Sync)",
    hint: "Long-lived CobaltSession cookie from D&D Beyond for Spell Slot Sync (separate from the Game Log STT so Tampermonkey won't overwrite it). Falls back to ddb-importer's cookie if blank.",
    scope: "client",
    config: true,
    type: String,
    default: "",
    requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.DDB_PROXY_URL, {
    name: "DDB Auth Proxy URL (Optional)",
    hint: "Optional proxy URL for exchanging CobaltSession cookies into short-term JWTs (e.g. Cloudflare Worker or local proxy).",
    scope: "world",
    config: true,
    type: String,
    default: "",
    requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.DDB_AUTO_DAMAGE, {
    name: "DDB Auto-Roll Damage on Attack",
    hint: "When an attack roll arrives from D&D Beyond, automatically look up and roll the matching item's damage in Foundry.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: false
  });

  game.settings.register(MODULE_ID, SETTINGS.DDB_REQUIRE_DDB_IMPORTER, {
    name: "Require DDB Importer Actor",
    hint: "Only accept and post rolls for characters in this Foundry world that have been imported via D&D Beyond Importer.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: false
  });

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
