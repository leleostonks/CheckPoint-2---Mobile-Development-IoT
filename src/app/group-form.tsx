import { useLocalSearchParams } from 'expo-router';

import { GroupFormScreen } from '../screens/GroupFormScreen';

type GroupFormRouteParams = {
  groupId?: string;
};

export default function GroupFormRoute() {
  const { groupId } = useLocalSearchParams<GroupFormRouteParams>();
  return <GroupFormScreen groupId={groupId ?? null} />;
}
