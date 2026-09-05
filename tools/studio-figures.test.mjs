import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { paperFigure, writeStudioFigures } from './studio-figures.mjs';

test('the paper palette preserves all figure geometry, measurements and outcomes', async () => {
  const source = new URL('../results/rcpsp-psplib-j30/assets/', import.meta.url);
  for (const file of (await fs.readdir(source)).filter(name => name.endsWith('.svg'))) {
    const original = await fs.readFile(new URL(file, source), 'utf8');
    const themed = paperFigure(original);
    const withoutPalette = svg => svg.replace(/#[\da-f]{6}\b/gi, '#COLOR').replace('muted red is longer', 'black is longer');
    assert.equal(withoutPalette(themed), withoutPalette(original), file);
    assert.ok(themed.includes('#ffffff'), `${file}: white paper background`);
    assert.ok(!themed.includes('muted red'), `${file}: legend agrees with palette`);
  }
});

test('all displayed research figures regenerate exactly from their checked sources', async () => {
  await writeStudioFigures(undefined, true);
});
