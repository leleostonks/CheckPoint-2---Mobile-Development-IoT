import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProfilesById } from '../types/user';
import { colors, radius, spacing } from '../utils/theme';
import { GroupMemberItem } from './GroupMemberItem';

type MemberPickerModalProps = {
  visible: boolean;
  title: string;
  memberIds: readonly string[];
  profiles: ProfilesById;
  /** Exibe a opção "Todos do grupo" (seleção `null`). */
  allowEveryone?: boolean;
  onSelect: (memberId: string | null) => void;
  onClose: () => void;
};

export function MemberPickerModal({
  visible,
  title,
  memberIds,
  profiles,
  allowEveryone = false,
  onSelect,
  onClose,
}: MemberPickerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <View style={styles.sheet}>
        <Text style={styles.title}>{title}</Text>
        {allowEveryone ? (
          <Pressable style={styles.everyone} onPress={() => onSelect(null)} accessibilityRole="button">
            <Text style={styles.everyoneText}>Todos do grupo</Text>
          </Pressable>
        ) : null}
        <FlatList
          data={memberIds}
          keyExtractor={(uid) => uid}
          renderItem={({ item }) => <GroupMemberItem uid={item} profile={profiles[item]} onPress={onSelect} />}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum outro integrante no grupo.</Text>}
        />
        <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    maxHeight: '65%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  everyone: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  everyoneText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
  },
  empty: {
    padding: spacing.lg,
    color: colors.textMuted,
  },
  cancel: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 16,
  },
});
