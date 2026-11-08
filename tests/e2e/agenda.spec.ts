import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Agenda del prototipo: vistas de día, semana y equipo, y mover una cita con el botón «Mover…». */

async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
}
async function axeSerious(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

test("la agenda tiene vista de día, de semana y de equipo", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Day", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Week of");
  // En la semana, las columnas son los días (7 encabezados con el nombre del día).
  await expect(page.getByRole("button", { name: "Previous week" })).toBeVisible();

  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Who has room this week?" })).toBeVisible();
  await expect(page.getByRole("row")).not.toHaveCount(0);
  // Tocar una celda abre la semana de esa persona.
  await page.getByRole("button", { name: /% booked/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Week of");
  await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("mover una cita con «Mover…»: muestra por qué no se puede y bloquea el botón", async ({ page }) => {
  await page.goto("/dashboard");
  // Mañana siempre hay citas de ejemplo que todavía no empezaron.
  await page.getByRole("button", { name: "Next day" }).click();
  await page.locator("button.border-l-4").first().click();
  await page.getByRole("button", { name: "Move…" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Choose a change.")).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Confirm" });
  await expect(confirm).toBeDisabled();

  // Las 7:00 AM quedan fuera del horario del profesional: se rechaza con el motivo.
  await dialog.getByLabel("Time").selectOption({ index: 0 });
  await expect(dialog.getByText(/Outside .* hours|doesn't work that day|overlaps another appointment/)).toBeVisible();
  await expect(confirm).toBeDisabled();
});

test("acortar una cita se confirma y se puede deshacer", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Next day" }).click();
  await page.locator("button.border-l-4").first().click();
  await page.getByRole("button", { name: "Move…" }).click();

  const dialog = page.getByRole("dialog");
  // La primera duración (5 min) siempre cabe.
  await dialog.getByLabel("Duration").selectOption({ label: "5 min" });
  await expect(dialog.getByText("There's room: nobody else is booked then.")).toBeVisible();
  // Solo cambia la duración: la hora de inicio no cambia, así que no se pregunta por avisar.
  await expect(dialog.getByText("Notify the client")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Confirm" }).click();

  const toast = page.getByRole("status");
  await expect(toast).toContainText("Undo");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Change undone.");
});

test("cambiar la hora pregunta si avisar al cliente (marcado por defecto)", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Next day" }).click();
  await page.locator("button.border-l-4").first().click();
  await page.getByRole("button", { name: "Move…" }).click();

  const dialog = page.getByRole("dialog");
  const times = dialog.getByLabel("Time");
  const count = await times.locator("option").count();
  // Se prueban horas desde el final del día hasta encontrar una libre (el prototipo deja huecos cada día).
  let found = false;
  for (let i = count - 1; i >= 0 && !found; i--) {
    await times.selectOption({ index: i });
    found = await dialog.getByText("There's room: nobody else is booked then.").isVisible();
  }
  expect(found).toBe(true);
  await expect(dialog.getByText("Notify the client")).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toBeChecked();
});

test("estirar el borde de una cita (ratón) abre la confirmación con la duración nueva", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "movil", "Con el dedo se usa mantener pulsado o el botón «Mover…»");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Next day" }).click();
  const appt = page.locator("button.border-l-4").first();
  await expect(appt).toBeVisible();
  await appt.scrollIntoViewIfNeeded();
  const box = (await appt.boundingBox())!;
  // El borde de abajo es el tirador de duración: arrastrarlo hacia arriba acorta la cita (siempre cabe).
  const x = box.x + box.width / 2;
  await page.mouse.move(x, box.y + box.height - 3);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height - 12, { steps: 4 });
  await expect(page.getByText(/^✓ .* – /)).toBeVisible(); // aviso en vivo con la franja nueva
  await page.mouse.up();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("There's room: nobody else is booked then.")).toBeVisible();
  await expect(dialog.getByLabel("Duration")).not.toHaveValue("");
});

for (const view of ["Day", "Week", "Team"]) {
  test(`la agenda en vista ${view} no tiene problemas graves de accesibilidad`, async ({ page }) => {
    await page.goto("/dashboard");
    if (view !== "Day") await page.getByRole("button", { name: view, exact: true }).click();
    await page.waitForLoadState("networkidle");
    await settle(page);
    expect(await axeSerious(page)).toEqual([]);
  });
}
