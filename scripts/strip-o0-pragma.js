#!/usr/bin/env node
'use strict';

/**
 * Removes the optimization-disabling pragma block that tree-sitter's
 * generator adds to src/parser.c for large lexers.
 *
 * Usage:
 *   node scripts/strip-o0-pragma.js [--check] [path]
 *
 * Options:
 *   --check   Do not modify the file. Exit 1 if the block (or any optimize
 *             pragma) is present, 0 if the file is already clean.
 *   -h, --help
 *
 * Idempotent: running it on an already-processed file is a no-op.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PARSER = path.resolve(__dirname, '..', 'src', 'parser.c');

// Exact block emitted by tree-sitter for lexers with more than 300 states.
const O0_PRAGMA_BLOCK =
  /^#ifdef _MSC_VER\r?\n#pragma optimize\("", off\)\r?\n#elif defined\(__clang__\)\r?\n#pragma clang optimize off\r?\n#elif defined\(__GNUC__\)\r?\n#pragma GCC optimize \("O0"\)\r?\n#endif\r?\n(?:\r?\n)?/m;

// Used to detect a partial/unknown layout instead of silently leaving -O0.
const ANY_OPTIMIZE_PRAGMA =
  /#pragma (?:GCC optimize \("O0"\)|clang optimize off|optimize\("", off\))/;

function usage() {
  console.log(
    'Usage: node scripts/strip-o0-pragma.js [--check] [path]\n' +
      '\n' +
      '  path      Parser source to process (default: src/parser.c)\n' +
      '  --check   Do not write; exit 1 if the O0 pragma block is present\n' +
      '  -h, --help\n',
  );
}

function fail(message) {
  console.error(`strip-o0-pragma: ${message}`);
  process.exitCode = 1;
}

function main(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    usage();
    return;
  }

  const unknownFlags = argv.filter(
    (arg) => arg.startsWith('-') && arg !== '--check',
  );
  if (unknownFlags.length > 0) {
    console.error(`Unknown option: ${unknownFlags[0]}`);
    usage();
    process.exitCode = 2;
    return;
  }

  const positional = argv.filter((arg) => !arg.startsWith('-'));
  if (positional.length > 1) {
    console.error('Expected at most one path.');
    usage();
    process.exitCode = 2;
    return;
  }

  const check = argv.includes('--check');
  const target = positional.length
    ? path.resolve(process.cwd(), positional[0])
    : DEFAULT_PARSER;

  let source;
  try {
    source = fs.readFileSync(target, 'utf8');
  } catch (error) {
    fail(`cannot read ${target}: ${error.message}`);
    return;
  }

  if (!O0_PRAGMA_BLOCK.test(source)) {
    if (ANY_OPTIMIZE_PRAGMA.test(source)) {
      fail(
        `${target}: found an optimization pragma but not the expected generated block; review it manually.`,
      );
      return;
    }

    console.log(`${target}: already clean`);
    return;
  }

  const cleaned = source.replace(O0_PRAGMA_BLOCK, '');

  if (ANY_OPTIMIZE_PRAGMA.test(cleaned)) {
    fail(
      `${target}: unexpected optimization pragma remains after removing the block; review it manually.`,
    );
    return;
  }

  if (check) {
    fail(`${target}: O0 pragma block is present`);
    return;
  }

  try {
    fs.writeFileSync(target, cleaned);
  } catch (error) {
    fail(`cannot write ${target}: ${error.message}`);
    return;
  }

  console.log(`${target}: removed O0 pragma block`);
}

main(process.argv.slice(2));
