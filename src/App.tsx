import { useCallback, useEffect, useRef, useState } from "react";
import { MapCanvas, type Modo } from "./map/MapCanvas";
import { PainelPonto } from "./ui/PainelPonto";
import { PainelTrecho } from "./ui/PainelTrecho";
import { importarKml, importarMkf, importarPacote, type RelatorioImport } from "./io/pacote";
import { baixar, exportarMkf, nomeArquivoMkf } from "./io/exportar";
import {
  acharPonto,
  acharTrecho,
  adicionarPonto,
  adicionarTrecho,
  editarPonto,
  editarTrecho,
  moverPonto,
  removerPonto,
  removerTrecho,
  type PatchPonto,
  type PatchTrecho,
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
  /** URLs de exibição das fotos. */
  imagens: Map<string, string>;
  /** Bytes das fotos, para reempacotar no `.mkf` ao salvar. */
  blobs: Map<string, Uint8Array>;
  relatorio: RelatorioImport | null;
}

const VAZIO: Estado = { projeto: null, imagens: new Map(), blobs: new Map(), relatorio: null };

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
  const [selecionadoTrechoId, setSelecionadoTrechoId] = useState<string | null>(null);
  const [ligarDeId, setLigarDeId] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("selecionar");
  const [chaveEnq, setChaveEnq] = useState(0);
  const [salvo, setSalvo] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const imagensAntigas = useRef<Map<string, string>>(new Map());

  const projeto = estado.projeto;
  const selecionado = projeto ? acharPonto(projeto, selecionadoId) : undefined;
  const selecionadoTrecho = projeto ? acharTrecho(projeto, selecionadoTrechoId) : undefined;

  // Seleção de ponto e de trecho são mutuamente exclusivas.
  const selecionarPonto = useCallback((id: string | null) => {
    setSelecionadoId(id);
    if (id) setSelecionadoTrechoId(null);
  }, []);
  const selecionarTrecho = useCallback((id: string | null) => {
    setSelecionadoTrechoId(id);
    if (id) setSelecionadoId(null);
  }, []);

  const atualizar = useCallback((novo: Projeto) => {
    setEstado((e) => ({ ...e, projeto: novo }));
    setSalvo(false);
  }, []);

  const abrir = useCallback(async (arquivo: File) => {
    setErro(null);
    setCarregando(true);
    try {
      const nome = arquivo.name.toLowerCase();
      const resultado = nome.endsWith(".mkf")
        ? await importarMkf(await arquivo.arrayBuffer())
        : nome.endsWith(".zip")
          ? await importarPacote(await arquivo.arrayBuffer())
          : importarKml(await arquivo.text());

      // Cria as URLs de exibição a partir dos bytes; revoga as anteriores.
      for (const url of imagensAntigas.current.values()) URL.revokeObjectURL(url);
      const urls = new Map<string, string>();
      for (const [chave, bytes] of resultado.imagens) {
        // cast: lib.dom recente estreita BlobPart de um jeito que rejeita
        // Uint8Array<ArrayBufferLike>; os bytes são um ArrayBufferView válido.
        const parte = bytes as unknown as BlobPart;
        urls.set(chave, URL.createObjectURL(new Blob([parte], { type: "image/jpeg" })));
      }
      imagensAntigas.current = urls;

      setEstado({
        projeto: resultado.projeto,
        imagens: urls,
        blobs: resultado.imagens,
        relatorio: resultado.relatorio,
      });
      setSelecionadoId(null);
      setSelecionadoTrechoId(null);
      setLigarDeId(null);
      setModo("selecionar");
      setChaveEnq((c) => c + 1);
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    } finally {
      setCarregando(false);
    }
  }, []);

  const salvar = useCallback(async () => {
    if (!projeto) return;
    try {
      const blob = await exportarMkf(projeto, estado.blobs);
      baixar(blob, nomeArquivoMkf(projeto));
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar o .mkf.");
    }
  }, [projeto, estado.blobs]);

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
      selecionarPonto(id);
      setModo("selecionar"); // adiciona um; para inserir outro, clica de novo na ferramenta
    },
    [projeto, modo, atualizar, selecionarPonto],
  );

  // Modo ligar: 1º clique escolhe a origem, 2º cria o trecho.
  const onPontoClicado = useCallback(
    (id: string) => {
      if (!projeto || modo !== "ligar") return;
      if (!ligarDeId) {
        setLigarDeId(id);
        return;
      }
      if (id !== ligarDeId) {
        const { projeto: novo } = adicionarTrecho(projeto, ligarDeId, id);
        atualizar(novo);
      }
      setLigarDeId(null); // pronto para ligar o próximo par (continua no modo)
    },
    [projeto, modo, ligarDeId, atualizar],
  );

  // Esc sai do modo atual / desmarca tudo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModo("selecionar");
        setLigarDeId(null);
        setSelecionadoId(null);
        setSelecionadoTrechoId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rel = estado.relatorio;
  const emAdd = typeof modo === "object";
  const emLigar = modo === "ligar";

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
              onClick={() => {
                setLigarDeId(null);
                setModo(emAdd ? "selecionar" : { adicionar: "postePropostoo" });
              }}
            >
              + Adicionar ponto
            </button>
          )}
          {projeto && (
            <button
              className={`btn${emLigar ? " btn-ativo" : ""}`}
              onClick={() => {
                setLigarDeId(null);
                selecionarPonto(null);
                selecionarTrecho(null);
                setModo(emLigar ? "selecionar" : "ligar");
              }}
            >
              Ligar postes
            </button>
          )}
          {projeto && (
            <button
              className={`btn${salvo ? "" : " btn-ativo"}`}
              onClick={() => void salvar()}
              title="Baixa o projeto editado como .mkf (reabra depois para continuar)"
            >
              {salvo ? "Salvar .mkf" : "● Salvar .mkf"}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".zip,.kml,.mkf"
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
            {!salvo && <span className="resumo-aviso"> · não salvo</span>}
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
          selecionadoTrechoId={selecionadoTrechoId}
          modo={modo}
          ligarDeId={ligarDeId}
          chaveEnquadramento={chaveEnq}
          onSelecionar={selecionarPonto}
          onSelecionarTrecho={selecionarTrecho}
          onMoverPonto={onMoverPonto}
          onAdicionarPonto={onAdicionarPonto}
          onPontoClicado={onPontoClicado}
        />

        {!projeto && !carregando && (
          <div className="vazio">
            <div className="vazio-card">
              <div className="vazio-icone">◆</div>
              <h1>Abra o trabalho de campo</h1>
              <p>
                Arraste aqui o export do app (o <strong>“exportar tudo”</strong>, um <code>.zip</code>),
                um <code>.kml</code> solto, ou um projeto <code>.mkf</code> que você já salvou. Depois
                é só editar — mover, corrigir coordenada, adicionar e remover pontos — e salvar.
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

        {emLigar && (
          <div className="modo-bar">
            <span>
              {ligarDeId
                ? "Agora clique no poste de destino"
                : "Ligar rede: clique no poste de origem"}
            </span>
            <button
              className="btn btn-mini"
              onClick={() => {
                setLigarDeId(null);
                setModo("selecionar");
              }}
            >
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

        {selecionadoTrecho && projeto && (
          <PainelTrecho
            key={selecionadoTrecho.id}
            trecho={selecionadoTrecho}
            onEditar={(patch: PatchTrecho) =>
              atualizar(editarTrecho(projeto, selecionadoTrecho.id, patch))
            }
            onExcluir={() => {
              atualizar(removerTrecho(projeto, selecionadoTrecho.id));
              setSelecionadoTrechoId(null);
            }}
            onFechar={() => setSelecionadoTrechoId(null)}
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
