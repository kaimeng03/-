import { prisma } from "./prisma";

/** "I want this source supported" requests. A user can only ever see their
 *  own submissions — every query here is scoped by userId from the session. */
export async function createSourceSubmission(
  userId: string,
  input: { input: string; inputType: string; detectedUrl?: string | null; failureCode?: string | null; failureReason?: string | null },
) {
  const trimmed = input.input.trim();
  if (!trimmed) throw new Error("請輸入網址或關鍵字");
  if (trimmed.length > 500) throw new Error("輸入內容過長");

  return prisma.sourceSubmission.create({
    data: {
      userId,
      input: trimmed,
      inputType: input.inputType,
      detectedUrl: input.detectedUrl ?? null,
      failureCode: input.failureCode ?? null,
      failureReason: input.failureReason ?? null,
    },
  });
}

export async function listUserSourceSubmissions(userId: string) {
  return prisma.sourceSubmission.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
