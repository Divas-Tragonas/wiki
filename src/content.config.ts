import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const characters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/characters' }),
  schema: z.object({
    name: z.string(),
    description: z.string(),
    role: z.string().optional(),
    type: z.enum(['creature', 'humanoid', 'faction', 'undead', 'fiend', 'other']).optional(),
    cr: z.string().optional(),
    status: z.enum(['ally', 'neutral', 'active', 'defeated', 'unknown']).default('unknown'),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
  }),
});

const places = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/places' }),
  schema: z.object({
    name: z.string(),
    type: z.enum(['city', 'dungeon', 'forest', 'ruin', 'region', 'other']),
    description: z.string(),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
  }),
});

const croniques = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/croniques' }),
  schema: z.object({
    title: z.string(),
    session: z.number(),
    date: z.date(),
    summary: z.string(),
    players: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { characters, places, croniques };
