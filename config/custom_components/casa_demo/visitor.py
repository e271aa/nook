"""Utilizador "Visitante" para a entrada direta na demo (sem login).

Exposto como endpoint só para administradores: o bootstrap chama-o depois do
onboarding. Cria o utilizador (grupo system-users, sem admin), escreve o ficheiro
`trusted/demo.yaml` usado pelo trusted_networks e diz se é preciso
reiniciar para o novo mapeamento entrar em vigor.

Também aqui: todas as outras contas só entram a partir da rede local, saem os
serviços com que um visitante podia encher o disco, e o HTTP fica pronto para
um proxy quando o bootstrap diz qual é.
"""

from __future__ import annotations

import logging
from pathlib import Path

from aiohttp import web

from homeassistant.auth import EVENT_USER_ADDED
from homeassistant.auth.const import GROUP_ID_USER
from homeassistant.components.http import KEY_HASS, KEY_HASS_USER, HomeAssistantView
from homeassistant.components.http.config import HTTP_STORAGE_SCHEMA, async_get_and_load_store
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers.start import async_at_started

from .const import AREAS

_LOGGER = logging.getLogger(__name__)

VISITOR_NAME = "Visitante"
VISITOR_USERNAME = "visitante"
# numa pasta seguida pelo git (só com um .gitkeep): num clone novo a pasta existe e o
# HA arranca; o ficheiro que aqui se escreve é gerado e fica de fora do git
TRUSTED_FILE = "trusted/demo.yaml"
# Divisões criadas pelo onboarding do HA que não fazem parte da casa demo
DEFAULT_AREAS = {"Sala de estar", "Living Room", "Kitchen", "Bedroom"}
# Serviços que qualquer utilizador pode chamar, que escrevem no disco sem limite
# (registo, diário, ficheiros em /config/www) e de que a casa não precisa
SERVICOS_FECHADOS = (
    ("system_log", "write"),
    ("logbook", "log"),
    ("camera", "snapshot"),
    ("homeassistant", "save_persistent_states"),
)


# Cinco palavras-passe erradas bloqueiam o endereço de quem as tentou
TENTATIVAS_DE_LOGIN = 5


async def async_http_atras_de_proxy(hass: HomeAssistant, proxy: str) -> bool:
    """Põe o HTTP a acreditar no X-Forwarded-For desse proxy. True se mudou.

    Desde o HA 2026.9 esta configuração vive em `.storage/http` e já não no
    YAML. Uma configuração nova fica "pendente" e o HA desfá-la ao fim de
    5 minutos se ninguém a confirmar; aqui confirma-se logo, e o bootstrap
    reinicia o HA para ela entrar em vigor.
    """
    store = await async_get_and_load_store(hass)
    config = HTTP_STORAGE_SCHEMA(
        {
            "use_x_forwarded_for": True,
            "trusted_proxies": [proxy],
            "ip_ban_enabled": True,
            "login_attempts_threshold": TENTATIVAS_DE_LOGIN,
        }
    )
    await store.async_set_pending(config)
    if store.pending is None:  # já era esta a configuração confirmada
        return False
    await store.async_promote_pending()
    _LOGGER.info("Casa Demo: HTTP atrás do proxy %s", proxy)
    return True


def _e_visitante(user) -> bool:
    return user.name == VISITOR_NAME and not user.is_admin and not user.system_generated


async def async_so_rede_local(hass: HomeAssistant) -> None:
    """Todas as contas menos o Visitante só entram a partir da rede local.

    O Home Assistant recusa-as fora dela no login, na renovação da sessão, nos
    pedidos e no WebSocket, mesmo com a palavra-passe certa. Atrás de um proxy
    isto depende de `http.trusted_proxies` estar certo.
    """
    for user in await hass.auth.async_get_users():
        if user.system_generated or user.local_only or _e_visitante(user):
            continue
        await hass.auth.async_update_user(user, local_only=True)
        _LOGGER.info("Casa Demo: a conta '%s' só entra a partir da rede local", user.name)


@callback
def async_fechar_demo(hass: HomeAssistant) -> None:
    """Fecha a demo a quem vem de fora: no arranque e sempre que nasce uma conta."""

    async def _utilizador_novo(_: Event) -> None:
        await async_so_rede_local(hass)

    hass.bus.async_listen(EVENT_USER_ADDED, _utilizador_novo)
    hass.async_create_task(async_so_rede_local(hass))

    @callback
    def _fechar_servicos(_: HomeAssistant) -> None:
        for dominio, servico in SERVICOS_FECHADOS:
            if hass.services.has_service(dominio, servico):
                hass.services.async_remove(dominio, servico)

    # só depois do arranque: até lá o serviço pode ainda não existir
    async_at_started(hass, _fechar_servicos)


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
        if proxy := body.get("trusted_proxy"):
            changed = await async_http_atras_de_proxy(hass, proxy) or changed
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
