import { client, check } from "./supabase";
import type {
  Profile,
  Conversation,
  Message,
  Attachment,
  Status,
} from "../types";
export const profileFields = "id,name,username,avatar_url,bio,created_at";
export async function getOnboardingProfile(): Promise<Profile & { onboarding_completed_at: string | null }> {
  const { data, error } = await client().rpc("get_onboarding_profile");
  check(error);
  if (!data?.id) throw new Error("Não foi possível carregar seu perfil. Tente novamente.");
  return data;
}
export function validateAvatar(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Escolha uma foto JPG, PNG ou WebP.");
  if (!file.size || file.size > 5 * 1024 * 1024)
    throw new Error("A foto deve ter até 5 MB.");
}
export async function uploadAvatar(user: string, file: File) {
  validateAvatar(file);
  // Decode the image before uploading; extension and dimensions don't trust its filename.
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 768 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Não foi possível preparar a foto.")), "image/webp", 0.86));
    const extension = blob.type === "image/webp" ? "webp" : "png";
    const path = `${user}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client().storage.from("avatars").upload(path, blob, { contentType: blob.type, upsert: false });
    check(error);
    return path;
  } finally { image.close(); }
}
export async function completeOnboarding(name: string, bio: string, avatarPath: string | null, googlePhoto = false) {
  const { data, error } = await client().rpc("complete_profile_onboarding", { p_name: name, p_bio: bio, p_avatar_path: avatarPath, p_google_photo: googlePhoto });
  check(error);
  return data as Profile & { onboarding_completed_at: string | null };
}
export async function cleanupAvatar(avatar: string | null) {
  if (!avatar?.startsWith("storage://avatars/")) return;
  // RLS permits only owned objects that no profile currently references.
  await client().storage.from("avatars").remove([avatar.slice("storage://avatars/".length)]);
}
export async function getProfile(id: string): Promise<Profile> {
  const { data, error } = await client()
    .from("profiles")
    .select(profileFields)
    .eq("id", id)
    .single();
  check(error);
  const identifier = await client().rpc("get_my_digitalx_id");
  check(identifier.error);
  return { ...data, digitalx_id: identifier.data } as Profile;
}
export const validDigitalxId = (value: string) => value.length === 9 && /^1[0-9]{8}$/.test(value);
export async function findUserById(id: string): Promise<Profile | null> {
  if (!validDigitalxId(id)) throw new Error("Informe 9 dígitos começando por 1.");
  const { data, error } = await client().rpc("find_user_by_digitalx_id", { p_id: id });
  check(error);
  if (data?.error === "rate_limited")
    throw new Error(`Limite de buscas atingido. Tente em ${data.retry_after} segundos.`);
  return data?.user ? { ...data.user, username: "", bio: "" } : null;
}
export async function contacts(query = ""): Promise<Profile[]> {
  const { data, error } = await client()
    .from("profiles")
    .select(profileFields)
    .ilike("name", `%${query.replace(/[%_]/g, "")}%`)
    .order("name")
    .limit(50);
  check(error);
  return data as Profile[];
}
export async function conversations(_userId: string): Promise<Conversation[]> {
  const { data, error } = await client().rpc("list_conversations");
  check(error);
  return data as Conversation[];
}
export async function history(id: string, before?: string): Promise<Message[]> {
  let q = client()
    .from("messages")
    .select(`*,sender:profiles(${profileFields}),attachments(*)`)
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  check(error);
  return (data as unknown as Message[]).reverse();
}
export async function createConversation(
  title: string,
  ids: string[],
  group: boolean,
): Promise<string> {
  const { data, error } = await client().rpc("create_conversation", {
    p_title: title,
    p_participants: ids,
    p_group: group,
  });
  check(error);
  return data as string;
}
export async function markRead(id: string) {
  const { error } = await client().rpc("mark_read", { p_conversation: id });
  check(error);
}
const allowed =
  /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|ogg|webm|wav)|application\/(pdf|zip|x-zip-compressed|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation))|text\/plain)$/;
export function validateFile(file: File) {
  if (file.size > 25 * 1024 * 1024)
    throw new Error("O arquivo deve ter no máximo 25 MB.");
  if (!allowed.test(file.type))
    throw new Error(
      "Tipo de arquivo não permitido. Use imagem, vídeo, áudio, PDF, ZIP, TXT ou documento Office.",
    );
  if (!file.size) throw new Error("Este arquivo está vazio.");
}
export async function send(
  id: string,
  user: string,
  body: string,
  file?: File,
) {
  let attachment: Omit<Attachment, "id"> | undefined;
  if (file) {
    validateFile(file);
    const path = `${id}/${user}/${crypto.randomUUID()}`;
    const { error } = await client()
      .storage.from("chat-files")
      .upload(path, file, { contentType: file.type, upsert: false });
    check(error);
    attachment = {
      name: file.name,
      path,
      mime_type: file.type,
      size: file.size,
    };
  }
  const { error } = await client().rpc("send_message", {
    p_conversation: id,
    p_body: body.trim(),
    p_attachment: attachment ?? null,
  });
  if (error && attachment)
    await client().storage.from("chat-files").remove([attachment.path]);
  check(error);
}
export async function signedFile(path: string, bucket = "chat-files") {
  const { data, error } = await client()
    .storage.from(bucket)
    .createSignedUrl(path, 60);
  check(error);
  return data!.signedUrl;
}
export async function downloadFile(path: string) {
  const { data, error } = await client().storage.from("chat-files").download(path);
  check(error);
  return data!;
}
export async function updateProfile(
  id: string,
  name: string,
  username: string,
  bio: string,
) {
  const { error } = await client()
    .from("profiles")
    .update({ name, username, bio })
    .eq("id", id);
  check(error);
}
export async function groupAction(
  id: string,
  action: string,
  user?: string,
  title?: string,
  description?: string,
) {
  const { error } = await client().rpc("manage_group", {
    p_conversation: id,
    p_action: action,
    p_user: user ?? null,
    p_title: title ?? null,
    p_description: description ?? null,
  });
  check(error);
}
export async function listStatuses(): Promise<Status[]> {
  const { data, error } = await client()
    .from("statuses")
    .select(`*,author:profiles(${profileFields})`)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);
  check(error);
  return data as unknown as Status[];
}
export async function publishStatus(user: string, file: File, caption: string) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error("Selecione uma imagem JPG, PNG ou WebP.");
  validateFile(file);
  const path = `${user}/${crypto.randomUUID()}`;
  const { error } = await client()
    .storage.from("status-files")
    .upload(path, file, { contentType: file.type });
  check(error);
  const { error: e } = await client()
    .from("statuses")
    .insert({ user_id: user, path, caption });
  if (e) await client().storage.from("status-files").remove([path]);
  check(e);
}
