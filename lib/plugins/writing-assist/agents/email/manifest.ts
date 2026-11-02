import { Mail } from "lucide-react";
import type { AgentManifest } from "../agent";

export const manifest: AgentManifest = {
  id: "email",
  name: "Email",
  description: "Writes emails, new or replies: the title is the subject line, with a greeting and a sign-off that fit.",
  permissions: [],
  agent: {
    label: "Email",
    icon: Mail,
    about: "An email, new or a reply.",
    title: "The email's subject line",
  },
};
