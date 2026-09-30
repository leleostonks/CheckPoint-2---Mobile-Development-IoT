import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { pickSquareImage } from '../services/imageService';
import type { PickedImage } from '../types/user';
import { getErrorMessage } from '../utils/errorMessages';
import { colors, spacing } from '../utils/theme';
import { Avatar } from './Avatar';

type PhotoPickerProps = {
  image: PickedImage | null;
  currentUrl?: string;
  name: string;
  variant: 'user' | 'group';
  onChange: (image: PickedImage | null) => void;
  disabled?: boolean;
};

export function PhotoPicker({ image, currentUrl, name, variant, onChange, disabled = false }: PhotoPickerProps) {
  const [error, setError] = useState<string | null>(null);

  const handlePick = useCallback(async () => {
    setError(null);
    try {
      const picked = await pickSquareImage();
      if (picked) {
        onChange(picked);
      }
    } catch (pickError) {
      setError(getErrorMessage(pickError, 'Não foi possível abrir a galeria.'));
    }
  }, [onChange]);

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handlePick}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Selecionar foto"
      >
        <Avatar uri={image?.uri ?? currentUrl} name={name} size={96} variant={variant} />
        <View style={styles.badge}>
          <Ionicons name="camera" size={16} color="#FFFFFF" />
        </View>
      </Pressable>
      <Text style={styles.caption}>{image || currentUrl ? 'Toque para trocar a foto' : 'Toque para escolher uma foto'}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  caption: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: 13,
  },
  error: {
    marginTop: spacing.xs,
    color: colors.danger,
    fontSize: 13,
    textAlign: 'center',
  },
});
