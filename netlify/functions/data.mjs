// Netlify Function: 账本云端存储 API
// GET  /.netlify/functions/data  -> 读取账本
// PUT  /.netlify/functions/data  -> 保存账本
// 访问码通过 x-access-code 请求头（或 ?code= 参数）校验，可在 Netlify 环境变量 ACCESS_CODE 中配置

import { getStore } from "@netlify/blobs";

const STORE_NAME = "fishbook";
const KEY = "ledger";
const DEFAULT_CODE = "fishbook-2026";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-access-code",
      "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
    },
  });
}

function getAccessCode(req) {
  const header = req.headers.get("x-access-code") || "";
  const url = new URL(req.url);
  const query = url.searchParams.get("code") || "";
  return header || query;
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type, x-access-code",
        "access-control-allow-methods": "GET, PUT, POST, OPTIONS",
      },
    });
  }

  const expected = process.env.ACCESS_CODE || DEFAULT_CODE;
  const provided = getAccessCode(req);
  if (provided !== expected) {
    return json({ error: "unauthorized", message: "访问码错误" }, 401);
  }

  const store = getStore(STORE_NAME);

  try {
    if (req.method === "GET") {
      // 强一致性读取，避免写入后立即读取拿到旧值
      const rec = await store.get(KEY, { type: "json", consistency: "strong" });
      if (!rec) return json({ data: null, updatedAt: 0 });
      return json({ data: rec.data ?? null, updatedAt: rec.updatedAt || 0 });
    }

    if (req.method === "PUT" || req.method === "POST") {
      const body = await req.json();
      if (!body || typeof body !== "object" || !body.data) {
        return json({ error: "bad-request", message: "缺少 data 字段" }, 400);
      }
      const rec = { data: body.data, updatedAt: Date.now() };
      await store.setJSON(KEY, rec);
      return json({ ok: true, updatedAt: rec.updatedAt });
    }

    return json({ error: "method-not-allowed" }, 405);
  } catch (err) {
    return json({ error: "server-error", message: String(err && err.message ? err.message : err) }, 500);
  }
};

