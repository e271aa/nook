/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — peças partilhadas: criar elementos, escapar texto, ícones da
 *  folha de símbolos e números à portuguesa.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const el = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );

  /** Ícone da folha de símbolos (ver static/sprite.svg). */
  const icon = (name, cls) => `<svg class="ic ${cls || ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  // ───────── Números à portuguesa ─────────

  /** 1234.5 → "1 234,5" (espaço fino nos milhares, vírgula decimal). */
  function nf(v, dec) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
    const s = Number(v)
      .toFixed(dec === undefined ? 0 : dec)
      .replace(".", ",");
    const parts = s.split(",");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(",");
  }

  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  const fmt = {
    n: nf,
    power(v) {
      if (v === null || v === undefined) return "—";
      return Math.abs(v) >= 1000 ? `${nf(v / 1000, 2)} kW` : `${nf(v)} W`;
    },
    energy(v, dec = 1) {
      return v === null || v === undefined ? "—" : `${nf(v, dec)} kWh`;
    },
    temp(v, dec = 1) {
      return v === null || v === undefined ? "—" : `${nf(v, dec)} °C`;
    },
    pct(v) {
      return v === null || v === undefined ? "—" : `${nf(v)} %`;
    },
    money(v, cur = "€") {
      return `${nf(v, 2)} ${cur}`;
    },
    /**
     * "8 set" — escrito à mão porque o pt-PT de alguns browsers devolve "8/09"
     * quando se pede o mês abreviado.
     */
    diaMes(d) {
      return `${d.getDate()} ${MESES[d.getMonth()]}`;
    },
    /** "seg, 8 set" */
    diaSemana(d) {
      return `${SEMANA[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
    },
    /** "set 26" */
    mesAno(d) {
      return `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    },
    /** "07:21" a partir de minutos desde a meia-noite */
    hm(min) {
      return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min) % 60).padStart(2, "0")}`;
    },
  };

  window.UI = { el, esc, icon, fmt };
})();
