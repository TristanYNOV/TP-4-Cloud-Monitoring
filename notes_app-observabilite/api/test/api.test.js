import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import { createApp } from "../src/app.js";

describe("API", () => {
  it("GET /health -> 200 and no DB call", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const app = createApp({ pool });

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "up" });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it("GET /health/db -> 200 when DB answers", async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const app = createApp({ pool });

    const res = await request(app).get("/health/db");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("POST /notes without title -> 400", async () => {
    const pool = { query: vi.fn() };
    const app = createApp({ pool });

    const res = await request(app).post("/notes").send({ content: "yo" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "title is required" });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
