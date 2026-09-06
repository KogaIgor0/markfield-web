import proj4 from "proj4";
import type { LatLng, UtmPoint } from "../domain/model";

/**
 * Conversão WGS84 → UTM SIRGAS 2000.
 *
 * Validado contra o próprio app (export real "Sônia"): os 5 pontos batem ao
 * milímetro com o UTM que o app grava no CSV/TXT. Isso confirma que o app usa
 * SIRGAS 2000 / UTM sul (EPSG:319zz, zz = 60 + zona) e que podemos guardar UMA
 * verdade só — lat/lng WGS84 — e recalcular o UTM quando precisar, sem risco de
 * divergir do app. É o requisito duro de fidelidade na ida-e-volta.
 *
 * SIRGAS 2000 usa o elipsoide GRS80, praticamente idêntico ao WGS84 (diferença
 * sub-milimétrica no Brasil), por isso a transformação sem parâmetros de Helmert
 * reproduz exatamente os números do app.
 */

/** Zona UTM a partir da longitude (fórmula padrão de 6° por zona). */
export function zonaUtm(lng: number): number {
  return Math.floor((lng + 180) / 6) + 1;
}

function defProj(zona: number, hemisferioSul: boolean): string {
  return `+proj=utm +zone=${zona}${hemisferioSul ? " +south" : ""} +ellps=GRS80 +units=m +no_defs`;
}

/** Converte uma coordenada geográfica para UTM SIRGAS 2000. */
export function paraUtm(coord: LatLng): UtmPoint {
  const zona = zonaUtm(coord.lng);
  const sul = coord.lat < 0;
  const [easting, northing] = proj4(defProj(zona, sul), [coord.lng, coord.lat]) as [
    number,
    number,
  ];
  return {
    easting,
    northing,
    zone: zona,
    hemisphere: sul ? "S" : "N",
  };
}

/** Converte UTM SIRGAS 2000 de volta para coordenada geográfica (inverso exato). */
export function deUtm(utm: UtmPoint): LatLng {
  const [lng, lat] = proj4(defProj(utm.zone, utm.hemisphere === "S")).inverse([
    utm.easting,
    utm.northing,
  ]) as [number, number];
  return { lat, lng };
}

/** Formata um ponto UTM para exibição (ex.: "597703 E · 7709191 N · 22S"). */
export function formatarUtm(utm: UtmPoint): string {
  const e = Math.round(utm.easting).toLocaleString("pt-BR");
  const n = Math.round(utm.northing).toLocaleString("pt-BR");
  return `${e} E · ${n} N · ${utm.zone}${utm.hemisphere}`;
}
