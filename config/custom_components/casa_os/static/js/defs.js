/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — as definições da pessoa e do aparelho.
 *
 *  Duas fontes, por esta ordem: o que a pessoa escolheu neste aparelho
 *  (guardado no browser) e, à falta disso, o que a instalação definiu no
 *  config.json. O tamanho guarda-se por tipo de ecrã: o tablet da parede e o
 *  computador da secretária querem tamanhos diferentes, e não é o mesmo
 *  browser que os abre.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const CFG = (window.CASA && window.CASA.config) || {};
  const CHAVE = "casa_os_defs";

  /** Os cinco tamanhos: o que multiplica a escala do ecrã. */
  const TAMANHOS = [
    { id: 0, nome: "Muito pequeno", pct: 85 },
    { id: 1, nome: "Pequeno", pct: 92 },
    { id: 2, nome: "Normal", pct: 100 },
    { id: 3, nome: "Grande", pct: 110 },
    { id: 4, nome: "Muito grande", pct: 120 },
  ];

  const ECRAS = { mao: "Telemóvel", braco: "Tablet ou computador", sala: "Televisão" };

  let guardado = {};
  try {
    guardado = JSON.parse(localStorage.getItem(CHAVE) || "{}") || {};
  } catch (e) {
    guardado = {}; // modo privado, ou lixo guardado
  }

  function gravar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(guardado));
    } catch (e) {
      /* modo privado */
    }
  }

  const Q = CFG.quiosque || {};

  /** O que a instalação diz, quando a pessoa ainda não escolheu nada. */
  const origem = {
    voltar: Q.voltar_ao_inicio_segundos ?? 180, // segundos; 0 = nunca
    repouso: Q.repouso_minutos ?? 10, // minutos; 0 = nunca
    soDeNoite: Q.repouso_so_de_noite !== false,
  };

  /** Num computador com rato o painel lê-se de perto: começa um degrau abaixo. */
  function tamanhoPorOmissao(ecra) {
    const rato = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
    return ecra === "braco" && rato ? 1 : 2;
  }

  const DEFS = {
    TAMANHOS,
    ECRAS,

    tamanho(ecra) {
      const v = guardado.tamanho && guardado.tamanho[ecra];
      return Number.isInteger(v) && v >= 0 && v <= 4 ? v : tamanhoPorOmissao(ecra);
    },

    definirTamanho(ecra, i) {
      guardado.tamanho = { ...(guardado.tamanho || {}), [ecra]: i };
      gravar();
      DEFS.aplicarTamanho(ecra);
    },

    /** Põe o tamanho escolhido na escala: é o único sítio que lhe toca. */
    aplicarTamanho(ecra) {
      const t = TAMANHOS[DEFS.tamanho(ecra)];
      document.documentElement.style.setProperty("--zoom", String(t.pct / 100));
    },

    /** Foi a pessoa que escolheu, ou é o valor de origem? */
    escolhido(ecra) {
      return !!(guardado.tamanho && guardado.tamanho[ecra] !== undefined);
    },

    /**
     * Teclas rápidas: "sempre" à vista, ou "presenca" — só quando alguém se
     * aproxima. Sem escolha, vale "sempre", exceto num tablet de parede com
     * sensor de presença: aí quem passa a um metro ganha com o veredicto grande,
     * e o resto aparece quando a pessoa chega.
     */
    teclas(ecra) {
      const v = guardado.teclas;
      if (v === "sempre" || v === "presenca") return v;
      const toque = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      return ecra === "braco" && toque && Q.presenca ? "presenca" : "sempre";
    },

    get(chave) {
      return guardado[chave] !== undefined ? guardado[chave] : origem[chave];
    },

    set(chave, valor) {
      guardado[chave] = valor;
      gravar();
    },

    /** Volta ao que a instalação definiu. A paleta é um gosto e tem a sua chave. */
    repor() {
      guardado = {};
      gravar();
      DEFS.aplicarTamanho(document.documentElement.getAttribute("data-screen"));
    },
  };

  window.DEFS = DEFS;
})();
