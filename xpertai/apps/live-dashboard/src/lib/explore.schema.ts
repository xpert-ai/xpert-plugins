import { z } from 'zod/v3'
export const exploreKeys = ['hotel-operations','outbound-travel','steam-market','weather-alerts','category-contribution','ecommerce-operations','global-assets','legal-defense','order-promotion','hotel-cancellation'] as const
export const exploreKeySchema = z.enum(exploreKeys)
export const exploreTaskSchema = z.object({key:exploreKeySchema,title:z.string(),description:z.string(),dataMode:z.enum(['demo','web','external']),requirements:z.array(z.string()),style:z.string().nullable(),question:z.string(),skills:z.array(z.string())}).strict()
export const exploreCatalogSchema = z.array(exploreTaskSchema)
export const exploreUseSchema = z.object({key:exploreKeySchema,requestId:z.string().uuid()}).strict()
