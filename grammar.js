/**
 * @file A tree-sitter parser for hledger plaintext accounting journal files
 * @author Ramil Muratov <ramil@muratov.space>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const DATE = /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}/;

// Tag name: hledger accepts any run of characters except whitespace, colon,
// and comma, immediately followed by `:` \u2014 e.g. `2026-05-london:`, `100%:`,
// `\u0442\u0435\u0433:`. The same regex doubles as the plain-word token in comment bodies.
const TAG_NAME = /[^ \t\n:,]+/;

export default grammar({
  name: "hledger",

  // No automatic whitespace skipping — hledger is whitespace-sensitive
  extras: ($) => [],

  // Expanded in place at generate time. This dissolves the rule boundary, so
  // the whitespace before an inline comment never competes with an optional
  // whitespace token preceding it in the host rule (e.g. after `status`).
  inline: ($) => [$._inline_comment],

  conflicts: ($) => [
    // after amount, whitespace could be cost/assertion prefix OR comment/newline
    [$._posting_amounts],
    // within amount: left-commodity form vs right-commodity form ambiguity
    [$.amount, $.amount],
    // within assertion: whitespace after amount could be cost prefix or end of assertion
    [$.assertion],
    // after header, a bare ';' could be a non-indented body comment OR a top-level comment
    [$.transaction],
  ],

  rules: {
    // =========================================================
    // TOP LEVEL
    // =========================================================

    source_file: ($) =>
      repeat(
        choice(
          $.transaction,
          $._comment_line,
          alias($.block_comment, $.comment),
          $.directive_account,
          $.directive_alias,
          $.directive_end_aliases,
          $.directive_auto_posting,
          $.directive_commodity,
          $.directive_decimal_mark,
          $.directive_include,
          $.directive_payee,
          $.directive_periodic_transaction,
          $.directive_price,
          $.directive_tag,
          $._eol // blank line (may contain only whitespace)
        )
      ),

    // =========================================================
    // COMMENTS
    // =========================================================

    // Single-line comment. Tags are named children; everything else is anonymous.
    comment: ($) =>
      seq(
        /[;#]/,
        repeat(
          choice(
            $.tag,
            TAG_NAME, // word that is NOT followed by ':' \u2014 plain text (anonymous)
            /[ \t]+/, // whitespace between words
            ":",      // standalone colon (not part of a tag)
            ","
          )
        )
      ),

    // Block comment: "comment\n ... end comment\n".
    // Works without an external scanner: inside the body repeat, both the /.*/
    // line regex and token('end comment') are valid; the specific token wins
    // over a regex of equal length, so the terminator stops the repeat.
    block_comment: ($) =>
      seq(
        token("comment"),
        optional(seq($._ws, /.*/)),
        "\n",
        repeat(seq(optional(seq(optional($._ws), /.*/)), "\n")),
        token("end comment"),
        /[^\n]*\n/
      ),

    // A whole `name:value` tag as one opaque token: the name (no whitespace,
    // `:`, or `,`), the colon, and the value running to the next `,` or end of
    // line, ending on a non-space character. The name/value split is left to
    // consumers: split on the first `:`, then trim. Being longer than the
    // plain-word TAG_NAME match, this token wins by maximal munch — no lexer
    // precedence needed; a space before the colon means the tag can't match
    // and the text lexes as plain words.
    tag: ($) => token(/[^ \t\n:,]+:([^,\n]*[^ ,\t\n])?/),

    // Tag name as declared by the `tag` directive (no colon or value there).
    tag_name: ($) => TAG_NAME,

    // Opaque comment line — no tag parsing. Used for top-level lines and
    // non-indented lines inside a transaction body. The newline is part of the
    // token and optional, so a comment on the last line of a file (with no
    // trailing newline) still parses.
    _comment_line: ($) => alias(token(/[;#][^\n]*\n?/), $.comment),

    // Indented comment line (tags parsed) — used in transaction bodies and
    // after account directives.
    _body_comment: ($) => seq($._ws, $.comment, $._eol),

    // Same-line comment at the end of a line, optionally preceded by whitespace.
    _inline_comment: ($) => seq(optional($._ws), $.comment),

    // =========================================================
    // DATES
    // =========================================================

    date: ($) => DATE,

    // secondary_date must immediately follow the primary date (no space before =)
    secondary_date: ($) => seq("=", DATE),

    // =========================================================
    // TRANSACTIONS
    // =========================================================

    transaction: ($) =>
      seq(
        $._header,
        repeat(choice($._posting, $._body_comment, $._comment_line))
      ),

    // Hidden: the first line of a transaction. Its children (date, status,
    // code, description, comment) appear as direct children of `transaction`.
    _header: ($) =>
      seq(
        $.date,
        optional($.secondary_date),
        optional(
          seq(
            $._ws,
            optional(seq($.status, optional($._ws))),
            optional(seq($.code, optional($._ws))),
            optional($.description),
            optional($._inline_comment)
          )
        ),
        $._eol
      ),

    status: ($) => choice("*", "!"),

    code: ($) => seq("(", /[^)\n]*/, ")"),

    // The full description text, up to `;` (comment) or end of line, with no
    // trailing whitespace (the final character class forbids it — anything the
    // token does not take is then consumed by _ws/_eol). hledger's payee|note
    // split is left to consumers: split on the first `|`, then trim. Must not
    // start with space/tab or a status/code marker (`*`, `!`, `(`) so those
    // tokens are never in competition with this regex in the lexer.
    description: ($) => token(/[^ \t*!(\n;]([^\n;]*[^ \t\n;])?/),

    // Payee name as declared by the payee directive. Same shape as description
    // but additionally stops at `|`.
    payee: ($) => token(/[^ \t*!(|\n;]([^|\n;]*[^ \t|\n;])?/),

    // =========================================================
    // POSTINGS
    // =========================================================

    _posting: ($) =>
      choice($.posting, $.posting_virtual, $.posting_virtual_balanced),

    posting: ($) => postingRule($, $.account),

    posting_virtual: ($) => postingRule($, seq("(", $.account, ")")),

    posting_virtual_balanced: ($) => postingRule($, seq("[", $.account, "]")),

    // Hidden: lifts amount/cost/assertion as direct children of the posting node
    _posting_amounts: ($) =>
      choice(
        seq(
          $.amount,
          optional(seq($._ws, $.cost)),
          optional(seq($._ws, $.assertion))
        ),
        seq($.cost, optional(seq($._ws, $.assertion))),
        $.assertion // standalone assertion (cost may be inside assertion)
      ),

    // Account name: stops at double-space (single spaces allowed within the name).
    // Must not start with * or ! (those are posting status markers).
    account: ($) =>
      /[^ \t\n;#@=()\[\]*!][^ \t\n;#@=()\[\]]*( [^ \t\n;#@=()\[\]]+)*/,

    // =========================================================
    // AMOUNTS
    // =========================================================

    amount: ($) =>
      seq(
        optional($.multiplier),
        optional(seq($.sign, optional($._ws))), // leading sign: -$1, + 100
        choice(
          // Left commodity, sign may also appear before the quantity:
          // $1, EUR 100, $-1, $ - 1
          seq(
            $.commodity,
            optional($._ws),
            optional(seq($.sign, optional($._ws))),
            $.quantity
          ),
          // Bare quantity with optional right commodity: 1, 1 USD, 1 000 000.00
          seq($.quantity, optional(seq($._ws, $.commodity)))
        )
      ),

    multiplier: ($) => "*",
    sign: ($) => choice("+", "-"),

    quantity: ($) =>
      token(
        choice(
          // Space-grouped: 1 000 000.00, 1 000
          /\d{1,3}( \d{3})+([.,]\d+)?([Ee][+-]?\d+)?/,
          // Regular: 1, 1.23, 1,23, 10., 1E-6, 2.000.000,00
          /\d[\d,.]*([Ee][+-]?\d+)?/
        )
      ),

    commodity: ($) =>
      token(
        choice(
          /"[^"\n]*"/, // quoted: "green apples", "AAAA 2023"
          /[^\d\s"@;#=()\[\]\n,.+\-*~|]+/ // symbol or word: $, €, USD, EUR
        )
      ),

    cost: ($) => seq($.cost_operator, optional($._ws), $.amount),
    cost_operator: ($) => token(choice("@@", "@")),

    assertion: ($) =>
      seq(
        $.assertion_operator,
        optional($._ws),
        $.amount,
        optional(seq($._ws, $.cost))
      ),
    assertion_operator: ($) => token(choice("==*", "=*", "==", "=")),

    // =========================================================
    // DIRECTIVES
    // =========================================================

    directive_account: ($) =>
      seq(
        directiveLine($, "account", $._ws, $.account),
        repeat($._body_comment) // indented next-line comments
      ),

    directive_alias: ($) =>
      seq(
        "alias",
        $._ws,
        $.alias_base,
        /[ \t]*=[ \t]*/,
        optional($.alias_substitute),
        $._eol
      ),

    alias_base: ($) => /[^ \t\n=]([^\n=]*[^ \t\n=])?/,
    alias_substitute: ($) => /[^ \t\n]([^\n]*[^ \t\n])?/,

    directive_end_aliases: ($) => seq("end aliases", $._eol),

    directive_auto_posting: ($) =>
      seq("=", $._ws, $.query, $._eol, repeat($._posting)),

    query: ($) =>
      token(
        choice(
          /'[^'\n]*'/, // single-quoted: 'expenses:food drinks'
          /[^' \t\n]([^\n]*[^ \t\n])?/ // unquoted (doesn't start with ')
        )
      ),

    directive_commodity: ($) =>
      seq(
        directiveLine($, "commodity", $._ws, choice($.amount, $.commodity)),
        repeat($.commodity_format)
      ),

    commodity_format: ($) =>
      directiveLine($, $._ws, "format", $._ws, choice($.amount, $.commodity)),

    directive_decimal_mark: ($) =>
      directiveLine($, "decimal-mark", $._ws, /[.,]/),

    directive_include: ($) => seq("include", $._ws, $.path, $._eol),

    // The rest of the line, including any `;` — hledger treats it all as the
    // file glob pattern, so inline comments are not possible here.
    path: ($) => /[^ \t\n]([^\n]*[^ \t\n])?/,

    directive_payee: ($) =>
      directiveLine($, "payee", $._ws, $.payee),

    directive_periodic_transaction: ($) =>
      seq(
        "~",
        $._ws,
        $.period_expression,
        optional(seq($._ws, $.description)),
        optional($._inline_comment),
        $._eol,
        repeat($._posting)
      ),

    // Opaque period expression: stops at double-space
    period_expression: ($) => /([^ \t\n]| [^ \t\n])+/,

    directive_price: ($) =>
      directiveLine($, "P", $._ws, $.date, $._ws, $.commodity, $._ws, $.amount),

    directive_tag: ($) =>
      directiveLine($, "tag", $._ws, $.tag_name),

    // =========================================================
    // WHITESPACE (hidden — vanishes from the tree)
    // =========================================================

    _ws: ($) => /[ \t]+/,

    // End of line, absorbing trailing whitespace. Because the lexer prefers the
    // longest match, _eol beats _ws whenever only whitespace remains before the
    // newline — so trailing whitespace and whitespace-only "blank" lines parse
    // cleanly everywhere a line can end.
    _eol: ($) => /[ \t]*\n/,
  },
});

// =========================================================
// HELPERS
// =========================================================

/**
 * Shared structure for posting, posting_virtual, and posting_virtual_balanced.
 * `accountExpr` is the account node or virtual-account sequence.
 */
function postingRule($, accountExpr) {
  return seq(
    $._ws,
    optional(seq($.status, $._ws)),
    accountExpr,
    optional(seq($._ws, $._posting_amounts)),
    optional($._inline_comment),
    $._eol
  );
}

/** Wraps a directive's line content, appending the standard line tail: an optional inline comment and the newline. */
function directiveLine($, ...content) {
  return seq(...content, optional($._inline_comment), $._eol);
}
