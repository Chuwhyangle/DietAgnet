const fs = require('fs')
const path = require('path')
const ts = require('typescript')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const dataDir = path.join(root, 'src/renderer/src/data')
const cache = new Map()

function resolveModulePath(specifier, parentFile = path.join(dataDir, '__entry__.ts')) {
  if (!specifier.startsWith('.')) {
    throw new Error(`Unsupported module: ${specifier}`)
  }

  const resolvedBase = path.resolve(path.dirname(parentFile), specifier)
  const candidates = [
    resolvedBase,
    `${resolvedBase}.ts`,
    path.join(resolvedBase, 'index.ts'),
  ]
  const file = candidates.find((candidate) => fs.existsSync(candidate))

  if (!file || !file.startsWith(dataDir)) {
    throw new Error(`Unknown module: ${specifier}`)
  }

  return file
}

function loadModule(specifier, parentFile) {
  const file = resolveModulePath(specifier, parentFile)

  if (cache.has(file)) {
    return cache.get(file).exports
  }

  const source = fs.readFileSync(file, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} }

  cache.set(specifier, module)
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require: (childSpecifier) => loadModule(childSpecifier, file),
    console,
  }, {
    filename: file,
  })

  return module.exports
}

const { recipes } = loadModule('./recipes')
const { validateRecipes } = loadModule('./recipeValidation')
const report = validateRecipes(recipes)

console.log(JSON.stringify(report, null, 2))

if (report.status !== 'passed') {
  process.exitCode = 1
}
