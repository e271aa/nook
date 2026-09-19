"""Gera 30 dias de histórico (estatísticas horárias) para a demo não nascer vazia.

Corre uma única vez, no primeiro arranque. Usa um modelo horário simplificado do
mesmo motor (solar pelo sol real, perfis de consumo por hora/dia da semana,
bateria) e importa as estatísticas no recorder. No fim devolve os contadores
acumulados, para os sensores continuarem exatamente onde o histórico acaba.
"""

from __future__ import annotations

import logging
import math
import random
from datetime import datetime, timedelta

from astral import Observer
from astral.sun import elevation as sun_elevation

from homeassistant.components.recorder.models import StatisticMeanType
from homeassistant.components.recorder.statistics import async_import_statistics
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .const import CIRCUITS, ROOM_SENSORS
from .engine import BATTERY_KWH, BATTERY_RESERVE, SOLAR_KWP, Engine

_LOGGER = logging.getLogger(__name__)

DAYS = 30


def _sum_meta(entity_id: str, unit_class: str, unit: str) -> dict:
    return {
        "mean_type": StatisticMeanType.NONE,
        "has_sum": True,
        "name": None,
        "source": "recorder",
        "statistic_id": entity_id,
        "unit_class": unit_class,
        "unit_of_measurement": unit,
    }


def _mean_meta(entity_id: str, unit_class: str | None, unit: str) -> dict:
    return {
        "mean_type": StatisticMeanType.ARITHMETIC,
        "has_sum": False,
        "name": None,
        "source": "recorder",
        "statistic_id": entity_id,
        "unit_class": unit_class,
        "unit_of_measurement": unit,
    }


def _hour_loads(t: datetime, outdoor: float, rng: random.Random) -> dict[str, float]:
    """kWh consumidos por circuito numa hora local `t`."""
    h, wd = t.hour, t.weekday()
    weekend = wd >= 5
    day = t.timetuple().tm_yday
    loads = {c["id"]: 0.0 for c in CIRCUITS}

    winter = t.month in (10, 11, 12, 1, 2, 3)
    if 19 <= h <= 23 or (winter and h == 18):
        loads["iluminacao"] = rng.uniform(0.09, 0.19)
    elif h in (7, 8):
        loads["iluminacao"] = rng.uniform(0.03, 0.07)
    else:
        loads["iluminacao"] = rng.uniform(0.002, 0.012)

    if outdoor > 25.5 and 13 <= h <= 21:
        loads["climatizacao"] = rng.uniform(0.5, 1.4) * (outdoor - 24) / 4
    elif outdoor < 12 and (6 <= h <= 9 or 18 <= h <= 23):
        loads["climatizacao"] = rng.uniform(0.6, 1.3)
    else:
        loads["climatizacao"] = rng.uniform(0.0, 0.05)

    kitchen = 0.045
    if h in (7, 8):
        kitchen += rng.uniform(0.08, 0.2)
    if h in (12, 13) and (weekend or rng.random() < 0.3):
        kitchen += rng.uniform(0.5, 1.0)
    if h in (19, 20):
        kitchen += rng.uniform(0.6, 1.3)
    if h in (22, 23) and (day + h) % 2 == 0:
        kitchen += rng.uniform(0.35, 0.55)  # máquina da loiça
    loads["cozinha"] = kitchen

    # Máquina da roupa às horas de sol (3×/semana) e secador ao fim de semana
    if wd in (0, 2, 5) and h in (11, 12):
        loads["lavandaria"] = rng.uniform(0.35, 0.55)
    if weekend and h in (15, 16):
        loads["lavandaria"] += rng.uniform(0.9, 1.2)

    if h in (7, 8, 21, 22):
        loads["aguas_quentes"] = rng.uniform(0.7, 1.3)
    else:
        loads["aguas_quentes"] = rng.uniform(0.02, 0.12)

    # Carro: 2 noites por semana (01–04h) e sábado à hora do sol
    if (wd in (1, 3) and 1 <= h <= 3) or (wd == 5 and 12 <= h <= 14):
        loads["carregador_ve"] = rng.uniform(6.8, 7.3)

    other = 0.085
    if 19 <= h <= 23:
        other += rng.uniform(0.08, 0.14)  # TV
    if not weekend and 9 <= h <= 18:
        other += rng.uniform(0.1, 0.17)  # computador
    loads["outros"] = other
    return loads


async def async_backfill(hass: HomeAssistant, engine: Engine) -> None:
    """Gera e importa as estatísticas; atualiza os contadores do motor."""
    tz = dt_util.get_default_time_zone()
    now = dt_util.now()
    end = now.replace(minute=0, second=0, microsecond=0)  # hora atual (não incluída)
    start = end - timedelta(days=DAYS)
    obs = Observer(latitude=hass.config.latitude, longitude=hass.config.longitude)

    counters = {k: 0.0 for k in engine.energy}
    # Os contadores começam em valores "de uma casa com uns meses", mais credível
    counters.update(grid_import=2841.3, grid_export=1320.8, solar=4480.2, battery_charge=1502.6, battery_discharge=1388.4, home=6010.7)
    circuit_totals = {c["id"]: 0.0 for c in CIRCUITS}
    circuit_totals.update(iluminacao=212.4, climatizacao=1480.9, cozinha=1106.3, lavandaria=402.8, aguas_quentes=1287.1, carregador_ve=1062.5, outros=458.7)

    e_bat = BATTERY_KWH * 0.5
    series: dict[str, list[dict]] = {}

    def add(eid: str, row: dict) -> None:
        series.setdefault(eid, []).append(row)

    t = start
    while t < end:
        rng = random.Random(int(t.timestamp()))
        mid = t + timedelta(minutes=30)
        # Exterior
        h = mid.hour + mid.minute / 60
        seasonal = 16.5 - 6.5 * math.cos((mid.timetuple().tm_yday - 20) / 365 * math.tau)
        cond, cloud = engine.auto_condition(mid)
        daily = 5.5 * math.sin((h - 9) / 24 * math.tau)
        outdoor = seasonal + daily * (1 - 0.6 * cloud) - 2.5 * (cloud > 0.8) + rng.uniform(-0.4, 0.4)
        o_hum = max(30.0, min(98.0, 62 - daily * 3.2 + cloud * 25 + rng.uniform(-2, 2)))

        # Solar
        try:
            elev = sun_elevation(obs, mid.astimezone(tz))
        except ValueError:
            elev = -10.0
        solar = 0.0
        if elev > 0:
            solar = SOLAR_KWP * math.sin(math.radians(elev)) ** 1.15 * 0.86 * (1 - 0.82 * cloud) * rng.uniform(0.95, 1.03)

        loads = _hour_loads(mid, outdoor, rng)
        load = sum(loads.values())
        ev = loads["carregador_ve"]

        net = load - solar
        charge = discharge = g_in = g_out = 0.0
        if net < 0:
            charge = min(-net, 5.0, (BATTERY_KWH - e_bat) / 0.95)
            g_out = -net - charge
            e_bat += charge * 0.95
        else:
            discharge = max(0.0, min(net - ev, 5.0, e_bat - BATTERY_RESERVE * BATTERY_KWH))
            g_in = net - discharge
            e_bat -= discharge

        counters["grid_import"] += g_in
        counters["grid_export"] += g_out
        counters["solar"] += solar
        counters["battery_charge"] += charge
        counters["battery_discharge"] += discharge
        counters["home"] += load
        for c, v in loads.items():
            circuit_totals[c] += v

        start_utc = dt_util.as_utc(t)
        for key, eid in ENERGY_ENTITIES.items():
            add(eid, {"start": start_utc, "state": round(counters[key], 3), "sum": round(counters[key], 3)})
        for c in CIRCUITS:
            v = round(circuit_totals[c["id"]], 3)
            add(f"sensor.energia_{c['id']}", {"start": start_utc, "state": v, "sum": v})
            w = loads[c["id"]] * 1000
            add(f"sensor.potencia_{c['id']}", {"start": start_utc, "mean": w, "min": w * 0.6, "max": w * 1.6})

        for eid, w in (
            ("sensor.potencia_casa", load * 1000),
            ("sensor.potencia_solar", solar * 1000),
            ("sensor.potencia_rede", (g_in - g_out) * 1000),
            ("sensor.potencia_bateria", (charge - discharge) * 1000),
        ):
            add(eid, {"start": start_utc, "mean": round(w, 1), "min": round(w * 0.7 if w > 0 else w * 1.3, 1), "max": round(w * 1.3 if w > 0 else w * 0.7, 1)})
        soc = e_bat / BATTERY_KWH * 100
        add("sensor.bateria_soc", {"start": start_utc, "mean": soc, "min": soc - 1, "max": soc + 1})
        add("sensor.temperatura_exterior", {"start": start_utc, "mean": outdoor, "min": outdoor - 0.6, "max": outdoor + 0.6})
        add("sensor.humidade_exterior", {"start": start_utc, "mean": o_hum, "min": o_hum - 2, "max": o_hum + 2})
        for r in ROOM_SENSORS:
            rt = 21.8 + (outdoor - 18) * 0.28 + rng.uniform(-0.3, 0.3) + (1.2 if r["id"] == "wc" else 0)
            add(f"sensor.temperatura_{r['id']}", {"start": start_utc, "mean": rt, "min": rt - 0.3, "max": rt + 0.3})
            rh = 50 + (o_hum - 60) * 0.25 + (12 if r["id"] == "wc" else 0) + rng.uniform(-1.5, 1.5)
            add(f"sensor.humidade_{r['id']}", {"start": start_utc, "mean": rh, "min": rh - 2, "max": rh + 2})

        t += timedelta(hours=1)

    for eid, rows in series.items():
        if eid.startswith("sensor.energia_"):
            meta = _sum_meta(eid, "energy", "kWh")
        elif eid.startswith("sensor.potencia_"):
            meta = _mean_meta(eid, "power", "W")
        elif eid.startswith("sensor.temperatura_"):
            meta = _mean_meta(eid, "temperature", "°C")
        else:
            meta = _mean_meta(eid, None, "%")
        async_import_statistics(hass, meta, rows)

    engine.energy.update(counters)
    engine.circuit_energy.update(circuit_totals)
    engine.battery_soc = max(15.0, min(100.0, e_bat / BATTERY_KWH * 100))
    _LOGGER.info("Casa Demo: histórico de %s dias importado (%s séries)", DAYS, len(series))


ENERGY_ENTITIES = {
    "grid_import": "sensor.energia_rede_importada",
    "grid_export": "sensor.energia_rede_exportada",
    "solar": "sensor.energia_solar_produzida",
    "battery_charge": "sensor.energia_bateria_carregada",
    "battery_discharge": "sensor.energia_bateria_descarregada",
    "home": "sensor.energia_casa_consumida",
}
