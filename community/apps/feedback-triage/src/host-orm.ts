import { createRequire } from 'node:module'

// Xpert links the SDK into each isolated plugin installation. Anchor ORM resolution
// on that link so forFeature() injects the host's actual DataSource class token.
const pluginRequire = createRequire(import.meta.url)
const hostRequire = createRequire(pluginRequire.resolve('@xpert-ai/plugin-sdk/package.json'))
const nestOrm: typeof import('@nestjs/typeorm') = hostRequire('@nestjs/typeorm')
// pnpm may give the Nest adapter its own peer set. Use that exact ORM for entity metadata too.
const ormRequire = createRequire(hostRequire.resolve('@nestjs/typeorm'))
const orm: typeof import('typeorm') = ormRequire('typeorm')

export const { TypeOrmModule, InjectRepository } = nestOrm
export const { Between, Column, Entity, Index, PrimaryColumn, LessThan } = orm
