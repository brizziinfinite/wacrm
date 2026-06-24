"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export type PostStatus = "draft" | "scheduled" | "published" | "failed";

export interface Post {
  id: string;
  account_id: string;
  brand_id: string;
  content: string | null;
  scheduled_at: string | null;
  status: PostStatus;
  platform: string | null;
  created_at: string;
  updated_at: string;
}

export function usePosts(brandId: string | null) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    if (!brandId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("posts")
      .select("*")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });
    setPosts((data as Post[]) ?? []);
    setLoading(false);
  }, [brandId]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  return { posts, loading, refetch: fetchPosts };
}
