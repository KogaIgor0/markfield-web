import { useCallback, useEffect, useRef, useState } from "react";
import { MapCanvas, type Modo } from "./map/MapCanvas";
import { PainelPonto } from "./ui/PainelPonto";
import { importarKml, importarPacote, type RelatorioImport } from "./io/pacote";
import {
  acharPonto,
  adicionarPonto,
  editarPonto,
  moverPonto,
  removerPonto,
  type PatchPonto,
} from "./domain/edicao";
import type { LatLng, Projeto, TipoPonto } from "./domain/model";

/**
 * Shell do Markfield Web.
 *
 * Fase 2: além de importar (Fase 1), o projetista EDITA — seleciona, arrasta,
 * corrige a coordenada de forma exata, edita atributos, adiciona e remove pontos.
 * Toda mudança passa pelo motor de edição (domain/edicao.ts).
 */

interface Estado {
  projeto: Projeto | null;
  imagens: Map<string, string>;
  relatorio: RelatorioImport | null;
}

const VAZIO: Estado = { projeto: null, imagens: new Map(), relatorio: null };

const TIPOS_ADD: { valor: TipoPonto; rotulo: string }[] = [
  { valor: "postePropostoo", rotulo: "Poste proposto" },
  { valor: "generico", rotulo: "Genérico" },
  { valor: "transformador", rotulo: "Transformador" },
];

export function App() {
  const [estado, setEstado] = useState<Estado>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("selecionar");
  const [chaveEnq, setChaveEnq] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const imagensAntigas = useRef<Map<string, string>>(new Map());

  const projeto = estado.projeto;
  const selecionado = projeto ? acharPonto(projeto, selecionadoId) : undefined;

  const atualizar = useCallback((novo: Projeto) => {
    setEstado((e) => ({ ...e, projeto: novo }));
  }, []);

  const abrir = useCallback(async (arquivo: File) => {
    setErro(null);
    setCarregando(true);
    try {
      const ehZip = /\.zip$/i.test(arquivo.name);
      const resultado = ehZip
        ? await importarPacote(await arquivo.arrayBuffer())
        : importarKml(await arquivo.text());
      for (const url of imagensAntigas.current.values()) URL.revokeObjectURL(url);
      imagensAntigas.current = resultado.imagens;
      setEstado({
        projeto: resultado.projeto,
        imagens: resultado.imagens,
        relatorio: resultado.relatorio,
      });
      setSelecionadoId(null);
      setModo("selecionar");
      setChaveEnq((c) => c + 1);
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

  // Callbacks de edição do mapa.
  const onMoverPonto = useCallback(
    (id: string, wgs84: LatLng) => {
      if (projeto) atualizar(moverPonto(projeto, id, wgs84));
    },
    [projeto, atualizar],
  );

  const onAdicionarPonto = useCallback(
    (wgs84: LatLng) => {
      if (!projeto || typeof modo !== "object") return;
      const { projeto: novo, id } = adicionarPonto(projeto, modo.adicionar, wgs84);
      atualizar(novo);
      setSelecionadoId(id);
      setModo("selecionar"); // adiciona um; para inserir outro, clica de novo na ferramenta
    },
    [projeto, modo, atualizar],
  );

  // Esc sai do modo adicionar / desmarca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModo("selecionar");
        setSelecionadoId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rel = estado.relatorio;
  const emAdd = typeof modo === "object";

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          <span className="spark">◆</span> Markfield Web
        </span>
        <span className="phase-tag">Fase 2 · editor</span>

        <div className="topbar-acoes">
          <button className="btn" onClick={() => inputRef.current?.click()} disabled={carregando}>
            {carregando ? "Abrindo…" : projeto ? "Abrir outro" : "Abrir projeto"}
          </button>
          {projeto && (
            <button
              className={`btn${emAdd ? " btn-ativo" : ""}`}
              onClick={() => setModo(emAdd ? "selecionar" : { adicionar: "postePropostoo" })}
            >
              + Adicionar ponto
            </button>
          )}
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
            <strong>{rel.nomeProjeto}</strong> · {projeto?.pontos.length} pontos · {rel.fotos} fotos
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
        <MapCanvas
          projeto={projeto}
          imagens={estado.imagens}
          selecionadoId={selecionadoId}
          modo={modo}
          chaveEnquadramento={chaveEnq}
          onSelecionar={setSelecionadoId}
          onMoverPonto={onMoverPonto}
          onAdicionarPonto={onAdicionarPonto}
        />

        {!projeto && !carregando && (
          <div className="vazio">
            <div className="vazio-card">
              <div className="vazio-icone">◆</div>
              <h1>Abra o trabalho de campo</h1>
              <p>
                Arraste aqui o export do app (o <strong>“exportar tudo”</strong>, um <code>.zip</code>)
                — ou um <code>.kml</code> solto. Depois é só editar: mover, corrigir coordenada,
                adicionar e remover pontos.
              </p>
              <button className="btn btn-primario" onClick={() => inputRef.current?.click()}>
                Escolher arquivo
              </button>
            </div>
          </div>
        )}

        {emAdd && (
          <div className="modo-bar">
            <span>Clique no mapa para adicionar:</span>
            <select
              value={modo.adicionar}
              onChange={(e) => setModo({ adicionar: e.target.value as TipoPonto })}
            >
              {TIPOS_ADD.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
            <button className="btn btn-mini" onClick={() => setModo("selecionar")}>
              Sair (Esc)
            </button>
          </div>
        )}

        {selecionado && projeto && (
          <PainelPonto
            key={`${selecionado.id}:${selecionado.wgs84.lat},${selecionado.wgs84.lng}`}
            ponto={selecionado}
            onEditar={(patch: PatchPonto) => atualizar(editarPonto(projeto, selecionado.id, patch))}
            onMover={(wgs84) => atualizar(moverPonto(projeto, selecionado.id, wgs84))}
            onExcluir={() => {
              atualizar(removerPonto(projeto, selecionado.id));
              setSelecionadoId(null);
            }}
            onFechar={() => setSelecionadoId(null)}
          />
        )}

        {projeto && (
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
