; ─── Comments ─────────────────────────────────────────────────────────────────
; block_comment is aliased to `comment` in the grammar, so one rule covers both.
(comment) @comment

; ─── Tags ─────────────────────────────────────────────────────────────────────
(tag_name) @property
(tag_value) @string

; ─── Dates ────────────────────────────────────────────────────────────────────
(date) @number
(secondary_date) @number

; ─── Transaction header ───────────────────────────────────────────────────────
(status) @keyword

; Code reference, e.g. (#1234) or (REF123)
(code "(" @punctuation.bracket)
(code ")" @punctuation.bracket)
(code) @string

; Payee and note (the | separator is covered by the parent description capture)
(payee) @string
(note) @comment.doc
(description) @string

; ─── Accounts ─────────────────────────────────────────────────────────────────
(account) @variable

; Virtual posting delimiters
(posting_virtual "(" @punctuation.bracket)
(posting_virtual ")" @punctuation.bracket)
(posting_virtual_balanced "[" @punctuation.bracket)
(posting_virtual_balanced "]" @punctuation.bracket)

; ─── Amounts ──────────────────────────────────────────────────────────────────
(quantity) @number
(commodity) @type
(negative) @operator
(positive) @operator
(multiplier) @operator
(cost_operator) @operator
(assertion_operator) @operator

; ─── Directives: keywords ─────────────────────────────────────────────────────
; Most directive keywords are unique strings that appear nowhere else in the
; grammar, so a bare list match is safe and concise.
[
  "account"
  "alias"
  "end aliases"
  "commodity"
  "format"
  "decimal-mark"
  "include"
  "payee"
  "tag"
  "P"
  "~"
] @keyword

; "=" is also used as the separator in secondary_date, so match it only in
; the auto-posting directive context to avoid coloring date separators as keywords.
(directive_auto_posting "=" @keyword)

; ─── Directives: values ───────────────────────────────────────────────────────
(path) @string
(period_expression) @string
(query) @string
(alias_base) @variable
(alias_substitute) @string
