"use client";

import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { getTurnstileToken } from "@/features/famtour/turnstile";
import { OptionCard } from "./OptionCard";
import {
  preInscricaoSchema,
  type PreInscricaoData,
} from "@/features/famtour/lib/schemas/preInscricao";
export type FamTour = {
  id: string;
  slug: string;
  nome: string;
  label: string;
  sub: string;
  data_inicio: string;
  data_fim: string;
  vagas_restantes: number;
  preco_a_partir_de: string;
  imagem: string;
  bullets: string[];
};

const STORAGE_KEY = "newed_aplicar_form_v1";

function formatTelefone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function normalizeTelefone(value: string): string {
  const d = value.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "'Fedra Sans Std', sans-serif",
  fontWeight: 350,
  fontSize: "0.7rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#2E8E8E",
  marginBottom: "0.5rem",
};

const inputBaseStyle: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "none",
  borderBottom: "1.5px solid rgba(25,16,16,0.2)",
  padding: "0.75rem 0",
  fontFamily: "'Fedra Sans Std', sans-serif",
  fontWeight: 350,
  fontSize: "1rem",
  color: "#191010",
  outline: "none",
  borderRadius: 0,
};

const errorStyle: React.CSSProperties = {
  fontFamily: "'Fedra Sans Std', sans-serif",
  fontSize: "0.75rem",
  color: "#7A2535",
  marginTop: "0.4rem",
};

function SubDivisor({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: "2.5rem 0 1.5rem" }}>
      <div
        style={{
          fontFamily: "'Fedra Sans Std', sans-serif",
          fontWeight: 350,
          fontSize: "0.6rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#2E8E8E",
          paddingBottom: "0.5rem",
          borderBottom: "1px solid rgba(25,16,16,0.1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

type Props = {
  famtours: FamTour[];
  preSelectedSlug?: string;
  onSuccess: (data: PreInscricaoData, famtourNome: string) => void;
};

export function PreInscricaoForm({
  famtours,
  preSelectedSlug,
  onSuccess,
}: Props) {
  const showFamtourSelector = famtours.length >= 2;
  const defaultFamtourId =
    famtours.find((f) => f.slug === preSelectedSlug)?.id ??
    (famtours.length === 1 ? famtours[0].id : "");

  const [restored, setRestored] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [pending, setPending] = useState(false);
  const savedDraftRef = useRef<Partial<PreInscricaoData> | null>(null);

  const form = useForm<PreInscricaoData>({
    resolver: zodResolver(preInscricaoSchema) as any,
    mode: "onBlur",
    defaultValues: {
      nome: "",
      email: "",
      telefone: "",
      instagram: "",
      empresa: "",
      cidade_estado: "",
      famtour_id: defaultFamtourId,
      respostas_brutas: {
        status_dw: undefined as any,
        trabalha_sozinho: "",
        tem_casal_nordeste: undefined as any,
        destino_interesse: "",
        destino_outro: "",
        expectativa: "",
        maior_desafio: "",
      },
      lgpd: false as any,
    },
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  // Restore draft (without auto-applying)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        savedDraftRef.current = JSON.parse(raw);
        setShowResumeBanner(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const resumeDraft = () => {
    if (savedDraftRef.current) {
      reset({ ...getValues(), ...savedDraftRef.current } as PreInscricaoData);
      setRestored(true);
    }
    setShowResumeBanner(false);
  };

  const discardDraft = () => {
    localStorage.removeItem(STORAGE_KEY);
    savedDraftRef.current = null;
    setShowResumeBanner(false);
  };

  const persistDraft = () => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(getValues()));
    } catch {
      /* ignore */
    }
  };

  // Pre-select famtour from query param if provided
  useEffect(() => {
    if (preSelectedSlug && !restored) {
      const f = famtours.find((x) => x.slug === preSelectedSlug);
      if (f) setValue("famtour_id", f.id, { shouldValidate: false });
    }
  }, [preSelectedSlug, famtours, restored, setValue]);

  const status_dw = watch("respostas_brutas.status_dw");
  const trabalha_sozinho = watch("respostas_brutas.trabalha_sozinho");
  const tem_casal_nordeste = watch("respostas_brutas.tem_casal_nordeste");
  const famtour_id = watch("famtour_id");
  const lgpd = watch("lgpd");

  const submitLead = async (data: PreInscricaoData) => {
    setPending(true);
    try {
      // Resolve a edição que será persistida como origem comercial do lead.
      const resolvedFamtourId = showFamtourSelector
        ? data.famtour_id
        : (famtours[0]?.id ?? "");

      const normalizedData: PreInscricaoData = {
        ...data,
        telefone: normalizeTelefone(data.telefone),
        instagram: data.instagram?.trim().replace(/^@/, "").toLowerCase() ?? "",
        famtour_id: resolvedFamtourId,
      };

      const response = await fetch("/api/public/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          ...normalizedData,
          editionSlug: resolvedFamtourId,
          consent: { version: "2026-09-11", accepted: normalizedData.lgpd },
          landingUrl: window.location.href,
          referrer: document.referrer || undefined,
          utm: Object.fromEntries(
            ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
              .map((key) => [key, new URLSearchParams(window.location.search).get(key)])
              .filter((entry): entry is [string, string] => Boolean(entry[1])),
          ),
          turnstileToken: await getTurnstileToken(),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Erro ao registrar pré-inscrição. Por favor tente novamente.");
      }

      localStorage.removeItem(STORAGE_KEY);
      const famtourNome =
        famtours.find((f) => f.id === resolvedFamtourId)?.nome ??
        famtours[0]?.nome ??
        "Famtour";
      toast.success(
        `Pré-inscrição enviada! Em breve entraremos em contato no seu WhatsApp.`,
        { duration: 6000 },
      );
      onSuccess(normalizedData, famtourNome);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Erro ao enviar pré-inscrição.");
      toast.error(
        err.message ?? "Erro ao enviar pré-inscrição. Tente novamente.",
        { duration: 8000 },
      );
    } finally {
      setPending(false);
    }
  };

  const onSubmit = handleSubmit(
    async (data) => {
      if (showFamtourSelector && !data.famtour_id) {
        toast.error("Selecione a edição que deseja participar");
        return;
      }
      await submitLead(data);
    },
    (errs) => {
      // scroll to first error
      const firstKey = Object.keys(errs)[0];
      if (firstKey && typeof document !== "undefined") {
        const el = document.querySelector(`[data-field="${firstKey}"]`);
        if (el && "scrollIntoView" in el)
          (el as HTMLElement).scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
      }
    },
  );

  const submitting = isSubmitting || pending;

  return (
    <form onSubmit={onSubmit} noValidate>
      {showResumeBanner && (
        <div
          style={{
            border: "1.5px solid #2E8E8E",
            background: "#F7F4EE",
            padding: "1rem 1.25rem",
            marginBottom: "2rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "'Fedra Sans Std', sans-serif",
              fontSize: "0.85rem",
              color: "#191010",
            }}
          >
            Você já iniciou um preenchimento. Deseja retomar?
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={resumeDraft}
              style={{
                background: "#7A2535",
                color: "#FFFFFF",
                border: "none",
                padding: "0.5rem 1rem",
                fontFamily: "'Fedra Sans Std', sans-serif",
                fontSize: "0.75rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Retomar
            </button>
            <button
              type="button"
              onClick={discardDraft}
              style={{
                background: "transparent",
                color: "#191010",
                border: "1.5px solid rgba(25,16,16,0.3)",
                padding: "0.5rem 1rem",
                fontFamily: "'Fedra Sans Std', sans-serif",
                fontSize: "0.75rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Bloco 1 */}
      <SubDivisor>§ 01 · Identificação</SubDivisor>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div data-field="nome">
          <label htmlFor="nome" style={labelStyle}>
            Nome completo <span style={{ color: "#7A2535" }}>*</span>
          </label>
          <input
            id="nome"
            type="text"
            style={inputBaseStyle}
            {...register("nome", { onBlur: persistDraft })}
          />
          {errors.nome && (
            <div role="alert" style={errorStyle}>
              {errors.nome.message}
            </div>
          )}
        </div>

        <div data-field="email">
          <label htmlFor="email" style={labelStyle}>
            E-mail <span style={{ color: "#7A2535" }}>*</span>
          </label>
          <input
            id="email"
            type="email"
            style={inputBaseStyle}
            {...register("email", { onBlur: persistDraft })}
          />
          {errors.email && (
            <div role="alert" style={errorStyle}>
              {errors.email.message}
            </div>
          )}
        </div>

        <div data-field="telefone">
          <label htmlFor="telefone" style={labelStyle}>
            WhatsApp com DDD <span style={{ color: "#7A2535" }}>*</span>
          </label>
          <Controller
            control={control}
            name="telefone"
            render={({ field }) => (
              <input
                id="telefone"
                type="tel"
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                style={inputBaseStyle}
                value={field.value}
                onChange={(e) =>
                  field.onChange(formatTelefone(e.target.value))
                }
                onBlur={() => {
                  field.onBlur();
                  persistDraft();
                }}
              />
            )}
          />
          {errors.telefone && (
            <div role="alert" style={errorStyle}>
              {errors.telefone.message}
            </div>
          )}
        </div>

        <div data-field="instagram">
          <label htmlFor="instagram" style={labelStyle}>
            Instagram
          </label>
          <input
            id="instagram"
            type="text"
            placeholder="@suaempresa"
            style={inputBaseStyle}
            {...register("instagram", { onBlur: persistDraft })}
          />
        </div>
      </div>

      {/* Bloco 2 */}
      <SubDivisor>§ 02 · Atuação Profissional</SubDivisor>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div data-field="empresa">
          <label htmlFor="empresa" style={labelStyle}>
            Nome da empresa ou assessoria{" "}
            <span style={{ color: "#7A2535" }}>*</span>
          </label>
          <input
            id="empresa"
            type="text"
            style={inputBaseStyle}
            {...register("empresa", { onBlur: persistDraft })}
          />
          {errors.empresa && (
            <div role="alert" style={errorStyle}>
              {errors.empresa.message}
            </div>
          )}
        </div>

        <div data-field="cidade_estado">
          <label htmlFor="cidade_estado" style={labelStyle}>
            Estado / Cidade <span style={{ color: "#7A2535" }}>*</span>
          </label>
          <input
            id="cidade_estado"
            type="text"
            placeholder="PE — Recife"
            style={inputBaseStyle}
            {...register("cidade_estado", { onBlur: persistDraft })}
          />
          {errors.cidade_estado && (
            <div role="alert" style={errorStyle}>
              {errors.cidade_estado.message}
            </div>
          )}
        </div>

        <div data-field="respostas_brutas">
          <label style={labelStyle}>
            Você já trabalha com Destination Wedding ou tem interesse em
            começar? <span style={{ color: "#7A2535" }}>*</span>
          </label>
          <div
            className="grid grid-cols-1 md:grid-cols-2"
            style={{ gap: "0.75rem" }}
          >
            <OptionCard
              name="status_dw"
              label="Já trabalho com Destination Wedding"
              value="JA_TRABALHA"
              selected={status_dw === "JA_TRABALHA"}
              onSelect={(v) => {
                setValue("respostas_brutas.status_dw", v as any, {
                  shouldValidate: true,
                });
                persistDraft();
              }}
            />
            <OptionCard
              name="status_dw"
              label="Tenho interesse em começar"
              value="INTERESSE_COMECAR"
              selected={status_dw === "INTERESSE_COMECAR"}
              onSelect={(v) => {
                setValue("respostas_brutas.status_dw", v as any, {
                  shouldValidate: true,
                });
                persistDraft();
              }}
            />
          </div>
          {errors.respostas_brutas?.status_dw && (
            <div role="alert" style={errorStyle}>
              {errors.respostas_brutas.status_dw.message}
            </div>
          )}
        </div>

        <div>
          <label style={labelStyle}>
            Você trabalha sozinho(a) ou tem equipe?
          </label>
          <div
            style={{
              fontFamily: "'Fedra Sans Std', sans-serif",
              fontSize: "0.7rem",
              color: "rgba(25,16,16,0.6)",
              marginBottom: "0.75rem",
            }}
          >
            Opcional.
          </div>
          <div
            className="grid grid-cols-1 md:grid-cols-2"
            style={{ gap: "0.75rem" }}
          >
            <OptionCard
              name="trabalha_sozinho"
              label="Sozinho(a)"
              value="sozinho"
              selected={trabalha_sozinho === "sozinho"}
              onSelect={(v) => {
                setValue("respostas_brutas.trabalha_sozinho", v);
                persistDraft();
              }}
            />
            <OptionCard
              name="trabalha_sozinho"
              label="Tenho equipe"
              value="equipe"
              selected={trabalha_sozinho === "equipe"}
              onSelect={(v) => {
                setValue("respostas_brutas.trabalha_sozinho", v);
                persistDraft();
              }}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>
            Já tem algum casal ou noivo com data marcada no Nordeste?{" "}
            <span style={{ color: "#7A2535" }}>*</span>
          </label>
          <div
            className="grid grid-cols-1 md:grid-cols-2"
            style={{ gap: "0.75rem" }}
          >
            <OptionCard
              name="tem_casal_nordeste"
              label="Sim"
              value="sim"
              selected={tem_casal_nordeste === "sim"}
              onSelect={(v) => {
                setValue("respostas_brutas.tem_casal_nordeste", v as any, {
                  shouldValidate: true,
                });
                persistDraft();
              }}
            />
            <OptionCard
              name="tem_casal_nordeste"
              label="Ainda não"
              value="nao"
              selected={tem_casal_nordeste === "nao"}
              onSelect={(v) => {
                setValue("respostas_brutas.tem_casal_nordeste", v as any, {
                  shouldValidate: true,
                });
                persistDraft();
              }}
            />
          </div>
          {errors.respostas_brutas?.tem_casal_nordeste && (
            <div role="alert" style={errorStyle}>
              {errors.respostas_brutas.tem_casal_nordeste.message}
            </div>
          )}
        </div>
      </div>

      {/* Bloco 3 */}
      <SubDivisor>§ 03 · Perfil e Expectativas</SubDivisor>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {showFamtourSelector && (
          <div data-field="famtour_id">
            <label style={labelStyle}>
              Qual edição você gostaria de participar?{" "}
              <span style={{ color: "#7A2535" }}>*</span>
            </label>
            <div
              className="grid grid-cols-1 md:grid-cols-2"
              style={{ gap: "0.75rem" }}
            >
              {famtours.map((f) => (
                <OptionCard
                  key={f.id}
                  name="famtour_id"
                  label={`${f.nome} — ${f.sub} · ${f.vagas_restantes} vagas`}
                  value={f.id}
                  selected={famtour_id === f.id}
                  onSelect={(v) => {
                    setValue("famtour_id", v, { shouldValidate: true });
                    persistDraft();
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div data-field="respostas_brutas.destino_interesse">
          <label htmlFor="destino_interesse" style={labelStyle}>
            Qual outro destino você tem interesse?{" "}
            <span style={{ color: "#7A2535" }}>*</span>
          </label>
          <input
            id="destino_interesse"
            type="text"
            style={inputBaseStyle}
            {...register("respostas_brutas.destino_interesse", {
              onBlur: persistDraft,
            })}
          />
          {errors.respostas_brutas?.destino_interesse && (
            <div role="alert" style={errorStyle}>
              {errors.respostas_brutas.destino_interesse.message}
            </div>
          )}
        </div>

        <div data-field="respostas_brutas.expectativa">
          <label htmlFor="expectativa" style={labelStyle}>
            Qual a sua expectativa ao participar do Famtour?{" "}
            <span style={{ color: "#7A2535" }}>*</span>
          </label>
          <textarea
            id="expectativa"
            rows={4}
            placeholder="Conte com suas palavras o que você espera viver, aprender ou alcançar."
            style={{ ...inputBaseStyle, resize: "vertical", minHeight: 110 }}
            {...register("respostas_brutas.expectativa", {
              onBlur: persistDraft,
            })}
          />
          {errors.respostas_brutas?.expectativa && (
            <div role="alert" style={errorStyle}>
              {errors.respostas_brutas.expectativa.message}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="maior_desafio" style={labelStyle}>
            Qual seu maior desafio no mercado atualmente?
          </label>
          <div
            style={{
              fontFamily: "'Fedra Sans Std', sans-serif",
              fontSize: "0.7rem",
              color: "rgba(25,16,16,0.6)",
              marginBottom: "0.5rem",
            }}
          >
            Opcional.
          </div>
          <textarea
            id="maior_desafio"
            rows={3}
            placeholder="Pode escrever curto. A Cindy e o Ed Andrade usam pra preparar o conteúdo da imersão pra você."
            style={{ ...inputBaseStyle, resize: "vertical", minHeight: 80 }}
            {...register("respostas_brutas.maior_desafio", {
              onBlur: persistDraft,
            })}
          />
        </div>
      </div>

      {/* Bloco 4 */}
      <SubDivisor>§ 04 · Finalização</SubDivisor>

      <p
        style={{
          fontFamily: "'Fedra Sans Std', sans-serif",
          fontSize: "0.85rem",
          lineHeight: 1.6,
          color: "rgba(25,16,16,0.7)",
          maxWidth: 600,
        }}
      >
        Ao concluir, você autoriza a New Wed Destinos a entrar em contato via
        WhatsApp e e-mail sobre esta pré-inscrição e o Famtour. Você pode
        retirar essa autorização a qualquer momento.
      </p>

      <label
        data-field="lgpd"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.75rem",
          marginTop: "1.25rem",
          cursor: "pointer",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            flexShrink: 0,
            border: lgpd
              ? "1.5px solid #7A2535"
              : "1.5px solid rgba(25,16,16,0.3)",
            background: lgpd ? "#7A2535" : "#FFFFFF",
            borderRadius: 0,
            marginTop: 2,
          }}
        >
          {lgpd && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M2 6.5L5 9.5L10 3.5"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <input
          type="checkbox"
          className="sr-only"
          checked={!!lgpd}
          onChange={(e) =>
            setValue("lgpd", e.target.checked as any, { shouldValidate: true })
          }
        />
        <span
          style={{
            fontFamily: "'Fedra Sans Std', sans-serif",
            fontSize: "0.9rem",
            color: "#191010",
          }}
        >
          Concordo com os termos e a política de privacidade.
        </span>
      </label>
      {errors.lgpd && (
        <div role="alert" style={errorStyle}>
          {errors.lgpd.message as string}
        </div>
      )}

      <div
        style={{
          marginTop: "2.5rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <button
          type="submit"
          disabled={submitting}
          style={{
            background: "#7A2535",
            color: "#FFFFFF",
            border: "none",
            padding: "1.2rem",
            width: "100%",
            maxWidth: 480,
            fontFamily: "'Fedra Sans Std', sans-serif",
            fontWeight: 350,
            fontSize: "0.9rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            borderRadius: 0,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.4 : 1,
          }}
        >
          {submitting ? "Enviando..." : "Fazer pré-inscrição"}
        </button>
        <div
          style={{
            fontFamily: "'Fedra Sans Std', sans-serif",
            fontSize: "0.7rem",
            color: "rgba(25,16,16,0.6)",
            textAlign: "center",
          }}
        >
          Em breve entraremos em contato no seu WhatsApp.
        </div>
      </div>
    </form>
  );
}
