# AGENTS.md

## What this repo is

A tree-sitter grammar for **PHPDoc docblocks** (`/** ... */`), not for PHP source files. `grammar.js` is the only hand-written grammar source. These are generated and committed:

- `src/grammar.json`, `src/node-types.json`, `src/parser.c`
- `src/tree_sitter/*.h`
- `bindings/**`, `binding.gyp`, `setup.py`, `Makefile`, `Package.swift`

Never hand-edit generated files. A multi-thousand-line `src/parser.c` diff after regeneration is normal. The only automated exception is `scripts/strip-o0-pragma.js`, which post-processes `src/parser.c` as part of `npm run generate`.

## Setup and commands

```sh
npm install                                                   # grammar.js imports tree-sitter-php at generate time
npm run generate                                               # generate + strip O0 pragma; after editing grammar.js or src/scanner.c
./node_modules/.bin/tree-sitter test                          # full corpus (164 cases)
./node_modules/.bin/tree-sitter test --file-name types.txt    # one corpus file
./node_modules/.bin/tree-sitter test -i "Array types"         # cases matching a regex
./node_modules/.bin/tree-sitter test -u                       # rewrite expected trees; review the diff
npm run format                                                # prettier: grammar.js + .github/workflows/ci.yml
npm run format-check
```

- Always generate through `npm run generate`, not the raw CLI: it runs `tree-sitter generate` and then `scripts/strip-o0-pragma.js`, which removes tree-sitter's optimization-disabling `#pragma GCC optimize ("O0")` block from `src/parser.c`. The raw CLI reintroduces it. CI verifies the result with `node scripts/strip-o0-pragma.js --check`.
- `npm test` regenerates when `grammar.js` is newer than `src/grammar.json` or `src/scanner.c` is newer than `src/parser.c` (portable `-nt` test), and the regeneration path also strips the O0 pragma.
- Use the locked local CLI (`tree-sitter-cli` 0.22.6). A newer global CLI (e.g. 0.26) rewrites `src/tree_sitter/*.h`, adds schema/root metadata to `grammar.json` / `node-types.json`, and reformats `parser.c`. Don't commit that churn.
- On npm 11+, install scripts are blocked by default, so `node_modules/.bin/tree-sitter` may be missing its binary; approve scripts or use a global `tree-sitter` for testing only.

## Grammar architecture

- PHP rules are imported from `tree-sitter-php/php/grammar` and reused as `PHP.rules.*` (see the block near the bottom of `grammar.js`: `_type`, `_regular_types`, `name`, `named_type`, `variable_name`, etc.). Bumping the `tree-sitter-php` devDependency changes this grammar: regenerate and run the full corpus.
- `src/scanner.c` supplies four external tokens: `text`, `_text_after_type`, `_text_in_inline_tag`, `_text_not_version`. The scanner sees text **before `extras` are stripped** and is preferred over normal tokens even when those are optional. Read the comment above `externals` in `grammar.js` before touching description/text handling; the odd `_text_*` split exists to disambiguate optional rules and should not be "simplified".
- External text tokens are `alias`ed to `text` / `description` so corpus trees show `(text)`. Preserve aliases when adding rules.
- Tag parsing is dispatched from `tag` to private `_*_tag` rules, grouped by feature: standard phpdoc tags, inline tags, generics/templates, Psalm/PHPStan, PHPUnit. Add new tags in the matching group.

## Tests and CI

- Corpus tests live in `test/corpus/*.txt`, one file per feature area (`basic`, `types`, `typed_tags`, `references`, `generics`, `inline`, `psalm-phpstan`, `phpunit`, `versioning`, `special`, `incomplete`). Format is tree-sitter's: `====` delimiters, docblock input, then the expected S-expression using named nodes only.
- Add regression cases to the closest existing corpus file rather than creating a new suite.
- CI (`.github/workflows/ci.yml`) runs on Ubuntu and macOS with Node 18: `npm install` → `npm run generate` → `node scripts/strip-o0-pragma.js --check` → `tree-sitter test`, plus a separate prettier `format-check` job. Windows is intentionally disabled.

## Packaging gotchas

- The grammar requires the external scanner, but `binding.gyp`, `setup.py`, `Package.swift`, and `bindings/go/binding.go` are generated templates that do **not** compile `src/scanner.c`. Only the `Makefile` (wildcard) and `bindings/rust/build.rs` include it. Source builds of the Node/Python/Swift/Go bindings will miss `tree_sitter_phpdoc_external_scanner_*` unless `scanner.c` is added.
- `queries/` is referenced by `package.json`, `setup.py`, and `Package.swift` but does not exist; this repo ships no query files.
