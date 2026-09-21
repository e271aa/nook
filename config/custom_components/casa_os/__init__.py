"""Casa OS — interface única, responsiva, para a demo.

Serve uma só página (`/casa`) que fala diretamente com o Home Assistant por
WebSocket. O servidor só entrega o HTML, a configuração da casa e um token —
tudo o resto acontece no browser.
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "casa_os"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Regista os ficheiros estáticos e as vistas HTTP."""
    domain_config = config.get(DOMAIN) or {}
    hass.data.setdefault(DOMAIN, {})["demo_user"] = domain_config.get("demo_user")
    hass.data[DOMAIN]["title"] = domain_config.get("title", "Casa")

    static_path = Path(__file__).parent / "static"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(f"/casa_os_static", str(static_path), False)]
    )

    from .view import (
        CasaOsCameraView,
        CasaOsConfigView,
        CasaOsPageView,
        CasaOsStatisticsView,
    )

    hass.http.register_view(CasaOsPageView(hass))
    hass.http.register_view(CasaOsConfigView(hass))
    hass.http.register_view(CasaOsStatisticsView(hass))
    hass.http.register_view(CasaOsCameraView(hass))

    # Na barra lateral entra pelo painel "Nook" (dashboards/nook.yaml).
    _LOGGER.info("Casa OS: pronto em /casa")
    return True
