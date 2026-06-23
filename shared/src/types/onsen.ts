import type { Timestamp } from './firestore';

export interface ParsedHours {
  /** Raw string from 88onsen.com for display fallback */
  raw: string;
  /** Structured schedule if successfully parsed */
  schedule: WeeklySchedule | null;
}

export interface WeeklySchedule {
  monday: DaySchedule | null;
  tuesday: DaySchedule | null;
  wednesday: DaySchedule | null;
  thursday: DaySchedule | null;
  friday: DaySchedule | null;
  saturday: DaySchedule | null;
  sunday: DaySchedule | null;
}

export interface DaySchedule {
  opens: string; // "HH:MM"
  closes: string; // "HH:MM"
}

/**
 * /onsens/{kyuhachiId}
 *
 * Onsen documents are never deleted. Deprecated onsens get isActive: false.
 * The kyuhachiId is a stable UUID assigned once by the data repo and never changes.
 */
export interface OnsenDocument {
  name: string;
  areaName: string;
  address: string;
  prefecture: string;
  lat: number;
  lng: number;
  phone: string | null;
  businessHours: ParsedHours | null;
  admissionFee: string | null;
  /** Adult weekday walk-in admission in yen; null if no parseable individual fee. Derived from admissionFee by the data repo. */
  adultFee: number | null;
  springQuality: string | null;
  websiteUrl: string | null;
  imageUrl: string | null;
  /** false = deprecated; never deleted from Firestore */
  isActive: boolean;
  catalogVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * /catalog_meta/current
 *
 * Written atomically by the data repo publish script.
 * The app reads this on startup to check for catalog updates.
 */
export interface CatalogMetaDocument {
  version: number;
  publishedAt: Timestamp;
  totalCount: number;
  activeCount: number;
}
