"""Vistas HTTP do Casa OS: página, configuração, estatísticas e câmaras."""

from __future__ import annotations

import json
import logging
import time
from datetime import timedelta
from pathlib import Path

import jinja2
from aiohttp import web

from homeassistant.auth.models import TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN
from homeassistant.components.http import KEY_HASS_USER, HomeAssistantView
from homeassistant.components.recorder import get_instance
from homeassistant.components.recorder.statistics import statistics_during_period
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

DOMAIN = "casa_os"
DEMO_CLIENT_NAME = "Casa OS (modo demo)"
BASE = Path(__file__).parent


async def async_demo_token(hass: HomeAssistant, user_name: str):
    """Token do utilizador de demonstração (nunca de um administrador)."""
    users = await hass.auth.async_get_users()
    user = next(
        (u for u in users if u.name == user_name and u.is_active and not u.system_generated),
        None,
    )
    if user is None or user.is_admin:
        return None, None
    refresh = next(
        (t for t in user.refresh_tokens.values() if t.client_name == DEMO_CLIENT_NAME), None
    )
    if refresh is None:
        refresh = await hass.auth.async_create_refresh_token(
            user,
            client_name=DEMO_CLIENT_NAME,
            token_type=TOKEN_TYPE_LONG_LIVED_ACCESS_TOKEN,
            access_token_expiration=timedelta(days=30),
        )
    return user, hass.auth.async_create_access_token(refresh)


def _request_user(hass: HomeAssistant, request: web.Request):
    """Utilizador da sessão, ou do token enviado no pedido."""
    user = request.get(KEY_HASS_USER)
    token = None
    if user is None:
        raw = request.query.get("token")
        if not raw and request.headers.get("Authorization", "").startswith("Bearer "):
            raw = request.headers["Authorization"][7:]
        if raw:
            refresh = hass.auth.async_validate_access_token(raw.strip().strip('"'))
            if refresh:
                user, token = refresh.user, raw
    return user, token


async def _async_user_or_demo(hass: HomeAssistant, request: web.Request):
    user, token = _request_user(hass, request)
    if user is None and (demo_user := hass.data.get(DOMAIN, {}).get("demo_user")):
        user, token = await async_demo_token(hass, demo_user)
    return user, token


def _load_config(hass: HomeAssistant) -> dict:
    """Configuração da casa: /config/casa_os.json tem prioridade sobre a incluída."""
    for path in (Path(hass.config.path("casa_os.json")), BASE / "config.json"):
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError) as err:
                _LOGGER.error("Casa OS: configuração inválida em %s: %s", path, err)
    return {}


class CasaOsPageView(HomeAssistantView):
    url = "/casa"
    name = "casa_os:page"
    requires_auth = False

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(BASE / "templates")),
            autoescape=True,
            enable_async=True,
        )
        self._template: jinja2.Template | None = None

    async def _async_template(self) -> jinja2.Template:
        """Lê o template uma vez, fora do event loop (ler ficheiros bloqueia)."""
        if self._template is None:
            self._template = await self.hass.async_add_executor_job(
                self._env.get_template, "index.html"
            )
        return self._template

    async def get(self, request: web.Request) -> web.Response:
        user, token = await _async_user_or_demo(self.hass, request)
        if user is None:
            return web.Response(status=401, text="Inicie sessão no Home Assistant.")
        if not user.is_active:
            return web.Response(status=401, text="Utilizador inativo.")

        config = await self.hass.async_add_executor_job(_load_config, self.hass)
        template = await self._async_template()
        html = await template.render_async(
            token=token or "",
            title=self.hass.data.get(DOMAIN, {}).get("title", "Casa"),
            config_json=json.dumps(config, ensure_ascii=False),
            version=int(time.time()),
            user_name=user.name,
        )
        return web.Response(body=html, content_type="text/html")


class CasaOsConfigView(HomeAssistantView):
    """Configuração da casa em JSON (para recarregar sem refrescar a página)."""

    url = "/api/casa_os/config"
    name = "casa_os:config"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request) -> web.Response:
        config = await self.hass.async_add_executor_job(_load_config, self.hass)
        return web.json_response(config)


class CasaOsStatisticsView(HomeAssistantView):
    """Estatísticas de longo prazo (o HA só as expõe por WebSocket)."""

    url = "/api/casa_os/statistics"
    name = "casa_os:statistics"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request) -> web.Response:
        q = request.query
        start = dt_util.parse_datetime(q.get("start", ""))
        end = dt_util.parse_datetime(q.get("end", "")) if q.get("end") else None
        ids = {i for i in (q.get("ids") or "").split(",") if i}
        period = q.get("period", "hour")
        if start is None or not ids or period not in ("5minute", "hour", "day", "month"):
            return self.json_message("Parâmetros inválidos", 400)

        rows = await get_instance(self.hass).async_add_executor_job(
            statistics_during_period,
            self.hass,
            dt_util.as_utc(start),
            dt_util.as_utc(end) if end else None,
            ids,
            period,
            None,
            {"change", "mean", "state", "sum"},
        )
        out: dict[str, list[dict]] = {}
        for sid, data in rows.items():
            out[sid] = [
                {
                    "start": row["start"] * 1000 if isinstance(row.get("start"), (int, float)) else row.get("start"),
                    "change": row.get("change"),
                    "mean": row.get("mean"),
                    "sum": row.get("sum"),
                }
                for row in data
            ]
        return web.json_response(out)


class CasaOsCameraView(HomeAssistantView):
    """Imagem da câmara (o <img> do browser não envia cabeçalhos de autenticação)."""

    url = "/api/casa_os/camera/{entity_id}"
    name = "casa_os:camera"
    requires_auth = False

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request: web.Request, entity_id: str) -> web.Response:
        user, _ = await _async_user_or_demo(self.hass, request)
        if user is None:
            return web.Response(status=401)
        from homeassistant.components import camera

        try:
            image = await camera.async_get_image(self.hass, entity_id, timeout=10)
        except Exception as err:  # noqa: BLE001 - câmara indisponível
            _LOGGER.debug("Casa OS: sem imagem de %s: %s", entity_id, err)
            return web.Response(status=503)
        return web.Response(
            body=image.content,
            content_type=image.content_type,
            headers={"Cache-Control": "no-store"},
        )
