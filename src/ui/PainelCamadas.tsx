import { BDGD_CAMADAS, BDGD_FONTES } from "../map/bdgd";

interface Props {
  fonteId: string | null;
  ativas: Record<string, boolean>;
  carregando: boolean;
  onToggle: (id: string) => void;
  onCarregar: () => void;
  onFechar: () => void;
}

export function PainelCamadas({ fonteId, ativas, carregando, onToggle, onCarregar, onFechar }: Props) {
  const fonte = BDGD_FONTES.find((f) => f.id === fonteId) ?? BDGD_FONTES[0];
  const temUrls = !!fonte.urls;

  return (
    <div className="painel-camadas">
      <div className="pc-header">
        <div className="pc-badge-row">
          <span className="pc-uf">{fonte.uf ?? "SP"}</span>
          <span className="pc-nome">{fonte.nome}</span>
        </div>
        <button className="pc-fechar" onClick={onFechar} title="Fechar">✕</button>
      </div>

      <div className="pc-camadas">
        {BDGD_CAMADAS.map((cam) => (
          <label key={cam.id} className="pc-toggle">
            <span className="pc-bolinha" style={{ background: cam.cor }} />
            <span className="pc-label">{cam.label}</span>
            <input
              type="checkbox"
              checked={ativas[cam.id] ?? true}
              onChange={() => onToggle(cam.id)}
            />
          </label>
        ))}
      </div>

      {!temUrls && (
        <div className="pc-em-breve">⏳ Em breve para esta distribuidora</div>
      )}

      <button
        className="pc-carregar-btn"
        onClick={onCarregar}
        disabled={!temUrls || carregando}
      >
        {carregando ? "Carregando…" : "Carregar rede nesta área"}
      </button>
    </div>
  );
}
