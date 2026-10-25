import {requireAccessUser} from '@/server/auth/access';
import {errorResponse,json} from '@/server/http';
import {siteKnowledge} from '@/server/site-knowledge';
import {sha256} from '@/server/normalization';
import type {KnowledgeOverview} from '@/features/conversations/knowledge';

export async function GET(request:Request){
 try{
  await requireAccessUser(request,['admin','gestor']);
  const data:KnowledgeOverview={
   version:siteKnowledge.version,fingerprint:await sha256(JSON.stringify(siteKnowledge)),sources:siteKnowledge.sources,
   projects:siteKnowledge.projects.map(p=>({id:p.id,name:p.name,description:p.description,url:p.href,priceStatus:siteKnowledge.priceCoverage[p.id as keyof typeof siteKnowledge.priceCoverage],formats:'formats' in p.details?[...p.details.formats]:[]})),
   editions:siteKnowledge.publishedEditions.map(e=>({name:e.name,period:e.period,cash:e.publishedCash,installments:e.publishedInstallment,capacity:e.publishedCapacity,url:e.url,included:e.included})),
   unpublished:siteKnowledge.famtour.unpublished,registration:`${siteKnowledge.famtour.registration.interest} ${siteKnowledge.famtour.registration.detailPage}`,policy:siteKnowledge.commercialPolicy,
  };
  return json(data);
 }catch(error){return errorResponse(error);}
}
