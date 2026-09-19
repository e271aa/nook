"""Selects: programas dos eletrodomésticos, velocidade do exaustor e tempo simulado."""

from __future__ import annotations

from collections.abc import Callable

from homeassistant.components.select import SelectEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .const import (
    DISHWASHER_PROGRAMS,
    DRYER_PROGRAMS,
    HOOD_SPEEDS,
    OVEN_PROGRAMS,
    WASHER_PROGRAMS,
    WEATHER_OPTIONS,
)
from .engine import Engine
from .entity import CasaEntity, device_info


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    e = entry.runtime_data

    def prog(app: str):
        def _set(e: Engine, v: str) -> None:
            e.appliance(app).program = v
        return _set

    def hood_speed(e: Engine, v: str) -> None:
        e.hood.extra["speed"] = v
        e.hood.power = v != "Desligado"

    def weather(e: Engine, v: str) -> None:
        e.weather_mode = v
        e.notify_all()

    async_add_entities(
        [
            CasaSelect(e, key="maquina_roupa_programa", name="Programa", options=list(WASHER_PROGRAMS), signal="washer",
                       device=device_info("maquina_roupa", "Máquina de lavar roupa", "lavandaria", "Lavar 9 kg"),
                       get=lambda e: e.washer.program, set_=prog("washer"), icon="mdi:tshirt-crew"),
            CasaSelect(e, key="secador_programa", name="Programa", options=list(DRYER_PROGRAMS), signal="dryer",
                       device=device_info("secador", "Máquina de secar", "lavandaria", "Bomba de calor 8 kg"),
                       get=lambda e: e.dryer.program, set_=prog("dryer"), icon="mdi:tshirt-crew"),
            CasaSelect(e, key="maquina_loica_programa", name="Programa", options=list(DISHWASHER_PROGRAMS), signal="dishwasher",
                       device=device_info("maquina_loica", "Máquina da loiça", "cozinha", "Encastre 14 serviços"),
                       get=lambda e: e.dishwasher.program, set_=prog("dishwasher"), icon="mdi:silverware-clean"),
            CasaSelect(e, key="forno_programa", name="Programa", options=list(OVEN_PROGRAMS), signal="oven",
                       device=device_info("forno", "Forno", "cozinha", "Forno pirolítico"),
                       get=lambda e: e.oven.program, set_=prog("oven"), icon="mdi:stove"),
            CasaSelect(e, key="exaustor_velocidade", name="Velocidade", options=HOOD_SPEEDS, signal="hood",
                       device=device_info("exaustor", "Exaustor", "cozinha", "Exaustor de ilha"),
                       get=lambda e: e.hood.extra["speed"] if e.hood.power else "Desligado", set_=hood_speed, icon="mdi:fan"),
            CasaSelect(e, key="tempo_simulado", name="Tempo simulado", options=WEATHER_OPTIONS, signal="weather_mode",
                       device=device_info("estacao", "Estação meteorológica", "jardim", "Sensor exterior"),
                       get=lambda e: e.weather_mode, set_=weather, icon="mdi:weather-partly-rainy",
                       category=EntityCategory.CONFIG),
        ]
    )


class CasaSelect(CasaEntity, SelectEntity):
    def __init__(self, engine: Engine, *, key: str, name: str, options: list[str], device, signal: str,
                 get: Callable[[Engine], str], set_: Callable[[Engine, str], None], icon: str,
                 category: EntityCategory | None = None) -> None:
        super().__init__(engine, entity_id=f"select.{key}", unique_id=f"select_{key}", device=device, name=name, signal=signal)
        self._attr_options = options
        self._attr_icon = icon
        self._attr_entity_category = category
        self._get, self._set = get, set_

    @property
    def current_option(self) -> str:
        return self._get(self.engine)

    async def async_select_option(self, option: str) -> None:
        self._set(self.engine, option)
        self.engine.schedule_save()
        self.async_write_ha_state()
