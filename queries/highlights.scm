; ─── Comments ─────────────────────────────────────────────────────────────────
; block_comment is aliased to `comment` in the grammar, so one rule covers both.
(comment) @comment

; ─── Tags ─────────────────────────────────────────────────────────────────────
; A tag is one opaque `name:value` node; tag_name only occurs in `tag` directives.
(tag) @property
(tag_name) @property

; ─── Dates ────────────────────────────────────────────────────────────────────
(date) @number
(secondary_date) @number

; ─── Transaction header ───────────────────────────────────────────────────────
(status) @keyword

; Code reference, e.g. (#1234) or (REF123)
(code "(" @punctuation.bracket)
(code ")" @punctuation.bracket)
(code) @string

(description) @string

; Payee declared by the `payee` directive
(payee) @string

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
(sign) @operator
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
