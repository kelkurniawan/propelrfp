"use client";

import { createContext, useContext, useState, useCallback } from "react";

export type QuotaType = "proposals" | "storage" | "members";

export interface QuotaExceededInfo {
  limitType: QuotaType;
  current: number;
  limit: number;
  plan: string;
}

interface UpgradeModalContextValue {
  open: boolean;
  info: QuotaExceededInfo | null;
  openModal: (info: QuotaExceededInfo) => void;
  closeModal: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextValue | null>(null);

export function UpgradeModalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<QuotaExceededInfo | null>(null);

  const openModal = useCallback((newInfo: QuotaExceededInfo) => {
    setInfo(newInfo);
    setOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <UpgradeModalContext.Provider value={{ open, info, openModal, closeModal }}>
      {children}
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  const ctx = useContext(UpgradeModalContext);
  if (!ctx) throw new Error("useUpgradeModal must be used within UpgradeModalProvider");
  return ctx;
}
