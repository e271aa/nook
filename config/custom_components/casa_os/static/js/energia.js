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
  const watts = (id) => (id ? HA.num(id) : null);

  const potencia = (v) => (v === null || v === undefined ? "—" : Math.abs(v) >= 1000 ? `${fmt.n(v / 1000, 2)} kW` : `${fmt.n(v)} W`);

  // ───────── O fluxo de agora ─────────

  function fluxo() {
    const node = el(`<div class="flow">
      <div class="node sol"><span class="rg">${icon("solar")}</span><span class="nv num"></span><span class="nk">Solar</span></div>
      <span class="wire s"><i></i></span>
      <div class="node hs"><span class="rg">${icon("house-power")}</span><span class="nv num"></span><span class="nk">Casa</span></div>
      <span class="wire b"><i></i></span>
      <div class="node bt"><span class="rg">${icon("battery")}</span><span class="nv num"></span><span class="nk"></span></div>
      <span class="wire g"><i></i></span>
      <div class="node gr"><span class="rg">${icon("grid")}</span><span class="nv num"></span><span class="nk"></span></div>
    </div>`);
    const [sol, casa, bat, rede] = node.querySelectorAll(".node");
    const [fio1, fio2, fio3] = node.querySelectorAll(".wire");

    return bind(node, entre([P.home, P.solar, P.grid, P.battery, E.battery_soc]), () => {
      const s = watts(P.solar) || 0;
      const h = watts(P.home) || 0;
      const g = watts(P.grid) || 0;
      const b = watts(P.battery) || 0;
      const soc = watts(E.battery_soc);

      sol.querySelector(".nv").textContent = potencia(s);
      sol.classList.toggle("off", s < 20);
      casa.querySelector(".nv").textContent = potencia(h);
      bat.querySelector(".nv").textContent = soc === null ? "—" : `${fmt.n(soc)} %`;
      bat.querySelector(".nk").textContent = b > 20 ? "Bateria · a carregar" : b < -20 ? "Bateria · a dar à casa" : "Bateria";
      bat.classList.toggle("off", Math.abs(b) < 20);
      rede.querySelector(".nv").textContent = potencia(Math.abs(g));
      rede.querySelector(".nk").textContent = g > 20 ? "Rede · a comprar" : g < -20 ? "Rede · a vender" : "Rede";
      rede.classList.toggle("off", Math.abs(g) < 20);

      fio1.classList.toggle("d", s < 20); // o sol alimenta a casa
      fio2.classList.toggle("d", Math.abs(b) < 20); // a casa e a bateria trocam
      fio3.classList.toggle("d", Math.abs(g) < 20); // a bateria e a rede
    });
  }

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

  // ───────── O relatório ─────────

  const soma = (linhas) => (linhas || []).reduce((t, r) => t + Math.max(0, r.change || 0), 0);

  async function ler(periodo) {
    const ids = [T.home, T.solar, T.import, T.export, T.discharge, ...(E.circuits || []).map((c) => c.entity)].filter(Boolean);
    const inicio = new Date();
    if (periodo.dias === 0) inicio.setHours(0, 0, 0, 0);
    else inicio.setDate(inicio.getDate() - periodo.dias);
    return HA.statistics(ids, inicio, null, periodo.passo);
  }

  function graficoCard(periodo) {
    const node = el(`<div class="chart">
      <div class="sb"><span class="cap">${esc(periodo.titulo)}</span>
        <div class="lg"><span><i style="background:var(--solar)"></i>Solar</span>
        <span><i style="background:var(--grid);opacity:.55"></i>Rede</span>
        <span><i style="background:var(--batt)"></i>Bateria</span></div></div>
      <div class="bars loading">${'<div><b class="im"></b></div>'.repeat(14)}</div>
      <div class="sb eixo"></div></div>`);
    return node;
  }

  function pintaGrafico(node, stats, periodo) {
    const linhas = stats[T.home] || stats[T.solar] || [];
    const nome = (r) => {
      const d = new Date(r.start);
      return periodo.passo === "hour" ? `${String(d.getHours()).padStart(2, "0")}h` : `${d.getDate()}/${d.getMonth() + 1}`;
    };
    const imp = (stats[T.import] || []).map((r) => Math.max(0, r.change || 0));
    const sol = (stats[T.solar] || []).map((r) => Math.max(0, r.change || 0));
    const bat = (stats[T.discharge] || []).map((r) => Math.max(0, r.change || 0));
    const max = Math.max(0.01, ...linhas.map((_, i) => (imp[i] || 0) + (sol[i] || 0) + (bat[i] || 0)));

    const barras = node.querySelector(".bars");
    barras.classList.remove("loading");
    barras.innerHTML = linhas
      .map((r, i) => {
        const seg = (v, cls) => (v > 0 ? `<b class="${cls}" style="height:${(v / max) * 100}%"></b>` : "");
        const total = (imp[i] || 0) + (sol[i] || 0) + (bat[i] || 0);
        return `<div title="${esc(nome(r))}: ${esc(fmt.energy(total, 2))}">${seg(imp[i], "im")}${seg(sol[i], "so")}${seg(bat[i], "bt")}</div>`;
      })
      .join("");

    // com uma ou duas colunas não se repete a mesma etiqueta três vezes
    const rotulos = linhas.length
      ? [...new Set([nome(linhas[0]), nome(linhas[Math.floor(linhas.length / 2)]), nome(linhas[linhas.length - 1])])]
      : [];
    node.querySelector(".eixo").innerHTML = rotulos.map((l) => `<span class="ft dim2">${esc(l)}</span>`).join("");
  }

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
    return itens
      .map(([k, v]) => `<div class="stat"><div class="v num">${esc(v)}</div><div class="k">${esc(k)}</div></div>`)
      .join("");
  }

  // ───────── Vista ─────────

  function energia(args) {
    const periodo = PERIODOS.find((p) => p.id === (args && args[0])) || PERIODOS[2];
    const naMao = ecra() === "mao";

    const raiz = el(`<div class="${naMao ? "scroll " : ""}pad col grow energia"></div>`);

    const sub = el('<div class="ft"></div>');
    const head = el('<div class="head"><div><div class="t2">Energia</div></div></div>');
    head.firstElementChild.appendChild(sub);
    bind(sub, entre([P.home, P.solar, P.grid, P.battery]), () => (sub.textContent = frase()));

    const seg = K.segmentado(PERIODOS.map((p) => p.nome), PERIODOS.indexOf(periodo), (i) => {
      location.hash = `#/energia/${PERIODOS[i].id}`;
    }, { cheio: naMao });
    if (!naMao) head.appendChild(seg);
    raiz.appendChild(head);
    if (naMao) raiz.appendChild(seg);

    raiz.appendChild(fluxo());

    const grafico = graficoCard(periodo);
    let circuitos = el('<div class="card circuitos"><span class="cap">Por circuito</span></div>');
    const strip = el('<div class="strip totais"></div>');

    const meio = el('<div class="row meio"></div>');
    grafico.style.flex = "1.5";
    circuitos.style.flex = "1";
    meio.append(grafico, circuitos);
    raiz.append(meio, strip);

    const carrega = async () => {
      try {
        const stats = await ler(periodo);
        pintaGrafico(grafico, stats, periodo);
        const novo = circuitosCard(stats);
        novo.style.flex = "1";
        circuitos.replaceWith(novo);
        circuitos = novo; // é o que se troca da próxima vez
        strip.innerHTML = totais(stats);
      } catch (e) {
        grafico.querySelector(".bars").classList.remove("loading");
        grafico.querySelector(".bars").innerHTML = "";
        grafico.querySelector(".eixo").innerHTML = '<span class="ft" style="color:var(--warn)">Não foi possível ler o histórico.</span>';
        console.error("Casa OS: estatísticas", e);
      }
    };
    K.intervalo(carrega, REFRESCO);
    return raiz;
  }

  window.VIEWS.energia = energia;
})();
