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
  const POR_PAGINA = 28;

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
        <span class="tn">${esc(nomeCurto(r, id, nome))}</span>
        <span class="tr"></span>
      </button></div>`);
    const main = node.querySelector(".tile-main");
    const sw = node.querySelector(".sw");
    const sub = node.querySelector(".tr");
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
        sub.textContent = `${r.name} · sem resposta`;
        if (brilho) brilho.hidden = true;
        return;
      }
      node.classList.toggle("on", on);
      main.setAttribute("aria-checked", String(on));
      sw.setAttribute("aria-checked", String(on));
      const estado = dominio === "light"
        ? !on ? "apagada" : brilho ? `${fmt.n(pct)} %` : "acesa"
        : on ? "ligada" : "desligada";
      sub.textContent = `${r.name} · ${estado}`;
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
      const acesas = (ids) => ids.filter((l) => HA.isOn(l));
      const alvoL = contextual ? doPiso : todos;
      lista.push({
        icone: "bulb", texto: contextual ? `Acender as do ${contextual}` : "Acender todas", ids: alvoL,
        sub: () => (acesas(alvoL).length === alvoL.length ? "estão todas acesas" : `${fmt.n(alvoL.length - acesas(alvoL).length)} por acender`),
        ativa: () => acesas(alvoL).length < alvoL.length,
        corre: () => HA.call("light", "turn_on", alvoL),
      });
      lista.push({
        icone: "bulb", texto: "Desligar todas", ids: todos,
        sub: () => (acesas(todos).length ? plural(acesas(todos).length, "acesa", "acesas") : "estão todas apagadas"),
        ativa: () => acesas(todos).length > 0,
        corre: () => HA.call("light", "turn_off", todos),
      });
      if (contextual) {
        lista.push({
          icone: "bulb", texto: `Desligar as do ${contextual}`, ids: doPiso,
          sub: () => (acesas(doPiso).length ? plural(acesas(doPiso).length, "acesa", "acesas") : "estão apagadas"),
          ativa: () => acesas(doPiso).length > 0,
          corre: () => HA.call("light", "turn_off", doPiso),
        });
      }
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
        tipo: "slider", rotulo: "Brilho", ids: dim,
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
        tipo: "slider", rotulo: "Abertos", tom: "estore", ids,
        valor: () => media(ids.map(posicao)),
        aplica: (v) => HA.call("cover", "set_cover_position", ids, { position: v }),
      };
    }
    if (tipo === "clima") {
      return {
        tipo: "stepper", rotulo: "Temperatura", ids, min: 16, max: 30, passo: 0.5,
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
    const wrap = el('<div class="mestre"></div>');
    if (m.tipo === "slider") {
      // manda na casa inteira: só obedece a um arrasto, nunca a um toque perdido
      const sl = K.slider({
        rotulo: m.rotulo, tipo: m.tom || "luz", valor: 0, exigeArrasto: true,
        aoLargar: (v) => K.emMassa({ nome: `${m.rotulo} de todos`, ids: m.ids, fazer: () => m.aplica(v) }),
      });
      sl.setAttribute("aria-description", "Arrasta para mudar todos de uma vez");
      let quando = 0;
      sl.addEventListener("pointerup", () => (quando = Date.now()));
      wrap.append(el(`<span class="cap">${esc(m.rotulo)} de todos</span>`), sl);
      return bind(wrap, entre(m.ids), () => {
        const v = m.valor();
        if (Date.now() - quando > 1500) sl.definir(v === null ? 0 : v);
      });
    }

    // stepper: o valor mostra-se já, e o comando sai meio segundo depois do último toque
    const num = el('<span class="t3 num"></span>');
    const menos = el(`<button aria-label="Baixar a temperatura de todos">${icon("minus", "ic-s")}</button>`);
    const mais = el(`<button aria-label="Subir a temperatura de todos">${icon("plus", "ic-s")}</button>`);
    const passo = el('<div class="stepper"></div>');
    passo.append(menos, mais);
    const linha = el('<div class="sb"></div>');
    linha.append(num, passo);
    wrap.append(el(`<span class="cap">${esc(m.rotulo)} de todos</span>`), linha);

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
    const esc2 = K.escopo();

    const desenha = () => {
      K.esvaziar(esc2);
      K.dentro(esc2, () => {
        acoes.innerHTML = "";
        acoesDe(tipo).forEach((a) => acoes.appendChild(botaoAcao(a)));
        const mestre = mestreDe(tipo);
        if (mestre) acoes.appendChild(comandoMestre(mestre));

        const todos = doFiltro(itensDe(tipo));
        const paginas = Math.max(1, Math.ceil(todos.length / POR_PAGINA));
        pagina = Math.min(pagina, paginas - 1);
        const daPagina = todos.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

        zona.innerHTML = "";
        zona.appendChild(grelha(tipo, daPagina));
        if (paginas > 1) {
          const pontos = el('<div class="dots" role="tablist"></div>');
          for (let i = 0; i < paginas; i++) {
            const b = el(`<button role="tab" aria-selected="${i === pagina}" aria-label="Página ${i + 1}"></button>`);
            b.addEventListener("click", () => {
              pagina = i;
              desenha();
            });
            pontos.appendChild(b);
          }
          zona.appendChild(pontos);
        }
      });
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
      barra.appendChild(porPiso);
    } else {
      filtro = "todos";
    }

    desenha();
    return raiz;
  }

  function grelha(tipo, itens) {
    const { linhas, colunas } = K.medidas(itens.length);
    const node = el(`<div class="tiles ${tipo}"></div>`);
    node.style.gridTemplateColumns = `repeat(${colunas}, minmax(0, 1fr))`;
    node.style.gridTemplateRows =
      itens.length <= 3 ? "minmax(0, calc(240px * var(--u)))" : `repeat(${linhas}, minmax(0, 1fr))`;
    node.classList.toggle("poucas", itens.length <= 3);
    const resto = itens.length % colunas;
    itens.forEach((it, i) => {
      const c = cartao(tipo, it);
      if (i === itens.length - 1 && resto) c.style.gridColumn = `span ${colunas - resto + 1}`;
      node.appendChild(c);
    });
    return node;
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
