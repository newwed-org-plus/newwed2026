import {expect,test} from "@playwright/test";

const origin = process.env.VISUAL_BASE_URL ?? "http://localhost:4173";
const slug = "famtour-alagoas-fevereiro-2027";
const checkoutId = "e7beae9b-8b7f-4a27-81e4-28dd58c6caae";
const sandbox = "https://sandbox.asaas.com/checkoutSession/show?id=8daef6e9-9954-418b-9d9d-3065b72b0cf4";
const session = {checkoutId,editionSlug:slug,checkoutUrl:null};

test("Garantir minha vaga retoma o mesmo pedido e abre o checkout Asaas",async ({page}) => {
  const keys:string[] = [];
  await page.route("**/api/public/config",route => route.fulfill({json:{publicCheckoutEnabled:true,turnstileSiteKey:"test-site-key"}}));
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",route => route.fulfill({
    contentType:"application/javascript",
    body:`window.turnstile = {
      render(element, options) { this.options = options; return "checkout-widget"; },
      reset() {}, remove() {},
      execute() { this.options.callback(this.options.action); }
    };`,
  }));
  await page.route("**/api/public/checkouts",route => {
    const request = route.request();
    expect(request.postDataJSON()).toEqual({editionSlug:slug,turnstileToken:"public_checkout"});
    keys.push(request.headers()["idempotency-key"]);
    if (keys.length===1) return route.fulfill({status:503,json:{message:"Tente novamente."}});
    return route.fulfill({status:202,json:{...session,status:"QUEUED"}});
  });
  await page.route(`**/api/public/checkouts/${checkoutId}`,route => route.fulfill({
    json:{...session,status:"READY",checkoutUrl:sandbox},
  }));
  await page.route(sandbox,route => route.fulfill({contentType:"text/html",body:"<h1>Checkout Sandbox</h1>"}));

  await page.goto(`${origin}/destinos#famtours`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button",{name:"Fechar popup",exact:true}).click();
  const button = page.locator("#famtours article").first().getByRole("button",{name:"Comprar agora · Garantir minha vaga"});
  await button.click();
  await expect(page.getByText("Tente novamente.",{exact:true})).toBeVisible();
  await page.locator("#famtours article").first().getByRole("link",{name:"Ver mais informações"}).click();
  await expect(page).toHaveURL(`${origin}/destinos/inscricao/${slug}`);
  await page.getByRole("button",{name:"Comprar agora · Garantir minha vaga"}).first().click();
  await expect(page).toHaveURL(sandbox);
  expect(keys).toEqual([keys[0],keys[0]]);
  expect(keys[0]).toMatch(/^[a-f0-9-]{36}$/);
});

test("retorno do Asaas confirma a vaga somente quando o pedido está pago",async ({page}) => {
  let paid = false;
  await page.route(`**/api/public/checkouts/${checkoutId}`,route => route.fulfill({
    json:{...session,status:paid ? "PAID" : "READY"},
  }));
  await page.goto(`${origin}/destinos/inscricao/${slug}?checkout=${checkoutId}&retorno=concluido`);
  const result = page.getByRole("region",{name:"Situação do pagamento"});
  await expect(result.getByRole("status")).toHaveText("Aguardando a confirmação do Asaas.");
  paid = true;
  await expect(result.getByRole("status")).toHaveText("Pagamento confirmado. Sua vaga está garantida.");
});
