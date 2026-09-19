"""Botão para repor a demo no estado inicial."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .entity import CasaEntity, device_info


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([CasaResetButton(entry.runtime_data)])


class CasaResetButton(CasaEntity, ButtonEntity):
    _attr_icon = "mdi:restore"
    _attr_entity_category = EntityCategory.CONFIG

    def __init__(self, engine) -> None:
        super().__init__(engine, entity_id="button.repor_demo", unique_id="button_repor_demo",
                         device=device_info("servidor", "Servidor Casa", "garagem", "Mini PC"), name="Repor demo")

    async def async_press(self) -> None:
        self.engine.reset_devices()
