/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { initPromise, i18nInstance } from "./instance";
import { FALLBACK_LANGUAGE, LANGUAGE_STORAGE_KEY } from "../constants/language";
import type { TLanguage } from "../types";

export async function setLanguage(_requested: TLanguage): Promise<void> {
  // Workbench is English-only (its Rust glossary renames the English strings)
  const lng: TLanguage = FALLBACK_LANGUAGE;
  await initPromise;
  await i18nInstance.changeLanguage(lng);
  if (typeof window !== "undefined") {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
    document.documentElement.lang = lng;
  }
}
