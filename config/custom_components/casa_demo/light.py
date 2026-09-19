"""Luzes simuladas (on/off, dimmer, branco quente/frio e RGB)."""

from __future__ import annotations

from typing import Any

from homeassistant.components.light import (
    ATTR_BRIGHTNESS,
    ATTR_COLOR_TEMP_KELVIN,
    ATTR_EFFECT,
    ATTR_RGB_COLOR,
    ColorMode,
    LightEntity,
    LightEntityFeature,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .const import LIGHTS
from .entity import CasaEntity, device_info

EFFECTS = ["Nenhum", "Respirar", "Arco-íris", "Vela"]


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    engine = entry.runtime_data
    async_add_entities(CasaLight(engine, cfg) for cfg in LIGHTS)


class CasaLight(CasaEntity, LightEntity):
    _attr_min_color_temp_kelvin = 2200
    _attr_max_color_temp_kelvin = 6500

    def __init__(self, engine, cfg: dict) -> None:
        super().__init__(
            engine,
            entity_id=f"light.{cfg['id']}",
            unique_id=f"light_{cfg['id']}",
            device=device_info(f"light_{cfg['id']}", cfg["name"], cfg["area"], "Lâmpada inteligente"),
            signal=f"light_{cfg['id']}",
        )
        self._key = cfg["id"]
        mode = cfg["mode"]
        if mode == "onoff":
            self._attr_supported_color_modes = {ColorMode.ONOFF}
            self._attr_color_mode = ColorMode.ONOFF
        elif mode == "dim":
            self._attr_supported_color_modes = {ColorMode.BRIGHTNESS}
            self._attr_color_mode = ColorMode.BRIGHTNESS
        elif mode == "ct":
            self._attr_supported_color_modes = {ColorMode.COLOR_TEMP}
            self._attr_color_mode = ColorMode.COLOR_TEMP
        else:
            self._attr_supported_color_modes = {ColorMode.COLOR_TEMP, ColorMode.RGB}
            self._attr_color_mode = ColorMode.RGB
            self._attr_supported_features = LightEntityFeature.EFFECT
            self._attr_effect_list = EFFECTS
        self._mode = mode

    @property
    def _st(self):
        return self.engine.lights[self._key]

    @property
    def is_on(self) -> bool:
        return self._st.on

    @property
    def brightness(self) -> int | None:
        return self._st.brightness if self._mode != "onoff" else None

    @property
    def color_temp_kelvin(self) -> int | None:
        return self._st.color_temp if ColorMode.COLOR_TEMP in self._attr_supported_color_modes else None

    @property
    def rgb_color(self) -> tuple[int, int, int] | None:
        return self._st.rgb if self._mode == "rgb" else None

    @property
    def effect(self) -> str | None:
        if self._mode != "rgb":
            return None
        return self._st.effect or "Nenhum"

    async def async_turn_on(self, **kwargs: Any) -> None:
        st = self._st
        st.on = True
        if ATTR_BRIGHTNESS in kwargs:
            st.brightness = max(1, int(kwargs[ATTR_BRIGHTNESS]))
        if ATTR_COLOR_TEMP_KELVIN in kwargs:
            st.color_temp = int(kwargs[ATTR_COLOR_TEMP_KELVIN])
            if self._mode == "rgb":
                self._attr_color_mode = ColorMode.COLOR_TEMP
        if ATTR_RGB_COLOR in kwargs:
            st.rgb = tuple(kwargs[ATTR_RGB_COLOR])
            self._attr_color_mode = ColorMode.RGB
        if ATTR_EFFECT in kwargs:
            st.effect = None if kwargs[ATTR_EFFECT] == "Nenhum" else kwargs[ATTR_EFFECT]
        self.engine.schedule_save()
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._st.on = False
        self.engine.schedule_save()
        self.async_write_ha_state()
