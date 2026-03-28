/* HUN.JS - LEGO PREMIUM (single-file) v2.7
 * 요청 반영:
 * 1) 배경/SHOP 크기 축소 + 포탈/SHOP 위치 정렬 개선
 * 2) 커스텀 월드아트와 존/포탈 배치 좌표 동기화
 * 3) 캐릭터 공에 뜨는 현상 완화 + 걷기 애니메이션 강화
 * 4) I INVEN토리 / Tab EQUIP창 + 모자/옷/WEAPON EQUIP/해제 + 외형 반영
 * 5) 상단 하늘 라인 아래만 마을 활동 영역으로 제한 (NPC/차량 동선 안정화)
 *
 * 사용법:
 * 이 파일 ALL를 hub.js 에 그대로 붙여넣기
 */
(() => {
  "use strict";

  const __legacyUiIds = ["world","toast","coord","fps","fade","lego_modal","lego_modal_inner","lego_modal_title","lego_modal_body","lego_modal_hint","blacksmith_modal","blacksmith_card","blacksmith_title","blacksmith_body","blacksmith_hint","mobile_hud_buttons","btn_inventory","btn_equipment","btn_attack","btn_enter","joystick","inventory_panel","equipment_panel","hud_panels","lego_style_injected"];
  for (const __id of __legacyUiIds) {
    const __el = document.getElementById(__id);
    if (__el) __el.remove();
  }

  try {
    const keepIds = new Set(["world","toast","coord","fps","fade","lego_modal","lego_modal_inner","lego_modal_title","lego_modal_body","lego_modal_hint","blacksmith_modal","blacksmith_card","blacksmith_title","blacksmith_body","blacksmith_hint","mobile_hud_buttons","btn_inventory","btn_equipment","btn_attack","btn_enter","joystick","inventory_panel","equipment_panel","hud_panels","lego_style_injected"]);
    document.querySelectorAll("body > div, body > section, body > aside").forEach((el) => {
      if (!el || keepIds.has(el.id)) return;
      const cs = getComputedStyle(el);
      const big = (parseFloat(cs.width) || 0) > window.innerWidth * 0.55 && (parseFloat(cs.height) || 0) > window.innerHeight * 0.55;
      const suspicious = /modal|overlay|portal|dialog|popup|fade/i.test((el.id||"") + " " + (el.className||""));
      if (cs.position === "fixed" && (big || suspicious)) el.remove();
    });
  } catch(_) {}

  /* ----------------------- CONFIG ----------------------- */
  const SPRITE_SRC = "";
  const WORLD_ART_BASE_SRC =
    "https://raw.githubusercontent.com/faglobalxgp2024-design/XGP-world/main/%EB%A7%B5-%EB%B0%94%ED%83%95.png";
  const WORLD_ART_SRC =
    "https://raw.githubusercontent.com/faglobalxgp2024-design/XGP-world/main/%EB%A9%94%ED%83%80%EC%9B%94%EB%93%9C.png";
  const USE_CUSTOM_WORLD_ART = false;
  const USE_SPRITE_IF_LOADED = false;
  const SHOP_IMAGE_ROOT =
    "https://raw.githubusercontent.com/faglobalxgp2024-design/XGP-world/main/%EC%82%AC%EC%9D%B4%EC%A6%88%EB%A7%9E%EC%B6%98%EC%98%A4%EB%B8%8C%EC%A0%9C/";

  /* ----------------------- Utilities ----------------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function shade(hex, amt) {
    const h = String(hex || "#888888").replace("#", "");
    const hh = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const r = clamp(parseInt(hh.slice(0, 2), 16) + amt, 0, 255);
    const g = clamp(parseInt(hh.slice(2, 4), 16) + amt, 0, 255);
    const b = clamp(parseInt(hh.slice(4, 6), 16) + amt, 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function hash01(s) {
    let h = 2166136261;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
  }

  function isTouchDevice() {
    return (navigator.maxTouchPoints || 0) > 0;
  }

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFromWorld(w, h) {
    return ((w * 73856093) ^ (h * 19349663)) >>> 0;
  }

  function rectContainsPoint(r, x, y) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  function ptInRect(x, y, r) {
    return rectContainsPoint(r, x, y);
  }

  function rectsOverlap(a, b, pad = 0) {
    return !(
      a.x + a.w + pad < b.x - pad ||
      a.x - pad > b.x + b.w + pad ||
      a.y + a.h + pad < b.y - pad ||
      a.y - pad > b.y + b.h + pad
    );
  }

  /* ----------------------- Safe DOM ----------------------- */
  function ensureEl(id, tag, parent = document.body) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
      parent.appendChild(el);
    }
    return el;
  }

  function stylePanel(el, opts = {}) {
    el.style.background = opts.bg || "rgba(255,255,255,0.86)";
    el.style.border = opts.bd || "1px solid rgba(0,0,0,0.10)";
    el.style.backdropFilter = "blur(10px)";
    el.style.webkitBackdropFilter = "blur(10px)";
    el.style.boxShadow = opts.shadow || "0 18px 44px rgba(0,0,0,0.15)";
    el.style.borderRadius = opts.radius || "18px";
  }

  function makeButton(text) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.style.cursor = "pointer";
    b.style.border = "1px solid rgba(0,0,0,0.10)";
    b.style.background = "rgba(255,255,255,0.92)";
    b.style.color = "#0a0e18";
    b.style.font = "900 12px system-ui";
    b.style.padding = "10px 12px";
    b.style.borderRadius = "12px";
    b.style.boxShadow = "0 10px 24px rgba(0,0,0,0.10)";
    return b;
  }

  function ensureUI() {
    const canvas = ensureEl("world", "canvas");
    canvas.style.display = "block";
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    canvas.style.borderRadius = "0";
    canvas.style.background = "#eaf6ff";
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
    canvas.style.webkitUserSelect = "none";
    canvas.style.imageRendering = "auto";

    const topbar =
      document.querySelector("header.topbar") ||
      document.querySelector("#topbar") ||
      document.querySelector("header");
    if (topbar) topbar.style.display = "none";
    document.documentElement.style.margin = "0";
    document.documentElement.style.padding = "0";
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.overflow = "hidden";
    const wrap = document.querySelector("main.wrap") || document.querySelector(".wrap");
    if (wrap) {
      wrap.style.margin = "0";
      wrap.style.padding = "0";
      wrap.style.maxWidth = "none";
      wrap.style.width = "100%";
    }

    const toast = ensureEl("toast", "div");
    toast.style.position = "fixed";
    toast.style.left = "50%";
    toast.style.top = "92px";
    toast.style.transform = "translate(-50%, 0)";
    toast.style.right = "auto";
    toast.style.width = "max-content";
    toast.style.zIndex = "9999";
    toast.style.maxWidth = "min(720px, calc(100vw - 28px))";
    toast.style.textAlign = "center";
    toast.style.pointerEvents = "none";
    toast.hidden = true;
    toast.setAttribute("data-keep-hint","1");

    const coord = ensureEl("coord", "div");
    coord.style.position = "fixed";
    coord.style.left = "18px";
    coord.style.top = "18px";
    coord.style.zIndex = "9999";
    coord.style.padding = "8px 10px";
    coord.style.font = "900 12px system-ui";
    coord.style.color = "rgba(10,18,30,0.80)";
    stylePanel(coord, { radius: "12px", shadow: "0 10px 24px rgba(0,0,0,0.12)" });
    coord.style.display = "none";

    const fps = ensureEl("fps", "div");
    fps.style.position = "fixed";
    fps.style.left = "132px";
    fps.style.top = "18px";
    fps.style.zIndex = "9999";
    fps.style.padding = "8px 10px";
    fps.style.font = "900 12px system-ui";
    fps.style.color = "rgba(10,18,30,0.80)";
    stylePanel(fps, { radius: "12px", shadow: "0 10px 24px rgba(0,0,0,0.12)" });
    fps.style.display = "none";

    const fade = ensureEl("fade", "div");
    fade.style.position = "fixed";
    fade.style.inset = "0";
    fade.style.zIndex = "9998";
    fade.style.pointerEvents = "none";
    fade.style.opacity = "0";
    fade.style.transition = "opacity 160ms ease";
    fade.style.background = "transparent";

    const modal = ensureEl("lego_modal", "div");
    modal.innerHTML = "";
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.zIndex = "10000";
    modal.style.display = "none";
    modal.style.alignItems = "flex-start";
    modal.style.justifyContent = "center";
    modal.style.paddingTop = "22px";
    modal.style.background = "transparent";
    modal.style.pointerEvents = "none";
    modal.style.backdropFilter = "none";
    modal.style.webkitBackdropFilter = "none";
    modal.style.backdropFilter = "none";

    const modalInner = ensureEl("lego_modal_inner", "div", modal);
    modalInner.style.width = "min(320px, calc(100vw - 24px))";
    modalInner.style.maxWidth = "320px";
    modalInner.style.minHeight = "0";
    modalInner.style.height = "auto";
    modalInner.style.display = "flex";
    modalInner.style.flexDirection = "column";
    modalInner.style.alignItems = "center";
    modalInner.style.gap = "8px";
    modalInner.style.padding = "0";
    modalInner.style.pointerEvents = "auto";
    modalInner.style.textAlign = "center";
    modalInner.style.font = "1100 18px system-ui";
    modalInner.style.color = "#f8fafc";
    modalInner.style.userSelect = "none";
    modalInner.style.webkitUserSelect = "none";
    modalInner.style.background = "transparent";
    modalInner.style.border = "none";
    modalInner.style.filter = "none";
    modalInner.style.boxShadow = "none";
    modalInner.style.backdropFilter = "none";
    modalInner.style.webkitBackdropFilter = "none";

    const modalTitle = ensureEl("lego_modal_title", "div", modalInner);
    modalTitle.style.font = "1200 22px system-ui";
    modalTitle.style.marginBottom = "8px";

    const modalBody = ensureEl("lego_modal_body", "div", modalInner);
    modalBody.style.font = "1000 16px system-ui";
    modalBody.style.opacity = "0.94";
    modalBody.style.marginBottom = "0";
    modalBody.style.maxWidth = "100%";
    modalBody.style.lineHeight = "1.35";

    const modalHint = ensureEl("lego_modal_hint", "div", modalInner);
    modalHint.style.font = "900 13px system-ui";
    modalHint.style.opacity = "0.72";
    modalHint.style.marginTop = "2px";

    const shopModal = ensureEl("blacksmith_modal", "div");
    shopModal.innerHTML = "";
    shopModal.style.position = "fixed";
    shopModal.style.inset = "0";
    shopModal.style.zIndex = "10003";
    shopModal.style.display = "none";
    shopModal.style.alignItems = "center";
    shopModal.style.justifyContent = "center";
    shopModal.style.background = "rgba(2,6,23,0.12)";
    shopModal.style.backdropFilter = "none";
    shopModal.style.padding = "24px";

    const shopCard = ensureEl("blacksmith_card", "div", shopModal);
    shopCard.style.width = "min(980px, calc(100vw - 28px))";
    shopCard.style.maxHeight = "min(82vh, 980px)";
    shopCard.style.overflow = "hidden";
    shopCard.style.maxHeight = "min(84vh, 980px)";
    shopCard.style.overflowY = "auto";
    shopCard.style.overflowX = "hidden";
    shopCard.style.padding = "18px";
    shopCard.style.borderRadius = "24px";
    shopCard.style.border = "1px solid rgba(148,163,184,0.22)";
    shopCard.style.background = "linear-gradient(180deg, rgba(2,6,23,0.97), rgba(15,23,42,0.94))";
    shopCard.style.boxShadow = "0 30px 90px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)";
    shopCard.style.color = "#f8fafc";

    const shopTitle = ensureEl("blacksmith_title", "div", shopCard);
    const shopBody = ensureEl("blacksmith_body", "div", shopCard);
    const shopHint = ensureEl("blacksmith_hint", "div", shopCard);

    const panelWrap = ensureEl("hud_panels", "div");
    panelWrap.style.position = "fixed";
    panelWrap.style.right = "18px";
    panelWrap.style.top = "18px";
    panelWrap.style.zIndex = "10002";
    panelWrap.style.display = "flex";
    panelWrap.style.flexDirection = "column";
    panelWrap.style.gap = "12px";
    panelWrap.style.pointerEvents = "none";

    const inventoryPanel = ensureEl("inventory_panel", "div", panelWrap);
    inventoryPanel.style.width = "340px";
    inventoryPanel.style.minHeight = "236px";
    inventoryPanel.style.maxHeight = "74vh";
    inventoryPanel.style.overflowY = "auto";
    inventoryPanel.style.padding = "14px";
    inventoryPanel.style.display = "none";
    inventoryPanel.style.pointerEvents = "auto";
    stylePanel(inventoryPanel);

    const equipmentPanel = ensureEl("equipment_panel", "div", panelWrap);
    equipmentPanel.style.width = "280px";
    equipmentPanel.style.minHeight = "236px";
    equipmentPanel.style.padding = "14px";
    equipmentPanel.style.display = "none";
    equipmentPanel.style.pointerEvents = "auto";
    stylePanel(equipmentPanel);

    const mobileBtns = ensureEl("mobile_hud_buttons", "div");
    mobileBtns.style.position = "fixed";
    mobileBtns.style.left = "14px";
    mobileBtns.style.top = "44px";
    mobileBtns.style.bottom = "auto";
    mobileBtns.style.right = "auto";
    mobileBtns.style.zIndex = "10002";
    mobileBtns.style.display = isTouchDevice() ? "flex" : "none";
    mobileBtns.style.flexDirection = "row";
    mobileBtns.style.flexWrap = "wrap";
    mobileBtns.style.alignItems = "center";
    mobileBtns.style.gap = "8px";
    mobileBtns.style.width = "220px";

    const invBtn = ensureEl("btn_inventory", "button", mobileBtns);
    const eqBtn = ensureEl("btn_equipment", "button", mobileBtns);
    const saveBtn = ensureEl("btn_save", "button", mobileBtns);
    const enterBtn = ensureEl("btn_enter", "button", mobileBtns);
    const atkBtn = ensureEl("btn_attack", "button", mobileBtns);
    const fireBtn = ensureEl("btn_fireball", "button", mobileBtns);
    const hasteBtn = ensureEl("btn_haste", "button", mobileBtns);
    invBtn.textContent = "INVEN";
    eqBtn.textContent = "EQUIP";
    saveBtn.textContent = "SAVE";
    enterBtn.textContent = "GO IN";
    atkBtn.textContent = "ATTACK";
    fireBtn.textContent = "FIRE";
    hasteBtn.textContent = "SPEED";
    [invBtn, eqBtn, saveBtn, enterBtn, atkBtn, fireBtn, hasteBtn].forEach((b) => {
      b.style.minWidth = "96px";
      b.style.cursor = "pointer";
      b.style.border = "1px solid rgba(255,255,255,0.12)";
      b.style.background = "rgba(255,255,255,0.92)";
      b.style.color = "#0a0e18";
      b.style.font = "900 12px system-ui";
      b.style.padding = "12px 14px";
      b.style.borderRadius = "14px";
      b.style.boxShadow = "0 12px 28px rgba(0,0,0,0.12)";
      b.style.transition = "transform 90ms ease, filter 90ms ease, opacity 90ms ease";
    });
    [invBtn, eqBtn, saveBtn, enterBtn, atkBtn, fireBtn, hasteBtn].forEach((b)=>{
      b.addEventListener("pointerdown", ()=>{ b.style.transform = "scale(0.94)"; b.style.filter = "brightness(0.92)"; });
      const up=()=>{ b.style.transform = "scale(1)"; b.style.filter = "brightness(1)"; };
      b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("pointerleave", up);
    });
    saveBtn.style.background = "linear-gradient(180deg,#38bdf8,#1d4ed8)";
    saveBtn.style.color = "#fff";
    saveBtn.style.fontWeight = "1000";
    enterBtn.style.background = "linear-gradient(180deg,#22c55e,#15803d)";
    enterBtn.style.color = "#fff";
    enterBtn.style.fontWeight = "1000";
    enterBtn.style.minWidth = "110px";
    enterBtn.style.display = "none";
    atkBtn.style.background = "linear-gradient(180deg,#ff6b6b,#dc2626)";
    atkBtn.style.color = "#fff";
    atkBtn.style.fontWeight = "1000";
    atkBtn.style.minWidth = "110px";
    fireBtn.style.background = "linear-gradient(180deg,#fb923c,#ea580c)";
    fireBtn.style.color = "#fff";
    fireBtn.style.fontWeight = "1000";
    fireBtn.style.minWidth = "110px";
    hasteBtn.style.background = "linear-gradient(180deg,#22c55e,#0f766e)";
    hasteBtn.style.color = "#fff";
    hasteBtn.style.fontWeight = "1000";
    hasteBtn.style.minWidth = "110px";
    const desktopSaveBtn = ensureEl("btn_save_desktop", "button");
    const desktopFireBtn = ensureEl("btn_fireball_desktop", "button");
    const desktopHasteBtn = ensureEl("btn_haste_desktop", "button");
    desktopSaveBtn.textContent = "SAVE";
    desktopFireBtn.textContent = "Q FIRE";
    desktopHasteBtn.textContent = "R SPEED";
    desktopSaveBtn.style.position = "fixed";
    desktopSaveBtn.style.left = "14px";
    desktopSaveBtn.style.top = "14px";
    desktopSaveBtn.style.zIndex = "10002";
    desktopSaveBtn.style.cursor = "pointer";
    desktopSaveBtn.style.border = "1px solid rgba(0,0,0,0.10)";
    desktopSaveBtn.style.background = "linear-gradient(180deg,#38bdf8,#1d4ed8)";
    desktopSaveBtn.style.color = "#fff";
    desktopSaveBtn.style.font = "900 12px system-ui";
    desktopSaveBtn.style.padding = "10px 14px";
    desktopSaveBtn.style.borderRadius = "14px";
    desktopSaveBtn.style.boxShadow = "0 12px 28px rgba(0,0,0,0.12)";
    desktopSaveBtn.style.display = isTouchDevice() ? "none" : "block";
    [desktopFireBtn, desktopHasteBtn].forEach((b, i) => {
      b.style.position = "fixed";
      b.style.right = `${14 + i * 98}px`;
      b.style.top = "182px";
      b.style.zIndex = "10002";
      b.style.cursor = "pointer";
      b.style.border = "1px solid rgba(0,0,0,0.10)";
      b.style.color = "#fff";
      b.style.font = "900 12px system-ui";
      b.style.padding = "10px 14px";
      b.style.borderRadius = "14px";
      b.style.boxShadow = "0 12px 28px rgba(0,0,0,0.12)";
      b.style.display = isTouchDevice() ? "none" : "block";
    });
    desktopFireBtn.style.background = "linear-gradient(180deg,#fb923c,#ea580c)";
    desktopHasteBtn.style.background = "linear-gradient(180deg,#22c55e,#0f766e)";

    if (isTouchDevice()) {
      saveBtn.style.position = "fixed";
      saveBtn.style.left = "10px";
      saveBtn.style.top = "10px";
      saveBtn.style.zIndex = "10004";
      saveBtn.style.minWidth = "0";
      saveBtn.style.padding = "10px 12px";
      invBtn.style.position = "fixed";
      invBtn.style.left = "10px";
      invBtn.style.top = "54px";
      invBtn.style.zIndex = "10004";
      invBtn.style.minWidth = "72px";
      eqBtn.style.position = "fixed";
      eqBtn.style.left = "88px";
      eqBtn.style.top = "54px";
      eqBtn.style.zIndex = "10004";
      eqBtn.style.minWidth = "72px";
      atkBtn.style.position = "fixed";
      atkBtn.style.right = "18px";
      atkBtn.style.bottom = "26px";
      atkBtn.style.left = "auto";
      atkBtn.style.top = "auto";
      atkBtn.style.zIndex = "10003";
      atkBtn.style.width = "78px";
      atkBtn.style.height = "78px";
      atkBtn.style.minWidth = "78px";
      atkBtn.style.padding = "0";
      atkBtn.style.borderRadius = "999px";
      enterBtn.style.position = "fixed";
      enterBtn.style.right = "18px";
      enterBtn.style.bottom = "188px";
      enterBtn.style.left = "auto";
      enterBtn.style.top = "auto";
      enterBtn.style.zIndex = "10003";
      fireBtn.style.position = "fixed";
      fireBtn.style.right = "106px";
      fireBtn.style.bottom = "40px";
      fireBtn.style.left = "auto";
      fireBtn.style.top = "auto";
      fireBtn.style.zIndex = "10003";
      fireBtn.style.width = "64px";
      fireBtn.style.height = "64px";
      fireBtn.style.minWidth = "64px";
      fireBtn.style.padding = "0";
      fireBtn.style.borderRadius = "999px";
      hasteBtn.style.position = "fixed";
      hasteBtn.style.right = "28px";
      hasteBtn.style.bottom = "114px";
      hasteBtn.style.left = "auto";
      hasteBtn.style.top = "auto";
      hasteBtn.style.zIndex = "10003";
      hasteBtn.style.width = "64px";
      hasteBtn.style.height = "64px";
      hasteBtn.style.minWidth = "64px";
      hasteBtn.style.padding = "0";
      hasteBtn.style.borderRadius = "999px";
      mobileBtns.style.pointerEvents = "none";
      [saveBtn, invBtn, eqBtn, atkBtn, enterBtn, fireBtn, hasteBtn].forEach((b)=> b.style.pointerEvents = "auto");
    }

    const style = ensureEl("lego_style_injected", "style", document.head);
    style.textContent = `
      #fade.on { opacity: 0.03; }
      #lego_modal { animation: legoPop 160ms ease both; }
      @keyframes legoPop {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
      .slot-card {
        display:flex; align-items:center; justify-content:space-between;
        gap:10px; margin:10px 0; padding:12px;
        border-radius:16px; border:1px solid rgba(148,163,184,0.18);
        background:linear-gradient(180deg, rgba(18,25,39,0.96), rgba(30,41,59,0.92));
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.06), 0 14px 30px rgba(2,6,23,0.20);
      }
      .slot-card .meta { display:flex; flex-direction:column; gap:4px; flex:1; min-width:0; }
      .slot-card .meta b { font:900 13px system-ui; color:#f8fafc; letter-spacing:0.02em; }
      .slot-card .meta span { font:700 11px system-ui; color:rgba(226,232,240,0.72); }
      .slot-card button {
        cursor:pointer; border:none; border-radius:12px; padding:9px 12px;
        background:linear-gradient(180deg,#38bdf8,#2563eb); color:#fff; font:900 11px system-ui;
        box-shadow:0 8px 20px rgba(37,99,235,0.32);
      }
      .slot-card button[disabled] {
        background:linear-gradient(180deg,#475569,#334155);
        box-shadow:none;
      }
      .item-icon {
        width:52px; height:52px; border-radius:14px; flex:0 0 52px;
        border:1px solid rgba(255,255,255,0.10);
      .skill-cd { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; border-radius:inherit; background:rgba(2,6,23,0.42); color:#fff; font:900 14px system-ui; letter-spacing:0.02em; }
      .cooling { filter:saturate(0.82) brightness(0.92); }

        box-shadow:inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 20px rgba(2,6,23,0.28);
        position:relative; overflow:hidden;
      }
      .item-icon::after {
        content:""; position:absolute; inset:0;
        background:linear-gradient(135deg, rgba(255,255,255,0.22), transparent 42%, transparent 100%);
        pointer-events:none;
      }
      .grid-wrap {
        display:grid; grid-template-columns:repeat(4, minmax(0,1fr));
        gap:10px; margin-top:10px;
        align-items:start;
      }
      .grid-slot {
        aspect-ratio:1/1; border-radius:14px;
        background:linear-gradient(180deg, rgba(15,23,42,0.88), rgba(30,41,59,0.92));
        border:1px solid rgba(148,163,184,0.18);
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.05);
        position:relative;
      }
      .grid-slot.active {
        outline:2px solid rgba(56,189,248,0.75);
        box-shadow:0 0 0 3px rgba(56,189,248,0.16), inset 0 1px 0 rgba(255,255,255,0.08);
      }
      .grid-slot .mini-label {
        position:absolute; left:6px; right:6px; bottom:5px;
        font:800 9px system-ui; color:rgba(226,232,240,0.75);
        text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .panel-title {
        display:flex; align-items:center; justify-content:space-between;
        margin-bottom:12px;
      }
      .panel-title b { font:1000 16px system-ui; color:#0a0e18; }
      .panel-title span { font:800 11px system-ui; color:rgba(10,14,24,0.58); }
      .empty-text { font:800 12px system-ui; color:rgba(10,14,24,0.56); padding:6px 2px; }
      .shop-head {
        display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
        margin-bottom:14px; padding:14px 16px; border-radius:20px;
        background:linear-gradient(180deg, rgba(15,23,42,0.94), rgba(30,41,59,0.92));
        border:1px solid rgba(148,163,184,0.20);
        box-shadow:inset 0 1px 0 rgba(255,255,255,0.07);
      }
      .shop-grid {
        display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
        gap:12px; margin-top:14px;
      }
      .shop-item {
        position:relative; overflow:hidden; border-radius:20px; padding:14px;
        border:1px solid rgba(148,163,184,0.18);
        background:linear-gradient(180deg, rgba(15,23,42,0.96), rgba(30,41,59,0.90));
        box-shadow:0 18px 38px rgba(2,6,23,0.32), inset 0 1px 0 rgba(255,255,255,0.06);
        display:flex; gap:12px; align-items:center;
      }
      .shop-item::before {
        content:""; position:absolute; inset:0; pointer-events:none;
        background:linear-gradient(135deg, rgba(255,255,255,0.10), transparent 34%, transparent 100%);
      }
      .shop-item .meta { display:flex; flex-direction:column; gap:4px; flex:1; min-width:0; }
      .shop-item .meta b { font:1000 14px system-ui; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .shop-item .meta span { font:800 11px system-ui; color:rgba(226,232,240,0.74); }
      .shop-item .price { font:1000 16px system-ui; color:#fcd34d; letter-spacing:0.02em; }
      .shop-item button {
        border:none; border-radius:14px; padding:10px 14px; cursor:pointer;
        background:linear-gradient(180deg,#f59e0b,#ea580c); color:#fff; font:1000 12px system-ui;
        box-shadow:0 12px 24px rgba(234,88,12,0.28);
      }
      .shop-item button[disabled] {
        background:linear-gradient(180deg,#475569,#334155); box-shadow:none; opacity:0.85;
      }
      .rarity-chip {
        display:inline-flex; align-items:center; gap:6px; width:max-content;
        font:900 10px system-ui; letter-spacing:0.08em; text-transform:uppercase;
        padding:5px 8px; border-radius:999px; border:1px solid rgba(255,255,255,0.14);
      }
    `;

    const joy = ensureEl("joystick", "div");
    const JOY_SIZE = 112;
    const JOY_KNOB = 48;
    const JOY_RING = 84;
    joy.style.position = "fixed";
    joy.style.left = "18px";
    joy.style.right = "auto";
    joy.style.bottom = "18px";
    joy.style.zIndex = "10001";
    joy.style.width = `${JOY_SIZE}px`;
    joy.style.height = `${JOY_SIZE}px`;

      joy.style.display = isTouchDevice() ? "block" : "none";
    joy.style.touchAction = "none";
    joy.style.userSelect = "none";
    joy.style.webkitUserSelect = "none";

    const joyBase = ensureEl("joystick_base", "div", joy);
    joyBase.style.position = "absolute";
    joyBase.style.inset = "0";
    joyBase.style.borderRadius = "999px";
    joyBase.style.background = "rgba(255,255,255,0.72)";
    joyBase.style.border = "1px solid rgba(0,0,0,0.10)";
    joyBase.style.boxShadow = "0 18px 44px rgba(0,0,0,0.16)";
    joyBase.style.backdropFilter = "blur(8px)";

    const joyRing = ensureEl("joystick_ring", "div", joy);
    joyRing.style.position = "absolute";
    joyRing.style.left = "16px";
    joyRing.style.top = "16px";
    joyRing.style.width = `${JOY_RING}px`;
    joyRing.style.height = `${JOY_RING}px`;
    joyRing.style.borderRadius = "999px";
    joyRing.style.border = "1px dashed rgba(10,14,24,0.18)";
    joyRing.style.opacity = "0.55";

    const joyKnob = ensureEl("joystick_knob", "div", joy);
    joyKnob.style.position = "absolute";
    joyKnob.style.left = "50%";
    joyKnob.style.top = "50%";
    joyKnob.style.transform = "translate(-50%, -50%)";
    joyKnob.style.width = `${JOY_KNOB}px`;
    joyKnob.style.height = `${JOY_KNOB}px`;
    joyKnob.style.borderRadius = "999px";
    joyKnob.style.background = "rgba(255,255,255,0.92)";
    joyKnob.style.border = "1px solid rgba(0,0,0,0.12)";
    joyKnob.style.boxShadow = "0 16px 40px rgba(0,0,0,0.18)";
    joyKnob.style.display = "flex";
    joyKnob.style.alignItems = "center";
    joyKnob.style.justifyContent = "center";
    joyKnob.style.font = "1200 14px system-ui";
    joyKnob.style.color = "rgba(10,14,24,0.80)";
    joyKnob.textContent = "MOVE";

    const joyState = { active: false, id: -1, ax: 0, ay: 0 };
    function setJoy(ax, ay) {
      joyState.ax = ax;
      joyState.ay = ay;
      const max = 52;
      const px = ax * max;
      const py = ay * max;
      joyKnob.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
      joyBase.style.background = joyState.active ? "rgba(255,255,255,0.86)" : "rgba(255,255,255,0.72)";
    }
    function joyPointerDown(e) {
      e.preventDefault();
      joyState.active = true;
      joyState.id = e.pointerId;
      try { joy.setPointerCapture(e.pointerId); } catch (_) {}
      joyPointerMove(e);
    }
    function joyPointerMove(e) {
      if (!joyState.active || e.pointerId !== joyState.id) return;
      const r = joy.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const max = 62;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, len / max);
      const ax = (dx / len) * k;
      const ay = (dy / len) * k;
      const dz = 0.10;
      const dd = Math.hypot(ax, ay);
      if (dd < dz) return setJoy(0, 0);
      setJoy(ax, ay);
    }
    function joyPointerUp(e) {
      if (e.pointerId !== joyState.id) return;
      joyState.active = false;
      joyState.id = -1;
      setJoy(0, 0);
      try { joy.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    joy.addEventListener("pointerdown", joyPointerDown, { passive: false });
    joy.addEventListener("pointermove", joyPointerMove, { passive: false });
    joy.addEventListener("pointerup", joyPointerUp, { passive: false });
    joy.addEventListener("pointercancel", joyPointerUp, { passive: false });

    atkBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      window.__metaWorldAttackTap = performance.now();
    }, { passive: false });

    return {
      canvas, toast, coord, fps, fade, modal, modalTitle, modalBody, modalHint,
      shopModal, shopCard, shopTitle, shopBody, shopHint,
      inventoryPanel, equipmentPanel, invBtn, eqBtn, saveBtn, desktopSaveBtn, enterBtn, atkBtn, fireBtn, hasteBtn, desktopFireBtn, desktopHasteBtn, joyState
    };
  }

  /* ----------------------- Start ----------------------- */
  window.addEventListener("DOMContentLoaded", () => {
    const UI = ensureUI();
    const canvas = UI.canvas;
    const ctx = canvas.getContext("2d", { alpha: true });

    let W = 0, H = 0, DPR = 1;
    const VIEW = { zoom: 0.72, w: 0, h: 0 };
    const WORLD = { w: 6400, h: 4600, margin: 240 };
    const cam = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const ART_BOUNDS = { x: 0, y: 0, w: 0, h: 0, skyLineY: 0, village: null };

    function screenToWorld(sx, sy) {
      return { x: sx + cam.x, y: sy + cam.y };
    }

    /* ----------------------- Sprite / Scene art ----------------------- */
    const sprite = { img: null, loaded: false, w: 1, h: 1 };
    if (SPRITE_SRC && USE_SPRITE_IF_LOADED) {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        sprite.img = im;
        sprite.loaded = true;
        sprite.w = im.naturalWidth || 1;
        sprite.h = im.naturalHeight || 1;
      };
      im.onerror = () => {
        sprite.loaded = false;
        sprite.img = null;
      };
      im.src = SPRITE_SRC;
    }

    const worldArt = { base: null, top: null, baseLoaded: false, topLoaded: false };
    function loadSceneImage(src, key) {
      if (!src) return;
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        worldArt[key] = im;
        worldArt[key + "Loaded"] = true;
      };
      im.onerror = () => {
        worldArt[key] = null;
        worldArt[key + "Loaded"] = false;
      };
      im.src = src;
    }
    if (USE_CUSTOM_WORLD_ART) {
      loadSceneImage(WORLD_ART_BASE_SRC, "base");
      loadSceneImage(WORLD_ART_SRC, "top");
    }
    function hasCustomWorldArt() {
      return !!(USE_CUSTOM_WORLD_ART && (worldArt.baseLoaded || worldArt.topLoaded));
    }
    function drawCustomWorldArt() {
      if (!hasCustomWorldArt()) return false;
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const bx = ART_BOUNDS.x;
      const by = ART_BOUNDS.y;
      const bw = ART_BOUNDS.w;
      const bh = ART_BOUNDS.h;

      if (worldArt.baseLoaded && worldArt.base) ctx.drawImage(worldArt.base, bx, by, bw, bh);
      if (worldArt.topLoaded && worldArt.top) ctx.drawImage(worldArt.top, bx, by, bw, bh);

      ctx.restore();
      return true;
    }

    const SHOP_IMAGE_FILES = {
      avoid: "%EB%B9%84%ED%96%89%EA%B8%B0%EA%B2%8C%EC%9E%84%EC%A1%B4.png",
      shooting: "%EC%8A%88%ED%8C%85%EA%B2%8C%EC%9E%84%EC%A1%B4.png",
      archery: "%EC%96%91%EA%B6%81%EA%B2%8C%EC%9E%84%EC%A1%B4.png",
      janggi: "%EC%9E%A5%EA%B8%B0%EC%A1%B4.png",
      omok: "%EC%98%A4%EB%AA%A9%EC%A1%B4.png",
      twitter: "%ED%8A%B8%EC%9C%84%ED%84%B0%EC%A1%B4.png",
      telegram: "%ED%85%94%EB%A0%88%EA%B7%B8%EB%9E%A8%EC%A1%B4.png",
      wallet: "%EC%9B%94%EB%A0%9B%EC%A1%B4.png",
      market: "%EB%A7%88%EC%BC%93%EC%A1%B4.png",
      lbank: "LBANK.png"
    };
    const SHOP_IMAGE_OVERRIDE_SRC = {
      lbank: "https://raw.githubusercontent.com/faglobalxgp2024-design/XGP-world/main/LBANK.png"
    };
    const shopArt = Object.create(null);
    function loadShopArt() {
      Object.entries(SHOP_IMAGE_FILES).forEach(([key, file]) => {
        const im = new Image();
        im.crossOrigin = "anonymous";
        shopArt[key] = { img: im, loaded: false };
        im.onload = () => { shopArt[key].loaded = true; };
        im.onerror = () => { shopArt[key].loaded = false; };
        im.src = SHOP_IMAGE_OVERRIDE_SRC[key] || (SHOP_IMAGE_ROOT + file);
      });
    }
    loadShopArt();

    function hasShopArt(key) {
      return !!(shopArt[key] && shopArt[key].loaded && shopArt[key].img);
    }

    /* ----------------------- World data ----------------------- */
    const roads = [];
    const sidewalks = [];
    const crossings = [];
    const signals = [];
    const props = [];
    const signs = [];
    let portalNPCs = [];
    let portalEmblems = [];
    const adBuildings = [];
    const roamers = [];
    const footprints = [];
    const cars = [];
    let groundPatches = [];

    const portals = [
      { key: "avoid", label: "AIRPLANE", status: "open", url: "https://faglobalxgp2024-design.github.io/index.html/", type: "arcade", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "shooting", label: "SHOOTING", status: "soon", url: "", message: "COMING SOON", type: "tower", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "archery", label: "ARCHERY", status: "soon", url: "", message: "COMING SOON", type: "tower", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "janggi", label: "JANGGI", status: "soon", url: "", message: "COMING SOON", type: "dojo", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "omok", label: "OMOK", status: "open", url: "https://fagomoku.xyz/", message: "Enter Gomoku?", type: "cafe", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "twitter", label: "TWITTER", status: "open", url: "https://x.com/FAGLOBAL_", type: "social", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "telegram", label: "TELEGRAM", status: "open", url: "https://t.me/faglobalgp", type: "social", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "wallet", label: "WALLET", status: "open", url: "https://faglobal.site/", type: "wallet", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "market", label: "MARKET", status: "open", url: "https://famarket.store/", type: "market", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "lbank", label: "LBANK", status: "open", url: "https://www.lbank.com/trade/xgp_usdt", type: "market", size: "L", x: 0, y: 0, w: 0, h: 0 },
      { key: "blacksmith", label: "BLACKSMITH", status: "shop", url: "", message: "SHOP에 GO IN하시겠습니까?", type: "building", size: "M", x: 0, y: 0, w: 0, h: 0 }
    ];

          const portalsByKey = (k) => portals.find((p) => p.key === k);

    let ZONES = {
      game: { x: 0, y: 0, w: 0, h: 0, label: "GAME ZONE", color: "#0a84ff", entrance: null },
      community: { x: 0, y: 0, w: 0, h: 0, label: "COMMUNITY ZONE", color: "#34c759", entrance: null },
      ads: { x: 0, y: 0, w: 0, h: 0, label: "AD ZONE", color: "#ff2d55", entrance: null },
    };

    function rectInAnyZone(rect, pad = 0) {
      return (
        rectsOverlap(rect, ZONES.game, pad) ||
        rectsOverlap(rect, ZONES.community, pad) ||
        rectsOverlap(rect, ZONES.ads, pad)
      );
    }

    const player = {
      x: 360,
      y: 360,
      r: 18,
      speed: isTouchDevice() ? 185 : 250,
      moving: false,
      animT: 0,
      bobT: 0,
      dir: "down",
      walkPhase: 0,
      gearFlashT: 0
    };

    let activePortal = null;
    let entering = false;
    let mobileToastUntil = 0;

    const combatState = {
      attackT: 0,
      slashFx: [],
      slimes: [],
      titans: [],
      damageTexts: [],
      fireballs: [],
      fireExplosions: [],
      stars: 10000,
      canAttack: true,
      combo: 0,
      comboT: 0,
      fireballCd: 0,
      hasteCd: 0,
      hasteUntil: 0
    };

    /* ----------------------- Inventory / Equipment ----------------------- */
    const inventoryState = {
      inventoryOpen: false,
      equipmentOpen: false,
      items: [
        { id: "hat_royal", slot: "hat", name: "Royal Helm", desc: "Starter Helm", color: "#dc2626", owned: true, icon: "helm", price: 0, tier: "starter", def: 4 },
        { id: "armor_shadow", slot: "armor", name: "Shadow Armor", desc: "Starter Armor", color: "#111827", owned: true, icon: "armor", price: 0, tier: "starter", def: 8 },
        { id: "weapon_blade", slot: "weapon", name: "Crimson Blade", desc: "Starter Sword", color: "#94a3b8", owned: true, icon: "sword", price: 0, tier: "starter", atk: 8 },
        { id: "shield_guard", slot: "shield", name: "Aegis Guard", desc: "Starter Shield", color: "#94a3b8", owned: true, icon: "shield", price: 0, tier: "starter", def: 6 },
      ],
      equipped: {
        hat: "hat_royal",
        armor: "armor_shadow",
        weapon: "weapon_blade",
        shield: "shield_guard"
      },
      enhance: { weapon: 0, shield: 0, hat: 0, armor: 0 }
    };

    /* ----------------------- Save / Profile ----------------------- */
    const SAVE_KEY_PREFIX = "xgp_save_";
    const PROFILE_KEY = "xgp_profile_id";
    let activeProfileId = "";

    function makeDefaultProfileId() {
      return `player_${Math.random().toString(36).slice(2, 8)}`;
    }

    function snapshotSave() {
      return {
        version: 1,
        stars: combatState.stars,
        player: { x: player.x, y: player.y, dir: player.dir },
        equipped: { ...inventoryState.equipped },
        enhance: { ...inventoryState.enhance },
        ownedIds: inventoryState.items.filter((it) => it.owned).map((it) => it.id)
      };
    }

    function applySaveData(data) {
      if (!data || typeof data !== "object") return;
      if (typeof data.stars === "number") combatState.stars = Math.max(0, data.stars);
      if (data.player) {
        if (typeof data.player.x === "number") player.x = data.player.x;
        if (typeof data.player.y === "number") player.y = data.player.y;
        if (typeof data.player.dir === "string") player.dir = data.player.dir;
      }
      const owned = new Set(Array.isArray(data.ownedIds) ? data.ownedIds : []);
      for (const item of inventoryState.items) {
      }
      for (const item of inventoryState.items) {
        if (item.price === 0) item.owned = true;
        else item.owned = owned.has(item.id);
      }
      if (data.equipped && typeof data.equipped === "object") {
        inventoryState.equipped = {
          hat: data.equipped.hat || inventoryState.equipped.hat,
          armor: data.equipped.armor || inventoryState.equipped.armor,
          weapon: data.equipped.weapon || inventoryState.equipped.weapon,
          shield: data.equipped.shield || inventoryState.equipped.shield,
        };
      }
      if (data.enhance && typeof data.enhance === "object") {
        inventoryState.enhance = {
          weapon: Math.max(0, Math.min(10, data.enhance.weapon || 0)),
          shield: Math.max(0, Math.min(10, data.enhance.shield || 0)),
          hat: Math.max(0, Math.min(10, data.enhance.hat || 0)),
          armor: Math.max(0, Math.min(10, data.enhance.armor || 0)),
        };
      }
    }

    let lastSavedAt = 0;
    function persistGame(force = false) {
      if (!activeProfileId) return;
      try {
        localStorage.setItem(PROFILE_KEY, activeProfileId);
        localStorage.setItem(SAVE_KEY_PREFIX + activeProfileId, JSON.stringify(snapshotSave()));
        lastSavedAt = performance.now();
      } catch (_) {}
    }

    function saveNowToast() {
      persistGame(true);
      try {
        mobileToastUntil = performance.now() + 1600;
        UI.toast.hidden = false;
        UI.toast.style.display = "block";
        UI.toast.style.top = isTouchDevice() ? "84px" : "92px";
        UI.toast.innerHTML = blockSpan(`💾 SAVE되었습니다<br/><b>${activeProfileId}</b>`, { bg: "rgba(15,23,42,0.92)", fg: "#f8fafc", pad: "12px 16px", radius: "16px" });
        clearTimeout(saveNowToast._tid);
        saveNowToast._tid = setTimeout(() => {
          if (!shopState.open && performance.now() >= mobileToastUntil) {
            UI.toast.hidden = true;
            UI.toast.style.display = "none";
            UI.toast.innerHTML = "";
          }
        }, 1400);
      } catch (_) {}
    }

    function loadProfile(profileId) {
      activeProfileId = String(profileId || "").trim() || makeDefaultProfileId();
      try {
        localStorage.setItem(PROFILE_KEY, activeProfileId);
        const raw = localStorage.getItem(SAVE_KEY_PREFIX + activeProfileId);
        if (raw) applySaveData(JSON.parse(raw));
        else persistGame(true);
      } catch (_) {}
    }

    function openStartupOverlay() {
      let overlay = document.getElementById('startup_overlay');
      if (overlay) overlay.remove();
      overlay = document.createElement('div');
      overlay.id = 'startup_overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.68);backdrop-filter:blur(6px)';
      const savedId = (() => { try { return localStorage.getItem(PROFILE_KEY) || ''; } catch (_) { return ''; } })();
      overlay.innerHTML = `
        <div style="width:min(92vw,420px);padding:22px 20px;border-radius:24px;background:linear-gradient(180deg,rgba(15,23,42,.98),rgba(30,41,59,.95));border:1px solid rgba(148,163,184,.18);box-shadow:0 24px 60px rgba(0,0,0,.38);color:#f8fafc;font:700 14px system-ui">
          <div style="font:1000 24px system-ui;margin-bottom:8px">FA WORLD SAVE</div>
          <div style="color:rgba(226,232,240,.74);margin-bottom:14px">Start load is saved history.</div>
          <input id="startup_profile_id" placeholder="Enter Unique ID" value="${savedId}" style="width:100%;box-sizing:border-box;padding:14px 16px;border-radius:14px;border:1px solid rgba(148,163,184,.22);background:rgba(2,6,23,.75);color:#fff;font:900 14px system-ui;outline:none" />
          <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
            <button id="startup_begin_btn" style="flex:1;min-width:120px;border:none;border-radius:14px;padding:13px 14px;background:linear-gradient(180deg,#38bdf8,#2563eb);color:#fff;font:1000 14px system-ui;cursor:pointer">START / LOAD</button>
            <button id="startup_new_btn" style="flex:1;min-width:120px;border:none;border-radius:14px;padding:13px 14px;background:linear-gradient(180deg,#334155,#0f172a);color:#fff;font:1000 14px system-ui;cursor:pointer">NEW ID</button>
          </div>
          <div style="margin-top:10px;color:rgba(226,232,240,.6);font:800 12px system-ui">Left top manual save.</div>
        </div>`;
      document.body.appendChild(overlay);
      const input = overlay.querySelector('#startup_profile_id');
      const start = () => {
        const id = String(input.value || '').trim() || makeDefaultProfileId();
        input.value = id;
        loadProfile(id);
        try { renderPanels(); } catch (_) {}
        startupOverlayOpen = false;
        overlay.remove();
      };
      overlay.querySelector('#startup_begin_btn').onclick = start;
      overlay.querySelector('#startup_new_btn').onclick = () => {
        input.value = makeDefaultProfileId();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') start();
      });
    }

    function rarityStyle(price = 0) {
      if (price >= 850) return { tier: "mythic", label: "MYTHIC", glow: "#ff4d6d", color: "#ff1744", flame: "rgba(255,63,94,0.95)", horn: 3 };
      if (price >= 600) return { tier: "legend", label: "LEGEND", glow: "#ffb000", color: "#ffd54a", flame: "rgba(255,176,0,0.95)", horn: 2 };
      if (price >= 360) return { tier: "epic", label: "EPIC", glow: "#a855f7", color: "#c084fc", flame: "rgba(192,132,252,0.92)", horn: 2 };
      if (price >= 180) return { tier: "rare", label: "RARE", glow: "#22d3ee", color: "#38bdf8", flame: "rgba(56,189,248,0.90)", horn: 1 };
      return { tier: "common", label: "COMMON", glow: "#94a3b8", color: "#94a3b8", flame: "rgba(148,163,184,0.72)", horn: 0 };
    }

    function buildBlacksmithCatalog() {
      const defs = {
        weapon: {
          icon: "sword",
          names: ["Iron Saber","Blaze Edge","Moon Fang","Storm Carver","Obsidian Saber","Celestial Reaver","Nova Longblade","Rune Splitter","Void Cleaver","Meteor Fang","Astra Fang","Frost Shard","Inferno Blade"],
          desc: "Boosts attack"
        },
        shield: {
          icon: "shield",
          names: ["Tower Ward","Aegis Crest","Void Bulwark","Moon Bastion","Titan Guard","Solar Guard","Echo Barrier","Rune Shelter","Azure Ward","Crimson Bastion","Mythril Wall","Onyx Guard"],
          desc: "Boosts defense"
        },
        hat: {
          icon: "helm",
          names: ["Pilot Helm","Knight Visor","Gundam Crest","Shadow Crown","Nova Helm","Dread Visor","Aether Mask","Steel Horn","Black Flame Helm","Arc Reactor Helm","Nebula Crown","Dragon Crest"],
          desc: "Helm gear"
        },
        armor: {
          icon: "armor",
          names: ["Field Armor","Titan Plate","Nebula Armor","Gundam Frame","Nightguard Suit","Astra Plate","Infernal Mail","Void Shell","Phantom Armor","Guardian Frame","Royal Plate","Mythic Suit","Steel Jacket"],
          desc: "Armor gear"
        }
      };
      const prices = [30,45,60,75,90,110,130,150,180,210,240,270,300,340,380,420,460,500,560,620,700,780,860,940,1000];
      const used = new Set(inventoryState.items.map((it) => it.id));
      let seed = 0;
      const order = ["weapon","shield","hat","armor"];
      for (const slot of order) {
        const names = defs[slot].names;
        for (let i = 0; i < 13; i++) {
          const base = names[i % names.length];
          const price = prices[(seed * 7 + i * 3) % prices.length];
          const rare = rarityStyle(price);
          const id = `${slot}_${base.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${i}`;
          if (used.has(id)) continue;
          const power = Math.max(2, Math.round(price / 35));
          inventoryState.items.push({
            id,
            slot,
            name: base,
            desc: defs[slot].desc,
            color: rare.color,
            glow: rare.glow,
            owned: false,
            icon: defs[slot].icon,
            price,
            tier: rare.tier,
            rarityLabel: rare.label,
            atk: slot === "weapon" ? power : 0,
            def: slot !== "weapon" ? Math.max(1, Math.round(power * 0.82)) : 0
          });
          used.add(id);
        }
        seed++;
      }
    }
    buildBlacksmithCatalog();

    function getItemById(id) {
      return inventoryState.items.find((it) => it.id === id) || null;
    }

    function getEnhanceLevel(slot) {
      return inventoryState.enhance?.[slot] || 0;
    }

    function statLine(item) {
      if (!item) return "";
      const parts = [];
      const plus = getEnhanceLevel(item.slot);
      if (item.atk) parts.push(`ATK +${item.atk + plus * 2}` + (plus ? `  (+${plus})` : ""));
      if (item.def) parts.push(`DEF +${item.def + plus * 2}` + (plus ? `  (+${plus})` : ""));
      return parts.join(" · ");
    }

    function playerAttackPower() {
      const weapon = getItemById(inventoryState.equipped.weapon);
      const plus = getEnhanceLevel("weapon");
      return 1 + (weapon?.atk || 6) + plus * 2;
    }

    function spawnDamageText(x, y, text, color = "#ffffff", scale = 1) {
      combatState.damageTexts.push({ x, y, text, color, life: 0.9, vy: -24, scale });
    }

    const shopState = { open: false, filter: "all" };

    function closeShop() {
      shopState.open = false;
      UI.shopModal.style.display = "none";
      UI.shopTitle.innerHTML = "";
      UI.shopBody.innerHTML = "";
      UI.shopHint.innerHTML = "";
    }

    function ownedCountBySlot(slot) {
      return inventoryState.items.filter((it) => it.slot === slot && it.owned).length;
    }

    function purchaseItem(itemId) {
      const item = getItemById(itemId);
      if (!item || item.owned) return;
      if (combatState.stars < item.price) {
        UI.toast.hidden = false;
        UI.toast.innerHTML = blockSpan(`⭐ Not enough stars.<br/><b>${item.price}</b> STAR 필요`, { bg: "rgba(15,23,42,0.92)", fg: "#f8fafc", pad: "12px 16px", radius: "16px" });
        setTimeout(() => { if (!modalState.open && !shopState.open && performance.now() >= mobileToastUntil) { UI.toast.hidden = true; UI.toast.style.display = "none"; } }, 1200);
        return;
      }
      combatState.stars -= item.price;
      item.owned = true;
      inventoryState.equipped[item.slot] = item.id;
      player.gearFlashT = 0.8;
      renderPanels();
      renderShop();
    }

    function enhanceCost(slot) {
      const lv = getEnhanceLevel(slot);
      return 120 + lv * 80;
    }

    function tryEnhance(slot = "weapon") {
      const item = getItemById(inventoryState.equipped[slot]);
      if (!item) return;
      const lv = getEnhanceLevel(slot);
      if (lv >= 10) {
        UI.toast.hidden = false;
        UI.toast.style.display = "block";
        UI.toast.innerHTML = blockSpan(`✨ <b>${item.name}</b> is already <b>+10</b> `, { bg: "rgba(15,23,42,0.92)", fg: "#f8fafc", pad: "12px 16px", radius: "16px" });
        return;
      }
      const cost = enhanceCost(slot);
      if (combatState.stars < cost) {
        UI.toast.hidden = false;
        UI.toast.style.display = "block";
        UI.toast.innerHTML = blockSpan(`⭐ Not enough upgrade stars<br/><b>${cost}</b> STAR 필요`, { bg: "rgba(15,23,42,0.92)", fg: "#f8fafc", pad: "12px 16px", radius: "16px" });
        return;
      }
      combatState.stars -= cost;
      const successRate = Math.max(0.45, 0.92 - lv * 0.05);
      if (Math.random() <= successRate) {
        inventoryState.enhance[slot] = lv + 1;
        player.gearFlashT = 0.9;
        UI.toast.hidden = false;
        UI.toast.style.display = "block";
        UI.toast.innerHTML = blockSpan(`✨ <b>${item.name}</b> Upgrade Success <b>+${lv + 1}</b>`, { bg: "rgba(15,23,42,0.94)", fg: "#f8fafc", pad: "12px 16px", radius: "16px" });
      } else {
        UI.toast.hidden = false;
        UI.toast.style.display = "block";
        UI.toast.innerHTML = blockSpan(`💥 <b>${item.name}</b> Upgrade Failed`, { bg: "rgba(15,23,42,0.94)", fg: "#f8fafc", pad: "12px 16px", radius: "16px" });
      }
      renderPanels();
      if (shopState.open) renderShop(shopState.filter || "all");
    }

    function renderShop(filter = shopState.filter || "all") {
      shopState.filter = filter;
      shopState.open = true;
      UI.shopModal.style.display = "flex";
      const filters = [
        { key: "all", label: "ALL" },
        { key: "weapon", label: "WEAPON" },
        { key: "shield", label: "SHIELD" },
        { key: "hat", label: "HELM" },
        { key: "armor", label: "ARMOR" }
      ];
      const items = inventoryState.items.filter((it) => !it.owned && (filter === "all" || it.slot === filter)).sort((a,b) => a.price - b.price);
      UI.shopTitle.innerHTML = `
        <div class="shop-head">
          <div>
            <div style="font:1000 22px system-ui;color:#f8fafc">⚒ BLACKSMITH</div>
            <div style="font:800 12px system-ui;color:rgba(226,232,240,0.70);margin-top:4px">GO IN하시겠습니까? → Shop Open. WEAPON / SHIELD / HELM / ARMOR BUY.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <div style="padding:10px 12px;border-radius:999px;background:linear-gradient(180deg,rgba(245,158,11,0.22),rgba(251,191,36,0.10));border:1px solid rgba(251,191,36,0.25);font:1000 14px system-ui;color:#fde68a">★ ${combatState.stars} STAR</div>
            <button id="shop_close_btn" style="border:none;border-radius:12px;padding:10px 12px;background:linear-gradient(180deg,#334155,#0f172a);color:#fff;font:900 12px system-ui;cursor:pointer">CLOSE</button>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${filters.map((f) => `<button class="shop_filter_btn" data-filter="${f.key}" style="border:none;border-radius:999px;padding:9px 12px;cursor:pointer;background:${filter===f.key ? "linear-gradient(180deg,#38bdf8,#2563eb)" : "linear-gradient(180deg,#1e293b,#0f172a)"};color:#fff;font:900 11px system-ui">${f.label}</button>`).join("")}<div style="margin-left:auto;padding:9px 12px;border-radius:999px;background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.22);color:#fde68a;font:900 11px system-ui">Upgrade in Equip</div></div>
      `;
      if (!items.length) {
        UI.shopBody.innerHTML = `<div style="margin-top:18px;padding:24px;border-radius:20px;background:linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92));border:1px solid rgba(148,163,184,0.18);font:900 14px system-ui;color:rgba(226,232,240,0.82)">All items purchased.</div>`;
      } else {
        UI.shopBody.innerHTML = `<div class="shop-grid">${items.map((item) => {
          const disabled = combatState.stars < item.price ? "disabled" : "";
          const rare = rarityStyle(item.price);
          return `
            <div class="shop-item" style="box-shadow:0 18px 38px rgba(2,6,23,0.32), 0 0 24px ${rare.glow}30, inset 0 1px 0 rgba(255,255,255,0.06)">
              ${iconMarkup(item)}
              <div class="meta">
                <span class="rarity-chip" style="color:${rare.color};background:${rare.glow}18;box-shadow:0 0 18px ${rare.glow}22">${rare.label}</span>
                <b>${item.name}</b>
                <span>${item.desc}</span>
                <span style="color:${rare.color};font-weight:900">${statLine(item)}</span>
                <div class="price">★ ${item.price}</div>
              </div>
              <button data-buy="${item.id}" ${disabled}>BUY</button>
            </div>
          `;
        }).join("")}</div>`;
      }
      UI.shopHint.innerHTML = `<div style="margin-top:14px;font:800 12px system-ui;color:rgba(226,232,240,0.64)">CLOSE: outside tap / ESC</div>`;

      const closeBtn = document.getElementById("shop_close_btn");
      if (closeBtn) closeBtn.onclick = () => closeShop();
      document.querySelectorAll(".shop_filter_btn").forEach((btn) => {
        btn.onclick = () => renderShop(btn.dataset.filter || "all");
      });
      document.querySelectorAll("[data-buy]").forEach((btn) => {
        btn.onclick = () => purchaseItem(btn.getAttribute("data-buy"));
      });
    }


    function toggleInventory(force) {
      inventoryState.inventoryOpen = typeof force === "boolean" ? force : !inventoryState.inventoryOpen;
      if (inventoryState.inventoryOpen) inventoryState.equipmentOpen = false;
      renderPanels();
    }
    function toggleEquipment(force) {
      inventoryState.equipmentOpen = typeof force === "boolean" ? force : !inventoryState.equipmentOpen;
      if (inventoryState.equipmentOpen) inventoryState.inventoryOpen = false;
      renderPanels();
    }

    function equipItem(itemId) {
      const item = getItemById(itemId);
      if (!item) return;
      const cur = inventoryState.equipped[item.slot];
      inventoryState.equipped[item.slot] = cur === item.id ? null : item.id;
      player.gearFlashT = 0.65;
      renderPanels();
    }

    function iconMarkup(item, equipped = false) {
      const mode = item?.icon || item?.slot || "item";
      const rare = rarityStyle(item?.price || 0);
      const t = performance.now() / 1000;
      const glow = item?.glow || item?.color || rare.glow || "rgba(148,163,184,0.45)";
      const metallic = `linear-gradient(180deg, ${shade(rare.color, 58)} 0%, ${shade(rare.color, 22)} 24%, ${shade(rare.color, -18)} 58%, #020617 100%)`;
      let bg = `radial-gradient(circle at 50% 18%, ${shade(rare.color, 42)}, #020617 78%)`;
      let shape = "";
      let rim = `box-shadow:inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -10px 20px rgba(0,0,0,0.26), 0 0 28px ${glow}88, 0 10px 22px rgba(2,6,23,0.34)`;
      const shine = `<div style="position:absolute;left:8px;right:8px;top:6px;height:12px;border-radius:999px;background:linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0));filter:blur(0.3px)"></div>`;
      if (mode === "helm") {
        bg = `radial-gradient(circle at 50% 20%, ${shade(rare.color, 28)}, #020617 80%)`;
        shape = `
          <div style="position:absolute;left:10px;right:10px;top:8px;height:22px;border-radius:15px 15px 10px 10px;background:${metallic};border:1px solid rgba(255,255,255,0.18)"></div>
          <div style="position:absolute;left:14px;right:14px;top:15px;height:9px;border-radius:10px;background:linear-gradient(90deg,transparent,rgba(96,165,250,0.95),transparent);box-shadow:0 0 10px rgba(96,165,250,0.8)"></div>
          <div style="position:absolute;left:19px;right:19px;top:24px;height:12px;border-radius:0 0 12px 12px;background:linear-gradient(180deg,#0f172a,#374151)"></div>
          <div style="position:absolute;left:27px;top:5px;width:10px;height:10px;transform:rotate(45deg);background:${rare.color};box-shadow:0 0 14px ${glow}"></div>
          <div style="position:absolute;left:8px;top:9px;width:8px;height:18px;border-radius:8px;background:linear-gradient(180deg,#111827,#020617)"></div>
          <div style="position:absolute;right:8px;top:9px;width:8px;height:18px;border-radius:8px;background:linear-gradient(180deg,#111827,#020617)"></div>
          ${shine}`;
      } else if (mode === "armor") {
        bg = `radial-gradient(circle at 50% 22%, ${shade(rare.color, 20)}, #020617 78%)`;
        shape = `
          <div style="position:absolute;left:11px;right:11px;top:8px;height:31px;border-radius:12px;background:${metallic};border:1px solid rgba(255,255,255,0.16)"></div>
          <div style="position:absolute;left:17px;right:17px;top:12px;height:8px;border-radius:8px;background:linear-gradient(90deg,transparent,${rare.color},transparent);box-shadow:0 0 10px ${glow}"></div>
          <div style="position:absolute;left:20px;right:20px;top:20px;height:14px;border-radius:8px;background:rgba(255,255,255,0.08)"></div>
          <div style="position:absolute;left:7px;top:12px;width:11px;height:12px;border-radius:6px;background:linear-gradient(180deg,#0f172a,#334155)"></div>
          <div style="position:absolute;right:7px;top:12px;width:11px;height:12px;border-radius:6px;background:linear-gradient(180deg,#0f172a,#334155)"></div>
          <div style="position:absolute;left:27px;top:6px;width:8px;height:8px;transform:rotate(45deg);background:${rare.color};box-shadow:0 0 12px ${glow}"></div>
          ${shine}`;
      } else if (mode === "sword") {
        bg = `radial-gradient(circle at 50% 18%, ${shade(rare.color, 18)}, #020617 80%)`;
        shape = `
          <div style="position:absolute;left:27px;top:6px;width:6px;height:31px;border-radius:4px;background:linear-gradient(180deg,#ffffff,#e2e8f0 28%,#cbd5e1 52%,#94a3b8 84%,#334155 100%);transform:rotate(32deg);box-shadow:0 0 12px rgba(255,255,255,0.52),0 0 24px ${glow}"></div>
          <div style="position:absolute;left:18px;top:30px;width:22px;height:5px;border-radius:6px;background:linear-gradient(90deg,${shade(rare.color,-18)},${rare.color},${shade(rare.color,-18)});transform:rotate(32deg);box-shadow:0 0 10px ${glow}"></div>
          <div style="position:absolute;left:16px;top:36px;width:8px;height:13px;border-radius:4px;background:linear-gradient(180deg,#7f1d1d,#1f2937);transform:rotate(32deg)"></div>
          <div style="position:absolute;left:13px;top:10px;width:14px;height:3px;background:rgba(255,255,255,0.95);transform:rotate(-25deg);filter:blur(0.3px)"></div>
          <div style="position:absolute;left:30px;top:8px;width:3px;height:20px;background:rgba(255,255,255,0.55);transform:rotate(32deg)"></div>
          <div style="position:absolute;left:33px;top:2px;width:6px;height:6px;border-radius:999px;background:#fff;box-shadow:0 0 16px ${glow},0 0 26px rgba(255,255,255,0.8)"></div>`;
      } else if (mode === "shield") {
        bg = `radial-gradient(circle at 50% 20%, ${shade(rare.color, 24)}, #020617 78%)`;
        shape = `
          <div style="position:absolute;left:12px;right:12px;top:8px;bottom:10px;background:${metallic};clip-path:polygon(50% 0%, 92% 18%, 86% 72%, 50% 100%, 14% 72%, 8% 18%);border:1px solid rgba(255,255,255,0.16);box-shadow:0 0 12px ${glow}55 inset"></div>
          <div style="position:absolute;left:17px;right:17px;top:15px;height:6px;border-radius:6px;background:${rare.color};box-shadow:0 0 10px ${glow}"></div>
          <div style="position:absolute;left:24px;top:18px;width:4px;height:18px;border-radius:4px;background:#ffffff"></div>
          <div style="position:absolute;left:18px;top:24px;width:16px;height:4px;border-radius:4px;background:#0f172a"></div>
          <div style="position:absolute;left:22px;top:12px;width:8px;height:8px;border-radius:999px;background:rgba(255,255,255,0.85);box-shadow:0 0 12px ${glow}"></div>`;
      }
      const stars = Math.max(1, Math.min(5, Math.ceil((item?.price || 1) / 220)));
      const gems = Array.from({ length: stars }).map((_, i) => `<div style="position:absolute;bottom:5px;left:${8 + i * 10}px;width:6px;height:6px;border-radius:999px;background:${rare.color};box-shadow:0 0 12px ${glow}"></div>`).join("");
      const sparks = Array.from({ length: Math.max(3, stars + 1) }).map((_, i) => {
        const px = 8 + ((i * 13) % 36);
        const py = 8 + ((i * 11) % 32);
        const size = i % 2 ? 3 : 2;
        return `<div style="position:absolute;left:${px}px;top:${py}px;width:${size}px;height:${size}px;border-radius:999px;background:rgba(255,255,255,0.95);box-shadow:0 0 10px ${glow},0 0 18px ${glow};opacity:${0.45 + i * 0.08}"></div>`;
      }).join("");
      const activeRing = equipped ? `0 0 0 2px ${rare.color}, 0 0 28px ${glow}, 0 0 52px ${glow}66` : `0 0 0 1px rgba(255,255,255,0.08)`;
      const auraCols = [rare.flame || glow, glow, "rgba(255,255,255,0.95)"];
      const flameFx = Array.from({ length: Math.max(3, stars) }).map((_, i) => {
        const left = 6 + i * 11;
        const h = 12 + (i % 3) * 6;
        const col = auraCols[i % auraCols.length];
        return `<div style="position:absolute;left:${left}px;bottom:${2 + (i%2)*3}px;width:10px;height:${h}px;filter:blur(2px);background:linear-gradient(180deg, rgba(255,255,255,0.0), ${col});clip-path:polygon(50% 0%, 75% 28%, 100% 100%, 0% 100%, 24% 28%)"></div>`;
      }).join("");
      return `<div class="item-icon${equipped ? " active" : ""}" style="background:${bg};box-shadow:${activeRing}, ${rim};overflow:hidden"><div style="position:absolute;inset:-10%;background:radial-gradient(circle at 22% 18%, rgba(255,255,255,0.22), transparent 34%), radial-gradient(circle at 80% 78%, ${glow}22, transparent 28%), radial-gradient(circle at 50% 50%, ${glow}20, transparent 56%)"></div>${flameFx}${shape}${gems}${sparks}</div>`;
    }

    function renderPanels() {
      UI.inventoryPanel.style.display = inventoryState.inventoryOpen ? "block" : "none";
      UI.equipmentPanel.style.display = inventoryState.equipmentOpen ? "block" : "none";
      UI.inventoryPanel.style.background = "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(15,23,42,0.88))";
      UI.inventoryPanel.style.border = "1px solid rgba(148,163,184,0.18)";
      UI.inventoryPanel.style.maxHeight = "74vh";
      UI.inventoryPanel.style.overflowY = "auto";
      UI.equipmentPanel.style.background = "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(15,23,42,0.88))";
      UI.equipmentPanel.style.border = "1px solid rgba(148,163,184,0.18)";

      const inv = inventoryState.items.filter((it) => it.owned);
      UI.inventoryPanel.innerHTML = `
        <div class="panel-title">
          <b style="color:#f8fafc">INVENTORY</b>
          <span style="color:rgba(226,232,240,0.65)">I key</span>
        </div>
        <div style="margin-top:8px;margin-bottom:12px;padding:10px 12px;border-radius:12px;background:linear-gradient(180deg,rgba(245,158,11,0.22),rgba(251,191,36,0.10));border:1px solid rgba(251,191,36,0.25);color:#fde68a;font:900 13px system-ui;display:flex;justify-content:space-between;align-items:center;">
          <span>STAR</span><span style="font-size:16px">★ ${combatState.stars}</span>
        </div>
      `;

      const grid = document.createElement("div");
      grid.className = "grid-wrap";
      inv.forEach((item) => {
        const slot = document.createElement("div");
        slot.className = "grid-slot" + (inventoryState.equipped[item.slot] === item.id ? " active" : "");
        slot.innerHTML = `${iconMarkup(item, inventoryState.equipped[item.slot] === item.id)}<div class="mini-label">${item.name}</div>`;
        grid.appendChild(slot);
      });
      for (let i = inv.length; i < 12; i++) {
        const slot = document.createElement("div");
        slot.className = "grid-slot";
        grid.appendChild(slot);
      }
      UI.inventoryPanel.appendChild(grid);

      inv.forEach((item) => {
        const row = document.createElement("div");
        row.className = "slot-card";
        const equipped = inventoryState.equipped[item.slot] === item.id;
        row.innerHTML = `
          ${iconMarkup(item, equipped)}
          <div class="meta">
            <b>${item.name}</b>
            <span>${item.desc} · ${statLine(item)} · ${equipped ? "EQUIP" : "INVEN토리 보관"}</span>
          </div>
        `;
        const btn = document.createElement("button");
        btn.textContent = equipped ? "OFF" : "EQUIP";
        btn.addEventListener("click", () => equipItem(item.id));
        row.appendChild(btn);
        UI.inventoryPanel.appendChild(row);
      });

      UI.equipmentPanel.innerHTML = `
        <div class="panel-title">
          <b style="color:#f8fafc">EQUIPMENT</b>
          <span style="color:rgba(226,232,240,0.65)">Tab 키 · gear Upgrade Ready</span>
        </div>
      `;
      [["hat","헬멧"],["armor","ARMOR"],["weapon","WEAPON"],["shield","SHIELD"]].forEach(([slot, label]) => {
        const row = document.createElement("div");
        row.className = "slot-card";
        const itemId = inventoryState.equipped[slot];
        const item = itemId ? getItemById(itemId) : null;
        row.innerHTML = `
          ${item ? iconMarkup(item, true) : '<div class="item-icon" style="background:linear-gradient(180deg,#1e293b,#0f172a)"></div>'}
          <div class="meta">
            <b>${label}</b>
            <span>${item ? `${item.name} (${statLine(item)})` : "비어 있음"}</span>
          </div>
        `;
        const actionWrap = document.createElement("div");
        actionWrap.style.display = "flex";
        actionWrap.style.gap = "8px";
        actionWrap.style.alignItems = "center";
        const btn = document.createElement("button");
        btn.textContent = item ? "UNEQUIP" : "없음";
        btn.disabled = !item;
        btn.style.opacity = item ? "1" : "0.45";
        if (item) btn.addEventListener("click", () => equipItem(item.id));
        actionWrap.appendChild(btn);
        if (item) {
          const enhanceBtn = document.createElement("button");
          const plus = getEnhanceLevel(slot);
          enhanceBtn.textContent = plus >= 10 ? `+10 MAX` : `UPGRADE +${plus}`;
          enhanceBtn.style.background = plus >= 10 ? "linear-gradient(180deg,#475569,#1e293b)" : "linear-gradient(180deg,#f59e0b,#ea580c)";
          enhanceBtn.style.minWidth = "86px";
          enhanceBtn.title = plus >= 10 ? "최대 UPGRADE MAX" : `${enhanceCost(slot)} STAR 소모`;
          if (plus >= 10) {
            enhanceBtn.disabled = true;
            enhanceBtn.style.opacity = "0.72";
          } else {
            enhanceBtn.addEventListener("click", () => tryEnhance(slot));
          }
          actionWrap.appendChild(enhanceBtn);
        }
        row.appendChild(actionWrap);
        UI.equipmentPanel.appendChild(row);
      });
    }
    UI.invBtn.addEventListener("click", () => toggleInventory());
    UI.eqBtn.addEventListener("click", () => toggleEquipment());
    UI.saveBtn.addEventListener("click", () => saveNowToast());
    UI.desktopSaveBtn.addEventListener("click", () => saveNowToast());
    UI.fireBtn.addEventListener("click", () => triggerFireball());
    UI.hasteBtn.addEventListener("click", () => triggerHaste());
    [UI.fireBtn, UI.hasteBtn].forEach((btn, idx) => {
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); idx===0 ? triggerFireball() : triggerHaste(); }, { passive: false });
      btn.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); idx===0 ? triggerFireball() : triggerHaste(); }, { passive: false });
    });
    UI.desktopFireBtn.addEventListener("click", () => triggerFireball());
    UI.desktopHasteBtn.addEventListener("click", () => triggerHaste());
    function onMobilePortalAction() {
      if (!activePortal) return;
      if (activePortal.key === "blacksmith") {
        closeModal();
        renderShop("all");
        return;
      }
      if (activePortal.status === "open" && activePortal.url) {
        closeModal();
        UI.toast.hidden = true;
        UI.toast.style.display = "none";
        UI.toast.innerHTML = "";
        if (UI.enterBtn) UI.enterBtn.style.display = "none";
        entering = false;
        try {
          window.location.assign(activePortal.url);
        } catch (_) {
          window.location.href = activePortal.url;
        }
        return;
      }
      closeModal();
      if (UI.enterBtn) {
        UI.enterBtn.style.display = "none";
        UI.enterBtn.disabled = true;
      }
      mobileToastUntil = performance.now() + 1850;
      UI.toast.hidden = false;
      UI.toast.style.display = "block";
      UI.toast.innerHTML = blockSpan(
        `🧱 <b>${activePortal.label}</b><br/>${activePortal.message || "COMING SOON"}`,
        { bg: "linear-gradient(180deg, rgba(10,14,24,0.96), rgba(18,25,40,0.94))", fg:"#f8fafc", bd:"rgba(148,163,184,0.16)", shadow:"0 14px 36px rgba(0,0,0,0.24)" }
      );
      setTimeout(() => {
        if (!modalState.open && !shopState.open && performance.now() >= mobileToastUntil) {
          UI.toast.hidden = true;
          UI.toast.style.display = "none";
          UI.toast.innerHTML = "";
        }
      }, 1850);
    }
    UI.enterBtn.addEventListener("click", onMobilePortalAction);
    renderPanels();

    /* ----------------------- Input ----------------------- */
    const keys = new Set();
    let dragging = false;
    let dragOffset = { x: 0, y: 0 };

    function getPointer(e) {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / VIEW.zoom, y: (e.clientY - r.top) / VIEW.zoom };
    }

    function clampPlayerToWorld() {
      player.x = clamp(player.x, WORLD.margin, WORLD.w - WORLD.margin);
      player.y = clamp(player.y, Math.max(WORLD.margin, ART_BOUNDS.skyLineY + 40), WORLD.h - WORLD.margin);
    }

    function updateDirFromDelta(dx, dy) {
      if (Math.abs(dx) > Math.abs(dy)) player.dir = dx >= 0 ? "right" : "left";
      else if (Math.abs(dy) > 0.001) player.dir = dy >= 0 ? "down" : "up";
    }

    function triggerAttack() {
      if (combatState.attackT <= 0) {
        combatState.attackT = 0.28;
        player.gearFlashT = 0.25;
      }
    }

    function getAttackAnchor() {
      if (player.dir === "left") return { x: player.x - 18, y: player.y - 3, vx: -1, vy: -0.12 };
      if (player.dir === "up") return { x: player.x + 8, y: player.y - 24, vx: 0.18, vy: -1 };
      if (player.dir === "down") return { x: player.x + 10, y: player.y + 4, vx: 0.16, vy: 1 };
      return { x: player.x + 18, y: player.y - 3, vx: 1, vy: -0.12 };
    }

    function applyMonsterHit(m, damage, crit = false) {
      m.hp -= damage;
      m.hitFlash = Math.max(m.hitFlash || 0, 0.8);
      spawnDamageText(m.x, m.y - (m.scale ? m.scale * 1.6 : 18), `${crit ? "CRIT " : ""}-${damage}`, crit ? "#facc15" : "#fca5a5", crit ? 1.28 : 1.1);
      if (m.hp <= 0) {
        m.dead = true;
        m.respawn = m.key === "slime" ? 7 : 18;
        const reward = m.reward || 1;
        combatState.stars += reward;
        spawnDamageText(m.x, m.y - (m.scale ? m.scale * 1.9 : 30), `+${reward} STAR`, "#fde68a", 1.0);
        renderPanels();
      }
    }

    function triggerFireball() {
      const now = performance.now();
      if (combatState.fireballCd > now) return;
      const anchor = getAttackAnchor();
      const base = playerAttackPower();
      const targets = [...combatState.slimes, ...combatState.titans].filter((m) => !m.dead);
      let target = null;
      let best = Infinity;
      for (const m of targets) {
        const d = Math.hypot(m.x - player.x, m.y - player.y);
        if (d < best) { best = d; target = m; }
      }
      const aimX = target ? target.x - anchor.x : anchor.vx * 120 + anchor.x;
      const aimY = target ? target.y - anchor.y : anchor.vy * 120 + anchor.y;
      const len = Math.hypot(aimX, aimY) || 1;
      combatState.fireballCd = now + 3000;
      combatState.fireballs.push({
        x: anchor.x, y: anchor.y, vx: (aimX / len) * 520, vy: (aimY / len) * 520,
        life: 1.4, radius: 14, damage: Math.max(2, Math.round(base * 2)), burn: 2.8, targetId: target ? target.id : null
      });
      player.gearFlashT = 0.35;
    }

    function triggerHaste() {
      const now = performance.now();
      if (combatState.hasteCd > now) return;
      combatState.hasteCd = now + 12000;
      combatState.hasteUntil = now + 5000;
      player.gearFlashT = 0.45;
      spawnDamageText(player.x, player.y - 42, "SPEED UP", "#86efac", 1.0);
    }

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "tab") {
        e.preventDefault();
        toggleEquipment();
        return;
      }
      if (k === "i") {
        e.preventDefault();
        toggleInventory();
        return;
      }
      keys.add(k);
      if (k === " ") {
        e.preventDefault();
        triggerAttack();
      }
      if (k === "q") {
        e.preventDefault();
        triggerFireball();
      }
      if (k === "r") {
        e.preventDefault();
        triggerHaste();
      }
      if (k === "enter" || k === "e") {
        const portalTarget = activePortal || getNearestPortalCandidate(isTouchDevice() ? 240 : 260);
        if (modalState.open && modalState.portal) {
          confirmEnter(modalState.portal);
        } else if (portalTarget) {
          activePortal = portalTarget;
          openPortalUI(portalTarget);
        }
      }
      if (k === "escape") {
        closeModal();
        closeShop();
        toggleInventory(false);
        toggleEquipment(false);
      }
    });

    window.addEventListener("keyup", (e) => {
      keys.delete(e.key.toLowerCase());
    });
    function resetPortalResumeState() {
      entering = false;
      closeModal();
      if (!shopState.open) {
        UI.toast.hidden = true;
        UI.toast.style.display = "none";
        UI.toast.innerHTML = "";
      }
      keys.clear();
      player.moving = false;
      portalSuppressUntil = performance.now() + 900;
    }

    window.addEventListener("pageshow", resetPortalResumeState);
    window.addEventListener("focus", resetPortalResumeState);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) resetPortalResumeState();
      else persistGame(true);
    });
    window.addEventListener("pagehide", () => persistGame(true));
    window.addEventListener("beforeunload", () => persistGame(true));
    setInterval(() => {
      if (activeProfileId && performance.now() - lastSavedAt > 8000) persistGame(true);
    }, 4000);


    canvas.addEventListener("pointerdown", (e) => {
      if (isTouchDevice()) return;
      const p = getPointer(e);
      const w = screenToWorld(p.x, p.y);
      const dx = w.x - player.x, dy = w.y - player.y;
      if (dx * dx + dy * dy <= (player.r + 18) * (player.r + 18)) {
        dragging = true;
        dragOffset.x = player.x - w.x;
        dragOffset.y = player.y - w.y;
        canvas.setPointerCapture(e.pointerId);
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const p = getPointer(e);
      const prev = { x: player.x, y: player.y };
      const w = screenToWorld(p.x, p.y);
      player.x = w.x + dragOffset.x;
      player.y = w.y + dragOffset.y;
      clampPlayerToWorld();
      updateDirFromDelta(player.x - prev.x, player.y - prev.y);
      player.moving = true;
      player.animT += 1 / 60;
      player.walkPhase += 1 / 60 * 11;
    });

    canvas.addEventListener("pointerup", () => {
      dragging = false;
    });

    /* ----------------------- Patterns ----------------------- */
    let grassPattern = null, dirtPattern = null, roadPattern = null, sidewalkPattern = null, brickPattern = null;

    function makePattern(w, h, drawFn) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      drawFn(g, w, h);
      return ctx.createPattern(c, "repeat");
    }

    function buildPatterns(rng) {
      grassPattern = makePattern(520, 520, (g, w, h) => {
        g.fillStyle = "#39d975";
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.045;
        g.strokeStyle = "rgba(0,0,0,0.14)";
        g.lineWidth = 1;
        for (let x = 0; x <= w; x += 86) {
          g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
        }
        for (let y = 0; y <= h; y += 86) {
          g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
        }
        g.globalAlpha = 0.12;
        for (let i = 0; i < 420; i++) {
          const rr = 0.7 + rng() * 1.8;
          g.fillStyle = i % 3 === 0 ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.10)";
          g.beginPath();
          g.arc(rng() * w, rng() * h, rr, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      });
      dirtPattern = makePattern(260, 260, (g, w, h) => {
        g.fillStyle = "#c79a64";
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.20;
        for (let i = 0; i < 360; i++) {
          const rr = 0.8 + rng() * 3.0;
                    g.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
          g.beginPath();
          g.arc(rng() * w, rng() * h, rr, 0, Math.PI * 2);
          g.fill();
        }
        g.globalAlpha = 1;
      });
      roadPattern = makePattern(260, 260, (g, w, h) => {
        g.fillStyle = "#262c37";
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.16;
        for (let i = 0; i < 2200; i++) {
          const v = (rng() * 55) | 0;
          g.fillStyle = `rgb(${40 + v},${44 + v},${52 + v})`;
          g.fillRect(rng() * w, rng() * h, 1, 1);
        }
        g.globalAlpha = 0.10;
        g.strokeStyle = "rgba(255,255,255,0.10)";
        g.lineWidth = 1;
        for (let y = 0; y <= h; y += 64) {
          g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
        }
        g.globalAlpha = 1;
      });
      sidewalkPattern = makePattern(240, 240, (g, w, h) => {
        g.fillStyle = "#f5efe7";
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.12;
        g.strokeStyle = "rgba(0,0,0,0.18)";
        g.lineWidth = 1;
        for (let x = 0; x <= w; x += 24) {
          g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
        }
        for (let y = 0; y <= h; y += 24) {
          g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
        }
        g.globalAlpha = 1;
      });
      brickPattern = makePattern(360, 360, (g, w, h) => {
        g.fillStyle = "#d9c6a3";
        g.fillRect(0, 0, w, h);
        g.globalAlpha = 0.32;
        g.strokeStyle = "rgba(60,45,30,0.34)";
        g.lineWidth = 2;
        const tileW = 60, tileH = 40;
        for (let y = 0; y <= h; y += tileH) {
          const off = ((y / tileH) | 0) % 2 ? tileW / 2 : 0;
          for (let x = -tileW; x <= w + tileW; x += tileW) {
            g.strokeRect(x + off, y, tileW, tileH);
          }
        }
        g.globalAlpha = 0.10;
        for (let i = 0; i < 1600; i++) {
          const v = (rng() * 40) | 0;
          g.fillStyle = `rgb(${210 + v},${190 + v},${155 + v})`;
          g.fillRect(rng() * w, rng() * h, 1, 1);
        }
        g.globalAlpha = 1;
      });
    }

    /* ----------------------- Shape helpers ----------------------- */
    function roundRect(x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    }

    function groundAO(x, y, w, h, alpha = 0.2) {
      ctx.save();
      const cx = x + w * 0.5;
      const cy = y + h * 0.62;
      const rx = Math.max(24, w * 0.42);
      const ry = Math.max(8, h * 0.34);
      const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.max(rx, ry) * 1.2);
      g.addColorStop(0, `rgba(10,14,24,${alpha * 0.7})`);
      g.addColorStop(1, "rgba(10,14,24,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function softShadow(x, y, w, h, alpha = 0.1) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillStyle = "rgba(10,14,24,0.55)";
      roundRect(x, y, w, h, 18);
      ctx.fill();
      ctx.restore();
    }

    function blockSpan(html, opts = {}) {
      const bg = opts.bg || "linear-gradient(180deg, rgba(10,14,24,0.96), rgba(18,25,40,0.94))";
      const fg = opts.fg || "#f8fafc";
      const bd = opts.bd || opts.border || "rgba(148,163,184,0.18)";
      const pad = opts.pad || "12px 16px";
      const radius = opts.radius || "16px";
      const shadow = opts.shadow || "0 16px 40px rgba(0,0,0,0.28)";
      return `<span style="display:inline-block;padding:${pad};border-radius:${radius};background:${bg};color:${fg};border:1px solid ${bd};box-shadow:${shadow};">${html}</span>`;
    }

    /* ----------------------- Zone / road layout ----------------------- */
    function syncArtBounds() {
      const marginX = WORLD.w * 0.06;
      const marginTop = WORLD.h * 0.04;
      const artW = WORLD.w * 0.92;
      const artH = WORLD.h * 0.88;
      ART_BOUNDS.x = marginX;
      ART_BOUNDS.y = marginTop;
      ART_BOUNDS.w = artW;
      ART_BOUNDS.h = artH;
      ART_BOUNDS.skyLineY = ART_BOUNDS.y + ART_BOUNDS.h * 0.16;
      ART_BOUNDS.village = {
        x: ART_BOUNDS.x + ART_BOUNDS.w * 0.06,
        y: ART_BOUNDS.skyLineY + ART_BOUNDS.h * 0.05,
        w: ART_BOUNDS.w * 0.92,
        h: ART_BOUNDS.h * 0.82
      };
    }

    function layoutZonesFromArt() {
      const a = ART_BOUNDS.village || { x: WORLD.w * 0.05, y: WORLD.h * 0.08, w: WORLD.w * 0.90, h: WORLD.h * 0.80 };
      const sideGap = a.w * 0.09;
      const topGap = a.h * 0.10;
      const midGap = a.h * 0.23;
      const boxW = (a.w - sideGap) * 0.5;
      const topH = a.h * 0.40;
      const adW = a.w * 0.94;
      const adH = a.h * 0.18 + 220 - (isTouchDevice() ? 70 : 0);
      ZONES = {
        game: {
          x: a.x,
          y: a.y + topGap,
          w: boxW,
          h: topH,
          label: "GAME ZONE",
          color: "#0a84ff",
          entrance: null
        },
        community: {
          x: a.x + boxW + sideGap,
          y: a.y + topGap,
          w: boxW,
          h: topH,
          label: "COMMUNITY ZONE",
          color: "#34c759",
          entrance: null
        },
        ads: {
          x: a.x + (a.w - adW) * 0.5,
          y: a.y + topGap + topH + midGap,
          w: adW,
          h: adH,
          label: "AD ZONE",
          color: "#ff2d55",
          entrance: null
        }
      };
      function setEntrance(z) {
        const gateW = 380;
        const gateH = 108;
        z.entrance = {
          x: z.x + z.w * 0.5 - gateW * 0.5,
          y: z.y + z.h - gateH * 0.35,
          w: gateW,
          h: gateH
        };
      }
      setEntrance(ZONES.game);
      setEntrance(ZONES.community);
      setEntrance(ZONES.ads);
    }

    function layoutRoadNetwork() {
      roads.length = 0;
      sidewalks.length = 0;
      crossings.length = 0;
      signals.length = 0;

      let id = 0;
      const addRoadH = (y, x0, x1, h = 118) => {
        const r = { _id: id++, axis: "h", x: x0, y, w: x1 - x0, h };
        roads.push(r);
        sidewalks.push({ x: r.x, y: r.y - 42, w: r.w, h: 30 });
        sidewalks.push({ x: r.x, y: r.y + r.h + 12, w: r.w, h: 30 });
        return r;
      };
      const addRoadV = (x, y0, y1, w = 118) => {
        const r = { _id: id++, axis: "v", x, y: y0, w, h: y1 - y0 };
        roads.push(r);
        sidewalks.push({ x: r.x - 42, y: r.y, w: 30, h: r.h });
        sidewalks.push({ x: r.x + r.w + 12, y: r.y, w: 30, h: r.h });
        return r;
      };

      const a = ART_BOUNDS.village;
      const left = a.x + a.w * 0.02;
      const right = a.x + a.w * 0.98;
      const top = a.y + a.h * 0.02;
      const bottom = a.y + a.h * 0.96;

      addRoadH(top, left, right, 122);
      addRoadH(ZONES.game.y + ZONES.game.h + 220, left, right, 126);
      addRoadH(ZONES.ads.y + ZONES.ads.h + 220, left, right, 126);

      addRoadV(ZONES.game.x + ZONES.game.w + 170, top, bottom, 120);
      addRoadV(ZONES.community.x - 290, top, bottom, 120);
      addRoadV(right - 150, top, bottom, 112);

      const Hs = roads.filter((r) => r.axis === "h");
      const Vs = roads.filter((r) => r.axis === "v");
      for (const h of Hs) {
        for (const v of Vs) {
          const inter = !(h.x + h.w < v.x || h.x > v.x + v.w || h.y + h.h < v.y || h.y > v.y + v.h);
          if (!inter) continue;
          crossings.push({ x: v.x + 8, y: h.y + h.h * 0.5 - 24, w: v.w - 16, h: 48 });
          signals.push({ x: v.x - 14, y: h.y - 18, dir: "h" });
          signals.push({ x: v.x + v.w + 14, y: h.y + h.h + 18, dir: "h" });
        }
      }
    }

    function portalSizeScale(size) {
      if (size === "L") return 1.48;
      if (size === "M") return 1.36;
      return 1.24;
    }

    function layoutPortals() {
      const touchLayout = isTouchDevice();
      const base = 430;
      for (const p of portals) {
        const m = portalSizeScale(p.size);
        p.w = base * 1.02 * m;
        p.h = base * 0.74 * m;
        if (touchLayout && p.key !== "blacksmith") {
          p.w *= 0.82;
          p.h *= 0.82;
        }
        if (p.key === "market") {
          p.w *= 1.18;
          p.h *= 1.14;
        }
        if (p.key === "lbank") {
          p.w *= 0.56;
          p.h *= 0.56;
        }
        if (p.key === "blacksmith") {
          p.w *= 0.58;
          p.h *= 0.58;
        }
      }

      function placeByRect(p, z, x, y) {
        const padX = p.key === "blacksmith" ? 70 : 84;
        const padY = p.key === "blacksmith" ? 42 : 54;
        p.x = clamp(x, z.x + padX, z.x + z.w - padX - p.w);
        p.y = clamp(y, z.y + padY, z.y + z.h - padY - p.h);
      }

      for (const p of portals) {
        if (["avoid", "shooting", "archery", "janggi", "omok"].includes(p.key)) {
          const z = ZONES.game;
          const gameLayout = touchLayout ? {
            archery: { x: z.x + 18, y: z.y + 10 },
            janggi: { x: z.x + z.w * 0.55 - p.w * 0.5, y: z.y + z.h - p.h - 10 },
            omok: { x: z.x + z.w * 0.10, y: z.y + z.h * 0.47 - p.h * 0.5 },
            avoid: { x: z.x + z.w - p.w - 8, y: z.y + z.h * 0.70 - p.h * 0.5 },
            shooting: { x: z.x + z.w - p.w - 94, y: z.y - 6 }
          } : {
            archery: { x: z.x + 52, y: z.y + 12 },
            janggi: { x: z.x + z.w * 0.40 - p.w * 0.5, y: z.y + z.h * 0.70 - p.h * 0.5 },
            omok: { x: z.x + z.w * 0.50 - p.w * 0.5, y: z.y + z.h * 0.40 - p.h * 0.5 },
            avoid: { x: z.x + z.w * 0.73 - p.w * 0.5, y: z.y + z.h * 0.60 - p.h * 0.5 },
            shooting: { x: z.x + z.w - p.w - 60, y: z.y + 18 }
          };
          placeByRect(p, z, gameLayout[p.key].x, gameLayout[p.key].y);
        } else if (p.key === "blacksmith") {
          placeByRect(p, ZONES.ads, ZONES.ads.x + ZONES.ads.w * 0.76, ZONES.ads.y - 22);
        } else {
          const z = ZONES.community;
          const leftX = z.x + 72;
          const rightX = z.x + z.w - p.w - 72;
          const topY = z.y + 38;
          const bottomY = z.y + z.h - p.h - 56;
          if (touchLayout) {
            if (p.key === "twitter") placeByRect(p, z, leftX, topY);
            else if (p.key === "wallet") placeByRect(p, z, rightX, topY + 6);
            else if (p.key === "lbank") placeByRect(p, z, rightX - p.w - 140, topY - 18);
            else if (p.key === "telegram") placeByRect(p, z, rightX + 18, bottomY + 18);
            else if (p.key === "market") placeByRect(p, z, leftX + 24, bottomY - 22);
          } else {
            if (p.key === "twitter") placeByRect(p, z, leftX, topY);
            else if (p.key === "wallet") placeByRect(p, z, rightX, topY);
            else if (p.key === "lbank") placeByRect(p, z, rightX - p.w - 150, topY - 26);
            else if (p.key === "telegram") placeByRect(p, z, leftX + 176, bottomY + 4);
            else if (p.key === "market") placeByRect(p, z, rightX - p.w - 190, topY + 20);
          }
        }
      }
    }

    function isOnRoadLike(x, y) {
      for (const r of roads) {
        if (x >= r.x - 18 && x <= r.x + r.w + 18 && y >= r.y - 18 && y <= r.y + r.h + 18) return true;
      }
      return false;
    }

    function isInsideBuildingBuffer(x, y) {
      for (const p of portals) {
        const pad = 118;
        if (x >= p.x - pad && x <= p.x + p.w + pad && y >= p.y - pad && y <= p.y + p.h + pad) return true;
      }
      return false;
    }

    function isInsideZonesBuffer(x, y) {
      const pad = 16;
      return (
        (x >= ZONES.game.x - pad && x <= ZONES.game.x + ZONES.game.w + pad && y >= ZONES.game.y - pad && y <= ZONES.game.y + ZONES.game.h + pad) ||
        (x >= ZONES.community.x - pad && x <= ZONES.community.x + ZONES.community.w + pad && y >= ZONES.community.y - pad && y <= ZONES.community.y + ZONES.community.h + pad) ||
        (x >= ZONES.ads.x - pad && x <= ZONES.ads.x + ZONES.ads.w + pad && y >= ZONES.ads.y - pad && y <= ZONES.ads.y + ZONES.ads.h + pad)
      );
    }

    function isInVillage(x, y, pad = 0) {
      const v = ART_BOUNDS.village;
      if (!v) return true;
      return x >= v.x + pad && x <= v.x + v.w - pad && y >= v.y + pad && y <= v.y + v.h - pad;
    }

    function scatterPoints(rng, count, minDist, maxTry, okFn) {
      const pts = [];
      const cell = minDist / Math.SQRT2;
      const gw = Math.ceil(WORLD.w / cell);
      const gh = Math.ceil(WORLD.h / cell);
      const grid = new Array(gw * gh).fill(-1);
      function gi(x, y) { return (x | 0) + (y | 0) * gw; }
      function nearOK(x, y) {
        const cx = (x / cell) | 0;
        const cy = (y / cell) | 0;
        for (let yy = Math.max(0, cy - 2); yy <= Math.min(gh - 1, cy + 2); yy++) {
          for (let xx = Math.max(0, cx - 2); xx <= Math.min(gw - 1, cx + 2); xx++) {
            const idx = grid[gi(xx, yy)];
            if (idx < 0) continue;
            const p = pts[idx];
            if (Math.hypot(p.x - x, p.y - y) < minDist) return false;
          }
        }
        return true;
      }
      let tries = 0;
      while (pts.length < count && tries < maxTry) {
        tries++;
        const x = WORLD.margin + rng() * (WORLD.w - WORLD.margin * 2);
        const y = Math.max(ART_BOUNDS.skyLineY + 30, WORLD.margin) + rng() * (WORLD.h - Math.max(ART_BOUNDS.skyLineY + 30, WORLD.margin) - WORLD.margin);
        if (!okFn(x, y)) continue;
        if (!nearOK(x, y)) continue;
        const cx = (x / cell) | 0;
        const cy = (y / cell) | 0;
        grid[gi(cx, cy)] = pts.length;
        pts.push({ x, y });
      }
      return pts;
    }

    function buildGroundPatches(rng) {
      groundPatches = [];
      for (let i = 0; i < 22; i++) {
        groundPatches.push({
          x: ART_BOUNDS.village.x + rng() * ART_BOUNDS.village.w,
          y: ART_BOUNDS.village.y + rng() * ART_BOUNDS.village.h,
          rx: 70 + rng() * 180,
          ry: 20 + rng() * 62,
          rot: (rng() - 0.5) * 0.7,
          a: 0.20 + rng() * 0.12
        });
      }
    }

    function seedLampsAlongRoads() {
      for (let i = props.length - 1; i >= 0; i--) if (props[i].kind === "lamp") props.splice(i, 1);
      const interval = 250;
      const offset = 80;
      for (const r of roads) {
        if (rectInAnyZone(r, 18)) continue;
        if (r.axis === "h") {
          const start = Math.ceil((r.x + 40) / interval) * interval;
          for (let x = start; x <= r.x + r.w - 40; x += interval) {
            const y1 = r.y - offset;
            const y2 = r.y + r.h + offset * 0.58;
            if (isInVillage(x, y1, 8) && !isInsideZonesBuffer(x, y1) && !isInsideBuildingBuffer(x, y1)) props.push({ kind: "lamp", x, y: y1, s: 0.98 });
            if (isInVillage(x, y2, 8) && !isInsideZonesBuffer(x, y2) && !isInsideBuildingBuffer(x, y2)) props.push({ kind: "lamp", x, y: y2, s: 0.98 });
          }
        } else {
          const start = Math.ceil((r.y + 40) / interval) * interval;
          for (let y = start; y <= r.y + r.h - 40; y += interval) {
            const x1 = r.x - offset;
            const x2 = r.x + r.w + offset * 0.58;
            if (isInVillage(x1, y, 8) && !isInsideZonesBuffer(x1, y) && !isInsideBuildingBuffer(x1, y)) props.push({ kind: "lamp", x: x1, y, s: 0.98 });
            if (isInVillage(x2, y, 8) && !isInsideZonesBuffer(x2, y) && !isInsideBuildingBuffer(x2, y)) props.push({ kind: "lamp", x: x2, y, s: 0.98 });
          }
        }
      }
    }

    function layoutAdBuildings() {
      adBuildings.length = 0;
      const items = [
        { key: "youtube", label: "YOUTUBE", color: "#e11d48", accent: "#ffffff" },
        { key: "tiktok", label: "TIKTOK", color: "#111827", accent: "#f472b6" },
        { key: "instagram", label: "INSTAGRAM", color: "#8b5cf6", accent: "#f59e0b" }
      ];
      const mobileAds = isTouchDevice();
      const startX = ZONES.ads.x + (mobileAds ? 132 : 228);
      const gap = mobileAds ? 14 : 24;
      const w = mobileAds ? 536 : 522, h = mobileAds ? 350 : 342;
      const y = ZONES.ads.y + (mobileAds ? 88 : 74);
      for (let i = 0; i < items.length; i++) {
        adBuildings.push({ ...items[i], x: startX + i * (w + gap), y, w, h });
      }
    }

    function seedProps(rng) {
      props.length = 0;
      signs.length = 0;
      portalNPCs = [];
      portalEmblems = [];
      layoutAdBuildings();

      function nearAnyEntrance(x, y, pad = 220) {
        return [ZONES.game, ZONES.community, ZONES.ads].some((z) => z.entrance && x >= z.entrance.x - pad && x <= z.entrance.x + z.entrance.w + pad && y >= z.entrance.y - pad && y <= z.entrance.y + z.entrance.h + pad);
      }
      const okNature = (x, y) =>
        isInVillage(x, y, 10) &&
        !isOnRoadLike(x, y) &&
        !isInsideBuildingBuffer(x, y) &&
        !isInsideZonesBuffer(x, y) &&
        !nearAnyEntrance(x, y);

      const treePts = scatterPoints(rng, 24, 104, 7000, okNature);
      for (const p of treePts) props.push({ kind: "tree", x: p.x, y: p.y, s: 0.82 + rng() * 1.00 });

      const flowerPts = scatterPoints(rng, 34, 64, 10000, okNature);
      for (const p of flowerPts) props.push({ kind: "flower", x: p.x, y: p.y, s: 0.85 + rng() * 0.95 });

      function okBench(x, y) {
        if (!isInVillage(x, y, 10) || isInsideBuildingBuffer(x, y) || isInsideZonesBuffer(x, y)) return false;
        let near = false;
        for (const s of sidewalks) {
          const nx = clamp(x, s.x, s.x + s.w);
          const ny = clamp(y, s.y, s.y + s.h);
          if (Math.hypot(nx - x, ny - y) < 62) { near = true; break; }
        }
        return near && !isOnRoadLike(x, y);
      }

      const benchPts = scatterPoints(rng, 8, 180, 8000, okBench);
      for (const p of benchPts) props.push({ kind: "bench", x: p.x, y: p.y, s: 0.92 + rng() * 0.30 });

      for (const p of portals) {
        props.push({ kind: "flower", x: p.x + p.w * 0.20, y: p.y + p.h + 18, s: 0.96 });
        props.push({ kind: "flower", x: p.x + p.w * 0.80, y: p.y + p.h + 14, s: 0.92 });
      }


      seedLampsAlongRoads();
    }
        /* ----------------------- Cars / roamers ----------------------- */
    const CAR_COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#0a84ff", "#af52de", "#ff2d55", "#ffffff"];

    function seedCars(rng) {
      cars.length = 0;
      const makeCar = (r, axis) => {
        const col = CAR_COLORS[(rng() * CAR_COLORS.length) | 0];
        const speed = 98 + rng() * 118;
        if (axis === "h") {
          const lane = rng() < 0.5 ? 0 : 1;
          const dir = rng() < 0.5 ? 1 : -1;
          return {
            kind: "car", axis: "h", dir, color: col, speed,
            w: 56 + rng() * 20, h: 24 + rng() * 8,
            x: r.x + rng() * r.w,
            y: r.y + (lane === 0 ? r.h * 0.36 : r.h * 0.66),
            bob: rng() * 10, roadId: r._id
          };
        }
        const lane = rng() < 0.5 ? 0 : 1;
        const dir = rng() < 0.5 ? 1 : -1;
        return {
          kind: "car", axis: "v", dir, color: col, speed,
          w: 24 + rng() * 8, h: 58 + rng() * 20,
          x: r.x + (lane === 0 ? r.w * 0.36 : r.w * 0.66),
          y: r.y + rng() * r.h,
          bob: rng() * 10, roadId: r._id
        };
      };

      for (const r of roads) {
        if (rectInAnyZone(r, 12)) continue;
        if (!isInVillage(r.x + r.w * 0.5, r.y + r.h * 0.5, 0)) continue;
        const n = r.axis === "h" ? 3 + ((rng() * 2) | 0) : 2 + ((rng() * 2) | 0);
        for (let i = 0; i < n; i++) cars.push(makeCar(r, r.axis));
      }
    }

    function seedRoamers(rng) {
      roamers.length = 0;
      const N = 4;

      function okPos(x, y) {
        if (!isInVillage(x, y, 12)) return false;
        if (isOnRoadLike(x, y)) return false;
        if (isInsideBuildingBuffer(x, y)) return false;
        if (isInsideZonesBuffer(x, y)) return false;
        return true;
      }

      for (let i = 0; i < N; i++) {
        let x = ART_BOUNDS.village.x + ART_BOUNDS.village.w * 0.5;
        let y = ART_BOUNDS.village.y + ART_BOUNDS.village.h * 0.5;
        for (let t = 0; t < 240; t++) {
          x = ART_BOUNDS.village.x + rng() * ART_BOUNDS.village.w;
          y = ART_BOUNDS.village.y + rng() * ART_BOUNDS.village.h;
          if (okPos(x, y)) break;
        }
        roamers.push({
          kind: "roamer",
          x, y,
          r: 16,
          speed: 88 + rng() * 42,
          dir: ["down", "left", "right", "up"][(rng() * 4) | 0],
          t: rng() * 10,
          tx: x, ty: y,
          colorIdx: (rng() * 6) | 0
        });
      }
    }

    function stepRoamers(dt, rng) {
      const palette = [
        { torso: "#0a84ff", pants: "#3b4251", hat: "#ff3b30" },
        { torso: "#34c759", pants: "#2a2f3b", hat: "#ffcc00" },
        { torso: "#b889ff", pants: "#3b4251", hat: "#0a84ff" },
        { torso: "#ffffff", pants: "#2a2f3b", hat: "#ff2d55" },
        { torso: "#ffd66b", pants: "#3b4251", hat: "#0a84ff" },
        { torso: "#7fd7ff", pants: "#2a2f3b", hat: "#ffcc00" }
      ];

      for (const n of roamers) {
        n.t += dt;
        if (Math.hypot(n.tx - n.x, n.ty - n.y) < 26 || rng() < 0.002) {
          let nx = n.x, ny = n.y;
          for (let k = 0; k < 64; k++) {
            nx = ART_BOUNDS.village.x + rng() * ART_BOUNDS.village.w;
            ny = ART_BOUNDS.village.y + rng() * ART_BOUNDS.village.h;
            if (!isOnRoadLike(nx, ny) && !isInsideBuildingBuffer(nx, ny) && !isInsideZonesBuffer(nx, ny)) break;
          }
          n.tx = nx;
          n.ty = ny;
        }
        const dx = n.tx - n.x, dy = n.ty - n.y;
        const len = Math.hypot(dx, dy) || 1;
        const step = Math.min(len, n.speed * dt);
        n.x += (dx / len) * step;
        n.y += (dy / len) * step;
        if (!isInVillage(n.x, n.y, 6) || isOnRoadLike(n.x, n.y)) {
          n.x = clamp(n.x, ART_BOUNDS.village.x + 6, ART_BOUNDS.village.x + ART_BOUNDS.village.w - 6);
          n.y = clamp(n.y, ART_BOUNDS.village.y + 6, ART_BOUNDS.village.y + ART_BOUNDS.village.h - 6);
          n.tx = n.x; n.ty = n.y;
        }
        if (Math.abs(dy) >= Math.abs(dx)) n.dir = dy < 0 ? "up" : "down";
        else n.dir = dx < 0 ? "left" : "right";
      }
      return palette;
    }

    /* ----------------------- Background layers ----------------------- */
    const clouds = Array.from({ length: 12 }, () => ({
      x: Math.random() * 3600, y: 40 + Math.random() * 260, s: 0.7 + Math.random() * 1.25, v: 9 + Math.random() * 18, layer: Math.random() < 0.5 ? 0 : 1
    }));
    const birds = Array.from({ length: 7 }, () => ({ x: 0, y: 0, p: Math.random() * 10, v: 22 + Math.random() * 22 }));

    /* ----------------------- Portal / modal ----------------------- */
    function portalEnterZone(p) {
      return isTouchDevice()
        ? { x: p.x + p.w * 0.10, y: p.y + p.h * 0.44, w: p.w * 0.80, h: p.h * 0.44 }
        : { x: p.x + p.w * 0.08, y: p.y + p.h * 0.42, w: p.w * 0.84, h: p.h * 0.48 };
    }

    function circleRectHit(cx, cy, cr, r) {
      const nx = clamp(cx, r.x, r.x + r.w);
      const ny = clamp(cy, r.y, r.y + r.h);
      const dx = cx - nx, dy = cy - ny;
      return dx * dx + dy * dy <= cr * cr;
    }

    const modalState = { open: false, portal: null };

    function getInteractiveTargets() {
      const adTargets = adBuildings.map((b) => ({ ...b, status: "soon", url: "", type: "ad", size: "M", message: "COMING SOON" }));
      return portals.concat(adTargets);
    }

    function getNearestPortalCandidate(maxDist = 220) {
      let best = null;
      let bestDist = maxDist;
      for (const p of getInteractiveTargets()) {
        const cx = p.x + p.w * 0.5;
        const cy = p.y + p.h * 0.72;
        const dist = Math.hypot(player.x - cx, player.y - cy);
        if (dist < bestDist) {
          bestDist = dist;
          best = p;
        }
      }
      return best;
    }

    function fadeTo(action, ms = 220) {
      UI.fade.classList.add("on");
      setTimeout(() => { action(); }, ms * 0.55);
      setTimeout(() => { UI.fade.classList.remove("on"); }, ms + 50);
    }

    function closeModal() {
      modalState.open = false;
      modalState.portal = null;
      UI.modal.style.display = "none";
      UI.modal.style.pointerEvents = "none";
      UI.modal.style.background = "transparent";
      UI.modal.style.backdropFilter = "none";
      UI.modal.style.webkitBackdropFilter = "none";
      UI.modal.style.filter = "none";
      UI.modalTitle.innerHTML = "";
      UI.modalBody.innerHTML = "";
      UI.modalHint.innerHTML = "";
      if (!shopState.open) { UI.toast.hidden = true; UI.toast.style.display = "none"; UI.toast.innerHTML = ""; }
      if (UI.enterBtn) {
        UI.enterBtn.style.display = "none";
        UI.enterBtn.disabled = false;
        UI.enterBtn.textContent = "GO IN";
        UI.enterBtn.style.opacity = "1";
        UI.enterBtn.style.filter = "none";
      }
    }

    function confirmEnter(p) {
      if (!p) return;
      closeModal();
      if (p.key === "blacksmith") {
        renderShop("all");
        return;
      }
      if (p.status === "open" && p.url) {
        if (isTouchDevice()) {
          entering = false;
          try {
            window.location.assign(p.url);
          } catch (_) {
            window.location.href = p.url;
          }
        } else {
          entering = true;
          fadeTo(() => { window.location.href = p.url; }, 220);
        }
      } else {
        mobileToastUntil = performance.now() + 1600;
        UI.toast.hidden = false;
        UI.toast.style.display = "block";
        UI.toast.innerHTML = blockSpan(`🧱 <b>${p.label}</b><br/>${p.message || "COMING SOON"}`, { bg: "rgba(15,23,42,0.92)", fg: "#f8fafc", pad: "12px 16px", radius: "16px" });
        setTimeout(() => {
          if (!modalState.open && !shopState.open && performance.now() >= mobileToastUntil) { UI.toast.hidden = true; UI.toast.style.display = "none"; }
        }, 1500);
      }
    }

    function openPortalUI(p) {
      if (!p) return;
      modalState.open = true;
      modalState.portal = p;
      UI.modal.style.display = "none";
      UI.modal.style.pointerEvents = "none";
      UI.modal.style.background = "transparent";
      UI.modal.style.backdropFilter = "none";
      UI.modal.style.webkitBackdropFilter = "none";
      UI.modal.style.filter = "none";
      UI.modalInner.style.background = "transparent";
      UI.modalInner.style.boxShadow = "none";
      UI.modalTitle.innerHTML = "";
      UI.modalBody.innerHTML = "";
      UI.modalHint.innerHTML = "";
      const message = p.key === "blacksmith"
        ? `⚒ <b>${p.label}</b><br/>SHOP에 GO IN하시겠습니까?`
        : (p.status === "open" && (!!p.url || !!p.message)
            ? `🧱 <b>${p.label}</b><br/>GO IN하시겠습니까?`
            : `🧱 <b>${p.label}</b><br/>${p.message || "COMING SOON"}`);
      if (isTouchDevice()) {
        UI.toast.hidden = true;
        UI.toast.style.display = "none";
        UI.toast.innerHTML = "";
      } else {
        UI.toast.hidden = false;
        UI.toast.style.display = "block";
        UI.toast.innerHTML = blockSpan(message, {
          bg: "linear-gradient(180deg, rgba(8,12,22,0.98), rgba(15,23,42,0.95))",
          fg: "#f8fafc",
          pad: "12px 18px",
          radius: "18px",
          border: "1px solid rgba(148,163,184,0.16)",
          shadow: "0 14px 30px rgba(2,6,23,0.22)"
        });
      }
    }

    UI.modal.addEventListener("click", (e) => {
      if (!modalState.open) return;
      if (e.target === UI.modal) closeModal();
    });
    UI.shopModal.addEventListener("click", (e) => {
      if (e.target === UI.shopModal) closeShop();
    });

    /* ----------------------- Recalc / resize ----------------------- */
    function recalcWorld() {
      VIEW.zoom = Math.min(0.82, Math.max(0.58, Math.min(W / 1500, H / 980) * 0.74));
      VIEW.w = W / VIEW.zoom;
      VIEW.h = H / VIEW.zoom;

      WORLD.w = Math.max(4200, Math.floor(W * 3.9));
      WORLD.h = Math.max(2700, Math.floor(H * 3.05));

      syncArtBounds();
      layoutZonesFromArt();
      buildPatterns(mulberry32(seedFromWorld(WORLD.w, WORLD.h)));
      layoutRoadNetwork();
      layoutPortals();
      buildGroundPatches(mulberry32(seedFromWorld(WORLD.w, WORLD.h) ^ 0x1234));
      seedCars(mulberry32(seedFromWorld(WORLD.w, WORLD.h) ^ 0x2345));
      seedProps(mulberry32(seedFromWorld(WORLD.w, WORLD.h) ^ 0x3456));
      seedRoamers(mulberry32(seedFromWorld(WORLD.w, WORLD.h) ^ 0x4567));
      seedSlimes(mulberry32(seedFromWorld(WORLD.w, WORLD.h) ^ 0x5678));
      seedTitans(mulberry32(seedFromWorld(WORLD.w, WORLD.h) ^ 0x6789));
      player.x = clamp(player.x, WORLD.margin + 80, WORLD.w - WORLD.margin - 80);
      player.y = clamp(player.y, ART_BOUNDS.skyLineY + 120, WORLD.h - WORLD.margin - 80);
    }

    function resize() {
      DPR = Math.max(1, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      recalcWorld();
    }
    window.addEventListener("resize", resize, { passive: true });

    /* ----------------------- Footprints ----------------------- */
    let footStepAcc = 0;
    function addFootprint(dt, rng) {
      if (!player.moving) {
        footStepAcc = 0;
        return;
      }
      footStepAcc += dt * (player.speed / 220);
      if (footStepAcc < 0.12) return;
      footStepAcc = 0;
      let ox = 0, oy = 0;
      if (player.dir === "up") oy = 8;
      else if (player.dir === "down") oy = -2;
      else if (player.dir === "left") ox = 7;
      else if (player.dir === "right") ox = -7;
      footprints.push({
        x: player.x + ox + (rng() - 0.5) * 2,
        y: player.y + 25 + oy + (rng() - 0.5) * 2,
        life: 1.0,
        age: 0
      });
    }

    /* ----------------------- Rendering helpers ----------------------- */
    function drawSkyWorld() {
      const g = ctx.createLinearGradient(0, 0, 0, WORLD.h);
      g.addColorStop(0, "#bfe7ff");
      g.addColorStop(0.55, "#d7f1ff");
      g.addColorStop(1, "#fff2fb");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);

      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "rgba(255,255,255,0.60)";
      ctx.beginPath();
      ctx.ellipse(WORLD.w * 0.22, WORLD.h * 0.18, 560, 260, 0, 0, Math.PI * 2);
      ctx.ellipse(WORLD.w * 0.72, WORLD.h * 0.16, 620, 280, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.26;
      ctx.strokeStyle = "rgba(10,14,24,0.52)";
      ctx.lineWidth = 2;
      for (const b of birds) {
        const yy = b.y + Math.sin(b.p) * 6;
        const xx = b.x;
        ctx.beginPath();
        ctx.moveTo(xx - 7, yy);
        ctx.quadraticCurveTo(xx, yy - 5, xx + 7, yy);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawCloudsWorld() {
      for (const c of clouds) {
        const a = 0.12 + 0.05 * (c.layer === 0 ? 1.0 : 0.75);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, 84 * c.s, 36 * c.s, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + 52 * c.s, c.y - 12 * c.s, 72 * c.s, 31 * c.s, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + 106 * c.s, c.y, 82 * c.s, 33 * c.s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawGroundWorld() {
      ctx.save();
      ctx.fillStyle = grassPattern || "#2f6f45";
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
      ctx.restore();

      ctx.save();
      const sh = ctx.createLinearGradient(0, 0, 0, WORLD.h);
      sh.addColorStop(0, "rgba(10,14,24,0.00)");
      sh.addColorStop(1, "rgba(10,14,24,0.08)");
      ctx.fillStyle = sh;
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = dirtPattern || "#c79a64";
      for (const p of groundPatches) {
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx, p.ry, p.rot, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.34;
      for (const po of portals) {
        const cx = po.x + po.w * 0.5;
        const cy = po.y + po.h * 0.94;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 26, 58, 20, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawRoadsAndSidewalks() {
      for (const r of roads) {
        groundAO(r.x, r.y + r.h - 18, r.w, 26, 0.18);
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = "rgba(255,255,255,0.30)";
        roundRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12, 40);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = roadPattern || "#262c37";
        roundRect(r.x, r.y, r.w, r.h, 36);
        ctx.fill();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = "rgba(255,255,255,0.26)";
        roundRect(r.x + 10, r.y + 10, r.w - 20, r.h * 0.22, 28);
        ctx.fill();
        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = "rgba(255,255,255,0.88)";
        ctx.lineWidth = 3;
        ctx.setLineDash([18, 16]);
        ctx.beginPath();
        if (r.axis === "h") {
          ctx.moveTo(r.x + 18, r.y + r.h / 2);
          ctx.lineTo(r.x + r.w - 18, r.y + r.h / 2);
        } else {
          ctx.moveTo(r.x + r.w / 2, r.y + 18);
          ctx.lineTo(r.x + r.w / 2, r.y + r.h - 18);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      for (const s of sidewalks) {
        if (rectInAnyZone(s, 0)) continue;
        groundAO(s.x, s.y + s.h - 10, s.w, 20, 0.12);
        ctx.save();
        ctx.fillStyle = sidewalkPattern || "#f5efe7";
        roundRect(s.x, s.y, s.w, s.h, 18);
        ctx.fill();
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        roundRect(s.x + 4, s.y + 3, s.w - 8, Math.max(8, s.h * 0.35), 14);
        ctx.fill();
        ctx.restore();
      }

      for (const c of crossings) {
        if (rectInAnyZone(c, 0)) continue;
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "rgba(255,255,255,0.20)";
        roundRect(c.x, c.y, c.w, c.h, 14);
        ctx.fill();
        ctx.globalAlpha = 0.92;
        for (let i = 0; i < 8; i++) {
          const yy = c.y + 5 + i * 6;
          ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.08)";
          ctx.fillRect(c.x + 10, yy, c.w - 20, 4);
        }
        ctx.restore();
      }
    }

    function drawZoneFence(z, t) {
      const insetX = 16;
      const insetTop = 92;
      const insetBottom = 18;
      const postGap = 92;
      const postColor = "rgba(244,226,184,0.98)";
      const railA = "rgba(255,242,208,0.94)";
      const railB = "rgba(187,138,58,0.42)";
      const gateGapX0 = z.entrance ? z.entrance.x - 26 : z.x + z.w * 0.42;
      const gateGapX1 = z.entrance ? z.entrance.x + z.entrance.w + 26 : z.x + z.w * 0.58;
      const topY = z.y + insetTop;
      const botY = z.y + z.h - insetBottom;
      ctx.save();
      function segment(x0, y0, x1, y1) {
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        const cnt = Math.max(2, Math.floor(len / postGap));
        ctx.lineCap = "round";
        ctx.strokeStyle = railB;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = railA;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0, y0 - 10); ctx.lineTo(x1, y1 - 10);
        ctx.moveTo(x0, y0 + 10); ctx.lineTo(x1, y1 + 10);
        ctx.stroke();
        for (let i = 0; i <= cnt; i++) {
          const tt = i / cnt;
          const px = x0 + dx * tt;
          const py = y0 + dy * tt;
          const g = ctx.createLinearGradient(px, py - 18, px, py + 18);
          g.addColorStop(0, "#fff6da");
          g.addColorStop(1, "#d6a95d");
          ctx.fillStyle = g;
          roundRect(px - 4, py - 18, 8, 36, 4);
          ctx.fill();
        }
      }
      segment(z.x + insetX, topY, z.x + z.w - insetX, topY);
      segment(z.x + insetX, botY, gateGapX0, botY);
      segment(gateGapX1, botY, z.x + z.w - insetX, botY);
      segment(z.x + insetX, topY, z.x + insetX, botY);
      segment(z.x + z.w - insetX, topY, z.x + z.w - insetX, botY);
      ctx.restore();
    }

    function drawZoneGate(z, t) {
      if (!z.entrance) return;
      const g = z.entrance;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
      ctx.save();
      groundAO(g.x, g.y + g.h - 6, g.w, 16, 0.10);
      const pillarW = 22;
      const pillarH = g.h + 42;
      const frameGrad = ctx.createLinearGradient(g.x, g.y, g.x, g.y + g.h);
      frameGrad.addColorStop(0, "#111827");
      frameGrad.addColorStop(1, "#0f172a");
      ctx.fillStyle = frameGrad;
      roundRect(g.x - pillarW - 10, g.y - 18, pillarW, pillarH, 9); ctx.fill();
      roundRect(g.x + g.w + 10, g.y - 18, pillarW, pillarH, 9); ctx.fill();
      ctx.fillStyle = "#fde68a";
      roundRect(g.x - pillarW - 6, g.y - 12, pillarW - 8, 8, 4); ctx.fill();
      roundRect(g.x + g.w + 14, g.y - 12, pillarW - 8, 8, 4); ctx.fill();
      ctx.shadowColor = z.color;
      ctx.shadowBlur = 22;
      ctx.fillStyle = z.color;
      ctx.beginPath(); ctx.arc(g.x - 21, g.y + 24, 6 + pulse * 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(g.x + g.w + 21, g.y + 24, 6 + pulse * 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      const grad = ctx.createLinearGradient(g.x, g.y, g.x, g.y + g.h);
      grad.addColorStop(0, "rgba(7,12,22,0.98)");
      grad.addColorStop(0.55, "rgba(15,23,42,0.98)");
      grad.addColorStop(1, "rgba(27,38,59,0.96)");
      ctx.fillStyle = grad;
      roundRect(g.x, g.y, g.w, g.h, 22);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      roundRect(g.x + 3, g.y + 3, g.w - 6, g.h - 6, 20);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = z.color;
      roundRect(g.x, g.y, g.w, g.h, 22);
      ctx.stroke();
      ctx.fillStyle = "rgba(248,250,252,0.96)";
      ctx.font = "1000 17px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(z.label, g.x + g.w / 2, g.y + 30);
      ctx.font = "900 11px system-ui";
      ctx.fillStyle = "rgba(226,232,240,0.78)";
      ctx.fillText("ENTRANCE", g.x + g.w / 2, g.y + 48);
      ctx.restore();
    }
        function drawZonesWorld(t) {
      const zones = [ZONES.game, ZONES.community, ZONES.ads];
      for (const z of zones) {
        ctx.save();
        drawZoneFence(z, t);
        drawZoneGate(z, t);
        ctx.restore();
      }
    }

    function legoStyleForType(type) {
      const map = {
        arcade:  { wall: "#d8c4a2", frame: "#5e4630", knob: "#ffffff", grass: "#60d878", sign: "#ff5e57", glassA: "#9fe1ff", glassB: "#e8fbff", accent: "#ffd166" },
        tower:   { wall: "#d9c7a7", frame: "#59402a", knob: "#fff7d6", grass: "#67d67f", sign: "#0a84ff", glassA: "#b8e7ff", glassB: "#eefbff", accent: "#7c4dff" },
        dojo:    { wall: "#d7c0a4", frame: "#66452f", knob: "#fff0c9", grass: "#62d274", sign: "#ef4444", glassA: "#bfe6ff", glassB: "#eef9ff", accent: "#f59e0b" },
        cafe:    { wall: "#ddccb1", frame: "#6d4f37", knob: "#fff5da", grass: "#6fd97b", sign: "#ec4899", glassA: "#b6ebff", glassB: "#eefcff", accent: "#fb7185" },
        igloo:   { wall: "#dfe8ef", frame: "#567",    knob: "#ffffff", grass: "#8be4a7", sign: "#06b6d4", glassA: "#d3f3ff", glassB: "#f5fdff", accent: "#93c5fd" },
        gym:     { wall: "#d8c5aa", frame: "#5b4634", knob: "#fff2d6", grass: "#68d67e", sign: "#22c55e", glassA: "#afe5ff", glassB: "#eefaff", accent: "#34d399" },
        social:  { wall: "#d9c9ad", frame: "#5e4a35", knob: "#fff",    grass: "#67d67f", sign: "#0ea5e9", glassA: "#bcecff", glassB: "#eefcff", accent: "#38bdf8" },
        wallet:  { wall: "#d8c4a5", frame: "#5d4632", knob: "#fff5dc", grass: "#64d679", sign: "#10b981", glassA: "#b9edff", glassB: "#effdff", accent: "#6ee7b7" },
        market:  { wall: "#dbc9a7", frame: "#60452f", knob: "#fff2d0", grass: "#66d77b", sign: "#f59e0b", glassA: "#baeaff", glassB: "#effcff", accent: "#fbbf24" },
        support: { wall: "#d8c4aa", frame: "#5b4635", knob: "#fff6df", grass: "#67d67d", sign: "#8b5cf6", glassA: "#c8eaff", glassB: "#f3fbff", accent: "#a78bfa" },
        mcd:     { wall: "#ddc7a8", frame: "#5e4430", knob: "#fff",    grass: "#67d67f", sign: "#ef4444", glassA: "#bce8ff", glassB: "#eefcff", accent: "#facc15" },
        bbq:     { wall: "#dcc6a4", frame: "#5f412b", knob: "#fff",    grass: "#66d77c", sign: "#dc2626", glassA: "#bbe6ff", glassB: "#eefcff", accent: "#fb923c" },
        baskin:  { wall: "#dfcdb7", frame: "#6a4c3a", knob: "#fff",    grass: "#6bd87e", sign: "#ec4899", glassA: "#cceeff", glassB: "#f4fdff", accent: "#f9a8d4" },
        paris:   { wall: "#e0d0b8", frame: "#6a503a", knob: "#fff",    grass: "#6ad87d", sign: "#2563eb", glassA: "#c6e9ff", glassB: "#f3fcff", accent: "#93c5fd" }
      };
      return map[type] || map.arcade;
    }

    function drawLegoBrickGrid(x, y, w, h) {
      ctx.save();
      ctx.fillStyle = brickPattern || "#d9c6a3";
      roundRect(x, y, w, h, 18);
      ctx.fill();
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = "rgba(70,55,40,0.45)";
      ctx.lineWidth = 2;
      const bw = 36, bh = 24;
      for (let yy = y; yy < y + h; yy += bh) {
        const off = (((yy - y) / bh) | 0) % 2 ? bw / 2 : 0;
        for (let xx = x - bw; xx < x + w + bw; xx += bw) {
          ctx.strokeRect(xx + off, yy, bw, bh);
        }
      }
      ctx.restore();
    }

    function drawLegoStudRow(x, y, w, count, col) {
      ctx.save();
      const step = w / count;
      for (let i = 0; i < count; i++) {
        const cx = x + step * (i + 0.5);
        const cy = y;
        ctx.fillStyle = shade(col, 18);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.20;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(cx - 2, cy - 1, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    function drawLegoSignPlaque(x, y, w, h, label, textSize, signCol) {
      ctx.save();
      ctx.fillStyle = signCol;
      roundRect(x, y, w, h, 18);
      ctx.fill();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#fff";
      roundRect(x + 6, y + 6, w - 12, h * 0.42, 14);
      ctx.fill();
      ctx.globalAlpha = 1;
      drawLegoStudRow(x + 18, y + 10, w - 36, 6, signCol);
      ctx.fillStyle = "#fff";
      ctx.font = `1000 ${textSize}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + w / 2, y + h / 2 + 2);
      ctx.restore();
    }

    function drawLegoWindow(x, y, w, h, frameCol, glassA, glassB) {
      ctx.save();
      ctx.fillStyle = frameCol;
      roundRect(x, y, w, h, 12);
      ctx.fill();
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, glassA);
      g.addColorStop(1, glassB);
      ctx.fillStyle = g;
      roundRect(x + 8, y + 8, w - 16, h - 16, 10);
      ctx.fill();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = "#fff";
      roundRect(x + 14, y + 12, w * 0.44, 10, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y + 8);
      ctx.lineTo(x + w / 2, y + h - 8);
      ctx.moveTo(x + 8, y + h / 2);
      ctx.lineTo(x + w - 8, y + h / 2);
      ctx.stroke();
      ctx.restore();
    }

    function drawLegoDoor(x, y, w, h, doorCol, frameCol, knobCol) {
      ctx.save();
      ctx.fillStyle = frameCol;
      roundRect(x, y, w, h, 14);
      ctx.fill();
      const dg = ctx.createLinearGradient(x, y, x, y + h);
      dg.addColorStop(0, shade(doorCol, 8));
      dg.addColorStop(1, shade(doorCol, -16));
      ctx.fillStyle = dg;
      roundRect(x + 6, y + 6, w - 12, h - 12, 10);
      ctx.fill();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#fff";
      roundRect(x + 10, y + 10, w - 20, h * 0.24, 10);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = knobCol;
      ctx.beginPath();
      ctx.arc(x + w - 18, y + h * 0.56, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const adImageCache = {};
    function getAdImageForKey(key) {
      const map = {
        youtube: window.AD_YOUTUBE_SRC,
        tiktok: window.AD_TIKTOK_SRC,
        instagram: window.AD_INSTAGRAM_SRC
      };
      const src = map[key];
      if (!src) return null;
      if (!adImageCache[key]) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        adImageCache[key] = img;
      }
      return adImageCache[key];
    }

    function drawAdBuilding(b, t) {
      const c = legoStyleForType(b.key === "youtube" ? "bbq" : b.key === "tiktok" ? "baskin" : b.key === "instagram" ? "social" : "mcd");
      const x = b.x, y = b.y, w = b.w, h = b.h;
      groundAO(x + 12, y + h - 18, w - 24, 42, 0.14);
      softShadow(x + 22, y + h - 12, w - 44, 18, 0.06);

      const adImg = getAdImageForKey(b.key);
      if (adImg && adImg.complete && adImg.naturalWidth > 0) {
        ctx.save();
        const pad = 8;
        const availW = w - pad * 2;
        const availH = h - 34;
        const scale = Math.min(availW / adImg.naturalWidth, availH / adImg.naturalHeight);
        const iw = adImg.naturalWidth * scale;
        const ih = adImg.naturalHeight * scale;
        const ix = x + (w - iw) * 0.5;
        const iy = y + Math.max(0, (h - ih) * 0.32);
        ctx.drawImage(adImg, ix, iy, iw, ih);
        ctx.fillStyle = "rgba(10,14,24,0.82)";
        roundRect(x + w*0.5 - 66, y + h - 42, 132, 24, 12);
        ctx.fill();
        ctx.fillStyle = "#f8fafc";
        ctx.font = "900 13px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("COMING SOON", x + w*0.5, y + h - 30);
        ctx.restore();
        return;
      }

      ctx.save();
      const wall = ctx.createLinearGradient(x, y, x, y + h);
      wall.addColorStop(0, shade(c.wall, 10));
      wall.addColorStop(1, shade(c.wall, -12));
      ctx.fillStyle = wall;
      roundRect(x, y + 30, w, h - 30, 24);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      roundRect(x, y + 30, w, h - 30, 24);
      ctx.stroke();

      ctx.fillStyle = shade(c.frame, -10);
      roundRect(x + 20, y + h - 64, w - 40, 22, 8);
      ctx.fill();

      const awningY = y + h * 0.46;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? "#ffffff" : b.color;
        ctx.beginPath();
        ctx.moveTo(x + 18 + i * ((w - 36) / 8), awningY);
        ctx.lineTo(x + 18 + (i + 1) * ((w - 36) / 8), awningY);
        ctx.lineTo(x + 28 + (i + 1) * ((w - 36) / 8), awningY + 38);
        ctx.lineTo(x + 8 + i * ((w - 36) / 8), awningY + 38);
        ctx.closePath();
        ctx.fill();
      }

      const signW = w * 0.78;
      const signH = 64;
      const signX = x + (w - signW) * 0.5;
      const signY = y;
      const sg = ctx.createLinearGradient(signX, signY, signX + signW, signY + signH);
      sg.addColorStop(0, shade(b.color, 4));
      sg.addColorStop(1, shade(b.color, -28));
      ctx.fillStyle = sg;
      roundRect(signX, signY, signW, signH, 22);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = b.key === "instagram" ? "rgba(255,255,255,0.35)" : "rgba(255,230,180,0.35)";
      roundRect(signX, signY, signW, signH, 22);
      ctx.stroke();
      ctx.fillStyle = b.key === "instagram" ? "#f8fafc" : "#fff7d6";
      ctx.font = `1000 ${b.key === "instagram" ? 25 : 24}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, x + w * 0.5, signY + signH * 0.54);

      if (b.key === "instagram") {
        const ig = ctx.createLinearGradient(x + 26, y + 88, x + 96, y + 158);
        ig.addColorStop(0, "#f59e0b");
        ig.addColorStop(0.5, "#ec4899");
        ig.addColorStop(1, "#8b5cf6");
        ctx.fillStyle = ig;
        roundRect(x + 26, y + 88, 70, 70, 18);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.lineWidth = 5;
        roundRect(x + 40, y + 102, 42, 42, 12);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 61, y + 123, 9, 0, Math.PI*2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + 77, y + 107, 3.5, 0, Math.PI*2);
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fill();
      } else if (b.key === "tiktok") {
        ctx.strokeStyle = "#22d3ee";
        ctx.lineWidth = 9;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x + 54, y + 92);
        ctx.lineTo(x + 54, y + 146);
        ctx.quadraticCurveTo(x + 54, y + 160, x + 38, y + 160);
        ctx.stroke();
        ctx.strokeStyle = "#f472b6";
        ctx.beginPath();
        ctx.moveTo(x + 64, y + 88);
        ctx.lineTo(x + 64, y + 142);
        ctx.quadraticCurveTo(x + 64, y + 156, x + 48, y + 156);
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x + 45, y + 155, 12, 0, Math.PI*2);
        ctx.fill();
      } else if (b.key === "youtube") {
        ctx.fillStyle = "#ef4444";
        roundRect(x + 24, y + 96, 80, 52, 16);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(x + 56, y + 109);
        ctx.lineTo(x + 56, y + 135);
        ctx.lineTo(x + 78, y + 122);
        ctx.closePath();
        ctx.fill();
      }


      ctx.fillStyle = "rgba(10,14,24,0.76)";
      roundRect(x + w*0.5 - 62, y + h - 48, 124, 26, 12);
      ctx.fill();
      ctx.fillStyle = "#f8fafc";
      ctx.font = "900 14px system-ui";
      ctx.fillText("COMING SOON", x + w*0.5, y + h - 35);

      ctx.fillStyle = "rgba(188,232,255,0.90)";
      roundRect(x + 24, y + h * 0.58, w * 0.28, h * 0.20, 12);
      roundRect(x + w * 0.68 - w * 0.18, y + h * 0.58, w * 0.18, h * 0.20, 12);
      ctx.fill();
      ctx.fillStyle = "#1f2937";
      roundRect(x + w * 0.41, y + h * 0.54, w * 0.18, h * 0.30, 12);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      roundRect(x + 28, y + h * 0.60, w * 0.22, h * 0.06, 8);
      roundRect(x + w * 0.70 - w * 0.14, y + h * 0.60, w * 0.12, h * 0.06, 8);
      ctx.fill();
      ctx.restore();
    }

    function drawPortalBuilding(p, t) {
      const c = legoStyleForType(p.type);
      const x = p.x, y = p.y, w = p.w, h = p.h;
      groundAO(x + 8, y + h - 16, w - 16, 34, 0.22);
      softShadow(x + 8, y + h - 14, w - 16, 22, 0.11);

      if (hasShopArt(p.key)) {
        const art = shopArt[p.key].img;
        const pad = 0;
        const boxW = w;
        const boxH = h;
        const ratio = Math.min(boxW / Math.max(1, art.naturalWidth || art.width), boxH / Math.max(1, art.naturalHeight || art.height));
        const drawW = Math.max(24, (art.naturalWidth || art.width) * ratio);
        const drawH = Math.max(24, (art.naturalHeight || art.height) * ratio);
        const dx = x + (w - drawW) * 0.5;
        const dy = y + (h - drawH) * 0.5;
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(art, dx, dy, drawW, drawH);
        ctx.restore();
      } else {
        if (p.key === "blacksmith") {
          ctx.save();
          const roofH = h * 0.18;
          const wallY = y + roofH * 0.75;
          const wallH = h - roofH * 0.75;
          const forgeWall = ctx.createLinearGradient(x, wallY, x, y + h);
          forgeWall.addColorStop(0, "#5b3a28");
          forgeWall.addColorStop(1, "#241711");
          ctx.fillStyle = forgeWall;
          roundRect(x, wallY, w, wallH, 26);
          ctx.fill();
          ctx.fillStyle = "#6b1d1d";
          ctx.beginPath();
          ctx.moveTo(x + w * 0.05, wallY + 10);
          ctx.lineTo(x + w * 0.95, wallY + 10);
          ctx.lineTo(x + w * 0.78, y + 14);
          ctx.lineTo(x + w * 0.22, y + 14);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "#111827";
          roundRect(x + w * 0.10, y + 24, w * 0.80, 44, 16);
          ctx.fill();
          ctx.strokeStyle = "rgba(251,191,36,0.65)";
          ctx.lineWidth = 3;
          roundRect(x + w * 0.10, y + 24, w * 0.80, 44, 16);
          ctx.stroke();
          ctx.fillStyle = "#fde68a";
          ctx.font = `1000 ${Math.max(14, Math.floor(w * 0.085))}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("BLACKSMITH", x + w * 0.5, y + 46);
          ctx.fillStyle = "#0f172a";
          roundRect(x + w * 0.39, y + h * 0.56, w * 0.22, h * 0.22, 18);
          ctx.fill();
          ctx.fillStyle = "#94a3b8";
          roundRect(x + w * 0.16, y + h * 0.56, w * 0.13, h * 0.14, 10);
          roundRect(x + w * 0.71, y + h * 0.56, w * 0.13, h * 0.14, 10);
          ctx.fill();
          const ember = ctx.createRadialGradient(x + w * 0.5, y + h * 0.62, 6, x + w * 0.5, y + h * 0.62, 30);
          ember.addColorStop(0, "rgba(251,191,36,0.95)");
          ember.addColorStop(0.5, "rgba(249,115,22,0.55)");
          ember.addColorStop(1, "rgba(249,115,22,0.00)");
          ctx.fillStyle = ember;
          ctx.beginPath(); ctx.arc(x + w * 0.5, y + h * 0.62, 30, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        } else {
        drawLegoBrickGrid(x, y + 18, w, h - 18);

        ctx.save();
        ctx.fillStyle = shade(c.wall, -10);
        roundRect(x + 10, y, w - 20, 28, 16);
        ctx.fill();
        drawLegoStudRow(x + 30, y + 8, w - 60, Math.max(4, Math.floor((w - 60) / 44)), shade(c.wall, -12));
        ctx.restore();

        const signH = Math.max(40, h * 0.19);
        drawLegoSignPlaque(x + w * 0.10, y + 28, w * 0.80, signH, p.label, Math.max(15, Math.floor(signH * 0.34)), c.sign);

        const winY = y + 28 + signH + 14;
        const doorY = y + h * 0.54;
        if (p.size === "L") {
          drawLegoWindow(x + w * 0.10, winY, w * 0.24, h * 0.18, c.frame, c.glassA, c.glassB);
          drawLegoDoor(x + w * 0.39, doorY, w * 0.22, h * 0.30, c.accent, c.frame, c.knob);
          drawLegoWindow(x + w * 0.66, winY, w * 0.24, h * 0.18, c.frame, c.glassA, c.glassB);
        } else {
          drawLegoWindow(x + w * 0.12, winY, w * 0.28, h * 0.18, c.frame, c.glassA, c.glassB);
          drawLegoDoor(x + w * 0.58, doorY, w * 0.22, h * 0.28, c.accent, c.frame, c.knob);
        }
        }
      }

      ctx.save();
      ctx.globalAlpha = 0.90;
      ctx.fillStyle = c.grass;
      roundRect(x + 14, y + h - 14, w - 28, 10, 8);
      ctx.fill();
      ctx.restore();

      const ez = portalEnterZone(p);
    }

    function drawCar(c) {
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(c.bob) * 0.8);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "rgba(10,14,24,0.95)";
      ctx.beginPath();
      ctx.ellipse(0, c.axis === "h" ? 14 : 22, c.axis === "h" ? c.w * 0.45 : c.w * 0.60, c.axis === "h" ? 7 : 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (c.axis === "h") {
        if (c.dir < 0) ctx.scale(-1, 1);
        ctx.fillStyle = c.color;
        roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 10);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        roundRect(-c.w * 0.42, -c.h * 0.40, c.w * 0.84, c.h * 0.36, 8);
        ctx.fill();
        ctx.fillStyle = "#c7ecff";
        roundRect(-c.w * 0.22, -c.h * 0.32, c.w * 0.36, c.h * 0.28, 6);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.beginPath(); ctx.arc(-c.w * 0.28, c.h * 0.42, 6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(c.w * 0.28, c.h * 0.42, 6, 0, Math.PI * 2); ctx.fill();
      } else {
        if (c.dir < 0) ctx.scale(1, -1);
        ctx.fillStyle = c.color;
        roundRect(-c.w / 2, -c.h / 2, c.w, c.h, 10);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.16)";
        roundRect(-c.w * 0.40, -c.h * 0.42, c.w * 0.80, c.h * 0.30, 8);
        ctx.fill();
        ctx.fillStyle = "#c7ecff";
        roundRect(-c.w * 0.26, -c.h * 0.18, c.w * 0.52, c.h * 0.24, 6);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.beginPath(); ctx.arc(-c.w * 0.44, -c.h * 0.24, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(c.w * 0.44, -c.h * 0.24, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-c.w * 0.44, c.h * 0.24, 5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(c.w * 0.44, c.h * 0.24, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    function drawTree(o) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(o.s, o.s);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "rgba(10,14,24,0.95)";
      ctx.beginPath();
      ctx.ellipse(0, 42, 26, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#8b5a2b";
      roundRect(-10, -8, 20, 52, 8);
      ctx.fill();
      const greens = ["#3bcf74", "#35c96d", "#4bd985"];
      ctx.fillStyle = greens[(hash01(`${o.x},${o.y}`) * greens.length) | 0];
      ctx.beginPath(); ctx.arc(0, -28, 30, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-18, -4, 24, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(18, -2, 22, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 10, 26, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-8, -36, 12, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    function drawLamp(o, t) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(o.s, o.s);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "rgba(10,14,24,0.95)";
      ctx.beginPath();
      ctx.ellipse(0, 42, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#374151";
      roundRect(-4, -42, 8, 78, 4);
      ctx.fill();
      ctx.fillStyle = "#4b5563";
      roundRect(-16, -48, 32, 10, 5);
      ctx.fill();
      ctx.fillStyle = "#fff6b3";
      roundRect(-10, -38, 20, 18, 6);
      ctx.fill();
      ctx.globalAlpha = 0.18 + 0.06 * Math.sin(t * 4 + o.x * 0.01);
      const g = ctx.createRadialGradient(0, -30, 2, 0, -30, 34);
      g.addColorStop(0, "rgba(255,246,179,0.70)");
      g.addColorStop(1, "rgba(255,246,179,0.0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -30, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawBench(o) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(o.s, o.s);
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = "rgba(10,14,24,0.90)";
      ctx.beginPath();
      ctx.ellipse(0, 14, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#7c5a3b";
      roundRect(-26, -8, 52, 10, 5);
      ctx.fill();
      roundRect(-22, -18, 44, 8, 4);
      ctx.fill();
      ctx.fillStyle = "#4b5563";
      roundRect(-20, 2, 5, 16, 3);
      ctx.fill();
      roundRect(15, 2, 5, 16, 3);
      ctx.fill();
      ctx.restore();
    }

    function drawFlower(o, t) {
      ctx.save();
      ctx.translate(o.x, o.y);
      ctx.scale(o.s, o.s);
      ctx.strokeStyle = "#2f9e59";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(0, -10);
      ctx.stroke();
      const cols = ["#ff6b81", "#ffd166", "#7bdff2", "#c77dff", "#ff9f1c"];
      const col = cols[((hash01(`${o.x}:${o.y}`) * cols.length) | 0)];
      ctx.fillStyle = col;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 0.2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 5, -13 + Math.sin(a) * 5, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#ffe082";
      ctx.beginPath();
      ctx.arc(0, -13, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawEmblem(e) {
      const p = portalsByKey(e.key);
      if (!p) return;
      const c = legoStyleForType(p.type);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "rgba(10,14,24,0.9)";
      ctx.beginPath();
      ctx.ellipse(0, 8, 18, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = c.sign;
      ctx.stroke();
      ctx.fillStyle = c.sign;
      ctx.font = "900 10px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((p.label || "?").slice(0, 2), 0, 1);
      ctx.restore();
    }

    function drawSignal(sg, t) {
      ctx.save();
      ctx.translate(sg.x, sg.y);
      ctx.fillStyle = "#374151";
      roundRect(-4, -32, 8, 54, 4);
      ctx.fill();
      ctx.fillStyle = "#111827";
      roundRect(-12, -54, 24, 22, 8);
      ctx.fill();
      const phase = (Math.sin(t * 1.7 + sg.x * 0.001 + sg.y * 0.001) + 1) * 0.5;
      ctx.fillStyle = phase > 0.5 ? "#ef4444" : "#3f3f46";
      ctx.beginPath(); ctx.arc(0, -46, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = phase <= 0.5 ? "#22c55e" : "#3f3f46";
      ctx.beginPath(); ctx.arc(0, -38, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
        function drawNPC(key, x, y) {
      ctx.save();
      ctx.translate(x, y);
      const paletteMap = {
        archery: { torso: "#f59e0b", pants: "#374151", hat: "#0a84ff" },
        janggi: { torso: "#ef4444", pants: "#374151", hat: "#facc15" },
        omok: { torso: "#8b5cf6", pants: "#374151", hat: "#ec4899" }
      };
      const pal = paletteMap[key] || { torso: "#0a84ff", pants: "#374151", hat: "#ffcc00" };
      drawMinifig(0, 0, { isHero: false, palette: pal });
      ctx.restore();
    }

    function drawRoamer(n, palette) {
      const pal = palette[n.colorIdx % palette.length];
      ctx.save();
      ctx.translate(n.x, n.y);
      drawMinifig(0, 0, { isHero: false, palette: pal, dirOverride: n.dir, moving: true, walkPhase: n.t * 5 });
      ctx.restore();
    }

    function drawFootprints() {
      ctx.save();
      for (const fp of footprints) {
        const tt = 1 - fp.age / fp.life;
        ctx.globalAlpha = 0.10 * tt;
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.beginPath();
        ctx.ellipse(fp.x, fp.y, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawWorldTitle() {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const title = "META WORLD";
      ctx.font = "1000 34px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.strokeStyle = "rgba(10,14,24,0.16)";
      ctx.lineWidth = 6;
      ctx.strokeText(title, W * 0.5, 18);
      ctx.fillText(title, W * 0.5, 18);
      ctx.font = "800 13px system-ui";
      ctx.fillStyle = "rgba(10,14,24,0.66)";
      ctx.fillText("PORTAL WORLD · COMMUNITY · ADS", W * 0.5, 58);
      ctx.restore();
    }

    function drawMiniMap() {
      const mw = isTouchDevice() ? 146 : 220, mh = isTouchDevice() ? 104 : 154;
      const x = W - mw - 18, y = 18;
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.84)";
      roundRect(x, y, mw, mh, 18);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.10)";
      roundRect(x, y, mw, mh, 18);
      ctx.stroke();
      const pad = 12;
      const sx = (mw - pad * 2) / WORLD.w;
      const sy = (mh - pad * 2) / WORLD.h;

      function rr(r, fill) {
        ctx.fillStyle = fill;
        roundRect(x + pad + r.x * sx, y + pad + r.y * sy, r.w * sx, r.h * sy, 6);
        ctx.fill();
      }

      rr({ x: 0, y: 0, w: WORLD.w, h: WORLD.h }, "rgba(67,220,107,0.24)");
      rr(ZONES.game, "rgba(10,132,255,0.22)");
      rr(ZONES.community, "rgba(52,199,89,0.22)");
      rr(ZONES.ads, "rgba(255,45,85,0.20)");
      for (const r of roads) {
        ctx.fillStyle = "rgba(38,44,55,0.68)";
        roundRect(x + pad + r.x * sx, y + pad + r.y * sy, r.w * sx, r.h * sy, 4);
        ctx.fill();
      }
      for (const p of portals) {
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(x + pad + (p.x + p.w * 0.5) * sx, y + pad + (p.y + p.h * 0.6) * sy, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const m of combatState.titans) {
        if (m.dead) continue;
        ctx.fillStyle = m.key === "colossus" ? "#ef4444" : "#fb923c";
        ctx.beginPath();
        ctx.arc(x + pad + m.x * sx, y + pad + m.y * sy, m.key === "colossus" ? 4.2 : 3.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#111827";
      ctx.beginPath();
      ctx.arc(x + pad + player.x * sx, y + pad + player.y * sy, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "800 11px system-ui";
      ctx.fillStyle = "rgba(10,14,24,0.74)";
      ctx.fillText("MINIMAP", x + 14, y + 16);
      ctx.restore();
    }

    function drawSpriteCharacter(x, y) {
      if (!sprite.loaded || !sprite.img) return false;
      const bob = player.moving ? Math.sin(player.walkPhase * 1.7) * 1.2 : 0;
      const stretch = player.moving ? 0.98 + 0.02 * Math.sin(player.walkPhase * 2.2) : 1;
      const baseW = 74, baseH = 84;

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(10,14,24,0.42)";
      ctx.beginPath();
      ctx.ellipse(x, y + 20, 20, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y + bob + 4);
      if (player.dir === "left") ctx.scale(-1, 1);
      ctx.scale(stretch, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.imageSmoothingQuality = "low";
      ctx.drawImage(sprite.img, -baseW / 2, -74, baseW, baseH);
      ctx.restore();
      return true;
    }

    function getEquippedVisuals() {
      const hat = getItemById(inventoryState.equipped.hat);
      const armor = getItemById(inventoryState.equipped.armor);
      const weapon = getItemById(inventoryState.equipped.weapon);
      const shield = getItemById(inventoryState.equipped.shield);
      return {
        hatColor: hat ? hat.color : null,
        armorColor: null,
        weaponColor: weapon ? weapon.color : null,
        shieldColor: shield ? shield.color : null,
        hatTier: hat ? rarityStyle(hat.price) : null,
        armorTier: null,
        weaponTier: weapon ? rarityStyle(weapon.price) : null,
        shieldTier: shield ? rarityStyle(shield.price) : null,
        weaponPlus: getEnhanceLevel("weapon"),
        shieldPlus: getEnhanceLevel("shield"),
        hatPlus: getEnhanceLevel("hat"),
        armorPlus: getEnhanceLevel("armor")
      };
    }

    function drawGearEffect(x, y) {
      if (player.gearFlashT <= 0) return;
      const a = Math.min(1, player.gearFlashT / 0.65);
      const gear = getEquippedVisuals();
      const glow = gear.weaponTier?.glow || gear.hatTier?.glow || "#93c5fd";
      ctx.save();
      ctx.globalAlpha = 0.16 * a;
      const g = ctx.createRadialGradient(x, y - 10, 8, x, y - 10, 44);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.45, glow + "88");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y - 10, 44, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 7; i++) {
        const ang = i / 7 * Math.PI * 2 + performance.now() / 280;
        const px = x + Math.cos(ang) * (18 + i * 1.2);
        const py = y - 10 + Math.sin(ang) * (12 + i * 1.4);
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.9)" : glow + "cc";
        ctx.beginPath();
        ctx.arc(px, py, i % 2 ? 1.6 : 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawMinifig(x, y, opts = {}) {
      const isHero = !!opts.isHero;
      const pal = opts.palette || {
        torso: isHero ? "#2563eb" : "#0a84ff",
        pants: isHero ? "#334155" : "#374151",
        hat: isHero ? "#ef4444" : "#ffcc00",
        skin: "#ffd7b5",
        hair: "#1f2937"
      };
      const gear = isHero ? getEquippedVisuals() : null;
      const dir = opts.dirOverride || player.dir;
      const moving = typeof opts.moving === "boolean" ? opts.moving : player.moving;
      const walkPhase = typeof opts.walkPhase === "number" ? opts.walkPhase : player.walkPhase;
      const bob = moving ? Math.sin(walkPhase) * 1.5 : 0;
      const armSwing = moving ? Math.sin(walkPhase) * 0.45 : 0;
      const legSwing = moving ? Math.sin(walkPhase + Math.PI) * 0.42 : 0;
      const atk = isHero ? combatState.attackT / 0.28 : 0;
      const attackPose = isHero && combatState.attackT > 0;
      const attackEase = attackPose ? Math.sin(Math.min(1, atk) * Math.PI) : 0;

      ctx.save();
      ctx.translate(x, y + bob + 4);
      if (dir === "left") ctx.scale(-1, 1);

      ctx.globalAlpha = 0.24;
      ctx.fillStyle = "rgba(10,14,24,0.42)";
      ctx.beginPath();
      ctx.ellipse(0, 29, 18, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      const armorBase = gear && gear.armorColor ? gear.armorColor : '#111827';
      const accentGlow = '#374151';

      ctx.save();
      ctx.translate(0, 10);
      ctx.rotate(legSwing * 0.16);
      ctx.fillStyle = shade(armorBase, -28);
      roundRect(-12, 0, 9, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      roundRect(-12, 12, 9, 4, 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(0, 10);
      ctx.rotate(-legSwing * 0.16);
      ctx.fillStyle = shade(armorBase, -28);
      roundRect(3, 0, 9, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      roundRect(3, 12, 9, 4, 2);
      ctx.fill();
      ctx.restore();

      const torsoGrad = ctx.createLinearGradient(0, -18, 0, 14);
      torsoGrad.addColorStop(0, shade(armorBase, 18));
      torsoGrad.addColorStop(0.55, armorBase);
      torsoGrad.addColorStop(1, shade(armorBase, -18));
      ctx.fillStyle = torsoGrad;
      roundRect(-18, -15, 36, 30, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      roundRect(-10, -10, 20, 9, 5);
      ctx.fill();
      ctx.strokeStyle = accentGlow;
      ctx.lineWidth = 2;
      roundRect(-14, -7, 28, 16, 7);
      ctx.stroke();
      ctx.fillStyle = "#111827";
      roundRect(-5, -4, 10, 18, 4);
      ctx.fill();
      ctx.fillStyle = accentGlow;
      roundRect(-2, -1, 4, 10, 2);
      ctx.fill();
      if (gear?.armorTier?.horn > 0) {
        ctx.shadowColor = gear.armorTier.glow; ctx.shadowBlur = 16;
        ctx.fillStyle = gear.armorTier.color;
        ctx.beginPath(); ctx.moveTo(-16,-14); ctx.lineTo(-22,-24); ctx.lineTo(-10,-18); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(16,-14); ctx.lineTo(22,-24); ctx.lineTo(10,-18); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      roundRect(-13, -12, 26, 4, 3); ctx.fill();

      ctx.save();
      ctx.translate(-19, -4);
      ctx.rotate(-0.35 + armSwing * 0.45);
      ctx.fillStyle = armorBase;
      roundRect(-5, 0, 10, 22, 5);
      ctx.fill();
      ctx.fillStyle = accentGlow;
      roundRect(-4, 3, 8, 5, 3);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(18, -5);
      ctx.rotate(0.18 - armSwing * 0.26 + (attackPose ? (-0.72 - 0.95 * attackEase) : -0.42));
      ctx.fillStyle = armorBase;
      roundRect(-5, 0, 10, 22, 5);
      ctx.fill();
      ctx.fillStyle = accentGlow;
      roundRect(-4, 3, 8, 5, 3);
      ctx.fill();

      if (isHero && gear && gear.weaponColor) {
        ctx.save();
        const sideMap = {
          up: -2.36,
          down: 2.18,
          left: -2.12,
          right: 2.02
        };
        const swingBase = sideMap[dir] ?? 2.18;
        const swingArc =
          dir === "up"
            ? (attackPose ? (0.24 - 0.92 * attackEase) : 0.05)
            : dir === "left"
              ? (attackPose ? (0.30 - 0.96 * attackEase) : 0.05)
              : dir === "right"
                ? (attackPose ? (0.42 - 1.10 * attackEase) : 0.06)
                : (attackPose ? (0.42 - 1.18 * attackEase) : 0.06);
        const gripOffsetX = dir === "left" ? -5.0 : dir === "up" ? -1.4 : 5.8;
        const gripOffsetY = dir === "up" ? 11.0 : 13.8;
        ctx.translate(gripOffsetX, gripOffsetY);
        ctx.rotate(swingBase + swingArc);
        const weaponGlow = gear.weaponTier ? gear.weaponTier.glow : gear.weaponColor;
        const bladeGrad = ctx.createLinearGradient(0, -40, 0, 14);
        bladeGrad.addColorStop(0, "#ffffff");
        bladeGrad.addColorStop(0.22, weaponGlow);
        bladeGrad.addColorStop(0.60, gear.weaponColor);
        bladeGrad.addColorStop(1, shade(gear.weaponColor, -35));
        ctx.shadowColor = weaponGlow;
        ctx.shadowBlur = 18 + ((gear.weaponTier && gear.weaponTier.label==="MYTHIC") ? 12 : (gear.weaponTier && gear.weaponTier.label==="LEGEND") ? 7 : 0);
        ctx.fillStyle = bladeGrad;
        ctx.beginPath();
        ctx.moveTo(-2.3, 10.5);
        ctx.lineTo(-3.2, 3.5);
        ctx.lineTo(-2.4, -8);
        ctx.lineTo(0, -28);
        ctx.lineTo(2.4, -8);
        ctx.lineTo(3.2, 3.5);
        ctx.lineTo(2.3, 10.5);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.moveTo(0, -30); ctx.lineTo(0, 5);
        ctx.stroke();
        const guardGrad = ctx.createLinearGradient(-9, 0, 9, 0);
        guardGrad.addColorStop(0, shade(gear.weaponColor, -28));
        guardGrad.addColorStop(0.5, weaponGlow);
        guardGrad.addColorStop(1, shade(gear.weaponColor, -28));
        ctx.shadowBlur = 8;
        ctx.fillStyle = guardGrad;
        roundRect(-7, 5.5, 14, 4, 2.2); ctx.fill();
        ctx.fillStyle = shade(gear.weaponColor, -18);
        roundRect(-2.4, 8.5, 4.8, 9.2, 2.6); ctx.fill();
        const plus = gear.weaponPlus || 0;
        const spark = 0.35 + 0.45 * Math.sin(performance.now()/170);
        for (let i = 0; i < Math.max(2, plus); i++) {
          const ang = performance.now()/240 + i * (Math.PI*2/Math.max(2, plus));
          const px = Math.cos(ang) * (8 + plus * 0.9);
          const py = Math.sin(ang) * (15 + plus * 0.6) - 12;
          ctx.fillStyle = (gear.weaponTier?.flame || weaponGlow) + "cc";
          ctx.beginPath(); ctx.arc(px, py, 1.4 + (plus>6?0.8:0), 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255,0.98)";
        ctx.beginPath(); ctx.arc(0, -27, 1.8 + spark, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(2.8, -15, 1.0 + spark*0.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-2.2, -7, 0.9 + spark*0.35, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      if (isHero && gear && gear.shieldColor) {
        ctx.save();
        ctx.translate(-22, -1);
        ctx.rotate(-0.20);
        const shieldGrad = ctx.createLinearGradient(0, -24, 0, 24);
        shieldGrad.addColorStop(0, "#f8fafc");
        shieldGrad.addColorStop(0.20, gear.shieldTier?.color || "#e2e8f0");
        shieldGrad.addColorStop(0.56, "#94a3b8");
        shieldGrad.addColorStop(0.72, gear.shieldColor);
        ctx.shadowColor = gear.shieldTier ? gear.shieldTier.glow : gear.shieldColor;
        ctx.shadowBlur = 20;
        shieldGrad.addColorStop(1, "#020617");
        ctx.fillStyle = shieldGrad;
        ctx.beginPath();
        ctx.moveTo(0, -24); ctx.lineTo(17, -14); ctx.lineTo(14, 10); ctx.lineTo(0, 24); ctx.lineTo(-14, 10); ctx.lineTo(-17, -14); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(96,165,250,0.72)";
        ctx.lineWidth = 2.6; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.82)";
        roundRect(-1.3, -15, 2.6, 28, 1.3); ctx.fill();
        roundRect(-9, -1.5, 18, 3, 1.3); ctx.fill();
        for (let i = 0; i < 3 + (gear.shieldTier?.horn || 0); i++) {
          const ang = performance.now()/380 + i * 2.09;
          const px = Math.cos(ang) * (11 + i*1.5);
          const py = Math.sin(ang) * (14 + i*1.5);
          ctx.fillStyle = (gear.shieldTier?.flame || gear.shieldColor) + 'cc';
          ctx.beginPath(); ctx.arc(px, py, i % 2 ? 1.6 : 2.1, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
      }

      ctx.fillStyle = pal.skin || "#ffd7b5";
      roundRect(-12, -34, 24, 18, 8);
      ctx.fill();

      if (isHero) {
        const helmColor = "#05070c";
        const helmGrad = ctx.createLinearGradient(0, -58, 0, -18);
        helmGrad.addColorStop(0, "#4b5563");
        helmGrad.addColorStop(0.32, helmColor);
        helmGrad.addColorStop(1, "#000000");
        ctx.save();
        for (let i = 0; i < 4; i++) {
          const flameA = 0.14 - i * 0.025;
          ctx.globalAlpha = flameA;
          ctx.fillStyle = i % 2 ? "#111827" : "#000000";
          ctx.beginPath();
          ctx.moveTo(-10 - i, -28); ctx.quadraticCurveTo(-18 - i, -44 - i * 2, -9, -54 - i * 3);
          ctx.quadraticCurveTo(-3, -45, -4, -32); ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(10 + i, -28); ctx.quadraticCurveTo(18 + i, -44 - i * 2, 9, -54 - i * 3);
          ctx.quadraticCurveTo(3, -45, 4, -32); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = "#020617";
        ctx.beginPath();
        ctx.moveTo(-18,-28); ctx.lineTo(-14,-46); ctx.lineTo(-7,-56); ctx.lineTo(-2,-50); ctx.lineTo(0,-58); ctx.lineTo(2,-50); ctx.lineTo(7,-56); ctx.lineTo(14,-46); ctx.lineTo(18,-28); ctx.lineTo(13,-14); ctx.lineTo(7,-9); ctx.lineTo(5,-23); ctx.lineTo(-5,-23); ctx.lineTo(-7,-9); ctx.lineTo(-13,-14); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = helmGrad;
        ctx.beginPath();
        ctx.moveTo(-16,-28); ctx.quadraticCurveTo(-13,-50,0,-54); ctx.quadraticCurveTo(13,-50,16,-28); ctx.lineTo(12,-15); ctx.lineTo(6,-10); ctx.lineTo(4,-21); ctx.lineTo(-4,-21); ctx.lineTo(-6,-10); ctx.lineTo(-12,-15); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#111827";
        roundRect(-12, -28, 24, 7, 4); ctx.fill();
        ctx.fillStyle = gear?.hatTier?.color || "#60a5fa";
        roundRect(-3,-48,6,10,3); ctx.fill();
        ctx.fillStyle = gear?.hatTier?.color || "#60a5fa";
        roundRect(-9, -29, 18, 4, 2); ctx.fill();
        const hornLevel = gear?.hatTier?.horn || 0;
        if (hornLevel > 0) {
          ctx.fillStyle = gear?.hatTier?.color || "#60a5fa";
          ctx.shadowColor = gear?.hatTier?.glow || "#60a5fa";
          ctx.shadowBlur = 18;
          ctx.beginPath(); ctx.moveTo(-12,-36); ctx.lineTo(-20,-52); ctx.lineTo(-9,-45); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(12,-36); ctx.lineTo(20,-52); ctx.lineTo(9,-45); ctx.closePath(); ctx.fill();
          if (hornLevel > 1) { ctx.beginPath(); ctx.moveTo(-4,-50); ctx.lineTo(0,-62); ctx.lineTo(4,-50); ctx.closePath(); ctx.fill(); }
        }
        ctx.fillStyle = "rgba(255,255,255,0.20)";
        roundRect(-10,-42,20,4,2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        roundRect(-7,-45,14,4,2); ctx.fill();
      } else {
        ctx.fillStyle = pal.hair || "#1f2937";
        roundRect(-14, -38, 28, 10, 7);
        ctx.fill();
        ctx.fillStyle = pal.hat || "#ffcc00";
        roundRect(-10, -45, 20, 8, 5);
        ctx.fill();
      }

      ctx.fillStyle = "#111827";
      ctx.beginPath(); ctx.arc(-4, -24, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, -24, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.8;
      ctx.fillRect(-4, -20, 8, 1.3);
      ctx.globalAlpha = 1;
      if (isHero) drawGearEffect(0, -8);
      ctx.restore();
    }


    function seedSlimes(rng) {
      combatState.slimes.length = 0;
      const spots = [
        { x: ZONES.game.x + 420, y: ZONES.game.y + ZONES.game.h + 210 },
        { x: ZONES.game.x + ZONES.game.w - 420, y: ZONES.game.y + ZONES.game.h + 250 },
        { x: ZONES.community.x + 420, y: ZONES.community.y + ZONES.community.h + 210 },
        { x: ZONES.community.x + ZONES.community.w - 420, y: ZONES.community.y + ZONES.community.h + 250 },
        { x: ZONES.ads.x + 520, y: ZONES.ads.y + ZONES.ads.h + 210 }
      ];
      const variants = [
        { key:"green", colors:["#93f5b0","#22c55e"], reward:1 },
        { key:"yellow", colors:["#fde68a","#f59e0b"], reward:2 },
        { key:"purple", colors:["#d8b4fe","#8b5cf6"], reward:2 }
      ];
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i];
        for (let v = 0; v < variants.length; v++) {
          const vv = variants[v];
          combatState.slimes.push({
            x: s.x + (rng() - 0.5) * 40 + (v - 1) * 28,
            y: s.y + (rng() - 0.5) * 30 + (v - 1) * 14,
            hp: 2 + v,
            maxHp: 2 + v,
            reward: vv.reward,
            variant: vv.key,
            colors: vv.colors,
            dead: false,
            wobble: rng() * 10,
            respawn: 0,
            vx: (rng() < 0.5 ? -1 : 1) * (32 + rng() * 26),
            vy: (rng() < 0.5 ? -1 : 1) * (18 + rng() * 20),
            turnT: 1.3 + rng() * 2.2
          });
        }
      }
    }

    function seedTitans(rng) {
      combatState.titans.length = 0;
      const spawnBands = [
        { x0: ART_BOUNDS.village.x + 420, x1: ART_BOUNDS.village.x + ART_BOUNDS.village.w * 0.45, y0: ART_BOUNDS.village.y + 420, y1: ART_BOUNDS.village.y + ART_BOUNDS.village.h * 0.58 },
        { x0: ART_BOUNDS.village.x + ART_BOUNDS.village.w * 0.52, x1: ART_BOUNDS.village.x + ART_BOUNDS.village.w - 460, y0: ART_BOUNDS.village.y + 420, y1: ART_BOUNDS.village.y + ART_BOUNDS.village.h * 0.70 },
        { x0: ART_BOUNDS.village.x + 480, x1: ART_BOUNDS.village.x + ART_BOUNDS.village.w - 520, y0: ART_BOUNDS.village.y + ART_BOUNDS.village.h * 0.46, y1: ART_BOUNDS.village.y + ART_BOUNDS.village.h - 420 }
      ];
      const pickSpot = (i) => {
        const s = spawnBands[i % spawnBands.length];
        return { x: s.x0 + rng() * (s.x1 - s.x0), y: s.y0 + rng() * (s.y1 - s.y0) };
      };
      const bruteSpot = pickSpot(0);
      const colossusSpot = pickSpot(2);
      const defs = [
        { key: "brute", label: "MECHA BRUTE", scale: 40, maxHp: 900, reward: 15, x: bruteSpot.x, y: bruteSpot.y, speed: 18 },
        { key: "colossus", label: "ANCIENT DRAGON", scale: 120, maxHp: 4200, reward: 60, x: colossusSpot.x, y: colossusSpot.y, speed: 8 }
      ];
      for (const d of defs) {
        combatState.titans.push({
          ...d,
          homeX: d.x,
          homeY: d.y,
          hp: d.maxHp,
          dead: false,
          respawn: 0,
          wobble: rng() * 10,
          vx: (rng() < 0.5 ? -1 : 1) * d.speed,
          vy: (rng() < 0.5 ? -1 : 1) * d.speed * 0.45,
          turnT: 2.6 + rng() * 2.8,
          hitFlash: 0
        });
      }
    }

    function drawMonsterHpBar(m, width) {
      const ratio = clamp(m.hp / m.maxHp, 0, 1);
      ctx.save();
      ctx.translate(m.x, m.y - 20 - width * 0.08);
      ctx.fillStyle = "rgba(2,6,23,0.68)";
      roundRect(-width * 0.5, 0, width, 10, 6);
      ctx.fill();
      const grad = ctx.createLinearGradient(-width * 0.5, 0, width * 0.5, 0);
      grad.addColorStop(0, "#ef4444");
      grad.addColorStop(0.55, "#f59e0b");
      grad.addColorStop(1, "#22c55e");
      ctx.fillStyle = grad;
      roundRect(-width * 0.5 + 1.5, 1.5, (width - 3) * ratio, 7, 5);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "900 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.max(0, Math.ceil(m.hp))} / ${m.maxHp}`, 0, -4);
      ctx.restore();
    }

    function drawTitan(m, t) {
      if (m.dead) return;
      if (m.key === "colossus") {
        const s = m.scale;
        const bob = Math.sin(t * 1.6 + m.wobble) * 6;
        const wingFlap = Math.sin(t * 2.4 + m.wobble) * 0.12;
        ctx.save();
        ctx.translate(m.x, m.y + bob);
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "rgba(10,14,24,0.82)";
        ctx.beginPath();
        ctx.ellipse(0, s * 1.3, s * 1.26, s * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowColor = m.hitFlash > 0 ? "rgba(255,245,245,0.95)" : "rgba(239,68,68,0.48)";
        ctx.shadowBlur = 22;
        const bodyGrad = ctx.createLinearGradient(0, -s * 1.85, 0, s * 1.15);
        bodyGrad.addColorStop(0, m.hitFlash > 0 ? "#fff1f2" : "#7f1d1d");
        bodyGrad.addColorStop(0.28, m.hitFlash > 0 ? "#fecdd3" : "#b91c1c");
        bodyGrad.addColorStop(0.7, "#3f0b12");
        bodyGrad.addColorStop(1, "#111827");
        ctx.fillStyle = bodyGrad;

        // wings
        ctx.save();
        ctx.rotate(-0.08 + wingFlap);
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.52);
        ctx.quadraticCurveTo(-s * 1.35, -s * 1.55, -s * 2.05, -s * 0.22);
        ctx.quadraticCurveTo(-s * 1.5, -s * 0.1, -s * 0.88, s * 0.26);
        ctx.quadraticCurveTo(-s * 0.54, s * 0.02, -s * 0.1, -s * 0.32);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.rotate(0.08 - wingFlap);
        ctx.beginPath();
        ctx.moveTo(s * 0.1, -s * 0.52);
        ctx.quadraticCurveTo(s * 1.35, -s * 1.55, s * 2.05, -s * 0.22);
        ctx.quadraticCurveTo(s * 1.5, -s * 0.1, s * 0.88, s * 0.26);
        ctx.quadraticCurveTo(s * 0.54, s * 0.02, s * 0.1, -s * 0.32);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // tail
        ctx.strokeStyle = "rgba(127,29,29,0.96)";
        ctx.lineWidth = Math.max(10, s * 0.12);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, s * 0.58);
        ctx.quadraticCurveTo(s * 0.82, s * 0.98, s * 1.48, s * 1.32);
        ctx.quadraticCurveTo(s * 1.72, s * 1.44, s * 1.58, s * 1.62);
        ctx.stroke();

        // body / chest
        roundRect(-s * 0.6, -s * 0.96, s * 1.2, s * 1.5, s * 0.24); ctx.fill();
        ctx.fillStyle = "rgba(255,245,245,0.16)";
        roundRect(-s * 0.28, -s * 0.18, s * 0.56, s * 0.44, s * 0.12); ctx.fill();
        ctx.fillStyle = "rgba(248,113,113,0.95)";
        roundRect(-s * 0.2, -s * 0.44, s * 0.4, s * 0.12, s * 0.06); ctx.fill();
        ctx.fillStyle = bodyGrad;

        // neck/head
        roundRect(-s * 0.24, -s * 1.44, s * 0.48, s * 0.64, s * 0.16); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.28, -s * 1.22);
        ctx.lineTo(-s * 0.16, -s * 1.68);
        ctx.lineTo(-s * 0.04, -s * 1.18);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(s * 0.28, -s * 1.22);
        ctx.lineTo(s * 0.16, -s * 1.68);
        ctx.lineTo(s * 0.04, -s * 1.18);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-s * 0.14, -s * 0.82);
        ctx.lineTo(0, -s * 0.62);
        ctx.lineTo(s * 0.14, -s * 0.82);
        ctx.closePath(); ctx.fill();

        // jaw / snout
        ctx.beginPath();
        ctx.moveTo(-s * 0.18, -s * 0.92);
        ctx.quadraticCurveTo(0, -s * 0.7, s * 0.18, -s * 0.92);
        ctx.lineTo(s * 0.12, -s * 0.68);
        ctx.lineTo(-s * 0.12, -s * 0.68);
        ctx.closePath(); ctx.fill();

        // limbs
        roundRect(-s * 0.5, s * 0.36, s * 0.22, s * 0.78, s * 0.08); ctx.fill();
        roundRect(s * 0.28, s * 0.36, s * 0.22, s * 0.78, s * 0.08); ctx.fill();
        roundRect(-s * 1.0, -s * 0.24, s * 0.18, s * 0.86, s * 0.06); ctx.fill();
        roundRect(s * 0.82, -s * 0.24, s * 0.18, s * 0.86, s * 0.06); ctx.fill();

        // claws
        ctx.fillStyle = "rgba(255,233,233,0.94)";
        [[-s * 0.45, s * 1.1], [-s * 0.34, s * 1.12], [s * 0.35, s * 1.1], [s * 0.46, s * 1.12]].forEach(([cx, cy]) => {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (cx < 0 ? -s * 0.06 : s * 0.06), cy + s * 0.1);
          ctx.lineTo(cx + (cx < 0 ? s * 0.02 : -s * 0.02), cy + s * 0.02);
          ctx.closePath();
          ctx.fill();
        });

        // eyes / core
        ctx.fillStyle = "rgba(251,191,36,0.98)";
        ctx.beginPath(); ctx.arc(-s * 0.11, -s * 1.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.11, -s * 1.12, s * 0.06, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath(); ctx.arc(-s * 0.095, -s * 1.14, s * 0.02, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s * 0.095, -s * 1.14, s * 0.02, 0, Math.PI * 2); ctx.fill();

        // flame breath particles
        const flamePulse = 0.55 + 0.45 * Math.sin(t * 8);
        for (let i = 0; i < 6; i++) {
          const fx = -s * 0.04 + i * s * 0.06;
          const fy = -s * 0.62 - i * s * 0.045;
          ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.88)" : `rgba(251,146,60,${0.28 + flamePulse * 0.34})`;
          ctx.beginPath();
          ctx.arc(fx, fy, s * (0.03 + i * 0.005), 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.font = `900 ${Math.max(14, s * 0.12)}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText("ANCIENT DRAGON", 0, -s * 1.84);
        if (m.burnT > 0) {
          for (let i = 0; i < 6; i++) {
            const fy = -s * 1.2 + i * s * 0.16;
            ctx.fillStyle = i % 2 ? "rgba(255,245,245,0.72)" : `rgba(249,115,22,${0.22 + i * 0.08})`;
            ctx.beginPath();
            ctx.ellipse((i % 2 ? -1 : 1) * s * 0.12, fy, s * 0.10, s * 0.18, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
        drawMonsterHpBar(m, s * 1.72);
        return;
      }
      if (m.dead) return;
      const s = m.scale;
      const bob = Math.sin(t * 2 + m.wobble) * (s > 20 ? 4 : 2);
      ctx.save();
      ctx.translate(m.x, m.y + bob);
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = "rgba(10,14,24,0.82)";
      ctx.beginPath();
      ctx.ellipse(0, s * 2.1, s * 1.45, s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const flash = m.hitFlash > 0 ? 0.45 + m.hitFlash * 0.35 : 0;
      const bodyGrad = ctx.createLinearGradient(0, -s * 2.2, 0, s * 1.8);
      bodyGrad.addColorStop(0, flash ? "#e5e7eb" : "#334155");
      bodyGrad.addColorStop(0.5, flash ? "#94a3b8" : "#0f172a");
      bodyGrad.addColorStop(1, "#020617");
      ctx.fillStyle = bodyGrad;
      roundRect(-s * 0.8, -s * 1.8, s * 1.6, s * 2.5, Math.max(18, s * 0.25));
      ctx.fill();
      ctx.strokeStyle = flash ? "rgba(248,250,252,0.95)" : "rgba(148,163,184,0.42)";
      ctx.lineWidth = Math.max(2, s * 0.05);
      roundRect(-s * 0.8, -s * 1.8, s * 1.6, s * 2.5, Math.max(18, s * 0.25));
      ctx.stroke();
      ctx.fillStyle = "rgba(59,130,246,0.95)";
      ctx.fillRect(-s * 0.34, -s * 1.18, s * 0.68, s * 0.16);
      ctx.fillStyle = "rgba(34,211,238,0.88)";
      ctx.fillRect(-s * 0.12, -s * 0.72, s * 0.24, s * 0.38);
      ctx.fillStyle = "#0f172a";
      roundRect(-s * 0.48, s * 0.72, s * 0.36, s * 1.15, s * 0.14); ctx.fill();
      roundRect(s * 0.12, s * 0.72, s * 0.36, s * 1.15, s * 0.14); ctx.fill();
      roundRect(-s * 1.06, -s * 1.05, s * 0.28, s * 1.5, s * 0.12); ctx.fill();
      roundRect(s * 0.78, -s * 1.05, s * 0.28, s * 1.5, s * 0.12); ctx.fill();
      ctx.fillStyle = "rgba(239,68,68,0.95)";
      ctx.beginPath(); ctx.arc(0, -s * 1.42, s * 0.18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font = `900 ${Math.max(10, s * 0.16)}px system-ui`;
      ctx.textAlign = "center";
      ctx.fillText(m.label, 0, -s * 2.12);
      if (m.burnT > 0) {
        for (let i = 0; i < 5; i++) {
          const fy = -s * 1.25 + i * s * 0.22;
          ctx.fillStyle = i % 2 ? "rgba(255,245,245,0.72)" : `rgba(249,115,22,${0.18 + i * 0.08})`;
          ctx.beginPath();
          ctx.ellipse((i % 2 ? -1 : 1) * s * 0.10, fy, s * 0.08, s * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      drawMonsterHpBar(m, s * 1.4);
    }

    function drawSlime(m, t) {
      if (m.dead) return;
      const squish = 1 + Math.sin(t * 5 + m.wobble) * 0.06;
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "rgba(10,14,24,0.6)";
      ctx.beginPath(); ctx.ellipse(0, 18, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, -18, 0, 18);
      const slimeTop = (m.colors && m.colors[0]) || '#93f5b0';
      const slimeBot = (m.colors && m.colors[1]) || '#22c55e';
      g.addColorStop(0, slimeTop); g.addColorStop(1, slimeBot);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-18, 12);
      ctx.quadraticCurveTo(-16, -10, 0, -16 * squish);
      ctx.quadraticCurveTo(16, -10, 18, 12);
      ctx.quadraticCurveTo(10, 18, 0, 20);
      ctx.quadraticCurveTo(-10, 18, -18, 12);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.ellipse(-5, -4, 5, 3, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111827';
      ctx.beginPath(); ctx.arc(-5, 2, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, 2, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-4, 8, 8, 1.4);
      ctx.restore();
    }

    function getFootY(entity) {
      if (entity.kind === "building") return entity.y + entity.h;
      if (entity.kind === "car") return entity.axis === "h" ? entity.y + entity.h / 2 : entity.y + entity.h / 2;
      if (entity.kind === "tree") return entity.y + 64 * entity.s;
      if (entity.kind === "lamp") return entity.y + 68 * entity.s;
      if (entity.kind === "bench") return entity.y + 32 * entity.s;
      if (entity.kind === "flower") return entity.y + 12 * entity.s;
      if (entity.kind === "npc") return entity.y + 30;
      if (entity.kind === "emblem") return entity.y + 12;
      if (entity.kind === "signal") return entity.y + 40;
      if (entity.kind === "roamer") return entity.y + 30;
      if (entity.kind === "player") return entity.y + 28;
      if (entity.kind === "slime") return entity.y + 18;
      if (entity.kind === "titan") return entity.y + entity.scale * 2.2;
      return entity.y;
    }

    function updateCamera(dt) {
      cam.targetX = clamp(player.x - VIEW.w * 0.5, 0, Math.max(0, WORLD.w - VIEW.w));
      cam.targetY = clamp(player.y - VIEW.h * 0.56, 0, Math.max(0, WORLD.h - VIEW.h));
      cam.x = lerp(cam.x, cam.targetX, Math.min(1, dt * 8.0));
      cam.y = lerp(cam.y, cam.targetY, Math.min(1, dt * 8.0));
    }

    /* ----------------------- Update / draw loop ----------------------- */
    let lastT = performance.now();
    let acc = 0, framesCount = 0;
    let lastMobileZoneKey = "";
    let touchTapAt = 0;
    let portalSuppressUntil = 0;
    let startupOverlayOpen = true;

    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "s") {
        e.preventDefault();
        saveNowToast();
      }
    });

    function update(dt, t, rng) {
      if (startupOverlayOpen) {
        const overlayCheck = document.getElementById("startup_overlay");
        if (overlayCheck) return [];
        startupOverlayOpen = false;
      }
      let ax = 0, ay = 0;

      if (!dragging && !modalState.open && !entering) {
        if (keys.has("a") || keys.has("arrowleft")) ax -= 1;
        if (keys.has("d") || keys.has("arrowright")) ax += 1;
        if (keys.has("w") || keys.has("arrowup")) ay -= 1;
        if (keys.has("s") || keys.has("arrowdown")) ay += 1;

        if (isTouchDevice()) {
          ax += UI.joyState.ax;
          ay += UI.joyState.ay;
          const len = Math.hypot(ax, ay);
          if (len > 1) {
            ax /= len;
            ay /= len;
          }
        }

        const moving = ax !== 0 || ay !== 0;
        player.moving = moving;

        if (moving) {
          const len = Math.hypot(ax, ay) || 1;
          const hasteMul = performance.now() < combatState.hasteUntil ? 4 : 1;
          const vx = (ax / len) * player.speed * hasteMul * dt;
          const vy = (ay / len) * player.speed * hasteMul * dt;
          player.x += vx;
          player.y += vy;
          clampPlayerToWorld();
          updateDirFromDelta(vx, vy);
          player.animT += dt;
          player.bobT += dt * 10;
          player.walkPhase += dt * 11.0;
        }
      }

      if (window.__metaWorldAttackTap) {
        triggerAttack();
        window.__metaWorldAttackTap = 0;
      }

      if (!player.moving) player.walkPhase += dt * 2.4;
      if (player.gearFlashT > 0) player.gearFlashT = Math.max(0, player.gearFlashT - dt);
      if (combatState.attackT > 0) {
        combatState.attackT = Math.max(0, combatState.attackT - dt);
      }

      addFootprint(dt, rng);
      for (let i = footprints.length - 1; i >= 0; i--) {
        const fp = footprints[i];
        fp.age += dt;
        if (fp.age >= fp.life) footprints.splice(i, 1);
      }

      for (const c of cars) {
        c.bob += dt * 3.0;
        const road = roads.find((r) => r._id === c.roadId);
        if (!road) continue;
        if (!isInVillage(road.x + road.w * 0.5, road.y + road.h * 0.5, 0)) continue;
        if (c.axis === "h") {
          c.x += c.dir * c.speed * dt;
          if (c.dir > 0 && c.x - c.w / 2 > road.x + road.w + 40) c.x = road.x - 40;
          if (c.dir < 0 && c.x + c.w / 2 < road.x - 40) c.x = road.x + road.w + 40;
        } else {
          c.y += c.dir * c.speed * dt;
          if (c.dir > 0 && c.y - c.h / 2 > road.y + road.h + 40) c.y = road.y - 40;
          if (c.dir < 0 && c.y + c.h / 2 < road.y - 40) c.y = road.y + road.h + 40;
        }
      }
            for (const c of clouds) {
        c.x += c.v * dt * (c.layer === 0 ? 1.0 : 0.72);
        if (c.x > WORLD.w + 220) c.x = -220;
      }
      for (const b of birds) {
        b.x += b.v * dt;
        b.p += dt * 6;
        if (b.x > WORLD.w + 120) b.x = -120;
      }

      const roamerPalette = stepRoamers(dt, rng);

      for (const m of combatState.slimes) {
        if (m.dead) {
          m.respawn -= dt;
          if (m.respawn <= 0) {
            m.dead = false; m.hp = m.maxHp || 2;
            m.turnT = 1.1 + rng() * 1.8;
            m.vx = (rng() < 0.5 ? -1 : 1) * (28 + rng() * 24);
            m.vy = (rng() < 0.5 ? -1 : 1) * (14 + rng() * 16);
          }
          continue;
        }
        m.wobble += dt * 3;
        m.turnT -= dt;
        if (m.turnT <= 0) {
          m.turnT = 1.0 + rng() * 2.0;
          m.vx = (rng() < 0.5 ? -1 : 1) * (28 + rng() * 28);
          m.vy = (rng() < 0.5 ? -1 : 1) * (14 + rng() * 18);
        }
        if (Math.hypot(player.x - m.x, player.y - m.y) < 170) {
          const dx = player.x - m.x, dy = player.y - m.y;
          const len = Math.hypot(dx, dy) || 1;
          m.vx += (dx / len) * dt * 20;
          m.vy += (dy / len) * dt * 20;
        }
        const sp = Math.hypot(m.vx, m.vy) || 1;
        const maxSp = 54;
        if (sp > maxSp) { m.vx = m.vx / sp * maxSp; m.vy = m.vy / sp * maxSp; }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const minX = 80, maxX = WORLD.w - 80, minY = ART_BOUNDS.village.y + ART_BOUNDS.village.h * 0.36, maxY = WORLD.h - 120;
        if (m.x < minX || m.x > maxX) { m.vx *= -1; m.x = clamp(m.x, minX, maxX); }
        if (m.y < minY || m.y > maxY) { m.vy *= -1; m.y = clamp(m.y, minY, maxY); }
      }
      for (const m of combatState.titans) {
        if (m.dead) {
          m.respawn -= dt;
          if (m.respawn <= 0) {
            m.dead = false;
            m.hp = m.maxHp;
            m.hitFlash = 0;
            m.turnT = 2.2 + rng() * 2.4;
          }
          continue;
        }
        m.wobble += dt * 1.2;
        if (m.hitFlash > 0) m.hitFlash = Math.max(0, m.hitFlash - dt * 2.4);
        m.turnT -= dt;
        if (m.turnT <= 0) {
          m.turnT = 2.0 + rng() * 3.0;
          m.vx = (rng() < 0.5 ? -1 : 1) * m.speed;
          m.vy = (rng() < 0.5 ? -1 : 1) * m.speed * 0.45;
        }
        const dx = player.x - m.x, dy = player.y - m.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < 340) {
          m.vx += (dx / dist) * dt * (m.key === "colossus" ? 10 : 14);
          m.vy += (dy / dist) * dt * (m.key === "colossus" ? 8 : 10);
        }
        const sp = Math.hypot(m.vx, m.vy) || 1;
        const maxSp = m.speed;
        if (sp > maxSp) { m.vx = m.vx / sp * maxSp; m.vy = m.vy / sp * maxSp; }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const minX = 150, maxX = WORLD.w - 150, minY = ART_BOUNDS.village.y + ART_BOUNDS.village.h * 0.36, maxY = WORLD.h - 140;
        if (m.x < minX || m.x > maxX) { m.vx *= -1; m.x = clamp(m.x, minX, maxX); }
        if (m.y < minY || m.y > maxY) { m.vy *= -1; m.y = clamp(m.y, minY, maxY); }
      }
      if (combatState.attackT > 0.14 && combatState.canAttack) {
        combatState.canAttack = false;
        const range = 96;
        let fxX = player.x, fxY = player.y;
        if (player.dir === 'left') fxX -= 36;
        else if (player.dir === 'right') fxX += 36;
        else if (player.dir === 'up') fxY -= 32;
        else fxY += 18;
        combatState.combo = combatState.combo || 0;
        combatState.comboT = combatState.comboT || 0;
        combatState.combo = Math.min(3, combatState.combo + 1);
        combatState.comboT = 1.1;
        const baseDamage = playerAttackPower();
        const comboBonus = 1 + (combatState.combo - 1) * 0.22;
        const critChance = 0.14 + getEnhanceLevel("weapon") * 0.015;
        combatState.slashFx.push({ x: fxX, y: fxY, dir: player.dir, life: 0.28, combo: combatState.combo, color: getEquippedVisuals().weaponTier?.glow || getEquippedVisuals().weaponColor || "#ffffff" });
        for (const m of combatState.slimes) {
          if (m.dead) continue;
          if (Math.hypot(m.x - fxX, m.y - fxY) < range) {
            const crit = Math.random() < critChance;
            const damage = Math.max(1, Math.round(baseDamage * comboBonus * (crit ? 1.85 : 1)));
            m.hp -= damage;
            spawnDamageText(m.x, m.y - 18, `${crit ? "CRIT " : ""}-${damage}`, crit ? "#facc15" : "#fca5a5", crit ? 1.6 : 1.35);
            if (m.hp <= 0) {
              m.dead = true;
              m.respawn = 7;
              combatState.stars += 1;
              spawnDamageText(m.x, m.y - 34, "+1 STAR", "#fde68a", 1.2);
              renderPanels();
            }
          }
        }
        for (const m of combatState.titans) {
          if (m.dead) continue;
          const hitR = m.scale * 1.2;
          if (Math.hypot(m.x - fxX, m.y - fxY) < range + hitR) {
            const crit = Math.random() < critChance * 0.85;
            const bossDamage = Math.max(2, Math.round(baseDamage * 0.9 * comboBonus * (crit ? 1.7 : 1)));
            m.hp -= bossDamage;
            m.hitFlash = 0.8;
            m.vx += (m.x - player.x) * 0.08;
            m.vy += (m.y - player.y) * 0.05;
            spawnDamageText(m.x, m.y - m.scale * 1.9, `${crit ? "CRIT " : ""}-${bossDamage}`, crit ? "#facc15" : "#fda4af", crit ? 1.7 : 1.45);
            if (m.hp <= 0) {
              m.dead = true;
              m.respawn = 18;
              combatState.stars += m.reward;
              spawnDamageText(m.x, m.y - m.scale * 2.1, `+${m.reward} STAR`, "#fde68a", 1.35);
              renderPanels();
            }
          }
        }
      }
      if (combatState.attackT <= 0) combatState.canAttack = true;
      if (combatState.comboT) { combatState.comboT = Math.max(0, combatState.comboT - dt); if (combatState.comboT <= 0) combatState.combo = 0; }
      for (let i = combatState.slashFx.length - 1; i >= 0; i--) {
        combatState.slashFx[i].life -= dt;
        if (combatState.slashFx[i].life <= 0) combatState.slashFx.splice(i, 1);
      }
      for (let i = combatState.damageTexts.length - 1; i >= 0; i--) {
        const d = combatState.damageTexts[i];
        d.life -= dt;
        d.y += d.vy * dt;
        if (d.life <= 0) combatState.damageTexts.splice(i, 1);
      }
      for (let i = combatState.fireballs.length - 1; i >= 0; i--) {
        const f = combatState.fireballs[i];
        f.life -= dt;
        const liveTargets = [...combatState.slimes, ...combatState.titans].filter((m) => !m.dead);
        let lock = liveTargets.find((m) => m.id === f.targetId) || null;
        if (!lock && liveTargets.length) {
          lock = liveTargets.reduce((best, m) => (!best || Math.hypot(m.x - f.x, m.y - f.y) < Math.hypot(best.x - f.x, best.y - f.y)) ? m : best, null);
          if (lock) f.targetId = lock.id;
        }
        if (lock) {
          const dx = lock.x - f.x, dy = lock.y - f.y;
          const len = Math.hypot(dx, dy) || 1;
          const targetVx = (dx / len) * 520;
          const targetVy = (dy / len) * 520;
          f.vx += (targetVx - f.vx) * Math.min(1, dt * 15.0);
          f.vy += (targetVy - f.vy) * Math.min(1, dt * 15.0);
        }
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        let hit = false;
        for (const m of [...combatState.slimes, ...combatState.titans]) {
          if (m.dead) continue;
          const hr = (m.scale ? m.scale * 1.1 : 22) + f.radius;
          if (Math.hypot(m.x - f.x, m.y - f.y) <= hr) {
            const crit = Math.random() < 0.2;
            const dmg = Math.round(f.damage * (crit ? 1.6 : 1));
            applyMonsterHit(m, dmg, crit);
            m.burnT = Math.max(m.burnT || 0, f.burn);
            m.burnTick = 0.33;
            combatState.fireExplosions.push({ x: f.x, y: f.y, life: 0.36, r: 18 });
            hit = true;
            break;
          }
        }
        if (!hit && f.life <= 0) combatState.fireExplosions.push({ x: f.x, y: f.y, life: 0.24, r: 14 });
        if (hit || f.life <= 0) combatState.fireballs.splice(i, 1);
      }
      for (let i = combatState.fireExplosions.length - 1; i >= 0; i--) {
        combatState.fireExplosions[i].life -= dt;
        if (combatState.fireExplosions[i].life <= 0) combatState.fireExplosions.splice(i, 1);
      }
      for (const m of [...combatState.slimes, ...combatState.titans]) {
        if (m.dead || !m.burnT) continue;
        m.burnT = Math.max(0, m.burnT - dt);
        m.burnTick = (m.burnTick || 0) - dt;
        if (m.burnTick <= 0) {
          m.burnTick = 0.33;
          const burnDamage = Math.max(1, Math.round(playerAttackPower() * 0.22));
          m.hp -= burnDamage;
          m.hitFlash = Math.max(m.hitFlash || 0, 0.45);
          spawnDamageText(m.x, m.y - (m.scale ? m.scale * 1.45 : 16), `-${burnDamage}`, "#fb923c", 0.9);
          if (m.hp <= 0) {
            m.dead = true;
            m.respawn = m.key === "slime" ? 7 : 18;
            const reward = m.reward || 1;
            combatState.stars += reward;
            spawnDamageText(m.x, m.y - (m.scale ? m.scale * 1.9 : 30), `+${reward} STAR`, "#fde68a", 1.0);
            renderPanels();
          }
        }
      }

      activePortal = null;
      let activePortalDist = Infinity;
      for (const p of getInteractiveTargets()) {
        if (circleRectHit(player.x, player.y, player.r + 8, portalEnterZone(p))) {
          const cx = p.x + p.w * 0.5;
          const cy = p.y + p.h * 0.5;
          const dist = Math.hypot(player.x - cx, player.y - cy);
          if (dist < activePortalDist) {
            activePortalDist = dist;
            activePortal = p;
          }
        }
      }

      if (!modalState.open && activePortal) {
        if (isTouchDevice()) {
          UI.toast.hidden = true;
          UI.toast.style.display = "none";
          UI.toast.innerHTML = "";
          if (UI.enterBtn) {
            UI.enterBtn.style.display = "block";
            if (activePortal.key === "blacksmith") {
              UI.enterBtn.textContent = "SHOP";
              UI.enterBtn.disabled = false;
              UI.enterBtn.style.opacity = "1";
            } else if (activePortal.status === "open" && activePortal.url) {
              UI.enterBtn.textContent = "GO IN";
              UI.enterBtn.disabled = false;
              UI.enterBtn.style.opacity = "1";
            } else {
              UI.enterBtn.textContent = "COMING SOON";
              UI.enterBtn.disabled = true;
              UI.enterBtn.style.opacity = "0.72";
            }
          }
        } else if (performance.now() >= portalSuppressUntil) {
          const hasLink = !!(activePortal && activePortal.url);
          const msg = activePortal.key === "blacksmith"
            ? `⚒ <b>${activePortal.label}</b><br/>Enter Shop?<br/><span style="font-size:12px;opacity:0.82">Enter / E</span>`
            : (hasLink
              ? `🧱 <b>${activePortal.label}</b><br/>Enter Portal?<br/><span style="font-size:12px;opacity:0.82">Enter / E</span>`
              : `🧱 <b>${activePortal.label}</b><br/>${activePortal.message || "COMING SOON"}`);
          UI.toast.hidden = false;
          UI.toast.style.display = "block";
          UI.toast.style.visibility = "visible";
          UI.toast.style.opacity = "1";
          UI.toast.style.pointerEvents = "none";
          UI.toast.style.left = "50%";
          UI.toast.style.right = "auto";
          UI.toast.style.top = "86px";
          UI.toast.style.transform = "translate(-50%, 0)";
          UI.toast.style.zIndex = "10020";
          UI.toast.innerHTML = blockSpan(msg, { bg: "linear-gradient(180deg, rgba(8,12,22,0.98), rgba(15,23,42,0.95))", fg: "#f8fafc", pad: "12px 18px", radius: "18px", border: "1px solid rgba(148,163,184,0.16)", shadow: "0 14px 30px rgba(2,6,23,0.22)" });
        }
      } else if (!modalState.open) {
        if (performance.now() >= mobileToastUntil) { UI.toast.hidden = true; UI.toast.style.display = "none"; UI.toast.style.visibility = "hidden"; UI.toast.style.opacity = "0"; UI.toast.innerHTML = ""; }
        if (UI.enterBtn) {
          UI.enterBtn.style.display = "none";
          UI.enterBtn.disabled = false;
          UI.enterBtn.textContent = "GO IN";
          UI.enterBtn.style.opacity = "1";
        }
      }

      if (isTouchDevice()) {
        if (!activePortal) lastMobileZoneKey = "";
      }

      const nowCd = performance.now();
      const cdFire = Math.max(0, (combatState.fireballCd - nowCd) / 1000);
      const cdSpeed = Math.max(0, (combatState.hasteCd - nowCd) / 1000);
      const applyCd = (btn, secs, base) => {
        if (!btn) return;
        const total = base === "FIRE" ? 3 : 12;
        const ratio = Math.max(0, Math.min(1, secs / total));
        btn.classList.toggle("cooling", secs > 0.01);
        if (!btn.dataset.basebg) btn.dataset.basebg = btn.style.background || "linear-gradient(180deg,#1d4ed8,#1e3a8a)";
        btn.style.background = secs > 0.01
          ? `linear-gradient(180deg, rgba(255,255,255,${0.08 + (1-ratio)*0.10}), rgba(255,255,255,0.02)), linear-gradient(180deg, rgba(2,6,23,${0.62 + ratio*0.22}), rgba(2,6,23,${0.28 + ratio*0.22}))`
          : btn.dataset.basebg;
        btn.style.boxShadow = secs > 0.01
          ? `inset 0 ${Math.round(42 * ratio)}px 0 rgba(255,255,255,0.10), 0 10px 20px rgba(0,0,0,0.24)`
          : "0 12px 28px rgba(0,0,0,0.18)";
        btn.style.opacity = secs > 0.01 ? String(0.68 + (1-ratio)*0.22) : "1";
        btn.innerHTML = secs > 0.01 ? `<span>${base}</span><span class="skill-cd">${secs.toFixed(secs > 9 ? 0 : 1)}</span>` : `<span>${base}</span>`;
      };
      applyCd(UI.fireBtn, cdFire, "FIRE");
      applyCd(UI.hasteBtn, cdSpeed, "SPEED");
      applyCd(UI.desktopFireBtn, cdFire, "Q FIRE");
      applyCd(UI.desktopHasteBtn, cdSpeed, "R SPEED");

      updateCamera(dt);

      UI.coord.textContent = `x:${Math.round(player.x)} y:${Math.round(player.y)}`;
      acc += dt;
      framesCount++;
      if (acc >= 0.4) {
        UI.fps.textContent = `fps:${Math.round(framesCount / acc)}`;
        acc = 0;
        framesCount = 0;
      }

      return roamerPalette;
    }

    function draw(t, roamerPalette) {
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.scale(VIEW.zoom, VIEW.zoom);
      ctx.translate(-cam.x, -cam.y);

      const usingCustomWorldArt = drawCustomWorldArt();
      if (!usingCustomWorldArt) {
        drawSkyWorld();
        drawCloudsWorld();
        drawGroundWorld();
        drawRoadsAndSidewalks();
        drawZonesWorld(t);
      }

      drawFootprints();

      const renderables = [];
      if (!usingCustomWorldArt) {
        for (const p of portals) renderables.push({ kind: "building", ref: p });
        for (const b of adBuildings) renderables.push({ kind: "adbuilding", ref: b });
        for (const pr of props) renderables.push({ kind: pr.kind, ref: pr });
        for (const sg of signals) renderables.push({ kind: "signal", ref: sg });
        for (const em of portalEmblems) renderables.push({ kind: "emblem", ref: em });
        for (const npc of portalNPCs) renderables.push({ kind: "npc", ref: npc });
      } else {
        for (const p of portals) renderables.push({ kind: "building", ref: p });
      }

      for (const c of cars) renderables.push({ kind: "car", ref: c });
      for (const r of roamers) renderables.push({ kind: "roamer", ref: r });
      for (const m of combatState.slimes) if (!m.dead) renderables.push({ kind: "slime", ref: m });
      for (const m of combatState.titans) if (!m.dead) renderables.push({ kind: "titan", ref: m });
      renderables.push({ kind: "player", ref: player });

      renderables.sort((a, b) => getFootY({ ...a.ref, kind: a.kind }) - getFootY({ ...b.ref, kind: b.kind }));

      for (const item of renderables) {
        const r = item.ref;
        switch (item.kind) {
          case "building": drawPortalBuilding(r, t); break;
          case "adbuilding": drawAdBuilding(r, t); break;
          case "car": drawCar(r); break;
          case "tree": drawTree(r); break;
          case "lamp": drawLamp(r, t); break;
          case "bench": drawBench(r); break;
          case "flower": drawFlower(r, t); break;
          case "signal": drawSignal(r, t); break;
          case "emblem": drawEmblem(r); break;
          case "npc": drawNPC(r.key, r.x, r.y); break;
          case "roamer": drawRoamer(r, roamerPalette); break;
          case "slime": drawSlime(r, t); break;
          case "titan": drawTitan(r, t); break;
          case "player":
            if (!drawSpriteCharacter(player.x, player.y)) {
              drawMinifig(player.x, player.y, { isHero: true, moving: player.moving, walkPhase: player.walkPhase });
            }
            break;
        }
      }
      for (const f of combatState.fireballs) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.shadowColor = "rgba(251,146,60,0.95)";
        ctx.shadowBlur = 24;
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, f.radius + 6);
        g.addColorStop(0, "rgba(255,255,255,0.98)");
        g.addColorStop(0.28, "rgba(254,215,170,0.98)");
        g.addColorStop(0.65, "rgba(249,115,22,0.96)");
        g.addColorStop(1, "rgba(153,27,27,0.0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, f.radius + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(-2, -2, f.radius * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      for (const ex of combatState.fireExplosions) {
        ctx.save();
        const a = Math.max(0, ex.life / 0.36);
        ctx.globalAlpha = a;
        ctx.translate(ex.x, ex.y);
        const rr = ex.r * (1 + (1-a) * 1.8);
        const eg = ctx.createRadialGradient(0, 0, 2, 0, 0, rr);
        eg.addColorStop(0, "rgba(255,255,255,0.95)");
        eg.addColorStop(0.18, "rgba(254,215,170,0.95)");
        eg.addColorStop(0.55, "rgba(249,115,22,0.78)");
        eg.addColorStop(1, "rgba(127,29,29,0)");
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,245,245,0.82)";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, rr * 0.68, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      for (const fx of combatState.slashFx) {
        ctx.save();
        const a = Math.max(0, fx.life / 0.20);
        ctx.globalAlpha = a;
        ctx.translate(fx.x, fx.y);
        const rot = fx.dir === 'left' ? Math.PI : fx.dir === 'up' ? -Math.PI/2 : fx.dir === 'down' ? Math.PI/2 : 0;
        ctx.rotate(rot);
        const fxCol = fx.color || 'rgba(147,197,253,0.92)';
        ctx.strokeStyle = 'rgba(255,255,255,0.98)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(0, 0, 24 + (fx.combo||1)*2, 0.18, 1.66);
        ctx.stroke();
        ctx.strokeStyle = fxCol;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, 31 + (fx.combo||1)*3, 0.10, 1.74);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.72)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 27 + (fx.combo||1)*2, -1.68, -0.28);
        ctx.stroke();
        ctx.restore();
      }
      for (const d of combatState.damageTexts) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, d.life / 0.9);
        ctx.translate(d.x, d.y);
        ctx.scale(d.scale || 1, d.scale || 1);
        ctx.fillStyle = d.color || "#fff";
        ctx.strokeStyle = "rgba(2,6,23,0.82)";
        ctx.lineWidth = 3;
        ctx.font = `1000 ${Math.round(48 * (d.scale || 1) / Math.max(1, (d.scale || 1)))}px system-ui`;
        ctx.textAlign = "center";
        ctx.strokeText(d.text, 0, 0);
        ctx.fillText(d.text, 0, 0);
        ctx.restore();
      }

      ctx.restore();
      drawWorldTitle();
      drawMiniMap();
    }

    function loop(now) {
      const dt = Math.min(0.033, (now - lastT) / 1000);
      lastT = now;
      const t = now / 1000;
      const rng = mulberry32(((now * 1000) | 0) ^ 0xa53c9e1);
      const roamerPalette = update(dt, t, rng);
      draw(t, roamerPalette);
      requestAnimationFrame(loop);
    }

    canvas.addEventListener("pointerdown", () => {
      if (!isTouchDevice()) return;
      // 모바일 포털 진입은 전용 GO IN 버튼으로만 처리해서 입력 멈춤을 방지한다.
      touchTapAt = performance.now();
    }, { passive: true });

    resize();
    try { openStartupOverlay(); } catch (_) { startupOverlayOpen = false; }
    for (const b of birds) {
      b.x = Math.random() * WORLD.w;
      b.y = 50 + Math.random() * 200;
    }
    requestAnimationFrame(loop);
  });
})();


// ===== v88 PATCH (zoom fix, fireball targeting, skill movement, armor off, ad images) =====
(function(){
  // Disable double-tap / pinch zoom on mobile
  try{
    const meta=document.querySelector('meta[name="viewport"]');
    if(meta){
      meta.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no');
    }
    document.addEventListener('gesturestart',e=>e.preventDefault());
    document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
    document.body.style.touchAction='manipulation';
  }catch(e){}

  // Remove persistent top hint
  const hideHint=()=>{
    document.querySelectorAll('div,span,p').forEach(el=>{
      const t=(el.textContent||'').toLowerCase().replace(/\s+/g,' ');
      if((t.includes('enter') || t.includes('/e')) && t.includes('GO IN')) { el.style.display='none'; el.style.visibility='hidden'; }
      if(t.includes('손') && t.includes('GO IN')) { el.style.display='none'; el.style.visibility='hidden'; }
      if(t.includes('안내') && t.includes('GO IN')) { el.style.display='none'; el.style.visibility='hidden'; }
    });
  };
  hideHint();
  setInterval(hideHint,400);
  try{ new MutationObserver(hideHint).observe(document.body,{childList:true,subtree:true,characterData:true}); }catch(e){}

  // Fireball smarter targeting (nearest monster)
  const getNearestMonster=(x,y)=>{
    const list=window.monsters||window.MOBS||[];
    let best=null,bd=1e9;
    for(const m of list){
      const dx=m.x-x,dy=m.y-y;
      const d=dx*dx+dy*dy;
      if(d<bd){bd=d;best=m;}
    }
    return best;
  };
  window.__patchFireballTarget=getNearestMonster;

  // Allow skills while moving
  window.allowSkillWhileMoving=true;

  // Disable armor visual
  window.disableArmorVisual=true;

  // Ad image sources (raw github)
  window.AD_YOUTUBE_SRC="https://raw.githubusercontent.com/faglobalxgp2024-design/XGP-world/main/%EA%B4%91%EA%B3%A0%20%EC%9C%A0%ED%8A%9C%EB%B8%8C%203.png";
  window.AD_INSTAGRAM_SRC="https://raw.githubusercontent.com/faglobalxgp2024-design/XGP-world/main/%EA%B4%91%EA%B3%A0%20%EC%9D%B8%EC%8A%A4%ED%83%80%202.png";
  window.AD_TIKTOK_SRC="https://raw.githubusercontent.com/faglobalxgp2024-design/XGP-world/main/%EA%B4%91%EA%B3%A0%20%ED%8B%B1%ED%86%A1%202.png";

})();


// ===== v95 PATCH (portal prompt text + ad visuals) =====
(function(){
  try {
    const forcePortalPrompt = () => {
      try {
        const t = document.getElementById('toast');
        if (!t) return;
        const html = t.innerHTML || '';
        if (html.includes('포털로 GO IN하시겠습니까?')) {
          t.innerHTML = html.replace(/포털로 GO IN하시겠습니까\?/g, 'Enter Portal?').replace(/게임 COMING SOON입니다\./g, 'COMING SOON').replace(/게임 COMING SOON입니다/g, 'COMING SOON');
        } else if (html.includes('게임 COMING SOON입니다')) {
          t.innerHTML = html.replace(/게임 COMING SOON입니다\./g, 'COMING SOON').replace(/게임 COMING SOON입니다/g, 'COMING SOON');
        }
      } catch(e){}
    };
    setInterval(forcePortalPrompt, 120);
  } catch(e) {}
})();

// ===== v90 PATCH (pc portal, mobile skills, zoom, hint hide, ads) =====
(function(){
  try {
    let meta=document.querySelector('meta[name="viewport"]');
    if(!meta){ meta=document.createElement('meta'); meta.name='viewport'; document.head.appendChild(meta); }
    meta.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
    const stop=(e)=>{ if(e.touches && e.touches.length>1) e.preventDefault(); };
    document.addEventListener('touchmove', stop, {passive:false});
    let lastTouchEnd=0;
    document.addEventListener('touchend', function(e){ const now=Date.now(); if(now-lastTouchEnd<=350) e.preventDefault(); lastTouchEnd=now; }, {passive:false});
    document.documentElement.style.touchAction='manipulation';
    document.body.style.touchAction='manipulation';
    const hideHint=(root=document)=>{
      const all=[...root.querySelectorAll('*')];
      for(const el of all){
        const t=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
        if(!t) continue;
        const cs=getComputedStyle(el);
        const top=parseFloat(cs.top||'999'); const left=parseFloat(cs.left||'999');
        const fixed=(cs.position==='fixed'||cs.position==='sticky'||cs.position==='absolute');
        if(el.id==='toast' || el.id==='lego_modal' || el.id==='lego_modal_inner' || el.closest('[data-keep-hint="1"]')) continue;
        if(fixed && top<90 && left<520 && ((t.includes('Enter')||t.includes('/E')||t.includes('손 떼면')) && t.includes('GO IN'))){
          el.style.display='none'; el.style.visibility='hidden'; el.style.opacity='0'; el.style.pointerEvents='none';
        }
      }
    };
    hideHint();
    new MutationObserver(()=>hideHint()).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true});
  } catch(e){}
})();


// ===== v98 PATCH (mobile AD zone alignment fix) =====
(function(){
  function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
  if(!isMobile()) return;

  const applyFix = ()=>{
    try{
      if(!window.adBuildings) return;
      // shift ads left and tighten spacing
      const baseX = window.adBuildings[0]?.x || 0;
      for(let i=0;i<window.adBuildings.length;i++){
        const b = window.adBuildings[i];
        b.x = baseX + i*120 - 80;   // tighter spacing + move left
        b.scale = (b.scale||1)*1.05; // slightly bigger
      }
    }catch(e){}
  };

  const loop=()=>{
    applyFix();
    requestAnimationFrame(loop);
  };
  loop();
})();



// ===== v100 PATCH (AD zone size/position tuning desktop+mobile) =====
(function(){
  function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
  const mobile = isMobile();
  const applyFix = ()=>{
    try{
      if(!window.adBuildings || !window.adBuildings.length) return;
      const n = window.adBuildings.length;
      // Keep current order; tune only size/spacing/offset.
      const sizes = mobile ? [0.82,0.82,0.82] : [0.93,0.93,0.93];
      const gap = mobile ? 98 : 112;   // tighter spacing
      const shiftX = mobile ? -170 : -18; // move further left on mobile, tiny left on desktop
      const shiftY = mobile ? 0 : 0;
      // anchor around existing center to avoid broader layout breakage
      const xs = window.adBuildings.map(b=>b.x||0);
      const ys = window.adBuildings.map(b=>b.y||0);
      const centerX = (Math.min(...xs) + Math.max(...xs)) / 2 + shiftX;
      const baseY = Math.min(...ys) + shiftY;
      const startX = centerX - gap * (n-1) / 2;
      for(let i=0;i<n;i++){
        const b = window.adBuildings[i];
        b.x = startX + i*gap;
        b.y = baseY;
        const baseScale = (typeof b.__baseScale === "number") ? b.__baseScale : ((typeof b.scale === "number" && b.scale>0) ? b.scale : 1);
        if(typeof b.__baseScale !== "number") b.__baseScale = baseScale;
        b.scale = b.__baseScale * (sizes[i] || sizes[sizes.length-1] || 1);
        // if width/height numeric, shrink them too for renderers that use dimensions directly
      }
    }catch(e){}
  };
  let rafId = 0;
  const loop = ()=>{
    applyFix();
    rafId = requestAnimationFrame(loop);
  };
  loop();
})();



// ===== v104 ENGLISH CLEANUP PATCH =====
(function(){
  function applyEnglishCleanup(){
    try{
      // Remove lingering translucent top-left legacy hint
      const candidates = Array.from(document.querySelectorAll('body > div, body > section, body > aside, body > span'));
      candidates.forEach(el=>{
        if(!el) return;
        const txt = (el.innerText || el.textContent || "").trim();
        const cs = getComputedStyle(el);
        const looksLikeHint = /Enter\/E|손 떼면 입장|입장 \(|남으면 안내가 떠요|Tab 키|gear 강화 가능|바깥 터치/.test(txt);
        const topLeft = (parseFloat(cs.left)||0) <= 40 && (parseFloat(cs.top)||0) <= 80;
        const translucent = cs.position === "fixed" && (parseFloat(cs.opacity || "1") < 1 || /rgba\(/.test(cs.backgroundColor));
        if(looksLikeHint && topLeft && translucent){
          el.style.display = "none";
          el.remove();
        }
      });

      // Normalize all button/label text to English
      const map = new Map([
        ["빼기","UNEQUIP"],
        ["강화","UPGRADE"],
        ["강화 가능","Upgrade Ready"],
        ["준비","COMING SOON"],
        ["바깥 터치 / ESC","outside tap / ESC"],
        ["닫기: 바깥 터치 / ESC","Close: outside tap / ESC"],
        ["Tab 키 - gear 강화 가능","Tab - upgrade each gear"],
      ]);

      document.querySelectorAll("button, div, span, b").forEach(el=>{
      });
    }catch(e){}
  }

  function walkTextNodes(root){
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while(walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
  }

  function replaceTextContent(root){
    const pairs = [
      [/빼기/g, "UNEQUIP"],
      [/강화 가능/g, "Upgrade Ready"],
      [/강화\s*\+?/g, "UPGRADE +"],
      [/\+10 완료/g, "MAX +10"],
      [/준비/g, "COMING SOON"],
      [/바깥 터치 \/ ESC/g, "outside tap / ESC"],
      [/닫기:\s*바깥 터치 \/ ESC/g, "Close: outside tap / ESC"],
      [/Tab 키 - gear 강화 가능/g, "Tab - upgrade each gear"],
      [/gear 강화 가능/g, "upgrade each gear"],
      [/손 떼면 입장/g, ""],
      [/Enter\/E로 입장\s*\(모바일은\s*손 떼면 입장\)\.?/g, ""],
      [/Enter\/E로 입장/g, ""],
      [/입장\s*\(모바일은\s*손 떼면 입장\)\.?/g, ""],
      [/남으면 안내가 떠요\.?/g, ""],
    ];
    walkTextNodes(root).forEach(node=>{
      let v = node.nodeValue || "";
      let nv = v;
      for(const [rx, rep] of pairs) nv = nv.replace(rx, rep);
      if(nv !== v) node.nodeValue = nv;
    });
  }

  function tick(){
    try{
      applyEnglishCleanup();
      replaceTextContent(document.body);

      // Ensure mobile enter button says GO IN and coming soon buttons say COMING SOON if any
      const enterBtn = document.getElementById("btn_enter");
      if(enterBtn && /입장|go in/i.test(enterBtn.textContent || "")) enterBtn.textContent = "GO IN";

      // Equipment/shop runtime labels
      document.querySelectorAll("button").forEach(btn=>{
        const t = (btn.textContent || "").trim();
        if(t === "빼기") btn.textContent = "UNEQUIP";
        else if(/^강화/.test(t)) btn.textContent = t.replace(/^강화/, "UPGRADE");
        else if(t === "+10 완료") btn.textContent = "MAX +10";
        else if(t === "준비") btn.textContent = "COMING SOON";
      });

      // Shop footer close hint
      document.querySelectorAll("div, span").forEach(el=>{
        const t = (el.textContent || "").trim();
        if(t === "닫기: 바깥 터치 / ESC") el.textContent = "Close: outside tap / ESC";
        if(t === "바깥 터치 / ESC") el.textContent = "outside tap / ESC";
      });
    }catch(e){}
    requestAnimationFrame(tick);
  }
  tick();
})();



/* ===== v105 final english + save feedback fix ===== */
(function(){

function fixText(){
  const map = [
    ["건물에 닿으면 안내가떠요", ""],
    ["엔터", "ENTER"],
    ["모바일은", ""],
    ["헬멧", "HELM"],
    ["보관", "STORED"],
    ["입장하시겠습니까", "GO IN ?"],
    ["GO IN 하시겠습니까", "GO IN ?"],
    ["하시겠습니까", "?"],
  ];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while(n = walker.nextNode()){
    let v = n.nodeValue;
    map.forEach(([k,r])=>{
      if(v.includes(k)) v = v.replaceAll(k,r);
    });
    n.nodeValue = v;
  }
}

function removeTopGuide(){
  document.querySelectorAll("div,span").forEach(el=>{
    const t=(el.textContent||"").trim();
    if(t.includes("건물에 닿으면") || t.includes("Enter/E")){
      el.remove();
    }
  });
}

function saveFeedback(){
  const btn=document.querySelector("button,div");
  const saveBtn=[...document.querySelectorAll("button,div")].find(e=>(e.textContent||"").trim()=="SAVE");
  if(!saveBtn) return;

  if(saveBtn.__patched) return;
  saveBtn.__patched=true;

  saveBtn.addEventListener("click",()=>{
    let toast=document.createElement("div");
    toast.innerText="Saved";
    toast.style.position="fixed";
    toast.style.top="60px";
    toast.style.left="20px";
    toast.style.padding="8px 14px";
    toast.style.background="rgba(0,0,0,0.6)";
    toast.style.color="#fff";
    toast.style.borderRadius="8px";
    toast.style.zIndex="9999";
    document.body.appendChild(toast);
    setTimeout(()=>toast.remove(),1500);
  });
}

function loop(){
  try{
    fixText();
    removeTopGuide();
    saveFeedback();
  }catch(e){}
  requestAnimationFrame(loop);
}

loop();

})();




/* ===== v106 english cleanup + centered save toast ===== */
(function(){
  function replaceTextNodes(){
    const pairs = [
      [/buy하세요/g, "BUY"],
      [/\bTab키\b/g, "TAB"],
      [/\btab키\b/g, "TAB"],
      [/탭키/g, "TAB"],
      [/장비별/g, "gear"],
      [/Tab\s*-\s*gear\s*upgrade\s*가능/g, "TAB - upgrade each gear"],
      [/Tab\s*-\s*upgrade each gear\s*가능/g, "TAB - upgrade each gear"],
      [/Tab\s*키\s*-\s*gear\s*upgrade\s*가능/g, "TAB - upgrade each gear"],
      [/Tab\s*키\s*-\s*장비별\s*upgrade\s*가능/g, "TAB - upgrade each gear"],
      [/Tab\s*키\s*-\s*장비별\s*강화\s*가능/g, "TAB - upgrade each gear"],
      [/저장되었습니다/g, "Saved"],
      [/보관중/g, "STORED"],
      [/헬멧/g, "HELM"],
      [/하시겠습니까/g, "?"],
      [/입장하시겠습니까/g, "GO IN ?"],
    ];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while((node = walker.nextNode())){
      let v = node.nodeValue || "";
      let nv = v;
      for(const [rx, rep] of pairs) nv = nv.replace(rx, rep);
      if(nv !== v) node.nodeValue = nv;
    }
  }

  function cleanSpecificEls(){
    document.querySelectorAll("div,span,b,button").forEach(el=>{
      const t = (el.textContent || "").trim();
      if(t === "저장되었습니다") el.textContent = "Saved";
      if(t.includes("buy하세요")) el.textContent = t.replaceAll("buy하세요","BUY");
      if(t.includes("Tab키") || t.includes("tab키") || t.includes("탭키") || t.includes("장비별")){
        el.textContent = "TAB - upgrade each gear";
      }
    });
  }

  function patchSaveToast(){
    const saveBtns = [...document.querySelectorAll("button,div")].filter(e => (e.textContent||"").trim() === "SAVE");
    saveBtns.forEach(saveBtn=>{
      if(saveBtn.__centerSavePatched) return;
      saveBtn.__centerSavePatched = true;
      saveBtn.addEventListener("click", ()=>{
        let toast = document.getElementById("__save_center_toast");
        if(!toast){
          toast = document.createElement("div");
          toast.id = "__save_center_toast";
          toast.style.position = "fixed";
          toast.style.left = "50%";
          toast.style.top = "50%";
          toast.style.transform = "translate(-50%, -50%)";
          toast.style.padding = "14px 22px";
          toast.style.background = "rgba(15,23,42,0.92)";
          toast.style.color = "#fff";
          toast.style.borderRadius = "16px";
          toast.style.boxShadow = "0 18px 44px rgba(0,0,0,0.28)";
          toast.style.font = "1000 16px system-ui";
          toast.style.zIndex = "999999";
          toast.style.pointerEvents = "none";
          document.body.appendChild(toast);
        }
        toast.textContent = "Saved";
        toast.style.display = "block";
        clearTimeout(window.__saveCenterToastTid);
        window.__saveCenterToastTid = setTimeout(()=>{
          if(toast) toast.style.display = "none";
        }, 1400);
      }, true);
    });
  }

  function loop(){
    try{
      replaceTextNodes();
      cleanSpecificEls();
      patchSaveToast();
    }catch(e){}
    requestAnimationFrame(loop);
  }
  loop();
})();



/* ===== v107 final english sweep ===== */
(function(){

const fixes = [
  [/I키/g, "I"],
  [/Tab 키/g, "TAB"],
  [/tab 키/g, "TAB"],
  [/goin/gi, "GO IN"],
  [/armor/g, "ARMOR"],
  [/buy /g, "BUY"],
  [/inven토리/gi, "INVENTORY"],
  [/인벤토리/g, "INVENTORY"]
];

function replaceText(){
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while(n = walker.nextNode()){
    let v = n.nodeValue || "";
    let nv = v;
    fixes.forEach(([rx,rep])=>{
      nv = nv.replace(rx,rep);
    });
    if(nv!==v) n.nodeValue = nv;
  }
}

function cleanUI(){
  document.querySelectorAll("div,span,b,button").forEach(el=>{
    const t=(el.textContent||"").trim();

    if(t.includes("I키")) el.textContent = t.replace("I키","I");
    if(t.includes("Tab 키")) el.textContent = "TAB - upgrade each gear";
    if(t.toLowerCase().includes("goin")) el.textContent = t.replace(/goin/gi,"GO IN");
    if(t.includes("armor")) el.textContent = t.replace("armor","ARMOR");
    if(t.includes("buy ")) el.textContent = t.replace("buy ","BUY");
    if(t.includes("inven토리")) el.textContent = t.replace("inven토리","INVENTORY");
  });
}

function loop(){
  try{
    replaceText();
    cleanUI();
  }catch(e){}
  requestAnimationFrame(loop);
}

loop();

})();
