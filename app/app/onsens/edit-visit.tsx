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
  updateDoc,
  deleteDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
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
import { useVisit } from '@/hooks/useVisit';
import { db, storage } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { RatingStars } from '@/components/visit/RatingStars';
import { OptionChips, type ChipOption } from '@/components/visit/OptionChips';
import { BoolChips } from '@/components/visit/BoolChips';
import { colors, spacing, typography, radii } from '@/theme';

const MAX_PHOTOS = 6;

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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { challengeId, visit, loading } = useVisit(id);

  const [notes, setNotes] = useState('');
  const [details, setDetails] = useState<VisitStructuredData>({ ...EMPTY_VISIT_STRUCTURED_DATA });
  const [durationText, setDurationText] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const seeded = useRef(false);

  // Seed the form from the visit once it first loads. The ref guard means later
  // live snapshots (e.g. a photo URL landing) don't clobber in-progress edits.
  // Spreading over the empty record fills any field a pre-existing doc lacks.
  useEffect(() => {
    if (!visit || seeded.current) return;
    seeded.current = true;
    setNotes(visit.notes ?? '');
    setDetails({ ...EMPTY_VISIT_STRUCTURED_DATA, ...visit.structuredData });
    setDurationText(
      visit.structuredData?.duration != null ? String(visit.structuredData.duration) : ''
    );
  }, [visit]);

  // Dismiss when there's nothing to edit: the visit was deleted elsewhere while
  // the modal is open, or the modal was re-presented by navigation state
  // restoration on reload (without its `id` param, or before auth restored). In
  // the restore case there may be no underlying screen to pop to, so fall back
  // to the home route instead of a no-op back().
  useEffect(() => {
    if (loading || visit) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [loading, visit, router]);

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
    setSaving(true);
    try {
      await updateDoc(docRef, {
        notes: notes.trim() || null,
        structuredData: {
          ...details,
          waterTemp: details.waterTemp?.trim() ? details.waterTemp : null,
          duration: durationText ? Number(durationText) : null,
        },
        updatedAt: serverTimestamp(),
      });
      router.back();
    } catch (error) {
      Alert.alert(t('common.errorTitle'), t(firebaseErrorKey(error)));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveVisit() {
    const docRef = visitRef();
    if (!docRef) return;
    setRemoving(true);
    try {
      await deleteDoc(docRef);
      // The visit subscription drops to null, which dismisses the modal via the
      // effect above. The onVisitDeleted Function cleans up any photos. Only
      // re-enable the button on failure, since success unmounts this screen.
    } catch (error) {
      setRemoving(false);
      Alert.alert(t('onsenDetail.errorRemove'), t(firebaseErrorKey(error)));
    }
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

  async function uploadPhoto(uri: string) {
    const docRef = visitRef();
    if (!docRef || !user || !challengeId || !id) return;
    setUploading(true);
    try {
      // A per-upload timestamped name keeps every photo under the visit's folder
      // distinct; onVisitDeleted clears the whole folder by prefix on delete.
      const name = `photo_${Date.now()}.jpg`;
      const photoRef = ref(storage, `visits/${user.uid}/${challengeId}_${id}/${name}`);
      await putFile(photoRef, uri);
      const downloadUrl = await getDownloadURL(photoRef);
      await updateDoc(docRef, {
        photoUrls: arrayUnion(downloadUrl),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      Alert.alert(t('common.errorTitle'), t(firebaseErrorKey(error)));
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(url: string) {
    const docRef = visitRef();
    if (!docRef) return;
    try {
      await updateDoc(docRef, {
        photoUrls: arrayRemove(url),
        updatedAt: serverTimestamp(),
      });
      // Best-effort delete of the Storage object. If it fails the orphan is
      // swept up when the visit itself is deleted (onVisitDeleted, by prefix).
      await deleteObject(refFromURL(storage, url)).catch(() => {});
    } catch (error) {
      Alert.alert(t('common.errorTitle'), t(firebaseErrorKey(error)));
    }
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
          uploadPhoto(result.assets[0].uri);
        }
      }
    );
  }

  if (loading || !visit) {
    return (
      <>
        <Stack.Screen options={{ title: t('onsenDetail.editTitle') }} />
        <ActivityIndicator style={styles.centered} />
      </>
    );
  }

  const photoUrls = visit.photoUrls ?? [];
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
      <Stack.Screen options={{ title: t('onsenDetail.editTitle') }} />
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
          {/* — Photos — */}
          <View style={styles.photoGrid}>
            {photoUrls.map((url) => (
              <View key={url} style={styles.photoThumbWrap}>
                <Image source={{ uri: url }} style={styles.photoThumb} resizeMode="cover" />
                <Pressable
                  style={styles.photoRemove}
                  onPress={() => removePhoto(url)}
                  hitSlop={6}
                  accessibilityLabel={t('onsenDetail.removePhoto')}
                >
                  <Ionicons name="close" size={typography.sizes.sm} color={colors.actionPrimaryText} />
                </Pressable>
              </View>
            ))}
            {photoUrls.length < MAX_PHOTOS &&
              (uploading ? (
                <View style={[styles.photoThumb, styles.photoAdd]}>
                  <ActivityIndicator size="small" color={colors.actionPrimary} />
                </View>
              ) : (
                <Pressable style={[styles.photoThumb, styles.photoAdd]} onPress={handleAddPhoto}>
                  <Ionicons name="add" size={typography.sizes.xxl} color={colors.actionPrimary} />
                </Pressable>
              ))}
          </View>

          {/* — Base — */}
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

          {/* — Show / hide detailed fields — */}
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
          <Pressable
            style={[styles.removeButton, removing && styles.buttonDisabled]}
            onPress={confirmRemoveVisit}
            disabled={saving || removing}
          >
            <Text style={styles.removeButtonText}>
              {removing ? t('onsenDetail.removing') : t('onsenDetail.removeVisit')}
            </Text>
          </Pressable>
        </ScrollView>
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
