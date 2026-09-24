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
- **Sinais da interface:** a luz acesa (`--solar`) é amarela e o aviso (`--warn`)
  é laranja; o perigo (`--danger`) é um vermelho rosado. Cada um tem `-ink` (o
  texto por cima) e, no claro, `-fg` (a versão escura, para texto e ícones sobre
  branco; `--warn-fg` pode ir em texto, `--solar-fg` só em ícones e linhas). O
  destaque de cada paleta não muda e não se confunde com os sinais. A luz
  desenhada na planta continua na cor de cada lâmpada.

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
- **Rotina** não existe na televisão (`nunca: ["sala"]` em `SECTIONS`): nem na
  barra, nem no menu, nem pelo endereço. As compras e os lembretes são da casa,
  não de quem está de visita na sala.
- **Barra lateral:** recolhe-se a ícones (botão no fundo, tecla `[`, também
  Option+8 ou AltGr+8 num teclado português), lembrado por tipo de ecrã
  (`casa_os_barra_<ecra>`, em `app.js`). No telemóvel não existe. Recolhida, a
  secção ativa tem a cor e um traço à esquerda; o botão de recolher nunca fica
  "ativo". Se as secções não couberem na altura (texto a 110 % ou 120 %), a barra
  aperta-se sozinha e, se preciso, fica só com ícones.
- **Presença:** um ponto verde no canto do avatar de quem está em casa, como no
  desenho original; estar em casa é o normal e não pode ser o que mais se vê.
- **Controlos:** uma grelha só; uma divisão com vários aparelhos ocupa as colunas
  de que precisa e as outras encaixam ao lado. O que não cabe vai para a página
  seguinte (medindo a altura, em qualquer piso); o piso nunca muda sozinho. Com
  um piso escolhido, todas as ações da fila são desse piso.
- **Janelas por cima** (menu, câmara ampliada, calendário, confirmações) prendem
  o foco enquanto estão abertas e devolvem-no ao fechar (`K.prenderFoco`).
- **Demonstração** (Definições, só com `"demo": true` no `config.json`): botões que
  chamam o serviço `casa_demo.simular` (movimento na entrada, fumo, fuga de água,
  janela aberta com o ar ligado, porta aberta, ninguém em casa, máquina da roupa,
  carro carregado), "Limpar tudo" e "Repor a demonstração" (com confirmação).
  Uma casa a sério não tem o `"demo"` e não vê nada disto.
- **Dashboard** (a vista antiga em três colunas) está fora de vista: sem
  separador na barra nem linha no menu (`oculta: true` em `SECTIONS`, `app.js`).
  O código e a rota `#/dashboard` continuam a funcionar — para o repor na
  navegação, tirar essa linha. Ficou de fora porque a Casa já responde à mesma
  pergunta ("está tudo bem?") de forma mais direta.

## Movimento

- Só `transform` e `opacity`. As mudanças de layout (presença, repouso, painel da
  planta) fazem-se de uma vez; o movimento é o do que entra. Na planta, a
  aproximação à divisão escolhida é `translate` + `scale` do desenho.
- Sem desfocar em transições.
- Sem `element.animate()` em elementos que ainda não estão no ecrã: a animação
  fica presa no primeiro fotograma.
- Ao carregar: `scale: 0.96` (0,985 nos cartões grandes). Efeitos de passagem só
  com rato.
- Movimento reduzido: fica a opacidade e a cor; sai o que se desloca.

## Texto

- Verbo à frente nos botões; um verbo por ação. Luzes: "Acender" e "Apagar", em
  todo o lado (tomadas e ar condicionado é que se ligam e desligam).
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

- Os dados vivem em `config.json → planta` (zonas, janelas, portas, móveis, pontos
  de luz e câmaras); o desenho é SVG gerado a partir deles. As janelas dizem o
  estore e o sensor de cada uma; sem lista, sai uma janela por estore.
- A planta de arquiteto recua (paredes cheias num cinzento baixo, móveis em traço
  fino) e o que está vivo desenha-se por cima: a luz de cada candeeiro como luz,
  na cor e no brilho dela (soma-se ao chão no escuro, escurece-o no claro); o sol
  como a mancha que o estore deixa entrar, tão comprida quanto o sol está baixo;
  o movimento e a rega como ondas; o robô com o rasto do que já limpou.
- Nenhum estado depende só da cor: a porta da rua diz "Trancada" ou
  "Destrancada", a janela aberta tem folhas e um aviso com texto, o robô em pausa
  tem o sinal de pausa.
- Com uma divisão escolhida, a planta não encolhe: aproxima-se dela. Os nomes e as
  pílulas ficam do mesmo tamanho a qualquer distância.
- Os atalhos por cima de cada divisão só aparecem para o que está ligado (apagar
  as luzes acesas, desligar a rega); o resto abre-se ao tocar na divisão.
- **Ação e estado têm formas diferentes:** uma ação (Apagar 2, Desligar rega) é um
  botão redondo, vidro neutro com contorno e o verbo; só o ícone leva cor. Um
  estado (Janela aberta, Trancada, fumo) é uma etiqueta cheia de cantos 8 na cor
  do sinal, sem contorno. O perigo pulsa enquanto dura. Na lista "Agora", o que
  está aceso tem disco redondo e o estado da casa disco quadrado de raio 12.
- **Janela aberta:** duas folhas em traço, a 70° a partir da face de dentro da
  parede, com arco tracejado (sem arco na miniatura); o vidro não se desenha.
- Com pouco espaço (o telemóvel) ficam os nomes; saem o clima, os atalhos e as
  câmaras, e o aviso e o cadeado ficam só com o ícone.
- Na TV, ao lado da planta, a lista "Agora": luzes acesas, avisos, porta da rua,
  movimento, robô.
- Sem ligação à casa, a planta mostra o último estado conhecido e diz de quando é;
  a luz e o sol recuam e os atalhos e as ações do piso escondem-se.
- As cores da planta são tokens `--pl-*` derivados das cores do painel, por isso
  servem a todas as paletas. No claro, o texto sobre cor é branco puro e o âmbar
  dos atalhos é mais escuro que o `--solar`, para se ler (mínimo 4,5:1).
- Uma pílula que muda (porta, janela, aviso novo) dá um salto pequeno, uma vez
  (`cubic-bezier(.34, 1.4, .64, 1)`, 0,92 → 1). É a única curva com ressalto do
  painel e é de propósito; o detetor do impeccable assinala-a.
