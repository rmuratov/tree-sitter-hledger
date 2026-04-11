; ─── Block comments ───────────────────────────────────────────────────────────
; `comment` nodes that are aliased block_comments contain the anonymous token
; "end comment" as their closing delimiter.  Regular line comments never contain
; this token, so the pattern naturally distinguishes the two kinds.
(comment "end comment" @end) @indent

; ─── Transaction body ─────────────────────────────────────────────────────────
; Postings and inline body-comments are indented children of the transaction
; node.  hledger has no explicit closing keyword, so indentation is in effect
; for the duration of the node and reverts automatically once it ends.
(transaction) @indent

; ─── Directives with posting bodies ──────────────────────────────────────────
(directive_auto_posting) @indent
(directive_periodic_transaction) @indent
