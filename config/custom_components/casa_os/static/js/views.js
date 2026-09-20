/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — componentes e vistas.
 *  Cada componente devolve um nó do DOM que se atualiza sozinho: subscreve as
 *  entidades de que precisa e cancela a subscrição quando sai da página.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt, greeting } = window.UI;
  const HA = window.HA;
  const CFG = window.CASA.config;

  /** Liga um nó às entidades que lhe interessam. */
  function bind(node, match, update) {
    const run = () => update();
    const unsub = HA.subscribe((id) => {
      if (!node.isConnected && node.__mounted) {
        unsub();
        return;
      }
      if (node.isConnected) node.__mounted = true;
      if (id === "*" || match(id)) run();
    });
    run();
    return node;
  }

  const rooms = () => CFG.rooms || [];
  const allLights = () => rooms().flatMap((r) => r.lights || []);
  const allCovers = () => rooms().flatMap((r) => (r.covers || []).filter((c) => !c.includes("portao")));
  const allClimates = () => rooms().map((r) => r.climate).filter(Boolean);

  const coverTarget = (s) => {
    if (!s) return 0;
    const a = s.attributes || {};
    return a.target_position ?? a.current_position ?? (s.state === "open" ? 100 : 0);
  };

  // ───────── Luz ─────────

  /** Tira o nome da divisão do fim do nome da entidade ("Luz teto Sala" → "Luz teto"). */
  function shortName(entityId, strip) {
    const full = HA.name(entityId);
    if (!strip) return full;
    return full.replace(new RegExp(`\\s*[·-]?\\s*${strip}$`, "i"), "").trim() || full;
  }

  function lightTile(entityId, { strip = null } = {}) {
    const node = el(`<div class="tile">
      <div class="tile-top">
        <span class="tile-icon">${icon("bulb")}</span>
        <button class="switch" role="switch" aria-label="Ligar/desligar"><i></i></button>
      </div>
      <div>
        <div class="tile-name"></div>
        <div class="tile-state"></div>
      </div>
      <div class="slider" hidden><div class="slider-fill"></div><div class="slider-label"></div></div>
    </div>`);

    const sw = node.querySelector(".switch");
    const name = node.querySelector(".tile-name");
    const state = node.querySelector(".tile-state");
    const slider = node.querySelector(".slider");
    const fill = node.querySelector(".slider-fill");
    const label = node.querySelector(".slider-label");
    let dragging = false;
    let pendingBrightness = null;

    const toggle = () => {
      HA.call("light", HA.isOn(entityId) ? "turn_off" : "turn_on", entityId);
    };
    sw.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
    node.addEventListener("click", toggle);

    const pctFromX = (x) => {
      const r = slider.getBoundingClientRect();
      return Math.round(Math.min(100, Math.max(1, ((x - r.left) / r.width) * 100)));
    };
    const paintSlider = (pct) => {
      fill.style.width = `${pct}%`;
      label.textContent = `${pct}%`;
    };
    slider.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      slider.setPointerCapture(e.pointerId);
      dragging = true;
      paintSlider(pctFromX(e.clientX));
    });
    slider.addEventListener("pointermove", (e) => {
      if (dragging) paintSlider(pctFromX(e.clientX));
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      const pct = pctFromX(e.clientX);
      pendingBrightness = Date.now();
      HA.call("light", "turn_on", entityId, { brightness_pct: pct });
    };
    slider.addEventListener("pointerup", endDrag);
    slider.addEventListener("pointercancel", endDrag);
    slider.addEventListener("click", (e) => e.stopPropagation());

    return bind(node, (id) => id === entityId, () => {
      const s = HA.get(entityId);
      const on = !!s && s.state === "on";
      const unavailable = !s || s.state === "unavailable";
      const modes = (s && s.attributes.supported_color_modes) || [];
      const dimmable = modes.some((m) => m !== "onoff");
      const bri = s && s.attributes.brightness ? Math.round((s.attributes.brightness / 255) * 100) : 0;

      node.classList.toggle("on", on);
      node.classList.toggle("unavailable", unavailable);
      sw.classList.toggle("on", on);
      sw.setAttribute("aria-checked", String(on));
      name.textContent = shortName(entityId, strip);
      state.textContent = unavailable ? "Indisponível" : on ? (dimmable ? `${bri}%` : "Ligada") : "Desligada";
      slider.hidden = !(on && dimmable);
      if (!dragging && (!pendingBrightness || Date.now() - pendingBrightness > 1200)) paintSlider(bri || 1);
    });
  }

  // ───────── Estore ─────────

  const PRESETS = [
    { p: 0, label: "Fechar", ic: "close_blind" },
    { p: 50, label: "Meio", ic: "half_blind" },
    { p: 100, label: "Abrir", ic: "open_blind" },
  ];

  function blindCard(entityId, { compact = false, strip = null } = {}) {
    const node = el(`<div class="blind">
      <div class="blind-head"><span class="blind-name"></span><span class="blind-pct"></span></div>
      <div class="blind-body">
        <div class="window window-sm"><div class="sky-host"></div><div class="slats"></div></div>
        <div class="track" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100"><div class="track-fill"></div><div class="track-knob"></div></div>
      </div>
      <div class="presets">${PRESETS.map(
        (p) => `<button class="preset" data-p="${p.p}" aria-label="${p.label}">${icon(p.ic)}<span>${p.label}</span></button>`,
      ).join("")}</div>
    </div>`);

    window.UI.mountSky(node.querySelector(".sky-host"), CFG.weather);
    const slats = node.querySelector(".slats");
    const pct = node.querySelector(".blind-pct");
    const nameEl = node.querySelector(".blind-name");
    const track = node.querySelector(".track");
    const fill = node.querySelector(".track-fill");
    const knob = node.querySelector(".track-knob");
    const presets = [...node.querySelectorAll(".preset")];
    if (compact) node.querySelector(".window").remove();

    let target = 0;
    let position = 0;
    let moving = false;
    let dragging = false;
    let commandedAt = 0;

    const paint = () => {
      pct.textContent = `${Math.round(target)}% aberto`;
      fill.style.width = `${target}%`;
      knob.style.left = `calc(6px + ${target} * (100% - 44px) / 100)`;
      track.setAttribute("aria-valuenow", Math.round(target));
      if (slats.isConnected) slats.style.height = `${100 - position}%`;
      presets.forEach((b) => {
        const p = Number(b.dataset.p);
        b.classList.toggle("going", moving && Math.round(target) === p);
        b.classList.toggle("settled", !moving && Math.round(position) === p);
        b.disabled = !moving && Math.round(position) === p;
      });
    };

    const commit = (v) => {
      commandedAt = Date.now();
      target = v;
      moving = Math.round(position) !== v;
      paint();
      HA.call("cover", "set_cover_position", entityId, { position: v });
    };

    const pctFromX = (x) => {
      const r = track.getBoundingClientRect();
      return Math.round(Math.min(100, Math.max(0, ((x - r.left - 6) / (r.width - 12)) * 100)));
    };
    track.addEventListener("pointerdown", (e) => {
      track.setPointerCapture(e.pointerId);
      dragging = true;
      target = pctFromX(e.clientX);
      paint();
    });
    track.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      target = pctFromX(e.clientX);
      paint();
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      commit(pctFromX(e.clientX));
    };
    track.addEventListener("pointerup", end);
    track.addEventListener("pointercancel", end);
    track.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") commit(Math.min(100, Math.round(target) + 10));
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") commit(Math.max(0, Math.round(target) - 10));
    });
    presets.forEach((b) => b.addEventListener("click", () => commit(Number(b.dataset.p))));

    return bind(node, (id) => id === entityId, () => {
      const s = HA.get(entityId);
      nameEl.textContent = shortName(entityId, strip);
      if (!s || s.state === "unavailable") {
        node.classList.add("unavailable");
        return;
      }
      node.classList.remove("unavailable");
      position = s.attributes.current_position ?? (s.state === "open" ? 100 : 0);
      moving = s.state === "opening" || s.state === "closing";
      if (!dragging && Date.now() - commandedAt > 1500) target = Math.round(coverTarget(s));
      paint();
    });
  }

  // ───────── Portão ─────────

  function gateCard(entityId) {
    const node = el(`<div class="blind">
      <div class="blind-head"><span class="blind-name"></span><span class="blind-pct"></span></div>
      <div class="presets">
        <button class="preset" data-a="open_cover">${icon("open_blind")}<span>Abrir</span></button>
        <button class="preset" data-a="stop_cover">${icon("minus")}<span>Parar</span></button>
        <button class="preset" data-a="close_cover">${icon("close_blind")}<span>Fechar</span></button>
      </div>
    </div>`);
    node.querySelectorAll(".preset").forEach((b) =>
      b.addEventListener("click", () => HA.call("cover", b.dataset.a, entityId)),
    );
    return bind(node, (id) => id === entityId, () => {
      const s = HA.get(entityId);
      node.querySelector(".blind-name").textContent = HA.name(entityId);
      const labels = { open: "Aberto", closed: "Fechado", opening: "A abrir…", closing: "A fechar…" };
      node.querySelector(".blind-pct").textContent = s ? labels[s.state] || s.state : "—";
    });
  }

  // ───────── Climatização ─────────

  const MODES = [
    { id: "off", label: "Desl.", ic: "power" },
    { id: "cool", label: "Frio", ic: "snow" },
    { id: "heat", label: "Calor", ic: "fire" },
    { id: "fan_only", label: "Vento", ic: "fan" },
  ];

  function climateCard(entityId) {
    const node = el(`<div class="climate">
      <div class="climate-head">
        <div><div class="tile-name"></div><div class="climate-now"></div></div>
        <span class="tile-icon">${icon("ac")}</span>
      </div>
      <div class="climate-dial">
        <button class="round-btn" data-step="-0.5" aria-label="Baixar">${icon("minus")}</button>
        <div class="climate-target"></div>
        <button class="round-btn" data-step="0.5" aria-label="Subir">${icon("plus")}</button>
      </div>
      <div class="modes">${MODES.map(
        (m) => `<button class="mode" data-mode="${m.id}">${icon(m.ic)}${m.label}</button>`,
      ).join("")}</div>
    </div>`);

    node.querySelectorAll("[data-step]").forEach((b) =>
      b.addEventListener("click", () => {
        const current = HA.attr(entityId, "temperature", 21);
        HA.call("climate", "set_temperature", entityId, {
          temperature: Math.max(16, Math.min(30, current + Number(b.dataset.step))),
        });
      }),
    );
    node.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", () => HA.call("climate", "set_hvac_mode", entityId, { hvac_mode: b.dataset.mode })),
    );

    return bind(node, (id) => id === entityId, () => {
      const s = HA.get(entityId);
      node.querySelector(".tile-name").textContent = HA.name(entityId);
      if (!s) return;
      const action = s.attributes.hvac_action || "";
      node.classList.toggle("heating", action === "heating");
      node.classList.toggle("cooling", action === "cooling");
      const actionLabel = { heating: "a aquecer", cooling: "a arrefecer", idle: "em espera", off: "desligado", fan: "ventilação", drying: "a desumidificar" };
      node.querySelector(".climate-now").textContent =
        `${fmt.temp(s.attributes.current_temperature)} agora · ${actionLabel[action] || "—"}`;
      node.querySelector(".climate-target").innerHTML =
        s.state === "off" ? '<span style="font-size:20px;color:var(--text-2)">Desligado</span>' : `${fmt.number(s.attributes.temperature, 1)}<sup>°C</sup>`;
      node.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === s.state));
    });
  }

  // ───────── Tomada / interruptor ─────────

  function switchTile(cfg) {
    const entityId = cfg.entity || cfg;
    const node = el(`<div class="tile">
      <div class="tile-top"><span class="tile-icon">${icon(cfg.icon || "plug")}</span>
        <button class="switch" role="switch"><i></i></button></div>
      <div><div class="tile-name"></div><div class="tile-state"></div></div>
    </div>`);
    const domain = entityId.split(".")[0];
    const toggle = () => HA.call(domain, HA.isOn(entityId) ? "turn_off" : "turn_on", entityId);
    node.addEventListener("click", toggle);
    node.querySelector(".switch").addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
    return bind(node, (id) => id === entityId, () => {
      const on = HA.isOn(entityId);
      node.classList.toggle("on", on);
      node.querySelector(".switch").classList.toggle("on", on);
      node.querySelector(".tile-name").textContent = cfg.name || HA.name(entityId);
      node.querySelector(".tile-state").textContent = HA.isUnavailable(entityId)
        ? "Indisponível"
        : on
          ? "Ligado"
          : "Desligado";
    });
  }

  // ───────── Fechadura ─────────

  function lockTile(entityId) {
    const node = el(`<div class="tile">
      <div class="tile-top"><span class="tile-icon"></span>
        <button class="switch" role="switch"><i></i></button></div>
      <div><div class="tile-name"></div><div class="tile-state"></div></div>
    </div>`);
    const toggle = () => {
      const locked = (HA.get(entityId) || {}).state === "locked";
      HA.call("lock", locked ? "unlock" : "lock", entityId);
    };
    node.addEventListener("click", toggle);
    node.querySelector(".switch").addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
    return bind(node, (id) => id === entityId, () => {
      const s = HA.get(entityId);
      const locked = s && s.state === "locked";
      node.querySelector(".tile-icon").innerHTML = icon(locked ? "lock" : "unlock");
      node.querySelector(".switch").classList.toggle("on", !locked);
      node.querySelector(".tile-name").textContent = HA.name(entityId);
      node.querySelector(".tile-state").textContent = locked ? "Trancada" : "Destrancada";
    });
  }

  // ───────── Câmara ─────────

  function cameraTile(cam, { small = false } = {}) {
    const node = el(`<button class="camera ${small ? "camera-sm" : ""}">
      <img alt="${esc(cam.name)}" loading="lazy" />
      <span class="camera-live"><i></i>AO VIVO</span>
      <span class="camera-label">${esc(cam.name)}</span>
    </button>`);
    const img = node.querySelector("img");
    const refresh = () => {
      if (!node.isConnected) {
        clearInterval(timer);
        return;
      }
      img.src = HA.cameraUrl(cam.entity, Date.now());
    };
    const timer = setInterval(refresh, 2000);
    refresh();
    node.addEventListener("click", () => {
      const big = el('<div><img style="width:100%;border-radius:18px;display:block" alt=""></div>');
      const bigImg = big.querySelector("img");
      const t = setInterval(() => {
        if (!big.isConnected) {
          clearInterval(t);
          return;
        }
        bigImg.src = HA.cameraUrl(cam.entity, Date.now());
      }, 1000);
      bigImg.src = HA.cameraUrl(cam.entity, Date.now());
      window.UI.sheet(cam.name, big);
    });
    return node;
  }

  // ───────── Divisão ─────────

  function roomCard(room, { small = false } = {}) {
    const node = el(`<button class="room ${small ? "room-sm" : ""}" style="background-image:url('${esc(room.image || "")}')">
      <span class="room-badges"></span>
      <span class="room-body">
        <span><span class="room-name">${esc(room.name)}</span><span class="room-meta"></span></span>
      </span>
    </button>`);
    node.addEventListener("click", () => openRoom(room));
    const watched = [...(room.lights || []), ...(room.covers || []), room.climate, room.temperature].filter(Boolean);
    return bind(node, (id) => watched.includes(id), () => {
      const on = (room.lights || []).filter((l) => HA.isOn(l)).length;
      const open = (room.covers || []).filter((c) => (HA.attr(c, "current_position", 0) || 0) > 0).length;
      const temp = room.temperature ? HA.num(room.temperature) : null;
      const badges = [];
      if (on) badges.push(`<span class="badge on">${icon("bulb")}${on}</span>`);
      if (temp !== null) badges.push(`<span class="badge">${fmt.temp(temp, 0)}</span>`);
      node.querySelector(".room-badges").innerHTML = badges.join("");
      const bits = [];
      if (room.lights && room.lights.length) bits.push(`${on}/${room.lights.length} luzes`);
      if (room.covers && room.covers.length) bits.push(`${open}/${room.covers.length} estores`);
      node.querySelector(".room-meta").textContent = bits.join(" · ");
    });
  }

  function openRoom(room) {
    const body = el('<div class="room-sheet"></div>');
    const add = (title, node) => {
      if (!node) return;
      body.appendChild(el(`<div class="section-head" style="margin-top:18px"><h3 class="section-title">${esc(title)}</h3></div>`));
      body.appendChild(node);
    };

    const sensors = [];
    if (room.temperature) sensors.push({ ic: "thermo", entity: room.temperature, suffix: "°" });
    if (room.humidity) sensors.push({ ic: "drop", entity: room.humidity, suffix: "%" });
    if (room.motion) sensors.push({ ic: "motion", entity: room.motion, boolean: ["Movimento", "Sem movimento"] });
    if (room.contact) sensors.push({ ic: "door", entity: room.contact, boolean: ["Aberta", "Fechada"] });
    if (sensors.length) {
      const pills = el('<div class="pills"></div>');
      sensors.forEach((s) => {
        const pill = el(`<span class="pill">${icon(s.ic)}<b></b></span>`);
        bind(pill, (id) => id === s.entity, () => {
          const st = HA.get(s.entity);
          pill.querySelector("b").textContent = !st
            ? "—"
            : s.boolean
              ? st.state === "on"
                ? s.boolean[0]
                : s.boolean[1]
              : `${fmt.number(parseFloat(st.state), s.suffix === "°" ? 1 : 0)}${s.suffix}`;
        });
        pills.appendChild(pill);
      });
      body.appendChild(pills);
    }

    if (room.camera) {
      const holder = el('<div style="margin-top:16px"></div>');
      holder.appendChild(cameraTile({ entity: room.camera, name: room.name }));
      body.appendChild(holder);
    }

    if (room.lights && room.lights.length) {
      const grid = el('<div class="grid"></div>');
      room.lights.forEach((l) => grid.appendChild(lightTile(l, { strip: room.name })));
      add("Iluminação", grid);
    }
    if (room.covers && room.covers.length) {
      const grid = el('<div class="grid"></div>');
      room.covers.forEach((c) => grid.appendChild(c.includes("portao") ? gateCard(c) : blindCard(c, { strip: room.name })));
      add("Estores", grid);
    }
    if (room.climate) add("Climatização", climateCard(room.climate));
    if (room.lock) {
      const grid = el('<div class="grid"></div>');
      grid.appendChild(lockTile(room.lock));
      add("Segurança", grid);
    }
    if (room.switches && room.switches.length) {
      const grid = el('<div class="grid"></div>');
      room.switches.forEach((s) => grid.appendChild(switchTile(s)));
      add("Tomadas", grid);
    }

    window.UI.sheet(room.name, body);
  }

  // ───────── Lá fora ─────────

  const WEATHER_OPTIONS = ["Automático", "Céu limpo", "Nublado", "Chuva"];
  const CONDITION_LABEL = { clear: "Céu limpo", cloudy: "Nublado", rain: "Chuva" };

  function outsideCard() {
    const node = el(`<div class="card outside">
      <div class="window"><div class="sky-host"></div></div>
      <div class="outside-info"></div>
    </div>`);
    window.UI.mountSky(node.querySelector(".sky-host"), CFG.weather);
    const info = node.querySelector(".outside-info");
    const watch = [CFG.weather, "sun.sun", CFG.outdoor && CFG.outdoor.temperature, CFG.outdoor && CFG.outdoor.humidity].filter(Boolean);
    return bind(node, (id) => watch.includes(id), () => {
      const m = window.UI.skyModel(CFG.weather);
      const temp = CFG.outdoor && CFG.outdoor.temperature ? HA.num(CFG.outdoor.temperature) : HA.attr(CFG.weather, "temperature");
      const hum = CFG.outdoor && CFG.outdoor.humidity ? HA.num(CFG.outdoor.humidity) : HA.attr(CFG.weather, "humidity");
      const wIcon = m.condition === "rain" ? "rain" : m.condition === "cloudy" ? "cloud" : m.phase === "night" ? "moon" : "sun";
      const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
      info.innerHTML = `
        <div class="outside-head"><b>Lá fora</b><span>${CONDITION_LABEL[m.condition]}</span></div>
        <div class="outside-temp">${icon(wIcon, "stat-icon")}<span class="big">${fmt.temp(temp)}</span>${hum !== null && hum !== undefined ? `<small>${Math.round(hum)}% humidade</small>` : ""}</div>
        <div class="outside-sun"><span>${icon("sunrise")} Nascer ${hhmm(m.sr)}</span><span>${icon("sunset")} Pôr ${hhmm(m.ss)}</span></div>`;
      info.querySelector(".outside-temp svg").style.width = "22px";
      info.querySelector(".outside-temp svg").style.height = "22px";
    });
  }

  function weatherSimulator() {
    if (!CFG.weather_select) return null;
    const node = el(`<div class="section">
      <div class="section-head"><h3 class="section-title">Simular tempo</h3></div>
      <div class="segmented">${WEATHER_OPTIONS.map((o) => `<button data-opt="${esc(o)}">${esc(o === "Automático" ? "Auto" : o)}</button>`).join("")}</div>
    </div>`);
    node.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        HA.call("select", "select_option", CFG.weather_select, { option: b.dataset.opt });
        window.UI.toast(`Tempo: ${b.dataset.opt}`);
      }),
    );
    return bind(node, (id) => id === CFG.weather_select, () => {
      const cur = (HA.get(CFG.weather_select) || {}).state;
      node.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.opt === cur));
    });
  }

  // ───────── Início ─────────

  function heroCard() {
    const node = el(`<div class="hero">
      <div class="hero-top"><p class="hero-greet"></p><span class="chip"></span></div>
      <h1 class="hero-title">Bem-vindo a casa</h1>
      <div class="hero-status">
        <div class="hero-status-lead"><span class="dot"></span><b></b></div>
        <p class="hero-status-detail"></p>
      </div>
    </div>`);
    return bind(node, (id) => id.startsWith("light.") || id.startsWith("cover.") || id.startsWith("weather.") || id === CFG.indoor_temperature, () => {
      const lights = allLights();
      const covers = allCovers();
      const on = lights.filter((l) => HA.isOn(l)).length;
      const open = covers.filter((c) => (HA.attr(c, "current_position", 0) || 0) > 0).length;
      const m = window.UI.skyModel(CFG.weather);
      const wIcon = m.condition === "rain" ? "rain" : m.condition === "cloudy" ? "cloud" : m.phase === "night" ? "moon" : "sun";
      const t = HA.attr(CFG.weather, "temperature");
      const tin = CFG.indoor_temperature ? HA.num(CFG.indoor_temperature) : null;

      node.querySelector(".hero-greet").textContent = greeting();
      node.querySelector(".chip").innerHTML = `${icon(wIcon)}<span>${t !== null && t !== undefined ? `${Math.round(t)}°` : "—"}</span>`;
      node.querySelector(".chip svg").style.width = "18px";
      node.querySelector(".chip svg").style.height = "18px";

      let lead = "Em uso";
      if (on === 0 && open === 0) lead = "Tudo fechado";
      else if (open === covers.length && on === 0) lead = "Estores abertos";
      else if (open === 0 && on > 0) lead = on === 1 ? "Luz acesa" : "Luzes acesas";
      node.querySelector(".hero-status-lead b").textContent = lead;
      node.querySelector(".dot").classList.toggle("on", !(on === 0 && open === 0));

      const bits = [];
      if (covers.length) bits.push(open === 0 ? "estores todos fechados" : open === covers.length ? "estores todos abertos" : `${open} de ${covers.length} estores abertos`);
      if (lights.length) bits.push(on === 0 ? "luzes apagadas" : on === 1 ? "1 luz ligada" : `${on} luzes ligadas`);
      if (tin !== null) bits.push(`${fmt.temp(tin)} dentro`);
      node.querySelector(".hero-status-detail").textContent = bits.join(" · ");
    });
  }

  function energyStrip() {
    const E = CFG.energy || {};
    const items = [
      { key: "home", label: "Casa", ic: "home", entity: E.power && E.power.home },
      { key: "solar", label: "Solar", ic: "solar", entity: E.power && E.power.solar },
      { key: "battery", label: "Bateria", ic: "battery", entity: E.battery_soc, pct: true },
      { key: "grid", label: "Rede", ic: "grid_icon", entity: E.power && E.power.grid },
    ].filter((i) => i.entity);
    const node = el(`<div class="stats"></div>`);
    items.forEach((i) => {
      const card = el(`<div class="stat"><div class="stat-label">${icon(i.ic)}${i.label}</div><div class="stat-value"></div><div class="stat-sub"></div></div>`);
      bind(card, (id) => id === i.entity, () => {
        const v = HA.num(i.entity);
        card.querySelector(".stat-value").textContent = i.pct ? fmt.pct(v) : fmt.power(v);
        let sub = "";
        if (i.key === "grid" && v !== null) sub = v > 5 ? "a importar" : v < -5 ? "a exportar" : "equilibrado";
        if (i.key === "battery") {
          const flow = HA.num(E.power && E.power.battery);
          sub = flow > 20 ? "a carregar" : flow < -20 ? "a descarregar" : "em repouso";
        }
        if (i.key === "solar" && v !== null) sub = v > 10 ? "a produzir" : "sem sol";
        if (i.key === "home" && v !== null) sub = "consumo agora";
        card.querySelector(".stat-sub").textContent = sub;
      });
      node.appendChild(card);
    });
    return node;
  }

  function scenesRow() {
    const scenes = CFG.scenes || [];
    if (!scenes.length) return null;
    const row = el('<div class="row-scroll"></div>');
    scenes.forEach((s) => {
      const b = el(`<button class="scene">${icon(s.icon || "movie")}${esc(s.name)}</button>`);
      b.addEventListener("click", () => {
        const domain = s.entity.split(".")[0];
        HA.call(domain, domain === "scene" ? "turn_on" : "turn_on", s.entity);
        window.UI.toast(`${s.name} ativado`);
      });
      bind(b, (id) => id === s.entity, () => b.classList.toggle("running", HA.isOn(s.entity)));
      row.appendChild(b);
    });
    return row;
  }

  function quickControls() {
    const node = el(`<div class="card" style="padding:16px">
      <div class="section-head" style="margin-bottom:10px"><h3 class="section-title">Todos os estores</h3></div>
      <div class="presets">${PRESETS.map((p) => `<button class="preset" data-p="${p.p}">${icon(p.ic)}<span>${p.label}</span></button>`).join("")}</div>
      <div class="section-head" style="margin:16px 0 10px"><h3 class="section-title">Iluminação</h3></div>
      <button class="tile" style="min-height:0;flex-direction:row;align-items:center;justify-content:space-between">
        <span style="display:flex;align-items:center;gap:12px"><span class="tile-icon">${icon("bulb")}</span>
          <span><span class="tile-name"></span><span class="tile-state" style="display:block"></span></span></span>
        <span class="switch"><i></i></span>
      </button>
    </div>`);

    node.querySelectorAll(".presets .preset").forEach((b) =>
      b.addEventListener("click", () => {
        HA.call("cover", "set_cover_position", allCovers(), { position: Number(b.dataset.p) });
        window.UI.toast(`Estores: ${PRESETS.find((p) => p.p === Number(b.dataset.p)).label.toLowerCase()}`);
      }),
    );
    const lightsBtn = node.querySelector(".tile");
    lightsBtn.addEventListener("click", () => {
      const on = allLights().filter((l) => HA.isOn(l));
      if (on.length) HA.call("light", "turn_off", allLights());
      else HA.call("light", "turn_on", (rooms().find((r) => r.id === "sala") || {}).lights || allLights().slice(0, 2));
    });

    return bind(node, (id) => id.startsWith("light.") || id.startsWith("cover."), () => {
      const covers = allCovers().map((c) => HA.get(c)).filter(Boolean);
      const moving = covers.some((s) => s.state === "opening" || s.state === "closing");
      const positions = covers.map((s) => s.attributes.current_position ?? 0);
      const allSame = positions.length && positions.every((p) => p === positions[0]);
      const targets = covers.map(coverTarget);
      const allTarget = targets.length && targets.every((t) => t === targets[0]) ? targets[0] : null;
      node.querySelectorAll(".presets .preset").forEach((b) => {
        const p = Number(b.dataset.p);
        b.classList.toggle("going", moving && allTarget === p);
        b.classList.toggle("settled", !moving && allSame && positions[0] === p);
      });
      const lights = allLights();
      const on = lights.filter((l) => HA.isOn(l)).length;
      lightsBtn.classList.toggle("on", on > 0);
      lightsBtn.querySelector(".switch").classList.toggle("on", on > 0);
      lightsBtn.querySelector(".tile-name").textContent = on ? "Apagar todas as luzes" : "Acender a sala";
      lightsBtn.querySelector(".tile-state").textContent = on ? `${on} de ${lights.length} ligadas` : "todas apagadas";
    });
  }

  function peopleRow() {
    const people = CFG.people || [];
    if (!people.length) return null;
    const row = el('<div class="pills"></div>');
    people.forEach((p) => {
      const pill = el(`<span class="pill">${icon("person")}<b>${esc(p.name)}</b><span class="tile-state"></span></span>`);
      bind(pill, (id) => id === p.entity || id === p.battery, () => {
        const home = (HA.get(p.entity) || {}).state === "home";
        const bat = p.battery ? HA.num(p.battery) : null;
        pill.querySelector(".tile-state").textContent = `${home ? "em casa" : "fora"}${bat !== null ? ` · ${Math.round(bat)}%` : ""}`;
        pill.querySelector("svg").style.color = home ? "var(--good)" : "var(--text-3)";
      });
      row.appendChild(pill);
    });
    return row;
  }

  function homeView() {
    const node = el('<div class="view"></div>');
    const cols = el('<div class="home-cols"></div>');
    const left = el("<div></div>");
    const right = el("<div></div>");

    left.appendChild(heroCard());
    const people = peopleRow();
    if (people) {
      const wrap = el('<div class="section"></div>');
      wrap.appendChild(people);
      left.appendChild(wrap);
    }
    const scenes = scenesRow();
    if (scenes) {
      const s = el('<div class="section"><div class="section-head"><h3 class="section-title">Cenas</h3></div></div>');
      s.appendChild(scenes);
      left.appendChild(s);
    }

    const energySection = el('<div class="section"><div class="section-head"><h3 class="section-title">Energia agora</h3><a class="section-link" href="#/energia">Ver tudo</a></div></div>');
    energySection.appendChild(energyStrip());
    left.appendChild(energySection);

    const roomsSection = el('<div class="section"><div class="section-head"><h3 class="section-title">Divisões</h3><a class="section-link" href="#/divisoes">Ver todas</a></div></div>');
    const roomsRow = el('<div class="row-scroll"></div>');
    rooms().slice(0, 6).forEach((r) => roomsRow.appendChild(roomCard(r, { small: true })));
    roomsSection.appendChild(roomsRow);
    left.appendChild(roomsSection);

    const outsideSection = el('<div class="section"><div class="section-head"><h3 class="section-title">Lá fora</h3></div></div>');
    outsideSection.appendChild(outsideCard());
    right.appendChild(outsideSection);
    const sim = weatherSimulator();
    if (sim) right.appendChild(sim);

    const controlsSection = el('<div class="section"><div class="section-head"><h3 class="section-title">Controlo rápido</h3></div></div>');
    controlsSection.appendChild(quickControls());
    right.appendChild(controlsSection);

    const cams = (CFG.cameras || []).slice(0, 3);
    if (cams.length) {
      const camSection = el('<div class="section"><div class="section-head"><h3 class="section-title">Câmaras</h3><a class="section-link" href="#/cameras">Ver todas</a></div></div>');
      const camRow = el('<div class="row-scroll"></div>');
      cams.forEach((c) => camRow.appendChild(cameraTile(c, { small: true })));
      camSection.appendChild(camRow);
      right.appendChild(camSection);
    }

    cols.append(left, right);
    node.appendChild(cols);
    return node;
  }

  // ───────── Divisões ─────────

  function roomsView() {
    const node = el('<div class="view"></div>');
    (CFG.floors || []).forEach((floor) => {
      const list = rooms().filter((r) => r.floor === floor.id);
      if (!list.length) return;
      const section = el(`<div class="section"><div class="section-head"><h3 class="section-title">${esc(floor.name)}</h3></div></div>`);
      const grid = el('<div class="grid"></div>');
      list.forEach((r) => grid.appendChild(roomCard(r)));
      section.appendChild(grid);
      node.appendChild(section);
    });
    return node;
  }

  // ───────── Controlos ─────────

  function controlsView(kind = "luzes") {
    const node = el('<div class="view"></div>');
    const seg = el(`<div class="segmented" style="margin-top:4px">
      <button data-k="luzes">Luzes</button><button data-k="estores">Estores</button><button data-k="clima">Clima</button>
    </div>`);
    const body = el("<div></div>");
    node.append(seg, body);

    const render = (k) => {
      seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.k === k));
      body.innerHTML = "";
      rooms().forEach((room) => {
        let entities = [];
        if (k === "luzes") entities = [...(room.lights || []), ...(room.switches || []).map((s) => s)];
        if (k === "estores") entities = room.covers || [];
        if (k === "clima") entities = room.climate ? [room.climate] : [];
        if (!entities.length) return;
        const section = el(`<div class="section"><div class="section-head"><h3 class="section-title">${esc(room.name)}</h3></div></div>`);
        const grid = el('<div class="grid"></div>');
        entities.forEach((e) => {
          if (k === "luzes") grid.appendChild(typeof e === "string" ? lightTile(e, { strip: room.name }) : switchTile(e));
          else if (k === "estores") grid.appendChild(e.includes("portao") ? gateCard(e) : blindCard(e, { strip: room.name }));
          else grid.appendChild(climateCard(e));
        });
        section.appendChild(grid);
        body.appendChild(section);
      });
    };

    seg.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        location.hash = `#/controlos/${b.dataset.k}`;
      }),
    );
    render(kind);
    return node;
  }

  // ───────── Câmaras ─────────

  function camerasView() {
    const node = el('<div class="view"></div>');
    const grid = el('<div class="grid" style="margin-top:6px"></div>');
    (CFG.cameras || []).forEach((c) => grid.appendChild(cameraTile(c)));
    node.appendChild(grid);
    if (!(CFG.cameras || []).length) node.appendChild(el('<div class="empty">Sem câmaras configuradas.</div>'));
    return node;
  }

  // ───────── Energia ─────────

  const PERIODS = [
    { id: "hoje", label: "Hoje", period: "hour", days: 0 },
    { id: "7d", label: "7 dias", period: "day", days: 7 },
    { id: "30d", label: "30 dias", period: "day", days: 30 },
  ];

  function energyView(periodId = "hoje") {
    const E = CFG.energy || {};
    const node = el('<div class="view"></div>');

    const strip = el('<div class="section"><div class="section-head"><h3 class="section-title">Agora</h3></div></div>');
    strip.appendChild(energyStrip());
    node.appendChild(strip);

    const flowSection = el('<div class="section"></div>');
    flowSection.appendChild(energyFlow());
    node.appendChild(flowSection);

    const seg = el(`<div class="segmented" style="margin-top:22px">${PERIODS.map((p) => `<button data-p="${p.id}">${p.label}</button>`).join("")}</div>`);
    seg.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        location.hash = `#/energia/${b.dataset.p}`;
      }),
    );
    node.appendChild(seg);

    const chartCard = el('<div class="card bars" style="margin-top:14px"><div class="empty">A carregar histórico…</div></div>');
    node.appendChild(chartCard);

    const totals = el('<div class="stats" style="margin-top:14px"></div>');
    node.appendChild(totals);

    const circuitsCard = el('<div class="card" style="margin-top:22px"></div>');
    node.appendChild(circuitsCard);

    const period = PERIODS.find((p) => p.id === periodId) || PERIODS[0];
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.p === period.id));

    loadEnergy(period, chartCard, totals, circuitsCard);
    return node;
  }

  function energyFlow() {
    const E = CFG.energy || {};
    const node = el(`<div class="card flow">
      <svg class="flow-svg" viewBox="0 0 320 150" role="img" aria-label="Fluxo de energia">
        <g stroke-linecap="round" fill="none" stroke-width="3">
          <path id="p-solar" d="M60 42 C 120 42, 130 70, 158 70" stroke="var(--warn)" opacity=".5"/>
          <path id="p-grid" d="M60 118 C 120 118, 130 86, 158 86" stroke="var(--accent)" opacity=".5"/>
          <path id="p-batt" d="M262 118 C 210 118, 200 86, 176 86" stroke="var(--good)" opacity=".5"/>
        </g>
        <g font-size="11" fill="currentColor">
          <g transform="translate(20,42)"><circle r="20" fill="color-mix(in srgb, var(--warn) 22%, transparent)"/><text text-anchor="middle" y="4" font-size="10">Solar</text></g>
          <g transform="translate(20,118)"><circle r="20" fill="color-mix(in srgb, var(--accent) 22%, transparent)"/><text text-anchor="middle" y="4" font-size="10">Rede</text></g>
          <g transform="translate(300,118)"><circle r="20" fill="color-mix(in srgb, var(--good) 22%, transparent)"/><text text-anchor="middle" y="4" font-size="10">Bateria</text></g>
          <g transform="translate(167,78)"><rect x="-32" y="-26" width="64" height="52" rx="16" fill="var(--surface-2)" stroke="var(--line)"/><text text-anchor="middle" y="-6" font-size="10" opacity=".7">Casa</text><text text-anchor="middle" y="12" font-size="13" font-weight="700" id="flow-home">—</text></g>
        </g>
        <g font-size="10" fill="currentColor" opacity=".75">
          <text x="46" y="20" id="flow-solar">—</text>
          <text x="46" y="146" id="flow-grid">—</text>
          <text x="248" y="146" text-anchor="end" id="flow-batt">—</text>
        </g>
      </svg>
    </div>`);

    const watch = [E.power && E.power.home, E.power && E.power.solar, E.power && E.power.grid, E.power && E.power.battery, E.battery_soc].filter(Boolean);
    return bind(node, (id) => watch.includes(id), () => {
      const home = HA.num(E.power && E.power.home);
      const solar = HA.num(E.power && E.power.solar);
      const grid = HA.num(E.power && E.power.grid);
      const batt = HA.num(E.power && E.power.battery);
      const soc = HA.num(E.battery_soc);
      node.querySelector("#flow-home").textContent = fmt.power(home);
      node.querySelector("#flow-solar").textContent = fmt.power(solar);
      node.querySelector("#flow-grid").textContent = grid === null ? "—" : `${grid >= 0 ? "importa " : "exporta "}${fmt.power(Math.abs(grid))}`;
      node.querySelector("#flow-batt").textContent = `${soc !== null ? `${Math.round(soc)}% · ` : ""}${batt === null ? "—" : batt > 20 ? "a carregar" : batt < -20 ? "a descarregar" : "em repouso"}`;
      const active = (path, on) => {
        const p = node.querySelector(path);
        if (p) {
          p.style.opacity = on ? "1" : ".25";
          p.style.strokeWidth = on ? "4" : "3";
        }
      };
      active("#p-solar", (solar || 0) > 20);
      active("#p-grid", (grid || 0) > 20);
      active("#p-batt", Math.abs(batt || 0) > 20);
    });
  }

  async function loadEnergy(period, chartCard, totalsNode, circuitsCard) {
    const E = CFG.energy || {};
    const T = E.totals || {};
    const circuitIds = (E.circuits || []).map((c) => c.entity);
    const ids = [T.home, T.solar, T.import, T.export, T.charge, T.discharge, ...circuitIds].filter(Boolean);
    const now = new Date();
    const start = new Date(now);
    if (period.days === 0) start.setHours(0, 0, 0, 0);
    else start.setDate(start.getDate() - period.days);

    try {
      const stats = await HA.statistics(ids, start, null, period.period);
      const sumOf = (id) => (stats[id] || []).reduce((a, r) => a + Math.max(0, r.change || 0), 0);
      const seriesOf = (id) => (stats[id] || []).map((r) => Math.max(0, r.change || 0));
      const labelsOf = (id) =>
        (stats[id] || []).map((r) => {
          const d = new Date(r.start);
          return period.period === "hour" ? `${String(d.getHours()).padStart(2, "0")}h` : `${d.getDate()}/${d.getMonth() + 1}`;
        });

      const labels = labelsOf(T.home).length ? labelsOf(T.home) : labelsOf(T.solar);
      const series = [
        { name: "Rede", color: "var(--accent)", values: seriesOf(T.import) },
        { name: "Solar", color: "var(--warn)", values: seriesOf(T.solar) },
        { name: "Bateria", color: "var(--good)", values: seriesOf(T.discharge) },
      ];

      chartCard.innerHTML = `${window.UI.barChart(series, labels)}
        <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>`;

      const consumo = sumOf(T.home);
      const solar = sumOf(T.solar);
      const imported = sumOf(T.import);
      const exported = sumOf(T.export);
      const tariff = E.tariff || 0;
      const feed = E.feed_in || 0;
      const autoConsumo = solar > 0 ? Math.min(100, ((solar - exported) / solar) * 100) : 0;
      const autoSuf = consumo > 0 ? Math.min(100, ((consumo - imported) / consumo) * 100) : 0;

      totalsNode.innerHTML = `
        <div class="stat"><div class="stat-label">${icon("home")}Consumo</div><div class="stat-value">${fmt.energy(consumo)}</div><div class="stat-sub">no período</div></div>
        <div class="stat"><div class="stat-label">${icon("solar")}Produção</div><div class="stat-value">${fmt.energy(solar)}</div><div class="stat-sub">${fmt.pct(autoConsumo)} aproveitada</div></div>
        <div class="stat"><div class="stat-label">${icon("grid_icon")}Da rede</div><div class="stat-value">${fmt.energy(imported)}</div><div class="stat-sub">${fmt.money(imported * tariff, E.currency)}</div></div>
        <div class="stat"><div class="stat-label">${icon("bolt")}Poupança</div><div class="stat-value">${fmt.money((consumo - imported) * tariff + exported * feed, E.currency)}</div><div class="stat-sub">${fmt.pct(autoSuf)} independente</div></div>`;

      const circuits = (E.circuits || [])
        .map((c) => ({ ...c, value: sumOf(c.entity) }))
        .filter((c) => c.value > 0.001)
        .sort((a, b) => b.value - a.value);
      const max = Math.max(0.001, ...circuits.map((c) => c.value));
      circuitsCard.innerHTML =
        `<div class="section-head" style="padding:14px 14px 4px"><h3 class="section-title">Por circuito</h3></div>` +
        (circuits.length
          ? circuits
              .map(
                (c) => `<div class="circuit">
          <span class="circuit-icon">${icon(c.icon || "plug")}</span>
          <span class="circuit-main"><span class="circuit-name">${esc(c.name)}</span>
            <span class="circuit-bar"><i style="width:${(c.value / max) * 100}%"></i></span></span>
          <span class="circuit-value">${fmt.energy(c.value)}<small>${fmt.money(c.value * tariff, E.currency)}</small></span>
        </div>`,
              )
              .join("")
          : '<div class="empty">Sem dados no período.</div>');
    } catch (err) {
      chartCard.innerHTML = `<div class="empty">Não foi possível carregar o histórico.</div>`;
      console.error("Casa OS: estatísticas", err);
    }
  }

  window.VIEWS = { homeView, roomsView, controlsView, camerasView, energyView, openRoom };
})();
