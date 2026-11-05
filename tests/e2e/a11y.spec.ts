import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accesibilidad automática (axe, WCAG 2.1 A/AA) en las pantallas públicas.
 * Solo falla con problemas "serious" o "critical": los menores se revisan a mano.
 */
const PAGES = ["/explore", "/s/island-fade", "/negocios", "/negocios/precios", "/privacy", "/login", "/no-existe-esta-pagina"];

for (const path of PAGES) {
  test(`${path} no tiene problemas graves de accesibilidad`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      serious.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`),
    ).toEqual([]);
  });
}

test("el último paso de la reserva (forma de pago y datos) es accesible", async ({ page }) => {
  await page.goto("/s/island-fade");
  await page.getByRole("button", { name: /Classic cut/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Carlos M\./ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /^\d{1,2}:\d{2} (AM|PM)$/ }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("How you'll pay")).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
});
