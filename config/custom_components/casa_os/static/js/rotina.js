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
  const mes = (d) => fmt.diaMes(d);

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
    // sem "grow": o cartão tem o tamanho do que tem, não estica a ficar meio
    // vazio — quem ganha o espaço que sobra são as Compras, logo a seguir
    const node = el(`<div class="card lembretes">
      <div class="sb"><span class="cap">Lembretes</span><span class="pill contagem"></span></div>
      <div class="lista"></div></div>`);
    const corpo = node.querySelector(".lista");
    let itens = [];

    const linhaTarefa = (i) => {
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
      return linha;
    };

    const pinta = () => {
      corpo.innerHTML = "";
      const pendentes = itens.filter((i) => i.status !== "completed").sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
      const feitos = itens.filter((i) => i.status === "completed");
      node.querySelector(".contagem").textContent = pendentes.length ? `${fmt.n(pendentes.length)} por fazer` : "Tudo feito";
      if (!itens.length) corpo.appendChild(el('<div class="empty-mini">Nada para lembrar.</div>'));
      pendentes.forEach((i) => corpo.appendChild(linhaTarefa(i)));
      // os feitos não desaparecem, mas também não disputam espaço com o que falta fazer
      if (feitos.length) {
        const grupo = el(`<details class="feitos-grupo"><summary><span class="grow">Feitos (${fmt.n(feitos.length)})</span>${icon("down", "ic-s")}</summary></details>`);
        feitos.forEach((i) => grupo.appendChild(linhaTarefa(i)));
        grupo.addEventListener("toggle", ajusta); // abrir pode deixar de caber
        corpo.appendChild(grupo);
      }
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
        <label class="pill fonte-rot"><span class="dim">Fonte</span><span class="fonte-val"></span>${icon("down", "ic-s")}<select class="fonte-sel" aria-label="Trocar de fonte"></select></label>
      </div></div>`);
    const sel = node.querySelector(".fonte-sel");
    const fontes = HA.attr(id, "source_list", []) || [];
    fontes.forEach((f) => sel.appendChild(el(`<option value="${esc(f)}">${esc(f)}</option>`)));
    sel.addEventListener("change", () => {
      node.querySelector(".fonte-val").textContent = sel.value;
      HA.call("media_player", "select_source", id, { source: sel.value });
    });

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
      // desligada não tem fonte nenhuma a trocar — "Fonte —" não dizia nada
      node.querySelector(".fonte-rot").hidden = desligada;
      sel.disabled = desligada;
      sel.value = HA.attr(id, "source", "");
      node.querySelector(".fonte-val").textContent = sel.value || "—";
    });
  }

  const ESTADO_ROBO = {
    docked: "Na base", cleaning: "A limpar", returning: "A voltar à base", paused: "Em pausa", idle: "Parado", error: "Com um problema",
  };
  const NOME_DIVISAO = { sala: "Sala", cozinha: "Cozinha", escritorio: "Escritório", entrada: "Entrada" };

  /** Há quanto tempo, por extenso — "docked" desde há 20 min é "limpou há 20 min". */
  function haQuanto(iso) {
    if (!iso) return "";
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return "agora mesmo";
    if (min < 60) return `há ${fmt.n(min)} min`;
    const h = Math.floor(min / 60);
    return `há ${fmt.n(h)} ${h === 1 ? "hora" : "horas"}`;
  }

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
      const s = HA.get(r.entidade) || {};
      const st = s.state;
      const bat = r.bateria ? HA.num(r.bateria) : HA.attr(r.entidade, "bateria");
      const divisao = HA.attr(r.entidade, "divisao");
      // a limpar: qual divisão; parado na base: há quanto tempo acabou
      const onde = (st === "cleaning" || st === "paused") && divisao
        ? `, ${(NOME_DIVISAO[divisao] || divisao).toLowerCase()}`
        : st === "docked" && s.last_changed
          ? `, limpou ${haQuanto(s.last_changed)}`
          : "";
      node.querySelector(".detalhe").textContent = `${ESTADO_ROBO[st] || st}${onde}${bat !== null && bat !== undefined ? ` · bateria a ${fmt.n(bat)} %` : ""}`;
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
      // um título por dia (Hoje, Amanhã, sexta-feira…), não repetido em cada
      // linha — o título e os eventos desse dia são um bloco só: ou cabem os
      // dois, ou não fica um título sozinho, sem nada por baixo
      let diaAtual = null;
      let grupo = null;
      eventos.forEach((e) => {
        const dia = quando(e.inicio);
        if (dia.texto !== diaAtual) {
          diaAtual = dia.texto;
          grupo = el(`<div class="dia-grupo"><div class="cap dia-agenda">${esc(dia.texto)}</div></div>`);
          corpo.appendChild(grupo);
        }
        const h = e.diaInteiro ? "o dia todo" : `${String(e.inicio.getHours()).padStart(2, "0")}:${String(e.inicio.getMinutes()).padStart(2, "0")}`;
        grupo.appendChild(el(`<div class="evento">
          <span class="bd">${esc(e.titulo)}</span>
          <span class="ft dim2">${esc(h)}</span></div>`));
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
