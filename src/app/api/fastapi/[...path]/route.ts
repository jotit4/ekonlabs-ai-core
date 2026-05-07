function notImplemented() {
  return Response.json(
    {
      error: {
        message: "FastAPI proxy placeholder. Implementar contrato en stories futuras.",
        code: "FASTAPI_PROXY_NOT_IMPLEMENTED",
        status: 501,
      },
    },
    { status: 501 },
  )
}

export const GET = notImplemented
export const POST = notImplemented
export const PUT = notImplemented
export const PATCH = notImplemented
export const DELETE = notImplemented
