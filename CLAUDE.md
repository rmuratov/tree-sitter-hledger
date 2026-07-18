# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies. If the native addon build fails (e.g. on newer Node
# versions node-gyp errors out), skip build scripts and fetch just the CLI:
#   npm install --ignore-scripts && npm rebuild tree-sitter-cli
npm install

# Generate the parser from grammar.js (required after any grammar change)
npx tree-sitter generate

# Run corpus tests
npx tree-sitter test

# Run a single corpus test file by name pattern
npx tree-sitter test --filter "Account name"

# Parse a file to inspect the CST output
npx tree-sitter parse playground.hledger

# Test syntax highlighting
tree-sitter highlight playground.hledger

# Validate playground.hledger with hledger itself
hledger print --file=playground.hledger

# Launch interactive playground (WASM build)
npm start
```

## Architecture

This is a [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) grammar for [hledger](https://hledger.org/) journal files. It targets **hledger's native journal syntax only** — ledger-compatible syntax is out of scope. The core of the project is a single file:

- **`grammar.js`** — the grammar definition. All parser logic lives here. After editing it, run `npx tree-sitter generate` to regenerate `src/` (the C parser sources). Never edit `src/` directly.

### Test corpus

Tests live in `test/corpus/*.txt`. Each file uses the Tree-sitter corpus format:

```
================================================================================
Test name
================================================================================
input hledger journal snippet

--------------------------------------------------------------------------------

(expected_sst_output)
```

Each `.txt` file covers one grammar concept (dates, postings, account names, etc.). Add new test cases by appending to an existing file or creating a new one.

### `playground.hledger`

Used during development to test real-world hledger input. It's a valid hledger journal that can be verified with `hledger print --file=playground.hledger`. Keep it up-to-date as the grammar evolves to cover new syntax.

**Balance assertion isolation:** hledger checks balance assertions against the cumulative running balance across the entire file. Each balance assertion test entry in `playground.hledger` must use a unique account prefix (e.g. `ba1:`, `ba2:`, `inv:`) so assertions don't fail due to amounts accumulated by other test transactions.

### AST node naming conventions

These conventions are established across all corpus files:

- **Signs:** `(sign)` is an explicit separate node (for both `+` and `-`), never absorbed into `quantity` or `commodity`. Position mirrors the source: before `commodity` if the sign precedes it, between `commodity` and `quantity` if it appears there.
  - `-$1` → `(amount (sign) (commodity) (quantity))`
  - `$-1` → `(amount (commodity) (sign) (quantity))`
  - `+$1` → `(amount (sign) (commodity) (quantity))`
- **Status:** a single `(status)` node for both `*` (cleared) and `!` (pending).
- **Transactions are flat:** there is no `header` node. `date`, `secondary_date`, `status`, `code`, `description`, and the first-line `comment` are direct children of `transaction`, followed by postings and body comments. (The grammar still groups the first line in a hidden `_header` rule for readability.) Note: a same-line header comment and an indented body comment are not structurally distinguishable — hledger treats both as transaction comments, so the distinction carries no semantic weight; consumers that care about layout can compare row positions.
- **Multiply amounts** (auto postings only): `(multiplier)` node, same positional rule.
  - `*-1` → `(amount (multiplier) (sign) (quantity))`
  - `*$2` → `(amount (multiplier) (commodity) (quantity))`
- **Commodity placement:** left-side symbol → `(commodity)(quantity)`; right-side word → `(quantity)(commodity)`.
- **Comments:** single `(comment)` node for all comment forms (block, top-level line, inline). Tags are children of `comment`: `(comment (tag (tag_name) (tag_value)))`.
- **Tag names:** match hledger's actual rule — any run of characters except whitespace, `:`, and `,`, immediately followed by `:`. Names like `2026-05-london`, `100%`, `_under`, and `тег` are valid; a space before the colon means no tag.
- **Tag values:** start immediately after `:` or after `:` and optional whitespace; end at the next `,` or end of line. Values can contain spaces.
- **Directives:** corpus files are named `directive_<name>.txt`. Directive nodes are named `directive_<name>` (e.g. `directive_account`, `directive_alias`).
- **Virtual postings:** `posting_virtual` for `(account)` (unbalanced), `posting_virtual_balanced` for `[account]` (balanced).
- **Opaque expression nodes:** `description` (the `payee | note` split is left to consumers), `period_expression` (periodic transaction rules), and `query` (auto posting rules) are single unparsed nodes — no children. The `payee` node exists only inside `directive_payee`.
- **No trailing whitespace in leaf nodes:** free-text tokens (`description`, `payee`, `alias_base`, `alias_substitute`, `path`, `query`) end on a non-space character; trailing whitespace belongs to `_ws`/`_eol`. An empty `alias_substitute` (`alias foo =`) produces no node at all, never a zero-width one.

### Bindings

`bindings/` contains auto-generated language bindings for Node, Python, Rust, Go, Swift, and C. These are generated by Tree-sitter tooling and generally should not be edited by hand.

## Development workflow

1. Edit `grammar.js`
2. Run `npx tree-sitter generate`
3. Add/update corpus tests in `test/corpus/`
4. Run `npx tree-sitter test`
5. Update `playground.hledger` if needed and verify with `hledger print`

---

## Implementation notes: quirks and tricky parts

This section documents hard-won lessons from the initial grammar implementation. Read before making any significant changes.

### `extras: $ => []` — whitespace is fully explicit

Tree-sitter normally skips whitespace automatically. This grammar disables that entirely. Every space and tab must be matched explicitly in rules. This is required because:
- Indentation distinguishes transaction postings (indented) from top-level items (not indented)
- `secondary_date` attaches directly to `date` with no space (`2026-01-24=01-25`)
- Double-space separates account name from amount (a single space is part of the account name)

**Consequence:** every rule that spans a line must include `$._ws` separators and a trailing `$._eol` explicitly. Both are private named rules hidden from the parse tree:

- `_ws: $ => /[ \t]+/` — inline whitespace separator
- `_eol: $ => /[ \t]*\n/` — end of line, absorbing trailing whitespace

### `_eol` absorbs trailing whitespace and whitespace-only lines

Line endings use `_eol` (`/[ \t]*\n/`), not a bare `/\n/`. Because the lexer prefers the longest match, `_eol` beats `_ws` whenever only whitespace remains before the newline. This makes two real-world cases parse cleanly that a bare `/\n/` rejects with ERROR nodes:

- trailing whitespace at the end of any line (`    Expenses\t\n`)
- "blank" separator lines that contain only spaces/tabs (`   \n`) — `_eol` is also the blank-line alternative in `source_file`

A useful side effect: trailing spaces are excluded from `comment` and similar nodes, since `_eol`'s longer match wins them away from the content regexes.

The raw comment token in `_comment_line` includes its own optional newline (`/[;#][^\n]*\n?/`) so a comment on the last line of a file with no trailing newline still parses. Other missing-final-newline cases (transactions, directives) are handled acceptably by tree-sitter's missing-token recovery. Known limitation: a file ending in bare whitespace with no final newline produces a small ERROR node at EOF — supporting it would require GLR conflicts on every posting line, which is not worth the parse-speed cost.

### Nullable tokens cause infinite parse loops

**This is the most dangerous pitfall.** Any named rule that can match an empty string (using `*` quantifier on a regex, or `optional(...)` around a regex) will cause tree-sitter's error-recovery to loop infinitely, reissuing the same zero-length token at the same position forever.

Rules that triggered this during development:
- `payee: $ => /[^|\n;]*/` — zero chars allowed → loop. Fixed: `/[^*!(|\n;][^|\n;]*/` (requires 1+ chars)
- `note: $ => /[^\n;]*/` — zero chars allowed → loop. Fixed: `/[^\n;]+/`
- `optional(/[ \t]*/)` inside `_header` and `directive_payee` — `/[ \t]*/` produces a zero-length token → loop. Fixed: replaced with `optional(/[ \t]+/)` or removed entirely.

**Rule:** every named rule and every regex inside `optional(...)` must be non-nullable (must match at least one character).

### Lexer disambiguation: longest match wins, priority only breaks ties

Tree-sitter's lexer picks the token with the **longest match**. `token(prec(N, ...))` only breaks ties among tokens of equal length — it does NOT override a longer match.

This caused status markers (`*`, `!`) to be swallowed by description/account regexes (a 1-char `*` lost to an N-char description match). The fix was **not** to give `*` higher priority, but to exclude `*`, `!`, and `(` from the first character of `description`, `payee`, and `account` regexes. That way those chars are never in competition.

### Tag value lexer priority

`tag_value: $ => token(prec(1, /[^,\n]+/))` must use `token(prec(1, ...))` — not a bare regex. Without it, `tag_value` ties with the anonymous comment-body tokens (the plain-word `TAG_NAME` regex and the whitespace filler) when the value is the same length as what those would match. Equal-length ties are resolved by priority; without the `prec(1, ...)`, the wrong token wins and `(tag_value)` nodes are missing from the AST. `tag_name` carries `prec(1, ...)` for the same reason — it ties with the identical plain-word regex in the comment body, and the parser then decides tag-vs-plain by whether `:` follows.

### `prec.right` on `tag` rule

```javascript
tag: $ => prec.right(seq($.tag_name, ':', optional($.tag_value))),
```

Without `prec.right`, after `tag_name ':'` the parser may reduce the tag immediately (leaving `tag_value` absent) instead of shifting to consume the value. `prec.right` says "prefer shift over reduce" in shift-reduce conflicts, ensuring the value is consumed when present.

### GLR conflicts: `[$._posting_amounts]` singleton

The singleton `[$._posting_amounts]` enables GLR for that rule, letting the parser explore multiple parse paths simultaneously when it's ambiguous whether whitespace after an amount precedes a `cost`/`assertion` or a `comment`/newline. Without this declaration, the parser picks one path statically and gets it wrong in some inputs.

Combined with `[$.amount, $.amount]` for the left-commodity vs right-commodity ambiguity inside amounts.

**Important:** do NOT add `prec.right` to `_posting_amounts` or to the bare-quantity alternatives inside `amount`. When combined with the GLR singleton, `prec.right` creates a state cycle and causes an infinite loop during parsing. The GLR conflict alone is sufficient.

### Status markers and trailing space

In the `_header` rule, the space after a status marker is `optional($._ws)` — it is consumed when present but can be absent when status is the last token before `\n` (e.g., `2026-01-24 *`):

```javascript
optional(seq($.status, optional($._ws)))
```

This is safe because `description` and `payee` exclude space/tab from their first character. That exclusion forces the LR parser to always shift the space into the separator — there is no path where description accidentally absorbs a leading space — so the shift-reduce conflict resolves correctly.

In the `posting` rule the space after status is still required (`$._ws`) because a posting status is always followed by an account name (postings without an account are invalid), so the end-of-line case does not arise there.

### Description is a single token — no payee/note split

`description` is one opaque token; hledger's `payee | note` split is left to consumers (split on the first `|`, then trim). The grammar previously had `(payee)`/`(note)` children, but that structure was buggy and got removed:

- `payee` always captured the whitespace before `|` (the lexer's longest match gave it to the greedy payee regex, not the separator), while `note` had its leading whitespace stripped — asymmetric extents.
- with an empty payee (`2026-01-24 | note`), the note text got **no** `(note)` node at all, so consumers couldn't rely on the children existing.

The `payee` node still exists, but only as the child of `directive_payee`.

### Leaf tokens never end in whitespace

Free-text tokens (`description`, `payee`, `alias_base`, `alias_substitute`, `path`, the unquoted `query`) use the pattern `/<first-char>(<body>*<non-space-char>)?/` — the token must end on a non-space character. Whatever whitespace the token refuses is then consumed by `_ws` (before an inline comment) or `_eol` (at end of line). The `_inline_comment` hidden rule (`seq(optional($._ws), $.comment)`) is the standard line tail; it is listed in `inline: $ => [...]` because inlining dissolves the rule boundary — otherwise the optional whitespace after `status` and the optional whitespace before the comment create an unresolvable ambiguity.

### `tag_value` ends at comma, not just newline

`tag_value: $ => token(prec(1, /[^,\n]+/))` — stops at `,` so that multiple comma-separated tags on one line work correctly:

```
; tag1:value 1, tag2:value 2
```

The tag_value `value 1` stops at `,`, leaving `, tag2:value 2` for the next comment repeat iteration.

### Unnecessary conflict declarations cause warnings

Tree-sitter warns about conflicts listed in `conflicts: $ => [...]` that it can resolve statically without GLR. Keep only the conflicts that are genuinely needed:

```javascript
conflicts: $ => [
  [$._posting_amounts],   // whitespace after amount: cost/assertion vs comment/newline
  [$.amount, $.amount],   // left-commodity vs right-commodity form
  [$.assertion],          // whitespace after assertion amount: cost prefix vs end
  [$.transaction],        // bare ';' after the first line: body comment vs top-level comment
],
```

All four were re-verified as genuinely needed (removing any of them makes `tree-sitter generate` fail with an unresolved conflict). The conflicts `[$.tag, $.comment]`, `[$.comment, $.tag_name]`, and `[$.description, $.payee]` were found to be unnecessary and were removed.

### Block comments use a pure grammar rule

Block comments (`comment ... end comment`) are handled entirely in `grammar.js` by the `block_comment` rule — no external scanner. The pattern is:

```javascript
block_comment: $ => seq(
  token('comment'),                                           // opening keyword
  optional(seq($._ws, /.*/)),                                 // optional text on opening line
  '\n',
  repeat(seq(optional(seq(optional($._ws), /.*/)), '\n')),    // body lines
  token('end comment'),                                       // terminator
  /[^\n]*\n/,                                                 // trailing text + newline
),
```

**Why this works without a scanner:** tree-sitter's lexer considers which tokens are valid in the current parser state. Inside the body `repeat`, both `/.*/` (the body line match) and `token('end comment')` are potentially valid when the parser sees `end comment` at the start of a line. The specific `token()` string is preferred over the general regex, so the terminator wins and the repeat stops.

**The nullable-token rule does not apply here** because `/.*/` is an anonymous inline regex (not a named rule), and each iteration of the repeat always advances by at least one `'\n'` — so the parser can never get stuck in a zero-length loop.

### Amounts accept double signs (intentional)

The optional `sign` before the commodity and the optional `sign` between commodity and quantity are independent, so `-$-1` parses with two `(sign)` nodes even though hledger rejects it. This permissiveness is deliberate — an editor grammar should produce a usable tree for in-progress input, and validating sign count is a linter's job, not the parser's.

### Account name regex

```javascript
account: $ => /[^ \t\n;#@=()\[\]*!][^ \t\n;#@=()\[\]]*( [^ \t\n;#@=()\[\]]+)*/,
```

The trailing `( [^...]+)*` group is what allows internal single spaces while stopping at double-space. The first character class also excludes `*` and `!` (to prevent consuming status markers).
