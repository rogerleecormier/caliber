export default {
  async scheduled(_event: any, _env: any, _ctx: any) {
    console.log("Cron triggered - running batch sync");
    try {
      const response = await fetch("https://caliber.rcormier.dev/api/v2/sync-batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      console.log(`Batch sync response: ${response.status}`);
      const data = await response.json();
      console.log(`Batch result:`, data);
    } catch (error) {
      console.error("Cron batch sync failed:", error);
    }
  }
}
