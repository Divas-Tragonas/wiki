/* Els canvis del DM. Cada ruta valida l'entrada, crida la regla de domini dins d'un canvi (historial, revisió i
   avís als taulers) i retorna la revisió nova amb l'element tal com ha quedat. */
import { Hono } from 'hono';
import {
  EcoCreateBody, EcoPatchBody, LayoutPatchBody, PartyPatchBody, PlaceTextBody, QuestCreateBody, QuestPatchBody,
  StepCreateBody, StepOrderBody, StepPatchBody, TownLinkBody, TrackedBody
} from '@mina/model';
import * as d from '../../services/domain.ts';
import * as repo from '../../store/repo.ts';
import { body, change, dmAuthed, ifMatch, type AppEnv, type Ctx } from '../context.ts';

/* la missió després del canvi (o la de la base de dades si no ha canviat res) */
async function questOut(c: Ctx, rev: number, id: string) {
  return c.json({ rev, quest: await repo.loadQuest(c.get('deps').db, id) });
}

export const editRoutes = new Hono<AppEnv>()
  /* ---------- missions ---------- */
  .post('/quests', dmAuthed, async (c) => {
    const b = await body(c, QuestCreateBody);
    const r = await change(c, 'quest.create', (uow) => d.createQuest(uow, b));
    return c.json({ rev: r.rev, quest: await repo.loadQuest(c.get('deps').db, r.result.id) }, 201);
  })
  .patch('/quests/:id', dmAuthed, async (c) => {
    const id = c.req.param('id'), b = await body(c, QuestPatchBody), v = ifMatch(c);
    const r = await change(c, 'quest.update', (uow) => d.patchQuest(uow, id, b, v));
    return questOut(c, r.rev, id);
  })
  .post('/quests/:id/:action{complete|reopen|hide|reveal}', dmAuthed, async (c) => {
    const id = c.req.param('id'), action = c.req.param('action') as 'complete' | 'reopen' | 'hide' | 'reveal', v = ifMatch(c);
    const r = await change(c, 'quest.' + action, (uow) => d.setQuestState(uow, id, action, v));
    return questOut(c, r.rev, id);
  })
  .delete('/quests/:id', dmAuthed, async (c) => {
    const id = c.req.param('id'), v = ifMatch(c);
    const r = await change(c, 'quest.delete', (uow) => d.deleteQuest(uow, id, v));
    return c.json({ rev: r.rev });
  })
  .put('/quests/:id/towns/:town', dmAuthed, async (c) => {
    const id = c.req.param('id'), town = d.assertTown(c.req.param('town')), b = await body(c, TownLinkBody);
    const r = await change(c, 'quest.link', (uow) => d.linkTown(uow, id, town, b.place));
    return questOut(c, r.rev, id);
  })
  .delete('/quests/:id/towns/:town', dmAuthed, async (c) => {
    const id = c.req.param('id'), town = d.assertTown(c.req.param('town'));
    const r = await change(c, 'quest.unlink', (uow) => d.unlinkTown(uow, id, town));
    return questOut(c, r.rev, id);
  })
  /* ---------- objectius ---------- */
  .post('/quests/:id/steps', dmAuthed, async (c) => {
    const id = c.req.param('id'), b = await body(c, StepCreateBody);
    const r = await change(c, 'step.add', (uow) => d.addStep(uow, id, b));
    const out = await repo.loadQuest(c.get('deps').db, id);
    return c.json({ rev: r.rev, step: out?.steps.find((s) => s.id === r.result), quest: out }, 201);
  })
  .put('/quests/:id/steps/order', dmAuthed, async (c) => {
    const id = c.req.param('id'), b = await body(c, StepOrderBody);
    const r = await change(c, 'step.order', (uow) => d.orderSteps(uow, id, b.ids));
    return questOut(c, r.rev, id);
  })
  .patch('/quests/:id/steps/:stepId', dmAuthed, async (c) => {
    const id = c.req.param('id'), stepId = c.req.param('stepId'), b = await body(c, StepPatchBody);
    const r = await change(c, 'step.update', (uow) => d.patchStep(uow, id, stepId, b));
    return questOut(c, r.rev, id);
  })
  .delete('/quests/:id/steps/:stepId', dmAuthed, async (c) => {
    const id = c.req.param('id'), stepId = c.req.param('stepId');
    const r = await change(c, 'step.delete', (uow) => d.deleteStep(uow, id, stepId));
    return questOut(c, r.rev, id);
  })
  /* ---------- campanya ---------- */
  .put('/tracked', dmAuthed, async (c) => {
    const b = await body(c, TrackedBody);
    const r = await change(c, 'tracked.set', (uow) => d.setTracked(uow, b.questId));
    return c.json({ rev: r.rev, tracked: b.questId });
  })
  .patch('/party', dmAuthed, async (c) => {
    const b = await body(c, PartyPatchBody);
    const r = await change(c, 'party.update', (uow) => d.patchParty(uow, b));
    return c.json({ rev: r.rev, party: (await repo.loadMeta(c.get('deps').db)).party });
  })
  /* ---------- ecos ---------- */
  .post('/ecos', dmAuthed, async (c) => {
    const b = await body(c, EcoCreateBody);
    const r = await change(c, 'eco.create', (uow) => d.createEco(uow, b));
    return c.json({ rev: r.rev, eco: r.result }, 201);
  })
  .patch('/ecos/:id', dmAuthed, async (c) => {
    const id = c.req.param('id'), b = await body(c, EcoPatchBody);
    const r = await change(c, 'eco.update', (uow) => d.patchEco(uow, id, b));
    return c.json({ rev: r.rev, eco: await repo.loadEco(c.get('deps').db, id) });
  })
  .delete('/ecos/:id', dmAuthed, async (c) => {
    const id = c.req.param('id');
    const r = await change(c, 'eco.delete', (uow) => d.deleteEco(uow, id));
    return c.json({ rev: r.rev });
  })
  /* ---------- llocs i peces ---------- */
  .put('/boards/:town/places/:place', dmAuthed, async (c) => {
    const town = d.assertTown(c.req.param('town')), place = c.req.param('place'), b = await body(c, PlaceTextBody);
    const r = await change(c, 'place.set', (uow) => d.setPlaceText(uow, town, place, b.text));
    return c.json({ rev: r.rev, place, text: b.text });
  })
  .delete('/boards/:town/places/:place', dmAuthed, async (c) => {
    const town = d.assertTown(c.req.param('town')), place = c.req.param('place');
    const r = await change(c, 'place.reset', (uow) => d.setPlaceText(uow, town, place, null));
    return c.json({ rev: r.rev, place, text: null });
  })
  .patch('/boards/:town/layout', dmAuthed, async (c) => {
    const town = d.assertTown(c.req.param('town')), b = await body(c, LayoutPatchBody);
    const r = await change(c, 'layout.update', (uow) => d.patchLayout(uow, town, b.pieces));
    return c.json({ rev: r.rev, layout: (await repo.loadLayouts(c.get('deps').db))[town] || {} });
  });
