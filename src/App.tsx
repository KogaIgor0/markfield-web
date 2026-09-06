import { useCallback, useRef, useState } from "react";
import { MapCanvas } from "./map/MapCanvas";
import { importarKml, importarPacote, type RelatorioImport } from "./io/pacote";
import type { Projeto } from "./domain/model";

/**
 * Shell do Markfield Web.
 *
 * Fase 1: abrir o export do app (ZIP "exportar tudo" ou KML solto) e reconstruir
 * o projeto sobre o satélite — postes, fotos e linhas, com metadados no clique.
 * Editor com mouse (M2), domain pack/DXF (M3), motor (M4) e copiloto (M5) entram
 * nas fases seguintes, cada um como uma região desta shell.
 */

interface Estado {
  projeto: Projeto | null;
  imagens: Map<string, string>;
  relatorio: RelatorioImport | null;
}

const VAZIO: Estado = { projeto: null, imagens: new Map(), relatorio: null };

export function App() {
  const [estado, setEstado] = useState<Estado>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const imagensAntigas = useRef<Map<string, string>>(new Map());

  const abrir = useCallback(async (arquivo: File) => {
    setErro(null);
    setCarregando(true);
    try {
      const ehZip = /\.zip$/i.test(arquivo.name);
      const resultado = ehZip
        ? await importarPacote(await arquivo.arrayBuffer())
        : importarKml(await arquivo.text());

      // Libera as object URLs do import anterior.
      for (const url of imagensAntigas.current.values()) URL.revokeObjectURL(url);
      imagensAntigas.current = resultado.imagens;

      setEstado({
        projeto: resultado.projeto,
        imagens: resultado.imagens,
        relatorio: resultado.relatorio,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    } finally {
      setCarregando(false);
    }
  }, []);

  const aoSoltar = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setArrastando(false);
      const arquivo = e.dataTransfer.files?.[0];
      if (arquivo) void abrir(arquivo);
    },
    [abrir],
  );

  const rel = estado.relatorio;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="spark">◆</span> Markfield Web
        </span>
        <span className="phase-tag">Fase 1 · importar campo</span>

        <div className="topbar-acoes">
          <button className="btn" onClick={() => inputRef.current?.click()} disabled={carregando}>
            {carregando ? "Abrindo…" : estado.projeto ? "Abrir outro" : "Abrir projeto"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.kml"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void abrir(f);
              e.target.value = "";
            }}
          />
        </div>

        {rel && (
          <span className="resumo">
            <strong>{rel.nomeProjeto}</strong> · {rel.pontos} pontos · {rel.fotos} fotos
            {rel.fotosBaixaConfianca > 0 && (
              <span className="resumo-aviso"> ({rel.fotosBaixaConfianca} GPS fraco)</span>
            )}
            {rel.trechos + rel.linhasLivres > 0 && ` · ${rel.trechos + rel.linhasLivres} linhas`}
          </span>
        )}
      </header>

      <main
        className={`workspace${arrastando ? " arrastando" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={aoSoltar}
      >
        <MapCanvas projeto={estado.projeto} imagens={estado.imagens} />

        {!estado.projeto && !carregando && (
          <div className="vazio">
            <div className="vazio-card">
              <div className="vazio-icone">◆</div>
              <h1>Abra o trabalho de campo</h1>
              <p>
                Arraste aqui o export do app (o <strong>“exportar tudo”</strong>, um <code>.zip</code>)
                — ou um <code>.kml</code> solto. Os postes, as fotos e as linhas aparecem sobre o
                satélite, prontos para conferir.
              </p>
              <button className="btn btn-primario" onClick={() => inputRef.current?.click()}>
                Escolher arquivo
              </button>
            </div>
          </div>
        )}

        {estado.projeto && (
          <div className="legenda">
            <span><i className="pin" style={{ background: "#f59e0b" }} /> Poste proposto</span>
            <span><i className="pin" style={{ background: "#9e9e9e" }} /> Genérico</span>
            <span><i className="pin" style={{ background: "#38bdf8" }} /> Transformador</span>
            <span><i className="pin" style={{ background: "#4caf50" }} /> Foto</span>
          </div>
        )}

        {erro && (
          <div className="erro" role="alert">
            {erro}
            <button className="erro-x" onClick={() => setErro(null)} aria-label="Fechar">×</button>
          </div>
        )}
      </main>
    </div>
  );
}
