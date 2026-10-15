"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { buildSuccessWhatsAppMessage } from "@/features/famtour/lib/famtours";

type Props = {
  nome: string;
  telefoneFormatado: string;
  famtourNome: string;
};

const WHATSAPP = process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL ?? "5581973273996";

export function SuccessScreen({ nome, telefoneFormatado: _telefoneFormatado, famtourNome }: Props) {
  const firstName = nome.trim().split(/\s+/)[0] ?? nome;
  const msg = buildSuccessWhatsAppMessage(nome, famtourNome);
  const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;

  return (
    <section
      className="bg-white"
      style={{ padding: "6rem 1.5rem", textAlign: "center" }}
    >
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <h1
          style={{
            fontFamily: "'Fedra Sans Std', sans-serif",
            fontWeight: 300,
            fontSize: "clamp(2rem, 4vw, 2.8rem)",
            color: "#191010",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          Pré-inscrição recebida.
          <br />
          <em style={{ fontStyle: "italic", fontWeight: 300 }}>
            Boas<span style={{ fontFeatureSettings: "'liga' 0, 'dlig' 0, 'calt' 0" }}>-</span>vindas à New Wed{firstName ? `, ${firstName}` : ""}.
          </em>
        </h1>
        <p
          style={{
            fontFamily: "'Fedra Sans Std', sans-serif",
            fontSize: "0.92rem",
            lineHeight: 1.72,
            color: "#191010",
            marginTop: "1.5rem",
          }}
        >
          Em breve entraremos em contato no seu WhatsApp.
        </p>
        <p
          style={{
            fontFamily: "'Fedra Sans Std', sans-serif",
            fontSize: "0.85rem",
            lineHeight: 1.6,
            color: "rgba(25,16,16,0.75)",
            maxWidth: 480,
            margin: "1.5rem auto 2rem",
          }}
        >
          Quer adiantar e já trocar uma ideia agora? Fala com a equipe New Wed no
          WhatsApp comercial.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            background: "#7A2535",
            color: "#FFFFFF",
            padding: "1.2rem 2.5rem",
            fontFamily: "'Fedra Sans Std', sans-serif",
            fontWeight: 350,
            fontSize: "0.9rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            borderRadius: 0,
            textDecoration: "none",
            width: "100%",
            maxWidth: 400,
          }}
        >
          <MessageCircle size={24} color="#FFFFFF" />
          Falar agora no WhatsApp
        </a>
        <div style={{ marginTop: "1rem" }}>
          <Link
            href="/famtour"
            style={{
              display: "inline-block",
              border: "1.5px solid #191010",
              color: "#191010",
              padding: "1rem 2rem",
              fontFamily: "'Fedra Sans Std', sans-serif",
              fontWeight: 350,
              fontSize: "0.85rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              borderRadius: 0,
              textDecoration: "none",
              background: "transparent",
            }}
          >
            Voltar para o site
          </Link>
        </div>
      </div>
    </section>
  );
}
