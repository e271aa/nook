/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — o kit: o que todas as secções usam.
 *
 *  Ligar um pedaço de ecrã ao estado da casa, ler a casa por divisões, e os
 *  quatro componentes que se repetem — slider, interruptor, segmentado e
 *  cartão de câmara. Uma secção que precisa de uma coisa destas vem aqui
 *  buscá-la em vez de a reescrever.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon } = window.UI;
  const HA = window.HA;
  const CFG = window.CASA.config || {};

  // ───────── Ligar ao estado ─────────
  // Tudo o que se liga desliga-se quando a secção sai do ecrã: sem isto,
  // navegar dez vezes deixava dez cópias de cada coisa a ouvir a casa.

  // Um pedaço de ecrã que se redesenha (um filtro, uma página) tem o seu
  // escopo: ao redesenhar, larga o que ouvia. Sem isto, cada clique num
  // filtro deixava mais cartões mortos a ouvir a casa.
  const geral = { ligacoes: [], relogios: [] };
  let escopos = [geral];
  let alvo = geral;

  function escopo() {
    const e = { ligacoes: [], relogios: [] };
    escopos.push(e);
    return e;
  }

  const soltar = (e) => {
    e.ligacoes.forEach((u) => u());
    e.ligacoes = [];
    e.relogios.forEach((t) => clearInterval(t));
    e.relogios = [];
  };

  /** Larga o que o escopo ouvia (mas o escopo continua a poder ser usado). */
  const esvaziar = (e) => soltar(e);

  /** Tudo o que se ligar dentro de `fn` fica no escopo `e`. */
  function dentro(e, fn) {
    const anterior = alvo;
    alvo = e;
    try {
      return fn();
    } finally {
      alvo = anterior;
    }
  }

  /** Chama `pinta` agora e sempre que mudar uma entidade que `interessa`. */
  function bind(node, interessa, pinta) {
    alvo.ligacoes.push(
      HA.subscribe((id) => {
        if (id === "*" || interessa(id)) pinta();
      }),
    );
    pinta();
    return node;
  }

  /** Interessa qualquer entidade da lista (ignora as que não existem). */
  const entre = (ids) => {
    const s = new Set(ids.filter(Boolean));
    return (id) => s.has(id);
  };

  function intervalo(fn, ms = 1000) {
    fn();
    alvo.relogios.push(setInterval(fn, ms));
  }

  function limpar() {
    escopos.forEach(soltar);
    escopos = [geral];
    alvo = geral;
  }

  // ───────── A casa, por divisões ─────────

  const ecra = () => document.documentElement.getAttribute("data-screen");
  const divisoes = () => CFG.rooms || [];
  const eGaragem = (id) => /portao|garagem/i.test(id);
  const todasLuzes = () => divisoes().flatMap((r) => r.lights || []);
  const todosEstores = () =>
    divisoes().flatMap((r) => (r.covers || []).filter((c) => !eGaragem(c)));
  const posicao = (id) => HA.attr(id, "current_position", HA.isOn(id) ? 100 : 0) || 0;
  const acesas = () => todasLuzes().filter((l) => HA.isOn(l));
  const abertos = () => todosEstores().filter((c) => posicao(c) > 0);

  const AVISOS = "sensor.avisos";
  function avisos() {
    const s = HA.get(AVISOS);
    return (s && s.attributes && s.attributes.avisos) || [];
  }
  const calmaDesde = () => {
    const s = HA.get(AVISOS);
    return (s && s.attributes && s.attributes.calma_desde) || null;
  };

  /** Quantas colunas e linhas para n cartões, sem deixar buracos. */
  function medidas(n) {
    const linhas = n <= 3 ? 1 : n <= 10 ? 2 : n <= 15 ? 3 : 4;
    return { linhas, colunas: Math.max(1, Math.ceil(n / linhas)) };
  }

  /** O ícone existe na folha? Senão, a tomada — nunca um buraco no ecrã. */
  const ico = (nome) => (nome && document.getElementById(`i-${nome}`) ? nome : "plug");

  // ───────── Slider ─────────
  // Arrasta-se com o dedo ou com o rato; com o teclado as setas afinam. O
  // comando só sai quando se larga — durante o arrasto só o desenho se mexe.

  function slider({ rotulo, tipo = "luz", valor = 0, aoLargar }) {
    const node = el(`<div class="slide${tipo === "estore" ? " nt" : ""}" role="slider" tabindex="0"
      aria-label="${esc(rotulo)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <div class="fl"></div>
      <div class="tg"><span class="dim">${esc(rotulo)}</span><span class="p num"></span></div>
    </div>`);
    const fl = node.querySelector(".fl");
    const p = node.querySelector(".p");
    let v = 0;
    let arrastar = false;
    let espera = null;

    const pinta = (x) => {
      v = Math.max(0, Math.min(100, x));
      fl.style.width = `${v}%`;
      p.textContent = `${Math.round(v)} %`;
      node.setAttribute("aria-valuenow", String(Math.round(v)));
    };
    const de = (e) => {
      const r = node.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * 100;
    };
    const larga = () => aoLargar && aoLargar(Math.round(v));

    node.addEventListener("pointerdown", (e) => {
      node.setPointerCapture(e.pointerId);
      arrastar = true;
      node.classList.add("dragging");
      pinta(de(e));
    });
    node.addEventListener("pointermove", (e) => {
      if (arrastar) pinta(de(e));
    });
    const fim = (e) => {
      if (!arrastar) return;
      arrastar = false;
      node.classList.remove("dragging");
      if (e.type === "pointerup") larga();
    };
    node.addEventListener("pointerup", fim);
    node.addEventListener("pointercancel", fim);

    node.addEventListener("keydown", (e) => {
      const passo = e.shiftKey ? 10 : 5;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") pinta(v + passo);
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown") pinta(v - passo);
      else if (e.key === "Home") pinta(0);
      else if (e.key === "End") pinta(100);
      else return;
      e.preventDefault();
      clearTimeout(espera);
      espera = setTimeout(larga, 350);
    });

    /** Põe o valor que a casa diz — mas nunca a meio de um arrasto. */
    node.definir = (x) => {
      if (!arrastar) pinta(x);
    };
    pinta(valor);
    return node;
  }

  // ───────── Interruptor ─────────

  function interruptor(rotulo) {
    const b = el(`<button class="sw" role="switch" aria-checked="false" aria-label="${esc(rotulo)}"></button>`);
    b.definir = (on) => b.setAttribute("aria-checked", String(!!on));
    return b;
  }

  // ───────── Segmentado, à maneira do iOS ─────────

  function segmentado(itens, ativo, aoEscolher, { cheio = false } = {}) {
    const node = el(`<div class="segc${cheio ? " full" : ""}"><span class="ind"></span>${itens
      .map((t, i) => `<button data-i="${i}" aria-pressed="${i === ativo}">${esc(t)}</button>`)
      .join("")}</div>`);
    const ind = node.querySelector(".ind");
    const botoes = [...node.querySelectorAll("button")];
    let primeira = true;

    const coloca = () => {
      const b = node.querySelector('[aria-pressed="true"]');
      if (!b || !b.offsetWidth) {
        ind.style.opacity = "0";
        return;
      }
      // a primeira vez põe-se no sítio sem deslizar do princípio
      if (primeira) {
        ind.style.transition = "none";
        requestAnimationFrame(() => (ind.style.transition = ""));
        primeira = false;
      }
      ind.style.opacity = "1";
      ind.style.width = `${b.offsetWidth}px`;
      ind.style.transform = `translateX(${b.offsetLeft}px)`;
    };

    node.definir = (i) => {
      botoes.forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
      coloca();
    };
    botoes.forEach((b, i) =>
      b.addEventListener("click", () => {
        node.definir(i);
        aoEscolher(i);
      }),
    );
    // o indicador só sabe onde ficar quando o segmentado já está no ecrã
    new ResizeObserver(coloca).observe(node);
    return node;
  }

  // ───────── Câmara ao vivo ─────────

  function camara({ entidade, nome, grande = false }) {
    const node = el(`<button class="camtile${grande ? " big" : ""}" aria-label="${esc(nome)}">
      <img alt="" />
      <span class="live"><i></i>AO VIVO</span>
      <span class="cl">${esc(nome)}</span>
    </button>`);
    const img = node.querySelector("img");
    intervalo(() => {
      img.src = HA.cameraUrl(entidade, Date.now());
    }, 2000);
    return node;
  }

  window.KIT = {
    CFG, AVISOS,
    bind, entre, intervalo, limpar, escopo, dentro, esvaziar, medidas,
    ecra, divisoes, eGaragem, todasLuzes, todosEstores, posicao, acesas, abertos,
    avisos, calmaDesde, ico,
    slider, interruptor, segmentado, camara,
  };
})();
