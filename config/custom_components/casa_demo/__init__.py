"""Casa Demo — moradia simulada para demonstrar o dashboard.

Ativa-se com `casa_demo:` no configuration.yaml. Cria (uma vez) a entrada de
configuração, os pisos, as divisões e todos os dispositivos, e mantém a física
da casa a correr num motor único (ver engine.py).
"""

from __future__ import annotations

import logging

from datetime import timedelta

from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant, ServiceCall, callback
from homeassistant.helpers import area_registry as ar, entity_registry as er, floor_registry as fr
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

from .const import AREAS, DOMAIN, ENTIDADES_ANTIGAS, FLOORS, PLATFORMS, WEATHER_OPTIONS
from .engine import Engine
from .history import async_backfill
from .visitor import VisitorSetupView

_LOGGER = logging.getLogger(__name__)

type CasaDemoConfigEntry = ConfigEntry[Engine]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Arranque via YAML: cria a entrada de configuração se ainda não existir."""
    hass.http.register_view(VisitorSetupView())
    if DOMAIN in config and not hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(
            hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_IMPORT}, data={})
        )
    return True


@callback
def _async_ensure_floors_and_areas(hass: HomeAssistant) -> None:
    floors = fr.async_get(hass)
    areas = ar.async_get(hass)
    floor_ids: dict[str, str] = {}
    for f in FLOORS:
        entry = floors.async_get_floor_by_name(f["name"]) or floors.async_create(
            f["name"], level=f["level"], icon=f["icon"]
        )
        floor_ids[f["id"]] = entry.floor_id
    for a in AREAS:
        area = areas.async_get_area_by_name(a["name"])
        if area is None:
            areas.async_create(a["name"], floor_id=floor_ids.get(a["floor"]), icon=a["icon"])


@callback
def _async_limpar_entidades_antigas(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Apaga o que sobrou de mudanças de nome, para não ficar "sem resposta"."""
    registo = er.async_get(hass)
    for entrada in er.async_entries_for_config_entry(registo, entry.entry_id):
        if entrada.unique_id in ENTIDADES_ANTIGAS:
            _LOGGER.info("A apagar entidade antiga: %s", entrada.entity_id)
            registo.async_remove(entrada.entity_id)


async def async_setup_entry(hass: HomeAssistant, entry: CasaDemoConfigEntry) -> bool:
    engine = Engine(hass)
    if not await engine.async_load():
        # Primeiro arranque: 30 dias de histórico para os gráficos não nascerem vazios
        await async_backfill(hass, engine)
        await engine.async_save_now()
    entry.runtime_data = engine

    _async_ensure_floors_and_areas(hass)
    _async_limpar_entidades_antigas(hass, entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    engine.start()

    async def _reset(call: ServiceCall) -> None:
        engine.reset_devices()

    async def _set_weather(call: ServiceCall) -> None:
        engine.weather_mode = call.data.get("modo", WEATHER_OPTIONS[0])
        engine.notify("weather_mode")
        engine.notify_all()

    async def _simular(call: ServiceCall) -> None:
        """Põe a casa numa situação, para se poder mostrar o que ela diz.

        Sem isto, mostrar um aviso a um cliente exigia esperar que a casa
        corresse mal sozinha.
        """
        situacao = call.data.get("situacao")
        agora = dt_util.utcnow()

        if situacao == "Fumo na cozinha":
            engine.set_hazard("fumo", True)
        elif situacao == "Fuga de água":
            engine.set_hazard("agua", True)
        elif situacao == "Porta aberta há muito tempo":
            engine.set_contact("porta_entrada", True, desde=agora - timedelta(minutes=6))
        elif situacao == "Janela aberta com o ar ligado":
            engine.set_contact("janela_suite", True)
            clima = engine.climates["suite"]
            clima.mode = "cool"
            clima.target = min(clima.target, 21.0)
            engine.notify("climate_suite")
        elif situacao == "Máquina da roupa terminada":
            engine.washer.power = True
            engine.washer.running = False
            engine.washer.progress = 100.0
            engine.washer.status = "Concluído"
            engine.notify("washer")
        elif situacao == "Carro carregado":
            engine.ev_plugged = True
            engine.ev_soc = engine.ev_limit
            engine.notify("ev")
        elif situacao == "Ninguém em casa":
            for p in engine.people_override:
                engine.people_override[p] = False
            engine.notify_all()
        elif situacao == "Limpar tudo":
            engine.set_hazard("fumo", False)
            engine.set_hazard("agua", False)
            engine.set_contact("porta_entrada", False)
            engine.set_contact("janela_suite", False)
            engine.climates["suite"].mode = "off"
            engine.washer.status = "Pronto"
            engine.washer.progress = 0.0
            engine.ev_soc = 64.0
            for p in engine.people_override:
                engine.people_override[p] = None
            engine.notify_all()
        engine.schedule_save()

    hass.services.async_register(DOMAIN, "repor", _reset)
    hass.services.async_register(DOMAIN, "simular", _simular)
    hass.services.async_register(DOMAIN, "definir_tempo", _set_weather)

    async def _on_stop(_: Event) -> None:
        await engine.async_save_now()

    entry.async_on_unload(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _on_stop))
    entry.async_on_unload(engine.stop)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: CasaDemoConfigEntry) -> bool:
    await entry.runtime_data.async_save_now()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
