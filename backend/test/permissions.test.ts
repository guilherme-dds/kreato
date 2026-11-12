import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allowedTargets,
  canCreateInStage,
  canDeleteContent,
  canMoveContent,
  contentPermissions,
  forbiddenFields,
} from "../src/utils/permissions.js";
import { canManageWorkspace, normalizeWorkspaceRole } from "../src/utils/workspaces.js";

describe("papéis do workspace", () => {
  it("papel desconhecido vira EDITOR (o menor acesso)", () => {
    assert.equal(normalizeWorkspaceRole("dono"), "DONO");
    assert.equal(normalizeWorkspaceRole("admin"), "EDITOR");
    assert.equal(normalizeWorkspaceRole(undefined), "EDITOR");
  });

  it("só DONO e GESTOR gerenciam", () => {
    assert.equal(canManageWorkspace("DONO"), true);
    assert.equal(canManageWorkspace("GESTOR"), true);
    assert.equal(canManageWorkspace("ROTEIRISTA"), false);
    assert.equal(canManageWorkspace("EDITOR"), false);
  });
});

describe("movimentação no pipeline", () => {
  it("aprovar roteiro (Roteiro → Gravação) é só de quem gerencia", () => {
    assert.equal(canMoveContent("GESTOR", "ROTEIRO", "GRAVACAO"), true);
    assert.equal(canMoveContent("ROTEIRISTA", "ROTEIRO", "GRAVACAO"), false);
    assert.equal(canMoveContent("EDITOR", "ROTEIRO", "GRAVACAO"), false);
  });

  it("cada papel se move só na sua faixa", () => {
    assert.deepEqual(allowedTargets("ROTEIRISTA", "IDEIA"), ["IDEIA", "ROTEIRO"]);
    assert.deepEqual(allowedTargets("EDITOR", "GRAVACAO"), ["GRAVACAO", "EDICAO"]);
    assert.deepEqual(allowedTargets("EDITOR", "ROTEIRO"), []);
    assert.equal(allowedTargets("DONO", "PUBLICADO").length, 6);
  });

  it("EDITOR não cria conteúdo (nem levando ideia ao pipeline)", () => {
    assert.equal(canCreateInStage("EDITOR", "ROTEIRO"), false);
    assert.equal(canCreateInStage("ROTEIRISTA", "ROTEIRO"), true);
    assert.equal(canCreateInStage("ROTEIRISTA", "GRAVACAO"), false);
  });
});

describe("edição e exclusão", () => {
  it("roteirista não mexe em agenda/publicação nem em texto depois da aprovação", () => {
    assert.deepEqual(forbiddenFields("ROTEIRISTA", "ROTEIRO", ["titulo", "dataPublicacao"]), ["dataPublicacao"]);
    assert.deepEqual(forbiddenFields("ROTEIRISTA", "GRAVACAO", ["roteiro"]), ["roteiro"]);
    assert.deepEqual(forbiddenFields("GESTOR", "AGENDADO", ["roteiro", "urlPublicacao"]), []);
  });

  it("roteirista exclui só o que é dele e ainda está em Ideia/Roteiro", () => {
    assert.equal(canDeleteContent("ROTEIRISTA", "ROTEIRO", true), true);
    assert.equal(canDeleteContent("ROTEIRISTA", "ROTEIRO", false), false);
    assert.equal(canDeleteContent("ROTEIRISTA", "EDICAO", true), false);
    assert.equal(canDeleteContent("EDITOR", "EDICAO", true), false);
    assert.equal(canDeleteContent("DONO", "PUBLICADO", false), true);
  });

  it("resumo enviado ao frontend", () => {
    const editor = contentPermissions("EDITOR", "EDICAO", false);
    assert.equal(editor.editarTexto, false);
    assert.equal(editor.aprovarRoteiro, false);
    assert.deepEqual(editor.moverPara, ["GRAVACAO", "EDICAO"]);
    const gestor = contentPermissions("GESTOR", "ROTEIRO", false);
    assert.equal(gestor.aprovarRoteiro, true);
    assert.equal(gestor.solicitarAjustes, true);
  });
});
