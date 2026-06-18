import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Alert,
  TextInput,
  ActionSheetIOS,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import type { OnsenDocument, UserDocument, VisitDocument, TransportMode } from '@kyuhachi/shared';
import { COLLECTIONS, SUBCOLLECTIONS, TRANSPORT_MODES } from '@kyuhachi/shared';
import { useAuth } from '../../src/context/AuthContext';
import { colors, spacing, typography, radii } from '../../src/theme';

type OnsenWithId = OnsenDocument & { id: string };

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function OnsenDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [onsen, setOnsen] = useState<OnsenWithId | null>(null);
  const [loading, setLoading] = useState(true);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [visitData, setVisitData] = useState<VisitDocument | null>(null);
  const [marking, setMarking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form state for visit editing
  const [notes, setNotes] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [waterTemp, setWaterTemp] = useState('');
  const [duration, setDuration] = useState('');
  const [transportMode, setTransportMode] = useState<TransportMode | null>(null);

  // Listen to onsen document
  useEffect(() => {
    if (!id) return;
    const unsubscribe = firestore()
      .collection(COLLECTIONS.ONSENS)
      .doc(id)
      .onSnapshot(
        (doc) => {
          setOnsen(doc.exists() ? { id: doc.id, ...(doc.data() as OnsenDocument) } : null);
          setLoading(false);
        },
        () => {
          setOnsen(null);
          setLoading(false);
        }
      );
    return unsubscribe;
  }, [id]);

  // Listen to user's default challenge and visit state
  useEffect(() => {
    if (!user || !id) return;

    let unsubVisit: (() => void) | null = null;

    const unsubUser = firestore()
      .collection(COLLECTIONS.USERS)
      .doc(user.uid)
      .onSnapshot((doc) => {
        const data = doc.data() as UserDocument | undefined;
        const defChallengeId = data?.defaultChallengeId ?? null;
        setChallengeId(defChallengeId);

        unsubVisit?.();
        unsubVisit = null;

        if (!defChallengeId) {
          setVisitData(null);
          return;
        }

        unsubVisit = firestore()
          .collection(COLLECTIONS.USERS)
          .doc(user.uid)
          .collection(SUBCOLLECTIONS.CHALLENGES)
          .doc(defChallengeId)
          .collection(SUBCOLLECTIONS.VISITS)
          .doc(id)
          .onSnapshot((visitDoc) => {
            if (visitDoc.exists()) {
              const data = visitDoc.data() as VisitDocument;
              setVisitData(data);
              setNotes(data.notes ?? '');
              setRating(data.structuredData.rating);
              setWaterTemp(data.structuredData.waterTemp ?? '');
              setDuration(data.structuredData.duration != null ? String(data.structuredData.duration) : '');
              setTransportMode(data.structuredData.transportMode ?? null);
            } else {
              setVisitData(null);
            }
          });
      });

    return () => {
      unsubVisit?.();
      unsubUser();
    };
  }, [user, id]);

  async function handleMarkVisited() {
    if (!user || !challengeId || !id) return;
    setMarking(true);
    try {
      await firestore()
        .collection(COLLECTIONS.USERS)
        .doc(user.uid)
        .collection(SUBCOLLECTIONS.CHALLENGES)
        .doc(challengeId)
        .collection(SUBCOLLECTIONS.VISITS)
        .doc(id)
        .set({
          visitedAt: firestore.FieldValue.serverTimestamp(),
          notes: null,
          photoUrl: null,
          structuredData: {
            rating: null,
            waterTemp: null,
            duration: null,
            transportMode: null,
          },
          createdAt: firestore.FieldValue.serverTimestamp(),
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : '');
    } finally {
      setMarking(false);
    }
  }

  async function handleSaveVisit() {
    if (!user || !challengeId || !id) return;
    setSaving(true);
    try {
      await firestore()
        .collection(COLLECTIONS.USERS)
        .doc(user.uid)
        .collection(SUBCOLLECTIONS.CHALLENGES)
        .doc(challengeId)
        .collection(SUBCOLLECTIONS.VISITS)
        .doc(id)
        .update({
          notes: notes || null,
          structuredData: {
            rating,
            waterTemp: waterTemp || null,
            duration: duration ? Number(duration) : null,
            transportMode,
          },
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : '');
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(uri: string) {
    if (!user || !challengeId || !id) return;
    setUploading(true);
    try {
      const ref = storage().ref(`visits/${user.uid}/${challengeId}_${id}/photo.jpg`);
      await ref.putFile(uri);
      const downloadUrl = await ref.getDownloadURL();
      await firestore()
        .collection(COLLECTIONS.USERS)
        .doc(user.uid)
        .collection(SUBCOLLECTIONS.CHALLENGES)
        .doc(challengeId)
        .collection(SUBCOLLECTIONS.VISITS)
        .doc(id)
        .update({
          photoUrl: downloadUrl,
          updatedAt: firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : '');
    } finally {
      setUploading(false);
    }
  }

  function handleAddPhoto() {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [t('onsenDetail.cancel'), t('onsenDetail.takePhoto'), t('onsenDetail.chooseFromLibrary')],
        cancelButtonIndex: 0,
      },
      async (buttonIndex) => {
        let result: ImagePicker.ImagePickerResult | null = null;
        if (buttonIndex === 1) {
          result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
        } else if (buttonIndex === 2) {
          result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        }
        if (result && !result.canceled && result.assets[0]) {
          uploadPhoto(result.assets[0].uri);
        }
      },
    );
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true }} />
        <ActivityIndicator style={styles.centered} />
      </>
    );
  }

  if (!onsen) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerShown: true }} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('onsenDetail.notFound')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: onsen.name, headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {onsen.imageUrl && (
          <Image
            source={{ uri: onsen.imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        )}

        <View style={styles.header}>
          <Text style={styles.name}>{onsen.name}</Text>
          <Text style={styles.area}>
            {onsen.areaName}　{onsen.prefecture}
          </Text>
          {!onsen.isActive && (
            <View style={styles.archivedBadge}>
              <Text style={styles.archivedText}>{t('onsenDetail.archived')}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <InfoRow label={t('onsenDetail.labelAddress')} value={onsen.address} />
          {onsen.phone && <InfoRow label={t('onsenDetail.labelPhone')} value={onsen.phone} />}
          {onsen.admissionFee && <InfoRow label={t('onsenDetail.labelFee')} value={onsen.admissionFee} />}
          {onsen.springQuality && <InfoRow label={t('onsenDetail.labelSpringQuality')} value={onsen.springQuality} />}
          {onsen.businessHours && (
            <InfoRow label={t('onsenDetail.labelHours')} value={onsen.businessHours.raw} />
          )}
        </View>

        {onsen.websiteUrl && (
          <View style={styles.section}>
            <Pressable onPress={() => Linking.openURL(onsen.websiteUrl!)}>
              <Text style={styles.websiteLink}>{onsen.websiteUrl}</Text>
            </Pressable>
          </View>
        )}

        {challengeId && !visitData && (
          <View style={styles.visitSection}>
            <Pressable
              style={[styles.visitButton, marking && styles.visitButtonDisabled]}
              onPress={handleMarkVisited}
              disabled={marking}
            >
              <Text style={styles.visitButtonText}>{t('onsenDetail.markVisited')}</Text>
            </Pressable>
          </View>
        )}

        {challengeId && visitData && (
          <View style={styles.visitDetailSection}>
            <Text style={styles.visitedHeader}>{t('onsenDetail.visited')}</Text>

            {visitData.photoUrl && (
              <Image
                source={{ uri: visitData.photoUrl }}
                style={styles.visitPhoto}
                resizeMode="cover"
              />
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
                  <Text style={[styles.star, star <= (rating ?? 0) && styles.starFilled]}>
                    ★
                  </Text>
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

            <Pressable
              style={[styles.saveButton, saving && styles.visitButtonDisabled]}
              onPress={handleSaveVisit}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? t('onsenDetail.saving') : t('onsenDetail.saveButton')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing[10],
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: typography.sizes.md,
    color: colors.textMuted,
  },
  image: {
    width: '100%',
    height: 220,
    backgroundColor: colors.backgroundSecondary,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  name: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[1],
  },
  area: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
  },
  archivedBadge: {
    alignSelf: 'flex-start',
    marginTop: spacing[2],
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.sm,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  archivedText: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
  },
  section: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
    paddingBottom: spacing[2],
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: spacing[2],
  },
  infoLabel: {
    width: 80,
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  infoValue: {
    flex: 1,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  websiteLink: {
    fontSize: typography.sizes.sm,
    color: colors.actionPrimary,
    textDecorationLine: 'underline',
    paddingVertical: spacing[2],
  },
  visitSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[6],
    alignItems: 'center',
  },
  visitButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[4],
  },
  visitButtonDisabled: {
    opacity: 0.4,
  },
  visitButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  visitDetailSection: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
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
  visitedHeader: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing[4],
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
  saveButton: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[3],
    alignItems: 'center',
    marginTop: spacing[4],
  },
  saveButtonText: {
    color: colors.actionPrimaryText,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
});
