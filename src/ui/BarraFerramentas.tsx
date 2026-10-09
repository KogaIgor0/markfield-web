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
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

async function geocodificar(q: string): Promise<Sugestao[]> {
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=br`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "pt-BR,pt;q=0.9" },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((item: { display_name: string; boundingbox: string[]; lat: string; lon: string }) => ({
    label: item.display_name.split(",").slice(0, 2).join(", "),
    sub: item.display_name.split(",").slice(2, 4).join(", ").trim(),
    alvo: {
      center: [parseFloat(item.lon), parseFloat(item.lat)] as [number, number],
      zoom: 14,
    } satisfies MapAlvo,
  }));
}

function buscarNaTrafos(
  trafosData: FeatureCollection,
  query: string
): Sugestao[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  const resultados: Sugestao[] = [];

  // Busca por CTMT (agrupa todos os trafos do circuito → bbox)
  const ctmtFeatures = trafosData.features.filter(
    (f) =>
      f.properties &&
      (f.properties["COD_ID_CTMT"] === q ||
        f.properties["CTMT"] === q ||
        f.properties["COD_CTMT"] === q ||
        f.properties["CTMT_ID"] === q)
  );
  if (ctmtFeatures.length > 0) {
    const lons = ctmtFeatures.map((f) => (f.geometry as GeoJSON.Point).coordinates[0]);
    const lats = ctmtFeatures.map((f) => (f.geometry as GeoJSON.Point).coordinates[1]);
    const bbox: [number, number, number, number] = [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ];
    resultados.push({
      label: `CTMT ${q}`,
      sub: `${ctmtFeatures.length} transformador${ctmtFeatures.length !== 1 ? "es" : ""}`,
      alvo: { bbox },
    });
  }

  // Busca por COD_ID (trafo individual)
  const codIdFeature = trafosData.features.find(
    (f) => f.properties && f.properties["COD_ID"] === q
  );
  if (codIdFeature && codIdFeature.geometry.type === "Point") {
    const [lon, lat] = codIdFeature.geometry.coordinates;
    resultados.push({
      label: `Trafo ${q}`,
      sub: codIdFeature.properties?.["POT_NOM"] ? `${codIdFeature.properties["POT_NOM"]} kVA` : "Transformador",
      alvo: { center: [lon, lat], zoom: 18 },
    });
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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pesquisar = useCallback(
    (q: string) => {
      setTexto(q);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q.trim()) {
        setSugestoes([]);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        // Primeiro: buscar nos trafos locais
        if (trafosData) {
          const local = buscarNaTrafos(trafosData, q);
          if (local.length > 0) {
            setSugestoes(local);
            return;
          }
        }
        // Fallback: Nominatim
        setCarregando(true);
        try {
          const geo = await geocodificar(q);
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
    setTexto("bbox" in s.alvo ? `CTMT ${s.label}` : s.label);
    setSugestoes([]);
  }

  const estilos: { id: EstiloBase; label: string; title: string }[] = [
    { id: "satellite", label: "🛰", title: "Satélite" },
    { id: "hybrid",    label: "🌍", title: "Híbrido" },
    { id: "streets",   label: "🗺",  title: "Ruas" },
  ];

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
        <input
          className="bf-busca-input"
          type="text"
          placeholder="Buscar local ou CTMT…"
          value={texto}
          onChange={(ev) => pesquisar(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Escape") { setTexto(""); setSugestoes([]); }
            if (ev.key === "Enter" && sugestoes.length > 0) selecionar(sugestoes[0]);
          }}
          autoComplete="off"
          spellCheck={false}
        />
        {carregando && <span className="bf-spinner">⏳</span>}

        {sugestoes.length > 0 && (
          <ul className="bf-dropdown">
            {sugestoes.map((s, i) => (
              <li key={i} className="bf-item" onMouseDown={() => selecionar(s)}>
                <span className="bf-item-label">{s.label}</span>
                {s.sub && <span className="bf-item-sub">{s.sub}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
