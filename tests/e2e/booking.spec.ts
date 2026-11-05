import { expect, test } from "@playwright/test";

/** Reserva como invitado en el prototipo: servicio → profesional → hora → datos → confirmar. */
test("un invitado reserva un corte y después esa hora ya no está libre", async ({ page }) => {
  await page.goto("/s/island-fade");
  await page.getByRole("button", { name: /Classic cut/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Carlos M\./ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  const slots = page.getByRole("button", { name: /^\d{1,2}:\d{2} (AM|PM)$/ });
  await expect(slots.first()).toBeVisible();
  const first = (await slots.first().innerText()).trim();
  await slots.first().click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Continue as guest" }).click();
  const [firstName, lastName] = await page.locator("input[type=text]").all();
  await firstName.fill("Ashley");
  await lastName.fill("Taylor");
  await page.locator("input[type=tel]").fill("649 555 0123");
  await page.locator("input[type=checkbox]").check();
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByText(/booked|confirmed|you're all set/i).first()).toBeVisible();

  // Misma profesional, mismo día: la hora reservada ya no se ofrece (nunca hay doble reserva).
  await page.goto("/s/island-fade");
  await page.getByRole("button", { name: /Classic cut/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Carlos M\./ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: first, exact: true })).toHaveCount(0);
});
