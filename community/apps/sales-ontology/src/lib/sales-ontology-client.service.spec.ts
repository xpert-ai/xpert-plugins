import { RequestContext } from "@xpert-ai/plugin-sdk";
import { SalesOntologyClientService } from "./sales-ontology-client.service.js";

describe("SalesOntologyClientService", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("prefers scoped actor tokens for outbound Data Xpert API requests", async () => {
    const requestToken = jest
      .spyOn(RequestContext, "currentToken")
      .mockReturnValue("request-token");
    const actorTokenProvider = jest.fn().mockResolvedValue("actor-token");
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const service = new SalesOntologyClientService({
      resolve: jest.fn().mockReturnValue({
        dataXpert: {
          apiBaseUrl: "https://data-xpert.example.test",
          defaultResourceId: "sales-ontology",
          timeoutMs: 5_000,
        },
      }),
    } as any);

    await service.queryEntities(
      "sales-ontology",
      {
        entityTypeCode: "sales_ontology_object",
        limit: 1,
      },
      {
        tenantId: "tenant-1",
        userId: "user-1",
        actorTokenProvider,
      }
    );

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer actor-token");
    expect(actorTokenProvider).toHaveBeenCalledTimes(1);
    expect(requestToken).not.toHaveBeenCalled();
  });

  it("rejects outbound Data Xpert requests without actor token capability", async () => {
    const fetchMock = jest.fn<typeof fetch>();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const service = new SalesOntologyClientService({
      resolve: jest.fn().mockReturnValue({
        dataXpert: {
          apiBaseUrl: "https://data-xpert.example.test",
          defaultResourceId: "sales-ontology",
          timeoutMs: 5_000,
        },
      }),
    } as any);

    await expect(
      service.queryEntities(
        "sales-ontology",
        {
          entityTypeCode: "sales_ontology_object",
          limit: 1,
        },
        {
          tenantId: "tenant-1",
          userId: "user-1",
        }
      )
    ).rejects.toThrow(
      "data-xpert business ontology requests require ActorTokenRuntimeCapability."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
