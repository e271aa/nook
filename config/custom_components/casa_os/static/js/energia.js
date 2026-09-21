/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — Energia.
 *
 *  Há duas energias. A de agora — o que a casa gasta, o que vem do sol —
 *  é estado e já vive na Casa, numa linha. Esta secção é a outra: o fluxo
 *  de agora em cima, e por baixo o relatório de um período, com o gráfico,
 *  os sete circuitos e o custo. O relatório cabe no ecrã; não rola.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { CFG, bind, entre, ecra } = K;

  const E = CFG.energy || {};
  const P = E.power || {};
  const T = E.totals || {};

  const PERIODOS = [
    { id: "hoje", nome: "Hoje", titulo: "Hoje, hora a hora", passo: "hour", dias: 0 },
    { id: "7d", nome: "7 dias", titulo: "Últimos 7 dias", passo: "day", dias: 7 },
    { id: "30d", nome: "30 dias", titulo: "Últimos 30 dias", passo: "day", dias: 30 },
  ];

  const REFRESCO = 5 * 60 * 1000;
  const DIA = 86400000;
  const watts = (id) => (id ? HA.num(id) : null);

  const potencia = (v) => (v === null || v === undefined ? "—" : Math.abs(v) >= 1000 ? `${fmt.n(v / 1000, 2)} kW` : `${fmt.n(v)} W`);

  /** A frase que resume o momento: o que se lê primeiro. */
  function frase() {
    const s = watts(P.solar) || 0;
    const g = watts(P.grid) || 0;
    const b = watts(P.battery) || 0;
    const partes = [];
    if (s > 20 && g <= 20) {
      partes.push("O sol paga a casa");
      if (b > 20) partes.push("e ainda carrega a bateria");
      else if (g < -20) partes.push("e o que sobra vai para a rede");
    } else if (b < -20 && g <= 20) partes.push("A bateria está a alimentar a casa");
    else if (g > 20) partes.push(`A casa está a comprar ${potencia(g)} à rede`);
    else partes.push("A casa está em repouso");
    let f = partes.join(" ") + ".";
    if (Math.abs(g) <= 20 && g >= -20) f += " Nada vem da rede neste momento.";
    return f;
  }

  // ───────── O período ─────────

  const pad = (n) => String(n).padStart(2, "0");
  const chaveDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dodia = (chave) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(chave || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const curto = (d) => d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" }).replace(".", "");

  /** Um intervalo escolhido à mão: de um dia a outro, inclusive. */
  function periodoEscolhido(a, b) {
    const inicio = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const fim = new Date(b.getFullYear(), b.getMonth(), b.getDate(), 23, 59, 59, 999);
    const dias = Math.round((fim - inicio) / DIA);
    const mesmo = chaveDia(inicio) === chaveDia(fim);
    return {
      id: "de", inicio, fim,
      nome: mesmo ? curto(inicio) : `${curto(inicio)} – ${curto(fim)}`,
      titulo: mesmo ? `${curto(inicio)}, hora a hora` : `De ${curto(inicio)} a ${curto(fim)}`,
      // até dois dias vê-se hora a hora; depois dia a dia; muito longo, mês a mês
      passo: dias <= 2 ? "hour" : dias <= 120 ? "day" : "month",
    };
  }

  /** O que a rota diz: um período fixo, um intervalo, ou o fluxo de agora. */
  function periodoDe(args) {
    const a = args && args[0];
    const fixo = PERIODOS.find((p) => p.id === a);
    if (fixo) return fixo;
    if (a === "de") {
      const ini = dodia(args[1]);
      const fim = dodia(args[2]);
      if (ini && fim && ini <= fim) return periodoEscolhido(ini, fim);
    }
    return null;
  }

  // ───────── O calendário ─────────

  /**
   * Escolher um intervalo: toca no primeiro dia e no último. Atalhos para o que
   * se escolhe mais vezes. Só se pode escolher até hoje — a energia de amanhã
   * ainda não existe.
   */
  function calendario(atual, aoEscolher, aoFechar) {
    const hoje = new Date();
    const dia0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    let mes = new Date((atual ? atual.inicio : hoje).getFullYear(), (atual ? atual.inicio : hoje).getMonth(), 1);
    let a = atual ? new Date(atual.inicio.getFullYear(), atual.inicio.getMonth(), atual.inicio.getDate()) : null;
    let b = atual ? new Date(atual.fim.getFullYear(), atual.fim.getMonth(), atual.fim.getDate()) : null;

    const scrim = el('<div class="scrim"></div>');
    const caixa = el(`<div class="cal" role="dialog" aria-label="Escolher o período">
      <div class="sb"><span class="hd">Escolher o período</span>
        <button class="iconbtn" aria-label="Fechar">${icon("plus", "ic-s")}</button></div>
      <div class="cal-atalhos"></div>
      <div class="sb cal-mes"><button class="iconbtn" data-m="-1" aria-label="Mês anterior">${icon("back", "ic-s")}</button>
        <span class="t3 cal-titulo"></span>
        <button class="iconbtn" data-m="1" aria-label="Mês seguinte">${icon("chev", "ic-s")}</button></div>
      <div class="cal-semana"></div>
      <div class="cal-grelha"></div>
      <div class="sb cal-rodape"><span class="ft cal-resumo"></span>
        <button class="pill on cal-aplicar" disabled>Aplicar</button></div>
    </div>`);
    caixa.querySelector(".iconbtn .ic").style.transform = "rotate(45deg)"; // o "+" roda e vira "×"

    ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].forEach((d) => caixa.querySelector(".cal-semana").appendChild(el(`<span class="cap">${d}</span>`)));

    const igual = (x, y) => x && y && chaveDia(x) === chaveDia(y);
    const desenha = () => {
      caixa.querySelector(".cal-titulo").textContent = mes.toLocaleDateString("pt-PT", { month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase());
      const g = caixa.querySelector(".cal-grelha");
      g.innerHTML = "";
      const primeiro = (mes.getDay() + 6) % 7; // a semana começa à segunda
      const dias = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
      for (let i = 0; i < primeiro; i++) g.appendChild(el("<span></span>"));
      for (let n = 1; n <= dias; n++) {
        const d = new Date(mes.getFullYear(), mes.getMonth(), n);
        const fora = d > dia0;
        const dentro = a && b && d >= a && d <= b;
        const btn = el(`<button class="cal-dia${dentro ? " dentro" : ""}${igual(d, a) || igual(d, b) ? " ponta" : ""}${igual(d, dia0) ? " hoje" : ""}"${fora ? " disabled" : ""}>${n}</button>`);
        btn.addEventListener("click", () => {
          // o primeiro toque abre o intervalo; o segundo fecha-o (na ordem certa)
          if (!a || (a && b)) {
            a = d;
            b = null;
          } else if (d < a) {
            b = a;
            a = d;
          } else b = d;
          desenha();
        });
        g.appendChild(btn);
      }
      const ok = !!(a && b);
      caixa.querySelector(".cal-aplicar").disabled = !ok;
      caixa.querySelector(".cal-resumo").textContent = ok
        ? igual(a, b) ? curto(a) : `${curto(a)} – ${curto(b)}`
        : a ? `${curto(a)} – toca no último dia` : "Toca no primeiro dia";
    };

    const atalhos = [
      ["Ontem", () => [new Date(dia0.getTime() - DIA), new Date(dia0.getTime() - DIA)]],
      ["Este mês", () => [new Date(dia0.getFullYear(), dia0.getMonth(), 1), dia0]],
      ["Mês passado", () => [new Date(dia0.getFullYear(), dia0.getMonth() - 1, 1), new Date(dia0.getFullYear(), dia0.getMonth(), 0)]],
      ["90 dias", () => [new Date(dia0.getTime() - 89 * DIA), dia0]],
    ];
    atalhos.forEach(([nome, faz]) => {
      const t = el(`<button class="pill">${nome}</button>`);
      t.addEventListener("click", () => {
        [a, b] = faz();
        mes = new Date(b.getFullYear(), b.getMonth(), 1);
        desenha();
      });
      caixa.querySelector(".cal-atalhos").appendChild(t);
    });
    caixa.querySelectorAll("[data-m]").forEach((m) =>
      m.addEventListener("click", () => {
        mes = new Date(mes.getFullYear(), mes.getMonth() + Number(m.dataset.m), 1);
        desenha();
      }),
    );

    const fecha = () => {
      scrim.remove();
      caixa.remove();
      document.removeEventListener("keydown", tecla);
      aoFechar();
    };
    const tecla = (e) => e.key === "Escape" && fecha();
    caixa.querySelector(".sb .iconbtn").addEventListener("click", fecha);
    scrim.addEventListener("click", fecha);
    caixa.querySelector(".cal-aplicar").addEventListener("click", () => {
      scrim.remove();
      caixa.remove();
      document.removeEventListener("keydown", tecla);
      aoEscolher(a, b);
    });
    document.addEventListener("keydown", tecla);
    document.body.append(scrim, caixa);
    desenha();
  }

  // ───────── O relatório ─────────

  const soma = (linhas) => (linhas || []).reduce((t, r) => t + Math.max(0, r.change || 0), 0);

  async function ler(periodo) {
    const ids = [T.home, T.solar, T.import, T.export, T.charge, T.discharge, ...(E.circuits || []).map((c) => c.entity)].filter(Boolean);
    let inicio;
    let fim = null;
    if (periodo.id === "de") {
      inicio = periodo.inicio;
      fim = periodo.fim;
    } else {
      inicio = new Date();
      if (periodo.dias === 0) inicio.setHours(0, 0, 0, 0);
      else inicio.setDate(inicio.getDate() - periodo.dias);
    }
    return HA.statistics(ids, inicio, fim, periodo.passo);
  }

  /** Um valor por instante, alinhado pelo tempo — as séries nem sempre têm os mesmos furos. */
  function alinhar(stats) {
    const mapa = (id) => new Map((stats[id] || []).map((r) => [new Date(r.start).getTime(), Math.max(0, r.change || 0)]));
    const ms = { casa: mapa(T.home), sol: mapa(T.solar), imp: mapa(T.import), exp: mapa(T.export), car: mapa(T.charge), des: mapa(T.discharge) };
    const tempos = [...new Set([...ms.casa.keys(), ...ms.sol.keys(), ...ms.imp.keys()])].sort((x, y) => x - y);
    const v = (m) => tempos.map((t) => m.get(t) || 0);
    return { tempos, casa: v(ms.casa), sol: v(ms.sol), imp: v(ms.imp), exp: v(ms.exp), car: v(ms.car), des: v(ms.des) };
  }

  const rotuloX = (periodo) => (ms) => {
    const d = new Date(ms);
    return periodo.passo === "hour" ? `${pad(d.getHours())}h` : periodo.passo === "month" ? d.toLocaleDateString("pt-PT", { month: "short", year: "2-digit" }).replace(".", "") : `${d.getDate()}/${d.getMonth() + 1}`;
  };
  const rotuloTip = (periodo) => (ms) => {
    const d = new Date(ms);
    return periodo.passo === "hour"
      ? `${curto(d)}, ${pad(d.getHours())}:00`
      : periodo.passo === "month" ? d.toLocaleDateString("pt-PT", { month: "long", year: "numeric" }) : d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });
  };

  const cartaoGrafico = (titulo, legenda) => {
    const c = el(`<div class="chart"><div class="sb"><span class="cap">${esc(titulo)}</span>
      <div class="lg">${legenda.map(([cor, nome]) => `<span><i style="background:var(--${cor})"></i>${esc(nome)}</span>`).join("")}</div></div>
      <div class="gf-caixa"></div></div>`);
    return c;
  };

  function circuitosCard(stats) {
    const tarifa = E.tariff || 0;
    const lista = (E.circuits || [])
      .map((c) => ({ ...c, v: soma(stats[c.entity]) }))
      .filter((c) => c.v > 0.005)
      .sort((a, b) => b.v - a.v);
    const max = Math.max(0.01, ...lista.map((c) => c.v));

    const node = el('<div class="card circuitos"><span class="cap">Por circuito</span></div>');
    if (!lista.length) {
      node.appendChild(el('<div class="empty-mini">Ainda não há consumo registado neste período.</div>'));
      return node;
    }
    lista.forEach((c) => {
      node.appendChild(el(`<div class="col circ">
        <div class="sb"><span class="ft" style="color:var(--label)">${esc(c.name)}</span>
          <span class="ft num">${esc(fmt.energy(c.v))} · ${esc(fmt.money(c.v * tarifa))}</span></div>
        <div class="meter"><i style="width:${(c.v / max) * 100}%"></i></div></div>`));
    });
    return node;
  }

  function totais(stats) {
    const tarifa = E.tariff || 0;
    const venda = E.feed_in || 0;
    const imp = soma(stats[T.import]);
    const exp = soma(stats[T.export]);
    const itens = [
      ["Solar produzida", fmt.energy(soma(stats[T.solar]))],
      ["A casa consumiu", fmt.energy(soma(stats[T.home]))],
      ["Importado da rede", fmt.energy(imp)],
      ["Custo", fmt.money(imp * tarifa)],
      ["Exportado", fmt.energy(exp)],
      ["Recebido", fmt.money(exp * venda)],
    ];
    return itens.map(([k, v]) => `<div class="stat"><div class="v num">${esc(v)}</div><div class="k">${esc(k)}</div></div>`).join("");
  }

  const PALETA = ["tint", "batt", "solar", "grid", "warn", "good", "danger"];

  /** De onde veio a energia e por onde se foi diluindo pela casa. */
  function fluxoDoPeriodo(stats) {
    const casa = soma(stats[T.home]);
    const imp = soma(stats[T.import]);
    const sol = soma(stats[T.solar]);
    const exp = soma(stats[T.export]);
    const car = soma(stats[T.charge]);
    const des = soma(stats[T.discharge]);

    const fontes = [
      { id: "rede", nome: "Rede", cor: "grid", valor: imp },
      { id: "solar", nome: "Solar", cor: "solar", valor: Math.max(0, sol - exp - car) }, // o que o sol deu à casa, não à rede nem à bateria
      { id: "bateria", nome: "Bateria", cor: "batt", valor: des },
    ].filter((f) => f.valor > 0.01);

    const circ = (E.circuits || [])
      .map((c, i) => ({ id: c.entity, nome: c.name, cor: PALETA[i % PALETA.length], valor: soma(stats[c.entity]) }))
      .filter((c) => c.valor > 0.01)
      .sort((a, b) => b.valor - a.valor);
    const medido = circ.reduce((t, c) => t + c.valor, 0);
    const resto = casa - medido;
    if (resto > Math.max(0.1, casa * 0.02)) circ.push({ id: "resto", nome: "Não monitorizado", cor: "label-3", valor: resto });

    // o que entra é o que se gasta: as fontes ajustam-se ao consumo (as contas de
    // cada fonte nunca fecham ao watt, e o desenho tem de fechar)
    const totD = circ.reduce((t, c) => t + c.valor, 0);
    const totF = fontes.reduce((t, f) => t + f.valor, 0);
    if (totF > 0) fontes.forEach((f) => (f.valor = (f.valor * totD) / totF));
    return { fontes, destinos: circ };
  }

  // ───────── Vista ─────────

  // "Agora" é o fluxo instantâneo; os outros são o histórico; "Escolher…" é um intervalo à mão
  const MODOS_FIXOS = [{ id: "agora", nome: "Agora" }, ...PERIODOS];

  function energia(args) {
    const periodo = periodoDe(args);
    return periodo ? relatorio(periodo) : agora();
  }

  function cabecalho(ativo) {
    const naMao = ecra() === "mao";
    const sub = el('<div class="ft"></div>');
    const head = el('<div class="head"><div><div class="t2">Energia</div></div></div>');
    head.firstElementChild.appendChild(sub);
    bind(sub, entre([P.home, P.solar, P.grid, P.battery]), () => (sub.textContent = frase()));

    const escolhido = ativo && ativo.id === "de" ? ativo : null;
    const nomes = [...MODOS_FIXOS.map((m) => m.nome), escolhido ? escolhido.nome : "Escolher…"];
    const indice = ativo ? (escolhido ? nomes.length - 1 : MODOS_FIXOS.findIndex((m) => m.id === ativo.id)) : 0;
    let seg;
    seg = K.segmentado(nomes, indice, (i) => {
      if (i < MODOS_FIXOS.length) {
        location.hash = i === 0 ? "#/energia" : `#/energia/${MODOS_FIXOS[i].id}`;
        return;
      }
      // "Escolher…" abre o calendário; se se desistir, o segmentado volta ao que estava
      calendario(
        escolhido,
        (a, b) => (location.hash = `#/energia/de/${chaveDia(a)}/${chaveDia(b)}`),
        () => seg.definir(indice),
      );
    }, { cheio: naMao });
    return { head, seg };
  }

  function agora() {
    const naMao = ecra() === "mao";
    const raiz = el(`<div class="${naMao ? "scroll " : ""}pad col grow energia"></div>`);
    const { head, seg } = cabecalho(null);
    if (!naMao) head.appendChild(seg);
    raiz.appendChild(head);
    if (naMao) raiz.appendChild(seg);
    raiz.appendChild(K.fluxoAgora());
    return raiz;
  }

  let paginaAtual = 0; // o relatório tem duas páginas: lembra-se de qual se estava a ver

  function relatorio(periodo) {
    const naMao = ecra() === "mao";
    const raiz = el(`<div class="${naMao ? "scroll " : ""}pad col grow energia"></div>`);
    const { head, seg } = cabecalho(periodo);
    if (!naMao) head.appendChild(seg);
    raiz.appendChild(head);
    if (naMao) raiz.appendChild(seg);

    // ── página 1: consumo contra produção, e por onde foi ──
    const principal = cartaoGrafico(
      `${periodo.titulo}`,
      [["tint", "Casa"], ["solar", "Solar"], ["grid", "Rede"]],
    );
    principal.style.flex = "1.5";
    let circuitos = el('<div class="card circuitos"><span class="cap">Por circuito</span></div>');
    circuitos.style.flex = "1";
    const pag1 = el('<div class="row meio pagina"></div>');
    pag1.append(principal, circuitos);

    // ── página 2: o fluxo, o sol e a bateria ──
    const fluxo = cartaoGrafico("Fluxo de energia", [["grid", "Rede"], ["solar", "Solar"], ["batt", "Bateria"]]);
    fluxo.style.flex = "1.7";
    const solar = cartaoGrafico("Produção solar", [["solar", "Solar"]]);
    const bateria = cartaoGrafico("Fluxo da bateria", [["batt", "Carga"], ["tint", "Descarga"]]);
    const dir = el('<div class="col"></div>');
    dir.style.flex = "1";
    dir.append(solar, bateria);
    const pag2 = el('<div class="row meio pagina"></div>');
    pag2.append(fluxo, dir);

    const strip = el('<div class="strip totais"></div>');

    // no telemóvel as duas páginas são duas secções seguidas; na parede, uma de cada vez
    const graficos = {};
    const dadosG = {};
    const pontos = el('<div class="dots" role="tablist"></div>');
    const anterior = el(`<button class="iconbtn" aria-label="Página anterior">${icon("back", "ic-s")}</button>`);
    const seguinte = el(`<button class="iconbtn" aria-label="Página seguinte">${icon("chev", "ic-s")}</button>`);
    const mostra = (i) => {
      i = Math.max(0, Math.min(1, i));
      paginaAtual = i;
      pag1.hidden = i !== 0;
      pag2.hidden = i !== 1;
      anterior.disabled = i === 0;
      seguinte.disabled = i === 1;
      [...pontos.children].forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
      // um gráfico desenhado às escuras não tem tamanho: desenha-se de novo quando aparece
      setTimeout(() => {
        for (const k in graficos) {
          const d = dadosG[k];
          if (d) d.length === 2 ? graficos[k].atualizar(d[0], d[1]) : graficos[k].atualizar(d[0]);
        }
      }, 0);
    };
    ["Consumo e produção", "Fluxo de energia"].forEach((nome, i) => {
      const b = el(`<button role="tab" aria-label="${esc(nome)}"></button>`);
      b.addEventListener("click", () => mostra(i));
      pontos.appendChild(b);
    });
    anterior.addEventListener("click", () => mostra(paginaAtual - 1));
    seguinte.addEventListener("click", () => mostra(paginaAtual + 1));
    const nav = el('<div class="row pag-nav"></div>');
    nav.append(anterior, pontos, seguinte);
    if (naMao) raiz.append(pag1, pag2, strip);
    else {
      raiz.append(pag1, pag2, nav, strip);
      mostra(paginaAtual);
      // no toque, deslizar muda de página (só na horizontal, e não sobre o gráfico que faz zoom)
      let x0 = null, y0 = 0;
      raiz.addEventListener("touchstart", (e) => {
        x0 = e.target.closest(".gf-svg") ? null : e.touches[0].clientX;
        y0 = e.touches[0].clientY;
      }, { passive: true });
      raiz.addEventListener("touchend", (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(e.changedTouches[0].clientY - y0)) mostra(paginaAtual + (dx < 0 ? 1 : -1));
        x0 = null;
      }, { passive: true });
    }

    const carrega = async () => {
      try {
        const stats = await ler(periodo);
        const al = alinhar(stats);
        const base = { tempos: al.tempos, rotuloX: rotuloX(periodo), rotuloTip: rotuloTip(periodo), unidade: "kWh" };

        const dadosPrincipal = {
          ...base,
          series: [
            { id: "casa", nome: "Casa", cor: "tint", valores: al.casa, tipo: "linha" },
            { id: "sol", nome: "Solar", cor: "solar", valores: al.sol, tipo: "area" },
            { id: "imp", nome: "Rede", cor: "grid", valores: al.imp, tipo: "linha", tracejada: true },
          ],
        };
        const dadosSolar = { ...base, series: [{ id: "sol", nome: "Solar", cor: "solar", valores: al.sol, tipo: "area" }] };
        const dadosBat = {
          ...base,
          series: [
            { id: "car", nome: "Carga", cor: "batt", valores: al.car, tipo: "barras" },
            { id: "des", nome: "Descarga", cor: "tint", valores: al.des.map((v) => -v), tipo: "barras" },
          ],
        };
        const poe = (chave, cartao, dados) => {
          const caixa = cartao.querySelector(".gf-caixa");
          dadosG[chave] = [dados];
          if (graficos[chave]) graficos[chave].atualizar(dados);
          else graficos[chave] = K.graficoSerie(caixa, dados);
        };
        poe("principal", principal, dadosPrincipal);
        poe("solar", solar, dadosSolar);
        poe("bateria", bateria, dadosBat);

        const { fontes, destinos } = fluxoDoPeriodo(stats);
        const caixaFluxo = fluxo.querySelector(".gf-caixa");
        if (!fontes.length || !destinos.length) {
          caixaFluxo.innerHTML = '<div class="empty-mini">Sem consumo registado neste período.</div>';
        } else {
          dadosG.fluxo = [fontes, destinos];
          if (graficos.fluxo) graficos.fluxo.atualizar(fontes, destinos);
          else graficos.fluxo = K.sankey(caixaFluxo, fontes, destinos);
        }

        const novo = circuitosCard(stats);
        novo.style.flex = "1";
        circuitos.replaceWith(novo);
        circuitos = novo;
        strip.innerHTML = totais(stats);
      } catch (e) {
        principal.querySelector(".gf-caixa").innerHTML = '<div class="empty-mini" style="color:var(--warn)">Não foi possível ler o histórico.</div>';
        console.error("Casa OS: estatísticas", e);
      }
    };
    K.intervalo(carrega, REFRESCO);
    return raiz;
  }

  window.VIEWS.energia = energia;
})();
