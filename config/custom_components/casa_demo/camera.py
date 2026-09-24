"""Câmaras simuladas: imagens geradas com o Pillow a partir do estado da casa.

A cena muda com a hora do dia (céu, visão noturna), com o tempo (chuva), com as
luzes ligadas e com a posição real do portão da garagem. Inclui ainda o mapa do
robô aspirador com o percurso já limpo.
"""

from __future__ import annotations

import io
import random
import time
import unicodedata
from dataclasses import dataclass

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

from homeassistant.components.camera import Camera
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.util import dt as dt_util

from . import CasaDemoConfigEntry
from .const import CAMERAS
from .engine import Engine
from .entity import CasaEntity, device_info

W, H = 960, 540


async def async_setup_entry(
    hass: HomeAssistant, entry: CasaDemoConfigEntry, async_add_entities: AddConfigEntryEntitiesCallback
) -> None:
    e = entry.runtime_data
    ents: list[Camera] = [CasaCamera(e, c) for c in CAMERAS]
    ents.append(CasaVacuumMap(e))
    async_add_entities(ents)


@dataclass
class Snapshot:
    """Cópia do estado necessária para desenhar (para correr fora do event loop)."""

    elev: float
    rain: bool
    cloud: float
    lights: dict[str, float]
    garage: float
    motion: bool
    label: str
    now: str
    area: float
    vacuum: str


def _osd(texto: str) -> str:
    """O texto gravado na imagem, em maiúsculas e sem acentos, como nas câmaras
    a sério — e porque a letra de reserva do Pillow não tem o "Â"."""
    return "".join(c for c in unicodedata.normalize("NFD", texto.upper()) if not unicodedata.combining(c))


def _font(size: int) -> ImageFont.ImageFont:
    for path in ("/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def _mix(a: tuple, b: tuple, t: float) -> tuple:
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _sky(d: ImageDraw.ImageDraw, s: Snapshot, top: int, bottom: int) -> None:
    day = max(0.0, min(1.0, (s.elev + 4) / 16))
    golden = max(0.0, 1 - abs(s.elev - 3) / 7) if s.elev > -4 else 0
    top_c = _mix((10, 16, 40), (58, 128, 205), day)
    bot_c = _mix((32, 52, 96), (190, 222, 250), day)
    if golden:
        bot_c = _mix(bot_c, (255, 170, 100), golden * 0.7)
    grey = s.cloud * 0.8
    top_c, bot_c = _mix(top_c, (110, 118, 128), grey * day), _mix(bot_c, (160, 168, 176), grey * day)
    for y in range(top, bottom):
        d.line([(0, y), (W, y)], fill=_mix(top_c, bot_c, (y - top) / max(1, bottom - top)))


def _glow(img: Image.Image, x: int, y: int, r: int, color: tuple, strength: float) -> None:
    """Soma um brilho difuso (luz ligada) à imagem."""
    if strength <= 0:
        return
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(layer).ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(c * strength) for c in color))
    layer = layer.filter(ImageFilter.GaussianBlur(r / 2.2))
    img.paste(ImageChops.add(img, layer))


def _brightness(s: Snapshot) -> float:
    return max(0.0, min(1.0, (s.elev + 6) / 14)) * (1 - 0.35 * s.cloud)


def _finish(img: Image.Image, s: Snapshot, rng: random.Random) -> bytes:
    night = _brightness(s) < 0.22
    if s.rain:
        d = ImageDraw.Draw(img)
        for _ in range(260):
            x, y = rng.randint(0, W), rng.randint(0, H)
            d.line([(x, y), (x - 6, y + 22)], fill=(200, 210, 225), width=1)
    if night:
        # Visão noturna (IR): tons de cinzento, ligeiro ruído e brilho
        g = ImageOps.grayscale(img)
        g = Image.eval(g, lambda v: min(255, int(v * 1.9 + 18)))
        noise = Image.effect_noise((W, H), 18).convert("L")
        g = Image.blend(g, noise, 0.08)
        img = Image.merge("RGB", (g, g, g))
    d = ImageDraw.Draw(img)
    f = _font(22)
    # Margem de 72 px: os cartões cortam as laterais da imagem
    pad = 72
    d.rectangle([0, 0, W, 44], fill=(0, 0, 0))
    d.text((pad, 10), _osd(s.label), font=f, fill=(255, 255, 255))
    d.text((W - pad - d.textlength(s.now, font=f), 10), s.now, font=f, fill=(255, 255, 255))
    if int(time.time()) % 2 == 0:
        d.ellipse([W - pad - d.textlength(s.now, font=f) - 30, 16, W - pad - d.textlength(s.now, font=f) - 16, 30], fill=(235, 50, 50))
    if s.motion:
        d.rectangle([pad, H - 56, pad + 234, H - 22], fill=(235, 170, 40))
        d.text((pad + 12, H - 52), "MOVIMENTO DETETADO", font=_font(18), fill=(0, 0, 0))
    if night:
        d.text((W - pad - 34, H - 48), "IR", font=f, fill=(255, 255, 255))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82)
    return buf.getvalue()


def _house_wall(d: ImageDraw.ImageDraw, br: float) -> None:
    wall = _mix((60, 58, 56), (236, 230, 220), br)
    d.rectangle([0, 170, W, 430], fill=wall)
    d.rectangle([0, 150, W, 172], fill=_mix((40, 40, 44), (120, 110, 100), br))


def render_entrada(s: Snapshot) -> bytes:
    rng = random.Random(int(time.time() // 2))
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    br = _brightness(s)
    _sky(d, s, 0, 170)
    _house_wall(d, br)
    # Porta
    d.rectangle([400, 220, 560, 430], fill=_mix((30, 22, 16), (120, 84, 52), br))
    d.rectangle([410, 230, 550, 420], outline=_mix((20, 14, 10), (92, 62, 38), br), width=4)
    d.ellipse([528, 318, 540, 330], fill=(200, 180, 120))
    # Janelas
    for x in (130, 700):
        light = s.lights.get("sala_teto", 0) if x == 130 else s.lights.get("escritorio_teto", 0)
        d.rectangle([x, 230, x + 150, 340], fill=_mix(_mix((20, 30, 50), (150, 190, 220), br), (255, 214, 150), light * (1 - br * 0.8)))
        d.line([(x + 75, 230), (x + 75, 340)], fill=_mix((30, 30, 30), (250, 250, 250), br), width=5)
    # Chão / caminho
    d.rectangle([0, 430, W, H], fill=_mix((24, 30, 22), (118, 146, 96), br))
    d.polygon([(400, 430), (560, 430), (660, H), (300, H)], fill=_mix((40, 38, 36), (190, 180, 168), br))
    # Vasos
    for x in (340, 600):
        d.rectangle([x, 380, x + 40, 430], fill=_mix((30, 30, 30), (90, 90, 96), br))
        d.ellipse([x - 16, 320, x + 56, 392], fill=_mix((14, 30, 16), (60, 128, 60), br))
    # Candeeiro da entrada
    d.rectangle([472, 190, 488, 212], fill=(50, 50, 50))
    lamp = s.lights.get("entrada", 0)
    if lamp:
        _glow(img, 480, 205, 150, (255, 196, 110), lamp * 0.9)
    if s.motion:
        # silhueta de estafeta com caixa
        d = ImageDraw.Draw(img)
        d.ellipse([612, 300, 652, 340], fill=(40, 40, 46))
        d.rounded_rectangle([600, 338, 664, 450], 14, fill=(52, 70, 110))
        d.rectangle([586, 380, 640, 420], fill=(178, 136, 80))
    return _finish(img, s, rng)


def render_jardim(s: Snapshot) -> bytes:
    rng = random.Random(int(time.time() // 2))
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    br = _brightness(s)
    _sky(d, s, 0, 260)
    # Colinas
    d.ellipse([-200, 180, 600, 420], fill=_mix((16, 26, 20), (96, 140, 90), br * 0.9))
    d.ellipse([380, 200, 1200, 440], fill=_mix((14, 24, 18), (84, 128, 80), br * 0.9))
    # Relvado
    d.rectangle([0, 300, W, H], fill=_mix((18, 34, 20), (104, 162, 82), br))
    # Piscina
    d.rounded_rectangle([520, 360, 900, 470], 18, fill=_mix((10, 30, 50), (70, 170, 210), br), outline=(220, 220, 220), width=6)
    for i in range(6):
        y = 380 + i * 14
        d.arc([540 + (i % 3) * 90, y, 640 + (i % 3) * 90, y + 16], 0, 180, fill=_mix((30, 60, 90), (170, 225, 245), br), width=2)
    # Árvores
    for x, h in ((90, 170), (260, 130), (440, 150)):
        d.rectangle([x - 8, 330 - 20, x + 8, 330 + 30], fill=_mix((20, 16, 12), (100, 70, 44), br))
        d.ellipse([x - h // 2, 330 - h, x + h // 2, 330 - 10], fill=_mix((12, 26, 14), (52, 110, 56), br))
    # Balizadores de jardim
    lamp = s.lights.get("jardim", 0)
    for x in (140, 330, 480):
        d.rectangle([x - 5, 430, x + 5, 470], fill=(60, 60, 60))
        if lamp:
            _glow(img, x, 432, 70, (255, 200, 120), lamp * 0.8)
    if s.motion:
        d = ImageDraw.Draw(img)
        # gato
        d.ellipse([300, 470, 360, 500], fill=(30, 30, 30))
        d.ellipse([350, 456, 378, 482], fill=(30, 30, 30))
        d.polygon([(354, 460), (358, 446), (364, 458)], fill=(30, 30, 30))
    return _finish(img, s, rng)


def render_garagem(s: Snapshot) -> bytes:
    rng = random.Random(int(time.time() // 2))
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    lamp = s.lights.get("garagem", 0)
    out_br = _brightness(s)
    br = max(0.12, lamp * 0.95)
    d.rectangle([0, 0, W, H], fill=_mix((20, 20, 22), (190, 188, 184), br))
    # Abertura do portão com o exterior visível na parte aberta
    gx0, gx1, gy0, gy1 = 180, 780, 70, 400
    open_h = int((gy1 - gy0) * s.garage / 100)
    sub = Image.new("RGB", (gx1 - gx0, gy1 - gy0))
    sd = ImageDraw.Draw(sub)
    for y in range(gy1 - gy0):
        sd.line([(0, y), (gx1 - gx0, y)], fill=_mix(_mix((10, 16, 40), (120, 180, 230), out_br), _mix((18, 26, 20), (110, 150, 96), out_br), y / (gy1 - gy0)))
    img.paste(sub, (gx0, gy0))
    # Painéis do portão (descem do topo quando fechado)
    d = ImageDraw.Draw(img)
    panel_top = gy0
    panel_bottom = gy1 - open_h
    if panel_bottom > panel_top:
        d.rectangle([gx0, panel_top, gx1, panel_bottom], fill=_mix((40, 40, 44), (205, 205, 210), br))
        y = panel_bottom
        while y > panel_top:
            d.line([(gx0, y), (gx1, y)], fill=_mix((20, 20, 24), (150, 150, 158), br), width=3)
            y -= 55
    d.rectangle([gx0 - 12, gy0 - 12, gx1 + 12, gy1], outline=_mix((20, 20, 20), (120, 116, 110), br), width=12)
    # Carro
    car = _mix((12, 20, 34), (38, 84, 150), br)
    d.rounded_rectangle([250, 330, 710, 470], 40, fill=car)
    d.rounded_rectangle([330, 270, 630, 350], 36, fill=car)
    d.rectangle([360, 285, 600, 340], fill=_mix((10, 12, 16), (70, 90, 110), br))
    for x in (320, 640):
        d.ellipse([x - 44, 430, x + 44, 518], fill=(18, 18, 18))
        d.ellipse([x - 20, 454, x + 20, 494], fill=_mix((40, 40, 40), (150, 150, 150), br))
    # Chão
    d.rectangle([0, 500, W, H], fill=_mix((16, 16, 18), (130, 128, 124), br))
    # Wallbox
    d.rounded_rectangle([830, 230, 900, 330], 10, fill=_mix((30, 30, 30), (240, 240, 240), br))
    d.ellipse([856, 250, 874, 268], fill=(60, 200, 120))
    if lamp:
        _glow(img, W // 2, 30, 260, (255, 244, 220), lamp * 0.5)
    return _finish(img, s, rng)


def render_mapa(s: Snapshot) -> bytes:
    img = Image.new("RGB", (W, H), (24, 28, 34))
    d = ImageDraw.Draw(img)
    rooms = [
        ("Sala", (60, 60, 470, 300)),
        ("Cozinha", (470, 60, 720, 300)),
        ("Escritório", (720, 60, 900, 300)),
        ("Entrada", (60, 300, 300, 480)),
        ("Corredor", (300, 300, 720, 480)),
        ("WC", (720, 300, 900, 480)),
    ]
    for _, r in rooms:
        d.rectangle(r, fill=(58, 66, 80), outline=(140, 150, 166), width=4)
    # Percurso de limpeza em "serpentina", proporcional à área limpa
    total = 86.0
    frac = max(0.0, min(1.0, s.area / total)) if s.vacuum != "docked" or s.area else 0
    path = []
    y = 80
    direction = 1
    while y < 470:
        xs = (80, 880) if direction > 0 else (880, 80)
        path += [(xs[0], y), (xs[1], y)]
        y += 26
        direction *= -1
    n = max(0, int(len(path) * frac))
    if n > 1:
        d.line(path[:n], fill=(96, 190, 255), width=16, joint="curve")
        d.line(path[:n], fill=(150, 220, 255), width=3)
    f = _font(20)
    for name, r in rooms:
        d.text((r[0] + 14, r[1] + 10), name, font=f, fill=(210, 216, 226))
    # Base e robô
    d.rounded_rectangle([88, 440, 140, 470], 6, fill=(240, 240, 240))
    pos = path[n - 1] if n > 1 and s.vacuum in ("cleaning", "paused") else (114, 420)
    d.ellipse([pos[0] - 20, pos[1] - 20, pos[0] + 20, pos[1] + 20], fill=(250, 250, 250), outline=(60, 200, 120), width=5)
    d.text((W - 300, H - 44), f"{s.area:.1f} m² limpos", font=f, fill=(210, 216, 226))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


RENDERERS = {"entrada": render_entrada, "jardim": render_jardim, "garagem": render_garagem}


def _snapshot(engine: Engine, label: str, motion_key: str | None) -> Snapshot:
    lights = {}
    for k, st in engine.lights.items():
        lights[k] = (st.brightness / 255 if st.brightness else 1.0) if st.on else 0.0
    return Snapshot(
        elev=engine.sun_elevation(),
        rain=engine.condition in ("rainy", "pouring"),
        cloud=engine.cloud,
        lights=lights,
        garage=engine.garage.position,
        motion=bool(motion_key and engine.motion.get(motion_key)),
        label=label,
        now=dt_util.now().strftime("%d/%m/%Y %H:%M:%S"),
        area=engine.vacuum["area"],
        vacuum=engine.vacuum["activity"],
    )


class CasaCamera(CasaEntity, Camera):
    _attr_frame_interval = 2.0

    def __init__(self, engine: Engine, cfg: dict) -> None:
        CasaEntity.__init__(self, engine, entity_id=f"camera.{cfg['id']}", unique_id=f"camera_{cfg['id']}",
                            device=device_info(f"camera_{cfg['id']}", cfg["name"], cfg["area"], "Câmara IP 4 MP"),
                            signal=f"motion_{cfg['id']}")
        Camera.__init__(self)
        self._cfg = cfg
        self._img_cache: tuple[float, bytes] | None = None

    async def async_camera_image(self, width: int | None = None, height: int | None = None) -> bytes | None:
        if self._img_cache and time.monotonic() - self._img_cache[0] < 1.0:
            return self._img_cache[1]
        snap = _snapshot(self.engine, self._cfg["name"], self._cfg["id"])
        data = await self.hass.async_add_executor_job(RENDERERS[self._cfg["scene"]], snap)
        self._img_cache = (time.monotonic(), data)
        return data


class CasaVacuumMap(CasaEntity, Camera):

    def __init__(self, engine: Engine) -> None:
        CasaEntity.__init__(self, engine, entity_id="camera.robo_mapa", unique_id="camera_robo_mapa",
                            device=device_info("robo", "Robô aspirador", "sala", "Robô com mapeamento LiDAR"),
                            name="Mapa", signal="vacuum")
        Camera.__init__(self)
        self.content_type = "image/png"

    async def async_camera_image(self, width: int | None = None, height: int | None = None) -> bytes | None:
        snap = _snapshot(self.engine, "Mapa", None)
        return await self.hass.async_add_executor_job(render_mapa, snap)
