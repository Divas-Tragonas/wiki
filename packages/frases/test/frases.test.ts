import { describe, expect, it } from 'vitest';
import {
  cerca, desempaqueta, empaqueta, hms, peces, prepara, retall, validaVideo, MARGE_ABANS, MARGE_APROXIMAT, MARGE_DESPRES,
  type FitxerVideo, type Frase
} from '../src/index.ts';

const video = (over: Partial<FitxerVideo> = {}): FitxerVideo => ({
  id: 'abcdefghijk',
  titol: 'D&D SESSIÓ 1 - Prova',
  data: '2026-01-12',
  durada: 3600,
  idioma: 'ca',
  frases: [
    [1000, 3000, "Hola, què fas?", [0, 400, 900]],
    [5000, 8000, "L'última col·lecció del drac.", [0, 600, 1500, 2100]],
    [9000, 9800, 'Dracs!', [100]],
  ],
  ...over,
});

const frases = (...vs: FitxerVideo[]) => desempaqueta(JSON.parse(JSON.stringify(empaqueta(vs))));

describe('format', () => {
  it('empaqueta i desempaqueta sense perdre els temps', () => {
    const [f] = frases(video());
    expect(f).toEqual({ video: 0, inici: 1, fi: 3, text: 'Hola, què fas?', paraules: ['Hola,', 'què', 'fas?'], temps: [1, 1.4, 1.9] });
  });

  it('ordena els vídeos per data i les frases per temps', () => {
    const vell = video({ id: 'vellvellvel', data: '2025-01-01', frases: [[5000, 6000, 'b', [0]], [1000, 2000, 'a', [0]]] });
    const index = empaqueta([video(), vell]);
    expect(index.videos.map((v) => v.id)).toEqual(['vellvellvel', 'abcdefghijk']);
    expect(index.frases.slice(0, 2).map((f) => f[3])).toEqual(['a', 'b']);
  });

  it('només porta la marca «aproximat» als vídeos que la tenen', () => {
    const index = empaqueta([video(), video({ id: 'aproximat01', aproximat: true })]);
    expect(index.videos.map((v) => v.aproximat)).toEqual([undefined, true]);
  });

  it('valida el nombre de paraules i de temps', () => {
    expect(() => validaVideo(video())).not.toThrow();
    expect(() => validaVideo(video({ frases: [[0, 10, 'dues paraules', [0]]] }))).toThrow(/2 paraules i 1 temps/);
    expect(() => validaVideo(video({ data: 'ahir' }))).toThrow(/data/);
  });
});

describe('cerca', () => {
  const fs = frases(video());
  const prep = prepara(fs);
  const textos = (q: string) => cerca(prep, q).map((t) => fs[t.frase].paraules.slice(t.a, t.b + 1).join(' '));

  it('no té en compte majúscules, accents ni puntuació', () => {
    expect(peces("L'última, oi?")).toEqual(['l', 'ultima', 'oi']);
    expect(textos('QUE FAS')).toEqual(['què fas?']);
    expect(textos('ultima')).toEqual(["L'última"]);
    expect(textos('colleccio')).toEqual(['col·lecció']);
    expect(textos('col·lecció del')).toEqual(['col·lecció del']);
  });

  it('busca paraules senceres i seguides', () => {
    expect(textos('fas que')).toEqual([]);
    expect(textos('ola')).toEqual([]);
  });

  it("posa primer les coincidències senceres i després les que acaben en una paraula més llarga", () => {
    const r = cerca(prep, 'drac');
    expect(r.map((t) => [fs[t.frase].paraules[t.a], t.exacta])).toEqual([['drac.', true], ['Dracs!', false]]);
  });

  it('una cerca buida no troba res', () => {
    expect(cerca(prep, ' ¿? ')).toEqual([]);
  });
});

describe('retall', () => {
  it('reprodueix una frase curta sencera amb marge', () => {
    const [f] = frases(video());
    expect(retall(f, 1, 1)).toEqual({ inici: 1 - MARGE_ABANS, fi: 3 + MARGE_DESPRES });
  });

  it('deixa més marge si les hores són aproximades', () => {
    const [, f] = frases(video());
    expect(retall(f, 1, 1, true)).toEqual({ inici: 5 - MARGE_ABANS - MARGE_APROXIMAT, fi: 8 + MARGE_DESPRES + MARGE_APROXIMAT });
  });

  it("d'una frase llarga, només el voltant de la troballa i tallant entre paraules", () => {
    const paraules = Array.from({ length: 30 }, (_, i) => `p${i}`);
    const f: Frase = { video: 0, inici: 100, fi: 130, text: paraules.join(' '), paraules, temps: paraules.map((_, i) => 100 + i) };
    const { inici, fi } = retall(f, 15, 16);
    // context: 2,5 s abans de p15 (comença a p13) i 2 s després del final de p16 (p17 + 2 → acaba abans de p20)
    expect(inici).toBeCloseTo(113 - MARGE_ABANS);
    expect(fi).toBeCloseTo(120 + MARGE_DESPRES);
    expect(retall(f, 29, 29).fi).toBeCloseTo(130 + MARGE_DESPRES);
    expect(retall(f, 0, 0).inici).toBe(100 - MARGE_ABANS);
  });

  it('formata el temps', () => {
    expect(hms(65.9)).toBe('1:05');
    expect(hms(4521.3)).toBe('1:15:21');
  });
});
