"""Telemóveis da família (entram/saem de casa segundo um horário)."""

from __future__ import annotations

from homeassistant.components.device_tracker import SourceType, TrackerEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .const import PEOPLE
from .entity import CasaEntity, device_info

# Deslocamento (graus) do "trabalho" em relação a casa
AWAY_OFFSET = {"ana": (0.031, -0.048), "miguel": (-0.022, 0.036)}


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities(CasaTracker(entry.runtime_data, p) for p in PEOPLE)


class CasaTracker(CasaEntity, TrackerEntity):
    _attr_source_type = SourceType.GPS
    _attr_location_accuracy = 12

    def __init__(self, engine, p: dict) -> None:
        super().__init__(engine, entity_id=f"device_tracker.{p['id']}_telemovel", unique_id=f"tracker_{p['id']}",
                         device=device_info(f"telemovel_{p['id']}", f"Telemóvel {p['name']}", None, "Smartphone"),
                         name=None, tick=True)
        self._pid = p["id"]

    @property
    def latitude(self) -> float:
        base = self.hass.config.latitude
        return base if self.engine.person_home(self._pid) else base + AWAY_OFFSET[self._pid][0]

    @property
    def longitude(self) -> float:
        base = self.hass.config.longitude
        return base if self.engine.person_home(self._pid) else base + AWAY_OFFSET[self._pid][1]
