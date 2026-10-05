"use client";

import { useCallback, useState, useTransition } from "react";

/**
 * Runs a server action from a form WITHOUT React's automatic form reset. With `<form action={...}>` React clears every
 * uncontrolled field once the action finishes, even when it only said "that GSTIN is not valid", so a person correcting one
 * field would lose everything else they typed. This keeps what was typed and shows the action's answer next to it.
 */
export function useFormAction<State>(action: (state: State, formData: FormData) => Promise<State>, initial: State) {
  const [state, setState] = useState<State>(initial);
  const [pending, startTransition] = useTransition();
  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startTransition(async () => {
        setState(await action(state, formData));
      });
    },
    [action, state],
  );
  return { state, onSubmit, pending };
}
