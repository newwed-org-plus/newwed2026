"use client";

import { useEffect,useId,useRef,useState,useSyncExternalStore } from "react";
import type { FamtourEdition,FamtourPaymentMethod } from "@/content/famtour-editions";
import { formatCurrency } from "../lib/famtours";
import { getTurnstileToken,removeTurnstile } from "../turnstile";

const messages = {
  PAID:"Pagamento confirmado. Sua vaga está garantida.",
  CANCELED:"Pagamento cancelado. Você pode tentar novamente.",
  EXPIRED:"O prazo do pagamento terminou. Você pode tentar novamente.",
  FAILED:"Não foi possível abrir o pagamento. Tente novamente.",
  PAYMENT_REVIEW:"O pagamento está em análise. Fale com a equipe New Wed e informe o código do pedido.",
};

type FinalStatus = keyof typeof messages;
type Checkout = {
  checkoutId:string;
  editionSlug:string;
  paymentMethod:FamtourPaymentMethod|null;
  status:"QUEUED"|"READY"|"AWAITING_CONFIRMATION"|FinalStatus;
  checkoutUrl:string|null;
};

const subscribe = () => () => {};
const pause = () => new Promise<void>(resolve => setTimeout(resolve,2000));
const finished = (checkout:Checkout) => Object.hasOwn(messages,checkout.status);
const canRetry = (checkout:Checkout) => ["CANCELED","EXPIRED","FAILED"].includes(checkout.status);

async function checkoutRequest(url:string,signal:AbortSignal,init?:RequestInit):Promise<Checkout> {
  const response = await fetch(url,{...init,signal,cache:"no-store"});
  if (!response.ok) {
    const data = await response.json().catch(() => null) as {message?:string}|null;
    throw new Error(data?.message ?? "O pagamento está temporariamente indisponível. Tente novamente.");
  }
  return await response.json() as Checkout;
}

function readCheckout(id:string,signal:AbortSignal) {
  return checkoutRequest(`/api/public/checkouts/${encodeURIComponent(id)}`,signal);
}

const purchaseClass = "inline-flex min-h-12 items-center justify-center bg-[var(--color-destinos-turquoise)] px-5 py-3 text-center font-sans text-sm font-semibold text-[var(--color-destinos-ink)] hover:bg-[#8AB8B7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-destinos-ink)] disabled:opacity-60";

function checkoutDestination(url: string) {
  const destination = new URL(url);
  if (!["https://asaas.com","https://sandbox.asaas.com"].includes(destination.origin) || destination.pathname !== "/checkoutSession/show") {
    throw new Error("O endereço de pagamento é inválido. Fale com a equipe New Wed.");
  }
  return destination.href;
}

function clearAttempt(keyName: string) {
  sessionStorage.removeItem(keyName);
  sessionStorage.removeItem(`${keyName}.id`);
  sessionStorage.removeItem(`${keyName}.method`);
}

type PaymentOffer = Pick<FamtourEdition,"slug"|"valorAVistaCentavos"|"valorCartaoCentavos"|"parcelaCentavos"|"parcelaQuantidade">;

export function FamtourCheckoutButton({edition,className}: {edition:PaymentOffer;className?:string}) {
  const {slug,valorAVistaCentavos,valorCartaoCentavos,parcelaCentavos,parcelaQuantidade} = edition;
  const choicesId = useId();
  const interactive = useSyncExternalStore(subscribe, () => true, () => false);
  const [showMethods,setShowMethods] = useState(false);
  const [resumeUrl,setResumeUrl] = useState("");
  const widget = useRef<HTMLDivElement>(null);
  const current = useRef<AbortController|null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");

  useEffect(() => {
    const element = widget.current;
    return () => {
      current.current?.abort();
      removeTurnstile(element);
    };
  },[]);

  async function start(paymentMethod: FamtourPaymentMethod) {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    const {signal} = controller;
    const keyName = `newwed.checkout.${slug}`;
    setBusy(true);
    setMessage("");
    setResumeUrl("");
    try {
      const previousId = sessionStorage.getItem(`${keyName}.id`);
      const previousMethod = sessionStorage.getItem(`${keyName}.method`);
      if (previousId && previousMethod !== paymentMethod) {
        const previous = await readCheckout(previousId,signal);
        if (canRetry(previous) && sessionStorage.getItem(`${keyName}.id`) === previousId) {
          clearAttempt(keyName);
        } else {
          if (previous.checkoutUrl) setResumeUrl(checkoutDestination(previous.checkoutUrl));
          setMessage(finished(previous) ? messages[previous.status as FinalStatus] : "Já existe uma tentativa com outra forma de pagamento. Retome ou cancele essa tentativa para escolher novamente.");
          return;
        }
      }
      const key = sessionStorage.getItem(keyName) ?? crypto.randomUUID();
      sessionStorage.setItem(keyName,key);
      const turnstileToken = await getTurnstileToken(widget.current,"public_checkout");
      const selectedMethod = sessionStorage.getItem(`${keyName}.method`);
      if (selectedMethod && selectedMethod !== paymentMethod) {
        throw new Error("Já existe uma tentativa com outra forma de pagamento. Selecione a forma anterior para continuar.");
      }
      sessionStorage.setItem(`${keyName}.method`,paymentMethod);
      let checkout = await checkoutRequest("/api/public/checkouts",signal,{
        method:"POST",
        headers:{"Content-Type":"application/json","Idempotency-Key":key},
        body:JSON.stringify({editionSlug:slug,paymentMethod,turnstileToken}),
      });
      sessionStorage.setItem(`${keyName}.id`,checkout.checkoutId);
      for (let attempt=0; checkout.status==="QUEUED" && attempt<20; attempt++) {
        await pause();
        checkout = await readCheckout(checkout.checkoutId,signal);
      }
      if (checkout.status==="READY" && checkout.checkoutUrl) {
        window.location.assign(checkoutDestination(checkout.checkoutUrl));
        return;
      }
      if (canRetry(checkout)) clearAttempt(keyName);
      setMessage(finished(checkout) ? messages[checkout.status as FinalStatus] : "O pagamento ainda está sendo preparado ou confirmado. Tente novamente em instantes.");
    } catch (error) {
      if (!signal.aborted) setMessage(error instanceof Error ? error.message : "Não foi possível abrir o pagamento. Tente novamente.");
    } finally {
      if (!signal.aborted) {
        current.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <div className={className}>
      <button type="button" onClick={() => setShowMethods(open => !open)} disabled={!interactive || busy} aria-expanded={showMethods} aria-controls={choicesId} className={`${purchaseClass} w-full`}>
        {busy ? "Preparando pagamento…" : "Comprar agora · Garantir minha vaga"}
      </button>
      <div id={choicesId} hidden={!showMethods}>
        <div role="group" aria-label="Escolha a forma de pagamento" className="mt-2 grid gap-2 font-sans text-sm">
          <button type="button" disabled={busy} onClick={() => void start("PIX")} className="min-h-12 border border-current px-4 py-2 text-left disabled:opacity-60">
            Pagar com Pix · {formatCurrency(valorAVistaCentavos)}
          </button>
          <button type="button" disabled={busy} onClick={() => void start("CREDIT_CARD")} className="min-h-12 border border-current px-4 py-2 text-left disabled:opacity-60">
            Pagar com cartão · {parcelaQuantidade}x de aprox. {formatCurrency(parcelaCentavos)}
          </button>
        </div>
        <p className="mt-2 font-sans text-sm">Total no cartão: {formatCurrency(valorCartaoCentavos)}</p>
        <a className="mt-2 inline-flex min-h-11 items-center font-sans text-sm underline underline-offset-4" href={`/destinos?edicao=${encodeURIComponent(slug)}&origem=inscricao#form`}>
          Precisa de outra forma de pagamento? Peça contato da equipe.
        </a>
        <div ref={widget}/>
        {(busy || message) && <p role="status" className="mt-2 font-sans text-sm">{busy ? "Conclua a verificação de segurança se ela aparecer." : message}</p>}
        {resumeUrl && <a href={resumeUrl} className="mt-2 inline-block underline">Retomar tentativa anterior</a>}
      </div>
    </div>
  );
}

export function FamtourCheckoutReturn({id,slug,contactHref}:{id:string;slug:string;contactHref:string}) {
  const [checkout,setCheckout] = useState<Checkout|null>(null);
  const [message,setMessage] = useState("Consultando seu pagamento…");
  const [attempt,setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const {signal} = controller;
    async function follow() {
      try {
        for (let count=0; count<20 && !signal.aborted; count++) {
          const result = await readCheckout(id,signal);
          if (result.editionSlug!==slug) throw new Error("Este pedido pertence a outra edição.");
          setCheckout(result);
          if (finished(result)) {
            const keyName = `newwed.checkout.${slug}`;
            if (canRetry(result) && sessionStorage.getItem(`${keyName}.id`)===id) {
              clearAttempt(keyName);
            }
            setMessage(messages[result.status as FinalStatus]);
            return;
          }
          setMessage("Aguardando a confirmação do Asaas.");
          await pause();
        }
        if (!signal.aborted) setMessage("A confirmação ainda está pendente. Você pode consultar novamente.");
      } catch (error) {
        if (!signal.aborted) setMessage(error instanceof Error ? error.message : "Não foi possível consultar o pagamento.");
      }
    }
    void follow();
    return () => controller.abort();
  },[id,slug,attempt]);

  return (
    <section aria-label="Situação do pagamento" className="mx-auto max-w-5xl px-6 py-8">
      <p role="status" className="font-sans text-lg text-[var(--color-destinos-marsala)]">{message}</p>
      <p className="mt-2 break-all font-sans text-xs">Pedido {id}</p>
      {!checkout || !finished(checkout) ? (
        <button type="button" className="mt-3 underline" onClick={() => setAttempt(value => value+1)}>Consultar novamente</button>
      ) : checkout.status==="PAYMENT_REVIEW" ? (
        <a className="mt-3 inline-block underline" href={contactHref}>Falar com a equipe New Wed</a>
      ) : canRetry(checkout) ? (
        <a className="mt-3 inline-block underline" href="#condicoes">Voltar às opções de pagamento</a>
      ) : null}
    </section>
  );
}
