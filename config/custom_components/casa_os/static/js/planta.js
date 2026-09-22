/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — a planta.
 *
 *  As pessoas não guardam a casa numa lista, guardam-na num mapa. Aqui o
 *  estado deixa de se ler e passa a ver-se, com o desenho de um arquiteto:
 *  paredes, portas que rodam, janelas com o estore corrido até onde está.
 *  Cada candeeiro aceso é uma poça de luz com a cor que tem; com o sol no
 *  céu, um estore aberto deixa entrar uma faixa de sol, inclinada como o sol
 *  está nesse momento. O robô anda pela divisão que está a limpar.
 *
 *  Toca-se numa divisão e ela abre-se no painel ao lado, com os controlos,
 *  sem sair da planta. As bolinhas por cima de cada divisão acendem e
 *  fecham sem abrir nada.
 *
 *  A planta é dados (config.json → planta): outra casa muda os números e não
 *  toca neste ficheiro. Sem esses dados, a secção não existe.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { CFG, bind, entre, ecra, divisoes, eGaragem, posicao, avisos } = K;

  const NS = "http://www.w3.org/2000/svg";
  function criar(tag, attrs, pai) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(n);
    return n;
  }

  const PL = CFG.planta || {};
  const PISOS = PL.pisos || [];
  const ROBO = CFG.robo || {};
  const MARGEM = 2.5; // à volta da casa, para a parede de fora não encostar ao bordo
  const nomePiso = (id) => ((CFG.floors || []).find((f) => f.id === id) || {}).name || id;
  const divisaoDe = (z) => divisoes().find((r) => r.id === z.divisao);
  const chave = (z) => z.divisao || (z.nome || "").toLowerCase();
  const reduzido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let pisoAtual = null;
  let escolhida = null; // a divisão aberta no painel
  let uid = 0;

  // ───────── O que cada divisão tem ─────────

  const luzes = (r) => (r && r.lights) || [];
  const estores = (r) => ((r && r.covers) || []).filter((c) => !eGaragem(c));
  const portao = (r) => ((r && r.covers) || []).find(eGaragem);
  const janelas = (r) => (r && r.windows) || [];
  const acesasDe = (r) => luzes(r).filter((l) => HA.isOn(l));
  const abertosDe = (r) => estores(r).filter((c) => posicao(c) > 0);
  const idsDe = (r) =>
    r
      ? [...luzes(r), ...(r.covers || []), ...janelas(r), ...(r.switches || []).map((s) => s.entity),
        r.climate, r.temperature, r.humidity, r.motion, r.contact, r.lock, K.AVISOS]
      : [];
  const eRega = (s) => s.icon === "water" || /[._]rega$/.test(s.entity);
  const semNome = (r, id) => {
    const n = HA.name(id).replace(new RegExp(`\\s*${r.name}\\s*`, "i"), " ").trim();
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : HA.name(id);
  };

  /** A cor de uma luz acesa: a que ela diz ter, senão a de uma lâmpada quente. */
  function corDaLuz(id) {
    const rgb = HA.attr(id, "rgb_color");
    return Array.isArray(rgb) && rgb.length === 3 ? rgb : [255, 190, 120];
  }
  const brilhoDe = (id) => {
    const b = HA.attr(id, "brightness");
    return b === null || b === undefined ? 1 : Math.max(0.15, b / 255);
  };

  // ───────── Geometria ─────────

  /** A parede de fora de uma zona, e para que lado fica o dentro. */
  function paredeFora(z, lado = z.fora) {
    switch (lado) {
      case "sul": return { a: [z.x, z.y + z.h], b: [z.x + z.w, z.y + z.h], dentro: [0, -1], lado };
      case "este": return { a: [z.x + z.w, z.y], b: [z.x + z.w, z.y + z.h], dentro: [-1, 0], lado };
      case "oeste": return { a: [z.x, z.y], b: [z.x, z.y + z.h], dentro: [1, 0], lado };
      default: return { a: [z.x, z.y], b: [z.x + z.w, z.y], dentro: [0, 1], lado: "norte" };
    }
  }
  const ao = (s, t) => [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
  const comprimento = (s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);

  /** A parede que duas zonas partilham, se partilham alguma. */
  function partilhada(A, B) {
    const e = 0.01;
    const px = Math.abs(A.x + A.w - B.x) < e ? B.x : Math.abs(B.x + B.w - A.x) < e ? A.x : null;
    if (px !== null) {
      const y0 = Math.max(A.y, B.y), y1 = Math.min(A.y + A.h, B.y + B.h);
      if (y1 - y0 > 1) return { a: [px, y0], b: [px, y1] };
    }
    const py = Math.abs(A.y + A.h - B.y) < e ? B.y : Math.abs(B.y + B.h - A.y) < e ? A.y : null;
    if (py !== null) {
      const x0 = Math.max(A.x, B.x), x1 = Math.min(A.x + A.w, B.x + B.w);
      if (x1 - x0 > 1) return { a: [x0, py], b: [x1, py] };
    }
    return null;
  }

  /** Onde fica um ponto da divisão: o que a planta diz, ou o meio. */
  function pontosDe(z, id) {
    const p = (z.pontos || {})[id];
    if (!p) return [[z.x + z.w / 2, z.y + z.h / 2]];
    return (Array.isArray(p[0]) ? p : [p]).map(([x, y]) => [z.x + x, z.y + y]);
  }

  // ───────── Os móveis ─────────
  // Desenhados deitados, com as costas a norte; a rotação põe-nos no sítio.
  // São traço fino e pouco contraste: estão lá para se reconhecer a divisão,
  // não para competir com o que está ligado.

  const rr = (g, x, y, w, h, r, cls) => criar("rect", { x, y, width: Math.max(0, w), height: Math.max(0, h), rx: r, class: cls }, g);
  const ln = (g, x1, y1, x2, y2, cls = "m-linha") => criar("line", { x1, y1, x2, y2, class: cls }, g);
  const ci = (g, cx, cy, r, cls = "m-corpo") => criar("circle", { cx, cy, r, class: cls }, g);

  const MOVEIS = {
    tapete: (g, W, H) => rr(g, 0, 0, W, H, 0.6, "m-tapete"),
    caminho: (g, W, H) => rr(g, 0, 0, W, H, 0.4, "m-caminho"),
    deck: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.4, "m-deck");
      for (let x = 2; x < W; x += 2) ln(g, x, 0, x, H, "m-tabua");
    },
    sofa: (g, W, H) => {
      const b = Math.min(2.4, W * 0.12);
      rr(g, 0, 0, W, H, 1.4, "m-corpo");
      rr(g, 0, 0, W, H * 0.3, 1.2, "m-linha");
      rr(g, 0, 0, b, H, 1.1, "m-linha");
      rr(g, W - b, 0, b, H, 1.1, "m-linha");
      const n = Math.max(2, Math.round(W / 8));
      for (let i = 1; i < n; i++) ln(g, b + ((W - 2 * b) / n) * i, H * 0.3, b + ((W - 2 * b) / n) * i, H);
    },
    poltrona: (g, W, H) => {
      rr(g, 0, 0, W, H, 1.6, "m-corpo");
      rr(g, 0, 0, W, H * 0.3, 1.2, "m-linha");
    },
    mesinha: (g, W, H) => rr(g, 0, 0, W, H, 1, "m-corpo"),
    tv: (g, W, H) => rr(g, 0, 0, W, H, 0.3, "m-tv"),
    movel_tv: (g, W, H) => rr(g, 0, 0, W, H, 0.5, "m-corpo"),
    mesa: (g, W, H) => {
      const n = Math.max(2, Math.floor((W * 0.76) / 4.4));
      const cw = Math.min(3.4, ((W * 0.76) / n) * 0.72);
      for (let i = 0; i < n; i++) {
        const cx = W * 0.12 + ((W * 0.76) / n) * (i + 0.5);
        rr(g, cx - cw / 2, 0, cw, H * 0.2, 0.8, "m-corpo");
        rr(g, cx - cw / 2, H * 0.8, cw, H * 0.2, 0.8, "m-corpo");
      }
      rr(g, W * 0.1, H * 0.2, W * 0.8, H * 0.6, 0.8, "m-corpo");
    },
    cama: (g, W, H) => {
      rr(g, 0, 0, W, H, 1, "m-corpo");
      rr(g, 0, 0, W, H * 0.07, 0.5, "m-cheio");
      rr(g, W * 0.08, H * 0.11, W * 0.38, H * 0.14, 1, "m-linha");
      rr(g, W * 0.54, H * 0.11, W * 0.38, H * 0.14, 1, "m-linha");
      ln(g, 0, H * 0.36, W, H * 0.36);
      ln(g, W * 0.72, H * 0.36, W, H * 0.46);
    },
    cabeceira: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.5, "m-corpo");
      ci(g, W / 2, H / 2, Math.min(W, H) * 0.26, "m-linha");
    },
    roupeiro: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.3, "m-corpo");
      const n = Math.max(2, Math.round(W / 6));
      for (let i = 1; i < n; i++) ln(g, (W / n) * i, 0, (W / n) * i, H);
    },
    secretaria: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.5, "m-corpo");
      ln(g, W * 0.32, H * 0.3, W * 0.68, H * 0.3, "m-ecra");
    },
    cadeira: (g, W, H) => {
      ci(g, W / 2, H / 2, Math.min(W, H) / 2);
      criar("path", { d: `M ${W * 0.15} ${H * 0.3} A ${W * 0.45} ${H * 0.45} 0 0 1 ${W * 0.85} ${H * 0.3}`, class: "m-linha" }, g);
    },
    banco: (g, W, H) => ci(g, W / 2, H / 2, Math.min(W, H) / 2),
    estante: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.3, "m-corpo");
      for (let x = 3; x < W; x += 3) ln(g, x, 0, x, H);
    },
    aparador: (g, W, H) => rr(g, 0, 0, W, H, 0.3, "m-corpo"),
    bancada: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.4, "m-corpo");
      const lw = Math.min(7, W * 0.22);
      rr(g, W * 0.12, H * 0.18, lw, H * 0.62, 0.9, "m-linha");
      if (W > 20) {
        const r = Math.min(1.2, H * 0.14);
        const x0 = W * 0.6;
        [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([i, j]) => ci(g, x0 + i * r * 3.2, H * 0.32 + j * r * 2.8, r, "m-linha"));
      }
    },
    frigorifico: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.4, "m-corpo");
      ln(g, 0, H * 0.82, W, H * 0.82);
    },
    ilha: (g, W, H) => {
      rr(g, 0, 0, W, H, 1, "m-corpo");
      rr(g, 0.8, 0.8, W - 1.6, H - 1.6, 0.6, "m-linha");
    },
    carro: (g, W, H) => {
      // rodas por baixo, carroçaria por cima, e os vidros a dizer para onde está virado
      const rw = W * 0.14, rh = H * 0.15;
      [[0, H * 0.14], [W - rw, H * 0.14], [0, H * 0.7], [W - rw, H * 0.7]].forEach(([x, y]) => rr(g, x - rw * 0.25, y, rw, rh, 0.4, "m-cheio"));
      criar("path", {
        d: `M ${W * 0.12} ${H * 0.06} Q ${W * 0.12} 0 ${W / 2} 0 Q ${W * 0.88} 0 ${W * 0.88} ${H * 0.06}
            L ${W * 0.95} ${H * 0.9} Q ${W * 0.95} ${H} ${W / 2} ${H} Q ${W * 0.05} ${H} ${W * 0.05} ${H * 0.9} Z`,
        class: "m-corpo",
      }, g);
      criar("path", { d: `M ${W * 0.2} ${H * 0.62} L ${W * 0.8} ${H * 0.62} L ${W * 0.86} ${H * 0.78} L ${W * 0.14} ${H * 0.78} Z`, class: "m-vidro" }, g);
      criar("path", { d: `M ${W * 0.22} ${H * 0.3} L ${W * 0.78} ${H * 0.3} L ${W * 0.82} ${H * 0.2} L ${W * 0.18} ${H * 0.2} Z`, class: "m-vidro" }, g);
    },
    carregador: (g, W, H) => rr(g, 0, 0, W, H, 0.3, "m-cheio"),
    escada: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.2, "m-corpo");
      for (let y = 1.8; y < H; y += 1.8) ln(g, 0, y, W, y);
      ln(g, W / 2, H - 1.2, W / 2, 1.6, "m-seta");
      criar("path", { d: `M ${W / 2 - 1.2} 3 L ${W / 2} 1.4 L ${W / 2 + 1.2} 3`, class: "m-seta" }, g);
    },
    banheira: (g, W, H) => {
      rr(g, 0, 0, W, H, 1, "m-corpo");
      rr(g, 0.9, 0.9, W - 1.8, H - 1.8, Math.min(W, H) * 0.34, "m-linha");
    },
    lavatorio: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.5, "m-corpo");
      criar("ellipse", { cx: W / 2, cy: H * 0.55, rx: W * 0.32, ry: H * 0.28, class: "m-linha" }, g);
    },
    sanita: (g, W, H) => {
      rr(g, W * 0.1, 0, W * 0.8, H * 0.28, 0.4, "m-corpo");
      criar("ellipse", { cx: W / 2, cy: H * 0.63, rx: W * 0.36, ry: H * 0.36, class: "m-corpo" }, g);
    },
    maquina: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.6, "m-corpo");
      ci(g, W / 2, H / 2, Math.min(W, H) * 0.3, "m-linha");
    },
    estendal: (g, W, H) => {
      rr(g, 0, 0, W, H, 0.3, "m-tapete");
      for (let y = 1.6; y < H; y += 1.6) ln(g, 0, y, W, y);
    },
    arvore: (g, W, H) => {
      ci(g, W / 2, H / 2, Math.min(W, H) / 2, "m-arvore");
      ci(g, W * 0.4, H * 0.42, Math.min(W, H) * 0.22, "m-arvore");
      ci(g, W * 0.62, H * 0.6, Math.min(W, H) * 0.16, "m-arvore");
    },
    sebe: (g, W, H) => rr(g, 0, 0, W, H, Math.min(W, H) / 2, "m-arvore"),
  };
  // o que fica por baixo (tapetes, caminhos) desenha-se primeiro; a TV por cima do móvel
  const CAMADA = { tapete: 0, caminho: 0, deck: 0, estendal: 0, tv: 2 };

  function desenhaMoveis(z, pai) {
    const g = criar("g", { class: "moveis" }, pai);
    (z.moveis || [])
      .slice()
      .sort((a, b) => (CAMADA[a[0]] ?? 1) - (CAMADA[b[0]] ?? 1))
      .forEach(([tipo, x, y, w, h, rot = 0]) => {
        const faz = MOVEIS[tipo];
        if (!faz) return;
        const deitado = Math.abs(rot) % 180 === 90;
        const W = deitado ? h : w;
        const H = deitado ? w : h;
        const m = criar("g", {
          class: `movel m-${tipo}`,
          transform: `translate(${z.x + x + w / 2} ${z.y + y + h / 2}) rotate(${rot}) translate(${-W / 2} ${-H / 2})`,
        }, g);
        faz(m, W, H);
      });
  }

  // ───────── A luz ─────────

  /** Uma poça de luz por candeeiro aceso, com a cor dele, fechada na divisão. */
  function desenhaLuz(z, r, defs, g) {
    g.innerHTML = "";
    defs.innerHTML = ""; // os gradientes desta divisão: redesenhar não os acumula
    acesasDe(r).forEach((id) => {
      const [cr, cg, cb] = corDaLuz(id);
      const cor = `rgb(${cr} ${cg} ${cb})`;
      const gid = `pl-luz-${++uid}`;
      const grad = criar("radialGradient", { id: gid }, defs);
      criar("stop", { offset: "0", "stop-color": cor, "stop-opacity": "0.95" }, grad);
      criar("stop", { offset: "0.45", "stop-color": cor, "stop-opacity": "0.42" }, grad);
      criar("stop", { offset: "1", "stop-color": cor, "stop-opacity": "0" }, grad);
      const raio = Math.max(9, Math.min(26, Math.min(z.w, z.h) * 0.72));
      pontosDe(z, id).forEach(([x, y]) => {
        criar("circle", { cx: x, cy: y, r: raio, fill: `url(#${gid})`, opacity: (0.32 + 0.55 * brilhoDe(id)).toFixed(2), class: "poca" }, g);
      });
    });
  }

  /**
   * O sol que entra pelas janelas. Só entra por uma parede virada para o sol,
   * com o estore aberto, e inclina-se com o azimute: de manhã a sala vira a
   * nascente, à tarde as faixas deitam-se para o outro lado.
   */
  function desenhaSol(z, r, defs, g, vaos) {
    g.innerHTML = "";
    defs.innerHTML = "";
    const sol = HA.get("sun.sun");
    const az = sol && Number(sol.attributes.azimuth);
    const elev = sol && Number(sol.attributes.elevation);
    if (!sol || !(elev > 1)) return;
    const normal = { norte: 0, este: 90, sul: 180, oeste: 270 }[z.fora || "norte"];
    const d = ((az - normal + 540) % 360) - 180; // o sol em relação à janela
    if (Math.abs(d) >= 82) return;
    const p = paredeFora(z);
    const rad = (elev * Math.PI) / 180;
    const fundo = p.dentro[0] ? z.w : z.h;
    const profundidade = Math.max(4, Math.min(fundo * 0.85, 9 / Math.tan(rad)));
    // para onde o sol empurra a luz, no chão (x para este, y para sul)
    const ida = [-Math.sin((az * Math.PI) / 180), Math.cos((az * Math.PI) / 180)];
    const para = ida[0] * p.dentro[0] + ida[1] * p.dentro[1];
    if (para <= 0.05) return;
    const k = profundidade / para;
    vaos.forEach((v) => {
      const aberto = v.estore ? posicao(v.estore) / 100 : 1;
      if (aberto <= 0.02) return;
      const forca = aberto * Math.min(1, elev / 12) * Math.cos((d * Math.PI) / 180);
      const gid = `pl-sol-${++uid}`;
      const [x1, y1, x2, y2] = { norte: [0, 0, 0, 1], sul: [0, 1, 0, 0], este: [1, 0, 0, 0], oeste: [0, 0, 1, 0] }[p.lado];
      const grad = criar("linearGradient", { id: gid, x1, y1, x2, y2 }, defs);
      criar("stop", { offset: "0", "stop-color": "var(--solar)", "stop-opacity": (0.5 * forca).toFixed(2) }, grad);
      criar("stop", { offset: "1", "stop-color": "var(--solar)", "stop-opacity": "0" }, grad);
      // o estore meio corrido deixa entrar só a parte de baixo da janela
      const a = v.de, b = v.ate;
      const pts = [a, b, [b[0] + ida[0] * k * aberto, b[1] + ida[1] * k * aberto], [a[0] + ida[0] * k * aberto, a[1] + ida[1] * k * aberto]];
      criar("polygon", { points: pts.map((q) => q.join(",")).join(" "), fill: `url(#${gid})`, class: "raio" }, g);
    });
  }

  // ───────── Aberturas: janelas, portão e porta ─────────

  /** As janelas da parede de fora: um vão por estore, com o sensor da janela ao lado. */
  function vaosDe(z, r) {
    const cs = estores(r);
    const js = janelas(r);
    const n = Math.max(cs.length, js.length);
    const lista = [];
    for (let i = 0; i < n; i++) lista.push({ estore: cs[i] || null, janela: js[i] || null });
    const p = portao(r);
    if (p) lista.push({ portao: p });
    if (!lista.length) return [];
    const s = paredeFora(z);
    const L = comprimento(s);
    const largura = (v) => (v.portao ? 17 : v.estore && /porta/i.test(v.estore) ? 12 : 8);
    // os vãos repartem a parede; a porta de entrada, se houver, fica de fora
    const livres = z.porta !== undefined ? lista.map((_, i) => (i + 0.5) / lista.length * 0.5) : null;
    return lista.map((v, i) => {
      const t = livres ? livres[i] : (i + 1) / (lista.length + 1);
      const w = Math.min(largura(v), (L / (lista.length + 1)) * 0.9) / L;
      return { ...v, de: ao(s, t - w / 2), ate: ao(s, t + w / 2), s };
    });
  }

  function desenhaVaos(g, vaos) {
    g.innerHTML = "";
    vaos.forEach((v) => {
      const [a, b] = [v.de, v.ate];
      criar("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "vao" }, g);
      if (v.portao) {
        // o portão recolhe para o lado quando abre
        const aberto = posicao(v.portao) / 100;
        const fim = [a[0] + (b[0] - a[0]) * (1 - aberto), a[1] + (b[1] - a[1]) * (1 - aberto)];
        criar("line", { x1: a[0], y1: a[1], x2: fim[0], y2: fim[1], class: `portao${aberto > 0.02 ? " aberto" : ""}` }, g);
        return;
      }
      const aberta = v.janela && HA.isOn(v.janela);
      criar("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: `vidro${aberta ? " aberta" : ""}` }, g);
      if (v.estore) {
        const fechado = 1 - posicao(v.estore) / 100;
        if (fechado > 0.01) {
          const fim = [a[0] + (b[0] - a[0]) * fechado, a[1] + (b[1] - a[1]) * fechado];
          criar("line", { x1: a[0], y1: a[1], x2: fim[0], y2: fim[1], class: "estore" }, g);
        }
      }
      if (aberta) {
        // a folha da janela aberta, rodada para dentro
        const s = v.s;
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.5;
        const fim = [b[0] + s.dentro[0] * L * 0.8 - (b[0] - a[0]) * 0.3, b[1] + s.dentro[1] * L * 0.8 - (b[1] - a[1]) * 0.3];
        criar("line", { x1: b[0], y1: b[1], x2: fim[0], y2: fim[1], class: "folha aberta" }, g);
      }
    });
  }

  /** Uma porta: o vão, a folha e o arco por onde roda. */
  function desenhaPorta(g, s, t, largura, dentro, { aberta = false, estado = "", passagem = false } = {}) {
    const L = comprimento(s);
    const w = Math.min(largura, L * 0.6) / L;
    const a = ao(s, t - w / 2);
    const b = ao(s, t + w / 2);
    criar("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "vao porta" }, g);
    if (passagem) return;
    const lw = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ang = aberta ? 80 : 0;
    const ux = (b[0] - a[0]) / lw, uy = (b[1] - a[1]) / lw;
    const rad = (ang * Math.PI) / 180;
    const fim = [a[0] + (ux * Math.cos(rad) + dentro[0] * Math.sin(rad)) * lw, a[1] + (uy * Math.cos(rad) + dentro[1] * Math.sin(rad)) * lw];
    // o arco vai do batente à ponta da folha, do lado de dentro
    const varre = ux * dentro[1] - uy * dentro[0] > 0 ? 1 : 0;
    if (aberta) criar("path", { d: `M ${b[0]} ${b[1]} A ${lw} ${lw} 0 0 ${varre} ${fim[0]} ${fim[1]}`, class: "arco" }, g);
    criar("line", { x1: a[0], y1: a[1], x2: fim[0], y2: fim[1], class: `folha ${estado}` }, g);
  }

  // ───────── O robô ─────────

  function faixasDoRobo(z) {
    const x0 = z.x + 3.2, x1 = z.x + z.w - 3.2, y0 = z.y + 3.2, y1 = z.y + z.h - 3.2;
    let d = `M ${x0} ${y0}`;
    let lado = 1;
    for (let y = y0; y <= y1; y += 3.4) {
      d += ` L ${lado > 0 ? x1 : x0} ${y}`;
      if (y + 3.4 <= y1) d += ` L ${lado > 0 ? x1 : x0} ${y + 3.4}`;
      lado = -lado;
    }
    return { d, comprimento: (x1 - x0) * Math.ceil((y1 - y0) / 3.4 + 1) };
  }

  function desenhaRobo(g, piso) {
    g.innerHTML = "";
    const id = ROBO.entidade;
    const s = id && HA.get(id);
    if (!s || !PL.robo) return;
    const atividade = s.state;
    const onde = HA.attr(id, "divisao");
    const z = piso.zonas.find((q) => q.divisao === onde);
    const base = PL.robo.piso === piso.id ? [PL.robo.x, PL.robo.y] : null;

    const corpo = (x, y) => {
      const r = criar("g", { class: `robo ${atividade}`, transform: `translate(${x} ${y})` });
      criar("circle", { r: 1.9, class: "robo-corpo" }, r);
      criar("circle", { r: 0.55, cy: -0.9, class: "robo-olho" }, r);
      return r;
    };
    if (base) {
      rr(g, base[0] - 1.8, base[1] + 1.2, 3.6, 1.1, 0.4, "robo-base");
    }
    if ((atividade === "cleaning" || atividade === "paused") && z) {
      const f = faixasDoRobo(z);
      criar("path", { d: f.d, class: "robo-rasto" }, g);
      if (atividade === "paused" || reduzido()) {
        g.appendChild(corpo(z.x + z.w / 2, z.y + z.h / 2));
        return;
      }
      const r = corpo(0, 0);
      r.removeAttribute("transform");
      criar("animateMotion", { dur: `${Math.round(f.comprimento / 4.5)}s`, repeatCount: "indefinite", path: f.d, rotate: "auto" }, r);
      g.appendChild(r);
    } else if (base) {
      g.appendChild(corpo(base[0], base[1]));
    }
  }

  // ───────── Um piso ─────────

  /**
   * O desenho de um piso: chão, luz, sol, móveis, paredes e aberturas. Serve
   * também para a casa em miniatura, vista do jardim (sem mãos, sem robô).
   */
  function desenhaPiso(piso, svg, defs, { mini = false } = {}) {
    const g = criar("g", { class: `piso${mini ? " mini" : ""}` }, svg);
    const zonas = piso.zonas;

    // o chão e, recortados por ele, a luz e o sol de cada divisão
    const porZona = new Map();
    zonas.forEach((z) => {
      const cid = `pl-recorte-${++uid}`;
      const cp = criar("clipPath", { id: cid }, defs);
      rr(cp, z.x, z.y, z.w, z.h, 0);
      const zg = criar("g", { class: `zona${z.vazia ? " vazia" : ""}${z.jardim ? " jardim" : ""}${z.casa ? " casa" : ""}`, "data-z": chave(z) }, g);
      rr(zg, z.x, z.y, z.w, z.h, 0, "chao");
      const sol = criar("g", { class: "sol", "clip-path": `url(#${cid})` }, zg);
      const luz = criar("g", { class: "luzes", "clip-path": `url(#${cid})` }, zg);
      desenhaMoveis(z, criar("g", { "clip-path": `url(#${cid})` }, zg));
      const extra = criar("g", { class: "extra", "clip-path": `url(#${cid})` }, zg);
      porZona.set(z, { zg, sol, luz, extra });
    });

    // paredes: as de dentro finas, a de fora grossa
    const paredes = criar("g", { class: "paredes" }, g);
    zonas.forEach((z) => rr(paredes, z.x, z.y, z.w, z.h, 0, z.jardim ? "vedacao" : z.casa ? "parede fora" : "parede"));
    if (!zonas.some((z) => z.jardim)) rr(paredes, 0, 0, piso.largura, piso.altura, 0, "parede fora");

    // portas entre divisões
    const aberturas = criar("g", { class: "aberturas" }, g);
    const zonaDe = (k) => zonas.find((z) => chave(z) === k);
    (piso.portas || []).forEach(([de, para, op = {}]) => {
      const A = zonaDe(de), B = zonaDe(para);
      const s = A && B && partilhada(A, B);
      if (!s) return;
      // roda para dentro de B
      const mid = ao(s, 0.5);
      const dentro = s.a[0] === s.b[0] ? [Math.sign(B.x + B.w / 2 - mid[0]), 0] : [0, Math.sign(B.y + B.h / 2 - mid[1])];
      desenhaPorta(aberturas, s, op.em ?? 0.5, op.largura ?? 7, dentro, { aberta: true, passagem: !!op.passagem });
    });

    zonas.forEach((z) => {
      const r = divisaoDe(z);
      const { zg, sol, luz, extra } = porZona.get(z);
      const janelasG = criar("g", {}, aberturas);
      const portaG = criar("g", {}, aberturas);
      if (!r) return;
      const vaos = vaosDe(z, r);
      // cada divisão tem as suas gaiolas de gradientes, que se esvaziam ao redesenhar
      const defsLuz = criar("g", {}, defs);
      const defsSol = criar("g", {}, defs);
      bind(zg, entre([...idsDe(r), "sun.sun"]), () => {
        desenhaLuz(z, r, defsLuz, luz);
        zg.classList.toggle("acesa", acesasDe(r).length > 0);
        zg.classList.toggle("alerta", avisos().some((a) => a.divisao === r.name));
        desenhaVaos(janelasG, vaos);
        desenhaSol(z, r, defsSol, sol, vaos.filter((v) => !v.portao));
        if (z.porta !== undefined) {
          portaG.innerHTML = "";
          const trancada = r.lock ? (HA.get(r.lock) || {}).state === "locked" : null;
          const s = paredeFora(z);
          desenhaPorta(portaG, s, typeof z.porta === "number" ? z.porta : 0.5, 8, s.dentro, {
            aberta: r.contact ? HA.isOn(r.contact) : false,
            estado: trancada === false ? "destrancada" : trancada ? "trancada" : "",
          });
        }
        if (mini) return;
        // movimento: uma onda onde o sensor está; rega: gotas onde estão os aspersores
        extra.innerHTML = "";
        if (r.motion && HA.isOn(r.motion)) {
          pontosDe(z, r.motion).forEach(([x, y]) => {
            criar("circle", { cx: x, cy: y, r: 3, class: "onda" }, extra);
            criar("circle", { cx: x, cy: y, r: 3, class: "onda tarde" }, extra);
          });
        }
        (r.switches || []).forEach((s) => {
          if (!eRega(s) || !HA.isOn(s.entity)) return;
          pontosDe(z, s.entity).forEach(([x, y]) => {
            criar("circle", { cx: x, cy: y, r: 6, class: "rega" }, extra);
            criar("circle", { cx: x, cy: y, r: 6, class: "rega tarde" }, extra);
          });
        });
      });
    });

    // a casa vista do jardim: o rés-do-chão em miniatura, com as luzes que tem
    zonas.filter((z) => z.casa && z.mostra).forEach((z) => {
      const outro = PISOS.find((p) => p.id === z.mostra);
      if (!outro) return;
      const mg = criar("g", { transform: `translate(${z.x} ${z.y}) scale(${z.w / outro.largura} ${z.h / outro.altura})` }, g);
      desenhaPiso(outro, mg, defs, { mini: true });
    });

    if (!mini) {
      const robo = criar("g", { class: "robo-camada" }, g);
      if (ROBO.entidade) bind(robo, entre([ROBO.entidade]), () => desenhaRobo(robo, piso));
    }
    return g;
  }

  // ───────── Por cima do desenho: nomes, bolinhas e câmaras ─────────

  const pct = (v, total) => `${((v + MARGEM) / (total + MARGEM * 2)) * 100}%`;
  const tam = (v, total) => `${(v / (total + MARGEM * 2)) * 100}%`;

  function camadaDeCima(piso, aoEscolher) {
    const W = piso.largura, H = piso.altura;
    const cima = el('<div class="pl-cima"></div>');
    const naMao = ecra() === "mao";

    piso.zonas.forEach((z) => {
      const r = divisaoDe(z);
      if (!r && !z.casa && !z.nome) return;
      const caixa = el(`<div class="pl-zona${z.jardim ? " jardim" : ""}${z.casa ? " casa" : ""}${z.vazia ? " vazia" : ""}" data-z="${esc(chave(z))}"></div>`);
      Object.assign(caixa.style, { left: pct(z.x, W), top: pct(z.y, H), width: tam(z.w, W), height: tam(z.h, H) });

      // um corredor tem nome, mas não tem nada para controlar
      if (!r && !z.casa) {
        caixa.appendChild(el(`<div class="pl-rotulo"><span class="pl-nome">${esc(z.nome)}</span></div>`));
        cima.appendChild(caixa);
        return;
      }

      if (z.casa) {
        // do jardim, tocar na casa entra no rés-do-chão
        const b = el(`<button class="pl-toque" aria-label="${esc(z.nome || "A casa")} · ver o ${esc(nomePiso(z.mostra))}"></button>`);
        b.addEventListener("click", () => aoEscolher(null, z.mostra));
        caixa.appendChild(b);
        cima.appendChild(caixa);
        return;
      }

      const toque = el(`<button class="pl-toque" aria-label="${esc(r.name)}"></button>`);
      toque.addEventListener("click", () => aoEscolher(r.id));
      const rotulo = el(`<div class="pl-rotulo"><span class="pl-nome">${esc(r.name)}</span><span class="pl-info num"></span><span class="pl-aviso"></span></div>`);
      const chips = el('<div class="pl-chips"></div>');
      caixa.append(toque, rotulo);

      if (!naMao) {
        if (luzes(r).length) {
          const c = el(`<button class="pl-chip luz" aria-label="Luzes · ${esc(r.name)}">${icon("bulb", "ic-s")}<span class="num"></span></button>`);
          c.addEventListener("click", () => HA.call("light", acesasDe(r).length ? "turn_off" : "turn_on", luzes(r)));
          bind(c, entre(luzes(r)), () => {
            const n = acesasDe(r).length;
            c.setAttribute("aria-pressed", String(n > 0));
            c.querySelector("span").textContent = n > 1 ? fmt.n(n) : "";
          });
          chips.appendChild(c);
        }
        if (estores(r).length) {
          const c = el(`<button class="pl-chip estore" aria-label="Estores · ${esc(r.name)}">${icon("blinds", "ic-s")}<span class="num"></span></button>`);
          c.addEventListener("click", () => HA.call("cover", abertosDe(r).length ? "close_cover" : "open_cover", estores(r)));
          bind(c, entre(estores(r)), () => {
            const media = estores(r).reduce((t, e) => t + posicao(e), 0) / estores(r).length;
            c.setAttribute("aria-pressed", String(media > 0));
            c.querySelector("span").textContent = media > 0 ? `${fmt.n(media)} %` : "";
          });
          chips.appendChild(c);
        }
        const rega = (r.switches || []).find(eRega);
        if (rega) {
          const c = el(`<button class="pl-chip rega" aria-label="${esc(rega.name)}">${icon("water", "ic-s")}</button>`);
          c.addEventListener("click", () => HA.call("switch", HA.isOn(rega.entity) ? "turn_off" : "turn_on", rega.entity));
          bind(c, entre([rega.entity]), () => c.setAttribute("aria-pressed", String(HA.isOn(rega.entity))));
          chips.appendChild(c);
        }
        if (chips.children.length) caixa.appendChild(chips);
      }

      bind(rotulo, entre(idsDe(r)), () => {
        const t = r.temperature ? HA.num(r.temperature) : null;
        const partes = [];
        if (t !== null) partes.push(`${fmt.n(t, 1)}°`);
        if (r.climate) {
          const m = (HA.get(r.climate) || {}).state;
          if (m && m !== "off") partes.push(m === "heat" ? "a aquecer" : m === "cool" ? "a arrefecer" : "ar ligado");
        }
        rotulo.querySelector(".pl-info").textContent = partes.join(" · ");
        const aviso = avisos().find((a) => a.divisao === r.name);
        const aberta = janelas(r).some((j) => HA.isOn(j));
        const destrancada = r.lock && (HA.get(r.lock) || {}).state === "unlocked";
        rotulo.querySelector(".pl-aviso").textContent = aviso ? aviso.titulo : aberta ? "Janela aberta" : destrancada ? "Destrancada" : "";
      });
      cima.appendChild(caixa);

      // as câmaras da divisão, onde estão penduradas
      if (r.camera && !naMao) {
        pontosDe(z, r.camera).forEach(([x, y]) => {
          const b = el(`<button class="pl-cam" aria-label="Câmara · ${esc(r.name)}">${icon("camera", "ic-s")}</button>`);
          Object.assign(b.style, { left: pct(x, W), top: pct(y, H) });
          b.addEventListener("click", () => K.ampliar({ entidade: r.camera, nome: r.name }));
          cima.appendChild(b);
        });
      }
    });

    // as câmaras de dentro vistas de fora, na casa em miniatura
    piso.zonas.filter((z) => z.casa && !naMao).forEach((z) => {
      Object.entries(z.pontos || {}).forEach(([id, p]) => {
        if (!id.startsWith("camera.")) return;
        const cam = (CFG.cameras || []).find((c) => c.entity === id);
        const b = el(`<button class="pl-cam" aria-label="Câmara · ${esc(cam ? cam.name : id)}">${icon("camera", "ic-s")}</button>`);
        Object.assign(b.style, { left: pct(z.x + p[0], W), top: pct(z.y + p[1], H) });
        b.addEventListener("click", () => K.ampliar({ entidade: id, nome: cam ? cam.name : id }));
        cima.appendChild(b);
      });
    });

    // o robô tem o botão na base: é por onde se lhe fala
    if (ROBO.entidade && PL.robo && PL.robo.piso === piso.id && !naMao) {
      const b = el(`<button class="pl-cam pl-robo" data-z="robo" aria-label="Robô aspirador">${icon("robot", "ic-s")}</button>`);
      Object.assign(b.style, { left: pct(PL.robo.x - 4.2, W), top: pct(PL.robo.y - 0.6, H) });
      b.addEventListener("click", () => aoEscolher("robo"));
      bind(b, entre([ROBO.entidade]), () => b.classList.toggle("ativo", (HA.get(ROBO.entidade) || {}).state === "cleaning"));
      cima.appendChild(b);
    }
    // a seta do norte, como nos desenhos de arquitetura: é por ela que o sol
    // desenhado nas janelas bate certo com a hora
    cima.appendChild(el(`<div class="pl-norte" role="img" aria-label="Norte" title="Norte">
      <svg viewBox="0 0 20 30" aria-hidden="true"><text x="10" y="9" text-anchor="middle">N</text>
        <path d="M10 12 L15 27 L10 23.5 L5 27 Z"/></svg></div>`));
    return cima;
  }

  // ───────── O painel ─────────

  function secao(titulo, filhos) {
    const s = el(`<section class="pp-sec"><span class="cap">${esc(titulo)}</span></section>`);
    filhos.filter(Boolean).forEach((f) => s.appendChild(f));
    return s;
  }

  /** Uma luz em mosaico: toca-se para acender ou apagar. */
  function luzEmMosaico(r, id) {
    const b = el(`<button class="pp-luz" aria-pressed="false">${icon("bulb", "ic-s")}
      <span class="bd nm">${esc(semNome(r, id))}</span><span class="ft vl"></span></button>`);
    b.setAttribute("aria-label", HA.name(id));
    b.addEventListener("click", () => HA.call("light", HA.isOn(id) ? "turn_off" : "turn_on", id));
    return bind(b, entre([id]), () => {
      const on = HA.isOn(id);
      const br = HA.attr(id, "brightness");
      b.setAttribute("aria-pressed", String(on));
      b.querySelector(".vl").textContent = on ? (br ? `${fmt.n((br / 255) * 100)} %` : "Acesa") : "Apagada";
    });
  }

  function climaCompacto(r) {
    const id = r.climate;
    const node = el(`<div class="pp-clima">
      <div><div><span class="t3 num alvo"></span><span class="ft dim"> °C</span></div>
        <div class="ft modo"></div></div>
      <div class="stepper"><button data-d="-1" aria-label="Baixar a temperatura">${icon("minus", "ic-s")}</button>
        <button data-d="1" aria-label="Subir a temperatura">${icon("plus", "ic-s")}</button></div></div>`);
    const sw = K.interruptor("Ar condicionado");
    node.appendChild(sw);
    sw.addEventListener("click", () => HA.call("climate", HA.isOn(id) ? "turn_off" : "turn_on", id));
    let pedida = HA.attr(id, "temperature", 22);
    let quando = 0;
    let espera = null;
    node.querySelectorAll(".stepper button").forEach((b) =>
      b.addEventListener("click", () => {
        const passo = HA.attr(id, "target_temp_step", 0.5) || 0.5;
        pedida = Math.max(HA.attr(id, "min_temp", 16), Math.min(HA.attr(id, "max_temp", 30), pedida + Number(b.dataset.d) * passo));
        quando = Date.now();
        node.querySelector(".alvo").textContent = fmt.n(pedida, 1);
        clearTimeout(espera);
        espera = setTimeout(() => HA.call("climate", "set_temperature", id, { temperature: pedida }), 500);
      }),
    );
    const MODO = { off: "Desligado", cool: "A arrefecer", heat: "A aquecer", auto: "Automático", heat_cool: "Automático", fan_only: "Só ventilação", dry: "Desumidificar" };
    return bind(node, entre([id]), () => {
      const s = HA.get(id) || { state: "off" };
      sw.definir(s.state !== "off");
      if (Date.now() - quando > 1500) pedida = HA.attr(id, "temperature", pedida);
      node.querySelector(".alvo").textContent = fmt.n(pedida, 1);
      node.querySelector(".modo").textContent = MODO[s.state] || s.state;
      node.classList.toggle("ligado", s.state !== "off");
      node.classList.toggle("quente", s.state === "heat");
    });
  }

  /** A divisão aberta no painel: tudo o que tem, com controlos. */
  function painelDaDivisao(r, fechar) {
    const node = el('<div class="pp-conteudo"></div>');
    const cab = el(`<div class="pp-topo"><div class="pp-cab">
      <div class="t3">${esc(r.name)}</div>
      <div class="row"><button class="pill abrir">Abrir ${icon("chev", "ic-s")}</button>
        <button class="iconbtn fechar" aria-label="Fechar">${icon("plus", "ic-s")}</button></div></div>
      <div class="ft sub"></div></div>`);
    cab.querySelector(".fechar .ic").style.transform = "rotate(45deg)";
    cab.querySelector(".fechar").addEventListener("click", fechar);
    cab.querySelector(".abrir").addEventListener("click", () => (location.hash = `#/divisoes/${r.id}`));
    bind(cab, entre(idsDe(r)), () => {
      const t = r.temperature ? HA.num(r.temperature) : null;
      const h = r.humidity ? HA.num(r.humidity) : null;
      const partes = [];
      if (t !== null) partes.push(`${fmt.n(t, 1)} °C`);
      if (h !== null) partes.push(`${fmt.n(h)} % de humidade`);
      cab.querySelector(".sub").textContent = partes.join(" · ") || nomePiso(r.floor);
    });
    node.appendChild(cab);

    const secoes = el('<div class="pp-secoes"></div>');
    if (luzes(r).length) {
      const g = el('<div class="pp-luzes"></div>');
      luzes(r).forEach((id) => g.appendChild(luzEmMosaico(r, id)));
      secoes.appendChild(secao("Luzes", [g]));
    }
    if (estores(r).length) {
      const sliders = estores(r).map((id) => {
        let quando = 0;
        const s = K.slider({
          rotulo: K.rotuloEstore ? K.rotuloEstore(r, id) : "Estore", tipo: "estore", valor: posicao(id),
          aoLargar: (v) => {
            quando = Date.now();
            HA.call("cover", "set_cover_position", id, { position: v });
          },
        });
        s.classList.add("compacto");
        return bind(s, entre([id]), () => Date.now() - quando > 1500 && s.definir(posicao(id)));
      });
      secoes.appendChild(secao("Estores", sliders));
    }
    if (r.climate) secoes.appendChild(secao("Clima", [climaCompacto(r)]));
    const outros = [];
    // o movimento já se vê na planta, como uma onda
    const lista = K.listaDaDivisao ? K.listaDaDivisao(r, { movimento: false }) : null;
    if (lista) outros.push(lista);
    if (r.camera) {
      const li = K.linha("camera", "Câmara", "");
      const b = el('<button class="pill">Ver</button>');
      b.addEventListener("click", () => K.ampliar({ entidade: r.camera, nome: r.name }));
      li.appendChild(b);
      const g = el('<div class="grouped"></div>');
      g.appendChild(li);
      outros.push(g);
    }
    if (outros.length) secoes.appendChild(secao("Mais", outros));
    node.appendChild(secoes);
    return node;
  }

  /** Apagar e fechar tudo o que há no piso — só aparece o que há para fazer. */
  function acoesDoPiso(piso) {
    const rs = piso.zonas.map(divisaoDe).filter(Boolean);
    const todasL = rs.flatMap(luzes);
    const todosE = rs.flatMap(estores);
    const acoes = el('<div class="pp-acoes"></div>');
    const apagar = el(`<button class="pill">${icon("bulb", "ic-s")}<span></span></button>`);
    apagar.addEventListener("click", () => HA.call("light", "turn_off", todasL));
    const fechar = el(`<button class="pill">${icon("blinds", "ic-s")}<span></span></button>`);
    fechar.addEventListener("click", () => HA.call("cover", "close_cover", todosE));
    acoes.append(apagar, fechar);
    return bind(acoes, entre([...todasL, ...todosE]), () => {
      const n = todasL.filter((l) => HA.isOn(l)).length;
      const a = todosE.filter((c) => posicao(c) > 0).length;
      apagar.hidden = !n;
      fechar.hidden = !a;
      apagar.lastChild.textContent = n === 1 ? "Apagar a luz" : `Apagar ${fmt.n(n)} luzes`;
      fechar.lastChild.textContent = a === 1 ? "Fechar o estore" : `Fechar ${fmt.n(a)} estores`;
    });
  }

  const ESTADO_ROBO = { cleaning: "A limpar", returning: "A voltar à base", paused: "Em pausa", docked: "Na base", idle: "Parado", error: "Com um problema" };

  /** O robô, no painel: onde anda, a bateria, e o que se lhe pode pedir. */
  function painelDoRobo(fechar) {
    const id = ROBO.entidade;
    const node = el(`<div class="pp-conteudo">
      <div class="pp-cab"><div><div class="t3">${esc(HA.name(id, "Robô aspirador"))}</div><div class="ft sub"></div></div>
        <button class="iconbtn fechar" aria-label="Fechar">${icon("plus", "ic-s")}</button></div></div>`);
    node.querySelector(".fechar .ic").style.transform = "rotate(45deg)";
    node.querySelector(".fechar").addEventListener("click", fechar);
    const g = el('<div class="grouped"></div>');
    const onde = K.linha("rooms", "Divisão", "");
    const bat = K.linha("battery", "Bateria", "");
    const area = K.linha("robot", "Área limpa", "");
    g.append(onde, bat, area);
    const acoes = el(`<div class="pp-acoes">
      <button class="pill on" data-s="start">Limpar</button>
      <button class="pill" data-s="pause">Pausa</button>
      <button class="pill" data-s="return_to_base">Voltar à base</button></div>`);
    acoes.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => HA.call("vacuum", b.dataset.s, id)));
    node.append(secao("Agora", [g]), acoes);
    return bind(node, entre([id]), () => {
      const s = (HA.get(id) || {}).state;
      const d = divisoes().find((q) => q.id === HA.attr(id, "divisao"));
      node.querySelector(".sub").textContent = ESTADO_ROBO[s] || s || "";
      onde.querySelector(".vl").textContent = d ? d.name : s === "docked" ? "Na base" : "—";
      bat.querySelector(".vl").textContent = `${fmt.n(HA.attr(id, "bateria", 0))} %`;
      area.querySelector(".vl").textContent = `${fmt.n(HA.attr(id, "area_limpa", 0), 1)} m²`;
      acoes.querySelector('[data-s="start"]').disabled = s === "cleaning";
      acoes.querySelector('[data-s="pause"]').disabled = s !== "cleaning";
      acoes.querySelector('[data-s="return_to_base"]').disabled = s === "docked" || s === "returning";
    });
  }

  /** No telemóvel, sem nada escolhido: a lista do piso, para escolher com o dedo. */
  function painelDoPiso(piso, escolher) {
    const rs = piso.zonas.map(divisaoDe).filter(Boolean);
    const node = el('<div class="pp-conteudo"></div>');
    const lista = el('<div class="grouped pp-lista"></div>');
    rs.forEach((r) => {
      const b = el(`<button class="li pp-div"><span class="ig">${icon("rooms", "ic-s")}</span>
        <span class="nm">${esc(r.name)}</span><span class="vl"></span>${icon("chev", "ic-s")}</button>`);
      b.addEventListener("click", () => escolher(r.id));
      bind(b, entre(idsDe(r)), () => {
        const partes = [];
        const t = r.temperature ? HA.num(r.temperature) : null;
        if (t !== null) partes.push(`${fmt.n(t, 1)}°`);
        const n = acesasDe(r).length;
        if (n) partes.push(n === 1 ? "1 acesa" : `${fmt.n(n)} acesas`);
        b.querySelector(".vl").textContent = partes.join(" · ");
        b.querySelector(".ig").style.color = n ? "var(--solar)" : "";
      });
      lista.appendChild(b);
    });
    node.append(secao("Divisões", [lista]), acoesDoPiso(piso));
    if (ROBO.entidade && PL.robo && PL.robo.piso === piso.id) {
      const b = el(`<button class="li pp-div"><span class="ig">${icon("robot", "ic-s")}</span>
        <span class="nm">Robô aspirador</span><span class="vl"></span>${icon("chev", "ic-s")}</button>`);
      b.addEventListener("click", () => escolher("robo"));
      bind(b, entre([ROBO.entidade]), () => (b.querySelector(".vl").textContent = ESTADO_ROBO[(HA.get(ROBO.entidade) || {}).state] || ""));
      const g = el('<div class="grouped"></div>');
      g.appendChild(b);
      node.appendChild(g);
    }
    return node;
  }

  // ───────── Vista ─────────

  function resumo(piso) {
    const rs = piso.zonas.map(divisaoDe).filter(Boolean);
    const n = rs.reduce((t, r) => t + acesasDe(r).length, 0);
    const a = rs.reduce((t, r) => t + abertosDe(r).length, 0);
    const temps = rs.map((r) => (r.temperature ? HA.num(r.temperature) : null)).filter((t) => t !== null);
    const partes = [n ? `${fmt.n(n)} ${n === 1 ? "luz acesa" : "luzes acesas"}` : "Luzes apagadas"];
    if (rs.some((r) => estores(r).length)) partes.push(a ? `${fmt.n(a)} ${a === 1 ? "estore aberto" : "estores abertos"}` : "estores fechados");
    if (temps.length) partes.push(`${fmt.n(temps.reduce((t, v) => t + v, 0) / temps.length, 1)} °C em média`);
    return partes.join(" · ");
  }

  function planta(args) {
    const naMao = ecra() === "mao";
    // chega-se de um aviso com a divisão no endereço: abre no piso dela, já escolhida
    const pedida = args && args[0] && divisoes().find((d) => d.id === args[0]);
    if (pedida && pisoDe(pedida.id)) {
      pisoAtual = pisoDe(pedida.id);
      escolhida = pedida.id;
    }
    const raiz = el(`<div class="${naMao ? "scroll " : ""}pad col grow planta-vista"></div>`);
    if (!PISOS.length) {
      raiz.appendChild(el('<div class="empty"><div class="et">Esta casa não tem planta</div><div class="es">A planta é desenhada por instalação. Sem ela, a casa vê-se pelas Divisões.</div></div>'));
      return raiz;
    }
    if (!pisoAtual || !PISOS.some((p) => p.id === pisoAtual)) pisoAtual = PISOS[0].id;
    const piso = () => PISOS.find((p) => p.id === pisoAtual);

    const head = el('<div class="head"><div><div class="t2">Planta</div><div class="ft resumo"></div></div></div>');
    const direita = el('<div class="row pl-cab"></div>');
    let seg;
    let acoes = null;
    const mudaPiso = (id) => {
      if (id === pisoAtual) return;
      pisoAtual = id;
      escolhida = null;
      seg.definir(PISOS.findIndex((p) => p.id === id));
      desenha();
    };
    seg = K.segmentado(PISOS.map((p) => nomePiso(p.id)), PISOS.findIndex((p) => p.id === pisoAtual), (i) => mudaPiso(PISOS[i].id), { cheio: naMao });
    if (naMao) raiz.append(head, seg);
    else {
      direita.appendChild(seg);
      head.appendChild(direita);
      raiz.appendChild(head);
    }

    const corpo = el('<div class="planta-corpo grow"></div>');
    const palco = el('<div class="pl-palco"></div>');
    const quadro = el('<div class="pl-quadro"></div>');
    palco.appendChild(quadro);
    const painel = el('<aside class="pl-painel" aria-label="Divisão"></aside>');
    corpo.append(palco, painel);
    raiz.appendChild(corpo);

    // A planta tem proporção fixa: o quadro é o maior retângulo com ela que
    // cabe no palco. Na parede e na TV o painel só abre quando se escolhe uma
    // divisão, e a planta encolhe para lhe dar lugar; no telemóvel vai por baixo.
    const ajusta = () => {
      const p = piso();
      if (!p) return;
      const prop = (p.largura + MARGEM * 2) / (p.altura + MARGEM * 2);
      const w = palco.clientWidth;
      const h = naMao ? w / prop : palco.clientHeight;
      const qw = Math.max(0, Math.min(w, h * prop));
      quadro.style.width = `${qw}px`;
      quadro.style.height = `${qw / prop}px`;
      // pequeno demais para bolinhas de dedo: ficam só os nomes (os controlos estão no painel)
      quadro.classList.toggle("apertado", qw < 640);
    };
    new ResizeObserver(ajusta).observe(palco);

    const escopoDesenho = K.escopo();
    const escopoPainel = K.escopo();

    const pintaPainel = () => {
      K.esvaziar(escopoPainel);
      painel.innerHTML = "";
      const r = escolhida && divisoes().find((d) => d.id === escolhida);
      const fecha = () => escolher(null);
      K.dentro(escopoPainel, () => {
        if (escolhida === "robo") painel.appendChild(painelDoRobo(fecha));
        else if (r) painel.appendChild(painelDaDivisao(r, fecha));
        else if (naMao) painel.appendChild(painelDoPiso(piso(), escolher));
      });
      // A planta muda de tamanho de uma vez; o movimento é o do painel, que
      // desliza. (Uma animação da própria planta ficava presa a meio ao chegar
      // por um endereço — desfocada ou meio apagada.)
      corpo.classList.toggle("com-painel", !!painel.children.length);
      quadro.querySelectorAll(".pl-zona, .pl-robo").forEach((z) => z.classList.toggle("escolhida", z.dataset.z === escolhida));
      if (escolhida && naMao) painel.scrollIntoView({ behavior: reduzido() ? "auto" : "smooth", block: "start" });
      setTimeout(ajusta, 0);
    };
    const escolher = (id, outroPiso) => {
      if (outroPiso) return mudaPiso(outroPiso);
      escolhida = id === escolhida ? null : id;
      pintaPainel();
    };

    const desenha = () => {
      K.esvaziar(escopoDesenho);
      quadro.innerHTML = "";
      const p = piso();
      K.dentro(escopoDesenho, () => {
        const svg = criar("svg", {
          class: "planta", viewBox: `${-MARGEM} ${-MARGEM} ${p.largura + MARGEM * 2} ${p.altura + MARGEM * 2}`,
          preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true",
        });
        const defs = criar("defs", {}, svg);
        desenhaPiso(p, svg, defs);
        quadro.append(svg, camadaDeCima(p, escolher));
        bind(head, () => true, () => (head.querySelector(".resumo").textContent = resumo(p)));
        if (!naMao) {
          if (acoes) acoes.remove();
          acoes = acoesDoPiso(p);
          direita.insertBefore(acoes, seg);
        }
      });
      pintaPainel();
    };
    desenha();
    fecharPainel = () => document.contains(raiz) && escolhida && escolher(null);
    return raiz;
  }

  /**
   * A casa em miniatura, para a Casa: o piso desenhado com as luzes acesas, sem
   * mãos nem nomes. `destacar(ids)` marca as divisões de que se está a falar
   * (um aviso), sem redesenhar — os ouvintes criam-se uma vez, aqui.
   */
  function miniatura(pisoId) {
    const piso = PISOS.find((p) => p.id === pisoId) || PISOS[0];
    const caixa = el('<div class="pl-mini"></div>');
    if (!piso) return { node: caixa, destacar() {}, piso: null };
    const svg = criar("svg", {
      class: "planta", viewBox: `${-MARGEM} ${-MARGEM} ${piso.largura + MARGEM * 2} ${piso.altura + MARGEM * 2}`,
      preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true",
    });
    const defs = criar("defs", {}, svg);
    desenhaPiso(piso, svg, defs, { mini: true });
    caixa.appendChild(svg);
    return {
      node: caixa,
      piso: piso.id,
      destacar(ids) {
        const alvo = new Set(ids || []);
        svg.querySelectorAll(".zona[data-z]").forEach((g) => g.classList.toggle("destaque", alvo.has(g.dataset.z)));
        caixa.classList.toggle("com-destaque", alvo.size > 0);
      },
    };
  }
  /** Em que piso fica uma divisão (para a Casa saber que miniatura mostrar). */
  const pisoDe = (divisaoId) => (PISOS.find((p) => p.zonas.some((z) => z.divisao === divisaoId)) || {}).id || null;
  K.plantaMiniatura = miniatura;
  K.pisoDaDivisao = pisoDe;

  // Esc fecha o painel da planta que estiver no ecrã (um só ouvinte para todas)
  let fecharPainel = null;
  document.addEventListener("keydown", (e) => e.key === "Escape" && fecharPainel && fecharPainel());

  window.VIEWS.planta = planta;
})();
