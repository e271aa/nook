/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — a planta.
 *
 *  As pessoas não guardam a casa numa lista, guardam-na num mapa. A planta
 *  de arquiteto recua (paredes cheias num cinzento baixo, móveis em traço
 *  fino) e por cima desenha-se o que está vivo: a luz de cada candeeiro como
 *  luz, na cor e no brilho que tem; o sol como a mancha que um estore aberto
 *  deixa no chão, com o comprimento que a hora lhe dá; o movimento, a rega e
 *  o robô onde estão. Nenhum estado depende só da cor: há sempre forma,
 *  ícone ou palavra.
 *
 *  Toca-se numa divisão e ela abre-se no painel ao lado; a planta não
 *  encolhe, aproxima-se da divisão. Os atalhos por cima de cada divisão só
 *  aparecem para o que está ligado (apagar as luzes, desligar a rega).
 *
 *  O desenho é texto SVG gerado dos dados, por camadas. Cada camada devolve
 *  um pedaço por chave (uma divisão, uma janela, o robô) e só se troca o que
 *  mudou: a luz funde-se ao acender e ao apagar, e as ondas e o robô não
 *  recomeçam quando outra coisa muda na casa.
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
  const criar = (tag, attrs, pai) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(n);
    return n;
  };

  const PL = CFG.planta || {};
  const PISOS = PL.pisos || [];
  const ROBO = CFG.robo || {};
  const nomePiso = (id) => ((CFG.floors || []).find((f) => f.id === id) || {}).name || id;
  const divisaoDe = (z) => divisoes().find((r) => r.id === z.divisao);
  const chave = (z) => z.divisao || (z.nome || "").toLowerCase();
  const reduzido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const escuro = () => document.documentElement.getAttribute("data-modo") !== "claro";

  let pisoAtual = null;
  let escolhida = null; // a divisão aberta no painel
  let seq = 0;
  let ultimaDivisaoRobo = null; // o robô a voltar já não diz onde está; lembra-se de onde vinha

  // ───────── O que cada divisão tem ─────────

  const luzes = (r) => (r && r.lights) || [];
  const estores = (r) => ((r && r.covers) || []).filter((c) => !eGaragem(c));
  const janelas = (r) => (r && r.windows) || [];
  const acesasDe = (r) => luzes(r).filter((l) => HA.isOn(l));
  const idsDe = (r) =>
    r
      ? [...luzes(r), ...(r.covers || []), ...janelas(r), ...(r.switches || []).map((s) => s.entity),
        r.climate, r.temperature, r.humidity, r.motion, r.contact, r.lock, K.AVISOS]
      : [];
  const eRega = (s) => s.icon === "water" || /[._]rega$/.test(s.entity);
  const regaDe = (r) => ((r && r.switches) || []).find(eRega);
  const semNome = (r, id) => {
    const n = HA.name(id).replace(new RegExp(`\\s*${r.name}\\s*`, "i"), " ").trim();
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : HA.name(id);
  };
  const hora = (t) => {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const temIcone = (n) => (n && document.getElementById(`i-${n}`) ? n : "alert");

  /** A cor de uma luz acesa: a que ela diz ter, senão a de uma lâmpada quente. */
  function corDaLuz(id) {
    const c = HA.attr(id, "rgb_color");
    return Array.isArray(c) && c.length === 3 ? c.map(Math.round) : [255, 190, 120];
  }
  const brilhoDe = (id) => {
    const b = HA.attr(id, "brightness");
    return b === null || b === undefined ? 1 : Math.max(0.15, b / 255);
  };

  // ───────── Números e geometria ─────────
  // Tudo em unidades da planta: a casa tem 100 × 70 e o quadro 4 de margem.

  const f = (n) => Math.round(n * 100) / 100;
  const mix = (a, p, b) => `color-mix(in oklab, ${a} ${p}%, ${b})`;
  const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const vbDe = (piso) => ({ x: -4, y: -4, w: piso.largura + 8, h: piso.altura + 8 });
  const P2 = (p) => `${f(p[0])} ${f(p[1])}`;
  const add = (p, d, k) => [p[0] + d[0] * k, p[1] + d[1] * k];
  /** Um nome curto e estável para um gradiente: o mesmo desenho dá o mesmo nome. */
  const hash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };

  /** Um lado da divisão: onde está, de onde a onde, e para que lado fica o dentro. */
  function lado(z, s) {
    if (s === "norte") return { s, h: 1, at: z.y, a: z.x, b: z.x + z.w, n: [0, 1] };
    if (s === "sul") return { s, h: 1, at: z.y + z.h, a: z.x, b: z.x + z.w, n: [0, -1] };
    if (s === "oeste") return { s, h: 0, at: z.x, a: z.y, b: z.y + z.h, n: [1, 0] };
    return { s: "este", h: 0, at: z.x + z.w, a: z.y, b: z.y + z.h, n: [-1, 0] };
  }
  const pt = (sg, t, off = 0) => (sg.h ? [t, sg.at + sg.n[1] * off] : [sg.at + sg.n[0] * off, t]);
  const rectSeg = (sg, t1, t2, th, off = 0) =>
    sg.h ? { x: t1, y: sg.at - th / 2 - sg.n[1] * off, w: t2 - t1, h: th } : { x: sg.at - th / 2 - sg.n[0] * off, y: t1, w: th, h: t2 - t1 };
  const R = (r, style, rx = 0) => `<rect x="${f(r.x)}" y="${f(r.y)}" width="${f(r.w)}" height="${f(r.h)}" rx="${f(rx)}" style="${style}"/>`;
  const Z = (z, style, e = 0) => R({ x: z.x + e, y: z.y + e, w: z.w - 2 * e, h: z.h - 2 * e }, style);
  function caixa(zs) {
    const x = Math.min(...zs.map((z) => z.x)), y = Math.min(...zs.map((z) => z.y));
    return { x, y, w: Math.max(...zs.map((z) => z.x + z.w)) - x, h: Math.max(...zs.map((z) => z.y + z.h)) - y };
  }
  function corta(a, b, vaos) {
    const out = [];
    let s = a;
    vaos.slice().sort((p, q) => p[0] - q[0]).forEach((g) => {
      if (g[0] > s) out.push([s, g[0]]);
      s = Math.max(s, g[1]);
    });
    if (b > s) out.push([s, b]);
    return out;
  }

  /** Onde fica um ponto da divisão: o que a planta diz (um ou vários), ou o meio. */
  function pontosDe(z, id) {
    const p = (z.pontos || {})[id];
    if (!p) return [[z.x + z.w / 2, z.y + z.h / 2]];
    return (Array.isArray(p[0]) ? p : [p]).map(([x, y]) => [z.x + x, z.y + y]);
  }

  /** O enquadramento de uma divisão: a caixa dela e 4 à volta, na proporção do quadro, sem sair da casa. */
  function enquadra(z, aw, ah, VB) {
    const a = aw / ah;
    let bw = z.w + 8, bh = z.h + 8;
    if (bw / bh < a) bw = bh * a;
    else bh = bw / a;
    if (bw > VB.w) (bw = VB.w), (bh = bw / a);
    if (bh > VB.h) (bh = VB.h), (bw = bh * a);
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    return { x: cl(z.x + z.w / 2 - bw / 2, VB.x, VB.x + VB.w - bw), y: cl(z.y + z.h / 2 - bh / 2, VB.y, VB.y + VB.h - bh), w: bw, h: bh };
  }
  /** A casa inteira no quadro, centrada, com a proporção do quadro. */
  function inteira(VB, aw, ah) {
    const a = aw / ah;
    if (VB.w / VB.h < a) {
      const w = VB.h * a;
      return { x: VB.x - (w - VB.w) / 2, y: VB.y, w, h: VB.h };
    }
    const h = VB.w / a;
    return { x: VB.x, y: VB.y - (h - VB.h) / 2, w: VB.w, h };
  }

  // ───────── Aberturas: janelas, porta da rua e portão ─────────
  // Na parede de fora da divisão. As janelas repartem a parede por igual;
  // sem lista na planta, sai uma por estore da divisão.

  const vaosCache = new WeakMap();
  function vaosDoPiso(piso) {
    if (vaosCache.has(piso)) return vaosCache.get(piso);
    const ops = [];
    piso.zonas.forEach((z) => {
      if (!z.fora || z.jardim || z.casa) return;
      const r = divisaoDe(z);
      const sg = lado(z, z.fora);
      const js = z.janelas || estores(r).map((id, i) => ({ id, sensor: janelas(r)[i], largura: /porta/i.test(id) ? 15 : 9, panes: /porta/i.test(id) ? 3 : 2 }));
      js.forEach((j, i) => {
        const c = sg.a + ((i + 0.5) / js.length) * (sg.b - sg.a), w = j.largura || 9;
        ops.push({ k: "janela", z, sg, t1: c - w / 2, t2: c + w / 2, j });
      });
      if (typeof z.porta === "number") {
        const c = sg.a + z.porta * (sg.b - sg.a);
        ops.push({ k: "porta", z, sg, t1: c - 3, t2: c + 3 });
      }
      const pid = z.portao ? z.portao.id : ((r && r.covers) || []).find(eGaragem);
      if (pid) {
        const c = (sg.a + sg.b) / 2, w = (z.portao && z.portao.largura) || 16;
        ops.push({ k: "portao", z, sg, t1: c - w / 2, t2: c + w / 2, j: { id: pid } });
      }
    });
    vaosCache.set(piso, ops);
    return ops;
  }

  /** As paredes entre divisões, com as portas que têm e para que lado abrem. */
  function interiores(piso) {
    const zs = piso.zonas.filter((z) => !z.jardim && !z.casa);
    const out = [];
    for (let i = 0; i < zs.length; i++)
      for (let j = i + 1; j < zs.length; j++) {
        const a = zs[i], b = zs[j];
        let sg = null;
        if (Math.abs(a.x + a.w - b.x) < 0.01 || Math.abs(b.x + b.w - a.x) < 0.01) {
          const x = Math.abs(a.x + a.w - b.x) < 0.01 ? b.x : a.x, lo = Math.max(a.y, b.y), hi = Math.min(a.y + a.h, b.y + b.h);
          if (hi - lo > 0.1) sg = { h: 0, at: x, a: lo, b: hi, n: [0, 0] };
        } else if (Math.abs(a.y + a.h - b.y) < 0.01 || Math.abs(b.y + b.h - a.y) < 0.01) {
          const y = Math.abs(a.y + a.h - b.y) < 0.01 ? b.y : a.y, lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w);
          if (hi - lo > 0.1) sg = { h: 1, at: y, a: lo, b: hi, n: [0, 0] };
        }
        if (!sg) continue;
        const portas = [];
        (piso.portas || []).forEach(([p, q, o = {}]) => {
          const ka = chave(a), kb = chave(b);
          if (!((p === ka && q === kb) || (p === kb && q === ka))) return;
          const c = sg.a + (o.em ?? 0.5) * (sg.b - sg.a), w = o.largura || 6;
          // "para": abre para dentro da segunda divisão; "de": para dentro da primeira
          const dentro = o.abre === "de" ? (p === ka ? a : b) : (p === ka ? b : a);
          const cz = sg.h ? dentro.y + dentro.h / 2 : dentro.x + dentro.w / 2;
          portas.push({ t1: c - w / 2, t2: c + w / 2, wd: w, para: sg.h ? [0, Math.sign(cz - sg.at)] : [Math.sign(cz - sg.at), 0], passagem: !!o.passagem });
        });
        out.push({ sg, portas });
      }
    return out;
  }

  /** Uma folha de porta aberta a 80°, com o arco por onde roda. */
  function folha(sg, t1, t2, para, wd, cor, cheia, off = 0) {
    const H = pt(sg, t2, off), fecha = sg.h ? [-1, 0] : [0, -1], a = (80 * Math.PI) / 180;
    const v = [fecha[0] * Math.cos(a) + para[0] * Math.sin(a), fecha[1] * Math.cos(a) + para[1] * Math.sin(a)];
    const E = add(H, v, wd), C = pt(sg, t1, off);
    const ang = (x) => Math.atan2(x[1], x[0]);
    let dl = ang(fecha) - ang(v);
    while (dl > Math.PI) dl -= 2 * Math.PI;
    while (dl < -Math.PI) dl += 2 * Math.PI;
    const sw = dl > 0 ? 1 : 0;
    return (cheia ? `<path d="M${P2(H)}L${P2(E)}A${f(wd)} ${f(wd)} 0 0 ${sw} ${P2(C)}Z" style="fill:${cor};opacity:.22"/>` : "") +
      `<path d="M${P2(E)}A${f(wd)} ${f(wd)} 0 0 ${sw} ${P2(C)}" style="fill:none;stroke:${cor};stroke-width:.16;stroke-dasharray:.6 .5"/>` +
      `<line x1="${f(H[0])}" y1="${f(H[1])}" x2="${f(E[0])}" y2="${f(E[1])}" style="stroke:${cor};stroke-width:${cheia ? 0.55 : 0.4};stroke-linecap:round"/>`;
  }

  // ───────── Os móveis ─────────
  // Deitados, com as costas para cima; a rotação põe-nos no sítio. Traço fino
  // e pouco contraste: estão lá para se reconhecer a divisão, não para
  // competir com o que está ligado.

  function movel(t, w, h) {
    const st = "fill:none;stroke:var(--pl-movel);stroke-width:.2";
    const cheio = "fill:var(--pl-movel)";
    const PLT = "fill:none;stroke:var(--pl-planta);stroke-width:.22";
    const r = (x, y, ww, hh, rx = 0, s = st) => `<rect x="${f(x)}" y="${f(y)}" width="${f(ww)}" height="${f(hh)}" rx="${f(rx)}" style="${s}"/>`;
    const c = (x, y, rr, s = st) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rr)}" style="${s}"/>`;
    const l = (x1, y1, x2, y2, s = st) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" style="${s}"/>`;
    const m = Math.min(w, h);
    switch (t) {
      case "tapete": return r(0, 0, w, h, 0.4, "fill:none;stroke:var(--pl-movel);stroke-width:.18;stroke-dasharray:.9 .7");
      case "sofa":
      case "poltrona": {
        const b = h * 0.3, a = Math.min(w * 0.16, 1.8);
        let s = r(0, 0, w, h, 1) + l(a, b, w - a, b) + l(a, b, a, h) + l(w - a, b, w - a, h);
        if (w > 12) s += l(a + (w - 2 * a) / 3, b, a + (w - 2 * a) / 3, h) + l(a + (2 * (w - 2 * a)) / 3, b, a + (2 * (w - 2 * a)) / 3, h);
        return s;
      }
      case "tv": return r(0, 0, w, h, 0.2, cheio);
      case "movel_tv":
      case "aparador": return r(0, 0, w, h, 0.3);
      case "mesinha": return r(0, 0, w, h, m * 0.3);
      case "mesa": {
        const n = Math.max(1, Math.round(w / 6));
        let s = "";
        for (let i = 0; i < n; i++) {
          const x = ((i + 0.5) * w) / n - 1.5;
          s += r(x, 0, 3, 1.9, 0.7) + r(x, h - 1.9, 3, 1.9, 0.7);
        }
        return s + r(0, 2.3, w, h - 4.6, 0.6);
      }
      case "cama": return r(0, 0, w, h, 0.6) + r(w * 0.1, h * 0.05, w * 0.36, h * 0.13, 0.6) + r(w * 0.54, h * 0.05, w * 0.36, h * 0.13, 0.6) + l(0, h * 0.3, w, h * 0.3);
      case "cabeceira": return r(0, 0, w, h, 0.4) + c(w / 2, h / 2, m * 0.3);
      case "roupeiro": return r(0, 0, w, h, 0.2) + l(w / 2, 0, w / 2, h) + l(0.6, h / 2, w - 0.6, h / 2, st + ";stroke-dasharray:.6 .5");
      case "secretaria": return r(0, 0, w, h, 0.3) + l(w * 0.32, h * 0.3, w * 0.68, h * 0.3, "stroke:var(--pl-movel);stroke-width:.6;stroke-linecap:round");
      case "cadeira": return r(0, 0, w, h, m * 0.42) + l(w * 0.22, h * 0.16, w * 0.78, h * 0.16);
      case "banco": return c(w / 2, h / 2, m / 2);
      case "estante": {
        let s = r(0, 0, w, h, 0.2);
        const n = Math.max(2, Math.round(w / 3.4));
        for (let i = 1; i < n; i++) s += l((i * w) / n, 0, (i * w) / n, h);
        return s;
      }
      case "bancada": {
        let s = r(0, 0, w, h, 0.3);
        if (w > 16) {
          s += r(w * 0.16, h * 0.2, w * 0.12, h * 0.6, 0.6);
          const hx = w * 0.74, rr = h * 0.14;
          s += c(hx, h * 0.3, rr) + c(hx + rr * 2.6, h * 0.3, rr) + c(hx, h * 0.7, rr) + c(hx + rr * 2.6, h * 0.7, rr);
        }
        return s;
      }
      case "frigorifico": return r(0, 0, w, h, 0.3) + l(0, h * 0.72, w, h * 0.72);
      case "ilha": return r(0, 0, w, h, 0.8) + r(0.9, 0.9, w - 1.8, h - 1.8, 0.5);
      case "carro": return r(0, 0, w, h, w * 0.36) + r(w * 0.13, h * 0.24, w * 0.74, h * 0.14, 0.8) + r(w * 0.15, h * 0.72, w * 0.7, h * 0.09, 0.6);
      case "carregador": return r(0, 0, w, h, 0.4) + c(w / 2, h / 2, m * 0.22);
      case "escada": {
        let s = r(0, 0, w, h, 0.2);
        const n = Math.floor(h / 1.7);
        for (let i = 1; i < n; i++) s += l(0, (i * h) / n, w, (i * h) / n);
        return s + `<path d="M${f(w / 2)} ${f(h - 1)}V1.2M${f(w / 2 - 1.2)} 2.6 ${f(w / 2)} 1.2 ${f(w / 2 + 1.2)} 2.6" style="fill:none;stroke:var(--pl-movel);stroke-width:.28;stroke-linecap:round;stroke-linejoin:round"/>`;
      }
      case "banheira": return r(0, 0, w, h, 1.2) + r(0.8, 0.8, w - 1.6, h - 1.6, m * 0.35);
      case "lavatorio": return r(0, 0, w, h, 0.4) + `<ellipse cx="${f(w / 2)}" cy="${f(h * 0.55)}" rx="${f(w * 0.32)}" ry="${f(h * 0.3)}" style="${st}"/>`;
      case "sanita": return r(w * 0.1, 0, w * 0.8, h * 0.28, 0.3) + `<ellipse cx="${f(w / 2)}" cy="${f(h * 0.62)}" rx="${f(w * 0.4)}" ry="${f(h * 0.36)}" style="${st}"/>`;
      case "maquina": return r(0, 0, w, h, 0.5) + c(w / 2, h / 2, m * 0.32);
      case "estendal": {
        let s = r(0, 0, w, h, 0.3, "fill:none;stroke:var(--pl-movel);stroke-width:.18;stroke-dasharray:.8 .6");
        for (let i = 1; i < 5; i++) s += l(0.6, (i * h) / 5, w - 0.6, (i * h) / 5);
        return s;
      }
      case "deck": {
        let s = r(0, 0, w, h, 0.2);
        const n = Math.round(w / 1.5);
        for (let i = 1; i < n; i++) s += l((i * w) / n, 0, (i * w) / n, h, "stroke:var(--pl-movel);stroke-width:.12");
        return s;
      }
      case "caminho": return r(0, 0, w, h, 0, "fill:var(--pl-caminho)");
      case "arvore": return c(w / 2, h / 2, m / 2, PLT) + c(w / 2, h / 2, m * 0.31, PLT + ";stroke-dasharray:.7 .6;opacity:.75") + c(w / 2, h / 2, 0.45, "fill:var(--pl-planta)");
      case "sebe": {
        const v = h > w;
        return r(0, 0, w, h, m / 2, PLT) + (v ? l(w / 2, m / 2, w / 2, h - m / 2, PLT + ";stroke-dasharray:.7 .6") : l(m / 2, h / 2, w - m / 2, h / 2, PLT + ";stroke-dasharray:.7 .6"));
      }
      default: return r(0, 0, w, h, 0.3);
    }
  }
  function moveisDe(z, mini) {
    return (z.moveis || [])
      .slice()
      .sort((a, b) => (a[0] === "caminho" ? 0 : 1) - (b[0] === "caminho" ? 0 : 1))
      .map(([t, x, y, w, h, rot = 0]) => {
        const deitado = Math.abs(rot) % 180 === 90;
        const lw = deitado ? h : w, lh = deitado ? w : h;
        return `<g transform="translate(${f(z.x + x + w / 2)} ${f(z.y + y + h / 2)}) rotate(${rot}) translate(${f(-lw / 2)} ${f(-lh / 2)})"${mini ? ' opacity=".7"' : ""}>${movel(t, lw, lh)}</g>`;
      })
      .join("");
  }

  // ───────── O estado da casa, lido para o desenho ─────────

  const ESTADO_PLANTA = { cleaning: "limpar", paused: "pausa", returning: "voltar", docked: "base", idle: "parado", error: "erro" };
  const nivel = (a) => (a.gravidade === "perigo" ? "danger" : "warn");

  /** O que está aceso, aberto e a mexer num piso, num formato que o desenho entende. */
  function estado(piso, extra = {}) {
    const S = { luzes: {}, estores: {}, abertas: {}, mov: {}, rega: {}, portas: {}, avisos: {}, robo: null, sol: null, offline: null };
    if (HA.status !== "online" && HA.ultimoContacto()) S.offline = hora(HA.ultimoContacto());
    const sol = HA.get("sun.sun");
    if (sol && extra.sol !== false) S.sol = { az: Number(sol.attributes.azimuth), el: Number(sol.attributes.elevation) };
    const avs = avisos();
    piso.zonas.forEach((z) => {
      const r = divisaoDe(z);
      if (!r) return;
      const k = chave(z);
      acesasDe(r).forEach((id) => (S.luzes[id] = [...corDaLuz(id), brilhoDe(id)]));
      (r.covers || []).forEach((id) => (S.estores[id] = posicao(id)));
      janelas(r).forEach((id) => (S.abertas[id] = HA.isOn(id)));
      if (r.motion && HA.isOn(r.motion)) S.mov[k] = true;
      const rega = regaDe(r);
      if (rega && HA.isOn(rega.entity)) S.rega[k] = true;
      if (typeof z.porta === "number") {
        S.portas[k] = {
          aberta: r.contact ? HA.isOn(r.contact) : false,
          trancada: r.lock ? (HA.get(r.lock) || {}).state === "locked" : null,
        };
      }
      // na miniatura só se marcam as divisões de que a Casa está a falar
      if (extra.destaques && !extra.destaques.includes(r.id)) return;
      const doSitio = avs.filter((a) => a.divisao === r.name);
      const a = doSitio.find((x) => x.gravidade === "perigo") || doSitio[0];
      if (a) S.avisos[k] = { t: a.titulo, n: nivel(a), i: temIcone(a.icone) };
      else if (janelas(r).some((j) => HA.isOn(j))) S.avisos[k] = { t: "Janela aberta", n: "warn", i: "window" };
      else if (extra.destaques) S.avisos[k] = { t: "", n: "warn", i: "alert" };
    });
    const rid = ROBO.entidade;
    const rs = rid && HA.get(rid);
    if (rs) {
      const d = HA.attr(rid, "divisao");
      if (d) ultimaDivisaoRobo = d;
      S.robo = { estado: ESTADO_PLANTA[rs.state] || "parado", divisao: d || ultimaDivisaoRobo, progresso: Number(HA.attr(rid, "progresso", 0.5)) };
      const z = piso.zonas.find((q) => q.divisao === S.robo.divisao);
      if (S.robo.estado === "erro" && z && !S.avisos[chave(z)] && !extra.destaques) S.avisos[chave(z)] = { t: "Robô com erro", n: "danger", i: "robot" };
    }
    return S;
  }

  /** Os candeeiros de uma divisão, um por ponto, com a luz que têm agora. */
  const lampadas = (z, S) => luzes(divisaoDe(z)).flatMap((id) => pontosDe(z, id).map((p) => ({ id, p, on: S.luzes[id] })));
  function media(on) {
    let t = 0, c = [0, 0, 0];
    on.forEach((l) => {
      const w = l.on[3];
      t += w;
      c = c.map((v, i) => v + l.on[i] * w);
    });
    return c.map((v) => Math.round(v / t));
  }

  // ───────── O desenho, por camadas ─────────
  // Cada função devolve texto SVG. `o` leva o piso, o estado (S), o modo
  // (D: escuro), a divisão escolhida e o prefixo dos nomes (u).

  /** A luz de uma divisão: uma poça por candeeiro, recortada pelas paredes. */
  function poca(z, o) {
    const on = lampadas(z, o.S).filter((l) => l.on);
    if (!on.length) return "";
    const c = media(on);
    let defs = "";
    let g = z.jardim ? "" : Z(z, `fill:${rgb(c)};opacity:${o.D ? f(0.06 + 0.06 * on[0].on[3]) : 0.05}`);
    on.forEach((l) => {
      const [r0, g0, b0, br] = l.on, cc = rgb([r0, g0, b0]);
      const rr = (12 + 18 * br) * (o.mini ? 1.1 : 1) * (z.jardim ? 0.62 : 1);
      const stops = o.D
        ? [[0, mix(cc, 40, "white"), 0.95 * br], [0.1, cc, 0.72 * br], [0.32, cc, 0.34 * br], [0.65, cc, 0.1 * br], [1, cc, 0]]
        : [[0, cc, 0.34 * br], [0.4, cc, 0.13 * br], [1, cc, 0]];
      const corpo = `gradientUnits="userSpaceOnUse" cx="${f(l.p[0])}" cy="${f(l.p[1])}" r="${f(rr)}">` +
        stops.map((s) => `<stop offset="${s[0]}" style="stop-color:${s[1]};stop-opacity:${f(s[2])}"/>`).join("");
      const id = `${o.u}l${hash(corpo)}`;
      defs += `<radialGradient id="${id}" ${corpo}</radialGradient>`;
      g += `<circle cx="${f(l.p[0])}" cy="${f(l.p[1])}" r="${f(rr)}" fill="url(#${id})"/>`;
    });
    return `<defs>${defs}</defs><g clip-path="url(#${o.u}c${chave(z)})">${g}</g>`;
  }

  /** O ponto de cada candeeiro: aceso tem núcleo; apagado é um anel fino. */
  function fontes(z, o) {
    let s = "";
    lampadas(z, o.S).forEach((l) => {
      const [x, y] = l.p;
      if (l.on && !o.S.offline) {
        const cc = rgb(l.on);
        s += o.D
          ? `<circle cx="${f(x)}" cy="${f(y)}" r="2.4" style="fill:${cc};opacity:.3"/><circle cx="${f(x)}" cy="${f(y)}" r=".85" style="fill:${mix(cc, 45, "white")}"/>`
          : `<circle cx="${f(x)}" cy="${f(y)}" r="1.9" style="fill:${cc};opacity:.35"/><circle cx="${f(x)}" cy="${f(y)}" r=".8" style="fill:${cc};stroke:var(--label);stroke-width:.22"/>`;
      } else if (l.on) s += `<circle cx="${f(x)}" cy="${f(y)}" r=".85" style="fill:none;stroke:${rgb(l.on)};stroke-width:.25;stroke-dasharray:.4 .35"/>`;
      else if (!o.mini) s += `<circle cx="${f(x)}" cy="${f(y)}" r=".55" style="fill:none;stroke:var(--label-4);stroke-width:.2"/>`;
    });
    return s;
  }

  /** Uma onda: três anéis que se afastam do sensor (o movimento) ou do aspersor (a rega). */
  function onda(x, y, cor, tracejada, dur, parada) {
    const st = `fill:${cor};fill-opacity:.1;stroke:${cor};stroke-width:.25;${tracejada ? "stroke-dasharray:.55 .45;" : ""}`;
    const s = parada
      ? `<circle cx="${f(x)}" cy="${f(y)}" r="2.9" style="${st}opacity:.6"/>`
      : [0, 1, 2].map((i) => `<circle class="pl-onda" cx="${f(x)}" cy="${f(y)}" r="1.3" style="${st}animation-duration:${dur}s;animation-delay:${f((-i * dur) / 3)}s"/>`).join("");
    return s + (tracejada
      ? `<path d="M${f(x)} ${f(y - 0.95)}c-.55.7-.8 1.1-.8 1.4a.8.8 0 0 0 1.6 0c0-.3-.25-.7-.8-1.4z" style="fill:${cor}"/>`
      : `<circle cx="${f(x)}" cy="${f(y)}" r=".85" style="fill:${cor}"/>`);
  }
  function ondas(z, o) {
    const r = divisaoDe(z);
    const k = chave(z);
    let s = "";
    if (o.S.mov[k] && r.motion) pontosDe(z, r.motion).forEach(([x, y]) => (s += onda(x, y, "var(--tint)", false, 2.7, o.reduce)));
    const rega = regaDe(r);
    if (o.S.rega[k] && rega) pontosDe(z, rega.entity).forEach(([x, y]) => (s += onda(x, y, "var(--grid)", true, 3.6, o.reduce)));
    return s;
  }

  function corpoDoRobo(olho, pausa) {
    return `<circle r="1.65" style="fill:var(--pl-robo);stroke:var(--pl-chao);stroke-width:.25"/><path d="M-1.15 -1.05A1.6 1.6 0 0 1 1.15 -1.05" style="fill:none;stroke:var(--pl-chao);stroke-width:.25"/><circle r=".62" style="fill:var(--pl-chao)"/>` +
      (pausa ? '<path d="M-.2 -.3v.6M.2 -.3v.6" style="stroke:var(--pl-robo);stroke-width:.17;stroke-linecap:round"/>' : `<circle r=".3" style="fill:${olho}"/>`);
  }

  /** O robô: o rasto do que já limpou nesta divisão e ele a percorrer a faixa atual. */
  function robo(o, zs) {
    const out = { rasto: "", robo: "", base: "" };
    const B = PL.robo && PL.robo.piso === o.piso.id ? PL.robo : null;
    if (B && !o.mini) out.base = `<rect x="${f(B.x - 1.9)}" y="${f(B.y - 0.8)}" width="3.8" height="1.6" rx=".6" style="fill:none;stroke:var(--pl-movel);stroke-width:.2"/><circle cx="${B.x}" cy="${B.y}" r=".3" style="fill:var(--good)"/>`;
    const E = o.S.robo;
    if (!E || o.mini || o.embutida) return out;
    const naBase = B && zs.find((z) => B.x >= z.x && B.x <= z.x + z.w && B.y >= z.y && B.y <= z.y + z.h);
    const z = zs.find((q) => q.divisao === E.divisao) || (E.estado !== "limpar" && E.estado !== "pausa" ? naBase : null);
    const est = E.estado;
    if (est === "limpar" && z) {
      const x1 = z.x + 3.6, x2 = z.x + z.w - 3.6, y0 = z.y + 3.8, faixas = [];
      for (let i = 0; y0 + i * 3.3 < z.y + z.h - 3; i++) faixas.push(y0 + i * 3.3);
      const k = Math.max(0, Math.min(faixas.length - 1, Math.floor(E.progresso * faixas.length)));
      let d = "";
      for (let i = 0; i <= k; i++) {
        const a = i % 2 ? x2 : x1, b = i % 2 ? x1 : x2;
        d += (i ? "L" : "M") + `${f(a)} ${f(faixas[i])}` + (i < k ? `L${f(b)} ${f(faixas[i])}` : "");
      }
      out.rasto = `<g clip-path="url(#${o.u}c${chave(z)})"><path d="${d}" style="fill:none;stroke:var(--pl-rasto);stroke-width:3.1;stroke-linecap:round;stroke-linejoin:round"/></g>`;
      const xs = k % 2 ? x2 : x1, xe = k % 2 ? x1 : x2, ly = faixas[k];
      if (o.reduce) out.robo = `<g transform="translate(${f(z.x + z.w / 2)} ${f(z.y + z.h / 2)})">${corpoDoRobo("var(--tint)")}</g>`;
      else {
        const kf = `{0%{transform:translate(${f(xs)}px,${f(ly)}px)}100%{transform:translate(${f(xe)}px,${f(ly)}px)}}`;
        const nome = `${o.u}r${hash(kf)}`;
        out.robo = `<style>@keyframes ${nome}${kf}</style><g style="animation:${nome} 12s cubic-bezier(.45,0,.55,1) infinite alternate">${corpoDoRobo("var(--tint)")}</g>`;
      }
    } else if (z && ["pausa", "parado", "erro", "voltar"].includes(est)) {
      const c = [z.x + z.w / 2, z.y + z.h / 2];
      let p = c, extra = "";
      if (est === "voltar" && B) {
        const b = [B.x, B.y - 1.9];
        p = z === naBase ? [b[0] - 9, b[1] - 6] : [c[0] + (b[0] - c[0]) * 0.3 - 5, c[1] + (b[1] - c[1]) * 0.3];
        out.rasto = `<path d="M${P2(p)}Q${f(b[0] - 4)} ${f(p[1])} ${P2(b)}" style="fill:none;stroke:var(--tint);stroke-width:.35;stroke-dasharray:.9 .7;stroke-linecap:round"/><circle cx="${f(b[0])}" cy="${f(b[1])}" r="1.65" style="fill:none;stroke:var(--tint);stroke-width:.25;stroke-dasharray:.5 .4"/>`;
      }
      if (est === "erro") extra = '<circle r="2.7" style="fill:none;stroke:var(--danger);stroke-width:.45"/>';
      out.robo = `<g transform="translate(${P2(p)})">${extra}${corpoDoRobo(est === "erro" ? "var(--danger)" : est === "voltar" ? "var(--tint)" : "var(--label-4)", est === "pausa")}</g>`;
    } else if (est === "base" && B) out.robo = `<g transform="translate(${B.x} ${f(B.y - 1.9)})">${corpoDoRobo("var(--good)")}</g>`;
    return out;
  }

  /** O sol que entra por uma janela: só por paredes viradas para ele, tão comprido quanto baixo está. */
  function sol(op, i, o) {
    const S = o.S;
    const az = (S.sol.az * Math.PI) / 180, sp = [Math.sin(az), -Math.cos(az)], d = [-sp[0], -sp[1]];
    const L = Math.min(45, 3.4 / Math.tan((S.sol.el * Math.PI) / 180));
    const fora = [-op.sg.n[0], -op.sg.n[1]];
    if (sp[0] * fora[0] + sp[1] * fora[1] <= 0.05) return "";
    const pos = op.j.id ? (S.estores[op.j.id] ?? 100) / 100 : 1;
    if (pos <= 0) return "";
    const face = (o.mini ? 2.2 : 1.4) / 2, ta = op.t1, tb = op.t1 + (op.t2 - op.t1) * pos;
    const q1 = pt(op.sg, ta, face), q2 = pt(op.sg, tb, face), q3 = add(q2, d, L), q4 = add(q1, d, L);
    const meio = [(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2], e = add(meio, d, L);
    const cor = o.D ? "var(--solar)" : mix("var(--solar)", 50, "var(--l1)");
    const corpo = `gradientUnits="userSpaceOnUse" x1="${f(meio[0])}" y1="${f(meio[1])}" x2="${f(e[0])}" y2="${f(e[1])}"><stop offset="0" style="stop-color:${cor};stop-opacity:${o.D ? 0.5 : 0.95}"/><stop offset=".45" style="stop-color:${cor};stop-opacity:${o.D ? 0.26 : 0.6}"/><stop offset="1" style="stop-color:${cor};stop-opacity:0"/>`;
    const id = `${o.u}s${hash(corpo)}`;
    let g = `<path d="M${P2(q1)}L${P2(q2)}L${P2(q3)}L${P2(q4)}Z" fill="url(#${id})"/>`;
    // os caixilhos fazem sombra: riscas da cor do chão
    const n = op.j.panes || 2;
    for (let j = 1; j < n; j++) {
      const t = op.t1 + ((op.t2 - op.t1) * j) / n;
      if (t >= tb) continue;
      const a = pt(op.sg, t, face);
      g += `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(a[0] + d[0] * L)}" y2="${f(a[1] + d[1] * L)}" style="stroke:var(--pl-chao);stroke-width:.45"/>`;
    }
    return `<defs><linearGradient id="${id}" ${corpo}</linearGradient></defs><g clip-path="url(#${o.u}c${chave(op.z)})">${g}</g>`;
  }

  /** Uma abertura na parede de fora: janela com o estore, a porta da rua, o portão. */
  function abertura(op, o) {
    const { sg, t1, t2 } = op, wd = t2 - t1, S = o.S, EXT = o.mini ? 2.2 : 1.4;
    let s = "";
    if (op.k === "janela") {
      const aberta = op.j.sensor && S.abertas[op.j.sensor];
      const pos = op.j.id ? (S.estores[op.j.id] ?? 100) / 100 : 1;
      s += R(rectSeg(sg, t1, t2, 0.4), `fill:${aberta ? "var(--warn)" : "var(--pl-vidro)"}`);
      [t1, t2].forEach((t) => (s += R(rectSeg(sg, t - 0.15, t + 0.15, EXT), "fill:var(--pl-parede)")));
      if (!o.mini && op.j.id) {
        // o estore corre numa calha por fora da parede
        const off = -(EXT / 2 + 0.75);
        s += R(rectSeg(sg, t1, t2, 1.1, off), "fill:none;stroke:var(--label-4);stroke-width:.14", 0.35);
        if (pos < 1) s += R(rectSeg(sg, t1 + wd * pos, t2, 1.1, off), "fill:var(--pl-estore)", 0.35);
      }
      if (aberta) {
        const ang = (65 * Math.PI) / 180, hw = wd / 2;
        [[t1, 1], [t2, -1]].forEach(([t, dir]) => {
          const h = pt(sg, t, 0), ao = sg.h ? [dir, 0] : [0, dir];
          const v = [ao[0] * Math.cos(ang) + sg.n[0] * Math.sin(ang), ao[1] * Math.cos(ang) + sg.n[1] * Math.sin(ang)];
          const e = add(h, v, hw), fecho = add(h, ao, hw);
          s += `<path d="M${P2(h)}L${P2(e)}L${P2(fecho)}Z" style="fill:var(--warn);opacity:.28"/><line x1="${f(h[0])}" y1="${f(h[1])}" x2="${f(e[0])}" y2="${f(e[1])}" style="stroke:var(--warn);stroke-width:${o.mini ? 0.9 : 0.55};stroke-linecap:round"/>`;
        });
      }
    } else if (op.k === "porta") {
      const p = S.portas[chave(op.z)] || {};
      const cor = p.trancada === null || p.trancada === undefined ? "var(--pl-parede-int)" : p.trancada ? "var(--good)" : "var(--warn)";
      s += p.aberta ? folha(sg, t1, t2, sg.n, wd, cor, true) : R(rectSeg(sg, t1, t2, o.mini ? 1.8 : 1.1), `fill:${cor}`, 0.3);
    } else if (op.k === "portao") {
      const pos = (S.estores[op.j.id] ?? 0) / 100, cor = pos > 0 ? "var(--warn)" : "var(--pl-estore)";
      s += R(rectSeg(sg, t1 + wd * pos, t2, EXT * 0.75), `fill:${cor}`, 0.3);
      if (pos > 0 && !o.mini) s += R(rectSeg(sg, t1, t1 + wd * pos, 0.3), "fill:var(--warn);opacity:.5");
      if (!o.mini) {
        for (let i = 1; i < 5; i++) {
          const t = t1 + (wd * i) / 5;
          if (t > t1 + wd * pos) s += R(rectSeg(sg, t - 0.1, t + 0.1, EXT * 0.75), "fill:var(--pl-chao)");
        }
      }
    }
    return s;
  }

  /** Um piso por dentro, camada a camada: [nome, {chave: svg}, fundido, estilo do invólucro]. */
  function camadasInt(o) {
    const { piso, S, D, mini, u } = o;
    const zs = piso.zonas.filter((z) => !z.jardim && !z.casa);
    const hb = caixa(zs);
    const EXT = mini ? 2.2 : 1.4, INT = mini ? 1 : 0.55;
    const ops = vaosDoPiso(piso);
    const porZona = (fn) => {
      const m = {};
      zs.forEach((z) => {
        const s = fn(z);
        if (s) m[chave(z)] = s;
      });
      return m;
    };

    const defs = { d: `<defs>${zs.map((z) => `<clipPath id="${u}c${chave(z)}">${Z(z, "")}</clipPath>`).join("")}</defs>` };

    const chao = { base: R(hb, "fill:var(--pl-chao)") + zs.filter((z) => z.vazia).map((z) => Z(z, "fill:var(--pl-chao-vazio)")).join("") };
    zs.forEach((z) => {
      const av = S.avisos[chave(z)];
      if (av) chao[`av-${chave(z)}`] = Z(z, `fill:var(--${av.n});opacity:${mini ? 0.16 : D ? 0.07 : 0.06}`);
    });
    const zSel = o.sel && zs.find((z) => z.divisao === o.sel);
    if (zSel) chao.sel = Z(zSel, `fill:var(--tint);opacity:${D ? 0.09 : 0.06}`);

    const luzDoSol = {};
    if (S.sol && S.sol.el > 0) ops.forEach((op, i) => {
      if (op.k !== "janela") return;
      const s = sol(op, i, o);
      if (s) luzDoSol[`j${i}`] = s;
    });

    const rb = robo(o, zs);

    const paredes = [];
    zs.forEach((z) => ["norte", "sul", "oeste", "este"].forEach((s) => {
      const sg = lado(z, s);
      const naBorda = sg.h ? Math.abs(sg.at - hb.y) < 0.01 || Math.abs(sg.at - hb.y - hb.h) < 0.01 : Math.abs(sg.at - hb.x) < 0.01 || Math.abs(sg.at - hb.x - hb.w) < 0.01;
      if (!naBorda) return;
      const vaos = ops.filter((op) => op.z === z && op.sg.s === s).map((op) => [op.t1, op.t2]);
      corta(sg.a - EXT / 2, sg.b + EXT / 2, vaos).forEach(([a, b]) => paredes.push(R(rectSeg(sg, a, b, EXT), "fill:var(--pl-parede)")));
    }));
    interiores(piso).forEach((w) => {
      corta(w.sg.a - INT / 2, w.sg.b + INT / 2, w.portas.map((g) => [g.t1, g.t2])).forEach(([a, b]) => paredes.push(R(rectSeg(w.sg, a, b, INT), "fill:var(--pl-parede-int)")));
      if (!mini) w.portas.forEach((g) => !g.passagem && paredes.push(folha(w.sg, g.t1, g.t2, g.para, g.wd, "var(--pl-parede-int)", false)));
    });

    const aberturas = {};
    ops.forEach((op, i) => (aberturas[`${op.k}${i}`] = abertura(op, o)));

    const vivos = {};
    if (!mini && !S.offline && !o.embutida) zs.forEach((z) => {
      if (!divisaoDe(z)) return;
      const s = ondas(z, o);
      if (s) vivos[chave(z)] = s;
    });
    if (rb.robo) vivos.robo = rb.robo;

    const cima = {};
    zs.forEach((z) => {
      const av = S.avisos[chave(z)];
      if (!av || !mini) return;
      const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
      cima[`av-${chave(z)}`] = Z(z, `fill:none;stroke:var(--${av.n});stroke-width:1.1`, 0.3) +
        `<circle cx="${f(cx)}" cy="${f(cy)}" r="5.2" style="fill:var(--${av.n})"/><path d="M${f(cx)} ${f(cy - 2.6)}v3" style="stroke:var(--pl-on-accent);stroke-width:1.2;stroke-linecap:round"/><circle cx="${f(cx)}" cy="${f(cy + 2.3)}" r=".7" style="fill:var(--pl-on-accent)"/>`;
    });
    if (zSel) cima.sel = Z(zSel, "fill:none;stroke:var(--tint);stroke-width:.5", 0.45);
    if (S.offline) cima.off = R({ x: hb.x - 1.6, y: hb.y - 1.6, w: hb.w + 3.2, h: hb.h + 3.2 }, "fill:none;stroke:var(--label-3);stroke-width:.22;stroke-dasharray:1 .8");

    return [
      ["defs", defs],
      ["chao", chao, "troca"],
      ["sol", luzDoSol, "troca", D ? "mix-blend-mode:screen" : ""],
      ["rasto", rb.rasto ? { r: rb.rasto } : {}],
      ["moveis", { m: zs.map((z) => moveisDe(z, mini)).join("") + rb.base }],
      ["luz", porZona((z) => poca(z, o)), "luz", `mix-blend-mode:${D ? "screen" : "multiply"}`],
      ["paredes", { p: paredes.join("") }],
      ["aberturas", aberturas, "troca"],
      ["fontes", porZona((z) => fontes(z, o)), "luz"],
      ["vivos", vivos],
      ["cima", cima, "troca"],
    ];
  }

  /** Todas as camadas num só texto (a casa vista do jardim). */
  const numSo = (lista) =>
    lista.map(([, m, , estilo]) => Object.values(m).map((s) => (estilo ? `<g style="${estilo}">${s}</g>` : s)).join("")).join("");

  /** O exterior: o jardim, e ao centro o rés-do-chão à escala, com as luzes que tem. */
  function camadasExt(o) {
    const { piso, D, u } = o;
    const J = piso.zonas.find((z) => z.jardim), C = piso.zonas.find((z) => z.casa);
    const k = chave(J);
    const casa = {};
    const outro = C && PISOS.find((p) => p.id === C.mostra);
    if (outro) {
      const dentro = { ...o, piso: outro, S: estado(outro, { sol: false }), embutida: true, sel: null, u: `${u}h` };
      casa.c = `<g transform="translate(${C.x} ${C.y}) scale(${f(C.w / outro.largura)})">${numSo(camadasInt(dentro))}</g>`;
    }
    const r = divisaoDe(J);
    const vivos = {};
    if (r && !o.mini && !o.S.offline) {
      const s = ondas(J, o);
      if (s) vivos[k] = s;
    }
    const luz = poca(J, o), pontos = fontes(J, o);
    return [
      ["defs", { d: `<defs><clipPath id="${u}c${k}">${Z(J, "")}</clipPath></defs>` }],
      ["chao", { base: Z(J, "fill:var(--pl-jardim)") }],
      ["moveis", { m: moveisDe(J, o.mini) }],
      ["luz", luz ? { [k]: luz } : {}, "luz", `mix-blend-mode:${D ? "screen" : "multiply"}`],
      ["paredes", { p: Z(J, "fill:none;stroke:var(--label-4);stroke-width:.25;stroke-dasharray:1.2 .9", 0.3) }],
      ["casa", casa, "troca"],
      ["fontes", pontos ? { [k]: pontos } : {}, "luz"],
      ["vivos", vivos],
    ];
  }

  // As entidades que mudam o desenho de um piso (e as do piso visto de fora).
  function doDesenho(piso) {
    const ids = [K.AVISOS, "sun.sun", ROBO.entidade];
    const junta = (p) => p.zonas.forEach((z) => {
      const r = divisaoDe(z);
      if (r) ids.push(...luzes(r), ...(r.covers || []), ...janelas(r), r.motion, r.contact, r.lock, (regaDe(r) || {}).entity);
      if (z.casa && z.mostra) {
        const o = PISOS.find((q) => q.id === z.mostra);
        if (o) junta(o);
      }
    });
    junta(piso);
    return entre(ids);
  }

  // Quem está desenhado no ecrã volta a desenhar-se quando o modo muda:
  // a luz soma-se no escuro e escurece no claro, e os gradientes não são os mesmos.
  const desenhados = new Set();
  new MutationObserver(() =>
    desenhados.forEach((d) => (d.svg.isConnected ? d.pinta() : desenhados.delete(d))),
  ).observe(document.documentElement, { attributes: true, attributeFilter: ["data-modo"] });

  const FUNDIDO = { luz: [400, 600], troca: [250, 250] };

  /** Um desenho vivo: pinta as camadas e troca só as que mudaram, com a transição de cada uma. */
  function desenho(svg, piso, opc = {}) {
    const u = `p${++seq}`;
    const camadas = new Map();
    let primeira = true;
    const extra = { sel: null, destaques: opc.mini ? [] : null };
    const troca = (c, k, s, fade, estilo) => {
      const antes = c.filhos.get(k);
      if (antes && antes.s === s) return;
      const g = criar("g", { style: estilo || null }, c.g);
      g.innerHTML = s;
      if (antes) sai(antes.g, fade);
      if (!primeira && fade) {
        g.classList.add(`pl-entra-${fade}`);
        setTimeout(() => g.classList.remove(`pl-entra-${fade}`), FUNDIDO[fade][0] + 50);
      }
      c.filhos.set(k, { g, s });
    };
    const sai = (g, fade) => {
      if (!fade || primeira) return g.remove();
      g.classList.add(`pl-sai-${fade}`);
      setTimeout(() => g.remove(), FUNDIDO[fade][1] + 50);
    };
    const d = {
      svg,
      extra,
      pinta() {
        desenhados.add(d);
        const S = estado(piso, { destaques: extra.destaques });
        const o = { piso, S, D: escuro(), mini: !!opc.mini, sel: extra.sel, reduce: reduzido() || !!S.offline, u };
        const lista = piso.zonas.some((z) => z.jardim) ? camadasExt(o) : camadasInt(o);
        lista.forEach(([nome, mapa, fade, estilo]) => {
          let c = camadas.get(nome);
          if (!c) {
            c = { g: criar("g", { class: `pl-c pl-c-${nome}` }, svg), filhos: new Map() };
            camadas.set(nome, c);
          }
          c.filhos.forEach((v, k) => {
            if (!(k in mapa)) {
              sai(v.g, fade);
              c.filhos.delete(k);
            }
          });
          for (const k in mapa) troca(c, k, mapa[k], fade, estilo);
        });
        svg.classList.toggle("sem-ligacao", !!S.offline);
        primeira = false;
      },
    };
    return d;
  }

  // ───────── A cena: o desenho, os toques e o que vai por cima ─────────
  // O "mundo" (desenho e toques) aproxima-se da divisão com translate + scale;
  // nomes, pílulas e câmaras ficam numa camada à parte, do mesmo tamanho a
  // qualquer distância, e deslizam para o sítio novo.

  function cena(piso, escolher) {
    const naTV = ecra() === "sala";
    const no = el('<div class="pl-cena"></div>');
    const mundo = el('<div class="pl-mundo"></div>');
    const svg = criar("svg", { class: "planta", preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
    const toques = el('<div class="pl-toques"></div>');
    const cima = el('<div class="pl-cima"></div>');
    mundo.append(svg, toques);
    no.append(mundo, cima);

    const d = desenho(svg, piso);
    bind(svg, doDesenho(piso), d.pinta);

    const botoes = [];
    const ancoras = [];
    const poe = (n, x, y, centro, rotulo) => {
      ancoras.push({ n, x, y, centro, rotulo });
      cima.appendChild(n);
      return n;
    };
    const pop = (n) => {
      n.classList.remove("pop");
      void n.offsetWidth;
      n.classList.add("pop");
    };

    piso.zonas.forEach((z) => {
      const r = divisaoDe(z);
      const k = chave(z);
      if (z.casa) {
        // do jardim, tocar na casa entra no rés-do-chão
        const b = el(`<button class="pl-toque" aria-label="Abrir o ${esc(nomePiso(z.mostra))}"></button>`);
        b.addEventListener("click", () => escolher(null, z.mostra));
        toques.appendChild(b);
        botoes.push({ n: b, z });
        return;
      }
      if (r) {
        const b = el(`<button class="pl-toque" aria-label="Abrir ${esc(r.name)}" aria-pressed="false" data-z="${esc(r.id)}"></button>`);
        b.addEventListener("click", () => escolher(r.id));
        toques.appendChild(b);
        botoes.push({ n: b, z });
      }

      const rot = el(`<div class="pl-rot${z.vazia || !r ? " vazia" : ""}" data-z="${esc(k)}"><span class="pl-nome">${esc(r ? r.name : z.nome || "")}</span></div>`);
      poe(rot, z.x + 1.9, z.y + 1.7, false, z);
      if (!r) return;

      const clima = el('<span class="pl-clima"></span>');
      const aviso = el('<span class="pl-av" role="img"></span>');
      const atalhos = el('<div class="pl-atalhos"></div>');
      rot.append(clima, aviso, atalhos);
      let avisoAntes = null;
      bind(rot, entre([...idsDe(r), ROBO.entidade]), () => {
        const partes = [];
        const t = r.temperature ? HA.num(r.temperature) : null;
        if (t !== null) partes.push(`${fmt.n(t, 1)}°`);
        let mais = null;
        const m = r.climate && (HA.get(r.climate) || {}).state;
        if (m && m !== "off" && m !== "unavailable") mais = m === "heat" ? "a aquecer" : m === "cool" ? "a arrefecer" : "ar ligado";
        const rs = ROBO.entidade && HA.get(ROBO.entidade);
        if (!mais && rs && rs.state === "cleaning" && HA.attr(ROBO.entidade, "divisao") === r.id) mais = "robô a limpar";
        const rega = regaDe(r);
        if (!mais && rega && HA.isOn(rega.entity)) mais = "rega ligada";
        const portao = (r.covers || []).find(eGaragem);
        const ps = portao && (HA.get(portao) || {}).state;
        if (!mais && ps && ps !== "closed") mais = { opening: "portão a abrir", closing: "portão a fechar", open: "portão aberto" }[ps] || null;
        if (mais) partes.push(partes.length ? mais : mais.charAt(0).toUpperCase() + mais.slice(1));
        clima.textContent = partes.join(" · ");

        const S = estado({ zonas: [z] });
        const av = S.avisos[k];
        const agora = av ? `${av.n}|${av.i}|${av.t}` : null;
        aviso.hidden = !av;
        if (av) {
          aviso.dataset.n = av.n;
          aviso.setAttribute("aria-label", av.t);
          aviso.innerHTML = `${icon(av.i, "ic-s")}<span>${esc(av.t)}</span>`;
          if (avisoAntes !== null && agora !== avisoAntes) pop(aviso);
        }
        avisoAntes = agora || "";
      });

      if (luzes(r).length) {
        const c = el(`<button class="pl-atalho luz"><span class="pl-pilula">${icon("bulb", "ic-s")}<span class="num"></span></span></button>`);
        // um toque apaga, e a nota em baixo deixa desfazer
        c.addEventListener("click", () => K.emMassa({ nome: `Apagar as luzes: ${r.name}`, ids: luzes(r), fazer: () => HA.call("light", "turn_off", acesasDe(r)) }));
        bind(c, entre(luzes(r)), () => {
          const n = acesasDe(r).length;
          // sem ligação à casa, um atalho não faria nada
          c.hidden = !n || HA.status !== "online";
          c.querySelector(".num").textContent = fmt.n(n);
          c.setAttribute("aria-label", n > 1 ? `Apagar ${fmt.n(n)} luzes: ${r.name}` : `Apagar a luz: ${r.name}`);
        });
        atalhos.appendChild(c);
      }
      const rega = regaDe(r);
      if (rega) {
        const c = el(`<button class="pl-atalho rega" aria-label="Desligar a rega"><span class="pl-pilula">${icon("water", "ic-s")}<span>Rega</span></span></button>`);
        c.addEventListener("click", () => K.emMassa({ nome: "Desligar a rega", ids: [rega.entity], fazer: () => HA.call("switch", "turn_off", rega.entity) }));
        bind(c, entre([rega.entity]), () => (c.hidden = !HA.isOn(rega.entity) || HA.status !== "online"));
        atalhos.appendChild(c);
      }

      // as câmaras onde estão penduradas
      Object.keys(z.pontos || {}).filter((id) => id.startsWith("camera.")).forEach((id) => {
        const cam = (CFG.cameras || []).find((c) => c.entity === id);
        const nome = cam ? cam.name : r.name;
        const b = el(`<button class="pl-cam" aria-label="Ver câmara: ${esc(nome)}"><span>${icon("camera", "ic-s")}</span></button>`);
        b.addEventListener("click", () => K.ampliar({ entidade: id, nome }));
        pontosDe(z, id).forEach(([x, y]) => poe(b, x, y, true));
      });

      // a porta da rua: fechada ou aberta, trancada ou não, dito com palavras
      if (typeof z.porta === "number" && z.fora) {
        const sg = lado(z, z.fora);
        const p = add(pt(sg, sg.a + z.porta * (sg.b - sg.a), 0), sg.n, -2.7);
        const b = el('<button class="pl-porta"><span class="pl-pilula"></span></button>');
        b.addEventListener("click", () => escolher(r.id));
        let antes = null;
        bind(b, entre([r.lock, r.contact]), () => {
          const aberta = r.contact ? HA.isOn(r.contact) : false;
          const tr = r.lock ? (HA.get(r.lock) || {}).state === "locked" : null;
          const txt = tr === null ? (aberta ? "Aberta" : "Fechada") : (aberta ? "Aberta, " : "") + (tr ? "Trancada" : "Destrancada");
          b.dataset.estado = tr === null ? (aberta ? "aberta" : "") : tr ? "trancada" : "destrancada";
          b.setAttribute("aria-label", `Porta da rua: ${aberta ? "aberta" : "fechada"}${tr === null ? "" : ` e ${tr ? "trancada" : "destrancada"}`}`);
          b.firstChild.innerHTML = `${icon(tr === false ? "unlock" : "lock", "ic-s")}<span>${txt}</span>`;
          if (antes !== null && antes !== txt) pop(b.firstChild);
          antes = txt;
        });
        poe(b, p[0], p[1], true);
      }
    });

    // o robô tem o botão na base: é por onde se lhe fala
    if (ROBO.entidade && PL.robo && PL.robo.piso === piso.id) {
      const b = el(`<button class="pl-cam pl-robo" data-z="robo" aria-label="Robô aspirador"><span>${icon("robot", "ic-s")}</span></button>`);
      b.addEventListener("click", () => escolher("robo"));
      bind(b, entre([ROBO.entidade]), () => b.classList.toggle("ativo", (HA.get(ROBO.entidade) || {}).state === "cleaning"));
      poe(b, PL.robo.x - 4.6, PL.robo.y, true);
    }

    // a seta do norte, como nos desenhos de arquitetura: é por ela que o sol
    // desenhado nas janelas bate certo com a hora
    cima.appendChild(el(`<div class="pl-norte" role="img" aria-label="Norte">N<svg viewBox="0 0 10 12" aria-hidden="true"><path d="M5 0 10 12 5 9 0 12z"/></svg></div>`));

    // sem ligação: a planta mostra o último estado conhecido e diz de quando é
    const semLig = el(`<div class="pl-sem-ligacao" role="status" hidden>${icon("wifioff", "ic-s")}<span class="bd"></span><span class="dim"></span></div>`);
    cima.appendChild(semLig);
    bind(semLig, () => false, () => {
      const t = HA.status !== "online" && HA.ultimoContacto();
      semLig.hidden = !t;
      if (t) {
        semLig.querySelector(".bd").textContent = `Sem ligação desde as ${hora(t)}`;
        semLig.querySelector(".dim").textContent = "Último estado conhecido";
      }
    });

    let temporizador = null;
    const VB = vbDe(piso);
    return {
      node: no,
      /** Põe tudo no sítio para um quadro de W × H a mostrar `vb`; `mover` anima a ida. */
      ajusta({ W, H, vb, mover }) {
        const vb0 = inteira(VB, W, H);
        if (mover && !reduzido()) {
          no.classList.add("a-mover");
          clearTimeout(temporizador);
          temporizador = setTimeout(() => no.classList.remove("a-mover"), 400);
        }
        svg.setAttribute("viewBox", `${f(vb0.x)} ${f(vb0.y)} ${f(vb0.w)} ${f(vb0.h)}`);
        mundo.style.width = `${W}px`;
        mundo.style.height = `${H}px`;
        const s0 = W / vb0.w, k = vb0.w / vb.w;
        mundo.style.transform = `translate(${f(-(vb.x - vb0.x) * s0 * k)}px, ${f(-(vb.y - vb0.y) * s0 * k)}px) scale(${f(k * 1000) / 1000})`;
        botoes.forEach(({ n, z }) => Object.assign(n.style, {
          left: `${f((z.x - vb0.x) * s0)}px`, top: `${f((z.y - vb0.y) * s0)}px`, width: `${f(z.w * s0)}px`, height: `${f(z.h * s0)}px`,
        }));
        // pequeno demais para atalhos de dedo: ficam os nomes, e avisos e cadeado só com ícone
        const s = W / vb.w;
        no.classList.toggle("compacto", s < 5.9);
        ancoras.forEach((a) => {
          // o nome e o aviso não passam para a divisão do lado
          if (a.rotulo) a.n.style.maxWidth = `${f((a.rotulo.w - 3.4) * s)}px`;
          a.n.style.transform = `translate(${f((a.x - vb.x) * s)}px, ${f((a.y - vb.y) * s)}px)${a.centro ? " translate(-50%, -50%)" : ""}`;
          const dentro = a.x >= vb.x - 0.01 && a.x <= vb.x + vb.w && a.y >= vb.y - 0.01 && a.y <= vb.y + vb.h && (!a.rotulo || a.x + 9 <= vb.x + vb.w);
          a.n.classList.toggle("fora", !dentro);
        });
      },
      selecionar(id) {
        d.extra.sel = id;
        d.pinta();
        botoes.forEach(({ n }) => n.dataset.z && n.setAttribute("aria-pressed", String(n.dataset.z === id)));
        cima.querySelectorAll(".pl-rot").forEach((n) => n.classList.toggle("escolhida", n.dataset.z === id));
        cima.querySelectorAll(".pl-robo").forEach((n) => n.classList.toggle("escolhida", id === "robo"));
      },
      naTV,
    };
  }

  // ───────── O painel ─────────

  function secao(titulo, filhos) {
    const s = el(`<section class="pp-sec"><span class="cap">${esc(titulo)}</span></section>`);
    filhos.filter(Boolean).forEach((f) => s.appendChild(f));
    return s;
  }

  /** Uma luz em mosaico, com a cor que tem: toca-se para acender ou apagar. */
  function luzEmMosaico(r, id) {
    const b = el(`<button class="pp-luz" aria-pressed="false"><span class="pp-luz-ic">${icon("bulb", "ic-s")}</span>
      <span class="pp-luz-tx"><span class="nm">${esc(semNome(r, id))}</span><span class="vl"></span></span></button>`);
    b.setAttribute("aria-label", HA.name(id));
    b.addEventListener("click", () => HA.call("light", HA.isOn(id) ? "turn_off" : "turn_on", id));
    return bind(b, entre([id]), () => {
      const on = HA.isOn(id);
      const br = HA.attr(id, "brightness");
      b.setAttribute("aria-pressed", String(on));
      b.style.setProperty("--cor-luz", on ? rgb(corDaLuz(id)) : "");
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
      <div class="row"><button class="pill abrir">Ver divisão ${icon("chev", "ic-s")}</button>
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

  /** Apagar e fechar tudo o que há no piso: só aparece o que há para fazer. */
  function acoesDoPiso(piso) {
    const rs = piso.zonas.map(divisaoDe).filter(Boolean);
    const todasL = rs.flatMap(luzes);
    const todosE = rs.flatMap(estores);
    const regas = rs.map(regaDe).filter(Boolean).map((s) => s.entity);
    const acoes = el('<div class="pp-acoes"></div>');
    const apagar = el(`<button class="pill">${icon("bulb", "ic-s")}<span></span></button>`);
    apagar.addEventListener("click", () => HA.call("light", "turn_off", todasL));
    const fechar = el(`<button class="pill">${icon("blinds", "ic-s")}<span></span></button>`);
    fechar.addEventListener("click", () => HA.call("cover", "close_cover", todosE));
    const rega = el(`<button class="pill">${icon("water", "ic-s")}<span>Desligar a rega</span></button>`);
    rega.addEventListener("click", () => HA.call("switch", "turn_off", regas));
    acoes.append(apagar, fechar, rega);
    return bind(acoes, (id) => id === "*" || todasL.includes(id) || todosE.includes(id) || regas.includes(id), () => {
      const n = todasL.filter((l) => HA.isOn(l)).length;
      const a = todosE.filter((c) => posicao(c) > 0).length;
      // sem ligação à casa não se promete o que não se pode fazer
      acoes.hidden = HA.status !== "online";
      apagar.hidden = !n;
      fechar.hidden = !a;
      rega.hidden = !regas.some((s) => HA.isOn(s));
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
      onde.querySelector(".vl").textContent = d ? d.name : s === "docked" ? "Na base" : "Sem divisão";
      bat.querySelector(".vl").textContent = `${fmt.n(HA.attr(id, "bateria", 0))} %`;
      area.querySelector(".vl").textContent = `${fmt.n(HA.attr(id, "area_limpa", 0), 1)} m²`;
      acoes.querySelector('[data-s="start"]').disabled = s === "cleaning";
      acoes.querySelector('[data-s="pause"]').disabled = s !== "cleaning";
      acoes.querySelector('[data-s="return_to_base"]').disabled = s === "docked" || s === "returning";
    });
  }

  /** O estado de uma divisão numa linha: no máximo duas coisas, a mais urgente primeiro. */
  function estadoDaLinha(z, r) {
    const S = estado({ zonas: [z] });
    const k = chave(z);
    const av = S.avisos[k];
    const n = acesasDe(r).length;
    const p = [];
    // na lista, a linha já é da divisão: "Janela da Cozinha aberta" diz-se "Janela aberta"
    if (av) p.push(av.t.replace(new RegExp(`\\s+(?:da|do|na|no|de)\\s+${r.name}\\b`, "i"), "").trim() || av.t);
    const porta = S.portas[k];
    if (porta && porta.trancada !== null) p.push(porta.trancada ? "Trancada" : "Destrancada");
    if (S.mov[k]) p.push(p.length ? "movimento" : "Movimento");
    const pid = ((r.covers || []).find(eGaragem));
    if (pid) p.push(posicao(pid) > 0 ? "Portão aberto" : "Portão fechado");
    if (n) p.push(n > 1 ? `${fmt.n(n)} acesas` : "1 acesa");
    const t = r.temperature ? HA.num(r.temperature) : null;
    if (t !== null && p.length < 2) p.push(`${fmt.n(t, 1)}°`);
    return { texto: p.slice(0, 2).join(" · "), av, n };
  }

  /** No telemóvel, sem nada escolhido: a lista do piso, para escolher com o dedo. */
  function painelDoPiso(piso, escolher) {
    const zs = piso.zonas.filter((z) => divisaoDe(z));
    const node = el('<div class="pp-conteudo"></div>');
    const lista = el('<div class="grouped pp-lista"></div>');
    zs.forEach((z) => {
      const r = divisaoDe(z);
      const b = el(`<button class="li pp-div"><span class="ig"></span>
        <span class="nm">${esc(r.name)}</span><span class="vl"></span>${icon("chev", "ic-s")}</button>`);
      b.addEventListener("click", () => escolher(r.id));
      bind(b, entre(idsDe(r)), () => {
        const e = estadoDaLinha(z, r);
        b.querySelector(".vl").textContent = e.texto;
        b.dataset.tom = e.av ? "aviso" : e.n ? "acesa" : "";
        b.querySelector(".ig").innerHTML = icon(e.av ? e.av.i : "rooms", "ic-s");
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

  /**
   * Na televisão, ao lado da planta: o que está a acontecer agora, pela ordem
   * em que interessa (luzes acesas, avisos, porta da rua, movimento, robô).
   * Lê-se do sofá; tocar numa linha abre a divisão.
   */
  function painelAgora(piso, escolher) {
    const node = el('<div class="pp-conteudo pl-agora"><span class="cap">Agora</span><div class="pl-agora-lista" role="list"></div></div>');
    const lista = node.querySelector(".pl-agora-lista");
    const cabe = K.cabem(lista);
    const zs = piso.zonas.filter((z) => divisaoDe(z));
    const linha = ({ ic, fundo, frente, t, s, abre }) => {
      const b = el(`<button class="pl-agora-li" role="listitem"><span class="pl-agora-ic">${icon(ic, "ic-s")}</span>
        <span class="pl-agora-tx"><span class="bd">${esc(t)}</span><span class="dim">${esc(s)}</span></span></button>`);
      const disco = b.querySelector(".pl-agora-ic");
      disco.style.background = fundo;
      disco.style.color = frente;
      if (abre) b.addEventListener("click", () => escolher(abre));
      else b.disabled = true;
      return b;
    };
    return bind(node, doDesenho(piso), () => {
      const S = estado(piso);
      const linhas = [];
      zs.forEach((z) => {
        const on = lampadas(z, S).filter((l) => l.on);
        if (!on.length) return;
        const n = new Set(on.map((l) => l.id)).size;
        const c = rgb(media(on));
        linhas.push({ ic: "bulb", fundo: c, frente: mix(c, 22, "black"), t: divisaoDe(z).name, s: n > 1 ? `${fmt.n(n)} luzes acesas` : "1 luz acesa", abre: z.divisao });
      });
      zs.forEach((z) => {
        const av = S.avisos[chave(z)];
        if (av) linhas.push({ ic: av.i, fundo: `var(--${av.n})`, frente: "var(--pl-on-accent)", t: av.t, s: divisaoDe(z).name, abre: z.divisao });
      });
      zs.forEach((z) => {
        const p = S.portas[chave(z)];
        if (!p || p.trancada === null) return;
        linhas.push({ ic: p.trancada ? "lock" : "unlock", fundo: p.trancada ? "var(--good)" : "var(--warn)", frente: "var(--pl-on-accent)", t: `Porta da rua ${p.trancada ? "trancada" : "destrancada"}`, s: p.aberta ? "Aberta" : "Fechada", abre: z.divisao });
      });
      zs.forEach((z) => S.mov[chave(z)] && linhas.push({ ic: "motion", fundo: "var(--tint)", frente: "var(--pl-on-accent)", t: "Movimento", s: `${divisaoDe(z).name}, agora`, abre: z.divisao }));
      if (S.robo && S.robo.estado === "limpar") {
        const z = zs.find((q) => q.divisao === S.robo.divisao);
        if (z) linhas.push({ ic: "robot", fundo: "var(--pl-pill)", frente: "var(--label)", t: "Robô a limpar", s: divisaoDe(z).name, abre: "robo" });
      }
      lista.innerHTML = "";
      if (!linhas.length) lista.appendChild(el('<div class="ft dim pl-agora-nada">Tudo apagado e fechado neste piso.</div>'));
      linhas.forEach((l) => lista.appendChild(linha(l)));
      requestAnimationFrame(cabe);
    });
  }

  // ───────── Vista ─────────

  function resumo(piso) {
    if (HA.status !== "online" && HA.ultimoContacto()) return `Sem ligação à casa desde as ${hora(HA.ultimoContacto())}`;
    const rs = piso.zonas.map(divisaoDe).filter(Boolean);
    const n = rs.reduce((t, r) => t + acesasDe(r).length, 0);
    const a = rs.reduce((t, r) => t + estores(r).filter((c) => posicao(c) > 0).length, 0);
    const temps = rs.map((r) => (r.temperature ? HA.num(r.temperature) : null)).filter((t) => t !== null);
    const partes = [n ? `${fmt.n(n)} ${n === 1 ? "luz acesa" : "luzes acesas"}` : "Luzes apagadas"];
    if (a) partes.push(`${fmt.n(a)} ${a === 1 ? "estore aberto" : "estores abertos"}`);
    if (rs.some((r) => regaDe(r) && HA.isOn(regaDe(r).entity))) partes.push("rega ligada");
    if (temps.length) partes.push(`${fmt.n(temps.reduce((t, v) => t + v, 0) / temps.length, 1)} °C em média`);
    // o resumo é do piso à vista, não da casa: diz-se qual
    const onde = piso.zonas.some((z) => z.jardim) ? "No exterior" : `No ${nomePiso(piso.id)}`;
    return `${onde}: ${partes.join(", ").replace(/^./, (c) => c.toLowerCase())}`;
  }

  function planta(args) {
    const naMao = ecra() === "mao";
    const naTV = ecra() === "sala";
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
      desenha(true);
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
    const painel = el(`<aside class="pl-painel" aria-label="${naTV ? "Agora" : "Divisão"}"></aside>`);
    corpo.append(palco, painel);
    raiz.appendChild(corpo);

    let atual = null; // a cena à vista

    // O quadro ocupa o palco (no telemóvel, a largura, com a proporção da
    // casa). Com uma divisão escolhida ao lado, a planta aproxima-se dela.
    const ajusta = (mover = false) => {
      const p = piso();
      if (!p || !atual) return;
      const VB = vbDe(p);
      const W = palco.clientWidth;
      const H = naMao ? (W * VB.h) / VB.w : palco.clientHeight;
      if (!W || !H) return;
      if (naMao) quadro.style.height = `${H}px`;
      const z = !naMao && escolhida && p.zonas.find((q) => q.divisao === escolhida);
      atual.ajusta({ W, H, vb: z ? enquadra(z, W, H, VB) : inteira(VB, W, H), mover });
    };
    new ResizeObserver(() => ajusta()).observe(palco);

    const escopoDesenho = K.escopo();
    const escopoPainel = K.escopo();

    const pintaPainel = (mover) => {
      K.esvaziar(escopoPainel);
      painel.innerHTML = "";
      const r = escolhida && divisoes().find((d) => d.id === escolhida);
      const fecha = () => escolher(null);
      K.dentro(escopoPainel, () => {
        if (escolhida === "robo") painel.appendChild(painelDoRobo(fecha));
        else if (r) painel.appendChild(painelDaDivisao(r, fecha));
        else if (naMao) painel.appendChild(painelDoPiso(piso(), escolher));
        else if (naTV) painel.appendChild(painelAgora(piso(), escolher));
      });
      corpo.classList.toggle("com-painel", !!painel.children.length);
      if (atual) atual.selecionar(escolhida);
      ajusta(mover);
      if (escolhida && naMao) painel.scrollIntoView({ behavior: reduzido() ? "auto" : "smooth", block: "start" });
    };
    const escolher = (id, outroPiso) => {
      if (outroPiso) return mudaPiso(outroPiso);
      escolhida = id === escolhida ? null : id;
      pintaPainel(true);
    };

    const desenha = (trocaDePiso = false) => {
      K.esvaziar(escopoDesenho);
      quadro.innerHTML = "";
      const p = piso();
      K.dentro(escopoDesenho, () => {
        atual = cena(p, escolher);
        if (trocaDePiso) atual.node.classList.add("entra");
        quadro.appendChild(atual.node);
        bind(head, () => true, () => (head.querySelector(".resumo").textContent = resumo(p)));
        if (!naMao) {
          if (acoes) acoes.remove();
          acoes = acoesDoPiso(p);
          direita.insertBefore(acoes, seg);
        }
      });
      pintaPainel(false);
    };
    desenha();
    fecharPainel = () => document.contains(raiz) && escolhida && escolher(null);
    return raiz;
  }

  /**
   * A casa em miniatura, para a Casa: o piso com as luzes acesas, sem mãos
   * nem nomes. `destacar(ids)` marca as divisões de que se está a falar (um
   * aviso): chão tingido, contorno e um disco com "!".
   */
  function miniatura(pisoId) {
    const piso = PISOS.find((p) => p.id === pisoId) || PISOS[0];
    const caixa = el('<div class="pl-mini"></div>');
    if (!piso) return { node: caixa, destacar() {}, piso: null };
    const VB = vbDe(piso);
    const svg = criar("svg", { class: "planta", viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
    caixa.appendChild(svg);
    const d = desenho(svg, piso, { mini: true });
    bind(svg, doDesenho(piso), d.pinta);
    return {
      node: caixa,
      piso: piso.id,
      destacar(ids) {
        d.extra.destaques = ids || [];
        d.pinta();
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
