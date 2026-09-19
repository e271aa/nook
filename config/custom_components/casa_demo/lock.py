"""Fechadura da porta de entrada."""

from __future__ import annotations

from typing import Any

from homeassistant.components.lock import LockEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .entity import CasaEntity, device_info


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([CasaLock(entry.runtime_data)])


class CasaLock(CasaEntity, LockEntity):
    def __init__(self, engine) -> None:
        super().__init__(engine, entity_id="lock.porta_entrada", unique_id="lock_porta_entrada",
                         device=device_info("fechadura", "Fechadura Entrada", "entrada", "Fechadura inteligente"),
                         signal="lock")

    @property
    def is_locked(self) -> bool:
        return self.engine.lock_locked

    async def async_lock(self, **kwargs: Any) -> None:
        self.engine.lock_locked = True
        self.async_write_ha_state()

    async def async_unlock(self, **kwargs: Any) -> None:
        self.engine.lock_locked = False
        self.async_write_ha_state()
