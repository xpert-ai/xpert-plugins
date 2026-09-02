import { readFile } from 'node:fs/promises'

const blueprint = JSON.parse(
  await readFile(new URL('../blueprints/factory-operations-v1.json', import.meta.url))
)
const nodes = new Map(blueprint.nodes.map((node) => [node.key, node]))
const start = blueprint.pipeline.startNodeKey
if (!nodes.has(start)) throw new Error('Blueprint start node is missing.')
if (blueprint.pipeline.artifactNamespace !== 'factory_ops') {
  throw new Error('Blueprint namespace must be factory_ops.')
}
for (const edge of blueprint.edges) {
  if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
    throw new Error(`Blueprint edge has a dangling endpoint: ${edge.from} -> ${edge.to}`)
  }
}
const visited = new Set()
const visiting = new Set()
function visit(key) {
  if (visiting.has(key)) throw new Error(`Blueprint contains a cycle at ${key}.`)
  if (visited.has(key)) return
  visiting.add(key)
  for (const edge of blueprint.edges.filter((candidate) => candidate.from === key)) {
    visit(edge.to)
  }
  visiting.delete(key)
  visited.add(key)
}
visit(start)
if (visited.size !== nodes.size) throw new Error('Blueprint contains unreachable nodes.')
console.log(
  `VALID blueprint: ${blueprint.nodes.length} nodes, ${blueprint.edges.length} edges`
)
