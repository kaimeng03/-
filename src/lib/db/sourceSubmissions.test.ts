import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./prisma";
import { createSourceSubmission, listUserSourceSubmissions } from "./sourceSubmissions";

const hasDb = Boolean(process.env.DATABASE_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb("sourceSubmissions — a user only ever sees their own (real Postgres)", () => {
  let userA: { id: string };
  let userB: { id: string };

  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: ["sub-a@test.local", "sub-b@test.local"] } } });
    userA = await prisma.user.create({ data: { email: "sub-a@test.local", name: "Sub A" } });
    userB = await prisma.user.create({ data: { email: "sub-b@test.local", name: "Sub B" } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  });

  it("rejects an empty submission", async () => {
    await expect(createSourceSubmission(userA.id, { input: "   ", inputType: "url" })).rejects.toThrow();
  });

  it("creates a submission recording the failure reason", async () => {
    const submission = await createSourceSubmission(userA.id, {
      input: "https://archademia.com/blog/",
      inputType: "url",
      failureCode: "RATE_LIMITED",
      failureReason: "網站目前阻擋自動讀取，無法建立可靠來源。",
    });
    expect(submission.userId).toBe(userA.id);
    expect(submission.status).toBe("pending");
    expect(submission.failureCode).toBe("RATE_LIMITED");
  });

  it("user A only sees their own submissions, never user B's", async () => {
    await createSourceSubmission(userB.id, { input: "some other site", inputType: "keyword" });

    const listA = await listUserSourceSubmissions(userA.id);
    const listB = await listUserSourceSubmissions(userB.id);

    expect(listA.every((s) => s.userId === userA.id)).toBe(true);
    expect(listB.every((s) => s.userId === userB.id)).toBe(true);
    expect(listA.some((s) => s.userId === userB.id)).toBe(false);
  });
});
