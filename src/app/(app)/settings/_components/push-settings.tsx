"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { enablePush, pushSupported, thisDeviceHasPush } from "@/components/push/push-client";
import { removePushSubscriptionAction, sendTestPushAction, setPushEnabledAction } from "@/app/push-actions";
import { InfoBox, PanelHeader, SettingsPanel } from "./settings-ui";

/**
 * Settings -> Push Notifications (AJ, 2026-10-03): one master switch for the signed-in person, plus this browser's
 * own state. What gets pushed is decided by the kind of alert (new order, event tomorrow, payment...), not here.
 */
export function PushSettings({ enabled, devices, vapidPublicKey }: { enabled: boolean; devices: number; vapidPublicKey: string | null }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [here, setHere] = useState<boolean | null>(null);
  const [supported, setSupported] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // Browser capabilities are only knowable after mount (this effect runs on the client only).
    /* eslint-disable react-hooks/set-state-in-effect */
    setSupported(pushSupported());
    setBlocked(pushSupported() && Notification.permission === "denied");
    /* eslint-enable react-hooks/set-state-in-effect */
    thisDeviceHasPush().then(setHere);
  }, [devices]);

  function toggleMaster(next: boolean) {
    setOn(next);
    startTransition(async () => {
      await setPushEnabledAction(next);
      router.refresh();
    });
  }

  function enableHere() {
    setMessage(null);
    startTransition(async () => {
      const result = await enablePush(vapidPublicKey!);
      if (result === "enabled") setMessage({ ok: true, text: "Notifications are on for this browser." });
      else if (result === "denied") setMessage({ ok: false, text: "Notifications are blocked in your browser. Allow them for this site in the address bar, then try again." });
      else setMessage({ ok: false, text: "We couldn't turn notifications on in this browser." });
      setHere(await thisDeviceHasPush());
      router.refresh();
    });
  }

  function disableHere() {
    startTransition(async () => {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setHere(false);
      router.refresh();
    });
  }

  function sendTest() {
    setMessage(null);
    startTransition(async () => {
      const result = await sendTestPushAction();
      setMessage({ ok: result.ok, text: result.message });
    });
  }

  return (
    <>
      <SettingsPanel>
        <PanelHeader icon={Bell} title="Push Notifications" description="Alerts on your phone or computer for new orders, event reminders and payments, even when Platterly is closed." />
        <div className="flex items-center gap-3 py-1">
          <div className="min-w-0 flex-1">
            <Label htmlFor="push-master" className="text-sm font-medium">
              Send me push notifications
            </Label>
            <p className="text-sm text-muted-foreground">One switch for you. Turn it off to stop every push to all your devices.</p>
          </div>
          <Switch id="push-master" checked={on} disabled={pending} onCheckedChange={toggleMaster} />
        </div>
      </SettingsPanel>

      <SettingsPanel>
        <PanelHeader icon={Smartphone} title="This browser" description={`${devices} device${devices === 1 ? "" : "s"} receiving push for your account.`} />
        {!vapidPublicKey ? (
          <InfoBox tone="warning" title="Push isn't set up on this server yet">
            The Platterly team needs to add the push keys before notifications can be turned on.
          </InfoBox>
        ) : !supported ? (
          <InfoBox tone="warning" title="This browser can't receive push notifications">
            On an iPhone, add Platterly to your Home Screen first, then open it from there.
          </InfoBox>
        ) : blocked ? (
          <InfoBox tone="warning" title="Notifications are blocked">
            Allow notifications for this site in your browser&apos;s address bar, then come back here.
          </InfoBox>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            {here ? (
              <>
                <span className="text-sm font-medium text-success">Notifications are on for this browser.</span>
                <Button variant="outline" size="md" disabled={pending} onClick={sendTest}>
                  Send a test
                </Button>
                <Button variant="ghost" size="md" disabled={pending} onClick={disableHere}>
                  <BellOff className="size-4" aria-hidden /> Turn off for this browser
                </Button>
              </>
            ) : (
              <Button size="md" disabled={pending} onClick={enableHere}>
                <Bell className="size-4" aria-hidden /> Turn on for this browser
              </Button>
            )}
          </div>
        )}
        {message && (
          <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}>
            {message.text}
          </p>
        )}
      </SettingsPanel>
    </>
  );
}
