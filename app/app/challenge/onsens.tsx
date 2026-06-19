import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { OnsenList } from '@/components/OnsenList';

/**
 * The challenge-scoped onsen checklist reached from the home "Record a visit"
 * button: the eligible onsens (unvisited first) with a search box. Tapping a
 * row opens the onsen detail screen, which owns the actual mark-visited flow.
 */
export default function RecordVisit() {
  const { t } = useTranslation();
  const { rows, loading } = useActiveChallengeProgress();

  return (
    <>
      <Stack.Screen
        options={{ title: t('challengeProgress.recordVisitTitle'), headerShown: true }}
      />
      <OnsenList data={rows} loading={loading} unvisitedVariant="circle" />
    </>
  );
}
