export type Profile = {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  bio: string;
  created_at?: string;
  digitalx_id?: string;
};
export type Conversation = {
  id: string;
  title: string | null;
  is_group: boolean;
  is_main?: boolean;
  description: string;
  updated_at: string;
  members: Member[];
  last?: Message;
  unread: number;
};
export type Member = {
  user_id: string;
  role: "owner" | "admin" | "member";
  last_read_at: string;
  profile: Profile;
};
export type Attachment = {
  id: string;
  name: string;
  path: string;
  mime_type: string;
  size: number;
  url?: string;
};
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender: Profile;
  attachments: Attachment[];
};
export type Status = {
  id: string;
  user_id: string;
  path: string;
  caption: string;
  created_at: string;
  expires_at: string;
  author: Profile;
  url?: string;
};
