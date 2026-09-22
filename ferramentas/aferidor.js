/* ─────────────────────────────────────────────────────────────────────────
 *  Aferidor do painel — cola isto na consola do browser, com /casa aberto.
 *
 *    AFERIR()                      → mede a secção que está à frente
 *    await VARRER(temas, seccoes)  → percorre paletas e secções e mede tudo
 *
 *  Mede três coisas que não se veem a olho:
 *    · transbordo — conteúdo que não cabe, na página ou dentro de uma caixa
 *    · contraste  — texto abaixo do mínimo legível (4,5, ou 3 se for grande)
 *    · alvos      — no telemóvel, o que se toca com menos de 44 px (no tablet
 *                   de parede também: window.AFERIR_TOQUE = true, com o --tap
 *                   do dedo forçado, porque o browser do computador não é tátil)
 *
 *  O contraste é calculado como manda a norma: a cor do texto composta sobre
 *  o primeiro fundo opaco que estiver por cima na árvore, porque quase todas
 *  as nossas cores de texto têm transparência.
 * ───────────────────────────────────────────────────────────────────────── */
window.AFERIR = (function () {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const cor = (s) => {
    const m = (s || "").match(/[\d.]+/g);
    if (!m) return null;
    const v = m.map(Number);
    return { rgb: v.slice(0, 3), a: v.length > 3 ? v[3] : 1 };
  };
  const sobre = (f, b) => f.rgb.map((v, i) => v * f.a + b[i] * (1 - f.a));
  const razao = (a, b) => {
    const l = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l[0] + 0.05) / (l[1] + 0.05);
  };
  function fundoDe(el) {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = cor(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 1) return c.rgb;
      n = n.parentElement;
    }
    const b = cor(getComputedStyle(document.body).backgroundColor);
    return b && b.a > 0 ? b.rgb : [0, 0, 0];
  }
  const temTexto = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);

  return function () {
    const doc = document.documentElement;
    const r = {
      ecra: doc.dataset.screen,
      tema: doc.dataset.theme || "grafite",
      seccao: (location.hash || "#/").replace("#/", "") || "casa",
      scrollPagina: doc.scrollHeight - innerHeight,
      transbordoLateral: doc.scrollWidth - innerWidth,
      contraste: [],
      alvos: [],
    };
    document.querySelectorAll(".body *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;
      const cx = el.getBoundingClientRect();
      if (!cx.width || !cx.height) return;

      if (temTexto(el)) {
        const f = cor(cs.color);
        if (f) {
          const bg = fundoDe(el);
          const rr = razao(sobre(f, bg), bg);
          const px = parseFloat(cs.fontSize);
          const peso = parseInt(cs.fontWeight, 10) || 400;
          const grande = px >= 24 || (px >= 18.66 && peso >= 700);
          const min = grande ? 3 : 4.5;
          if (rr < min) {
            r.contraste.push({
              txt: el.textContent.trim().slice(0, 24),
              r: Math.round(rr * 100) / 100,
              min,
              px: Math.round(px),
              cls: (el.className || "").toString().slice(0, 28),
            });
          }
        }
      }
      if ((doc.dataset.screen === "mao" || window.AFERIR_TOQUE) && (el.tagName === "BUTTON" || el.tagName === "SELECT" || el.getAttribute("role") === "slider")) {
        // o alvo é o que o dedo apanha: a caixa mais a margem invisível que
        // alguns controlos põem à volta (::before no interruptor, ::after nos
        // segmentados, comprimidos e botões de + e −)
        let h = cx.height;
        let w = cx.width;
        ["::before", "::after"].forEach((p) => {
          const ps = getComputedStyle(el, p);
          if (ps.content === "none" || ps.position !== "absolute") return;
          const n = (v) => (parseFloat(v) < 0 ? -parseFloat(v) : 0);
          h = Math.max(h, cx.height + n(ps.top) + n(ps.bottom));
          w = Math.max(w, cx.width + n(ps.left) + n(ps.right));
        });
        if (h < 43.5 || (w < 43.5 && !el.closest(".dots"))) r.alvos.push(`${el.className || el.tagName}:${Math.round(w)}×${Math.round(h)}`);
      }
    });
    r.contraste.sort((a, b) => a.r - b.r);
    r.alvos = [...new Set(r.alvos)];
    return r;
  };
})();

window.VARRER = async function (
  temas = ["grafite", "lilas", "dourado", "verde", "oled", "claro"],
  seccoes = ["casa", "divisoes", "controlos", "vigilancia", "energia", "rotina"],
) {
  const antes = document.documentElement.dataset.theme;
  const out = [];
  for (const t of temas) {
    document.documentElement.setAttribute("data-theme", t);
    for (const s of seccoes) {
      location.hash = `#/${s}`;
      await new Promise((r) => setTimeout(r, 550));
      out.push(window.AFERIR());
    }
  }
  if (antes) document.documentElement.setAttribute("data-theme", antes);
  const falhas = out.flatMap((x) => x.contraste.map((c) => `${x.tema}/${x.seccao} ${c.cls} ${c.px}px r=${c.r}`));
  console.table(out.map((x) => ({ ecrã: x.ecra, tema: x.tema, secção: x.seccao, scroll: x.scrollPagina, lateral: x.transbordoLateral, contraste: x.contraste.length, alvos: x.alvos.length })));
  return { medições: out.length, falhas, alvos: [...new Set(out.flatMap((x) => x.alvos))] };
};
