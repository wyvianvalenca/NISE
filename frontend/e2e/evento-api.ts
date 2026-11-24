import type { Page, Route } from "@playwright/test";

// Simula as rotas de evento do back (A06·4b), para os testes não dependerem do FastAPI:
// GET /api/events/{id} (#178), PUT e DELETE /sign-up (#184), PUT /went e /did-not-go e
// DELETE /did-not-go (#192), PUT /reminder (#188), e DELETE /api/file/{id} (#108) para o
// "Tirar do filé". As regras são as do back (409 quando o evento não está no estado que a
// rota pede), e o estado fica em memória do teste, então vale entre uma página e outra.
// Dados fictícios.

type Status = "next" | "in_progress" | "concluded";

type MockEvent = {
  id: string;
  status: Status;
  type: string;
  typeLabel: string;
  topic: string | null;
  band: string;
  title: string;
  group: string | null;
  organizer: string;
  /** Dias de hoje até o fim das inscrições; negativo se já fecharam; null é sem prazo. */
  deadlineIn: number | null;
  /** Para um evento sem prazo (ação de grupo): se as inscrições estão abertas. */
  open?: boolean;
  /** Dias de hoje até o primeiro dia do evento. */
  startsIn: number;
  /** Quantos dias o evento dura. */
  length: number;
  city: string | null;
  cost: string | null;
  stage: string | null;
  prerequisites: string[];
  registrationUrl: string | null;
};

/**
 * Os ids seguem o formato do catálogo do back: "curadoria-<n>" para o que vem da
 * curadoria e "acao-<n>" para ação de grupo da NISE. Os números ficam de 21 em diante
 * para não colidir com os de `file-api.ts` (curadoria-1 a curadoria-4). O hackathon
 * (curadoria-21) é o item do filé que casa com o evento (#115), nos specs que montam
 * o filé; os outros só abrem pelo endereço.
 */
const EVENTS: MockEvent[] = [
  {
    id: "curadoria-21",
    status: "next",
    type: "hackathon",
    typeLabel: "Hackathon",
    topic: "Programação",
    band: "grande-desafio",
    title: "Hackathon Meninas na Tecnologia",
    group: null,
    organizer: "Instituto Exemplo",
    deadlineIn: 15,
    startsIn: 24,
    length: 2,
    city: "Maceió",
    cost: null,
    stage: "Ensino médio",
    prerequisites: ["Não precisa saber programar"],
    registrationUrl: "https://example.com/eventos/hackathon-meninas-na-tecnologia",
  },
  {
    id: "acao-22",
    status: "next",
    type: "oficina",
    typeLabel: "Oficina",
    topic: "Robótica",
    band: "role-com-a-galera",
    title: "Oficina de robótica com sucata",
    group: "Rendeiras do Código",
    organizer: "Rendeiras do Código",
    deadlineIn: 0,
    startsIn: 6,
    length: 1,
    city: "Arapiraca",
    cost: null,
    stage: "Ensino fundamental",
    prerequisites: [],
    registrationUrl: "https://example.com/eventos/oficina-de-robotica",
  },
  {
    id: "curadoria-23",
    status: "next",
    type: "minicurso",
    typeLabel: "Minicurso",
    topic: "Sites e apps",
    band: "grande-desafio",
    title: "Minicurso: seu primeiro site",
    group: null,
    organizer: "Instituto Exemplo",
    deadlineIn: -3,
    startsIn: 4,
    length: 3,
    city: null,
    cost: "R$ 20",
    stage: null,
    prerequisites: ["Ter um computador"],
    registrationUrl: "https://example.com/eventos/minicurso-de-sites",
  },
  // Evento de fora que já passou, com ela inscrita: pergunta "Você foi?" (#190).
  {
    id: "curadoria-24",
    status: "in_progress",
    type: "hackathon",
    typeLabel: "Hackathon",
    topic: "Programação",
    band: "grande-desafio",
    title: "Hackathon Cidades Inteligentes",
    group: null,
    organizer: "Instituto Exemplo",
    deadlineIn: -20,
    startsIn: -8,
    length: 2,
    city: "Maceió",
    cost: null,
    stage: "Ensino médio",
    prerequisites: ["Não precisa saber programar"],
    registrationUrl: "https://example.com/eventos/hackathon-cidades-inteligentes",
  },
  // Evento de fora em que ela foi: versão "Concluído".
  {
    id: "curadoria-25",
    status: "concluded",
    type: "palestra",
    typeLabel: "Palestra",
    topic: "Inteligência artificial",
    band: "role-com-a-galera",
    title: "Palestra Mulheres na Computação",
    group: null,
    organizer: "Instituto Exemplo",
    deadlineIn: -40,
    startsIn: -30,
    length: 1,
    city: "Maceió",
    cost: null,
    stage: "Ensino fundamental",
    prerequisites: [],
    registrationUrl: "https://example.com/eventos/palestra-mulheres-na-computacao",
  },
  // Evento que começa amanhã: a versão "Inscrita" não oferece o lembrete (#186).
  {
    id: "curadoria-26",
    status: "in_progress",
    type: "visita",
    typeLabel: "Visita",
    topic: "Robótica",
    band: "role-com-a-galera",
    title: "Visita ao laboratório de robótica",
    group: null,
    organizer: "Instituto Exemplo",
    deadlineIn: -2,
    startsIn: 1,
    length: 1,
    city: "Maceió",
    cost: null,
    stage: "Ensino médio",
    prerequisites: [],
    registrationUrl: "https://example.com/eventos/visita-ao-laboratorio",
  },
  // Evento de grupo da NISE que já passou, com ela inscrita: espera a lista de presença (#194).
  {
    id: "acao-27",
    status: "in_progress",
    type: "oficina",
    typeLabel: "Oficina",
    topic: "Jogos",
    band: "role-com-a-galera",
    title: "Oficina de jogos com Scratch",
    group: "Rendeiras do Código",
    organizer: "Rendeiras do Código",
    deadlineIn: null,
    open: false,
    startsIn: -5,
    length: 1,
    city: "Maceió",
    cost: null,
    stage: "Ensino fundamental",
    prerequisites: ["Não precisa saber programar"],
    registrationUrl: "https://example.com/eventos/oficina-de-jogos",
  },
  // Ação de grupo sem prazo, de inscrições abertas e sem tema: os campos nulos do back.
  {
    id: "acao-28",
    status: "next",
    type: "palestra",
    typeLabel: "Palestra",
    topic: null,
    band: "uma-tarde",
    title: "Palestra aberta das Rendeiras",
    group: "Rendeiras do Código",
    organizer: "Rendeiras do Código",
    deadlineIn: null,
    open: true,
    startsIn: 10,
    length: 1,
    city: "Maceió",
    cost: null,
    stage: null,
    prerequisites: [],
    registrationUrl: "https://example.com/acoes/palestra-aberta",
  },
  // Ação fechada (só convidadas): sem prazo e sem link de inscrição.
  {
    id: "acao-29",
    status: "next",
    type: "oficina",
    typeLabel: "Oficina",
    topic: "Robótica",
    band: "uma-tarde",
    title: "Oficina só para convidadas",
    group: "Rendeiras do Código",
    organizer: "Rendeiras do Código",
    deadlineIn: null,
    open: false,
    startsIn: 10,
    length: 1,
    city: "Maceió",
    cost: null,
    stage: null,
    prerequisites: [],
    registrationUrl: null,
  },
];

export type EventApiOptions = {
  /** "Hoje" no fuso de Maceió (AAAA-MM-DD), para as datas não dependerem do relógio. */
  today?: string;
  /** Status inicial de cada evento, pelo id. "concluded" num evento de grupo é a presença marcada. */
  status?: Record<string, Status>;
  /** Eventos que já saíram do filé, ex.: a coordenadora registrou a presença sem ela (#194). */
  removed?: string[];
  /** Atraso das respostas, em ms, para testar o carregamento. */
  delayMs?: number;
  /** Faz as mudanças (marcar, tirar do filé, "Fui!", "Não deu") falharem. */
  failUpdates?: boolean;
  /** Faz só o "Desfazer" (da inscrição e do "Não deu") falhar. */
  failUndo?: boolean;
  /** Faz só salvar o lembrete falhar. */
  failReminder?: boolean;
  /** Faz só abrir o detalhe falhar, para testar o "Tentar de novo". */
  failLoad?: boolean;
};

export type EventApi = Required<Pick<EventApiOptions, "delayMs" | "failUpdates" | "failUndo" | "failReminder" | "failLoad">> & {
  /** O que as rotas que falham respondem: 500 por padrão; 401, 403 ou 409 para testar cada motivo. */
  failure: { status: number; body?: object };
  /** O status de cada evento agora, no estado do back. */
  statusOf: (id: string) => Status | undefined;
  /** O lembrete de cada evento agora. */
  reminderOf: (id: string) => boolean;
  /** Os ids que saíram do filé, na ordem. */
  removed: string[];
  /** A coordenadora salva a presença (#135): ela fica presente (concluído) ou ausente (sai do filé). */
  markAttendance: (id: string, present: boolean) => void;
  /** Os pedidos de cada rota que mudam algo, na ordem: "PUT sign-up curadoria-21". */
  calls: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function maceioToday(): string {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function plusDays(isoDay: string, days: number): string {
  return new Date(Date.parse(isoDay) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * O mesmo teste do `parse_item_id` do back: sem zero à esquerda, só dígitos ASCII e
 * número até o int4 do banco. Qualquer outro id responde 404 `item_not_found`.
 */
const ITEM_ID = /^(curadoria|acao)-[1-9][0-9]*$/;
const MAX_ID = 2_147_483_647;

function validItemId(id: string): boolean {
  return ITEM_ID.test(id) && Number(id.slice(id.indexOf("-") + 1)) <= MAX_ID;
}

/**
 * Liga as rotas de evento na página. Chame antes do `goto`. Devolve o estado, que os
 * testes podem ler e mudar no meio (`api.delayMs = 1500`, `api.failLoad = false`).
 */
export async function mockEventApi(page: Page, options: EventApiOptions = {}): Promise<EventApi> {
  const today = options.today ?? maceioToday();
  const statuses = new Map<string, Status>(EVENTS.map((event) => [event.id, event.status]));
  for (const [id, status] of Object.entries(options.status ?? {})) statuses.set(id, status);
  const reminders = new Set<string>();
  const removed = [...(options.removed ?? [])];

  const api: EventApi = {
    delayMs: options.delayMs ?? 0,
    failUpdates: options.failUpdates ?? false,
    failUndo: options.failUndo ?? false,
    failReminder: options.failReminder ?? false,
    failLoad: options.failLoad ?? false,
    failure: { status: 500 },
    statusOf: (id) => statuses.get(id),
    reminderOf: (id) => reminders.has(id),
    removed,
    markAttendance: (id, present) => {
      if (present) statuses.set(id, "concluded");
      else removed.push(id);
    },
    calls: [],
  };

  function detail(event: MockEvent) {
    const status = statuses.get(event.id) ?? event.status;
    const lastDay = event.startsIn + event.length - 1;
    const afterEvent = lastDay < 0;
    const hasDeadline = event.deadlineIn !== null;
    return {
      id: event.id,
      status,
      type: event.type,
      typeLabel: event.typeLabel,
      topic: event.topic,
      band: event.band,
      title: event.title,
      group: event.group,
      organizer: event.organizer,
      startsOn: plusDays(today, event.startsIn),
      endsOn: plusDays(today, lastDay),
      city: event.city,
      deadline: hasDeadline ? plusDays(today, event.deadlineIn as number) : null,
      daysLeft: hasDeadline ? Math.max(event.deadlineIn as number, 0) : null,
      registrationsOpen: hasDeadline ? (event.deadlineIn as number) >= 0 : (event.open ?? true),
      daysUntilStart: Math.max(event.startsIn, 0),
      afterEvent,
      waitingAttendance: status === "in_progress" && afterEvent && event.group !== null,
      reminder: reminders.has(event.id),
      cost: event.cost,
      stage: event.stage,
      prerequisites: event.prerequisites,
      registrationUrl: event.registrationUrl,
      firstName: "Alana",
    };
  }

  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const failNow = (route: Route) => json(route, api.failure.status, api.failure.body ?? { detail: "erro" });
  const conflict = (route: Route, error: string) => json(route, 409, { error });
  const notFound = (route: Route) => json(route, 404, { error: "item_not_found" });

  const find = (id: string) => EVENTS.find((event) => event.id === id);
  const inFile = (id: string) => find(id) !== undefined && !removed.includes(id);

  async function wait() {
    if (api.delayMs) await new Promise((resolve) => setTimeout(resolve, api.delayMs));
  }

  // O "Fui!" e o "Não deu" só valem para evento de fora, depois da data, com ela inscrita.
  function asked(event: MockEvent) {
    const afterEvent = event.startsIn + event.length - 1 < 0;
    return event.group === null && afterEvent && statuses.get(event.id) === "in_progress";
  }

  await page.route("**/api/events/**", async (route) => {
    const request = route.request();
    const [, id, action] = new URL(request.url()).pathname.replace(/^\/api\/events\//, "/").split("/");
    const method = request.method();
    const decoded = decodeURIComponent(id);
    const event = find(decoded);
    await wait();

    if (!validItemId(decoded)) return notFound(route);

    if (method === "GET" && action === undefined) {
      if (api.failLoad) return failNow(route);
      return event && inFile(event.id) ? json(route, 200, detail(event)) : notFound(route);
    }

    api.calls.push(`${method} ${action ?? ""} ${id}`.replace("  ", " "));
    const didNotGoPair = action === "did-not-go";
    if (!event || (!inFile(event.id) && !didNotGoPair)) return notFound(route);
    const status = statuses.get(event.id);
    const afterEvent = event.startsIn + event.length - 1 < 0;

    if (action === "sign-up" && method === "PUT") {
      if (api.failUpdates) return failNow(route);
      if (status === "concluded") return conflict(route, "event_concluded");
      if (afterEvent) return conflict(route, "event_over");
      statuses.set(event.id, "in_progress");
      return json(route, 200, detail(event));
    }

    if (action === "sign-up" && method === "DELETE") {
      if (api.failUndo) return failNow(route);
      if (status === "concluded") return conflict(route, "event_concluded");
      if (afterEvent) return conflict(route, "event_over");
      statuses.set(event.id, "next");
      reminders.delete(event.id);
      return json(route, 200, detail(event));
    }

    if (action === "reminder" && method === "PUT") {
      if (api.failReminder) return failNow(route);
      const { on } = request.postDataJSON() as { on: boolean };
      if (on && (status !== "in_progress" || event.startsIn < 2)) return conflict(route, "reminder_not_available");
      if (on) reminders.add(event.id);
      else reminders.delete(event.id);
      return json(route, 200, detail(event));
    }

    if (action === "went" && method === "PUT") {
      if (api.failUpdates) return failNow(route);
      if (!asked(event)) return conflict(route, "event_not_asked");
      statuses.set(event.id, "concluded");
      return json(route, 200, detail(event));
    }

    if (action === "did-not-go" && method === "PUT") {
      if (api.failUpdates) return failNow(route);
      if (!asked(event)) return conflict(route, "event_not_asked");
      removed.push(event.id);
      return route.fulfill({ status: 204 });
    }

    if (action === "did-not-go" && method === "DELETE") {
      if (api.failUndo) return failNow(route);
      if (!removed.includes(event.id)) return conflict(route, "event_not_asked");
      removed.splice(removed.indexOf(event.id), 1);
      return json(route, 200, detail(event));
    }

    return route.fallback();
  });

  // "Tirar do filé": a rota é a mesma da atividade (#108). Só os eventos desta simulação.
  await page.route("**/api/file/*", async (route) => {
    const request = route.request();
    const id = decodeURIComponent(new URL(request.url()).pathname.split("/").pop() ?? "");
    if (request.method() !== "DELETE" || !find(id)) return route.fallback();
    await wait();
    api.calls.push(`DELETE file ${id}`);
    if (api.failUpdates) return failNow(route);
    if (!inFile(id)) return notFound(route);
    if (statuses.get(id) === "concluded") return conflict(route, "item_concluded");
    reminders.delete(id);
    removed.push(id);
    return json(route, 200, { id });
  });

  return api;
}
