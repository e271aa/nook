"""Calendários da casa e do trabalho, com eventos gerados à volta de hoje.

O dashboard lê todos os `calendar.*` e pinta-os por nome (casa / emprego), por
isso as entidades chamam-se `calendar.casa` e `calendar.emprego`.
"""

from __future__ import annotations

import random
from datetime import date, datetime, timedelta

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import CasaDemoConfigEntry
from .entity import CasaEntity, device_info

# (resumo, hora de início, duração em horas, dias da semana ou None p/ pontual)
CASA = {
    "weekly": [
        ("Recolha do lixo", 21.0, 0.5, [1, 4]),
        ("Ginásio", 19.0, 1.5, [0, 2]),
        ("Jantar de família", 20.0, 2.0, [6]),
        ("Limpeza da piscina", 10.0, 1.0, [5]),
    ],
    "once": [
        ("Manutenção do ar condicionado", 3, 9.0, 2.0),
        ("Entrega do frigorífico novo", 8, 14.0, 1.0),
        ("Anos da Ana", 16, 0.0, 24.0),
        ("Inspeção do carro", 24, 11.0, 1.0),
        ("Leitura do contador", -4, 10.0, 0.5),
    ],
}
EMPREGO = {
    "weekly": [
        ("Reunião de equipa", 9.5, 1.0, [0]),
        ("Ponto com o cliente", 15.0, 0.5, [3]),
        ("Almoço de equipa", 12.5, 1.5, [4]),
    ],
    "once": [
        ("Instalação em casa do cliente Silva", 2, 9.0, 4.0),
        ("Formação Home Assistant", 10, 9.0, 8.0),
        ("Orçamento da moradia de Cascais", 5, 16.0, 1.0),
        ("Visita técnica — Oeiras", -2, 14.0, 2.0),
    ],
}


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities(
        [
            CasaCalendar(entry.runtime_data, "casa", "Casa", CASA),
            CasaCalendar(entry.runtime_data, "emprego", "Emprego", EMPREGO),
        ]
    )


def _at(day: date, hour: float) -> datetime:
    return datetime.combine(day, datetime.min.time(), tzinfo=dt_util.get_default_time_zone()) + timedelta(hours=hour)


class CasaCalendar(CasaEntity, CalendarEntity):
    def __init__(self, engine, key: str, name: str, spec: dict) -> None:
        super().__init__(
            engine,
            entity_id=f"calendar.{key}",
            unique_id=f"calendar_{key}",
            device=device_info("servidor", "Servidor Casa", "garagem", "Mini PC"),
            name=name,
            tick=True,
        )
        self._attr_icon = "mdi:calendar-heart" if key == "casa" else "mdi:briefcase-outline"
        self._spec = spec
        self._key = key

    def _events(self, start: datetime, end: datetime) -> list[CalendarEvent]:
        out: list[CalendarEvent] = []
        today = dt_util.now().date()
        day = start.date()
        while day <= end.date():
            for summary, hour, dur, weekdays in self._spec["weekly"]:
                if day.weekday() in weekdays:
                    out.append(CalendarEvent(start=_at(day, hour), end=_at(day, hour + dur), summary=summary))
            day += timedelta(days=1)
        for summary, offset, hour, dur in self._spec["once"]:
            d = today + timedelta(days=offset)
            if dur >= 24:
                ev = CalendarEvent(start=d, end=d + timedelta(days=1), summary=summary)
            else:
                ev = CalendarEvent(start=_at(d, hour), end=_at(d, hour + dur), summary=summary)
            out.append(ev)
        return sorted(
            [e for e in out if _as_dt(e.end) > start and _as_dt(e.start) < end],
            key=lambda e: _as_dt(e.start),
        )

    @property
    def event(self) -> CalendarEvent | None:
        now = dt_util.now()
        upcoming = self._events(now - timedelta(days=1), now + timedelta(days=14))
        for ev in upcoming:
            if _as_dt(ev.end) > now:
                return ev
        return None

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        return self._events(dt_util.as_local(start_date), dt_util.as_local(end_date))


def _as_dt(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        return dt_util.as_local(value)
    return _at(value, 0)
