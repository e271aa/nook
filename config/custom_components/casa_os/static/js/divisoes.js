/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — Divisões.
 *
 *  A lista é uma grelha que enche o ecrã, nunca uma coluna que rola: 10
 *  divisões dão 5×2, 25 dão 7×4 com cartões mais baixos, e a partir de 28
 *  passa a páginas. O detalhe de uma divisão junta tudo o que ela tem —
 *  clima, luzes, estores, tomadas, sensores e câmara — e não rola.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { CFG, bind, entre, ecra, divisoes, eGaragem, posicao, avisos, ico } = K;

  const PISOS = CFG.floors || [];
  const nomePiso = (id) => (PISOS.find((f) => f.id === id) || {}).name || "";
  const POR_PAGINA = 28;

  // o piso escolhido lembra-se enquanto se navega
  let filtro = "todos";

  const MODOS = { off: "Desl.", cool: "Frio", heat: "Calor", heat_cool: "Auto", dry: "Secar", fan_only: "Vento" };
  const ACAO = {
    cooling: "a arrefecer",
    heating: "a aquecer",
    idle: "em espera",
    drying: "a secar",
    fan: "a ventilar",
    off: "desligado",
  };

  // o texto vai num span para que, com muitas divisões, o cartão possa ficar só com o ícone
  const pill = (texto, cls, ic) =>
    `<span class="pill ${cls || ""}" title="${esc(texto)}">${ic ? icon(ic) : ""}<span class="pt">${esc(texto)}</span></span>`;

  // ───────── Perguntas à divisão ─────────

  const luzes = (r) => r.lights || [];
  const estores = (r) => (r.covers || []).filter((c) => !eGaragem(c));
  const portao = (r) => (r.covers || []).find(eGaragem);
  const janelas = (r) => r.windows || [];
  const acesasDe = (r) => luzes(r).filter((l) => HA.isOn(l));
  const abertosDe = (r) => estores(r).filter((c) => posicao(c) > 0);
  const avisosDe = (r) => avisos().filter((a) => a.divisao === r.name);

  const idsDe = (r) => [
    ...luzes(r), ...(r.covers || []), r.climate, r.temperature, r.humidity, r.contact, r.lock,
    r.motion, r.camera, ...janelas(r), ...(r.switches || []).map((s) => s.entity), K.AVISOS,
  ];

  // ───────── Cartão de divisão ─────────

  function cartao(r, denso) {
    const node = el(`<button class="room${denso ? " denso" : ""}" data-room="${esc(r.id)}">
      <div class="sb"><span class="rn">${esc(r.name)}</span><span class="rtemp num"></span></div>
      <div class="rs"></div>
      <div class="rc"></div>
    </button>`);
    node.addEventListener("click", () => {
      location.hash = `#/divisoes/${r.id}`;
    });

    return bind(node, entre(idsDe(r)), () => {
      const on = acesasDe(r).length;
      const t = r.temperature ? HA.num(r.temperature) : null;
      const h = r.humidity ? HA.num(r.humidity) : null;
      const alertas = avisosDe(r);

      K.marcarResposta(node, [...luzes(r), ...(r.covers || []), r.climate].filter(Boolean));
      node.classList.toggle("lit", on > 0);
      node.classList.toggle("alerta", alertas.length > 0);
      node.querySelector(".rtemp").textContent = t !== null ? `${fmt.n(t, 1)}°` : "";

      let sub = "";
      if (t !== null && h !== null) sub = `${fmt.n(h)} % de humidade`;
      else if (r.lock) {
        sub = HA.isOn(r.contact) ? "Porta aberta" : (HA.get(r.lock) || {}).state === "locked" ? "Trancada" : "Destrancada";
      } else if (portao(r)) sub = `Portão ${HA.isOn(portao(r)) ? "aberto" : "fechado"}`;
      else sub = nomePiso(r.floor);
      node.querySelector(".rs").textContent = sub;

      const chips = [];
      const nl = luzes(r).length;
      if (on > 0) chips.push(pill(`${on} ${on > 1 ? "acesas" : "acesa"}`, "on", "bulb"));
      else if (nl) chips.push(pill(nl === 1 ? "Luz apagada" : "Luzes apagadas", "", "bulb"));

      const ab = abertosDe(r).length;
      if (ab > 0) chips.push(pill(`${ab} ${ab > 1 ? "abertos" : "aberto"}`, "", "blinds"));

      if (r.climate) {
        const modo = (HA.get(r.climate) || {}).state;
        if (modo && modo !== "off") {
          const alvo = HA.attr(r.climate, "temperature");
          chips.push(pill(`${MODOS[modo] || "Ligado"}${alvo ? ` · ${fmt.n(alvo, 1)}°` : ""}`, "on", "ac"));
        }
      }
      if (janelas(r).some((w) => HA.isOn(w))) chips.push(pill("Janela aberta", "warn", "window"));
      if (r.camera) chips.push(pill("Câmara", "", "camera"));
      node.querySelector(".rc").innerHTML = chips.join("");
    });
  }

  // ───────── A grelha que enche ─────────

  function grelha(lista) {
    const { linhas, colunas } = K.medidas(lista.length);
    const node = el('<div class="rooms"></div>');
    node.style.gridTemplateColumns = `repeat(${colunas}, minmax(0, 1fr))`;
    node.style.gridTemplateRows =
      lista.length <= 3 ? "minmax(0, calc(220px * var(--u)))" : `repeat(${linhas}, minmax(0, 1fr))`;
    node.classList.toggle("poucas", lista.length <= 3);

    // a última linha pode ficar incompleta: o último cartão ocupa o que sobra
    const resto = lista.length % colunas;
    lista.forEach((r, i) => {
      const c = cartao(r, linhas >= 4);
      if (i === lista.length - 1 && resto) c.style.gridColumn = `span ${colunas - resto + 1}`;
      node.appendChild(c);
    });
    return node;
  }

  // ───────── Lista ─────────

  function lista() {
    return ecra() === "mao" ? listaNaMao() : listaNaParede();
  }

  function cabecalho(sub) {
    const on = divisoes().filter((r) => acesasDe(r).length).length;
    return el(`<div class="head"><div>
      <div class="t2">Divisões</div>
      <div class="ft">${fmt.n(divisoes().length)} divisões em ${fmt.n(PISOS.length)} pisos${on ? ` · ${fmt.n(on)} com luz acesa` : ""}${sub || ""}</div>
    </div></div>`);
  }

  function listaNaParede() {
    const raiz = el('<div class="pad col grow"></div>');
    const head = cabecalho();
    raiz.appendChild(head);

    const zona = el('<div class="col grow zona"></div>');
    raiz.appendChild(zona);

    let pagina = 0;
    const esc = K.escopo();
    const desenha = () => {
      K.esvaziar(esc);
      const todas = divisoes().filter((r) => filtro === "todos" || r.floor === filtro);
      const paginas = Math.max(1, Math.ceil(todas.length / POR_PAGINA));
      pagina = Math.min(pagina, paginas - 1);
      const daPagina = todas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

      zona.innerHTML = "";
      zona.appendChild(K.dentro(esc, () => grelha(daPagina)));
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
    };

    const ids = ["todos", ...PISOS.map((f) => f.id)];
    const seg = K.segmentado(["Todas", ...PISOS.map((f) => f.name)], ids.indexOf(filtro), (i) => {
      filtro = ids[i];
      pagina = 0;
      desenha();
    });
    head.appendChild(seg);
    desenha();
    return raiz;
  }

  /** No telemóvel a página rola: um bloco por piso, duas colunas. */
  function listaNaMao() {
    const raiz = el('<div class="scroll pad col"></div>');
    raiz.appendChild(cabecalho());
    PISOS.forEach((f) => {
      const rs = divisoes().filter((r) => r.floor === f.id);
      if (!rs.length) return;
      const bloco = el(`<div class="col piso"><span class="cap">${esc(f.name)}</span></div>`);
      const g = el('<div class="rooms mao"></div>');
      rs.forEach((r) => g.appendChild(cartao(r, false)));
      bloco.appendChild(g);
      raiz.appendChild(bloco);
    });
    return raiz;
  }

  // ───────── Detalhe ─────────

  function linha(ic, nome, valor, tom) {
    return el(`<div class="li">
      <span class="ig"${tom ? ` style="color:var(--${tom})"` : ""}>${icon(ico(ic), "ic-s")}</span>
      <span class="nm">${esc(nome)}</span><span class="vl">${esc(valor || "")}</span>
    </div>`);
  }

  function climaCard(r, titulo) {
    const id = r.climate;
    const modos = (HA.attr(id, "hvac_modes", []) || []).filter((m) => MODOS[m] && m !== "dry");
    const min = HA.attr(id, "min_temp", 16);
    const max = HA.attr(id, "max_temp", 30);
    const passo = HA.attr(id, "target_temp_step", 0.5) || 0.5;

    const node = el(`<div class="card">
      <div class="sb"><span class="cap titulo"></span><span class="estado"></span></div>
      <div class="sb">
        <div><span class="t1 num alvo"></span><span class="hd dim"> °C pedidos</span>
          <div class="ft agora"></div></div>
        <div class="stepper">
          <button data-d="-1" aria-label="Baixar a temperatura">${icon("minus", "ic-s")}</button>
          <button data-d="1" aria-label="Subir a temperatura">${icon("plus", "ic-s")}</button>
        </div>
      </div></div>`);

    node.querySelector(".titulo").textContent = titulo || "Ar condicionado";
    let pedida = HA.attr(id, "temperature", 22);
    let quando = 0;
    let espera = null;
    node.querySelectorAll(".stepper button").forEach((b) =>
      b.addEventListener("click", () => {
        pedida = Math.max(min, Math.min(max, Math.round((pedida + Number(b.dataset.d) * passo) / passo) * passo));
        quando = Date.now();
        node.querySelector(".alvo").textContent = fmt.n(pedida, 1);
        clearTimeout(espera);
        espera = setTimeout(() => HA.call("climate", "set_temperature", id, { temperature: pedida }), 500);
      }),
    );

    const seg = K.segmentado(modos.map((m) => MODOS[m]), 0, (i) => {
      HA.call("climate", "set_hvac_mode", id, { hvac_mode: modos[i] });
    }, { cheio: true });
    node.appendChild(seg);

    return bind(node, entre([id]), () => {
      const s = HA.get(id) || { state: "off" };
      const acao = HA.attr(id, "hvac_action", "off");
      node.querySelector(".estado").innerHTML =
        s.state === "off"
          ? pill("Desligado", "", "ac")
          : pill(`${MODOS[s.state] || "Ligado"} · ${ACAO[acao] || acao}`, "on", "ac");
      if (Date.now() - quando > 1500) {
        pedida = HA.attr(id, "temperature", pedida);
        node.querySelector(".alvo").textContent = fmt.n(pedida, 1);
      }
      const agora = HA.attr(id, "current_temperature");
      node.querySelector(".agora").textContent = agora !== null ? `Agora estão ${fmt.n(agora, 1)} °C na divisão` : "";
      seg.definir(modos.indexOf(s.state));
    });
  }

  function luzesCard(r) {
    const node = el('<div class="card"><span class="cap">Luzes</span></div>');

    luzes(r).forEach((id) => {
      const regulavel = (HA.attr(id, "supported_color_modes", []) || []).some((m) => m !== "onoff");
      const bloco = el(`<div class="luz">
        <div class="sb linha">
          <div class="row"><span class="lic">${icon("bulb")}</span>
            <div><div class="bd">${esc(HA.name(id))}</div><div class="ft lsub"></div></div></div>
        </div></div>`);
      const sw = K.interruptor(HA.name(id));
      bloco.querySelector(".linha").appendChild(sw);
      sw.addEventListener("click", () => HA.call("light", HA.isOn(id) ? "turn_off" : "turn_on", id));

      let brilho = null;
      if (regulavel) {
        brilho = K.slider({
          rotulo: "Brilho", valor: 50,
          aoLargar: (v) => HA.call("light", "turn_on", id, { brightness_pct: Math.max(1, v) }),
        });
        brilho.classList.add("luz-slide");
        bloco.appendChild(brilho);
      }

      bind(bloco, entre([id]), () => {
        const on = HA.isOn(id);
        const pct = Math.round(((HA.attr(id, "brightness", 0) || 0) / 255) * 100);
        sw.definir(on);
        bloco.querySelector(".lic").style.color = on ? "var(--tint)" : "var(--label-3)";
        const morta = K.marcarResposta(bloco, id);
        bloco.querySelector(".lsub").textContent = morta
          ? "Sem resposta"
          : !on ? "Apagada" : regulavel ? `${fmt.n(pct)} % de brilho` : "Acesa";
        sw.disabled = morta;
        if (brilho) {
          brilho.hidden = !on;
          brilho.definir(pct);
        }
      });
      node.appendChild(bloco);
    });
    return node;
  }

  /** "Estore Sala (janela)" numa divisão com dois estores vira "Janela". */
  function rotuloEstore(r, id) {
    const irmaos = estores(r).length;
    const detalhe = HA.name(id)
      .replace(/^estore\s*/i, "")
      .replace(new RegExp(r.name, "ig"), "")
      .replace(/[()·-]/g, " ")
      .trim();
    return irmaos > 1 && detalhe ? detalhe.charAt(0).toUpperCase() + detalhe.slice(1) : "Estore";
  }

  function estoresCard(r) {
    const ids = estores(r);
    const node = el('<div class="card"><span class="cap">Estores</span></div>');

    ids.forEach((id) => {
      let quando = 0;
      const s = K.slider({
        rotulo: rotuloEstore(r, id), tipo: "estore", valor: posicao(id),
        aoLargar: (v) => {
          quando = Date.now();
          HA.call("cover", "set_cover_position", id, { position: v });
        },
      });
      bind(s, entre([id]), () => {
        if (Date.now() - quando > 1500) s.definir(posicao(id));
      });
      node.appendChild(s);
    });

    const botoes = el(`<div class="row btns">
      <button class="pill grow" data-a="open_cover">${icon("up", "ic-s")}Abrir</button>
      <button class="pill grow" data-a="stop_cover">${icon("stop", "ic-s")}Parar</button>
      <button class="pill grow" data-a="close_cover">${icon("down", "ic-s")}Fechar</button></div>`);
    botoes.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => HA.call("cover", b.dataset.a, ids)),
    );
    node.appendChild(botoes);
    return node;
  }

  /** As tomadas, o portão, os sensores e a fechadura — tudo o que é uma linha. */
  function listaDaDivisao(r, { movimento = true } = {}) {
    const g = el('<div class="grouped"></div>');
    const linhas = [];

    (r.switches || []).forEach((s) => {
      const li = linha(s.icon, s.name, "");
      li.querySelector(".vl").remove();
      const sw = K.interruptor(s.name);
      li.appendChild(sw);
      sw.addEventListener("click", () => HA.call("switch", HA.isOn(s.entity) ? "turn_off" : "turn_on", s.entity));
      bind(li, entre([s.entity]), () => {
        sw.definir(HA.isOn(s.entity));
        li.querySelector(".ig").style.color = HA.isOn(s.entity) ? "var(--tint)" : "";
      });
      linhas.push(li);
    });

    const p = portao(r);
    if (p) {
      const li = linha("garage", "Portão", "");
      const b = el('<button class="pill"></button>');
      li.appendChild(b);
      b.addEventListener("click", () => HA.call("cover", HA.isOn(p) ? "close_cover" : "open_cover", p));
      bind(li, entre([p]), () => {
        const st = (HA.get(p) || {}).state;
        li.querySelector(".vl").textContent =
          st === "opening" ? "A abrir" : st === "closing" ? "A fechar" : st === "open" ? "Aberto" : "Fechado";
        b.textContent = HA.isOn(p) ? "Fechar" : "Abrir";
      });
      linhas.push(li);
    }

    if (r.motion && movimento) {
      const li = linha("motion", "Movimento", "");
      bind(li, entre([r.motion]), () => {
        const on = HA.isOn(r.motion);
        li.querySelector(".vl").textContent = on ? "Agora" : "Sem movimento";
        li.querySelector(".ig").style.color = on ? "var(--tint)" : "";
      });
      linhas.push(li);
    }

    janelas(r).forEach((w) => {
      const li = linha("window", HA.name(w), "");
      bind(li, entre([w]), () => {
        const aberta = HA.isOn(w);
        li.querySelector(".vl").textContent = aberta ? "Aberta" : "Fechada";
        li.querySelector(".ig").style.color = aberta ? "var(--warn)" : "";
      });
      linhas.push(li);
    });

    if (r.contact) {
      const li = linha("door", "Porta", "");
      bind(li, entre([r.contact]), () => {
        const aberta = HA.isOn(r.contact);
        li.querySelector(".vl").textContent = aberta ? "Aberta" : "Fechada";
        li.querySelector(".ig").style.color = aberta ? "var(--warn)" : "";
      });
      linhas.push(li);
    }

    if (r.lock) {
      const li = linha("lock", "Fechadura", "");
      const b = el('<button class="pill"></button>');
      li.appendChild(b);
      b.addEventListener("click", () => {
        const trancada = (HA.get(r.lock) || {}).state === "locked";
        HA.call("lock", trancada ? "unlock" : "lock", r.lock);
      });
      bind(li, entre([r.lock]), () => {
        const trancada = (HA.get(r.lock) || {}).state === "locked";
        li.querySelector(".vl").textContent = trancada ? "Trancada" : "Destrancada";
        li.querySelector(".ig").style.color = trancada ? "" : "var(--warn)";
        b.textContent = trancada ? "Destrancar" : "Trancar";
      });
      linhas.push(li);
    }

    if (!linhas.length) return null;
    linhas.forEach((l) => g.appendChild(l));
    return g;
  }

  function detalhe(r) {
    const naMao = ecra() === "mao";
    const raiz = el(`<div class="${naMao ? "scroll " : ""}pad col grow"></div>`);

    // ── cabeçalho: voltar, nome, ações de grupo ──
    const head = el(`<div class="head">
      <div class="row cab">
        <button class="pill voltar">${icon("back", "ic-s")}Divisões</button>
        <div><div class="t2">${esc(r.name)}</div><div class="ft linha-sub"></div></div>
      </div></div>`);
    head.querySelector(".voltar").addEventListener("click", () => {
      location.hash = "#/divisoes";
    });

    const acoes = el('<div class="row acoes"></div>');
    const apagar = el(`<button class="pill">${icon("bulb", "ic-s")}Desligar as luzes</button>`);
    apagar.addEventListener("click", () => HA.call("light", "turn_off", luzes(r)));
    const fechar = el(`<button class="pill">${icon("blinds", "ic-s")}Fechar os estores</button>`);
    fechar.addEventListener("click", () => HA.call("cover", "set_cover_position", estores(r), { position: 0 }));
    if (luzes(r).length) acoes.appendChild(apagar);
    if (estores(r).length) acoes.appendChild(fechar);

    bind(head, entre(idsDe(r)), () => {
      const t = r.temperature ? HA.num(r.temperature) : null;
      const h = r.humidity ? HA.num(r.humidity) : null;
      const partes = [nomePiso(r.floor)];
      if (t !== null) partes.push(`${fmt.n(t, 1)} °C`);
      if (h !== null) partes.push(`${fmt.n(h)} %`);
      if (r.motion) partes.push(HA.isOn(r.motion) ? "movimento agora" : "sem movimento");
      head.querySelector(".linha-sub").textContent = partes.join(" · ");
      apagar.disabled = acesasDe(r).length === 0;
      fechar.disabled = abertosDe(r).length === 0;
    });

    if (naMao) {
      raiz.append(head, acoes);
    } else {
      head.appendChild(acoes);
      raiz.appendChild(head);
    }

    // ── corpo: duas colunas na parede, uma na mão ──
    const esq = el('<div class="col"></div>');
    const dir = el('<div class="col"></div>');
    if (r.climate) esq.appendChild(climaCard(r));
    if (luzes(r).length) esq.appendChild(luzesCard(r));
    if (estores(r).length) dir.appendChild(estoresCard(r));
    const l = listaDaDivisao(r);
    if (l) dir.appendChild(l);
    if (r.camera) {
      const c = K.camara({ entidade: r.camera, nome: r.name, grande: true });
      (dir.children.length ? dir : esq).appendChild(c);
    }
    // uma divisão só com uma coluna cheia não fica com a outra vazia
    if (!esq.children.length && dir.children.length > 1) esq.appendChild(dir.firstElementChild);

    const corpo = el('<div class="detail"></div>');
    corpo.append(esq, dir);
    raiz.appendChild(corpo);
    return raiz;
  }

  // ───────── Rota ─────────

  function divisoesView(args) {
    const r = args && args[0] ? divisoes().find((d) => d.id === args[0]) : null;
    return r ? detalhe(r) : lista();
  }

  window.VIEWS.divisoes = divisoesView;
  // os Controlos reutilizam estas duas peças
  K.climaCard = climaCard;
  K.rotuloEstore = rotuloEstore;
  // e a planta, no painel da divisão
  K.listaDaDivisao = listaDaDivisao;
})();
