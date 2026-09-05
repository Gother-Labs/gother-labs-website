import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const siteRoot = fileURLToPath(new URL('../', import.meta.url));
const csv = text => {
  const [header, ...rows] = text.trim().split(/\r?\n/).map(line => line.split(','));
  return rows.map(row => Object.fromEntries(header.map((name, i) => [name, row[i]])));
};

export function rtlCloudFigure(rows, intervals, slug) {
  if (rows.length !== 64 || intervals.length !== 4) throw new Error(`Unexpected evidence pool: ${slug}`);
  const accepted = slug === 'sha1' ? 'accepted' : 'optimized';
  const x = value => (105 + (Number(value) + 12) / 34 * 475).toFixed(3);
  const metrics = [['area', 'Area'], ['timing', 'Timing'], ['power', 'Active power'], ['composite', 'Composite']];
  const grid = [-10, -5, 0, 5, 10, 15, 20].map(tick => `<path class="${tick === 0 ? 'zero' : 'grid'}" d="M${x(tick)} 17V280"/><text x="${x(tick)}" y="305" text-anchor="middle">${tick > 0 ? '+' : ''}${tick}%</text>`).join('');
  const clouds = metrics.map(([key, label], i) => {
    const center = 45 + i * 65;
    const points = ['baseline', accepted].map(side => rows.map(row => {
      const value = Number(row[`${side}_${key}`]);
      if (!Number.isFinite(value) || value < -12 || value > 22) throw new Error(`Point outside plotted domain: ${slug}/${key}`);
      return `<circle class="${side === 'baseline' ? 'baseline' : 'accepted'}" cx="${x(value)}" cy="${(center + (Number(row.jitter) - .5) * 27).toFixed(3)}" r="2.4"><title>${row.seed || row.pair} · ${side} ${label.toLowerCase()}: ${value.toFixed(3)}%</title></circle>`;
    }).join('')).join('');
    const interval = intervals[i];
    const low = Number(interval.estimate) - Number(interval.minus);
    const high = Number(interval.estimate) + Number(interval.plus);
    return `<text x="0" y="${center + 5}">${label}</text>${points}<g class="estimate"><path d="M${x(low)} ${center}H${x(high)}M${x(low)} ${center-5}V${center+5}M${x(high)} ${center-5}V${center+5}"/><circle cx="${x(interval.estimate)}" cy="${center}" r="3.2"/><title>Paired ${label.toLowerCase()} estimate ${Number(interval.estimate).toFixed(3)}%; 95% CI ${low.toFixed(3)} to ${high.toFixed(3)}%</title></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 320" role="img" aria-label="${slug}: all 64 baseline and optimized implementation pairs across area, timing, active power and composite; right is better"><style>text{font:13px Inter,Arial,sans-serif;fill:#000}.grid{fill:none;stroke:#000;stroke-opacity:.13}.zero{fill:none;stroke:#000;stroke-opacity:.42}.baseline{fill:#000;fill-opacity:.3}.accepted{fill:#005bff;fill-opacity:.7}.estimate{stroke:#000;fill:#fff;stroke-width:1.4}</style>${grid}${clouds}</svg>\n`;
}

// Presentation copies only. Original published figures stay byte-identical.
// Preserve geometry and measurements; update the one color-name legend to match.
const paperPalette = {
  '#050608':'#ffffff', '#080b10':'#ffffff', '#090d13':'#ffffff',
  '#f8fafc':'#000000', '#c8d0de':'#222222', '#cbd5e1':'#222222', '#d8e1ef':'#222222',
  '#8f98aa':'#595959', '#9aa3b3':'#595959', '#9aa4b2':'#595959', '#aeb7c5':'#595959',
  '#161a22':'#eeeeee', '#151b26':'#eeeeee', '#171d27':'#eeeeee', '#202735':'#dddddd',
  '#222a36':'#cccccc', '#242b38':'#cccccc', '#252a34':'#cccccc', '#283142':'#cccccc',
  '#343c4d':'#bbbbbb', '#4a5364':'#999999', '#64748b':'#777777', '#667085':'#777777',
  '#687386':'#777777', '#697386':'#777777', '#168cff':'#005bff', '#7aaee8':'#669dff',
  '#d58b7f':'#000000',
};
export function paperFigure(source) {
  const themed = source.replace('muted red is longer', 'black is longer').replace(/#[\da-f]{6}\b/gi, color => {
    if (!(color.toLowerCase() in paperPalette)) throw new Error(`Unmapped research figure color: ${color}`);
    return paperPalette[color.toLowerCase()];
  });
  // Open L-shaped axes otherwise inherit SVG's black fill and close into a
  // triangle. Scope this to paths: some figures also use .axis for text labels.
  return themed.replace('</style>', 'path.axis,path.grid{fill:none}</style>');
}

export async function writeStudioFigures(root = siteRoot, check = false) {
  async function write(relative, data) {
    const destination = path.join(root, relative);
    if (check) {
      if (await fs.readFile(destination, 'utf8') !== data) throw new Error(`Stale presentation figure: ${relative}`);
    } else {
      await fs.mkdir(path.dirname(destination), {recursive:true});
      await fs.writeFile(destination, data);
    }
  }
  const provenance = JSON.parse(await fs.readFile(path.join(root, 'assets/rtl-source/provenance.json'), 'utf8'));
  for (const entry of provenance.files) {
    const data = await fs.readFile(path.join(root, 'assets/rtl-source', entry.file));
    if (createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error(`RTL source checksum mismatch: ${entry.file}`);
  }
  for (const slug of ['sha1', 'int8-matvec', 'mlkem-cbd']) {
    const read = name => fs.readFile(path.join(root, `assets/rtl-source/${slug}-${name}.csv`), 'utf8').then(csv);
    await write(`assets/research/rtl-${slug}.svg`, rtlCloudFigure(await read('clouds'), await read('intervals'), slug));
  }
  const sourceDirectory = path.join(root, 'results/rcpsp-psplib-j30/assets');
  for (const filename of (await fs.readdir(sourceDirectory)).filter(name => name.endsWith('.svg')).sort()) {
    await write(`assets/research/rcpsp-${filename}`, paperFigure(await fs.readFile(path.join(sourceDirectory, filename), 'utf8')));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeStudioFigures(siteRoot, process.argv.includes('--check'));
  console.log('Research presentation figures and source checksums verified.');
}
