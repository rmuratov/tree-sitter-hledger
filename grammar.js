/**
 * @file A tree-sitter parser for hledger plaintext accounting journal files
 * @author Ramil Muratov <ramil@muratov.space>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "hledger",

  rules: {
    // TODO: add the actual grammar rules
    source_file: $ => repeat($.transaction),

    transaction: $ => seq($.date, $.payee),

    date: $ => /\d\d\d\d-\d\d-\d\d/,

    payee: $ => /[a-zA-Z0-9\s]+/,

    posting: $ => /[a-zA-Z0-9\s]+/,
  }
});
