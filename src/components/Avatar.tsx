import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { initialsOf } from '../utils/formatters';
import { colors } from '../utils/theme';

type AvatarProps = {
  uri: string | null | undefined;
  name?: string;
  size?: number;
  variant?: 'user' | 'group';
};

/** Foto circular com imagem padrão quando a URL não existe ou falha ao carregar. */
function AvatarComponent({ uri, name = '', size = 44, variant = 'user' }: AvatarProps) {
  // Guarda qual URL falhou: ao trocar de foto, a nova URL é tentada automaticamente.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = uri !== null && uri !== undefined && failedUri === uri;

  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, dimension]}
        onError={() => setFailedUri(uri)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const initials = initialsOf(name);
  return (
    <View style={[styles.placeholder, dimension]} accessibilityLabel="Imagem padrão">
      {initials && variant === 'user' ? (
        <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
      ) : (
        <Ionicons name={variant === 'group' ? 'people' : 'person'} size={size * 0.55} color={colors.primary} />
      )}
    </View>
  );
}

export const Avatar = memo(AvatarComponent);

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.border,
  },
  placeholder: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.primary,
    fontWeight: '700',
  },
});
