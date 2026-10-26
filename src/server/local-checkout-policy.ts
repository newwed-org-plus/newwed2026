import {HttpError} from './http';
import {localRecipientAllowed} from './integrations/uazapi';
import type {RuntimeSecrets} from './secrets';
type LocalPolicy=RuntimeSecrets & {ENVIRONMENT?:string};
export function requireLocalCheckoutRecipients(env:LocalPolicy,phones:Array<string|null|undefined>) {
 if(env.ENVIRONMENT==='development'&&env.LOCAL_TEST_MODE==='true'&&(!phones.length||phones.some(phone=>!phone||!localRecipientAllowed(env,phone))))throw new HttpError(403,'CHECKOUT_LOCAL_RECIPIENT_BLOCKED','O checkout local aceita somente a conversa e o lead do contato de teste autorizado.');
}
export function checkoutText(env:LocalPolicy,url:string) {
 const text=`Olá! Segue o link do seu checkout New Wed: ${url}`;
 return env.ENVIRONMENT==='development'&&env.LOCAL_TEST_MODE==='true'?`TESTE SANDBOX — sem cobrança real.\n${text}`:text;
}
export function confirmationText(env:LocalPolicy,edition:string) {
 return env.ENVIRONMENT==='development'&&env.LOCAL_TEST_MODE==='true'?`TESTE SANDBOX — pagamento de teste confirmado para ${edition}. Esta simulação não confirma uma participação real.`:`Pagamento confirmado para ${edition}. Obrigado! A equipe New Wed seguirá com os detalhes da sua participação.`;
}
