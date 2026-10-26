import { describe,expect,it,vi } from "vitest";
import { errorResponse } from "@/server/http";
import { isDatabaseUnavailable } from "@/server/database-availability";
describe('indisponibilidade do D1',()=>{
 it('retorna 503 sanitizado para cota e mantém erros de código distintos',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const response=errorResponse(new Error('D1_ERROR: Your account has exceeded daily row write limit; synthetic-private-sql'));
  expect(response.status).toBe(503);expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
  expect(await response.json()).toMatchObject({code:'DATABASE_UNAVAILABLE',reason:'DAILY_QUOTA'});
  expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-private-sql');
  expect(isDatabaseUnavailable(new Error('D1_ERROR: no such column'))).toBe(false);
  log.mockRestore();
 });
 it('informa a renovação diária em UTC e mantém indisponibilidade transitória separada',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-26T14:00:00Z'));
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  try{
   const quota=errorResponse(new Error("Your account has exceeded D1's free tier daily row read limit"));
   expect(quota.headers.get('retry-after')).toBe('36000');
   expect(await quota.json()).toMatchObject({code:'DATABASE_UNAVAILABLE',reason:'DAILY_QUOTA',retryAt:'2026-10-27T00:00:00.000Z'});
   const transient=errorResponse(new Error('D1_ERROR: database unavailable'));
   expect(transient.headers.get('retry-after')).toBe('60');
   expect(await transient.json()).not.toHaveProperty('reason');
  }finally{log.mockRestore();vi.useRealTimers();}
 });
});
