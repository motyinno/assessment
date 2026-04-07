"use client";

import { Fragment } from "react";
import {
  SESSION_TYPE_LABELS,
  SESSION_STATUS_LABELS,
} from "@/lib/assessment-sessions";

interface Session {
  id: string;
  type: string;
  status: string;
  order: number;
  durationMin: number;
  assessorId: string | null;
  assessorName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
}

interface AssessmentProgressProps {
  sessions: Session[];
  isAssessor: boolean;
  onSessionAction: (sessionId: string, action: "start" | "complete") => void;
  loading?: boolean;
}

export function AssessmentProgress({
  sessions,
  isAssessor,
  onSessionAction,
  loading,
}: AssessmentProgressProps) {
  const activeSessions = sessions.filter((s) => s.status !== "SKIPPED");
  const completedCount = activeSessions.filter(
    (s) => s.status === "COMPLETED"
  ).length;
  const totalCount = activeSessions.length;
  const completedHours = activeSessions
    .filter((s) => s.status === "COMPLETED")
    .reduce((sum, s) => sum + s.durationMin / 60, 0);
  const totalHours = activeSessions.reduce(
    (sum, s) => sum + s.durationMin / 60,
    0
  );

  function canStart(session: Session): boolean {
    if (session.status !== "NOT_STARTED") return false;
    return sessions
      .filter((s) => s.order < session.order)
      .every((s) => s.status === "COMPLETED" || s.status === "SKIPPED");
  }

  function getLineColor(prevSession: Session): string {
    if (
      prevSession.status === "COMPLETED" ||
      prevSession.status === "SKIPPED"
    ) {
      return "bg-emerald-500";
    }
    return "bg-gray-300";
  }

  return (
    <div className="bg-white border rounded-xl p-6 space-y-4">
      {/* Stepper */}
      <div className="flex items-start">
        {sessions.map((session, index) => (
          <Fragment key={session.id}>
            {index > 0 && (
              <div className="flex-1 flex items-center pt-5">
                <div
                  className={`h-0.5 w-full ${getLineColor(sessions[index - 1])}`}
                />
              </div>
            )}
            <div
              className="flex flex-col items-center"
              style={{ minWidth: 100 }}
            >
              {/* Circle */}
              {session.status === "COMPLETED" && (
                <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
              {session.status === "SKIPPED" && (
                <div className="w-10 h-10 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 12h14"
                    />
                  </svg>
                </div>
              )}
              {session.status === "IN_PROGRESS" && (
                <div className="w-10 h-10 rounded-full bg-blue-500 text-white ring-4 ring-blue-200 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-white" />
                </div>
              )}
              {session.status === "NOT_STARTED" && (
                <div className="w-10 h-10 rounded-full bg-gray-100 border-2 border-gray-300 text-gray-400 flex items-center justify-center text-sm font-medium">
                  {session.order + 1}
                </div>
              )}

              {/* Label */}
              <span
                className={`mt-2 text-xs text-center leading-tight ${
                  session.status === "SKIPPED"
                    ? "line-through text-gray-400"
                    : session.status === "IN_PROGRESS"
                      ? "text-blue-600 font-medium"
                      : session.status === "COMPLETED"
                        ? "text-emerald-600"
                        : "text-gray-500"
                }`}
              >
                {SESSION_TYPE_LABELS[session.type] ?? session.type}
              </span>

              {/* Status */}
              <span
                className={`text-[10px] leading-tight ${
                  session.status === "SKIPPED"
                    ? "line-through text-gray-400"
                    : session.status === "IN_PROGRESS"
                      ? "text-blue-600 font-medium"
                      : session.status === "COMPLETED"
                        ? "text-emerald-600"
                        : "text-gray-400"
                }`}
              >
                {SESSION_STATUS_LABELS[session.status] ?? session.status}
              </span>

              {/* Assessor name */}
              {session.assessorName && (session.status === "COMPLETED" || session.status === "IN_PROGRESS") && (
                <span className="text-[10px] text-muted-foreground mt-0.5 max-w-[100px] truncate" title={session.assessorName}>
                  {session.assessorName}
                </span>
              )}

              {/* Action button for assessor */}
              {isAssessor && session.status === "IN_PROGRESS" && (
                <button
                  className="mt-2 text-xs px-3 py-1 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={loading}
                  onClick={() => onSessionAction(session.id, "complete")}
                >
                  Завершить
                </button>
              )}
              {isAssessor && canStart(session) && (
                <button
                  className="mt-2 text-xs px-3 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={loading}
                  onClick={() => onSessionAction(session.id, "start")}
                >
                  Начать
                </button>
              )}
            </div>
          </Fragment>
        ))}
      </div>

      {/* Summary */}
      <div className="text-sm text-muted-foreground text-center pt-2 border-t">
        Прогресс: {completedCount} из {totalCount} сессий &middot;{" "}
        {completedHours} из {totalHours} ч.
      </div>
    </div>
  );
}
