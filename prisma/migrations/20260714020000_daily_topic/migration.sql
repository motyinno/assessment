-- AI-generated "Topic of the day" for the dashboard, cached one row per day.
CREATE TABLE "DailyTopic" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "code" TEXT,
    "resources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyTopic_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyTopic_date_key" ON "DailyTopic"("date");
