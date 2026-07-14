import { useState, useEffect, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
  ActionSheetIOS,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import {
  ref,
  putFile,
  getDownloadURL,
  deleteObject,
  refFromURL,
} from '@react-native-firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import type {
  VisitStructuredData,
  TransportMode,
  PerceivedHeat,
  CrowdLevel,
  VisitedWith,
  VisitDocument,
} from '@kyuhachi/shared';
import {
  COLLECTIONS,
  SUBCOLLECTIONS,
  TRANSPORT_MODES,
  PERCEIVED_HEAT_LEVELS,
  CROWD_LEVELS,
  VISITED_WITH_OPTIONS,
  EMPTY_VISIT_STRUCTURED_DATA,
} from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { useOnsenCatalog } from '@/context/OnsenCatalogContext';
import { useStampCelebration } from '@/context/StampCelebrationContext';
import { useVisit } from '@/hooks/useVisit';
import { db, storage } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { RatingStars } from '@/components/visit/RatingStars';
import { OptionChips, type ChipOption } from '@/components/visit/OptionChips';
import { BoolChips } from '@/components/visit/BoolChips';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { STAMP_PRESS_CYCLE_MS } from '@/components/StampingLoader';
import { colors, spacing, typography, radii } from '@/theme';

const MAX_PHOTOS = 6;

// A save applies to Firestore's local cache instantly, which would flash the
// saving overlay for a frame or two. Hold it open long enough for the
// stamp-press loader to play its full press-lift-reveal story once, so the
// moment reads as deliberate. This timer alone paces the overlay: never the
// write's backend acknowledgment, which offline may be days away. Photo
// uploads still run detached afterwards.
const SAVE_VISIBLE_MS = STAMP_PRESS_CYCLE_MS;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A photo in the editor: one already stored on the visit, or one freshly picked
 * but not yet uploaded. New ones upload to Storage on Save; nothing is written
 * before that, so Cancel discards them.
 */
type PhotoItem = { kind: 'existing'; url: string } | { kind: 'new'; uri: string };

/** A labelled form row. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function EditVisit() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const { challengeId, visit, loading } = useVisit(id);
  const { celebrateStamp } = useStampCelebration();

  // When the modal is opened from the record-a-visit list (returnTo='home'), a
  // successful Save or a Delete pops the whole flow (both the modal and the
  // list) back to the Home tab. Cancel / swipe-down still use plain back().
  const dismissToHome = returnTo === 'home';

  const [notes, setNotes] = useState('');
  const [details, setDetails] = useState<VisitStructuredData>({ ...EMPTY_VISIT_STRUCTURED_DATA });
  const [durationText, setDurationText] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Photos are staged locally and only uploaded/written on Save; Cancel discards
  // them. `originalPhotoUrls` remembers what the doc had so Save can delete the
  // Storage objects for any the user removed.
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  // The onsen's catalog fields, used only to ink the seal on the stamp-collection
  // celebration when a first visit is recorded. Served from the offline-first
  // catalog store, so it's ready by save time without a network round-trip.
  const { onsenMap } = useOnsenCatalog();
  const onsen = id ? (onsenMap.get(id) ?? null) : null;
  const originalPhotoUrls = useRef<string[]>([]);
  const seeded = useRef(false);
  // Whether a visit doc ever existed here. In create mode it never does, so a
  // null visit must not be mistaken for "deleted".
  const hadVisit = useRef(false);
  // Snapshot of `visit` frozen for the duration of a save: the write's own
  // snapshot (often served instantly off Firestore's offline cache) otherwise
  // lands mid-animation and flips the header title / Remove button underneath
  // the still-playing stamp loader. Since a successful save navigates away
  // right after the loader closes, the display never needs to catch up.
  const displayVisitRef = useRef<VisitDocument | null>(null);

  // Seed the form from the visit once it first loads. The ref guard means later
  // live snapshots (e.g. a photo URL landing) don't clobber in-progress edits.
  // Spreading over the empty record fills any field a pre-existing doc lacks.
  useEffect(() => {
    if (visit) hadVisit.current = true;
    if (!visit || seeded.current) return;
    seeded.current = true;
    setNotes(visit.notes ?? '');
    setDetails({ ...EMPTY_VISIT_STRUCTURED_DATA, ...visit.structuredData });
    setDurationText(
      visit.structuredData?.duration != null ? String(visit.structuredData.duration) : ''
    );
    const urls = visit.photoUrls ?? [];
    originalPhotoUrls.current = urls;
    setPhotos(urls.map((url) => ({ kind: 'existing', url })));
  }, [visit]);

  // Leave the editor when there's nothing left to edit: no onsen id (the modal
  // was re-presented by navigation state restoration on reload), or the visit we
  // were editing got deleted (via Remove here, or elsewhere). A brand-new visit
  // that was never created stays open so the form can be filled. `returnTo=home`
  // pops the whole flow; otherwise fall back to home when there's no screen to
  // pop to.
  useEffect(() => {
    if (loading) return;
    const gone = !id || (hadVisit.current && !visit);
    if (!gone) return;
    if (dismissToHome) router.dismissAll();
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [loading, visit, id, router, dismissToHome]);

  function visitRef() {
    if (!user || !challengeId || !id) return null;
    return doc(
      db,
      COLLECTIONS.USERS,
      user.uid,
      SUBCOLLECTIONS.CHALLENGES,
      challengeId,
      SUBCOLLECTIONS.VISITS,
      id
    );
  }

  function setField<K extends keyof VisitStructuredData>(
    key: K,
    value: VisitStructuredData[K]
  ) {
    setDetails((d) => ({ ...d, [key]: value }));
  }

  async function handleSaveVisit() {
    const docRef = visitRef();
    if (!docRef) return;
    // Guard against a late snapshot re-seeding the form mid-save: a create makes
    // the visit non-null before we navigate away.
    seeded.current = true;
    setSaving(true);
    const isCreate = !visit;
    const structuredData = {
      ...details,
      waterTemp: details.waterTemp?.trim() ? details.waterTemp : null,
      duration: durationText ? Number(durationText) : null,
    };
    // Photos already on the visit are uploaded; freshly-picked ones aren't. The
    // doc is written now with just the uploaded URLs so the save, and the stamp,
    // lands instantly off Firestore's offline cache, with no Storage round-trip
    // on the critical path. Any new photos upload in the background (see
    // finalizeVisitPhotos) and patch onto the doc once they finish.
    //
    // The write is deliberately NOT awaited: Firestore applies it to the local
    // cache at once and syncs when connectivity allows, but the returned promise
    // resolves only on the backend's acknowledgment; awaiting it would hang this
    // save (and its overlay) indefinitely at an onsen with no signal, which is
    // exactly where visits get recorded. Snapshots deliver the pending write to
    // every screen immediately; a genuine rejection (e.g. rules) surfaces through
    // the alert.
    const existingUrls = photos.flatMap((p) => (p.kind === 'existing' ? [p.url] : []));
    if (isCreate) {
      // First save records the visit: the only place a visit is created.
      setDoc(docRef, {
        visitedAt: serverTimestamp(),
        notes: notes.trim() || null,
        photoUrls: existingUrls,
        structuredData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((error) => Alert.alert(t('common.errorTitle'), t(firebaseErrorKey(error))));
    } else {
      updateDoc(docRef, {
        notes: notes.trim() || null,
        photoUrls: existingUrls,
        structuredData,
        updatedAt: serverTimestamp(),
      }).catch((error) => Alert.alert(t('common.errorTitle'), t(firebaseErrorKey(error))));
    }
    // Hold the saving overlay for one full stamp-press cycle (see
    // SAVE_VISIBLE_MS): the loader's press-lift-reveal is the save's visible
    // beat, and this timer is its only pacer.
    await delay(SAVE_VISIBLE_MS);

    // A brand-new visit earns a stamp: celebrate it now that the loader has played
    // out. The reveal waits for this editor to dismiss (see StampCelebrationContext),
    // so firing it just before navigating away is intentional. Editing an existing
    // visit records no new stamp and stays silent.
    if (isCreate) {
      celebrateStamp({
        onsenId: id,
        prefecture: onsen?.prefecture ?? '',
        areaName: onsen?.areaName ?? '',
        name: onsen?.name ?? '',
        dateMs: Date.now(),
      });
    }

    // The visit is saved; leave the editor rather than holding the user on a
    // disabled button while photos upload. The upload runs detached from this
    // now-unmounting screen, then patches the doc and sweeps removed files.
    void finalizeVisitPhotos(docRef, existingUrls);
    if (dismissToHome) router.dismissAll();
    else router.back();
  }

  // Finishes the photo side of a save after the editor has navigated away: uploads
  // any freshly-picked photos, writes the final ordered photo list, then drops the
  // Storage objects for any removed originals. Runs detached from the (unmounting)
  // screen, so it never touches React state; a failure surfaces as a single alert
  // and the visit keeps whatever photos did upload. With no new photos the
  // synchronous save already wrote the URLs, leaving only the removed-file sweep.
  async function finalizeVisitPhotos(
    docRef: FirebaseFirestoreTypes.DocumentReference,
    existingUrls: string[]
  ) {
    try {
      let finalUrls = existingUrls;
      if (photos.some((p) => p.kind === 'new')) {
        const urls: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          urls.push(photo.kind === 'existing' ? photo.url : await uploadPhotoFile(photo.uri, i));
        }
        finalUrls = urls;
        await updateDoc(docRef, { photoUrls: finalUrls, updatedAt: serverTimestamp() });
      }
      // Best-effort: drop the Storage objects for any pre-existing photo the user
      // removed. (onVisitDeleted sweeps by prefix if the whole visit is deleted.)
      const kept = new Set(finalUrls);
      for (const url of originalPhotoUrls.current) {
        if (!kept.has(url)) deleteObject(refFromURL(storage, url)).catch(() => {});
      }
    } catch {
      Alert.alert(
        t('onsenDetail.photoUploadFailedTitle'),
        t('onsenDetail.photoUploadFailedMessage')
      );
    }
  }

  function handleRemoveVisit() {
    const docRef = visitRef();
    if (!docRef) return;
    setRemoving(true);
    // Not awaited, same rationale as the save: the delete applies to the local
    // cache instantly: the visit subscription drops to null, which dismisses
    // the modal via the effect above, while the promise resolves only on the
    // backend's acknowledgment and would deadlock this button offline. The
    // onVisitDeleted Function cleans up any photos. Re-enable only on failure,
    // since success unmounts this screen.
    deleteDoc(docRef).catch((error) => {
      setRemoving(false);
      Alert.alert(t('onsenDetail.errorRemove'), t(firebaseErrorKey(error)));
    });
  }

  function confirmRemoveVisit() {
    Alert.alert(t('onsenDetail.removeTitle'), t('onsenDetail.removeMessage'), [
      { text: t('onsenDetail.cancel'), style: 'cancel' },
      {
        text: t('onsenDetail.removeConfirm'),
        style: 'destructive',
        onPress: handleRemoveVisit,
      },
    ]);
  }

  // Uploads one freshly-picked photo to Storage and returns its download URL. The
  // index keeps names distinct when several upload in the same Save. User /
  // challenge / id are present here: the caller checked visitRef() first.
  async function uploadPhotoFile(uri: string, index: number): Promise<string> {
    const name = `photo_${Date.now()}_${index}.jpg`;
    const photoRef = ref(storage, `visits/${user!.uid}/${challengeId}_${id}/${name}`);
    await putFile(photoRef, uri);
    return getDownloadURL(photoRef);
  }

  function removePhoto(index: number) {
    setPhotos((ps) => ps.filter((_, i) => i !== index));
  }

  function handleAddPhoto() {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          t('onsenDetail.cancel'),
          t('onsenDetail.takePhoto'),
          t('onsenDetail.chooseFromLibrary'),
        ],
        cancelButtonIndex: 0,
      },
      async (buttonIndex) => {
        let result: ImagePicker.ImagePickerResult | null = null;
        if (buttonIndex === 1) {
          result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
        } else if (buttonIndex === 2) {
          result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
          });
        }
        if (result && !result.canceled && result.assets[0]) {
          const uri = result.assets[0].uri;
          setPhotos((ps) => [...ps, { kind: 'new', uri }]);
        }
      }
    );
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: t('onsenDetail.editTitle') }} />
        <ActivityIndicator style={styles.centered} />
      </>
    );
  }

  if (!saving) displayVisitRef.current = visit;
  const displayVisit = displayVisitRef.current;

  const title = displayVisit ? t('onsenDetail.editTitle') : t('onsenDetail.recordTitle');
  const transportOptions: ChipOption[] = TRANSPORT_MODES.map((mode) => ({
    value: mode,
    label: t(`onsenDetail.transport.${mode}`),
  }));
  const heatOptions: ChipOption[] = PERCEIVED_HEAT_LEVELS.map((level) => ({
    value: level,
    label: t(`onsenDetail.perceivedHeat.${level}`),
  }));
  const crowdOptions: ChipOption[] = CROWD_LEVELS.map((level) => ({
    value: level,
    label: t(`onsenDetail.crowdLevel.${level}`),
  }));
  const companyOptions: ChipOption[] = VISITED_WITH_OPTIONS.map((who) => ({
    value: who,
    label: t(`onsenDetail.visitedWith.${who}`),
  }));

  return (
    <>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Photos (staged locally; uploaded on Save) */}
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <View
                key={photo.kind === 'existing' ? photo.url : `new:${index}:${photo.uri}`}
                style={styles.photoThumbWrap}
              >
                <Image
                  source={{ uri: photo.kind === 'existing' ? photo.url : photo.uri }}
                  style={styles.photoThumb}
                  resizeMode="cover"
                />
                <Pressable
                  style={styles.photoRemove}
                  onPress={() => removePhoto(index)}
                  hitSlop={6}
                  accessibilityLabel={t('onsenDetail.removePhoto')}
                >
                  <Ionicons name="close" size={typography.sizes.sm} color={colors.actionPrimaryText} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS && (
              <Pressable style={[styles.photoThumb, styles.photoAdd]} onPress={handleAddPhoto}>
                <Ionicons name="add" size={typography.sizes.xxl} color={colors.actionPrimary} />
              </Pressable>
            )}
          </View>

          {/* Base */}
          <Field label={t('onsenDetail.labelRating')}>
            <RatingStars value={details.rating} onChange={(v) => setField('rating', v)} />
          </Field>

          <Field label={t('onsenDetail.labelNotes')}>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder={t('onsenDetail.notesPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
            />
          </Field>

          <Field label={t('onsenDetail.labelTransport')}>
            <OptionChips
              options={transportOptions}
              value={details.transportMode}
              onChange={(v) => setField('transportMode', v as TransportMode | null)}
            />
          </Field>

          <Field label={t('onsenDetail.labelWouldReturn')}>
            <BoolChips value={details.wouldReturn} onChange={(v) => setField('wouldReturn', v)} />
          </Field>

          {/* Show / hide detailed fields */}
          <Pressable
            style={styles.detailsToggle}
            onPress={() => setShowDetails((v) => !v)}
            hitSlop={6}
          >
            <Text style={styles.detailsToggleText}>
              {showDetails ? t('onsenDetail.hideDetails') : t('onsenDetail.showDetails')}
            </Text>
            <Ionicons
              name={showDetails ? 'chevron-up' : 'chevron-down'}
              size={typography.sizes.sm}
              color={colors.actionPrimary}
            />
          </Pressable>

          {showDetails && (
            <>
              {/* Ratings & impressions */}
              <Text style={styles.sectionHeader}>{t('onsenDetail.sectionRatings')}</Text>
              <Field label={t('onsenDetail.labelCleanliness')}>
                <RatingStars
                  value={details.cleanlinessRating}
                  onChange={(v) => setField('cleanlinessRating', v)}
                />
              </Field>
              <Field label={t('onsenDetail.labelAtmosphere')}>
                <RatingStars
                  value={details.atmosphereRating}
                  onChange={(v) => setField('atmosphereRating', v)}
                />
              </Field>
              <Field label={t('onsenDetail.labelUniqueness')}>
                <RatingStars
                  value={details.uniquenessRating}
                  onChange={(v) => setField('uniquenessRating', v)}
                />
              </Field>
              <Field label={t('onsenDetail.labelCoolDown')}>
                <RatingStars
                  value={details.coolDownRating}
                  onChange={(v) => setField('coolDownRating', v)}
                />
              </Field>
              <Field label={t('onsenDetail.labelSmell')}>
                <RatingStars
                  value={details.smellIntensityRating}
                  onChange={(v) => setField('smellIntensityRating', v)}
                />
              </Field>
              <Field label={t('onsenDetail.labelValue')}>
                <RatingStars
                  value={details.valueRating}
                  onChange={(v) => setField('valueRating', v)}
                />
              </Field>

              {/* Bath & facilities */}
              <Text style={styles.sectionHeader}>{t('onsenDetail.sectionFacilities')}</Text>
              <Field label={t('onsenDetail.labelPerceivedHeat')}>
                <OptionChips
                  options={heatOptions}
                  value={details.perceivedHeat}
                  onChange={(v) => setField('perceivedHeat', v as PerceivedHeat | null)}
                />
              </Field>
              <Field label={t('onsenDetail.labelWaterTemp')}>
                <TextInput
                  style={styles.fieldInput}
                  value={details.waterTemp ?? ''}
                  onChangeText={(text) => setField('waterTemp', text)}
                  placeholder={t('onsenDetail.waterTempPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                />
              </Field>
              <Field label={t('onsenDetail.labelSauna')}>
                <BoolChips
                  value={details.saunaUsed}
                  onChange={(v) => {
                    setField('saunaUsed', v);
                    if (v !== true) setField('saunaRating', null);
                  }}
                />
              </Field>
              {details.saunaUsed && (
                <Field label={t('onsenDetail.labelSaunaRating')}>
                  <RatingStars
                    value={details.saunaRating}
                    onChange={(v) => setField('saunaRating', v)}
                  />
                </Field>
              )}
              <Field label={t('onsenDetail.labelRestArea')}>
                <BoolChips
                  value={details.restAreaUsed}
                  onChange={(v) => {
                    setField('restAreaUsed', v);
                    if (v !== true) setField('restAreaRating', null);
                  }}
                />
              </Field>
              {details.restAreaUsed && (
                <Field label={t('onsenDetail.labelRestAreaRating')}>
                  <RatingStars
                    value={details.restAreaRating}
                    onChange={(v) => setField('restAreaRating', v)}
                  />
                </Field>
              )}
              <Field label={t('onsenDetail.labelFood')}>
                <BoolChips
                  value={details.foodUsed}
                  onChange={(v) => {
                    setField('foodUsed', v);
                    if (v !== true) setField('foodRating', null);
                  }}
                />
              </Field>
              {details.foodUsed && (
                <Field label={t('onsenDetail.labelFoodRating')}>
                  <RatingStars
                    value={details.foodRating}
                    onChange={(v) => setField('foodRating', v)}
                  />
                </Field>
              )}
              <Field label={t('onsenDetail.labelHadSoap')}>
                <BoolChips value={details.hadSoap} onChange={(v) => setField('hadSoap', v)} />
              </Field>
              <Field label={t('onsenDetail.labelMassageChair')}>
                <BoolChips
                  value={details.massageChairAvailable}
                  onChange={(v) => setField('massageChairAvailable', v)}
                />
              </Field>

              {/* Visit & company */}
              <Text style={styles.sectionHeader}>{t('onsenDetail.sectionCompany')}</Text>
              <Field label={t('onsenDetail.labelDuration')}>
                <TextInput
                  style={styles.fieldInput}
                  value={durationText}
                  onChangeText={setDurationText}
                  placeholder={t('onsenDetail.durationPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                />
              </Field>
              <Field label={t('onsenDetail.labelCrowd')}>
                <OptionChips
                  options={crowdOptions}
                  value={details.crowdLevel}
                  onChange={(v) => setField('crowdLevel', v as CrowdLevel | null)}
                />
              </Field>
              <Field label={t('onsenDetail.labelVisitedWith')}>
                <OptionChips
                  options={companyOptions}
                  value={details.visitedWith}
                  onChange={(v) => setField('visitedWith', v as VisitedWith | null)}
                />
              </Field>
              <Field label={t('onsenDetail.labelInteracted')}>
                <BoolChips
                  value={details.interactedWithLocals}
                  onChange={(v) => {
                    setField('interactedWithLocals', v);
                    if (v !== true) setField('localInteractionRating', null);
                  }}
                />
              </Field>
              {details.interactedWithLocals && (
                <Field label={t('onsenDetail.labelInteractionRating')}>
                  <RatingStars
                    value={details.localInteractionRating}
                    onChange={(v) => setField('localInteractionRating', v)}
                  />
                </Field>
              )}
            </>
          )}

          <View style={styles.spacer} />

          <Pressable
            style={[styles.saveButton, (saving || removing) && styles.buttonDisabled]}
            onPress={handleSaveVisit}
            disabled={saving || removing}
          >
            <Text style={styles.saveButtonText}>
              {saving ? t('onsenDetail.saving') : t('onsenDetail.saveButton')}
            </Text>
          </Pressable>
          <Pressable
            style={styles.cancelButton}
            onPress={() => router.back()}
            disabled={saving || removing}
          >
            <Text style={styles.cancelButtonText}>{t('onsenDetail.cancel')}</Text>
          </Pressable>
          {displayVisit && (
            <Pressable
              style={[styles.removeButton, removing && styles.buttonDisabled]}
              onPress={confirmRemoveVisit}
              disabled={saving || removing}
            >
              <Text style={styles.removeButtonText}>
                {removing ? t('onsenDetail.removing') : t('onsenDetail.removeVisit')}
              </Text>
            </Pressable>
          )}
        </ScrollView>
        {/* Blocks the form for the brief save window so the user knows work is in
            flight and isn't tempted to tap away (or catch the Remove button as the
            just-created visit's snapshot lands). */}
        <LoadingOverlay visible={saving} label={t('onsenDetail.savingVisit')} />
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    paddingBottom: spacing[10],
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  photoThumbWrap: {
    position: 'relative',
  },
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: radii.md,
    backgroundColor: colors.backgroundSecondary,
  },
  photoRemove: {
    position: 'absolute',
    top: spacing[1],
    right: spacing[1],
    width: spacing[5],
    height: spacing[5],
    borderRadius: radii.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    marginTop: spacing[3],
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textMuted,
    marginBottom: spacing[1],
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radii.md,
    padding: spacing[3],
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radii.md,
    padding: spacing[3],
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[4],
    marginTop: spacing[2],
  },
  detailsToggleText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.actionPrimary,
  },
  sectionHeader: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginTop: spacing[5],
    marginBottom: spacing[1],
  },
  spacer: {
    flex: 1,
    minHeight: spacing[4],
  },
  saveButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[4],
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  cancelButton: {
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[2],
  },
  cancelButtonText: {
    color: colors.textMuted,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
  },
  removeButton: {
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[2],
  },
  removeButtonText: {
    color: colors.destructive,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
  },
});
