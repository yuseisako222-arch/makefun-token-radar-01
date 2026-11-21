import * as fs from 'node:fs';
import { join } from 'node:path';
import { parseSnapshot, buildRadar, dataScript, boardIssue } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const dossierLimits = {
  text_max_bytes: 64 * 1024,
  screenshots: { max: 4, max_bytes: 512 * 1024 },
  dashboard: { max_files: 400, max_bytes: 4 * 1024 * 1024 },
};
const screenshotName = /^\w[\w.-]{0,127}$/;
const prefix = 'token radar: ';

function option(flag: string): string | undefined {
  const args = process.argv;
  const position = args.indexOf(flag);
  const separateValue = position === -1 ? undefined : args[position + 1];
  const assignment = `${flag}=`;
  return separateValue ?? args.find((value) => value.startsWith(assignment))?.slice(assignment.length);
}

function exitWithMessage(status: number, message: string): never {
  process.stderr.write(`${prefix}${message}\n`);
  process.exit(status);
}

function publishAssets(folder: string, destination: string): string[] {
  const origin = join(import.meta.dirname, folder);
  const published: string[] = [];
  if (fs.existsSync(origin)) {
    const target = join(destination, folder);
    fs.mkdirSync(target, { recursive: true });
    for (const filename of fs.readdirSync(origin)) {
      if (filename[0] === '.') continue;
      const asset = join(origin, filename);
      if (fs.statSync(asset).isFile()) {
        fs.copyFileSync(asset, join(target, filename));
        published.push(filename);
      }
    }
  }
  return published;
}

function run(): void {
  const input = option('--input') ?? '/input';
  const snapshotPath = input.endsWith('.json') ? input : join(input, 'snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    exitWithMessage(2, `no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`);
  }

  const destination = option('--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const snapshot = parseSnapshot(fs.readFileSync(snapshotPath, 'utf8'));
  const result = buildRadar(snapshot);
  const validationError = boardIssue(result.board, snapshot);
  if (validationError !== null) {
    exitWithMessage(1, `the model wrote a board the gate refuses: ${validationError}`);
  }

  const boardPath = join(destination, 'board.json');
  const dataPath = join(destination, 'data.js');
  const dossierPath = join(destination, 'dossier.json');
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(boardPath, JSON.stringify({ rows: result.board }) + '\n');
  fs.writeFileSync(dataPath, dataScript(result.radar));

  publishAssets('dashboard', destination);
  const images = publishAssets('screenshots', destination);
  if (images.length < 3) {
    const imageNoun = images.length === 1 ? 'image' : 'images';
    exitWithMessage(1, `screenshots/ holds ${images.length} ${imageNoun}: hand in 3, the board, a detail view and a filtered view`);
  }
  for (const image of images) {
    if (!screenshotName.test(image)) {
      exitWithMessage(1, `screenshots/${image}: a name is letters, digits and . _ -, 1 to 128 characters`);
    }
  }

  // The dossier builder reads the dashboard and images from the output directory.
  fs.writeFileSync(dossierPath, buildDossier(destination, dossierLimits));

  const { early_size: earlyRows, live_size: liveRows } = result.radar;
  const dashboardSummary = `${join(destination, 'dashboard')} (3 files)`;
  const screenshotSummary = `${join(destination, 'screenshots')} (${images.length} images)`;
  const ranked = `${result.board.length} rows scored (${earlyRows} early, ${liveRows} live set aside)`;
  process.stdout.write([
    `${prefix}${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${ranked}`,
    `${prefix}wrote ${boardPath}, ${dataPath}, ${dashboardSummary}, ${screenshotSummary} and ${dossierPath}`,
    '',
  ].join('\n'));
}

run();
