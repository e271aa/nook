"""Constantes e descrição declarativa da casa simulada."""

from __future__ import annotations

DOMAIN = "casa_demo"
MANUFACTURER = "Casa Demo"

SIGNAL_TICK = f"{DOMAIN}_tick"
SIGNAL_DEVICE = f"{DOMAIN}_device_{{}}"

# 1 minuto real = SIM_SPEED minutos simulados nos eletrodomésticos (para a demo
# se ver a mexer sem esperar horas por uma lavagem).
SIM_SPEED = 12

PLATFORMS = [
    "binary_sensor",
    "button",
    "camera",
    "climate",
    "cover",
    "device_tracker",
    "light",
    "lock",
    "select",
    "sensor",
    "switch",
    "vacuum",
    "weather",
]

# ───────────── Estrutura da casa ─────────────

FLOORS = [
    {"id": "piso_0", "name": "Piso 0", "level": 0, "icon": "mdi:home-floor-0"},
    {"id": "piso_1", "name": "Piso 1", "level": 1, "icon": "mdi:home-floor-1"},
    {"id": "exterior", "name": "Exterior", "level": -1, "icon": "mdi:tree"},
]

AREAS = [
    {"id": "sala", "name": "Sala", "floor": "piso_0", "icon": "mdi:sofa"},
    {"id": "cozinha", "name": "Cozinha", "floor": "piso_0", "icon": "mdi:stove"},
    {"id": "escritorio", "name": "Escritório", "floor": "piso_0", "icon": "mdi:desk"},
    {"id": "entrada", "name": "Entrada", "floor": "piso_0", "icon": "mdi:door"},
    {"id": "garagem", "name": "Garagem", "floor": "piso_0", "icon": "mdi:garage"},
    {"id": "suite", "name": "Suite", "floor": "piso_1", "icon": "mdi:bed-king"},
    {"id": "quarto", "name": "Quarto", "floor": "piso_1", "icon": "mdi:bed"},
    {"id": "wc", "name": "Casa de banho", "floor": "piso_1", "icon": "mdi:shower"},
    {"id": "lavandaria", "name": "Lavandaria", "floor": "piso_1", "icon": "mdi:washing-machine"},
    {"id": "jardim", "name": "Jardim", "floor": "exterior", "icon": "mdi:flower"},
]

# mode: onoff | dim | ct | rgb
LIGHTS = [
    {"id": "sala_teto", "name": "Luz teto Sala", "area": "sala", "watts": 36, "mode": "ct", "on": True, "bri": 200},
    {"id": "sala_candeeiro", "name": "Candeeiro Sala", "area": "sala", "watts": 9, "mode": "rgb", "on": True, "bri": 150, "rgb": (255, 170, 90)},
    {"id": "sala_led_tv", "name": "Fita LED TV", "area": "sala", "watts": 14, "mode": "rgb", "on": False, "bri": 120, "rgb": (120, 90, 255)},
    {"id": "cozinha_teto", "name": "Luz teto Cozinha", "area": "cozinha", "watts": 30, "mode": "ct", "on": False, "bri": 255},
    {"id": "cozinha_bancada", "name": "Luz bancada", "area": "cozinha", "watts": 18, "mode": "dim", "on": True, "bri": 180},
    {"id": "escritorio_teto", "name": "Luz Escritório", "area": "escritorio", "watts": 24, "mode": "ct", "on": False, "bri": 230},
    {"id": "entrada", "name": "Luz Entrada", "area": "entrada", "watts": 12, "mode": "dim", "on": False, "bri": 200},
    {"id": "garagem", "name": "Luz Garagem", "area": "garagem", "watts": 40, "mode": "onoff", "on": False},
    {"id": "suite_teto", "name": "Luz teto Suite", "area": "suite", "watts": 30, "mode": "ct", "on": False, "bri": 210},
    {"id": "suite_cabeceira", "name": "Candeeiro cabeceira", "area": "suite", "watts": 6, "mode": "rgb", "on": False, "bri": 90, "rgb": (255, 150, 70)},
    {"id": "quarto_teto", "name": "Luz Quarto", "area": "quarto", "watts": 24, "mode": "ct", "on": False, "bri": 220},
    {"id": "wc_espelho", "name": "Luz espelho WC", "area": "wc", "watts": 16, "mode": "dim", "on": False, "bri": 255},
    {"id": "lavandaria", "name": "Luz Lavandaria", "area": "lavandaria", "watts": 18, "mode": "onoff", "on": False},
    {"id": "jardim", "name": "Luz Jardim", "area": "jardim", "watts": 60, "mode": "dim", "on": False, "bri": 180},
    {"id": "fachada", "name": "Luz Fachada", "area": "jardim", "watts": 40, "mode": "onoff", "on": False},
]

# travel = segundos de percurso completo (0 → 100 %)
COVERS = [
    {"id": "sala_janela", "name": "Estore Sala (janela)", "area": "sala", "travel": 22, "pos": 100},
    {"id": "sala_porta", "name": "Estore Sala (porta)", "area": "sala", "travel": 26, "pos": 60},
    {"id": "cozinha", "name": "Estore Cozinha", "area": "cozinha", "travel": 18, "pos": 100},
    {"id": "escritorio", "name": "Estore Escritório", "area": "escritorio", "travel": 20, "pos": 45},
    {"id": "suite", "name": "Estore Suite", "area": "suite", "travel": 22, "pos": 0},
    {"id": "quarto", "name": "Estore Quarto", "area": "quarto", "travel": 20, "pos": 30},
]

GARAGE = {"id": "portao_garagem", "name": "Portão Garagem", "area": "garagem", "travel": 14}

CLIMATES = [
    {"id": "sala", "name": "AC Sala", "area": "sala", "target": 22.0, "mode": "cool", "temp": 24.6},
    {"id": "escritorio", "name": "AC Escritório", "area": "escritorio", "target": 21.5, "mode": "off", "temp": 23.1},
    {"id": "suite", "name": "AC Suite", "area": "suite", "target": 21.0, "mode": "off", "temp": 22.4},
    {"id": "quarto", "name": "AC Quarto", "area": "quarto", "target": 21.0, "mode": "off", "temp": 22.0},
]

# Divisões com sensor de temperatura/humidade próprio (as do AC usam o mesmo valor)
ROOM_SENSORS = [
    {"id": "sala", "area": "sala", "temp": 24.6, "hum": 52},
    {"id": "cozinha", "area": "cozinha", "temp": 23.8, "hum": 58},
    {"id": "escritorio", "area": "escritorio", "temp": 23.1, "hum": 49},
    {"id": "suite", "area": "suite", "temp": 22.4, "hum": 51},
    {"id": "quarto", "area": "quarto", "temp": 22.0, "hum": 50},
    {"id": "wc", "area": "wc", "temp": 23.4, "hum": 64},
]

# Tomadas / interruptores com consumo
PLUGS = [
    {"id": "sala_tv", "name": "TV Sala", "area": "sala", "watts": 110, "icon": "mdi:television", "on": True, "circuit": "outros"},
    {"id": "escritorio_pc", "name": "Computador", "area": "escritorio", "watts": 165, "icon": "mdi:desktop-tower-monitor", "on": False, "circuit": "outros"},
    {"id": "cozinha_cafe", "name": "Máquina de café", "area": "cozinha", "watts": 45, "icon": "mdi:coffee-maker", "on": False, "circuit": "cozinha"},
    {"id": "wc_toalheiro", "name": "Toalheiro WC", "area": "wc", "watts": 300, "icon": "mdi:heating-coil", "on": False, "circuit": "climatizacao"},
    {"id": "rega", "name": "Rega Jardim", "area": "jardim", "watts": 550, "icon": "mdi:sprinkler-variant", "on": False, "circuit": "outros"},
]

MOTION = [
    {"id": "sala", "name": "Movimento Sala", "area": "sala"},
    {"id": "entrada", "name": "Movimento Entrada", "area": "entrada"},
    {"id": "garagem", "name": "Movimento Garagem", "area": "garagem"},
    {"id": "jardim", "name": "Movimento Jardim", "area": "jardim"},
]

CONTACTS = [
    {"id": "porta_entrada", "name": "Porta Entrada", "area": "entrada", "class": "door"},
    {"id": "janela_cozinha", "name": "Janela Cozinha", "area": "cozinha", "class": "window"},
    {"id": "janela_suite", "name": "Janela Suite", "area": "suite", "class": "window"},
]

CAMERAS = [
    {"id": "entrada", "name": "Câmara Entrada", "area": "entrada", "scene": "entrada"},
    {"id": "jardim", "name": "Câmara Jardim", "area": "jardim", "scene": "jardim"},
    {"id": "garagem", "name": "Câmara Garagem", "area": "garagem", "scene": "garagem"},
]

PEOPLE = [
    # Horário de ausência nos dias úteis (hora local, decimal)
    {"id": "ana", "name": "Ana", "away": (8.75, 18.25), "battery": 76},
    {"id": "miguel", "name": "Miguel", "away": (9.5, 13.0), "battery": 43},
]

WEATHER_OPTIONS = ["Automático", "Céu limpo", "Nublado", "Chuva"]

# Circuitos de consumo (para o gráfico de dispositivos da vista Energia)
CIRCUITS = [
    {"id": "iluminacao", "name": "Iluminação", "icon": "mdi:lightbulb-group"},
    {"id": "climatizacao", "name": "Climatização", "icon": "mdi:air-conditioner"},
    {"id": "cozinha", "name": "Cozinha", "icon": "mdi:stove"},
    {"id": "lavandaria", "name": "Lavandaria", "icon": "mdi:washing-machine"},
    {"id": "aguas_quentes", "name": "Águas quentes", "icon": "mdi:water-boiler"},
    {"id": "carregador_ve", "name": "Carregador VE", "icon": "mdi:ev-station"},
    {"id": "outros", "name": "Outros", "icon": "mdi:power-plug"},
]

# Programas dos eletrodomésticos: duração em minutos SIMULADOS
WASHER_PROGRAMS = {
    "Algodão 40°": {"min": 150, "temp": 40, "spin": 1200},
    "Eco 40-60": {"min": 210, "temp": 40, "spin": 1400},
    "Sintéticos": {"min": 110, "temp": 40, "spin": 1000},
    "Rápido 30'": {"min": 30, "temp": 30, "spin": 800},
    "Lãs": {"min": 60, "temp": 30, "spin": 600},
}
DRYER_PROGRAMS = {
    "Algodão armário": {"min": 140},
    "Sintéticos": {"min": 90},
    "Delicados": {"min": 60},
    "Refrescar": {"min": 20},
}
DISHWASHER_PROGRAMS = {
    "Eco 50°": {"min": 195},
    "Auto 45-65°": {"min": 150},
    "Intensivo 70°": {"min": 135},
    "Rápido 45°": {"min": 45},
}
OVEN_PROGRAMS = {
    "Ar forçado": {"temp": 180},
    "Convencional": {"temp": 200},
    "Grill": {"temp": 230},
    "Pizza": {"temp": 250},
    "Descongelar": {"temp": 40},
}
HOOD_SPEEDS = ["Desligado", "1", "2", "3", "Boost"]
