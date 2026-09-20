/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — esqueleto, navegação e temas.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon } = window.UI;
  const HA = window.HA;
  const V = window.VIEWS;

  const THEMES = [
    { id: "lilas", name: "Lilás", desc: "O original", c: ["#15152a", "#ce93d8"] },
    { id: "ouro", name: "Ouro", desc: "Quente e sóbrio", c: ["#131110", "#d9b071"] },
    { id: "oceano", name: "Oceano", desc: "Azul profundo", c: ["#0a1622", "#4fc3f7"] },
    { id: "floresta", name: "Floresta", desc: "Verde natural", c: ["#0d1a13", "#5fd38a"] },
    { id: "brasa", name: "Brasa", desc: "Preto OLED", c: ["#000000", "#ff9e5e"] },
    { id: "claro", name: "Claro", desc: "Para o dia", c: ["#eceef6", "#6c4bf0"] },
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
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || "lilas";
  }

  function openThemes() {
    const body = el('<div class="themes"></div>');
    const paint = () =>
      body.querySelectorAll("[data-t]").forEach((b) => b.classList.toggle("active", b.dataset.t === currentTheme()));
    THEMES.forEach((t) => {
      const b = el(`<button class="theme-btn" data-t="${t.id}">
        <span class="theme-dot" style="background:${t.c[0]}"><i style="background:${t.c[1]}"></i></span>
        <span><span class="theme-name">${esc(t.name)}</span><span class="theme-desc">${esc(t.desc)}</span></span>
      </button>`);
      b.addEventListener("click", () => {
        applyTheme(t.id);
        paint();
      });
      body.appendChild(b);
    });
    paint();
    window.UI.sheet("Aparência", body);
  }

  // ───────── Rotas ─────────

  const ROUTES = [
    { id: "inicio", path: "/", title: "Início", icon: "home", view: () => V.homeView() },
    { id: "divisoes", path: "/divisoes", title: "Divisões", icon: "rooms", view: () => V.roomsView() },
    {
      id: "controlos",
      path: "/controlos",
      title: "Controlos",
      icon: "sliders",
      view: (parts) => V.controlsView(parts[1] || "luzes"),
    },
    {
      id: "energia",
      path: "/energia",
      title: "Energia",
      icon: "bolt",
      view: (parts) => V.energyView(parts[1] || "hoje"),
    },
    { id: "cameras", path: "/cameras", title: "Câmaras", icon: "camera", view: () => V.camerasView() },
  ];

  function parseHash() {
    const raw = (location.hash || "#/").replace(/^#\/?/, "");
    const parts = raw.split("/").filter(Boolean);
    const route = ROUTES.find((r) => r.path === `/${parts[0] || ""}`) || ROUTES[0];
    return { route, parts };
  }

  // ───────── Esqueleto ─────────

  const app = document.getElementById("app");

  const rail = el(`<nav class="rail" aria-label="Navegação principal">
    <div class="rail-mark"><i>${esc((window.CASA.title || "C")[0])}</i><span>${esc(window.CASA.title || "Casa")}</span></div>
    ${ROUTES.map(
      (r) => `<a class="tab" href="#${r.path}" data-route="${r.id}">${icon(r.icon)}<span>${esc(r.title)}</span></a>`,
    ).join("")}
    <div class="rail-foot">
      <button class="tab" id="rail-theme">${icon("palette")}<span>Aparência</span></button>
    </div>
  </nav>`);

  const main = el(`<div class="main">
    <header class="topbar">
      <button class="back-btn" id="back" hidden aria-label="Voltar">${icon("chevron")}</button>
      <h1 class="topbar-title"></h1>
      <div class="topbar-actions">
        <span class="chip" id="status" hidden></span>
        <button class="icon-btn" id="theme-btn" aria-label="Aparência">${icon("palette")}</button>
      </div>
    </header>
    <div id="outlet"></div>
  </div>`);

  const tabbar = el(`<nav class="tabbar" aria-label="Navegação">
    ${ROUTES.map(
      (r) => `<a class="tab" href="#${r.path}" data-route="${r.id}">${icon(r.icon)}<span>${esc(r.title)}</span></a>`,
    ).join("")}
  </nav>`);

  main.querySelector("#theme-btn").addEventListener("click", openThemes);
  rail.querySelector("#rail-theme").addEventListener("click", openThemes);
  main.querySelector("#back").addEventListener("click", () => history.back());
  main.querySelector("#back").style.transform = "rotate(180deg)";

  function render() {
    window.UI.closeSheets();
    const { route, parts } = parseHash();
    const outlet = main.querySelector("#outlet");
    outlet.innerHTML = "";
    outlet.appendChild(route.view(parts));
    main.querySelector(".topbar-title").textContent = route.id === "inicio" ? window.CASA.title || "Casa" : route.title;
    [...rail.querySelectorAll("[data-route]"), ...tabbar.querySelectorAll("[data-route]")].forEach((a) =>
      a.classList.toggle("active", a.dataset.route === route.id),
    );
    document.title = `${route.title} · ${window.CASA.title || "Casa"}`;
    window.scrollTo(0, 0);
    outlet.scrollTop = 0;
  }

  window.addEventListener("hashchange", render);

  // ───────── Estado da ligação ─────────

  function watchConnection() {
    const badge = main.querySelector("#status");
    HA.onStatus((status) => {
      if (status === "online") {
        badge.hidden = true;
        return;
      }
      badge.hidden = false;
      badge.innerHTML =
        status === "unauthorized"
          ? `${icon("offline")}<span>Sem permissão</span>`
          : `${icon("offline")}<span>${status === "offline" ? "A religar…" : "A ligar…"}</span>`;
      badge.querySelector("svg").style.width = "16px";
      badge.querySelector("svg").style.height = "16px";
    });
  }

  // ───────── Arranque ─────────

  function boot() {
    applyTheme(localStorage.getItem(THEME_KEY) || "lilas", false);
    app.innerHTML = "";
    app.append(rail, main, tabbar);
    app.setAttribute("aria-busy", "false");
    render();
    watchConnection();
  }

  // Espera pelos primeiros estados (ou arranca à mesma ao fim de 4 s)
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
