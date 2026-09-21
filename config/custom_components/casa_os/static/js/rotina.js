/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — Rotina.
 *
 *  O que não é aparelho: o papel da casa — lembretes, compras, agenda — e o
 *  que está a mexer agora, a TV e o robô. Não vai à TV da sala: não se
 *  mostram as compras a visitas.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;
  const K = window.KIT;
  const { CFG, bind, entre, ecra } = K;

  const LISTAS = CFG.listas || {};
  const AGENDAS = CFG.calendarios || [];
  const DIAS_AGENDA = 7;
  const REFRESCO = 5 * 60 * 1000;

  // ───────── Datas, ditas como as diria uma pessoa ─────────

  const inicioDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diasAte = (d) => Math.round((inicioDoDia(d) - inicioDoDia(new Date())) / 86400000);
  const mes = (d) => d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" }).replace(".", "");

  function quando(d) {
    const n = diasAte(d);
    if (n < 0) return { texto: n === -1 ? "ontem" : `há ${-n} dias`, atrasado: true };
    if (n === 0) return { texto: "hoje" };
    if (n === 1) return { texto: "amanhã" };
    if (n < 7) return { texto: d.toLocaleDateString("pt-PT", { weekday: "long" }) };
    return { texto: mes(d) };
  }

  // ───────── Lembretes e compras ─────────

  const marcar = (entidade, item, feito) =>
    HA.call("todo", "update_item", entidade, { item: item.uid, status: feito ? "completed" : "needs_action" });

  function lembretes() {
    const id = LISTAS.lembretes;
    const node = el(`<div class="card grow lembretes">
      <div class="sb"><span class="cap">Lembretes</span><span class="pill contagem"></span></div>
      <div class="lista"></div></div>`);
    const corpo = node.querySelector(".lista");
    let itens = [];

    const pinta = () => {
      corpo.innerHTML = "";
      const pendentes = itens.filter((i) => i.status !== "completed");
      node.querySelector(".contagem").textContent = pendentes.length ? `${fmt.n(pendentes.length)} por fazer` : "Tudo feito";
      const ordem = [...itens].sort((a, b) => {
        if ((a.status === "completed") !== (b.status === "completed")) return a.status === "completed" ? 1 : -1;
        return (a.due || "9999").localeCompare(b.due || "9999");
      });
      if (!ordem.length) corpo.appendChild(el('<div class="empty-mini">Nada para lembrar.</div>'));
      ordem.forEach((i) => {
        const feito = i.status === "completed";
        const q = i.due ? quando(new Date(`${i.due}T00:00:00`)) : null;
        const linha = el(`<div class="tarefa${feito ? " feito" : ""}">
          <button class="caixa" role="checkbox" aria-checked="${feito}" aria-label="${esc(i.summary)}"><span></span></button>
          <span class="bd tt">${esc(i.summary)}</span>
          ${q ? `<span class="ft ${q.atrasado ? "atraso" : "dim2"}">${esc(q.texto)}</span>` : ""}</div>`);
        linha.querySelector(".caixa").addEventListener("click", () => {
          i.status = feito ? "needs_action" : "completed"; // já se vê; a casa confirma logo a seguir
          pinta();
          marcar(id, i, !feito);
        });
        corpo.appendChild(linha);
      });
      ajusta();
    };
    const ajusta = ecra() === "mao" ? () => {} : K.cabem(corpo);

    const le = async () => {
      try {
        itens = await HA.todoItens(id);
        pinta();
      } catch (e) {
        corpo.innerHTML = '<div class="empty-mini">Não foi possível ler os lembretes.</div>';
      }
    };
    bind(node, entre([id]), le);
    return node;
  }

  function compras() {
    const id = LISTAS.compras;
    const node = el(`<div class="card compras">
      <div class="sb"><span class="cap">Compras</span><span class="pill contagem"></span></div>
      <div class="row pilulas"></div></div>`);
    const corpo = node.querySelector(".pilulas");
    let itens = [];

    const pinta = () => {
      corpo.innerHTML = "";
      const faltam = itens.filter((i) => i.status !== "completed");
      node.querySelector(".contagem").textContent = fmt.n(faltam.length);
      if (!itens.length) corpo.appendChild(el('<div class="empty-mini">A lista está vazia.</div>'));
      [...faltam, ...itens.filter((i) => i.status === "completed")].forEach((i) => {
        const feito = i.status === "completed";
        const b = el(`<button class="pill compra${feito ? " feito" : ""}" aria-pressed="${feito}">${icon("cart")}${esc(i.summary)}</button>`);
        b.addEventListener("click", () => {
          i.status = feito ? "needs_action" : "completed";
          pinta();
          marcar(id, i, !feito);
        });
        corpo.appendChild(b);
      });
    };

    const le = async () => {
      try {
        itens = await HA.todoItens(id);
        pinta();
      } catch (e) {
        corpo.innerHTML = '<div class="empty-mini">Não foi possível ler as compras.</div>';
      }
    };
    bind(node, entre([id]), le);
    return node;
  }

  // ───────── A dar agora ─────────

  function tv() {
    const id = CFG.tv;
    if (!id) return null;
    const node = el(`<div class="agora">
      <div class="row cima"><span class="ic-l-wrap">${icon("tv", "ic-l")}</span>
        <div class="grow"><div class="hd titulo"></div><div class="ft detalhe"></div></div></div>
      <div class="row ctl">
        <button class="pill" data-a="pp"></button>
        <button class="pill" data-a="menos" aria-label="Baixar o volume">${icon("minus", "ic-s")}</button>
        <button class="pill" data-a="mais" aria-label="Subir o volume">${icon("plus", "ic-s")}</button>
        <select class="pill fonte" aria-label="Trocar de fonte"></select>
      </div></div>`);
    const sel = node.querySelector(".fonte");
    const fontes = HA.attr(id, "source_list", []) || [];
    fontes.forEach((f) => sel.appendChild(el(`<option value="${esc(f)}">${esc(f)}</option>`)));
    sel.addEventListener("change", () => HA.call("media_player", "select_source", id, { source: sel.value }));

    const volume = (d) => {
      const v = HA.attr(id, "volume_level", 0.2);
      HA.call("media_player", "volume_set", id, { volume_level: Math.max(0, Math.min(1, Math.round((v + d) * 100) / 100)) });
    };
    node.querySelector('[data-a="menos"]').addEventListener("click", () => volume(-0.05));
    node.querySelector('[data-a="mais"]').addEventListener("click", () => volume(0.05));
    node.querySelector('[data-a="pp"]').addEventListener("click", () => {
      const st = (HA.get(id) || {}).state;
      if (st === "off") HA.call("media_player", "turn_on", id);
      else HA.call("media_player", "media_play_pause", id);
    });

    return bind(node, entre([id]), () => {
      const s = HA.get(id) || { state: "off" };
      const desligada = s.state === "off";
      node.classList.toggle("off", desligada);
      node.querySelector(".titulo").textContent = desligada ? "TV desligada" : HA.attr(id, "media_title", "TV ligada");
      node.querySelector(".detalhe").textContent = desligada
        ? "Liga-a daqui"
        : `${HA.attr(id, "app_name", HA.attr(id, "source", ""))} · volume ${fmt.n(Math.round((HA.attr(id, "volume_level", 0) || 0) * 100))} %`;
      node.querySelector('[data-a="pp"]').textContent = desligada ? "Ligar" : s.state === "paused" ? "Retomar" : "Pausa";
      node.querySelectorAll('[data-a="menos"],[data-a="mais"]').forEach((b) => (b.disabled = desligada));
      sel.disabled = desligada;
      sel.value = HA.attr(id, "source", "");
    });
  }

  const ESTADO_ROBO = {
    docked: "Na base", cleaning: "A limpar", returning: "A voltar à base", paused: "Em pausa", idle: "Parado", error: "Com um problema",
  };

  function robo() {
    const r = CFG.robo || {};
    if (!r.entidade) return null;
    const node = el(`<div class="agora">
      <div class="row cima"><span class="ic-l-wrap dim2">${icon("robot", "ic-l")}</span>
        <div class="grow"><div class="hd">Robô aspirador</div><div class="ft detalhe"></div></div>
        <button class="pill on principal"></button></div></div>`);
    const b = node.querySelector(".principal");
    b.addEventListener("click", () => {
      const st = (HA.get(r.entidade) || {}).state;
      if (st === "cleaning") HA.call("vacuum", "return_to_base", r.entidade);
      else HA.call("vacuum", "start", r.entidade);
    });
    return bind(node, entre([r.entidade, r.bateria]), () => {
      const st = (HA.get(r.entidade) || {}).state;
      const bat = r.bateria ? HA.num(r.bateria) : HA.attr(r.entidade, "bateria");
      node.querySelector(".detalhe").textContent = `${ESTADO_ROBO[st] || st}${bat !== null && bat !== undefined ? ` · bateria a ${fmt.n(bat)} %` : ""}`;
      b.textContent = st === "cleaning" ? "Voltar à base" : "Limpar";
    });
  }

  function agoraCard() {
    const node = el('<div class="card"><span class="cap">A dar agora</span></div>');
    const t = tv();
    const r = robo();
    if (t) node.appendChild(t);
    if (t && r) node.appendChild(el('<div class="risco"></div>'));
    if (r) node.appendChild(r);
    return node;
  }

  // ───────── Agenda ─────────

  function agenda() {
    const node = el('<div class="card grow agenda"><div class="sb"><span class="cap">Agenda</span></div><div class="lista"></div></div>');
    const corpo = node.querySelector(".lista");
    const ajusta = ecra() === "mao" ? () => {} : K.cabem(corpo);
    let eventos = [];

    const pinta = () => {
      corpo.innerHTML = "";
      if (!eventos.length) {
        corpo.appendChild(el(`<div class="empty-mini">Nada marcado nos próximos ${DIAS_AGENDA} dias.</div>`));
        return;
      }
      eventos.forEach((e) => {
        const dia = quando(e.inicio);
        const h = e.diaInteiro ? "o dia todo" : `${String(e.inicio.getHours()).padStart(2, "0")}:${String(e.inicio.getMinutes()).padStart(2, "0")}`;
        corpo.appendChild(el(`<div class="evento">
          <span class="bd">${esc(e.titulo)}</span>
          <span class="ft dim2">${esc(dia.texto)} · ${esc(h)}</span></div>`));
      });
      ajusta();
    };

    const le = async () => {
      const ini = new Date();
      const fim = new Date(Date.now() + DIAS_AGENDA * 86400000);
      try {
        const listas = await Promise.all(AGENDAS.map((a) => HA.calendario(a.entidade, ini, fim).catch(() => [])));
        eventos = listas
          .flat()
          .map((e) => {
            const diaInteiro = !!(e.start && e.start.date);
            return {
              titulo: e.summary,
              diaInteiro,
              inicio: new Date(diaInteiro ? `${e.start.date}T00:00:00` : e.start.dateTime),
            };
          })
          .sort((a, b) => a.inicio - b.inicio);
        pinta();
      } catch (err) {
        corpo.innerHTML = '<div class="empty-mini">Não foi possível ler a agenda.</div>';
      }
    };
    K.intervalo(le, REFRESCO);
    return node;
  }

  // ───────── Vista ─────────

  function rotina() {
    const naMao = ecra() === "mao";
    const raiz = el(`<div class="${naMao ? "scroll " : ""}pad col grow"></div>`);
    raiz.appendChild(el(`<div class="head"><div><div class="t2">Rotina</div>
      <div class="ft">O que não é aparelho: papel da casa, e o que está a mexer agora.</div></div></div>`));

    if (naMao) {
      raiz.append(agoraCard(), lembretes(), compras(), agenda());
      return raiz;
    }
    const corpo = el('<div class="row meio"></div>');
    const esq = el('<div class="col"></div>');
    const dir = el('<div class="col"></div>');
    esq.style.flex = "1";
    dir.style.flex = "1";
    esq.append(lembretes(), compras());
    dir.append(agoraCard(), agenda());
    corpo.append(esq, dir);
    raiz.appendChild(corpo);
    return raiz;
  }

  window.VIEWS.rotina = rotina;
})();
