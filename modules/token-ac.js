import { MODULE_ID, FLAGS, SETTINGS } from "../src/constants.js";

export function getGlobalShowAC() {
  try {
    return Boolean(game.settings.get(MODULE_ID, SETTINGS.GLOBAL_SHOW_AC));
  } catch (e) {
    try {
      return Boolean(game.settings.get("world", "globalShowAC"));
    } catch {
      return false;
    }
  }
}

/**
 * Ensures the persistent DOM overlay container exists inside Foundry's canvas overlay UI layer.
 */
function getOrCreateOverlayLayer() {
  let layer = document.getElementById("cheapdice-token-overlay-layer");
  if (!layer) {
    const parent = document.getElementById("hud") || document.body;
    layer = document.createElement("div");
    layer.id = "cheapdice-token-overlay-layer";
    layer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 25;
      overflow: visible;
    `;
    parent.appendChild(layer);
  }
  return layer;
}

/**
 * Renders or updates the HTML DOM overlay badges (AC and Elevation) for a token.
 */
export function renderTokenAcBadge(token) {
  if (!token?.actor) return;

  const tokenId = token.id;
  const overlayLayer = getOrCreateOverlayLayer();
  let wrapper = document.getElementById(`cheapdice-badge-wrap-${tokenId}`);

  // If feature is disabled or token is destroyed/not rendered, remove overlay
  if (!game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_AC) || !token.visible || token.destroyed) {
    if (wrapper) wrapper.remove();
    return;
  }

  const masterEnabled = getGlobalShowAC();
  const tokenShowAC = Boolean(
    token.document.getFlag(MODULE_ID, FLAGS.SHOW_AC) ??
    token.document.getFlag("world", "showAC")
  );

  const elevationValue = Number(token.document.elevation ?? 0);
  const showElevation = elevationValue !== 0;
  const showAC = masterEnabled && tokenShowAC;

  // If neither badge needs to be shown, remove overlay wrapper
  if (!showAC && !showElevation) {
    if (wrapper) wrapper.remove();
    return;
  }

  // Create wrapper if not existing
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = `cheapdice-badge-wrap-${tokenId}`;
    wrapper.className = "cheapdice-token-badge-wrapper";
    wrapper.style.cssText = `
      position: absolute;
      pointer-events: none;
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transform-origin: center bottom;
      z-index: 25;
      white-space: nowrap;
      user-select: none;
    `;
    overlayLayer.appendChild(wrapper);
  }

  // Compute screen coordinates from canvas token bounds
  updateBadgeOverlayPosition(token, wrapper);

  // Elevation badge HTML
  let elevBadge = wrapper.querySelector(".cheapdice-elevation-badge");
  if (showElevation) {
    if (!elevBadge) {
      elevBadge = document.createElement("div");
      elevBadge.className = "cheapdice-elevation-badge";
      elevBadge.style.cssText = `
        background: rgba(0, 0, 0, 0.85);
        border: 1.5px solid #4a90e2;
        border-radius: 4px;
        color: #ffffff;
        font-family: ${token.nameplate?.style?.fontFamily || "Signika, sans-serif"};
        font-size: 15px;
        font-weight: bold;
        line-height: 1;
        padding: 3px 7px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      wrapper.appendChild(elevBadge);
    }
    const elevText = `${elevationValue > 0 ? "+" : ""}${elevationValue}`;
    if (elevBadge.textContent !== elevText) {
      elevBadge.textContent = elevText;
    }
  } else if (elevBadge) {
    elevBadge.remove();
  }

  // AC badge HTML
  let acBadge = wrapper.querySelector(".cheapdice-ac-badge");
  if (showAC) {
    if (!acBadge) {
      acBadge = document.createElement("div");
      acBadge.className = "cheapdice-ac-badge";
      acBadge.style.cssText = `
        background: rgba(0, 0, 0, 0.85);
        border: 1.5px solid #d4af37;
        border-radius: 4px;
        color: #ffffff;
        font-family: ${token.nameplate?.style?.fontFamily || "Signika, sans-serif"};
        font-size: 15px;
        font-weight: bold;
        line-height: 1;
        padding: 3px 7px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      wrapper.appendChild(acBadge);
    }
    const acValue = String(token.actor?.system?.attributes?.ac?.value ?? token.actor?.system?.attributes?.ac ?? "--");
    if (acBadge.textContent !== acValue) {
      acBadge.textContent = acValue;
    }
  } else if (acBadge) {
    acBadge.remove();
  }
}

/**
 * Updates wrapper screen coordinates to stay locked flush right above the token head.
 */
function updateBadgeOverlayPosition(token, wrapper) {
  if (!token?.visible || !canvas.ready || !canvas.stage) {
    wrapper.style.display = "none";
    return;
  }

  wrapper.style.display = "flex";

  // Get screen-space coordinates of the token's top-center
  const tokenScale = Math.max(Math.abs(token.document.texture?.scaleX ?? 1), 1);
  const visualTopOffset = Math.max(0, (token.h * (tokenScale - 1)) / 2);
  const worldX = token.x + (token.w / 2);
  const worldY = token.y - visualTopOffset - 6;

  // Convert canvas world coordinates to screen/viewport coordinates
  const screenPos = canvas.stage.worldTransform.apply({ x: worldX, y: worldY });
  const zoom = canvas.stage.scale.x;

  // Position wrapper anchored at bottom-center so it sits right above token
  wrapper.style.left = `${screenPos.x}px`;
  wrapper.style.top = `${screenPos.y}px`;
  wrapper.style.transform = `translate(-50%, -100%) scale(${Math.max(0.65, Math.min(1.4, zoom))})`;
}

/**
 * Public helper to re-render elevation badge (mirrors AC badge logic).
 */
export function renderTokenElevationBadge(token) {
  renderTokenAcBadge(token);
}

/**
 * Clean up overlay DOM node on token deletion.
 */
function removeTokenOverlay(tokenId) {
  const el = document.getElementById(`cheapdice-badge-wrap-${tokenId}`);
  if (el) el.remove();
}

/**
 * Sync all badge overlay positions on canvas pan, zoom, or refresh.
 */
function updateAllBadgePositions() {
  if (!canvas.tokens?.placeables) return;
  for (const token of canvas.tokens.placeables) {
    const wrapper = document.getElementById(`cheapdice-badge-wrap-${token.id}`);
    if (wrapper) updateBadgeOverlayPosition(token, wrapper);
  }
}

export function initTokenAc() {
  if (!game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_AC)) return;

  const TokenCls = foundry.canvas?.placeables?.Token ?? (typeof Token !== "undefined" ? Token : null);
  if (TokenCls) {
    // Suppress core raw tooltip / elevation indicators completely
    if (typeof TokenCls.prototype._getTooltipText === "function") {
      TokenCls.prototype._getTooltipText = function () {
        return "";
      };
    }

    if (typeof TokenCls.prototype._refreshTooltip === "function") {
      const originalRefreshTooltip = TokenCls.prototype._refreshTooltip;
      TokenCls.prototype._refreshTooltip = function (...args) {
        originalRefreshTooltip.apply(this, args);
        if (this.tooltip) {
          this.tooltip.visible = false;
          this.tooltip.renderable = false;
          this.tooltip.text = "";
        }
      };
    }

    if (typeof TokenCls.prototype._refreshElevation === "function") {
      const originalRefreshElevation = TokenCls.prototype._refreshElevation;
      TokenCls.prototype._refreshElevation = function (...args) {
        originalRefreshElevation.apply(this, args);
        if (this.elevation) {
          this.elevation.visible = false;
          this.elevation.renderable = false;
          this.elevation.text = "";
        }
      };
    }
  }

  // Hook into Foundry scene controls for GM Master Toggle
  Hooks.on("renderSceneControls", (controls, html) => {
    if (!game.user.isGM) return;
    if (!game.settings.get(MODULE_ID, SETTINGS.FEATURES.TOKEN_AC)) return;

    const root = html instanceof HTMLElement ? html : (html[0] ?? document.getElementById("scene-controls"));
    if (!root) return;

    const activeLayer = root.querySelector('#scene-controls-layers button[data-control="tokens"][aria-pressed="true"]');
    if (!activeLayer) return;

    const toolsMenu = root.querySelector('#scene-controls-tools[data-application-part="tools"]')
      || root.querySelector("#scene-controls-tools");
    if (!toolsMenu) return;

    toolsMenu.querySelector('li[data-tool="masterToggleAC"]')?.remove();

    const isActive = getGlobalShowAC();

    const li = document.createElement("li");
    li.dataset.tool = "masterToggleAC";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "control ui-control tool icon toggle fa-solid fa-shield-halved";
    btn.dataset.action = "tool";
    btn.dataset.tool = "masterToggleAC";
    btn.setAttribute("aria-label", "Master Toggle: Token AC Display");
    btn.setAttribute("aria-pressed", String(isActive));
    btn.dataset.tooltip = "Master Toggle: Token AC Display";

    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const currentState = getGlobalShowAC();
      const newState = !currentState;

      await game.settings.set(MODULE_ID, SETTINGS.GLOBAL_SHOW_AC, newState);
      btn.setAttribute("aria-pressed", String(newState));
      canvas.tokens?.placeables.forEach(t => renderTokenAcBadge(t));
    });

    li.appendChild(btn);
    toolsMenu.appendChild(li);
  });

  Hooks.once("ready", () => {
    try {
      game.settings.register(MODULE_ID, SETTINGS.GLOBAL_SHOW_AC, {
        name: "Master AC Display",
        hint: "Globally display AC badges above tokens.",
        scope: "world",
        config: false,
        type: Boolean,
        default: false,
        onChange: () => {
          canvas.tokens?.placeables.forEach(t => renderTokenAcBadge(t));
        }
      });
    } catch (e) {
      // Setting already registered
    }

    if (game.user.isGM && ui.controls) {
      ui.controls.render(true);
    }

    // Sync all active tokens
    canvas.tokens?.placeables.forEach(t => renderTokenAcBadge(t));

    // Pan / Zoom update listener
    Hooks.on("canvasPan", () => updateAllBadgePositions());

    // Token movement / refresh listeners
    Hooks.on("refreshToken", (token) => {
      if (token?.actor) renderTokenAcBadge(token);
    });

    Hooks.on("drawToken", (token) => {
      if (token?.actor) renderTokenAcBadge(token);
    });

    Hooks.on("destroyToken", (token) => {
      if (token?.id) removeTokenOverlay(token.id);
    });

    Hooks.on("deleteToken", (document) => {
      if (document?.id) removeTokenOverlay(document.id);
    });

    Hooks.on("updateToken", (document, change) => {
      const token = document.object;
      if (!token) return;
      renderTokenAcBadge(token);
    });

    Hooks.on("updateActor", (actor, change) => {
      if (foundry.utils.hasProperty(change, "system.attributes.ac")) {
        actor.getActiveTokens().forEach(token => renderTokenAcBadge(token));
      }
    });
  });
}

// Preserve backwards-compatible global references and expose to module public API
globalThis.renderTokenAcBadge = renderTokenAcBadge;
globalThis.renderTokenElevationBadge = renderTokenElevationBadge;
globalThis.getGlobalShowAC = getGlobalShowAC;
