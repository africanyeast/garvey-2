import { Mail } from "lucide-react";
import type { TypeManifest } from "../writing-type";

export const manifest: TypeManifest = {
  id: "email",
  name: "Email",
  description: "An email, new or a reply. Its title is the subject line.",
  permissions: [],
  type: {
    label: "Email",
    icon: Mail,
    about: "An email, new or a reply.",
    fields: { title: "The email's subject line" },
    editor: { sections: false, copyAs: "plain", duplicate: false },
    assistLine: "This is an email. Its title is the subject line; write it with a greeting and a sign-off that fit the tone.",
  },
};
