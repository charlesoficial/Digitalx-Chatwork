import type { Profile, Conversation, Message } from "../types";
export const demoProfile: Profile = {
  id: "demo-me",
  name: "Lucas",
  username: "lucas.digitalx",
  avatar_url: null,
  bio: "Ideias ganham força quando a gente se conecta.",
};
export const people: Profile[] = [
  demoProfile,
  ...["Matheus", "Ana", "Pedro", "Rafael", "Julia", "Carlos", "Bruno"].map(
    (name, i) => ({
      id: `demo-${i}`,
      name,
      username: name.toLowerCase() + ".digitalx",
      avatar_url: null,
      bio: "Juntos somos mais fortes.",
    }),
  ),
];
const member = people.slice(0, 5).map((profile, i) => ({
  user_id: profile.id,
  role: i === 0 ? ("owner" as const) : ("member" as const),
  last_read_at: "2026-10-11T18:00:00Z",
  profile,
}));
const texts = [
  "E aí, tropa! 👊\nJá viram a ideia nova do projeto?",
  "Vi sim! Ficou brabo demais 🔥",
  "Bora testar hoje?",
  "Tô dentro! 🚀",
  "Já tô ajustando aqui no dev.",
  "Fechou! Vamos junto. 💪🏻",
  "Qual o próximo passo?",
  "Reunião às 16h no Discord.\nJá deixei tudo no drive. ✅",
];
const authors = [
  { ...demoProfile, id: "demo-lucas" },
  demoProfile,
  people[1],
  people[2],
  people[3],
  demoProfile,
  people[4],
  demoProfile,
];
export const demoMessages: Message[] = texts.map((body, i) => ({
  id: `msg-${i}`,
  conversation_id: "demo-crew",
  sender_id: authors[i].id,
  body,
  created_at: `2026-10-11T18:${String(20 + i * 3).padStart(2, "0")}:00Z`,
  sender: authors[i],
  attachments: [],
}));
demoMessages.splice(5, 0, {
  id: "demo-file",
  conversation_id: "demo-crew",
  sender_id: people[3].id,
  body: "",
  created_at: "2026-10-11T18:33:00Z",
  sender: people[3],
  attachments: [
    {
      id: "demo-project",
      name: "projeto_digitalx.zip",
      path: "demo-only",
      mime_type: "application/zip",
      size: 3565158,
    },
  ],
});
const names = [
  "DIGITALX Crew",
  "Projetos & Ideias",
  "Geral do Grupo",
  "Marketing Digital",
  "Design & Criatividade",
  "Desenvolvimento",
  "Resultados",
  "Conversas Aleatórias",
  "Equipe DigitalX",
  "Suporte",
];
const previews = [
  "Lucas: Bora pro próximo projeto? 🚀",
  "Matheus: Já enviei o arquivo!",
  "Ana: Tamo junto! 👍",
  "Rafael: Post de hoje já tá no ar!",
  "Julia: Ficou insano o layout!",
  "Pedro: Commit feito ✅",
  "Carlos: Meta do mês batida! 🔥",
  "Bruno: Kkkk",
  "Lucas: Reunião às 16h!",
  "Atendimento: Qualquer dúvida, estamos aqui.",
];
export const demoConversations: Conversation[] = names.map((title, i) => ({
  id: i === 0 ? "demo-crew" : `demo-conv-${i}`,
  title,
  is_group: i !== 9,
  description:
    "Grupo oficial da DigitalX. Ideias, projetos e muita conexão. Juntos somos mais fortes. 🖤",
  updated_at: `2026-10-11T${String(18 - Math.floor(i / 3)).padStart(2, "0")}:${String(42 - i * 3).padStart(2, "0")}:00Z`,
  members: member,
  last: {
    ...demoMessages[0],
    body: previews[i],
    created_at: `2026-10-11T${String(18 - Math.floor(i / 3)).padStart(2, "0")}:${String(42 - i * 3).padStart(2, "0")}:00Z`,
  },
  unread: [12, 5, 3, 4, 2, 0, 0, 0, 0, 0][i],
}));
