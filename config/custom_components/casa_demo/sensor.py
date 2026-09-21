"""Sensores: energia, ambiente, eletrodomésticos, sistema e telemóveis."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import (
    PERCENTAGE,
    UnitOfEnergy,
    UnitOfInformation,
    UnitOfPower,
    UnitOfTemperature,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import CasaDemoConfigEntry
from .avisos import AvisosSensor
from .const import CIRCUITS, DRYER_PROGRAMS, PEOPLE, ROOM_SENSORS, WASHER_PROGRAMS
from .engine import BATTERY_KWH, Engine
from .entity import CasaEntity, device_info
from .history import ENERGY_ENTITIES

M = SensorStateClass.MEASUREMENT
TI = SensorStateClass.TOTAL_INCREASING

ROOM_AREA = {r["id"]: r["area"] for r in ROOM_SENSORS}
ROOM_LABEL = {
    "sala": "Sala",
    "cozinha": "Cozinha",
    "escritorio": "Escritório",
    "suite": "Suite",
    "quarto": "Quarto",
    "wc": "Casa de banho",
}


@dataclass(frozen=True, kw_only=True)
class S:
    key: str  # object_id
    name: str | None
    device: tuple[str, str, str | None, str]  # (id, nome, área, modelo)
    value: Callable[[Engine], Any]
    dc: SensorDeviceClass | None = None
    sc: SensorStateClass | None = None
    unit: str | None = None
    precision: int | None = None
    icon: str | None = None
    options: list[str] | None = None
    signal: str | None = None
    attrs: Callable[[Engine], dict] | None = None
    full: bool = False  # nome completo (sem o prefixo do dispositivo)


def _hm(minutes: float) -> str:
    m = int(round(minutes))
    return f"{m // 60}:{m % 60:02d}"


METER = ("contador", "Contador de energia", "garagem", "Medidor trifásico")
INVERTER = ("inversor", "Inversor solar", "garagem", "Inversor híbrido 5 kW")
BATTERY = ("bateria", "Bateria da casa", "garagem", "Bateria LFP 10 kWh")
EV = ("carregador_ve", "Carregador VE", "garagem", "Wallbox 7,4 kW")
SERVER = ("servidor", "Servidor Casa", "garagem", "Mini PC")
WEATHER_ST = ("estacao", "Estação meteorológica", "jardim", "Sensor exterior")
BOILER = ("cilindro", "Cilindro", "lavandaria", "Termoacumulador 150 L")


def _descriptions() -> list[S]:
    out: list[S] = []
    names = {
        "grid_import": "Energia importada da rede",
        "grid_export": "Energia exportada para a rede",
        "solar": "Energia solar produzida",
        "battery_charge": "Energia carregada na bateria",
        "battery_discharge": "Energia descarregada da bateria",
        "home": "Energia consumida pela casa",
    }
    dev_for = {"grid_import": METER, "grid_export": METER, "solar": INVERTER, "battery_charge": BATTERY, "battery_discharge": BATTERY, "home": METER}
    for key, eid in ENERGY_ENTITIES.items():
        out.append(
            S(key=eid.split(".", 1)[1], name=names[key], device=dev_for[key], value=lambda e, k=key: round(e.energy[k], 3),
              dc=SensorDeviceClass.ENERGY, sc=TI, unit=UnitOfEnergy.KILO_WATT_HOUR, precision=2, full=True)
        )
    for c in CIRCUITS:
        cid = c["id"]
        out.append(S(key=f"energia_{cid}", name=c["name"], device=METER, icon=c["icon"], full=True,
                     value=lambda e, k=cid: round(e.circuit_energy.get(k, 0.0), 3),
                     dc=SensorDeviceClass.ENERGY, sc=TI, unit=UnitOfEnergy.KILO_WATT_HOUR, precision=2))
        out.append(S(key=f"potencia_{cid}", name=f"Potência {c['name']}", device=METER, icon=c["icon"], full=True,
                     value=lambda e, k=cid: round(e.circuit_power.get(k, 0.0)),
                     dc=SensorDeviceClass.POWER, sc=M, unit=UnitOfPower.WATT, precision=0))

    for key, name, dev in (
        ("casa", "Potência casa", METER),
        ("solar", "Potência solar", INVERTER),
        ("rede", "Potência rede", METER),
        ("bateria", "Potência bateria", BATTERY),
    ):
        src = {"casa": "home", "rede": "grid", "bateria": "battery"}.get(key, key)
        out.append(S(key=f"potencia_{key}", name=name, device=dev, full=True, value=lambda e, k=src: round(e.power.get(k, 0.0)),
                     dc=SensorDeviceClass.POWER, sc=M, unit=UnitOfPower.WATT, precision=0))

    out += [
        S(key="bateria_soc", name="Bateria carga", device=BATTERY, value=lambda e: round(e.battery_soc, 1),
          dc=SensorDeviceClass.BATTERY, sc=M, unit=PERCENTAGE, precision=0),
        S(key="bateria_energia", name="Bateria energia armazenada", device=BATTERY,
          value=lambda e: round(e.battery_soc / 100 * BATTERY_KWH, 2),
          dc=SensorDeviceClass.ENERGY_STORAGE, sc=M, unit=UnitOfEnergy.KILO_WATT_HOUR, precision=1),
        S(key="carro_bateria", name="Carro bateria", device=EV, value=lambda e: round(e.ev_soc, 1),
          dc=SensorDeviceClass.BATTERY, sc=M, unit=PERCENTAGE, precision=0, icon="mdi:car-electric", signal="ev"),
        S(key="carregador_ve_estado", name="Carregador estado", device=EV,
          value=lambda e: "A carregar" if e.power.get("ev", 0) > 0 else ("Carregado" if e.ev_soc >= e.ev_limit else "Ligado, em espera"),
          icon="mdi:ev-station", signal="ev"),
        S(key="temperatura_exterior", name="Temperatura exterior", device=WEATHER_ST, value=lambda e: round(e.outdoor_temp, 1),
          dc=SensorDeviceClass.TEMPERATURE, sc=M, unit=UnitOfTemperature.CELSIUS, precision=1),
        S(key="humidade_exterior", name="Humidade exterior", device=WEATHER_ST, value=lambda e: round(e.outdoor_hum),
          dc=SensorDeviceClass.HUMIDITY, sc=M, unit=PERCENTAGE, precision=0),
        S(key="cilindro_temperatura", name="Temperatura da água", device=BOILER, value=lambda e: round(e.boiler_temp, 1),
          dc=SensorDeviceClass.TEMPERATURE, sc=M, unit=UnitOfTemperature.CELSIUS, precision=0, icon="mdi:water-thermometer"),
    ]
    for r in ROOM_SENSORS:
        rid = r["id"]
        dev = (f"ambiente_{rid}", f"Sensor ambiente {ROOM_LABEL[rid]}", r["area"], "Sensor temperatura/humidade")
        out.append(S(key=f"temperatura_{rid}", name=f"Temperatura {ROOM_LABEL[rid]}", device=dev, full=True, value=lambda e, k=rid: round(e.room_temp[k], 1),
                     dc=SensorDeviceClass.TEMPERATURE, sc=M, unit=UnitOfTemperature.CELSIUS, precision=1))
        out.append(S(key=f"humidade_{rid}", name=f"Humidade {ROOM_LABEL[rid]}", device=dev, full=True, value=lambda e, k=rid: round(e.room_hum[k]),
                     dc=SensorDeviceClass.HUMIDITY, sc=M, unit=PERCENTAGE, precision=0))

    # Servidor (os entity_ids por omissão que o dashboard já procura)
    out += [
        S(key="processor_use", name="Utilização do processador", device=SERVER, value=lambda e: round(e.system["cpu"]),
          sc=M, unit=PERCENTAGE, icon="mdi:cpu-64-bit"),
        S(key="processor_temperature", name="Temperatura do processador", device=SERVER, value=lambda e: round(e.system["cpu_temp"], 1),
          dc=SensorDeviceClass.TEMPERATURE, sc=M, unit=UnitOfTemperature.CELSIUS, precision=0),
        S(key="memory_use_percent", name="Utilização da memória", device=SERVER, value=lambda e: round(e.system["ram"], 1),
          sc=M, unit=PERCENTAGE, icon="mdi:memory"),
        S(key="memory_free", name="Memória livre", device=SERVER, value=lambda e: round(16384 * (1 - e.system["ram"] / 100)),
          dc=SensorDeviceClass.DATA_SIZE, sc=M, unit=UnitOfInformation.MEBIBYTES, icon="mdi:memory"),
        S(key="disk_use_percent", name="Utilização do disco", device=SERVER, value=lambda e: 23.6, sc=M, unit=PERCENTAGE, icon="mdi:harddisk"),
        S(key="disk_free", name="Disco livre", device=SERVER, value=lambda e: 182.4, dc=SensorDeviceClass.DATA_SIZE, sc=M,
          unit=UnitOfInformation.GIBIBYTES, icon="mdi:harddisk"),
        S(key="last_boot", name="Último arranque", device=SERVER, value=lambda e: e.boot_time, dc=SensorDeviceClass.TIMESTAMP),
        S(key="last_backup", name="Última cópia de segurança", device=SERVER, value=lambda e: e.last_backup, dc=SensorDeviceClass.TIMESTAMP),
        S(key="next_backup", name="Próxima cópia de segurança", device=SERVER, value=lambda e: e.last_backup + timedelta(days=1),
          dc=SensorDeviceClass.TIMESTAMP),
    ]

    # Eletrodomésticos
    washer = ("maquina_roupa", "Máquina de lavar roupa", "lavandaria", "Lavar 9 kg")
    dryer = ("secador", "Máquina de secar", "lavandaria", "Bomba de calor 8 kg")
    dish = ("maquina_loica", "Máquina da loiça", "cozinha", "Encastre 14 serviços")
    oven = ("forno", "Forno", "cozinha", "Forno pirolítico")
    cooktop = ("placa", "Placa de indução", "cozinha", "Indução 4 zonas")
    hood = ("exaustor", "Exaustor", "cozinha", "Exaustor de ilha")
    out += [
        S(key="maquina_roupa_estado", name="Estado", device=washer, value=lambda e: e.washer.status, icon="mdi:washing-machine", signal="washer"),
        S(key="maquina_roupa_progresso", name="Progresso", device=washer, value=lambda e: round(e.washer.progress), unit=PERCENTAGE,
          icon="mdi:progress-clock", signal="washer"),
        S(key="maquina_roupa_tempo_restante", name="Tempo restante", device=washer, value=lambda e: _hm(e.remaining_min("washer")),
          icon="mdi:timer-outline", signal="washer"),
        S(key="maquina_roupa_centrifugacao", name="Centrifugação", device=washer,
          value=lambda e: WASHER_PROGRAMS.get(e.washer.program, {}).get("spin", 1200), unit="rpm", icon="mdi:rotate-right", signal="washer"),
        S(key="maquina_roupa_temperatura", name="Temperatura", device=washer,
          value=lambda e: WASHER_PROGRAMS.get(e.washer.program, {}).get("temp", 40), dc=SensorDeviceClass.TEMPERATURE,
          unit=UnitOfTemperature.CELSIUS, signal="washer"),
        S(key="secador_estado", name="Estado", device=dryer, value=lambda e: e.dryer.status, icon="mdi:tumble-dryer", signal="dryer"),
        S(key="secador_progresso", name="Progresso", device=dryer, value=lambda e: round(e.dryer.progress), unit=PERCENTAGE,
          icon="mdi:progress-clock", signal="dryer"),
        S(key="secador_tempo_restante", name="Tempo restante", device=dryer, value=lambda e: _hm(e.remaining_min("dryer")),
          icon="mdi:timer-outline", signal="dryer"),
        S(key="maquina_loica_estado", name="Estado", device=dish, value=lambda e: e.dishwasher.status, icon="mdi:dishwasher", signal="dishwasher"),
        S(key="maquina_loica_progresso", name="Progresso", device=dish, value=lambda e: round(e.dishwasher.progress), unit=PERCENTAGE,
          icon="mdi:progress-clock", signal="dishwasher"),
        S(key="maquina_loica_fim", name="Fim do programa", device=dish,
          value=lambda e: (dt_util.now() + timedelta(minutes=e.remaining_min("dishwasher"))) if e.dishwasher.running else None,
          dc=SensorDeviceClass.TIMESTAMP, signal="dishwasher"),
        S(key="maquina_loica_sal", name="Sal", device=dish, value=lambda e: "off", dc=SensorDeviceClass.ENUM,
          options=["present", "confirmed", "off"], icon="mdi:shaker-outline"),
        S(key="maquina_loica_abrilhantador", name="Abrilhantador", device=dish, value=lambda e: "present", dc=SensorDeviceClass.ENUM,
          options=["present", "confirmed", "off"], icon="mdi:water-alert"),
        S(key="forno_estado", name="Estado", device=oven, value=lambda e: e.oven.status, icon="mdi:stove", signal="oven"),
        S(key="forno_temperatura", name="Temperatura", device=oven, value=lambda e: round(e.oven.extra["temp"]),
          dc=SensorDeviceClass.TEMPERATURE, sc=M, unit=UnitOfTemperature.CELSIUS, signal="oven"),
        S(key="forno_porta", name="Porta", device=oven, value=lambda e: "open" if e.oven.extra["door"] else "closed",
          dc=SensorDeviceClass.ENUM, options=["open", "closed", "locked"], icon="mdi:door", signal="oven"),
        S(key="placa_estado", name="Estado", device=cooktop, value=lambda e: e.cooktop.status, icon="mdi:stove", signal="cooktop"),
        S(key="exaustor_estado", name="Estado", device=hood, value=lambda e: e.hood.status, icon="mdi:fan", signal="hood"),
    ]

    # Aspirador
    robo = ("robo", "Robô aspirador", "sala", "Robô com mapeamento LiDAR")
    out += [
        S(key="robo_estado", name="Estado", device=robo, value=lambda e: e.vacuum["activity"], icon="mdi:robot-vacuum", signal="vacuum"),
        S(key="robo_bateria", name="Bateria", device=robo, value=lambda e: round(e.vacuum["battery"]), dc=SensorDeviceClass.BATTERY,
          sc=M, unit=PERCENTAGE, signal="vacuum"),
        S(key="robo_area", name="Área limpa", device=robo, value=lambda e: round(e.vacuum["area"], 1), unit="m²",
          icon="mdi:texture-box", signal="vacuum"),
    ]

    # Telemóveis
    for p in PEOPLE:
        dev = (f"telemovel_{p['id']}", f"Telemóvel {p['name']}", None, "Smartphone")
        out.append(S(key=f"{p['id']}_telemovel_bateria", name="Bateria", device=dev,
                     value=lambda e, b=p["battery"]: _phone_battery(b), dc=SensorDeviceClass.BATTERY, sc=M, unit=PERCENTAGE))
    return out


def _phone_battery(base: int) -> int:
    now = dt_util.now()
    h = now.hour + now.minute / 60
    # descarrega de dia, carrega de noite
    if h < 7:
        return min(100, base + 30 + int(h * 3))
    return max(8, min(100, base + 30 + 21 - int((h - 7) * 4.2)))


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    engine = entry.runtime_data
    async_add_entities([*(CasaSensor(engine, d) for d in _descriptions()), AvisosSensor(engine, entry.entry_id)])


class CasaSensor(CasaEntity, SensorEntity):
    def __init__(self, engine: Engine, d: S) -> None:
        dev_id, dev_name, area, model = d.device
        super().__init__(
            engine,
            entity_id=f"sensor.{d.key}",
            unique_id=f"sensor_{d.key}",
            device=device_info(dev_id, dev_name, area, model),
            name=d.name,
            signal=d.signal,
            tick=True,
        )
        self._d = d
        self._attr_has_entity_name = not d.full
        self._attr_device_class = d.dc
        self._attr_state_class = d.sc
        self._attr_native_unit_of_measurement = d.unit
        self._attr_suggested_display_precision = d.precision
        self._attr_options = d.options
        if d.icon:
            self._attr_icon = d.icon

    @property
    def native_value(self) -> Any:
        v = self._d.value(self.engine)
        if isinstance(v, datetime) and v.tzinfo is None:
            v = v.replace(tzinfo=dt_util.get_default_time_zone())
        return v
