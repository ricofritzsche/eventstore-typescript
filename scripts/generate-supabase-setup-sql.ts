import { createSupabaseSetupSql } from '../src/eventstore/stores/supabase';

interface CliOptions {
  tableName: string;
  schemaName?: string;
  appendFunctionName?: string;
}

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(message);
  }
  console.error('Usage: npm run supabase:sql -- --table <tableName> [--schema <schemaName>] [--function <appendFunctionName>]');
  process.exit(1);
}

function parseArgs(argv: string[]): CliOptions {
  let tableName: string | undefined;
  let schemaName: string | undefined;
  let appendFunctionName: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === '--table') {
      tableName = argv[i + 1];
      i++;
      continue;
    }
    if (arg === '--schema') {
      schemaName = argv[i + 1];
      i++;
      continue;
    }
    if (arg === '--function') {
      appendFunctionName = argv[i + 1];
      i++;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsageAndExit();
    }

    printUsageAndExit(`Unknown argument: ${arg}`);
  }

  if (!tableName) {
    printUsageAndExit('Missing required argument: --table');
  }

  return {
    tableName,
    ...(schemaName ? { schemaName } : {}),
    ...(appendFunctionName ? { appendFunctionName } : {}),
  };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const sql = createSupabaseSetupSql(options);
  process.stdout.write(sql + '\n');
}

main();

