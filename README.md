# tree-sitter-phpdoc

PHPDoc grammar for [tree-sitter][].

[tree-sitter]: https://github.com/tree-sitter/tree-sitter

## Install

`npm install tree-sitter-phpdoc`

## Test

`npm test`

If this test script doesn't work for you, run the generator through npm and
then run the tests manually:

```sh
npm run generate
./node_modules/.bin/tree-sitter test
```

`npm run generate` also runs `scripts/strip-o0-pragma.js`, which removes
tree-sitter's optimization-disabling `#pragma GCC optimize ("O0")` block from
`src/parser.c`. Running `tree-sitter generate` directly reintroduces that block.

#### Thanks

Originally forked from https://github.com/john-nguyen09/tree-sitter-phpdoc
