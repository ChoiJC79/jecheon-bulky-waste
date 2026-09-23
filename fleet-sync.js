const FLEET_POLL_MS = 3000;

export function connectFleetSync({ deviceId = "", onEvent, onSnapshot, pollMs = FLEET_POLL_MS } = {}) {
  let since = 0;
  let source = null;
  let pollTimer = null;
  let stopped = false;
  let usingSse = false;

  function params(extra = {}) {
    const search = new URLSearchParams();
    if (deviceId) search.set("deviceId", deviceId);
    search.set("since", String(since));
    for (const [key, value] of Object.entries(extra)) {
      if (value != null && value !== "") search.set(key, String(value));
    }
    return search.toString();
  }

  async function snapshot() {
    const response = await fetch(`/api/fleet?${params()}`);
    if (!response.ok) throw new Error("태블릿 현황을 불러오지 못했습니다.");
    const data = await response.json();
    if (Number.isFinite(data.syncSeq)) since = Math.max(since, data.syncSeq);
    onSnapshot?.(data);
    return data;
  }

  function handleEvent(event) {
    if (!event) return;
    if (Number.isFinite(event.seq)) since = Math.max(since, event.seq);
    onEvent?.(event);
  }

  function startSse() {
    if (stopped || typeof EventSource === "undefined") return;
    source = new EventSource(`/api/fleet/events?${params()}`);
    source.addEventListener("hello", () => {
      usingSse = true;
    });
    source.addEventListener("fleet", (message) => {
      usingSse = true;
      try { handleEvent(JSON.parse(message.data)); } catch { /* ignore */ }
      snapshot().catch(() => {});
    });
    source.onerror = () => {
      usingSse = false;
    };
  }

  async function pollTick() {
    if (stopped) return;
    try {
      await snapshot();
    } catch {
      usingSse = false;
    }
  }

  snapshot().catch(() => {}).finally(() => {
    if (stopped) return;
    startSse();
    pollTimer = setInterval(pollTick, pollMs);
  });

  return {
    refresh: snapshot,
    stop() {
      stopped = true;
      if (source) source.close();
      if (pollTimer) clearInterval(pollTimer);
    }
  };
}

export function formatLastSeen(lastSeenAt) {
  if (!lastSeenAt) return "미접속";
  const ts = Date.parse(lastSeenAt);
  if (!Number.isFinite(ts)) return "미접속";
  const delta = Date.now() - ts;
  if (delta < 15000) return "방금";
  if (delta < 60000) return `${Math.max(1, Math.round(delta / 1000))}초 전`;
  if (delta < 3600000) return `${Math.max(1, Math.round(delta / 60000))}분 전`;
  return new Date(ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}
