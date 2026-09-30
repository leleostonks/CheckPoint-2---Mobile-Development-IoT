import { useLocalSearchParams } from 'expo-router';

import { UsersScreen } from '../screens/UsersScreen';
import { MAX_GROUP_LIMIT } from '../utils/groupValidation';

type UsersRouteParams = {
  mode?: 'direct' | 'select';
  /** Ids já selecionados, separados por vírgula (modo `select`). */
  selected?: string;
  /** Quantidade máxima selecionável (modo `select`). */
  max?: string;
};

export default function UsersRoute() {
  const { mode, selected, max } = useLocalSearchParams<UsersRouteParams>();

  if (mode === 'select') {
    const parsedMax = Number(max);
    return (
      <UsersScreen
        mode="select"
        initialSelection={selected ? selected.split(',').filter(Boolean) : []}
        maxSelectable={Number.isInteger(parsedMax) && parsedMax >= 0 ? parsedMax : MAX_GROUP_LIMIT - 1}
      />
    );
  }
  return <UsersScreen mode="direct" />;
}
