/**
 * @file A tree-sitter parser for hledger plaintext accounting journal files
 * @author Ramil Muratov <ramil@muratov.space>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "hledger",

  // No automatic whitespace skipping — hledger is whitespace-sensitive
  extras: ($) => [],

  conflicts: ($) => [
    // after amount, whitespace could be cost/assertion prefix OR comment/newline
    [$._posting_amounts],
    // within amount: left-commodity form vs right-commodity form ambiguity
    [$.amount, $.amount],
    // within assertion: whitespace after amount could be cost prefix or end of assertion
    [$.assertion],
  ],

  rules: {
    // =========================================================
    // TOP LEVEL
    // =========================================================

    source_file: ($) =>
      repeat(
        choice(
          $.transaction,
          seq($.comment, /\n/),
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
          /\n/ // blank line
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
            prec(1, $.tag),
            /[^a-zA-Z:,\n]+/, // non-alpha, non-comma, non-colon (so ':' can't steal tag's ':')
            /[a-zA-Z][a-zA-Z0-9_-]*/, // alpha word that is NOT a tag (anonymous)
            ":", // standalone colon (not part of a tag)
            ","
          )
        )
      ),

    // Block comment: "comment\n ... end comment\n"
    // Modelled after tree-sitter-ledger's block() helper — no external scanner needed.
    // Each body line is matched by optional(seq(optional(_ws), /.*/)) + '\n'.
    // The lexer prioritises the specific token('end comment') over the /.*/ body regex
    // when the parser is in a state where the end marker is valid.
    block_comment: ($) => blockRule($, "comment"),

    tag: ($) => prec.right(seq($.tag_name, ":", optional($.tag_value))),
    tag_name: ($) => prec(1, /[a-zA-Z][a-zA-Z0-9_-]*/),
    // tag_value: one or more chars (so empty value gives no tag_value node)
    tag_value: ($) => token(prec(1, /[^,\n]+/)),

    // =========================================================
    // DATES
    // =========================================================

    date: ($) => /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}/,

    // secondary_date must immediately follow the primary date (no space before =)
    secondary_date: ($) =>
      seq("=", /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}/),

    // =========================================================
    // TRANSACTIONS
    // =========================================================

    transaction: ($) =>
      seq(
        $.header,
        repeat(
          choice(
            $.posting,
            $.posting_virtual,
            $.posting_virtual_balanced,
            $._body_comment
          )
        )
      ),

    // Indented comment line inside a transaction body
    _body_comment: ($) => seq($._ws, $.comment, /\n/),

    header: ($) =>
      seq(
        $.date,
        optional($.secondary_date),
        optional(
          seq(
            $._ws,
            optional(
              seq(choice($.status_cleared, $.status_pending), optional($._ws))
            ),
            optional(seq($.code, $._ws)),
            optional($.description),
            optional($.comment)
          )
        ),
        /\n/
      ),

    status_cleared: ($) => "*",
    status_pending: ($) => "!",

    code: ($) => seq("(", /[^)\n]*/, ")"),

    description: ($) =>
      choice(
        seq($.payee, /[ \t]*\|[ \t]*/, $.note), // payee | note form
        seq($.payee, /[ \t]*\|[ \t]*/), // payee | (no note)
        /\|[^\n;]*/, // | or |note (empty payee)
        /[^ \t*!(|\n;][^|\n;]*/ // plain; must not start with space, * ! ( (status/code markers)
      ),

    payee: ($) => /[^ \t*!(|\n;][^|\n;]*/,
    note: ($) => /[^\n;]+/,

    // =========================================================
    // POSTINGS
    // =========================================================

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

    // Account name: chars except whitespace-like and special chars
    // Single spaces are allowed within the name (stops at double-space via regex)
    // Must not start with * or ! (those are posting status markers)
    account: ($) =>
      /[^ \t\n;#@=()\[\]*!]([^ \t\n;#@=()\[\]]| [^ \t\n;#@=()\[\]])*/,

    // =========================================================
    // AMOUNTS
    // =========================================================

    amount: ($) =>
      seq(
        optional($.multiplier),
        choice(
          // Sign before left-commodity: -$1, +EUR 100, + $1
          seq(
            choice($.negative, $.positive),
            optional($._ws),
            $.commodity,
            optional($._ws),
            optional(seq(choice($.negative, $.positive), optional($._ws))),
            $.quantity
          ),
          // Left-commodity with optional inner sign: $1, EUR 100, $-1, $ 1, $-      1
          seq(
            $.commodity,
            optional($._ws),
            optional(seq(choice($.negative, $.positive), optional($._ws))),
            $.quantity
          ),
          // Sign before bare quantity, optional right-commodity: -1, +1, -1 USD
          seq(
            choice($.negative, $.positive),
            optional($._ws),
            $.quantity,
            optional(seq($._ws, $.commodity))
          ),
          // Bare quantity, optional right-commodity: 1, 1 USD, 1 000 000.00
          seq($.quantity, optional(seq($._ws, $.commodity)))
        )
      ),

    multiplier: ($) => "*",
    negative: ($) => "-",
    positive: ($) => "+",

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
        "account",
        $._ws,
        $.account,
        optional(seq($._ws, $.comment)),
        /\n/,
        repeat(seq($._ws, $.comment, /\n/)) // indented next-line comments
      ),

    directive_alias: ($) =>
      seq(
        "alias",
        $._ws,
        $.alias_base,
        /[ \t]*=[ \t]*/,
        $.alias_substitute,
        /\n/
      ),

    alias_base: ($) => /[^\n=]+/,
    alias_substitute: ($) => /[^\n]*/,

    directive_end_aliases: ($) => seq("end aliases", /\n/),

    directive_auto_posting: ($) =>
      seq(
        "=",
        $._ws,
        $.query,
        /\n/,
        repeat(choice($.posting, $.posting_virtual, $.posting_virtual_balanced))
      ),

    query: ($) =>
      token(
        choice(
          /\'[^'\n]*\'/, // single-quoted: 'expenses:food drinks'
          /[^'\n][^\n]*/ // unquoted (doesn't start with ')
        )
      ),

    directive_commodity: ($) =>
      seq(
        "commodity",
        $._ws,
        choice($.amount, $.commodity),
        optional(seq($._ws, $.comment)),
        /\n/,
        repeat($.commodity_format)
      ),

    commodity_format: ($) =>
      seq(
        $._ws,
        "format",
        $._ws,
        choice($.amount, $.commodity),
        optional(seq($._ws, $.comment)),
        /\n/
      ),

    directive_decimal_mark: ($) =>
      seq("decimal-mark", $._ws, /[.,]/, optional(seq($._ws, $.comment)), /\n/),

    directive_include: ($) => seq("include", $._ws, $.path, /\n/),

    path: ($) => /[^\n]+/,

    directive_payee: ($) =>
      seq("payee", $._ws, $.payee, optional($.comment), /\n/),

    directive_periodic_transaction: ($) =>
      seq(
        "~",
        $._ws,
        $.period_expression,
        optional(seq($._ws, $.description)),
        optional($.comment),
        /\n/,
        repeat(choice($.posting, $.posting_virtual, $.posting_virtual_balanced))
      ),

    // Opaque period expression: stops at double-space (same regex as account names)
    period_expression: ($) => /([^ \t\n]| [^ \t\n])+/,

    directive_price: ($) =>
      seq(
        "P",
        $._ws,
        $.date,
        $._ws,
        $.commodity,
        $._ws,
        $.amount,
        optional(seq($._ws, $.comment)),
        /\n/
      ),

    directive_tag: ($) =>
      seq("tag", $._ws, $.tag_name, optional(seq($._ws, $.comment)), /\n/),

    // =========================================================
    // WHITESPACE (inline — vanishes from the tree)
    // =========================================================

    _ws: ($) => /[ \t]+/,
  },
});

// =========================================================
// HELPERS
// =========================================================

/**
 * Block directive rule (comment, test, …) — no external scanner needed.
 *
 * Matches:
 *   <keyword>[<ws> <anything>]\n
 *   (<line-content>\n)*
 *   end <keyword>\n
 *
 * Body lines are captured by `optional(seq(optional(_ws), /.* /)) + '\n'`.
 * The lexer gives `token('end <keyword>')` priority over the general `/.*‌/`
 * regex in the repeat body because specific string tokens beat regexes of
 * equal length when both are valid in the current parser state.
 */
function blockRule($, keyword) {
  return seq(
    token(keyword),
    optional(seq($._ws, /.*/)),
    "\n",
    repeat(seq(optional(seq(optional($._ws), /.*/)), "\n")),
    token(`end ${keyword}`),
    /[^\n]*\n/
  );
}

/**
 * Shared structure for posting, posting_virtual, and posting_virtual_balanced.
 * `accountExpr` is the account node or virtual-account sequence.
 */
function postingRule($, accountExpr) {
  return seq(
    $._ws,
    optional(seq(choice($.status_cleared, $.status_pending), $._ws)),
    accountExpr,
    optional(seq($._ws, $._posting_amounts)),
    optional(seq(optional($._ws), $.comment)),
    /\n/
  );
}
