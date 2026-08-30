export interface Profession {
  key: string;
  labelZh: string;
  labelEn: string;
}

export const PROFESSIONS: Profession[] = [
  { key: "architecture", labelZh: "建築／室內設計", labelEn: "Architecture / Interior Design" },
  { key: "tech", labelZh: "科技／軟體", labelEn: "Technology / Software" },
  { key: "finance", labelZh: "財經／投資", labelEn: "Finance / Investment" },
  { key: "marketing", labelZh: "行銷／媒體", labelEn: "Marketing / Media" },
  { key: "education", labelZh: "教育／研究", labelEn: "Education / Research" },
  { key: "health", labelZh: "醫療／健康", labelEn: "Healthcare / Health" },
  { key: "law", labelZh: "法律", labelEn: "Law" },
  { key: "creative", labelZh: "創意／設計", labelEn: "Creative / Design" },
  { key: "other", labelZh: "其他／自訂", labelEn: "Other / Custom" },
];

export function isKnownProfessionKey(key: string): boolean {
  return PROFESSIONS.some((p) => p.key === key);
}
