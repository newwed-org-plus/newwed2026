import { z } from "zod";
import { publishedFamtourEditions,type FamtourPaymentMethod } from "@/content/famtour-editions";
import { HttpError } from "@/server/http";
import { asaasRequest,type AsaasEnvironment,type AsaasFetcher } from "@/server/integrations/asaas";

const checkoutMinutes = 15;
const siteOrigin = "https://newwed.com.br";
const checkoutIdSchema = z.string().uuid();
const asaasCheckoutEvents = ["CHECKOUT_CREATED","CHECKOUT_PAID","CHECKOUT_CANCELED","CHECKOUT_EXPIRED"] as const;

export const publicCheckoutEventType = z.enum(asaasCheckoutEvents);
export const publicCheckoutEventSchema = z.object({
  event:publicCheckoutEventType,
  checkout:z.object({
    id:checkoutIdSchema,
    externalReference:z.string().nullish(),
    callback:z.object({ successUrl:z.string().nullish() }).nullish(),
    items:z.array(z.object({ quantity:z.number().int().positive(),value:z.number().positive() })).nullish(),
  }),
});

type CheckoutDb = Pick<Env,"DB">;
type CheckoutStatus = "QUEUED"|"SUBMITTING"|"READY"|"PAID"|"CANCELED"|"EXPIRED"|"FAILED"|"PAYMENT_REVIEW";
type CheckoutRow = {
  id:string;
  edition_id:string;
  slug:string;
  edition_name:string;
  amount_cents:number;
  installment_count:number;
  payment_method:FamtourPaymentMethod|null;
  status:CheckoutStatus;
  provider_id:string|null;
  expires_at:string;
};

const checkoutQuery = `SELECT c.id,c.edition_id,c.amount_cents,c.installment_count,c.payment_method,c.status,c.provider_id,c.expires_at,
  e.slug,e.name AS edition_name FROM public_checkout_sessions c JOIN editions e ON e.id=c.edition_id`;

export function readPublicCheckout(env: CheckoutDb,id: string) {
  return env.DB.prepare(`${checkoutQuery} WHERE c.id=?`).bind(id).first<CheckoutRow>();
}

export async function existingPublicCheckout(env: CheckoutDb,key: string,editionSlug: string,paymentMethod?: FamtourPaymentMethod) {
  const session = await env.DB.prepare(`${checkoutQuery} WHERE c.idempotency_key=?`).bind(key).first<CheckoutRow>();
  if (session && session.slug !== editionSlug) {
    throw new HttpError(409,"IDEMPOTENCY_KEY_REUSED","Esta tentativa pertence a outra edição.");
  }
  if (session && paymentMethod && session.payment_method !== paymentMethod) {
    throw new HttpError(409,"CHECKOUT_METHOD_ALREADY_SELECTED","Já existe uma tentativa com outra forma de pagamento. Retome ou cancele essa tentativa para escolher novamente.");
  }
  return session;
}

export function publicCheckoutResponse(session: CheckoutRow,apiUrl: string) {
  const expired = Date.parse(session.expires_at) <= Date.now();
  const status = session.status === "SUBMITTING" ? "QUEUED"
    : session.status === "READY" && expired ? "AWAITING_CONFIRMATION" : session.status;
  const hostedOrigin = apiUrl === "https://api.asaas.com/v3" ? "https://asaas.com" : "https://sandbox.asaas.com";
  return {
    checkoutId:session.id,
    editionSlug:session.slug,
    paymentMethod:session.payment_method,
    status,
    checkoutUrl:status === "READY" && session.provider_id
      ? `${hostedOrigin}/checkoutSession/show?id=${encodeURIComponent(session.provider_id)}` : null,
    expiresAt:session.expires_at,
  };
}

export async function reservePublicCheckout(env: CheckoutDb,input: {
  key:string;editionSlug:string;paymentMethod:FamtourPaymentMethod;requestId:string;
}) {
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + checkoutMinutes * 60_000).toISOString();
  const offer = await env.DB.prepare(`SELECT e.id AS edition_id,p.id,p.amount_cents,p.installment_count
    FROM editions e JOIN price_batches p ON p.edition_id=e.id
    WHERE e.slug=? AND e.status='OPEN' AND p.active=1 AND p.amount_cents>0 AND p.installment_count BETWEEN 1 AND 12
      AND (p.valid_from IS NULL OR datetime(p.valid_from)<=datetime(?))
      AND (p.valid_until IS NULL OR datetime(p.valid_until)>datetime(?))
    ORDER BY p.created_at DESC,p.id LIMIT 1`)
    .bind(input.editionSlug,createdAt,createdAt)
    .first<{edition_id:string;id:string;amount_cents:number;installment_count:number}>();
  const price = publishedFamtourEditions.find(edition => edition.slug === input.editionSlug);
  if (!offer || !price || offer.amount_cents !== price.valorAVistaCentavos || offer.installment_count !== price.parcelaQuantidade) {
    throw new HttpError(422,"EDITION_UNAVAILABLE","Esta edição não está disponível para compra.");
  }
  const amount = input.paymentMethod === "PIX" ? price.valorAVistaCentavos : price.valorCartaoCentavos;
  const installments = input.paymentMethod === "PIX" ? 1 : price.parcelaQuantidade;

  const checkoutId = crypto.randomUUID();
  const outboxId = crypto.randomUUID();
  const [capacity] = await env.DB.batch([
    env.DB.prepare(`UPDATE availability SET reserved=reserved+1,version=version+1,updated_at=?
      WHERE edition_id=? AND reserved+sold<(SELECT capacity FROM editions WHERE id=? AND status='OPEN')
        AND EXISTS(SELECT 1 FROM price_batches WHERE id=? AND edition_id=availability.edition_id AND active=1
          AND amount_cents=? AND installment_count=?
          AND (valid_from IS NULL OR datetime(valid_from)<=datetime(?))
          AND (valid_until IS NULL OR datetime(valid_until)>datetime(?)))
        AND NOT EXISTS(SELECT 1 FROM public_checkout_sessions WHERE idempotency_key=?)`)
      .bind(createdAt,offer.edition_id,offer.edition_id,offer.id,offer.amount_cents,offer.installment_count,createdAt,createdAt,input.key),
    env.DB.prepare(`INSERT INTO public_checkout_sessions
      (id,idempotency_key,edition_id,price_batch_id,amount_cents,installment_count,payment_method,status,expires_at,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,'QUEUED',?,?,? WHERE changes()=1`)
      .bind(checkoutId,input.key,offer.edition_id,offer.id,amount,installments,input.paymentMethod,expiresAt,createdAt,createdAt),
    env.DB.prepare(`INSERT INTO outbox_events (id,type,aggregate_id,dedupe_key,payload_json,attempts,request_id,created_at)
      SELECT ?,'publicCheckout.create',?,?,?,0,?,? WHERE changes()=1`)
      .bind(outboxId,checkoutId,`publicCheckout.create:${checkoutId}`,JSON.stringify({checkoutId,requestId:input.requestId}),input.requestId,createdAt),
  ]);
  if (capacity.meta.changes === 1) {
    const checkout = await readPublicCheckout(env,checkoutId);
    if (!checkout) throw new Error("Reserved checkout not found");
    return {checkout,event:{id:outboxId,type:"publicCheckout.create",checkoutId,requestId:input.requestId}};
  }
  const existing = await existingPublicCheckout(env,input.key,input.editionSlug,input.paymentMethod);
  if (existing) return {checkout:existing};
  throw new HttpError(409,"CHECKOUT_UNAVAILABLE","A oferta ou a disponibilidade de vagas mudou. Atualize a página.");
}

function checkoutCallback(session: CheckoutRow,kind: "concluido"|"cancelado"|"expirado") {
  const url = new URL(`/destinos/inscricao/${encodeURIComponent(session.slug)}`,siteOrigin);
  url.searchParams.set("checkout",session.id);
  url.searchParams.set("retorno",kind);
  return url.href;
}

async function releasePublicReservation(env: CheckoutDb,id: string,status: "EXPIRED"|"CANCELED"|"FAILED",providerId: string|null = null) {
  const now = new Date().toISOString();
  const match = providerId ? "status IN ('SUBMITTING','READY')" : "status IN ('QUEUED','SUBMITTING')";
  await env.DB.batch([
    env.DB.prepare(`UPDATE public_checkout_sessions SET status=?,provider_id=coalesce(provider_id,?),updated_at=?
      WHERE id=? AND ${match} AND (provider_id IS NULL OR provider_id=?)`).bind(status,providerId,now,id,providerId),
    env.DB.prepare(`UPDATE availability SET reserved=reserved-1,version=version+1,updated_at=?
      WHERE changes()=1 AND reserved>0 AND edition_id=(SELECT edition_id FROM public_checkout_sessions WHERE id=?)`).bind(now,id),
  ]);
}

export async function createAsaasPublicCheckout(env: CheckoutDb & AsaasEnvironment,id: string,fetcher: AsaasFetcher = fetch) {
  const now = new Date();
  const nowIso = now.toISOString();
  const providerExpiry = new Date(now.getTime() + checkoutMinutes * 60_000).toISOString();
  const claim = await env.DB.prepare(`UPDATE public_checkout_sessions SET status='SUBMITTING',expires_at=?,updated_at=?
    WHERE id=? AND status='QUEUED' AND expires_at>?`).bind(providerExpiry,nowIso,id,nowIso).run();
  if (claim.meta.changes !== 1) return;
  const session = await readPublicCheckout(env,id);
  if (!session) throw new Error("Claimed checkout not found");

  try {
    const response = await asaasRequest<unknown>(env,"/checkouts",{
      method:"POST",
      body:JSON.stringify({
        billingTypes:session.payment_method ? [session.payment_method] : ["PIX","CREDIT_CARD"],
        chargeTypes:session.payment_method === "CREDIT_CARD" ? ["INSTALLMENT"]
          : session.installment_count>1 ? ["DETACHED","INSTALLMENT"] : ["DETACHED"],
        minutesToExpire:checkoutMinutes,
        externalReference:id,
        callback:{
          successUrl:checkoutCallback(session,"concluido"),
          cancelUrl:checkoutCallback(session,"cancelado"),
          expiredUrl:checkoutCallback(session,"expirado"),
        },
        items:[{name:session.edition_name,quantity:1,value:session.amount_cents/100}],
        ...(session.installment_count>1 ? {installment:{maxInstallmentCount:session.installment_count}} : {}),
      }),
    },fetcher);
    const providerId = z.object({id:checkoutIdSchema}).parse(response).id;
    await registerAsaasSession(env,id,providerId);
  } catch (error) {
    if (error instanceof HttpError && ["ASAAS_NOT_CONFIGURED","ASAAS_INVALID_ORIGIN","ASAAS_AUTH_FAILED","ASAAS_ENVIRONMENT_MISMATCH","ASAAS_PRODUCTION_BLOCKED_LOCAL"].includes(error.code)) {
      await releasePublicReservation(env,id,"FAILED");
      return {status:"FAILED"};
    }
    // A timeout can occur after creation. Never issue a second Asaas session for this order.
    return {uncertain:true};
  }
}

async function registerAsaasSession(env: CheckoutDb,id: string,providerId: string) {
  await env.DB.prepare(`UPDATE public_checkout_sessions SET provider_id=?,status='READY',updated_at=?
    WHERE id=? AND status='SUBMITTING' AND provider_id IS NULL`)
    .bind(providerId,new Date().toISOString(),id).run();
}

export async function expireUnissuedPublicCheckouts(env: CheckoutDb,now = new Date()) {
  const grace = new Date(now.getTime() - 60_000).toISOString();
  const stale = await env.DB.prepare(`SELECT id FROM public_checkout_sessions WHERE status IN ('QUEUED','SUBMITTING')
    AND provider_id IS NULL AND expires_at<=? ORDER BY expires_at LIMIT 10`).bind(grace).all<{id:string}>();
  for (const session of stale.results) await releasePublicReservation(env,session.id,"EXPIRED");
}

async function findAsaasSession(env: CheckoutDb,input: z.infer<typeof publicCheckoutEventSchema>["checkout"]) {
  const existing = await env.DB.prepare(`${checkoutQuery} WHERE c.provider_id=?`).bind(input.id).first<CheckoutRow>();
  if (existing) return existing;
  // Some versions of the event omit externalReference. The authenticated provider
  // can echo the return URL we supplied, which also contains the order identifier.
  const callback = URL.parse(input.callback?.successUrl ?? "");
  const reference = checkoutIdSchema.safeParse(input.externalReference ??
    (callback?.origin === siteOrigin ? callback.searchParams.get("checkout") : null));
  if (!reference.success) return null;
  const checkout = await readPublicCheckout(env,reference.data);
  if (!checkout || (checkout.provider_id && checkout.provider_id !== input.id) || checkout.status === "QUEUED") return null;
  return checkout;
}

export async function applyAsaasPublicCheckoutEvent(env: CheckoutDb,input: z.infer<typeof publicCheckoutEventSchema>) {
  const session = await findAsaasSession(env,input.checkout);
  if (!session) return false;
  const providerId = input.checkout.id;
  if (input.event === "CHECKOUT_CREATED") {
    await registerAsaasSession(env,session.id,providerId);
    return true;
  }
  if (input.event === "CHECKOUT_CANCELED" || input.event === "CHECKOUT_EXPIRED") {
    await releasePublicReservation(env,session.id,input.event === "CHECKOUT_CANCELED" ? "CANCELED" : "EXPIRED",providerId);
    return true;
  }
  const itemTotal = input.checkout.items?.reduce((sum,item) => sum + Math.round(item.value*100)*item.quantity,0);
  const now = new Date().toISOString();
  if (itemTotal !== undefined && itemTotal !== session.amount_cents) {
    await env.DB.prepare(`UPDATE public_checkout_sessions SET status='PAYMENT_REVIEW',provider_id=?,updated_at=?
      WHERE id=? AND status IN ('SUBMITTING','READY','CANCELED','EXPIRED','FAILED') AND (provider_id IS NULL OR provider_id=?)`)
      .bind(providerId,now,session.id,providerId).run();
    return true;
  }

  await env.DB.batch([
    env.DB.prepare(`UPDATE public_checkout_sessions SET status='PAID',provider_id=?,updated_at=?
      WHERE id=? AND status IN ('SUBMITTING','READY') AND (provider_id IS NULL OR provider_id=?)
        AND EXISTS(SELECT 1 FROM availability WHERE edition_id=public_checkout_sessions.edition_id AND reserved>0)`)
      .bind(providerId,now,session.id,providerId),
    env.DB.prepare(`UPDATE availability SET reserved=reserved-1,sold=sold+1,version=version+1,updated_at=?
      WHERE changes()=1 AND edition_id=?`).bind(now,session.edition_id),
    env.DB.prepare(`UPDATE public_checkout_sessions SET status='PAYMENT_REVIEW',provider_id=?,updated_at=?
      WHERE id=? AND status IN ('SUBMITTING','READY','CANCELED','EXPIRED','FAILED') AND (provider_id IS NULL OR provider_id=?)`)
      .bind(providerId,now,session.id,providerId),
  ]);
  return true;
}
