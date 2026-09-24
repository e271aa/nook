/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — Controlos.
 *
 *  Não é a lista de todas as luzes: isso já são as Divisões, vistas de outro
 *  ângulo. É a resposta a "vou dormir, fecha isto tudo" — ação por tipo. Em
 *  cima as ações de grupo, em baixo cada aparelho no seu cartão, com a
 *  divisão por baixo do nome. Quatro tipos: luzes, estores, clima, tomadas.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { CFG, bind, entre, ecra, divisoes, eGaragem, posicao, ico } = K;

  const PISOS = CFG.floors || [];

  const TIPOS = [
    { id: "luzes", nome: "Luzes", sub: "Acender, apagar e regular" },
    { id: "estores", nome: "Estores", sub: "Abrir, fechar e a meio" },
    { id: "clima", nome: "Clima", sub: "Modo e temperatura" },
    { id: "tomadas", nome: "Tomadas", sub: "Aparelhos que se ligam e desligam" },
  ];

  // o piso escolhido lembra-se enquanto se navega entre os tipos
  let filtro = "todos";

  const nomePiso = (id) => (PISOS.find((f) => f.id === id) || {}).name || "";

  // ───────── O que há, por tipo ─────────

  const estoresDe = (r) => (r.covers || []).filter((c) => !eGaragem(c));

  /** Os aparelhos de um tipo, pela ordem das divisões. */
  function itensDe(tipo) {
    return divisoes().flatMap((r) => {
      if (tipo === "luzes") return (r.lights || []).map((id) => ({ r, id }));
      if (tipo === "estores") return estoresDe(r).map((id) => ({ r, id }));
      if (tipo === "clima") return r.climate ? [{ r, id: r.climate }] : [];
      return (r.switches || []).map((s) => ({ r, id: s.entity, nome: s.name, icone: s.icon }));
    });
  }

  const doFiltro = (lista) => lista.filter((i) => filtro === "todos" || i.r.floor === filtro);

  /** "Luz teto Sala" numa divisão chamada Sala fica "Luz teto": a divisão já está por baixo. */
  function nomeCurto(r, id, nome) {
    const n = (nome || HA.name(id)).replace(new RegExp(`\\s*${r.name}\\s*`, "ig"), " ").replace(/\s+/g, " ").trim();
    return n || nome || HA.name(id);
  }

  // ───────── Cartões ─────────

  /** Uma luz ou uma tomada: um toque liga ou desliga. */
  function cartaoLigar({ r, id, nome, icone }, dominio, regulavel) {
    const node = el(`<div class="tile">
      <button class="tile-main" role="switch" aria-checked="false">
        <span class="tile-top">
          <span class="badge">${icon(ico(icone || "bulb"))}</span>
          <span class="sw" aria-hidden="true"></span>
        </span>
        <span class="tn"></span>
        <span class="tr"></span>
      </button></div>`);
    const main = node.querySelector(".tile-main");
    const sw = node.querySelector(".sw");
    const sub = node.querySelector(".tr");
    // "Luz" seis vezes não se distingue de relance: quando o nome é só o tipo,
    // o cartão chama-se pela divisão e o subtítulo deixa de a repetir
    const curto = nomeCurto(r, id, nome);
    const generico = /^(luz|tomada)$/i.test(curto);
    node.querySelector(".tn").textContent = generico ? r.name : curto;
    const onde = generico ? "" : `${r.name} · `;
    main.addEventListener("click", () => HA.call(dominio, HA.isOn(id) ? "turn_off" : "turn_on", id));

    let brilho = null;
    if (regulavel) {
      brilho = K.slider({
        rotulo: "Brilho", valor: 50,
        aoLargar: (v) => HA.call("light", "turn_on", id, { brightness_pct: Math.max(1, v) }),
      });
      brilho.classList.add("compacto");
      node.appendChild(brilho);
    }

    return bind(node, entre([id]), () => {
      const on = HA.isOn(id);
      const pct = Math.round(((HA.attr(id, "brightness", 0) || 0) / 255) * 100);
      const morto = K.marcarResposta(node, id);
      main.disabled = morto;
      if (morto) {
        node.classList.remove("on");
        sub.textContent = `${onde}sem resposta`;
        if (brilho) brilho.hidden = true;
        return;
      }
      node.classList.toggle("on", on);
      main.setAttribute("aria-checked", String(on));
      sw.setAttribute("aria-checked", String(on));
      const estado = dominio === "light"
        ? !on ? "apagada" : brilho ? `${fmt.n(pct)} %` : "acesa"
        : on ? "ligada" : "desligada";
      sub.textContent = `${onde}${estado}`.replace(/^./, (c) => c.toUpperCase());
      if (brilho) {
        brilho.hidden = !on;
        brilho.definir(pct);
      }
    });
  }

  function cartaoEstore({ r, id }) {
    const node = el(`<div class="tile estore">
      <div class="tile-cab"><span class="tn"></span><span class="tr"></span></div></div>`);
    node.querySelector(".tn").textContent = K.rotuloEstore(r, id);
    node.querySelector(".tr").textContent = r.name;

    let quando = 0;
    const s = K.slider({
      rotulo: "Aberto", tipo: "estore", valor: posicao(id),
      aoLargar: (v) => {
        quando = Date.now();
        HA.call("cover", "set_cover_position", id, { position: v });
      },
    });
    node.appendChild(s);

    const botoes = el(`<div class="row btns">
      <button class="pill grow" data-a="open_cover" aria-label="Abrir">${icon("up", "ic-s")}</button>
      <button class="pill grow" data-a="stop_cover" aria-label="Parar">${icon("stop", "ic-s")}</button>
      <button class="pill grow" data-a="close_cover" aria-label="Fechar">${icon("down", "ic-s")}</button></div>`);
    botoes.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => HA.call("cover", b.dataset.a, id)));
    node.appendChild(botoes);

    return bind(node, entre([id]), () => {
      if (Date.now() - quando > 1500) s.definir(posicao(id));
    });
  }

  function cartaoClima({ r }) {
    const c = K.climaCard(r, r.name);
    c.classList.add("tile");
    return c;
  }

  function cartao(tipo, item) {
    if (tipo === "luzes") {
      const regulavel = (HA.attr(item.id, "supported_color_modes", []) || []).some((m) => m !== "onoff");
      return cartaoLigar({ ...item, icone: "bulb" }, "light", regulavel);
    }
    if (tipo === "tomadas") return cartaoLigar(item, "switch", false);
    if (tipo === "estores") return cartaoEstore(item);
    return cartaoClima(item);
  }

  // ───────── Ações de grupo ─────────
  // Cada ação diz o que vai fazer e, em miúdo, a quantas coisas — e fica
  // apagada quando não há nada a fazer.

  const plural = (n, um, varios) => `${fmt.n(n)} ${n === 1 ? um : varios}`;

  function acoesDe(tipo) {
    const todos = itensDe(tipo).map((i) => i.id);
    const doPiso = doFiltro(itensDe(tipo)).map((i) => i.id);
    const contextual = filtro !== "todos" ? nomePiso(filtro) : null;
    const lista = [];

    if (tipo === "luzes") {
      // com um piso escolhido, tudo nesta fila é desse piso: a casa inteira está em "Todos"
      const acesas = (ids) => ids.filter((l) => HA.isOn(l));
      const alvoL = contextual ? doPiso : todos;
      lista.push({
        icone: "bulb", texto: contextual ? `Acender as do ${contextual}` : "Acender todas", ids: alvoL,
        sub: () => (acesas(alvoL).length === alvoL.length ? "estão todas acesas" : `${fmt.n(alvoL.length - acesas(alvoL).length)} por acender`),
        ativa: () => acesas(alvoL).length < alvoL.length,
        corre: () => HA.call("light", "turn_on", alvoL),
      });
      lista.push({
        icone: "bulb", texto: contextual ? `Apagar as do ${contextual}` : "Apagar todas", ids: alvoL,
        sub: () => (acesas(alvoL).length ? plural(acesas(alvoL).length, "acesa", "acesas") : "estão todas apagadas"),
        ativa: () => acesas(alvoL).length > 0,
        corre: () => HA.call("light", "turn_off", alvoL),
      });
    } else if (tipo === "estores") {
      const abertos = (ids) => ids.filter((c) => posicao(c) > 0);
      const alvo = contextual ? doPiso : todos;
      const quem = contextual ? `os do ${contextual}` : "todos";
      lista.push({
        icone: "up", texto: `Abrir ${quem}`, ids: alvo,
        sub: () => {
          const n = alvo.filter((c) => posicao(c) < 100).length;
          return n ? `${fmt.n(n)} por abrir` : "estão abertos";
        },
        ativa: () => alvo.some((c) => posicao(c) < 100),
        corre: () => HA.call("cover", "set_cover_position", alvo, { position: 100 }),
      });
      lista.push({
        icone: "stop", texto: "Parar", ids: alvo, sub: () => "os que estão a andar",
        ativa: () => alvo.length > 0,
        corre: () => HA.call("cover", "stop_cover", alvo),
      });
      lista.push({
        icone: "down", texto: `Fechar ${quem}`, ids: alvo,
        sub: () => (abertos(alvo).length ? plural(abertos(alvo).length, "aberto", "abertos") : "estão fechados"),
        ativa: () => abertos(alvo).length > 0,
        corre: () => HA.call("cover", "set_cover_position", alvo, { position: 0 }),
      });
    } else if (tipo === "clima") {
      const ligados = () => todos.filter((c) => (HA.get(c) || {}).state !== "off");
      lista.push({
        icone: "ac", texto: "Desligar todos", ids: todos,
        sub: () => (ligados().length ? plural(ligados().length, "ligado", "ligados") : "estão todos desligados"),
        ativa: () => ligados().length > 0,
        corre: () => HA.call("climate", "set_hvac_mode", todos, { hvac_mode: "off" }),
      });
      lista.push({
        icone: "snow", texto: "Frio", ids: todos, sub: () => "em todos",
        ativa: () => true,
        corre: () => HA.call("climate", "set_hvac_mode", todos, { hvac_mode: "cool" }),
      });
      lista.push({
        icone: "flame", texto: "Calor", ids: todos, sub: () => "em todos",
        ativa: () => true,
        corre: () => HA.call("climate", "set_hvac_mode", todos, { hvac_mode: "heat" }),
      });
    } else {
      const ligadas = () => todos.filter((t) => HA.isOn(t));
      lista.push({
        icone: "plug", texto: "Desligar todas", ids: todos,
        sub: () => (ligadas().length ? plural(ligadas().length, "ligada", "ligadas") : "estão todas desligadas"),
        ativa: () => ligadas().length > 0,
        corre: () => HA.call("switch", "turn_off", todos),
      });
    }
    return lista;
  }

  // ───────── O comando mestre ─────────
  // Mandar em tudo de uma vez com a mesma finura com que se manda num só: um
  // slider para o brilho de todas as luzes, outro para a posição de todos os
  // estores, um stepper para a temperatura de todos os ares. Respeita o filtro
  // de piso — "todas as do Piso 1" —, porque é o mesmo âmbito dos botões ao lado.

  const regulavel = (id) => (HA.attr(id, "supported_color_modes", []) || []).some((m) => m !== "onoff");
  const media = (lista) => (lista.length ? lista.reduce((t, v) => t + v, 0) / lista.length : null);

  function mestreDe(tipo) {
    const ids = doFiltro(itensDe(tipo)).map((i) => i.id);
    if (!ids.length) return null;

    if (tipo === "luzes") {
      const dim = ids.filter(regulavel);
      if (!dim.length) return null;
      return {
        tipo: "slider", rotulo: "Brilho", cheio: "Brilho de todas", ids: dim,
        // as acesas, ou todas se nenhuma estiver acesa
        valor: () => {
          const on = dim.filter((l) => HA.isOn(l));
          return on.length ? media(on.map((l) => ((HA.attr(l, "brightness", 0) || 0) / 255) * 100)) : 0;
        },
        aplica: (v) => {
          const on = dim.filter((l) => HA.isOn(l));
          const alvo = on.length ? on : dim;
          if (v <= 0) HA.call("light", "turn_off", alvo);
          else HA.call("light", "turn_on", alvo, { brightness_pct: v });
        },
      };
    }
    if (tipo === "estores") {
      return {
        tipo: "slider", rotulo: "Abertura", cheio: "Abertura de todos", tom: "estore", ids,
        valor: () => media(ids.map(posicao)),
        aplica: (v) => HA.call("cover", "set_cover_position", ids, { position: v }),
      };
    }
    if (tipo === "clima") {
      return {
        tipo: "stepper", rotulo: "Temperatura", cheio: "Temperatura de todos", ids, min: 16, max: 30, passo: 0.5,
        valor: () => {
          const ligados = ids.filter((c) => (HA.get(c) || {}).state !== "off");
          const de = ligados.length ? ligados : ids;
          return media(de.map((c) => HA.attr(c, "temperature")).filter((t) => t !== null));
        },
        aplica: (t) => HA.call("climate", "set_temperature", ids, { temperature: t }),
      };
    }
    return null;
  }

  function comandoMestre(m) {
    const rotuloCheio = m.cheio;
    if (m.tipo === "slider") {
      // manda na casa inteira: só obedece a um arrasto, nunca a um toque perdido.
      // O rótulo e o valor vivem dentro do próprio comando ("Brilho de todos · 29 %"),
      // nunca por cima — assim fica com a mesma altura das outras ações ao lado.
      const sl = K.slider({
        rotulo: rotuloCheio, tipo: m.tom || "luz", valor: 0, exigeArrasto: true,
        aoLargar: (v) => K.emMassa({ nome: rotuloCheio, ids: m.ids, fazer: () => m.aplica(v) }),
      });
      sl.classList.add("mestre");
      sl.setAttribute("aria-description", "Arrasta para mudar todos de uma vez");
      let quando = 0;
      sl.addEventListener("pointerup", () => (quando = Date.now()));
      return bind(sl, entre(m.ids), () => {
        const v = m.valor();
        if (Date.now() - quando > 1500) sl.definir(v === null ? 0 : v);
      });
    }

    // stepper: uma fila só, como as outras ações — rótulo, valor e os botões
    // lado a lado. O valor mostra-se já; o comando sai meio segundo depois do
    // último toque.
    const wrap = el(`<div class="mestre mestre-passo"><span class="cap-inline grow">${esc(rotuloCheio)}</span></div>`);
    const num = el('<span class="t3 num"></span>');
    const menos = el(`<button aria-label="Baixar a ${esc(m.rotulo.toLowerCase())} de todos">${icon("minus", "ic-s")}</button>`);
    const mais = el(`<button aria-label="Subir a ${esc(m.rotulo.toLowerCase())} de todos">${icon("plus", "ic-s")}</button>`);
    const passo = el('<div class="stepper"></div>');
    passo.append(menos, mais);
    wrap.append(num, passo);

    let pedida = null;
    let quando = 0;
    let espera = null;
    const mostra = () => (num.innerHTML = pedida === null ? "—" : `${fmt.n(pedida, 1)}<small class="dim"> °C</small>`);
    [[menos, -1], [mais, 1]].forEach(([b, d]) =>
      b.addEventListener("click", () => {
        const base = pedida === null ? 22 : pedida;
        pedida = Math.max(m.min, Math.min(m.max, Math.round((base + d * m.passo) / m.passo) * m.passo));
        quando = Date.now();
        mostra();
        clearTimeout(espera);
        espera = setTimeout(() => m.aplica(pedida), 500);
      }),
    );
    return bind(wrap, entre(m.ids), () => {
      if (Date.now() - quando > 1500) {
        pedida = m.valor();
        mostra();
      }
    });
  }

  function botaoAcao(a) {
    const b = el(`<button class="gact">
      <span class="gi">${icon(ico(a.icone), "ic-s")}</span>
      <span class="gt"><span class="gn">${esc(a.texto)}</span><span class="gs"></span></span></button>`);
    b.addEventListener("click", () => {
      // parar estores não precisa de desfazer; o resto diz o que fez e deixa voltar atrás
      if (a.icone === "stop") a.corre();
      else K.emMassa({ nome: a.texto, ids: a.ids, fazer: a.corre });
      b.classList.add("feito");
      setTimeout(() => b.classList.remove("feito"), 900);
    });
    return bind(b, entre(a.ids), () => {
      b.querySelector(".gs").textContent = a.sub();
      b.disabled = !a.ativa();
    });
  }

  // ───────── Vista ─────────

  function controlos(args) {
    const tipo = TIPOS.some((t) => t.id === (args && args[0])) ? args[0] : "luzes";
    return ecra() === "mao" ? naMao(tipo) : naParede(tipo);
  }

  function cabecalho(tipo) {
    const t = TIPOS.find((x) => x.id === tipo);
    const head = el(`<div class="head"><div>
      <div class="t2">Controlos</div><div class="ft">${esc(t.sub)}</div></div></div>`);
    const seg = K.segmentado(TIPOS.map((x) => x.nome), TIPOS.findIndex((x) => x.id === tipo), (i) => {
      location.hash = `#/controlos/${TIPOS[i].id}`;
    }, { cheio: ecra() === "mao" });
    return { head, seg };
  }

  function naParede(tipo) {
    const raiz = el('<div class="pad col grow"></div>');
    const { head, seg } = cabecalho(tipo);
    head.appendChild(seg);
    raiz.appendChild(head);

    const barra = el('<div class="row barra"></div>');
    const acoes = el('<div class="row acoes-grupo"></div>');
    barra.appendChild(acoes);
    raiz.appendChild(barra);

    const zona = el('<div class="col grow zona"></div>');
    raiz.appendChild(zona);

    let pagina = 0;
    let paginas = [];
    const esc2 = K.escopo();
    const pontos = el('<div class="dots" role="tablist" aria-label="Páginas"></div>');

    // Tablet e TV não rolam: o que não cabe vai para a página seguinte. As
    // páginas fazem-se medindo, não contando cartões — um grupo de divisão
    // ocupa mais do que um cartão solto, e o tamanho muda com o ecrã.
    const mostra = () => {
      pagina = Math.min(pagina, Math.max(0, paginas.length - 1));
      const aVista = new Set(paginas[pagina] || []);
      const grupos = zona.querySelector(".grupos");
      if (grupos) [...grupos.children].forEach((b) => (b.hidden = !aVista.has(b)));
      pontos.hidden = paginas.length < 2;
      pontos.innerHTML = "";
      paginas.forEach((_, i) => {
        const b = el(`<button role="tab" aria-selected="${i === pagina}" aria-label="Página ${i + 1} de ${paginas.length}"></button>`);
        b.addEventListener("click", () => {
          pagina = i;
          mostra();
        });
        pontos.appendChild(b);
      });
    };
    const paginar = () => {
      const grupos = zona.querySelector(".grupos");
      if (!grupos) return;
      const blocos = [...grupos.children];
      blocos.forEach((b) => (b.hidden = false));
      pontos.hidden = true;
      ajustaColunas(grupos);
      const H = zona.clientHeight;
      if (!H) return;
      const fundo = (b) => b.offsetTop + b.offsetHeight;
      if (blocos.every((b) => fundo(b) <= H + 1)) {
        paginas = [blocos];
        return mostra();
      }
      // com mais de uma página, as bolinhas ficam com o seu espaço em baixo
      pontos.hidden = false;
      const Hp = H - pontos.offsetHeight - parseFloat(getComputedStyle(zona).rowGap || 0);
      paginas = [];
      let resto = blocos;
      while (resto.length) {
        blocos.forEach((b) => (b.hidden = !resto.includes(b)));
        const cabem = resto.filter((b) => fundo(b) <= Hp + 1);
        const pag = cabem.length ? cabem : [resto[0]];
        paginas.push(pag);
        resto = resto.filter((b) => !pag.includes(b));
      }
      mostra();
    };

    const desenha = () => {
      K.esvaziar(esc2);
      K.dentro(esc2, () => {
        acoes.innerHTML = "";
        acoesDe(tipo).forEach((a) => acoes.appendChild(botaoAcao(a)));
        const mestre = mestreDe(tipo);
        if (mestre) acoes.appendChild(comandoMestre(mestre));
        zona.innerHTML = "";
        zona.append(grelha(tipo, doFiltro(itensDe(tipo))), pontos);
      });
      requestAnimationFrame(paginar);
    };

    // o piso só aparece quando há mais de um com aparelhos deste tipo
    const pisos = [...new Set(itensDe(tipo).map((i) => i.r.floor))];
    if (pisos.length > 1) {
      const ids = ["todos", ...PISOS.filter((f) => pisos.includes(f.id)).map((f) => f.id)];
      if (!ids.includes(filtro)) filtro = "todos";
      const nomes = ["Todos", ...ids.slice(1).map(nomePiso)];
      const porPiso = K.segmentado(nomes, ids.indexOf(filtro), (i) => {
        filtro = ids[i];
        pagina = 0;
        desenha();
      });
      porPiso.classList.add("piso-seg");
      // à esquerda das ações: primeiro escolhe-se "onde", depois "o quê"
      barra.prepend(porPiso);
    } else {
      filtro = "todos";
    }

    desenha();
    // o ecrã muda de tamanho (a barra recolhe, o tamanho do texto muda): volta a paginar
    let pousar = null;
    let antes = "";
    new ResizeObserver(() => {
      const agora = `${zona.clientWidth}x${zona.clientHeight}`;
      if (agora === antes) return;
      antes = agora;
      clearTimeout(pousar);
      pousar = setTimeout(paginar, 120);
    }).observe(zona);
    return raiz;
  }

  /**
   * Agrupados por divisão: o título só aparece quando há mais de um aparelho
   * — um só já se diz no subtítulo do cartão. As divisões de um só aparelho
   * não ganham cada uma a sua fila (era desperdiçar altura): juntam-se numa
   * grelha só, pela ordem em que apareceriam. Pouco espaço dentro de cada
   * grupo, mais entre grupos.
   */
  function grelha(tipo, itens) {
    const grupos = el(`<div class="grupos ${tipo}"></div>`);
    const porDivisao = new Map();
    itens.forEach((it) => {
      if (!porDivisao.has(it.r.id)) porDivisao.set(it.r.id, { r: it.r, itens: [] });
      porDivisao.get(it.r.id).itens.push(it);
    });
    porDivisao.forEach(({ r, itens: doGrupo }) => {
      if (doGrupo.length === 1) {
        const c = cartao(tipo, doGrupo[0]);
        c.classList.add("solto");
        grupos.appendChild(c);
        return;
      }
      const bloco = el(`<div class="grupo-divisao" data-n="${doGrupo.length}"><span class="cap">${esc(r.name)}</span></div>`);
      const mini = el(`<div class="tiles ${tipo}"></div>`);
      doGrupo.forEach((it) => mini.appendChild(cartao(tipo, it)));
      bloco.appendChild(mini);
      grupos.appendChild(bloco);
    });
    return grupos;
  }

  /**
   * Uma divisão ocupa as colunas de que precisa (até à largura toda) e as
   * outras encaixam ao lado, em vez de cada uma gastar uma fila. As colunas
   * são as que a grelha tiver neste ecrã; os cartões de dentro alinham com
   * os de fora porque têm a mesma largura e o mesmo intervalo.
   */
  function ajustaColunas(grupos) {
    const cols = getComputedStyle(grupos).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    grupos.querySelectorAll(":scope > .grupo-divisao").forEach((b) => {
      const k = Math.min(Number(b.dataset.n) || 1, cols);
      b.style.gridColumn = `span ${k}`;
      b.style.setProperty("--k", k);
    });
  }

  /** No telemóvel: um bloco por piso, e a página rola. */
  function naMao(tipo) {
    const raiz = el('<div class="scroll pad col"></div>');
    const { head, seg } = cabecalho(tipo);
    raiz.append(head, seg);

    const acoes = el('<div class="acoes-mao"></div>');
    acoesDe(tipo).forEach((a) => acoes.appendChild(botaoAcao(a)));
    const mestre = mestreDe(tipo);
    if (mestre) acoes.appendChild(comandoMestre(mestre));
    raiz.appendChild(acoes);

    PISOS.forEach((f) => {
      const itens = itensDe(tipo).filter((i) => i.r.floor === f.id);
      if (!itens.length) return;
      const bloco = el(`<div class="col piso"><span class="cap">${esc(f.name)}</span></div>`);
      const g = el(`<div class="tiles mao ${tipo}"></div>`);
      itens.forEach((it) => g.appendChild(cartao(tipo, it)));
      bloco.appendChild(g);
      raiz.appendChild(bloco);
    });
    return raiz;
  }

  window.VIEWS.controlos = controlos;
})();
