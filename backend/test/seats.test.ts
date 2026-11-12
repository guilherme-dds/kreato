import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { membersWithoutSeat } from "../src/utils/workspaces.js";

const OWNER = "dono";
const member = (id: number, userId: string, day: number) => ({
  id,
  criadoEm: new Date(Date.UTC(2026, 0, day)),
  usuario: { id: userId },
});

describe("vagas do plano", () => {
  const members = [
    member(1, OWNER, 1),
    member(4, "d", 4),
    member(2, "b", 2),
    member(3, "c", 3),
  ];

  it("o dono ocupa a primeira vaga e os demais seguem a ordem de entrada", () => {
    // limite 3: dono + b + c; d fica sem vaga
    assert.deepEqual([...membersWithoutSeat(members, OWNER, 3)], [4]);
    // limite 1: só o dono
    assert.deepEqual([...membersWithoutSeat(members, OWNER, 1)].sort(), [2, 3, 4]);
  });

  it("plano sem limite não tira ninguém", () => {
    assert.equal(membersWithoutSeat(members, OWNER, Infinity).size, 0);
  });

  it("empate na data de entrada desempata pelo id", () => {
    const tied = [member(1, OWNER, 1), member(9, "x", 5), member(7, "y", 5)];
    assert.deepEqual([...membersWithoutSeat(tied, OWNER, 2)], [9]);
  });
});
