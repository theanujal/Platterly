"use client";

import { Button, Card, Field, inputClass } from "@/components/ui";
import { RichEditor, type LibraryPicture } from "@/components/rich-editor";
import { useFormAction } from "@/lib/use-form-action";
import { deleteIssueAction, saveIssueAction, scheduleIssueAction, sendTestAction, unscheduleIssueAction, type NewsletterFormState } from "./actions";

function Feedback({ state }: { state: NewsletterFormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
      {state.saved ? <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{state.saved}</p> : null}
    </>
  );
}

export function IssueForm({ issue, library, editable }: { issue: { id: string; subject: string; body: string; status: string; sendAt: string; sentCount: number; failedCount: number }; library: LibraryPicture[]; editable: boolean }) {
  const save = useFormAction(saveIssueAction, {});
  const test = useFormAction(sendTestAction, {});
  const schedule = useFormAction(scheduleIssueAction, {});
  if (!editable) {
    return (
      <Card>
        <p className="text-sm">{issue.status === "SENT" ? `Sent to ${issue.sentCount} people${issue.failedCount ? `, ${issue.failedCount} failed` : ""}.` : `Sending: ${issue.sentCount} sent so far.`}</p>
        <h2 className="mt-3 text-sm font-semibold">{issue.subject}</h2>
        <pre className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{issue.body}</pre>
      </Card>
    );
  }
  return (
    <div className="grid gap-4">
      <form onSubmit={save.onSubmit} className="grid gap-4" aria-label="Issue">
        <Card>
          <div className="grid gap-4">
            <input type="hidden" name="id" value={issue.id} />
            <Field label="Subject" htmlFor="subject"><input id="subject" name="subject" maxLength={200} defaultValue={issue.subject} className={inputClass} /></Field>
            <RichEditor name="body" label="Issue text" initial={issue.body} library={library} hint="A line with only a link becomes a button." />
            <Feedback state={save.state} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={save.pending}>{save.pending ? "Saving…" : "Save"}</Button>
              <Button type="button" variant="outline" disabled={test.pending} onClick={(e) => { const form = (e.currentTarget as HTMLButtonElement).form; if (form) test.onSubmit({ preventDefault() {}, currentTarget: form } as unknown as React.FormEvent<HTMLFormElement>); }}>Send test to me</Button>
            </div>
            <Feedback state={test.state} />
          </div>
        </Card>
      </form>
      <Card>
        <form onSubmit={schedule.onSubmit} className="grid max-w-xl gap-3" aria-label="Schedule">
          <h2 className="text-sm font-semibold">{issue.status === "SCHEDULED" ? "Scheduled" : "Send"}</h2>
          <input type="hidden" name="id" value={issue.id} />
          <Field label="Send at" htmlFor="sendAt" hint="India time. Save your changes first: the text as last saved is what goes out. It goes to everyone who has the newsletter switched on, in batches, from the time you pick."><input id="sendAt" name="sendAt" type="datetime-local" defaultValue={issue.sendAt} className={inputClass} /></Field>
          <Feedback state={schedule.state} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={schedule.pending}>{issue.status === "SCHEDULED" ? "Change the time" : "Schedule"}</Button>
          </div>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {issue.status === "SCHEDULED" ? <form action={unscheduleIssueAction}><input type="hidden" name="id" value={issue.id} /><Button type="submit" variant="outline">Back to draft</Button></form> : null}
          {issue.status === "DRAFT" ? <form action={deleteIssueAction}><input type="hidden" name="id" value={issue.id} /><Button type="submit" variant="outline">Delete draft</Button></form> : null}
        </div>
      </Card>
    </div>
  );
}
