/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — a planta.
 *
 *  As pessoas não guardam a casa numa lista, guardam-na num mapa. Aqui o
 *  estado deixa de se ler e passa a ver-se: a divisão com luz acesa está
 *  acesa, o estore aberto é uma falha na parede, a temperatura está escrita
 *  dentro da divisão.
 *
 *  A planta é dados (config.json → planta): outra casa muda os números e não
 *  toca neste ficheiro. Sem esses dados, a secção não existe — é por isso que
 *  ela é opcional, e não uma promessa que só esta casa cumpre.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { CFG, bind, entre, ecra, divisoes, eGaragem, posicao, avisos } = K;

  const SVG = "http://www.w3.org/2000/svg";
  const criar = (t, attrs) => {
    const n = document.createElementNS(SVG, t);
    Object.entries(attrs || {}).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };

  const PISOS = CFG.floors || [];
  const nomePiso = (id) => (PISOS.find((f) => f.id === id) || {}).name || id;
  let pisoAtual = null;

  const divisaoDe = (z) => divisoes().find((r) => r.id === z.divisao);

  // ───────── O que cada divisão tem para mostrar ─────────

  const luzesDe = (r) => (r && r.lights) || [];
  const estoresDe = (r) => ((r && r.covers) || []).filter((c) => !eGaragem(c));
  const janelasDe = (r) => (r && r.windows) || [];

  function idsDaZona(z) {
    const r = divisaoDe(z);
    if (!r) return [];
    return [...luzesDe(r), ...(r.covers || []), r.climate, r.temperature, r.motion, r.contact, r.lock, ...janelasDe(r), K.AVISOS].filter(Boolean);
  }

  /** Quanto está aberto, de 0 a 1 — é isto que abre a falha na parede. */
  const aberturaMedia = (r) => {
    const cs = estoresDe(r);
    if (!cs.length) return 0;
    return cs.reduce((t, c) => t + posicao(c), 0) / cs.length / 100;
  };

  // ───────── Uma zona ─────────

  function zona(z, piso) {
    const r = divisaoDe(z);
    const nome = r ? r.name : z.nome || "";
    const g = criar("g", { class: `zona${z.vazia ? " vazia" : ""}${z.casa ? " casa" : ""}${r ? " tocavel" : ""}` });

    const pad = 0.6; // as paredes encostam: meia parede para cada lado
    const x = z.x + pad, y = z.y + pad, w = z.w - pad * 2, h = z.h - pad * 2;

    g.appendChild(criar("rect", { class: "chao", x, y, width: w, height: h, rx: 1.2 }));
    // a luz não é uma cor chapada: é um foco que vem do meio da divisão
    const luz = criar("rect", { class: "luz", x, y, width: w, height: h, rx: 1.2, fill: "url(#focoDeLuz)" });
    g.appendChild(luz);
    g.appendChild(criar("rect", { class: "parede", x, y, width: w, height: h, rx: 1.2 }));

    // texto: nome e, por baixo, a temperatura
    const txt = criar("text", { class: "nome", x: x + 2.4, y: y + 5.2 });
    txt.textContent = nome;
    g.appendChild(txt);
    const sub = criar("text", { class: "sub", x: x + 2.4, y: y + 9.4 });
    g.appendChild(sub);

    // marcas: janelas na parede que dá para fora, e os sinais no canto
    const janelas = criar("g", { class: "janelas" });
    g.appendChild(janelas);
    const sinais = criar("g", { class: "sinais" });
    g.appendChild(sinais);

    if (!r) {
      if (z.casa) txt.textContent = "";
      return g;
    }

    g.addEventListener("click", () => {
      location.hash = `#/divisoes/${r.id}`;
    });
    g.setAttribute("tabindex", "0");
    g.setAttribute("role", "button");
    g.setAttribute("aria-label", nome);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        location.hash = `#/divisoes/${r.id}`;
      }
    });

    /** As aberturas na parede de fora: uma por estore, mais as janelas. */
    const desenhaJanelas = () => {
      janelas.innerHTML = "";
      const buracos = [
        ...estoresDe(r).map((c) => ({ aberto: posicao(c) / 100, tipo: "estore" })),
        ...janelasDe(r).map((j) => ({ aberto: HA.isOn(j) ? 1 : 0, tipo: "janela" })),
      ];
      if (!buracos.length) return;
      const parede = z.fora || "norte";
      const horizontal = parede === "norte" || parede === "sul";
      const comprimento = horizontal ? w : h;
      const vao = Math.min(9, (comprimento - 4) / buracos.length);

      buracos.forEach((b, i) => {
        const centro = ((i + 1) / (buracos.length + 1)) * comprimento;
        const de = centro - vao / 2;
        const ate = centro + vao / 2;
        const linha = (x1, y1, x2, y2, cls) => janelas.appendChild(criar("line", { class: cls, x1, y1, x2, y2 }));
        const px = parede === "sul" ? y + h : y;
        const py = parede === "este" ? x + w : x;
        // o vão fica sempre vazio; o que está fechado ganha o traço do estore
        if (horizontal) {
          linha(x + de, px, x + ate, px, "vao");
          if (b.aberto < 1) linha(x + de, px, x + de + vao * (1 - b.aberto), px, `fecho ${b.tipo}`);
        } else {
          linha(py, y + de, py, y + ate, "vao");
          if (b.aberto < 1) linha(py, y + de, py, y + de + vao * (1 - b.aberto), `fecho ${b.tipo}`);
        }
      });
    };

    /** A porta de entrada, desenhada como se desenha numa planta: um arco. */
    const porta = criar("g", { class: "porta" });
    if (z.porta) g.appendChild(porta);
    const desenhaPorta = () => {
      if (!z.porta) return;
      porta.innerHTML = "";
      const aberta = r.contact ? HA.isOn(r.contact) : false;
      const trancada = r.lock ? (HA.get(r.lock) || {}).state === "locked" : null;
      const larg = Math.min(10, w * 0.4);
      const cx = x + w / 2 - larg / 2;
      const cy = z.fora === "sul" ? y + h : y;
      const sentido = z.fora === "sul" ? -1 : 1;
      porta.appendChild(criar("line", { class: "vao", x1: cx, y1: cy, x2: cx + larg, y2: cy }));
      // a folha e o arco: fechada assenta na parede, aberta roda para dentro
      const ang = aberta ? 75 : 5;
      const rad = (ang * Math.PI) / 180;
      porta.appendChild(criar("line", {
        class: `folha${trancada ? " trancada" : ""}`,
        x1: cx, y1: cy, x2: cx + larg * Math.cos(rad), y2: cy + sentido * larg * Math.sin(rad),
      }));
      porta.appendChild(criar("path", {
        class: "arco",
        d: `M ${cx + larg} ${cy} A ${larg} ${larg} 0 0 ${sentido > 0 ? 1 : 0} ${cx + larg * Math.cos(rad)} ${cy + sentido * larg * Math.sin(rad)}`,
      }));
    };

    /** Os sinais: ar ligado, câmara, movimento, porta. */
    const desenhaSinais = () => {
      sinais.innerHTML = "";
      let cx = x + w - 3.2;
      const cy = y + h - 3.2;
      const marca = (cls, dentro) => {
        const m = criar("g", { class: `sinal ${cls}`, transform: `translate(${cx} ${cy})` });
        m.appendChild(criar("circle", { r: 2.4 }));
        if (dentro) m.appendChild(dentro);
        sinais.appendChild(m);
        cx -= 6;
      };
      const clima = r.climate && (HA.get(r.climate) || {}).state;
      if (clima && clima !== "off") {
        const t = criar("text", { class: "mi", y: 1.4 });
        t.textContent = clima === "heat" ? "▲" : "▼";
        marca(clima === "heat" ? "quente" : "frio", t);
      }
      if (r.motion && HA.isOn(r.motion)) marca("movimento");
      if (r.camera) {
        const t = criar("text", { class: "mi", y: 1.3 });
        t.textContent = "◉";
        marca("camara", t);
      }
    };

    bind(g, entre(idsDaZona(z)), () => {
      const acesas = luzesDe(r).filter((l) => HA.isOn(l)).length;
      const brilho = luzesDe(r).length
        ? luzesDe(r).reduce((t, l) => t + (HA.isOn(l) ? Math.max(0.35, (HA.attr(l, "brightness", 255) || 255) / 255) : 0), 0) / luzesDe(r).length
        : 0;
      // quanto mais brilho, mais forte o foco — mas nunca ao ponto de comer o texto
      luz.style.opacity = acesas ? String(Math.min(0.6, 0.18 + brilho * 0.42)) : "0";
      g.classList.toggle("acesa", acesas > 0);

      const t = r.temperature ? HA.num(r.temperature) : null;
      const partes = [];
      if (t !== null) partes.push(`${fmt.n(t, 1)} °C`);
      if (r.lock) partes.push((HA.get(r.lock) || {}).state === "locked" ? "trancada" : "destrancada");
      const ab = aberturaMedia(r);
      if (estoresDe(r).length && ab > 0) partes.push(ab >= 0.99 ? "aberto" : `${fmt.n(ab * 100)} %`);
      sub.textContent = partes.join(" · ");

      const alerta = avisos().some((a) => a.divisao === r.name);
      g.classList.toggle("alerta", alerta);
      desenhaJanelas();
      desenhaSinais();
      desenhaPorta();
    });

    return g;
  }

  // ───────── Um piso ─────────

  function desenhaPiso(piso) {
    const box = el('<div class="planta-caixa"></div>');
    box.style.width = "100%";
    box.style.height = "100%";
    const svg = criar("svg", {
      class: "planta", viewBox: `-2 -2 ${piso.largura + 4} ${piso.altura + 4}`,
      preserveAspectRatio: "xMidYMid meet",
    });
    const defs = criar("defs");
    const grad = criar("radialGradient", { id: "focoDeLuz", cx: "0.5", cy: "0.42", r: "0.75" });
    grad.appendChild(criar("stop", { offset: "0", "stop-color": "var(--solar)", "stop-opacity": "0.85" }));
    grad.appendChild(criar("stop", { offset: "0.55", "stop-color": "var(--solar)", "stop-opacity": "0.35" }));
    grad.appendChild(criar("stop", { offset: "1", "stop-color": "var(--solar)", "stop-opacity": "0" }));
    defs.appendChild(grad);
    svg.appendChild(defs);
    // o contorno da casa, mais grosso do que as paredes de dentro
    svg.appendChild(criar("rect", { class: "contorno", x: -0.2, y: -0.2, width: piso.largura + 0.4, height: piso.altura + 0.4, rx: 2 }));
    piso.zonas.forEach((z) => svg.appendChild(zona(z, piso)));
    box.appendChild(svg);
    return box;
  }

  // ───────── A faixa de baixo ─────────

  function faixa() {
    const E = CFG.energy || {};
    const P = E.power || {};
    const node = el(`<div class="faixa-planta">
      <div class="hora"><span class="num h"></span><span class="ft d"></span></div>
      <div class="grow"></div>
      <div class="lado"><span class="pill estado"></span><span class="pill energia"></span></div>
    </div>`);

    K.intervalo(() => {
      const d = new Date();
      node.querySelector(".h").textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const data = d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
      node.querySelector(".d").textContent = data.charAt(0).toUpperCase() + data.slice(1);
    });

    bind(node, entre([K.AVISOS, P.home, P.solar]), () => {
      const n = avisos().length;
      const e = node.querySelector(".estado");
      e.className = `pill estado ${n ? "warn" : "on"}`;
      e.innerHTML = `${icon(n ? "alert" : "check")}${esc(n ? (n === 1 ? "Uma coisa por resolver" : `${fmt.n(n)} coisas por resolver`) : "Está tudo em ordem")}`;
      const casa = HA.num(P.home);
      const sol = HA.num(P.solar);
      node.querySelector(".energia").innerHTML =
        `${icon("bolt")}${esc(`${fmt.n(casa)} W em casa${sol > 20 ? ` · ${fmt.n(sol / 1000, 2)} kW do sol` : ""}`)}`;
    });

    return node;
  }

  // ───────── Vista ─────────

  function planta() {
    const P = CFG.planta;
    const raiz = el('<div class="pad col grow planta-vista"></div>');
    if (!P || !(P.pisos || []).length) {
      raiz.appendChild(el('<div class="empty"><div class="et">Esta casa não tem planta</div><div class="es">A planta é desenhada por instalação. Sem ela, a casa vê-se pelas Divisões.</div></div>'));
      return raiz;
    }

    const pisos = P.pisos;
    if (!pisoAtual || !pisos.some((p) => p.id === pisoAtual)) pisoAtual = pisos[0].id;

    const head = el(`<div class="head"><div><div class="t2">A casa</div>
      <div class="ft">Toca numa divisão para a abrir</div></div></div>`);
    const seg = K.segmentado(pisos.map((p) => nomePiso(p.id)), pisos.findIndex((p) => p.id === pisoAtual), (i) => {
      pisoAtual = pisos[i].id;
      desenha();
    });
    head.appendChild(seg);
    raiz.appendChild(head);

    // Na TV a planta é mais alta do que larga para o ecrã: o que sobra ao lado
    // passa a ser a faixa, em coluna, em vez de margem vazia.
    const corpo = el('<div class="planta-corpo grow"></div>');
    const palco = el('<div class="palco grow"></div>');
    corpo.append(palco, faixa());
    raiz.appendChild(corpo);

    const escopo = K.escopo();
    const desenha = () => {
      K.esvaziar(escopo);
      palco.innerHTML = "";
      K.dentro(escopo, () => palco.appendChild(desenhaPiso(pisos.find((p) => p.id === pisoAtual))));
    };
    desenha();
    return raiz;
  }

  window.VIEWS.planta = planta;
})();
