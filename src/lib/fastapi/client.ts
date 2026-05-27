export class FastAPIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message)
    this.name = "FastAPIError"
  }
}

export class FastAPIClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const signals: AbortSignal[] = [AbortSignal.timeout(5000)]
    if (init?.signal) signals.push(init.signal)

    const hasBody = init?.body !== undefined && init?.body !== null
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        ...init?.headers,
        ...(hasBody ? { "content-type": "application/json" } : {}),
        "x-api-key": this.apiKey,
      },
      signal: AbortSignal.any(signals),
    })

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      throw new FastAPIError("FastAPI request failed", response.status, body)
    }

    return body as T
  }
}
