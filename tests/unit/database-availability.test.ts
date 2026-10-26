import { describe,expect,it,vi } from "vitest";
import { errorResponse } from "@/server/http";
import { isDatabaseUnavailable } from "@/server/database-availability";
describe('indisponibilidade do D1',()=>{
 it('retorna 503 sanitizado para cota e mantém erros de código distintos',async()=>{
  const log=vi.spyOn(console,'error').mockImplementation(()=>{});
  const response=errorResponse(new Error('D1_ERROR: Your account has exceeded daily row write limit; synthetic-private-sql'));
  expect(response.status).toBe(503);expect(response.headers.get('retry-after')).toBe('60');
  expect(await response.json()).toMatchObject({code:'DATABASE_UNAVAILABLE'});
  expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-private-sql');
  expect(isDatabaseUnavailable(new Error('D1_ERROR: no such column'))).toBe(false);
  log.mockRestore();
 });
});
