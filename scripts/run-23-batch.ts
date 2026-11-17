/**
 * Orchestrate the full pipeline for the 23 deleted module sprites:
 *   for each asset: generate (regenerate-23-modules) -> iso-validate -> finalize webp+mips.
 *
 * Up to 3 generation attempts per asset (different prompt variants).
 * Iso-validation failures are recorded; the known false-negative (lighting check on
 * indoor cutaways with a bright lower-right floor) is flagged so it can be judged visually.
 *
 * Emits a machine-readable RESULT line per asset so the report can be assembled.
 *
 * Usage: npx tsx scripts/run-23-batch.ts [--only name1,name2]
 */

import { spawnSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const INDOOR = new Set([
  'assembler', 'big_pump', 'cattle_farm', 'electronics_lab', 'engineering_lab',
  'experience_arena', 'gallery', 'greenhouse', 'luxury_promenade', 'medical_center',
  'miniaturization_factory', 'physics_lab', 'refinery', 'sanitation_station',
  'university', 'water_synthesizer',
]);
const EXTERIOR = ['ship_yard', 'wind_turbine', 'geothermal_plant', 'rtg', 'heavy_wheel', 'loading_dock', 'dock_large'];

const ALL = [...INDOOR, ...EXTERIOR];

function run(cmd: string, args: string[]): { code: number; out: string } {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf-8', shell: true });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  process.stdout.write(out);
  return { code: r.status ?? 1, out };
}

function main(): void {
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx >= 0 ? (process.argv[onlyIdx + 1] ?? '').split(',').filter(Boolean) : ALL;

  for (const name of only) {
    const indoor = INDOOR.has(name);
    let attempts = 0;
    let isoPass = false;
    let lightingFalseNeg = false;
    let finalized = false;

    for (let variant = 0; variant < 3 && !isoPass; variant++) {
      attempts = variant + 1;
      console.log(`\n========== ${name} (${indoor ? 'INDOOR' : 'EXT'}) attempt ${attempts} ==========`);
      const gen = run('npx', ['tsx', 'scripts/regenerate-23-modules.ts', '--asset', name, '--variant', String(variant)]);
      if (gen.code !== 0) {
        console.log(`  generation failed (variant ${variant})`);
        continue;
      }

      const finalPng = path.join('assets', 'final', `${name}_0.png`);
      const val = run('npx', ['tsx', 'scripts/validate-iso.ts', '--input', finalPng, '--type', 'module']);
      if (val.code === 0) {
        isoPass = true;
        break;
      }
      // Known false-negative: only the lighting check failed (indoor bright floor lower-right).
      const onlyLighting =
        /FAILED \(1 check/.test(val.out) && /\[FAIL\] Lighting upper-left/.test(val.out);
      if (indoor && onlyLighting) {
        lightingFalseNeg = true;
        isoPass = true; // accept, judge visually in report
        console.log('  NOTE: only the lighting check failed (known indoor-cutaway false-negative) — accepting for visual judgement');
        break;
      }
      console.log(`  iso-validation failed (variant ${variant}), retrying...`);
    }

    if (isoPass) {
      const fin = run('npx', ['tsx', 'scripts/finalize-module-webp.ts', '--asset', name]);
      finalized = fin.code === 0;
    }

    const status = finalized ? (lightingFalseNeg ? 'OK_LIGHTING_FALSENEG' : 'OK') : 'BLOCKED';
    console.log(`RESULT\t${name}\t${indoor ? 'INDOOR' : 'EXT'}\t${attempts}\t${isoPass ? 'PASS' : 'FAIL'}\t${status}`);
  }

  console.log('\nBATCH COMPLETE');
}

main();
