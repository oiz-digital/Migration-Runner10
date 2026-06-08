---
name: Print-to-popup XSS
description: Escaping rule for any client-side print/PDF feature that builds HTML and uses window.open + document.write
---

# Print-to-popup invoices must escape all dynamic values

When a frontend "Print" / "Save PDF" feature builds an HTML string and injects it
into a popup via `window.open()` + `document.write()`, every interpolated dynamic
value (user name/email, plan name, any server- or user-controlled field) MUST be
HTML-escaped first. The popup is same-origin, so an unescaped `<script>` in those
fields executes as code (DOM XSS).

**Why:** AI-trading invoice print flow shipped with raw template-string
interpolation of `inv.user.name`, `inv.bot.planName`, etc. — flagged as a DOM XSS
sink in code review.

**How to apply:** Add a small `esc()` helper (`&<>"'` → entities) and wrap every
`${...}` dynamic value, including inside row/cell builders. Static CSS/labels don't
need it. Alternative (preferred for larger docs): render via React DOM then call
`window.print()`.
