"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTaskAction, deleteTaskAction, setTaskDoneAction } from "../event-ops-actions";

export interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  /** YYYY-MM-DD. */
  dueDate: string | null;
  done: boolean;
  assignee: string | null;
}

const ANYONE = "anyone";
const today = () => new Date().toISOString().slice(0, 10);
const formatDue = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

/** The event's checklist. Ticked off by whoever does it; nothing is created for you. */
export function TasksCard({ orderId, eventId, tasks, people, canAdd, canEdit }: { orderId: string | null; eventId: string; tasks: TaskRow[]; people: { assignmentId: string; name: string }[]; canAdd: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState(ANYONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const open = tasks.filter((t) => !t.done).length;

  async function add() {
    if (!title.trim()) return;
    setPending(true);
    setError(null);
    const result = await createTaskAction(orderId, eventId, { title, notes: "", dueDate: due, assignmentId: assignee === ANYONE ? "" : assignee });
    setPending(false);
    if (!result.ok) return setError(result.error);
    setTitle("");
    setDue("");
    router.refresh();
  }

  async function toggle(id: string, done: boolean) {
    const result = await setTaskDoneAction(orderId, id, done);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  async function remove(id: string) {
    const result = await deleteTaskAction(orderId, id);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  return (
    <Card
      data-testid="tasks-card"
      onKeyDown={(e) => {
        // Saves by itself; Enter must add the task, never submit the order form around this card.
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          if (e.target.getAttribute("aria-label") === "Task") void add();
        }
      }}
    >
      <CardHeader>
        <CardTitle>Tasks ({open} open{tasks.length > open ? `, ${tasks.length - open} done` : ""})</CardTitle>
        <p className="text-sm text-muted-foreground">A checklist for this event, such as loading, vehicle check, setup, collection.</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3" data-done={t.done}>
                <Checkbox aria-label={`Done: ${t.title}`} checked={t.done} disabled={!canEdit} onCheckedChange={(c) => void toggle(t.id, c === true)} />
                <div className="min-w-40 flex-1">
                  <p className={t.done ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{t.title}</p>
                  {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                </div>
                {t.assignee && <Badge variant="neutral">{t.assignee}</Badge>}
                {t.dueDate && <Badge variant={!t.done && t.dueDate < today() ? "danger" : "outline"}>Due {formatDue(t.dueDate)}</Badge>}
                {canEdit && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Delete task ${t.title}`} onClick={() => void remove(t.id)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canAdd && (
          <div className="flex flex-wrap items-end gap-2">
            <Input className="min-w-52 flex-1" aria-label="Task" placeholder="New task" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input className="w-40" aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <Select items={{ [ANYONE]: "Anyone", ...Object.fromEntries(people.map((p) => [p.assignmentId, p.name])) }} value={assignee} onValueChange={(v) => setAssignee(v ?? ANYONE)}>
              <SelectTrigger aria-label="Give to" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANYONE}>Anyone</SelectItem>
                {people.map((p) => (
                  <SelectItem key={p.assignmentId} value={p.assignmentId}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" disabled={!title.trim() || pending} onClick={() => void add()}>
              <Plus /> Add task
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
