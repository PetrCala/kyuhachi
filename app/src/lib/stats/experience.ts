/**
 * Experience stats — the rich, opt-in self-reported data (ratings, facilities,
 * bath, crowd, company, locals, photos).
 *
 * Computed over ALL visits (a review is about the visit, not eligibility). Every
 * derived value carries a {@link Coverage} so the screen can show an honest
 * "based on N of M visits" and collapse to an empty state when sparse.
 * Superlatives ("best for …") are drawn only from visits whose onsen info has
 * loaded, since they need a name to display.
 */
import {
  PERCEIVED_HEAT_LEVELS,
  CROWD_LEVELS,
  VISITED_WITH_OPTIONS,
  type CrowdLevel,
  type PerceivedHeat,
  type VisitedWith,
  type VisitStructuredData,
} from '@kyuhachi/shared';
import {
  coverage,
  distribution,
  meanDefined,
  parseWaterTempC,
  percent,
  ratingHistogram,
  type Coverage,
  type DistributionBucket,
  type HistogramBucket,
  type VisitEntry,
} from './shared';

/** The six detailed sub-ratings, in display order, mapped to their fields. */
export const SUB_RATING_KEYS = [
  'cleanliness',
  'atmosphere',
  'uniqueness',
  'coolDown',
  'smell',
  'value',
] as const;
export type SubRatingKey = (typeof SUB_RATING_KEYS)[number];

const SUB_RATING_FIELDS: Record<SubRatingKey, keyof VisitStructuredData> = {
  cleanliness: 'cleanlinessRating',
  atmosphere: 'atmosphereRating',
  uniqueness: 'uniquenessRating',
  coolDown: 'coolDownRating',
  smell: 'smellIntensityRating',
  value: 'valueRating',
};

export interface Superlative {
  onsenId: string;
  name: string;
  value: number;
}

export interface RatingStat {
  avg: number | null;
  coverage: Coverage;
}

export interface SubRatingStat extends RatingStat {
  key: SubRatingKey;
  /** Highest-rated onsen on this axis (with a name), or null. */
  top: Superlative | null;
}

export interface FacilityStat {
  /** Share of visits (where reported) that used the facility, 0–100; null if none reported. */
  usedPercent: number | null;
  /** Mean rating among visits that rated it; null if none. */
  avgRating: number | null;
  /** Coverage of the "used?" flag. */
  coverage: Coverage;
}

export interface ExperienceResult {
  totalVisits: number;
  overall: { avg: number | null; histogram: HistogramBucket[]; coverage: Coverage };
  /** Highest overall-rated onsen (with a name), or null. */
  best: Superlative | null;
  subRatings: SubRatingStat[];
  favorites: { count: number; coverage: Coverage };
  time: { totalMinutes: number; avgMinutes: number | null; coverage: Coverage };
  facilities: {
    sauna: FacilityStat;
    restArea: FacilityStat;
    food: FacilityStat;
    hadSoapPercent: number | null;
    soapCoverage: Coverage;
    massageChairPercent: number | null;
    massageCoverage: Coverage;
  };
  bath: {
    perceivedHeat: DistributionBucket<PerceivedHeat>[];
    heatCoverage: Coverage;
    avgWaterTempC: number | null;
    tempCoverage: Coverage;
  };
  crowd: { distribution: DistributionBucket<CrowdLevel>[]; coverage: Coverage };
  company: { distribution: DistributionBucket<VisitedWith>[]; coverage: Coverage };
  locals: { interactedPercent: number | null; avgRating: number | null; coverage: Coverage };
  media: { totalPhotos: number; visitsWithPhotos: number };
}

export function computeExperience(entries: VisitEntry[]): ExperienceResult {
  const data = entries.map((e) => e.visit.structuredData);

  const overallValues = data.map((d) => d.rating);
  const heatTemps = data.map((d) => parseWaterTempC(d.waterTemp));

  return {
    totalVisits: entries.length,
    overall: {
      avg: meanDefined(overallValues),
      histogram: ratingHistogram(overallValues),
      coverage: coverage(overallValues),
    },
    best: topByField(entries, 'rating'),
    subRatings: SUB_RATING_KEYS.map((key) => {
      const field = SUB_RATING_FIELDS[key];
      const values = data.map((d) => d[field] as number | null);
      return {
        key,
        avg: meanDefined(values),
        coverage: coverage(values),
        top: topByField(entries, field),
      };
    }),
    favorites: {
      count: data.filter((d) => d.wouldReturn === true).length,
      coverage: coverage(data.map((d) => d.wouldReturn)),
    },
    time: {
      totalMinutes: data.reduce((sum, d) => sum + (d.duration ?? 0), 0),
      avgMinutes: meanDefined(data.map((d) => d.duration)),
      coverage: coverage(data.map((d) => d.duration)),
    },
    facilities: {
      sauna: facilityStat(data, 'saunaUsed', 'saunaRating'),
      restArea: facilityStat(data, 'restAreaUsed', 'restAreaRating'),
      food: facilityStat(data, 'foodUsed', 'foodRating'),
      hadSoapPercent: boolPercent(data.map((d) => d.hadSoap)),
      soapCoverage: coverage(data.map((d) => d.hadSoap)),
      massageChairPercent: boolPercent(data.map((d) => d.massageChairAvailable)),
      massageCoverage: coverage(data.map((d) => d.massageChairAvailable)),
    },
    bath: {
      perceivedHeat: distribution(
        data.map((d) => d.perceivedHeat),
        PERCEIVED_HEAT_LEVELS
      ),
      heatCoverage: coverage(data.map((d) => d.perceivedHeat)),
      avgWaterTempC: meanDefined(heatTemps),
      tempCoverage: coverage(heatTemps),
    },
    crowd: {
      distribution: distribution(
        data.map((d) => d.crowdLevel),
        CROWD_LEVELS
      ),
      coverage: coverage(data.map((d) => d.crowdLevel)),
    },
    company: {
      distribution: distribution(
        data.map((d) => d.visitedWith),
        VISITED_WITH_OPTIONS
      ),
      coverage: coverage(data.map((d) => d.visitedWith)),
    },
    locals: {
      interactedPercent: boolPercent(data.map((d) => d.interactedWithLocals)),
      avgRating: meanDefined(data.map((d) => d.localInteractionRating)),
      coverage: coverage(data.map((d) => d.interactedWithLocals)),
    },
    media: {
      totalPhotos: entries.reduce((sum, e) => sum + e.visit.photoUrls.length, 0),
      visitsWithPhotos: entries.filter((e) => e.visit.photoUrls.length > 0).length,
    },
  };
}

/** Highest value of a numeric structured-data field, among visits with a name. */
function topByField(entries: VisitEntry[], field: keyof VisitStructuredData): Superlative | null {
  let best: Superlative | null = null;
  for (const entry of entries) {
    if (!entry.onsen) continue;
    const value = entry.visit.structuredData[field] as number | null;
    if (value == null) continue;
    if (best === null || value > best.value) {
      best = { onsenId: entry.onsenId, name: entry.onsen.name, value };
    }
  }
  return best;
}

function facilityStat(
  data: VisitStructuredData[],
  usedField: keyof VisitStructuredData,
  ratingField: keyof VisitStructuredData
): FacilityStat {
  const used = data.map((d) => d[usedField] as boolean | null);
  const ratings = data.map((d) => d[ratingField] as number | null);
  return {
    usedPercent: boolPercent(used),
    avgRating: meanDefined(ratings),
    coverage: coverage(used),
  };
}

/** Percentage of reported booleans that are true; null when none reported. */
function boolPercent(values: (boolean | null)[]): number | null {
  const reported = values.filter((v): v is boolean => v != null);
  return percent(reported.filter((v) => v).length, reported.length);
}
