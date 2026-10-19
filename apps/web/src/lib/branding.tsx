"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

type Branding = {
  appName: string;
  appSubtitle: string;
  logoUrl: string | null;
};
const fallback: Branding = {
  appName: "ISM",
  appSubtitle: "IS Department Management System",
  logoUrl: null,
};
const BrandingContext = createContext(fallback);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState(fallback);
  useEffect(() => {
    const load = () =>
      api<Branding>("/public/branding")
        .then((value) => {
          setBranding(value);
          document.title = value.appName;
        })
        .catch(() => undefined);
    load();
    window.addEventListener("branding-updated", load);
    return () => window.removeEventListener("branding-updated", load);
  }, []);
  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
