/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — Energia, agora.
 *
 *  O fluxo instantâneo, que vinha do Nook: de onde vem a energia neste
 *  segundo (sol, rede, bateria), quanto a casa gasta, e para onde vai (cada
 *  circuito). As linhas engrossam com os watts e têm partículas a correr no
 *  sentido em que a energia anda — mais depressa quanto mais passa.
 *
 *  As partículas só se refazem quando o fluxo muda de sentido ou de escalão;
 *  refazê-las a cada segundo punha-as a saltar do princípio da linha.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { CFG, bind, entre, ecra } = K;

  const E = CFG.energy || {};
  const P = E.power || {};
  const SVG = "http://www.w3.org/2000/svg";
  const PARADO = 20; // abaixo disto, em watts, não passa nada que valha desenhar

  const w = (id) => (id ? HA.num(id) : null);
  const potencia = (v) =>
    v === null || v === undefined ? "—" : Math.abs(v) >= 1000 ? `${fmt.n(v / 1000, 2)} kW` : `${fmt.n(Math.round(v))} W`;
  const semMovimento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** Escalão de um fluxo: é o que decide a espessura e a pressa das partículas. */
  const escalao = (v) => (v < PARADO ? 0 : v < 300 ? 1 : v < 1200 ? 2 : v < 3000 ? 3 : 4);

  // ───────── Nós ─────────

  function noFonte(tipo, nome, ic) {
    return el(`<div class="fonte ${tipo}" data-no="${tipo}">
      <span class="badge">${icon(ic)}</span>
      <div class="txt"><div class="v num"></div><div class="k">${esc(nome)}</div><div class="s"></div></div>
    </div>`);
  }

  function noCasa() {
    return el(`<div class="nocasa" data-no="casa">
      <span class="badge">${icon("house-power", "ic-l")}</span>
      <div class="v num"></div>
      <div class="k">A casa gasta agora</div>
    </div>`);
  }

  function linhaCircuito(c) {
    return el(`<div class="circ-agora" data-no="c:${esc(c.potencia)}">
      <span class="ig">${icon(K.ico(c.icon))}</span>
      <div class="grow">
        <div class="sb"><span class="nm">${esc(c.name)}</span><span class="vl num"></span></div>
        <div class="meter"><i></i></div>
      </div>
    </div>`);
  }

  // ───────── As linhas ─────────

  /** Onde uma caixa encosta, em coordenadas do palco. */
  function ancora(caixa, palco, lado) {
    const r = caixa.getBoundingClientRect();
    const p = palco.getBoundingClientRect();
    const x = r.left - p.left;
    const y = r.top - p.top;
    if (lado === "dir") return { x: x + r.width, y: y + r.height / 2 };
    if (lado === "esq") return { x, y: y + r.height / 2 };
    if (lado === "baixo") return { x: x + r.width / 2, y: y + r.height };
    return { x: x + r.width / 2, y }; // cima
  }

  function curva(a, b, vertical) {
    if (vertical) {
      const my = (a.y + b.y) / 2;
      return `M ${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
    }
    const mx = a.x + (b.x - a.x) * 0.5;
    return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  }

  let seq = 0;

  /** Uma ligação: a linha de base, e as partículas quando passa energia. */
  function ligacao(svg, d, cor) {
    const id = `fluxo-${++seq}`;
    const base = document.createElementNS(SVG, "path");
    base.setAttribute("id", id);
    base.setAttribute("d", d);
    base.setAttribute("class", "fio");
    base.style.stroke = `var(--${cor})`;
    svg.appendChild(base);
    const grupo = document.createElementNS(SVG, "g");
    svg.appendChild(grupo);

    let assinatura = "";
    /** valor em watts; sentido 1 = de a para b, -1 = ao contrário */
    return (valor, sentido) => {
      const e = escalao(valor);
      base.style.strokeWidth = String([1.2, 2, 3, 4.2, 5.5][e]);
      base.style.opacity = e ? "0.55" : "0.18";
      base.classList.toggle("parado", !e);

      const nova = `${e}:${sentido}`;
      if (nova === assinatura) return;
      assinatura = nova;
      grupo.innerHTML = "";
      if (!e || semMovimento()) return;

      const dur = [0, 3.6, 2.6, 1.8, 1.2][e];
      const quantas = [0, 1, 2, 3, 3][e];
      for (let i = 0; i < quantas; i++) {
        const c = document.createElementNS(SVG, "circle");
        c.setAttribute("r", String(2.2 + e * 0.6));
        c.setAttribute("class", "particula");
        c.style.fill = `var(--${cor})`;
        const a = document.createElementNS(SVG, "animateMotion");
        a.setAttribute("dur", `${dur}s`);
        a.setAttribute("repeatCount", "indefinite");
        a.setAttribute("begin", `-${(dur / quantas) * i}s`);
        a.setAttribute("keyPoints", sentido > 0 ? "0;1" : "1;0");
        a.setAttribute("keyTimes", "0;1");
        a.setAttribute("calcMode", "linear");
        const m = document.createElementNS(SVG, "mpath");
        m.setAttribute("href", `#${id}`);
        a.appendChild(m);
        c.appendChild(a);
        grupo.appendChild(c);
      }
    };
  }

  // ───────── A vista ─────────

  function fluxoAgora() {
    const naMao = ecra() === "mao";
    const circuitos = (E.circuits || []).filter((c) => c.potencia);

    const raiz = el(`<div class="agora-fluxo${naMao ? " mao" : ""}"></div>`);
    const palco = el('<div class="palco-fluxo"></div>');
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "fios");
    palco.appendChild(svg);

    const fontes = el('<div class="col-fontes"></div>');
    const sol = noFonte("sol", "Solar", "solar");
    const rede = noFonte("rede", "Rede", "grid");
    const bat = noFonte("bat", "Bateria", "battery");
    if (P.solar) fontes.appendChild(sol);
    if (P.grid) fontes.appendChild(rede);
    if (P.battery || E.battery_soc) fontes.appendChild(bat);

    const meio = el('<div class="col-casa"></div>');
    const casa = noCasa();
    meio.appendChild(casa);

    const destinos = el('<div class="col-circ card"></div>');
    destinos.appendChild(el('<span class="cap">Para onde vai</span>'));
    // ordenados pelo que gastam quando se abre a vista; depois ficam quietos,
    // para as linhas não trocarem de sítio a cada segundo
    const ordem = [...circuitos].sort((a, b) => (w(b.potencia) || 0) - (w(a.potencia) || 0));
    const linhas = ordem.map((c) => {
      const l = linhaCircuito(c);
      destinos.appendChild(l);
      return { c, l };
    });

    palco.append(fontes, meio, destinos);
    raiz.appendChild(palco);

    // ── as ligações desenham-se depois de o palco ter tamanho ──
    let fios = null;

    const desenhaFios = () => {
      const pr = palco.getBoundingClientRect();
      if (!pr.width || !pr.height) return;
      svg.setAttribute("viewBox", `0 0 ${pr.width} ${pr.height}`);
      svg.innerHTML = "";
      fios = { fontes: {}, circ: {} };

      const cx = naMao ? ancora(casa, palco, "cima") : ancora(casa, palco, "esq");
      [["sol", sol, "solar"], ["rede", rede, "grid"], ["bat", bat, "batt"]].forEach(([k, n, cor]) => {
        if (!n.isConnected) return;
        const a = naMao ? ancora(n, palco, "baixo") : ancora(n, palco, "dir");
        fios.fontes[k] = ligacao(svg, curva(a, cx, naMao), cor);
      });

      if (!naMao) {
        const saida = ancora(casa, palco, "dir");
        const borda = destinos.getBoundingClientRect().left - pr.left;
        linhas.forEach(({ c, l }) => {
          // a linha entra pela borda do cartão, à altura do circuito
          const b = { x: borda, y: ancora(l, palco, "esq").y };
          fios.circ[c.potencia] = ligacao(svg, curva(saida, b, false), "tint");
        });
      }
      pinta();
    };

    const pinta = () => {
      const s = Math.max(0, w(P.solar) || 0);
      const g = w(P.grid) || 0;
      const b = w(P.battery) || 0; // + a carregar
      const h = Math.max(0, w(P.home) || 0);
      const soc = w(E.battery_soc);

      sol.querySelector(".v").textContent = potencia(s);
      sol.querySelector(".s").textContent = s < PARADO ? "sem sol" : "a produzir";
      sol.classList.toggle("off", s < PARADO);

      rede.querySelector(".v").textContent = potencia(Math.abs(g));
      rede.querySelector(".s").textContent = g > PARADO ? "a comprar" : g < -PARADO ? "a vender" : "em equilíbrio";
      rede.classList.toggle("off", Math.abs(g) < PARADO);
      rede.classList.toggle("vende", g < -PARADO);

      bat.querySelector(".v").textContent = soc === null ? potencia(Math.abs(b)) : `${fmt.n(soc)} %`;
      bat.querySelector(".s").textContent =
        b > PARADO ? `a carregar · ${potencia(b)}` : b < -PARADO ? `a dar ${potencia(-b)}` : "em repouso";
      bat.classList.toggle("off", Math.abs(b) < PARADO);

      casa.querySelector(".v").textContent = potencia(h);

      linhas.forEach(({ c, l }) => {
        const v = Math.max(0, w(c.potencia) || 0);
        l.querySelector(".vl").textContent = potencia(v);
        l.querySelector(".meter i").style.width = `${h > 0 ? Math.min(100, (v / h) * 100) : 0}%`;
        l.classList.toggle("off", v < PARADO);
      });

      if (!fios) return;
      // sol → casa; a rede e a bateria vão nos dois sentidos
      if (fios.fontes.sol) fios.fontes.sol(s, 1);
      if (fios.fontes.rede) fios.fontes.rede(Math.abs(g), g >= 0 ? 1 : -1);
      if (fios.fontes.bat) fios.fontes.bat(Math.abs(b), b <= 0 ? 1 : -1);
      linhas.forEach(({ c }) => {
        const f = fios.circ[c.potencia];
        if (f) f(Math.max(0, w(c.potencia) || 0), 1);
      });
    };

    // o ResizeObserver já corre depois do layout: sem requestAnimationFrame, as
    // linhas desenham-se mesmo que o ecrã arranque apagado ou escondido
    new ResizeObserver(desenhaFios).observe(palco);
    // e uma vez logo que a vista entra na página: há browsers que só entregam
    // o ResizeObserver quando o ecrã fica visível
    setTimeout(desenhaFios, 0);
    bind(raiz, entre([P.solar, P.grid, P.battery, P.home, E.battery_soc, ...circuitos.map((c) => c.potencia)]), pinta);
    return raiz;
  }

  K.fluxoAgora = fluxoAgora;
})();
