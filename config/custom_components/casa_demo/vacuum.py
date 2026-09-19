"""Robô aspirador simulado."""

from __future__ import annotations

from typing import Any

from homeassistant.components.vacuum import StateVacuumEntity, VacuumActivity, VacuumEntityFeature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import CasaDemoConfigEntry
from .entity import CasaEntity, device_info

FAN_SPEEDS = ["Silencioso", "Normal", "Turbo", "Máximo"]


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([CasaVacuum(entry.runtime_data)])


class CasaVacuum(CasaEntity, StateVacuumEntity):
    _attr_fan_speed_list = FAN_SPEEDS
    _attr_supported_features = (
        VacuumEntityFeature.START
        | VacuumEntityFeature.PAUSE
        | VacuumEntityFeature.STOP
        | VacuumEntityFeature.RETURN_HOME
        | VacuumEntityFeature.FAN_SPEED
        | VacuumEntityFeature.LOCATE
        | VacuumEntityFeature.STATE
    )

    def __init__(self, engine) -> None:
        super().__init__(engine, entity_id="vacuum.robo", unique_id="vacuum_robo",
                         device=device_info("robo", "Robô aspirador", "sala", "Robô com mapeamento LiDAR"),
                         signal="vacuum")

    @property
    def _v(self) -> dict[str, Any]:
        return self.engine.vacuum

    @property
    def activity(self) -> VacuumActivity:
        return VacuumActivity(self._v["activity"])

    @property
    def fan_speed(self) -> str:
        return self._v["fan"]

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"bateria": round(self._v["battery"]), "area_limpa": round(self._v["area"], 1)}

    def _set(self, activity: str) -> None:
        self._v["activity"] = activity
        if activity == "returning":
            self._v["started"] = dt_util.utcnow()
        self.engine.notify("vacuum")

    async def async_start(self) -> None:
        if self._v["activity"] == "docked":
            self._v["area"] = 0.0
        self._set("cleaning")

    async def async_pause(self) -> None:
        self._set("paused")

    async def async_stop(self, **kwargs: Any) -> None:
        self._set("idle")

    async def async_return_to_base(self, **kwargs: Any) -> None:
        self._set("returning")

    async def async_set_fan_speed(self, fan_speed: str, **kwargs: Any) -> None:
        self._v["fan"] = fan_speed
        self.async_write_ha_state()

    async def async_locate(self, **kwargs: Any) -> None:
        self.hass.bus.async_fire("casa_demo_robo_localizar", {})
