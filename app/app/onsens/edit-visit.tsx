import { useState, useEffect, useRef } from 'react';
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
import { doc, updateDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { ref, putFile, getDownloadURL } from '@react-native-firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import type { TransportMode } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS, TRANSPORT_MODES } from '@kyuhachi/shared';
import { useAuth } from '@/context/AuthContext';
import { useVisit } from '@/hooks/useVisit';
import { db, storage } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { colors, spacing, typography, radii } from '@/theme';

export default function EditVisit() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { challengeId, visit, loading } = useVisit(id);

  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [waterTemp, setWaterTemp] = useState('');
  const [duration, setDuration] = useState('');
  const [transportMode, setTransportMode] = useState<TransportMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const seeded = useRef(false);

  // Seed the form from the visit once it first loads. The ref guard means later
  // live snapshots (e.g. a photo URL landing) don't clobber in-progress edits.
  useEffect(() => {
    if (!visit || seeded.current) return;
    seeded.current = true;
    setNotes(visit.notes ?? '');
    setRating(visit.structuredData.rating);
    setWaterTemp(visit.structuredData.waterTemp ?? '');
    setDuration(
      visit.structuredData.duration != null ? String(visit.structuredData.duration) : ''
    );
    setTransportMode(visit.structuredData.transportMode ?? null);
  }, [visit]);

  // If the visit is deleted elsewhere while the modal is open, dismiss.
  useEffect(() => {
    if (!loading && !visit) router.back();
  }, [loading, visit, router]);

  async function handleSaveVisit() {
    if (!user || !challengeId || !id || !visit) return;
    setSaving(true);
    try {
      await updateDoc(
        doc(
          db,
          COLLECTIONS.USERS,
          user.uid,
          SUBCOLLECTIONS.CHALLENGES,
          challengeId,
          SUBCOLLECTIONS.VISITS,
          id
        ),
        {
          notes: notes || null,
          structuredData: {
            rating,
            waterTemp: waterTemp || null,
            duration: duration ? Number(duration) : null,
            transportMode,
          },
          updatedAt: serverTimestamp(),
        }
      );
      router.back();
    } catch (error) {
      Alert.alert(t('common.errorTitle'), t(firebaseErrorKey(error)));
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(uri: string) {
    if (!user || !challengeId || !id) return;
    setUploading(true);
    try {
      const photoRef = ref(storage, `visits/${user.uid}/${challengeId}_${id}/photo.jpg`);
      await putFile(photoRef, uri);
      const downloadUrl = await getDownloadURL(photoRef);
      await updateDoc(
        doc(
          db,
          COLLECTIONS.USERS,
          user.uid,
          SUBCOLLECTIONS.CHALLENGES,
          challengeId,
          SUBCOLLECTIONS.VISITS,
          id
        ),
        {
          photoUrl: downloadUrl,
          updatedAt: serverTimestamp(),
        }
      );
    } catch (error) {
      Alert.alert(t('common.errorTitle'), t(firebaseErrorKey(error)));
    } finally {
      setUploading(false);
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
          {visit.photoUrl && (
            <Image source={{ uri: visit.photoUrl }} style={styles.visitPhoto} resizeMode="cover" />
          )}
          {uploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color={colors.actionPrimary} />
              <Text style={styles.uploadingText}>{t('onsenDetail.uploading')}</Text>
            </View>
          ) : (
            <Pressable style={styles.addPhotoButton} onPress={handleAddPhoto}>
              <Text style={styles.addPhotoText}>{t('onsenDetail.addPhoto')}</Text>
            </Pressable>
          )}

          <Text style={styles.fieldLabel}>{t('onsenDetail.labelRating')}</Text>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => setRating(rating === star ? null : star)}
                hitSlop={4}
              >
                <Text style={[styles.star, star <= (rating ?? 0) && styles.starFilled]}>★</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{t('onsenDetail.labelNotes')}</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('onsenDetail.notesPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            multiline
          />

          <Text style={styles.fieldLabel}>{t('onsenDetail.labelWaterTemp')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={waterTemp}
            onChangeText={setWaterTemp}
            placeholder={t('onsenDetail.waterTempPlaceholder')}
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={styles.fieldLabel}>{t('onsenDetail.labelDuration')}</Text>
          <TextInput
            style={styles.fieldInput}
            value={duration}
            onChangeText={setDuration}
            placeholder={t('onsenDetail.durationPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            keyboardType="numeric"
          />

          <Text style={styles.fieldLabel}>{t('onsenDetail.labelTransport')}</Text>
          <View style={styles.transportRow}>
            {TRANSPORT_MODES.map((mode) => {
              const selected = transportMode === mode;
              return (
                <Pressable
                  key={mode}
                  style={[styles.transportChip, selected && styles.transportChipSelected]}
                  onPress={() => setTransportMode(selected ? null : mode)}
                >
                  <Text
                    style={[
                      styles.transportChipText,
                      selected && styles.transportChipTextSelected,
                    ]}
                  >
                    {t(`onsenDetail.transport.${mode}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.spacer} />

          <Pressable
            style={[styles.saveButton, saving && styles.buttonDisabled]}
            onPress={handleSaveVisit}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? t('onsenDetail.saving') : t('onsenDetail.saveButton')}
            </Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelButtonText}>{t('onsenDetail.cancel')}</Text>
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
  visitPhoto: {
    width: '100%',
    height: 200,
    borderRadius: radii.md,
    marginBottom: spacing[3],
    backgroundColor: colors.backgroundSecondary,
  },
  addPhotoButton: {
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: radii.md,
    borderStyle: 'dashed',
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  addPhotoText: {
    fontSize: typography.sizes.sm,
    color: colors.actionPrimary,
    fontWeight: typography.weights.medium,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
  },
  uploadingText: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  fieldLabel: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    color: colors.textMuted,
    marginBottom: spacing[1],
    marginTop: spacing[3],
  },
  starRow: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  star: {
    fontSize: typography.sizes.xxl,
    color: colors.backgroundSecondary,
  },
  starFilled: {
    color: colors.actionPrimary,
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
  transportRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[1],
    marginBottom: spacing[4],
  },
  transportChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.separator,
    backgroundColor: colors.background,
  },
  transportChipSelected: {
    backgroundColor: colors.actionPrimary,
    borderColor: colors.actionPrimary,
  },
  transportChipText: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
  },
  transportChipTextSelected: {
    color: colors.actionPrimaryText,
    fontWeight: typography.weights.medium,
  },
  spacer: {
    flex: 1,
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
});
