"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC_KEY =
  "BMOzkN1-Mkhxh54UyUiZPqkNifNugFPmuDQ39yfCaLam18cT67KskKynxF0B4tWmYb3tdEcGAgV_du5jCHUeIrY";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "unsupported" | "prompt" | "subscribed" | "denied" | "working";

export default function PushBanner() {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker.register("/sw.js");
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "subscribed" : "prompt");
    });
  }, []);

  async function subscribe() {
    setState("working");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "prompt");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json = sub.toJSON();
      await supabase.from("push_subscriptions").upsert(
        {
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
        { onConflict: "endpoint" }
      );
      setState("subscribed");
    } catch (e) {
      console.error(e);
      setState("prompt");
    }
  }

  if (state === null || state === "unsupported" || state === "subscribed") return null;

  return (
    <div className="pushbanner">
      {state === "denied" ? (
        <span>알림이 차단돼 있어요. 브라우저 설정에서 허용해 주세요.</span>
      ) : (
        <>
          <span>⭐ 상품 재입고 알림을 받으려면 알림을 켜주세요.</span>
          <button className="btn primary" disabled={state === "working"} onClick={subscribe}>
            {state === "working" ? "설정 중…" : "알림 켜기"}
          </button>
        </>
      )}
    </div>
  );
}
