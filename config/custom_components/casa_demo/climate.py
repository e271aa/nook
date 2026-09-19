"""Ares condicionados: a temperatura da divisão aproxima-se do alvo com o tempo."""

from __future__ import annotations

from typing import Any

from homeassistant.components.climate import (
    ATTR_HVAC_MODE,
    ClimateEntity,
    ClimateEntityFeature,
    HVACAction,
    HVACMode,
)
from homeassistant.const import ATTR_TEMPERATURE, UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .const import CLIMATES
from .entity import CasaEntity, device_info

MODES = [HVACMode.OFF, HVACMode.HEAT_COOL, HVACMode.COOL, HVACMode.HEAT, HVACMode.DRY, HVACMode.FAN_ONLY]
FAN_MODES = ["auto", "low", "medium", "high"]
ACTION_MAP = {
    "off": HVACAction.OFF,
    "idle": HVACAction.IDLE,
    "heating": HVACAction.HEATING,
    "cooling": HVACAction.COOLING,
    "drying": HVACAction.DRYING,
    "fan": HVACAction.FAN,
}


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    engine = entry.runtime_data
    async_add_entities(CasaClimate(engine, cfg) for cfg in CLIMATES)


class CasaClimate(CasaEntity, ClimateEntity):
    _attr_temperature_unit = UnitOfTemperature.CELSIUS
    _attr_hvac_modes = MODES
    _attr_fan_modes = FAN_MODES
    _attr_min_temp = 16
    _attr_max_temp = 30
    _attr_target_temperature_step = 0.5
    _attr_supported_features = (
        ClimateEntityFeature.TARGET_TEMPERATURE
        | ClimateEntityFeature.FAN_MODE
        | ClimateEntityFeature.TURN_ON
        | ClimateEntityFeature.TURN_OFF
    )

    def __init__(self, engine, cfg: dict) -> None:
        super().__init__(
            engine,
            entity_id=f"climate.ac_{cfg['id']}",
            unique_id=f"climate_{cfg['id']}",
            device=device_info(f"climate_{cfg['id']}", cfg["name"], cfg["area"], "Ar condicionado inverter"),
            signal=f"climate_{cfg['id']}",
            tick=True,
        )
        self._key = cfg["id"]

    @property
    def _c(self):
        return self.engine.climates[self._key]

    @property
    def current_temperature(self) -> float:
        return round(self.engine.room_temp[self._key], 1)

    @property
    def current_humidity(self) -> float:
        return round(self.engine.room_hum[self._key])

    @property
    def target_temperature(self) -> float:
        return self._c.target

    @property
    def hvac_mode(self) -> HVACMode:
        return HVACMode(self._c.mode)

    @property
    def hvac_action(self) -> HVACAction:
        return ACTION_MAP.get(self._c.action, HVACAction.IDLE)

    @property
    def fan_mode(self) -> str:
        return self._c.fan

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        # Muitas unidades reportam a sonda da unidade exterior
        return {"outdoor_temperature": round(self.engine.outdoor_temp, 1), "power": round(self._c.power)}

    async def async_set_temperature(self, **kwargs: Any) -> None:
        if (mode := kwargs.get(ATTR_HVAC_MODE)) is not None:
            self._c.mode = str(mode)
        if (t := kwargs.get(ATTR_TEMPERATURE)) is not None:
            self._c.target = round(float(t) * 2) / 2
        self._changed()

    async def async_set_hvac_mode(self, hvac_mode: HVACMode) -> None:
        self._c.mode = str(hvac_mode)
        self._changed()

    async def async_set_fan_mode(self, fan_mode: str) -> None:
        self._c.fan = fan_mode
        self._changed()

    async def async_turn_on(self) -> None:
        if self._c.mode == "off":
            self._c.mode = "heat_cool"
        self._changed()

    async def async_turn_off(self) -> None:
        self._c.mode = "off"
        self._changed()

    def _changed(self) -> None:
        self.engine.schedule_save()
        self.async_write_ha_state()
