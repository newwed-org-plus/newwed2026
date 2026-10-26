import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const origin = (process.env.VISUAL_BASE_URL ?? "http://localhost:4173").replace(/\/$/, "");
test('informa o horário de renovação da cota sem atribuir a falha à senha',async({page})=>{
  await page.route('**/api/auth/login',route=>route.fulfill({status:503,json:{code:'DATABASE_UNAVAILABLE',reason:'DAILY_QUOTA',retryAt:'2026-10-27T00:00:00.000Z'}}));
  await page.goto(`${origin}/admin/login`);
  await page.getByLabel('E-mail',{exact:true}).fill('quota@example.test');
  await page.getByLabel('Senha',{exact:true}).fill('Synthetic-test-password!');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('O limite diário do banco foi atingido.');
  await expect(page.getByRole('alert')).toContainText('no seu horário local.');
  await expect(page.getByLabel('Senha',{exact:true})).toHaveValue('');
});
test.beforeAll(() => {
  if (process.env.VISUAL_BASE_URL) return;
  execFileSync("npx", ["wrangler", "d1", "migrations", "apply", "new-wed-platform-development", "--local"], { stdio: "pipe" });
  execFileSync("npx", ["tsx", "scripts/provision-admin.ts", "admin@example.test", "--local"], { input: "Synthetic-test-password!", stdio: ["pipe", "pipe", "pipe"] });
});

for (const [name, width, height] of [["mobile", 390, 844], ["tablet", 768, 1024], ["desktop", 1440, 900]] as const) {
  test(`${name} · login administrativo acessível e sem vazamento do painel`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/admin`);
    await expect(page).toHaveURL(`${origin}/admin/login`);
    await expect(page.getByRole("heading", { name: "Acesso ao painel." })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "E-mail", exact: true })).toBeVisible();
    await expect(page.getByLabel("Senha", { exact: true })).toHaveAttribute("type", "password");
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Pipeline", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/admin-login-${name}.png`, fullPage: true });
  });
}

test("login real, persistência após reload e logout revogam o acesso", async ({ page, context }) => {
  test.skip(Boolean(process.env.VISUAL_BASE_URL), "Usa somente usuário sintético local provisionado para esta suíte.");
  await page.goto(`${origin}/admin/login`);
  await page.getByLabel("E-mail", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
  await page.getByLabel("Senha", { exact: true }).fill("Synthetic-test-password!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/admin`);
  await expect(page.getByRole("button", { name: "Sair", exact: true })).toBeVisible();
  expect((await context.request.get(`${origin}/api/admin/me`)).status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Sair", exact: true })).toBeInViewport();
  await page.reload();
  await expect(page.getByRole("button", { name: "Sair", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/admin/login`);
  expect((await context.request.get(`${origin}/api/admin/me`)).status()).toBe(401);
  await page.goto(`${origin}/admin`);
  await expect(page).toHaveURL(`${origin}/admin/login`);
});
