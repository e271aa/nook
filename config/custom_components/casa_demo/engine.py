"""Motor de simulação da casa.

Todo o estado vive aqui (não nas entidades). As entidades são "vistas" que leem
do motor e mandam comandos para ele. Isto permite a física cruzada: o AC mexe na
temperatura da divisão, os eletrodomésticos mexem no consumo, o solar depende do
sol e do tempo, a bateria equilibra tudo, etc.
"""

from __future__ import annotations

import logging
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from astral import Observer
from astral.sun import elevation as sun_elevation_deg

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    CLIMATES,
    COVERS,
    DISHWASHER_PROGRAMS,
    DOMAIN,
    DRYER_PROGRAMS,
    GARAGE,
    HOOD_SPEEDS,
    LIGHTS,
    OVEN_PROGRAMS,
    PEOPLE,
    PLUGS,
    ROOM_SENSORS,
    SIGNAL_DEVICE,
    SIGNAL_AVISOS,
    SIGNAL_TICK,
    SIM_SPEED,
    WASHER_PROGRAMS,
    WEATHER_OPTIONS,
)

_LOGGER = logging.getLogger(__name__)

STORE_VERSION = 1
TICK = timedelta(seconds=1)
# Os contadores de energia guardam-se de 10 em 10 minutos (em tiques): cada
# gravação é uma escrita no disco, e de minuto a minuto era a maior da demo.
GUARDAR_A_CADA = 600
SLOW_EVERY = 5  # sensores de energia/ambiente a cada 5 ticks

SOLAR_KWP = 5.4
BATTERY_KWH = 10.0
BATTERY_MAX_W = 5000.0
BATTERY_RESERVE = 0.10
EV_BATTERY_KWH = 60.0
EV_CHARGER_W = 7400.0


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# ───────────── Estado de cada tipo de dispositivo ─────────────


@dataclass
class LightState:
    on: bool
    brightness: int = 255
    color_temp: int = 3000
    rgb: tuple[int, int, int] = (255, 180, 110)
    effect: str | None = None


@dataclass
class CoverState:
    position: float
    target: float
    travel: float  # s de 0 a 100
    last_dir: int = 0  # +1 a abrir, -1 a fechar, 0 parado


@dataclass
class ClimateState:
    mode: str
    target: float
    fan: str = "auto"
    action: str = "off"
    power: float = 0.0


@dataclass
class ApplianceState:
    power: bool = False
    program: str = ""
    running: bool = False
    started: datetime | None = None
    duration_min: float = 0.0  # minutos simulados
    progress: float = 0.0  # 0..100
    status: str = "Desligado"
    watts: float = 0.0
    extra: dict[str, Any] = field(default_factory=dict)


# ───────────── Motor ─────────────


class Engine:
    """Estado e física da casa simulada."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, f"{DOMAIN}.state")
        self._unsub = None
        self._tick_n = 0
        self._last_tick = dt_util.utcnow()
        self.boot_time = dt_util.utcnow()
        self.rng = random.Random()

        self.weather_mode = WEATHER_OPTIONS[0]
        self.lights: dict[str, LightState] = {}
        self.covers: dict[str, CoverState] = {}
        self.climates: dict[str, ClimateState] = {}
        self.room_temp: dict[str, float] = {}
        self.room_hum: dict[str, float] = {}
        self.plugs: dict[str, bool] = {}
        self.motion: dict[str, datetime | None] = {}
        self.contacts: dict[str, bool] = {}
        # desde quando cada contacto está como está — é o que permite dizer
        # "a porta está aberta há 6 minutos" em vez de só "está aberta"
        self.contact_since: dict[str, datetime] = {}
        self.smoke = False
        self.leak = False
        self.lock_locked = True
        self.people_override: dict[str, bool | None] = {p["id"]: None for p in PEOPLE}

        self.garage = CoverState(position=0, target=0, travel=GARAGE["travel"])

        # Eletrodomésticos
        self.washer = ApplianceState(program="Algodão 40°")
        self.dryer = ApplianceState(program="Algodão armário")
        self.dishwasher = ApplianceState(program="Eco 50°")
        self.oven = ApplianceState(program="Ar forçado", extra={"temp": 21.0, "light": False, "door": False})
        self.cooktop = ApplianceState(extra={"child_lock": True})
        self.hood = ApplianceState(extra={"speed": "Desligado", "light": False})
        self.vacuum = {
            "activity": "docked",
            "battery": 100.0,
            "area": 0.0,
            "fan": "Normal",
            "started": None,
        }

        # TV da sala
        self.tv = {"on": True, "paused": False, "source": "TV", "volume": 0.24, "muted": False}

        # Águas quentes, VE, frigorífico
        self.boiler_on = True
        self.boiler_temp = 52.0
        self.boiler_heating = False
        self.ev_enabled = False
        self.ev_soc = 64.0
        self.ev_limit = 80.0
        self.ev_plugged = True
        self.fridge_phase = 0.0

        # Energia (W) e contadores (kWh)
        self.power: dict[str, float] = {}
        self.circuit_power: dict[str, float] = {}
        self.energy: dict[str, float] = {
            "grid_import": 0.0,
            "grid_export": 0.0,
            "solar": 0.0,
            "battery_charge": 0.0,
            "battery_discharge": 0.0,
            "home": 0.0,
        }
        self.circuit_energy: dict[str, float] = {}
        self.battery_soc = 62.0
        self.outdoor_temp = 20.0
        self.outdoor_hum = 60.0
        self.cloud = 0.0
        self.condition = "sunny"
        self.system = {"cpu": 6.0, "cpu_temp": 46.0, "ram": 41.0}
        self.last_backup = dt_util.now().replace(hour=3, minute=12, second=0, microsecond=0)
        if self.last_backup > dt_util.now():
            self.last_backup -= timedelta(days=1)

        self._init_defaults()

    # ───────── Inicialização / persistência ─────────

    def _init_defaults(self) -> None:
        for d in LIGHTS:
            self.lights[d["id"]] = LightState(
                on=d.get("on", False),
                brightness=d.get("bri", 255),
                rgb=d.get("rgb", (255, 180, 110)),
            )
        for d in COVERS:
            self.covers[d["id"]] = CoverState(position=d["pos"], target=d["pos"], travel=d["travel"])
        for d in CLIMATES:
            self.climates[d["id"]] = ClimateState(mode=d["mode"], target=d["target"])
        for d in ROOM_SENSORS:
            self.room_temp[d["id"]] = d["temp"]
            self.room_hum[d["id"]] = d["hum"]
        for d in PLUGS:
            self.plugs[d["id"]] = d.get("on", False)
        self.contacts = {"porta_entrada": False, "janela_cozinha": True, "janela_suite": False}
        self.contact_since = {k: dt_util.utcnow() for k in self.contacts}

    async def async_load(self) -> bool:
        """Carrega o estado guardado. Devolve False se é o primeiro arranque."""
        data = await self._store.async_load()
        if not data:
            return False
        try:
            self.energy.update(data.get("energy", {}))
            self.circuit_energy.update(data.get("circuit_energy", {}))
            self.battery_soc = data.get("battery_soc", self.battery_soc)
            self.ev_soc = data.get("ev_soc", self.ev_soc)
            self.boiler_temp = data.get("boiler_temp", self.boiler_temp)
            self.weather_mode = data.get("weather_mode", self.weather_mode)
            for k, v in data.get("lights", {}).items():
                if k in self.lights:
                    self.lights[k] = LightState(on=v["on"], brightness=v["brightness"], color_temp=v["color_temp"], rgb=tuple(v["rgb"]))
            for k, v in data.get("covers", {}).items():
                if k in self.covers:
                    self.covers[k].position = self.covers[k].target = v
            for k, v in data.get("climates", {}).items():
                if k in self.climates:
                    self.climates[k].mode = v["mode"]
                    self.climates[k].target = v["target"]
                    self.climates[k].fan = v.get("fan", "auto")
            self.room_temp.update(data.get("room_temp", {}))
            self.plugs.update({k: v for k, v in data.get("plugs", {}).items() if k in self.plugs})
            self.garage.position = self.garage.target = data.get("garage", 0)
            self.tv.update(data.get("tv", {}))
        except (KeyError, TypeError, ValueError):
            _LOGGER.warning("Estado guardado inválido; a usar valores por omissão")
        return True

    def _serialize(self) -> dict[str, Any]:
        return {
            "energy": self.energy,
            "circuit_energy": self.circuit_energy,
            "battery_soc": self.battery_soc,
            "ev_soc": self.ev_soc,
            "boiler_temp": self.boiler_temp,
            "weather_mode": self.weather_mode,
            "lights": {
                k: {"on": v.on, "brightness": v.brightness, "color_temp": v.color_temp, "rgb": list(v.rgb)}
                for k, v in self.lights.items()
            },
            "covers": {k: round(v.target) for k, v in self.covers.items()},
            "climates": {k: {"mode": v.mode, "target": v.target, "fan": v.fan} for k, v in self.climates.items()},
            "room_temp": self.room_temp,
            "plugs": self.plugs,
            "garage": round(self.garage.target),
            "tv": self.tv,
        }

    @callback
    def schedule_save(self) -> None:
        # Guardar é o gesto comum a tudo o que muda por ordem de alguém — uma
        # luz, um estore, o ar. É daqui que os avisos ficam a saber.
        self._store.async_delay_save(self._serialize, 30)
        async_dispatcher_send(self.hass, SIGNAL_AVISOS)

    async def async_save_now(self) -> None:
        await self._store.async_save(self._serialize())

    def reset_devices(self) -> None:
        """Repõe os dispositivos (não os contadores de energia) no estado inicial."""
        energy, circuit, soc, ev = dict(self.energy), dict(self.circuit_energy), self.battery_soc, self.ev_soc
        self.weather_mode = WEATHER_OPTIONS[0]
        self.lock_locked = True
        self.smoke = False
        self.leak = False
        self.garage = CoverState(position=0, target=0, travel=GARAGE["travel"])
        for a in (self.washer, self.dryer, self.dishwasher):
            a.power = a.running = False
            a.progress = 0
        self.oven.power = self.cooktop.power = self.hood.power = False
        self.hood.extra["speed"] = "Desligado"
        self.vacuum.update(activity="docked", area=0.0, started=None)
        self.tv.update(on=True, paused=False, source="TV", volume=0.24, muted=False)
        self._init_defaults()
        self.energy, self.circuit_energy, self.battery_soc, self.ev_soc = energy, circuit, soc, ev
        self.notify_all()
        self.schedule_save()

    # ───────── Ciclo ─────────

    def start(self) -> None:
        self._update_environment(dt_util.now())
        self._update_power(0)
        self._unsub = async_track_time_interval(self.hass, self._async_tick, TICK, name="casa_demo tick")

    def stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None

    @callback
    def notify(self, key: str) -> None:
        async_dispatcher_send(self.hass, SIGNAL_DEVICE.format(key))
        # os avisos ouvem tudo: uma janela que abre tem de se ver já, não
        # daqui a cinco segundos
        async_dispatcher_send(self.hass, SIGNAL_AVISOS)

    @callback
    def notify_all(self) -> None:
        async_dispatcher_send(self.hass, SIGNAL_DEVICE.format("*"))
        async_dispatcher_send(self.hass, SIGNAL_TICK)
        async_dispatcher_send(self.hass, SIGNAL_AVISOS)

    @callback
    def _async_tick(self, now: datetime) -> None:
        utc = dt_util.utcnow()
        dt_s = _clamp((utc - self._last_tick).total_seconds(), 0.0, 30.0)
        self._last_tick = utc
        self._tick_n += 1
        local = dt_util.now()

        self._move_covers(dt_s)
        self._run_appliances(dt_s)
        self._run_vacuum(dt_s)

        if self._tick_n % SLOW_EVERY == 0:
            self._update_environment(local)
            self._update_rooms(SLOW_EVERY)
            self._update_misc(local, SLOW_EVERY)
            self._update_power(SLOW_EVERY)
            async_dispatcher_send(self.hass, SIGNAL_TICK)

    # ───────── Estores / portão ─────────

    def _move_covers(self, dt_s: float) -> None:
        for key, c in list(self.covers.items()) + [("__garage__", self.garage)]:
            if abs(c.position - c.target) < 0.01:
                if c.last_dir:
                    c.last_dir = 0
                    c.position = c.target
                    self.notify("garage" if key == "__garage__" else f"cover_{key}")
                    self.schedule_save()
                continue
            step = 100.0 / c.travel * dt_s
            if c.target > c.position:
                c.position = min(c.target, c.position + step)
                c.last_dir = 1
            else:
                c.position = max(c.target, c.position - step)
                c.last_dir = -1
            self.notify("garage" if key == "__garage__" else f"cover_{key}")

    def set_cover_target(self, key: str, target: float) -> None:
        c = self.garage if key == "__garage__" else self.covers[key]
        c.target = _clamp(float(target), 0, 100)
        if abs(c.target - c.position) >= 0.01:
            c.last_dir = 1 if c.target > c.position else -1
        self.notify("garage" if key == "__garage__" else f"cover_{key}")

    def stop_cover(self, key: str) -> None:
        c = self.garage if key == "__garage__" else self.covers[key]
        c.target = round(c.position)
        c.position = c.target
        c.last_dir = 0
        self.notify("garage" if key == "__garage__" else f"cover_{key}")
        self.schedule_save()

    def set_contact(self, cid: str, aberto: bool, *, desde: datetime | None = None) -> None:
        """Abre ou fecha um contacto e guarda desde quando."""
        if cid not in self.contacts:
            return
        mudou = self.contacts[cid] != aberto
        self.contacts[cid] = aberto
        if mudou or desde:
            self.contact_since[cid] = desde or dt_util.utcnow()
        self.notify(f"contact_{cid}")
        self.schedule_save()

    def set_hazard(self, qual: str, ativo: bool) -> None:
        """Fumo ou água: o que a casa só sabe quando corre mal."""
        if qual == "fumo":
            self.smoke = ativo
            self.notify("smoke")
        elif qual == "agua":
            self.leak = ativo
            self.notify("leak")

    # ───────── Eletrodomésticos ─────────

    def start_program(self, appliance: ApplianceState, programs: dict[str, dict], label: str) -> None:
        prog = programs.get(appliance.program) or next(iter(programs.values()))
        appliance.running = True
        appliance.started = dt_util.utcnow()
        appliance.duration_min = prog["min"]
        appliance.progress = 0.0
        appliance.status = label

    def _run_appliances(self, dt_s: float) -> None:
        sim_min = dt_s / 60.0 * SIM_SPEED
        for key, app, progs in (
            ("washer", self.washer, WASHER_PROGRAMS),
            ("dryer", self.dryer, DRYER_PROGRAMS),
            ("dishwasher", self.dishwasher, DISHWASHER_PROGRAMS),
        ):
            if not app.power:
                if app.running or app.status != "Desligado":
                    app.running = False
                    app.progress = 0
                    app.status = "Desligado"
                    app.watts = 0
                    self.notify(key)
                continue
            if not app.running:
                if app.status not in ("Concluído", "Pronto"):
                    app.status = "Pronto"
                    self.notify(key)
                app.watts = 2.0
                continue
            prev = int(app.progress)
            app.progress = min(100.0, app.progress + sim_min / app.duration_min * 100.0)
            p = app.progress
            if key == "washer":
                if p < 18:
                    app.status, app.watts = "A aquecer", 1950 + self.rng.uniform(-60, 60)
                elif p < 70:
                    app.status, app.watts = "A lavar", 180 + self.rng.uniform(-40, 60)
                elif p < 88:
                    app.status, app.watts = "A enxaguar", 120 + self.rng.uniform(-20, 30)
                else:
                    app.status, app.watts = "A centrifugar", 420 + self.rng.uniform(-50, 80)
            elif key == "dryer":
                if p < 85:
                    app.status, app.watts = "A secar", 2150 + self.rng.uniform(-80, 60)
                else:
                    app.status, app.watts = "A arrefecer", 260
            else:
                if p < 12:
                    app.status, app.watts = "Pré-lavagem", 90
                elif p < 35:
                    app.status, app.watts = "A lavar", 1850 + self.rng.uniform(-60, 60)
                elif p < 70:
                    app.status, app.watts = "A lavar", 110
                elif p < 85:
                    app.status, app.watts = "A enxaguar", 1700
                else:
                    app.status, app.watts = "A secar", 60
            if app.progress >= 100:
                app.running = False
                app.status = "Concluído"
                app.watts = 2.0
                self.hass.bus.async_fire(f"{DOMAIN}_programa_concluido", {"aparelho": key})
                self.notify(key)
            elif int(app.progress) != prev:
                self.notify(key)

        # Forno: aquece até à temperatura do programa e depois mantém
        o = self.oven
        prog_t = OVEN_PROGRAMS.get(o.program, {"temp": 180})["temp"]
        t = o.extra["temp"]
        if o.power:
            if t < prog_t - 2:
                t += 0.9 * dt_s * (1 + (prog_t - t) / 120)
                o.status, o.watts = "A pré-aquecer", 2400
            else:
                t = prog_t + math.sin(self._tick_n / 20) * 2
                o.status, o.watts = "Temperatura atingida", 900 + self.rng.uniform(-300, 300)
        else:
            t += (21.0 - t) * 0.004 * dt_s
            o.status = "Desligado" if t < 40 else "A arrefecer"
            o.watts = 0
        o.extra["temp"] = t
        if self._tick_n % 3 == 0:
            self.notify("oven")

        c = self.cooktop
        c.status = "Em uso" if c.power else "Desligado"
        c.watts = (1650 + 350 * math.sin(self._tick_n / 7)) if c.power else 0

        h = self.hood
        speed = h.extra["speed"] if h.power else "Desligado"
        h.status = "Desligado" if speed == "Desligado" else f"Velocidade {speed}"
        h.watts = {"Desligado": 0, "1": 45, "2": 75, "3": 115, "Boost": 190}[speed] + (8 if h.extra["light"] else 0)

    # ───────── Aspirador ─────────

    def _run_vacuum(self, dt_s: float) -> None:
        v = self.vacuum
        changed = False
        if v["activity"] == "cleaning":
            v["area"] += 0.28 * dt_s
            v["battery"] = max(0.0, v["battery"] - 0.045 * dt_s)
            changed = True
            if v["area"] >= 86 or v["battery"] < 15:
                v["activity"] = "returning"
                v["started"] = dt_util.utcnow()
        elif v["activity"] == "returning":
            if (dt_util.utcnow() - v["started"]).total_seconds() > 20:
                v["activity"] = "docked"
            changed = True
        elif v["activity"] == "docked" and v["battery"] < 100:
            v["battery"] = min(100.0, v["battery"] + 0.06 * dt_s)
            changed = self._tick_n % 5 == 0
        if changed:
            self.notify("vacuum")

    # ───────── Ambiente ─────────

    def auto_condition(self, when: datetime) -> tuple[str, float]:
        """Tempo "automático" determinístico por dia (maioritariamente sol)."""
        day_seed = int(when.strftime("%Y%j"))
        r = random.Random(day_seed).random()
        hour_wave = math.sin((when.hour + when.minute / 60) / 24 * math.tau * 2 + day_seed) * 0.12
        if when.month in (6, 7, 8, 9):
            base = 0.08 if r < 0.8 else 0.55
        else:
            base = 0.15 if r < 0.45 else (0.6 if r < 0.8 else 0.9)
        cloud = _clamp(base + hour_wave, 0, 1)
        if cloud > 0.82:
            return "rainy", cloud
        if cloud > 0.45:
            return "cloudy", cloud
        if cloud > 0.25:
            return "partlycloudy", cloud
        return "sunny", cloud

    def sun_elevation(self) -> float:
        """Elevação do sol agora, calculada com o astral.

        Não usamos o atributo do sun.sun porque só é atualizado de tempos a
        tempos (e fica desatualizado se a máquina suspender).
        """
        try:
            return sun_elevation_deg(
                Observer(latitude=self.hass.config.latitude, longitude=self.hass.config.longitude),
                dt_util.utcnow(),
            )
        except (ValueError, TypeError):
            sun = self.hass.states.get("sun.sun")
            if sun and sun.attributes.get("elevation") is not None:
                return float(sun.attributes["elevation"])
            now = dt_util.now()
            h = now.hour + now.minute / 60
            return 55 * math.sin((h - 7) / 13.5 * math.pi) if 7 <= h <= 20.5 else -10

    def _update_environment(self, now: datetime) -> None:
        mode = self.weather_mode
        if mode == "Céu limpo":
            cond, cloud = "sunny", 0.03
        elif mode == "Nublado":
            cond, cloud = "cloudy", 0.7
        elif mode == "Chuva":
            cond, cloud = "rainy", 0.95
        else:
            cond, cloud = self.auto_condition(now)
        if cond == "sunny" and self.sun_elevation() < -0.8:
            cond = "clear-night"
        self.condition, self.cloud = cond, cloud

        h = now.hour + now.minute / 60
        seasonal = 16.5 - 6.5 * math.cos((now.timetuple().tm_yday - 20) / 365 * math.tau)
        daily = 5.5 * math.sin((h - 9) / 24 * math.tau)
        self.outdoor_temp = seasonal + daily * (1 - 0.6 * cloud) - 2.5 * (cloud > 0.8)
        self.outdoor_hum = _clamp(62 - daily * 3.2 + cloud * 25, 30, 98)

    def _update_rooms(self, dt_s: float) -> None:
        climate_by_room = {c["id"]: c["id"] for c in CLIMATES}
        for room in self.room_temp:
            t = self.room_temp[room]
            passive = 21.8 + (self.outdoor_temp - 18) * 0.28
            if room == "wc" and self.plugs.get("wc_toalheiro"):
                passive += 2.5
            if room == "cozinha" and (self.oven.power or self.cooktop.power):
                passive += 3.0
            t += (passive - t) * 0.0015 * dt_s
            cl = self.climates.get(climate_by_room.get(room, ""))
            if cl:
                cl.action, cl.power = "off", 0.0
                if cl.mode != "off":
                    diff = cl.target - t
                    heat = cl.mode == "heat" or (cl.mode in ("heat_cool", "auto") and diff > 0.3)
                    cool = cl.mode == "cool" or (cl.mode in ("heat_cool", "auto") and diff < -0.3)
                    if cl.mode == "fan_only":
                        cl.action, cl.power = "fan", 55.0
                    elif heat and diff > 0.15:
                        cl.action = "heating"
                        cl.power = _clamp(350 + 520 * diff, 350, 1900)
                        t += min(diff, 0.02 * dt_s / 5)
                    elif cool and diff < -0.15:
                        cl.action = "cooling"
                        cl.power = _clamp(350 + 520 * -diff, 350, 1900)
                        t += max(diff, -0.02 * dt_s / 5)
                    elif cl.mode == "dry":
                        cl.action, cl.power = "drying", 300.0
                    else:
                        cl.action, cl.power = "idle", 45.0
            self.room_temp[room] = t + self.rng.uniform(-0.01, 0.01)
            base_h = 50 + (self.outdoor_hum - 60) * 0.25 + (12 if room == "wc" else 0) + (5 if room == "cozinha" else 0)
            h = self.room_hum[room]
            if cl and cl.action in ("cooling", "drying"):
                base_h -= 8
            self.room_hum[room] = _clamp(h + (base_h - h) * 0.01 * dt_s + self.rng.uniform(-0.05, 0.05), 25, 95)

    def _update_misc(self, now: datetime, dt_s: float) -> None:
        # Movimento: pulsos aleatórios, mais prováveis de dia. Dentro de casa só
        # há movimento com gente em casa; com a casa vazia a entrada ainda vê,
        # raramente, alguém à porta (uma entrega) — e lá fora há gatos.
        alguem = any(self.person_home(p["id"]) for p in PEOPLE)
        for m in ("sala", "entrada", "garagem", "jardim"):
            last = self.motion.get(m)
            p = {"sala": 0.03, "entrada": 0.012, "garagem": 0.006, "jardim": 0.01}[m]
            if not alguem:
                p = {"sala": 0.0, "entrada": 0.0015}.get(m, p)
            if not (7 <= now.hour <= 23):
                p /= 6
            if last is None or (dt_util.utcnow() - last).total_seconds() > 45:
                if self.rng.random() < p:
                    self.motion[m] = dt_util.utcnow()
                    self.notify(f"motion_{m}")
                elif last is not None:
                    self.motion[m] = None
                    self.notify(f"motion_{m}")

        # Cilindro com termóstato (histerese 48–58 °C) e consumo de água quente
        loss = 0.0009 * dt_s * (self.boiler_temp - 20) / 30
        if now.hour in (7, 8, 21, 22) and self.rng.random() < 0.2:
            loss += 0.35
        self.boiler_temp -= loss
        if self.boiler_on and (self.boiler_temp < 48 or (self.boiler_heating and self.boiler_temp < 58)):
            self.boiler_heating = True
            self.boiler_temp += 0.02 * dt_s
        else:
            self.boiler_heating = False

        # Carro elétrico
        if self.ev_enabled and self.ev_plugged and self.ev_soc < self.ev_limit:
            self.ev_soc += EV_CHARGER_W / 1000 * dt_s / 3600 / EV_BATTERY_KWH * 100
        elif self.ev_enabled and self.ev_soc >= self.ev_limit:
            self.ev_enabled = False
            self.notify("ev")

        # Frigorífico (ciclo de compressor ~30 min)
        self.fridge_phase = (self.fridge_phase + dt_s / 1800) % 1

        # "Servidor"
        s = self.system
        busy = sum(1 for a in (self.washer, self.dryer, self.dishwasher) if a.running)
        s["cpu"] = _clamp(s["cpu"] + self.rng.uniform(-2.5, 2.5) + (4 - s["cpu"]) * 0.15 + busy, 2, 38)
        s["cpu_temp"] = _clamp(41 + s["cpu"] * 0.45 + self.rng.uniform(-0.4, 0.4), 38, 70)
        s["ram"] = _clamp(s["ram"] + self.rng.uniform(-0.3, 0.3) + (41 - s["ram"]) * 0.05, 30, 70)

    # ───────── Energia ─────────

    def light_watts(self, key: str) -> float:
        cfg = next(d for d in LIGHTS if d["id"] == key)
        st = self.lights[key]
        if not st.on:
            return 0.4 if cfg["mode"] != "onoff" else 0.0
        if cfg["mode"] == "onoff":
            return float(cfg["watts"])
        return cfg["watts"] * (0.12 + 0.88 * st.brightness / 255)

    def plug_watts(self, key: str) -> float:
        cfg = next(d for d in PLUGS if d["id"] == key)
        if not self.plugs[key]:
            return 0.6
        return cfg["watts"] * (1 + self.rng.uniform(-0.04, 0.04))

    def solar_watts(self) -> float:
        elev = self.sun_elevation()
        if elev <= 0:
            return 0.0
        clear = SOLAR_KWP * 1000 * math.sin(math.radians(elev)) ** 1.15 * 0.86
        return max(0.0, clear * (1 - 0.82 * self.cloud) * (1 + self.rng.uniform(-0.02, 0.02)))

    def _update_power(self, dt_s: float) -> None:
        circ = {c: 0.0 for c in ("iluminacao", "climatizacao", "cozinha", "lavandaria", "aguas_quentes", "carregador_ve", "outros")}
        per: dict[str, float] = {}

        for key in self.lights:
            per[f"light_{key}"] = self.light_watts(key)
            circ["iluminacao"] += per[f"light_{key}"]
        for d in PLUGS:
            per[f"plug_{d['id']}"] = self.plug_watts(d["id"])
            circ[d["circuit"]] += per[f"plug_{d['id']}"]
        for key, cl in self.climates.items():
            per[f"climate_{key}"] = cl.power
            circ["climatizacao"] += cl.power
        fridge = 110.0 if self.fridge_phase < 0.4 else 3.0
        per["frigorifico"] = fridge
        for key, app in (("washer", self.washer), ("dryer", self.dryer)):
            per[key] = app.watts
            circ["lavandaria"] += app.watts
        for key, app in (("dishwasher", self.dishwasher), ("oven", self.oven), ("cooktop", self.cooktop), ("hood", self.hood)):
            per[key] = app.watts
            circ["cozinha"] += app.watts
        circ["cozinha"] += fridge
        per["boiler"] = 1800.0 if self.boiler_heating else 0.0
        circ["aguas_quentes"] += per["boiler"]
        ev = EV_CHARGER_W * (1 + self.rng.uniform(-0.01, 0.01)) if self.ev_enabled and self.ev_soc < self.ev_limit else 0.0
        per["ev"] = ev
        circ["carregador_ve"] += ev
        per["vacuum"] = 28.0 if self.vacuum["activity"] == "docked" and self.vacuum["battery"] < 100 else 2.0
        standby = 72 + self.rng.uniform(-6, 12)
        circ["outros"] += standby + per["vacuum"] + 12  # router, câmaras, hub

        load = sum(circ.values())
        solar = self.solar_watts()

        net = load - solar
        e_bat = self.battery_soc / 100 * BATTERY_KWH
        h = dt_s / 3600 if dt_s else 0
        charge = discharge = grid_in = grid_out = 0.0
        if net < 0:
            room_w = (BATTERY_KWH - e_bat) / h * 1000 if h else BATTERY_MAX_W
            charge = min(-net, BATTERY_MAX_W, room_w)
            grid_out = -net - charge
        else:
            avail_w = (e_bat - BATTERY_RESERVE * BATTERY_KWH) / h * 1000 if h else BATTERY_MAX_W
            # Não descarrega a bateria para o carro
            discharge = max(0.0, min(net - ev, BATTERY_MAX_W, avail_w))
            grid_in = net - discharge

        if h:
            self.battery_soc = _clamp(
                self.battery_soc + (charge * 0.95 - discharge) / 1000 * h / BATTERY_KWH * 100, 0, 100
            )
            self.energy["grid_import"] += grid_in / 1000 * h
            self.energy["grid_export"] += grid_out / 1000 * h
            self.energy["solar"] += solar / 1000 * h
            self.energy["battery_charge"] += charge / 1000 * h
            self.energy["battery_discharge"] += discharge / 1000 * h
            self.energy["home"] += load / 1000 * h
            for c, w in circ.items():
                self.circuit_energy[c] = self.circuit_energy.get(c, 0.0) + w / 1000 * h
            if self._tick_n % GUARDAR_A_CADA == 0:
                self.schedule_save()

        self.power = {
            "home": load,
            "solar": solar,
            "grid": grid_in - grid_out,
            "battery": charge - discharge,  # + a carregar
            **per,
        }
        self.circuit_power = circ

    # ───────── Pessoas ─────────

    def person_home(self, pid: str, now: datetime | None = None) -> bool:
        if (o := self.people_override.get(pid)) is not None:
            return o
        now = now or dt_util.now()
        cfg = next(p for p in PEOPLE if p["id"] == pid)
        if now.weekday() >= 5:
            return not (pid == "ana" and 10.5 <= now.hour + now.minute / 60 <= 12.5)
        start, end = cfg["away"]
        h = now.hour + now.minute / 60
        return not (start <= h < end)

    # ───────── Helpers para entidades ─────────

    def appliance(self, key: str) -> ApplianceState:
        return {
            "washer": self.washer,
            "dryer": self.dryer,
            "dishwasher": self.dishwasher,
            "oven": self.oven,
            "cooktop": self.cooktop,
            "hood": self.hood,
        }[key]

    def remaining_min(self, key: str) -> float:
        a = self.appliance(key)
        if not a.running:
            return 0.0
        return max(0.0, a.duration_min * (1 - a.progress / 100))

    def finish_time(self, key: str) -> datetime | None:
        rem = self.remaining_min(key)
        if not rem:
            return None
        return dt_util.now() + timedelta(minutes=rem / SIM_SPEED)


HOOD_SPEED_OPTIONS = HOOD_SPEEDS
