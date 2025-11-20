/**
 * @file 🌳 A tree-sitter grammar for the hledger plain text accounting journal files
 * @author Ramil Muratov <ramil@muratov.space>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "hledger",

  extras: ($) => [/ /, /\t/],

  conflicts: ($) => [[$.account_directive], [$.commodity_directive]],

  rules: {
    source_file: ($) => repeat($._entry),

    _entry: ($) =>
      choice(
        $.transaction,
        $.directive,
        $.price_directive,
        $.comment,
        $.blank_line,
      ),

    // ============================================================
    // Comments
    // ============================================================

    comment: ($) =>
      choice(
        seq(
          choice("#", ";", "*"),
          optional(alias(/[^\n]*/, $.comment_text)),
          "\n",
        ),
        seq(
          "comment",
          optional(alias(/[^\n]*/, $.comment_text)),
          "\n",
          repeat(seq(alias(/[^\n]+/, $.comment_text), "\n")),
          "end comment",
          optional(alias(/[^\n]*/, $.comment_text)),
          "\n",
        ),
      ),

    inline_comment: ($) =>
      seq(choice(";", "#"), optional(alias(/[^\n]*/, $.comment_text))),

    blank_line: ($) => /\n/,

    // ============================================================
    // Transactions
    // ============================================================

    transaction: ($) =>
      seq(
        $.date,
        optional(
          seq(
            /[ \t]+/,
            choice(
              prec(
                2,
                seq(
                  $.status,
                  optional(
                    seq(
                      /[ \t]+/,
                      choice(
                        seq($.code, optional(seq(/[ \t]+/, $.description))),
                        $.description,
                      ),
                    ),
                  ),
                ),
              ),
              prec(1, seq($.code, optional(seq(/[ \t]+/, $.description)))),
              $.description,
            ),
          ),
        ),
        optional($.inline_comment),
        "\n",
        repeat1($.posting),
      ),

    date: ($) =>
      seq(
        $._simple_date,
        optional(seq("=", alias($._simple_date, $.secondary_date))),
      ),

    _simple_date: ($) =>
      choice(
        // YYYY-MM-DD
        /\d{4}-\d{1,2}-\d{1,2}/,
        // YYYY/MM/DD
        /\d{4}\/\d{1,2}\/\d{1,2}/,
        // YYYY.MM.DD
        /\d{4}\.\d{1,2}\.\d{1,2}/,
      ),

    status: ($) => token(choice("*", "!")),

    code: ($) => token(seq("(", /[^)]+/, ")")),

    description: ($) =>
      choice(
        seq(
          $.payee,
          optional(seq(/[ \t]+/, "|", /[ \t]*/, alias(/[^;\n]+/, $.note))),
        ),
        alias(/[^*!;\n][^;\n]*/, $.text),
      ),

    payee: ($) => /[^*!|;\n][^|;\n]*/,

    // ============================================================
    // Postings
    // ============================================================

    posting: ($) =>
      seq(
        /[ \t]+/,
        optional($.status),
        $.account,
        optional(
          seq(/[ \t]{2,}/, optional($.amount), optional($.balance_assertion)),
        ),
        optional($.inline_comment),
        "\n",
      ),

    account: ($) =>
      seq(
        choice($.virtual_account, $.balanced_virtual_account, $._account_name),
      ),

    _account_name: ($) =>
      /[a-zA-Z0-9_\-]([a-zA-Z0-9_\-:]| [a-zA-Z0-9_\-:])*[a-zA-Z0-9_\-:]?/,

    virtual_account: ($) => seq("(", $._account_name, ")"),

    balanced_virtual_account: ($) => seq("[", $._account_name, "]"),

    // ============================================================
    // Amounts
    // ============================================================

    amount: ($) =>
      choice(
        seq(
          $.commodity,
          /[ \t]*/,
          $.quantity,
          optional(choice($.unit_price, $.total_price)),
        ),
        seq(
          $.quantity,
          optional(seq(/[ \t]*/, $.commodity)),
          optional(choice($.unit_price, $.total_price)),
        ),
      ),

    quantity: ($) => token(/[+-]?\d+([.,]\d+)?([eE][+-]?\d+)?/),

    commodity: ($) =>
      token(
        choice(
          /[A-Z][A-Z0-9]*/,
          "$",
          "€",
          "£",
          "¥",
          "₹",
          "¢",
          seq('"', /[^"]+/, '"'),
        ),
      ),

    unit_price: ($) =>
      seq("@", optional($.commodity), $.quantity, optional($.commodity)),

    total_price: ($) =>
      seq("@@", optional($.commodity), $.quantity, optional($.commodity)),

    balance_assertion: ($) =>
      choice(
        seq("=", optional("*"), $.amount),
        seq("==", optional("*"), $.amount),
      ),

    // ============================================================
    // Directives
    // ============================================================

    directive: ($) =>
      choice(
        $.account_directive,
        $.commodity_directive,
        $.include_directive,
        $.tag_directive,
        $.payee_directive,
        $.decimal_mark_directive,
        $.alias_directive,
        $.end_aliases_directive,
        $.apply_account_directive,
        $.end_apply_account_directive,
        $.year_directive,
        $.default_commodity_directive,
      ),

    account_directive: ($) =>
      seq(
        "account",
        /[ \t]+/,
        $._account_name,
        optional($.inline_comment),
        "\n",
        repeat(
          choice(
            seq(/[ \t]+/, alias(/[^\n]+/, $.account_subdirective), "\n"),
            $.comment,
          ),
        ),
      ),

    commodity_directive: ($) =>
      seq(
        "commodity",
        /[ \t]+/,
        $.commodity,
        optional($.inline_comment),
        "\n",
        repeat(
          choice(
            seq(/[ \t]+/, alias(/[^\n]+/, $.commodity_subdirective), "\n"),
            $.comment,
          ),
        ),
      ),

    include_directive: ($) =>
      seq("include", /[ \t]+/, alias(/[^\n]+/, $.file_path), "\n"),

    tag_directive: ($) =>
      seq("tag", /[ \t]+/, alias(/[^\n]+/, $.tag_name), "\n"),

    payee_directive: ($) =>
      seq("payee", /[ \t]+/, alias(/[^\n]+/, $.payee_name), "\n"),

    decimal_mark_directive: ($) =>
      seq("decimal-mark", /[ \t]+/, choice(".", ","), "\n"),

    alias_directive: ($) =>
      seq(
        "alias",
        /[ \t]+/,
        alias(/[^=\n]+/, $.alias_pattern),
        "=",
        alias(/[^\n]+/, $.alias_replacement),
        "\n",
      ),

    end_aliases_directive: ($) => seq("end aliases", "\n"),

    apply_account_directive: ($) =>
      seq("apply account", /[ \t]+/, $._account_name, "\n"),

    end_apply_account_directive: ($) => seq("end apply account", "\n"),

    year_directive: ($) => seq("Y", /\d{4}/, "\n"),

    default_commodity_directive: ($) =>
      seq(
        "D",
        /[ \t]+/,
        optional($.commodity),
        $.quantity,
        optional($.commodity),
        "\n",
      ),

    // ============================================================
    // Price Directives
    // ============================================================

    price_directive: ($) =>
      seq(
        "P",
        /[ \t]+/,
        $._simple_date,
        /[ \t]+/,
        $.commodity,
        /[ \t]+/,
        optional($.commodity),
        $.quantity,
        optional($.commodity),
        optional($.inline_comment),
        "\n",
      ),
  },
});
