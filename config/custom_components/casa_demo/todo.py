"""Listas de tarefas da casa (lembretes e compras), com itens realistas."""

from __future__ import annotations

from datetime import date, timedelta

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import CasaDemoConfigEntry
from .entity import CasaEntity, device_info

LISTS = {
    "lembretes": {
        "name": "Lembretes",
        "icon": "mdi:calendar-check",
        "items": [
            ("Mudar o filtro do ar condicionado", 3, False),
            ("Pagar a fatura da luz", 6, False),
            ("Marcar revisão do carro", 12, False),
            ("Limpar os painéis solares", 20, False),
            ("Trocar as pilhas do sensor da porta", None, True),
        ],
    },
    "shopping_list": {
        "name": "Lista de Compras",
        "icon": "mdi:cart-outline",
        "items": [
            ("Café", None, False),
            ("Detergente da loiça", None, False),
            ("Lâmpada E27 do hall", None, False),
            ("Pão", None, True),
            ("Fruta", None, True),
        ],
    },
}


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities(CasaTodoList(entry.runtime_data, key, cfg) for key, cfg in LISTS.items())


class CasaTodoList(CasaEntity, TodoListEntity):
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.MOVE_TODO_ITEM
        | TodoListEntityFeature.SET_DUE_DATE_ON_ITEM
    )

    def __init__(self, engine, key: str, cfg: dict) -> None:
        super().__init__(
            engine,
            entity_id=f"todo.{key}",
            unique_id=f"todo_{key}",
            device=device_info("servidor", "Servidor Casa", "garagem", "Mini PC"),
            name=cfg["name"],
        )
        self._attr_icon = cfg["icon"]
        self._key = key
        self._seq = 0
        today = dt_util.now().date()
        self._attr_todo_items = [
            TodoItem(
                summary=summary,
                uid=self._next_uid(),
                status=TodoItemStatus.COMPLETED if done else TodoItemStatus.NEEDS_ACTION,
                due=(today + timedelta(days=days)) if days is not None else None,
            )
            for summary, days, done in cfg["items"]
        ]

    def _next_uid(self) -> str:
        self._seq += 1
        return f"{self._key}-{self._seq}"

    async def async_create_todo_item(self, item: TodoItem) -> None:
        item.uid = self._next_uid()
        item.status = item.status or TodoItemStatus.NEEDS_ACTION
        self._attr_todo_items = [*(self._attr_todo_items or []), item]
        self.async_write_ha_state()

    async def async_update_todo_item(self, item: TodoItem) -> None:
        items = list(self._attr_todo_items or [])
        for i, existing in enumerate(items):
            if existing.uid == item.uid:
                items[i] = item
                break
        self._attr_todo_items = items
        self.async_write_ha_state()

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        self._attr_todo_items = [i for i in (self._attr_todo_items or []) if i.uid not in uids]
        self.async_write_ha_state()

    async def async_move_todo_item(self, uid: str, previous_uid: str | None = None) -> None:
        items = list(self._attr_todo_items or [])
        moving = next((i for i in items if i.uid == uid), None)
        if moving is None:
            return
        items.remove(moving)
        if previous_uid is None:
            items.insert(0, moving)
        else:
            index = next((n for n, i in enumerate(items) if i.uid == previous_uid), len(items) - 1)
            items.insert(index + 1, moving)
        self._attr_todo_items = items
        self.async_write_ha_state()
