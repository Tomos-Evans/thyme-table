import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

/** Emits sw.js with a precache list of every built file, versioned by content hash. */
function serviceWorker(): Plugin {
  return {
    name: 'thyme-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256');
      const files: string[] = [];
      for (const [fileName, item] of Object.entries(bundle)) {
        if (fileName.endsWith('.map')) continue;
        files.push(fileName);
        hash.update(fileName);
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      for (const full of listFiles('public')) {
        const rel = relative('public', full).split('\\').join('/');
        files.push(rel);
        hash.update(rel);
        hash.update(readFileSync(full));
      }
      const precache = ['./', ...files.filter((f) => f !== 'sw.js')];
      const source = readFileSync('sw-src/sw.js', 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
});
