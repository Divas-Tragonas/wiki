/* Constants sense dependències (el tauler les importa sense arrossegar zod). */
export const ROLES = ['player', 'dm'] as const;
export type Role = (typeof ROLES)[number];

export const CATEGORIES = ['principal', 'secundaria', 'personal'] as const;
export type Category = (typeof CATEGORIES)[number];

/* peces del tauler que no són missions: el mapa i la pila de completades */
export const FIXED_PIECES = ['map', 'pile'] as const;
