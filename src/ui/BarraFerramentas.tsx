import { useState, useRef, useCallback } from "react";
import type { FeatureCollection } from "geojson";
import type { EstiloBase, MapAlvo } from "../map/MapCanvas";

interface BfProps {
  estiloBase: EstiloBase;
  onEstiloChange: (e: EstiloBase) => void;
  /** GeoJSON dos transformadores carregados (UNTRMT) */
  trafosData: FeatureCollection | null;
  onVoarPara: (alvo: MapAlvo) => void;
}

interface Sugestao {
  label: string;
  sub: string;
  alvo: MapAlvo;
  tipo: "local" | "geo";
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Campos CTMT usados pelos diferentes formatos BDGD/ArcGIS
const CAMPOS_CTMT = ["CTMT", "COD_CTMT", "COD_ID_CTMT", "CTMT_ID", "ID_CTMT"];
const CAMPOS_CODID = ["COD_ID", "ID", "OBJECTID_1"];

/** Detecta se a query parece um código BDGD (alfanumérico, sem espaços). */
function pareceCodigo(q: string): boolean {
  return /^[A-Z0-9_-]{3,20}$/.test(q);
}

async function geocodificar(q: string): Promise<Sugestao[]> {
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=br`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "pt-BR,pt;q=0.9" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>).map((item) => ({
      label: item.display_name.split(",").slice(0, 2).join(", "),
      sub: item.display_name.split(",").slice(2, 4).join(", ").trim(),
      tipo: "geo" as const,
      alvo: {
        center: [parseFloat(item.lon), parseFloat(item.lat)] as [number, number],
        zoom: 14,
      },
    }));
  } catch {
    return [];
  }
}

function buscarNaTrafos(trafosData: FeatureCollection, query: string): Sugestao[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const resultados: Sugestao[] = [];

  // 1. Busca por CTMT (circuito) → bbox de todos os trafos do circuito
  let campoCtmt: string | null = null;
  for (const campo of CAMPOS_CTMT) {
    if (trafosData.features.some((f) => f.properties?.[campo] != null)) {
      campoCtmt = campo;
      break;
    }
  }
  if (campoCtmt) {
    const feats = trafosData.features.filter((f) => {
      const v = f.properties?.[campoCtmt!];
      return v != null && String(v).toUpperCase() === q;
    });
    if (feats.length > 0) {
      const pts = feats.filter((f) => f.geometry?.type === "Point");
      if (pts.length > 0) {
        const lons = pts.map((f) => (f.geometry as GeoJSON.Point).coordinates[0]);
        const lats = pts.map((f) => (f.geometry as GeoJSON.Point).coordinates[1]);
        resultados.push({
          label: `Circuito ${q}`,
          sub: `${feats.length} trafo${feats.length !== 1 ? "s" : ""}`,
          tipo: "local",
          alvo: {
            bbox: [
              Math.min(...lons),
              Math.min(...lats),
              Math.max(...lons),
              Math.max(...lats),
            ] as [number, number, number, number],
          },
        });
      }
    }
  }

  // 2. Busca por COD_ID (trafo individual)
  let campoCodId: string | null = null;
  for (const campo of CAMPOS_CODID) {
    if (trafosData.features.some((f) => f.properties?.[campo] != null)) {
      campoCodId = campo;
      break;
    }
  }
  if (campoCodId) {
    const feat = trafosData.features.find((f) => {
      const v = f.properties?.[campoCodId!];
      return v != null && String(v).toUpperCase() === q;
    });
    if (feat && feat.geometry?.type === "Point") {
      const [lon, lat] = (feat.geometry as GeoJSON.Point).coordinates;
      const pot = feat.properties?.["POT_NOM"] ?? feat.properties?.["POT_NOM_KVA"] ?? "";
      resultados.push({
        label: `Trafo ${q}`,
        sub: pot ? `${pot} kVA` : "Transformador individual",
        tipo: "local",
        alvo: { center: [lon, lat], zoom: 18 },
      });
    }
  }

  return resultados;
}

export function BarraFerramentas({
  estiloBase,
  onEstiloChange,
  trafosData,
  onVoarPara,
}: BfProps) {
  const [texto, setTexto] = useState("");
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [semResultados, setSemResultados] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pesquisar = useCallback(
    (q: string) => {
      setTexto(q);
      setSemResultados(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q.trim()) {
        setSugestoes([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        // Primeiro: buscar nos trafos locais (só se carregados)
        if (trafosData) {
          const local = buscarNaTrafos(trafosData, q);
          if (local.length > 0) {
            setSugestoes(local);
            return;
          }
        }

        // Se parece um código BDGD mas não tem dados, mostrar dica
        if (pareceCodigo(q.trim().toUpperCase()) && !trafosData) {
          setSugestoes([]);
          setSemResultados(true);
          return;
        }

        // Fallback: Nominatim (geocoder geográfico)
        setCarregando(true);
        try {
          const geo = await geocodificar(q);
          if (geo.length === 0) setSemResultados(true);
          setSugestoes(geo);
        } finally {
          setCarregando(false);
        }
      }, 320);
    },
    [trafosData]
  );

  function selecionar(s: Sugestao) {
    onVoarPara(s.alvo);
    setTexto(s.label);
    setSugestoes([]);
    setSemResultados(false);
  }

  const estilos: { id: EstiloBase; label: string; title: string }[] = [
    { id: "satellite", label: "🛰", title: "Satélite" },
    { id: "hybrid",    label: "🌍", title: "Híbrido" },
    { id: "streets",   label: "🗺",  title: "Ruas" },
  ];

  const dropdownAberto = sugestoes.length > 0 || (semResultados && texto.trim().length > 0);

  return (
    <div className="barra-ferramentas">
      {/* Seletor de estilo de mapa */}
      <div className="bf-estilos">
        {estilos.map((e) => (
          <button
            key={e.id}
            className={`bf-estilo-btn${estiloBase === e.id ? " ativo" : ""}`}
            title={e.title}
            onClick={() => onEstiloChange(e.id)}
          >
            {e.label}
          </button>
        ))}
      </div>

      {/* Barra de busca */}
      <div className="bf-busca">
        <span className="bf-lupa">🔍</span>
        <input
          className="bf-busca-input"
          type="text"
          placeholder="Local ou código CTMT…"
          value={texto}
          onChange={(ev) => pesquisar(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") { setTexto(""); setSugestoes([]); setSemResultados(false); }
            if (ev.key === "Enter" && sugestoes.length > 0) selecionar(sugestoes[0]);
          }}
          onBlur={() => setTimeout(() => { setSugestoes([]); setSemResultados(false); }, 150)}
          autoComplete="off"
          spellCheck={false}
        />
        {carregando && <span className="bf-spinner" aria-hidden>⟳</span>}

        {dropdownAberto && (
          <ul className="bf-dropdown">
            {sugestoes.map((s, i) => (
              <li key={i} className="bf-item" onMouseDown={() => selecionar(s)}>
                <span className={`bf-item-tipo ${s.tipo}`}>
                  {s.tipo === "local" ? "📍" : "🔎"}
                </span>
                <span className="bf-item-body">
                  <span className="bf-item-label">{s.label}</span>
                  {s.sub && <span className="bf-item-sub">{s.sub}</span>}
                </span>
              </li>
            ))}
            {semResultados && sugestoes.length === 0 && (
              <li className="bf-item bf-sem-resultado">
                {pareceCodigo(texto.trim().toUpperCase()) && !trafosData
                  ? "Carregue uma distribuidora para buscar por CTMT"
                  : "Nenhum resultado encontrado"}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
