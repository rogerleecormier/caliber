import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";
import { getAIFromContext } from "../../../lib/ai";
import { getD1FromContext } from "../../../db/db";
import type { JobWithCategory } from "../../../lib/search-utils";

const UNICORN_PROMPT = `You are a career advisor finding unique, non-obvious opportunities.

Given a candidate's profile, identify 3 distinct career paths or industries they would excel in but might not search for.

CRITICAL RULE: Do NOT suggest their current job title or its direct synonyms (e.g. if they are a Project Manager, do NOT suggest "Senior Project Manager" or "Program Manager").

Focus on:
- "Hidden" roles causing their skills (e.g. PM -> "Chief of Staff" or "Implementation Manager")
- Cross-industry transfers
- Niche roles needing their specific skill mix

Return a JSON array of 3 search queries (2-4 keywords each).
Example: ["healthcare implementation lead", "technical solutions strategist", "operations architect"]

Return ONLY the JSON array.`;

const QUICK_MATCH_PROMPT = `You are a job matching expert. Analyze how well a candidate matches a job.

CRITICAL SCORING:
- Analyze the candidate's HARD SKILLS vs the job description.
- Be REALISTIC. If they lack key tech stack or required experience, score < 60.
- 0-60: Poor match, missing requirements.
- 60-75: Decent match, has transferable skills but gaps in specific tools.
- 75-90: Strong match, has most requirements.
- 90+: Perfect match.

Return ONLY a JSON object: {"response": number} where number is 0-100.`;

export const Route = createFileRoute("/api/ai/unicorn")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        try {
          const ai = await getAIFromContext(context);
          const db = await getD1FromContext(context);

          if (!ai) {
            return json({ success: false, error: "AI not available" }, { status: 503 });
          }
          if (!db) {
            return json({ success: false, error: "Database not available" }, { status: 503 });
          }

          const body = await request.json() as {
            resume?: string;
            skills?: string[];
          };

          if (!body.resume && (!body.skills || body.skills.length === 0)) {
            return json({ success: false, error: "Resume or skills required" }, { status: 400 });
          }

          // Build profile string
          let profile = "";
          if (body.resume) profile = `Resume:\n${body.resume}`;
          if (body.skills?.length) profile += `\n\nSkills: ${body.skills.join(", ")}`;

          // Ask AI for unicorn search queries
          const aiResponse = await ai.run(
            "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any,
            {
              messages: [
                { role: "system", content: UNICORN_PROMPT },
                { role: "user", content: profile },
              ],
              max_tokens: 200,
            }
          );

          // Parse AI response
          let responseText = "";
          const res = aiResponse as any;
          if (res?.choices?.[0]?.message) {
            responseText = res.choices[0].message.content || "";
          } else if (typeof aiResponse === "string") {
            responseText = aiResponse;
          } else if (res?.response) {
            responseText = res.response;
          } else if (res) {
            responseText = JSON.stringify(aiResponse);
          }

          // Handle nested response
          let parsed = JSON.parse(responseText);
          if (parsed.response) parsed = parsed.response;

          const searchQueries: string[] = Array.isArray(parsed) ? parsed : [];

          if (searchQueries.length === 0) {
            return json({ success: true, data: { queries: [], jobs: [] } });
          }

          // Search for jobs matching these queries
          const allJobs: JobWithCategory[] = [];
          const seenIds = new Set<number>();

          for (const query of searchQueries.slice(0, 3)) {
            const keywords = query.toLowerCase().split(/\s+/);
            const likePatterns = keywords.map(k => `%${k}%`);

            // Search in Title OR Description, but require ALL keywords (AND logic)
            // This allows "Healthcare Operations" to match if "Healthcare" is in desc and "Operations" in title
            // But "product manager" won't match just "manager"
            const whereConditions = likePatterns.map(() =>
              `(LOWER(j.title) LIKE ? OR LOWER(j.description) LIKE ?)`
            ).join(" AND ");

            // Double the params because each keyword is used twice
            const params = likePatterns.flatMap(p => [p, p]);

            const result = await db.prepare(`
              SELECT 
                j.id,
                j.title,
                j.company,
                j.description,
                j.full_description as fullDescription,
                j.pay_range as payRange,
                j.post_date as postedAt,
                j.source_url as sourceUrl,
                j.source_name as source,
                j.category_id as categoryId,
                c.id as catId,
                c.name as categoryName,
                c.slug as categorySlug
              FROM jobs j
              LEFT JOIN categories c ON j.category_id = c.id
              WHERE (${whereConditions})
              ORDER BY j.post_date DESC
              LIMIT 10
            `).bind(...params).all();

            for (const row of (result.results || [])) {
              if (!seenIds.has(row.id as number)) {
                seenIds.add(row.id as number);
                allJobs.push({
                  id: row.id as number,
                  title: row.title as string,
                  company: row.company as string | null,
                  description: row.description as string,
                  fullDescription: row.fullDescription as string | null,
                  payRange: row.payRange as string | null,
                  postDate: row.postedAt ? new Date((row.postedAt as number) * 1000) : null,
                  sourceUrl: row.sourceUrl as string,
                  sourceName: row.source as string,
                  categoryId: row.categoryId as number,
                  category: {
                    id: row.catId as number,
                    name: row.categoryName as string,
                    slug: row.categorySlug as string,
                    description: null,
                    createdAt: new Date(),
                  },
                } as any);
              }
            }
          }

          // Verify match scores in parallel
          const MIN_MATCH_SCORE = 80;
          const verifiedJobs: Array<JobWithCategory & { matchScore: number }> = [];

          console.log("Checking", allJobs.length, "candidate jobs for match scores");

          const checkJob = async (job: JobWithCategory) => {
            try {
              const matchResponse = await ai.run(
                "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as any,
                {
                  messages: [
                    { role: "system", content: QUICK_MATCH_PROMPT },
                    {
                      role: "user",
                      content: `Candidate:\n${profile}\n\nJob Title: ${job.title}\nJob Description: ${job.description?.substring(0, 1500) || ""}`
                    },
                  ],
                  max_tokens: 300,
                }
              );

              console.log(`Raw match response for ${job.title.substring(0, 20)}:`, JSON.stringify(matchResponse));

              let score = NaN;

              // 1. Try direct number access if it's an object
              if (typeof matchResponse === 'object' && matchResponse !== null) {
                const r = matchResponse as any;
                if (typeof r.response === 'number') score = r.response;
                else if (typeof r.response === 'string') {
                  // Try extracting number from string response "85" or "Score: 85"
                  const match = r.response.match(/\b\d{1,3}\b/);
                  if (match) score = parseInt(match[0], 10);
                }
                else if (typeof r.response === 'object' && r.response !== null) {
                  // Nested {"response": {"response": 85}}
                  if (typeof r.response.response === 'number') score = r.response.response;
                }
              }

              // 2. If valid score found, verify it's reasonable
              if (!isNaN(score) && score >= 0 && score <= 100) {
                // Good score
              } else {
                // 3. Fallback: treat generic response as string and regex search
                let text = "";
                if (typeof matchResponse === 'string') text = matchResponse;
                else text = JSON.stringify(matchResponse);

                // Find the key "response": 85 or just a number
                // Look for "response": 85
                const jsonMatch = text.match(/"response"\s*:\s*(\d+)/);
                if (jsonMatch) {
                  score = parseInt(jsonMatch[1], 10);
                } else {
                  // Just look for first distinct number 0-100
                  // This is risky if there are other numbers but with max_tokens=10 it's likely the score
                  const numMatch = text.match(/\b\d{1,3}\b/);
                  if (numMatch) score = parseInt(numMatch[0], 10);
                }
              }

              console.log(`Job: ${job.title.substring(0, 30)} Score: ${score}`);

              if (!isNaN(score) && score >= MIN_MATCH_SCORE) {
                return { ...job, matchScore: Math.min(100, score) };
              }
            } catch (e) {
              console.error("Match check failed:", e);
            }
            return null;
          };

          // Process all jobs in parallel
          const results = await Promise.all(allJobs.map(job => checkJob(job)));

          results.forEach(res => {
            if (res) verifiedJobs.push(res);
          });

          console.log("Verified jobs:", verifiedJobs.length);

          // Return verified high-match jobs
          return json({
            success: true,
            data: {
              queries: searchQueries,
              jobs: verifiedJobs.slice(0, 3),
            },
          });
        } catch (error) {
          console.error("Error in unicorn finder:", error);
          return json({
            success: false,
            error: error instanceof Error ? error.message : "Failed to find unicorns",
          }, { status: 500 });
        }
      },
    },
  },
});
