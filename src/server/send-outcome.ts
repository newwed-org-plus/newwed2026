import {HttpError} from "./http";
export function uncertainSend(error:unknown) {
 if(!(error instanceof HttpError))return true;
 if(error.code.startsWith('WHATSAPP_')||['UAZAPI_SERVER_NOT_CONFIGURED','UAZAPI_CONFIG_INVALID','CAPABILITY_DISABLED'].includes(error.code))return false;
 if(/^UAZAPI_HTTP_4\d\d$/.test(error.code))return false;
 return true;
}
