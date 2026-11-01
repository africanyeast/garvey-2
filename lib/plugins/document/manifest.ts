import { FileText } from "lucide-react";
import type { TypeManifest } from "../writing-type";

// The default type, and the one a writing with no type behaves as. Always
// on: it is also what a writing falls back to.
export const manifest: TypeManifest = {
  id: "document",
  name: "Document",
  description: "A piece in sections, with a title and a subtitle. Every writing that hasn't picked a type is one.",
  permissions: [],
  alwaysOn: true,
  type: {
    label: "Document",
    icon: FileText,
    about: "An essay, a post, a piece in sections.",
    fields: { title: "The piece's title", subtitle: "A line under the title that says what the piece is" },
    editor: { sections: true, copyAs: "markdown", duplicate: true },
  },
};
