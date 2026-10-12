import { test, expect } from "@playwright/test";
test("login, responsive layout, navigation and honest call state", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Entrar com Google" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `evidence/${testInfo.project.name}-login.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Explorar prévia visual" }).click();
  await expect(
    page.getByRole("button", { name: "Nova conversa", exact: true }).first(),
  ).toBeVisible();
  const mobile = ["android", "iphone"].includes(testInfo.project.name);
  if (mobile)
    await page
      .getByRole("button", { name: /DIGITALX Crew.*Bora pro próximo projeto/ })
      .click();
  await expect(
    page.getByRole("textbox", { name: "Mensagem", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("PRÉVIA VISUAL · DADOS DEMONSTRATIVOS"),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const composer = await page.locator(".composer").boundingBox();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height + 1,
  );
  await expect(
    page.getByText("Já deixei tudo no drive. ✅", { exact: false }),
  ).toBeInViewport();
  await page.screenshot({
    path: `evidence/${testInfo.project.name}-chat.png`,
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "Mensagem", exact: true })
    .fill("Uma ideia real.");
  await page
    .getByRole("button", { name: "Enviar mensagem", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("entre com Google");
  if (mobile) await expect(page.getByRole('button', {name:'Chamada de vídeo'})).toBeHidden();
  await page.getByRole("button", { name: mobile ? "Chamada de áudio" : "Chamada de vídeo" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Não há uma chamada ativa.",
  );
  const call = page.getByRole("dialog");
  await expect(call.getByRole("button", { name: "Microfone — infraestrutura pendente" })).toBeDisabled();
  await expect(call.getByRole("button", { name: "Câmera — infraestrutura pendente" })).toBeDisabled();
  await expect(call.getByText("Dispositivos verificados")).toHaveCount(0);
  const callBounds = await call.boundingBox();
  expect(callBounds!.x).toBe(0);
  expect(callBounds!.y).toBe(0);
  expect(callBounds!.width).toBe(page.viewportSize()!.width);
  expect(callBounds!.height).toBe(page.viewportSize()!.height);
  await page.screenshot({ path: `evidence/${testInfo.project.name}-group-call-pending.png`, fullPage: false });
  await expect(call.getByRole("button", { name: "Voltar à conversa", exact: true })).toBeInViewport();
  const callBack = call.getByRole("button", { name: "Voltar à conversa", exact: true });
  expect((await callBack.boundingBox())!.y + (await callBack.boundingBox())!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  await page.screenshot({ path: `evidence/${testInfo.project.name}-group-call-pending.png`, fullPage: false });
  if (mobile) {
    const original = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 568 });
    await callBack.scrollIntoViewIfNeeded();
    await expect(call.getByRole("button", { name: "Voltar à conversa", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.setViewportSize(original);
    await call.getByRole("button", { name: "Fechar janela" }).scrollIntoViewIfNeeded();
  }
  await page.getByRole("button", { name: "Fechar janela" }).click();
  if (mobile) {
    await page.getByRole("button", { name: "Voltar às conversas" }).click();
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Instalar DIGITALX/ }),
  ).toBeVisible();
  await page.screenshot({
    path: `evidence/${testInfo.project.name}-settings.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("search, filters, group members and upload validation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar prévia visual" }).click();
  await page
    .getByRole("textbox", { name: "Buscar conversas", exact: true })
    .fill("não existe");
  await expect(page.getByText("Nenhuma conversa encontrada")).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await page
    .getByRole("button", { name: /DIGITALX Crew.*Bora pro próximo projeto/ })
    .click();
  await page.getByRole("button", { name: "Informações da conversa" }).click();
  await expect(page.getByRole("dialog")).toContainText("Membros");
  await expect(
    page.getByRole("dialog").getByText("Criador", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar janela" }).click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "bad.html",
      mimeType: "text/html",
      buffer: Buffer.from("<script>bad</script>"),
    });
  await expect(page.getByRole("alert")).toContainText(
    "Tipo de arquivo não permitido",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
