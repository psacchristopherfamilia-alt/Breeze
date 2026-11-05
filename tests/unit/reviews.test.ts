import { describe, expect, it } from "vitest";
import { alertText } from "@/lib/alerts";
import { authorLabel, isReviewRef, ratingLabel, reviewErrorKey, showRating } from "@/lib/reviews";

describe("promedio público", () => {
  it("no se muestra con menos de 3 reseñas", () => {
    expect(showRating(0)).toBe(false);
    expect(showRating(2)).toBe(false);
    expect(showRating(3)).toBe(true);
    expect(showRating(null)).toBe(false);
    expect(ratingLabel(5, 2)).toBeNull();
  });
  it("se muestra con un decimal", () => {
    expect(ratingLabel(4.5, 3)).toBe("4.5");
    expect(ratingLabel("4.8", 27)).toBe("4.8");
    expect(ratingLabel(5, 10)).toBe("5.0");
  });
  it("sin promedio o con un valor raro no rompe", () => {
    expect(ratingLabel(null, 10)).toBeNull();
    expect(ratingLabel("abc", 10)).toBeNull();
  });
});

describe("autor y errores", () => {
  it("una cuenta eliminada se muestra como «Cliente»", () => {
    expect(authorLabel("", "es")).toBe("Cliente");
    expect(authorLabel("  ", "en")).toBe("Customer");
    expect(authorLabel("Juan P.", "es")).toBe("Juan P.");
  });
  it("las claves de error conocidas pasan y lo demás es genérico", () => {
    expect(reviewErrorKey({ message: "too_early" })).toBe("too_early");
    expect(reviewErrorKey({ message: "comment_required" })).toBe("comment_required");
    expect(reviewErrorKey({ message: "relation reviews does not exist" })).toBe("generic");
    expect(reviewErrorKey(null)).toBe("generic");
  });
});

describe("enlace de reseña", () => {
  it("acepta el token del invitado (64 hex) o el id de una reserva", () => {
    expect(isReviewRef("ab".repeat(32))).toBe(true);
    expect(isReviewRef("00000000-0000-4000-8000-000000000301")).toBe(true);
  });
  it("rechaza todo lo demás", () => {
    for (const bad of ["", "abc", "AB".repeat(32), "ab".repeat(31), "../dashboard", "ab".repeat(32) + "x"]) expect(isReviewRef(bad)).toBe(false);
  });
});

describe("aviso de reseña", () => {
  const base = { customer_display: "Juan P.", service_en: "Cut", service_es: "Corte", pro_name: "Marcus T.", starts_at: "2027-01-12T15:00:00Z" };
  it("lleva las estrellas en el título y abre la página de reseñas", () => {
    const a = alertText({ ...base, kind: "review", rating: 4 }, "es");
    expect(a.title).toBe("Reseña nueva ★★★★☆");
    expect(a.body).toBe("Juan P. · Corte con Marcus T.");
    expect(a.href).toBe("/dashboard/reviews");
    expect(alertText({ ...base, kind: "review", rating: 1 }, "en").title).toBe("New review ★☆☆☆☆");
  });
  it("sin nota no rompe", () => {
    expect(alertText({ ...base, kind: "review" }, "en").title).toBe("New review");
  });
  it("las reservas siguen abriendo la agenda de su día", () => {
    expect(alertText({ ...base, kind: "booked" }, "en").href).toBe("/dashboard?date=2027-01-12");
  });
});
