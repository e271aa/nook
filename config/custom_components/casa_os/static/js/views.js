/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — as secções.
 *
 *  Fase 0: a casca está de pé e as seis secções existem, vazias. Cada uma
 *  diz o que vai viver lá e em que fase nasce, em vez de fingir com caixas
 *  cinzentas. À medida que as fases avançam, estas páginas desaparecem.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const { el, esc, icon, fmt } = window.UI;
  const HA = window.HA;

  function page(titulo, sub, corpo) {
    const node = el('<div class="pad col grow"></div>');
    node.appendChild(
      el(`<div class="head"><div>
        <div class="t2">${esc(titulo)}</div>
        <div class="ft">${esc(sub)}</div>
      </div></div>`),
    );
    node.appendChild(corpo);
    return node;
  }

  function porConstruir(ico, oQueVaiViver, fase) {
    return el(`<div class="empty">
      <span class="mark">${icon(ico, "ic-l")}</span>
      <div class="et">Por construir</div>
      <div class="es">${esc(oQueVaiViver)}</div>
      <div class="ft">Fase ${esc(fase)}</div>
    </div>`);
  }

  /** Uma linha viva, para se ver que a casa está mesmo do outro lado. */
  function pulso() {
    const node = el('<div class="ft" style="text-align:center"></div>');
    const pinta = () => {
      const n = HA.count ? HA.count() : null;
      node.textContent = n ? `A casa responde · ${fmt.n(n)} aparelhos` : "À espera da casa…";
    };
    HA.subscribe(pinta);
    pinta();
    return node;
  }

  function casa() {
    const corpo = el('<div class="col grow"></div>');
    corpo.appendChild(
      porConstruir(
        "home",
        "O veredicto da casa em letra grande, os avisos com espaço reservado mesmo quando não há nenhum, seis teclas para o que se faz todos os dias, e a energia de agora numa linha.",
        "1 e 2",
      ),
    );
    corpo.appendChild(pulso());
    return page("Casa", "O estado da casa num relance", corpo);
  }

  function divisoes() {
    return page(
      "Divisões",
      "Dez divisões em três pisos",
      porConstruir(
        "rooms",
        "As divisões numa grelha que enche o ecrã, por piso, e o detalhe de cada uma com as luzes, os estores, o clima, as tomadas e os sensores.",
        "3",
      ),
    );
  }

  function controlos() {
    return page(
      "Controlos",
      "Tudo o que se liga, abre e aquece",
      porConstruir(
        "sliders",
        "Luzes, estores, clima e tomadas, cada um no seu separador, com as ações de grupo em cima — desligar todas, fechar todos, a casa a 21 graus.",
        "4",
      ),
    );
  }

  function vigilancia() {
    return page(
      "Vigilância",
      "A casa fechada, e quem passou",
      porConstruir(
        "camera",
        "As três câmaras ao vivo, e por baixo o estado do fecho da casa: portas, janelas, movimento e fechaduras, com os últimos acontecimentos.",
        "5",
      ),
    );
  }

  function energia() {
    return page(
      "Energia",
      "De onde vem e para onde vai",
      porConstruir(
        "bolt",
        "O fluxo de agora — sol, casa, rede e bateria — e o relatório atrás dele: trinta dias, sete circuitos e o custo.",
        "6",
      ),
    );
  }

  function rotina() {
    return page(
      "Rotina",
      "O que a casa tem para tratar",
      porConstruir(
        "list",
        "Os lembretes com prazo, a lista de compras, os próximos dias da agenda, e o que está a dar na TV. Fora da TV da sala — não se mostram as compras a visitas.",
        "6",
      ),
    );
  }

  window.VIEWS = { casa, divisoes, controlos, vigilancia, energia, rotina };
})();
