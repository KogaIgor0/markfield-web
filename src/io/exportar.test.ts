import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { projetoVazio, type Foto, type Ponto } from "../domain/model";
import { novoId } from "../domain/ids";
import { montarZipMkf } from "./exportar";
import { importarMkf } from "./pacote";

/**
 * Fecha o ciclo importar → editar → salvar → reabrir: o `.mkf` gerado precisa
 * voltar idêntico (IDs, atributos e os BYTES das fotos). É o que garante que a
 * edição do projetista não se perde.
 */
describe(".mkf salvar → reabrir", () => {
  it("preserva o projeto (ids, postePropostoo) e os bytes das fotos", async () => {
    const projeto = projetoVazio("Sônia");
    projeto.meta.concessionaria = "neoenergia";
    const p: Ponto = {
      id: novoId("pt"),
      tipo: "postePropostoo",
      numero: "1",
      wgs84: { lat: -20.7142737, lng: -50.0617086 },
      origem: "web",
      observacao: "12600 trafo",
    };
    projeto.pontos.push(p);
    const foto: Foto = {
      id: novoId("ft"),
      nome: "Foto1",
      arquivo: "fotos/Foto1.jpg",
      wgs84: { lat: -20.71, lng: -50.06 },
    };
    projeto.fotos.push(foto);
    const bytesFoto = new Uint8Array([255, 216, 255, 7, 42, 0, 13]);

    const zipBytes = await montarZipMkf(projeto, new Map([["Foto1", bytesFoto]])).generateAsync({
      type: "uint8array",
    });
    const r = await importarMkf(zipBytes);

    expect(r.projeto.meta.nome).toBe("Sônia");
    expect(r.projeto.meta.concessionaria).toBe("neoenergia");
    expect(r.projeto.pontos).toHaveLength(1);
    expect(r.projeto.pontos[0].id).toBe(p.id);
    expect(r.projeto.pontos[0].tipo).toBe("postePropostoo");
    expect(r.projeto.pontos[0].observacao).toBe("12600 trafo");
    expect(r.projeto.fotos[0].id).toBe(foto.id);
    expect(Array.from(r.imagens.get("Foto1")!)).toEqual(Array.from(bytesFoto));
  });

  it("rejeita um .mkf sem projeto.json", async () => {
    const vazio = await new JSZip().generateAsync({ type: "uint8array" });
    await expect(importarMkf(vazio)).rejects.toThrow(/projeto\.json/);
  });
});
