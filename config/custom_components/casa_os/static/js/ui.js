/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — peças de interface partilhadas: ícones, formatação, céu animado,
 *  painéis (sheets), avisos (toasts) e gráficos em SVG.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  // ───────── DOM ─────────

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

  // ───────── Ícones (traço de 1.9, 24×24) ─────────

  const P = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  const ICONS = {
    home: P('<path d="M15 21v-7a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v7"/><path d="M3 10.2 12 3l9 7.2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
    rooms: P('<path d="M4 20v-8a8 8 0 0 1 16 0v8"/><path d="M2 20h20"/><path d="M8 20v-5h8v5"/>'),
    sliders: P('<path d="M4 6h11M19 6h1M4 12h1M9 12h11M4 18h7M15 18h5"/><circle cx="17" cy="6" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="13" cy="18" r="2"/>'),
    bolt: P('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
    camera: P('<path d="m15 10 4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.89L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/>'),
    bulb: P('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>'),
    blinds: P('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M3 12h18M3 16h18"/>'),
    thermo: P('<path d="M14 14.76V4a2 2 0 1 0-4 0v10.76a4 4 0 1 0 4 0z"/>'),
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: P('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    cloud: P('<path d="M17.5 19a4.5 4.5 0 1 0 0-9 6 6 0 0 0-11.6 1.6A4 4 0 0 0 6.5 19z"/>'),
    rain: P('<path d="M16 13a5 5 0 0 0-1-9.9A6 6 0 0 0 4 8a4 4 0 0 0 .5 8H16a3 3 0 0 0 0-3z"/><path d="M8 19v2M12 19v3M16 19v2"/>'),
    sunrise: P('<path d="M12 2v6M4.9 10.9l1.4 1.4M2 18h2M20 18h2M17.7 12.3l1.4-1.4M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>'),
    sunset: P('<path d="M12 10V2M4.9 10.9l1.4 1.4M2 18h2M20 18h2M17.7 12.3l1.4-1.4M22 22H2M16 6l-4 4-4-4M16 18a4 4 0 0 0-8 0"/>'),
    close: P('<path d="M6 18 18 6M6 6l12 12"/>'),
    plus: P('<path d="M12 5v14M5 12h14"/>'),
    minus: P('<path d="M5 12h14"/>'),
    chevron: P('<path d="m9 18 6-6-6-6"/>'),
    snow: P('<path d="M12 2v20M4.2 7l15.6 10M19.8 7 4.2 17"/><path d="m9 4 3 3 3-3M9 20l3-3 3 3"/>'),
    fire: P('<path d="M12 22c4 0 7-2.8 7-7 0-4-3-5-3-9-3 1-4 3.5-4 6 0-1.5-1-3-2.5-3.5C8 11 5 12.5 5 15c0 4.2 3 7 7 7z"/>'),
    fan: P('<circle cx="12" cy="12" r="2"/><path d="M12 10c0-4 1-6 3-6s3 2 1 5M14 12c4 0 6 1 6 3s-2 3-5 1M12 14c0 4-1 6-3 6s-3-2-1-5M10 12c-4 0-6-1-6-3s2-3 5-1"/>'),
    drop: P('<path d="M12 3s6 6.3 6 10a6 6 0 0 1-12 0c0-3.7 6-10 6-10z"/>'),
    power: P('<path d="M12 4v8"/><path d="M7.5 7a7 7 0 1 0 9 0"/>'),
    close_blind: P('<path d="M5 4h14"/><path d="m7 10 5 5 5-5"/><path d="m7 15 5 5 5-5"/>'),
    half_blind: P('<path d="M5 4h14"/><path d="M8 12h8"/><path d="M5 20h14"/>'),
    open_blind: P('<path d="m7 9 5-5 5 5"/><path d="m7 14 5-5 5 5"/><path d="M5 20h14"/>'),
    movie: P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>'),
    exit: P('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>'),
    lock: P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    unlock: P('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
    person: P('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    tv: P('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'),
    coffee: P('<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M6 3v2M10 3v2M14 3v2"/>'),
    plug: P('<path d="M9 3v6M15 3v6"/><path d="M6 9h12v3a6 6 0 0 1-12 0z"/><path d="M12 18v3"/>'),
    ev: P('<rect x="3" y="10" width="12" height="7" rx="2"/><path d="M5 10V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3"/><path d="M6 20v-3M12 20v-3"/><path d="m18 8-2 4h3l-2 4"/>'),
    washer: P('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 8h16"/><circle cx="12" cy="14" r="4"/><path d="M7 5.5h.01M10 5.5h.01"/>'),
    dryer: P('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M4 8h16"/><circle cx="12" cy="14" r="4"/><path d="M10 14c1-1 3 0 4-1"/>'),
    stove: P('<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M4 12h16"/><circle cx="8" cy="9.5" r="1"/><circle cx="12" cy="9.5" r="1"/><circle cx="16" cy="9.5" r="1"/>'),
    ac: P('<rect x="3" y="5" width="18" height="7" rx="2"/><path d="M6 9h12"/><path d="M7 15c0 2 2 2 2 4M12 15c0 2 2 2 2 4M17 15c0 2 2 2 2 4"/>'),
    water: P('<path d="M12 3s6 6.3 6 10a6 6 0 0 1-12 0c0-3.7 6-10 6-10z"/>'),
    heat: P('<path d="M8 3v18M16 3v18"/><path d="M4 8h16M4 16h16"/>'),
    grid_icon: P('<path d="M12 3v18"/><path d="m5 8 7-5 7 5"/><path d="M5 8v11h14V8"/>'),
    battery: P('<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/>'),
    solar: P('<path d="m5 14 2-8h10l2 8z"/><path d="M3 14h18"/><path d="M12 14v4"/><path d="M9 22h6"/>'),
    palette: P('<path d="M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1 3.7A2 2 0 0 1 12 21z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>'),
    offline: P('<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 13a10 10 0 0 1 3-2M19 13a10 10 0 0 0-7-2.9"/><path d="M2 9a16 16 0 0 1 5-3M22 9a16 16 0 0 0-8-3.7"/><path d="M12 20h.01"/>'),
    motion: P('<circle cx="12" cy="4" r="1.6"/><path d="m9 21 2-6-2-3 1-4 4 2 2 3"/><path d="m14 21-1-5"/>'),
    door: P('<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><path d="M4 21h16"/><circle cx="15" cy="12" r="1"/>'),
  };

  const icon = (name, cls = "") => {
    const svg = ICONS[name] || ICONS.plug;
    return cls ? svg.replace("<svg", `<svg class="${cls}"`) : svg;
  };

  // ───────── Formatação ─────────

  const nf = (v, digits = 0) =>
    Number(v).toLocaleString("pt-PT", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const fmt = {
    power(watts) {
      if (watts === null || watts === undefined || Number.isNaN(watts)) return "—";
      const abs = Math.abs(watts);
      return abs >= 1000 ? `${nf(watts / 1000, 2)} kW` : `${nf(watts)} W`;
    },
    energy(kwh, digits = 1) {
      if (kwh === null || kwh === undefined || Number.isNaN(kwh)) return "—";
      return `${nf(kwh, digits)} kWh`;
    },
    temp(v, digits = 1) {
      return v === null || v === undefined || Number.isNaN(v) ? "—" : `${nf(v, digits)}°`;
    },
    pct(v) {
      return v === null || v === undefined || Number.isNaN(v) ? "—" : `${Math.round(v)}%`;
    },
    money(v, currency = "€") {
      return `${currency}${nf(v, 2)}`;
    },
    hhmm(date) {
      return date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    },
    number: nf,
  };

  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return "Boa noite";
    if (h < 13) return "Bom dia";
    if (h < 20) return "Boa tarde";
    return "Boa noite";
  }

  // ───────── Céu animado (do e271aaHOME) ─────────

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

  const DROPS = Array.from({ length: 42 }).map((_, i) => ({
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
      return { sr: 7 * 60, ss: 20 * 60 };
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
    const phase = min < sr || min >= ss ? "night" : min <= sr + GOLDEN || min >= ss - GOLDEN ? "golden" : "day";
    const noon = (sr + ss) / 2;
    const half = Math.max(1, (ss - sr) / 2);
    const t = Math.max(-1.15, Math.min(1.15, (min - noon) / half));
    const elev = Math.max(0, 1 - t * t);
    const sun = { cx: r2(36 + t * 27), cy: r2(70 - elev * 52) };
    return { condition, phase, sun, sr, ss, key: `${condition}|${phase}|${Math.round(sun.cx)}|${Math.round(sun.cy)}` };
  }

  function skyHTML(m) {
    const isNight = m.phase === "night";
    const showSun = !isNight && m.condition !== "rain";
    const bright = m.condition === "clear";
    const moon = moonPhase();
    let svg = "";

    if (isNight && m.condition === "clear") {
      const pts = [[16, 16], [30, 27], [62, 13], [22, 38], [44, 10], [56, 31], [12, 52], [66, 44]];
      svg += `<g fill="#fff">${pts
        .map(
          ([x, y], i) =>
            `<circle cx="${x}" cy="${y}" r="${i % 2 ? 0.8 : 1.1}" style="animation:twinkle ${2 + (i % 3)}s ease-in-out ${i * 0.4}s infinite"/>`,
        )
        .join("")}</g>
        <g style="animation:shoot 9s ease-in 3s infinite;transform-box:fill-box"><line x1="12" y1="12" x2="20" y2="16" stroke="#fff" stroke-width="1" stroke-linecap="round"/></g>`;
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
        rays = `<g stroke="#ffe39a" stroke-width="1.5" stroke-linecap="round" opacity=".9"><animateTransform attributeName="transform" type="rotate" from="0 ${m.sun.cx} ${m.sun.cy}" to="360 ${m.sun.cx} ${m.sun.cy}" dur="42s" repeatCount="indefinite"/>${rays}</g>`;
      }
      svg += `${rays}<circle cx="${m.sun.cx}" cy="${m.sun.cy}" r="11" fill="${bright ? "#ffe39a" : "#e6edf2"}" opacity="${bright ? 0.5 : 0.4}"/>
        <circle cx="${m.sun.cx}" cy="${m.sun.cy}" r="8.5" fill="${bright ? "#ffd454" : "#eef3f6"}"/>
        <circle cx="${m.sun.cx - 2}" cy="${m.sun.cy - 2}" r="4" fill="${bright ? "#fff3c6" : "#fff"}" opacity=".85"/>`;
    }

    if (isNight) {
      const id = `m${++moonSeq}`;
      const cx = 50, cy = 24, r = 9;
      const dx = (moon.phase < 0.5 ? -1 : 1) * 2 * r * moon.fraction;
      svg += `<defs><mask id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/><circle cx="${cx + dx}" cy="${cy}" r="${r + 0.4}" fill="#000"/></mask></defs>
        <g mask="url(#${id})"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#ece4c8"/>
        <circle cx="${cx - 3}" cy="${cy - 2}" r="1.6" fill="#d6cdac"/><circle cx="${cx + 2}" cy="${cy + 3}" r="1.2" fill="#d6cdac"/></g>`;
    }

    if (m.condition !== "clear") {
      const fill = m.condition === "rain" || isNight ? "#54626d" : "#f4f7fa";
      const cloud = (x, y, s) =>
        `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-20" y="-1" width="40" height="11" rx="5.5"/><circle cx="-11" cy="-1" r="8"/><circle cx="1" cy="-7" r="10.5"/><circle cx="12" cy="-2" r="8"/></g>`;
      const layer = (y, s, o, dur) =>
        `<g fill="${fill}" opacity="${o}"><animateTransform attributeName="transform" type="translate" from="0 0" to="-${VB_W} 0" dur="${dur}s" repeatCount="indefinite"/>${cloud(20, y, s)}${cloud(20 + VB_W, y, s)}</g>`;
      svg += layer(30, 0.55, isNight ? 0.4 : 0.55, 26) + layer(48, 0.95, isNight ? 0.85 : 0.95, 17);
    }

    const glow = showSun
      ? bright
        ? m.phase === "golden"
          ? "rgba(255,170,90,.95)"
          : "rgba(255,221,120,.95)"
        : "rgba(255,255,255,.5)"
      : isNight
        ? "rgba(220,230,255,.34)"
        : null;
    const gx = isNight ? 50 : m.sun.cx;
    const gy = isNight ? 24 : m.sun.cy;

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

  /** Céu vivo dentro de `host` (atualiza-se com o tempo e com o relógio). */
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

  // ───────── Painel (sheet) e avisos ─────────

  const openSheets = new Set();

  /** Fecha todos os painéis abertos (ex.: ao navegar para outra vista). */
  function closeSheets() {
    [...openSheets].forEach((close) => close());
  }

  function sheet(title, contentNode, { onClose } = {}) {
    const backdrop = el('<div class="sheet-backdrop"></div>');
    const node = el(`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-head"><h2 class="sheet-title">${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Fechar">${icon("close")}</button></div>
    </div>`);
    node.appendChild(contentNode);

    const close = () => {
      openSheets.delete(close);
      backdrop.remove();
      node.remove();
      if (!openSheets.size) document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      if (onClose) onClose();
    };
    openSheets.add(close);
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    backdrop.addEventListener("click", close);
    node.querySelector("[data-close]").addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    document.body.append(backdrop, node);
    return { close, node };
  }

  let toastHost = null;
  function toast(message, kind = "") {
    if (!toastHost) {
      toastHost = el('<div class="toasts" aria-live="polite"></div>');
      document.body.appendChild(toastHost);
    }
    const t = el(`<div class="toast ${kind}">${esc(message)}</div>`);
    toastHost.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ───────── Gráfico de barras empilhadas (SVG) ─────────

  function barChart(series, labels, { height = 200, unit = "kWh" } = {}) {
    const W = 600;
    const H = height;
    const padB = 22;
    const padT = 8;
    const n = labels.length || 1;
    const totals = labels.map((_, i) => series.reduce((sum, s) => sum + Math.max(0, s.values[i] || 0), 0));
    const max = Math.max(0.001, ...totals);
    const step = W / n;
    const bw = Math.max(3, Math.min(28, step * 0.62));
    const scale = (v) => ((H - padB - padT) * v) / max;

    let bars = "";
    labels.forEach((_, i) => {
      let y = H - padB;
      series.forEach((s) => {
        const v = Math.max(0, s.values[i] || 0);
        if (v <= 0) return;
        const h = scale(v);
        y -= h;
        bars += `<rect x="${(i + 0.5) * step - bw / 2}" y="${y}" width="${bw}" height="${h}" rx="${Math.min(3, bw / 3)}" fill="${s.color}"><title>${labels[i]}: ${nf(v, 2)} ${unit}</title></rect>`;
      });
    });

    const ticks = [0, max / 2, max]
      .map(
        (v) =>
          `<g><line x1="0" y1="${H - padB - scale(v)}" x2="${W}" y2="${H - padB - scale(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="0" y="${H - padB - scale(v) - 4}" font-size="10" fill="currentColor" fill-opacity=".5">${nf(v, v > 10 ? 0 : 1)}</text></g>`,
      )
      .join("");

    const everyOther = n > 14 ? Math.ceil(n / 8) : 1;
    const xLabels = labels
      .map((l, i) =>
        i % everyOther === 0
          ? `<text x="${(i + 0.5) * step}" y="${H - 6}" font-size="10" text-anchor="middle" fill="currentColor" fill-opacity=".55">${esc(l)}</text>`
          : "",
      )
      .join("");

    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">${ticks}${bars}${xLabels}</svg>`;
  }

  window.UI = {
    el,
    esc,
    icon,
    ICONS,
    fmt,
    greeting,
    skyModel,
    skyHTML,
    mountSky,
    conditionOf,
    sheet,
    closeSheets,
    toast,
    barChart,
  };
})();
