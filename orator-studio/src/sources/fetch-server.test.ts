import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { fetchSource, isPrivateAddress } from "./fetch-server";

describe("source fetcher safety", () => {
  it("knows private addresses", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "34.117.59.81", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("refuses http, unlisted hosts, and internal addresses", async () => {
    await expect(fetchSource("http://example.com/data.json", null)).rejects.toThrow(/Only https/);
    await expect(fetchSource("https://example.com/data.json", ["open-meteo.com"])).rejects.toThrow(/not on this institution's list/);
    await expect(fetchSource("https://127.0.0.1/data.json", null)).rejects.toThrow(/private or internal/);
    await expect(fetchSource("https://169.254.169.254/latest/meta-data", null)).rejects.toThrow(/private or internal/);
    await expect(fetchSource("not a url", null)).rejects.toThrow(/valid URL/);
  });

  it("fetches an allowed host, checks redirects, and fingerprints the response", async () => {
    const server = createServer((req, res) => {
      if (req.url === "/old") {
        res.writeHead(302, { location: "/data.json" });
        return res.end();
      }
      if (req.url === "/escape") {
        res.writeHead(302, { location: "http://169.254.169.254/latest" });
        return res.end();
      }
      if (req.url === "/page") {
        res.writeHead(200, { "content-type": "text/html" });
        return res.end("<html></html>");
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"daily":{"time":["2026-01-01","2026-01-02"],"t":[1,2]}}');
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      const got = await fetchSource(`http://127.0.0.1:${port}/old`, ["127.0.0.1"]);
      expect(got.finalUrl).toBe(`http://127.0.0.1:${port}/data.json`);
      expect(JSON.parse(got.text).daily.t).toEqual([1, 2]);
      expect(got.sha256).toMatch(/^[0-9a-f]{64}$/);
      await expect(fetchSource(`http://127.0.0.1:${port}/escape`, ["127.0.0.1"])).rejects.toThrow(/Only https|not on this institution's list/);
      await expect(fetchSource(`http://127.0.0.1:${port}/page`, ["127.0.0.1"])).rejects.toThrow(/not JSON, XML or CSV/);
    } finally {
      server.close();
    }
  });
});
