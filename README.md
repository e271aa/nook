# Nook — Demo

Uma demonstração pública do dashboard **Nook**, ao estilo do
[demo.home-assistant.io](https://demo.home-assistant.io): um Home Assistant a
correr em Docker, com uma **moradia portuguesa inteiramente simulada** e o
dashboard já configurado. Quem abre o link não faz login nem instala nada — entra
e mexe.

```bash
cp .env.example .env     # muda a ADMIN_PASSWORD
docker compose up -d
```

Ao fim de ~1 minuto: **http://localhost:8123**

---

## O que o visitante vê

| Onde | O quê |
|---|---|
| `http://localhost:8123` | Home Assistant (entra sozinho como **Visitante**, sem permissões de administrador) |

A casa tem 10 divisões em 3 pisos, 15 luzes, 6 estores + portão, 4 ares
condicionados, 3 câmaras, 7 eletrodomésticos, robô aspirador, painéis solares,
bateria, carregador de carro elétrico e sensores em todas as divisões — cerca de
**180 entidades**.

Nada disto é um mock estático: há um **motor de simulação** com física simples.

- Os estores demoram o tempo real de percurso (18 a 26 s) e a persiana desce na
  janela do cartão ao mesmo ritmo.
- O ar condicionado aproxima a temperatura da divisão do valor pedido, e a
  divisão volta a aquecer sozinha quando se desliga.
- Os painéis seguem a posição real do sol (astral, com as coordenadas da casa) e
  o estado do tempo; a bateria carrega com o excedente e descarrega à noite; o
  que falta vem da rede.
- Cada luz, tomada, AC e eletrodoméstico contribui para o consumo, por circuito.
- As máquinas correm programas a sério (aquecer → lavar → enxaguar →
  centrifugar), com progresso e tempo restante.
- As câmaras são geradas em tempo real: o céu muda com a hora, chove quando está
  a chover, o portão aparece na posição em que está e, de noite, a imagem passa a
  **visão noturna** a preto e branco.
- **30 dias de histórico de energia** são gerados no primeiro arranque, para a
  vista Energia nascer com dados credíveis.

Para demonstrações há dois atalhos:

- **Simular tempo** no cartão "Lá fora" (Auto / Céu limpo / Nublado / Chuva) —
  muda o céu, as câmaras, a temperatura e a produção solar.
- Serviço `casa_demo.repor` (ou o botão *Repor demo*) devolve a casa ao estado
  inicial. Corre sozinho todas as noites às 04:00.

---

## Estrutura

```
acasa_demo/
├── docker-compose.yml          Home Assistant + contentor de bootstrap
├── .env.example                password de administrador, porta, fuso
├── bootstrap/bootstrap.py      onboarding automático + utilizador Visitante
└── config/                     /config do Home Assistant
    ├── configuration.yaml      casa demo + dashboard + entrada direta
    ├── automations.yaml        7 automações realistas (sol, rega, excedente solar…)
    ├── scripts.yaml            Modo cinema, Sair de casa, Boa noite, Bom dia
    ├── dashboards/nook.yaml   entrada "Nook" na barra lateral
    ├── www/nook/              planta e ilustrações das divisões (SVG)
    └── custom_components/
        ├── casa_demo/          a casa simulada (motor + 13 plataformas)
```

### Comandos

```bash
docker compose logs -f homeassistant     # ver o que se passa
docker compose restart homeassistant     # aplicar alterações em Python/YAML
docker compose down                      # parar
docker compose down -v && rm -rf config/.storage config/home-assistant_v2.db  # recomeçar do zero
```

Alterações a CSS/JS do dashboard não precisam de reiniciar — basta recarregar a
página (Cmd+Shift+R).

---

## Como funciona a entrada sem login

O `configuration.yaml` liga o fornecedor `trusted_networks` para toda a rede, mas
**restrito a um único utilizador**: o "Visitante", que pertence ao grupo dos
utilizadores normais e não pode alterar a configuração. O administrador continua
a precisar de password (opção *Home Assistant Local* no ecrã de login).

O ficheiro `config/demo_trusted_users.yaml` começa a apontar para um ID
inexistente — ou seja, antes do bootstrap **ninguém** entra sem password. O
contentor `bootstrap` faz o onboarding, cria o Visitante, escreve o ID real nesse
ficheiro e reinicia o Home Assistant uma vez.

> Nota: o Home Assistant também permite indicar um *grupo* em `trusted_users`,
> mas essa variante está avariada no core (o código percorre o nome do grupo
> letra a letra), por isso usamos mesmo o ID do utilizador.

quando não há sessão, o servidor gera um token do Visitante para a página, para o
dashboard abrir diretamente mesmo fora do Home Assistant.

---

## Antes de pôr isto online

Esta demo foi pensada para correr numa rede local ou atrás de um proxy.
Para a expor publicamente:

1. Muda a `ADMIN_PASSWORD` no `.env` (e não a partilhes).
2. Põe um reverse proxy com HTTPS à frente (Caddy, Traefik, nginx) e configura
   `http.use_x_forwarded_for` + `trusted_proxies` no `configuration.yaml`.
3. Tem em conta que qualquer visitante entra como Visitante e **pode mexer em
   tudo o que é da casa** (é esse o objetivo) — o `casa_demo.repor` das 04:00
   limpa a casa todos os dias.
   dashboard respondem **sem autenticação** (ver a secção seguinte).

---

## O que foi corrigido no código do Nook

intacto). Estas correções valem para qualquer instalação e vale a pena
levá-las para o projeto principal:

| Ficheiro | Problema | Correção |
|---|---|---|
| `modules/cards/energy.js` | A lista `energy.devices` partia-se quando vinha no formato `{entity, name}` — que é **o formato que o próprio configurador grava** | Aceita as duas formas |
| `modules/cards/energy.js` | O acumulado das estatísticas era datado pelo **início** da hora, quando corresponde ao fim → consumos desfasados e primeira hora perdida | Datado pelo fim, mais um período de contexto antes do início |
| `modules/cards/appliances.js` | Os cartões de eletrodomésticos **nunca se atualizavam** depois de desenhados (um programa a decorrer ficava parado no ecrã) | `updateEntityUI` passa a refrescar o cartão a que a entidade pertence |
| `modules/cards/appliances.js` | Rotações e temperatura da máquina de lavar eram desenhadas mas nunca preenchidas | Preenchidas |
| `modules/cards/appliances.js` | `formatProgramName` partia palavras acentuadas ("Algodão" → "AlgodãO") | Capitalização com `\p{Ll}` e nomes já legíveis deixados como estão |
| `modules/cards/appliances.js` | Um sensor sem valor (ex.: hora de fim sem programa) marcava o aparelho todo como "Indisponível" | Só o campo fica a `--:--` |
| `script.js` | Os interruptores das **Ações rápidas** só mostravam o estado do instante em que eram desenhados | Sincronizados com o estado real |
| `script.js` | O estado da câmara (`idle`) era escrito **por cima da imagem** ("Em espera") | Câmaras excluídas do atualizador genérico |
| `modules/cards/climate.js` | Ar condicionado sem `outdoor_temperature` mostrava `undefined°C` | `?? null` |
| `main.js` | O dashboard abria sempre em "Consumos", ignorando a `default_view` | Respeita `default_view` e `remember_last_view` |
| `config_manager.py` | Criava uma vista/menu "Consumption" em inglês a duplicar os "Consumos" | Deteta a versão portuguesa; textos traduzidos |

Fica por resolver (não bloqueia a demo, mas é sério numa instalação real):
`requires_auth = False` e devolvem a configuração e **o estado de todas as
entidades** a quem pedir.

---


eletrodomésticos, planta, câmaras, configurador) e ganha a linguagem visual do
projeto pessoal: paleta dourada sobre creme/castanho, cantos redondos, sombras
suaves e vidro fosco.

Está isolado em dois ficheiros novos — o resto do código não foi tocado:

  `renderSection`, `renderDivisionCover` e `updateEntityUI`:
    fase certa, nuvens, chuva, estrelas) e o nascer/pôr-do-sol;
  - **cartão de estore** — janela com o céu lá fora, persiana a descer ao ritmo do
    motor, barra para arrastar e três presets.

