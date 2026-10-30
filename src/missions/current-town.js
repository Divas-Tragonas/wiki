/* El tauler que s'està mirant (?lloc=…). Les missions són les mateixes per a tots els taulers (data.json) i cada
   una diu a quins surt. */
import { TOWNS } from './towns.js';

export const TOWN_ID = new URLSearchParams(location.search).get('lloc') === 'cony-cirera' ? 'cony-cirera' : 'phentanil';
export const TOWN = TOWNS[TOWN_ID];
export const PLACES = Object.fromEntries(TOWN.geom.map((p) => [p.id, p]));
