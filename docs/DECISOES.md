# Decisões de design e de comportamento

O que foi decidido, e porquê. Quando uma decisão muda, muda aqui primeiro.

## Ecrãs

- **Três tipos:** `mao` (telemóvel, rola), `braco` (tablet de parede ou
  computador, não rola) e `sala` (televisão, não rola, escala 1,6 vezes maior).
  Decide o parâmetro `?ecra=`, depois a escolha nas Definições, depois a deteção:
  largura abaixo de 700 px é telemóvel; 1500 px ou mais sem rato nem toque é
  televisão; o resto é tablet. Um monitor de 1920 px com rato é tablet, não
  televisão.
- **Tamanho:** cinco níveis (85 a 120 %), guardados por aparelho e por tipo de
  ecrã. O tablet arranca a 92 %.
- **Toque:** 44 px de alvo em tudo. Os controlos ao estilo do iOS mantêm o
  desenho e alargam o alvo com uma margem invisível.

## Cor

- **Paleta e modo são escolhas separadas:** Grafite, Lilás, Dourado, Verde e Preto
  e branco, cada uma em modo escuro e claro. O modo automático é claro com o sol
  acima do horizonte. Por omissão, escuro.
- **Preto puro** só no Preto e branco escuro, pensado para ecrãs OLED; o Grafite
  usa um quase-preto, que dá profundidade aos cartões.
- **Câmaras** sempre em fundo escuro, em todas as paletas.

## Comportamento

- **Sem ligação, o painel não tranquiliza.** O veredicto passa a "Sem ligação à
  casa" e a coluna de avisos a "Não sei se há avisos", com a hora do último
  contacto. Sem dados nenhuns, o painel mostra só esse estado.
- **Ações sobre a casa inteira** dizem o que fizeram e oferecem Desfazer durante
  alguns segundos. Desfazer nunca destranca a porta.
- **Sair de casa e Boa noite**, com janelas ou portas abertas, perguntam antes.
- **Sliders "de todos"** só obedecem a um arrasto; um toque perdido não faz nada.
- **Menu** só existe quando há secções fora da barra lateral; no tablet e na
  televisão estão todas à vista.
- **Barra lateral:** recolhe-se a ícones (botão no fundo, tecla `[`), lembrado
  por tipo de ecrã (`casa_os_barra_<ecra>`, em `app.js`). No telemóvel não existe.
- **Dashboard** (a vista antiga em três colunas) está fora de vista: sem
  separador na barra nem linha no menu (`oculta: true` em `SECTIONS`, `app.js`).
  O código e a rota `#/dashboard` continuam a funcionar — para o repor na
  navegação, tirar essa linha. Ficou de fora porque a Casa já responde à mesma
  pergunta ("está tudo bem?") de forma mais direta.

## Movimento

- Só `transform` e `opacity`. As mudanças de layout (presença, repouso, painel da
  planta) fazem-se de uma vez; o movimento é o do que entra.
- Sem desfocar em transições.
- Sem `element.animate()` em elementos que ainda não estão no ecrã: a animação
  fica presa no primeiro fotograma.
- Ao carregar: `scale: 0.96` (0,985 nos cartões grandes). Efeitos de passagem só
  com rato.
- Movimento reduzido: fica a opacidade e a cor; sai o que se desloca.

## Texto

- Verbo à frente nos botões; um verbo por ação.
- Sem travessões no texto visível; "—" só como símbolo de valor em falta. No
  máximo um "·" por linha.
- Datas escritas à mão ("8 set"), porque o pt-PT de alguns browsers devolve "8/09".

## Energia

- Um contador que recomeçou do zero conta pelo valor acumulado da linha, não como
  um consumo negativo.
- O histórico gerado no primeiro arranque deixa uma estatística de cinco minutos no
  fim, para a soma continuar sem saltos.
- O custo de cada circuito é a sua parte do que se pagou à rede, na proporção do
  consumo; a soma dos circuitos dá o custo total.
- Os gráficos são SVG próprios, com zoom por arrasto; não há bibliotecas.

## Planta

- Os dados vivem em `config.json → planta` (zonas, portas, móveis, pontos de luz e
  câmaras); o desenho é SVG gerado a partir deles.
- A luz de cada candeeiro tem a cor dele; o sol entra pelas janelas conforme o
  azimute real; o robô aparece na divisão que está a limpar.
