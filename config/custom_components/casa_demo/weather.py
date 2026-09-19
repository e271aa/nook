"""Tempo simulado (controlável pelo select "Tempo simulado")."""

from __future__ import annotations

import math
import random
from datetime import timedelta

from homeassistant.components.weather import Forecast, WeatherEntity, WeatherEntityFeature
from homeassistant.const import UnitOfPressure, UnitOfSpeed, UnitOfTemperature
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import CasaDemoConfigEntry
from .entity import CasaEntity, device_info


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([CasaWeather(entry.runtime_data)])


class CasaWeather(CasaEntity, WeatherEntity):
    _attr_native_temperature_unit = UnitOfTemperature.CELSIUS
    _attr_native_wind_speed_unit = UnitOfSpeed.KILOMETERS_PER_HOUR
    _attr_native_pressure_unit = UnitOfPressure.HPA
    _attr_supported_features = WeatherEntityFeature.FORECAST_DAILY | WeatherEntityFeature.FORECAST_HOURLY

    def __init__(self, engine) -> None:
        super().__init__(engine, entity_id="weather.casa", unique_id="weather_casa",
                         device=device_info("estacao", "Estação meteorológica", "jardim", "Sensor exterior"),
                         name="Tempo", signal="weather_mode", tick=True)
        self._last_condition: str | None = None

    @property
    def condition(self) -> str:
        return self.engine.condition

    @property
    def native_temperature(self) -> float:
        return round(self.engine.outdoor_temp, 1)

    @property
    def humidity(self) -> float:
        return round(self.engine.outdoor_hum)

    @property
    def native_wind_speed(self) -> float:
        return round(9 + 14 * self.engine.cloud, 1)

    @property
    def native_pressure(self) -> float:
        return round(1024 - 16 * self.engine.cloud, 1)

    @property
    def cloud_coverage(self) -> int:
        return round(self.engine.cloud * 100)

    @callback
    def _handle_tick(self) -> None:
        super()._handle_tick()
        if self.engine.condition != self._last_condition:
            self._last_condition = self.engine.condition
            self.hass.async_create_task(self.async_update_listeners(("daily", "hourly")))

    async def async_forecast_hourly(self) -> list[Forecast]:
        """24 h de previsão, com o mesmo modelo do motor."""
        out: list[Forecast] = []
        now = dt_util.now().replace(minute=0, second=0, microsecond=0)
        for i in range(1, 25):
            t = now + timedelta(hours=i)
            cond, cloud = self.engine.auto_condition(t)
            if self.engine.weather_mode != "Automático":
                cond, cloud = self.engine.condition.replace("clear-night", "sunny"), self.engine.cloud
            h = t.hour
            seasonal = 16.5 - 6.5 * math.cos((t.timetuple().tm_yday - 20) / 365 * math.tau)
            daily = 5.5 * math.sin((h - 9) / 24 * math.tau)
            temp = seasonal + daily * (1 - 0.6 * cloud) - 2.5 * (cloud > 0.8)
            try:
                from astral import Observer
                from astral.sun import elevation

                elev = elevation(
                    Observer(latitude=self.hass.config.latitude, longitude=self.hass.config.longitude),
                    dt_util.as_utc(t),
                )
            except (ValueError, TypeError):
                elev = 10
            if elev <= 0 and cond == "sunny":
                cond = "clear-night"
            out.append(
                Forecast(
                    datetime=t.isoformat(),
                    condition=cond,
                    native_temperature=round(temp, 1),
                    precipitation_probability=round(cloud * 90) if cloud > 0.5 else round(cloud * 20),
                    humidity=round(max(30.0, min(98.0, 62 - daily * 3.2 + cloud * 25))),
                )
            )
        return out

    async def async_forecast_daily(self) -> list[Forecast]:
        out: list[Forecast] = []
        today = dt_util.start_of_local_day()
        for i in range(7):
            day = today + timedelta(days=i)
            cond, cloud = self.engine.auto_condition(day + timedelta(hours=13))
            if i == 0:
                cond, cloud = self.engine.condition.replace("clear-night", "sunny"), self.engine.cloud
            rng = random.Random(int(day.timestamp()))
            seasonal = 16.5 - 6.5 * math.cos((day.timetuple().tm_yday - 20) / 365 * math.tau)
            out.append(
                Forecast(
                    datetime=day.isoformat(),
                    condition=cond,
                    native_temperature=round(seasonal + 5.5 * (1 - 0.6 * cloud) + rng.uniform(-1, 1), 1),
                    native_templow=round(seasonal - 5.5 + rng.uniform(-1, 1), 1),
                    precipitation_probability=round(cloud * 90) if cloud > 0.5 else round(cloud * 20),
                )
            )
        return out
