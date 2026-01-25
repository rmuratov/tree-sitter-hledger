# tree-sitter-hledger

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for [hledger](https://hledger.org/) journal files.

## Features

- Parses `hledger` journal syntax
- Intended for syntax highlighting, structural editing, and tooling
- Works with Tree-sitter-based editors and applications

## Status

Early-stage grammar for `hledger` journals. Coverage and node names may change as the grammar evolves.

This grammar targets **hledger's native journal syntax only**. Ledger-compatible syntax is not supported.

## Usage

### JavaScript

```js
const Parser = require("tree-sitter");
const Hledger = require("tree-sitter-hledger");

const parser = new Parser();
parser.setLanguage(Hledger);

const source = `
2024-01-01 Opening Balances
    assets:bank:checking   $1000
    equity:opening-balances
`;

const tree = parser.parse(source);
console.log(tree.rootNode.toString());
```

### CLI development

Generate the parser:

```bash
npm install
npx tree-sitter generate
```

Run tests:

```bash
npx tree-sitter test
```

Parse a sample file:

```bash
npx tree-sitter parse playground.journal
```

playground.journal file is used during the development to check that test cases are actually valid and parsable by hledger itself:

```bash
hledger print --file=playground.journal
```

## Supported syntax

This grammar aims to support common `hledger` journal constructs, including:

- Dates and transaction headers
- Postings and account names
- Amounts and commodities
- Comments
- Directives and basic journal structure

## Project structure

```text
grammar.js          Tree-sitter grammar definition
src/                Generated parser sources
corpus/             Grammar test cases
bindings/           Language bindings (if present)
```

## Editor integration

This package can be used anywhere Tree-sitter grammars are supported, including custom tooling and editor plugins.

## Contributing

Contributions are welcome.

Typical workflow:

1. Update `grammar.js`
2. Regenerate the parser
3. Add or update corpus tests
4. Run the test suite

## License

MIT
