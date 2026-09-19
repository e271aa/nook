"""Estores (com tempo de percurso real) e portão da garagem."""

from __future__ import annotations

from typing import Any

from homeassistant.components.cover import (
    ATTR_POSITION,
    CoverDeviceClass,
    CoverEntity,
    CoverEntityFeature,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .const import COVERS, GARAGE
from .entity import CasaEntity, device_info


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    engine = entry.runtime_data
    entities: list[CoverEntity] = [CasaBlind(engine, cfg) for cfg in COVERS]
    entities.append(CasaGarage(engine))
    async_add_entities(entities)


class _BaseCover(CasaEntity, CoverEntity):
    _key: str

    @property
    def _c(self):
        return self.engine.garage if self._key == "__garage__" else self.engine.covers[self._key]

    @property
    def current_cover_position(self) -> int:
        return round(self._c.position)

    @property
    def is_closed(self) -> bool:
        return self._c.position <= 0.5

    @property
    def is_opening(self) -> bool:
        return self._c.last_dir > 0 and abs(self._c.position - self._c.target) >= 0.01

    @property
    def is_closing(self) -> bool:
        return self._c.last_dir < 0 and abs(self._c.position - self._c.target) >= 0.01

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {"target_position": round(self._c.target), "travel_seconds": self._c.travel}

    async def async_open_cover(self, **kwargs: Any) -> None:
        self.engine.set_cover_target(self._key, 100)

    async def async_close_cover(self, **kwargs: Any) -> None:
        self.engine.set_cover_target(self._key, 0)

    async def async_stop_cover(self, **kwargs: Any) -> None:
        self.engine.stop_cover(self._key)


class CasaBlind(_BaseCover):
    _attr_device_class = CoverDeviceClass.SHUTTER
    _attr_supported_features = (
        CoverEntityFeature.OPEN | CoverEntityFeature.CLOSE | CoverEntityFeature.STOP | CoverEntityFeature.SET_POSITION
    )

    def __init__(self, engine, cfg: dict) -> None:
        super().__init__(
            engine,
            entity_id=f"cover.estore_{cfg['id']}",
            unique_id=f"cover_{cfg['id']}",
            device=device_info(f"cover_{cfg['id']}", cfg["name"], cfg["area"], "Motor de estore"),
            signal=f"cover_{cfg['id']}",
        )
        self._key = cfg["id"]

    async def async_set_cover_position(self, **kwargs: Any) -> None:
        self.engine.set_cover_target(self._key, kwargs[ATTR_POSITION])


class CasaGarage(_BaseCover):
    _attr_device_class = CoverDeviceClass.GARAGE
    _attr_supported_features = CoverEntityFeature.OPEN | CoverEntityFeature.CLOSE | CoverEntityFeature.STOP

    def __init__(self, engine) -> None:
        super().__init__(
            engine,
            entity_id=f"cover.{GARAGE['id']}",
            unique_id=f"cover_{GARAGE['id']}",
            device=device_info(GARAGE["id"], GARAGE["name"], GARAGE["area"], "Motor de portão seccionado"),
            signal="garage",
        )
        self._key = "__garage__"
