import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapCanvas, type Modo } from "./map/MapCanvas";
import { PainelPonto } from "./ui/PainelPonto";
import { PainelTrecho } from "./ui/PainelTrecho";
import { importarKml, importarMkf, importarPacote, type RelatorioImport } from "./io/pacote";
import { mesclarProjetos, type RelatorioMerge } from "./domain/merge";
import { direcoesDePonto, ehErro, estenderPonto, inserirNoVao } from "./domain/inserir";
import { PainelInserir, type EspecInsercao } from "./ui/PainelInserir";
import { baixar, exportarMkf, nomeArquivoMkf } from "./io/exportar";
import { gerarDxfCadastro } from "./io/dxf";
import {
  acharPonto,
  acharTrecho,
  adicionarPonto,
  adicionarTrecho,
  caboHerdado,
  definirFonte,
  editarPonto,
  editarTrecho,
  moverPonto,
  removerPonto,
  removerTrecho,
  type PatchPonto,
  type PatchTrecho,
} from "./domain/edicao";
import { modelarRede } from "./domain/rede";
import { classificarEstrutura, rotuloEstrutura, type EstruturaAtribuida } from "./domain/estrutura";
import {
  modelarEsforcos,
  ROTULO_CONDICAO,
  CONDICAO_PADRAO,
  type CondicaoVento,
  type EsforcoPoste,
} from "./domain/esforco";
import { validarAmarracao, proporAmarracao, LANCE_MAX_AMARRACAO_M } from "./domain/amarracao";
import {
  ajustarVao,
  comprimentoTrechoM,
  distanciaM,
  dividirVaos,
  infoVao,
  redividirVao,
  vaosLongos,
  VAO_MAXIMO_M,
} from "./domain/vaos";
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

/** Frase de resultado do merge, com o aviso de emenda (postes quase no mesmo lugar). */
function mensagemMerge(r: RelatorioMerge): string {
  const partes: string[] = [];
  partes.push(`+${r.pontosAdicionados} poste(s)`);
  if (r.trechosAdicionados) partes.push(`+${r.trechosAdicionados} trecho(s)`);
  if (r.fotosAdicionadas) partes.push(`+${r.fotosAdicionadas} foto(s)`);
  if (r.linhasAdicionadas) partes.push(`+${r.linhasAdicionadas} linha(s)`);
  let msg = `Mesclado${r.nomeIncorporado ? ` "${r.nomeIncorporado}"` : ""}: ${partes.join(", ")}.`;
  if (r.compartilhados) msg += ` ${r.compartilhados} elemento(s) em comum (mesmo arquivo continuado) — não duplicados.`;
  if (r.fotosRenomeadas) msg += ` ${r.fotosRenomeadas} foto(s) renomeada(s) por conflito de nome.`;
  if (r.duplicadasProximas.length) {
    const lista = r.duplicadasProximas
      .slice(0, 6)
      .map((d) => `P${d.numeroNovo ?? "?"}≈P${d.numeroBase ?? "?"} (${d.distanciaM.toFixed(1)} m)`)
      .join("; ");
    const extra = r.duplicadasProximas.length > 6 ? ` +${r.duplicadasProximas.length - 6}` : "";
    msg += ` ⚠️ ${r.duplicadasProximas.length} poste(s) quase no mesmo lugar (possível emenda das equipes): ${lista}${extra}. Revise e exclua o repetido, ou ligue os trechos.`;
  }
  return msg;
}

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
  const [modoRede, setModoRede] = useState(false);
  // Ponto habilitado para arraste no mapa (modo "mover", deliberado).
  const [movendoId, setMovendoId] = useState<string | null>(null);
  // Ponto de campo com a coordenada temporariamente destravada (após confirmar).
  const [destravadoId, setDestravadoId] = useState<string | null>(null);
  // Poste de referência escolhido no modo "Inserir ponto medido" (E-04).
  const [inserirRefId, setInserirRefId] = useState<string | null>(null);
  // Aviso neutro e passageiro (ex.: resultado da divisão de vãos).
  const [mensagem, setMensagem] = useState<string | null>(null);
  // Condição de vento (B4): define a tração de projeto usada no esforço.
  const [condicaoVento, setCondicaoVento] = useState<CondicaoVento>(CONDICAO_PADRAO);
  // Régua de medição e visibilidade das fotos.
  const [medicao, setMedicao] = useState<LatLng[]>([]);
  const [mostrarFotos, setMostrarFotos] = useState(true);
  const [mostrarNumeros, setMostrarNumeros] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);
  const imagensAntigas = useRef<Map<string, string>>(new Map());

  const projeto = estado.projeto;
  const selecionado = projeto ? acharPonto(projeto, selecionadoId) : undefined;
  const selecionadoTrecho = projeto ? acharTrecho(projeto, selecionadoTrechoId) : undefined;

  // Modelo de rede (B1): papéis, ângulos, rota — recomputado quando o projeto muda.
  const rede = useMemo(() => (projeto ? modelarRede(projeto) : null), [projeto]);
  const papeis = useMemo(() => {
    const m = new Map<string, string>();
    if (rede) for (const [id, pm] of rede.postes) m.set(id, pm.papel);
    return m;
  }, [rede]);
  const posteModelado = rede && selecionado ? rede.postes.get(selecionado.id) : undefined;

  // Ordem da rota (B1) por poste — usada pelo "inserir medido" pra saber o lado da carga.
  const ordemPorId = useMemo(() => {
    const m = new Map<string, number | undefined>();
    if (rede) for (const [id, pm] of rede.postes) m.set(id, pm.ordem);
    return m;
  }, [rede]);
  // Direções possíveis a partir do poste de referência (E-04).
  const direcoesInserir = useMemo(
    () => (projeto && inserirRefId ? direcoesDePonto(projeto, inserirRefId, ordemPorId) : null),
    [projeto, inserirRefId, ordemPorId],
  );
  const refInserir = projeto && inserirRefId ? acharPonto(projeto, inserirRefId) : undefined;

  // Estruturas (B3): código CE por poste, a partir do modelo de rede.
  const estruturas = useMemo(() => {
    const m = new Map<string, EstruturaAtribuida>();
    if (rede && projeto) {
      for (const p of projeto.pontos) {
        const pmod = rede.postes.get(p.id);
        if (pmod) m.set(p.id, classificarEstrutura(pmod, p));
      }
    }
    return m;
  }, [rede, projeto]);
  const rotulosEstrutura = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, e] of estruturas) {
      const r = rotuloEstrutura(e);
      if (r) m.set(id, r);
    }
    return m;
  }, [estruturas]);
  const resumoEstrutura = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of estruturas.values()) {
      if (!e.codigo) continue;
      m.set(e.codigo, (m.get(e.codigo) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [estruturas]);
  const estruturaSel = selecionado ? estruturas.get(selecionado.id) : undefined;

  // Esforço + estai (B4): resultante por poste e onde entra estai.
  const esforcos = useMemo(
    () => (projeto ? modelarEsforcos(projeto, { condicao: condicaoVento }) : null),
    [projeto, condicaoVento],
  );
  const estaiIds = useMemo(() => {
    const s = new Set<string>();
    if (esforcos) for (const [id, e] of esforcos.postes) if (e.pendente) s.add(id);
    return s;
  }, [esforcos]);
  const estaiInstaladoIds = useMemo(() => {
    const s = new Set<string>();
    if (esforcos) for (const [id, e] of esforcos.postes) if (e.precisaEstai && e.estais.length > 0) s.add(id);
    return s;
  }, [esforcos]);
  // Segmentos dos estais (poste → âncora) — um por estai instalado (E-01: pode ter vários).
  const estais = useMemo(() => {
    const arr: { de: LatLng; ate: LatLng }[] = [];
    if (esforcos && projeto) {
      for (const p of projeto.pontos) {
        const e = esforcos.postes.get(p.id);
        if (e) for (const es of e.estais) arr.push({ de: p.wgs84, ate: es.ate });
      }
    }
    return arr;
  }, [esforcos, projeto]);
  const esforcoSel: EsforcoPoste | undefined =
    esforcos && selecionado ? esforcos.postes.get(selecionado.id) : undefined;

  // Validação de amarração (CE4 a cada 500 m).
  const lancesLongos = useMemo(
    () => (projeto && rede ? validarAmarracao(projeto, estruturas, rede) : []),
    [projeto, estruturas, rede],
  );
  // Sugestão automática de CE4 (E-01/A): onde a norma pede amarração.
  const sugestoesCE4 = useMemo(
    () => (projeto && rede ? proporAmarracao(projeto, estruturas, rede) : []),
    [projeto, estruturas, rede],
  );
  const sugCE4Ids = useMemo(() => new Set(sugestoesCE4.map((s) => s.pontoId)), [sugestoesCE4]);

  // Comprimento total da régua de medição (m, em UTM).
  const medicaoTotalM = useMemo(() => {
    let s = 0;
    for (let i = 1; i < medicao.length; i++) s += distanciaM(medicao[i - 1], medicao[i]);
    return s;
  }, [medicao]);
  const emMedir = modo === "medir";

  // Vãos crus acima do máximo (B2): a primeira divisão econômica (100 m).
  const longos = useMemo(() => (projeto ? vaosLongos(projeto) : []), [projeto]);
  const compTrecho =
    projeto && selecionadoTrecho ? comprimentoTrechoM(projeto, selecionadoTrecho) : null;
  const vaoInfo =
    projeto && selecionadoTrecho ? infoVao(projeto, selecionadoTrecho.id) : null;

  // Seleção de ponto e de trecho são mutuamente exclusivas. Trocar de seleção
  // sempre RETRAVA: sai do modo mover e re-tranca coordenada de campo.
  const selecionarPonto = useCallback((id: string | null) => {
    setSelecionadoId(id);
    if (id) setSelecionadoTrechoId(null);
    setMovendoId(null);
    setDestravadoId(null);
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
      setMovendoId(null);
      setDestravadoId(null);
      setMensagem(null);
      setMedicao([]);
      setModo("selecionar");
      setChaveEnq((c) => c + 1);
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    } finally {
      setCarregando(false);
    }
  }, []);

  // Nível 2 da conexão APP↔Web: mescla um segundo .mkf (outra equipe/dia) no
  // projeto aberto. Identidade por id — ver domain/merge.ts.
  const mesclar = useCallback(
    async (arquivo: File) => {
      if (!projeto) return;
      setErro(null);
      setCarregando(true);
      try {
        const nome = arquivo.name.toLowerCase();
        if (!nome.endsWith(".mkf")) {
          throw new Error("Para mesclar, use um arquivo .mkf (o formato com ids estáveis).");
        }
        const inc = await importarMkf(await arquivo.arrayBuffer());
        const { projeto: merged, imagens: blobsMerged, relatorio } = mesclarProjetos(
          projeto,
          inc.projeto,
          { imagensBase: estado.blobs, imagensNovo: inc.imagens },
        );

        // Recria as URLs de exibição a partir dos blobs unificados.
        for (const url of imagensAntigas.current.values()) URL.revokeObjectURL(url);
        const urls = new Map<string, string>();
        for (const [chave, bytes] of blobsMerged) {
          const parte = bytes as unknown as BlobPart;
          urls.set(chave, URL.createObjectURL(new Blob([parte], { type: "image/jpeg" })));
        }
        imagensAntigas.current = urls;

        setEstado((e) => ({
          ...e,
          projeto: merged,
          imagens: urls,
          blobs: blobsMerged,
          // Atualiza os contadores do cabeçalho para o total mesclado.
          relatorio: e.relatorio
            ? {
                ...e.relatorio,
                pontos: merged.pontos.length,
                trechos: merged.trechos.length,
                linhasLivres: merged.linhasLivres.length,
                fotos: merged.fotos.length,
              }
            : e.relatorio,
        }));
        setSalvo(false);
        setSelecionadoId(null);
        setSelecionadoTrechoId(null);
        setChaveEnq((c) => c + 1); // reenquadra para mostrar o todo mesclado
        setMensagem(mensagemMerge(relatorio));
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Falha ao mesclar o .mkf.");
      } finally {
        setCarregando(false);
      }
    },
    [projeto, estado.blobs],
  );

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

  const exportarDxf = useCallback(() => {
    if (!projeto) return;
    try {
      const dxf = gerarDxfCadastro(projeto);
      const base = (projeto.meta.nome || "projeto").replace(/[^\p{L}\p{N}_-]+/gu, "_");
      baixar(new Blob([dxf], { type: "application/dxf" }), `${base}-cadastro.dxf`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao exportar o DXF.");
    }
  }, [projeto]);

  // Primeira divisão econômica: posta os vãos crus acima de 100 m. Não mexe nos
  // vãos já divididos/ajustados — o refino é por trecho (abaixo).
  const dividir = useCallback(() => {
    if (!projeto) return;
    const { projeto: novo, postesAdicionados } = dividirVaos(projeto);
    atualizar(novo);
    setSelecionadoTrechoId(null);
    setMensagem(
      `Vãos longos postados em ≤ ${VAO_MAXIMO_M} m (${postesAdicionados} poste(s)). Para ajustar um trecho, selecione-o no mapa.`,
    );
  }, [projeto, atualizar]);

  // Ajuste fino de UM vão (poste a mais/menos onde houve interferência).
  const ajustarVaoSel = useCallback(
    (delta: number) => {
      if (!projeto || !selecionadoTrechoId) return;
      const r = ajustarVao(projeto, selecionadoTrechoId, delta);
      if (!r) return;
      atualizar(r.projeto);
      setSelecionadoTrechoId(r.trechoSelId); // mantém o vão selecionado
      setMensagem(`Vão agora com ${r.vaos} trecho(s) de ~${r.subVaoM.toFixed(0)} m.`);
    },
    [projeto, selecionadoTrechoId, atualizar],
  );

  // Redivide SÓ o vão selecionado num alvo (m) — cada trecho tem seu terreno.
  const redividirVaoSel = useCallback(
    (alvoM: number) => {
      if (!projeto || !selecionadoTrechoId) return;
      const r = redividirVao(projeto, selecionadoTrechoId, alvoM);
      if (!r) return;
      atualizar(r.projeto);
      setSelecionadoTrechoId(r.trechoSelId);
      setMensagem(`Este vão: ${r.vaos} trecho(s) de ~${r.subVaoM.toFixed(0)} m (alvo ${alvoM} m).`);
    },
    [projeto, selecionadoTrechoId, atualizar],
  );

  const onMedirPonto = useCallback((wgs84: LatLng) => setMedicao((m) => [...m, wgs84]), []);

  // E-01/A: aceita a sugestão de CE4 (vira estrutura manual no poste).
  const aplicarCE4 = useCallback(
    (id: string) => {
      if (projeto) atualizar(editarPonto(projeto, id, { estruturaManual: "CE4" }));
    },
    [projeto, atualizar],
  );
  const aplicarTodasCE4 = useCallback(() => {
    if (!projeto) return;
    let p = projeto;
    for (const s of sugestoesCE4) p = editarPonto(p, s.pontoId, { estruturaManual: "CE4" });
    atualizar(p);
    setMensagem(`CE4 aplicada em ${sugestoesCE4.length} poste(s) — amarração conforme a norma.`);
  }, [projeto, sugestoesCE4, atualizar]);

  // E-04: crava o poste medido a partir do referência, na direção/distância escolhidas.
  const onInserirPonto = useCallback(
    (spec: EspecInsercao) => {
      if (!projeto || !inserirRefId) return;
      const r =
        spec.tipo === "vao"
          ? inserirNoVao(projeto, inserirRefId, spec.vizinhoId, spec.distanciaM)
          : estenderPonto(projeto, inserirRefId, spec.azimuteGraus, spec.distanciaM, {
              tipoCabo: caboHerdado(projeto, inserirRefId),
            });
      if (ehErro(r)) {
        setErro(r.erro);
        return;
      }
      atualizar(r.projeto);
      setInserirRefId(null); // volta a pedir o próximo poste de referência (encadeia)
      setMensagem(`Ponto P${r.projeto.pontos.find((p) => p.id === r.id)?.numero ?? ""} inserido a ${spec.distanciaM} m.`);
    },
    [projeto, inserirRefId, atualizar],
  );

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
  // Modo inserir: o clique escolhe o poste de referência.
  const onPontoClicado = useCallback(
    (id: string) => {
      if (!projeto) return;
      if (modo === "inserir") {
        setInserirRefId(id);
        return;
      }
      if (modo !== "ligar") return;
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
        setMovendoId(null);
        setDestravadoId(null);
        setMedicao([]);
        setInserirRefId(null);
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
          {/* Arquivo: abrir, salvar, exportar */}
          <div className="tb-grupo" role="group" aria-label="Arquivo">
            <button className="btn" onClick={() => inputRef.current?.click()} disabled={carregando}>
              {carregando ? "Abrindo…" : projeto ? "Abrir outro" : "Abrir projeto"}
            </button>
            {projeto && (
              <button
                className={`btn${salvo ? "" : " btn-ativo"}`}
                onClick={() => void salvar()}
                title="Baixa o projeto editado como .mkf (reabra depois para continuar)"
              >
                {salvo ? "Salvar .mkf" : "● Salvar .mkf"}
              </button>
            )}
            {projeto && (
              <button
                className="btn"
                onClick={() => mergeInputRef.current?.click()}
                disabled={carregando}
                title="Junta um segundo .mkf (outra equipe/dia) neste projeto, sem duplicar o que é comum"
              >
                Mesclar .mkf
              </button>
            )}
            {projeto && (
              <button
                className="btn"
                onClick={exportarDxf}
                title="Exporta o cadastro georreferenciado (UTM) em DXF, nas camadas da Elektro"
              >
                Exportar DXF
              </button>
            )}
          </div>

          {/* Editar: adicionar, ligar, dividir vãos */}
          {projeto && <span className="tb-sep" aria-hidden="true" />}
          {projeto && (
            <div className="tb-grupo" role="group" aria-label="Editar">
              <button
                className={`btn${emAdd ? " btn-ativo" : ""}`}
                onClick={() => {
                  setLigarDeId(null);
                  setMovendoId(null);
                  setModo(emAdd ? "selecionar" : { adicionar: "postePropostoo" });
                }}
              >
                + Adicionar ponto
              </button>
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
              <button
                className="btn"
                onClick={dividir}
                disabled={longos.length === 0}
                title={
                  longos.length
                    ? `Posta os vãos acima de ${VAO_MAXIMO_M} m (${longos.length}) em vãos ≤ ${VAO_MAXIMO_M} m. Depois, refine cada vão pelo painel do trecho.`
                    : `Todos os vãos já estão dentro de ${VAO_MAXIMO_M} m`
                }
              >
                Dividir vãos{longos.length ? ` (${longos.length})` : ""}
              </button>
              <button
                className={`btn${modo === "inserir" ? " btn-ativo" : ""}`}
                onClick={() => {
                  setLigarDeId(null);
                  setMovendoId(null);
                  setInserirRefId(null);
                  selecionarPonto(null);
                  selecionarTrecho(null);
                  setModo(modo === "inserir" ? "selecionar" : "inserir");
                }}
                title="Insere um poste no alinhamento da rede a uma distância medida a partir de um poste de referência"
              >
                Inserir medido
              </button>
            </div>
          )}

          {/* Ver: medir, fotos, rede */}
          {projeto && <span className="tb-sep" aria-hidden="true" />}
          {projeto && (
            <div className="tb-grupo" role="group" aria-label="Ver">
              <button
                className={`btn${emMedir ? " btn-ativo" : ""}`}
                onClick={() => {
                  setMedicao([]);
                  setLigarDeId(null);
                  setMovendoId(null);
                  selecionarPonto(null);
                  selecionarTrecho(null);
                  setModo(emMedir ? "selecionar" : "medir");
                }}
                title="Régua: clique no mapa para medir distâncias (metros)"
              >
                Medir
              </button>
              <button
                className={`btn${mostrarFotos ? "" : " btn-ativo"}`}
                onClick={() => setMostrarFotos((v) => !v)}
                title={mostrarFotos ? "Esconder as fotos do mapa" : "Mostrar as fotos do mapa"}
              >
                {mostrarFotos ? "Ocultar fotos" : "Mostrar fotos"}
              </button>
              <button
                className={`btn${mostrarNumeros ? " btn-ativo" : ""}`}
                onClick={() => setMostrarNumeros((v) => !v)}
                title="Mostra/esconde o número de cada poste no mapa"
              >
                Números
              </button>
              <button
                className={`btn btn-rede${modoRede ? " btn-ativo" : ""}`}
                onClick={() => setModoRede((v) => !v)}
                title="Classifica os postes (fonte, ângulo, derivação, fim) e traça a rota a partir da fonte"
              >
                Rede
              </button>
            </div>
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
          <input
            ref={mergeInputRef}
            type="file"
            accept=".mkf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void mesclar(f);
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
          selecionadoId={modo === "inserir" ? inserirRefId : selecionadoId}
          selecionadoTrechoId={selecionadoTrechoId}
          modo={modo}
          ligarDeId={ligarDeId}
          chaveEnquadramento={chaveEnq}
          onSelecionar={selecionarPonto}
          onSelecionarTrecho={selecionarTrecho}
          onMoverPonto={onMoverPonto}
          onAdicionarPonto={onAdicionarPonto}
          onPontoClicado={onPontoClicado}
          papeis={papeis}
          modoRede={modoRede}
          movendoId={movendoId}
          rotulosEstrutura={rotulosEstrutura}
          estaiIds={estaiIds}
          estaiInstaladoIds={estaiInstaladoIds}
          sugCE4Ids={sugCE4Ids}
          estais={estais}
          medicao={medicao}
          onMedirPonto={onMedirPonto}
          mostrarFotos={mostrarFotos && !modoRede}
          mostrarNumeros={mostrarNumeros}
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

        {emMedir && (
          <div className="modo-bar">
            <span>
              {medicao.length < 2
                ? "Régua: clique nos pontos para medir"
                : `Distância: ${medicaoTotalM.toFixed(1)} m · ${medicao.length} pontos`}
            </span>
            <button className="btn btn-mini" onClick={() => setMedicao([])} disabled={!medicao.length}>
              Limpar
            </button>
            <button className="btn btn-mini" onClick={() => setModo("selecionar")}>
              Sair (Esc)
            </button>
          </div>
        )}

        {modo === "inserir" && !inserirRefId && (
          <div className="modo-bar">
            <span>Inserir ponto medido: clique no poste de referência</span>
            <button className="btn btn-mini" onClick={() => setModo("selecionar")}>
              Sair (Esc)
            </button>
          </div>
        )}

        {modo === "inserir" && refInserir && direcoesInserir && (
          <PainelInserir
            refPonto={refInserir}
            direcoes={direcoesInserir}
            onInserir={onInserirPonto}
            onTrocarReferencia={() => setInserirRefId(null)}
            onCancelar={() => setModo("selecionar")}
          />
        )}

        {movendoId && !emAdd && !emLigar && (
          <div className="modo-bar modo-bar-mover">
            <span>Arraste o ponto no mapa para o novo lugar</span>
            <button className="btn btn-mini" onClick={() => setMovendoId(null)}>
              Concluir (Esc)
            </button>
          </div>
        )}

        {selecionado && projeto && (
          <PainelPonto
            key={`${selecionado.id}:${selecionado.wgs84.lat},${selecionado.wgs84.lng}`}
            ponto={selecionado}
            papel={posteModelado?.papel}
            deflexaoGraus={posteModelado?.deflexaoGraus}
            estrutura={estruturaSel}
            esforco={esforcoSel}
            travado={selecionado.origem !== "web"}
            destravado={destravadoId === selecionado.id}
            movendo={movendoId === selecionado.id}
            onEditar={(patch: PatchPonto) => atualizar(editarPonto(projeto, selecionado.id, patch))}
            onMover={(wgs84) => atualizar(moverPonto(projeto, selecionado.id, wgs84))}
            onMoverNoMapa={() =>
              setMovendoId((cur) => (cur === selecionado.id ? null : selecionado.id))
            }
            onDestravar={() => setDestravadoId(selecionado.id)}
            onDefinirFonte={() => atualizar(definirFonte(projeto, selecionado.id))}
            onExcluir={() => {
              atualizar(removerPonto(projeto, selecionado.id));
              selecionarPonto(null);
            }}
            onFechar={() => selecionarPonto(null)}
          />
        )}

        {selecionadoTrecho && projeto && (
          <PainelTrecho
            key={selecionadoTrecho.id}
            trecho={selecionadoTrecho}
            comprimentoM={compTrecho}
            vaoInfo={vaoInfo}
            onAjustarVao={ajustarVaoSel}
            onRedividirVao={redividirVaoSel}
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

        {projeto && !modoRede && (
          <div className="legenda">
            <span><i className="pin" style={{ background: "#f59e0b" }} /> Poste proposto</span>
            <span><i className="pin" style={{ background: "#9e9e9e" }} /> Genérico</span>
            <span><i className="pin" style={{ background: "#38bdf8" }} /> Transformador</span>
            <span><i className="pin" style={{ background: "#4caf50" }} /> Foto</span>
          </div>
        )}

        {projeto && modoRede && rede && (
          <div className="legenda legenda-rede">
            <span><i className="pin" style={{ background: "#16a34a" }} /> Fonte {rede.resumo.fonte}</span>
            <span><i className="pin" style={{ background: "#9e9e9e" }} /> Tangente {rede.resumo.tangente}</span>
            <span><i className="pin" style={{ background: "#d97706" }} /> Ângulo {rede.resumo.angulo}</span>
            <span><i className="pin" style={{ background: "#a855f7" }} /> Derivação {rede.resumo.derivacao}</span>
            <span><i className="pin" style={{ background: "#38bdf8" }} /> Transformador {rede.resumo.trafo}</span>
            <span><i className="pin" style={{ background: "#ef4444" }} /> Fim {rede.resumo.fim}</span>
            {rede.resumo.isolado > 0 && (
              <span><i className="pin" style={{ background: "#6b7280" }} /> Solto {rede.resumo.isolado}</span>
            )}
          </div>
        )}

        {projeto && modoRede && rede && (
          <div className="rede-hud">
            <div className="rede-hud-topo">
              <strong>Modelo de rede</strong>
              <span>{rede.resumo.total} postes</span>
            </div>
            {!rede.temFonte && (
              <div className="rede-hud-aviso">
                Nenhuma fonte marcada. Selecione o poste de saída da rede e clique “Marcar como fonte”
                para traçar a rota.
              </div>
            )}
            {longos.length > 0 && (
              <div className="rede-hud-aviso">
                {longos.length} vão(s) acima de {VAO_MAXIMO_M} m — use “Dividir vãos”.
              </div>
            )}
            {resumoEstrutura.length > 0 && (
              <div className="rede-hud-estruturas">
                {resumoEstrutura.map(([cod, n]) => (
                  <span key={cod} className="estr-chip">
                    {cod} <strong>{n}</strong>
                  </span>
                ))}
              </div>
            )}
            {esforcos && (
              <div className="rede-hud-esforco">
                <label className="hud-vento">
                  <span>Vento</span>
                  <select
                    value={condicaoVento}
                    onChange={(e) => setCondicaoVento(e.target.value as CondicaoVento)}
                  >
                    {(["urbana", "rural_alto", "rural_medio_baixo"] as CondicaoVento[]).map((c) => (
                      <option key={c} value={c}>
                        {ROTULO_CONDICAO[c]}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="hud-estai">
                  <i className="pin" style={{ background: "transparent", boxShadow: "inset 0 0 0 2px #e11d48" }} />{" "}
                  Estai pendente: <strong>{esforcos.pendentes}</strong>
                  {esforcos.instalados > 0 && ` · instalado ${esforcos.instalados}`} · tração{" "}
                  {esforcos.tracaoDaN} daN
                </span>
              </div>
            )}
            {lancesLongos.map((l, i) => (
              <div key={`amarra-${i}`} className="rede-hud-aviso">
                Lance de {l.comprimentoM.toFixed(0)} m sem amarração — norma pede CE4 a cada{" "}
                {LANCE_MAX_AMARRACAO_M} m.
              </div>
            ))}
            {sugestoesCE4.length > 0 && (
              <div className="rede-hud-ce4">
                <div className="rede-hud-ce4-topo">
                  <span>Sugestão de CE4 (amarração)</span>
                  <button className="btn-mini" onClick={aplicarTodasCE4}>
                    Aplicar todas ({sugestoesCE4.length})
                  </button>
                </div>
                {sugestoesCE4.map((s) => (
                  <div key={s.pontoId} className="ce4-sug">
                    <span>
                      <i className="pin" style={{ background: "transparent", boxShadow: "inset 0 0 0 2px #d97706" }} />{" "}
                      P{s.numero ?? "?"} · {s.posicaoM.toFixed(0)} m de {s.lanceComprimentoM.toFixed(0)} m
                    </span>
                    <span className="ce4-acoes">
                      <button className="btn-mini" onClick={() => aplicarCE4(s.pontoId)}>
                        Aplicar CE4
                      </button>
                      <button className="btn-mini-sec" onClick={() => selecionarPonto(s.pontoId)}>
                        Ver
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {rede.avisos.map((a, i) => (
              <div key={i} className="rede-hud-aviso">{a}</div>
            ))}
          </div>
        )}

        {erro && (
          <div className="erro" role="alert">
            {erro}
            <button className="erro-x" onClick={() => setErro(null)} aria-label="Fechar">×</button>
          </div>
        )}

        {mensagem && !erro && (
          <div className="aviso-ok" role="status">
            {mensagem}
            <button className="erro-x" onClick={() => setMensagem(null)} aria-label="Fechar">×</button>
          </div>
        )}
      </main>
    </div>
  );
}
