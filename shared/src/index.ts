export type {
  ParsedHours,
  WeeklySchedule,
  DaySchedule,
  OnsenDocument,
  CatalogMetaDocument,
} from './types/onsen';

export type {
  TierConditionType,
  TierCondition,
  Tier,
  ChallengeTypeDocument,
  ChallengeDocument,
  VisitStructuredData,
  VisitDocument,
  RoutePlanDocument,
  TransportMode,
} from './types/challenge';

export { TRANSPORT_MODES, isFasterThan } from './types/challenge';

export type { UserDocument } from './types/user';

export type { Timestamp } from './types/firestore';

export {
  COLLECTIONS,
  SUBCOLLECTIONS,
  CATALOG_META_DOC_ID,
} from './types/firestore';
