/**
 * Migration script: Convert old specific module types to generic + blueprint.
 *
 * Usage:
 *   npx ts-node scripts/migrate-to-blueprints.ts --dry-run
 *   npx ts-node scripts/migrate-to-blueprints.ts
 *
 * Maps:
 *   IRON_MINE → moduleType: MINE, activeBlueprintId: IRON_EXTRACTION
 *   COPPER_SMELTER → moduleType: SMELTER, activeBlueprintId: COPPER_SMELTING
 *   etc.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env['DYNAMODB_TABLE_NAME'] ?? 'spacegame-main';
const dryRun = process.argv.includes('--dry-run');

const client = new DynamoDBClient({ region: 'eu-central-1' });
const ddb = DynamoDBDocumentClient.from(client);

/**
 * Mapping from old specific module types to new generic type + blueprint.
 */
const MIGRATION_MAP: ReadonlyMap<string, { newModuleType: string; blueprintId: string }> = new Map([
  // Extraction — MINE
  ['IRON_MINE', { newModuleType: 'MINE', blueprintId: 'IRON_EXTRACTION' }],
  ['COPPER_MINE', { newModuleType: 'MINE', blueprintId: 'COPPER_EXTRACTION' }],
  ['SILICON_MINE', { newModuleType: 'MINE', blueprintId: 'SILICON_EXTRACTION' }],
  ['ALUMINUM_MINE', { newModuleType: 'MINE', blueprintId: 'ALUMINUM_EXTRACTION' }],
  ['TITANIUM_MINE', { newModuleType: 'MINE', blueprintId: 'TITANIUM_EXTRACTION' }],
  ['URANIUM_MINE', { newModuleType: 'MINE', blueprintId: 'URANIUM_EXTRACTION' }],
  ['CARBON_MINE', { newModuleType: 'MINE', blueprintId: 'CARBON_EXTRACTION' }],

  // Extraction — PUMP
  ['WATER_PUMP', { newModuleType: 'PUMP', blueprintId: 'WATER_EXTRACTION' }],

  // Extraction — COLLECTOR
  ['HYDROGEN_COLLECTOR', { newModuleType: 'COLLECTOR', blueprintId: 'HYDROGEN_COLLECTION' }],
  ['HELIUM3_COLLECTOR', { newModuleType: 'COLLECTOR', blueprintId: 'HELIUM3_COLLECTION' }],
  ['NITROGEN_COLLECTOR', { newModuleType: 'COLLECTOR', blueprintId: 'NITROGEN_COLLECTION' }],
  ['OXYGEN_COLLECTOR', { newModuleType: 'COLLECTOR', blueprintId: 'OXYGEN_COLLECTION' }],
  ['METHANE_COLLECTOR', { newModuleType: 'COLLECTOR', blueprintId: 'METHANE_COLLECTION' }],

  // Extraction — DEEP_DRILL (same type name, just add blueprint)
  ['DEEP_DRILL', { newModuleType: 'DEEP_DRILL', blueprintId: 'RARE_EARTH_DRILLING' }],

  // Processing — SMELTER
  ['IRON_SMELTER', { newModuleType: 'SMELTER', blueprintId: 'IRON_SMELTING' }],
  ['COPPER_SMELTER', { newModuleType: 'SMELTER', blueprintId: 'COPPER_SMELTING' }],
  ['SILICON_FOUNDRY', { newModuleType: 'SMELTER', blueprintId: 'SILICON_SMELTING' }],
  ['ALUMINUM_SMELTER', { newModuleType: 'SMELTER', blueprintId: 'ALUMINUM_SMELTING' }],
  ['TITANIUM_FORGE', { newModuleType: 'SMELTER', blueprintId: 'TITANIUM_SMELTING' }],

  // Processing — CHEMICAL_PLANT
  ['CHEMICAL_PLANT', { newModuleType: 'CHEMICAL_PLANT', blueprintId: 'CHEMICAL_PROCESSING' }],

  // Processing — REFINERY
  ['ELECTROLYZER', { newModuleType: 'REFINERY', blueprintId: 'ELECTROLYSIS' }],

  // Production — ASSEMBLER
  ['ELECTRONICS_FAB', { newModuleType: 'ASSEMBLER', blueprintId: 'ELECTRONICS_FABRICATION' }],
  ['STRUCTURAL_ASSEMBLER', { newModuleType: 'ASSEMBLER', blueprintId: 'STRUCTURAL_ASSEMBLY' }],
  ['MOTOR_WORKSHOP', { newModuleType: 'ASSEMBLER', blueprintId: 'MOTOR_ASSEMBLY' }],

  // Production — REFINERY (fuel)
  ['FUEL_REFINERY', { newModuleType: 'REFINERY', blueprintId: 'FUEL_REFINING' }],

  // Production — FACTORY
  ['HULL_FACTORY', { newModuleType: 'FACTORY', blueprintId: 'HULL_STARTER_PRODUCTION' }],
  ['MODULE_ASSEMBLER', { newModuleType: 'FACTORY', blueprintId: 'MODULE_KIT_PRODUCTION' }],
]);

interface ModuleRecord {
  PK: string;
  SK: string;
  moduleType: string;
  moduleId: string;
  [key: string]: unknown;
}

async function scanModules(): Promise<ModuleRecord[]> {
  const modules: ModuleRecord[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':sk': 'MODULE#' },
      ExclusiveStartKey: lastKey,
    }));

    for (const item of result.Items ?? []) {
      modules.push(item as unknown as ModuleRecord);
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return modules;
}

async function migrateModule(record: ModuleRecord): Promise<boolean> {
  const mapping = MIGRATION_MAP.get(record.moduleType);
  if (!mapping) {
    return false; // Not a migratable type (infrastructure, power, etc.)
  }

  console.log(`  ${record.PK}/${record.SK}: ${record.moduleType} → ${mapping.newModuleType} + ${mapping.blueprintId}`);

  if (dryRun) {
    return true;
  }

  // Update the module record
  await ddb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: record.PK, SK: record.SK },
    UpdateExpression: 'SET moduleType = :mt, activeBlueprintId = :bid',
    ExpressionAttributeValues: {
      ':mt': mapping.newModuleType,
      ':bid': mapping.blueprintId,
    },
  }));

  // Also update the hull piece that references this module
  // Hull PK is embedded in the module record PK: HULL#{hullId}
  const hullId = record.PK.replace('HULL#', '');
  // We need to find the planet that has this hull and update hull.moduleType
  // This is a best-effort update — hull pieces store moduleType for quick lookup
  // We scan for the hull piece by hullId prefix
  const hullResult = await ddb.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(SK, :sk) AND hullId = :hid',
    ExpressionAttributeValues: {
      ':sk': 'HULL#',
      ':hid': hullId,
    },
    Limit: 1,
  }));

  if (hullResult.Items && hullResult.Items.length > 0) {
    const hullItem = hullResult.Items[0] as Record<string, unknown>;
    await ddb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: hullItem['PK'] as string, SK: hullItem['SK'] as string },
      UpdateExpression: 'SET moduleType = :mt',
      ExpressionAttributeValues: { ':mt': mapping.newModuleType },
    }));
  }

  return true;
}

async function main(): Promise<void> {
  console.log(`Migration: Convert specific module types to generic + blueprint`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const modules = await scanModules();
  console.log(`Found ${modules.length} module records total`);

  let migrated = 0;
  let skipped = 0;

  for (const record of modules) {
    const wasMigrated = await migrateModule(record);
    if (wasMigrated) {
      migrated++;
    } else {
      skipped++;
    }
  }

  console.log('');
  console.log(`Done. Migrated: ${migrated}, Skipped (infrastructure/power): ${skipped}`);
  if (dryRun) {
    console.log('This was a dry run. No changes were made.');
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
