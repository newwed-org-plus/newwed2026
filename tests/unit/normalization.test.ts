import { describe,expect,it } from "vitest";
import { normalizeEmail,normalizePhone,sha256 } from "@/server/normalization";

describe("normalização",() => {
  it("normaliza e-mail e telefone brasileiro em E.164",() => {
    expect(normalizeEmail(" Pessoa@Example.COM ")).toBe("pessoa@example.com");
    expect(normalizePhone("(81) 99999-0000")).toBe("+5581999990000");
    expect(normalizePhone("(55) 99999-0000")).toBe("+5555999990000");
    expect(normalizePhone("+55 55 99999-0000")).toBe("+5555999990000");
  });
  it("rejeita telefone incompleto",() => expect(() => normalizePhone("123")).toThrow("Telefone inválido"));
  it("gera hash determinístico",async () => expect(await sha256("lead")).toBe(await sha256("lead")));
});
