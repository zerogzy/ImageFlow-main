const API_KEY_KEY = "imageflow_api_key";
const CONNECTION_KEY = "imageflow_connections";
const HEARTBEAT_KEY = "imageflow_heartbeat";
const HEARTBEAT_INTERVAL = 5000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function addConnection(): void {
  if (typeof window === "undefined") return;
  const count = parseInt(localStorage.getItem(CONNECTION_KEY) || "0", 10);
  localStorage.setItem(CONNECTION_KEY, String(count + 1));
  updateHeartbeat();
}

function removeConnection(): void {
  if (typeof window === "undefined") return;
  const count = parseInt(localStorage.getItem(CONNECTION_KEY) || "1", 10);
  const newCount = count - 1;
  if (newCount <= 0) {
    localStorage.removeItem(CONNECTION_KEY);
    localStorage.removeItem(HEARTBEAT_KEY);
    localStorage.removeItem(API_KEY_KEY);
  } else {
    localStorage.setItem(CONNECTION_KEY, String(newCount));
  }
}

function updateHeartbeat(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
    }, HEARTBEAT_INTERVAL);
  }
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function isSessionActive(): boolean {
  if (typeof window === "undefined") return false;
  const heartbeat = localStorage.getItem(HEARTBEAT_KEY);
  if (!heartbeat) return false;
  const elapsed = Date.now() - parseInt(heartbeat, 10);
  return elapsed < HEARTBEAT_INTERVAL * 3;
}

if (typeof window !== "undefined") {
  if (!isSessionActive()) {
    localStorage.removeItem(CONNECTION_KEY);
    localStorage.removeItem(HEARTBEAT_KEY);
    localStorage.removeItem(API_KEY_KEY);
  }

  addConnection();

  window.addEventListener("beforeunload", () => {
    removeConnection();
    stopHeartbeat();
  });

  window.addEventListener("pagehide", () => {
    removeConnection();
    stopHeartbeat();
  });
}

export const getApiKey = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(API_KEY_KEY);
};

export const setApiKey = (apiKey: string): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem(API_KEY_KEY, apiKey);
  updateHeartbeat();
};

export const removeApiKey = (): void => {
  if (typeof window === "undefined") return;
  stopHeartbeat();
  localStorage.removeItem(API_KEY_KEY);
  localStorage.removeItem(CONNECTION_KEY);
  localStorage.removeItem(HEARTBEAT_KEY);
};

export const validateApiKey = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await fetch("/api/validate-api-key", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.valid === true;
  } catch (error) {
    console.error("API Key validation error:", error);
    return false;
  }
};
