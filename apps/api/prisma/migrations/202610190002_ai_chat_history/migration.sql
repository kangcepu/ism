CREATE TABLE IF NOT EXISTS "AiChat" (
  "id" BIGSERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "tools" JSONB NOT NULL,
  "verified" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiChat_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AiChat_userId_createdAt_idx" ON "AiChat"("userId", "createdAt");
