"""Sensores binários: movimento, portas/janelas, fumo, inundação, etc."""

from __future__ import annotations

from collections.abc import Callable

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .const import CONTACTS, MOTION
from .engine import Engine
from .entity import CasaEntity, device_info

D = BinarySensorDeviceClass


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    e = entry.runtime_data
    ents: list[CasaBinary] = []
    for m in MOTION:
        ents.append(CasaBinary(e, key=f"movimento_{m['id']}", name=None, dc=D.MOTION, signal=f"motion_{m['id']}",
                               device=device_info(f"movimento_{m['id']}", m["name"], m["area"], "Sensor PIR"),
                               get=lambda e, k=m["id"]: e.motion.get(k) is not None))
    for c in CONTACTS:
        ents.append(CasaBinary(e, key=c["id"], name=None, dc=D.DOOR if c["class"] == "door" else D.WINDOW,
                               signal=f"contact_{c['id']}",
                               device=device_info(f"contacto_{c['id']}", c["name"], c["area"], "Sensor de abertura"),
                               get=lambda e, k=c["id"]: e.contacts.get(k, False)))
    ents += [
        CasaBinary(e, key="fumo_cozinha", name=None, dc=D.SMOKE, signal="smoke",
                   device=device_info("fumo_cozinha", "Detetor de fumo Cozinha", "cozinha", "Detetor de fumo"),
                   get=lambda e: e.smoke),
        CasaBinary(e, key="inundacao_lavandaria", name=None, dc=D.MOISTURE, signal="leak",
                   device=device_info("inundacao_lavandaria", "Sensor de inundação", "lavandaria", "Sensor de água"),
                   get=lambda e: e.leak),
        CasaBinary(e, key="placa_bloqueio", name="Bloqueio crianças", dc=None, signal="cooktop",
                   device=device_info("placa", "Placa de indução", "cozinha", "Indução 4 zonas"),
                   get=lambda e: e.cooktop.extra["child_lock"]),
        CasaBinary(e, key="robo_a_limpar", name="A limpar", dc=D.RUNNING, signal="vacuum",
                   device=device_info("robo", "Robô aspirador", "sala", "Robô com mapeamento LiDAR"),
                   get=lambda e: e.vacuum["activity"] == "cleaning"),
        CasaBinary(e, key="carro_ligado", name="Carro ligado", dc=D.PLUG, signal="ev",
                   device=device_info("carregador_ve", "Carregador VE", "garagem", "Wallbox 7,4 kW"),
                   get=lambda e: e.ev_plugged),
    ]
    async_add_entities(ents)


class CasaBinary(CasaEntity, BinarySensorEntity):
    def __init__(self, engine: Engine, *, key: str, name: str | None, dc: BinarySensorDeviceClass | None, signal: str | None,
                 device, get: Callable[[Engine], bool]) -> None:
        super().__init__(engine, entity_id=f"binary_sensor.{key}", unique_id=f"binary_{key}", device=device,
                         name=name, signal=signal, tick=signal is None)
        self._attr_device_class = dc
        self._get = get

    @property
    def is_on(self) -> bool:
        return bool(self._get(self.engine))
