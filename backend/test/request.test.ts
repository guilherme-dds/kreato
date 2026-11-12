import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePositiveInt, queryLimit, queryString } from "../src/utils/request.js";

describe("parâmetros de requisição", () => {
  it("ids só aceitam inteiros positivos", () => {
    assert.equal(parsePositiveInt("42"), 42);
    assert.equal(parsePositiveInt("0"), null);
    assert.equal(parsePositiveInt("-3"), null);
    assert.equal(parsePositiveInt("1.5"), null);
    assert.equal(parsePositiveInt("abc"), null);
  });

  it("query vazia é ignorada", () => {
    assert.equal(queryString("  "), null);
    assert.equal(queryString(" x "), "x");
    assert.equal(queryString(["x"]), null);
  });

  it("limite de página respeita padrão e teto", () => {
    assert.equal(queryLimit(undefined, 60, 1000), 60);
    assert.equal(queryLimit("120", 60, 1000), 120);
    assert.equal(queryLimit("999999", 60, 1000), 1000);
    assert.equal(queryLimit("-5", 60, 1000), 60);
  });
});
