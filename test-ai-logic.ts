import { AI_MODELS } from './src/lib/ai/types';
import { JOB_SCORE_ALL_PROMPT } from './src/lib/ai/prompts';

async function testAI() {
    console.log("Testing AI scoring...");
    console.log("Model:", "@cf/qwen/qwen3-30b-a3b-fp8");

    // This is a dummy script because I can't easily run Cloudflare AI locally without wrangler
    // But I can check if the prompt and logic would work if I had a sample response.
}

testAI();
