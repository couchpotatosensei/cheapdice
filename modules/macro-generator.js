// =============================================================================
// CHEAP DICE MACRO GENERATOR
// Automated upsert, folder creation, and GM hotbar configuration
// =============================================================================

import { MODULE_ID } from "../src/constants.js";

/**
 * All 13 module macros.
 */
const MODULE_MACROS = [
  {
    name: "Token Control Hotkey",
    type: "script",
    img: "icons/svg/mystery-man.svg",
    command: `const closeTilePickers = () => {
  if (foundry.applications?.instances) {
    for (const app of foundry.applications.instances.values()) {
      const isFilePicker = app instanceof foundry.applications.apps.FilePicker || app.constructor?.name === "FilePicker";
      const isTileMode = app.options?.displayMode === "tiles" || app.options?.classes?.includes("tiles");
      if (isFilePicker && isTileMode) app.close();
    }
  }
  if (ui.windows) {
    for (const app of Object.values(ui.windows)) {
      if (app instanceof FilePicker && app.options?.displayMode === "tiles") app.close();
    }
  }
};
closeTilePickers();
game.user.targets.forEach(token => token.setTarget(false, { releaseOthers: false }));
canvas.tokens.releaseAll();
canvas.tokens.activate({ tool: "select" });
ui.controls.initialize({ control: "token", tool: "select" });`
  },
  {
    name: "Tile Browser",
    type: "script",
    img: "icons/svg/barrel.svg",
    command: `canvas.tiles.activate({ tool: "select" });
ui.controls.initialize({ control: "tiles", tool: "select" });
Object.values(ui.windows).forEach(app => {
  if (app instanceof FilePicker && app.options.displayMode === "tiles") app.close();
});
const picker = new FilePicker({
  type: "imagevideo",
  displayMode: "tiles",
  tileSize: canvas.grid.size,
  callback: () => canvas.tiles.activate()
});
picker.render(true);`
  },
  {
    name: "Lighting Script",
    type: "script",
    img: "icons/svg/light.svg",
    command: `const current = canvas.scene.environment?.darknessLevel ?? canvas.scene.darkness ?? 0;
new Dialog({
  title: "Adjust Scene Darkness",
  content: \`
    <form style="display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">
      <label>Darkness Level (0 = Bright Day, 1 = Pitch Night):</label>
      <input type="range" id="darkness-slider" name="slider" min="0" max="1" step="0.05" value="\${current}" 
             oninput="this.nextElementSibling.value = this.value">
      <output style="text-align:center; font-weight:bold;">\${current}</output>
    </form>
  \`,
  buttons: {
    apply: {
      icon: '<i class="fas fa-sun"></i>',
      label: "Set Lighting",
      callback: async (html) => {
        const val = parseFloat(html.find("#darkness-slider").val());
        if (canvas.scene.environment?.darknessLevel !== undefined) {
          await canvas.scene.update({ "environment.darknessLevel": val });
        } else {
          await canvas.scene.update({ darkness: val });
        }
      }
    },
    cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
  },
  default: "apply"
}).render(true);`
  },
  {
    name: "Actor (Shared) Browser",
    type: "script",
    img: "icons/svg/paralysis.svg",
    command: `const pack = game.packs.find(p => p.title === "Actors (Shared)" || p.metadata.label === "Actors (Shared)");
if (!pack) ui.notifications.warn("Compendium 'Actors (Shared)' not found.");
else pack.render(true, { focus: true });`
  },
  {
    name: "Monsters (Shared) Browser",
    type: "script",
    img: "icons/svg/pawprint.svg",
    command: `const pack = game.packs.find(p => p.title === "Monsters (Shared)" || p.metadata.label === "Monsters (Shared)");
if (!pack) ui.notifications.warn("Compendium 'Monsters (Shared)' not found.");
else pack.render(true, { focus: true });`
  },
  {
    name: "Scene (Shared) Browser",
    type: "script",
    img: "icons/svg/mountain.svg",
    command: `const COMPENDIUM_ID = "forge-vtt-shared-compendiums-double-nats-updater.scene-1-scenes";
const pack = game.packs.get(COMPENDIUM_ID);
if (!pack) {
  ui.notifications.warn(\`Compendium "\${COMPENDIUM_ID}" not found. Ensure the module is enabled.\`);
} else {
  pack.render(true, { focus: true });
}`
  },
  {
    name: "Macros (Shared) Browser",
    type: "script",
    img: "icons/svg/lever.svg",
    command: `const pack = game.packs.find(p => p.title === "Macros (Shared)" || p.metadata.label === "Macros (Shared)");
if (!pack) ui.notifications.warn("Compendium 'Macros (Shared)' not found.");
else pack.render(true, { focus: true });`
  },
  {
    name: "Roll D20 (V2)",
    type: "script",
    img: "docs/assets/fvtt.png",
    command: `window.CustomRolls?.openD20DialogV2();`
  },
  {
    name: "D20 Editor V2",
    type: "script",
    img: "icons/svg/clockwork.svg",
    command: `window.CustomRolls?.openD20PresetEditorV2();`
  },
  {
    name: "Weapon/Spell List",
    type: "script",
    img: "icons/logo-scifi.png",
    command: `window.CustomRolls?.openActionDialog();`
  },
  {
    name: "Edit Attacks/Spells",
    type: "script",
    img: "icons/svg/book.svg",
    command: `window.CustomRolls?.openActionEditor();`
  },
  {
    name: "Attack Roll Generator v14",
    type: "script",
    img: "icons/tools/smithing/anvil.webp",
    command: `window.CustomRolls?.openActionGenerator();`
  },
  {
    name: "Storage Inspector",
    type: "script",
    img: "icons/commodities/tech/cog-gear-steel-glass.webp",
    command: `(async () => {
  const store = foundry.utils.deepClone(game.settings.get("world", "customRollProfiles") || {});
  const actorIds = Object.keys(store);
  if (actorIds.length === 0) return ui.notifications.info("Persistent storage is currently empty.");

  function renderInspector() {
    let sectionsHtml = "";
    for (const actorId of Object.keys(store)) {
      const data = store[actorId];
      const actorName = data._actorName || game.actors.get(actorId)?.name || actorId;
      const weapons = Object.keys(data.attackConfigs || {});
      const spells = Object.keys(data.spellConfigs || {});
      const d20 = Object.keys(data.d20Profiles || {});
      const quick = Object.keys(data.quickMacroProfiles || {});

      const buildItemList = (catKey, items) => {
        if (!items.length) return \`<div style="color: #888; font-size: 0.8em; margin-left: 10px;">None</div>\`;
        return items.map(item => {
          const displayLabel = catKey === "quickMacroProfiles" ? (data[catKey]?.[item]?.chatCardTitle || data[catKey]?.[item]?.macroName || item) : item;
          return \`
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 6px; margin: 2px 0 2px 10px; background: #fff; border: 1px solid #ddd; border-radius: 3px; font-size: 0.82em;">
              <span>\${displayLabel}</span>
              <button type="button" class="del-item-btn" data-actor="\${actorId}" data-cat="\${catKey}" data-item="\${item}" style="width: auto; height: 20px; line-height: 18px; padding: 0 5px; color: #a33; border: none; background: transparent; cursor: pointer;">
                <i class="fas fa-trash"></i>
              </button>
            </div>\`;
        }).join("");
      };

      sectionsHtml += \`
        <div style="border: 1px solid #ccc; border-radius: 5px; margin-bottom: 10px; background: #fafafa; padding: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #bbb; padding-bottom: 4px; margin-bottom: 6px;">
            <strong style="color: #2b3a4a; font-size: 0.95em;">\${actorName}</strong>
            <button type="button" class="del-actor-btn" data-actor="\${actorId}" style="height: 22px; line-height: 20px; padding: 0 6px; font-size: 0.75em; color: #fff; background: #a33; border: 1px solid #722; border-radius: 3px; cursor: pointer;">
              Wipe Actor Storage
            </button>
          </div>
          <div style="font-weight: 600; font-size: 0.8em; color: #4b5d88; margin-top: 4px;">WEAPONS (\${weapons.length})</div>
          \${buildItemList("attackConfigs", weapons)}
          <div style="font-weight: 600; font-size: 0.8em; color: #4b5d88; margin-top: 6px;">SPELLS (\${spells.length})</div>
          \${buildItemList("spellConfigs", spells)}
          <div style="font-weight: 600; font-size: 0.8em; color: #4b5d88; margin-top: 6px;">D20 PRESETS (\${d20.length})</div>
          \${buildItemList("d20Profiles", d20)}
          <div style="font-weight: 600; font-size: 0.8em; color: #c9510c; margin-top: 6px;">QUICK MACROS (\${quick.length})</div>
          \${buildItemList("quickMacroProfiles", quick)}
        </div>\`;
    }

    const d = new Dialog({
      title: "Persistent Storage Inspector",
      content: \`<div style="max-height: 480px; overflow-y: auto; padding-right: 4px;">\${sectionsHtml}</div>\`,
      buttons: { close: { label: "Done" } },
      render: (html) => {
        html.find('.del-item-btn').on('click', async (e) => {
          const aId = $(e.currentTarget).data('actor');
          const cat = $(e.currentTarget).data('cat');
          const item = $(e.currentTarget).data('item');
          if (cat === "quickMacroProfiles") {
            const macroData = store[aId]?.[cat]?.[item];
            const targetName = macroData?.chatCardTitle || macroData?.macroName;
            if (targetName) {
              const m = game.macros.find(macro => macro.name === targetName);
              if (m) await m.delete();
            }
          }
          delete store[aId][cat][item];
          await game.settings.set("world", "customRollProfiles", store);
          ui.notifications.info(\`Removed "\${item}" from storage.\`);
          d.close();
          renderInspector();
        });
        html.find('.del-actor-btn').on('click', async (e) => {
          const aId = $(e.currentTarget).data('actor');
          const confirmed = await Dialog.confirm({ title: "Confirm Wipe", content: "<p>Delete ALL persistent data for this actor?</p>" });
          if (confirmed) {
            delete store[aId];
            await game.settings.set("world", "customRollProfiles", store);
            ui.notifications.warn("Actor profile deleted.");
            d.close();
            renderInspector();
          }
        });
      }
    }, { width: 420, height: "auto" });
    d.render(true);
  }
  renderInspector();
})();`
  }
];

/**
 * Generates or updates world macros and maps them to the GM hotbar.
 */
export async function generateModuleMacros({ forceHotbar = false } = {}) {
  if (!game.user.isGM) return;

  const FOLDER_NAME = "Cheap Dice Macros";

  // 1. Locate or create destination folder
  let folder = game.folders.find((f) => f.name === FOLDER_NAME && f.type === "Macro");
  if (!folder) {
    folder = await Folder.create({
      name: FOLDER_NAME,
      type: "Macro",
      color: "#4a525d"
    });
  }

  // 2. Upsert macros and build quick-lookup map by name
  const macroMap = new Map();

  for (const macroData of MODULE_MACROS) {
    const existing = game.macros.find(
      (m) =>
        (m.name === macroData.name && m.folder?.id === folder.id) ||
        (m.getFlag(MODULE_ID, "isGeneratedMacro") === true && m.name === macroData.name)
    );

    const payload = {
      ...macroData,
      folder: folder.id,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
      flags: { [MODULE_ID]: { isGeneratedMacro: true } }
    };

    if (existing) {
      await existing.update(payload);
      macroMap.set(macroData.name, existing);
    } else {
      const created = await Macro.create(payload);
      macroMap.set(macroData.name, created);
    }
  }

  // 3. Assign slots on Hotbar Page 1 and Page 2 (run once unless forced)
  const isConfigured = game.user.getFlag(MODULE_ID, "hotbarConfigured");
  if (!isConfigured || forceHotbar) {
    const hotbarSlotPlan = {
      // Hotbar Page 1
      1: "Token Control Hotkey",
      3: "Tile Browser",
      4: "Lighting Script",
      5: "Actor (Shared) Browser",
      6: "Monsters (Shared) Browser",
      7: "Scene (Shared) Browser",
      8: "Macros (Shared) Browser",

      // Hotbar Page 2 (Slots 11-20)
      11: "Roll D20 (V2)",
      12: "D20 Editor V2",
      13: "Weapon/Spell List",
      14: "Edit Attacks/Spells",
      15: "Attack Roll Generator v14",
      16: "Storage Inspector"
    };

    const hotbarUpdates = {};
    for (const [slot, macroName] of Object.entries(hotbarSlotPlan)) {
      const macroDoc = macroMap.get(macroName);
      if (macroDoc) {
        hotbarUpdates[`hotbar.${slot}`] = macroDoc.id;
      }
    }

    await game.user.update(hotbarUpdates);
    await game.user.setFlag(MODULE_ID, "hotbarConfigured", true);
    ui.notifications.info("Cheap Dice Macros assigned to Hotbar Page 1 and Page 2.");
  }
}

/**
 * Initialization hook entry point.
 */
export function initMacroGenerator() {
  if (!game.user.isGM) return;
  generateModuleMacros();
}
