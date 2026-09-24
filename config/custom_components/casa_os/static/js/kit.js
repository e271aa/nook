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

  const { el, esc, icon, fmt } = window.UI;
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

  // se a janela perde o foco a meio de um arrasto (outra app, um aviso do
  // sistema), o arrasto acaba ali — um só ouvinte para todos os sliders
  const arrastosVivos = new Set();
  window.addEventListener("blur", () => {
    arrastosVivos.forEach((f) => f({ type: "blur" }));
    arrastosVivos.clear();
  });

  function slider({ rotulo, tipo = "luz", valor = 0, aoLargar, exigeArrasto = false }) {
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
      // o preenchimento cresce por escala, não por largura: não mexe no layout
      fl.style.transform = `scaleX(${v / 100})`;
      // um estore fechado diz "Fechado", não "0 %"
      const r = Math.round(v);
      const texto = tipo === "estore" && r <= 0 ? "Fechado" : tipo === "estore" && r >= 100 ? "Aberto" : `${r} %`;
      p.textContent = texto;
      node.setAttribute("aria-valuenow", String(r));
      node.setAttribute("aria-valuetext", texto);
    };
    const de = (e) => {
      const r = node.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * 100;
    };
    const larga = () => aoLargar && aoLargar(Math.round(v));

    // Um slider que manda na casa inteira não obedece a um toque perdido: só
    // começa depois de o dedo andar uns píxeis. Os outros seguem o dedo logo.
    let x0 = 0;
    let antes = 0;
    let pegou = false;
    let dedo = null;
    node.addEventListener("pointerdown", (e) => {
      if (arrastar && e.pointerId !== dedo) return; // um segundo dedo não rouba o primeiro
      dedo = e.pointerId;
      try {
        node.setPointerCapture(e.pointerId);
      } catch (_) {
        // sem captura o arrasto funciona na mesma dentro do slider
      }
      arrastar = true;
      x0 = e.clientX;
      antes = v;
      pegou = !exigeArrasto;
      node.classList.add("dragging");
      if (pegou) pinta(de(e));
    });
    node.addEventListener("pointermove", (e) => {
      if (!arrastar || e.pointerId !== dedo) return;
      if (!pegou && Math.abs(e.clientX - x0) > 8) pegou = true;
      if (pegou) pinta(de(e));
    });
    const fim = (e) => {
      if (!arrastar || (e.pointerId !== undefined && e.pointerId !== dedo)) return;
      arrastar = false;
      dedo = null;
      node.classList.remove("dragging");
      if (e.type === "pointerup" && pegou) larga();
      else if (!pegou || e.type !== "pointerup") pinta(antes); // cancelado: volta ao que estava
    };
    node.addEventListener("pointerup", fim);
    node.addEventListener("pointercancel", fim);
    node.addEventListener("lostpointercapture", fim);
    node.addEventListener("pointerdown", () => arrastosVivos.add(fim));
    node.addEventListener("pointerup", () => arrastosVivos.delete(fim));

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

  // ───────── Foco preso numa janela por cima ─────────
  // O menu, a câmara ampliada, o calendário: enquanto estão abertos, o Tab
  // anda só lá dentro e o que está por trás não recebe o foco; ao fechar, o
  // foco volta para onde estava.

  const FOCAVEIS = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function prenderFoco(caixa) {
    const antes = document.activeElement;
    caixa.setAttribute("aria-modal", "true");
    const tecla = (e) => {
      if (e.key !== "Tab") return;
      const fs = [...caixa.querySelectorAll(FOCAVEIS)].filter((n) => n.offsetParent !== null);
      if (!fs.length) return;
      const i = fs.indexOf(document.activeElement);
      e.preventDefault();
      fs[(i + (e.shiftKey ? -1 : 1) + fs.length) % fs.length].focus();
    };
    document.addEventListener("keydown", tecla, true);
    const primeiro = caixa.querySelector(FOCAVEIS);
    if (primeiro) primeiro.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", tecla, true);
      if (antes && antes.isConnected && antes.focus) antes.focus({ preventScroll: true });
    };
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
    let solta = null;
    const saiu = () => {
      clearInterval(t);
      if (solta) solta();
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
    solta = prenderFoco(caixa);
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
      <span class="ig"${tom ? ` style="color:var(--${tom === 'warn' ? 'warn-fg' : tom})"` : ""}>${icon(ico(ic), "ic-s")}</span>
      <span class="nm">${esc(nome)}</span><span class="vl">${esc(valor || "")}</span>
    </div>`);
  }

  // ───────── Notas ─────────
  // Uma linha em baixo que diz o que aconteceu (ou o que não aconteceu), com
  // no máximo uma ação: Desfazer, Tentar outra vez. Uma de cada vez; os
  // leitores de ecrã ouvem-na sem perder o sítio onde estavam.

  let regiao = null;
  let notaTimer = null;
  function nota({ texto, tom = "ok", acao = null, ms }) {
    if (!regiao) {
      regiao = el('<div class="notas" role="status" aria-live="polite"></div>');
      document.body.appendChild(regiao);
    }
    clearTimeout(notaTimer);
    regiao.innerHTML = "";
    const n = el(`<div class="nota ${tom}">${icon(tom === "erro" ? "alert" : "check", "ic-s")}<span class="nt-tx"></span></div>`);
    n.querySelector(".nt-tx").textContent = texto;
    const some = () => {
      n.classList.add("sai");
      setTimeout(() => n.remove(), 200);
    };
    if (acao) {
      const b = el('<button class="nt-acao"></button>');
      b.textContent = acao.rotulo;
      b.addEventListener("click", () => {
        some();
        acao.fn();
      });
      n.appendChild(b);
    }
    regiao.appendChild(n);
    // tempo para ler e para decidir desfazer; os erros ficam mais
    notaTimer = setTimeout(some, ms || (tom === "erro" ? 8000 : acao ? 6000 : 3500));
    return n;
  }

  // ───────── Folha de confirmação ─────────
  // Só para os momentos em que um toque tem consequências: sair de casa com
  // uma janela aberta. Esc e tocar fora cancelam; o foco vai para cancelar.

  function folha({ titulo, texto = "", itens = [], confirmar = "Continuar", cancelar = "Cancelar" }) {
    return new Promise((resolve) => {
      const antesFoco = document.activeElement;
      const scrim = el('<div class="scrim"></div>');
      const caixa = el(`<div class="confirma" role="alertdialog" aria-modal="true" aria-labelledby="confirma-t" aria-describedby="confirma-d">
        <div class="t3" id="confirma-t"></div><div class="ft" id="confirma-d"></div>
        <div class="grouped confirma-itens"></div>
        <div class="confirma-botoes"><button class="pill nao"></button><button class="pill on sim"></button></div></div>`);
      caixa.querySelector("#confirma-t").textContent = titulo;
      caixa.querySelector("#confirma-d").textContent = texto;
      const lista = caixa.querySelector(".confirma-itens");
      itens.forEach((i) => lista.appendChild(linha(i.icone || "alert", i.texto, i.valor || "", i.tom || "warn")));
      if (!itens.length) lista.remove();
      caixa.querySelector(".nao").textContent = cancelar;
      caixa.querySelector(".sim").textContent = confirmar;
      const fecha = (r) => {
        document.removeEventListener("keydown", tecla, true);
        scrim.remove();
        caixa.remove();
        if (antesFoco && antesFoco.focus) antesFoco.focus();
        resolve(r);
      };
      const tecla = (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          fecha(false);
        }
        if (e.key === "Tab") {
          // o foco não sai da folha
          const bs = [...caixa.querySelectorAll("button")];
          const i = bs.indexOf(document.activeElement);
          e.preventDefault();
          bs[(i + (e.shiftKey ? -1 : 1) + bs.length) % bs.length].focus();
        }
      };
      scrim.addEventListener("click", () => fecha(false));
      caixa.querySelector(".nao").addEventListener("click", () => fecha(false));
      caixa.querySelector(".sim").addEventListener("click", () => fecha(true));
      document.addEventListener("keydown", tecla, true);
      document.body.append(scrim, caixa);
      caixa.querySelector(".nao").focus();
    });
  }

  // ───────── Fotografar e repor ─────────
  // Antes de uma ação que mexe em muita coisa, guarda-se como estava. Desfazer
  // repõe luzes, estores, ar e tomadas — a fechadura nunca: destrancar a porta
  // não é coisa que aconteça por um toque em "Desfazer".

  const DOMINIOS = ["light", "cover", "climate", "switch", "lock"];
  function fotografia(ids) {
    const lista = ids || Object.keys(HA.states).filter((id) => DOMINIOS.includes(id.split(".")[0]));
    const f = {};
    lista.forEach((id) => {
      const s = HA.get(id);
      if (s) f[id] = { state: s.state, a: { ...s.attributes } };
    });
    return f;
  }

  function mudou(antes) {
    return Object.keys(antes).filter((id) => {
      const s = HA.get(id);
      if (!s) return false;
      const d = id.split(".")[0];
      if (d === "cover") return (antes[id].a.current_position ?? null) !== (s.attributes.current_position ?? null) || antes[id].state !== s.state;
      if (d === "light") return antes[id].state !== s.state || (s.state === "on" && antes[id].a.brightness !== s.attributes.brightness);
      if (d === "climate") return antes[id].state !== s.state || antes[id].a.temperature !== s.attributes.temperature;
      return antes[id].state !== s.state;
    });
  }

  /** "3 luzes apagadas · 6 estores a fechar · porta trancada" */
  function resumoDe(antes, ids) {
    const conta = (f) => ids.filter(f).length;
    const d = (id) => id.split(".")[0];
    const agora = (id) => HA.get(id) || { state: "", attributes: {} };
    const partes = [];
    const apagadas = conta((id) => d(id) === "light" && antes[id].state === "on" && agora(id).state === "off");
    const acesas = conta((id) => d(id) === "light" && antes[id].state === "off" && agora(id).state === "on");
    const reguladas = conta((id) => d(id) === "light" && antes[id].state === "on" && agora(id).state === "on");
    const fecham = conta((id) => d(id) === "cover" && (agora(id).attributes.current_position ?? 100) < (antes[id].a.current_position ?? 100) || (d(id) === "cover" && agora(id).state === "closing"));
    const abrem = conta((id) => d(id) === "cover" && ((agora(id).attributes.current_position ?? 0) > (antes[id].a.current_position ?? 0) || agora(id).state === "opening"));
    const arOff = conta((id) => d(id) === "climate" && antes[id].state !== "off" && agora(id).state === "off");
    const arOn = conta((id) => d(id) === "climate" && antes[id].state === "off" && agora(id).state !== "off");
    const arMuda = conta((id) => d(id) === "climate") - arOff - arOn;
    const sw = ids.filter((id) => d(id) === "switch");
    const swOff = sw.filter((id) => agora(id).state === "off");
    const swOn = sw.filter((id) => agora(id).state === "on");
    // uma tomada diz-se pelo nome ("TV desligada"); várias contam-se
    const aparelhos = (lista, estado) =>
      lista.length === 1 ? `${nomeCurto(lista[0])} ${estado}` : `${fmt.n(lista.length)} aparelhos ${estado.replace(/a$/, "os")}`;
    const n = (x, um, varios) => `${fmt.n(x)} ${x === 1 ? um : varios}`;
    if (apagadas) partes.push(n(apagadas, "luz apagada", "luzes apagadas"));
    if (acesas) partes.push(n(acesas, "luz acesa", "luzes acesas"));
    if (reguladas) partes.push(n(reguladas, "luz regulada", "luzes reguladas"));
    if (fecham) partes.push(n(fecham, "estore a fechar", "estores a fechar"));
    if (abrem) partes.push(n(abrem, "estore a abrir", "estores a abrir"));
    if (arOff) partes.push(arOff === 1 ? "ar desligado" : `${fmt.n(arOff)} ares desligados`);
    if (arOn) partes.push(arOn === 1 ? "ar ligado" : `${fmt.n(arOn)} ares ligados`);
    if (arMuda) partes.push(arMuda === 1 ? "ar ajustado" : `${fmt.n(arMuda)} ares ajustados`);
    if (swOff.length) partes.push(aparelhos(swOff, "desligada"));
    if (swOn.length) partes.push(aparelhos(swOn, "ligada"));
    if (ids.some((id) => d(id) === "lock" && agora(id).state === "locked")) partes.push("porta trancada");
    // vírgulas, não pontos: uma frase lê-se melhor do que uma fila de separadores
    const frase = partes.join(", ");
    return frase;
  }

  /** O nome que a instalação deu à tomada ("TV"), senão o do Home Assistant. */
  function nomeCurto(id) {
    for (const r of divisoes()) {
      const s = (r.switches || []).find((x) => x.entity === id);
      if (s) return s.name;
    }
    return HA.name(id);
  }

  function repor(antes, ids) {
    ids.forEach((id) => {
      const a = antes[id];
      const d = id.split(".")[0];
      if (!a || d === "lock") return;
      if (d === "light") {
        if (a.state === "on") HA.call("light", "turn_on", id, a.a.brightness ? { brightness: a.a.brightness } : {});
        else HA.call("light", "turn_off", id);
      } else if (d === "switch") HA.call("switch", a.state === "on" ? "turn_on" : "turn_off", id);
      else if (d === "cover") {
        if (a.a.current_position !== undefined && a.a.current_position !== null) HA.call("cover", "set_cover_position", id, { position: a.a.current_position });
        else HA.call("cover", a.state === "open" ? "open_cover" : "close_cover", id);
      } else if (d === "climate") {
        HA.call("climate", "set_hvac_mode", id, { hvac_mode: a.state });
        if (a.a.temperature) HA.call("climate", "set_temperature", id, { temperature: a.a.temperature });
      }
    });
  }

  /**
   * Uma ação em massa com fim: faz, espera que a casa responda, diz o que
   * mudou e oferece Desfazer. `fazer` recebe nada e manda os comandos.
   */
  function emMassa({ nome, fazer, ids }) {
    const antes = fotografia(ids);
    const r = fazer();
    Promise.resolve(r).then(() =>
      setTimeout(() => {
        const alterados = mudou(antes);
        if (!alterados.length) return;
        const trancou = alterados.some((id) => id.startsWith("lock.") && (HA.get(id) || {}).state === "locked");
        nota({
          texto: `${nome}: ${resumoDe(antes, alterados)}`,
          acao: {
            rotulo: "Desfazer",
            fn: () => {
              repor(antes, alterados);
              nota({ texto: trancou ? "Desfeito. A porta continua trancada." : "Desfeito." });
            },
          },
        });
      }, 1200),
    );
  }

  window.KIT = {
    CFG, AVISOS,
    bind, entre, intervalo, limpar, escopo, dentro, esvaziar, medidas,
    ecra, divisoes, eGaragem, todasLuzes, todosEstores, posicao, acesas, abertos,
    avisos, calmaDesde, ico, prenderFoco,
    slider, interruptor, segmentado, camara, ampliar, linha, cabem, semResposta, marcarResposta, colunasArrastaveis, linhasArrastaveis,
    nota, folha, fotografia, emMassa,
  };
})();
