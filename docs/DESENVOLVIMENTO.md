# Desenvolvimento

Como trabalhar no painel sem partir o que já está medido. Tudo em português de
Portugal: interface, comentários e mensagens de commit.

## Ciclo de trabalho

1. `docker compose up -d` e abrir `http://localhost:8123/casa?ecra=braco`
   (ou `sala`, ou `mao`).
2. Alterar o código.
3. Ver as alterações:
   - **JavaScript e CSS:** recarregar a página (a versão dos ficheiros muda a cada
     pedido, não há cache a limpar);
   - **`config.json`:** recarregar (é lido a cada pedido);
   - **Python e `templates/index.html`:** `docker compose restart homeassistant`
     (o template fica em memória).
4. Verificar (ver abaixo) nos três ecrãs e nos dois modos.

Na televisão (`?ecra=sala`) o painel pode estar em repouso; um toque ou um
`pointerdown` acorda-o.

## Convenções

**Escala e cor**
- Todos os tamanhos são `calc(Npx * var(--u))`. Nunca píxeis soltos.
- Todas as cores vêm de variáveis de `tokens.css`. Cada paleta tem modo escuro e
  claro; uma cor nova precisa das duas versões.

**Ecrãs**
- Tablet e televisão não rolam. O que não cabe esconde-se do fim para o princípio;
  nunca aparece uma barra de rolar.
- O telemóvel rola, numa coluna.
- Alvos de toque de 44 px (`--tap`). Os controlos pequenos à vista (segmentado,
  comprimidos, botões de + e −, interruptor) alargam o alvo com uma margem
  invisível em `::after` ou `::before`, sem mudar o desenho.

**Movimento**
- Só `transform` e `opacity`. Mudanças de layout fazem-se de uma vez; o que se
  mexe é o que entra ou sai.
- Nada de desfocar em transições; nada de `element.animate()` em elementos que
  ainda não estão no ecrã.
- Respeitar `prefers-reduced-motion`: fica a opacidade e a cor, sai o que se desloca.

**Texto**
- Verbo à frente nos botões e um só verbo por ação ("Apagar luzes" em todo o lado).
- Sem travessões no texto visível; no máximo um "·" por linha.
- Datas com `fmt.diaMes` e `fmt.diaSemana` (o pt-PT de alguns browsers devolve
  "8/09" em vez de "8 set").

**Código**
- Usar os componentes de `kit.js` antes de escrever outros.
- Comandos para a casa sempre com `HA.call`: nunca lança exceções; as falhas
  chegam a `HA.onFalha`, que as mostra ao utilizador.
- Antes de criar uma classe CSS, procurar se o nome já existe noutra secção.

## Verificação

**Aferidor** (`ferramentas/aferidor.js`): mede transbordo, contraste WCAG e alvos
de toque na página aberta.

1. Copiar para `config/custom_components/casa_os/static/js/_afer.js`.
2. Na consola da página: carregar `/casa_os_static/js/_afer.js` e correr
   `AFERIR()` (a secção à vista) ou `await VARRER()` (paletas × modos × secções).
3. Para medir o tablet como tátil num computador: `window.AFERIR_TOQUE = true` e
   forçar `--tap` a 44 px.
4. Apagar o `_afer.js` no fim.

**Gestos de toque:** Playwright com `hasTouch` ligado; o viewport emulado prova o
layout, não o gesto.

## Commits

Um commit por alteração coerente, com a mensagem em português: uma linha de
resumo (`feat:`, `fix:`, `docs:`, `chore:`) e, no corpo, o que mudou e porquê.
