import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Channel-scoped contact de-duplication for non-phone identities
 * (Instagram IGSID today; any future channel keyed by an opaque
 * external id reuses this same lookup). WhatsApp keeps using
 * `findExistingContact` in dedupe.ts unchanged — phone matching has
 * different tolerance rules (trunk-prefix match) that don't apply to
 * an opaque platform ID.
 */
export interface ExternalContact {
  id: string;
  channel: string;
  external_id: string | null;
  [key: string]: unknown;
}

export async function findExistingContactByExternalId(
  db: SupabaseClient,
  accountId: string,
  channel: string,
  externalId: string,
): Promise<ExternalContact | null> {
  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("account_id", accountId)
    .eq("channel", channel)
    .eq("external_id", externalId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ExternalContact;
}
