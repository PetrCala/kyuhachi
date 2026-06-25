import { useCallback } from 'react';
import { Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveChallengeProgress } from '@/hooks/useActiveChallengeProgress';
import { OnsenList, type OnsenListItem } from '@/components/OnsenList';
import { useAuth } from '@/context/AuthContext';
import { createEmptyVisit } from '@/lib/visits';
import { firebaseErrorKey } from '@/lib/firebase-errors';

/**
 * The challenge-scoped onsen checklist reached from the home "Record a visit"
 * button: the eligible onsens (unvisited first) with a search box. Tapping a row
 * opens the visit modal directly — recording an instant check-in first for an
 * unvisited onsen (mirroring the onsen-page FAB), or opening the existing visit
 * for editing. The modal is told to return Home on Save/Delete (`returnTo`), so
 * this list acts as a launchpad; Cancel/swipe still drops back here.
 */
export default function RecordVisit() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { rows, loading, challengeId } = useActiveChallengeProgress();

  const handleItemPress = useCallback(
    (item: OnsenListItem) => {
      if (!item.visited && user && challengeId) {
        createEmptyVisit(user.uid, challengeId, item.id).catch((error) =>
          Alert.alert(t('common.errorTitle'), t(firebaseErrorKey(error)))
        );
      }
      router.push({ pathname: '/onsens/edit-visit', params: { id: item.id, returnTo: 'home' } });
    },
    [user, challengeId, router, t]
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
