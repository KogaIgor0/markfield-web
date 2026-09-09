import type { TipoPonto } from "../domain/model";

/**
 * Domain Pack — Neoenergia Elektro (SP). Primeira versão, focada no DXF de
 * cadastro (rede compacta, extensão rural MT).
 *
 * As camadas vêm de um projeto APROVADO real (nomes 111/113/114/115…), mas o
 * arquivo de origem era bagunçado e com nomes mangled/inconsistentes — então
 * aqui os nomes estão limpos e **configuráveis**: se a Elektro exigir a grafia
 * exata, é trocar a string. TODO: confirmar contra a DIS-NOR-012/013 (ANEXO VIII).
 */

export interface CamadaDxf {
  nome: string;
  /** Cor ACI (índice de cor do AutoCAD). */
  cor: number;
}

export interface PackConcessionaria {
  id: string;
  nome: string;
  /** Unidade do DXF gerado. "m" = coordenadas UTM em metros (georreferenciado). */
  unidade: "m";
  camadas: {
    poste: CamadaDxf;
    posteGenerico: CamadaDxf;
    transformador: CamadaDxf;
    redePrimaria: CamadaDxf;
    linhaAuxiliar: CamadaDxf;
    numero: CamadaDxf;
  };
  /** Raio (m) dos símbolos no georreferenciado (visíveis ~1:1000). */
  raioPosteM: number;
  raioTrafoM: number;
  alturaTextoM: number;
}

export const PACK_ELEKTRO: PackConcessionaria = {
  id: "neoenergia-elektro-sp",
  nome: "Neoenergia Elektro (SP)",
  unidade: "m",
  camadas: {
    poste: { nome: "111-PONTO_SIGNIFICATIVO", cor: 50 },
    posteGenerico: { nome: "112-PONTO_SIGNIFICATIVO", cor: 50 },
    transformador: { nome: "115-UNIDADE_TRANSFORMADORA", cor: 80 },
    redePrimaria: { nome: "113-ALIMENTADOR_PRIMARIO", cor: 86 },
    linhaAuxiliar: { nome: "MKF-AUXILIAR", cor: 8 },
    numero: { nome: "3-PONTOS_SIGNIFICATIVO", cor: 10 },
  },
  raioPosteM: 1.5,
  raioTrafoM: 3,
  alturaTextoM: 2.5,
};

/** Camada de um ponto conforme seu tipo. */
export function camadaDoPonto(pack: PackConcessionaria, tipo: TipoPonto): CamadaDxf {
  if (tipo === "transformador") return pack.camadas.transformador;
  if (tipo === "generico") return pack.camadas.posteGenerico;
  return pack.camadas.poste; // postePropostoo e outros
}
