"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {adminApi} from "./api";
export type InboxItem={id:string;contact_phone?:string|null;contact_name?:string|null;line_name?:string|null;mode:"AGENT"|"HUMAN";external_id:string;claimed_by:string|null;claimed_by_name:string|null;agent_error:string|null;opted_out_at:string|null;lead_name:string|null;lead_stage:string|null;edition_name:string|null;last_message:string|null;last_direction:string|null;last_status:string|null;last_message_at:string|null;updated_at:string};
export type Message={id:string;checkout_id?:string|null;external_id:string|null;direction:"IN"|"OUT";type:string;body:string|null;status:string;actor_name:string|null;last_error:string|null;created_at:string};
type Conversation=InboxItem & {lead_id:string|null;lead_email:string|null;lead_phone:string|null;company:string|null;city_state:string|null;summary:string|null;agent_paused_at:string|null;claimed_at:string|null};
type Detail={conversation:Conversation;messages:Message[];nextCursor:string|null};
type User={id:string;name:string;roles:string[];environment?:string;inboundHost?:string;capabilities?:{manualSend:boolean;agent:boolean}};
function merge<T extends {id:string}>(previous:T[],incoming:T[],compare:(a:T,b:T)=>number) {
  const items=new Map(previous.map(item=>[item.id,item]));for(const item of incoming)items.set(item.id,item);return [...items.values()].sort(compare);
}
function useSerializedPolling(task:(signal:AbortSignal)=>Promise<void>) {
  useEffect(()=>{
    const controller=new AbortController();let running=false;let timer:ReturnType<typeof setTimeout>|undefined;
    const run=async()=>{
      if(running||controller.signal.aborted)return;
      clearTimeout(timer);running=true;
      try {await task(controller.signal);} finally {running=false;if(!controller.signal.aborted)timer=setTimeout(()=>void run(),document.visibilityState==='visible'?5000:30000);}
    };
    const visible=()=>{if(document.visibilityState==='visible')void run();};
    void run();document.addEventListener('visibilitychange',visible);
    return()=>{controller.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
  },[task]);
}
const messageOrder=(a:Message,b:Message)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);
const inboxOrder=(a:InboxItem,b:InboxItem)=>(b.last_message_at??b.updated_at).localeCompare(a.last_message_at??a.updated_at)||b.id.localeCompare(a.id);
export function useInboxData(query:string,mode:string,failuresOnly:boolean,selectedId:string|null) {
  const [items,setItems]=useState<InboxItem[]>([]);const [detail,setDetail]=useState<Detail|null>(null);const [me,setMe]=useState<User|null>(null);
  const [actionError,setError]=useState('');const [listError,setListError]=useState('');const [detailError,setDetailError]=useState('');const [userError,setUserError]=useState('');const [loading,setLoading]=useState(true);const [detailLoading,setDetailLoading]=useState(false);
  const [nextList,setNextList]=useState<string|null>(null);const [nextMessage,setNextMessage]=useState<string|null>(null);
  const [paging,setPaging]=useState(false);const [listFetching,setListFetching]=useState(false);const [detailFetching,setDetailFetching]=useState(false);const [lastUpdated,setLastUpdated]=useState<number|null>(null);
  const key=JSON.stringify([query,mode,failuresOnly]);
  const listState=useRef({key,sequence:0,busy:false,extended:false});
  const detailState=useRef({id:selectedId,sequence:0,busy:false,extended:false});
  const lifetime=useRef<AbortController|null>(null);
  useEffect(()=>{lifetime.current=new AbortController();return()=>lifetime.current?.abort();},[]);
  useEffect(()=>{listState.current={key,sequence:listState.current.sequence+1,busy:false,extended:false};setItems([]);setNextList(null);setLoading(true);},[key]);
  useEffect(()=>{detailState.current={id:selectedId,sequence:detailState.current.sequence+1,busy:false,extended:false};setDetail(null);setDetailError('');setNextMessage(null);setDetailLoading(Boolean(selectedId));},[selectedId]);
  useEffect(()=>{const signal=lifetime.current!.signal;adminApi<User>('/api/admin/me',{signal}).then(user=>{if(!signal.aborted)setMe(user);}).catch(reason=>{if(!signal.aborted)setUserError(String(reason.message??reason));});},[]);
  const loadList=useCallback(async(signal:AbortSignal,cursor?:string)=>{
    const state=listState.current;if(state.key!==key||state.busy)return;state.busy=true;setListFetching(true);
    const active=()=>!signal.aborted&&listState.current===state;
    try {
      const params=new URLSearchParams({q:query});if(mode)params.set('mode',mode);if(failuresOnly)params.set('failure','true');if(cursor)params.set('cursor',cursor);
      const result=await adminApi<{items:InboxItem[];nextCursor:string|null}>(`/api/admin/conversations?${params}`,{signal});
      if(!active())return;
      setItems(current=>merge(current,result.items,inboxOrder));
      if(cursor||!state.extended)setNextList(result.nextCursor);if(cursor)state.extended=true;
      setLastUpdated(Date.now());setListError('');
    } catch(reason) {if(active())setListError(reason instanceof Error?reason.message:'Não foi possível carregar as conversas.');}
    finally {state.busy=false;if(active()){setLoading(false);setListFetching(false);}}
  },[key,query,mode,failuresOnly]);
  const loadDetail=useCallback(async(signal:AbortSignal,before?:string)=>{
    const state=detailState.current;if(!selectedId||state.id!==selectedId||state.busy)return;state.busy=true;setDetailFetching(true);
    const active=()=>!signal.aborted&&detailState.current===state;
    try {
      const result=await adminApi<Detail>(`/api/admin/conversations/${selectedId}${before?`?before=${encodeURIComponent(before)}`:''}`,{signal});
      if(!active())return;
      setDetailError('');setDetail(current=>({...result,messages:merge(current?.conversation.id===selectedId?current.messages:[],result.messages,messageOrder)}));
      if(before||!state.extended)setNextMessage(result.nextCursor);if(before)state.extended=true;
    } catch(reason) {if(active())setDetailError(reason instanceof Error?reason.message:'Não foi possível carregar o histórico.');}
    finally {state.busy=false;if(active()){setDetailLoading(false);setDetailFetching(false);}}
  },[selectedId]);
  const listTask=useCallback((signal:AbortSignal)=>loadList(signal),[loadList]);const detailTask=useCallback((signal:AbortSignal)=>loadDetail(signal),[loadDetail]);
  useSerializedPolling(listTask);useSerializedPolling(detailTask);
  const refresh=async()=>{const signal=lifetime.current?.signal;if(signal)await Promise.all([loadList(signal),loadDetail(signal)]);};
  const more=async()=>{const signal=lifetime.current?.signal;if(!signal||!nextList||paging)return;setPaging(true);try{await loadList(signal,nextList);}finally{setPaging(false);}};
  const older=async()=>{const signal=lifetime.current?.signal;if(!signal||!nextMessage||paging)return;setPaging(true);try{await loadDetail(signal,nextMessage);}finally{setPaging(false);}};
  return {items,detail,me,error:actionError||userError||listError||detailError,setError,loading,detailLoading,listFetching,detailFetching,nextList,nextMessage,paging,lastUpdated,refresh,more,older};
}
