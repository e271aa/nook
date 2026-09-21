"""O que a casa tem para dizer quando alguma coisa está mal.

Um painel que diz "tudo em ordem" e mente deixa de ser lido para sempre. Por
isso as regras vivem aqui, num sítio só, em vez de espalhadas pela interface:
cada aviso tem gravidade, divisão, desde quando, e — quando há — o que fazer
em relação a ele.

Sai tudo num sensor, `sensor.avisos`: o estado é quantos são, e os atributos
levam a lista. Chega ao painel pelo mesmo caminho que todo o resto.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.util import dt as dt_util

from .const import CLIMATES, CONTACTS, LIGHTS, PEOPLE, SIGNAL_AVISOS
from .engine import Engine
from .entity import AREA_NAMES, CasaEntity, device_info

# Gravidades, da que acorda alguém à que só informa
PERIGO = "perigo"
AVISO = "aviso"
INFO = "info"
ORDEM = {PERIGO: 0, AVISO: 1, INFO: 2}

# Quanto tempo uma coisa pode estar assim antes de valer a pena dizê-lo
PORTA_ABERTA = timedelta(minutes=5)
JANELA_ESQUECIDA = timedelta(hours=3)
BATERIA_FRACA = 15  # por cento

AREA_DE_CONTACTO = {c["id"]: c["area"] for c in CONTACTS}
NOME_DE_CONTACTO = {c["id"]: c["name"] for c in CONTACTS}
CLASSE_DE_CONTACTO = {c["id"]: c["class"] for c in CONTACTS}
AREA_DE_CLIMA = {c["id"]: c["area"] for c in CLIMATES}


@dataclass(slots=True)
class Aviso:
    id: str
    gravidade: str
    titulo: str
    detalhe: str
    icone: str
    divisao: str | None = None
    desde: datetime | None = None
    acao: dict[str, Any] | None = None

    def como_dicionario(self) -> dict[str, Any]:
        d = asdict(self)
        d["desde"] = self.desde.isoformat() if self.desde else None
        return d


@dataclass(slots=True)
class Regras:
    """Avalia a casa e diz o que está mal.

    Guarda, por aviso, desde quando é que a condição é verdade — é isso que
    permite dizer "há 6 minutos" e ordenar pelo que está mal há mais tempo.
    """

    engine: Engine
    entry_id: str
    _desde: dict[str, datetime] = field(default_factory=dict)
    _sem_resposta: list[str] = field(default_factory=list)
    _varrido_em: datetime | None = None

    def avaliar(self, hass) -> list[Aviso]:
        e = self.engine
        agora = dt_util.utcnow()
        avisos: list[Aviso] = []

        # ── o que acorda alguém a meio da noite ──
        if e.smoke:
            avisos.append(Aviso(
                id="fumo", gravidade=PERIGO, titulo="Fumo na Cozinha",
                detalhe="O detetor de fumo disparou.", icone="alert", divisao="Cozinha",
            ))
        if e.leak:
            avisos.append(Aviso(
                id="fuga_agua", gravidade=PERIGO, titulo="Água na Lavandaria",
                detalhe="O sensor de inundação está molhado.", icone="water", divisao="Lavandaria",
            ))

        # ── portas e janelas ──
        for cid, aberto in e.contacts.items():
            if not aberto:
                continue
            desde = e.contact_since.get(cid, e.boot_time)
            ha_quanto = agora - desde
            divisao = AREA_NAMES.get(AREA_DE_CONTACTO.get(cid, ""), None)
            if CLASSE_DE_CONTACTO.get(cid) == "door":
                if ha_quanto >= PORTA_ABERTA:
                    avisos.append(Aviso(
                        id=f"aberto_{cid}", gravidade=AVISO,
                        titulo=f"{NOME_DE_CONTACTO.get(cid, 'Porta')} aberta",
                        detalhe=f"Está assim {_ha_quanto(ha_quanto)}.", icone="door",
                        divisao=divisao, desde=desde,
                    ))
            elif ha_quanto >= JANELA_ESQUECIDA:
                avisos.append(Aviso(
                    id=f"aberto_{cid}", gravidade=AVISO,
                    titulo=f"{NOME_DE_CONTACTO.get(cid, 'Janela')} aberta",
                    detalhe=f"Está assim {_ha_quanto(ha_quanto)}.", icone="window",
                    divisao=divisao, desde=desde,
                ))

        # ── a aquecer ou a arrefecer para a rua ──
        for cid, aberto in e.contacts.items():
            if not aberto:
                continue
            area = AREA_DE_CONTACTO.get(cid)
            for clima_id, clima in e.climates.items():
                if AREA_DE_CLIMA.get(clima_id) != area or clima.mode == "off":
                    continue
                verbo = "a arrefecer" if clima.mode == "cool" else "a aquecer"
                avisos.append(Aviso(
                    id=f"janela_ac_{cid}", gravidade=AVISO,
                    titulo="Janela aberta com o ar ligado",
                    detalhe=f"O ar da {AREA_NAMES.get(area, area)} está {verbo} com a janela aberta.",
                    icone="ac", divisao=AREA_NAMES.get(area, area),
                    acao={"texto": "Desligar o ar", "dominio": "climate", "servico": "set_hvac_mode",
                          "entidade": f"climate.ac_{clima_id}", "dados": {"hvac_mode": "off"}},
                ))

        # ── a casa vazia ──
        if not any(e.person_home(p["id"]) for p in PEOPLE):
            acesas = [l for l in LIGHTS if e.lights[l["id"]].on]
            if acesas:
                quantas = len(acesas)
                avisos.append(Aviso(
                    id="vazia_luzes", gravidade=AVISO, titulo="Ninguém em casa, luzes acesas",
                    detalhe=f"{quantas} {'luz ficou acesa' if quantas == 1 else 'luzes ficaram acesas'}.",
                    icone="bulb",
                    acao={"texto": "Desligar as luzes", "dominio": "light", "servico": "turn_off",
                          "entidade": [f"light.{l['id']}" for l in acesas], "dados": {}},
                ))
            if not e.lock_locked:
                avisos.append(Aviso(
                    id="vazia_destrancada", gravidade=AVISO, titulo="Ninguém em casa, porta destrancada",
                    detalhe="A fechadura da entrada está aberta.", icone="lock", divisao="Entrada",
                    acao={"texto": "Trancar", "dominio": "lock", "servico": "lock",
                          "entidade": "lock.porta_entrada", "dados": {}},
                ))

        # ── a casa a ficar sem reservas ──
        if e.battery_soc < BATERIA_FRACA:
            avisos.append(Aviso(
                id="bateria_casa", gravidade=AVISO, titulo="Bateria quase vazia",
                detalhe=f"Está a {e.battery_soc:.0f} %. A casa passa a comprar à rede.",
                icone="battery", divisao="Garagem",
            ))

        # ── aparelhos que deixaram de responder ──
        sem_resposta = self._varrer_sem_resposta(hass, agora)
        if sem_resposta:
            nomes = ", ".join(sem_resposta[:3])
            mais = len(sem_resposta) - 3
            avisos.append(Aviso(
                id="sem_resposta", gravidade=AVISO,
                titulo="Aparelho sem resposta" if len(sem_resposta) == 1 else f"{len(sem_resposta)} aparelhos sem resposta",
                detalhe=nomes + (f" e mais {mais}." if mais > 0 else "."),
                icone="wifioff",
            ))

        # ── o que já acabou e alguém tem de ir buscar ──
        for chave, app, nome, divisao in (
            ("washer", e.washer, "A máquina da roupa", "Lavandaria"),
            ("dryer", e.dryer, "O secador", "Lavandaria"),
            ("dishwasher", e.dishwasher, "A máquina da loiça", "Cozinha"),
        ):
            if app.power and app.status == "Concluído":
                avisos.append(Aviso(
                    id=f"terminou_{chave}", gravidade=INFO, titulo=f"{nome} terminou",
                    detalhe=f"Programa {app.program}.", icone="washer", divisao=divisao,
                ))

        if e.ev_plugged and e.ev_soc >= e.ev_limit - 0.5:
            avisos.append(Aviso(
                id="carro_carregado", gravidade=INFO, titulo="O carro está carregado",
                detalhe=f"Chegou aos {e.ev_soc:.0f} %.", icone="ev", divisao="Garagem",
            ))

        return self._datar_e_ordenar(avisos, agora)

    def _varrer_sem_resposta(self, hass, agora: datetime) -> list[str]:
        """Percorrer o registo de entidades é caro; de dez em dez segundos chega."""
        if self._varrido_em is None or agora - self._varrido_em >= timedelta(seconds=10):
            self._sem_resposta = _sem_resposta(hass, self.entry_id)
            self._varrido_em = agora
        return self._sem_resposta

    def _datar_e_ordenar(self, avisos: list[Aviso], agora: datetime) -> list[Aviso]:
        """Cada aviso guarda desde quando existe; os que desapareceram esquecem-se."""
        vivos = {a.id for a in avisos}
        for morto in [k for k in self._desde if k not in vivos]:
            del self._desde[morto]
        for a in avisos:
            if a.desde is None:
                a.desde = self._desde.setdefault(a.id, agora)
            else:
                self._desde[a.id] = a.desde
        return sorted(avisos, key=lambda a: (ORDEM[a.gravidade], a.desde or agora))


def _ha_quanto(delta: timedelta) -> str:
    minutos = int(delta.total_seconds() // 60)
    if minutos < 60:
        return f"há {minutos} minutos" if minutos != 1 else "há um minuto"
    horas = minutos // 60
    if horas < 24:
        return f"há {horas} horas" if horas != 1 else "há uma hora"
    dias = horas // 24
    return "desde ontem" if dias == 1 else f"há {dias} dias"


def _sem_resposta(hass, entry_id: str) -> list[str]:
    """Aparelhos nossos que o Home Assistant já não consegue ler."""
    registo = er.async_get(hass)
    nomes: list[str] = []
    for entrada in er.async_entries_for_config_entry(registo, entry_id):
        if entrada.disabled_by or entrada.hidden_by:
            continue
        estado = hass.states.get(entrada.entity_id)
        # "unknown" não é avaria: é um botão que ainda não foi carregado ou uma
        # hora que ainda não aconteceu. Sem resposta é mesmo "unavailable".
        if estado is not None and estado.state == "unavailable":
            nomes.append(
                estado.attributes.get("friendly_name")
                or entrada.name
                or entrada.original_name
                or entrada.entity_id
            )
    return sorted(nomes)


class AvisosSensor(CasaEntity, SensorEntity):
    """`sensor.avisos` — quantos são, e quais.

    Recalcula a cada tick mas só escreve estado quando alguma coisa muda: o
    painel recebe sempre a verdade e o histórico não fica cheio de repetições.
    """

    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:alert-circle-outline"

    def __init__(self, engine: Engine, entry_id: str) -> None:
        super().__init__(
            engine,
            entity_id="sensor.avisos",
            unique_id="sensor_avisos",
            device=device_info("casa", "Casa", None, "Painel"),
            name="Avisos",
            tick=True,
        )
        self._attr_has_entity_name = False
        self._regras = Regras(engine=engine, entry_id=entry_id)
        self._avisos: list[Aviso] = []
        self._calma_desde: datetime | None = None
        self._assinatura: tuple = ()

    @property
    def native_value(self) -> int:
        return len(self._avisos)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "avisos": [a.como_dicionario() for a in self._avisos],
            "pior": self._avisos[0].gravidade if self._avisos else None,
            # desde quando é que não há nada a dizer — a resposta à pergunta
            # quando a resposta é "nada"
            "calma_desde": self._calma_desde.isoformat() if self._calma_desde else None,
        }

    @callback
    def _recalcular(self) -> bool:
        self._avisos = self._regras.avaliar(self.hass)
        if not self._avisos and self._calma_desde is None:
            self._calma_desde = dt_util.utcnow()
        elif self._avisos:
            self._calma_desde = None
        assinatura = tuple((a.id, a.gravidade, a.titulo, a.detalhe) for a in self._avisos)
        mudou = assinatura != self._assinatura
        self._assinatura = assinatura
        return mudou

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_AVISOS, self._handle_update))
        self._recalcular()

    @callback
    def _handle_tick(self) -> None:
        if self._recalcular():
            self.async_write_ha_state()

    @callback
    def _handle_update(self) -> None:
        if self._recalcular():
            self.async_write_ha_state()
