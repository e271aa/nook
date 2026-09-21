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

  function camara({ entidade, nome, grande = false, movimento = null }) {
    const node = el(`<button class="camtile${grande ? " big" : ""}" aria-label="${esc(nome)}">
      <img alt="" />
      <span class="live"><i></i>AO VIVO</span>
      <span class="mov" hidden>${icon("motion", "ic-s")}Movimento</span>
      <span class="cl">${esc(nome)}</span>
    </button>`);
    const img = node.querySelector("img");
    intervalo(() => {
      img.src = HA.cameraUrl(entidade, Date.now());
    }, 2000);
    if (movimento) {
      bind(node, entre([movimento]), () => {
        node.querySelector(".mov").hidden = !HA.isOn(movimento);
      });
    }
    node.addEventListener("click", () => ampliar({ entidade, nome }));
    return node;
  }

  /** A câmara em ecrã cheio: imagem de segundo a segundo, e Esc ou toque para sair. */
  function ampliar({ entidade, nome }) {
    fechar();
    const scrim = el('<div class="scrim"></div>');
    const caixa = el(`<div class="lightbox" role="dialog" aria-label="${esc(nome)}">
      <div class="lb-top"><span class="hd">${esc(nome)}</span>
        <button class="iconbtn" aria-label="Fechar">${icon("plus", "ic-s")}</button></div>
      <img alt="" />
    </div>`);
    const img = caixa.querySelector("img");
    const pinta = () => (img.src = HA.cameraUrl(entidade, Date.now()));
    pinta();
    const t = setInterval(pinta, 1000);
    const saiu = () => {
      clearInterval(t);
      scrim.remove();
      caixa.remove();
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("hashchange", saiu);
      aberta = null;
    };
    const tecla = (e) => e.key === "Escape" && saiu();
    scrim.addEventListener("click", saiu);
    caixa.querySelector(".iconbtn").addEventListener("click", saiu);
    document.addEventListener("keydown", tecla);
    window.addEventListener("hashchange", saiu);
    document.body.append(scrim, caixa);
    aberta = saiu;
  }
  let aberta = null;
  const fechar = () => aberta && aberta();

  // ───────── Colunas que se arrastam ─────────
  // Vieram do painel anterior, com três diferenças: pega-se com o dedo (pointer, não
  // só rato), a pega tem largura de dedo, e a casa lembra-se de onde a deixaram
  // — por tipo de ecrã, porque a parede e a TV não querem as mesmas proporções.

  const MIN_COLUNA_PX = 190; // abaixo disto uma coluna deixa de caber o que tem
  const MIN_LINHA_PX = 96; // e uma linha de câmaras deixa de se ver

  function lerLarguras(k, n) {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "null");
      if (Array.isArray(v) && v.length === n && v.every((x) => typeof x === "number" && x > 5)) return v;
    } catch (e) {
      /* modo privado, ou lixo guardado */
    }
    return null;
  }

  /**
   * Põe pegas entre as colunas de `painel` (uma grelha) e deixa arrastá-las.
   * `padrao` diz as proporções por tipo de ecrã; sem entrada para o ecrã, não
   * há pegas (é o caso do telemóvel, onde as colunas se empilham).
   */
  function colunasArrastaveis(painel, { chave, padrao, colunas, eixo = "x" }) {
    const vertical = eixo === "y"; // as mesmas pegas, para linhas em vez de colunas
    const ecraAtual = ecra();
    const base = padrao[ecraAtual];
    if (!base) return;
    // as colunas podem ser uma função: quem as troca de sítio (as câmaras) muda quem é a primeira
    const elems = () => (typeof colunas === "function" ? colunas() : colunas);
    const n = elems().length;
    const k = `casa_os_${vertical ? "rows" : "cols"}_${chave}_${ecraAtual}`;
    let larguras = lerLarguras(k, n) || base.slice();

    const medida = (c) => c.getBoundingClientRect()[vertical ? "height" : "width"];
    const aplicar = () => larguras.forEach((v, i) => painel.style.setProperty(`--${vertical ? "r" : "c"}${i}`, `${v}fr`));
    const guardar = () => {
      try {
        localStorage.setItem(k, JSON.stringify(larguras.map((v) => Math.round(v * 10) / 10)));
      } catch (e) {
        /* modo privado */
      }
    };
    aplicar();

    // o mínimo é em píxeis, não em percentagem: 20 % de uma TV e 20 % de um
    // tablet não são a mesma coluna
    const minPct = () => {
      const util = elems().reduce((t, c) => t + medida(c), 0);
      const soma = larguras.reduce((t, v) => t + v, 0);
      return util > 0 ? ((vertical ? MIN_LINHA_PX : MIN_COLUNA_PX) / util) * soma : 14;
    };

    /** O que uma coluna ganha, a vizinha perde. `de` é o ponto de partida. */
    const mover = (i, delta, de) => {
      const min = minPct();
      // encosta ao mínimo em vez de recusar: um arrasto rápido não pode ficar a meio caminho
      const d = Math.max(min - de[i], Math.min(de[i + 1] - min, delta));
      larguras = de.slice();
      larguras[i] = de[i] + d;
      larguras[i + 1] = de[i + 1] - d;
      aplicar();
    };

    for (let i = 0; i < n - 1; i++) {
      const pega = el(`<div class="colgrip${vertical ? " linha" : ""}" role="separator" tabindex="0"
        aria-orientation="${vertical ? "horizontal" : "vertical"}"
        aria-label="${vertical ? "Altura" : "Largura"} de ${i + 1} e ${i + 2}"><span></span></div>`);
      if (vertical) {
        pega.style.gridRow = String(2 * i + 2);
        pega.style.gridColumn = "1 / -1";
      } else {
        pega.style.gridColumn = String(2 * i + 2);
        pega.style.gridRow = "1";
      }

      let arrastar = false;
      let x0 = 0;
      let de = null;
      let util = 1;

      // O movimento segue-se na janela, não na pega: o dedo sai facilmente dos
      // 8 px da pega enquanto arrasta.
      const seguir = (e) => {
        if (!arrastar) return;
        const soma = de.reduce((t, v) => t + v, 0);
        mover(i, (((vertical ? e.clientY : e.clientX) - x0) / util) * soma, de);
      };
      const largar = () => {
        if (!arrastar) return;
        arrastar = false;
        window.removeEventListener("pointermove", seguir);
        window.removeEventListener("pointerup", largar);
        window.removeEventListener("pointercancel", largar);
        pega.classList.remove("dragging");
        document.body.style.userSelect = "";
        guardar();
      };
      pega.addEventListener("pointerdown", (e) => {
        arrastar = true;
        x0 = vertical ? e.clientY : e.clientX;
        de = larguras.slice();
        util = elems().reduce((t, c) => t + medida(c), 0);
        pega.classList.add("dragging");
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", seguir);
        window.addEventListener("pointerup", largar);
        window.addEventListener("pointercancel", largar);
        e.preventDefault();
      });

      // teclado: as setas afinam, Home repõe
      pega.addEventListener("keydown", (e) => {
        const passo = e.shiftKey ? 5 : 2;
        const menos = vertical ? "ArrowUp" : "ArrowLeft";
        const mais = vertical ? "ArrowDown" : "ArrowRight";
        if (e.key === menos) mover(i, -passo, larguras.slice());
        else if (e.key === mais) mover(i, passo, larguras.slice());
        else if (e.key === "Home") {
          larguras = base.slice();
          aplicar();
        } else return;
        e.preventDefault();
        guardar();
      });

      // dois toques na pega repõem tudo como estava
      pega.addEventListener("dblclick", () => {
        larguras = base.slice();
        aplicar();
        guardar();
      });
      painel.appendChild(pega);
    }
  }

  /** As mesmas pegas, para linhas. */
  const linhasArrastaveis = (painel, opcoes) => colunasArrastaveis(painel, { ...opcoes, eixo: "y" });

  /** Está sem resposta? (só quando a casa já falou connosco pelo menos uma vez) */
  const semResposta = (id) => !!id && HA.count() > 0 && HA.isUnavailable(id);

  /** Marca um cartão ou linha como sem resposta, e diz porquê a quem lê. */
  function marcarResposta(node, ids) {
    const lista = [].concat(ids).filter(Boolean);
    const mortos = lista.filter(semResposta);
    node.classList.toggle("sem-resposta", mortos.length > 0 && mortos.length === lista.length);
    if (mortos.length) node.title = "Sem resposta";
    else node.removeAttribute("title");
    return mortos.length > 0 && mortos.length === lista.length;
  }

  /** Numa lista que não rola, esconde as linhas que não cabem — nunca corta uma a meio. */
  function cabem(lista) {
    const ajusta = () => {
      [...lista.children].forEach((c) => (c.style.display = ""));
      const limite = lista.clientHeight;
      [...lista.children].forEach((c) => {
        if (c.offsetTop + c.offsetHeight > limite + 1) c.style.display = "none";
      });
    };
    lista.style.position = "relative"; // as linhas medem-se contra a lista
    new ResizeObserver(ajusta).observe(lista);
    return ajusta;
  }

  /** Uma linha de lista: ícone, nome e valor. */
  function linha(ic, nome, valor, tom) {
    return el(`<div class="li">
      <span class="ig"${tom ? ` style="color:var(--${tom})"` : ""}>${icon(ico(ic), "ic-s")}</span>
      <span class="nm">${esc(nome)}</span><span class="vl">${esc(valor || "")}</span>
    </div>`);
  }

  window.KIT = {
    CFG, AVISOS,
    bind, entre, intervalo, limpar, escopo, dentro, esvaziar, medidas,
    ecra, divisoes, eGaragem, todasLuzes, todosEstores, posicao, acesas, abertos,
    avisos, calmaDesde, ico,
    slider, interruptor, segmentado, camara, ampliar, linha, cabem, semResposta, marcarResposta, colunasArrastaveis, linhasArrastaveis,
  };
})();
