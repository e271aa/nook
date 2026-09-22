/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — gráficos da Energia, sem bibliotecas.
 *
 *  Dois desenhos, ambos em SVG e dependentes só dos tokens do painel:
 *
 *    graficoSerie — linhas, áreas e barras sobre o tempo, com legenda ao passar
 *                   o rato ou o dedo, e zoom por seleção (arrasta sobre a zona
 *                   que queres ver; dois toques repõem)
 *    sankey       — de onde veio a energia e por onde se foi diluindo pela casa
 *
 *  Vivem no kit para poderem ser usados fora da Energia.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, fmt } = window.UI;
  const K = window.KIT;
  const SVG = "http://www.w3.org/2000/svg";
  const mk = (t, a) => {
    const n = document.createElementNS(SVG, t);
    Object.entries(a || {}).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };

  /** O degrau "redondo" mais próximo, para os eixos terem números que se leem. */
  function degrau(intervalo, n) {
    const bruto = intervalo / Math.max(1, n);
    const p = Math.pow(10, Math.floor(Math.log10(bruto || 1)));
    const f = bruto / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  // ───────── Série no tempo ─────────

  /**
   * @param container  onde desenhar (tem de ter altura)
   * @param opcoes {
   *   tempos: [ms],                  um por ponto
   *   series: [{ id, nome, cor, valores, tipo: "linha" | "area" | "barras" }],
   *   rotuloX: (ms) => string,       o que vai no eixo
   *   rotuloTip: (ms) => string,     o que vai no título da legenda
   *   unidade: "kWh"
   * }
   * Devolve { atualizar(novasOpcoes) }.
   */
  function graficoSerie(container, opcoes) {
    let o = opcoes;
    let janela = null; // [i0, i1] quando há zoom
    container.classList.add("gf");
    container.innerHTML = "";
    const svg = mk("svg", { class: "gf-svg" });
    const tip = el('<div class="gf-tip" hidden></div>');
    const repor = el('<button class="gf-repor" hidden>Repor zoom</button>');
    container.append(svg, tip, repor);

    const M = { e: 46, d: 10, c: 24, b: 24 }; // margens, em px (em cima cabe a unidade)
    let W = 0;
    let H = 0;
    let lay = null; // escalas da última desenhada

    const indices = () => (janela ? janela : [0, o.tempos.length - 1]);

    function desenha() {
      W = container.clientWidth;
      H = container.clientHeight;
      if (!W || !H || !o.tempos.length) {
        svg.innerHTML = "";
        return;
      }
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = "";
      const [i0, i1] = indices();
      const n = i1 - i0 + 1;
      const pw = W - M.e - M.d;
      const ph = H - M.c - M.b;

      // domínio de Y: inclui sempre o zero, e os negativos quando os há
      let vmin = 0;
      let vmax = 0;
      o.series.forEach((s) => {
        for (let i = i0; i <= i1; i++) {
          const v = s.valores[i] || 0;
          if (v > vmax) vmax = v;
          if (v < vmin) vmin = v;
        }
      });
      if (vmax === 0 && vmin === 0) vmax = 1;
      const passo = degrau(vmax - vmin, 4);
      vmax = Math.ceil(vmax / passo) * passo;
      vmin = Math.floor(vmin / passo) * passo;

      const bandas = o.series.some((s) => s.tipo === "barras");
      const xi = (i) => M.e + (bandas ? ((i - i0 + 0.5) / n) * pw : n === 1 ? pw / 2 : ((i - i0) / (n - 1)) * pw);
      const y = (v) => M.c + ph - ((v - vmin) / (vmax - vmin)) * ph;
      lay = { i0, i1, n, xi, y, pw, ph, bandas };

      // grelha e eixo Y
      for (let v = vmin; v <= vmax + passo / 2; v += passo) {
        svg.appendChild(mk("line", { class: "gf-grelha", x1: M.e, x2: W - M.d, y1: y(v), y2: y(v) }));
        const t = mk("text", { class: "gf-eixo", x: M.e - 6, y: y(v) + 4, "text-anchor": "end" });
        t.textContent = fmt.n(v, passo < 1 ? 1 : 0);
        svg.appendChild(t);
      }
      if (vmin < 0) svg.appendChild(mk("line", { class: "gf-zero", x1: M.e, x2: W - M.d, y1: y(0), y2: y(0) }));
      // a unidade do eixo, por cima dele: "40" sozinho não diz se é kWh ou W
      if (o.unidade) {
        const u = mk("text", { class: "gf-eixo gf-unidade", x: M.e - 6, y: M.c - 10, "text-anchor": "end" });
        u.textContent = o.unidade;
        svg.appendChild(u);
      }

      // eixo X: no máximo umas seis etiquetas, sem se pisarem
      const marcas = Math.min(n, Math.max(2, Math.floor(pw / 74)));
      for (let k = 0; k < marcas; k++) {
        const i = i0 + Math.round((k * (n - 1)) / Math.max(1, marcas - 1));
        const t = mk("text", { class: "gf-eixo", x: xi(i), y: H - 6, "text-anchor": k === 0 ? "start" : k === marcas - 1 ? "end" : "middle" });
        t.textContent = o.rotuloX(o.tempos[i]);
        svg.appendChild(t);
      }

      // as séries: as áreas primeiro, para as linhas ficarem por cima
      const ordem = [...o.series].sort((a, b) => (a.tipo === "area" ? -1 : 0) - (b.tipo === "area" ? -1 : 0));
      ordem.forEach((s) => {
        if (s.tipo === "barras") {
          const lb = Math.max(2, Math.min(28, (pw / n) * 0.62));
          for (let i = i0; i <= i1; i++) {
            const v = s.valores[i] || 0;
            if (!v) continue;
            svg.appendChild(mk("rect", {
              class: "gf-barra", x: xi(i) - lb / 2, width: lb, rx: 2,
              y: Math.min(y(v), y(0)), height: Math.max(1, Math.abs(y(v) - y(0))),
              style: `fill:var(--${s.cor})`,
            }));
          }
          return;
        }
        const pts = [];
        for (let i = i0; i <= i1; i++) pts.push([xi(i), y(s.valores[i] || 0)]);
        const d = pts.map((p, k) => `${k ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
        if (s.tipo === "area") {
          svg.appendChild(mk("path", {
            class: "gf-area", style: `fill:var(--${s.cor})`,
            d: `${d} L ${pts[pts.length - 1][0]} ${y(0)} L ${pts[0][0]} ${y(0)} Z`,
          }));
        }
        svg.appendChild(mk("path", { class: `gf-linha${s.tracejada ? " tracejada" : ""}`, d, style: `stroke:var(--${s.cor})` }));
      });

      // cursor, seleção
      lay.cursor = mk("line", { class: "gf-cursor", y1: M.c, y2: M.c + ph, hidden: "" });
      lay.sel = mk("rect", { class: "gf-sel", y: M.c, height: ph, hidden: "" });
      svg.append(lay.cursor, lay.sel);
      repor.hidden = !janela;
    }

    const indiceEm = (px) => {
      const r = svg.getBoundingClientRect();
      const x = px - r.left;
      const { i0, i1, n, pw, bandas } = lay;
      const f = (x - M.e) / pw;
      const i = bandas ? Math.floor(f * n) : Math.round(f * (n - 1));
      return Math.max(i0, Math.min(i1, i0 + i));
    };

    // legenda ao passar
    svg.addEventListener("pointermove", (e) => {
      if (!lay || arrastar) return;
      const i = indiceEm(e.clientX);
      lay.cursor.removeAttribute("hidden");
      lay.cursor.setAttribute("x1", lay.xi(i));
      lay.cursor.setAttribute("x2", lay.xi(i));
      tip.hidden = false;
      tip.innerHTML = `<div class="ft dim2">${esc(o.rotuloTip(o.tempos[i]))}</div>${o.series
        .map((s) => `<div class="gf-tip-linha"><i style="background:var(--${s.cor})"></i><span>${esc(s.nome)}</span><b class="num">${esc(fmt.n(s.valores[i] || 0, 2))} ${esc(o.unidade)}</b></div>`)
        .join("")}`;
      const r = container.getBoundingClientRect();
      const px = e.clientX - r.left;
      tip.style.left = `${px > r.width / 2 ? px - tip.offsetWidth - 12 : px + 12}px`;
      tip.style.top = "8px";
    });
    svg.addEventListener("pointerleave", () => {
      if (!lay || arrastar) return;
      lay.cursor.setAttribute("hidden", "");
      tip.hidden = true;
    });

    // zoom por seleção
    let arrastar = false;
    let x0 = 0;
    svg.addEventListener("pointerdown", (e) => {
      if (!lay || e.button > 0) return;
      arrastar = true;
      x0 = e.clientX - svg.getBoundingClientRect().left;
      tip.hidden = true;
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (!arrastar) return;
      const x = e.clientX - svg.getBoundingClientRect().left;
      const a = Math.max(M.e, Math.min(x0, x));
      const b = Math.min(W - M.d, Math.max(x0, x));
      lay.sel.removeAttribute("hidden");
      lay.sel.setAttribute("x", a);
      lay.sel.setAttribute("width", Math.max(0, b - a));
    });
    const larga = (e) => {
      if (!arrastar) return;
      arrastar = false;
      const r = svg.getBoundingClientRect();
      const x1 = e.clientX - r.left;
      lay.sel.setAttribute("hidden", "");
      if (Math.abs(x1 - x0) < 14) return; // foi um toque, não uma seleção
      const a = indiceEm(r.left + Math.min(x0, x1));
      const b = indiceEm(r.left + Math.max(x0, x1));
      if (b - a >= 2) {
        janela = [a, b];
        desenha();
      }
    };
    svg.addEventListener("pointerup", larga);
    svg.addEventListener("pointercancel", () => {
      arrastar = false;
      if (lay) lay.sel.setAttribute("hidden", "");
    });
    const reporZoom = () => {
      janela = null;
      desenha();
    };
    svg.addEventListener("dblclick", reporZoom);
    repor.addEventListener("click", reporZoom);

    new ResizeObserver(desenha).observe(container);
    setTimeout(desenha, 0); // não rAF: com o ecrã escondido não corre
    return {
      atualizar(novas) {
        o = novas;
        if (janela && janela[1] >= o.tempos.length) janela = null;
        desenha();
      },
    };
  }

  // ───────── Sankey ─────────

  /**
   * De onde veio e para onde foi. `fontes` e `destinos` são [{id, nome, valor, cor}],
   * com a mesma soma (a energia que entra é a que se gasta).
   */
  function sankey(container, fontes, destinos, unidade = "kWh") {
    container.classList.add("gf");

    const desenha = () => {
      const W = container.clientWidth;
      const H = container.clientHeight;
      container.innerHTML = "";
      if (!W || !H) return;
      const svg = mk("svg", { class: "gf-svg", viewBox: `0 0 ${W} ${H}` });
      container.appendChild(svg);

      const totF = fontes.reduce((t, f) => t + f.valor, 0);
      const totD = destinos.reduce((t, d) => t + d.valor, 0);
      if (!totF || !totD) return;

      const folga = 8;
      const L = Math.min(150, W * 0.24); // margem das etiquetas de cada lado
      const nx = 12; // largura de cada nó
      const x0 = L;
      const x1 = W - L - nx;
      const kF = (H - folga * (fontes.length - 1)) / totF;
      const kD = (H - folga * (destinos.length - 1)) / totD;

      // posição de cada nó
      let yc = 0;
      fontes.forEach((f) => {
        f.h = f.valor * kF;
        f.y = yc;
        f.cursor = f.y;
        yc += f.h + folga;
      });
      yc = 0;
      destinos.forEach((d) => {
        d.h = d.valor * kD;
        d.y = yc;
        d.cursor = d.y;
        yc += d.h + folga;
      });

      // gradientes: da cor da fonte à do destino — é assim que a energia "se dilui"
      const defs = mk("defs");
      svg.appendChild(defs);
      let g = 0;
      const fitas = [];
      fontes.forEach((f) => {
        destinos.forEach((d) => {
          const v = (f.valor * d.valor) / totD; // a fatia da fonte que vai para este destino
          const hl = v * kF;
          const hr = v * kD;
          const id = `sk-${Math.random().toString(36).slice(2, 8)}-${g++}`;
          const lg = mk("linearGradient", { id, x1: "0", x2: "1", y1: "0", y2: "0" });
          lg.appendChild(mk("stop", { offset: "0", style: `stop-color:var(--${f.cor});stop-opacity:.7` }));
          lg.appendChild(mk("stop", { offset: "1", style: `stop-color:var(--${d.cor});stop-opacity:.32` }));
          defs.appendChild(lg);
          const ya = f.cursor;
          const yb = d.cursor;
          f.cursor += hl;
          d.cursor += hr;
          const xa = x0 + nx;
          const xb = x1;
          const mx = (xa + xb) / 2;
          const path = mk("path", {
            class: "sk-fita", fill: `url(#${id})`,
            d: `M ${xa} ${ya} C ${mx} ${ya}, ${mx} ${yb}, ${xb} ${yb} L ${xb} ${yb + hr} C ${mx} ${yb + hr}, ${mx} ${ya + hl}, ${xa} ${ya + hl} Z`,
          });
          const t = mk("title");
          t.textContent = `${f.nome} → ${d.nome}: ${fmt.n(v, 2)} ${unidade}`;
          path.appendChild(t);
          fitas.push(path);
        });
      });
      fitas.forEach((p) => svg.appendChild(p));

      // nós e etiquetas
      const no = (n, x, lado) => {
        svg.appendChild(mk("rect", { class: "sk-no", x, y: n.y, width: nx, height: Math.max(3, n.h), rx: 3, style: `fill:var(--${n.cor})` }));
        if (n.h < 14) return; // sem altura para etiqueta: fica só o nó e a dica
        const ty = n.y + n.h / 2;
        const nome = mk("text", { class: "sk-nome", x: lado === "e" ? x - 8 : x + nx + 8, y: ty - 1, "text-anchor": lado === "e" ? "end" : "start" });
        nome.textContent = n.nome;
        const val = mk("text", { class: "sk-valor", x: lado === "e" ? x - 8 : x + nx + 8, y: ty + 13, "text-anchor": lado === "e" ? "end" : "start" });
        val.textContent = `${fmt.n(n.valor, n.valor < 10 ? 1 : 0)} ${unidade}`;
        svg.append(nome, val);
      };
      fontes.forEach((f) => no(f, x0, "e"));
      destinos.forEach((d) => no(d, x1, "d"));
    };

    new ResizeObserver(desenha).observe(container);
    setTimeout(desenha, 0);
    return { atualizar(f, d) { fontes = f; destinos = d; desenha(); } };
  }

  K.graficoSerie = graficoSerie;
  K.sankey = sankey;
})();
