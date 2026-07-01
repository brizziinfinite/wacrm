"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Brand {
  id: string;
  account_id: string;
  name: string;
  slug: string;
  primary_color: string | null;
  logo_url: string | null;
  niche: string | null;
  tone: string | null;
  target_persona: string | null;
  pillars: unknown[];
  forbidden_topics: string[];
  is_active: boolean;
  segment: string | null;
  created_at: string;
  updated_at: string;
}

interface AppState {
  activeBrand: Brand | null;
  setActiveBrand: (brand: Brand | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeBrand: null,
      setActiveBrand: (brand) => set({ activeBrand: brand }),
    }),
    {
      name: "wacrm-store",
      partialize: (state) => ({ activeBrand: state.activeBrand }),
    }
  )
);
