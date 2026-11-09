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

  // Antes de confirmar, el cliente ve cómo pagará a ese profesional.
  await expect(page.getByText("How you'll pay")).toBeVisible();
  await expect(page.getByText("Cash", { exact: true })).toBeVisible();
  await expect(page.getByText("Card", { exact: true })).toBeVisible();
  await expect(page.getByText("Bank transfer", { exact: true })).toBeVisible();
  await expect(page.getByText(/Demo Bank/)).toBeVisible();

  await page.getByRole("button", { name: "Continue as guest" }).click();
  const [firstName, lastName] = await page.locator("input[type=text]").all();
  await firstName.fill("Ashley");
  await lastName.fill("Taylor");
  await page.locator("input[type=tel]").fill("649 555 0123");
  // Solo correo por ahora: la casilla de WhatsApp no se ofrece y el correo se pide como recomendado.
  await expect(page.locator("input[type=checkbox]")).toHaveCount(0);
  await expect(page.getByText(/won.t get reminders|no recibirás recordatorios/i)).toBeVisible();
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByText(/booked|confirmed|you're all set/i).first()).toBeVisible();
  // La confirmación repite los datos de pago.
  await expect(page.getByText(/Demo Bank/)).toBeVisible();

  // Y ayuda a llegar: mapa, teléfono y calendario.
  const directions = page.getByRole("link", { name: "Directions" });
  await expect(directions).toHaveAttribute("href", /google\.com\/maps\/search\/\?api=1&query=Island%20Fade%20Barbershop/);
  await expect(page.getByRole("link", { name: "Call the salon" })).toHaveAttribute("href", /^tel:\+1649/);
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByRole("link", { name: "Google Calendar" })).toHaveAttribute("href", /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /\.ics file/ }).click()]);
  expect(download.suggestedFilename()).toBe("breeze-booking.ics");

  // Misma profesional, mismo día: la hora reservada ya no se ofrece (nunca hay doble reserva).
  await page.goto("/s/island-fade");
  await page.getByRole("button", { name: /Classic cut/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Carlos M\./ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: first, exact: true })).toHaveCount(0);
});

/** Un domingo (cerrado) la reserva no deja al cliente en un día sin huecos: salta al primer día disponible. */
test("si hoy no hay huecos (domingo), la reserva muestra el primer día con horas libres", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-08T15:00:00Z")); // domingo 10:00 en Turks and Caicos
  await page.goto("/s/island-fade");
  await page.getByRole("button", { name: /Classic cut/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Carlos M\./ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  const slots = page.getByRole("button", { name: /^\d{1,2}:\d{2} (AM|PM)$/ });
  await expect(slots.first()).toBeVisible();
  await expect(page.getByText("No availability this day. Try another date.")).toHaveCount(0);
});
