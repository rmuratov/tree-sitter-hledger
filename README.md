# tree-sitter-hledger

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for [hledger](https://hledger.org/) journal files. It covers hledger's native journal syntax and is ready for syntax highlighting, structural editing, and tooling in Tree-sitter-based editors and applications. The grammar is exercised by a corpus test suite, and its development playground journal is kept valid against hledger itself (`hledger print`).

It targets **hledger's native journal syntax only** — syntax that exists for [Ledger](https://ledger-cli.org/) compatibility is deliberately out of scope; see [Unsupported features](#unsupported-features).

> This grammar was heavily vibe coded. The initial test suite, however, was prepared manually, and the constructs it covers are validated against hledger itself.

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
npx tree-sitter parse playground.hledger
```

playground.hledger file is used during the development to check that test cases are actually valid and parsable by hledger itself:

```bash
hledger print --file=playground.hledger
```

## Supported syntax

- **Transactions** — dates (including secondary dates `DATE=DATE2`), status marks (`*`, `!`), codes `(...)`, descriptions, same-line and body comments
- **Postings** — real, virtual `(account)`, and balanced virtual `[account]` postings; posting status; account names with internal single spaces
- **Amounts** — left/right commodity placement, quoted commodities, signs in all positions, digit grouping (comma, period, or space), scientific notation
- **Costs and assertions** — `@` / `@@` costs; balance assertions `=`, `==`, `=*`, `==*` (with optional cost); balance assignments (assertion with no posting amount)
- **Comments and tags** — `;` and `#` line comments, inline comments, `comment ... end comment` blocks, and `name:value` tags inside comments
- **Directives** — `account`, `alias` / `end aliases`, `commodity` (with `format` subdirective), `decimal-mark`, `include`, `payee`, `tag`, `P` (market price), `~` (periodic transaction rules), `=` (auto posting rules)

A few of these (secondary dates, virtual postings, balance assignments) technically appear in hledger's "Other syntax" section, but they are widely used by hledger users, so the grammar supports them.

## Unsupported features

hledger accepts a number of constructs "mainly to make interoperating with or converting from Ledger easier" ([Other syntax](https://hledger.org/1.52/hledger.html#other-syntax)). These are intentionally not supported and will produce parse errors (or, inside comments, plain unstructured text):

- **`D`** (default commodity) directive
- **`Y`** / `year` / `apply year` (default year) directives
- **`apply account`** / `end apply account` (default parent account)
- **Star comments** — comment lines beginning with `*` (Emacs org headings)
- **Bracketed posting dates** — `[DATE]` / `[DATE=DATE2]` in posting comments; these parse as plain comment text (use hledger's native `date:` / `date2:` tags instead, which parse as regular tags)
- **Valuation expressions** — `((...))` after amounts
- **Ledger virtual costs** — `(@)` / `(@@)`
- **Ledger lot syntax** — lot prices `{COST}`, fixed lot costs `{=COST}`, lot dates, and lot notes
- **Other ignored Ledger directives** — `apply fixed`, `apply tag`, `assert`, `bucket`, `capture`, `check`, `define`, `eval`, `expr`, `python`, `value`, `tag` blocks with `end tag`, `end apply fixed`, `end apply tag`, `--command-line-flags`

If hledger ever promotes one of these to native syntax, it becomes fair game — file an issue.

## Project structure

```text
grammar.js          Tree-sitter grammar definition
src/                Generated parser sources (do not edit)
test/corpus/        Grammar test cases
queries/            Editor queries (syntax highlighting)
bindings/           Generated language bindings
playground.hledger  Development journal, kept valid per hledger itself
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
