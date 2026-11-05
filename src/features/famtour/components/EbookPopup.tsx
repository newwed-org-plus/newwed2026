'use client';

import {useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent} from 'react';
import {BookOpen, Check, X} from 'lucide-react';
import {destinosEbook} from '@/content/destinos-ebook';
import {ebookLeadSchema} from '@/features/leads/ebook-schema';
import {getTurnstileToken, removeTurnstile, resetTurnstile} from '../turnstile';
import './ebook-popup.css';

const sessionKey = `newwed:ebook:${destinosEbook.id}`;
const subscribe = () => () => {};

export function EbookPopup() {
  const interactive = useSyncExternalStore(subscribe, () => true, () => false);
  const dialog = useRef<HTMLDialogElement>(null);
  const verification = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const hasOpened = useRef(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{downloadUrl: string | null} | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    hasOpened.current = true;
    setOpen(true);
    try { sessionStorage.setItem(sessionKey, 'seen'); } catch { /* O popup continua utilizável sem storage. */ }
  }, []);

  useEffect(() => {
    try { if (sessionStorage.getItem(sessionKey)) return; } catch { /* Sem repetição durante esta montagem. */ }
    // Não interromper quem chegou por um link de edição ou já está preenchendo outro formulário.
    const timer = setTimeout(() => {
      if (hasOpened.current) return;
      try { if (sessionStorage.getItem(sessionKey)) return; } catch { /* Storage opcional. */ }
      if (document.visibilityState !== 'visible' || window.location.hash || new URLSearchParams(window.location.search).has('edicao')) return;
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
      show();
    }, 12000);
    return () => clearTimeout(timer);
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    const element = verification.current;
    return () => removeTurnstile(element);
  }, []);

  const close = () => { dialog.current?.close(); };
  const onClose = () => { setOpen(false); removeTurnstile(verification.current); trigger.current?.focus({preventScroll: true}); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const fields = new FormData(event.currentTarget);
    const input = {nome: fields.get('nome'), empresa: fields.get('empresa'), email: fields.get('email'), telefone: fields.get('telefone'), consent: {accepted: fields.get('consent') === 'on', version: destinosEbook.consentVersion}};
    const parsed = ebookLeadSchema.safeParse(input);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Confira os campos do cadastro.'); return; }
    busy.current = true;
    setSending(true);
    setError('');
    try {
      const turnstileToken = await getTurnstileToken(verification.current);
      const response = await fetch('/api/public/ebook', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...parsed.data, turnstileToken}), signal: AbortSignal.timeout(20000)});
      const body = await response.json() as {accepted?: boolean; downloadUrl?: string | null; message?: string};
      if (!response.ok || body.accepted !== true) throw new Error(body.message || 'Não foi possível salvar seu cadastro. Tente novamente.');
      setResult({downloadUrl: body.downloadUrl ?? null});
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'A conexão demorou. Tente novamente; seu pedido não será duplicado.');
    } finally {
      busy.current = false;
      setSending(false);
      resetTurnstile(verification.current);
    }
  }

  return <>
    <button ref={trigger} type="button" onClick={show} disabled={!interactive} className="ebook-trigger" aria-haspopup="dialog"><BookOpen size={18} aria-hidden="true"/> E-book gratuito</button>
    <dialog ref={dialog} className="ebook-popup" aria-labelledby="ebook-title" aria-describedby="ebook-description" onClose={onClose} onClick={event => { if (event.target === event.currentTarget && !sending) close(); }}>
      <div className="ebook-popup-content">
        <button type="button" className="ebook-close" onClick={close} aria-label="Fechar popup"><X size={22}/></button>
        <p className="ebook-eyebrow">Um presente para você</p>
        <h2 id="ebook-title">{destinosEbook.title}</h2>
        <p id="ebook-description">{destinosEbook.downloadUrl ? 'Preencha seu cadastro e receba gratuitamente o e-book.' : 'Deixe seu contato para receber gratuitamente o e-book assim que estiver disponível.'}</p>
        {result ? <div className="ebook-success" role="status">
          <Check size={28} aria-hidden="true"/><h3>Cadastro recebido!</h3>
          {result.downloadUrl ? <><p>Seu e-book está disponível.</p><a className="ebook-submit" href={result.downloadUrl} download>Baixar e-book</a></> : <p>Seu interesse foi registrado com a equipe New Wed. O arquivo ainda não está disponível para download.</p>}
          <button type="button" className="ebook-later" onClick={close}>Continuar explorando Destinos</button>
        </div> : <form onSubmit={submit}>
          <div className="ebook-fields">
            <label>Nome completo<input name="nome" autoComplete="name" required minLength={3} maxLength={160} placeholder="Seu nome completo"/></label>
            <label>Nome da empresa<input name="empresa" autoComplete="organization" required maxLength={160} placeholder="Sua empresa"/></label>
            <label>E-mail<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="voce@empresa.com.br"/></label>
            <label>WhatsApp com DDD<input name="telefone" type="tel" autoComplete="tel" required maxLength={24} placeholder="(81) 99999-9999"/></label>
          </div>
          <label className="ebook-consent"><input name="consent" type="checkbox" required/> <span>Autorizo o Grupo New Wed a usar meus dados para atender a este pedido de e-book.</span></label>
          <div ref={verification}/>
          {error && <p role="alert" className="ebook-error">{error}</p>}
          <button className="ebook-submit" type="submit" disabled={sending}>{sending ? 'Enviando cadastro…' : 'Receber e-book'}</button>
          <button className="ebook-later" type="button" onClick={close}>Agora não</button>
        </form>}
      </div>
    </dialog>
  </>;
}
