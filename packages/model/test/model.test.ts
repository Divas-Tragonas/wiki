import { describe, expect, it } from 'vitest';
import {
  QuestCreateBody, QuestSchema, PoseSchema, TownsSchema, LayoutPatchBody,
  boardView, eventsFor, fromLegacy, toLegacy, normalizeLegacy, titleKey, sameValue, stableStringify, newId,
  placeIdsOf, isPlaceOf, TOWN_DEFS,
  type CampaignData, type ChangeItem, type EventContext, type Quest
} from '../src/index.ts';

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'q1', version: 1, position: 0, cat: 'principal', title: 'La mina', text: 'Text', reward: '', who: '', giver: 'Sildar',
  where: '', special: null, status: 'active', doneAt: null, hidden: false, note: 'secret', towns: { phentanil: 'ajuntament' },
  steps: [{ id: 's1', text: 'Primer', done: true }], ...over
});

const data = (): CampaignData => ({
  tracked: 'q1',
  party: { level: 2, title: '' },
  quests: [quest(), quest({ id: 'q2', position: 1, hidden: true, title: 'Oculta' }), quest({ id: 'q3', position: 2, towns: { 'cony-cirera': 'pou' } })],
  ecos: [
    { id: 'e1', num: 1, position: 0, title: 'Primer', text: 'Una veu', unlocked: true },
    { id: 'e2', num: 2, position: 1, title: 'Segon', text: 'Un crit', unlocked: false }
  ],
  boards: {
    phentanil: { layout: { map: { x: 1, y: 2, r: 0 }, q1: { cx: 10, cy: 10, r: 1 }, q2: { cx: 20, cy: 20, r: 2 } }, places: { ajuntament: 'Text' } },
    'cony-cirera': { layout: {}, places: {} }
  }
});

describe('schemas', () => {
  it('accepts a full quest and rejects reserved or malformed ids', () => {
    expect(QuestSchema.parse(quest()).id).toBe('q1');
    expect(QuestSchema.safeParse(quest({ id: 'map' })).success).toBe(false);
    expect(QuestSchema.safeParse(quest({ id: 'te nim' })).success).toBe(false);
    expect(QuestSchema.safeParse(quest({ id: '' })).success).toBe(false);
  });
  it('requires a quest to be on at least one known town', () => {
    expect(TownsSchema.safeParse({}).success).toBe(false);
    expect(TownsSchema.safeParse({ atlantis: null }).success).toBe(false);
    expect(TownsSchema.safeParse({ phentanil: null }).success).toBe(true);
    expect(QuestCreateBody.safeParse({ title: 'x' }).success).toBe(false);
    expect(QuestCreateBody.safeParse({ title: 'x', towns: { phentanil: null } }).success).toBe(true);
    expect(QuestCreateBody.safeParse({ towns: { phentanil: null }, version: 3 }).success).toBe(false);
  });
  it('validates poses', () => {
    expect(PoseSchema.safeParse({ cx: 1, cy: 2, r: 0 }).success).toBe(true);
    expect(PoseSchema.safeParse({ x: 1, y: 2, r: 0 }).success).toBe(true);
    expect(PoseSchema.safeParse({ cx: 1, r: 0 }).success).toBe(false);
    expect(PoseSchema.safeParse({ cx: 1, cy: 2, r: 0, evil: true }).success).toBe(false);
    expect(PoseSchema.safeParse({ cx: Infinity, cy: 2, r: 0 }).success).toBe(false);
    expect(LayoutPatchBody.safeParse({ pieces: { q1: null, map: { x: 1, y: 1, r: 0 } } }).success).toBe(true);
  });
  it('knows each town\'s places', () => {
    expect(placeIdsOf('phentanil')).toContain('ajuntament');
    expect(placeIdsOf('phentanil')).not.toContain('tauler');
    expect(isPlaceOf('cony-cirera', 'pou')).toBe(true);
    expect(isPlaceOf('cony-cirera', 'ajuntament')).toBe(false);
    expect(TOWN_DEFS['cony-cirera'].pixel?.cols).toBe(36);
  });
});

describe('boardView', () => {
  it('shows players only what they may see', () => {
    const v = boardView('player', data(), 'phentanil', 7);
    expect(v.rev).toBe(7);
    expect(v.quests.map((q) => q.id)).toEqual(['q1']);
    expect('note' in v.quests[0]).toBe(false);
    expect(v.ecos[1]).toEqual({ id: 'e2', num: 2, position: 1, title: '', text: '', unlocked: false });
    expect(Object.keys(v.layout).sort()).toEqual(['map', 'q1']);
    expect(v.tracked).toBe('q1');
    expect(JSON.stringify(v)).not.toContain('secret');
    expect(JSON.stringify(v)).not.toContain('Un crit');
  });
  it('shows the DM everything on that town', () => {
    const v = boardView('dm', data(), 'phentanil', 7);
    expect(v.quests.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect((v.quests[0] as Quest).note).toBe('secret');
    expect(v.ecos[1].text).toBe('Un crit');
    expect(Object.keys(v.layout).sort()).toEqual(['map', 'q1', 'q2']);
  });
  it('hides a tracked quest that players cannot see', () => {
    const d = data();
    d.tracked = 'q2';
    expect(boardView('player', d, 'phentanil', 1).tracked).toBeNull();
    expect(boardView('dm', d, 'phentanil', 1).tracked).toBe('q2');
  });
  it('lists only the quests of the requested town', () => {
    expect(boardView('player', data(), 'cony-cirera', 1).quests.map((q) => q.id)).toEqual(['q3']);
  });
});

describe('eventsFor', () => {
  const ctx = (over: Partial<EventContext> = {}): EventContext => ({
    role: 'player', town: 'phentanil', questVisible: (id) => id === 'q1', pose: (k) => (k === 'q1' ? { cx: 1, cy: 1, r: 0 } : null), ...over
  });

  it('sends players an edit without the DM note', () => {
    const items: ChangeItem[] = [{ kind: 'quest', id: 'q1', before: quest(), after: quest({ title: 'Nou', version: 2 }) }];
    const ev = eventsFor(items, ctx());
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: 'quest.upserted', quest: { title: 'Nou' } });
    expect(JSON.stringify(ev)).not.toContain('secret');
  });
  it('turns hiding into a removal for players and an update for the DM', () => {
    const items: ChangeItem[] = [{ kind: 'quest', id: 'q1', before: quest(), after: quest({ hidden: true }) }];
    expect(eventsFor(items, ctx())).toEqual([{ type: 'quest.removed', id: 'q1' }]);
    expect(eventsFor(items, ctx({ role: 'dm' }))[0].type).toBe('quest.upserted');
  });
  it('tells nothing to players about changes to hidden quests', () => {
    const items: ChangeItem[] = [
      { kind: 'quest', id: 'q2', before: quest({ id: 'q2', hidden: true }), after: quest({ id: 'q2', hidden: true, title: 'x' }) },
      { kind: 'layout', id: 'phentanil/q2', before: null, after: { cx: 1, cy: 1, r: 0 } }
    ];
    expect(eventsFor(items, ctx())).toEqual([]);
    expect(eventsFor(items, ctx({ role: 'dm' })).map((e) => e.type)).toEqual(['quest.upserted', 'layout.changed']);
  });
  it('sends the paper position along when a quest is revealed', () => {
    const items: ChangeItem[] = [{ kind: 'quest', id: 'q1', before: quest({ hidden: true }), after: quest() }];
    expect(eventsFor(items, ctx())).toEqual([
      { type: 'quest.upserted', quest: expect.objectContaining({ id: 'q1' }) },
      { type: 'layout.changed', pieces: { q1: { cx: 1, cy: 1, r: 0 } } }
    ]);
  });
  it('removes a quest from a board it was unlinked from, and only there', () => {
    const items: ChangeItem[] = [{ kind: 'quest', id: 'q1', before: quest({ towns: { phentanil: null, 'cony-cirera': null } }), after: quest({ towns: { 'cony-cirera': null } }) }];
    expect(eventsFor(items, ctx())).toEqual([{ type: 'quest.removed', id: 'q1' }]);
    expect(eventsFor(items, ctx({ town: 'cony-cirera' }))[0].type).toBe('quest.upserted');
  });
  it('filters places and layout by town', () => {
    const items: ChangeItem[] = [
      { kind: 'place', id: 'cony-cirera/pou', before: null, after: 'Aigua' },
      { kind: 'place', id: 'phentanil/ajuntament', before: 'a', after: null },
      { kind: 'layout', id: 'phentanil/map', before: null, after: { x: 1, y: 1, r: 0 } }
    ];
    expect(eventsFor(items, ctx())).toEqual([
      { type: 'place.changed', place: 'ajuntament', text: null },
      { type: 'layout.changed', pieces: { map: { x: 1, y: 1, r: 0 } } }
    ]);
  });
  it('reports tracked and party changes as each role sees them', () => {
    const items: ChangeItem[] = [{ kind: 'campaign', id: 'main', before: { tracked: 'q1', party: { level: 1, title: '' } }, after: { tracked: 'q2', party: { level: 2, title: '' } } }];
    expect(eventsFor(items, ctx())).toEqual([{ type: 'tracked.changed', tracked: null }, { type: 'party.changed', party: { level: 2, title: '' } }]);
    expect(eventsFor(items, ctx({ role: 'dm' }))[0]).toEqual({ type: 'tracked.changed', tracked: 'q2' });
  });
  it('tells players the followed quest is gone when it is hidden in the same change', () => {
    const items: ChangeItem[] = [
      { kind: 'quest', id: 'q1', before: quest(), after: quest({ hidden: true }) },
      { kind: 'campaign', id: 'main', before: { tracked: 'q1', party: { level: 1, title: '' } }, after: { tracked: null, party: { level: 1, title: '' } } }
    ];
    /* l'estat actual ja la té oculta: no compta per a l'abans */
    expect(eventsFor(items, ctx({ questVisible: () => false }))).toEqual([{ type: 'quest.removed', id: 'q1' }, { type: 'tracked.changed', tracked: null }]);
  });
  it('redacts locked ecos and reloads on imports', () => {
    const e = { id: 'e2', num: 2, position: 1, title: 'Segon', text: 'Un crit', unlocked: false };
    expect(eventsFor([{ kind: 'eco', id: 'e2', before: null, after: e }], ctx())).toEqual([{ type: 'eco.changed', eco: { ...e, title: '', text: '' } }]);
    expect(eventsFor([{ kind: 'reload', id: '*', before: null, after: null }], ctx())).toEqual([{ type: 'board.reload' }]);
  });
});

describe('legacy format', () => {
  const legacy = {
    party: { level: 2, title: '' },
    tracked: 'q1',
    quests: [
      { id: 'q1', cat: 'principal', title: 'La mina', text: 'T', steps: [{ t: 'a', d: true }, { t: 'b', d: false }], status: 'active', towns: ['phentanil'], at: { phentanil: 'ajuntament' } },
      { id: 'q2', title: 'Antiga', place: 'ferreria', status: 'done', doneAt: 1000, hidden: true, note: 'n' },
      { id: 'q3', cat: 'rara', title: 'Dos taulers', towns: ['phentanil', 'cony-cirera', 'atlantis'], at: { 'cony-cirera': 'pou' }, special: 'ecos' },
      { id: 'q1', title: 'Repetida' },
      { id: 'map', title: 'Reservada' },
      { title: 'Sense id' }
    ],
    ecos: [{ id: 'e1', num: 1, title: 'Eco', text: 'x', unlocked: true }, { id: 'final', unlocked: false }],
    layout: { map: { x: 3, y: 4, r: -1 }, q1: { cx: 5, cy: 6, r: 2, w: 285, h: 398, z: 41 }, bad: { nope: 1 } },
    places: { ajuntament: { text: 'Text propi' }, ferreria: {} }
  };

  it('migrates old shapes the way the board used to', () => {
    const n = normalizeLegacy(legacy);
    expect(n.boards.phentanil.layout).toEqual(legacy.layout);
    expect(n.quests[1].at).toEqual({ phentanil: 'ferreria' });
    expect(n.quests[1].towns).toEqual(['phentanil']);
    expect('layout' in n).toBe(false);
  });
  it('converts to campaign data, skipping what cannot be kept', () => {
    const { data: d, skipped } = fromLegacy(legacy);
    expect(d.quests.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(skipped).toEqual(['q1', 'map', 'undefined']);
    expect(d.quests[0].steps.map((s) => [s.text, s.done])).toEqual([['a', true], ['b', false]]);
    expect(d.quests[0].steps[0].id).toMatch(/^s[0-9a-z]{12}$/);
    expect(d.quests[1]).toMatchObject({ status: 'done', doneAt: 1000, hidden: true, note: 'n', towns: { phentanil: 'ferreria' }, cat: 'secundaria' });
    expect(d.quests[2]).toMatchObject({ cat: 'secundaria', special: 'ecos', towns: { phentanil: null, 'cony-cirera': 'pou' } });
    expect(d.boards.phentanil.layout).toEqual({ map: { x: 3, y: 4, r: -1 }, q1: { cx: 5, cy: 6, r: 2, w: 285, h: 398, z: 41 } });
    expect(d.boards.phentanil.places).toEqual({ ajuntament: 'Text propi' });
    expect(d.ecos[1]).toEqual({ id: 'final', num: null, position: 1, title: '', text: '', unlocked: false });
    expect(d.tracked).toBe('q1');
    for (const q of d.quests) expect(QuestSchema.safeParse(q).success).toBe(true);
  });
  it('round-trips through the export format without losing anything', () => {
    const { data: d } = fromLegacy(legacy);
    const again = fromLegacy(JSON.parse(JSON.stringify(toLegacy(d)))).data;
    expect(again).toEqual(d);
  });
  it('drops a tracked quest that is not in the file', () => {
    expect(fromLegacy({ tracked: 'nope', quests: [] }).data.tracked).toBeNull();
  });
  it('gives duplicate objective ids new ones', () => {
    const { data: d } = fromLegacy({ quests: [{ id: 'a', steps: [{ id: 'x', t: '1' }] }, { id: 'b', steps: [{ id: 'x', t: '2' }] }] });
    expect(d.quests[0].steps[0].id).toBe('x');
    expect(d.quests[1].steps[0].id).not.toBe('x');
  });
  it('accepts garbage without throwing', () => {
    for (const g of [null, 3, 'x', [], { quests: 'no' }, { quests: [null, 5] }]) expect(() => fromLegacy(g)).not.toThrow();
  });
});

describe('helpers', () => {
  it('compares titles ignoring case, accents and punctuation', () => {
    expect(titleKey('  La Missió, d’Àgata! ')).toBe(titleKey('la missio d agata'));
  });
  it('compares values ignoring key order and quest versions', () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameValue(quest({ version: 1 }), quest({ version: 5 }))).toBe(true);
    expect(sameValue(quest(), quest({ title: 'x' }))).toBe(false);
    expect(stableStringify({ b: undefined, a: null })).toBe('{"a":null}');
  });
  it('makes unique ids', () => {
    const ids = new Set(Array.from({ length: 2000 }, () => newId('q')));
    expect(ids.size).toBe(2000);
  });
});
