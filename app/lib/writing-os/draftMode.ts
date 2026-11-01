"use client";

import { createContext, useContext } from "react";
import { typeDeclaration } from "@/lib/plugins/writing-types";
import type { TypeDeclaration } from "@/lib/plugins/writing-type";

/** What the open writing's type plugin declares (or `PLAIN` while it's
 * off), for whatever part of the draft screen needs one of its switches. */
const DraftModeContext = createContext<TypeDeclaration>(typeDeclaration("document"));
export const DraftModeProvider = DraftModeContext.Provider;
export const useDraftMode = () => useContext(DraftModeContext);
