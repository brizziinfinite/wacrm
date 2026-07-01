"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PostizIntegration {
  id: string;
  name: string;
  identifier: string;
  picture: string;
  type: string;
}

export interface ConnectedChannel {
  id: string;
  platform: string;
  account_name: string | null;
  account_avatar: string | null;
  is_active: boolean;
  postiz_integration_id: string;
  postiz_username: string | null;
}

export function useChannels(brandId: string | null) {
  const [channels, setChannels] = useState<ConnectedChannel[]>([]);
  const [available, setAvailable] = useState<PostizIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  const supabase = createClient();

  const fetchConnected = useCallback(async () => {
    if (!brandId) { setChannels([]); setLoading(false); return; }
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/postiz-integrations?action=list&brand_id=${brandId}`,
      { headers: { Authorization: `Bearer ${session?.access_token}` } }
    );
    const json = await res.json();
    setChannels(json.accounts ?? []);
    setLoading(false);
  }, [brandId, supabase]);

  const fetchAvailable = useCallback(async () => {
    setLoadingAvailable(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/postiz-integrations?action=available`,
      { headers: { Authorization: `Bearer ${session?.access_token}` } }
    );
    const json = await res.json();
    setAvailable(json.integrations ?? []);
    setLoadingAvailable(false);
  }, [supabase]);

  const connect = useCallback(async (integration: PostizIntegration) => {
    if (!brandId) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/postiz-integrations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          brand_id: brandId,
          postiz_integration_id: integration.id,
          platform: integration.type,
          account_name: integration.name,
          account_avatar: integration.picture,
        }),
      }
    );
    await fetchConnected();
  }, [brandId, supabase, fetchConnected]);

  const disconnect = useCallback(async (channelId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/postiz-integrations?id=${channelId}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${session?.access_token}` } }
    );
    await fetchConnected();
  }, [supabase, fetchConnected]);

  useEffect(() => { fetchConnected(); }, [fetchConnected]);

  return { channels, available, loading, loadingAvailable, fetchAvailable, connect, disconnect, refetch: fetchConnected };
}
