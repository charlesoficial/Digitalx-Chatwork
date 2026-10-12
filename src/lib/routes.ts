export const paths: Record<string, string> = {
  Conversas: "conversations",
  Grupos: "groups",
  Contatos: "contacts",
  Arquivos: "files",
  Chamadas: "calls",
  Status: "status",
  Configurações: "settings",
  Perfil: "profile",
};
export function route() {
  const parts = location.pathname.split("/").filter(Boolean);
  return {
    screen:
      parts[1] === "chat"
        ? "Conversas"
        : (Object.keys(paths).find((k) => paths[k] === parts[1]) ??
          "Conversas"),
    chat: parts[1] === "chat" ? (parts[2] ?? null) : null,
  };
}
export function move(screen: string, demo: boolean, chat?: string) {
  history.pushState(
    null,
    "",
    `${demo ? "/preview" : "/app"}/${chat ? "chat/" + chat : (paths[screen] ?? "conversations")}`,
  );
}
