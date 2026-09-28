// =============================================================================
// CLIENT-SIDE DIALOG LAUNCHERS
// =============================================================================

export function initCustomRolls() {
  if (!game.settings.get("cheapdice", "featureCustomRolls")) return;

  window.CustomRolls = window.CustomRolls || {};

window.CustomRolls = window.CustomRolls || {};



// --- Persistent Profile Storage Helpers ---
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

// --- 3.1 D20 Test Client-Side Dialog Launcher ---
window.CustomRolls.openD20Dialog = function () {
  if (!game.settings.get("cheapdice", "featureCustomRolls")) return;

  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

  if (!token) {
    return ui.notifications.warn("Please select your token first.");
  }

  const actor = token.actor;
  if (!actor || !actor.isOwner) {
    return ui.notifications.warn("You don't have permissions to use this token.");
  }

  function getNumericValue(val, fallback = 0) {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (val && typeof val === "object" && typeof val.value === "number") return val.value;
    const parsed = Number(val);
    return isNaN(parsed) ? fallback : parsed;
  }

  function formatSign(num) {
    return num >= 0 ? `+${num}` : `${num}`;
  }

  const storedProfiles = window.CustomRolls.getProfileData(actor, "d20Profiles") || actor.getFlag("world", "d20Profiles") || {};

  const TOOLS = {
    alchemist: { name: "Alchemist Supplies", ability: "int", desc: "Utilize: Identify a substance (DC 15), or start a fire (DC 15)\n\nCraft: Acid, Alchemist’s Fire, Component Pouch, Oil, Paper, Perfume" },
    brewer: { name: "Brewer's Supplies", ability: "int", desc: "Utilize: Detect poisoned drink (DC 15), or identify alcohol (DC 10)\n\nCraft: Antitoxin" },
    calligrapher: { name: "Calligrapher's Supplies", ability: "dex", desc: "Utilize: Write text with impressive flourishes that guard against forgery (DC 15)\n\nCraft: Ink, Spell Scroll" },
    carpenter: { name: "Carpenter's Tools", ability: "str", desc: "Utilize: Seal or pry open a door or container (DC 20)\n\nCraft: Club, Greatclub, Quarterstaff, Barrel, Chest, Ladder, Pole, Portable Ram, Torch" },
    cartographer: { name: "Cartographer's Tools", ability: "wis", desc: "Utilize: Draft a map of a small area (DC 15)\n\nCraft: Map" },
    cobbler: { name: "Cobbler's Tools", ability: "dex", desc: "Utilize: Modify footwear to give Advantage on the wearer’s next Dexterity (Acrobatics) check (DC 10)\n\nCraft: Climber’s Kit" },
    cook: { name: "Cook's Utensils", ability: "wis", desc: "Utilize: Improve food’s flavor (DC 10), or detect spoiled or poisoned food (DC 15)\n\nCraft: Rations" },
    disguise: { name: "Disguise Kit", ability: "cha", desc: "Utilize: Apply makeup (DC 10)\n\nCraft: Costume" },
    forgery: { name: "Forgery Kit", ability: "dex", desc: "Utilize: Mimic 10 or fewer words of someone else’s handwriting (DC 15), or duplicate a wax seal (DC 20)" },
    gaming: { name: "Gaming Set", ability: "wis", desc: "Utilize: Discern whether someone is cheating (DC 10), or win the game (DC 20)" },
    glassblower: { name: "Glassblower's Tools", ability: "int", desc: "Utilize: Discern what a glass object held in the past 24 hours (DC 15)\n\nCraft: Glass Bottle, Magnifying Glass, Spyglass, Vial" },
    herbalism: { name: "Herbalism Kit", ability: "int", desc: "Utilize: Identify a plant (DC 10)\n\nCraft: Antitoxin, Candle, Healer’s Kit, Potion of Healing" },
    jeweler: { name: "Jeweler's Tools", ability: "int", desc: "Utilize: Discern a gem’s value (DC 15)\n\nCraft: Arcane Focus, Holy Symbol" },
    leatherworker: { name: "Leatherworker's Tools", ability: "dex", desc: "Utilize: Add a design to a leather item (DC 10)\n\nCraft: Sling, Whip, Hide Armor, Leather Armor, Studded Leather Armor, Backpack, Crossbow Bolt Case, Map or Scroll Case, Parchment, Pouch, Quiver, Waterskin" },
    mason: { name: "Mason's Tools", ability: "str", desc: "Utilize: Chisel a symbol or hole in stone (DC 10)\n\nCraft: Block and Tackle" },
    musical: { name: "Musical Instrument", ability: "cha", desc: "Utilize: Play a known tune (DC 10), or improvise a song (DC 15)" },
    navigator: { name: "Navigator's Tools", ability: "wis", desc: "Utilize: Plot a course (DC 10), or determine position by stargazing (DC 15)" },
    painter: { name: "Painter's Supplies", ability: "wis", desc: "Utilize: Paint a recognizable image of something you’ve seen (DC 10)\n\nCraft: Druidic Focus, Holy Symbol" },
    poisoner: { name: "Poisoner's Kit", ability: "int", desc: "Utilize: Detect a poisoned object (DC 10)" },
    potter: { name: "Potter's Tools", ability: "int", desc: "Utilize: Discern what a ceramic object held in the past 24 hours (DC 15)\n\nCraft: Jug, Lamp" },
    smith: { name: "Smith's Tools", ability: "str", desc: "Utilize: Pry open a door or container (DC 20)\n\nCraft: Any Melee weapon (except Club, Greatclub, Quarterstaff, and Whip), Medium armor (except Hide), Heavy armor, Ball Bearings, Bucket, Caltrops, Chain, Crowbar, Firearm Bullets, Grappling Hook, Iron Pot, Iron Spikes, Sling Bullets" },
    thieves: { name: "Thieves' Tools", ability: "dex", desc: "Utilize: Pick a lock (DC 15), or disarm a trap (DC 15)" },
    tinker: { name: "Tinker's Tools", ability: "dex", desc: "Utilize: Assemble a Tiny item composed of scrap, which falls apart in 1 minute (DC 20)\n\nCraft: Musket, Pistol, Bell, Bullseye Lantern, Flask, Hooded Lantern, Hunting Trap, Lock, Manacles, Mirror, Shovel, Signal Whistle, Tinderbox" },
    weaver: { name: "Weaver's Tools", ability: "dex", desc: "Utilize: Mend a tear in clothing (DC 10), or sew a Tiny design (DC 10)\n\nCraft: Padded Armor, Basket, Bedroll, Blanket, Fine Clothes, Net, Robe, Rope, Sack, String, Tent, Traveler's Clothes" },
    woodcarver: { name: "Woodcarver's Tools", ability: "dex", desc: "Utilize: Carve a pattern in wood (DC 10)\n\nCraft: Club, Greatclub, Quarterstaff, Ranged weapons (except Pistol, Musket, and Sling), Arcane Focus, Arrows, Bolts, Druidic Focus, Ink Pen, Needles" }
  };

  const DESCRIPTIONS = {
    acr: "Stay on your feet in a tricky situation, or perform an acrobatic stunt.",
    ani: "Calm or train an animal, or get an animal to behave in a certain way.",
    arc: "Recall lore about spells, magic items, and the planes of existence.",
    ath: "Jump farther than normal, stay afloat in rough water, or break something.",
    dec: "Tell a convincing lie, or wear a disguise convincingly.",
    his: "Recall lore about historical events, people, nations, and cultures.",
    ins: "Discern a person’s mood and intentions.",
    itm: "Awe or threaten someone into doing what you want.",
    inv: "Find obscure information in books, or deduce how something works.",
    med: "Diagnose an illness, or determine what killed the recently slain.",
    nat: "Recall lore about terrain, plants, animals, and weather.",
    prc: "Using a combination of senses, notice something that’s easy to miss.",
    prf: "Act, tell a story, perform music, or dance.",
    per: "Honestly and graciously convince someone of something.",
    rel: "Recall lore about gods, religious rituals, and holy symbols.",
    slt: "Pick a pocket, conceal a handheld object, or perform legerdemain.",
    ste: "Escape notice by moving quietly and hiding behind things.",
    sur: "Follow tracks, forage, find a trail, or avoid natural hazards.",

    check_str: "Measures bodily power, athletic training, and the extent to which you can exert raw physical force.\n\nUse to lift, push, pull, or break something.",
    check_dex: "Measures agility, reflexes, balance, fine motor control, and swift movement.\n\nUse to move nimbly, quickly, or quietly.",
    check_con: "Measures health, stamina, vital force, and bodily endurance under strain.\n\nUse to push your body beyond normal limits.",
    check_int: "Measures mental acuity, accuracy of recall, and the ability to reason logically.\n\nUse to reason or remember.",
    check_wis: "Reflects how attuned you are to your surroundings and represents perceptiveness, intuition, and willpower.\n\nUse to notice things in the environment or in creature's behavior.",
    check_cha: "Measures your ability to interact effectively with others, confidence, eloquence, and forceful personality.\n\nUse to influence, entertain or deceive.",

    save_str: "Resisting effects that physically push, knock down, restrain, or crush you.",
    save_dex: "Dodging out of harm's way, avoiding area-of-effect spells like Fireball, or evading sudden hazards and traps.",
    save_con: "Withstanding poisons, diseases, toxic gases, extreme exhaustion, or cold and heat hazards.",
    save_int: "Resisting psychic incursions or illusions that challenge logic.",
    save_wis: "Resisting charm effects, fright, mind control, or magical influence aimed at your willpower.",
    save_cha: "Resisting effects that banish you to other planes, override your self-identity, or possess your spirit.",

    concentration: "Maintaining focus on an ongoing spell when you take damage. The DC is 10 or half the damage taken, whichever is higher.",
    init: "Determines turn order at the start of combat. Tied rolls are broken by the higher raw Dexterity score."
  };

  const ABILITIES = {
    str: "Strength",
    dex: "Dexterity",
    con: "Constitution",
    int: "Intelligence",
    wis: "Wisdom",
    cha: "Charisma"
  };

  const SKILLS = {
    acr: "Acrobatics (DEX)",
    ani: "Animal Handling (WIS)",
    arc: "Arcana (INT)",
    ath: "Athletics (STR)",
    dec: "Deception (CHA)",
    his: "History (INT)",
    ins: "Insight (WIS)",
    itm: "Intimidation (CHA)",
    inv: "Investigation (INT)",
    med: "Medicine (WIS)",
    nat: "Nature (INT)",
    prc: "Perception (WIS)",
    prf: "Performance (CHA)",
    per: "Persuasion (CHA)",
    rel: "Religion (INT)",
    slt: "Sleight of Hand (DEX)",
    ste: "Stealth (DEX)",
    sur: "Survival (WIS)"
  };

  const pb = getNumericValue(actor.system.attributes?.prof, 2);

  const customTests = {};
  Object.entries(storedProfiles).forEach(([k, val]) => {
    if (k.startsWith("custom_")) {
      const abil = val.ability || "int";
      const abilMod = getNumericValue(actor.system.abilities?.[abil]?.mod, 0);
      const cat = val.category || "skill";
      const optHtml = `<option value="${k}" data-custom="true" data-abil="${abil}">${val.name} (${abil.toUpperCase()}) ${formatSign(abilMod)}</option>`;
      if (!customTests[cat]) customTests[cat] = [];
      customTests[cat].push(optHtml);
    }
  });

  const toolEntries = Object.entries(TOOLS).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const toolOptionsHtml = [
    ...toolEntries.map(([k, t]) => {
      const abilMod = getNumericValue(actor.system.abilities?.[t.ability]?.mod, 0);
      const toolItem = actor.items.find(i => i.type === "tool" && i.name.toLowerCase().includes(t.name.toLowerCase().split("'")[0]));
      const isProf = actor.system.tools?.[k]?.proficient || toolItem?.system?.proficient || 0;
      const bonus = abilMod + (isProf ? pb * (isProf === 2 ? 2 : 1) : 0);
      return `<option value="${k}">${t.name} (${t.ability.toUpperCase()}) ${formatSign(bonus)}</option>`;
    }),
    ...(customTests["tool"] || [])
  ].join('');

  const standardSkillOptions = Object.keys(SKILLS).map(k => {
    const mod = getNumericValue(actor.system.skills?.[k]?.total, 0);
    return `<option value="${k}">${SKILLS[k]} ${formatSign(mod)}</option>`;
  });
  const skillOptionsHtml = [...standardSkillOptions, ...(customTests["skill"] || [])].join('');

  const checkOptionsHtml = [
    ...Object.keys(ABILITIES).map(k => {
      const mod = getNumericValue(actor.system.abilities?.[k]?.mod, 0);
      return `<option value="${k}">${ABILITIES[k]} Check ${formatSign(mod)}</option>`;
    }),
    ...(customTests["check"] || [])
  ].join('');

  const saveOptionsHtml = Object.keys(ABILITIES).map(k => {
    const saveObj = actor.system.abilities?.[k]?.save;
    const modObj = actor.system.abilities?.[k]?.mod;
    const mod = getNumericValue(saveObj, getNumericValue(modObj, 0));
    return `<option value="${k}">${ABILITIES[k]} Save ${formatSign(mod)}</option>`;
  }).join('');

  const conMod = getNumericValue(actor.system.abilities?.con?.mod, 0);
  const rawConSave = getNumericValue(actor.system.abilities?.con?.save, null);
  let conSaveTotal = conMod;
  if (rawConSave !== null) {
    conSaveTotal = rawConSave;
  } else {
    const isProf = actor.system.abilities?.con?.proficient || actor.system.abilities?.con?.prof;
    conSaveTotal = conMod + (isProf ? pb : 0);
  }

  const dexMod = getNumericValue(actor.system.abilities?.dex?.mod, 0);
  const dexScore = getNumericValue(actor.system.abilities?.dex?.value, 10);
  const initBonus = getNumericValue(actor.system.attributes?.init?.bonus, 0);
  const alertBonus = actor.items.some(i => i.name?.toLowerCase().includes("alert")) ? 5 : 0;
  const totalInitMod = dexMod + initBonus + alertBonus;

  const content = `
    <div style="display: flex; gap: 12px; font-family: inherit; min-height: 270px;">
      <div style="flex: 1.2; display: flex; flex-direction: column; gap: 8px; border-right: 1px solid #d2d7df; padding-right: 10px;">
        <div style="display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 4px;">
          <span style="font-weight: 600; font-size: 0.95em; color: #2b3a4a;">D20 Test Roll</span>
          <span style="font-size: 0.8em; color: #777;">${actor.name}</span>
        </div>

        <div>
          <label style="font-weight: 700; font-size: 0.75em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">ROLL TYPE</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
              <input type="radio" name="roll-type" value="skill" checked style="margin: 0;"> Skill Check
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
              <input type="radio" name="roll-type" value="check" style="margin: 0;"> Ability Check
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
              <input type="radio" name="roll-type" value="save" style="margin: 0;"> Saving Throw
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px;">
              <input type="radio" name="roll-type" value="tool" style="margin: 0;"> Tool Check
            </label>
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(163, 72, 72, 0.08); border: 1px solid rgba(163, 72, 72, 0.35); border-radius: 4px;">
              <span style="display: flex; align-items: center; gap: 6px;">
                <input type="radio" name="roll-type" value="concentration" style="margin: 0;"> Concentration
              </span>
              <span style="font-size: 0.78em; font-weight: 700; color: #a34848;">${formatSign(conSaveTotal)}</span>
            </label>
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 4px 6px; background: rgba(43, 116, 137, 0.08); border: 1px solid rgba(43, 116, 137, 0.35); border-radius: 4px;">
              <span style="display: flex; align-items: center; gap: 6px;">
                <input type="radio" name="roll-type" value="init" style="margin: 0;"> Initiative
              </span>
              <span style="font-size: 0.78em; font-weight: 700; color: #235d6e;">${formatSign(totalInitMod)} .${dexScore}</span>
            </label>
          </div>
        </div>

        <div id="roll-options-section">
          <label id="options-label" style="font-weight: 700; font-size: 0.75em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">SELECT SKILL</label>
          <select id="roll-choice" name="roll-choice" style="width: 100%; height: 30px; border-radius: 4px; border: 1px solid #7289da; padding: 2px 6px; font-size: 0.9em;">
            ${skillOptionsHtml}
          </select>
        </div>

        <div id="preset-modifiers-section" style="display: none; flex-direction: column; gap: 3px; background: rgba(0,0,0,0.02); border: 1px dashed #c0c6ce; border-radius: 4px; padding: 4px 6px;">
          <label style="font-weight: 700; font-size: 0.72em; color: #4b5d88; letter-spacing: 0.5px;">PRESET MODIFIERS</label>
          <div id="preset-list" style="display: flex; flex-direction: column; gap: 3px;"></div>
        </div>

        <div>
          <label for="other-modifier" style="font-weight: 700; font-size: 0.75em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 3px;">EXTRA MODIFIER</label>
          <input type="text" id="other-modifier" name="other-modifier" value="" placeholder="e.g. 1d4, +2, or leave blank" style="width: 100%; height: 28px; border-radius: 4px; border: 1px solid #ccc; padding: 2px 6px; font-size: 0.85em;" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 4px; border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 2px;">
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; cursor: pointer; padding: 2px 4px; color: #333;">
            <span>Reliable Talent (Min 10)</span>
            <input type="checkbox" id="reliable-talent" name="reliable-talent" style="margin: 0;">
          </label>
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; cursor: pointer; padding: 2px 4px; color: #333;">
            <span>Halfling Luck (Reroll 1s)</span>
            <input type="checkbox" id="halfling-luck" name="halfling-luck" style="margin: 0;">
          </label>
        </div>
      </div>

      <div style="flex: 1; display: flex; flex-direction: column; background: rgba(0,0,0,0.02); border-radius: 4px; padding: 8px 10px; border: 1px solid #e2e6ea;">
        <div style="border-bottom: 1px solid #d2d7df; padding-bottom: 4px; margin-bottom: 8px;">
          <div id="desc-title" style="font-weight: 700; font-size: 0.85em; color: #2b3a4a; text-transform: uppercase; letter-spacing: 0.5px;">Acrobatics</div>
          <div id="desc-subtitle" style="font-size: 0.75em; color: #777;">Skill Check</div>
        </div>
        <div id="desc-body" style="font-size: 0.82em; line-height: 1.45; color: #444; overflow-y: auto; flex: 1; white-space: pre-wrap;">
          ${DESCRIPTIONS.acr}
        </div>
      </div>
    </div>
  `;

  let performRoll = false;

  new Dialog({
    title: `${actor.name}: D20 Test`,
    content: content,
    buttons: {
      roll: {
        icon: '<i class="fas fa-dice-d20" style="margin-right: 4px;"></i>',
        label: "Roll",
        callback: () => { performRoll = true; }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll",
    render: (html) => {
      const rollChoiceSelect = html.find('#roll-choice');
      const optionsSection = html.find('#roll-options-section');
      const optionsLabel = html.find('#options-label');
      const presetSection = html.find('#preset-modifiers-section');
      const presetList = html.find('#preset-list');
      const reliableTalentCheckbox = html.find('#reliable-talent');
      const halflingLuckCheckbox = html.find('#halfling-luck');
      const descTitle = html.find('#desc-title');
      const descSubtitle = html.find('#desc-subtitle');
      const descBody = html.find('#desc-body');

      const updatePresets = () => {
        const choice = rollChoiceSelect.val();
        const profileObj = storedProfiles[choice];
        const activePresets = Array.isArray(profileObj) ? profileObj : (profileObj?.modifiers || []);

        if (activePresets.length > 0) {
          const listHtml = activePresets.map((p, idx) => `
            <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8em; cursor: pointer; padding: 2px 4px; background: #fff; border: 1px solid #d2d7df; border-radius: 3px;">
              <span>${p.label} <b style="color: #4b5d88;">(${p.formula})</b></span>
              <input type="checkbox" class="preset-mod-toggle" data-formula="${p.formula}" ${p.enabled ? 'checked' : ''} style="margin: 0;">
            </label>
          `).join('');
          presetList.html(listHtml);
          presetSection.css('display', 'flex');
        } else {
          presetSection.hide();
          presetList.empty();
        }
      };

      const updateDescription = () => {
        const selectedType = html.find('input[name="roll-type"]:checked').val();
        const choice = rollChoiceSelect.val();

        if (choice && choice.startsWith("custom_")) {
          const customData = storedProfiles[choice];
          const name = customData?.name || "Custom Test";
          const abil = (customData?.ability || "int").toUpperCase();
          descTitle.text(name);
          descSubtitle.text(`Custom ${abil} Test`);
          descBody.text(`Custom D20 check governed by ${actor.name}'s ${abil} modifier.`);
        } else if (selectedType === 'skill') {
          const selectedText = rollChoiceSelect.find('option:selected').text();
          descTitle.text(selectedText.split(' (')[0] || "Skill");
          descSubtitle.text("Skill Check");
          descBody.text(DESCRIPTIONS[choice] || "No description available.");
        } else if (selectedType === 'tool') {
          const tool = TOOLS[choice];
          descTitle.text(tool?.name || "Tool");
          descSubtitle.text(`${tool?.ability.toUpperCase()} Tool Check`);
          descBody.text(tool?.desc || "No description available.");
        } else if (selectedType === 'save') {
          const abilName = ABILITIES[choice] || choice?.toUpperCase();
          descTitle.text(`${abilName} Save`);
          descSubtitle.text("Saving Throw");
          descBody.text(DESCRIPTIONS[`save_${choice}`] || "No description available.");
        } else if (selectedType === 'check') {
          const abilName = ABILITIES[choice] || choice?.toUpperCase();
          descTitle.text(`${abilName} Check`);
          descSubtitle.text("Ability Check");
          descBody.text(DESCRIPTIONS[`check_${choice}`] || "No description available.");
        } else if (selectedType === 'concentration') {
          descTitle.text("Concentration");
          descSubtitle.text("Constitution Check");
          descBody.text(DESCRIPTIONS.concentration);
        } else if (selectedType === 'init') {
          descTitle.text("Initiative");
          descSubtitle.text("Dexterity Check");
          descBody.text(DESCRIPTIONS.init);
        }

        updatePresets();
      };

      const updateOptions = () => {
        const selectedType = html.find('input[name="roll-type"]:checked').val();

        if (selectedType === 'skill') {
          optionsSection.show();
          optionsLabel.text('SELECT SKILL');
          rollChoiceSelect.html(skillOptionsHtml);
          reliableTalentCheckbox.prop('disabled', false).parent().css('opacity', 1);
          halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
        } else if (selectedType === 'check') {
          optionsSection.show();
          optionsLabel.text('SELECT ABILITY CHECK');
          rollChoiceSelect.html(checkOptionsHtml);
          reliableTalentCheckbox.prop('disabled', true).prop('checked', false).parent().css('opacity', 0.5);
          halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
        } else if (selectedType === 'save') {
          optionsSection.show();
          optionsLabel.text('SELECT SAVING THROW');
          rollChoiceSelect.html(saveOptionsHtml);
          reliableTalentCheckbox.prop('disabled', true).prop('checked', false).parent().css('opacity', 0.5);
          halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
        } else if (selectedType === 'tool') {
          optionsSection.show();
          optionsLabel.text('SELECT TOOL');
          rollChoiceSelect.html(toolOptionsHtml);
          reliableTalentCheckbox.prop('disabled', false).parent().css('opacity', 1);
          halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
        } else {
          optionsSection.hide();
          presetSection.hide();
          reliableTalentCheckbox.prop('disabled', true).prop('checked', false).parent().css('opacity', 0.5);
          halflingLuckCheckbox.prop('disabled', false).parent().css('opacity', 1);
        }

        updateDescription();
      };

      updateOptions();
      html.find('input[name="roll-type"]').on('change', updateOptions);
      rollChoiceSelect.on('change', updateDescription);
    },
    close: async (html) => {
      if (!performRoll) return;

      const rollType = html.find('input[name="roll-type"]:checked').val();
      const key = html.find('#roll-choice').val();
      const isReliableTalent = html.find('#reliable-talent').is(':checked');
      const isHalflingLuck = html.find('#halfling-luck').is(':checked');

      const activePresetFormulas = [];
      html.find('.preset-mod-toggle:checked').each((_, el) => {
        const form = $(el).data('formula');
        if (form) activePresetFormulas.push(form);
      });

      const manualMod = html.find('#other-modifier').val()?.trim() || "";
      if (manualMod) activePresetFormulas.push(manualMod);

      const otherModString = activePresetFormulas.join(" + ");

      if (!globalThis.attackSocket) {
        return ui.notifications.error("SocketLib attack handler is not initialized. Please refresh the page.");
      }

      await globalThis.attackSocket.executeAsGM("runD20TestRoll", {
        rollType,
        key,
        isReliableTalent,
        isHalflingLuck,
        otherModString
      }, actor.id, game.user.id);
    }
  }, { width: 560, height: 'auto' }).render(true);
};

// =========================================================================
// VERSION 2: D20 TEST MINI CHARACTER SHEET LAUNCHER (REFINED & COMPACT)
// =========================================================================
window.CustomRolls.openD20DialogV2 = function () {
  if (!game.settings.get("cheapdice", "featureCustomRolls")) return;

  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

  if (!token) {
    return ui.notifications.warn("Please select your token first.");
  }

  const actor = token.actor;
  if (!actor || !actor.isOwner) {
    return ui.notifications.warn("You don't have permissions to use this token.");
  }

  function getNumericValue(val, fallback = 0) {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (val && typeof val === "object" && typeof val.value === "number") return val.value;
    const parsed = Number(val);
    return isNaN(parsed) ? fallback : parsed;
  }

  function formatSign(num) {
    return num >= 0 ? `+${num}` : `${num}`;
  }

  const storedProfiles = window.CustomRolls.getProfileData?.(actor, "d20ProfilesV2") || actor.getFlag("world", "d20ProfilesV2") || {};

  const TOOLS = {
    alchemist: { name: "Alchemist Supplies", ability: "int", desc: "Utilize: Identify a substance (DC 15), or start a fire (DC 15)\n\nCraft: Acid, Alchemist’s Fire, Component Pouch, Oil, Paper, Perfume" },
    brewer: { name: "Brewer's Supplies", ability: "int", desc: "Utilize: Detect poisoned drink (DC 15), or identify alcohol (DC 10)\n\nCraft: Antitoxin" },
    calligrapher: { name: "Calligrapher's Supplies", ability: "dex", desc: "Utilize: Write text with impressive flourishes that guard against forgery (DC 15)\n\nCraft: Ink, Spell Scroll" },
    carpenter: { name: "Carpenter's Tools", ability: "str", desc: "Utilize: Seal or pry open a door or container (DC 20)\n\nCraft: Club, Greatclub, Quarterstaff, Barrel, Chest, Ladder, Pole, Portable Ram, Torch" },
    cartographer: { name: "Cartographer's Tools", ability: "wis", desc: "Utilize: Draft a map of a small area (DC 15)\n\nCraft: Map" },
    cobbler: { name: "Cobbler's Tools", ability: "dex", desc: "Utilize: Modify footwear to give Advantage on the wearer’s next Dexterity (Acrobatics) check (DC 10)\n\nCraft: Climber’s Kit" },
    cook: { name: "Cook's Utensils", ability: "wis", desc: "Utilize: Improve food’s flavor (DC 10), or detect spoiled or poisoned food (DC 15)\n\nCraft: Rations" },
    disguise: { name: "Disguise Kit", ability: "cha", desc: "Utilize: Apply makeup (DC 10)\n\nCraft: Costume" },
    forgery: { name: "Forgery Kit", ability: "dex", desc: "Utilize: Mimic 10 or fewer words of someone else’s handwriting (DC 15), or duplicate a wax seal (DC 20)" },
    gaming: { name: "Gaming Set", ability: "wis", desc: "Utilize: Discern whether someone is cheating (DC 10), or win the game (DC 20)" },
    glassblower: { name: "Glassblower's Tools", ability: "int", desc: "Utilize: Discern what a glass object held in the past 24 hours (DC 15)\n\nCraft: Glass Bottle, Magnifying Glass, Spyglass, Vial" },
    herbalism: { name: "Herbalism Kit", ability: "int", desc: "Utilize: Identify a plant (DC 10)\n\nCraft: Antitoxin, Candle, Healer’s Kit, Potion of Healing" },
    jeweler: { name: "Jeweler's Tools", ability: "int", desc: "Utilize: Discern a gem’s value (DC 15)\n\nCraft: Arcane Focus, Holy Symbol" },
    leatherworker: { name: "Leatherworker's Tools", ability: "dex", desc: "Utilize: Add a design to a leather item (DC 10)\n\nCraft: Sling, Whip, Hide Armor, Leather Armor, Studded Leather Armor, Backpack, Crossbow Bolt Case, Map or Scroll Case, Parchment, Pouch, Quiver, Waterskin" },
    mason: { name: "Mason's Tools", ability: "str", desc: "Utilize: Chisel a symbol or hole in stone (DC 10)\n\nCraft: Block and Tackle" },
    musical: { name: "Musical Instrument", ability: "cha", desc: "Utilize: Play a known tune (DC 10), or improvise a song (DC 15)" },
    navigator: { name: "Navigator's Tools", ability: "wis", desc: "Utilize: Plot a course (DC 10), or determine position by stargazing (DC 15)" },
    painter: { name: "Painter's Supplies", ability: "wis", desc: "Utilize: Paint a recognizable image of something you’ve seen (DC 10)\n\nCraft: Druidic Focus, Holy Symbol" },
    poisoner: { name: "Poisoner's Kit", ability: "int", desc: "Utilize: Detect a poisoned object (DC 10)" },
    potter: { name: "Potter's Tools", ability: "int", desc: "Utilize: Discern what a ceramic object held in the past 24 hours (DC 15)\n\nCraft: Jug, Lamp" },
    smith: { name: "Smith's Tools", ability: "str", desc: "Utilize: Pry open a door or container (DC 20)\n\nCraft: Any Melee weapon (except Club, Greatclub, Quarterstaff, and Whip), Medium armor (except Hide), Heavy armor, Ball Bearings, Bucket, Caltrops, Chain, Crowbar, Firearm Bullets, Grappling Hook, Iron Pot, Iron Spikes, Sling Bullets" },
    thieves: { name: "Thieves' Tools", ability: "dex", desc: "Utilize: Pick a lock (DC 15), or disarm a trap (DC 15)" },
    tinker: { name: "Tinker's Tools", ability: "dex", desc: "Utilize: Assemble a Tiny item composed of scrap, which falls apart in 1 minute (DC 20)\n\nCraft: Musket, Pistol, Bell, Bullseye Lantern, Flask, Hooded Lantern, Hunting Trap, Lock, Manacles, Mirror, Shovel, Signal Whistle, Tinderbox" },
    weaver: { name: "Weaver's Tools", ability: "dex", desc: "Utilize: Mend a tear in clothing (DC 10), or sew a Tiny design (DC 10)\n\nCraft: Padded Armor, Basket, Bedroll, Blanket, Fine Clothes, Net, Robe, Rope, Sack, String, Tent, Traveler's Clothes" },
    woodcarver: { name: "Woodcarver's Tools", ability: "dex", desc: "Utilize: Carve a pattern in wood (DC 10)\n\nCraft: Club, Greatclub, Quarterstaff, Ranged weapons (except Pistol, Musket, and Sling), Arcane Focus, Arrows, Bolts, Druidic Focus, Ink Pen, Needles" }
  };

  const DESCRIPTIONS = {
    acr: "Stay on your feet in a tricky situation, or perform an acrobatic stunt.",
    ani: "Calm or train an animal, or get an animal to behave in a certain way.",
    arc: "Recall lore about spells, magic items, and the planes of existence.",
    ath: "Jump farther than normal, stay afloat in rough water, or break something.",
    dec: "Tell a convincing lie, or wear a disguise convincingly.",
    his: "Recall lore about historical events, people, nations, and cultures.",
    ins: "Discern a person’s mood and intentions.",
    itm: "Awe or threaten someone into doing what you want.",
    inv: "Find obscure information in books, or deduce how something works.",
    med: "Diagnose an illness, or determine what killed the recently slain.",
    nat: "Recall lore about terrain, plants, animals, and weather.",
    prc: "Using a combination of senses, notice something that’s easy to miss.",
    prf: "Act, tell a story, perform music, or dance.",
    per: "Honestly and graciously convince someone of something.",
    rel: "Recall lore about gods, religious rituals, and holy symbols.",
    slt: "Pick a pocket, conceal a handheld object, or perform legerdemain.",
    ste: "Escape notice by moving quietly and hiding behind things.",
    sur: "Follow tracks, forage, find a trail, or avoid natural hazards.",

    check_str: "Measures bodily power, athletic training, and the extent to which you can exert raw physical force.\n\nUse to lift, push, pull, or break something.",
    check_dex: "Measures agility, reflexes, balance, fine motor control, and swift movement.\n\nUse to move nimbly, quickly, or quietly.",
    check_con: "Measures health, stamina, vital force, and bodily endurance under strain.\n\nUse to push your body beyond normal limits.",
    check_int: "Measures mental acuity, accuracy of recall, and the ability to reason logically.\n\nUse to reason or remember.",
    check_wis: "Reflects how attuned you are to your surroundings and represents perceptiveness, intuition, and willpower.\n\nUse to notice things in the environment or in creature's behavior.",
    check_cha: "Measures your ability to interact effectively with others, confidence, eloquence, and forceful personality.\n\nUse to influence, entertain or deceive.",

    save_str: "Resisting effects that physically push, knock down, restrain, or crush you.",
    save_dex: "Dodging out of harm's way, avoiding area-of-effect spells like Fireball, or evading sudden hazards and traps.",
    save_con: "Withstanding poisons, diseases, toxic gases, extreme exhaustion, or cold and heat hazards.",
    save_int: "Resisting psychic incursions or illusions that challenge logic.",
    save_wis: "Resisting charm effects, fright, mind control, or magical influence aimed at your willpower.",
    save_cha: "Resisting effects that banish you to other planes, override your self-identity, or possess your spirit.",

    concentration: "Maintaining focus on an ongoing spell when you take damage. The DC is 10 or half the damage taken, whichever is higher.",
    init: "Determines turn order at the start of combat. Tied rolls are broken by the higher raw Dexterity score."
  };

  const ABILITIES = {
    str: "Strength",
    dex: "Dexterity",
    con: "Constitution",
    int: "Intelligence",
    wis: "Wisdom",
    cha: "Charisma"
  };

  const SKILLS = {
    acr: { label: "Acrobatics", ability: "dex" },
    ani: { label: "Animal Handling", ability: "wis" },
    arc: { label: "Arcana", ability: "int" },
    ath: { label: "Athletics", ability: "str" },
    dec: { label: "Deception", ability: "cha" },
    his: { label: "History", ability: "int" },
    ins: { label: "Insight", ability: "wis" },
    itm: { label: "Intimidation", ability: "cha" },
    inv: { label: "Investigation", ability: "int" },
    med: { label: "Medicine", ability: "wis" },
    nat: { label: "Nature", ability: "int" },
    prc: { label: "Perception", ability: "wis" },
    prf: { label: "Performance", ability: "cha" },
    per: { label: "Persuasion", ability: "cha" },
    rel: { label: "Religion", ability: "int" },
    slt: { label: "Sleight of Hand", ability: "dex" },
    ste: { label: "Stealth", ability: "dex" },
    sur: { label: "Survival", ability: "wis" }
  };

  const pb = getNumericValue(actor.system.attributes?.prof, 2);

  const getProfMarker = (level) => {
    if (level === 2) {
      return `<i class="fas fa-star" style="color: #d4af37; font-size: 0.75em; margin-right: 4px; width: 10px; text-align: center;"></i>`;
    }
    if (level === 1) {
      return `<i class="fas fa-circle" style="color: #2b7489; font-size: 0.72em; margin-right: 4px; width: 10px; text-align: center;"></i>`;
    }
    if (level === 0.5) {
      return `<i class="fas fa-circle-half-stroke" style="color: #2b7489; font-size: 0.72em; margin-right: 4px; width: 10px; text-align: center;"></i>`;
    }
    return `<i class="far fa-circle" style="color: #b0b5bc; font-size: 0.72em; margin-right: 4px; width: 10px; text-align: center;"></i>`;
  };

  // Top Ability Scores Row
  const abilityCardsHtml = Object.entries(ABILITIES).map(([key, name]) => {
    const score = getNumericValue(actor.system.abilities?.[key]?.value, 10);
    const mod = getNumericValue(actor.system.abilities?.[key]?.mod, 0);
    return `
      <div class="ability-card" data-key="${key}" data-type="check" style="flex: 1; min-width: 38px; background: rgba(0,0,0,0.03); border: 1px solid #d2d7df; border-radius: 4px; padding: 3px 1px; text-align: center; cursor: pointer;">
        <div style="font-size: 0.68em; font-weight: 700; color: #4b5d88; text-transform: uppercase;">${key}</div>
        <div style="font-size: 0.95em; font-weight: 700; color: #222; margin: 1px 0;">${score}</div>
        <button type="button" class="roll-btn-v2" data-type="check" data-key="${key}" title="Roll ${name} Check" style="width: 32px; height: 20px; font-weight: 700; font-size: 0.8em; padding: 0; border-radius: 3px; border: 1px solid #c0c6ce; background: #fff; cursor: pointer; color: #2b3a4a; margin: 0 auto; display: inline-flex; align-items: center; justify-content: center; text-align: center;">
          ${formatSign(mod)}
        </button>
      </div>
    `;
  }).join('');

  // Saving Throws: Col 1 (STR, DEX, CON), Col 2 (INT, WIS, CHA)
  const saveCol1Keys = ["str", "dex", "con"];
  const saveCol2Keys = ["int", "wis", "cha"];

  const buildSaveColHtml = (keys) => keys.map(key => {
    const name = ABILITIES[key];
    const saveObj = actor.system.abilities?.[key]?.save;
    const modObj = actor.system.abilities?.[key]?.mod;
    const saveMod = getNumericValue(saveObj, getNumericValue(modObj, 0));
    const isProf = Boolean(actor.system.abilities?.[key]?.proficient || actor.system.abilities?.[key]?.prof);
    const profIcon = getProfMarker(isProf ? 1 : 0);

    return `
      <div class="save-row" data-key="${key}" data-type="save" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; border-radius: 3px; background: #fff; border: 1px solid #e5e5e5; cursor: pointer; margin-bottom: 2px;">
        <span style="font-size: 0.74em; color: #333; display: flex; align-items: center;">${profIcon}${key.toUpperCase()}</span>
        <button type="button" class="roll-btn-v2" data-type="save" data-key="${key}" title="Roll ${name} Save" style="width: 30px; height: 18px; font-size: 0.74em; font-weight: 700; padding: 0; border: 1px solid #d2d7df; background: #fafafa; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0;">
          ${formatSign(saveMod)}
        </button>
      </div>
    `;
  }).join('');

  // Initiative and Concentration values
  const conMod = getNumericValue(actor.system.abilities?.con?.mod, 0);
  const rawConSave = getNumericValue(actor.system.abilities?.con?.save, null);
  let conSaveTotal = conMod;
  if (rawConSave !== null) {
    conSaveTotal = rawConSave;
  } else {
    const isProf = actor.system.abilities?.con?.proficient || actor.system.abilities?.con?.prof;
    conSaveTotal = conMod + (isProf ? pb : 0);
  }

  const dexMod = getNumericValue(actor.system.abilities?.dex?.mod, 0);
  const dexScore = getNumericValue(actor.system.abilities?.dex?.value, 10);
  const initBonus = getNumericValue(actor.system.attributes?.init?.bonus, 0);
  const alertBonus = actor.items.some(i => i.name?.toLowerCase().includes("alert")) ? 5 : 0;
  const totalInitMod = dexMod + initBonus + alertBonus;

  // Skills List
  const standardSkillsHtml = Object.entries(SKILLS).map(([key, s]) => {
    const mod = getNumericValue(actor.system.skills?.[key]?.total, 0);
    const profLevel = actor.system.skills?.[key]?.value ?? 0;
    const profMarker = getProfMarker(profLevel);

    return `
      <div class="sheet-entry-row" data-key="${key}" data-type="skill" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 2px; border-bottom: 1px solid #f0f0f0; cursor: pointer;">
        <span class="entry-label" style="font-size: 0.76em; color: #2b3a4a; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${profMarker}${s.label} <small style="color: #888; margin-left: 2px;">(${s.ability.toUpperCase()})</small>
        </span>
        <button type="button" class="roll-btn-v2" data-type="skill" data-key="${key}" style="width: 30px; height: 18px; font-size: 0.74em; font-weight: 700; padding: 0; border: 1px solid #c0c6ce; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0; margin-left: 4px;">
          ${formatSign(mod)}
        </button>
      </div>
    `;
  }).join('');

  // Separate Custom Tools vs Custom Skills/Checks
  const customProfToolsHtml = [];
  const customOtherToolsHtml = [];
  const customSkillsList = [];

  Object.entries(storedProfiles).forEach(([k, val]) => {
    if (k.startsWith("custom_")) {
      const abil = val.ability || "int";
      const isProf = Boolean(val.proficient);
      const profBonus = isProf ? pb : 0;
      const totalBonus = getNumericValue(actor.system.abilities?.[abil]?.mod, 0) + profBonus;
      const cat = val.category || "skill";
      const displayName = val.name || k.replace("custom_", "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      const profMarker = isProf ? getProfMarker(1) : `<i class="fas fa-diamond" style="color: #c5a059; font-size: 0.7em; margin-right: 4px; width: 10px; text-align: center;"></i>`;

      if (cat === "tool") {
        const toolRowHtml = `
          <div class="sheet-entry-row" data-key="${k}" data-type="tool" data-custom="true" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 2px; border-bottom: 1px solid #f0f0f0; cursor: pointer; background: #fdfaf3;">
            <span class="entry-label" style="font-size: 0.76em; color: #6d5b1f; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayName} (${abil.toUpperCase()})">
              ${profMarker}
              ${displayName} <small style="color: #888; margin-left: 2px;">(${abil.toUpperCase()})</small>
            </span>
            <button type="button" class="roll-btn-v2" data-type="tool" data-key="${k}" title="Roll ${displayName}" style="width: 30px; height: 18px; font-size: 0.74em; font-weight: 700; padding: 0; border: 1px solid #d5c898; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0; margin-left: 4px;">
              ${formatSign(totalBonus)}
            </button>
          </div>
        `;
        if (isProf) {
          customProfToolsHtml.push(toolRowHtml);
        } else {
          customOtherToolsHtml.push(toolRowHtml);
        }
      } else {
        customSkillsList.push(`
          <div class="sheet-entry-row" data-key="${k}" data-type="${cat}" data-custom="true" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 2px; border-bottom: 1px solid #f0f0f0; cursor: pointer; background: #fdfaf3;">
            <span class="entry-label" style="font-size: 0.76em; color: #6d5b1f; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${displayName} (${abil.toUpperCase()})">
              ${profMarker}
              ${displayName} <small style="color: #888; margin-left: 2px;">(${abil.toUpperCase()})</small>
            </span>
            <button type="button" class="roll-btn-v2" data-type="${cat}" data-key="${k}" title="Roll ${displayName}" style="width: 30px; height: 18px; font-size: 0.74em; font-weight: 700; padding: 0; border: 1px solid #d5c898; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0; margin-left: 4px;">
              ${formatSign(totalBonus)}
            </button>
          </div>
        `);
      }
    }
  });

  // Tools Division
  const proficientToolsHtml = [];
  const nonProficientToolsHtml = [];

  Object.entries(TOOLS).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([k, t]) => {
    const abilMod = getNumericValue(actor.system.abilities?.[t.ability]?.mod, 0);
    const toolItem = actor.items.find(i => i.type === "tool" && i.name.toLowerCase().includes(t.name.toLowerCase().split("'")[0]));
    const isProf = actor.system.tools?.[k]?.proficient || toolItem?.system?.proficient || 0;
    const bonus = abilMod + (isProf ? pb * (isProf === 2 ? 2 : 1) : 0);

    if (isProf) {
      const profMarker = getProfMarker(isProf === 2 ? 2 : (isProf === 0.5 ? 0.5 : 1));
      proficientToolsHtml.push(`
        <div class="sheet-entry-row" data-key="${k}" data-type="tool" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 2px; border-bottom: 1px solid #f0f0f0; cursor: pointer;">
          <span class="entry-label" style="font-size: 0.76em; color: #2b3a4a; display: flex; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${profMarker}${t.name} <small style="color: #888; margin-left: 2px;">(${t.ability.toUpperCase()})</small>
          </span>
          <button type="button" class="roll-btn-v2" data-type="tool" data-key="${k}" style="width: 30px; height: 18px; font-size: 0.74em; font-weight: 700; padding: 0; border: 1px solid #c0c6ce; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0; margin-left: 4px;">
            ${formatSign(bonus)}
          </button>
        </div>
      `);
    } else {
      nonProficientToolsHtml.push(`<option value="${k}">${t.name} (${t.ability.toUpperCase()}) ${formatSign(bonus)}</option>`);
    }
  });

  const dialogHtml = `
    <div style="display: flex; gap: 8px; font-family: inherit; height: 570px; box-sizing: border-box;">
      
      <!-- LEFT + CENTER CONTAINER: Ability Scores, Saves, Tools, and Skills -->
      <div style="flex: 2.1; display: flex; flex-direction: column; gap: 6px; min-width: 0;">
        
        <!-- Ability Scores Header (Spanning strictly over Saves, Tools, and Skills) -->
        <div style="display: flex; gap: 4px; justify-content: space-between; border-bottom: 1px solid #d2d7df; padding-bottom: 4px;">
          ${abilityCardsHtml}
        </div>

        <!-- Two Sub-Columns: [Utilities + Saves + Tools] and [Skills] -->
        <div style="display: flex; gap: 8px; flex: 1; min-height: 0;">
          
          <!-- LEFT SUB-COLUMN: Initiative, Concentration, Saves, Tools -->
          <div style="flex: 1; min-width: 170px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; padding-right: 2px;">
            
            <!-- Initiative & Concentration -->
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <div class="sheet-entry-row" data-key="init" data-type="init" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; background: rgba(43, 116, 137, 0.08); border: 1px solid rgba(43, 116, 137, 0.35); border-radius: 3px; cursor: pointer;">
                <span class="entry-label" style="font-size: 0.72em; font-weight: 600; color: #235d6e;">Initiative</span>
                <button type="button" class="roll-btn-v2" data-type="init" data-key="init" style="width: 44px; height: 18px; font-size: 0.72em; font-weight: 700; padding: 0; border: 1px solid #235d6e; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0;">
                  ${formatSign(totalInitMod)} .${dexScore}
                </button>
              </div>
              <div class="sheet-entry-row" data-key="concentration" data-type="concentration" style="display: flex; align-items: center; justify-content: space-between; padding: 2px 4px; background: rgba(163, 72, 72, 0.08); border: 1px solid rgba(163, 72, 72, 0.35); border-radius: 3px; cursor: pointer;">
                <span class="entry-label" style="font-size: 0.72em; font-weight: 600; color: #a34848;">Concentration</span>
                <button type="button" class="roll-btn-v2" data-type="concentration" data-key="concentration" style="width: 30px; height: 18px; font-size: 0.72em; font-weight: 700; padding: 0; border: 1px solid #a34848; background: #fff; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; text-align: center; flex-shrink: 0;">
                  ${formatSign(conSaveTotal)}
                </button>
              </div>
            </div>

            <!-- Saving Throws -->
            <div style="margin-top: 2px;">
              <label style="font-weight: 700; font-size: 0.7em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">SAVING THROWS</label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3px;">
                <div>${buildSaveColHtml(saveCol1Keys)}</div>
                <div>${buildSaveColHtml(saveCol2Keys)}</div>
              </div>
            </div>

            <!-- Tools Section -->
            <div style="margin-top: 2px; display: flex; flex-direction: column;">
              <label style="font-weight: 700; font-size: 0.7em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">TOOLS</label>
              <div id="tools-list-container-v2" style="background: rgba(0,0,0,0.015); border: 1px solid #e2e6ea; border-radius: 4px; padding: 2px 3px; margin-bottom: 4px; max-height: 140px; overflow-y: auto;">
                ${(proficientToolsHtml.length > 0 || customProfToolsHtml.length > 0 || customOtherToolsHtml.length > 0)
      ? `${proficientToolsHtml.join('')}${customProfToolsHtml.join('')}${customOtherToolsHtml.join('')}`
      : '<span style="font-size: 0.72em; color: #999; padding: 2px; display: block;">No proficient or custom tools.</span>'}
              </div>

              <div id="other-tools-container-v2" style="margin-top: 2px;">
                <label style="font-weight: 700; font-size: 0.65em; color: #777; display: block; margin-bottom: 1px;">OTHER TOOLS</label>
                <div style="display: flex; flex-direction: column; gap: 3px;">
                  <select id="other-tools-select-v2" style="width: 100%; height: 22px; font-size: 0.74em; border-radius: 3px; border: 1px solid #c0c6ce; padding: 0 2px; box-sizing: border-box;">
                    <option value="">-- Choose Tool --</option>
                    ${nonProficientToolsHtml.join('')}
                  </select>
                  <button type="button" id="roll-other-tool-btn-v2" style="width: 100%; height: 20px; font-size: 0.72em; font-weight: 700; cursor: pointer; border-radius: 3px; border: 1px solid #c0c6ce; background: #fff; display: inline-flex; align-items: center; justify-content: center; text-align: center;">
                    Roll Selected Tool
                  </button>
                </div>
              </div>
            </div>

          </div>

          <!-- RIGHT SUB-COLUMN: Skills Column -->
          <div style="flex: 1.05; min-width: 170px; display: flex; flex-direction: column; border-left: 1px solid #e5e5e5; padding-left: 8px; overflow-y: auto;">
            <label style="font-weight: 700; font-size: 0.7em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">SKILLS</label>
            <div style="background: rgba(0,0,0,0.015); border: 1px solid #e2e6ea; border-radius: 4px; padding: 1px 3px;">
              ${standardSkillsHtml}
              ${customSkillsList.join('')}
            </div>
          </div>

        </div>
      </div>

      <!-- RIGHT COLUMN: Descriptions & Modifiers (Shifted to start at the very top) -->
      <div style="flex: 1; min-width: 170px; display: flex; flex-direction: column; gap: 6px; border-left: 1px solid #d2d7df; padding-left: 8px;">
        
        <!-- Live Description Box (Starts at top) -->
        <div style="flex: 1; display: flex; flex-direction: column; background: rgba(0,0,0,0.02); border-radius: 4px; padding: 6px 8px; border: 1px solid #e2e6ea; min-height: 160px;">
          <div style="border-bottom: 1px solid #d2d7df; padding-bottom: 3px; margin-bottom: 4px;">
            <div id="desc-title-v2" style="font-weight: 700; font-size: 0.82em; color: #2b3a4a; text-transform: uppercase; letter-spacing: 0.5px;">D20 Test Overview</div>
            <div id="desc-subtitle-v2" style="font-size: 0.72em; color: #777;">Information Pane</div>
          </div>
          <div id="desc-body-v2" style="font-size: 0.78em; line-height: 1.4; color: #444; overflow-y: auto; flex: 1; white-space: pre-wrap;">Select any ability, saving throw, skill, or tool name to inspect its details and usage rules here.

Click a numbered modifier badge to execute a roll.</div>
        </div>

        <!-- Presets Section -->
        <div id="preset-modifiers-section-v2" style="display: none; flex-direction: column; gap: 2px; background: rgba(0,0,0,0.02); border: 1px dashed #c0c6ce; border-radius: 4px; padding: 3px 5px;">
          <label style="font-weight: 700; font-size: 0.68em; color: #4b5d88; letter-spacing: 0.5px;">PRESET MODIFIERS (V2)</label>
          <div id="preset-list-v2" style="display: flex; flex-direction: column; gap: 2px;"></div>
        </div>

        <div>
          <label for="other-modifier-v2" style="font-weight: 700; font-size: 0.7em; color: #4b5d88; letter-spacing: 0.5px; display: block; margin-bottom: 2px;">EXTRA MODIFIER</label>
          <input type="text" id="other-modifier-v2" name="other-modifier-v2" value="" placeholder="e.g. 1d4, +2" style="width: 100%; height: 24px; border-radius: 4px; border: 1px solid #ccc; padding: 1px 4px; font-size: 0.8em;" />
        </div>

        <div style="display: flex; flex-direction: column; gap: 3px; border-top: 1px solid #e0e0e0; padding-top: 4px;">
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74em; cursor: pointer; padding: 1px; color: #1e7e34; font-weight: 600;">
            <span>Super Advantage</span>
            <input type="checkbox" id="super-advantage-v2" name="super-advantage-v2" style="margin: 0;">
          </label>
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74em; cursor: pointer; padding: 1px; color: #333;">
            <span>Reliable Talent (Min 10)</span>
            <input type="checkbox" id="reliable-talent-v2" name="reliable-talent-v2" style="margin: 0;">
          </label>
          <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.74em; cursor: pointer; padding: 1px; color: #333;">
            <span>Halfling Luck (Reroll 1s)</span>
            <input type="checkbox" id="halfling-luck-v2" name="halfling-luck-v2" style="margin: 0;">
          </label>
        </div>

      </div>

    </div>
  `;

  new Dialog({
    title: `${actor.name}: Mini Sheet D20 Rolls (V2)`,
    content: dialogHtml,
    buttons: {
      close: { label: "Close" }
    },
    default: "close",
    render: (html) => {
      const descTitle = html.find('#desc-title-v2');
      const descSubtitle = html.find('#desc-subtitle-v2');
      const descBody = html.find('#desc-body-v2');
      const presetSection = html.find('#preset-modifiers-section-v2');
      const presetList = html.find('#preset-list-v2');
      let currentActiveKey = null;

      const getProfileForChoice = (choiceKey, type) => {
        if (!choiceKey) return null;
        if (storedProfiles[choiceKey]) return storedProfiles[choiceKey];
        if (type === "check") {
          return storedProfiles[`check_${choiceKey}`]
            || (choiceKey.startsWith("check_") ? storedProfiles[choiceKey.replace("check_", "")] : null);
        }
        if (type === "save") {
          return storedProfiles[`save_${choiceKey}`]
            || (choiceKey.startsWith("save_") ? storedProfiles[choiceKey.replace("save_", "")] : null);
        }
        return null;
      };

      const updatePresets = (choiceKey, type) => {
        currentActiveKey = choiceKey;
        const profileObj = getProfileForChoice(choiceKey, type);
        const activePresets = Array.isArray(profileObj) ? profileObj : (profileObj?.modifiers || []);

        if (activePresets.length > 0) {
          const listHtml = activePresets.map(p => `
            <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75em; cursor: pointer; padding: 2px 4px; background: #fff; border: 1px solid #d2d7df; border-radius: 3px;">
              <span>${p.label} <b style="color: #4b5d88;">(${p.formula})</b></span>
              <input type="checkbox" class="preset-mod-toggle-v2" data-formula="${p.formula}" ${p.enabled ? 'checked' : ''} style="margin: 0;">
            </label>
          `).join('');
          presetList.html(listHtml);
          presetSection.css('display', 'flex');
        } else {
          presetSection.hide();
          presetList.empty();
        }
      };

      const setInfo = (type, key, preservePresets = false) => {
        if (key && key.startsWith("custom_")) {
          const customData = storedProfiles[key];
          const name = customData?.name || "Custom Test";
          const abil = (customData?.ability || "int").toUpperCase();
          const cat = customData?.category || type || "skill";
          const catName = cat === 'tool' ? 'Tool' : (cat === 'check' ? 'Ability' : 'Skill');
          descTitle.text(name);
          descSubtitle.text(`Custom ${abil} ${catName} Check`);
          descBody.text(customData?.desc || `Custom D20 ${catName.toLowerCase()} check governed by ${actor.name}'s ${abil} modifier.`);
        } else if (type === "skill") {
          descTitle.text(SKILLS[key]?.label || key);
          descSubtitle.text("Skill Check");
          descBody.text(DESCRIPTIONS[key] || "No description available.");
        } else if (type === "tool") {
          const tool = TOOLS[key];
          descTitle.text(tool?.name || "Tool");
          descSubtitle.text(`${tool?.ability?.toUpperCase()} Tool Check`);
          descBody.text(tool?.desc || "No description available.");
        } else if (type === "save") {
          const abilKey = key.replace("save_", "");
          const abilName = ABILITIES[abilKey] || abilKey?.toUpperCase();
          descTitle.text(`${abilName} Save`);
          descSubtitle.text("Saving Throw");
          descBody.text(DESCRIPTIONS[`save_${abilKey}`] || "No description available.");
        } else if (type === "check") {
          const abilKey = key.replace("check_", "");
          const abilName = ABILITIES[abilKey] || abilKey?.toUpperCase();
          descTitle.text(`${abilName} Check`);
          descSubtitle.text("Ability Check");
          descBody.text(DESCRIPTIONS[`check_${abilKey}`] || "No description available.");
        } else if (type === "concentration") {
          descTitle.text("Concentration");
          descSubtitle.text("Constitution Check");
          descBody.text(DESCRIPTIONS.concentration);
        } else if (type === "init") {
          descTitle.text("Initiative");
          descSubtitle.text("Dexterity Check");
          descBody.text(DESCRIPTIONS.init);
        }

        if (!preservePresets || currentActiveKey !== key) {
          updatePresets(key, type);
        }
      };

      html.find('.ability-card, .save-row, .sheet-entry-row').on('click', function (e) {
        if ($(e.target).closest('.roll-btn-v2').length) return;
        const type = $(this).data('type');
        const key = $(this).data('key');
        setInfo(type, key);
      });

      html.find('#other-tools-select-v2').on('change input', function () {
        const key = $(this).val();
        if (key) {
          setInfo('tool', key);
        } else {
          presetSection.hide();
          presetList.empty();
        }
      });

      const executeRoll = async (rollType, key) => {
        const isSuperAdvantage = html.find('#super-advantage-v2').is(':checked');
        const isReliableTalent = html.find('#reliable-talent-v2').is(':checked');
        const isHalflingLuck = html.find('#halfling-luck-v2').is(':checked');

        const activePresetFormulas = [];
        html.find('.preset-mod-toggle-v2:checked').each((_, el) => {
          const form = $(el).data('formula');
          if (form) activePresetFormulas.push(form);
        });

        const manualMod = html.find('#other-modifier-v2').val()?.trim() || "";
        if (manualMod) activePresetFormulas.push(manualMod);

        const otherModString = activePresetFormulas.join(" + ");

        if (!globalThis.attackSocket) {
          return ui.notifications.error("SocketLib attack handler is not initialized. Please refresh the page.");
        }

        await globalThis.attackSocket.executeAsGM("runD20TestRoll", {
          rollType,
          key,
          isReliableTalent,
          isHalflingLuck,
          isSuperAdvantage,
          otherModString
        }, actor.id, game.user.id);
      };

      html.find('.roll-btn-v2').on('click', function (e) {
        e.stopPropagation();
        const type = $(this).data('type');
        const key = $(this).data('key');
        setInfo(type, key, true);
        executeRoll(type, key);
      });

      html.find('#roll-other-tool-btn-v2').on('click', function (e) {
        e.stopPropagation();
        const key = html.find('#other-tools-select-v2').val();
        if (!key) return ui.notifications.warn("Please select a tool first.");
        setInfo('tool', key, true);
        executeRoll('tool', key);
      });
    }
  }, { width: 590, height: "auto" }).render(true);
};


// --- 3.2 Weapon Attack Client-Side Dialog Launcher ---
window.CustomRolls.openAttackDialog = function () {
  if (!game.settings.get("cheapdice", "featureCustomRolls")) return;

  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

  if (!token) {
    return ui.notifications.warn("Please select your token first.");
  }

  const actor = token.actor;
  if (!actor || !actor.isOwner) {
    return ui.notifications.warn("You don't have permissions to use this token.");
  }

  const attacks = window.CustomRolls.getProfileData(actor, "attackConfigs") || actor.getFlag("world", "attackConfigs") || {};
  const names = Object.keys(attacks);

  if (names.length === 0) {
    return ui.notifications.warn(`No stored attacks found for ${actor.name}.`);
  }

  function getSummaryHtml(config) {
    if (!config) return "";

    const abilityMod = actor.system.abilities[config.abilityScore]?.mod || 0;
    const prof = actor.system.attributes.prof || 0;
    const wepMod = Number(config.weaponModifier) || 0;
    const circMod = Number(config.attackCircumstanceModifier) || 0;
    const totalAtk = abilityMod + prof + wepMod + circMod;
    const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;

    const diceCount = Number(config.damageDiceCount) || 1;
    const dieSize = String(config.damageDieSize || "6").replace(/^d/i, "");
    const dmgMod = abilityMod + wepMod + (Number(config.damageModifier) || 0);
    const dmgModSign = dmgMod >= 0 ? `+${dmgMod}` : `${dmgMod}`;
    const dmgFormula = `${diceCount}d${dieSize} ${dmgMod !== 0 ? dmgModSign : ""}`.trim();
    const dmgType = (config.damageType || "slashing").toUpperCase();

    const tags = [];
    tags.push(`Crit: ${config.CRIT_THRESHOLD || 20}+`);
    if (config.superAdv) tags.push("Elven Acc.");
    if (config.HAS_HALFLING_LUCKY) tags.push("Halfling Lucky");
    if (Number(config.GWF_REROLL_THRESHOLD) > 0) tags.push(`GWF (≤${config.GWF_REROLL_THRESHOLD})`);

    const activeExtras = (config.additionalDamageComponents || []).filter(c => c.isActive);
    if (activeExtras.length > 0) {
      tags.push(`+${activeExtras.length} Extra Dmg`);
    }

    const tagsHtml = tags.map(t => `
      <span style="display: inline-block; background: rgba(114, 137, 218, 0.18); border: 1px solid rgba(114, 137, 218, 0.4); border-radius: 3px; padding: 2px 6px; font-size: 0.75em; font-weight: 600; color: #4b5d88;">${t}</span>
    `).join("");

    let gwmHtml = "";
    if (config.hasGWM) {
      gwmHtml = `
        <div style="border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 6px;">
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; font-weight: bold; color: #a34848; cursor: pointer; padding: 2px 4px; background: rgba(163, 72, 72, 0.08); border-radius: 3px;">
            <span>Great Weapon Master / Sharpshooter (-5 / +10)</span>
            <input type="checkbox" id="gwm-toggle">
          </label>
        </div>
      `;
    }

    const extras = config.additionalDamageComponents || [];
    let extrasHtml = "";
    if (extras.length > 0) {
      extrasHtml = `
        <div style="margin-top: 6px; border-top: 1px solid #e0e0e0; padding-top: 6px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #666; margin-bottom: 4px;">EXTRA DAMAGE SOURCES:</div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${extras.map((ex, i) => `
              <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 2px 4px; background: rgba(0,0,0,0.02); border-radius: 3px;">
                <span><strong>${ex.label}</strong> <small style="color: #777;">(${ex.formula})</small></span>
                <input type="checkbox" class="extra-dmg-toggle" data-index="${i}">
              </label>
            `).join("")}
          </div>
        </div>
      `;
    }

    return `
      <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; margin-bottom: 6px; text-align: center;">
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">ATTACK</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${atkSign}</div>
        </div>
        <div style="border-left: 1px solid rgba(0,0,0,0.1); border-right: 1px solid rgba(0,0,0,0.1); padding: 0 12px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">DAMAGE</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${dmgFormula}</div>
        </div>
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">TYPE</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${dmgType}</div>
        </div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-bottom: 6px;">
        ${tagsHtml}
      </div>
      ${gwmHtml}
      ${extrasHtml}
    `;
  }

  const optionsHtml = names.map(name => `<option value="${name}">${name}</option>`).join("");
  const initialSummary = getSummaryHtml(attacks[names[0]]);

  const content = `
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 6px 4px;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 4px;">
        <span style="font-weight: 600; font-size: 1em; color: #333;">Select Action</span>
        <span style="font-size: 0.85em; color: #777;">${actor.name}</span>
      </div>
      
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <select id="attack-selection" style="width: 100%; height: 32px; padding: 2px 6px; font-size: 0.95em; border-radius: 4px; border: 1px solid #7289da;">
          ${optionsHtml}
        </select>
      </div>

      <div id="attack-preview-box" style="border: 1px solid #d2d7df; border-radius: 5px; padding: 8px; background: #fafbfc;">
        ${initialSummary}
      </div>
    </div>
  `;

  new Dialog({
    title: `${actor.name}: Attack`,
    content: content,
    buttons: {
      roll: {
        icon: '<i class="fas fa-dice-d20" style="margin-right: 6px;"></i>',
        label: "Roll Attack",
        callback: async (html) => {
          const choice = html.find("#attack-selection").val();
          const rawConfig = attacks[choice];
          if (!rawConfig) return;

          const config = foundry.utils.duplicate(rawConfig);

          if (config.hasGWM && html.find("#gwm-toggle").is(":checked")) {
            config.attackCircumstanceModifier = (Number(config.attackCircumstanceModifier) || 0) - 5;
            config.damageModifier = (Number(config.damageModifier) || 0) + 10;
            config.chatCardTitle = `${config.chatCardTitle || choice} [GWM/SS -5/+10]`;
          }

          if (config.additionalDamageComponents) {
            html.find(".extra-dmg-toggle").each(function () {
              const idx = $(this).data("index");
              if (config.additionalDamageComponents[idx]) {
                config.additionalDamageComponents[idx].isActive = $(this).is(":checked");
              }
            });
          }

          await globalThis.attackSocket.executeAsGM("runAttackRoll", config, actor.id, game.user.id);
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "roll",
    render: (html) => {
      html.find("#attack-selection").on("change", (event) => {
        const selectedName = event.target.value;
        const selectedConfig = attacks[selectedName];
        html.find("#attack-preview-box").html(getSummaryHtml(selectedConfig));
      });
    }
  }, { width: 400 }).render(true);
};

// --- 3.3 Spell Attack Client-Side Dialog Launcher ---
window.CustomRolls.openSpellDialog = async function () {
  if (!game.settings.get("cheapdice", "featureCustomRolls")) return;

  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

  if (!token) {
    return ui.notifications.warn("Please select your token first.");
  }

  const actor = token.actor;
  if (!actor || !actor.isOwner) {
    return ui.notifications.warn("You don't have permissions to use this token.");
  }

  const spellConfigs = window.CustomRolls.getProfileData(actor, "spellConfigs") || actor.getFlag("world", "spellConfigs") || {};
  const spellKeys = Object.keys(spellConfigs);

  if (spellKeys.length === 0) {
    return ui.notifications.warn(`No spells configured for ${actor.name}. Run the Spell Generator first.`);
  }

  const groupedSpells = {};
  for (const key of spellKeys) {
    const lvl = Number(spellConfigs[key].baseLevel) || 0;
    if (!groupedSpells[lvl]) groupedSpells[lvl] = [];
    groupedSpells[lvl].push(key);
  }

  const sortedLevels = Object.keys(groupedSpells).map(Number).sort((a, b) => a - b);
  let optionsHtml = "";
  for (const lvl of sortedLevels) {
    const groupLabel = lvl === 0 ? "Cantrips" : `Level ${lvl} Spells`;
    optionsHtml += `<optgroup label="${groupLabel}">`;
    for (const key of groupedSpells[lvl]) {
      optionsHtml += `<option value="${key}">${key}</option>`;
    }
    optionsHtml += `</optgroup>`;
  }

  function getSlotInfo(lvl) {
    if (lvl === 0) return { current: Infinity, max: Infinity, label: "Infinite (Cantrip)" };
    const spells = actor.system.spells || {};
    const key = `spell${lvl}`;
    const slot = spells[key];
    if (!slot) return { current: 0, max: 0, label: "0/0" };
    return {
      current: Number(slot.value) || 0,
      max: Number(slot.max) || 0,
      label: `${slot.value ?? 0}/${slot.max ?? 0}`
    };
  }

  function getUpcastOptionsHtml(spell) {
    const baseLevel = Number(spell?.baseLevel) || 0;
    if (baseLevel === 0) {
      return `
        <div style="border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 6px; font-size: 0.85em; color: #555;">
          <strong>Slot:</strong> Cantrip (No slot cost)
          <input type="hidden" id="castLevelSelect" value="0" />
        </div>
      `;
    }

    const isAuto = spell.resolutionMethod === "auto";
    const isMultiAtk = spell.resolutionMethod === "attack" && spell.isMultiAttack;

    let upcastLabel = "";
    if (isAuto) {
      const pCount = spell.upcastProjectiles ?? 1;
      upcastLabel = `${pCount} Projectile${pCount > 1 ? "s" : ""}`;
    } else if (isMultiAtk && Number(spell.upcastAttacks) > 0) {
      const aCount = spell.upcastAttacks;
      upcastLabel = `${aCount} Ray${aCount > 1 ? "s" : ""}`;
    } else {
      upcastLabel = spell.upcastDiceFormula ? spell.upcastDiceFormula : `1${spell.damageDieSize}`;
    }

    let html = `
      <div style="border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 6px;">
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; font-weight: bold; color: #4b5d88; margin-bottom: 4px;">
          <span>CAST AT LEVEL:</span>
        </label>
        <select id="castLevelSelect" style="width: 100%; height: 30px; font-size: 0.9em; border-radius: 4px; border: 1px solid #7289da; padding: 2px 6px;">
    `;
    for (let lvl = baseLevel; lvl <= 9; lvl++) {
      const slotInfo = getSlotInfo(lvl);
      const extraLevels = lvl - baseLevel;
      const extraText = extraLevels > 0 ? ` (+${extraLevels}x ${upcastLabel})` : "";
      html += `<option value="${lvl}" ${lvl === baseLevel ? 'selected' : ''}>Level ${lvl} [${slotInfo.label} slots]${extraText}</option>`;
    }
    html += `
        </select>
        <div style="margin-top: 6px;">
          <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.85em; cursor: pointer; padding: 3px 6px; background: rgba(0,0,0,0.03); border-radius: 4px; border: 1px solid #e0e0e0;">
            <span style="font-weight: 600; color: #4b5d88;">Deduct slot from Foundry sheet</span>
            <input type="checkbox" id="deductSlotToggle" style="margin: 0;" />
          </label>
        </div>
      </div>
    `;
    return html;
  }

  function scaleDiceFormula(formula, factor) {
    if (!formula) return "";
    const cleaned = String(formula).replace(/[()]/g, "").trim();
    if (!isNaN(Number(cleaned))) {
      return String(Number(cleaned) * factor);
    }
    return cleaned.replace(/(\d*)([dD]\d+)/g, (match, count, die) => {
      const c = parseInt(count) || 1;
      return `${c * factor}${die}`;
    });
  }

  function getEffectiveConfig(baseConfig, castLevel) {
    const cfg = foundry.utils.duplicate(baseConfig);
    const baseLvl = Number(cfg.baseLevel) || 0;
    const currentCastLvl = castLevel !== undefined ? Number(castLevel) : baseLvl;
    const extraLevels = (baseLvl > 0 && currentCastLvl > baseLvl) ? (currentCastLvl - baseLvl) : 0;
    cfg.castLevel = currentCastLvl;

    if (cfg.resolutionMethod === "auto") {
      const baseProjectiles = Number(cfg.projectileCount) || 3;
      const upcastStep = Number(cfg.upcastProjectiles) || 1;
      cfg.effectiveProjectiles = baseProjectiles + (extraLevels * upcastStep);
    } else if (cfg.resolutionMethod === "attack" && cfg.isMultiAttack) {
      let baseCount = Number(cfg.attackCount) || 1;
      if (cfg.cantripAttackScaling && baseLvl === 0) {
        const charLvl = actor.system.details?.level ?? 1;
        if (charLvl >= 17) baseCount = 4;
        else if (charLvl >= 11) baseCount = 3;
        else if (charLvl >= 5) baseCount = 2;
        else baseCount = 1;
      }
      const upcastAtkStep = Number(cfg.upcastAttacks) || 0;
      cfg.effectiveAttacks = baseCount + (extraLevels * upcastAtkStep);
    } else if (extraLevels > 0) {
      if (cfg.upcastDiceFormula) {
        const scaledUpcast = scaleDiceFormula(cfg.upcastDiceFormula, extraLevels);
        if (!isNaN(Number(scaledUpcast))) {
          cfg.flatDamageBonus = (Number(cfg.flatDamageBonus) || 0) + Number(scaledUpcast);
        } else if (cfg.extraDiceFormula) {
          cfg.extraDiceFormula = `${cfg.extraDiceFormula} + ${scaledUpcast}`;
        } else {
          cfg.extraDiceFormula = scaledUpcast;
        }
      } else if (Number(cfg.damageDiceCount) > 0) {
        cfg.damageDiceCount = Number(cfg.damageDiceCount) + extraLevels;
      }
    }

    return { cfg, extraLevels };
  }

  function formatTargetDisplay(cfg) {
    const type = cfg.targetType || "creature";
    if (type === "creature") return "Creature(s)";
    if (type === "object") return "Object(s)";
    if (type === "creature_object") return "Creature / Object";
    if (type === "self") return "Self";
    if (type === "point") return "Point";
    if (type === "area") {
      const shape = cfg.areaShape ? cfg.areaShape.charAt(0).toUpperCase() + cfg.areaShape.slice(1) : "Area";
      const size = cfg.areaSize ? ` (${cfg.areaSize})` : "";
      return `${shape}${size}`;
    }
    return "Creature(s)";
  }

  function getSummaryHtml(spell, castLevel) {
    if (!spell) return "";

    const { cfg, extraLevels } = getEffectiveConfig(spell, castLevel);

    const abilityMod = actor.system.abilities[cfg.spellAbility]?.mod || 0;
    const prof = actor.system.attributes.prof || 0;
    const atkMod = Number(cfg.attackModifier) || 0;
    const totalAtk = abilityMod + prof + atkMod;
    const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;
    const spellDC = 8 + prof + abilityMod;

    const isHealing = ["heal", "temp_hp", "max_hp"].includes(cfg.resolutionMethod);
    let effectiveFlat = Number(cfg.flatDamageBonus) || 0;
    if (isHealing && cfg.addAbilityModToValue) {
      effectiveFlat += abilityMod;
    }

    const diceCount = Number(cfg.damageDiceCount) || 0;
    let valFormula = "";
    if (diceCount > 0) {
      valFormula = `${diceCount}${cfg.damageDieSize}`;
      if (cfg.extraDiceFormula) valFormula += ` + ${cfg.extraDiceFormula}`;
      if (effectiveFlat !== 0) valFormula += ` + ${effectiveFlat}`;
    } else {
      valFormula = effectiveFlat !== 0 ? `${effectiveFlat}` : "0";
    }

    let actionHeader = "ATTACK";
    let actionVal = atkSign;
    let typeLabel = (cfg.damageType || "fire").toUpperCase();

    if (cfg.resolutionMethod === "attack" && cfg.isMultiAttack) {
      actionHeader = "ATTACKS";
      actionVal = `${cfg.effectiveAttacks || cfg.attackCount || 1}x (${atkSign})`;
    } else if (cfg.resolutionMethod === "save") {
      actionHeader = "SAVE DC";
      actionVal = `DC ${spellDC} ${(cfg.saveAbility || 'dex').toUpperCase()}`;
    } else if (cfg.resolutionMethod === "auto") {
      actionHeader = "HITS";
      actionVal = `${cfg.effectiveProjectiles || cfg.projectileCount || 3} Darts`;
    } else if (cfg.resolutionMethod === "heal") {
      actionHeader = "TYPE";
      actionVal = "HEALING";
      typeLabel = "HP RECOVERY";
    } else if (cfg.resolutionMethod === "temp_hp") {
      actionHeader = "TYPE";
      actionVal = "TEMP HP";
      typeLabel = "TEMP HP";
    } else if (cfg.resolutionMethod === "max_hp") {
      actionHeader = "TYPE";
      actionVal = "MAX HP";
      typeLabel = "AID / MAX HP";
    }

    if (cfg.damageMode === "chaos" && !isHealing) typeLabel = "CHAOS";
    if (cfg.damageMode === "choice" && !isHealing) typeLabel = "CHOICE";

    const tags = [];
    tags.push(cfg.castingTime || "1 Action");
    tags.push(cfg.range || "Touch");
    tags.push(`Target: ${formatTargetDisplay(cfg)}`);
    tags.push(`Dur: ${cfg.duration || "Instant"}`);
    if (cfg.concentration) tags.push("Concentration");

    let compList = [];
    if (cfg.components?.v) compList.push("V");
    if (cfg.components?.s) compList.push("S");
    if (cfg.components?.m) compList.push(cfg.components?.costly ? "M*" : "M");
    if (compList.length > 0) tags.push(`Comp: ${compList.join(",")}`);

    const explodeCond = (cfg.explodeCondition || (cfg.explodingDice ? "x" : "")).trim();
    if (explodeCond && !isHealing && cfg.resolutionMethod !== "auto") tags.push(`Explode [${explodeCond}]`);
    if (cfg.chaosJump && !isHealing) tags.push("Chaos Jump");
    if (cfg.superAdv && cfg.resolutionMethod === "attack") tags.push("Elven Acc.");
    if (cfg.isCantripScale && !cfg.isMultiAttack) tags.push("Cantrip Scale");

    const tagsHtml = tags.map(t => {
      const isConc = t === "Concentration";
      const bg = isConc ? "rgba(163, 72, 72, 0.15)" : "rgba(114, 137, 218, 0.18)";
      const border = isConc ? "rgba(163, 72, 72, 0.4)" : "rgba(114, 137, 218, 0.4)";
      const color = isConc ? "#a34848" : "#4b5d88";
      return `<span style="display: inline-block; background: ${bg}; border: 1px solid ${border}; border-radius: 3px; padding: 2px 6px; font-size: 0.75em; font-weight: 600; color: ${color};">${t}</span>`;
    }).join("");

    return `
      <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.04); border-radius: 4px; padding: 6px 4px; margin-bottom: 6px; text-align: center;">
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">${actionHeader}</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${actionVal}</div>
        </div>
        <div style="border-left: 1px solid rgba(0,0,0,0.1); border-right: 1px solid rgba(0,0,0,0.1); padding: 0 12px;">
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">${cfg.isMultiAttack ? "PER RAY" : (isHealing ? "VALUE" : "DAMAGE")}</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${valFormula}</div>
        </div>
        <div>
          <div style="font-size: 0.75em; font-weight: 600; color: #777;">EFFECT</div>
          <div style="font-size: 1.1em; font-weight: bold; color: #2b3a4a;">${typeLabel}</div>
        </div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-bottom: 6px;">
        ${tagsHtml}
      </div>
      ${cfg.components?.costly && cfg.components?.description ? `
        <div style="font-size: 0.78em; color: #b35900; background: rgba(179, 89, 0, 0.08); padding: 3px 6px; border-radius: 3px; margin-bottom: 4px;">
          <i class="fas fa-coins"></i> <strong>Cost:</strong> ${cfg.components.description}
        </div>
      ` : ''}
      ${cfg.summary ? `
        <div style="font-size: 0.82em; color: #555; font-style: italic; border-top: 1px solid #e0e0e0; padding-top: 4px; margin-top: 4px;">
          ${cfg.summary}
        </div>
      ` : ''}
    `;
  }

  const firstKey = spellKeys[0];
  const initialSpell = spellConfigs[firstKey];

  const content = `
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 6px 4px;">
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 4px;">
        <span style="font-weight: 600; font-size: 1em; color: #333;">Select Spell</span>
        <span style="font-size: 0.85em; color: #777;">${actor.name}</span>
      </div>

      <div style="display: flex; flex-direction: column; gap: 4px;">
        <select id="spellChoice" style="width: 100%; height: 32px; padding: 2px 6px; font-size: 0.95em; border-radius: 4px; border: 1px solid #7289da;">
          ${optionsHtml}
        </select>
      </div>

      <div id="upcastContainer">
        ${getUpcastOptionsHtml(initialSpell)}
      </div>

      <div id="spell-preview-box" style="border: 1px solid #d2d7df; border-radius: 5px; padding: 8px; background: #fafbfc;">
        ${getSummaryHtml(initialSpell, initialSpell.baseLevel)}
      </div>
    </div>
  `;

  let performCast = false;

  new Dialog({
    title: `${actor.name}: Cast Spell`,
    content: content,
    buttons: {
      cast: {
        icon: '<i class="fas fa-magic" style="margin-right: 6px;"></i>',
        label: "Cast Spell",
        callback: () => { performCast = true; }
      },
      cancel: { label: "Cancel" }
    },
    default: "cast",
    render: (html) => {
      const spellSelect = html.find("#spellChoice");
      const upcastContainer = html.find("#upcastContainer");
      const previewBox = html.find("#spell-preview-box");

      function updateUI() {
        const chosenKey = spellSelect.val();
        const chosen = spellConfigs[chosenKey];
        const castLvl = html.find("#castLevelSelect").val() ?? chosen.baseLevel;
        previewBox.html(getSummaryHtml(chosen, castLvl));
      }

      function rebuildUpcastAndPreview() {
        const chosenKey = spellSelect.val();
        const chosen = spellConfigs[chosenKey];
        upcastContainer.html(getUpcastOptionsHtml(chosen));

        html.find("#castLevelSelect").on("change", () => {
          updateUI();
        });

        updateUI();
      }

      spellSelect.on("change", rebuildUpcastAndPreview);
      html.find("#castLevelSelect").on("change", updateUI);
    },
    close: async (html) => {
      if (!performCast) return;

      const chosenKey = html.find("#spellChoice").val();
      const rawConfig = spellConfigs[chosenKey];

      if (!rawConfig) return;
      if (!globalThis.attackSocket) {
        return ui.notifications.error("SocketLib handler is not initialized. Please refresh the page.");
      }

      const castLvl = Number(html.find("#castLevelSelect").val()) ?? Number(rawConfig.baseLevel) ?? 0;
      const { cfg: config } = getEffectiveConfig(rawConfig, castLvl);

      const shouldDeduct = html.find("#deductSlotToggle").is(":checked");
      if (!shouldDeduct || castLvl === 0) {
        config.skipSlotDeduction = true;
      } else {
        const slotKey = `spell${castLvl}`;
        const currentSlotVal = Number(actor.system.spells?.[slotKey]?.value) || 0;
        if (currentSlotVal <= 0) {
          const proceed = await Dialog.confirm({
            title: "No Spell Slots Remaining",
            content: `<p><strong>${actor.name}</strong> has <strong>0</strong> Level ${castLvl} spell slots remaining on their Foundry sheet. Cast anyway?</p>`
          });
          if (!proceed) return;
          config.skipSlotDeduction = true;
        }
      }

      if (config.damageMode === "choice" && !["heal", "temp_hp", "max_hp"].includes(config.resolutionMethod)) {
        const choiceOptions = [
          "acid", "cold", "fire", "force", "lightning",
          "necrotic", "poison", "psychic", "radiant", "thunder"
        ].map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('');

        const promptContent = `
          <div style="padding: 6px 4px;">
            <label style="font-weight: 600; font-size: 0.9em; display: block; margin-bottom: 5px;">Choose Damage Type:</label>
            <select id="chosenType" style="width: 100%; height: 30px; font-size: 0.9em; border-radius: 4px; border: 1px solid #7289da;">
              ${choiceOptions}
            </select>
          </div>
        `;

        let choiceConfirmed = false;
        await new Promise((resolve) => {
          new Dialog({
            title: `${config.spellName}: Damage Type`,
            content: promptContent,
            buttons: {
              ok: {
                label: "Confirm",
                callback: (choiceHtml) => {
                  choiceConfirmed = true;
                  config.damageType = choiceHtml.find("#chosenType").val();
                }
              },
              cancel: { label: "Cancel" }
            },
            default: "ok",
            close: () => resolve()
          }, { width: 280 }).render(true);
        });

        if (!choiceConfirmed) return;
      }

      await globalThis.attackSocket.executeAsGM("runSpellAttackRoll", config, actor.id, game.user.id);
    }
  }, { width: 400 }).render(true);
};

// --- 3.4 Unified Action Client-Side Dialog Launcher (Card/List View) ---
window.CustomRolls.openActionDialog = function (initialMode = "weapon") {
  if (!game.settings.get("cheapdice", "featureCustomRolls")) return;

  const token = canvas.tokens.controlled[0] || Array.from(game.user.targets)[0] || canvas.tokens.hover;

  if (!token) {
    return ui.notifications.warn("Please select your token first.");
  }

  const actor = token.actor;
  if (!actor || !actor.isOwner) {
    return ui.notifications.warn("You don't have permissions to use this token.");
  }

  const attacks = window.CustomRolls.getProfileData(actor, "attackConfigs") || actor.getFlag("world", "attackConfigs") || {};
  const spellConfigs = window.CustomRolls.getProfileData(actor, "spellConfigs") || actor.getFlag("world", "spellConfigs") || {};

  const attackNames = Object.keys(attacks);
  const spellKeys = Object.keys(spellConfigs);

  if (attackNames.length === 0 && spellKeys.length === 0) {
    return ui.notifications.warn(`No configured attacks or spells found for ${actor.name}.`);
  }

  let currentMode = initialMode;
  if (currentMode === "weapon" && attackNames.length === 0) currentMode = "spell";
  if (currentMode === "spell" && spellKeys.length === 0) currentMode = "weapon";

  let selectedWeaponKey = attackNames[0] || null;
  let selectedSpellKey = spellKeys[0] || null;

  // --- Helper Calculations ---
  function getWeaponDetails(config) {
    if (!config) return { atkSign: "+0", dmgFormula: "1d6", dmgType: "SLASHING", tags: [] };
    const abilityMod = actor.system.abilities[config.abilityScore]?.mod || 0;
    const prof = actor.system.attributes.prof || 0;
    const wepMod = Number(config.weaponModifier) || 0;
    const circMod = Number(config.attackCircumstanceModifier) || 0;
    const totalAtk = abilityMod + prof + wepMod + circMod;
    const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;

    const diceCount = Number(config.damageDiceCount) || 1;
    const dieSize = String(config.damageDieSize || "6").replace(/^d/i, "");
    const dmgMod = abilityMod + wepMod + (Number(config.damageModifier) || 0);
    const dmgModSign = dmgMod >= 0 ? `+${dmgMod}` : `${dmgMod}`;
    const dmgFormula = `${diceCount}d${dieSize} ${dmgMod !== 0 ? dmgModSign : ""}`.trim();
    const dmgType = (config.damageType || "slashing").toUpperCase();

    const tags = [];
    if (config.CRIT_THRESHOLD && config.CRIT_THRESHOLD < 20) tags.push(`Crit ${config.CRIT_THRESHOLD}+`);
    if (config.superAdv) tags.push("Elven Acc.");
    if (config.HAS_HALFLING_LUCKY) tags.push("Lucky");
    if (Number(config.GWF_REROLL_THRESHOLD) > 0) tags.push(`GWF ≤${config.GWF_REROLL_THRESHOLD}`);

    return { atkSign, dmgFormula, dmgType, tags };
  }

  function getSlotInfo(lvl) {
    if (lvl === 0) return { current: Infinity, max: Infinity, label: "Cantrip" };
    const sp = actor.system.spells || {};
    const key = `spell${lvl}`;
    const slot = sp[key];
    if (!slot) return { current: 0, max: 0, label: "0/0" };
    return {
      current: Number(slot.value) || 0,
      max: Number(slot.max) || 0,
      label: `${slot.value ?? 0}/${slot.max ?? 0}`
    };
  }

  function scaleDiceFormula(formula, factor) {
    if (!formula) return "";
    const cleaned = String(formula).replace(/[()]/g, "").trim();
    if (!isNaN(Number(cleaned))) return String(Number(cleaned) * factor);
    return cleaned.replace(/(\d*)([dD]\d+)/g, (match, count, die) => {
      const c = parseInt(count) || 1;
      return `${c * factor}${die}`;
    });
  }

  function getEffectiveSpellConfig(baseConfig, castLevel) {
    const cfg = foundry.utils.duplicate(baseConfig);
    const baseLvl = Number(cfg.baseLevel) || 0;
    const currentCastLvl = castLevel !== undefined ? Number(castLevel) : baseLvl;
    const extraLevels = (baseLvl > 0 && currentCastLvl > baseLvl) ? (currentCastLvl - baseLvl) : 0;
    cfg.castLevel = currentCastLvl;

    if (cfg.resolutionMethod === "auto") {
      const baseProjectiles = Number(cfg.projectileCount) || 3;
      const upcastStep = Number(cfg.upcastProjectiles) || 1;
      cfg.effectiveProjectiles = baseProjectiles + (extraLevels * upcastStep);
    } else if (cfg.resolutionMethod === "attack" && cfg.isMultiAttack) {
      let baseCount = Number(cfg.attackCount) || 1;
      if (cfg.cantripAttackScaling && baseLvl === 0) {
        const charLvl = actor.system.details?.level ?? 1;
        if (charLvl >= 17) baseCount = 4;
        else if (charLvl >= 11) baseCount = 3;
        else if (charLvl >= 5) baseCount = 2;
        else baseCount = 1;
      }
      const upcastAtkStep = Number(cfg.upcastAttacks) || 0;
      cfg.effectiveAttacks = baseCount + (extraLevels * upcastAtkStep);
    } else if (extraLevels > 0) {
      if (cfg.upcastDiceFormula) {
        const scaledUpcast = scaleDiceFormula(cfg.upcastDiceFormula, extraLevels);
        if (!isNaN(Number(scaledUpcast))) {
          cfg.flatDamageBonus = (Number(cfg.flatDamageBonus) || 0) + Number(scaledUpcast);
        } else if (cfg.extraDiceFormula) {
          cfg.extraDiceFormula = `${cfg.extraDiceFormula} + ${scaledUpcast}`;
        } else {
          cfg.extraDiceFormula = scaledUpcast;
        }
      } else if (Number(cfg.damageDiceCount) > 0) {
        cfg.damageDiceCount = Number(cfg.damageDiceCount) + extraLevels;
      }
    }
    return { cfg, extraLevels };
  }

  function getSpellDetails(spell, castLevel) {
    if (!spell) return { actionVal: "+0", valFormula: "0", typeLabel: "FIRE", tags: [] };
    const { cfg } = getEffectiveSpellConfig(spell, castLevel);
    const abilityMod = actor.system.abilities[cfg.spellAbility]?.mod || 0;
    const prof = actor.system.attributes.prof || 0;
    const atkMod = Number(cfg.attackModifier) || 0;
    const totalAtk = abilityMod + prof + atkMod;
    const atkSign = totalAtk >= 0 ? `+${totalAtk}` : `${totalAtk}`;
    const spellDC = 8 + prof + abilityMod;

    const isHealing = ["heal", "temp_hp", "max_hp"].includes(cfg.resolutionMethod);
    let effectiveFlat = Number(cfg.flatDamageBonus) || 0;
    if (isHealing && cfg.addAbilityModToValue) effectiveFlat += abilityMod;

    const diceCount = Number(cfg.damageDiceCount) || 0;
    let valFormula = "";
    if (diceCount > 0) {
      valFormula = `${diceCount}${cfg.damageDieSize}`;
      if (cfg.extraDiceFormula) valFormula += `+${cfg.extraDiceFormula}`;
      if (effectiveFlat !== 0) valFormula += `${effectiveFlat >= 0 ? '+' : ''}${effectiveFlat}`;
    } else {
      valFormula = effectiveFlat !== 0 ? `${effectiveFlat}` : "-";
    }

    let actionVal = atkSign;
    let typeLabel = (cfg.damageType || "fire").toUpperCase();

    if (cfg.resolutionMethod === "attack" && cfg.isMultiAttack) {
      actionVal = `${cfg.effectiveAttacks || cfg.attackCount || 1}x (${atkSign})`;
    } else if (cfg.resolutionMethod === "save") {
      actionVal = `DC ${spellDC} ${(cfg.saveAbility || 'dex').toUpperCase()}`;
    } else if (cfg.resolutionMethod === "auto") {
      actionVal = `${cfg.effectiveProjectiles || cfg.projectileCount || 3} Darts`;
    } else if (isHealing) {
      actionVal = "HEAL";
      typeLabel = "RECOVERY";
    }

    const tags = [];
    if (cfg.castingTime) tags.push(cfg.castingTime);
    if (cfg.range) tags.push(cfg.range);
    if (cfg.concentration) tags.push("Conc.");

    return { actionVal, valFormula, typeLabel, tags };
  }

  function getUpcastOptionsHtml(spell) {
    const baseLevel = Number(spell?.baseLevel) || 0;
    if (baseLevel === 0) {
      return `
        <div style="font-size: 0.82em; color: #555; padding: 4px 6px; background: rgba(0,0,0,0.02); border-radius: 4px; border: 1px solid #e0e0e0;">
          <strong>Slot:</strong> Cantrip (No slot cost)
          <input type="hidden" id="castLevelSelect" value="0" />
        </div>
      `;
    }

    let html = `
      <div style="background: rgba(0,0,0,0.02); border: 1px solid #d2d7df; border-radius: 4px; padding: 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-size: 0.8em; font-weight: bold; color: #4b5d88;">CAST AT LEVEL:</span>
          <select id="castLevelSelect" style="height: 26px; font-size: 0.85em; border-radius: 4px; border: 1px solid #7289da; padding: 0 4px;">
    `;
    for (let lvl = baseLevel; lvl <= 9; lvl++) {
      const slotInfo = getSlotInfo(lvl);
      html += `<option value="${lvl}" ${lvl === baseLevel ? 'selected' : ''}>Level ${lvl} (${slotInfo.label} slots)</option>`;
    }
    html += `
          </select>
        </div>
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em; cursor: pointer; padding: 2px 4px; background: #fff; border-radius: 3px; border: 1px solid #e0e0e0; margin-top: 4px;">
          <span style="font-weight: 600; color: #4b5d88;">Deduct slot from sheet</span>
          <input type="checkbox" id="deductSlotToggle" style="margin: 0;" />
        </label>
      </div>
    `;
    return html;
  }

  function renderWeaponCards() {
    return attackNames.map(name => {
      const conf = attacks[name];
      const isSel = name === selectedWeaponKey;
      const d = getWeaponDetails(conf);
      const tagsHtml = d.tags.map(t => `<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 2px; padding: 1px 4px; font-size: 0.7em; color: #4b5d88;">${t}</span>`).join(" ");

      return `
        <div class="action-card weapon-card" data-key="${name}" style="border: 2px solid ${isSel ? '#7289da' : '#e0e0e0'}; background: ${isSel ? '#f0f4ff' : '#fff'}; border-radius: 5px; padding: 6px 8px; cursor: pointer; transition: border-color 0.15s, background-color 0.15s; margin-bottom: 5px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <span style="font-weight: bold; font-size: 0.9em; color: #2b3a4a;">${name}</span>
            <span style="font-size: 0.75em; font-weight: bold; color: #555;">${d.dmgType}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; color: #333;">
            <span>Atk: <strong style="color: #2b3a4a;">${d.atkSign}</strong></span>
            <span>Dmg: <strong style="color: #2b3a4a;">${d.dmgFormula}</strong></span>
          </div>
          ${d.tags.length > 0 ? `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px;">${tagsHtml}</div>` : ""}
        </div>
      `;
    }).join("");
  }

  function renderSpellCards() {
    return spellKeys.map(key => {
      const sp = spellConfigs[key];
      const isSel = key === selectedSpellKey;
      const d = getSpellDetails(sp, sp.baseLevel);
      const lvlLabel = Number(sp.baseLevel) === 0 ? "Cantrip" : `Lvl ${sp.baseLevel}`;
      const tagsHtml = d.tags.map(t => `<span style="background: rgba(114, 137, 218, 0.15); border: 1px solid rgba(114, 137, 218, 0.3); border-radius: 2px; padding: 1px 4px; font-size: 0.7em; color: #4b5d88;">${t}</span>`).join(" ");

      return `
        <div class="action-card spell-card" data-key="${key}" style="border: 2px solid ${isSel ? '#7289da' : '#e0e0e0'}; background: ${isSel ? '#f0f4ff' : '#fff'}; border-radius: 5px; padding: 6px 8px; cursor: pointer; transition: border-color 0.15s, background-color 0.15s; margin-bottom: 5px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <span style="font-weight: bold; font-size: 0.9em; color: #2b3a4a;">${key}</span>
            <span style="font-size: 0.75em; font-weight: bold; color: #7289da;">${lvlLabel}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82em; color: #333;">
            <span>${sp.resolutionMethod === 'save' ? 'Save' : 'Roll'}: <strong style="color: #2b3a4a;">${d.actionVal}</strong></span>
            <span>Effect: <strong style="color: #2b3a4a;">${d.valFormula}</strong> <small style="color: #666;">${d.typeLabel}</small></span>
          </div>
          ${d.tags.length > 0 ? `<div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px;">${tagsHtml}</div>` : ""}
        </div>
      `;
    }).join("");
  }

  function getSelectedWeaponOptionsHtml() {
    const config = attacks[selectedWeaponKey];
    if (!config) return "";
    let gwmHtml = "";
    if (config.hasGWM) {
      gwmHtml = `
        <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.8em; font-weight: bold; color: #a34848; cursor: pointer; padding: 3px 6px; background: rgba(163, 72, 72, 0.08); border-radius: 3px; margin-bottom: 4px;">
          <span>GWM / Sharpshooter (-5 / +10)</span>
          <input type="checkbox" id="gwm-toggle" style="margin: 0;">
        </label>
      `;
    }
    const extras = config.additionalDamageComponents || [];
    let extrasHtml = "";
    if (extras.length > 0) {
      extrasHtml = `
        <div style="border-top: 1px solid #e0e0e0; padding-top: 4px; margin-top: 4px;">
          <div style="font-size: 0.7em; font-weight: bold; color: #777; margin-bottom: 3px;">OPTIONAL DAMAGE:</div>
          ${extras.map((ex, i) => `
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 0.78em; cursor: pointer; padding: 2px 4px; background: rgba(0,0,0,0.02); border-radius: 3px; margin-bottom: 2px;">
              <span><strong>${ex.label}</strong> <small style="color: #777;">(${ex.formula})</small></span>
              <input type="checkbox" class="extra-dmg-toggle" data-index="${i}" style="margin: 0;">
            </label>
          `).join("")}
        </div>
      `;
    }
    if (!gwmHtml && !extrasHtml) return "";
    return `<div style="background: #fafbfc; border: 1px solid #d2d7df; border-radius: 4px; padding: 6px; margin-top: 6px;">${gwmHtml}${extrasHtml}</div>`;
  }

  const content = `
    <div style="display: flex; flex-direction: column; gap: 8px; padding: 4px 2px; font-family: inherit;">
      <!-- Tabs -->
      <div style="display: flex; gap: 6px; border-bottom: 2px solid #7289da; padding-bottom: 8px;">
        <button type="button" id="tab-btn-weapon" style="flex: 1; padding: 6px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <i class="fas fa-sword"></i> Weapons (${attackNames.length})
        </button>
        <button type="button" id="tab-btn-spell" style="flex: 1; padding: 6px; font-weight: bold; border-radius: 4px 4px 0 0; border: 1px solid #7289da; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <i class="fas fa-magic"></i> Spells (${spellKeys.length})
        </button>
      </div>

      <!-- Weapons Section -->
      <div id="section-weapon" style="display: ${currentMode === 'weapon' ? 'flex' : 'none'}; flex-direction: column;">
        <div id="weapon-cards-container" style="max-height: 55vh; overflow-y: auto; padding-right: 4px;">
          ${renderWeaponCards()}
        </div>
        <div id="weapon-options-container">
          ${getSelectedWeaponOptionsHtml()}
        </div>
      </div>

      <!-- Spells Section -->
      <div id="section-spell" style="display: ${currentMode === 'spell' ? 'flex' : 'none'}; flex-direction: column;">
        <div id="spell-cards-container" style="max-height: 55vh; overflow-y: auto; padding-right: 4px;">
          ${renderSpellCards()}
        </div>
        <div id="spell-options-container" style="margin-top: 6px;">
          ${spellConfigs[selectedSpellKey] ? getUpcastOptionsHtml(spellConfigs[selectedSpellKey]) : ""}
        </div>
      </div>
    </div>
  `;

  new Dialog({
    title: `${actor.name}: Perform Action`,
    content: content,
    buttons: {
      execute: {
        icon: '<i class="fas fa-dice-d20" style="margin-right: 6px;"></i>',
        label: currentMode === "weapon" ? "Roll Attack" : "Cast Spell",
        callback: async (html) => {
          if (currentMode === "weapon") {
            const rawConfig = attacks[selectedWeaponKey];
            if (!rawConfig) return;
            const config = foundry.utils.duplicate(rawConfig);

            if (config.hasGWM && html.find("#gwm-toggle").is(":checked")) {
              config.attackCircumstanceModifier = (Number(config.attackCircumstanceModifier) || 0) - 5;
              config.damageModifier = (Number(config.damageModifier) || 0) + 10;
              config.chatCardTitle = `${config.chatCardTitle || selectedWeaponKey} [GWM/SS -5/+10]`;
            }

            if (config.additionalDamageComponents) {
              html.find(".extra-dmg-toggle").each(function () {
                const idx = $(this).data("index");
                if (config.additionalDamageComponents[idx]) {
                  config.additionalDamageComponents[idx].isActive = $(this).is(":checked");
                }
              });
            }

            await globalThis.attackSocket.executeAsGM("runAttackRoll", config, actor.id, game.user.id);
          } else {
            const rawConfig = spellConfigs[selectedSpellKey];
            if (!rawConfig) return;

            const castLvl = Number(html.find("#castLevelSelect").val()) ?? Number(rawConfig.baseLevel) ?? 0;
            const { cfg: config } = getEffectiveSpellConfig(rawConfig, castLvl);

            const shouldDeduct = html.find("#deductSlotToggle").is(":checked");
            if (!shouldDeduct || castLvl === 0) {
              config.skipSlotDeduction = true;
            } else {
              const slotKey = `spell${castLvl}`;
              const currentSlotVal = Number(actor.system.spells?.[slotKey]?.value) || 0;
              if (currentSlotVal <= 0) {
                const proceed = await Dialog.confirm({
                  title: "No Spell Slots Remaining",
                  content: `<p><strong>${actor.name}</strong> has <strong>0</strong> Level ${castLvl} spell slots remaining. Cast anyway?</p>`
                });
                if (!proceed) return;
                config.skipSlotDeduction = true;
              }
            }

            if (config.damageMode === "choice" && !["heal", "temp_hp", "max_hp"].includes(config.resolutionMethod)) {
              const choiceOptions = [
                "acid", "cold", "fire", "force", "lightning",
                "necrotic", "poison", "psychic", "radiant", "thunder"
              ].map(t => `<option value="${t}">${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join('');

              let choiceConfirmed = false;
              await new Promise((resolve) => {
                new Dialog({
                  title: `${config.spellName}: Damage Type`,
                  content: `<div style="padding: 6px;"><select id="chosenType" style="width:100%; height:30px;">${choiceOptions}</select></div>`,
                  buttons: {
                    ok: { label: "Confirm", callback: (chHtml) => { choiceConfirmed = true; config.damageType = chHtml.find("#chosenType").val(); } },
                    cancel: { label: "Cancel" }
                  },
                  default: "ok",
                  close: () => resolve()
                }, { width: 260 }).render(true);
              });
              if (!choiceConfirmed) return;
            }

            await globalThis.attackSocket.executeAsGM("runSpellAttackRoll", config, actor.id, game.user.id);
          }
        }
      },
      cancel: { label: "Cancel" }
    },
    default: "execute",
    render: (html) => {
      setTimeout(() => html.closest('.app.dialog').css({ height: "auto" }), 10);
      const btnWeapon = html.find("#tab-btn-weapon");
      const btnSpell = html.find("#tab-btn-spell");
      const secWeapon = html.find("#section-weapon");
      const secSpell = html.find("#section-spell");
      const execBtn = html.find(".dialog-button.execute");

      function updateCardStyles() {
        html.find(".weapon-card").each(function () {
          const k = $(this).data("key");
          const isSel = k === selectedWeaponKey;
          $(this).css({
            "border-color": isSel ? "#7289da" : "#e0e0e0",
            "background-color": isSel ? "#f0f4ff" : "#fff"
          });
        });
        html.find(".spell-card").each(function () {
          const k = $(this).data("key");
          const isSel = k === selectedSpellKey;
          $(this).css({
            "border-color": isSel ? "#7289da" : "#e0e0e0",
            "background-color": isSel ? "#f0f4ff" : "#fff"
          });
        });
      }

      function setTab(mode) {
        currentMode = mode;
        if (mode === "weapon") {
          btnWeapon.css({ background: "#7289da", color: "#fff" });
          btnSpell.css({ background: "#f0f2f5", color: "#555" });
          secWeapon.show();
          secSpell.hide();
          execBtn.html('<i class="fas fa-dice-d20" style="margin-right: 6px;"></i> Roll Attack');
          execBtn.prop("disabled", attackNames.length === 0);
        } else {
          btnSpell.css({ background: "#7289da", color: "#fff" });
          btnWeapon.css({ background: "#f0f2f5", color: "#555" });
          secSpell.show();
          secWeapon.hide();
          execBtn.html('<i class="fas fa-magic" style="margin-right: 6px;"></i> Cast Spell');
          execBtn.prop("disabled", spellKeys.length === 0);
        }
      }

      btnWeapon.on("click", () => setTab("weapon"));
      btnSpell.on("click", () => setTab("spell"));
      setTab(currentMode);

      html.find(".weapon-card").on("click", function () {
        selectedWeaponKey = $(this).data("key");
        updateCardStyles();
        html.find("#weapon-options-container").html(getSelectedWeaponOptionsHtml());
      });

      html.find(".spell-card").on("click", function () {
        selectedSpellKey = $(this).data("key");
        updateCardStyles();
        const sp = spellConfigs[selectedSpellKey];
        html.find("#spell-options-container").html(sp ? getUpcastOptionsHtml(sp) : "");
      });
    }
  }, {
    width: 440,
    height: "auto",
    resizable: true
  }).render(true);
};



}
