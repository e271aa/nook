/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — Definições.
 *
 *  Tudo o que é do painel e não da casa: o tamanho, a paleta, o ecrã e, num
 *  tablet de parede, o comportamento de quiosque. Cada escolha aplica-se logo,
 *  à vista — o tamanho, sobretudo, que se escolhe olhando para o painel a
 *  mudar, não para um número.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { ecra } = K;
  const DEFS = window.DEFS;

  const VOLTAR = [
    { rotulo: "Nunca", v: 0 },
    { rotulo: "1 min", v: 60 },
    { rotulo: "3 min", v: 180 },
    { rotulo: "5 min", v: 300 },
    { rotulo: "10 min", v: 600 },
  ];
  const REPOUSO = [
    { rotulo: "Nunca", v: 0 },
    { rotulo: "5 min", v: 5 },
    { rotulo: "10 min", v: 10 },
    { rotulo: "30 min", v: 30 },
    { rotulo: "1 h", v: 60 },
  ];

  /** Um grupo de definições: título por cima, cartão por baixo. */
  function grupo(titulo, nota) {
    const g = el(`<section class="def-grupo"><div class="cap">${esc(titulo)}</div>
      <div class="card def-cartao"></div>${nota ? `<div class="ft dim2 def-nota">${esc(nota)}</div>` : ""}</section>`);
    return { node: g, corpo: g.querySelector(".def-cartao") };
  }

  function linha(titulo, sub, controlo) {
    const l = el(`<div class="def-linha"><div class="grow"><div class="bd">${esc(titulo)}</div>
      ${sub ? `<div class="ft dim2">${esc(sub)}</div>` : ""}</div></div>`);
    if (controlo) l.appendChild(controlo);
    return l;
  }

  // ───────── Tamanho ─────────

  function tamanho() {
    const e = ecra();
    const { node, corpo } = grupo("Tamanho", `Aplica-se a este aparelho, com o ecrã de ${DEFS.ECRAS[e].toLowerCase()}. Os outros guardam o seu.`);

    const atual = DEFS.tamanho(e);
    const legenda = el('<div class="def-legenda"></div>');
    const pinta = (i) => {
      const t = DEFS.TAMANHOS[i];
      legenda.innerHTML = `<span class="t1 num">${t.pct} %</span><span class="hd dim"> ${esc(t.nome)}</span>
        ${DEFS.escolhido(e) ? "" : '<div class="ft dim2">Ainda não escolheste: este é o tamanho de origem.</div>'}`;
    };
    pinta(atual);

    const seg = K.segmentado(
      DEFS.TAMANHOS.map((t) => `${t.pct} %`),
      atual,
      (i) => {
        DEFS.definirTamanho(e, i);
        pinta(i);
      },
      { cheio: true },
    );
    // os cinco degraus têm de se ler como uma escala, não como cinco números soltos
    const escala = el('<div class="def-escala"><span>Mais texto no ecrã</span><span>Letra maior</span></div>');
    corpo.append(legenda, seg, escala);
    return node;
  }

  // ───────── Aparência ─────────

  function aparencia() {
    const { node, corpo } = grupo("Aparência");
    const A = window.APP;

    // o modo: de dia claro, de noite escuro, ou sempre o mesmo
    const modos = A.MODOS;
    corpo.appendChild(linha("Modo", "Automático: claro de dia, escuro depois do pôr do sol."));
    const segModo = K.segmentado(modos.map((m) => m.name), Math.max(0, modos.findIndex((m) => m.id === A.modoEscolhido())), (i) => {
      A.applyModo(modos[i].id);
    }, { cheio: true });
    corpo.appendChild(segModo);

    // as paletas: cada amostra mostra a noite e o dia da mesma cor
    corpo.appendChild(linha("Paleta", "Cada cor tem o seu modo escuro e o seu modo claro."));
    const grelha = el('<div class="themes"></div>');
    const pinta = () =>
      grelha.querySelectorAll("[data-t]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.t === A.currentTheme())));
    A.THEMES.forEach((t) => {
      const b = el(`<button class="themebtn" data-t="${t.id}">
        <span class="sq" aria-hidden="true">
          <span class="meia" style="background:${t.escuro.bg}"><i style="background:${t.escuro.tint}"></i></span>
          <span class="meia" style="background:${t.claro.bg}"><i style="background:${t.claro.tint}"></i></span>
        </span>
        <span class="tn">${esc(t.name)}</span></button>`);
      b.addEventListener("click", () => {
        A.applyTheme(t.id);
        pinta();
      });
      grelha.appendChild(b);
    });
    pinta();
    corpo.appendChild(grelha);
    return node;
  }

  // ───────── Ecrã ─────────

  function ecraGrupo() {
    const A = window.APP;
    const { node, corpo } = grupo("Ecrã");

    // O painel adapta-se ao aparelho, mas não adivinha sempre bem: esta escolha manda.
    const tipos = [
      { rotulo: "Automático", v: undefined },
      { rotulo: "Tablet ou computador", v: "braco" },
      { rotulo: "Televisão", v: "sala" },
    ];
    const tipo = el('<div class="def-bloco"></div>');
    const detetado = A.ecraDetetado();
    tipo.appendChild(
      linha(
        "Tipo de ecrã",
        `Automático deteta: ${DEFS.ECRAS[detetado].toLowerCase()}. Uma televisão não tem teclas rápidas nem se toca; um computador com um monitor grande não é uma televisão.`,
      ),
    );
    tipo.appendChild(
      K.segmentado(tipos.map((t) => t.rotulo), Math.max(0, tipos.findIndex((t) => t.v === DEFS.get("ecra"))), (i) => {
        DEFS.set("ecra", tipos[i].v);
        A.reclassificar(); // se o tipo mudou, o painel redesenha-se (e estas Definições com ele)
      }, { cheio: true }),
    );
    if (ecra() !== "mao") corpo.appendChild(tipo); // no telemóvel o tipo é o do tamanho: não há o que escolher

    const cheio = el(`<button class="pill">${A.emEcraCheio() ? "Sair" : "Ecrã cheio"}</button>`);
    cheio.addEventListener("click", () => {
      A.trocarEcraCheio();
      setTimeout(() => (cheio.textContent = A.emEcraCheio() ? "Sair" : "Ecrã cheio"), 300);
    });
    corpo.appendChild(linha("Ecrã cheio", "Esconde a barra do browser.", cheio));

    const dormir = el('<button class="pill">Pôr a descansar</button>');
    dormir.addEventListener("click", () => A.descansarJa());
    corpo.appendChild(linha("Descansar já", "Fica só a hora, o veredicto e o que estiver mal. Um toque acorda.", dormir));

    const w = A.wake();
    corpo.appendChild(
      linha(
        "Manter o ecrã ligado",
        w.ativo ? "Ligado: o ecrã não se apaga enquanto o painel estiver aberto." : `Desligado: ${w.porque}.`,
        el(`<span class="pill ${w.ativo ? "on" : ""}">${w.ativo ? "Ligado" : "Desligado"}</span>`),
      ),
    );
    return node;
  }

  // ───────── Painel de parede ─────────

  function opcoes(lista, atual, aoEscolher) {
    return K.segmentado(lista.map((o) => o.rotulo), Math.max(0, lista.findIndex((o) => o.v === atual)), (i) => aoEscolher(lista[i].v), { cheio: true });
  }

  function parede() {
    const { node, corpo } = grupo(
      "Painel de parede",
      "Para um tablet que fica sempre ligado. O repouso só apaga o que é acessório; os avisos ficam sempre à vista.",
    );

    const teclas = el('<div class="def-bloco"></div>');
    teclas.appendChild(
      linha(
        "Teclas rápidas",
        "Ficam sempre à vista, ou só quando alguém se aproxima. Quando estão escondidas, uma faixa diz onde estão.",
      ),
    );
    const modos = [
      { rotulo: "Sempre visíveis", v: "sempre" },
      { rotulo: "Quando alguém se aproxima", v: "presenca" },
    ];
    teclas.appendChild(
      opcoes(modos, DEFS.teclas(ecra()), (v) => {
        DEFS.set("teclas", v);
        window.APP.avaliar();
      }),
    );
    corpo.appendChild(teclas);

    const voltar = el('<div class="def-bloco"></div>');
    voltar.appendChild(linha("Voltar ao Início", "Quando ninguém lhe toca, o painel volta sozinho à Casa."));
    voltar.appendChild(opcoes(VOLTAR, DEFS.get("voltar"), (v) => DEFS.set("voltar", v)));
    corpo.appendChild(voltar);

    const repouso = el('<div class="def-bloco"></div>');
    repouso.appendChild(linha("Repouso", "Depois de quanto tempo sem ninguém o painel esmorece."));
    repouso.appendChild(opcoes(REPOUSO, DEFS.get("repouso"), (v) => DEFS.set("repouso", v)));
    corpo.appendChild(repouso);

    const sw = K.interruptor("Só de noite");
    sw.definir(DEFS.get("soDeNoite"));
    sw.addEventListener("click", () => {
      DEFS.set("soDeNoite", !DEFS.get("soDeNoite"));
      sw.definir(DEFS.get("soDeNoite"));
    });
    corpo.appendChild(linha("Só de noite", "De dia o painel nunca esmorece, mesmo sem ninguém.", sw));
    return node;
  }

  // ───────── Sobre ─────────

  function sobre() {
    const { node, corpo } = grupo("Sobre");
    const estado = el('<span class="vl"></span>');
    const n = el('<span class="vl num"></span>');
    const l = (t, v) => linha(t, "", v);
    corpo.append(
      l("Ligação à casa", estado),
      l("Aparelhos", n),
      l("Ecrã", el(`<span class="vl">${esc(DEFS.ECRAS[ecra()])} · ${innerWidth} × ${innerHeight}</span>`)),
    );
    K.bind(node, (id) => id === "*", () => {
      estado.textContent = HA.count() ? "Ligada" : "À espera";
      n.textContent = fmt.n(HA.count());
    });

    const repor = el('<button class="pill">Repor definições</button>');
    repor.addEventListener("click", async () => {
      const ok = await K.folha({
        titulo: "Repor as definições?",
        texto: "O tamanho, as teclas rápidas e os tempos voltam aos de origem. A paleta fica como está.",
        confirmar: "Repor",
      });
      if (!ok) return;
      DEFS.repor();
      location.reload();
    });
    corpo.appendChild(linha("Repor definições", "Volta ao tamanho e aos tempos de origem. A paleta não muda.", repor));
    return node;
  }

  // ───────── Vista ─────────

  function definicoes() {
    const naMao = ecra() === "mao";
    const raiz = el(`<div class="${naMao ? "scroll " : ""}pad col grow definicoes"></div>`);
    raiz.appendChild(el(`<div class="head"><div><div class="t2">Definições</div>
      <div class="ft">Tudo o que é do painel, e não da casa.</div></div></div>`));

    const corpo = el('<div class="def-corpo"></div>');
    // o desvanecer de baixo só enquanto houver mais para ver
    const fim = () => corpo.classList.toggle("no-fim", corpo.scrollTop + corpo.clientHeight >= corpo.scrollHeight - 4);
    corpo.addEventListener("scroll", fim, { passive: true });
    new ResizeObserver(fim).observe(corpo);
    setTimeout(fim, 0);
    const esq = el('<div class="col"></div>');
    const dir = el('<div class="col"></div>');
    esq.append(tamanho(), aparencia());
    dir.append(ecraGrupo());
    if (ecra() === "braco") dir.appendChild(parede());
    dir.appendChild(sobre());
    corpo.append(esq, dir);
    raiz.appendChild(corpo);
    return raiz;
  }

  window.VIEWS.definicoes = definicoes;
})();
