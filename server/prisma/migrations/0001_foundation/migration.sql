-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'OPERATOR');

-- CreateEnum
CREATE TYPE "QueueState" AS ENUM ('OPEN', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queues" (
    "id" UUID NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "state" "QueueState" NOT NULL DEFAULT 'OPEN',
    "last_sequence" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_queue_assignments" (
    "operator_id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_queue_assignments_pkey" PRIMARY KEY ("operator_id","queue_id")
);

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "sequence" BIGINT NOT NULL,
    "display_number" VARCHAR(32) NOT NULL,
    "party_size" SMALLINT NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'WAITING',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "called_at" TIMESTAMPTZ(6),
    "serving_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "no_show_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_events" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "actor_id" UUID,
    "event_type" VARCHAR(40) NOT NULL,
    "from_status" "EntryStatus",
    "to_status" "EntryStatus" NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "queue_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "queues_code_key" ON "queues"("code");

-- CreateIndex
CREATE INDEX "operator_queue_assignments_queue_id_idx" ON "operator_queue_assignments"("queue_id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_display_number_key" ON "queue_entries"("display_number");

-- CreateIndex
CREATE INDEX "queue_entries_queue_id_status_sequence_idx" ON "queue_entries"("queue_id", "status", "sequence");

-- CreateIndex
CREATE INDEX "queue_entries_customer_id_joined_at_id_idx" ON "queue_entries"("customer_id", "joined_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_queue_id_sequence_key" ON "queue_entries"("queue_id", "sequence");

-- CreateIndex
CREATE INDEX "queue_events_entry_id_occurred_at_idx" ON "queue_events"("entry_id", "occurred_at");

-- CreateIndex
CREATE INDEX "queue_events_actor_id_idx" ON "queue_events"("actor_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_queue_assignments" ADD CONSTRAINT "operator_queue_assignments_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_queue_assignments" ADD CONSTRAINT "operator_queue_assignments_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "queues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "queue_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_events" ADD CONSTRAINT "queue_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- PostgreSQL invariants not expressible by Prisma's schema DSL.
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK (email = lower(email));
ALTER TABLE "queues" ADD CONSTRAINT "queues_code_format" CHECK (code ~ '^[A-Z0-9]+$');
ALTER TABLE "queues" ADD CONSTRAINT "queues_last_sequence_nonnegative" CHECK (last_sequence >= 0);
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_party_size_range" CHECK (party_size BETWEEN 1 AND 8);
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_sequence_positive" CHECK (sequence > 0);
CREATE UNIQUE INDEX "queue_entries_one_active_customer" ON "queue_entries" ("customer_id")
  WHERE status IN ('WAITING', 'CALLED', 'SERVING');
CREATE UNIQUE INDEX "queue_entries_one_service_slot" ON "queue_entries" ("queue_id")
  WHERE status IN ('CALLED', 'SERVING');
