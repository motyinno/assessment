-- Legacy assessments import (data migration). Users resolved by email.
-- Generated from reviewed data; applied once via `prisma migrate deploy`.

-- 1. Archived users (left the department, kept for history)
INSERT INTO "User" ("id","name","email","role","grade","isArchived","createdAt","updatedAt")
VALUES ('legacy_u_1', 'Andrei Khalaleyenka', 'andrei.khalaleyenka@innowise.com', 'USER', 'jun+', true, now(), now())
ON CONFLICT ("email") DO UPDATE SET "isArchived" = true;
INSERT INTO "User" ("id","name","email","role","grade","isArchived","createdAt","updatedAt")
VALUES ('legacy_u_2', 'Mikhail Ziusko', 'mikhail.ziusko@innowise.com', 'USER', NULL, true, now(), now())
ON CONFLICT ("email") DO UPDATE SET "isArchived" = true;

-- 2. Assessments + participants + sessions
-- Legacy: Kate Khrol — Middle- (May 2025)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_1', 'Legacy: Kate Khrol — Middle- (May 2025)', 'GENERAL', 'COMPLETED', 'mid-', 'NONE', false, 'LEGACY_IMPORT:kate.khrol@innowise.com:2025-05-06T00:00:00.000Z', '2025-05-06 00:00:00', '2025-05-06 00:00:00', '2025-05-06 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_1_1', 'legacy_a_1', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'kate.khrol@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_1_2', 'legacy_a_1', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'alex.zinukov@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_1_1', 'legacy_a_1', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'alex.zinukov@innowise.com'), 'Alex Zinukov', '2025-05-06 00:00:00', '2025-05-06 00:00:00', '2025-05-06 00:00:00', 'https://drive.google.com/file/d/1PgWNrFHSJ2IBI9IOwIlZany8Wiq2Khxs/view', now(), now());

-- Legacy: Krystsina Seliazniova — Junior- (May 2025)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_2', 'Legacy: Krystsina Seliazniova — Junior- (May 2025)', 'GENERAL', 'COMPLETED', 'jun-', 'NONE', false, 'LEGACY_IMPORT:krystsina.seliazniova@innowise.com:2025-05-22T00:00:00.000Z', '2025-05-22 00:00:00', '2025-06-04 00:00:00', '2025-05-22 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_2_1', 'legacy_a_2', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'krystsina.seliazniova@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_2_2', 'legacy_a_2', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'alex.gudkov@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_2_3', 'legacy_a_2', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'mikhail.ziusko@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_2_1', 'legacy_a_2', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'alex.gudkov@innowise.com'), 'Alex Gudkov', '2025-05-22 00:00:00', '2025-05-22 00:00:00', '2025-05-22 00:00:00', NULL, now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_2_2', 'legacy_a_2', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.ziusko@innowise.com'), 'Mikhail Ziusko', '2025-06-04 00:00:00', '2025-06-04 00:00:00', '2025-06-04 00:00:00', 'https://drive.google.com/file/d/1oTN7qNAW3GOf4J-Vk6JRHFqkrO2WqBwA/view', now(), now());

-- Legacy: Andrei Khalaleyenka — Junior (May 2025)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_3', 'Legacy: Andrei Khalaleyenka — Junior (May 2025)', 'GENERAL', 'COMPLETED', 'jun', 'NONE', false, 'LEGACY_IMPORT:andrei.khalaleyenka@innowise.com:2025-05-28T00:00:00.000Z', '2025-05-28 00:00:00', '2025-06-04 00:00:00', '2025-05-28 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_3_1', 'legacy_a_3', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'andrei.khalaleyenka@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_3_2', 'legacy_a_3', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'ilya.razuvaev@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_3_1', 'legacy_a_3', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'ilya.razuvaev@innowise.com'), 'Ilya Razuvaev', '2025-05-28 00:00:00', '2025-05-28 00:00:00', '2025-05-28 00:00:00', NULL, now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_3_2', 'legacy_a_3', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'ilya.razuvaev@innowise.com'), 'Ilya Razuvaev', '2025-06-04 00:00:00', '2025-06-04 00:00:00', '2025-06-04 00:00:00', 'https://drive.google.com/file/d/1R_LXK6OjiKrXZxJWm0PRzyf2X8_PeELp/view', now(), now());

-- Legacy: Mohsen Shafaei — Junior+ (Jun 2025)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_4', 'Legacy: Mohsen Shafaei — Junior+ (Jun 2025)', 'GENERAL', 'COMPLETED', 'jun+', 'NONE', false, 'LEGACY_IMPORT:seyedmohsen.shafaei@innowise.com:2025-06-25T00:00:00.000Z', '2025-06-25 00:00:00', '2025-06-27 00:00:00', '2025-06-25 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_4_1', 'legacy_a_4', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'seyedmohsen.shafaei@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_4_2', 'legacy_a_4', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'alexander.veriga@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_4_1', 'legacy_a_4', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'alexander.veriga@innowise.com'), 'Alexander Veriga', '2025-06-25 00:00:00', '2025-06-25 00:00:00', '2025-06-25 00:00:00', 'https://drive.google.com/file/d/1d5FePBVlQ2iH6rSDHOJ-Jg8_uD50MQUx/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_4_2', 'legacy_a_4', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'alexander.veriga@innowise.com'), 'Alexander Veriga', '2025-06-27 00:00:00', '2025-06-27 00:00:00', '2025-06-27 00:00:00', 'https://drive.google.com/file/d/1jWCHaE-Ui1K0au1wJUSRwvGYdhnJNnfS/view', now(), now());

-- Legacy: Tsimafei Lukashevich — Junior+ (Jul 2025)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_5', 'Legacy: Tsimafei Lukashevich — Junior+ (Jul 2025)', 'GENERAL', 'COMPLETED', 'jun+', 'NONE', false, 'LEGACY_IMPORT:tsimafei.lukashevich@innowise.com:2025-07-30T00:00:00.000Z', '2025-07-30 00:00:00', '2025-08-04 00:00:00', '2025-07-30 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_5_1', 'legacy_a_5', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'tsimafei.lukashevich@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_5_2', 'legacy_a_5', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'mikhail.shatsila@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_5_3', 'legacy_a_5', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'alex.zinukov@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_5_1', 'legacy_a_5', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2025-07-30 00:00:00', '2025-07-30 00:00:00', '2025-07-30 00:00:00', 'https://drive.google.com/file/d/1bQU8uKo_iK7HKF-ZbSoLCxjM_PQnZTUH/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_5_2', 'legacy_a_5', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'alex.zinukov@innowise.com'), 'Alexei Zinukov', '2025-08-04 00:00:00', '2025-08-04 00:00:00', '2025-08-04 00:00:00', 'https://drive.google.com/file/d/13rx01Vy7rZT6h92cThVdUzmhtl_seGrE/view', now(), now());

-- Legacy: Ivan Charnetski — Middle- (Aug 2025)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_6', 'Legacy: Ivan Charnetski — Middle- (Aug 2025)', 'GENERAL', 'COMPLETED', 'mid-', 'NONE', false, 'LEGACY_IMPORT:ivan.charnetski@innowise.com:2025-08-01T00:00:00.000Z', '2025-08-01 00:00:00', '2025-08-08 00:00:00', '2025-08-01 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_6_1', 'legacy_a_6', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'ivan.charnetski@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_6_2', 'legacy_a_6', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'pavel.dubrouski@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_6_1', 'legacy_a_6', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'pavel.dubrouski@innowise.com'), 'Pavel Dubrouski', '2025-08-01 00:00:00', '2025-08-01 00:00:00', '2025-08-01 00:00:00', 'https://drive.google.com/file/d/1-Jz9uBac0JyL0Sh6RyHOOqjf0HTKGrIk/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_6_2', 'legacy_a_6', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'pavel.dubrouski@innowise.com'), 'Pavel Dubrouski', '2025-08-08 00:00:00', '2025-08-08 00:00:00', '2025-08-08 00:00:00', 'https://drive.google.com/file/d/11yKiItCr1sSZJnlBlXE-BskJ5mlM2k75/view', now(), now());

-- Legacy: Mukhammadjon Kayumov — Junior+ (Aug 2025)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_7', 'Legacy: Mukhammadjon Kayumov — Junior+ (Aug 2025)', 'GENERAL', 'COMPLETED', 'jun+', 'NONE', false, 'LEGACY_IMPORT:mukhammadjon.kayumov@innowise.com:2025-08-27T00:00:00.000Z', '2025-08-27 00:00:00', '2025-09-15 00:00:00', '2025-08-27 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_7_1', 'legacy_a_7', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'mukhammadjon.kayumov@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_7_2', 'legacy_a_7', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'mikhail.shatsila@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_7_3', 'legacy_a_7', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'andrei.rafalski@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_7_1', 'legacy_a_7', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2025-08-27 00:00:00', '2025-08-27 00:00:00', '2025-08-27 00:00:00', 'https://drive.google.com/file/d/1ca_LP659yOl76nf9ouDP77BAR0iG1qk5/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_7_2', 'legacy_a_7', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'andrei.rafalski@innowise.com'), 'Andrei Rafalski', '2025-09-15 00:00:00', '2025-09-15 00:00:00', '2025-09-15 00:00:00', NULL, now(), now());

-- Legacy: Yauheni Kryzhyk — Junior+ (Sep 2025)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_8', 'Legacy: Yauheni Kryzhyk — Junior+ (Sep 2025)', 'GENERAL', 'COMPLETED', 'jun+', 'NONE', false, 'LEGACY_IMPORT:yauheni.kryzhyk@innowise.com:2025-09-17T00:00:00.000Z', '2025-09-17 00:00:00', '2025-09-30 00:00:00', '2025-09-17 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_8_1', 'legacy_a_8', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'yauheni.kryzhyk@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_8_2', 'legacy_a_8', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'mikhail.shatsila@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_8_1', 'legacy_a_8', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2025-09-17 00:00:00', '2025-09-17 00:00:00', '2025-09-17 00:00:00', 'https://drive.google.com/file/d/1NHbEaSUo8F7ja3Ih6YNaHe_G1O12WOKc/view?usp=drive_web', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_8_2', 'legacy_a_8', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2025-09-30 00:00:00', '2025-09-30 00:00:00', '2025-09-30 00:00:00', NULL, now(), now());

-- Legacy: Andrei Khalaleyenka — Junior (Jan 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_9', 'Legacy: Andrei Khalaleyenka — Junior (Jan 2026)', 'GENERAL', 'COMPLETED', 'jun', 'NONE', false, 'LEGACY_IMPORT:andrei.khalaleyenka@innowise.com:2026-01-14T00:00:00.000Z', '2026-01-14 00:00:00', '2026-01-20 00:00:00', '2026-01-14 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_9_1', 'legacy_a_9', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'andrei.khalaleyenka@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_9_2', 'legacy_a_9', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'dzmitry.veka@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_9_1', 'legacy_a_9', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'dzmitry.veka@innowise.com'), 'Dzmitry Veka', '2026-01-14 00:00:00', '2026-01-14 00:00:00', '2026-01-14 00:00:00', 'https://drive.google.com/file/d/1-qXGlo34T8QWHIkbsKbglChccjh2KLCB/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_9_2', 'legacy_a_9', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'dzmitry.veka@innowise.com'), 'Dzmitry Veka', '2026-01-20 00:00:00', '2026-01-20 00:00:00', '2026-01-20 00:00:00', 'https://drive.google.com/file/d/1CgfZBNX6cy55XTSH_-o_MtHBS5ibKQQO/view?usp=sharing', now(), now());

-- Legacy: Alexander Yamrom — Junior (Feb 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_10', 'Legacy: Alexander Yamrom — Junior (Feb 2026)', 'GENERAL', 'COMPLETED', 'jun', 'NONE', false, 'LEGACY_IMPORT:alexander.yamrom@innowise.com:2026-02-03T00:00:00.000Z', '2026-02-03 00:00:00', '2026-02-06 00:00:00', '2026-02-03 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_10_1', 'legacy_a_10', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'alexander.yamrom@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_10_2', 'legacy_a_10', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'mikhail.shatsila@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_10_1', 'legacy_a_10', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-02-03 00:00:00', '2026-02-03 00:00:00', '2026-02-03 00:00:00', 'https://drive.google.com/file/d/1hDIEteSy-I9SWUZZ24HOdnYQ-n5sAkA4/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_10_2', 'legacy_a_10', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-02-06 00:00:00', '2026-02-06 00:00:00', '2026-02-06 00:00:00', 'https://drive.google.com/file/d/18VYUk9BdryY9iWB25ENTgy8D7n2S93xP/view', now(), now());

-- Legacy: Alex Gudkov — Middle- (Mar 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_11', 'Legacy: Alex Gudkov — Middle- (Mar 2026)', 'GENERAL', 'COMPLETED', 'mid-', 'NONE', false, 'LEGACY_IMPORT:alex.gudkov@innowise.com:2026-03-02T00:00:00.000Z', '2026-03-02 00:00:00', '2026-03-09 00:00:00', '2026-03-02 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_11_1', 'legacy_a_11', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'alex.gudkov@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_11_2', 'legacy_a_11', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'dzmitry.veka@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_11_1', 'legacy_a_11', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'dzmitry.veka@innowise.com'), 'Dzmitry Veka', '2026-03-02 00:00:00', '2026-03-02 00:00:00', '2026-03-02 00:00:00', 'https://drive.google.com/file/d/1ZJ_29a_QERSo-TBuc-Y2YtrrrkUOiMFP/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_11_2', 'legacy_a_11', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'dzmitry.veka@innowise.com'), 'Dzmitry Veka', '2026-03-09 00:00:00', '2026-03-09 00:00:00', '2026-03-09 00:00:00', 'https://drive.google.com/file/d/1KU2L4PSJ5WgAQIeAfLa6qMgtLqOc_Nd7/view', now(), now());

-- Legacy: Anatoly Dolgov — Middle (Mar 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_12', 'Legacy: Anatoly Dolgov — Middle (Mar 2026)', 'GENERAL', 'COMPLETED', 'mid', 'NONE', false, 'LEGACY_IMPORT:anatoli.dalhou@innowise.com:2026-03-03T00:00:00.000Z', '2026-03-03 00:00:00', '2026-04-07 00:00:00', '2026-03-03 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_12_1', 'legacy_a_12', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'anatoli.dalhou@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_12_2', 'legacy_a_12', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'mikhail.shatsila@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_12_1', 'legacy_a_12', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-03-03 00:00:00', '2026-03-03 00:00:00', '2026-03-03 00:00:00', 'https://drive.google.com/file/d/16RDbeQQVP01K_dHkD7Y159ykqXCZe5rs/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_12_2', 'legacy_a_12', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-03-10 00:00:00', '2026-03-10 00:00:00', '2026-03-10 00:00:00', 'https://drive.google.com/file/d/1k8rdw_5I23msbvSG9QZIawM0KpXTa6Ke/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_12_3', 'legacy_a_12', 'TECHNICAL_3', 'COMPLETED', 2, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-04-07 00:00:00', '2026-04-07 00:00:00', '2026-04-07 00:00:00', 'https://drive.google.com/file/d/1_26y_Lm30mBZL1TBZBZ8-UREaJD74vLL/view', now(), now());

-- Legacy: Uladzimir Rubakhin — Middle- (Mar 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_13', 'Legacy: Uladzimir Rubakhin — Middle- (Mar 2026)', 'GENERAL', 'COMPLETED', 'mid-', 'NONE', false, 'LEGACY_IMPORT:uladzimir.rubakhin@innowise.com:2026-03-09T00:00:00.000Z', '2026-03-09 00:00:00', '2026-03-31 00:00:00', '2026-03-09 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_13_1', 'legacy_a_13', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'uladzimir.rubakhin@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_13_2', 'legacy_a_13', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'mikhail.shatsila@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_13_1', 'legacy_a_13', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-03-09 00:00:00', '2026-03-09 00:00:00', '2026-03-09 00:00:00', 'https://drive.google.com/file/d/1tO4bdHeqFmaCGjL15ORZUQVqYF7UqFNf/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_13_2', 'legacy_a_13', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-03-18 00:00:00', '2026-03-18 00:00:00', '2026-03-18 00:00:00', 'https://drive.google.com/file/d/187b_4DRLCnrbN_qV-3XlFoDctee8q3lY/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_13_3', 'legacy_a_13', 'TECHNICAL_3', 'COMPLETED', 2, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-03-31 00:00:00', '2026-03-31 00:00:00', '2026-03-31 00:00:00', 'https://drive.google.com/file/d/15brJghlZYu0Gc79bGk8UnogaWf9wYuTp/view', now(), now());

-- Legacy: Yauheni Safonau — Intern (Mar 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_14', 'Legacy: Yauheni Safonau — Intern (Mar 2026)', 'GENERAL', 'COMPLETED', 'Intern', 'NONE', false, 'LEGACY_IMPORT:yauheni.safonau@innowise.com:2026-03-13T00:00:00.000Z', '2026-03-13 00:00:00', '2026-04-14 00:00:00', '2026-03-13 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_14_1', 'legacy_a_14', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'yauheni.safonau@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_14_2', 'legacy_a_14', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'anatoli.dalhou@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_14_1', 'legacy_a_14', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'anatoli.dalhou@innowise.com'), 'Anatoly Dolgov', '2026-03-13 00:00:00', '2026-03-13 00:00:00', '2026-03-13 00:00:00', 'https://drive.google.com/file/d/1hVKYKdXYaSlSmdlRjDz_XTTzwbIHGzb_/view?usp=drive_web', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_14_2', 'legacy_a_14', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'anatoli.dalhou@innowise.com'), 'Anatoly Dolgov', '2026-04-14 00:00:00', '2026-04-14 00:00:00', '2026-04-14 00:00:00', 'https://drive.google.com/file/d/1taL1kNgVtHmC6CRhGh4Yyd3EiOmRpV93/view?usp=drive_web', now(), now());

-- Legacy: Aleh Vasechka — Junior (Mar 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_15', 'Legacy: Aleh Vasechka — Junior (Mar 2026)', 'GENERAL', 'COMPLETED', 'jun', 'NONE', false, 'LEGACY_IMPORT:aleh.vasechka@innowise.com:2026-03-13T00:00:00.000Z', '2026-03-13 00:00:00', '2026-03-27 00:00:00', '2026-03-13 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_15_1', 'legacy_a_15', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'aleh.vasechka@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_15_2', 'legacy_a_15', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'raman.bikchantayeu@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_15_3', 'legacy_a_15', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'anatoli.dalhou@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_15_1', 'legacy_a_15', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'raman.bikchantayeu@innowise.com'), 'Raman Bikchantayeu', '2026-03-13 00:00:00', '2026-03-13 00:00:00', '2026-03-13 00:00:00', 'https://drive.google.com/file/d/1tB9HYFu5mVmkDw71NAJeePJ_Lu0U6a8Q/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_15_2', 'legacy_a_15', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'anatoli.dalhou@innowise.com'), 'Anatoly Dolgov', '2026-03-27 00:00:00', '2026-03-27 00:00:00', '2026-03-27 00:00:00', 'https://drive.google.com/file/d/1f8GRiiLmWVE-xirjJRyK8RFE2KgCubO-/view', now(), now());

-- Legacy: Pavel Stsefanovich — Junior+ (Apr 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_16', 'Legacy: Pavel Stsefanovich — Junior+ (Apr 2026)', 'PDP_CHECK', 'COMPLETED', 'jun+', 'NONE', false, 'LEGACY_IMPORT:pavel.stsefanovich@innowise.com:2026-04-23T00:00:00.000Z', '2026-04-23 00:00:00', '2026-04-23 00:00:00', '2026-04-23 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_16_1', 'legacy_a_16', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'pavel.stsefanovich@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_16_2', 'legacy_a_16', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'mikhail.shatsila@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_16_1', 'legacy_a_16', 'PDP_TECH', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-04-23 00:00:00', '2026-04-23 00:00:00', '2026-04-23 00:00:00', 'https://drive.google.com/file/d/1VFi-3Wx5E9ZuIAPSPSYhYv1NSrC8R5K9/view', now(), now());

-- Legacy: Mikita Kutas — Junior+ (Apr 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_17', 'Legacy: Mikita Kutas — Junior+ (Apr 2026)', 'PDP_CHECK', 'COMPLETED', 'jun+', 'NONE', false, 'LEGACY_IMPORT:mikita.kutas@innowise.com:2026-04-28T00:00:00.000Z', '2026-04-28 00:00:00', '2026-04-28 00:00:00', '2026-04-28 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_17_1', 'legacy_a_17', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'mikita.kutas@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_17_2', 'legacy_a_17', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'mikhail.shatsila@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_17_1', 'legacy_a_17', 'PDP_TECH', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'mikhail.shatsila@innowise.com'), 'Michael Shatilo', '2026-04-28 00:00:00', '2026-04-28 00:00:00', '2026-04-28 00:00:00', 'https://drive.google.com/file/d/1uO8Ub4EjlH7Vc7-t2j58LOe1PdxPA6Go/view', now(), now());

-- Legacy: Sergey Pechko — Senior (May 2026)
INSERT INTO "Assessment" ("id","title","assessmentType","status","grade","reviewStatus","gradeUpgraded","notes","scheduledAt","completedAt","createdAt","updatedAt")
VALUES ('legacy_a_18', 'Legacy: Sergey Pechko — Senior (May 2026)', 'GENERAL', 'COMPLETED', 'sen', 'NONE', false, 'LEGACY_IMPORT:sergey.pechko@innowise.com:2026-05-21T00:00:00.000Z', '2026-05-21 00:00:00', '2026-05-29 00:00:00', '2026-05-21 00:00:00', now());
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_18_1', 'legacy_a_18', u."id", 'SUBJECT', now(), now()
FROM "User" u WHERE u."email" = 'sergey.pechko@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_18_2', 'legacy_a_18', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'illia.drahun@innowise.com';
INSERT INTO "AssessmentParticipant" ("id","assessmentId","userId","participantRole","createdAt","updatedAt")
SELECT 'legacy_p_18_3', 'legacy_a_18', u."id", 'ASSESSOR', now(), now()
FROM "User" u WHERE u."email" = 'andrei.bylinovich@innowise.com';
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_18_1', 'legacy_a_18', 'TECHNICAL_1', 'COMPLETED', 0, 60, (SELECT "id" FROM "User" WHERE "email" = 'illia.drahun@innowise.com'), 'Illia Drahun', '2026-05-21 00:00:00', '2026-05-21 00:00:00', '2026-05-21 00:00:00', 'https://drive.google.com/file/d/1W4sSMmfjbMElxAgAmZWSfmryrsJz3uBH/view', now(), now());
INSERT INTO "AssessmentSession" ("id","assessmentId","type","status","order","durationMin","assessorId","assessorName","scheduledAt","startedAt","completedAt","recordingLink","createdAt","updatedAt")
VALUES ('legacy_s_18_2', 'legacy_a_18', 'TECHNICAL_2', 'COMPLETED', 1, 60, (SELECT "id" FROM "User" WHERE "email" = 'andrei.bylinovich@innowise.com'), 'Andrei Bylinovich', '2026-05-29 00:00:00', '2026-05-29 00:00:00', '2026-05-29 00:00:00', 'https://drive.google.com/file/d/1HZ1zyUpCbpXenuk05h5GD56vB9dAZbSK/view', now(), now());

