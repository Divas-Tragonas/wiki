/* Vocabulari de les missions al tauler: tipus (amb el nom i el color del paper) i estat. */
export const CATS = {
  principal: { label: 'Missió principal', short: 'Principal', color: 'red' },
  secundaria: { label: 'Missió secundària', short: 'Secundària', color: 'green' },
  personal: { label: 'Missió personal', short: 'Personal', color: 'indigo' }
};
export const catOf = (q) => (CATS[q.cat] ? q.cat : 'secundaria');
export const isDone = (q) => q.status === 'done';
/* «Encàrrec de Sildar», però «Una veu misteriosa» o «Oghma» es deixen tal com són */
export const giverLine = (g) => (!g ? '' : /^(una|un|la|el|les|els|decisi|ell|oghma)/i.test(g) ? g : 'Encàrrec de ' + g);
