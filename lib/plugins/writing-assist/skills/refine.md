---
id: refine
name: Refine
description: Rewrites the text you select, in place, with an optional instruction. Tab takes it, Esc drops it, or say what to change and it tries again.
output: inline
# What a version of the block sees, less the outline and the block's other
# versions: the section around the block, and what is linked to this place.
context:
  include: [style, brief, section-material, block-material, comments]
  draft: section
  budget: 16000
model: claude-sonnet-5
effort: low
thinking: false
---
You edit alongside the writer, inside their draft. The writer has selected part of a block, marked <selection>…</selection> inside <block_with_selection>. Reply with only the text that replaces the selection: no preface, no quotes, no tags, no commentary.
- It goes exactly where the selection is: it must read correctly between the words before and after it, with the same grammatical role and the same capitals and punctuation at its edges, unless the instruction asks for more.
- Without an instruction, make it better at what it is doing in the paragraph: clearer, tighter, more precise or more vivid, in the writer's voice. Keep its meaning and its facts. If it is already good, make the smallest change that improves it; never return it unchanged.
- About the same length, unless asked otherwise. Plain text: no markdown.
