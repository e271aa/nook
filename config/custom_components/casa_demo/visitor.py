"""Utilizador "Visitante" para a entrada direta na demo (sem login).

Exposto como endpoint só para administradores: o bootstrap chama-o depois do
onboarding. Cria o utilizador (grupo system-users, sem admin), escreve o ficheiro
`trusted/demo.yaml` usado pelo trusted_networks e diz se é preciso
reiniciar para o novo mapeamento entrar em vigor.
"""

from __future__ import annotations

import logging
from pathlib import Path

from aiohttp import web

from homeassistant.auth.const import GROUP_ID_USER
from homeassistant.components.http import KEY_HASS, KEY_HASS_USER, HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers import area_registry as ar

from .const import AREAS

_LOGGER = logging.getLogger(__name__)

VISITOR_NAME = "Visitante"
VISITOR_USERNAME = "visitante"
# numa pasta seguida pelo git (só com um .gitkeep): num clone novo a pasta existe e o
# HA arranca; o ficheiro que aqui se escreve é gerado e fica de fora do git
TRUSTED_FILE = "trusted/demo.yaml"
# Divisões criadas pelo onboarding do HA que não fazem parte da casa demo
DEFAULT_AREAS = {"Sala de estar", "Living Room", "Kitchen", "Bedroom"}


async def async_get_or_create_visitor(hass: HomeAssistant, password: str):
    for user in await hass.auth.async_get_users():
        if user.name == VISITOR_NAME and not user.system_generated:
            return user
    provider = next(p for p in hass.auth.auth_providers if p.type == "homeassistant")
    await provider.async_initialize()
    try:
        await provider.async_add_auth(VISITOR_USERNAME, password)
    except Exception:  # noqa: BLE001 - já existe
        _LOGGER.debug("Credenciais do visitante já existiam")
    user = await hass.auth.async_create_user(VISITOR_NAME, group_ids=[GROUP_ID_USER])
    credentials = await provider.async_get_or_create_credentials({"username": VISITOR_USERNAME})
    await hass.auth.async_link_user(user, credentials)
    return user


class VisitorSetupView(HomeAssistantView):
    url = "/api/casa_demo/visitante"
    name = "api:casa_demo:visitante"
    requires_auth = True

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app[KEY_HASS]
        caller = request[KEY_HASS_USER]
        if not caller.is_admin:
            return self.json_message("Só administradores", 403)
        body = await request.json() if request.can_read_body else {}
        user = await async_get_or_create_visitor(hass, body.get("password", "visitante"))

        # Limpa as divisões por omissão do onboarding (se estiverem vazias)
        areas = ar.async_get(hass)
        ours = {a["name"] for a in AREAS}
        for area in list(areas.areas.values()):
            if area.name in DEFAULT_AREAS and area.name not in ours:
                areas.async_delete(area.id)

        # A conta de administrador criada no onboarding gera uma "pessoa" que não
        # faz parte da casa demo: remover para a demo ficar limpa.
        await _async_remove_admin_person(hass, caller)

        content = (
            "# Gerado automaticamente pelo bootstrap da demo. Qualquer IP entra como Visitante.\n"
            f"0.0.0.0/0: {user.id}\n"
            f"::/0: {user.id}\n"
        )
        path = Path(hass.config.path(TRUSTED_FILE))

        def _write() -> bool:
            path.parent.mkdir(parents=True, exist_ok=True)
            old = path.read_text(encoding="utf-8") if path.exists() else ""
            if old == content:
                return False
            path.write_text(content, encoding="utf-8")
            return True

        changed = await hass.async_add_executor_job(_write)
        return self.json({"user_id": user.id, "restart_needed": changed})


async def _async_remove_admin_person(hass: HomeAssistant, admin_user) -> None:
    """Remove a pessoa associada à conta de administrador (criada no onboarding)."""
    try:
        from homeassistant.components import person  # noqa: PLC0415

        _yaml, storage, _component = hass.data[person.DOMAIN]
        for item_id, item in list(storage.data.items()):
            if item.get("user_id") == admin_user.id:
                await storage.async_delete_item(item_id)
                _LOGGER.info("Casa Demo: pessoa do administrador removida")
    except Exception:  # noqa: BLE001 - não é crítico para a demo
        _LOGGER.debug("Não foi possível remover a pessoa do administrador", exc_info=True)
