import fs from 'fs';
import path from 'path';

/** The create page and every file of the create-event folder, as one string. */
export function createSources(): string {
  const dir = path.resolve(__dirname, '../create-event');
  const files = [
    path.resolve(__dirname, '../CreateEventPage.tsx'),
    ...(fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join(dir, f)) : []),
  ];
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}
