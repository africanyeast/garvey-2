import { MessageSquareText } from "lucide-react";
import { firstWords, type TypeManifest } from "../writing-type";

export const manifest: TypeManifest = {
  id: "message",
  name: "Message",
  description: "A message on WhatsApp, Telegram, SMS or the like: short, conversational, plain.",
  permissions: [],
  type: {
    label: "Message",
    icon: MessageSquareText,
    about: "WhatsApp, Telegram, SMS and the like.",
    fields: { title: "A label for the sidebar only; the message itself has no title" },
    editor: { sections: false, copyAs: "plain", duplicate: false },
    autoTitle: (brief) => {
      const handle = brief.trim().match(/^@(\w{1,30})\s*:/)?.[1];
      return handle ? `Reply to @${handle}` : firstWords(brief);
    },
    assistLine: "This is a message (WhatsApp, Telegram, SMS or the like): plain text, short and conversational.",
  },
};
