import { useLocalSearchParams } from 'expo-router';

import { GroupMembersScreen } from '../../screens/GroupMembersScreen';

type GroupMembersRouteParams = {
  groupId: string;
};

export default function GroupMembersRoute() {
  const { groupId } = useLocalSearchParams<GroupMembersRouteParams>();
  return <GroupMembersScreen groupId={groupId} />;
}
