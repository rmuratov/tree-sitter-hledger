/**
 * @file 🌳 A tree-sitter grammar for the hledger plain text accounting journal files
 * @author Ramil Muratov <ramil@muratov.space>
 * @license MIT
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

module.exports = grammar({
  name: "hledger",

  rules: {
    // TODO: add the actual grammar rules
    source_file: ($) => "hello",
  },
});
