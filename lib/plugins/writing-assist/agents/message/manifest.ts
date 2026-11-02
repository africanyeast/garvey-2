import { MessageSquareText } from "lucide-react";
import { firstWords, type AgentManifest } from "../agent";

export const manifest: AgentManifest = {
  id: "message",
  name: "Message",
  description: "Writes chat messages (WhatsApp, Telegram, SMS and the like): short, conversational, plain.",
  permissions: [],
  agent: {
    label: "Message",
    icon: MessageSquareText,
    about: "WhatsApp, Telegram, SMS and the like.",
    title: "A label for the sidebar only; the message itself has no title",
    autoTitle: (brief) => {
      const handle = brief.trim().match(/^@(\w{1,30})\s*:/)?.[1];
      return handle ? `Reply to @${handle}` : firstWords(brief);
    },
  },
};
