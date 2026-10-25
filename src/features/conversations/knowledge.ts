export type KnowledgeOverview={
 version:string;fingerprint:string;sources:string[];
 projects:Array<{id:string;name:string;description:string;url:string;priceStatus:string;formats:Array<{title:string;description:string}>}>;
 editions:Array<{name:string;period:string;cash:string;installments:string;capacity:number;url:string;included:readonly string[]}>;
 unpublished:readonly string[];registration:string;policy:string;
};
