/* ─────────────────────────────────────────────────────────────────────────
 *  Casa OS — ligação ao Home Assistant.
 *  WebSocket para estados em tempo real e chamadas de serviço; REST para as
 *  estatísticas de energia. Reconecta sozinho se a ligação cair.
 * ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  const listeners = new Set();
  const statusListeners = new Set();
  const states = Object.create(null);

  let socket = null;
  let msgId = 1;
  const pending = new Map();
  let retry = 0;
  let status = "connecting";
  let token = window.CASA.token;

  function setStatus(next) {
    if (status === next) return;
    status = next;
    statusListeners.forEach((fn) => fn(next));
  }

  function emit(entityId) {
    listeners.forEach((fn) => fn(entityId));
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${proto}//${location.host}/api/websocket`);

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "auth_required") {
        socket.send(JSON.stringify({ type: "auth", access_token: token }));
        return;
      }
      if (msg.type === "auth_ok") {
        retry = 0;
        setStatus("online");
        send({ type: "subscribe_events", event_type: "state_changed" });
        send({ type: "get_states" }).then((all) => {
          (all || []).forEach((s) => {
            states[s.entity_id] = s;
          });
          emit("*");
        });
        return;
      }
      if (msg.type === "auth_invalid") {
        setStatus("unauthorized");
        socket.close();
        return;
      }
      if (msg.type === "result") {
        const waiting = pending.get(msg.id);
        if (waiting) {
          pending.delete(msg.id);
          msg.success ? waiting.resolve(msg.result) : waiting.reject(msg.error);
        }
        return;
      }
      if (msg.type === "event" && msg.event && msg.event.event_type === "state_changed") {
        const next = msg.event.data.new_state;
        const id = msg.event.data.entity_id;
        if (next) states[id] = next;
        else delete states[id];
        emit(id);
      }
    };

    socket.onclose = () => {
      if (status === "unauthorized") return;
      setStatus("offline");
      retry = Math.min(retry + 1, 6);
      setTimeout(connect, 500 * 2 ** retry);
    };
  }

  function send(payload) {
    return new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        reject(new Error("sem ligação"));
        return;
      }
      const id = msgId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ ...payload, id }));
    });
  }

  const HA = {
    get states() {
      return states;
    },
    get status() {
      return status;
    },

    /** Estado de uma entidade (ou null). */
    get(entityId) {
      return entityId ? states[entityId] || null : null;
    },

    /** Valor numérico de um sensor (ou null se não for número). */
    num(entityId) {
      const s = states[entityId];
      if (!s) return null;
      const v = parseFloat(s.state);
      return Number.isFinite(v) ? v : null;
    },

    attr(entityId, name, fallback = null) {
      const s = states[entityId];
      return s && s.attributes && s.attributes[name] !== undefined ? s.attributes[name] : fallback;
    },

    isOn(entityId) {
      const s = states[entityId];
      return !!s && (s.state === "on" || s.state === "open" || s.state === "playing");
    },

    isUnavailable(entityId) {
      const s = states[entityId];
      return !s || s.state === "unavailable" || s.state === "unknown";
    },

    name(entityId, fallback) {
      return HA.attr(entityId, "friendly_name", fallback || entityId);
    },

    /** Chama um serviço. Devolve uma promessa. */
    call(domain, service, entityId, data = {}) {
      const target = entityId ? { entity_id: entityId } : undefined;
      return send({
        type: "call_service",
        domain,
        service,
        service_data: data,
        ...(target ? { target } : {}),
      });
    },

    /** Avisado sempre que muda uma entidade ("*" no arranque). */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    onStatus(fn) {
      statusListeners.add(fn);
      fn(status);
      return () => statusListeners.delete(fn);
    },

    /** Estatísticas de longo prazo (energia). */
    async statistics(ids, start, end, period = "hour") {
      const params = new URLSearchParams({
        ids: ids.join(","),
        start: start.toISOString(),
        period,
      });
      if (end) params.set("end", end.toISOString());
      const res = await fetch(`/api/casa_os/statistics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    cameraUrl(entityId, bust) {
      return `/api/casa_os/camera/${entityId}?token=${encodeURIComponent(token)}&t=${bust}`;
    },
  };

  window.HA = HA;
  connect();
})();
