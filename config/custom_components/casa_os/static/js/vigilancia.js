/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — Vigilância.
 *
 *  Não é um mosaico de câmaras: isso seria meio ecrã vazio a maior parte do
 *  tempo. É o estado da casa fechada — portas, janelas, fechaduras e
 *  movimento — com as câmaras ao vivo ao lado e, por baixo, o que aconteceu.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { CFG, bind, entre, ecra, divisoes, eGaragem } = K;

  const JANELA_HORAS = 6; // o diário mostra as últimas seis horas
  const MAX_CAMARAS = 5; // uma grande e até quatro pequenas
  const JUNTAR_MOVIMENTO = 5 * 60 * 1000; // movimento repetido no mesmo sítio vira uma linha

  // ───────── O que a casa vigia ─────────

  const salas = () => divisoes();
  const portas = () => salas().filter((r) => r.contact || r.lock);
  const janelas = () => salas().flatMap((r) => (r.windows || []).map((id) => ({ id, r })));
  const portoes = () => salas().flatMap((r) => (r.covers || []).filter(eGaragem).map((id) => ({ id, r })));
  // movimento que interessa a quem vigia: onde há câmara, e portanto rua
  const sensoresRua = () => salas().filter((r) => r.motion && r.camera);

  const idsVigiados = () => [
    ...portas().flatMap((r) => [r.contact, r.lock]),
    ...janelas().map((j) => j.id),
    ...portoes().map((p) => p.id),
    ...sensoresRua().map((r) => r.motion),
  ].filter(Boolean);

  /** Há quanto tempo, por extenso, para quem passa e lê de relance. */
  function haQuanto(iso) {
    if (!iso) return "";
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return "agora mesmo";
    if (min < 60) return `há ${fmt.n(min)} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${fmt.n(h)} ${h === 1 ? "hora" : "horas"}`;
    return "há mais de um dia";
  }

  const hora = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  // ───────── O estado do fecho ─────────

  /** As linhas do fecho da casa, cada uma com o que a faz mudar. */
  function linhasDoFecho() {
    const linhas = [];

    portas().forEach((r) => {
      const li = K.linha(r.lock ? "lock" : "door", "Porta de entrada", "");
      bind(li, entre([r.contact, r.lock]), () => {
        const aberta = r.contact && HA.isOn(r.contact);
        const trancada = r.lock ? (HA.get(r.lock) || {}).state === "locked" : null;
        const texto = aberta ? "Aberta" : trancada === false ? "Destrancada" : trancada ? "Trancada" : "Fechada";
        li.querySelector(".vl").textContent = texto;
        li.querySelector(".ig").style.color = aberta || trancada === false ? "var(--warn)" : "";
      });
      linhas.push({ li, ids: [r.contact, r.lock] });
    });

    portoes().forEach(({ id }) => {
      const li = K.linha("garage", "Portão da garagem", "");
      bind(li, entre([id]), () => {
        const st = (HA.get(id) || {}).state;
        li.querySelector(".vl").textContent =
          st === "opening" ? "A abrir" : st === "closing" ? "A fechar" : st === "open" ? "Aberto" : "Fechado";
        li.querySelector(".ig").style.color = st === "open" ? "var(--warn)" : "";
      });
      linhas.push({ li, ids: [id] });
    });

    janelas().forEach(({ id }) => {
      const li = K.linha("window", HA.name(id), "");
      bind(li, entre([id]), () => {
        const aberta = HA.isOn(id);
        li.querySelector(".vl").textContent = aberta ? "Aberta" : "Fechada";
        li.querySelector(".ig").style.color = aberta ? "var(--warn)" : "";
      });
      linhas.push({ li, ids: [id] });
    });

    sensoresRua().forEach((r) => {
      const li = K.linha("motion", `Movimento · ${r.name}`, "");
      li.classList.add("mov-row");
      const paint = () => {
        const s = HA.get(r.motion) || {};
        const agora = HA.isOn(r.motion);
        const q = haQuanto(s.last_changed);
        li.querySelector(".vl").textContent = agora ? "Agora" : !q ? "Sem movimento" : q === "agora mesmo" ? "Acabou agora" : q;
        li.querySelector(".ig").style.color = agora ? "var(--tint)" : "";
      };
      bind(li, entre([r.motion]), paint);
      K.intervalo(paint, 30000); // "há 5 min" tem de andar sozinho
      linhas.push({ li, ids: [r.motion] });
    });

    return linhas;
  }

  /** O que ficou por fechar, numa contagem: a resposta de uma linha à pergunta. */
  function porFechar() {
    let n = 0;
    portas().forEach((r) => {
      if (r.contact && HA.isOn(r.contact)) n++;
      else if (r.lock && (HA.get(r.lock) || {}).state !== "locked") n++;
    });
    portoes().forEach(({ id }) => (HA.get(id) || {}).state !== "closed" && n++);
    janelas().forEach(({ id }) => HA.isOn(id) && n++);
    return n;
  }

  function estado() {
    const node = el('<span class="pill"></span>');
    return bind(node, entre(idsVigiados()), () => {
      const n = porFechar();
      node.className = `pill ${n ? "warn" : "on"}`;
      node.innerHTML = `${icon(n ? "alert" : "shield")}${esc(n ? (n === 1 ? "1 coisa por fechar" : `${fmt.n(n)} coisas por fechar`) : "Fechada e trancada")}`;
    });
  }

  // ───────── O diário ─────────

  const NOMES_PESSOAS = () => Object.fromEntries((CFG.people || []).map((p) => [p.entity, p.name]));

  /** Uma entrada do diário da casa vira uma frase, ou nada se não interessa. */
  function interpreta(ev) {
    const id = ev.entity_id || "";
    const st = ev.state;
    const dom = id.split(".")[0];
    const quando = new Date(ev.when);

    const rua = sensoresRua().find((r) => r.motion === id);
    if (rua) return st === "on" ? { texto: `Movimento ${/^(jardim|escrit|quarto)/i.test(rua.name) ? "no" : "na"} ${rua.name}`, icone: "motion", quando, chave: id } : null;

    if (janelas().some((j) => j.id === id) || portas().some((r) => r.contact === id)) {
      if (st !== "on" && st !== "off") return null;
      const nome = janelas().some((j) => j.id === id) ? HA.name(id) : "Porta de entrada";
      return { texto: `${nome} ${st === "on" ? "aberta" : "fechada"}`, icone: janelas().some((j) => j.id === id) ? "window" : "door", tom: st === "on" ? "warn" : "", quando };
    }
    if (portas().some((r) => r.lock === id)) {
      if (st !== "locked" && st !== "unlocked") return null;
      return { texto: st === "locked" ? "Porta trancada" : "Porta destrancada", icone: "lock", tom: st === "unlocked" ? "warn" : "", quando };
    }
    if (dom === "person") {
      const nome = NOMES_PESSOAS()[id];
      if (!nome || (st !== "home" && st !== "not_home")) return null;
      return { texto: st === "home" ? `${nome} chegou` : `${nome} saiu`, icone: "person", quando };
    }
    if (portoes().some((p) => p.id === id)) {
      if (st === "closing" || !["open", "opening", "closed"].includes(st)) return null;
      const texto = st === "closed" ? "Portão fechado" : st === "opening" ? "Portão a abrir" : "Portão aberto";
      return { texto, icone: "garage", tom: st === "closed" ? "" : "warn", quando };
    }
    if (/fumo|smoke/.test(id) && st === "on") return { texto: "Fumo detetado", icone: "alert", tom: "danger", quando };
    if (/inundacao|moisture|agua/.test(id) && st === "on") return { texto: "Água detetada", icone: "water", tom: "danger", quando };
    return null;
  }

  /** Ordena do mais recente para o mais antigo e junta o movimento repetido. */
  function frases(bruto) {
    const cronologico = bruto.map(interpreta).filter(Boolean).sort((a, b) => a.quando - b.quando);
    const saida = [];
    const ultimoMov = {};
    cronologico.forEach((e) => {
      if (e.chave) {
        const anterior = ultimoMov[e.chave];
        if (anterior && e.quando - anterior.quando < JUNTAR_MOVIMENTO) {
          anterior.quando = e.quando;
          anterior.vezes = (anterior.vezes || 1) + 1;
          return;
        }
        ultimoMov[e.chave] = e;
      }
      saida.push(e);
    });
    return saida.reverse();
  }

  function diario({ cabem }) {
    const caixa = el(`<div class="card diario">
      <div class="sb"><span class="cap">Últimos acontecimentos</span><span class="cap dim2">${JANELA_HORAS} h</span></div>
      <div class="grouped lista"></div></div>`);
    const lista = caixa.querySelector(".lista");
    let eventos = [];
    let falhou = false;

    // na parede só cabem as linhas que cabem: o resto esconde-se, nunca corta a meio
    const ajusta = () => {
      if (!cabem) return;
      const limite = lista.clientHeight;
      [...lista.children].forEach((c) => {
        c.style.display = "";
      });
      [...lista.children].forEach((c) => {
        if (c.offsetTop + c.offsetHeight > limite + 1) c.style.display = "none";
      });
    };

    const pinta = () => {
      lista.innerHTML = "";
      if (falhou) {
        lista.appendChild(el('<div class="empty-mini">Não foi possível ler o diário da casa.</div>'));
        return;
      }
      if (!eventos.length) {
        lista.appendChild(el(`<div class="empty-mini">Nada a registar nas últimas ${JANELA_HORAS} horas.</div>`));
        return;
      }
      eventos.slice(0, 14).forEach((e) => {
        const li = K.linha(e.icone, e.texto + (e.vezes > 1 ? ` (${fmt.n(e.vezes)}×)` : ""), hora(e.quando), e.tom || "");
        li.title = haQuanto(e.quando.toISOString());
        lista.appendChild(li);
      });
      ajusta();
    };

    const le = async () => {
      try {
        const bruto = await HA.logbook(new Date(Date.now() - JANELA_HORAS * 3600e3));
        eventos = frases(bruto);
        falhou = false;
      } catch (e) {
        falhou = true;
      }
      pinta();
    };

    // de meio em meio minuto, e logo que muda uma porta, uma janela ou uma fechadura
    K.intervalo(le, 30000);
    let espera = null;
    bind(caixa, entre(portas().flatMap((r) => [r.contact, r.lock]).concat(janelas().map((j) => j.id))), () => {
      clearTimeout(espera);
      espera = setTimeout(le, 6000); // o diário só sabe do que já foi gravado
    });

    if (cabem) {
      new ResizeObserver(ajusta).observe(lista);
    }
    return caixa;
  }

  // ───────── Câmaras ─────────

  function mosaico() {
    const cams = (CFG.cameras || []).slice(0, MAX_CAMARAS).map((c) => ({
      ...c, sala: salas().find((r) => r.camera === c.entity),
    }));
    // a que está a ver movimento agora vai para a grande
    cams.sort((a, b) => Number(HA.isOn(b.sala && b.sala.motion)) - Number(HA.isOn(a.sala && a.sala.motion)));

    const naMaoAgora = ecra() === "mao";
    const node = el(`<div class="mosaico${naMaoAgora ? " mao" : ""}"></div>`);
    const resto = Math.max(1, cams.length - 1);
    node.style.gridTemplateColumns = `repeat(${naMaoAgora ? Math.min(resto, 2) : Math.min(resto, 4)}, minmax(0, 1fr))`;
    // na parede as linhas repartem a altura; na mão cada câmara tem a sua proporção
    if (!naMaoAgora) node.style.gridTemplateRows = cams.length > 1 ? "minmax(0, 1.5fr) minmax(0, 1fr)" : "minmax(0, 1fr)";
    cams.forEach((c, i) => {
      const t = K.camara({ entidade: c.entity, nome: c.name, grande: i === 0, movimento: c.sala && c.sala.motion });
      if (i === 0) t.style.gridColumn = "1 / -1";
      node.appendChild(t);
    });
    if (!cams.length) node.appendChild(el('<div class="empty-mini">Sem câmaras nesta casa.</div>'));
    return node;
  }

  // ───────── Vista ─────────

  function subtitulo() {
    const n = (CFG.cameras || []).length;
    return `${fmt.n(n)} ${n === 1 ? "câmara" : "câmaras"} ao vivo`;
  }

  function vigilancia() {
    return ecra() === "mao" ? naMao() : naParede();
  }

  function cabecalho() {
    const head = el(`<div class="head"><div>
      <div class="t2">Vigilância</div><div class="ft">${esc(subtitulo())}</div></div></div>`);
    return head;
  }

  function cartaoFecho() {
    const caixa = el('<div class="card"><span class="cap">O fecho da casa</span><div class="grouped"></div></div>');
    const g = caixa.querySelector(".grouped");
    linhasDoFecho().forEach(({ li }) => g.appendChild(li));
    return caixa;
  }

  function naParede() {
    const raiz = el('<div class="pad col grow"></div>');
    const head = cabecalho();
    head.appendChild(estado());
    raiz.appendChild(head);

    const corpo = el('<div class="vig"></div>');
    corpo.appendChild(mosaico());
    const lado = el('<div class="lado"></div>');
    lado.append(cartaoFecho(), diario({ cabem: true }));
    corpo.appendChild(lado);
    raiz.appendChild(corpo);
    return raiz;
  }

  function naMao() {
    const raiz = el('<div class="scroll pad col"></div>');
    const head = cabecalho();
    raiz.append(head, estado(), mosaico(), cartaoFecho(), diario({ cabem: false }));
    return raiz;
  }

  window.VIEWS.vigilancia = vigilancia;
})();
