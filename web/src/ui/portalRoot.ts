"use client";
import { createContext, useContext } from "react";

/**
 * Where popups (dropdown menus) are portalled to. null = <body>, which is right for the editor, whose theme
 * tokens are on :root. A themed area that sets its tokens on a wrapper (not :root) can provide its own element
 * here, so menus opened inside it sit inside the wrapper and pick up its colours.
 */
export const PortalRootContext = createContext<HTMLElement | null>(null);
export const usePortalRoot = () => useContext(PortalRootContext);
