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
    // O Dashboard não tem separador no telemóvel (são cinco e cabem cinco): lá
    // chega-se pelo menu.
    { id: "dashboard", title: "Dashboard", icon: "dashboard", ecras: ["braco", "sala"] },
    { id: "divisoes", title: "Divisões", icon: "rooms", ecras: ["braco", "sala", "mao"] },
    { id: "controlos", title: "Controlos", icon: "sliders", ecras: ["braco", "mao"] },
    { id: "vigilancia", title: "Vigilância", icon: "camera", ecras: ["braco", "sala", "mao"] },
    { id: "energia", title: "Energia", icon: "bolt", ecras: ["braco", "sala", "mao"] },
    { id: "rotina", title: "Rotina", icon: "list", ecras: ["braco"] },
    // As Definições não são uma secção da casa: têm o seu botão no fundo da
    // barra e a sua linha no menu, e não entram na navegação principal.
    { id: "definicoes", title: "Definições", icon: "definicoes", ecras: [], oculta: true },
    // A planta só existe se a casa tiver uma desenhada. É trabalho por
    // instalação, por isso não se promete onde não há.
    { id: "planta", title: "A casa", icon: "planta", ecras: ["sala"], se: () => !!CFG.planta },
  ].filter((s) => !s.se || s.se());

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
    // o que a pessoa escolheu nas Definições vale mais do que qualquer palpite
    const escolha = DEFS.get("ecra");
    if (["braco", "sala"].includes(escolha)) return escolha;

    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w < 700 || h < 480) return "mao";
    // Largura sozinha não faz uma televisão: um monitor de computador de 1920 px
    // era classificado como TV, e na TV não há teclas nem se mexe com o rato.
    // Uma TV não tem rato nem dedo; um monitor tem rato, um painel de parede tem dedo.
    const rato = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const dedo = navigator.maxTouchPoints > 0;
    return w >= 1500 && !rato && !dedo ? "sala" : "braco";
  }

  function applyScreen(aoMudar) {
    const cls = screenClass();
    const raiz = document.documentElement;
    if (raiz.getAttribute("data-screen") === cls) return;
    raiz.setAttribute("data-screen", cls);
    DEFS.aplicarTamanho(cls); // cada tipo de ecrã tem o seu tamanho
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

  /* ───────── Quiosque ─────────
   * Um painel de parede não é um site aberto num tablet: está sempre ligado,
   * ninguém lhe toca a maior parte do dia, e quem passa à frente quer ler, não
   * mexer. Daí três comportamentos:
   *
   *   presença — de longe o veredicto ocupa o ecrã e não há nada tocável a
   *              competir; com alguém à frente encolhe e as teclas aparecem.
   *              Não se troca de ecrã: reescala-se o mesmo.
   *   regresso — passado um tempo sem ninguém, volta sozinho ao Início. Quem
   *              chega encontra sempre a mesma coisa.
   *   repouso  — de noite e sem ninguém, o ecrã apaga-se até ao essencial.
   *              O primeiro toque acorda-o e não faz mais nada.
   *
   * Na mão nada disto se aplica (o telemóvel está sempre "perto") e na TV o
   * painel é para ser visto de longe, sempre.
   */
  const Q = CFG.quiosque || {};
  const PERTO_S = Q.perto_segundos ?? 45;
  // Estes três a pessoa muda nas Definições; à falta de escolha vale o config.json
  const VOLTAR_S = () => DEFS.get("voltar"); // 0 = nunca
  const REPOUSO_S = () => DEFS.get("repouso") * 60; // 0 = nunca
  const SO_DE_NOITE = () => DEFS.get("soDeNoite");

  let ultimoToque = Date.now();
  let aDescansar = false;
  let repousoPedido = false; // posto a descansar à mão, pelo menu
  let wakeLock = null;
  let wakePorque = "por tentar";

  const raiz = document.documentElement;
  const ecraAtual = () => raiz.getAttribute("data-screen");
  const eNoite = () => (HA.get("sun.sun") || {}).state === "below_horizon";

  function marca(atr, valor) {
    if (raiz.getAttribute(atr) !== valor) raiz.setAttribute(atr, valor);
  }

  function acordar() {
    ultimoToque = Date.now();
    repousoPedido = false;
    if (aDescansar) {
      aDescansar = false;
      marca("data-repouso", "nao");
    }
    avaliar();
  }

  function avaliar() {
    const ecra = ecraAtual();
    marca("data-teclas", DEFS.teclas(ecra));
    if (ecra === "mao") {
      marca("data-presenca", "perto"); // na mão está-se sempre à frente
      marca("data-repouso", "nao");
      return;
    }
    if (ecra === "sala") {
      marca("data-presenca", "longe"); // a TV vê-se do sofá, sempre
      marca("data-repouso", "nao");
      return;
    }

    const movimento = Q.presenca ? HA.isOn(Q.presenca) : false;
    const desde = (Date.now() - ultimoToque) / 1000;
    const perto = movimento || desde < PERTO_S;
    marca("data-presenca", perto ? "perto" : "longe");

    if (VOLTAR_S() > 0 && !perto && desde > VOLTAR_S() && parseHash().sec !== "casa") go("casa");

    // o repouso pedido à mão vale até alguém acordar o painel
    const descansar =
      repousoPedido || (REPOUSO_S() > 0 && !perto && desde > REPOUSO_S() && (!SO_DE_NOITE() || eNoite()));
    if (descansar !== aDescansar) {
      aDescansar = descansar;
      marca("data-repouso", descansar ? "sim" : "nao");
    }
  }

  /** Num painel de parede o ecrã não se pode apagar sozinho. */
  async function manterAcordado() {
    if (ecraAtual() === "mao") return;
    if (!("wakeLock" in navigator)) {
      wakePorque = "este browser não sabe";
      return;
    }
    if (!window.isSecureContext) {
      // só em HTTPS ou em localhost; num tablet de parede é o que obriga a
      // abrir o painel por https://
      wakePorque = "o painel tem de ser aberto por HTTPS";
      return;
    }
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakePorque = "";
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } catch (e) {
      wakeLock = null;
      wakePorque = "o sistema recusou";
    }
  }

  function arrancarQuiosque() {
    // o primeiro toque num ecrã a dormir acorda-o e não faz mais nada
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!aDescansar) {
          ultimoToque = Date.now();
          avaliar(); // um toque em qualquer sítio mostra as teclas já, não daqui a dois segundos
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        acordar();
      },
      true,
    );
    // Mexer o rato é presença: num computador é a única maneira de dizer "estou aqui".
    // Uma vez por segundo chega — o resto é ruído.
    let ultimoRato = 0;
    document.addEventListener(
      "mousemove",
      () => {
        const t = Date.now();
        if (t - ultimoRato < 1000) return;
        ultimoRato = t;
        acordar();
      },
      { passive: true },
    );
    ["keydown", "wheel", "touchstart"].forEach((ev) =>
      document.addEventListener(ev, acordar, { capture: true, passive: true }),
    );

    if (Q.presenca) {
      HA.subscribe((id) => {
        if (id === Q.presenca && HA.isOn(id)) acordar();
        else if (id === Q.presenca) avaliar();
      });
    }

    setInterval(avaliar, 2000);
    avaliar();
    manterAcordado();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        manterAcordado();
        acordar();
      }
    });
  }

  const emEcraCheio = () => !!document.fullscreenElement;
  function trocarEcraCheio() {
    if (emEcraCheio()) document.exitFullscreen();
    else raiz.requestFullscreen && raiz.requestFullscreen().catch(() => {});
  }

  function descansarJa() {
    if (ecraAtual() === "mao") return;
    repousoPedido = true;
    ultimoToque = 0; // como se ninguém lhe tocasse há horas
    aDescansar = true;
    marca("data-presenca", "longe");
    marca("data-repouso", "sim");
  }

  // O que as Definições vão buscar à casca (não é uma API: é o que ela mostra).
  window.APP = {
    THEMES, currentTheme, applyTheme,
    emEcraCheio, trocarEcraCheio, descansarJa,
    aDescansar: () => aDescansar,
    acordar, avaliar,
    /** Volta a decidir o tipo de ecrã (depois de a pessoa o escolher) e redesenha. */
    reclassificar: () => applyScreen(render),
    ecraDetetado: () => {
      const guardado = DEFS.get("ecra");
      DEFS.set("ecra", undefined);
      const auto = screenClass();
      if (guardado !== undefined) DEFS.set("ecra", guardado);
      return auto;
    },
    wake: () => ({ ativo: !!wakeLock, porque: wakePorque === "por tentar" ? "ainda a tentar" : wakePorque }),
  };

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
    const defs = el(`<button class="nb" data-sec="definicoes" aria-label="Definições">${icon("definicoes")}<span>Definições</span></button>`);
    defs.addEventListener("click", () => go("definicoes"));
    foot.appendChild(defs);
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
    SECTIONS.filter((s) => !s.oculta).forEach((s) => {
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

    // as opções do painel — tamanho, aparência, ecrã — vivem nas Definições
    const defs = el(`<button class="mrow"${atual === "definicoes" ? ' aria-current="page"' : ""}>${icon("definicoes")}<span style="flex:1">Definições</span></button>`);
    defs.addEventListener("click", () => {
      closeMenu();
      go("definicoes");
    });
    drawer.appendChild(defs);

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
    const bd = side.querySelector('[data-sec="definicoes"]');
    if (bd) sec === "definicoes" ? bd.setAttribute("aria-current", "page") : bd.removeAttribute("aria-current");
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

  window.addEventListener("hashchange", () => {
    ultimoToque = Date.now();
    render();
  });

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
          <div class="grow"><div class="bd">Sem ligação à casa</div>
          <div class="ft"></div></div>${icon("wifioff", "ic-s")}</div>`);
      }
      // dizer de quando são os valores, em vez de os mostrar como se fossem de agora
      const t = HA.ultimoContacto();
      const hm = t
        ? `${String(new Date(t).getHours()).padStart(2, "0")}:${String(new Date(t).getMinutes()).padStart(2, "0")}`
        : null;
      banner.querySelector(".ft").textContent = hm
        ? `A religar. Os valores são os últimos conhecidos, das ${hm}.`
        : "A tentar outra vez…";
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
    DEFS.aplicarTamanho(document.documentElement.getAttribute("data-screen"));
    applyTheme(localStorage.getItem(THEME_KEY) || "grafite", false);
    document.documentElement.setAttribute("data-presenca", "longe");
    document.documentElement.setAttribute("data-repouso", "nao");

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
    arrancarQuiosque();
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
