import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { IdentityLinkRaceError, SUBJECT_MAX_LENGTH, findOrCreateBySubject, type IdentityLinkClient, type IdentityLinkInput } from "../identity-link";
import { mintProviderEmailAssertion } from "../provider-assertion";

// F3.1.2 Chunk A: unit tests with an injected fake client. No database is used or started. Real-PostgreSQL concurrency is Chunk B.

type Row = { id: string; email: string; status: string; emailVerifiedAt: Date | null };
type CreateArgs = Parameters<IdentityLinkClient["user"]["create"]>[0];

class FakeDb implements IdentityLinkClient {
  users: Row[] = [];
  identities: { userId: string; provider: string; subject: string }[] = [];
  reads = 0;
  creates: CreateArgs[] = [];
  /** Called for the nth create (1-based). It may insert a "winner" row and return an error to throw. */
  onCreate: (n: number, args: CreateArgs) => unknown = () => undefined;
  private seq = 0;

  seed(opts: { provider?: string; subject?: string; email: string; status?: string; verified?: Date | null; identity?: boolean }): Row {
    const row: Row = { id: `u${++this.seq}`, email: opts.email, status: opts.status ?? "active", emailVerifiedAt: opts.verified ?? null };
    this.users.push(row);
    if (opts.identity !== false) this.identities.push({ userId: row.id, provider: opts.provider ?? "p", subject: opts.subject ?? "s" });
    return row;
  }

  userIdentity = {
    findUnique: async (args: { where: { provider_subject: { provider: string; subject: string } }; include: { user: true } }) => {
      this.reads++;
      const { provider, subject } = args.where.provider_subject;
      const identity = this.identities.find((i) => i.provider === provider && i.subject === subject);
      const user = identity && this.users.find((u) => u.id === identity.userId);
      return user ? { user: { ...user } } : null;
    },
  };

  user = {
    findUnique: async (args: { where: { email: string }; select: { id: true } }) => {
      this.reads++;
      const user = this.users.find((u) => u.email === args.where.email);
      return user ? { id: user.id } : null;
    },
    create: async (args: CreateArgs) => {
      this.creates.push(args);
      const error = this.onCreate(this.creates.length, args);
      if (error !== undefined) throw error;
      const row: Row = { id: `u${++this.seq}`, email: args.data.email, status: "active", emailVerifiedAt: args.data.emailVerifiedAt };
      this.users.push(row);
      this.identities.push({ userId: row.id, ...args.data.identities.create });
      return { ...row };
    },
  };

  snapshot() {
    return JSON.stringify({ users: this.users, identities: this.identities });
  }
}

// Error shapes as the Prisma 7 driver adapter produces them (read from @prisma/adapter-pg).
const p2002 = (index?: string, fields?: string[]) =>
  Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: index ? { index } : fields ? { fields } : undefined } } } });
const p2039 = (originalCode: string, originalMessage: string) =>
  Object.assign(new Error("Database error"), { code: "P2039", meta: { driverAdapterError: { cause: { kind: "postgres", originalCode, originalMessage } } } });

const IDENTITY_KEY = "user_identities_provider_subject_key";
const EMAIL_KEY = "users_email_key";
const input = (over: Partial<IdentityLinkInput> = {}): IdentityLinkInput => ({ provider: "p", subject: "s", email: "a@x.in", ...over });

describe("validation (before any database access)", () => {
  const reject = async (over: Partial<IdentityLinkInput>, field: string) => {
    const db = new FakeDb();
    db.seed({ email: "a@x.in" }); // an existing identity does not excuse invalid input
    const result = await findOrCreateBySubject(input(over), db);
    expect(result).toEqual({ ok: false, reason: "invalid_input", field });
    expect(db.reads).toBe(0);
    expect(db.creates).toHaveLength(0);
  };

  it("rejects a missing, blank or NUL provider", async () => {
    for (const provider of ["", "   ", "\t", "a\u0000b", undefined as unknown as string, 7 as unknown as string]) await reject({ provider }, "provider");
  });

  it("rejects a missing, blank, NUL or over-long subject, and accepts exactly 100 characters", async () => {
    for (const subject of ["", " ", "\n", "a\u0000", undefined as unknown as string, "x".repeat(SUBJECT_MAX_LENGTH + 1)]) await reject({ subject }, "subject");
    expect(SUBJECT_MAX_LENGTH).toBe(100);
    const db = new FakeDb();
    const result = await findOrCreateBySubject(input({ subject: "x".repeat(100) }), db);
    expect(result.ok).toBe(true);
  });

  it("rejects a missing or invalid email, even when the identity already exists", async () => {
    for (const email of ["", "   ", "a b@x.in", undefined as unknown as string, null as unknown as string, 5 as unknown as string]) await reject({ email }, "email");
  });

  it("stores provider and subject exactly as supplied (no trimming, case kept, no length limit on provider)", async () => {
    const db = new FakeDb();
    const provider = ` Better-Auth_${"p".repeat(300)} `;
    const subject = " Sub-ABC ";
    const result = await findOrCreateBySubject(input({ provider, subject }), db);
    expect(result.ok).toBe(true);
    expect(db.creates[0].data.identities.create).toEqual({ provider, subject });
  });
});

describe("the four approved cases", () => {
  it("A: existing identity with the same email returns the existing user unchanged and writes nothing", async () => {
    const db = new FakeDb();
    const row = db.seed({ email: "a@x.in" });
    const before = db.snapshot();
    const result = await findOrCreateBySubject(input(), db);
    expect(result).toEqual({ ok: true, user: { id: row.id, email: "a@x.in", status: "active", emailVerifiedAt: null }, created: false, emailMatches: true });
    expect(db.creates).toHaveLength(0);
    expect(db.snapshot()).toBe(before);
  });

  it("A: the supplied email is normalised before it is compared", async () => {
    const db = new FakeDb();
    db.seed({ email: "a@x.in" });
    const result = await findOrCreateBySubject(input({ email: "  A@X.in " }), db);
    expect(result).toMatchObject({ ok: true, created: false, emailMatches: true });
  });

  it("B: existing identity with a changed email returns the user unchanged with emailMatches false", async () => {
    const db = new FakeDb();
    const row = db.seed({ email: "old@x.in" });
    const before = db.snapshot();
    const result = await findOrCreateBySubject(input({ email: "new@x.in" }), db);
    expect(result).toEqual({ ok: true, user: { id: row.id, email: "old@x.in", status: "active", emailVerifiedAt: null }, created: false, emailMatches: false });
    expect(db.snapshot()).toBe(before);
  });

  it("C: a new identity whose email belongs to another user is rejected; nothing is created, merged or attached", async () => {
    const db = new FakeDb();
    db.seed({ provider: "p", subject: "someone-else", email: "a@x.in" });
    db.seed({ email: "orphan@x.in", identity: false });
    for (const email of ["a@x.in", "orphan@x.in"]) {
      const before = db.snapshot();
      const result = await findOrCreateBySubject(input({ subject: "new-subject", email }), db);
      expect(result).toEqual({ ok: false, reason: "email_belongs_to_another_user" });
      expect(db.snapshot()).toBe(before);
    }
    expect(db.creates).toHaveLength(0);
  });

  it("C: the same holds when the email's owner is disabled", async () => {
    const db = new FakeDb();
    db.seed({ subject: "other", email: "a@x.in", status: "disabled" });
    expect(await findOrCreateBySubject(input(), db)).toEqual({ ok: false, reason: "email_belongs_to_another_user" });
  });

  it("D: a disabled user is rejected, never reactivated, whatever the email", async () => {
    const db = new FakeDb();
    db.seed({ email: "a@x.in", status: "disabled" });
    const before = db.snapshot();
    for (const email of ["a@x.in", "other@x.in"]) expect(await findOrCreateBySubject(input({ email }), db)).toEqual({ ok: false, reason: "user_disabled" });
    expect(db.snapshot()).toBe(before);
    expect(db.creates).toHaveLength(0);
  });

  it("D: any status other than active fails closed", async () => {
    const db = new FakeDb();
    db.seed({ email: "a@x.in", status: "pending" });
    expect(await findOrCreateBySubject(input(), db)).toEqual({ ok: false, reason: "user_disabled" });
  });
});

describe("creating a user", () => {
  it("creates the user and the identity in ONE nested create, with a lower-cased email and no verification", async () => {
    const db = new FakeDb();
    const result = await findOrCreateBySubject(input({ email: " New@X.IN " }), db);
    expect(result).toMatchObject({ ok: true, created: true, emailMatches: true, user: { email: "new@x.in", status: "active", emailVerifiedAt: null } });
    expect(db.creates).toHaveLength(1);
    expect(db.creates[0]).toEqual({ data: { email: "new@x.in", emailVerifiedAt: null, identities: { create: { provider: "p", subject: "s" } } } });
    expect(db.users).toHaveLength(1);
    expect(db.identities).toHaveLength(1);
  });

  it("is idempotent: the second call returns the same user and creates nothing more", async () => {
    const db = new FakeDb();
    const first = await findOrCreateBySubject(input(), db);
    const second = await findOrCreateBySubject(input(), db);
    expect(first).toMatchObject({ ok: true, created: true });
    expect(second).toMatchObject({ ok: true, created: false, emailMatches: true });
    expect(second.ok && first.ok && second.user.id === first.user.id).toBe(true);
    expect(db.creates).toHaveLength(1);
  });
});

describe("email verification assertion boundary", () => {
  const bound = { provider: "p", subject: "s", email: "a@x.in" };

  it("a bound, trusted assertion sets email_verified_at when the user is created", async () => {
    const db = new FakeDb();
    const result = await findOrCreateBySubject(input({ emailAssertion: mintProviderEmailAssertion(bound) }), db);
    expect(result.ok && result.created && result.user.emailVerifiedAt instanceof Date).toBe(true);
    expect(db.creates[0].data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("the assertion binds the normalised email, so a differently written address still matches", async () => {
    const db = new FakeDb();
    const result = await findOrCreateBySubject(input({ email: " A@X.in", emailAssertion: mintProviderEmailAssertion({ ...bound, email: "A@x.IN" }) }), db);
    expect(result).toMatchObject({ ok: true, created: true });
  });

  it("without an assertion the email is not marked verified", async () => {
    const db = new FakeDb();
    await findOrCreateBySubject(input(), db);
    expect(db.creates[0].data.emailVerifiedAt).toBeNull();
  });

  it("refuses a plain boolean, a string, a lookalike object, a frozen lookalike and a null prototype object", async () => {
    const lookalikes: unknown[] = [true, "true", 1, {}, { verified: true }, Object.freeze({}), Object.create(null), [], () => undefined];
    for (const emailAssertion of lookalikes) {
      const db = new FakeDb();
      const result = await findOrCreateBySubject(input({ emailAssertion: emailAssertion as never }), db);
      expect(result).toEqual({ ok: false, reason: "invalid_input", field: "emailAssertion" });
      expect(db.reads).toBe(0);
      expect(db.creates).toHaveLength(0);
    }
  });

  it("refuses an assertion minted for a different provider, subject or email", async () => {
    for (const other of [{ ...bound, provider: "q" }, { ...bound, subject: "t" }, { ...bound, email: "b@x.in" }]) {
      const db = new FakeDb();
      const result = await findOrCreateBySubject(input({ emailAssertion: mintProviderEmailAssertion(other) }), db);
      expect(result).toEqual({ ok: false, reason: "invalid_input", field: "emailAssertion" });
      expect(db.creates).toHaveLength(0);
    }
  });

  it("refuses to mint for an unusable binding", () => {
    expect(() => mintProviderEmailAssertion({ provider: "", subject: "s", email: "a@x.in" })).toThrow(TypeError);
    expect(() => mintProviderEmailAssertion({ provider: "p", subject: " ", email: "a@x.in" })).toThrow(TypeError);
    expect(() => mintProviderEmailAssertion({ provider: "p", subject: "s", email: "a b@x.in" })).toThrow(TypeError);
  });

  it("an assertion never changes an existing user (verification is set only at creation)", async () => {
    const db = new FakeDb();
    const row = db.seed({ email: "a@x.in", verified: null });
    const before = db.snapshot();
    const result = await findOrCreateBySubject(input({ emailAssertion: mintProviderEmailAssertion(bound) }), db);
    expect(result).toMatchObject({ ok: true, created: false, user: { id: row.id, emailVerifiedAt: null } });
    expect(db.snapshot()).toBe(before);
    expect(db.creates).toHaveLength(0);
  });
});

describe("existing users are never modified", () => {
  it("returns the stored verification time unchanged and writes nothing, in every reachable outcome", async () => {
    const stamp = new Date("2026-01-01T00:00:00.000Z");
    const db = new FakeDb();
    db.seed({ email: "a@x.in", verified: stamp });
    const before = db.snapshot();
    const same = await findOrCreateBySubject(input(), db);
    const changed = await findOrCreateBySubject(input({ email: "z@x.in" }), db);
    expect(same.ok && same.user.emailVerifiedAt?.getTime()).toBe(stamp.getTime());
    expect(changed.ok && changed.user.emailVerifiedAt?.getTime()).toBe(stamp.getTime());
    expect(db.snapshot()).toBe(before);
  });

  it("the client interface offers no way to update or delete a user", () => {
    const db = new FakeDb();
    expect(Object.keys(db.user).sort()).toEqual(["create", "findUnique"]);
    expect(Object.keys(db.userIdentity)).toEqual(["findUnique"]);
  });
});

describe("unique-constraint races (P2002 on the actual constraint)", () => {
  it("same provider and subject: re-reads and returns the winner's identity", async () => {
    const db = new FakeDb();
    let winner: Row | undefined;
    db.onCreate = (n) => {
      if (n === 1) {
        winner = db.seed({ email: "a@x.in" });
        return p2002(IDENTITY_KEY);
      }
    };
    const result = await findOrCreateBySubject(input(), db);
    expect(result).toMatchObject({ ok: true, created: false, emailMatches: true, user: { id: winner?.id } });
    expect(db.creates).toHaveLength(1);
    expect(db.users).toHaveLength(1);
  });

  it("same provider and subject, winner used a different email: returns the winner unchanged with emailMatches false", async () => {
    const db = new FakeDb();
    db.onCreate = (n) => {
      if (n === 1) {
        db.seed({ email: "winner@x.in" });
        return p2002(IDENTITY_KEY);
      }
    };
    expect(await findOrCreateBySubject(input(), db)).toMatchObject({ ok: true, created: false, emailMatches: false });
  });

  it("different subject, same email: re-reads and rejects", async () => {
    const db = new FakeDb();
    db.onCreate = (n) => {
      if (n === 1) {
        db.seed({ subject: "other", email: "a@x.in" });
        return p2002(EMAIL_KEY);
      }
    };
    expect(await findOrCreateBySubject(input(), db)).toEqual({ ok: false, reason: "email_belongs_to_another_user" });
    expect(db.creates).toHaveLength(1);
    expect(db.users).toHaveLength(1);
  });

  it("reads the constraint from `fields` when no index name is given", async () => {
    for (const [fields, seedSubject, expected] of [
      [["provider", "subject"], "s", { ok: true, created: false }],
      [["email"], "other", { ok: false, reason: "email_belongs_to_another_user" }],
    ] as const) {
      const db = new FakeDb();
      db.onCreate = (n) => {
        if (n === 1) {
          db.seed({ subject: seedSubject, email: "a@x.in" });
          return p2002(undefined, [...fields]);
        }
      };
      expect(await findOrCreateBySubject(input(), db)).toMatchObject(expected);
    }
  });

  it("an unrelated or unidentifiable unique violation propagates unchanged and is not retried", async () => {
    const errors = [p2002("some_other_key"), p2002("user_identities_user_id_provider_key"), p2002(), p2002(undefined, ["provider"]), p2002(undefined, ["email", "x"])];
    for (const error of errors) {
      const db = new FakeDb();
      db.onCreate = () => error;
      await expect(findOrCreateBySubject(input(), db)).rejects.toBe(error);
      expect(db.creates).toHaveLength(1);
    }
  });

  it("works with the real Prisma error class (the service does not depend on instanceof)", async () => {
    const db = new FakeDb();
    db.onCreate = (n) => {
      if (n === 1) {
        db.seed({ email: "a@x.in" });
        return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test", meta: { driverAdapterError: { cause: { kind: "UniqueConstraintViolation", constraint: { index: IDENTITY_KEY } } } } });
      }
    };
    expect(await findOrCreateBySubject(input(), db)).toMatchObject({ ok: true, created: false });
  });
});

describe("retry bound: one re-read, then stop", () => {
  it("a race that never resolves makes exactly two attempts and then throws IdentityLinkRaceError", async () => {
    for (const index of [IDENTITY_KEY, EMAIL_KEY]) {
      const db = new FakeDb();
      db.onCreate = () => p2002(index); // the winner never becomes visible
      await expect(findOrCreateBySubject(input(), db)).rejects.toBeInstanceOf(IdentityLinkRaceError);
      expect(db.creates).toHaveLength(2);
    }
  });

  it("a race resolved on the re-read does not throw", async () => {
    const db = new FakeDb();
    db.onCreate = (n) => {
      if (n === 1) {
        db.seed({ email: "a@x.in" });
        return p2002(IDENTITY_KEY);
      }
    };
    await expect(findOrCreateBySubject(input(), db)).resolves.toMatchObject({ ok: true });
  });
});

describe("email CHECK violations map to invalid input; nothing else does", () => {
  const message = (name: string) => `new row for relation "users" violates check constraint "${name}"`;

  it("maps each known email CHECK violation (P2039, PostgreSQL 23514) to invalid_input on the email, without retrying", async () => {
    for (const name of ["users_email_not_empty", "users_email_trimmed", "users_email_lowercase"]) {
      const db = new FakeDb();
      db.onCreate = () => p2039("23514", message(name));
      expect(await findOrCreateBySubject(input(), db)).toEqual({ ok: false, reason: "invalid_input", field: "email" });
      expect(db.creates).toHaveLength(1);
    }
  });

  it("propagates a different CHECK, a different PostgreSQL code, a different Prisma code and ordinary errors", async () => {
    const errors: unknown[] = [
      p2039("23514", message("users_status_check")),
      p2039("23514", message("user_identities_subject_not_blank")),
      p2039("23502", message("users_email_lowercase")),
      Object.assign(new Error("x"), { code: "P2039", meta: {} }),
      Object.assign(new Error("connection refused"), { code: "P1001" }),
      new Error("boom"),
      "not an error",
    ];
    for (const error of errors) {
      const db = new FakeDb();
      db.onCreate = () => error;
      await expect(findOrCreateBySubject(input(), db)).rejects.toBe(error);
      expect(db.creates).toHaveLength(1);
    }
  });

  it("a database error while reading propagates and nothing is created", async () => {
    const db = new FakeDb();
    const boom = new Error("read failed");
    db.userIdentity.findUnique = async () => {
      throw boom;
    };
    await expect(findOrCreateBySubject(input(), db)).rejects.toBe(boom);
    expect(db.creates).toHaveLength(0);
  });
});
