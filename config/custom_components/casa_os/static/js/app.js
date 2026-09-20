/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — esqueleto, navegação e paletas.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt, greeting } = window.UI;
  const HA = window.HA;
  const V = window.VIEWS;
  const CFG = window.CASA.config;

  const THEMES = [
    { id: "lilas", name: "Lilás", desc: "A cor da casa", c: ["#100d17", "#b79cff"] },
    { id: "dourado", name: "Dourado", desc: "Quente e sóbrio", c: ["#100d08", "#e3b567"] },
    { id: "azul", name: "Azul", desc: "Frio e calmo", c: ["#07101a", "#5cc0f5"] },
    { id: "verde", name: "Verde", desc: "Natural", c: ["#07120d", "#5fd39a"] },
    { id: "oled", name: "Preto", desc: "Para tablets de parede", c: ["#000000", "#ffb066"] },
    { id: "claro", name: "Claro", desc: "Para o dia", c: ["#f2f1ee", "#6b4de0"] },
  ];
  const THEME_KEY = "casa_os_theme";

  function applyTheme(id, persist = true) {
    if (!THEMES.some((t) => t.id === id)) return;
    document.documentElement.setAttribute("data-theme", id);
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, id);
      } catch (e) {
        /* modo privado */
      }
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim());
  }

  const currentTheme = () => document.documentElement.getAttribute("data-theme") || "lilas";

  function openThemes() {
    const body = el('<div class="themes"></div>');
    const paint = () =>
      body.querySelectorAll("[data-t]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === currentTheme())));
    THEMES.forEach((t) => {
      const b = el(`<button class="themebtn" data-t="${t.id}">
        <span class="sq" style="background:${t.c[0]}"><i style="background:${t.c[1]}"></i></span>
        <span><span class="tn">${esc(t.name)}</span><span class="td">${esc(t.desc)}</span></span>
      </button>`);
      b.addEventListener("click", () => {
        applyTheme(t.id);
        paint();
      });
      body.appendChild(b);
    });
    paint();
    window.UI.sheet("Aparência", body, { subtitle: "A mesma casa, na cor da instalação" });
  }

  // ───────── Rotas ─────────

  const ROUTES = [
    { id: "inicio", path: "/", title: "Início", icon: "home", view: () => V.homeView() },
    { id: "divisoes", path: "/divisoes", title: "Divisões", icon: "rooms", view: () => V.roomsView() },
    { id: "controlos", path: "/controlos", title: "Controlos", icon: "sliders", view: (p) => V.controlsView(p[1] || "luzes") },
    { id: "energia", path: "/energia", title: "Energia", icon: "bolt", view: (p) => V.energyView(p[1] || "hoje") },
    { id: "cameras", path: "/cameras", title: "Câmaras", icon: "camera", view: () => V.camerasView() },
  ];

  function parseHash() {
    const parts = (location.hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean);
    const route = ROUTES.find((r) => r.path === `/${parts[0] || ""}`) || ROUTES[0];
    return { route, parts };
  }

  // ───────── Esqueleto ─────────

  const app = document.getElementById("app");
  const title = window.CASA.title || "Casa";

  const side = el(`<aside class="side">
    <div class="brand">
      <span class="mark">${esc(title[0])}</span>
      <span><span class="bn">${esc(title)}</span><span class="bs" id="side-sub">—</span></span>
    </div>
    <nav>${ROUTES.map(
      (r) => `<a href="#${r.path}" data-route="${r.id}">${icon(r.icon)}<span>${esc(r.title)}</span></a>`,
    ).join("")}</nav>
    <div class="foot">
      <div id="people"></div>
      <button class="li" id="side-theme" style="border:0;padding:var(--s-2) var(--s-3);border-radius:var(--r-sm)">
        ${icon("palette")}<span class="lname">Aparência</span>
      </button>
    </div>
  </aside>`);

  const main = el('<div class="main"><div id="outlet"></div></div>');

  const tabbar = el(`<nav class="tabbar" aria-label="Navegação">
    ${ROUTES.map(
      (r) => `<a href="#${r.path}" data-route="${r.id}">${icon(r.icon)}<span>${esc(r.title)}</span></a>`,
    ).join("")}
  </nav>`);

  side.querySelector("#side-theme").addEventListener("click", openThemes);

  /** Quem está em casa, no rodapé da barra lateral. */
  function mountPeople() {
    const host = side.querySelector("#people");
    (CFG.people || []).forEach((p) => {
      const row = el(`<div class="person"><span class="av">${esc(p.name[0])}</span><span class="pn">${esc(p.name)}</span><span class="pb"></span></div>`);
      const update = () => {
        const home = (HA.get(p.entity) || {}).state === "home";
        row.querySelector(".pn").textContent = `${p.name} · ${home ? "em casa" : "fora"}`;
        const bat = p.battery ? HA.num(p.battery) : null;
        row.querySelector(".pb").textContent = bat !== null ? `${fmt.n(bat)} %` : "";
        row.querySelector(".av").style.borderColor = home ? "var(--c-accent)" : "var(--c-line)";
      };
      HA.subscribe((id) => {
        if (id === "*" || id === p.entity || id === p.battery) update();
      });
      update();
      host.appendChild(row);
    });
  }

  /** Resumo da casa por baixo do nome, na barra lateral. */
  function mountSideSub() {
    const sub = side.querySelector("#side-sub");
    const update = () => {
      const lights = (CFG.rooms || []).flatMap((r) => r.lights || []);
      const on = lights.filter((l) => HA.isOn(l)).length;
      sub.textContent = on ? `${on} ${on === 1 ? "luz ligada" : "luzes ligadas"}` : "tudo apagado";
    };
    HA.subscribe((id) => {
      if (id === "*" || id.startsWith("light.")) update();
    });
    update();
  }

  function render() {
    window.UI.closeSheets();
    const { route, parts } = parseHash();
    const outlet = main.querySelector("#outlet");
    outlet.innerHTML = "";
    const view = route.view(parts);

    // No Início, os botões flutuam sobre a janela; nas outras vistas vão no cabeçalho.
    if (route.id === "inicio") {
      const strip = view.querySelector(".windowstrip");
      if (strip) {
        const top = el(`<div class="wtop">
          <span class="whello">${esc(greeting())}${window.CASA.user ? `, ${esc(window.CASA.user)}` : ""}</span>
          <button class="iconbtn ghost" id="theme-btn" aria-label="Aparência">${icon("palette")}</button>
        </div>`);
        top.querySelector("#theme-btn").addEventListener("click", openThemes);
        strip.appendChild(top);
      }
    } else {
      const head = view.querySelector(".head");
      if (head) {
        const actions = el('<div class="head-actions"></div>');
        const b = el(`<button class="iconbtn" aria-label="Aparência">${icon("palette")}</button>`);
        b.addEventListener("click", openThemes);
        actions.appendChild(b);
        head.appendChild(actions);
      }
    }

    outlet.appendChild(view);
    [...side.querySelectorAll("[data-route]"), ...tabbar.querySelectorAll("[data-route]")].forEach((a) => {
      if (a.dataset.route === route.id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = route.id === "inicio" ? title : `${route.title} · ${title}`;
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", render);

  // ───────── Ligação ─────────

  function watchConnection() {
    let banner = null;
    HA.onStatus((status) => {
      if (status === "online") {
        if (banner) {
          banner.remove();
          banner = null;
        }
        return;
      }
      if (!banner) {
        banner = el(`<div class="offline">${icon("wifioff")}
          <div><div class="ot">Sem ligação à casa</div><div class="os">A tentar outra vez…</div></div></div>`);
      }
      const view = main.querySelector(".view");
      if (view && !banner.isConnected) view.prepend(banner);
      if (status === "unauthorized" && banner) {
        banner.querySelector(".ot").textContent = "Sessão sem permissão";
        banner.querySelector(".os").textContent = "Volta a entrar no Home Assistant.";
      }
    });
  }

  // ───────── Arranque ─────────

  function boot() {
    applyTheme(localStorage.getItem(THEME_KEY) || "lilas", false);
    app.innerHTML = "";
    app.append(side, main, tabbar);
    app.setAttribute("aria-busy", "false");
    mountPeople();
    mountSideSub();
    render();
    watchConnection();
  }

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    boot();
  };
  const unsub = HA.subscribe((id) => {
    if (id === "*") {
      unsub();
      start();
    }
  });
  setTimeout(start, 4000);
})();
