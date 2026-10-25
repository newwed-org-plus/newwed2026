// WhatsApp can return Brazilian legacy JIDs without the mobile ninth digit.
// This only compares identities; it never changes the destination of a send.
export function sameWhatsAppRecipient(phone:string,chatId:string) {
 const match=/^(\d{10,15})@s\.whatsapp\.net$/.exec(chatId);if(!match)return false;
 const canonical=(value:string)=>/^55\d{2}9\d{8}$/.test(value)?value.slice(0,4)+value.slice(5):value;
 return canonical(phone)===canonical(match[1]);
}
