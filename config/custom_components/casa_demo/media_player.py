"""TV da sala simulada (ligada à tomada: se a tomada desliga, a TV desliga)."""

from __future__ import annotations

from typing import Any

from homeassistant.components.media_player import (
    MediaPlayerDeviceClass,
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
    MediaType,
)
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from . import CasaDemoConfigEntry
from .entity import CasaEntity, device_info

# fonte → (o que está a dar, canal/app)
CONTENT = {
    "TV": ("Telejornal", "RTP1"),
    "HDMI 1": ("Consola", "PlayStation"),
    "HDMI 2": ("Leitor Blu-ray", "Blu-ray"),
    "HDMI 3": ("Portátil", "HDMI"),
    "Netflix": ("Uma Série Qualquer — T2:E4", "Netflix"),
    "Disney+": ("Documentário sobre o mar", "Disney+"),
    "HBO Max": ("Filme de sábado à noite", "HBO Max"),
    "Prime Video": ("Comédia romântica", "Prime Video"),
    "Spotify": ("Playlist — Jantar tranquilo", "Spotify"),
    "YouTube": ("Como instalar um estore elétrico", "YouTube"),
}
SOURCES = list(CONTENT)


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    async_add_entities([CasaTV(entry.runtime_data)])


class CasaTV(CasaEntity, MediaPlayerEntity):
    _attr_device_class = MediaPlayerDeviceClass.TV
    _attr_source_list = SOURCES
    _attr_supported_features = (
        MediaPlayerEntityFeature.TURN_ON
        | MediaPlayerEntityFeature.TURN_OFF
        | MediaPlayerEntityFeature.VOLUME_SET
        | MediaPlayerEntityFeature.VOLUME_STEP
        | MediaPlayerEntityFeature.VOLUME_MUTE
        | MediaPlayerEntityFeature.SELECT_SOURCE
        | MediaPlayerEntityFeature.PLAY
        | MediaPlayerEntityFeature.PAUSE
        | MediaPlayerEntityFeature.STOP
        | MediaPlayerEntityFeature.NEXT_TRACK
        | MediaPlayerEntityFeature.PREVIOUS_TRACK
    )

    def __init__(self, engine) -> None:
        super().__init__(
            engine,
            entity_id="media_player.tv_sala",
            unique_id="media_player_tv_sala",
            device=device_info("tv_sala", "TV Sala", "sala", 'Smart TV 55"'),
            signal="tv",
            tick=True,
        )

    @property
    def _tv(self) -> dict[str, Any]:
        return self.engine.tv

    @property
    def _powered(self) -> bool:
        """A tomada corta a alimentação da TV."""
        return self.engine.plugs.get("sala_tv", False)

    @property
    def state(self) -> MediaPlayerState:
        if not self._powered or not self._tv["on"]:
            return MediaPlayerState.OFF
        return MediaPlayerState.PAUSED if self._tv["paused"] else MediaPlayerState.PLAYING

    @property
    def source(self) -> str:
        return self._tv["source"]

    @property
    def volume_level(self) -> float:
        return self._tv["volume"]

    @property
    def is_volume_muted(self) -> bool:
        return self._tv["muted"]

    @property
    def media_title(self) -> str | None:
        if self.state == MediaPlayerState.OFF:
            return None
        return CONTENT.get(self._tv["source"], ("—", ""))[0]

    @property
    def app_name(self) -> str | None:
        if self.state == MediaPlayerState.OFF:
            return None
        return CONTENT.get(self._tv["source"], ("", "—"))[1]

    @property
    def media_content_type(self) -> str:
        return MediaType.MUSIC if self._tv["source"] == "Spotify" else MediaType.TVSHOW

    def _changed(self) -> None:
        self.engine.schedule_save()
        self.engine.notify("tv")
        self.async_write_ha_state()

    async def async_turn_on(self) -> None:
        self.engine.plugs["sala_tv"] = True
        self.engine.notify("switch_sala_tv")
        self._tv["on"] = True
        self._tv["paused"] = False
        self._changed()

    async def async_turn_off(self) -> None:
        self._tv["on"] = False
        self._changed()

    async def async_select_source(self, source: str) -> None:
        if source in CONTENT:
            self._tv["source"] = source
            self._tv["on"] = True
            self._tv["paused"] = False
            self._changed()

    async def async_set_volume_level(self, volume: float) -> None:
        self._tv["volume"] = max(0.0, min(1.0, float(volume)))
        self._changed()

    async def async_volume_up(self) -> None:
        await self.async_set_volume_level(self._tv["volume"] + 0.05)

    async def async_volume_down(self) -> None:
        await self.async_set_volume_level(self._tv["volume"] - 0.05)

    async def async_mute_volume(self, mute: bool) -> None:
        self._tv["muted"] = bool(mute)
        self._changed()

    async def async_media_play(self) -> None:
        self._tv["paused"] = False
        self._changed()

    async def async_media_pause(self) -> None:
        self._tv["paused"] = True
        self._changed()

    async def async_media_stop(self) -> None:
        self._tv["on"] = False
        self._changed()

    async def async_media_next_track(self) -> None:
        i = SOURCES.index(self._tv["source"])
        await self.async_select_source(SOURCES[(i + 1) % len(SOURCES)])

    async def async_media_previous_track(self) -> None:
        i = SOURCES.index(self._tv["source"])
        await self.async_select_source(SOURCES[(i - 1) % len(SOURCES)])
