; ─── Transactions ─────────────────────────────────────────────────────────────
; Show "2026-01-24 | Groceries" when a description is present.
(transaction
  (header
    (date) @context
    (description) @name)) @item

; Fall back to date-only when there is no description.
(transaction
  (header (date) @name)) @item

; ─── Periodic transaction rules ───────────────────────────────────────────────
(directive_periodic_transaction
  "~" @context
  (period_expression) @name) @item

; ─── Auto-posting rules ───────────────────────────────────────────────────────
(directive_auto_posting
  "=" @context
  (query) @name) @item

; ─── account ──────────────────────────────────────────────────────────────────
(directive_account
  "account" @context
  (account) @name) @item

; ─── alias ────────────────────────────────────────────────────────────────────
(directive_alias
  "alias" @context
  (alias_base) @name) @item

; ─── include ──────────────────────────────────────────────────────────────────
(directive_include
  "include" @context
  (path) @name) @item

; ─── payee ────────────────────────────────────────────────────────────────────
(directive_payee
  "payee" @context
  (payee) @name) @item

; ─── P (price) ────────────────────────────────────────────────────────────────
(directive_price
  "P" @context
  (commodity) @name) @item

; ─── commodity ────────────────────────────────────────────────────────────────
; Bare commodity form: `commodity USD`
(directive_commodity
  "commodity" @context
  (commodity) @name) @item

; Amount form: `commodity $1,000.00`  (commodity lives inside the amount node)
(directive_commodity
  "commodity" @context
  (amount (commodity) @name)) @item

; ─── tag ──────────────────────────────────────────────────────────────────────
(directive_tag
  "tag" @context
  (tag_name) @name) @item
