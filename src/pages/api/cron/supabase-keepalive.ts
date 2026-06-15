import { createClient } from "@supabase/supabase-js";
import type { NextApiRequest, NextApiResponse } from "next";

type KeepaliveResponse = {
  ok: boolean;
  checkedAt: string;
  error?: string;
};

const getSupabaseConfig = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables.");
  }

  return { url, key };
};

const isAuthorized = (request: NextApiRequest) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return true;
  }

  return request.headers.authorization === `Bearer ${cronSecret}`;
};

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse<KeepaliveResponse>
) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({
      ok: false,
      checkedAt: new Date().toISOString(),
      error: "Method not allowed."
    });
  }

  if (!isAuthorized(request)) {
    return response.status(401).json({
      ok: false,
      checkedAt: new Date().toISOString(),
      error: "Unauthorized."
    });
  }

  try {
    const { url, key } = getSupabaseConfig();
    const supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { error } = await supabase
      .from("transactions")
      .select("id", { head: true })
      .limit(1);

    if (error) {
      throw error;
    }

    response.setHeader("Cache-Control", "no-store");
    return response.status(200).json({
      ok: true,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return response.status(503).json({
      ok: false,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Supabase keepalive failed."
    });
  }
}
