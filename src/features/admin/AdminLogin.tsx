"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";

export function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const result = await response.json() as { message?: string; reason?: string; retryAt?: string };
      if (!response.ok) {
        const retryAt=result.reason==="DAILY_QUOTA"&&result.retryAt?new Date(result.retryAt):null;
        if(retryAt&&Number.isFinite(retryAt.getTime()))throw new Error(`O limite diário do banco foi atingido. Tente novamente em ${retryAt.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}, no seu horário local.`);
        throw new Error(result.message ?? "Não foi possível entrar. Tente novamente.");
      }
      setPassword("");
      window.location.replace("/admin");
    } catch (reason) {
      setPassword("");
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar. Tente novamente.");
      setLoading(false);
    }
  }

  return <main className="flex min-h-screen flex-col bg-[#FAFAF8] px-6 py-8 text-[#191010] sm:px-12">
    <Link href="/" className="w-fit text-xl tracking-[0.18em]">NEW WED</Link>
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-16">
      <LockKeyhole size={24} strokeWidth={1} className="mb-7 text-black/45"/>
      <p className="text-[10px] uppercase tracking-[0.22em] text-black/45">Área da equipe</p>
      <h1 className="mt-3 text-4xl font-light tracking-tight sm:text-5xl">Acesso ao painel.</h1>
      <p className="mt-4 text-sm leading-relaxed text-black/55">Entre com seu e-mail e senha para continuar.</p>
      <form method="post" action="/api/auth/login" onSubmit={submit} className="mt-10 space-y-6">
        <label className="block text-[10px] uppercase tracking-[0.15em]">E-mail
          <input type="email" name="email" autoComplete="username" required disabled={!ready || loading} maxLength={254} value={email} onChange={event => setEmail(event.target.value)} className="mt-2 block w-full border border-black/20 bg-white px-4 py-3 text-base normal-case tracking-normal outline-none focus:border-black"/>
        </label>
        <label className="block text-[10px] uppercase tracking-[0.15em]">Senha
          <input type="password" name="password" autoComplete="current-password" required disabled={!ready || loading} maxLength={256} value={password} onChange={event => setPassword(event.target.value)} className="mt-2 block w-full border border-black/20 bg-white px-4 py-3 text-base normal-case tracking-normal outline-none focus:border-black"/>
        </label>
        {error && <p role="alert" className="text-sm leading-relaxed text-[#7A2535]">{error}</p>}
        <button type="submit" disabled={!ready || loading} className="flex w-full items-center justify-between bg-[#191010] px-5 py-4 text-[11px] uppercase tracking-[0.16em] text-white disabled:opacity-50">{loading ? "Entrando…" : "Entrar"}<ArrowRight size={17}/></button>
      </form>
      <Link href="/" className="mt-8 flex w-fit items-center gap-2 text-xs text-black/55 hover:text-black"><ArrowLeft size={14}/> Voltar para o site</Link>
    </section>
    <p className="text-[9px] uppercase tracking-[0.16em] text-black/35">Grupo New Wed · Acesso restrito</p>
  </main>;
}
