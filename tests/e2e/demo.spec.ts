import { expect, test } from "@playwright/test";

/**
 * Demo pública (/demo): mismos componentes del prototipo, con datos de ejemplo en el navegador.
 * En producción funciona aunque Supabase esté conectado; aquí se comprueba que la navegación no sale de /demo.
 */
test.describe("demo pública", () => {
  test("la puerta de negocios lleva a la demo", async ({ page }) => {
    await page.goto("/negocios");
    await page.getByRole("link", { name: /Try the demo/ }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole("heading", { name: "Try Breeze without an account." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create my business" }).last()).toHaveAttribute("href", "/signup/salon");
  });

  test("del cliente al salón sin salir de /demo", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("link", { name: /Client app/ }).click();
    await expect(page).toHaveURL(/\/demo\/explore$/);
    await page.locator('a[href^="/demo/s/"]').first().click();
    await expect(page).toHaveURL(/\/demo\/s\/[a-z0-9-]+/);
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("el panel de la demo navega dentro de /demo", async ({ page }) => {
    await page.goto("/demo/dashboard");
    // La franja de la demo (en el teléfono solo se ven sus enlaces) invita a crear el negocio.
    await expect(page.getByRole("link", { name: "Create my business" })).toHaveAttribute("href", "/signup/salon");
    await page.getByRole("link", { name: "Professionals" }).first().click();
    await expect(page).toHaveURL(/\/demo\/dashboard\/professionals$/);
    await expect(page.locator('a[href^="/live/"]')).toHaveCount(0);
  });

  test("Breeze Live abre en la demo", async ({ page }) => {
    const res = await page.goto("/demo/live/coral-salon");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("la demo no se indexa", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
