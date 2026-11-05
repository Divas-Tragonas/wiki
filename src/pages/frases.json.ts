import type { APIRoute } from 'astro';
import { empaqueta } from '@mina/frases';
import { videosTranscrits } from '../lib/frases';

/* L'índex del cercador de frases (/frases/): totes les frases de tots els vídeos, compactes (vegeu @mina/frases). */
export const GET: APIRoute = () =>
  new Response(JSON.stringify(empaqueta(videosTranscrits())), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
