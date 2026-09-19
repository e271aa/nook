"""Interruptores: tomadas, cilindro, carregador VE e alimentação dos eletrodomésticos."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from homeassistant.components.switch import SwitchDeviceClass, SwitchEntity
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .const import DISHWASHER_PROGRAMS, DRYER_PROGRAMS, PLUGS, WASHER_PROGRAMS
from .engine import Engine
from .entity import CasaEntity, device_info


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    e = entry.runtime_data
    ents: list[SwitchEntity] = []

    for p in PLUGS:
        ents.append(
            CasaSwitch(
                e, key=p["id"], name=None, icon=p["icon"], outlet=True,
                device=device_info(f"plug_{p['id']}", p["name"], p["area"], "Tomada inteligente"),
                get=lambda e, k=p["id"]: e.plugs[k],
                set_=lambda e, v, k=p["id"]: e.plugs.__setitem__(k, v),
            )
        )

    def _boiler(e: Engine, v: bool) -> None:
        e.boiler_on = v

    ents.append(CasaSwitch(e, key="cilindro", name=None, icon="mdi:water-boiler",
                           device=device_info("cilindro", "Cilindro", "lavandaria", "Termoacumulador 150 L"),
                           get=lambda e: e.boiler_on, set_=_boiler))

    def _ev(e: Engine, v: bool) -> None:
        e.ev_enabled = v and e.ev_soc < e.ev_limit

    ents.append(CasaSwitch(e, key="carregador_ve", name="Carregamento", icon="mdi:ev-station", signal="ev",
                           device=device_info("carregador_ve", "Carregador VE", "garagem", "Wallbox 7,4 kW"),
                           get=lambda e: e.ev_enabled, set_=_ev))

    # Eletrodomésticos: ligar = arrancar o programa selecionado (arranque remoto)
    def _program_switch(key: str, dev: tuple, programs: dict | None, label: str) -> CasaSwitch:
        def _set(e: Engine, v: bool) -> None:
            a = e.appliance(key)
            a.power = v
            if v and programs is not None:
                e.start_program(a, programs, label)
            elif not v:
                a.running = False
            e.notify(key)

        return CasaSwitch(e, key=dev[0], name="Ligar", icon=None, signal=key,
                          device=device_info(*dev), get=lambda e: e.appliance(key).power, set_=_set)

    ents += [
        _program_switch("washer", ("maquina_roupa", "Máquina de lavar roupa", "lavandaria", "Lavar 9 kg"), WASHER_PROGRAMS, "A iniciar"),
        _program_switch("dryer", ("secador", "Máquina de secar", "lavandaria", "Bomba de calor 8 kg"), DRYER_PROGRAMS, "A iniciar"),
        _program_switch("dishwasher", ("maquina_loica", "Máquina da loiça", "cozinha", "Encastre 14 serviços"), DISHWASHER_PROGRAMS, "A iniciar"),
        _program_switch("oven", ("forno", "Forno", "cozinha", "Forno pirolítico"), None, ""),
        _program_switch("cooktop", ("placa", "Placa de indução", "cozinha", "Indução 4 zonas"), None, ""),
    ]

    def _hood(e: Engine, v: bool) -> None:
        e.hood.power = v
        if v and e.hood.extra["speed"] == "Desligado":
            e.hood.extra["speed"] = "2"
        e.notify("hood")

    ents.append(CasaSwitch(e, key="exaustor", name="Ligar", icon="mdi:fan", signal="hood",
                           device=device_info("exaustor", "Exaustor", "cozinha", "Exaustor de ilha"),
                           get=lambda e: e.hood.power, set_=_hood))

    def _extra(app: str, attr: str):
        def _set(e: Engine, v: bool) -> None:
            e.appliance(app).extra[attr] = v
            e.notify(app)
        return _set

    ents += [
        CasaSwitch(e, key="forno_luz", name="Luz", icon="mdi:lightbulb", signal="oven",
                   device=device_info("forno", "Forno", "cozinha", "Forno pirolítico"),
                   get=lambda e: e.oven.extra["light"], set_=_extra("oven", "light")),
        CasaSwitch(e, key="exaustor_luz", name="Luz", icon="mdi:lightbulb", signal="hood",
                   device=device_info("exaustor", "Exaustor", "cozinha", "Exaustor de ilha"),
                   get=lambda e: e.hood.extra["light"], set_=_extra("hood", "light")),
    ]
    async_add_entities(ents)


class CasaSwitch(CasaEntity, SwitchEntity):
    def __init__(
        self,
        engine: Engine,
        *,
        key: str,
        name: str | None,
        icon: str | None,
        device,
        get: Callable[[Engine], bool],
        set_: Callable[[Engine, bool], None],
        signal: str | None = None,
        outlet: bool = False,
    ) -> None:
        super().__init__(engine, entity_id=f"switch.{key}", unique_id=f"switch_{key}", device=device, name=name,
                         signal=signal or f"switch_{key}", tick=True)
        self._get, self._set = get, set_
        if icon:
            self._attr_icon = icon
        if outlet:
            self._attr_device_class = SwitchDeviceClass.OUTLET

    @property
    def is_on(self) -> bool:
        return bool(self._get(self.engine))

    async def async_turn_on(self, **kwargs: Any) -> None:
        self._set(self.engine, True)
        self.engine.schedule_save()
        self.async_write_ha_state()

    async def async_turn_off(self, **kwargs: Any) -> None:
        self._set(self.engine, False)
        self.engine.schedule_save()
        self.async_write_ha_state()
