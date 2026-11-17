/**
 * composite-check.ts — Composite-Preview + optionaler VLM-Auto-Check.
 *
 * Pro Modul-Sprite (src/assets/modules/<id>/<id>_0.webp) wird ein Composite
 * mit dem Standard-Floor-Tile (src/assets/hull_floors/standard/standard_floor_0...)
 * als Hintergrund erzeugt. Output: scripts/previews/<id>_on_tile.png.
 *
 * Falls ANTHROPIC_API_KEY in scripts/.env gesetzt ist, wird jedes Composite
 * an Claude (Vision) geschickt zur Iso-Perspektiven-Bewertung. Aggregat-Report
 * landet unter scripts/previews/composite-check-report.md, raw JSON unter
 * scripts/previews/composite-check-raw.json.
 *
 * Usage:
 *   npx tsx scripts/composite-check.ts
 *   npx tsx scripts/composite-check.ts --module=ion_drive,fusion_reactor
 *   npx tsx scripts/composite-check.ts --no-vlm
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(PROJECT_ROOT, 'src/assets/modules');
const FLOOR_DIR = path.join(PROJECT_ROOT, 'src/assets/hull_floors/standard');
const PREVIEWS_DIR = path.join(__dirname, 'previews');
const ENV_FILE = path.join(__dirname, '.env');

// Composite-Layout
const TILE_COLS = 3; // 3x3-Grid für Kontext
const TILE_ROWS = 3;
const MODULE_TARGET_HEIGHT_RATIO = 1.3; // Modul-Höhe relativ zur Einzel-Tile-Höhe
const VLM_CONCURRENCY = 3;
const VLM_MODEL = 'claude-haiku-4-5-20251001'; // Vision-fähig, ~$0.10 für 77 Composites
const VLM_MAX_RETRIES = 2;

interface CliArgs {
  modules: string[] | null; // null = alle
  noVlm: boolean;
}

interface VlmResult {
  perspective_ok: boolean;
  issues: string[];
  confidence: number;
  comment: string;
}

interface ModuleResult {
  moduleId: string;
  compositePath: string;
  vlm: VlmResult | null;
  vlmError: string | null;
  vlmInputTokens?: number;
  vlmOutputTokens?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { modules: null, noVlm: false };
  for (const arg of argv.slice(2)) {
    if (arg === '--no-vlm') {
      args.noVlm = true;
    } else if (arg.startsWith('--module=') || arg.startsWith('--modules=')) {
      const list = arg.split('=', 2)[1] ?? '';
      args.modules = list
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.warn(`[composite-check] Unbekanntes Argument: ${arg}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`composite-check.ts — Composite-Preview + VLM-Iso-Check

  npx tsx scripts/composite-check.ts                          # alle Module
  npx tsx scripts/composite-check.ts --module=ion_drive,...   # ausgewählte
  npx tsx scripts/composite-check.ts --no-vlm                 # nur Composites
`);
}

/** Lese scripts/.env (KEY=VALUE pro Zeile, # = Kommentar). */
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(ENV_FILE)) return env;
  const content = fs.readFileSync(ENV_FILE, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

/** Bestimme die beste verfügbare Floor-Tile-Datei. */
function resolveFloorTile(): string {
  const candidates = [
    'standard_floor_0.webp',
    'standard_floor_0@half.png',
    'standard_floor_0@half.webp',
    'standard_floor_0@quarter.png',
  ];
  for (const c of candidates) {
    const p = path.join(FLOOR_DIR, c);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Kein Floor-Tile gefunden unter ${FLOOR_DIR}`);
}

/** Sammle alle Module mit vorhandenem _0.webp Sprite. */
function collectModules(filter: string[] | null): { id: string; sprite: string }[] {
  if (!fs.existsSync(MODULES_DIR)) return [];
  const dirs = fs.readdirSync(MODULES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const results: { id: string; sprite: string }[] = [];
  for (const dir of dirs) {
    const id = dir.name;
    if (filter && !filter.includes(id)) continue;
    const sprite = path.join(MODULES_DIR, id, `${id}_0.webp`);
    if (fs.existsSync(sprite)) {
      results.push({ id, sprite });
    }
  }
  return results;
}

/**
 * Erzeuge Composite: 3x3-Tile-Grid (versetzt für Iso-Look) + Modul oben drauf.
 * Die Tiles werden in einem Iso-Diamond-Pattern angeordnet (jede Reihe um halbe
 * Tile-Höhe versetzt, jede Spalte um halbe Tile-Breite). Das Modul sitzt in der
 * Mitte des zentralen Tiles, Unterkante des Moduls fluchtet mit Tile-Mitte.
 */
async function createComposite(modulePath: string, floorPath: string, outputPath: string): Promise<void> {
  const tileMeta = await sharp(floorPath).metadata();
  const tileW = tileMeta.width ?? 256;
  const tileH = tileMeta.height ?? 128;

  // Iso-Diamond: jede Tile ist um (tileW/2, tileH/2) Schritte versetzt.
  // 3x3-Grid → Canvas-Größe so dass alle Tiles sichtbar sind.
  // Position einer Tile (col, row): x = (col - row) * tileW/2 + offsetX,
  //                                  y = (col + row) * tileH/2 + offsetY
  // Bei col,row ∈ [0..2]:
  //   x-Range: (col-row) ∈ [-2..2] → in Pixeln [-tileW .. +tileW]
  //   y-Range: (col+row) ∈ [0..4]  → in Pixeln [0 .. 2*tileH]
  // → Canvas-Breite: 3*tileW, Höhe: 3*tileH + Padding fürs Modul oben

  const canvasW = tileW * 3;
  const moduleSprite = sharp(modulePath);
  const moduleMeta = await moduleSprite.metadata();
  const moduleSrcW = moduleMeta.width ?? 256;
  const moduleSrcH = moduleMeta.height ?? 256;

  // Modul auf plausible Größe skalieren: Höhe ~= 1.3x Tile-Höhe
  const moduleTargetH = Math.round(tileH * MODULE_TARGET_HEIGHT_RATIO);
  const moduleScale = moduleTargetH / moduleSrcH;
  const moduleTargetW = Math.round(moduleSrcW * moduleScale);

  // Canvas-Höhe so dass Modul oben Platz hat
  const moduleHeadroom = Math.max(0, moduleTargetH - tileH); // Wie viel Modul über die Tile-Mitte ragt
  const canvasH = tileH * 3 + moduleHeadroom + 20; // 20px extra Padding oben

  // Tile-Positionen berechnen (linke obere Ecke jeder Tile)
  // Zentrum verschoben: offsetX = canvasW/2 - tileW/2, offsetY = moduleHeadroom + 10
  const offsetX = canvasW / 2 - tileW / 2;
  const offsetY = moduleHeadroom + 10;

  const tileBuffer = await sharp(floorPath).toBuffer();

  const tileComposites: sharp.OverlayOptions[] = [];
  for (let row = 0; row < TILE_ROWS; row++) {
    for (let col = 0; col < TILE_COLS; col++) {
      const x = Math.round(offsetX + (col - row) * (tileW / 2));
      const y = Math.round(offsetY + (col + row) * (tileH / 2));
      // Nur tilen wenn auf Canvas
      if (x + tileW > 0 && x < canvasW && y + tileH > 0 && y < canvasH) {
        tileComposites.push({ input: tileBuffer, left: x, top: y });
      }
    }
  }

  // Modul-Position: zentriert über zentralem Tile (col=1, row=1)
  const centerTileX = offsetX + (1 - 1) * (tileW / 2);
  const centerTileY = offsetY + (1 + 1) * (tileH / 2);
  // Tile-Mitte (Oberseite des Iso-Diamonds): (centerTileX + tileW/2, centerTileY + tileH/2)
  const tileMidX = centerTileX + tileW / 2;
  const tileMidY = centerTileY + tileH / 2;
  // Modul soll horizontal mittig und Unterkante auf Tile-Mitte sitzen
  const moduleLeft = Math.round(tileMidX - moduleTargetW / 2);
  const moduleTop = Math.round(tileMidY - moduleTargetH);

  const moduleBuffer = await sharp(modulePath)
    .resize({ width: moduleTargetW, height: moduleTargetH, fit: 'fill' })
    .toBuffer();

  await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([...tileComposites, { input: moduleBuffer, left: moduleLeft, top: moduleTop }])
    .png()
    .toFile(outputPath);
}

const VLM_SYSTEM_PROMPT = `Du bewertest ob ein 3D-Sprite eines isometrischen Spielmoduls perspektivisch korrekt auf einem isometrischen Boden-Tile sitzt.

Bewertungskriterien:
1. Iso-Winkel: Modul-Kanten sollten dem 2:1 isometrischen Winkel (ca. 30 Grad Elevation) folgen, analog zum Floor-Tile.
2. Boden-Bezug: Modul sitzt auf dem Tile, nicht schwebend (kein sichtbarer Spalt zwischen Modul-Unterkante und Tile-Oberfläche).
3. Beleuchtung: konsistent (von oben-links).
4. Groesse: plausibel zum Tile (kein Riese, kein Zwerg).

Antworte AUSSCHLIESSLICH mit JSON, ohne Markdown-Codeblock, ohne weitere Erklaerung:
{
  "perspective_ok": true|false,
  "issues": ["floating" | "wrong_angle" | "scale_off" | "lighting_off" | "other"],
  "confidence": 0-100,
  "comment": "kurzer Satz auf Deutsch"
}`;

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Sende ein Composite an Claude und parse das JSON-Resultat. */
async function callVlm(
  apiKey: string,
  imagePath: string,
  moduleId: string,
): Promise<{ result: VlmResult; inputTokens: number; outputTokens: number }> {
  const imageData = fs.readFileSync(imagePath).toString('base64');

  const body = {
    model: VLM_MODEL,
    max_tokens: 512,
    system: VLM_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageData,
            },
          },
          {
            type: 'text',
            text: `Bewerte das Composite des Moduls "${moduleId}" auf dem Standard-Floor-Tile.`,
          },
        ],
      },
    ],
  };

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= VLM_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        // 429/5xx → retryen
        if ((res.status === 429 || res.status >= 500) && attempt < VLM_MAX_RETRIES) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json = (await res.json()) as AnthropicResponse;
      const textBlock = json.content.find((c) => c.type === 'text');
      if (!textBlock?.text) throw new Error('Keine Text-Antwort von Claude.');

      const parsed = parseVlmJson(textBlock.text);
      return {
        result: parsed,
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < VLM_MAX_RETRIES) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  throw lastErr ?? new Error('VLM-Call fehlgeschlagen.');
}

function parseVlmJson(text: string): VlmResult {
  // Tolerant: Codefence-Wrapper entfernen falls vorhanden
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  }
  // Fallback: erstes { bis letztes }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  const parsed = JSON.parse(cleaned);
  return {
    perspective_ok: Boolean(parsed.perspective_ok),
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    comment: typeof parsed.comment === 'string' ? parsed.comment : '',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simple Concurrency-Limiter. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= items.length) break;
          results[i] = await task(items[i], i);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return results;
}

function buildReport(results: ModuleResult[], vlmActive: boolean): string {
  const date = new Date().toISOString();
  const total = results.length;

  const ok: ModuleResult[] = [];
  const warnings: ModuleResult[] = [];
  const failed: ModuleResult[] = [];
  const errored: ModuleResult[] = [];

  for (const r of results) {
    if (!vlmActive || r.vlm == null) {
      if (r.vlmError) errored.push(r);
      continue;
    }
    if (r.vlm.perspective_ok && r.vlm.confidence >= 80) ok.push(r);
    else if (r.vlm.perspective_ok) warnings.push(r);
    else failed.push(r);
  }

  let md = `# Composite-Check Report\n\n`;
  md += `**Datum:** ${date}\n\n`;
  md += `**Total Composites:** ${total}\n\n`;
  md += `**VLM-Check aktiv:** ${vlmActive ? 'ja' : 'nein (kein ANTHROPIC_API_KEY in scripts/.env)'}\n\n`;

  if (!vlmActive) {
    md += `> Hinweis: VLM-Check uebersprungen. Fuege \`ANTHROPIC_API_KEY=...\` in \`scripts/.env\` ein und re-run, um die Iso-Perspektive automatisch bewerten zu lassen.\n\n`;
    md += `## Generierte Composites\n\n`;
    for (const r of results) {
      md += `- \`${path.basename(r.compositePath)}\` (\`${r.moduleId}\`)\n`;
    }
    return md;
  }

  md += `**Aggregat:** OK ${ok.length} | Warnings ${warnings.length} | Failed ${failed.length} | Errored ${errored.length}\n\n`;

  md += `## OK (perspective_ok, confidence >= 80)\n\n`;
  if (ok.length === 0) md += `_keine_\n\n`;
  for (const r of ok) {
    md += `- **${r.moduleId}** — confidence ${r.vlm!.confidence} — ${r.vlm!.comment}\n`;
  }

  md += `\n## Warnings (perspective_ok aber confidence < 80)\n\n`;
  if (warnings.length === 0) md += `_keine_\n\n`;
  for (const r of warnings) {
    const issues = r.vlm!.issues.length > 0 ? ` [${r.vlm!.issues.join(', ')}]` : '';
    md += `- **${r.moduleId}** — confidence ${r.vlm!.confidence}${issues} — ${r.vlm!.comment}\n`;
  }

  md += `\n## Failed (perspective_ok = false)\n\n`;
  if (failed.length === 0) md += `_keine_\n\n`;
  for (const r of failed) {
    const issues = r.vlm!.issues.length > 0 ? ` [${r.vlm!.issues.join(', ')}]` : '';
    md += `- **${r.moduleId}** — confidence ${r.vlm!.confidence}${issues} — ${r.vlm!.comment}\n`;
  }

  if (errored.length > 0) {
    md += `\n## VLM-Fehler\n\n`;
    for (const r of errored) {
      md += `- **${r.moduleId}** — ${r.vlmError}\n`;
    }
  }

  // Cost-Schätzung
  const totalIn = results.reduce((s, r) => s + (r.vlmInputTokens ?? 0), 0);
  const totalOut = results.reduce((s, r) => s + (r.vlmOutputTokens ?? 0), 0);
  // claude-opus-4-x: ca. $15/M input, $75/M output (Stand 2026)
  const estCostUsd = (totalIn / 1_000_000) * 15 + (totalOut / 1_000_000) * 75;
  md += `\n## Token-Verbrauch\n\n`;
  md += `- Input-Tokens (Summe): ${totalIn.toLocaleString('en-US')}\n`;
  md += `- Output-Tokens (Summe): ${totalOut.toLocaleString('en-US')}\n`;
  md += `- Geschaetzte Kosten (${VLM_MODEL}): $${estCostUsd.toFixed(4)}\n`;

  return md;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log('[composite-check] Start.');

  if (!fs.existsSync(PREVIEWS_DIR)) {
    fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
  }

  const env = loadEnv();
  const apiKey = env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';
  const vlmActive = !args.noVlm && apiKey.length > 0;

  if (args.noVlm) {
    console.log('[composite-check] --no-vlm aktiv: nur Composites werden generiert.');
  } else if (!apiKey) {
    console.log('[composite-check] Kein ANTHROPIC_API_KEY in scripts/.env gefunden — VLM-Schritt wird uebersprungen.');
  } else {
    console.log(`[composite-check] VLM-Check aktiv (Modell: ${VLM_MODEL}, Concurrency ${VLM_CONCURRENCY}).`);
  }

  const floorPath = resolveFloorTile();
  console.log(`[composite-check] Floor-Tile: ${path.relative(PROJECT_ROOT, floorPath)}`);

  const modules = collectModules(args.modules);
  console.log(`[composite-check] ${modules.length} Modul-Sprite(s) gefunden.`);
  if (modules.length === 0) {
    console.warn('[composite-check] Keine passenden Module — Abbruch.');
    return;
  }

  // Phase 1: Composites generieren
  console.log('[composite-check] Phase 1/2: Composites generieren...');
  const results: ModuleResult[] = [];
  for (let i = 0; i < modules.length; i++) {
    const m = modules[i];
    const outPath = path.join(PREVIEWS_DIR, `${m.id}_on_tile.png`);
    try {
      await createComposite(m.sprite, floorPath, outPath);
      results.push({ moduleId: m.id, compositePath: outPath, vlm: null, vlmError: null });
      if ((i + 1) % 10 === 0 || i === modules.length - 1) {
        console.log(`[composite-check]   ${i + 1}/${modules.length} Composites erstellt.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[composite-check]   FEHLER bei ${m.id}: ${msg}`);
      results.push({ moduleId: m.id, compositePath: outPath, vlm: null, vlmError: `composite: ${msg}` });
    }
  }

  // Phase 2: VLM-Check (optional)
  if (vlmActive) {
    console.log(`[composite-check] Phase 2/2: VLM-Check (${results.length} Composites, Concurrency ${VLM_CONCURRENCY})...`);
    let done = 0;
    await runWithConcurrency(results, VLM_CONCURRENCY, async (r) => {
      if (r.vlmError) {
        done++;
        return null;
      }
      try {
        const { result, inputTokens, outputTokens } = await callVlm(apiKey, r.compositePath, r.moduleId);
        r.vlm = result;
        r.vlmInputTokens = inputTokens;
        r.vlmOutputTokens = outputTokens;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        r.vlmError = `vlm: ${msg}`;
        console.warn(`[composite-check]   VLM-Fehler bei ${r.moduleId}: ${msg}`);
      }
      done++;
      if (done % 5 === 0 || done === results.length) {
        console.log(`[composite-check]   ${done}/${results.length} VLM-Checks abgeschlossen.`);
      }
      return null;
    });
  } else {
    console.log('[composite-check] Phase 2/2: uebersprungen.');
  }

  // Report schreiben
  const reportMd = buildReport(results, vlmActive);
  const reportPath = path.join(PREVIEWS_DIR, 'composite-check-report.md');
  fs.writeFileSync(reportPath, reportMd, 'utf-8');

  const rawJson = {
    date: new Date().toISOString(),
    vlmActive,
    model: vlmActive ? VLM_MODEL : null,
    floorTile: path.relative(PROJECT_ROOT, floorPath),
    results: results.map((r) => ({
      moduleId: r.moduleId,
      compositePath: path.relative(PROJECT_ROOT, r.compositePath),
      vlm: r.vlm,
      vlmError: r.vlmError,
      vlmInputTokens: r.vlmInputTokens ?? null,
      vlmOutputTokens: r.vlmOutputTokens ?? null,
    })),
  };
  const rawPath = path.join(PREVIEWS_DIR, 'composite-check-raw.json');
  fs.writeFileSync(rawPath, JSON.stringify(rawJson, null, 2), 'utf-8');

  console.log(`[composite-check] Report: ${path.relative(PROJECT_ROOT, reportPath)}`);
  console.log(`[composite-check] Raw:    ${path.relative(PROJECT_ROOT, rawPath)}`);
  console.log('[composite-check] Fertig.');
}

main().catch((err) => {
  console.error('[composite-check] Fatal:', err);
  process.exit(1);
});
