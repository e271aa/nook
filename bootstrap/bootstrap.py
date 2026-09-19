"""Bootstrap da demo (corre uma vez, só com a biblioteca padrão do Python).

1. Espera pelo Home Assistant.
2. Faz o onboarding (conta de administrador, localização, analytics, integrações).
3. Cria o utilizador "Visitante" (sem admin) através da integração casa_demo.
4. Se o mapeamento da entrada direta mudou, reinicia o HA uma vez.

É idempotente: pode correr quantas vezes quiser.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HA = os.environ.get("HA_URL", "http://homeassistant:8123").rstrip("/")
CLIENT_ID = f"{HA}/"
USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
PASSWORD = os.environ["ADMIN_PASSWORD"]
NAME = os.environ.get("ADMIN_NAME", "Administrador")


def log(msg: str) -> None:
    print(f"[bootstrap] {msg}", flush=True)


def call(method: str, path: str, *, data=None, token: str | None = None, form: bool = False):
    body = None
    headers = {}
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{HA}{path}", data=body, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def wait_for_ha() -> list[dict]:
    """Espera pelo HA e devolve o estado do onboarding.

    Depois do onboarding concluído o endpoint deixa de existir (404) — nesse
    caso devolvemos todos os passos como feitos.
    """
    for _ in range(180):
        try:
            return call("GET", "/api/onboarding")
        except urllib.error.HTTPError as err:
            if err.code in (404, 401, 403):
                return [{"step": s, "done": True} for s in ("user", "core_config", "analytics", "integration")]
            time.sleep(2)
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            time.sleep(2)
    log("O Home Assistant não respondeu a tempo.")
    sys.exit(1)


def token_from_code(code: str) -> str:
    res = call("POST", "/auth/token", data={"grant_type": "authorization_code", "code": code, "client_id": CLIENT_ID}, form=True)
    return res["access_token"]


def login() -> str:
    flow = call(
        "POST",
        "/auth/login_flow",
        data={"client_id": CLIENT_ID, "handler": ["homeassistant", None], "redirect_uri": CLIENT_ID},
    )
    res = call(
        "POST",
        f"/auth/login_flow/{flow['flow_id']}",
        data={"client_id": CLIENT_ID, "username": USERNAME, "password": PASSWORD},
    )
    if res.get("type") != "create_entry":
        log(f"Login de administrador falhou: {res.get('errors')}")
        sys.exit(1)
    return token_from_code(res["result"])


def main() -> None:
    steps = {s["step"]: s["done"] for s in wait_for_ha()}
    log(f"Onboarding: {steps}")

    if not steps.get("user"):
        res = call(
            "POST",
            "/api/onboarding/users",
            data={"client_id": CLIENT_ID, "name": NAME, "username": USERNAME, "password": PASSWORD, "language": "pt"},
        )
        token = token_from_code(res["auth_code"])
        log(f"Conta de administrador '{USERNAME}' criada.")
    else:
        token = login()

    if not steps.get("core_config"):
        call("POST", "/api/onboarding/core_config", token=token)
    if not steps.get("analytics"):
        call("POST", "/api/onboarding/analytics", token=token)
    if not steps.get("integration"):
        call("POST", "/api/onboarding/integration", data={"client_id": CLIENT_ID, "redirect_uri": CLIENT_ID}, token=token)
    log("Onboarding concluído.")

    # O casa_demo pode demorar uns segundos a registar o endpoint
    for _ in range(60):
        try:
            res = call("POST", "/api/casa_demo/visitante", data={}, token=token)
            break
        except urllib.error.HTTPError as err:
            if err.code != 404:
                raise
            time.sleep(2)
    else:
        log("Endpoint /api/casa_demo/visitante indisponível — a integração casa_demo arrancou?")
        sys.exit(1)

    log(f"Visitante pronto ({res['user_id']}).")

    # O onboarding cria integrações que não fazem parte da demo
    try:
        entries = call("GET", "/api/config/config_entries/entry", token=token) or []
        for entry in entries:
            if entry.get("domain") in ("met", "radio_browser", "shopping_list"):
                call("DELETE", f"/api/config/config_entries/entry/{entry['entry_id']}", token=token)
                log(f"Integração '{entry['domain']}' removida.")
    except urllib.error.HTTPError as err:
        log(f"Não foi possível limpar integrações do onboarding: {err}")
    if res.get("restart_needed"):
        log("A reiniciar o Home Assistant para ativar a entrada direta…")
        try:
            call("POST", "/api/services/homeassistant/restart", data={}, token=token)
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            pass  # a ligação cai durante o restart
    log("Pronto. Abre http://localhost:8123")


if __name__ == "__main__":
    main()
