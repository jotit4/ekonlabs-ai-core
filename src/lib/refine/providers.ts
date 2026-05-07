import type { DataProvider } from "@refinedev/core"

export const fastapiDataProvider = {
  getList: async () => ({ data: [], total: 0 }),
  getMany: async () => ({ data: [] }),
  getOne: async () => ({ data: {} }),
  create: async ({ variables }: { variables?: unknown }) => ({
    data: variables ?? {},
  }),
  createMany: async ({ variables }: { variables?: unknown[] }) => ({
    data: variables ?? [],
  }),
  update: async ({ variables }: { variables?: unknown }) => ({
    data: variables ?? {},
  }),
  updateMany: async ({ variables }: { variables?: unknown[] }) => ({
    data: variables ?? [],
  }),
  deleteOne: async ({ id }: { id: string | number }) => ({ data: { id } }),
  deleteMany: async ({ ids }: { ids: Array<string | number> }) => ({
    data: ids.map((id) => ({ id })),
  }),
  getApiUrl: () => "/api/fastapi",
} as unknown as DataProvider
