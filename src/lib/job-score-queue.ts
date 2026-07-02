/**
 * Job Score Queue
 *
 * Defines the message type and enqueue helper for the job-score-queue.
 * The crawler queue-handler enqueues one message per newly-inserted
 * canonicalJobs row; the consumer resolves users with a master resume
 * at consumption time and scores the job against each one.
 */

export interface JobScoreMessage {
  canonicalJobId: string
}

/**
 * Enqueue a job for scoring. Logs errors but does not throw, so that
 * queue unavailability doesn't fail the crawl that triggered it.
 */
export async function enqueueJobScore(
  queue: Queue<JobScoreMessage>,
  message: JobScoreMessage,
): Promise<void> {
  try {
    await queue.send(message)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error(
      `[job-score-queue] Failed to enqueue scoring for ${message.canonicalJobId}:`,
      errorMsg,
    )
  }
}
