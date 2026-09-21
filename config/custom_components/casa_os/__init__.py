"""Casa OS — interface única, responsiva, para a demo.

Serve uma só página (`/casa`) que fala diretamente com o Home Assistant por
WebSocket. O servidor só entrega o HTML, a configuração da casa e um token —
tudo o resto acontece no browser.
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "casa_os"
PANEL_PATH = "painel"


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

    # O painel também entra na barra lateral do Home Assistant, para se poder
    # abrir sem saber o endereço. A página vive em /casa e o Home Assistant
    # mostra-a em /painel — dois caminhos diferentes de propósito, senão as
    # duas rotas disputavam o mesmo endereço.
    #
    # Num tablet de parede vale mais abrir /casa diretamente: dentro da moldura
    # do Home Assistant há duas barras, e coisas como manter o ecrã ligado não
    # atravessam a moldura.
    frontend.async_register_built_in_panel(
        hass,
        "iframe",
        sidebar_title=hass.data[DOMAIN]["title"],
        sidebar_icon="mdi:home-heart",
        frontend_url_path=PANEL_PATH,
        config={"url": "/casa"},
        require_admin=False,
    )
    _LOGGER.info("Casa OS: pronto em /casa (e na barra lateral, em /%s)", PANEL_PATH)
    return True
