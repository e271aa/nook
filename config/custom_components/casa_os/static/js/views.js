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
  const K = window.KIT;
  const { CFG, bind, limpar, ecra, divisoes, todasLuzes, todosEstores, acesas, abertos, avisos, calmaDesde } = K;

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
    // o veredicto muda quando a casa muda: quem não vê o ecrã ouve-o
    const node = el('<div class="verdict"><div class="cap"></div><div class="vline" aria-live="polite"></div></div>');
    const data = node.querySelector(".cap");
    const linha = node.querySelector(".vline");

    K.intervalo(() => {
      const agora = new Date();
      data.textContent = `${diaPorExtenso(agora)} · ${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
    });

    bind(node, (id) => id === K.AVISOS, () => {
      const n = avisos().length;
      // o pior que um painel destes pode fazer é tranquilizar sem saber
      node.classList.toggle("sem-ligacao", !HA.online());
      linha.innerHTML = !HA.online()
        ? "Sem ligação<br>à casa"
        : !n
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
        <div class="ft">${esc(a.detalhe)}${a.divisao && !new RegExp(a.divisao, "i").test(a.detalhe || "") ? ` · ${esc(a.divisao)}` : ""}</div>
      </div></div>`);

    const acts = el('<div class="acts"></div>');
    if (a.acao) {
      const b = el(`<button class="pill on">${esc(a.acao.texto)}</button>`);
      b.addEventListener("click", async () => {
        b.disabled = true;
        b.textContent = "A tratar…";
        const r = await HA.call(a.acao.dominio, a.acao.servico, a.acao.entidade, a.acao.dados || {});
        // se não chegou, o botão volta (a nota já disse porquê); se chegou, o aviso some sozinho
        if (r === null) {
          b.disabled = false;
          b.textContent = a.acao.texto;
        }
      });
      acts.appendChild(b);
    }
    // quem vê um aviso numa divisão com câmara quer ver a câmara
    const r = divisoes().find((d) => d.name === a.divisao);
    if (r && r.camera) {
      const c = el(`<button class="pill">${icon("camera", "ic-s")}Ver câmara</button>`);
      c.addEventListener("click", () => K.ampliar({ entidade: r.camera, nome: r.name }));
      acts.appendChild(c);
    }
    if (acts.children.length) node.querySelector(".tx").appendChild(acts);
    return node;
  }

  /**
   * O espaço dos avisos. Em calma não é um cartão vazio: é a casa de relance,
   * desenhada, com as luzes que estão acesas. Com avisos, a mesma planta
   * mostra onde é que está o problema. Sem ligação, diz que não sabe.
   */
  function colunaAvisos({ grande }) {
    const node = el('<section class="acol" aria-label="Avisos"></section>');
    const topo = el('<div class="acol-topo"></div>');
    const lista = el('<div class="acol-lista" aria-live="polite"></div>');
    node.append(topo, lista);

    // a miniatura: uma por piso, criada quando é precisa e reaproveitada
    const temPlanta = !!(CFG.planta && K.plantaMiniatura);
    const quadro = temPlanta ? el('<button class="acol-planta"><span class="ap-leg cap"></span></button>') : null;
    const minis = {};
    let pisoVisto = null;
    let divisaoDoAviso = null;
    if (quadro) {
      node.appendChild(quadro);
      quadro.addEventListener("click", () => (location.hash = divisaoDoAviso ? `#/planta/${divisaoDoAviso}` : "#/planta"));
    }
    const mostraPiso = (pisoId, destaques) => {
      if (!quadro) return;
      if (!minis[pisoId]) minis[pisoId] = K.plantaMiniatura(pisoId);
      const m = minis[pisoId];
      if (pisoVisto !== pisoId) {
        quadro.querySelectorAll(".pl-mini").forEach((n) => n.remove());
        quadro.prepend(m.node);
        pisoVisto = pisoId;
      }
      m.destacar(destaques);
      comDestaque = destaques.length > 0;
      legenda();
      quadro.setAttribute("aria-label", comDestaque ? "Ver na planta onde está o aviso" : "Abrir a planta");
    };
    let comDestaque = false;
    const legenda = () => {
      if (!quadro || !pisoVisto) return;
      const nome = ((CFG.floors || []).find((f) => f.id === pisoVisto) || {}).name || "";
      const n = divisoes().filter((r) => r.floor === pisoVisto).flatMap((r) => r.lights || []).filter((l) => HA.isOn(l)).length;
      quadro.querySelector(".ap-leg").textContent = comDestaque
        ? `${nome} · onde está`
        : `${nome} · ${n ? `${fmt.n(n)} ${n === 1 ? "luz acesa" : "luzes acesas"}` : "luzes apagadas"}`;
    };
    if (quadro) bind(quadro, (id) => id.startsWith("light."), legenda);
    const primeiroPiso = temPlanta ? ((CFG.planta.pisos || [])[0] || {}).id : null;

    bind(node, (id) => id === K.AVISOS, () => {
      const avs = avisos();
      topo.innerHTML = "";
      lista.innerHTML = "";
      node.classList.toggle("incerto", !HA.online());
      divisaoDoAviso = null;

      if (!HA.online()) {
        const t = HA.ultimoContacto();
        topo.appendChild(el(`<div class="calm incerto">
          <span class="mark">${icon("wifioff", "ic-s")}</span>
          <div><div class="hd">Não sei se há avisos</div>
          <div class="ft">${t ? `A casa não responde desde as ${esc(horas(new Date(t).toISOString()))}. O que está à vista é desse momento.` : "O painel ainda não falou com a casa."}</div></div>
        </div>`));
        if (primeiroPiso) mostraPiso(primeiroPiso, []);
        return;
      }

      if (!avs.length) {
        const desde = calmaDesde();
        topo.appendChild(el(`<div class="calm">
          <span class="mark">${icon("check", "ic-s")}</span>
          <div><div class="hd">Nada a precisar de ti</div>
          <div class="ft">${desde ? `Sem avisos desde as ${esc(horas(desde))} · ` : ""}${fmt.n(HA.count())} aparelhos a responder</div></div>
        </div>`));
        if (primeiroPiso) mostraPiso(primeiroPiso, []);
        return;
      }

      topo.appendChild(el(`<div class="sb"><span class="cap">A precisar de ti</span>
        ${avs.length > 1 ? `<span class="cap">${fmt.n(avs.length)}</span>` : ""}</div>`));
      // com a planta por baixo cabem dois; sem ela, três
      const cabem = quadro ? 2 : 3;
      avs.slice(0, cabem).forEach((a) => lista.appendChild(cartaoAviso(a, grande && avs.length === 1)));
      if (avs.length > cabem) lista.appendChild(el(`<div class="ft dim2">e mais ${fmt.n(avs.length - cabem)}</div>`));

      // a planta vai para o piso do primeiro aviso que tem sítio, e marca-os todos lá
      const comSitio = avs.map((a) => divisoes().find((r) => r.name === a.divisao)).filter(Boolean);
      const piso = comSitio.length && K.pisoDaDivisao ? K.pisoDaDivisao(comSitio[0].id) : primeiroPiso;
      divisaoDoAviso = comSitio.length ? comSitio[0].id : null;
      if (piso) mostraPiso(piso, comSitio.filter((r) => K.pisoDaDivisao(r.id) === piso).map((r) => r.id));
    });

    return node;
  }

  /** Janelas e portas abertas neste momento — o que uma cena não fecha sozinha. */
  function porFecharAgora() {
    const lista = [];
    divisoes().forEach((r) => {
      (r.windows || []).forEach((w) => HA.isOn(w) && lista.push({ nome: HA.name(w), icone: "window" }));
      if (r.contact && HA.isOn(r.contact)) lista.push({ nome: HA.name(r.contact), icone: "door" });
    });
    return lista;
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
        b.addEventListener("click", async () => {
          // sair de casa (ou deitar) com uma janela aberta: pergunta-se primeiro
          if (a.antes === "fecho") {
            const abertas = porFecharAgora();
            if (abertas.length) {
              const ok = await K.folha({
                titulo: abertas.length === 1 ? `${abertas[0].nome} está aberta` : `Há ${fmt.n(abertas.length)} coisas abertas`,
                texto: `«${a.nome}» não fecha janelas nem portas.`,
                // uma só já está no título; a lista é para quando há mais
                itens: abertas.length > 1 ? abertas.map((x) => ({ icone: x.icone, texto: x.nome, valor: "Aberta" })) : [],
                confirmar: a.confirmar || "Continuar na mesma",
              });
              if (!ok) return;
            }
          }
          piscar(b);
          K.emMassa({ nome: a.nome, fazer: () => HA.call((a.entidade || "").split(".")[0], "turn_on", a.entidade) });
        });
      } else if (a.tipo === "luzes") {
        bind(b, (id) => id.startsWith("light."), () => {
          const n = acesas().length;
          sub.textContent = n ? `${fmt.n(n)} ${n === 1 ? "acesa" : "acesas"}` : "estão todas apagadas";
          b.disabled = n === 0;
        });
        b.addEventListener("click", () => {
          piscar(b);
          K.emMassa({ nome: "Luzes", ids: todasLuzes(), fazer: () => HA.call("light", "turn_off", todasLuzes()) });
        });
      } else if (a.tipo === "estores") {
        bind(b, (id) => id.startsWith("cover."), () => {
          const n = abertos().length;
          sub.textContent = n ? `${fmt.n(n)} ${n === 1 ? "aberto" : "abertos"}` : "estão todos fechados";
          b.disabled = n === 0;
        });
        b.addEventListener("click", () => {
          piscar(b);
          K.emMassa({ nome: "Estores", ids: todosEstores(), fazer: () => HA.call("cover", "set_cover_position", todosEstores(), { position: 0 }) });
        });
      }
      node.appendChild(b);
    });

    return node;
  }

  /**
   * O que fica no lugar das teclas quando estão escondidas. Sem isto, num
   * tablet nada dizia que elas existiam: quem não sabia não sabia. Um toque
   * abre-as — é a mesma coisa que tocar em qualquer parte do painel.
   */
  function faixaDasTeclas() {
    const b = el(`<button class="keys-faixa" aria-label="Mostrar as ações rápidas">
      ${icon("up", "ic-s")}<span>Ações rápidas</span></button>`);
    b.addEventListener("click", () => window.APP && window.APP.acordar());
    return b;
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

    // Da parede lê-se de relance: um número que salta de 360 para 750 W e volta
    // em dois segundos lê-se como tremor. Mostra-se uma média dos últimos
    // segundos (como os contadores), arredondada a 10 W; um salto grande
    // (ligar o forno) aparece logo.
    const medias = {};
    const suave = (chave, x) => {
      if (x === null || x === undefined) return x;
      const agora = Date.now();
      const m = medias[chave];
      if (!m || Math.abs(x - m.v) > Math.max(800, Math.abs(m.v) * 0.8)) {
        medias[chave] = { v: x, t: agora };
        return Math.round(x / 10) * 10;
      }
      const a = 1 - Math.exp(-(agora - m.t) / 5000);
      m.v += (x - m.v) * a;
      m.t = agora;
      return Math.round(m.v / 10) * 10;
    };

    bind(node, (id) => id.startsWith("sensor."), () => {
      const w = (id) => (id ? HA.num(id) : null);
      casa.querySelector(".v").innerHTML = potencia(suave("casa", w(P.home)));
      sol.querySelector(".v").innerHTML = potencia(suave("sol", w(P.solar)));

      const soc = w(E.battery_soc);
      const fluxo = w(P.battery) || 0;
      bat.querySelector(".v").innerHTML = `${fmt.n(soc)}<small> %</small>`;
      por(bat, fluxo > 20 ? "Bateria, a carregar" : fluxo < -20 ? "Bateria, a dar à casa" : "Bateria");

      const g = suave("rede", w(P.grid) || 0);
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
    node.append(hero, faixaDasTeclas(), teclas(), faixaEnergia());
    return node;
  }

  /** No telemóvel a ordem é a mesma, mas em pilha e a rolar. */
  function casaNaMao() {
    const node = el('<div class="scroll pad col home-mao"></div>');
    // o veredicto vai num cabeçalho: é aí que o painel põe o botão do Menu, e
    // sem ele o início era o único sítio do telemóvel sem caminho para o resto
    const cab = el('<div class="head casa-cab"></div>');
    cab.appendChild(veredicto());
    node.appendChild(cab);
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

  K.teclas = teclas;
  window.VIEWS = { casa, controlos, vigilancia, energia, rotina, limpar };
})();
