/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — Dashboard.
 *
 *  A vista do painel anterior, com a mesma filosofia: três colunas que se arrastam,
 *  e um menu que faz o mesmo que a barra lateral.
 *
 *    esquerda — o dia (energia desde a meia-noite, o que vem na agenda), o
 *               comando de tudo e o sistema. As ações rápidas ficam na Casa:
 *               repeti-las aqui era a mesma decisão em dois sítios
 *    centro   — para onde se vai: um mosaico por secção, cada um com o seu
 *               resumo vivo. É a barra lateral em grande, com o estado lá dentro
 *    direita  — o que se vigia: o fecho da casa e as câmaras
 *
 *  Nada aqui é novo: cada peça vem de uma secção que já existe e leva para ela.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { CFG, bind, entre, ecra, divisoes, todasLuzes, todosEstores, acesas, abertos } = K;

  // Proporções de origem, por tipo de ecrã. A esquerda precisa de espaço para as
  // teclas; a TV dá mais ao centro, que é o que se vê de longe.
  const PADRAO = { braco: [31, 36, 33], sala: [26, 40, 34] };

  const go = (id) => {
    location.hash = `#/${id === "casa" ? "" : id}`;
  };

  const dataPorExtenso = () => {
    const s = new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const plural = (n, um, varios) => `${fmt.n(n)} ${n === 1 ? um : varios}`;
  const potencia = (v) => (v === null || v === undefined ? "—" : Math.abs(v) >= 1000 ? `${fmt.n(v / 1000, 2)} kW` : `${fmt.n(Math.round(v))} W`);
  const w = (id) => (id ? HA.num(id) : null);

  // ───────── O mosaico: o menu em grande ─────────

  /** As secções que o mosaico mostra, cada uma com o que diz de si própria. */
  function secoes() {
    const P = (CFG.energy || {}).power || {};
    const listas = CFG.listas || {};
    const lista = [
      {
        id: "divisoes", nome: "Divisões", ic: "rooms",
        vigia: (id) => id.startsWith("light."),
        diz: () => {
          const on = divisoes().filter((r) => (r.lights || []).some((l) => HA.isOn(l))).length;
          return [plural(divisoes().length, "divisão", "divisões"), on ? `${plural(on, "com luz acesa", "com luz acesa")}` : "todas apagadas"];
        },
      },
      {
        id: "controlos", nome: "Controlos", ic: "sliders",
        vigia: (id) => id.startsWith("light.") || id.startsWith("cover.") || id.startsWith("climate."),
        diz: () => {
          const luzes = acesas().length;
          const ab = abertos().length;
          return [luzes ? plural(luzes, "luz acesa", "luzes acesas") : "luzes apagadas", `${fmt.n(ab)} de ${fmt.n(todosEstores().length)} estores abertos`];
        },
      },
      {
        id: "vigilancia", nome: "Vigilância", ic: "camera",
        vigia: (id) => id.startsWith("binary_sensor.") || id.startsWith("lock.") || id.startsWith("cover."),
        diz: () => {
          const n = K.porFechar ? K.porFechar() : 0;
          const cams = (CFG.cameras || []).length;
          return [n ? plural(n, "coisa por fechar", "coisas por fechar") : "Fechada e trancada", plural(cams, "câmara ao vivo", "câmaras ao vivo")];
        },
      },
      {
        id: "energia", nome: "Energia", ic: "bolt",
        vigia: (id) => id.startsWith("sensor.potencia"),
        diz: () => {
          const casa = w(P.home);
          const sol = w(P.solar);
          return [`${potencia(casa)} em casa`, sol > 20 ? `${potencia(sol)} do sol` : "sem sol neste momento"];
        },
      },
      {
        id: "rotina", nome: "Rotina", ic: "list",
        vigia: (id) => id.startsWith("todo.") || id.startsWith("media_player.") || id.startsWith("vacuum."),
        diz: () => {
          const l = listas.lembretes ? HA.num(listas.lembretes) : null;
          const c = listas.compras ? HA.num(listas.compras) : null;
          return [l === null ? "Lembretes" : l ? plural(l, "lembrete por fazer", "lembretes por fazer") : "Nada por fazer", c === null ? "" : `${plural(c, "compra", "compras")} na lista`];
        },
      },
    ];
    // a planta só entra onde existe
    if (CFG.planta) {
      lista.push({
        id: "planta", nome: "Planta", ic: "planta",
        vigia: (id) => id.startsWith("light.") || id.startsWith("vacuum."),
        diz: () => {
          const pisos = (CFG.planta.pisos || []).length;
          const robo = CFG.robo && HA.get(CFG.robo.entidade);
          return [robo && robo.state === "cleaning" ? "O robô está a limpar" : "A casa vista de cima", `${fmt.n(pisos)} pisos`];
        },
      });
    }
    return lista;
  }

  function mosaico() {
    const grelha = el('<div class="mmenu"></div>');
    secoes().forEach((s) => {
      const t = el(`<button class="dtile">
        <span class="badge">${icon(s.ic, "ic-l")}</span>
        <span class="dt-txt"><span class="tn">${esc(s.nome)}</span>
          <span class="tv"></span><span class="ts"></span></span>
        <span class="seta">${icon("chev", "ic-s")}</span></button>`);
      t.addEventListener("click", () => go(s.id));
      bind(t, s.vigia, () => {
        const [a, b] = s.diz();
        // o título de cada mosaico começa em maiúscula, venha o resumo como vier
        t.querySelector(".tv").textContent = a ? a.charAt(0).toUpperCase() + a.slice(1) : "";
        t.querySelector(".ts").textContent = b;
      });
      grelha.appendChild(t);
    });
    // o último não deixa buraco: ocupa o que sobra da linha
    const n = grelha.children.length;
    if (n % 2 === 1) grelha.lastElementChild.style.gridColumn = "1 / -1";
    return grelha;
  }

  // ───────── Esquerda: o que se faz ─────────

  function comandoDeTudo() {
    const node = el('<div class="card comando"><span class="cap">Tudo de uma vez</span><div class="grouped"></div></div>');
    const g = node.querySelector(".grouped");

    // luzes: um interruptor para todas
    const luzes = K.linha("bulb", "Luzes", "");
    const sw = K.interruptor("Todas as luzes");
    luzes.querySelector(".vl").classList.add("num");
    luzes.appendChild(sw);
    sw.addEventListener("click", () => HA.call("light", acesas().length ? "turn_off" : "turn_on", todasLuzes()));
    bind(luzes, (id) => id.startsWith("light."), () => {
      luzes.querySelector(".vl").textContent = `${fmt.n(acesas().length)}/${fmt.n(todasLuzes().length)}`;
      sw.definir(acesas().length > 0);
      luzes.querySelector(".ig").style.color = acesas().length ? "var(--tint)" : "";
    });
    g.appendChild(luzes);

    // estores: abrir, parar, fechar — para todos
    const estores = K.linha("blinds", "Estores", "");
    const btns = el(`<span class="tres">
      <button data-a="open_cover" aria-label="Abrir todos">${icon("up", "ic-s")}</button>
      <button data-a="stop_cover" aria-label="Parar">${icon("stop", "ic-s")}</button>
      <button data-a="close_cover" aria-label="Fechar todos">${icon("down", "ic-s")}</button></span>`);
    btns.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => HA.call("cover", b.dataset.a, todosEstores())));
    estores.querySelector(".vl").remove();
    estores.classList.add("dupla"); // numa coluna estreita os botões vão para a linha de baixo
    estores.appendChild(btns);
    g.appendChild(estores);
    return node;
  }

  function sistema() {
    const S = CFG.sistema || {};
    const node = el(`<div class="card"><span class="cap">Sistema</span>
      <div class="sis">
        <div class="stat"><div class="v num" data-k="cpu"></div><div class="k">Processador</div></div>
        <div class="stat"><div class="v num" data-k="temp"></div><div class="k">Temperatura</div></div>
        <div class="stat"><div class="v num" data-k="ram"></div><div class="k">Memória</div></div>
      </div><div class="pessoas"></div></div>`);
    const v = (k, txt) => (node.querySelector(`[data-k="${k}"]`).innerHTML = txt);
    const un = (x, u) => (x === null ? "—" : `${fmt.n(x)}<small> ${u}</small>`);
    bind(node, entre([S.cpu, S.temperatura, S.memoria]), () => {
      v("cpu", un(w(S.cpu), "%"));
      v("temp", w(S.temperatura) === null ? "—" : `${fmt.n(w(S.temperatura), 0)}<small> °C</small>`);
      v("ram", un(w(S.memoria), "%"));
    });

    // quem está em casa, com a bateria do telemóvel
    const pessoas = node.querySelector(".pessoas");
    (CFG.people || []).forEach((p) => {
      const pill = el(`<span class="pill"></span>`);
      bind(pill, entre([p.entity, p.battery]), () => {
        const casa = (HA.get(p.entity) || {}).state === "home";
        const bat = p.battery ? HA.num(p.battery) : null;
        pill.className = `pill ${casa ? "on" : ""}`;
        // curto: dois nomes têm de caber na mesma linha. A cor diz se está em casa.
        pill.textContent = `${p.name}${casa ? "" : " · fora"}${bat !== null ? ` · ${fmt.n(bat)} %` : ""}`;
        pill.title = `${p.name}: ${casa ? "em casa" : "fora"}`;
      });
      pessoas.appendChild(pill);
    });
    return node;
  }

  /**
   * Numa coluna que não rola, o que não cabe sai, do fim para o princípio: o
   * cartão mais importante é o primeiro e é o último a ir. Melhor um cartão a
   * menos do que uma coluna com barra de rolar.
   */
  function esconderOQueNaoCabe(col) {
    const ajusta = () => {
      if (!col.isConnected) return;
      const filhos = [...col.children];
      filhos.forEach((c) => (c.style.display = ""));
      for (let i = filhos.length - 1; i > 0 && col.scrollHeight - col.clientHeight > 1; i--) {
        if (getComputedStyle(filhos[i]).display !== "none") filhos[i].style.display = "none";
      }
    };
    new ResizeObserver(ajusta).observe(col);
    window.addEventListener("casa-tamanho", () => setTimeout(ajusta, 0)); // não rAF: com o ecrã escondido não corre
    setTimeout(ajusta, 0);
    return ajusta;
  }

  /**
   * O dia: o que a Casa não diz. A energia gasta desde a meia-noite (e quanto
   * veio do sol, e quanto custou) e o que vem a seguir na agenda. As ações
   * rápidas vivem na Casa; aqui repeti-las era só mais seis botões.
   */
  function oDia() {
    const E = CFG.energy || {};
    const T = E.totals || {};
    const node = el(`<div class="card o-dia"><span class="cap">O dia</span>
      <div class="sis">
        <div class="stat"><div class="v num" data-k="casa">—</div><div class="k">kWh gastos</div></div>
        <div class="stat sol"><div class="v num" data-k="sol">—</div><div class="k">kWh do sol</div></div>
        <div class="stat"><div class="v num" data-k="custo">—</div><div class="k">€ à rede</div></div>
      </div>
      <div class="grouped proximos"></div></div>`);
    const v = (k, txt) => (node.querySelector(`[data-k="${k}"]`).innerHTML = txt);
    const soma = (linhas) => (linhas || []).reduce((t, r) => t + ((r.change || 0) >= 0 ? r.change || 0 : Math.max(0, r.sum || 0)), 0);

    K.intervalo(async () => {
      const ids = [T.home, T.solar, T.import].filter(Boolean);
      if (!ids.length) return;
      const ini = new Date();
      ini.setHours(0, 0, 0, 0);
      try {
        const st = await HA.statistics(ids, ini, null, "hour");
        // a unidade vai na legenda: numa coluna estreita o número tem de caber inteiro
        v("casa", fmt.n(soma(st[T.home]), 1));
        v("sol", fmt.n(soma(st[T.solar]), 1));
        v("custo", fmt.n(soma(st[T.import]) * (E.tariff || 0), 2));
      } catch (_) {
        // sem histórico fica o traço: não se inventa um zero
      }
    }, 5 * 60 * 1000);

    const lista = node.querySelector(".proximos");
    const AGENDAS = CFG.calendarios || [];
    if (!AGENDAS.length) lista.remove();
    else {
      K.intervalo(async () => {
        const ini = new Date();
        const fim = new Date(Date.now() + 3 * 86400000);
        const listas = await Promise.all(AGENDAS.map((a) => HA.calendario(a.entidade, ini, fim).catch(() => [])));
        const eventos = listas
          .flat()
          .map((e) => {
            const diaInteiro = !!(e.start && e.start.date);
            return { titulo: e.summary, diaInteiro, inicio: new Date(diaInteiro ? `${e.start.date}T00:00:00` : e.start.dateTime) };
          })
          .sort((a, b) => a.inicio - b.inicio)
          .slice(0, 2);
        lista.innerHTML = "";
        if (!eventos.length) {
          lista.appendChild(K.linha("calendar", "Nada marcado", "próximos 3 dias"));
          return;
        }
        const hoje = new Date().toDateString();
        const amanha = new Date(Date.now() + 86400000).toDateString();
        eventos.forEach((e) => {
          const dia = e.inicio.toDateString() === hoje ? "hoje" : e.inicio.toDateString() === amanha ? "amanhã" : fmt.diaSemana(e.inicio).split(",")[0];
          const h = e.diaInteiro ? "" : ` ${String(e.inicio.getHours()).padStart(2, "0")}:${String(e.inicio.getMinutes()).padStart(2, "0")}`;
          lista.appendChild(K.linha("calendar", e.titulo, `${dia}${h}`));
        });
      }, 10 * 60 * 1000);
    }
    return node;
  }

  function esquerda() {
    const col = el('<div class="col dcol"></div>');
    col.append(oDia(), comandoDeTudo(), sistema());
    esconderOQueNaoCabe(col);
    return col;
  }

  // ───────── Direita: o que se vigia ─────────

  function direita() {
    const col = el('<div class="col dcol"></div>');
    const topo = el('<div class="sb"><span class="cap">Vigilância</span></div>');
    if (K.estadoFecho) topo.appendChild(K.estadoFecho());
    col.appendChild(topo);

    const pilha = el('<div class="camstack"></div>');
    (CFG.cameras || []).slice(0, 4).forEach((c) => {
      const sala = divisoes().find((r) => r.camera === c.entity);
      pilha.appendChild(K.camara({ entidade: c.entity, nome: c.name, movimento: sala && sala.motion }));
    });
    col.appendChild(pilha);
    return col;
  }

  // ───────── A vista ─────────

  function dashboard() {
    const naMao = ecra() === "mao";
    const raiz = el(`<div class="${naMao ? "scroll " : ""}pad col grow dashboard"></div>`);
    raiz.appendChild(el(`<div class="head"><div><div class="t2">Dashboard</div>
      <div class="ft">${esc(dataPorExtenso())}</div></div></div>`));

    const painel = el(`<div class="dash${naMao ? " mao" : ""}"></div>`);
    const esq = esquerda();
    const centro = el('<div class="col dcol"></div>');
    centro.appendChild(mosaico());
    const dir = direita();

    if (naMao) {
      // no telemóvel empilham-se: primeiro para onde ir, depois o que fazer, por fim o que vigiar
      painel.append(centro, esq, dir);
    } else {
      esq.style.gridColumn = "1";
      centro.style.gridColumn = "3";
      dir.style.gridColumn = "5";
      painel.append(esq, centro, dir);
      K.colunasArrastaveis(painel, { chave: "dashboard", padrao: PADRAO, colunas: [esq, centro, dir] });
    }
    raiz.appendChild(painel);
    return raiz;
  }

  window.VIEWS.dashboard = dashboard;
})();
