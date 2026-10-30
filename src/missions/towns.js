/* Pobles amb tauler propi: les dades (llocs, textos, enllaços al wiki) són a @mina/model, compartides amb l'API;
   aquí s'hi afegeixen els mapes, que el build empaqueta. */
import { TOWN_DEFS } from '@mina/model/towns';
import mapPhentanil from './assets/map.webp?url';
import mapCony from './assets/map-cony-cirera.webp?url';

const MAPS = { phentanil: mapPhentanil, 'cony-cirera': mapCony };

export const TOWNS = Object.fromEntries(Object.entries(TOWN_DEFS).map(([id, t]) => [id, { ...t, map: MAPS[id] }]));
