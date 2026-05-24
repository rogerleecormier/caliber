// Cloudflare Worker entry point that injects bindings into TanStack Start
import { onRequest } from './ssr'

export default {
  async fetch(request: Request, env: any, ctx: any) {
    // Create Cloudflare Pages-compatible context
    const context = {
      request,
      env,
      ctx,
      waitUntil: ctx.waitUntil.bind(ctx),
      passThroughOnException: () => {},
      next: () => new Response('Not found', { status: 404 }),
      functionPath: '',
      params: {},
      data: {},
    }

    return onRequest(context)
  },
}
