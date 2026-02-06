// src/features/tacuen/analytics/client.ts
"use client";

const DEVICE_ID_KEY = "tacuen_device_id";

export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

export async function trackEvent(
  eventName: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const deviceId = getDeviceId();
  if (!deviceId) return;
  try {
    await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device_id: deviceId,
        event_name: eventName,
        metadata: metadata ?? {},
      }),
    });
  } catch {
    // best-effort; no-op
  }
}
