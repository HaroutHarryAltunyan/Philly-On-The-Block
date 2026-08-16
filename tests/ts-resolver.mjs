// Node's type stripping requires explicit file extensions on relative
// imports, but the app code (bundled by Vite) uses extensionless imports.
// This hook retries failed relative resolutions with a .ts suffix so tests
// can import the real lib/ modules without a bundler.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
