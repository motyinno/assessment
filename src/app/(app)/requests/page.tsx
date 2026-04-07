"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface RequestUser {
  id: string;
  name: string;
  email: string;
  grade?: string | null;
}

interface Assessor {
  id: string;
  name: string;
  email: string;
}

interface Assessment {
  id: string;
  title: string;
  status: string;
}

interface AssessmentRequest {
  id: string;
  grade: string;
  notes: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  user: RequestUser;
  assessor: Assessor | null;
  assessment: Assessment | null;
}

const gradeLabels: Record<string, string> = {
  jun: "Junior",
  mid: "Middle",
  sen: "Senior",
};

export default function RequestsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<AssessmentRequest[]>([]);
  const [assessors, setAssessors] = useState<Assessor[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AssessmentRequest | null>(null);
  const [selectedAssessorIds, setSelectedAssessorIds] = useState<string[]>([]);
  const [adminNotes, setAdminNotes] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as { role?: string } | undefined)?.role;
    if (role !== "ADMIN") {
      router.push("/dashboard");
      return;
    }
    fetchRequests();
    fetchAssessors();
  }, [session, status, router]);

  async function fetchRequests() {
    const res = await fetch("/api/assessment-requests");
    if (res.ok) setRequests(await res.json());
  }

  async function fetchAssessors() {
    const res = await fetch("/api/users");
    if (res.ok) {
      const users = await res.json();
      setAssessors(users.filter((u: { role: string }) => u.role === "ASSESSOR"));
    }
  }

  function openReview(req: AssessmentRequest) {
    setSelected(req);
    setSelectedAssessorIds([]);
    setAdminNotes("");
    setOpen(true);
  }

  function toggleAssessor(id: string) {
    setSelectedAssessorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleDecision(newStatus: "APPROVED" | "REJECTED") {
    if (!selected) return;

    const payload: Record<string, unknown> = { status: newStatus, adminNotes };
    if (newStatus === "APPROVED") {
      if (selectedAssessorIds.length === 0) return;
      payload.assessorIds = selectedAssessorIds;
    }

    const res = await fetch(`/api/assessment-requests/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setOpen(false);
      setSelected(null);
      fetchRequests();
    }
  }

  function renderStatusBadge(s: string) {
    switch (s) {
      case "PENDING":
        return <Badge variant="outline" className="border-yellow-500 text-yellow-600">На рассмотрении</Badge>;
      case "APPROVED":
        return <Badge variant="default" className="bg-green-600">Одобрена</Badge>;
      case "REJECTED":
        return <Badge variant="destructive">Отклонена</Badge>;
      default:
        return <Badge variant="secondary">{s}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Заявки на ассессмент</h1>
        <p className="text-muted-foreground">Рассмотрение заявок от сотрудников</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Грейд</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((req) => (
                <TableRow key={req.id}>
                  <TableCell className="font-medium">{req.user.name}</TableCell>
                  <TableCell>{gradeLabels[req.grade] || req.grade}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(req.createdAt).toLocaleDateString("ru-RU")}
                  </TableCell>
                  <TableCell>{renderStatusBadge(req.status)}</TableCell>
                  <TableCell>
                    {req.status === "PENDING" && (
                      <Button variant="outline" size="sm" onClick={() => openReview(req)}>
                        Рассмотреть
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Рассмотрение заявки</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Сотрудник</p>
                <p className="font-medium">{selected.user.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Грейд</p>
                <p className="font-medium">{gradeLabels[selected.grade] || selected.grade}</p>
              </div>
              {selected.notes && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Комментарий сотрудника</p>
                  <p className="text-sm">{selected.notes}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Назначить асессоров</Label>
                <div className="border rounded-md p-2 space-y-1 max-h-40 overflow-y-auto">
                  {assessors.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAssessorIds.includes(a.id)}
                        onChange={() => toggleAssessor(a.id)}
                        className="rounded border-gray-300"
                      />
                      <span>{a.name}</span>
                      <span className="text-muted-foreground text-xs">{a.email}</span>
                    </label>
                  ))}
                </div>
                {selectedAssessorIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Выбрано: {selectedAssessorIds.length}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Комментарий администратора</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Комментарий (необязательно)"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="destructive"
                  onClick={() => handleDecision("REJECTED")}
                >
                  Отклонить
                </Button>
                <Button
                  onClick={() => handleDecision("APPROVED")}
                  disabled={selectedAssessorIds.length === 0}
                >
                  Одобрить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
