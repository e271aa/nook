/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — a casca: navegação, menu, paletas e o ecrã que se escolhe.
 *
 *  Seis secções, e nem todas em todo o lado. Na parede e na TV a barra
 *  lateral está sempre à vista; no telemóvel há separadores em baixo com as
 *  cinco principais e o resto vive no menu. O menu é o mesmo conteúdo da
 *  barra lateral, mais o que não cabe nela.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon } = window.UI;
  const HA = window.HA;
  const V = window.VIEWS;
  const CFG = window.CASA.config || {};

  /* ───────── Secções ─────────
   * ecras: onde esta secção aparece na navegação principal.
   * A Rotina não vai à TV — não se mostram as compras a visitas.
   */
  const SECTIONS = [
    { id: "casa", title: "Casa", icon: "home", ecras: ["braco", "sala", "mao"] },
    { id: "divisoes", title: "Divisões", icon: "rooms", ecras: ["braco", "sala", "mao"] },
    { id: "controlos", title: "Controlos", icon: "sliders", ecras: ["braco", "mao"] },
    { id: "vigilancia", title: "Vigilância", icon: "camera", ecras: ["braco", "sala", "mao"] },
    { id: "energia", title: "Energia", icon: "bolt", ecras: ["braco", "sala", "mao"] },
    { id: "rotina", title: "Rotina", icon: "list", ecras: ["braco"] },
  ];

  const THEMES = [
    { id: "grafite", name: "Grafite", bg: "#000000", tint: "#4c9aff" },
    { id: "lilas", name: "Lilás", bg: "#08060d", tint: "#a98bff" },
    { id: "dourado", name: "Dourado", bg: "#0a0805", tint: "#e0a94f" },
    { id: "verde", name: "Verde", bg: "#030805", tint: "#4bd6a0" },
    { id: "oled", name: "Preto", bg: "#000000", tint: "#ffffff" },
    { id: "claro", name: "Claro", bg: "#f2f2f7", tint: "#0a66d6" },
  ];
  const THEME_KEY = "casa_os_theme";

  /* ───────── Ecrã ─────────
   * mao   — telemóvel: rola
   * braco — tablet de parede: não rola
   * sala  — TV: não rola, e cresce
   * Força-se para demonstrações: /casa?ecra=sala
   */
  function screenClass() {
    const forcado = new URLSearchParams(location.search).get("ecra");
    if (["mao", "braco", "sala"].includes(forcado)) return forcado;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w < 700 || h < 480) return "mao";
    return w >= 1500 ? "sala" : "braco";
  }

  function applyScreen(aoMudar) {
    const cls = screenClass();
    const raiz = document.documentElement;
    if (raiz.getAttribute("data-screen") === cls) return;
    raiz.setAttribute("data-screen", cls);
    if (aoMudar) aoMudar();
  }

  const currentTheme = () => document.documentElement.getAttribute("data-theme") || "grafite";

  function applyTheme(id, guardar = true) {
    if (!THEMES.some((t) => t.id === id)) return;
    document.documentElement.setAttribute("data-theme", id);
    if (guardar) {
      try {
        localStorage.setItem(THEME_KEY, id);
      } catch (e) {
        /* modo privado */
      }
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
    }
  }

  // ───────── Rotas ─────────

  const sectionOf = (id) => SECTIONS.find((s) => s.id === id);
  const parseHash = () => {
    const partes = (location.hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean);
    return { sec: sectionOf(partes[0]) ? partes[0] : "casa", partes };
  };
  const go = (id) => {
    location.hash = `#/${id === "casa" ? "" : id}`;
  };

  // ───────── Peças da casca ─────────

  const app = el('<div class="app"></div>');
  const side = el('<aside class="side"><div class="nav"></div><div class="foot"></div></aside>');
  const body = el('<div class="body"></div>');
  const tabbar = el('<nav class="tabbar" aria-label="Secções"></nav>');

  function navButton(s, atual, cls) {
    const b = el(
      `<button class="${cls}" data-sec="${s.id}"${s.id === atual ? ' aria-current="page"' : ""}>
        ${icon(s.icon)}<span>${esc(s.title)}</span></button>`,
    );
    b.addEventListener("click", () => go(s.id));
    return b;
  }

  function paintNav(atual) {
    const ecra = document.documentElement.getAttribute("data-screen");
    const visiveis = SECTIONS.filter((s) => s.ecras.includes(ecra));

    const nav = side.querySelector(".nav");
    nav.innerHTML = "";
    visiveis.forEach((s) => nav.appendChild(navButton(s, atual, "nb")));

    tabbar.innerHTML = "";
    visiveis.forEach((s) => tabbar.appendChild(navButton(s, atual, "")));
  }

  /** Quem está em casa, no fundo da barra lateral. */
  function mountFoot() {
    const foot = side.querySelector(".foot");
    foot.innerHTML = "";
    const avatars = el('<div class="avatars"></div>');
    (CFG.people || []).forEach((p) => {
      const av = el(`<span class="av" title="${esc(p.name)}">${esc(p.name[0])}</span>`);
      const pinta = () => av.classList.toggle("home", (HA.get(p.entity) || {}).state === "home");
      HA.subscribe((id) => {
        if (id === "*" || id === p.entity) pinta();
      });
      pinta();
      foot.appendChild(avatars);
      avatars.appendChild(av);
    });
    const menu = el(`<button class="nb" aria-label="Menu">${icon("menu")}<span>Menu</span></button>`);
    menu.addEventListener("click", openMenu);
    foot.appendChild(menu);
  }

  // ───────── Menu ─────────

  let aberto = null;

  function closeMenu() {
    if (!aberto) return;
    aberto.forEach((n) => n.remove());
    aberto = null;
  }

  function openMenu() {
    closeMenu();
    const ecra = document.documentElement.getAttribute("data-screen");
    const atual = parseHash().sec;

    const scrim = el('<div class="scrim"></div>');
    const drawer = el(`<div class="drawer" role="dialog" aria-label="Menu"></div>`);

    const secs = el('<div></div>');
    secs.appendChild(el('<div class="cap" style="margin-bottom:var(--s2)">Secções</div>'));
    SECTIONS.forEach((s) => {
      const fora = !s.ecras.includes(ecra);
      const r = el(
        `<button class="mrow"${s.id === atual ? ' aria-current="page"' : ""}>${icon(s.icon)}
          <span style="flex:1">${esc(s.title)}</span>
          ${fora ? '<span class="ft">no menu</span>' : ""}</button>`,
      );
      r.addEventListener("click", () => {
        closeMenu();
        go(s.id);
      });
      secs.appendChild(r);
    });
    drawer.appendChild(secs);

    const temas = el('<div></div>');
    temas.appendChild(el('<div class="cap" style="margin-bottom:var(--s2)">Aparência</div>'));
    const grelha = el('<div class="themes"></div>');
    const pinta = () =>
      grelha.querySelectorAll("[data-t]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === currentTheme())));
    THEMES.forEach((t) => {
      const b = el(
        `<button class="themebtn" data-t="${t.id}">
          <span class="sq" style="background:${t.bg}"><i style="background:${t.tint}"></i></span>
          <span class="tn">${esc(t.name)}</span></button>`,
      );
      b.addEventListener("click", () => {
        applyTheme(t.id);
        pinta();
      });
      grelha.appendChild(b);
    });
    pinta();
    temas.appendChild(grelha);
    drawer.appendChild(temas);

    const fechar = el(`<button class="mrow" style="margin-top:auto">${icon("back")}<span>Fechar</span></button>`);
    fechar.addEventListener("click", closeMenu);
    drawer.appendChild(fechar);

    scrim.addEventListener("click", closeMenu);
    document.body.append(scrim, drawer);
    aberto = [scrim, drawer];
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // ───────── Desenhar ─────────

  function render() {
    closeMenu();
    if (V.limpar) V.limpar(); // a secção que sai deixa de ouvir a casa
    const { sec, partes } = parseHash();
    paintNav(sec);
    body.innerHTML = "";
    const vista = V[sec](partes.slice(1));

    // No telemóvel não há barra lateral: o menu entra no cabeçalho da secção,
    // que é o único sítio fixo que lá existe.
    if (document.documentElement.getAttribute("data-screen") === "mao") {
      const head = vista.querySelector(".head");
      if (head) {
        const b = el(`<button class="iconbtn" aria-label="Menu">${icon("menu")}</button>`);
        b.addEventListener("click", openMenu);
        head.appendChild(b);
      }
    }
    body.appendChild(vista);
    const titulo = sectionOf(sec).title;
    document.title = sec === "casa" ? window.CASA.title : `${titulo} · ${window.CASA.title}`;
  }

  window.addEventListener("hashchange", render);

  /** O aviso de que a casa não responde, por cima do que estiver à vista. */
  function watchConnection() {
    let banner = null;
    HA.onStatus((estado) => {
      if (estado === "online") {
        if (banner) banner.remove();
        banner = null;
        return;
      }
      if (!banner) {
        banner = el(`<div class="offline"><span class="spin"></span>
          <div><div class="bd">Sem ligação à casa</div>
          <div class="ft">A tentar outra vez…</div></div></div>`);
      }
      if (estado === "unauthorized") {
        banner.querySelector(".bd").textContent = "Sessão sem permissão";
        banner.querySelector(".ft").textContent = "Volta a entrar no Home Assistant.";
      }
      if (!banner.isConnected) body.prepend(banner);
    });
  }

  // ───────── Arranque ─────────

  function boot() {
    applyScreen();
    applyTheme(localStorage.getItem(THEME_KEY) || "grafite", false);
    document.documentElement.setAttribute("data-presenca", "longe");

    let timer = null;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => applyScreen(render), 120);
    });

    const raiz = document.getElementById("app");
    raiz.replaceWith(app);
    app.append(side, body, tabbar);
    mountFoot();
    render();
    watchConnection();
  }

  let arrancou = false;
  const start = () => {
    if (arrancou) return;
    arrancou = true;
    boot();
  };
  const unsub = HA.subscribe((id) => {
    if (id === "*") {
      unsub();
      start();
    }
  });
  // se a casa não responder, a casca aparece na mesma e diz porquê
  setTimeout(start, 4000);
})();
