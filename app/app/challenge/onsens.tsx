import { useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { OnsenList, type OnsenListItem } from '@/components/OnsenList';

/**
 * The challenge-scoped onsen checklist reached from the home "Record a visit"
 * button: the eligible onsens (unvisited first) with a search box. Tapping a row
 * opens the visit editor directly — recording nothing until the user saves there.
 * The editor returns Home on Save/Delete (`returnTo`), so this list acts as a
 * launchpad; Cancel/swipe drops back here.
 */
export default function RecordVisit() {
  const { t } = useTranslation();
  const router = useRouter();
  const { rows, loading } = useActiveChallengeProgress();

  const handleItemPress = useCallback(
    (item: OnsenListItem) => {
      router.push({ pathname: '/onsens/edit-visit', params: { id: item.id, returnTo: 'home' } });
    },
    [router]
  );

  return (
    <>
      <Stack.Screen
        options={{ title: t('challengeProgress.recordVisitTitle'), headerShown: true }}
      />
      <OnsenList
        data={rows}
        loading={loading}
        unvisitedVariant="circle"
        onItemPress={handleItemPress}
      />
    </>
  );
}
