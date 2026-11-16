// Empaqueta la función para Neon Functions → dist/index.mjs
import { build } from 'esbuild'

await build({
  entryPoints: ['index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: 'dist/index.mjs',
  minify: true,
  legalComments: 'none',
  banner: {
    js:
      "import{createRequire as ___cr}from'module';import{fileURLToPath as ___f}from'url';" +
      "import{dirname as ___d}from'path';const require=___cr(import.meta.url);" +
      'const __filename=___f(import.meta.url);const __dirname=___d(__filename);',
  },
})
console.log('dist/index.mjs listo')
