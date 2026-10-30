import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { CHARACTER_TYPE_LABEL, PLACE_TYPE_LABEL, routes, sessionTitle } from '../lib/site';

// Converteix el Markdown del cos en text pla per indexar-lo.
function stripMd(md = ''): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_]{1,3}([^*_\n]+)[*_]{1,3}/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const GET: APIRoute = async () => {
  const [characters, places, croniques] = await Promise.all([
    getCollection('characters'),
    getCollection('places'),
    getCollection('croniques'),
  ]);

  const items = [
    ...characters.map((c) => ({
      title: c.data.name,
      description: c.data.description,
      section: 'Personatges',
      url: routes.character(c.id),
      tags: c.data.tags,
      extra: [c.data.role, c.data.player, c.data.race, c.data.pcClass, c.data.type && CHARACTER_TYPE_LABEL[c.data.type]]
        .filter(Boolean)
        .join(' '),
      body: stripMd(c.body),
    })),
    ...places.map((p) => ({
      title: p.data.name,
      description: p.data.description,
      section: 'Llocs',
      url: routes.place(p.id),
      tags: p.data.tags,
      extra: PLACE_TYPE_LABEL[p.data.type],
      body: stripMd(p.body),
    })),
    ...croniques.map((s) => ({
      title: sessionTitle(s),
      description: s.data.summary,
      section: 'Cròniques',
      url: routes.cronica(s.id),
      tags: s.data.tags,
      extra: s.data.players.join(' '),
      body: stripMd(s.body),
    })),
  ];

  return new Response(JSON.stringify(items), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
