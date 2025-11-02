/**
 * Improved Milvus VectorStore Adapter for LangChain
 * - Compatible with original API surface.
 * - Stores ALL metadata as a single JSON string field.
 * - Optionally "promotes" a few filterable metadata keys (e.g. document_id) as separate columns.
 * - Avoids dynamic schema from arbitrary metadata keys and VarChar max_length pitfalls.
 */

import * as uuid from "uuid";
import {
  MilvusClient,
  DataType,
  DataTypeMap,
  ErrorCode,
  FieldType,
  ClientConfig,
  InsertReq,
  keyValueObj,
} from "@zilliz/milvus2-sdk-node";

import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { VectorStore } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import { getEnvironmentVariable } from "@langchain/core/utils/env";

/**
 * Interface for the arguments required by the Milvus class constructor.
 */
export interface MilvusLibArgs {
  collectionName?: string;
  partitionName?: string;
  primaryField?: string;
  vectorField?: string;
  textField?: string;
  url?: string; // db address
  ssl?: boolean;
  username?: string;
  password?: string;
  textFieldMaxLength?: number;
  clientConfig?: ClientConfig;
  autoId?: boolean;
  indexCreateOptions?: IndexCreateOptions;
  partitionKey?: string; // doc: https://milvus.io/docs/use-partition-key.md
  partitionKeyMaxLength?: number;

  /**
   * NEW: The column name to store JSON-stringified metadata. Default: "metadata".
   */
  metadataFieldName?: string;

  /**
   * NEW: Promote a few metadata keys as independent columns for filtering.
   * Each item defines a column name and Milvus scalar type.
   * Only promote stable keys you will filter on frequently, e.g. "document_id".
   * Default: [{ name: "document_id", type: "VarChar", max_length: 64 }]
   */
  promotedMetadataFields?: Array<
    | { name: string; type: "VarChar"; max_length?: number }
    | { name: string; type: "Bool" }
    | { name: string; type: "Float" } // float32
    | { name: string; type: "Int64" }
  >;

  /**
   * NEW: Graceful truncate behavior for oversize text/metadata.
   * If false, insertion may fail when exceeding max_length.
   * Default: true
   */
  enableSafeTruncate?: boolean;

  /**
   * NEW: Max length upper bound used when not specified.
   * Default: 65535 (Milvus VarChar maximum)
   */
  defaultMaxVarCharLength?: number;
}

export interface IndexCreateOptions {
  index_type: IndexType;
  metric_type: MetricType;
  params?: keyValueObj;
  search_params?: keyValueObj; // runtime search params
}

export type MetricType = "L2" | "IP" | "COSINE";

/**
 * Type representing the type of index used in the Milvus database.
 */
type IndexType =
  | "FLAT"
  | "IVF_FLAT"
  | "IVF_SQ8"
  | "IVF_PQ"
  | "HNSW"
  | "RHNSW_FLAT"
  | "RHNSW_SQ"
  | "RHNSW_PQ"
  | "IVF_HNSW"
  | "ANNOY";

/**
 * Interface for vector search parameters.
 */
interface IndexSearchParam {
  params: { nprobe?: number; ef?: number; search_k?: number };
}

interface InsertRow {
  [x: string]: string | number[] | number | boolean;
}

/** ------------ CONSTANTS ------------ */

const MILVUS_PRIMARY_FIELD_NAME = "langchain_primaryid";
const MILVUS_VECTOR_FIELD_NAME = "langchain_vector";
const MILVUS_TEXT_FIELD_NAME = "langchain_text";
const MILVUS_METADATA_FIELD_NAME = "metadata";
const MILVUS_COLLECTION_NAME_PREFIX = "langchain_col";
const MILVUS_PARTITION_KEY_MAX_LENGTH = 512;
const MILVUS_VARCHAR_MAX = 65535; // practical upper bound

/**
 * Default parameters for index searching.
 */
const DEFAULT_INDEX_SEARCH_PARAMS: Record<IndexType, IndexSearchParam> = {
  FLAT: { params: {} },
  IVF_FLAT: { params: { nprobe: 10 } },
  IVF_SQ8: { params: { nprobe: 10 } },
  IVF_PQ: { params: { nprobe: 10 } },
  HNSW: { params: { ef: 10 } },
  RHNSW_FLAT: { params: { ef: 10 } },
  RHNSW_SQ: { params: { ef: 10 } },
  RHNSW_PQ: { params: { ef: 10 } },
  IVF_HNSW: { params: { nprobe: 10, ef: 10 } },
  ANNOY: { params: { search_k: 10 } },
};

/**
 * Class for interacting with a Milvus database. Extends the VectorStore
 * class.
 */
export class Milvus extends VectorStore {
  override get lc_secrets(): { [key: string]: string } {
    return {
      ssl: "MILVUS_SSL",
      username: "MILVUS_USERNAME",
      password: "MILVUS_PASSWORD",
    };
  }

  _vectorstoreType(): string {
    return "milvus";
  }

  declare FilterType: string;

  collectionName: string;
  partitionName?: string;
  numDimensions?: number;
  autoId?: boolean;

  primaryField: string;
  vectorField: string;
  textField: string;
  textFieldMaxLength: number;

  metadataFieldName: string;

  partitionKey?: string;
  partitionKeyMaxLength?: number;

  /** schema user columns (excluding autoID pk); includes: text, vector, metadata, promoted columns */
  fields: string[] = [];

  /** promoted metadata column defs */
  promotedColumns: Array<
    | { name: string; type: "VarChar"; max_length: number }
    | { name: string; type: "Bool" }
    | { name: string; type: "Float" }
    | { name: string; type: "Int64" }
  > = [];

  /** insertion-time options */
  enableSafeTruncate: boolean;
  defaultMaxVarCharLength: number;

  client: MilvusClient;

  indexCreateParams: IndexCreateOptions;
  indexSearchParams: keyValueObj;

  constructor(embeddings: EmbeddingsInterface, args: MilvusLibArgs) {
    super(embeddings, args);
    this.collectionName = args.collectionName ?? genCollectionName();
    this.partitionName = args.partitionName;
    this.textField = args.textField ?? MILVUS_TEXT_FIELD_NAME;

    this.autoId = args.autoId ?? true;
    this.primaryField = args.primaryField ?? MILVUS_PRIMARY_FIELD_NAME;
    this.vectorField = args.vectorField ?? MILVUS_VECTOR_FIELD_NAME;

    this.textFieldMaxLength =
      args.textFieldMaxLength ?? MILVUS_VARCHAR_MAX; // generous default

    this.metadataFieldName =
      args.metadataFieldName ?? MILVUS_METADATA_FIELD_NAME;

    this.partitionKey = args.partitionKey;
    this.partitionKeyMaxLength =
      args.partitionKeyMaxLength ?? MILVUS_PARTITION_KEY_MAX_LENGTH;

    // promoted columns: only a few stable keys for filtering
    const defaultsPromoted =
      args.promotedMetadataFields ??
      [{ name: "document_id", type: "VarChar", max_length: 64 }];

    // normalize promoted columns (apply default length for VarChar)
    this.promotedColumns = defaultsPromoted.map((col) => {
      if (col.type === "VarChar") {
        return {
          ...col,
          max_length: col.max_length ?? 512,
        };
      }
      return col as any;
    });

    this.enableSafeTruncate = args.enableSafeTruncate ?? true;
    this.defaultMaxVarCharLength =
      args.defaultMaxVarCharLength ?? MILVUS_VARCHAR_MAX;

    const url = args.url ?? getEnvironmentVariable("MILVUS_URL");
    const {
      address = "",
      username = "",
      password = "",
      ssl,
    } = args.clientConfig || {};

    // Index creation parameters (same defaults as original)
    const { indexCreateOptions } = args;
    if (indexCreateOptions) {
      const {
        metric_type,
        index_type,
        params,
        search_params = {},
      } = indexCreateOptions;
      this.indexCreateParams = {
        metric_type,
        index_type,
        params,
      };
      this.indexSearchParams = {
        ...DEFAULT_INDEX_SEARCH_PARAMS[index_type].params,
        ...search_params,
      };
    } else {
      this.indexCreateParams = {
        index_type: "HNSW",
        metric_type: "L2",
        params: { M: 8, efConstruction: 64 },
      };
      this.indexSearchParams = {
        ...DEFAULT_INDEX_SEARCH_PARAMS.HNSW.params,
      };
    }

    // combine args clientConfig and env variables
    const clientConfig: ClientConfig = {
      ...(args.clientConfig || {}),
      address: url || address,
      username: args.username || username,
      password: args.password || password,
      ssl: args.ssl || ssl,
    };

    if (!clientConfig.address) {
      throw new Error("Milvus URL address is not provided.");
    }
    this.client = new MilvusClient(clientConfig);
  }

  /**
   * Adds documents to the Milvus database.
   * @param documents Array of Document instances to be added to the database.
   * @param options Optional parameter that can include specific IDs for the documents.
   * @returns Promise resolving to void.
   */
  async addDocuments(
    documents: Document[],
    options?: { ids?: string[] }
  ): Promise<void> {
    const texts = documents.map(({ pageContent }) => pageContent);
    const embs = await this.embeddings.embedDocuments(texts);
    await this.addVectors(embs, documents, options);
  }

  /**
   * Adds vectors to the Milvus database.
   * @param vectors Array of vectors to be added to the database.
   * @param documents Array of Document instances associated with the vectors.
   * @param options Optional parameter that can include specific IDs for the documents.
   * @returns Promise resolving to void.
   */
  async addVectors(
    vectors: number[][],
    documents: Document[],
    options?: { ids?: string[] }
  ): Promise<void> {
    if (vectors.length === 0) return;

    await this.ensureCollection(vectors, documents);
    if (this.partitionName !== undefined) {
      await this.ensurePartition();
    }

    const documentIds = options?.ids ?? [];
    const insertDatas: InsertRow[] = [];

    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i];
      const doc = documents[i];

      // Prepare payload
      const text = safeVarChar(
        doc.pageContent,
        this.textFieldMaxLength,
        this.enableSafeTruncate,
        `textField(${this.textField})`
      );
      const metadataStr = safeVarChar(
        JSON.stringify(doc.metadata ?? {}),
        this.defaultMaxVarCharLength,
        this.enableSafeTruncate,
        `metadata(${this.metadataFieldName})`
      );

      const row: InsertRow = {
        [this.textField]: text,
        [this.vectorField]: vec,
        [this.metadataFieldName]: metadataStr,
      };

      // primary key if autoId=false
      if (!this.autoId) {
        const explicitId =
          documentIds[i] ?? (doc.metadata?.[this.primaryField] as string);
        if (!explicitId) {
          throw new Error(
            `autoId=false, but no primary id provided in options.ids[${i}] or doc.metadata["${this.primaryField}"].`
          );
        }
        row[this.primaryField] = explicitId;
      }

      // populate promoted/filterable columns from metadata (if present)
      for (const col of this.promotedColumns) {
        const v = (doc.metadata as any)?.[col.name];
        if (v === undefined || v === null) {
          // optional: set default empty or skip
          if (col.type === "VarChar") {
            row[col.name] = "";
          } else if (col.type === "Bool") {
            row[col.name] = false;
          } else if (col.type === "Float") {
            row[col.name] = 0.0;
          } else if (col.type === "Int64") {
            row[col.name] = 0;
          }
          continue;
        }
        // cast & truncate for VarChar
        if (col.type === "VarChar") {
          row[col.name] = safeVarChar(
            String(v),
            col.max_length,
            this.enableSafeTruncate,
            `promoted.${col.name}`
          );
        } else if (col.type === "Bool") {
          row[col.name] = Boolean(v);
        } else if (col.type === "Float") {
          const num = Number(v);
          row[col.name] = Number.isFinite(num) ? num : 0.0;
        } else if (col.type === "Int64") {
          const num = Number(v);
          row[col.name] = Number.isFinite(num) ? Math.trunc(num) : 0;
        }
      }

      insertDatas.push(row);
    }

    const params: InsertReq = {
      collection_name: this.collectionName,
      fields_data: insertDatas,
    };
    if (this.partitionName !== undefined) {
      params.partition_name = this.partitionName;
    }

    console.log(params)

    const resp = this.autoId
      ? await this.client.insert(params)
      : await this.client.upsert(params);

    if (resp.status.error_code !== ErrorCode.SUCCESS) {
      throw new Error(
        `Error ${this.autoId ? "inserting" : "upserting"} data: ${JSON.stringify(
          resp
        )}`
      );
    }
    await this.client.flushSync({ collection_names: [this.collectionName] });
  }

  /**
   * Searches for vectors in the Milvus database that are similar to a given
   * vector.
   * @param query Vector to compare with the vectors in the database.
   * @param k Number of similar vectors to return.
   * @param filter Optional filter to apply to the search.
   * @returns Promise resolving to an array of tuples, each containing a Document instance and a similarity score.
   */
  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: string
  ): Promise<[Document, number][]> {
    const hasColResp = await this.client.hasCollection({
      collection_name: this.collectionName,
    });
    if (hasColResp.status.error_code !== ErrorCode.SUCCESS) {
      throw new Error(`Error checking collection: ${hasColResp}`);
    }
    if (hasColResp.value === false) {
      throw new Error(
        `Collection not found: ${this.collectionName}, please create collection before search.`
      );
    }

    const filterStr = filter ?? "";
    await this.grabCollectionFields();

    const loadResp = await this.client.loadCollectionSync({
      collection_name: this.collectionName,
    });
    if (loadResp.error_code !== ErrorCode.SUCCESS) {
      throw new Error(`Error loading collection: ${loadResp}`);
    }

    // return all scalar fields except the vector
    const outputFields = this.fields.filter(
      (f) => f !== this.vectorField
    );

    const searchResp = await this.client.search({
      collection_name: this.collectionName,
      search_params: {
        anns_field: this.vectorField,
        topk: k,
        metric_type: this.indexCreateParams.metric_type,
        params: JSON.stringify(this.indexSearchParams),
      },
      output_fields: outputFields,
      vector_type: DataType.FloatVector,
      vectors: [query],
      filter: filterStr,
    });

    if (searchResp.status.error_code !== ErrorCode.SUCCESS) {
      throw new Error(`Error searching data: ${JSON.stringify(searchResp)}`);
    }

    const results: [Document, number][] = [];
    searchResp.results.forEach((r: any) => {
      const docFields: { pageContent: string; metadata: Record<string, any> } =
        { pageContent: "", metadata: {} };

      for (const key of Object.keys(r)) {
        if (key === this.textField) {
          docFields.pageContent = r[key];
        } else if (key === this.metadataFieldName) {
          const { isJson, obj } = checkJsonString(r[key]);
          docFields.metadata = isJson ? obj : {};
        } else if (
          this.fields.includes(key) ||
          key === this.primaryField
        ) {
          // promoted columns, primary, etc. merge back into metadata
          docFields.metadata[key] = r[key];
        }
      }

      results.push([new Document(docFields), r.score]);
    });

    return results;
  }

  override async delete(params: { filter?: string; ids?: string[] }): Promise<void> {
    const hasColResp = await this.client.hasCollection({
      collection_name: this.collectionName,
    });
    if (hasColResp.status.error_code !== ErrorCode.SUCCESS) {
      throw new Error(`Error checking collection: ${hasColResp}`);
    }
    if (hasColResp.value === false) {
      throw new Error(
        `Collection not found: ${this.collectionName}, please create collection before delete.`
      );
    }

    const { filter, ids } = params;

    if (filter && !ids) {
      const deleteResp = await this.client.deleteEntities({
        collection_name: this.collectionName,
        expr: filter,
      });
      if (deleteResp.status.error_code !== ErrorCode.SUCCESS) {
        throw new Error(`Error deleting data: ${JSON.stringify(deleteResp)}`);
      }
    } else if (!filter && ids && ids.length > 0) {
      const deleteResp = await this.client.delete({
        collection_name: this.collectionName,
        ids,
      });
      if (deleteResp.status.error_code !== ErrorCode.SUCCESS) {
        throw new Error(
          `Error deleting data with ids: ${JSON.stringify(deleteResp)}`
        );
      }
    }
  }

  /**
   * Ensures that a collection exists in the Milvus database.
   * @param vectors Optional array of vectors to be used if a new collection needs to be created.
   * @param documents Optional array of Document instances to be used if a new collection needs to be created.
   * @returns Promise resolving to void.
   */
  async ensureCollection(vectors?: number[][], documents?: Document[]) {
    const hasColResp = await this.client.hasCollection({
      collection_name: this.collectionName,
    });
    if (hasColResp.status.error_code !== ErrorCode.SUCCESS) {
      throw new Error(
        `Error checking collection: ${JSON.stringify(hasColResp, null, 2)}`
      );
    }

    if (!hasColResp.value) {
      if (!vectors || !documents) {
        throw new Error(
          `Collection not found: ${this.collectionName}, please provide vectors and documents to create collection.`
        );
      }
      await this.createCollection(vectors, documents);
    } else {
      await this.grabCollectionFields();
    }
  }

  /**
   * Ensures that a partition exists in the Milvus collection.
   * @returns Promise resolving to void.
   */
  async ensurePartition() {
    if (!this.partitionName) return;

    const hasPartResp = await this.client.hasPartition({
      collection_name: this.collectionName,
      partition_name: this.partitionName,
    });
    if (hasPartResp.status.error_code !== ErrorCode.SUCCESS) {
      throw new Error(
        `Error checking partition: ${JSON.stringify(hasPartResp, null, 2)}`
      );
    }

    if (!hasPartResp.value) {
      await this.client.createPartition({
        collection_name: this.collectionName,
        partition_name: this.partitionName,
      });
    }
  }

  /**
   * Creates a collection in the Milvus database.
   * @param vectors Array of vectors to be added to the new collection.
   * @param documents Array of Document instances to be added to the new collection.
   * @returns Promise resolving to void.
   */
  async createCollection(
    vectors: number[][],
    documents: Document[]
  ): Promise<void> {
    const vectorDim = getVectorFieldDim(vectors);

    const fieldList: FieldType[] = [];

    // Primary key
    if (this.autoId) {
      fieldList.push({
        name: this.primaryField,
        description: "Primary key",
        data_type: DataType.Int64,
        is_primary_key: true,
        autoID: true,
      });
    } else {
      fieldList.push({
        name: this.primaryField,
        description: "Primary key",
        data_type: DataType.VarChar,
        is_primary_key: true,
        autoID: false,
        max_length: 64, // uuid-like
      });
    }

    // Text
    fieldList.push({
      name: this.textField,
      description: "Text field",
      data_type: DataType.VarChar,
      type_params: {
        max_length: String(this.textFieldMaxLength || MILVUS_VARCHAR_MAX),
      },
    });

    // Vector
    fieldList.push({
      name: this.vectorField,
      description: "Vector field",
      data_type: DataType.FloatVector,
      type_params: {
        dim: vectorDim.toString(),
      },
    });

    // JSON metadata as VarChar
    fieldList.push({
      name: this.metadataFieldName,
      description: "All metadata as JSON string",
      data_type: DataType.VarChar,
      type_params: {
        max_length: String(this.defaultMaxVarCharLength),
      },
    });

    // Promoted metadata columns
    for (const col of this.promotedColumns) {
      if (col.name === this.primaryField || col.name === this.partitionKey) {
        continue; // skip duplicates
      }
      if (col.type === "VarChar") {
        fieldList.push({
          name: col.name,
          description: `Promoted VarChar metadata field`,
          data_type: DataType.VarChar,
          type_params: { max_length: String(col.max_length) },
        });
      } else if (col.type === "Bool") {
        fieldList.push({
          name: col.name,
          description: `Promoted Bool metadata field`,
          data_type: DataType.Bool,
        });
      } else if (col.type === "Float") {
        fieldList.push({
          name: col.name,
          description: `Promoted Float metadata field`,
          data_type: DataType.Float,
        });
      } else if (col.type === "Int64") {
        fieldList.push({
          name: col.name,
          description: `Promoted Int64 metadata field`,
          data_type: DataType.Int64,
        });
      }
    }

    // Partition key (optional)
    if (this.partitionKey) {
      fieldList.push({
        name: this.partitionKey,
        description: "Partition key",
        data_type: DataType.VarChar,
        max_length: this.partitionKeyMaxLength,
        is_partition_key: true,
      });
    }

    // Track non-auto fields
    for (const f of fieldList) {
      if (!f.autoID) this.fields.push(f.name);
    }

    const createRes = await this.client.createCollection({
      collection_name: this.collectionName,
      fields: fieldList,
    });
    if (createRes.error_code !== ErrorCode.SUCCESS) {
      throw new Error(`Failed to create collection: ${JSON.stringify(createRes)}`);
    }

    const extraParams = {
      ...this.indexCreateParams,
      params: JSON.stringify(this.indexCreateParams.params),
    };
    await this.client.createIndex({
      collection_name: this.collectionName,
      field_name: this.vectorField,
      extra_params: extraParams,
    });
  }

  /**
   * Retrieves the fields of a collection in the Milvus database.
   * @returns Promise resolving to void.
   */
  async grabCollectionFields(): Promise<void> {
    if (!this.collectionName) {
      throw new Error("Need collection name to grab collection fields");
    }
    if (
      this.primaryField &&
      this.vectorField &&
      this.textField &&
      this.fields.length > 0
    ) {
      return;
    }

    const desc = await this.client.describeCollection({
      collection_name: this.collectionName,
    });

    desc.schema.fields.forEach((field) => {
      // keep track of all scalar fields (except autoID) for output_fields
      if (!field.autoID) {
        if (!this.fields.includes(field.name)) {
          this.fields.push(field.name);
        }
      }
      if (field.is_primary_key) {
        this.primaryField = field.name;
      }
      const dtype = DataTypeMap[field.data_type];
      if (dtype === DataType.FloatVector || dtype === DataType.BinaryVector) {
        this.vectorField = field.name;
      }
      if (field.name === this.textField) {
        this.textField = field.name;
      }
      if (field.name === this.metadataFieldName) {
        this.metadataFieldName = field.name;
      }
    });
  }

  /**
   * Creates a Milvus instance from a set of texts and their associated
   * metadata.
   * @param texts Array of texts to be added to the database.
   * @param metadatas Array of metadata objects associated with the texts.
   * @param embeddings Embeddings instance used to generate vector embeddings for the texts.
   * @param dbConfig Optional configuration for the Milvus database.
   * @returns Promise resolving to a new Milvus instance.
   */
  static override async fromTexts(
    texts: string[],
    metadatas: object[] | object,
    embeddings: EmbeddingsInterface,
    dbConfig?: MilvusLibArgs
  ): Promise<Milvus> {
    const docs: Document[] = [];
    for (let i = 0; i < texts.length; i++) {
      const md = Array.isArray(metadatas) ? metadatas[i] : metadatas;
      docs.push(new Document({ pageContent: texts[i], metadata: md }));
    }
    return Milvus.fromDocuments(docs, embeddings, dbConfig);
  }

  /**
   * Creates a Milvus instance from a set of Document instances.
   * @param docs Array of Document instances to be added to the database.
   * @param embeddings Embeddings instance used to generate vector embeddings for the documents.
   * @param dbConfig Optional configuration for the Milvus database.
   * @returns Promise resolving to a new Milvus instance.
   */
  static override async fromDocuments(
    docs: Document[],
    embeddings: EmbeddingsInterface,
    dbConfig?: MilvusLibArgs
  ): Promise<Milvus> {
    const args: MilvusLibArgs = {
      ...dbConfig,
      collectionName: dbConfig?.collectionName ?? genCollectionName(),
    };
    const instance = new this(embeddings, args);
    await instance.addDocuments(docs);
    return instance;
  }

  /**
   * Creates a Milvus instance from an existing collection in the Milvus
   * database.
   * @param embeddings Embeddings instance used to generate vector embeddings for the documents in the collection.
   * @param dbConfig Configuration for the Milvus database.
   * @returns Promise resolving to a new Milvus instance.
   */
  static async fromExistingCollection(
    embeddings: EmbeddingsInterface,
    dbConfig: MilvusLibArgs
  ): Promise<Milvus> {
    const instance = new this(embeddings, dbConfig);
    await instance.ensureCollection();
    return instance;
  }
}

/** ------------ HELPERS ------------ */

function genCollectionName(): string {
  return `${MILVUS_COLLECTION_NAME_PREFIX}_${uuid.v4().replace(/-/g, "")}`;
}

function getVectorFieldDim(vectors: number[][]) {
  if (vectors.length === 0) {
    throw new Error("No vectors found");
  }
  return vectors[0].length;
}

function checkJsonString(value: string): { isJson: boolean; obj: any } {
  try {
    const result = JSON.parse(value);
    return { isJson: true, obj: result };
  } catch {
    return { isJson: false, obj: null };
  }
}

/**
 * Ensure VarChar size does not exceed max_length; truncate with ellipsis if enabled.
 */
function safeVarChar(
  s: string,
  maxLen: number,
  enableTruncate: boolean,
  label: string
): string {
  if (typeof s !== "string") s = String(s ?? "");
  if (s.length <= maxLen) return s;
  if (!enableTruncate) {
    throw new Error(
      `Value for ${label} exceeds max_length=${maxLen} (len=${s.length}).`
    );
  }
  // Truncate with a visible marker; you can customize to byte-length if needed.
  const truncated = s.slice(0, Math.max(0, maxLen - 1)) + "…";
  console.warn(
    `[Milvus Adapter] Truncated ${label}: originalLen=${s.length} -> ${maxLen}`
  );
  return truncated;
}
