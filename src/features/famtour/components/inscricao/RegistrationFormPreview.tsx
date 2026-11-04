"use client";

import type { FormEvent, HTMLInputTypeAttribute } from "react";

type FieldProps = {
  id: string;
  label: string;
  type?: HTMLInputTypeAttribute;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  optional?: boolean;
};

function Field({
  id,
  label,
  type = "text",
  autoComplete,
  inputMode,
  optional = false,
}: FieldProps) {
  return (
    <label className="block" htmlFor={id}>
      <span className="font-sans text-[0.68rem] font-medium uppercase tracking-[0.13em] text-[var(--color-destinos-turquoise)]">
        {label}
        {optional ? " (opcional)" : " *"}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={!optional}
        className="mt-2 min-h-12 w-full rounded-none border-0 border-b border-black/25 bg-transparent px-0 py-3 font-sans text-base text-[#191010] outline-none transition-colors focus:border-[var(--color-destinos-marsala)] focus-visible:ring-0"
      />
    </label>
  );
}

export function RegistrationFormPreview() {
  const preventSubmission = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <form onSubmit={preventSubmission} aria-label="Dados para inscrição">
      <fieldset>
        <legend className="font-serif text-3xl font-normal text-[#191010]">
          Dados pessoais
        </legend>
        <p className="mt-2 font-sans text-sm leading-relaxed text-black/60">
          Estrutura preparada para a futura inscrição. O preenchimento não é
          enviado nesta etapa.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field
              id="nome-completo"
              label="Nome completo"
              autoComplete="name"
            />
          </div>
          <Field
            id="email-inscricao"
            label="E-mail"
            type="email"
            autoComplete="email"
            inputMode="email"
          />
          <Field
            id="whatsapp-inscricao"
            label="WhatsApp"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
          />
          <Field
            id="cpf-inscricao"
            label="CPF"
            autoComplete="off"
            inputMode="numeric"
          />
        </div>
      </fieldset>

      <fieldset className="mt-12 border-t border-black/10 pt-10">
        <legend className="font-serif text-3xl font-normal text-[#191010]">
          Endereço de cobrança
        </legend>
        <p className="mt-2 font-sans text-sm leading-relaxed text-black/60">
          Estes dados fazem parte do modelo de inscrição New Wed, mas não serão
          armazenados agora.
        </p>
        <div className="mt-7 grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-6">
          <div className="md:col-span-2">
            <Field
              id="cep-inscricao"
              label="CEP"
              autoComplete="postal-code"
              inputMode="numeric"
            />
          </div>
          <div className="md:col-span-4">
            <Field
              id="rua-inscricao"
              label="Rua"
              autoComplete="address-line1"
            />
          </div>
          <div className="md:col-span-2">
            <Field id="numero-inscricao" label="Número" inputMode="numeric" />
          </div>
          <div className="md:col-span-4">
            <Field
              id="complemento-inscricao"
              label="Complemento"
              autoComplete="address-line2"
              optional
            />
          </div>
          <div className="md:col-span-3">
            <Field id="bairro-inscricao" label="Bairro" />
          </div>
          <div className="md:col-span-2">
            <Field
              id="cidade-inscricao"
              label="Cidade"
              autoComplete="address-level2"
            />
          </div>
          <div className="md:col-span-1">
            <Field id="uf-inscricao" label="UF" autoComplete="address-level1" />
          </div>
        </div>
      </fieldset>

      <div
        role="status"
        className="mt-12 border border-[var(--color-destinos-marsala)]/25 bg-[#F7F4EE] px-6 py-6 text-center"
      >
        <strong className="font-sans text-sm uppercase tracking-[0.14em] text-[var(--color-destinos-marsala)]">
          INSCRIÇÃO ONLINE EM BREVE
        </strong>
        <p className="mx-auto mt-3 max-w-xl font-sans text-sm leading-relaxed text-black/65">
          Nesta etapa, seus dados não serão enviados e nenhuma cobrança será
          realizada.
        </p>
      </div>
    </form>
  );
}
