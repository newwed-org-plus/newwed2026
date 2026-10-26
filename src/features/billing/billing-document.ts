export function normalizeBillingDocument(value:string) { return value.replace(/[./\s-]/g,'').toUpperCase(); }
export function validBillingDocument(value:string) {
 const document=normalizeBillingDocument(value);
 if(/^(.)\1+$/.test(document))return false;
 if(/^\d{11}$/.test(document)) {
  const digit=(length:number)=>{const sum=Array.from(document.slice(0,length)).reduce((total,char,index)=>total+Number(char)*(length+1-index),0);const remainder=(sum*10)%11;return remainder===10?0:remainder;};
  return digit(9)===Number(document[9])&&digit(10)===Number(document[10]);
 }
 if(!/^[A-Z0-9]{12}\d{2}$/.test(document))return false;
 const digit=(base:string)=>{const weights=base.length===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];const remainder=Array.from(base).reduce((sum,char,index)=>sum+(char.charCodeAt(0)-48)*weights[index],0)%11;return remainder<2?0:11-remainder;};
 return digit(document.slice(0,12))===Number(document[12])&&digit(document.slice(0,13))===Number(document[13]);
}
