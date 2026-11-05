import {z} from 'zod';
import {destinosEbook} from '@/content/destinos-ebook';

export const ebookLeadSchema = z.object({
  nome: z.string().trim().min(3).max(160),
  empresa: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254),
  telefone: z.string().trim().max(24).refine(value => {
    const digits = value.replace(/\D/g, '');
    return /^(?:55)?[1-9][0-9](?:9[0-9]{8}|[2-9][0-9]{7})$/.test(digits);
  }, 'Informe um WhatsApp válido com DDD.'),
  consent: z.object({accepted: z.literal(true), version: z.literal(destinosEbook.consentVersion)}),
  turnstileToken: z.string().max(2048).optional(),
}).strict();
