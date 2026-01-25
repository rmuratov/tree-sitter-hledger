#include "tree_sitter/parser.h"
#include <string.h>

enum TokenType {
  BLOCK_COMMENT_CONTENT,
};

void *tree_sitter_hledger_external_scanner_create(void) {
  return NULL;
}

void tree_sitter_hledger_external_scanner_destroy(void *payload) {
  (void)payload;
}

unsigned tree_sitter_hledger_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload;
  (void)buffer;
  return 0;
}

void tree_sitter_hledger_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload;
  (void)buffer;
  (void)length;
}

bool tree_sitter_hledger_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  (void)payload;

  if (!valid_symbols[BLOCK_COMMENT_CONTENT]) {
    return false;
  }

  /* Must start with the keyword "comment" */
  const char *start_kw = "comment";
  for (int i = 0; start_kw[i] != '\0'; i++) {
    if (lexer->lookahead != (unsigned char)start_kw[i]) {
      return false;
    }
    lexer->advance(lexer, false);
  }

  /* Consume the rest of the opening "comment" line (including \n) */
  while (lexer->lookahead != '\n' && lexer->lookahead != 0) {
    lexer->advance(lexer, false);
  }
  if (lexer->lookahead == '\n') {
    lexer->advance(lexer, false);
  }

  /* Consume content lines until we see "end comment" at the start of a line */
  const char *end_kw = "end comment";
  int end_len = (int)strlen(end_kw);

  while (lexer->lookahead != 0) {
    /* Save current position as candidate end-of-token */
    lexer->mark_end(lexer);

    /* Try to match "end comment" */
    bool matched = true;
    for (int i = 0; i < end_len; i++) {
      if (lexer->lookahead != (unsigned char)end_kw[i]) {
        matched = false;
        break;
      }
      lexer->advance(lexer, false);
    }

    if (matched) {
      /* Consume the rest of the "end comment" line (including \n) */
      while (lexer->lookahead != '\n' && lexer->lookahead != 0) {
        lexer->advance(lexer, false);
      }
      if (lexer->lookahead == '\n') {
        lexer->advance(lexer, false);
      }
      lexer->mark_end(lexer);
      lexer->result_symbol = BLOCK_COMMENT_CONTENT;
      return true;
    }

    /* Not "end comment" — consume the rest of this line */
    while (lexer->lookahead != '\n' && lexer->lookahead != 0) {
      lexer->advance(lexer, false);
    }
    if (lexer->lookahead == '\n') {
      lexer->advance(lexer, false);
    }
  }

  /* Reached EOF without "end comment" — still a valid block comment */
  lexer->mark_end(lexer);
  lexer->result_symbol = BLOCK_COMMENT_CONTENT;
  return true;
}
