import { test, expect } from "@playwright/test";
test("mobile composer survives narrow screens and keyboard height; browser back navigates", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 650 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar prévia visual" }).click();
  await page
    .getByRole("button", { name: /DIGITALX Crew.*Bora pro próximo projeto/ })
    .click();
  await page.setViewportSize({ width: 320, height: 360 });
  await page.getByRole("textbox", { name: "Mensagem", exact: true }).focus();
  const b = await page.locator(".composer").boundingBox();
  expect(b!.y + b!.height).toBeLessThanOrEqual(361);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.goBack();
  await expect(
    page.getByRole("textbox", { name: "Buscar conversas", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(page).toHaveURL(/preview\/settings/);
  await page.getByRole("button", { name: /Conta Nome/ }).click();
  await expect(page).toHaveURL(/preview\/profile/);
});
