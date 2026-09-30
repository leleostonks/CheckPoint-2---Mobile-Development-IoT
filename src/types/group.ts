export type NotificationPolicy =
  | 'all_group_messages'
  | 'mentioned_members'
  | 'direct_messages_only'
  | 'disabled';

export type ChatGroup = {
  id: string;
  name: string;
  photoUrl: string;
  ownerId: string;
  memberIds: string[];
  memberLimit: number;
  notificationPolicy: NotificationPolicy;
  updatedBy: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateGroupInput = {
  name: string;
  memberIds: string[];
  memberLimit: number;
  notificationPolicy: NotificationPolicy;
};

export type UpdateGroupInput = {
  name: string;
  memberLimit: number;
  notificationPolicy: NotificationPolicy;
  addMemberIds: string[];
  removeMemberIds: string[];
};
