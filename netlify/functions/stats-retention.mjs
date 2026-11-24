import { getStore, listStores } from '@netlify/blobs';
export default async function handler() {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  let scanned = 0, deleted = 0;
  for await (const page of listStores({ paginate: true })) {
    for (const name of page.stores) {
      if (++scanned > 1000 || deleted >= 20) return new Response('Bounded maintenance complete');
      const match = /^bp-player-v1-(?:production|preview)-(?:test-)?(\d{4}-\d{2}-\d{2})$/.exec(name);
      if (match && match[1] < cutoff) { await getStore(name).deleteAll(); deleted++; }
    }
  }
  return new Response('Maintenance complete');
}
export const config = { schedule: '15 4 * * *' };
