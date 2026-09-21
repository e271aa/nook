/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — as secções.
 *
 *  A Casa responde, por esta ordem, às quatro perguntas que alguém faz ao
 *  passar à frente de um painel de parede:
 *    1. está alguma coisa errada?
 *    2. ficou alguma coisa ligada ou aberta?
 *    3. estou a gastar ou a poupar?
 *    4. quem está em casa, e está trancado?
 *  Tudo o resto é consulta, e consulta vive nas outras secções.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const CFG = window.CASA.config || {};

  const AVISOS = "sensor.avisos";

  /* ───────── Ligar um pedaço de ecrã ao estado da casa ─────────
   * Tudo o que se liga aqui desliga-se quando a secção sai do ecrã: sem isto,
   * navegar dez vezes deixava dez cópias de cada coisa a ouvir a casa.
   */
  let ligacoes = [];
  let relogios = [];

  function bind(node, interessa, pinta) {
    ligacoes.push(HA.subscribe((id) => {
      if (id === "*" || interessa(id)) pinta();
    }));
    pinta();
    return node;
  }

  function cadaSegundo(fn) {
    fn();
    relogios.push(setInterval(fn, 1000));
  }

  function limpar() {
    ligacoes.forEach((u) => u());
    ligacoes = [];
    relogios.forEach((t) => clearInterval(t));
    relogios = [];
  }

  // ───────── O que a casa tem ─────────

  const divisoes = () => CFG.rooms || [];
  const todasLuzes = () => divisoes().flatMap((r) => r.lights || []);
  const todosEstores = () =>
    divisoes().flatMap((r) => (r.covers || []).filter((c) => !/portao|garagem/i.test(c)));
  const posicao = (id) => HA.attr(id, "current_position", HA.isOn(id) ? 100 : 0) || 0;
  const acesas = () => todasLuzes().filter((l) => HA.isOn(l));
  const abertos = () => todosEstores().filter((c) => posicao(c) > 0);

  function avisos() {
    const s = HA.get(AVISOS);
    return (s && s.attributes && s.attributes.avisos) || [];
  }

  const calmaDesde = () => {
    const s = HA.get(AVISOS);
    return (s && s.attributes && s.attributes.calma_desde) || null;
  };

  const ecra = () => document.documentElement.getAttribute("data-screen");

  /** "Segunda-feira, 21 de setembro" */
  function diaPorExtenso(d) {
    const s = d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  const horas = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const CEU = {
    "clear-night": "céu limpo",
    sunny: "céu limpo",
    partlycloudy: "algumas nuvens",
    cloudy: "nublado",
    rainy: "chuva",
    pouring: "chuva forte",
    fog: "nevoeiro",
  };

  // ───────── Peças da Casa ─────────

  /** A resposta à primeira pergunta, no tamanho que se lê da porta da rua. */
  function veredicto() {
    const node = el('<div class="verdict"><div class="cap"></div><div class="vline"></div></div>');
    const data = node.querySelector(".cap");
    const linha = node.querySelector(".vline");

    cadaSegundo(() => {
      const agora = new Date();
      data.textContent = `${diaPorExtenso(agora)} · ${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
    });

    bind(node, (id) => id === AVISOS, () => {
      const n = avisos().length;
      linha.innerHTML = !n
        ? "Está tudo<br>em ordem"
        : n === 1
          ? "Uma coisa<br>por resolver"
          : `${fmt.n(n)} coisas<br>por resolver`;
    });

    node.appendChild(factos());
    return node;
  }

  /** A segunda e a quarta perguntas, em quatro linhas que se leem de relance. */
  function factos() {
    const node = el('<div class="facts"></div>');
    const linha = () => {
      const n = el('<div class="sub"></div>');
      node.appendChild(n);
      return n;
    };
    const tempo = linha();
    const luzes = linha();
    const estores = linha();
    const gente = linha();

    bind(node, (id) => id.startsWith("sensor.") || id === CFG.weather || id === "sun.sun", () => {
      const dentro = CFG.indoor_temperature ? HA.num(CFG.indoor_temperature) : null;
      const fora = CFG.outdoor && CFG.outdoor.temperature ? HA.num(CFG.outdoor.temperature) : null;
      const ceu = CEU[(HA.get(CFG.weather) || {}).state] || "";
      const sol = HA.get("sun.sun") || { state: "", attributes: {} };
      const noite = sol.state === "below_horizon";
      const quando = noite
        ? `o sol nasce às ${horas(sol.attributes.next_rising)}`
        : `o sol põe-se às ${horas(sol.attributes.next_setting)}`;
      tempo.textContent = `${fmt.temp(dentro)} dentro · ${fmt.temp(fora)} fora · ${ceu}, ${quando}`;
    });

    bind(node, (id) => id.startsWith("light."), () => {
      const on = acesas();
      if (!on.length) {
        luzes.textContent = "Nenhuma luz acesa";
        return;
      }
      const nomes = on.slice(0, 3).map((l) => HA.name(l)).join(", ");
      const resto = on.length - 3;
      luzes.textContent = `${on.length === 1 ? "Uma luz acesa" : `${fmt.n(on.length)} luzes acesas`} — ${nomes}${resto > 0 ? ` e mais ${resto}` : ""}`;
    });

    bind(node, (id) => id.startsWith("cover.") || id === CFG.boiler, () => {
      const ab = abertos().length;
      const tot = todosEstores().length;
      const partes = [ab === 0 ? "Estores todos fechados" : ab === tot ? "Estores todos abertos" : `${fmt.n(ab)} de ${fmt.n(tot)} estores abertos`];
      if (CFG.boiler && HA.isOn(CFG.boiler)) partes.push("cilindro ligado");
      estores.textContent = partes.join(" · ");
    });

    const porta = divisoes().find((r) => r.lock || r.contact);
    bind(node, (id) => id.startsWith("person.") || (porta && (id === porta.lock || id === porta.contact)), () => {
      const emCasa = (CFG.people || []).filter((p) => (HA.get(p.entity) || {}).state === "home");
      const quem = !emCasa.length
        ? "Ninguém em casa"
        : emCasa.length === (CFG.people || []).length
          ? `${emCasa.map((p) => p.name).join(" e ")} em casa`
          : `${emCasa.map((p) => p.name).join(" e ")} em casa, ${(CFG.people || []).length - emCasa.length} fora`;
      const fecho = porta && porta.lock
        ? (HA.get(porta.lock) || {}).state === "locked" ? "porta trancada" : "porta destrancada"
        : "";
      gente.textContent = fecho ? `${quem}, ${fecho}` : quem;
    });

    return node;
  }

  /** Um aviso, com o que fazer em relação a ele. */
  function cartaoAviso(a, grande) {
    const node = el(`<div class="alert g-${esc(a.gravidade)}">
      <span class="ib">${icon(a.icone || "alert", "ic-s")}</span>
      <div class="tx">
        <div class="${grande ? "hd" : "bd"}" style="font-weight:var(--w-s)">${esc(a.titulo)}</div>
        <div class="ft">${esc(a.detalhe)}${a.divisao ? ` · ${esc(a.divisao)}` : ""}</div>
      </div></div>`);

    if (a.acao) {
      const acts = el('<div class="acts"></div>');
      const b = el(`<button class="pill on">${esc(a.acao.texto)}</button>`);
      b.addEventListener("click", () => {
        HA.call(a.acao.dominio, a.acao.servico, a.acao.entidade, a.acao.dados || {});
        b.disabled = true;
        b.textContent = "A tratar…";
      });
      acts.appendChild(b);
      node.querySelector(".tx").appendChild(acts);
    }
    return node;
  }

  /** O espaço dos avisos, que é fixo mesmo quando não há nenhum. */
  function colunaAvisos({ grande }) {
    const node = el('<div class="acol"></div>');

    bind(node, (id) => id === AVISOS, () => {
      const lista = avisos();
      node.innerHTML = "";

      if (!lista.length) {
        const desde = calmaDesde();
        node.appendChild(el(`<div class="calm">
          <span class="mark">${icon("check", "ic-s")}</span>
          <div class="hd">Nada a precisar de ti</div>
          <div class="ft">${desde ? `Sem avisos desde as ${esc(horas(desde))}. ` : ""}A casa tem ${fmt.n(HA.count())} aparelhos a responder.</div>
        </div>`));
        return;
      }

      const topo = el(`<div class="sb"><span class="cap">A precisar de ti</span>
        ${lista.length > 1 ? `<span class="cap">${fmt.n(lista.length)}</span>` : ""}</div>`);
      node.appendChild(topo);
      lista.slice(0, 3).forEach((a) => node.appendChild(cartaoAviso(a, grande && lista.length === 1)));
      if (lista.length > 3) {
        node.appendChild(el(`<div class="ft dim2">e mais ${fmt.n(lista.length - 3)}</div>`));
      }
    });

    return node;
  }

  /** As seis teclas. São as da instalação: uma casa maior não tem mais. */
  function teclas() {
    const node = el('<div class="keys"></div>');

    (CFG.acoes || []).forEach((a) => {
      const b = el(`<button class="key${a.tipo === "cena" ? " prime" : ""}">
        <span class="ki">${icon(a.icone || "plug", "ic-l")}</span>
        <span><span class="kn">${esc(a.nome)}</span><span class="ks"></span></span>
      </button>`);
      const sub = b.querySelector(".ks");

      if (a.tipo === "cena") {
        sub.textContent = a.detalhe || "";
        b.addEventListener("click", () => {
          HA.call((a.entidade || "").split(".")[0], "turn_on", a.entidade);
          piscar(b);
        });
      } else if (a.tipo === "luzes") {
        bind(b, (id) => id.startsWith("light."), () => {
          const n = acesas().length;
          sub.textContent = n ? `${fmt.n(n)} ${n === 1 ? "acesa" : "acesas"}` : "estão todas apagadas";
          b.disabled = n === 0;
        });
        b.addEventListener("click", () => {
          HA.call("light", "turn_off", todasLuzes());
          piscar(b);
        });
      } else if (a.tipo === "estores") {
        bind(b, (id) => id.startsWith("cover."), () => {
          const n = abertos().length;
          sub.textContent = n ? `${fmt.n(n)} ${n === 1 ? "aberto" : "abertos"}` : "estão todos fechados";
          b.disabled = n === 0;
        });
        b.addEventListener("click", () => {
          HA.call("cover", "set_cover_position", todosEstores(), { position: 0 });
          piscar(b);
        });
      }
      node.appendChild(b);
    });

    return node;
  }

  function piscar(b) {
    b.classList.add("feito");
    setTimeout(() => b.classList.remove("feito"), 900);
  }

  /** A terceira pergunta: estou a gastar ou a poupar? */
  function faixaEnergia() {
    const E = CFG.energy || {};
    const P = E.power || {};
    const node = el('<div class="strip"></div>');
    const stat = (cls, k) => {
      const n = el(`<div class="stat ${cls}"><div class="v num"></div><div class="k">${esc(k)}</div></div>`);
      node.appendChild(n);
      return n;
    };
    const casa = stat("", "A casa gasta agora");
    const sol = stat("sol", "Vem do sol");
    const bat = stat("bat", "Bateria");
    const rede = stat("", "Da rede");

    const por = (n, texto) => (n.querySelector(".k").textContent = texto);

    bind(node, (id) => id.startsWith("sensor."), () => {
      const w = (id) => (id ? HA.num(id) : null);
      casa.querySelector(".v").innerHTML = potencia(w(P.home));
      sol.querySelector(".v").innerHTML = potencia(w(P.solar));

      const soc = w(E.battery_soc);
      const fluxo = w(P.battery) || 0;
      bat.querySelector(".v").innerHTML = `${fmt.n(soc)}<small> %</small>`;
      por(bat, fluxo > 20 ? "Bateria, a carregar" : fluxo < -20 ? "Bateria, a dar à casa" : "Bateria");

      const g = w(P.grid) || 0;
      rede.querySelector(".v").innerHTML = potencia(Math.abs(g));
      por(rede, g > 20 ? "Comprado à rede" : g < -20 ? "Vendido à rede" : "Da rede — nada");
    });

    return node;
  }

  function potencia(v) {
    if (v === null || v === undefined) return "—";
    return Math.abs(v) >= 1000
      ? `${fmt.n(v / 1000, 2)}<small> kW</small>`
      : `${fmt.n(v)}<small> W</small>`;
  }

  // ───────── Casa ─────────

  function casa() {
    if (ecra() === "mao") return casaNaMao();

    const node = el('<div class="pad home"></div>');
    const hero = el('<div class="hero"></div>');
    hero.appendChild(el('<div class="vcol"></div>')).appendChild(veredicto());
    hero.appendChild(colunaAvisos({ grande: true }));
    node.append(hero, teclas(), faixaEnergia());
    return node;
  }

  /** No telemóvel a ordem é a mesma, mas em pilha e a rolar. */
  function casaNaMao() {
    const node = el('<div class="scroll pad col home-mao"></div>');
    node.appendChild(veredicto());
    node.appendChild(colunaAvisos({ grande: false }));
    node.appendChild(teclas());
    node.appendChild(el('<div class="cap">Energia agora</div>'));
    node.appendChild(faixaEnergia());
    return node;
  }

  // ───────── Secções por construir ─────────

  function page(titulo, sub, corpo) {
    const node = el('<div class="pad col grow"></div>');
    node.appendChild(
      el(`<div class="head"><div>
        <div class="t2">${esc(titulo)}</div>
        <div class="ft">${esc(sub)}</div>
      </div></div>`),
    );
    node.appendChild(corpo);
    return node;
  }

  function porConstruir(ico, oQueVaiViver, fase) {
    return el(`<div class="empty">
      <span class="mark">${icon(ico, "ic-l")}</span>
      <div class="et">Por construir</div>
      <div class="es">${esc(oQueVaiViver)}</div>
      <div class="ft">Fase ${esc(fase)}</div>
    </div>`);
  }

  const divisoesView = () =>
    page("Divisões", "Dez divisões em três pisos",
      porConstruir("rooms", "As divisões numa grelha que enche o ecrã, por piso, e o detalhe de cada uma com as luzes, os estores, o clima, as tomadas e os sensores.", "3"));

  const controlos = () =>
    page("Controlos", "Tudo o que se liga, abre e aquece",
      porConstruir("sliders", "Luzes, estores, clima e tomadas, cada um no seu separador, com as ações de grupo em cima — desligar todas, fechar todos, a casa a 21 graus.", "4"));

  const vigilancia = () =>
    page("Vigilância", "A casa fechada, e quem passou",
      porConstruir("camera", "As três câmaras ao vivo, e por baixo o estado do fecho da casa: portas, janelas, movimento e fechaduras, com os últimos acontecimentos.", "5"));

  const energia = () =>
    page("Energia", "De onde vem e para onde vai",
      porConstruir("bolt", "O fluxo de agora — sol, casa, rede e bateria — e o relatório atrás dele: trinta dias, sete circuitos e o custo.", "6"));

  const rotina = () =>
    page("Rotina", "O que a casa tem para tratar",
      porConstruir("list", "Os lembretes com prazo, a lista de compras, os próximos dias da agenda, e o que está a dar na TV.", "6"));

  window.VIEWS = { casa, divisoes: divisoesView, controlos, vigilancia, energia, rotina, limpar };
})();
