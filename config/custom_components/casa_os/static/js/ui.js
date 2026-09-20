/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — peças partilhadas: ícones, números em português, o céu da
 *  janela, painéis e avisos.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );

  /** Ícone da folha de símbolos (ver static/sprite.svg). */
  const icon = (name, cls) => `<svg class="ic ${cls || ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  // ───────── Números à portuguesa ─────────

  /** 1234.5 → "1 234,5" (espaço fino nos milhares, vírgula decimal). */
  function nf(v, dec) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
    const s = Number(v)
      .toFixed(dec === undefined ? 0 : dec)
      .replace(".", ",");
    const parts = s.split(",");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(",");
  }

  const fmt = {
    n: nf,
    power(v) {
      if (v === null || v === undefined) return "—";
      return Math.abs(v) >= 1000 ? `${nf(v / 1000, 2)} kW` : `${nf(v)} W`;
    },
    energy(v, dec = 1) {
      return v === null || v === undefined ? "—" : `${nf(v, dec)} kWh`;
    },
    temp(v, dec = 1) {
      return v === null || v === undefined ? "—" : `${nf(v, dec)} °C`;
    },
    pct(v) {
      return v === null || v === undefined ? "—" : `${nf(v)} %`;
    },
    money(v, cur = "€") {
      return `${nf(v, 2)} ${cur}`;
    },
    /** "07:21" a partir de minutos desde a meia-noite */
    hm(min) {
      return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min) % 60).padStart(2, "0")}`;
    },
  };

  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return "Boa noite";
    if (h < 13) return "Bom dia";
    if (h < 20) return "Boa tarde";
    return "Boa noite";
  }

  // ───────── O céu da janela ─────────

  const VB_W = 72;
  const VB_H = 88;
  const GOLDEN = 20;

  const SKY = {
    clear: {
      day: "linear-gradient(180deg,#2b7ed0 0%,#74b6f0 55%,#cfe9ff 100%)",
      golden: "linear-gradient(180deg,#243a6b 0%,#7d5e95 45%,#df8350 75%,#ffd79c 100%)",
      night: "linear-gradient(180deg,#060b20 0%,#122651 60%,#284a86 100%)",
    },
    cloudy: {
      day: "linear-gradient(180deg,#7d93a8 0%,#b4c3d0 60%,#d9e1e8 100%)",
      golden: "linear-gradient(180deg,#5d6480 0%,#a3849a 55%,#e3b089 100%)",
      night: "linear-gradient(180deg,#222a35 0%,#36414f 100%)",
    },
    rain: {
      day: "linear-gradient(180deg,#48535d 0%,#73808a 60%,#97a4ad 100%)",
      golden: "linear-gradient(180deg,#41474f 0%,#7c7079 55%,#b39079 100%)",
      night: "linear-gradient(180deg,#141a22 0%,#283340 100%)",
    },
  };

  const DROPS = Array.from({ length: 46 }).map((_, i) => ({
    left: (i * 31) % 100,
    delay: ((i % 9) * 0.09).toFixed(2),
    dur: (0.5 + (i % 5) * 0.09).toFixed(2),
    len: 11 + (i % 4) * 4,
    op: (0.5 + (i % 4) * 0.14).toFixed(2),
  }));

  const r2 = (n) => Math.round(n * 100) / 100;

  function conditionOf(state) {
    if (!state) return "clear";
    if (["rainy", "pouring", "lightning-rainy", "lightning", "snowy", "snowy-rainy", "hail"].includes(state))
      return "rain";
    if (["cloudy", "partlycloudy", "fog", "windy", "windy-variant"].includes(state)) return "cloudy";
    return "clear";
  }

  function sunTimes() {
    const sun = window.HA.get("sun.sun");
    const toMin = (iso) => {
      const d = new Date(iso);
      return d.getHours() * 60 + d.getMinutes();
    };
    if (!sun || !sun.attributes.next_rising || !sun.attributes.next_setting)
      return { sr: 7 * 60 + 21, ss: 19 * 60 + 38 };
    return { sr: toMin(sun.attributes.next_rising), ss: toMin(sun.attributes.next_setting) };
  }

  function moonPhase() {
    const synodic = 29.530588853;
    const ref = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
    const days = Date.now() / 86400000 - ref;
    const phase = (((days % synodic) + synodic) % synodic) / synodic;
    return { phase, fraction: (1 - Math.cos(2 * Math.PI * phase)) / 2 };
  }

  let moonSeq = 0;

  function skyModel(weatherEntity) {
    const w = window.HA.get(weatherEntity);
    const condition = conditionOf(w && w.state);
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    const { sr, ss } = sunTimes();
    const phase =
      min < sr || min >= ss ? "night" : min <= sr + GOLDEN || min >= ss - GOLDEN ? "golden" : "day";
    const noon = (sr + ss) / 2;
    const half = Math.max(1, (ss - sr) / 2);
    const t = Math.max(-1.15, Math.min(1.15, (min - noon) / half));
    const elev = Math.max(0, 1 - t * t);
    const sun = { cx: r2(36 + t * 27), cy: r2(70 - elev * 52) };
    return {
      condition,
      phase,
      sun,
      sr,
      ss,
      key: `${condition}|${phase}|${Math.round(sun.cx)}|${Math.round(sun.cy)}`,
    };
  }

  function skyHTML(m) {
    const night = m.phase === "night";
    const showSun = !night && m.condition !== "rain";
    const bright = m.condition === "clear";
    let svg = "";

    if (night && m.condition === "clear") {
      const pts = [[16, 16], [30, 27], [62, 13], [22, 38], [44, 10], [56, 31], [12, 52], [66, 44]];
      svg += `<g fill="#fff">${pts
        .map(
          ([x, y], i) =>
            `<circle cx="${x}" cy="${y}" r="${i % 2 ? 0.8 : 1.1}" style="animation:twinkle ${2 + (i % 3)}s ease-in-out ${i * 0.4}s infinite"/>`,
        )
        .join("")}</g>`;
    }

    if (showSun) {
      let rays = "";
      if (bright) {
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 6;
          const r1 = 12.5;
          const r3 = i % 2 === 0 ? 17.5 : 15.5;
          rays += `<line x1="${r2(m.sun.cx + Math.cos(a) * r1)}" y1="${r2(m.sun.cy + Math.sin(a) * r1)}" x2="${r2(m.sun.cx + Math.cos(a) * r3)}" y2="${r2(m.sun.cy + Math.sin(a) * r3)}"/>`;
        }
        rays = `<g stroke="#ffe39a" stroke-width="1.5" stroke-linecap="round" opacity=".9"><animateTransform attributeName="transform" type="rotate" from="0 ${m.sun.cx} ${m.sun.cy}" to="360 ${m.sun.cx} ${m.sun.cy}" dur="60s" repeatCount="indefinite"/>${rays}</g>`;
      }
      svg += `${rays}<circle cx="${m.sun.cx}" cy="${m.sun.cy}" r="11" fill="${bright ? "#ffe39a" : "#e6edf2"}" opacity="${bright ? 0.5 : 0.4}"/>
        <circle cx="${m.sun.cx}" cy="${m.sun.cy}" r="8.5" fill="${bright ? "#ffd454" : "#eef3f6"}"/>`;
    }

    if (night) {
      const id = `m${++moonSeq}`;
      const moon = moonPhase();
      const cx = 50, cy = 24, r = 9;
      const dx = (moon.phase < 0.5 ? -1 : 1) * 2 * r * moon.fraction;
      svg += `<defs><mask id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/><circle cx="${cx + dx}" cy="${cy}" r="${r + 0.4}" fill="#000"/></mask></defs>
        <g mask="url(#${id})"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ece4c8"/>
        <circle cx="${cx - 3}" cy="${cy - 2}" r="1.6" fill="#d6cdac"/><circle cx="${cx + 2}" cy="${cy + 3}" r="1.2" fill="#d6cdac"/></g>`;
    }

    if (m.condition !== "clear") {
      const fill = m.condition === "rain" || night ? "#54626d" : "#f4f7fa";
      const cloud = (x, y, s) =>
        `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-20" y="-1" width="40" height="11" rx="5.5"/><circle cx="-11" cy="-1" r="8"/><circle cx="1" cy="-7" r="10.5"/><circle cx="12" cy="-2" r="8"/></g>`;
      const layer = (y, s, o, dur) =>
        `<g fill="${fill}" opacity="${o}"><animateTransform attributeName="transform" type="translate" from="0 0" to="-${VB_W} 0" dur="${dur}s" repeatCount="indefinite"/>${cloud(20, y, s)}${cloud(20 + VB_W, y, s)}</g>`;
      svg += layer(30, 0.55, night ? 0.4 : 0.55, 34) + layer(48, 0.95, night ? 0.85 : 0.95, 23);
    }

    const glow = showSun
      ? bright
        ? m.phase === "golden"
          ? "rgba(255,170,90,.95)"
          : "rgba(255,221,120,.9)"
        : "rgba(255,255,255,.45)"
      : night
        ? "rgba(220,230,255,.3)"
        : null;
    const gx = night ? 50 : m.sun.cx;
    const gy = night ? 24 : m.sun.cy;

    return `<div class="sky" style="background:${SKY[m.condition][m.phase]}">
      ${m.phase === "golden" ? '<div class="sky-golden"></div>' : ""}
      ${glow ? `<div class="sky-glow" style="left:${(gx / VB_W) * 100}%;top:${(gy / VB_H) * 100}%;background:radial-gradient(circle,${glow} 0%,transparent 62%)"></div>` : ""}
      <svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMid slice">${svg}</svg>
      ${
        m.condition === "rain"
          ? `<div class="rain">${DROPS.map(
              (d) =>
                `<span style="left:${d.left}%;height:${d.len}px;opacity:${d.op};animation-duration:${d.dur}s;animation-delay:${d.delay}s"></span>`,
            ).join("")}</div>`
          : ""
      }
    </div>`;
  }

  /** Céu vivo dentro de `host`: muda com o tempo, com o sol e com as horas. */
  function mountSky(host, weatherEntity) {
    let key = null;
    const render = () => {
      const m = skyModel(weatherEntity);
      if (m.key === key) return;
      key = m.key;
      host.innerHTML = skyHTML(m);
    };
    render();
    const unsub = window.HA.subscribe((id) => {
      if (id === "*" || id === weatherEntity || id === "sun.sun") render();
    });
    const timer = setInterval(() => {
      if (!host.isConnected) {
        clearInterval(timer);
        unsub();
        return;
      }
      render();
    }, 60000);
  }

  // ───────── Painéis ─────────

  const openSheets = new Set();

  function closeSheets() {
    [...openSheets].forEach((close) => close());
  }

  function sheet(title, contentNode, { subtitle = "" } = {}) {
    const scrim = el('<div class="scrim"></div>');
    const node = el(`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-head">
        <div><h2>${esc(title)}</h2>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}</div>
        <button class="iconbtn" data-close aria-label="Fechar">${icon("plus", "ic-sm")}</button>
      </div>
    </div>`);
    node.querySelector("[data-close] svg").style.transform = "rotate(45deg)";
    node.appendChild(contentNode);

    const close = () => {
      openSheets.delete(close);
      scrim.remove();
      node.remove();
      if (!openSheets.size) document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    scrim.addEventListener("click", close);
    node.querySelector("[data-close]").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    openSheets.add(close);
    document.body.style.overflow = "hidden";
    document.body.append(scrim, node);
    return { close, node };
  }

  let toastHost = null;
  function toast(message) {
    if (!toastHost) {
      toastHost = el('<div class="toasts" aria-live="polite"></div>');
      document.body.appendChild(toastHost);
    }
    const t = el(`<div class="toast">${esc(message)}</div>`);
    toastHost.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  window.UI = { el, esc, icon, fmt, greeting, skyModel, skyHTML, mountSky, conditionOf, sheet, closeSheets, toast };
})();
