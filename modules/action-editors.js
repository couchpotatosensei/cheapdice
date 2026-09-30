// =============================================================================
// CONFIGURATION EDITORS
// =============================================================================

export function initActionEditors() {
  if (!game.settings.get("cheapdice", "featurePresetEditors")) return;

  window.CustomRolls = window.CustomRolls || {};

  window.CustomRolls.getProfileData = window.CustomRolls.getProfileData || function (actor, category) {
    if (!actor) return null;
    const store = game.settings.get("world", "customRollProfiles") || {};
    const actorStore = store[actor.id] || store[actor.name] || {};
    return actorStore[category] || null;
  };

  window.CustomRolls.setProfileData = window.CustomRolls.setProfileData || async function (actor, category, data) {
    if (!actor) return;
    const store = foundry.utils.deepClone(game.settings.get("world", "customRollProfiles") || {});
    if (!store[actor.id]) store[actor.id] = {};
    store[actor.id][category] = data;
    store[actor.id]._actorName = actor.name;
    return await game.settings.set("world", "customRollProfiles", store);
  };

  // PART 4: CONFIGURATION EDITORS
  // =============================================================================

  // --- 4.1 D20 Preset Modifier Editor Launcher ---
  window.CustomRolls.openD20PresetEditor = function () {
    if (!game.settings.get("cheapdice", "featurePresetEditors")) return;

    const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

    if (!token) {
      return ui.notifications.warn("Please select your token first.");
    }

    const actor = token.actor;
    if (!actor || !actor.isOwner) {
      return ui.notifications.warn("You don't have permissions to use this token.");
    }

    const currentProfiles = foundry.utils.deepClone(
      window.CustomRolls.getProfileData(actor, "d20Profiles") || actor.getFlag("world", "d20Profiles") || {}
    );

    const ABILITIES = {
      str: "STR",
      dex: "DEX",
      con: "CON",
      int: "INT",
      wis: "WIS",
      cha: "CHA"
    };

    const CATEGORIES = {
      skill: "Skill Check",
      tool: "Tool Check",
      check: "Ability Check"
    };

    const STANDARD_OPTIONS = [
      {
        optgroup: "Skills", options: [
          { key: "acr", label: "Acrobatics (DEX)" },
          { key: "ani", label: "Animal Handling (WIS)" },
          { key: "arc", label: "Arcana (INT)" },
          { key: "ath", label: "Athletics (STR)" },
          { key: "dec", label: "Deception (CHA)" },
          { key: "his", label: "History (INT)" },
          { key: "ins", label: "Insight (WIS)" },
          { key: "itm", label: "Intimidation (CHA)" },
          { key: "inv", label: "Investigation (INT)" },
          { key: "med", label: "Medicine (WIS)" },
          { key: "nat", label: "Nature (INT)" },
          { key: "prc", label: "Perception (WIS)" },
          { key: "prf", label: "Performance (CHA)" },
          { key: "per", label: "Persuasion (CHA)" },
          { key: "rel", label: "Religion (INT)" },
          { key: "slt", label: "Sleight of Hand (DEX)" },
          { key: "ste", label: "Stealth (DEX)" },
          { key: "sur", label: "Survival (WIS)" }
        ]
      },
      {
        optgroup: "Ability Checks", options: [
          { key: "check_str", label: "Strength Check (STR)" },
          { key: "check_dex", label: "Dexterity Check (DEX)" },
          { key: "check_con", label: "Constitution Check (CON)" },
          { key: "check_int", label: "Intelligence Check (INT)" },
          { key: "check_wis", label: "Wisdom Check (WIS)" },
          { key: "check_cha", label: "Charisma Check (CHA)" }
        ]
      },
      {
        optgroup: "Common Tools", options: [
          { key: "alchemist", label: "Alchemist Supplies" },
          { key: "brewer", label: "Brewer's Supplies" },
          { key: "calligrapher", label: "Calligrapher's Supplies" },
          { key: "carpenter", label: "Carpenter's Tools" },
          { key: "cartographer", label: "Cartographer's Tools" },
          { key: "cobbler", label: "Cobbler's Tools" },
          { key: "cook", label: "Cook's Utensils" },
          { key: "disguise", label: "Disguise Kit" },
          { key: "forgery", label: "Forgery Kit" },
          { key: "gaming", label: "Gaming Set" },
          { key: "glassblower", label: "Glassblower's Tools" },
          { key: "herbalism", label: "Herbalism Kit" },
          { key: "jeweler", label: "Jeweler's Tools" },
          { key: "leatherworker", label: "Leatherworker's Tools" },
          { key: "mason", label: "Mason's Tools" },
          { key: "musical", label: "Musical Instrument" },
          { key: "navigator", label: "Navigator's Tools" },
          { key: "painter", label: "Painter's Supplies" },
          { key: "poisoner", label: "Poisoner's Kit" },
          { key: "potter", label: "Potter's Tools" },
          { key: "smith", label: "Smith's Tools" },
          { key: "thieves", label: "Thieves' Tools" },
          { key: "tinker", label: "Tinker's Tools" },
          { key: "weaver", label: "Weaver's Tools" },
          { key: "woodcarver", label: "Woodcarver's Tools" }
        ]
      },
      {
        optgroup: "Saving Throws", options: [
          { key: "save_str", label: "Strength Save" },
          { key: "save_dex", label: "Dexterity Save" },
          { key: "save_con", label: "Constitution Save" },
          { key: "save_int", label: "Intelligence Save" },
          { key: "save_wis", label: "Wisdom Save" },
          { key: "save_cha", label: "Charisma Save" }
        ]
      }
    ];

    const getLabelForKey = (key) => {
      for (const group of STANDARD_OPTIONS) {
        const match = group.options.find(o => o.key === key);
        if (match) return match.label;
      }
      const checkMatch = STANDARD_OPTIONS.find(g => g.optgroup === "Ability Checks")?.options.find(o => o.key === `check_${key}`);
      if (checkMatch) return checkMatch.label;
      const saveMatch = STANDARD_OPTIONS.find(g => g.optgroup === "Saving Throws")?.options.find(o => o.key === `save_${key}`);
      if (saveMatch) return saveMatch.label;

      if (key.startsWith("custom_")) {
        const stored = currentProfiles[key];
        const customName = stored?.name || key.replace("custom_", "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        const customAbil = stored?.ability ? ` (${stored.ability.toUpperCase()})` : "";
        const catLabel = stored?.category ? ` [${CATEGORIES[stored.category] || stored.category}]` : "";
        return `${customName}${customAbil}${catLabel}`;
      }
      return key;
    };

    const buildSelectOptionsHtml = () => {
      let out = `<option value="">-- Choose D20 Test to Configure --</option>`;
      STANDARD_OPTIONS.forEach(grp => {
        out += `<optgroup label="${grp.optgroup}">`;
        grp.options.forEach(opt => {
          out += `<option value="${opt.key}">${opt.label}</option>`;
        });
        out += `</optgroup>`;
      });
      out += `<optgroup label="Custom">
      <option value="__create_custom__">+ Create New Custom D20 Test...</option>
    </optgroup>`;
      return out;
    };

    const buildSectionsHtml = () => {
      const keys = Object.keys(currentProfiles);
      if (keys.length === 0) {
        return `<div style="text-align: center; color: #888; font-size: 0.85em; padding: 20px 0;">No active modifier profiles configured yet for this token. Use the dropdown above to add one.</div>`;
      }

      return keys.map(k => {
        const displayLabel = getLabelForKey(k);
        const profileData = currentProfiles[k];
        const isCustom = k.startsWith("custom_");
        const presets = Array.isArray(profileData) ? profileData : (profileData.modifiers || []);
        const currentAbil = profileData?.ability || "int";
        const currentCat = profileData?.category || "skill";

        const isProficient = Boolean(profileData?.proficient);

        const customSelectorsHtml = isCustom ? `
        <label style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.75em; margin-right: 6px; cursor: pointer; color: #2b3a4a; font-weight: 600;">
          <input type="checkbox" class="custom-proficient-check" data-key="${k}" ${isProficient ? 'checked' : ''} style="margin: 0;" /> Proficient
        </label>
        <select class="custom-category-select" data-key="${k}" title="Category" style="height: 22px; font-size: 0.75em; padding: 0 4px; margin-right: 4px;">
          ${Object.entries(CATEGORIES).map(([code, name]) => `<option value="${code}" ${currentCat === code ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
        <select class="custom-ability-select" data-key="${k}" title="Ability Score" style="height: 22px; font-size: 0.75em; padding: 0 4px; margin-right: 6px;">
          ${Object.entries(ABILITIES).map(([code, name]) => `<option value="${code}" ${currentAbil === code ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
      ` : '';

        const presetsHtml = presets.map((p, idx) => `
        <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">
          <input type="text" class="preset-label" data-key="${k}" data-idx="${idx}" value="${p.label}" placeholder="Label (e.g. Scavenger Kit)" style="flex: 2; height: 26px; font-size: 0.85em;" />
          <input type="text" class="preset-formula" data-key="${k}" data-idx="${idx}" value="${p.formula}" placeholder="Formula (e.g. 1d4, 2)" style="flex: 1.2; height: 26px; font-size: 0.85em;" />
          <label style="display: flex; align-items: center; gap: 3px; font-size: 0.8em; cursor: pointer;">
            <input type="checkbox" class="preset-default" data-key="${k}" data-idx="${idx}" ${p.enabled ? 'checked' : ''} style="margin: 0;" /> Default
          </label>
          <button type="button" class="delete-preset-btn" data-key="${k}" data-idx="${idx}" title="Delete Modifier" style="width: 26px; height: 26px; line-height: 24px; padding: 0; color: #a34848; border: 1px solid #d2d7df; background: #fff; border-radius: 3px; cursor: pointer;">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `).join('');

        return `
        <div style="border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px; background: rgba(0,0,0,0.015);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 0.88em; color: #2b3a4a;">${displayLabel}</strong>
              <button type="button" class="remove-test-btn" data-key="${k}" title="Remove Entire D20 Test Profile" style="border: none; background: none; color: #999; cursor: pointer; padding: 2px 4px; font-size: 0.8em;">
                <i class="fas fa-times-circle"></i>
              </button>
            </div>
            <div style="display: flex; align-items: center;">
              ${customSelectorsHtml}
              <button type="button" class="add-preset-btn" data-key="${k}" style="font-size: 0.78em; height: 22px; line-height: 20px; padding: 0 6px; cursor: pointer;">
                <i class="fas fa-plus"></i> Add Bonus
              </button>
            </div>
          </div>
          <div id="container-${k}">
            ${presetsHtml || '<span style="font-size: 0.8em; color: #999;">No bonuses added yet.</span>'}
          </div>
        </div>
      `;
      }).join('');
    };

    const dialogHtml = `
    <div style="max-height: 520px; overflow-y: auto; padding-right: 4px; font-family: inherit;">
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px;">
        <select id="select-test-to-add" style="flex: 1; height: 28px; font-size: 0.85em;">
          ${buildSelectOptionsHtml()}
        </select>
        <button type="button" id="btn-add-test-group" style="height: 28px; padding: 0 10px; font-size: 0.85em; cursor: pointer; white-space: nowrap;">
          <i class="fas fa-plus"></i> Configure D20 Test
        </button>
      </div>

      <div id="custom-test-creator" style="display: none; flex-direction: column; gap: 6px; margin-bottom: 12px; background: #fdfaf3; border: 1px solid #d5c898; border-radius: 4px; padding: 8px 10px;">
        <span style="font-weight: 700; font-size: 0.75em; color: #6d5b1f; letter-spacing: 0.5px;">NEW CUSTOM D20 TEST</span>
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="custom-test-name" placeholder="Test Name (e.g. Scavenging)" style="flex: 1.5; min-width: 130px; height: 26px; font-size: 0.85em; padding: 2px 6px;" />
          <select id="custom-test-category" title="Roll Category" style="flex: 1; height: 26px; font-size: 0.8em; padding: 2px;">
            <option value="skill">Skill Check</option>
            <option value="tool">Tool Check</option>
            <option value="check">Ability Check</option>
          </select>
          <select id="custom-test-ability" title="Ability Score" style="width: 65px; height: 26px; font-size: 0.8em; padding: 2px;">
            ${Object.entries(ABILITIES).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}
          </select>
          <label style="display: flex; align-items: center; gap: 3px; font-size: 0.8em; cursor: pointer; color: #8d6e63; font-weight: 600;">
            <input type="checkbox" id="custom-test-proficient" style="margin: 0;" /> Proficient
          </label>
          <button type="button" id="btn-confirm-create-custom" style="height: 26px; padding: 0 10px; font-size: 0.82em; cursor: pointer; white-space: nowrap; font-weight: 600;">
            Add
          </button>
          <button type="button" id="btn-cancel-create-custom" style="height: 26px; padding: 0 8px; font-size: 0.82em; cursor: pointer; white-space: nowrap; color: #666;">
            Cancel
          </button>
        </div>
      </div>

      <div id="preset-editor-content">
        ${buildSectionsHtml()}
      </div>
    </div>
  `;

    let performSave = false;

    const d = new Dialog({
      title: `${actor.name}: D20 Modifier Presets`,
      content: dialogHtml,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save Profiles",
          callback: () => {
            performSave = true;
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "save",
      render: (html) => {
        const refreshView = () => {
          html.find('#preset-editor-content').html(buildSectionsHtml());
          bindEvents();
        };

        const syncFromInputs = () => {
          Object.keys(currentProfiles).forEach(k => {
            const isCustom = k.startsWith("custom_");
            const list = [];
            html.find(`#container-${k} > div`).each((idx, el) => {
              const label = $(el).find('.preset-label').val()?.trim() || "Bonus";
              const formula = $(el).find('.preset-formula').val()?.trim() || "0";
              const enabled = $(el).find('.preset-default').is(':checked');
              list.push({ label, formula, enabled });
            });

            if (isCustom) {
              const currentObj = currentProfiles[k] || {};
              const ability = html.find(`.custom-ability-select[data-key="${k}"]`).val() || currentObj.ability || "int";
              const category = html.find(`.custom-category-select[data-key="${k}"]`).val() || currentObj.category || "skill";
              const profEl = html.find(`.custom-proficient-check[data-key="${k}"]`);
              const proficient = profEl.length ? profEl.is(':checked') : Boolean(currentObj.proficient);
              currentProfiles[k] = {
                name: currentObj.name || k.replace("custom_", ""),
                ability: ability,
                category: category,
                proficient: proficient,
                desc: currentObj.desc || "",
                modifiers: list
              };
            } else {
              currentProfiles[k] = list;
            }
          });
        };

        const bindEvents = () => {
          html.find('#btn-add-test-group').off('click').on('click', () => {
            syncFromInputs();
            const chosenKey = html.find('#select-test-to-add').val();
            if (!chosenKey) return;

            if (chosenKey === '__create_custom__') {
              html.find('#custom-test-creator').css('display', 'flex');
              html.find('#custom-test-name').focus();
              return;
            }

            if (!currentProfiles[chosenKey]) {
              currentProfiles[chosenKey] = [];
            }
            refreshView();
          });

          html.find('#btn-confirm-create-custom').off('click').on('click', () => {
            syncFromInputs();
            const customName = html.find('#custom-test-name').val()?.trim();
            if (!customName) return;

            const chosenAbility = html.find('#custom-test-ability').val() || "int";
            const chosenCategory = html.find('#custom-test-category').val() || "skill";
            const isProf = html.find('#custom-test-proficient').is(':checked');
            const customKey = "custom_" + customName.toLowerCase().replace(/[^a-z0-9]/g, "_");

            if (!currentProfiles[customKey]) {
              currentProfiles[customKey] = {
                name: customName,
                ability: chosenAbility,
                category: chosenCategory,
                proficient: isProf,
                modifiers: []
              };
            }
            html.find('#custom-test-name').val('');
            html.find('#custom-test-proficient').prop('checked', false);
            html.find('#custom-test-creator').hide();
            refreshView();
          });

          html.find('#btn-cancel-create-custom').off('click').on('click', () => {
            html.find('#custom-test-creator').hide();
          });

          html.find('.custom-ability-select').off('change').on('change', (e) => {
            const key = $(e.currentTarget).data('key');
            if (currentProfiles[key]) {
              currentProfiles[key].ability = $(e.currentTarget).val();
            }
          });

          html.find('.custom-category-select').off('change').on('change', (e) => {
            const key = $(e.currentTarget).data('key');
            if (currentProfiles[key]) {
              currentProfiles[key].category = $(e.currentTarget).val();
            }
          });

          html.find('.custom-proficient-check').off('change').on('change', (e) => {
            const key = $(e.currentTarget).data('key');
            if (currentProfiles[key]) {
              currentProfiles[key].proficient = $(e.currentTarget).is(':checked');
            }
          });

          html.find('.remove-test-btn').off('click').on('click', (e) => {
            syncFromInputs();
            const key = $(e.currentTarget).data('key');
            delete currentProfiles[key];
            refreshView();
          });

          html.find('.add-preset-btn').off('click').on('click', (e) => {
            syncFromInputs();
            const key = $(e.currentTarget).data('key');
            const isCustom = key.startsWith("custom_");

            if (isCustom) {
              if (!currentProfiles[key]) {
                currentProfiles[key] = { name: key.replace("custom_", ""), ability: "int", category: "skill", proficient: false, modifiers: [] };
              }
              currentProfiles[key].modifiers.push({ label: "Item / Feature", formula: "1d4", enabled: true });
            } else {
              if (!currentProfiles[key]) currentProfiles[key] = [];
              currentProfiles[key].push({ label: "Item / Feature", formula: "1d4", enabled: true });
            }
            refreshView();
          });

          html.find('.delete-preset-btn').off('click').on('click', (e) => {
            syncFromInputs();
            const key = $(e.currentTarget).data('key');
            const idx = Number($(e.currentTarget).data('idx'));
            const isCustom = key.startsWith("custom_");

            if (isCustom && currentProfiles[key]?.modifiers) {
              currentProfiles[key].modifiers.splice(idx, 1);
            } else if (Array.isArray(currentProfiles[key])) {
              currentProfiles[key].splice(idx, 1);
            }
            refreshView();
          });
        };

        bindEvents();
      },
      close: async (html) => {
        if (!performSave) return;

        const finalProfiles = {};
        Object.keys(currentProfiles).forEach(k => {
          const isCustom = k.startsWith("custom_");
          const list = [];
          html.find(`#container-${k} > div`).each((idx, el) => {
            const label = $(el).find('.preset-label').val()?.trim() || "";
            const formula = $(el).find('.preset-formula').val()?.trim() || "";
            const enabled = $(el).find('.preset-default').is(':checked');
            if (label && formula) {
              list.push({ label, formula, enabled });
            }
          });

          if (isCustom) {
            const ability = html.find(`.custom-ability-select[data-key="${k}"]`).val() || currentProfiles[k]?.ability || "int";
            const category = html.find(`.custom-category-select[data-key="${k}"]`).val() || currentProfiles[k]?.category || "skill";
            const profEl = html.find(`.custom-proficient-check[data-key="${k}"]`);
            const proficient = profEl.length ? profEl.is(':checked') : Boolean(currentProfiles[k]?.proficient);
            finalProfiles[k] = {
              name: currentProfiles[k]?.name || k.replace("custom_", ""),
              ability: ability,
              category: category,
              proficient: proficient,
              modifiers: list
            };
          } else if (list.length > 0) {
            finalProfiles[k] = list;
          }
        });

        await window.CustomRolls.setProfileData(actor, "d20Profiles", finalProfiles);
        await actor.setFlag("world", "d20ProfilesV2", finalProfiles);
        ui.notifications.info(`Saved D20 presets for ${actor.name} to Persistent Storage.`);
      }
    }, { width: 560, height: "auto" });

    d.render(true);
  };



  // =========================================================================
  // VERSION 2: D20 PRESET MODIFIER EDITOR (DISTINCT V2 DIALOG THEME)
  // =========================================================================
  window.CustomRolls.openD20PresetEditorV2 = function () {
    if (!game.settings.get("cheapdice", "featurePresetEditors")) return;

    const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

    if (!token) {
      return ui.notifications.warn("Please select your token first.");
    }

    const actor = token.actor;
    if (!actor || !actor.isOwner) {
      return ui.notifications.warn("You don't have permissions to use this token.");
    }

    const currentProfiles = foundry.utils.deepClone(
      window.CustomRolls.getProfileData?.(actor, "d20ProfilesV2") || actor.getFlag("world", "d20ProfilesV2") || {}
    );

    const ABILITIES = {
      str: "STR",
      dex: "DEX",
      con: "CON",
      int: "INT",
      wis: "WIS",
      cha: "CHA"
    };

    const CATEGORIES = {
      skill: "Skill Check",
      tool: "Tool Check",
      check: "Ability Check"
    };

    const STANDARD_OPTIONS = [
      {
        optgroup: "Skills", options: [
          { key: "acr", label: "Acrobatics (DEX)" },
          { key: "ani", label: "Animal Handling (WIS)" },
          { key: "arc", label: "Arcana (INT)" },
          { key: "ath", label: "Athletics (STR)" },
          { key: "dec", label: "Deception (CHA)" },
          { key: "his", label: "History (INT)" },
          { key: "ins", label: "Insight (WIS)" },
          { key: "itm", label: "Intimidation (CHA)" },
          { key: "inv", label: "Investigation (INT)" },
          { key: "med", label: "Medicine (WIS)" },
          { key: "nat", label: "Nature (INT)" },
          { key: "prc", label: "Perception (WIS)" },
          { key: "prf", label: "Performance (CHA)" },
          { key: "per", label: "Persuasion (CHA)" },
          { key: "rel", label: "Religion (INT)" },
          { key: "slt", label: "Sleight of Hand (DEX)" },
          { key: "ste", label: "Stealth (DEX)" },
          { key: "sur", label: "Survival (WIS)" }
        ]
      },
      {
        optgroup: "Ability Checks", options: [
          { key: "check_str", label: "Strength Check (STR)" },
          { key: "check_dex", label: "Dexterity Check (DEX)" },
          { key: "check_con", label: "Constitution Check (CON)" },
          { key: "check_int", label: "Intelligence Check (INT)" },
          { key: "check_wis", label: "Wisdom Check (WIS)" },
          { key: "check_cha", label: "Charisma Check (CHA)" }
        ]
      },
      {
        optgroup: "Common Tools", options: [
          { key: "alchemist", label: "Alchemist Supplies" },
          { key: "brewer", label: "Brewer's Supplies" },
          { key: "calligrapher", label: "Calligrapher's Supplies" },
          { key: "carpenter", label: "Carpenter's Tools" },
          { key: "cartographer", label: "Cartographer's Tools" },
          { key: "cobbler", label: "Cobbler's Tools" },
          { key: "cook", label: "Cook's Utensils" },
          { key: "disguise", label: "Disguise Kit" },
          { key: "forgery", label: "Forgery Kit" },
          { key: "gaming", label: "Gaming Set" },
          { key: "glassblower", label: "Glassblower's Tools" },
          { key: "herbalism", label: "Herbalism Kit" },
          { key: "jeweler", label: "Jeweler's Tools" },
          { key: "leatherworker", label: "Leatherworker's Tools" },
          { key: "mason", label: "Mason's Tools" },
          { key: "musical", label: "Musical Instrument" },
          { key: "navigator", label: "Navigator's Tools" },
          { key: "painter", label: "Painter's Supplies" },
          { key: "poisoner", label: "Poisoner's Kit" },
          { key: "potter", label: "Potter's Tools" },
          { key: "smith", label: "Smith's Tools" },
          { key: "thieves", label: "Thieves' Tools" },
          { key: "tinker", label: "Tinker's Tools" },
          { key: "weaver", label: "Weaver's Tools" },
          { key: "woodcarver", label: "Woodcarver's Tools" }
        ]
      },
      {
        optgroup: "Saving Throws", options: [
          { key: "save_str", label: "Strength Save" },
          { key: "save_dex", label: "Dexterity Save" },
          { key: "save_con", label: "Constitution Save" },
          { key: "save_int", label: "Intelligence Save" },
          { key: "save_wis", label: "Wisdom Save" },
          { key: "save_cha", label: "Charisma Save" }
        ]
      }
    ];

    const getLabelForKey = (key) => {
      for (const group of STANDARD_OPTIONS) {
        const match = group.options.find(o => o.key === key);
        if (match) return match.label;
      }
      const checkMatch = STANDARD_OPTIONS.find(g => g.optgroup === "Ability Checks")?.options.find(o => o.key === `check_${key}`);
      if (checkMatch) return checkMatch.label;
      const saveMatch = STANDARD_OPTIONS.find(g => g.optgroup === "Saving Throws")?.options.find(o => o.key === `save_${key}`);
      if (saveMatch) return saveMatch.label;

      if (key.startsWith("custom_")) {
        const stored = currentProfiles[key];
        const customName = stored?.name || key.replace("custom_", "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        const customAbil = stored?.ability ? ` (${stored.ability.toUpperCase()})` : "";
        const catLabel = stored?.category ? ` [${CATEGORIES[stored.category] || stored.category}]` : "";
        return `${customName}${customAbil}${catLabel}`;
      }
      return key;
    };

    const buildSelectOptionsHtml = () => {
      let out = `<option value="">-- Choose D20 Test (V2) to Configure --</option>`;
      STANDARD_OPTIONS.forEach(grp => {
        out += `<optgroup label="${grp.optgroup}">`;
        grp.options.forEach(opt => {
          out += `<option value="${opt.key}">${opt.label}</option>`;
        });
        out += `</optgroup>`;
      });
      out += `<optgroup label="Custom">
      <option value="__create_custom__">+ Create New Custom D20 Test...</option>
    </optgroup>`;
      return out;
    };

    const buildSectionsHtml = () => {
      const keys = Object.keys(currentProfiles);
      if (keys.length === 0) {
        return `<div style="text-align: center; color: #888; font-size: 0.85em; padding: 20px 0;">No active V2 modifier profiles configured yet for this token. Use the dropdown above to add one.</div>`;
      }

      return keys.map(k => {
        const displayLabel = getLabelForKey(k);
        const profileData = currentProfiles[k];
        const isCustom = k.startsWith("custom_");
        const presets = Array.isArray(profileData) ? profileData : (profileData.modifiers || []);
        const currentAbil = profileData?.ability || "int";
        const currentCat = profileData?.category || "skill";

        const isProficient = Boolean(profileData?.proficient);

        const customSelectorsHtml = isCustom ? `
        <label style="display: inline-flex; align-items: center; gap: 3px; font-size: 0.75em; margin-right: 6px; cursor: pointer; color: #1a237e; font-weight: 600;">
          <input type="checkbox" class="custom-proficient-check-v2" data-key="${k}" ${isProficient ? 'checked' : ''} style="margin: 0;" /> Proficient
        </label>
        <select class="custom-category-select-v2" data-key="${k}" title="Category" style="height: 22px; font-size: 0.75em; padding: 0 4px; margin-right: 4px; border: 1px solid #7986cb; border-radius: 3px;">
          ${Object.entries(CATEGORIES).map(([code, name]) => `<option value="${code}" ${currentCat === code ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
        <select class="custom-ability-select-v2" data-key="${k}" title="Ability Score" style="height: 22px; font-size: 0.75em; padding: 0 4px; margin-right: 6px; border: 1px solid #7986cb; border-radius: 3px;">
          ${Object.entries(ABILITIES).map(([code, name]) => `<option value="${code}" ${currentAbil === code ? 'selected' : ''}>${name}</option>`).join('')}
        </select>
      ` : '';

        const presetsHtml = presets.map((p, idx) => `
        <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">
          <input type="text" class="preset-label-v2" data-key="${k}" data-idx="${idx}" value="${p.label}" placeholder="Label (e.g. Guidance)" style="flex: 2; height: 26px; font-size: 0.82em; border: 1px solid #c5cae9; border-radius: 3px; padding: 0 4px;" />
          <input type="text" class="preset-formula-v2" data-key="${k}" data-idx="${idx}" value="${p.formula}" placeholder="Formula (e.g. 1d4, 2)" style="flex: 1.2; height: 26px; font-size: 0.82em; border: 1px solid #c5cae9; border-radius: 3px; padding: 0 4px;" />
          <label style="display: flex; align-items: center; gap: 3px; font-size: 0.78em; cursor: pointer; color: #283593;">
            <input type="checkbox" class="preset-default-v2" data-key="${k}" data-idx="${idx}" ${p.enabled ? 'checked' : ''} style="margin: 0;" /> Default
          </label>
          <button type="button" class="delete-preset-btn-v2" data-key="${k}" data-idx="${idx}" title="Delete Modifier" style="width: 24px; height: 24px; line-height: 22px; padding: 0; color: #c62828; border: 1px solid #e0e0e0; background: #fff; border-radius: 3px; cursor: pointer;">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `).join('');

        return `
        <div style="border: 1px solid #c5cae9; border-left: 4px solid #3f51b5; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px; background: rgba(63, 81, 181, 0.02);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #e8eaf6; padding-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <strong style="font-size: 0.88em; color: #1a237e;">${displayLabel}</strong>
              <button type="button" class="remove-test-btn-v2" data-key="${k}" title="Remove Entire D20 Test Profile" style="border: none; background: none; color: #9fa8da; cursor: pointer; padding: 2px 4px; font-size: 0.8em;">
                <i class="fas fa-times-circle"></i>
              </button>
            </div>
            <div style="display: flex; align-items: center;">
              ${customSelectorsHtml}
              <button type="button" class="add-preset-btn-v2" data-key="${k}" style="font-size: 0.78em; height: 22px; line-height: 20px; padding: 0 6px; cursor: pointer; background: #e8eaf6; border: 1px solid #c5cae9; border-radius: 3px; color: #283593;">
                <i class="fas fa-plus"></i> Add Bonus
              </button>
            </div>
          </div>
          <div id="container-v2-${k}">
            ${presetsHtml || '<span style="font-size: 0.8em; color: #999;">No bonuses added yet.</span>'}
          </div>
        </div>
      `;
      }).join('');
    };

    const dialogHtml = `
    <div style="max-height: 540px; overflow-y: auto; padding-right: 4px; font-family: inherit;">
      
      <!-- Distinct V2 Header Banner -->
      <div style="display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #283593 0%, #3f51b5 100%); color: #fff; padding: 6px 10px; border-radius: 4px; margin-bottom: 10px;">
        <span style="font-weight: 700; font-size: 0.88em; letter-spacing: 0.5px;">D20 MODIFIER PRESETS</span>
        <span style="background: rgba(255,255,255,0.2); font-weight: 700; font-size: 0.72em; padding: 2px 6px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.35);">VERSION 2.0</span>
      </div>

      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 10px; background: rgba(63, 81, 181, 0.04); border: 1px solid #c5cae9; border-radius: 4px; padding: 6px 8px;">
        <select id="select-test-to-add-v2" style="flex: 1; height: 28px; font-size: 0.84em; border: 1px solid #9fa8da; border-radius: 3px;">
          ${buildSelectOptionsHtml()}
        </select>
        <button type="button" id="btn-add-test-group-v2" style="height: 28px; padding: 0 10px; font-size: 0.82em; font-weight: 600; cursor: pointer; white-space: nowrap; background: #3f51b5; color: #fff; border: 1px solid #303f9f; border-radius: 3px;">
          <i class="fas fa-plus"></i> Configure Test
        </button>
      </div>

      <div id="custom-test-creator-v2" style="display: none; flex-direction: column; gap: 6px; margin-bottom: 10px; background: #fff8e1; border: 1px solid #ffe082; border-radius: 4px; padding: 8px 10px;">
        <span style="font-weight: 700; font-size: 0.74em; color: #f57f17; letter-spacing: 0.5px;">NEW CUSTOM D20 TEST (V2)</span>
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="custom-test-name-v2" placeholder="Test Name (e.g. Scavenging)" style="flex: 1.5; min-width: 130px; height: 26px; font-size: 0.84em; padding: 2px 6px; border: 1px solid #ffd54f; border-radius: 3px;" />
          <select id="custom-test-category-v2" title="Roll Category" style="flex: 1; height: 26px; font-size: 0.8em; padding: 2px; border: 1px solid #ffd54f; border-radius: 3px;">
            <option value="skill">Skill Check</option>
            <option value="tool">Tool Check</option>
            <option value="check">Ability Check</option>
          </select>
          <select id="custom-test-ability-v2" title="Ability Score" style="width: 65px; height: 26px; font-size: 0.8em; padding: 2px; border: 1px solid #ffd54f; border-radius: 3px;">
            ${Object.entries(ABILITIES).map(([code, name]) => `<option value="${code}">${name}</option>`).join('')}
          </select>
          <label style="display: flex; align-items: center; gap: 3px; font-size: 0.8em; cursor: pointer; color: #d84315; font-weight: 600;">
            <input type="checkbox" id="custom-test-proficient-v2" style="margin: 0;" /> Proficient
          </label>
          <button type="button" id="btn-confirm-create-custom-v2" style="height: 26px; padding: 0 10px; font-size: 0.82em; cursor: pointer; white-space: nowrap; font-weight: 600; background: #ffa000; color: #fff; border: 1px solid #ff8f00; border-radius: 3px;">
            Add
          </button>
          <button type="button" id="btn-cancel-create-custom-v2" style="height: 26px; padding: 0 8px; font-size: 0.82em; cursor: pointer; white-space: nowrap; color: #666; border: 1px solid #ccc; background: #fff; border-radius: 3px;">
            Cancel
          </button>
        </div>
        <textarea id="custom-test-desc-v2" placeholder="Description & rules details (optional, will display in the D20 dialog)..." style="width: 100%; height: 46px; font-size: 0.8em; border: 1px solid #ffd54f; border-radius: 3px; padding: 4px; resize: vertical; box-sizing: border-box;"></textarea>
      </div>

      <div id="preset-editor-content-v2">
        ${buildSectionsHtml()}
      </div>
    </div>
  `;

    let performSave = false;

    const d = new Dialog({
      title: `[V2] ${actor.name}: D20 Modifier Presets`,
      content: dialogHtml,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save Profiles (V2)",
          callback: (dlgHtml) => {
            performSave = true;
          }
        },
        cancel: { label: "Cancel" }
      },
      default: "save",
      render: (html) => {
        const refreshView = () => {
          html.find('#preset-editor-content-v2').html(buildSectionsHtml());
          bindEvents();
        };

        const syncFromInputs = () => {
          Object.keys(currentProfiles).forEach(k => {
            const isCustom = k.startsWith("custom_");
            const list = [];
            html.find(`#container-v2-${k} > div`).each((idx, el) => {
              const label = $(el).find('.preset-label-v2').val()?.trim() || "Bonus";
              const formula = $(el).find('.preset-formula-v2').val()?.trim() || "0";
              const enabled = $(el).find('.preset-default-v2').is(':checked');
              list.push({ label, formula, enabled });
            });

            if (isCustom) {
              const currentObj = currentProfiles[k] || {};
              const ability = html.find(`.custom-ability-select-v2[data-key="${k}"]`).val() || currentObj.ability || "int";
              const category = html.find(`.custom-category-select-v2[data-key="${k}"]`).val() || currentObj.category || "skill";
              const profEl = html.find(`.custom-proficient-check-v2[data-key="${k}"]`);
              const proficient = profEl.length ? profEl.is(':checked') : Boolean(currentObj.proficient);
              currentProfiles[k] = {
                name: currentObj.name || k.replace("custom_", ""),
                ability: ability,
                category: category,
                proficient: proficient,
                desc: currentObj.desc || "",
                modifiers: list
              };
            } else {
              currentProfiles[k] = list;
            }
          });
        };

        const bindEvents = () => {
          html.find('#btn-add-test-group-v2').off('click').on('click', () => {
            syncFromInputs();
            const chosenKey = html.find('#select-test-to-add-v2').val();
            if (!chosenKey) return;

            if (chosenKey === '__create_custom__') {
              html.find('#custom-test-creator-v2').css('display', 'flex');
              html.find('#custom-test-name-v2').focus();
              return;
            }

            if (!currentProfiles[chosenKey]) {
              currentProfiles[chosenKey] = [];
            }
            refreshView();
          });

          html.find('#btn-confirm-create-custom-v2').off('click').on('click', () => {
            syncFromInputs();
            const customName = html.find('#custom-test-name-v2').val()?.trim();
            if (!customName) return;

            const chosenAbility = html.find('#custom-test-ability-v2').val() || "int";
            const chosenCategory = html.find('#custom-test-category-v2').val() || "skill";
            const isProf = html.find('#custom-test-proficient-v2').is(':checked');
            const customDesc = html.find('#custom-test-desc-v2').val()?.trim() || "";
            const customKey = "custom_" + customName.toLowerCase().replace(/[^a-z0-9]/g, "_");

            if (!currentProfiles[customKey]) {
              currentProfiles[customKey] = {
                name: customName,
                ability: chosenAbility,
                category: chosenCategory,
                proficient: isProf,
                desc: customDesc,
                modifiers: []
              };
            }
            html.find('#custom-test-name-v2').val('');
            html.find('#custom-test-desc-v2').val('');
            html.find('#custom-test-proficient-v2').prop('checked', false);
            html.find('#custom-test-creator-v2').hide();
            refreshView();
          });

          html.find('#btn-cancel-create-custom-v2').off('click').on('click', () => {
            html.find('#custom-test-creator-v2').hide();
          });

          html.find('.custom-ability-select-v2').off('change').on('change', (e) => {
            const key = $(e.currentTarget).data('key');
            if (currentProfiles[key]) {
              currentProfiles[key].ability = $(e.currentTarget).val();
            }
          });

          html.find('.custom-category-select-v2').off('change').on('change', (e) => {
            const key = $(e.currentTarget).data('key');
            if (currentProfiles[key]) {
              currentProfiles[key].category = $(e.currentTarget).val();
            }
          });

          html.find('.custom-proficient-check-v2').off('change').on('change', (e) => {
            const key = $(e.currentTarget).data('key');
            if (currentProfiles[key]) {
              currentProfiles[key].proficient = $(e.currentTarget).is(':checked');
            }
          });

          html.find('.remove-test-btn-v2').off('click').on('click', (e) => {
            syncFromInputs();
            const key = $(e.currentTarget).data('key');
            delete currentProfiles[key];
            refreshView();
          });

          html.find('.add-preset-btn-v2').off('click').on('click', (e) => {
            syncFromInputs();
            const key = $(e.currentTarget).data('key');
            const isCustom = key.startsWith("custom_");

            if (isCustom) {
              if (!currentProfiles[key]) {
                currentProfiles[key] = { name: key.replace("custom_", ""), ability: "int", category: "skill", proficient: false, modifiers: [] };
              }
              currentProfiles[key].modifiers.push({ label: "Item / Feature", formula: "1d4", enabled: true });
            } else {
              if (!currentProfiles[key]) currentProfiles[key] = [];
              currentProfiles[key].push({ label: "Item / Feature", formula: "1d4", enabled: true });
            }
            refreshView();
          });

          html.find('.delete-preset-btn-v2').off('click').on('click', (e) => {
            syncFromInputs();
            const key = $(e.currentTarget).data('key');
            const idx = Number($(e.currentTarget).data('idx'));
            const isCustom = key.startsWith("custom_");

            if (isCustom && currentProfiles[key]?.modifiers) {
              currentProfiles[key].modifiers.splice(idx, 1);
            } else if (Array.isArray(currentProfiles[key])) {
              currentProfiles[key].splice(idx, 1);
            }
            refreshView();
          });
        };

        bindEvents();
      },
      close: async (html) => {
        if (!performSave) return;

        const finalProfiles = {};
        Object.keys(currentProfiles).forEach(k => {
          const isCustom = k.startsWith("custom_");
          const list = [];
          html.find(`#container-v2-${k} > div`).each((idx, el) => {
            const label = $(el).find('.preset-label-v2').val()?.trim() || "";
            const formula = $(el).find('.preset-formula-v2').val()?.trim() || "";
            const enabled = $(el).find('.preset-default-v2').is(':checked');
            if (label && formula) {
              list.push({ label, formula, enabled });
            }
          });

          if (isCustom) {
            const ability = html.find(`.custom-ability-select-v2[data-key="${k}"]`).val() || currentProfiles[k]?.ability || "int";
            const category = html.find(`.custom-category-select-v2[data-key="${k}"]`).val() || currentProfiles[k]?.category || "skill";
            const profEl = html.find(`.custom-proficient-check-v2[data-key="${k}"]`);
            const proficient = profEl.length ? profEl.is(':checked') : Boolean(currentProfiles[k]?.proficient);
            finalProfiles[k] = {
              name: currentProfiles[k]?.name || k.replace("custom_", ""),
              ability: ability,
              category: category,
              proficient: proficient,
              desc: currentProfiles[k]?.desc || "",
              modifiers: list
            };
          } else if (list.length > 0) {
            finalProfiles[k] = list;
          }
        });

        if (window.CustomRolls.setProfileData) {
          await window.CustomRolls.setProfileData(actor, "d20ProfilesV2", finalProfiles);
        }
        await actor.setFlag("world", "d20ProfilesV2", finalProfiles);
        ui.notifications.info(`Saved D20 presets (V2) for ${actor.name}.`);
      }
    }, { width: 560, height: "auto" });

    d.render(true);
  };








  // --- 4.2 Unified Action Generator (Weapons & Spells) ---
  window.CustomRolls.openActionGenerator = async function () {
    if (!game.settings.get("cheapdice", "featurePresetEditors")) return;

    const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;
    const actor = token?.actor;
    if (!actor) {
      return ui.notifications.warn("Please select your token first.");
    }

    const DAMAGE_TYPES = [
      { label: "Acid", value: "acid" },
      { label: "Bludgeoning", value: "bludgeoning" },
      { label: "Cold", value: "cold" },
      { label: "Fire", value: "fire" },
      { label: "Force", value: "force" },
      { label: "Lightning", value: "lightning" },
      { label: "Necrotic", value: "necrotic" },
      { label: "Piercing", value: "piercing" },
      { label: "Poison", value: "poison" },
      { label: "Psychic", value: "psychic" },
      { label: "Radiant", value: "radiant" },
      { label: "Slashing", value: "slashing" },
      { label: "Thunder", value: "thunder" }
    ];

    function generateDamageTypeOptions(selectedValue = "slashing") {
      return DAMAGE_TYPES.map(t =>
        `<option value="${t.value}" ${t.value === selectedValue ? 'selected' : ''}>${t.label}</option>`
      ).join('');
    }

    // --- Weapon Generator Sub-Form ---
    function openWeaponGeneratorDialog() {
      const actorWeapons = (actor.itemTypes?.weapon || []).sort((a, b) => a.name.localeCompare(b.name));
      const weaponOptionsHtml = actorWeapons.length > 0
        ? `<option value="">-- Link to an Inventory Weapon (Optional) --</option>` + actorWeapons.map(w => `<option value="${w.id}">${w.name}</option>`).join('')
        : `<option value="">-- No weapons found in inventory --</option>`;

      const DAMAGE_COMPONENT_COUNT = 10;
      let damageComponentHTML = '';
      for (let i = 1; i <= DAMAGE_COMPONENT_COUNT; i++) {
        const defaultLabel = `Extra Damage ${i}`;
        const placeholderLabel = i === 1 ? 'Sneak Attack, etc.' :
          i === 2 ? "Hunter's Mark / Hex" :
            i === 3 ? 'Divine Smite, etc.' :
              `Component ${i}`;

        const defaultCritChecked = i === 1 || i === 3 ? 'checked' : '';
        const defaultType = i === 3 ? 'radiant' : 'slashing';

        damageComponentHTML += `
        <div class="damage-component-block" style="border: 1px solid #7289DA; padding: 8px; margin-bottom: 10px; border-radius: 4px; background: #f7f9ff;">
          <h4 style="margin: 0 0 6px 0; border-bottom: 1px dashed #7289DA; padding-bottom: 3px; font-size: 0.9em; color: #2c3e50;">Component ${i}</h4>
          <div class="form-group" style="margin-bottom: 6px;">
            <label style="font-size: 0.8em; font-weight: bold; display: block;">Dice Formula:</label>
            <input type="text" name="damage${i}_formula" value="" placeholder="e.g., 2d6+5" style="width: 100%; height: 26px; font-size: 0.85em;"/>
          </div>
          <div class="form-group" style="margin-bottom: 6px;">
            <label style="font-size: 0.8em; font-weight: bold; display: block;">Label:</label>
            <input type="text" name="damage${i}_label" value="${defaultLabel}" placeholder="${placeholderLabel}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div style="flex: 1.2;">
              <label style="font-size: 0.8em; font-weight: bold; display: block;">Type:</label>
              <select name="damage${i}_type" style="width: 100%; height: 26px; font-size: 0.85em;">
                ${generateDamageTypeOptions(defaultType)}
              </select>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 3px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75em; cursor: pointer;">
                <span>Crunchy Crit</span>
                <input type="checkbox" name="damage${i}_isCrit" ${defaultCritChecked}/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75em; cursor: pointer;">
                <span>Only on Crit</span>
                <input type="checkbox" name="damage${i}_onlyCrit"/>
              </label>
            </div>
          </div>
        </div>
      `;
      }

      const content = `
      <div class="generator-container" style="padding: 4px; font-family: inherit;">
        <div class="form-group" style="margin-bottom: 8px; background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 4px; padding: 6px;">
          <label style="font-weight: bold; display: block; font-size: 0.8em; color: #4b5d88; margin-bottom: 2px;">
            <i class="fas fa-link"></i> Link Inventory Item (for AutoAnimations):
          </label>
          <select id="sheetWeaponSelect" name="itemId" style="width: 100%; height: 28px; font-size: 0.85em; border-radius: 4px; border: 1px solid #7289da;">
            ${weaponOptionsHtml}
          </select>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <div style="flex: 1;">
            <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Action Name:</label>
            <input type="text" name="macroName" value="Attack" style="width: 100%; height: 28px; font-size: 0.9em;"/>
          </div>
          <div style="flex: 1;">
            <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Chat Card Title:</label>
            <input type="text" name="chatCardTitle" value="Attack Roll" style="width: 100%; height: 28px; font-size: 0.9em;"/>
          </div>
        </div>

        <div style="border: 1px solid #ccc; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
          <div class="tabs" style="display: flex; background: #eee; border-bottom: 1px solid #ccc;">
            <button type="button" class="tab-button active" data-tab="atk-main" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; border-right: 1px solid #ccc; background: #fff;">Base Attack</button>
            <button type="button" class="tab-button" data-tab="atk-extra" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; border-right: 1px solid #ccc; background: #eee;">Extra Damage</button>
            <button type="button" class="tab-button" data-tab="atk-misc" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; background: #eee;">Rules & Perks</button>
          </div>

          <div id="atk-main" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Ability:</label>
                <select name="abilityScore" style="width: 100%; height: 28px; font-size: 0.85em;">
                  <option value="str" selected>STR</option>
                  <option value="dex">DEX</option>
                  <option value="con">CON</option>
                  <option value="int">INT</option>
                  <option value="wis">WIS</option>
                  <option value="cha">CHA</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Damage Type:</label>
                <select name="damageType" style="width: 100%; height: 28px; font-size: 0.85em;">
                  ${generateDamageTypeOptions("slashing")}
                </select>
              </div>
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Dice Count:</label>
                <input type="number" name="damageDiceCount" value="1" min="0" placeholder="0 for flat damage" style="width: 100%; height: 28px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Die Size:</label>
                <select name="damageDieSize" style="width: 100%; height: 28px; font-size: 0.85em;">
                  <option value="none">None (Flat Dmg)</option>
                  <option value="d4">d4</option>
                  <option value="d6" selected>d6</option>
                  <option value="d8">d8</option>
                  <option value="d10">d10</option>
                  <option value="d12">d12</option>
                </select>
              </div>
            </div>
            <div style="margin-bottom: 8px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
                <span style="font-weight: 600; color: #4b5d88;">Proficient with Weapon (Adds PB)</span>
                <input type="checkbox" name="isProficient" checked style="margin: 0;"/>
              </label>
            </div>

            <hr style="margin: 8px 0; border-top: 1px solid #eee;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Weapon (+):</label>
                <input type="number" name="weaponModifier" value="0" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Atk Mod:</label>
                <input type="number" name="attackCircumstanceModifier" value="0" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Dmg Mod:</label>
                <input type="number" name="damageModifier" value="0" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
          </div>

          <div id="atk-extra" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto; display: none;">
            ${damageComponentHTML}
          </div>

          <div id="atk-misc" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto; display: none;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Crit Threshold:</label>
                <input type="number" name="CRIT_THRESHOLD" value="20" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Extra Crit Bonus:</label>
                <input type="text" name="extraCriticalBonus" value="" placeholder="e.g. 1d6 or 5" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">GWF Reroll (≤):</label>
                <input type="number" name="GWF_REROLL_THRESHOLD" value="0" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Lucky Reroll (≤):</label>
                <input type="number" name="HALFLING_LUCKY_REROLL_THRESHOLD" value="1" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #eee; padding-top: 6px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer;">
                <span>Halfling Lucky</span>
                <input type="checkbox" name="HAS_HALFLING_LUCKY"/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer;">
                <span>Elven Accuracy (Super Advantage)</span>
                <input type="checkbox" name="superAdv"/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; color: #a34848; font-weight: bold;">
                <span>Allow GWM / Sharpshooter (-5 / +10)</span>
                <input type="checkbox" name="hasGWM"/>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

      new Dialog({
        title: `Generate Weapon Attack: ${actor.name}`,
        content: content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save Attack",
            callback: async (html) => {
              const root = html[0] ?? html;
              const getVal = (name) => {
                const el = root.querySelector(`[name="${name}"]`);
                return el ? el.value : "";
              };
              const getCheck = (name) => {
                const el = root.querySelector(`[name="${name}"]`);
                return el ? el.checked : false;
              };

              const macroName = getVal("macroName").trim() || "Default Attack";
              const chatCardTitle = getVal("chatCardTitle").trim() || macroName;
              const itemId = getVal("itemId") || null;
              const abilityScore = getVal("abilityScore") || "str";
              const isProficient = getCheck("isProficient");
              const damageDiceCount = parseInt(getVal("damageDiceCount")) || 0;
              const damageDieSize = getVal("damageDieSize") || "d6";
              const damageType = getVal("damageType") || "slashing";
              const weaponModifier = parseInt(getVal("weaponModifier")) || 0;
              const attackCircumstanceModifier = parseInt(getVal("attackCircumstanceModifier")) || 0;
              const damageModifier = parseInt(getVal("damageModifier")) || 0;
              const CRIT_THRESHOLD = parseInt(getVal("CRIT_THRESHOLD")) || 20;
              const extraCriticalBonus = getVal("extraCriticalBonus").trim();
              const GWF_REROLL_THRESHOLD = parseInt(getVal("GWF_REROLL_THRESHOLD")) || 0;
              const HAS_HALFLING_LUCKY = getCheck("HAS_HALFLING_LUCKY");
              const HALFLING_LUCKY_REROLL_THRESHOLD = parseInt(getVal("HALFLING_LUCKY_REROLL_THRESHOLD")) || 0;
              const superAdv = getCheck("superAdv");
              const hasGWM = getCheck("hasGWM");

              const components = [];
              for (let i = 1; i <= DAMAGE_COMPONENT_COUNT; i++) {
                const formula = getVal(`damage${i}_formula`).trim();
                if (formula) {
                  components.push({
                    formula: formula,
                    label: getVal(`damage${i}_label`) || `Extra Damage ${i}`,
                    damageType: getVal(`damage${i}_type`) || "slashing",
                    isActive: true,
                    isCrit: getCheck(`damage${i}_isCrit`),
                    onlyCrit: getCheck(`damage${i}_onlyCrit`),
                    id: `extra_gen_${i}`
                  });
                }
              }

              const configData = {
                itemId,
                macroName, chatCardTitle, abilityScore, isProficient, damageDiceCount, damageDieSize, damageType,
                weaponModifier, attackCircumstanceModifier, damageModifier, CRIT_THRESHOLD,
                extraCriticalBonus, GWF_REROLL_THRESHOLD, HAS_HALFLING_LUCKY,
                HALFLING_LUCKY_REROLL_THRESHOLD, superAdv, hasGWM,
                additionalDamageComponents: components
              };

              const currentAttacks = foundry.utils.deepClone(
                window.CustomRolls.getProfileData(actor, "attackConfigs") ||
                actor.getFlag("world", "attackConfigs") || {}
              );
              currentAttacks[macroName] = configData;

              await window.CustomRolls.setProfileData(actor, "attackConfigs", currentAttacks);
              await actor.setFlag("world", "attackConfigs", currentAttacks, { recursive: false });
              ui.notifications.info(`Attack "${macroName}" saved to Persistent Storage.`);
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "save",
        render: (html) => {
          setTimeout(() => html.closest('.app.dialog').css({ height: "auto" }), 10);

          // Tab switching
          const tabs = html.find('.tab-button');
          const contents = html.find('.tab-content');
          tabs.on('click', function (e) {
            e.preventDefault();
            const targetTab = $(this).data('tab');
            tabs.css('background', '#eee').removeClass('active');
            $(this).css('background', '#fff').addClass('active');
            contents.hide();
            html.find(`#${targetTab}`).show();
          });

          // Autofill when a weapon is picked from the sheet
          html.find('#sheetWeaponSelect').on('change', function () {
            const weaponId = $(this).val();
            if (!weaponId) return;

            const item = actor.items.get(weaponId);
            if (!item) return;

            const sys = item.system || {};

            // Name autofill
            html.find('input[name="macroName"]').val(item.name);
            html.find('input[name="chatCardTitle"]').val(item.name);

            // Ability selection: Finesse/Ranged default to DEX if higher
            const isFinesse = Boolean(sys.properties?.has ? sys.properties.has("fin") : sys.properties?.fin);
            const isRanged = sys.actionType === "rwak";
            const strMod = actor.system.abilities?.str?.mod || 0;
            const dexMod = actor.system.abilities?.dex?.mod || 0;
            if (isRanged || (isFinesse && dexMod > strMod)) {
              html.find('select[name="abilityScore"]').val("dex");
            } else {
              html.find('select[name="abilityScore"]').val("str");
            }

            // Damage formula & type parsing (supports DND5e v3.x and legacy formats)
            let formula = "";
            let dmgType = "slashing";

            if (sys.damage?.base?.formula) {
              formula = sys.damage.base.formula;
              dmgType = sys.damage.base.types?.first?.() || sys.damage.base.types?.[0] || "slashing";
            } else if (sys.damage?.parts?.[0]) {
              formula = sys.damage.parts[0][0] || "";
              dmgType = sys.damage.parts[0][1] || "slashing";
            }

            const match = formula.match(/(\d*)d(\d+)/i);
            if (match) {
              html.find('input[name="damageDiceCount"]').val(parseInt(match[1]) || 1);
              html.find('select[name="damageDieSize"]').val(`d${match[2]}`);
            }

            if (dmgType) {
              html.find('select[name="damageType"]').val(dmgType.toLowerCase());
            }

            // Magical/masterwork bonus (+1, +2, etc.)
            if (typeof sys.magicalBonus === "number" && sys.magicalBonus !== 0) {
              html.find('input[name="weaponModifier"]').val(sys.magicalBonus);
            } else if (typeof sys.attackBonus === "number" && sys.attackBonus !== 0) {
              html.find('input[name="weaponModifier"]').val(sys.attackBonus);
            }

            // Proficiency check
            const isProf = sys.proficient !== undefined ? Boolean(sys.proficient) : true;
            html.find('input[name="isProficient"]').prop('checked', isProf);
          });
        }
      }, { width: 480, height: "auto" }).render(true);
    }

    // --- Spell Generator Sub-Form ---
    function openSpellGeneratorDialog() {
      const actorSpells = (actor.itemTypes?.spell || []).sort((a, b) => a.name.localeCompare(b.name));
      const spellOptionsHtml = actorSpells.length > 0
        ? `<option value="">-- Select a spell to autofill fields --</option>` + actorSpells.map(s => `<option value="${s.id}">${s.name} (Lvl ${s.system.level ?? 0})</option>`).join('')
        : `<option value="">-- No spells found on sheet --</option>`;

      const content = `
    <form style="padding: 5px; font-family: inherit;">
      <div class="form-group" style="margin-bottom: 8px; background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 4px; padding: 6px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em; color: #4b5d88; margin-bottom: 2px;">
          <i class="fas fa-file-import"></i> Import From Character Sheet:
        </label>
        <select id="sheetSpellSelect" name="itemId" style="width: 100%; height: 28px; font-size: 0.85em; border-radius: 4px; border: 1px solid #7289da;">
          ${spellOptionsHtml}
        </select>
      </div>

      <div class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.85em;">Spell Name:</label>
        <input type="text" name="spellName" placeholder="e.g. Scorching Ray, Fireball" style="width: 100%; height: 28px; font-size: 0.9em;" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
        <div class="form-group" style="margin: 0;">
          <label style="font-weight: bold; display: block; font-size: 0.85em;">Ability:</label>
          <select name="spellAbility" style="width: 100%; height: 28px; font-size: 0.85em;">
            <option value="int">INT</option>
            <option value="wis">WIS</option>
            <option value="cha" selected>CHA</option>
          </select>
        </div>
        <div class="form-group" style="margin: 0;">
          <label style="font-weight: bold; display: block; font-size: 0.85em;">Base Spell Level:</label>
          <select name="baseLevel" style="width: 100%; height: 28px; font-size: 0.85em;">
            <option value="0" selected>Cantrip (Level 0)</option>
            <option value="1">1st Level</option>
            <option value="2">2nd Level</option>
            <option value="3">3rd Level</option>
            <option value="4">4th Level</option>
            <option value="5">5th Level</option>
            <option value="6">6th Level</option>
            <option value="7">7th Level</option>
            <option value="8">8th Level</option>
            <option value="9">9th Level</option>
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.85em;">Resolution Method:</label>
        <select name="resolutionMethod" id="resMethodSelect" style="width: 100%; height: 28px; font-size: 0.85em;">
          <option value="attack" selected>Attack Roll (d20 vs AC)</option>
          <option value="save">Saving Throw (vs Spell DC)</option>
          <option value="auto">Automatic Hit / Projectiles (Magic Missile)</option>
          <option value="heal">Healing (Hit Point Recovery)</option>
          <option value="temp_hp">Temporary HP Grant</option>
          <option value="max_hp">Max HP Increase (Aid / Heroes' Feast)</option>
          <option value="other">Other / Utility (Summary Only)</option>
        </select>
      </div>

      <div id="multiAttackOptionsGroup" style="background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <label style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: bold; font-size: 0.85em; color: #4b5d88;">Multiple Attacks / Rays?</span>
          <input type="checkbox" name="isMultiAttack" id="isMultiAttackCheck" style="margin: 0;" />
        </label>
        <div id="multiAttackDetails" style="display: none; border-top: 1px solid rgba(114, 137, 218, 0.2); padding-top: 6px; margin-top: 4px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-size: 0.8em; font-weight: bold; display: block;">Base Attack Count:</label>
              <input type="number" name="attackCount" value="1" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
            <div>
              <label style="font-size: 0.8em; font-weight: bold; display: block;">Rays per Upcast Lvl:</label>
              <input type="number" name="upcastAttacks" value="0" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
          </div>
          <div style="margin-top: 4px;">
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
              <span>Cantrip Scaling (Eldritch Blast)?</span>
              <input type="checkbox" name="cantripAttackScaling" style="margin: 0;" />
            </label>
          </div>
        </div>
      </div>

      <div id="saveOptionsGroup" style="display: none; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Save Required:</label>
            <select name="saveAbility" style="width: 100%; height: 26px; font-size: 0.85em;">
              <option value="dex">DEX</option>
              <option value="con">CON</option>
              <option value="wis">WIS</option>
              <option value="str">STR</option>
              <option value="int">INT</option>
              <option value="cha">CHA</option>
            </select>
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">On Success:</label>
            <select name="saveSuccess" style="width: 100%; height: 26px; font-size: 0.85em;">
              <option value="half">Half Damage</option>
              <option value="none">No Damage</option>
            </select>
          </div>
        </div>
      </div>

      <div id="autoOptionsGroup" style="display: none; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Base Projectiles:</label>
            <input type="number" name="projectileCount" placeholder="3" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Per Upcast Lvl:</label>
            <input type="number" name="upcastProjectiles" placeholder="1" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>
      </div>

      <div id="healOptionsGroup" style="display: none; background: rgba(40,167,69,0.08); border: 1px solid #28a745; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em;">
          <span style="font-weight: 600;">Add Spell Mod to Total?</span>
          <input type="checkbox" name="addAbilityModToValue" id="addAbilityModToValue" style="margin: 0;" />
        </label>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Casting Time:</label>
          <input type="text" name="castingTime" placeholder="1 Action" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Range:</label>
          <input type="text" name="range" placeholder="60 ft, Touch" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Duration:</label>
          <input type="text" name="duration" placeholder="Instantaneous" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
        <div style="display: flex; align-items: flex-end;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8em; cursor: pointer; color: #a34848; font-weight: bold; padding-bottom: 4px;">
            <input type="checkbox" name="concentration" style="margin: 0;" /> Concentration
          </label>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 8px; background: rgba(0,0,0,0.02); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em; margin-bottom: 4px; color: #4b5d88;">Spell Components:</label>
        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 4px;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85em; cursor: pointer;">
            <input type="checkbox" name="comp_v" checked style="margin: 0;" /> Verbal (V)
          </label>
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85em; cursor: pointer;">
            <input type="checkbox" name="comp_s" checked style="margin: 0;" /> Somatic (S)
          </label>
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.85em; cursor: pointer;">
            <input type="checkbox" name="comp_m" id="comp_m_check" style="margin: 0;" /> Material (M)
          </label>
        </div>
        <div id="materialDetailsGroup" style="display: none; border-top: 1px dashed #ccc; padding-top: 6px; margin-top: 4px;">
          <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8em; color: #b35900; font-weight: bold; cursor: pointer; margin-bottom: 4px;">
            <input type="checkbox" name="comp_costly" style="margin: 0;" /> Costly / Consumed Component?
          </label>
          <input type="text" name="comp_desc" placeholder="e.g. A diamond worth at least 50gp" style="width: 100%; height: 24px; font-size: 0.8em;" />
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em;">Target Type:</label>
        <select name="targetType" id="targetTypeSelect" style="width: 100%; height: 26px; font-size: 0.85em;">
          <option value="self">Self</option>
          <option value="point">Point in Space</option>
          <option value="creature" selected>Creature(s)</option>
          <option value="object">Object(s)</option>
          <option value="creature_object">Creature or Object</option>
          <option value="area">Area of Effect</option>
        </select>
      </div>

      <div id="areaDetailsGroup" style="display: none; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Shape:</label>
            <select name="areaShape" style="width: 100%; height: 26px; font-size: 0.85em;">
              <option value="cone">Cone</option>
              <option value="cube">Square / Cube</option>
              <option value="line">Line</option>
              <option value="sphere">Circle / Sphere</option>
            </select>
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Size:</label>
            <input type="text" name="areaSize" placeholder="20 ft radius" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em;">Short Summary:</label>
        <input type="text" name="summary" placeholder="Quick effect tooltip" style="width: 100%; height: 26px; font-size: 0.85em;" />
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Dice (Count / Size):</label>
          <div style="display: flex; gap: 4px;">
            <input type="number" name="damageDiceCount" placeholder="0" style="width: 50%; height: 26px; font-size: 0.85em;" />
            <select name="damageDieSize" style="width: 50%; height: 26px; font-size: 0.85em;">
              <option value="d4">d4</option>
              <option value="d6" selected>d6</option>
              <option value="d8">d8</option>
              <option value="d10">d10</option>
              <option value="d12">d12</option>
            </select>
          </div>
        </div>
        <div id="damageModeGroup">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Type Mode:</label>
          <select name="damageMode" id="damageModeSelect" style="width: 100%; height: 26px; font-size: 0.85em;">
            <option value="static" selected>Fixed</option>
            <option value="choice">Choice (On Cast)</option>
            <option value="chaos">Chaos Table</option>
          </select>
        </div>
      </div>

      <div id="fixedDamageTypeGroup" class="form-group" style="margin-bottom: 8px;">
        <label style="font-weight: bold; display: block; font-size: 0.8em;">Fixed Damage Type:</label>
        <select name="damageType" style="width: 100%; height: 26px; font-size: 0.85em;">
          ${generateDamageTypeOptions("fire")}
        </select>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Extra Dice Formula:</label>
          <input type="text" name="extraDiceFormula" placeholder="e.g. 1d4" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Upcast Dice Formula:</label>
          <input type="text" name="upcastDiceFormula" placeholder="e.g. 1d8" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Flat Bonus:</label>
          <input type="number" name="flatDamageBonus" placeholder="0" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
        <div id="explodeGroup">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Explode Condition:</label>
          <input type="text" name="explodeCondition" placeholder="e.g. x8" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #eee; padding-top: 6px;">
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
          <span>Cantrip Dice Scaling (Lvl 5, 11, 17)</span>
          <input type="checkbox" name="isCantripScale" style="margin: 0;" />
        </label>
        <label id="chaosJumpGroup" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
          <span>Chaos Jump on Matching d8s</span>
          <input type="checkbox" name="chaosJump" style="margin: 0;" />
        </label>
        <label id="superAdvGroup" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
          <span>Elven Accuracy (Super Advantage)</span>
          <input type="checkbox" name="superAdv" style="margin: 0;" />
        </label>
      </div>
    </form>
  `;

      new Dialog({
        title: `Generate Spell: ${actor.name}`,
        content: content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save Spell",
            callback: async (html) => {
              const getVal = (name) => html.find(`[name="${name}"]`).val();
              const getCheck = (name) => html.find(`[name="${name}"]`).is(':checked');

              const spellName = getVal("spellName")?.trim() || "New Spell";
              const spellData = {
                itemId: getVal("itemId") || null,
                spellName,
                spellAbility: getVal("spellAbility"),
                baseLevel: Number(getVal("baseLevel")) || 0,
                resolutionMethod: getVal("resolutionMethod") || "attack",
                saveAbility: getVal("saveAbility") || "dex",
                saveSuccess: getVal("saveSuccess") || "half",
                isMultiAttack: getCheck("isMultiAttack"),
                attackCount: Number(getVal("attackCount")) || 1,
                upcastAttacks: Number(getVal("upcastAttacks")) || 0,
                cantripAttackScaling: getCheck("cantripAttackScaling"),
                projectileCount: Number(getVal("projectileCount")) || 3,
                upcastProjectiles: Number(getVal("upcastProjectiles")) || 1,
                addAbilityModToValue: getCheck("addAbilityModToValue"),
                castingTime: getVal("castingTime")?.trim() || "1 Action",
                range: getVal("range")?.trim() || "Touch",
                duration: getVal("duration")?.trim() || "Instantaneous",
                concentration: getCheck("concentration"),
                targetType: getVal("targetType") || "creature",
                areaShape: getVal("areaShape") || "cone",
                areaSize: getVal("areaSize")?.trim() || "",
                summary: getVal("summary")?.trim() || "",
                damageDiceCount: Number(getVal("damageDiceCount")) || 0,
                damageDieSize: getVal("damageDieSize"),
                extraDiceFormula: getVal("extraDiceFormula")?.trim() || "",
                upcastDiceFormula: getVal("upcastDiceFormula")?.trim() || "",
                damageMode: getVal("damageMode"),
                damageType: getVal("damageType") || "fire",
                flatDamageBonus: Number(getVal("flatDamageBonus")) || 0,
                explodeCondition: getVal("explodeCondition")?.trim() || "",
                chaosJump: getCheck("chaosJump"),
                attackModifier: Number(getVal("attackModifier")) || 0,
                isCantripScale: getCheck("isCantripScale"),
                superAdv: getCheck("superAdv"),
                components: {
                  v: getCheck("comp_v"),
                  s: getCheck("comp_s"),
                  m: getCheck("comp_m"),
                  costly: getCheck("comp_costly"),
                  description: getVal("comp_desc")?.trim() || ""
                }
              };

              const currentSpells = foundry.utils.deepClone(
                window.CustomRolls.getProfileData(actor, "spellConfigs") ||
                actor.getFlag("world", "spellConfigs") || {}
              );
              currentSpells[spellName] = spellData;

              await window.CustomRolls.setProfileData(actor, "spellConfigs", currentSpells);
              await actor.setFlag("world", "spellConfigs", currentSpells, { recursive: false });
              ui.notifications.info(`Spell "${spellName}" saved to Persistent Storage.`);
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "save",
        render: (html) => {
          const resSelect = html.find('#resMethodSelect');
          const saveGroup = html.find('#saveOptionsGroup');
          const autoGroup = html.find('#autoOptionsGroup');
          const healGroup = html.find('#healOptionsGroup');
          const multiGroup = html.find('#multiAttackOptionsGroup');
          const isMultiCheck = html.find('#isMultiAttackCheck');
          const multiDetails = html.find('#multiAttackDetails');
          const targetTypeSelect = html.find('#targetTypeSelect');
          const areaGroup = html.find('#areaDetailsGroup');
          const damageModeSelect = html.find('#damageModeSelect');
          const fixedGroup = html.find('#fixedDamageTypeGroup');
          const compMCheck = html.find('#comp_m_check');
          const materialDetailsGroup = html.find('#materialDetailsGroup');

          function updateLayout() {
            const val = resSelect.val();
            saveGroup.toggle(val === 'save');
            autoGroup.toggle(val === 'auto');
            healGroup.toggle(['heal', 'temp_hp', 'max_hp'].includes(val));
            multiGroup.toggle(val === 'attack');
            areaGroup.toggle(targetTypeSelect.val() === 'area');
            fixedGroup.toggle(damageModeSelect.val() === 'static');
            materialDetailsGroup.toggle(compMCheck.is(':checked'));
          }

          compMCheck.on('change', () => {
            materialDetailsGroup.toggle(compMCheck.is(':checked'));
          });

          isMultiCheck.on('change', () => {
            multiDetails.toggle(isMultiCheck.is(':checked'));
          });

          targetTypeSelect.on('change', () => {
            areaGroup.toggle(targetTypeSelect.val() === 'area');
          });

          damageModeSelect.on('change', () => {
            fixedGroup.toggle(damageModeSelect.val() === 'static');
          });

          resSelect.on('change', updateLayout);

          // Autofill handler from Character Sheet selection
          html.find('#sheetSpellSelect').on('change', function () {
            const spellId = $(this).val();
            if (!spellId) return;

            const item = actor.items.get(spellId);
            if (!item) return;

            const sys = item.system || {};

            // Spell Name & Level
            html.find('input[name="spellName"]').val(item.name);
            html.find('select[name="baseLevel"]').val(String(sys.level ?? 0));

            // Spellcasting Ability
            const sheetSpellAbil = sys.ability || actor.system.attributes?.spellcasting || "int";
            html.find('select[name="spellAbility"]').val(sheetSpellAbil);

            // Casting Time, Range, Duration, Concentration
            const act = sys.activation;
            const castStr = act?.cost ? `${act.cost} ${act.type || 'Action'}` : "1 Action";
            html.find('input[name="castingTime"]').val(castStr);

            const rng = sys.range;
            const rangeStr = rng?.value ? `${rng.value} ${rng.units || 'ft'}` : (rng?.units || "Touch");
            html.find('input[name="range"]').val(rangeStr);

            const dur = sys.duration;
            const durStr = dur?.value ? `${dur.value} ${dur.units || ''}` : (dur?.units || "Instantaneous");
            html.find('input[name="duration"]').val(durStr);

            const isConc = Boolean(sys.properties?.has?.("concentration") || sys.components?.concentration);
            html.find('input[name="concentration"]').prop('checked', isConc);

            // Components Autofill
            const comps = sys.properties || sys.components || {};
            const hasV = Boolean(comps.has ? comps.has("vocal") : comps.vocal);
            const hasS = Boolean(comps.has ? comps.has("somatic") : comps.somatic);
            const hasM = Boolean(comps.has ? comps.has("material") : comps.material);
            const isCostly = Boolean(sys.materials?.cost || sys.materials?.consumed);
            const matDesc = sys.materials?.value || "";

            html.find('input[name="comp_v"]').prop('checked', hasV);
            html.find('input[name="comp_s"]').prop('checked', hasS);
            html.find('input[name="comp_m"]').prop('checked', hasM);
            html.find('input[name="comp_costly"]').prop('checked', isCostly);
            html.find('input[name="comp_desc"]').val(matDesc);

            // Target Type & Area
            const targetUnits = sys.target?.units;
            const targetType = sys.target?.type;
            if (["cone", "cube", "line", "sphere", "cylinder", "radius"].includes(targetType) || ["cone", "cube", "line", "sphere"].includes(targetUnits)) {
              targetTypeSelect.val("area");
              html.find('select[name="areaShape"]').val(targetType === "cylinder" || targetType === "radius" ? "sphere" : (targetType || "cone"));
              html.find('input[name="areaSize"]').val(sys.target?.value ? `${sys.target.value} ft` : "");
            } else if (targetType === "self" || rangeStr.toLowerCase() === "self") {
              targetTypeSelect.val("self");
            } else {
              targetTypeSelect.val("creature");
            }

            // Summary (Stripped HTML)
            const rawDesc = sys.description?.value || "";
            const cleanSummary = rawDesc.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
            html.find('input[name="summary"]').val(cleanSummary);

            // Resolution Method & Damage
            const actionType = sys.actionType;
            if (actionType === "save") {
              resSelect.val("save");
              html.find('select[name="saveAbility"]').val(sys.save?.ability || "dex");
              html.find('select[name="saveSuccess"]').val(sys.save?.scaling === "half" ? "half" : "none");
            } else if (actionType === "heal") {
              resSelect.val("heal");
            } else if (actionType === "rsak" || actionType === "msak") {
              resSelect.val("attack");
            } else if (actionType === "util" || !actionType) {
              resSelect.val("other");
            }

            // Damage Parts
            const parts = sys.damage?.parts || [];
            if (parts.length > 0) {
              const firstPart = parts[0];
              const formula = firstPart[0] || "";
              const dmgType = (firstPart[1] || "fire").toLowerCase();

              const diceMatch = formula.match(/(\d*)d(\d+)/i);
              if (diceMatch) {
                html.find('input[name="damageDiceCount"]').val(parseInt(diceMatch[1]) || 1);
                html.find('select[name="damageDieSize"]').val(`d${diceMatch[2]}`);
              }

              html.find('select[name="damageType"]').val(dmgType);
            }

            // Cantrip scaling checkbox
            if (Number(sys.level) === 0 && sys.scaling?.mode === "cantrip") {
              html.find('input[name="isCantripScale"]').prop('checked', true);
            }

            updateLayout();
          });
        }
      }, {
        width: 440,
        height: "auto",
        resizable: true
      }).render(true);
    }

    // --- Initial Choice Prompt ---
    new Dialog({
      title: `Generate Action: ${actor.name}`,
      content: `
      <div style="text-align: center; padding: 10px; font-family: inherit;">
        <p style="margin: 0 0 10px 0; font-size: 0.95em; color: #333;">Choose which type of action configuration to create:</p>
      </div>
    `,
      buttons: {
        weapon: {
          icon: '<i class="fas fa-sword" style="margin-right: 6px;"></i>',
          label: "Weapon Attack",
          callback: () => openWeaponGeneratorDialog()

        },
        spell: {
          icon: '<i class="fas fa-magic" style="margin-right: 6px;"></i>',
          label: "Spell",
          callback: () => openSpellGeneratorDialog()
        },
        cancel: { label: "Cancel" }
      },
      default: "weapon"
    }, { width: 340 }).render(true);
  };

  // --- 4.3 Unified Action Editor & Manager (Weapons & Spells) ---
  window.CustomRolls.openActionEditor = function (initialCategory = "weapons") {
    if (!game.settings.get("cheapdice", "featurePresetEditors")) return;

    const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;
    const actor = token?.actor;
    if (!actor) {
      return ui.notifications.warn("Please select your token first.");
    }

    let activeCategory = initialCategory;

    const DAMAGE_TYPES = [
      { label: "Acid", value: "acid" },
      { label: "Bludgeoning", value: "bludgeoning" },
      { label: "Cold", value: "cold" },
      { label: "Fire", value: "fire" },
      { label: "Force", value: "force" },
      { label: "Lightning", value: "lightning" },
      { label: "Necrotic", value: "necrotic" },
      { label: "Piercing", value: "piercing" },
      { label: "Poison", value: "poison" },
      { label: "Psychic", value: "psychic" },
      { label: "Radiant", value: "radiant" },
      { label: "Slashing", value: "slashing" },
      { label: "Thunder", value: "thunder" }
    ];

    function generateDamageTypeOptions(selectedValue = "slashing") {
      return DAMAGE_TYPES.map(t =>
        `<option value="${t.value}" ${t.value === selectedValue ? 'selected' : ''}>${t.label}</option>`
      ).join('');
    }

    function renderUnifiedManager() {
      const isWeapons = activeCategory === "weapons";
      const flagKey = isWeapons ? "attackConfigs" : "spellConfigs";

      const weaponConfigs = foundry.utils.deepClone(
        window.CustomRolls.getProfileData(actor, "attackConfigs") ||
        actor.getFlag("world", "attackConfigs") || {}
      );
      const spellConfigs = foundry.utils.deepClone(
        window.CustomRolls.getProfileData(actor, "spellConfigs") ||
        actor.getFlag("world", "spellConfigs") || {}
      );

      const weaponKeys = Object.keys(weaponConfigs);
      const spellKeys = Object.keys(spellConfigs);

      const allConfigs = isWeapons ? weaponConfigs : spellConfigs;
      const keys = isWeapons ? weaponKeys : spellKeys;

      async function saveAllData(newData) {
        await window.CustomRolls.setProfileData(actor, flagKey, newData);
        await actor.setFlag("world", flagKey, newData, { recursive: false });
      }

      const selectOptions = keys.length > 0
        ? keys.map(k => `<option value="${k}">${k}</option>`).join("")
        : `<option value="">-- No configured ${isWeapons ? 'weapons' : 'spells'} --</option>`;

      const content = `
      <div style="display: flex; flex-direction: column; gap: 8px; padding: 4px 2px; font-family: inherit;">
        <div style="display: flex; gap: 6px; border-bottom: 2px solid #7289da; padding-bottom: 8px;">
          <button type="button" id="tab-btn-weapon" style="flex: 1; padding: 6px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${isWeapons ? '#7289da' : '#f0f2f5'}; color: ${isWeapons ? '#fff' : '#555'};">
            <i class="fas fa-sword"></i> Weapons (${weaponKeys.length})
          </button>
          <button type="button" id="tab-btn-spell" style="flex: 1; padding: 6px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${!isWeapons ? '#7289da' : '#f0f2f5'}; color: ${!isWeapons ? '#fff' : '#555'};">
            <i class="fas fa-magic"></i> Spells (${spellKeys.length})
          </button>
        </div>

        <div style="background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px; padding: 8px;">
          <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 4px; color: #4b5d88;">
            Select ${isWeapons ? 'Weapon' : 'Spell'}:
          </label>
          <select id="action-choice" style="width: 100%; height: 32px; font-size: 0.9em; border-radius: 4px; border: 1px solid #7289da; padding: 2px 6px;">
            ${selectOptions}
          </select>
        </div>
      </div>
      <style>
        .action-manager-dialog .dialog-buttons {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
        }
        .action-manager-dialog .dialog-buttons button {
          height: 32px;
          margin: 0;
          font-size: 0.82em;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
      </style>
    `;

      const dlg = new Dialog({
        title: `${actor.name}: Action Editor`,
        content: content,
        buttons: {
          moveUp: {
            icon: '<i class="fas fa-arrow-up"></i>',
            label: "Move Up",
            callback: async (html) => {
              const choice = html.find("#action-choice").val();
              const idx = keys.indexOf(choice);
              if (idx > 0) {
                const temp = keys[idx - 1];
                keys[idx - 1] = keys[idx];
                keys[idx] = temp;
                const reordered = {};
                keys.forEach(k => { reordered[k] = allConfigs[k]; });
                await saveAllData(reordered);
              }
              renderUnifiedManager();
            }
          },
          moveDown: {
            icon: '<i class="fas fa-arrow-down"></i>',
            label: "Move Down",
            callback: async (html) => {
              const choice = html.find("#action-choice").val();
              const idx = keys.indexOf(choice);
              if (idx >= 0 && idx < keys.length - 1) {
                const temp = keys[idx + 1];
                keys[idx + 1] = keys[idx];
                keys[idx] = temp;
                const reordered = {};
                keys.forEach(k => { reordered[k] = allConfigs[k]; });
                await saveAllData(reordered);
              }
              renderUnifiedManager();
            }
          },
          edit: {
            icon: '<i class="fas fa-edit"></i>',
            label: "Edit",
            callback: (html) => {
              const choice = html.find("#action-choice").val();
              if (!choice) return;
              if (isWeapons) {
                openWeaponEditorDetail(choice);
              } else {
                openSpellEditorDetail(choice);
              }
            }
          },
          quickMacro: {
            icon: '<i class="fas fa-bolt" style="color: #c9510c;"></i>',
            label: "Quick Macro",
            callback: async (html) => {
              const choice = html.find("#action-choice").val();
              if (!choice) return ui.notifications.warn("Please select an action first.");

              const rawConfig = allConfigs[choice];
              if (!rawConfig) return;

              const extras = rawConfig.additionalDamageComponents || [];
              const hasGWM = Boolean(rawConfig.hasGWM);

              // Build checkboxes for extra damage sources
              let extrasCheckboxesHtml = "";
              if (extras.length > 0) {
                extrasCheckboxesHtml += `
                <div style="margin-top: 6px; border-top: 1px solid #ccc; padding-top: 6px;">
                  <span style="font-weight: 600; font-size: 0.8em; color: #4b5d88; display: block; margin-bottom: 4px;">ACTIVE EXTRA DAMAGE SOURCES:</span>
                  ${extras.map((ex, i) => `
                    <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8em; padding: 2px 4px; margin-bottom: 2px; background: rgba(0,0,0,0.02); border-radius: 3px; cursor: pointer;">
                      <span><strong>${ex.label}</strong> <small style="color: #666;">(${ex.formula})</small></span>
                      <input type="checkbox" class="qm-extra-toggle" data-index="${i}" ${ex.isActive ? 'checked' : ''} style="margin: 0;">
                    </label>
                  `).join("")}
                </div>
              `;
              }

              let gwmToggleHtml = "";
              if (hasGWM) {
                gwmToggleHtml = `
                <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8em; font-weight: bold; color: #a34848; padding: 3px 6px; background: rgba(163,72,72,0.08); border-radius: 3px; cursor: pointer; margin-top: 6px;">
                  <span>Default GWM / SS (-5 / +10)</span>
                  <input type="checkbox" id="qm-gwm-toggle" style="margin: 0;">
                </label>
              `;
              }

              const promptHtml = `
              <div style="font-family: inherit; padding: 4px;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 3px;">Macro Name:</label>
                <input type="text" id="qm-name-input" value="${actor.name}: ${choice}" style="width: 100%; height: 28px; font-size: 0.9em; margin-bottom: 6px;" />
                ${gwmToggleHtml}
                ${extrasCheckboxesHtml}
              </div>
            `;

              new Dialog({
                title: `Configure Quick Macro: ${choice}`,
                content: promptHtml,
                buttons: {
                  create: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Create Macro",
                    callback: async (promptModal) => {
                      const finalMacroName = promptModal.find("#qm-name-input").val().trim();
                      if (!finalMacroName) return ui.notifications.warn("Macro name cannot be blank.");

                      // Generate a safe unique key for actor profile storage
                      const profileKey = `${actor.id}_${finalMacroName}`.replace(/[^a-zA-Z0-9_-]/g, "_");

                      // Clone config and apply user toggle preferences
                      const targetData = foundry.utils.deepClone(rawConfig);

                      if (hasGWM && promptModal.find("#qm-gwm-toggle").is(":checked")) {
                        targetData.attackCircumstanceModifier = (Number(targetData.attackCircumstanceModifier) || 0) - 5;
                        targetData.damageModifier = (Number(targetData.damageModifier) || 0) + 10;
                        targetData.chatCardTitle = `${targetData.chatCardTitle || choice} [GWM/SS]`;
                      }

                      if (targetData.additionalDamageComponents) {
                        promptModal.find(".qm-extra-toggle").each(function () {
                          const idx = $(this).data("index");
                          if (targetData.additionalDamageComponents[idx]) {
                            targetData.additionalDamageComponents[idx].isActive = $(this).is(":checked");
                          }
                        });
                      }

                      // Save to persistent profile storage
                      const quickProfiles = foundry.utils.deepClone(
                        window.CustomRolls.getProfileData(actor, "quickMacroProfiles") || {}
                      );
                      quickProfiles[profileKey] = targetData;
                      await window.CustomRolls.setProfileData(actor, "quickMacroProfiles", quickProfiles);

                      // Build the executable hotbar macro script
                      const handlerName = isWeapons ? "runAttackRoll" : "runSpellAttackRoll";
                      const scriptCommand = `
const token = canvas.tokens.controlled[0] || canvas.tokens.hover;
const actor = token?.actor;
if (!actor) return ui.notifications.warn("Select your token first.");
if (!globalThis.attackSocket) return ui.notifications.error("SocketLib handler is not initialized.");

const profiles = window.CustomRolls?.getProfileData(actor, "quickMacroProfiles") || {};
const config = profiles["${profileKey}"];
if (!config) return ui.notifications.error("Stored profile not found for ${finalMacroName}.");

await globalThis.attackSocket.executeAsGM("${handlerName}", config, actor.id, game.user.id);
`.trim();

                      let existingMacro = game.macros.find(m => m.name === finalMacroName);
                      if (existingMacro) {
                        await existingMacro.update({ command: scriptCommand });
                        ui.notifications.info(`Updated existing macro: "${finalMacroName}".`);
                      } else {
                        await Macro.create({
                          name: finalMacroName,
                          type: "script",
                          img: activeCategory === "weapons" ? "icons/skills/melee/strike-sword-blood-red.webp" : "icons/magic/symbols/runes-star-pentagon-orange.webp",
                          command: scriptCommand,
                          ownership: {
                            default: 0,
                            [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
                          }
                        });
                        ui.notifications.info(`Created Quick Macro: "${finalMacroName}".`);
                      }
                    }
                  },
                  cancel: { label: "Cancel" }
                },
                default: "create"
              }, { width: 340, height: "auto" }).render(true);
            }
          },
          delete: {
            icon: '<i class="fas fa-trash" style="color: #a33;"></i>',
            label: "Delete",
            callback: async (html) => {
              const choice = html.find("#action-choice").val();
              if (!choice) return;
              delete allConfigs[choice];
              await saveAllData(allConfigs);
              ui.notifications.warn(`Deleted "${choice}" from Persistent Storage.`);
              renderUnifiedManager();
            }
          },
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: "Close"
          }
        },
        default: "edit",
        render: (html) => {
          html.find('#tab-btn-weapon').on('click', () => {
            if (activeCategory !== "weapons") {
              activeCategory = "weapons";
              dlg.close();
              renderUnifiedManager();
            }
          });
          html.find('#tab-btn-spell').on('click', () => {
            if (activeCategory !== "spells") {
              activeCategory = "spells";
              dlg.close();
              renderUnifiedManager();
            }
          });
        }
      }, { width: 440, classes: ["dialog", "action-manager-dialog"] });

      dlg.render(true);
    }

    // --- Weapon Detail Form (Full Generator UI) ---
    function openWeaponEditorDetail(name) {
      const attacks = foundry.utils.deepClone(
        window.CustomRolls.getProfileData(actor, "attackConfigs") ||
        actor.getFlag("world", "attackConfigs") || {}
      );
      const item = attacks[name] || {};
      const existingComponents = item.additionalDamageComponents || [];

      const DAMAGE_COMPONENT_COUNT = 10;
      let damageComponentHTML = '';
      for (let i = 1; i <= DAMAGE_COMPONENT_COUNT; i++) {
        const comp = existingComponents[i - 1] || {};
        const formulaVal = comp.formula ?? "";
        const defaultLabel = `Extra Damage ${i}`;
        const labelVal = comp.label ?? defaultLabel;
        const placeholderLabel = i === 1 ? 'Sneak Attack, etc.' :
          i === 2 ? "Hunter's Mark / Hex" :
            i === 3 ? 'Divine Smite, etc.' :
              `Component ${i}`;

        const isCritChecked = comp.isCrit !== undefined ? (comp.isCrit ? 'checked' : '') : (i === 1 || i === 3 ? 'checked' : '');
        const onlyCritChecked = comp.onlyCrit ? 'checked' : '';
        const typeVal = comp.damageType || (i === 3 ? 'radiant' : 'slashing');

        damageComponentHTML += `
        <div class="damage-component-block" style="border: 1px solid #7289DA; padding: 8px; margin-bottom: 10px; border-radius: 4px; background: #f7f9ff;">
          <h4 style="margin: 0 0 6px 0; border-bottom: 1px dashed #7289DA; padding-bottom: 3px; font-size: 0.9em; color: #2c3e50;">Component ${i}</h4>
          <div class="form-group" style="margin-bottom: 6px;">
            <label style="font-size: 0.8em; font-weight: bold; display: block;">Dice Formula:</label>
            <input type="text" name="damage${i}_formula" value="${formulaVal}" placeholder="e.g., 2d6+5" style="width: 100%; height: 26px; font-size: 0.85em;"/>
          </div>
          <div class="form-group" style="margin-bottom: 6px;">
            <label style="font-size: 0.8em; font-weight: bold; display: block;">Label:</label>
            <input type="text" name="damage${i}_label" value="${labelVal}" placeholder="${placeholderLabel}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <div style="flex: 1.2;">
              <label style="font-size: 0.8em; font-weight: bold; display: block;">Type:</label>
              <select name="damage${i}_type" style="width: 100%; height: 26px; font-size: 0.85em;">
                ${generateDamageTypeOptions(typeVal)}
              </select>
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; gap: 3px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75em; cursor: pointer;">
                <span>Crunchy Crit</span>
                <input type="checkbox" name="damage${i}_isCrit" ${isCritChecked}/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75em; cursor: pointer;">
                <span>Only on Crit</span>
                <input type="checkbox" name="damage${i}_onlyCrit" ${onlyCritChecked}/>
              </label>
            </div>
          </div>
        </div>
      `;
      }

      const curDieSize = String(item.damageDieSize || "6").replace(/^d/i, "");
      const curAbility = item.abilityScore || "str";

      const content = `
      <form class="generator-form" style="padding: 4px; font-family: inherit;">
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <div style="flex: 1;">
            <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Action Name:</label>
            <input type="text" name="macroName" value="${item.macroName ?? name}" style="width: 100%; height: 28px; font-size: 0.9em;"/>
          </div>
          <div style="flex: 1;">
            <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Chat Card Title:</label>
            <input type="text" name="chatCardTitle" value="${item.chatCardTitle ?? name}" style="width: 100%; height: 28px; font-size: 0.9em;"/>
          </div>
        </div>

        <div style="border: 1px solid #ccc; border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
          <div class="tabs" style="display: flex; background: #eee; border-bottom: 1px solid #ccc;">
            <button type="button" class="tab-button active" data-tab="atk-main" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; border-right: 1px solid #ccc; background: #fff;">Base Attack</button>
            <button type="button" class="tab-button" data-tab="atk-extra" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; border-right: 1px solid #ccc; background: #eee;">Extra Damage</button>
            <button type="button" class="tab-button" data-tab="atk-misc" style="flex: 1; padding: 6px; font-weight: bold; font-size: 0.85em; cursor: pointer; border: none; background: #eee;">Rules & Perks</button>
          </div>

          <div id="atk-main" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Ability:</label>
                <select name="abilityScore" style="width: 100%; height: 28px; font-size: 0.85em;">
                  <option value="str" ${curAbility === 'str' ? 'selected' : ''}>STR</option>
                  <option value="dex" ${curAbility === 'dex' ? 'selected' : ''}>DEX</option>
                  <option value="con" ${curAbility === 'con' ? 'selected' : ''}>CON</option>
                  <option value="int" ${curAbility === 'int' ? 'selected' : ''}>INT</option>
                  <option value="wis" ${curAbility === 'wis' ? 'selected' : ''}>WIS</option>
                  <option value="cha" ${curAbility === 'cha' ? 'selected' : ''}>CHA</option>
                </select>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Damage Type:</label>
                <select name="damageType" style="width: 100%; height: 28px; font-size: 0.85em;">
                  ${generateDamageTypeOptions(item.damageType || "slashing")}
                </select>
              </div>
            </div>

            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Dice Count:</label>
                <input type="number" name="damageDiceCount" value="${item.damageDiceCount ?? 0}" min="0" placeholder="0 for flat damage" style="width: 100%; height: 28px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Die Size:</label>
                <select name="damageDieSize" style="width: 100%; height: 28px; font-size: 0.85em;">
                  <option value="none" ${curDieSize === 'none' || !curDieSize ? 'selected' : ''}>None (Flat Dmg)</option>
                  <option value="d4" ${curDieSize === '4' ? 'selected' : ''}>d4</option>
                  <option value="d6" ${curDieSize === '6' ? 'selected' : ''}>d6</option>
                  <option value="d8" ${curDieSize === '8' ? 'selected' : ''}>d8</option>
                  <option value="d10" ${curDieSize === '10' ? 'selected' : ''}>d10</option>
                  <option value="d12" ${curDieSize === '12' ? 'selected' : ''}>d12</option>
                </select>
              </div>
            </div>
            <div style="margin-bottom: 8px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
                <span style="font-weight: 600; color: #4b5d88;">Proficient with Weapon (Adds PB)</span>
                <input type="checkbox" name="isProficient" ${item.isProficient !== false ? 'checked' : ''} style="margin: 0;"/>
              </label>
            </div>

            <hr style="margin: 8px 0; border-top: 1px solid #eee;">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Weapon (+):</label>
                <input type="number" name="weaponModifier" value="${item.weaponModifier ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Atk Mod:</label>
                <input type="number" name="attackCircumstanceModifier" value="${item.attackCircumstanceModifier ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div>
                <label style="font-weight: bold; font-size: 0.8em; display: block; margin-bottom: 2px;">Dmg Mod:</label>
                <input type="number" name="damageModifier" value="${item.damageModifier ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
          </div>

          <div id="atk-extra" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto; display: none;">
            ${damageComponentHTML}
          </div>

          <div id="atk-misc" class="tab-content" style="padding: 10px; max-height: 420px; overflow-y: auto; display: none;">
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Crit Threshold:</label>
                <input type="number" name="CRIT_THRESHOLD" value="${item.CRIT_THRESHOLD ?? 20}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Extra Crit Bonus:</label>
                <input type="text" name="extraCriticalBonus" value="${item.extraCriticalBonus ?? ''}" placeholder="e.g. 1d6 or 5" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 8px;">
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">GWF Reroll (≤):</label>
                <input type="number" name="GWF_REROLL_THRESHOLD" value="${item.GWF_REROLL_THRESHOLD ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
              <div style="flex: 1;">
                <label style="font-weight: bold; font-size: 0.85em; display: block; margin-bottom: 2px;">Lucky Reroll (≤):</label>
                <input type="number" name="HALFLING_LUCKY_REROLL_THRESHOLD" value="${item.HALFLING_LUCKY_REROLL_THRESHOLD ?? 1}" style="width: 100%; height: 26px; font-size: 0.85em;"/>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid #eee; padding-top: 6px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer;">
                <span>Halfling Lucky</span>
                <input type="checkbox" name="HAS_HALFLING_LUCKY" ${item.HAS_HALFLING_LUCKY ? 'checked' : ''}/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer;">
                <span>Elven Accuracy (Super Advantage)</span>
                <input type="checkbox" name="superAdv" ${item.superAdv ? 'checked' : ''}/>
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; color: #a34848; font-weight: bold;">
                <span>Allow GWM / Sharpshooter (-5 / +10)</span>
                <input type="checkbox" name="hasGWM" ${item.hasGWM ? 'checked' : ''}/>
              </label>
            </div>
          </div>
        </div>
      </form>
    `;

      new Dialog({
        title: `Edit Weapon: ${name}`,
        content: content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save Changes",
            callback: async (html) => {
              const getVal = (n) => html.find(`[name="${n}"]`).val();
              const getCheck = (n) => html.find(`[name="${n}"]`).is(':checked');

              const newMacroName = getVal("macroName")?.trim() || name;
              const chatCardTitle = getVal("chatCardTitle")?.trim() || newMacroName;
              const abilityScore = getVal("abilityScore");
              const isProficient = getCheck("isProficient");
              const damageDiceCount = parseInt(getVal("damageDiceCount")) || 0;
              const damageDieSize = getVal("damageDieSize");
              const damageType = getVal("damageType");
              const weaponModifier = parseInt(getVal("weaponModifier")) || 0;
              const attackCircumstanceModifier = parseInt(getVal("attackCircumstanceModifier")) || 0;
              const damageModifier = parseInt(getVal("damageModifier")) || 0;
              const CRIT_THRESHOLD = parseInt(getVal("CRIT_THRESHOLD")) || 20;
              const extraCriticalBonus = getVal("extraCriticalBonus")?.trim() || "";
              const GWF_REROLL_THRESHOLD = parseInt(getVal("GWF_REROLL_THRESHOLD")) || 0;
              const HAS_HALFLING_LUCKY = getCheck("HAS_HALFLING_LUCKY");
              const HALFLING_LUCKY_REROLL_THRESHOLD = parseInt(getVal("HALFLING_LUCKY_REROLL_THRESHOLD")) || 0;
              const superAdv = getCheck("superAdv");
              const hasGWM = getCheck("hasGWM");

              const components = [];
              for (let i = 1; i <= DAMAGE_COMPONENT_COUNT; i++) {
                const formula = getVal(`damage${i}_formula`)?.trim();
                if (formula) {
                  const prevActive = existingComponents[i - 1]?.isActive ?? true;
                  components.push({
                    formula: formula,
                    label: getVal(`damage${i}_label`) || `Extra Damage ${i}`,
                    damageType: getVal(`damage${i}_type`) || "slashing",
                    isActive: prevActive,
                    isCrit: getCheck(`damage${i}_isCrit`),
                    onlyCrit: getCheck(`damage${i}_onlyCrit`),
                    id: existingComponents[i - 1]?.id || `extra_gen_${i}`
                  });
                }
              }

              const configData = {
                macroName: newMacroName, chatCardTitle, abilityScore, isProficient, damageDiceCount, damageDieSize, damageType,
                weaponModifier, attackCircumstanceModifier, damageModifier, CRIT_THRESHOLD,
                extraCriticalBonus, GWF_REROLL_THRESHOLD, HAS_HALFLING_LUCKY,
                HALFLING_LUCKY_REROLL_THRESHOLD, superAdv, hasGWM,
                additionalDamageComponents: components
              };

              if (newMacroName !== name) {
                delete attacks[name];
              }
              attacks[newMacroName] = configData;

              await window.CustomRolls.setProfileData(actor, "attackConfigs", attacks);
              await actor.setFlag("world", "attackConfigs", attacks);
              ui.notifications.info(`Updated "${newMacroName}" in Persistent Storage.`);
              renderUnifiedManager();
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "save",
        render: (html) => {
          const tabs = html.find('.tab-button');
          const contents = html.find('.tab-content');
          tabs.on('click', function () {
            const targetTab = $(this).data('tab');
            tabs.css('background', '#eee').removeClass('active');
            $(this).css('background', '#fff').addClass('active');
            contents.hide();
            html.find(`#${targetTab}`).show();
          });
        }
      }, { width: 480, height: "auto" }).render(true);
    }

    // --- Spell Detail Form (Full Generator UI) ---
    function openSpellEditorDetail(name) {
      const spells = foundry.utils.deepClone(
        window.CustomRolls.getProfileData(actor, "spellConfigs") ||
        actor.getFlag("world", "spellConfigs") || {}
      );
      const s = spells[name] || {};

      const curDieSize = String(s.damageDieSize || "d6").trim();
      const curAbility = s.spellAbility || "cha";
      const curLevel = Number(s.baseLevel) || 0;
      const curMethod = s.resolutionMethod || "attack";
      const curTarget = s.targetType || "creature";
      const curDamageMode = s.damageMode || "static";

      const content = `
      <form style="padding: 5px; font-family: inherit;">
        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.85em;">Spell Name:</label>
          <input type="text" name="spellName" value="${s.spellName ?? name}" style="width: 100%; height: 28px; font-size: 0.9em;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px;">
          <div class="form-group" style="margin: 0;">
            <label style="font-weight: bold; display: block; font-size: 0.85em;">Ability:</label>
            <select name="spellAbility" style="width: 100%; height: 28px; font-size: 0.85em;">
              <option value="int" ${curAbility === 'int' ? 'selected' : ''}>INT</option>
              <option value="wis" ${curAbility === 'wis' ? 'selected' : ''}>WIS</option>
              <option value="cha" ${curAbility === 'cha' ? 'selected' : ''}>CHA</option>
            </select>
          </div>
          <div class="form-group" style="margin: 0;">
            <label style="font-weight: bold; display: block; font-size: 0.85em;">Base Spell Level:</label>
            <select name="baseLevel" style="width: 100%; height: 28px; font-size: 0.85em;">
              <option value="0" ${curLevel === 0 ? 'selected' : ''}>Cantrip (Level 0)</option>
              <option value="1" ${curLevel === 1 ? 'selected' : ''}>1st Level</option>
              <option value="2" ${curLevel === 2 ? 'selected' : ''}>2nd Level</option>
              <option value="3" ${curLevel === 3 ? 'selected' : ''}>3rd Level</option>
              <option value="4" ${curLevel === 4 ? 'selected' : ''}>4th Level</option>
              <option value="5" ${curLevel === 5 ? 'selected' : ''}>5th Level</option>
              <option value="6" ${curLevel === 6 ? 'selected' : ''}>6th Level</option>
              <option value="7" ${curLevel === 7 ? 'selected' : ''}>7th Level</option>
              <option value="8" ${curLevel === 8 ? 'selected' : ''}>8th Level</option>
              <option value="9" ${curLevel === 9 ? 'selected' : ''}>9th Level</option>
            </select>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.85em;">Resolution Method:</label>
          <select name="resolutionMethod" id="resMethodSelect" style="width: 100%; height: 28px; font-size: 0.85em;">
            <option value="attack" ${curMethod === 'attack' ? 'selected' : ''}>Attack Roll (d20 vs AC)</option>
            <option value="save" ${curMethod === 'save' ? 'selected' : ''}>Saving Throw (vs Spell DC)</option>
            <option value="auto" ${curMethod === 'auto' ? 'selected' : ''}>Automatic Hit / Projectiles (Magic Missile)</option>
            <option value="heal" ${curMethod === 'heal' ? 'selected' : ''}>Healing (Hit Point Recovery)</option>
            <option value="temp_hp" ${curMethod === 'temp_hp' ? 'selected' : ''}>Temporary HP Grant</option>
            <option value="max_hp" ${curMethod === 'max_hp' ? 'selected' : ''}>Max HP Increase (Aid / Heroes' Feast)</option>
            <option value="other" ${curMethod === 'other' ? 'selected' : ''}>Other / Utility (Summary Only)</option>
          </select>
        </div>

        <div id="multiAttackOptionsGroup" style="background: rgba(114, 137, 218, 0.08); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <label style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: bold; font-size: 0.85em; color: #4b5d88;">Multiple Attacks / Rays?</span>
            <input type="checkbox" name="isMultiAttack" id="isMultiAttackCheck" ${s.isMultiAttack ? 'checked' : ''} style="margin: 0;" />
          </label>
          <div id="multiAttackDetails" style="display: ${s.isMultiAttack ? 'block' : 'none'}; border-top: 1px solid rgba(114, 137, 218, 0.2); padding-top: 6px; margin-top: 4px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 0.8em; font-weight: bold; display: block;">Base Attack Count:</label>
                <input type="number" name="attackCount" value="${s.attackCount ?? 1}" style="width: 100%; height: 26px; font-size: 0.85em;" />
              </div>
              <div>
                <label style="font-size: 0.8em; font-weight: bold; display: block;">Rays per Upcast Lvl:</label>
                <input type="number" name="upcastAttacks" value="${s.upcastAttacks ?? 0}" style="width: 100%; height: 26px; font-size: 0.85em;" />
              </div>
            </div>
            <div style="margin-top: 4px;">
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
                <span>Cantrip Scaling (Eldritch Blast)?</span>
                <input type="checkbox" name="cantripAttackScaling" ${s.cantripAttackScaling ? 'checked' : ''} style="margin: 0;" />
              </label>
            </div>
          </div>
        </div>

        <div id="saveOptionsGroup" style="display: ${curMethod === 'save' ? 'block' : 'none'}; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Save Required:</label>
              <select name="saveAbility" style="width: 100%; height: 26px; font-size: 0.85em;">
                <option value="dex" ${s.saveAbility === 'dex' ? 'selected' : ''}>DEX</option>
                <option value="con" ${s.saveAbility === 'con' ? 'selected' : ''}>CON</option>
                <option value="wis" ${s.saveAbility === 'wis' ? 'selected' : ''}>WIS</option>
                <option value="str" ${s.saveAbility === 'str' ? 'selected' : ''}>STR</option>
                <option value="int" ${s.saveAbility === 'int' ? 'selected' : ''}>INT</option>
                <option value="cha" ${s.saveAbility === 'cha' ? 'selected' : ''}>CHA</option>
              </select>
            </div>
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">On Success:</label>
              <select name="saveSuccess" style="width: 100%; height: 26px; font-size: 0.85em;">
                <option value="half" ${s.saveSuccess === 'half' ? 'selected' : ''}>Half Damage</option>
                <option value="none" ${s.saveSuccess === 'none' ? 'selected' : ''}>No Damage</option>
              </select>
            </div>
          </div>
        </div>

        <div id="autoOptionsGroup" style="display: ${curMethod === 'auto' ? 'block' : 'none'}; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Base Projectiles:</label>
              <input type="number" name="projectileCount" value="${s.projectileCount ?? 3}" placeholder="3" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Per Upcast Lvl:</label>
              <input type="number" name="upcastProjectiles" value="${s.upcastProjectiles ?? 1}" placeholder="1" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
          </div>
        </div>

        <div id="healOptionsGroup" style="display: ${['heal', 'temp_hp', 'max_hp'].includes(curMethod) ? 'block' : 'none'}; background: rgba(40,167,69,0.08); border: 1px solid #28a745; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em;">
            <span style="font-weight: 600;">Add Spell Mod to Total?</span>
            <input type="checkbox" name="addAbilityModToValue" id="addAbilityModToValue" ${s.addAbilityModToValue ? 'checked' : ''} style="margin: 0;" />
          </label>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Casting Time:</label>
            <input type="text" name="castingTime" value="${s.castingTime ?? '1 Action'}" placeholder="1 Action" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Range:</label>
            <input type="text" name="range" value="${s.range ?? 'Touch'}" placeholder="60 ft, Touch" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Duration:</label>
            <input type="text" name="duration" value="${s.duration ?? 'Instantaneous'}" placeholder="Instantaneous" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div style="display: flex; align-items: flex-end;">
            <label style="display: flex; align-items: center; gap: 4px; font-size: 0.8em; cursor: pointer; color: #a34848; font-weight: bold; padding-bottom: 4px;">
              <input type="checkbox" name="concentration" ${s.concentration ? 'checked' : ''} style="margin: 0;" /> Concentration
            </label>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Target Type:</label>
          <select name="targetType" id="targetTypeSelect" style="width: 100%; height: 26px; font-size: 0.85em;">
            <option value="self" ${curTarget === 'self' ? 'selected' : ''}>Self</option>
            <option value="point" ${curTarget === 'point' ? 'selected' : ''}>Point</option>
            <option value="creature" ${curTarget === 'creature' ? 'selected' : ''}>Creature(s)</option>
            <option value="object" ${curTarget === 'object' ? 'selected' : ''}>Object(s)</option>
            <option value="creature_object" ${curTarget === 'creature_object' ? 'selected' : ''}>Creature or Object</option>
            <option value="area" ${curTarget === 'area' ? 'selected' : ''}>Area of Effect</option>
          </select>
        </div>

        <div id="areaDetailsGroup" style="display: ${curTarget === 'area' ? 'block' : 'none'}; background: rgba(0,0,0,0.03); border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; margin-bottom: 8px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Shape:</label>
              <select name="areaShape" style="width: 100%; height: 26px; font-size: 0.85em;">
                <option value="cone" ${s.areaShape === 'cone' ? 'selected' : ''}>Cone</option>
                <option value="cube" ${s.areaShape === 'cube' ? 'selected' : ''}>Square / Cube</option>
                <option value="line" ${s.areaShape === 'line' ? 'selected' : ''}>Line</option>
                <option value="sphere" ${s.areaShape === 'sphere' ? 'selected' : ''}>Circle / Sphere</option>
              </select>
            </div>
            <div>
              <label style="font-weight: bold; display: block; font-size: 0.8em;">Size:</label>
              <input type="text" name="areaSize" value="${s.areaSize ?? ''}" placeholder="20 ft radius" style="width: 100%; height: 26px; font-size: 0.85em;" />
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Short Summary:</label>
          <input type="text" name="summary" value="${s.summary ?? ''}" placeholder="Quick effect tooltip" style="width: 100%; height: 26px; font-size: 0.85em;" />
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Dice (Count / Size):</label>
            <div style="display: flex; gap: 4px;">
              <input type="number" name="damageDiceCount" value="${s.damageDiceCount ?? 0}" placeholder="0" style="width: 50%; height: 26px; font-size: 0.85em;" />
              <select name="damageDieSize" style="width: 50%; height: 26px; font-size: 0.85em;">
                <option value="d4" ${curDieSize === 'd4' ? 'selected' : ''}>d4</option>
                <option value="d6" ${curDieSize === 'd6' ? 'selected' : ''}>d6</option>
                <option value="d8" ${curDieSize === 'd8' ? 'selected' : ''}>d8</option>
                <option value="d10" ${curDieSize === 'd10' ? 'selected' : ''}>d10</option>
                <option value="d12" ${curDieSize === 'd12' ? 'selected' : ''}>d12</option>
              </select>
            </div>
          </div>
          <div id="damageModeGroup">
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Type Mode:</label>
            <select name="damageMode" id="damageModeSelect" style="width: 100%; height: 26px; font-size: 0.85em;">
              <option value="static" ${curDamageMode === 'static' ? 'selected' : ''}>Fixed</option>
              <option value="choice" ${curDamageMode === 'choice' ? 'selected' : ''}>Choice (On Cast)</option>
              <option value="chaos" ${curDamageMode === 'chaos' ? 'selected' : ''}>Chaos Table</option>
            </select>
          </div>
        </div>

        <div id="fixedDamageTypeGroup" class="form-group" style="display: ${curDamageMode === 'static' ? 'block' : 'none'}; margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; font-size: 0.8em;">Fixed Damage Type:</label>
          <select name="damageType" style="width: 100%; height: 26px; font-size: 0.85em;">
            ${generateDamageTypeOptions(s.damageType || "fire")}
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Extra Dice Formula:</label>
            <input type="text" name="extraDiceFormula" value="${s.extraDiceFormula ?? ''}" placeholder="e.g. 1d4" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Upcast Dice Formula:</label>
            <input type="text" name="upcastDiceFormula" value="${s.upcastDiceFormula ?? ''}" placeholder="e.g. 1d8" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
          <div>
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Flat Bonus:</label>
            <input type="number" name="flatDamageBonus" value="${s.flatDamageBonus ?? 0}" placeholder="0" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
          <div id="explodeGroup">
            <label style="font-weight: bold; display: block; font-size: 0.8em;">Explode Condition:</label>
            <input type="text" name="explodeCondition" value="${s.explodeCondition ?? ''}" placeholder="e.g. x8" style="width: 100%; height: 26px; font-size: 0.85em;" />
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #eee; padding-top: 6px;">
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
            <span>Cantrip Dice Scaling (Lvl 5, 11, 17)</span>
            <input type="checkbox" name="isCantripScale" ${s.isCantripScale ? 'checked' : ''} style="margin: 0;" />
          </label>
          <label id="chaosJumpGroup" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
            <span>Chaos Jump on Matching d8s</span>
            <input type="checkbox" name="chaosJump" ${s.chaosJump ? 'checked' : ''} style="margin: 0;" />
          </label>
          <label id="superAdvGroup" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em;">
            <span>Elven Accuracy (Super Advantage)</span>
            <input type="checkbox" name="superAdv" ${s.superAdv ? 'checked' : ''} style="margin: 0;" />
          </label>
        </div>
      </form>
    `;

      new Dialog({
        title: `Edit Spell: ${name}`,
        content: content,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: "Save Changes",
            callback: async (html) => {
              const getVal = (n) => html.find(`[name="${n}"]`).val();
              const getCheck = (n) => html.find(`[name="${n}"]`).is(':checked');

              const newSpellName = getVal("spellName")?.trim() || name;
              const spellData = {
                spellName: newSpellName,
                spellAbility: getVal("spellAbility"),
                baseLevel: Number(getVal("baseLevel")) || 0,
                resolutionMethod: getVal("resolutionMethod") || "attack",
                saveAbility: getVal("saveAbility") || "dex",
                saveSuccess: getVal("saveSuccess") || "half",
                isMultiAttack: getCheck("isMultiAttack"),
                attackCount: Number(getVal("attackCount")) || 1,
                upcastAttacks: Number(getVal("upcastAttacks")) || 0,
                cantripAttackScaling: getCheck("cantripAttackScaling"),
                projectileCount: Number(getVal("projectileCount")) || 3,
                upcastProjectiles: Number(getVal("upcastProjectiles")) || 1,
                addAbilityModToValue: getCheck("addAbilityModToValue"),
                castingTime: getVal("castingTime")?.trim() || "1 Action",
                range: getVal("range")?.trim() || "Touch",
                duration: getVal("duration")?.trim() || "Instantaneous",
                concentration: getCheck("concentration"),
                targetType: getVal("targetType") || "creature",
                areaShape: getVal("areaShape") || "cone",
                areaSize: getVal("areaSize")?.trim() || "",
                summary: getVal("summary")?.trim() || "",
                damageDiceCount: Number(getVal("damageDiceCount")) || 0,
                damageDieSize: getVal("damageDieSize"),
                extraDiceFormula: getVal("extraDiceFormula")?.trim() || "",
                upcastDiceFormula: getVal("upcastDiceFormula")?.trim() || "",
                damageMode: getVal("damageMode"),
                damageType: getVal("damageType") || "fire",
                flatDamageBonus: Number(getVal("flatDamageBonus")) || 0,
                explodeCondition: getVal("explodeCondition")?.trim() || "",
                chaosJump: getCheck("chaosJump"),
                attackModifier: Number(getVal("attackModifier")) || 0,
                isCantripScale: getCheck("isCantripScale"),
                superAdv: getCheck("superAdv"),
                components: s.components || { v: true, s: true, m: false, costly: false, description: "" }
              };

              if (newSpellName !== name) {
                delete spells[name];
              }
              spells[newSpellName] = spellData;

              await window.CustomRolls.setProfileData(actor, "spellConfigs", spells);
              await actor.setFlag("world", "spellConfigs", spells);
              ui.notifications.info(`Updated "${newSpellName}" in Persistent Storage.`);
              renderUnifiedManager();
            }
          },
          cancel: { label: "Cancel" }
        },
        default: "save",
        render: (html) => {
          const resSelect = html.find('#resMethodSelect');
          const saveGroup = html.find('#saveOptionsGroup');
          const autoGroup = html.find('#autoOptionsGroup');
          const healGroup = html.find('#healOptionsGroup');
          const multiGroup = html.find('#multiAttackOptionsGroup');
          const isMultiCheck = html.find('#isMultiAttackCheck');
          const multiDetails = html.find('#multiAttackDetails');
          const targetTypeSelect = html.find('#targetTypeSelect');
          const areaGroup = html.find('#areaDetailsGroup');
          const damageModeSelect = html.find('#damageModeSelect');
          const fixedGroup = html.find('#fixedDamageTypeGroup');

          isMultiCheck.on('change', () => {
            multiDetails.toggle(isMultiCheck.is(':checked'));
          });

          targetTypeSelect.on('change', () => {
            areaGroup.toggle(targetTypeSelect.val() === 'area');
          });

          damageModeSelect.on('change', () => {
            fixedGroup.toggle(damageModeSelect.val() === 'static');
          });

          resSelect.on('change', () => {
            const val = resSelect.val();
            saveGroup.toggle(val === 'save');
            autoGroup.toggle(val === 'auto');
            healGroup.toggle(['heal', 'temp_hp', 'max_hp'].includes(val));
            multiGroup.toggle(val === 'attack');
          });
        }
      }, {
        width: 440,
        height: "auto",
        resizable: true
      }).render(true);
    };

    renderUnifiedManager();
  };
}
