import { describe, expect, it } from "vitest";
import { alertText, type AlertRow } from "@/lib/alerts";
import { pushPayload, sendAlertPush, type PushSub } from "@/lib/push";

const alert: AlertRow = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "booked",
  customer_display: "Ashley T.",
  service_en: "Classic cut",
  service_es: "Corte clásico",
  pro_name: "Carlos M.",
  starts_at: "2026-11-05T17:30:00Z", // 12:30 PM en Turks and Caicos
  created_at: "2026-11-04T12:00:00Z",
  read_at: null,
};

describe("texto de los avisos", () => {
  it("en inglés y español, con la hora de Turks and Caicos y sin datos privados", () => {
    expect(alertText(alert, "en")).toEqual({ title: "New booking", body: "Ashley T. · Classic cut with Carlos M. · Thu, Nov 5, 12:30 PM", dateKey: "2026-11-05" });
    expect(alertText({ ...alert, kind: "cancelled" }, "es")).toMatchObject({ title: "Reserva cancelada", body: expect.stringContaining("Corte clásico con Carlos M.") });
    expect(alertText({ ...alert, kind: "rescheduled" }, "es").title).toBe("Reserva cambiada");
  });

  it("aguanta datos vacíos", () => {
    expect(alertText({ ...alert, customer_display: "", pro_name: "", service_es: "" }, "es").body).toBe("Classic cut · jue 5 nov., 12:30 PM");
  });

  it("el push abre la agenda del día de la cita", () => {
    expect(pushPayload(alert, "en")).toMatchObject({ url: "/dashboard?date=2026-11-05", tag: alert.id, title: "New booking" });
  });
});

describe("envío del push", () => {
  const subs: PushSub[] = [
    { id: "s1", endpoint: "https://push.example/1", p256dh: "k1", auth: "a1" },
    { id: "s2", endpoint: "https://push.example/2", p256dh: "k2", auth: "a2" },
    { id: "s3", endpoint: "https://push.example/3", p256dh: "k3", auth: "a3" },
  ];

  it("envía a cada teléfono con su propia llave", async () => {
    const seen: string[] = [];
    const r = await sendAlertPush(alert, "en", subs, { send: async (s, payload) => void seen.push(`${s.endpoint}|${s.keys.p256dh}|${JSON.parse(payload).title}`) });
    expect(r).toEqual({ sent: 3, failed: 0, gone: [] });
    expect(seen.sort()).toEqual(["https://push.example/1|k1|New booking", "https://push.example/2|k2|New booking", "https://push.example/3|k3|New booking"]);
  });

  it("marca para borrar los teléfonos que ya no existen y sigue con los demás", async () => {
    const r = await sendAlertPush(alert, "es", subs, {
      send: async (s) => {
        if (s.endpoint.endsWith("/1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
        if (s.endpoint.endsWith("/2")) throw Object.assign(new Error("not found"), { statusCode: 404 });
        if (s.endpoint.endsWith("/3")) throw Object.assign(new Error("boom"), { statusCode: 500 });
      },
    });
    expect(r.gone.sort()).toEqual(["s1", "s2"]);
    expect(r).toMatchObject({ sent: 0, failed: 1 });
  });
});
