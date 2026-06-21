import { getPlatformProxy } from "wrangler";

async function main() {
  try {
    const proxy = await getPlatformProxy({
      configPath: "./wrangler.toml",
    });
    console.log("Proxy env keys:", Object.keys(proxy.env));
    console.log("DB exists:", !!proxy.env.DB);
  } catch (e) {
    console.error("getPlatformProxy error:", e);
  }
}

main().catch(console.error);
