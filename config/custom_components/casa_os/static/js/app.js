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
  const K = window.KIT;
  const CFG = window.CASA.config || {};

  /* ───────── Secções ─────────
   * ecras: onde esta secção aparece na navegação principal.
   * A Rotina não vai à TV — não se mostram as compras a visitas.
   */
  const SECTIONS = [
    { id: "casa", title: "Casa", icon: "home", ecras: ["braco", "sala", "mao"] },
    // O Dashboard (a vista antiga, em três colunas) saiu de vista: sem separador
    // na barra nem linha no menu. O código e a rota #/dashboard ficam — ver
    // docs/DECISOES.md para o reativar.
    { id: "dashboard", title: "Dashboard", icon: "dashboard", ecras: ["braco", "sala"], oculta: true },
    { id: "divisoes", title: "Divisões", icon: "rooms", ecras: ["braco", "sala", "mao"] },
    { id: "controlos", title: "Controlos", icon: "sliders", ecras: ["braco", "sala", "mao"] },
    { id: "vigilancia", title: "Vigilância", icon: "camera", ecras: ["braco", "sala", "mao"] },
    { id: "energia", title: "Energia", icon: "bolt", ecras: ["braco", "sala", "mao"] },
    { id: "rotina", title: "Rotina", icon: "list", ecras: ["braco"] },
    // As Definições não são uma secção da casa: têm o seu botão no fundo da
    // barra e a sua linha no menu, e não entram na navegação principal.
    { id: "definicoes", title: "Definições", icon: "definicoes", ecras: [], oculta: true },
    // A planta só existe se a casa tiver uma desenhada. É trabalho por
    // instalação, por isso não se promete onde não há. No telemóvel vive no menu.
    { id: "planta", title: "Planta", icon: "planta", ecras: ["braco", "sala"], se: () => !!CFG.planta },
  ].filter((s) => !s.se || s.se());

  // Cada paleta tem dois modos: o escuro (de noite) e o claro (de dia). As
  // amostras das Definições mostram a paleta no modo em que o painel está.
  const THEMES = [
    { id: "grafite", name: "Grafite", escuro: { bg: "#0a0a0c", tint: "#4c9aff" }, claro: { bg: "#f2f2f7", tint: "#0a66d6" } },
    { id: "lilas", name: "Lilás", escuro: { bg: "#08060d", tint: "#a98bff" }, claro: { bg: "#f2f0f8", tint: "#6a48d8" } },
    { id: "dourado", name: "Dourado", escuro: { bg: "#0a0805", tint: "#e0a94f" }, claro: { bg: "#f3f1ec", tint: "#8f5f0c" } },
    { id: "verde", name: "Verde", escuro: { bg: "#030805", tint: "#4bd6a0" }, claro: { bg: "#eef3f0", tint: "#0c7a51" } },
    { id: "oled", name: "Preto e branco", escuro: { bg: "#000000", tint: "#ffffff" }, claro: { bg: "#ffffff", tint: "#111111" } },
  ];
  const THEME_KEY = "casa_os_theme";
  const MODO_KEY = "casa_os_modo";
  const MODOS = [
    { id: "auto", name: "Automático" },
    { id: "claro", name: "Claro" },
    { id: "escuro", name: "Escuro" },
  ];

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
    aplicarColapsada(cls); // a barra lembra-se de si por tipo de ecrã
    if (aoMudar) aoMudar();
  }

  const currentTheme = () => document.documentElement.getAttribute("data-theme") || "grafite";
  const guarda = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      /* modo privado */
    }
  };
  const le = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  const pintaBarra = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  };

  function applyTheme(id, guardar = true) {
    // "claro" era uma paleta; agora é o modo claro do Grafite
    if (id === "claro") {
      id = "grafite";
      guarda(THEME_KEY, id);
      if (!le(MODO_KEY)) applyModo("claro");
    }
    if (!THEMES.some((t) => t.id === id)) return;
    document.documentElement.setAttribute("data-theme", id);
    if (guardar) guarda(THEME_KEY, id);
    pintaBarra();
  }

  /** O modo escolhido: "auto", "claro" ou "escuro". */
  const modoEscolhido = () => {
    const m = le(MODO_KEY);
    return MODOS.some((x) => x.id === m) ? m : "escuro";
  };
  /** O modo que está à vista (o automático resolve-se pelo sol da casa). */
  const currentModo = () => document.documentElement.getAttribute("data-modo") || "escuro";

  function modoDoSol() {
    const sol = HA.get("sun.sun");
    if (sol) return sol.state === "above_horizon" ? "claro" : "escuro";
    const h = new Date().getHours(); // antes de a casa responder, a hora chega
    return h >= 7 && h < 20 ? "claro" : "escuro";
  }

  function applyModo(pref, guardar = true) {
    if (!MODOS.some((m) => m.id === pref)) pref = "escuro";
    if (guardar) guarda(MODO_KEY, pref);
    const efetivo = pref === "auto" ? modoDoSol() : pref;
    if (document.documentElement.getAttribute("data-modo") !== efetivo) {
      document.documentElement.setAttribute("data-modo", efetivo);
      pintaBarra();
    }
  }
  // no automático, o painel muda quando o sol nasce e quando se põe
  HA.subscribe((id) => {
    if ((id === "sun.sun" || id === "*") && modoEscolhido() === "auto") applyModo("auto", false);
  });

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
    THEMES, currentTheme, applyTheme, MODOS, modoEscolhido, currentModo, applyModo,
    emEcraCheio, trocarEcraCheio, descansarJa,
    aDescansar: () => aDescansar,
    acordar, avaliar,
    /** As Definições mudam quem se vê no fundo da barra; isto redesenha-o. */
    atualizarBarra: () => mountFoot(),
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
  const side = el('<aside class="side"><nav class="nav" aria-label="Secções"></nav><div class="foot"></div></aside>');
  // o conteúdo de cada secção é o "main": quem usa leitor de ecrã salta para lá
  const body = el('<main class="body" id="conteudo"></main>');
  const tabbar = el('<nav class="tabbar" aria-label="Secções"></nav>');

  function navButton(s, atual, cls) {
    const b = el(
      `<button class="${cls}" data-sec="${s.id}" aria-label="${esc(s.title)}" title="${esc(s.title)}"${s.id === atual ? ' aria-current="page"' : ""}>
        ${icon(s.icon)}<span>${esc(s.title)}</span></button>`,
    );
    b.addEventListener("click", () => go(s.id));
    return b;
  }

  function paintNav(atual) {
    const ecra = document.documentElement.getAttribute("data-screen");
    const visiveis = SECTIONS.filter((s) => !s.oculta && s.ecras.includes(ecra));

    const nav = side.querySelector(".nav");
    nav.innerHTML = "";
    visiveis.forEach((s) => nav.appendChild(navButton(s, atual, "nb")));

    tabbar.innerHTML = "";
    visiveis.forEach((s) => tabbar.appendChild(navButton(s, atual, "")));

    // o Menu só existe quando há secções fora da barra — no tablet e na TV
    // estão todas à vista, e um menu que repete a barra é só mais uma decisão
    const menu = side.querySelector(".menu-btn");
    if (menu) menu.hidden = !SECTIONS.some((s) => !s.oculta && !s.ecras.includes(ecra));
  }

  /* ───────── Barra lateral: recolher ─────────
   * Só existe na parede e na TV (no telemóvel não há barra). A escolha é do
   * aparelho, não da pessoa: o tablet fixo na parede e o computador da
   * secretária não querem a mesma coisa.
   */
  const BARRA_KEY = (ecra) => `casa_os_barra_${ecra}`;
  const temBarra = (ecra) => ecra === "braco" || ecra === "sala";
  const colapsada = (ecra) => temBarra(ecra) && le(BARRA_KEY(ecra)) === "sim";

  function aplicarColapsada(ecra) {
    side.setAttribute("data-colapsada", colapsada(ecra) ? "sim" : "nao");
    const btn = side.querySelector(".colapsar-btn");
    if (!btn) return;
    const acao = colapsada(ecra) ? "Expandir" : "Recolher";
    btn.setAttribute("aria-label", `${acao} barra lateral`);
    btn.title = `${acao} barra lateral (tecla [)`;
    btn.setAttribute("aria-pressed", String(colapsada(ecra)));
  }

  function alternarColapsada() {
    const ecra = document.documentElement.getAttribute("data-screen");
    if (!temBarra(ecra)) return;
    guarda(BARRA_KEY(ecra), colapsada(ecra) ? "nao" : "sim");
    aplicarColapsada(ecra);
  }

  /** Quem está em casa, e os botões do fundo da barra lateral. */
  function mountFoot() {
    const foot = side.querySelector(".foot");
    foot.innerHTML = "";
    const pessoas = CFG.people || [];
    if (pessoas.length && DEFS.get("mostrarPresenca") !== false) {
      const avatars = el('<div class="avatars"></div>');
      pessoas.forEach((p) => {
        const av = el(`<span class="av" role="img">${esc(p.name[0])}</span>`);
        // "em-casa", não "home": essa classe já é o contentor da Casa (.pad.home)
        // O anel diz-se pela cor, mas quem usa leitor de ecrã só sabe se estiver no texto.
        const pinta = () => {
          const emCasa = (HA.get(p.entity) || {}).state === "home";
          av.classList.toggle("em-casa", emCasa);
          const texto = `${p.name}, ${emCasa ? "em casa" : "fora"}`;
          av.setAttribute("aria-label", texto);
          av.title = texto;
        };
        HA.subscribe((id) => {
          if (id === "*" || id === p.entity) pinta();
        });
        pinta();
        avatars.appendChild(av);
      });
      foot.appendChild(avatars);
    }
    const menu = el(`<button class="nb menu-btn" aria-label="Menu" title="Menu">${icon("menu")}<span>Menu</span></button>`);
    menu.addEventListener("click", openMenu);
    foot.appendChild(menu);
    const defs = el(`<button class="nb" data-sec="definicoes" aria-label="Definições" title="Definições">${icon("definicoes")}<span>Definições</span></button>`);
    defs.addEventListener("click", () => go("definicoes"));
    foot.appendChild(defs);
    const colapsar = el(`<button class="nb colapsar-btn" aria-pressed="false">${icon("barra")}<span>Recolher</span></button>`);
    colapsar.addEventListener("click", alternarColapsada);
    foot.appendChild(colapsar);
    aplicarColapsada(document.documentElement.getAttribute("data-screen"));
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
    if (e.key === "Escape") {
      closeMenu();
      return;
    }
    // "[" recolhe/expande a barra — mas não enquanto se escreve nalgum campo
    if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
    const alvo = e.target;
    if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
    alternarColapsada();
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
    // Sem nada da casa, nenhuma secção pode dizer a verdade: diz-se isso, e
    // mais nada. Quando os estados chegarem, desenha-se a secção a sério.
    semDados = HA.count() === 0;
    if (semDados) {
      body.appendChild(el(`<div class="pad col grow sem-casa" role="status">
        <span class="sc-ic">${icon("wifioff", "ic-l")}</span>
        <div class="t2">Sem ligação à casa</div>
        <div class="bd dim">O painel ainda não conseguiu falar com o Home Assistant. Tenta outra vez sozinho, não é preciso fazer nada.</div>
        <div class="row sc-estado"><span class="spin"></span><span class="ft">A tentar ligar…</span></div></div>`));
      document.title = `Sem ligação · ${window.CASA.title}`;
      return;
    }
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
    marcarTitulos(vista);
    body.appendChild(vista);
    const titulo = sectionOf(sec).title;
    document.title = sec === "casa" ? window.CASA.title : `${titulo} · ${window.CASA.title}`;
  }

  /**
   * Os títulos desenham-se como texto (div.t2, span.cap) para caberem no
   * sistema de tamanhos; aqui passam a ser títulos para quem navega por eles.
   */
  function marcarTitulos(vista) {
    const h1 = vista.querySelector(".head .t2, .verdict .vline");
    if (h1) {
      h1.setAttribute("role", "heading");
      h1.setAttribute("aria-level", "1");
    }
    vista.querySelectorAll(".card > .cap:first-child, .pp-sec > .cap, .chart .sb > .cap, .def-grupo > .cap, .acol-topo .cap, .grupo-divisao > .cap").forEach((c) => {
      c.setAttribute("role", "heading");
      c.setAttribute("aria-level", "2");
    });
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
        banner = el(`<div class="offline" role="status" aria-live="polite"><span class="spin"></span>
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
      // fora da secção: mudar de secção não o pode apagar enquanto a casa não voltar
      if (!banner.isConnected) document.body.appendChild(banner);
    });

    // Um comando que não chegou diz-se, com uma saída: tentar outra vez.
    HA.onFalha((erro, pedido) => {
      const semLigacao = HA.status !== "online" || /sem ligação|ligação perdida/.test(String(erro && erro.message));
      K.nota({
        tom: "erro",
        texto: semLigacao ? "Sem ligação à casa: o comando não foi enviado." : "A casa não respondeu a este pedido.",
        acao: { rotulo: "Tentar outra vez", fn: () => HA.call(pedido.domain, pedido.service, pedido.entityId, pedido.data) },
      });
    });
  }

  // ───────── Arranque ─────────

  function boot() {
    applyScreen();
    DEFS.aplicarTamanho(document.documentElement.getAttribute("data-screen"));
    applyModo(modoEscolhido(), false);
    applyTheme(le(THEME_KEY) || "grafite", false);
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

  let semDados = false;
  // se o painel abriu sem casa, redesenha-se quando ela aparecer
  HA.subscribe((id) => {
    if (arrancou && semDados && id === "*" && HA.count() > 0) render();
  });

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
  // Em rede local a casa responde antes de este ficheiro correr: o "*" já
  // passou e ninguém o ouviu. Se os estados já cá estão, arranca-se já.
  if (HA.count() > 0) {
    unsub();
    start();
  }
  // se a casa não responder, a casca aparece na mesma e diz porquê
  setTimeout(start, 4000);
})();
