import { mkdir, readdir, cp, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const entry of await readdir('.', { withFileTypes: true })) {
  if ((entry.isFile() && /\.(html|css|js)$/.test(entry.name)) || ['audio', 'images', 'robots.txt', 'sitemap.xml'].includes(entry.name)) {
    await cp(entry.name, `dist/${entry.name}`, { recursive: true });
  }
}
