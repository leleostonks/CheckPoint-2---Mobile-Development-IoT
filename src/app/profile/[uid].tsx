import { useLocalSearchParams } from 'expo-router';

import { ProfileScreen } from '../../screens/ProfileScreen';

type ProfileRouteParams = {
  uid: string;
};

export default function ProfileRoute() {
  const { uid } = useLocalSearchParams<ProfileRouteParams>();
  return <ProfileScreen uid={uid} />;
}
