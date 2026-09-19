"""Entidade base: liga-se ao motor por sinais do dispatcher."""

from __future__ import annotations

from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import Entity

from .const import AREAS, DOMAIN, MANUFACTURER, SIGNAL_DEVICE, SIGNAL_TICK
from .engine import Engine

AREA_NAMES = {a["id"]: a["name"] for a in AREAS}


def device_info(key: str, name: str, area: str | None, model: str) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, key)},
        name=name,
        manufacturer=MANUFACTURER,
        model=model,
        suggested_area=AREA_NAMES.get(area) if area else None,
    )


class CasaEntity(Entity):
    """Base comum. `signal` = chave de dispositivo; `tick` = também atualiza no tick lento."""

    _attr_should_poll = False
    _attr_has_entity_name = True

    def __init__(
        self,
        engine: Engine,
        *,
        entity_id: str,
        unique_id: str,
        device: DeviceInfo,
        name: str | None = None,
        signal: str | None = None,
        tick: bool = False,
    ) -> None:
        self.engine = engine
        self.entity_id = entity_id
        self._attr_unique_id = f"{DOMAIN}_{unique_id}"
        self._attr_device_info = device
        self._attr_name = name
        self._signal = signal
        self._tick = tick

    async def async_added_to_hass(self) -> None:
        if self._signal:
            self.async_on_remove(
                async_dispatcher_connect(self.hass, SIGNAL_DEVICE.format(self._signal), self._handle_update)
            )
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_DEVICE.format("*"), self._handle_update)
        )
        if self._tick:
            self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_TICK, self._handle_tick))

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @callback
    def _handle_tick(self) -> None:
        self.async_write_ha_state()
