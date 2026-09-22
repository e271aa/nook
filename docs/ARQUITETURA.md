# Arquitetura

A demo tem três partes: o **Home Assistant** (a plataforma), a **casa simulada**
(`casa_demo`, que faz de casa real) e o **painel** (`casa_os`, o que se vê).

```
 browser (tablet, TV, telemóvel)
   │  GET /casa  ─────────────────►  casa_os (Python)  → página + config + token
   │  WebSocket /api/websocket  ◄──►  Home Assistant    → estados em tempo real, comandos
   │  REST /api/casa_os/*        ───►  casa_os (Python)  → estatísticas, câmaras
   │  REST /api/calendars, todo  ───►  Home Assistant
   ▼
 Home Assistant  ◄── entidades ──  casa_demo (Python): motor de simulação + 13 plataformas
```

## `casa_os`: a integração do painel

Python, em `config/custom_components/casa_os/`.

| Ficheiro | Papel |
|---|---|
| `__init__.py` | Regista as vistas HTTP e a pasta de ficheiros estáticos (`/casa_os_static`) |
| `view.py` | `/casa` (a página), `/api/casa_os/config`, `/api/casa_os/statistics` (estatísticas de longo prazo do recorder) e `/api/casa_os/camera/{entidade}` (imagens das câmaras) |
| `templates/index.html` | A página: carrega os estilos e os módulos pela ordem certa, e recebe a configuração da casa e o token |
| `config.json` | A descrição da casa (ver abaixo) |

**Acesso.** A página usa a sessão do Home Assistant quando existe. Sem sessão, e
com `casa_os: demo_user:` configurado, gera um token de longa duração para esse
utilizador (o Visitante), para o painel abrir diretamente. A configuração da casa
e o token vão embutidos na página; o painel usa-os para abrir o WebSocket.

## O painel no browser

JavaScript sem framework nem passo de build, em `casa_os/static/js/`. Cada módulo
é uma função auto-executável que publica o que precisa em `window`:

| Módulo | O quê |
|---|---|
| `ha.js` | Ligação ao Home Assistant: WebSocket (estados, `call_service`), REST (estatísticas, agenda, listas), estados de ligação, falhas de comando (`HA.onFalha`) |
| `defs.js` | Definições guardadas por aparelho: tamanho, tipo de ecrã, comportamento de parede |
| `ui.js` | `el`, `esc`, `icon` e formatação de números, datas, energia e dinheiro |
| `kit.js` | Componentes partilhados: `bind` (redesenhar quando uma entidade muda), slider, interruptor, segmentado, câmara, notas, folha de confirmação, ações em massa com Desfazer, colunas arrastáveis |
| `views.js` | A secção Casa |
| `divisoes.js`, `controlos.js`, `vigilancia.js`, `rotina.js`, `definicoes.js` | Uma secção cada |
| `energia.js`, `energia-agora.js`, `energia-graficos.js` | Energia: relatório por período, fluxo de agora, gráficos SVG e diagrama de fluxo |
| `planta.js` | A planta: desenho SVG gerado a partir dos dados, camada de controlos, painel da divisão |
| `app.js` | A casca: navegação por `#/secção`, tipo de ecrã, paletas e modos, painel de parede (presença, repouso, voltar ao início) |

**Estilos.** `static/css/tokens.css` define a escala (`--u`, a unidade de que
dependem letra, espaços e cantos) e as cores por paleta e modo (`data-theme` e
`data-modo` no `<html>`). `static/css/app.css` só usa essas variáveis.

**Redesenho.** Cada vista liga-se às entidades de que depende com `bind(nó,
interessa, pinta)`; quando uma entidade muda, só o que depende dela se redesenha.
Ao mudar de secção, as ligações da secção anterior são largadas.

## `casa_demo`: a casa simulada

Python, em `config/custom_components/casa_demo/`.

| Ficheiro | Papel |
|---|---|
| `engine.py` | O motor: estado de toda a casa, física (estores, clima, sol, bateria, consumos), guardado em disco |
| `light.py`, `cover.py`, `climate.py`, … | As plataformas do Home Assistant, cada uma a ler e escrever no motor |
| `avisos.py` | As regras do que está mal (fumo, água, janelas, casa vazia), publicadas em `sensor.avisos` |
| `history.py` | No primeiro arranque, 30 dias de estatísticas de energia coerentes com os contadores |
| `camera.py` | Imagens das câmaras geradas em tempo real |
| `visitor.py` | Criação do utilizador Visitante, chamada pelo contentor de arranque |

## A descrição da casa: `config.json`

O painel não conhece esta casa em particular; lê-a de `casa_os/config.json`
(ou de `casa_os.json` na pasta `/config`, se existir). As chaves principais:

| Chave | O quê |
|---|---|
| `floors`, `rooms` | Pisos e divisões, com as entidades de cada uma (luzes, estores, clima, sensores, câmara, tomadas) |
| `energy` | Potências instantâneas, contadores de energia, circuitos e tarifas |
| `acoes` | As ações rápidas (cenas, apagar luzes, fechar estores), com verificação opcional de janelas abertas |
| `cameras`, `people`, `tv`, `robo`, `listas`, `calendarios` | O resto da casa, por secção |
| `planta` | Os pisos em planta: zonas, portas entre divisões, móveis e pontos de luz e câmaras |
| `quiosque` | O comportamento do painel de parede (sensor de presença, tempos) |

Outra instalação muda este ficheiro; o código fica igual.
