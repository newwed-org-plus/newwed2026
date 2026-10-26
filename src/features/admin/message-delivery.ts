export function messageDelivery(status:string) {
 switch(status){
  case 'SEND_PENDING':return {label:'Na fila de envio',hint:'A mensagem ainda aguarda processamento.'};
  case 'SENDING':return {label:'Enviando',hint:'O envio está em processamento.'};
  case 'ACCEPTED':return {label:'Aceita para envio',hint:'O provedor aceitou a mensagem. A entrega ainda não foi confirmada.'};
  case 'SENT':return {label:'Enviada',hint:'Enviada pelo WhatsApp. A entrega ao destinatário ainda não foi confirmada.'};
  case 'DELIVERED':return {label:'Entregue',hint:'O WhatsApp confirmou a entrega ao destinatário.'};
  case 'READ':return {label:'Lida',hint:'O WhatsApp confirmou a leitura pelo destinatário.'};
  case 'FAILED':return {label:'Falha no envio',hint:'O envio falhou. Confira o motivo no histórico.'};
  case 'SEND_UNKNOWN':return {label:'Envio não confirmado',hint:'Confira o resultado antes de tentar enviar novamente.'};
  case 'RECEIVED':return {label:'Recebida',hint:''};
  default:return {label:'Estado não confirmado',hint:'Aguardando atualização do estado da mensagem.'};
 }
}
