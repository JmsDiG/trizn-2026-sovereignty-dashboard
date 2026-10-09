import { z } from "zod";
export const areas = [
  { id: "equipment", title: "Оборудование", subtitle: "Изделия, компоненты и промышленная серия", color: "#244f8c", number: "01" },
  { id: "digital", title: "ПО, данные, вычисления", subtitle: "Цифровые инструменты и инфраструктура", color: "#008d9c", number: "02" },
  { id: "people", title: "Кадры и образование", subtitle: "Компетенции и технологические команды", color: "#596bc0", number: "03" },
  { id: "institutions", title: "Государство и регуляторы", subtitle: "Условия, которые связывают три аспекта", color: "#52657e", number: "" },
] as const;
export const statuses = {
  pending: { label: "Не обсуждали", short: "Не обсуждали", color: "#76869c" },
  strength: { label: "Опора", short: "Опора", color: "#008c79" },
  gap: { label: "Дефицит", short: "Дефицит", color: "#d45442" },
  disputed: { label: "Есть разногласия", short: "Разногласия", color: "#ae750d" },
} as const;
export const componentSchema = z.object({
  id: z.string().min(1).max(100), area: z.enum(["equipment", "digital", "people", "institutions"]),
  title: z.string().trim().min(1).max(150), status: z.enum(["pending", "strength", "gap", "disputed"]),
  definition: z.string().max(900), evidence: z.string().max(900), barrier: z.string().max(900), action: z.string().max(900),
  owner: z.string().max(200), deadline: z.string().max(150), priority: z.boolean(), approved: z.boolean(),
}).refine(c => !c.approved || !!(c.action.trim() && c.owner.trim() && c.deadline.trim()), { message: "Для резолюции нужны предложение, ответственный и срок" });
export const portraitSchema = z.object({ components: z.array(componentSchema).max(100), lastChanged: z.string().max(100) }).refine(d => new Set(d.components.map(c => c.id)).size === d.components.length, { message: "Составляющие должны иметь разные идентификаторы" });
export type Component = z.infer<typeof componentSchema>;
export type Portrait = z.infer<typeof portraitSchema>;
export type Snapshot = { data: Portrait; revision: number; updatedAt: string | null };
export function newComponent(area: Component["area"], title = ""): Component {
  return { id: crypto.randomUUID(), area, title, status: "pending", definition: "", evidence: "", barrier: "", action: "", owner: "", deadline: "", priority: false, approved: false };
}
export function initialPortrait(): Portrait {
  const seed: Record<Component["area"], string[]> = {
    equipment: ["Компонентная база", "Испытания и допуск", "Серия и тиражирование", "Межотраслевые платформы"],
    digital: ["Промышленное ПО", "ИИ и агентные системы", "Вычислительные мощности", "Промышленные данные"],
    people: ["Инженерные компетенции", "Подготовка кадров", "Стандарты и метрология", "Технологическое предпринимательство"],
    institutions: ["Допуск новых технологий", "Интеллектуальная собственность", "Инструменты поддержки", "Рынки и закупки"],
  };
  return { components: areas.flatMap(a => seed[a.id].map((title, i) => ({ ...newComponent(a.id, title), id: `${a.id}-${i}` }))), lastChanged: "" };
}
export function portraitMarkdown(s: Snapshot): string {
  const out = ["# Портрет технологического суверенитета", "", "Круглый стол «Технологический суверенитет: теории и практики»", "ТРИЗН-2026, 13 октября 2026 года, 11:00–13:00, АГТУ «Высшая школа нефти», аудитория 6А.35", "", "Оценки и формулировки отражают ход обсуждения. Необсуждённые составляющие не являются оценкой текущего положения.", ""];
  for (const area of areas) {
    out.push(`## ${area.title}`, "");
    for (const c of s.data.components.filter(c => c.area === area.id)) {
      out.push(`### ${c.title}${c.priority ? " · приоритет" : ""}`, `Статус: ${statuses[c.status].label}`, "");
      for (const [label, value] of [["Суверенитет здесь означает", c.definition], ["Основание оценки", c.evidence], ["Узкое место", c.barrier], ["Предложение", c.action], ["Ответственный", c.owner], ["Срок", c.deadline]]) if (value) out.push(`**${label}:** ${value}`, "");
      if (c.approved) out.push("Согласовано для резолюции.", "");
    }
  }
  out.push("## Предложения для резолюции", "");
  const accepted = s.data.components.filter(c => c.approved);
  if (!accepted.length) out.push("Согласованных предложений пока нет.");
  accepted.forEach((c, i) => out.push(`${i + 1}. ${c.action}. Ответственный: ${c.owner}. Срок: ${c.deadline}.`));
  return out.join("\n");
}
