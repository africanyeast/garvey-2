import { paragraphBlock, sectionBlock } from "@/app/lib/writing-os/blockText";
import type { DraftPartialBlock } from "@/app/lib/writing-os/schema";
import type { Comment } from "@/app/lib/writing-os/types";

/**
 * Dummy/seed data for the Writing OS demo. This stands in for what would
 * eventually be loaded from a real data source per-project.
 */

// New projects start with these three, but sections aren't fixed — like any
// other block, the user can rename (edit the heading text), add ("/" ->
// Heading), reorder (drag), or remove one from here on. Ids are pinned
// explicitly (rather than left to BlockNote's own id generation) so
// `initialNotes`' `bucket` values and `initialComments`' keys below can
// reference them directly.
export const initialDocument: DraftPartialBlock[] = [
  sectionBlock("opening", "Opening", [
    paragraphBlock(
      "p1",
      "For years, writers have relied on cloud-based tools to help them think, draft, and edit. These tools are powerful, but they come with tradeoffs: constant connectivity, privacy concerns, and a growing sense that our creative work is being stored somewhere else."
    ),
    paragraphBlock(
      "p2",
      "Local AI changes that equation. By running models on your own machine, you get the benefits of AI assistance without handing over your data, your ideas, or your context."
    ),
  ]),
  sectionBlock("body", "Body", [
    paragraphBlock(
      "p3",
      "But local AI isn't just about privacy. It's also about control — over your workflow, your tools, and your creative process. When the model runs locally, you're not just a user; you're the operator. You can customize, fine-tune, and shape the experience to fit your own needs."
    ),
  ]),
  sectionBlock("conclusion", "Conclusion", [
    paragraphBlock(
      "p5",
      "In the end, the future of local AI isn't just about better tools. It's about a more intentional relationship with technology — one where you stay in control, your ideas stay yours, and your writing environment works for you, not the other way around."
    ),
  ]),
];

export const initialComments: Record<string, Comment[]> = {
  p2: [{ text: "Consider emphasizing privacy and ownership here.", time: "Today, 10:24 AM", resolved: false }],
};

export const toneTags = ["thoughtful", "clear", "encouraging"];
export const avoidWords = ["actually", "just", "really", "very", "basically"];
export const transitions = ["however", "in addition", "for example", "as a result"];
export const registerTags = ["conversational", "professional", "accessible"];
