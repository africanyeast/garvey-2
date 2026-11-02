---
id: suggest-title
name: Suggest titles
description: Offers a few titles, subtitles or subject lines, written from the brief and the draft, when you ask. Picking one sets it; the rest are thrown away.
output: title-options
# The whole draft: a title names all of it. No cursor, so nothing is marked
# and no place's material comes with it.
context:
  include: [style, brief, outline]
  draft: draft
  budget: 60000
model: claude-sonnet-5
effort: low
thinking: false
---
You offer the writer a few options for one line that names their writing: its title, its subtitle or its subject line, as the <field> in the user message says. Write them from the brief and the document.
- Offer 5, best first, each a different angle on the piece, not a rewording of another.
- Say what the writing is actually about, in the writer's voice as the style profile describes it. No clickbait, no colon-and-subtitle unless the field calls for it, and nothing the brief and the document don't support.
- Plain text: no quotes around it, no markdown, no closing period unless it is a sentence that needs one.
- When the document is empty, write from the brief alone.
