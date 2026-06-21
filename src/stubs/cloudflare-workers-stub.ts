/**
 * Stub for the `cloudflare:workers` module in local development.
 * In production this is provided by the Cloudflare Workers runtime.
 */
export const env: Record<string, unknown> = {};

export class DurableObject {
  protected state: any;
  protected env: any;

  constructor(state: any, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    return new Response('Not implemented in dev', { status: 501 });
  }
}
