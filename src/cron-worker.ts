export default {
  async scheduled(event: any, env: any, ctx: any) {
    console.log("Cron triggered - running batch sync");
    try {
      const response = await fetch("https://jobs.spearyx.com/api/v2/sync-batch", {
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
