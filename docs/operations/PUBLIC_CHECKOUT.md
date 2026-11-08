# Checkout público do Famtour

## Contrato para o site

- Consulte `GET /api/public/config` para obter `publicCheckoutEnabled` e `turnstileSiteKey`.
- `POST /api/public/checkouts` com `Idempotency-Key: <UUID aleatório>` e JSON `{ "editionSlug": "...", "turnstileToken": "..." }`. O Turnstile usa a ação `public_checkout`. Use a mesma chave ao repetir a mesma tentativa e outra chave para uma nova tentativa após falha, cancelamento ou expiração.
- HTTP 202 inicia a reserva. HTTP 200 devolve a mesma reserva para uma repetição. Os campos são `checkoutId`, `editionSlug`, `status`, `checkoutUrl` e `expiresAt`. O site consulta `GET /api/public/checkouts/{checkoutId}` enquanto `status` for `QUEUED`. O prazo começa de novo quando o consumidor inicia a solicitação ao Asaas.
- Redirecione para `checkoutUrl` quando o status for `READY` e houver URL. O Asaas apresenta Pix e cartão até o limite do lote. O comprador fornece os dados diretamente ao Asaas.
- O Asaas volta a `/destinos/inscricao/{editionSlug}?checkout={checkoutId}&retorno={concluido|cancelado|expirado}`. Consulte o GET antes de mostrar confirmação. `AWAITING_CONFIRMATION` indica que o prazo do link acabou e o evento do provedor ainda não chegou. Só `PAID` representa compra confirmada. `PAYMENT_REVIEW` deve encaminhar o comprador ao atendimento com o identificador do checkout.

## Operação

- O preço vem do lote ativo e a reserva usa a mesma disponibilidade da venda assistida. O Worker comercial guarda a chave Asaas. A aplicação usa fila existente e nunca recebe dados de cartão ou CPF deste checkout.
- Cadastre um webhook exclusivo para `https://newwed.com.br/api/webhooks/asaas/checkout` com envio sequencial e os eventos `CHECKOUT_CREATED`, `CHECKOUT_PAID`, `CHECKOUT_CANCELED` e `CHECKOUT_EXPIRED`. O token próprio vai no secret `ASAAS_CHECKOUT_WEBHOOK_TOKEN` do Worker web. O webhook do Base44 é independente.
- Ative `ENABLE_PUBLIC_CHECKOUT` no comercial e depois no web, após homologar Pix e cartão parcelado e verificar a entrega autenticada dos quatro eventos. Em uma pausa, desligue a criação no web primeiro e mantenha a recepção de eventos. Os checkouts assistidos usam flags próprias.
- A vaga de um link emitido só é liberada por cancelamento ou expiração confirmados pelo Asaas. Sessões sem link são liberadas após o prazo pelo consumidor. Antes de liberar uma reserva de link emitido por intervenção operacional, confira o status da sessão e das cobranças no Asaas. Use a coluna `provider_id` em `public_checkout_sessions` para correlacionar a venda. Pagamento após liberação ou valor divergente exige revisão humana. Estornos de compras diretas são tratados no Asaas e precisam de conciliação manual da vaga.
