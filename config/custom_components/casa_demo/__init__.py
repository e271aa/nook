"""Casa Demo — moradia simulada para demonstrar o dashboard.

Ativa-se com `casa_demo:` no configuration.yaml. Cria (uma vez) a entrada de
configuração, os pisos, as divisões e todos os dispositivos, e mantém a física
da casa a correr num motor único (ver engine.py).
"""

from __future__ import annotations

import logging

from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant, ServiceCall, callback
from homeassistant.helpers import area_registry as ar, floor_registry as fr
from homeassistant.helpers.typing import ConfigType

from .const import AREAS, DOMAIN, FLOORS, PLATFORMS, WEATHER_OPTIONS
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


async def async_setup_entry(hass: HomeAssistant, entry: CasaDemoConfigEntry) -> bool:
    engine = Engine(hass)
    if not await engine.async_load():
        # Primeiro arranque: 30 dias de histórico para os gráficos não nascerem vazios
        await async_backfill(hass, engine)
        await engine.async_save_now()
    entry.runtime_data = engine

    _async_ensure_floors_and_areas(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    engine.start()

    async def _reset(call: ServiceCall) -> None:
        engine.reset_devices()

    async def _set_weather(call: ServiceCall) -> None:
        engine.weather_mode = call.data.get("modo", WEATHER_OPTIONS[0])
        engine.notify("weather_mode")
        engine.notify_all()

    hass.services.async_register(DOMAIN, "repor", _reset)
    hass.services.async_register(DOMAIN, "definir_tempo", _set_weather)

    async def _on_stop(_: Event) -> None:
        await engine.async_save_now()

    entry.async_on_unload(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _on_stop))
    entry.async_on_unload(engine.stop)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: CasaDemoConfigEntry) -> bool:
    await entry.runtime_data.async_save_now()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
