
import { getStore } from '@netlify/blobs'

// Single shared key for the whole dashboard
const STORE_NAME = 'easytrack'
const KEY = 'dashboard_state_v1'

export default async (request, context) => {
  try {
    const store = getStore(STORE_NAME)

    if (request.method === 'GET') {
      const state = (await store.getJSON(KEY)) ?? null
      return Response.json({ state })
    }

    if (request.method === 'POST') {
      const body = await request.json()
      const state = body?.state ?? null
      await store.setJSON(KEY, state)
      return Response.json({ ok: true })
    }

    return new Response('Method Not Allowed', { status: 405 })
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
