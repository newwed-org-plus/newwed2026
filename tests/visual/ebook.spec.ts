import {expect,test} from '@playwright/test';
const origin=process.env.VISUAL_BASE_URL??'http://localhost:4173';

for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[768,1024],[1440,900]]) {
  test(`popup de Destinos acessível em ${width}px`,async({page})=>{
    await page.setViewportSize({width,height});
    await page.goto(`${origin}/destinos`,{waitUntil:'domcontentloaded'});
    const popup=page.getByRole('dialog',{name:'Noronha além do cenário'});
    await expect(popup).toBeVisible();
    for(const field of ['Nome completo','Nome da empresa','E-mail','WhatsApp com DDD']) await expect(popup.getByLabel(field,{exact:true})).toBeVisible();
    expect(await popup.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await expect(popup.getByRole('button',{name:'Fechar popup',exact:true})).toBeInViewport();
    if(width<=540 || height<=500) {
      const box=await popup.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(340);
      expect(box!.height).toBeLessThanOrEqual(Math.min(640,height-48));
    }
    await page.screenshot({path:test.info().outputPath('popup.png'),animations:'disabled'});
    await popup.getByRole('button',{name:'Agora não',exact:true}).click();
    await expect(popup).not.toBeVisible();
    await expect(page.getByRole('button',{name:'E-book gratuito',exact:true})).toBeFocused();
    await page.getByRole('button',{name:'E-book gratuito',exact:true}).click();
    await page.keyboard.press('Escape');
    await expect(popup).not.toBeVisible();
  });
}

test('pedido só confirma após resposta e falha permite tentar novamente',async({page})=>{
  let attempts=0;
  await page.route('**/api/public/config',route=>route.fulfill({json:{leadSubmissionEnabled:true,turnstileSiteKey:''}}));
  await page.route('**/api/public/ebook',route=>{
    attempts++;
    expect(route.request().postDataJSON()).toMatchObject({nome:'VALIDACAO Pessoa',empresa:'Empresa sintética',consent:{accepted:true}});
    return route.fulfill({status:attempts===1?503:200,json:attempts===1?{message:'Tente novamente.'}:{accepted:true,downloadUrl:null}});
  });
  await page.goto(`${origin}/destinos`,{waitUntil:'domcontentloaded'});
  const popup=page.getByRole('dialog');
  await popup.getByLabel('Nome completo',{exact:true}).fill('VALIDACAO Pessoa');
  await popup.getByLabel('Nome da empresa',{exact:true}).fill('Empresa sintética');
  await popup.getByLabel('E-mail',{exact:true}).fill('ebook@example.test');
  await popup.getByLabel('WhatsApp com DDD',{exact:true}).fill('81999990001');
  await popup.getByRole('checkbox').check();
  await popup.getByRole('button',{name:'Receber e-book',exact:true}).click();
  await expect(popup.getByRole('alert')).toHaveText('Tente novamente.');
  await expect(popup.getByText('Cadastro recebido!')).not.toBeVisible();
  await popup.getByRole('button',{name:'Receber e-book',exact:true}).click();
  await expect(popup.getByRole('status')).toContainText('Cadastro recebido!');
  await expect(popup.getByRole('status')).toContainText('ainda não está disponível');
  await expect(popup.getByRole('link',{name:'Baixar e-book'})).toHaveCount(0);
});

test('abre imediatamente sem avançar o relógio, mesmo após visita anterior',async({page})=>{
  await page.clock.install();
  await page.addInitScript(() => sessionStorage.setItem('newwed:ebook:noronha-alem-do-cenario','seen'));
  await page.goto(`${origin}/destinos`,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('button',{name:'E-book gratuito',exact:true})).toBeEnabled();
  // Deixa a hidratação terminar e congela os timers, sem avançar a antiga espera de 12s.
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()+100)));
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Fechar popup',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.clock.resume();
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goto(`${origin}/`,{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'E-book gratuito',exact:true})).toHaveCount(0);
});

test('abre também ao entrar por edição e âncora, sem reabrir após fechar na mesma página',async({page})=>{
  await page.goto(`${origin}/destinos?edicao=famtour-rn-abril-2027#form`,{waitUntil:'domcontentloaded'});
  const popup=page.getByRole('dialog',{name:'Noronha além do cenário'});
  await expect(popup).toBeVisible();
  await popup.getByRole('button',{name:'Fechar popup',exact:true}).click();
  await expect(popup).not.toBeVisible();
  await expect(page.getByRole('button',{name:'E-book gratuito',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'E-book gratuito',exact:true}).click();
  await expect(popup).toBeVisible();
});
