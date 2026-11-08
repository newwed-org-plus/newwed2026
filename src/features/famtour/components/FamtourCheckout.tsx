"use client";

import { useEffect,useRef,useState } from "react";
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
  status:"QUEUED"|"READY"|"AWAITING_CONFIRMATION"|FinalStatus;
  checkoutUrl:string|null;
};

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

export function FamtourCheckoutButton({slug,className}: {slug:string;className?:string}) {
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

  async function start() {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    const {signal} = controller;
    const keyName = `newwed.checkout.${slug}`;
    setBusy(true);
    setMessage("");
    try {
      const key = sessionStorage.getItem(keyName) ?? crypto.randomUUID();
      sessionStorage.setItem(keyName,key);
      const turnstileToken = await getTurnstileToken(widget.current,"public_checkout");
      let checkout = await checkoutRequest("/api/public/checkouts",signal,{
        method:"POST",
        headers:{"Content-Type":"application/json","Idempotency-Key":key},
        body:JSON.stringify({editionSlug:slug,turnstileToken}),
      });
      sessionStorage.setItem(`${keyName}.id`,checkout.checkoutId);
      for (let attempt=0; checkout.status==="QUEUED" && attempt<20; attempt++) {
        await pause();
        checkout = await readCheckout(checkout.checkoutId,signal);
      }
      if (checkout.status==="READY" && checkout.checkoutUrl) {
        const url = new URL(checkout.checkoutUrl);
        if (!["https://asaas.com","https://sandbox.asaas.com"].includes(url.origin) || url.pathname!=="/checkoutSession/show") {
          throw new Error("O endereço de pagamento é inválido. Fale com a equipe New Wed.");
        }
        window.location.assign(url.href);
        return;
      }
      if (canRetry(checkout)) {
        sessionStorage.removeItem(keyName);
        sessionStorage.removeItem(`${keyName}.id`);
      }
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
      <button type="button" onClick={start} disabled={busy} className={`${purchaseClass} w-full`}>
        {busy ? "Preparando pagamento…" : "Garantir minha vaga"}
      </button>
      <div ref={widget}/>
      {message && <p role="status" className="mt-2 font-sans text-sm text-[var(--color-destinos-marsala)]">{message}</p>}
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
              sessionStorage.removeItem(keyName);
              sessionStorage.removeItem(`${keyName}.id`);
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
