// Places every module type of the game next to the colony of a separate showcase account, to
// look at all models in the game (closed and opened) and at a full store. Needs an account whose
// store holds every hull and module item (new accounts get 1000 of each while the backend's
// test grant is on). The showcase account lives in .local/showcase-account.json; the normal
// development account is not touched.
//
//   node tools/showcase.cjs [--columns 12] [--dry-run]
//
// Layout: a block of hulls east of the colony, filled row by row so every new hull touches one
// that is already there. 2x2 modules first, then 1x1. Indoor modules stand on the indoor hulls
// in turn (so every closed container shows up too), outdoor ones on outdoor platforms; free
// cells get standard hulls, and every third row is left free as a corridor (path rules). Left out: under-water modules (no water on the surface) and shafts
// (they need a hull above). Sends one bestEffort batch and prints what was refused, with the
// server's code (habitats above tier 1 stay locked by the tier gate). Run it once per fresh
// account: a second run builds a second block next to the first.
'use strict';

const { call, signIn } = require('./dev-account.cjs');

const SERVER = 'https://trade-empire.net';
// COMPOSITE is for mobile structures only (guests on docks): refused on the surface.
const INDOOR_HULLS = ['STARTER', 'STANDARD', 'REINFORCED', 'GLASS_CARBON'];
const OUTDOOR_HULL = 'PLATFORM_OUTDOOR';
const FILLER_HULL = 'STANDARD';

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function json(account, route) {
  const answer = await call(SERVER, 'GET', route, null, account.token);
  if (answer.status !== 200) throw new Error(`GET ${route}: ${answer.status} ${answer.text.slice(0, 200)}`);
  return answer.text;
}

// Which slot a module takes: "INDOOR", "OUTDOOR" or null (under water only).
function slotOf(module) {
  if (module.positioning.includes('INDOOR')) return 'INDOOR';
  if (module.positioning.includes('OUTDOOR')) return 'OUTDOOR';
  return null;
}

// Every third row (0, 3, 6 …) stays free hulls: a corridor (draft.29 path rules) that runs to the
// block's outer edge (its entrance) and touches every module in the two rows between.
const isCorridorRow = (y) => y % 3 === 0;

// Packs the modules into rows of `columns` cells: returns [{module, x, y}] (local to the block)
// and the number of rows used.
function pack(modules, columns) {
  const taken = new Set();
  const placed = [];
  let rows = 0;
  for (const module of modules) {
    const w = module.size.x;
    const d = module.size.y;
    for (let y = 0; ; y++) {
      let crosses = false;
      for (let dy = 0; dy < d; dy++) crosses = crosses || isCorridorRow(y + dy);
      if (crosses) continue;
      let spot = -1;
      for (let x = 0; x + w <= columns && spot < 0; x++) {
        let free = true;
        for (let dy = 0; dy < d && free; dy++) for (let dx = 0; dx < w && free; dx++) free = !taken.has(`${x + dx},${y + dy}`);
        if (free) spot = x;
      }
      if (spot < 0) continue;
      for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) taken.add(`${spot + dx},${y + dy}`);
      placed.push({ module, x: spot, y });
      rows = Math.max(rows, y + d);
      break;
    }
  }
  // Close with a corridor row: modules in the last row touch nothing else that is free.
  while (rows > 0 && !isCorridorRow(rows)) rows++;
  return { placed, rows: rows + 1 };
}

async function main() {
  const columns = Number(arg('columns', '12'));
  const dryRun = process.argv.includes('--dry-run');
  const account = await signIn(SERVER, 'showcase');
  console.log(`# showcase account ${account.playerName}`);

  const definitions = JSON.parse(await json(account, '/v2/definitions'));
  const structures = JSON.parse(await json(account, '/v2/structures'));
  const home = structures.items.find((s) => s.anchor && s.anchor.type === 'surface');
  if (!home) throw new Error('no surface structure');
  const bodyId = home.anchor.bodyId;
  const inventory = JSON.parse(await json(account, `/v2/structures/${home.structureId}/inventory`));
  const layoutLines = (await json(account, `/v2/structures/${home.structureId}/layout`)).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const header = layoutLines.find((line) => line.line === 'header');
  const offset = header.anchor.offset;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const chunk of layoutLines.filter((line) => line.line === 'chunk')) {
    for (const hull of chunk.hulls) {
      maxX = Math.max(maxX, hull[0]);
      minY = Math.min(minY, hull[1]);
    }
  }

  // What the store holds, whole units (the inventory gives micro-units at its time `at`).
  const scale = definitions.fixedPointScale || 1000000;
  const stock = {};
  for (const entry of inventory.items || []) stock[entry.item] = Math.floor((entry.value || 0) / scale);
  const moduleItem = {};
  for (const resource of definitions.resources) if (resource.kind === 'MODULE_ITEM') moduleItem[resource.module] = resource.key;

  // Shafts (elevator, staircase) need a hull above them; under-water modules need water.
  // Only what a player may build (draft.39 `owners`; enterprise items are refused), and at most
  // two cells deep: two rows lie between the corridor rows, a deeper module never fits there.
  const playerMay = (m) => !Array.isArray(m.owners) || m.owners.includes('player');
  const fits = (m) => slotOf(m) !== null && !m.verticalAccess && playerMay(m) && m.size.y <= 2 && m.size.x <= 12;
  // Modules the store does not hold (the core module: the colony has its one already) stay out.
  const inStore = (m) => (stock[moduleItem[m.key]] || 0) >= 1;
  const wanted = definitions.modules.filter((m) => fits(m) && inStore(m));
  const skipped = definitions.modules.filter((m) => !fits(m)).map((m) => m.key);
  const notInStore = definitions.modules.filter((m) => fits(m) && !inStore(m)).map((m) => m.key);
  wanted.sort((a, b) => b.size.x * b.size.y - a.size.x * a.size.y || a.key.localeCompare(b.key));
  const { placed, rows } = pack(wanted, columns);
  console.log(`# ${wanted.length} modules in ${columns} x ${rows} cells; left out (under water, shafts): ${skipped.join(', ') || '-'}`);
  if (notInStore.length > 0) console.log(`# left out (not in the store): ${notInStore.join(', ')}`);

  // Hull type of every cell of the block.
  const cellHull = {};
  let indoor = 0;
  for (const { module, x, y } of placed) {
    const slot = slotOf(module);
    const hull = slot === 'OUTDOOR' ? OUTDOOR_HULL : INDOOR_HULLS[indoor++ % INDOOR_HULLS.length];
    for (let dy = 0; dy < module.size.y; dy++) for (let dx = 0; dx < module.size.x; dx++) cellHull[`${x + dx},${y + dy}`] = hull;
  }
  const x0 = offset.x + maxX + 1;
  const y0 = offset.y + minY;
  const z = offset.z;
  const ops = [];
  const hullNeed = {};
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const hull = cellHull[`${x},${y}`] || FILLER_HULL;
      hullNeed[hull] = (hullNeed[hull] || 0) + 1;
      ops.push({ op: 'placeHull', hullType: hull, x: x0 + x, y: y0 + y, z });
    }
  }
  for (const { module, x, y } of placed) {
    ops.push({ op: 'placeModule', moduleType: module.key, x: x0 + x, y: y0 + y, z, rotation: 0 });
  }

  // Check the store before sending: every hull and module item must be there.
  const missing = [];
  for (const [hull, count] of Object.entries(hullNeed)) if ((stock[`HULL_${hull}`] || 0) < count) missing.push(`HULL_${hull} ${stock[`HULL_${hull}`] || 0}/${count}`);
  for (const { module } of placed) if ((stock[moduleItem[module.key]] || 0) < 1) missing.push(moduleItem[module.key] || `${module.key} (no item)`);
  if (missing.length > 0) {
    console.log(`# store lacks ${missing.length} items, e.g. ${missing.slice(0, 8).join(', ')}`);
    if (!dryRun) {
      console.log('# not sent (the test grant is probably not live yet); --dry-run shows the plan anyway');
      process.exit(2);
    }
  }
  console.log(`# ${ops.length} ops: ${Object.entries(hullNeed).map(([h, c]) => `${c} ${h}`).join(', ')}, ${placed.length} modules, block at x ${x0}, y ${y0}`);
  if (dryRun) return;

  const answer = await call(SERVER, 'POST', `/v2/bodies/${encodeURIComponent(bodyId)}/ops`, { mode: 'bestEffort', ops }, account.token);
  if (answer.status !== 200) throw new Error(`ops: ${answer.status} ${answer.text.slice(0, 300)}`);
  const result = JSON.parse(answer.text);
  const refused = result.results.filter((r) => !r.ok);
  const byCode = {};
  for (const r of refused) {
    const op = ops[r.index];
    (byCode[r.error] = byCode[r.error] || []).push(op.moduleType || op.hullType);
  }
  console.log(`# placed ${result.results.length - refused.length} of ${ops.length}`);
  for (const [code, what] of Object.entries(byCode)) console.log(`REFUSED ${code}: ${what.join(', ')}`);
  process.exit(refused.length > 0 ? 1 : 0);
}

main().catch((error) => { console.error('FAILED ' + error.message); process.exit(1); });
