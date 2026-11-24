import { getStore } from '@netlify/blobs';
export const syntheticSessionId = '00000000-0000-4000-8000-000000000001';
export function namespace(request) {
  return ['thebasementpaintings.com', 'www.thebasementpaintings.com', 'timely-biscochitos-e5a784.netlify.app'].includes(new URL(request.url).hostname) ? 'production' : 'preview';
}
export function storeName(request, day, test = false) { return `bp-player-v1-${namespace(request)}-${test ? 'test-' : ''}${day}`; }
export function dayStore(request, day, test = false) { return getStore({ name: storeName(request, day, test), consistency: 'strong' }); }
export function dateRange(url, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10), from = url.searchParams.get('from') || new Date(now - 6 * 86400000).toISOString().slice(0, 10), to = url.searchParams.get('to') || today;
  for (const day of [from, to]) if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) throw new Error('Invalid dates');
  const span = Date.parse(to) - Date.parse(from);
  if (span < 0 || span > 30 * 86400000 || to > today || Date.parse(from) < Date.parse(today) - 89 * 86400000) throw new Error('Choose 1–31 days within the last 90 days');
  return { from, to };
}
export async function readRecords(request, from, to, test = false) {
  const records = [], jobs = [];
  // A paused play can resume up to seven days after it started.
  for (let date = Date.parse(from) - 7 * 86400000; date <= Date.parse(to); date += 86400000) {
    const day = new Date(date).toISOString().slice(0, 10), store = dayStore(request, day, test);
    for await (const page of store.list({ paginate: true })) {
      for (const blob of page.blobs) {
        if (jobs.length >= 5000) throw new Error('Too many checkpoints; choose a shorter range');
        jobs.push({ store, key: blob.key });
      }
    }
  }
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(20, jobs.length) }, async () => {
    while (cursor < jobs.length) { const job = jobs[cursor++]; const record = await job.store.get(job.key, { type: 'json' }); if (record) records.push(record); }
  }));
  return records;
}
