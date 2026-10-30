/* Pobles amb tauler propi: llocs del mapa, textos de les fitxes i enllaços al wiki.
   És la font única d'aquestes dades: el tauler les dibuixa (src/missions/towns.js hi afegeix els mapes) i l'API les
   fa servir per validar pobles i llocs. Coordenades del mapa a 4950 d'ample:
   - ln: línies del nom, cada una [text, x, y, amplada]
   - ar: fletxa [x1, y1, x2, y2] cap al lloc (sense fletxa, el nom va escrit damunt del lloc)
   - icon: [cx, cy, radi] per a una icona en lloc d'un nom (el tauler d'anuncis, que torna al tauler)
   A la fitxa de cada lloc (info), character o place és la pàgina del wiki on es pot llegir més; el build del wiki
   falla si no existeix (src/pages/missions/index.astro). */

export interface PlaceGeom {
  id: string;
  name: string;
  ar?: [number, number, number, number];
  ln?: [string, number, number, number][];
  icon?: [number, number, number];
}
export interface PlaceInfo {
  text: string;
  character?: string;
  place?: string;
}
export interface TownDef {
  id: TownId;
  name: string;
  /* mida del mapa en coordenades de geom · h: alçada del mapa al tauler (1100 d'ample) · start: primer lloc amb les fletxes */
  vb: [number, number];
  h: number;
  start: string;
  geom: PlaceGeom[];
  info: Record<string, PlaceInfo>;
  /* el mateix poble a l'RPG Map Viewer (src/missions/pixel.js) */
  pixel?: { map: string; w: number; h: number; cols: number; rows: number };
}

export const TOWN_IDS = ['phentanil', 'cony-cirera'] as const;
export type TownId = (typeof TOWN_IDS)[number];
export const isTownId = (v: unknown): v is TownId => typeof v === 'string' && (TOWN_IDS as readonly string[]).includes(v);

/* la icona del tauler d'anuncis no és un lloc: torna al tauler */
export const BOARD_ICON = 'tauler';

const GEOM_PHENTANIL: PlaceGeom[] = [
  { id: 'cami-tres-bous', name: 'Camí dels Tres Bous', ar: [2553, 141, 2721, 93], ln: [['CAMÍ dels', 2302, 140, 201], ['TRES BOUS', 2268, 178, 252]] },
  { id: 'can-bertran', name: 'Can Bertran', ar: [2837, 423, 2691, 521], ln: [['CAN BERTRAN', 2692, 391, 334]] },
  { id: 'mansio-cendra', name: 'Mansió de la Cendra', ar: [4580, 524, 4560, 383], ln: [['MANSIÓ de la', 4448, 579, 283], ['CENDRA', 4495, 618, 195]] },
  { id: 'ferreria', name: 'Ferreria', ar: [2375, 589, 2266, 714], ln: [['FERRERIA', 2300, 558, 249]] },
  { id: 'casa-bertran', name: 'Casa Bertran', ar: [3151, 619, 2939, 681], ln: [['CASA BERTRAN', 3027, 570, 351]] },
  { id: 'casa-sor-maria', name: 'Casa Sor Maria', ar: [1718, 609, 1890, 898], ln: [['CASA SOR MARIA', 1539, 569, 379]] },
  { id: 'gegant-durment', name: 'Gegant Durment', ar: [3557, 664, 3384, 750], ln: [['GEGANT', 3511, 592, 193], ['DURMENT', 3487, 629, 239]] },
  { id: 'santuari-sort', name: 'Santuari de la Sort', ar: [1952, 732, 1977, 982], ln: [['SANTUARI', 1919, 669, 229], ['de la SORT', 1926, 706, 214]] },
  { id: 'hort-damia', name: 'Hort d’en Damià', ar: [1008, 775, 1213, 872], ln: [['HORT d’en DAMIÀ', 796, 746, 378]] },
  { id: 'alberg-turo', name: 'Alberg Turó de la Pedra', ar: [2742, 860, 2568, 862], ln: [['ALBERG TURÓ', 2795, 851, 329], ['de la PEDRA', 2828, 887, 262]] },
  { id: 'granja-fullaverda', name: 'Granja Fullaverda', ar: [4048, 1140, 3897, 1253], ln: [['GRANJA FULLAVERDA', 3716, 1109, 498]] },
  { id: 'ajuntament', name: 'Ajuntament', ar: [2671, 1200, 2496, 1240], ln: [['AJUNTAMENT', 2696, 1180, 318]] },
  { id: 'casa-lluna', name: 'Casa Lluna', ar: [1371, 1277, 1497, 1442], ln: [['CASA LLUNA', 1225, 1250, 283]] },
  { id: 'tauler', name: 'Tauler d’anuncis', icon: [2766, 1285, 62] },
  { id: 'casa-arnau', name: 'Casa Arnau Ponent', ar: [3532, 1366, 3389, 1279], ln: [['CASA ARNAU', 3307, 1389, 284], ['PONENT', 3352, 1427, 195]] },
  { id: 'escut-lleo', name: 'Companyia Escut de Lleó', ar: [1564, 1678, 1855, 1460], ln: [['COMPANYIA', 1301, 1750, 273], ['ESCUT de LLEÓ', 1265, 1789, 346]] },
  { id: 'carpinteria', name: 'Carpinteria', ar: [2560, 1638, 2373, 1516], ln: [['CARPINTERIA', 2399, 1736, 325]] },
  { id: 'llotja-minera', name: 'Llotja Minera', ar: [2210, 1826, 2048, 1771], ln: [['LLOTJA', 2240, 1867, 184], ['MINERA', 2228, 1905, 196]] },
  { id: 'casa-helia', name: 'Casa Hèlia', ar: [2851, 2231, 2618, 2093], ln: [['CASA HÈLIA', 2884, 2283, 278]] },
  { id: 'cami-miners', name: 'Camí dels Miners', ar: [1564, 3201, 1290, 3359], ln: [['CAMÍ dels MINERS', 1653, 3193, 400]] }
];

const INFO_PHENTANIL: Record<string, PlaceInfo> = {
  'ajuntament': { text: "On l'alcalde, Arnau Ponent, porta els registres del poble.", character: 'arnau-ponent' },
  'gegant-durment': { text: 'La taverna El Gegant Dorment, punt de trobada habitual del grup.', place: 'phentanil' },
  'mansio-cendra': { text: "L'antic cau de la Vaina Roja a les afores de Phentanil, ara buidat després de la caiguda de Vara de Vidre.", place: 'mansio-de-la-cendra' },
  'santuari-sort': { text: 'El santuari de Timora, a la plaça central, amb una casoleta màgica que emet purpurina quan hi tires monedes.', place: 'phentanil' },
  'casa-sor-maria': { text: 'La casa de Sor Maria, apartada del carrer principal.', character: 'sor-maria' },
  'escut-lleo': { text: "L'armeria d'Hèlia Tornegrau, saquejada recentment pels goblins però encara operativa.", place: 'escut-del-lleo' },
  'casa-helia': { text: "Casa d'Hèlia Tornegrau, propietària de l'armeria l'Escut del Lleó.", character: 'helia-tornegrau' },
  'can-bertran': { text: 'Establiment comercial de Phentanil on el grup va entregar el primer cargament.', place: 'can-bertran' },
  'casa-bertran': { text: 'Casa de Mic Bertran, comerciant de Phentanil i propietari de Can Bertran.', character: 'mic-bertran' },
  'hort-damia': { text: "L'hort de Damià RoureBlanc, pagès d'edat avançada i vell amic de Sor Maria.", character: 'damia-roureblanc' },
  'casa-arnau': { text: "Casa d'Arnau Ponent, l'alcalde de Phentanil.", character: 'arnau-ponent' }
};

/* Cony Cirera: el poble abandonat que el bosc s'ha menjat, a dos dies a l'est de Phentanil (mapa de 1506×1044) */
const GEOM_CONY: PlaceGeom[] = [
  { id: 'sender-bosc', name: 'Sender del bosc', ar: [4618, 447, 4733, 697], ln: [['SENDER', 4411, 368, 216], ['del BOSC', 4414, 406, 211]] },
  { id: 'cami-triboar', name: 'Camí de Triboar', ar: [4503, 1298, 4240, 1446], ln: [['CAMÍ de', 4552, 1223, 197], ['TRIBOAR', 4535, 1261, 231]] },
  { id: 'cementiri', name: 'Cementiri vell', ar: [2317, 230, 2597, 401], ln: [['CEMENTIRI VELL', 1868, 204, 472]] },
  { id: 'muralla', name: 'Muralla enrunada', ar: [3566, 559, 3320, 690], ln: [['MURALLA', 3606, 526, 249], ['ENRUNADA', 3586, 564, 290]] },
  { id: 'farga', name: 'Farga vella', ar: [1538, 749, 1519, 861], ln: [['FARGA VELLA', 1349, 730, 359]] },
  { id: 'casa-batlle', name: 'Casa del batlle', ar: [2284, 1663, 2317, 1532], ln: [['CASA del BATLLE', 2051, 1716, 434]] },
  { id: 'pou', name: 'Pou de la plaça', ar: [3073, 1814, 2935, 1722], ln: [['POU de la PLAÇA', 3083, 1857, 408]] },
  { id: 'capella', name: 'Capella enrunada', ar: [2975, 2081, 2952, 2209], ln: [['CAPELLA', 2838, 2005, 240], ['ENRUNADA', 2813, 2043, 290]] },
  { id: 'hostal', name: 'Hostal vell', ar: [4332, 2551, 4319, 2459], ln: [['HOSTAL VELL', 4144, 2613, 356]] },
  { id: 'embarcador', name: 'Embarcador', ar: [1183, 3195, 1002, 3096], ln: [['EMBARCADOR', 1199, 3238, 363]] },
  { id: 'estany', name: 'Estany', ln: [['ESTANY', 258, 3205, 207]] },
  { id: 'cami-phentanil', name: 'Camí de Phentanil', ar: [674, 230, 526, 335], ln: [['CAMÍ de', 756, 158, 197], ['PHENTANIL', 697, 196, 315]] }
];

const INFO_CONY: Record<string, PlaceInfo> = {
  'sender-bosc': { text: "Un sender estret que s'endinsa al bosc. Com més s'hi avança, més fosc i més fred es fa. Si l'Àgata viu enlloc, és per aquí.", character: 'agata' },
  'cami-triboar': { text: "L'antic camí empedrat que porta cap a Triboar, a l'est." },
  'cementiri': { text: 'Làpides tombades i pedres cobertes de molsa. Entre les tombes hi creixen arbustos secs.', place: 'runes-de-cony-cirera' },
  'muralla': { text: "El que queda de la muralla del poble. El bosc se l'ha anat menjant pedra a pedra.", place: 'runes-de-cony-cirera' },
  'farga': { text: "Una farga abandonada, amb l'enclusa encara a fora, rovellada." },
  'casa-batlle': { text: 'La casa més gran del poble, amb el pati tancat. Fa temps que les portes no tanquen.' },
  'pou': { text: "El pou de la plaça. L'aigua encara hi és, freda i fosca." },
  'capella': { text: 'Una capella de pedra amb el campanar mig esfondrat.' },
  'hostal': { text: 'Un hostal gran amb pati i estables, buit des de fa generacions.' },
  'embarcador': { text: 'Un embarcador de fusta vella. La barca encara sura.' },
  'estany': { text: "Un estany d'aigües quietes a la vora del poble." },
  'cami-phentanil': { text: 'El camí per on heu vingut: dos dies cap a ponent fins a Phentanil.', place: 'phentanil' }
};

export const TOWN_DEFS: Record<TownId, TownDef> = {
  phentanil: { id: 'phentanil', name: 'Phentanil', vb: [4950, 3510], h: 780, start: 'ajuntament', geom: GEOM_PHENTANIL, info: INFO_PHENTANIL },
  'cony-cirera': {
    id: 'cony-cirera', name: 'Cony Cirera', vb: [4950, 3431], h: 763, start: 'pou', geom: GEOM_CONY, info: INFO_CONY,
    /* missió «conyberry» del visor: mapa de 36×25 caselles amb la mateixa proporció */
    pixel: { map: 'missions/conyberry/mapa.png', w: 1728, h: 1200, cols: 36, rows: 25 }
  }
};

/* llocs on es pot posar una missió (tots menys la icona del tauler) */
export const placeIdsOf = (town: TownId): string[] => TOWN_DEFS[town].geom.map((p) => p.id).filter((id) => id !== BOARD_ICON);
export const isPlaceOf = (town: TownId, place: unknown): place is string => typeof place === 'string' && placeIdsOf(town).includes(place);
