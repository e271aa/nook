/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — componentes e vistas.
 *  Cada componente devolve um nó que se atualiza sozinho: subscreve as
 *  entidades de que precisa e larga a subscrição quando sai do ecrã.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt, greeting } = window.UI;
  const HA = window.HA;
  const CFG = window.CASA.config;

  function bind(node, match, update) {
    const unsub = HA.subscribe((id) => {
      if (!node.isConnected && node.__mounted) {
        unsub();
        return;
      }
      if (node.isConnected) node.__mounted = true;
      if (id === "*" || match(id)) update();
    });
    update();
    return node;
  }

  const rooms = () => CFG.rooms || [];
  const isGate = (id) => id.includes("portao");
  const allLights = () => rooms().flatMap((r) => r.lights || []);
  const allBlinds = () => rooms().flatMap((r) => (r.covers || []).filter((c) => !isGate(c)));

  const coverPos = (id) => HA.attr(id, "current_position", 0) ?? 0;
  const coverTarget = (id) => {
    const s = HA.get(id);
    if (!s) return 0;
    return s.attributes.target_position ?? s.attributes.current_position ?? (s.state === "open" ? 100 : 0);
  };
  const isMoving = (id) => {
    const s = HA.get(id);
    return !!s && (s.state === "opening" || s.state === "closing");
  };

  /** "Luz teto Sala" + divisão "Sala" → "Luz teto" */
  function shortName(entityId, strip) {
    const full = HA.name(entityId);
    if (!strip) return full;
    return full.replace(new RegExp(`\\s*[·-]?\\s*${strip}$`, "i"), "").trim() || full;
  }

  // ═════════ A JANELA ═════════
  // O ecrã abre com a janela da casa: o céu que está lá fora agora, e as
  // persianas de cada divisão na posição real. Arrasta-se para baixo e para
  // cima para as mexer — é o estore, não um controlo deslizante.

  function windowStrip() {
    const blinds = allBlinds();
    const node = el(`<div class="windowstrip">
      <div class="sky-host"></div>
      <div class="panes"></div>
      <div class="wshade"></div>
      <span class="whint"${localStorage.getItem("casa_os_hint") ? " hidden" : ""}>${icon("blinds", "ic-sm")} arrasta para mexer</span>
    </div>`);

    window.UI.mountSky(node.querySelector(".sky-host"), CFG.weather);
    const panes = node.querySelector(".panes");

    blinds.forEach((entityId) => {
      const room = rooms().find((r) => (r.covers || []).includes(entityId));
      const siblings = room ? (room.covers || []).filter((c) => !isGate(c)) : [];
      // Uma divisão com dois estores mostra qual é qual ("Sala · janela")
      // "Estore Sala (janela)" + divisão "Sala" → "Sala · janela"
      const detail = HA.name(entityId)
        .replace(/^estore\s*/i, "")
        .replace(new RegExp(room ? room.name : "", "ig"), "")
        .replace(/[()·-]/g, " ")
        .trim();
      const label = room ? (siblings.length > 1 && detail ? `${room.name} · ${detail}` : room.name) : HA.name(entityId);
      const pane = el(`<button class="pane" aria-label="${esc(HA.name(entityId))}" style="--slat-1:#d7c4a3;--slat-2:#c3ad89">
        <span class="slats"></span>
        <span class="ppct num"></span>
        <span class="plabel">${esc(label)}</span>
      </button>`);
      const slats = pane.querySelector(".slats");
      const pctEl = pane.querySelector(".ppct");

      let dragging = false;
      let startY = 0;
      let startPos = 0;
      let shown = 0;
      let commandedAt = 0;

      const paint = (pos, instant) => {
        shown = pos;
        slats.style.transition = instant ? "none" : "";
        slats.style.height = `${100 - pos}%`;
        pctEl.textContent = `${Math.round(pos)} %`;
      };

      pane.addEventListener("pointerdown", (e) => {
        pane.setPointerCapture(e.pointerId);
        dragging = true;
        const hint = node.querySelector(".whint");
        if (hint) {
          hint.hidden = true;
          try {
            localStorage.setItem("casa_os_hint", "1");
          } catch (err) {
            /* modo privado */
          }
        }
        pane.classList.add("dragging");
        startY = e.clientY;
        startPos = shown;
      });
      pane.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        const pos = Math.max(0, Math.min(100, startPos - (dy / node.clientHeight) * 100));
        paint(pos, true);
      });
      const release = (e) => {
        if (!dragging) return;
        dragging = false;
        pane.classList.remove("dragging");
        const moved = Math.abs(e.clientY - startY) > 6;
        const pos = moved ? Math.round(shown) : coverPos(entityId) > 50 ? 0 : 100;
        commandedAt = Date.now();
        paint(pos, false);
        HA.call("cover", "set_cover_position", entityId, { position: pos });
      };
      pane.addEventListener("pointerup", release);
      pane.addEventListener("pointercancel", () => {
        dragging = false;
        pane.classList.remove("dragging");
      });

      bind(pane, (id) => id === entityId, () => {
        if (dragging || Date.now() - commandedAt < 1200) return;
        paint(coverPos(entityId), false);
      });
      panes.appendChild(pane);
    });

    return node;
  }

  /** A frase que resume a casa + as duas temperaturas. */
  function readout() {
    const node = el(`<div class="readout">
      <div class="line"></div>
      <div class="meta"></div>
      <div class="temps">
        <div class="temp in"><div class="k">Dentro</div><div class="v"></div></div>
        <div class="temp out"><div class="k">Fora</div><div class="v"></div><div class="why"></div></div>
      </div>
    </div>`);

    const watch = [CFG.weather, "sun.sun", CFG.indoor_temperature, CFG.outdoor && CFG.outdoor.temperature];
    return bind(
      node,
      (id) => id.startsWith("light.") || id.startsWith("cover.") || watch.includes(id),
      () => {
        const lights = allLights();
        const blinds = allBlinds();
        const on = lights.filter((l) => HA.isOn(l)).length;
        const open = blinds.filter((c) => coverPos(c) > 0).length;
        const moving = blinds.filter(isMoving).length;

        let line;
        if (moving) line = `${moving === 1 ? "Um estore" : `${moving} estores`} a mexer`;
        else if (on === 0 && open === 0) line = "Casa fechada";
        else if (on === 0) line = open === blinds.length ? "Casa aberta, luzes apagadas" : "Luzes apagadas";
        else line = on === 1 ? "Uma luz ligada" : `${on} luzes ligadas`;

        const bits = [];
        bits.push(open === 0 ? "estores fechados" : open === blinds.length ? "estores todos abertos" : `${open} de ${blinds.length} estores abertos`);
        const ac = rooms().map((r) => r.climate).filter(Boolean).filter((c) => (HA.get(c) || {}).state !== "off").length;
        if (ac) bits.push(`${ac} ${ac === 1 ? "ar condicionado ligado" : "ares condicionados ligados"}`);

        node.querySelector(".line").innerHTML = `<b>${esc(line)}</b>`;
        node.querySelector(".meta").textContent = bits.join(" · ");

        const tin = CFG.indoor_temperature ? HA.num(CFG.indoor_temperature) : null;
        const tout = CFG.outdoor && CFG.outdoor.temperature ? HA.num(CFG.outdoor.temperature) : HA.attr(CFG.weather, "temperature");
        node.querySelector(".temp.in .v").innerHTML = `${fmt.n(tin, 1)}<small>°C</small>`;
        node.querySelector(".temp.out .v").innerHTML = `${fmt.n(tout, 1)}<small>°C</small>`;

        const m = window.UI.skyModel(CFG.weather);
        const label = { clear: "Céu limpo", cloudy: "Nublado", rain: "Chuva" }[m.condition];
        const ico = m.condition === "rain" ? "rain" : m.condition === "cloudy" ? "cloud" : m.phase === "night" ? "moon" : "sun";
        const solSub = m.phase === "night" ? `Nascer ${fmt.hm(m.sr)}` : `Pôr ${fmt.hm(m.ss)}`;
        node.querySelector(".temp.out .why").innerHTML = `${icon(ico)}${esc(label)} · ${esc(solSub)}`;
      },
    );
  }

  // ═════════ Componentes ═════════

  function sliderHTML(pct, label, kind, extra) {
    return `<div class="slider ${kind} ${extra || ""}" role="slider" tabindex="0"
      aria-label="${esc(label)}" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100">
      <div class="fill" style="width:${pct}%"></div>
      <div class="lbl"><span>${esc(label)}</span><span class="pc">${Math.round(pct)} %</span></div></div>`;
  }

  /** Liga um .slider a uma função que recebe a percentagem escolhida. */
  function wireSlider(slider, onCommit, getValue) {
    let dragging = false;
    let value = 0;
    const paint = (v) => {
      value = v;
      slider.querySelector(".fill").style.width = `${v}%`;
      slider.querySelector(".pc").textContent = `${Math.round(v)} %`;
      slider.setAttribute("aria-valuenow", Math.round(v));
    };
    const pctFromX = (x) => {
      const r = slider.getBoundingClientRect();
      return Math.max(0, Math.min(100, Math.round(((x - r.left) / r.width) * 100)));
    };
    slider.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      slider.setPointerCapture(e.pointerId);
      dragging = true;
      slider.classList.add("dragging");
      paint(pctFromX(e.clientX));
    });
    slider.addEventListener("pointermove", (e) => {
      if (dragging) paint(pctFromX(e.clientX));
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      slider.classList.remove("dragging");
      onCommit(pctFromX(e.clientX));
    };
    slider.addEventListener("pointerup", end);
    slider.addEventListener("pointercancel", end);
    slider.addEventListener("click", (e) => e.stopPropagation());
    slider.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowUp") onCommit(Math.min(100, value + 10));
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") onCommit(Math.max(0, value - 10));
    });
    return {
      sync: () => {
        if (!dragging) paint(getValue());
      },
      isDragging: () => dragging,
    };
  }

  function lightCard(entityId, { strip = null } = {}) {
    const node = el(`<div class="card lightcard">
      <div class="card-top">
        <div><div class="card-name"></div><div class="card-state"></div></div>
        <div class="glyph">${icon("bulb")}</div>
      </div>
      <div class="ctl"></div>
    </div>`);
    const ctl = node.querySelector(".ctl");
    let mode = null;
    let slider = null;
    let commandedAt = 0;

    const toggle = () => HA.call("light", HA.isOn(entityId) ? "turn_off" : "turn_on", entityId);
    node.addEventListener("click", toggle);

    return bind(node, (id) => id === entityId, () => {
      const s = HA.get(entityId);
      const on = !!s && s.state === "on";
      const gone = !s || s.state === "unavailable";
      const dimmable = ((s && s.attributes.supported_color_modes) || []).some((m) => m !== "onoff");
      const bri = s && s.attributes.brightness ? Math.round((s.attributes.brightness / 255) * 100) : 0;

      node.classList.toggle("is-on", on);
      node.classList.toggle("is-unavailable", gone);
      node.querySelector(".card-name").textContent = shortName(entityId, strip);
      node.querySelector(".card-state").textContent = gone
        ? "Sem resposta"
        : on
          ? dimmable
            ? `${fmt.n(bri)} % de brilho`
            : "Ligada"
          : "Desligada";

      const want = on && dimmable ? "slider" : "switch";
      if (mode !== want) {
        mode = want;
        if (want === "slider") {
          ctl.innerHTML = sliderHTML(bri, "Brilho", "light");
          slider = wireSlider(
            ctl.querySelector(".slider"),
            (v) => {
              commandedAt = Date.now();
              HA.call("light", "turn_on", entityId, { brightness_pct: Math.max(1, v) });
            },
            () => {
              const st = HA.get(entityId);
              return st && st.attributes.brightness ? Math.round((st.attributes.brightness / 255) * 100) : 0;
            },
          );
        } else {
          ctl.innerHTML = `<div style="display:flex;justify-content:flex-end"><button class="sw" role="switch" aria-checked="${on}" aria-label="Ligar"></button></div>`;
          slider = null;
          ctl.querySelector(".sw").addEventListener("click", (e) => {
            e.stopPropagation();
            toggle();
          });
        }
      }
      if (slider && Date.now() - commandedAt > 1200) slider.sync();
    });
  }

  function coverCard(entityId, { strip = null } = {}) {
    const gate = isGate(entityId);
    const node = el(`<div class="card covercard">
      <div class="card-top">
        <div><div class="card-name"></div><div class="card-state"></div></div>
        <div class="glyph">${icon(gate ? "garage" : "blinds")}</div>
      </div>
      ${gate ? "" : `<div class="ctl">${sliderHTML(0, "Posição", "cover")}</div>`}
      <div class="covbtns">
        <button data-a="open_cover" aria-label="Abrir">${icon("up", "ic-sm")}</button>
        <button data-a="stop_cover" aria-label="Parar">${icon("stop", "ic-sm")}</button>
        <button data-a="close_cover" aria-label="Fechar">${icon("down", "ic-sm")}</button>
      </div>
    </div>`);

    node.querySelectorAll(".covbtns button").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        HA.call("cover", b.dataset.a, entityId);
      }),
    );

    let commandedAt = 0;
    let slider = null;
    if (!gate) {
      slider = wireSlider(
        node.querySelector(".slider"),
        (v) => {
          commandedAt = Date.now();
          HA.call("cover", "set_cover_position", entityId, { position: v });
        },
        () => coverPos(entityId),
      );
    }

    return bind(node, (id) => id === entityId, () => {
      const s = HA.get(entityId);
      const pos = coverPos(entityId);
      const moving = isMoving(entityId);
      node.classList.toggle("is-on", pos > 0 || moving);
      node.classList.toggle("is-unavailable", !s || s.state === "unavailable");
      node.querySelector(".card-name").textContent = shortName(entityId, strip);
      node.querySelector(".card-state").textContent = moving
        ? s.state === "opening"
          ? "A abrir…"
          : "A fechar…"
        : pos === 0
          ? "Fechado"
          : pos === 100
            ? "Aberto"
            : `Aberto a ${fmt.n(pos)} %`;
      if (slider) {
        node.querySelector(".slider").classList.toggle("moving", moving);
        if (Date.now() - commandedAt > 1200) slider.sync();
      }
    });
  }

  const MODES = [
    ["off", "Desl.", "minus"],
    ["cool", "Frio", "snow"],
    ["heat", "Calor", "flame"],
    ["fan_only", "Vent.", "fan"],
  ];

  function climateCard(entityId) {
    const node = el(`<div class="card climatecard">
      <div class="card-top">
        <div><div class="card-name"></div><div class="card-state"></div></div>
        <div class="glyph">${icon("ac")}</div>
      </div>
      <div class="clim">
        <div><div class="big num"></div><div class="card-state now"></div></div>
        <div class="stepper">
          <button data-step="-0.5" aria-label="Baixar">${icon("minus", "ic-sm")}</button>
          <button data-step="0.5" aria-label="Subir">${icon("plus", "ic-sm")}</button>
        </div>
      </div>
      <div class="modes">${MODES.map(
        (m) => `<button data-mode="${m[0]}">${icon(m[2], "ic-sm")}<span>${m[1]}</span></button>`,
      ).join("")}</div>
    </div>`);

    node.querySelectorAll("[data-step]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const cur = HA.attr(entityId, "temperature", 21);
        HA.call("climate", "set_temperature", entityId, {
          temperature: Math.max(16, Math.min(30, cur + Number(b.dataset.step))),
        });
      }),
    );
    node.querySelectorAll("[data-mode]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        HA.call("climate", "set_hvac_mode", entityId, { hvac_mode: b.dataset.mode });
      }),
    );

    return bind(node, (id) => id === entityId, () => {
      const s = HA.get(entityId);
      if (!s) return;
      const on = s.state !== "off";
      const action = s.attributes.hvac_action || "";
      node.classList.toggle("is-on", on);
      node.classList.toggle("heating", action === "heating");
      node.classList.toggle("cooling", action === "cooling");
      node.querySelector(".card-name").textContent = HA.name(entityId);
      const actions = {
        heating: "a aquecer",
        cooling: "a arrefecer",
        idle: "em espera",
        fan: "a ventilar",
        drying: "a desumidificar",
        off: "desligado",
      };
      node.querySelector(".card-state").textContent = on ? actions[action] || "ligado" : "Desligado";
      node.querySelector(".big").innerHTML = on
        ? `${fmt.n(s.attributes.temperature, 1)}<small>°</small>`
        : `<span style="font-size:var(--t-lg);color:var(--c-ink-3)">—</span>`;
      node.querySelector(".now").textContent = `Agora ${fmt.temp(s.attributes.current_temperature)} na divisão`;
      node.querySelectorAll("[data-mode]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === s.state)),
      );
    });
  }

  function plugCard(cfg) {
    const entityId = cfg.entity || cfg;
    const node = el(`<div class="card">
      <div class="card-top">
        <div><div class="card-name">${esc(cfg.name || "")}</div><div class="card-state"></div></div>
        <div class="glyph">${icon(cfg.icon || "plug")}</div>
      </div>
      <div style="display:flex;justify-content:flex-end"><button class="sw" role="switch"></button></div>
    </div>`);
    const domain = entityId.split(".")[0];
    const toggle = () => HA.call(domain, HA.isOn(entityId) ? "turn_off" : "turn_on", entityId);
    node.addEventListener("click", toggle);
    node.querySelector(".sw").addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
    return bind(node, (id) => id === entityId, () => {
      const on = HA.isOn(entityId);
      node.classList.toggle("is-on", on);
      node.querySelector(".card-name").textContent = cfg.name || HA.name(entityId);
      node.querySelector(".card-state").textContent = HA.isUnavailable(entityId) ? "Sem resposta" : on ? "Ligado" : "Desligado";
      node.querySelector(".sw").setAttribute("aria-checked", String(on));
    });
  }

  function lockCard(entityId) {
    const node = el(`<div class="card">
      <div class="card-top">
        <div><div class="card-name"></div><div class="card-state"></div></div>
        <div class="glyph">${icon("lock")}</div>
      </div>
      <div style="display:flex;justify-content:flex-end"><button class="sw" role="switch"></button></div>
    </div>`);
    const toggle = () => {
      const locked = (HA.get(entityId) || {}).state === "locked";
      HA.call("lock", locked ? "unlock" : "lock", entityId);
    };
    node.addEventListener("click", toggle);
    node.querySelector(".sw").addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
    return bind(node, (id) => id === entityId, () => {
      const locked = (HA.get(entityId) || {}).state === "locked";
      node.classList.toggle("is-on", !locked);
      node.querySelector(".card-name").textContent = HA.name(entityId);
      node.querySelector(".card-state").textContent = locked ? "Trancada" : "Destrancada";
      node.querySelector(".sw").setAttribute("aria-checked", String(!locked));
    });
  }

  function cameraTile(cam, { small = false } = {}) {
    const node = el(`<button class="cam ${small ? "cam-sm" : ""}">
      <img alt="${esc(cam.name)}" />
      <span class="live"><i></i>AO VIVO</span>
      <span class="cl">${esc(cam.name)}</span>
    </button>`);
    const img = node.querySelector("img");
    // Só paramos depois de o cartão ter estado na página: à primeira passagem
    // ainda não está inserido, e antes isto cancelava o temporizador logo.
    const tick = () => {
      if (node.isConnected) node.__mounted = true;
      else if (node.__mounted) {
        clearInterval(timer);
        return;
      }
      img.src = HA.cameraUrl(cam.entity, Date.now());
    };
    const timer = setInterval(tick, 2000);
    tick();
    node.addEventListener("click", () => {
      const big = el('<div><img alt="" style="width:100%;border-radius:var(--r-lg);display:block"></div>');
      const bigImg = big.querySelector("img");
      const t = setInterval(() => {
        if (big.isConnected) big.__mounted = true;
        else if (big.__mounted) {
          clearInterval(t);
          return;
        }
        bigImg.src = HA.cameraUrl(cam.entity, Date.now());
      }, 1000);
      bigImg.src = HA.cameraUrl(cam.entity, Date.now());
      window.UI.sheet(cam.name, big, { subtitle: "Imagem ao vivo" });
    });
    return node;
  }

  const FLOORS = { piso_0: "Piso 0", piso_1: "Piso 1", exterior: "Exterior" };

  function roomCard(room) {
    const node = el(`<button class="card room">
      <div class="card-top"><div>
        <div class="rname">${esc(room.name)}</div><div class="rtemp"></div>
      </div></div>
      <div class="rchips"></div>
    </button>`);
    node.addEventListener("click", () => openRoom(room));
    const watched = [
      ...(room.lights || []),
      ...(room.covers || []),
      room.climate,
      room.temperature,
      room.humidity,
      room.contact,
    ].filter(Boolean);

    return bind(node, (id) => watched.includes(id), () => {
      const on = (room.lights || []).filter((l) => HA.isOn(l)).length;
      const open = (room.covers || []).filter((c) => coverPos(c) > 0).length;
      const t = room.temperature ? HA.num(room.temperature) : null;
      const h = room.humidity ? HA.num(room.humidity) : null;

      node.classList.toggle("is-on", on > 0);
      node.querySelector(".rtemp").textContent =
        t !== null ? `${fmt.n(t, 1)} °C${h !== null ? ` · ${fmt.n(h)} %` : ""}` : FLOORS[room.floor] || "";

      const chips = [];
      if ((room.lights || []).length)
        chips.push(`<span class="chip ${on ? "lit" : ""}">${icon("bulb")}${on}/${room.lights.length}</span>`);
      if ((room.covers || []).length)
        chips.push(`<span class="chip">${icon("blinds")}${open}/${room.covers.length}</span>`);
      if (room.climate) {
        const st = (HA.get(room.climate) || {}).state;
        const act = HA.attr(room.climate, "hvac_action", "");
        const MODE = { off: "Desl.", cool: "Frio", heat: "Calor", fan_only: "Vento", dry: "Secar", heat_cool: "Auto" };
        chips.push(
          `<span class="chip ${act === "cooling" ? "cool" : act === "heating" ? "heat" : ""}">${icon("ac")}${MODE[st] || "Ligado"}</span>`,
        );
      }
      if (room.camera) chips.push(`<span class="chip">${icon("camera")}</span>`);
      if (room.contact && HA.isOn(room.contact))
        chips.push(`<span class="chip warn">${icon("window")}Aberta</span>`);
      node.querySelector(".rchips").innerHTML = chips.join("");
    });
  }

  function openRoom(room) {
    const body = el("<div></div>");
    const section = (title, node) => {
      if (!node) return;
      body.appendChild(el(`<div class="secthead" style="margin-top:var(--s-6)"><h2>${esc(title)}</h2></div>`));
      body.appendChild(node);
    };

    // sensores em linha, sem cartões
    const sensors = [];
    if (room.temperature) sensors.push(["thermo", "Temperatura", () => fmt.temp(HA.num(room.temperature))]);
    if (room.humidity) sensors.push(["drop", "Humidade", () => fmt.pct(HA.num(room.humidity))]);
    if (room.motion)
      sensors.push(["motion", "Movimento", () => (HA.isOn(room.motion) ? "Agora" : "Sem movimento")]);
    if (room.contact)
      sensors.push(["door", "Porta", () => (HA.isOn(room.contact) ? "Aberta" : "Fechada")]);
    if (sensors.length) {
      const list = el('<div class="list"></div>');
      sensors.forEach(([ic, label, value]) => {
        const li = el(`<div class="li">${icon(ic)}<span class="lname">${esc(label)}</span><span class="lval"></span></div>`);
        bind(li, (id) => [room.temperature, room.humidity, room.motion, room.contact].includes(id), () => {
          li.querySelector(".lval").textContent = value();
        });
        list.appendChild(li);
      });
      body.appendChild(list);
    }

    if (room.camera) {
      const holder = el('<div style="margin-top:var(--s-4)"></div>');
      holder.appendChild(cameraTile({ entity: room.camera, name: room.name }));
      body.appendChild(holder);
    }
    if ((room.lights || []).length) {
      const grid = el('<div class="gridauto"></div>');
      room.lights.forEach((l) => grid.appendChild(lightCard(l, { strip: room.name })));
      section("Iluminação", grid);
    }
    if ((room.covers || []).length) {
      const grid = el('<div class="gridauto"></div>');
      room.covers.forEach((c) => grid.appendChild(coverCard(c, { strip: room.name })));
      section("Estores", grid);
    }
    if (room.climate) section("Climatização", climateCard(room.climate));
    if (room.lock) {
      const grid = el('<div class="gridauto"></div>');
      grid.appendChild(lockCard(room.lock));
      section("Segurança", grid);
    }
    if ((room.switches || []).length) {
      const grid = el('<div class="gridauto"></div>');
      room.switches.forEach((s) => grid.appendChild(plugCard(s)));
      section("Tomadas", grid);
    }

    window.UI.sheet(room.name, body, { subtitle: FLOORS[room.floor] || "" });
  }

  // ═════════ Início ═════════

  function scenesRow() {
    const scenes = CFG.scenes || [];
    if (!scenes.length) return null;
    const row = el('<div class="scroller"></div>');
    scenes.forEach((s) => {
      const b = el(`<button class="scene">${icon(s.icon || "movie", "ic-lg")}<span class="sn">${esc(s.name)}</span></button>`);
      b.addEventListener("click", () => {
        HA.call(s.entity.split(".")[0], "turn_on", s.entity);
        window.UI.toast(`${s.name}`);
      });
      row.appendChild(b);
    });
    return row;
  }

  function energyRow() {
    const E = CFG.energy || {};
    const P = E.power || {};
    const list = el('<div class="list"></div>');
    const rows = [
      ["solar", "Solar", P.solar, "c-solar"],
      ["house-power", "Casa", P.home, ""],
      ["grid", "Rede", P.grid, "c-grid"],
      ["battery", "Bateria", E.battery_soc, "c-batt"],
    ].filter((r) => r[2]);

    rows.forEach(([ic, label, entity, tone]) => {
      const li = el(`<div class="li">${icon(ic)}<span class="lname">${esc(label)}</span><span class="lval"></span></div>`);
      if (tone) li.querySelector(".ic").style.color = `var(--${tone})`;
      bind(li, (id) => id === entity || id === P.battery, () => {
        const v = HA.num(entity);
        if (label === "Bateria") {
          const flow = HA.num(P.battery);
          li.querySelector(".lval").innerHTML = `${fmt.pct(v)}<small>${flow > 20 ? "a carregar" : flow < -20 ? "a descarregar" : "em repouso"}</small>`;
        } else if (label === "Rede") {
          li.querySelector(".lval").innerHTML = `${fmt.power(Math.abs(v || 0))}<small>${v > 20 ? "a importar" : v < -20 ? "a exportar" : "em equilíbrio"}</small>`;
        } else {
          li.querySelector(".lval").textContent = fmt.power(v);
        }
      });
      list.appendChild(li);
    });
    return list;
  }

  function homeView() {
    const node = el('<div class="view bleed"></div>');
    node.appendChild(windowStrip());
    node.appendChild(readout());

    const cols = el('<div class="home-cols"></div>');
    const left = el("<div></div>");
    const right = el("<div></div>");

    const scenes = scenesRow();
    if (scenes) {
      const s = el('<div class="sect"><div class="secthead"><h2>Cenas</h2></div></div>');
      s.appendChild(scenes);
      left.appendChild(s);
    }

    const roomsSect = el(
      '<div class="sect"><div class="secthead"><h2>Divisões</h2><a href="#/divisoes">Ver todas</a></div></div>',
    );
    const grid = el('<div class="gridauto"></div>');
    rooms()
      .filter((r) => (r.lights || []).length || (r.covers || []).length || r.climate)
      .slice(0, 6)
      .forEach((r) => grid.appendChild(roomCard(r)));
    roomsSect.appendChild(grid);
    left.appendChild(roomsSect);

    const energySect = el(
      '<div class="sect"><div class="secthead"><h2>Energia agora</h2><a href="#/energia">Ver tudo</a></div></div>',
    );
    energySect.appendChild(energyRow());
    right.appendChild(energySect);

    const cams = (CFG.cameras || []).slice(0, 3);
    if (cams.length) {
      const camSect = el(
        '<div class="sect"><div class="secthead"><h2>Câmaras</h2><a href="#/cameras">Ver todas</a></div></div>',
      );
      const camRow = el('<div class="scroller"></div>');
      cams.forEach((c) => camRow.appendChild(cameraTile(c, { small: true })));
      camSect.appendChild(camRow);
      right.appendChild(camSect);
    }

    cols.append(left, right);
    node.appendChild(cols);
    return node;
  }

  // ═════════ Divisões ═════════

  function roomsView() {
    const node = el('<div class="view"></div>');
    node.appendChild(el('<div class="head"><div><h1>Divisões</h1><div class="sub">Toca numa divisão para abrir tudo o que ela tem</div></div></div>'));
    (CFG.floors || []).forEach((floor) => {
      const list = rooms().filter((r) => r.floor === floor.id);
      if (!list.length) return;
      const sect = el(`<div class="sect"><div class="secthead"><h2>${esc(floor.name)}</h2></div></div>`);
      const grid = el('<div class="gridauto"></div>');
      list.forEach((r) => grid.appendChild(roomCard(r)));
      sect.appendChild(grid);
      node.appendChild(sect);
    });
    return node;
  }

  // ═════════ Controlos ═════════

  const KINDS = [
    ["luzes", "Luzes"],
    ["estores", "Estores"],
    ["clima", "Clima"],
  ];

  function controlsView(kind = "luzes") {
    const node = el('<div class="view"></div>');
    node.appendChild(el('<div class="head"><div><h1>Controlos</h1><div class="sub">Tudo o que se liga, abre e aquece</div></div></div>'));
    const seg = el(
      `<div class="segmented">${KINDS.map((k) => `<button data-k="${k[0]}" aria-pressed="${k[0] === kind}">${k[1]}</button>`).join("")}</div>`,
    );
    seg.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        location.hash = `#/controlos/${b.dataset.k}`;
      }),
    );
    node.appendChild(seg);

    rooms().forEach((room) => {
      let items = [];
      if (kind === "luzes") items = [...(room.lights || []), ...(room.switches || [])];
      if (kind === "estores") items = room.covers || [];
      if (kind === "clima") items = room.climate ? [room.climate] : [];
      if (!items.length) return;
      const sect = el(`<div class="sect"><div class="secthead"><h2>${esc(room.name)}</h2></div></div>`);
      const grid = el('<div class="gridauto"></div>');
      items.forEach((it) => {
        if (kind === "luzes")
          grid.appendChild(typeof it === "string" ? lightCard(it, { strip: room.name }) : plugCard(it));
        else if (kind === "estores") grid.appendChild(coverCard(it, { strip: room.name }));
        else grid.appendChild(climateCard(it));
      });
      sect.appendChild(grid);
      node.appendChild(sect);
    });
    return node;
  }

  // ═════════ Câmaras ═════════

  function camerasView() {
    const node = el('<div class="view"></div>');
    node.appendChild(el('<div class="head"><div><h1>Câmaras</h1><div class="sub">Imagem ao vivo, a atualizar de 2 em 2 segundos</div></div></div>'));
    const grid = el('<div class="gridauto"></div>');
    (CFG.cameras || []).forEach((c) => grid.appendChild(cameraTile(c)));
    node.appendChild((CFG.cameras || []).length ? grid : el('<div class="empty">Sem câmaras nesta casa.</div>'));
    return node;
  }

  // ═════════ Energia ═════════

  const PERIODS = [
    { id: "hoje", label: "Hoje", period: "hour", days: 0 },
    { id: "7d", label: "7 dias", period: "day", days: 7 },
    { id: "30d", label: "30 dias", period: "day", days: 30 },
  ];

  function energyFlow() {
    const E = CFG.energy || {};
    const P = E.power || {};
    const node = el(`<div class="flow">
      <div class="node solar"><div class="nring">${icon("solar", "ic-lg")}</div><div class="nv"></div><div class="nl">Solar</div></div>
      <div class="arrow sol"><div class="dashes"></div><div class="aw"></div></div>
      <div class="node house"><div class="nring">${icon("house-power", "ic-lg")}</div><div class="nv"></div><div class="nl">Casa</div></div>
      <div class="arrow bat"><div class="dashes"></div><div class="aw"></div></div>
      <div class="node batt"><div class="nring">${icon("battery", "ic-lg")}</div><div class="nv"></div><div class="nl">Bateria</div></div>
    </div>`);

    const watch = [P.home, P.solar, P.grid, P.battery, E.battery_soc].filter(Boolean);
    return bind(node, (id) => watch.includes(id), () => {
      const home = HA.num(P.home);
      const solar = HA.num(P.solar);
      const grid = HA.num(P.grid);
      const batt = HA.num(P.battery);
      const soc = HA.num(E.battery_soc);
      const nodes = node.querySelectorAll(".node");
      nodes[0].querySelector(".nv").textContent = fmt.power(solar);
      nodes[1].querySelector(".nv").textContent = fmt.power(home);
      nodes[2].querySelector(".nv").textContent = fmt.pct(soc);
      nodes[0].classList.toggle("idle", !(solar > 20));
      nodes[2].classList.toggle("idle", Math.abs(batt || 0) < 20);

      const arrows = node.querySelectorAll(".arrow");
      arrows[0].classList.toggle("dead", !(solar > 20));
      arrows[0].querySelector(".aw").textContent = solar > 20 ? fmt.power(solar) : "";
      arrows[1].classList.toggle("dead", Math.abs(batt || 0) < 20);
      arrows[1].querySelector(".aw").textContent =
        batt > 20 ? `a guardar` : batt < -20 ? `a dar ${fmt.power(Math.abs(batt))}` : "";

      let note = node.querySelector(".gridnote");
      if (!note) {
        note = el('<div class="gridnote caps" style="grid-column:1/-1;text-align:center;margin-top:var(--s-3)"></div>');
        node.appendChild(note);
      }
      note.textContent =
        grid === null
          ? ""
          : grid > 20
            ? `da rede ${fmt.power(grid)}`
            : grid < -20
              ? `para a rede ${fmt.power(Math.abs(grid))}`
              : "rede em equilíbrio";
    });
  }

  function energyView(periodId = "hoje") {
    const E = CFG.energy || {};
    const period = PERIODS.find((p) => p.id === periodId) || PERIODS[0];
    const node = el('<div class="view"></div>');
    node.appendChild(
      el('<div class="head"><div><h1>Energia</h1><div class="sub">De onde vem e para onde vai</div></div></div>'),
    );
    node.appendChild(energyFlow());

    const seg = el(
      `<div class="segmented" style="margin-top:var(--s-6)">${PERIODS.map(
        (p) => `<button data-p="${p.id}" aria-pressed="${p.id === period.id}">${p.label}</button>`,
      ).join("")}</div>`,
    );
    seg.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => {
        location.hash = `#/energia/${b.dataset.p}`;
      }),
    );
    node.appendChild(seg);

    const chart = el(`<div class="chart" style="margin-top:var(--s-4)">
      <div class="secthead"><h2>Consumo</h2></div>
      <div class="bars loading">${Array.from({ length: 14 })
        .map(() => "<div></div>")
        .join("")}</div>
      <div class="xaxis"></div>
      <div class="legend"></div>
    </div>`);
    node.appendChild(chart);

    const totals = el('<div class="list" style="margin-top:var(--s-4)"></div>');
    node.appendChild(totals);

    const circuits = el('<div class="sect"><div class="secthead"><h2>Por circuito</h2></div><div class="list"></div></div>');
    node.appendChild(circuits);

    loadEnergy(period, chart, totals, circuits.querySelector(".list"));
    return node;
  }

  async function loadEnergy(period, chart, totalsNode, circuitsNode) {
    const E = CFG.energy || {};
    const T = E.totals || {};
    const circuitIds = (E.circuits || []).map((c) => c.entity);
    const ids = [T.home, T.solar, T.import, T.export, T.discharge, ...circuitIds].filter(Boolean);
    const now = new Date();
    const start = new Date(now);
    if (period.days === 0) start.setHours(0, 0, 0, 0);
    else start.setDate(start.getDate() - period.days);

    try {
      const stats = await HA.statistics(ids, start, null, period.period);
      const series = (id) => (stats[id] || []).map((r) => Math.max(0, r.change || 0));
      const total = (id) => series(id).reduce((a, b) => a + b, 0);
      const labels = (stats[T.home] || stats[T.solar] || []).map((r) => {
        const d = new Date(r.start);
        return period.period === "hour" ? `${String(d.getHours()).padStart(2, "0")}h` : `${d.getDate()}/${d.getMonth() + 1}`;
      });

      const imp = series(T.import);
      const sol = series(T.solar);
      const bat = series(T.discharge);
      const max = Math.max(0.01, ...labels.map((_, i) => (imp[i] || 0) + (sol[i] || 0) + (bat[i] || 0)));

      const bars = chart.querySelector(".bars");
      bars.classList.remove("loading");
      bars.innerHTML = labels
        .map((l, i) => {
          const seg = (v, cls) =>
            v > 0 ? `<i class="${cls}" style="height:${(v / max) * 100}%"></i>` : "";
          return `<div title="${l}: ${fmt.energy((imp[i] || 0) + (sol[i] || 0) + (bat[i] || 0), 2)}">
            ${seg(imp[i], "b-imp")}${seg(sol[i], "b-sol")}${seg(bat[i], "b-bat")}</div>`;
        })
        .join("");
      chart.querySelector(".xaxis").innerHTML = labels.length
        ? `<span>${labels[0]}</span><span>${labels[Math.floor(labels.length / 2)]}</span><span>${labels[labels.length - 1]}</span>`
        : "";
      chart.querySelector(".legend").innerHTML = `
        <span><i style="background:var(--c-solar)"></i>Solar</span>
        <span><i style="background:var(--c-grid)"></i>Rede</span>
        <span><i style="background:var(--c-batt)"></i>Bateria</span>`;

      const consumo = total(T.home);
      const solar = total(T.solar);
      const imported = total(T.import);
      const exported = total(T.export);
      const tarifa = E.tariff || 0;
      const venda = E.feed_in || 0;
      const indep = consumo > 0 ? Math.max(0, Math.min(100, ((consumo - imported) / consumo) * 100)) : 0;

      totalsNode.innerHTML = `
        <div class="li">${icon("house-power")}<span class="lname">Consumo da casa</span><span class="lval">${fmt.energy(consumo)}</span></div>
        <div class="li">${icon("solar")}<span class="lname">Produção solar</span><span class="lval">${fmt.energy(solar)}</span></div>
        <div class="li">${icon("grid")}<span class="lname">Comprado à rede</span><span class="lval">${fmt.money(imported * tarifa)}<small>${fmt.energy(imported)}</small></span></div>
        <div class="li">${icon("bolt")}<span class="lname">Poupado com o sol</span><span class="lval">${fmt.money((consumo - imported) * tarifa + exported * venda)}<small>${fmt.n(indep)} % sem a rede</small></span></div>`;
      totalsNode.querySelectorAll(".li")[1].querySelector(".ic").style.color = "var(--c-solar)";
      totalsNode.querySelectorAll(".li")[2].querySelector(".ic").style.color = "var(--c-grid)";

      const circuits = (E.circuits || [])
        .map((c) => ({ ...c, v: total(c.entity) }))
        .filter((c) => c.v > 0.005)
        .sort((a, b) => b.v - a.v);
      const cmax = Math.max(0.01, ...circuits.map((c) => c.v));
      circuitsNode.innerHTML = circuits.length
        ? circuits
            .map(
              (c) => `<div class="li">${icon(c.icon || "plug")}
          <span class="lname">${esc(c.name)}</span>
          <span class="track"><i style="width:${(c.v / cmax) * 100}%"></i></span>
          <span class="lval">${fmt.energy(c.v)}<small>${fmt.money(c.v * tarifa)}</small></span></div>`,
            )
            .join("")
        : '<div class="empty">Ainda não há consumo registado neste período.</div>';
    } catch (err) {
      chart.querySelector(".bars").classList.remove("loading");
      chart.querySelector(".bars").innerHTML = "";
      chart.querySelector(".legend").innerHTML =
        '<span style="color:var(--c-warn)">Não foi possível ler o histórico.</span>';
      console.error("Casa OS: estatísticas", err);
    }
  }

  window.VIEWS = { homeView, roomsView, controlsView, camerasView, energyView, openRoom };
})();
